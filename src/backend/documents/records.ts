/**
 * LE LABEUR — P0-R2 — enregistrements et PORTS de persistance documentaires.
 *
 * Trois agrégats séparés (conformément à l'architecture cible) :
 *  - `DocumentRecord`         : métadonnées du document logique ;
 *  - `DocumentVersionRecord`  : version adressée par contenu (clé objet,
 *    empreinte, taille, provenance, horodatage d'enregistrement, auteur) ;
 *  - `DocumentEntityLinkRecord` : relation version ↔ entité métier — une
 *    acceptation reste rattachée à la VERSION EXACTE, même après d'autres
 *    versions.
 *
 * Aucun adaptateur ici : l'adaptateur PostgreSQL est `sqlDocumentStores.ts`,
 * l'adaptateur objet (R2 / local) dérive du port `ObjectStorage` déjà déclaré
 * au dépôt (`services/documents.ts`).
 */

import type {
  DocumentContentType,
  DocumentEntityType,
  DocumentLinkPurpose,
  DocumentProvenance,
  DocumentStatus,
  DocumentType,
  DocumentVersionStatus,
  RetentionClass,
} from '../../domain/documentRules';

/** Entrée du journal APPEND-ONLY des corrections administratives d'un document. */
export interface DocumentHistoryEntry {
  at: string;
  actorId: string;
  action: 'DOCUMENT_REVOKED' | 'DOCUMENT_VERSION_REVOKED';
  reason: string;
  versionNumber?: number;
}

export interface DocumentRecord {
  documentId: string;
  ownerUserId: string;
  title: string;
  fileName: string;
  documentType: DocumentType;
  purposeNote?: string;
  retentionClass: RetentionClass;
  status: DocumentStatus;
  /** Plus haute version ENREGISTRÉE ; 0 = aucun contenu reçu. */
  currentVersionNumber: number;
  history: DocumentHistoryEntry[];
  createdAt: string;
  createdBy: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

export interface DocumentVersionRecord {
  versionId: string;
  documentId: string;
  versionNumber: number;
  /** Clé de stockage physique — JAMAIS exposée par une réponse API. */
  objectKey: string;
  contentType: DocumentContentType;
  /** Taille déclarée au grant : le contenu reçu doit correspondre à l'octet. */
  declaredSizeBytes: number;
  sizeBytes?: number;
  cryptographicHash?: string;
  hashAlgorithm: 'SHA-256';
  provenance: DocumentProvenance;
  status: DocumentVersionStatus;
  createdAt: string;
  createdBy: string;
  registeredAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

export interface DocumentEntityLinkRecord {
  linkId: string;
  documentId: string;
  documentVersionId: string;
  entityType: DocumentEntityType;
  entityId: string;
  linkPurpose: DocumentLinkPurpose;
  relatedActorId?: string;
  relatedEventRef?: string;
  acceptedAt?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
}

export interface DocumentRetentionPolicyRecord {
  documentType: DocumentType;
  retentionClass: RetentionClass;
  retentionDays: number | null;
  durationStatus: 'PENDING_LEGAL_VALIDATION' | 'CONFIGURED';
  configuredBy?: string;
  configuredAt?: string;
}

export interface DocumentListQuery {
  limit: number;
  afterId?: string | null;
}

export interface DocumentAdminQuery extends DocumentListQuery {
  ownerUserId?: string;
  documentType?: DocumentType;
  status?: DocumentStatus;
}

/** Store de l'agrégat DOCUMENT (métadonnées). */
export interface DocumentStore {
  create(record: DocumentRecord): Promise<DocumentRecord>;
  findById(documentId: string): Promise<DocumentRecord | null>;
  /** Verrou de ligne : création de version et révocation sérialisées. */
  findByIdForUpdate(documentId: string): Promise<DocumentRecord | null>;
  listForOwner(ownerUserId: string, query: DocumentListQuery): Promise<DocumentRecord[]>;
  listAll(query: DocumentAdminQuery): Promise<DocumentRecord[]>;
  /** Avance le pointeur de version courante sans jamais reculer. */
  advanceCurrentVersion(documentId: string, versionNumber: number): Promise<void>;
  /**
   * Trace APPEND-ONLY d'une correction : une entrée est AJOUTÉE au journal du
   * document (`history || jsonb`), jamais réécrite — utilisée notamment pour
   * la révocation d'une version (la ligne version porte son propre statut).
   */
  appendHistory(documentId: string, historyEntry: DocumentHistoryEntry): Promise<void>;
  /**
   * Révocation conditionnelle (ACTIVE → REVOKED) avec historique AJOUTÉ côté
   * SQL (`history || jsonb`) — `null` si une correction concurrente a tranché.
   */
  compareAndSetRevocation(input: {
    documentId: string;
    at: string;
    actorId: string;
    reason: string;
    historyEntry: DocumentHistoryEntry;
  }): Promise<DocumentRecord | null>;
}

/** Store des versions (immutables une fois enregistrées). */
export interface DocumentVersionStore {
  /** Numéro suivant, calculé SOUS le verrou du document (unicité portée par la base). */
  create(record: DocumentVersionRecord): Promise<DocumentVersionRecord>;
  findById(versionId: string): Promise<DocumentVersionRecord | null>;
  findByIdForUpdate(versionId: string): Promise<DocumentVersionRecord | null>;
  findByDocumentAndNumber(documentId: string, versionNumber: number): Promise<DocumentVersionRecord | null>;
  listForDocument(documentId: string): Promise<DocumentVersionRecord[]>;
  nextVersionNumber(documentId: string): Promise<number>;
  /**
   * Enregistrement du contenu, compare-and-set `PENDING_UPLOAD → ACTIVE` :
   * `null` si la version n'est plus en attente (immutabilité — le rejeu
   * idempotent est géré par le dépôt, jamais par un écrasement).
   */
  registerContent(input: {
    versionId: string;
    sizeBytes: number;
    cryptographicHash: string;
    registeredAt: string;
  }): Promise<DocumentVersionRecord | null>;
  /** Révocation conditionnelle (ACTIVE → REVOKED), jamais silencieuse. */
  compareAndSetRevocation(input: {
    versionId: string;
    at: string;
    actorId: string;
    reason: string;
  }): Promise<DocumentVersionRecord | null>;
  countActiveLinkedToDocument(documentId: string): Promise<number>;
}

/** Store des liens version ↔ entité (append-only, dédupliqué). */
export interface DocumentLinkStore {
  createIfAbsent(
    record: DocumentEntityLinkRecord,
  ): Promise<{ kind: 'created'; link: DocumentEntityLinkRecord } | { kind: 'duplicate'; link: DocumentEntityLinkRecord }>;
  listForDocument(documentId: string): Promise<DocumentEntityLinkRecord[]>;
  listForVersion(documentVersionId: string): Promise<DocumentEntityLinkRecord[]>;
  listForEntity(entityType: DocumentEntityType, entityId: string, limit: number): Promise<DocumentEntityLinkRecord[]>;
  countAcceptanceLinksForVersion(documentVersionId: string): Promise<number>;
}

/**
 * Lecteur d'accès et de preuves existantes — lecture SEULE des entités déjà
 * persistées (contrats, propositions, claims, remplacements, paiements,
 * confirmations salariales). Aucune écriture hors des tables R2.
 */
export interface DocumentAccessReader {
  /**
   * Parties réelles de l'entité ; `null` si l'entité n'existe pas (un lien ne
   * peut jamais viser une entité absente).
   */
  entityPartyIds(entityType: DocumentEntityType, entityId: string): Promise<readonly string[] | null>;
  /**
   * Date de la signature EXISTANTE du signataire sur le contrat, ou `null`
   * (non partie / pas encore signé) : l'acceptation documentaire ne peut
   * rattacher qu'une signature réelle.
   */
  contractSignatureAt(contractId: string, signerId: string): Promise<string | null>;
}

/** Store des politiques de conservation (en lecture pour cette tranche). */
export interface DocumentRetentionStore {
  getPolicy(documentType: DocumentType): Promise<DocumentRetentionPolicyRecord | null>;
  listPolicies(): Promise<DocumentRetentionPolicyRecord[]>;
}
