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

import type { UserRole } from '../types';
import type { ServerUserRecord } from '../backend/identity/stores';
import type { QualificationDecision, QualificationReasonSeverity } from '../backend/matching/records';

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
} as const;
