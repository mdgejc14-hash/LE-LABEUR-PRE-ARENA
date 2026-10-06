/** P0-AUTO-2 — contract activation schedules, deadlines and notification-ready jobs. */
import { buildPaymentSchedule } from '../../domain/businessRules';
import type { CommissionPaymentStatus, PaymentScheduleEntry } from '../../types';
import { newEntityId } from '../identity/ids';
import type { PostgreSqlDatabase } from '../services/database';
import type { OutboxEvent } from '../productionContracts';
import { J3_SCHEDULER_CONTRACT } from '../services/scheduler';
import { createSqlContractStore } from '../persistence/sqlCoreStores';
import { AutomationEngine, AutomationRegistry, InMemoryQueue } from './foundation';
import type { AuditLedgerStore, Deadline, DomainEvent, ScheduledJob } from './foundation';
import {
  createPostgresAutomationStores,
  createSqlAuditLedgerStore,
  createSqlDeadlineStore,
  createSqlOutboxRepository,
  createSqlScheduledJobStore,
} from './postgres';
import { AutomationWorker } from './worker';

const DAY_MS = 86_400_000;
const NOTIFICATION_READY_JOB_TYPE = 'NOTIFICATION_REQUIRED';
const DUE_JOB_TYPES = new Set(['SALARY_PAYMENT_DUE', 'COMMISSION_PAYMENT_DUE', 'PAYMENT_OVERDUE_REMINDER']);

interface PaymentJobPayload extends Record<string, unknown> {
  contractId: string;
  employerId: string;
  employeeId: string;
  scheduleEntryId: string;
  monthNumber: number;
  periodKey: string;
  paymentKind: 'SALARY' | 'COMMISSION';
  amount: number;
  currency: string;
  dueAt: string;
  deadlineIdempotencyKey: string;
}

export interface ContractAutomationRuntime {
  worker: AutomationWorker;
  outbox: ReturnType<typeof createSqlOutboxRepository>;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be numeric.`);
  return value;
}

function dateOnlyAtUtcMidnight(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid payment due date: ${value}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid payment due date: ${value}`);
  }
  return parsed.toISOString();
}

function j3ReminderAt(dueAt: string): string {
  const due = new Date(dueAt);
  return new Date(due.getTime() + J3_SCHEDULER_CONTRACT.thresholdDays * DAY_MS).toISOString();
}

function makeScheduledJob(input: {
  idempotencyKey: string;
  jobType: string;
  dueAt: string;
  createdAt: string;
  eventId: string;
  contractId: string;
  payload: Record<string, unknown>;
}): ScheduledJob {
  return {
    jobId: newEntityId('job'),
    jobType: input.jobType,
    target: { aggregateType: 'Contract', aggregateId: input.contractId },
    dueAt: input.dueAt,
    availableAt: input.dueAt,
    status: 'PENDING',
    attempts: 0,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt,
    eventId: input.eventId,
    source: 'AutomationEngine',
    payload: input.payload,
  };
}

function makeDeadline(input: {
  idempotencyKey: string;
  dueAt: string;
  createdAt: string;
  eventId: string;
  contractId: string;
  jobId: string;
  payment: PaymentJobPayload;
}): Deadline {
  return {
    id: newEntityId('ddl'),
    aggregateType: 'Contract',
    aggregateId: input.contractId,
    dueAt: input.dueAt,
    status: 'OPEN',
    // These are labels, not an invented SLA duration. The actual dueAt is
    // derived from Contract.startDate and the existing monthly schedule rule.
    sla: input.payment.paymentKind === 'SALARY' ? 'CONTRACT_SALARY_DUE' : 'CONTRACT_COMMISSION_DUE',
    jobId: input.jobId,
    idempotencyKey: input.idempotencyKey,
    eventId: input.eventId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    payload: {
      contractId: input.payment.contractId,
      employerId: input.payment.employerId,
      employeeId: input.payment.employeeId,
      scheduleEntryId: input.payment.scheduleEntryId,
      monthNumber: input.payment.monthNumber,
      paymentKind: input.payment.paymentKind,
      amount: input.payment.amount,
      currency: input.payment.currency,
    },
  };
}

function auditEntry(input: {
  id: string;
  eventId?: string;
  jobId?: string;
  contractId: string;
  timestamp: string;
  action: string;
  source: string;
  reference?: string;
  result: Record<string, unknown>;
  error?: string;
}): import('./foundation').AuditLedgerEntry {
  return {
    id: input.id,
    ...(input.eventId ? { eventId: input.eventId } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    actorId: 'SYSTEM',
    timestamp: input.timestamp,
    entityId: input.contractId,
    action: input.action,
    source: input.source,
    ...(input.reference ? { reference: input.reference } : {}),
    result: input.result,
    ...(input.error ? { error: input.error } : {}),
  };
}

function paymentPayload(
  entry: PaymentScheduleEntry,
  contract: {
    id: string;
    employerId: string;
    employeeId: string;
    currency: string;
  },
  paymentKind: 'SALARY' | 'COMMISSION',
  amount: number,
  dueAt: string,
): PaymentJobPayload {
  const deadlineIdempotencyKey = `contract:${contract.id}:${paymentKind.toLowerCase()}:${entry.monthNumber}:deadline`;
  return {
    contractId: contract.id,
    employerId: contract.employerId,
    employeeId: contract.employeeId,
    scheduleEntryId: entry.id,
    monthNumber: entry.monthNumber,
    periodKey: entry.periodKey,
    paymentKind,
    amount,
    currency: contract.currency,
    dueAt,
    deadlineIdempotencyKey,
  };
}

async function appendCreatedJobAudit(
  audit: AuditLedgerStore,
  input: {
    event: DomainEvent;
    contractId: string;
    job: ScheduledJob;
    action: string;
    dueAt: string;
    amount: number;
    paymentKind: 'SALARY' | 'COMMISSION';
  },
): Promise<void> {
  await audit.append(auditEntry({
    id: `aud_${input.job.idempotencyKey}`,
    eventId: input.event.eventId,
    jobId: input.job.jobId,
    contractId: input.contractId,
    timestamp: input.event.timestamp,
    action: input.action,
    source: 'AutomationEngine',
    reference: input.job.idempotencyKey,
    result: {
      result: 'CREATED_OR_REPLAYED',
      jobId: input.job.jobId,
      jobType: input.job.jobType,
      dueAt: input.dueAt,
      paymentKind: input.paymentKind,
      amount: input.amount,
      status: input.job.status,
    },
  }));
}

async function scheduleContractActivation(
  database: PostgreSqlDatabase,
  event: DomainEvent,
): Promise<void> {
  if (event.aggregateType !== 'Contract') throw new Error('CONTRACT_ACTIVATED aggregate must be Contract.');
  const payload = asRecord(event.payload, 'CONTRACT_ACTIVATED payload');
  const contractId = asString(payload.contractId ?? event.aggregateId, 'CONTRACT_ACTIVATED contractId');
  if (contractId !== event.aggregateId) throw new Error('CONTRACT_ACTIVATED aggregate and contract IDs differ.');

  await database.run(async tx => {
    const contracts = createSqlContractStore(tx);
    const jobs = createSqlScheduledJobStore(tx);
    const deadlines = createSqlDeadlineStore(tx);
    const audit = createSqlAuditLedgerStore(tx);
    const contract = await contracts.findByIdForUpdate(contractId);
    if (!contract) throw new Error(`Activated contract not found: ${contractId}`);
    if (contract.status !== 'ACTIVE') throw new Error(`Contract is not ACTIVE: ${contractId}`);

    const generated = buildPaymentSchedule({
      contractId: contract.id,
      startDate: contract.startDate,
      durationMonths: contract.durationMonths,
      monthlySalary: contract.monthlySalary,
      currency: contract.currency,
      commissionPercentage: contract.commissionPercentage,
      createdAt: event.timestamp,
    });
    const previous = new Map(contract.paymentSchedule.map(entry => [entry.id, entry]));
    const paymentSchedule: PaymentScheduleEntry[] = [];

    for (const baseEntry of generated) {
      const oldEntry = previous.get(baseEntry.id);
      let entry: PaymentScheduleEntry = {
        ...baseEntry,
        ...(oldEntry ?? {}),
        // Contract fields and amounts remain authoritative; existing statuses,
        // payment metadata and history are preserved when an event is replayed.
        id: baseEntry.id,
        contractId: contract.id,
        monthNumber: baseEntry.monthNumber,
        periodKey: baseEntry.periodKey,
        periodStartDate: baseEntry.periodStartDate,
        salaryDueDate: baseEntry.salaryDueDate,
        commissionDueDate: baseEntry.commissionDueDate,
        salaryAmount: baseEntry.salaryAmount,
        employeeShareAmount: baseEntry.employeeShareAmount,
        commissionAmount: baseEntry.commissionAmount,
        commissionPercentage: baseEntry.commissionPercentage,
        currency: baseEntry.currency,
        employerId: contract.employerId,
        employeeId: contract.employeeId,
        createdAt: oldEntry?.createdAt ?? event.timestamp,
      };

      const salaryDueAt = dateOnlyAtUtcMidnight(entry.salaryDueDate);
      const salaryPayload = paymentPayload(entry, contract, 'SALARY', entry.salaryAmount, salaryDueAt);
      const salaryDueKey = `contract:${contract.id}:salary:${entry.monthNumber}:due`;
      const salaryDueJob = await jobs.createIfAbsent(makeScheduledJob({
        idempotencyKey: salaryDueKey,
        jobType: 'SALARY_PAYMENT_DUE',
        dueAt: salaryDueAt,
        createdAt: event.timestamp,
        eventId: event.eventId,
        contractId: contract.id,
        payload: salaryPayload,
      }));
      entry.salaryDueJobId = salaryDueJob.jobId;
      entry.salaryDueIdempotencyKey = salaryDueKey;

      const salaryReminderKey = `contract:${contract.id}:salary:${entry.monthNumber}:reminder:J3`;
      const salaryReminderAt = j3ReminderAt(salaryDueAt);
      const salaryReminderPayload = { ...salaryPayload, reminderAt: salaryReminderAt, notificationEventType: 'PAYMENT_OVERDUE_J3' };
      const salaryReminderJob = await jobs.createIfAbsent(makeScheduledJob({
        idempotencyKey: salaryReminderKey,
        jobType: 'PAYMENT_OVERDUE_REMINDER',
        dueAt: salaryReminderAt,
        createdAt: event.timestamp,
        eventId: event.eventId,
        contractId: contract.id,
        payload: salaryReminderPayload,
      }));
      entry.salaryReminderJobId = salaryReminderJob.jobId;
      entry.salaryReminderIdempotencyKey = salaryReminderKey;

      await deadlines.createIfAbsent(makeDeadline({
        idempotencyKey: salaryPayload.deadlineIdempotencyKey,
        dueAt: salaryDueAt,
        createdAt: event.timestamp,
        eventId: event.eventId,
        contractId: contract.id,
        jobId: salaryDueJob.jobId,
        payment: salaryPayload,
      }));
      await appendCreatedJobAudit(audit, {
        event,
        contractId: contract.id,
        job: salaryDueJob,
        action: 'CONTRACT_SALARY_SCHEDULE_JOB_CREATED',
        dueAt: salaryDueAt,
        amount: entry.salaryAmount,
        paymentKind: 'SALARY',
      });
      await appendCreatedJobAudit(audit, {
        event,
        contractId: contract.id,
        job: salaryReminderJob,
        action: 'CONTRACT_SALARY_REMINDER_JOB_CREATED',
        dueAt: salaryReminderAt,
        amount: entry.salaryAmount,
        paymentKind: 'SALARY',
      });
      await audit.append(auditEntry({
        id: `aud_${salaryPayload.deadlineIdempotencyKey}`,
        eventId: event.eventId,
        jobId: salaryDueJob.jobId,
        contractId: contract.id,
        timestamp: event.timestamp,
        action: 'CONTRACT_SALARY_DEADLINE_CREATED',
        source: 'AutomationEngine',
        reference: salaryPayload.deadlineIdempotencyKey,
        result: { result: 'CREATED_OR_REPLAYED', dueAt: salaryDueAt, status: 'OPEN' },
      }));

      if (entry.commissionAmount > 0) {
        const commissionDueAt = dateOnlyAtUtcMidnight(entry.commissionDueDate);
        const commissionPayload = paymentPayload(entry, contract, 'COMMISSION', entry.commissionAmount, commissionDueAt);
        const commissionDueKey = `contract:${contract.id}:commission:${entry.monthNumber}:due`;
        const commissionDueJob = await jobs.createIfAbsent(makeScheduledJob({
          idempotencyKey: commissionDueKey,
          jobType: 'COMMISSION_PAYMENT_DUE',
          dueAt: commissionDueAt,
          createdAt: event.timestamp,
          eventId: event.eventId,
          contractId: contract.id,
          payload: commissionPayload,
        }));
        entry.commissionDueJobId = commissionDueJob.jobId;
        entry.commissionDueIdempotencyKey = commissionDueKey;

        const commissionReminderKey = `contract:${contract.id}:commission:${entry.monthNumber}:reminder:J3`;
        const commissionReminderAt = j3ReminderAt(commissionDueAt);
        const commissionReminderJob = await jobs.createIfAbsent(makeScheduledJob({
          idempotencyKey: commissionReminderKey,
          jobType: 'PAYMENT_OVERDUE_REMINDER',
          dueAt: commissionReminderAt,
          createdAt: event.timestamp,
          eventId: event.eventId,
          contractId: contract.id,
          payload: { ...commissionPayload, reminderAt: commissionReminderAt, notificationEventType: 'PAYMENT_OVERDUE_J3' },
        }));
        entry.commissionReminderJobId = commissionReminderJob.jobId;
        entry.commissionReminderIdempotencyKey = commissionReminderKey;

        await deadlines.createIfAbsent(makeDeadline({
          idempotencyKey: commissionPayload.deadlineIdempotencyKey,
          dueAt: commissionDueAt,
          createdAt: event.timestamp,
          eventId: event.eventId,
          contractId: contract.id,
          jobId: commissionDueJob.jobId,
          payment: commissionPayload,
        }));
        await appendCreatedJobAudit(audit, {
          event,
          contractId: contract.id,
          job: commissionDueJob,
          action: 'CONTRACT_COMMISSION_SCHEDULE_JOB_CREATED',
          dueAt: commissionDueAt,
          amount: entry.commissionAmount,
          paymentKind: 'COMMISSION',
        });
        await appendCreatedJobAudit(audit, {
          event,
          contractId: contract.id,
          job: commissionReminderJob,
          action: 'CONTRACT_COMMISSION_REMINDER_JOB_CREATED',
          dueAt: commissionReminderAt,
          amount: entry.commissionAmount,
          paymentKind: 'COMMISSION',
        });
        await audit.append(auditEntry({
          id: `aud_${commissionPayload.deadlineIdempotencyKey}`,
          eventId: event.eventId,
          jobId: commissionDueJob.jobId,
          contractId: contract.id,
          timestamp: event.timestamp,
          action: 'CONTRACT_COMMISSION_DEADLINE_CREATED',
          source: 'AutomationEngine',
          reference: commissionPayload.deadlineIdempotencyKey,
          result: { result: 'CREATED_OR_REPLAYED', dueAt: commissionDueAt, status: 'OPEN' },
        }));
      }

      paymentSchedule.push(entry);
    }

    const firstCommission = generated.find(entry => entry.commissionAmount > 0);
    const existingCommissionLedger = new Map(contract.commissionLedger.map(entry => [entry.monthNumber, entry]));
    const commissionLedger = [...contract.commissionLedger];
    if (firstCommission) {
      const prior = existingCommissionLedger.get(firstCommission.monthNumber);
      const nextLedgerEntry = {
        ...(prior ?? {
          contractId: contract.id,
          monthNumber: firstCommission.monthNumber,
          salaryBase: contract.monthlySalary,
          percentage: contract.commissionPercentage,
          amountDue: firstCommission.commissionAmount,
          amountSubmitted: 0,
          status: 'SCHEDULED' as CommissionPaymentStatus,
          createdAt: event.timestamp,
        }),
        contractId: contract.id,
        monthNumber: firstCommission.monthNumber,
        salaryBase: contract.monthlySalary,
        percentage: contract.commissionPercentage,
        amountDue: firstCommission.commissionAmount,
        createdAt: prior?.createdAt ?? event.timestamp,
      };
      if (prior) {
        const index = commissionLedger.findIndex(entry => entry.monthNumber === firstCommission.monthNumber);
        commissionLedger[index] = nextLedgerEntry;
      } else {
        commissionLedger.push(nextLedgerEntry);
      }
    }

    const currentEntry = paymentSchedule.find(entry => entry.monthNumber === contract.currentMonth) ?? paymentSchedule[0];
    const updated = await contracts.saveAutomationSchedule(contract.id, {
      paymentSchedule,
      commissionLedger,
      commissionAmountDue: currentEntry?.commissionAmount ?? contract.commissionAmountDue,
      commissionStatus: currentEntry?.commissionStatus ?? contract.commissionStatus,
      updatedAt: event.timestamp,
    });
    if (!updated) throw new Error(`Activated contract disappeared while saving schedules: ${contract.id}`);
  });
}

function parsePaymentJobPayload(value: unknown): PaymentJobPayload {
  const payload = asRecord(value, 'ScheduledJob payload');
  const paymentKind = payload.paymentKind;
  if (paymentKind !== 'SALARY' && paymentKind !== 'COMMISSION') throw new Error('ScheduledJob paymentKind is invalid.');
  return {
    contractId: asString(payload.contractId, 'job.contractId'),
    employerId: asString(payload.employerId, 'job.employerId'),
    employeeId: asString(payload.employeeId, 'job.employeeId'),
    scheduleEntryId: asString(payload.scheduleEntryId, 'job.scheduleEntryId'),
    monthNumber: asNumber(payload.monthNumber, 'job.monthNumber'),
    periodKey: asString(payload.periodKey, 'job.periodKey'),
    paymentKind,
    amount: asNumber(payload.amount, 'job.amount'),
    currency: asString(payload.currency, 'job.currency'),
    dueAt: asString(payload.dueAt, 'job.dueAt'),
    deadlineIdempotencyKey: asString(payload.deadlineIdempotencyKey, 'job.deadlineIdempotencyKey'),
  };
}

function scheduleStatus(entry: PaymentScheduleEntry, kind: 'SALARY' | 'COMMISSION'): CommissionPaymentStatus | PaymentScheduleEntry['salaryStatus'] {
  return kind === 'SALARY' ? entry.salaryStatus : entry.commissionStatus;
}

function setScheduleStatus(
  entry: PaymentScheduleEntry,
  kind: 'SALARY' | 'COMMISSION',
  status: CommissionPaymentStatus | PaymentScheduleEntry['salaryStatus'],
): PaymentScheduleEntry {
  if (kind === 'SALARY') return { ...entry, salaryStatus: status as PaymentScheduleEntry['salaryStatus'] };
  return { ...entry, commissionStatus: status as CommissionPaymentStatus };
}

function outboxForJob(
  job: ScheduledJob,
  payload: PaymentJobPayload,
  eventType: 'PAYMENT_SCHEDULE_DUE' | 'PAYMENT_OVERDUE_J3',
  occurredAt: string,
): OutboxEvent {
  return {
    id: `evt_${job.jobId}_${eventType}`,
    type: eventType,
    aggregateType: 'Contract',
    aggregateId: payload.contractId,
    payload: {
      ...payload,
      jobId: job.jobId,
      notificationType: eventType === 'PAYMENT_OVERDUE_J3'
        ? 'PAYMENT_OVERDUE_J3'
        : payload.paymentKind === 'SALARY' ? 'MONTHLY_CHECKPOINT' : 'COMMISSION_DUE',
      recipientId: payload.employerId,
      recipientRole: 'EMPLOYER',
      additionalRecipientRoles: ['ADMIN'],
    },
    occurredAt,
    dedupeKey: `job:${job.jobId}:${eventType}`,
    actorId: 'SYSTEM',
    source: 'ScheduledJobWorker',
    version: 1,
    causationId: job.eventId,
  };
}

async function executeContractScheduledJob(
  database: PostgreSqlDatabase,
  outbox: ReturnType<typeof createSqlOutboxRepository>,
  job: ScheduledJob,
  workerId: string,
  evaluatedAt: Date,
): Promise<void> {
  if (!DUE_JOB_TYPES.has(job.jobType)) throw new Error(`Unsupported contract ScheduledJob: ${job.jobType}`);
  const details = parsePaymentJobPayload(job.payload);
  if (job.target.aggregateId !== details.contractId) throw new Error('ScheduledJob target does not match contractId.');
  const occurredAt = evaluatedAt.toISOString();

  await database.run(async tx => {
    const jobs = createSqlScheduledJobStore(tx);
    const currentJob = await jobs.findByIdForUpdate(job.jobId);
    if (!currentJob || currentJob.status !== 'RUNNING' || currentJob.claimedBy !== workerId) {
      throw new Error('ScheduledJob claim is no longer owned by this worker.');
    }

    const contracts = createSqlContractStore(tx);
    const deadlines = createSqlDeadlineStore(tx);
    const audit = createSqlAuditLedgerStore(tx);
    const contract = await contracts.findByIdForUpdate(details.contractId);
    if (!contract) throw new Error(`Contract not found for ScheduledJob: ${details.contractId}`);

    let schedule = contract.paymentSchedule.map(entry => ({ ...entry }));
    let scheduleChanged = false;
    const entryIndex = schedule.findIndex(entry => entry.id === details.scheduleEntryId);
    if (entryIndex < 0) throw new Error(`Payment schedule entry not found: ${details.scheduleEntryId}`);
    let entry = schedule[entryIndex];
    const amount = details.paymentKind === 'SALARY' ? entry.salaryAmount : entry.commissionAmount;
    const dueAt = new Date(details.dueAt);
    if (!Number.isFinite(dueAt.getTime())) throw new Error('ScheduledJob dueAt is invalid.');

    let outputEvent: OutboxEvent | undefined;
    let action = 'SCHEDULED_JOB_SKIPPED';
    let outcome = 'not-eligible';
    const currentStatus = scheduleStatus(entry, details.paymentKind);

    if (job.jobType === 'SALARY_PAYMENT_DUE' || job.jobType === 'COMMISSION_PAYMENT_DUE') {
      if (currentStatus === 'SCHEDULED' && amount > 0 && dueAt.getTime() <= evaluatedAt.getTime()) {
        entry = setScheduleStatus(entry, details.paymentKind, 'DUE');
        schedule[entryIndex] = entry;
        scheduleChanged = true;
        outputEvent = outboxForJob(job, details, 'PAYMENT_SCHEDULE_DUE', occurredAt);
        action = 'PAYMENT_SCHEDULE_DUE_EVENT_CREATED';
        outcome = 'due-event-created';
      } else if (currentStatus === 'DUE' && amount > 0) {
        outputEvent = outboxForJob(job, details, 'PAYMENT_SCHEDULE_DUE', occurredAt);
        action = 'PAYMENT_SCHEDULE_DUE_EVENT_REPLAYED';
        outcome = 'due-event-replayed';
      } else {
        await deadlines.setStatus(
          details.deadlineIdempotencyKey,
          currentStatus === 'PAID' ? 'MET' : 'CANCELLED',
          occurredAt,
        );
      }
    } else {
      // A delayed due worker must not prevent the existing J+3 policy from
      // setting an elapsed scheduled payment to DUE before checking eligibility.
      if (currentStatus === 'SCHEDULED' && amount > 0 && dueAt.getTime() <= evaluatedAt.getTime()) {
        entry = setScheduleStatus(entry, details.paymentKind, 'DUE');
        schedule[entryIndex] = entry;
        scheduleChanged = true;
      }
      const reminderStatus = scheduleStatus(entry, details.paymentKind);
      if (reminderStatus === 'DUE' && amount > 0 && evaluatedAt.getTime() >= dueAt.getTime() + J3_SCHEDULER_CONTRACT.thresholdDays * DAY_MS) {
        await deadlines.setStatus(details.deadlineIdempotencyKey, 'OVERDUE', occurredAt);
        outputEvent = outboxForJob(job, details, 'PAYMENT_OVERDUE_J3', occurredAt);
        action = 'PAYMENT_OVERDUE_J3_EVENT_CREATED';
        outcome = 'reminder-event-created';
      } else if (reminderStatus === 'PAID') {
        await deadlines.setStatus(details.deadlineIdempotencyKey, 'MET', occurredAt);
      } else if (reminderStatus !== 'DUE') {
        await deadlines.setStatus(details.deadlineIdempotencyKey, 'CANCELLED', occurredAt);
      }
    }

    if (scheduleChanged) {
      const changedEntry = schedule[entryIndex];
      let commissionLedger = contract.commissionLedger.map(ledgerEntry => ({ ...ledgerEntry }));
      if (details.paymentKind === 'COMMISSION' && changedEntry.commissionStatus === 'DUE') {
        commissionLedger = commissionLedger.map(ledgerEntry => ledgerEntry.monthNumber === details.monthNumber
          ? { ...ledgerEntry, status: ledgerEntry.status === 'SCHEDULED' ? 'DUE' : ledgerEntry.status }
          : ledgerEntry);
      }
      const currentEntry = schedule.find(item => item.monthNumber === contract.currentMonth) ?? schedule[0];
      await contracts.saveAutomationSchedule(contract.id, {
        paymentSchedule: schedule,
        commissionLedger,
        commissionAmountDue: currentEntry?.commissionAmount ?? contract.commissionAmountDue,
        commissionStatus: currentEntry?.commissionStatus ?? contract.commissionStatus,
        updatedAt: occurredAt,
      });
    }

    if (outputEvent) await outbox.append(tx, outputEvent);
    await jobs.complete(job.jobId, workerId, occurredAt);
    await audit.append(auditEntry({
      id: `aud_job_${job.idempotencyKey}_executed`,
      eventId: outputEvent?.id ?? job.eventId,
      jobId: job.jobId,
      contractId: details.contractId,
      timestamp: occurredAt,
      action,
      source: 'ScheduledJobWorker',
      reference: job.idempotencyKey,
      result: {
        status: 'COMPLETED',
        outcome,
        eventId: outputEvent?.id,
        deadlineStatus: job.jobType === 'PAYMENT_OVERDUE_REMINDER' && outputEvent ? 'OVERDUE' : undefined,
      },
    }));
  });
}

async function createNotificationReadyJob(
  database: PostgreSqlDatabase,
  event: DomainEvent,
): Promise<void> {
  const payload = asRecord(event.payload, `${event.eventType} payload`);
  const contractId = asString(payload.contractId ?? event.aggregateId, 'notification job contractId');
  if (event.aggregateType !== 'Contract' || contractId !== event.aggregateId) {
    throw new Error('Notification-ready event aggregate mismatch.');
  }
  const paymentKind = payload.paymentKind;
  if (paymentKind !== 'SALARY' && paymentKind !== 'COMMISSION') {
    throw new Error('Notification-ready event paymentKind is invalid.');
  }
  const employerId = asString(payload.employerId ?? payload.recipientId, 'notification job employerId');
  const employeeId = asString(payload.employeeId, 'notification job employeeId');
  const jobType = event.eventType === 'PAYMENT_OVERDUE_J3'
    ? 'PAYMENT_OVERDUE_J3'
    : paymentKind === 'SALARY' ? 'SALARY_DUE' : 'COMMISSION_DUE';
  const notificationType = event.eventType === 'PAYMENT_OVERDUE_J3'
    ? 'PAYMENT_OVERDUE_J3'
    : paymentKind === 'SALARY' ? 'MONTHLY_CHECKPOINT' : 'COMMISSION_DUE';

  await database.run(async tx => {
    const jobs = createSqlScheduledJobStore(tx);
    const audit = createSqlAuditLedgerStore(tx);
    const job = await jobs.createIfAbsent(makeScheduledJob({
      idempotencyKey: `event:${event.eventId}:notification-required`,
      jobType: NOTIFICATION_READY_JOB_TYPE,
      dueAt: event.timestamp,
      createdAt: event.timestamp,
      eventId: event.eventId,
      contractId,
      payload: {
        notificationType,
        sourceEventType: event.eventType,
        sourceEventId: event.eventId,
        contractId,
        employerId,
        employeeId,
        recipientId: employerId,
        recipientRole: 'EMPLOYER',
        additionalRecipientRoles: ['ADMIN'],
        scheduleEntryId: asString(payload.scheduleEntryId, 'notification job scheduleEntryId'),
        monthNumber: asNumber(payload.monthNumber, 'notification job monthNumber'),
        paymentKind,
        amount: asNumber(payload.amount, 'notification job amount'),
        currency: asString(payload.currency, 'notification job currency'),
        dueAt: asString(payload.dueAt, 'notification job dueAt'),
        channel: null,
      },
    }));
    await audit.append(auditEntry({
      id: `aud_event_${event.eventId}_notification_required`,
      eventId: event.eventId,
      jobId: job.jobId,
      contractId,
      timestamp: event.timestamp,
      action: 'CONTRACT_NOTIFICATION_REQUIRED_JOB_CREATED',
      source: 'AutomationEngine',
      reference: job.idempotencyKey,
      result: {
        result: 'CREATED_OR_REPLAYED',
        jobId: job.jobId,
        jobType: job.jobType,
        notificationCategory: jobType,
        notificationType,
        status: job.status,
        channelSent: false,
      },
    }));
  });
}

export function createContractAutomationRuntime(
  database: PostgreSqlDatabase,
  now: () => Date = () => new Date(),
): ContractAutomationRuntime {
  const stores = createPostgresAutomationStores(database);
  const registry = new AutomationRegistry();
  registry.register('CONTRACT_ACTIVATED', async ({ event }) => scheduleContractActivation(database, event));
  registry.register('PAYMENT_SCHEDULE_DUE', async ({ event }) => createNotificationReadyJob(database, event));
  registry.register('PAYMENT_OVERDUE_J3', async ({ event }) => createNotificationReadyJob(database, event));

  const engine = new AutomationEngine(registry, new Set(), stores.idempotency);
  const worker = new AutomationWorker({
    outbox: stores.outbox,
    queue: new InMemoryQueue<DomainEvent>(),
    engine,
    jobs: stores.jobs,
    audit: stores.audit,
    now,
    scheduledJobExecutor: {
      execute: (job, workerId, evaluatedAt) => executeContractScheduledJob(database, stores.outbox, job, workerId, evaluatedAt),
    },
  });
  return { worker, outbox: stores.outbox };
}
