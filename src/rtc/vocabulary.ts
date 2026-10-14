/**
 * RTC —— VOCABULAIRE LE LABEUR (source de vérité des textes affichés).
 *
 * Règle absolue de la tranche RTC-1 : les fiches du Master Design nomment
 * parfois autrement des objets qui EXISTENT déjà dans LE LABEUR. La structure
 * visuelle des fiches est reprise ; les noms affichés restent ceux du produit.
 * Aucun objet, aucune route, aucun statut, aucun type, aucun endpoint et aucun
 * identifiant métier n'est renommé.
 *
 * Correspondance (documentée, jamais affichée telle quelle) :
 *   fiche « Appel » / « Session » → produit WEBRTC SESSION / « Session »
 *     (projection `WebRtcSessionView` : sessionId, entityType CONTRACT,
 *     entityId, initiatorId, participants, status, createdAt, expiresAt,
 *     closedAt — statuts réels CREATED / CONNECTING / ACTIVE / CLOSED /
 *     EXPIRED / FAILED, jamais renommés ; les statuts legacy CALLING /
 *     RINGING / CONNECTED / ENDED / MISSED du type `CallRecord` ne sont pas
 *     affichés car aucun handler ne les produit)
 *   fiche « mission liée (réf Mono) » → produit CONTRACT / « Contrat »
 *     (entityType vaut toujours CONTRACT ; entityId est la référence du
 *     Contrat, jamais recopiée ni réinterprétée)
 *   fiche « interlocuteur » / « Appelant » → produit : Employeur ou Candidat
 *     (rôles réels EMPLOYER / CANDIDATE portés par les participants de la
 *     Session ; aucun nom, aucune photo, aucun score de fiabilité : ces
 *     attributs n'existent dans aucune projection de Session)
 *   fiche « Client »       → produit EMPLOYER / « Employeur »
 *   fiche « Prestataire »  → produit CANDIDATE / « Candidat »
 *   fiche « Enregistrement » / « consentement » → AUCUN objet produit :
 *     aucune route serveur ne porte un consentement d'enregistrement ni un
 *     enregistrement (BACKEND_GAP documenté, jamais un état inventé)
 *   fiche « Diagnostic réseau » (latence, perte, gigue, MOS, qualité) →
 *     AUCUNE mesure produit : la seule donnée réelle est l'état de la
 *     configuration ICE (AVAILABLE / NOT_CONFIGURED /
 *     BLOCKED_EXTERNAL_ACCESS) ; aucune adresse de serveur, aucun identifiant
 *     et aucun secret ne sont affichés (§3.6)
 *
 * Les libellés d'état ci-dessous traduisent à l'écran des valeurs de statut
 * RÉELLES du modèle (jamais des valeurs inventées) ; les identifiants de code
 * restent ceux du produit (`CREATED`, `CONNECTING`, `ACTIVE`…).
 */

import type {
  WebRtcIceConfigurationState,
  WebRtcParticipantRole,
  WebRtcSessionStatus,
} from '../backend/productionContracts';

/** Objets métier canoniques du produit (noms de code stables, jamais traduits en UI). */
export const PRODUCT_OBJECTS = {
  SESSION: 'WEBRTC_SESSION',
  CONTRACT: 'CONTRACT',
  EMPLOYER: 'EMPLOYER',
  CANDIDATE: 'CANDIDATE',
} as const;

export type ProductObject = (typeof PRODUCT_OBJECTS)[keyof typeof PRODUCT_OBJECTS];

/** Libellés produit affichables (un seul mot par objet, jamais un synonyme de fiche). */
export const PRODUCT_LABELS: Record<ProductObject, { singular: string; plural: string }> = {
  WEBRTC_SESSION: { singular: 'Session', plural: 'Sessions' },
  CONTRACT: { singular: 'Contrat', plural: 'Contrats' },
  EMPLOYER: { singular: 'Employeur', plural: 'Employeurs' },
  CANDIDATE: { singular: 'Candidat', plural: 'Candidats' },
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
  'Appelant',
  'Interlocuteur',
] as const;

/** Titres d'écrans (vocabulaire produit uniquement). */
export const RTC_UI_TERMS = {
  PREPARATION: 'Préparation de la Session',
  DIAGNOSTIC: 'Diagnostic réseau de la Session',
  INVITATION: 'Invitation à la Session',
  CONNECTION: 'Connexion à la Session',
  ACTIVE: 'Session en cours',
  SUMMARY: 'Fin de Session & résumé',
  HISTORY: 'Sessions',
  CONSENT: 'Consentement d’enregistrement',
} as const;

/** Statuts réels d'une Session WebRTC (`WebRtcSessionStatus`), traduits pour l'écran. */
export const SESSION_STATUS_LABELS: Record<WebRtcSessionStatus, string> = {
  CREATED: 'Créée',
  CONNECTING: 'Connexion en cours',
  ACTIVE: 'Active',
  CLOSED: 'Terminée',
  EXPIRED: 'Expirée',
  FAILED: 'Échouée',
};

export function sessionStatusLabel(status: WebRtcSessionStatus): string {
  return SESSION_STATUS_LABELS[status];
}

/** Rôles réels des participants d'une Session. */
export const PARTICIPANT_ROLE_LABELS: Record<WebRtcParticipantRole, string> = {
  EMPLOYER: PRODUCT_LABELS.EMPLOYER.singular,
  CANDIDATE: PRODUCT_LABELS.CANDIDATE.singular,
};

export function participantRoleLabel(role: WebRtcParticipantRole): string {
  return PARTICIPANT_ROLE_LABELS[role];
}

/**
 * États réels de la configuration ICE. Seul l'état est affichable : les
 * adresses de serveurs, identifiants et secrets ne sont jamais rendus.
 */
export const ICE_STATE_LABELS: Record<WebRtcIceConfigurationState, string> = {
  AVAILABLE: 'Relais configuré',
  NOT_CONFIGURED: 'Relais non configuré',
  BLOCKED_EXTERNAL_ACCESS: 'Relais inaccessible',
};

export function iceStateLabel(state: WebRtcIceConfigurationState): string {
  return ICE_STATE_LABELS[state];
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

/**
 * Durée réelle entre deux horodatages ISO (création → clôture d'une Session).
 * Affichage seul : minutes et secondes, jamais une durée promise ou simulée.
 */
export function formatDuration(fromIso: string | undefined, toIso: string | undefined): string | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  const totalSeconds = Math.floor((to - from) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} s`;
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}

/**
 * Rôle d'affichage d'un participant : le rôle réel porté par la Session
 * (EMPLOYER / CANDIDATE), jamais un nom ni un score inventé.
 */
export function participantDisplayRole(role: WebRtcParticipantRole, isInitiator: boolean): string {
  const base = participantRoleLabel(role);
  return isInitiator ? `${base} · initiateur` : base;
}
