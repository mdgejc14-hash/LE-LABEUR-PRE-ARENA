/**
 * LE LABEUR — P0-CRON-QUEUE — vérifications d'intégration (PostgreSQL PGlite).
 *
 * Objectif de la tranche : rendre les automatisations planifiées réellement
 * DÉCLENCHABLES SANS INTERVENTION MANUELLE, sur l'architecture existante :
 *
 *   ÉCHÉANCE (due_at / deadline) → DÉCLENCHEUR (Cron `scheduled()`)
 *   → FILE EXISTANTE (automation_outbox / automation_jobs)
 *   → WORKER EXISTANT (drain : événements → paiements échus → jobs échus)
 *   → ACTION IDEMPOTENTE → AUDIT / OUTBOX / NOTIFICATION.
 *
 * Ce qu'on vérifie ici (les 22 exigences de la tranche) :
 *   1.  un déclencheur Cron réel (`scheduled()` du Worker Cloudflare) exécute
 *       une passée bornée du worker d'automatisation EXISTANT ;
 *   2.  les jobs échus sont détectés et traités par le déclenchement ;
 *   3.  les jobs FUTURS sont ignorés (due_at > now) ;
 *   4.  un double déclenchement Cron n'a JAMAIS un double effet métier ;
 *   5.  deux workers simultanés → une seule réservation (claim verrouillé) ;
 *   6.  retry après échec (RETRYABLE + tentatives + last_error) et convergence ;
 *   7.  dead-letter à la borne de tentatives (jamais perdu en silence) ;
 *   8.  crash APRÈS réservation / AVANT ack → récupération → rejeu idempotent
 *       (événement `PROCESSING` et job `RUNNING` orphelins) ;
 *   9.  idempotence métier : une échéance/jobs exécuté(e)s deux fois ne
 *       produit JAMAIS deux effets métier ;
 *  10.  audit du déclenchement (CRON_TICK_EXECUTED) et de la récupération
 *       (STALE_*), acteur SYSTEM, source P0-CRON-QUEUE ;
 *  11.  échéance PAIEMENT : le balayage `SCHEDULED → DUE` passe par le trigger ;
 *  12.  échéance CLAIM : la deadline de preuve expire et escalade via le trigger ;
 *  13.  échéance SALAIRE : la J+3 (grace) escalade le délai salarial ;
 *  14.  notification via le workflow EXISTANT (événement → Outbox →
 *       Notification Service ; In-App réel, push/email abstraction) ;
 *  15.  réconciliation RÉPUTATION planifiable dans la file existante sans
 *       duplication (cœur partagé idempotent) ;
 *  16.  sécurité : le trigger ne produit AUCUNE action métier arbitraire
 *       (types non déclarés ignorés) et AUCUNE route publique de drain ;
 *  17–22. non-régression des tranches P0-R2, P0-REPUTATION, P0-MATCHING,
 *       P0-REPLACEMENT, PAIEMENT/SALAIRE et NOTIFICATIONS après un cycle
 *       complet du déclencheur périodique.
 *
 * Aucun compte Cloudflare réel, aucun timer applicatif, aucun secret : le
 * déclenchement est simulé en appelant `scheduled()` (le handler même de
 * production) sur une base PostgreSQL locale (PGlite) ou directement
 * `runScheduledCycle` sur le worker composé.
 */

import { PGlite } from '@electric-sql/pglite';
import {
  authenticateActor,
  authRequest,
  createOffersTestHarness,
  type OfferTestResult,
} from '../api/offers.test';
import { composeWorker } from '../api/entry';
import { createSqlAutomationStores } from '../persistence/sqlAutomationStores';
import { toPostgresClientPort, type DriverPoolLike, type DriverQueryResult } from '../persistence/sqlClient';
import { createCloudflareWorker, type CloudflareWorkerRuntime } from '../worker/cloudflareEntry';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { createSqlIdentityStores } from '../identity/sqlStores';
import {
  CRON_QUEUE_SOURCE,
  DEFAULT_MAX_ATTEMPTS,
} from './worker';
import {
  REPUTATION_RECONCILIATION_JOB_TYPE,
  scheduleReputationReconciliationJob,
} from '../reputation/reputationAutomation';
import { contractActivatedEventId } from '../../domain/contractScheduleAutomation';
import { createInMemoryObjectStorage } from '../documents/storage';
import type { ObjectStorage } from '../services/documents';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;
type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Petits utilitaires                                                  */
/* ------------------------------------------------------------------ */

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  expect(condition, message);
}

function firstRow(rows: Row[]): Row | undefined {
  return rows[0];
}

function pick(rows: Row[], where: (row: Row) => boolean): Row | undefined {
  return rows.find(where);
}

function pickAll(rows: Row[], where: (row: Row) => boolean): Row[] {
  return rows.filter(where);
}

function asRecord(value: unknown): Row {
  return (value ?? {}) as Row;
}

function asArray(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  return [];
}

function advanceClock(harness: Harness, ms: number): void {
  harness.clock.value = new Date(harness.clock.value.getTime() + ms);
}

/** Horodatage « orphelin » : plus ancien que la borne de récupération (10 min). */
function staleTimestamp(harness: Harness, msOlderThanBorne: number): string {
  return new Date(harness.clock.value.getTime() - (10 * 60_000 + msOlderThanBorne)).toISOString();
}

/**
 * Deuxième worker d'automatisation sur la MÊME base (même discipline que les
 * tests P0-AUTO-2 : composition indépendante, clock partagée).
 */
function freshAutomationWorker(harness: Harness) {
  const composition = composeWorker(
    { GOOGLE_CLIENT_ID: 'test-offers-audience', PERSISTENCE: 'postgres', SESSION_TTL_SECONDS: '3600' },
    harness.database,
    { now: () => harness.clock.value },
  );
  assert(composition.automationWorker, 'worker d\'automatisation attendu');
  return composition.automationWorker;
}

/** Pilote DriverPoolLike sur une instance PGlite (même forme que le test offres). */
function createPGliteDriver(database: PGlite): DriverPoolLike {
  const query = async <RowT = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<RowT>> => {
    const result = await database.query<RowT>(sql, [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  };
  return {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

/** Provisionne un compte ADMIN réel (users + sessions) pour les parcours ADMIN. */
async function provisionAdmin(harness: Harness): Promise<{ userId: string; token: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = harness.clock.value.toISOString();
  const identities = createSqlIdentityStores(harness.database);
  await identities.transaction(async stores => {
    await stores.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.cronqueue.${userId}@example.com`,
      displayName: 'Admin P0-CRON-QUEUE',
    });
    await stores.sessions.create({
      userId,
      token,
      createdAt,
      expiresAt: new Date(harness.clock.value.getTime() + 3_600_000).toISOString(),
    });
  });
  return { userId, token };
}

/* ------------------------------------------------------------------ */
/* LECTURES ciblées                                                    */
/* ------------------------------------------------------------------ */

async function q<T = Row>(harness: Harness, sql: string, params: readonly unknown[] = []): Promise<T[]> {
  const result = await harness.database.query<T>(sql, [...params]);
  return result.rows;
}

async function outboxRows(harness: Harness, eventType?: string): Promise<Row[]> {
  return eventType
    ? q(harness, 'SELECT * FROM automation_outbox WHERE event_type=$1 ORDER BY created_at ASC, id ASC', [eventType])
    : q(harness, 'SELECT * FROM automation_outbox ORDER BY created_at ASC, id ASC');
}

async function jobRows(harness: Harness, jobType?: string): Promise<Row[]> {
  return jobType
    ? q(harness, 'SELECT * FROM automation_jobs WHERE job_type=$1 ORDER BY due_at ASC, job_id ASC', [jobType])
    : q(harness, 'SELECT * FROM automation_jobs ORDER BY due_at ASC, job_id ASC');
}

async function auditRows(harness: Harness, action: string, source?: string): Promise<Row[]> {
  return source
    ? q(harness, 'SELECT * FROM automation_audit_ledger WHERE action=$1 AND source=$2 ORDER BY occurred_at ASC, id ASC', [action, source])
    : q(harness, 'SELECT * FROM automation_audit_ledger WHERE action=$1 ORDER BY occurred_at ASC, id ASC', [action]);
}

async function countAudit(harness: Harness, action: string, source?: string): Promise<number> {
  const rows = await auditRows(harness, action, source);
  return rows.length;
}

async function deadlineRows(harness: Harness, contractId: string): Promise<Row[]> {
  return q(harness, 'SELECT * FROM automation_deadlines WHERE aggregate_id=$1 ORDER BY due_at ASC, id ASC', [contractId]);
}

async function paymentsRows(harness: Harness, contractId: string): Promise<Row[]> {
  return q(harness, `SELECT * FROM payments WHERE contract_id=$1 ORDER BY id ASC`, [contractId]);
}

async function notificationsRows(harness: Harness, userId?: string): Promise<Row[]> {
  return userId
    ? q(harness, 'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at ASC, id ASC', [userId])
    : q(harness, 'SELECT * FROM notifications ORDER BY created_at ASC, id ASC');
}

async function reputationEntriesRows(harness: Harness, subjectUserId: string): Promise<Row[]> {
  return q(harness, 'SELECT * FROM reputation_entries WHERE subject_user_id=$1 ORDER BY created_at ASC, reputation_id ASC', [subjectUserId]);
}

async function contractPaymentSchedule(harness: Harness, contractId: string): Promise<Row[]> {
  const rows = await q(harness, 'SELECT payment_schedule FROM contracts WHERE id=$1', [contractId]);
  return asArray(firstRow(rows)?.payment_schedule);
}

/* ------------------------------------------------------------------ */
/* Chaîne métier RÉELLE via API (offre → … → contrat actif)            */
/* ------------------------------------------------------------------ */

interface ChainOptions {
  keyPrefix: string;
  startDate?: string;
  durationMonths?: number;
  periodicity?: string;
}

interface ContractChain {
  employer: { token: string; userId: string };
  candidate: { token: string; userId: string };
  contractId: string;
}

async function activateContractThroughApi(harness: Harness, options: ChainOptions): Promise<ContractChain> {
  const { keyPrefix } = options;
  const startDate = options.startDate ?? '01 Août 2026';
  const durationMonths = options.durationMonths ?? 6;
  const periodicity = options.periodicity ?? 'Mensuel';

  const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
  const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');

  const post = (path: string, token: string, key: string, body: unknown): Promise<Response> =>
    harness.worker.fetch(authRequest(path, token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
    }));

  const jsonOf = async <T>(response: Response, expected: number, what: string): Promise<T> => {
    const body = await response.json() as T;
    assert(response.status === expected, `${what} : statut ${expected} attendu, reçu ${response.status} (${JSON.stringify(body)})`);
    return body;
  };

  const offer = await jsonOf<{ id: string }>(
    await post('/api/v1/offers', employer.token, `${keyPrefix}-offer`, {
      title: `Offre P0-CRON-QUEUE ${keyPrefix}`,
      contractType: 'CDI',
      remuneration: 175000,
      currency: 'FCFA',
      location: 'Cotonou',
      summary: 'Mission vérifiée pour le déclenchement périodique.',
    }),
    201, 'création de l\'offre',
  );

  const application = await jsonOf<{ id: string }>(
    await post(`/api/v1/offers/${offer.id}/applications`, candidate.token, `${keyPrefix}-application`, {
      note: 'Candidature pour le cycle de déclenchement périodique.',
    }),
    201, 'candidature',
  );

  const conversationId = `cnv_${keyPrefix}_workerd`;
  const proposal = await jsonOf<{ id: string }>(
    await post(`/api/v1/conversations/${conversationId}/proposals`, employer.token, `${keyPrefix}-proposal`, {
      applicationId: application.id,
      missionTitle: `Mission ${keyPrefix}`,
      amount: 291_667,
      currency: 'FCFA',
      periodicity,
      startDate,
      durationMonths,
      location: 'Cotonou',
      conditions: ['Horaires définis par l\'employeur et présentés au candidat avant acceptation.'],
    }),
    201, 'proposition',
  );

  await jsonOf<{ id: string }>(
    await post(`/api/v1/proposals/${proposal.id}/respond`, candidate.token, `${keyPrefix}-respond`, {
      action: 'ACCEPT',
    }),
    200, 'acceptation de la proposition',
  );

  const contract = await jsonOf<{ id: string }>(
    await post('/api/v1/contracts', employer.token, `${keyPrefix}-contract`, {
      proposalId: proposal.id,
    }),
    201, 'contrat',
  );

  await jsonOf<{ id: string }>(
    await post(`/api/v1/contracts/${contract.id}/send`, employer.token, `${keyPrefix}-send`, {}),
    200, 'envoi du contrat',
  );

  await jsonOf<{ id: string }>(
    await post(`/api/v1/contracts/${contract.id}/sign`, candidate.token, `${keyPrefix}-sign`, {}),
    200, 'signature du contrat',
  );

  const activated = await jsonOf<{ id: string; status: string }>(
    await post(`/api/v1/contracts/${contract.id}/activate`, employer.token, `${keyPrefix}-activate`, {}),
    200, 'activation du contrat',
  );
  assert(activated.status === 'ACTIVE', 'contrat ACTIVE attendu après activation');

  return { employer, candidate, contractId: contract.id };
}

/** Capture la ligne `contracts` complète (pour une restauration après DELETE). */
async function captureContractRow(harness: Harness, contractId: string): Promise<Row> {
  const rows = await q(harness, 'SELECT * FROM contracts WHERE id=$1', [contractId]);
  assert(rows.length === 1, 'ligne contrat capturée');
  return rows[0];
}

async function deleteContractRow(harness: Harness, contractId: string): Promise<void> {
  await q(harness, 'DELETE FROM contracts WHERE id=$1', [contractId]);
}

async function restoreContractRow(harness: Harness, row: Row): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const values = columns.map(column => {
    const value = row[column];
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  });
  await q(harness, `INSERT INTO contracts (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
}

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

export async function runCronQueueTests(): Promise<OfferTestResult[]> {
  const results: OfferTestResult[] = [];
  const check = async (
    name: string,
    test: (harness: Harness) => Promise<void>,
    harnessOptions: { documentStorage?: ObjectStorage; documentUrlSigningSecret?: string } = {},
  ) => {
    const harness = await createOffersTestHarness(undefined, {
      claimEvidenceDeadlineMs: '60000',
      ...harnessOptions,
    });
    try {
      await test(harness);
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    } finally {
      await harness.close();
    }
  };

  /* ---------------------------------------------------------------- */
  /* 1 — Le déclencheur Cron RÉEL (`scheduled()`) exécute la passée    */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 1 : scheduled() du Worker Cloudflare (réel, PGlite) exécute la passée bornée du worker existant avec audit du tick', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-real-trigger' });
    const eventId = contractActivatedEventId(chain.contractId);
    const pending = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(pending && pending.id === eventId && pending.status === 'PENDING', 'événement CONTRACT_ACTIVATED PENDING avant déclenchement');

    let ended = 0;
    const driver = createPGliteDriver(harness.pg);
    const runtime: CloudflareWorkerRuntime = createCloudflareWorker({
      createClient: () => ({ client: toPostgresClientPort(driver), end: async () => { ended += 1; } }),
    });
    // Le handler MÊME que le Cron Trigger de production appellerait.
    assert(typeof runtime.scheduled === 'function', 'handler scheduled() attendu sur le Worker');
    await runtime.scheduled!({ cron: '* * * * *', scheduledTime: Date.now() }, {
      GOOGLE_CLIENT_ID: 'test-offers-audience',
      PERSISTENCE: 'postgres',
      WORKER_ENV: 'workerd-local',
      CLAIM_EVIDENCE_DEADLINE_MS: '60000',
      // Chaîne de connexion VALIDE (schéma postgres) : le client est MOCKÉ,
      // aucune connexion réelle n'est ouverte — la cible ne sert qu'au target.
      HYPERDRIVE: { connectionString: 'postgresql://lelabeur:local-secret@127.0.0.1:55432/lelabeur?sslmode=disable' },
    });

    assert(ended === 1, 'client éphémère fermé après le tick');
    const processed = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(processed?.status === 'PROCESSED', `événement PROCESSED après scheduled(), reçu ${processed?.status}`);
    const schedule = await contractPaymentSchedule(harness, chain.contractId);
    assert(schedule.length === 6, 'échéancier complet projeté sur le contrat');
    const deadlines = await deadlineRows(harness, chain.contractId);
    assert(deadlines.length >= 7, `échéances de paiement créées par le déclenchement (7), reçu ${deadlines.length}`);
    const jobs = await jobRows(harness);
    assert(jobs.length >= 14, `jobs de rappel créés par le déclenchement (14), reçu ${jobs.length}`);
    const ticks = await auditRows(harness, 'CRON_TICK_EXECUTED', CRON_QUEUE_SOURCE);
    assert(ticks.length === 1, 'une trace CRON_TICK_EXECUTED par déclenchement');
    assert(ticks[0].actor_id === 'SYSTEM' && ticks[0].entity_id === 'cron:scheduled', 'acteur SYSTEM, entité cron:scheduled');
    const afterState = asRecord(ticks[0].after_state);
    assert(Number(asRecord(afterState.events).claimed) >= 1, 'compteur d\'événements du tick');
    assert(Number(asRecord(afterState.jobs).completed) >= 1, 'compteur de jobs du tick');
  });

  /* ---------------------------------------------------------------- */
  /* 2 — Les jobs ÉCHUS sont détectés et traités par le trigger        */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 2 : jobs échus détectés et traités (rappels DUE + J3, dates réelles)', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-due-jobs' });
    const report = await harness.automationWorker?.runScheduledCycle({ trigger: 'scheduled' });
    assert(report, 'rapport de cycle attendu');
    // Clock 05/10/2026, début 01/08/2026 → M1 (01/09) et M2 (01/10) échues.
    // 4 événements réels de la chaîne (APPLICATION_SUBMITTED, PROPOSAL_SENT,
    // PROPOSAL_ACCEPTED, CONTRACT_ACTIVATED) sont tous consommés.
    const activatedEntry = report.events.entries.find(entry => entry.eventType === 'CONTRACT_ACTIVATED');
    assert(activatedEntry?.result === 'completed', 'CONTRACT_ACTIVATED consommé par le déclenchement');
    assert(report.events.claimed >= 1 && report.events.retried === 0 && report.events.deadLettered === 0, 'événements claimés sans échec');
    // 6 jobs échus : M1/M2 salaire DUE + commission M1 DUE + M1/M2 salaire J3 + commission M1 J3.
    assert(report.jobs.claimed === 6, `6 jobs échus claimés, reçu ${report.jobs.claimed}`);
    assert(report.jobs.failed === 0, 'aucun job échoué sur données cohérentes');

    const dueReminders = pickAll(await jobRows(harness, 'SALARY_DUE_REMINDER'), row => row.status === 'COMPLETED');
    assert(dueReminders.length === 2, 'les 2 rappels salariaux échus sont COMPLETED');
    const commissionDue = pickAll(await jobRows(harness, 'COMMISSION_DUE_REMINDER'), row => row.status === 'COMPLETED');
    assert(commissionDue.length === 1, 'le rappel commission M1 échue est COMPLETED');
    const j3 = pickAll(await jobRows(harness, 'SALARY_OVERDUE_J3_REMINDER'), row => row.status === 'COMPLETED');
    assert(j3.length === 2, 'les 2 rappels J3 salariaux échus sont COMPLETED');
    const eligibilityRows = await auditRows(harness, 'SCHEDULE_J3_ELIGIBILITY_RECORDED');
    assert(eligibilityRows.length >= 3, 'traces J3 consignées (2 salaire + 1 commission)');
    const eligibleJ3 = eligibilityRows.filter(row => asRecord(row.after_state).eligibility === 'ELIGIBLE');
    assert(eligibleJ3.length >= 3, 'J3 M1/M2 salaire + M1 commission éligibles (grace dépassée)');
    const overdueEvents = await outboxRows(harness, 'PAYMENT_OVERDUE_J3');
    assert(overdueEvents.length === 3, `3 événements PAYMENT_OVERDUE_J3 dans l'Outbox, reçu ${overdueEvents.length}`);
  });

  /* ---------------------------------------------------------------- */
  /* 3 — Les jobs FUTURS sont ignorés                                  */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 3 : jobs futurs ignorés (due_at > now → PENDING, attempts=0)', async harness => {
    await activateContractThroughApi(harness, { keyPrefix: 'cron-future-jobs' });
    await harness.automationWorker?.runScheduledCycle();
    // M3 (01/11) → M6 (01/02) sont FUTURS au 05/10.
    const futureReminders = pickAll(await jobRows(harness, 'SALARY_DUE_REMINDER'), row => row.status === 'PENDING');
    assert(futureReminders.length === 4, `4 rappels futurs PENDING, reçu ${futureReminders.length}`);
    assert(futureReminders.every(row => Number(row.attempts) === 0), 'aucune tentative sur les jobs futurs');
    const futureJ3 = pickAll(await jobRows(harness, 'SALARY_OVERDUE_J3_REMINDER'), row => row.status === 'PENDING');
    assert(futureJ3.length === 4, '4 jobs J3 futurs PENDING');
    // Un job planifié avec une échéance future : ignoré, jamais claimé.
    const stores = createSqlAutomationStores(harness.database);
    const key = 'future-manual-job';
    const createdAt = harness.clock.value.toISOString();
    const dueAt = new Date(harness.clock.value.getTime() + 30 * 24 * 3600_000).toISOString();
    const created = await stores.jobs.createIfAbsent({
      jobId: 'job_future_manual_001',
      jobType: 'SALARY_DUE_REMINDER',
      aggregateType: 'contract',
      aggregateId: 'ctr_future',
      dueAt,
      idempotencyKey: key,
      createdAt,
    });
    assert(created.kind === 'created', 'job futur créé');
    await harness.automationWorker?.runScheduledCycle();
    const manual = (await jobRows(harness)).find(j => j.job_id === 'job_future_manual_001');
    assert(manual?.status === 'PENDING' && Number(manual?.attempts) === 0, 'job futur non claimé après 2 cycles');
  });

  /* ---------------------------------------------------------------- */
  /* 4 — Double déclenchement Cron → aucun double effet métier         */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 4 : deux Cron simultanés → un seul effet métier (idempotence durable)', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-double' });
    const second = freshAutomationWorker(harness);
    const [first, secondReport] = await Promise.all([
      harness.automationWorker?.runScheduledCycle({ trigger: 'scheduled' }),
      second.runScheduledCycle({ trigger: 'scheduled' }),
    ]);
    assert(first && secondReport, 'deux rapports de cycle attendus');
    // Les 4 événements réels de la chaîne sont claimés UNE fois au total entre
    // les deux workers (claim verrouillé + CAS de statut) : jamais deux.
    const totalClaimed = (first?.events.claimed ?? 0) + (secondReport.events.claimed ?? 0);
    const totalDuplicates = (first?.events.duplicates ?? 0) + (secondReport.events.duplicates ?? 0);
    assert(totalClaimed + totalDuplicates === 4, `4 événements traités une seule fois, reçu claimed=${totalClaimed} dup=${totalDuplicates}`);
    const processed = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(processed?.status === 'PROCESSED' && Number(processed?.attempts) === 1, 'événement PROCESSED, 1 tentative');
    const schedule = await contractPaymentSchedule(harness, chain.contractId);
    assert(schedule.length === 6, 'échéancier unique projeté (jamais dupliqué)');
    const deadlines = await deadlineRows(harness, chain.contractId);
    const m1 = pickAll(deadlines, row => /-M1$/.test(String(row.reference)));
    assert(m1.length === 2, `2 échéances M1 (salaire + commission, référence ${m1[0]?.reference}), reçu ${m1.length}`);
    assert(new Set(m1.map(row => String(row.id))).size === 2, 'aucune échéance dupliquée par le double tick');
    const idempotency = await q(harness, `SELECT * FROM automation_idempotency WHERE command = $1`, ['automation.CONTRACT_ACTIVATED']);
    assert(idempotency.length === 1, 'une seule réserve d\'idempotence d\'activation');
    const ticks = await countAudit(harness, 'CRON_TICK_EXECUTED', CRON_QUEUE_SOURCE);
    assert(ticks === 2, 'les deux ticks sont tracés (observabilité), un seul effet métier');
  });

  /* ---------------------------------------------------------------- */
  /* 5 — Deux workers simultanés → une seule réservation               */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 5 : deux workers simultanés sur un même job → une seule réservation (claim verrouillé)', async harness => {
    await activateContractThroughApi(harness, { keyPrefix: 'cron-two-workers' });
    await harness.automationWorker?.runScheduledCycle();
    // On réarme UN job (celui du rappel M1) et deux workers drainent ensemble.
    const jobs = await jobRows(harness, 'SALARY_DUE_REMINDER');
    const target = jobs.find(row => row.status === 'COMPLETED');
    assert(target, 'un rappel déjà COMPLETED à réarmer');
    await q(harness, `UPDATE automation_jobs SET status='PENDING', attempts=0, started_at=NULL, completed_at=NULL, last_error=NULL WHERE job_id=$1`, [target.job_id]);
    const before = (await outboxRows(harness, 'NOTIFICATION_REQUIRED')).length;
    const second = freshAutomationWorker(harness);
    const [r1, r2] = await Promise.all([harness.automationWorker?.runDueJobs(), second.runDueJobs()]);
    const claimed = (r1?.claimed ?? 0) + (r2?.claimed ?? 0);
    assert(claimed === 1, `le job est claimé une seule fois entre les deux workers, reçu ${claimed}`);
    const after = firstRow((await jobRows(harness)).filter(row => row.job_id === target.job_id));
    assert(after?.status === 'COMPLETED' && Number(after?.attempts) === 1, 'job COMPLETED, 1 tentative');
    const afterEvents = await outboxRows(harness, 'NOTIFICATION_REQUIRED');
    // Le rejeu est IDEMPOTENT (réserve déjà complétée) : aucun nouvel événement.
    assert(afterEvents.length === before, 'aucun second effet métier (rejeu idempotent)');
  });

  /* ---------------------------------------------------------------- */
  /* 6 — Retry après échec, puis convergence                           */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 6 : retry après échec (RETRYABLE + tentatives + last_error) puis convergence', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-retry' });
    const eventId = contractActivatedEventId(chain.contractId);
    const captured = await captureContractRow(harness, chain.contractId);
    await deleteContractRow(harness, chain.contractId);

    const first = await harness.automationWorker?.runScheduledCycle();
    assert(first, 'premier cycle');
    let row = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(row?.status === 'RETRYABLE' && Number(row?.attempts) === 1, `RETRYABLE après échec, reçu ${row?.status}`);
    assert(typeof row?.last_error === 'string' && String(row.last_error).length > 0, 'last_error consignée');
    const availableAt = new Date(String(row?.available_at)).getTime();
    expect(availableAt > harness.clock.value.getTime(), 'disponible après le délai de rejeu (+30 s)');
    assert((await countAudit(harness, 'AUTOMATION_HANDLER_FAILED')) >= 1, 'échec tracé dans l\'audit existant');

    // Le job reste en file : le retry n'est PAS perdu.
    await restoreContractRow(harness, captured);
    advanceClock(harness, 31_000);
    const second = await harness.automationWorker?.runScheduledCycle();
    row = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(row?.status === 'PROCESSED' && Number(row?.attempts) === 2, `PROCESSED au second cycle (2 tentatives), reçu ${row?.status}`);
    const schedule = await contractPaymentSchedule(harness, chain.contractId);
    assert(schedule.length === 6, 'convergence : échéancier projeté');
    assert(second, 'second cycle rapporté');
  });

  /* ---------------------------------------------------------------- */
  /* 7 — Dead-letter à la borne de tentatives                          */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 7 : dead-letter à la borne (attempts >= max) — rien n\'est perdu en silence', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-deadletter' });
    const eventId = contractActivatedEventId(chain.contractId);
    await deleteContractRow(harness, chain.contractId);
    await q(harness, `UPDATE automation_outbox SET attempts=$1, status='PENDING', available_at=$3 WHERE id=$2`, [DEFAULT_MAX_ATTEMPTS, eventId, harness.clock.value.toISOString()]);

    const report = await harness.automationWorker?.runScheduledCycle();
    assert(report, 'cycle rapporté');
    const row = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(row?.status === 'DEAD_LETTER', `DEAD_LETTER à la borne, reçu ${row?.status}`);
    assert(Number(row?.attempts) >= DEFAULT_MAX_ATTEMPTS, 'borne de tentatives atteinte');
    assert(typeof row?.last_error === 'string' && String(row.last_error).length > 0, 'raison de la dead-letter conservée');

    // Jamais re-claimé ensuite : le terminal est stable.
    advanceClock(harness, 60_000);
    const again = await harness.automationWorker?.runScheduledCycle();
    assert(again, 'cycle suivant');
    const stable = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(stable?.status === 'DEAD_LETTER' && Number(stable?.attempts) === Number(row?.attempts), 'la dead-letter n\'est jamais re-claimée');
  });

  /* ---------------------------------------------------------------- */
  /* 8 — Crash APRÈS réservation / AVANT ack → récupération            */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 8a : événement PROCESSING orphelin (crash après réservation) → récupéré et re-joué UNE fois', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-crash-event' });
    const eventId = contractActivatedEventId(chain.contractId);
    // Réservation RÉELLE via le store (claim + processing_started_at posé).
    const stores = createSqlAutomationStores(harness.database);
    const claimed = await stores.outbox.claimDue({
      limit: 1,
      eventTypes: ['CONTRACT_ACTIVATED'],
      now: harness.clock.value.toISOString(),
    });
    assert(claimed.length === 1, 'événement réellement claimé (PROCESSING)');
    // Crash : le claim devient orphelin (plus vieux que la borne de 10 min).
    await q(harness, 'UPDATE automation_outbox SET processing_started_at=$1 WHERE id=$2', [staleTimestamp(harness, 60_000), eventId]);

    const report = await harness.automationWorker?.runScheduledCycle();
    assert(report, 'cycle après crash');
    assert(report.recovered.eventsRecovered === 1, `1 orphelin événement récupéré, reçu ${report.recovered.eventsRecovered}`);
    const row = firstRow(await outboxRows(harness, 'CONTRACT_ACTIVATED'));
    assert(row?.status === 'PROCESSED', `re-joué jusqu\'à PROCESSED, reçu ${row?.status}`);
    const schedule = await contractPaymentSchedule(harness, chain.contractId);
    assert(schedule.length === 6, 'effet métier UNIQUE malgré le rejeu');
    const recoveredAudit = await auditRows(harness, 'STALE_OUTBOX_EVENTS_RECOVERED', CRON_QUEUE_SOURCE);
    assert(recoveredAudit.length === 1, 'récupération tracée (acteur SYSTEM, source P0-CRON-QUEUE)');
    const recoveredState = asRecord(recoveredAudit[0].after_state);
    assert(Array.isArray(recoveredState.eventIds) && (recoveredState.eventIds as string[])[0] === eventId, 'l\'événement est identifié dans la trace');
  });

  await check('P0-CRON-QUEUE 8b : job RUNNING orphelin APRÈS exécution (ack perdu) → rejeu idempotent, aucun second effet', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-crash-job' });
    await harness.automationWorker?.runScheduledCycle();
    // Un job COMPLETED réellement exécuté : on simule la perte de l\'ack
    // (retour RUNNING + claim orphelin) pour vérifier la reprise.
    const jobs = (await jobRows(harness)).filter(row => row.status === 'COMPLETED');
    assert(jobs.length >= 1, 'au moins un job exécuté');
    const target = jobs.find(row => row.job_type === 'SALARY_DUE_REMINDER') ?? jobs[0];
    await q(harness, `UPDATE automation_jobs SET status='RUNNING', started_at=$1, completed_at=NULL, attempts=attempts+1 WHERE job_id=$2`, [staleTimestamp(harness, 60_000), target.job_id]);
    const eventsBefore = (await outboxRows(harness)).length;

    const report = await harness.automationWorker?.runScheduledCycle();
    assert(report, 'cycle après perte d\'ack');
    assert(report.recovered.jobsRecovered === 1, `1 orphelin job récupéré, reçu ${report.recovered.jobsRecovered}`);
    const row = firstRow((await jobRows(harness)).filter(j => j.job_id === target.job_id));
    assert(row?.status === 'COMPLETED', `re-passé à COMPLETED, reçu ${row?.status}`);
    const eventsAfter = (await outboxRows(harness)).length;
    assert(eventsAfter === eventsBefore, 'AUCUN second effet métier (idempotence des handlers)');
    const audit = await auditRows(harness, 'STALE_JOBS_RECOVERED', CRON_QUEUE_SOURCE);
    assert(audit.length === 1, 'récupération job tracée');
  });

  await check('P0-CRON-QUEUE 8c : job orphelin à la borne de tentatives → FAILED (terminal, jamais re-claimé)', async harness => {
    await activateContractThroughApi(harness, { keyPrefix: 'cron-crash-terminal' });
    const stores = createSqlAutomationStores(harness.database);
    const createdAt = harness.clock.value.toISOString();
    const dueAt = new Date(harness.clock.value.getTime() - 60_000).toISOString();
    const created = await stores.jobs.createIfAbsent({
      jobId: 'job_crash_terminal_001',
      jobType: 'SALARY_DUE_REMINDER',
      aggregateType: 'contract',
      aggregateId: 'ctr_missing',
      dueAt,
      idempotencyKey: 'crash-terminal-key',
      createdAt,
    });
    assert(created.kind === 'created', 'job créé');
    await q(harness, `UPDATE automation_jobs SET status='RUNNING', started_at=$1, attempts=$2 WHERE job_id=$3`, [staleTimestamp(harness, 60_000), DEFAULT_MAX_ATTEMPTS, 'job_crash_terminal_001']);

    const report = await harness.automationWorker?.runScheduledCycle();
    assert(report, 'cycle');
    assert(report.recovered.jobsFailed === 1, `job orphelin en borne → FAILED, reçu ${report.recovered.jobsFailed}`);
    const row = firstRow((await jobRows(harness)).filter(j => j.job_id === 'job_crash_terminal_001'));
    assert(row?.status === 'FAILED', `FAILED (terminal jobs), reçu ${row?.status}`);
    advanceClock(harness, 60_000);
    await harness.automationWorker?.runScheduledCycle();
    const stable = firstRow((await jobRows(harness)).filter(j => j.job_id === 'job_crash_terminal_001'));
    assert(stable?.status === 'FAILED', 'le terminal FAILED n\'est jamais re-claimé');
    const audit = await auditRows(harness, 'STALE_JOBS_FAILED', CRON_QUEUE_SOURCE);
    assert(audit.length === 1, 'mise en FAILED tracée');
  });

  /* ---------------------------------------------------------------- */
  /* 9 — Idempotence métier : une échéance exécutée deux fois          */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 9 : une échéance/jobs exécutée deux fois → aucun second effet métier', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-idempotence' });
    await harness.automationWorker?.runScheduledCycle();
    const j3Jobs = (await jobRows(harness, 'SALARY_OVERDUE_J3_REMINDER')).filter(row => row.status === 'COMPLETED');
    assert(j3Jobs.length === 2, '2 jobs J3 exécutés au premier cycle');
    const j3Before = (await outboxRows(harness, 'PAYMENT_OVERDUE_J3')).length;
    const deadlinesBefore = await deadlineRows(harness, chain.contractId);
    const escalatedBefore = pickAll(deadlinesBefore, row => row.status === 'ESCALATED').length;
    assert(escalatedBefore >= 2, 'échéances salariales M1/M2 déjà ESCALATED');

    // On réarme les DEUX jobs J3 (double déclenchement) et on rejoue.
    for (const job of j3Jobs) {
      await q(harness, `UPDATE automation_jobs SET status='PENDING', due_at=$2, started_at=NULL, completed_at=NULL WHERE job_id=$1`, [job.job_id, harness.clock.value.toISOString()]);
    }
    const report = await harness.automationWorker?.runDueJobs();
    assert(report, 'rejeu rapporté');
    assert(report.claimed === 2 && report.completed === 2, 'rejeu claimé et complété (déjà traité)');
    const j3After = (await outboxRows(harness, 'PAYMENT_OVERDUE_J3')).length;
    assert(j3After === j3Before, 'AUCUN second événement PAYMENT_OVERDUE_J3');
    const deadlinesAfter = await deadlineRows(harness, chain.contractId);
    const escalatedAfter = pickAll(deadlinesAfter, row => row.status === 'ESCALATED').length;
    assert(escalatedAfter === escalatedBefore, 'les échéances ne sont pas re-escaladées');
    const duplicateOutcomes = (report.entries ?? []).filter(entry => entry.outcome?.eligibility === 'DUPLICATE');
    assert(duplicateOutcomes.length === 2, 'le rejeu est signalé DUPLICATE (déjà traité)');
  });

  /* ---------------------------------------------------------------- */
  /* 10 — Audit du déclenchement et de la récupération                 */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 10 : observabilité — tick, récupération et lifecycle audités (SYSTEM + source P0-CRON-QUEUE)', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-audit' });
    await harness.automationWorker?.runScheduledCycle();
    // Un orphelin job pour exercer la trace de récupération.
    const jobs = (await jobRows(harness)).filter(row => row.status === 'COMPLETED');
    assert(jobs.length >= 1, 'job exécuté');
    const target = jobs[0];
    await q(harness, `UPDATE automation_jobs SET status='RUNNING', started_at=$1, completed_at=NULL, attempts=attempts+1 WHERE job_id=$2`, [staleTimestamp(harness, 60_000), target.job_id]);
    await harness.automationWorker?.runScheduledCycle();

    const ticks = await auditRows(harness, 'CRON_TICK_EXECUTED', CRON_QUEUE_SOURCE);
    assert(ticks.length === 2, 'un tick audité par déclenchement');
    for (const tick of ticks) {
      assert(tick.actor_id === 'SYSTEM', 'acteur SYSTEM');
      assert(tick.entity_id === 'cron:scheduled', 'entité cron:scheduled');
      const after = asRecord(tick.after_state);
      assert(typeof after.durationMs === 'number' && after.trigger === 'scheduled', 'horodatage + déclencheur + durée consignés');
      assert('events' in after && 'payments' in after && 'jobs' in after && 'recovered' in after, 'compteurs de chaque étape du drain réel');
    }
    assert((await countAudit(harness, 'STALE_JOBS_RECOVERED', CRON_QUEUE_SOURCE)) === 1, 'trace de récupération job');
    // Lifecycle métier existant toujours présent (worker responsable identifiable).
    assert((await countAudit(harness, 'CONTRACT_REMINDER_JOBS_SCHEDULED')) >= 1, 'planification des jobs tracée (P0-AUTO-2)');
    assert((await countAudit(harness, 'SCHEDULE_J3_ELIGIBILITY_RECORDED')) >= 2, 'éligibilité J3 tracée');
    assert((await countAudit(harness, 'CONTRACT_SCHEDULE_CREATED')) >= 1, 'projetage de l\'échéancier tracé');
  });

  /* ---------------------------------------------------------------- */
  /* 11 — Échéance PAIEMENT : SCHEDULED → DUE via le trigger           */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 11 : échéance paiement — le balayage SCHEDULED→DUE passe par le déclencheur (lignes + JSONB + Outbox)', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-payment-due' });
    const before = await paymentsRows(harness, chain.contractId);
    assert(before.every(row => row.status === 'SCHEDULED'), 'tous les paiements SCHEDULED avant déclenchement');
    const report = await harness.automationWorker?.runScheduledCycle();
    assert(report, 'cycle');
    assert(report.payments.applied === 3, `balayage : 3 paiements échus (M1 salaire + commission, M2 salaire), reçu ${report.payments.applied}`);
    const after = await paymentsRows(harness, chain.contractId);
    const due = pickAll(after, row => row.status === 'DUE');
    assert(due.length === 3, '3 lignes paiements DUE');
    const scheduled = pickAll(after, row => row.status === 'SCHEDULED');
    assert(scheduled.length === after.length - 3, 'les paiements futurs restent SCHEDULED');
    const schedule = await contractPaymentSchedule(harness, chain.contractId);
    const m1Entry = firstRow(schedule.filter(entry => /-M1$/.test(String(entry.id))));
    const m2Entry = firstRow(schedule.filter(entry => /-M2$/.test(String(entry.id))));
    assert(m1Entry?.salaryStatus === 'DUE' && m1Entry?.commissionStatus === 'DUE', 'entrée M1 projetée DUE (salaire + commission)');
    assert(m2Entry?.salaryStatus === 'DUE', 'entrée M2 projetée DUE (salaire)');
    const dueInJsonb = schedule.filter(entry => entry.salaryStatus === 'DUE' || entry.commissionStatus === 'DUE');
    assert(dueInJsonb.length === 2, `le JSONB du contrat est projeté sur 2 entrées (M1, M2), reçu ${dueInJsonb.length}`);
    const futureInJsonb = schedule.filter(entry => entry.salaryStatus === 'SCHEDULED');
    assert(futureInJsonb.length === 4, 'les entrées M3-M6 restent SCHEDULED dans le JSONB');
    const events = await outboxRows(harness, 'PAYMENT_DUE');
    assert(events.length === 3, `3 événements PAYMENT_DUE dans l'Outbox (workflow de notification), reçu ${events.length}`);
  });

  /* ---------------------------------------------------------------- */
  /* 12 — Échéance CLAIM : deadline de preuve                          */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 12 : échéance claim — la deadline de preuve expire et escalade via le déclencheur', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-claim-deadline' });
    // Premier cycle : matérialise les paiements (l\'activation produit l\'événement,
    // c\'est le worker d\'automatisation qui écrit les lignes `payments`).
    await harness.automationWorker?.runScheduledCycle();
    // Salaire M1 payé (fixture locale d\'état métier, comme le script workerd).
    const salary = firstRow((await paymentsRows(harness, chain.contractId)).filter(row => row.payment_type === 'SALARY' && Number(row.month_number) === 1));
    assert(salary, 'paiement salaire M1 matérialisé');
    await q(harness, `UPDATE payments SET status='PAID', submitted_at=now(), reference='CRON-TEST', current_declaration_id='decl_cron_test', declaration_count=1, verified_at=now() WHERE id=$1`, [salary.id]);
    // Claim candidat sur le salaire.
    const claimResponse = await harness.worker.fetch(authRequest('/api/v1/claims', chain.candidate.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-claim-create' },
      body: JSON.stringify({ contractId: chain.contractId, paymentId: salary.id, type: 'SALARY_NOT_RECEIVED', reason: 'Salaire non reçu malgré paiement.' }),
    }));
    const claim = await claimResponse.json() as { claimId: string; status: string };
    assert(claimResponse.status === 201, `claim créé, reçu ${claimResponse.status}`);
    assert(claim.status === 'OPEN', 'claim OPEN');

    // Chaque passe de drain claime un lot FIXE : l'événement CLAIM_EVIDENCE_REQUESTED
    // (ajouté pendant le traitement de CLAIM_CREATED) est consommé à la passe suivante.
    await harness.automationWorker?.runScheduledCycle(); // CLAIM_CREATED → EVIDENCE_REQUESTED + événement
    await harness.automationWorker?.runScheduledCycle(); // CLAIM_EVIDENCE_REQUESTED → job + deadline
    const claimAfterFirst = firstRow(await q(harness, 'SELECT * FROM claims WHERE claim_id=$1', [claim.claimId]));
    assert(claimAfterFirst?.status === 'EVIDENCE_REQUESTED', `claim EVIDENCE_REQUESTED, reçu ${claimAfterFirst?.status}`);
    const evidenceJobs = (await jobRows(harness, 'CLAIM_EVIDENCE_DEADLINE')).filter(row => row.status === 'PENDING');
    assert(evidenceJobs.length === 1, 'job de deadline de preuve planifié');
    const dueAt = new Date(String(evidenceJobs[0].due_at)).getTime();
    assert(dueAt > harness.clock.value.getTime(), 'deadline future avant expiration');

    advanceClock(harness, 61_000);
    const second = await harness.automationWorker?.runScheduledCycle();
    assert(second, 'cycle d\'expiration');
    const claimAfter = firstRow(await q(harness, 'SELECT * FROM claims WHERE claim_id=$1', [claim.claimId]));
    assert(claimAfter?.status === 'ADMIN_REVIEW', `claim escaladé ADMIN_REVIEW, reçu ${claimAfter?.status}`);
    // La deadline de preuve porte l'agrégat CLAIM (claimId), pas le contrat.
    const deadlines = (await deadlineRows(harness, claim.claimId)).filter(row => row.kind === 'CLAIM_EVIDENCE');
    assert(deadlines.length === 1 && deadlines[0].status === 'ESCALATED', 'délai de preuve ESCALATED');
    for (const eventType of ['CLAIM_DEADLINE_REACHED', 'CLAIM_ESCALATED']) {
      assert((await outboxRows(harness, eventType)).length === 1, `événement ${eventType} dans l\'Outbox`);
    }
  });

  /* ---------------------------------------------------------------- */
  /* 13 — Échéance SALAIRE : J+3 (grace)                               */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 13 : échéance salaire — la J+3 escalade le délai salarial M1 (règle existante, non inventée)', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-salary-j3' });
    await harness.automationWorker?.runScheduledCycle();
    const m1 = firstRow((await deadlineRows(harness, chain.contractId)).filter(row => row.kind === 'SALARY_PAYMENT' && /-M1$/.test(String(row.reference))));
    assert(m1, 'délai salarial M1 présent');
    assert(m1.status === 'ESCALATED', `M1 ESCALATED après J+3 dépassée, reçu ${m1.status}`);
    // Le afterState J3 documente l'entrée d'échéancier (scheduleEntryId), qui EST
    // la référence de la deadline (reference = id de l'entrée) — pas l'id de la row.
    const j3Audit = await auditRows(harness, 'SCHEDULE_J3_ELIGIBILITY_RECORDED');
    const m1J3 = j3Audit.find(row => String(asRecord(row.after_state).scheduleEntryId ?? '') === String(m1.reference));
    assert(m1J3, 'trace J3 pour le délai salarial M1');
    assert(asRecord(m1J3.after_state).eligibility === 'ELIGIBLE' && Number(asRecord(m1J3.after_state).daysLate) >= 3, 'J3 éligible, daysLate >= 3 (grace réelle)');
    assert((await outboxRows(harness, 'PAYMENT_OVERDUE_J3')).length >= 1, 'événement J3 dans l\'Outbox');
  });

  /* ---------------------------------------------------------------- */
  /* 14 — Notification via le workflow EXISTANT                        */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 14 : notification via le workflow existant (événement → Outbox → Notification Service, In-App réel)', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-notifications' });
    await harness.automationWorker?.runScheduledCycle(); // paiements échus + rappels + J3
    const prepared = (await outboxRows(harness)).filter(row => ['PAYMENT_DUE', 'PAYMENT_OVERDUE_J3', 'NOTIFICATION_REQUIRED'].includes(String(row.event_type)));
    assert(prepared.length >= 5, `événements prêts pour notification (PAYMENT_DUE×3 + J3×2 + rappels), reçu ${prepared.length}`);
    await harness.automationWorker?.runScheduledCycle(); // la notification service consomme
    const notifications = await notificationsRows(harness);
    const mapped = pickAll(notifications, row => ['PAYMENT_DUE', 'PAYMENT_OVERDUE_J3', 'NOTIFICATION_REQUIRED'].includes(String(row.source_event_type)));
    assert(mapped.length >= 5, `notifications In-App créées via l\'Outbox existant, reçu ${mapped.length}`);
    assert(mapped.every(row => row.is_read === false && row.push_status === 'NOT_AVAILABLE' && row.email_status === 'NOT_AVAILABLE'), 'In-App réel ; push/email en abstraction (aucun canal inventé)');
    const employerId = chain.employer.userId;
    const candidateId = chain.candidate.userId;
    assert(mapped.every(row => row.recipient_id === employerId || row.recipient_id === candidateId), 'destinataires = parties réelles du contrat');
  });

  /* ---------------------------------------------------------------- */
  /* 15 — Réputation : réconciliation planifiable sans duplication     */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 15 : réconciliation réputation planifiée dans la file existante — idempotente, sans duplication', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-reputation' });
    // Un fait documenté réel : terminer le contrat (règle existante).
    const endResponse = await harness.worker.fetch(authRequest(`/api/v1/contracts/${chain.contractId}/end`, chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-reputation-end' },
      body: JSON.stringify({ reason: 'Mission terminée.' }),
    }));
    assert(endResponse.status === 200, `contrat terminé, reçu ${endResponse.status}`);
    // Le contrat doit rester présent : le reader de faits (CONTRACT_COMPLETED) le lit.

    const createdAt = harness.clock.value.toISOString();
    const dueAt = new Date(harness.clock.value.getTime() - 60_000).toISOString();
    const key = `reconciliation-${chain.employer.userId}`;
    const scheduled = await scheduleReputationReconciliationJob({
      stores: createSqlAutomationStores(harness.database),
      subjectUserId: chain.employer.userId,
      dueAt,
      idempotencyKey: key,
      createdAt,
    });
    assert(scheduled.kind === 'created', 'job de réconciliation créé (file existante)');
    const duplicate = await scheduleReputationReconciliationJob({
      stores: createSqlAutomationStores(harness.database),
      subjectUserId: chain.employer.userId,
      dueAt,
      idempotencyKey: key,
      createdAt: new Date(harness.clock.value.getTime() + 1000).toISOString(),
    });
    assert(duplicate.kind === 'duplicate' && duplicate.jobId === scheduled.jobId, 'aucun second job pour la même clé (planification idempotente)');
    const jobs = (await jobRows(harness, REPUTATION_RECONCILIATION_JOB_TYPE)).filter(row => row.aggregate_id === chain.employer.userId);
    assert(jobs.length === 1, 'UN SEUL job planifié');
    assert((await countAudit(harness, 'REPUTATION_RECONCILIATION_JOB_SCHEDULED')) === 1, 'planification tracée (audit idempotent)');

    const report = await harness.automationWorker?.runScheduledCycle();
    assert(report, 'cycle');
    const job = firstRow((await jobRows(harness, REPUTATION_RECONCILIATION_JOB_TYPE)).filter(row => row.job_id === scheduled.jobId));
    assert(job?.status === 'COMPLETED', `job de réconciliation COMPLETED, reçu ${job?.status}`);
    let entries = await reputationEntriesRows(harness, chain.employer.userId);
    assert(entries.length === 1, `1 entrée réputation (contrat terminé), reçu ${entries.length}`);
    assert(entries[0].provenance === 'RECONCILIATION' && entries[0].rule_code === 'CONTRACT_COMPLETED_PARTY', 'règle existante appliquée (aucune nouvelle logique)');
    const reconciled = await auditRows(harness, 'REPUTATION_RECONCILED');
    assert(reconciled.length === 1 && String(reconciled[0].source).startsWith('automation:'), 'réconciliation tracée (source automation)');

    // Rejeu du job (déjà traité) : aucune duplication.
    await q(harness, `UPDATE automation_jobs SET status='PENDING', due_at=$2, started_at=NULL, completed_at=NULL WHERE job_id=$1`, [scheduled.jobId, harness.clock.value.toISOString()]);
    await harness.automationWorker?.runDueJobs();
    const after = firstRow((await jobRows(harness, REPUTATION_RECONCILIATION_JOB_TYPE)).filter(row => row.job_id === scheduled.jobId));
    assert(after?.status === 'COMPLETED', 'rejeu complété (idempotence durable)');
    entries = await reputationEntriesRows(harness, chain.employer.userId);
    assert(entries.length === 1, 'AUCUNE entrée dupliquée après rejeu');
    // Et la commande explicite EXISTANTE reste idempotente face au job (même cœur).
    const apiReconcile = await harness.worker.fetch(authRequest('/api/v1/my/reputation/reconcile', chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-reputation-api' },
      body: JSON.stringify({}),
    }));
    const apiReport = await apiReconcile.json() as { appended: number; duplicates: number };
    assert(apiReconcile.status === 200, `commande explicite toujours ouverte, reçu ${apiReconcile.status}`);
    assert(apiReport.appended === 0 && apiReport.duplicates === 1, 'commande explicite : 0 ajout, 1 doublon (même cœur partagé)');
    entries = await reputationEntriesRows(harness, chain.employer.userId);
    assert(entries.length === 1, 'toujours une seule entrée après les deux fronts');
  });

  /* ---------------------------------------------------------------- */
  /* 16 — Sécurité : le trigger ne fait rien d\'arbitraire             */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 16 : sécurité — types non déclarés ignorés, aucune route publique de drain', async harness => {
    // ÉVÉNEMENT de type non déclaré : le worker ne le claime JAMAIS.
    await q(harness, `INSERT INTO automation_outbox (id, event_type, aggregate_type, aggregate_id, payload, source, created_at, status, attempts, available_at)
      VALUES ('evr_invent_001', 'TOTALEMENT_INVENTE', 'contract', 'ctr_x', '{}', 'test', now(), 'PENDING', 0, now())`);
    // JOB de type non déclaré : idem.
    await q(harness, `INSERT INTO automation_jobs (job_id, job_type, aggregate_type, aggregate_id, due_at, status, attempts, idempotency_key, created_at)
      VALUES ('job_invent_001', 'ACTION_METIER_INVENTEE', 'contract', 'ctr_x', now() - interval '1 minute', 'PENDING', 0, 'invent-key', now())`);

    await harness.automationWorker?.runScheduledCycle();
    await harness.automationWorker?.runScheduledCycle();

    const event = firstRow(await q(harness, 'SELECT * FROM automation_outbox WHERE id=$1', ['evr_invent_001']));
    assert(event?.status === 'PENDING' && Number(event?.attempts) === 0, 'événement non déclaré jamais claimé (aucune action arbitraire)');
    const job = firstRow(await q(harness, 'SELECT * FROM automation_jobs WHERE job_id=$1', ['job_invent_001']));
    assert(job?.status === 'PENDING' && Number(job?.attempts) === 0, 'job non déclaré jamais claimé');

    // Aucune route publique : le drain n\'est PAS exposé via HTTP (route inconnue → 404).
    for (const path of ['/api/v1/automation/drain', '/api/v1/cron', '/api/v1/automation/run', '/api/v1/scheduled']) {
      const response = await harness.worker.fetch(authRequest(path, null, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
      assert(response.status === 404, `${path} inconnu (404, pas de route de drain), reçu ${response.status}`);
    }
  });

  /* ---------------------------------------------------------------- */
  /* 17 — Non-régression P0-R2 (documents)                             */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 17 : non-régression P0-R2 — le parcours documents fonctionne après un cycle complet du déclencheur', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-r2' });
    await harness.automationWorker?.runScheduledCycle();
    const content = '%PDF-1.4 contenu post-cron';
    const sizeBytes = new TextEncoder().encode(content).length;
    const grantResponse = await harness.worker.fetch(authRequest('/api/v1/documents/upload-grants', chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-r2-grant' },
      body: JSON.stringify({
        title: 'Contrat de mission',
        fileName: 'contrat.pdf',
        contentType: 'application/pdf',
        sizeBytes,
        documentType: 'CONTRACT_DOCUMENT',
      }),
    }));
    assert(grantResponse.status === 200, `upload-grant après cycle cron, reçu ${grantResponse.status}`);
    const grant = await grantResponse.json() as { document: { documentId: string; status: string }; version: { versionNumber: number } };
    assert(grant.document.documentId.startsWith('doc_') && grant.document.status === 'ACTIVE', 'document créé actif');
    assert(grant.version.versionNumber === 1, 'version 1 créée');
    const listResponse = await harness.worker.fetch(authRequest('/api/v1/my/documents', chain.employer.token));
    assert(listResponse.status === 200, 'liste documents lisible');
  }, {
    documentStorage: createInMemoryObjectStorage(),
    documentUrlSigningSecret: 'test-only-cron-queue-document-url-signing-secret',
  });

  /* ---------------------------------------------------------------- */
  /* 18 — Non-régression P0-REPUTATION (commande explicite)            */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 18 : non-régression P0-REPUTATION — la commande explicite reste idempotente et ouverte', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-reputation-nr' });
    await harness.automationWorker?.runScheduledCycle();
    const first = await harness.worker.fetch(authRequest('/api/v1/my/reputation/reconcile', chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-reputation-nr-1' },
      body: JSON.stringify({}),
    }));
    assert(first.status === 200, `première réconciliation explicite, reçu ${first.status}`);
    const second = await harness.worker.fetch(authRequest('/api/v1/my/reputation/reconcile', chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-reputation-nr-2' },
      body: JSON.stringify({}),
    }));
    const secondReport = await second.json() as { appended: number; duplicates: number };
    assert(second.status === 200, 'seconde réconciliation acceptée (idempotente)');
    assert(secondReport.appended === 0, 'aucune entrée dupliquée par la commande explicite');
    const mine = await harness.worker.fetch(authRequest('/api/v1/my/reputation', chain.employer.token));
    assert(mine.status === 200, 'lecture réputation intacte');
  });

  /* ---------------------------------------------------------------- */
  /* 19 — Non-régression P0-MATCHING                                   */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 19 : non-régression P0-MATCHING — la qualification de mission fonctionne après le déclencheur', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-matching' });
    await harness.automationWorker?.runScheduledCycle();
    // Le contrat actif porte l\'offre ; l\'employeur qualifie la mission (règle existante).
    const offers = await q(harness, 'SELECT offer_id FROM contracts WHERE id=$1', [chain.contractId]);
    const offerId = String(firstRow(offers)?.offer_id);
    assert(offerId, 'offre du contrat');
    const answers = {
      serviceNature: 'AUTONOMOUS_DELIVERABLE',
      deliverableDescription: 'Livraison de 20 visuels de campagne finalisés.',
      acceptanceCriteria: '20 fichiers conformes au format et à la charte validés.',
      acceptanceCriteriaObjective: true,
      compensationBasis: 'RESULT_OR_SERVICE',
      providerChoosesMethods: true,
      providerOrganizesTime: true,
      mayServeOtherClients: true,
      mayDeclineWithoutPenalty: true,
      professionalRisk: true,
      disciplinaryPower: false,
      continuousShift: false,
      dailyHierarchicalOrders: false,
      permanentIntegratedPosition: false,
      exclusivityRequired: false,
      exclusivityJustified: null,
      timePlaceConstraint: 'NONE',
      candidateFacingConstraintSummary: '',
      formalities: {
        majorityCheckPlanned: true,
        professionalStatusRequirementsIdentified: true,
        professionalAuthorizationRequired: false,
        professionalAuthorizationCheckPlanned: null,
        taxInvoicingRequirementsIdentified: true,
        insuranceRequired: false,
        insuranceRequirementsIdentified: null,
      },
    };
    const response = await harness.worker.fetch(authRequest(`/api/v1/offers/${offerId}/qualification`, chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-matching-qual' },
      body: JSON.stringify({ answers }),
    }));
    assert(response.status === 200, `qualification soumise après cycle cron, reçu ${response.status}`);
    const saved = await response.json() as { decision: string };
    assert(saved.decision === 'ELIGIBLE_FOR_INDEPENDENT', 'décision de qualification existante inchangée');
  });

  /* ---------------------------------------------------------------- */
  /* 20 — Non-régression P0-REPLACEMENT                                */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 20 : non-régression P0-REPLACEMENT — la décision REPLACE fonctionne sur un contrat traité par le déclencheur', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-replacement' });
    await harness.automationWorker?.runScheduledCycle();
    const admin = await provisionAdmin(harness);
    const claimResponse = await harness.worker.fetch(authRequest('/api/v1/claims', chain.candidate.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-repl-claim' },
      body: JSON.stringify({ contractId: chain.contractId, type: 'CONTRACT_INCIDENT', reason: 'Incident nécessitant un remplacement durable.' }),
    }));
    const claim = await claimResponse.json() as { claimId: string };
    assert(claimResponse.status === 201, `claim incident, reçu ${claimResponse.status}`);
    const review = await harness.worker.fetch(authRequest(`/api/v1/admin/claims/${claim.claimId}/review`, admin.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-repl-review' },
      body: JSON.stringify({ note: 'Revue d\'un incident contractuel.' }),
    }));
    assert(review.status === 200, `revue ADMIN, reçu ${review.status}`);
    const decision = await harness.worker.fetch(authRequest(`/api/v1/admin/claims/${claim.claimId}/decision`, admin.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-repl-decision' },
      body: JSON.stringify({ decision: 'REPLACE', resolution: 'Le contrat initial est remplacé.' }),
    }));
    const decided = await decision.json() as { status: string; replacementId?: string };
    assert(decision.status === 200, `décision REPLACE, reçu ${decision.status}`);
    assert(decided.status === 'RESOLVED' && decided.replacementId, 'dossier de remplacement créé (workflow existant intact)');
  });

  /* ---------------------------------------------------------------- */
  /* 21 — Non-régression PAIEMENT / SALAIRE                            */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 21 : non-régression PAIEMENT/SALAIRE — la demande de confirmation de salaire fonctionne après le déclencheur', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-salary-nr' });
    await harness.automationWorker?.runScheduledCycle(); // M1/M2 → DUE
    const salary = firstRow((await paymentsRows(harness, chain.contractId)).filter(row => row.payment_type === 'SALARY' && Number(row.month_number) === 1));
    assert(salary?.status === 'DUE', 'salaire M1 DUE après balayage');
    // Le paiement externe arrive (fixture locale d\'état métier) : salaire M1 → PAID.
    await q(harness, `UPDATE payments SET status='PAID', submitted_at=now(), reference='CRON-NR', current_declaration_id='decl_cron_nr', declaration_count=1, verified_at=now() WHERE id=$1`, [salary.id]);
    const request = await harness.worker.fetch(authRequest(`/api/v1/payments/${salary.id}/salary-confirmation-request`, chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-salary-confirm-request' },
      body: JSON.stringify({}),
    }));
    assert(request.status === 200, `demande de confirmation de salaire, reçu ${request.status}`);
    const rows = await q(harness, 'SELECT * FROM salary_confirmations WHERE payment_id=$1', [salary.id]);
    assert(rows.length === 1, 'confirmation enregistrée (cycle P0-SALARY-1 intact)');
    const list = await harness.worker.fetch(authRequest('/api/v1/my/payments', chain.employer.token));
    assert(list.status === 200, 'consultation paiements intacte');
  });

  /* ---------------------------------------------------------------- */
  /* 22 — Non-régression NOTIFICATIONS                                 */
  /* ---------------------------------------------------------------- */
  await check('P0-CRON-QUEUE 22 : non-régression NOTIFICATIONS — lecture In-App et marquage lu fonctionnent après le déclencheur', async harness => {
    const chain = await activateContractThroughApi(harness, { keyPrefix: 'cron-notif-nr' });
    await harness.automationWorker?.runScheduledCycle();
    await harness.automationWorker?.runScheduledCycle(); // notifications consommées
    const list = await harness.worker.fetch(authRequest('/api/v1/my/notifications', chain.employer.token));
    assert(list.status === 200, `liste In-App, reçu ${list.status}`);
    const body = await list.json() as { items: Array<{ id: string; recipientId: string; readState: string }> };
    assert(body.items.length >= 1, `notifications présentes, reçu ${body.items.length}`);
    assert(body.items.every(entry => entry.readState === 'UNREAD'), 'état UNREAD initial');
    const target = body.items[0];
    const mark = await harness.worker.fetch(authRequest(`/api/v1/notifications/${target.id}/read`, chain.employer.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'cron-notif-read' },
      body: JSON.stringify({}),
    }));
    assert(mark.status === 200, `marquage lu, reçu ${mark.status}`);
    const row = firstRow(await q(harness, 'SELECT * FROM notifications WHERE id=$1', [target.id]));
    assert(row?.is_read === true, 'notification marquée READ');
  });

  return results;
}
