import type {
  IdempotencyRecord,
  OutboxEvent,
  OutboxRepository,
  TransactionContext,
} from '../productionContracts';
import type { PostgreSqlDatabase, SqlQueryResult, SqlTransaction } from '../services/database';
import {
  hashCanonicalJson,
  type AuditLedgerEntry,
  type AuditLedgerRepository,
  type IdempotencyStore,
  type JobStatus,
  type Queue,
  type QueueMessage,
  type ScheduledJob,
  type ScheduledJobRepository,
} from './foundation';

interface OutboxRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id: string | null;
  payload: unknown;
  source: string;
  version: number;
  correlation_id: string | null;
  causation_id: string | null;
  dedupe_key: string;
  created_at: Date | string;
  status: string;
  attempts: number;
  available_at: Date | string;
  processed_at: Date | string | null;
  last_error: string | null;
}

export interface PostgresAutomationRepositoryOptions {
  now?: () => Date;
  claimLeaseMs?: number;
  idempotencyLeaseMs?: number;
  maxAttempts?: number;
}

export class AutomationLeaseLostError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} claim lease is no longer owned: ${id}`);
    this.name = 'AutomationLeaseLostError';
  }
}

export class AutomationRecordConflictError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} idempotency or identifier conflict: ${id}`);
    this.name = 'AutomationRecordConflictError';
  }
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid PostgreSQL timestamp in automation row.');
  return parsed.toISOString();
}

function parseJson<T>(value: unknown, label: string): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      // node-postgres decodes JSONB string scalars before returning the row.
      return value as T;
    }
  }
  if (value === null || (value && typeof value === 'object') || typeof value === 'number' || typeof value === 'boolean') {
    return value as T;
  }
  throw new Error(`Invalid JSON stored in ${label}.`);
}

function requireText(value: string, name: string, maxLength = 200): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`${name} must contain 1..${maxLength} characters.`);
  return normalized;
}

function requireLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Automation claim limit must be 1..1000.');
  return limit;
}

function requireDate(value: Date | string, name: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} is not a valid date.`);
  return date.toISOString();
}

function mapOutboxEvent(row: OutboxRow): OutboxEvent {
  return {
    id: row.id,
    type: row.event_type as OutboxEvent['type'],
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    actorId: row.actor_id ?? undefined,
    payload: parseJson<Record<string, unknown>>(row.payload, 'automation_outbox.payload'),
    occurredAt: requireDate(row.created_at, 'automation_outbox.created_at'),
    dedupeKey: row.dedupe_key,
    source: row.source,
    version: row.version,
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.causation_id ? { causationId: row.causation_id } : {}),
  };
}

function asTransaction(value: TransactionContext): SqlTransaction {
  if (!value || typeof (value as SqlTransaction).query !== 'function') {
    throw new Error('Outbox append requires the PostgreSQL transaction that contains the business mutation.');
  }
  return value as SqlTransaction;
}

function mapJob(row: ScheduledJobRow): ScheduledJob {
  return {
    jobId: row.job_id,
    jobType: row.job_type,
    target: { aggregateType: row.aggregate_type, aggregateId: row.aggregate_id },
    dueAt: requireDate(row.due_at, 'automation_jobs.due_at'),
    status: row.status as JobStatus,
    attempts: row.attempts,
    idempotencyKey: row.idempotency_key,
    createdAt: requireDate(row.created_at, 'automation_jobs.created_at'),
    ...(iso(row.started_at) ? { startedAt: iso(row.started_at) } : {}),
    ...(iso(row.completed_at) ? { completedAt: iso(row.completed_at) } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}

interface ScheduledJobRow {
  job_id: string;
  job_type: string;
  aggregate_type: string;
  aggregate_id: string;
  due_at: Date | string;
  status: string;
  attempts: number;
  idempotency_key: string;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  last_error: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
}

/** Transactional PostgreSQL outbox port backed by migration 0006 + 0007. */
export function createPostgresOutboxRepository(
  database: PostgreSqlDatabase,
  options: PostgresAutomationRepositoryOptions = {},
): OutboxRepository {
  const now = options.now ?? (() => new Date());
  const claimLeaseMs = options.claimLeaseMs ?? 60_000;
  const maxAttempts = options.maxAttempts ?? 8;

  return {
    async append(context, event) {
      const transaction = asTransaction(context);
      requireText(event.id, 'event.id');
      requireText(event.dedupeKey, 'event.dedupeKey');
      requireText(event.aggregateType, 'event.aggregateType');
      requireText(event.aggregateId, 'event.aggregateId');
      const occurredAt = requireDate(event.occurredAt, 'event.occurredAt');
      const source = requireText(event.source ?? 'automation.outbox', 'event.source');
      const version = event.version ?? 1;
      if (!Number.isInteger(version) || version < 1) throw new Error('event.version must be a positive integer.');

      let inserted: SqlQueryResult<{ id: string }>;
      try {
        inserted = await transaction.query<{ id: string }>(
          `INSERT INTO automation_outbox (
             id, event_type, aggregate_type, aggregate_id, actor_id, payload, source, version,
             correlation_id, causation_id, dedupe_key, created_at, status, attempts, available_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, 'PENDING', 0, $12
           )
           ON CONFLICT (dedupe_key) DO NOTHING
           RETURNING id`,
          [
            event.id,
            event.type,
            event.aggregateType,
            event.aggregateId,
            event.actorId ?? null,
            JSON.stringify(event.payload),
            source,
            version,
            event.correlationId ?? null,
            event.causationId ?? null,
            event.dedupeKey,
            occurredAt,
          ],
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw new AutomationRecordConflictError('outbox', event.dedupeKey);
      }
      if (inserted.rows.length > 0) return;

      const existing = await transaction.query<OutboxRow>(
        `SELECT * FROM automation_outbox WHERE dedupe_key = $1`,
        [event.dedupeKey],
      );
      const row = existing.rows[0];
      if (!row || row.id !== event.id || row.event_type !== event.type
        || row.aggregate_type !== event.aggregateType || row.aggregate_id !== event.aggregateId
        || row.actor_id !== (event.actorId ?? null) || row.source !== source || row.version !== version
        || row.correlation_id !== (event.correlationId ?? null) || row.causation_id !== (event.causationId ?? null)
        || requireDate(row.created_at, 'automation_outbox.created_at') !== occurredAt
        || await hashCanonicalJson(parseJson(row.payload, 'automation_outbox.payload')) !== await hashCanonicalJson(event.payload)) {
        throw new AutomationRecordConflictError('outbox', event.dedupeKey);
      }
    },

    async claimBatch(limit, consumer) {
      const bounded = requireLimit(limit);
      const owner = requireText(consumer, 'consumer');
      const currentTime = requireDate(now(), 'claim time');
      const expiresAt = requireDate(new Date(Date.parse(currentTime) + claimLeaseMs), 'claim lease');
      return database.run(async transaction => {
        await transaction.query(
          `UPDATE automation_outbox
              SET status = 'DEAD_LETTER', processing_owner = NULL, claim_expires_at = NULL,
                  last_error = COALESCE(last_error, 'claim lease expired after maximum attempts')
            WHERE status = 'PROCESSING' AND claim_expires_at <= $1 AND attempts >= $2`,
          [currentTime, maxAttempts],
        );
        const result = await transaction.query<OutboxRow>(
          `WITH due AS (
             SELECT id
               FROM automation_outbox
              WHERE (status IN ('PENDING', 'RETRYABLE') AND available_at <= $1)
                 OR (status = 'PROCESSING' AND claim_expires_at <= $1)
              ORDER BY available_at ASC, created_at ASC, id ASC
              LIMIT $2
              FOR UPDATE SKIP LOCKED
           )
           UPDATE automation_outbox AS outbox
              SET status = 'PROCESSING',
                  attempts = outbox.attempts + 1,
                  processing_owner = $3,
                  claim_expires_at = $4
             FROM due
            WHERE outbox.id = due.id
           RETURNING outbox.*`,
          [currentTime, bounded, owner, expiresAt],
        );
        return result.rows.map(mapOutboxEvent);
      });
    },

    async markDelivered(eventId, consumer, deliveredAt) {
      const owner = requireText(consumer, 'consumer');
      const timestamp = requireDate(deliveredAt, 'deliveredAt');
      const result = await database.query<{ id: string }>(
        `UPDATE automation_outbox
            SET status = 'PROCESSED', processed_at = $3,
                processing_owner = NULL, claim_expires_at = NULL, last_error = NULL
          WHERE id = $1 AND status = 'PROCESSING' AND processing_owner = $2
          RETURNING id`,
        [eventId, owner, timestamp],
      );
      if (result.rows.length > 0) return;
      const current = await database.query<{ status: string }>('SELECT status FROM automation_outbox WHERE id = $1', [eventId]);
      if (current.rows[0]?.status === 'PROCESSED') return;
      throw new AutomationLeaseLostError('outbox', eventId);
    },

    async releaseForRetry(eventId, consumer, reasonCode) {
      const owner = requireText(consumer, 'consumer');
      const reason = requireText(reasonCode, 'reasonCode', 2000);
      const currentTime = now();
      const result = await database.run(async transaction => {
        const selected = await transaction.query<{ attempts: number }>(
          `SELECT attempts FROM automation_outbox
            WHERE id = $1 AND status = 'PROCESSING' AND processing_owner = $2
            FOR UPDATE`,
          [eventId, owner],
        );
        const attempts = selected.rows[0]?.attempts;
        if (attempts === undefined) return null;
        const status = attempts >= maxAttempts ? 'DEAD_LETTER' : 'RETRYABLE';
        const delayMs = Math.min(5 * 60_000, 1000 * 2 ** Math.min(16, attempts - 1));
        const retryAt = new Date(currentTime.getTime() + delayMs);
        await transaction.query(
          `UPDATE automation_outbox
              SET status = $3,
                  available_at = $4,
                  processing_owner = NULL,
                  claim_expires_at = NULL,
                  last_error = $5
            WHERE id = $1 AND status = 'PROCESSING' AND processing_owner = $2`,
          [eventId, owner, status, retryAt.toISOString(), reason],
        );
        return status;
      });
      if (!result) throw new AutomationLeaseLostError('outbox', eventId);
    },
  };
}

export interface PostgresQueueOptions extends PostgresAutomationRepositoryOptions {
  workerId?: string;
}

interface QueueRow<T> {
  message_id: string;
  body: T | string;
  status: string;
  attempts: number;
  available_at: Date | string;
}

function decodeQueueBody<T>(value: T | string): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value;
}

function mapQueueMessage<T>(row: QueueRow<T>): QueueMessage<T> {
  return {
    id: row.message_id,
    body: decodeQueueBody(row.body),
    attempts: row.attempts,
    availableAt: requireDate(row.available_at, 'automation_queue.available_at'),
  };
}

/** Durable local queue. Each instance claims under its own workerId/lease. */
export function createPostgresQueue<T>(
  database: PostgreSqlDatabase,
  options: PostgresQueueOptions = {},
): Queue<T> {
  const now = options.now ?? (() => new Date());
  const workerId = requireText(options.workerId ?? `automation-${globalThis.crypto.randomUUID()}`, 'workerId');
  const claimLeaseMs = options.claimLeaseMs ?? 60_000;
  const maxAttempts = options.maxAttempts ?? 8;

  return {
    async enqueue(body, availableAt = now(), id = globalThis.crypto.randomUUID()) {
      const messageId = requireText(id, 'messageId');
      const readyAt = requireDate(availableAt, 'availableAt');
      const bodyJson = JSON.stringify(body);
      if (bodyJson === undefined) throw new Error('Queue message body must be JSON serializable.');
      const inserted = await database.query<QueueRow<T>>(
        `INSERT INTO automation_queue (message_id, body, status, attempts, available_at)
         VALUES ($1, $2::jsonb, 'PENDING', 0, $3)
         ON CONFLICT (message_id) DO NOTHING
         RETURNING message_id, body, status, attempts, available_at`,
        [messageId, bodyJson, readyAt],
      );
      if (inserted.rows[0]) return mapQueueMessage(inserted.rows[0]);

      const existing = await database.query<QueueRow<T>>(
        `SELECT message_id, body, status, attempts, available_at
           FROM automation_queue WHERE message_id = $1`,
        [messageId],
      );
      const row = existing.rows[0];
      if (!row) throw new Error(`Queue insert conflict without existing message: ${messageId}`);
      if (await hashCanonicalJson(decodeQueueBody(row.body)) !== await hashCanonicalJson(body)) {
        throw new AutomationRecordConflictError('queue', messageId);
      }
      return mapQueueMessage(row);
    },

    async claim(limit, requestedNow = now()) {
      const bounded = requireLimit(limit);
      const currentTime = requireDate(requestedNow, 'claim time');
      const leaseUntil = requireDate(new Date(Date.parse(currentTime) + claimLeaseMs), 'claim lease');
      return database.run(async transaction => {
        await transaction.query(
          `UPDATE automation_queue
              SET status = 'DEAD_LETTER', processing_owner = NULL, claim_expires_at = NULL,
                  last_error = COALESCE(last_error, 'claim lease expired after maximum attempts')
            WHERE status = 'PROCESSING' AND claim_expires_at <= $1 AND attempts >= $2`,
          [currentTime, maxAttempts],
        );
        const result = await transaction.query<QueueRow<T>>(
          `WITH due AS (
             SELECT message_id
               FROM automation_queue
              WHERE ((status IN ('PENDING', 'RETRYABLE') AND available_at <= $1)
                 OR (status = 'PROCESSING' AND claim_expires_at <= $1))
              ORDER BY available_at ASC, created_at ASC, message_id ASC
              LIMIT $2
              FOR UPDATE SKIP LOCKED
           )
           UPDATE automation_queue AS queue
              SET status = 'PROCESSING',
                  attempts = queue.attempts + 1,
                  processing_owner = $3,
                  claim_expires_at = $4
             FROM due
            WHERE queue.message_id = due.message_id
           RETURNING queue.message_id, queue.body, queue.status, queue.attempts, queue.available_at`,
          [currentTime, bounded, workerId, leaseUntil],
        );
        return result.rows.map(mapQueueMessage);
      });
    },

    async acknowledge(id) {
      const result = await database.query<{ message_id: string }>(
        `UPDATE automation_queue
            SET status = 'ACKNOWLEDGED', acknowledged_at = $3,
                processing_owner = NULL, claim_expires_at = NULL, last_error = NULL
          WHERE message_id = $1 AND status = 'PROCESSING' AND processing_owner = $2
          RETURNING message_id`,
        [id, workerId, requireDate(now(), 'acknowledgedAt')],
      );
      if (result.rows.length > 0) return;
      const current = await database.query<{ status: string }>('SELECT status FROM automation_queue WHERE message_id = $1', [id]);
      if (current.rows[0]?.status === 'ACKNOWLEDGED') return;
      throw new AutomationLeaseLostError('queue', id);
    },

    async retry(id, error, availableAt) {
      const result = await database.query<{ status: string }>(
        `UPDATE automation_queue
            SET status = CASE WHEN attempts >= $4 THEN 'DEAD_LETTER' ELSE 'RETRYABLE' END,
                available_at = $3,
                processing_owner = NULL,
                claim_expires_at = NULL,
                last_error = $5
          WHERE message_id = $1 AND status = 'PROCESSING' AND processing_owner = $2
          RETURNING status`,
        [id, workerId, requireDate(availableAt, 'retryAt'), maxAttempts, String(error).slice(0, 2000)],
      );
      if (result.rows.length > 0) return;
      const current = await database.query<{ status: string }>('SELECT status FROM automation_queue WHERE message_id = $1', [id]);
      if (current.rows[0]?.status === 'DEAD_LETTER') return;
      throw new AutomationLeaseLostError('queue', id);
    },

    async deadLetter(id, error) {
      const result = await database.query<{ message_id: string }>(
        `UPDATE automation_queue
            SET status = 'DEAD_LETTER', processing_owner = NULL, claim_expires_at = NULL,
                last_error = $3
          WHERE message_id = $1 AND status = 'PROCESSING' AND processing_owner = $2
          RETURNING message_id`,
        [id, workerId, String(error).slice(0, 2000)],
      );
      if (result.rows.length > 0) return;
      const current = await database.query<{ status: string }>('SELECT status FROM automation_queue WHERE message_id = $1', [id]);
      if (current.rows[0]?.status === 'DEAD_LETTER') return;
      throw new AutomationLeaseLostError('queue', id);
    },
  };
}

/** Durable ScheduledJob repository with SKIP LOCKED claims and retry state. */
export function createPostgresScheduledJobRepository(
  database: PostgreSqlDatabase,
  options: PostgresAutomationRepositoryOptions = {},
): ScheduledJobRepository {
  const maxAttempts = options.maxAttempts ?? 8;
  return {
    async create(job) {
      if (job.status !== 'PENDING' || job.attempts !== 0) throw new Error('New scheduled jobs must start PENDING with zero attempts.');
      const jobId = requireText(job.jobId, 'jobId');
      const jobType = requireText(job.jobType, 'jobType');
      const aggregateType = requireText(job.target.aggregateType, 'target.aggregateType');
      const aggregateId = requireText(job.target.aggregateId, 'target.aggregateId');
      const idempotencyKey = requireText(job.idempotencyKey, 'idempotencyKey');
      const dueAt = requireDate(job.dueAt, 'dueAt');
      const createdAt = requireDate(job.createdAt, 'createdAt');
      try {
        await database.query(
          `INSERT INTO automation_jobs (
             job_id, job_type, aggregate_type, aggregate_id, due_at, status, attempts,
             idempotency_key, created_at, available_at
           ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, $6, $7, $5)
           ON CONFLICT DO NOTHING`,
          [jobId, jobType, aggregateType, aggregateId, dueAt, idempotencyKey, createdAt],
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw new AutomationRecordConflictError('scheduled-job', idempotencyKey);
      }
      const existing = await database.query<ScheduledJobRow>(
        `SELECT * FROM automation_jobs WHERE job_id = $1 OR idempotency_key = $2
         ORDER BY CASE WHEN job_id = $1 THEN 0 ELSE 1 END LIMIT 1`,
        [jobId, idempotencyKey],
      );
      const row = existing.rows[0];
      if (!row) throw new Error(`Scheduled job insert conflict without existing job: ${jobId}`);
      if (row.job_type !== jobType || row.aggregate_type !== aggregateType || row.aggregate_id !== aggregateId
        || requireDate(row.due_at, 'automation_jobs.due_at') !== dueAt
        || row.idempotency_key !== idempotencyKey) {
        throw new AutomationRecordConflictError('scheduled-job', idempotencyKey);
      }
      return mapJob(row);
    },

    async claimDue(limit, worker, requestedNow, leaseDurationMs) {
      const bounded = requireLimit(limit);
      const owner = requireText(worker, 'worker');
      const currentTime = requireDate(requestedNow, 'claim time');
      if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 100) throw new Error('Job lease must be at least 100ms.');
      const leaseUntil = requireDate(new Date(Date.parse(currentTime) + leaseDurationMs), 'job lease');
      return database.run(async transaction => {
        await transaction.query(
          `UPDATE automation_jobs
              SET status = 'FAILED', processing_owner = NULL, claim_expires_at = NULL,
                  last_error = COALESCE(last_error, 'claim lease expired after maximum attempts')
            WHERE status = 'RUNNING' AND claim_expires_at <= $1 AND attempts >= $2`,
          [currentTime, maxAttempts],
        );
        const result = await transaction.query<ScheduledJobRow>(
          `WITH due AS (
             SELECT job_id
               FROM automation_jobs
              WHERE (status IN ('PENDING', 'RETRYABLE') AND due_at <= $1 AND available_at <= $1)
                 OR (status = 'RUNNING' AND claim_expires_at <= $1)
              ORDER BY available_at ASC, due_at ASC, created_at ASC, job_id ASC
              LIMIT $2
              FOR UPDATE SKIP LOCKED
           )
           UPDATE automation_jobs AS job
              SET status = 'RUNNING',
                  attempts = job.attempts + 1,
                  started_at = $1,
                  processing_owner = $3,
                  claim_expires_at = $4
             FROM due
            WHERE job.job_id = due.job_id
           RETURNING job.*`,
          [currentTime, bounded, owner, leaseUntil],
        );
        return result.rows.map(mapJob);
      });
    },

    async complete(jobId, worker, completedAt) {
      const owner = requireText(worker, 'worker');
      const result = await database.query<{ job_id: string }>(
        `UPDATE automation_jobs
            SET status = 'COMPLETED', completed_at = $3,
                processing_owner = NULL, claim_expires_at = NULL, last_error = NULL
          WHERE job_id = $1 AND status = 'RUNNING' AND processing_owner = $2
          RETURNING job_id`,
        [jobId, owner, requireDate(completedAt, 'completedAt')],
      );
      if (result.rows.length > 0) return;
      const current = await database.query<{ status: string }>('SELECT status FROM automation_jobs WHERE job_id = $1', [jobId]);
      if (current.rows[0]?.status === 'COMPLETED') return;
      throw new AutomationLeaseLostError('scheduled-job', jobId);
    },

    async retry(jobId, worker, error, availableAt, maxAttempts) {
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('maxAttempts must be positive.');
      const result = await database.query<{ status: JobStatus }>(
        `UPDATE automation_jobs
            SET status = CASE WHEN attempts >= $5 THEN 'FAILED' ELSE 'RETRYABLE' END,
                available_at = $4,
                last_error = $3,
                processing_owner = NULL,
                claim_expires_at = NULL
          WHERE job_id = $1 AND status = 'RUNNING' AND processing_owner = $2
          RETURNING status`,
        [jobId, requireText(worker, 'worker'), String(error).slice(0, 2000), requireDate(availableAt, 'availableAt'), maxAttempts],
      );
      if (result.rows[0]) return result.rows[0].status;
      const current = await database.query<{ status: JobStatus }>('SELECT status FROM automation_jobs WHERE job_id = $1', [jobId]);
      if (current.rows[0]?.status === 'FAILED' || current.rows[0]?.status === 'RETRYABLE') return current.rows[0].status;
      throw new AutomationLeaseLostError('scheduled-job', jobId);
    },
  };
}

/** PostgreSQL adapter for the production IdempotencyStore port. */
export function createPostgresIdempotencyStore(
  database: PostgreSqlDatabase,
  options: PostgresAutomationRepositoryOptions = {},
): IdempotencyStore {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.idempotencyLeaseMs ?? 15 * 60_000;

  return {
    async reserve<TResult>(input: Omit<IdempotencyRecord<TResult>, 'status' | 'result' | 'completedAt'>) {
      const actorId = requireText(input.actorId, 'actorId');
      const command = requireText(input.command, 'command');
      const key = requireText(input.key, 'idempotency key');
      const hash = requireText(input.payloadHash, 'payloadHash', 256);
      const createdAt = requireDate(input.createdAt, 'createdAt');
      const expiresAt = input.expiresAt ? requireDate(input.expiresAt, 'expiresAt') : null;
      const reservationTime = requireDate(now(), 'reservation time');
      const leaseUntil = requireDate(new Date(Date.parse(reservationTime) + leaseMs), 'idempotency lease');
      const inserted = await database.query<{ actor_id: string }>(
        `INSERT INTO automation_idempotency (
           actor_id, command, idempotency_key, payload_hash, status,
           created_at, expires_at, lease_expires_at
         ) VALUES ($1, $2, $3, $4, 'PROCESSING', $5, $6, $7)
         ON CONFLICT (actor_id, command, idempotency_key) DO NOTHING
         RETURNING actor_id`,
        [actorId, command, key, hash, createdAt, expiresAt, leaseUntil],
      );
      if (inserted.rows.length > 0) return { kind: 'reserved' as const };

      const takeover = await database.query<{ actor_id: string }>(
        `UPDATE automation_idempotency
            SET lease_expires_at = $5
          WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3
            AND payload_hash = $4 AND status = 'PROCESSING'
            AND lease_expires_at <= $6
          RETURNING actor_id`,
        [actorId, command, key, hash, leaseUntil, reservationTime],
      );
      if (takeover.rows.length > 0) return { kind: 'reserved' as const };

      const existing = await database.query<{ payload_hash: string; status: string; result: unknown }>(
        `SELECT payload_hash, status, result FROM automation_idempotency
          WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3`,
        [actorId, command, key],
      );
      const row = existing.rows[0];
      if (!row) throw new Error('Idempotency reservation disappeared during claim.');
      if (row.payload_hash !== hash) return { kind: 'conflict' as const };
      if (row.status === 'COMPLETED') {
        return { kind: 'replay' as const, result: parseJson<TResult>(row.result, 'automation_idempotency.result') };
      }
      return { kind: 'in-progress' as const };
    },

    async complete<TResult>(actorId: string, command: string, key: string, result: TResult) {
      const completedAt = requireDate(now(), 'completedAt');
      const encoded = JSON.stringify(result);
      if (encoded === undefined) throw new Error('Idempotency result must be JSON serializable.');
      const updated = await database.query<{ actor_id: string }>(
        `UPDATE automation_idempotency
            SET status = 'COMPLETED', result = $4::jsonb, completed_at = $5, lease_expires_at = NULL
          WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3 AND status = 'PROCESSING'
          RETURNING actor_id`,
        [actorId, command, key, encoded, completedAt],
      );
      if (updated.rows.length > 0) return;
      const current = await database.query<{ status: string }>(
        `SELECT status FROM automation_idempotency WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3`,
        [actorId, command, key],
      );
      if (current.rows[0]?.status === 'COMPLETED') return;
      throw new Error(`No processing idempotency reservation to complete: ${command}:${key}`);
    },

    async release(actorId, command, key) {
      await database.query(
        `UPDATE automation_idempotency SET lease_expires_at = $4
          WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3 AND status = 'PROCESSING'`,
        [actorId, command, key, requireDate(now(), 'releasedAt')],
      );
    },
  };
}

interface AuditRow {
  id: string;
  event_id: string | null;
  actor_id: string;
  occurred_at: Date | string;
  entity_id: string;
  action: string;
  before_state: unknown;
  after_state: unknown;
  source: string;
  reference: string | null;
}

function mapAudit(row: AuditRow): AuditLedgerEntry {
  return {
    id: row.id,
    ...(row.event_id ? { eventId: row.event_id } : {}),
    actorId: row.actor_id,
    timestamp: requireDate(row.occurred_at, 'automation_audit_ledger.occurred_at'),
    entityId: row.entity_id,
    action: row.action,
    ...(row.before_state !== null ? { beforeState: parseJson<Record<string, unknown>>(row.before_state, 'automation_audit_ledger.before_state') } : {}),
    ...(row.after_state !== null ? { afterState: parseJson<Record<string, unknown>>(row.after_state, 'automation_audit_ledger.after_state') } : {}),
    source: row.source,
    ...(row.reference ? { reference: row.reference } : {}),
  };
}

/** Persisted audit ledger; (event_id, action) is its replay-safe effect key. */
export function createPostgresAuditLedgerRepository(database: PostgreSqlDatabase): AuditLedgerRepository {
  return {
    async append(entry) {
      const encodedBefore = entry.beforeState === undefined ? null : JSON.stringify(entry.beforeState);
      const encodedAfter = entry.afterState === undefined ? null : JSON.stringify(entry.afterState);
      try {
        const inserted = await database.query<{ id: string }>(
          `INSERT INTO automation_audit_ledger (
             id, event_id, actor_id, occurred_at, entity_id, action,
             before_state, after_state, source, reference
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
           ON CONFLICT (event_id, action) DO NOTHING
           RETURNING id`,
          [entry.id, entry.eventId ?? null, entry.actorId, requireDate(entry.timestamp, 'audit timestamp'),
            entry.entityId, entry.action, encodedBefore, encodedAfter, entry.source, entry.reference ?? null],
        );
        if (inserted.rows.length > 0) return;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }

      const existing = entry.eventId
        ? await database.query<AuditRow>(
            'SELECT * FROM automation_audit_ledger WHERE event_id = $1 AND action = $2',
            [entry.eventId, entry.action],
          )
        : await database.query<AuditRow>('SELECT * FROM automation_audit_ledger WHERE id = $1', [entry.id]);
      const row = existing.rows[0];
      if (!row) throw new AutomationRecordConflictError('audit-ledger', entry.id);
      const current = mapAudit(row);
      const statesMatch = await hashCanonicalJson({ before: current.beforeState ?? null, after: current.afterState ?? null })
        === await hashCanonicalJson({ before: entry.beforeState ?? null, after: entry.afterState ?? null });
      const same = current.id === entry.id && current.actorId === entry.actorId
        && current.entityId === entry.entityId && current.action === entry.action
        && current.timestamp === requireDate(entry.timestamp, 'audit timestamp')
        && current.source === entry.source && current.reference === entry.reference
        && statesMatch;
      if (!same) throw new AutomationRecordConflictError('audit-ledger', entry.eventId ?? entry.id);
    },

    async findByEventId(eventId) {
      const result = await database.query<AuditRow>(
        'SELECT * FROM automation_audit_ledger WHERE event_id = $1 ORDER BY occurred_at ASC, id ASC',
        [eventId],
      );
      return result.rows.map(mapAudit);
    },
  };
}
