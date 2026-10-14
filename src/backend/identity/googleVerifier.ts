/**
 * Vérification serveur du credential Google Identity Services.
 *
 * Le navigateur n'est jamais une autorité d'identité : seul le JWT signé est
 * accepté, sa signature RS256 est contrôlée contre les clés publiques Google,
 * puis `iss`, `aud`, `exp`, `iat` et `email_verified` sont validés. Le `sub`
 * vérifié est le seul identifiant externe retenu.
 *
 * Aucun secret Google n'est requis côté serveur pour cette vérification, et le
 * `client_id` (public) ne doit pas transiter par un secret de bundle.
 */

import type { GoogleCredentialVerifier, GoogleExternalIdentity } from '../productionContracts';
import { base64UrlDecode } from './ids';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const DEFAULT_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export class GoogleCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleCredentialError';
  }
}

interface GoogleJwtHeader {
  alg?: string;
  kid?: string;
}

interface GoogleJwtPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}

interface JsonWebKey_ extends JsonWebKey {
  kid?: string;
}

function decodeJsonSegment<T>(segment: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
  } catch {
    throw new GoogleCredentialError('Credential Google illisible.');
  }
}

export interface GoogleVerifierOptions {
  /** `client_id` OAuth public attendu dans `aud`. */
  audience: string;
  jwksUrl?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  /** Tolérance d'horloge en secondes. */
  clockSkewSeconds?: number;
}

/** Vérificateur réel, utilisable dans le Worker dès qu'un `audience` est configuré. */
export function createGoogleCredentialVerifier(options: GoogleVerifierOptions): GoogleCredentialVerifier {
  const fetcher = options.fetcher ?? fetch;
  const jwksUrl = options.jwksUrl ?? DEFAULT_JWKS_URL;
  const now = options.now ?? (() => new Date());
  const skew = options.clockSkewSeconds ?? 60;
  let cachedKeys: { keys: JsonWebKey_[]; fetchedAt: number } | null = null;

  async function loadKeys(): Promise<JsonWebKey_[]> {
    if (cachedKeys && Date.now() - cachedKeys.fetchedAt < 60 * 60 * 1000) return cachedKeys.keys;
    const response = await fetcher(jwksUrl, { method: 'GET' });
    if (!response.ok) throw new GoogleCredentialError('Clés publiques Google indisponibles.');
    const body = await response.json() as { keys?: JsonWebKey_[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      throw new GoogleCredentialError('Clés publiques Google indisponibles.');
    }
    cachedKeys = { keys: body.keys, fetchedAt: Date.now() };
    return body.keys;
  }

  return {
    async verifyCredential(credential: string): Promise<GoogleExternalIdentity> {
      if (typeof credential !== 'string' || credential.split('.').length !== 3) {
        throw new GoogleCredentialError('Credential Google invalide.');
      }
      const [headerSegment, payloadSegment, signatureSegment] = credential.split('.');
      const header = decodeJsonSegment<GoogleJwtHeader>(headerSegment);
      if (header.alg !== 'RS256' || !header.kid) throw new GoogleCredentialError('Algorithme de credential non supporté.');

      const keys = await loadKeys();
      const jwk = keys.find(key => key.kid === header.kid);
      if (!jwk) throw new GoogleCredentialError('Clé de signature Google inconnue.');

      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const signatureValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        base64UrlDecode(signatureSegment),
        new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
      );
      if (!signatureValid) throw new GoogleCredentialError('Signature du credential Google invalide.');

      const payload = decodeJsonSegment<GoogleJwtPayload>(payloadSegment);
      const nowSeconds = Math.floor(now().getTime() / 1000);
      if (!payload.iss || !GOOGLE_ISSUERS.includes(payload.iss)) throw new GoogleCredentialError('Émetteur du credential invalide.');
      if (payload.aud !== options.audience) throw new GoogleCredentialError('Audience du credential invalide.');
      if (typeof payload.exp !== 'number' || payload.exp + skew < nowSeconds) throw new GoogleCredentialError('Credential Google expiré.');
      if (typeof payload.iat === 'number' && payload.iat - skew > nowSeconds) throw new GoogleCredentialError('Credential Google non encore valide.');
      if (!payload.sub) throw new GoogleCredentialError('Identifiant Google absent.');
      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      if (!payload.email || !emailVerified) throw new GoogleCredentialError('Adresse Google non vérifiée.');

      return {
        subject: payload.sub,
        email: payload.email.trim().toLowerCase(),
        emailVerified: true,
        displayName: payload.name,
        avatarUrl: payload.picture,
      };
    },
  };
}

/** Vérificateur fermé : utilisé tant qu'aucun `client_id` n'est configuré. */
export const unconfiguredGoogleVerifier: GoogleCredentialVerifier = {
  async verifyCredential(): Promise<GoogleExternalIdentity> {
    throw new GoogleCredentialError('Vérificateur Google non configuré.');
  },
};
