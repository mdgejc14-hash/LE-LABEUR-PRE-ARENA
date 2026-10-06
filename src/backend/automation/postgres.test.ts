import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

import { createApplicationRepository, applicationIdempotencyCache } from '../repositories/applicationRepository';
import { createSqlUserStore } from '../identity/sqlStores';
import { createSqlApplicationStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createPostgresDatabase } from '../persistence/postgresDatabase';
import type { PostgreSqlDatabase, SqlQueryExecutor } from '../services/database';
import type { ApplicationRepositoryStores } from '../repositories/applicationRepository';
import type { AuthenticatedActor, ProductionCommandContext } from '../productionContracts';
import type { OfferRecord } from '../persistence/coreRecords';
import {
  AutomationEngine,
  AutomationRegistry,
  ScheduledJobRegistry,
  createDomainEvent,
  type DomainEvent,
  type ScheduledJob,
} from './foundation';
import {
  createPostgresAuditLedgerRepository,
  createPostgresIdempotencyStore,
  createPostgresOutboxRepository,
  createPostgresQueue,
  createPostgresScheduledJobRepository,
} from './postgresRepositories';
import { createLocalAutomationRuntime } from './runtime';
import { AutomationWorker, ScheduledJobWorker } from './worker';
import { toPostgresClientPort, type DriverPoolLike, type DriverQueryResult } from '../persistence/sqlClient';

export interface AutomationPostgresTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

function makePGliteDriver(pg: PGlite): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<Row>> => {
    const result = await pg.query<Row>(sql, [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  };
  return {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

function makeOffer(id: string, employerId: string, timestamp: string): OfferRecord {
  return {
    id,
    employerId,
    title: `Automation test ${id}`,
    contractType: 'CDI',
    remuneration: 125_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: timestamp,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: [],
    summary: 'Fixture de vérification du runtime Automation.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function transactionStores(db: SqlQueryExecutor): ApplicationRepositoryStores {
  return {
    applications: createSqlApplicationStore(db),
    offers: createSqlOfferStore(db),
    users: createSqlUserStore(db),
  };
}

function actorContext(actor: AuthenticatedActor, key: string): ProductionCommandContext {
  return { actor, command: 'applications.create', idempotencyKey: key, requestId: `request:${key}` };
}

function makeTestEvent(eventId: string, eventType: 'APPLICATION_EXAMINED' | 'APPLICATION_SHORTLISTED', aggregateId: string): DomainEvent {
  return createDomainEvent({
    eventId,
    eventType,
    aggregateType: 'Application',
    aggregateId,
    actorId: 'SYSTEM',
    timestamp: '2026-10-06T00:00:00.000Z',
    payload: { applicationId: aggregateId, test: true },
    source: 'automation.postgres.test',
  });
}

/**
 * Shared suite used by npm test (PGlite) and verify:postgres (real PostgreSQL).
 * It includes the business transaction and the durable queue/worker path.
 */
export async function runAutomationPostgresIntegration(
  database: PostgreSqlDatabase,
  prefix = `auto-${Date.now()}`,
): Promise<AutomationPostgresTestResult[]> {
  const results: AutomationPostgresTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const timestamp = '2026-10-06T00:00:00.000Z';
  const candidateId = `usr_${prefix}_candidate`;
  const employerId = `usr_${prefix}_employer`;
  const offerId = `ofr_${prefix}_submit`;
  const rollbackOfferId = `ofr_${prefix}_rollback`;
  const candidate: AuthenticatedActor = {
    id: candidateId,
    role: 'CANDIDATE',
    permissions: [],
    sessionId: `session_${prefix}`,
  };
  const actorUsers = createSqlUserStore(database);
  const offerStore = createSqlOfferStore(database);
  const outbox = createPostgresOutboxRepository(database, { now: () => new Date(timestamp) });
  const applicationRepository = createApplicationRepository({
    stores: transactionStores(database),
    runInTransaction: operation => database.run(transaction => operation(transactionStores(transaction), transaction)),
    outbox,
    now: () => new Date(timestamp),
  });
  let applicationId = '';
  let mainEventId = '';
  const extraEventIds: string[] = [];
  const jobIds: string[] = [];
  const idempotencyKeys: string[] = [];
  let scheduledSideEffects = 0;
  let retryHandlerCalls = 0;
  let concurrentSideEffects = 0;

  try {
    await check('transaction fixtures: PostgreSQL candidate, employer, offer', async () => {
      await actorUsers.create({ id: candidateId, role: 'CANDIDATE', status: 'ACTIVE', email: `${prefix}.candidate@example.com`, displayName: 'Automation Candidate' });
      await actorUsers.create({ id: employerId, role: 'EMPLOYER', status: 'ACTIVE', email: `${prefix}.employer@example.com`, displayName: 'Automation Employer' });
      await offerStore.create(makeOffer(offerId, employerId, timestamp));
      await offerStore.create(makeOffer(rollbackOfferId, employerId, timestamp));
    });

    await check('commit: mutation APPLICATION_SUBMITTED + Outbox sont durables ensemble', async () => {
      applicationIdempotencyCache.clear();
      const created = await applicationRepository.applyToOffer(
        candidate,
        offerId,
        actorContext(candidate, `${prefix}:commit`),
        { note: 'Note métier inchangée.' },
      );
      applicationId = created.id;
      mainEventId = `${created.id}:APPLICATION_SUBMITTED`;
      assert.equal(created.status, 'PENDING');
      assert.equal(created.note, 'Note métier inchangée.');

      const business = await database.query<{ id: string; status: string; note: string | null }>(
        'SELECT id, status, note FROM applications WHERE id = $1', [created.id],
      );
      const event = await database.query<{ event_type: string; aggregate_id: string; actor_id: string; payload: unknown; status: string }>(
        'SELECT event_type, aggregate_id, actor_id, payload, status FROM automation_outbox WHERE id = $1', [mainEventId],
      );
      assert.equal(business.rows[0]?.status, 'PENDING');
      assert.equal(business.rows[0]?.note, 'Note métier inchangée.');
      assert.equal(event.rows[0]?.event_type, 'APPLICATION_SUBMITTED');
      assert.equal(event.rows[0]?.aggregate_id, created.id);
      assert.equal(event.rows[0]?.actor_id, candidateId);
      assert.equal(event.rows[0]?.status, 'PENDING');
      assert.equal((event.rows[0]?.payload as Record<string, unknown>).applicationId, created.id);
      assert.equal((await database.query('SELECT id FROM applications WHERE id = $1', [created.id])).rows.length, 1);
    });

    await check('rollback: aucune mutation métier ni Outbox ne survit', async () => {
      const rollbackRepository = createApplicationRepository({
        stores: transactionStores(database),
        outbox,
        now: () => new Date(timestamp),
        runInTransaction: operation => database.run(async transaction => {
          await operation(transactionStores(transaction), transaction);
          throw new Error('rollback volontaire après les deux INSERT');
        }),
      });
      let failed = false;
      try {
        await rollbackRepository.applyToOffer(
          candidate,
          rollbackOfferId,
          actorContext(candidate, `${prefix}:rollback`),
          { note: 'doit disparaître' },
        );
      } catch (error) {
        failed = String((error as Error).message).includes('rollback volontaire');
      }
      assert.equal(failed, true, 'l’erreur volontaire doit remonter');
      assert.equal((await database.query('SELECT id FROM applications WHERE offer_id = $1', [rollbackOfferId])).rows.length, 0);
      assert.equal((await database.query('SELECT id FROM automation_outbox WHERE aggregate_id IN (SELECT id FROM applications WHERE offer_id = $1)', [rollbackOfferId])).rows.length, 0);
      assert.equal((await database.query('SELECT id FROM automation_outbox WHERE dedupe_key LIKE $1', [`application:%:APPLICATION_SUBMITTED`])).rows.length >= 1, true, 'un event d’une autre mutation reste intact');
    });

    await check('Outbox: lecture, claim atomique et bail anti-double-claim', async () => {
      const row = await database.query<{ event_type: string; dedupe_key: string }>(
        'SELECT event_type, dedupe_key FROM automation_outbox WHERE id = $1', [mainEventId],
      );
      assert.equal(row.rows[0]?.event_type, 'APPLICATION_SUBMITTED');
      assert.equal(row.rows[0]?.dedupe_key, `application:${applicationId}:APPLICATION_SUBMITTED`);
      const claimantA = createPostgresOutboxRepository(database, { now: () => new Date(timestamp), claimLeaseMs: 60_000 });
      const claimantB = createPostgresOutboxRepository(database, { now: () => new Date(timestamp), claimLeaseMs: 60_000 });
      const [batchA, batchB] = await Promise.all([
        claimantA.claimBatch(1, `${prefix}:outbox-a`),
        claimantB.claimBatch(1, `${prefix}:outbox-b`),
      ]);
      const claimed = [...batchA, ...batchB].filter(event => event.id === mainEventId);
      assert.equal(claimed.length, 1, 'un event ne peut être claimé que par un seul worker');
      const owner = batchA.length ? `${prefix}:outbox-a` : `${prefix}:outbox-b`;
      await (batchA.length ? claimantA : claimantB).releaseForRetry(mainEventId, owner, 'test-release');
    });

    await check('Queue + Worker + Engine + handler: enqueue, execute, audit durable, acknowledge', async () => {
      const afterOutboxRetry = new Date(Date.parse(timestamp) + 1000);
      const runtime = createLocalAutomationRuntime(database, {
        workerId: `${prefix}:worker`,
        queueWorkerId: `${prefix}:queue`,
        now: () => afterOutboxRetry,
        claimLeaseMs: 60_000,
        retryBaseMs: 0,
        batchSize: 10,
      });
      const tick = await runtime.tick(afterOutboxRetry);
      assert.equal(tick.outbox.enqueued, 1, 'un événement Outbox doit être transféré vers Queue');
      assert.equal(tick.events.completed, 1, `un handler doit s’exécuter: ${JSON.stringify(tick)}; queue=${JSON.stringify((await database.query('SELECT status, attempts, available_at, last_error FROM automation_queue WHERE message_id = $1', [mainEventId])).rows)}; idem=${JSON.stringify((await database.query('SELECT status, result FROM automation_idempotency WHERE idempotency_key = $1', [mainEventId])).rows)}`);
      assert.equal(tick.jobs.claimed, 0);

      const queue = await database.query<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM automation_queue WHERE message_id = $1', [mainEventId],
      );
      assert.equal(queue.rows[0]?.status, 'ACKNOWLEDGED');
      assert.equal(queue.rows[0]?.attempts, 1);
      const storedEvent = await database.query<{ status: string; processed_at: unknown }>(
        'SELECT status, processed_at FROM automation_outbox WHERE id = $1', [mainEventId],
      );
      assert.equal(storedEvent.rows[0]?.status, 'PROCESSED');
      assert.ok(storedEvent.rows[0]?.processed_at);
      const audit = await runtime.auditLedger.findByEventId(mainEventId);
      assert.equal(audit.length, 1);
      assert.equal(audit[0]?.action, 'APPLICATION_SUBMITTED_AUTOMATION_HANDLED');
      assert.equal(audit[0]?.entityId, applicationId);
      const idempotency = await database.query<{ status: string; result: unknown }>(
        `SELECT status, result FROM automation_idempotency
          WHERE actor_id = 'SYSTEM' AND command = 'automation:APPLICATION_SUBMITTED' AND idempotency_key = $1`,
        [mainEventId],
      );
      assert.equal(idempotency.rows[0]?.status, 'COMPLETED');
      idempotencyKeys.push(mainEventId);

      const duplicate = createDomainEvent({
        eventId: mainEventId,
        eventType: 'APPLICATION_SUBMITTED',
        aggregateType: 'Application',
        aggregateId: applicationId,
        actorId: candidateId,
        timestamp,
        payload: { applicationId, offerId, candidateId, employerId },
        source: 'application.repository',
        version: 1,
        correlationId: `request:${prefix}:commit`,
      });
      assert.equal(await runtime.engine.execute(duplicate), 'duplicate', 'rejeu d’un event déjà terminé');
      await runtime.queue.enqueue(duplicate, new Date(timestamp), mainEventId);
      assert.equal((await database.query('SELECT message_id FROM automation_queue WHERE message_id = $1', [mainEventId])).rows.length, 1);
      assert.equal((await runtime.auditLedger.findByEventId(mainEventId)).length, 1, 'aucun second effet audit');

      let payloadConflict = false;
      try {
        await runtime.engine.execute({ ...duplicate, payload: { ...duplicate.payload, offerId: 'different-offer' } }, mainEventId);
      } catch (error) {
        payloadConflict = (error as Error).name === 'IdempotencyConflictError';
      }
      assert.equal(payloadConflict, true, 'même clé + payload différent doit être refusé');
    });

    await check('Queue: retry différé, nouvel attempt, acknowledge et message stable', async () => {
      const queue = createPostgresQueue<DomainEvent>(database, {
        workerId: `${prefix}:queue-retry`,
        now: () => new Date(timestamp),
        maxAttempts: 4,
        claimLeaseMs: 60_000,
      });
      const event = makeTestEvent(`${prefix}:queue-retry-event`, 'APPLICATION_EXAMINED', applicationId);
      extraEventIds.push(event.eventId);
      idempotencyKeys.push(event.eventId);
      const message = await queue.enqueue(event, new Date(timestamp), event.eventId);
      const same = await queue.enqueue(event, new Date(timestamp), event.eventId);
      assert.equal(same.id, message.id, 'enqueue répété ne crée pas une deuxième ligne');
      const claimed = await queue.claim(1, new Date(timestamp));
      assert.equal(claimed[0]?.attempts, 1);
      await queue.retry(message.id, 'transient failure', new Date(Date.parse(timestamp) + 1000));
      assert.equal((await queue.claim(1, new Date(Date.parse(timestamp) + 999))).length, 0, 'retry pas exécutable avant available_at');
      const retry = await queue.claim(1, new Date(Date.parse(timestamp) + 1000));
      assert.equal(retry.length, 1, `retry claim expected: ${JSON.stringify((await database.query('SELECT status, attempts, available_at, processing_owner, claim_expires_at FROM automation_queue WHERE message_id = $1', [message.id])).rows)}`);
      assert.equal(retry[0]?.attempts, 2);
      const beforeAck = await database.query<{ status: string; processing_owner: string | null }>('SELECT status, processing_owner FROM automation_queue WHERE message_id = $1', [message.id]);
      assert.equal(beforeAck.rows[0]?.status, 'PROCESSING');
      assert.equal(beforeAck.rows[0]?.processing_owner, `${prefix}:queue-retry`);
      await queue.acknowledge(message.id);
      const stored = await database.query<{ status: string; attempts: number; acknowledged_at: unknown }>(
        'SELECT status, attempts, acknowledged_at FROM automation_queue WHERE message_id = $1', [message.id],
      );
      assert.equal(stored.rows[0]?.status, 'ACKNOWLEDGED');
      assert.equal(stored.rows[0]?.attempts, 2);
      assert.ok(stored.rows[0]?.acknowledged_at);
    });

    await check('AutomationEngine: failure → retryable → successful handler, sans doublon', async () => {
      const queue = createPostgresQueue<DomainEvent>(database, {
        workerId: `${prefix}:handler-retry`,
        now: () => new Date(timestamp),
      });
      const event = makeTestEvent(`${prefix}:handler-retry-event`, 'APPLICATION_SHORTLISTED', applicationId);
      extraEventIds.push(event.eventId);
      idempotencyKeys.push(event.eventId);
      await queue.enqueue(event, new Date(timestamp), event.eventId);
      const audit = createPostgresAuditLedgerRepository(database);
      const registry = new AutomationRegistry();
      registry.register(event.eventType, async ({ event: handled }) => {
        retryHandlerCalls += 1;
        if (retryHandlerCalls === 1) throw new Error('handler temporary failure');
        await audit.append({
          id: `${prefix}:retry-effect`,
          eventId: handled.eventId,
          actorId: 'SYSTEM',
          timestamp: handled.timestamp,
          entityId: handled.aggregateId,
          action: 'AUTOMATION_RETRY_HANDLER_SUCCEEDED',
          afterState: { calls: retryHandlerCalls },
          source: 'automation.test',
        });
      });
      const engine = new AutomationEngine(registry, new Set(), createPostgresIdempotencyStore(database, { now: () => new Date(timestamp) }));
      const worker = new AutomationWorker(queue, engine, { maxAttempts: 4, retryBaseMs: 1000, now: () => new Date(timestamp) });
      const first = await worker.runBatch(1, new Date(timestamp));
      assert.equal(first.retried, 1);
      assert.equal((await database.query<{ status: string }>('SELECT status FROM automation_queue WHERE message_id = $1', [event.eventId])).rows[0]?.status, 'RETRYABLE');
      assert.equal((await worker.runBatch(1, new Date(Date.parse(timestamp) + 999))).claimed, 0);
      const second = await worker.runBatch(1, new Date(Date.parse(timestamp) + 1000));
      assert.equal(second.completed, 1);
      assert.equal(retryHandlerCalls, 2);
      assert.equal((await audit.findByEventId(event.eventId)).length, 1);
      assert.equal((await database.query<{ status: string }>('SELECT status FROM automation_queue WHERE message_id = $1', [event.eventId])).rows[0]?.status, 'ACKNOWLEDGED');
    });

    await check('Idempotence PostgreSQL: même clé replay, payload différent conflict, réservations concurrentes', async () => {
      const store = createPostgresIdempotencyStore(database, { now: () => new Date(timestamp) });
      const input = {
        actorId: `SYSTEM:${prefix}`,
        command: 'test.idempotency',
        key: `${prefix}:same-key`,
        payloadHash: 'a'.repeat(64),
        createdAt: timestamp,
      };
      idempotencyKeys.push(input.key);
      const reservations = await Promise.all([store.reserve(input), store.reserve(input)]);
      const reserved = reservations.filter(value => value.kind === 'reserved').length;
      assert.equal(reserved, 1, 'un seul worker réserve une clé en concurrence');
      assert.ok(reservations.some(value => value.kind === 'in-progress' || value.kind === 'replay'));
      await store.complete(input.actorId, input.command, input.key, { effectId: `${prefix}:once` });
      assert.deepEqual(await store.reserve(input), { kind: 'replay', result: { effectId: `${prefix}:once` } });
      assert.deepEqual(await store.reserve({ ...input, payloadHash: 'b'.repeat(64) }), { kind: 'conflict' });
    });

    await check('Deux workers PostgreSQL concurrents: claim exclusif et effet unique', async () => {
      const queueA = createPostgresQueue<DomainEvent>(database, { workerId: `${prefix}:concurrent-a`, now: () => new Date(timestamp) });
      const queueB = createPostgresQueue<DomainEvent>(database, { workerId: `${prefix}:concurrent-b`, now: () => new Date(timestamp) });
      const event = makeTestEvent(`${prefix}:concurrent-event`, 'APPLICATION_EXAMINED', applicationId);
      extraEventIds.push(event.eventId);
      idempotencyKeys.push(event.eventId);
      await queueA.enqueue(event, new Date(timestamp), event.eventId);
      const audit = createPostgresAuditLedgerRepository(database);
      const registry = new AutomationRegistry();
      registry.register(event.eventType, async ({ event: handled }) => {
        concurrentSideEffects += 1;
        await audit.append({
          id: `${prefix}:concurrent-effect`,
          eventId: handled.eventId,
          actorId: 'SYSTEM',
          timestamp: handled.timestamp,
          entityId: handled.aggregateId,
          action: 'AUTOMATION_CONCURRENT_HANDLER',
          afterState: { eventId: handled.eventId },
          source: 'automation.test',
        });
      });
      const store = createPostgresIdempotencyStore(database, { now: () => new Date(timestamp) });
      const engineA = new AutomationEngine(registry, new Set(), store);
      const engineB = new AutomationEngine(registry, new Set(), store);
      const workerA = new AutomationWorker(queueA, engineA, { now: () => new Date(timestamp) });
      const workerB = new AutomationWorker(queueB, engineB, { now: () => new Date(timestamp) });
      const [resultA, resultB] = await Promise.all([
        workerA.runBatch(1, new Date(timestamp)),
        workerB.runBatch(1, new Date(timestamp)),
      ]);
      assert.equal(resultA.claimed + resultB.claimed, 1, 'un seul worker claim le message');
      assert.equal(concurrentSideEffects, 1);
      assert.equal((await audit.findByEventId(event.eventId)).length, 1);
      assert.equal((await database.query<{ status: string }>('SELECT status FROM automation_queue WHERE message_id = $1', [event.eventId])).rows[0]?.status, 'ACKNOWLEDGED');
    });

    await check('ScheduledJob PostgreSQL: dueAt → claim → échec RETRYABLE → retry → COMPLETED', async () => {
      const jobs = createPostgresScheduledJobRepository(database);
      const jobId = `job_${prefix}_retry`;
      const key = `${prefix}:job-idempotency`;
      jobIds.push(jobId);
      idempotencyKeys.push(key);
      const job: ScheduledJob = {
        jobId,
        jobType: 'AUTOMATION_AUDIT_TEST',
        target: { aggregateType: 'Application', aggregateId: applicationId },
        dueAt: new Date(Date.parse(timestamp) + 10_000).toISOString(),
        status: 'PENDING',
        attempts: 0,
        idempotencyKey: key,
        createdAt: timestamp,
      };
      const created = await jobs.create(job);
      assert.equal(created.status, 'PENDING');
      assert.equal((await jobs.claimDue(1, `${prefix}:scheduled`, new Date(timestamp), 60_000)).length, 0, 'job futur non claimé');

      const registry = new ScheduledJobRegistry();
      scheduledSideEffects = 0;
      registry.register(job.jobType, async () => {
        scheduledSideEffects += 1;
        if (scheduledSideEffects === 1) throw new Error('scheduled handler temporary failure');
      });
      const worker = new ScheduledJobWorker(
        jobs,
        registry,
        createPostgresIdempotencyStore(database, { now: () => new Date(timestamp) }),
        { workerId: `${prefix}:scheduled`, maxAttempts: 4, claimLeaseMs: 60_000, retryBaseMs: 1000, now: () => new Date(timestamp) },
      );
      const dueAt = new Date(job.dueAt);
      const first = await worker.runBatch(1, dueAt);
      assert.equal(first.claimed, 1, `due job claim expected: ${JSON.stringify((await database.query('SELECT status, due_at, available_at, attempts FROM automation_jobs WHERE job_id = $1', [jobId])).rows)}; result=${JSON.stringify(first)}`);
      assert.equal(first.retryable, 1);
      const retryAt = new Date(dueAt.getTime() + 1000);
      assert.equal((await jobs.claimDue(1, `${prefix}:early`, new Date(retryAt.getTime() - 1), 60_000)).length, 0, 'retry pas dû avant availableAt');
      const second = await worker.runBatch(1, retryAt);
      assert.equal(second.completed, 1);
      assert.equal(scheduledSideEffects, 2, 'handler réessayé après l’échec initial');
      const stored = await database.query<{ status: string; attempts: number; completed_at: unknown }>(
        'SELECT status, attempts, completed_at FROM automation_jobs WHERE job_id = $1', [jobId],
      );
      assert.equal(stored.rows[0]?.status, 'COMPLETED');
      assert.equal(stored.rows[0]?.attempts, 2);
      assert.ok(stored.rows[0]?.completed_at);
      assert.equal((await jobs.create(job)).jobId, jobId, 'création répétée retrouve le job existant');
      assert.equal((await worker.runBatch(1, new Date(retryAt.getTime() + 60_000))).claimed, 0, 'job terminé non exécuté une seconde fois');
    });

    await check('Audit Ledger PostgreSQL: append idempotent et lecture par eventId', async () => {
      const ledger = createPostgresAuditLedgerRepository(database);
      const eventId = `${prefix}:audit-standalone`;
      extraEventIds.push(eventId);
      const entry = {
        id: `${prefix}:audit-entry`,
        eventId,
        actorId: 'SYSTEM' as const,
        timestamp,
        entityId: applicationId,
        action: 'AUTOMATION_AUDIT_TEST',
        afterState: { persisted: true },
        source: 'automation.test',
      };
      await ledger.append(entry);
      await ledger.append(entry);
      assert.equal((await ledger.findByEventId(eventId)).length, 1);
    });
  } finally {
    applicationIdempotencyCache.clear();
    const ids = [...new Set([mainEventId, ...extraEventIds].filter(Boolean))];
    const keys = [...new Set(idempotencyKeys.filter(Boolean))];
    for (const cleanup of [
      () => ids.length ? database.query('DELETE FROM automation_queue WHERE message_id = ANY($1::text[])', [ids]) : Promise.resolve(),
      () => ids.length ? database.query('DELETE FROM automation_outbox WHERE id = ANY($1::text[])', [ids]) : Promise.resolve(),
      () => applicationId ? database.query('DELETE FROM automation_outbox WHERE aggregate_id = $1', [applicationId]) : Promise.resolve(),
      () => ids.length ? database.query('DELETE FROM automation_audit_ledger WHERE event_id = ANY($1::text[])', [ids]) : Promise.resolve(),
      () => jobIds.length ? database.query('DELETE FROM automation_jobs WHERE job_id = ANY($1::text[])', [jobIds]) : Promise.resolve(),
      () => keys.length ? database.query('DELETE FROM automation_idempotency WHERE idempotency_key = ANY($1::text[])', [keys]) : Promise.resolve(),
      () => applicationId ? database.query('DELETE FROM applications WHERE id = $1', [applicationId]) : Promise.resolve(),
      () => database.query('DELETE FROM offers WHERE id = ANY($1::text[])', [[offerId, rollbackOfferId]]),
      () => database.query('DELETE FROM users WHERE id = ANY($1::text[])', [[candidateId, employerId]]),
    ]) {
      try { await cleanup(); } catch { /* Preserve the test result; the local DB is ephemeral. */ }
    }
  }

  return results;
}

/** Full SQL-backed suite for npm test. The real PostgreSQL version runs in verify:postgres. */
export async function runAutomationFoundationTests(): Promise<AutomationPostgresTestResult[]> {
  const pg = new PGlite();
  try {
    const files = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) await pg.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
    const database = createPostgresDatabase(toPostgresClientPort(makePGliteDriver(pg)));
    return await runAutomationPostgresIntegration(database, `pglite-${Date.now()}`);
  } finally {
    await pg.close();
  }
}
