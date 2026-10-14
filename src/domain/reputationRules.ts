/**
 * LE LABEUR — P0-REPUTATION — catalogue PUR des règles de réputation.
 *
 * Ce module ne touche à aucune base, à aucun réseau et à aucun autre domaine :
 * il transforme un FAIT DOCUMENTÉ DÉJÀ EXISTANT dans le dépôt en ENTRÉE de
 * réputation (sujet, catégorie, direction, impact, explication, règle et
 * version). Il ne produit aucun score : le score est une VUE dérivée, calculée
 * par `src/backend/reputation/reputationLedger.ts`.
 *
 * RÈGLE ABSOLUE DE CETTE TRANCHE : aucun fait, aucun événement et aucune
 * sanction n'est inventé.
 *  - les faits proviennent d'événements RÉELS de l'Outbox (`SALARY_CONFIRMED`,
 *    `CLAIM_RESOLVED`) ou de faits RÉELS déjà PERSISTÉS (`contracts.status =
 *    'COMPLETED'`, entrées d'historique `CONTRACT_COMPLETED` et
 *    `EXECUTION_CONFIRMED`, `salary_confirmations.confirmed_at`,
 *    `claims.status = 'RESOLVED'` avec décision ADMIN) ;
 *  - un litige OUVERT, une preuve demandée, une restriction provisoire, une
 *    plainte ou un remplacement ne produit JAMAIS, à lui seul, une pénalité ;
 *  - `REPUTATION_FACT_COVERAGE` est l'audit de couverture : CHAQUE nombre
 *    d'événements du dépôt y est déclaré, avec la raison exacte de sa règle ou
 *    de son exclusion. Un test vérifie que cette couverture reste exhaustive et
 *    alignée sur `OutboxEventType`.
 */

/* ------------------------------------------------------------------ */
/* Versions                                                             */
/* ------------------------------------------------------------------ */

/**
 * Version du CATALOGUE de règles. Toute entrée persistée conserve la version qui
 * l'a produite : une évolution de règles ne réécrit jamais l'histoire.
 */
export const REPUTATION_RULES_VERSION = 'P0-REPUTATION-1';

/**
 * Version de la VUE dérivée (mode de calcul du score : somme déterministe des
 * impacts des seules entrées ACTIVE). Le ledger reste la source de vérité.
 */
export const REPUTATION_SCORE_VERSION = 'P0-REPUTATION-SCORE-1';

/** Bornes d'impact : un poids unitaire reste petit, entier et vérifiable. */
export const REPUTATION_MAX_ABSOLUTE_IMPACT = 100;

/* ------------------------------------------------------------------ */
/* Types du domaine                                                     */
/* ------------------------------------------------------------------ */

export const REPUTATION_CATEGORY_VALUES = [
  'MISSION_EXECUTION',
  'PAYMENT_RELIABILITY',
  'DISPUTE_OUTCOME',
] as const;
export type ReputationCategory = (typeof REPUTATION_CATEGORY_VALUES)[number];

export const REPUTATION_DIRECTION_VALUES = ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] as const;
export type ReputationDirection = (typeof REPUTATION_DIRECTION_VALUES)[number];

export const REPUTATION_PROVENANCE_VALUES = ['EVENT', 'RECONCILIATION', 'ADMIN_DECISION'] as const;
export type ReputationProvenance = (typeof REPUTATION_PROVENANCE_VALUES)[number];

export const REPUTATION_STATUS_VALUES = ['ACTIVE', 'REVERSED'] as const;
export type ReputationStatus = (typeof REPUTATION_STATUS_VALUES)[number];

export const REPUTATION_SOURCE_ENTITY_TYPES = [
  'CONTRACT',
  'CLAIM',
  'PAYMENT',
  'REPLACEMENT',
  'ACCOUNT',
] as const;
export type ReputationSourceEntityType = (typeof REPUTATION_SOURCE_ENTITY_TYPES)[number];

/** Rôle documenté du sujet dans le fait. Aucun autre rôle n'existe. */
export const REPUTATION_PARTY_VALUES = ['WORKER', 'EMPLOYER', 'CLAIMANT', 'RESPONDENT'] as const;
export type ReputationParty = (typeof REPUTATION_PARTY_VALUES)[number];

/**
 * Faits RÉELS admis comme source d'une entrée. Les noms sont ceux du dépôt :
 * `CONTRACT_COMPLETED` et `EXECUTION_CONFIRMED` sont les libellés RÉELS des
 * entrées d'historique de contrat ; `SALARY_CONFIRMED` et `CLAIM_RESOLVED` sont
 * les types RÉELS d'événements de l'Outbox.
 */
export const REPUTATION_FACT_TYPES = [
  'CONTRACT_COMPLETED',
  'EXECUTION_CONFIRMED',
  'SALARY_CONFIRMED',
  'CLAIM_RESOLVED',
] as const;
export type ReputationFactType = (typeof REPUTATION_FACT_TYPES)[number];

/** Fait documenté, réduit aux seules données nécessaires (minimisation). */
export interface ReputationFact {
  readonly factType: ReputationFactType;
  readonly sourceEntityType: ReputationSourceEntityType;
  readonly sourceEntityId: string;
  /** Identifiant de la preuve source (événement Outbox ou entrée d'historique). */
  readonly sourceEventId?: string;
  readonly occurredAt: string;
  /** Acteur du fait : identifiant utilisateur, ou `SYSTEM`. */
  readonly actorId: string;
  /**
   * Décision ADMIN documentée ? Seul `CLAIM_RESOLVED` en porte : une
   * auto-résolution déterministe (`actorType: 'SYSTEM'`) n'attribue aucune faute
   * et ne produit donc AUCUNE entrée.
   */
  readonly adminDecision?: boolean;
}

export interface ReputationRule {
  readonly code: string;
  readonly ruleVersion: typeof REPUTATION_RULES_VERSION;
  readonly factType: ReputationFactType;
  /** Sujet visé par la règle. */
  readonly party: ReputationParty;
  readonly category: ReputationCategory;
  /** Impact entier signé, dérivé du fait — jamais d'un profil ou d'un attribut. */
  readonly impact: number;
  /** Phrase d'explication DÉTERMINISTE, construite sans texte libre externe. */
  readonly explanation: string;
}

/**
 * Poids du catalogue. Ils sont ENTIERS, PETITS, DOCUMENTÉS et VERSIONNÉS : un
 * score dérivé reste lisible et recalculable, jamais opaque. Aucun de ces poids
 * ne provient d'un attribut de personne : ils qualifient uniquement le FAIT.
 */
export const REPUTATION_IMPACTS = {
  /**
   * Contrat terminé (`COMPLETED`) : la mission a été menée jusqu'à sa fin par
   * les deux parties. Fait persisté, donc positif modéré pour chacune.
   */
  CONTRACT_COMPLETED_PARTY: 3,
  /**
   * Exécution confirmée par une partie (`EXECUTION_CONFIRMED`) : confirmation
   * explicite de fin d'exécution, distincte de la clôture du contrat.
   */
  EXECUTION_CONFIRMED_PARTY: 2,
  /**
   * Salaire confirmé reçu par le salarié (`SALARY_CONFIRMED`, OTP + nonce
   * persistés) : seul niveau de preuve retenu pour la fiabilité de paiement de
   * l'employeur. Une DÉCLARATION de paiement, même vérifiée administrativement,
   * n'ouvre droit à AUCUNE entrée positive.
   */
  SALARY_CONFIRMED_EMPLOYER: 3,
  /**
   * Décision ADMIN documentée en faveur d'une partie (`CLAIM_RESOLVED` par une
   * décision ADMIN) : la position de cette partie a été retenue.
   */
  ADMIN_DECISION_FAVORABLE: 1,
  /**
   * Décision ADMIN documentée défavorable au défendeur : les faits reprochés ont
   * été retenus après examen. Seul cas NÉGATIF du catalogue de cette tranche.
   */
  ADMIN_DECISION_UNFAVORABLE: -4,
} as const;

/* ------------------------------------------------------------------ */
/* Règles                                                               */
/* ------------------------------------------------------------------ */

export const REPUTATION_RULES: readonly ReputationRule[] = [
  {
    code: 'CONTRACT_COMPLETED_PARTY',
    ruleVersion: REPUTATION_RULES_VERSION,
    factType: 'CONTRACT_COMPLETED',
    party: 'WORKER',
    category: 'MISSION_EXECUTION',
    impact: REPUTATION_IMPACTS.CONTRACT_COMPLETED_PARTY,
    explanation: 'Contrat mené jusqu’à sa fin : mission réalisée (contrat documenté, sans appréciation de qualité).',
  },
  {
    code: 'CONTRACT_COMPLETED_PARTY',
    ruleVersion: REPUTATION_RULES_VERSION,
    factType: 'CONTRACT_COMPLETED',
    party: 'EMPLOYER',
    category: 'MISSION_EXECUTION',
    impact: REPUTATION_IMPACTS.CONTRACT_COMPLETED_PARTY,
    explanation: 'Contrat mené jusqu’à sa fin : mission réalisée (contrat documenté, sans appréciation de qualité).',
  },
  {
    code: 'EXECUTION_CONFIRMED_PARTY',
    ruleVersion: REPUTATION_RULES_VERSION,
    factType: 'EXECUTION_CONFIRMED',
    party: 'WORKER',
    category: 'MISSION_EXECUTION',
    impact: REPUTATION_IMPACTS.EXECUTION_CONFIRMED_PARTY,
    explanation: 'Fin d’exécution confirmée par une partie du contrat (fait d’historique documenté).',
  },
  {
    code: 'EXECUTION_CONFIRMED_PARTY',
    ruleVersion: REPUTATION_RULES_VERSION,
    factType: 'EXECUTION_CONFIRMED',
    party: 'EMPLOYER',
    category: 'MISSION_EXECUTION',
    impact: REPUTATION_IMPACTS.EXECUTION_CONFIRMED_PARTY,
    explanation: 'Fin d’exécution confirmée par une partie du contrat (fait d’historique documenté).',
  },
  {
    code: 'SALARY_RECEIPT_CONFIRMED_EMPLOYER',
    ruleVersion: REPUTATION_RULES_VERSION,
    factType: 'SALARY_CONFIRMED',
    party: 'EMPLOYER',
    category: 'PAYMENT_RELIABILITY',
    impact: REPUTATION_IMPACTS.SALARY_CONFIRMED_EMPLOYER,
    explanation: 'Salaire confirmé reçu par le salarié (confirmation persistée) : paiement documenté au niveau de preuve requis.',
  },
  {
    code: 'ADMIN_DECISION_FAVORABLE_CLAIMANT',
    ruleVersion: REPUTATION_RULES_VERSION,
    factType: 'CLAIM_RESOLVED',
    party: 'CLAIMANT',
    category: 'DISPUTE_OUTCOME',
    impact: REPUTATION_IMPACTS.ADMIN_DECISION_FAVORABLE,
    explanation: 'Décision ADMIN rendue sur un litige : la demande examinée a été retenue après instruction.',
  },
  {
    code: 'ADMIN_DECISION_UNFAVORABLE_RESPONDENT',
    ruleVersion: REPUTATION_RULES_VERSION,
    factType: 'CLAIM_RESOLVED',
    party: 'RESPONDENT',
    category: 'DISPUTE_OUTCOME',
    impact: REPUTATION_IMPACTS.ADMIN_DECISION_UNFAVORABLE,
    explanation: 'Décision ADMIN rendue sur un litige : les faits examinés ont été retenus après instruction.',
  },
] as const;

/** Règle applicable à un fait et à une partie, ou `null` (aucune règle). */
export function findReputationRule(
  factType: ReputationFactType,
  party: ReputationParty,
): ReputationRule | null {
  return REPUTATION_RULES.find(rule => rule.factType === factType && rule.party === party) ?? null;
}

/** Codes de règles réellement déclarés (unicité du couple fait/partie). */
export const REPUTATION_RULE_CODES: readonly string[] = [
  ...new Set(REPUTATION_RULES.map(rule => rule.code)),
];

/**
 * Direction dérivée de l'impact. Aucune entrée n'est décorée d'une appréciation :
 * le signe suffit à distinguer positif, négatif et neutre.
 */
export function reputationDirectionFromImpact(impact: number): ReputationDirection {
  if (impact > 0) return 'POSITIVE';
  if (impact < 0) return 'NEGATIVE';
  return 'NEUTRAL';
}

/* ------------------------------------------------------------------ */
/* Audit de couverture : chaque source, avec sa règle ou sa raison      */
/* ------------------------------------------------------------------ */

export type ReputationCoverageStatus = 'MAPPED' | 'NO_REPUTATION_RULE';

export interface ReputationFactCoverage {
  /** Nom RÉEL de l'événement ou du fait dans le dépôt. */
  readonly source: string;
  readonly status: ReputationCoverageStatus;
  /** Producteur réel (fichier) ou mécanisme de persistance, ou `null`. */
  readonly producer: string | null;
  /** Raison obligatoire d'une absence de règle. */
  readonly reason?: string;
  /** Règle(s) applicable(s) quand le fait est `MAPPED`. */
  readonly ruleCodes?: readonly string[];
}

/**
 * Couverture EXHAUSTIVE des sources de faits. Trois familles y figurent :
 *  1. `OutboxEventType` (contrat d'événements du dépôt) ;
 *  2. les événements de la fondation d'automatisation (`NOTIFICATION_*`) ;
 *  3. les faits PERSISTÉS sans producteur d'événement (`contracts.history`,
 *     `contracts.status`, `salary_confirmations`, `claims`).
 *
 * Un événement absent de cette table est un défaut d'audit : un test vérifie
 * l'exhaustivité contre `src/backend/productionContracts.ts`.
 */
export const REPUTATION_FACT_COVERAGE: readonly ReputationFactCoverage[] = [
  /* ---- Faits PERSISTÉS porteurs d'une règle ---- */
  {
    source: 'CONTRACT_COMPLETED',
    status: 'MAPPED',
    producer: 'src/backend/repositories/contractRepository.ts (entrée d’historique `CONTRACT_COMPLETED`, transition END → COMPLETED)',
    ruleCodes: ['CONTRACT_COMPLETED_PARTY'],
  },
  {
    source: 'EXECUTION_CONFIRMED',
    status: 'MAPPED',
    producer: 'src/backend/repositories/contractRepository.ts (entrée d’historique `EXECUTION_CONFIRMED`, commande confirm-execution)',
    ruleCodes: ['EXECUTION_CONFIRMED_PARTY'],
  },

  /* ---- Événements Outbox porteurs d'une règle ---- */
  {
    source: 'SALARY_CONFIRMED',
    status: 'MAPPED',
    producer: 'src/backend/payments/salaryConfirmation.ts (confirmation OTP/nonce du salarié)',
    ruleCodes: ['SALARY_RECEIPT_CONFIRMED_EMPLOYER'],
  },
  {
    source: 'CLAIM_RESOLVED',
    status: 'MAPPED',
    producer: 'src/backend/disputes/claimRepository.ts (décision ADMIN) ET src/backend/disputes/claimAutomation.ts (auto-résolution déterministe, `actorType: SYSTEM`)',
    ruleCodes: ['ADMIN_DECISION_FAVORABLE_CLAIMANT', 'ADMIN_DECISION_UNFAVORABLE_RESPONDENT'],
    reason: 'Seule une décision ADMIN (`actorType: ADMIN`) produit des entrées. L’auto-résolution `SYSTEM` constate mécaniquement un paiement confirmé sans attribuer aucune faute (`faultAttributed: false`) : aucune entrée.',
  },

  /* ---- Litige : aucun fait définitif hors décision ADMIN ---- */
  {
    source: 'CLAIM_CREATED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts',
    reason: 'Une plainte n’est jamais une sanction : exposition d’une accusation non tranchée interdite.',
  },
  {
    source: 'CLAIM_EVIDENCE_REQUESTED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts',
    reason: 'Demande de preuve : étape procédurale interne, aucune faute établie.',
  },
  {
    source: 'CLAIM_EVIDENCE_SUBMITTED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts',
    reason: 'Fourniture de preuve : aucun constat définitif, aucune sanction.',
  },
  {
    source: 'CLAIM_DEADLINE_REACHED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimAutomation.ts',
    reason: 'Échéance de preuve atteinte : « aucun manquement n’est présumé » (libellé réel du mécanisme).',
  },
  {
    source: 'CLAIM_ESCALATED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts + claimAutomation.ts',
    reason: 'Transmission à l’administration : aucune décision rendue, donc aucune entrée.',
  },
  {
    source: 'CLAIM_RESTRICTION_APPLIED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts',
    reason: 'Restriction PROVISOIRE et réversible : une mesure temporaire ne produit jamais de réputation définitive.',
  },
  {
    source: 'CLAIM_RESTRICTION_RELEASED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts',
    reason: 'Levée d’une mesure provisoire : aucun fait de faute.',
  },
  {
    source: 'CLAIM_REJECTED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts',
    reason: 'Un litige rejeté ne sanctionne JAMAIS le demandeur : exercer un recours n’est pas un manquement.',
  },

  /* ---- Remplacement : jamais une pénalité en soi ---- */
  {
    source: 'REPLACEMENT_CREATED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/disputes/claimRepository.ts (décision ADMIN REPLACE)',
    reason: 'Être remplacé n’est pas un fait de faute : la faute éventuelle est établie par la décision ADMIN du litige (`CLAIM_RESOLVED`), pas par le remplacement.',
  },
  {
    source: 'CANDIDATE_TRANSFERRED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Événement déclaré mais jamais produit : le candidat postule et accepte une proposition. Aucune règle inventée.',
  },

  /* ---- Paiement : niveaux de preuve distingués ---- */
  {
    source: 'PAYMENT_DECLARED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts',
    reason: 'Une DÉCLARATION n’est pas une réception : aucun fait suffisant pour une réputation positive.',
  },
  {
    source: 'PAYMENT_SUBMITTED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts (alias déclaré de PAYMENT_DECLARED)',
    reason: 'Alias de déclaration : même niveau de preuve insuffisant.',
  },
  {
    source: 'PAYMENT_PENDING_VERIFICATION',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts',
    reason: 'Déclaration en attente d’examen : aucune conclusion possible.',
  },
  {
    source: 'PAYMENT_APPROVED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts (vérification locale)',
    reason: 'Vérification administrative d’une déclaration : elle n’établit pas la réception effective par le salarié.',
  },
  {
    source: 'PAYMENT_VERIFIED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts (alias déclaré de PAYMENT_APPROVED)',
    reason: 'Même niveau de preuve : seule `SALARY_CONFIRMED` atteste la réception confirmée par le salarié.',
  },
  {
    source: 'PAYMENT_PAID',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts (rapprochement local, AUCUN mouvement de fonds)',
    reason: 'Le statut `PAID` est un rapprochement local déclaré `movedFunds: false` : il ne prouve pas la réception.',
  },
  {
    source: 'PAYMENT_REJECTED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts',
    reason: 'Rejet administratif d’une déclaration : irrégularité corrigible, pas une faute définitive. Aucune sanction automatique.',
  },
  {
    source: 'PAYMENT_DUE',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/paymentRepository.ts',
    reason: 'Échéance atteinte : fait de calendrier, pas un manquement.',
  },
  {
    source: 'PAYMENT_OVERDUE_J3',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/automation/contractActivation.ts (rappel J+3)',
    reason: 'Rappel opérationnel J+3 (statuts `DUE`/`REJECTED`). Aucune décision d’instruction ne l’accompagne : pénaliser automatiquement un retard serait une sanction non tranchée. Une entrée réversible exigerait une décision d’exploitation explicite.',
  },
  {
    source: 'SALARY_CONFIRMATION_REQUESTED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/payments/salaryConfirmation.ts',
    reason: 'Demande de confirmation : opération interne, aucun fait de réputation.',
  },
  {
    source: 'PAYMENT_RECONCILIATION_BATCH_REQUESTED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/payments/paymentReconciliationBatch.ts',
    reason: 'Traitement interne de rapprochement : hors réputation.',
  },

  /* ---- Contrat : seuls la fin et la confirmation d’exécution comptent ---- */
  {
    source: 'CONTRACT_ACTIVATED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/repositories/contractRepository.ts (P0-AUTO-2)',
    reason: 'L’activation est un début d’engagement : elle ne prouve aucune exécution.',
  },
  {
    source: 'WEBRTC_SESSION_INVITED',
    status: 'NO_REPUTATION_RULE',
    producer: 'src/backend/webrtc/webrtcRepository.ts',
    reason: 'Une invitation à un appel est une action de communication, jamais un fait de performance ou de faute.',
  },
  {
    source: 'CONTRACT_SIGNED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Signature déclarée dans les effets documentés, sans producteur réel dans cette tranche ; et une signature ne prouve pas une exécution.',
  },
  {
    source: 'CONTRACT_CREATED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Création d’un document : aucun effet de réputation (« no asynchronous effect in P0-F »).',
  },
  {
    source: 'CONTRACT_SENT',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Envoi pour signature : acte préparatoire sans exécution.',
  },
  {
    source: 'CONTRACT_ENDED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Événement DÉCLARÉ mais sans producteur dans cette tranche : le fait réel est persisté sous `contracts.status = COMPLETED` et l’entrée d’historique `CONTRACT_COMPLETED`, qui portent la règle.',
  },
  {
    source: 'CONTRACT_TERMINATED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'La rupture peut être le fait de l’UNE ou l’AUTRE partie : sans décision ADMIN attribuant les faits, aucune entrée n’est produite.',
  },

  /* ---- Incident ---- */
  {
    source: 'INCIDENT_OPENED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Un incident ouvert n’est pas un incident établi : seule une décision ADMIN sur le Claim produit une entrée.',
  },
  {
    source: 'INCIDENT_DECIDED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Aucun producteur réel : les décisions administrateur sont produites sous `CLAIM_RESOLVED` / `CLAIM_REJECTED`.',
  },

  /* ---- Comptes ---- */
  {
    source: 'ACCOUNT_BLOCKED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Aucun producteur serveur réel (commande ADMIN non ouverte) ; un blocage de compte est déjà une mesure opérationnelle tracée, non un fait de réputation.',
  },
  {
    source: 'ACCOUNT_UNBLOCKED',
    status: 'NO_REPUTATION_RULE',
    producer: null,
    reason: 'Idem : mesure opérationnelle, sans producteur serveur réel.',
  },

  /* ---- Candidature / proposition : hors réputation ---- */
  { source: 'APPLICATION_SUBMITTED', status: 'NO_REPUTATION_RULE', producer: 'src/backend/repositories/applicationRepository.ts', reason: 'Candidater est un droit : aucun fait de réputation.' },
  { source: 'APPLICATION_EXAMINED', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Examen interne d’une candidature : aucun fait.' },
  { source: 'APPLICATION_SHORTLISTED', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Sélection intermédiaire : aucun fait.' },
  { source: 'APPLICATION_REJECTED', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Un refus de candidature n’est jamais une faute : aucune entrée, dans un sens ni dans l’autre.' },
  { source: 'APPLICATION_WITHDRAWN', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Retrait d’une candidature avant engagement : aucun fait.' },
  { source: 'PROPOSAL_SENT', status: 'NO_REPUTATION_RULE', producer: 'src/backend/repositories/proposalRepository.ts', reason: 'Proposition émise : aucun engagement exécuté.' },
  { source: 'PROPOSAL_ACCEPTED', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Proposition acceptée : engagement futur, pas d’exécution.' },
  { source: 'PROPOSAL_DECLINED', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Refuser une proposition est un droit : aucune sanction.' },
  { source: 'PROPOSAL_EXPIRED', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Expiration d’une proposition : aucun fait imputable.' },

  /* ---- Événements de la fondation d'automatisation ---- */
  { source: 'NOTIFICATION_CREATED', status: 'NO_REPUTATION_RULE', producer: 'src/backend/automation/foundation.ts', reason: 'Événement technique interne.' },
  { source: 'NOTIFICATION_REQUIRED', status: 'NO_REPUTATION_RULE', producer: 'src/backend/automation/contractActivation.ts', reason: 'Événement technique de rappel.' },
  { source: 'NOTIFICATION_SENT', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Événement technique de canal.' },
  { source: 'NOTIFICATION_FAILED', status: 'NO_REPUTATION_RULE', producer: null, reason: 'Événement technique de canal.' },
];

/** Sources réellement porteuses d'une règle (alignées sur les règles déclarées). */
export const REPUTATION_MAPPED_FACT_SOURCES: readonly string[] = REPUTATION_FACT_COVERAGE
  .filter(entry => entry.status === 'MAPPED')
  .map(entry => entry.source);

/**
 * Événements Outbox observés par le processeur de réputation. Liste EXÉCUTABLE
 * (le worker ne route vers le processeur que les types qu'il déclare) : elle est
 * l'exact pendant des sources `MAPPED` produites par l'Outbox.
 */
export const REPUTATION_AUTOMATION_EVENT_TYPES: readonly string[] = [
  'SALARY_CONFIRMED',
  'CLAIM_RESOLVED',
];

/* ------------------------------------------------------------------ */
/* Interdits : aucun attribut protégé, aucune donnée sensible            */
/* ------------------------------------------------------------------ */

/**
 * Champs INTERDITS dans toute entrée de réputation : origine, ethnie, religion,
 * opinion, appartenance syndicale, santé, vie sexuelle, données génétiques,
 * biométrie, et toute autre caractéristique protégée. Le ledger ne modélise
 * aucune colonne correspondante ; ce garde-fou empêche qu'un champ de ce type
 * soit introduit par une évolution ultérieure.
 */
export const REPUTATION_PROTECTED_ATTRIBUTE_FIELDS: readonly string[] = [
  'origin', 'ethnicity', 'ethnicOrigin', 'race', 'religion', 'religiousBelief',
  'opinion', 'politicalOpinion', 'unionMembership', 'tradeUnion', 'health',
  'healthData', 'medicalData', 'disability', 'sexualLife', 'sexuality',
  'sexualOrientation', 'geneticData', 'biometric', 'biometricData',
  'gender', 'sex', 'maritalStatus', 'familySituation', 'nationality',
  'socialOrigin', 'ancestry', 'photo', 'faceRecognition', 'criminalRecord',
  'reputationScore', 'qualityRating', 'personalRating',
] as const;

const PROTECTED_FIELD_PATTERN = new RegExp(
  `^(${REPUTATION_PROTECTED_ATTRIBUTE_FIELDS.map(field => field.toLowerCase()).join('|')})$`,
);

/**
 * Garde-fou exécutable : refuse toute charge utile d'entrée qui porterait un
 * champ protégé ou une appréciation personnelle. Les seuls champs admis sont
 * ceux du fait documenté et de la règle.
 */
export function assertNoProtectedAttributeFields(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (PROTECTED_FIELD_PATTERN.test(key.toLowerCase())) {
      throw new Error(`Champ protégé interdit dans une entrée de réputation : ${key}`);
    }
  }
}
