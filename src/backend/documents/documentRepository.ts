/**
 * LE LABEUR — P0-R2 — dépôt DOCUMENTS & PREUVES.
 *
 * Chaîne réelle :
 *   APPLICATION → MÉTADONNÉES (PostgreSQL) → OBJECT STORAGE (port R2)
 *   → EMPREINTE SHA-256 → VERSION → AUDIT LEDGER existant → ACCÈS CONTRÔLÉ.
 *
 * Invariants appliqués ici (et doublés de contraintes SQL en migration 0016) :
 *  - une modification crée TOUJOURS une nouvelle version (jamais d'écrasement,
 *    même silencieux) — le contenu d'une version enregistrée est immuable ;
 *  - chaque version porte sa propre empreinte, son horodatage, son auteur et
 *    sa provenance — une acceptation reste rattachée à la version EXACTE ;
 *  - les corrections sont APPEND-ONLY (historique + audit existant) ;
 *  - l'accès suit ownership/parties/permissions — aucun téléchargement à la
 *    seule connaissance d'un identifiant ou d'une clé d'objet (anti-IDOR,
 *    `object_key` n'apparaît JAMAIS dans une réponse) ;
 *  - AUCUNE durée de conservation n'est inventée : elles restent
 *    `PENDING_LEGAL_VALIDATION` jusqu'à décision juridique, par type ;
 *  - aucune logique financière : la brique ne lit ni n'écrit aucun montant ;
 *  - aucune notification nouvelle, aucune réputation, aucun matching.
 */

import { ApiError } from '../api/errors';
import type { ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import type { AuditLedgerStore, DurableIdempotencyStore } from '../automation/records';
import { newEntityId } from '../identity/ids';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import type { ObjectStorage } from '../services/documents';
import type { AuthenticatedActor, CursorPage, PageRequest, ProductionCommandContext } from '../productionContracts';
import {
  MAX_DOCUMENT_CONTENT_BYTES,
  findDocumentLinkRuleViolation,
  isDocumentContentType,
  isDocumentEntityType,
  isDocumentLinkPurpose,
  isDocumentType,
  linkPurposesForDocumentType,
  participantsCanAccessDocument,
  purposeNoteRequired,
  retentionClassForDocumentType,
  type DocumentContentType,
  type DocumentType,
} from '../../domain/documentRules';
import type {
  DocumentAccessReader,
  DocumentEntityLinkRecord,
  DocumentLinkStore,
  DocumentRecord,
  DocumentRetentionPolicyRecord,
  DocumentRetentionStore,
  DocumentStore,
  DocumentVersionRecord,
  DocumentVersionStore,
  DocumentHistoryEntry,
} from './records';
import { createDocumentUrlSigner, sha256Hex, type DocumentUrlSigner } from './hash';

export const DOCUMENTS_API_SOURCE = 'api:P0-R2-DOCUMENTS';

/** Permissions EXISTANTES réutilisées : aucun nouveau code n'est créé. */
export const DOCUMENTS_ADMIN_READ_PERMISSION = 'documents:read:any';
export const DOCUMENTS_ADMIN_CORRECT_PERMISSION = 'incidents:arbitrate';

/** Validité d'une URL signée de téléchargement (courte, horodatée). */
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 300;

const MAX_TITLE_LENGTH = 200;
const MAX_FILE_NAME_LENGTH = 150;
const MAX_REASON_LENGTH = 1000;
const MIN_REASON_LENGTH = 3;
const MAX_NOTE_LENGTH = 500;
const MAX_ID_LENGTH = 128;
const FILE_NAME_PATTERN = /^[^/\\:*?"<>|]+$/;

export interface DocumentRepositoryStores {
  documents: DocumentStore;
  versions: DocumentVersionStore;
  links: DocumentLinkStore;
  retention: DocumentRetentionStore;
  /** Lecture seule des entités existantes (accès et signatures réelles). */
  access: DocumentAccessReader;
  users: UserStore;
  automation: {
    audit: AuditLedgerStore;
    idempotency: DurableIdempotencyStore;
  };
}

export interface DocumentRepositoryDependencies {
  stores: DocumentRepositoryStores;
  /** Obligatoire : métadonnées + audit + idempotence dans la MÊME transaction. */
  runInTransaction: <T>(operation: (stores: DocumentRepositoryStores) => Promise<T>) => Promise<T>;
  /** Adaptateur objet (R2 en production, adaptateur local en vérification). */
  storage: ObjectStorage;
  /** Active l'émission d'URL signées (HMAC local ; absent = 501 explicite). */
  urlSigningSecret?: string;
  now?: () => Date;
}

/* ------------------------------------------------------------------ */
/* Vues API — `objectKey` n'y figure JAMAIS.                           */
/* ------------------------------------------------------------------ */

export interface DocumentRetentionView {
  retentionClass: string;
  durationStatus: 'PENDING_LEGAL_VALIDATION' | 'CONFIGURED';
  retentionDays: number | null;
}

export interface DocumentLinkView {
  linkId: string;
  documentVersionId: string;
  entityType: string;
  entityId: string;
  linkPurpose: string;
  relatedActorId?: string;
  relatedEventRef?: string;
  acceptedAt?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
}

export interface DocumentVersionView {
  versionId: string;
  versionNumber: number;
  contentType: string;
  /** Taille déclarée au grant — le contenu reçu doit la respecter à l'octet. */
  declaredSizeBytes: number;
  sizeBytes?: number;
  cryptographicHash?: string;
  hashAlgorithm: string;
  provenance: string;
  status: string;
  createdAt: string;
  createdBy: string;
  registeredAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
  /** `null` tant que la durée du type n'est pas validée juridiquement. */
  retainUntil: string | null;
}

export interface DocumentSummaryView {
  documentId: string;
  ownerUserId: string;
  title: string;
  fileName: string;
  documentType: DocumentType;
  purposeNote?: string;
  status: string;
  currentVersionNumber: number;
  retention: DocumentRetentionView;
  createdAt: string;
  createdBy: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

export interface DocumentDetailView extends DocumentSummaryView {
  versions: DocumentVersionView[];
  links: DocumentLinkView[];
}

export interface DocumentUploadGrantView {
  document: DocumentSummaryView;
  version: DocumentVersionView;
  upload: {
    /** URL relative d'API (l'objet physique ne quitte jamais le contrôle du serveur). */
    url: string;
    method: 'POST';
    contentType: string;
    /** Taille déclarée attendue à l'octet près (intégrité du dépôt). */
    expectedSizeBytes: number;
  };
}

export interface DocumentContentRegistration {
  version: DocumentVersionView;
  /** Vrai quand le MÊME contenu était déjà enregistré (rejeu idempotent). */
  replayed: boolean;
}

export interface DocumentIntegrityReport {
  documentId: string;
  versionId: string;
  expectedHash: string | null;
  actualHash: string | null;
  objectPresent: boolean;
  match: boolean;
  verifiedAt: string;
  /** Rappel : contrôle technique d'intégrité, pas une certification juridique. */
  scope: 'TECHNICAL_INTEGRITY';
}

export interface DocumentLinkResult {
  link: DocumentLinkView;
  duplicated: boolean;
}

export interface DocumentCreateInput {
  title: string;
  fileName: string;
  contentType: DocumentContentType;
  sizeBytes: number;
  documentType: DocumentType;
  purposeNote?: string;
}

export interface DocumentVersionCreateInput {
  contentType: DocumentContentType;
  sizeBytes: number;
}

export interface DocumentLinkCreateInput {
  entityType: string;
  entityId: string;
  linkPurpose: string;
  relatedActorId?: string;
  relatedEventRef?: string;
  note?: string;
}

export interface DocumentContentUpload {
  bytes: Uint8Array;
  contentType: string;
}

export interface DocumentDownloadResult {
  response: Response;
}

export interface OpenDocumentRepository {
  createUploadGrant(actor: AuthenticatedActor, input: DocumentCreateInput, command: ProductionCommandContext): Promise<DocumentUploadGrantView>;
  listMine(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<DocumentSummaryView>>;
  read(actor: AuthenticatedActor, documentId: string): Promise<DocumentDetailView>;
  listVersions(actor: AuthenticatedActor, documentId: string): Promise<DocumentVersionView[]>;
  createVersion(actor: AuthenticatedActor, documentId: string, input: DocumentVersionCreateInput, command: ProductionCommandContext): Promise<{ document: DocumentSummaryView; version: DocumentVersionView; upload: DocumentUploadGrantView['upload'] }>;
  uploadContent(actor: AuthenticatedActor, documentId: string, versionId: string, content: DocumentContentUpload, command: ProductionCommandContext): Promise<DocumentContentRegistration>;
  issueSignedDownload(actor: AuthenticatedActor, documentId: string, versionId: string | null): Promise<{ url: string; expiresAt: string }>;
  downloadContent(actor: AuthenticatedActor, documentId: string, versionId: string, token: string | null): Promise<DocumentDownloadResult>;
  verifyIntegrity(actor: AuthenticatedActor, documentId: string, versionId: string, command: ProductionCommandContext): Promise<DocumentIntegrityReport>;
  listLinks(actor: AuthenticatedActor, documentId: string, versionId: string): Promise<DocumentLinkView[]>;
  createLink(actor: AuthenticatedActor, documentId: string, versionId: string, input: DocumentLinkCreateInput, command: ProductionCommandContext): Promise<DocumentLinkResult>;
  listAdmin(actor: AuthenticatedActor, page: PageRequest, filters?: { ownerUserId?: string; documentType?: DocumentType; status?: string }): Promise<CursorPage<DocumentSummaryView>>;
  readAdmin(actor: AuthenticatedActor, documentId: string): Promise<DocumentDetailView>;
  revokeVersionAdmin(actor: AuthenticatedActor, documentId: string, versionId: string, reason: string, command: ProductionCommandContext): Promise<DocumentVersionView>;
  revokeDocumentAdmin(actor: AuthenticatedActor, documentId: string, reason: string, command: ProductionCommandContext): Promise<DocumentDetailView>;
}

/* ------------------------------------------------------------------ */
/* Helpers internes                                                    */
/* ------------------------------------------------------------------ */

type Access = 'OWNER' | 'PARTICIPANT' | 'ADMIN';

function requireActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}

function requireCommand(actor: AuthenticatedActor, command: ProductionCommandContext | null | undefined): ProductionCommandContext {
  if (!command?.idempotencyKey?.trim() || !command.command) {
    throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
  }
  if (command.actor.id !== actor.id || command.actor.role !== actor.role) {
    throw new ApiError('FORBIDDEN', 'La commande ne correspond pas à la session authentifiée.');
  }
  return command;
}

function requireAdmin(actor: AuthenticatedActor, permission: string): void {
  if (actor.role !== 'ADMIN' || !actor.permissions.includes(permission as never)) {
    throw new ApiError('FORBIDDEN', `Accès réservé à l’administration (permission ${permission}).`);
  }
}

function conflict(message: string): ApiError {
  return new ApiError('BUSINESS_RULE_VIOLATION', message, undefined, 409);
}

function gone(message: string): ApiError {
  return new ApiError('BUSINESS_RULE_VIOLATION', message, undefined, 410);
}

function requireReason(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', 'Le motif est obligatoire.');
  const reason = value.trim();
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw new ApiError('VALIDATION_ERROR', `Le motif doit contenir entre ${MIN_REASON_LENGTH} et ${MAX_REASON_LENGTH} caractères.`);
  }
  return reason;
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', `${label} est obligatoire.`);
  const id = value.trim();
  if (!id || id.length > MAX_ID_LENGTH) throw new ApiError('VALIDATION_ERROR', `${label} est invalide.`);
  return id;
}

export function createDocumentRepository(dependencies: DocumentRepositoryDependencies): OpenDocumentRepository {
  const clock = dependencies.now ?? (() => new Date());
  const { storage, runInTransaction } = dependencies;
  const signer: DocumentUrlSigner | null = dependencies.urlSigningSecret
    ? createDocumentUrlSigner(dependencies.urlSigningSecret)
    : null;

  const activeAccount = async (
    current: DocumentRepositoryStores,
    actor: AuthenticatedActor,
  ): Promise<ServerUserRecord> => {
    const account = await current.users.findByIdForShare(actor.id);
    if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
    if (account.role !== actor.role) throw new ApiError('FORBIDDEN', 'Le rôle de la session ne correspond plus au compte.');
    if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'Compte non actif : l’accès documentaire est indisponible.');
    return account;
  };

  const audit = async (
    current: DocumentRepositoryStores,
    input: {
      entityId: string;
      actorId: string;
      at: string;
      action: string;
      command?: ProductionCommandContext;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
    },
  ): Promise<void> => {
    await current.automation.audit.append({
      id: newEntityId('rev'),
      actorId: input.actorId,
      timestamp: input.at,
      entityId: input.entityId,
      action: input.action,
      source: DOCUMENTS_API_SOURCE,
      ...(input.command ? { reference: input.command.idempotencyKey } : {}),
      ...(input.beforeState ? { beforeState: input.beforeState } : {}),
      ...(input.afterState ? { afterState: input.afterState } : {}),
    });
  };

  /** Empreinte locale de la charge utile d'idempotence (aucune frontière franchie). */
  const payloadHash = (payload: unknown): Promise<string> =>
    sha256Hex(new TextEncoder().encode(JSON.stringify(payload ?? null)));

  const reserve = async <Result>(
    current: DocumentRepositoryStores,
    actor: AuthenticatedActor,
    command: ProductionCommandContext,
    payload: unknown,
  ): Promise<{ replay: true; result: Result } | { replay: false }> => {
    const outcome = await current.automation.idempotency.reserve({
      actorId: actor.id,
      command: command.command,
      key: command.idempotencyKey,
      payloadHash: await payloadHash(payload),
    });
    if (outcome.kind === 'conflict') {
      throw new ApiError('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée avec une charge utile différente.', undefined, 409);
    }
    if (outcome.kind === 'in-progress') {
      throw conflict('Une commande concurrente est en cours sur ce document : rejouez la requête.');
    }
    return outcome.kind === 'replay'
      ? { replay: true, result: outcome.result as Result }
      : { replay: false };
  };

  const complete = (
    current: DocumentRepositoryStores,
    actor: AuthenticatedActor,
    command: ProductionCommandContext,
    result: unknown,
  ): Promise<void> => current.automation.idempotency.complete(actor.id, command.command, command.idempotencyKey, result);

  /* ---------------- Vues ---------------- */

  const toRetentionView = (policy: DocumentRetentionPolicyRecord | null, document: DocumentRecord): DocumentRetentionView => ({
    retentionClass: document.retentionClass,
    durationStatus: policy?.durationStatus ?? 'PENDING_LEGAL_VALIDATION',
    retentionDays: policy?.retentionDays ?? null,
  });

  const retainUntilFor = (policy: DocumentRetentionPolicyRecord | null, version: DocumentVersionRecord): string | null => {
    if (!policy || policy.durationStatus !== 'CONFIGURED' || policy.retentionDays === null || !version.registeredAt) {
      return null;
    }
    return new Date(Date.parse(version.registeredAt) + policy.retentionDays * 86_400_000).toISOString();
  };

  const toVersionView = (version: DocumentVersionRecord, policy: DocumentRetentionPolicyRecord | null): DocumentVersionView => ({
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    contentType: version.contentType,
    declaredSizeBytes: version.declaredSizeBytes,
    ...(typeof version.sizeBytes === 'number' ? { sizeBytes: version.sizeBytes } : {}),
    ...(version.cryptographicHash ? { cryptographicHash: version.cryptographicHash } : {}),
    hashAlgorithm: version.hashAlgorithm,
    provenance: version.provenance,
    status: version.status,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    ...(version.registeredAt ? { registeredAt: version.registeredAt } : {}),
    ...(version.revokedAt ? { revokedAt: version.revokedAt } : {}),
    ...(version.revokedBy ? { revokedBy: version.revokedBy } : {}),
    ...(version.revocationReason ? { revocationReason: version.revocationReason } : {}),
    retainUntil: retainUntilFor(policy, version),
  });

  const toLinkView = (link: DocumentEntityLinkRecord): DocumentLinkView => ({
    linkId: link.linkId,
    documentVersionId: link.documentVersionId,
    entityType: link.entityType,
    entityId: link.entityId,
    linkPurpose: link.linkPurpose,
    ...(link.relatedActorId ? { relatedActorId: link.relatedActorId } : {}),
    ...(link.relatedEventRef ? { relatedEventRef: link.relatedEventRef } : {}),
    ...(link.acceptedAt ? { acceptedAt: link.acceptedAt } : {}),
    ...(link.note ? { note: link.note } : {}),
    createdAt: link.createdAt,
    createdBy: link.createdBy,
  });

  const toSummaryView = (document: DocumentRecord, policy: DocumentRetentionPolicyRecord | null): DocumentSummaryView => ({
    documentId: document.documentId,
    ownerUserId: document.ownerUserId,
    title: document.title,
    fileName: document.fileName,
    documentType: document.documentType,
    ...(document.purposeNote ? { purposeNote: document.purposeNote } : {}),
    status: document.status,
    currentVersionNumber: document.currentVersionNumber,
    retention: toRetentionView(policy, document),
    createdAt: document.createdAt,
    createdBy: document.createdBy,
    ...(document.revokedAt ? { revokedAt: document.revokedAt } : {}),
    ...(document.revokedBy ? { revokedBy: document.revokedBy } : {}),
    ...(document.revocationReason ? { revocationReason: document.revocationReason } : {}),
  });

  const toDetailView = async (
    current: DocumentRepositoryStores,
    document: DocumentRecord,
  ): Promise<DocumentDetailView> => {
    const [policy, versions, links] = await Promise.all([
      current.retention.getPolicy(document.documentType),
      current.versions.listForDocument(document.documentId),
      current.links.listForDocument(document.documentId),
    ]);
    return {
      ...toSummaryView(document, policy),
      versions: versions.map(version => toVersionView(version, policy)),
      links: links.map(toLinkView),
    };
  };

  /* ---------------- Contrôle d'accès ---------------- */

  /**
   * Résout le droit d'accès à un document :
   *  - OWNER : le déposant ;
   *  - ADMIN : uniquement avec la permission existante `documents:read:any` ;
   *  - PARTICIPANT : partie réelle d'une entité liée (sauf documents à accès
   *    restreint — la finalité de vérification n'expose jamais les parties).
   */
  const resolveAccess = async (
    current: DocumentRepositoryStores,
    actor: AuthenticatedActor,
    document: DocumentRecord,
  ): Promise<Access | null> => {
    if (document.ownerUserId === actor.id) return 'OWNER';
    if (actor.role === 'ADMIN' && actor.permissions.includes(DOCUMENTS_ADMIN_READ_PERMISSION as never)) return 'ADMIN';
    if (!participantsCanAccessDocument(document.documentType)) return null;
    const links = await current.links.listForDocument(document.documentId);
    for (const link of links) {
      const parties = await current.access.entityPartyIds(link.entityType, link.entityId);
      if (parties && parties.includes(actor.id)) return 'PARTICIPANT';
    }
    return null;
  };

  const loadForActor = async (
    current: DocumentRepositoryStores,
    actor: AuthenticatedActor,
    documentId: string,
  ): Promise<{ document: DocumentRecord; access: Access }> => {
    const document = await current.documents.findById(requireIdentifier(documentId, 'documentId'));
    if (!document) throw new ApiError('NOT_FOUND', 'Document introuvable.');
    const access = await resolveAccess(current, actor, document);
    if (!access) {
      // Aucune information n'est déduite de la seule connaissance d'un identifiant.
      throw new ApiError('FORBIDDEN', 'Vous ne disposez pas d’un accès à ce document.');
    }
    return { document, access };
  };

  const loadVersionForDocument = async (
    current: DocumentRepositoryStores,
    documentId: string,
    versionId: string,
  ): Promise<DocumentVersionRecord> => {
    const version = await current.versions.findById(requireIdentifier(versionId, 'versionId'));
    if (!version || version.documentId !== documentId) throw new ApiError('NOT_FOUND', 'Version documentaire introuvable.');
    return version;
  };

  /* ---------------- Validation des entrées ---------------- */

  const validateCreateInput = (input: DocumentCreateInput): DocumentCreateInput => {
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > MAX_TITLE_LENGTH) {
      throw new ApiError('VALIDATION_ERROR', `Le titre est obligatoire (1 à ${MAX_TITLE_LENGTH} caractères).`);
    }
    const fileName = typeof input?.fileName === 'string' ? input.fileName.trim() : '';
    if (!fileName || fileName.length > MAX_FILE_NAME_LENGTH || !FILE_NAME_PATTERN.test(fileName)) {
      throw new ApiError('VALIDATION_ERROR', 'Le nom de fichier est invalide (caractères de chemin interdits).');
    }
    if (!isDocumentType(input?.documentType)) {
      throw new ApiError('VALIDATION_ERROR', `Le type de document est invalide (attendu : un type connu).`);
    }
    if (!isDocumentContentType(input?.contentType)) {
      throw new ApiError('VALIDATION_ERROR', 'Le type de contenu est invalide (PDF ou image JPEG/PNG/WebP).');
    }
    const sizeBytes = input?.sizeBytes;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_DOCUMENT_CONTENT_BYTES) {
      throw new ApiError('VALIDATION_ERROR', `La taille déclarée doit être un entier entre 1 et ${MAX_DOCUMENT_CONTENT_BYTES} octets.`);
    }
    const purposeNote = typeof input?.purposeNote === 'string' ? input.purposeNote.trim() : undefined;
    if (purposeNoteRequired(input.documentType) && (!purposeNote || purposeNote.length < 3)) {
      throw new ApiError('VALIDATION_ERROR', 'La finalité du document de vérification est obligatoire (purposeNote).');
    }
    if (purposeNote && (purposeNote.length < 3 || purposeNote.length > MAX_NOTE_LENGTH)) {
      throw new ApiError('VALIDATION_ERROR', 'La finalité doit contenir entre 3 et 500 caractères.');
    }
    return {
      title,
      fileName,
      contentType: input.contentType,
      sizeBytes,
      documentType: input.documentType,
      ...(purposeNote ? { purposeNote } : {}),
    };
  };

  const uploadUrlFor = (documentId: string, versionId: string): string =>
    `/api/v1/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/content`;

  return {
    /* ---------------- Upload / création ---------------- */

    async createUploadGrant(suppliedActor, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      const input = validateCreateInput(suppliedInput);

      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const reservation = await reserve<DocumentUploadGrantView>(current, actor, command, input);
        if (reservation.replay) return reservation.result;

        const at = clock().toISOString();
        const documentId = newEntityId('doc');
        const versionId = newEntityId('dver');
        const document = await current.documents.create({
          documentId,
          ownerUserId: actor.id,
          title: input.title,
          fileName: input.fileName,
          documentType: input.documentType,
          ...(input.purposeNote ? { purposeNote: input.purposeNote } : {}),
          retentionClass: retentionClassForDocumentType(input.documentType),
          status: 'ACTIVE',
          currentVersionNumber: 0,
          history: [],
          createdAt: at,
          createdBy: actor.id,
        });
        // Clé d'objet générée par le serveur, adressée par version (jamais du client).
        const version = await current.versions.create({
          versionId,
          documentId,
          versionNumber: 1,
          objectKey: `docs/${documentId}/${versionId}`,
          contentType: input.contentType,
          declaredSizeBytes: input.sizeBytes,
          hashAlgorithm: 'SHA-256',
          provenance: 'USER_UPLOAD',
          status: 'PENDING_UPLOAD',
          createdAt: at,
          createdBy: actor.id,
        });

        await audit(current, {
          entityId: documentId,
          actorId: actor.id,
          at,
          action: 'DOCUMENT_CREATED',
          command,
          afterState: {
            documentType: input.documentType,
            retentionClass: document.retentionClass,
            versionNumber: 1,
            provenance: 'USER_UPLOAD',
          },
        });

        const policy = await current.retention.getPolicy(input.documentType);
        const result: DocumentUploadGrantView = {
          document: toSummaryView(document, policy),
          version: toVersionView(version, policy),
          upload: {
            url: uploadUrlFor(documentId, versionId),
            method: 'POST',
            contentType: input.contentType,
            expectedSizeBytes: input.sizeBytes,
          },
        };
        await complete(current, actor, command, result);
        return result;
      });
    },

    async listMine(suppliedActor, page) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const records = await current.documents.listForOwner(actor.id, { limit: page.limit + 1, afterId: page.cursor });
        const hasMore = records.length > page.limit;
        const visible = records.slice(0, page.limit);
        const items: DocumentSummaryView[] = [];
        for (const record of visible) {
          items.push(toSummaryView(record, await current.retention.getPolicy(record.documentType)));
        }
        return {
          items,
          cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].documentId : null,
          limit: page.limit,
          hasMore,
        };
      });
    },

    async read(suppliedActor, documentId) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const { document } = await loadForActor(current, actor, documentId);
        return toDetailView(current, document);
      });
    },

    async listVersions(suppliedActor, documentId) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const { document } = await loadForActor(current, actor, documentId);
        const policy = await current.retention.getPolicy(document.documentType);
        const versions = await current.versions.listForDocument(document.documentId);
        return versions.map(version => toVersionView(version, policy));
      });
    },

    async createVersion(suppliedActor, documentId, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      if (!isDocumentContentType(suppliedInput?.contentType)) {
        throw new ApiError('VALIDATION_ERROR', 'Le type de contenu est invalide (PDF ou image JPEG/PNG/WebP).');
      }
      if (!Number.isSafeInteger(suppliedInput?.sizeBytes) || suppliedInput.sizeBytes < 1 || suppliedInput.sizeBytes > MAX_DOCUMENT_CONTENT_BYTES) {
        throw new ApiError('VALIDATION_ERROR', `La taille déclarée doit être un entier entre 1 et ${MAX_DOCUMENT_CONTENT_BYTES} octets.`);
      }

      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const payload = { documentId, contentType: suppliedInput.contentType, sizeBytes: suppliedInput.sizeBytes };
        const reservation = await reserve<{ document: DocumentSummaryView; version: DocumentVersionView; upload: DocumentUploadGrantView['upload'] }>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;

        // Verrou du document : deux créations concurrentes ne peuvent obtenir
        // le même numéro (l'unicité SQL tranche toute course résiduelle).
        const document = await current.documents.findByIdForUpdate(requireIdentifier(documentId, 'documentId'));
        if (!document) throw new ApiError('NOT_FOUND', 'Document introuvable.');
        if (document.ownerUserId !== actor.id) {
          throw new ApiError('FORBIDDEN', 'Seul le propriétaire peut ajouter une version à ce document.');
        }
        if (document.status !== 'ACTIVE') {
          throw conflict('Un document révoqué ne peut pas recevoir de nouvelle version.');
        }

        const at = clock().toISOString();
        const versionNumber = await current.versions.nextVersionNumber(document.documentId);
        const versionId = newEntityId('dver');
        let version: DocumentVersionRecord;
        try {
          version = await current.versions.create({
            versionId,
            documentId: document.documentId,
            versionNumber,
            objectKey: `docs/${document.documentId}/${versionId}`,
            contentType: suppliedInput.contentType,
            declaredSizeBytes: suppliedInput.sizeBytes,
            hashAlgorithm: 'SHA-256',
            provenance: 'USER_UPLOAD',
            status: 'PENDING_UPLOAD',
            createdAt: at,
            createdBy: actor.id,
          });
        } catch (error) {
          // Course résiduelle sur (document_id, version_number) : jamais deux versions avec le même numéro.
          if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505') {
            throw conflict('Une création de version concurrente a eu lieu : rejouez la commande.');
          }
          throw error;
        }

        await audit(current, {
          entityId: document.documentId,
          actorId: actor.id,
          at,
          action: 'DOCUMENT_VERSION_CREATED',
          command,
          beforeState: { currentVersionNumber: document.currentVersionNumber },
          afterState: { versionId, versionNumber, contentType: suppliedInput.contentType },
        });

        const policy = await current.retention.getPolicy(document.documentType);
        const result = {
          document: toSummaryView(document, policy),
          version: toVersionView(version, policy),
          upload: {
            url: uploadUrlFor(document.documentId, versionId),
            method: 'POST' as const,
            contentType: suppliedInput.contentType,
            expectedSizeBytes: suppliedInput.sizeBytes,
          },
        };
        await complete(current, actor, command, result);
        return result;
      });
    },

    async uploadContent(suppliedActor, documentId, versionId, content, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      const bytes = content?.bytes;
      if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_DOCUMENT_CONTENT_BYTES) {
        throw new ApiError('VALIDATION_ERROR', `Le contenu est obligatoire (1 à ${MAX_DOCUMENT_CONTENT_BYTES} octets).`);
      }
      const hash = await sha256Hex(bytes);

      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const payload = { documentId, versionId, hash, sizeBytes: bytes.length };
        const reservation = await reserve<DocumentContentRegistration>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;

        const document = await current.documents.findById(requireIdentifier(documentId, 'documentId'));
        if (!document) throw new ApiError('NOT_FOUND', 'Document introuvable.');
        if (document.ownerUserId !== actor.id) {
          throw new ApiError('FORBIDDEN', 'Seul le propriétaire peut déposer le contenu de ce document.');
        }
        if (document.status !== 'ACTIVE') {
          throw conflict('Un document révoqué ne peut pas recevoir de contenu.');
        }
        const version = await loadVersionForDocument(current, document.documentId, versionId);
        const policy = await current.retention.getPolicy(document.documentType);

        if (version.status === 'ACTIVE') {
          // Immutabilité du contenu : seul le rejeu du MÊME octet est accepté.
          if (version.cryptographicHash === hash && version.sizeBytes === bytes.length) {
            const result: DocumentContentRegistration = { version: toVersionView(version, policy), replayed: true };
            await complete(current, actor, command, result);
            return result;
          }
          throw conflict('Le contenu d’une version enregistrée est immuable : créez une nouvelle version.');
        }
        if (version.status === 'REVOKED') {
          throw conflict('Une version révoquée ne peut pas recevoir de contenu.');
        }
        if (typeof content.contentType !== 'string' || content.contentType.split(';')[0].trim() !== version.contentType) {
          throw new ApiError('VALIDATION_ERROR', `Le type de contenu reçu ne correspond pas à la déclaration (${version.contentType}).`);
        }
        if (version.declaredSizeBytes !== bytes.length) {
          throw new ApiError('VALIDATION_ERROR', `La taille reçue (${bytes.length}) ne correspond pas à la taille déclarée (${version.declaredSizeBytes}).`);
        }

        // 1. Écriture physique d'abord : la base ne pointe jamais un objet absent.
        await storage.put(version.objectKey, bytes, version.contentType);

        // 2. Compare-and-set transactionnel : PENDING_UPLOAD → ACTIVE.
        const at = clock().toISOString();
        const updated = await current.versions.registerContent({
          versionId: version.versionId,
          sizeBytes: bytes.length,
          cryptographicHash: hash,
          registeredAt: at,
        });
        if (!updated) {
          // Enregistrement concurrent : l'objet remplacé est retiré, la version
          // enregistrée par l'autre requête reste la seule référence.
          await storage.delete(version.objectKey).catch(() => undefined);
          const fresh = await current.versions.findById(version.versionId);
          if (fresh?.status === 'ACTIVE' && fresh.cryptographicHash === hash && fresh.sizeBytes === bytes.length) {
            const result: DocumentContentRegistration = { version: toVersionView(fresh, policy), replayed: true };
            await complete(current, actor, command, result);
            return result;
          }
          throw conflict('Un enregistrement concurrent a modifié cette version : rejouez la commande.');
        }
        await current.documents.advanceCurrentVersion(document.documentId, updated.versionNumber);

        await audit(current, {
          entityId: document.documentId,
          actorId: actor.id,
          at,
          action: 'DOCUMENT_CONTENT_REGISTERED',
          command,
          afterState: {
            versionId: version.versionId,
            versionNumber: updated.versionNumber,
            sizeBytes: bytes.length,
            hashAlgorithm: 'SHA-256',
            cryptographicHash: hash,
          },
        });

        const result: DocumentContentRegistration = { version: toVersionView(updated, policy), replayed: false };
        await complete(current, actor, command, result);
        return result;
      });
    },

    /* ---------------- Téléchargement ---------------- */

    async issueSignedDownload(suppliedActor, documentId, versionId) {
      const actor = requireActor(suppliedActor);
      if (!signer) {
        throw new ApiError('NOT_IMPLEMENTED', 'La signature d’URL de téléchargement n’est pas configurée sur cette composition.');
      }
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const { document } = await loadForActor(current, actor, documentId);
        const version = versionId
          ? await loadVersionForDocument(current, document.documentId, versionId)
          : await current.versions.findByDocumentAndNumber(document.documentId, document.currentVersionNumber);
        if (!version || version.status !== 'ACTIVE') {
          throw new ApiError('NOT_FOUND', 'Aucune version enregistrée disponible pour ce document.');
        }
        if (document.status !== 'ACTIVE') {
          throw gone('Ce document est révoqué : son contenu n’est plus diffusé.');
        }
        const expiresAt = new Date(clock().getTime() + DOCUMENT_SIGNED_URL_TTL_SECONDS * 1000);
        const token = await signer.sign(`${document.documentId}.${version.versionId}.${actor.id}.${expiresAt.getTime()}`);
        const url = `${uploadUrlFor(document.documentId, version.versionId)}?token=${encodeURIComponent(token)}.${expiresAt.getTime()}`;
        await audit(current, {
          entityId: document.documentId,
          actorId: actor.id,
          at: clock().toISOString(),
          action: 'DOCUMENT_SIGNED_URL_ISSUED',
          afterState: { versionId: version.versionId, expiresAt: expiresAt.toISOString(), ttlSeconds: DOCUMENT_SIGNED_URL_TTL_SECONDS },
        });
        return { url, expiresAt: expiresAt.toISOString() };
      });
    },

    async downloadContent(suppliedActor, documentId, versionId, token) {
      const actor = requireActor(suppliedActor);
      const checked = await runInTransaction(async current => {
        await activeAccount(current, actor);
        const { document, access } = await loadForActor(current, actor, documentId);
        const version = await loadVersionForDocument(current, document.documentId, versionId);

        // Jeton signé optionnel : il prouve qu'une URL horodatée a été émise
        // pour CET acteur sur CE couple document/version — il ne remplace
        // jamais le contrôle d'accès ci-dessus.
        if (token) {
          if (!signer) throw new ApiError('FORBIDDEN', 'Jeton de téléchargement invalide.');
          const separator = token.lastIndexOf('.');
          if (separator <= 0) throw new ApiError('FORBIDDEN', 'Jeton de téléchargement invalide.');
          const signature = token.slice(0, separator);
          const expiresAtMs = Number(token.slice(separator + 1));
          if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs < clock().getTime()) {
            throw new ApiError('FORBIDDEN', 'Jeton de téléchargement expiré.');
          }
          const expected = `${document.documentId}.${version.versionId}.${actor.id}.${expiresAtMs}`;
          if (!(await signer.verify(expected, signature))) {
            throw new ApiError('FORBIDDEN', 'Jeton de téléchargement invalide.');
          }
        }

        if (version.status !== 'ACTIVE' && access !== 'ADMIN') {
          throw gone(
            version.status === 'PENDING_UPLOAD'
              ? 'Cette version n’a pas encore de contenu enregistré.'
              : 'Cette version est révoquée : son contenu n’est plus diffusé (métadonnées conservées).',
          );
        }
        if (document.status !== 'ACTIVE' && access !== 'ADMIN') {
          throw gone('Ce document est révoqué : son contenu n’est plus diffusé (métadonnées conservées).');
        }
        return { document, version, access };
      });

      // Lecture physique : absence d'objet ou empreinte divergente = refus de diffuser.
      const object = await storage.get(checked.version.objectKey);
      if (!object) {
        throw new ApiError('NOT_FOUND', 'L’objet physique de cette version est indisponible.');
      }
      const actualHash = await sha256Hex(object.body);
      if (checked.version.cryptographicHash && actualHash !== checked.version.cryptographicHash) {
        throw conflict('Intégrité du contenu non conforme à l’empreinte enregistrée : diffusion refusée.');
      }

      const at = clock().toISOString();
      await runInTransaction(async current => {
        await audit(current, {
          entityId: checked.document.documentId,
          actorId: actor.id,
          at,
          action: 'DOCUMENT_DOWNLOADED',
          afterState: {
            versionId: checked.version.versionId,
            versionNumber: checked.version.versionNumber,
            access: checked.access,
            integrityVerified: Boolean(checked.version.cryptographicHash),
          },
        });
      });

      const headers = new Headers({
        'content-type': checked.version.contentType,
        'content-length': String(object.body.length),
        'content-disposition': `attachment; filename="${checked.document.fileName.replace(/"/g, '_')}"`,
        'x-content-sha256': checked.version.cryptographicHash ?? actualHash,
        'x-document-version-status': checked.version.status,
        'cache-control': 'no-store',
      });
      return { response: new Response(new Uint8Array(object.body), { status: 200, headers }) };
    },

    async verifyIntegrity(suppliedActor, documentId, versionId, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const payload = { documentId, versionId };
        const reservation = await reserve<DocumentIntegrityReport>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;

        const { document } = await loadForActor(current, actor, documentId);
        const version = await loadVersionForDocument(current, document.documentId, versionId);

        const object = await storage.get(version.objectKey);
        const actualHash = object ? await sha256Hex(object.body) : null;
        const expectedHash = version.cryptographicHash ?? null;
        const at = clock().toISOString();
        const report: DocumentIntegrityReport = {
          documentId: document.documentId,
          versionId: version.versionId,
          expectedHash,
          actualHash,
          objectPresent: Boolean(object),
          match: Boolean(object && expectedHash && actualHash === expectedHash),
          verifiedAt: at,
          scope: 'TECHNICAL_INTEGRITY',
        };

        await audit(current, {
          entityId: document.documentId,
          actorId: actor.id,
          at,
          action: 'DOCUMENT_INTEGRITY_VERIFIED',
          command,
          afterState: {
            versionId: version.versionId,
            versionNumber: version.versionNumber,
            expectedHash,
            actualHash,
            objectPresent: report.objectPresent,
            match: report.match,
          },
        });
        await complete(current, actor, command, report);
        return report;
      });
    },

    /* ---------------- Liens entité ↔ version ---------------- */

    async listLinks(suppliedActor, documentId, versionId) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const { document } = await loadForActor(current, actor, documentId);
        await loadVersionForDocument(current, document.documentId, versionId);
        const links = await current.links.listForVersion(versionId);
        return links.map(toLinkView);
      });
    },

    async createLink(suppliedActor, documentId, versionId, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      if (!isDocumentEntityType(suppliedInput?.entityType) || !isDocumentLinkPurpose(suppliedInput?.linkPurpose)) {
        throw new ApiError('VALIDATION_ERROR', 'Le type d’entité ou la finalité du lien est invalide.');
      }
      // Valeurs confirmées hors de la fermeture transactionnelle (typage strict).
      const entityType = suppliedInput.entityType;
      const linkPurpose = suppliedInput.linkPurpose;
      const entityId = requireIdentifier(suppliedInput.entityId, 'entityId');
      const relatedActorId = suppliedInput.relatedActorId === undefined || suppliedInput.relatedActorId === null
        ? undefined
        : requireIdentifier(suppliedInput.relatedActorId, 'relatedActorId');
      const relatedEventRef = suppliedInput.relatedEventRef === undefined || suppliedInput.relatedEventRef === null
        ? undefined
        : requireIdentifier(suppliedInput.relatedEventRef, 'relatedEventRef');
      const note = suppliedInput.note === undefined || suppliedInput.note === null
        ? undefined
        : (() => {
            const value = String(suppliedInput.note).trim();
            if (value.length < 3 || value.length > MAX_NOTE_LENGTH) {
              throw new ApiError('VALIDATION_ERROR', 'La note doit contenir entre 3 et 500 caractères.');
            }
            return value;
          })();
      if (linkPurpose === 'ACCEPTANCE_PROOF' && !relatedActorId) {
        throw new ApiError('VALIDATION_ERROR', 'Un lien d’acceptation exige le signataire (relatedActorId).');
      }

      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const payload = { documentId, versionId, entityType: entityType, entityId, linkPurpose: linkPurpose, relatedActorId: relatedActorId ?? null };
        const reservation = await reserve<DocumentLinkResult>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;

        const document = await current.documents.findById(requireIdentifier(documentId, 'documentId'));
        if (!document) throw new ApiError('NOT_FOUND', 'Document introuvable.');
        if (document.ownerUserId !== actor.id) {
          throw new ApiError('FORBIDDEN', 'Seul le propriétaire peut lier ce document à une entité.');
        }
        if (document.status !== 'ACTIVE') {
          throw conflict('Un document révoqué ne peut pas recevoir de nouveau lien.');
        }
        const version = await loadVersionForDocument(current, document.documentId, versionId);
        if (version.status !== 'ACTIVE') {
          // Un lien n'existe que sur un contenu dont l'empreinte est connue.
          throw conflict('Seule une version enregistrée (empreinte connue) peut être liée à une entité.');
        }

        const violation = findDocumentLinkRuleViolation({
          documentType: document.documentType,
          linkPurpose: linkPurpose,
          entityType: entityType,
        });
        if (violation) throw new ApiError('VALIDATION_ERROR', violation);

        // L'entité cible doit EXISTER et le lieur doit en être partie.
        const parties = await current.access.entityPartyIds(entityType, entityId);
        if (!parties) throw new ApiError('NOT_FOUND', 'L’entité cible du lien est introuvable.');
        if (!parties.includes(actor.id)) {
          throw new ApiError('FORBIDDEN', 'Seule une partie de l’entité cible peut y lier un document.');
        }
        if (linkPurpose === 'VERIFICATION' && entityId !== actor.id) {
          throw new ApiError('FORBIDDEN', 'Un document de vérification ne peut être lié qu’à son propre sujet.');
        }

        let acceptedAt: string | undefined;
        if (linkPurpose === 'ACCEPTANCE_PROOF') {
          // La preuve d'acceptation ne peut rattacher qu'une signature RÉELLE.
          const signatureAt = await current.access.contractSignatureAt(entityId, relatedActorId!);
          if (!signatureAt) {
            throw conflict('La signature référencée n’existe pas pour cette partie sur ce contrat.');
          }
          acceptedAt = signatureAt;
        }

        const at = clock().toISOString();
        const linkId = newEntityId('dlnk');
        const outcome = await current.links.createIfAbsent({
          linkId,
          documentId: document.documentId,
          documentVersionId: version.versionId,
          entityType: entityType,
          entityId,
          linkPurpose: linkPurpose,
          ...(relatedActorId ? { relatedActorId } : {}),
          ...(relatedEventRef ? { relatedEventRef } : {}),
          ...(acceptedAt ? { acceptedAt } : {}),
          ...(note ? { note } : {}),
          createdAt: at,
          createdBy: actor.id,
        });

        if (outcome.kind === 'created') {
          await audit(current, {
            entityId: document.documentId,
            actorId: actor.id,
            at,
            action: 'DOCUMENT_LINK_CREATED',
            command,
            afterState: {
              linkId: outcome.link.linkId,
              versionId: version.versionId,
              versionNumber: version.versionNumber,
              cryptographicHash: version.cryptographicHash ?? null,
              entityType: outcome.link.entityType,
              entityId: outcome.link.entityId,
              linkPurpose: outcome.link.linkPurpose,
              ...(outcome.link.relatedActorId ? { relatedActorId: outcome.link.relatedActorId } : {}),
              ...(outcome.link.acceptedAt ? { acceptedAt: outcome.link.acceptedAt } : {}),
            },
          });
        }
        const result: DocumentLinkResult = { link: toLinkView(outcome.link), duplicated: outcome.kind === 'duplicate' };
        await complete(current, actor, command, result);
        return result;
      });
    },

    /* ---------------- ADMIN ---------------- */

    async listAdmin(suppliedActor, page, filters) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, DOCUMENTS_ADMIN_READ_PERMISSION);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        if (filters?.ownerUserId && filters.ownerUserId.length > MAX_ID_LENGTH) {
          throw new ApiError('VALIDATION_ERROR', 'ownerUserId est invalide.');
        }
        if (filters?.status && filters.status !== 'ACTIVE' && filters.status !== 'REVOKED') {
          throw new ApiError('VALIDATION_ERROR', 'Le filtre status doit être ACTIVE ou REVOKED.');
        }
        const records = await current.documents.listAll({
          limit: page.limit + 1,
          afterId: page.cursor,
          ...(filters?.ownerUserId ? { ownerUserId: filters.ownerUserId } : {}),
          ...(filters?.documentType ? { documentType: filters.documentType } : {}),
          ...(filters?.status ? { status: filters.status as DocumentRecord['status'] } : {}),
        });
        const hasMore = records.length > page.limit;
        const visible = records.slice(0, page.limit);
        const items: DocumentSummaryView[] = [];
        for (const record of visible) {
          items.push(toSummaryView(record, await current.retention.getPolicy(record.documentType)));
        }
        return {
          items,
          cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].documentId : null,
          limit: page.limit,
          hasMore,
        };
      });
    },

    async readAdmin(suppliedActor, documentId) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, DOCUMENTS_ADMIN_READ_PERMISSION);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const document = await current.documents.findById(requireIdentifier(documentId, 'documentId'));
        if (!document) throw new ApiError('NOT_FOUND', 'Document introuvable.');
        return toDetailView(current, document);
      });
    },

    async revokeVersionAdmin(suppliedActor, documentId, versionId, suppliedReason, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, DOCUMENTS_ADMIN_CORRECT_PERMISSION);
      const command = requireCommand(actor, suppliedCommand);
      const reason = requireReason(suppliedReason);

      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const payload = { documentId, versionId, reason };
        const reservation = await reserve<DocumentVersionView>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;

        const document = await current.documents.findByIdForUpdate(requireIdentifier(documentId, 'documentId'));
        if (!document) throw new ApiError('NOT_FOUND', 'Document introuvable.');
        const version = await loadVersionForDocument(current, document.documentId, versionId);
        if (version.status === 'PENDING_UPLOAD') {
          throw conflict('Seule une version enregistrée peut être révoquée.');
        }
        if (version.status === 'REVOKED') {
          throw conflict('Cette version est déjà révoquée : aucune double révocation.');
        }

        const at = clock().toISOString();
        const updated = await current.versions.compareAndSetRevocation({
          versionId: version.versionId,
          at,
          actorId: actor.id,
          reason,
        });
        if (!updated) throw conflict('Une correction concurrente a modifié cette version : rejouez la commande.');

        const historyEntry: DocumentHistoryEntry = {
          at,
          actorId: actor.id,
          action: 'DOCUMENT_VERSION_REVOKED',
          reason,
          versionNumber: version.versionNumber,
        };
        await current.documents.appendHistory(document.documentId, historyEntry);

        // La version reste RÉFÉRENCABLE : les acceptations existantes ne sont
        // jamais rompues — leur nombre est tracé dans l'audit.
        const acceptanceLinks = await current.links.countAcceptanceLinksForVersion(version.versionId);
        await audit(current, {
          entityId: document.documentId,
          actorId: actor.id,
          at,
          action: 'DOCUMENT_VERSION_REVOKED',
          command,
          beforeState: { versionId: version.versionId, status: version.status, cryptographicHash: version.cryptographicHash ?? null },
          afterState: {
            versionId: version.versionId,
            status: updated.status,
            reason,
            acceptanceLinksPreserved: acceptanceLinks,
            historyAppendedOnly: true,
          },
        });

        const policy = await current.retention.getPolicy(document.documentType);
        const result = toVersionView(updated, policy);
        await complete(current, actor, command, result);
        return result;
      });
    },

    async revokeDocumentAdmin(suppliedActor, documentId, suppliedReason, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, DOCUMENTS_ADMIN_CORRECT_PERMISSION);
      const command = requireCommand(actor, suppliedCommand);
      const reason = requireReason(suppliedReason);

      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const payload = { documentId, reason };
        const reservation = await reserve<DocumentDetailView>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;

        const document = await current.documents.findByIdForUpdate(requireIdentifier(documentId, 'documentId'));
        if (!document) throw new ApiError('NOT_FOUND', 'Document introuvable.');
        if (document.status !== 'ACTIVE') {
          throw conflict('Ce document est déjà révoqué : aucune double révocation.');
        }

        const at = clock().toISOString();
        const updated = await current.documents.compareAndSetRevocation({
          documentId: document.documentId,
          at,
          actorId: actor.id,
          reason,
          historyEntry: { at, actorId: actor.id, action: 'DOCUMENT_REVOKED', reason },
        });
        if (!updated) throw conflict('Une correction concurrente a modifié ce document : rejouez la commande.');

        await audit(current, {
          entityId: document.documentId,
          actorId: actor.id,
          at,
          action: 'DOCUMENT_REVOKED',
          command,
          beforeState: { status: document.status, currentVersionNumber: document.currentVersionNumber },
          afterState: { status: updated.status, reason, historyAppendedOnly: true },
        });

        const result = await toDetailView(current, updated);
        await complete(current, actor, command, result);
        return result;
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Handlers API                                                        */
/* ------------------------------------------------------------------ */

function readJsonObject(value: string): Record<string, unknown> {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps JSON invalide.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile doit être un objet JSON.');
  }
  return parsed as Record<string, unknown>;
}

function strictFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length > 0) throw new ApiError('VALIDATION_ERROR', `Champ non autorisé : ${extra.join(', ')}.`);
}

export function createDocumentApiHandlers(repository: OpenDocumentRepository): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'documents.mine.list': async context =>
      repository.listMine(context.actor!, context.page ?? { cursor: null, limit: 25 }),

    'documents.upload-grant': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['title', 'fileName', 'contentType', 'sizeBytes', 'documentType', 'purposeNote']);
      return repository.createUploadGrant(context.actor!, {
        title: body.title as string,
        fileName: body.fileName as string,
        contentType: body.contentType as DocumentCreateInput['contentType'],
        sizeBytes: body.sizeBytes as number,
        documentType: body.documentType as DocumentType,
        ...(body.purposeNote !== undefined ? { purposeNote: body.purposeNote as string } : {}),
      }, context.command!);
    },

    'documents.read': async context => repository.read(context.actor!, context.params.documentId),

    'documents.versions.list': async context => repository.listVersions(context.actor!, context.params.documentId),

    'documents.versions.create': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['contentType', 'sizeBytes']);
      return repository.createVersion(context.actor!, context.params.documentId, {
        contentType: body.contentType as DocumentCreateInput['contentType'],
        sizeBytes: body.sizeBytes as number,
      }, context.command!);
    },

    'documents.versions.content.upload': async context => {
      const buffer = await context.request.arrayBuffer();
      return repository.uploadContent(context.actor!, context.params.documentId, context.params.versionId, {
        bytes: new Uint8Array(buffer),
        contentType: context.request.headers.get('content-type') ?? '',
      }, context.command!);
    },

    'documents.signed-download': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['versionId']);
      return repository.issueSignedDownload(
        context.actor!,
        context.params.documentId,
        typeof body.versionId === 'string' && body.versionId ? body.versionId : null,
      );
    },

    'documents.versions.content.download': async context => {
      const token = context.url.searchParams.get('token');
      const result = await repository.downloadContent(
        context.actor!,
        context.params.documentId,
        context.params.versionId,
        token,
      );
      return result.response;
    },

    'documents.versions.integrity.verify': async context =>
      repository.verifyIntegrity(context.actor!, context.params.documentId, context.params.versionId, context.command!),

    'documents.links.list': async context =>
      repository.listLinks(context.actor!, context.params.documentId, context.params.versionId),

    'documents.links.create': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['entityType', 'entityId', 'linkPurpose', 'relatedActorId', 'relatedEventRef', 'note']);
      return repository.createLink(context.actor!, context.params.documentId, context.params.versionId, {
        entityType: body.entityType as string,
        entityId: body.entityId as string,
        linkPurpose: body.linkPurpose as string,
        ...(body.relatedActorId !== undefined ? { relatedActorId: body.relatedActorId as string } : {}),
        ...(body.relatedEventRef !== undefined ? { relatedEventRef: body.relatedEventRef as string } : {}),
        ...(body.note !== undefined ? { note: body.note as string } : {}),
      }, context.command!);
    },

    'admin.documents.list': async context => {
      const ownerUserId = context.url.searchParams.get('ownerUserId') ?? undefined;
      const rawType = context.url.searchParams.get('documentType');
      const status = context.url.searchParams.get('status') ?? undefined;
      return repository.listAdmin(context.actor!, context.page ?? { cursor: null, limit: 25 }, {
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(rawType ? { documentType: rawType as DocumentType } : {}),
        ...(status ? { status } : {}),
      });
    },

    'admin.documents.read': async context => repository.readAdmin(context.actor!, context.params.documentId),

    'admin.documents.versions.revoke': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['reason']);
      return repository.revokeVersionAdmin(
        context.actor!,
        context.params.documentId,
        context.params.versionId,
        body.reason as string,
        context.command!,
      );
    },

    'admin.documents.revoke': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['reason']);
      return repository.revokeDocumentAdmin(
        context.actor!,
        context.params.documentId,
        body.reason as string,
        context.command!,
      );
    },
  };
}
