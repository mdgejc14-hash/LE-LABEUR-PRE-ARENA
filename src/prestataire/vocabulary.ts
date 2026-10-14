/**
 * PRE —— VOCABULAIRE LE LABEUR (source de vérité des textes affichés).
 *
 * Règle absolue de la tranche P3-DESIGN-PRESTATAIRE : les fiches du Master Design
 * nomment parfois autrement des objets qui EXISTENT déjà dans LE LABEUR. La
 * structure visuelle des fiches est reprise ; les noms affichés restent ceux du
 * produit. Aucun objet, aucune route, aucun statut, aucun type, aucun endpoint
 * et aucun identifiant métier n'est renommé.
 *
 * Correspondance (documentée, jamais affichée telle quelle) :
 *   fiche « Mission »      → produit OFFER / « Offre »
 *   fiche « Client »       → produit EMPLOYER / « Employeur »
 *   fiche « Prestataire »  → produit CANDIDATE / « Candidat »
 *   fiche « Candidature »  → produit APPLICATION / « Candidature »
 *   fiche « Proposition »  → produit PROPOSAL / « Proposition »
 *   fiche « Contrat »      → produit CONTRACT / « Contrat »
 *   fiche « Litige »       → produit CLAIM / « Claim »
 *   fiche « Paiement »     → produit PAYMENT / « Paiement »
 *   fiche « Salaire »      → produit SALARY / « Salaire » + SALARY CONFIRMATION
 *   fiche « Remplacement » → produit REPLACEMENT / « Remplacement »
 *   fiche « Matching »     → produit MATCHING / « Matching »
 *   fiche « Document »     → produit DOCUMENT / « Document »
 *   fiche « Réputation »   → produit REPUTATION / « Réputation »
 *
 * Les libellés d'état ci-dessous traduisent à l'écran des valeurs de statut
 * RÉELLES du modèle (jamais des valeurs inventées) ; les identifiants de code
 * restent ceux du produit (`ACTIVE`, `SHORTLISTED`, `PENDING_VERIFICATION`…).
 */

import type {
  ApplicationStatus,
  ContractStatus,
  ProposalStatus,
  SalaryPaymentStatus,
} from '../types';
import type { PaymentLifecycleStatus } from '../domain/paymentLifecycle';
import type { ClaimStatus, ClaimType } from '../backend/disputes/records';

/** Objets métier canoniques du produit (noms de code stables, jamais traduits en UI). */
export const PRODUCT_OBJECTS = {
  OFFER: 'OFFER',
  EMPLOYER: 'EMPLOYER',
  CANDIDATE: 'CANDIDATE',
  APPLICATION: 'APPLICATION',
  PROPOSAL: 'PROPOSAL',
  CONTRACT: 'CONTRACT',
  CLAIM: 'CLAIM',
  PAYMENT: 'PAYMENT',
  SALARY: 'SALARY',
  SALARY_CONFIRMATION: 'SALARY_CONFIRMATION',
  REPLACEMENT: 'REPLACEMENT',
  MATCHING: 'MATCHING',
  DOCUMENT: 'DOCUMENT',
  REPUTATION: 'REPUTATION',
} as const;

export type ProductObject = (typeof PRODUCT_OBJECTS)[keyof typeof PRODUCT_OBJECTS];

/** Libellés produit affichables (un seul mot par objet, jamais un synonyme de fiche). */
export const PRODUCT_LABELS: Record<ProductObject, { singular: string; plural: string }> = {
  OFFER: { singular: 'Offre', plural: 'Offres' },
  EMPLOYER: { singular: 'Employeur', plural: 'Employeurs' },
  CANDIDATE: { singular: 'Candidat', plural: 'Candidats' },
  APPLICATION: { singular: 'Candidature', plural: 'Candidatures' },
  PROPOSAL: { singular: 'Proposition', plural: 'Propositions' },
  CONTRACT: { singular: 'Contrat', plural: 'Contrats' },
  CLAIM: { singular: 'Claim', plural: 'Claims' },
  PAYMENT: { singular: 'Paiement', plural: 'Paiements' },
  SALARY: { singular: 'Salaire', plural: 'Salaires' },
  SALARY_CONFIRMATION: { singular: 'Confirmation de salaire', plural: 'Confirmations de salaire' },
  REPLACEMENT: { singular: 'Remplacement', plural: 'Remplacements' },
  MATCHING: { singular: 'Matching', plural: 'Matchings' },
  DOCUMENT: { singular: 'Document', plural: 'Documents' },
  REPUTATION: { singular: 'Réputation', plural: 'Réputations' },
};

/**
 * Termes de fiche qui NE DOIVENT PAS devenir des libellés métier de l'interface.
 * La garde-fou de `prestataire.test.tsx` refuse tout fichier de cette tranche
 * qui les afficherait (hors documentation, commentaires et mapping interne).
 */
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

export function offerStatusLabel(status: 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'PAUSED'): string {
  return {
    ACTIVE: 'Active',
    PAUSED: 'En pause',
    FILLED: 'Pourvue',
    CANCELLED: 'Annulée',
  }[status];
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: 'Reçue',
  REVIEW: 'En examen',
  SHORTLISTED: 'Présélectionnée',
  REJECTED: 'Écartée',
  WITHDRAWN: 'Retirée par le candidat',
  HIRED: 'Retenue',
  CONTRACTED: 'Sous contrat',
  CLOSED_OFFER_FILLED: 'Clôturée (offre pourvue)',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  REVISION_REQUESTED: 'Révision demandée',
  ACCEPTED: 'Acceptée',
  DECLINED: 'Déclinée',
  EXPIRED: 'Expirée',
};

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

export const PAYMENT_STATUS_LABELS: Record<PaymentLifecycleStatus, string> = {
  SCHEDULED: 'Programmé',
  DUE: 'Échu',
  PENDING_VERIFICATION: 'En vérification',
  VERIFIED: 'Vérifié',
  PAID: 'Payé',
  REJECTED: 'Rejeté',
};

export const SALARY_STATUS_LABELS: Record<SalaryPaymentStatus, string> = {
  SCHEDULED: 'Programmé',
  DUE: 'Échu',
  PENDING_VERIFICATION: 'En vérification',
  PAID: 'Payé',
  REJECTED: 'Rejeté',
  NOT_APPLICABLE: 'Sans objet',
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  OPEN: 'Ouvert',
  EVIDENCE_REQUESTED: 'Pièces demandées',
  UNDER_REVIEW: 'En examen',
  ADMIN_REVIEW: 'En revue de modération',
  RESOLVED: 'Résolu',
  REJECTED: 'Rejeté',
  CLOSED: 'Clos',
};

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  SALARY_NOT_RECEIVED: 'Salaire non reçu',
  PAYMENT_DISPUTE: 'Contestation de paiement',
  CONTRACT_INCIDENT: 'Incident de contrat',
  OTHER_REVIEW_REQUIRED: 'Autre revue requise',
};

export const REPLACEMENT_STATUS_LABELS: Record<
  'PENDING_OFFER' | 'SOURCING_CANDIDATES' | 'CANDIDATE_SELECTED' | 'TRANSFERRED_TO_EMPLOYER' | 'CONTRACT_FINALIZED',
  string
> = {
  PENDING_OFFER: 'Offre de remplacement à publier',
  SOURCING_CANDIDATES: 'Recherche de candidats',
  CANDIDATE_SELECTED: 'Candidat retenu',
  TRANSFERRED_TO_EMPLOYER: 'Dossier transféré',
  CONTRACT_FINALIZED: 'Contrat finalisé',
};

/**
 * Libellés d'affichage des types de documents RÉELS (DOCUMENT_TYPES,
 * src/domain/documentRules.ts). Affichage seul : les identifiants de code ne
 * sont jamais renommés, seulement traduits à l'écran comme les statuts.
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CONTRACT_DOCUMENT: 'Document contractuel',
  ACCEPTANCE_PROOF: 'Preuve d’acceptation',
  MISSION_JUSTIFICATION: 'Justificatif',
  EXECUTION_PROOF: 'Preuve d’exécution',
  WORKFLOW_SUPPORT: 'Pièce de support',
  TRACEABILITY_ATTESTATION: 'Attestation de traçabilité',
  VERIFICATION_DOCUMENT: 'Pièce de vérification',
  TEMPORARY: 'Document temporaire',
};

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

/** Libellés de navigation secondaires de l'espace PRE (mots du produit). */
export const PRESTATAIRE_DOCK_LABELS = {
  HOME: 'Accueil',
  OFFERS: 'Offres',
  APPLICATIONS: 'Candidatures',
  SALARY: 'Salaire',
  PROFILE: 'Profil',
} as const;

/**
 * Affichage d'un montant : formatage seul (séparateurs + devise), AUCUN calcul.
 * Le modèle financier n'est pas modifié par cette tranche. LE LABEUR ne détient
 * pas l'argent du travailleur : aucun écran n'affiche de solde ou de portefeuille.
 */
export function formatAmount(amount: number, currency: string): string {
  const value = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(amount);
  return `${value} ${currency}`;
}

/** Date courte (jour/mois/année) — affichage seul, jamais un calcul d'échéance. */
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

export const PRESTATAIRE_UI_TERMS = {
  OFFER_MARKET: `Marché des ${PRODUCT_LABELS.OFFER.plural.toLowerCase()}`,
  MY_APPLICATIONS: `Mes ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}`,
  MY_CONTRACTS: `Mes ${PRODUCT_LABELS.CONTRACT.plural.toLowerCase()}`,
  MY_SALARY: `Mon ${PRODUCT_LABELS.SALARY.singular.toLowerCase()}`,
  MY_DOCUMENTS: `Mes ${PRODUCT_LABELS.DOCUMENT.plural.toLowerCase()}`,
  MY_REPUTATION: `Ma ${PRODUCT_LABELS.REPUTATION.singular.toLowerCase()}`,
} as const;
