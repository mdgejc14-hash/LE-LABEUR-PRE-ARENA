/**
 * P0-PAY-3 — adaptateurs SQL du batch, ledger externe et revue de paiement.
 * Toutes les lectures de collections sont bornées; mutations transactionnelles
 * sont composées avec les stores d'automatisation existants par entry.ts.
 */

import type { SqlQueryExecutor, SqlQueryResult } from '../services/database';
import { postgresErrorCode } from './sqlClient';
import type { NormalizedPaymentTransaction, NormalizedReconciliationResult, PaymentLifecycleStatus, PaymentType } from '../../domain/paymentLifecycle';
import type {
  PaymentExternalSettlementRecord,
  PaymentReconciliationBatchDraft,
  PaymentReconciliationBatchItemDraft,
  PaymentReconciliationBatchItemRecord,
  PaymentReconciliationBatchRecord,
  PaymentReconciliationBatchStore,
  PaymentReconciliationItemStatus,
  PaymentReconciliationMatchingStore,
  PaymentReconciliationPaymentCandidate,
  PaymentReconciliationResultPatch,
  PaymentReconciliationReviewDraft,
  PaymentReconciliationReviewRecord,
  PaymentReconciliationReviewStore,
  PaymentReconciliationCorrectionAttemptDraft,
  PaymentReconciliationCorrectionAttemptRecord,
  PaymentReconciliationCorrectionAttemptStore,
  PaymentReconciliationStores,
  PaymentReconciliationVerdict,
  PaymentExternalSettlementDraft,
  PaymentExternalSettlementStore,
  PaymentReconciliationBatchItemStore,
} from './paymentReconciliationRecords';
import type { AuditLedgerStore, DomainEventOutbox, DurableIdempotencyStore, ScheduledJobStore } from '../automation/records';

const UNIQUE_VIOLATION = '23505';
const ITEM_INSERT_CHUNK = 100;

function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === UNIQUE_VIOLATION;
}

function readText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function readOptionalText(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : readText(value);
}

function readNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isFinite(parsed)) throw new Error('Colonne numérique de réconciliation illisible.');
  return parsed;
}

function readJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { throw new Error('Colonne JSONB de réconciliation illisible.'); }
  }
  return value as T;
}

function boundedLimit(limit: number, fallback = 100, max = 200): number {
  if (!Number.isFinite(limit) || Math.trunc(limit) < 1) return fallback;
  return Math.min(Math.trunc(limit), max);
}

interface BatchRow {
  id: string; provider: string; batch_key: string; payload_hash: string; requested_by: string;
  status: PaymentReconciliationBatchRecord['status']; total_items: number; processed_items: number;
  matched_items: number; mismatched_items: number; not_found_items: number; duplicate_items: number;
  review_items: number; failed_items: number; pending_items: number; processing_items: number;
  retryable_items: number; created_at: unknown; started_at: unknown;
  completed_at: unknown; last_error: string | null;
}

function toBatch(row: BatchRow): PaymentReconciliationBatchRecord {
  return {
    batchId: row.id,
    provider: row.provider,
    idempotencyKey: row.batch_key,
    payloadHash: row.payload_hash,
    requestedBy: row.requested_by,
    status: row.status,
    totalItems: Number(row.total_items),
    processedItems: Number(row.processed_items),
    matchedItems: Number(row.matched_items),
    mismatchedItems: Number(row.mismatched_items),
    notFoundItems: Number(row.not_found_items),
    duplicateItems: Number(row.duplicate_items),
    reviewItems: Number(row.review_items),
    failedItems: Number(row.failed_items),
    pendingItems: Number(row.pending_items),
    processingItems: Number(row.processing_items),
    retryableItems: Number(row.retryable_items),
    createdAt: readText(row.created_at),
    ...(row.started_at !== null && row.started_at !== undefined ? { startedAt: readText(row.started_at) } : {}),
    ...(row.completed_at !== null && row.completed_at !== undefined ? { completedAt: readText(row.completed_at) } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}

interface ItemRow {
  id: string; batch_id: string; item_index: number; provider: string;
  external_transaction_id: string | null; reference: string | null; normalized_metadata: unknown;
  validation_reasons: unknown; status: PaymentReconciliationItemStatus; result: unknown;
  matched_payment_id: string | null; review_id: string | null; attempts: number;
  claim_token: string | null; claimed_at: unknown; next_attempt_at: unknown; last_error: string | null;
  created_at: unknown; updated_at: unknown;
}

function toItem(row: ItemRow): PaymentReconciliationBatchItemRecord {
  const result = row.result === null || row.result === undefined
    ? undefined
    : readJson<NormalizedReconciliationResult>(row.result, {} as NormalizedReconciliationResult);
  return {
    itemId: row.id,
    batchId: row.batch_id,
    itemIndex: Number(row.item_index),
    provider: row.provider,
    ...(row.external_transaction_id ? { externalTransactionId: row.external_transaction_id } : {}),
    ...(row.reference ? { reference: row.reference } : {}),
    normalizedMetadata: readJson<Record<string, unknown>>(row.normalized_metadata, {}),
    validationReasons: readJson<readonly string[]>(row.validation_reasons, []),
    status: row.status,
    ...(result ? { result } : {}),
    ...(row.matched_payment_id ? { matchedPaymentId: row.matched_payment_id } : {}),
    ...(row.review_id ? { reviewId: row.review_id } : {}),
    attempts: Number(row.attempts),
    ...(row.claimed_at !== null && row.claimed_at !== undefined ? { claimedAt: readText(row.claimed_at) } : {}),
    nextAttemptAt: readText(row.next_attempt_at),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
  };
}

interface SettlementRow {
  id: string; provider: string; external_transaction_id: string; reference: string; amount: unknown;
  currency: string; payer: string; recipient: string; occurred_at: string;
  transaction_status: NormalizedPaymentTransaction['status']; normalized_metadata: unknown;
  reconciliation_status: PaymentReconciliationVerdict; matched_payment_id: string | null;
  reconciliation_reasons: unknown; first_seen_at: unknown; last_seen_at: unknown;
  created_at: unknown; updated_at: unknown;
}

function toSettlement(row: SettlementRow): PaymentExternalSettlementRecord {
  return {
    settlementId: row.id,
    provider: row.provider,
    externalTransactionId: row.external_transaction_id,
    reference: row.reference,
    amount: readNumber(row.amount),
    currency: row.currency,
    payer: row.payer,
    recipient: row.recipient,
    occurredAt: row.occurred_at,
    transactionStatus: row.transaction_status,
    normalizedMetadata: readJson<Record<string, unknown>>(row.normalized_metadata, {}),
    reconciliationStatus: row.reconciliation_status,
    ...(row.matched_payment_id ? { matchedPaymentId: row.matched_payment_id } : {}),
    reconciliationReasons: readJson<readonly string[]>(row.reconciliation_reasons, []),
    firstSeenAt: readText(row.first_seen_at),
    lastSeenAt: readText(row.last_seen_at),
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
  };
}

interface ReviewRow {
  id: string; batch_id: string; batch_item_id: string; payment_id: string | null; reason: string;
  evidence_reference: string | null; decision: PaymentReconciliationReviewRecord['decision']; opened_by: string;
  opened_at: unknown; actor_id: string | null; decided_at: unknown; decision_evidence: string | null;
  decision_note: string | null; escalated_at: unknown; created_at: unknown; updated_at: unknown;
}

function toReview(row: ReviewRow): PaymentReconciliationReviewRecord {
  return {
    reviewId: row.id,
    batchId: row.batch_id,
    itemId: row.batch_item_id,
    ...(row.payment_id ? { paymentId: row.payment_id } : {}),
    reason: row.reason,
    ...(row.evidence_reference ? { evidenceReference: row.evidence_reference } : {}),
    decision: row.decision,
    openedBy: row.opened_by,
    openedAt: readText(row.opened_at),
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    ...(row.decided_at !== null && row.decided_at !== undefined ? { decidedAt: readText(row.decided_at) } : {}),
    ...(row.decision_evidence ? { decisionEvidence: row.decision_evidence } : {}),
    ...(row.decision_note ? { decisionNote: row.decision_note } : {}),
    ...(row.escalated_at !== null && row.escalated_at !== undefined ? { escalatedAt: readText(row.escalated_at) } : {}),
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
  };
}

export function createSqlPaymentReconciliationBatchStore(db: SqlQueryExecutor): PaymentReconciliationBatchStore {
  const findById = async (batchId: string): Promise<PaymentReconciliationBatchRecord | null> => {
    const result = await db.query<BatchRow>('SELECT * FROM payment_reconciliation_batches WHERE id = $1', [batchId]);
    return result.rows[0] ? toBatch(result.rows[0]) : null;
  };

  return {
    async createIfAbsent(draft: PaymentReconciliationBatchDraft) {
      const inserted = await db.query<BatchRow>(
        `INSERT INTO payment_reconciliation_batches (
           id, provider, batch_key, payload_hash, requested_by, total_items, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (provider, batch_key) DO NOTHING
         RETURNING *`,
        [draft.batchId, draft.provider, draft.idempotencyKey, draft.payloadHash, draft.requestedBy, draft.totalItems, draft.createdAt],
      );
      if (inserted.rows[0]) return { kind: 'created' as const, batch: toBatch(inserted.rows[0]) };
      const existing = await db.query<BatchRow>(
        'SELECT * FROM payment_reconciliation_batches WHERE provider = $1 AND batch_key = $2',
        [draft.provider, draft.idempotencyKey],
      );
      if (!existing.rows[0]) throw new Error('Lot de rapprochement conflictuel introuvable après contrainte d’unicité.');
      return { kind: 'duplicate' as const, batch: toBatch(existing.rows[0]) };
    },

    findById,

    async findByProviderAndKey(provider, idempotencyKey) {
      const result = await db.query<BatchRow>(
        'SELECT * FROM payment_reconciliation_batches WHERE provider = $1 AND batch_key = $2',
        [provider, idempotencyKey],
      );
      return result.rows[0] ? toBatch(result.rows[0]) : null;
    },

    async markStarted(batchId, timestamp) {
      await db.query(
        `UPDATE payment_reconciliation_batches
            SET status = CASE WHEN status = 'PENDING' THEN 'PROCESSING' ELSE status END,
                started_at = COALESCE(started_at, $2::timestamptz), updated_at = $2::timestamptz
          WHERE id = $1`,
        [batchId, timestamp],
      );
    },

    async refreshSummary(batchId, timestamp) {
      const countsResult = await db.query<{
        matched: number; mismatched: number; not_found: number; duplicates: number;
        reviews: number; failed: number; outstanding: number; processing: number;
        pending: number; retryable: number;
      }>(
        `SELECT
           count(*) FILTER (WHERE status = 'MATCH')::int AS matched,
           count(*) FILTER (WHERE status = 'MISMATCH')::int AS mismatched,
           count(*) FILTER (WHERE status = 'NOT_FOUND')::int AS not_found,
           count(*) FILTER (WHERE status = 'DUPLICATE')::int AS duplicates,
           count(*) FILTER (WHERE status = 'REVIEW_REQUIRED')::int AS reviews,
           count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
           count(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING', 'RETRYABLE'))::int AS outstanding,
           count(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
           count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
           count(*) FILTER (WHERE status = 'RETRYABLE')::int AS retryable
         FROM payment_reconciliation_batch_items
         WHERE batch_id = $1`,
        [batchId],
      );
      const counts = countsResult.rows[0];
      if (!counts) return null;
      const processed = counts.matched + counts.mismatched + counts.not_found
        + counts.duplicates + counts.reviews + counts.failed;
      const status: PaymentReconciliationBatchRecord['status'] = counts.processing > 0 || counts.pending > 0
        ? 'PROCESSING'
        : counts.retryable > 0
          ? 'PARTIAL'
          : counts.failed > 0
            ? (processed === counts.failed ? 'FAILED' : 'PARTIAL')
            : 'COMPLETED';
      const result = await db.query<BatchRow>(
        `UPDATE payment_reconciliation_batches
            SET matched_items = $2,
                mismatched_items = $3,
                not_found_items = $4,
                duplicate_items = $5,
                review_items = $6,
                failed_items = $7,
                pending_items = $8,
                processing_items = $9,
                retryable_items = $10,
                processed_items = $11,
                status = $12,
                updated_at = $13::timestamptz,
                completed_at = CASE WHEN $14 = 0 THEN COALESCE(completed_at, $13::timestamptz) ELSE NULL END
          WHERE id = $1
          RETURNING *`,
        [batchId, counts.matched, counts.mismatched, counts.not_found, counts.duplicates,
          counts.reviews, counts.failed, counts.pending, counts.processing, counts.retryable,
          processed, status, timestamp, counts.outstanding],
      );
      return result.rows[0] ? toBatch(result.rows[0]) : null;
    },

    async setLastError(batchId, error, timestamp) {
      await db.query(
        'UPDATE payment_reconciliation_batches SET last_error = $2, updated_at = $3 WHERE id = $1',
        [batchId, error.slice(0, 500), timestamp],
      );
    },
  };
}

export function createSqlPaymentReconciliationBatchItemStore(db: SqlQueryExecutor): PaymentReconciliationBatchItemStore {
  return {
    async createMany(items: readonly PaymentReconciliationBatchItemDraft[]) {
      for (let offset = 0; offset < items.length; offset += ITEM_INSERT_CHUNK) {
        const chunk = items.slice(offset, offset + ITEM_INSERT_CHUNK);
        const values: unknown[] = [];
        const groups = chunk.map((item, index) => {
          const start = index * 11;
          values.push(
            item.itemId, item.batchId, item.itemIndex, item.provider,
            item.externalTransactionId ?? null, item.reference ?? null,
            JSON.stringify(item.normalizedMetadata), JSON.stringify(item.validationReasons),
            item.nextAttemptAt, item.createdAt, item.createdAt,
          );
          return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6},
                   $${start + 7}::jsonb, $${start + 8}::jsonb, $${start + 9}, $${start + 10}, $${start + 11})`;
        });
        await db.query(
          `INSERT INTO payment_reconciliation_batch_items (
             id, batch_id, item_index, provider, external_transaction_id, reference,
             normalized_metadata, validation_reasons, next_attempt_at, created_at, updated_at
           ) VALUES ${groups.join(', ')}
           ON CONFLICT (batch_id, item_index) DO NOTHING`,
          values,
        );
      }
    },

    async claimDue(input) {
      const limit = boundedLimit(input.limit, 100);
      const result = await db.query<ItemRow>(
        `WITH claimable AS (
           SELECT id
             FROM payment_reconciliation_batch_items
            WHERE batch_id = $1
              AND status IN ('PENDING', 'RETRYABLE')
              AND next_attempt_at <= $2::timestamptz
            ORDER BY item_index ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
         )
         UPDATE payment_reconciliation_batch_items AS item
            SET status = 'PROCESSING', attempts = item.attempts + 1,
                claim_token = $4, claimed_at = $2::timestamptz, updated_at = $2::timestamptz
           FROM claimable
          WHERE item.id = claimable.id
          RETURNING item.*`,
        [input.batchId, input.now, limit, input.claimToken],
      );
      return result.rows.map(toItem);
    },

    async complete(itemId, claimToken, patch: PaymentReconciliationResultPatch) {
      const result = await db.query<ItemRow>(
        `UPDATE payment_reconciliation_batch_items
            SET status = $3, result = $4::jsonb, matched_payment_id = $5,
                review_id = $6, claim_token = NULL, claimed_at = NULL,
                last_error = NULL, updated_at = $7
          WHERE id = $1 AND status = 'PROCESSING' AND claim_token = $2
          RETURNING *`,
        [itemId, claimToken, patch.status, JSON.stringify(patch.result), patch.matchedPaymentId ?? null, patch.reviewId ?? null, patch.updatedAt],
      );
      return result.rows[0] ? toItem(result.rows[0]) : null;
    },

    async markProcessingFailure(input) {
      const result = await db.query<ItemRow>(
        `UPDATE payment_reconciliation_batch_items
            SET status = CASE WHEN attempts >= $5 THEN 'FAILED' ELSE 'RETRYABLE' END,
                claim_token = NULL, claimed_at = NULL, last_error = $3,
                next_attempt_at = $4::timestamptz, updated_at = $6
          WHERE id = $1 AND status = 'PROCESSING' AND claim_token = $2
          RETURNING *`,
        [input.itemId, input.claimToken, input.error.slice(0, 500), input.retryAt, input.maxAttempts, input.updatedAt],
      );
      return result.rows[0] ? toItem(result.rows[0]) : null;
    },

    async resetForRetry(batchId, timestamp) {
      const result = await db.query<{ id: string }>(
        `UPDATE payment_reconciliation_batch_items
            SET status = 'PENDING', next_attempt_at = $2::timestamptz,
                claim_token = NULL, claimed_at = NULL, updated_at = $2::timestamptz
          WHERE batch_id = $1 AND status IN ('RETRYABLE', 'FAILED')
          RETURNING id`,
        [batchId, timestamp],
      );
      return result.rowCount;
    },

    async findById(itemId) {
      const result = await db.query<ItemRow>('SELECT * FROM payment_reconciliation_batch_items WHERE id = $1', [itemId]);
      return result.rows[0] ? toItem(result.rows[0]) : null;
    },

    async markStale(itemId, staleBefore, timestamp, resultValue, reviewId, matchedPaymentId) {
      const result = await db.query<ItemRow>(
        `UPDATE payment_reconciliation_batch_items
            SET status = 'REVIEW_REQUIRED', result = $4::jsonb, review_id = $5,
                claim_token = NULL, claimed_at = NULL,
                matched_payment_id = $6, last_error = $7, updated_at = $3
          WHERE id = $1
            AND status IN ('PENDING', 'PROCESSING', 'RETRYABLE', 'FAILED')
            AND COALESCE(claimed_at, updated_at) <= $2::timestamptz
          RETURNING *`,
        [itemId, staleBefore, timestamp, JSON.stringify(resultValue), reviewId,
          matchedPaymentId ?? null, resultValue.reasons.join(' ').slice(0, 500)],
      );
      return result.rows[0] ? toItem(result.rows[0]) : null;
    },

    async listByBatch(batchId, limit, afterIndex) {
      const bounded = boundedLimit(limit);
      const result = afterIndex === undefined || afterIndex === null
        ? await db.query<ItemRow>(
            `SELECT * FROM payment_reconciliation_batch_items
              WHERE batch_id = $1 ORDER BY item_index ASC LIMIT $2`,
            [batchId, bounded],
          )
        : await db.query<ItemRow>(
            `SELECT * FROM payment_reconciliation_batch_items
              WHERE batch_id = $1 AND item_index > $2
              ORDER BY item_index ASC LIMIT $3`,
            [batchId, afterIndex, bounded],
          );
      return result.rows.map(toItem);
    },
  };
}

export function createSqlPaymentExternalSettlementStore(db: SqlQueryExecutor): PaymentExternalSettlementStore {
  const findByIdentity = async (
    provider: string,
    field: 'external_transaction_id' | 'reference',
    value: string,
  ): Promise<PaymentExternalSettlementRecord | null> => {
    // `field` est un littéral fermé défini dans cette fonction, jamais fourni par l'appelant.
    const result = await db.query<SettlementRow>(
      `SELECT * FROM payment_external_settlements WHERE provider = $1 AND ${field} = $2`,
      [provider, value],
    );
    return result.rows[0] ? toSettlement(result.rows[0]) : null;
  };

  return {
    async createIfAbsent(draft: PaymentExternalSettlementDraft) {
      let inserted: SqlQueryResult<SettlementRow>;
      try {
        inserted = await db.query<SettlementRow>(
          `INSERT INTO payment_external_settlements (
             id, provider, external_transaction_id, reference, amount, currency, payer, recipient,
             occurred_at, transaction_status, normalized_metadata, reconciliation_status,
             first_seen_at, last_seen_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
                     'REVIEW_REQUIRED', $12, $12, $13, $13)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [draft.settlementId, draft.provider, draft.externalTransactionId, draft.reference, draft.amount,
            draft.currency, draft.payer, draft.recipient, draft.occurredAt, draft.transactionStatus,
            JSON.stringify(draft.normalizedMetadata), draft.firstSeenAt, draft.createdAt],
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        inserted = { rows: [], rowCount: 0 };
      }
      if (inserted.rows[0]) return { kind: 'created' as const, settlement: toSettlement(inserted.rows[0]) };
      const byTransaction = await findByIdentity(draft.provider, 'external_transaction_id', draft.externalTransactionId);
      if (byTransaction) return { kind: 'duplicate-transaction' as const, settlement: byTransaction };
      const byReference = await findByIdentity(draft.provider, 'reference', draft.reference);
      if (byReference) return { kind: 'duplicate-reference' as const, settlement: byReference };
      throw new Error('Identité externe en conflit mais aucun règlement existant n’a été retrouvé.');
    },

    findByProviderAndExternalId(provider, externalTransactionId) {
      return findByIdentity(provider, 'external_transaction_id', externalTransactionId);
    },

    async findMatchedByPaymentId(paymentId) {
      const result = await db.query<SettlementRow>(
        `SELECT * FROM payment_external_settlements
          WHERE matched_payment_id = $1 AND reconciliation_status = 'MATCH'
          LIMIT 1`,
        [paymentId],
      );
      return result.rows[0] ? toSettlement(result.rows[0]) : null;
    },

    async touch(settlementId, timestamp) {
      await db.query(
        'UPDATE payment_external_settlements SET last_seen_at = $2, updated_at = $2 WHERE id = $1',
        [settlementId, timestamp],
      );
    },

    async setReconciliationResult(input) {
      await db.query(
        `UPDATE payment_external_settlements
            SET reconciliation_status = $2, matched_payment_id = $3,
                reconciliation_reasons = $4::jsonb, updated_at = $5
          WHERE id = $1`,
        [input.settlementId, input.status, input.matchedPaymentId ?? null, JSON.stringify(input.reasons), input.timestamp],
      );
    },
  };
}

export function createSqlPaymentReconciliationReviewStore(db: SqlQueryExecutor): PaymentReconciliationReviewStore {
  return {
    async createIfAbsent(draft: PaymentReconciliationReviewDraft) {
      const result = await db.query<ReviewRow>(
        `INSERT INTO payment_reconciliation_reviews (
           id, batch_id, batch_item_id, payment_id, reason, evidence_reference,
           opened_by, opened_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8)
         ON CONFLICT (batch_item_id) DO NOTHING
         RETURNING *`,
        [draft.reviewId, draft.batchId, draft.itemId, draft.paymentId ?? null, draft.reason,
          draft.evidenceReference ?? null, draft.openedBy, draft.openedAt],
      );
      if (result.rows[0]) return toReview(result.rows[0]);
      const existing = await db.query<ReviewRow>(
        'SELECT * FROM payment_reconciliation_reviews WHERE batch_item_id = $1',
        [draft.itemId],
      );
      if (!existing.rows[0]) throw new Error('Revue de rapprochement conflictuel introuvable.');
      return toReview(existing.rows[0]);
    },

    async findById(reviewId) {
      const result = await db.query<ReviewRow>('SELECT * FROM payment_reconciliation_reviews WHERE id = $1', [reviewId]);
      return result.rows[0] ? toReview(result.rows[0]) : null;
    },

    async findByIdForUpdate(reviewId) {
      const result = await db.query<ReviewRow>('SELECT * FROM payment_reconciliation_reviews WHERE id = $1 FOR UPDATE', [reviewId]);
      return result.rows[0] ? toReview(result.rows[0]) : null;
    },

    async decide(input) {
      const result = await db.query<ReviewRow>(
        `UPDATE payment_reconciliation_reviews
            SET decision = $3, actor_id = $4, decided_at = $5,
                decision_evidence = $6, decision_note = $7, updated_at = $8
          WHERE id = $1 AND decision = $2
          RETURNING *`,
        [input.reviewId, input.expected, input.decision, input.actorId, input.decidedAt,
          input.decisionEvidence ?? null, input.decisionNote ?? null, input.updatedAt],
      );
      return result.rows[0] ? toReview(result.rows[0]) : null;
    },

    async markEscalated(reviewId, timestamp) {
      const result = await db.query<ReviewRow>(
        `UPDATE payment_reconciliation_reviews
            SET escalated_at = $2, updated_at = $2
          WHERE id = $1 AND decision = 'OPEN' AND escalated_at IS NULL
          RETURNING *`,
        [reviewId, timestamp],
      );
      return result.rows[0] ? toReview(result.rows[0]) : null;
    },
  };
}

interface CorrectionAttemptRow {
  id: string; review_id: string; batch_id: string; batch_item_id: string; payment_id: string | null;
  attempted_by: string; idempotency_key: string; proposed_changes: unknown; evidence_reference: string | null;
  note: string | null; status: 'RECORDED'; created_at: unknown;
}

function toCorrectionAttempt(row: CorrectionAttemptRow): PaymentReconciliationCorrectionAttemptRecord {
  return {
    correctionAttemptId: row.id,
    reviewId: row.review_id,
    batchId: row.batch_id,
    itemId: row.batch_item_id,
    ...(row.payment_id ? { paymentId: row.payment_id } : {}),
    attemptedBy: row.attempted_by,
    idempotencyKey: row.idempotency_key,
    proposedChanges: readJson<Record<string, unknown>>(row.proposed_changes, {}),
    ...(row.evidence_reference ? { evidenceReference: row.evidence_reference } : {}),
    ...(row.note ? { note: row.note } : {}),
    status: row.status,
    createdAt: readText(row.created_at),
  };
}

export function createSqlPaymentReconciliationCorrectionAttemptStore(
  db: SqlQueryExecutor,
): PaymentReconciliationCorrectionAttemptStore {
  return {
    async createIfAbsent(draft: PaymentReconciliationCorrectionAttemptDraft) {
      const inserted = await db.query<CorrectionAttemptRow>(
        `INSERT INTO payment_reconciliation_correction_attempts (
           id, review_id, batch_id, batch_item_id, payment_id, attempted_by,
           idempotency_key, proposed_changes, evidence_reference, note, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'RECORDED', $11)
         ON CONFLICT (review_id, idempotency_key) DO NOTHING
         RETURNING *`,
        [draft.correctionAttemptId, draft.reviewId, draft.batchId, draft.itemId,
          draft.paymentId ?? null, draft.attemptedBy, draft.idempotencyKey,
          JSON.stringify(draft.proposedChanges), draft.evidenceReference ?? null,
          draft.note ?? null, draft.createdAt],
      );
      if (inserted.rows[0]) return toCorrectionAttempt(inserted.rows[0]);
      const existing = await db.query<CorrectionAttemptRow>(
        'SELECT * FROM payment_reconciliation_correction_attempts WHERE review_id = $1 AND idempotency_key = $2',
        [draft.reviewId, draft.idempotencyKey],
      );
      if (!existing.rows[0]) throw new Error('Tentative de correction conflictuelle introuvable.');
      return toCorrectionAttempt(existing.rows[0]);
    },

    async findByReviewAndKey(reviewId, key) {
      const result = await db.query<CorrectionAttemptRow>(
        'SELECT * FROM payment_reconciliation_correction_attempts WHERE review_id = $1 AND idempotency_key = $2',
        [reviewId, key],
      );
      return result.rows[0] ? toCorrectionAttempt(result.rows[0]) : null;
    },
  };
}

interface CandidateRow {
  payment_id: string; contract_id: string; employer_id: string; candidate_id: string;
  payment_type: PaymentType; amount: unknown; currency: string; scheduled_at: unknown; due_at: unknown;
  status: PaymentLifecycleStatus; provider: string | null; external_transaction_id: string | null; reference: string | null;
}

function toCandidate(row: CandidateRow): PaymentReconciliationPaymentCandidate {
  return {
    paymentId: row.payment_id,
    contractId: row.contract_id,
    employerId: row.employer_id,
    candidateId: row.candidate_id,
    paymentType: row.payment_type,
    amount: readNumber(row.amount),
    currency: row.currency,
    scheduledAt: readText(row.scheduled_at),
    dueAt: readText(row.due_at),
    status: row.status,
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.external_transaction_id ? { externalTransactionId: row.external_transaction_id } : {}),
    ...(row.reference ? { reference: row.reference } : {}),
  };
}

const CANDIDATE_SELECT = `SELECT p.id AS payment_id, p.contract_id, p.employer_id, p.candidate_id,
       p.payment_type, p.amount, p.currency, p.scheduled_at, p.due_at, p.status,
       COALESCE(p.provider, last_decl.provider) AS provider,
       COALESCE(p.external_transaction_id, last_decl.external_transaction_id) AS external_transaction_id,
       COALESCE(p.reference, last_decl.reference) AS reference
  FROM payments AS p
  LEFT JOIN LATERAL (
    SELECT d.provider, d.external_transaction_id, d.reference
      FROM payment_declarations AS d
     WHERE d.payment_id = p.id
     ORDER BY d.attempt_number DESC
     LIMIT 1
  ) AS last_decl ON TRUE`;

export function createSqlPaymentReconciliationMatchingStore(db: SqlQueryExecutor): PaymentReconciliationMatchingStore {
  return {
    async findCandidates(input) {
      const result = await db.query<CandidateRow>(
        `${CANDIDATE_SELECT}
          WHERE (COALESCE(p.provider, last_decl.provider) = $1
                 AND COALESCE(p.external_transaction_id, last_decl.external_transaction_id) = $2)
             OR p.reference = $3
             OR last_decl.reference = $3
          ORDER BY p.updated_at DESC, p.id ASC
          LIMIT $4`,
        [input.provider, input.externalTransactionId, input.reference, boundedLimit(input.limit, 5, 10)],
      );
      return result.rows.map(toCandidate);
    },

    async findCandidateByIdForUpdate(paymentId) {
      const result = await db.query<CandidateRow>(
        `${CANDIDATE_SELECT}
          WHERE p.id = $1
          FOR UPDATE OF p`,
        [paymentId],
      );
      return result.rows[0] ? toCandidate(result.rows[0]) : null;
    },
  };
}

/**
 * Stores de réconciliation purs SQL. Audit, outbox, jobs et idempotence restent
 * fournis par `createSqlAutomationStores` et sa transaction appelante.
 */
export function createSqlPaymentReconciliationStores(
  db: SqlQueryExecutor,
  automation: {
    audit: AuditLedgerStore;
    idempotency: DurableIdempotencyStore;
    outbox: DomainEventOutbox;
    jobs: ScheduledJobStore;
  },
): PaymentReconciliationStores {
  return {
    batches: createSqlPaymentReconciliationBatchStore(db),
    items: createSqlPaymentReconciliationBatchItemStore(db),
    settlements: createSqlPaymentExternalSettlementStore(db),
    reviews: createSqlPaymentReconciliationReviewStore(db),
    correctionAttempts: createSqlPaymentReconciliationCorrectionAttemptStore(db),
    matching: createSqlPaymentReconciliationMatchingStore(db),
    ...automation,
  };
}
