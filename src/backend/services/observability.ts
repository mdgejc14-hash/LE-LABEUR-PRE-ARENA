import type { AuthenticatedActor } from '../productionContracts';

export interface RequestLogContext {
  requestId: string;
  routeKey?: string;
  method: string;
  status?: number;
  durationMs?: number;
  actorId?: string;
  actorRole?: AuthenticatedActor['role'];
  errorCode?: string;
}

export interface StructuredLogger {
  info(event: string, context: RequestLogContext): void;
  warn(event: string, context: RequestLogContext): void;
  error(event: string, context: RequestLogContext): void;
}

/** Do not add credential values, message bodies, payment proofs or raw PII here. */
export const OBSERVABILITY_REDACTION_RULES = [
  'never log Google credentials, cookies, session tokens or signaling credentials',
  'never log message bodies, audio, document contents or payment proof URLs',
  'use requestId and entity IDs for correlation; restrict actor fields to server-side logs',
  'keep infrastructure metrics separate from business audit events',
] as const;
