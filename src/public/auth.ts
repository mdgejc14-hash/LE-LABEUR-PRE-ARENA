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
