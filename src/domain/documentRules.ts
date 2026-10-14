/**
 * LE LABEUR — P0-R2 — règles documentaires pures (aucune dépendance, aucun état).
 *
 * Ce module concentre :
 *  - la typologie des documents et leurs classes de conservation ;
 *  - la matrice document ↔ type de lien ↔ entité (la seule source de vérité) ;
 *  - les bornes techniques (taille, formats, empreinte) ;
 *  - les garde-fous de formulation juridique : une attestation est une
 *    « Attestation électronique de traçabilité », jamais un justificatif d'un
 *    autre régime ; rien ici ne « certifie » un contenu — l'empreinte SHA-256
 *    constate une intégrité technique, elle ne crée pas une preuve juridique
 *    qualifiée ;
 *  - les garde-fous financiers : aucune logique de montant n'appartient à la
 *    brique documents — le modèle reste Prix Prestataire + Frais SaaS LE
 *    LABEUR = Coût Client, sans conservation d'aucune répartition.
 */

export const DOCUMENT_TYPES = [
  'CONTRACT_DOCUMENT',
  'ACCEPTANCE_PROOF',
  'MISSION_JUSTIFICATION',
  'EXECUTION_PROOF',
  'WORKFLOW_SUPPORT',
  'TRACEABILITY_ATTESTATION',
  'VERIFICATION_DOCUMENT',
  'TEMPORARY',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const RETENTION_CLASSES = [
  'CONTRACTUAL',
  'TRACEABILITY',
  'MISSION',
  'VERIFICATION',
  'TEMPORARY',
] as const;
export type RetentionClass = (typeof RETENTION_CLASSES)[number];

export const DOCUMENT_ENTITY_TYPES = [
  'CONTRACT',
  'PROPOSAL',
  'CLAIM',
  'REPLACEMENT',
  'PAYMENT',
  'SALARY_CONFIRMATION',
  'USER',
] as const;
export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

export const DOCUMENT_LINK_PURPOSES = [
  'CONTRACT_VERSION',
  'ACCEPTANCE_PROOF',
  'EXECUTION_PROOF',
  'JUSTIFICATION',
  'EVIDENCE',
  'ATTESTATION',
  'VERIFICATION',
  'SUPPORTING',
] as const;
export type DocumentLinkPurpose = (typeof DOCUMENT_LINK_PURPOSES)[number];

/** Formats binaires admis — alignés sur `DocumentMetadata['mimeType']` (déjà au dépôt). */
export const DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];

/** Borne technique d'un fichier (25 Mio) : ni une durée, ni une règle juridique. */
export const MAX_DOCUMENT_CONTENT_BYTES = 26_214_400;
export const DOCUMENT_HASH_ALGORITHM = 'SHA-256';
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

export type DocumentStatus = 'ACTIVE' | 'REVOKED';
export type DocumentVersionStatus = 'PENDING_UPLOAD' | 'ACTIVE' | 'REVOKED';
export type DocumentProvenance = 'USER_UPLOAD' | 'SYSTEM_EXPORT';

/** Libellé EXACT de l'attestation de cette tranche — aucun autre régime. */
export const TRACEABILITY_ATTESTATION_LABEL = 'Attestation électronique de traçabilité';

/**
 * Formulations juridiquement interdites dans la brique documentaire : le
 * système décrit une traçabilité applicative, jamais une certification
 * juridique, une irréfutabilité ou un dispositif qualifié sans statut
 * correspondant. AUCUNE collecte massive non plus : le dépôt n'ouvre aucun
 * parcours d'inscription documentaire — biométrie, reconnaissance faciale,
 * interconnexion d'État, pièces médicales et casier n'y ont pas leur place.
 */
export const DOCUMENT_WORDING_DENYLIST: readonly RegExp[] = [
  /irr[ée]futable/i,
  /inalt[ée]rable/i,
  /horodatage\s+qualifi[ée]/i,
  /tiers\s+certificateur/i,
  /certificat\s+bancaire/i,
  /bulletin\s+de\s+paie/i,
  /certificat\s+de\s+salaire/i,
  /biom[ée]tri/i,
  /reconnaissance\s+faciale/i,
  /\bANIP\b/,
  /casier\s+judiciaire/i,
  /pi[èe]ce\s+m[ée]dicale/i,
];

/**
 * Garde-fou financier : aucune répartition de montant ne doit être stockée ou
 * documentée ici — LE LABEUR ne détient pas le prix de la prestation.
 */
export const DOCUMENT_FINANCIAL_DENYLIST: readonly RegExp[] = [
  /75[\s_]?000/,
  /25[\s_]?000/,
  /0[.,]75/,
  /0[.,]25/,
  /75\s?%/,
  /25\s?%/,
];

/** Une classe de conservation par type de document — fixe et explicite. */
export const DOCUMENT_RETENTION_CLASS_BY_TYPE: Record<DocumentType, RetentionClass> = {
  CONTRACT_DOCUMENT: 'CONTRACTUAL',
  ACCEPTANCE_PROOF: 'CONTRACTUAL',
  TRACEABILITY_ATTESTATION: 'TRACEABILITY',
  MISSION_JUSTIFICATION: 'MISSION',
  EXECUTION_PROOF: 'MISSION',
  WORKFLOW_SUPPORT: 'MISSION',
  VERIFICATION_DOCUMENT: 'VERIFICATION',
  TEMPORARY: 'TEMPORARY',
};

export function retentionClassForDocumentType(type: DocumentType): RetentionClass {
  return DOCUMENT_RETENTION_CLASS_BY_TYPE[type];
}

/**
 * Types de lien autorisés par type de document : un document de vérification
 * ne devient jamais une version de contrat, une attestation reste une
 * attestation de traçabilité, etc.
 */
export const DOCUMENT_LINK_PURPOSES_BY_TYPE: Record<DocumentType, readonly DocumentLinkPurpose[]> = {
  CONTRACT_DOCUMENT: ['CONTRACT_VERSION', 'ACCEPTANCE_PROOF', 'SUPPORTING'],
  ACCEPTANCE_PROOF: ['ACCEPTANCE_PROOF', 'SUPPORTING'],
  MISSION_JUSTIFICATION: ['JUSTIFICATION', 'EVIDENCE', 'SUPPORTING'],
  EXECUTION_PROOF: ['EXECUTION_PROOF', 'EVIDENCE', 'SUPPORTING'],
  WORKFLOW_SUPPORT: ['JUSTIFICATION', 'EVIDENCE', 'SUPPORTING'],
  TRACEABILITY_ATTESTATION: ['ATTESTATION', 'SUPPORTING'],
  VERIFICATION_DOCUMENT: ['VERIFICATION'],
  TEMPORARY: ['SUPPORTING'],
};

export function linkPurposesForDocumentType(type: DocumentType): readonly DocumentLinkPurpose[] {
  return DOCUMENT_LINK_PURPOSES_BY_TYPE[type];
}

/**
 * Accès participant (l'autre partie d'un contrat / claim / paiement lié) : les
 * documents de vérification sont à accès restreint (propriétaire + ADMIN avec
 * permission) — finalité déclarée, aucune exposition aux parties.
 */
export function participantsCanAccessDocument(type: DocumentType): boolean {
  return type !== 'VERIFICATION_DOCUMENT';
}

/** Finalité écrite obligatoire pour tout document à finalité sensible. */
export function purposeNoteRequired(type: DocumentType): boolean {
  return type === 'VERIFICATION_DOCUMENT';
}

/** Une acceptation ne se rattache qu'au cycle contractuel existant. */
export const ACCEPTANCE_LINK_ENTITY_TYPES: readonly DocumentEntityType[] = ['CONTRACT'];

/** Un document de vérification ne se lie qu'à son sujet (jamais à un contrat). */
export const VERIFICATION_LINK_ENTITY_TYPES: readonly DocumentEntityType[] = ['USER'];

/**
 * Matrice pure type/purpose/entité. Renvoie la violation ou `null`.
 */
export function findDocumentLinkRuleViolation(input: {
  documentType: DocumentType;
  linkPurpose: DocumentLinkPurpose;
  entityType: DocumentEntityType;
}): string | null {
  if (!linkPurposesForDocumentType(input.documentType).includes(input.linkPurpose)) {
    return `Le type de lien ${input.linkPurpose} est incompatible avec le type de document ${input.documentType}.`;
  }
  if (input.linkPurpose === 'ACCEPTANCE_PROOF' && !ACCEPTANCE_LINK_ENTITY_TYPES.includes(input.entityType)) {
    return 'Un lien d’acceptation ne peut viser qu’un contrat (cycle de signature existant).';
  }
  if (input.linkPurpose === 'VERIFICATION' && !VERIFICATION_LINK_ENTITY_TYPES.includes(input.entityType)) {
    return 'Un document de vérification ne peut être lié qu’à son sujet utilisateur.';
  }
  return null;
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isDocumentEntityType(value: unknown): value is DocumentEntityType {
  return typeof value === 'string' && (DOCUMENT_ENTITY_TYPES as readonly string[]).includes(value);
}

export function isDocumentLinkPurpose(value: unknown): value is DocumentLinkPurpose {
  return typeof value === 'string' && (DOCUMENT_LINK_PURPOSES as readonly string[]).includes(value);
}

export function isDocumentContentType(value: unknown): value is DocumentContentType {
  return typeof value === 'string' && (DOCUMENT_CONTENT_TYPES as readonly string[]).includes(value);
}
