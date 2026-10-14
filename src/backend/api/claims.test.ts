/**
 * P0-DISPUTE-1 — tests Worker/API → PostgreSQL du premier cycle Claim.
 *
 * Couvre les parties tirées du contrat, l'idempotence et la concurrence CAS,
 * le rollback, les références de preuve sans coffre, l'automatisation strictement
 * déterministe, l'escalade neutre, l'audit, ADMIN et les restrictions réversibles.
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
import { createApiWorker } from './worker';
import type { AuthenticatedActor } from '../productionContracts';
import { getRepositoryMode } from '../../repositories/provider';
import { resolveRepositoryMode } from '../../repositories/mode';
import { resolveClaimEvidenceDeadline } from '../disputes/config';

const SEED_AT = '2026-10-05T14:00:00.000Z';
const START_DATE = '05 Septembre 2026';
const MONTHLY_SALARY = 175_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeOffer(id: string, employerId: string): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre Claim ${id}`,
    contractType: 'CDI',
    remuneration: MONTHLY_SALARY,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_AT,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Gestion'],
    summary: 'Offre de test P0-DISPUTE-1.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
}

async function seedActiveContract(harness: Awaited<ReturnType<typeof createOffersTestHarness>>, employerId: string, candidateId: string) {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, employerId));
  const contractId = newEntityId('ctr');
  const plan = buildContractActivationPlan({
    contractId,
    employerId,
    employeeId: candidateId,
    periodicity: 'Mensuel',
    startDate: START_DATE,
    durationMonths: 2,
    monthlySalary: MONTHLY_SALARY,
    currency: 'FCFA',
    commissionPercentage: 25,
  }, SEED_AT);
  assert(plan.kind === 'SCHEDULED', `échéancier Mensuel réel attendu, reçu ${plan.kind}`);
  await createSqlContractStore(harness.database).create({
    id: contractId,
    offerId,
    employerId,
    employeeId: candidateId,
    status: 'ACTIVE',
    monthlySalary: MONTHLY_SALARY,
    currency: 'FCFA',
    startDate: START_DATE,
    currentMonth: 1,
    durationMonths: 2,
    periodicity: 'Mensuel',
    missionDescription: 'Contrat P0-DISPUTE-1 seedé depuis le modèle.',
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
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  });
  return {
    contractId,
    m1SalaryPaymentId: paymentIdFor(contractId, 'SALARY', 1),
    m2SalaryPaymentId: paymentIdFor(contractId, 'SALARY', 2),
  };
}

function post(harness: Awaited<ReturnType<typeof createOffersTestHarness>>, path: string, token: string, key: string, body: unknown) {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }));
}

async function provisionAdmin(harness: Awaited<ReturnType<typeof createOffersTestHarness>>) {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = harness.clock.value.toISOString();
  const expiresAt = new Date(harness.clock.value.getTime() + 3_600_000).toISOString();
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async transaction => {
    await transaction.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.claim.${userId}@example.com`,
      displayName: 'Admin P0-DISPUTE-1',
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { userId, token };
}

export async function runClaimDomainTests(): Promise<OfferTestResult[]> {
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('P0-DISPUTE-1 configuration: aucune durée de preuve n’est inventée', async () => {
    const absent = resolveClaimEvidenceDeadline(undefined);
    const invalid = resolveClaimEvidenceDeadline('demain');
    const configured = resolveClaimEvidenceDeadline('60000');
    assert(absent.valid && !absent.configured && absent.deadlineMs === null, 'durée absente reste absente');
    assert(!invalid.valid && invalid.deadlineMs === null, 'durée invalide désactivée explicitement');
    assert(configured.valid && configured.configured && configured.deadlineMs === 60_000, 'seule la valeur opérateur est appliquée');
  });

  await check('P0-DISPUTE-1 configuration invalide: aucun délai implicite, Claim transmis à ADMIN_REVIEW', async () => {
    const invalidHarness = await createOffersTestHarness(undefined, { claimEvidenceDeadlineMs: 'demain' });
    try {
      const employer = await authenticateActor(invalidHarness, 'employer-1', 'EMPLOYER');
      const candidate = await authenticateActor(invalidHarness, 'candidate-1', 'CANDIDATE');
      const seed = await seedActiveContract(invalidHarness, employer.userId, candidate.userId);
      assert(invalidHarness.payments, 'repository paiement PostgreSQL attendu');
      await invalidHarness.payments.materializePaymentsForContract(seed.contractId);
      assert(invalidHarness.automationWorker, 'worker Claim attendu');
      const created = await post(invalidHarness, '/api/v1/claims', candidate.token, 'claim-invalid-deadline', {
        contractId: seed.contractId,
        paymentId: seed.m1SalaryPaymentId,
        type: 'SALARY_NOT_RECEIVED',
        reason: 'Configuration opérateur invalide.',
      });
      assert(created.status === 201, `Claim conservé malgré la configuration invalide, reçu ${created.status}`);
      const body = await created.json() as { claimId: string };
      const drain = await invalidHarness.automationWorker.drainEvents(50);
      assert(drain.entries.some(entry => entry.aggregateId === body.claimId && entry.eventType === 'CLAIM_CREATED' && entry.result === 'completed'), 'événement Claim traité');
      const claim = await invalidHarness.database.query<{ status: string; due_at: Date | null }>(
        'SELECT status,due_at FROM claims WHERE claim_id=$1', [body.claimId],
      );
      const evidence = await invalidHarness.database.query('SELECT evidence_request_id FROM claim_evidence_requests WHERE claim_id=$1', [body.claimId]);
      const deadlines = await invalidHarness.database.query("SELECT id FROM automation_deadlines WHERE aggregate_type='CLAIM' AND aggregate_id=$1", [body.claimId]);
      const audit = await invalidHarness.database.query<{ action: string; after_state: Record<string, unknown> }>(
        'SELECT action,after_state FROM automation_audit_ledger WHERE entity_id=$1', [body.claimId],
      );
      assert(claim.rows[0].status === 'ADMIN_REVIEW' && claim.rows[0].due_at === null, 'revue ADMIN sans durée devinée');
      assert(evidence.rows.length === 0 && deadlines.rows.length === 0, 'aucune demande orpheline ni deadline artificielle');
      assert(audit.rows.some(row => row.action === 'CLAIM_DEADLINE_CONFIGURATION_INVALID' && row.after_state.sanctionApplied === false), 'mauvaise configuration auditée, sans sanction');
    } finally {
      await invalidHarness.close();
    }
  });

  await check('P0-DISPUTE-1 délai absent: preuve demandée sans due_at, deadline ou job implicite', async () => {
    const noDeadlineHarness = await createOffersTestHarness();
    try {
      const employer = await authenticateActor(noDeadlineHarness, 'employer-1', 'EMPLOYER');
      const candidate = await authenticateActor(noDeadlineHarness, 'candidate-1', 'CANDIDATE');
      const seed = await seedActiveContract(noDeadlineHarness, employer.userId, candidate.userId);
      assert(noDeadlineHarness.payments && noDeadlineHarness.automationWorker, 'stores PostgreSQL attendus');
      await noDeadlineHarness.payments.materializePaymentsForContract(seed.contractId);
      const created = await post(noDeadlineHarness, '/api/v1/claims', candidate.token, 'claim-no-deadline', {
        contractId: seed.contractId,
        paymentId: seed.m1SalaryPaymentId,
        type: 'SALARY_NOT_RECEIVED',
        reason: 'Test sans délai opérateur.',
      });
      assert(created.status === 201, `Claim créé sans configuration, reçu ${created.status}`);
      const body = await created.json() as { claimId: string };
      await noDeadlineHarness.automationWorker.drainEvents(50);
      await noDeadlineHarness.automationWorker.drainEvents(50);
      const claim = await noDeadlineHarness.database.query<{ status: string; due_at: Date | null }>(
        'SELECT status,due_at FROM claims WHERE claim_id=$1', [body.claimId],
      );
      const evidence = await noDeadlineHarness.database.query<{ due_at: Date | null }>(
        'SELECT due_at FROM claim_evidence_requests WHERE claim_id=$1', [body.claimId],
      );
      const deadlines = await noDeadlineHarness.database.query("SELECT id FROM automation_deadlines WHERE aggregate_type='CLAIM' AND aggregate_id=$1", [body.claimId]);
      const jobs = await noDeadlineHarness.database.query("SELECT job_id FROM automation_jobs WHERE aggregate_type='CLAIM' AND aggregate_id=$1", [body.claimId]);
      const audit = await noDeadlineHarness.database.query<{ action: string }>('SELECT action FROM automation_audit_ledger WHERE entity_id=$1', [body.claimId]);
      assert(claim.rows[0].status === 'EVIDENCE_REQUESTED' && claim.rows[0].due_at === null, 'aucune durée ajoutée au Claim');
      assert(evidence.rows.length === 1 && evidence.rows[0].due_at === null, 'demande persistée sans date inventée');
      assert(deadlines.rows.length === 0 && jobs.rows.length === 0, 'aucun scheduler armé sans règle configurée');
      assert(audit.rows.some(row => row.action === 'CLAIM_EVIDENCE_DEADLINE_NOT_CONFIGURED'), 'absence de configuration explicitement auditée');
    } finally {
      await noDeadlineHarness.close();
    }
  });

  const harness = await createOffersTestHarness(undefined, { claimEvidenceDeadlineMs: '60000' });
  let employerToken = '';
  let employerId = '';
  let candidateToken = '';
  let candidateId = '';
  let otherEmployerToken = '';
  let adminToken = '';
  let adminId = '';
  let contractId = '';
  let m1PaymentId = '';
  let m2PaymentId = '';
  let salaryClaimId = '';
  let salaryCreateKey = '';
  let incidentClaimId = '';
  let incidentRestrictionId = '';

  try {
    await check('P0-DISPUTE-1 setup: acteurs et contrat/paiements réels issus du modèle', async () => {
      const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      const otherEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      employerToken = employer.token;
      employerId = employer.userId;
      candidateToken = candidate.token;
      candidateId = candidate.userId;
      otherEmployerToken = otherEmployer.token;
      const seed = await seedActiveContract(harness, employerId, candidateId);
      contractId = seed.contractId;
      m1PaymentId = seed.m1SalaryPaymentId;
      m2PaymentId = seed.m2SalaryPaymentId;
      assert(harness.payments, 'repository paiement PostgreSQL disponible');
      const materialized = await harness.payments.materializePaymentsForContract(contractId);
      assert(materialized === 3, 'les paiements SALARY/commission proviennent de l’échéancier réel');
      assert(harness.claims && harness.automationWorker, 'Claim et worker sont composés seulement en PostgreSQL');
    });

    await check('P0-DISPUTE-1 unauthorized/strict payload: 401, les champs actor/party client sont refusés', async () => {
      const unauthenticated = await harness.worker.fetch(authRequest('/api/v1/my/claims', null));
      assert(unauthenticated.status === 401, `401 attendu, reçu ${unauthenticated.status}`);
      const spoof = await post(harness, '/api/v1/claims', candidateToken, 'claim-spoofed-party', {
        contractId,
        paymentId: m1PaymentId,
        type: 'SALARY_NOT_RECEIVED',
        reason: 'Paiement contesté.',
        claimantId: employerId,
        respondentId: 'usr_client_choice',
        actorId: employerId,
      });
      assert(spoof.status === 400, `champs de partie client refusés, reçu ${spoof.status}`);
      const count = await harness.database.query<{ total: string }>('SELECT count(*)::text AS total FROM claims');
      assert(Number(count.rows[0]?.total ?? 0) === 0, 'aucun Claim après tentative de spoofing');
    });

    await check('P0-DISPUTE-1 rollback: échec du lien incident annule Claim, audit, Outbox et idempotence', async () => {
      await harness.database.query('UPDATE contracts SET incident_id = $2 WHERE id = $1', [contractId, 'legacy-demo-incident']);
      const beforeEvents = await harness.database.query<{ total: string }>("SELECT count(*)::text AS total FROM automation_outbox WHERE event_type LIKE 'CLAIM_%'");
      const failed = await post(harness, '/api/v1/claims', candidateToken, 'claim-rollback-incident', {
        contractId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Incident avec lien concurrent.',
      });
      assert(failed.status === 409, `conflit de lien attendu, reçu ${failed.status}`);
      const claim = await harness.database.query("SELECT claim_id FROM claims WHERE idempotency_key = 'claim-rollback-incident'");
      const idempotency = await harness.database.query(
        "SELECT idempotency_key FROM automation_idempotency WHERE actor_id = $1 AND command = 'claims.create' AND idempotency_key = 'claim-rollback-incident'",
        [candidateId],
      );
      const events = await harness.database.query<{ total: string }>("SELECT count(*)::text AS total FROM automation_outbox WHERE event_type LIKE 'CLAIM_%'");
      const audit = await harness.database.query("SELECT id FROM automation_audit_ledger WHERE action = 'CLAIM_CREATED'");
      assert(claim.rows.length === 0 && idempotency.rows.length === 0, 'claim et réservation idempotente rollbackés');
      assert(Number(events.rows[0].total) === Number(beforeEvents.rows[0].total), 'Outbox rollbackée');
      assert(audit.rows.length === 0, 'audit métier rollbacké');
      await harness.database.query('UPDATE contracts SET incident_id = NULL WHERE id = $1', [contractId]);
      const contract = await harness.database.query<{ status: string; current_month: number }>('SELECT status,current_month FROM contracts WHERE id=$1', [contractId]);
      assert(contract.rows[0].status === 'ACTIVE' && Number(contract.rows[0].current_month) === 1, 'rollback et incident n’altèrent ni statut ni M1');
    });

    await check('P0-DISPUTE-1 concurrent create: une seule ouverture PostgreSQL pour un même paiement', async () => {
      const body = { contractId, paymentId: m1PaymentId, type: 'SALARY_NOT_RECEIVED', reason: 'Salaire M1 non reconnu.' };
      const [a, b] = await Promise.all([
        post(harness, '/api/v1/claims', candidateToken, 'claim-concurrent-a', body),
        post(harness, '/api/v1/claims', candidateToken, 'claim-concurrent-b', body),
      ]);
      const statuses = [a.status, b.status];
      assert(statuses.filter(status => status === 201).length === 1, `une création gagne (statuts ${statuses.join(',')})`);
      assert(statuses.filter(status => status === 409).length === 1, `l’autre création est refusée (statuts ${statuses.join(',')})`);
      const successful = a.status === 201 ? a : b;
      const winnerKey = a.status === 201 ? 'claim-concurrent-a' : 'claim-concurrent-b';
      const bodyResult = await successful.json() as { claimId: string; claimantId: string; respondentId: string; status: string; type: string };
      salaryClaimId = bodyResult.claimId;
      salaryCreateKey = winnerKey;
      assert(bodyResult.claimantId === candidateId && bodyResult.respondentId === employerId, 'parties dérivées du contrat, jamais du body');
      assert(bodyResult.type === 'SALARY_NOT_RECEIVED' && bodyResult.status === 'OPEN', 'type et état initial attendus');
      const count = await harness.database.query<{ total: string }>('SELECT count(*)::text AS total FROM claims WHERE contract_id=$1 AND payment_id=$2', [contractId, m1PaymentId]);
      assert(Number(count.rows[0].total) === 1, 'contrainte PostgreSQL : un seul Claim actif cible');
    });

    await check('P0-DISPUTE-1 idempotence: replay stable, conflit 409, cible et partie autorisées', async () => {
      const body = { contractId, paymentId: m1PaymentId, type: 'SALARY_NOT_RECEIVED', reason: 'Salaire M1 non reconnu.' };
      const replay = await post(harness, '/api/v1/claims', candidateToken, salaryCreateKey, body);
      assert(replay.status === 201, `rejeu attendu 201, reçu ${replay.status}`);
      const replayBody = await replay.json() as { claimId: string };
      assert(replayBody.claimId === salaryClaimId, 'même Claim retourné par l’idempotence durable');
      const conflict = await post(harness, '/api/v1/claims', candidateToken, salaryCreateKey, { ...body, reason: 'Charge différente.' });
      assert(conflict.status === 409, `conflit payload attendu 409, reçu ${conflict.status}`);
      const crossRead = await harness.worker.fetch(authRequest(`/api/v1/claims/${salaryClaimId}`, otherEmployerToken));
      assert(crossRead.status === 403, `acteur non partie refusé, reçu ${crossRead.status}`);
      const ownerRead = await harness.worker.fetch(authRequest(`/api/v1/claims/${salaryClaimId}`, employerToken));
      assert(ownerRead.status === 200, `partie contrat autorisée, reçu ${ownerRead.status}`);
    });

    await check('P0-DISPUTE-1 CLAIM → EVIDENCE_REQUEST → DEADLINE: stores existants, échéance opérateur, sans grace inventée', async () => {
      const first = await harness.automationWorker!.drainEvents(50);
      assert(first.completed === 1, `CLAIM_CREATED traité une fois, reçu ${first.completed}`);
      const second = await harness.automationWorker!.drainEvents(50);
      assert(second.completed === 1, `CLAIM_EVIDENCE_REQUESTED traité une fois, reçu ${second.completed}`);
      const claim = await harness.database.query<{ status: string; due_at: Date | string | null }>('SELECT status,due_at FROM claims WHERE claim_id=$1', [salaryClaimId]);
      assert(claim.rows[0].status === 'EVIDENCE_REQUESTED', 'demande de preuve active');
      const evidence = await harness.database.query<{ requested_from: string; status: string; due_at: Date | string }>(
        'SELECT requested_from,status,due_at FROM claim_evidence_requests WHERE claim_id=$1', [salaryClaimId],
      );
      assert(evidence.rows.length === 1 && evidence.rows[0].requested_from === employerId && evidence.rows[0].status === 'PENDING', 'la partie adverse est résolue depuis le contrat');
      const deadline = await harness.database.query<{ kind: string; status: string; due_at: Date | string; grace_period_ms: string | null; escalation: string }>(
        'SELECT kind,status,due_at,grace_period_ms,escalation FROM automation_deadlines WHERE aggregate_type=$1 AND aggregate_id=$2',
        ['CLAIM', salaryClaimId],
      );
      const job = await harness.database.query<{ job_type: string; status: string; reference: string }>(
        'SELECT job_type,status,reference FROM automation_jobs WHERE aggregate_type=$1 AND aggregate_id=$2', ['CLAIM', salaryClaimId],
      );
      assert(deadline.rows.length === 1 && deadline.rows[0].kind === 'CLAIM_EVIDENCE' && deadline.rows[0].status === 'OPEN', 'deadline dans automation_deadlines');
      assert(deadline.rows[0].grace_period_ms === null && deadline.rows[0].escalation === 'ADMIN_REVIEW', 'aucune grace inventée; escalade ADMIN');
      assert(job.rows.length === 1 && job.rows[0].job_type === 'CLAIM_EVIDENCE_DEADLINE' && job.rows[0].status === 'PENDING', 'job dans automation_jobs');
      assert(new Date(evidence.rows[0].due_at).getTime() - harness.clock.value.getTime() === 60_000, 'durée configurée de 60000ms appliquée exactement');
    });

    await check('P0-DISPUTE-1 evidence concurrency/authorization: seul le destinataire peut soumettre une référence', async () => {
      const request = await harness.database.query<{ evidence_request_id: string }>('SELECT evidence_request_id FROM claim_evidence_requests WHERE claim_id=$1 AND status=$2', [salaryClaimId, 'PENDING']);
      assert(request.rows[0], 'demande de preuve présente');
      const path = `/api/v1/claims/${salaryClaimId}/evidence-requests/${request.rows[0].evidence_request_id}/submit`;
      const wrongParty = await post(harness, path, candidateToken, 'claim-evidence-wrong-party', { evidenceReference: 'metadata://candidate-proof' });
      assert(wrongParty.status === 403, `partie non destinataire refusée, reçu ${wrongParty.status}`);
      const [a, b] = await Promise.all([
        post(harness, path, employerToken, 'claim-evidence-submit-a', { evidenceReference: 'metadata://proof-a' }),
        post(harness, path, employerToken, 'claim-evidence-submit-b', { evidenceReference: 'metadata://proof-b' }),
      ]);
      assert([a.status, b.status].filter(status => status === 200).length === 1, `une soumission gagne (statuts ${a.status},${b.status})`);
      assert([a.status, b.status].filter(status => status === 409).length === 1, `l’autre soumission perd le CAS (statuts ${a.status},${b.status})`);
      const evidence = await harness.database.query<{ status: string; evidence_reference: string }>('SELECT status,evidence_reference FROM claim_evidence_requests WHERE evidence_request_id=$1', [request.rows[0].evidence_request_id]);
      const deadline = await harness.database.query<{ status: string }>('SELECT status FROM automation_deadlines WHERE aggregate_id=$1 AND kind=$2', [salaryClaimId, 'CLAIM_EVIDENCE']);
      const job = await harness.database.query<{ status: string }>('SELECT status FROM automation_jobs WHERE reference=$1', [request.rows[0].evidence_request_id]);
      assert(evidence.rows[0].status === 'SUBMITTED' && evidence.rows[0].evidence_reference.startsWith('metadata://'), 'seule une référence metadata est persistée');
      assert(deadline.rows[0].status === 'MET' && job.rows[0].status === 'COMPLETED', 'réponse reçue annule la deadline/job via CAS existants');
      const eventDrain = await harness.automationWorker!.drainEvents(50);
      assert(eventDrain.completed === 1, 'événement CLAIM_EVIDENCE_SUBMITTED traité');
      const claim = await harness.database.query<{ status: string }>('SELECT status FROM claims WHERE claim_id=$1', [salaryClaimId]);
      assert(claim.rows[0].status === 'ADMIN_REVIEW', 'preuve non déterministe routée vers ADMIN_REVIEW');
    });

    await check('P0-DISPUTE-1 ADMIN: la permission incidents:arbitrate existante est réutilisée sans bypass', async () => {
      const admin = await provisionAdmin(harness);
      adminId = admin.userId;
      adminToken = admin.token;
      await harness.database.query('DELETE FROM role_permissions WHERE role=$1 AND permission_code=$2', ['ADMIN', 'incidents:arbitrate']);
      const denied = await post(harness, `/api/v1/admin/claims/${salaryClaimId}/review`, adminToken, 'claim-admin-denied', { note: 'Review.' });
      assert(denied.status === 403, `ADMIN sans permission existante refusé, reçu ${denied.status}`);
      await harness.database.query('INSERT INTO role_permissions (role,permission_code) VALUES ($1,$2) ON CONFLICT DO NOTHING', ['ADMIN', 'incidents:arbitrate']);
      const list = await harness.worker.fetch(authRequest('/api/v1/admin/claims?limit=10', adminToken));
      assert(list.status === 200, `lecture ADMIN via incidents:read:any, reçu ${list.status}`);
      const listBody = await list.json() as { items: Array<{ claimId: string }> };
      assert(listBody.items.some(item => item.claimId === salaryClaimId), 'Claim listé pour ADMIN');
      const review = await post(harness, `/api/v1/admin/claims/${salaryClaimId}/review`, adminToken, 'claim-admin-review-salary', { note: 'Référence soumise, contrôle requis.' });
      assert(review.status === 200, `revue ADMIN attendue, reçu ${review.status}`);
      const decision = await post(harness, `/api/v1/admin/claims/${salaryClaimId}/decision`, adminToken, 'claim-admin-decision-salary', {
        decision: 'RESOLVE',
        resolution: 'Décision de revue administrative de test; aucun remboursement ni mouvement de fonds.',
      });
      assert(decision.status === 200, `décision ADMIN attendue, reçu ${decision.status}`);
      const claim = await harness.database.query<{ status: string; resolved_by: string; payment_id: string }>('SELECT status,resolved_by,payment_id FROM claims WHERE claim_id=$1', [salaryClaimId]);
      assert(claim.rows[0].status === 'RESOLVED' && claim.rows[0].resolved_by === admin.userId && claim.rows[0].payment_id === m1PaymentId, 'décision liée à la cible réelle et signée ADMIN');
      const audit = await harness.database.query<{ action: string }>('SELECT action FROM automation_audit_ledger WHERE entity_id=$1', [salaryClaimId]);
      assert(audit.rows.some(row => row.action === 'CLAIM_CREATED') && audit.rows.some(row => row.action === 'CLAIM_RESOLVE'), 'création et décision présentes au ledger audit existant');
      const payment = await harness.database.query<{ status: string }>('SELECT status FROM payments WHERE id=$1', [m1PaymentId]);
      assert(payment.rows[0].status === 'SCHEDULED', 'la décision Claim ne modifie pas le paiement ni les fonds');
    });

    await check('P0-DISPUTE-1 AUTO_RESOLUTION: seul PAID + confirmation salariale persistée et concordante clôt le Claim', async () => {
      const payment = await harness.database.query<{ contract_id: string; candidate_id: string; employer_id: string; amount: string; currency: string; period_key: string }>(
        'SELECT contract_id,candidate_id,employer_id,amount,currency,period_key FROM payments WHERE id=$1', [m2PaymentId],
      );
      assert(payment.rows[0], 'paiement M2 réel trouvé');
      // Fixtures métier cohérentes avec les contraintes existantes de P0-PAY-1 :
      // déclaration vérifiée persistée avant le statut PAID (aucun provider/fonds).
      const verifiedAt = harness.clock.value.toISOString();
      const declarationId = `claim-test-declaration:${m2PaymentId}`;
      const reference = `CLAIM-TEST-${m2PaymentId}`;
      await harness.database.query(
        `INSERT INTO payment_declarations (
           id,payment_id,contract_id,period_key,payment_type,attempt_number,amount,currency,
           reference,submitted_at,submitted_by,outcome,reviewed_at,reviewed_by,idempotency_key
         ) SELECT $1,id,contract_id,period_key,payment_type,1,amount,currency,$2,$3,employer_id,
                  'VERIFIED',$3,employer_id,$4
             FROM payments WHERE id=$5`,
        [declarationId, reference, verifiedAt, `claim-test-verify:${m2PaymentId}`, m2PaymentId],
      );
      await harness.database.query(
        `UPDATE payments SET status='PAID', submitted_at=$2, submitted_by=employer_id,
          reference=$3, current_declaration_id=$4, declaration_count=1,
          verified_at=$2, verified_by=employer_id WHERE id=$1`,
        [m2PaymentId, verifiedAt, reference, declarationId],
      );
      await harness.database.query(
        `INSERT INTO salary_confirmations (
           payment_id,contract_id,candidate_id,employer_id,period_key,amount,currency,nonce,otp_digest,
           requested_at,expires_at,confirmed_at,confirmed_by,confirmation_event_id,request_key,confirm_key
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$10,$3,$12,$13,$14)`,
        [
          m2PaymentId, payment.rows[0].contract_id, payment.rows[0].candidate_id, payment.rows[0].employer_id,
          payment.rows[0].period_key, payment.rows[0].amount, payment.rows[0].currency,
          `nonce-${m2PaymentId}`, 'stored-digest-only', harness.clock.value.toISOString(),
          new Date(harness.clock.value.getTime() + 3_600_000).toISOString(), `salary-confirmed:${m2PaymentId}`,
          `salary-request:${m2PaymentId}`, `salary-confirm:${m2PaymentId}`,
        ],
      );
      const created = await post(harness, '/api/v1/claims', candidateToken, 'claim-deterministic-salary', {
        contractId,
        paymentId: m2PaymentId,
        type: 'SALARY_NOT_RECEIVED',
        reason: 'Vérification déterministe de M2.',
      });
      assert(created.status === 201, `création salaire attendue, reçu ${created.status}`);
      const body = await created.json() as { claimId: string; status: string; salaryConfirmationId?: string };
      assert(body.salaryConfirmationId === m2PaymentId, 'référence de confirmation issue de la base');
      await harness.automationWorker!.drainEvents(50);
      const claim = await harness.database.query<{ status: string; resolved_by: string; resolution: string }>('SELECT status,resolved_by,resolution FROM claims WHERE claim_id=$1', [body.claimId]);
      const evidence = await harness.database.query('SELECT evidence_request_id FROM claim_evidence_requests WHERE claim_id=$1', [body.claimId]);
      const restrictions = await harness.database.query('SELECT restriction_id FROM claim_restrictions WHERE claim_id=$1', [body.claimId]);
      assert(claim.rows[0].status === 'RESOLVED' && claim.rows[0].resolved_by === 'SYSTEM', 'résolution automatique fondée sur deux faits persistés concordants');
      assert(claim.rows[0].resolution.toLowerCase().includes('aucun mouvement de fonds') && evidence.rows.length === 0 && restrictions.rows.length === 0, 'résolution informative, sans preuve sollicitée tardive ni sanction');
      const audit = await harness.database.query<{ action: string; after_state: Record<string, unknown> }>('SELECT action,after_state FROM automation_audit_ledger WHERE entity_id=$1', [body.claimId]);
      assert(audit.rows.some(row => row.action === 'CLAIM_AUTO_RESOLVED_SALARY_CONFIRMED' && row.after_state.faultAttributed === false), 'audit déterministe sans attribution de faute');
    });

    await check('P0-DISPUTE-1 incident contractuel: lien incident_id sans transition de statut ni contournement M1', async () => {
      const created = await post(harness, '/api/v1/claims', candidateToken, 'claim-contract-incident', {
        contractId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Événement contractuel à examiner.',
      });
      assert(created.status === 201, `incident Claim attendu, reçu ${created.status}`);
      const body = await created.json() as { claimId: string };
      incidentClaimId = body.claimId;
      const contract = await harness.database.query<{ incident_id: string; status: string; current_month: number }>('SELECT incident_id,status,current_month FROM contracts WHERE id=$1', [contractId]);
      assert(contract.rows[0].incident_id === incidentClaimId && contract.rows[0].status === 'ACTIVE' && Number(contract.rows[0].current_month) === 1, 'lien Claim posé sans changer ACTIVE/M1');
      const terminateM1 = await post(harness, `/api/v1/contracts/${contractId}/terminate`, employerToken, 'claim-terminate-m1', { reason: 'Demande de terminaison M1.' });
      assert(terminateM1.status === 409, `protection M1 toujours prioritaire, reçu ${terminateM1.status}`);
      const stillActive = await harness.database.query<{ status: string; incident_id: string }>('SELECT status,incident_id FROM contracts WHERE id=$1', [contractId]);
      assert(stillActive.rows[0].status === 'ACTIVE' && stillActive.rows[0].incident_id === incidentClaimId, 'M1 inchangé après refus');
    });

    await check('P0-DISPUTE-1 restriction provisoire: interdiction temporaire ciblée, libération et résolution ne réécrivent pas le contrat', async () => {
      await harness.automationWorker!.drainEvents(50);
      await harness.automationWorker!.drainEvents(50);
      const review = await post(harness, `/api/v1/admin/claims/${incidentClaimId}/review`, adminToken, 'claim-admin-review-incident', { note: 'Analyse incident.' });
      assert(review.status === 200, `incident en revue ADMIN, reçu ${review.status}`);
      const applied = await post(harness, `/api/v1/admin/claims/${incidentClaimId}/restrictions`, adminToken, 'claim-restriction-apply', {
        reason: 'Mesure provisoire réversible pendant la revue.',
      });
      assert(applied.status === 200, `restriction appliquée par ADMIN, reçu ${applied.status}`);
      const restriction = await applied.json() as { restrictionId: string; userId: string; scope: string; status: string };
      incidentRestrictionId = restriction.restrictionId;
      assert(restriction.userId === employerId && restriction.scope === 'CONTRACT_TERMINATE' && restriction.status === 'ACTIVE', 'seule la terminaison employeur est temporairement limitée');
      await harness.database.query('UPDATE contracts SET current_month=2 WHERE id=$1', [contractId]);
      const denied = await post(harness, `/api/v1/contracts/${contractId}/terminate`, employerToken, 'claim-terminate-restricted', { reason: 'Tentative pendant restriction.' });
      assert(denied.status === 409, `restriction vérifiée dans la mutation P0-F existante, reçu ${denied.status}`);
      const release = await post(harness, `/api/v1/admin/claims/${incidentClaimId}/restrictions/${incidentRestrictionId}/release`, adminToken, 'claim-restriction-release', {
        reason: 'Restriction non nécessaire après vérification.',
      });
      assert(release.status === 200, `libération ADMIN attendue, reçu ${release.status}`);
      const released = await release.json() as { status: string; releasedBy: string };
      assert(released.status === 'RELEASED' && released.releasedBy === adminId, 'restriction réversible, attribuée à l’ADMIN');
      const allowed = await post(harness, `/api/v1/contracts/${contractId}/terminate`, employerToken, 'claim-terminate-after-release', { reason: 'Terminaison après libération.' });
      assert(allowed.status === 200, `la capacité existante revient après libération, reçu ${allowed.status}`);
      const decision = await post(harness, `/api/v1/admin/claims/${incidentClaimId}/decision`, adminToken, 'claim-admin-decision-incident', {
        decision: 'RESOLVE',
        resolution: 'Incident examiné; aucune sanction définitive appliquée.',
      });
      assert(decision.status === 200, `décision finale ADMIN attendue, reçu ${decision.status}`);
      const contract = await harness.database.query<{ incident_id: string | null; status: string; current_month: number }>('SELECT incident_id,status,current_month FROM contracts WHERE id=$1', [contractId]);
      const restrictionRow = await harness.database.query<{ status: string; released_by: string | null }>('SELECT status,released_by FROM claim_restrictions WHERE restriction_id=$1', [incidentRestrictionId]);
      assert(contract.rows[0].incident_id === null && contract.rows[0].status === 'TERMINATED' && Number(contract.rows[0].current_month) === 2, 'clôture retire le lien sans réécrire le statut métier ou M1');
      assert(restrictionRow.rows[0].status === 'RELEASED' && restrictionRow.rows[0].released_by, 'restriction terminale révoquée et auditée');
      const audit = await harness.database.query<{ action: string }>('SELECT action FROM automation_audit_ledger WHERE entity_id=$1', [incidentClaimId]);
      assert(audit.rows.some(row => row.action === 'CLAIM_PROVISIONAL_RESTRICTION_APPLIED') && audit.rows.some(row => row.action === 'CLAIM_PROVISIONAL_RESTRICTION_RELEASED') && audit.rows.some(row => row.action === 'CLAIM_RESOLVE'), 'application, libération et décision auditables');
    });

    await check('P0-DISPUTE-1 pagination: curseur stable même quand plusieurs Claims partagent created_at', async () => {
      const total = await harness.database.query<{ total: string }>('SELECT count(*)::text AS total FROM claims');
      const expected = Number(total.rows[0]?.total ?? 0);
      const ids: string[] = [];
      let cursor: string | null = null;
      for (let pageNumber = 0; pageNumber < expected + 1; pageNumber += 1) {
        const query = new URLSearchParams({ limit: '1', ...(cursor ? { cursor } : {}) });
        const response = await harness.worker.fetch(authRequest(`/api/v1/admin/claims?${query.toString()}`, adminToken));
        assert(response.status === 200, `page ADMIN attendue, reçu ${response.status}`);
        const page = await response.json() as { items: Array<{ claimId: string }>; cursor: string | null; hasMore: boolean };
        ids.push(...page.items.map(item => item.claimId));
        if (!page.hasMore) break;
        assert(page.cursor, 'curseur suivant attendu');
        cursor = page.cursor;
      }
      assert(ids.length === expected && new Set(ids).size === expected, `aucune Claim omise/doublée (${ids.length}/${expected})`);
    });

    await check('P0-DISPUTE-1 séparation API/DEMO: route non composée reste 501 sans repli Mock', async () => {
      const actor: AuthenticatedActor = { id: candidateId, role: 'CANDIDATE', permissions: [], sessionId: 'boundary-only-session' };
      const boundary = createApiWorker({ authenticate: async () => actor });
      const response = await boundary.fetch(new Request('https://api.test/api/v1/my/claims'));
      assert(response.status === 501, `frontière API sans repository reste 501, reçu ${response.status}`);
      assert(getRepositoryMode() === 'mock' && resolveRepositoryMode({}).mode === 'mock', 'le mode DEMO/mock par défaut reste intact');
    });
  } finally {
    await harness.close();
  }

  return results;
}
