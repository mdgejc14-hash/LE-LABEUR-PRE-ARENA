/**
 * P0-PAY-3 — ports de persistence pour batch externe, ledger et revue ADMIN.
 * Ils complètent le cycle Payment existant; ils ne créent pas un second Payment.
 */

import type { NormalizedPaymentTransaction, NormalizedReconciliationResult } from '../../domain/paymentLifecycle';
import type { AuditLedgerStore, DomainEventOutbox, DurableIdempotencyStore, ScheduledJobStore } from '../automation/records';
import type { PaymentLifecycleStatus, PaymentType } from '../../domain/paymentLifecycle';

export const PAYMENT_RECONCILIATION_VERDICTS = [
  'MATCH',
  'MISMATCH',
  'NOT_FOUND',
  'DUPLICATE',
  'REVIEW_REQUIRED',
] as const;

export type PaymentReconciliationVerdict = (typeof PAYMENT_RECONCILIATION_VERDICTS)[number];
export type PaymentReconciliationBatchStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
export type PaymentReconciliationItemStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'RETRYABLE'
  | PaymentReconciliationVerdict
  | 'FAILED';
export type PaymentReconciliationReviewDecision = 'OPEN' | 'CONFIRMED' | 'REJECTED';

export interface PaymentReconciliationBatchRecord {
  batchId: string;
  provider: string;
  idempotencyKey: string;
  payloadHash: string;
  requestedBy: string;
  status: PaymentReconciliationBatchStatus;
  totalItems: number;
  processedItems: number;
  matchedItems: number;
  mismatchedItems: number;
  notFoundItems: number;
  duplicateItems: number;
  reviewItems: number;
  failedItems: number;
  pendingItems: number;
  processingItems: number;
  retryableItems: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}

export interface PaymentReconciliationBatchItemRecord {
  itemId: string;
  batchId: string;
  itemIndex: number;
  provider: string;
  externalTransactionId?: string;
  reference?: string;
  /** Champs normalisés autorisés uniquement; aucun payload fournisseur libre. */
  normalizedMetadata: Record<string, unknown>;
  validationReasons: readonly string[];
  status: PaymentReconciliationItemStatus;
  result?: NormalizedReconciliationResult;
  matchedPaymentId?: string;
  reviewId?: string;
  attempts: number;
  claimedAt?: string;
  nextAttemptAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentExternalSettlementRecord {
  settlementId: string;
  provider: string;
  externalTransactionId: string;
  reference: string;
  amount: number;
  currency: string;
  payer: string;
  recipient: string;
  occurredAt: string;
  transactionStatus: NormalizedPaymentTransaction['status'];
  normalizedMetadata: Record<string, unknown>;
  reconciliationStatus: PaymentReconciliationVerdict;
  matchedPaymentId?: string;
  reconciliationReasons: readonly string[];
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReconciliationReviewRecord {
  reviewId: string;
  batchId: string;
  itemId: string;
  paymentId?: string;
  reason: string;
  evidenceReference?: string;
  decision: PaymentReconciliationReviewDecision;
  openedBy: string;
  openedAt: string;
  actorId?: string;
  decidedAt?: string;
  decisionEvidence?: string;
  decisionNote?: string;
  escalatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Trace immuable d'une tentative ADMIN de correction; elle n'altère pas la source. */
export interface PaymentReconciliationCorrectionAttemptRecord {
  correctionAttemptId: string;
  reviewId: string;
  batchId: string;
  itemId: string;
  paymentId?: string;
  attemptedBy: string;
  idempotencyKey: string;
  proposedChanges: Readonly<Record<string, unknown>>;
  evidenceReference?: string;
  note?: string;
  status: 'RECORDED';
  createdAt: string;
}

export interface PaymentReconciliationPaymentCandidate {
  paymentId: string;
  contractId: string;
  employerId: string;
  candidateId: string;
  paymentType: PaymentType;
  amount: number;
  currency: string;
  scheduledAt: string;
  dueAt: string;
  status: PaymentLifecycleStatus;
  provider?: string;
  externalTransactionId?: string;
  reference?: string;
}

export interface PaymentReconciliationBatchDraft {
  batchId: string;
  provider: string;
  idempotencyKey: string;
  payloadHash: string;
  requestedBy: string;
  totalItems: number;
  createdAt: string;
}

export interface PaymentReconciliationBatchItemDraft {
  itemId: string;
  batchId: string;
  itemIndex: number;
  provider: string;
  externalTransactionId?: string;
  reference?: string;
  normalizedMetadata: Record<string, unknown>;
  validationReasons: readonly string[];
  nextAttemptAt: string;
  createdAt: string;
}

export interface PaymentExternalSettlementDraft {
  settlementId: string;
  provider: string;
  externalTransactionId: string;
  reference: string;
  amount: number;
  currency: string;
  payer: string;
  recipient: string;
  occurredAt: string;
  transactionStatus: NormalizedPaymentTransaction['status'];
  normalizedMetadata: Record<string, unknown>;
  firstSeenAt: string;
  createdAt: string;
}

export interface PaymentReconciliationReviewDraft {
  reviewId: string;
  batchId: string;
  itemId: string;
  paymentId?: string;
  reason: string;
  evidenceReference?: string;
  openedBy: string;
  openedAt: string;
  createdAt: string;
}

export interface PaymentReconciliationItemClaim {
  batchId: string;
  limit: number;
  claimToken: string;
  now: string;
}

export interface PaymentReconciliationResultPatch {
  status: PaymentReconciliationVerdict;
  result: NormalizedReconciliationResult;
  matchedPaymentId?: string;
  reviewId?: string;
  updatedAt: string;
}

export interface PaymentReconciliationBatchStore {
  createIfAbsent(draft: PaymentReconciliationBatchDraft): Promise<
    | { kind: 'created'; batch: PaymentReconciliationBatchRecord }
    | { kind: 'duplicate'; batch: PaymentReconciliationBatchRecord }
  >;
  findById(batchId: string): Promise<PaymentReconciliationBatchRecord | null>;
  findByProviderAndKey(provider: string, idempotencyKey: string): Promise<PaymentReconciliationBatchRecord | null>;
  markStarted(batchId: string, timestamp: string): Promise<void>;
  refreshSummary(batchId: string, timestamp: string): Promise<PaymentReconciliationBatchRecord | null>;
  setLastError(batchId: string, error: string, timestamp: string): Promise<void>;
}

export interface PaymentReconciliationBatchItemStore {
  createMany(items: readonly PaymentReconciliationBatchItemDraft[]): Promise<void>;
  claimDue(input: PaymentReconciliationItemClaim): Promise<PaymentReconciliationBatchItemRecord[]>;
  complete(itemId: string, claimToken: string, patch: PaymentReconciliationResultPatch): Promise<PaymentReconciliationBatchItemRecord | null>;
  markProcessingFailure(input: {
    itemId: string;
    claimToken: string;
    error: string;
    retryAt: string;
    maxAttempts: number;
    updatedAt: string;
  }): Promise<PaymentReconciliationBatchItemRecord | null>;
  resetForRetry(batchId: string, timestamp: string): Promise<number>;
  findById(itemId: string): Promise<PaymentReconciliationBatchItemRecord | null>;
  markStale(itemId: string, staleBefore: string, timestamp: string, result: NormalizedReconciliationResult, reviewId: string, matchedPaymentId?: string): Promise<PaymentReconciliationBatchItemRecord | null>;
  listByBatch(batchId: string, limit: number, afterIndex?: number | null): Promise<PaymentReconciliationBatchItemRecord[]>;
}

export interface PaymentExternalSettlementStore {
  createIfAbsent(draft: PaymentExternalSettlementDraft): Promise<
    | { kind: 'created'; settlement: PaymentExternalSettlementRecord }
    | { kind: 'duplicate-transaction'; settlement: PaymentExternalSettlementRecord }
    | { kind: 'duplicate-reference'; settlement: PaymentExternalSettlementRecord }
  >;
  findByProviderAndExternalId(provider: string, externalTransactionId: string): Promise<PaymentExternalSettlementRecord | null>;
  findMatchedByPaymentId(paymentId: string): Promise<PaymentExternalSettlementRecord | null>;
  touch(settlementId: string, timestamp: string): Promise<void>;
  setReconciliationResult(input: {
    settlementId: string;
    status: PaymentReconciliationVerdict;
    matchedPaymentId?: string;
    reasons: readonly string[];
    timestamp: string;
  }): Promise<void>;
}

export interface PaymentReconciliationReviewStore {
  createIfAbsent(draft: PaymentReconciliationReviewDraft): Promise<PaymentReconciliationReviewRecord>;
  findById(reviewId: string): Promise<PaymentReconciliationReviewRecord | null>;
  findByIdForUpdate(reviewId: string): Promise<PaymentReconciliationReviewRecord | null>;
  decide(input: {
    reviewId: string;
    expected: 'OPEN';
    decision: Exclude<PaymentReconciliationReviewDecision, 'OPEN'>;
    actorId: string;
    decidedAt: string;
    decisionEvidence?: string;
    decisionNote?: string;
    updatedAt: string;
  }): Promise<PaymentReconciliationReviewRecord | null>;
  markEscalated(reviewId: string, timestamp: string): Promise<PaymentReconciliationReviewRecord | null>;
}

export interface PaymentReconciliationCorrectionAttemptDraft extends PaymentReconciliationCorrectionAttemptRecord {}

export interface PaymentReconciliationCorrectionAttemptStore {
  createIfAbsent(draft: PaymentReconciliationCorrectionAttemptDraft): Promise<PaymentReconciliationCorrectionAttemptRecord>;
  findByReviewAndKey(reviewId: string, idempotencyKey: string): Promise<PaymentReconciliationCorrectionAttemptRecord | null>;
}

export interface PaymentReconciliationMatchingStore {
  findCandidates(input: {
    provider: string;
    externalTransactionId: string;
    reference: string;
    limit: number;
  }): Promise<PaymentReconciliationPaymentCandidate[]>;
  /** Verrouille puis relit l'agrégat existant avant toute association MATCH. */
  findCandidateByIdForUpdate(paymentId: string): Promise<PaymentReconciliationPaymentCandidate | null>;
}

export interface PaymentReconciliationStores {
  batches: PaymentReconciliationBatchStore;
  items: PaymentReconciliationBatchItemStore;
  settlements: PaymentExternalSettlementStore;
  reviews: PaymentReconciliationReviewStore;
  correctionAttempts: PaymentReconciliationCorrectionAttemptStore;
  matching: PaymentReconciliationMatchingStore;
  audit: AuditLedgerStore;
  idempotency: DurableIdempotencyStore;
  outbox: DomainEventOutbox;
  jobs: ScheduledJobStore;
}
