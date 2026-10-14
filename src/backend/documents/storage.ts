/**
 * LE LABEUR — P0-R2 — adaptateurs du port `ObjectStorage` (déjà déclaré au
 * dépôt dans `src/backend/services/documents.ts`).
 *
 *  - `createInMemoryObjectStorage` : adaptateur LOCAL déterministe pour les
 *    tests et les vérifications (aucune durabilité, explicite) ;
 *  - `createR2BucketObjectStorage`  : adaptateur d'un binding Cloudflare R2
 *    (interface structurelle — aucun import de types Cloudflare, aucun binding
 *    déclaré dans `wrangler.toml`, aucun secret). C'est l'adapter futur de la
 *    tranche CLOUDFLARE PRODUCTION ; il est testable ici avec un binding faux.
 *
 * Les URLs signées (grant d'upload / de téléchargement) sont produites par le
 * service documentaire au-dessus de ces adaptateurs (URL d'API horodatée et
 * signée HMAC dans cette tranche ; URL présignée R2 envisageable en
 * production). AUCUN objet n'est jamais exposé directement par sa clé.
 */

import type {
  ObjectStorage,
  StoredObject,
  StoredObjectHead,
} from '../services/documents';
import type { SignedDocumentUrl } from '../productionContracts';
import { ApiError } from '../api/errors';

function toBytes(body: ReadableStream<Uint8Array> | Uint8Array): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return Promise.resolve(body);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  return (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  })();
}

/* ------------------------------------------------------------------ */
/* Adaptateur LOCAL (tests / vérifications)                            */
/* ------------------------------------------------------------------ */

export interface InMemoryObjectStorage extends ObjectStorage {
  /** Nombre d'objets physiquement présents (observabilité de test). */
  objectCount(): number;
  has(objectKey: string): boolean;
  /**
   * TESTS UNIQUEMENT — altère volontairement le contenu d'un objet pour
   * démontrer la détection d'intégrité par recalcul d'empreinte.
   */
  dangerouslyReplaceForIntegrityTest(objectKey: string, body: Uint8Array): void;
}

export function createInMemoryObjectStorage(): InMemoryObjectStorage {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    async put(objectKey, body, contentType) {
      objects.set(objectKey, { body: await toBytes(body), contentType });
    },
    async get(objectKey) {
      const found = objects.get(objectKey);
      if (!found) return null;
      return { body: found.body, size: found.body.length, contentType: found.contentType };
    },
    async head(objectKey) {
      const found = objects.get(objectKey);
      if (!found) return null;
      return { size: found.body.length, contentType: found.contentType };
    },
    async delete(objectKey) {
      objects.delete(objectKey);
    },
    async createSignedUploadUrl(objectKey, _contentType, _expiresInSeconds): Promise<SignedDocumentUrl> {
      // Les grants sont émis par le service documentaire, pas par l'adaptateur.
      void objectKey;
      throw new ApiError('NOT_IMPLEMENTED', 'Les URL signées sont émises par le service documentaire.');
    },
    async createSignedDownloadUrl(objectKey, _expiresInSeconds): Promise<SignedDocumentUrl> {
      void objectKey;
      throw new ApiError('NOT_IMPLEMENTED', 'Les URL signées sont émises par le service documentaire.');
    },
    objectCount() {
      return objects.size;
    },
    has(objectKey) {
      return objects.has(objectKey);
    },
    dangerouslyReplaceForIntegrityTest(objectKey, body) {
      const found = objects.get(objectKey);
      if (!found) throw new Error(`Objet de test introuvable: ${objectKey}`);
      objects.set(objectKey, { ...found, body });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Adaptateur Cloudflare R2 (binding structurel — production future)    */
/* ------------------------------------------------------------------ */

/** Surface minimale structurelle d'un binding R2 (aucun import Cloudflare). */
export interface R2BucketLike {
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream, options?: {
    httpMetadata?: { contentType?: string };
  }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectHeadLike | null>;
  delete(keys: string | string[]): Promise<void>;
}

export interface R2ObjectHeadLike {
  size: number;
  httpMetadata?: { contentType?: string };
}

export interface R2ObjectBodyLike extends R2ObjectHeadLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Bind un bucket R2 derrière le port `ObjectStorage`. Aucun état n'est
 * conservé entre appels (cycle de vie Worker), aucun secret n'est lu ici :
 * l'injection du binding relève de la composition de production.
 */
export function createR2BucketObjectStorage(bucket: R2BucketLike): ObjectStorage {
  return {
    async put(objectKey, body, contentType) {
      const bytes = await toBytes(body);
      await bucket.put(objectKey, bytes, { httpMetadata: { contentType } });
    },
    async get(objectKey): Promise<StoredObject | null> {
      const object = await bucket.get(objectKey);
      if (!object) return null;
      const buffer = await object.arrayBuffer();
      return {
        body: new Uint8Array(buffer),
        size: buffer.byteLength,
        ...(object.httpMetadata?.contentType ? { contentType: object.httpMetadata.contentType } : {}),
      };
    },
    async head(objectKey): Promise<StoredObjectHead | null> {
      const head = await bucket.head(objectKey);
      if (!head) return null;
      return {
        size: head.size,
        ...(head.httpMetadata?.contentType ? { contentType: head.httpMetadata.contentType } : {}),
      };
    },
    async delete(objectKey) {
      await bucket.delete(objectKey);
    },
    async createSignedUploadUrl(_objectKey, _contentType, _expiresInSeconds): Promise<SignedDocumentUrl> {
      throw new ApiError('NOT_IMPLEMENTED', 'La présignature R2 est rattachée à la tranche CLOUDFLARE PRODUCTION.');
    },
    async createSignedDownloadUrl(_objectKey, _expiresInSeconds): Promise<SignedDocumentUrl> {
      throw new ApiError('NOT_IMPLEMENTED', 'La présignature R2 est rattachée à la tranche CLOUDFLARE PRODUCTION.');
    },
  };
}
