/**
 * LE LABEUR — Phase 2 : Worker d'identité serveur.
 *
 * NAVIGATEUR → AUTH GOOGLE (vérifiée serveur) → SESSION SERVEUR → ACTEUR
 * → RÔLE → PERMISSIONS → API.
 *
 * Ce Worker ajoute les handlers métier fournis explicitement par la composition.
 * Les routes AUTH/SESSION/ME et les frontières ADMIN de contrôle restent celles
 * de cette couche; toute opération métier non injectée demeure fermée (501).
 */

import { serializeExpiredSessionCookie, serializeSessionCookie, type SessionCookieOptions } from '../identity/cookies';
import { toAdminUserDto, toSessionDto } from '../identity/dto';
import type { SessionService } from '../identity/sessionService';
import { isSelfAssignableRole } from '../identity/permissions';
import type { IdentityStores } from '../identity/stores';
import { ApiError, apiJsonResponse } from './errors';
import type { ApiRouteKey } from './routeContracts';
import { createApiWorker, type ApiHealthReporter, type ApiRouteContext, type ApiRouteHandler } from './worker';

export interface IdentityWorkerOptions {
  sessions: SessionService;
  stores: IdentityStores;
  cookie?: SessionCookieOptions;
  sessionTtlSeconds?: number;
  /** Horloge serveur, alignée sur celle du service de session (tests). */
  now?: () => Date;
  createRequestId?: () => string;
  /** Handlers métier explicitement ouverts par la composition de persistance. */
  handlers?: Partial<Record<ApiRouteKey, ApiRouteHandler>>;
  /** Rapport de santé réel de la persistance (P0-C); absent = frontière nue. */
  health?: ApiHealthReporter;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps de requête JSON invalide.');
  }
}

/** Collection ADMIN de contrôle : frontière sécurisée, sans données métier. */
function adminControlPayload(resource: string, context: ApiRouteContext) {
  return {
    resource,
    scope: 'admin' as const,
    items: [] as unknown[],
    cursor: null,
    limit: context.page?.limit ?? 25,
    hasMore: false,
    persistence: 'not-configured' as const,
  };
}

export function createIdentityApiWorker(options: IdentityWorkerOptions): { fetch(request: Request): Promise<Response> } {
  const { sessions, stores } = options;
  const now = options.now ?? (() => new Date());

  const googleLogin: ApiRouteHandler = async context => {
    const body = await readJsonBody(context.request);
    // `sub`, `actorId`, `role` et `userId` envoyés par le client sont ignorés.
    const requestedRole = isSelfAssignableRole(body.requestedRole) ? body.requestedRole : undefined;
    const result = await sessions.loginWithGoogleCredential({
      credential: typeof body.credential === 'string' ? body.credential : '',
      requestedRole,
      intent: body.intent === 'register' ? 'register' : 'login',
    });

    const ttlSeconds = Math.max(
      0,
      Math.floor((Date.parse(result.expiresAt) - now().getTime()) / 1000),
    );
    const response = apiJsonResponse(
      toSessionDto(result.principal.actor, result.principal.user),
      result.created ? 201 : 200,
      context.requestId,
    );
    response.headers.append(
      'set-cookie',
      serializeSessionCookie(result.sessionToken, { ...options.cookie, maxAgeSeconds: ttlSeconds }),
    );
    return response;
  };

  const readSession: ApiRouteHandler = async context => {
    const principal = await sessions.getAuthenticatedActor(context.request);
    if (!principal) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
    return toSessionDto(principal.actor, principal.user);
  };

  const logout: ApiRouteHandler = async context => {
    await sessions.logout(context.request);
    const response = apiJsonResponse({ authenticated: false }, 200, context.requestId);
    response.headers.append('set-cookie', serializeExpiredSessionCookie(options.cookie));
    return response;
  };

  const adminUsers: ApiRouteHandler = async context => {
    const limit = context.page?.limit ?? 25;
    const users = await stores.users.list(limit);
    return {
      resource: 'users',
      scope: 'admin' as const,
      items: users.map(toAdminUserDto),
      cursor: null,
      limit,
      hasMore: false,
    };
  };

  const adminControl = (resource: string): ApiRouteHandler =>
    async context => adminControlPayload(resource, context);

  return createApiWorker({
    authenticate: async request => (await sessions.getAuthenticatedActor(request))?.actor ?? null,
    createRequestId: options.createRequestId,
    health: options.health,
    handlers: {
      'auth.google': googleLogin,
      'auth.google.credential': googleLogin,
      'auth.session': readSession,
      'auth.logout': logout,
      'me.read': readSession,
      'users.me.read': readSession,
      'admin.users.list': adminUsers,
      'admin.offers.list': adminControl('offers'),
      'admin.applications.list': adminControl('applications'),
      'admin.contracts.list': adminControl('contracts'),
      'admin.payments.list': adminControl('payments'),
      'admin.incidents.list': adminControl('incidents'),
      'admin.replacements.list': adminControl('replacements'),
      'admin.audit.list': adminControl('audit'),
      'admin.stats.read': async () => ({
        resource: 'stats',
        scope: 'admin' as const,
        persistence: 'not-configured' as const,
        metrics: {},
      }),
      ...options.handlers,
    },
  });
}
