/**
 * LE LABEUR — P0-AUTO-2 — adaptateurs PostgreSQL de l'automatisation.
 *
 * Implémente les ports de `src/backend/automation/records.ts` au-dessus des
 * tables créées par `migrations/0006_automation_foundation.sql` (outbox, jobs,
 * idempotence, ledger) et `migrations/0007_contract_automation.sql` (deadlines,
 * unicité de `automation_jobs.idempotency_key`).
 *
 * Règles, identiques à celles de `sqlCoreStores.ts` :
 *  - requêtes exclusivement paramétrées ($1..$n) : aucune valeur interpolée ;
 *  - JSONB lu en tolérant les pilotes qui renvoient du texte ;
 *  - les écritures concurrentes sont tranchées par PostgreSQL (clés primaires,
 *    index d'unicité, `FOR UPDATE SKIP LOCKED`, compare-and-set) : AUCUN second
 *    framework de concurrence n'est ajouté côté applicatif ;
 *  - aucune donnée n'est inventée : un rejeu renvoie `duplicate`, jamais une
 *    seconde ligne.
 */

import type { ContractRecord, ContractHistoryEntry } from './coreRecords';
import { createSqlContractStore } from './sqlCoreStores';
import { postgresErrorCode } from './sqlClient';
import type { SqlQueryExecutor, SqlQueryResult } from '../services/database';
import type {
  AuditLedgerEntry,
  DeadlineStatus,
  DomainEvent,
  DomainEventType,
  IdempotencyResult,
  JobStatus,
  OutboxStatus,
  PersistedOutboxEvent,
  ScheduledJob,
} from '../automation/foundation';
import type {
  AutomationDeadline,
  AutomationJob,
  AutomationStores,
  AuditLedgerStore,
  ContractScheduleWriter,
  DeadlineDraft,
  DeadlineStore,
  DurableIdempotencyStore,
  DomainEventOutbox,
  ScheduledJobDraft,
  ScheduledJobStore,
} from '../automation/records';
import type { ContractActivationPlan } from '../../domain/contractScheduleAutomation';
import { CONTRACT_AUTOMATION_HISTORY_EVENTS } from '../../domain/contractScheduleAutomation';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === UNIQUE_VIOLATION;
}

function readText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function readNullableText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return readText(value);
}

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readJson(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Placeholders paramétrés `$start..$start+count-1` : aucune interpolation libre. */
function placeholders(start: number, count: number): string {
  return Array.from({ length: count }, (_, index) => `$${start + index}`).join(', ');
}

function boundedLimit(limit: number, fallback = 25, max = 200): number {
  if (!Number.isFinite(limit)) return fallback;
  const truncated = Math.trunc(limit);
  if (truncated <= 0) return fallback;
  return Math.min(truncated, max);
}

/* ------------------------------------------------------------------ */
/* Outbox                                                               */
/* ------------------------------------------------------------------ */

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
}

function toOutboxEvent(row: OutboxRow): PersistedOutboxEvent {
  const actorId = readNullableText(row.actor_id);
  const correlationId = readNullableText(row.correlation_id);
  const causationId = readNullableText(row.causation_id);
  const processedAt = readNullableText(row.processed_at);
  const lastError = readNullableText(row.last_error);
  return {
    eventId: row.id,
    eventType: row.event_type as DomainEventType,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    timestamp: readText(row.created_at),
    payload: readJson(row.payload),
    source: row.source,
    version: row.version,
    status: row.status,
    attempts: row.attempts,
    availableAt: readText(row.available_at),
    ...(actorId !== undefined ? { actorId } : {}),
    ...(correlationId !== undefined ? { correlationId } : {}),
    ...(causationId !== undefined ? { causationId } : {}),
    ...(processedAt !== undefined ? { processedAt } : {}),
    ...(lastError !== undefined ? { lastError } : {}),
  };
}

export function createSqlDomainEventOutbox(db: SqlQueryExecutor): DomainEventOutbox {
  return {
    async append(event) {
      let result: SqlQueryResult<OutboxRow>;
      try {
        result = await db.query<OutboxRow>(
          `INSERT INTO automation_outbox (
             id, event_type, aggregate_type, aggregate_id, actor_id, payload, source,
             version, correlation_id, causation_id, created_at, status, attempts, available_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6::jsonb, $7,
             $8, $9, $10, $11, 'PENDING', 0, $11
           )
           ON CONFLICT (id) DO NOTHING
           RETURNING *`,
          [
            event.eventId,
            event.eventType,
            event.aggregateType,
            event.aggregateId,
            event.actorId ?? null,
            JSON.stringify(event.payload ?? {}),
            event.source,
            event.version ?? 1,
            event.correlationId ?? null,
            event.causationId ?? null,
            event.timestamp,
          ],
        );
      } catch (error) {
        // L'unicité est portée par la clé primaire : un rejeu est un doublon.
        if (isUniqueViolation(error)) {
          const existing = await db.query<OutboxRow>(
            'SELECT * FROM automation_outbox WHERE id = $1',
            [event.eventId],
          );
          if (existing.rows[0]) return { kind: 'duplicate', existing: toOutboxEvent(existing.rows[0]) };
        }
        throw error;
      }
      if (result.rows[0]) return { kind: 'appended' };
      const existing = await db.query<OutboxRow>(
        'SELECT * FROM automation_outbox WHERE id = $1',
        [event.eventId],
      );
      if (!existing.rows[0]) {
        throw new Error(`Outbox : événement ${event.eventId} ni inséré ni retrouvé.`);
      }
      return { kind: 'duplicate', existing: toOutboxEvent(existing.rows[0]) };
    },

    async findById(eventId) {
      const result = await db.query<OutboxRow>('SELECT * FROM automation_outbox WHERE id = $1', [eventId]);
      return result.rows[0] ? toOutboxEvent(result.rows[0]) : null;
    },

    async claimDue(input) {
      const limit = boundedLimit(input.limit);
      const eventTypes = [...new Set(input.eventTypes)];
      if (eventTypes.length === 0) return [];
      const sql =
        `UPDATE automation_outbox
            SET status = 'PROCESSING',
                attempts = attempts + 1
          WHERE id IN (
            SELECT id
              FROM automation_outbox
             WHERE status IN ('PENDING', 'RETRYABLE')
               AND available_at <= $1
               AND event_type IN (${placeholders(3, eventTypes.length)})
             ORDER BY available_at ASC, id ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`;
      // `SKIP LOCKED` : deux workers concurrents réclament des événements
      // DIFFÉRENTS. Le passage à `PROCESSING` est atomique avec le claim.
      const result = await db.query<OutboxRow>(sql, [input.now, limit, ...eventTypes]);
      return result.rows.map(toOutboxEvent);
    },

    async markProcessed(eventId, processedAt) {
      await db.query(
        `UPDATE automation_outbox
            SET status = 'PROCESSED',
                processed_at = $2,
                available_at = $2,
                last_error = NULL
          WHERE id = $1
            AND status IN ('PENDING', 'PROCESSING', 'RETRYABLE')`,
        [eventId, processedAt],
      );
    },

    async markRetryable(eventId, error, availableAt) {
      await db.query(
        `UPDATE automation_outbox
            SET status = 'RETRYABLE',
                available_at = $2,
                last_error = $3
          WHERE id = $1
            AND status IN ('PENDING', 'PROCESSING', 'RETRYABLE')`,
        [eventId, availableAt, error],
      );
    },

    async markDeadLetter(eventId, error) {
      await db.query(
        `UPDATE automation_outbox
            SET status = 'DEAD_LETTER',
                last_error = $2
          WHERE id = $1`,
        [eventId, error],
      );
    },

    async listByAggregate(aggregateType, aggregateId) {
      const result = await db.query<OutboxRow>(
        `SELECT * FROM automation_outbox
          WHERE aggregate_type = $1 AND aggregate_id = $2
          ORDER BY created_at ASC, id ASC`,
        [aggregateType, aggregateId],
      );
      return result.rows.map(toOutboxEvent);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Jobs planifiés                                                       */
/* ------------------------------------------------------------------ */

interface JobRow {
  job_id: string;
  job_type: string;
  aggregate_type: string;
  aggregate_id: string;
  due_at: unknown;
  status: JobStatus;
  attempts: number;
  idempotency_key: string;
  reference: string | null;
  created_at: unknown;
  started_at: unknown;
  completed_at: unknown;
  last_error: string | null;
}

function toScheduledJob(row: JobRow): AutomationJob {
  const startedAt = readNullableText(row.started_at);
  const completedAt = readNullableText(row.completed_at);
  const lastError = readNullableText(row.last_error);
  const reference = readNullableText(row.reference);
  return {
    jobId: row.job_id,
    jobType: row.job_type,
    target: { aggregateType: row.aggregate_type, aggregateId: row.aggregate_id },
    dueAt: readText(row.due_at),
    status: row.status,
    attempts: row.attempts,
    idempotencyKey: row.idempotency_key,
    createdAt: readText(row.created_at),
    ...(reference !== undefined ? { reference } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(lastError !== undefined ? { lastError } : {}),
  };
}

export function createSqlScheduledJobStore(db: SqlQueryExecutor): ScheduledJobStore {
  const byKey = async (idempotencyKey: string): Promise<AutomationJob | null> => {
    const result = await db.query<JobRow>(
      'SELECT * FROM automation_jobs WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    return result.rows[0] ? toScheduledJob(result.rows[0]) : null;
  };

  return {
    async createIfAbsent(draft) {
      let result: SqlQueryResult<JobRow>;
      try {
        result = await db.query<JobRow>(
          `INSERT INTO automation_jobs (
             job_id, job_type, aggregate_type, aggregate_id, due_at, status,
             attempts, idempotency_key, reference, created_at
           ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, $6, $7, $8)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *`,
          [
            draft.jobId,
            draft.jobType,
            draft.aggregateType,
            draft.aggregateId,
            draft.dueAt,
            draft.idempotencyKey,
            draft.reference ?? null,
            draft.createdAt,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          const existing = await byKey(draft.idempotencyKey);
          if (existing) return { kind: 'duplicate', job: existing };
        }
        throw error;
      }
      if (result.rows[0]) return { kind: 'created', job: toScheduledJob(result.rows[0]) };
      const existing = await byKey(draft.idempotencyKey);
      if (!existing) {
        throw new Error(`Jobs : ${draft.idempotencyKey} ni inséré ni retrouvé.`);
      }
      return { kind: 'duplicate', job: existing };
    },

    async findById(jobId) {
      const result = await db.query<JobRow>('SELECT * FROM automation_jobs WHERE job_id = $1', [jobId]);
      return result.rows[0] ? toScheduledJob(result.rows[0]) : null;
    },

    findByIdempotencyKey: byKey,

    async claimDue(input) {
      const limit = boundedLimit(input.limit);
      const jobTypes = [...new Set(input.jobTypes ?? [])];
      const typeFilter = jobTypes.length > 0
        ? `AND job_type IN (${placeholders(3, jobTypes.length)})`
        : '';
      const values: readonly unknown[] = jobTypes.length > 0
        ? [input.now, limit, ...jobTypes]
        : [input.now, limit];
      const result = await db.query<JobRow>(
        `UPDATE automation_jobs
            SET status = 'RUNNING',
                attempts = attempts + 1,
                started_at = $1
          WHERE job_id IN (
            SELECT job_id
              FROM automation_jobs
             WHERE status IN ('PENDING', 'RETRYABLE')
               AND due_at <= $1
               ${typeFilter}
             ORDER BY due_at ASC, job_id ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        values,
      );
      return result.rows.map(toScheduledJob);
    },

    async compareAndSetStatus(jobId, expected, patch) {
      const statuses = [...new Set(expected)];
      if (statuses.length === 0) return null;
      const result = await db.query<JobRow>(
        `UPDATE automation_jobs
            SET status = $2,
                started_at = CASE WHEN $2 = 'RUNNING' AND started_at IS NULL THEN $3 ELSE started_at END,
                completed_at = CASE WHEN $2 IN ('COMPLETED', 'FAILED') THEN $3 ELSE completed_at END,
                last_error = COALESCE($4, last_error),
                due_at = COALESCE($5, due_at)
          WHERE job_id = $1
            AND status IN (${placeholders(6, statuses.length)})
          RETURNING *`,
        [
          jobId,
          patch.status,
          patch.at,
          patch.error ?? null,
          patch.availableAt ?? null,
          ...statuses,
        ],
      );
      return result.rows[0] ? toScheduledJob(result.rows[0]) : null;
    },

    async listByAggregate(aggregateType, aggregateId) {
      const result = await db.query<JobRow>(
        `SELECT * FROM automation_jobs
          WHERE aggregate_type = $1 AND aggregate_id = $2
          ORDER BY due_at ASC, job_id ASC`,
        [aggregateType, aggregateId],
      );
      return result.rows.map(toScheduledJob);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Deadlines / SLA                                                      */
/* ------------------------------------------------------------------ */

interface DeadlineRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  kind: AutomationDeadline['kind'];
  due_at: unknown;
  status: DeadlineStatus;
  sla: string | null;
  grace_period_ms: unknown;
  escalation: string | null;
  reference: string | null;
  idempotency_key: string;
  source_event_id: string | null;
  created_at: unknown;
  updated_at: unknown;
  resolved_at: unknown;
}

function toDeadline(row: DeadlineRow): AutomationDeadline {
  const sla = readNullableText(row.sla);
  const escalation = readNullableText(row.escalation);
  const reference = readNullableText(row.reference);
  const sourceEventId = readNullableText(row.source_event_id);
  const resolvedAt = readNullableText(row.resolved_at);
  const gracePeriodMs = readNumber(row.grace_period_ms);
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    kind: row.kind,
    dueAt: readText(row.due_at),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
    ...(sla !== undefined ? { sla } : {}),
    ...(escalation !== undefined ? { escalation } : {}),
    ...(reference !== undefined ? { reference } : {}),
    ...(sourceEventId !== undefined ? { sourceEventId } : {}),
    ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    ...(gracePeriodMs !== undefined ? { gracePeriodMs } : {}),
  };
}

export function createSqlDeadlineStore(db: SqlQueryExecutor): DeadlineStore {
  const byKey = async (idempotencyKey: string): Promise<AutomationDeadline | null> => {
    const result = await db.query<DeadlineRow>(
      'SELECT * FROM automation_deadlines WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    return result.rows[0] ? toDeadline(result.rows[0]) : null;
  };

  return {
    async createIfAbsent(draft) {
      let result: SqlQueryResult<DeadlineRow>;
      try {
        result = await db.query<DeadlineRow>(
          `INSERT INTO automation_deadlines (
             id, aggregate_type, aggregate_id, kind, due_at, status, sla,
             grace_period_ms, escalation, reference, idempotency_key, source_event_id,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $8, $9, $10, $11, $12, $12)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *`,
          [
            draft.id,
            draft.aggregateType,
            draft.aggregateId,
            draft.kind,
            draft.dueAt,
            draft.sla,
            draft.gracePeriodMs ?? null,
            draft.escalation,
            draft.reference,
            draft.idempotencyKey,
            draft.sourceEventId ?? null,
            draft.createdAt,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          const existing = await byKey(draft.idempotencyKey);
          if (existing) return { kind: 'duplicate', deadline: existing };
        }
        throw error;
      }
      if (result.rows[0]) return { kind: 'created', deadline: toDeadline(result.rows[0]) };
      const existing = await byKey(draft.idempotencyKey);
      if (!existing) {
        throw new Error(`Deadlines : ${draft.idempotencyKey} ni créée ni retrouvée.`);
      }
      return { kind: 'duplicate', deadline: existing };
    },

    async findById(deadlineId) {
      const result = await db.query<DeadlineRow>(
        'SELECT * FROM automation_deadlines WHERE id = $1',
        [deadlineId],
      );
      return result.rows[0] ? toDeadline(result.rows[0]) : null;
    },

    async compareAndSetStatus(deadlineId, expected, patch) {
      const statuses = [...new Set(expected)];
      if (statuses.length === 0) return null;
      const result = await db.query<DeadlineRow>(
        `UPDATE automation_deadlines
            SET status = $2,
                updated_at = $3,
                resolved_at = CASE WHEN $2 IN ('MET', 'CANCELLED') THEN $3 ELSE resolved_at END
          WHERE id = $1
            AND status IN (${placeholders(4, statuses.length)})
          RETURNING *`,
        [deadlineId, patch.status, patch.at, ...statuses],
      );
      return result.rows[0] ? toDeadline(result.rows[0]) : null;
    },

    async listByAggregate(aggregateType, aggregateId) {
      const result = await db.query<DeadlineRow>(
        `SELECT * FROM automation_deadlines
          WHERE aggregate_type = $1 AND aggregate_id = $2
          ORDER BY due_at ASC, id ASC`,
        [aggregateType, aggregateId],
      );
      return result.rows.map(toDeadline);
    },

    async listDue(input) {
      const result = await db.query<DeadlineRow>(
        `SELECT * FROM automation_deadlines
          WHERE status IN ('OPEN', 'OVERDUE')
            AND due_at <= $1
          ORDER BY due_at ASC, id ASC
          LIMIT $2`,
        [input.now, boundedLimit(input.limit)],
      );
      return result.rows.map(toDeadline);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ledger d'audit                                                       */
/* ------------------------------------------------------------------ */

interface AuditRow {
  id: string;
  event_id: string | null;
  actor_id: string;
  occurred_at: unknown;
  entity_id: string;
  action: string;
  before_state: unknown;
  after_state: unknown;
  source: string;
  reference: string | null;
}

function toAuditEntry(row: AuditRow): AuditLedgerEntry {
  const eventId = readNullableText(row.event_id);
  const reference = readNullableText(row.reference);
  return {
    id: row.id,
    actorId: row.actor_id,
    timestamp: readText(row.occurred_at),
    entityId: row.entity_id,
    action: row.action,
    source: row.source,
    ...(eventId !== undefined ? { eventId } : {}),
    ...(reference !== undefined ? { reference } : {}),
    ...(row.before_state ? { beforeState: readJson(row.before_state) } : {}),
    ...(row.after_state ? { afterState: readJson(row.after_state) } : {}),
  };
}

export function createSqlAuditLedgerStore(db: SqlQueryExecutor): AuditLedgerStore {
  return {
    async append(entry) {
      try {
        await db.query(
          `INSERT INTO automation_audit_ledger (
             id, event_id, actor_id, occurred_at, entity_id, action,
             before_state, after_state, source, reference
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            entry.id,
            entry.eventId ?? null,
            entry.actorId,
            entry.timestamp,
            entry.entityId,
            entry.action,
            entry.beforeState ? JSON.stringify(entry.beforeState) : null,
            entry.afterState ? JSON.stringify(entry.afterState) : null,
            entry.source,
            entry.reference ?? null,
          ],
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      return entry;
    },

    async listByEntity(entityId, limit) {
      const result = await db.query<AuditRow>(
        `SELECT * FROM automation_audit_ledger
          WHERE entity_id = $1
          ORDER BY occurred_at ASC, id ASC
          LIMIT $2`,
        [entityId, boundedLimit(limit ?? 50)],
      );
      return result.rows.map(toAuditEntry);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Idempotence durable                                                  */
/* ------------------------------------------------------------------ */

interface IdempotencyRow {
  payload_hash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result: unknown;
}

export function createSqlIdempotencyStore(db: SqlQueryExecutor): DurableIdempotencyStore {
  const read = async (actorId: string, command: string, key: string): Promise<IdempotencyRow | null> => {
    const result = await db.query<IdempotencyRow>(
      `SELECT payload_hash, status, result
         FROM automation_idempotency
        WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3`,
      [actorId, command, key],
    );
    return result.rows[0] ?? null;
  };

  return {
    async reserve(input): Promise<IdempotencyResult<unknown>> {
      let inserted: SqlQueryResult<IdempotencyRow>;
      try {
        inserted = await db.query<IdempotencyRow>(
          `INSERT INTO automation_idempotency (
             actor_id, command, idempotency_key, payload_hash, status, created_at
           ) VALUES ($1, $2, $3, $4, 'PROCESSING', $5)
           ON CONFLICT (actor_id, command, idempotency_key) DO NOTHING
           RETURNING payload_hash, status, result`,
          [input.actorId, input.command, input.key, input.payloadHash, new Date().toISOString()],
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        inserted = { rows: [], rowCount: 0 };
      }
      if (inserted.rows[0]) return { kind: 'reserved' };

      const existing = await read(input.actorId, input.command, input.key);
      if (!existing) {
        // Réservation concurrente non encore visible : ni rejeu, ni conflit.
        return { kind: 'in-progress' };
      }
      if (existing.payload_hash !== input.payloadHash) return { kind: 'conflict' };
      if (existing.status === 'COMPLETED') {
        return { kind: 'replay', result: existing.result ?? null };
      }
      return { kind: 'in-progress' };
    },

    async complete(actorId, command, key, result) {
      await db.query(
        `UPDATE automation_idempotency
            SET status = 'COMPLETED',
                result = $4::jsonb,
                completed_at = $5
          WHERE actor_id = $1 AND command = $2 AND idempotency_key = $3`,
        [actorId, command, key, JSON.stringify(result ?? null), new Date().toISOString()],
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/* Écriture de l'échéancier sur le contrat                              */
/* ------------------------------------------------------------------ */

export function createSqlContractScheduleWriter(db: SqlQueryExecutor): ContractScheduleWriter {
  const contracts = createSqlContractStore(db);

  return {
    async applyActivationPlan(contractId, plan, input) {
      const historyEntry: ContractHistoryEntry = input.historyEntry;
      const result = await db.query<{ id: string }>(
        // Double garde PostgreSQL : statut réellement ACTIVE et échéancier
        // encore vide. Un second traitement du même CONTRACT_ACTIVATED ne peut
        // donc JAMAIS écrire un second échéancier.
        `UPDATE contracts
            SET payment_schedule = $2::jsonb,
                monthly_checkpoints = $3::jsonb,
                commission_ledger = $4::jsonb,
                commission_amount_due = $5,
                commission_status = $6,
                updated_at = $7,
                history = history || $8::jsonb
          WHERE id = $1
            AND status = 'ACTIVE'
            AND jsonb_array_length(payment_schedule) = 0
          RETURNING id`,
        [
          contractId,
          JSON.stringify(plan.paymentSchedule),
          JSON.stringify(plan.monthlyCheckpoints),
          JSON.stringify(plan.commissionLedger),
          plan.commissionAmountDue,
          plan.commissionStatus,
          input.updatedAt,
          JSON.stringify([historyEntry]),
        ],
      );
      if (result.rows.length === 0) return null;
      return contracts.findById(contractId);
    },

    async recordMissingScheduleRule(contractId, input) {
      const result = await db.query<{ id: string }>(
        // Aucune date n'est inventée : seule une entrée d'historique explicite
        // est ajoutée, une seule fois (garde sur l'événement déjà présent).
        `UPDATE contracts
            SET updated_at = $2,
                history = history || $3::jsonb
          WHERE id = $1
            AND status = 'ACTIVE'
            AND jsonb_array_length(payment_schedule) = 0
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(history) AS entry
               WHERE entry->>'event' = $4
            )
          RETURNING id`,
        [
          contractId,
          input.updatedAt,
          JSON.stringify([input.historyEntry]),
          CONTRACT_AUTOMATION_HISTORY_EVENTS.scheduleRuleMissing,
        ],
      );
      if (result.rows.length === 0) return null;
      return contracts.findById(contractId);
    },

    findByIdForUpdate(contractId) {
      return contracts.findByIdForUpdate(contractId);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Jeu complet                                                          */
/* ------------------------------------------------------------------ */

export function createSqlAutomationStores(db: SqlQueryExecutor): AutomationStores {
  return {
    outbox: createSqlDomainEventOutbox(db),
    jobs: createSqlScheduledJobStore(db),
    deadlines: createSqlDeadlineStore(db),
    audit: createSqlAuditLedgerStore(db),
    idempotency: createSqlIdempotencyStore(db),
    contractSchedules: createSqlContractScheduleWriter(db),
  };
}

/** Type de plan réellement écrit sur le contrat (aucun autre). */
export type ScheduledContractActivationPlan = Extract<ContractActivationPlan, { kind: 'SCHEDULED' }>;
