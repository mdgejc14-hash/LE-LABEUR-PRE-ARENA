/**
 * LE LABEUR — P0-PAY-2 — Tests de l'intégration du fournisseur de paiement externe.
 *
 * Périmètre testé (aucun paiement réel, aucun credential inventé) :
 *  - Provider de test déterministe (`TEST_GATEWAY`) :
 *    verifyTransaction(), handleWebhook(), reconcile() ;
 *  - Provider non configuré (MTN/Orange/Moov/Wave) refusant NOT_IMPLEMENTED ;
 *  - Webhook sécurisé (`POST /api/webhooks/payment-provider` et `/api/v1/webhooks/payment-provider`) :
 *    signature HMAC-SHA256, horodatage, anti-replay, validation du payload ;
 *  - Cycle métier :
 *    DUE → PENDING_VERIFICATION → VERIFIED (arrêt strict à VERIFIED, jamais PAID)
 *    puis rapprochement explicite → PAID ;
 *  - Idempotence durable et détection de rejeu (`automation_idempotency`) ;
 *  - Conflit d'idempotence (même clé, charge altérée) ;
 *  - Détection de transaction dupliquée entre deux paiements différents ;
 *  - Rejet motivé sur discordance (montant, devise, payeur, destinataire) ;
 *  - Séparation stricte SALARY / PLATFORM_FEE (commission 25 % intacte) ;
 *  - Garde sur SCHEDULED et PAID terminal ;
 *  - Concurrence tranchée par PostgreSQL (une seule déclaration) ;
 *  - Rollback sans aucune ligne résiduelle ;
 *  - Audit complet dans `automation_audit_ledger` (actor, paymentId, contractId,
 *    externalTransactionId, provider, eventId, timestamp, résultat, erreur) ;
 *  - Événements d'Outbox produits (`PAYMENT_DECLARED`, `PAYMENT_PENDING_VERIFICATION`,
 *    `PAYMENT_APPROVED`, `PAYMENT_REJECTED`, `PAYMENT_PAID`).
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from './offers.test';
import { PaymentLifecycleError } from '../payments/paymentErrors';
import type { OfferRecord } from '../persistence/coreRecords';
import { createSqlContractStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { createSqlPaymentStores } from '../persistence/sqlPaymentStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { buildContractActivationPlan } from '../../domain/contractScheduleAutomation';
import { paymentIdFor } from '../../domain/paymentLifecycle';
import {
  createTestPaymentProviderAdapter,
  createUnconfiguredPaymentProviderAdapter,
  type TestPaymentProviderAdapter,
} from '../payments/paymentVerification';
import type { PaymentView, PaymentWebhookOutcome } from '../repositories/paymentRepository';
import type { NormalizedReconciliationResult } from '../../domain/paymentLifecycle';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SEED_TIMESTAMP = '2026-10-05T15:00:00.000Z';
const START_DATE = '05 Septembre 2026';
const MONTHLY_SALARY = 175_000;
const SALARY_M1_AMOUNT = 131_250;
const COMMISSION_M1_AMOUNT = 43_750;

function makeOffer(id: string, employerId: string): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre P0-PAY-2 ${id}`,
    contractType: 'CDI',
    remuneration: MONTHLY_SALARY,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_TIMESTAMP,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Sécurité', 'Paiement'],
    summary: 'Offre de test P0-PAY-2.',
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
      displayName: 'Admin P0-PAY-2',
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

async function seedActiveContract(harness: Harness, employerId: string, employeeId: string): Promise<SeedResult> {
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
  assert(plan.kind === 'SCHEDULED', `plan d’activation attendu, reçu ${plan.kind}`);
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
    missionDescription: 'Contrat seedé P0-PAY-2',
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

async function readPaymentAudit(harness: Harness, paymentId: string): Promise<Array<{ action: string; actor_id: string; source: string; before_state: unknown; after_state: unknown }>> {
  const result = await harness.database.query<{ action: string; actor_id: string; source: string; before_state: unknown; after_state: unknown }>(
    'SELECT action, actor_id, source, before_state, after_state FROM automation_audit_ledger WHERE entity_id = $1 ORDER BY occurred_at, id',
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

function stateOf(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

async function jsonOf<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export async function runExternalPaymentProviderTests(): Promise<OfferTestResult[]> {
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  /* ------------------------------------------------------------------ */
  /* BLOC 1 — Adaptateur de fournisseur de test en isolation             */
  /* ------------------------------------------------------------------ */

  await check('P0-PAY-2 Provider de test: verifyTransaction() concluant, non trouvé et statut défavorable', async () => {
    const testAdapter = createTestPaymentProviderAdapter();
    testAdapter.registerTransaction({
      provider: 'TEST_GATEWAY',
      externalTransactionId: 'TX-ISOLATION-01',
      reference: 'REF-01',
      amount: 175_000,
      currency: 'FCFA',
      payer: 'emp-1',
      recipient: 'cand-1',
      occurredAt: '2026-10-06T10:00:00.000Z',
      status: 'SUCCESS',
    });

    // Transaction existante et conforme
    const matched = await testAdapter.verifyTransaction({
      externalTransactionId: 'TX-ISOLATION-01',
      reference: 'REF-01',
      amount: 175_000,
      currency: 'FCFA',
    });
    assert(matched.verified === true, 'transaction existante doit être vérifiée');
    assert(matched.providerStatus === 'SUCCESS', 'statut SUCCESS attendu');

    // Transaction inconnue
    const notFound = await testAdapter.verifyTransaction({
      externalTransactionId: 'TX-UNKNOWN-999',
    });
    assert(notFound.verified === false, 'transaction inconnue ne doit pas être vérifiée');
    assert(notFound.providerStatus === 'NOT_FOUND', 'statut NOT_FOUND attendu');

    // Transaction avec échec externe
    testAdapter.registerTransaction({
      provider: 'TEST_GATEWAY',
      externalTransactionId: 'TX-FAILED-01',
      reference: 'REF-FAIL',
      amount: 175_000,
      currency: 'FCFA',
      payer: 'emp-1',
      recipient: 'cand-1',
      occurredAt: '2026-10-06T10:00:00.000Z',
      status: 'FAILED',
    });
    const failedTx = await testAdapter.verifyTransaction({ externalTransactionId: 'TX-FAILED-01' });
    assert(failedTx.verified === false, 'transaction échouée ne doit pas être validée');
  });

  await check('P0-PAY-2 Provider de test: handleWebhook() validation signature, anti-replay et payload', async () => {
    const testAdapter = createTestPaymentProviderAdapter({ secret: 'my_test_secret' });
    const payload = {
      provider: 'TEST_GATEWAY',
      externalTransactionId: 'TX-WH-001',
      reference: 'REF-WH-001',
      amount: 175_000,
      currency: 'FCFA',
      payer: 'emp-1',
      recipient: 'cand-1',
      eventType: 'PAYMENT_COMPLETED',
      status: 'SUCCESS',
    };

    // 1. Signature valide
    const signed = await testAdapter.createSignedWebhook(payload, Date.now());
    const validResult = await testAdapter.handleWebhook({
      signature: signed.signature,
      timestamp: signed.timestamp,
      rawBody: signed.rawBody,
    });
    assert(validResult.accepted === true, 'webhook signé doit être accepté');
    assert(validResult.externalTransactionId === 'TX-WH-001', 'identifiant externe extrait');

    // 2. Signature invalide
    let signatureFailed = false;
    try {
      await testAdapter.handleWebhook({
        signature: 'invalid_hex_signature_abc',
        timestamp: signed.timestamp,
        rawBody: signed.rawBody,
      });
    } catch {
      signatureFailed = true;
    }
    assert(signatureFailed, 'signature invalide doit être rejetée');

    // 3. Horodatage expiré (anti-replay : 10 minutes dans le passé)
    let replayFailed = false;
    const oldTimestamp = Date.now() - 600_000;
    const expiredSigned = await testAdapter.createSignedWebhook(payload, oldTimestamp);
    try {
      await testAdapter.handleWebhook({
        signature: expiredSigned.signature,
        timestamp: expiredSigned.timestamp,
        rawBody: expiredSigned.rawBody,
      });
    } catch {
      replayFailed = true;
    }
    assert(replayFailed, 'horodatage trop ancien doit être rejeté par la garde anti-replay');

    // 4. Charge utile altérée (tampering)
    let tamperFailed = false;
    const tamperedBody = JSON.stringify({ ...payload, amount: 999_999 });
    try {
      await testAdapter.handleWebhook({
        signature: signed.signature, // signée sur 175_000
        timestamp: signed.timestamp,
        rawBody: tamperedBody,
      });
    } catch {
      tamperFailed = true;
    }
    assert(tamperFailed, 'charge altérée doit échouer la validation de signature');

    // 5. Champs obligatoires manquants
    let missingFieldFailed = false;
    const incompletePayload = { provider: 'TEST_GATEWAY', amount: 100 };
    const incompleteSigned = await testAdapter.createSignedWebhook(incompletePayload, Date.now());
    try {
      await testAdapter.handleWebhook({
        signature: incompleteSigned.signature,
        timestamp: incompleteSigned.timestamp,
        rawBody: incompleteSigned.rawBody,
      });
    } catch {
      missingFieldFailed = true;
    }
    assert(missingFieldFailed, 'champs obligatoires manquants doivent être rejetés');
  });

  await check('P0-PAY-2 Provider de test: reconcile() produit MATCH, NOT_FOUND, DUPLICATE et MISMATCH', async () => {
    const testAdapter = createTestPaymentProviderAdapter();
    testAdapter.registerTransaction({
      provider: 'TEST_GATEWAY',
      externalTransactionId: 'TX-REC-TEST-01',
      reference: 'REF-REC-01',
      amount: 43_750,
      currency: 'FCFA',
      payer: 'emp-1',
      recipient: 'LE_LABEUR',
      occurredAt: '2026-10-06T10:00:00.000Z',
      status: 'SUCCESS',
    });

    const dummyPayment = {
      paymentId: 'pay_fee_01',
      contractId: 'ctr_01',
      employerId: 'emp-1',
      candidateId: 'cand-1',
      paymentType: 'PLATFORM_FEE' as const,
      scheduleEntryId: 'pse_01',
      monthNumber: 1,
      periodKey: 'Mois 01',
      amount: 43_750,
      currency: 'FCFA',
      scheduledAt: '2026-10-05T00:00:00.000Z',
      dueAt: '2026-10-05T00:00:00.000Z',
      status: 'VERIFIED' as const,
      declarationCount: 1,
      idempotencyKey: 'k-01',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      externalTransactionId: 'TX-REC-TEST-01',
      reference: 'REF-REC-01',
    };

    // 1. MATCH
    const match = await testAdapter.reconcile({ payment: dummyPayment, asOf: '2026-10-06T12:00:00.000Z' });
    assert(match.verdict === 'MATCH', `MATCH attendu, reçu ${match.verdict}`);

    // 2. NOT_FOUND
    const notFound = await testAdapter.reconcile({
      payment: { ...dummyPayment, externalTransactionId: 'TX-NONEXISTENT' },
      asOf: '2026-10-06T12:00:00.000Z',
    });
    assert(notFound.verdict === 'NOT_FOUND', `NOT_FOUND attendu, reçu ${notFound.verdict}`);

    // 3. DUPLICATE
    const duplicate = await testAdapter.reconcile({
      payment: dummyPayment,
      asOf: '2026-10-06T12:00:00.000Z',
      isDuplicate: true,
    });
    assert(duplicate.verdict === 'DUPLICATE', `DUPLICATE attendu, reçu ${duplicate.verdict}`);

    // 4. MISMATCH (montant différent)
    const mismatch = await testAdapter.reconcile({
      payment: { ...dummyPayment, amount: 50_000 },
      asOf: '2026-10-06T12:00:00.000Z',
    });
    assert(mismatch.verdict === 'MISMATCH', `MISMATCH attendu, reçu ${mismatch.verdict}`);
  });

  await check('P0-PAY-2 Provider non configuré: refuse explicitement sans credentials inventés', async () => {
    for (const provider of ['MTN', 'Orange', 'Moov', 'Wave', 'AGGREGATOR']) {
      const adapter = createUnconfiguredPaymentProviderAdapter(provider);
      let failedVerify = false;
      let failedWebhook = false;
      let failedReconcile = false;
      try {
        await adapter.verifyTransaction({ externalTransactionId: '123' });
      } catch (e) {
        failedVerify = (e as PaymentLifecycleError).code === 'NOT_IMPLEMENTED' || (e as Error).message.includes('Aucun adaptateur');
      }
      try {
        await adapter.handleWebhook({ signature: 'abc' });
      } catch (e) {
        failedWebhook = (e as PaymentLifecycleError).code === 'NOT_IMPLEMENTED' || (e as Error).message.includes('Aucun adaptateur');
      }
      try {
        await adapter.reconcile({ paymentId: 'pay_1', asOf: '2026-10-06T12:00:00.000Z' });
      } catch (e) {
        failedReconcile = (e as PaymentLifecycleError).code === 'NOT_IMPLEMENTED' || (e as Error).message.includes('Aucun adaptateur');
      }
      assert(failedVerify && failedWebhook && failedReconcile, `toutes les méthodes de ${provider} doivent lever NOT_IMPLEMENTED`);
    }
  });

  /* ------------------------------------------------------------------ */
  /* BLOC 2 — Intégration Worker HTTP / Webhook sur PostgreSQL réel      */
  /* ------------------------------------------------------------------ */

  const salaryOtps = new Map<string, string>();
  const harness = await createOffersTestHarness((paymentId, otp) => salaryOtps.set(paymentId, otp));
  let adminToken = '';
  let employerToken = '';
  let employerId = '';
  let candidateToken = '';
  let candidateId = '';
  let seed: SeedResult;
  const testAdapter = createTestPaymentProviderAdapter();

  try {
    const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
    const admin = await provisionAdmin(harness);
    employerToken = employer.token;
    employerId = employer.userId;
    candidateToken = candidate.token;
    candidateId = candidate.userId;
    adminToken = admin.token;

    seed = await seedActiveContract(harness, employerId, candidateId);
    await harness.payments!.materializePaymentsForContract(seed.contractId);

    // Basculer l'échéance M1 en DUE
    await harness.payments!.markPaymentDue(seed.salaryPaymentId, { deadlineId: 'd-1' });
    await harness.payments!.markPaymentDue(seed.feePaymentId, { deadlineId: 'd-2' });

    // Injecter l'adaptateur de test
    (harness.payments as unknown as { getProviderAdapter?: (id: string) => unknown }).getProviderAdapter =
      (id: string) => id === 'TEST_GATEWAY' ? testAdapter : createUnconfiguredPaymentProviderAdapter(id);

    await check('P0-PAY-2 Webhook sur DUE: DUE → PENDING_VERIFICATION → VERIFIED (arrêt strict à VERIFIED, jamais PAID)', async () => {
      const webhookPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-WEBHOOK-DUE-01',
        paymentId: seed.salaryPaymentId,
        reference: 'MOMO-SALARY-M1-001',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        occurredAt: new Date(harness.clock.value.getTime() - 1).toISOString(),
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(webhookPayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await jsonOf<PaymentWebhookOutcome>(response);
      assert(body.accepted === true, 'webhook accepté');
      assert(body.status === 'VERIFIED', `statut VERIFIED attendu, reçu ${body.status}`);
      assert(body.action === 'VERIFIED', 'action VERIFIED');

      // 1. Vérifier l'état en base PostgreSQL
      const paymentRow = await harness.database.query<{
        status: string;
        verified_at: Date | null;
        verified_by: string | null;
        provider: string | null;
        external_transaction_id: string | null;
        declaration_count: number;
      }>('SELECT status, verified_at, verified_by, provider, external_transaction_id, declaration_count FROM payments WHERE id = $1', [seed.salaryPaymentId]);

      const row = paymentRow.rows[0];
      assert(row.status === 'VERIFIED', `statut en base VERIFIED, reçu ${row.status}`);
      assert((row.status as string) !== 'PAID', 'Le webhook ne doit JAMAIS basculer directement en PAID');
      assert(row.verified_at !== null, 'verified_at doit être renseigné');
      assert(row.verified_by === 'provider:TEST_GATEWAY', 'verified_by indique le fournisseur');
      assert(row.provider === 'TEST_GATEWAY', 'provider persisté');
      assert(row.external_transaction_id === 'TX-WEBHOOK-DUE-01', 'identifiant de transaction externe persisté');
      assert(row.declaration_count === 1, 'tentative de déclaration comptée');

      // 2. Vérifier les déclarations créées
      const declRows = await harness.database.query<{ outcome: string; reference: string; attempt_number: number }>(
        'SELECT outcome, reference, attempt_number FROM payment_declarations WHERE payment_id = $1',
        [seed.salaryPaymentId],
      );
      assert(declRows.rows.length === 1, 'exactement une tentative de déclaration créée');
      assert(declRows.rows[0].outcome === 'VERIFIED', 'tentative vérifiée');

      // 3. Vérifier les événements d'Outbox
      const outbox = await readPaymentOutbox(harness, seed.salaryPaymentId);
      const eventTypes = outbox.map(e => e.event_type);
      assert(eventTypes.includes('PAYMENT_DECLARED'), 'PAYMENT_DECLARED écrit');
      assert(eventTypes.includes('PAYMENT_PENDING_VERIFICATION'), 'PAYMENT_PENDING_VERIFICATION écrit');
      assert(eventTypes.includes('PAYMENT_APPROVED'), 'PAYMENT_APPROVED écrit');
      assert(!eventTypes.includes('PAYMENT_PAID'), 'PAYMENT_PAID ne doit PAS être émis par le webhook seul');
      assert((await harness.database.query('SELECT payment_id FROM salary_confirmations WHERE payment_id=$1', [seed.salaryPaymentId])).rows.length === 0,
        'VERIFIED après webhook ne crée pas encore de confirmation salariale');

      // 4. Vérifier l'audit ledger
      const audit = await readPaymentAudit(harness, seed.salaryPaymentId);
      const auditActions = audit.map(a => a.action);
      assert(auditActions.includes('PAYMENT_WEBHOOK_SIGNATURE_VALIDATED'), 'audit signature validée');
      assert(auditActions.includes('PAYMENT_SUBMITTED'), 'audit déclaration soumise');
      assert(auditActions.includes('PAYMENT_VERIFIED'), 'audit déclaration vérifiée');

      const verifiedAudit = audit.find(a => a.action === 'PAYMENT_VERIFIED')!;
      assert(stateOf(verifiedAudit.after_state).provider === 'TEST_GATEWAY', 'provider dans audit');
      assert(stateOf(verifiedAudit.after_state).externalTransactionId === 'TX-WEBHOOK-DUE-01', 'externalTransactionId dans audit');
    });

    await check('P0-PAY-2 Rapprochement explicite puis PAID: confirmation par l’ADMIN', async () => {
      // 1. Rapprochement explicite via la route admin
      const recResponse = await harness.worker.fetch(authRequest(
        `/api/v1/admin/payments/${seed.salaryPaymentId}/reconcile`,
        adminToken,
        { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'rec-key-001' }, body: '{}' },
      ));
      assert(recResponse.status === 200, `200 attendu sur reconcile, reçu ${recResponse.status}`);
      const recResult = await jsonOf<NormalizedReconciliationResult>(recResponse);
      assert(recResult.verdict === 'MATCH', `MATCH attendu, reçu ${JSON.stringify(recResult)}`);

      // 2. Décision de confirmation PAID
      const confirmResponse = await harness.worker.fetch(authRequest(
        `/api/v1/admin/payments/${seed.salaryPaymentId}/confirm`,
        adminToken,
        { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'conf-key-001' }, body: '{}' },
      ));
      assert(confirmResponse.status === 200, `200 attendu sur confirm, reçu ${confirmResponse.status}`);
      const confirmedView = await jsonOf<PaymentView>(confirmResponse);
      assert(confirmedView.status === 'PAID', 'statut final PAID atteint');

      // 3. Événement PAYMENT_PAID émis
      const outbox = await readPaymentOutbox(harness, seed.salaryPaymentId);
      assert(outbox.some(e => e.event_type === 'PAYMENT_PAID'), 'PAYMENT_PAID écrit après rapprochement');
    });

    await check('P0-SALARY-VERIFY PAYMENT_PAID externe → confirmation P0-SALARY-1 unique, OTP, audit et confirmation travailleur', async () => {
      const paid = await harness.database.query<{ status: string }>('SELECT status FROM payments WHERE id=$1', [seed.salaryPaymentId]);
      assert(paid.rows[0]?.status === 'PAID', 'la chaîne fournisseur / rapprochement a atteint PAID');
      assert((await harness.database.query('SELECT payment_id FROM salary_confirmations WHERE payment_id=$1', [seed.salaryPaymentId])).rows.length === 0,
        'aucune confirmation salariale avant le traitement de PAYMENT_PAID par AutomationEngine');

      // Le worker existant consomme PAYMENT_PAID, puis sa demande durable : aucun
      // deuxième système n'est instancié. Le drain est borné et déclenché par le test.
      for (let pass = 0; pass < 3; pass += 1) {
        const report = await harness.automationWorker!.drainEvents(100);
        assert(report.deadLettered === 0, `aucun événement salaire en dead-letter (pass ${pass + 1})`);
      }

      const proof = await harness.database.query<{
        nonce: string; otp_digest: string; confirmed_at: Date | null; confirmed_by: string | null;
      }>('SELECT nonce,otp_digest,confirmed_at,confirmed_by FROM salary_confirmations WHERE payment_id=$1', [seed.salaryPaymentId]);
      assert(proof.rows.length === 1, 'une seule confirmation P0-SALARY-1 créée depuis PAYMENT_PAID');
      assert(proof.rows[0].confirmed_at === null && proof.rows[0].confirmed_by === null,
        'PAYMENT_PAID ne confirme pas le salaire : attente de l’action explicite du travailleur');
      assert(proof.rows[0].nonce.length === 64, 'nonce serveur unique de 256 bits');
      const otp = salaryOtps.get(seed.salaryPaymentId);
      assert(otp && /^\d{6}$/.test(otp) && proof.rows[0].otp_digest !== otp, 'OTP test livré, uniquement hashé en base');

      const confirm = () => harness.worker.fetch(authRequest(
        `/api/v1/payments/${seed.salaryPaymentId}/salary-confirmation`,
        candidateToken,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'salary-external-confirm-001' },
          body: JSON.stringify({ otp, nonce: proof.rows[0].nonce }),
        },
      ));
      const response = await confirm();
      assert(response.status === 200, `confirmation OTP valide attendue, reçu ${response.status}`);
      const body = await jsonOf<{ status: string; paymentId: string }>(response);
      assert(body.status === 'SALARY_CONFIRMED' && body.paymentId === seed.salaryPaymentId, 'état final distinct SALARY_CONFIRMED');

      const confirmed = await harness.database.query<{ confirmed_by: string; confirmed_at: Date | null }>(
        'SELECT confirmed_by,confirmed_at FROM salary_confirmations WHERE payment_id=$1', [seed.salaryPaymentId],
      );
      assert(confirmed.rows[0]?.confirmed_by === candidateId && confirmed.rows[0]?.confirmed_at,
        'confirmation attribuée au candidat authentifié et persistée');
      const audit = await readPaymentAudit(harness, seed.salaryPaymentId);
      assert(audit.some(row => row.action === 'SALARY_CONFIRMATION_SUCCESS'), 'audit durable de confirmation présent');
      const events = await readPaymentOutbox(harness, seed.salaryPaymentId);
      assert(events.filter(row => row.event_type === 'SALARY_CONFIRMED').length === 1, 'un seul événement de confirmation finale');

      const replay = await confirm();
      assert(replay.status === 200, 'rejeu de la confirmation avec la même clé et le même OTP reste idempotent');
      assert((await harness.database.query('SELECT payment_id FROM salary_confirmations WHERE confirmed_at IS NOT NULL')).rows.length === 1,
        'le rejeu ne crée pas de seconde confirmation');
      assert((await readPaymentOutbox(harness, seed.salaryPaymentId)).filter(row => row.event_type === 'SALARY_CONFIRMED').length === 1,
        'le rejeu ne crée pas de second événement SALARY_CONFIRMED');
    });

    await check('P0-PAY-2 Idempotence & Rejeu du webhook: rejeu idempotent sans second effet ni double déclaration', async () => {
      const webhookPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-WEBHOOK-DUE-01',
        paymentId: seed.salaryPaymentId,
        reference: 'MOMO-SALARY-M1-001',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        occurredAt: new Date(harness.clock.value.getTime() - 1).toISOString(),
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(webhookPayload);
      const replayResponse = await harness.worker.fetch(new Request('https://api.test/api/v1/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(replayResponse.status === 200, `200 attendu, reçu ${replayResponse.status}`);
      const body = await jsonOf<PaymentWebhookOutcome>(replayResponse);
      assert(body.accepted === true, 'rejeu accepté');
      assert(body.replayed === true, 'marqué comme rejeu');
      assert(body.action === 'REPLAY', 'action REPLAY');

      // Vérifier qu'aucune nouvelle tentative n'a été insérée
      const declRows = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id = $1',
        [seed.salaryPaymentId],
      );
      assert(Number(declRows.rows[0].count) === 1, 'toujours exactement 1 tentative en base');
    });

    await check('P0-PAY-2 Conflit d’idempotence: même transaction avec payload différent refusée (409)', async () => {
      // Même externalTransactionId et eventType mais montant différent
      const alteredPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-WEBHOOK-DUE-01',
        paymentId: seed.salaryPaymentId,
        reference: 'MOMO-SALARY-M1-001',
        amount: 999_999, // charge différente
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(alteredPayload);
      const conflictResponse = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(conflictResponse.status === 409, `409 attendu, reçu ${conflictResponse.status}`);
    });

    await check('P0-PAY-2 Anti-replay: horodatage trop ancien refusé (400) et audité', async () => {
      const oldPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-OLD-001',
        paymentId: seed.feePaymentId,
        reference: 'MOMO-FEE-001',
        amount: 43_750,
        currency: 'FCFA',
        payer: employerId,
        recipient: 'LE_LABEUR',
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const tenMinutesAgo = Date.now() - 600_000;
      const signed = await testAdapter.createSignedWebhook(oldPayload, tenMinutesAgo);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(response.status === 400, `400 attendu sur horodatage expiré, reçu ${response.status}`);

      // Vérifier audit du rejet
      const audit = await readPaymentAudit(harness, seed.feePaymentId);
      assert(audit.some(a => a.action === 'PAYMENT_WEBHOOK_SIGNATURE_REJECTED'), 'audit rejet signature/replay consigné');
    });

    await check('P0-PAY-2 Sécurité: signature falsifiée refusée (401)', async () => {
      const payload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-FORGED-001',
        paymentId: seed.feePaymentId,
        reference: 'MOMO-FEE-001',
        amount: 43_750,
        currency: 'FCFA',
        payer: employerId,
        recipient: 'LE_LABEUR',
        eventType: 'PAYMENT_COMPLETED',
      };
      const signed = await testAdapter.createSignedWebhook(payload);
      const badHeaders = { ...signed.headers, 'x-webhook-signature': '0'.repeat(64) };
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: badHeaders,
        body: signed.rawBody,
      }));
      assert(response.status === 401, `401 attendu sur signature falsifiée, reçu ${response.status}`);
    });

    await check('P0-PAY-2 Double paiement prévenu: même transaction externe pour deux paiements différents refusée (409)', async () => {
      // TX-WEBHOOK-DUE-01 est déjà associée à seed.salaryPaymentId.
      // Tentative de l'utiliser pour payer la commission (seed.feePaymentId)
      const duplicatePayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-WEBHOOK-DUE-01', // Déjà utilisée !
        paymentId: seed.feePaymentId,
        reference: 'MOMO-FEE-STEAL-001',
        amount: 43_750,
        currency: 'FCFA',
        payer: employerId,
        recipient: 'LE_LABEUR',
        eventType: 'PAYMENT_CHARGE_NEW',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(duplicatePayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(response.status === 409, `409 attendu sur transaction déjà affectée, reçu ${response.status}`);
      const errBody = await jsonOf<{ error: { message: string } }>(response);
      assert(/déjà associée/i.test(errBody.error.message), 'message de refus explicite sur transaction dupliquée');
    });

    await check('P0-PAY-2 Transaction inexistante: paiement cible introuvable renvoie 404', async () => {
      const unknownPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-UNKNOWN-001',
        paymentId: 'pay_nonexistent_9999',
        reference: 'MOMO-UNKNOWN-001',
        amount: 50_000,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };
      const signed = await testAdapter.createSignedWebhook(unknownPayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));
      assert(response.status === 404, `404 attendu sur paiement introuvable, reçu ${response.status}`);
    });

    await check('P0-PAY-2 Mismatch montant sur PENDING_VERIFICATION: rejet motivé, REJECTED, jamais PAID', async () => {
      // 1. Déclarer d'abord la commission en attente (PENDING_VERIFICATION)
      const declResponse = await harness.worker.fetch(authRequest(
        '/api/v1/payments/commission-declarations',
        employerToken,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'fee-decl-001' },
          body: JSON.stringify({
            contractId: seed.contractId,
            periodKey: 'Mois 01',
            reference: 'MOMO-FEE-DECL-01',
            amount: 43_750,
            currency: 'FCFA',
          }),
        },
      ));
      assert(declResponse.status === 201, `201 attendu, reçu ${declResponse.status}`);

      // 2. Webhook arrive avec un montant erroné (e.g. 30_000 au lieu de 43_750)
      const mismatchPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-FEE-MISMATCH-01',
        paymentId: seed.feePaymentId,
        reference: 'MOMO-FEE-DECL-01',
        amount: 30_000, // Discordance !
        currency: 'FCFA',
        payer: employerId,
        recipient: 'LE_LABEUR',
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(mismatchPayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(response.status === 200, `200 attendu (traitement concluant du webhook), reçu ${response.status}`);
      const body = await jsonOf<PaymentWebhookOutcome>(response);
      assert(body.status === 'REJECTED', 'statut REJECTED attendu');
      assert(body.action === 'REJECTED', 'action REJECTED');

      // Vérifier la base PostgreSQL
      const feeRow = await harness.database.query<{ status: string; rejection_reason: string }>(
        'SELECT status, rejection_reason FROM payments WHERE id = $1', [seed.feePaymentId],
      );
      assert(feeRow.rows[0].status === 'REJECTED', 'statut en base REJECTED');
      assert(/Montant externe 30000.*différent/i.test(feeRow.rows[0].rejection_reason), 'motif de discordance de montant explicite');

      // Outbox : PAYMENT_REJECTED émis, AUCUN PAYMENT_PAID
      const outbox = await readPaymentOutbox(harness, seed.feePaymentId);
      assert(outbox.some(e => e.event_type === 'PAYMENT_REJECTED'), 'PAYMENT_REJECTED émis');
      assert(!outbox.some(e => e.event_type === 'PAYMENT_PAID'), 'aucun PAYMENT_PAID sur discordance');
    });

    await check('P0-PAY-2 Mismatch devise sur PENDING_VERIFICATION: rejet motivé, jamais PAID', async () => {
      // Régulariser la commission avec une nouvelle déclaration
      await harness.worker.fetch(authRequest(
        '/api/v1/payments/commission-declarations',
        employerToken,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'fee-decl-002' },
          body: JSON.stringify({
            contractId: seed.contractId,
            periodKey: 'Mois 01',
            reference: 'MOMO-FEE-DECL-REG-01',
            amount: 43_750,
            currency: 'FCFA',
          }),
        },
      ));

      // Webhook arrive avec EUR au lieu de FCFA
      const currencyMismatchPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-FEE-CURR-MISMATCH-01',
        paymentId: seed.feePaymentId,
        reference: 'MOMO-FEE-DECL-REG-01',
        amount: 43_750,
        currency: 'EUR', // Discordance !
        payer: employerId,
        recipient: 'LE_LABEUR',
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(currencyMismatchPayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      const body = await jsonOf<PaymentWebhookOutcome>(response);
      assert(body.status === 'REJECTED', 'statut REJECTED attendu sur devise erronée');

      const feeRow = await harness.database.query<{ rejection_reason: string }>(
        'SELECT rejection_reason FROM payments WHERE id = $1', [seed.feePaymentId],
      );
      assert(/Devise externe EUR.*différente/i.test(feeRow.rows[0].rejection_reason), 'motif de discordance de devise explicite');
    });

    await check('P0-PAY-2 Mismatch destinataire commission: vers salarié refusé (la commission est due à LE LABEUR)', async () => {
      // Régulariser à nouveau
      await harness.worker.fetch(authRequest(
        '/api/v1/payments/commission-declarations',
        employerToken,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'fee-decl-003' },
          body: JSON.stringify({
            contractId: seed.contractId,
            periodKey: 'Mois 01',
            reference: 'MOMO-FEE-DECL-REG-02',
            amount: 43_750,
            currency: 'FCFA',
          }),
        },
      ));

      // Destinataire = candidat au lieu de LE_LABEUR
      const recipientMismatchPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-FEE-RECIP-MISMATCH-01',
        paymentId: seed.feePaymentId,
        reference: 'MOMO-FEE-DECL-REG-02',
        amount: 43_750,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId, // Interdit pour une commission !
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(recipientMismatchPayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      const body = await jsonOf<PaymentWebhookOutcome>(response);
      assert(body.status === 'REJECTED', 'statut REJECTED');

      const feeRow = await harness.database.query<{ rejection_reason: string }>(
        'SELECT rejection_reason FROM payments WHERE id = $1', [seed.feePaymentId],
      );
      assert(/jamais au salarié/i.test(feeRow.rows[0].rejection_reason), 'motif absolu du dépôt respecté');
    });

    await check('P0-PAY-2 Séparation stricte SALARY / PLATFORM_FEE: commission 25 % préservée', async () => {
      // Régulariser et valider la commission proprement
      await harness.worker.fetch(authRequest(
        '/api/v1/payments/commission-declarations',
        employerToken,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'fee-decl-final-01' },
          body: JSON.stringify({
            contractId: seed.contractId,
            periodKey: 'Mois 01',
            reference: 'MOMO-FEE-CLEAN-01',
            amount: 43_750,
            currency: 'FCFA',
          }),
        },
      ));

      const cleanFeePayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-FEE-CLEAN-01',
        paymentId: seed.feePaymentId,
        reference: 'MOMO-FEE-CLEAN-01',
        amount: 43_750,
        currency: 'FCFA',
        payer: employerId,
        recipient: 'LE_LABEUR',
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(cleanFeePayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await jsonOf<PaymentWebhookOutcome>(response);
      assert(body.status === 'VERIFIED', 'commission vérifiée');

      // Vérifier que le taux de commission du contrat est resté exactement 25 %
      const contractRow = await harness.database.query<{ commission_percentage: number }>(
        'SELECT commission_percentage FROM contracts WHERE id = $1', [seed.contractId],
      );
      assert(Number(contractRow.rows[0].commission_percentage) === 25, 'commission_percentage inchangé à 25');
    });

    await check('P0-PAY-2 Paiement SCHEDULED refusé: impossible de vérifier une échéance non due (409)', async () => {
      // seed.secondMonthSalaryPaymentId est toujours SCHEDULED
      const scheduledPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-SCHED-01',
        paymentId: seed.secondMonthSalaryPaymentId,
        reference: 'MOMO-M2-EARLY-01',
        amount: MONTHLY_SALARY,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(scheduledPayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(response.status === 409, `409 attendu sur paiement SCHEDULED, reçu ${response.status}`);
      const err = await jsonOf<{ error: { message: string } }>(response);
      assert(/non encore exigible/i.test(err.error.message), 'refus explicite sur statut SCHEDULED');
    });

    await check('P0-PAY-2 Paiement terminal PAID refusé: aucune modification sur un paiement payé (409)', async () => {
      // seed.salaryPaymentId est maintenant PAID
      const paidPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-PAID-REOPEN-01',
        paymentId: seed.salaryPaymentId,
        reference: 'MOMO-REOPEN-01',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(paidPayload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));

      assert(response.status === 409, `409 attendu sur paiement terminal, reçu ${response.status}`);
    });

    await check('P0-PAY-2 Provider réel non configuré: MTN/Orange refusés (501)', async () => {
      const realProviderPayload = {
        provider: 'MTN', // Non configuré
        externalTransactionId: 'TX-MTN-001',
        paymentId: seed.secondMonthSalaryPaymentId,
        reference: 'MTN-REF-001',
        amount: MONTHLY_SALARY,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        eventType: 'PAYMENT_COMPLETED',
      };

      const signed = await testAdapter.createSignedWebhook(realProviderPayload);
      const mtnHeaders = { ...signed.headers, 'x-provider': 'MTN' };
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: mtnHeaders,
        body: signed.rawBody,
      }));

      assert(response.status === 501, `501 NOT_IMPLEMENTED attendu sur opérateur réel non configuré, reçu ${response.status}`);
    });

    await check('P0-PAY-2 Concurrence: deux webhooks concurrents pour la même transaction', async () => {
      // Créer un nouveau contrat pour tester la course
      const raceContract = await seedActiveContract(harness, employerId, candidateId);
      await harness.payments!.materializePaymentsForContract(raceContract.contractId);
      await harness.payments!.markPaymentDue(raceContract.salaryPaymentId, { deadlineId: 'd-race-1' });

      const racePayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-RACE-CONCURRENT-001',
        paymentId: raceContract.salaryPaymentId,
        reference: 'MOMO-RACE-001',
        amount: SALARY_M1_AMOUNT,
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(racePayload);
      const [resA, resB] = await Promise.all([
        harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
          method: 'POST', headers: signed.headers, body: signed.rawBody,
        })),
        harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
          method: 'POST', headers: signed.headers, body: signed.rawBody,
        })),
      ]);

      assert(resA.status === 200 && resB.status === 200, 'les deux requêtes doivent répondre 200');

      // Exactement 1 tentative de déclaration créée
      const declRows = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id = $1',
        [raceContract.salaryPaymentId],
      );
      assert(Number(declRows.rows[0].count) === 1, 'exactement une tentative de déclaration créée malgré la concurrence');

      const paymentRow = await harness.database.query<{ status: string }>(
        'SELECT status FROM payments WHERE id = $1', [raceContract.salaryPaymentId],
      );
      assert(paymentRow.rows[0].status === 'VERIFIED', 'statut final VERIFIED');
    });

    await check('P0-PAY-2 Rollback transactionnel: aucun état corrompu en cas d’erreur pendant le traitement', async () => {
      const rollbackContract = await seedActiveContract(harness, employerId, candidateId);
      await harness.payments!.materializePaymentsForContract(rollbackContract.contractId);
      await harness.payments!.markPaymentDue(rollbackContract.salaryPaymentId, { deadlineId: 'd-rb-1' });

      // Requête avec un corps qui déclenche une erreur après début de transaction
      const payload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-ROLLBACK-001',
        paymentId: rollbackContract.salaryPaymentId,
        reference: 'MOMO-ROLLBACK-001',
        amount: -500, // montant négatif rejeté par les contraintes
        currency: 'FCFA',
        payer: employerId,
        recipient: candidateId,
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      const signed = await testAdapter.createSignedWebhook(payload);
      const response = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST', headers: signed.headers, body: signed.rawBody,
      }));

      assert(response.status >= 400, 'requête invalide rejetée');

      // Aucune ligne résiduelle dans payment_declarations
      const decls = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id = $1',
        [rollbackContract.salaryPaymentId],
      );
      assert(Number(decls.rows[0].count) === 0, 'aucune déclaration résiduelle après rollback');

      // Le paiement est resté intact en DUE
      const paymentRow = await harness.database.query<{ status: string }>(
        'SELECT status FROM payments WHERE id = $1', [rollbackContract.salaryPaymentId],
      );
      assert(paymentRow.rows[0].status === 'DUE', 'statut resté DUE');
    });
  } finally {
    await harness.close();
  }

  return results;
}
