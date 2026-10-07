/**
 * LE LABEUR — P0-R2 — empreintes et signatures locales (WebCrypto uniquement).
 *
 * L'empreinte SHA-256 constate une intégrité TECHNIQUE du contenu : elle
 * permet de vérifier que l'octet récupéré correspond à la version enregistrée.
 * Elle ne constitue ni un dispositif d'horodatage d'un niveau qualifié,
 * ni une certification du contenu au sens juridique.
 */

import { base64UrlEncode, timingSafeEqual } from '../identity/ids';

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copie bornée : garantit un ArrayBuffer strict (typage BufferSource exact).
  const payload = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export interface DocumentUrlSigner {
  sign(payload: string): Promise<string>;
  verify(payload: string, signature: string): Promise<boolean>;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Signataire HMAC-SHA256 des URL documentaires (jeton court, borné au couple
 * document/version, acteur et échéance). La clé est injectée par la
 * composition — jamais stockée dans le dépôt.
 */
export function createDocumentUrlSigner(secret: string): DocumentUrlSigner {
  if (!secret || secret.length < 16) {
    throw new Error('Le secret de signature documentaire doit contenir au moins 16 caractères.');
  }
  return {
    async sign(payload) {
      const key = await hmacKey(secret);
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
      return base64UrlEncode(new Uint8Array(signature));
    },
    async verify(payload, signature) {
      const expected = await this.sign(payload);
      return timingSafeEqual(expected, signature);
    },
  };
}
