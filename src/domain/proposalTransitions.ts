/**
 * LE LABEUR — P0-E5 — cycle de vie RÉEL d'une PROPOSITION d'embauche.
 *
 * Matrice de transitions dérivée du code existant, sans aucun statut inventé :
 *  - statuts        : `src/types/index.ts` (`ProposalStatus`) ;
 *  - émission       : `MockRepository.sendProposal` (`src/repositories/mockRepository.ts`) ;
 *  - réponse        : `MockRepository.respondToProposal` ;
 *  - contrainte SQL : `migrations/0004_proposals.sql` (`proposals_status_domain`).
 *
 * Nomenclature conservée telle quelle (le vocabulaire fonctionnel du plan est
 * indiqué en regard, il n'est jamais substitué au code) :
 *
 *   PROPOSAL_SENT    → SENT                (EMPLOYER propriétaire, émission)
 *   ACCEPTED         → ACCEPTED            (CANDIDATE destinataire)
 *   REJECTED         → DECLINED            (CANDIDATE destinataire)
 *   EXPIRED          → EXPIRED             (EMPLOYER propriétaire, expiration)
 *
 * Statuts du modèle réel NON produits par cette tranche :
 *   - `DRAFT`              : jamais produit par le modèle réel (« MANQUE » documenté
 *                            dans `docs/statecharts.mmd`), donc jamais produit ici ;
 *   - `REVISION_REQUESTED` : atteint uniquement par l'action `REVISE`, qui n'est pas
 *                            ouverte par P0-E5 (voir `PROPOSAL_OUT_OF_SCOPE_ACTIONS`).
 *
 * Module PUR : aucune dépendance serveur, aucun accès base, aucun effet de bord.
 */

import type { ProposalStatus, UserRole } from '../types';

/** Action de réponse réellement ouverte par P0-E5 (sous-ensemble de `respondToProposal`). */
export type ProposalResponseAction = 'ACCEPT' | 'DECLINE';

export const PROPOSAL_RESPONSE_ACTIONS = ['ACCEPT', 'DECLINE'] as const;

/**
 * Action existante dans le modèle réel mais HORS PÉRIMÈTRE P0-E5 : la boucle de
 * révision (`REVISION_REQUESTED` → nouvelle proposition émise par l'employeur)
 * constitue une seconde tranche métier, non validée ici.
 */
export const PROPOSAL_OUT_OF_SCOPE_ACTIONS = ['REVISE'] as const;

export type ProposalLifecycleEventType =
  | 'PROPOSAL_SENT'
  | 'PROPOSAL_ACCEPTED'
  | 'PROPOSAL_DECLINED'
  | 'PROPOSAL_EXPIRED';

export const PROPOSAL_LIFECYCLE_EVENT_TYPES = [
  'PROPOSAL_SENT',
  'PROPOSAL_ACCEPTED',
  'PROPOSAL_DECLINED',
  'PROPOSAL_EXPIRED',
] as const;

/**
 * Statuts depuis lesquels aucune action P0-E5 n'est plus possible.
 * Une proposition acceptée, déclinée ou expirée est close : la répétition de
 * l'action qui l'a close n'est PAS appliquée (le rejeu d'une commande reste
 * couvert par l'en-tête `Idempotency-Key`, traité avant la machine d'états).
 */
export const PROPOSAL_TERMINAL_STATUSES = ['ACCEPTED', 'DECLINED', 'EXPIRED'] as const;

/**
 * Statuts d'une candidature ADMISSIBLE à une proposition.
 *
 * Dérivé du modèle réel P0-E4 : ce sont exactement les statuts qui ne sont pas
 * terminaux dans `APPLICATION_TERMINAL_STATUSES`
 * (`src/domain/applicationTransitions.ts`). Proposer à une candidature rejetée,
 * retirée, embauchée, contractualisée ou clôturée produirait un état impossible ;
 * le modèle réel (`MockRepository.sendProposal`) ne vérifie pas ce point, P0-E5
 * l'ajoute comme contrôle d'éligibilité sur ses propres statuts (aucun statut
 * nouveau n'est créé).
 */
export const PROPOSAL_ELIGIBLE_APPLICATION_STATUSES = ['PENDING', 'REVIEW', 'SHORTLISTED'] as const;

/** Périodicités réellement déclarées par `MissionProposal.periodicity`. */
export const PROPOSAL_PERIODICITY_VALUES = ['Mensuel', 'Hebdomadaire', 'Forfait mission'] as const;

export type ProposalPeriodicity = (typeof PROPOSAL_PERIODICITY_VALUES)[number];

export function isProposalPeriodicity(value: unknown): value is ProposalPeriodicity {
  return typeof value === 'string' && (PROPOSAL_PERIODICITY_VALUES as readonly string[]).includes(value);
}

/** Statuts d'une proposition pouvant encore recevoir une réponse P0-E5. */
export const PROPOSAL_RESPONDABLE_STATUSES = ['SENT'] as const;

/** Statut initial d'une proposition émise (modèle réel `sendProposal`). */
export const PROPOSAL_INITIAL_STATUS: ProposalStatus = 'SENT';

export interface ProposalTransitionRule {
  /** Action produite (réponse du candidat, ou expiration). */
  readonly action: ProposalResponseAction | 'EXPIRE';
  /** Seul rôle autorisé par le modèle réel pour cette action. */
  readonly actorRole: UserRole;
  /** Statuts de départ autorisés ; tout autre statut est une transition interdite. */
  readonly from: readonly ProposalStatus[];
  readonly to: ProposalStatus;
  /** Événement métier documenté (aucun moteur Outbox/Queue en P0-E5). */
  readonly event: ProposalLifecycleEventType;
  /** Refus explicite quand la proposition est déjà close. */
  readonly terminalMessage: string;
}

/**
 * Réponse du CANDIDATE destinataire.
 *
 * Le modèle réel autorise une réponse depuis `SENT` ET `REVISION_REQUESTED`
 * (`respondToProposal`). `REVISION_REQUESTED` n'étant jamais produit par P0-E5
 * (action `REVISE` hors périmètre), la matrice n'ouvre que `SENT` : aucune
 * transition n'est inventée, une proposition déjà en révision est refusée.
 */
export const PROPOSAL_RESPONSE_RULES: Record<ProposalResponseAction, ProposalTransitionRule> = {
  ACCEPT: {
    action: 'ACCEPT',
    actorRole: 'CANDIDATE',
    from: ['SENT'],
    to: 'ACCEPTED',
    event: 'PROPOSAL_ACCEPTED',
    terminalMessage: 'Cette proposition a déjà reçu une réponse définitive.',
  },
  DECLINE: {
    action: 'DECLINE',
    actorRole: 'CANDIDATE',
    from: ['SENT'],
    to: 'DECLINED',
    event: 'PROPOSAL_DECLINED',
    terminalMessage: 'Cette proposition a déjà reçu une réponse définitive.',
  },
};

/**
 * Expiration (EMPLOYER émetteur de la proposition).
 *
 * P0-E5 ne crée NI scheduler, NI Cron, NI moteur d'automatisation : l'expiration
 * est une transition explicite, autorisée au seul propriétaire de la proposition.
 * Le moteur futur devra produire EXACTEMENT cette transition (même statut cible,
 * même événement) lorsqu'une échéance sera dépassée.
 */
export const PROPOSAL_EXPIRATION_RULE: ProposalTransitionRule = {
  action: 'EXPIRE',
  actorRole: 'EMPLOYER',
  from: ['SENT'],
  to: 'EXPIRED',
  event: 'PROPOSAL_EXPIRED',
  terminalMessage: 'Cette proposition ne peut plus expirer (elle est déjà close).',
};

export type ProposalTransitionOutcome =
  | { readonly kind: 'APPLY'; readonly to: ProposalStatus }
  /** État de départ hors matrice (DRAFT/REVISION_REQUESTED non produits par P0-E5). */
  | { readonly kind: 'FORBIDDEN'; readonly current: ProposalStatus }
  /** Déjà close (ACCEPTED/DECLINED/EXPIRED) : aucune écriture, refus explicite. */
  | { readonly kind: 'TERMINAL'; readonly current: ProposalStatus };

/**
 * Évalue une transition contre le statut COURANT relu côté serveur.
 *
 * Ordre volontaire : un état terminal est refusé en premier (aucune action sur
 * une proposition close), puis tout statut hors matrice est refusé — aucune
 * transition impossible n'est introduite.
 */
export function evaluateProposalTransition(
  rule: ProposalTransitionRule,
  current: ProposalStatus,
): ProposalTransitionOutcome {
  if ((PROPOSAL_TERMINAL_STATUSES as readonly ProposalStatus[]).includes(current)) {
    return { kind: 'TERMINAL', current };
  }
  if (!rule.from.includes(current)) return { kind: 'FORBIDDEN', current };
  return { kind: 'APPLY', to: rule.to };
}

/**
 * Constat du modèle réel : `MissionProposal` (`src/types/index.ts`) ne porte
 * AUCUN champ d'échéance — ni `expiresAt`, ni `deadline`, ni `expirationDate` —
 * et aucune migration antérieure n'en crée. P0-E5 ne peut donc pas inventer une
 * deadline ni « faire respecter » une règle de temps inexistante : il modélise
 * l'état `EXPIRED` et sa transition explicite, et documente ici ce que la suite
 * devra fournir. Aucune constante de durée, aucun TTL, aucune file d'attente
 * n'est créée par cette tranche.
 */
export const PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS = [
  'Ajouter au modèle réel un champ d’échéance (colonne + type) avant toute règle de temps : P0-E5 n’en invente aucun.',
  'Décider la durée d’expiration par défaut (règle métier à valider) et la stocker à l’émission de la proposition.',
  'Créer le moteur Cron/Queue global (hors périmètre P0-E5) et y produire la transition SENT → EXPIRED, à l’identique de la règle `PROPOSAL_EXPIRATION_RULE`.',
  'Rendre le traitement idempotent (clé de déduplication `proposalId + EXPIRED`) et sans double effet avec une acceptation/déclinaison concurrente.',
] as const;

export interface DocumentedProposalEvent {
  readonly eventType: ProposalLifecycleEventType;
  readonly aggregateType: 'proposal';
  readonly emittedBy: ProposalResponseAction | 'EXPIRE' | 'SEND';
  readonly payload: readonly string[];
  readonly dedupeKey: string;
  readonly sideEffects: readonly string[];
}

/**
 * Contrats d'événements DOCUMENTÉS pour le futur moteur transactional
 * Outbox/Queue (hors périmètre P0-E5), selon la convention préparée en P0-E4.
 *
 * P0-E5 ne crée NI moteur, NI table Outbox, NI consumer, NI notification : ces
 * constantes décrivent uniquement ce que les étapes suivantes devront produire.
 */
export const DOCUMENTED_PROPOSAL_EVENTS: readonly DocumentedProposalEvent[] = [
  {
    eventType: 'PROPOSAL_SENT',
    aggregateType: 'proposal',
    emittedBy: 'SEND',
    payload: ['proposalId', 'conversationId', 'offerId', 'applicationId', 'employerId', 'employeeId', 'occurredAt'],
    dedupeKey: 'proposalId + SENT',
    sideEffects: ['notifier le candidat destinataire'],
  },
  {
    eventType: 'PROPOSAL_ACCEPTED',
    aggregateType: 'proposal',
    emittedBy: 'ACCEPT',
    payload: ['proposalId', 'offerId', 'applicationId', 'employeeId', 'occurredAt'],
    dedupeKey: 'proposalId + ACCEPTED',
    sideEffects: ['notifier l’employeur émetteur', 'permettre la préparation du contrat (étape suivante)'],
  },
  {
    eventType: 'PROPOSAL_DECLINED',
    aggregateType: 'proposal',
    emittedBy: 'DECLINE',
    payload: ['proposalId', 'offerId', 'applicationId', 'employeeId', 'occurredAt'],
    dedupeKey: 'proposalId + DECLINED',
    sideEffects: ['notifier l’employeur émetteur'],
  },
  {
    eventType: 'PROPOSAL_EXPIRED',
    aggregateType: 'proposal',
    emittedBy: 'EXPIRE',
    payload: ['proposalId', 'offerId', 'applicationId', 'employerId', 'employeeId', 'occurredAt'],
    dedupeKey: 'proposalId + EXPIRED',
    sideEffects: ['clore la proposition côté candidat et employeur'],
  },
] as const;
