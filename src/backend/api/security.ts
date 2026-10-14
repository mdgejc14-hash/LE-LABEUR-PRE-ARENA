import type { AuthenticatedActor, Permission } from '../productionContracts';
import { ApiError, redactClientErrorText } from './errors';

export const SECURITY_AUDIT_SOURCE = 'api:P0-SECURITY-ANTI-FRAUD';

/** Fails closed if a route has no server-authenticated actor. */
export function requireAuth(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) {
    throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  }
  return actor;
}

export function requireRole(actor: AuthenticatedActor, role: AuthenticatedActor['role']): void {
  if (actor.role !== role) {
    throw new ApiError('FORBIDDEN', 'Accès interdit.');
  }
}

export function requirePermission(actor: AuthenticatedActor, permission: Permission): void {
  if (!actor.permissions.includes(permission)) {
    throw new ApiError('FORBIDDEN', 'Accès interdit.');
  }
}

/**
 * Ownership is checked against server-loaded resource data. ADMIN is not an
 * implicit ownership bypass; a specific permission is required when a route
 * intentionally allows an administrator to act on another user's resource.
 */
export function requireParticipant(actor: AuthenticatedActor, participantIds: readonly string[]): void {
  if (!participantIds.includes(actor.id)) {
    throw new ApiError('FORBIDDEN', 'Accès interdit.');
  }
}

export function requireOwnership(
  actor: AuthenticatedActor,
  ownerId: string,
  adminOverridePermission?: Permission,
): void {
  if (actor.id === ownerId) return;
  if (actor.role === 'ADMIN' && adminOverridePermission) {
    requirePermission(actor, adminOverridePermission);
    return;
  }
  throw new ApiError('FORBIDDEN', 'Accès interdit.');
}

export function requireAdmin(actor: AuthenticatedActor, permission?: Permission): void {
  requireRole(actor, 'ADMIN');
  if (permission) requirePermission(actor, permission);
}

/**
 * Query parameters that must never be accepted on a `self`-scoped endpoint,
 * because the subject of a `self` endpoint is strictly derived from the
 * server-verified session.
 */
export const FORGED_SELF_QUERY_PARAMS: readonly string[] = [
  'userId',
  'ownerId',
  'ownerUserId',
  'actorId',
  'recipientId',
  'subjectUserId',
  'employerId',
  'candidateId',
  'employeeId',
  'senderId',
  'role',
  'permissions',
  'source',
];

export function rejectForgedSelfQueryParams(searchParams: URLSearchParams, routeKey: string): void {
  for (const param of FORGED_SELF_QUERY_PARAMS) {
    if (searchParams.has(param)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `Paramètre « ${param} » interdit sur la route personnelle « ${routeKey} » : l’identité est dérivée de la session serveur.`,
        { [param]: ['PARAMETER_FORGERY_REJECTED'] },
      );
    }
  }
}

/**
 * Detects paths attempting to reach non-public internal, cron, queue, or debug
 * entrypoints over HTTP.
 */
export function isInternalOrDebugPath(pathname: string): boolean {
  return /^\/(?:api(?:\/v1)?\/)?(?:internal|_internal|cron|queue|debug|_debug)(?:\/|$)/i.test(pathname);
}

export type RateLimitBucket =
  | 'auth'
  | 'webhook'
  | 'salary-otp'
  | 'webrtc-signaling'
  | 'domain-mutations'
  | 'documents-access'
  | 'reconciliation-sensitive';

export interface RateLimitRule {
  readonly maxRequests: number;
  readonly windowMs: number;
}

export type RateLimitPolicyConfig = Partial<Record<RateLimitBucket, RateLimitRule>>;

export const DEFAULT_RATE_LIMIT_POLICY: Record<RateLimitBucket, RateLimitRule> = {
  auth: { maxRequests: 60, windowMs: 60_000 },
  webhook: { maxRequests: 60, windowMs: 60_000 },
  'salary-otp': { maxRequests: 40, windowMs: 60_000 },
  'webrtc-signaling': { maxRequests: 80, windowMs: 60_000 },
  'domain-mutations': { maxRequests: 80, windowMs: 60_000 },
  'documents-access': { maxRequests: 80, windowMs: 60_000 },
  'reconciliation-sensitive': { maxRequests: 40, windowMs: 60_000 },
};

const ROUTE_BUCKET_MAP: Record<string, RateLimitBucket> = {
  'auth.google': 'auth',
  'auth.google.login': 'auth',
  'auth.google.credential': 'auth',
  'auth.session': 'auth',
  'auth.logout': 'auth',
  'webhooks.payment-provider': 'webhook',
  'webhooks.payment-provider.root': 'webhook',
  'payments.salary.confirmation.request': 'salary-otp',
  'payments.salary.confirmation.confirm': 'salary-otp',
  'payments.salary.confirm': 'salary-otp',
  'webrtc.sessions.create': 'webrtc-signaling',
  'webrtc.sessions.join': 'webrtc-signaling',
  'webrtc.sessions.credentials.create': 'webrtc-signaling',
  'webrtc.sessions.credentials.issue': 'webrtc-signaling',
  'webrtc.sessions.signaling.send': 'webrtc-signaling',
  'webrtc.sessions.signaling.poll': 'webrtc-signaling',
  'offers.create': 'domain-mutations',
  'applications.create': 'domain-mutations',
  'proposals.create': 'domain-mutations',
  'contracts.create': 'domain-mutations',
  'claims.create': 'domain-mutations',
  'documents.upload-grant': 'documents-access',
  'documents.upload-grants.create': 'documents-access',
  'documents.versions.create': 'documents-access',
  'documents.versions.content.upload': 'documents-access',
  'documents.versions.content.download': 'documents-access',
  'documents.signed-download': 'documents-access',
  'documents.signed-download-url.create': 'documents-access',
  'reputation.mine.reconcile': 'reconciliation-sensitive',
  'admin.reputation.reconcile': 'reconciliation-sensitive',
  'admin.reputation.entries.correct': 'reconciliation-sensitive',
  'payments.reconcile': 'reconciliation-sensitive',
  'admin.payments.reconcile': 'reconciliation-sensitive',
  'admin.payment-reconciliation.batches.create': 'reconciliation-sensitive',
  'admin.payment-reconciliation.batches.retry': 'reconciliation-sensitive',
  'admin.payment-reconciliation.reviews.decide': 'reconciliation-sensitive',
  'admin.users.block': 'reconciliation-sensitive',
};

export function routeRateLimitBucket(routeKey: string): RateLimitBucket | null {
  return ROUTE_BUCKET_MAP[routeKey] ?? null;
}

export interface SecurityRateLimiter {
  enforce(bucket: RateLimitBucket, subjectKey: string, nowMs?: number, routeKey?: string): void;
  reset(): void;
}

/**
 * Minimal, deterministic sliding-window rate limiter for high-risk endpoints.
 * Keyed by `(bucket, routeKey, subjectKey)` where `subjectKey` is the authenticated
 * `actor.id` or a deterministic request fingerprint for unauthenticated routes.
 */
export function createSecurityRateLimiter(
  overrides: RateLimitPolicyConfig = {},
  now: () => Date = () => new Date(),
): SecurityRateLimiter {
  const rules: Record<RateLimitBucket, RateLimitRule> = {
    ...DEFAULT_RATE_LIMIT_POLICY,
    ...overrides,
  };
  const windows = new Map<string, number[]>();

  return {
    enforce(bucket: RateLimitBucket, subjectKey: string, nowMs = now().getTime(), routeKey?: string): void {
      const rule = rules[bucket];
      if (!rule || rule.maxRequests <= 0 || rule.windowMs <= 0) return;

      const key = `${bucket}:${routeKey ?? bucket}:${subjectKey || 'anonymous'}`;
      const cutoff = nowMs - rule.windowMs;
      const existing = windows.get(key) ?? [];
      const active = existing.filter(timestamp => timestamp > cutoff);

      if (active.length >= rule.maxRequests) {
        const oldest = active[0] ?? nowMs;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - nowMs) / 1000));
        windows.set(key, active);
        throw new ApiError(
          'RATE_LIMITED',
          'Trop de requêtes sur cette opération sensible. Veuillez réessayer ultérieurement.',
          {
            bucket: [bucket],
            retryAfterSeconds: [String(retryAfterSeconds)],
          },
          429,
        );
      }

      active.push(nowMs);
      windows.set(key, active);
    },
    reset(): void {
      windows.clear();
    },
  };
}

export function resolveRateLimitSubject(request: Request, actor: AuthenticatedActor | null | undefined): string {
  if (actor?.id) return `actor:${actor.id}`;
  const forwarded = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return `ip:${forwarded.slice(0, 64)}`;
  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader) return `auth:${authHeader.slice(-24)}`;
  const cookieHeader = request.headers.get('cookie')?.trim();
  if (cookieHeader) return `cookie:${cookieHeader.slice(-24)}`;
  return 'anonymous';
}

export type SecurityForensicAction =
  | 'SECURITY_AUTH_FAILED'
  | 'SECURITY_ACCESS_DENIED'
  | 'SECURITY_REPLAY_REJECTED'
  | 'SECURITY_PARAMETER_FORGERY_REJECTED'
  | 'SECURITY_RATE_LIMITED'
  | 'SECURITY_INTERNAL_ROUTE_BLOCKED';

export interface SecurityForensicEvent {
  readonly action: SecurityForensicAction;
  readonly routeKey: string;
  readonly method: string;
  readonly path: string;
  readonly requestId: string;
  readonly actorId?: string | null;
  readonly actorRole?: string | null;
  readonly targetEntityId?: string | null;
  readonly status: number;
  readonly errorCode: string;
  readonly reason: string;
}

export type SecurityAuditSink = (event: SecurityForensicEvent) => Promise<void> | void;

export function classifySecurityForensicAction(
  error: ApiError,
  pathname: string,
): SecurityForensicAction | null {
  if (isInternalOrDebugPath(pathname)) {
    return 'SECURITY_INTERNAL_ROUTE_BLOCKED';
  }
  if (error.code === 'RATE_LIMITED' || error.status === 429) {
    return 'SECURITY_RATE_LIMITED';
  }
  if (error.code === 'UNAUTHENTICATED' || error.status === 401) {
    return 'SECURITY_AUTH_FAILED';
  }
  if (
    error.details &&
    Object.values(error.details).some(values =>
      Array.isArray(values) && values.some(val => /FORGERY|FALSIF/i.test(String(val))),
    )
  ) {
    return 'SECURITY_PARAMETER_FORGERY_REJECTED';
  }
  if (/falsifi|forgery|autorisé que pour son propre compte|interdit sur la route personnelle|réservé au serveur/i.test(error.message)) {
    return 'SECURITY_PARAMETER_FORGERY_REJECTED';
  }
  if (error.code === 'FORBIDDEN' || error.status === 403) {
    return 'SECURITY_ACCESS_DENIED';
  }
  if (error.code === 'IDEMPOTENCY_CONFLICT') {
    return 'SECURITY_REPLAY_REJECTED';
  }
  if (error.status === 409 && /rejeu|replay|séquence|nonce|déjà utilisé/i.test(error.message)) {
    return 'SECURITY_REPLAY_REJECTED';
  }
  return null;
}

export function sanitizeForensicReason(reason: string): string {
  return redactClientErrorText(reason).slice(0, 300);
}
