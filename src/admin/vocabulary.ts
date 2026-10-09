/**
 * ADM —— VOCABULAIRE LE LABEUR (source de vérité des textes affichés).
 *
 * Règle absolue de la tranche P4A-DESIGN-ADMIN-CORE : les fiches du Master
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
 *   fiche « Remplacement » → produit REPLACEMENT / « Remplacement »
 *   fiche « Matching »     → produit MATCHING / « Matching »
 *   fiche « Document »     → produit DOCUMENT / « Document »
 *   fiche « Qualification »→ produit QUALIFICATION / « Qualification » (moteur
 *                            réel `matching.qualification.*`, décisions
 *                            ELIGIBLE_FOR_INDEPENDENT / HUMAN_REVIEW_REQUIRED / BLOCKED)
 *   fiche « Utilisateur »  → compte produit (rôles EMPLOYER / CANDIDATE / ADMIN,
 *                            statuts ACTIVE / BLOCKED du modèle réel)
 *
 * Les libellés d'état ci-dessous traduisent à l'écran des valeurs de statut
 * RÉELLES du modèle (jamais des valeurs inventées) ; les identifiants de code
 * restent ceux du produit (`ACTIVE`, `BLOCKED`, `HUMAN_REVIEW_REQUIRED`…).
 */

import type { ContractStatus, UserRole } from '../types';
import type { ServerUserRecord } from '../backend/identity/stores';
import type { QualificationDecision, QualificationReasonSeverity } from '../backend/matching/records';
import type { ClaimStatus, ClaimType } from '../backend/disputes/records';

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
} as const;
