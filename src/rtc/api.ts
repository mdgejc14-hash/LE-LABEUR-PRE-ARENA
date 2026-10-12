/**
 * RTC — accès frontend aux routes BACKEND EXISTANTES (tranche RTC-1).
 *
 * VÉRIFICATION DES SOURCES AVANT CODAGE (inspection de
 * `src/backend/api/routeContracts.ts`, de la composition du worker
 * `src/backend/api/entry.ts` et de `src/backend/webrtc/*`) :
 *
 *  - `webrtc.sessions.*` (10 contrats) : SEULE capacité serveur réelle pour
 *    les Sessions temps réel. Handlers installés par `createWebRtcApiHandlers`
 *    quand une persistance PostgreSQL est composée (`webrtcAvailable`) ;
 *    scope `self`/`participant`, rôles EMPLOYER / CANDIDATE, contrat CONTRACT
 *    ACTIVE rechargé à chaque opération, aucun override ADMIN (403 vérifié
 *    pour ADMIN par P4G-7 sur `GET /api/v1/my/webrtc-sessions`).
 *  - `calls.*` (8 contrats : mine.list, create, accept, reject, end,
 *    signaling-credential, ice-configuration, call-signaling-credential) et
 *    `admin.calls.list` : contrats SANS handler — 501 réel, jamais appelés.
 *  - les références de design des fiches (`GET /v1/calls/:id/precheck`,
 *    `/invitation`, `/accept`, `/decline`, `/connection-state`, `/downgrade`,
 *    `/cancel`, `/tracks`, `/notes`, `/share`, `/hangup`, `/summary`,
 *    `/actions`, `/recording`, `/report`, `/history`, `/diagnostics`,
 *    `/quality/profile`, `/consent`, `/consent/revoke`) ne figurent dans
 *    AUCUN contrat serveur (`/api/v1/…`) : 404, déclarées BACKEND_GAP.
 *  - `webrtc.sessions.credentials.create`, `signaling.send/poll` et
 *    `transport-connected` ont des handlers réels mais servent UNIQUEMENT un
 *    client de signalisation média (échange SDP/ICE, credential opaque
 *    `X-WebRTC-Credential`) : aucun secret de signalisation, aucune adresse
 *    de serveur et aucun credential n'est affiché ni manipulé par cette
 *    tranche (§3.6, comme ADM-61). Ils ne sont jamais appelés ici.
 *  - le transport WebSocket legacy (`src/services/calls/*`, jetons de
 *    démonstration `VITE_SIGNALING_*`, route `calls.signaling-credential`
 *    à 501) n'est pas une capacité produit : jamais utilisé.
 *
 * Cette tranche appelle donc, en lecture comme en commande :
 *  - `GET /api/v1/my/webrtc-sessions` (RTC-06 : journal des Sessions) ;
 *  - `POST /api/v1/webrtc-sessions {entityType: CONTRACT, entityId}` (RTC-06 :
 *    « Ouvrir une Session », clé d'idempotence explicite) ;
 *  - `GET /api/v1/webrtc-sessions/:sessionId` (contexte réel des fiches) ;
 *  - `POST /api/v1/webrtc-sessions/:sessionId/join` (RTC-01 « Rejoindre »,
 *    RTC-02 « Rejoindre » = acceptation réelle ; l'initiateur reçoit un
 *    conflit honnête, le refus n'a aucune route et reste désactivé) ;
 *  - `POST /api/v1/webrtc-sessions/:sessionId/close` (RTC-04 « Raccrocher »,
 *    clé d'idempotence explicite) ;
 *  - `POST /api/v1/webrtc-sessions/:sessionId/ice-configuration` (RTC-07 :
 *    état du relais — `state` et `reason` UNIQUEMENT, jamais les adresses,
 *    identifiants ou secrets de `iceServers`).
 *
 * Règles absolues :
 *  - aucun endpoint n'est créé, renommé ou contourné ; chaque chemin appelé
 *    ici existe déjà dans `src/backend/api/routeContracts.ts` (vérifié par
 *    test) ;
 *  - les DTO sont importés EN TYPE depuis le backend (aucune dépendance
 *    runtime, aucun contrat dupliqué) ;
 *  - transport : `HttpApiClient` same-origin, cookie HttpOnly,
 *    `credentials: 'include'`, `cache: 'no-store'` (fondation P0/P1) ;
 *  - les commandes portent une clé d'idempotence explicite ;
 *  - les permissions restent déterminées par le serveur : ce client ne les
 *    lit que pour afficher l'état réel (jamais pour les décider).
 */

import type {
  WebRtcIceConfiguration,
  WebRtcSessionStatus,
  WebRtcSessionView,
} from '../backend/productionContracts';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';

export type { WebRtcIceConfiguration, WebRtcSessionStatus, WebRtcSessionView };

/** Chemins réellement appelés par cette tranche (vérifiés contre `routeContracts.ts`). */
export const RTC_API_PATHS: readonly string[] = [
  '/api/v1/auth/session',
  '/api/v1/my/webrtc-sessions',
  '/api/v1/webrtc-sessions',
  '/api/v1/webrtc-sessions/:sessionId',
  '/api/v1/webrtc-sessions/:sessionId/join',
  '/api/v1/webrtc-sessions/:sessionId/ice-configuration',
  '/api/v1/webrtc-sessions/:sessionId/close',
];

/** Clé d'idempotence explicite (jamais réutilisée entre deux commandes). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `rtc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface RtcPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly cursor: string | null;
}

function page<T>(payload: unknown): RtcPage<T> {
  const value = payload as { items?: unknown; hasMore?: unknown; cursor?: unknown } | null;
  if (!value || !Array.isArray(value.items)) throw new ApiClientError('Réponse paginée invalide.', 500, 'INVALID_RESPONSE');
  return {
    items: value.items as T[],
    hasMore: Boolean(value.hasMore),
    cursor: typeof value.cursor === 'string' ? value.cursor : null,
  };
}

export interface RtcActor {
  readonly id: string;
  readonly role: string;
  readonly status: string;
  readonly displayName: string;
  readonly email?: string;
}

export interface RtcSession {
  readonly actor: RtcActor;
  readonly permissions: readonly string[];
}

export interface ListOptions {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly signal?: AbortSignal;
}

export class RtcApi {
  constructor(private readonly client: HttpApiClient) {}

  private list<T>(path: string, options: ListOptions = {}): Promise<RtcPage<T>> {
    return this.client
      .request<unknown>(path, {
        query: { limit: options.limit ?? 25, cursor: options.cursor ?? null },
        signal: options.signal,
      })
      .then((payload) => page<T>(payload));
  }

  /** Session serveur réelle : rôle, statut de compte et permissions. */
  session(signal?: AbortSignal): Promise<RtcSession> {
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

  /* ── Sessions temps réel (participant réel d'un Contrat actif) ── */

  /** Journal des Sessions du compte (RTC-06). */
  mySessions(options: ListOptions = {}): Promise<RtcPage<WebRtcSessionView>> {
    return this.list<WebRtcSessionView>('/my/webrtc-sessions', options);
  }

  /**
   * Ouverture d'une Session liée à un Contrat actif (RTC-06
   * « Ouvrir une Session »). Seule une partie réelle du Contrat peut initier ;
   * le serveur refuse honnêtement tout autre cas (Contrat introuvable ou non
   * actif, Session déjà ouverte pour ce Contrat).
   */
  createSession(contractId: string, signal?: AbortSignal): Promise<WebRtcSessionView> {
    return this.client.request<WebRtcSessionView>('/webrtc-sessions', {
      method: 'POST',
      body: { entityType: 'CONTRACT', entityId: contractId },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** Lecture d'une Session (contexte réel des fiches RTC-01 → RTC-05, RTC-07, RTC-08). */
  readSession(sessionId: string, signal?: AbortSignal): Promise<WebRtcSessionView> {
    return this.client.request<WebRtcSessionView>(`/webrtc-sessions/${encodeURIComponent(sessionId)}`, { signal });
  }

  /**
   * Entrée dans la Session (RTC-01 « Rejoindre », RTC-02 « Rejoindre »).
   * L'initiateur est déjà entré à la création : le serveur répond alors un
   * conflit, affiché honnêtement (jamais une entrée simulée).
   */
  joinSession(sessionId: string, signal?: AbortSignal): Promise<WebRtcSessionView> {
    return this.client.request<WebRtcSessionView>(`/webrtc-sessions/${encodeURIComponent(sessionId)}/join`, {
      method: 'POST',
      body: {},
      signal,
    });
  }

  /**
   * État réel de la configuration ICE (RTC-07). Seuls `state` et `reason`
   * sont affichables ; `iceServers` (adresses, identifiants, secrets) ne
   * doit jamais être rendu (§3.6).
   */
  iceConfiguration(sessionId: string, signal?: AbortSignal): Promise<WebRtcIceConfiguration> {
    return this.client.request<WebRtcIceConfiguration>(`/webrtc-sessions/${encodeURIComponent(sessionId)}/ice-configuration`, {
      method: 'POST',
      body: {},
      signal,
    });
  }

  /** Fin de Session (RTC-04 « Raccrocher »). */
  closeSession(sessionId: string, signal?: AbortSignal): Promise<WebRtcSessionView> {
    return this.client.request<WebRtcSessionView>(`/webrtc-sessions/${encodeURIComponent(sessionId)}/close`, {
      method: 'POST',
      body: {},
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }
}
