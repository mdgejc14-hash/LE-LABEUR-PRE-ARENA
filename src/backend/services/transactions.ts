import type { TransactionBoundary, TransactionContext } from '../productionContracts';

export interface TransactionalMutationPlan {
  key: string;
  resourcesToLock: readonly string[];
  businessWrites: readonly string[];
  auditRequired: boolean;
  outboxEvents: readonly string[];
}

/**
 * Audit map des mutations transactionnelles ouvertes. Chaque entrée décrit une
 * commande atomique réellement portée par un repository; les étapes distinctes
 * Application, Proposal et Contract ne sont jamais fusionnées en un transfert.
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
    outboxEvents: ['CONTRACT_ACTIVATED'],
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
    resourcesToLock: ['contract', 'claim'],
    businessWrites: ['create the Claim and append its initial history'],
    auditRequired: true,
    outboxEvents: ['CLAIM_CREATED'],
  },
  {
    key: 'incident.arbitration',
    resourcesToLock: ['claim', 'source contract', 'replacement dossier'],
    businessWrites: [
      'apply the ADMIN decision to the Claim',
      'for REPLACE, create one PENDING_OFFER dossier and mark the old contract REPLACED',
      'append Claim and old-contract histories without modifying payments',
    ],
    auditRequired: true,
    outboxEvents: ['CLAIM_RESOLVED', 'CLAIM_REJECTED', 'REPLACEMENT_CREATED'],
  },
  {
    key: 'replacement.offer.publish',
    resourcesToLock: ['replacement dossier', 'employer', 'offer'],
    businessWrites: [
      'create a standard ACTIVE Offer using the employer-provided terms',
      'attach that offer once and transition PENDING_OFFER to SOURCING_CANDIDATES',
    ],
    auditRequired: true,
    outboxEvents: [],
  },
  {
    key: 'replacement.application.shortlist',
    resourcesToLock: ['application', 'replacement dossier'],
    businessWrites: [
      'shortlist the existing candidate Application',
      'compare-and-set the sole selected application and candidate',
    ],
    auditRequired: true,
    outboxEvents: ['APPLICATION_SHORTLISTED'],
  },
  {
    key: 'replacement.proposal.send-or-respond',
    resourcesToLock: ['application', 'proposal', 'replacement dossier'],
    businessWrites: [
      'create the standard Proposal from the employer-selected application',
      'require the candidate response before marking the replacement transferred',
      'release a declined/expired candidate back to sourcing without losing history',
    ],
    auditRequired: true,
    outboxEvents: ['PROPOSAL_SENT', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED'],
  },
  {
    key: 'replacement.contract.create',
    resourcesToLock: ['proposal', 'application', 'source contract', 'replacement dossier', 'successor contract'],
    businessWrites: [
      'create a distinct DRAFT successor contract from the accepted Proposal',
      'link successor.replacementId + successor.replacedContractId',
      'link replacement.newContractId + oldContract.replacedContractId and append history',
    ],
    auditRequired: true,
    outboxEvents: [],
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
