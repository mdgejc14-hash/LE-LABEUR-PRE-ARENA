/**
 * ADM —— VOCABULAIRE LE LABEUR (source de vérité des textes affichés).
 *
 * Règle absolue des tranches P4A → P4D : les fiches du Master
 * Design nomment parfois autrement des objets qui EXISTENT déjà dans LE LABEUR.
 * La structure visuelle des fiches est reprise ; les noms affichés restent ceux
 * du produit. Aucun objet, aucune route, aucun statut, aucun type, aucun
 * endpoint et aucun identifiant métier n'est renommé.
 *
 * Correspondance (documentée, jamais affichée telle quelle) :
 *   fiche « Mission »      → produit OFFRE / « Offre »
 *   fiche « Client »       → produit EMPLOYER / « Employeur »
 *   fiche « Prestataire »  → produit CANDIDATE / « Candidat »
 *   fiche « Candidature »  → produit APPLICATION / « Candidature »
 *   fiche « Proposition »  → produit PROPOSAL / « Proposition »
 *   fiche « Contrat »      → produit CONTRACT / « Contrat »
 *   fiche « Litige »       → produit CLAIM / « Claim »
 *   fiche « Paiement »     → produit PAYMENT / « Paiement »
 *   fiche « Salaire »      → produit SALARY / « Salaire »
 *   fiche « Confirmations de salaire » → produit SALARY_CONFIRMATION /
 *                            « confirmation de Salaire » (demande réservée à
 *                            l’Employeur, confirmation OTP réservée au Candidat)
 *   fiche « Preuves OTP »  → produit : preuve de réception du Salaire, examinée
 *                            sans jamais exposer un secret (aucun renommage)
 *   fiche « Remplacement » → produit REPLACEMENT / « Remplacement » (dossier
 *                            persistant ReplacementDossier ; statuts réels
 *                            PENDING_OFFER / SOURCING_CANDIDATES /
 *                            CANDIDATE_SELECTED / TRANSFERRED_TO_EMPLOYER /
 *                            CONTRACT_FINALIZED, jamais renommés)
 *   fiche « prestataire sortant » → produit : Candidat du Contrat source
 *   fiche « remplaçant » / « entrant » → produit : Candidat sélectionné
 *                            (Candidature puis Proposition acceptée)
 *   fiche « mission » d'un remplacement → produit : Offre de remplacement
 *   fiche « motif » d'un remplacement → produit : Claim d'origine (type et
 *                            motif lus sur le Claim, jamais recopiés)
 *   fiche « bascule » / « contrat successeur » → produit : Contrat successeur
 *                            (nouveau Contrat, cycle normal de signature)
 *   fiche états « notification, contestation, recherche, bascule, clôturé »
 *                            → AUCUN équivalent produit : non affichés comme
 *                            statuts (BACKEND_GAP documenté)
 *   fiche « Matching »     → produit MATCHING / « Matching »
 *   fiche « Document »     → produit DOCUMENT / « Document »
 *   fiche « Qualification »→ produit QUALIFICATION / « Qualification » (moteur
 *                            réel `matching.qualification.*`, décisions
 *                            ELIGIBLE_FOR_INDEPENDENT / HUMAN_REVIEW_REQUIRED / BLOCKED)
 *   fiche « Réputation »   → produit REPUTATION / « Réputation » (ledger
 *                            `reputation_entries`, impact stocké, statuts
 *                            ACTIVE / REVERSED ; aucune note 0-100)
 *   fiche « contestation de réputation » → AUCUN objet produit : non affiché
 *                            comme file (BACKEND_GAP documenté)
 *   fiche « Utilisateur »  → compte produit (rôles EMPLOYER / CANDIDATE / ADMIN,
 *                            statuts ACTIVE / BLOCKED du modèle réel)
 *
 * Les libellés d'état ci-dessous traduisent à l'écran des valeurs de statut
 * RÉELLES du modèle (jamais des valeurs inventées) ; les identifiants de code
 * restent ceux du produit (`ACTIVE`, `BLOCKED`, `HUMAN_REVIEW_REQUIRED`…).
 */

import type { ContractStatus, NotificationType, ProposalStatus, ReplacementDossier, UserRole } from '../types';
import type { DocumentEntityType, DocumentLinkPurpose, DocumentType, RetentionClass } from '../domain/documentRules';
import type { ServerUserRecord } from '../backend/identity/stores';
import type { QualificationDecision, QualificationReasonSeverity } from '../backend/matching/records';
import type {
  ClaimEvidenceStatus,
  ClaimEvidenceType,
  ClaimStatus,
  ClaimType,
} from '../backend/disputes/records';
import type { PaymentLifecycleStatus, PaymentType } from '../domain/paymentLifecycle';
import type {
  PaymentReconciliationBatchStatus,
  PaymentReconciliationItemStatus,
  PaymentReconciliationReviewDecision,
  PaymentReconciliationVerdict,
} from '../backend/persistence/paymentReconciliationRecords';
import type { PaymentDeclarationRecord } from '../backend/persistence/paymentRecords';
import type {
  ReputationCategory,
  ReputationDirection,
  ReputationProvenance,
  ReputationSourceEntityType,
  ReputationStatus,
} from '../domain/reputationRules';

/** Objets métier canoniques du produit (noms de code stables, jamais traduits en UI). */
export const PRODUCT_OBJECTS = {
  ADMIN: 'ADMIN',
  EMPLOYER: 'EMPLOYER',
  CANDIDATE: 'CANDIDATE',
  OFFER: 'OFFER',
  APPLICATION: 'APPLICATION',
  PROPOSAL: 'PROPOSAL',
  CONTRACT: 'CONTRACT',
  CLAIM: 'CLAIM',
  PAYMENT: 'PAYMENT',
  SALARY: 'SALARY',
  REPLACEMENT: 'REPLACEMENT',
  MATCHING: 'MATCHING',
  DOCUMENT: 'DOCUMENT',
  QUALIFICATION: 'QUALIFICATION',
  REPUTATION: 'REPUTATION',
} as const;

export type ProductObject = (typeof PRODUCT_OBJECTS)[keyof typeof PRODUCT_OBJECTS];

/** Libellés produit affichables (un seul mot par objet, jamais un synonyme de fiche). */
export const PRODUCT_LABELS: Record<ProductObject, { singular: string; plural: string }> = {
  ADMIN: { singular: 'Admin', plural: 'Admins' },
  EMPLOYER: { singular: 'Employeur', plural: 'Employeurs' },
  CANDIDATE: { singular: 'Candidat', plural: 'Candidats' },
  OFFER: { singular: 'Offre', plural: 'Offres' },
  APPLICATION: { singular: 'Candidature', plural: 'Candidatures' },
  PROPOSAL: { singular: 'Proposition', plural: 'Propositions' },
  CONTRACT: { singular: 'Contrat', plural: 'Contrats' },
  CLAIM: { singular: 'Claim', plural: 'Claims' },
  PAYMENT: { singular: 'Paiement', plural: 'Paiements' },
  SALARY: { singular: 'Salaire', plural: 'Salaires' },
  REPLACEMENT: { singular: 'Remplacement', plural: 'Remplacements' },
  MATCHING: { singular: 'Matching', plural: 'Matchings' },
  DOCUMENT: { singular: 'Document', plural: 'Documents' },
  QUALIFICATION: { singular: 'Qualification', plural: 'Qualifications' },
  REPUTATION: { singular: 'Réputation', plural: 'Réputations' },
};

/** Termes de fiche qui NE DOIVENT PAS devenir des libellés métier de l'interface. */
export const DESIGN_ONLY_TERMS_NOT_RENDERED = [
  'Mission',
  'Missions',
  'Client',
  'Clients',
  'Prestataire',
  'Prestataires',
  'Prestation',
  'Litige',
  'Litiges',
] as const;

/** Rôles de compte réels (table `users`, type `UserRole`). */
export const ROLE_LABELS: Record<UserRole, string> = {
  EMPLOYER: PRODUCT_LABELS.EMPLOYER.singular,
  CANDIDATE: PRODUCT_LABELS.CANDIDATE.singular,
  ADMIN: PRODUCT_LABELS.ADMIN.singular,
};

/**
 * Statuts de compte réels du DTO ADMIN (`AdminUserDto.status`, type serveur
 * `identity/stores` : ACTIVE | BLOCKED | PENDING). Aucun statut n'est inventé.
 */
export type AdminAccountStatus = ServerUserRecord['status'];

export const ACCOUNT_STATUS_LABELS: Record<AdminAccountStatus, string> = {
  ACTIVE: 'Actif',
  BLOCKED: 'Bloqué',
  PENDING: 'En attente',
};

/**
 * Décisions réelles du moteur de qualification (`QUALIFICATION_DECISIONS`,
 * vérifiées dans `src/backend/matching/records.ts` et par le test ADM).
 */
export const QUALIFICATION_DECISION_LABELS: Record<QualificationDecision, string> = {
  ELIGIBLE_FOR_INDEPENDENT: 'Éligible',
  HUMAN_REVIEW_REQUIRED: 'Revue humaine requise',
  BLOCKED: 'Bloqué',
};

/** Sévérités réelles des motifs de qualification (`QualificationReasonSeverity`). */
export const QUALIFICATION_SEVERITY_LABELS: Record<QualificationReasonSeverity, string> = {
  BLOCK: 'Bloquant',
  REVIEW: 'Revue',
  INFO: 'Information',
};

/** Correspondance des catégories réelles des motifs de qualification. */
export const QUALIFICATION_CATEGORY_LABELS: Record<string, string> = {
  SERVICE_NATURE: 'Nature du service',
  AUTONOMY: 'Autonomie',
  SUBORDINATION: 'Subordination',
  TIME_AND_PLACE: 'Temps et lieu',
  FORMALITIES: 'Formalités',
  INFORMATION: 'Information',
};

/** Affichage d'une date courte (jour/mois/année) — affichage seul, jamais un calcul. */
export function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** Date et heure (horodatage Mono des fiches). */
export function formatDateTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Masquage d'un e-mail réel pour l'affichage (règle de la fiche : partiellement
 * masqué). La donnée affichée reste la donnée réelle du DTO serveur, masquée.
 */
export function maskEmail(email: string | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/* ── P4B-1 · supervision des contrats ─────────────────────────────────────
 * Les statuts affichés sont les valeurs RÉELLES du domaine (`ContractStatus`,
 * src/types/index.ts ; contrainte SQL `contracts_status_domain`). Aucun code
 * n'est renommé : seuls les libellés officiels, déjà en usage côté EMPLOYER et
 * CANDIDATE, sont repris tels quels pour l'interface ADMIN.
 */

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING_EMPLOYER: 'En attente employeur',
  PENDING_EMPLOYEE: 'En attente candidat',
  SIGNATURE: 'En signature',
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  INCIDENT: 'Claim en cours',
  TERMINATED: 'Résilié',
  COMPLETED: 'Terminé',
  REPLACED: 'Remplacé',
};

/** Teintes visuelles des sceaux (aucun statut n'est porté par la couleur seule). */
export const CONTRACT_STATUS_TONES: Record<ContractStatus, 'gold' | 'emerald' | 'amber' | 'clay' | 'violet' | 'cyan' | 'slate'> = {
  DRAFT: 'slate',
  PENDING_EMPLOYER: 'amber',
  PENDING_EMPLOYEE: 'amber',
  SIGNATURE: 'violet',
  ACTIVE: 'emerald',
  SUSPENDED: 'amber',
  INCIDENT: 'clay',
  TERMINATED: 'slate',
  COMPLETED: 'gold',
  REPLACED: 'cyan',
};

/**
 * Segments du registre (fiche ADM-13) : chaque segment est une sélection sur
 * des statuts RÉELS de `ContractStatus`. « En signature » groupe les trois
 * statuts réels d'attente de signature ; jamais un statut inventé.
 */
export const CONTRACT_REGISTRY_SEGMENTS: readonly { id: string; label: string; statuses: readonly ContractStatus[] }[] = [
  { id: 'all', label: 'Tous', statuses: [] },
  { id: 'signature', label: 'En signature', statuses: ['SIGNATURE', 'PENDING_EMPLOYER', 'PENDING_EMPLOYEE'] },
  { id: 'active', label: 'Actifs', statuses: ['ACTIVE'] },
  { id: 'incident', label: 'En incident', statuses: ['INCIDENT', 'SUSPENDED'] },
  { id: 'completed', label: 'Terminés', statuses: ['COMPLETED'] },
  { id: 'terminated', label: 'Résiliés', statuses: ['TERMINATED'] },
  { id: 'replaced', label: 'Remplacés', statuses: ['REPLACED'] },
];

/**
 * Types et statuts RÉELS des Claims (`src/backend/disputes/records.ts`,
 * CLAIM_TYPE_VALUES / CLAIM_STATUS_VALUES — parité vérifiée par test). Le
 * produit nomme cet objet CLAIM ; le Master Design le nomme « Litige » : le
 * libellé produit est conservé (règle de vocabulaire absolue).
 */
export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  SALARY_NOT_RECEIVED: 'Salaire non reçu',
  PAYMENT_DISPUTE: 'Contestation de paiement',
  CONTRACT_INCIDENT: 'Incident de contrat',
  OTHER_REVIEW_REQUIRED: 'Autre revue requise',
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  OPEN: 'Ouvert',
  EVIDENCE_REQUESTED: 'Justificatif demandé',
  UNDER_REVIEW: 'En revue',
  ADMIN_REVIEW: 'Revue ADMIN',
  RESOLVED: 'Résolu',
  REJECTED: 'Rejeté',
  CLOSED: 'Clôturé',
};

/** Sceaux des Claims : teintes visuelles, le code serveur reste affiché à côté. */
export const CLAIM_STATUS_TONES: Record<ClaimStatus, 'emerald' | 'amber' | 'clay' | 'violet' | 'slate'> = {
  OPEN: 'amber',
  EVIDENCE_REQUESTED: 'violet',
  UNDER_REVIEW: 'violet',
  ADMIN_REVIEW: 'clay',
  RESOLVED: 'emerald',
  REJECTED: 'slate',
  CLOSED: 'slate',
};

/** Justificatifs réellement acceptés par le backend Claim. */
export const CLAIM_EVIDENCE_TYPE_LABELS: Record<ClaimEvidenceType, string> = {
  PAYMENT_PROOF: 'Justificatif de paiement',
  CONTRACT_EVIDENCE: 'Justificatif lié au contrat',
  SUPPORTING_EVIDENCE: 'Justificatif complémentaire',
};

export const CLAIM_EVIDENCE_STATUS_LABELS: Record<ClaimEvidenceStatus, string> = {
  PENDING: 'En attente',
  SUBMITTED: 'Transmis',
  CANCELLED: 'Annulé',
  EXPIRED: 'Échu',
};

export const CLAIM_EVIDENCE_STATUS_TONES: Record<ClaimEvidenceStatus, 'emerald' | 'amber' | 'clay' | 'slate'> = {
  PENDING: 'amber',
  SUBMITTED: 'emerald',
  CANCELLED: 'slate',
  EXPIRED: 'clay',
};

/** Options réellement choisies dans cette tranche (la décision REPLACE reste hors scope). */
export const ADMIN_CLAIM_DECISION_OPTIONS = ['RESOLVE', 'REJECT'] as const;
export const CLAIM_DECISION_LABELS: Record<(typeof ADMIN_CLAIM_DECISION_OPTIONS)[number], string> = {
  RESOLVE: 'Résoudre le Claim',
  REJECT: 'Rejeter le Claim',
};

/* ── P4B-2 · Paiement, échéance, déclaration et rapprochement ──────────── */

/** Statuts strictement identiques au domaine Payment (`PAYMENT_LIFECYCLE_STATUS_VALUES`). */
export const PAYMENT_STATUS_LABELS: Record<PaymentLifecycleStatus, string> = {
  SCHEDULED: 'Échéance prévue',
  DUE: 'Échéance due',
  PENDING_VERIFICATION: 'En attente de vérification',
  VERIFIED: 'Vérifié — non payé',
  PAID: 'Payé (état du cycle)',
  REJECTED: 'Déclaration rejetée',
};

export const PAYMENT_STATUS_TONES: Record<PaymentLifecycleStatus, 'slate' | 'amber' | 'violet' | 'emerald' | 'clay' | 'gold'> = {
  SCHEDULED: 'slate',
  DUE: 'amber',
  PENDING_VERIFICATION: 'violet',
  VERIFIED: 'emerald',
  PAID: 'gold',
  REJECTED: 'clay',
};

/** Nature réelle et destination distincte, telles que renvoyées par le serveur. */
export const PAYMENT_TYPE_LABELS: Record<PaymentType, { label: string; detail: string }> = {
  SALARY: {
    label: 'Salaire',
    detail: 'Paiement externe de l’Employeur au Candidat ; LE LABEUR ne reçoit ni ne détient le Salaire.',
  },
  PLATFORM_FEE: {
    label: 'Frais dus à LE LABEUR',
    detail: 'Paiement distinct dû à LE LABEUR par l’Employeur ; il ne s’agit pas du Salaire.',
  },
};

export type PaymentDeclarationOutcome = PaymentDeclarationRecord['outcome'];

export const PAYMENT_DECLARATION_OUTCOME_LABELS: Record<PaymentDeclarationOutcome, string> = {
  PENDING: 'Déclaration en attente de vérification',
  VERIFIED: 'Déclaration vérifiée',
  REJECTED: 'Déclaration rejetée',
};

export const PAYMENT_RECONCILIATION_VERDICT_LABELS: Record<PaymentReconciliationVerdict, string> = {
  MATCH: 'Correspondance',
  MISMATCH: 'Discordance',
  NOT_FOUND: 'Élément absent',
  DUPLICATE: 'Doublon',
  REVIEW_REQUIRED: 'Examen requis',
};

export const PAYMENT_RECONCILIATION_BATCH_STATUS_LABELS: Record<PaymentReconciliationBatchStatus, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  COMPLETED: 'Terminé',
  PARTIAL: 'Partiel',
  FAILED: 'Échec',
};

export const PAYMENT_RECONCILIATION_ITEM_STATUS_LABELS: Record<PaymentReconciliationItemStatus, string> = {
  PENDING: 'En attente',
  PROCESSING: 'En cours',
  RETRYABLE: 'Reprise possible',
  MATCH: 'Correspondance',
  MISMATCH: 'Discordance',
  NOT_FOUND: 'Élément absent',
  DUPLICATE: 'Doublon',
  REVIEW_REQUIRED: 'Examen requis',
  FAILED: 'Échec',
};

export const PAYMENT_RECONCILIATION_REVIEW_DECISION_LABELS: Record<PaymentReconciliationReviewDecision, string> = {
  OPEN: 'Ouverte',
  CONFIRMED: 'Confirmée par revue ADMIN',
  REJECTED: 'Rejetée par revue ADMIN',
};

export const PAYMENT_RECONCILIATION_FIELD_LABELS: Record<string, string> = {
  provider: 'Fournisseur',
  externalTransactionId: 'Référence de transaction externe',
  reference: 'Référence',
  amount: 'Montant transmis',
  currency: 'Devise transmise',
  payer: 'Émetteur externe',
  recipient: 'Destinataire externe',
  date: 'Date comparée',
};

/** État d'une échéance fourni par le serveur ; aucune date n'est comparée dans le navigateur. */
export function paymentDueLabel(due: boolean | undefined): string {
  if (due === true) return 'Échéance atteinte selon le serveur';
  if (due === false) return 'Échéance non atteinte selon le serveur';
  return 'État d’échéance absent';
}

/**
 * Affichage du montant unitaire transmis par Payment. Aucune conversion,
 * somme, différence, pourcentage ni autre règle financière n'est appliquée.
 */
export function formatPaymentAmount(value: number, currency: string): string {
  if (!Number.isFinite(value)) return '—';
  // Le DTO montant est numérique : String préserve sa représentation, sans
  // arrondi dépendant des décimales configurées pour une devise.
  const amount = String(value);
  return currency ? `${amount} ${currency}` : amount;
}

/** Réponse réellement stockée sur un jalon d'exécution (oui/non/absent) — affichage seul. */
export function formatYesNo(value: 'YES' | 'NO' | undefined): string {
  if (value === 'YES') return 'Oui';
  if (value === 'NO') return 'Non';
  return '—';
}

export function formatBoolean(value: boolean | undefined): string {
  if (value === true) return 'Oui';
  if (value === false) return 'Non';
  return '—';
}

/**
 * Affichage d'un montant RÉEL du DTO `Contract` (valeur et devise telles que
 * produites par le serveur). Aucune conversion, aucun calcul, aucun agrégat :
 * le modèle financier (et ses écrans) reste hors de cette tranche.
 */
export function formatContractAmount(value: number, currency: string): string {
  if (!Number.isFinite(value)) return '—';
  if (!currency) return new Intl.NumberFormat('fr-FR').format(value);
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${new Intl.NumberFormat('fr-FR').format(value)} ${currency}`;
  }
}

export const ADMIN_UI_TERMS = {
  USER_REGISTRY: 'Utilisateurs',
  USER_SHEET: 'Fiche utilisateur',
  BLOCK_GESTURE: 'Blocage de compte',
  BLOCK_JOURNAL: 'Journal des blocages',
  QUALIFICATION_QUEUE: `${PRODUCT_LABELS.QUALIFICATION.plural} en revue`,
  QUALIFICATION_REVIEW: 'Revue humaine',
  QUALIFICATION_DECISION: 'Décision de revue',
  QUALIFICATION_HISTORY: 'Historique des qualifications',
  MATCHING_RUNS: `Runs de ${PRODUCT_LABELS.MATCHING.singular.toLowerCase()}`,
  MATCHING_AUDIT: 'Audit de run',
  MATCHING_RULES: 'Règles existantes',
  CONTRACT_REGISTRY: PRODUCT_LABELS.CONTRACT.plural,
  CONTRACT_SHEET: `Fiche ${PRODUCT_LABELS.CONTRACT.singular.toLowerCase()}`,
  CONTRACT_INCIDENTS: PRODUCT_LABELS.CLAIM.plural,
  CONTRACT_JOURNAL: `Historique du ${PRODUCT_LABELS.CONTRACT.singular.toLowerCase()}`,
  CONTRACT_FORCED_REVISION: 'Révision forcée',
  PAYMENT_REGISTRY: PRODUCT_LABELS.PAYMENT.plural,
  PAYMENT_RECONCILIATION: 'Rapprochement des paiements',
  PAYMENT_ANOMALIES: 'Anomalies de paiement',
  EXTERNAL_PAYMENT_DECLARATIONS: 'Déclarations de paiement externe',
  PAYMENT_INCIDENT: 'Incident de paiement',
  SALARY_CONFIRMATION_QUEUE: 'Confirmations de Salaire',
  SALARY_PROOF_REVIEW: 'Preuve de réception du Salaire',
  CLAIM_REGISTRY: PRODUCT_LABELS.CLAIM.plural,
  CLAIM_SHEET: `Fiche ${PRODUCT_LABELS.CLAIM.singular}`,
  CLAIM_EVIDENCE: `Justificatifs du ${PRODUCT_LABELS.CLAIM.singular.toLowerCase()}`,
  CLAIM_DECISION: `Décision ADMIN du ${PRODUCT_LABELS.CLAIM.singular.toLowerCase()}`,
  CLAIM_DECISION_HISTORY: `Décisions des ${PRODUCT_LABELS.CLAIM.plural.toLowerCase()}`,
  REPLACEMENT_REGISTRY: PRODUCT_LABELS.REPLACEMENT.plural,
  REPLACEMENT_SHEET: `Dossier de ${PRODUCT_LABELS.REPLACEMENT.singular}`,
  REPLACEMENT_ARBITRATION: `Arbitrage du ${PRODUCT_LABELS.REPLACEMENT.singular}`,
  REPUTATION_LEDGER: `Ledger de ${PRODUCT_LABELS.REPUTATION.singular.toLowerCase()}`,
  REPUTATION_CONTESTS: `Recours sur une entrée de ${PRODUCT_LABELS.REPUTATION.singular.toLowerCase()}`,
  REPUTATION_AUDIT: `Audit d’intégrité de ${PRODUCT_LABELS.REPUTATION.singular.toLowerCase()}`,
  DOCUMENT_REGISTRY: `Registre des ${PRODUCT_LABELS.DOCUMENT.plural}`,
  DOCUMENT_SHEET: `Fiche ${PRODUCT_LABELS.DOCUMENT.singular.toLowerCase()}`,
  DOCUMENT_VERIFICATION: `Vérification du ${PRODUCT_LABELS.DOCUMENT.singular}`,
  DOCUMENT_QUARANTINE: `Quarantaine des ${PRODUCT_LABELS.DOCUMENT.plural}`,
  DOCUMENT_AUDIT: `Audit et rétention des ${PRODUCT_LABELS.DOCUMENT.plural}`,
  NOTIFICATION_ORCHESTRATION: 'Orchestration des notifications',
  NOTIFICATION_TEMPLATES: 'Gabarits de notifications',
  NOTIFICATION_DELIVERABILITY: 'Délivrabilité des notifications',
} as const;

/**
 * P4F-2 — types et états réellement déclarés par le modèle AppNotification.
 * Les textes de titre et de message viennent du serveur ; cette table ne fait
 * que donner un libellé LE LABEUR aux types déjà autorisés par le contrat.
 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  NEW_APPLICATION: 'Nouvelle Candidature',
  APPLICATION_SHORTLISTED: 'Candidature sélectionnée',
  APPLICATION_REJECTED: 'Mise à jour de Candidature',
  APPLICATION_WITHDRAWN: 'Candidature retirée',
  NEW_MESSAGE: 'Nouveau message',
  VOICE_MESSAGE: 'Message vocal',
  INCOMING_CALL: 'Invitation à un appel',
  MISSED_CALL: 'Appel manqué',
  PROPOSAL_RECEIVED: 'Nouvelle Proposition',
  PROPOSAL_ACCEPTED: 'Proposition acceptée',
  PROPOSAL_DECLINED: 'Proposition déclinée',
  PROPOSAL_REVISION_REQUESTED: 'Révision de Proposition demandée',
  CONTRACT_PENDING_SIGNATURE: 'Contrat à signer',
  CONTRACT_SIGNED: 'Contrat signé',
  CONTRACT_ACTIVE: 'Contrat actif',
  MISSION_START_REQUIRED: 'Démarrage requis',
  MISSION_CONFIRMED: 'Démarrage confirmé',
  MISSION_DIVERGENCE: 'Divergence de démarrage',
  MONTHLY_CHECKPOINT: 'Échéance de Salaire',
  SALARY_DECLARED: 'Déclaration de Salaire',
  SALARY_CONFIRMED: 'Salaire confirmé',
  SALARY_CONTESTED: 'Salaire contesté',
  COMMISSION_DUE: 'Échéance de commission LE LABEUR',
  COMMISSION_DECLARED: 'Déclaration de commission LE LABEUR',
  COMMISSION_VERIFIED: 'Commission LE LABEUR vérifiée',
  COMMISSION_REJECTED: 'Commission LE LABEUR à régulariser',
  PAYMENT_OVERDUE_J3: 'Régularisation requise à J+3',
  ACCOUNT_BLOCKED: 'Compte bloqué',
  ACCOUNT_UNBLOCKED: 'Compte débloqué',
  INCIDENT_REPORTED: 'Claim signalé',
  INCIDENT_DECIDED: 'Décision du Claim',
  REPLACEMENT_INITIATED: 'Remplacement initié',
  URGENT_JOB_PUBLISHED: 'Offre urgente publiée',
  CANDIDATE_TRANSFERRED: 'Candidat transféré',
};

export const NOTIFICATION_READ_STATE_LABELS = {
  READ: 'Lue',
  UNREAD: 'Non lue',
} as const;

export const NOTIFICATION_READ_STATE_TONES = {
  READ: 'slate',
  UNREAD: 'amber',
} as const;

export const NOTIFICATION_CHANNEL_STATUS_LABELS = {
  NOT_AVAILABLE: 'Non disponible',
  SKIPPED: 'Non ciblé',
  DELIVERED: 'Livré',
  FAILED: 'Échec',
} as const;

export const NOTIFICATION_CHANNEL_STATUS_TONES = {
  NOT_AVAILABLE: 'slate',
  SKIPPED: 'amber',
  DELIVERED: 'emerald',
  FAILED: 'clay',
} as const;

/* ── P4E-2 · ledger de réputation ─────────────────────────────────────────
 * Statuts, directions, catégories, provenances et types d'entité source
 * RÉELS (`src/domain/reputationRules.ts`). Les codes serveur restent
 * affichés. Aucune note 0-100 : l'impact est l'entier stocké sur l'entrée.
 * La catégorie DISPUTE_OUTCOME désigne l'issue d'un Claim (jamais « litige »).
 * MISSION_EXECUTION est le code serveur : le libellé affiché parle du Contrat.
 */

export const REPUTATION_STATUS_LABELS: Record<ReputationStatus, string> = {
  ACTIVE: 'Active',
  REVERSED: 'Révoquée',
};

export const REPUTATION_STATUS_TONES: Record<ReputationStatus, 'emerald' | 'slate'> = {
  ACTIVE: 'emerald',
  REVERSED: 'slate',
};

export const REPUTATION_DIRECTION_LABELS: Record<ReputationDirection, string> = {
  POSITIVE: 'Positive',
  NEGATIVE: 'Négative',
  NEUTRAL: 'Neutre',
};

export const REPUTATION_DIRECTION_TONES: Record<ReputationDirection, 'emerald' | 'clay' | 'slate'> = {
  POSITIVE: 'emerald',
  NEGATIVE: 'clay',
  NEUTRAL: 'slate',
};

export const REPUTATION_CATEGORY_LABELS: Record<ReputationCategory, string> = {
  MISSION_EXECUTION: 'Exécution de Contrat',
  PAYMENT_RELIABILITY: 'Fiabilité de paiement',
  DISPUTE_OUTCOME: 'Issue de Claim',
};

export const REPUTATION_PROVENANCE_LABELS: Record<ReputationProvenance, string> = {
  EVENT: 'Fait documenté',
  RECONCILIATION: 'Réconciliation',
  ADMIN_DECISION: 'Décision ADMIN',
};

export const REPUTATION_SOURCE_ENTITY_LABELS: Record<ReputationSourceEntityType, string> = {
  CONTRACT: PRODUCT_LABELS.CONTRACT.singular,
  CLAIM: PRODUCT_LABELS.CLAIM.singular,
  PAYMENT: PRODUCT_LABELS.PAYMENT.singular,
  REPLACEMENT: PRODUCT_LABELS.REPLACEMENT.singular,
  ACCOUNT: 'Compte',
};

export const REPUTATION_CORRECTION_ACTION_LABELS = {
  REVERSE: 'Révoquer l’entrée',
  RESTORE: 'Rétablir l’entrée',
} as const;

/* ── P4E-1 · workflow de Remplacement (lecture seule) ─────────────────────
 * Statuts RÉELS du dossier (`REPLACEMENT_STATUS_VALUES`,
 * src/backend/replacements/records.ts ; parité vérifiée par test). Les codes
 * restent ceux du serveur — y compris le nom historique
 * TRANSFERRED_TO_EMPLOYER, posé par `acceptProposal` lorsque le Candidat a
 * accepté la Proposition — et sont affichés à côté de chaque libellé.
 * CONTRACT_FINALIZED signifie qu'un Contrat successeur DISTINCT a été créé et
 * lié (brouillon au départ) : ce n'est jamais un Contrat actif.
 */

export type ReplacementStatus = ReplacementDossier['status'];

export const REPLACEMENT_STATUS_LABELS: Record<ReplacementStatus, string> = {
  PENDING_OFFER: 'Offre de remplacement à publier',
  SOURCING_CANDIDATES: 'Offre publiée — Candidatures ouvertes',
  CANDIDATE_SELECTED: 'Candidat sélectionné',
  TRANSFERRED_TO_EMPLOYER: 'Proposition acceptée par le Candidat',
  CONTRACT_FINALIZED: 'Contrat successeur créé',
};

export const REPLACEMENT_STATUS_TONES: Record<ReplacementStatus, 'amber' | 'violet' | 'gold' | 'cyan'> = {
  PENDING_OFFER: 'amber',
  SOURCING_CANDIDATES: 'violet',
  CANDIDATE_SELECTED: 'violet',
  TRANSFERRED_TO_EMPLOYER: 'gold',
  CONTRACT_FINALIZED: 'cyan',
};

/**
 * Acteur de l'étape suivante, tel que FIXÉ par les handlers existants (aucune
 * commande ADMIN n'existe dans le workflow une fois le dossier ouvert) :
 *  - PENDING_OFFER : `replacements.offer.create` (rôle EMPLOYER, propriétaire) ;
 *  - SOURCING_CANDIDATES : Candidature du Candidat, sélection SHORTLIST par
 *    l'Employeur (`selectApplication`, atomique) ;
 *  - CANDIDATE_SELECTED : Proposition émise par l'Employeur, puis réponse
 *    explicite du Candidat (ACCEPT / DECLINE / EXPIRE) ;
 *  - TRANSFERRED_TO_EMPLOYER : création du Contrat successeur par l'Employeur ;
 *  - CONTRACT_FINALIZED : signatures et activation par le cycle normal du Contrat.
 */
export const REPLACEMENT_NEXT_STEP: Record<ReplacementStatus, string> = {
  PENDING_OFFER: 'L’Employeur propriétaire publie l’Offre de remplacement.',
  SOURCING_CANDIDATES: 'Les Candidats postulent à l’Offre ; l’Employeur sélectionne une Candidature.',
  CANDIDATE_SELECTED: 'L’Employeur émet la Proposition ; le Candidat y répond explicitement.',
  TRANSFERRED_TO_EMPLOYER: 'L’Employeur crée le Contrat successeur depuis la Proposition acceptée.',
  CONTRACT_FINALIZED: 'Le Contrat successeur suit son cycle normal : signatures puis activation.',
};

/** Statuts réels de Proposition (`PROPOSAL_STATUS_VALUES`) ; envoyée ≠ acceptée. */
export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée — réponse du Candidat attendue',
  REVISION_REQUESTED: 'Révision demandée',
  ACCEPTED: 'Acceptée par le Candidat',
  DECLINED: 'Refusée par le Candidat',
  EXPIRED: 'Expirée',
};

export const PROPOSAL_STATUS_TONES: Record<ProposalStatus, 'slate' | 'violet' | 'amber' | 'emerald' | 'clay'> = {
  DRAFT: 'slate',
  SENT: 'violet',
  REVISION_REQUESTED: 'amber',
  ACCEPTED: 'emerald',
  DECLINED: 'clay',
  EXPIRED: 'slate',
};

/* ── P4F · documents (registre, audit, vérification, quarantaine) ─────────
 * Statuts, types, classes de conservation, types d'entité liée et finalités
 * RÉELS (`src/domain/documentRules.ts`, `src/backend/documents/documentRepository.ts`).
 * Les codes serveur restent affichés à côté des libellés.
 *
 * Écarts documentés (jamais affichés comme nouveaux concepts) :
 *   fiche « Pièce » / « pièce examinée » / « pièces » → produit DOCUMENT / « Document » ;
 *   fiche « mission » d'un justificatif → produit OFFRE / « Offre » (le code
 *     MISSION_JUSTIFICATION reste affiché tel quel, son libellé parle d'Offre) ;
 *   fiche « Vérifié / Validée / Rejetée / Complément demandé » → AUCUN statut
 *     produit : seule l'empreinte est recalculée (contrôle technique) ;
 *   fiche « quarantaine / isolée / levée / fraude confirmée » → AUCUN statut
 *     ni route serveur : BACKEND_GAP documenté (ADM-39) ;
 *   fiche « purge / politique / journal d'accès » → AUCUNE route ADMIN : durées
 *     PENDING_LEGAL_VALIDATION non modifiées, aucune purge proposée (ADM-40) ;
 *   fiche « visionneuse filigranée » → AUCUNE route ADMIN de contenu : aucun
 *     binaire n'est affiché ni téléchargé depuis l'ADMIN (ADM-38).
 */

export const DOCUMENT_STATUS_LABELS: Record<'ACTIVE' | 'REVOKED', string> = {
  ACTIVE: 'Actif',
  REVOKED: 'Révoqué',
};

export const DOCUMENT_STATUS_TONES: Record<'ACTIVE' | 'REVOKED', 'emerald' | 'clay'> = {
  ACTIVE: 'emerald',
  REVOKED: 'clay',
};

export const DOCUMENT_VERSION_STATUS_LABELS: Record<'PENDING_UPLOAD' | 'ACTIVE' | 'REVOKED', string> = {
  PENDING_UPLOAD: 'Contenu non enregistré',
  ACTIVE: 'Active',
  REVOKED: 'Révoquée',
};

export const DOCUMENT_VERSION_STATUS_TONES: Record<'PENDING_UPLOAD' | 'ACTIVE' | 'REVOKED', 'amber' | 'emerald' | 'clay'> = {
  PENDING_UPLOAD: 'amber',
  ACTIVE: 'emerald',
  REVOKED: 'clay',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CONTRACT_DOCUMENT: 'Document contractuel',
  ACCEPTANCE_PROOF: 'Preuve d’acceptation',
  MISSION_JUSTIFICATION: 'Justificatif d’Offre',
  EXECUTION_PROOF: 'Preuve d’exécution',
  WORKFLOW_SUPPORT: 'Support de workflow',
  TRACEABILITY_ATTESTATION: 'Attestation de traçabilité',
  VERIFICATION_DOCUMENT: 'Document de vérification',
  TEMPORARY: 'Document temporaire',
};

export const DOCUMENT_RETENTION_CLASS_LABELS: Record<RetentionClass, string> = {
  CONTRACTUAL: 'Contractuelle',
  TRACEABILITY: 'Traçabilité',
  MISSION: 'Liée à l’Offre',
  VERIFICATION: 'Vérification',
  TEMPORARY: 'Temporaire',
};

export const DOCUMENT_ENTITY_LABELS: Record<DocumentEntityType, string> = {
  CONTRACT: 'Contrat',
  PROPOSAL: 'Proposition',
  CLAIM: 'Claim',
  REPLACEMENT: 'Remplacement',
  PAYMENT: 'Paiement',
  SALARY_CONFIRMATION: 'Confirmation de Salaire',
  USER: 'Compte utilisateur',
};

export const DOCUMENT_LINK_PURPOSE_LABELS: Record<DocumentLinkPurpose, string> = {
  CONTRACT_VERSION: 'Version de Contrat',
  ACCEPTANCE_PROOF: 'Preuve d’acceptation',
  EXECUTION_PROOF: 'Preuve d’exécution',
  JUSTIFICATION: 'Justificatif',
  EVIDENCE: 'Élément probant',
  ATTESTATION: 'Attestation',
  VERIFICATION: 'Vérification',
  SUPPORTING: 'Appui',
};
