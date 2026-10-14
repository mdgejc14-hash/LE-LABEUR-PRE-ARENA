/**
 * Service de session serveur et acteur authentifié.
 *
 * login  → credential Google vérifié → identité résolue/créée → session durable
 * requête→ hash du jeton, expiration, révocation, compte actif et RBAC persisté
 * logout → session révoquée (idempotent)
 *
 * L'utilisateur, son rôle et ses permissions proviennent exclusivement des
 * stores serveur; le navigateur ne peut fournir aucun de ces attributs.
 */

import type { AuthenticatedActor, GoogleCredentialVerifier, Permission } from '../productionContracts';
import { ApiError } from '../api/errors';
import { readSessionCookie } from './cookies';
import { newEntityId, newOpaqueSessionToken } from './ids';
import { isSelfAssignableRole, type SelfAssignableRole } from './permissions';
import type { IdentityStoreTransaction, IdentityStores, ServerUserRecord } from './stores';

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

function toActor(user: ServerUserRecord, sessionId: string, permissions: readonly Permission[]): AuthenticatedActor {
  return {
    id: user.id,
    role: user.role,
    permissions: [...permissions],
    sessionId,
  };
}

async function resolveSession(
  transaction: IdentityStoreTransaction,
  token: string,
): Promise<Awaited<ReturnType<IdentityStoreTransaction['sessions']['findByToken']>>> {
  return transaction.sessions.findByToken(token);
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

  return {
    async getAuthenticatedActor(request: Request): Promise<AuthenticatedPrincipal | null> {
      const token = readSessionCookie(request, dependencies.cookieName);
      if (!token) return null;

      return stores.transaction(async transaction => {
        const session = await resolveSession(transaction, token);
        if (!session) return null;
        if (session.revokedAt) return null;
        if (Date.parse(session.expiresAt) <= now().getTime()) return null;

        const user = await transaction.users.findById(session.userId);
        if (!user || user.status !== 'ACTIVE') return null;
        const permissions = await transaction.permissions.listEffectivePermissions(user.id, user.role);
        return { actor: toActor(user, session.id, permissions), user };
      });
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
      if (
        !identity
        || typeof identity.subject !== 'string'
        || identity.subject.trim().length === 0
        || typeof identity.email !== 'string'
        || identity.email.trim().length === 0
        || !identity.emailVerified
      ) {
        throw new ApiError('UNAUTHENTICATED', 'Credential Google invalide.');
      }

      const verifiedEmail = identity.email.trim().toLowerCase();
      const sessionToken = newOpaqueSessionToken();
      const timestamp = now().toISOString();
      const expiresAt = new Date(now().getTime() + ttl * 1000).toISOString();

      // Une même transaction couvre l'utilisateur, le lien Google, la session
      // et les permissions qui seront renvoyées. Une erreur à n'importe quelle
      // étape annule toutes les écritures PostgreSQL.
      return stores.transaction(async transaction => {
        await transaction.lockIdentityResolution('GOOGLE', identity.subject, verifiedEmail);

        const link = await transaction.identities.findByExternalSubject('GOOGLE', identity.subject);
        let user: ServerUserRecord | null = link
          ? await transaction.users.findById(link.userId)
          : null;
        let created = false;

        if (link && !user) {
          throw new Error('L’identité Google persistée référence un utilisateur absent.');
        }

        if (!user) {
          user = await transaction.users.findByEmail(verifiedEmail);
          if (!user) {
            user = await transaction.users.create({
              id: newEntityId('usr'),
              role: input.requestedRole ?? 'CANDIDATE',
              status: 'ACTIVE',
              email: verifiedEmail,
              displayName: identity.displayName?.trim() || verifiedEmail,
              avatarUrl: identity.avatarUrl,
            });
            created = true;
          }

          const persistedLink = await transaction.identities.link({
            userId: user.id,
            provider: 'GOOGLE',
            subject: identity.subject,
            verifiedEmail,
            linkedAt: timestamp,
          });
          if (persistedLink.userId !== user.id) {
            // Défense supplémentaire en cas de conflit de clé unique observé
            // par un autre processus; `user_id` existant reste autoritaire.
            const canonicalUser = await transaction.users.findById(persistedLink.userId);
            if (!canonicalUser) throw new Error('L’identité Google canonique référence un utilisateur absent.');
            user = canonicalUser;
            created = false;
          }
        }

        if (user.status !== 'ACTIVE') {
          throw new ApiError('FORBIDDEN', user.status === 'BLOCKED' ? 'Compte bloqué.' : 'Compte non actif.');
        }

        const session = await transaction.sessions.create({
          userId: user.id,
          token: sessionToken,
          createdAt: timestamp,
          expiresAt,
        });
        const permissions = await transaction.permissions.listEffectivePermissions(user.id, user.role);
        return {
          principal: { actor: toActor(user, session.id, permissions), user },
          sessionToken,
          expiresAt,
          created,
        };
      });
    },

    async logout(request: Request): Promise<void> {
      const token = readSessionCookie(request, dependencies.cookieName);
      if (!token) return;
      await stores.transaction(async transaction => {
        const session = await resolveSession(transaction, token);
        if (!session || session.revokedAt) return;
        await transaction.sessions.revoke(session.id, now().toISOString());
      });
    },
  };
}
