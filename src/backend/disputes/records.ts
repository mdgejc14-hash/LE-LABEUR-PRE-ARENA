/** P0-DISPUTE-1 — records and PostgreSQL store contract for claims. */

export const CLAIM_TYPE_VALUES = [
  'SALARY_NOT_RECEIVED',
  'PAYMENT_DISPUTE',
  'CONTRACT_INCIDENT',
  'OTHER_REVIEW_REQUIRED',
] as const;
export type ClaimType = (typeof CLAIM_TYPE_VALUES)[number];

export const CLAIM_STATUS_VALUES = [
  'OPEN',
  'EVIDENCE_REQUESTED',
  'UNDER_REVIEW',
  'ADMIN_REVIEW',
  'RESOLVED',
  'REJECTED',
  'CLOSED',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUS_VALUES)[number];
export const CLAIM_TERMINAL_STATUSES: readonly ClaimStatus[] = ['RESOLVED', 'REJECTED', 'CLOSED'];
export const CLAIM_OPEN_STATUSES: readonly ClaimStatus[] = ['OPEN', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'ADMIN_REVIEW'];

export const CLAIM_EVIDENCE_TYPE_VALUES = ['PAYMENT_PROOF', 'CONTRACT_EVIDENCE', 'SUPPORTING_EVIDENCE'] as const;
export type ClaimEvidenceType = (typeof CLAIM_EVIDENCE_TYPE_VALUES)[number];
export const CLAIM_EVIDENCE_STATUS_VALUES = ['PENDING', 'SUBMITTED', 'CANCELLED', 'EXPIRED'] as const;
export type ClaimEvidenceStatus = (typeof CLAIM_EVIDENCE_STATUS_VALUES)[number];

/** The only provisional capability opened in this tranche. */
export const CLAIM_RESTRICTION_SCOPE_VALUES = ['CONTRACT_TERMINATE'] as const;
export type ClaimRestrictionScope = (typeof CLAIM_RESTRICTION_SCOPE_VALUES)[number];
export type ClaimRestrictionStatus = 'ACTIVE' | 'RELEASED';

export interface ClaimRecord {
  claimId: string;
  contractId: string;
  paymentId?: string;
  salaryConfirmationId?: string;
  claimantId: string;
  respondentId: string;
  type: ClaimType;
  reason: string;
  status: ClaimStatus;
  createdAt: string;
  dueAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  evidenceReference?: string;
  /** Persistent foreign-link alias stored in metadata for API/audit projections. */
  replacementId?: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
}

export interface ClaimEvidenceRequestRecord {
  evidenceRequestId: string;
  claimId: string;
  requestedFrom: string;
  requestedBy: string;
  requestedType: ClaimEvidenceType;
  dueAt?: string;
  status: ClaimEvidenceStatus;
  createdAt: string;
  submittedAt?: string;
  evidenceReference?: string;
}

export interface ClaimRestrictionRecord {
  restrictionId: string;
  claimId: string;
  userId: string;
  scope: ClaimRestrictionScope;
  status: ClaimRestrictionStatus;
  reason: string;
  appliedBy: string;
  appliedAt: string;
  releasedBy?: string;
  releasedAt?: string;
  releaseReason?: string;
}

export interface ClaimStore {
  createClaim(record: ClaimRecord): Promise<ClaimRecord>;
  findClaim(claimId: string): Promise<ClaimRecord | null>;
  findClaimForUpdate(claimId: string): Promise<ClaimRecord | null>;
  findActiveClaimForTarget(contractId: string, paymentId?: string): Promise<ClaimRecord | null>;
  listForParty(actorId: string, limit: number, afterId?: string | null): Promise<ClaimRecord[]>;
  listAll(limit: number, afterId?: string | null): Promise<ClaimRecord[]>;
  transitionClaim(input: {
    claimId: string;
    expected: readonly ClaimStatus[];
    status: ClaimStatus;
    at: string;
    dueAt?: string | null;
    evidenceReference?: string | null;
    resolvedAt?: string | null;
    resolvedBy?: string | null;
    resolution?: string | null;
    replacementId?: string | null;
  }): Promise<ClaimRecord | null>;
  createEvidenceRequest(record: ClaimEvidenceRequestRecord): Promise<ClaimEvidenceRequestRecord>;
  findEvidenceRequest(evidenceRequestId: string): Promise<ClaimEvidenceRequestRecord | null>;
  findEvidenceRequestForUpdate(evidenceRequestId: string): Promise<ClaimEvidenceRequestRecord | null>;
  findPendingEvidenceRequestForClaim(claimId: string): Promise<ClaimEvidenceRequestRecord | null>;
  listEvidenceRequests(claimId: string): Promise<ClaimEvidenceRequestRecord[]>;
  transitionEvidenceRequest(input: {
    evidenceRequestId: string;
    expected: readonly ClaimEvidenceStatus[];
    status: ClaimEvidenceStatus;
    at: string;
    submittedAt?: string | null;
    evidenceReference?: string | null;
  }): Promise<ClaimEvidenceRequestRecord | null>;
  createRestriction(record: ClaimRestrictionRecord): Promise<ClaimRestrictionRecord | null>;
  findRestriction(restrictionId: string): Promise<ClaimRestrictionRecord | null>;
  findActiveRestriction(claimId: string, userId: string, scope: ClaimRestrictionScope): Promise<ClaimRestrictionRecord | null>;
  listRestrictions(claimId: string): Promise<ClaimRestrictionRecord[]>;
  releaseRestriction(input: {
    restrictionId: string;
    actorId: string;
    reason: string;
    at: string;
  }): Promise<ClaimRestrictionRecord | null>;
  releaseActiveRestrictionsForClaim(input: {
    claimId: string;
    actorId: string;
    reason: string;
    at: string;
  }): Promise<ClaimRestrictionRecord[]>;
  hasActiveRestriction(contractId: string, userId: string, scope: ClaimRestrictionScope): Promise<boolean>;
}
