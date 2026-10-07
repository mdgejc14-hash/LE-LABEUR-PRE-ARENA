/**
 * Conventions d'identifiants serveur (Phase 2).
 *
 * - Identifiants d'entités : préfixe métier + 26 caractères base32 aléatoires.
 * - Jetons de session : 32 octets aléatoires encodés base64url, jamais stockés
 *   en clair (seul le SHA-256 est persisté).
 */

const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';

// P0-NOTIFICATIONS : `ntf` = notification In-App (boîte de réception).
// P0-R2 : `doc` = document, `dver` = version documentaire, `dlnk` = lien entité ↔ version.
export type IdPrefix = 'usr' | 'ses' | 'ofr' | 'app' | 'ctr' | 'prp' | 'rep' | 'idn' | 'prb' | 'set' | 'rev' | 'clm' | 'cor' | 'evr' | 'rsk' | 'ntf' | 'qlf' | 'mtr' | 'rpt' | 'doc' | 'dver' | 'dlnk';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }
  throw new Error('A cryptographically secure RNG is required for identity generation.');
}

export function newEntityId(prefix: IdPrefix): string {
  const bytes = randomBytes(16);
  let out = '';
  for (const byte of bytes) {
    out += BASE32[byte & 31];
    out += BASE32[(byte >> 3) & 31];
  }
  return `${prefix}_${out.slice(0, 26)}`;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Jeton de session opaque; la valeur en clair ne quitte le serveur que via le cookie. */
export function newOpaqueSessionToken(): string {
  return base64UrlEncode(randomBytes(32));
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Comparaison à temps constant pour les secrets de session. */
export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}
