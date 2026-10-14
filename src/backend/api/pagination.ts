import type { CursorPage, PageRequest } from '../productionContracts';
import { ApiError } from './errors';

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
export const MAX_CURSOR_LENGTH = 512;

/** Parse a bounded, opaque cursor request; never let a client choose SQL order or offsets. */
export function parsePageRequest(searchParams: URLSearchParams): PageRequest {
  const cursorValues = searchParams.getAll('cursor');
  const limitValues = searchParams.getAll('limit');
  if (cursorValues.length > 1 || limitValues.length > 1) {
    throw new ApiError('VALIDATION_ERROR', 'Les paramètres de pagination sont invalides.');
  }

  const cursor = cursorValues[0] ?? null;
  if (cursor !== null && (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH)) {
    throw new ApiError('VALIDATION_ERROR', 'Le curseur de pagination est invalide.');
  }

  const rawLimit = limitValues[0];
  if (rawLimit === undefined) return { cursor, limit: DEFAULT_PAGE_LIMIT };
  if (!/^\d+$/.test(rawLimit)) {
    throw new ApiError('VALIDATION_ERROR', 'La limite de pagination doit être un entier positif.');
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    throw new ApiError('VALIDATION_ERROR', `La limite doit être comprise entre 1 et ${MAX_PAGE_LIMIT}.`);
  }
  return { cursor, limit };
}

export function makeCursorPage<T>(items: T[], cursor: string | null, limit: number, hasMore: boolean): CursorPage<T> {
  return { items, cursor, limit, hasMore };
}
