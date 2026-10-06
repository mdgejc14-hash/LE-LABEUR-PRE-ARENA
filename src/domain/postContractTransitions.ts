/**
 * LE LABEUR — P0-CONTRACT-POST — tranche POST-CONTRAT / WORK EXECUTION.
 *
 * Matrice RÉELLE de l'après-contrat, dérivée du code existant, sans aucun
 * statut inventé :
 *  - statuts        : `src/types/index.ts` (`ApplicationStatus`, `ContractStatus`,
 *                     `Offer['status']`) ;
 *  - cascade        : `MockRepository.signContract` — RÈGLE 21
 *                     (`src/repositories/mockRepository.ts`, ~lignes 1544-1555) :
 *                     contrat ACTIVE → offre `FILLED`, candidature retenue
 *                     `HIRED`, autres candidatures ouvertes `CLOSED_OFFER_FILLED` ;
 *  - chaînage       : `docs/statecharts.mmd` (`O_ACTIVE --> O_FILLED`,
 *                     `A_* --> A_HIRED`, `A_* --> A_CLOSED_OFFER_FILLED`) ;
 *  - contraintes SQL: `migrations/0003_core_nucleus_alignment.sql`
 *                     (`offers_status_domain`, `applications_status_domain`,
 *                     `contracts_status_domain`).
 *
 * Nomenclature conservée telle quelle :
 *
 *   OFFRE              ACTIVE → FILLED                      (cascade, RÈGLE 21)
 *   CANDIDATURE GAGNANTE (PENDING|REVIEW|SHORTLISTED) → HIRED → CONTRACTED
 *   AUTRES CANDIDATURES  (PENDING|REVIEW|SHORTLISTED) → CLOSED_OFFER_FILLED
 *   CONTRAT (exécution)  ACTIVE = travail en cours (aucun statut nouveau)
 *                        ACTIVE → COMPLETED   (P0-F, fin normale — conservé)
 *                        ACTIVE → TERMINATED  (P0-F, rupture M2+ — conservé ;
 *                                              équivalent réel d'un abandon,
 *                                              AUCUN statut ABANDONED créé)
 *                        REPLACED             (chemin incident/remplacement —
 *                                              conservé, non ouvert ici)
 *
 * `CONTRACTED` comble le « MANQUE » documenté par le dépôt lui-même
 * (`docs/statecharts.mmd` : « CONTRACTED déclaré mais jamais écrit » ;
 * `docs/ARCHITECTURE_REVERSE_ENGINEERING.md` § I-05 : « CONTRACTED jamais
 * atteint (le contrat référence la candidature sans transition dédiée) »).
 * Le statut EXISTE déjà (types + domaine SQL) : cette tranche n'ajoute que la
 * transition de sortie `HIRED → CONTRACTED`, sans inventer aucun état.
 *
 * Module PUR : aucune dépendance serveur, aucun accès base, aucun effet de bord.
 */

import type { ApplicationStatus, ContractStatus, Offer } from '../types';

export type PostContractOfferStatus = Offer['status'];

/* ------------------------------------------------------------------ */
/* Cascade d'embauche (RÈGLE 21 du modèle réel)                        */
/* ------------------------------------------------------------------ */

/** Seule source admise vers `FILLED` : l'offre doit être active. */
export const POST_CONTRACT_OFFER_FROM: readonly PostContractOfferStatus[] = ['ACTIVE'] as const;

/** Cible réelle de la cascade d'embauche (RÈGLE 21). */
export const POST_CONTRACT_OFFER_TO: PostContractOfferStatus = 'FILLED';

/**
 * Candidatures encore ouvertes à la cascade : exactement celles que le modèle
 * DEMO ferme (`['PENDING','REVIEW','SHORTLISTED']`, `signContract`).
 */
export const POST_CONTRACT_OPEN_APPLICATION_STATUSES = [
  'PENDING',
  'REVIEW',
  'SHORTLISTED',
] as const;

/** Candidature retenue : `HIRED` (RÈGLE 21), puis `CONTRACTED` (sortie documentée). */
export const POST_CONTRACT_WINNING_APPLICATION_TARGET: ApplicationStatus = 'HIRED';

/** Engagement réel confirmé sur contrat actif : `CONTRACTED` (statut existant). */
export const POST_CONTRACT_WINNING_APPLICATION_CONFIRMED: ApplicationStatus = 'CONTRACTED';

/** Autres candidatures : `CLOSED_OFFER_FILLED` (RÈGLE 21). */
export const POST_CONTRACT_OTHER_APPLICATION_TARGET: ApplicationStatus = 'CLOSED_OFFER_FILLED';

/**
 * Libellés d'historique RÉELS du modèle (`signContract`) : repris à l'identique
 * pour `HIRED` et `CLOSED_OFFER_FILLED`. Seul le libellé `CONTRACTED` est
 * nouveau — le statut, lui, existait déjà.
 */
export const POST_CONTRACT_WINNING_HIRED_HISTORY = 'Candidature retenue — contrat actif';
export const POST_CONTRACT_WINNING_CONTRACTED_HISTORY = 'Engagement contractualisé — contrat actif';
export const POST_CONTRACT_OTHER_CLOSED_HISTORY = 'Candidature clôturée — offre pourvue';

/** La cascade exige un engagement réel : un contrat `ACTIVE` (P0-F, conservé). */
export const POST_CONTRACT_REQUIRED_CONTRACT_STATUS: ContractStatus = 'ACTIVE';

export type PostContractOfferOutcome =
  | { readonly kind: 'APPLY'; readonly to: PostContractOfferStatus }
  /** Offre déjà pourvue : convergence sans écriture, jamais une erreur. */
  | { readonly kind: 'ALREADY_APPLIED'; readonly to: PostContractOfferStatus }
  /** Offre `PAUSED` ou `CANCELLED` : la cascade est refusée, sans écriture. */
  | { readonly kind: 'REFUSED'; readonly current: PostContractOfferStatus };

/**
 * Évalue la transition de l'offre contre le statut COURANT relu côté serveur.
 * Ordre volontaire : `FILLED` converge (rejeu sans effet), `ACTIVE` applique,
 * tout autre statut refuse — aucune réactivation d'offre pourvue ou annulée.
 */
export function evaluatePostContractOffer(
  current: PostContractOfferStatus,
): PostContractOfferOutcome {
  if (current === POST_CONTRACT_OFFER_TO) return { kind: 'ALREADY_APPLIED', to: POST_CONTRACT_OFFER_TO };
  if ((POST_CONTRACT_OFFER_FROM as readonly PostContractOfferStatus[]).includes(current)) {
    return { kind: 'APPLY', to: POST_CONTRACT_OFFER_TO };
  }
  return { kind: 'REFUSED', current };
}

export type PostContractWinningApplicationOutcome =
  /** Candidature ouverte → `HIRED`, puis `HIRED → CONTRACTED` dans la même commande. */
  | { readonly kind: 'APPLY_HIRED'; readonly to: ApplicationStatus }
  /** Candidature déjà `HIRED` → `CONTRACTED` (sortie documentée du MANQUE). */
  | { readonly kind: 'APPLY_CONTRACTED'; readonly to: ApplicationStatus }
  /** Déjà `CONTRACTED` : convergence sans écriture, jamais une erreur. */
  | { readonly kind: 'ALREADY_APPLIED'; readonly to: ApplicationStatus }
  /**
   * Candidature retenue `REJECTED`, `WITHDRAWN` ou `CLOSED_OFFER_FILLED` :
   * incohérence inter-domaines, la cascade est refusée sans aucune écriture.
   * (Inatteignable par les seules routes P0-E4/P0-F : P0-E4 refuse toute
   * décision sur une candidature liée à un contrat. Garde fail-closed.)
   */
  | { readonly kind: 'REFUSED'; readonly current: ApplicationStatus };

/**
 * Évalue la transition de la candidature RETENUE (celle que le contrat
 * référence via `applicationId`) contre son statut COURANT verrouillé.
 */
export function evaluatePostContractWinningApplication(
  current: ApplicationStatus,
): PostContractWinningApplicationOutcome {
  if (current === POST_CONTRACT_WINNING_APPLICATION_CONFIRMED) {
    return { kind: 'ALREADY_APPLIED', to: POST_CONTRACT_WINNING_APPLICATION_CONFIRMED };
  }
  if (current === POST_CONTRACT_WINNING_APPLICATION_TARGET) {
    return { kind: 'APPLY_CONTRACTED', to: POST_CONTRACT_WINNING_APPLICATION_CONFIRMED };
  }
  if ((POST_CONTRACT_OPEN_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(current)) {
    return { kind: 'APPLY_HIRED', to: POST_CONTRACT_WINNING_APPLICATION_TARGET };
  }
  return { kind: 'REFUSED', current };
}

export type PostContractOtherApplicationOutcome =
  /** Candidature ouverte → `CLOSED_OFFER_FILLED`. */
  | { readonly kind: 'APPLY'; readonly to: ApplicationStatus }
  /**
   * Toute autre candidature (déjà rejetée, retirée, embauchée, contractualisée
   * ou clôturée) est IGNORÉE, jamais réécrite — exactement comme le modèle DEMO
   * qui ne touche que les candidatures ouvertes.
   */
  | { readonly kind: 'SKIP'; readonly current: ApplicationStatus };

/**
 * Évalue la fermeture d'une AUTRE candidature de l'offre contre son statut
 * COURANT verrouillé.
 */
export function evaluatePostContractOtherApplication(
  current: ApplicationStatus,
): PostContractOtherApplicationOutcome {
  if ((POST_CONTRACT_OPEN_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(current)) {
    return { kind: 'APPLY', to: POST_CONTRACT_OTHER_APPLICATION_TARGET };
  }
  return { kind: 'SKIP', current };
}

/**
 * Transitions explicitement REFUSÉES par la cascade (aucun état impossible
 * produit). Cette table est documentaire : l'évaluateur ne les ouvre jamais.
 */
export const POST_CONTRACT_REFUSED_TRANSITIONS = [
  { scope: 'OFFER', from: 'PAUSED', to: 'FILLED', reason: 'Une offre en pause n’est plus active : elle ne peut pas être pourvue.' },
  { scope: 'OFFER', from: 'CANCELLED', to: 'FILLED', reason: 'Une offre annulée est terminale : elle ne peut pas être pourvue.' },
  { scope: 'OFFER', from: 'FILLED', to: 'ACTIVE', reason: 'Une offre pourvue ne peut pas être réactivée (P0-E2, conservé).' },
  { scope: 'WINNING_APPLICATION', from: 'REJECTED', to: 'HIRED', reason: 'Une candidature rejetée ne peut pas devenir la candidature retenue.' },
  { scope: 'WINNING_APPLICATION', from: 'WITHDRAWN', to: 'HIRED', reason: 'Une candidature retirée ne peut pas devenir la candidature retenue.' },
  { scope: 'WINNING_APPLICATION', from: 'CLOSED_OFFER_FILLED', to: 'HIRED', reason: 'Une candidature déjà clôturée ne peut pas devenir la candidature retenue.' },
  { scope: 'WINNING_APPLICATION', from: 'CONTRACTED', to: 'HIRED', reason: 'Aucun retour en arrière après contractualisation.' },
] as const;

/* ------------------------------------------------------------------ */
/* Exécution du travail (WORK EXECUTION) — correspondance réelle        */
/* ------------------------------------------------------------------ */

/**
 * Correspondance documentée entre le vocabulaire fonctionnel « WORK EXECUTION »
 * et les statuts RÉELLEMENT conservés dans le code. AUCUN statut nouveau n'est
 * créé par cette tranche : ni `WORK`, ni `EXECUTION`, ni `WORK_SUBMITTED`, ni
 * `ABANDONED`.
 */
export const WORK_EXECUTION_STATUS_MAPPING = [
  {
    plan: 'WORK / EXECUTION (travail en cours)',
    code: 'ACTIVE',
    detail: 'Un contrat actif EST l’exécution en cours : la mission a démarré après double signature (P0-F, conservé).',
  },
  {
    plan: 'WORK_SUBMITTED (travail soumis ou terminé)',
    code: 'suivi mensuel + déclarations P0-PAY (aucun statut)',
    detail: 'Le suivi d’exécution réel est porté par les points de contrôle mensuels et le cycle paiements/salaire (tranches dédiées, conservées) : cette tranche ne crée aucun statut de soumission.',
  },
  {
    plan: 'COMPLETED',
    code: 'COMPLETED',
    detail: 'Fin normale de mission (P0-F `END`, conservé).',
  },
  {
    plan: 'ABANDONED',
    code: 'TERMINATED (équivalent réel, aucun statut ABANDONED créé)',
    detail: 'La rupture motivée M2+ (`dissociateMonth2`, P0-F `TERMINATE`, protection M1 conservée) est l’équivalent réel d’un abandon : aucun doublon n’est inventé.',
  },
  {
    plan: 'REPLACED',
    code: 'REPLACED (chemin incident/remplacement, non ouvert ici)',
    detail: 'État terminal réel produit par l’arbitrage incident (`arbitrateIncident`) : conservé tel quel, aucun remplacement avancé dans cette tranche.',
  },
] as const;

/**
 * RÈGLE MÉTIER — HORAIRES (simplicité imposée).
 *
 * L'employeur publie les horaires de travail dans l'offre (texte libre :
 * `summary`, `conditions`, `responsibilities`) ; le candidat les lit AVANT de
 * postuler ; s'ils lui conviennent il postule, sinon il ne postule pas.
 *
 * Cette tranche ne crée donc volontairement AUCUN des mécanismes suivants —
 * cette liste est exhaustive et opposable :
 */
export const WORK_SCHEDULE_SIMPLICITY_RULES = [
  'Aucun moteur de disponibilité candidat.',
  'Aucun calendrier complexe.',
  'Aucun refus automatique selon les horaires.',
  'Aucun système de négociation d’horaires.',
  'Aucun moteur de matching horaire avancé.',
] as const;

/**
 * Ce qui reste APRÈS cette tranche, documenté ici pour ne pas être implémenté
 * prématurément (convention `POST_CONTRACT_AUTOMATION_REQUIREMENTS` de P0-F,
 * conservée telle quelle) :
 */
export const POST_CONTRACT_REMAINING_REQUIREMENTS = [
  'Notifications générales (OFFER_FILLED / APPLICATION_HIRED / APPLICATION_CONTRACTED / APPLICATION_CLOSED_OFFER_FILLED → destinataires) = moteur Outbox/Queue à venir, aucun consumer dans cette tranche.',
  'Garde anti-doublon « aucun contrat ACTIVE concurrent sur la même offre » (présente dans le DEMO `signContract`, absente côté serveur) = tranche de cohérence inter-contrats à venir.',
  'Chemin incident M1 (déclaration, arbitrage ADMIN, SUSPENDED / INCIDENT / REPLACED) = tranche incidents/remplacement, hors périmètre.',
  'Suivi mensuel détaillé (confirmMonthlyAction) et cycle paiements/salaire = tranches dédiées, conservées sans modification.',
] as const;

export type PostContractLifecycleEventType =
  | 'OFFER_FILLED'
  | 'APPLICATION_HIRED'
  | 'APPLICATION_CONTRACTED'
  | 'APPLICATION_CLOSED_OFFER_FILLED';

export const POST_CONTRACT_LIFECYCLE_EVENT_TYPES = [
  'OFFER_FILLED',
  'APPLICATION_HIRED',
  'APPLICATION_CONTRACTED',
  'APPLICATION_CLOSED_OFFER_FILLED',
] as const;

export interface DocumentedPostContractEvent {
  readonly eventType: PostContractLifecycleEventType;
  readonly aggregateType: 'offer' | 'application';
  readonly emittedBy: 'FINALIZE_HIRING';
  readonly payload: readonly string[];
  readonly dedupeKey: string;
  readonly sideEffects: readonly string[];
}

/**
 * Contrats d'événements DOCUMENTÉS pour le futur moteur transactional
 * Outbox/Queue (hors périmètre), selon la convention préparée en
 * P0-E4/P0-E5/P0-F.
 *
 * Cette tranche ne crée NI événement durable, NI consumer, NI notification :
 * `finalize-hiring` est une commande explicite et synchrone (aucun Cron ni
 * Queue de production). Ces constantes décrivent uniquement ce que les étapes
 * suivantes devront produire.
 */
export const DOCUMENTED_POST_CONTRACT_EVENTS: readonly DocumentedPostContractEvent[] = [
  {
    eventType: 'OFFER_FILLED',
    aggregateType: 'offer',
    emittedBy: 'FINALIZE_HIRING',
    payload: ['offerId', 'contractId', 'employerId', 'occurredAt'],
    dedupeKey: 'offerId + FILLED',
    sideEffects: ['retirer l’offre de la recherche publique (déjà effectif : `listPublic` ne rend que ACTIVE)', 'notifier l’employeur (étape ultérieure)'],
  },
  {
    eventType: 'APPLICATION_HIRED',
    aggregateType: 'application',
    emittedBy: 'FINALIZE_HIRING',
    payload: ['applicationId', 'offerId', 'contractId', 'candidateId', 'occurredAt'],
    dedupeKey: 'applicationId + HIRED',
    sideEffects: ['notifier le candidat retenu (étape ultérieure)'],
  },
  {
    eventType: 'APPLICATION_CONTRACTED',
    aggregateType: 'application',
    emittedBy: 'FINALIZE_HIRING',
    payload: ['applicationId', 'offerId', 'contractId', 'candidateId', 'occurredAt'],
    dedupeKey: 'applicationId + CONTRACTED',
    sideEffects: ['notifier le candidat retenu (étape ultérieure)'],
  },
  {
    eventType: 'APPLICATION_CLOSED_OFFER_FILLED',
    aggregateType: 'application',
    emittedBy: 'FINALIZE_HIRING',
    payload: ['applicationId', 'offerId', 'candidateId', 'occurredAt'],
    dedupeKey: 'applicationId + CLOSED_OFFER_FILLED',
    sideEffects: ['notifier chaque candidat non retenu (étape ultérieure)'],
  },
] as const;
