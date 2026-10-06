/** PostgreSQL adapters for the P0-AUTO-1 outbox, jobs, deadlines, idempotency and audit ledger. */
import type {
  AuditLedgerEntry,
  AuditLedgerStore,
  Deadline,
  DeadlineStatus,
  DeadlineStore,
  IdempotencyResult,
  IdempotencyStore,
  OutboxStatus,
  ScheduledJob,
  ScheduledJobStore,
} from './foundation';
import type { OutboxEvent, OutboxEventType, OutboxRepository, TransactionContext } from '../productionContracts';
import type { PostgreSqlDatabase, SqlQueryExecutor, SqlTransaction } from '../services/database';

const MAX_BATCH_SIZE = 500;
const CLAIM_LEASE_MS = 30_000;
const IDEMPOTENCY_LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;

function boundedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit <= 0) return 0;
  return Math.min(limit, MAX_BATCH_SIZE);
}

function timestamp(value: unknown, field: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  throw new Error(`Invalid PostgreSQL timestamp in ${field}.`);
}

function nullableTimestamp(value: unknown, field: string): string | undefined {
  return value === null || value === undefined ? undefined : timestamp(value, field);
}

function jsonObject(value: unknown, field: string): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid PostgreSQL JSON object in ${field}.`);
  }
  return parsed as Record<string, unknown>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
}

function sqlTransaction(transaction: TransactionContext): SqlTransaction {
  if (!transaction || typeof (transaction as SqlTransaction).query !== 'function') {
    throw new Error('A PostgreSQL transaction is required to append an Outbox event.');
  }
  return transaction as SqlTransaction;
}

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
  created_at: unknown;
  status: OutboxStatus;
  attempts: number;
  available_at: unknown;
  processed_at: unknown;
  last_error: string | null;
  dedupe_key: string;
}

function outboxEvent(row: OutboxRow): OutboxEvent {
  return {
    id: row.id,
    type: row.event_type as OutboxEventType,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: jsonObject(row.payload, 'automation_outbox.payload'),
    occurredAt: timestamp(row.created_at, 'automation_outbox.created_at'),
    dedupeKey: row.dedupe_key,
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    source: row.source,
    version: row.version,
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.causation_id ? { causationId: row.causation_id } : {}),
  };
}

function consistentOutbox(existing: OutboxEvent, candidate: OutboxEvent): boolean {
  return existing.type === candidate.type
    && existing.aggregateType === candidate.aggregateType
    && existing.aggregateId === candidate.aggregateId
    && stableJson(existing.payload) === stableJson(candidate.payload)
    && existing.dedupeKey === candidate.dedupeKey;
}

/** Implements the existing OutboxRepository port with the existing outbox table. */
export function createSqlOutboxRepository(database: PostgreSqlDatabase): OutboxRepository {
  return {
    async append(transaction, event) {
      const tx = sqlTransaction(transaction);
      const source = event.source ?? 'AutomationEngine';
      const version = event.version ?? 1;
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO automation_outbox (
           id, event_type, aggregate_type, aggregate_id, actor_id, payload, source,
           version, correlation_id, causation_id, created_at, status, attempts,
           available_at, dedupe_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11,
           'PENDING', 0, $11, $12
         )
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          event.id,
          event.type,
          event.aggregateType,
          event.aggregateId,
          event.actorId && event.actorId !== 'SYSTEM' ? event.actorId : event.actorId ?? null,
          JSON.stringify(event.payload),
          source,
          version,
          event.correlationId ?? null,
          event.causationId ?? null,
          event.occurredAt,
          event.dedupeKey,
        ],
      );
      if (inserted.rowCount > 0) return;

      const prior = await tx.query<OutboxRow>(
        'SELECT * FROM automation_outbox WHERE dedupe_key = $1 OR id = $2 LIMIT 1',
        [event.dedupeKey, event.id],
      );
      if (!prior.rows[0] || !consistentOutbox(outboxEvent(prior.rows[0]), event)) {
        throw new Error('Outbox idempotency key conflicts with a different event.');
      }
    },

    async claimBatch(limit, consumer) {
      const bounded = boundedLimit(limit);
      if (bounded === 0) return [];
      const now = new Date();
      const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
      return database.run(async tx => {
        const result = await tx.query<OutboxRow>(
          `WITH eligible AS (
             SELECT id
               FROM automation_outbox
              WHERE (
                status IN ('PENDING', 'RETRYABLE', 'PROCESSING')
                AND available_at <= $1
              )
              ORDER BY available_at, created_at, id
              FOR UPDATE SKIP LOCKED
              LIMIT $2
           )
           UPDATE automation_outbox AS outbox
              SET status = 'PROCESSING',
                  attempts = outbox.attempts + 1,
                  available_at = $3,
                  claimed_by = $4,
                  last_error = NULL
             FROM eligible
            WHERE outbox.id = eligible.id
           RETURNING outbox.*`,
          [now.toISOString(), bounded, leaseUntil.toISOString(), consumer],
        );
        return result.rows.map(outboxEvent);
      });
    },

    async markDelivered(eventId, consumer, deliveredAt) {
      await database.run(async tx => {
        const result = await tx.query(
          `UPDATE automation_outbox
              SET status = 'PROCESSED', processed_at = $3, available_at = $3,
                  claimed_by = NULL, last_error = NULL
            WHERE id = $1 AND claimed_by = $2 AND status = 'PROCESSING'`,
          [eventId, consumer, deliveredAt],
        );
        if (result.rowCount === 0) {
          const existing = await tx.query<{ status: string }>(
            'SELECT status FROM automation_outbox WHERE id = $1',
            [eventId],
          );
          if (existing.rows[0]?.status !== 'PROCESSED') {
            throw new Error('Outbox event claim was lost before acknowledgement.');
          }
        }
      });
    },

    async releaseForRetry(eventId, consumer, reasonCode) {
      await database.run(async tx => {
        await tx.query(
          `UPDATE automation_outbox
              SET status = CASE WHEN attempts >= $3 THEN 'DEAD_LETTER' ELSE 'RETRYABLE' END,
                  available_at = now() + make_interval(secs => LEAST(300, (5 * POWER(2, LEAST(attempts - 1, 6)))::integer)),
                  claimed_by = NULL,
                  last_error = $4
            WHERE id = $1 AND claimed_by = $2 AND status = 'PROCESSING'`,
          [eventId, consumer, MAX_ATTEMPTS, reasonCode.slice(0, 1000)],
        );
      });
    },
  };
}

interface JobRow {
  job_id: string;
  job_type: string;
  aggregate_type: string;
  aggregate_id: string;
  due_at: unknown;
  status: ScheduledJob['status'];
  attempts: number;
  idempotency_key: string;
  created_at: unknown;
  started_at: unknown;
  completed_at: unknown;
  last_error: string | null;
  payload: unknown;
  event_id: string | null;
  source: string;
  available_at: unknown;
  claimed_by: string | null;
}

function scheduledJob(row: JobRow): ScheduledJob {
  return {
    jobId: row.job_id,
    jobType: row.job_type,
    target: { aggregateType: row.aggregate_type, aggregateId: row.aggregate_id },
    dueAt: timestamp(row.due_at, 'automation_jobs.due_at'),
    status: row.status,
    attempts: row.attempts,
    idempotencyKey: row.idempotency_key,
    createdAt: timestamp(row.created_at, 'automation_jobs.created_at'),
    availableAt: timestamp(row.available_at, 'automation_jobs.available_at'),
    ...(nullableTimestamp(row.started_at, 'automation_jobs.started_at') ? { startedAt: timestamp(row.started_at, 'automation_jobs.started_at') } : {}),
    ...(nullableTimestamp(row.completed_at, 'automation_jobs.completed_at') ? { completedAt: timestamp(row.completed_at, 'automation_jobs.completed_at') } : {}),
    ...(row.claimed_by ? { claimedBy: row.claimed_by } : {}),
    ...(row.event_id ? { eventId: row.event_id } : {}),
    source: row.source,
    payload: jsonObject(row.payload, 'automation_jobs.payload'),
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}

function consistentJob(existing: ScheduledJob, candidate: ScheduledJob): boolean {
  return existing.jobType === candidate.jobType
    && existing.target.aggregateType === candidate.target.aggregateType
    && existing.target.aggregateId === candidate.target.aggregateId
    && existing.dueAt === new Date(candidate.dueAt).toISOString()
    && stableJson(existing.payload ?? {}) === stableJson(candidate.payload ?? {});
}

/** Adapter for the existing ScheduledJob type and automation_jobs table. */
export function createSqlScheduledJobStore(db: SqlQueryExecutor): ScheduledJobStore {
  const queryBy = async (column: 'job_id' | 'idempotency_key', value: string, lock = false): Promise<ScheduledJob | null> => {
    const result = await db.query<JobRow>(
      `SELECT * FROM automation_jobs WHERE ${column} = $1${lock ? ' FOR UPDATE' : ''}`,
      [value],
    );
    return result.rows[0] ? scheduledJob(result.rows[0]) : null;
  };

  return {
    async createIfAbsent(job) {
      const inserted = await db.query<JobRow>(
        `INSERT INTO automation_jobs (
           job_id, job_type, aggregate_type, aggregate_id, due_at, status, attempts,
           idempotency_key, created_at, started_at, completed_at, last_error,
           payload, event_id, source, available_at, claimed_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13::jsonb, $14, $15, $16, $17
         )
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        [
          job.jobId,
          job.jobType,
          job.target.aggregateType,
          job.target.aggregateId,
          job.dueAt,
          job.status,
          job.attempts,
          job.idempotencyKey,
          job.createdAt,
          job.startedAt ?? null,
          job.completedAt ?? null,
          job.lastError ?? null,
          JSON.stringify(job.payload ?? {}),
          job.eventId ?? null,
          job.source ?? 'AutomationEngine',
          job.availableAt ?? job.dueAt,
          job.claimedBy ?? null,
        ],
      );
      if (inserted.rows[0]) return scheduledJob(inserted.rows[0]);
      const existing = await queryBy('idempotency_key', job.idempotencyKey);
      if (!existing || !consistentJob(existing, job)) {
        throw new Error('ScheduledJob idempotency key conflicts with a different job.');
      }
      return existing;
    },

    findById(jobId) {
      return queryBy('job_id', jobId);
    },

    findByIdForUpdate(jobId) {
      return queryBy('job_id', jobId, true);
    },

    findByIdempotencyKey(key) {
      return queryBy('idempotency_key', key);
    },

    async claimDueBatch(limit, now, workerId) {
      const bounded = boundedLimit(limit);
      if (bounded === 0) return [];
      const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
      return isPostgresDatabase(db)
        ? db.run(async tx => {
            const result = await tx.query<JobRow>(
              `WITH eligible AS (
                 SELECT job_id
                   FROM automation_jobs
                  WHERE job_type IN ('SALARY_PAYMENT_DUE', 'COMMISSION_PAYMENT_DUE', 'PAYMENT_OVERDUE_REMINDER')
                    AND due_at <= $1
                    AND available_at <= $1
                    AND status IN ('PENDING', 'RETRYABLE', 'RUNNING')
                  ORDER BY due_at, job_id
                  FOR UPDATE SKIP LOCKED
                  LIMIT $2
               )
               UPDATE automation_jobs AS jobs
                  SET status = 'RUNNING', attempts = jobs.attempts + 1,
                      started_at = $1, available_at = $3, claimed_by = $4, last_error = NULL
                 FROM eligible
                WHERE jobs.job_id = eligible.job_id
               RETURNING jobs.*`,
              [now.toISOString(), bounded, leaseUntil.toISOString(), workerId],
            );
            return result.rows.map(scheduledJob);
          })
        : [];
    },

    async complete(jobId, workerId, completedAt) {
      const result = await db.query(
        `UPDATE automation_jobs
            SET status = 'COMPLETED', completed_at = $3, available_at = $3,
                claimed_by = NULL, last_error = NULL
          WHERE job_id = $1 AND claimed_by = $2 AND status = 'RUNNING'`,
        [jobId, workerId, completedAt],
      );
      if (result.rowCount !== 1) throw new Error('ScheduledJob claim was lost before completion.');
    },

    async retry(jobId, workerId, error, availableAt) {
      await db.query(
        `UPDATE automation_jobs
            SET status = CASE WHEN attempts >= $4 THEN 'FAILED' ELSE 'RETRYABLE' END,
                available_at = $3, claimed_by = NULL, last_error = $5
          WHERE job_id = $1 AND claimed_by = $2 AND status = 'RUNNING'`,
        [jobId, workerId, availableAt, MAX_ATTEMPTS, error.slice(0, 1000)],
      );
    },
  };
}

function isPostgresDatabase(value: SqlQueryExecutor): value is PostgreSqlDatabase {
  return typeof (value as PostgreSqlDatabase).run === 'function';
}

interface DeadlineRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  due_at: unknown;
  status: DeadlineStatus;
  sla: string | null;
  grace_period_ms: string | number | null;
  escalation: string | null;
  job_id: string | null;
  idempotency_key: string;
  event_id: string | null;
  payload: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function deadline(row: DeadlineRow): Deadline {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    dueAt: timestamp(row.due_at, 'automation_deadlines.due_at'),
    status: row.status,
    ...(row.sla ? { sla: row.sla } : {}),
    ...(row.grace_period_ms !== null ? { gracePeriodMs: Number(row.grace_period_ms) } : {}),
    ...(row.escalation ? { escalation: row.escalation } : {}),
    ...(row.job_id ? { jobId: row.job_id } : {}),
    idempotencyKey: row.idempotency_key,
    ...(row.event_id ? { eventId: row.event_id } : {}),
    createdAt: timestamp(row.created_at, 'automation_deadlines.created_at'),
    updatedAt: timestamp(row.updated_at, 'automation_deadlines.updated_at'),
    payload: jsonObject(row.payload, 'automation_deadlines.payload'),
  };
}

export function createSqlDeadlineStore(db: SqlQueryExecutor): DeadlineStore {
  return {
    async createIfAbsent(value) {
      if (!value.idempotencyKey) throw new Error('Deadline requires an idempotency key.');
      const createdAt = value.createdAt ?? new Date().toISOString();
      const updatedAt = value.updatedAt ?? createdAt;
      const inserted = await db.query<DeadlineRow>(
        `INSERT INTO automation_deadlines (
           id, aggregate_type, aggregate_id, due_at, status, sla, grace_period_ms,
           escalation, job_id, idempotency_key, event_id, payload, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14
         )
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        [
          value.id,
          value.aggregateType,
          value.aggregateId,
          value.dueAt,
          value.status,
          value.sla ?? null,
          value.gracePeriodMs ?? null,
          value.escalation ?? null,
          value.jobId ?? null,
          value.idempotencyKey,
          value.eventId ?? null,
          JSON.stringify(value.payload ?? {}),
          createdAt,
          updatedAt,
        ],
      );
      if (inserted.rows[0]) return deadline(inserted.rows[0]);
      const existing = await db.query<DeadlineRow>(
        'SELECT * FROM automation_deadlines WHERE idempotency_key = $1',
        [value.idempotencyKey],
      );
      if (!existing.rows[0]) throw new Error('Deadline idempotency record disappeared.');
      const current = deadline(existing.rows[0]);
      if (current.aggregateId !== value.aggregateId || current.dueAt !== new Date(value.dueAt).toISOString()) {
        throw new Error('Deadline idempotency key conflicts with a different deadline.');
      }
      return current;
    },

    async setStatus(idempotencyKey, status, updatedAt) {
      const updated = await db.query(
        `UPDATE automation_deadlines
            SET status = $2, updated_at = $3
          WHERE idempotency_key = $1`,
        [idempotencyKey, status, updatedAt],
      );
      if (updated.rowCount !== 1) throw new Error('Automation deadline was not found.');
    },
  };
}

export function createSqlAuditLedgerStore(db: SqlQueryExecutor): AuditLedgerStore {
  return {
    async append(entry: AuditLedgerEntry) {
      await db.query(
        `INSERT INTO automation_audit_ledger (
           id, event_id, actor_id, occurred_at, entity_id, action, before_state,
           after_state, source, reference, job_id, result, error
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          entry.id,
          entry.eventId ?? null,
          entry.actorId,
          entry.timestamp,
          entry.entityId,
          entry.action,
          entry.beforeState === undefined ? null : JSON.stringify(entry.beforeState),
          entry.afterState === undefined ? null : JSON.stringify(entry.afterState),
          entry.source,
          entry.reference ?? null,
          entry.jobId ?? null,
          entry.result === undefined ? null : JSON.stringify(entry.result),
          entry.error ?? null,
        ],
      );
    },
  };
}

interface IdempotencyRow {
  payload_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
  lease_expires_at: unknown;
}

function idempotencyResult(value: unknown): unknown {
  if (typeof value === 'string') return JSON.parse(value) as unknown;
  return value;
}

/** Durable, lease-recoverable implementation of the existing IdempotencyStore. */
export function createSqlIdempotencyStore(database: PostgreSqlDatabase): IdempotencyStore {
  return {
    async reserve({ actorId, command, key, payloadHash }): Promise<IdempotencyResult<unknown>> {
      return database.run(async tx => {
        const now = new Date();
        const leaseUntil = new Date(now.getTime() + IDEMPOTENCY_LEASE_MS);
        const inserted = await tx.query<{ idempotency_key: string }>(
          `INSERT INTO automation_idempotency (
             actor_id, command, idempotency_key, payload_hash, status, result,
             created_at, completed_at, lease_expires_at
           ) VALUES ($1, $2, $3, $4, 'PROCESSING', NULL, $5, NULL, $6)
           ON CONFLICT (actor_id, command, idempotency_key) DO NOTHING
           RETURNING idempotency_key`,
          [actorId, command, key, payloadHash, now.toISOString(), leaseUntil.toISOString()],
        );
        if (inserted.rowCount > 0) return { kind: 'reserved' };

        const found = await tx.query<IdempotencyRow>(
          `SELECT payload_hash, status, result, lease_expires_at
             FROM automation_idempotency
            WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3
            FOR UPDATE`,
          [actorId, command, key],
        );
        const record = found.rows[0];
        if (!record) throw new Error('Automation idempotency record disappeared during reservation.');
        if (record.payload_hash !== payloadHash) return { kind: 'conflict' };
        if (record.status === 'COMPLETED') {
          return { kind: 'replay', result: idempotencyResult(record.result) };
        }

        const expiresAt = record.lease_expires_at === null || record.lease_expires_at === undefined
          ? 0
          : new Date(record.lease_expires_at as string | Date).getTime();
        if (expiresAt <= now.getTime()) {
          const reclaimed = await tx.query(
            `UPDATE automation_idempotency
                SET lease_expires_at = $4
              WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3
                AND status = 'PROCESSING'
                AND (lease_expires_at IS NULL OR lease_expires_at <= $5)`,
            [actorId, command, key, leaseUntil.toISOString(), now.toISOString()],
          );
          return reclaimed.rowCount === 1 ? { kind: 'reserved' } : { kind: 'in-progress' };
        }
        return { kind: 'in-progress' };
      });
    },

    async complete(actorId, command, key, result) {
      const completed = await database.query(
        `UPDATE automation_idempotency
            SET status = 'COMPLETED', result = $4::jsonb, completed_at = now(), lease_expires_at = NULL
          WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3 AND status = 'PROCESSING'`,
        [actorId, command, key, JSON.stringify(result)],
      );
      if (completed.rowCount !== 1) throw new Error('Automation idempotency reservation was lost before completion.');
    },

    async release(actorId, command, key) {
      await database.query(
        `DELETE FROM automation_idempotency
          WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3 AND status = 'PROCESSING'`,
        [actorId, command, key],
      );
    },
  };
}

export interface PostgresAutomationStores {
  outbox: OutboxRepository;
  jobs: ScheduledJobStore;
  deadlines: DeadlineStore;
  audit: AuditLedgerStore;
  idempotency: IdempotencyStore;
}

export function createPostgresAutomationStores(database: PostgreSqlDatabase): PostgresAutomationStores {
  return {
    outbox: createSqlOutboxRepository(database),
    jobs: createSqlScheduledJobStore(database),
    deadlines: createSqlDeadlineStore(database),
    audit: createSqlAuditLedgerStore(database),
    idempotency: createSqlIdempotencyStore(database),
  };
}

export function toDomainEvent(event: OutboxEvent): import('./foundation').DomainEvent {
  return {
    eventId: event.id,
    eventType: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    timestamp: event.occurredAt,
    payload: event.payload,
    source: event.source ?? 'PostgreSQL outbox',
    version: event.version ?? 1,
    ...(event.actorId ? { actorId: event.actorId } : {}),
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    ...(event.causationId ? { causationId: event.causationId } : {}),
  };
}
