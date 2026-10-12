/** UI adapter only. No new endpoint, cookie, RBAC or local credential store. */
import { HttpApiClient, ApiClientError } from '../repositories/apiClient';
import { mapServerSessionToProfile } from '../repositories/sessionMapping';
import { STATE_GUARD_KEYS, type StateGuardKey } from '../design-system/generated/stateGuardCatalog';
import { sanitizeCorrelationId } from '../design-system/correlation';

export type PublicRole = 'EMPLOYER' | 'CANDIDATE';
export class PublicAuth {
  constructor(private readonly http: HttpApiClient) {}
  async session(signal?: AbortSignal) {
    const payload = await this.http.request<unknown>('/auth/session', { signal });
    const user = mapServerSessionToProfile(payload);
    if (!user) throw new ApiClientError('Session invalide', 401, 'INVALID_RESPONSE');
    return user;
  }
  async google(credential: string, requestedRole: PublicRole, intent: 'login' | 'register', signal?: AbortSignal) {
    await this.http.request('/auth/google/credential', {
      method: 'POST', body: { credential, requestedRole, intent }, signal,
    });
    // Server is the authority, never decode a JWT to grant access.
    return this.session(signal);
  }
  logout(signal?: AbortSignal) { return this.http.request<void>('/auth/logout', { method: 'POST', body: {}, signal }); }
}

export function publicError(error: unknown): { state: StateGuardKey; correlationId?: string } {
  if (!(error instanceof ApiClientError)) return { state: '500' };
  const key = String(error.status) as StateGuardKey;
  return {
    state: error.status === 0 ? 'offline' : STATE_GUARD_KEYS.includes(key) ? key : '500',
    correlationId: sanitizeCorrelationId(error.requestId) ?? undefined,
  };
}

/**
 * PUB-AUTH-2 — lecture des seuls faits serveur exploitables par les écrans
 * publics restants. Aucune de ces fonctions n'invente de valeur : elles
 * n'extraient que ce que l'API a réellement répondu.
 */

export interface LoginFailure {
  /** État SYS affiché (catalogue généré) + corrélation filtrée. */
  readonly failure: { state: ReturnType<typeof publicError>['state']; correlationId?: string };
  /** Le serveur a répondu 429 : la limitation de débit du Worker s'est déclenchée. */
  readonly throttled: boolean;
  /** Temporisation TRANSMISE par le serveur (details.retryAfterSeconds), jamais estimée. */
  readonly retryAfterSeconds: number | null;
  /**
   * 403 du service de session sur la connexion Google : le compte n'est pas ACTIF.
   * L'API ne transmet AUCUN motif (blocage sécurité, litige, manquement) : la
   * sortie proposée est l'écran PUB-09, sans motif ni durée inventés.
   */
  readonly inactiveAccount: boolean;
}

/**
 * Valeur de temporisation réellement renvoyée par le limiteur du Worker
 * (`error.details.retryAfterSeconds` sur un 429). Hors de cette forme, `null` :
 * aucun compteur, aucun décompte et aucune estimation locale ne sont fabriqués.
 */
export function retryAfterSecondsFrom(error: unknown): number | null {
  if (!(error instanceof ApiClientError) || error.status !== 429) return null;
  const value = Number(error.details?.retryAfterSeconds?.[0]);
  return Number.isInteger(value) && value >= 1 && value <= 3600 ? value : null;
}

export function describeLoginFailure(cause: unknown): LoginFailure {
  return {
    failure: publicError(cause),
    throttled: cause instanceof ApiClientError && cause.status === 429,
    retryAfterSeconds: retryAfterSecondsFrom(cause),
    inactiveAccount: cause instanceof ApiClientError && cause.status === 403,
  };
}

export type SessionProbe =
  | { readonly state: 'active'; readonly role: string }
  | { readonly state: 'none' }
  | { readonly state: 'offline' }
  | { readonly state: 'error' };

/**
 * Interroge le contrat EXISTANT `GET /api/v1/auth/session`.
 *
 * - `active` : le serveur confirme une session et un compte ACTIF (et son rôle) ;
 * - `none`   : 401/403 — aucune session active n'est confirmée. Ce n'est PAS la
 *              preuve d'un blocage : le motif d'un éventuel blocage n'est exposé
 *              par aucun contrat (voir PUB-09 dans `gaps.ts`) ;
 * - `offline`/`error` : aucune conclusion sur la session n'est tirée. `error`
 *   couvre aussi l'absence d'API configurée (mode démo) : sans appel réel, il
 *   n'y a ni session confirmée ni session infirmée.
 */
export async function probeSession(auth: PublicAuth | null, signal?: AbortSignal): Promise<SessionProbe> {
  if (!auth) return { state: 'error' };
  try {
    const user = await auth.session(signal);
    return { state: 'active', role: user.role };
  } catch (cause) {
    const failure = publicError(cause);
    if (failure.state === '401' || failure.state === '403') return { state: 'none' };
    return { state: failure.state === 'offline' ? 'offline' : 'error' };
  }
}

/**
 * Délai d'attente de l'écran dépassé : aucune réponse serveur n'a été reçue.
 * Constante explicite pour que l'interface n'ait jamais à inventer un état.
 */
export const LOGIN_TIMEOUT_FAILURE: LoginFailure = {
  failure: { state: '504' },
  throttled: false,
  retryAfterSeconds: null,
  inactiveAccount: false,
};
