/**
 * LE LABEUR — P0-E4 — cycle de décision d'une CANDIDATURE.
 *
 * Matrice de transitions RÉELLE du domaine, dérivée du code existant :
 *  - statuts : `src/types/index.ts` (`ApplicationStatus`) ;
 *  - gardes  : `MockRepository.withdrawApplication / examineApplication /
 *              shortlistApplication / rejectApplication` (`src/repositories/mockRepository.ts`) ;
 *  - contraintes SQL : `migrations/0003_core_nucleus_alignment.sql`
 *    (`applications_status_domain`).
 *
 * Aucun statut n'est inventé ici : les noms du code sont conservés.
 *
 *   SUBMITTED  → PENDING      (P0-E3, soumission par le CANDIDATE)
 *   EXAMINED   → REVIEW       (EMPLOYER propriétaire)
 *   SHORTLIST  → SHORTLISTED  (EMPLOYER propriétaire, offre ACTIVE)
 *   REJECT     → REJECTED     (EMPLOYER propriétaire)
 *   WITHDRAW   → WITHDRAWN    (CANDIDATE propriétaire de la candidature)
 *
 * Module PUR : aucune dépendance serveur, aucun accès base, aucun effet de
 * bord. Il est partagé par la couche API (Worker → Repository → PostgreSQL) et
 * reste compatible avec le bundle navigateur (MODE DEMO = MockRepository).
 */

import type { ApplicationStatus, UserRole } from '../types';

export type ApplicationDecision = 'EXAMINE' | 'SHORTLIST' | 'REJECT' | 'WITHDRAW';

export const APPLICATION_DECISION_VALUES = ['EXAMINE', 'SHORTLIST', 'REJECT', 'WITHDRAW'] as const;

/**
 * Statuts depuis lesquels aucune décision P0-E4 n'est plus possible.
 * `HIRED`, `CONTRACTED` et `CLOSED_OFFER_FILLED` relèvent des étapes suivantes
 * (propositions, contrats) : P0-E4 ne les produit jamais, mais doit refuser
 * d'y toucher.
 */
export const APPLICATION_TERMINAL_STATUSES = [
  'REJECTED',
  'WITHDRAWN',
  'HIRED',
  'CONTRACTED',
  'CLOSED_OFFER_FILLED',
] as const;

/** Motif de rejet par défaut du modèle réel (`MockRepository.rejectApplication`). */
export const DEFAULT_REJECTION_NOTE = 'Dossier non retenu pour cette mission.';

export interface ApplicationHistoryEntry {
  action: string;
  timestamp: string;
  actor: string;
}

export interface ApplicationTransitionRule {
  readonly decision: ApplicationDecision;
  /** Seul rôle autorisé par le modèle réel pour cette décision. */
  readonly actorRole: UserRole;
  /** Statuts de départ autorisés ; tout autre statut est une transition interdite. */
  readonly from: readonly ApplicationStatus[];
  readonly to: ApplicationStatus;
  /** `SHORTLIST` exige une offre ACTIVE dans le modèle réel. */
  readonly requiresActiveOffer: boolean;
  /** Libellé d'historique du modèle réel. */
  readonly historyAction: (reason?: string) => string;
  /** Événement métier documenté (aucun moteur Outbox/Queue en P0-E4). */
  readonly event: ApplicationLifecycleEventType;
  /** Refus explicite quand la candidature est déjà dans un état terminal. */
  readonly terminalMessage: string;
}

export type ApplicationLifecycleEventType =
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_EXAMINED'
  | 'APPLICATION_SHORTLISTED'
  | 'APPLICATION_REJECTED'
  | 'APPLICATION_WITHDRAWN';

export const APPLICATION_LIFECYCLE_EVENT_TYPES = [
  'APPLICATION_SUBMITTED',
  'APPLICATION_EXAMINED',
  'APPLICATION_SHORTLISTED',
  'APPLICATION_REJECTED',
  'APPLICATION_WITHDRAWN',
] as const;

/**
 * Matrice des transitions P0-E4.
 *
 * `REJECT` accepte `SHORTLISTED` parce que le modèle réel l'autorise
 * explicitement (`rejectApplication` : `['PENDING','REVIEW','SHORTLISTED']`).
 * Aucune autre opération ne peut sortir une candidature de `SHORTLISTED`.
 */
export const APPLICATION_DECISION_RULES: Record<ApplicationDecision, ApplicationTransitionRule> = {
  EXAMINE: {
    decision: 'EXAMINE',
    actorRole: 'EMPLOYER',
    from: ['PENDING'],
    to: 'REVIEW',
    requiresActiveOffer: false,
    historyAction: () => 'Dossier passé en examen technique',
    event: 'APPLICATION_EXAMINED',
    terminalMessage: 'Une candidature déjà décidée ne peut plus être mise en examen.',
  },
  SHORTLIST: {
    decision: 'SHORTLIST',
    actorRole: 'EMPLOYER',
    from: ['PENDING', 'REVIEW'],
    to: 'SHORTLISTED',
    requiresActiveOffer: true,
    historyAction: () => 'Candidat sélectionné (Shortlist)',
    event: 'APPLICATION_SHORTLISTED',
    terminalMessage: 'Une candidature déjà décidée ne peut plus être shortlistée.',
  },
  REJECT: {
    decision: 'REJECT',
    actorRole: 'EMPLOYER',
    from: ['PENDING', 'REVIEW', 'SHORTLISTED'],
    to: 'REJECTED',
    requiresActiveOffer: false,
    historyAction: (reason?: string) => `Candidature non retenue${reason ? ` (${reason})` : ''}`,
    event: 'APPLICATION_REJECTED',
    terminalMessage: 'Une candidature déjà décidée ne peut plus être rejetée.',
  },
  WITHDRAW: {
    decision: 'WITHDRAW',
    actorRole: 'CANDIDATE',
    from: ['PENDING', 'REVIEW', 'SHORTLISTED'],
    to: 'WITHDRAWN',
    requiresActiveOffer: false,
    historyAction: () => 'Candidature retirée par le candidat',
    event: 'APPLICATION_WITHDRAWN',
    terminalMessage: 'Une candidature déjà retirée ne peut plus être modifiée.',
  },
};

export type ApplicationDecisionOutcome =
  | { readonly kind: 'APPLY'; readonly to: ApplicationStatus }
  /** Déjà dans l'état cible : aucun double effet, aucune écriture. */
  | { readonly kind: 'ALREADY_APPLIED'; readonly to: ApplicationStatus }
  | { readonly kind: 'TERMINAL'; readonly current: ApplicationStatus }
  | { readonly kind: 'FORBIDDEN'; readonly current: ApplicationStatus };

/**
 * Évalue une décision contre le statut COURANT relu côté serveur.
 *
 * Ordre volontaire :
 *  1. `TERMINAL` d'abord — une candidature REJECTED ou WITHDRAWN est close :
 *     aucune décision, y compris la répétition de celle qui l'a close, n'est
 *     acceptée (le rejeu d'une commande reste couvert par l'Idempotency-Key) ;
 *  2. `ALREADY_APPLIED` ensuite — REVIEW et SHORTLISTED restent ouverts à
 *     d'autres décisions, donc répéter la même est un rejeu sans effet :
 *     aucune écriture, aucune entrée d'historique dupliquée ;
 *  3. `FORBIDDEN` — toute autre combinaison est une transition interdite.
 */
export function evaluateApplicationDecision(
  decision: ApplicationDecision,
  currentStatus: ApplicationStatus,
): ApplicationDecisionOutcome {
  const rule = APPLICATION_DECISION_RULES[decision];
  if ((APPLICATION_TERMINAL_STATUSES as readonly ApplicationStatus[]).includes(currentStatus)) {
    return { kind: 'TERMINAL', current: currentStatus };
  }
  if (currentStatus === rule.to) return { kind: 'ALREADY_APPLIED', to: rule.to };
  if (!rule.from.includes(currentStatus)) return { kind: 'FORBIDDEN', current: currentStatus };
  return { kind: 'APPLY', to: rule.to };
}

/** Nettoie le motif de rejet ; le modèle réel applique un défaut, il ne l'exige pas. */
export function normalizeRejectionNote(note: string | undefined): string | undefined {
  if (note === undefined) return undefined;
  if (typeof note !== 'string') return undefined;
  const trimmed = note.trim();
  return trimmed ? trimmed : undefined;
}

export interface DocumentedApplicationEvent {
  readonly eventType: ApplicationLifecycleEventType;
  readonly aggregateType: 'application';
  readonly emittedBy: ApplicationDecision | 'SUBMIT';
  readonly payload: readonly string[];
  readonly dedupeKey: string;
  readonly sideEffects: readonly string[];
}

/**
 * Contrats d'événements DOCUMENTÉS pour le futur moteur transactional
 * Outbox/Queue (hors périmètre P0-E4).
 *
 * P0-E4 ne crée NI moteur, NI table, NI consumer, NI notification : ces
 * constantes décrivent uniquement ce que les étapes suivantes devront produire,
 * avec la clé de déduplication attendue.
 */
export const DOCUMENTED_APPLICATION_EVENTS: readonly DocumentedApplicationEvent[] = [
  {
    eventType: 'APPLICATION_SUBMITTED',
    aggregateType: 'application',
    emittedBy: 'SUBMIT',
    payload: ['applicationId', 'offerId', 'candidateId', 'employerId', 'occurredAt'],
    dedupeKey: 'applicationId + SUBMITTED',
    sideEffects: ['notifier l’employeur propriétaire'],
  },
  {
    eventType: 'APPLICATION_EXAMINED',
    aggregateType: 'application',
    emittedBy: 'EXAMINE',
    payload: ['applicationId', 'offerId', 'candidateId', 'actorId', 'occurredAt'],
    dedupeKey: 'applicationId + EXAMINED',
    sideEffects: ['rafraîchir la vue employeur de la candidature'],
  },
  {
    eventType: 'APPLICATION_SHORTLISTED',
    aggregateType: 'application',
    emittedBy: 'SHORTLIST',
    payload: ['applicationId', 'offerId', 'candidateId', 'actorId', 'occurredAt'],
    dedupeKey: 'applicationId + SHORTLISTED',
    sideEffects: ['notifier le candidat retenu'],
  },
  {
    eventType: 'APPLICATION_REJECTED',
    aggregateType: 'application',
    emittedBy: 'REJECT',
    payload: ['applicationId', 'offerId', 'candidateId', 'actorId', 'reason', 'occurredAt'],
    dedupeKey: 'applicationId + REJECTED',
    sideEffects: ['notifier le candidat non retenu avec le motif enregistré'],
  },
  {
    eventType: 'APPLICATION_WITHDRAWN',
    aggregateType: 'application',
    emittedBy: 'WITHDRAW',
    payload: ['applicationId', 'offerId', 'candidateId', 'actorId', 'occurredAt'],
    dedupeKey: 'applicationId + WITHDRAWN',
    sideEffects: ['notifier l’employeur propriétaire du retrait'],
  },
] as const;
