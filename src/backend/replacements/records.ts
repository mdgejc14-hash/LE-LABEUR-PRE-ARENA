/**
 * P0-REPLACEMENT — durable replacement dossier and its application/proposal links.
 *
 * The dossier does not model a second matching or financial engine. Candidate
 * selection and consent are represented by the existing Application and
 * Proposal records; the successor contract uses the existing Contract cycle.
 */

export const REPLACEMENT_API_SOURCE = 'api:P0-REPLACEMENT';

export const REPLACEMENT_STATUS_VALUES = [
  'PENDING_OFFER',
  'SOURCING_CANDIDATES',
  'CANDIDATE_SELECTED',
  'TRANSFERRED_TO_EMPLOYER',
  'CONTRACT_FINALIZED',
] as const;

export type ReplacementStatus = (typeof REPLACEMENT_STATUS_VALUES)[number];

export interface ReplacementRecord {
  replacementId: string;
  claimId: string;
  originalContractId: string;
  employerId: string;
  offerId?: string;
  selectedApplicationId?: string;
  selectedCandidateId?: string;
  selectedProposalId?: string;
  newContractId?: string;
  status: ReplacementStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReplacementStore {
  create(record: ReplacementRecord): Promise<ReplacementRecord>;
  findById(replacementId: string): Promise<ReplacementRecord | null>;
  findByIdForUpdate(replacementId: string): Promise<ReplacementRecord | null>;
  findByClaimIdForUpdate(claimId: string): Promise<ReplacementRecord | null>;
  findByOriginalContractForUpdate(contractId: string): Promise<ReplacementRecord | null>;
  findByOfferIdForUpdate(offerId: string): Promise<ReplacementRecord | null>;
  findBySelectedApplicationForUpdate(applicationId: string): Promise<ReplacementRecord | null>;
  findBySelectedProposalForUpdate(proposalId: string): Promise<ReplacementRecord | null>;
  attachOffer(input: { replacementId: string; offerId: string; at: string }): Promise<ReplacementRecord | null>;
  selectApplication(input: {
    replacementId: string;
    applicationId: string;
    candidateId: string;
    at: string;
  }): Promise<ReplacementRecord | null>;
  attachProposal(input: {
    replacementId: string;
    applicationId: string;
    candidateId: string;
    proposalId: string;
    at: string;
  }): Promise<ReplacementRecord | null>;
  releaseSelection(input: { replacementId: string; applicationId: string; at: string }): Promise<ReplacementRecord | null>;
  acceptProposal(input: { replacementId: string; proposalId: string; at: string }): Promise<ReplacementRecord | null>;
  declineProposal(input: { replacementId: string; proposalId: string; at: string }): Promise<ReplacementRecord | null>;
  linkSuccessorContract(input: {
    replacementId: string;
    proposalId: string;
    applicationId: string;
    candidateId: string;
    contractId: string;
    at: string;
  }): Promise<ReplacementRecord | null>;
  listForParty(actorId: string, limit: number, afterId?: string | null): Promise<ReplacementRecord[]>;
  listAll(limit: number, afterId?: string | null): Promise<ReplacementRecord[]>;
}
