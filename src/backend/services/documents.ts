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

/** Object storage port; the future production adapter is Cloudflare R2. */
export interface ObjectStorage {
  put(objectKey: string, body: ReadableStream<Uint8Array>, contentType: string): Promise<void>;
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
