import type { PostgreSqlDatabase } from '../services/database';
import type { DomainEvent } from './foundation';
import {
  AutomationEngine,
  AutomationRegistry,
  ScheduledJobRegistry,
} from './foundation';
import {
  createPostgresAuditLedgerRepository,
  createPostgresIdempotencyStore,
  createPostgresOutboxRepository,
  createPostgresQueue,
  createPostgresScheduledJobRepository,
  type PostgresAutomationRepositoryOptions,
} from './postgresRepositories';
import {
  AutomationWorker,
  ScheduledJobWorker,
  dispatchOutboxBatch,
  type AutomationWorkerResult,
  type OutboxDispatchResult,
  type ScheduledJobWorkerResult,
} from './worker';

export interface LocalAutomationRuntimeOptions extends PostgresAutomationRepositoryOptions {
  workerId?: string;
  queueWorkerId?: string;
  batchSize?: number;
  retryBaseMs?: number;
}

export interface LocalAutomationTickResult {
  outbox: OutboxDispatchResult;
  events: AutomationWorkerResult;
  jobs: ScheduledJobWorkerResult;
}

/**
 * Real, PostgreSQL-backed local automation wiring. This intentionally does not
 * install a Cloudflare Queue binding, cron trigger, or salary/payment handler.
 */
export function createLocalAutomationRuntime(
  database: PostgreSqlDatabase,
  options: LocalAutomationRuntimeOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const workerId = options.workerId ?? `automation-worker-${globalThis.crypto.randomUUID()}`;
  const queueWorkerId = options.queueWorkerId ?? workerId;
  const batchSize = options.batchSize ?? 20;
  const outboxRepository = createPostgresOutboxRepository(database, options);
  const queue = createPostgresQueue<DomainEvent>(database, {
    ...options,
    workerId: queueWorkerId,
  });
  const idempotency = createPostgresIdempotencyStore(database, options);
  const auditLedger = createPostgresAuditLedgerRepository(database);

  const eventRegistry = new AutomationRegistry();
  eventRegistry.register('APPLICATION_SUBMITTED', async ({ event }) => {
    if (event.aggregateType !== 'Application' || event.aggregateId !== event.payload.applicationId) {
      throw new Error('APPLICATION_SUBMITTED event does not match its Application aggregate.');
    }
    const offerId = event.payload.offerId;
    if (typeof offerId !== 'string' || !offerId) throw new Error('APPLICATION_SUBMITTED event has no offerId.');
    await auditLedger.append({
      id: `automation:${event.eventId}:application-submitted`,
      eventId: event.eventId,
      actorId: event.actorId ?? 'SYSTEM',
      timestamp: event.timestamp,
      entityId: event.aggregateId,
      action: 'APPLICATION_SUBMITTED_AUTOMATION_HANDLED',
      afterState: { applicationId: event.aggregateId, offerId },
      source: 'automation.worker',
      ...(event.correlationId ? { reference: event.correlationId } : {}),
    });
  });
  const engine = new AutomationEngine(eventRegistry, new Set(), idempotency);
  const eventWorker = new AutomationWorker(queue, engine, {
    maxAttempts: options.maxAttempts,
    retryBaseMs: options.retryBaseMs,
    now,
  });

  const jobRepository = createPostgresScheduledJobRepository(database, options);
  const jobRegistry = new ScheduledJobRegistry();
  jobRegistry.register('AUTOMATION_AUDIT', async job => {
    await auditLedger.append({
      id: `automation-job:${job.jobId}:handled`,
      eventId: job.jobId,
      actorId: 'SYSTEM',
      timestamp: job.createdAt,
      entityId: job.target.aggregateId,
      action: 'AUTOMATION_SCHEDULED_JOB_HANDLED',
      afterState: { jobId: job.jobId, jobType: job.jobType },
      source: 'automation.scheduled-worker',
      reference: job.idempotencyKey,
    });
  });
  const scheduledJobWorker = new ScheduledJobWorker(jobRepository, jobRegistry, idempotency, {
    workerId,
    maxAttempts: options.maxAttempts,
    claimLeaseMs: options.claimLeaseMs,
    retryBaseMs: options.retryBaseMs,
    now,
  });

  async function tick(tickTime = now()): Promise<LocalAutomationTickResult> {
    const outbox = await dispatchOutboxBatch({
      repository: outboxRepository,
      queue,
      consumerName: `${workerId}:outbox`,
      limit: batchSize,
      now: () => tickTime,
    });
    const events = await eventWorker.runBatch(batchSize, tickTime);
    const jobs = await scheduledJobWorker.runBatch(batchSize, tickTime);
    return { outbox, events, jobs };
  }

  return {
    outboxRepository,
    queue,
    idempotency,
    auditLedger,
    eventRegistry,
    engine,
    eventWorker,
    jobRepository,
    jobRegistry,
    scheduledJobWorker,
    tick,
  };
}
