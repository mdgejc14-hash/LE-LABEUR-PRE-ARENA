/**
 * LE LABEUR — P0-AUTO-2 — tests d'intégration réels de l'automatisation
 * contractuelle, sur PostgreSQL (PGlite WASM, mêmes contraintes et mêmes
 * transactions que le moteur réel ; le moteur PostgreSQL natif est exercé par
 * `npm run verify:postgres` et le runtime workerd par `npm run verify:workerd`).
 *
 * Chaîne vérifiée de bout en bout :
 *   API `POST /contracts/:id/activate` → mutation ACTIVE + historique
 *   → `CONTRACT_ACTIVATED` dans `automation_outbox` (MÊME transaction)
 *   → worker → `AutomationEngine` → échéancier salarial + échéancier de
 *   commission → `automation_deadlines` → `automation_jobs` (rappels)
 *   → événements préparés pour le futur module Notifications → audit.
 *
 * Garanties vérifiées : commit atomique, rollback sans trace, rejeu sans double
 * effet, concurrence, retry après échec, dead-letter, périodicités sans règle
 * (aucune invention), aucun paiement, aucune notification envoyée, aucun KYC,
 * aucune offre FILLED, aucune candidature fermée, DEMO inchangé.
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from '../api/offers.test';
import type { AuthenticatedActor } from '../productionContracts';
import type { ApplicationRecord, OfferRecord, ProposalRecord } from '../persistence/coreRecords';
import {
  createSqlApplicationStore,
  createSqlContractStore,
  createSqlOfferStore,
  createSqlProposalStore,
} from '../persistence/sqlCoreStores';
import { createSqlAutomationStores } from '../persistence/sqlAutomationStores';
import { createSqlUserStore } from '../identity/sqlStores';
import { createContractRepository } from '../repositories/contractRepository';
import { contractIdempotencyCache } from '../repositories/contractRepository';
import { createDomainEvent } from './foundation';
import { DEFERRED_NOTIFICATION_EVENT_TYPES } from './contractActivation';
import type { EventDrainReport } from './worker';
import { ApiError } from '../api/errors';
import { newEntityId } from '../identity/ids';
import { buildPaymentSchedule } from '../../domain/businessRules';
import {
  CONTRACT_ACTIVATION_COMMAND,
  PAYMENT_OVERDUE_GRACE_PERIOD_MS,
  contractActivatedEventId,
  contractActivatedIdempotencyKey,
} from '../../domain/contractScheduleAutomation';
import { resolveRepositoryMode } from '../../repositories/mode';
import { composeWorker } from '../api/entry';
import type { ProposalStatus } from '../../types';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SEED_TIMESTAMP = '2026-10-05T15:00:00.000Z';
const ACTIVATION_TIME = '2026-10-05T14:00:00.000Z';

/* ------------------------------------------------------------------ */
/* Seed                                                               */
/* ------------------------------------------------------------------ */

function makeOffer(id: string, employerId: string, status: OfferRecord['status'] = 'ACTIVE'): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre ${id}`,
    contractType: 'CDI',
    remuneration: 175_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_TIMESTAMP,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre de test P0-AUTO-2.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

interface ChainOptions {
  employerId: string;
  employeeId: string;
  periodicity?: ProposalRecord['periodicity'];
  startDate?: string;
  durationMonths?: number;
  amount?: number;
  /** Candidatures concurrentes sur la même offre (vérification ÉTAPE 9). */
  competingCandidateIds?: readonly string[];
}

/** Offre ACTIVE + candidatures + proposition ACCEPTED, entièrement en base. */
async function seedAcceptedChain(harness: Harness, options: ChainOptions): Promise<{
  offerId: string;
  applicationId: string;
  proposalId: string;
  competingApplicationIds: string[];
}> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, options.employerId));

  const applicationId = newEntityId('app');
  const application: ApplicationRecord = {
    id: applicationId,
    offerId,
    candidateId: options.employeeId,
    status: 'SHORTLISTED',
    appliedDate: SEED_TIMESTAMP,
    history: [{ action: 'Candidature transmise', timestamp: SEED_TIMESTAMP, actor: 'Candidat P0-AUTO-2' }],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
  await createSqlApplicationStore(harness.database).create(application);

  const competingApplicationIds: string[] = [];
  for (const candidateId of options.competingCandidateIds ?? []) {
    const competingId = newEntityId('app');
    await createSqlApplicationStore(harness.database).create({
      id: competingId,
      offerId,
      candidateId,
      status: 'PENDING',
      appliedDate: SEED_TIMESTAMP,
      history: [{ action: 'Candidature transmise', timestamp: SEED_TIMESTAMP, actor: 'Candidat concurrent' }],
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP,
    });
    competingApplicationIds.push(competingId);
  }

  const proposalId = newEntityId('prp');
  const proposal: ProposalRecord = {
    id: proposalId,
    conversationId: `cnv_${proposalId}`,
    offerId,
    applicationId,
    employerId: options.employerId,
    employeeId: options.employeeId,
    missionTitle: `Mission ${proposalId}`,
    amount: options.amount ?? 175_000,
    currency: 'FCFA',
    periodicity: options.periodicity ?? 'Mensuel',
    startDate: options.startDate ?? '01 Novembre 2026',
    durationMonths: options.durationMonths ?? 6,
    location: 'Cotonou',
    conditions: ['Temps plein'],
    status: 'ACCEPTED' as ProposalStatus,
    sentAt: SEED_TIMESTAMP,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
  await createSqlProposalStore(harness.database).create(proposal);

  return { offerId, applicationId, proposalId, competingApplicationIds };
}

function contractRequest(
  path: string,
  token: string | null,
  key: string,
  body: Record<string, unknown> = {},
): Request {
  return authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

/** Parcours API réel : DRAFT → SIGNATURE → double signature → ACTIVE. */
async function activateContractThroughApi(
  harness: Harness,
  input: {
    employerToken: string;
    candidateToken: string;
    proposalId: string;
    keyPrefix: string;
  },
): Promise<string> {
  const created = await harness.worker.fetch(contractRequest(
    '/api/v1/contracts',
    input.employerToken,
    `${input.keyPrefix}-create`,
    { proposalId: input.proposalId },
  ));
  assert(created.status === 201, `création 201 attendue, reçue ${created.status}`);
  const contract = await created.json() as { id: string; status: string };
  assert(contract.status === 'DRAFT', `DRAFT attendu, reçu ${contract.status}`);

  const sent = await harness.worker.fetch(contractRequest(
    `/api/v1/contracts/${contract.id}/send`,
    input.employerToken,
    `${input.keyPrefix}-send`,
  ));
  assert(sent.status === 200, `envoi 200 attendu, reçu ${sent.status}`);

  const signed = await harness.worker.fetch(contractRequest(
    `/api/v1/contracts/${contract.id}/sign`,
    input.candidateToken,
    `${input.keyPrefix}-sign`,
  ));
  assert(signed.status === 200, `signature 200 attendue, reçue ${signed.status}`);

  const activated = await harness.worker.fetch(contractRequest(
    `/api/v1/contracts/${contract.id}/activate`,
    input.employerToken,
    `${input.keyPrefix}-activate`,
  ));
  assert(activated.status === 200, `activation 200 attendue, reçue ${activated.status}`);
  const body = await activated.json() as { status: string };
  assert(body.status === 'ACTIVE', `ACTIVE attendu, reçu ${body.status}`);
  return contract.id;
}

/* ------------------------------------------------------------------ */
/* Lectures                                                           */
/* ------------------------------------------------------------------ */

/** PGlite renvoie des objets `Date` pour TIMESTAMPTZ : normalisation ISO. */
function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

interface OutboxRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id: string | null;
  payload: unknown;
  source: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

async function readOutbox(harness: Harness, aggregateId: string): Promise<OutboxRow[]> {
  const result = await harness.database.query<OutboxRow>(
    `SELECT id, event_type, aggregate_type, aggregate_id, actor_id, payload, source,
            status, attempts, last_error
       FROM automation_outbox
      WHERE aggregate_id = $1
      ORDER BY id ASC`,
    [aggregateId],
  );
  return result.rows;
}

function payloadOf(row: OutboxRow): Record<string, unknown> {
  if (typeof row.payload === 'string') return JSON.parse(row.payload) as Record<string, unknown>;
  return (row.payload ?? {}) as Record<string, unknown>;
}

interface DeadlineRow {
  id: string;
  aggregate_id: string;
  kind: string;
  due_at: string;
  status: string;
  sla: string | null;
  grace_period_ms: string | number | null;
  escalation: string | null;
  reference: string | null;
  idempotency_key: string;
  source_event_id: string | null;
}

async function readDeadlines(harness: Harness, contractId: string): Promise<DeadlineRow[]> {
  const result = await harness.database.query<DeadlineRow>(
    `SELECT id, aggregate_id, kind, due_at, status, sla, grace_period_ms, escalation,
            reference, idempotency_key, source_event_id
       FROM automation_deadlines
      WHERE aggregate_type = 'contract' AND aggregate_id = $1
      ORDER BY due_at ASC, id ASC`,
    [contractId],
  );
  return result.rows.map(row => ({ ...row, due_at: toIso(row.due_at) }));
}

interface JobRow {
  job_id: string;
  job_type: string;
  aggregate_id: string;
  due_at: string;
  status: string;
  attempts: number;
  idempotency_key: string;
  reference: string | null;
}

async function readJobs(harness: Harness, contractId: string): Promise<JobRow[]> {
  const result = await harness.database.query<JobRow>(
    `SELECT job_id, job_type, aggregate_id, due_at, status, attempts, idempotency_key, reference
       FROM automation_jobs
      WHERE aggregate_type = 'contract' AND aggregate_id = $1
      ORDER BY due_at ASC, job_id ASC`,
    [contractId],
  );
  return result.rows.map(row => ({ ...row, due_at: toIso(row.due_at) }));
}

interface AuditRow {
  id: string;
  event_id: string | null;
  actor_id: string;
  occurred_at: string;
  entity_id: string;
  action: string;
  after_state: unknown;
  source: string;
  reference: string | null;
}

async function readAudit(harness: Harness, entityId: string): Promise<AuditRow[]> {
  const result = await harness.database.query<AuditRow>(
    `SELECT id, event_id, actor_id, occurred_at, entity_id, action, after_state, source, reference
       FROM automation_audit_ledger
      WHERE entity_id = $1
      ORDER BY occurred_at ASC, id ASC`,
    [entityId],
  );
  return result.rows;
}

function stateOf(row: AuditRow): Record<string, unknown> {
  if (typeof row.after_state === 'string') return JSON.parse(row.after_state) as Record<string, unknown>;
  return (row.after_state ?? {}) as Record<string, unknown>;
}

interface ContractScheduleRow {
  status: string;
  periodicity: string;
  commission_percentage: string | number;
  commission_amount_due: string | number;
  commission_status: string;
  current_month: number;
  payment_schedule: unknown;
  monthly_checkpoints: unknown;
  commission_ledger: unknown;
  history: unknown;
}

function readJsonArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [];
  }
  return [];
}

async function readContractSchedule(harness: Harness, contractId: string): Promise<ContractScheduleRow | null> {
  const result = await harness.database.query<ContractScheduleRow>(
    `SELECT status, periodicity, commission_percentage, commission_amount_due, commission_status,
            current_month, payment_schedule, monthly_checkpoints, commission_ledger, history
       FROM contracts WHERE id = $1`,
    [contractId],
  );
  return result.rows[0] ?? null;
}

async function countRows(harness: Harness, table: string, where: string, values: unknown[]): Promise<number> {
  const result = await harness.database.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE ${where}`,
    values,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Bascule une échéance en DUE : état produit par le cycle paiements (non ouvert). */
async function markScheduleEntryDue(
  harness: Harness,
  contractId: string,
  monthNumber: number,
  kinds: Array<'SALARY' | 'COMMISSION'> = ['SALARY', 'COMMISSION'],
): Promise<void> {
  const row = await readContractSchedule(harness, contractId);
  assert(row, 'contrat attendu');
  const schedule = readJsonArray(row!.payment_schedule).map(entry => {
    if (Number(entry.monthNumber) !== monthNumber) return entry;
    const updated = { ...entry };
    if (kinds.includes('SALARY')) updated.salaryStatus = 'DUE';
    if (kinds.includes('COMMISSION')) updated.commissionStatus = 'DUE';
    return updated;
  });
  await harness.database.query(
    'UPDATE contracts SET payment_schedule = $2::jsonb WHERE id = $1',
    [contractId, JSON.stringify(schedule)],
  );
}

/**
 * Compose un SECOND worker d'automatisation sur la même base : modèle réel d'un
 * autre processus/instance, avec son propre moteur et son propre cache de rejeu.
 */
function freshAutomationWorker(harness: Harness): NonNullable<Harness['automationWorker']> {
  const composition = composeWorker(
    { GOOGLE_CLIENT_ID: 'test-offers-audience', PERSISTENCE: 'postgres', SESSION_TTL_SECONDS: '3600' },
    harness.database,
    { now: () => harness.clock.value },
  );
  assert(composition.automationWorker !== undefined, 'un second worker doit être composé sur la même base');
  return composition.automationWorker!;
}

/* ------------------------------------------------------------------ */
/* Suite                                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Phase 2 — exécution des rappels (horloge avancée, base dédiée)       */
/* ------------------------------------------------------------------ */

/**
 * Les tests d'exécution des rappels avancent l'horloge de plusieurs mois :
 * les sessions et les credentials Google de test expireraient. Ils sont donc
 * menés sur une base DÉDIÉE, où le contrat est créé et activé par l'API AVANT
 * tout saut d'horloge, puis où seuls PostgreSQL et le worker sont sollicités.
 */
async function runReminderExecutionPhase(
  results: OfferTestResult[],
): Promise<void> {
  contractIdempotencyCache.clear();
  const check = async (name: string, test: () => Promise<void>): Promise<void> => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const harness = await createOffersTestHarness();
  assert(harness.automation !== undefined, 'automatisation composée sur PostgreSQL');
  assert(harness.automationWorker !== undefined, 'worker d’automatisation composé sur PostgreSQL');

  try {
    const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');

    const chain = await seedAcceptedChain(harness, {
      employerId: employer.userId,
      employeeId: candidate.userId,
    });
    const contractId = await activateContractThroughApi(harness, {
      employerToken: employer.token,
      candidateToken: candidate.token,
      proposalId: chain.proposalId,
      keyPrefix: 'p0auto2-reminders-001',
    });

    await check('P0-AUTO-2 Rappels (précondition): échéancier, échéances et rappels armés avant tout saut d’horloge', async () => {
      const report = await harness.automationWorker!.drainEvents(10);
      assert(report.claimed === 1 && report.completed === 1, 'événement d’activation traité');
      assert(readJsonArray((await readContractSchedule(harness, contractId))?.payment_schedule).length === 6, 'échéancier créé');
      assert((await readDeadlines(harness, contractId)).length === 7, 'échéances créées');
      const jobs = await readJobs(harness, contractId);
      assert(jobs.length === 14 && jobs.every(job => job.status === 'PENDING'), 'rappels armés, aucun exécuté');
    });

    /* ---------------- 10. Rappels exécutés ---------------- */

    await check('P0-AUTO-2 Rappels: à l’échéance, le job produit l’événement préparé et passe l’échéance en OVERDUE', async () => {
      await markScheduleEntryDue(harness, contractId, 1);
      harness.clock.value = new Date('2026-12-01T09:00:00.000Z');

      const report = await harness.automationWorker!.runDueJobs(20);
      const dueEntries = report.entries.filter(entry => entry.contractId === contractId);
      assert(dueEntries.length === 2, `2 rappels échus attendus (salaire + commission M1), reçus ${dueEntries.length}`);
      assert(
        dueEntries.every(entry => entry.result === 'completed'),
        `2 rappels terminés attendus, reçus ${JSON.stringify(dueEntries.map(entry => entry.result))}`,
      );

      const salary = dueEntries.find(entry => entry.jobType === 'SALARY_DUE_REMINDER')!;
      assert(salary.outcome?.eligibility === 'ELIGIBLE', 'rappel salarial éligible');
      assert(salary.outcome?.notificationType === 'MONTHLY_CHECKPOINT', 'type de notification réel du modèle');
      assert(salary.outcome?.eventType === 'NOTIFICATION_REQUIRED', 'événement de la fondation');
      assert(salary.outcome?.deadlineStatus === 'OVERDUE', 'échéance passée en OVERDUE');

      const commission = dueEntries.find(entry => entry.jobType === 'COMMISSION_DUE_REMINDER')!;
      assert(commission.outcome?.notificationType === 'COMMISSION_DUE', 'type de notification réel');

      const events = await readOutbox(harness, contractId);
      const notifications = events.filter(row => row.event_type === 'NOTIFICATION_REQUIRED');
      assert(notifications.length === 2, `2 événements préparés, reçus ${notifications.length}`);
      for (const notification of notifications) {
        const payload = payloadOf(notification);
        assert(payload.contractId === contractId, 'contractId porté');
        assert(payload.channel === null, 'AUCUN canal de notification');
        assert(String(payload.note).includes('aucun canal'), 'l’absence de canal est explicite');
        assert(payload.daysLate === 0, 'jours de retard réels');
        assert(payload.scheduleEntryId === `PSE-${contractId}-M1`, 'entrée d’échéancier tracée');
        assert(payload.dedupeKey === `${contractId}:1:${payload.paymentKind}:DUE`, 'clé de déduplication réelle');
        assert(notification.status === 'PENDING', 'événement préparé, en attente du module Notifications');
      }

      const deadlines = await readDeadlines(harness, contractId);
      const salaryDeadline = deadlines.find(deadline => deadline.kind === 'SALARY_PAYMENT')!;
      assert(salaryDeadline.status === 'OVERDUE', 'échéance salariale OVERDUE');
      const commissionDeadline = deadlines.find(deadline => deadline.kind === 'COMMISSION_PAYMENT')!;
      assert(commissionDeadline.status === 'OVERDUE', 'échéance de commission OVERDUE');

      const jobs = await readJobs(harness, contractId);
      assert(
        jobs.filter(job => job.job_type.endsWith('DUE_REMINDER') && job.due_at.startsWith('2026-12-01'))
          .every(job => job.status === 'COMPLETED'),
        'les jobs échus sont terminés',
      );
    });

    await check('P0-AUTO-2 Rappels J+3: escalade réelle, événement PAYMENT_OVERDUE_J3 et échéance ESCALATED', async () => {
      harness.clock.value = new Date('2026-12-04T09:00:00.000Z');
      const report = await harness.automationWorker!.runDueJobs(20);
      const j3Entries = report.entries.filter(entry => entry.contractId === contractId);
      assert(j3Entries.length === 2, `2 rappels J+3 échus attendus, reçus ${j3Entries.length}`);
      assert(
        j3Entries.every(entry => entry.result === 'completed'),
        'rappels J+3 terminés',
      );

      for (const entry of j3Entries) {
        assert(entry.outcome?.eligibility === 'ELIGIBLE', 'rappel J+3 éligible');
        assert(entry.outcome?.daysLate === 3, 'jours de retard réels (formule du modèle)');
        assert(entry.outcome?.notificationType === 'PAYMENT_OVERDUE_J3', 'type réel J+3');
        assert(entry.outcome?.eventType === 'PAYMENT_OVERDUE_J3', 'événement de domaine déjà déclaré');
        assert(entry.outcome?.deadlineStatus === 'ESCALATED', 'échéance escaladée');
      }

      const events = await readOutbox(harness, contractId);
      const overdue = events.filter(row => row.event_type === 'PAYMENT_OVERDUE_J3');
      assert(overdue.length === 2, `2 événements J+3 préparés, reçus ${overdue.length}`);
      for (const row of overdue) {
        const payload = payloadOf(row);
        assert(payload.daysLate === 3, 'jours de retard persistés');
        assert(payload.channel === null, 'aucun canal');
        assert(JSON.stringify(payload.recipientKinds) === JSON.stringify(['EMPLOYER', 'ADMIN']), 'destinataires du modèle, non résolus');
      }

      const deadlines = await readDeadlines(harness, contractId);
      assert(
        deadlines.filter(deadline => deadline.due_at.startsWith('2026-12-01'))
          .every(deadline => deadline.status === 'ESCALATED'),
        'les échéances M1 sont escaladées',
      );
      assert(
        deadlines.filter(deadline => !deadline.due_at.startsWith('2026-12-01'))
          .every(deadline => deadline.status === 'OPEN'),
        'les échéances futures restent ouvertes',
      );

      const audit = await readAudit(harness, contractId);
      const j3 = audit.filter(row => row.action === 'SCHEDULE_J3_ELIGIBILITY_RECORDED');
      assert(j3.length === 2, `2 audits J+3 attendus, reçus ${j3.length}`);
      for (const row of j3) {
        const state = stateOf(row);
        for (const field of ['scheduleEntryId', 'paymentKind', 'dueDate', 'status', 'daysLate', 'outboxEventId']) {
          assert(state[field] !== undefined, `champ d’audit réel manquant: ${field}`);
        }
        assert(row.actor_id === 'SYSTEM', 'acteur SYSTEM réel');
        assert(row.source === 'automation:P0-AUTO-2', 'source réelle');
        assert(row.occurred_at !== null, 'horodatage réel');
      }
    });

    await check('P0-AUTO-2 Rappels: un job déjà terminé ne peut jamais être exécuté deux fois', async () => {
      const jobs = await readJobs(harness, contractId);
      const completed = jobs.find(job => job.status === 'COMPLETED')!;
      const again = await harness.automationWorker!.runDueJobs(20);
      assert(
        again.entries.every(entry => entry.jobId !== completed.job_id),
        'un job COMPLETED n’est jamais réclamé',
      );
      const eventsBefore = (await readOutbox(harness, contractId)).length;
      const forced = await harness.database.run(async transaction =>
        createSqlAutomationStores(transaction).jobs.compareAndSetStatus(completed.job_id, ['RUNNING'], {
          status: 'COMPLETED',
          at: harness.clock.value.toISOString(),
        }));
      assert(forced === null, 'le compare-and-set refuse de rejouer un job terminé');
      assert((await readOutbox(harness, contractId)).length === eventsBefore, 'aucun événement supplémentaire');
      const stored = await harness.database.query<{ status: string }>(
        'SELECT status FROM automation_jobs WHERE job_id = $1', [completed.job_id],
      );
      assert(stored.rows[0].status === 'COMPLETED', 'statut terminal conservé');
    });

    await check('P0-AUTO-2 Rappels: même job rejoué directement → un seul événement (idempotence durable)', async () => {
      const jobs = await readJobs(harness, contractId);
      const done = jobs.find(job => job.status === 'COMPLETED' && job.job_type === 'SALARY_DUE_REMINDER')!;
      const eventsBefore = (await readOutbox(harness, contractId)).length;
      const handler = harness.automation!.jobs.get(done.job_type);
      assert(handler !== undefined, 'handler de rappel enregistré');
      const automationJob = {
        jobId: done.job_id,
        jobType: done.job_type,
        target: { aggregateType: 'contract', aggregateId: contractId },
        dueAt: done.due_at,
        status: 'COMPLETED' as const,
        attempts: 1,
        idempotencyKey: done.idempotency_key,
        createdAt: ACTIVATION_TIME,
        ...(done.reference ? { reference: done.reference } : {}),
      };
      const outcome = await harness.database.run(async transaction => {
        const stores = createSqlAutomationStores(transaction);
        return handler!({
          job: automationJob,
          paymentKind: 'SALARY',
          stage: 'DUE',
          stores,
          now: harness.clock.value,
        });
      });
      assert(outcome.eligibility === 'DUPLICATE', `rejeu attendu, reçu ${outcome.eligibility}`);
      assert(outcome.eventId === null, 'aucun second événement produit');
      assert((await readOutbox(harness, contractId)).length === eventsBefore, 'aucun événement supplémentaire');
      assert(
        (await readAudit(harness, contractId)).filter(row => row.action === 'AUTOMATION_DUPLICATE_SUPPRESSED').length >= 1,
        'le doublon de rappel est audité',
      );
    });

    await check('P0-AUTO-2 Rappels: échéance non basculée en DUE → aucun événement (le cycle paiements n’est pas ouvert)', async () => {
      // Seule M1 a été basculée en DUE plus haut. M2 reste SCHEDULED : le
      // basculement SCHEDULED → DUE appartient au cycle paiements
      // (`syncPaymentSchedule` / `advanceContractMonth`), qui n’est PAS ouvert.
      const before = (await readOutbox(harness, contractId)).length;
      harness.clock.value = new Date('2027-01-02T09:00:00.000Z');
      const report = await harness.automationWorker!.runDueJobs(20);
      const m2 = report.entries.filter(entry => entry.contractId === contractId);
      assert(m2.length === 1, `un seul rappel échu pour M2 (salaire), reçus ${m2.length}`);
      assert(m2[0].jobType === 'SALARY_DUE_REMINDER', 'rappel salarial de M2');
      for (const entry of m2) {
        assert(entry.outcome?.eligibility === 'NOT_ELIGIBLE', `statut SCHEDULED non éligible, reçu ${entry.outcome?.eligibility}`);
        assert(entry.outcome?.eventId === null, 'aucun événement inventé');
        assert(String(entry.outcome?.reason ?? '').includes('cycle paiements'), 'la raison documente la règle absente');
      }
      assert((await readOutbox(harness, contractId)).length === before, 'aucun événement produit pour une échéance non due');
      const m2Deadline = (await readDeadlines(harness, contractId))
        .find(deadline => deadline.reference === `PSE-${contractId}-M2` && deadline.kind === 'SALARY_PAYMENT')!;
      assert(m2Deadline.status === 'OPEN', 'l’échéance non due reste ouverte');
    });

    await check('P0-AUTO-2 Notifications: les événements préparés sont désormais CONSOMMÉS par la couche de notification (In-App), sans aucun canal externe', async () => {
      const preparedBefore = (await readOutbox(harness, contractId))
        .filter(row => (DEFERRED_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(row.event_type));
      assert(preparedBefore.length === 4, `4 événements préparés attendus, reçus ${preparedBefore.length}`);
      assert(
        preparedBefore.every(row => row.status === 'PENDING' && row.attempts === 0),
        'aucun consumer ne les a réclamés avant la passe de notification',
      );

      const report = await harness.automationWorker!.drainEvents(20);
      const claimed = report.entries
        .filter(entry => (DEFERRED_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(entry.eventType));
      assert(claimed.length === 4, `les 4 événements préparés sont réclamés par le consumer réel, reçus ${claimed.length}`);
      assert(
        claimed.every(entry => entry.result === 'completed'),
        `traitement complet des événements préparés, reçu ${JSON.stringify(claimed)}`,
      );

      const preparedAfter = (await readOutbox(harness, contractId))
        .filter(row => (DEFERRED_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(row.event_type));
      assert(
        preparedAfter.every(row => row.status === 'PROCESSED'),
        'les événements préparés sont traités par P0-NOTIFICATIONS (plus jamais « sans consumer »)',
      );

      // Ce qui est produit reste In-App, rattaché à un compte RÉEL, et l'état
      // des canaux externes ne peut jamais prétendre à un envoi.
      const notifications = await harness.database.query<{ recipient_id: string; type: string; push_status: string; email_status: string }>(
        `SELECT recipient_id, type, push_status, email_status FROM notifications
          WHERE source_event_type IN ('NOTIFICATION_REQUIRED', 'PAYMENT_OVERDUE_J3')`,
      );
      assert(notifications.rows.length >= 4, `notifications In-App produites, reçues ${notifications.rows.length}`);
      assert(
        notifications.rows.every(row => row.push_status === 'NOT_AVAILABLE' && row.email_status === 'NOT_AVAILABLE'),
        'aucun fournisseur Push/Email installé : jamais un faux « envoyé »',
      );
      const unknownRecipients = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM notifications AS n
          WHERE n.source_event_type IN ('NOTIFICATION_REQUIRED', 'PAYMENT_OVERDUE_J3')
            AND n.recipient_id NOT IN (SELECT id FROM users)`,
      );
      assert(Number(unknownRecipients.rows[0]?.count ?? 0) === 0, 'tout destinataire est un compte réel');

      const externalChannelTables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%email%' OR table_name ILIKE '%sms%'
                 OR table_name ILIKE '%whatsapp%' OR table_name ILIKE '%push%')`,
      );
      assert(externalChannelTables.rows.length === 0, 'aucune table de canal externe');
    });

    /* ---------------- 11. Audit ---------------- */

    await check('P0-AUTO-2 Audit: chaque automatisation importante est tracée (contrat, événement, action, source, résultat)', async () => {
      const audit = await readAudit(harness, contractId);
      for (const action of [
        'CONTRACT_SCHEDULE_CREATED',
        'CONTRACT_PAYMENT_DEADLINES_CREATED',
        'CONTRACT_REMINDER_JOBS_SCHEDULED',
        'SCHEDULE_DUE_REMINDER_RECORDED',
        'SCHEDULE_J3_ELIGIBILITY_RECORDED',
      ]) {
        assert(audit.some(row => row.action === action), `action d’audit manquante: ${action}`);
      }
      for (const row of audit) {
        assert(row.entity_id === contractId, 'contractId conservé');
        assert(row.actor_id === 'SYSTEM', 'source actor SYSTEM');
        // P0-PAY-1 a ajouté une écriture d'automatisation SUR LE CONTRAT : la
        // materialisation des lignes `payments`. Elle porte sa PROPRE source, et
        // aucune action de P0-AUTO-2 ne peut en hériter — la séparation reste
        // donc contrôlée, ligne par ligne, au lieu d'être globale et floue.
        const expectedSource = row.action === 'PAYMENTS_MATERIALIZED' || row.action === 'PAYMENT_PRE_DUE_REMINDER_RECORDED'
          ? 'automation:P0-PAY-1'
          : 'automation:P0-AUTO-2';
        assert(row.source === expectedSource, `source de l’automatisation (${row.action})`);
        assert(row.occurred_at !== null, 'horodatage réel');
      }
      const materialization = audit.find(row => row.action === 'PAYMENTS_MATERIALIZED');
      if (materialization) {
        const state = stateOf(materialization);
        // Attendu = un paiement salarial par période, plus une commission
        // uniquement là où elle est strictement positive (règle réelle du modèle,
        // jamais une hypothèse sur le nombre de lignes).
        const schedule = readJsonArray((await readContractSchedule(harness, contractId))?.payment_schedule);
        const expected = schedule.length + schedule.filter(entry => Number(entry.commissionAmount) > 0).length;
        assert(expected > 0, 'échéancier de référence disponible pour le calcul');
        assert(
          state.requested === expected && state.created === expected,
          `materialisation du cycle complète (${expected} paiements attendus), reçus ${JSON.stringify({ requested: state.requested, created: state.created })}`,
        );
        assert(state.duplicates === 0, 'première materialisation sans doublon');
        assert(Array.isArray(state.payments) && (state.payments as unknown[]).length === expected, 'détail des paiements tracé');
        assert(
          (state.payments as { status?: string }[]).every(payment => payment.status === 'SCHEDULED'),
          'aucun paiement materialisé au-delà de SCHEDULED',
        );
        assert(state.note === 'Aucun paiement exécuté : agrégat métier du cycle uniquement.', 'absence de paiement réel affirmée');
      }
      const scheduleAudit = audit.find(row => row.action === 'CONTRACT_SCHEDULE_CREATED')!;
      assert(scheduleAudit.event_id === contractActivatedEventId(contractId), 'eventId tracé');
      const state = stateOf(scheduleAudit);
      assert(state.periods === 6 && state.cadence === 'MONTHLY', 'résultat tracé');
      assert(state.commissionPercentage === 25 && state.commissionAmountDue === 43_750, 'commission tracée');
      assert(Array.isArray(state.salaryEntries) && (state.salaryEntries as unknown[]).length === 6, 'détail des échéances tracé');

      const reminders = audit.find(row => row.action === 'CONTRACT_REMINDER_JOBS_SCHEDULED')!;
      const remindersState = stateOf(reminders);
      assert(remindersState.created === 14 && remindersState.duplicates === 0, 'rappels tracés');
      assert(JSON.stringify(remindersState.notificationChannels) === '[]', 'aucun canal déclaré');
    });

    await check('P0-AUTO-2 Audit: l’historique métier du contrat est CONSERVÉ, jamais remplacé par le ledger', async () => {
      const row = await readContractSchedule(harness, contractId);
      const history = readJsonArray(row?.history);
      for (const event of ['CONTRACT_CREATED', 'EMPLOYER_SIGNED', 'EMPLOYEE_SIGNED', 'CONTRACT_ACTIVATED_BILATERAL']) {
        assert(history.some(entry => entry.event === event), `événement métier ${event} conservé`);
      }
      assert(history.some(entry => entry.event === 'PAYMENT_SCHEDULE_CREATED'), 'événement d’automatisation ajouté');
      const audit = await readAudit(harness, contractId);
      assert(audit.length > 0, 'le ledger est distinct de l’historique métier');
      assert(
        history.filter(entry => entry.event === 'CONTRACT_ACTIVATED_BILATERAL').length === 1,
        'l’historique d’activation n’est pas dupliqué',
      );
    });
  } finally {
    await harness.close();
    contractIdempotencyCache.clear();
  }
}

export async function runContractAutomationTests(): Promise<OfferTestResult[]> {
  contractIdempotencyCache.clear();
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>): Promise<void> => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const harness = await createOffersTestHarness();
  assert(harness.automation !== undefined, 'l’automatisation P0-AUTO-2 doit être composée sur PostgreSQL');
  assert(harness.automationWorker !== undefined, 'le worker d’automatisation doit être composé sur PostgreSQL');

  try {
    const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
    const secondCandidate = await authenticateActor(harness, 'candidate-2', 'CANDIDATE');

    /* ---------------- 1. CONTRAT_ACTIVATED réel ---------------- */

    let mainContractId = '';

    await check('P0-AUTO-2 Événement: CONTRACT_ACTIVATED écrit dans l’Outbox PostgreSQL par l’API d’activation', async () => {
      const chain = await seedAcceptedChain(harness, {
        employerId: employer.userId,
        employeeId: candidate.userId,
        competingCandidateIds: [secondCandidate.userId],
      });
      mainContractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0auto2-event-001',
      });

      const events = await readOutbox(harness, mainContractId);
      const activation = events.filter(row => row.event_type === 'CONTRACT_ACTIVATED');
      assert(activation.length === 1, `un seul événement d’activation attendu, reçu ${activation.length}`);
      assert(activation[0].id === contractActivatedEventId(mainContractId), 'identifiant déterministe (dedupeKey « contractId + ACTIVATED »)');
      assert(activation[0].aggregate_type === 'contract', 'agrégat réel');
      assert(activation[0].status === 'PENDING', 'l’événement attend son consumer');
      assert(activation[0].attempts === 0, 'aucune tentative avant le drain');
      assert(activation[0].actor_id === employer.userId, 'acteur issu de la session serveur');
      assert(activation[0].source === 'api:contracts.activate', 'source réelle de l’événement');

      const payload = payloadOf(activation[0]);
      for (const field of ['contractId', 'proposalId', 'offerId', 'applicationId', 'occurredAt']) {
        assert(payload[field] !== undefined, `charge utile documentée incomplète: ${field}`);
      }
      assert(payload.contractId === mainContractId, 'contractId de la charge utile');
      assert(payload.employerId === employer.userId && payload.employeeId === candidate.userId, 'parties réelles');
      assert(payload.monthlySalary === 175_000 && payload.currency === 'FCFA', 'modalités du contrat');
      assert(payload.periodicity === 'Mensuel' && payload.durationMonths === 6, 'périodicité et durée réelles');
      assert(payload.commissionPercentage === 25, 'pourcentage de commission du modèle (25)');
    });

    await check('P0-AUTO-2 Atomicité: mutation ACTIVE, historique et événement sont commise ensemble', async () => {
      const row = await readContractSchedule(harness, mainContractId);
      assert(row?.status === 'ACTIVE', 'mutation d’activation commise');
      const history = readJsonArray(row?.history);
      assert(
        history.some(entry => entry.event === 'CONTRACT_ACTIVATED_BILATERAL'),
        'historique métier P0-F conservé',
      );
      const events = await readOutbox(harness, mainContractId);
      assert(
        events.some(item => item.event_type === 'CONTRACT_ACTIVATED'),
        'événement commi avec la mutation',
      );
      const activation = events.find(item => item.event_type === 'CONTRACT_ACTIVATED')!;
      const activationHistory = history.find(entry => entry.event === 'CONTRACT_ACTIVATED_BILATERAL')!;
      assert(
        String(activationHistory.timestamp) === payloadOf(activation).occurredAt,
        'l’horodatage de l’événement est celui de la mutation (même transaction)',
      );
    });

    await check('P0-AUTO-2 Rollback: une transaction échouée ne laisse ni mutation, ni historique, ni événement', async () => {
      const chain = await seedAcceptedChain(harness, {
        employerId: employer.userId,
        employeeId: candidate.userId,
      });
      const contractId = newEntityId('ctr');
      let failed = false;
      try {
        await harness.database.run(async transaction => {
          const contracts = createSqlContractStore(transaction);
          const automation = createSqlAutomationStores(transaction);
          await contracts.create({
            id: contractId,
            proposalId: chain.proposalId,
            offerId: chain.offerId,
            applicationId: chain.applicationId,
            employerId: employer.userId,
            employeeId: candidate.userId,
            status: 'ACTIVE',
            monthlySalary: 175_000,
            currency: 'FCFA',
            startDate: '01 Novembre 2026',
            currentMonth: 1,
            durationMonths: 6,
            periodicity: 'Mensuel',
            missionDescription: 'Contrat rollback P0-AUTO-2',
            location: 'Cotonou',
            conditions: ['Temps plein'],
            employerSigned: true,
            employeeSigned: true,
            commissionPercentage: 25,
            commissionAmountDue: 0,
            commissionStatus: 'SCHEDULED',
            monthlyCheckpoints: [],
            commissionLedger: [],
            paymentSchedule: [],
            history: [{
              id: 'log_rollback',
              timestamp: ACTIVATION_TIME,
              event: 'CONTRACT_ACTIVATED_BILATERAL',
              description: 'Écriture annulée.',
              actor: employer.userId,
            }],
            createdAt: ACTIVATION_TIME,
            updatedAt: ACTIVATION_TIME,
          });
          await automation.outbox.append(createDomainEvent({
            eventId: contractActivatedEventId(contractId),
            eventType: 'CONTRACT_ACTIVATED',
            aggregateType: 'contract',
            aggregateId: contractId,
            actorId: employer.userId,
            timestamp: ACTIVATION_TIME,
            payload: { contractId, occurredAt: ACTIVATION_TIME },
            source: 'api:contracts.activate',
          }));
          await automation.jobs.createIfAbsent({
            jobId: `job_rollback_${contractId}`,
            jobType: 'SALARY_DUE_REMINDER',
            aggregateType: 'contract',
            aggregateId: contractId,
            dueAt: '2026-12-01T00:00:00.000Z',
            idempotencyKey: `rollback:${contractId}`,
            createdAt: ACTIVATION_TIME,
          });
          await automation.deadlines.createIfAbsent({
            id: `dl_rollback_${contractId}`,
            aggregateType: 'contract',
            aggregateId: contractId,
            kind: 'SALARY_PAYMENT',
            dueAt: '2026-12-01T00:00:00.000Z',
            sla: 'SALARY_PAYMENT_DUE',
            gracePeriodMs: PAYMENT_OVERDUE_GRACE_PERIOD_MS,
            escalation: 'PAYMENT_OVERDUE_J3',
            reference: `PSE-${contractId}-M1`,
            idempotencyKey: `rollback-dl:${contractId}`,
            createdAt: ACTIVATION_TIME,
          });
          throw new Error('SIMULATED_P0AUTO2_TRANSACTION_FAILURE');
        });
      } catch (error) {
        failed = String((error as Error)?.message ?? error).includes('SIMULATED_P0AUTO2_TRANSACTION_FAILURE');
      }
      assert(failed, 'erreur volontaire propagée');
      assert(await readContractSchedule(harness, contractId) === null, 'aucun contrat ne survit au ROLLBACK');
      assert((await readOutbox(harness, contractId)).length === 0, 'aucun événement ne survit au ROLLBACK');
      assert((await readJobs(harness, contractId)).length === 0, 'aucun job ne survit au ROLLBACK');
      assert((await readDeadlines(harness, contractId)).length === 0, 'aucune échéance ne survit au ROLLBACK');
    });

    /* ---------------- 2. Échéancier salarial ---------------- */

    await check('P0-AUTO-2 Échéancier salarial: créé par le worker depuis CONTRACT_ACTIVATED, conforme à la règle existante', async () => {
      const before = await readContractSchedule(harness, mainContractId);
      assert(readJsonArray(before?.payment_schedule).length === 0, 'aucun échéancier avant automatisation');

      const report = await harness.automationWorker!.drainEvents(10);
      assert(report.claimed === 1 && report.completed === 1, `événement réclamé et traité, reçu ${JSON.stringify(report.entries)}`);

      const row = await readContractSchedule(harness, mainContractId);
      const schedule = readJsonArray(row?.payment_schedule);
      const expected = buildPaymentSchedule({
        contractId: mainContractId,
        startDate: '01 Novembre 2026',
        durationMonths: 6,
        monthlySalary: 175_000,
        currency: 'FCFA',
        createdAt: String(payloadOf((await readOutbox(harness, mainContractId)).find(item => item.event_type === 'CONTRACT_ACTIVATED')!).occurredAt),
      });
      assert(schedule.length === expected.length, `${expected.length} périodes attendues, reçues ${schedule.length}`);
      assert(
        JSON.stringify(schedule.map(entry => [entry.id, entry.monthNumber, entry.periodKey, entry.periodStartDate, entry.salaryDueDate, entry.commissionDueDate, entry.salaryAmount, entry.employeeShareAmount, entry.commissionAmount, entry.currency, entry.salaryStatus, entry.commissionStatus]))
          === JSON.stringify(expected.map(entry => [entry.id, entry.monthNumber, entry.periodKey, entry.periodStartDate, entry.salaryDueDate, entry.commissionDueDate, entry.salaryAmount, entry.employeeShareAmount, entry.commissionAmount, entry.currency, entry.salaryStatus, entry.commissionStatus])),
        'l’échéancier persisté est exactement celui de la règle existante',
      );
      assert(schedule[0].contractId === mainContractId, 'contractId porté');
      assert(schedule[0].salaryAmount === 175_000, 'montant attendu porté');

      const history = readJsonArray(row?.history);
      assert(
        history.some(entry => entry.event === 'PAYMENT_SCHEDULE_CREATED'),
        'entrée d’historique métier ajoutée (sans remplacer l’historique P0-F)',
      );
      for (const preserved of ['CONTRACT_CREATED', 'EMPLOYER_SIGNED', 'EMPLOYEE_SIGNED', 'CONTRACT_ACTIVATED_BILATERAL']) {
        assert(
          history.some(entry => entry.event === preserved),
          `l’historique métier existant ${preserved} doit être conservé`,
        );
      }

      const event = (await readOutbox(harness, mainContractId)).find(item => item.event_type === 'CONTRACT_ACTIVATED')!;
      assert(event.status === 'PROCESSED', 'événement marqué traité');
      assert(event.attempts === 1, 'une seule tentative');
    });

    /* ---------------- 3. Échéancier de commission ---------------- */

    await check('P0-AUTO-2 Échéancier de commission: 25 % en M1, 0 % ensuite, règle du modèle inchangée', async () => {
      const row = await readContractSchedule(harness, mainContractId);
      assert(row, 'contrat attendu');
      assert(Number(row!.commission_percentage) === 25, 'commission_percentage du modèle conservé à 25');
      assert(Number(row!.commission_amount_due) === 43_750, 'commission due M1 = 25 % de 175 000');
      assert(row!.commission_status === 'SCHEDULED', 'statut de commission réel');
      assert(row!.current_month === 1, 'aucun avancement mensuel inventé');

      const ledger = readJsonArray(row!.commission_ledger);
      assert(ledger.length === 1, 'une seule entrée de grand livre (M1), comme le modèle réel');
      assert(ledger[0].monthNumber === 1, 'entrée M1');
      assert(ledger[0].percentage === 25, 'pourcentage du contrat reporté tel quel');
      assert(ledger[0].salaryBase === 175_000 && ledger[0].amountDue === 43_750, 'assiette et montant réels');
      assert(ledger[0].amountSubmitted === 0, 'aucune commission soumise');
      assert(ledger[0].status === 'SCHEDULED' && ledger[0].paymentId === undefined, 'aucun paiement de commission');

      const schedule = readJsonArray(row!.payment_schedule);
      assert(schedule[0].commissionAmount === 43_750 && schedule[0].commissionStatus === 'SCHEDULED', 'commission M1 planifiée');
      for (const entry of schedule.slice(1)) {
        assert(entry.commissionAmount === 0, '0 % de commission en M2+');
        assert(entry.commissionStatus === 'NOT_APPLICABLE', 'commission M2+ sans objet');
        assert(entry.employeeShareAmount === 175_000, '100 % au salarié en M2+');
      }

      const checkpoints = readJsonArray(row!.monthly_checkpoints);
      assert(checkpoints.length === 1 && checkpoints[0].monthNumber === 1, 'point de contrôle M1');
      assert(checkpoints[0].leLabeurShareAmount === 43_750, 'part LE LABEUR 25 %');
      assert(checkpoints[0].employeeShareAmount === 131_250, 'part salarié 75 %');
      assert(checkpoints[0].isSalaryPaidToEmployee === false, 'aucun paiement déclaré');
    });

    /* ---------------- 4. Échéances de paiement ---------------- */

    await check('P0-AUTO-2 Échéances: Deadline/SLA créées (6 salaires + 1 commission), aucune durée inventée', async () => {
      const deadlines = await readDeadlines(harness, mainContractId);
      const salary = deadlines.filter(deadline => deadline.kind === 'SALARY_PAYMENT');
      const commission = deadlines.filter(deadline => deadline.kind === 'COMMISSION_PAYMENT');
      assert(salary.length === 6, `6 échéances salariales attendues, reçues ${salary.length}`);
      assert(commission.length === 1, `une seule échéance de commission (M1 > 0), reçues ${commission.length}`);

      for (const deadline of deadlines) {
        assert(deadline.status === 'OPEN', 'échéance ouverte à la création');
        assert(new Date(deadline.due_at).toISOString().endsWith('T00:00:00.000Z'), 'dueAt à minuit UTC (modèle de date réel)');
        assert(Number(deadline.grace_period_ms) === PAYMENT_OVERDUE_GRACE_PERIOD_MS, 'grâce = 3 jours, règle J+3 réelle');
        assert(deadline.escalation === 'PAYMENT_OVERDUE_J3', 'escalade réelle');
        assert(deadline.sla !== null && String(deadline.sla).length > 0, 'SLA renseigné');
        assert(deadline.source_event_id === contractActivatedEventId(mainContractId), 'événement d’origine tracé');
        assert(String(deadline.reference).startsWith('PSE-'), 'référence à l’entrée d’échéancier');
        assert(deadline.idempotency_key.length > 0, 'clé d’idempotence persistée');
      }
      assert(salary[0].due_at.startsWith('2026-12-01'), 'échéance M1 = date de début + 1 mois');
      assert(salary[5].due_at.startsWith('2027-05-01'), 'échéance M6');
    });

    /* ---------------- 5. Jobs de rappel ---------------- */

    await check('P0-AUTO-2 Rappels: jobs créés (échéance et J+3 par échéance), aucun canal de notification', async () => {
      const jobs = await readJobs(harness, mainContractId);
      assert(jobs.length === 14, `14 rappels attendus (7 échéances × 2), reçus ${jobs.length}`);
      const byType = new Map<string, number>();
      for (const job of jobs) byType.set(job.job_type, (byType.get(job.job_type) ?? 0) + 1);
      assert(byType.get('SALARY_DUE_REMINDER') === 6, '6 rappels salariaux à échéance');
      assert(byType.get('SALARY_OVERDUE_J3_REMINDER') === 6, '6 rappels salariaux J+3');
      assert(byType.get('COMMISSION_DUE_REMINDER') === 1, '1 rappel de commission à échéance');
      assert(byType.get('COMMISSION_OVERDUE_J3_REMINDER') === 1, '1 rappel de commission J+3');

      for (const job of jobs) {
        assert(job.status === 'PENDING', 'rappel armé, non exécuté');
        assert(job.attempts === 0, 'aucune tentative');
        assert(String(job.reference).startsWith('PSE-'), 'référence d’échéancier persistée');
        assert(job.idempotency_key.length > 0, 'clé d’idempotence persistée');
      }
      const salaryDue = jobs.find(job => job.job_type === 'SALARY_DUE_REMINDER')!;
      const salaryJ3 = jobs.find(job => job.job_type === 'SALARY_OVERDUE_J3_REMINDER')!;
      assert(salaryDue.due_at.startsWith('2026-12-01'), 'rappel à l’échéance réelle');
      assert(salaryJ3.due_at.startsWith('2026-12-04'), 'rappel J+3 = échéance + 3 jours');
      assert(
        salaryDue.idempotency_key === `${salaryDue.reference}:SALARY:2026-12-01:DUE`,
        `clé d’idempotence conforme au contrat documenté, reçue ${salaryDue.idempotency_key}`,
      );
      assert(
        salaryJ3.idempotency_key === `${salaryJ3.reference}:SALARY:2026-12-01:J3`,
        'clé J+3 conforme (schedule-entry + payment-kind + due-date + J3)',
      );

      // P0-AUTO-2 n'ouvre AUCUN canal : la seule table de notification qui
      // existe vient de P0-NOTIFICATIONS (migration 0012), et P0-AUTO-2 ne la
      // remplit pas. Le contrôle porte donc sur la frontière réelle — aucune
      // table de canal EXTERNE n'est créée par cette tranche.
      const externalChannelTables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%email%' OR table_name ILIKE '%sms%'
                 OR table_name ILIKE '%whatsapp%' OR table_name ILIKE '%push%'
                 OR table_name ILIKE '%provider%' OR table_name ILIKE '%webhook%')`,
      );
      assert(externalChannelTables.rows.length === 0, 'aucune table de canal externe créée par P0-AUTO-2');
      const notificationsFromReminders = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM notifications
          WHERE source_event_type IN ('NOTIFICATION_REQUIRED', 'PAYMENT_OVERDUE_J3')`,
      );
      assert(
        Number(notificationsFromReminders.rows[0]?.count ?? 0) === 0,
        'P0-AUTO-2 ne produit lui-même AUCUNE notification : aucun rappel n’a encore été exécuté',
      );
    });

    /* ---------------- 6. Idempotence et rejeu ---------------- */

    await check('P0-AUTO-2 Idempotence: un second drain ne recrée ni échéancier, ni échéance, ni rappel', async () => {
      const before = {
        deadlines: (await readDeadlines(harness, mainContractId)).length,
        jobs: (await readJobs(harness, mainContractId)).length,
        events: (await readOutbox(harness, mainContractId)).length,
        history: readJsonArray((await readContractSchedule(harness, mainContractId))?.history).length,
        schedule: readJsonArray((await readContractSchedule(harness, mainContractId))?.payment_schedule).length,
      };
      const report = await harness.automationWorker!.drainEvents(10);
      assert(report.claimed === 0, `aucun événement à réclamer après traitement, reçu ${report.claimed}`);
      const after = {
        deadlines: (await readDeadlines(harness, mainContractId)).length,
        jobs: (await readJobs(harness, mainContractId)).length,
        events: (await readOutbox(harness, mainContractId)).length,
        history: readJsonArray((await readContractSchedule(harness, mainContractId))?.history).length,
        schedule: readJsonArray((await readContractSchedule(harness, mainContractId))?.payment_schedule).length,
      };
      assert(JSON.stringify(before) === JSON.stringify(after), `aucun double effet: ${JSON.stringify({ before, after })}`);
    });

    await check('P0-AUTO-2 Idempotence: le MÊME événement rejoué deux fois dans le moteur ne produit qu’un seul échéancier', async () => {
      const event = (await readOutbox(harness, mainContractId)).find(row => row.event_type === 'CONTRACT_ACTIVATED')!;
      const domainEvent = createDomainEvent({
        eventId: event.id,
        eventType: 'CONTRACT_ACTIVATED',
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        timestamp: ACTIVATION_TIME,
        payload: payloadOf(event),
        source: event.source,
      });
      const first = await harness.automation!.engine.execute(domainEvent, contractActivatedIdempotencyKey(mainContractId));
      const second = await harness.automation!.engine.execute(domainEvent, contractActivatedIdempotencyKey(mainContractId));
      assert(first === 'duplicate', `premier rejeu reconnu par le moteur, reçu ${first}`);
      assert(second === 'duplicate', `second rejeu reconnu, reçu ${second}`);
      assert(readJsonArray((await readContractSchedule(harness, mainContractId))?.payment_schedule).length === 6, 'échéancier unique');
    });

    await check('P0-AUTO-2 Idempotence: un SECOND événement (eventId différent) pour le même contrat est neutralisé par l’idempotence durable', async () => {
      // Rejeu RÉEL du même événement : même charge utile (donc même empreinte),
      // seul l'identifiant de transport diffère. C'est le cas d'un producteur
      // qui réémet l'événement après un incident.
      const original = (await readOutbox(harness, mainContractId))
        .find(row => row.id === contractActivatedEventId(mainContractId))!;
      const duplicate = createDomainEvent({
        eventId: `evt_second_${mainContractId}`,
        eventType: 'CONTRACT_ACTIVATED',
        aggregateType: 'contract',
        aggregateId: mainContractId,
        timestamp: ACTIVATION_TIME,
        payload: payloadOf(original),
        source: 'test:replay',
      });
      // Écrit réellement en base, puis traité par UN AUTRE worker (moteur neuf,
      // cache de rejeu vide) : le doublon doit être neutralisé par l'IDEMPOTENCE
      // DURABLE PostgreSQL, pas seulement par le cache mémoire du premier worker.
      await harness.database.run(async transaction => {
        await createSqlAutomationStores(transaction).outbox.append(duplicate);
      });
      const report = await freshAutomationWorker(harness).drainEvents(10);
      const duplicateEntry = report.entries.find(entry => entry.eventId === duplicate.eventId);
      assert(duplicateEntry !== undefined, `événement dupliqué réclamé, reçu ${JSON.stringify(report.entries)}`);
      assert(duplicateEntry!.result === 'duplicate' || duplicateEntry!.result === 'completed', 'événement dupliqué traité sans effet');
      assert(readJsonArray((await readContractSchedule(harness, mainContractId))?.payment_schedule).length === 6, 'aucun second échéancier');
      assert((await readDeadlines(harness, mainContractId)).length === 7, 'aucune échéance supplémentaire');
      assert((await readJobs(harness, mainContractId)).length === 14, 'aucun rappel supplémentaire');
      const audit = await readAudit(harness, mainContractId);
      assert(
        audit.some(row => row.action === 'AUTOMATION_DUPLICATE_SUPPRESSED'),
        'le doublon est tracé dans le ledger d’audit',
      );
      const history = readJsonArray((await readContractSchedule(harness, mainContractId))?.history);
      assert(
        history.filter(entry => entry.event === 'PAYMENT_SCHEDULE_CREATED').length === 1,
        'une seule entrée d’historique d’échéancier',
      );
    });

    await check('P0-AUTO-2 Idempotence: la réserve durable est scellée sur (SYSTEM, commande, contrat)', async () => {
      const reservation = await harness.database.query<{ actor_id: string; command: string; idempotency_key: string; status: string }>(
        `SELECT actor_id, command, idempotency_key, status FROM automation_idempotency
          WHERE command = $1 AND idempotency_key = $2`,
        [CONTRACT_ACTIVATION_COMMAND, contractActivatedIdempotencyKey(mainContractId)],
      );
      assert(reservation.rows.length === 1, 'une seule réservation durable');
      assert(reservation.rows[0].actor_id === 'SYSTEM', 'acteur SYSTEM réel');
      assert(reservation.rows[0].status === 'COMPLETED', 'réservation clôturée');
    });

    /* ---------------- 7. Concurrence ---------------- */

    await check('P0-AUTO-2 Concurrence: deux workers drainant simultanément ne produisent qu’un seul échéancier', async () => {
      const chain = await seedAcceptedChain(harness, {
        employerId: employer.userId,
        employeeId: candidate.userId,
      });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0auto2-race-001',
      });

      const secondWorker = freshAutomationWorker(harness);

      const settled = await Promise.allSettled([
        harness.automationWorker!.drainEvents(10),
        secondWorker.drainEvents(10),
      ]);
      for (const outcome of settled) {
        if (outcome.status === 'rejected') {
          const message = String((outcome.reason as Error)?.message ?? outcome.reason);
          assert(
            message.includes('concurrent'),
            `seul un refus de traitement concurrent est admis, reçu: ${message}`,
          );
        }
      }
      const processed = settled
        .filter((outcome): outcome is PromiseFulfilledResult<EventDrainReport> => outcome.status === 'fulfilled')
        .flatMap(outcome => outcome.value.entries);
      assert(processed.length === 1, `un seul événement traité au total, reçu ${processed.length}`);

      const row = await readContractSchedule(harness, contractId);
      assert(row?.status === 'ACTIVE', 'contrat actif');
      assert(readJsonArray(row?.payment_schedule).length === 6, 'un seul échéancier');
      assert((await readDeadlines(harness, contractId)).length === 7, 'aucune échéance dupliquée');
      assert((await readJobs(harness, contractId)).length === 14, 'aucun rappel dupliqué');
      const history = readJsonArray(row?.history);
      assert(
        history.filter(entry => entry.event === 'PAYMENT_SCHEDULE_CREATED').length === 1,
        'une seule entrée d’historique d’échéancier',
      );
      const events = await readOutbox(harness, contractId);
      assert(events.filter(item => item.event_type === 'CONTRACT_ACTIVATED').length === 1, 'un seul événement d’activation');
      assert(events.every(item => item.status === 'PROCESSED'), 'aucun événement laissé en traitement');
    });

    await check('P0-AUTO-2 Concurrence: deux créations simultanées de la même échéance → une seule ligne (contrainte PostgreSQL)', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0auto2-race-dl-001',
      });
      await harness.automationWorker!.drainEvents(10);

      const deadlineId = `dl_SALARY_PAYMENT_PSE-${contractId}-M1`;
      const draft = {
        id: deadlineId,
        aggregateType: 'contract',
        aggregateId: contractId,
        kind: 'SALARY_PAYMENT' as const,
        dueAt: '2026-12-01T00:00:00.000Z',
        sla: 'SALARY_PAYMENT_DUE',
        gracePeriodMs: PAYMENT_OVERDUE_GRACE_PERIOD_MS,
        escalation: 'PAYMENT_OVERDUE_J3',
        reference: `PSE-${contractId}-M1`,
        idempotencyKey: `${contractId}:SALARY_PAYMENT:PSE-${contractId}-M1`,
        createdAt: ACTIVATION_TIME,
      };
      const outcomes = await Promise.all([0, 1].map(() => harness.database.run(async transaction =>
        createSqlAutomationStores(transaction).deadlines.createIfAbsent(draft))));
      assert(
        outcomes.filter(outcome => outcome.kind === 'created').length === 0,
        'l’échéance existe déjà : aucune création supplémentaire',
      );
      assert(
        outcomes.every(outcome => outcome.kind === 'duplicate'),
        'les deux tentatives concurrentes renvoient duplicate',
      );
      const count = await countRows(harness, 'automation_deadlines', 'id = $1', [deadlineId]);
      assert(count === 1, `une seule ligne d’échéance, reçu ${count}`);
    });

    await check('P0-AUTO-2 Concurrence: deux créations simultanées du même job de rappel → une seule ligne', async () => {
      const jobs = await readJobs(harness, mainContractId);
      const existing = jobs[0];
      const draft = {
        jobId: existing.job_id,
        jobType: existing.job_type,
        aggregateType: 'contract',
        aggregateId: mainContractId,
        dueAt: existing.due_at,
        idempotencyKey: existing.idempotency_key,
        reference: existing.reference ?? undefined,
        createdAt: ACTIVATION_TIME,
      };
      const outcomes = await Promise.all([0, 1].map(() => harness.database.run(async transaction =>
        createSqlAutomationStores(transaction).jobs.createIfAbsent(draft))));
      assert(
        outcomes.every(outcome => outcome.kind === 'duplicate'),
        'les deux tentatives renvoient duplicate',
      );
      const count = await countRows(harness, 'automation_jobs', 'job_id = $1', [existing.job_id]);
      assert(count === 1, `un seul job, reçu ${count}`);
    });

    /* ---------------- 8. Retry et dead-letter ---------------- */

    await check('P0-AUTO-2 Retry: un échec de traitement laisse l’événement REJECTABLE, puis réussit exactement une fois', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0auto2-retry-001',
      });

      // Panne réaliste : le contrat disparaît avant le traitement du worker.
      await harness.database.run(async transaction => {
        await transaction.query('DELETE FROM contracts WHERE id = $1', [contractId]);
      });
      const failed = await harness.automationWorker!.drainEvents(10);
      const failedEntry = failed.entries.find(entry => entry.eventId === contractActivatedEventId(contractId))!;
      assert(failedEntry !== undefined, `événement réclamé attendu, reçu ${JSON.stringify(failed.entries)}`);
      assert(failedEntry.result === 'retryable', `événement passé en RETRYABLE, reçu ${failedEntry.result}`);

      let row = (await readOutbox(harness, contractId)).find(item => item.event_type === 'CONTRACT_ACTIVATED')!;
      assert(row.status === 'RETRYABLE', 'statut RETRYABLE persisté');
      assert(row.attempts === 1, 'tentative comptée');
      assert(row.last_error !== null && String(row.last_error).length > 0, 'erreur réelle conservée');
      assert(
        (await readAudit(harness, contractId)).some(item => item.action === 'AUTOMATION_HANDLER_FAILED'),
        'l’échec est audité HORS de la transaction annulée',
      );

      // Rétablissement puis rejeu après le délai : un seul échéancier.
      const available = await harness.database.query<{ available_at: unknown }>(
        'SELECT available_at FROM automation_outbox WHERE id = $1', [contractActivatedEventId(contractId)],
      );
      harness.clock.value = new Date(new Date(toIso(available.rows[0].available_at)).getTime() + 1_000);
      await harness.database.run(async transaction => {
        await createSqlContractStore(transaction).create({
          id: contractId,
          proposalId: chain.proposalId,
          offerId: chain.offerId,
          applicationId: chain.applicationId,
          employerId: employer.userId,
          employeeId: candidate.userId,
          status: 'ACTIVE',
          monthlySalary: 175_000,
          currency: 'FCFA',
          startDate: '01 Novembre 2026',
          currentMonth: 1,
          durationMonths: 6,
          periodicity: 'Mensuel',
          missionDescription: 'Contrat rétabli',
          location: 'Cotonou',
          conditions: [],
          employerSigned: true,
          employeeSigned: true,
          commissionPercentage: 25,
          commissionAmountDue: 0,
          commissionStatus: 'SCHEDULED',
          monthlyCheckpoints: [],
          commissionLedger: [],
          paymentSchedule: [],
          history: [],
          createdAt: ACTIVATION_TIME,
          updatedAt: ACTIVATION_TIME,
        });
      });

      const retried = await harness.automationWorker!.drainEvents(10);
      const retriedEntry = retried.entries.find(entry => entry.eventId === contractActivatedEventId(contractId))!;
      assert(retriedEntry !== undefined, `événement rejoué attendu, reçu ${JSON.stringify(retried.entries)}`);
      assert(retriedEntry.result === 'completed', `rejeu réussi attendu, reçu ${retriedEntry.result}`);
      const schedule = readJsonArray((await readContractSchedule(harness, contractId))?.payment_schedule);
      assert(schedule.length === 6, 'échéancier créé une seule fois après rejeu');
      assert((await readDeadlines(harness, contractId)).length === 7, 'échéances créées une seule fois');
      assert((await readJobs(harness, contractId)).length === 14, 'rappels créés une seule fois');
      row = (await readOutbox(harness, contractId)).find(item => item.event_type === 'CONTRACT_ACTIVATED')!;
      assert(row.status === 'PROCESSED' && row.attempts === 2, `événement traité après 2 tentatives, reçu ${row.status}/${row.attempts}`);

      // Un nouveau rejeu après le délai ne produit rien.
      harness.clock.value = new Date(harness.clock.value.getTime() + 60_000);
      const again = await harness.automationWorker!.drainEvents(10);
      assert(again.claimed === 0, 'aucun événement à réclamer');
      assert(readJsonArray((await readContractSchedule(harness, contractId))?.payment_schedule).length === 6, 'aucun double échéancier');
    });

    await check('P0-AUTO-2 Dead-letter: après épuisement des tentatives, l’événement est isolé et jamais retraité', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0auto2-dl-001',
      });
      await harness.database.run(async transaction => {
        await transaction.query('DELETE FROM contracts WHERE id = $1', [contractId]);
        await transaction.query('UPDATE automation_outbox SET attempts = 5, available_at = $2 WHERE aggregate_id = $1', [
          contractId,
          harness.clock.value.toISOString(),
        ]);
      });
      const report = await harness.automationWorker!.drainEvents(10);
      assert(report.claimed === 1 && report.deadLettered === 1, `mise en dead-letter attendue, reçu ${JSON.stringify(report.entries)}`);
      const row = (await readOutbox(harness, contractId)).find(item => item.event_type === 'CONTRACT_ACTIVATED')!;
      assert(row.status === 'DEAD_LETTER', 'statut DEAD_LETTER persisté');
      harness.clock.value = new Date(harness.clock.value.getTime() + 60_000);
      const after = await harness.automationWorker!.drainEvents(10);
      assert(after.claimed === 0, 'un événement isolé n’est jamais réclamé');
      assert(readJsonArray((await readContractSchedule(harness, contractId))?.payment_schedule).length === 0, 'aucun échéancier produit');
    });

    /* ---------------- 9. Périodicités sans règle ---------------- */

    for (const periodicity of ['Hebdomadaire', 'Forfait mission'] as const) {
      await check(`P0-AUTO-2 Périodicité « ${periodicity} »: aucun échéancier, aucune échéance, aucun rappel inventés`, async () => {
        const chain = await seedAcceptedChain(harness, {
          employerId: employer.userId,
          employeeId: candidate.userId,
          periodicity,
        });
        const contractId = await activateContractThroughApi(harness, {
          employerToken: employer.token,
          candidateToken: candidate.token,
          proposalId: chain.proposalId,
          keyPrefix: `p0auto2-per-${periodicity === 'Hebdomadaire' ? 'hebdo' : 'forfait'}-001`,
        });
        const report = await harness.automationWorker!.drainEvents(10);
        assert(report.claimed === 1 && report.completed === 1, 'événement traité');

        const row = await readContractSchedule(harness, contractId);
        assert(row?.status === 'ACTIVE', 'le contrat reste actif');
        assert(row?.periodicity === periodicity, 'périodicité conservée telle quelle');
        assert(readJsonArray(row?.payment_schedule).length === 0, 'AUCUN échéancier inventé');
        assert(readJsonArray(row?.commission_ledger).length === 0, 'AUCUNE entrée de commission inventée');
        assert(readJsonArray(row?.monthly_checkpoints).length === 0, 'AUCUN point de contrôle inventé');
        assert(Number(row?.commission_amount_due) === 0, 'aucun montant de commission inventé');
        assert(Number(row?.commission_percentage) === 25, 'la règle de 25 % n’est pas modifiée');
        assert((await readDeadlines(harness, contractId)).length === 0, 'AUCUNE échéance inventée');
        assert((await readJobs(harness, contractId)).length === 0, 'AUCUN rappel inventé');

        const history = readJsonArray(row?.history);
        const missing = history.find(entry => entry.event === 'PAYMENT_SCHEDULE_RULE_MISSING');
        assert(missing !== undefined, 'la règle manquante est tracée dans l’historique métier');
        assert(String(missing!.description).includes(periodicity), 'la périodicité non résolue est nommée');

        const audit = await readAudit(harness, contractId);
        const entry = audit.find(row2 => row2.action === 'CONTRACT_SCHEDULE_RULE_MISSING');
        assert(entry !== undefined, 'la règle manquante est auditée');
        const state = stateOf(entry!);
        assert(state.periodicity === periodicity, 'périodicité auditée');
        assert(typeof state.missingRule === 'string' && String(state.missingRule).length > 40, 'règle manquante documentée');

        // Rejeu : toujours aucune invention, aucune duplication.
        harness.clock.value = new Date(harness.clock.value.getTime() + 60_000);
        await harness.automationWorker!.drainEvents(10);
        assert(readJsonArray((await readContractSchedule(harness, contractId))?.payment_schedule).length === 0, 'rejeu sans effet');
        assert(
          readJsonArray((await readContractSchedule(harness, contractId))?.history)
            .filter(item => item.event === 'PAYMENT_SCHEDULE_RULE_MISSING').length === 1,
          'une seule entrée de règle manquante',
        );
      });
    }

    /* ---------------- 12. Post-contractuel non ouvert ---------------- */

    await check('P0-AUTO-2 Post-contrat: offre non FILLED, candidature non HIRED, autres candidatures non fermées', async () => {
      const chain = await seedAcceptedChain(harness, {
        employerId: employer.userId,
        employeeId: candidate.userId,
        competingCandidateIds: [secondCandidate.userId],
      });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0auto2-filled-001',
      });
      await harness.automationWorker!.drainEvents(10);
      await harness.automationWorker!.runDueJobs(20);

      const offer = await harness.database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [chain.offerId]);
      assert(offer.rows[0].status === 'ACTIVE', 'l’offre reste ACTIVE : FILLED appartient à la tranche post-contractuelle');

      const winning = await harness.database.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM applications WHERE id = $1', [chain.applicationId],
      );
      assert(winning.rows[0].status === 'SHORTLISTED', 'la candidature retenue n’est pas passée HIRED/CONTRACTED');
      assert(winning.rows[0].contract_id === contractId, 'le lien P0-F est conservé');

      for (const competingId of chain.competingApplicationIds) {
        const competing = await harness.database.query<{ status: string }>(
          'SELECT status FROM applications WHERE id = $1', [competingId],
        );
        assert(competing.rows[0].status === 'PENDING', 'aucune autre candidature fermée (CLOSED_OFFER_FILLED reporté)');
      }
    });

    /* ---------------- 13. Aucun paiement, aucun KYC ---------------- */

    await check('P0-AUTO-2 Périmètre: aucun paiement réel, aucune déclaration, aucun OTP, aucune preuve salariale', async () => {
      const row = await readContractSchedule(harness, mainContractId);
      const schedule = readJsonArray(row?.payment_schedule);
      for (const entry of schedule) {
        assert(!['PAID', 'PENDING_VERIFICATION', 'REJECTED'].includes(String(entry.salaryStatus)), 'aucun statut de paiement produit');
        assert(entry.salaryTransactionId === undefined, 'aucune transaction salariale');
        assert(entry.commissionTransactionId === undefined, 'aucune transaction de commission');
        assert(entry.salaryProofFileName === undefined, 'aucune preuve salariale');
      }
      // P0-PAY-1/P0-PAY-3 ouvrent le cycle Payment et son ledger externe neutre :
      // ces tables viennent des migrations 0008/0009, JAMAIS de l'automatisation.
      // Le contrôle porte sur la frontière réelle : aucun connecteur ni table de fournisseur.
      const paymentTables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name ILIKE '%payment%'
          ORDER BY table_name`,
      );
      assert(
        JSON.stringify(paymentTables.rows.map(row => row.table_name)) === JSON.stringify([
          'payment_declarations', 'payment_external_settlements', 'payment_reconciliation_batch_items',
          'payment_reconciliation_batches', 'payment_reconciliation_correction_attempts',
          'payment_reconciliation_reviews', 'payments',
        ]),
        `seules les tables du cycle P0-PAY-1/P0-PAY-3 sont admises, reçues ${paymentTables.rows.map(row => row.table_name).join(', ')}`,
      );
      const providerTables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%mobile_money%' OR table_name ILIKE '%otp%'
                 OR table_name ILIKE '%provider%' OR table_name ILIKE '%webhook%'
                 OR table_name ILIKE '%aggregator%' OR table_name ILIKE '%momo%')`,
      );
      assert(providerTables.rows.length === 0, 'aucune table de fournisseur, de webhook, d’OTP ou d’agrégateur');

      // Aucun paiement n'est déclaré, vérifié ni payé par l'automatisation : les
      // lignes materialisées sont toutes `SCHEDULED`, et l'échéancier du contrat
      // reste au premier statut.
      const paymentStatuses = await harness.database.query<{ status: string; count: string }>(
        'SELECT status, count(*)::text AS count FROM payments GROUP BY status ORDER BY status',
      );
      assert(
        paymentStatuses.rows.length === 0
          || (paymentStatuses.rows.length === 1 && paymentStatuses.rows[0].status === 'SCHEDULED'),
        `aucun statut de paiement au-delà de SCHEDULED, reçus ${paymentStatuses.rows.map(row => `${row.status}×${row.count}`).join(', ')}`,
      );
      const declarationRows = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations',
      );
      assert(Number(declarationRows.rows[0]?.count ?? 0) === 0, 'aucune déclaration produite par l’automatisation');

      // La route de déclaration est OUVERTE depuis P0-PAY-1 : elle n'est plus un
      // handler absent, et une charge utile vide y est refusée par la validation
      // du domaine (400), jamais exécutée. Les points de contrôle mensuels, eux,
      // restent fermés : hors périmètre.
      const routes = await harness.worker.fetch(authRequest('/api/v1/payments/commission-declarations', employer.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0auto2-open-payment-001' },
        body: '{}',
      }));
      assert(
        routes.status === 400,
        `la déclaration de paiement est ouverte et validée (400 attendu), reçu ${routes.status}`,
      );
      const monthly = await harness.worker.fetch(authRequest(`/api/v1/contracts/${mainContractId}/monthly-actions`, employer.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0auto2-closed-monthly-001' },
        body: '{}',
      }));
      assert(monthly.status === 501, `le cycle mensuel reste fermé (501), reçu ${monthly.status}`);
    });

    await check('P0-AUTO-2 Périmètre: aucun KYC, aucune collecte d’identité, aucun R2 documentaire au-delà de la brique P0-R2 sanctionnée', async () => {
      const kycTables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%kyc%' OR table_name ILIKE '%identity_document%'
                 OR table_name ILIKE '%document%' OR table_name ILIKE '%r2%')`,
      );
      // P0-R2 (DOCUMENTS & PREUVES) introduit exactement 4 tables documentaires
      // sanctionnées ; la mission d'automatisation n'en crée aucune autre.
      const sanctioned = ['document_entity_links', 'document_retention_policies', 'document_versions', 'documents'];
      const unexpected = kycTables.rows.map(r => r.table_name).filter(name => !sanctioned.includes(name));
      assert(unexpected.length === 0, `aucune table KYC/documentaire créée au-delà de P0-R2 (${unexpected.join(', ')})`);
      assert(
        kycTables.rows.every(r => r.table_name.startsWith('document')),
        'aucune table KYC ou R2 brute créée',
      );
      const kycColumns = await harness.database.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'users'
            AND (column_name ILIKE '%kyc%' OR column_name ILIKE '%id_card%'
                 OR column_name ILIKE '%national_id%' OR column_name ILIKE '%verified_at%')`,
      );
      assert(kycColumns.rows.length === 0, 'aucune colonne KYC ajoutée aux comptes');
      const audit = await readAudit(harness, mainContractId);
      assert(
        audit.every(row => !row.action.toLowerCase().includes('kyc')),
        'aucune action KYC dans l’automatisation',
      );
    });

    /* ---------------- 14. Fail-closed sans Outbox durable ---------------- */

    await check('P0-AUTO-2 Fail-closed: sans Outbox durable lié, l’activation est refusée AVANT toute écriture (501)', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const contractId = await harness.database.run(async transaction => {
        const contracts = createSqlContractStore(transaction);
        const created = await contracts.create({
          id: newEntityId('ctr'),
          proposalId: chain.proposalId,
          offerId: chain.offerId,
          applicationId: chain.applicationId,
          employerId: employer.userId,
          employeeId: candidate.userId,
          status: 'SIGNATURE',
          monthlySalary: 175_000,
          currency: 'FCFA',
          startDate: '01 Novembre 2026',
          currentMonth: 1,
          durationMonths: 6,
          periodicity: 'Mensuel',
          missionDescription: 'Contrat sans outbox',
          location: 'Cotonou',
          conditions: [],
          employerSigned: true,
          employeeSigned: true,
          employerSignedAt: ACTIVATION_TIME,
          employeeSignedAt: ACTIVATION_TIME,
          commissionPercentage: 25,
          commissionAmountDue: 0,
          commissionStatus: 'SCHEDULED',
          monthlyCheckpoints: [],
          commissionLedger: [],
          paymentSchedule: [],
          history: [],
          createdAt: ACTIVATION_TIME,
          updatedAt: ACTIVATION_TIME,
        });
        return created.id;
      });

      const actor: AuthenticatedActor = {
        id: employer.userId,
        role: 'EMPLOYER',
        permissions: [],
        sessionId: newEntityId('ses'),
      };
      // Repository construit SANS outbox ni transaction : configuration non durable.
      const withoutOutbox = createContractRepository({
        stores: {
          contracts: createSqlContractStore(harness.database),
          proposals: createSqlProposalStore(harness.database),
          applications: createSqlApplicationStore(harness.database),
          offers: createSqlOfferStore(harness.database),
          users: createSqlUserStore(harness.database),
        },
      });
      let error: unknown;
      try {
        await withoutOutbox.activateContract(actor, contractId, {
          actor,
          command: 'contracts.activate',
          idempotencyKey: 'p0auto2-nooutbox-001',
          requestId: 'req-p0auto2-nooutbox',
        });
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof ApiError, 'refus explicite attendu');
      assert((error as ApiError).status === 501, `501 attendu, reçu ${(error as ApiError).status}`);

      const row = await readContractSchedule(harness, contractId);
      assert(row?.status === 'SIGNATURE', 'aucune mutation commise sans événement');
      assert((await readOutbox(harness, contractId)).length === 0, 'aucun événement');
      assert(readJsonArray(row?.history).length === 0, 'aucun historique écrit');
    });

    /* ---------------- 15. Séparation DEMO / API ---------------- */

    await check('P0-AUTO-2 Séparation: le mode DEMO reste Mock, jamais connecté à PostgreSQL, et sans automatisation', async () => {
      const demo = resolveRepositoryMode({});
      assert(demo.mode === 'mock', 'le MODE DEMO doit rester le défaut');
      const api = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' });
      assert(api.mode === 'api', 'le MODE API exige une configuration explicite');

      const memory = composeWorker({ GOOGLE_CLIENT_ID: 'test-offers-audience', PERSISTENCE: 'memory' });
      assert(memory.automation === undefined, 'aucune automatisation sans base durable');
      assert(memory.automationWorker === undefined, 'aucun worker d’automatisation sans base durable');

      const closed = composeWorker({ GOOGLE_CLIENT_ID: 'test-offers-audience' });
      assert(closed.automation === undefined, 'aucune automatisation en frontière fermée');
    });

    await check('P0-AUTO-2 PostgreSQL réel: les tables de l’automatisation existent et portent les contraintes attendues', async () => {
      const tables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name LIKE 'automation_%'
          ORDER BY table_name ASC`,
      );
      const names = tables.rows.map(row => row.table_name);
      assert(
        JSON.stringify(names) === JSON.stringify([
          'automation_audit_ledger',
          'automation_deadlines',
          'automation_idempotency',
          'automation_jobs',
          'automation_outbox',
        ]),
        `tables d’automatisation attendues, reçues ${names.join(', ')}`,
      );

      const uniqueIndexes = await harness.database.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname IN ('automation_jobs_idempotency_unique_idx', 'automation_deadlines_idempotency_unique_idx')
          ORDER BY indexname ASC`,
      );
      assert(
        uniqueIndexes.rows.length === 2,
        'les index d’unicité des clés d’idempotence (jobs et échéances) doivent exister',
      );

      const domain = await harness.database.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conrelid = 'automation_deadlines'::regclass AND contype = 'c'`,
      );
      assert(domain.rows.length >= 1, 'la contrainte de domaine des statuts d’échéance existe');
    });

    await check('P0-AUTO-2 Contrat non actif: aucun échéancier produit pour un contrat qui n’est plus ACTIVE', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0auto2-notactive-001',
      });
      // Le contrat est clôturé avant que le worker ne traite l’événement.
      await harness.database.query(
        "UPDATE contracts SET status = 'COMPLETED' WHERE id = $1",
        [contractId],
      );
      const report = await harness.automationWorker!.drainEvents(10);
      assert(report.claimed === 1 && report.completed === 1, 'événement traité sans effet métier');
      assert(readJsonArray((await readContractSchedule(harness, contractId))?.payment_schedule).length === 0, 'aucun échéancier sur un contrat non actif');
      assert((await readDeadlines(harness, contractId)).length === 0, 'aucune échéance');
      assert((await readJobs(harness, contractId)).length === 0, 'aucun rappel');
      assert(
        (await readAudit(harness, contractId)).some(row => row.action === 'CONTRACT_SCHEDULE_RULE_MISSING'),
        'l’absence d’effet est auditée',
      );
    });
  } finally {
    await harness.close();
    contractIdempotencyCache.clear();
  }

  // Phase 2 — exécution réelle des rappels sur une base dédiée (horloge avancée).
  await runReminderExecutionPhase(results);

  return results;
}
