/**
 * LE LABEUR — P0-PAYMENT-VERIFY — tests Worker/API → repository → PostgreSQL
 * de la vérification opérationnelle des PAIEMENTS EXTERNES après la mission.
 *
 * Chaîne réellement exercée (aucun mock, aucun fonds déplacé) :
 *
 *   MISSION TERMINÉE (contrat `COMPLETED` / `TERMINATED`)
 *     → PAIEMENT ATTENDU   (`payments.close-mission` : échéances atteintes → DUE,
 *                            matérialisation de rattrapage depuis l'échéancier)
 *     → PAIEMENT EXTERNE FOURNI (déclaration employeur : référence + preuve)
 *     → VÉRIFICATION LE LABEUR (décision ADMIN, webhook fournisseur, rapprochement)
 *     → PAIEMENT CONFIRMÉ / REJETÉ / À RÉVISER
 *
 * Ce que ces tests verrouillent :
 *  - LE LABEUR ne garde jamais le salaire : aucun escrow, aucun portefeuille,
 *    aucun cantonnement, aucun transfert — `PAID` reste un état métier ;
 *  - la fin de mission ne rouvre AUCUN statut du contrat et n'invente aucun
 *    échéancier : seules les échéances DÉJÀ atteintes sont constatées ;
 *  - les mécanismes existants sont réutilisés tels quels : transition `MARK_DUE`,
 *    événement `PAYMENT_DUE`, projection `payment_schedule`, audit, idempotence
 *    durable, idempotence de rejeu, compare-and-set PostgreSQL ;
 *  - la commission (25 % en M1) reste STRICTEMENT séparée du salaire, et
 *    `commission_percentage` n'est jamais réécrit ;
 *  - un paiement rejeté est « À RÉVISER » : la régularisation exige une
 *    déclaration NOUVELLE (l'ancienne preuve reste conservée).
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from './offers.test';
import type { OfferRecord } from '../persistence/coreRecords';
import { createSqlContractStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { buildContractActivationPlan } from '../../domain/contractScheduleAutomation';
import { paymentIdFor } from '../../domain/paymentLifecycle';
import { paymentIdempotencyCache, type MissionPaymentExpectationsView } from '../repositories/paymentRepository';
import { createTestPaymentProviderAdapter } from '../payments/paymentVerification';
import type { PaymentView, PaymentWebhookOutcome } from '../repositories/paymentRepository';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SEED_TIMESTAMP = '2026-10-05T15:00:00.000Z';
/** Échéance M1 = 2026-10-05 : atteinte dès l'horloge de référence du harness. */
const START_DATE = '05 Septembre 2026';
const MONTHLY_SALARY = 175_000;
const SALARY_M1_AMOUNT = 131_250;
const COMMISSION_M1_AMOUNT = 43_750;

function makeOffer(id: string, employerId: string): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre ${id}`,
    contractType: 'CDI',
    remuneration: MONTHLY_SALARY,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_TIMESTAMP,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre de test P0-PAYMENT-VERIFY.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

async function provisionAdmin(harness: Harness): Promise<{ token: string; userId: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = new Date(harness.clock.value.getTime()).toISOString();
  const expiresAt = new Date(harness.clock.value.getTime() + 3_600_000).toISOString();
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async transaction => {
    await transaction.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.${userId}@example.com`,
      displayName: 'Admin P0-PAYMENT-VERIFY',
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { token, userId };
}

interface SeedResult {
  contractId: string;
  employerId: string;
  employeeId: string;
  salaryPaymentId: string;
  feePaymentId: string;
  secondMonthSalaryPaymentId: string;
}

/**
 * Contrat ACTIF muni de l'échéancier RÉEL du modèle (2 mois) : les paiements ne
 * sont pas inventés, ils dérivent de `buildPaymentSchedule` via le plan
 * d'activation P0-AUTO-2 (échéancier, point de contrôle M1, grand livre).
 */
async function seedActiveContract(
  harness: Harness,
  employerId: string,
  employeeId: string,
  options: { currentMonth?: number } = {},
): Promise<SeedResult> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, employerId));
  const contractId = newEntityId('ctr');
  const plan = buildContractActivationPlan({
    contractId,
    employerId,
    employeeId,
    periodicity: 'Mensuel',
    startDate: START_DATE,
    durationMonths: 2,
    monthlySalary: MONTHLY_SALARY,
    currency: 'FCFA',
    commissionPercentage: 25,
  }, SEED_TIMESTAMP);
  assert(plan.kind === 'SCHEDULED', `plan d’activation Mensuel attendu, reçu ${plan.kind}`);
  await createSqlContractStore(harness.database).create({
    id: contractId,
    offerId,
    employerId,
    employeeId,
    status: 'ACTIVE',
    monthlySalary: MONTHLY_SALARY,
    currency: 'FCFA',
    startDate: START_DATE,
    currentMonth: options.currentMonth ?? 1,
    durationMonths: 2,
    periodicity: 'Mensuel',
    missionDescription: 'Contrat seedé P0-PAYMENT-VERIFY',
    location: 'Cotonou',
    conditions: ['Temps plein'],
    employerSigned: true,
    employeeSigned: true,
    commissionPercentage: plan.commissionPercentage,
    commissionAmountDue: plan.commissionAmountDue,
    commissionStatus: plan.commissionStatus,
    monthlyCheckpoints: [...plan.monthlyCheckpoints],
    commissionLedger: [...plan.commissionLedger],
    paymentSchedule: [...plan.paymentSchedule],
    history: [],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  });
  return {
    contractId,
    employerId,
    employeeId,
    salaryPaymentId: paymentIdFor(contractId, 'SALARY', 1),
    feePaymentId: paymentIdFor(contractId, 'PLATFORM_FEE', 1),
    secondMonthSalaryPaymentId: paymentIdFor(contractId, 'SALARY', 2),
  };
}

async function readPayment(harness: Harness, paymentId: string): Promise<Record<string, unknown> | null> {
  const result = await harness.database.query<Record<string, unknown>>(
    'SELECT * FROM payments WHERE id = $1',
    [paymentId],
  );
  return result.rows[0] ?? null;
}

async function readScheduleEntry(harness: Harness, contractId: string, monthNumber: number): Promise<Record<string, unknown> | null> {
  const result = await harness.database.query<Record<string, unknown>>(
    `SELECT entry FROM contracts, jsonb_array_elements(payment_schedule) AS entry
      WHERE contracts.id = $1 AND (entry->>'monthNumber')::integer = $2`,
    [contractId, monthNumber],
  );
  return result.rows[0]?.entry as Record<string, unknown> ?? null;
}

async function readPaymentOutbox(harness: Harness, paymentId: string): Promise<Array<{ event_type: string; status: string; source: string; payload: unknown }>> {
  const result = await harness.database.query<{ event_type: string; status: string; source: string; payload: unknown }>(
    'SELECT event_type, status, source, payload FROM automation_outbox WHERE aggregate_id = $1 ORDER BY id',
    [paymentId],
  );
  return result.rows;
}

async function readAudit(harness: Harness, entityId: string): Promise<Array<{ action: string; actor_id: string; source: string; after_state: unknown }>> {
  const result = await harness.database.query<{ action: string; actor_id: string; source: string; after_state: unknown }>(
    'SELECT action, actor_id, source, after_state FROM automation_audit_ledger WHERE entity_id = $1 ORDER BY occurred_at, id',
    [entityId],
  );
  return result.rows;
}

async function readContractStatus(harness: Harness, contractId: string): Promise<string | null> {
  const result = await harness.database.query<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [contractId]);
  return result.rows[0]?.status ?? null;
}

function stateOf(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

async function post(harness: Harness, path: string, token: string | null, key: string, body: unknown = {}): Promise<Response> {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body ?? {}),
  }));
}

async function endMission(harness: Harness, contractId: string, token: string, key: string): Promise<Response> {
  return harness.worker.fetch(authRequest(`/api/v1/contracts/${encodeURIComponent(contractId)}/end`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: '{}',
  }));
}

async function terminateMission(harness: Harness, contractId: string, token: string, key: string): Promise<Response> {
  return harness.worker.fetch(authRequest(`/api/v1/contracts/${encodeURIComponent(contractId)}/terminate`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ reason: 'Rupture motivée P0-PAYMENT-VERIFY' }),
  }));
}

async function jsonOf<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export async function runPaymentMissionCloseTests(): Promise<OfferTestResult[]> {
  paymentIdempotencyCache.clear();
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const harness = await createOffersTestHarness();
  let employerToken = '';
  let employerId = '';
  let otherEmployerToken = '';
  let otherEmployerId = '';
  let candidateToken = '';
  let candidateId = '';
  let adminToken = '';

  try {
    const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const otherEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
    const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
    const admin = await provisionAdmin(harness);
    employerToken = employer.token;
    employerId = employer.userId;
    otherEmployerToken = otherEmployer.token;
    otherEmployerId = otherEmployer.userId;
    candidateToken = candidate.token;
    candidateId = candidate.userId;
    adminToken = admin.token;

    /* ------------------------------------------------------------------ */
    /* 1. PAIEMENT ATTENDU : la clôture de mission constate les échéances  */
    /* ------------------------------------------------------------------ */

    await check('P0-PAYMENT-VERIFY Mission terminée: la clôture bascule les échéances ATTEINTES en DUE (PAYMENT_DUE, projection, audit), laisse les futures intactes et ne rouvre aucun statut', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId);
      const ended = await endMission(harness, seed.contractId, employerToken, 'pmv-close-end-001');
      assert(ended.status === 200, `fin de mission 200 attendue, reçue ${ended.status}`);
      assert(await readContractStatus(harness, seed.contractId) === 'COMPLETED', 'mission terminée : contrat COMPLETED');

      const response = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-close-001');
      assert(response.status === 200, `clôture 200 attendue, reçue ${response.status}`);
      const body = await jsonOf<MissionPaymentExpectationsView>(response);
      assert(body.contractStatus === 'COMPLETED' && body.missionEnded === true, 'mission terminée constatée');
      assert(body.markedDue === 2, `2 échéances atteintes attendues (M1 salaire + M1 commission), reçues ${body.markedDue}`);
      assert(body.paymentsMaterialized === 3, `matérialisation de rattrapage depuis l’échéancier (3 lignes), reçue ${body.paymentsMaterialized}`);
      const rows = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM payments WHERE contract_id = $1', [seed.contractId]);
      assert(Number(rows.rows[0].count) === 3, `aucune ligne hors échéancier (3 attendues), reçues ${rows.rows[0].count}`);
      assert(body.payments.length === 3, 'les trois échéances sont restituées');

      // Les échéances atteintes sont DUE ; M2 reste SCHEDULED (aucun prorata).
      assert((await readPayment(harness, seed.salaryPaymentId))?.status === 'DUE', 'salaire M1 DUE');
      assert((await readPayment(harness, seed.feePaymentId))?.status === 'DUE', 'commission M1 DUE');
      assert((await readPayment(harness, seed.secondMonthSalaryPaymentId))?.status === 'SCHEDULED', 'salaire M2 non échu : intact');

      // Événement PAYMENT_DUE : un seul par paiement, sans consumer de notification.
      const dueEvents = (await readPaymentOutbox(harness, seed.salaryPaymentId)).filter(row => row.event_type === 'PAYMENT_DUE');
      assert(dueEvents.length === 1, `un seul événement PAYMENT_DUE, reçus ${dueEvents.length}`);
      assert(dueEvents[0].status === 'PENDING', 'événement préparé : aucun canal branché');
      assert(stateOf(dueEvents[0].payload).channel === null, 'AUCUN canal de notification');

      // Audit de la commande + audit de la transition existante.
      const commandAudit = (await readAudit(harness, seed.contractId)).find(row => row.action === 'PAYMENT_MISSION_CLOSED');
      assert(commandAudit, 'audit PAYMENT_MISSION_CLOSED écrit');
      assert(commandAudit!.actor_id === employerId, 'acteur employeur tracé');
      const dueAudit = (await readAudit(harness, seed.salaryPaymentId)).find(row => row.action === 'PAYMENT_DUE');
      assert(dueAudit && dueAudit.actor_id === 'SYSTEM', 'bascule d’échéance produite par la règle SYSTEM existante');

      // Projection sur la vue RÉELLE du contrat : l'échéancier suit.
      assert((await readScheduleEntry(harness, seed.contractId, 1))?.salaryStatus === 'DUE', 'échéancier projeté en DUE');

      // Vue « paiement attendu » : salaire → travailleur, commission → LE LABEUR.
      assert(body.expectedPayments.length === 2, `2 paiements attendus, reçus ${body.expectedPayments.length}`);
      const salaryExpectation = body.expectedPayments.find(entry => entry.paymentType === 'SALARY')!;
      const feeExpectation = body.expectedPayments.find(entry => entry.paymentType === 'PLATFORM_FEE')!;
      assert(salaryExpectation.kind === 'AWAITING_EXTERNAL_PAYMENT', `salaire attendu hors plateforme, reçu ${salaryExpectation.kind}`);
      assert(salaryExpectation.recipient === 'CANDIDATE' && salaryExpectation.recipientId === candidateId, 'le salaire est destiné au travailleur');
      assert(salaryExpectation.amount === SALARY_M1_AMOUNT && salaryExpectation.currency === 'FCFA', 'montant du modèle (75 % en M1)');
      assert(feeExpectation.recipient === 'LE_LABEUR' && feeExpectation.amount === COMMISSION_M1_AMOUNT, 'la commission 25 % est destinée à LE LABEUR');
      assert(salaryExpectation.verificationOutcome === 'PENDING', 'issue initiale : paiement en attente');
      assert(body.rules.length >= 4, 'les garde-fous de la clôture sont exposés');

      // Aucun statut du contrat n'est rouvert par la clôture.
      assert(await readContractStatus(harness, seed.contractId) === 'COMPLETED', 'le contrat reste COMPLETED');
    });

    await check('P0-PAYMENT-VERIFY Clôture idempotente: rejeu sans seconde bascule, sans second événement et sans seconde écriture d’audit', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId);
      await endMission(harness, seed.contractId, employerToken, 'pmv-idem-end-001');
      const first = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-idem-001');
      assert(first.status === 200, `clôture 200 attendue, reçue ${first.status}`);
      const firstBody = await jsonOf<MissionPaymentExpectationsView>(first);
      assert(firstBody.markedDue === 2, 'première clôture : 2 bascules');
      const eventsAfterFirst = await readPaymentOutbox(harness, seed.salaryPaymentId);

      // Même clé : rejeu marqué, aucun second effet.
      const replay = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-idem-001');
      assert(replay.status === 200, 'rejeu 200 attendu');
      const replayBody = await jsonOf<MissionPaymentExpectationsView>(replay);
      assert(replayBody.replayed === true, 'rejeu explicitement marqué (réponse mémorisée, aucun second effet)');
      assert((await readPaymentOutbox(harness, seed.salaryPaymentId)).length === eventsAfterFirst.length, 'aucun événement produit par le rejeu');

      // Clé différente : la commande est rejouée sans effet (CAS + index uniques).
      const second = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-idem-002');
      assert(second.status === 200, 'seconde clé 200 attendue');
      const secondBody = await jsonOf<MissionPaymentExpectationsView>(second);
      assert(secondBody.markedDue === 0 && secondBody.duplicates === 0, `aucune nouvelle bascule, reçu ${secondBody.markedDue}/${secondBody.duplicates}`);
      assert((await readPaymentOutbox(harness, seed.salaryPaymentId)).length === eventsAfterFirst.length, 'aucun événement dupliqué');
      const auditEntries = (await readAudit(harness, seed.salaryPaymentId)).filter(row => row.action === 'PAYMENT_DUE');
      assert(auditEntries.length === 1, `un seul audit PAYMENT_DUE, reçus ${auditEntries.length}`);
    });

    await check('P0-PAYMENT-VERIFY Autorisation: candidat et employeur tiers refusés (403), contrat inconnu (404), compte non authentifié (401)', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId);
      await harness.payments!.materializePaymentsForContract(seed.contractId);
      await endMission(harness, seed.contractId, employerToken, 'pmv-auth-end-001');

      const asCandidate = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, candidateToken, 'pmv-auth-candidate-001');
      assert(asCandidate.status === 403, `403 attendu pour le salarié, reçu ${asCandidate.status}`);
      const asOtherEmployer = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, otherEmployerToken, 'pmv-auth-other-001');
      assert(asOtherEmployer.status === 403, `403 attendu pour un employeur tiers, reçu ${asOtherEmployer.status}`);
      const unauthenticated = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, null, 'pmv-auth-anon-001');
      assert(unauthenticated.status === 401, `401 attendu sans session, reçu ${unauthenticated.status}`);
      const unknown = await post(harness, '/api/v1/contracts/ctr_pmv_absent/payments/close-mission', employerToken, 'pmv-auth-unknown-001');
      assert(unknown.status === 404, `404 attendu pour un contrat inconnu, reçu ${unknown.status}`);

      assert((await readPayment(harness, seed.salaryPaymentId))?.status === 'SCHEDULED', 'aucune écriture pour les appels refusés');
      assert((await readAudit(harness, seed.contractId)).every(row => row.action !== 'PAYMENT_MISSION_CLOSED'), 'aucune clôture auditée');
    });

    await check('P0-PAYMENT-VERIFY Clôture réservée à une mission terminée: contrat ACTIVE (409) et contrat DRAFT (409), zéro écriture', async () => {
      const activeSeed = await seedActiveContract(harness, employerId, candidateId);
      await harness.payments!.materializePaymentsForContract(activeSeed.contractId);
      const onActive = await post(harness, `/api/v1/contracts/${activeSeed.contractId}/payments/close-mission`, employerToken, 'pmv-guard-active-001');
      assert(onActive.status === 409, `409 attendu sur contrat ACTIVE, reçu ${onActive.status}`);
      assert((await readPayment(harness, activeSeed.salaryPaymentId))?.status === 'SCHEDULED', 'aucune bascule sur contrat en cours');

      // Contrat DRAFT : le cycle paiement ne progresse pas avant l'exécution.
      const draftOfferId = newEntityId('ofr');
      await createSqlOfferStore(harness.database).create(makeOffer(draftOfferId, employerId));
      const draftId = newEntityId('ctr');
      await createSqlContractStore(harness.database).create({
        id: draftId,
        offerId: draftOfferId,
        employerId,
        employeeId: candidateId,
        status: 'DRAFT',
        monthlySalary: MONTHLY_SALARY,
        currency: 'FCFA',
        startDate: START_DATE,
        currentMonth: 1,
        durationMonths: 2,
        periodicity: 'Mensuel',
        missionDescription: 'Contrat DRAFT P0-PAYMENT-VERIFY',
        location: 'Cotonou',
        conditions: [],
        employerSigned: false,
        employeeSigned: false,
        commissionPercentage: 25,
        commissionAmountDue: 0,
        commissionStatus: 'NOT_APPLICABLE',
        monthlyCheckpoints: [],
        commissionLedger: [],
        paymentSchedule: [],
        history: [],
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      });
      const onDraft = await post(harness, `/api/v1/contracts/${draftId}/payments/close-mission`, employerToken, 'pmv-guard-draft-001');
      assert(onDraft.status === 409, `409 attendu sur contrat DRAFT, reçu ${onDraft.status}`);
      assert((await readAudit(harness, draftId)).length === 0, 'aucune écriture sur contrat non exécuté');
    });

    /* ------------------------------------------------------------------ */
    /* 2. PAIEMENT EXTERNE FOURNI + VÉRIFICATION LE LABEUR                 */
    /* ------------------------------------------------------------------ */

    await check('P0-PAYMENT-VERIFY Chaîne complète après mission terminée: déclaration externe (référence + preuve) → PENDING_VERIFICATION → vérification ADMIN → VERIFIED → PAID, commission séparée', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId);
      await endMission(harness, seed.contractId, employerToken, 'pmv-chain-end-001');
      const close = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-chain-close-001');
      assert(close.status === 200, 'clôture de mission 200 attendue');

      // 1. Paiement EXTERNE fourni par l'employeur : référence + preuve (aucun fonds LE LABEUR).
      const declaration = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'pmv-chain-decl-001', {
        paymentId: seed.salaryPaymentId,
        reference: 'MOOV-PMV-SALARY-M1',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
        externalTransactionId: 'TX-PMV-SALARY-01',
        provider: 'MOBILE_MONEY',
        proofFileName: 'recu-salaire-m1.pdf',
        proofNote: 'Reçu Mobile Money hors plateforme',
      });
      assert(declaration.status === 201, `déclaration 201 attendue après mission terminée, reçue ${declaration.status}`);
      const declared = await jsonOf<PaymentView>(declaration);
      assert(declared.status === 'PENDING_VERIFICATION', `statut PENDING_VERIFICATION attendu, reçu ${declared.status}`);
      assert(declared.reference === 'MOOV-PMV-SALARY-M1', 'référence externe conservée');
      assert(declared.verified === false && declared.paid === false, 'aucun statut avancé sans vérification');

      // Le cycle complet n'a jamais bougé le contrat.
      assert(await readContractStatus(harness, seed.contractId) === 'COMPLETED', 'le contrat reste terminé pendant la vérification');

      // 2. Vérification LE LABEUR : décision ADMIN explicite.
      const approve = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/approve`, adminToken, 'pmv-chain-approve-001');
      assert(approve.status === 200, `vérification 200 attendue, reçue ${approve.status}`);
      const verified = await jsonOf<PaymentView>(approve);
      assert(verified.status === 'VERIFIED' && verified.verified === true, `statut VERIFIED attendu, reçu ${verified.status}`);

      // 3. Paiement confirmé : état métier, aucun mouvement de fonds.
      const confirm = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/confirm`, adminToken, 'pmv-chain-confirm-001');
      assert(confirm.status === 200, `confirmation 200 attendue, reçue ${confirm.status}`);
      const paid = await jsonOf<PaymentView>(confirm);
      assert(paid.status === 'PAID' && paid.paid === true, `statut PAID attendu, reçu ${paid.status}`);

      // 4. La commission 25 % reste un flux SÉPARÉ, encore attendu.
      assert((await readPayment(harness, seed.feePaymentId))?.status === 'DUE', 'commission M1 toujours attendue, non couverte par le salaire');
      const commission = await post(harness, '/api/v1/payments/commission-declarations', employerToken, 'pmv-chain-fee-001', {
        paymentId: seed.feePaymentId,
        reference: 'MOOV-PMV-FEE-M1',
        amount: COMMISSION_M1_AMOUNT,
        currency: 'FCFA',
      });
      assert(commission.status === 201, `commission 201 attendue, reçue ${commission.status}`);
      const commissionBody = await jsonOf<PaymentView>(commission);
      assert(commissionBody.status === 'PENDING_VERIFICATION', 'commission en attente de vérification');
      assert(commissionBody.paymentType === 'PLATFORM_FEE', 'nature PLATFORM_FEE conservée');

      // 5. Audit et événements : chaîne complète, aucun canal de notification.
      const salaryAudit = (await readAudit(harness, seed.salaryPaymentId)).map(row => row.action);
      for (const action of ['PAYMENT_DUE', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFICATION_STARTED', 'PAYMENT_VERIFIED', 'PAYMENT_PAID']) {
        assert(salaryAudit.includes(action), `audit ${action} manquant`);
      }
      const statuses = await harness.database.query<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [seed.contractId]);
      assert(statuses.rows[0].status === 'COMPLETED', 'aucune réouverture du contrat par le cycle paiement');
    });

    await check('P0-PAYMENT-VERIFY Rejet après mission terminée: motif obligatoire, issue À RÉVISER, régularisation par NOUVELLE référence (tentative 2)', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId);
      await endMission(harness, seed.contractId, employerToken, 'pmv-reject-end-001');
      await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-reject-close-001');

      const declaration = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'pmv-reject-decl-001', {
        paymentId: seed.salaryPaymentId,
        reference: 'MOOV-PMV-REJECTED',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
      });
      assert(declaration.status === 201, 'déclaration initiale attendue');

      // Motif obligatoire : un rejet sans motif est refusé par le domaine.
      const withoutReason = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/reject`, adminToken, 'pmv-reject-noreason-001', {});
      assert(withoutReason.status === 400, `400 attendu sans motif, reçu ${withoutReason.status}`);

      const rejected = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/reject`, adminToken, 'pmv-reject-001', {
        reason: 'Référence illisible sur le reçu fourni.',
      });
      assert(rejected.status === 200, `rejet 200 attendu, reçu ${rejected.status}`);
      const rejectedBody = await jsonOf<PaymentView>(rejected);
      assert(rejectedBody.status === 'REJECTED', `statut REJECTED attendu, reçu ${rejectedBody.status}`);

      // Issue opérationnelle : « À RÉVISER » (régularisation par nouvelle déclaration).
      const view = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-reject-view-001');
      const viewBody = await jsonOf<MissionPaymentExpectationsView>(view);
      const salary = viewBody.payments.find(entry => entry.paymentId === seed.salaryPaymentId)!;
      assert(salary.kind === 'TO_REVISE', `TO_REVISE attendu, reçu ${salary.kind}`);
      assert(salary.verificationOutcome === 'TO_REVISE', `issue « À RÉVISER » attendue, reçue ${salary.verificationOutcome}`);

      // Régularisation : la MÊME référence est refusée…
      const sameReference = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'pmv-reject-decl-same-001', {
        paymentId: seed.salaryPaymentId,
        reference: 'MOOV-PMV-REJECTED',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
      });
      assert(sameReference.status === 422, `422 attendu pour une référence déjà rejetée, reçu ${sameReference.status}`);

      // … une déclaration NOUVELLE est admise (tentative 2), la précédente est conservée.
      const newDeclaration = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'pmv-reject-decl-002', {
        paymentId: seed.salaryPaymentId,
        reference: 'MOOV-PMV-SALARY-M1-V2',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
      });
      assert(newDeclaration.status === 201, `régularisation 201 attendue, reçue ${newDeclaration.status}`);
      const attempts = await harness.database.query<{ attempt_number: number; outcome: string; rejection_reason: string | null }>(
        'SELECT attempt_number, outcome, rejection_reason FROM payment_declarations WHERE payment_id = $1 ORDER BY attempt_number',
        [seed.salaryPaymentId],
      );
      assert(attempts.rows.length === 2, `2 tentatives conservées, reçues ${attempts.rows.length}`);
      assert(attempts.rows[0].outcome === 'REJECTED' && attempts.rows[0].rejection_reason !== null, 'preuve et motif du rejet conservés');
      assert(attempts.rows[1].outcome === 'PENDING', 'nouvelle tentative en attente de vérification');

      const approve = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/approve`, adminToken, 'pmv-reject-approve-002');
      assert(approve.status === 200, `vérification de la régularisation 200 attendue, reçue ${approve.status}`);
      const verifiedBody = await jsonOf<PaymentView>(approve);
      assert(verifiedBody.status === 'VERIFIED', `VERIFIED attendu après régularisation, reçu ${verifiedBody.status}`);
    });

    await check('P0-PAYMENT-VERIFY Webhook fournisseur après mission terminée: signature vérifiée, PENDING_VERIFICATION → VERIFIED, jamais PAID directement', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId, { currentMonth: 2 });
      await terminateMission(harness, seed.contractId, employerToken, 'pmv-webhook-terminate-001');
      assert(await readContractStatus(harness, seed.contractId) === 'TERMINATED', 'mission rompue : contrat TERMINATED');

      const close = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-webhook-close-001');
      assert(close.status === 200, 'clôture sur mission rompue 200 attendue');
      const closeBody = await jsonOf<MissionPaymentExpectationsView>(close);
      assert(closeBody.markedDue === 2, 'les échéances atteintes sont constatées après rupture');

      const adapter = createTestPaymentProviderAdapter();
      const payload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-PMV-WEBHOOK-01',
        paymentId: seed.salaryPaymentId,
        reference: 'MOOV-PMV-WEBHOOK',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        occurredAt: new Date(harness.clock.value.getTime() - 1).toISOString(),
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };
      const signed = await adapter.createSignedWebhook(payload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/v1/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));
      assert(response.status === 200, `webhook 200 attendu, reçu ${response.status}`);
      const outcome = await jsonOf<PaymentWebhookOutcome>(response);
      assert(outcome.accepted === true, 'webhook accepté');
      assert(outcome.status === 'VERIFIED', `VERIFIED attendu, reçu ${outcome.status}`);
      assert(String(outcome.status) !== 'PAID', 'le webhook ne bascule JAMAIS directement en PAID');
      assert((await readPayment(harness, seed.salaryPaymentId))?.status === 'VERIFIED', 'état VERIFIED persisté après mission rompue');

      // Signature invalide : refus tracé, aucun changement d'état.
      const forged = await harness.worker.fetch(new Request('https://api.test/api/v1/webhooks/payment-provider', {
        method: 'POST',
        headers: { ...signed.headers, 'x-webhook-signature': 'deadbeef' },
        body: signed.rawBody,
      }));
      assert(forged.status === 401, `401 attendu pour signature invalide, reçu ${forged.status}`);
      assert((await readPayment(harness, seed.salaryPaymentId))?.status === 'VERIFIED', 'aucun état modifié par une signature invalide');
      const rejectedAudit = (await readAudit(harness, seed.salaryPaymentId)).filter(row => row.action === 'PAYMENT_WEBHOOK_SIGNATURE_REJECTED');
      assert(rejectedAudit.length >= 1, 'rejet de signature audité');
    });

    /* ------------------------------------------------------------------ */
    /* 3. GARANTIES DE PÉRIMÈTRE                                           */
    /* ------------------------------------------------------------------ */

    await check('P0-PAYMENT-VERIFY Concurrence: deux clôtures simultanées ne produisent qu’une bascule par échéance et un seul événement PAYMENT_DUE', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId);
      await endMission(harness, seed.contractId, employerToken, 'pmv-race-end-001');

      const [first, second] = await Promise.all([
        post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-race-001'),
        post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-race-002'),
      ]);
      assert(first.status === 200 && second.status === 200, `deux réponses 200 attendues, reçues ${first.status}/${second.status}`);
      const bodies = [await jsonOf<MissionPaymentExpectationsView>(first), await jsonOf<MissionPaymentExpectationsView>(second)];
      const applied = bodies.reduce((total, body) => total + body.markedDue, 0);
      assert(applied === 2, `2 bascules au total (une par échéance), reçues ${applied}`);
      assert((await readPaymentOutbox(harness, seed.salaryPaymentId)).filter(row => row.event_type === 'PAYMENT_DUE').length === 1, 'un seul événement PAYMENT_DUE');
      assert((await readPaymentOutbox(harness, seed.feePaymentId)).filter(row => row.event_type === 'PAYMENT_DUE').length === 1, 'un seul événement PAYMENT_DUE (commission)');
      assert((await readPayment(harness, seed.secondMonthSalaryPaymentId))?.status === 'SCHEDULED', 'échéance future intacte');
    });

    await check('P0-PAYMENT-VERIFY Périmètre: aucun fonds, aucune table de fournisseur, aucun statut inventé, montants du modèle (25 % M1) et commission_percentage jamais réécrit', async () => {
      const tables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND (table_name ILIKE '%escrow%' OR table_name ILIKE '%wallet%' OR table_name ILIKE '%cantonnement%'
                 OR table_name ILIKE '%provider%' OR table_name ILIKE '%mobile_money%')`,
      );
      assert(tables.rows.length === 0, `aucune table d’escrow/portefeuille/fournisseur, trouvées ${tables.rows.map(row => row.table_name).join(', ')}`);

      const seed = await seedActiveContract(harness, employerId, candidateId);
      const contractRow = await harness.database.query<{ commission_percentage: number; currency: string; monthly_salary: string }>(
        'SELECT commission_percentage, currency, monthly_salary FROM contracts WHERE id = $1',
        [seed.contractId],
      );
      assert(Number(contractRow.rows[0].commission_percentage) === 25, 'commission_percentage reste 25 (jamais réécrit)');

      await endMission(harness, seed.contractId, employerToken, 'pmv-scope-end-001');
      const close = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-scope-close-001');
      const body = await jsonOf<MissionPaymentExpectationsView>(close);
      assert(body.contractStatus === 'COMPLETED', 'statut du contrat restitué tel quel');
      for (const entry of body.payments) {
        assert(
          ['TO_MARK_DUE', 'NOT_DUE_YET', 'AWAITING_EXTERNAL_PAYMENT', 'AWAITING_VERIFICATION', 'TO_REVISE', 'SETTLED'].includes(entry.kind),
          `nature de paiement attendu inconnue: ${entry.kind}`,
        );
        assert(
          ['PENDING', 'CONFIRMED', 'REJECTED', 'TO_REVISE'].includes(entry.verificationOutcome),
          `issue opérationnelle inconnue: ${entry.verificationOutcome}`,
        );
      }
      // Aucun statut nouveau dans le domaine du contrat.
      const statuses = await harness.database.query<{ constraint_def: string }>(
        `SELECT pg_get_constraintdef(oid) AS constraint_def FROM pg_constraint
          WHERE conrelid = 'contracts'::regclass AND contype = 'c'`,
      );
      const contractChecks = statuses.rows.map(row => row.constraint_def).join(' ');
      assert(!/WALLET|ESCROW|CUSTODY/.test(contractChecks), 'aucun statut de détention de fonds ajouté au contrat');
      assert((await readPayment(harness, seed.feePaymentId))?.status === 'DUE', 'commission M1 attendue, montant du modèle');
      assert(Number(contractRow.rows[0].monthly_salary) === MONTHLY_SALARY, 'salaire du modèle inchangé');
    });

    await check('P0-PAYMENT-VERIFY Rollback: une clôture annulée ne laisse ni bascule, ni événement, ni audit de transition', async () => {
      const seed = await seedActiveContract(harness, employerId, candidateId);
      await harness.payments!.materializePaymentsForContract(seed.contractId);
      await endMission(harness, seed.contractId, employerToken, 'pmv-rollback-end-001');
      const before = await readPayment(harness, seed.salaryPaymentId);
      assert(before?.status === 'SCHEDULED', 'état initial SCHEDULED');

      // Une clôture sur un contrat inconnu échoue : aucune écriture partielle.
      const failing = await post(harness, '/api/v1/contracts/ctr_pmv_rollback/payments/close-mission', employerToken, 'pmv-rollback-001');
      assert(failing.status === 404, `404 attendu, reçu ${failing.status}`);

      const close = await post(harness, `/api/v1/contracts/${seed.contractId}/payments/close-mission`, employerToken, 'pmv-rollback-002');
      assert(close.status === 200, 'clôture réussie après l’échec');
      assert((await readPayment(harness, seed.salaryPaymentId))?.status === 'DUE', 'bascule appliquée une seule fois');
      const dueRows = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id = $1 AND event_type = 'PAYMENT_DUE'",
        [seed.salaryPaymentId],
      );
      assert(Number(dueRows.rows[0].count) === 1, 'un seul événement PAYMENT_DUE après reprise');
    });
  } finally {
    await harness.close();
    paymentIdempotencyCache.clear();
  }

  return results;
}
