/**
 * ADM — projection d'une erreur d'API en état d'interface.
 *
 * Aucun message brut du serveur n'est rendu, aucun détail sensible n'est
 * exposé : seul l'état (StateGuard) et, s'il est sûr, le code de corrélation.
 */

import { ApiClientError } from '../repositories/apiClient';
import { STATE_GUARD_KEYS, type StateGuardKey } from '../design-system/generated/stateGuardCatalog';
import { sanitizeCorrelationId } from '../design-system/correlation';

export interface AdminError {
  readonly state: StateGuardKey;
  readonly correlationId?: string;
}

export function adminError(cause: unknown): AdminError {
  if (!(cause instanceof ApiClientError)) return { state: '500' };
  const key = String(cause.status) as StateGuardKey;
  const correlationId = sanitizeCorrelationId(cause.requestId);
  return {
    state: cause.status === 0 ? 'offline' : STATE_GUARD_KEYS.includes(key) ? key : '500',
    ...(correlationId ? { correlationId } : {}),
  };
}
