/**
 * LE LABEUR — P0-F — cycle de vie RÉEL d'un CONTRAT.
 *
 * Matrice de transitions dérivée du code existant, sans aucun statut inventé :
 *  - statuts       : `src/types/index.ts` (`ContractStatus`) ;
 *  - génération    : `MockRepository.generateContract` (`src/repositories/mockRepository.ts`) ;
 *  - signature     : `MockRepository.signContract` (RÈGLE 17, double signature) ;
 *  - terminaison   : `MockRepository.dissociateMonth2` (M2+, motif obligatoire)
 *                    et `MockRepository.resolveStartDivergence` (arbitrage) ;
 *  - contrainte SQL : `migrations/0003_core_nucleus_alignment.sql`
 *                    (`contracts_status_domain`).
 *
 * Nomenclature conservée telle quelle — le vocabulaire fonctionnel du plan est
 * indiqué en regard, il n'est jamais substitué au code :
 *
 *   DRAFT        → `DRAFT`        (statut réel déclaré ; jamais produit par le
 *                                  modèle DEMO, qui génère directement SIGNATURE)
 *   SENT         → `SIGNATURE`    (le contrat est émis et attend les signatures ;
 *                                  l'employeur y appose sa signature)
 *   SIGNED       → `SIGNATURE` + `employerSigned && employeeSigned` (les deux
 *                                  drapeaux RÉELS de signature ; le modèle DEMO
 *                                  enchaîne alors automatiquement sur ACTIVE)
 *   ACTIVE       → `ACTIVE`
 *   ENDED        → `COMPLETED`    (état terminal réel, libellé « Complété » ;
 *                                  jamais produit par le modèle DEMO)
 *   TERMINATED   → `TERMINATED`   (rupture anticipée motivée, M2+)
 *
 * Statuts RÉELS du domaine non ouverts par P0-F (ils appartiennent aux tranches
 * incidents / remplacement / paiements) :
 *   - `PENDING_EMPLOYER`, `PENDING_EMPLOYEE` : jamais produits par le modèle ;
 *   - `SUSPENDED`, `INCIDENT`, `REPLACED`    : produits par le chemin incident /
 *                                              remplacement (`reportIncident`,
 *                                              `arbitrateIncident`) — hors P0-F.
 *
 * Module PUR : aucune dépendance serveur, aucun accès base, aucun effet de bord.
 */

import type { ContractStatus, UserRole } from '../types';
import { PROPOSAL_ELIGIBLE_APPLICATION_STATUSES } from './proposalTransitions';

/** Statuts RÉELS ouverts par P0-F (sous-ensemble exact de `ContractStatus`). */
export const CONTRACT_LIFECYCLE_STATUSES = [
  'DRAFT',
  'SIGNATURE',
  'ACTIVE',
  'COMPLETED',
  'TERMINATED',
] as const;

export type ContractLifecycleStatus = (typeof CONTRACT_LIFECYCLE_STATUSES)[number];

/**
 * Statuts réels du domaine laissés FERMÉS par P0-F : aucun handler ne peut les
 * produire ni les consommer à cette étape (incidents, remplacement, paiements).
 */
export const CONTRACT_OUT_OF_SCOPE_STATUSES = [
  'PENDING_EMPLOYER',
  'PENDING_EMPLOYEE',
  'SUSPENDED',
  'INCIDENT',
  'REPLACED',
] as const;

/**
 * Statuts terminaux reconnus par le modèle réel : `MockRepository` refuse toute
 * réactivation depuis `TERMINATED`, `COMPLETED` ou `REPLACED` (anti-doublon de
 * contrat non terminal, échéancier gelé).
 */
export const CONTRACT_TERMINAL_STATUSES = ['COMPLETED', 'TERMINATED', 'REPLACED'] as const;

/** Statut initial réellement produit par P0-F à la création (brouillon préparé). */
export const CONTRACT_INITIAL_STATUS: ContractStatus = 'DRAFT';

/**
 * Correspondance documentée entre le vocabulaire fonctionnel du plan et les
 * noms RÉELLEMENT conservés dans le code.
 */
export const CONTRACT_STATUS_MAPPING = [
  { plan: 'DRAFT', code: 'DRAFT', detail: 'Brouillon préparé depuis une proposition ACCEPTED.' },
  { plan: 'SENT', code: 'SIGNATURE', detail: 'Contrat émis pour signature (SENT = SIGNATURE + signatures incomplètes).' },
  { plan: 'SIGNED', code: 'SIGNATURE (employerSigned && employeeSigned)', detail: 'Les deux drapeaux réels de signature sont posés ; l’état est dérivé, jamais dupliqué en statut.' },
  { plan: 'ACTIVE', code: 'ACTIVE', detail: 'Activation explicite après signature bilatérale.' },
  { plan: 'ENDED', code: 'COMPLETED', detail: 'Fin normale de mission (état terminal réel, libellé « Complété »).' },
  { plan: 'TERMINATED', code: 'TERMINATED', detail: 'Rupture anticipée motivée (M2+), protection M1 conservée.' },
] as const;

/** Statuts d'une candidature admis pour contractualiser (P0-E5, aucune règle nouvelle). */
export const CONTRACT_ELIGIBLE_APPLICATION_STATUSES = PROPOSAL_ELIGIBLE_APPLICATION_STATUSES;

export type ContractAction = 'SEND' | 'ACTIVATE' | 'END' | 'TERMINATE';

export const CONTRACT_ACTION_VALUES = ['SEND', 'ACTIVATE', 'END', 'TERMINATE'] as const;

export type ContractParty = 'EMPLOYER' | 'EMPLOYEE';

export const CONTRACT_SIGNATURE_PARTIES = ['EMPLOYER', 'EMPLOYEE'] as const;

export type ContractLifecycleEventType =
  | 'CONTRACT_CREATED'
  | 'CONTRACT_SENT'
  | 'CONTRACT_SIGNED'
  | 'CONTRACT_ACTIVATED'
  | 'CONTRACT_ENDED'
  | 'CONTRACT_TERMINATED';

export const CONTRACT_LIFECYCLE_EVENT_TYPES = [
  'CONTRACT_CREATED',
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'CONTRACT_ACTIVATED',
  'CONTRACT_ENDED',
  'CONTRACT_TERMINATED',
] as const;

export interface ContractTransitionRule {
  /** Action produite par la commande. */
  readonly action: ContractAction;
  /** Seul rôle autorisé par P0-F pour cette action (le CANDIDATE ne signe que son propre drapeau). */
  readonly actorRole: UserRole;
  /** Statuts de départ autorisés ; tout autre statut est une transition interdite. */
  readonly from: readonly ContractStatus[];
  readonly to: ContractStatus;
  /** Événement métier documenté (aucun moteur Outbox/Queue en P0-F). */
  readonly event: ContractLifecycleEventType;
  /** Libellé d'historique persisté dans `contracts.history` (noms du modèle réel quand ils existent). */
  readonly historyEvent: string;
  /** `ACTIVATE` exige `employerSigned && employeeSigned`. */
  readonly requiresBothSignatures?: boolean;
  /**
   * Partie dont la signature est portée par l'action : `SEND` **est** la
   * signature de l'employeur dans le modèle réel (`MockRepository.signContract`
   * considère l'envoi comme signé par l'employeur). Aucune autre transition ne
   * pose de signature implicite.
   */
  readonly signatureParty?: 'EMPLOYER' | 'EMPLOYEE';
  /** `TERMINATE` exige un motif non vide (`dissociateMonth2`). */
  readonly requiresReason?: boolean;
  /** `TERMINATE` conserve la protection M1 du modèle réel (M1 ⇒ incident obligatoire). */
  readonly protectsFirstMonth?: boolean;
  /** Refus explicite quand le contrat est déjà terminal. */
  readonly terminalMessage: string;
}

/**
 * Matrice P0-F (transitions RÉELLES ouvertes, aucune autre) :
 *
 *   DRAFT     → SIGNATURE  (SEND, EMPLOYER propriétaire)     [plan : DRAFT → SENT]
 *   SIGNATURE → SIGNATURE  (SIGN, chaque partie, cf. plus bas) [plan : SENT → SIGNED]
 *   SIGNATURE → ACTIVE     (ACTIVATE, EMPLOYER propriétaire, double signature requise)
 *   ACTIVE    → COMPLETED  (END, EMPLOYER propriétaire)       [plan : ACTIVE → ENDED]
 *   ACTIVE    → TERMINATED (TERMINATE, EMPLOYER propriétaire, motif + M2+)
 */
export const CONTRACT_TRANSITION_RULES: Record<ContractAction, ContractTransitionRule> = {
  SEND: {
    action: 'SEND',
    actorRole: 'EMPLOYER',
    from: ['DRAFT'],
    to: 'SIGNATURE',
    event: 'CONTRACT_SENT',
    historyEvent: 'EMPLOYER_SIGNED',
    // L'envoi EST la signature employeur du modèle réel : le drapeau est posé
    // atomiquement avec DRAFT → SIGNATURE.
    signatureParty: 'EMPLOYER',
    terminalMessage: 'Ce contrat ne peut plus être envoyé (il est déjà clos).',
  },
  ACTIVATE: {
    action: 'ACTIVATE',
    actorRole: 'EMPLOYER',
    from: ['SIGNATURE'],
    to: 'ACTIVE',
    event: 'CONTRACT_ACTIVATED',
    historyEvent: 'CONTRACT_ACTIVATED_BILATERAL',
    requiresBothSignatures: true,
    terminalMessage: 'Ce contrat ne peut plus être activé (il est déjà clos).',
  },
  END: {
    action: 'END',
    actorRole: 'EMPLOYER',
    from: ['ACTIVE'],
    to: 'COMPLETED',
    event: 'CONTRACT_ENDED',
    historyEvent: 'CONTRACT_COMPLETED',
    terminalMessage: 'Ce contrat ne peut plus être clôturé (il est déjà clos).',
  },
  TERMINATE: {
    action: 'TERMINATE',
    actorRole: 'EMPLOYER',
    from: ['ACTIVE'],
    to: 'TERMINATED',
    event: 'CONTRACT_TERMINATED',
    historyEvent: 'CONTRACT_TERMINATED',
    requiresReason: true,
    protectsFirstMonth: true,
    terminalMessage: 'Ce contrat ne peut plus être rompu (il est déjà clos).',
  },
};

/**
 * Transitions explicitement REFUSÉES par P0-F (aucun état impossible produit).
 * Cette table est documentaire : les règles ci-dessus ne les ouvrent jamais.
 */
export const CONTRACT_REFUSED_TRANSITIONS = [
  { from: 'DRAFT', to: 'ACTIVE', reason: 'Une activation exige l’émission puis la double signature.' },
  { from: 'DRAFT', to: 'COMPLETED', reason: 'Un brouillon non émis ne peut pas être clôturé.' },
  { from: 'DRAFT', to: 'TERMINATED', reason: 'Un brouillon non émis ne peut pas être rompu.' },
  { from: 'SIGNATURE', to: 'COMPLETED', reason: 'Un contrat non actif ne peut pas être clôturé.' },
  { from: 'SIGNATURE', to: 'TERMINATED', reason: 'Un contrat non actif ne peut pas être rompu (le modèle réel l’interdit).' },
  { from: 'ACTIVE', to: 'SIGNATURE', reason: 'Aucune signature n’est acceptée après activation.' },
  { from: 'COMPLETED', to: 'ACTIVE', reason: '`COMPLETED` est terminal dans le modèle réel.' },
  { from: 'COMPLETED', to: 'TERMINATED', reason: '`COMPLETED` est terminal dans le modèle réel.' },
  { from: 'TERMINATED', to: 'ACTIVE', reason: '`TERMINATED` est terminal dans le modèle réel.' },
  { from: 'TERMINATED', to: 'COMPLETED', reason: '`TERMINATED` est terminal dans le modèle réel.' },
] as const;

export type ContractTransitionOutcome =
  | { readonly kind: 'APPLY'; readonly to: ContractStatus }
  /** État de départ hors matrice (ex. `DRAFT` pour `ACTIVATE`). */
  | { readonly kind: 'FORBIDDEN'; readonly current: ContractStatus }
  /** Déjà clos (COMPLETED/TERMINATED/REPLACED) : aucune écriture, refus explicite. */
  | { readonly kind: 'TERMINAL'; readonly current: ContractStatus };

/**
 * Évalue une transition contre le statut COURANT relu côté serveur.
 * Ordre volontaire : un état terminal est refusé en premier, puis tout statut
 * hors matrice — aucune transition impossible n'est introduite.
 */
export function evaluateContractTransition(
  rule: ContractTransitionRule,
  current: ContractStatus,
): ContractTransitionOutcome {
  if ((CONTRACT_TERMINAL_STATUSES as readonly ContractStatus[]).includes(current)) {
    return { kind: 'TERMINAL', current };
  }
  if (!rule.from.includes(current)) return { kind: 'FORBIDDEN', current };
  return { kind: 'APPLY', to: rule.to };
}

export interface ContractSignatureFlags {
  readonly employerSigned: boolean;
  readonly employeeSigned: boolean;
}

/** `SIGNED` (plan) = les deux drapeaux RÉELS de signature sont posés, statut `SIGNATURE`. */
export function isContractFullySigned(flags: ContractSignatureFlags): boolean {
  return flags.employerSigned === true && flags.employeeSigned === true;
}

export type ContractSignatureOutcome =
  | { readonly kind: 'APPLY' }
  /** Cette partie a déjà signé : le modèle réel refuse la seconde signature. */
  | { readonly kind: 'ALREADY_SIGNED'; readonly party: ContractParty }
  /** Contrat déjà actif : aucune signature acceptée après activation. */
  | { readonly kind: 'FORBIDDEN'; readonly current: ContractStatus }
  | { readonly kind: 'TERMINAL'; readonly current: ContractStatus };

/**
 * Évalue une signature (`signContract`) : uniquement sur un contrat `SIGNATURE`
 * (plan : SENT), une seule fois par partie, jamais après activation ni sur un
 * contrat clos. Le statut ne change pas : seule la paire de drapeaux réelle
 * évolue, et `SIGNED` en est dérivé.
 */
export function evaluateContractSignature(
  current: ContractStatus,
  party: ContractParty,
  flags: ContractSignatureFlags,
): ContractSignatureOutcome {
  if ((CONTRACT_TERMINAL_STATUSES as readonly ContractStatus[]).includes(current)) {
    return { kind: 'TERMINAL', current };
  }
  if (current !== 'SIGNATURE') return { kind: 'FORBIDDEN', current };
  const alreadySigned = party === 'EMPLOYER' ? flags.employerSigned : flags.employeeSigned;
  if (alreadySigned) return { kind: 'ALREADY_SIGNED', party };
  return { kind: 'APPLY' };
}

/**
 * Constat du modèle réel : la signature P0-F est une **représentation métier**
 * (drapeaux `employerSigned` / `employeeSigned` + horodatages + historique),
 * exactement ceux du modèle existant. P0-F n'invente aucune infrastructure de
 * signature avancée : ce qui reste à renforcer est documenté ici.
 */
export const CONTRACT_SIGNATURE_STRENGTHENING_REQUIREMENTS = [
  'Aucun artefact de signature cryptographique ni horodatage qualifié n’existe dans le modèle réel : ne pas en inventer dans P0-F.',
  'Ajouter (tranche ultérieure) l’empreinte du document contractuel signé, sa version et la référence du fichier signé.',
  'Ajouter les preuves techniques d’acceptation (adresse IP, agent utilisateur, canal) si la conformité l’exige.',
  'Ajouter la génération et l’archivage du PDF signé (objet de stockage) avant toute valeur juridique renforcée.',
  'Décider la valeur juridique de la double signature électronique et la conservation légale associée.',
] as const;

/**
 * Constat P0-F : le modèle réel matérialise la fin d’un contrat par `COMPLETED`
 * (jamais produit par le DEMO) et la rupture motivée par `TERMINATED`
 * (`dissociateMonth2`, M2+, motif obligatoire). P0-F conserve la protection M1 :
 * en M1, la rupture directe exige un **incident** — domaine non ouvert ici.
 */
export const CONTRACT_FIRST_MONTH_PROTECTION_REQUIREMENTS = [
  'La rupture directe en M1 reste refusée : le modèle réel exige un incident arbitré par LE LABEUR.',
  'Ouvrir le domaine INCIDENT (déclaration, arbitrage ADMIN) dans une tranche dédiée avant toute rupture M1.',
  'Conserver la séparation `INCIDENT` / `SUSPENDED` / `REPLACED` : ces états appartiennent au chemin incident/remplacement, jamais au cycle nominal P0-F.',
] as const;

/**
 * Ce qui reste APRÈS P0-F (étapes d’automatisation/post-contrat), documenté ici
 * pour ne pas être implémenté prématurément :
 *   - passage de l’offre à `FILLED` ;
 *   - candidature retenue `HIRED` / `CONTRACTED` ;
 *   - fermeture automatique des autres candidatures (`CLOSED_OFFER_FILLED`) ;
 *   - notifications générales ;
 *   - avancement mensuel (`advanceContractMonth`), échéancier, commissions,
 *     paiements — cycle paiements/salaire, hors P0-F.
 */
export const POST_CONTRACT_AUTOMATION_REQUIREMENTS = [
  'Passage de l’offre à FILLED et fermeture des autres candidatures (CLOSED_OFFER_FILLED) = étape d’automatisation/post-contrat à venir.',
  'Candidature retenue HIRED / CONTRACTED = étape d’automatisation/post-contrat à venir (P0-F ne modifie aucun statut de candidature).',
  'Notifications générales (CONTRACT_* → destinataires) = moteur Outbox/Queue à venir, aucun consumer en P0-F.',
  'Avancement mensuel (advanceContractMonth), échéancier, commissions (25 % / 75 %) et rapprochement des paiements = cycle paiements/salaire, hors P0-F.',
] as const;

export interface DocumentedContractEvent {
  readonly eventType: ContractLifecycleEventType;
  readonly aggregateType: 'contract';
  readonly emittedBy: 'CREATE' | ContractAction | 'SIGN';
  readonly payload: readonly string[];
  readonly dedupeKey: string;
  readonly sideEffects: readonly string[];
}

/**
 * Contrats d’événements DOCUMENTÉS pour le futur moteur transactional
 * Outbox/Queue (hors périmètre P0-F), selon la convention préparée en P0-E3/E4/E5.
 *
 * P0-F ne crée NI moteur, NI table Outbox, NI consumer, NI notification : ces
 * constantes décrivent uniquement ce que les étapes suivantes devront produire.
 */
export const DOCUMENTED_CONTRACT_EVENTS: readonly DocumentedContractEvent[] = [
  {
    eventType: 'CONTRACT_CREATED',
    aggregateType: 'contract',
    emittedBy: 'CREATE',
    payload: ['contractId', 'proposalId', 'offerId', 'applicationId', 'employerId', 'employeeId', 'occurredAt'],
    dedupeKey: 'contractId + CREATED',
    sideEffects: ['aucune notification en P0-F'],
  },
  {
    eventType: 'CONTRACT_SENT',
    aggregateType: 'contract',
    emittedBy: 'SEND',
    payload: ['contractId', 'proposalId', 'offerId', 'employeeId', 'occurredAt'],
    dedupeKey: 'contractId + SENT',
    sideEffects: ['notifier le candidat destinataire (étape ultérieure)'],
  },
  {
    eventType: 'CONTRACT_SIGNED',
    aggregateType: 'contract',
    emittedBy: 'SIGN',
    payload: ['contractId', 'party', 'employeeId', 'employerId', 'occurredAt'],
    dedupeKey: 'contractId + SIGNED + party',
    sideEffects: ['notifier l’autre partie (étape ultérieure)'],
  },
  {
    eventType: 'CONTRACT_ACTIVATED',
    aggregateType: 'contract',
    emittedBy: 'ACTIVATE',
    payload: ['contractId', 'proposalId', 'offerId', 'applicationId', 'occurredAt'],
    dedupeKey: 'contractId + ACTIVATED',
    sideEffects: ['offre FILLED + candidatures HIRED/CLOSED_OFFER_FILLED = automatisation post-contrat à venir'],
  },
  {
    eventType: 'CONTRACT_ENDED',
    aggregateType: 'contract',
    emittedBy: 'END',
    payload: ['contractId', 'offerId', 'employeeId', 'occurredAt'],
    dedupeKey: 'contractId + ENDED',
    sideEffects: ['clôture normale de la mission (étape ultérieure)'],
  },
  {
    eventType: 'CONTRACT_TERMINATED',
    aggregateType: 'contract',
    emittedBy: 'TERMINATE',
    payload: ['contractId', 'offerId', 'employeeId', 'reason', 'occurredAt'],
    dedupeKey: 'contractId + TERMINATED',
    sideEffects: ['geler l’échéancier et notifier les parties (cycle paiements/automatisation à venir)'],
  },
] as const;
