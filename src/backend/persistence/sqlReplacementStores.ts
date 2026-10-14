/** PostgreSQL adapter for the P0-REPLACEMENT dossier. */

import type { SqlQueryExecutor } from '../services/database';
import type { ReplacementRecord, ReplacementStore, ReplacementStatus } from '../replacements/records';

interface ReplacementRow {
  replacement_id: string;
  claim_id: string;
  original_contract_id: string;
  employer_id: string;
  offer_id: string | null;
  selected_application_id: string | null;
  selected_candidate_id: string | null;
  selected_proposal_id: string | null;
  new_contract_id: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optional(value: string | null): string | undefined {
  return value ?? undefined;
}

function toRecord(row: ReplacementRow): ReplacementRecord {
  return {
    replacementId: row.replacement_id,
    claimId: row.claim_id,
    originalContractId: row.original_contract_id,
    employerId: row.employer_id,
    ...(optional(row.offer_id) ? { offerId: row.offer_id! } : {}),
    ...(optional(row.selected_application_id) ? { selectedApplicationId: row.selected_application_id! } : {}),
    ...(optional(row.selected_candidate_id) ? { selectedCandidateId: row.selected_candidate_id! } : {}),
    ...(optional(row.selected_proposal_id) ? { selectedProposalId: row.selected_proposal_id! } : {}),
    ...(optional(row.new_contract_id) ? { newContractId: row.new_contract_id! } : {}),
    status: row.status as ReplacementStatus,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

export function createSqlReplacementStore(db: SqlQueryExecutor): ReplacementStore {
  const findLocked = async (where: string, value: string): Promise<ReplacementRecord | null> => {
    const result = await db.query<ReplacementRow>(`SELECT * FROM replacements WHERE ${where} = $1 FOR UPDATE`, [value]);
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  };

  return {
    async create(record) {
      const result = await db.query<ReplacementRow>(
        `INSERT INTO replacements (
           replacement_id, claim_id, original_contract_id, employer_id, offer_id,
           selected_application_id, selected_candidate_id, selected_proposal_id,
           new_contract_id, status, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          record.replacementId,
          record.claimId,
          record.originalContractId,
          record.employerId,
          record.offerId ?? null,
          record.selectedApplicationId ?? null,
          record.selectedCandidateId ?? null,
          record.selectedProposalId ?? null,
          record.newContractId ?? null,
          record.status,
          record.createdAt,
          record.updatedAt,
        ],
      );
      return toRecord(result.rows[0]);
    },

    async findById(replacementId) {
      const result = await db.query<ReplacementRow>('SELECT * FROM replacements WHERE replacement_id = $1', [replacementId]);
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    findByIdForUpdate: replacementId => findLocked('replacement_id', replacementId),
    findByClaimIdForUpdate: claimId => findLocked('claim_id', claimId),
    findByOriginalContractForUpdate: contractId => findLocked('original_contract_id', contractId),
    findByOfferIdForUpdate: offerId => findLocked('offer_id', offerId),
    findBySelectedApplicationForUpdate: applicationId => findLocked('selected_application_id', applicationId),
    findBySelectedProposalForUpdate: proposalId => findLocked('selected_proposal_id', proposalId),

    async attachOffer(input) {
      const result = await db.query<ReplacementRow>(
        `UPDATE replacements
            SET offer_id = $2, status = 'SOURCING_CANDIDATES', updated_at = $3
          WHERE replacement_id = $1 AND status = 'PENDING_OFFER' AND offer_id IS NULL
          RETURNING *`,
        [input.replacementId, input.offerId, input.at],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async selectApplication(input) {
      const result = await db.query<ReplacementRow>(
        `UPDATE replacements
            SET status = 'CANDIDATE_SELECTED',
                selected_application_id = $2,
                selected_candidate_id = $3,
                updated_at = $4
          WHERE replacement_id = $1
            AND status = 'SOURCING_CANDIDATES'
            AND offer_id IS NOT NULL
            AND selected_application_id IS NULL
            AND selected_candidate_id IS NULL
          RETURNING *`,
        [input.replacementId, input.applicationId, input.candidateId, input.at],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async attachProposal(input) {
      const result = await db.query<ReplacementRow>(
        `UPDATE replacements
            SET selected_proposal_id = $4, updated_at = $5
          WHERE replacement_id = $1
            AND status = 'CANDIDATE_SELECTED'
            AND selected_application_id = $2
            AND selected_candidate_id = $3
            AND selected_proposal_id IS NULL
          RETURNING *`,
        [input.replacementId, input.applicationId, input.candidateId, input.proposalId, input.at],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async releaseSelection(input) {
      const result = await db.query<ReplacementRow>(
        `UPDATE replacements
            SET status = 'SOURCING_CANDIDATES',
                selected_application_id = NULL,
                selected_candidate_id = NULL,
                selected_proposal_id = NULL,
                updated_at = $3
          WHERE replacement_id = $1
            AND status = 'CANDIDATE_SELECTED'
            AND selected_application_id = $2
            AND selected_proposal_id IS NULL
          RETURNING *`,
        [input.replacementId, input.applicationId, input.at],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async acceptProposal(input) {
      const result = await db.query<ReplacementRow>(
        `UPDATE replacements
            SET status = 'TRANSFERRED_TO_EMPLOYER', updated_at = $3
          WHERE replacement_id = $1
            AND status = 'CANDIDATE_SELECTED'
            AND selected_proposal_id = $2
          RETURNING *`,
        [input.replacementId, input.proposalId, input.at],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async declineProposal(input) {
      const result = await db.query<ReplacementRow>(
        `UPDATE replacements
            SET status = 'SOURCING_CANDIDATES',
                selected_application_id = NULL,
                selected_candidate_id = NULL,
                selected_proposal_id = NULL,
                updated_at = $3
          WHERE replacement_id = $1
            AND status = 'CANDIDATE_SELECTED'
            AND selected_proposal_id = $2
          RETURNING *`,
        [input.replacementId, input.proposalId, input.at],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async linkSuccessorContract(input) {
      const result = await db.query<ReplacementRow>(
        `UPDATE replacements
            SET status = 'CONTRACT_FINALIZED', new_contract_id = $5, updated_at = $6
          WHERE replacement_id = $1
            AND status = 'TRANSFERRED_TO_EMPLOYER'
            AND selected_proposal_id = $2
            AND selected_application_id = $3
            AND selected_candidate_id = $4
            AND new_contract_id IS NULL
          RETURNING *`,
        [input.replacementId, input.proposalId, input.applicationId, input.candidateId, input.contractId, input.at],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async listForParty(actorId, limit, afterId = null) {
      const result = await db.query<ReplacementRow>(
        `SELECT r.*
           FROM replacements r
           JOIN contracts original ON original.id = r.original_contract_id
          WHERE ($2::text IS NULL OR r.replacement_id > $2)
            AND (r.employer_id = $1 OR original.candidate_id = $1 OR r.selected_candidate_id = $1)
          ORDER BY r.replacement_id ASC
          LIMIT $3`,
        [actorId, afterId, limit],
      );
      return result.rows.map(toRecord);
    },

    async listAll(limit, afterId = null) {
      const result = await db.query<ReplacementRow>(
        `SELECT * FROM replacements
          WHERE ($1::text IS NULL OR replacement_id > $1)
          ORDER BY replacement_id ASC
          LIMIT $2`,
        [afterId, limit],
      );
      return result.rows.map(toRecord);
    },
  };
}
