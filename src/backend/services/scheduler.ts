import type { ScheduleEntrySnapshot, ScheduleWorkerBoundary, ScheduleWorkerResult } from '../productionContracts';

/**
 * J+3 policy transcription from the current business layer. This describes a
 * future Cron/Worker; it does not evaluate rows, run a timer, emit events or
 * alter mock behavior in Phase 1.
 */
export const J3_SCHEDULER_CONTRACT = {
  currentSource: 'Contract.paymentSchedule[]',
  targetTable: 'payment_schedules',
  currentDateModel: 'date-only YYYY-MM-DD parsed at 00:00 UTC',
  fullDaysLate: 'floor((evaluationTime - dueAt) / 86_400_000)',
  thresholdDays: 3,
  alertStatuses: ['DUE'] as const,
  blockEligibilityStatuses: ['DUE', 'REJECTED'] as const,
  ignoreCommissionWhenAtOrBelow: 0,
  domainEvent: 'PAYMENT_OVERDUE_J3',
  notificationType: 'PAYMENT_OVERDUE_J3',
  notificationRecipients: ['employer', 'authorized Admin users'] as const,
  existingMockDedupeShape: 'contractId:monthNumber:paymentKind:J3:EMPLOYER|ADMIN:adminId',
  futureAuditAction: 'SCHEDULE_J3_ELIGIBILITY_RECORDED',
  futureAuditActor: 'SYSTEM',
  futureAuditFields: ['scheduleEntryId', 'paymentKind', 'dueDate', 'status', 'daysLate', 'outboxEventId'] as const,
} as const;

export interface ScheduleEntryRepository {
  /** Production implementation queries due rows server-side from payment_schedules. */
  findEntriesForEvaluation(asOf: string, limit: number): Promise<ScheduleEntrySnapshot[]>;
  loadEntry(scheduleEntryId: string): Promise<ScheduleEntrySnapshot | null>;
}

/** Type-only seam for a future scheduled Worker; no in-browser scheduler. */
export type J3ScheduleWorker = ScheduleWorkerBoundary;
export type J3ScheduleResult = ScheduleWorkerResult;
