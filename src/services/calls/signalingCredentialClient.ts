import { createApiRepository } from '../../repositories/apiRepository';
import { getRepositoryMode } from '../../repositories/provider';
import { SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS, type ShortLivedSignalingCredential } from '../../backend/productionContracts';

const MAX_LIFETIME_MS = SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS * 1000;

interface MockTokenClaims {
  userId: string;
  exp: number;
}

function decodeMockTokenClaims(token: string): MockTokenClaims {
  const payloadPart = token.split('.')[0];
  if (!payloadPart) throw new Error('Credential signaling de démonstration invalide.');
  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(normalized), character => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Partial<MockTokenClaims>;
    if (typeof claims.userId !== 'string' || typeof claims.exp !== 'number') {
      throw new Error('claims invalides');
    }
    return { userId: claims.userId, exp: claims.exp };
  } catch {
    throw new Error('Credential signaling de démonstration invalide.');
  }
}

/** Pure validation seam for short-lived, pre-issued mock/demo tokens. */
export function createMockSignalingCredential(
  token: string,
  endpoint: string,
  userId: string,
  nowMs = Date.now(),
): ShortLivedSignalingCredential {
  if (!token || !userId) throw new Error('Credential signaling de démonstration manquant.');
  const claims = decodeMockTokenClaims(token);
  const expiresAtMs = claims.exp * 1000;
  const lifetime = expiresAtMs - nowMs;
  if (claims.userId !== userId || !Number.isFinite(expiresAtMs) || lifetime <= 0 || lifetime > MAX_LIFETIME_MS) {
    throw new Error('Credential signaling de démonstration expiré, trop long ou lié à un autre compte.');
  }
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error('Endpoint signaling de démonstration invalide.');
  }
  if (parsedEndpoint.protocol !== 'wss:') throw new Error('Le signaling doit utiliser WebSocket sécurisé (wss).');
  return { credential: token, endpoint: parsedEndpoint.toString(), expiresAt: new Date(expiresAtMs).toISOString() };
}

function getMockEnvironment(): { token: string; endpoint: string } {
  const env = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  return {
    token: String(env?.VITE_SIGNALING_TOKEN ?? ''),
    endpoint: String(env?.VITE_SIGNALING_URL ?? ''),
  };
}

/**
 * API mode obtains credentials only with the authenticated server session.
 * Mock/demo mode retains the existing WebSocket call flow when supplied a
 * server-signed, short-lived (maximum five minutes) demo token. The value is
 * public to the browser and must never be a signing key or permanent token.
 */
export async function requestSignalingCredential(userId: string): Promise<ShortLivedSignalingCredential> {
  if (getRepositoryMode() === 'mock') {
    const mock = getMockEnvironment();
    return createMockSignalingCredential(mock.token, mock.endpoint, userId);
  }

  const result = await createApiRepository().calls.issueSignalingCredential();
  const expiresAt = new Date(result.expiresAt).getTime();
  const lifetime = expiresAt - Date.now();
  if (!result.credential || !Number.isFinite(expiresAt) || lifetime <= 0 || lifetime > MAX_LIFETIME_MS) {
    throw new Error('Credential signaling expiré ou invalide.');
  }
  return result;
}
