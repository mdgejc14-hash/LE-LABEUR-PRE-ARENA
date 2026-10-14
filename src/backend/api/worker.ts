import type { AuthenticatedActor, PageRequest, ProductionCommandContext } from '../productionContracts';
import { createCommandContext, requireIdempotencyKey } from './commands';
import { ApiError, apiErrorResponse, apiJsonResponse } from './errors';
import { healthStatusCode, type BoundaryHealthResponse } from './health';
import { parsePageRequest } from './pagination';
import { API_ROUTE_CONTRACTS, findApiPath, findApiRoute, routePathMatches, type ApiRouteContract, type ApiRouteKey } from './routeContracts';
import {
  classifySecurityForensicAction,
  createSecurityRateLimiter,
  isInternalOrDebugPath,
  rejectForgedSelfQueryParams,
  requireAdmin,
  requireAuth,
  requirePermission,
  resolveRateLimitSubject,
  routeRateLimitBucket,
  sanitizeForensicReason,
  type RateLimitPolicyConfig,
  type SecurityAuditSink,
  type SecurityRateLimiter,
} from './security';

export type { BoundaryHealthResponse, HealthRuntimeDescriptor, MigrationState, PersistenceHealthReport } from './health';

export interface ApiRouteContext {
  request: Request;
  url: URL;
  requestId: string;
  route: ApiRouteContract;
  params: Record<string, string>;
  actor: AuthenticatedActor | null;
  page?: PageRequest;
  command?: ProductionCommandContext;
}

export type ApiRouteHandler = (context: ApiRouteContext) => Promise<unknown | Response>;

/** Rapport `/healthz` : construit à partir de l'état réel observé. */
export type ApiHealthReporter = () => Promise<BoundaryHealthResponse> | BoundaryHealthResponse;

export interface ApiWorkerDependencies {
  /** Must verify a server session cookie/token; never read actor fields from request data. */
  authenticate(request: Request): Promise<AuthenticatedActor | null>;
  /** Only explicitly installed persistent domain handlers are reachable; all others stay 501. */
  handlers?: Partial<Record<ApiRouteKey, ApiRouteHandler>>;
  createRequestId?: () => string;
  /**
   * Sans rapporteur, `/healthz` conserve la forme historique de la frontière
   * nue (`boundary-only` / `not-configured`) : aucune persistance n'est
   * annoncée tant qu'elle n'est pas réellement sondée.
   */
  health?: ApiHealthReporter;
  /** Limiteur de débit déterministe minimal sur les routes à haut risque. */
  rateLimiter?: SecurityRateLimiter;
  rateLimitPolicy?: RateLimitPolicyConfig;
  /** Journalisation forensique transversale dans `automation_audit_ledger`. */
  onSecurityAudit?: SecurityAuditSink;
  now?: () => Date;
}

const boundaryOnlyHealth: BoundaryHealthResponse = {
  status: 'boundary-only',
  apiVersion: 'v1',
  persistence: 'not-configured',
  runtime: { runtime: 'unknown', declaredEnvironment: null, hyperdriveBinding: false },
};

function newRequestId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function routeParams(template: string, pathname: string): Record<string, string> {
  const expected = template.split('/').filter(Boolean);
  const actual = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  expected.forEach((part, index) => {
    if (!part.startsWith(':')) return;
    try {
      params[part.slice(1)] = decodeURIComponent(actual[index]);
    } catch {
      throw new ApiError('VALIDATION_ERROR', 'Le chemin de la requête est invalide.');
    }
  });
  if (Object.values(params).some(value => !value || value.includes('/'))) {
    throw new ApiError('VALIDATION_ERROR', 'Le chemin de la requête est invalide.');
  }
  return params;
}

function validateRouteAccess(route: ApiRouteContract, actor: AuthenticatedActor | null): AuthenticatedActor | null {
  if (route.authentication === 'required') actor = requireAuth(actor);
  if (!actor) return null;

  if (route.roles && !route.roles.includes(actor.role)) {
    throw new ApiError('FORBIDDEN', 'Accès interdit.');
  }
  if (route.scope === 'admin') {
    requireAdmin(actor, route.permission);
  } else if (route.permission) {
    requirePermission(actor, route.permission);
  }
  return actor;
}

export function createApiWorker(dependencies: ApiWorkerDependencies): { fetch(request: Request): Promise<Response> } {
  const now = dependencies.now ?? (() => new Date());
  const rateLimiter = dependencies.rateLimiter ?? createSecurityRateLimiter(dependencies.rateLimitPolicy, now);

  return {
    async fetch(request: Request): Promise<Response> {
      const requestId = dependencies.createRequestId?.() ?? newRequestId();
      const url = new URL(request.url);

      if (url.pathname === '/healthz' && request.method.toUpperCase() === 'GET') {
        let body: BoundaryHealthResponse = boundaryOnlyHealth;
        if (dependencies.health) {
          try {
            body = await dependencies.health();
          } catch {
            // Un rapporteur défaillant ne doit jamais produire un 500 opaque :
            // l'état devient explicitement dégradé, sans détail interne.
            body = {
              status: 'degraded',
              apiVersion: 'v1',
              persistence: {
                mode: 'misconfigured',
                reason: 'missing-sql-client',
                configured: false,
                durable: false,
                reachable: false,
                error: 'Le rapport de santé a échoué.',
              },
              runtime: boundaryOnlyHealth.runtime,
            };
          }
        }
        return apiJsonResponse(body, healthStatusCode(body), requestId);
      }

      let matchedRoute: ApiRouteContract | undefined;
      let resolvedActor: AuthenticatedActor | null = null;
      let resolvedParams: Record<string, string> = {};

      try {
        if (isInternalOrDebugPath(url.pathname)) {
          throw new ApiError('NOT_FOUND', 'Ressource introuvable.');
        }

        const route = findApiRoute(request.method, url.pathname);
        if (!route) {
          if (findApiPath(url.pathname)) {
            const allowed = [...new Set(
              API_ROUTE_CONTRACTS
                .filter(candidate => routePathMatches(candidate.path, url.pathname))
                .map(candidate => candidate.method),
            )];
            throw new ApiError('METHOD_NOT_ALLOWED', 'Méthode HTTP non autorisée.', { allowed }, 405);
          }
          throw new ApiError('NOT_FOUND', 'Ressource introuvable.');
        }
        matchedRoute = route;
        resolvedParams = routeParams(route.path, url.pathname);

        let actor: AuthenticatedActor | null = null;
        if (route.authentication === 'required') {
          actor = await dependencies.authenticate(request);
        } else {
          actor = await dependencies.authenticate(request).catch(() => null);
        }
        resolvedActor = actor;

        const bucket = routeRateLimitBucket(route.key);
        if (bucket === 'auth' || bucket === 'webhook') {
          rateLimiter.enforce(bucket, resolveRateLimitSubject(request, actor), now().getTime(), route.key);
        }

        actor = validateRouteAccess(route, actor);
        resolvedActor = actor;

        if (bucket && bucket !== 'auth' && bucket !== 'webhook') {
          rateLimiter.enforce(bucket, resolveRateLimitSubject(request, actor), now().getTime(), route.key);
        }

        if (route.scope !== 'admin') {
          rejectForgedSelfQueryParams(url.searchParams, route.key);
        }

        const page = route.collection ? parsePageRequest(url.searchParams) : undefined;
        const idempotencyKey = route.idempotency ? requireIdempotencyKey(request.headers) : undefined;
        const command = idempotencyKey && actor
          ? createCommandContext(actor, route.key, idempotencyKey, requestId)
          : undefined;
        const handler = dependencies.handlers?.[route.key as ApiRouteKey];
        if (!handler) {
          throw new ApiError('NOT_IMPLEMENTED', 'Cette opération backend n’est pas encore configurée.');
        }

        const result = await handler({
          request,
          url,
          requestId,
          route,
          params: resolvedParams,
          actor,
          page,
          command,
        });
        if (result instanceof Response) {
          const headers = new Headers(result.headers);
          headers.set('x-request-id', requestId);
          headers.set('cache-control', 'no-store');
          return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
        }
        return apiJsonResponse(result, 200, requestId);
      } catch (error) {
        if (error instanceof ApiError && dependencies.onSecurityAudit) {
          const forensicAction = classifySecurityForensicAction(error, url.pathname);
          if (forensicAction) {
            const firstParam = Object.values(resolvedParams)[0] ?? null;
            try {
              await dependencies.onSecurityAudit({
                action: forensicAction,
                routeKey: matchedRoute?.key ?? 'unmatched',
                method: request.method.toUpperCase(),
                path: url.pathname,
                requestId,
                actorId: resolvedActor?.id ?? null,
                actorRole: resolvedActor?.role ?? null,
                targetEntityId: firstParam,
                status: error.status,
                errorCode: error.code,
                reason: sanitizeForensicReason(error.message),
              });
            } catch {
              // Ne jamais masquer l'erreur HTTP d'origine en cas d'échec du sink d'audit.
            }
          }
        }
        return apiErrorResponse(error, requestId);
      }
    },
  };
}

/**
 * Closed-by-default Cloudflare Worker entry point. No identity verifier,
 * PostgreSQL binding, Hyperdrive binding or domain handler is installed in
 * Phase 1, so protected routes fail with 401 and known operations fail with
 * 501 rather than falling back to mock data.
 */
const boundaryWorker = createApiWorker({
  authenticate: async () => null,
});

export default {
  fetch(request: Request): Promise<Response> {
    return boundaryWorker.fetch(request);
  },
};
