/**
 * LE LABEUR — P0-AUTO-2 — règles d'automatisation contractuelle.
 *
 * Module PUR : aucune dépendance serveur, aucun accès base, aucun effet de bord.
 * Il transpose les règles qui EXISTENT déjà dans le modèle réel et signale
 * explicitement celles qui n'existent pas — jamais il n'en invente.
 *
 * Sources réelles transposées ici (aucune autre) :
 *  - cadence et montants de l'échéancier : `src/domain/businessRules.ts`
 *    (`buildPaymentSchedule`, `addMonthsClamped`, `parseContractStartDate`,
 *    `calculateFirstMonthCommission`, `calculateFirstMonthEmployeeShare`) ;
 *  - forme du point de contrôle M1 et du grand livre de commission M1 :
 *    `MockRepository.generateContract` (`src/repositories/mockRepository.ts`) ;
 *  - règle J+3 : `J3_SCHEDULER_CONTRACT` (`src/backend/services/scheduler.ts`)
 *    et `MockRepository.syncPaymentSchedule` (`if (daysLate < 3) continue;`) ;
 *  - types de notification des rappels : `NotificationType`
 *    (`src/types/index.ts`) — `MONTHLY_CHECKPOINT`, `COMMISSION_DUE`,
 *    `PAYMENT_OVERDUE_J3` ;
 *  - périodicités réelles : `PROPOSAL_PERIODICITY_VALUES`
 *    (`src/domain/proposalTransitions.ts`) ;
 *  - pourcentage de commission : `contracts.commission_percentage`
 *    (migration `0003`, défaut 25) — valeur LUE, jamais réécrite ici.
 *
 * Ce que ce module REFUSE de produire (règles absentes du modèle) :
 *  - la cadence d'un contrat `Hebdomadaire` ;
 *  - la cadence d'un contrat `Forfait mission` ;
 *  - un délai de rappel AVANT l'échéance ;
 *  - le basculement `SCHEDULED → DUE` (cycle paiements, non ouvert) ;
 *  - `FILLED` / `HIRED` / `CONTRACTED` / `CLOSED_OFFER_FILLED`
 *    (tranche post-contractuelle dédiée).
 * Voir `MISSING_CONTRACT_AUTOMATION_RULES` et
 * `POST_CONTRACT_DEFERRED_AUTOMATION`.
 */

import type {
  CommissionLedgerEntry,
  CommissionPaymentStatus,
  MonthlyFollowupCheckpoint,
  NotificationType,
  PaymentScheduleEntry,
  SalaryPaymentStatus,
} from '../types';
import {
  buildPaymentSchedule,
  calculateFirstMonthCommission,
  calculateFirstMonthEmployeeShare,
} from './businessRules';
import { PROPOSAL_PERIODICITY_VALUES } from './proposalTransitions';

/* ------------------------------------------------------------------ */
/* Constantes dérivées du modèle réel (jamais inventées)                */
/* ------------------------------------------------------------------ */

/** Millisecondes d'un jour — diviseur réel de `J3_SCHEDULER_CONTRACT.fullDaysLate`. */
export const MS_PER_DAY = 86_400_000;

/**
 * Seuil J+3 RÉEL du modèle.
 * Sources : `J3_SCHEDULER_CONTRACT.thresholdDays` et
 * `MockRepository.syncPaymentSchedule` (`const daysLate = …; if (daysLate < 3) continue;`).
 * La cohérence avec `J3_SCHEDULER_CONTRACT` est vérifiée par un test.
 */
export const PAYMENT_OVERDUE_GRACE_DAYS = 3;

/** Grâce d'une échéance, en ms, dérivée du seuil J+3 ci-dessus. */
export const PAYMENT_OVERDUE_GRACE_PERIOD_MS = PAYMENT_OVERDUE_GRACE_DAYS * MS_PER_DAY;

/**
 * Pourcentage de commission du modèle réel.
 * Sources concordantes : `migrations/0003_core_nucleus_alignment.sql`
 * (`commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 25`),
 * `MockRepository.generateContract` (`commissionPercentage: 25`),
 * `businessRules.getSalaryBreakdown` (`commissionRate: 0.25` en M1, `0` en M2+).
 *
 * P0-AUTO-2 NE MODIFIE PAS cette règle : la valeur appliquée à l'échéancier est
 * celle produite par `buildPaymentSchedule` (25 % en M1, 0 % ensuite), et la
 * valeur PERSISTÉE sur le contrat (`contracts.commission_percentage`) est LUE et
 * reportée telle quelle dans le grand livre, jamais réécrite.
 */
export const MODEL_COMMISSION_PERCENTAGE = 25;

/**
 * Statuts de rappel RÉELS (`J3_SCHEDULER_CONTRACT.alertStatuses` et
 * `blockEligibilityStatuses`). Aucune valeur ajoutée.
 */
export const REMINDER_ALERT_STATUSES = ['DUE'] as const;
export const REMINDER_BLOCK_ELIGIBILITY_STATUSES = ['DUE', 'REJECTED'] as const;

/** Statuts pour lesquels une échéance est déjà réglée ou sans objet. */
export const REMINDER_SETTLED_STATUSES = ['PAID', 'NOT_APPLICABLE'] as const;

/**
 * Seuil réel d'ignorance de la commission : `J3_SCHEDULER_CONTRACT
 * .ignoreCommissionWhenAtOrBelow = 0` et `MockRepository.getOverdueDueEntries`
 * (`if (check.paymentKind === 'COMMISSION' && entry.commissionAmount <= 0) continue;`).
 */
export const COMMISSION_IGNORED_AT_OR_BELOW = 0;

/**
 * Modèle de date RÉEL : `J3_SCHEDULER_CONTRACT.currentDateModel`
 * (« date-only YYYY-MM-DD parsed at 00:00 UTC »), identique à
 * `businessRules.isPaymentDue` (`new Date(\`${dateValue}T00:00:00.000Z\`)`).
 */
export function toUtcMidnight(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

/** Nombre de jours entiers de retard, formule réelle `floor((eval - dueAt) / 86 400 000)`. */
export function fullDaysLate(dueAt: string, evaluatedAt: string): number {
  const due = new Date(dueAt).getTime();
  const evaluated = new Date(evaluatedAt).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(evaluated)) return 0;
  return Math.floor((evaluated - due) / MS_PER_DAY);
}

function addDaysToUtcMidnight(dateOnly: string, days: number): string {
  const base = new Date(toUtcMidnight(dateOnly));
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Date d’échéance invalide : ${dateOnly}`);
  }
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString();
}

/* ------------------------------------------------------------------ */
/* Périodicité : la seule cadence définie par le modèle est MENSUELLE    */
/* ------------------------------------------------------------------ */

/**
 * Unique cadence pour laquelle une règle métier EXISTE dans le code :
 * `buildPaymentSchedule` raisonne exclusivement en mois (`durationMonths`,
 * `addMonthsClamped`, `monthNumber`, `periodKey` « Mois NN »).
 */
export const SCHEDULE_CADENCES = ['MONTHLY'] as const;

export type ScheduleCadence = (typeof SCHEDULE_CADENCES)[number];

export interface SchedulePeriodicityRule {
  /** Valeur réelle de `contracts.periodicity` / `proposals.periodicity`. */
  readonly periodicity: string;
  /** `true` uniquement si une règle de cadence existe dans le code. */
  readonly ruleDefined: boolean;
  readonly cadence: ScheduleCadence | null;
  /** Emplacement exact de la règle transposée (preuve). */
  readonly ruleSource: string | null;
  /** Règle manquante, explicitement documentée (jamais inventée). */
  readonly missingRule: string | null;
}

const MONTHLY_RULE_SOURCE =
  'src/domain/businessRules.ts → buildPaymentSchedule (parseContractStartDate, addMonthsClamped, durationMonths, periodKey « Mois NN »)';

/**
 * Table de configuration des périodicités RÉELLES du domaine
 * (`PROPOSAL_PERIODICITY_VALUES`, contrainte SQL `proposals_periodicity_domain`).
 *
 * `Hebdomadaire` et `Forfait mission` sont des périodicités valides du modèle,
 * mais AUCUNE règle de cadence n'existe pour elles dans le code : la créer
 * reviendrait à inventer une conversion (interdit par cette tranche). Elles sont
 * donc représentées ici comme « règle manquante » et l'automatisation ne produit
 * pour elles AUCUN échéancier, AUCUNE échéance et AUCUN rappel.
 */
export const SCHEDULE_PERIODICITY_RULES: Record<string, SchedulePeriodicityRule> = {
  Mensuel: {
    periodicity: 'Mensuel',
    ruleDefined: true,
    cadence: 'MONTHLY',
    ruleSource: MONTHLY_RULE_SOURCE,
    missingRule: null,
  },
  Hebdomadaire: {
    periodicity: 'Hebdomadaire',
    ruleDefined: false,
    cadence: null,
    ruleSource: null,
    missingRule:
      'Aucune règle du modèle ne définit la cadence d’un contrat hebdomadaire : '
      + 'nombre de périodes, jour de paie hebdomadaire, rattachement à `durationMonths` '
      + 'et prorata de la commission de 25 % sont indéterminés. Aucune conversion '
      + 'hebdomadaire → mensuelle n’est appliquée.',
  },
  'Forfait mission': {
    periodicity: 'Forfait mission',
    ruleDefined: false,
    cadence: null,
    ruleSource: null,
    missingRule:
      'Aucune règle du modèle ne définit la cadence d’un contrat au forfait : '
      + 'le forfait est un montant unique sans périodicité, alors que `buildPaymentSchedule` '
      + 'raisonne en mois. Nombre d’échéances, jalons de paiement et assiette de la '
      + 'commission de 25 % sont indéterminés. Aucune conversion forfait → mensuel n’est appliquée.',
  },
};

/**
 * Résout la règle d'une périodicité. `contracts.periodicity` est un `TEXT` libre
 * en SQL (migration 0003, défaut « Mensuel ») : toute valeur hors du domaine des
 * propositions est traitée comme « règle manquante », jamais devinée.
 */
export function resolveSchedulePeriodicityRule(periodicity: string): SchedulePeriodicityRule {
  const known = SCHEDULE_PERIODICITY_RULES[periodicity];
  if (known) return known;
  return {
    periodicity,
    ruleDefined: false,
    cadence: null,
    ruleSource: null,
    missingRule:
      `Périodicité « ${periodicity} » hors du domaine réel `
      + `(${PROPOSAL_PERIODICITY_VALUES.join(', ')}) : aucune règle de cadence applicable, `
      + 'aucun échéancier inventé.',
  };
}

/* ------------------------------------------------------------------ */
/* Échéancier salarial + échéancier de commission                       */
/* ------------------------------------------------------------------ */

/** Données du contrat réellement nécessaires à l'échéancier (aucune autre). */
export interface ContractScheduleSource {
  readonly contractId: string;
  readonly employerId: string;
  readonly employeeId: string;
  readonly monthlySalary: number;
  readonly currency: string;
  readonly startDate: string;
  readonly durationMonths: number;
  readonly periodicity: string;
  /** Valeur PERSISTÉE du contrat (`contracts.commission_percentage`), jamais réécrite. */
  readonly commissionPercentage: number;
  readonly additionalNotes?: string;
}

export interface ScheduledContractPlan {
  readonly kind: 'SCHEDULED';
  readonly cadence: ScheduleCadence;
  /** Échéancier salarial ET de commission : une entrée porte les deux (modèle réel). */
  readonly paymentSchedule: readonly PaymentScheduleEntry[];
  /** Point de contrôle M1, forme réelle de `MockRepository.generateContract`. */
  readonly monthlyCheckpoints: readonly MonthlyFollowupCheckpoint[];
  /** Grand livre de commission M1, forme réelle de `MockRepository.generateContract`. */
  readonly commissionLedger: readonly CommissionLedgerEntry[];
  readonly commissionAmountDue: number;
  readonly commissionStatus: CommissionPaymentStatus;
  readonly commissionPercentage: number;
}

export interface DeferredContractPlan {
  readonly kind: 'RULE_MISSING';
  readonly periodicity: string;
  readonly missingRule: string;
}

export type ContractActivationPlan = ScheduledContractPlan | DeferredContractPlan;

/**
 * Construit l'échéancier réel d'un contrat activé.
 *
 * La règle appliquée est EXCLUSIVEMENT `buildPaymentSchedule` : mêmes
 * identifiants d'entrée (`PSE-<contractId>-M<n>`), mêmes `periodKey`, mêmes
 * échéances (`addMonthsClamped`), même répartition 25 % / 75 % en M1 et 0 % /
 * 100 % ensuite, mêmes statuts initiaux (`SCHEDULED`, commission M2+
 * `NOT_APPLICABLE`).
 *
 * Aucun paiement n'est effectué, aucun statut n'est basculé vers `DUE` : ce
 * basculement appartient au cycle paiements (`MockRepository.syncPaymentSchedule`
 * / `advanceContractMonth`), non ouvert par cette tranche.
 */
export function buildContractActivationPlan(
  source: ContractScheduleSource,
  occurredAt: string,
): ContractActivationPlan {
  const rule = resolveSchedulePeriodicityRule(source.periodicity);
  if (!rule.ruleDefined) {
    return {
      kind: 'RULE_MISSING',
      periodicity: source.periodicity,
      missingRule: rule.missingRule ?? 'Règle de cadence indéterminée.',
    };
  }

  const paymentSchedule = buildPaymentSchedule({
    contractId: source.contractId,
    startDate: source.startDate,
    durationMonths: source.durationMonths,
    monthlySalary: source.monthlySalary,
    currency: source.currency,
    createdAt: occurredAt,
  });

  const firstMonthCommission = calculateFirstMonthCommission(source.monthlySalary);
  const firstMonthEmployeeShare = calculateFirstMonthEmployeeShare(source.monthlySalary);
  const firstEntry = paymentSchedule[0];

  const monthlyCheckpoints: MonthlyFollowupCheckpoint[] = firstEntry
    ? [{
        monthNumber: 1,
        periodKey: firstEntry.periodKey,
        salaryAmount: source.monthlySalary,
        employeeShareAmount: firstMonthEmployeeShare,
        leLabeurShareAmount: firstMonthCommission,
        currency: source.currency,
        isStarted: false,
        isSalaryPaidToEmployee: false,
        employerConfirmed: false,
        employeeConfirmed: false,
        notes: 'Contrat actif : échéancier salarial et de commission créé par l’automatisation (P0-AUTO-2).',
      }]
    : [];

  const commissionLedger: CommissionLedgerEntry[] = firstEntry && firstMonthCommission > 0
    ? [{
        contractId: source.contractId,
        monthNumber: 1,
        salaryBase: source.monthlySalary,
        // Valeur PERSISTÉE du contrat, reportée telle quelle (jamais réécrite).
        percentage: source.commissionPercentage,
        amountDue: firstMonthCommission,
        amountSubmitted: 0,
        status: 'SCHEDULED',
        createdAt: occurredAt,
      }]
    : [];

  return {
    kind: 'SCHEDULED',
    cadence: rule.cadence ?? 'MONTHLY',
    paymentSchedule,
    monthlyCheckpoints,
    commissionLedger,
    commissionAmountDue: firstMonthCommission,
    commissionStatus: firstMonthCommission > 0 ? 'SCHEDULED' : 'NOT_APPLICABLE',
    commissionPercentage: source.commissionPercentage,
  };
}

/* ------------------------------------------------------------------ */
/* Échéances (Deadline / SLA)                                           */
/* ------------------------------------------------------------------ */

export const SCHEDULE_DEADLINE_KINDS = ['SALARY_PAYMENT', 'COMMISSION_PAYMENT'] as const;

export type ScheduleDeadlineKind = (typeof SCHEDULE_DEADLINE_KINDS)[number];

export type PaymentKind = 'SALARY' | 'COMMISSION';

/** SLA nommés d'après l'échéance réelle qu'ils portent (aucune durée inventée). */
export const SCHEDULE_DEADLINE_SLA: Record<ScheduleDeadlineKind, string> = {
  SALARY_PAYMENT: 'SALARY_PAYMENT_DUE',
  COMMISSION_PAYMENT: 'COMMISSION_PAYMENT_DUE',
};

/** Escalade RÉELLE d'une échéance non régularisée (`J3_SCHEDULER_CONTRACT.domainEvent`). */
export const PAYMENT_DEADLINE_ESCALATION = 'PAYMENT_OVERDUE_J3';

export interface ScheduleDeadlineDraft {
  readonly id: string;
  readonly aggregateType: 'contract';
  readonly aggregateId: string;
  readonly kind: ScheduleDeadlineKind;
  readonly paymentKind: PaymentKind;
  /** `YYYY-MM-DDT00:00:00.000Z` — modèle de date réel, jamais une heure inventée. */
  readonly dueAt: string;
  readonly dueDate: string;
  readonly sla: string;
  readonly gracePeriodMs: number;
  readonly escalation: string;
  /** Identifiant de l'entrée d'échéancier (`PaymentScheduleEntry.id`). */
  readonly reference: string;
  readonly idempotencyKey: string;
  readonly monthNumber: number;
  readonly periodKey: string;
  readonly amount: number;
  readonly currency: string;
}

function deadlineKindFor(paymentKind: PaymentKind): ScheduleDeadlineKind {
  return paymentKind === 'SALARY' ? 'SALARY_PAYMENT' : 'COMMISSION_PAYMENT';
}

/**
 * Construit les échéances de paiement d'un échéancier.
 *
 * Une échéance SALAIRE par période ; une échéance COMMISSION uniquement quand la
 * commission est strictement positive (règle réelle
 * `ignoreCommissionWhenAtOrBelow = 0`, donc la commission M2+ — `NOT_APPLICABLE`
 * et nulle — ne produit aucune échéance).
 */
export function buildScheduleDeadlines(
  contractId: string,
  paymentSchedule: readonly PaymentScheduleEntry[],
): ScheduleDeadlineDraft[] {
  const deadlines: ScheduleDeadlineDraft[] = [];
  for (const entry of paymentSchedule) {
    const candidates: Array<{ paymentKind: PaymentKind; dueDate: string; amount: number }> = [
      { paymentKind: 'SALARY', dueDate: entry.salaryDueDate, amount: entry.salaryAmount },
      { paymentKind: 'COMMISSION', dueDate: entry.commissionDueDate, amount: entry.commissionAmount },
    ];
    for (const candidate of candidates) {
      if (candidate.paymentKind === 'COMMISSION' && candidate.amount <= COMMISSION_IGNORED_AT_OR_BELOW) continue;
      const kind = deadlineKindFor(candidate.paymentKind);
      deadlines.push({
        id: `dl_${kind}_${entry.id}`,
        aggregateType: 'contract',
        aggregateId: contractId,
        kind,
        paymentKind: candidate.paymentKind,
        dueAt: toUtcMidnight(candidate.dueDate),
        dueDate: candidate.dueDate,
        sla: SCHEDULE_DEADLINE_SLA[kind],
        gracePeriodMs: PAYMENT_OVERDUE_GRACE_PERIOD_MS,
        escalation: PAYMENT_DEADLINE_ESCALATION,
        reference: entry.id,
        idempotencyKey: `${contractId}:${kind}:${entry.id}`,
        monthNumber: entry.monthNumber,
        periodKey: entry.periodKey,
        amount: candidate.amount,
        currency: entry.currency,
      });
    }
  }
  return deadlines;
}

/* ------------------------------------------------------------------ */
/* Jobs de rappel                                                       */
/* ------------------------------------------------------------------ */

/**
 * Quatre types de rappel, tous dérivés du comportement RÉEL du modèle :
 *  - à l'échéance : salaire → `MONTHLY_CHECKPOINT`, commission → `COMMISSION_DUE`
 *    (`MockRepository.syncPaymentSchedule`) ;
 *  - à J+3 : `PAYMENT_OVERDUE_J3` pour les deux natures
 *    (`MockRepository.syncPaymentSchedule`, `J3_SCHEDULER_CONTRACT`).
 *
 * Aucun type de notification n'est inventé : les quatre valeurs existent dans
 * `NotificationType` (`src/types/index.ts`).
 */
export const REMINDER_JOB_TYPES = [
  'SALARY_DUE_REMINDER',
  'COMMISSION_DUE_REMINDER',
  'SALARY_OVERDUE_J3_REMINDER',
  'COMMISSION_OVERDUE_J3_REMINDER',
] as const;

export type ReminderJobType = (typeof REMINDER_JOB_TYPES)[number];

export const REMINDER_STAGES = ['DUE', 'J3'] as const;

export type ReminderStage = (typeof REMINDER_STAGES)[number];

export const REMINDER_NOTIFICATION_TYPES: Record<ReminderJobType, NotificationType> = {
  SALARY_DUE_REMINDER: 'MONTHLY_CHECKPOINT',
  COMMISSION_DUE_REMINDER: 'COMMISSION_DUE',
  SALARY_OVERDUE_J3_REMINDER: 'PAYMENT_OVERDUE_J3',
  COMMISSION_OVERDUE_J3_REMINDER: 'PAYMENT_OVERDUE_J3',
};

export function reminderJobType(paymentKind: PaymentKind, stage: ReminderStage): ReminderJobType {
  if (stage === 'DUE') {
    return paymentKind === 'SALARY' ? 'SALARY_DUE_REMINDER' : 'COMMISSION_DUE_REMINDER';
  }
  return paymentKind === 'SALARY' ? 'SALARY_OVERDUE_J3_REMINDER' : 'COMMISSION_OVERDUE_J3_REMINDER';
}

export interface ReminderJobDraft {
  readonly jobId: string;
  readonly jobType: ReminderJobType;
  readonly aggregateType: 'contract';
  readonly aggregateId: string;
  readonly dueAt: string;
  readonly idempotencyKey: string;
  readonly paymentKind: PaymentKind;
  readonly stage: ReminderStage;
  readonly notificationType: NotificationType;
  /** Identifiant de l'échéance (`automation_deadlines.id`) portée par ce rappel. */
  readonly deadlineId: string;
  readonly reference: string;
  readonly monthNumber: number;
  readonly periodKey: string;
  readonly dueDate: string;
  readonly amount: number;
  readonly currency: string;
}

/**
 * Construit les jobs de rappel associés aux échéances.
 *
 * Clé d'idempotence conforme au contrat documenté de l'outbox
 * (`OUTBOX_EFFECT_CONTRACTS`, `PAYMENT_OVERDUE_J3` : « schedule-entry +
 * payment-kind + due-date + J3 »), étendue au rappel à échéance avec le
 * suffixe `DUE`.
 *
 * Ces jobs sont PRÉPARÉS, pas exécutés à la création : aucun canal de
 * notification n'existe dans cette tranche.
 */
export function buildReminderJobs(
  contractId: string,
  deadlines: readonly ScheduleDeadlineDraft[],
): ReminderJobDraft[] {
  const jobs: ReminderJobDraft[] = [];
  for (const deadline of deadlines) {
    for (const stage of REMINDER_STAGES) {
      const jobType = reminderJobType(deadline.paymentKind, stage);
      const dueAt = stage === 'DUE'
        ? deadline.dueAt
        : addDaysToUtcMidnight(deadline.dueDate, PAYMENT_OVERDUE_GRACE_DAYS);
      jobs.push({
        jobId: `job_${jobType}_${deadline.reference}`,
        jobType,
        aggregateType: 'contract',
        aggregateId: contractId,
        dueAt,
        idempotencyKey: `${deadline.reference}:${deadline.paymentKind}:${deadline.dueDate}:${stage}`,
        paymentKind: deadline.paymentKind,
        stage,
        notificationType: REMINDER_NOTIFICATION_TYPES[jobType],
        deadlineId: deadline.id,
        reference: deadline.reference,
        monthNumber: deadline.monthNumber,
        periodKey: deadline.periodKey,
        dueDate: deadline.dueDate,
        amount: deadline.amount,
        currency: deadline.currency,
      });
    }
  }
  return jobs;
}

/* ------------------------------------------------------------------ */
/* Éligibilité d'un rappel (évaluation pure, statuts du modèle)          */
/* ------------------------------------------------------------------ */

export type ReminderEligibility =
  | { readonly kind: 'ELIGIBLE'; readonly daysLate: number }
  | { readonly kind: 'NOT_DUE_YET'; readonly daysLate: number }
  | { readonly kind: 'SETTLED'; readonly status: string }
  | { readonly kind: 'NOT_ELIGIBLE'; readonly status: string; readonly reason: string };

export interface ReminderEligibilityInput {
  readonly paymentKind: PaymentKind;
  readonly stage: ReminderStage;
  readonly amount: number;
  readonly dueAt: string;
  readonly status: SalaryPaymentStatus | CommissionPaymentStatus;
  readonly evaluatedAt: string;
}

/**
 * Évalue l'éligibilité d'un rappel contre les statuts RÉELS du modèle.
 *
 * Constat P0-AUTO-2 : à l'activation, `buildPaymentSchedule` produit
 * `SCHEDULED` (salaire) et `SCHEDULED` / `NOT_APPLICABLE` (commission). Le
 * basculement `SCHEDULED → DUE` est produit par le cycle paiements
 * (`MockRepository.syncPaymentSchedule`, `advanceContractMonth`), qui N'EST PAS
 * ouvert par cette tranche. Un rappel évalué sur une échéance encore `SCHEDULED`
 * est donc enregistré « non éligible » : aucun événement de notification n'est
 * produit, et rien n'est inventé pour le devenir.
 */
export function evaluateReminderEligibility(input: ReminderEligibilityInput): ReminderEligibility {
  if (input.paymentKind === 'COMMISSION' && input.amount <= COMMISSION_IGNORED_AT_OR_BELOW) {
    return {
      kind: 'NOT_ELIGIBLE',
      status: input.status,
      reason: 'Commission nulle ou négative : ignorée (règle réelle ignoreCommissionWhenAtOrBelow = 0).',
    };
  }
  if ((REMINDER_SETTLED_STATUSES as readonly string[]).includes(input.status)) {
    return { kind: 'SETTLED', status: input.status };
  }
  const daysLate = Math.max(0, fullDaysLate(input.dueAt, input.evaluatedAt));
  if (input.stage === 'J3' && daysLate < PAYMENT_OVERDUE_GRACE_DAYS) {
    return { kind: 'NOT_DUE_YET', daysLate };
  }
  const allowed = input.stage === 'J3'
    ? (REMINDER_BLOCK_ELIGIBILITY_STATUSES as readonly string[])
    : (REMINDER_ALERT_STATUSES as readonly string[]);
  if (!allowed.includes(input.status)) {
    return {
      kind: 'NOT_ELIGIBLE',
      status: input.status,
      reason:
        `Statut « ${input.status} » hors des statuts de rappel du modèle `
        + `(${allowed.join(', ')}). Le basculement vers DUE appartient au cycle paiements, non ouvert par P0-AUTO-2.`,
    };
  }
  return { kind: 'ELIGIBLE', daysLate };
}

/**
 * Statut d'échéance (`DeadlineStatus` de la fondation) après évaluation d'un
 * rappel : `OVERDUE` à l'échéance non réglée, `ESCALATED` à J+3, `MET` si
 * l'échéance est réglée. Aucun statut inventé.
 */
export function deadlineStatusAfterReminder(
  eligibility: ReminderEligibility,
  stage: ReminderStage,
): 'MET' | 'OVERDUE' | 'ESCALATED' | 'OPEN' {
  if (eligibility.kind === 'SETTLED') return 'MET';
  if (eligibility.kind === 'ELIGIBLE') return stage === 'J3' ? 'ESCALATED' : 'OVERDUE';
  return 'OPEN';
}

/* ------------------------------------------------------------------ */
/* Identifiants et clés déterministes (rejeu sans double effet)          */
/* ------------------------------------------------------------------ */

/** `DOCUMENTED_CONTRACT_EVENTS` : `dedupeKey: 'contractId + ACTIVATED'`. */
export function contractActivatedEventId(contractId: string): string {
  return `evt_contract_ACTIVATED_${contractId}`;
}

export function contractActivatedIdempotencyKey(contractId: string): string {
  return `${contractId}:CONTRACT_ACTIVATED`;
}

/** Identifiant déterministe d'un événement de rappel : dérivé du job qui le produit. */
export function reminderEventId(jobId: string): string {
  return `evt_notification_${jobId}`;
}

/**
 * Clé de déduplication de rappel, forme réelle du modèle
 * (`MockRepository.syncPaymentSchedule` : `${contract.id}:${entry.monthNumber}:${paymentKind}`
 * et `…:J3:EMPLOYER`). La déclinaison par destinataire (`…:EMPLOYER`,
 * `…:ADMIN:<adminId>`) appartient au module Notifications, non ouvert ici.
 */
export function reminderDedupeKey(input: {
  contractId: string;
  monthNumber: number;
  paymentKind: PaymentKind;
  stage: ReminderStage;
}): string {
  return `${input.contractId}:${input.monthNumber}:${input.paymentKind}:${input.stage}`;
}

/** Clé d'idempotence du traitement d'activation (actor `SYSTEM`). */
export const CONTRACT_ACTIVATION_COMMAND = 'automation.CONTRACT_ACTIVATED';
export const REMINDER_JOB_COMMAND = 'automation.REMINDER_JOB';
export const AUTOMATION_SYSTEM_ACTOR = 'SYSTEM';

/* ------------------------------------------------------------------ */
/* Actions d'audit                                                      */
/* ------------------------------------------------------------------ */

/**
 * Actions du ledger d'audit de l'automatisation.
 * `SCHEDULE_J3_ELIGIBILITY_RECORDED` est le nom RÉEL déjà documenté par
 * `J3_SCHEDULER_CONTRACT.futureAuditAction` ; les autres sont les libellés
 * P0-AUTO-2 des automatisations introduites ici.
 */
export const AUTOMATION_AUDIT_ACTIONS = {
  scheduleCreated: 'CONTRACT_SCHEDULE_CREATED',
  scheduleRuleMissing: 'CONTRACT_SCHEDULE_RULE_MISSING',
  deadlinesCreated: 'CONTRACT_PAYMENT_DEADLINES_CREATED',
  remindersScheduled: 'CONTRACT_REMINDER_JOBS_SCHEDULED',
  j3EligibilityRecorded: 'SCHEDULE_J3_ELIGIBILITY_RECORDED',
  dueReminderRecorded: 'SCHEDULE_DUE_REMINDER_RECORDED',
  duplicateSuppressed: 'AUTOMATION_DUPLICATE_SUPPRESSED',
  handlerFailed: 'AUTOMATION_HANDLER_FAILED',
} as const;

export type AutomationAuditAction =
  (typeof AUTOMATION_AUDIT_ACTIONS)[keyof typeof AUTOMATION_AUDIT_ACTIONS];

/** Champs d'audit RÉELS documentés par `J3_SCHEDULER_CONTRACT.futureAuditFields`. */
export const J3_AUDIT_FIELDS = [
  'scheduleEntryId',
  'paymentKind',
  'dueDate',
  'status',
  'daysLate',
  'outboxEventId',
] as const;

/**
 * Entrées d'historique métier AJOUTÉES au contrat par l'automatisation.
 * Elles s'ajoutent à `contracts.history` (historique métier existant, conservé)
 * et ne le remplacent jamais par le ledger d'audit.
 */
export const CONTRACT_AUTOMATION_HISTORY_EVENTS = {
  scheduleCreated: 'PAYMENT_SCHEDULE_CREATED',
  scheduleRuleMissing: 'PAYMENT_SCHEDULE_RULE_MISSING',
} as const;

/* ------------------------------------------------------------------ */
/* Représentation des règles manquantes (aucune n'est inventée)          */
/* ------------------------------------------------------------------ */

/**
 * Représentation/configuration d'une règle temporelle ABSENTE du modèle :
 * le rappel AVANT échéance. Aucune durée n'est inventée — le job n'est pas créé
 * tant que la règle n'est pas décidée.
 */
export const PRE_DUE_REMINDER_CONFIGURATION = {
  jobType: 'PRE_DUE_REMINDER',
  ruleDefined: false,
  /** `null` = aucune avance décidée ; jamais de valeur par défaut inventée. */
  leadTimeMs: null as number | null,
  missingRule:
    'Aucune règle du modèle ne définit de rappel AVANT l’échéance de paiement : '
    + 'le modèle réel ne rappelle qu’À l’échéance (statut DUE) puis à J+3 '
    + '(PAYMENT_OVERDUE_J3). Une avance (J-1, J-3, J-7…) serait une invention.',
  evidence: [
    'src/repositories/mockRepository.ts → syncPaymentSchedule : rappels produits uniquement sur statut DUE, puis `if (daysLate < 3) continue;`',
    'src/backend/services/scheduler.ts → J3_SCHEDULER_CONTRACT : thresholdDays = 3, alertStatuses = [DUE], blockEligibilityStatuses = [DUE, REJECTED]',
  ],
  decisionRequired:
    'Décider métier l’avance de rappel (et son unité) avant toute implémentation ; '
    + 'renseigner alors `leadTimeMs` et ajouter le type de job correspondant.',
} as const;

/** Règles manquantes, documentées explicitement plutôt qu'inventées. */
export const MISSING_CONTRACT_AUTOMATION_RULES = [
  SCHEDULE_PERIODICITY_RULES.Hebdomadaire.missingRule as string,
  SCHEDULE_PERIODICITY_RULES['Forfait mission'].missingRule as string,
  PRE_DUE_REMINDER_CONFIGURATION.missingRule,
  'Aucune règle du modèle ne définit le basculement SCHEDULED → DUE hors cycle paiements : '
  + 'P0-AUTO-2 crée l’échéancier et arme les rappels, mais n’évalue jamais une échéance comme due '
  + 'à la place du cycle paiements (`syncPaymentSchedule` / `advanceContractMonth`).',
  'Aucune règle du modèle ne définit l’avancement mensuel automatique (`currentMonth`) : '
  + 'seul le mois M1 est initialisé à l’activation, comme `MockRepository.generateContract`.',
  'Aucune règle du modèle ne définit la réouverture d’un échéancier après TERMINATED/COMPLETED : '
  + '`freezeFuturePaymentEntries` appartient au cycle incidents/paiements, non ouvert ici.',
] as const;

/**
 * ÉTAPE 9 — transitions post-contractuelles EXPLICITEMENT REPORTÉES.
 *
 * Constat d'inspection : une RÈGLE 21 existe, mais uniquement dans le dépôt DEMO
 * (`MockRepository.signContract`, `src/repositories/mockRepository.ts` lignes
 * ~1544-1555 : contrat ACTIVE → offre `FILLED`, candidature retenue `HIRED`,
 * autres candidatures `CLOSED_OFFER_FILLED` + notification). Elle N'EST PAS
 * ouverte dans le domaine de production :
 *  - `src/domain/applicationTransitions.ts` : « `HIRED`, `CONTRACTED` et
 *    `CLOSED_OFFER_FILLED` relèvent des étapes suivantes » — P0-E4 ne les
 *    produit jamais ;
 *  - `src/domain/contractTransitions.ts` → `POST_CONTRACT_AUTOMATION_REQUIREMENTS`
 *    les liste comme étape d'automatisation/post-contrat à venir ;
 *  - `docs/P0-F_CONTRATS.md` § 12 : la fermeture des autres candidatures ne doit
 *    être « jamais silencieuse », donc exige le module Notifications — hors
 *    périmètre de cette tranche.
 *
 * P0-AUTO-2 ne ferme donc AUCUNE candidature et ne passe AUCUNE offre à FILLED.
 */
export const POST_CONTRACT_DEFERRED_AUTOMATION = [
  {
    transition: 'OFFER → FILLED',
    implemented: false,
    reason: 'Tranche post-contractuelle dédiée. La règle existe uniquement dans le DEMO (RÈGLE 21, MockRepository) et n’est pas ouverte par le domaine de production.',
  },
  {
    transition: 'APPLICATION → HIRED',
    implemented: false,
    reason: '`applicationTransitions.ts` réserve HIRED aux étapes suivantes ; P0-E4 ne le produit jamais.',
  },
  {
    transition: 'APPLICATION → CONTRACTED',
    implemented: false,
    reason: 'Aucune règle du domaine de production ne produit CONTRACTED ; le DEMO ne l’utilise pas non plus dans le cycle contrat.',
  },
  {
    transition: 'APPLICATION → CLOSED_OFFER_FILLED',
    implemented: false,
    reason: 'Fermeture des autres candidatures : jamais silencieuse (docs/P0-F_CONTRATS.md § 12), donc dépendante du module Notifications — hors périmètre.',
  },
] as const;
