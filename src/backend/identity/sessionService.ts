/**
 * Service de session serveur et acteur authentifié (Phase 2).
 *
 * login  → session créée (jeton opaque, cookie HttpOnly)
 * requête→ session reconnue (hash du jeton, expiration, révocation, compte actif)
 * logout → session révoquée (idempotent)
 *
 * Le rôle provient exclusivement de la ligne `users` chargée par le serveur.
 */

import type { AuthenticatedActor, GoogleCredentialVerifier } from '../productionContracts';
import { ApiError } from '../api/errors';
import { readSessionCookie } from './cookies';
import { newEntityId, newOpaqueSessionToken } from './ids';
import { isSelfAssignableRole, permissionsForRole, type SelfAssignableRole } from './permissions';
import type { IdentityStores, ServerUserRecord } from './stores';

export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface AuthenticatedPrincipal {
  actor: AuthenticatedActor;
  user: ServerUserRecord;
}

export interface GoogleLoginInput {
  credential: string;
  requestedRole?: SelfAssignableRole;
  intent?: 'login' | 'register';
}

export interface GoogleLoginResult {
  principal: AuthenticatedPrincipal;
  /** Jeton opaque à placer dans le cookie de session; jamais dans un corps JSON. */
  sessionToken: string;
  expiresAt: string;
  created: boolean;
}

export interface SessionServiceDependencies {
  stores: IdentityStores;
  googleVerifier: GoogleCredentialVerifier;
  now?: () => Date;
  sessionTtlSeconds?: number;
  cookieName?: string;
}

function toActor(user: ServerUserRecord, sessionId: string): AuthenticatedActor {
  return {
    id: user.id,
    role: user.role,
    permissions: permissionsForRole(user.role),
    sessionId,
  };
}

export interface SessionService {
  /** Unique source d'identité des handlers protégés. */
  getAuthenticatedActor(request: Request): Promise<AuthenticatedPrincipal | null>;
  loginWithGoogleCredential(input: GoogleLoginInput): Promise<GoogleLoginResult>;
  logout(request: Request): Promise<void>;
}

export function createSessionService(dependencies: SessionServiceDependencies): SessionService {
  const now = dependencies.now ?? (() => new Date());
  const ttl = dependencies.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const { stores } = dependencies;

  async function resolveSession(request: Request) {
    const token = readSessionCookie(request, dependencies.cookieName);
    if (!token) return null;
    const session = await stores.sessions.findByToken(token);
    if (!session) return null;
    if (session.revokedAt) return null;
    if (Date.parse(session.expiresAt) <= now().getTime()) return null;
    return session;
  }

  return {
    async getAuthenticatedActor(request: Request): Promise<AuthenticatedPrincipal | null> {
      const session = await resolveSession(request);
      if (!session) return null;
      const user = await stores.users.findById(session.userId);
      if (!user || user.status !== 'ACTIVE') return null;
      return { actor: toActor(user, session.id), user };
    },

    async loginWithGoogleCredential(input: GoogleLoginInput): Promise<GoogleLoginResult> {
      if (typeof input?.credential !== 'string' || input.credential.trim().length === 0) {
        throw new ApiError('VALIDATION_ERROR', 'Credential Google requis.');
      }
      if (input.requestedRole !== undefined && !isSelfAssignableRole(input.requestedRole)) {
        // Le rôle ADMIN n'est jamais attribué en self-service.
        throw new ApiError('VALIDATION_ERROR', 'Rôle demandé invalide.');
      }

      let identity;
      try {
        identity = await dependencies.googleVerifier.verifyCredential(input.credential);
      } catch {
        throw new ApiError('UNAUTHENTICATED', 'Credential Google invalide.');
      }
      if (!identity?.subject || !identity.emailVerified) {
        throw new ApiError('UNAUTHENTICATED', 'Credential Google invalide.');
      }

      const timestamp = now().toISOString();
      const link = await stores.identities.findByExternalSubject('GOOGLE', identity.subject);
      let user = link ? await stores.users.findById(link.userId) : null;
      let created = false;

      if (!user) {
        const existingByEmail = await stores.users.findByEmail(identity.email);
        if (existingByEmail) {
          user = existingByEmail;
        } else {
          user = await stores.users.create({
            id: newEntityId('usr'),
            role: input.requestedRole ?? 'CANDIDATE',
            status: 'ACTIVE',
            email: identity.email,
            displayName: identity.displayName ?? identity.email,
            avatarUrl: identity.avatarUrl,
          });
          created = true;
        }
        await stores.identities.link({
          userId: user.id,
          provider: 'GOOGLE',
          subject: identity.subject,
          verifiedEmail: identity.email,
          linkedAt: timestamp,
        });
      }

      if (user.status === 'BLOCKED') {
        throw new ApiError('FORBIDDEN', 'Compte bloqué.');
      }

      const sessionToken = newOpaqueSessionToken();
      const expiresAt = new Date(now().getTime() + ttl * 1000).toISOString();
      const session = await stores.sessions.create({
        userId: user.id,
        token: sessionToken,
        createdAt: timestamp,
        expiresAt,
      });

      return {
        principal: { actor: toActor(user, session.id), user },
        sessionToken,
        expiresAt,
        created,
      };
    },

    async logout(request: Request): Promise<void> {
      const session = await resolveSession(request);
      if (!session) return;
      await stores.sessions.revoke(session.id, now().toISOString());
    },
  };
}
