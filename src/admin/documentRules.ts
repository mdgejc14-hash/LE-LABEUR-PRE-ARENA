/**
 * P4F-DESIGN-ADMIN-DOCUMENTS — règles d'interface PURES des Documents ADMIN.
 *
 * Aucune I/O, aucun React : ces fonctions décident seulement si un bouton est
 * OFFERT dans l'interface, à partir des permissions réellement reçues de la
 * session serveur et des statuts réellement renvoyés par admin.documents.*.
 * Le serveur reste l'autorité : il revalide chaque commande (permission,
 * état, motif, idempotence, audit). Une action refusée ici n'est jamais
 * simulée côté client.
 *
 * Ce qui n'est PAS dans ce module (et n'existe pas côté serveur) :
 *   - aucun statut « vérifié », « validé », « rejeté », « en quarantaine » ;
 *   - aucune décision de vérification, aucune levée d'isolement ;
 *   - aucune purge, aucune politique de rétention modifiable ;
 *   - aucune lecture binaire (téléchargement, présignature) depuis l'ADMIN.
 */

import type { DocumentIntegrityReport } from '../backend/documents/documentRepository';
import { DOCUMENT_LINK_PURPOSES, DOCUMENT_TYPES, RETENTION_CLASSES } from '../domain/documentRules';

/** Permission réelle de lecture (constante serveur `DOCUMENTS_ADMIN_READ_PERMISSION`). */
export const DOCUMENT_READ_PERMISSION = 'documents:read:any';
/** Permission réelle des commandes (constante serveur `DOCUMENTS_ADMIN_CORRECT_PERMISSION`). */
export const DOCUMENT_CORRECT_PERMISSION = 'incidents:arbitrate';

/** Bornes réelles du motif (`requireReason` côté serveur, après trim). */
export const DOCUMENT_REASON_MIN_LENGTH = 3;
export const DOCUMENT_REASON_MAX_LENGTH = 1000;

/** Taille de page demandée au registre (le serveur borne la valeur). */
export const DOCUMENT_REGISTRY_PAGE_LIMIT = 50;

export const DOCUMENT_STATUS_VALUES = ['ACTIVE', 'REVOKED'] as const;
export type DocumentStatusValue = (typeof DOCUMENT_STATUS_VALUES)[number];
export const DOCUMENT_VERSION_STATUS_VALUES = ['PENDING_UPLOAD', 'ACTIVE', 'REVOKED'] as const;
export type DocumentVersionStatusValue = (typeof DOCUMENT_VERSION_STATUS_VALUES)[number];

export type CapabilityCheck = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

const ALLOWED: CapabilityCheck = { allowed: true };

function deny(reason: string): CapabilityCheck {
  return { allowed: false, reason };
}

function granted(permissions: readonly string[] | undefined, permission: string): boolean {
  return Boolean(permissions?.includes(permission));
}

export function canReadDocuments(permissions: readonly string[] | undefined): boolean {
  return granted(permissions, DOCUMENT_READ_PERMISSION);
}

export function canCorrectDocuments(permissions: readonly string[] | undefined): boolean {
  return granted(permissions, DOCUMENT_CORRECT_PERMISSION);
}

/**
 * Contrôle d'intégrité technique d'une version : recalcul de l'empreinte SHA-256
 * côté serveur (documents.versions.integrity.verify, permission documents:read:any).
 * Sans contenu enregistré, il n'existe rien à recalculer : aucun bouton.
 */
export function canVerifyVersionIntegrity(
  permissions: readonly string[] | undefined,
  version: { readonly status: string; readonly cryptographicHash?: string },
): CapabilityCheck {
  if (!canReadDocuments(permissions)) {
    return deny('Permission serveur documents:read:any absente : aucun contrôle d’intégrité n’est proposé.');
  }
  if (version.status === 'PENDING_UPLOAD' || !version.cryptographicHash) {
    return deny('Aucun contenu n’est enregistré pour cette version : il n’existe aucune empreinte à recalculer.');
  }
  return ALLOWED;
}

/** Révocation d'une version (incidents:arbitrate) : seule une version ACTIVE est révocable. */
export function canRevokeVersion(
  permissions: readonly string[] | undefined,
  version: { readonly status: string },
): CapabilityCheck {
  if (!canCorrectDocuments(permissions)) {
    return deny('Permission serveur incidents:arbitrate absente : aucune révocation n’est proposée.');
  }
  if (version.status === 'PENDING_UPLOAD') {
    return deny('Seule une version dont le contenu est enregistré peut être révoquée.');
  }
  if (version.status === 'REVOKED') {
    return deny('Cette version est déjà révoquée : le serveur refuse la double révocation.');
  }
  return ALLOWED;
}

/** Révocation du Document entier (incidents:arbitrate) : seul un Document ACTIVE est révocable. */
export function canRevokeDocument(
  permissions: readonly string[] | undefined,
  document: { readonly status: string },
): CapabilityCheck {
  if (!canCorrectDocuments(permissions)) {
    return deny('Permission serveur incidents:arbitrate absente : aucune révocation n’est proposée.');
  }
  if (document.status !== 'ACTIVE') {
    return deny('Ce Document est déjà révoqué : le serveur refuse la double révocation.');
  }
  return ALLOWED;
}

/** Motif obligatoire : 3 à 1000 caractères après suppression des espaces de bord. */
export function revocationReasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < DOCUMENT_REASON_MIN_LENGTH) {
    return `Le motif doit contenir entre ${DOCUMENT_REASON_MIN_LENGTH} et ${DOCUMENT_REASON_MAX_LENGTH} caractères.`;
  }
  if (length > DOCUMENT_REASON_MAX_LENGTH) {
    return `Le motif dépasse ${DOCUMENT_REASON_MAX_LENGTH} caractères.`;
  }
  return null;
}

/**
 * Lien vers la fiche ADMIN de l'entité liée, UNIQUEMENT quand la route existe
 * dans le routeur P0. Sinon `null` : aucun lien n'est fabriqué.
 */
export function entityHref(entityType: string, entityId: string): string | null {
  const id = encodeURIComponent(entityId);
  switch (entityType) {
    case 'CONTRACT':
      return `/admin/contrats/${id}`;
    case 'CLAIM':
      return `/admin/litiges/${id}`;
    case 'REPLACEMENT':
      return `/admin/remplacements/${id}`;
    case 'USER':
      return `/admin/utilisateurs/${id}`;
    default:
      return null;
  }
}

export type IntegrityTone = 'emerald' | 'amber' | 'clay';

export interface IntegrityVerdictView {
  readonly label: string;
  readonly tone: IntegrityTone;
  readonly detail: string;
}

/**
 * Verdict affiché pour un rapport d'intégrité réel. Le libellé ne parle jamais
 * de « certification » ni d'horodatage qualifié : l'empreinte SHA-256 est un
 * contrôle TECHNIQUE (`scope: TECHNICAL_INTEGRITY`).
 */
export function integrityVerdict(report: Pick<DocumentIntegrityReport, 'objectPresent' | 'expectedHash' | 'match'>): IntegrityVerdictView {
  if (!report.objectPresent) {
    return {
      label: 'Contenu absent du stockage',
      tone: 'clay',
      detail: 'Le serveur ne retrouve aucun contenu pour cette version. L’interface ne répare ni ne remplace rien.',
    };
  }
  if (!report.expectedHash) {
    return {
      label: 'Aucune empreinte de référence',
      tone: 'amber',
      detail: 'Aucune empreinte n’est enregistrée pour comparer le contenu recalculé.',
    };
  }
  if (report.match) {
    return {
      label: 'Concordance technique',
      tone: 'emerald',
      detail: 'Le contenu recalculé par le serveur correspond à l’empreinte enregistrée. Ce contrôle technique n’est ni une certification juridique ni un horodatage qualifié.',
    };
  }
  return {
    label: 'Écart d’empreinte',
    tone: 'clay',
    detail: 'Le contenu recalculé diffère de l’empreinte enregistrée. Le Document n’est pas modifié automatiquement ; le contrôle est journalisé côté serveur.',
  };
}

/** Texte de conservation : la durée n'est affichée que si elle est configurée. */
export function retentionSummary(retention: { readonly durationStatus: string; readonly retentionDays: number | null }): string {
  if (retention.durationStatus === 'CONFIGURED' && retention.retentionDays !== null) {
    return `Configurée : ${retention.retentionDays} jours`;
  }
  return 'En attente de validation juridique : aucune échéance n’est calculée.';
}

export interface DocumentRegistryFilters {
  readonly ownerUserId: string;
  readonly documentType: '' | (typeof DOCUMENT_TYPES)[number];
  readonly status: '' | DocumentStatusValue;
}

export const EMPTY_DOCUMENT_FILTERS: DocumentRegistryFilters = { ownerUserId: '', documentType: '', status: '' };

/** Requête serveur du registre : seuls les filtres réellement acceptés sont envoyés. */
export function registryQuery(filters: DocumentRegistryFilters, cursor: string | null) {
  const owner = filters.ownerUserId.trim();
  return {
    limit: DOCUMENT_REGISTRY_PAGE_LIMIT,
    cursor,
    ...(owner ? { ownerUserId: owner } : {}),
    ...(filters.documentType ? { documentType: filters.documentType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

export function summarizeStatuses(items: readonly { readonly status: string }[]) {
  return {
    total: items.length,
    active: items.filter((item) => item.status === 'ACTIVE').length,
    revoked: items.filter((item) => item.status === 'REVOKED').length,
  };
}

/** Valeurs de classe et de finalité réelles, exposées pour les parités de test. */
export const DOCUMENT_RETENTION_CLASS_VALUES: readonly string[] = RETENTION_CLASSES;
export const DOCUMENT_LINK_PURPOSE_VALUES: readonly string[] = DOCUMENT_LINK_PURPOSES;
