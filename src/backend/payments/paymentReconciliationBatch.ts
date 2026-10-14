/**
 * P0-PAY-3 — rapprochement externe par batch, ledger immuable et revue ADMIN.
 *
 * Seuls des événements déjà normalisés entrent ici. Aucune API opérateur n'est
 * appelée, aucun payload brut n'est persisté et aucun statut Payment n'est
 * avancé par ce traitement. Les écritures de chaque item (règlement, résultat,
 * revue, audit) partagent une transaction; l'Outbox/Queue/jobs existants sont
 * utilisés pour le chemin worker et les reprises.
 */

import type { AuthenticatedActor, PageRequest } from '../productionContracts';
import {
  evaluateReconciliation,
  type NormalizedPaymentTransaction,
  type NormalizedReconciliationResult,
  type NormalizedTransactionStatus,
  type PaymentType,
} from '../../domain/paymentLifecycle';
import type { AutomationJob } from '../automation/records';
import { createDomainEvent } from '../automation/foundation';
import {
  PAYMENT_RECONCILIATION_BATCH_JOB,
  PAYMENT_RECONCILIATION_BATCH_REQUESTED_EVENT,
  PAYMENT_RECONCILIATION_RETRY_JOB,
  PAYMENT_RECONCILIATION_STALE_JOB,
  PAYMENT_REVIEW_ESCALATION_JOB,
} from '../automation/paymentReconciliationJobs';
import { newEntityId } from '../identity/ids';
import { sha256Fingerprint } from './paymentErrors';
import type {
  PaymentExternalSettlementDraft,
  PaymentReconciliationBatchItemDraft,
  PaymentReconciliationBatchRecord,
  PaymentReconciliationBatchStatus,
  PaymentReconciliationItemStatus,
  PaymentReconciliationPaymentCandidate,
  PaymentReconciliationReviewDecision,
  PaymentReconciliationReviewRecord,
  PaymentReconciliationCorrectionAttemptRecord,
  PaymentReconciliationStores,
  PaymentReconciliationVerdict,
} from '../persistence/paymentReconciliationRecords';

export const PAYMENT_RECONCILIATION_SOURCE = 'payment-reconciliation-batch:P0-PAY-3';
export const PAYMENT_RECONCILIATION_BATCH_COMMAND = 'payments.RECONCILE_BATCH';
export const PAYMENT_RECONCILIATION_RETRY_COMMAND = 'payments.RETRY_RECONCILIATION_BATCH';
export const PAYMENT_RECONCILIATION_REVIEW_COMMAND = 'payments.DECIDE_RECONCILIATION_REVIEW';
export const PAYMENT_RECONCILIATION_CORRECTION_COMMAND = 'payments.RECORD_RECONCILIATION_CORRECTION_ATTEMPT';
export const PAYMENT_RECONCILIATION_MAX_BATCH_ITEMS = 10_000;
export const PAYMENT_RECONCILIATION_CHUNK_SIZE = 100;
export const PAYMENT_RECONCILIATION_MAX_ITEM_ATTEMPTS = 5;
export const PAYMENT_RECONCILIATION_RETRY_DELAY_MS = 30_000;
const MAX_PROVIDER_LENGTH = 80;
const MAX_EXTERNAL_ID_LENGTH = 200;
const MAX_REFERENCE_LENGTH = 200;
const MAX_PARTY_LENGTH = 200;
const MAX_CURRENCY_LENGTH = 12;
const MAX_TIMESTAMP_LENGTH = 80;
const ALLOWED_TRANSACTION_STATUSES: readonly NormalizedTransactionStatus[] = [
  'PENDING', 'SUCCESS', 'FAILED', 'REJECTED', 'CANCELLED', 'UNKNOWN',
];

export type PaymentReconciliationErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_IMPLEMENTED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IN_PROGRESS'
  | 'CONFLICT';

export class PaymentReconciliationError extends Error {
  constructor(readonly code: PaymentReconciliationErrorCode, message: string) {
    super(message);
    this.name = 'PaymentReconciliationError';
  }
}

export interface PaymentReconciliationBatchReport {
  batch: PaymentReconciliationBatchRecord;
  items: readonly import('../persistence/paymentReconciliationRecords').PaymentReconciliationBatchItemRecord[];
  cursor: string | null;
  limit: number;
  hasMore: boolean;
  replayed?: boolean;
}

export interface PaymentReconciliationBatchCommand {
  provider: string;
  transactions: readonly unknown[];
  idempotencyKey: string;
  requestId?: string;
}

export interface PaymentReconciliationReviewDecisionInput {
  decision: Exclude<PaymentReconciliationReviewDecision, 'OPEN'>;
  evidence?: string;
  note?: string;
  idempotencyKey: string;
}

export interface PaymentReconciliationCorrectionAttemptInput {
  proposedChanges: Record<string, unknown>;
  evidenceReference?: string;
  note?: string;
  idempotencyKey: string;
}

export interface PaymentReconciliationBatchServiceDependencies {
  stores: PaymentReconciliationStores;
  /** Opération transactionnelle injectée par la composition Worker. */
  runInTransaction?: <T>(operation: (stores: PaymentReconciliationStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
  isProviderConfigured?: (providerId: string) => boolean;
  chunkSize?: number;
  maxBatchItems?: number;
  retryDelayMs?: number;
}

interface PreparedTransaction {
  readonly transaction: NormalizedPaymentTransaction | null;
  readonly normalizedMetadata: Record<string, unknown>;
  readonly validationReasons: readonly string[];
  readonly externalTransactionId?: string;
  readonly reference?: string;
}

interface ChunkResult {
  batch: PaymentReconciliationBatchRecord;
  claimed: number;
  retryable: number;
  nextRetryAt?: string;
}

function providerKey(value: string): string {
  return value.trim().toUpperCase();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeText(value: unknown, field: string, maxLength: number, reasons: string[]): string | undefined {
  if (typeof value !== 'string') {
    reasons.push(`Champ « ${field} » absent ou non textuel.`);
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    reasons.push(`Champ « ${field} » vide.`);
    return undefined;
  }
  if (normalized.length > maxLength) {
    reasons.push(`Champ « ${field} » dépasse la longueur maximale ${maxLength}.`);
    return normalized.slice(0, maxLength);
  }
  return normalized;
}

function prepareTransaction(raw: unknown, batchProvider: string): PreparedTransaction {
  const input = isPlainRecord(raw) ? raw : {};
  const reasons: string[] = [];
  if (!isPlainRecord(raw)) reasons.push('L’élément externe doit être un objet normalisé.');

  const incomingProvider = safeText(input.provider, 'provider', MAX_PROVIDER_LENGTH, reasons);
  const externalTransactionId = safeText(input.externalTransactionId, 'externalTransactionId', MAX_EXTERNAL_ID_LENGTH, reasons);
  const reference = safeText(input.reference, 'reference', MAX_REFERENCE_LENGTH, reasons);
  const currency = safeText(input.currency, 'currency', MAX_CURRENCY_LENGTH, reasons);
  const payer = safeText(input.payer, 'payer', MAX_PARTY_LENGTH, reasons);
  const recipient = safeText(input.recipient, 'recipient', MAX_PARTY_LENGTH, reasons);
  const occurredAt = safeText(input.occurredAt, 'occurredAt', MAX_TIMESTAMP_LENGTH, reasons);

  const rawAmount = input.amount;
  const amount = typeof rawAmount === 'number' && Number.isFinite(rawAmount) ? rawAmount : undefined;
  if (amount === undefined || amount <= 0 || amount > 999_999_999_999.99
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    reasons.push('Champ « amount » invalide : montant positif, fini et limité à deux décimales requis.');
  }

  const rawStatus = typeof input.status === 'string' ? input.status.trim().toUpperCase() : '';
  const status = (ALLOWED_TRANSACTION_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus as NormalizedTransactionStatus
    : undefined;
  if (!status) reasons.push('Champ « status » absent ou hors du domaine normalisé.');

  const inputProvider = incomingProvider ? providerKey(incomingProvider) : '';
  if (inputProvider && inputProvider !== batchProvider) {
    reasons.push(`Fournisseur de l’élément « ${inputProvider} » différent du fournisseur du lot « ${batchProvider} ».`);
  }

  // Métadonnées en liste blanche. Le `rawPayload` libre n'est jamais conservé,
  // même si l'adaptateur contient accidentellement un secret ou credential.
  const normalizedMetadata: Record<string, unknown> = {
    schemaVersion: 1,
    provider: inputProvider || null,
    externalTransactionId: externalTransactionId ?? null,
    reference: reference ?? null,
    amount: amount ?? null,
    currency: currency ?? null,
    payer: payer ?? null,
    recipient: recipient ?? null,
    occurredAt: occurredAt ?? null,
    status: status ?? (rawStatus || null),
  };

  const structurallyValid = reasons.length === 0
    && !!externalTransactionId && !!reference && amount !== undefined
    && !!currency && !!payer && !!recipient && !!occurredAt && !!status;
  const transaction: NormalizedPaymentTransaction | null = structurallyValid
    ? {
        provider: batchProvider,
        externalTransactionId: externalTransactionId!,
        reference: reference!,
        amount: amount!,
        currency: currency!,
        payer: payer!,
        recipient: recipient!,
        occurredAt: occurredAt!,
        status: status!,
      }
    : null;
  return {
    transaction,
    normalizedMetadata,
    validationReasons: reasons,
    ...(externalTransactionId ? { externalTransactionId } : {}),
    ...(reference ? { reference } : {}),
  };
}

function transactionMetadata(transaction: NormalizedPaymentTransaction): Record<string, unknown> {
  return {
    schemaVersion: 1,
    provider: transaction.provider,
    externalTransactionId: transaction.externalTransactionId,
    reference: transaction.reference,
    amount: transaction.amount,
    currency: transaction.currency,
    payer: transaction.payer,
    recipient: transaction.recipient,
    occurredAt: transaction.occurredAt,
    status: transaction.status,
  };
}

function sameNormalizedTransaction(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const fields = [
    'provider', 'externalTransactionId', 'reference', 'amount', 'currency',
    'payer', 'recipient', 'occurredAt', 'status',
  ];
  return fields.every(field => left[field] === right[field]);
}

function resultFor(
  input: {
    verdict: PaymentReconciliationVerdict;
    paymentId?: string;
    provider: string;
    externalTransactionId?: string;
    reference?: string;
    reasons: readonly string[];
    reconciledAt: string;
    transaction?: NormalizedPaymentTransaction;
  },
): NormalizedReconciliationResult {
  return {
    verdict: input.verdict,
    paymentId: input.paymentId ?? '',
    provider: input.provider,
    ...(input.externalTransactionId ? { externalTransactionId: input.externalTransactionId } : {}),
    ...(input.reference ? { reference: input.reference } : {}),
    comparisons: [],
    reasons: input.reasons,
    reconciledAt: input.reconciledAt,
    ...(input.transaction ? { externalTransaction: input.transaction } : {}),
  };
}

function resultAuditAction(verdict: PaymentReconciliationVerdict): string {
  switch (verdict) {
    case 'MATCH': return 'PAYMENT_RECONCILIATION_MATCHED';
    case 'MISMATCH': return 'PAYMENT_RECONCILIATION_MISMATCH';
    case 'NOT_FOUND': return 'PAYMENT_RECONCILIATION_NOT_FOUND';
    case 'DUPLICATE': return 'PAYMENT_RECONCILIATION_DUPLICATE';
    case 'REVIEW_REQUIRED': return 'PAYMENT_RECONCILIATION_REVIEW_REQUIRED';
  }
}

function requireAdmin(actor: AuthenticatedActor, permission: 'payments:read:any' | 'payments:approve'): void {
  if (actor.role !== 'ADMIN' || !actor.id || !actor.sessionId || !actor.permissions.includes(permission)) {
    throw new PaymentReconciliationError('FORBIDDEN', `Action réservée à ADMIN avec permission ${permission}.`);
  }
}

function idempotencyKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 128) throw new PaymentReconciliationError('VALIDATION', 'Clé d’idempotence absente ou trop longue.');
  return key;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? 'erreur inconnue')).slice(0, 500);
}

function safeDecisionText(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length > 1000) throw new PaymentReconciliationError('VALIDATION', `Le champ « ${field} » dépasse 1000 caractères.`);
  return normalized || undefined;
}

function normalizeCorrectionChanges(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new PaymentReconciliationError('VALIDATION', 'proposedChanges doit être un objet normalisé.');
  const allowed = new Set(['reference', 'amount', 'currency', 'payer', 'recipient', 'occurredAt', 'status']);
  const changes: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(value)) {
    if (!allowed.has(field)) throw new PaymentReconciliationError('VALIDATION', `Champ de correction non autorisé : ${field}.`);
    if (field === 'amount') {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || raw > 999_999_999_999.99
        || Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-7) {
        throw new PaymentReconciliationError('VALIDATION', 'Montant de correction invalide (positif, fini, deux décimales maximum).');
      }
      changes.amount = raw;
      continue;
    }
    if (field === 'status') {
      const status = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
      if (!(ALLOWED_TRANSACTION_STATUSES as readonly string[]).includes(status)) {
        throw new PaymentReconciliationError('VALIDATION', 'Statut de correction hors domaine normalisé.');
      }
      changes.status = status;
      continue;
    }
    if (typeof raw !== 'string') throw new PaymentReconciliationError('VALIDATION', `Champ de correction « ${field} » doit être textuel.`);
    const text = raw.trim();
    const maxLength = field === 'currency' ? MAX_CURRENCY_LENGTH : field === 'occurredAt' ? MAX_TIMESTAMP_LENGTH : MAX_PARTY_LENGTH;
    if (!text || text.length > maxLength) throw new PaymentReconciliationError('VALIDATION', `Champ de correction « ${field} » vide ou trop long.`);
    if (field === 'currency') changes.currency = text.toUpperCase();
    else if (field === 'occurredAt') {
      if (!Number.isFinite(Date.parse(text))) throw new PaymentReconciliationError('VALIDATION', 'Date de correction illisible.');
      changes.occurredAt = text;
    } else changes[field] = text;
  }
  if (Object.keys(changes).length === 0) throw new PaymentReconciliationError('VALIDATION', 'Au moins un champ normalisé doit être proposé.');
  return changes;
}

function commandHash(input: unknown): Promise<string> {
  return sha256Fingerprint(input);
}

export class PaymentReconciliationBatchService {
  private readonly stores: PaymentReconciliationStores;
  private readonly clock: () => Date;
  private readonly chunkSize: number;
  private readonly maxBatchItems: number;
  private readonly retryDelayMs: number;
  private readonly runInTransaction: <T>(operation: (stores: PaymentReconciliationStores) => Promise<T>) => Promise<T>;
  private readonly isProviderConfigured: (providerId: string) => boolean;

  constructor(dependencies: PaymentReconciliationBatchServiceDependencies) {
    this.stores = dependencies.stores;
    this.clock = dependencies.now ?? (() => new Date());
    this.chunkSize = Math.min(Math.max(Math.trunc(dependencies.chunkSize ?? PAYMENT_RECONCILIATION_CHUNK_SIZE), 1), 200);
    this.maxBatchItems = Math.min(Math.max(Math.trunc(dependencies.maxBatchItems ?? PAYMENT_RECONCILIATION_MAX_BATCH_ITEMS), 1), PAYMENT_RECONCILIATION_MAX_BATCH_ITEMS);
    this.retryDelayMs = Math.max(Math.trunc(dependencies.retryDelayMs ?? PAYMENT_RECONCILIATION_RETRY_DELAY_MS), 0);
    this.isProviderConfigured = dependencies.isProviderConfigured ?? (provider => provider === 'TEST_GATEWAY');
    this.runInTransaction = dependencies.runInTransaction
      ?? (async operation => operation(this.stores));
  }

  async reconcileBatch(actor: AuthenticatedActor, command: PaymentReconciliationBatchCommand): Promise<PaymentReconciliationBatchReport> {
    requireAdmin(actor, 'payments:read:any');
    const provider = typeof command.provider === 'string' ? providerKey(command.provider) : '';
    if (!provider || provider.length > MAX_PROVIDER_LENGTH) {
      throw new PaymentReconciliationError('VALIDATION', 'Identifiant provider absent ou invalide.');
    }
    if (!this.isProviderConfigured(provider)) {
      throw new PaymentReconciliationError(
        'NOT_IMPLEMENTED',
        `Aucun adaptateur configuré pour ${provider}; seuls les fournisseurs explicitement injectés peuvent recevoir un batch.`,
      );
    }
    if (!Array.isArray(command.transactions)) {
      throw new PaymentReconciliationError('VALIDATION', 'Le batch exige une liste `transactions`.');
    }
    if (command.transactions.length > this.maxBatchItems) {
      throw new PaymentReconciliationError('VALIDATION', `Un batch ne peut pas dépasser ${this.maxBatchItems} éléments.`);
    }
    const key = idempotencyKey(command.idempotencyKey);
    const prepared = command.transactions.map(transaction => prepareTransaction(transaction, provider));
    const payloadHash = await commandHash({
      provider,
      transactions: prepared.map(item => ({
        normalizedMetadata: item.normalizedMetadata,
        validationReasons: item.validationReasons,
      })),
    });
    const timestamp = this.clock().toISOString();
    let batch: PaymentReconciliationBatchRecord;
    let replayed = false;

    try {
      const result = await this.runInTransaction(async current => {
        const created = await current.batches.createIfAbsent({
          batchId: newEntityId('prb'),
          provider,
          idempotencyKey: key,
          payloadHash,
          requestedBy: actor.id,
          totalItems: prepared.length,
          createdAt: timestamp,
        });
        if (created.kind === 'duplicate') {
          if (created.batch.payloadHash !== payloadHash) {
            throw new PaymentReconciliationError('IDEMPOTENCY_CONFLICT', 'Cette clé de batch a déjà été utilisée avec un contenu normalisé différent.');
          }
          return { batch: created.batch, created: false };
        }

        const drafts: PaymentReconciliationBatchItemDraft[] = prepared.map((item, itemIndex) => ({
          itemId: `${created.batch.batchId}_item_${itemIndex}`,
          batchId: created.batch.batchId,
          itemIndex,
          provider,
          ...(item.externalTransactionId ? { externalTransactionId: item.externalTransactionId } : {}),
          ...(item.reference ? { reference: item.reference } : {}),
          normalizedMetadata: item.normalizedMetadata,
          validationReasons: item.validationReasons,
          nextAttemptAt: timestamp,
          createdAt: timestamp,
        }));
        await current.items.createMany(drafts);
        const event = createDomainEvent({
          eventId: `evt_payment_reconciliation_batch_${created.batch.batchId}`,
          eventType: PAYMENT_RECONCILIATION_BATCH_REQUESTED_EVENT,
          aggregateType: 'payment-reconciliation-batch',
          aggregateId: created.batch.batchId,
          actorId: actor.id,
          timestamp,
          payload: { batchId: created.batch.batchId, provider, itemCount: prepared.length },
          source: PAYMENT_RECONCILIATION_SOURCE,
          correlationId: command.requestId,
        });
        await current.outbox.append(event);
        await current.audit.append({
          id: `audit_payment_reconciliation_batch_${created.batch.batchId}`.slice(0, 120),
          actorId: actor.id,
          timestamp,
          entityId: created.batch.batchId,
          action: 'PAYMENT_RECONCILIATION_BATCH_QUEUED',
          source: PAYMENT_RECONCILIATION_SOURCE,
          reference: key,
          afterState: {
            provider,
            totalItems: prepared.length,
            status: 'PENDING',
            normalizedPayloadHash: payloadHash,
            movedFunds: false,
          },
        });
        return { batch: created.batch, created: true };
      });
      batch = result.batch;
      replayed = !result.created;
    } catch (error) {
      if (error instanceof PaymentReconciliationError) throw error;
      throw error;
    }

    // L'appel ADMIN traite immédiatement UNE fenêtre bornée (au plus 100 items),
    // tout en laissant l'événement Outbox disponible pour le worker. Les chunks
    // restants sont repris par la file persistée; un rejeu ne double aucun effet.
    const processed = replayed
      ? { batch }
      : await this.processBatchChunkSafely(batch.batchId);
    batch = processed.batch;
    const page = await this.getBatchPage(batch.batchId, { cursor: null, limit: 100 });
    return { ...page, ...(replayed ? { replayed: true } : {}) };
  }

  async retryBatch(
    actor: AuthenticatedActor,
    batchId: string,
    keyValue: string,
    requestId?: string,
  ): Promise<PaymentReconciliationBatchReport> {
    requireAdmin(actor, 'payments:read:any');
    const key = idempotencyKey(keyValue);
    const timestamp = this.clock().toISOString();
    const payloadHash = await commandHash({ batchId, action: 'RETRY_RECONCILIATION_BATCH' });
    const reservation = await this.runInTransaction(async current => {
      const batch = await current.batches.findById(batchId);
      if (!batch) throw new PaymentReconciliationError('NOT_FOUND', 'Lot de rapprochement introuvable.');
      const idempotency = await current.idempotency.reserve({
        actorId: actor.id,
        command: PAYMENT_RECONCILIATION_RETRY_COMMAND,
        key,
        payloadHash,
      });
      if (idempotency.kind === 'conflict') throw new PaymentReconciliationError('IDEMPOTENCY_CONFLICT', 'Clé de reprise déjà utilisée avec une autre commande.');
      if (idempotency.kind === 'in-progress') throw new PaymentReconciliationError('IN_PROGRESS', 'Une reprise de ce lot est déjà en cours.');
      if (idempotency.kind === 'replay') return { batch, replayed: true };
      const resetItems = await current.items.resetForRetry(batchId, timestamp);
      if (resetItems === 0) throw new PaymentReconciliationError('CONFLICT', 'Aucun item FAILED/RETRYABLE disponible pour une reprise.');
      await current.batches.refreshSummary(batchId, timestamp);
      await current.audit.append({
        id: `audit_payment_reconciliation_retry_${batchId}_${key}`.slice(0, 120),
        actorId: actor.id,
        timestamp,
        entityId: batchId,
        action: 'PAYMENT_RECONCILIATION_BATCH_RETRY_REQUESTED',
        source: PAYMENT_RECONCILIATION_SOURCE,
        reference: key,
        afterState: { batchId, requestId: requestId ?? null, movedFunds: false },
      });
      await current.idempotency.complete(actor.id, PAYMENT_RECONCILIATION_RETRY_COMMAND, key, { batchId, accepted: true });
      return { batch, replayed: false };
    });
    const processed = reservation.replayed
      ? { batch: reservation.batch }
      : await this.processBatchChunkSafely(batchId);
    if (!reservation.replayed && processed.batch.pendingItems > 0) {
      await this.scheduleBatchJob(
        processed.batch.batchId,
        PAYMENT_RECONCILIATION_BATCH_JOB,
        this.clock().toISOString(),
        `manual-continue:${processed.batch.processedItems}`,
      );
    }
    const page = await this.getBatchPage(processed.batch.batchId, { cursor: null, limit: 100 });
    return { ...page, ...(reservation.replayed ? { replayed: true } : {}) };
  }

  async getBatch(actor: AuthenticatedActor, batchId: string, page: PageRequest = { cursor: null, limit: 100 }): Promise<PaymentReconciliationBatchReport> {
    requireAdmin(actor, 'payments:read:any');
    return this.getBatchPage(batchId, page);
  }

  private async getBatchPage(batchId: string, page: PageRequest): Promise<PaymentReconciliationBatchReport> {
    const batch = await this.stores.batches.findById(batchId);
    if (!batch) throw new PaymentReconciliationError('NOT_FOUND', 'Lot de rapprochement introuvable.');
    let afterIndex: number | null = null;
    if (page.cursor !== null) {
      if (!/^\d+$/.test(page.cursor) || !Number.isSafeInteger(Number(page.cursor))) {
        throw new PaymentReconciliationError('VALIDATION', 'Curseur d’éléments de batch invalide.');
      }
      afterIndex = Number(page.cursor);
    }
    const limit = Math.min(Math.max(Math.trunc(page.limit), 1), 100);
    const items = await this.stores.items.listByBatch(batchId, limit + 1, afterIndex);
    const hasMore = items.length > limit;
    const visible = items.slice(0, limit);
    return {
      batch,
      items: visible,
      cursor: hasMore && visible.length > 0 ? String(visible[visible.length - 1].itemIndex) : null,
      limit,
      hasMore,
    };
  }

  async decideReview(
    actor: AuthenticatedActor,
    reviewId: string,
    input: PaymentReconciliationReviewDecisionInput,
  ): Promise<{ review: PaymentReconciliationReviewRecord; replayed?: boolean }> {
    requireAdmin(actor, 'payments:approve');
    if (input.decision !== 'CONFIRMED' && input.decision !== 'REJECTED') {
      throw new PaymentReconciliationError('VALIDATION', 'La décision doit être CONFIRMED ou REJECTED.');
    }
    const key = idempotencyKey(input.idempotencyKey);
    const evidence = safeDecisionText(input.evidence, 'evidence');
    const note = safeDecisionText(input.note, 'note');
    const timestamp = this.clock().toISOString();
    const payloadHash = await commandHash({ reviewId, decision: input.decision, evidence, note });
    return this.runInTransaction(async current => {
      const reservation = await current.idempotency.reserve({
        actorId: actor.id,
        command: PAYMENT_RECONCILIATION_REVIEW_COMMAND,
        key,
        payloadHash,
      });
      if (reservation.kind === 'conflict') throw new PaymentReconciliationError('IDEMPOTENCY_CONFLICT', 'Clé de décision de revue déjà utilisée avec un contenu différent.');
      if (reservation.kind === 'in-progress') throw new PaymentReconciliationError('IN_PROGRESS', 'Cette décision ADMIN est déjà en cours.');
      if (reservation.kind === 'replay') {
        const replayed = await current.reviews.findById(reviewId);
        if (!replayed) throw new PaymentReconciliationError('NOT_FOUND', 'Revue de rapprochement introuvable.');
        return { review: replayed, replayed: true };
      }

      const review = await current.reviews.findByIdForUpdate(reviewId);
      if (!review) throw new PaymentReconciliationError('NOT_FOUND', 'Revue de rapprochement introuvable.');
      if (review.decision !== 'OPEN') {
        if (review.decision !== input.decision) {
          throw new PaymentReconciliationError('CONFLICT', `Cette revue est déjà décidée « ${review.decision} ».`);
        }
        await current.idempotency.complete(actor.id, PAYMENT_RECONCILIATION_REVIEW_COMMAND, key, { reviewId, decision: review.decision });
        return { review, replayed: true };
      }

      const updated = await current.reviews.decide({
        reviewId,
        expected: 'OPEN',
        decision: input.decision,
        actorId: actor.id,
        decidedAt: timestamp,
        ...(evidence ? { decisionEvidence: evidence } : {}),
        ...(note ? { decisionNote: note } : {}),
        updatedAt: timestamp,
      });
      if (!updated) throw new PaymentReconciliationError('CONFLICT', 'Une décision concurrente a déjà fermé cette revue.');
      await current.audit.append({
        id: `audit_payment_review_${reviewId}_${input.decision}`.slice(0, 120),
        actorId: actor.id,
        timestamp,
        entityId: updated.paymentId ?? reviewId,
        action: input.decision === 'CONFIRMED'
          ? 'PAYMENT_RECONCILIATION_REVIEW_CONFIRMED'
          : 'PAYMENT_RECONCILIATION_REVIEW_REJECTED',
        source: PAYMENT_RECONCILIATION_SOURCE,
        reference: reviewId,
        beforeState: { decision: 'OPEN', reason: review.reason },
        afterState: {
          reviewId,
          paymentId: updated.paymentId ?? null,
          decision: updated.decision,
          evidenceReference: updated.evidenceReference ?? null,
          decisionEvidence: updated.decisionEvidence ?? null,
          decisionNote: updated.decisionNote ?? null,
          actorId: actor.id,
          movedFunds: false,
          paymentStatusChanged: false,
        },
      });
      await current.idempotency.complete(actor.id, PAYMENT_RECONCILIATION_REVIEW_COMMAND, key, { reviewId, decision: updated.decision });
      return { review: updated };
    });
  }

  /**
   * Enregistre une proposition normalisée de correction sans appliquer de
   * changement aux données externes ni au Payment. L'application éventuelle
   * passe par une nouvelle transaction externe autorisée hors de cette tranche.
   */
  async recordCorrectionAttempt(
    actor: AuthenticatedActor,
    reviewId: string,
    input: PaymentReconciliationCorrectionAttemptInput,
  ): Promise<{ correctionAttempt: PaymentReconciliationCorrectionAttemptRecord; replayed?: boolean }> {
    requireAdmin(actor, 'payments:approve');
    const key = idempotencyKey(input.idempotencyKey);
    const proposedChanges = normalizeCorrectionChanges(input.proposedChanges);
    const evidenceReference = safeDecisionText(input.evidenceReference, 'evidenceReference');
    if (evidenceReference && evidenceReference.length > 256) {
      throw new PaymentReconciliationError('VALIDATION', 'La référence de preuve dépasse 256 caractères.');
    }
    const note = safeDecisionText(input.note, 'note');
    const payloadHash = await commandHash({ reviewId, proposedChanges, evidenceReference, note });
    const timestamp = this.clock().toISOString();

    return this.runInTransaction(async current => {
      const reservation = await current.idempotency.reserve({
        actorId: actor.id,
        command: PAYMENT_RECONCILIATION_CORRECTION_COMMAND,
        key,
        payloadHash,
      });
      if (reservation.kind === 'conflict') throw new PaymentReconciliationError('IDEMPOTENCY_CONFLICT', 'Clé de tentative de correction déjà utilisée avec un contenu différent.');
      if (reservation.kind === 'in-progress') throw new PaymentReconciliationError('IN_PROGRESS', 'Cette tentative de correction est déjà en cours.');
      if (reservation.kind === 'replay') {
        const replayed = await current.correctionAttempts.findByReviewAndKey(reviewId, key);
        if (!replayed) throw new PaymentReconciliationError('NOT_FOUND', 'Tentative de correction idempotente introuvable.');
        return { correctionAttempt: replayed, replayed: true };
      }

      const review = await current.reviews.findByIdForUpdate(reviewId);
      if (!review) throw new PaymentReconciliationError('NOT_FOUND', 'Revue de rapprochement introuvable.');
      if (review.decision !== 'OPEN') throw new PaymentReconciliationError('CONFLICT', 'La revue est déjà décidée; aucune nouvelle tentative de correction ne peut y être ajoutée.');
      const correctionAttempt = await current.correctionAttempts.createIfAbsent({
        correctionAttemptId: newEntityId('cor'),
        reviewId,
        batchId: review.batchId,
        itemId: review.itemId,
        ...(review.paymentId ? { paymentId: review.paymentId } : {}),
        attemptedBy: actor.id,
        idempotencyKey: key,
        proposedChanges,
        ...(evidenceReference ? { evidenceReference } : {}),
        ...(note ? { note } : {}),
        status: 'RECORDED',
        createdAt: timestamp,
      });
      await current.audit.append({
        id: `audit_payment_correction_${correctionAttempt.correctionAttemptId}`.slice(0, 120),
        actorId: actor.id,
        timestamp,
        entityId: correctionAttempt.paymentId ?? correctionAttempt.itemId,
        action: 'PAYMENT_RECONCILIATION_CORRECTION_ATTEMPT_RECORDED',
        source: PAYMENT_RECONCILIATION_SOURCE,
        reference: reviewId,
        afterState: {
          reviewId,
          correctionAttemptId: correctionAttempt.correctionAttemptId,
          proposedChanges: correctionAttempt.proposedChanges,
          evidenceReference: correctionAttempt.evidenceReference ?? null,
          note: correctionAttempt.note ?? null,
          status: correctionAttempt.status,
          applied: false,
          movedFunds: false,
          paymentStatusChanged: false,
        },
      });
      await current.idempotency.complete(actor.id, PAYMENT_RECONCILIATION_CORRECTION_COMMAND, key, {
        reviewId,
        correctionAttemptId: correctionAttempt.correctionAttemptId,
        applied: false,
      });
      return { correctionAttempt };
    });
  }

  /**
   * Les délais sont explicitement fournis par l'exploitant; aucun SLA n'est
   * inventé. Ces jobs vivent dans automation_jobs (même moteur, même claim).
   */
  async scheduleReviewEscalation(actor: AuthenticatedActor, reviewId: string, dueAt: string): Promise<void> {
    requireAdmin(actor, 'payments:approve');
    const review = await this.stores.reviews.findById(reviewId);
    if (!review) throw new PaymentReconciliationError('NOT_FOUND', 'Revue de rapprochement introuvable.');
    const due = Date.parse(dueAt);
    if (!Number.isFinite(due)) throw new PaymentReconciliationError('VALIDATION', 'Date d’escalade invalide.');
    await this.runInTransaction(async current => {
      await current.jobs.createIfAbsent({
        jobId: `job_pay_review_escalation_${reviewId}`.slice(0, 120),
        jobType: PAYMENT_REVIEW_ESCALATION_JOB,
        aggregateType: 'payment-reconciliation-review',
        aggregateId: reviewId,
        dueAt: new Date(due).toISOString(),
        idempotencyKey: `payment-review-escalation:${reviewId}`,
        reference: reviewId,
        createdAt: this.clock().toISOString(),
      });
      await current.audit.append({
        id: `audit_payment_review_escalation_scheduled_${reviewId}`.slice(0, 120),
        actorId: actor.id,
        timestamp: this.clock().toISOString(),
        entityId: review.paymentId ?? reviewId,
        action: 'PAYMENT_RECONCILIATION_REVIEW_ESCALATION_SCHEDULED',
        source: PAYMENT_RECONCILIATION_SOURCE,
        reference: reviewId,
        afterState: { reviewId, dueAt: new Date(due).toISOString(), movedFunds: false, notificationsSent: false },
      });
    });
  }

  async scheduleStaleItemCheck(actor: AuthenticatedActor, itemId: string, dueAt: string): Promise<void> {
    requireAdmin(actor, 'payments:approve');
    const item = await this.stores.items.findById(itemId);
    if (!item) throw new PaymentReconciliationError('NOT_FOUND', 'Élément de rapprochement introuvable.');
    const due = Date.parse(dueAt);
    if (!Number.isFinite(due)) throw new PaymentReconciliationError('VALIDATION', 'Date de vérification stale invalide.');
    await this.runInTransaction(async current => {
      await current.jobs.createIfAbsent({
        jobId: `job_payment_reconciliation_stale_${itemId}`.slice(0, 120),
        jobType: PAYMENT_RECONCILIATION_STALE_JOB,
        aggregateType: 'payment-reconciliation-item',
        aggregateId: itemId,
        dueAt: new Date(due).toISOString(),
        idempotencyKey: `payment-reconciliation-stale:${itemId}`,
        reference: itemId,
        createdAt: this.clock().toISOString(),
      });
      await current.audit.append({
        id: `audit_payment_reconciliation_stale_scheduled_${itemId}`.slice(0, 120),
        actorId: actor.id,
        timestamp: this.clock().toISOString(),
        entityId: item.matchedPaymentId ?? item.itemId,
        action: 'PAYMENT_RECONCILIATION_STALE_CHECK_SCHEDULED',
        source: PAYMENT_RECONCILIATION_SOURCE,
        reference: itemId,
        afterState: { itemId, dueAt: new Date(due).toISOString(), movedFunds: false },
      });
    });
  }

  /** Worker: un item est revu sans mouvement si une échéance explicite le déclare stale. */
  async processAutomationJob(job: AutomationJob, nowValue: Date = this.clock()): Promise<void> {
    const reference = job.reference?.trim() || job.target.aggregateId;
    if (job.jobType === PAYMENT_RECONCILIATION_BATCH_JOB || job.jobType === PAYMENT_RECONCILIATION_RETRY_JOB) {
      const batchId = job.target.aggregateId;
      const batch = await this.stores.batches.findById(batchId);
      if (!batch) throw new PaymentReconciliationError('NOT_FOUND', `Lot ${batchId} introuvable pour le job.`);
      if (batch.status === 'COMPLETED' || batch.status === 'FAILED') return;
      const chunk = await this.processBatchChunk(batchId);
      const latest = chunk.batch;
      if (latest.retryableItems > 0) {
        const retryAt = chunk.nextRetryAt ?? new Date(nowValue.getTime() + this.retryDelayMs).toISOString();
        await this.scheduleBatchJob(latest.batchId, PAYMENT_RECONCILIATION_RETRY_JOB, retryAt, `retry:${retryAt}`);
      } else if (latest.pendingItems > 0) {
        await this.scheduleBatchJob(latest.batchId, PAYMENT_RECONCILIATION_BATCH_JOB, nowValue.toISOString(), `continue:${latest.processedItems}`);
      }
      return;
    }
    if (job.jobType === PAYMENT_REVIEW_ESCALATION_JOB) {
      await this.processReviewEscalation(reference, nowValue.toISOString());
      return;
    }
    if (job.jobType === PAYMENT_RECONCILIATION_STALE_JOB) {
      await this.processStaleItem(reference, job.dueAt, nowValue.toISOString());
      return;
    }
    throw new PaymentReconciliationError('VALIDATION', `Type de job paiement inconnu: ${job.jobType}.`);
  }

  private async scheduleBatchJob(batchId: string, jobType: string, dueAt: string, suffix: string): Promise<void> {
    await this.runInTransaction(current =>
      this.scheduleBatchJobInStores(current, batchId, jobType, dueAt, suffix));
  }

  private async scheduleBatchJobInStores(
    current: PaymentReconciliationStores,
    batchId: string,
    jobType: string,
    dueAt: string,
    suffix: string,
  ): Promise<void> {
    const key = `payment-reconciliation:${batchId}:${suffix}`;
    const id = `job_${jobType.toLowerCase()}_${batchId}_${suffix.replace(/[^a-z0-9]/gi, '_')}`.slice(0, 120);
    await current.jobs.createIfAbsent({
      jobId: id,
      jobType,
      aggregateType: 'payment-reconciliation-batch',
      aggregateId: batchId,
      dueAt,
      idempotencyKey: key,
      reference: batchId,
      createdAt: this.clock().toISOString(),
    });
  }

  private async processReviewEscalation(reviewId: string, timestamp: string): Promise<void> {
    await this.runInTransaction(async current => {
      const review = await current.reviews.markEscalated(reviewId, timestamp);
      if (!review) return;
      await current.audit.append({
        id: `audit_payment_review_escalated_${reviewId}`.slice(0, 120),
        actorId: 'SYSTEM',
        timestamp,
        entityId: review.paymentId ?? reviewId,
        action: 'PAYMENT_RECONCILIATION_REVIEW_ESCALATED',
        source: PAYMENT_RECONCILIATION_SOURCE,
        reference: reviewId,
        afterState: { reviewId, reason: review.reason, escalatedAt: timestamp, notificationsSent: false, movedFunds: false },
      });
    });
  }

  private async processStaleItem(itemId: string, staleBefore: string, timestamp: string): Promise<void> {
    await this.runInTransaction(async current => {
      const item = await current.items.findById(itemId);
      if (!item) return;
      const result = resultFor({
        verdict: 'REVIEW_REQUIRED',
        ...(item.matchedPaymentId ? { paymentId: item.matchedPaymentId } : {}),
        provider: item.provider,
        ...(item.externalTransactionId ? { externalTransactionId: item.externalTransactionId } : {}),
        ...(item.reference ? { reference: item.reference } : {}),
        reasons: [`Élément de réconciliation stale : il est resté ${item.status} au-delà de ${staleBefore}.`],
        reconciledAt: timestamp,
      });
      const reviewId = newEntityId('rev');
      const changed = await current.items.markStale(itemId, staleBefore, timestamp, result, reviewId, item.matchedPaymentId);
      if (!changed) return;
      const review = await current.reviews.createIfAbsent({
        reviewId,
        batchId: item.batchId,
        itemId,
        ...(item.matchedPaymentId ? { paymentId: item.matchedPaymentId } : {}),
        reason: result.reasons.join(' '),
        ...(item.reference ? { evidenceReference: item.reference } : {}),
        openedBy: 'SYSTEM',
        openedAt: timestamp,
        createdAt: timestamp,
      });
      await current.audit.append({
        id: `audit_payment_reconciliation_item_stale_${itemId}`.slice(0, 120),
        actorId: 'SYSTEM',
        timestamp,
        entityId: item.matchedPaymentId ?? itemId,
        action: 'PAYMENT_RECONCILIATION_ITEM_STALE',
        source: PAYMENT_RECONCILIATION_SOURCE,
        reference: review.reviewId,
        beforeState: { status: item.status },
        afterState: { status: 'REVIEW_REQUIRED', reviewId: review.reviewId, reasons: result.reasons, movedFunds: false },
      });
      await current.batches.refreshSummary(item.batchId, timestamp);
    });
  }

  private async processBatchChunkSafely(batchId: string): Promise<ChunkResult> {
    try {
      return await this.processBatchChunk(batchId);
    } catch (error) {
      const timestamp = this.clock().toISOString();
      const message = errorText(error);
      const batch = await this.runInTransaction(async current => {
        await current.batches.setLastError(batchId, message, timestamp);
        return await current.batches.refreshSummary(batchId, timestamp);
      }).catch(() => null);
      if (!batch) throw error;
      return { batch, claimed: 0, retryable: 0 };
    }
  }

  private async processBatchChunk(batchId: string): Promise<ChunkResult> {
    const timestamp = this.clock().toISOString();
    const claimToken = newEntityId('clm');
    const claimed = await this.runInTransaction(async current => {
      const batch = await current.batches.findById(batchId);
      if (!batch) throw new PaymentReconciliationError('NOT_FOUND', 'Lot de rapprochement introuvable.');
      await current.batches.markStarted(batchId, timestamp);
      return current.items.claimDue({ batchId, limit: this.chunkSize, claimToken, now: timestamp });
    });

    let retryable = 0;
    let nextRetryAt: string | undefined;
    for (const item of claimed) {
      try {
        await this.runInTransaction(current => this.reconcileClaimedItem(current, item, claimToken));
      } catch (error) {
        const failedAt = this.clock().toISOString();
        const retryAt = new Date(Date.parse(failedAt) + this.retryDelayMs).toISOString();
        const message = errorText(error);
        const failure = await this.runInTransaction(async current => {
          const updated = await current.items.markProcessingFailure({
            itemId: item.itemId,
            claimToken,
            error: message,
            retryAt,
            maxAttempts: PAYMENT_RECONCILIATION_MAX_ITEM_ATTEMPTS,
            updatedAt: failedAt,
          });
          if (updated) {
            if (updated.status === 'RETRYABLE') {
              await this.scheduleBatchJobInStores(
                current,
                updated.batchId,
                PAYMENT_RECONCILIATION_RETRY_JOB,
                retryAt,
                `retry:${retryAt}`,
              );
            }
            await current.audit.append({
              id: `audit_payment_reconciliation_retry_${item.itemId}_${updated.attempts}`.slice(0, 120),
              actorId: 'SYSTEM',
              timestamp: failedAt,
              entityId: updated.matchedPaymentId ?? updated.itemId,
              action: updated.status === 'FAILED'
                ? 'PAYMENT_RECONCILIATION_ITEM_FAILED'
                : 'PAYMENT_RECONCILIATION_ITEM_RETRYABLE',
              source: PAYMENT_RECONCILIATION_SOURCE,
              reference: updated.batchId,
              afterState: { itemId: item.itemId, status: updated.status, attempts: updated.attempts, lastError: message, movedFunds: false },
            });
            await current.batches.setLastError(item.batchId, message, failedAt);
          }
          return updated;
        });
        if (failure?.status === 'RETRYABLE') {
          retryable += 1;
          nextRetryAt = nextRetryAt ? (nextRetryAt < retryAt ? nextRetryAt : retryAt) : retryAt;
        }
      }
    }

    const updatedBatch = await this.runInTransaction(async current => {
      const summary = await current.batches.refreshSummary(batchId, this.clock().toISOString());
      if (!summary) throw new PaymentReconciliationError('NOT_FOUND', 'Lot de rapprochement introuvable après traitement.');
      return summary;
    });
    return { batch: updatedBatch, claimed: claimed.length, retryable, ...(nextRetryAt ? { nextRetryAt } : {}) };
  }

  private async reconcileClaimedItem(
    current: PaymentReconciliationStores,
    item: import('../persistence/paymentReconciliationRecords').PaymentReconciliationBatchItemRecord,
    claimToken: string,
  ): Promise<void> {
    const timestamp = this.clock().toISOString();
    const batch = await current.batches.findById(item.batchId);
    if (!batch) throw new PaymentReconciliationError('NOT_FOUND', 'Lot de rapprochement introuvable pour l’élément.');
    const metadata = item.normalizedMetadata;
    const transaction = this.transactionFromMetadata(item.provider, metadata);

    if (item.validationReasons.length > 0 || !transaction) {
      const reasons = item.validationReasons.length > 0
        ? item.validationReasons
        : ['Élément normalisé incomplet; une revue ADMIN est requise.'];
      const result = resultFor({
        verdict: 'REVIEW_REQUIRED',
        provider: item.provider,
        ...(item.externalTransactionId ? { externalTransactionId: item.externalTransactionId } : {}),
        ...(item.reference ? { reference: item.reference } : {}),
        reasons,
        reconciledAt: timestamp,
      });
      await this.finishItemWithReview(current, item, claimToken, result, timestamp);
      return;
    }

    const settlementDraft: PaymentExternalSettlementDraft = {
      settlementId: newEntityId('set'),
      provider: transaction.provider,
      externalTransactionId: transaction.externalTransactionId,
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      payer: transaction.payer,
      recipient: transaction.recipient,
      occurredAt: transaction.occurredAt,
      transactionStatus: transaction.status,
      normalizedMetadata: transactionMetadata(transaction),
      firstSeenAt: timestamp,
      createdAt: timestamp,
    };
    const settlement = await current.settlements.createIfAbsent(settlementDraft);
    if (settlement.kind !== 'created') {
      await current.settlements.touch(settlement.settlement.settlementId, timestamp);
      const sameTransaction = settlement.kind === 'duplicate-transaction'
        && sameNormalizedTransaction(settlement.settlement.normalizedMetadata, settlementDraft.normalizedMetadata);
      const reason = settlement.kind === 'duplicate-reference'
        ? `La référence « ${transaction.reference} » est déjà portée par la transaction externe « ${settlement.settlement.externalTransactionId} » du fournisseur ${transaction.provider}.`
        : sameTransaction
          ? `La transaction externe ${transaction.externalTransactionId} du fournisseur ${transaction.provider} a déjà été reçue; aucune seconde association n’est créée.`
          : `Le même identifiant externe ${transaction.externalTransactionId} a été reçu avec des données normalisées différentes; le premier enregistrement est conservé.`;
      const result = resultFor({
        verdict: 'DUPLICATE',
        ...(settlement.settlement.matchedPaymentId ? { paymentId: settlement.settlement.matchedPaymentId } : {}),
        provider: transaction.provider,
        externalTransactionId: transaction.externalTransactionId,
        reference: transaction.reference,
        reasons: [reason],
        reconciledAt: timestamp,
        transaction,
      });
      await this.finishItemWithReview(
        current,
        item,
        claimToken,
        result,
        timestamp,
        settlement.settlement.matchedPaymentId,
      );
      return;
    }

    const candidates = await current.matching.findCandidates({
      provider: transaction.provider,
      externalTransactionId: transaction.externalTransactionId,
      reference: transaction.reference,
      limit: 5,
    });
    if (candidates.length > 1) {
      const result = resultFor({
        verdict: 'DUPLICATE',
        provider: transaction.provider,
        externalTransactionId: transaction.externalTransactionId,
        reference: transaction.reference,
        reasons: [`La transaction externe correspond à ${candidates.length} paiements LE LABEUR possibles; aucune association automatique n’est retenue.`],
        reconciledAt: timestamp,
        transaction,
      });
      await current.settlements.setReconciliationResult({
        settlementId: settlement.settlement.settlementId,
        status: 'DUPLICATE',
        reasons: result.reasons,
        timestamp,
      });
      await this.finishItemWithReview(current, item, claimToken, result, timestamp);
      return;
    }

    let candidate: PaymentReconciliationPaymentCandidate | null = candidates[0] ?? null;
    if (candidate) {
      // Le verrou sur l'agrégat existant sérialise deux règlements différents
      // essayant de correspondre au même paiement.
      candidate = await current.matching.findCandidateByIdForUpdate(candidate.paymentId);
    }

    let result: NormalizedReconciliationResult;
    if (!candidate) {
      result = resultFor({
        verdict: 'NOT_FOUND',
        provider: transaction.provider,
        externalTransactionId: transaction.externalTransactionId,
        reference: transaction.reference,
        reasons: ['Aucun paiement LE LABEUR ne correspond à cette transaction externe; aucun Payment métier n’est créé.'],
        reconciledAt: timestamp,
        transaction,
      });
    } else {
      const existingMatch = await current.settlements.findMatchedByPaymentId(candidate.paymentId);
      if (existingMatch && existingMatch.externalTransactionId !== transaction.externalTransactionId) {
        result = resultFor({
          verdict: 'DUPLICATE',
          paymentId: candidate.paymentId,
          provider: transaction.provider,
          externalTransactionId: transaction.externalTransactionId,
          reference: transaction.reference,
          reasons: [`Le paiement ${candidate.paymentId} possède déjà le règlement externe MATCH ${existingMatch.externalTransactionId}; aucun second règlement n’est rattaché.`],
          reconciledAt: timestamp,
          transaction,
        });
      } else {
        result = evaluateReconciliation({
          expected: {
            paymentId: candidate.paymentId,
            contractId: candidate.contractId,
            paymentType: candidate.paymentType,
            ...(candidate.provider ? { provider: candidate.provider } : {}),
            ...(candidate.externalTransactionId ? { externalTransactionId: candidate.externalTransactionId } : {}),
            ...(candidate.reference ? { reference: candidate.reference } : {}),
            amount: candidate.amount,
            currency: candidate.currency,
            payer: candidate.employerId,
            recipient: candidate.paymentType === 'PLATFORM_FEE' ? 'LE_LABEUR' : candidate.candidateId,
            scheduledAt: candidate.scheduledAt,
            dueAt: candidate.dueAt,
          },
          actual: transaction,
          reconciledAt: timestamp,
        });
      }
    }

    await current.settlements.setReconciliationResult({
      settlementId: settlement.settlement.settlementId,
      status: result.verdict,
      ...(candidate ? { matchedPaymentId: candidate.paymentId } : {}),
      reasons: result.reasons,
      timestamp,
    });
    if (result.verdict === 'MATCH') {
      const matchedPayment = await current.settlements.findMatchedByPaymentId(candidate!.paymentId);
      if (!matchedPayment || matchedPayment.externalTransactionId !== transaction.externalTransactionId) {
        throw new Error('Association MATCH non visible après écriture du ledger externe.');
      }
    }
    if (result.verdict === 'MATCH') {
      await this.finishItem(current, item, claimToken, result, timestamp, candidate?.paymentId);
    } else {
      await this.finishItemWithReview(current, item, claimToken, result, timestamp, candidate?.paymentId);
    }
  }

  private transactionFromMetadata(provider: string, metadata: Record<string, unknown>): NormalizedPaymentTransaction | null {
    const externalTransactionId = metadata.externalTransactionId;
    const reference = metadata.reference;
    const amount = metadata.amount;
    const currency = metadata.currency;
    const payer = metadata.payer;
    const recipient = metadata.recipient;
    const occurredAt = metadata.occurredAt;
    const status = metadata.status;
    if (typeof externalTransactionId !== 'string' || !externalTransactionId
      || typeof reference !== 'string' || !reference
      || typeof amount !== 'number' || !Number.isFinite(amount)
      || typeof currency !== 'string' || !currency
      || typeof payer !== 'string' || !payer
      || typeof recipient !== 'string' || !recipient
      || typeof occurredAt !== 'string' || !occurredAt
      || typeof status !== 'string' || !(ALLOWED_TRANSACTION_STATUSES as readonly string[]).includes(status)) {
      return null;
    }
    return {
      provider,
      externalTransactionId,
      reference,
      amount,
      currency,
      payer,
      recipient,
      occurredAt,
      status: status as NormalizedTransactionStatus,
    };
  }

  private async finishItemWithReview(
    current: PaymentReconciliationStores,
    item: import('../persistence/paymentReconciliationRecords').PaymentReconciliationBatchItemRecord,
    claimToken: string,
    result: NormalizedReconciliationResult,
    timestamp: string,
    paymentId?: string,
  ): Promise<void> {
    const review = await current.reviews.createIfAbsent({
      reviewId: newEntityId('rev'),
      batchId: item.batchId,
      itemId: item.itemId,
      ...(paymentId ? { paymentId } : {}),
      reason: result.reasons.join(' ') || `Résultat ${result.verdict} à examiner par ADMIN.`,
      ...(item.reference ? { evidenceReference: item.reference } : {}),
      openedBy: 'SYSTEM',
      openedAt: timestamp,
      createdAt: timestamp,
    });
    await this.finishItem(current, item, claimToken, result, timestamp, paymentId, review.reviewId);
  }

  private async finishItem(
    current: PaymentReconciliationStores,
    item: import('../persistence/paymentReconciliationRecords').PaymentReconciliationBatchItemRecord,
    claimToken: string,
    result: NormalizedReconciliationResult,
    timestamp: string,
    paymentId?: string,
    reviewId?: string,
  ): Promise<void> {
    const updated = await current.items.complete(item.itemId, claimToken, {
      status: result.verdict,
      result,
      ...(paymentId ? { matchedPaymentId: paymentId } : {}),
      ...(reviewId ? { reviewId } : {}),
      updatedAt: timestamp,
    });
    if (!updated) throw new Error(`Claim expiré ou remplacé pour l’élément ${item.itemId}.`);
    await current.audit.append({
      id: `audit_payment_reconciliation_${item.itemId}`.slice(0, 120),
      actorId: 'SYSTEM',
      timestamp,
      entityId: paymentId ?? item.itemId,
      action: resultAuditAction(result.verdict),
      source: PAYMENT_RECONCILIATION_SOURCE,
      reference: item.batchId,
      beforeState: { status: 'PROCESSING', attempt: item.attempts },
      afterState: {
        batchId: item.batchId,
        itemId: item.itemId,
        itemIndex: item.itemIndex,
        provider: result.provider,
        externalTransactionId: result.externalTransactionId ?? null,
        reference: result.reference ?? null,
        verdict: result.verdict,
        matchedPaymentId: paymentId ?? null,
        reviewId: reviewId ?? null,
        reasons: result.reasons,
        movedFunds: false,
        paymentStatusChanged: false,
      },
      ...(result.reasons.length > 0 ? { error: result.reasons.join(' ') } : {}),
    });
  }

}

export function createPaymentReconciliationBatchService(
  dependencies: PaymentReconciliationBatchServiceDependencies,
): PaymentReconciliationBatchService {
  return new PaymentReconciliationBatchService(dependencies);
}
