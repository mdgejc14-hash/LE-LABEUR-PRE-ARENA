/**
 * LE LABEUR — P0-PAY-1 — tests d'intégration Worker/API → repository → PostgreSQL
 * du CYCLE MÉTIER des paiements.
 *
 * Chaîne réellement exercée (aucun mock) :
 *   échéancier du contrat → materialisation `payments` → balayage borné
 *   `SCHEDULED → DUE` → DÉCLARATION employeur (HTTP) → `PENDING_VERIFICATION`
 *   → VÉRIFICATION locale ADMIN → `VERIFIED` → rapprochement local → `PAID`
 *   → rejet motivé → RÉGULARISATION par nouvelle tentative.
 *
 * Ce qui est vérifié en même temps, parce que c'est le contrat de la tranche :
 * aucun argent réel (aucune table de fournisseur, `movedFunds: false` partout),
 * aucune notification envoyée (événements en attente, sans consumer),
 * `paymentType` jamais lu du client, propriétaire résolu depuis le contrat,
 * séparation stricte salaire/commission, idempotence de rejeu ET de conflit,
 * concurrence tranchée par PostgreSQL, rollback sans aucune ligne résiduelle,
 * montants du modèle (25 % en M1, 0 % en M2+, jamais inventés).
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
import { createSqlPaymentStores } from '../persistence/sqlPaymentStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { buildContractActivationPlan } from '../../domain/contractScheduleAutomation';
import { paymentIdFor } from '../../domain/paymentLifecycle';
import { paymentIdempotencyCache } from '../repositories/paymentRepository';
import { createUnconfiguredPaymentProviderAdapter } from '../payments/paymentVerification';
import { PAYMENT_PRE_DUE_JOB_TYPE } from '../../domain/paymentLifecycle';
import { createPaymentReconciliationBatchService } from '../payments/paymentReconciliationBatch';
import { createSqlPaymentReconciliationStores } from '../persistence/sqlPaymentReconciliationStores';
import { createSqlAutomationStores } from '../persistence/sqlAutomationStores';
import type { PaymentReconciliationStores } from '../persistence/paymentReconciliationRecords';
import { PAYMENT_RECONCILIATION_RETRY_JOB } from '../automation/paymentReconciliationJobs';
import { composeWorker } from './entry';
import type { PaymentView } from '../repositories/paymentRepository';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SEED_TIMESTAMP = '2026-10-05T15:00:00.000Z';
/** Échéance M1 = 2026-10-05 : atteinte dès l'horloge de référence du harness. */
const START_DATE = '05 Septembre 2026';
const MONTHLY_SALARY = 175_000;
const SALARY_DUE_AT = '2026-10-05T00:00:00.000Z';

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
    summary: 'Offre de test P0-PAY-1.',
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
      displayName: 'Admin P0-PAY-1',
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
 * sont pas inventés, ils dérivent de `buildPaymentSchedule`.
 */
async function seedActiveContract(harness: Harness, employerId: string, employeeId: string): Promise<SeedResult> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, employerId));
  const contractId = newEntityId('ctr');
  // Le contrat est semé AVEC le plan d'activation réel (échéancier, point de
  // contrôle M1, grand livre de commission) : les projections du cycle trouvent
  // exactement les vues que P0-AUTO-2 écrit, rien n'est inventé.
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
    currentMonth: 1,
    durationMonths: 2,
    periodicity: 'Mensuel',
    missionDescription: 'Contrat seedé P0-PAY-1',
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

async function readPayments(harness: Harness, contractId: string): Promise<Array<Record<string, unknown>>> {
  const result = await harness.database.query<Record<string, unknown>>(
    'SELECT * FROM payments WHERE contract_id = $1 ORDER BY payment_type, month_number',
    [contractId],
  );
  return result.rows;
}

async function readDeclarations(harness: Harness, paymentId: string): Promise<Array<Record<string, unknown>>> {
  const result = await harness.database.query<Record<string, unknown>>(
    'SELECT * FROM payment_declarations WHERE payment_id = $1 ORDER BY attempt_number',
    [paymentId],
  );
  return result.rows;
}

async function readPaymentOutbox(harness: Harness, paymentId: string): Promise<Array<{ event_type: string; status: string; source: string; payload: unknown }>> {
  const result = await harness.database.query<{ event_type: string; status: string; source: string; payload: unknown }>(
    'SELECT event_type, status, source, payload FROM automation_outbox WHERE aggregate_id = $1 ORDER BY id',
    [paymentId],
  );
  return result.rows;
}

async function readPaymentAudit(harness: Harness, paymentId: string): Promise<Array<{ action: string; actor_id: string; source: string; before_state: unknown; after_state: unknown }>> {
  const result = await harness.database.query<{ action: string; actor_id: string; source: string; before_state: unknown; after_state: unknown }>(
    'SELECT action, actor_id, source, before_state, after_state FROM automation_audit_ledger WHERE entity_id = $1 ORDER BY occurred_at, id',
    [paymentId],
  );
  return result.rows;
}

/** PGlite rend les `timestamptz` en objets `Date` : comparaison en ISO. */
function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

/** Colonnes `jsonb` : PGlite rend déjà un tableau, `pg` une chaîne JSON. */
function itemsOf(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === 'string') return JSON.parse(value) as Array<Record<string, unknown>>;
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

function stateOf(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

async function post(harness: Harness, path: string, token: string, key: string, body: unknown): Promise<Response> {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body ?? {}),
  }));
}

async function get(harness: Harness, path: string, token: string): Promise<Response> {
  return harness.worker.fetch(authRequest(path, token));
}

async function jsonOf<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export async function runPaymentCycleTests(): Promise<OfferTestResult[]> {
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

  const salaryOtps = new Map<string, string>();
  const harness = await createOffersTestHarness((id, otp) => salaryOtps.set(id, otp));
  const otherHarnessEmployees: { employerToken: string; employerId: string; candidateToken: string; candidateId: string } = {
    employerToken: '', employerId: '', candidateToken: '', candidateId: '',
  };

  let employerToken = '';
  let employerId = '';
  let candidateToken = '';
  let candidateId = '';
  let adminToken = '';
  let seed: SeedResult;

  try {
    const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
    const otherEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
    const admin = await provisionAdmin(harness);
    employerToken = employer.token;
    employerId = employer.userId;
    candidateToken = candidate.token;
    candidateId = candidate.userId;
    adminToken = admin.token;
    otherHarnessEmployees.employerToken = otherEmployer.token;
    otherHarnessEmployees.employerId = otherEmployer.userId;
    seed = await seedActiveContract(harness, employerId, candidateId);

    /* ---------------- 1. Matérialisation depuis l'échéancier réel ---------------- */

    await check('P0-PAY-1 Matérialisation: un paiement par période de l’échéancier, ids déterministes, statut SCHEDULED', async () => {
      const created = await harness.payments!.materializePaymentsForContract(seed.contractId);
      assert(created === 3, `3 paiements attendus (2 salaires + 1 commission M1), reçus ${created}`);
      const rows = await readPayments(harness, seed.contractId);
      assert(rows.length === 3, `3 lignes attendues, reçues ${rows.length}`);
      const salary = rows.find(row => row.payment_type === 'SALARY' && Number(row.month_number) === 1)!;
      const fee = rows.find(row => row.payment_type === 'PLATFORM_FEE')!;
      assert(salary && fee, 'paiement salarial et paiement de plateforme attendus');
      assert(Number(salary.amount) === 131_250, `part salarié M1 = 75 % du salaire, reçu ${String(salary.amount)}`);
      assert(Number(fee.amount) === 43_750, `commission M1 = 25 %, reçue ${String(fee.amount)}`);
      assert(salary.status === 'SCHEDULED' && fee.status === 'SCHEDULED', 'tout paiement materialisé part de SCHEDULED');
      assert(salary.currency === 'FCFA' && fee.currency === 'FCFA', 'devise du contrat conservée');
      assert(isoOf(salary.due_at) === SALARY_DUE_AT, `échéance réelle 00:00 UTC attendue, reçue ${isoOf(salary.due_at)}`);
      assert(isoOf(salary.scheduled_at) === harness.clock.value.toISOString(),
        `instant de matérialisation = horodatage du worker, reçu ${isoOf(salary.scheduled_at)}`);
      assert(salary.id === seed.salaryPaymentId, 'identifiant déterministe dérivé du contrat');
      assert(salary.schedule_entry_id === `PSE-${seed.contractId}-M1`, 'lien vers l’entrée d’échéancier du contrat');
      assert(salary.employer_id === employerId && salary.candidate_id === candidateId, 'parties résolues depuis le contrat');
      // M2+ : commission à 0 % — la règle du modèle, donc AUCUN paiement de plateforme.
      assert(!rows.some(row => row.payment_type === 'PLATFORM_FEE' && Number(row.month_number) === 2),
        'aucun paiement de commission en M2 (règle réelle 0 %, aucune invention)');
    });

    await check('P0-PAY-1 Matérialisation: un rejeu ne crée jamais un second paiement pour la même période', async () => {
      const again = await harness.payments!.materializePaymentsForContract(seed.contractId);
      assert(again === 0, `0 création au rejeu attendu, reçu ${again}`);
      const rows = await readPayments(harness, seed.contractId);
      assert(rows.length === 3, `toujours 3 lignes, reçues ${rows.length}`);
      const keys = rows.map(row => String(row.idempotency_key));
      assert(new Set(keys).size === 3, 'clés d’idempotence uniques par (contrat, nature, mois)');
    });

    /* ---------------- 2. SCHEDULED → DUE par le balayage borné ---------------- */

    await check('P0-PAY-1 Échéance: le balayage borne la bascule SCHEDULED → DUE, projection et événement PAYMENT_DUE', async () => {
      const report = await harness.automationWorker!.runDuePayments(50);
      // La requête est bornée sur l'index partiel `SCHEDULED` + échéance atteinte :
      // M2 n'est PAS lue (aucun scan complet de la table).
      assert(report.scanned === 2, `2 paiements échus balayés, reçus ${report.scanned}`);
      assert(report.applied === 2, `2 bascules attendues (M1 salaire + M1 commission; M2 non échu), reçues ${report.applied}`);
      const rows = await readPayments(harness, seed.contractId);
      const byId = new Map(rows.map(row => [String(row.id), row]));
      assert(byId.get(seed.salaryPaymentId)!.status === 'DUE', 'M1 salaire DUE');
      assert(byId.get(seed.feePaymentId)!.status === 'DUE', 'M1 commission DUE');
      assert(byId.get(seed.secondMonthSalaryPaymentId)!.status === 'SCHEDULED', 'M2 reste SCHEDULED (échéance non atteinte)');

      const events = await readPaymentOutbox(harness, seed.salaryPaymentId);
      const due = events.filter(row => row.event_type === 'PAYMENT_DUE');
      assert(due.length === 1, `un seul événement PAYMENT_DUE, reçus ${due.length}`);
      assert(due[0].source === 'automation:P0-PAY-1', 'source de l’automatisation du cycle');
      assert(due[0].status === 'PENDING', 'événement préparé : aucun consumer, aucun canal');
      const payload = stateOf(due[0].payload);
      assert(payload.channel === null, 'AUCUN canal de notification');
      assert(payload.contractId === seed.contractId, 'contractId porté par l’événement');

      const audit = await readPaymentAudit(harness, seed.salaryPaymentId);
      const dueAudit = audit.find(row => row.action === 'PAYMENT_DUE')!;
      assert(dueAudit, 'audit PAYMENT_DUE écrit');
      assert(dueAudit.actor_id === 'SYSTEM', 'acteur SYSTEM pour une bascule automatique');
      assert(stateOf(dueAudit.before_state).status === 'SCHEDULED', 'état avant tracé');
      assert(stateOf(dueAudit.after_state).status === 'DUE', 'état après tracé');
      assert(stateOf(dueAudit.after_state).contractId === seed.contractId, 'contractId dans l’audit');

      // Projection sur la VUE RÉELLE du contrat (aucune table dupliquée).
      const contractRow = await harness.database.query<{ payment_schedule: unknown }>(
        'SELECT payment_schedule FROM contracts WHERE id = $1', [seed.contractId],
      );
      const schedule = itemsOf(contractRow.rows[0].payment_schedule);
      assert(schedule.find(entry => Number(entry.monthNumber) === 1)!.salaryStatus === 'DUE', 'échéancier projeté en DUE');
    });

    await check('P0-PAY-1 Échéance: un second balayage ne produit ni second événement ni seconde écriture', async () => {
      const before = await readPaymentOutbox(harness, seed.salaryPaymentId);
      const report = await harness.automationWorker!.runDuePayments(50);
      assert(report.scanned === 0, 'aucune ligne SCHEDULED échue ne reste à lire');
      assert(report.applied === 0, `0 bascule au second passage, reçue ${report.applied}`);
      assert(report.duplicates === 0, `0 doublon, reçus ${report.duplicates}`);
      assert(report.paymentIds.length === 0, 'aucun paiement rejoué');
      const after = await readPaymentOutbox(harness, seed.salaryPaymentId);
      assert(after.length === before.length, 'aucun événement dupliqué');
    });

    /* ---------------- 3. Déclaration : validation et autorité serveur ---------------- */

    await check('P0-PAY-1 Déclaration: Idempotency-Key exigée et charge utile contrôlée (400)', async () => {
      const noKey = await harness.worker.fetch(authRequest('/api/v1/payments/salary-declarations', employerToken, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: seed.salaryPaymentId, reference: 'TX-1' }),
      }));
      assert(noKey.status === 400, `400 attendu sans Idempotency-Key, reçu ${noKey.status}`);

      const unknown = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-bad-0001',
        { paymentId: seed.salaryPaymentId, reference: 'TX-1', amountDue: 12 });
      assert(unknown.status === 400, `400 attendu pour un champ inconnu, reçu ${unknown.status}`);
    });

    await check('P0-PAY-1 Déclaration: paymentType, employerId et status envoyés par le client sont REFUSÉS', async () => {
      for (const field of ['paymentType', 'employerId', 'status', 'verifiedBy']) {
        const response = await post(harness, '/api/v1/payments/salary-declarations', employerToken, `p0pay-forbid-${field}-01`, {
          paymentId: seed.salaryPaymentId,
          reference: 'TX-1',
          [field]: field === 'paymentType' ? 'PLATFORM_FEE' : 'anything',
        });
        assert(response.status === 400, `${field} doit être refusé (400), reçu ${response.status}`);
        const body = await jsonOf<{ error: { details?: Record<string, string[]> } }>(response);
        assert(body.error.details?.[field]?.length, `le détail d’erreur nomme le champ ${field}`);
      }
      const rows = await readDeclarations(harness, seed.salaryPaymentId);
      assert(rows.length === 0, 'aucune déclaration écrite par une requête refusée');
    });

    await check('P0-PAY-1 Déclaration: le salarié et un employeur tiers ne peuvent rien déclarer (403)', async () => {
      const asCandidate = await post(harness, '/api/v1/payments/salary-declarations', candidateToken, 'p0pay-cand-declare-01', {
        paymentId: seed.salaryPaymentId, reference: 'TX-CAND',
      });
      assert(asCandidate.status === 403, `403 attendu pour un salarié, reçu ${asCandidate.status}`);

      const asOtherEmployer = await post(harness, '/api/v1/payments/salary-declarations', otherHarnessEmployees.employerToken, 'p0pay-other-declare-01', {
        paymentId: seed.salaryPaymentId, reference: 'TX-OTHER',
      });
      assert(asOtherEmployer.status === 403, `403 attendu pour un employeur non propriétaire, reçu ${asOtherEmployer.status}`);

      const anonymous = await harness.worker.fetch(new Request('https://api.test/api/v1/payments/salary-declarations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0pay-anon-declare-01' },
        body: '{}',
      }));
      assert(anonymous.status === 401, `401 attendu sans session, reçu ${anonymous.status}`);
    });

    /* ---------------- 4. Séparation stricte des flux ---------------- */

    await check('P0-PAY-1 Séparation: une route de salaire ne déclare jamais une commission, et la période doit correspondre', async () => {
      const crossed = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-cross-type-0001', {
        paymentId: seed.feePaymentId, reference: 'TX-CROSS',
      });
      assert(crossed.status === 409, `409 attendu (nature du paiement visé), reçu ${crossed.status}`);
      const wrongPeriod = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-wrong-period-01', {
        paymentId: seed.salaryPaymentId, periodKey: 'Mois 07', reference: 'TX-PERIOD',
      });
      assert(wrongPeriod.status === 409, `409 attendu pour une période incohérente, reçu ${wrongPeriod.status}`);
      const missingPayment = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-missing-000001', {
        paymentId: 'pay_salary_ctr_absent_m1', reference: 'TX-404',
      });
      assert(missingPayment.status === 404, `404 attendu pour un paiement inconnu, reçu ${missingPayment.status}`);
    });

    await check('P0-PAY-1 Déclaration: montant et devise doivent correspondre au paiement dû (422)', async () => {
      const wrongAmount = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-amount-000001', {
        paymentId: seed.salaryPaymentId, reference: 'TX-AMOUNT', amount: 130_000,
      });
      assert(wrongAmount.status === 422, `422 attendu pour un montant divergent, reçu ${wrongAmount.status}`);
      const wrongCurrency = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-currency-0001', {
        paymentId: seed.salaryPaymentId, reference: 'TX-CURRENCY', currency: 'XOF',
      });
      assert(wrongCurrency.status === 422, `422 attendu pour une devise divergente, reçu ${wrongCurrency.status}`);
    });

    /* ---------------- 5. Déclaration conforme ---------------- */

    await check('P0-PAY-1 Déclaration: DUE → PENDING_VERIFICATION, tentative ajoutée, deux événements, projection et audit', async () => {
      const response = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-declare-000001', {
        paymentId: seed.salaryPaymentId,
        reference: 'MOMO-2026-10-05-0001',
        externalTransactionId: 'EXT-0001',
        provider: 'MOBILE_MONEY',
        proofFileName: 'recu-m1.pdf',
        comment: 'Virement effectué le 5 octobre.',
      });
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const view = await jsonOf<PaymentView>(response);
      assert(view.status === 'PENDING_VERIFICATION', `PENDING_VERIFICATION attendu, reçu ${view.status}`);
      assert(view.declarationCount === 1, 'une tentative comptée');
      assert(view.declarations.length === 1 && view.declarations[0].attemptNumber === 1, 'tentative 1 enregistrée');
      assert(view.declarations[0].outcome === 'PENDING', 'la tentative reste en attente de vérification');
      assert(view.amount === 131_250 && view.currency === 'FCFA', 'montant et devise du contrat, jamais du client');
      assert(view.replayed !== true, 'première déclaration : pas un rejeu');

      const rows = await readPayments(harness, seed.contractId);
      const salary = rows.find(row => row.id === seed.salaryPaymentId)!;
      assert(String(salary.reference) === 'MOMO-2026-10-05-0001', 'référence persistée sur le paiement');
      assert(stateOf(salary.proof).fileName === 'recu-m1.pdf', 'métadonnée de preuve conservée');

      const events = await readPaymentOutbox(harness, seed.salaryPaymentId);
      assert(events.filter(row => row.event_type === 'PAYMENT_DECLARED').length === 1, 'un événement PAYMENT_DECLARED');
      assert(events.filter(row => row.event_type === 'PAYMENT_PENDING_VERIFICATION').length === 1, 'un événement PAYMENT_PENDING_VERIFICATION');
      for (const event of events) {
        assert(event.status === 'PENDING', `aucun consumer branché (${event.event_type})`);
      }

      const audit = await readPaymentAudit(harness, seed.salaryPaymentId);
      const submitted = audit.find(row => row.action === 'PAYMENT_SUBMITTED')!;
      assert(submitted, 'audit PAYMENT_SUBMITTED écrit');
      assert(submitted.actor_id === employerId, 'acteur de la déclaration = employeur');
      assert(submitted.source === 'api:P0-PAY-1', 'source de l’écriture API');
      assert(stateOf(submitted.after_state).declarationId === `pdl_${seed.salaryPaymentId}_A1`, 'identifiant de tentative tracé');

      const contractRow = await harness.database.query<{ payment_schedule: unknown }>(
        'SELECT payment_schedule FROM contracts WHERE id = $1', [seed.contractId],
      );
      const schedule = itemsOf(contractRow.rows[0].payment_schedule);
      const entry = schedule.find(item => Number(item.monthNumber) === 1)!;
      assert(entry.salaryStatus === 'PENDING_VERIFICATION', 'vue d’échéancier du contrat projetée');
      assert(typeof entry.salaryDeclaredAt === 'string', 'date de déclaration projetée sur la vue');
      assert(entry.salaryProofFileName === 'recu-m1.pdf', 'preuve citée sur la vue (aucun stockage de fichier)');
    });

    /* ---------------- 6. Idempotence: rejeu et conflit ---------------- */

    await check('P0-PAY-1 Idempotence: même clé et même charge = rejeu sans seconde tentative', async () => {
      const replay = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-declare-000001', {
        paymentId: seed.salaryPaymentId,
        reference: 'MOMO-2026-10-05-0001',
        externalTransactionId: 'EXT-0001',
        provider: 'MOBILE_MONEY',
        proofFileName: 'recu-m1.pdf',
        comment: 'Virement effectué le 5 octobre.',
      });
      assert(replay.status === 201, `201 attendu au rejeu, reçu ${replay.status}`);
      const view = await jsonOf<PaymentView>(replay);
      assert(view.replayed === true, 'la réponse est marquée comme un rejeu');
      assert(view.declarationCount === 1, 'aucune seconde tentative comptée');
      const declarations = await readDeclarations(harness, seed.salaryPaymentId);
      assert(declarations.length === 1, `une seule ligne de déclaration, reçues ${declarations.length}`);
      const events = await readPaymentOutbox(harness, seed.salaryPaymentId);
      assert(events.filter(row => row.event_type === 'PAYMENT_DECLARED').length === 1, 'aucun second événement de déclaration');
    });

    await check('P0-PAY-1 Idempotence: même clé et charge différente = conflit (409), sans écriture', async () => {
      const conflict = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-declare-000001', {
        paymentId: seed.salaryPaymentId,
        reference: 'AUTRE-REFERENCE-0002',
      });
      assert(conflict.status === 409, `409 attendu pour une clé réutilisée, reçu ${conflict.status}`);
      const declarations = await readDeclarations(harness, seed.salaryPaymentId);
      assert(declarations.length === 1, 'aucune tentative ajoutée par un conflit');
      const payment = await harness.database.query<{ status: string }>(
        'SELECT status FROM payments WHERE id = $1', [seed.salaryPaymentId],
      );
      assert(payment.rows[0].status === 'PENDING_VERIFICATION', 'statut du paiement inchangé');
    });

    await check('P0-PAY-1 Déclaration: une seconde déclaration sur un paiement déjà vérifié est refusée (409)', async () => {
      const twice = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-declare-000002', {
        paymentId: seed.salaryPaymentId, reference: 'MOMO-2026-10-05-0002',
      });
      assert(twice.status === 409, `409 attendu (déjà en cours de vérification), reçu ${twice.status}`);
      const declarations = await readDeclarations(harness, seed.salaryPaymentId);
      assert(declarations.length === 1, 'aucune tentative ajoutée');
    });

    /* ---------------- 7. Transitions interdites ---------------- */

    await check('P0-PAY-1 Transitions refusées: DUE → PAID et PENDING → PAID sans vérification (409)', async () => {
      const feeDirectPay = await post(harness, `/api/v1/admin/payments/${seed.feePaymentId}/confirm`, adminToken, 'p0pay-fee-paid-00001', {});
      assert(feeDirectPay.status === 409, `DUE → PAID refusé (409 attendu), reçu ${feeDirectPay.status}`);
      const pendingDirectPay = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/confirm`, adminToken, 'p0pay-pay-no-verify-01', {});
      assert(pendingDirectPay.status === 409, `PENDING_VERIFICATION → PAID refusé, reçu ${pendingDirectPay.status}`);
      const approveScheduled = await post(harness, `/api/v1/admin/payments/${seed.secondMonthSalaryPaymentId}/approve`, adminToken, 'p0pay-approve-sched-01', {});
      assert(approveScheduled.status === 409, `vérification d’un paiement SCHEDULED refusée, reçu ${approveScheduled.status}`);
      const rows = await readPayments(harness, seed.contractId);
      assert(rows.every(row => row.status !== 'PAID'), 'aucun paiement payé par une transition interdite');
    });

    await check('P0-PAY-1 Vérification: un employeur ne peut ni vérifier ni décider (403)', async () => {
      const byEmployer = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/approve`, employerToken, 'p0pay-approve-emp-001', {});
      assert(byEmployer.status === 403, `403 attendu pour un non-ADMIN, reçu ${byEmployer.status}`);
      const rejectByEmployer = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/reject`, employerToken, 'p0pay-reject-emp-0001', {
        reason: 'tentative hors rôle',
      });
      assert(rejectByEmployer.status === 403, `403 attendu pour un rejet par l’employeur, reçu ${rejectByEmployer.status}`);
    });

    /* ---------------- 8. Vérification locale et rapprochement ---------------- */

    await check('P0-PAY-1 Vérification: PENDING_VERIFICATION → VERIFIED par décision ADMIN tracée, sans aucun mouvement de fonds', async () => {
      const approved = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/approve`, adminToken, 'p0pay-approve-000001', {});
      assert(approved.status === 200, `200 attendu, reçu ${approved.status}`);
      const view = await jsonOf<PaymentView>(approved);
      assert(view.status === 'VERIFIED', `VERIFIED attendu, reçu ${view.status}`);
      assert(typeof view.verifiedAt === 'string' && view.verifiedBy === admin.userId,
        `vérificateur et date tracés, reçu ${String(view.verifiedBy)}`);
      assert(view.declarations[view.declarations.length - 1].reviewedBy === admin.userId, 'décision attribuée sur la tentative');
      assert(view.paid === false, 'vérifié ne veut pas dire payé');

      const declarations = await readDeclarations(harness, seed.salaryPaymentId);
      assert(declarations[0].outcome === 'VERIFIED', 'la tentative est marquée vérifiée (jamais réécrite)');
      assert(/^\d{4}-\d{2}-\d{2}T/.test(isoOf(declarations[0].reviewed_at)), 'horodatage de décision conservé sur la tentative');
      assert(declarations[0].reviewed_by, 'décision attribuée');

      const events = await readPaymentOutbox(harness, seed.salaryPaymentId);
      const approvedEvent = events.find(row => row.event_type === 'PAYMENT_APPROVED')!;
      assert(approvedEvent, 'événement PAYMENT_APPROVED produit');
      const payload = stateOf(approvedEvent.payload);
      assert(payload.verificationSource === 'local-deterministic', 'la vérification est LOCALE : aucun fournisseur consulté');
      assert(payload.movedFunds === false, 'aucun mouvement de fonds');
      assert(approvedEvent.status === 'PENDING', 'événement sans consumer');

      const audit = await readPaymentAudit(harness, seed.salaryPaymentId);
      assert(audit.some(row => row.action === 'PAYMENT_VERIFICATION_STARTED'), 'vérification commencée est tracée');
      const verifiedAudit = audit.find(row => row.action === 'PAYMENT_VERIFIED')!;
      assert(verifiedAudit && stateOf(verifiedAudit.after_state).verdict === 'MATCHED', 'verdict tracé');
    });

    await check('P0-PAY-1 Vérification: rejeu idempotent de la décision (aucun second événement)', async () => {
      const before = await readPaymentOutbox(harness, seed.salaryPaymentId);
      const replay = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/approve`, adminToken, 'p0pay-approve-000002', {});
      assert(replay.status === 200, `200 attendu au rejeu, reçu ${replay.status}`);
      const view = await jsonOf<PaymentView>(replay);
      assert(view.status === 'VERIFIED' && view.replayed === true, 'rejeu reconnu sans nouvel effet');
      const after = await readPaymentOutbox(harness, seed.salaryPaymentId);
      assert(after.length === before.length, 'aucun second événement de vérification');
    });

    await check('P0-PAY-1 Rapprochement: VERIFIED → PAID est un état métier; PAID devient terminal', async () => {
      const confirmed = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/confirm`, adminToken, 'p0pay-confirm-000001', {});
      assert(confirmed.status === 200, `200 attendu, reçu ${confirmed.status}`);
      const view = await jsonOf<PaymentView>(confirmed);
      assert(view.status === 'PAID' && view.paid, 'PAID posé après rapprochement local');
      assert(view.verified === true, 'un paiement payé est nécessairement passé par VERIFIED');

      const events = await readPaymentOutbox(harness, seed.salaryPaymentId);
      const paidEvent = events.find(row => row.event_type === 'PAYMENT_PAID')!;
      assert(paidEvent, 'événement PAYMENT_PAID produit');
      const payload = stateOf(paidEvent.payload);
      assert(payload.movedFunds === false, 'PAYMENT_PAID affirme explicitement l’absence de débit');
      assert(payload.providerTransactionId === null, 'aucune transaction fournisseur');
      assert(String(payload.reconciliation).includes('Aucun mouvement de fonds'), 'la note de rapprochement est explicite');

      const contractRow = await harness.database.query<{ payment_schedule: unknown; history: unknown }>(
        'SELECT payment_schedule, history FROM contracts WHERE id = $1', [seed.contractId],
      );
      const schedule = itemsOf(contractRow.rows[0].payment_schedule);
      const entry = schedule.find(item => Number(item.monthNumber) === 1)!;
      assert(entry.salaryStatus === 'PAID', 'vue du contrat alignée sur PAID');
      assert(entry.isSalaryPaidToEmployee === true, 'point de contrôle salarié aligné (champ réel du modèle)');
      const history = itemsOf(contractRow.rows[0].history);
      assert(history.some(item => item.event === 'PAYMENT_PAID'), 'historique du contrat complété');

      // Terminal : plus aucune transition, y compris par le déclarant.
      const declareAfterPaid = await post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-after-paid-0001', {
        paymentId: seed.salaryPaymentId, reference: 'APRES-PAID-0001',
      });
      assert(declareAfterPaid.status === 409, `PAID → déclaration refusée, reçu ${declareAfterPaid.status}`);
      const rejectAfterPaid = await post(harness, `/api/v1/admin/payments/${seed.salaryPaymentId}/reject`, adminToken, 'p0pay-reject-paid-001', {
        reason: 'tentative après paiement',
      });
      assert(rejectAfterPaid.status === 409, `PAID → REJECTED refusé, reçu ${rejectAfterPaid.status}`);
      const declarations = await readDeclarations(harness, seed.salaryPaymentId);
      assert(declarations.length === 1, 'aucune tentative ajoutée après PAID');
    });

    /* ---------------- P0-SALARY-1 : PostgreSQL + Worker/API ---------------- */
    await check('P0-SALARY-1 PAID → outbox → worker → demande OTP unique, salaire uniquement', async () => {
      const report = await harness.automationWorker!.drainEvents(100);
      assert(report.deadLettered === 0, 'aucun événement dead-letter');
      await harness.automationWorker!.drainEvents(100);
      const rows = await harness.database.query<{ payment_id: string; nonce: string; otp_digest: string }>('SELECT * FROM salary_confirmations WHERE payment_id = $1', [seed.salaryPaymentId]);
      assert(rows.rows.length === 1 && rows.rows[0].nonce.length === 64, `demande et nonce automatiques: ${JSON.stringify(report)}, ${JSON.stringify((await harness.database.query('SELECT event_type,status,last_error FROM automation_outbox WHERE aggregate_id=$1', [seed.salaryPaymentId])).rows)}`);
      assert(rows.rows[0].otp_digest !== salaryOtps.get(seed.salaryPaymentId), 'OTP non stocké en clair');
      assert(/^\d{6}$/.test(salaryOtps.get(seed.salaryPaymentId) ?? ''), 'OTP transmis au canal local de test');
      const duplicate = await Promise.all([harness.automationWorker!.drainEvents(100), harness.automationWorker!.drainEvents(100)]);
      assert(duplicate.every(item => item.deadLettered === 0), 'deux workers sans double effet');
      assert((await harness.database.query('SELECT payment_id FROM salary_confirmations')).rows.length === 1, 'un seul dossier');
      const fee = await post(harness, `/api/v1/payments/${seed.feePaymentId}/salary-confirmation-request`, employerToken, 'salary-fee-1', {});
      assert(fee.status !== 200, 'commission non éligible');
      const notPaid = await post(harness, `/api/v1/payments/${seed.secondMonthSalaryPaymentId}/salary-confirmation-request`, employerToken, 'salary-due-1', {});
      assert(notPaid.status !== 200, 'salaire non PAID non éligible');
    });

    await check('P0-SALARY-1 cohérence échéancier, demandes concurrentes et rollback PostgreSQL', async () => {
      const path = `/api/v1/payments/${seed.salaryPaymentId}/salary-confirmation-request`;
      const [a, b] = await Promise.all([
        post(harness, path, employerToken, 'salary-manual-1', {}),
        post(harness, path, employerToken, 'salary-manual-2', {}),
      ]);
      assert(a.status === 200 && b.status === 200, 'deux demandes sur dossier automatique existant');
      assert((await harness.database.query('SELECT payment_id FROM salary_confirmations')).rows.length === 1, 'aucun double dossier');
      const original = (await harness.database.query<{ amount: string; period_key: string }>('SELECT amount, period_key FROM payments WHERE id=$1', [seed.salaryPaymentId])).rows[0];
      try {
        await harness.database.query('UPDATE payments SET amount = amount + 1, period_key = $2 WHERE id=$1', [seed.salaryPaymentId, 'wrong-month']);
        const denied = await post(harness, path, employerToken, 'salary-inconsistent-1', {});
        assert(denied.status !== 200, 'période et montant discordants refusés');
      } finally {
        await harness.database.query('UPDATE payments SET amount=$2, period_key=$3 WHERE id=$1', [seed.salaryPaymentId, original.amount, original.period_key]);
      }
      try {
        await harness.database.run(async tx => {
          await tx.query('UPDATE salary_confirmations SET nonce=$2 WHERE payment_id=$1', [seed.salaryPaymentId, 'temporary']);
          throw new Error('rollback volontaire');
        });
      } catch (error) {
        assert((error as Error).message === 'rollback volontaire', 'rollback attendu');
      }
      assert((await harness.database.query<{ nonce: string }>('SELECT nonce FROM salary_confirmations WHERE payment_id=$1', [seed.salaryPaymentId])).rows[0].nonce !== 'temporary', 'preuve inchangée après rollback');
      const current = (await harness.database.query<{ amount: string; period_key: string }>('SELECT amount, period_key FROM payments WHERE id=$1', [seed.salaryPaymentId])).rows[0];
      assert(Number(current.amount) === Number(original.amount) && current.period_key === original.period_key, 'rollback rétablit le paiement');
    });

    await check('P0-SALARY-1 audit durable des OTP refusés, nonce, expiration et tiers', async () => {
      const path = `/api/v1/payments/${seed.salaryPaymentId}/salary-confirmation`;
      const nonce = (await harness.database.query<{ nonce: string }>('SELECT nonce FROM salary_confirmations WHERE payment_id=$1', [seed.salaryPaymentId])).rows[0].nonce;
      const otp = salaryOtps.get(seed.salaryPaymentId)!;
      const third = await post(harness, path, employerToken, 'salary-third-1', { otp, nonce });
      assert(third.status !== 200, 'employeur non candidat refusé');
      const bad = await post(harness, path, candidateToken, 'salary-bad-1', { otp: otp === '000000' ? '999999' : '000000', nonce });
      assert(bad.status !== 200, 'OTP invalide refusé');
      const badNonce = await post(harness, path, candidateToken, 'salary-nonce-1', { otp, nonce: 'bad' });
      assert(badNonce.status !== 200, 'nonce invalide refusé');
      await harness.database.query("UPDATE salary_confirmations SET expires_at = now() - interval '1 minute' WHERE payment_id=$1", [seed.salaryPaymentId]);
      const expired = await post(harness, path, candidateToken, 'salary-expired-1', { otp, nonce });
      assert(expired.status !== 200, 'OTP expiré refusé');
      const actions = (await harness.database.query<{ action: string }>('SELECT action FROM automation_audit_ledger WHERE entity_id=$1', [seed.salaryPaymentId])).rows.map(row => row.action);
      assert(actions.includes('OTP_REJECTED') && actions.includes('OTP_EXPIRED') && actions.includes('SALARY_CONFIRMATION_CONFLICT'), 'audits conservés après rollback métier');
      await harness.database.query("UPDATE salary_confirmations SET expires_at = now() + interval '10 minutes' WHERE payment_id=$1", [seed.salaryPaymentId]);
    });

    await check('P0-SALARY-1 confirmation concurrente, rejeu, OTP/nonce non réutilisable, rollback', async () => {
      const path = `/api/v1/payments/${seed.salaryPaymentId}/salary-confirmation`;
      const nonce = (await harness.database.query<{ nonce: string }>('SELECT nonce FROM salary_confirmations WHERE payment_id=$1', [seed.salaryPaymentId])).rows[0].nonce;
      const otp = salaryOtps.get(seed.salaryPaymentId)!;
      const [first, second] = await Promise.all([
        post(harness, path, candidateToken, 'salary-confirm-1', { otp, nonce }),
        post(harness, path, candidateToken, 'salary-confirm-2', { otp, nonce }),
      ]);
      assert([first.status, second.status].includes(200), 'une confirmation réussit');
      assert([first.status, second.status].some(status => status !== 200), 'l’autre confirmation est refusée');
      const replay = await post(harness, path, candidateToken, 'salary-confirm-1', { otp, nonce });
      assert(replay.status === 200, 'même clé, même payload : résultat stable');
      const conflict = await post(harness, path, candidateToken, 'salary-confirm-1', { otp: '999999', nonce });
      assert(conflict.status !== 200, 'même clé et payload différent refusés');
      const reused = await post(harness, path, candidateToken, 'salary-confirm-3', { otp, nonce });
      assert(reused.status !== 200, 'nonce et OTP consommés');
      const count = await harness.database.query('SELECT payment_id FROM salary_confirmations WHERE confirmed_at IS NOT NULL');
      assert(count.rows.length === 1, 'une seule preuve persistante');
      const events = await readPaymentOutbox(harness, seed.salaryPaymentId);
      assert(events.filter(row => row.event_type === 'SALARY_CONFIRMED').length === 1, 'un seul événement logique');
    });

    /* ---------------- 9. Rejet motivé et régularisation ---------------- */

    await check('P0-PAY-1 Rejet: motif obligatoire, preuve précédente conservée, état REJECTED', async () => {
      const withoutReason = await post(harness, `/api/v1/admin/payments/${seed.feePaymentId}/reject`, adminToken, 'p0pay-reject-noreason-01', {});
      assert(withoutReason.status === 400, `400 attendu sans motif, reçu ${withoutReason.status}`);

      // Une déclaration de commission doit d'abord exister pour être rejetée.
      const declared = await post(harness, '/api/v1/payments/commission-declarations', employerToken, 'p0pay-fee-declare-001', {
        paymentId: seed.feePaymentId, reference: 'WAVE-FEE-0001', amount: 43_750, currency: 'FCFA',
      });
      assert(declared.status === 201, `201 attendu pour la commission, reçu ${declared.status}`);
      const declaredView = await jsonOf<PaymentView>(declared);
      assert(declaredView.paymentType === 'PLATFORM_FEE', 'nature lue sur la ligne visée');
      assert(declaredView.status === 'PENDING_VERIFICATION', 'commission passée en attente de vérification');

      const rejected = await post(harness, `/api/v1/admin/payments/${seed.feePaymentId}/reject`, adminToken, 'p0pay-fee-reject-0001', {
        reason: 'Référence illisible : reprise demandée.',
      });
      assert(rejected.status === 200, `200 attendu, reçu ${rejected.status}`);
      const view = await jsonOf<PaymentView>(rejected);
      assert(view.status === 'REJECTED' && view.rejected, 'REJECTED posé');
      assert(view.rejectionReason === 'Référence illisible : reprise demandée.', 'motif conservé sur le paiement');

      const declarations = await readDeclarations(harness, seed.feePaymentId);
      assert(declarations.length === 1, 'la preuve rejetée reste en base (aucune suppression)');
      assert(declarations[0].outcome === 'REJECTED', 'tentative marquée rejetée');
      assert(declarations[0].rejection_reason === 'Référence illisible : reprise demandée.', 'motif tracé sur la tentative');

      const events = await readPaymentOutbox(harness, seed.feePaymentId);
      assert(events.some(row => row.event_type === 'PAYMENT_REJECTED'), 'événement PAYMENT_REJECTED produit');
      const rejectedEvent = events.find(row => row.event_type === 'PAYMENT_REJECTED')!;
      const payload = stateOf(rejectedEvent.payload);
      assert(payload.reason === 'Référence illisible : reprise demandée.', 'motif porté par l’événement');
      assert(payload.regularization === 'nouvelle déclaration attendue', 'régularisation annoncée');

      // REJECTED → PAID interdit : la régularisation passe par une NOUVELLE déclaration.
      const payRejected = await post(harness, `/api/v1/admin/payments/${seed.feePaymentId}/confirm`, adminToken, 'p0pay-fee-confirm-0001', {});
      assert(payRejected.status === 409, `REJECTED → PAID refusé, reçu ${payRejected.status}`);
    });

    await check('P0-PAY-1 Régularisation: même référence refusée, nouvelle déclaration admise en tentative 2', async () => {
      const sameReference = await post(harness, '/api/v1/payments/commission-declarations', employerToken, 'p0pay-fee-same-ref-01', {
        paymentId: seed.feePaymentId, reference: 'WAVE-FEE-0001',
      });
      assert(sameReference.status === 422, `422 attendu pour une référence déjà rejetée, reçu ${sameReference.status}`);

      const regularized = await post(harness, '/api/v1/payments/commission-declarations', employerToken, 'p0pay-fee-new-ref-001', {
        paymentId: seed.feePaymentId, reference: 'WAVE-FEE-0002', proofNote: 'Seconde transmission après contrôle.',
      });
      assert(regularized.status === 201, `201 attendu pour la régularisation, reçu ${regularized.status}`);
      const view = await jsonOf<PaymentView>(regularized);
      assert(view.status === 'PENDING_VERIFICATION', 'retour en attente de vérification');
      assert(view.declarationCount === 2, 'compteur de tentatives = 2');
      assert(view.declarations.length === 2, 'les deux tentatives sont lisibles');
      assert(view.declarations[0].outcome === 'REJECTED', 'tentative 1 conservée en rejet');
      assert(view.declarations[1].attemptNumber === 2, 'tentative 2 ajoutée (jamais écrasée)');

      const events = await readPaymentOutbox(harness, seed.feePaymentId);
      assert(events.filter(row => row.event_type === 'PAYMENT_DECLARED').length === 2,
        'une régularisation produit son propre événement (clé paymentId + tentative)');
      const ledgerRow = await harness.database.query<{ commission_ledger: unknown; commission_status: string; commission_percentage: string | number }>(
        'SELECT commission_ledger, commission_status, commission_percentage FROM contracts WHERE id = $1', [seed.contractId],
      );
      assert(Number(ledgerRow.rows[0].commission_percentage) === 25, 'commission_percentage du contrat restée à 25');
      assert(ledgerRow.rows[0].commission_status === 'PENDING_VERIFICATION', 'vue de commission du contrat alignée');
      const ledger = itemsOf(ledgerRow.rows[0].commission_ledger);
      assert(ledger.length >= 1 && Number(ledger[0].percentage) === 25, 'grand livre conservé, pourcentage du modèle intact');
    });

    /* ---------------- 10. Concurrence ---------------- */

    await check('P0-PAY-1 Concurrence: deux déclarations simultanées ne produisent qu’une seule tentative', async () => {
      const contractId = (await seedActiveContract(harness, employerId, candidateId)).contractId;
      await harness.payments!.materializePaymentsForContract(contractId);
      const rows0 = await readPayments(harness, contractId);
      const paymentId = String(rows0.find(row => row.payment_type === 'SALARY' && Number(row.month_number) === 1)!.id);
      const rows = await readPayments(harness, contractId);
      assert(rows.length === 3, 'paiements du second contrat materialisés');
      await harness.automationWorker!.runDuePayments(50);

      const [first, second] = await Promise.all([
        post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-race-a-0000001', {
          paymentId, reference: 'RACE-A-0001',
        }),
        post(harness, '/api/v1/payments/salary-declarations', employerToken, 'p0pay-race-b-0000001', {
          paymentId, reference: 'RACE-B-0001',
        }),
      ]);
      const statuses = [first.status, second.status].sort();
      assert(statuses[0] === 201, `une déclaration acceptée, reçues ${statuses.join('/')}`);
      assert(statuses[1] === 409, `la seconde refusée par la transition concurrente, reçues ${statuses.join('/')}`);
      const declarations = await readDeclarations(harness, paymentId);
      assert(declarations.length === 1, `une seule tentative, reçues ${declarations.length}`);
      const payment = await harness.database.query<{ status: string; declaration_count: number }>(
        'SELECT status, declaration_count FROM payments WHERE id = $1', [paymentId],
      );
      assert(payment.rows[0].status === 'PENDING_VERIFICATION', 'état cohérent après concurrence');
      assert(Number(payment.rows[0].declaration_count) === 1, 'compteur exact malgré la concurrence');
    });

    /* ---------------- 11. Rollback ---------------- */

    await check('P0-PAY-1 Rollback: une transaction annulée ne laisse AUCUNE ligne de paiement ni déclaration', async () => {
      const rollbackSeed = await seedActiveContract(harness, employerId, candidateId);
      const contractId = rollbackSeed.contractId;
      const stores = createSqlPaymentStores(harness.database);
      let failed = false;
      try {
        await harness.database.run(async transaction => {
          const scoped = createSqlPaymentStores(transaction);
          await scoped.payments.createIfAbsent({
            paymentId: rollbackSeed.salaryPaymentId,
            contractId,
            employerId,
            candidateId,
            paymentType: 'SALARY',
            scheduleEntryId: `PSE-${contractId}-M1`,
            monthNumber: 1,
            periodKey: 'Mois 01',
            amount: 131_250,
            currency: 'FCFA',
            scheduledAt: SEED_TIMESTAMP,
            dueAt: SALARY_DUE_AT,
            status: 'SCHEDULED',
            idempotencyKey: `${contractId}:SALARY:M1`,
            createdAt: SEED_TIMESTAMP,
            updatedAt: SEED_TIMESTAMP,
          });
          await scoped.declarations.create({
            declarationId: `pdl_${rollbackSeed.salaryPaymentId}_A1`,
            paymentId: rollbackSeed.salaryPaymentId,
            contractId,
            periodKey: 'Mois 01',
            paymentType: 'SALARY',
            attemptNumber: 1,
            amount: 131_250,
            currency: 'FCFA',
            reference: 'ROLLBACK-0001',
            submittedAt: SEED_TIMESTAMP,
            submittedBy: employerId,
            outcome: 'PENDING',
            idempotencyKey: `${employerId}:payments.DECLARE:rollback-0001`,
            createdAt: SEED_TIMESTAMP,
            updatedAt: SEED_TIMESTAMP,
          });
          throw new Error('échec volontaire');
        });
      } catch (error) {
        failed = String((error as Error).message).includes('échec volontaire');
      }
      assert(failed, 'la transaction a bien été annulée');
      assert(stores.payments !== undefined, 'stores construits hors transaction (lecture seule ici)');
      const payments = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payments WHERE contract_id = $1', [contractId],
      );
      const declarations = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations WHERE contract_id = $1', [contractId],
      );
      assert(Number(payments.rows[0].count) === 0, 'aucune ligne payments résiduelle');
      assert(Number(declarations.rows[0].count) === 0, 'aucune ligne payment_declarations résiduelle');
      await harness.database.query('DELETE FROM payments WHERE contract_id = $1', [contractId]);
      await harness.database.query('DELETE FROM contracts WHERE id = $1', [contractId]);
    });

    /* ---------------- 12. Contraintes SQL du cycle ---------------- */

    await check('P0-PAY-1 Contraintes: PAID exige verified_at, REJECTED exige un motif, unicité par période', async () => {
      let violation = '';
      try {
        await harness.database.query(
          `INSERT INTO payments (id, contract_id, employer_id, candidate_id, payment_type, schedule_entry_id,
                                 month_number, period_key, amount, currency, scheduled_at, due_at, status,
                                 idempotency_key, created_at, updated_at)
           VALUES ('pay_check_paid','${seed.contractId}','${employerId}','${candidateId}','SALARY','PSE-check-M9',9,'Mois 09',
                   1000,'FCFA',now(),now(),'PAID','check:paid:m9',now(),now())`,
        );
      } catch (error) {
        violation = String((error as Error).message);
      }
      assert(violation.includes('payments_paid_requires_verification'), `PAID sans vérification doit être refusé par SQL, reçu « ${violation} »`);

      violation = '';
      try {
        await harness.database.query(
          `INSERT INTO payments (id, contract_id, employer_id, candidate_id, payment_type, schedule_entry_id,
                                 month_number, period_key, amount, currency, scheduled_at, due_at, status,
                                 idempotency_key, created_at, updated_at)
           VALUES ('pay_check_rejected','${seed.contractId}','${employerId}','${candidateId}','SALARY','PSE-check-M8',8,'Mois 08',
                   1000,'FCFA',now(),now(),'REJECTED','check:rejected:m8',now(),now())`,
        );
      } catch (error) {
        violation = String((error as Error).message);
      }
      assert(violation.includes('payments_rejected_requires_reason'), `REJECTED sans motif doit être refusé par SQL, reçu « ${violation} »`);

      violation = '';
      try {
        await harness.database.query(
          `INSERT INTO payments (id, contract_id, employer_id, candidate_id, payment_type, schedule_entry_id,
                                 month_number, period_key, amount, currency, scheduled_at, due_at, status,
                                 idempotency_key, created_at, updated_at)
           VALUES ('pay_check_dup','${seed.contractId}','${employerId}','${candidateId}','SALARY','PSE-dup-M1',1,'Mois 01',
                   1000,'FCFA',now(),now(),'SCHEDULED','check:dup:m1',now(),now())`,
        );
      } catch (error) {
        violation = String((error as Error).message);
      }
      assert(violation.includes('payments_contract_period_unique_idx'), `un second paiement par période doit être refusé, reçu « ${violation} »`);
    });

    /* ---------------- 13. Lectures et périmètre ---------------- */

    await check('P0-PAY-1 Lectures: chaque partie ne voit que ce qui la concerne, l’ADMIN voit tout', async () => {
      const mine = await get(harness, '/api/v1/my/payments?limit=10', employerToken);
      assert(mine.status === 200, `200 attendu, reçu ${mine.status}`);
      const employerPage = await jsonOf<{ items: PaymentView[]; limit: number; hasMore: boolean }>(mine);
      assert(employerPage.limit === 10, 'limite respectée');
      assert(employerPage.items.length === 6, `6 paiements pour les deux contrats, reçus ${employerPage.items.length}`);
      assert(employerPage.items.every(item => item.employerId === employerId), 'aucun paiement étranger');

      const candidatePage = await jsonOf<{ items: PaymentView[] }>(await get(harness, '/api/v1/my/payments', candidateToken));
      assert(candidatePage.items.length > 0, 'le salarié voit ses paiements');
      assert(candidatePage.items.every(item => item.paymentType === 'SALARY'), 'le salarié ne voit que ses salaires');
      assert(candidatePage.items.every(item => item.status === 'PAID' || item.status === 'PENDING_VERIFICATION' || item.status === 'DUE' || item.status === 'SCHEDULED' || item.status === 'VERIFIED'),
        'aucun statut inventé dans la projection');

      const other = await get(harness, `/api/v1/payments/${seed.salaryPaymentId}`, otherHarnessEmployees.employerToken);
      assert(other.status === 403, `403 attendu pour un tiers, reçu ${other.status}`);

      const single = await jsonOf<PaymentView>(await get(harness, `/api/v1/payments/${seed.salaryPaymentId}`, employerToken));
      assert(single.paymentId === seed.salaryPaymentId && single.declarations.length === 1, 'lecture unitaire avec ses tentatives');

      const contractPayments = await jsonOf<{ items: PaymentView[] }>(
        await get(harness, `/api/v1/contracts/${seed.contractId}/payments`, employerToken),
      );
      assert(contractPayments.items.length === 3, `3 paiements pour ce contrat, reçus ${contractPayments.items.length}`);

      const adminList = await jsonOf<{ items: PaymentView[] }>(await get(harness, '/api/v1/admin/payments?limit=20', adminToken));
      assert(adminList.items.length >= 6, 'la file ADMIN couvre tous les paiements');
      const adminAsEmployer = await get(harness, '/api/v1/admin/payments', employerToken);
      assert(adminAsEmployer.status === 403, `file ADMIN refusée à un employeur, reçu ${adminAsEmployer.status}`);
    });

    await check('P0-PAY-1 Périmètre: aucune table de fournisseur, aucun canal, aucun job pré-échéance non configuré', async () => {
      const tables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%provider%' OR table_name ILIKE '%webhook%'
                 OR table_name ILIKE '%mobile_money%' OR table_name ILIKE '%otp%'
                 OR table_name ILIKE '%aggregator%' OR table_name ILIKE '%notification%'
                 OR table_name ILIKE '%sms%' OR table_name ILIKE '%kyc%')`,
      );
      assert(tables.rows.length === 0, `aucune table de paiement réel ni de canal, reçues ${tables.rows.map(row => row.table_name).join(', ')}`);

      const jobs = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_jobs WHERE job_type = $1',
        [PAYMENT_PRE_DUE_JOB_TYPE],
      );
      assert(Number(jobs.rows[0].count) === 0, 'aucun rappel pré-échéance armé sans configuration de l’exploitant');

      // Un `PAID` ne peut reposer QUE sur une décision locale tracée : aucune
      // ligne ne peut prétendre à une confirmation de fournisseur.
      const paidRows = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM payments WHERE status = 'PAID' AND (verified_at IS NULL OR verified_by IS NULL)",
      );
      assert(Number(paidRows.rows[0].count) === 0, 'tout paiement PAID resulte d’une vérification locale tracée');
      const claimed = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM payments
          WHERE external_transaction_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM payment_declarations AS d
               WHERE d.payment_id = payments.id AND d.external_transaction_id = payments.external_transaction_id
            )`,
      );
      assert(Number(claimed.rows[0].count) === 0,
        'aucun identifiant externe inventé : il provient toujours d’une déclaration déposée');
      const providerTables = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND column_name ~* '(settlement|payout|webhook_secret|momo|paystack|flutterwave|api_key)'`,
      );
      assert(Number(providerTables.rows[0].count) === 0, 'aucune colonne de fournisseur réel dans le cycle');
    });

    await check('P0-PAY-1 Frontière fournisseur: verifyTransaction, handleWebhook et reconcile refusent (NOT_IMPLEMENTED)', async () => {
      const adapter = createUnconfiguredPaymentProviderAdapter('MTN_MOMO');
      for (const call of [
        () => adapter.verifyTransaction({
          externalTransactionId: 'EXT-1', reference: 'R-1', amount: 1, currency: 'FCFA',
          payer: employerId, recipient: candidateId, timestamp: SEED_TIMESTAMP,
        }),
        () => adapter.handleWebhook({ signature: 'absent', payload: {} }),
        () => adapter.reconcile({ paymentId: seed.salaryPaymentId, asOf: SEED_TIMESTAMP }),
      ]) {
        let code = '';
        try {
          await call();
        } catch (error) {
          code = String((error as { code?: string }).code ?? '');
        }
        assert(code === 'NOT_IMPLEMENTED', `la frontière doit refuser (NOT_IMPLEMENTED attendu), reçu « ${code} »`);
      }
    });

    /* ---------------- P0-PAY-3 batch/review/correction/retry ---------------- */

    await check('P0-PAY-3 Batch: résultats normalisés, idempotence, duplicate guard, revue et correction traçable', async () => {
      const reconciliationSeed = await seedActiveContract(harness, employerId, candidateId);
      await harness.payments!.materializePaymentsForContract(reconciliationSeed.contractId);
      const references = {
        matched: `RECON-MATCH-${reconciliationSeed.contractId}`,
        mismatch: `RECON-MISMATCH-${reconciliationSeed.contractId}`,
        review: `RECON-REVIEW-${reconciliationSeed.contractId}`,
      };
      await harness.database.query('UPDATE payments SET reference = $2 WHERE id = $1', [reconciliationSeed.salaryPaymentId, references.matched]);
      await harness.database.query('UPDATE payments SET reference = $2 WHERE id = $1', [reconciliationSeed.feePaymentId, references.mismatch]);
      await harness.database.query('UPDATE payments SET reference = $2 WHERE id = $1', [reconciliationSeed.secondMonthSalaryPaymentId, references.review]);

      const at = harness.clock.value.toISOString();
      const matched = {
        provider: 'test_gateway', externalTransactionId: `EXT-MATCH-${reconciliationSeed.contractId}`,
        reference: references.matched, amount: 131_250, currency: 'FCFA', payer: employerId,
        recipient: candidateId, occurredAt: at, status: 'SUCCESS', rawPayload: { secret: 'do-not-persist' },
      };
      const mismatch = {
        provider: 'TEST_GATEWAY', externalTransactionId: `EXT-MISMATCH-${reconciliationSeed.contractId}`,
        reference: references.mismatch, amount: 43_749, currency: 'FCFA', payer: employerId,
        recipient: 'LE_LABEUR', occurredAt: at, status: 'SUCCESS',
      };
      const reviewRequired = {
        provider: 'TEST_GATEWAY', externalTransactionId: `EXT-REVIEW-${reconciliationSeed.contractId}`,
        reference: references.review, amount: 175_000, currency: 'FCFA', payer: employerId,
        recipient: candidateId, occurredAt: at, status: 'PENDING',
      };
      const notFound = {
        provider: 'TEST_GATEWAY', externalTransactionId: `EXT-NOT-FOUND-${reconciliationSeed.contractId}`,
        reference: `NO-PAYMENT-${reconciliationSeed.contractId}`, amount: 500, currency: 'FCFA',
        payer: employerId, recipient: candidateId, occurredAt: at, status: 'SUCCESS',
      };

      const response = await post(harness, '/api/v1/admin/payment-reconciliation/batches', adminToken, 'p0pay3-batch-create-0001', {
        provider: 'TEST_GATEWAY', transactions: [matched, mismatch, reviewRequired, notFound, matched],
      });
      assert(response.status === 201, `201 pour le premier batch, reçu ${response.status}: ${JSON.stringify(await jsonOf(response.clone()))}`);
      const report = await jsonOf<{
        batch: { batchId: string; status: string; matchedItems: number; mismatchedItems: number; notFoundItems: number; duplicateItems: number; reviewItems: number };
        items: Array<{ itemIndex: number; status: string; reviewId?: string; normalizedMetadata: Record<string, unknown> }>;
      }>(response);
      const summaryProbe = await harness.database.query<{ status: string; count: string }>(
        'SELECT status, count(*)::text AS count FROM payment_reconciliation_batch_items WHERE batch_id = $1 GROUP BY status ORDER BY status',
        [report.batch.batchId],
      );
      assert(report.batch.status === 'COMPLETED', `batch terminé, reçu ${JSON.stringify({ batch: report.batch, items: report.items.map(item => item.status), db: summaryProbe.rows })}`);
      assert(report.batch.matchedItems === 1 && report.batch.mismatchedItems === 1
        && report.batch.notFoundItems === 1 && report.batch.duplicateItems === 1 && report.batch.reviewItems === 1,
      `compteurs par verdict exacts: ${JSON.stringify(report.batch)}`);
      assert(report.items.map(item => item.status).join(',') === 'MATCH,MISMATCH,REVIEW_REQUIRED,NOT_FOUND,DUPLICATE',
        `ordre/verdicts conservés: ${report.items.map(item => item.status).join(',')}`);
      assert(!JSON.stringify(report.items[0].normalizedMetadata).includes('do-not-persist'), 'rawPayload sensible omis des métadonnées persistées');
      assert(report.items[1].reviewId && report.items[2].reviewId, 'MISMATCH et REVIEW_REQUIRED ouvrent une revue ADMIN');
      const paymentAfter = await harness.database.query<{ id: string; status: string }>(
        'SELECT id, status FROM payments WHERE id = ANY($1::text[]) ORDER BY id',
        [[reconciliationSeed.salaryPaymentId, reconciliationSeed.feePaymentId, reconciliationSeed.secondMonthSalaryPaymentId]],
      );
      assert(paymentAfter.rows.every(row => row.status === 'SCHEDULED'), 'MATCH externe ne transitionne aucun paiement vers VERIFIED/PAID');
      const settlements = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_external_settlements WHERE provider = $1', ['TEST_GATEWAY'],
      );
      assert(Number(settlements.rows[0].count) === 4, 'duplicate externe conservé comme résultat sans second settlement');

      const replay = await post(harness, '/api/v1/admin/payment-reconciliation/batches', adminToken, 'p0pay3-batch-create-0001', {
        provider: 'TEST_GATEWAY', transactions: [matched, mismatch, reviewRequired, notFound, matched],
      });
      assert(replay.status === 200, `rejeu de batch retourne 200, reçu ${replay.status}`);
      const replayBody = await jsonOf<{ batch: { batchId: string }; replayed: boolean }>(replay);
      assert(replayBody.replayed && replayBody.batch.batchId === report.batch.batchId, 'même lot retourné sur rejeu idempotent');
      const conflict = await post(harness, '/api/v1/admin/payment-reconciliation/batches', adminToken, 'p0pay3-batch-create-0001', {
        provider: 'TEST_GATEWAY', transactions: [notFound],
      });
      assert(conflict.status === 409, `charge différente sous la même clé refusée (409), reçu ${conflict.status}`);
      const unconfigured = await post(harness, '/api/v1/admin/payment-reconciliation/batches', adminToken, 'p0pay3-provider-none-0001', {
        provider: 'UNCONFIGURED_PROVIDER', transactions: [],
      });
      assert(unconfigured.status === 501, `provider sans adaptateur refusé (501), reçu ${unconfigured.status}`);
      const forbidden = await post(harness, '/api/v1/admin/payment-reconciliation/batches', employerToken, 'p0pay3-employer-denied-01', {
        provider: 'TEST_GATEWAY', transactions: [],
      });
      assert(forbidden.status === 403, `seul ADMIN peut importer un batch (403), reçu ${forbidden.status}`);

      const correctionResponse = await post(
        harness,
        `/api/v1/admin/payment-reconciliation/reviews/${report.items[1].reviewId}/correction-attempts`,
        adminToken,
        'p0pay3-correction-attempt-01',
        { proposedChanges: { amount: 43_750 }, evidenceReference: 'evidence:receipt-42', note: 'Valeur proposée à examiner.' },
      );
      assert(correctionResponse.status === 201, `tentative de correction enregistrée (201), reçu ${correctionResponse.status}`);
      const correction = await jsonOf<{ correctionAttempt: { correctionAttemptId: string; status: string; proposedChanges: Record<string, unknown> } }>(correctionResponse);
      assert(correction.correctionAttempt.status === 'RECORDED' && correction.correctionAttempt.proposedChanges.amount === 43_750,
        'la correction proposée est conservée append-only');
      const correctionReplay = await post(
        harness,
        `/api/v1/admin/payment-reconciliation/reviews/${report.items[1].reviewId}/correction-attempts`,
        adminToken,
        'p0pay3-correction-attempt-01',
        { proposedChanges: { amount: 43_750 }, evidenceReference: 'evidence:receipt-42', note: 'Valeur proposée à examiner.' },
      );
      assert(correctionReplay.status === 200, `rejeu de correction retourne 200, reçu ${correctionReplay.status}`);
      const correctionReplayBody = await jsonOf<{ correctionAttempt: { correctionAttemptId: string }; replayed: boolean }>(correctionReplay);
      assert(correctionReplayBody.replayed && correctionReplayBody.correctionAttempt.correctionAttemptId === correction.correctionAttempt.correctionAttemptId,
        'la même tentative n’est jamais dupliquée');
      const invalidCorrection = await post(
        harness,
        `/api/v1/admin/payment-reconciliation/reviews/${report.items[1].reviewId}/correction-attempts`,
        adminToken,
        'p0pay3-correction-invalid-01',
        { proposedChanges: { provider: 'UNSAFE' } },
      );
      assert(invalidCorrection.status === 400, `champ de correction hors liste refusé (400), reçu ${invalidCorrection.status}`);
      const immutableSource = await harness.database.query<{ amount: string; reconciliation_status: string }>(
        'SELECT amount::text, reconciliation_status FROM payment_external_settlements WHERE external_transaction_id = $1',
        [mismatch.externalTransactionId],
      );
      assert(Number(immutableSource.rows[0].amount) === mismatch.amount && immutableSource.rows[0].reconciliation_status === 'MISMATCH',
        'la tentative ne réécrit ni la preuve externe ni le verdict');

      const decisionResponse = await post(
        harness,
        `/api/v1/admin/payment-reconciliation/reviews/${report.items[2].reviewId}/decision`,
        adminToken,
        'p0pay3-review-decision-01',
        { decision: 'CONFIRMED', evidence: 'evidence:confirmed-1', note: 'Revue manuelle.' },
      );
      assert(decisionResponse.status === 200, `décision ADMIN enregistrée, reçu ${decisionResponse.status}`);
      const reviewDecision = await jsonOf<{ review: { decision: string; actorId?: string }; replayed?: boolean }>(decisionResponse);
      assert(reviewDecision.review.decision === 'CONFIRMED' && reviewDecision.review.actorId, 'décision de revue porte acteur ADMIN');
      const unchanged = await harness.database.query<{ status: string }>(
        'SELECT status FROM payments WHERE id = $1', [reconciliationSeed.secondMonthSalaryPaymentId],
      );
      assert(unchanged.rows[0].status === 'SCHEDULED', 'confirmation de revue ne marque pas le paiement comme reçu/PAID');
    });

    await check('P0-PAY-3 Concurrence: deux POST identiques partagent un batch, un item et un seul règlement', async () => {
      const input = {
        provider: 'TEST_GATEWAY',
        transactions: [{
          provider: 'TEST_GATEWAY', externalTransactionId: 'EXT-CONCURRENT-BATCH-1', reference: 'REF-CONCURRENT-BATCH-1',
          amount: 100, currency: 'FCFA', payer: employerId, recipient: candidateId,
          occurredAt: harness.clock.value.toISOString(), status: 'SUCCESS',
        }],
      };
      const [left, right] = await Promise.all([
        post(harness, '/api/v1/admin/payment-reconciliation/batches', adminToken, 'p0pay3-concurrent-batch-1', input),
        post(harness, '/api/v1/admin/payment-reconciliation/batches', adminToken, 'p0pay3-concurrent-batch-1', input),
      ]);
      assert([left.status, right.status].every(status => status === 200 || status === 201),
        `deux demandes concurrentes terminent idempotemment: ${left.status}/${right.status}`);
      const leftBody = await jsonOf<{ batch: { batchId: string } }>(left);
      const rightBody = await jsonOf<{ batch: { batchId: string } }>(right);
      assert(leftBody.batch.batchId === rightBody.batch.batchId, 'un identifiant de batch gagne la course');
      const counts = await harness.database.query<{ batches: string; items: string; settlements: string }>(
        `SELECT
           (SELECT count(*)::text FROM payment_reconciliation_batches WHERE provider = 'TEST_GATEWAY' AND batch_key = $1) AS batches,
           (SELECT count(*)::text FROM payment_reconciliation_batch_items WHERE batch_id = $2) AS items,
           (SELECT count(*)::text FROM payment_external_settlements WHERE provider = 'TEST_GATEWAY' AND external_transaction_id = 'EXT-CONCURRENT-BATCH-1') AS settlements`,
        ['p0pay3-concurrent-batch-1', leftBody.batch.batchId],
      );
      assert(counts.rows[0].batches === '1' && counts.rows[0].items === '1' && counts.rows[0].settlements === '1',
        `unicité batch/item/settlement: ${JSON.stringify(counts.rows[0])}`);
    });

    await check('P0-PAY-3 Rollback/reprise: échec atomique devient RETRYABLE puis le worker termine le même item', async () => {
      const retrySeed = await seedActiveContract(harness, employerId, candidateId);
      await harness.payments!.materializePaymentsForContract(retrySeed.contractId);
      const retryReference = `RECON-RETRY-${retrySeed.contractId}`;
      await harness.database.query('UPDATE payments SET reference = $2 WHERE id = $1', [retrySeed.salaryPaymentId, retryReference]);
      let failFirstMatchAudit = true;
      const makeFaultStores = (executor: Parameters<typeof createSqlPaymentReconciliationStores>[0]): PaymentReconciliationStores => {
        const automation = createSqlAutomationStores(executor);
        const base = createSqlPaymentReconciliationStores(executor, {
          audit: automation.audit,
          idempotency: automation.idempotency,
          outbox: automation.outbox,
          jobs: automation.jobs,
        });
        return {
          ...base,
          audit: {
            ...base.audit,
            append: async entry => {
              if (failFirstMatchAudit && entry.action === 'PAYMENT_RECONCILIATION_MATCHED') {
                failFirstMatchAudit = false;
                throw new Error('injected transactional audit failure');
              }
              return base.audit.append(entry);
            },
          },
        };
      };
      const faultService = createPaymentReconciliationBatchService({
        stores: makeFaultStores(harness.database),
        runInTransaction: <T>(operation: (stores: PaymentReconciliationStores) => Promise<T>): Promise<T> =>
          harness.database.run(executor => operation(makeFaultStores(executor))),
        now: () => harness.clock.value,
        retryDelayMs: 1_000,
      });
      const transaction = {
        provider: 'TEST_GATEWAY', externalTransactionId: `EXT-RETRY-${retrySeed.contractId}`,
        reference: retryReference, amount: 131_250, currency: 'FCFA', payer: employerId,
        recipient: candidateId, occurredAt: harness.clock.value.toISOString(), status: 'SUCCESS',
      };
      const firstRun = await faultService.reconcileBatch(
        { id: 'test-admin', role: 'ADMIN', sessionId: 'session-test', permissions: ['payments:read:any'] },
        { provider: 'TEST_GATEWAY', transactions: [transaction], idempotencyKey: 'p0pay3-retry-batch-0001' },
      );
      assert(firstRun.batch.status === 'PARTIAL' && firstRun.batch.retryableItems === 1, `échec réessayable visible: ${JSON.stringify(firstRun.batch)}`);
      assert(firstRun.items[0].status === 'RETRYABLE', 'item conservé pour reprise durable');
      const rolledBack = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_external_settlements WHERE provider = $1 AND external_transaction_id = $2',
        ['TEST_GATEWAY', transaction.externalTransactionId],
      );
      assert(rolledBack.rows[0].count === '0', 'transaction item en erreur a annulé ledger/resultat/audit partiel');
      const scheduled = await harness.database.query<{ job_id: string; due_at: unknown; status: string }>(
        'SELECT job_id, due_at, status FROM automation_jobs WHERE job_type = $1 AND aggregate_id = $2',
        [PAYMENT_RECONCILIATION_RETRY_JOB, firstRun.batch.batchId],
      );
      assert(scheduled.rows.length === 1 && scheduled.rows[0].status === 'PENDING', 'retry durable dans automation_jobs');

      harness.clock.value = new Date(harness.clock.value.getTime() + 1_001);
      const workerReport = await harness.automationWorker!.runDueJobs(25);
      assert(workerReport.completed >= 1, 'worker existant a consommé le job de reprise');
      const completed = await harness.database.query<{ status: string; attempts: number }>(
        `SELECT item.status, item.attempts
           FROM payment_reconciliation_batch_items AS item
          WHERE item.batch_id = $1`, [firstRun.batch.batchId],
      );
      assert(completed.rows[0].status === 'MATCH' && Number(completed.rows[0].attempts) === 2,
        `le même item a été repris une fois: ${JSON.stringify(completed.rows[0])}`);
      const jobAfter = await harness.database.query<{ status: string }>(
        'SELECT status FROM automation_jobs WHERE job_id = $1', [scheduled.rows[0].job_id],
      );
      assert(jobAfter.rows[0].status === 'COMPLETED', 'job de reprise clôturé par le worker existant');
      const batchAfter = await harness.database.query<{ status: string; retryable_items: number }>(
        'SELECT status, retryable_items FROM payment_reconciliation_batches WHERE id = $1', [firstRun.batch.batchId],
      );
      assert(batchAfter.rows[0].status === 'COMPLETED' && Number(batchAfter.rows[0].retryable_items) === 0,
        'compteurs et statut du batch recalculés après reprise');
    });

    await check('P0-PAY-1 Séparation DEMO/API: le mode mémoire ne branch AUCUN cycle paiement', async () => {
      const memory = composeWorker({ GOOGLE_CLIENT_ID: 'test-offers-audience', PERSISTENCE: 'memory' });
      assert(memory.payments === undefined, 'aucun repository de paiement en mode mémoire');
      const memoryDeclaration = await memory.worker.fetch(authRequest('/api/v1/payments/salary-declarations', null, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0pay-memory-000001' },
        body: '{}',
      }));
      // Sans base durable, la route ne peut être servie : refus d'authentification
      // ou 501 explicite — jamais un cycle paiement en mémoire.
      assert(memoryDeclaration.status === 401 || memoryDeclaration.status === 501,
        `le mode mémoire ne sert aucun cycle paiement (401/501 attendus, reçu ${memoryDeclaration.status})`);
      assert(memory.paymentCycle?.available === false, 'le cycle est explicitement indisponible sans base durable');
      assert(memory.paymentCycle.preDueConfigured === false, 'aucune avance de rappel configurée');
      assert(/par défaut/.test(memory.paymentCycle?.preDueDetail ?? ''),
        `le motif documente l'absence de valeur par défaut, reçu « ${memory.paymentCycle?.preDueDetail} »`);
      assert(memory.paymentCycle?.preDueLeadTimeMs === null, 'aucune avance de rappel décidée par défaut');
    });
  } finally {
    await harness.close();
    paymentIdempotencyCache.clear();
  }

  return results;
}
