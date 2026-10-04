import type { TransactionBoundary, TransactionContext } from '../productionContracts';

export interface TransactionalMutationPlan {
  key: string;
  resourcesToLock: readonly string[];
  businessWrites: readonly string[];
  auditRequired: boolean;
  outboxEvents: readonly string[];
}

/**
 * Transaction map only. A future implementation must execute the business
 * writes, audit insert and outbox inserts in one PostgreSQL transaction. A
 * try/catch or in-memory rollback is explicitly not a substitute.
 */
export const TRANSACTIONAL_MUTATION_PLANS: readonly TransactionalMutationPlan[] = [
  {
    key: 'contract.activation',
    resourcesToLock: ['offer', 'application', 'contract'],
    businessWrites: [
      'activate the bilaterally signed contract',
      'mark the winning application hired and close competing applications',
      'mark the offer filled and persist the payment schedule',
      'append contract history',
    ],
    auditRequired: true,
    outboxEvents: ['CONTRACT_SIGNED'],
  },
  {
    key: 'payment.verification',
    resourcesToLock: ['payment declaration', 'payment schedule entry', 'contract'],
    businessWrites: [
      'verify or reject the declaration under the existing payment rules',
      'update the payment schedule, ledger and contract history consistently',
    ],
    auditRequired: true,
    outboxEvents: ['PAYMENT_APPROVED', 'PAYMENT_REJECTED'],
  },
  {
    key: 'incident.report',
    resourcesToLock: ['contract', 'incident'],
    businessWrites: ['create the incident and append its initial history'],
    auditRequired: true,
    outboxEvents: ['INCIDENT_OPENED'],
  },
  {
    key: 'incident.arbitration',
    resourcesToLock: ['incident', 'contract', 'application'],
    businessWrites: [
      'apply the existing arbitration decision to the incident and contract',
      'create or update replacement state only for the replacement decision',
      'append incident and contract histories',
    ],
    auditRequired: true,
    outboxEvents: ['INCIDENT_DECIDED', 'REPLACEMENT_CREATED'],
  },
  {
    key: 'replacement.create',
    resourcesToLock: ['incident', 'source contract'],
    businessWrites: ['create the replacement dossier from an authorized incident decision'],
    auditRequired: true,
    outboxEvents: ['REPLACEMENT_CREATED'],
  },
  {
    key: 'replacement.transfer',
    resourcesToLock: ['replacement dossier', 'source contract', 'offer'],
    businessWrites: [
      'record candidate transfer and the replacement contract',
      'create or link the required conversation using existing behavior',
      'append replacement and contract histories',
    ],
    auditRequired: true,
    outboxEvents: ['CANDIDATE_TRANSFERRED'],
  },
  {
    key: 'account.block-or-unblock',
    resourcesToLock: ['user account', 'outstanding payment schedules'],
    businessWrites: [
      'apply the existing eligibility and regularization rules',
      'change account status and retain reason and actor metadata',
    ],
    auditRequired: true,
    outboxEvents: ['ACCOUNT_BLOCKED', 'ACCOUNT_UNBLOCKED'],
  },
] as const;

/** Marker type used by DB-facing repositories; no mock implementation exists. */
export interface DatabaseTransactionBoundary extends TransactionBoundary {
  run<T>(operation: (transaction: TransactionContext) => Promise<T>): Promise<T>;
}
