import type { AuthenticatedActor, PageRequest, ProductionCommandContext } from '../productionContracts';
import { createCommandContext, requireIdempotencyKey } from './commands';
import { ApiError, apiErrorResponse, apiJsonResponse } from './errors';
import { parsePageRequest } from './pagination';
import { API_ROUTE_CONTRACTS, findApiPath, findApiRoute, routePathMatches, type ApiRouteContract, type ApiRouteKey } from './routeContracts';
import { requireAdmin, requireAuth, requirePermission } from './security';

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

export interface ApiWorkerDependencies {
  /** Must verify a server session cookie/token; never read actor fields from request data. */
  authenticate(request: Request): Promise<AuthenticatedActor | null>;
  /** Persistent domain handlers are intentionally absent in the foundation pass. */
  handlers?: Partial<Record<ApiRouteKey, ApiRouteHandler>>;
  createRequestId?: () => string;
}

export interface BoundaryHealthResponse {
  status: 'boundary-only';
  apiVersion: 'v1';
  persistence: 'not-configured';
}

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
  return {
    async fetch(request: Request): Promise<Response> {
      const requestId = dependencies.createRequestId?.() ?? newRequestId();
      const url = new URL(request.url);

      if (url.pathname === '/healthz' && request.method.toUpperCase() === 'GET') {
        const body: BoundaryHealthResponse = {
          status: 'boundary-only',
          apiVersion: 'v1',
          persistence: 'not-configured',
        };
        return apiJsonResponse(body, 200, requestId);
      }

      try {
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

        let actor: AuthenticatedActor | null = null;
        if (route.authentication === 'required') {
          actor = await dependencies.authenticate(request);
        }
        actor = validateRouteAccess(route, actor);

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
          params: routeParams(route.path, url.pathname),
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
