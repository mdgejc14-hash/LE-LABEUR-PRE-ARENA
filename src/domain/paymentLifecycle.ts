/**
 * LE LABEUR — P0-PAY-1 — cycle métier du PAIEMENT (règles pures).
 *
 * Module PUR : aucune dépendance serveur, aucun accès base, aucun effet de bord,
 * AUCUN appel sortant. Il transpose les règles qui EXISTENT déjà dans le modèle
 * réel et signale explicitement celles qui n'existent pas — jamais il n'en
 * invente.
 *
 * Sources réelles transposées ici (aucune autre) :
 *  - échéancier, montants et cadence : `src/domain/businessRules.ts`
 *    (`buildPaymentSchedule`, `isPaymentDue`, `addMonthsClamped`,
 *    `calculateFirstMonthCommission` = 25 % en M1 puis 0 %) ;
 *  - statuts de paiement du contrat : `SalaryPaymentStatus` /
 *    `CommissionPaymentStatus` (`src/types/index.ts`) ;
 *  - déclaration employeur : `MockRepository.confirmMonthlyAction`
 *    (`DECLARE_SALARY` : `if (!['DUE','REJECTED'].includes(entry.salaryStatus) ||
 *    !isPaymentDue(...)) throw …`, montant attendu, transaction obligatoire) ;
 *  - décision administrative : `MockRepository.approvePaymentDeclaration` /
 *    `rejectPaymentDeclaration` (STATUT `SUBMITTED` seulement, motif de rejet
 *    obligatoire via `normalizeRejectionReason`, `reviewedBy` / `reviewedAt`) ;
 *  - avancement mensuel : `MockRepository.advanceContractMonth` (`currentMonth`,
 *    point de contrôle, entrée de grand livre M2+, `ADVANCE_MONTH`) ;
 *  - types d'événements déjà déclarés : `OutboxEventType`
 *    (`src/backend/productionContracts.ts`) et
 *    `OUTBOX_EFFECT_CONTRACTS` (`src/backend/services/outbox.ts`) ;
 *  - actions d'audit et échéances : `src/domain/contractScheduleAutomation.ts`
 *    (`AUTOMATION_AUDIT_ACTIONS`, `DeadlineStatus`,
 *    `PRE_DUE_REMINDER_CONFIGURATION`, `SCHEDULE_PERIODICITY_RULES`).
 *
 * Ce que ce module REFUSE de produire (règles absentes du modèle) :
 *  - aucun paiement réel, aucun débit, aucun Mobile Money, aucun opérateur,
 *    aucun agrégateur, aucun webhook fournisseur (`PAYMENT_PROVIDER_INTEGRATION`
 *    et `REAL_PAYMENT_OUT_OF_SCOPE`) ;
 *  - aucune cadence pour `Hebdomadaire` / `Forfait mission` ;
 *  - aucune avance de rappel pré-échéance décidée arbitrairement
 *    (`resolvePreDueLeadTimeMs` ne fournit JAMAIS de valeur par défaut) ;
 *  - aucun versement partiel, aucun prorata, aucun nouveau pourcentage :
 *    `commission_percentage = 25` est LU, jamais réécrit ;
 *  - aucun KYC, aucune collecte d'identité, aucun R2 documentaire ;
 *  - aucun `FILLED` / `HIRED` / `CONTRACTED` / `CLOSED_OFFER_FILLED`.
 */

import type {
  CommissionPaymentStatus,
  ExternalPaymentMethod,
  PaymentScheduleEntry,
  SalaryPaymentStatus,
} from '../types';
import { EXTERNAL_PAYMENT_METHODS } from '../types';
import {
  MS_PER_DAY,
  PRE_DUE_REMINDER_CONFIGURATION,
  toUtcMidnight,
  resolveSchedulePeriodicityRule,
} from './contractScheduleAutomation';
import {
  calculateFirstMonthCommission,
  calculateFirstMonthEmployeeShare,
  calculateLaterMonthCommission,
  calculateLaterMonthEmployeeShare,
} from './businessRules';

/* ------------------------------------------------------------------ */
/* 1. Statuts et natures — domaines RÉELS, extension explicite          */
/* ------------------------------------------------------------------ */

/**
 * Natures de paiement du modèle, STRICTEMENT séparées.
 *
 * `PLATFORM_FEE` est la commission due à LE LABEUR par l'EMPLOYEUR (règle
 * absolue du dépôt : le salarié ne paie jamais) ; `SALARY` est la part versée
 * par l'employeur au travailleur. Aucun flux ne mélange les deux : la nature
 * d'une écriture est dérivée du paiement visé, jamais du client.
 */
export const PAYMENT_TYPE_VALUES = ['SALARY', 'PLATFORM_FEE'] as const;

export type PaymentType = (typeof PAYMENT_TYPE_VALUES)[number];

/** Libellés du plan fonctionnel → nomenclature réellement conservée du code. */
export const PAYMENT_TYPE_MAPPING = [
  {
    plan: 'commission / PLATFORM_FEE',
    code: 'PLATFORM_FEE',
    detail:
      'Commission LE LABEUR (25 % du premier mois, 0 % ensuite) déclarée et vérifiée par l’ADMIN. '
      + 'Le contrat de données DEMO l’appelait `commission` ; le type `CommissionPaymentStatus` '
      + 'et le grand livre `contracts.commission_ledger` restent la projection contractuelle.',
  },
  {
    plan: 'salaire / SALARY',
    code: 'SALARY',
    detail:
      'Part salariale versée HORS plateforme par l’employeur au travailleur. '
      + 'Suivi par le même cycle, jamais confondu avec la commission.',
  },
] as const;

/**
 * Cycle complet de l'agrégat Payment.
 *
 * `VERIFIED` est l'état intermédiaire exigé par la tranche (« déclaration
 * vérifiée, paiement pas encore considéré comme payé »). Il n'existe PAS dans
 * le domaine `SalaryPaymentStatus` / `CommissionPaymentStatus` du contrat : la
 * projection contractuelle est donc explicite
 * (`CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS`), et le domaine SQL du contrat
 * n'est pas élargi.
 */
export const PAYMENT_LIFECYCLE_STATUS_VALUES = [
  'SCHEDULED',
  'DUE',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'PAID',
  'REJECTED',
] as const;

export type PaymentLifecycleStatus = (typeof PAYMENT_LIFECYCLE_STATUS_VALUES)[number];

/** Garde-fou de compilation : l'union déclarée couvre exactement le domaine. */
export const PAYMENT_DOMAIN_EXACTNESS = [
  true as PaymentLifecycleStatus extends (typeof PAYMENT_LIFECYCLE_STATUS_VALUES)[number] ? true : false,
  true as PaymentType extends (typeof PAYMENT_TYPE_VALUES)[number] ? true : false,
] as const;

/**
 * États sémantiques du cycle (doc de l'ÉTAPE 3) — chaque statut de l'agrégat
 * répond exactement à une question métier, aucune autre valeur n'existe.
 */
export const PAYMENT_STATUS_MEANINGS: Record<PaymentLifecycleStatus, string> = {
  SCHEDULED: 'échéance prévue (issue de l’échéancier), rien n’est exigible ni déclaré',
  DUE: 'échéance due : la bascule est produite par l’automatisation, jamais par l’API',
  PENDING_VERIFICATION: 'déclaration employeur reçue, en cours de vérification',
  VERIFIED: 'déclaration vérifiée/rapprochée localement, paiement pas encore considéré comme payé',
  PAID: 'paiement considéré comme payé au sens métier (aucun mouvement réel de fonds)',
  REJECTED: 'déclaration rejetée, motif obligatoire, régularisation possible par une nouvelle déclaration',
};

/**
 * Projection sur les colonnes RÉELLES du contrat (`payment_schedule[].*Status`,
 * `commission_ledger[].status`, `contracts.commission_status`), dont le domaine
 * SQL (migration 0003) ne contient pas `VERIFIED`.
 *
 * choice explicite, jamais une perte silencieuse : `VERIFIED` reste
 * `PENDING_VERIFICATION` côté contrat tant que le paiement n'est pas `PAID`.
 */
export const CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS: Record<
  PaymentLifecycleStatus,
  SalaryPaymentStatus | CommissionPaymentStatus
> = {
  SCHEDULED: 'SCHEDULED',
  DUE: 'DUE',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'PENDING_VERIFICATION',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
};

/** Statuts terminaux du cycle : aucune écriture ultérieure n'est admise. */
export const PAYMENT_TERMINAL_STATUSES = ['PAID'] as const;

/**
 * Refus opposé à TOUTE action sur un paiement terminal. Le motif est porté par
 * l'erreur HTTP et par l'audit : `PAID` n'est jamais rouvert par le cycle (une
 * régularisation après paiement appartiendrait à une autre tranche, elle n'est
 * donc pas proposée ici).
 */
export const PAYMENT_TERMINAL_REFUSAL_REASON = 'Un paiement `PAID` est terminal : le cycle ne le rouvre, '
  + 'ne le redéclare et ne le rejette pas.';

/** Statuts où le paiement n'est plus exigible (réglé ou sans objet). */
export const PAYMENT_SETTLED_STATUSES = ['VERIFIED', 'PAID'] as const;

/* ------------------------------------------------------------------ */
/* 2. Agrégat Payment (aucun champ inutile)                            */
/* ------------------------------------------------------------------ */

/** Métadonnées de preuve d'une déclaration (aucun fichier, aucun R2). */
export interface PaymentProofMetadata {
  documentId?: string;
  fileName?: string;
  note?: string;
}

/** Déclaration d'un paiement hors plateforme, ajoutée (jamais réécrite). */
export interface PaymentDeclarationAttempt {
  declarationId: string;
  paymentId: string;
  contractId: string;
  periodKey: string;
  paymentType: PaymentType;
  attemptNumber: number;
  amount: number;
  currency: string;
  reference: string;
  externalTransactionId?: string;
  provider?: string;
  proof?: PaymentProofMetadata;
  comment?: string;
  submittedAt: string;
  submittedBy: string;
  outcome: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/** L'agrégat du cycle : exactement les champs utiles au métier. */
export interface Payment {
  paymentId: string;
  contractId: string;
  employerId: string;
  candidateId: string;
  paymentType: PaymentType;
  /** Identifiant de l'entrée d'échéancier (`PaymentScheduleEntry.id`). */
  scheduleEntryId: string;
  monthNumber: number;
  periodKey: string;
  amount: number;
  currency: string;
  scheduledAt: string;
  dueAt: string;
  status: PaymentLifecycleStatus;
  submittedAt?: string;
  submittedBy?: string;
  reference?: string;
  proof?: PaymentProofMetadata;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  /** Champ PRÉPARÉ pour le futur `PaymentProviderAdapter` : jamais vérifié en ligne. */
  externalTransactionId?: string;
  /** Champ PRÉPARÉ idem : le vocabulaire réel `ExternalPaymentMethod`, rien d'autre. */
  provider?: string;
  declarationCount: number;
  currentDeclarationId?: string;
  /** Tentatives antérieures conservées (ÉTAPE 9 : rien n'est écrasé). */
  declarations?: PaymentDeclarationAttempt[];
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* 3. Transitions protégées                                            */
/* ------------------------------------------------------------------ */

export type PaymentAction =
  | 'MARK_DUE'
  | 'DECLARE_PAYMENT'
  | 'VERIFY_DECLARATION'
  | 'CONFIRM_PAID'
  | 'REJECT_DECLARATION';

export const PAYMENT_ACTION_VALUES = [
  'MARK_DUE',
  'DECLARE_PAYMENT',
  'VERIFY_DECLARATION',
  'CONFIRM_PAID',
  'REJECT_DECLARATION',
] as const;

export type PaymentParty = 'SYSTEM' | 'EMPLOYER' | 'ADMIN';

export interface PaymentTransitionRule {
  readonly action: PaymentAction;
  /** Qui déclenche : le worker d'automatisation, l'employeur, ou l'ADMIN. */
  readonly actor: PaymentParty;
  readonly from: readonly PaymentLifecycleStatus[];
  readonly to: PaymentLifecycleStatus;
  /** Événement d'audit persisté dans `automation_audit_ledger` (`action`). */
  readonly auditAction: string;
  /** Entrée AJOUTÉE à `contracts.history` (historique métier conservé). */
  readonly historyEvent: string;
  /** Événements écrits dans l'outbox durable (aucun consumer dans cette tranche). */
  readonly events: readonly string[];
  /** Un motif est obligatoire (rejet). */
  readonly requiresReason?: boolean;
  /** La transition est produite par une commande HTTP (et non par un job). */
  readonly viaApi?: boolean;
  /** Clé d'idempotence de référence (documentée, jamais devinée). */
  readonly dedupeKey: string;
}

/**
 * Matrice du cycle. Toute valeur hors matrice est refusée — notamment
 * `PAID → …`, `DUE → PAID`, `SCHEDULED → PAID`, `REJECTED → PAID`.
 */
export const PAYMENT_TRANSITION_RULES: Record<PaymentAction, PaymentTransitionRule> = {
  MARK_DUE: {
    action: 'MARK_DUE',
    actor: 'SYSTEM',
    from: ['SCHEDULED'],
    to: 'DUE',
    auditAction: 'PAYMENT_DUE',
    historyEvent: 'PAYMENT_DUE',
    events: ['PAYMENT_DUE'],
    dedupeKey: 'paymentId + DUE',
  },
  DECLARE_PAYMENT: {
    action: 'DECLARE_PAYMENT',
    actor: 'EMPLOYER',
    // `REJECTED` n'est autorisé que parce que le modèle réel le prévoit
    // explicitement (`confirmMonthlyAction` : `['DUE','REJECTED']`), et UNIQUEMENT
    // par une NOUVELLE déclaration (tentative suivante) — jamais par une
    // transition directe vers un état avancé.
    from: ['DUE', 'REJECTED'],
    to: 'PENDING_VERIFICATION',
    auditAction: 'PAYMENT_SUBMITTED',
    historyEvent: 'PAYMENT_DECLARED',
    events: ['PAYMENT_DECLARED', 'PAYMENT_PENDING_VERIFICATION'],
    viaApi: true,
    dedupeKey: 'paymentId + DECLARED + attemptNumber',
  },
  VERIFY_DECLARATION: {
    action: 'VERIFY_DECLARATION',
    actor: 'ADMIN',
    from: ['PENDING_VERIFICATION'],
    to: 'VERIFIED',
    auditAction: 'PAYMENT_VERIFIED',
    historyEvent: 'PAYMENT_VERIFIED',
    events: ['PAYMENT_APPROVED'],
    viaApi: true,
    dedupeKey: 'paymentId + VERIFIED',
  },
  CONFIRM_PAID: {
    action: 'CONFIRM_PAID',
    actor: 'ADMIN',
    from: ['VERIFIED'],
    to: 'PAID',
    auditAction: 'PAYMENT_PAID',
    historyEvent: 'PAYMENT_PAID',
    events: ['PAYMENT_PAID'],
    viaApi: true,
    dedupeKey: 'paymentId + PAID',
  },
  REJECT_DECLARATION: {
    action: 'REJECT_DECLARATION',
    actor: 'ADMIN',
    from: ['PENDING_VERIFICATION'],
    to: 'REJECTED',
    auditAction: 'PAYMENT_REJECTED',
    historyEvent: 'PAYMENT_REJECTED',
    events: ['PAYMENT_REJECTED'],
    requiresReason: true,
    viaApi: true,
    dedupeKey: 'paymentId + REJECTED',
  },
};

/**
 * Transitions explicitement REFUSÉES. Table documentaire : les règles ci-dessus
 * ne les ouvrent jamais, et les tests les vérifient une par une.
 */
export const PAYMENT_REFUSED_TRANSITIONS = [
  { from: 'SCHEDULED', to: 'PENDING_VERIFICATION', reason: 'Une échéance non due ne peut pas être déclarée : aucun paiement n’est encore exigible.' },
  { from: 'SCHEDULED', to: 'PAID', reason: 'Aucun paiement direct depuis une échéance prévue : DUE, déclaration et vérification sont obligatoires.' },
  { from: 'SCHEDULED', to: 'VERIFIED', reason: 'Rien à vérifier sans déclaration.' },
  { from: 'DUE', to: 'PAID', reason: 'DUE → PAID exigerait de payer sans déclaration ni preuve.' },
  { from: 'DUE', to: 'VERIFIED', reason: 'La vérification porte une déclaration, pas une échéance nue.' },
  { from: 'PENDING_VERIFICATION', to: 'PAID', reason: 'La vérification est une étape DISTINCTE : une référence saisie ne paie rien.' },
  { from: 'PENDING_VERIFICATION', to: 'DUE', reason: 'Aucun retour en arrière : une déclaration déposée reste dans le cycle.' },
  { from: 'PENDING_VERIFICATION', to: 'PENDING_VERIFICATION', reason: 'Une seconde déclaration identique sur la même tentative est refusée (unique par paiement + tentative).' },
  { from: 'VERIFIED', to: 'REJECTED', reason: 'Une déclaration déjà vérifiée n’est pas rejetée après coup : un incident relève d’une autre tranche.' },
  { from: 'VERIFIED', to: 'PENDING_VERIFICATION', reason: 'Pas de redéclaration d’un paiement déjà vérifié.' },
  { from: 'PAID', to: 'REJECTED', reason: '`PAID` est terminal : aucun retour arrière.' },
  { from: 'PAID', to: 'DUE', reason: '`PAID` est terminal : aucun retour arrière.' },
  { from: 'PAID', to: 'PENDING_VERIFICATION', reason: '`PAID` est terminal : aucune nouvelle déclaration n’est admise.' },
  { from: 'REJECTED', to: 'PAID', reason: 'Un paiement rejeté ne devient jamais payé sans nouvelle déclaration conforme.' },
  { from: 'REJECTED', to: 'VERIFIED', reason: 'La régularisation passe par UNE NOUVELLE déclaration, jamais par une vérification directe.' },
  { from: 'REJECTED', to: 'DUE', reason: 'Le rejet reste l’état courant jusqu’à la déclaration de régularisation.' },
] as const;

export type PaymentTransitionOutcome =
  /** Transition appliquée. */
  | { readonly kind: 'APPLY'; readonly to: PaymentLifecycleStatus }
  /** Le paiement est DÉJÀ dans l'état cible : rejeu idempotent, aucune écriture. */
  | { readonly kind: 'ALREADY'; readonly current: PaymentLifecycleStatus }
  /** État terminal (`PAID`) : refus explicite, aucune écriture. */
  | { readonly kind: 'TERMINAL'; readonly current: PaymentLifecycleStatus; readonly reason: string }
  /** État de départ hors matrice pour cette action. */
  | { readonly kind: 'FORBIDDEN'; readonly current: PaymentLifecycleStatus; readonly reason: string };

/**
 * Évalue une action contre le statut COURANT relu en base (jamais contre un
 * statut fourni par le client).
 *
 * Ordre volontaire : `ALREADY` (rejeu idempotent) avant `TERMINAL` avant
 * `FORBIDDEN` — un rejeu ne produit jamais un second effet, mais un état
 * terminal n'est jamais rouvert non plus.
 */
export function evaluatePaymentTransition(
  rule: PaymentTransitionRule,
  current: PaymentLifecycleStatus,
): PaymentTransitionOutcome {
  if (current === rule.to) return { kind: 'ALREADY', current };
  if ((PAYMENT_TERMINAL_STATUSES as readonly string[]).includes(current)) {
    return { kind: 'TERMINAL', current, reason: PAYMENT_TERMINAL_REFUSAL_REASON };
  }
  if (!rule.from.includes(current)) {
    const refusal = (PAYMENT_REFUSED_TRANSITIONS as readonly { from: string; to: string; reason: string }[])
      .find(entry => entry.from === current && entry.to === rule.to);
    return {
      kind: 'FORBIDDEN',
      current,
      reason: refusal?.reason
        ?? `Transition de paiement refusée : « ${rule.action} » depuis « ${current} » n’existe pas dans le cycle.`,
    };
  }
  return { kind: 'APPLY', to: rule.to };
}

/* ------------------------------------------------------------------ */
/* 4. Matérialisation des paiements depuis l'échéancier existant        */
/* ------------------------------------------------------------------ */

/** Règle réelle : une commission nulle n'est jamais exigible. */
export const COMMISSION_IGNORED_AT_OR_BELOW = 0;

export interface PaymentDraft {
  id: string;
  contractId: string;
  employerId: string;
  candidateId: string;
  paymentType: PaymentType;
  scheduleEntryId: string;
  monthNumber: number;
  periodKey: string;
  amount: number;
  currency: string;
  scheduledAt: string;
  dueAt: string;
  status: PaymentLifecycleStatus;
  idempotencyKey: string;
}

/** Identifiant déterministe : la clé primaire est la première garantie d'unicité. */
export function paymentIdFor(contractId: string, paymentType: PaymentType, monthNumber: number): string {
  return `pay_${paymentType.toLowerCase()}_${contractId}_M${monthNumber}`;
}

export function paymentIdempotencyKeyFor(contractId: string, paymentType: PaymentType, monthNumber: number): string {
  return `${contractId}:${paymentType}:M${monthNumber}`;
}

/** Lien déterministe avec l'échéance de `automation_deadlines` (aucune duplication). */
export function deadlineIdForPayment(paymentType: PaymentType, scheduleEntryId: string): string {
  const kind = paymentType === 'SALARY' ? 'SALARY_PAYMENT' : 'COMMISSION_PAYMENT';
  return `dl_${kind}_${scheduleEntryId}`;
}

export function paymentTypeForDeadlineKind(kind: string): PaymentType | null {
  if (kind === 'SALARY_PAYMENT') return 'SALARY';
  if (kind === 'COMMISSION_PAYMENT') return 'PLATFORM_FEE';
  return null;
}

/**
 * Un paiement par période : salarial toujours, de commission uniquement quand la
 * commission est strictement positive — EXACTEMENT la règle déjà appliquée aux
 * échéances par `buildScheduleDeadlines`. Aucun paiement n'est inventé pour un
 * mois sans échéancier.
 */
export function buildPaymentDrafts(input: {
  contractId: string;
  employerId: string;
  candidateId: string;
  paymentSchedule: readonly PaymentScheduleEntry[];
  scheduledAt: string;
}): PaymentDraft[] {
  const drafts: PaymentDraft[] = [];
  for (const entry of input.paymentSchedule) {
    const candidates: Array<{ paymentType: PaymentType; dueDate: string; amount: number }> = [
      // La nature SALARY est bien la PART SALARIALE due au travailleur (règle
      // réelle du modèle : `confirmMonthlyAction` exige `entry.employeeShareAmount`,
      // et le contrat de données sépare part employé 75 % / part LE LABEUR 25 %
      // au premier mois). `entry.salaryAmount` reste le montant brut du contrat.
      { paymentType: 'SALARY', dueDate: entry.salaryDueDate, amount: entry.employeeShareAmount },
      { paymentType: 'PLATFORM_FEE', dueDate: entry.commissionDueDate, amount: entry.commissionAmount },
    ];
    for (const candidate of candidates) {
      if (candidate.paymentType === 'PLATFORM_FEE' && candidate.amount <= COMMISSION_IGNORED_AT_OR_BELOW) continue;
      drafts.push({
        id: paymentIdFor(input.contractId, candidate.paymentType, entry.monthNumber),
        contractId: input.contractId,
        employerId: input.employerId,
        candidateId: input.candidateId,
        paymentType: candidate.paymentType,
        scheduleEntryId: entry.id,
        monthNumber: entry.monthNumber,
        periodKey: entry.periodKey,
        amount: candidate.amount,
        currency: entry.currency,
        scheduledAt: input.scheduledAt,
        // Modèle de date RÉEL du dépôt : date seule à 00:00 UTC
        // (`J3_SCHEDULER_CONTRACT.currentDateModel`, `businessRules.isPaymentDue`).
        dueAt: toUtcMidnight(candidate.dueDate),
        status: 'SCHEDULED',
        idempotencyKey: paymentIdempotencyKeyFor(input.contractId, candidate.paymentType, entry.monthNumber),
      });
    }
  }
  return drafts;
}

/**
 * Brouillons pour des mois DÉJÀ planifiés dont les lignes `payments` manquent
 * (contrat activé avant P0-PAY-1, ou échéancier partiel). Règles strictement
 * identiques à `buildPaymentDrafts` : mêmes identifiants, mêmes clés, aucune
 * période inventée — un mois absent de l'échéancier ne produit aucun paiement.
 */
export function buildPaymentDraftsFromSchedule(input: {
  contractId: string;
  employerId: string;
  candidateId: string;
  paymentSchedule: readonly PaymentScheduleEntry[];
  scheduledAt: string;
  monthNumbers?: readonly number[];
}): PaymentDraft[] {
  const entries = input.monthNumbers && input.monthNumbers.length > 0
    ? input.paymentSchedule.filter(entry => input.monthNumbers!.includes(entry.monthNumber))
    : input.paymentSchedule;
  return buildPaymentDrafts({
    contractId: input.contractId,
    employerId: input.employerId,
    candidateId: input.candidateId,
    paymentSchedule: entries,
    scheduledAt: input.scheduledAt,
  });
}

/* ------------------------------------------------------------------ */
/* 5. Période : le cycle ne définit AUCUNE nouvelle règle de cadence     */
/* ------------------------------------------------------------------ */

export interface PaymentPeriodicityRule {
  readonly periodicity: string;
  /** `true` seulement si une règle de cadence existe déjà dans le modèle. */
  readonly paymentsDefined: boolean;
  readonly missingRule: string | null;
  readonly source: string | null;
}

/**
 * Le cycle paiements n'ajoute AUCUNE périodicité : il hérite exactement de la
 * table de règles de P0-AUTO-2 (`SCHEDULE_PERIODICITY_RULES`), qui ne définit
 * qu'une cadence mensuelle. `Hebdomadaire` et `Forfait mission` restent donc
 * SANS échéancier, SANS paiement et SANS rappel — documenté, jamais deviné.
 */
export function resolvePaymentPeriodicityRule(periodicity: string): PaymentPeriodicityRule {
  const scheduleRule = resolveSchedulePeriodicityRule(periodicity);
  if (!scheduleRule.ruleDefined) {
    return {
      periodicity,
      paymentsDefined: false,
      missingRule: scheduleRule.missingRule ?? 'Aucune règle de cadence dans le modèle pour cette périodicité.',
      source: null,
    };
  }
  return {
    periodicity,
    paymentsDefined: true,
    missingRule: null,
    source: scheduleRule.ruleSource,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Avancement mensuel (M1 → M2 → M3 …) — règle RÉELLE transposée      */
/* ------------------------------------------------------------------ */

/** Action unique ouverte sur le cycle mensuel par P0-PAY-1. */
export const PAYMENT_MONTHLY_ADVANCE_ACTION = 'ADVANCE_MONTH' as const;

/**
 * Actions du point de contrôle mensuel du DEMO (`confirmMonthlyAction`) qui
 * restent FERMÉES dans le domaine de production : elles relèvent des
 * confirmations bilatérales et des documents, non du cycle paiements.
 */
export const MONTHLY_ACTIONS_OUT_OF_SCOPE = [
  'START', 'START_ANSWER_EMPLOYER', 'START_ANSWER_EMPLOYEE',
  'CONFIRM_EMPLOYER', 'CONFIRM_EMPLOYEE',
  'CONFIRM_SALARY_RECEIVED', 'CONTEST_SALARY_NOT_RECEIVED',
  'PAID', 'DECLARE_SALARY',
] as const;

export interface MonthlyAdvancePlan {
  readonly contractId: string;
  readonly fromMonth: number;
  readonly toMonth: number;
  readonly periodKey: string;
  /** Point de contrôle AJOUTÉ au contrat (forme réelle de `advanceContractMonth`). */
  readonly checkpoint: {
    monthNumber: number;
    periodKey: string;
    salaryAmount: number;
    employeeShareAmount: number;
    leLabeurShareAmount: number;
    currency: string;
    isStarted: boolean;
    employerStartAnswer: 'YES';
    employeeStartAnswer: 'YES';
    startConfirmed: boolean;
    isSalaryPaidToEmployee: boolean;
    employerConfirmed: boolean;
    employeeConfirmed: boolean;
  };
  /** Entrée de grand livre AJOUTÉE (0 % en M2+, valeur réelle du modèle). */
  readonly ledgerEntry: {
    contractId: string;
    monthNumber: number;
    salaryBase: number;
    percentage: number;
    amountDue: number;
    amountSubmitted: number;
    status: CommissionPaymentStatus;
    createdAt: string;
  };
  /** Vue commission du contrat, prise de l'échéancier existant (jamais recalculée). */
  readonly commissionAmountDue: number;
  readonly commissionStatus: CommissionPaymentStatus;
  readonly historyEvent: string;
  readonly description: string;
}

export type MonthlyAdvanceEvaluation =
  | { readonly kind: 'ADVANCE'; readonly plan: MonthlyAdvancePlan }
  | { readonly kind: 'PERIODICITY_RULE_MISSING'; readonly periodicity: string; readonly missingRule: string }
  | { readonly kind: 'MAX_DURATION_REACHED'; readonly currentMonth: number; readonly durationMonths: number }
  | { readonly kind: 'MONTH_ENTRY_MISSING'; readonly monthNumber: number };

export interface MonthlyAdvanceSource {
  contractId: string;
  status: string;
  periodicity: string;
  currentMonth: number;
  durationMonths: number;
  monthlySalary: number;
  currency: string;
  paymentSchedule: readonly PaymentScheduleEntry[];
}

/**
 * Avancement M1 → M2 → M3 : transposition fidèle de
 * `MockRepository.advanceContractMonth`, sans aucun pourcentage inventé.
 *
 * Le contrat reste la seule autorité de la durée (`durationMonths`) et de la
 * date d'échéance (l'échéancier). La commission M2+ est à 0 % parce que c'est
 * LA règle du modèle (`calculateLaterMonthCommission`), pas parce que le cycle
 * paiements le déciderait.
 *
 * `contracts.commission_percentage` n'est JAMAIS réécrit : la valeur M2+ de 0 %
 * est portée par l'entrée de grand livre du mois, exactement comme le modèle.
 */
export function evaluateMonthlyAdvance(source: MonthlyAdvanceSource): MonthlyAdvanceEvaluation {
  const rule = resolvePaymentPeriodicityRule(source.periodicity);
  if (!rule.paymentsDefined) {
    return {
      kind: 'PERIODICITY_RULE_MISSING',
      periodicity: source.periodicity,
      missingRule: rule.missingRule ?? 'Aucune règle de cadence applicable.',
    };
  }
  if (source.currentMonth >= source.durationMonths) {
    return {
      kind: 'MAX_DURATION_REACHED',
      currentMonth: source.currentMonth,
      durationMonths: source.durationMonths,
    };
  }

  const toMonth = source.currentMonth + 1;
  const entry = source.paymentSchedule.find(candidate => candidate.monthNumber === toMonth);
  if (!entry) return { kind: 'MONTH_ENTRY_MISSING', monthNumber: toMonth };

  const salaryBase = source.monthlySalary;
  const employeeShare = toMonth === 1
    ? calculateFirstMonthEmployeeShare(salaryBase)
    : calculateLaterMonthEmployeeShare(salaryBase);
  const leLabeurShare = toMonth === 1
    ? calculateFirstMonthCommission(salaryBase)
    : calculateLaterMonthCommission();

  return {
    kind: 'ADVANCE',
    plan: {
      contractId: source.contractId,
      fromMonth: source.currentMonth,
      toMonth,
      periodKey: entry.periodKey,
      checkpoint: {
        monthNumber: toMonth,
        periodKey: entry.periodKey,
        salaryAmount: salaryBase,
        employeeShareAmount: employeeShare,
        leLabeurShareAmount: leLabeurShare,
        currency: source.currency,
        isStarted: true,
        employerStartAnswer: 'YES',
        employeeStartAnswer: 'YES',
        startConfirmed: true,
        isSalaryPaidToEmployee: false,
        employerConfirmed: false,
        employeeConfirmed: false,
      },
      ledgerEntry: {
        contractId: source.contractId,
        monthNumber: toMonth,
        salaryBase,
        percentage: toMonth === 1 ? 25 : 0,
        amountDue: entry.commissionAmount,
        amountSubmitted: 0,
        status: entry.commissionAmount > COMMISSION_IGNORED_AT_OR_BELOW
          ? entry.commissionStatus
          : 'NOT_APPLICABLE',
        createdAt: entry.createdAt,
      },
      commissionAmountDue: entry.commissionAmount,
      commissionStatus: entry.commissionStatus,
      historyEvent: 'ADVANCE_MONTH',
      description:
        `Passage en ${entry.periodKey}. Règle réelle : `
        + `${toMonth === 1 ? '25 % LE LABEUR / 75 % salarié' : '0 % LE LABEUR / 100 % salarié'}.`,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 7. Déclaration employeur : validation et autorité serveur            */
/* ------------------------------------------------------------------ */

export interface PaymentDeclarationPayload {
  paymentId?: string;
  contractId?: string;
  periodKey?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  externalTransactionId?: string;
  provider?: string;
  paidAt?: string;
  proofDocumentId?: string;
  proofFileName?: string;
  proofNote?: string;
  comment?: string;
  /** JAMAIS lu du client : la nature est dérivée du paiement visé. */
  paymentType?: unknown;
  /** JAMAIS lu du client : l'acteur vient de la session. */
  employerId?: unknown;
}

export const PAYMENT_DECLARATION_PAYLOAD_FIELDS = [
  'paymentId', 'contractId', 'periodKey', 'amount', 'currency', 'reference',
  'externalTransactionId', 'provider', 'paidAt',
  'proofDocumentId', 'proofFileName', 'proofNote', 'comment',
] as const;

/** Champs refusés en entrée : l'identité et la nature ne sont jamais client-side. */
export const PAYMENT_DECLARATION_FORBIDDEN_FIELDS = [
  'employerId', 'candidateId', 'employeeId', 'paymentType', 'status',
  'contractIdFromClient', 'submittedBy', 'verifiedBy', 'idempotencyKey',
] as const;

export const MAX_PAYMENT_REFERENCE_LENGTH = 120;
export const MAX_PAYMENT_COMMENT_LENGTH = 500;

export type PaymentDeclarationValidation =
  | { readonly kind: 'VALID'; readonly payload: NormalizedPaymentDeclaration }
  | { readonly kind: 'INVALID'; readonly errors: Record<string, string[]> };

export interface NormalizedPaymentDeclaration {
  paymentId?: string;
  contractId?: string;
  periodKey?: string;
  amount?: number;
  currency?: string;
  reference: string;
  externalTransactionId?: string;
  provider?: ExternalPaymentMethod;
  paidAt?: string;
  proof?: PaymentProofMetadata;
  comment?: string;
}

/**
 * Normalise la charge utile d'une déclaration : seuls les champs du plan sont
 * acceptés, `paymentType` / `employerId` / `status` envoyés par le client sont
 * un incident de sécurité (refus), jamais un filtre ignoré silencieusement.
 */
export function normalizePaymentDeclarationPayload(value: unknown): PaymentDeclarationValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'INVALID', errors: { payload: ['La charge utile de déclaration est invalide.'] } };
  }
  const input = value as Record<string, unknown>;
  const errors: Record<string, string[]> = {};
  const push = (field: string, message: string): void => {
    errors[field] = [...(errors[field] ?? []), message];
  };

  for (const key of Object.keys(input)) {
    if ((PAYMENT_DECLARATION_FORBIDDEN_FIELDS as readonly string[]).includes(key)) {
      push(key, `Champ refusé dans la déclaration : « ${key} » est résolu côté serveur.`);
    } else if (!(PAYMENT_DECLARATION_PAYLOAD_FIELDS as readonly string[]).includes(key as never)) {
      push(key, `Champ inconnu : ${key}.`);
    }
  }

  const text = (field: keyof PaymentDeclarationPayload, maxLength: number, required: boolean): string | undefined => {
    const raw = input[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) push(field, `Le champ « ${field} » est requis.`);
      return undefined;
    }
    if (typeof raw !== 'string') {
      push(field, `Le champ « ${field} » doit être du texte.`);
      return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      if (required) push(field, `Le champ « ${field} » est requis.`);
      return undefined;
    }
    if (trimmed.length > maxLength) {
      push(field, `Le champ « ${field} » ne doit pas dépasser ${maxLength} caractères.`);
      return undefined;
    }
    return trimmed;
  };

  const paymentId = text('paymentId', 120, false);
  const contractId = text('contractId', 120, false);
  const periodKey = text('periodKey', 40, false);
  if (!paymentId && !(contractId && periodKey)) {
    push('paymentId', 'La déclaration exige `paymentId`, ou le couple `contractId` + `periodKey`.');
  }

  const reference = text('reference', MAX_PAYMENT_REFERENCE_LENGTH, true) ?? '';

  let provider: ExternalPaymentMethod | undefined;
  const rawProvider = input.provider;
  if (rawProvider !== undefined && rawProvider !== null && rawProvider !== '') {
    if (typeof rawProvider !== 'string'
      || !(EXTERNAL_PAYMENT_METHODS as readonly string[]).includes(rawProvider)) {
      push('provider',
        `Le fournisseur doit appartenir au vocabulaire réel du modèle (${EXTERNAL_PAYMENT_METHODS.join(', ')}).`);
    } else {
      provider = rawProvider as ExternalPaymentMethod;
    }
  }

  let currency: string | undefined;
  const rawCurrency = input.currency;
  if (rawCurrency !== undefined && rawCurrency !== null && rawCurrency !== '') {
    // Le vocabulaire réel du dépôt est `FCFA` (`offerRepository.ts:162`, contrat de
    // données) et `XOF` est parfois saisi par l'ADMIN : la devise saisie est
    // comparée EXACTEMENT à celle du contrat, sans conversion inventée.
    if (typeof rawCurrency !== 'string' || !/^[A-Za-z]{3,4}$/.test(rawCurrency.trim())) {
      push('currency', 'La devise doit être un code de trois ou quatre lettres (ex. « FCFA », « XOF »).');
    } else {
      currency = rawCurrency.trim().toUpperCase();
    }
  }

  let amount: number | undefined;
  const rawAmount = input.amount;
  if (rawAmount !== undefined && rawAmount !== null) {
    const parsed = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      push('amount', 'Le montant déclaré doit être un nombre positif.');
    } else {
      amount = Math.round(parsed);
    }
  }

  let paidAt: string | undefined;
  const rawPaidAt = input.paidAt;
  if (rawPaidAt !== undefined && rawPaidAt !== null && rawPaidAt !== '') {
    if (typeof rawPaidAt !== 'string' || Number.isNaN(Date.parse(rawPaidAt))) {
      push('paidAt', 'La date de paiement doit être un horodatage ISO 8601.');
    } else {
      paidAt = new Date(rawPaidAt).toISOString();
    }
  }

  const proof: PaymentProofMetadata = {};
  const proofDocumentId = text('proofDocumentId', 120, false);
  const proofFileName = text('proofFileName', 200, false);
  const proofNote = text('proofNote', MAX_PAYMENT_COMMENT_LENGTH, false);
  if (proofDocumentId) proof.documentId = proofDocumentId;
  if (proofFileName) proof.fileName = proofFileName;
  if (proofNote) proof.note = proofNote;

  const comment = text('comment', MAX_PAYMENT_COMMENT_LENGTH, false);
  const externalTransactionId = text('externalTransactionId', MAX_PAYMENT_REFERENCE_LENGTH, false);

  if (Object.keys(errors).length > 0) return { kind: 'INVALID', errors };
  return {
    kind: 'VALID',
    payload: {
      ...(paymentId ? { paymentId } : {}),
      ...(contractId ? { contractId } : {}),
      ...(periodKey ? { periodKey } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(currency !== undefined ? { currency } : {}),
      reference,
      ...(externalTransactionId ? { externalTransactionId } : {}),
      ...(provider ? { provider } : {}),
      ...(paidAt ? { paidAt } : {}),
      ...(Object.keys(proof).length > 0 ? { proof } : {}),
      ...(comment ? { comment } : {}),
    },
  };
}

export type PaymentDeclarationGate =
  | { readonly kind: 'ACCEPTED'; readonly amount: number }
  | { readonly kind: 'REJECTED_BY_RULE'; readonly reason: string };

export interface PaymentDeclarationGateInput {
  paymentType: PaymentType;
  status: PaymentLifecycleStatus;
  amountDue: number;
  currency: string;
  dueAt: string;
  declaredAmount?: number;
  declaredCurrency?: string;
  reference: string;
  evaluatedAt: string;
}

/**
 * Garde métier d'une déclaration, transposée de `confirmMonthlyAction`
 * (`DECLARE_SALARY`) :
 *  - déclarable seulement depuis `DUE` (ou `REJECTED`, régularisation prévue par
 *    le modèle) ;
 *  - le montant attendu est celui de l'échéancier : aucun montant libre ;
 *  - la référence est obligatoire (preuve de l'opération hors plateforme).
 */
export function evaluatePaymentDeclaration(input: PaymentDeclarationGateInput): PaymentDeclarationGate {
  const rule = PAYMENT_TRANSITION_RULES.DECLARE_PAYMENT;
  const outcome = evaluatePaymentTransition(rule, input.status);
  if (outcome.kind !== 'APPLY') {
    const reason = outcome.kind === 'ALREADY'
      ? `Déclaration déjà enregistrée pour ce paiement (statut : ${outcome.current}).`
      : outcome.kind === 'TERMINAL'
        ? `Ce paiement est ${outcome.current} : aucune déclaration n’est admise.`
        : (outcome as { reason: string }).reason;
    return { kind: 'REJECTED_BY_RULE', reason };
  }
  if (input.declaredAmount !== undefined && input.declaredAmount !== input.amountDue) {
    return {
      kind: 'REJECTED_BY_RULE',
      reason: `Montant de ${input.paymentType === 'PLATFORM_FEE' ? 'commission' : 'salaire'} incohérent : `
        + `${input.amountDue} ${input.currency} attendu.`,
    };
  }
  if (input.declaredCurrency !== undefined && input.declaredCurrency !== input.currency) {
    return {
      kind: 'REJECTED_BY_RULE',
      reason: `Devise incohérente : ${input.currency} attendu.`,
    };
  }
  if (!input.reference.trim()) {
    return { kind: 'REJECTED_BY_RULE', reason: 'La référence de paiement hors plateforme est obligatoire.' };
  }
  // Règle réelle du modèle (`isPaymentDue` / `confirmMonthlyAction`) : on ne
  // déclare pas une échéance avant sa date, même si le statut a déjà basculé.
  if (!isPaymentPeriodDue(input.dueAt, input.evaluatedAt)) {
    return {
      kind: 'REJECTED_BY_RULE',
      reason: `Déclaration prématurée : l’échéance ${input.dueAt.slice(0, 10)} n’est pas atteinte.`,
    };
  }
  return { kind: 'ACCEPTED', amount: input.amountDue };
}

/* ------------------------------------------------------------------ */
/* 8. Vérification / rapprochement (aucun fournisseur branché)          */
/* ------------------------------------------------------------------ */

export type PaymentVerificationVerdict = 'MATCHED' | 'MISMATCHED';

export interface PaymentVerificationEvidence {
  provider?: string;
  externalTransactionId?: string;
  reference: string;
  amount: number;
  currency: string;
  payer: string;
  recipient: string;
  timestamp: string;
}

export interface PaymentVerificationRequest {
  paymentId: string;
  contractId: string;
  paymentType: PaymentType;
  expectedAmount: number;
  expectedCurrency: string;
  /** Statut du paiement : la vérification ne porte que `PENDING_VERIFICATION`. */
  status: PaymentLifecycleStatus;
  evidence: PaymentVerificationEvidence;
  /** Preuve conservée (tentative courante) pour la comparaison de régularisation. */
  previousReferences?: readonly string[];
}

export interface PaymentVerificationResult {
  verdict: PaymentVerificationVerdict;
  reasons: readonly string[];
  /** Détermine si une nouvelle déclaration est admise après un rejet. */
  checkedAt: string;
  /** Source de la vérification : locale ou fournisseur externe. */
  source: 'local-deterministic' | string;
}

/**
 * Vérification locale et déterministe : elle rapproche la DÉCLARATION de
 * l'assiette connue (montant, devise, référence, période) et refuse tout ce qui
 * exigerait un fournisseur réellement branché.
 *
 * Elle ne consult AUCUNE API externe et ne invente aucune règle de taux, de
 * frais ou de change.
 */
export function verifyPaymentDeclarationLocally(
  request: PaymentVerificationRequest,
  checkedAt: string,
): PaymentVerificationResult {
  const reasons: string[] = [];
  const { evidence } = request;

  if (request.status !== 'PENDING_VERIFICATION') {
    reasons.push(
      `La vérification porte un paiement en attente : statut courant « ${request.status} ».`,
    );
  }
  if (!evidence.reference.trim()) {
    reasons.push('Référence de paiement absente : rien à rapprocher.');
  }
  if (evidence.amount !== request.expectedAmount) {
    reasons.push(
      `Montant déclaré ${evidence.amount} ${evidence.currency} différent du montant dû `
      + `${request.expectedAmount} ${request.expectedCurrency}.`,
    );
  }
  if (evidence.currency !== request.expectedCurrency) {
    reasons.push(`Devise déclarée ${evidence.currency} différente de la devise contractuelle ${request.expectedCurrency}.`);
  }
  if (!evidence.payer || !evidence.recipient) {
    reasons.push('Payeur ou destinataire non résolu depuis le contrat : rapprochement impossible.');
  }
  if (Number.isNaN(Date.parse(evidence.timestamp))) {
    reasons.push('Horodatage de paiement illisible.');
  }
  if (evidence.provider && !evidence.externalTransactionId) {
    reasons.push(
      `Fournisseur « ${evidence.provider} » déclaré sans identifiant de transaction externe : `
      + 'aucun adaptateur de fournisseur n’est branché dans cette tranche, la transaction ne peut pas être confirmée.',
    );
  }
  if (request.paymentType === 'PLATFORM_FEE' && evidence.recipient && evidence.recipient !== 'LE_LABEUR') {
    // Règle absolue du dépôt : la commission est due à LE LABEUR, jamais au
    // salarié. La comparaison reste souple tant que le destinataire n'est pas
    // résolu explicitement, mais un destinataire salarié est une erreur.
    reasons.push('La commission est due à LE LABEUR, jamais au salarié.');
  }
  if (request.previousReferences?.includes(evidence.reference)) {
    reasons.push(
      'Même référence que la déclaration déjà rejetée : la régularisation exige une déclaration nouvelle, '
      + 'l’ancienne preuve restant conservée.',
    );
  }

  return {
    verdict: reasons.length === 0 ? 'MATCHED' : 'MISMATCHED',
    reasons,
    checkedAt,
    source: 'local-deterministic',
  };
}

/* ------------------------------------------------------------------ */
/* 9. Identifiants, clés et événements déterministes                   */
/* ------------------------------------------------------------------ */

export function paymentDeclarationId(paymentId: string, attemptNumber: number): string {
  return `pdl_${paymentId}_A${attemptNumber}`;
}

/** Clé d'idempotence DURABLE d'une déclaration (acteur + commande + clé client). */
export function paymentDeclarationIdempotencyKey(input: {
  actorId: string;
  command: string;
  idempotencyKey: string;
}): string {
  return `${input.actorId}:${input.command}:${input.idempotencyKey}`;
}

/** Clé de rejeu du passage à DUE : le PAIEMENT, jamais l'identifiant du job. */
export function paymentDueIdempotencyKey(paymentId: string): string {
  return `${paymentId}:PAYMENT_DUE`;
}

export const PAYMENT_DUE_COMMAND = 'automation.PAYMENT_MARK_DUE';
export const PAYMENT_DECLARATION_COMMAND = 'payments.DECLARE';
export const PAYMENT_VERIFICATION_COMMAND = 'payments.VERIFY';
export const PAYMENT_CONFIRM_COMMAND = 'payments.CONFIRM_PAID';
export const PAYMENT_REJECT_COMMAND = 'payments.REJECT';
export const PAYMENT_ADVANCE_MONTH_COMMAND = 'payments.ADVANCE_MONTH';
export const PAYMENT_SYSTEM_ACTOR = 'SYSTEM';
export const PAYMENT_AUTOMATION_SOURCE = 'automation:P0-PAY-1';

/**
 * Événement déterministe : la clé primaire de l'outbox fait le reste.
 *
 * `occurrence` est le NUMÉRO DE TENTATIVE de déclaration : une régularisation
 * après rejet produit donc son propre événement (clé de déduplication
 * `paymentId + type + attemptNumber`, exactement la règle annoncée en ÉTAPE 18),
 * tandis qu'un rejeu de la même tentative reste un `duplicate`.
 */
export function paymentEventId(paymentId: string, eventType: string, occurrence?: number): string {
  const base = `evt_${eventType}_${paymentId}`;
  return occurrence === undefined ? base : `${base}_A${occurrence}`;
}

export function paymentAggregateType(): 'payment' {
  return 'payment';
}

/* ------------------------------------------------------------------ */
/* 10. Événements de notification (aucun consumer dans cette tranche)   */
/* ------------------------------------------------------------------ */

/**
 * Catalogue du plan (ÉTAPE 13) → nomenclature RÉELLE du dépôt. Les trois types
 * déjà déclarés par `OutboxEventType` sont conservés sous leur nom de code ;
 * quatre types nouveaux sont ajoutés, aucun autre.
 */
export const PAYMENT_EVENT_CATALOG = [
  { plan: 'PAYMENT_DUE', code: 'PAYMENT_DUE', status: 'nouveau', dedupeKey: 'paymentId + DUE' },
  { plan: 'PAYMENT_SUBMITTED', code: 'PAYMENT_DECLARED', status: 'existant', dedupeKey: 'paymentId + DECLARED + attemptNumber' },
  { plan: 'PAYMENT_PENDING_VERIFICATION', code: 'PAYMENT_PENDING_VERIFICATION', status: 'nouveau', dedupeKey: 'paymentId + PENDING_VERIFICATION' },
  { plan: 'PAYMENT_VERIFIED', code: 'PAYMENT_APPROVED', status: 'existant', dedupeKey: 'paymentId + VERIFIED' },
  { plan: 'PAYMENT_PAID', code: 'PAYMENT_PAID', status: 'nouveau', dedupeKey: 'paymentId + PAID' },
  { plan: 'PAYMENT_REJECTED', code: 'PAYMENT_REJECTED', status: 'existant', dedupeKey: 'paymentId + REJECTED' },
  { plan: 'PAYMENT_OVERDUE', code: 'PAYMENT_OVERDUE_J3', status: 'existant (P0-AUTO-2)', dedupeKey: 'schedule-entry + payment-kind + due-date + J3' },
] as const;

/** Types réellement produits par cette tranche (les autres restent documentés). */
export const PAYMENT_PRODUCED_EVENT_TYPES = [
  'PAYMENT_DUE',
  'PAYMENT_DECLARED',
  'PAYMENT_PENDING_VERIFICATION',
  'PAYMENT_APPROVED',
  'PAYMENT_PAID',
  'PAYMENT_REJECTED',
] as const;

export type PaymentProducedEventType = (typeof PAYMENT_PRODUCED_EVENT_TYPES)[number];

/**
 * Ces événements n'ont VOLONTAIREMENT aucun consumer : le module Notifications
 * (e-mail, Push, WhatsApp, SMS, fournisseur) appartient à l'étape suivante.
 */
export const PAYMENT_DEFERRED_NOTIFICATION_EVENT_TYPES: readonly PaymentProducedEventType[] = [
  'PAYMENT_DUE',
  'PAYMENT_DECLARED',
  'PAYMENT_PENDING_VERIFICATION',
  'PAYMENT_APPROVED',
  'PAYMENT_PAID',
  'PAYMENT_REJECTED',
];

export interface DocumentedPaymentEvent {
  readonly eventType: PaymentProducedEventType | 'PAYMENT_VERIFICATION_STARTED' | 'PAYMENT_OVERDUE_J3';
  readonly aggregateType: 'payment';
  readonly emittedBy: PaymentAction | 'REMINDER';
  readonly payload: readonly string[];
  readonly sideEffects: readonly string[];
  readonly dedupeKey: string;
}

/** Contrats d'événements du cycle (mêmes champs que le contrat d'audit réel). */
export const DOCUMENTED_PAYMENT_EVENTS: readonly DocumentedPaymentEvent[] = [
  {
    eventType: 'PAYMENT_DUE',
    aggregateType: 'payment',
    emittedBy: 'MARK_DUE',
    payload: ['paymentId', 'contractId', 'employerId', 'candidateId', 'paymentType', 'monthNumber',
      'periodKey', 'amount', 'currency', 'dueDate', 'occurredAt'],
    sideEffects: ['préparé pour le module Notifications — aucun consumer en P0-PAY-1'],
    dedupeKey: 'paymentId + DUE',
  },
  {
    eventType: 'PAYMENT_DECLARED',
    aggregateType: 'payment',
    emittedBy: 'DECLARE_PAYMENT',
    payload: ['paymentId', 'declarationId', 'attemptNumber', 'contractId', 'periodKey', 'paymentType',
      'amount', 'currency', 'reference', 'paidAt', 'submittedBy', 'occurredAt'],
    sideEffects: ['préparé pour le module Notifications — aucun consumer en P0-PAY-1'],
    dedupeKey: 'paymentId + DECLARED + attemptNumber',
  },
  {
    eventType: 'PAYMENT_PENDING_VERIFICATION',
    aggregateType: 'payment',
    emittedBy: 'DECLARE_PAYMENT',
    payload: ['paymentId', 'contractId', 'paymentType', 'periodKey', 'amount', 'currency', 'occurredAt'],
    sideEffects: ['file ADMIN de vérification (étape suivante)'],
    dedupeKey: 'paymentId + PENDING_VERIFICATION',
  },
  {
    eventType: 'PAYMENT_VERIFICATION_STARTED',
    aggregateType: 'payment',
    emittedBy: 'VERIFY_DECLARATION',
    payload: ['paymentId', 'actorId', 'occurredAt'],
    sideEffects: ['AUDIT uniquement (aucun événement durable dans cette tranche)'],
    dedupeKey: 'paymentId + VERIFICATION_STARTED',
  },
  {
    eventType: 'PAYMENT_APPROVED',
    aggregateType: 'payment',
    emittedBy: 'VERIFY_DECLARATION',
    payload: ['paymentId', 'declarationId', 'verdict', 'reasons', 'verifiedBy', 'occurredAt'],
    sideEffects: ['notifier l’employeur (module Notifications, étape suivante)'],
    dedupeKey: 'paymentId + VERIFIED',
  },
  {
    eventType: 'PAYMENT_PAID',
    aggregateType: 'payment',
    emittedBy: 'CONFIRM_PAID',
    payload: ['paymentId', 'contractId', 'paymentType', 'periodKey', 'amount', 'currency', 'reference',
      'verifiedAt', 'consideredPaidAt', 'occurredAt'],
    sideEffects: ['AUCUN mouvement de fonds : état métier seulement'],
    dedupeKey: 'paymentId + PAID',
  },
  {
    eventType: 'PAYMENT_REJECTED',
    aggregateType: 'payment',
    emittedBy: 'REJECT_DECLARATION',
    payload: ['paymentId', 'declarationId', 'reason', 'rejectedBy', 'occurredAt'],
    sideEffects: ['permet une nouvelle déclaration (régularisation), preuve précédente conservée'],
    dedupeKey: 'paymentId + REJECTED',
  },
  {
    eventType: 'PAYMENT_OVERDUE_J3',
    aggregateType: 'payment',
    emittedBy: 'REMINDER',
    payload: ['contractId', 'scheduleEntryId', 'paymentKind', 'dueDate', 'daysLate'],
    sideEffects: ['produit par P0-AUTO-2 (rappels), inchangé'],
    dedupeKey: 'schedule-entry + payment-kind + due-date + J3',
  },
] as const;

/* ------------------------------------------------------------------ */
/* 11. Audit                                                            */
/* ------------------------------------------------------------------ */

/**
 * Actions du ledger d'audit (`automation_audit_ledger.action`).
 * Ce sont les noms du plan (ÉTAPE 17), appliqués à l'entité `paymentId` : les
 * actions contractuelles de P0-AUTO-2 (`CONTRACT_*`, `SCHEDULE_*`) restent
 * inchangées et liées au `contractId`.
 */
export const PAYMENT_AUDIT_ACTIONS = {
  due: 'PAYMENT_DUE',
  submitted: 'PAYMENT_SUBMITTED',
  verificationStarted: 'PAYMENT_VERIFICATION_STARTED',
  verified: 'PAYMENT_VERIFIED',
  paid: 'PAYMENT_PAID',
  rejected: 'PAYMENT_REJECTED',
  materialized: 'PAYMENTS_MATERIALIZED',
  monthAdvanced: 'PAYMENT_MONTH_ADVANCED',
  duplicateSuppressed: 'PAYMENT_DUPLICATE_SUPPRESSED',
  preDueRecorded: 'PAYMENT_PRE_DUE_REMINDER_RECORDED',
  verificationMismatch: 'PAYMENT_VERIFICATION_MISMATCH',
  // P0-PAY-2 — audit de la frontière fournisseur externe
  webhookReceived: 'PAYMENT_WEBHOOK_RECEIVED',
  signatureValidated: 'PAYMENT_WEBHOOK_SIGNATURE_VALIDATED',
  signatureRejected: 'PAYMENT_WEBHOOK_SIGNATURE_REJECTED',
  reconciled: 'PAYMENT_RECONCILED',
  reconciliationMismatch: 'PAYMENT_RECONCILIATION_MISMATCH',
  duplicateDetected: 'PAYMENT_DUPLICATE_DETECTED',
  replayDetected: 'PAYMENT_REPLAY_DETECTED',
} as const;

export type PaymentAuditAction = (typeof PAYMENT_AUDIT_ACTIONS)[keyof typeof PAYMENT_AUDIT_ACTIONS];

/** Champs conservés à chaque écriture d'audit (ÉTAPE 17). */
export const PAYMENT_AUDIT_FIELDS = [
  'actor', 'paymentId', 'contractId', 'eventId', 'jobId', 'timestamp',
  'source', 'beforeState', 'afterState', 'error',
] as const;

/* ------------------------------------------------------------------ */
/* 12. Rappel pré-échéance : configuration, AUCUNE valeur inventée       */
/* ------------------------------------------------------------------ */

/** Nom de la variable de configuration (aucune valeur par défaut). */
export const PAYMENT_PRE_DUE_LEAD_TIME_ENV = 'PAYMENT_PRE_DUE_LEAD_TIME_MS';

/** Type de jobarmé uniquement quand une avance métier a été DÉCIDÉE. */
export const PAYMENT_PRE_DUE_JOB_TYPE = 'PAYMENT_PRE_DUE_REMINDER' as const;

export interface PreDueLeadTimeResolution {
  /** `null` = aucune avance décidée : AUCUN job n'est armé. */
  readonly leadTimeMs: number | null;
  readonly configured: boolean;
  /** Valeur brute reçue, pour journal d'audit et diagnostic. */
  readonly raw: string | number | null;
  /** Explication de la décision (config absente, valeur invalide, valeur retenue). */
  readonly detail: string;
}

/**
 * Résout l'avance de rappel pré-échéance.
 *
 * `PRE_DUE_REMINDER_CONFIGURATION.leadTimeMs` vaut `null` dans le dépôt : la
 * règle métier n'est pas décidée. Cette tranche ajoute UNIQUEMENT le point de
 * configuration (`leadTimeMs` via la variable `PAYMENT_PRE_DUE_LEAD_TIME_MS`) ;
 * aucune valeur par défaut n'est introduite — ni 24 h, ni 48 h, rien.
 */
export function resolvePreDueLeadTimeMs(value: string | number | undefined | null): PreDueLeadTimeResolution {
  if (value === undefined || value === null || String(value).trim() === '') {
    return {
      leadTimeMs: null,
      configured: false,
      raw: null,
      detail: `${PRE_DUE_REMINDER_CONFIGURATION.missingRule} `
        + `Aucune avance n'est appliquée : ${PAYMENT_PRE_DUE_LEAD_TIME_ENV} est absent et `
        + 'le modèle ne fixe pas de valeur par défaut.',
    };
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= 30 * MS_PER_DAY;
  if (!valid) {
    return {
      leadTimeMs: null,
      configured: false,
      raw: value,
      detail:
        `Valeur d’avance refusée (${String(value)}) : un entier strictement positif de millisecondes `
        + `est attendu au plus égal à ${30 * MS_PER_DAY} (30 jours). Aucune valeur n'est devinée.`,
    };
  }
  return {
    leadTimeMs: parsed,
    configured: true,
    raw: value,
    detail:
      `Avance de rappel pré-échéance décidée par l'exploitant : ${parsed} ms. `
      + `Le modèle ne fixe toujours pas de valeur par défaut (${PAYMENT_PRE_DUE_LEAD_TIME_ENV}).`,
  };
}

/** Job de rappel pré-échéance : armé seulement si `leadTimeMs` est décidé. */
export interface PreDueJobDraft {
  jobId: string;
  jobType: typeof PAYMENT_PRE_DUE_JOB_TYPE;
  aggregateType: 'contract';
  aggregateId: string;
  dueAt: string;
  idempotencyKey: string;
  reference: string;
  paymentId: string;
  paymentType: PaymentType;
  monthNumber: number;
  periodKey: string;
  leadTimeMs: number;
}

export function buildPreDueReminderJobs(
  input: {
    contractId: string;
    leadTimeMs: number | null;
    drafts: readonly PaymentDraft[];
    notificationTypeFor: (paymentType: PaymentType) => string;
  },
): PreDueJobDraft[] {
  if (input.leadTimeMs === null) return [];
  const jobs: PreDueJobDraft[] = [];
  for (const draft of input.drafts) {
    const dueAt = new Date(draft.dueAt).getTime();
    if (!Number.isFinite(dueAt)) continue;
    const fireAt = dueAt - input.leadTimeMs;
    if (fireAt <= dueAt) {
      jobs.push({
        jobId: `job_${PAYMENT_PRE_DUE_JOB_TYPE}_${draft.scheduleEntryId}_${draft.paymentType}`,
        jobType: PAYMENT_PRE_DUE_JOB_TYPE,
        aggregateType: 'contract',
        aggregateId: input.contractId,
        dueAt: new Date(fireAt).toISOString(),
        idempotencyKey: `${draft.id}:${PAYMENT_PRE_DUE_JOB_TYPE}:${input.leadTimeMs}`,
        reference: draft.scheduleEntryId,
        paymentId: draft.id,
        paymentType: draft.paymentType,
        monthNumber: draft.monthNumber,
        periodKey: draft.periodKey,
        leadTimeMs: input.leadTimeMs,
      });
    }
  }
  return jobs;
}

/**
 * Le rappel pré-échéance ne peut rien notifier tant qu'aucun canal n'existe : il
 * consigne une évaluation, avec le type de notification RÉEL le plus proche du
 * modèle (aucun type nouveau inventé).
 */
export const PRE_DUE_NOTIFICATION_TYPES: Record<PaymentType, 'MONTHLY_CHECKPOINT' | 'COMMISSION_DUE'> = {
  SALARY: 'MONTHLY_CHECKPOINT',
  PLATFORM_FEE: 'COMMISSION_DUE',
};

export type PreDueEligibility =
  | { readonly kind: 'NOT_YET_DUE'; readonly status: PaymentLifecycleStatus }
  | { readonly kind: 'ALREADY_DUE' }
  | { readonly kind: 'SETTLED'; readonly status: PaymentLifecycleStatus };

export function evaluatePreDueReminder(status: PaymentLifecycleStatus): PreDueEligibility {
  if (status === 'SCHEDULED') return { kind: 'NOT_YET_DUE', status };
  if (status === 'DUE' || status === 'REJECTED') return { kind: 'ALREADY_DUE' };
  return { kind: 'SETTLED', status };
}

/* ------------------------------------------------------------------ */
/* 13. Hors périmètre — documenté, jamais deviné                        */
/* ------------------------------------------------------------------ */

/**
 * Abstraction PRÉPARÉE pour l'étape réelle (aucune implémentation ici).
 * `PaymentProviderAdapter` n'a volontairement AUCUNE implémentation, AUCUN
 * import réseau et AUCUN enregistrement : le seul service branché en P0-PAY-1
 * est la vérification locale déterministe.
 */
export interface PaymentProviderAdapterContract {
  readonly providerId: string;
  readonly implemented: false;
  readonly reason: string;
}

export const PAYMENT_PROVIDER_ADAPTERS: readonly PaymentProviderAdapterContract[] = [
  { providerId: 'MTN', implemented: false, reason: 'Aucun branchement opérateur dans cette tranche.' },
  { providerId: 'Orange', implemented: false, reason: 'Aucun branchement opérateur dans cette tranche.' },
  { providerId: 'Moov', implemented: false, reason: 'Aucun branchement opérateur dans cette tranche.' },
  { providerId: 'Wave', implemented: false, reason: 'Aucun branchement opérateur dans cette tranche.' },
  { providerId: 'AGGREGATOR', implemented: false, reason: 'Aucun agrégateur dans cette tranche.' },
] as const;

/** Ce que l'intégration réelle devra apporter (aucun de ces points n'est fait ici). */
export const REAL_PAYMENT_INTEGRATION_REQUIREMENTS = [
  'Brancher `PaymentProviderAdapter.verifyTransaction()` sur un fournisseur réel (MTN / Orange / Moov / Wave / agrégateur) derrière un secret, puis décider le timeout et le retry.',
  'Exposer un webhook fournisseur SÉCURISÉ (signature vérifiée, replay protégé par `automation_idempotency`) qui écrive PENDING_VERIFICATION depuis l’extérieur, sans jamais accepter un statut fourni par le client.',
  'Implémenter `reconcile()` (rapprochement de masse) et décider la tolérance de montant, aujourd’hui inexistante dans le modèle.',
  'Décider la règle de versement partiel : le modèle ne connaît qu’un montant dû exact (`amountDue`), aucune règle de prorata n’existe.',
  'Remplacer la vérification locale déterministe par la preuve fournisseur avant de considérer un paiement `PAID` en production.',
  'Brancher le module Notifications sur les événements `PAYMENT_*` produits (consumer, destinataires, canaux).',
  'Déployer le déclencheur (`scheduled()` / Cron) qui appellera `AutomationEngine` → `drain()` : le point d’entrée est préparé, aucune planification de production n’est installée.',
] as const;

/** Rappel explicite : AUCUN argent réel, AUCUN fournisseur, AUCUN KYC ici. */
export const REAL_PAYMENT_OUT_OF_SCOPE = [
  'Aucun appel Mobile Money, aucun débit, aucun transfert : `PAID` est un état métier, pas un mouvement de fonds.',
  'Aucune API opérateur (MTN / Orange / Moov / Wave), aucun agrégateur, aucun SMS Gateway, aucun webhook fournisseur.',
  'Aucun KYC, aucune collecte d’identité, aucun R2 documentaire : l’inscription reste sans KYC ; les pièces requises relèvent de l’offre, à l’étape R2.',
  'Aucune modification de `commission_percentage` (25) ni d’aucun pourcentage du modèle.',
  'Aucune transformation automatique de la commission en salaire, et inversement.',
  'Aucun `FILLED` / `HIRED` / `CONTRACTED` / `CLOSED_OFFER_FILLED`, aucune fermeture automatique de candidatures.',
  'Aucun cron de production, aucun timer applicatif.',
] as const;

/** Règles qui restent ABSENTES du modèle et que cette tranche refuse d'inventer. */
export const MISSING_PAYMENT_CYCLE_RULES = [
  'Aucune règle du modèle ne définit un versement partiel ou un prorata : la déclaration doit porter le montant dû exact, sinon la transition est refusée.',
  'Aucune règle du modèle ne définit une tolérance de rapprochement (écart de montant ou de date admis) : la vérification locale est strictement exacte.',
  'Aucune règle du modèle ne définit l’avance de rappel pré-échéance : `leadTimeMs` reste à décider (voir `PRE_DUE_REMINDER_CONFIGURATION`).',
  'Aucune règle du modèle ne définit la cadence d’un contrat hebdomadaire ou au forfait : aucun paiement n’est créé pour ces périodicités.',
  'Aucune règle du modèle ne définit la réouverture d’un échéancier après `TERMINATED` / `COMPLETED` : le gel et la reprise restent à la tranche incidents/paiements.',
  'Aucune règle du modèle ne définit un canal de notification : les événements `PAYMENT_*` sont produits sans consumer.',
] as const;

/** Le pourcentage du modèle, lu et vérifié, jamais réécrit par cette tranche. */
export const MODEL_COMMISSION_PERCENTAGE = 25;

/** Utilitaire interne exposé pour les tests : une échéance est-elle atteinte ? */
export function isPaymentPeriodDue(dueAt: string, evaluatedAt: string): boolean {
  return new Date(dueAt).getTime() <= new Date(evaluatedAt).getTime();
}

/* ------------------------------------------------------------------ */
/* 14. P0-PAY-2 — Modèles normalisés & Réconciliation pure            */
/* ------------------------------------------------------------------ */

export type NormalizedTransactionStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'UNKNOWN';

/**
 * Modèle normalisé interne d'une transaction de paiement externe.
 * Le cœur métier LE LABEUR ne dépend jamais directement du format MTN/Orange/Moov/Wave.
 */
export interface NormalizedPaymentTransaction {
  provider: string;
  externalTransactionId: string;
  reference: string;
  amount: number;
  currency: string;
  payer: string;
  recipient: string;
  occurredAt: string;
  rawPayload?: unknown;
  status: NormalizedTransactionStatus;
}

export interface NormalizedVerificationResult {
  verified: boolean;
  provider: string;
  externalTransactionId: string;
  providerStatus: NormalizedTransactionStatus | string;
  transaction?: NormalizedPaymentTransaction;
  reasons?: readonly string[];
  rawPayload?: unknown;
}

export interface NormalizedWebhookResult {
  accepted: boolean;
  provider: string;
  eventType: string;
  externalTransactionId: string;
  reference: string;
  amount: number;
  currency: string;
  payer: string;
  recipient: string;
  occurredAt: string;
  status: NormalizedTransactionStatus;
  transaction?: NormalizedPaymentTransaction;
  rawPayload?: unknown;
  idempotencyKey?: string;
  reasons?: readonly string[];
}

export type ReconciliationVerdict =
  | 'MATCH'
  | 'MISMATCH'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'REVIEW_REQUIRED';

export interface ReconciliationComparison {
  field: 'provider' | 'externalTransactionId' | 'reference' | 'amount' | 'currency' | 'payer' | 'recipient' | 'date';
  expected: unknown;
  actual: unknown;
  matched: boolean;
  detail?: string;
}

export interface NormalizedReconciliationResult {
  verdict: ReconciliationVerdict;
  paymentId: string;
  provider: string;
  externalTransactionId?: string;
  reference?: string;
  comparisons: readonly ReconciliationComparison[];
  reasons: readonly string[];
  reconciledAt: string;
  externalTransaction?: NormalizedPaymentTransaction;
}

export interface ReconciliationInput {
  expected: {
    paymentId: string;
    contractId?: string;
    paymentType?: PaymentType;
    provider?: string;
    externalTransactionId?: string;
    reference?: string;
    amount: number;
    currency: string;
    payer: string;
    recipient: string;
    scheduledAt?: string;
    dueAt?: string;
    isDuplicate?: boolean;
  };
  actual?: NormalizedPaymentTransaction | null;
  reconciledAt: string;
}

/**
 * Évalue la réconciliation pure entre une écriture LE LABEUR et une source externe.
 * Compare au minimum : provider, externalTransactionId, reference, amount, currency,
 * payer, recipient, date/heure pertinente.
 */
export function evaluateReconciliation(input: ReconciliationInput): NormalizedReconciliationResult {
  const { expected, actual, reconciledAt } = input;
  const reasons: string[] = [];
  const comparisons: ReconciliationComparison[] = [];

  if (expected.isDuplicate) {
    reasons.push('Transaction externe déjà associée à un autre paiement.');
    return {
      verdict: 'DUPLICATE',
      paymentId: expected.paymentId,
      provider: expected.provider ?? actual?.provider ?? 'UNKNOWN',
      externalTransactionId: expected.externalTransactionId ?? actual?.externalTransactionId,
      reference: expected.reference ?? actual?.reference,
      comparisons,
      reasons,
      reconciledAt,
      ...(actual ? { externalTransaction: actual } : {}),
    };
  }

  if (!actual) {
    reasons.push('Aucune transaction externe trouvée pour ce paiement.');
    return {
      verdict: 'NOT_FOUND',
      paymentId: expected.paymentId,
      provider: expected.provider ?? 'UNKNOWN',
      externalTransactionId: expected.externalTransactionId,
      reference: expected.reference,
      comparisons,
      reasons,
      reconciledAt,
    };
  }

  // 1. Provider
  const providerMatched = !expected.provider || expected.provider.toUpperCase() === actual.provider.toUpperCase();
  comparisons.push({
    field: 'provider',
    expected: expected.provider ?? actual.provider,
    actual: actual.provider,
    matched: providerMatched,
    ...(providerMatched ? {} : { detail: `Fournisseur attendu « ${expected.provider} », reçu « ${actual.provider} ».` }),
  });
  if (!providerMatched) reasons.push(`Fournisseur discordant : attendu « ${expected.provider} », reçu « ${actual.provider} ».`);

  // 2. externalTransactionId
  const extTxMatched = !expected.externalTransactionId || expected.externalTransactionId === actual.externalTransactionId;
  comparisons.push({
    field: 'externalTransactionId',
    expected: expected.externalTransactionId ?? actual.externalTransactionId,
    actual: actual.externalTransactionId,
    matched: extTxMatched,
    ...(extTxMatched ? {} : { detail: `Identifiant transaction externe discordant.` }),
  });
  if (!extTxMatched) reasons.push(`Identifiant transaction externe discordant : attendu « ${expected.externalTransactionId} », reçu « ${actual.externalTransactionId} ».`);

  // 3. Reference
  const refMatched = !expected.reference || expected.reference.trim() === actual.reference.trim();
  comparisons.push({
    field: 'reference',
    expected: expected.reference ?? actual.reference,
    actual: actual.reference,
    matched: refMatched,
    ...(refMatched ? {} : { detail: `Référence attendue « ${expected.reference} », reçue « ${actual.reference} ».` }),
  });
  if (!refMatched) reasons.push(`Référence discordante : attendue « ${expected.reference} », reçue « ${actual.reference} ».`);

  // 4. Amount (exactitude stricte)
  const amountMatched = expected.amount === actual.amount;
  comparisons.push({
    field: 'amount',
    expected: expected.amount,
    actual: actual.amount,
    matched: amountMatched,
    ...(amountMatched ? {} : { detail: `Montant attendu ${expected.amount}, reçu ${actual.amount}.` }),
  });
  if (!amountMatched) reasons.push(`Montant discordant : attendu ${expected.amount}, reçu ${actual.amount}.`);

  // 5. Currency (insensible à la casse)
  const currencyMatched = expected.currency.toUpperCase() === actual.currency.toUpperCase();
  comparisons.push({
    field: 'currency',
    expected: expected.currency,
    actual: actual.currency,
    matched: currencyMatched,
    ...(currencyMatched ? {} : { detail: `Devise attendue ${expected.currency}, reçue ${actual.currency}.` }),
  });
  if (!currencyMatched) reasons.push(`Devise discordante : attendue ${expected.currency}, reçue ${actual.currency}.`);

  // 6. Payer
  const payerMatched = !expected.payer || expected.payer === actual.payer;
  comparisons.push({
    field: 'payer',
    expected: expected.payer,
    actual: actual.payer,
    matched: payerMatched,
    ...(payerMatched ? {} : { detail: `Payeur attendu « ${expected.payer} », reçu « ${actual.payer} ».` }),
  });
  if (!payerMatched) reasons.push(`Payeur discordant : attendu « ${expected.payer} », reçu « ${actual.payer} ».`);

  // 7. Recipient
  const recipientMatched = !expected.recipient || expected.recipient === actual.recipient;
  comparisons.push({
    field: 'recipient',
    expected: expected.recipient,
    actual: actual.recipient,
    matched: recipientMatched,
    ...(recipientMatched ? {} : { detail: `Destinataire attendu « ${expected.recipient} », reçu « ${actual.recipient} ».` }),
  });
  if (!recipientMatched) reasons.push(`Destinataire discordant : attendu « ${expected.recipient} », reçu « ${actual.recipient} ».`);

  // 8. Date pertinente
  const dateValid = !Number.isNaN(Date.parse(actual.occurredAt));
  comparisons.push({
    field: 'date',
    expected: expected.dueAt ?? expected.scheduledAt ?? actual.occurredAt,
    actual: actual.occurredAt,
    matched: dateValid,
    ...(dateValid ? {} : { detail: `Date d'occurrence externe illisible : ${actual.occurredAt}.` }),
  });
  if (!dateValid) reasons.push(`Date d'occurrence externe illisible : ${actual.occurredAt}.`);

  let verdict: ReconciliationVerdict;
  if (actual.status === 'UNKNOWN' || !dateValid) {
    verdict = 'REVIEW_REQUIRED';
  } else if (actual.status === 'FAILED' || actual.status === 'CANCELLED' || actual.status === 'REJECTED') {
    verdict = 'MISMATCH';
    reasons.push(`Statut de la transaction externe défavorable : « ${actual.status} ».`);
  } else if (reasons.length > 0) {
    verdict = 'MISMATCH';
  } else {
    verdict = 'MATCH';
  }

  return {
    verdict,
    paymentId: expected.paymentId,
    provider: actual.provider,
    externalTransactionId: actual.externalTransactionId,
    reference: actual.reference,
    comparisons,
    reasons,
    reconciledAt,
    externalTransaction: actual,
  };
}
