/**
 * P0-PAY-3 — contrats de jobs branchés sur Outbox → worker → automation_jobs.
 * Aucun scheduler parallèle : les dates éventuelles sont décidées explicitement
 * par l'appelant ou la configuration d'exploitation.
 */

export const PAYMENT_RECONCILIATION_BATCH_REQUESTED_EVENT = 'PAYMENT_RECONCILIATION_BATCH_REQUESTED' as const;

export const PAYMENT_RECONCILIATION_BATCH_JOB = 'PAYMENT_RECONCILIATION_BATCH' as const;
export const PAYMENT_RECONCILIATION_RETRY_JOB = 'PAYMENT_RECONCILIATION_RETRY' as const;
export const PAYMENT_REVIEW_ESCALATION_JOB = 'PAYMENT_REVIEW_ESCALATION' as const;
export const PAYMENT_RECONCILIATION_STALE_JOB = 'PAYMENT_RECONCILIATION_STALE' as const;

export const PAYMENT_RECONCILIATION_JOB_TYPES = [
  PAYMENT_RECONCILIATION_BATCH_JOB,
  PAYMENT_RECONCILIATION_RETRY_JOB,
  PAYMENT_REVIEW_ESCALATION_JOB,
  PAYMENT_RECONCILIATION_STALE_JOB,
] as const;

export type PaymentReconciliationJobType = (typeof PAYMENT_RECONCILIATION_JOB_TYPES)[number];
