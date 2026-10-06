/**
 * LE LABEUR — P0-AUTO-2 — automatisation réelle du cycle CONTRACT_ACTIVE.
 *
 * Chaîne exécutée (aucun maillon simulé) :
 *
 *   SIGNATURE → ACTIVE (P0-F, `contractRepository.transition`)
 *     ↓  même transaction PostgreSQL
 *   CONTRACT_ACTIVATED écrit dans `automation_outbox`
 *     ↓  claim `FOR UPDATE SKIP LOCKED`
 *   Queue (l'outbox P0-AUTO-1 porte déjà les colonnes de file réelles)
 *     ↓
 *   Automation Worker (`src/backend/automation/worker.ts`)
 *     ↓
 *   AutomationEngine (fondation P0-AUTO-1, inchangée)
 *     ↓  handler ci-dessous, une transaction
 *   échéancier salarial + échéancier de commission (colonnes JSONB réelles du
 *   contrat) → échéances (`automation_deadlines`) → jobs de rappel
 *   (`automation_jobs`) → événements préparés pour le futur module
 *   Notifications → ledger d'audit (`automation_audit_ledger`).
 *
 * Garanties, toutes portées par PostgreSQL et jamais par un second framework :
 *  - commit   → mutation d'activation + historique + événement ;
 *  - rollback → aucune mutation durable, aucun événement durable ;
 *  - replay   → aucun double échéancier, aucune double échéance, aucun double
 *    rappel, aucun double événement (clés primaires, index d'unicité,
 *    compare-and-set et `automation_idempotency`).
 *
 * Hors périmètre, explicitement : aucun paiement, aucun débit, aucune
 * notification envoyée, aucun canal (e-mail, Push, SMS, WhatsApp), aucune
 * offre `FILLED`, aucune candidature `HIRED` / `CONTRACTED` /
 * `CLOSED_OFFER_FILLED`, aucun KYC, aucun R2.
 */

import {
  AutomationEngine,
  AutomationRegistry,
  type AutomationContext,
  type AutomationHandler,
  type DomainEvent,
  type DomainEventType,
} from './foundation';
import type { DeadlineStatus } from './foundation';
import type {
  AutomationJob,
  AutomationStores,
  DeadlineDraft,
  ScheduledJobDraft,
} from './records';
import { newEntityId } from '../identity/ids';
import type { ContractHistoryEntry, ContractRecord } from '../persistence/coreRecords';
import type { NotificationType } from '../../types';
import {
  AUTOMATION_SYSTEM_ACTOR,
  CONTRACT_ACTIVATION_COMMAND,
  CONTRACT_AUTOMATION_HISTORY_EVENTS,
  AUTOMATION_AUDIT_ACTIONS,
  J3_AUDIT_FIELDS,
  REMINDER_JOB_COMMAND,
  REMINDER_JOB_TYPES,
  REMINDER_NOTIFICATION_TYPES,
  buildContractActivationPlan,
  buildReminderJobs,
  buildScheduleDeadlines,
  contractActivatedIdempotencyKey,
  deadlineStatusAfterReminder,
  evaluateReminderEligibility,
  reminderDedupeKey,
  reminderEventId,
  reminderJobType,
  resolveSchedulePeriodicityRule,
  toUtcMidnight,
  type ContractScheduleSource,
  type PaymentKind,
  type ReminderEligibility,
  type ReminderJobType,
  type ReminderStage,
  type ScheduleDeadlineDraft,
} from '../../domain/contractScheduleAutomation';

/** Source déclarée de chaque écriture d'automatisation (jamais devinée). */
import {
  PAYMENT_PRE_DUE_JOB_TYPE,
  buildPaymentDraftsFromSchedule,
} from '../../domain/paymentLifecycle';
import {
  armPreDueReminderJobs,
  handlePreDueReminderJob,
  materializeContractPayments,
  type PreDueReminderOutcome,
} from './paymentCycle';

export const AUTOMATION_SOURCE = 'automation:P0-AUTO-2';

/** Types d'événements réellement traités par cette tranche. */
export const HANDLED_EVENT_TYPES: readonly DomainEventType[] = ['CONTRACT_ACTIVATED'];

/**
 * Types d'événements PRÉPARÉS pour le futur module Notifications. Ils sont
 * écrits dans l'outbox et n'ont volontairement AUCUN consumer : aucun canal de
 * notification n'existe dans cette tranche.
 */
export const DEFERRED_NOTIFICATION_EVENT_TYPES: readonly DomainEventType[] = [
  'NOTIFICATION_REQUIRED',
  'PAYMENT_OVERDUE_J3',
];

/** Exécution d'une opération sur des stores liés à la même transaction. */
export interface AutomationTransactionRuntime {
  withTransaction<T>(operation: (stores: AutomationStores) => Promise<T>): Promise<T>;
  now?: () => Date;
  /**
   * P0-PAY-1 — avance de rappel pré-échéance, résolue depuis la configuration de
   * l'exploitant (`PAYMENT_PRE_DUE_LEAD_TIME_MS`). `null` (ou absent) = AUCUN job
   * pré-échéance : le modèle ne fixe aucune valeur par défaut et cette tranche
   * n'en invente pas.
   */
  paymentPreDueLeadTimeMs?: number | null;
}

export class ContractAutomationError extends Error {
  constructor(
    readonly code: 'CONFLICT' | 'IN_PROGRESS' | 'NOT_FOUND' | 'NOT_ACTIVE' | 'INVALID_JOB',
    message: string,
  ) {
    super(message);
    this.name = 'ContractAutomationError';
  }
}

/** Empreinte SHA-256 déterministe de la charge utile (colonne `payload_hash`). */
export async function fingerprintEvent(event: DomainEvent): Promise<string> {
  const payload = JSON.stringify({
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload ?? {},
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function newAuditEntryId(prefix: string): string {
  return `${prefix}_${newEntityId('ctr').replace(/^ctr_/, '')}`;
}

function newHistoryEntryId(): string {
  return newEntityId('ctr').replace(/^ctr_/, 'log_');
}

function toContractScheduleSource(contract: ContractRecord): ContractScheduleSource {
  return {
    contractId: contract.id,
    employerId: contract.employerId,
    employeeId: contract.employeeId,
    monthlySalary: contract.monthlySalary,
    currency: contract.currency,
    startDate: contract.startDate,
    durationMonths: contract.durationMonths,
    periodicity: contract.periodicity,
    commissionPercentage: contract.commissionPercentage,
    ...(contract.additionalNotes !== undefined ? { additionalNotes: contract.additionalNotes } : {}),
  };
}

/** Résultat observable d'un traitement d'activation (audité et testé). */
export interface ContractActivationOutcome {
  contractId: string;
  result:
    | 'SCHEDULED'
    | 'RULE_MISSING'
    | 'DUPLICATE_EVENT'
    | 'ALREADY_SCHEDULED'
    | 'NOT_ACTIVE';
  periodicity: string;
  cadence: string | null;
  scheduleEntries: number;
  deadlinesCreated: number;
  deadlinesDuplicated: number;
  reminderJobsCreated: number;
  reminderJobsDuplicated: number;
  missingRule?: string;
}

/** Détache une nature de paiement et une étape d'un type de job de rappel. */
export function parseReminderJobType(jobType: string): { paymentKind: PaymentKind; stage: ReminderStage } | null {
  if (!(REMINDER_JOB_TYPES as readonly string[]).includes(jobType)) return null;
  const paymentKind: PaymentKind = jobType.startsWith('SALARY') ? 'SALARY' : 'COMMISSION';
  const stage: ReminderStage = jobType.includes('J3') ? 'J3' : 'DUE';
  // Cohérence défensive : le type reconstruit doit être exactement celui reçu.
  if (reminderJobType(paymentKind, stage) !== jobType) return null;
  return { paymentKind, stage };
}

/** Résultat observable d'un rappel (audité et testé). */
export interface ReminderJobOutcome {
  jobId: string;
  contractId: string;
  jobType: string;
  paymentKind: PaymentKind;
  stage: ReminderStage;
  /** `DUPLICATE` = rappel déjà traité (rejeu) : aucun second événement produit. */
  eligibility: ReminderEligibility['kind'] | 'DUPLICATE';
  daysLate: number;
  eventId: string | null;
  eventType: DomainEventType | null;
  notificationType: NotificationType;
  deadlineStatus: DeadlineStatus;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/* Registre de jobs de rappel                                           */
/* ------------------------------------------------------------------ */

export type ReminderJobHandler = (input: {
  job: AutomationJob;
  paymentKind: PaymentKind;
  stage: ReminderStage;
  stores: AutomationStores;
  now: Date;
}) => Promise<ReminderJobOutcome>;

/**
 * Registre des handlers de JOBS, pendant côté `ScheduledJob` du
 * `AutomationRegistry` de la fondation (qui, lui, est indexé par type
 * d'ÉVÉNEMENT et reste inchangé). Aucun mécanisme de concurrence n'y est
 * ajouté : l'ordonnancement et l'unicité viennent de PostgreSQL.
 */
export class ReminderJobRegistry {
  private readonly handlers = new Map<ReminderJobType, ReminderJobHandler>();

  register(jobType: ReminderJobType, handler: ReminderJobHandler): void {
    if (this.handlers.has(jobType)) throw new Error(`Handler de job déjà enregistré: ${jobType}`);
    this.handlers.set(jobType, handler);
  }

  get(jobType: string): ReminderJobHandler | undefined {
    return this.handlers.get(jobType as ReminderJobType);
  }

  get jobTypes(): readonly string[] {
    return [...this.handlers.keys()];
  }
}

/* ------------------------------------------------------------------ */
/* Fabrique d'automatisation contractuelle                              */
/* ------------------------------------------------------------------ */

export interface ContractAutomation {
  registry: AutomationRegistry;
  engine: AutomationEngine;
  jobs: ReminderJobRegistry;
  /** Types d'événements que le worker peut réclamer (ceux qui ont un handler). */
  handledEventTypes: readonly DomainEventType[];
  /** Types de jobs que le worker peut réclamer. */
  handledJobTypes: readonly string[];
  /** P0-PAY-1 — type du job de rappel pré-échéance, `null` si l'avance n'est pas décidée. */
  preDueJobType: string | null;
  /** P0-PAY-1 — handler du rappel pré-échéance (aucun effet sur les états du paiement). */
  handlePreDueJob?(input: { job: AutomationJob; stores: AutomationStores; now: Date }): Promise<PreDueReminderOutcome>;
  /** Trace un échec HORS de la transaction échouée (sinon l'audit serait annulé). */
  recordFailure(input: {
    eventId?: string;
    jobId?: string;
    entityId: string;
    error: string;
  }): Promise<void>;
}

export function createContractAutomation(
  runtime: AutomationTransactionRuntime,
): ContractAutomation {
  const clock = runtime.now ?? (() => new Date());
  const preDueLeadTimeMs = runtime.paymentPreDueLeadTimeMs ?? null;

  const withTransaction = runtime.withTransaction;

  /* ---------------- CONTRACT_ACTIVATED ---------------- */

  const handleContractActivated: AutomationHandler = async (context: AutomationContext) => {
    const contractId = context.event.aggregateId;
    if (!contractId) {
      throw new ContractAutomationError('NOT_FOUND', 'Événement CONTRACT_ACTIVATED sans contrat.');
    }
    const occurredAt = context.event.timestamp || clock().toISOString();
    const payloadHash = await fingerprintEvent(context.event);

    await withTransaction(async stores => {
      // 1. Idempotence DURABLE (mécanisme existant `automation_idempotency`).
      const reservation = await stores.idempotency.reserve({
        actorId: AUTOMATION_SYSTEM_ACTOR,
        command: CONTRACT_ACTIVATION_COMMAND,
        key: contractActivatedIdempotencyKey(contractId),
        payloadHash,
      });

      if (reservation.kind === 'conflict') {
        throw new ContractAutomationError(
          'CONFLICT',
          `CONTRACT_ACTIVATED rejoué avec une charge utile différente pour ${contractId}.`,
        );
      }
      if (reservation.kind === 'in-progress') {
        // Un autre worker traite déjà ce contrat : le message doit être rejoué.
        throw new ContractAutomationError(
          'IN_PROGRESS',
          `Traitement concurrent de CONTRACT_ACTIVATED en cours pour ${contractId}.`,
        );
      }
      if (reservation.kind === 'replay') {
        await stores.audit.append({
          id: `audit_${context.event.eventId}_DUPLICATE`,
          eventId: context.event.eventId,
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp: clock().toISOString(),
          entityId: contractId,
          action: AUTOMATION_AUDIT_ACTIONS.duplicateSuppressed,
          source: AUTOMATION_SOURCE,
          reference: context.idempotencyKey,
          afterState: { command: CONTRACT_ACTIVATION_COMMAND, replay: true },
        });
        return;
      }

      // 2. Verrou de ligne + garde de statut : seul un contrat réellement ACTIVE
      //    reçoit un échéancier.
      const contract = await stores.contractSchedules.findByIdForUpdate(contractId);
      if (!contract) {
        throw new ContractAutomationError('NOT_FOUND', `Contrat ${contractId} introuvable.`);
      }
      if (contract.status !== 'ACTIVE') {
        await stores.audit.append({
          id: `audit_${context.event.eventId}_NOT_ACTIVE`,
          eventId: context.event.eventId,
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp: clock().toISOString(),
          entityId: contractId,
          action: AUTOMATION_AUDIT_ACTIONS.scheduleRuleMissing,
          source: AUTOMATION_SOURCE,
          reference: context.idempotencyKey,
          afterState: { status: contract.status, reason: 'Contrat non actif : aucun échéancier produit.' },
        });
        await stores.idempotency.complete(
          AUTOMATION_SYSTEM_ACTOR,
          CONTRACT_ACTIVATION_COMMAND,
          contractActivatedIdempotencyKey(contractId),
          { result: 'NOT_ACTIVE' },
        );
        return;
      }

      const timestamp = clock().toISOString();
      const plan = buildContractActivationPlan(toContractScheduleSource(contract), occurredAt);

      // 3. Périodicité sans règle de cadence : AUCUNE date inventée.
      if (plan.kind === 'RULE_MISSING') {
        const historyEntry: ContractHistoryEntry = {
          id: newHistoryEntryId(),
          timestamp,
          event: CONTRACT_AUTOMATION_HISTORY_EVENTS.scheduleRuleMissing,
          description:
            `Échéancier non créé : périodicité « ${plan.periodicity} » sans règle de cadence dans le modèle. `
            + `${plan.missingRule}`,
          actor: 'Système LE LABEUR',
        };
        await stores.contractSchedules.recordMissingScheduleRule(contractId, {
          historyEntry,
          updatedAt: timestamp,
          periodicity: plan.periodicity,
        });
        await stores.audit.append({
          id: `audit_${contractId}_SCHEDULE_RULE_MISSING`,
          eventId: context.event.eventId,
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp,
          entityId: contractId,
          action: AUTOMATION_AUDIT_ACTIONS.scheduleRuleMissing,
          source: AUTOMATION_SOURCE,
          reference: context.idempotencyKey,
          afterState: {
            periodicity: plan.periodicity,
            missingRule: plan.missingRule,
            rule: resolveSchedulePeriodicityRule(plan.periodicity),
          },
        });
        await stores.idempotency.complete(
          AUTOMATION_SYSTEM_ACTOR,
          CONTRACT_ACTIVATION_COMMAND,
          contractActivatedIdempotencyKey(contractId),
          { result: 'RULE_MISSING', periodicity: plan.periodicity },
        );
        return;
      }

      // 4. Écriture de l'échéancier : compare-and-set PostgreSQL (statut ACTIVE
      //    + échéancier vide). Un second traitement renvoie `null`.
      const historyEntry: ContractHistoryEntry = {
        id: newHistoryEntryId(),
        timestamp,
        event: CONTRACT_AUTOMATION_HISTORY_EVENTS.scheduleCreated,
        description:
          `Échéancier créé automatiquement à l’activation : ${plan.paymentSchedule.length} période(s) `
          + `(${plan.cadence}), salaire ${contract.monthlySalary} ${contract.currency}, `
          + `commission M1 ${plan.commissionAmountDue} ${contract.currency} `
          + `(${plan.commissionPercentage} %). Aucun paiement effectué.`,
        actor: 'Système LE LABEUR',
      };
      const written = await stores.contractSchedules.applyActivationPlan(contractId, plan, {
        historyEntry,
        updatedAt: timestamp,
      });

      if (!written) {
        await stores.audit.append({
          id: `audit_${context.event.eventId}_ALREADY_SCHEDULED`,
          eventId: context.event.eventId,
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp,
          entityId: contractId,
          action: AUTOMATION_AUDIT_ACTIONS.duplicateSuppressed,
          source: AUTOMATION_SOURCE,
          reference: context.idempotencyKey,
          afterState: { result: 'ALREADY_SCHEDULED' },
        });
        await stores.idempotency.complete(
          AUTOMATION_SYSTEM_ACTOR,
          CONTRACT_ACTIVATION_COMMAND,
          contractActivatedIdempotencyKey(contractId),
          { result: 'ALREADY_SCHEDULED' },
        );
        return;
      }

      await stores.audit.append({
        id: `audit_${contractId}_SCHEDULE_CREATED`,
        eventId: context.event.eventId,
        actorId: AUTOMATION_SYSTEM_ACTOR,
        timestamp,
        entityId: contractId,
        action: AUTOMATION_AUDIT_ACTIONS.scheduleCreated,
        source: AUTOMATION_SOURCE,
        reference: context.idempotencyKey,
        beforeState: { paymentSchedule: [], commissionLedger: [], monthlyCheckpoints: [] },
        afterState: {
          cadence: plan.cadence,
          periodicity: contract.periodicity,
          periods: plan.paymentSchedule.length,
          currency: plan.paymentSchedule[0]?.currency ?? contract.currency,
          commissionPercentage: plan.commissionPercentage,
          commissionAmountDue: plan.commissionAmountDue,
          commissionStatus: plan.commissionStatus,
          salaryEntries: plan.paymentSchedule.map(entry => ({
            scheduleEntryId: entry.id,
            monthNumber: entry.monthNumber,
            periodKey: entry.periodKey,
            salaryAmount: entry.salaryAmount,
            employeeShareAmount: entry.employeeShareAmount,
            salaryDueDate: entry.salaryDueDate,
            commissionAmount: entry.commissionAmount,
            commissionDueDate: entry.commissionDueDate,
          })),
        },
      });

      // 5. Échéances de paiement (Deadline / SLA), création idempotente.
      const deadlineDrafts = buildScheduleDeadlines(contractId, plan.paymentSchedule);
      let deadlinesCreated = 0;
      for (const draft of deadlineDrafts) {
        const deadline: DeadlineDraft = {
          id: draft.id,
          aggregateType: draft.aggregateType,
          aggregateId: draft.aggregateId,
          kind: draft.kind,
          dueAt: draft.dueAt,
          sla: draft.sla,
          gracePeriodMs: draft.gracePeriodMs,
          escalation: draft.escalation,
          reference: draft.reference,
          idempotencyKey: draft.idempotencyKey,
          sourceEventId: context.event.eventId,
          createdAt: timestamp,
        };
        const outcome = await stores.deadlines.createIfAbsent(deadline);
        if (outcome.kind === 'created') deadlinesCreated += 1;
      }
      await stores.audit.append({
        id: `audit_${contractId}_DEADLINES_CREATED`,
        eventId: context.event.eventId,
        actorId: AUTOMATION_SYSTEM_ACTOR,
        timestamp,
        entityId: contractId,
        action: AUTOMATION_AUDIT_ACTIONS.deadlinesCreated,
        source: AUTOMATION_SOURCE,
        reference: context.idempotencyKey,
        afterState: {
          requested: deadlineDrafts.length,
          created: deadlinesCreated,
          duplicates: deadlineDrafts.length - deadlinesCreated,
          deadlines: deadlineDrafts.map(draft => ({
            deadlineId: draft.id,
            kind: draft.kind,
            dueAt: draft.dueAt,
            sla: draft.sla,
            gracePeriodMs: draft.gracePeriodMs,
            escalation: draft.escalation,
          })),
        },
      });

      // 6. Jobs de rappel, création idempotente. Aucun canal de notification :
      //    les jobs sont ARMÉS, jamais exécutés ici.
      const jobDrafts = buildReminderJobs(contractId, deadlineDrafts);
      let jobsCreated = 0;
      for (const draft of jobDrafts) {
        const job: ScheduledJobDraft = {
          jobId: draft.jobId,
          jobType: draft.jobType,
          aggregateType: draft.aggregateType,
          aggregateId: draft.aggregateId,
          dueAt: draft.dueAt,
          idempotencyKey: draft.idempotencyKey,
          reference: draft.reference,
          createdAt: timestamp,
        };
        const outcome = await stores.jobs.createIfAbsent(job);
        if (outcome.kind === 'created') jobsCreated += 1;
      }
      await stores.audit.append({
        id: `audit_${contractId}_REMINDERS_SCHEDULED`,
        eventId: context.event.eventId,
        actorId: AUTOMATION_SYSTEM_ACTOR,
        timestamp,
        entityId: contractId,
        action: AUTOMATION_AUDIT_ACTIONS.remindersScheduled,
        source: AUTOMATION_SOURCE,
        reference: context.idempotencyKey,
        afterState: {
          requested: jobDrafts.length,
          created: jobsCreated,
          duplicates: jobDrafts.length - jobsCreated,
          reminderJobs: jobDrafts.map(draft => ({
            jobId: draft.jobId,
            jobType: draft.jobType,
            dueAt: draft.dueAt,
            idempotencyKey: draft.idempotencyKey,
            notificationType: draft.notificationType,
          })),
          notificationChannels: [],
          note: 'Aucun canal de notification implémenté : événements préparés uniquement.',
        },
      });

      // 7. P0-PAY-1 — agrégat Payment du cycle : lignes `payments` dérivées de
      //    l'échéancier QUI VIENT D'ÊTRE VALIDÉ, puis armement éventuel des
      //    rappels pré-échéance. Dans la MÊME transaction : un rollback annule
      //    échéancier, échéances, rappels ET paiements. Sans stores de paiement
      //    (runtime sans base durable), le comportement reste exactement celui de
      //    P0-AUTO-2 — c'est la raison pour laquelle `stores.payments` est
      //    optionnel plutôt qu'ajouté de force à tous les appels.
      const materialization = await materializeContractPayments({
        stores,
        contractId,
        employerId: contract.employerId,
        candidateId: contract.employeeId,
        paymentSchedule: plan.paymentSchedule,
        timestamp,
        eventId: context.event.eventId,
        reference: context.idempotencyKey,
      });
      const preDue = await armPreDueReminderJobs({
        stores,
        contractId,
        drafts: buildPaymentDraftsFromSchedule({
          contractId,
          employerId: contract.employerId,
          candidateId: contract.employeeId,
          paymentSchedule: plan.paymentSchedule,
          scheduledAt: timestamp,
        }),
        leadTimeMs: preDueLeadTimeMs,
        timestamp,
        eventId: context.event.eventId,
        reference: context.idempotencyKey,
      });

      // 8. Clôture de la réservation d'idempotence.
      await stores.idempotency.complete(
        AUTOMATION_SYSTEM_ACTOR,
        CONTRACT_ACTIVATION_COMMAND,
        contractActivatedIdempotencyKey(contractId),
        {
          result: 'SCHEDULED',
          cadence: plan.cadence,
          periods: plan.paymentSchedule.length,
          deadlines: deadlinesCreated,
          reminderJobs: jobsCreated,
          payments: materialization.created,
          preDueJobs: preDue.created,
        },
      );
    });
  };

  /* ---------------- Jobs de rappel ---------------- */

  const handleReminderJob: ReminderJobHandler = async ({ job, paymentKind, stage, stores, now }) => {
    const contractId = job.target.aggregateId;
    const timestamp = now.toISOString();
    const entryId = job.reference;
    if (!entryId) {
      throw new ContractAutomationError(
        'INVALID_JOB',
        `Job de rappel ${job.jobId} sans référence d’échéancier.`,
      );
    }

    // La transaction est possédée par le worker : les effets du rappel et le
    // passage du job à COMPLETED sont donc atomiques.
    const reservation = await stores.idempotency.reserve({
      actorId: AUTOMATION_SYSTEM_ACTOR,
      command: REMINDER_JOB_COMMAND,
      key: job.idempotencyKey,
      payloadHash: await fingerprintEvent({
        eventId: job.jobId,
        eventType: 'NOTIFICATION_REQUIRED',
        aggregateType: job.target.aggregateType,
        aggregateId: contractId,
        timestamp,
        payload: { jobId: job.jobId, jobType: job.jobType, stage, paymentKind },
        source: AUTOMATION_SOURCE,
        version: 1,
      }),
    });

    // Type de notification RÉEL du modèle, jamais inventé
    // (`REMINDER_NOTIFICATION_TYPES` → `NotificationType`).
    const notificationType = REMINDER_NOTIFICATION_TYPES[reminderJobType(paymentKind, stage)];

    if (reservation.kind === 'conflict') {
      throw new ContractAutomationError(
        'CONFLICT',
        `Job de rappel ${job.jobId} rejoué avec une charge utile différente.`,
      );
    }
    if (reservation.kind === 'in-progress') {
      throw new ContractAutomationError(
        'IN_PROGRESS',
        `Traitement concurrent du rappel ${job.jobId} en cours.`,
      );
    }
    if (reservation.kind === 'replay') {
      await stores.audit.append({
        id: `audit_${job.jobId}_DUPLICATE`,
        actorId: AUTOMATION_SYSTEM_ACTOR,
        timestamp,
        entityId: contractId,
        action: AUTOMATION_AUDIT_ACTIONS.duplicateSuppressed,
        source: AUTOMATION_SOURCE,
        reference: job.idempotencyKey,
        afterState: { jobId: job.jobId, command: REMINDER_JOB_COMMAND, replay: true },
      });
      return {
        jobId: job.jobId,
        contractId,
        jobType: job.jobType,
        paymentKind,
        stage,
        eligibility: 'DUPLICATE',
        daysLate: 0,
        eventId: null,
        eventType: null,
        notificationType,
        deadlineStatus: 'OPEN',
        reason: 'Rappel déjà traité : aucun second événement.',
      };
    }

    const contract = await stores.contractSchedules.findByIdForUpdate(contractId);
    if (!contract) {
      throw new ContractAutomationError('NOT_FOUND', `Contrat ${contractId} introuvable.`);
    }
    const entry = contract.paymentSchedule.find(candidate => candidate.id === entryId);
    if (!entry) {
      throw new ContractAutomationError(
        'NOT_FOUND',
        `Entrée d’échéancier ${entryId} introuvable sur le contrat ${contractId}.`,
      );
    }

    const status = paymentKind === 'SALARY' ? entry.salaryStatus : entry.commissionStatus;
    const dueDate = paymentKind === 'SALARY' ? entry.salaryDueDate : entry.commissionDueDate;
    const amount = paymentKind === 'SALARY' ? entry.salaryAmount : entry.commissionAmount;
    const eligibility = evaluateReminderEligibility({
      paymentKind,
      stage,
      amount,
      dueAt: toUtcMidnight(dueDate),
      status,
      evaluatedAt: timestamp,
    });

    const deadlineId = `dl_${paymentKind === 'SALARY' ? 'SALARY_PAYMENT' : 'COMMISSION_PAYMENT'}_${entry.id}`;
    let eventId: string | null = null;
    let eventType: DomainEventType | null = null;

    if (eligibility.kind === 'ELIGIBLE') {
      eventId = reminderEventId(job.jobId);
      // J+3 : le type d'événement de domaine EXISTANT (`OutboxEventType`),
      // documenté par `J3_SCHEDULER_CONTRACT.domainEvent`.
      // À échéance : `NOTIFICATION_REQUIRED` de la fondation, qui porte le
      // `NotificationType` réel (`MONTHLY_CHECKPOINT` / `COMMISSION_DUE`).
      eventType = stage === 'J3' ? 'PAYMENT_OVERDUE_J3' : 'NOTIFICATION_REQUIRED';
      const appended = await stores.outbox.append({
        eventId,
        eventType,
        aggregateType: 'contract',
        aggregateId: contractId,
        actorId: AUTOMATION_SYSTEM_ACTOR,
        timestamp,
        source: AUTOMATION_SOURCE,
        version: 1,
        correlationId: job.jobId,
        causationId: job.jobId,
        payload: {
          contractId,
          employerId: contract.employerId,
          employeeId: contract.employeeId,
          scheduleEntryId: entry.id,
          monthNumber: entry.monthNumber,
          periodKey: entry.periodKey,
          paymentKind,
          stage,
          dueDate,
          daysLate: eligibility.daysLate,
          amount,
          currency: entry.currency,
          notificationType,
          // Destinataires RÉELS du modèle (`J3_SCHEDULER_CONTRACT
          // .notificationRecipients`) : la résolution des ADMIN autorisés et
          // l'envoi appartiennent au module Notifications, non ouvert ici.
          recipientKinds: ['EMPLOYER', 'ADMIN'],
          jobId: job.jobId,
          deadlineId,
          dedupeKey: reminderDedupeKey({
            contractId,
            monthNumber: entry.monthNumber,
            paymentKind,
            stage,
          }),
          channel: null,
          note: 'Événement préparé : aucun canal de notification implémenté (P0-AUTO-2).',
        },
      });
      if (appended.kind === 'duplicate') {
        // Événement déjà produit par un traitement antérieur : aucun double effet.
        eventId = appended.existing.eventId;
      }
    }

    const nextStatus = deadlineStatusAfterReminder(eligibility, stage);
    let deadlineStatus: DeadlineStatus = nextStatus;
    if (nextStatus !== 'OPEN') {
      const expected = nextStatus === 'ESCALATED'
        ? ['OPEN', 'OVERDUE'] as const
        : nextStatus === 'OVERDUE'
          ? ['OPEN'] as const
          : ['OPEN', 'OVERDUE', 'ESCALATED'] as const;
      const updated = await stores.deadlines.compareAndSetStatus(deadlineId, expected, {
        status: nextStatus,
        at: timestamp,
      });
      // Une échéance déjà plus avancée (ex. ESCALATED) ne recule jamais : le
      // compare-and-set échoue alors et le statut RÉEL est relu, jamais supposé.
      deadlineStatus = updated?.status ?? (await stores.deadlines.findById(deadlineId))?.status ?? nextStatus;
    } else {
      const current = await stores.deadlines.findById(deadlineId);
      deadlineStatus = current?.status ?? 'OPEN';
    }

    const isJ3 = stage === 'J3';
    await stores.audit.append({
      id: `audit_${job.jobId}_EVALUATED`,
      eventId: eventId ?? undefined,
      actorId: AUTOMATION_SYSTEM_ACTOR,
      timestamp,
      entityId: contractId,
      action: isJ3
        ? AUTOMATION_AUDIT_ACTIONS.j3EligibilityRecorded
        : AUTOMATION_AUDIT_ACTIONS.dueReminderRecorded,
      source: AUTOMATION_SOURCE,
      reference: job.idempotencyKey,
      // Champs RÉELS documentés par `J3_SCHEDULER_CONTRACT.futureAuditFields`.
      afterState: {
        scheduleEntryId: entry.id,
        paymentKind,
        dueDate,
        status,
        daysLate: eligibility.kind === 'ELIGIBLE' || eligibility.kind === 'NOT_DUE_YET'
          ? eligibility.daysLate
          : 0,
        outboxEventId: eventId,
        jobId: job.jobId,
        jobType: job.jobType,
        stage,
        eligibility: eligibility.kind,
        deadlineStatus,
        notificationType,
        auditFields: [...J3_AUDIT_FIELDS],
        ...(eligibility.kind === 'NOT_ELIGIBLE' ? { reason: eligibility.reason } : {}),
      },
    });

    await stores.idempotency.complete(
      AUTOMATION_SYSTEM_ACTOR,
      REMINDER_JOB_COMMAND,
      job.idempotencyKey,
      { eligibility: eligibility.kind, eventId, deadlineStatus },
    );

    return {
      jobId: job.jobId,
      contractId,
      jobType: job.jobType,
      paymentKind,
      stage,
      eligibility: eligibility.kind,
      daysLate: eligibility.kind === 'ELIGIBLE' || eligibility.kind === 'NOT_DUE_YET'
        ? eligibility.daysLate
        : 0,
      eventId,
      eventType,
      notificationType,
      deadlineStatus,
      ...(eligibility.kind === 'NOT_ELIGIBLE' ? { reason: eligibility.reason } : {}),
    };
  };

  /* ---------------- Composition ---------------- */

  const registry = new AutomationRegistry();
  registry.register('CONTRACT_ACTIVATED', handleContractActivated);

  const jobs = new ReminderJobRegistry();
  for (const jobType of REMINDER_JOB_TYPES) {
    jobs.register(jobType, async ({ job, paymentKind, stage, stores, now }) =>
      handleReminderJob({ job, paymentKind, stage, stores, now }));
  }

  // P0-PAY-1 — le rappel pré-échéance est un job de plus dans la MÊME file
  // (`automation_jobs`, claim verrouillé `FOR UPDATE SKIP LOCKED`) : aucun second
  // ordonnanceur. Il n'entre PAS dans `REMINDER_JOB_TYPES` (ensemble verrouillé
  // par les tests du modèle, sémantique DUE/J3 différente) : il est exposé par un
  // point d'extension explicite du worker et n'est réclamé que si l'exploitant a
  // décidé l'avance.
  const preDueJobType = preDueLeadTimeMs === null ? null : PAYMENT_PRE_DUE_JOB_TYPE;

  return {
    registry,
    engine: new AutomationEngine(registry),
    jobs,
    handledEventTypes: HANDLED_EVENT_TYPES,
    handledJobTypes: preDueJobType === null
      ? [...REMINDER_JOB_TYPES]
      : [...REMINDER_JOB_TYPES, preDueJobType],
    preDueJobType,
    async handlePreDueJob(input) {
      return handlePreDueReminderJob(input);
    },
    async recordFailure(input) {
      // Écrit HORS de la transaction échouée : un rollback ne doit jamais
      // effacer la trace de l'erreur (ÉTAPE 10).
      await withTransaction(async stores => {
        await stores.audit.append({
          id: newAuditEntryId(`audit_failure_${input.jobId ?? input.eventId ?? 'unknown'}`),
          ...(input.eventId ? { eventId: input.eventId } : {}),
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp: clock().toISOString(),
          entityId: input.entityId,
          action: AUTOMATION_AUDIT_ACTIONS.handlerFailed,
          source: AUTOMATION_SOURCE,
          ...(input.jobId ? { reference: input.jobId } : {}),
          afterState: { error: input.error },
        });
      });
    },
  };
}
