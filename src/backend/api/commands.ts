import type { AuthenticatedActor, ProductionCommandContext } from '../productionContracts';
import { ApiError } from './errors';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/** Validates a client command key. It does not persist or deduplicate it. */
export function requireIdempotencyKey(headers: Headers): string {
  const key = headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();
  if (!key) {
    throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'L’en-tête Idempotency-Key est obligatoire pour cette commande.');
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ApiError('VALIDATION_ERROR', 'L’en-tête Idempotency-Key est invalide.');
  }
  return key;
}

/** Actor is supplied by the trusted authentication middleware, never request data. */
export function createCommandContext(
  actor: AuthenticatedActor,
  command: string,
  idempotencyKey: string,
  requestId: string,
): ProductionCommandContext {
  return { actor, command, idempotencyKey, requestId };
}
