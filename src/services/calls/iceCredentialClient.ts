import { createApiRepository } from '../../repositories/apiRepository';
import { getRepositoryMode } from '../../repositories/provider';
import { SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS, type ShortLivedIceServerCredential } from '../../backend/productionContracts';

function isTurnUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return normalized.startsWith('turn:') || normalized.startsWith('turns:');
}

export interface MockTurnEnvironment {
  server?: string;
  username?: string;
  credential?: string;
  expiresAt?: string;
}

/** Optional demo TURN settings are accepted only when the credential is short-lived. */
export function createMockTurnIceServers(config: MockTurnEnvironment, nowMs = Date.now()): RTCIceServer[] {
  const server = config.server?.trim() ?? '';
  const username = config.username?.trim() ?? '';
  const credential = config.credential?.trim() ?? '';
  if (!server && !username && !credential && !config.expiresAt) return [];
  if (!server || !/^(turn|turns):/i.test(server)) throw new Error('URL TURN de démonstration invalide.');
  if (!username && !credential) return [{ urls: server }];
  if (!username || !credential || !config.expiresAt) throw new Error('Credential TURN de démonstration incomplet ou sans expiration.');
  const expiresAtMs = new Date(config.expiresAt).getTime();
  const lifetime = expiresAtMs - nowMs;
  if (!Number.isFinite(expiresAtMs) || lifetime <= 0 || lifetime > SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS * 1000) {
    throw new Error('Credential TURN de démonstration expiré ou trop long.');
  }
  return [{ urls: server, username, credential }];
}

function toRtcIceServer(input: ShortLivedIceServerCredential): RTCIceServer {
  const urls = typeof input.urls === 'string' ? [input.urls] : [...input.urls];
  if (urls.length === 0 || urls.some(url => !/^(stun|stuns|turn|turns):/i.test(url))) {
    throw new Error('Configuration ICE invalide.');
  }
  if (urls.some(isTurnUrl) && (!input.username || !input.credential)) {
    throw new Error('Credential TURN temporaire manquant.');
  }
  return {
    urls: urls.length === 1 ? urls[0] : urls,
    ...(input.username ? { username: input.username } : {}),
    ...(input.credential ? { credential: input.credential } : {}),
  };
}

/**
 * Production TURN credentials are fetched for the active call through the
 * authenticated API session. The mock path uses public STUN only and never
 * embeds a long-lived TURN username/password in a VITE_* bundle.
 */
export async function requestIceServersForCall(callId: string): Promise<RTCIceServer[]> {
  if (getRepositoryMode() !== 'api') {
    const env = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
    return createMockTurnIceServers({
      server: String(env?.VITE_TURN_SERVER ?? ''),
      username: String(env?.VITE_TURN_USERNAME ?? ''),
      credential: String(env?.VITE_TURN_CREDENTIAL ?? ''),
      expiresAt: String(env?.VITE_TURN_EXPIRES_AT ?? ''),
    });
  }
  if (!callId.trim()) throw new Error('Identifiant d’appel requis pour la configuration ICE.');

  const configuration = await createApiRepository().calls.getIceConfiguration(callId);
  const expiresAt = new Date(configuration.expiresAt).getTime();
  const lifetime = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || lifetime <= 0 || lifetime > SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS * 1000) {
    throw new Error('La configuration ICE temporaire est expirée ou invalide.');
  }
  return configuration.iceServers.map(toRtcIceServer);
}
