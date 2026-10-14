import type { DocumentMetadata, SignedDocumentUrl } from '../productionContracts';

export interface CreateDocumentMetadata {
  ownerId?: string;
  title: string;
  fileName: string;
  mimeType: DocumentMetadata['mimeType'];
  sizeBytes: number;
}

export interface DocumentUploadGrant {
  documentId: string;
  uploadUrl: string;
  expiresAt: string;
}

/**
 * Objet binaire récupéré du stockage. `body` est borné par la limite de
 * contenu de la brique documents (intégrité recalculée après lecture).
 */
export interface StoredObject {
  body: Uint8Array;
  size: number;
  contentType?: string;
}

export interface StoredObjectHead {
  size: number;
  contentType?: string;
}

/**
 * Object storage port; the future production adapter is Cloudflare R2.
 *
 * P0-R2 : le port est étendu (`get`/`head`) pour la récupération contrôlée et
 * le recalcul d'empreinte — aucune seconde infrastructure documentaire n'est
 * créée. Les implémentations vivent dans `src/backend/documents/storage.ts` :
 *  - `createInMemoryObjectStorage` : adaptateur déterministe de test/local ;
 *  - `createR2BucketObjectStorage`  : adaptateur du binding R2 (injection
 *    prévue dans la tranche CLOUDFLARE PRODUCTION — aucun binding déclaré ni
 *    secret ici).
 */
export interface ObjectStorage {
  put(objectKey: string, body: ReadableStream<Uint8Array> | Uint8Array, contentType: string): Promise<void>;
  get(objectKey: string): Promise<StoredObject | null>;
  head(objectKey: string): Promise<StoredObjectHead | null>;
  delete(objectKey: string): Promise<void>;
  createSignedUploadUrl(objectKey: string, contentType: string, expiresInSeconds: number): Promise<SignedDocumentUrl>;
  createSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<SignedDocumentUrl>;
}

/** Metadata stays in PostgreSQL; the binary itself stays in R2. */
export interface DocumentRepository {
  createMetadata(input: CreateDocumentMetadata, objectKey: string): Promise<DocumentMetadata>;
  getForActor(documentId: string, actorId: string): Promise<DocumentMetadata | null>;
  listForActor(actorId: string, cursor: string | null, limit: number): Promise<{
    items: DocumentMetadata[];
    cursor: string | null;
    limit: number;
    hasMore: boolean;
  }>;
}

export interface DocumentService {
  createUploadGrant(input: CreateDocumentMetadata, actorId: string): Promise<DocumentUploadGrant>;
  createDownloadGrant(documentId: string, actorId: string): Promise<SignedDocumentUrl>;
}
