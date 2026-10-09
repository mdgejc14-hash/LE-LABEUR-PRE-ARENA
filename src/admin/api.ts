/**
 * ADM — accès frontend aux routes BACKEND EXISTANTES.
 *
 * Règles absolues :
 *  - aucun endpoint n'est créé, renommé ou contourné ; chaque chemin appelé ici
 *    existe déjà dans `src/backend/api/routeContracts.ts` (vérifié par test) ;
 *  - les DTO non exposés par `src/types/index.ts` sont importés EN TYPE depuis
 *    le backend (aucune dépendance runtime, aucun contrat dupliqué) ;
 *  - transport : `HttpApiClient` same-origin, cookie HttpOnly,
 *    `credentials: 'include'`, `cache: 'no-store'` (fondation P0/P1) ;
 *  - les commandes portent une clé d'idempotence explicite ;
 *  - les permissions ADMIN restent déterminées par le serveur : ce client ne
 *    les lit que pour afficher l'état réel (jamais pour les décider).
 */

import type { AdminUserDto } from '../backend/identity/dto';
import type {
  MissionQualificationRecord,
  QualificationDecision,
} from '../backend/matching/records';
import type { QualificationReviewQueueItem } from '../backend/matching/matchingRepository';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';

export type { AdminUserDto, MissionQualificationRecord, QualificationDecision, QualificationReviewQueueItem };

/** Session serveur réelle : rôle, statut de compte et permissions dérivées serveur. */
export interface AdminSession {
  readonly actor: { id: string; role: string; status: string; displayName: string; email?: string };
  readonly permissions: readonly string[];
}

export interface AdminPage<T> {
  readonly items: T[];
  readonly hasMore: boolean;
  readonly cursor: string | null;
}

/** Réponse réelle de admin.stats.read (frontière de contrôle : métriques vides). */
export interface AdminStatsPayload {
  readonly resource: string;
  readonly scope: string;
  readonly persistence: string;
  readonly metrics: Record<string, unknown>;
}

/** Réponse réelle des collections de contrôle ADMIN (sans données métier). */
export interface AdminControlPayload {
  readonly resource: string;
  readonly scope: string;
  readonly items: unknown[];
  readonly cursor: string | null;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly persistence: string;
}

/** Chemins réellement appelés par cette interface (gardés par test contre routeContracts.ts). */
export const ADMIN_API_PATHS: readonly string[] = [
  '/api/v1/auth/session',
  '/api/v1/admin/users',
  '/api/v1/admin/users/:userId/block',
  '/api/v1/admin/qualifications/review',
  '/api/v1/admin/qualifications/:qualificationId/review',
  '/api/v1/admin/stats',
  '/api/v1/admin/audit',
  '/api/v1/admin/incidents',
];

/** Clé d'idempotence explicite (jamais réutilisée entre deux commandes). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function page<T>(payload: unknown): AdminPage<T> {
  const value = payload as { items?: unknown; hasMore?: unknown; cursor?: unknown } | null;
  if (!value || !Array.isArray(value.items)) throw new ApiClientError('Réponse paginée invalide.', 500, 'INVALID_RESPONSE');
  return {
    items: value.items as T[],
    hasMore: Boolean(value.hasMore),
    cursor: typeof value.cursor === 'string' ? value.cursor : null,
  };
}

export interface ListOptions {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly signal?: AbortSignal;
}

/** Décisions réellement acceptées par le serveur pour une revue humaine. */
export const REVIEW_DECISION_OPTIONS: readonly QualificationDecision[] = ['ELIGIBLE_FOR_INDEPENDENT', 'BLOCKED'];

export class AdminApi {
  constructor(private readonly client: HttpApiClient) {}

  private list<T>(path: string, options: ListOptions = {}): Promise<AdminPage<T>> {
    return this.client
      .request<unknown>(path, {
        query: { limit: options.limit ?? 25, cursor: options.cursor ?? null },
        signal: options.signal,
      })
      .then((payload) => page<T>(payload));
  }

  /** Session serveur réelle : rôle, statut de compte et permissions. */
  session(signal?: AbortSignal): Promise<AdminSession> {
    return this.client
      .request<{ user?: { id?: unknown; role?: unknown; status?: unknown; displayName?: unknown; email?: unknown }; permissions?: unknown }>('/auth/session', { signal })
      .then((payload) => {
        const actor = payload.user;
        if (!actor || typeof actor.id !== 'string' || typeof actor.role !== 'string') {
          throw new ApiClientError('Session serveur illisible.', 401, 'INVALID_RESPONSE');
        }
        return {
          actor: {
            id: actor.id,
            role: actor.role,
            status: typeof actor.status === 'string' ? actor.status : 'UNKNOWN',
            displayName: typeof actor.displayName === 'string' ? actor.displayName : '',
            ...(typeof actor.email === 'string' ? { email: actor.email } : {}),
          },
          permissions: Array.isArray(payload.permissions) ? payload.permissions.filter((item): item is string => typeof item === 'string') : [],
        };
      });
  }

  /* ── Utilisateurs (registre ADMIN réel) ── */

  users(options: ListOptions = {}): Promise<AdminPage<AdminUserDto>> {
    return this.list<AdminUserDto>('/admin/users', options);
  }

  /**
   * Blocage ADMIN réel : POST /api/v1/admin/users/:userId/block { reason }.
   * Le serveur exige la permission users:block, un motif explicite, et pose
   * un verrouillage de ligne + révocation des sessions + audit USER_BLOCKED.
   */
  blockUser(userId: string, reason: string, signal?: AbortSignal): Promise<AdminUserDto> {
    return this.client.request<AdminUserDto>(`/admin/users/${encodeURIComponent(userId)}/block`, {
      method: 'POST',
      body: { reason },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Qualification (file de revue et décision humaine réelles) ── */

  reviewQueue(options: ListOptions = {}): Promise<AdminPage<QualificationReviewQueueItem>> {
    return this.list<QualificationReviewQueueItem>('/admin/qualifications/review', options);
  }

  /**
   * Décision de revue humaine réelle : POST /api/v1/admin/qualifications/:qualificationId/review
   * { decision, reason }. Idempotente, auditée (MISSION_QUALIFICATION_REVIEWED),
   * à usage unique (une qualification déjà revue renvoie un conflit 409).
   */
  decideReview(qualificationId: string, decision: QualificationDecision, reason: string, signal?: AbortSignal): Promise<MissionQualificationRecord> {
    return this.client.request<MissionQualificationRecord>(`/admin/qualifications/${encodeURIComponent(qualificationId)}/review`, {
      method: 'POST',
      body: { decision, reason },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Frontières de contrôle ADMIN (réponses réelles, sans données métier) ── */

  stats(signal?: AbortSignal): Promise<AdminStatsPayload> {
    return this.client.request<AdminStatsPayload>('/admin/stats', { signal });
  }

  auditLog(options: ListOptions = {}): Promise<AdminControlPayload> {
    return this.list<unknown>('/admin/audit', options) as unknown as Promise<AdminControlPayload>;
  }

  incidents(options: ListOptions = {}): Promise<AdminControlPayload> {
    return this.list<unknown>('/admin/incidents', options) as unknown as Promise<AdminControlPayload>;
  }
}

export { ApiClientError, HttpApiClient };
