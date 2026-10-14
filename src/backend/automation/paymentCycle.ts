/**
 * LE LABEUR — P0-PAY-1 — automatisation du CYCLE PAIEMENT.
 *
 * Ce module n'ajoute AUCUN moteur : il s'accroche aux mécanismes déjà réels de
 * P0-AUTO-1/P0-AUTO-2 et les étend.
 *
 *   événement `CONTRACT_ACTIVATED` (handler P0-AUTO-2)
 *     → matérialisation idempotente des lignes `payments` (mêmes ids, mêmes clés)
 *     → échéances `automation_deadlines` (intactes, déjà créées par P0-AUTO-2)
 *     → jobs de rappel `automation_jobs` (intacts)
 *     → jobs pré-échéance UNIQUEMENT si `leadTimeMs` est décidé par l'exploitant
 *
 *   `drain()` du worker
 *     → événements → balayage des paiements échus (SCHEDULED → DUE) → jobs
 *
 * Le balayage s'appuie sur l'index PARTIEL `(due_at, id) WHERE status IN
 * ('SCHEDULED','DUE')` de la migration 0008 : requête bornée par `LIMIT`,
 * aucun scan complet, aucun job par utilisateur, aucun polling global. La
 * garantie « un seul DUE par paiement » vient du compare-and-set PostgreSQL, pas
 * d'un verrou applicatif.
 */

import type { AutomationJob, AutomationStores, ScheduledJobDraft } from './records';
import { AUTOMATION_SYSTEM_ACTOR } from '../../domain/contractScheduleAutomation';
import {
  PAYMENT_AUDIT_ACTIONS,
  PAYMENT_PRE_DUE_JOB_TYPE,
  buildPaymentDraftsFromSchedule,
  buildPreDueReminderJobs,
  evaluatePreDueReminder,
  paymentDueIdempotencyKey,
  paymentEventId,
  resolvePreDueLeadTimeMs,
  PRE_DUE_NOTIFICATION_TYPES,
  type PaymentDraft,
  type PaymentType,
} from '../../domain/paymentLifecycle';
import type { PaymentCycleWriterStores } from '../repositories/paymentRepository';

export const PAYMENT_CYCLE_SOURCE = 'automation:P0-PAY-1';
export const PAYMENT_PRE_DUE_COMMAND = 'automation.PAYMENT_PRE_DUE_REMINDER';

export interface PaymentMaterializationResult {
  requested: number;
  created: number;
  duplicates: number;
  skipped: 'PAYMENT_STORES_UNAVAILABLE' | null;
}

/**
 * Écrit les lignes `payments` correspondant à un échéancier DÉJÀ validé.
 *
 * `createIfAbsent` + index d'unicité : un rejeu de `CONTRACT_ACTIVATED`, deux
 * workers concurrents ou un contrat partiellement materialisé ne produisent
 * jamais un second paiement pour la même période.
 */
export async function materializeContractPayments(input: {
  stores: AutomationStores;
  contractId: string;
  employerId: string;
  candidateId: string;
  paymentSchedule: Parameters<typeof buildPaymentDraftsFromSchedule>[0]['paymentSchedule'];
  timestamp: string;
  eventId?: string;
  reference?: string;
}): Promise<PaymentMaterializationResult> {
  const payments = input.stores.payments;
  if (!payments) {
    return { requested: 0, created: 0, duplicates: 0, skipped: 'PAYMENT_STORES_UNAVAILABLE' };
  }
  const drafts = buildPaymentDraftsFromSchedule({
    contractId: input.contractId,
    employerId: input.employerId,
    candidateId: input.candidateId,
    paymentSchedule: input.paymentSchedule,
    scheduledAt: input.timestamp,
  });

  let created = 0;
  for (const draft of drafts) {
    const result = await payments.payments.createIfAbsent({
      paymentId: draft.id,
      contractId: draft.contractId,
      employerId: draft.employerId,
      candidateId: draft.candidateId,
      paymentType: draft.paymentType,
      scheduleEntryId: draft.scheduleEntryId,
      monthNumber: draft.monthNumber,
      periodKey: draft.periodKey,
      amount: draft.amount,
      currency: draft.currency,
      scheduledAt: draft.scheduledAt,
      dueAt: draft.dueAt,
      status: draft.status,
      idempotencyKey: draft.idempotencyKey,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    });
    if (result.kind === 'created') created += 1;
  }

  await input.stores.audit.append({
    id: `audit_${input.contractId}_PAYMENTS_MATERIALIZED`.slice(0, 120),
    ...(input.eventId ? { eventId: input.eventId } : {}),
    actorId: AUTOMATION_SYSTEM_ACTOR,
    timestamp: input.timestamp,
    entityId: input.contractId,
    action: PAYMENT_AUDIT_ACTIONS.materialized,
    source: PAYMENT_CYCLE_SOURCE,
    ...(input.reference ? { reference: input.reference } : {}),
    afterState: {
      requested: drafts.length,
      created,
      duplicates: drafts.length - created,
      payments: drafts.map(draft => ({
        paymentId: draft.id,
        paymentType: draft.paymentType,
        monthNumber: draft.monthNumber,
        periodKey: draft.periodKey,
        amount: draft.amount,
        currency: draft.currency,
        dueAt: draft.dueAt,
        status: 'SCHEDULED',
      })),
      note: 'Aucun paiement exécuté : agrégat métier du cycle uniquement.',
    },
  });

  return { requested: drafts.length, created, duplicates: drafts.length - created, skipped: null };
}

/**
 * Armement des rappels pré-échéance. AUCUNE valeur par défaut : sans
 * `PAYMENT_PRE_DUE_LEAD_TIME_MS`, aucun job n'est créé et aucune date n'est
 * devinée (règle non décidée dans le modèle, ÉTAPE 14).
 */
export async function armPreDueReminderJobs(input: {
  stores: AutomationStores;
  contractId: string;
  drafts: readonly PaymentDraft[];
  leadTimeMs: number | null;
  timestamp: string;
  eventId?: string;
  reference?: string;
}): Promise<{ requested: number; created: number; duplicates: number; leadTimeMs: number | null }> {
  const payments = input.stores.payments;
  if (!payments || input.leadTimeMs === null) {
    return { requested: 0, created: 0, duplicates: 0, leadTimeMs: input.leadTimeMs };
  }
  const jobs = buildPreDueReminderJobs({
    contractId: input.contractId,
    leadTimeMs: input.leadTimeMs,
    drafts: input.drafts,
    notificationTypeFor: (paymentType: PaymentType) => PRE_DUE_NOTIFICATION_TYPES[paymentType],
  });

  let created = 0;
  for (const draft of jobs) {
    const job: ScheduledJobDraft = {
      jobId: draft.jobId,
      jobType: draft.jobType,
      aggregateType: draft.aggregateType,
      aggregateId: draft.aggregateId,
      dueAt: draft.dueAt,
      idempotencyKey: draft.idempotencyKey,
      reference: draft.reference,
      createdAt: input.timestamp,
    };
    const outcome = await input.stores.jobs.createIfAbsent(job);
    if (outcome.kind === 'created') created += 1;
  }

  await input.stores.audit.append({
    id: `audit_${input.contractId}_PRE_DUE_ARMED`.slice(0, 120),
    ...(input.eventId ? { eventId: input.eventId } : {}),
    actorId: AUTOMATION_SYSTEM_ACTOR,
    timestamp: input.timestamp,
    entityId: input.contractId,
    action: PAYMENT_AUDIT_ACTIONS.preDueRecorded,
    source: PAYMENT_CYCLE_SOURCE,
    ...(input.reference ? { reference: input.reference } : {}),
    afterState: {
      leadTimeMs: input.leadTimeMs,
      requested: jobs.length,
      created,
      duplicates: jobs.length - created,
      notificationChannels: [],
      note:
        'Rappel pré-échéance armé sur configuration de l’exploitant. Aucun canal : le job consigne une '
        + 'évaluation, il n’envoie rien (module Notifications ultérieur).',
    },
  });

  return { requested: jobs.length, created, duplicates: jobs.length - created, leadTimeMs: input.leadTimeMs };
}

export interface PreDueReminderOutcome {
  jobId: string;
  paymentId: string;
  eligibility: 'NOT_YET_DUE' | 'ALREADY_DUE' | 'SETTLED' | 'PAYMENT_UNAVAILABLE';
  notificationType: string;
  eventId: string | null;
  reason: string;
}

/**
 * Traitement d'un job pré-échéance : il NE MODIFIE AUCUN état. Il constate
 * l'éligibilité du paiement et la consigne dans l'audit. Aucun événement de
 * notification n'est inventé : le type de notification est seulement cité dans
 * l'entrée d'audit, en attendant le module Notifications.
 */
export async function handlePreDueReminderJob(input: {
  job: AutomationJob;
  stores: AutomationStores;
  now: Date;
  notificationType?: string;
}): Promise<PreDueReminderOutcome> {
  const timestamp = input.now.toISOString();
  const paymentId = input.job.reference?.trim() ?? '';
  const payments = input.stores.payments;
  const base = {
    jobId: input.job.jobId,
    paymentId,
    eventId: null as string | null,
  };
  if (!paymentId) {
    return {
      ...base,
      eligibility: 'PAYMENT_UNAVAILABLE',
      notificationType: input.notificationType ?? 'NONE',
      reason: 'Job pré-échéance sans référence de paiement : aucune écriture, aucun état modifié.',
    };
  }
  if (!payments) {
    return {
      ...base,
      eligibility: 'PAYMENT_UNAVAILABLE',
      notificationType: input.notificationType ?? 'NONE',
      reason: 'Cycle paiements non branché sur ce runtime : aucun état lu, aucune écriture.',
    };
  }
  const payment = await payments.payments.findById(paymentId);
  if (!payment) {
    return {
      ...base,
      eligibility: 'PAYMENT_UNAVAILABLE',
      notificationType: input.notificationType ?? 'NONE',
      reason: `Paiement ${paymentId} introuvable : rappel pré-échéance sans effet.`,
    };
  }

  const eligibility = evaluatePreDueReminder(payment.status);
  const notificationType = PRE_DUE_NOTIFICATION_TYPES[payment.paymentType];
  const reason = eligibility.kind === 'NOT_YET_DUE'
    ? `Paiement ${payment.status} : rappel pré-échéance consigné, aucune notification émise.`
    : eligibility.kind === 'ALREADY_DUE'
      ? 'Paiement déjà DUE : le rappel à échéance prend le relais, rien de plus ici.'
      : `Paiement ${payment.status} : le rappel pré-échéance n’a plus d’objet.`;

  await input.stores.audit.append({
    id: `audit_${input.job.jobId}_PRE_DUE`.slice(0, 120),
    actorId: AUTOMATION_SYSTEM_ACTOR,
    timestamp,
    entityId: paymentId,
    action: PAYMENT_AUDIT_ACTIONS.preDueRecorded,
    source: PAYMENT_CYCLE_SOURCE,
    reference: input.job.jobId,
    beforeState: { status: payment.status, jobId: input.job.jobId, contractId: payment.contractId },
    afterState: {
      eligibility: eligibility.kind,
      notificationType,
      channel: null,
      delivered: false,
      note: 'Aucun canal branché (P0-PAY-1).',
    },
  });

  return { ...base, eligibility: eligibility.kind, notificationType, reason };
}

export interface PaymentDueSweepReport {
  scanned: number;
  applied: number;
  duplicates: number;
  paymentIds: string[];
}

/**
 * Balayage ÉTAPE 23 : lit les paiements `SCHEDULED` dont l'échéance est atteinte
 * (requête bornée sur index partiel) et applique `SCHEDULED → DUE` via le
 * repository — donc avec événement `PAYMENT_DUE`, projection et audit — dans la
 * MÊME transaction que le claim du worker.
 */
export async function runDuePaymentSweep(input: {
  stores: AutomationStores;
  limit: number;
  sweep: (writer: PaymentCycleWriterStores, limit: number) => Promise<PaymentDueSweepReport>;
}): Promise<PaymentDueSweepReport> {
  const empty: PaymentDueSweepReport = { scanned: 0, applied: 0, duplicates: 0, paymentIds: [] };
  const payments = input.stores.payments;
  if (!payments) return empty;
  const writer: PaymentCycleWriterStores = {
    payments: payments.payments,
    declarations: payments.declarations,
    contractPayments: payments.contractPayments,
    outbox: input.stores.outbox,
    audit: input.stores.audit,
  };
  return input.sweep(writer, input.limit);
}

/** Résolution de l'avance depuis l'environnement du Worker (aucune valeur par défaut). */
export function resolvePreDueLeadTimeFromEnv(value: string | undefined | null) {
  return resolvePreDueLeadTimeMs(value ?? null);
}

/**
 * Événement `PAYMENT_DUE` produit par l'automatisation : utile aux tests de
 * cohérence d'identifiant déterministe. Le producteur réel est le repository
 * (une seule implémentation de l'écriture), ce helper ne fait que rappeler la
 * règle d'identifiant et de déduplication.
 */
export function paymentDueEventId(paymentId: string): string {
  return paymentEventId(paymentId, 'PAYMENT_DUE');
}

export { paymentDueIdempotencyKey };
