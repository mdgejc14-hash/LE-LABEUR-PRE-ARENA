/** P0-PAY-3 — routes ADMIN de batch externe et de revue de paiement. */

import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteContext, ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import {
  PaymentReconciliationError,
  type PaymentReconciliationBatchService,
} from './paymentReconciliationBatch';

const MAX_RECONCILIATION_REQUEST_BYTES = 16 * 1024 * 1024;

async function readJsonBody(context: ApiRouteContext): Promise<Record<string, unknown>> {
  const declaredLength = Number(context.request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_RECONCILIATION_REQUEST_BYTES) {
    throw new ApiError('VALIDATION_ERROR', 'Corps de réconciliation trop volumineux (limite 16 MiB).');
  }
  try {
    const reader = context.request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RECONCILIATION_REQUEST_BYTES) {
          await reader.cancel();
          throw new ApiError('VALIDATION_ERROR', 'Corps de réconciliation trop volumineux (limite 16 MiB).');
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object expected');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('VALIDATION_ERROR', 'Corps JSON de réconciliation invalide.');
  }
}

function mapReconciliationError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof PaymentReconciliationError) {
    switch (error.code) {
      case 'VALIDATION':
        throw new ApiError('VALIDATION_ERROR', error.message, undefined, 400);
      case 'FORBIDDEN':
        throw new ApiError('FORBIDDEN', error.message, undefined, 403);
      case 'NOT_FOUND':
        throw new ApiError('NOT_FOUND', error.message, undefined, 404);
      case 'NOT_IMPLEMENTED':
        throw new ApiError('NOT_IMPLEMENTED', error.message, undefined, 501);
      case 'IDEMPOTENCY_CONFLICT':
        throw new ApiError('IDEMPOTENCY_CONFLICT', error.message, undefined, 409);
      case 'IN_PROGRESS':
      case 'CONFLICT':
        throw new ApiError('BUSINESS_RULE_VIOLATION', error.message, undefined, 409);
    }
  }
  throw new ApiError('INTERNAL_ERROR', 'La réconciliation batch a échoué.');
}

export function createPaymentReconciliationApiHandlers(
  service: PaymentReconciliationBatchService,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  const safely = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) { mapReconciliationError(error); }
  };

  return {
    'admin.payment-reconciliation.batches.create': async context => {
      const body = await readJsonBody(context);
      const result = await safely(() => service.reconcileBatch(context.actor!, {
        provider: typeof body.provider === 'string' ? body.provider : '',
        transactions: Array.isArray(body.transactions) ? body.transactions : body.transactions as never,
        idempotencyKey: context.command!.idempotencyKey,
        requestId: context.requestId,
      }));
      return apiJsonResponse(result, result.replayed ? 200 : 201, context.requestId);
    },

    'admin.payment-reconciliation.batches.read': async context => safely(() =>
      service.getBatch(
        context.actor!,
        context.params.batchId,
        context.page ?? { cursor: null, limit: 100 },
      )),

    'admin.payment-reconciliation.batches.retry': async context => safely(() =>
      service.retryBatch(
        context.actor!,
        context.params.batchId,
        context.command!.idempotencyKey,
        context.requestId,
      )),

    'admin.payment-reconciliation.reviews.decide': async context => {
      const body = await readJsonBody(context);
      const decision = body.decision === 'CONFIRMED' || body.decision === 'REJECTED'
        ? body.decision
        : '';
      const result = await safely(() => service.decideReview(context.actor!, context.params.reviewId, {
        decision: decision as 'CONFIRMED' | 'REJECTED',
        evidence: typeof body.evidence === 'string' ? body.evidence : undefined,
        note: typeof body.note === 'string' ? body.note : undefined,
        idempotencyKey: context.command!.idempotencyKey,
      }));
      return apiJsonResponse(result, 200, context.requestId);
    },

    'admin.payment-reconciliation.reviews.correction-attempt': async context => {
      const body = await readJsonBody(context);
      const result = await safely(() => service.recordCorrectionAttempt(context.actor!, context.params.reviewId, {
        proposedChanges: body.proposedChanges as Record<string, unknown>,
        evidenceReference: typeof body.evidenceReference === 'string' ? body.evidenceReference : undefined,
        note: typeof body.note === 'string' ? body.note : undefined,
        idempotencyKey: context.command!.idempotencyKey,
      }));
      return apiJsonResponse(result, result.replayed ? 200 : 201, context.requestId);
    },
  };
}
