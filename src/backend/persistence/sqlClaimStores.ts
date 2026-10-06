/** P0-DISPUTE-1 — PostgreSQL adapters for claims, evidence and reversible restrictions. */

import type { SqlQueryExecutor, SqlQueryResult } from '../services/database';
import { postgresErrorCode } from './sqlClient';
import type {
  ClaimEvidenceRequestRecord,
  ClaimEvidenceStatus,
  ClaimRecord,
  ClaimRestrictionRecord,
  ClaimRestrictionScope,
  ClaimStatus,
  ClaimStore,
} from '../disputes/records';

const UNIQUE_VIOLATION = '23505';

function readText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function readOptionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return readText(value);
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedLimit(limit: number, max = 101): number {
  if (!Number.isFinite(limit)) return 25;
  const value = Math.trunc(limit);
  if (value < 1) return 25;
  return Math.min(value, max);
}

function placeholders(start: number, count: number): string {
  return Array.from({ length: count }, (_, index) => `$${start + index}`).join(', ');
}

interface ClaimRow {
  claim_id: string;
  contract_id: string;
  payment_id: string | null;
  salary_confirmation_id: string | null;
  claimant_id: string;
  respondent_id: string;
  type: ClaimRecord['type'];
  reason: string;
  status: ClaimStatus;
  created_at: unknown;
  due_at: unknown;
  resolved_at: unknown;
  resolved_by: string | null;
  resolution: string | null;
  evidence_reference: string | null;
  metadata: unknown;
  idempotency_key: string;
}

function toClaim(row: ClaimRow): ClaimRecord {
  const metadata = readJsonObject(row.metadata);
  const replacementId = readOptionalText(metadata.replacementId);
  const paymentId = readOptionalText(row.payment_id);
  const salaryConfirmationId = readOptionalText(row.salary_confirmation_id);
  const dueAt = readOptionalText(row.due_at);
  const resolvedAt = readOptionalText(row.resolved_at);
  const resolvedBy = readOptionalText(row.resolved_by);
  const resolution = readOptionalText(row.resolution);
  const evidenceReference = readOptionalText(row.evidence_reference);
  return {
    claimId: row.claim_id,
    contractId: row.contract_id,
    claimantId: row.claimant_id,
    respondentId: row.respondent_id,
    type: row.type,
    reason: row.reason,
    status: row.status,
    createdAt: readText(row.created_at),
    metadata,
    idempotencyKey: row.idempotency_key,
    ...(replacementId !== undefined ? { replacementId } : {}),
    ...(paymentId !== undefined ? { paymentId } : {}),
    ...(salaryConfirmationId !== undefined ? { salaryConfirmationId } : {}),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    ...(resolvedBy !== undefined ? { resolvedBy } : {}),
    ...(resolution !== undefined ? { resolution } : {}),
    ...(evidenceReference !== undefined ? { evidenceReference } : {}),
  };
}

interface EvidenceRow {
  evidence_request_id: string;
  claim_id: string;
  requested_from: string;
  requested_by: string;
  requested_type: ClaimEvidenceRequestRecord['requestedType'];
  due_at: unknown;
  status: ClaimEvidenceStatus;
  created_at: unknown;
  submitted_at: unknown;
  evidence_reference: string | null;
}

function toEvidenceRequest(row: EvidenceRow): ClaimEvidenceRequestRecord {
  const dueAt = readOptionalText(row.due_at);
  const submittedAt = readOptionalText(row.submitted_at);
  const evidenceReference = readOptionalText(row.evidence_reference);
  return {
    evidenceRequestId: row.evidence_request_id,
    claimId: row.claim_id,
    requestedFrom: row.requested_from,
    requestedBy: row.requested_by,
    requestedType: row.requested_type,
    status: row.status,
    createdAt: readText(row.created_at),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(submittedAt !== undefined ? { submittedAt } : {}),
    ...(evidenceReference !== undefined ? { evidenceReference } : {}),
  };
}

interface RestrictionRow {
  restriction_id: string;
  claim_id: string;
  user_id: string;
  scope: ClaimRestrictionScope;
  status: ClaimRestrictionRecord['status'];
  reason: string;
  applied_by: string;
  applied_at: unknown;
  released_by: string | null;
  released_at: unknown;
  release_reason: string | null;
}

function toRestriction(row: RestrictionRow): ClaimRestrictionRecord {
  const releasedBy = readOptionalText(row.released_by);
  const releasedAt = readOptionalText(row.released_at);
  const releaseReason = readOptionalText(row.release_reason);
  return {
    restrictionId: row.restriction_id,
    claimId: row.claim_id,
    userId: row.user_id,
    scope: row.scope,
    status: row.status,
    reason: row.reason,
    appliedBy: row.applied_by,
    appliedAt: readText(row.applied_at),
    ...(releasedBy !== undefined ? { releasedBy } : {}),
    ...(releasedAt !== undefined ? { releasedAt } : {}),
    ...(releaseReason !== undefined ? { releaseReason } : {}),
  };
}

export function createSqlClaimStore(db: SqlQueryExecutor): ClaimStore {
  const findClaim = async (claimId: string, forUpdate = false): Promise<ClaimRecord | null> => {
    const result = await db.query<ClaimRow>(
      `SELECT * FROM claims WHERE claim_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [claimId],
    );
    return result.rows[0] ? toClaim(result.rows[0]) : null;
  };

  const findEvidenceRequest = async (evidenceRequestId: string, forUpdate = false): Promise<ClaimEvidenceRequestRecord | null> => {
    const result = await db.query<EvidenceRow>(
      `SELECT * FROM claim_evidence_requests WHERE evidence_request_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [evidenceRequestId],
    );
    return result.rows[0] ? toEvidenceRequest(result.rows[0]) : null;
  };

  const activeRestriction = async (
    claimId: string,
    userId: string,
    scope: ClaimRestrictionScope,
  ): Promise<ClaimRestrictionRecord | null> => {
    const result = await db.query<RestrictionRow>(
      `SELECT * FROM claim_restrictions
        WHERE claim_id = $1 AND user_id = $2 AND scope = $3 AND status = 'ACTIVE'
        LIMIT 1`,
      [claimId, userId, scope],
    );
    return result.rows[0] ? toRestriction(result.rows[0]) : null;
  };

  return {
    async createClaim(record) {
      const result = await db.query<ClaimRow>(
        `INSERT INTO claims (
           claim_id, contract_id, payment_id, salary_confirmation_id, claimant_id,
           respondent_id, type, reason, status, created_at, due_at, resolved_at,
           resolved_by, resolution, evidence_reference, metadata, idempotency_key, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
           $16::jsonb, $17, $10
         ) RETURNING *`,
        [
          record.claimId,
          record.contractId,
          record.paymentId ?? null,
          record.salaryConfirmationId ?? null,
          record.claimantId,
          record.respondentId,
          record.type,
          record.reason,
          record.status,
          record.createdAt,
          record.dueAt ?? null,
          record.resolvedAt ?? null,
          record.resolvedBy ?? null,
          record.resolution ?? null,
          record.evidenceReference ?? null,
          JSON.stringify(record.metadata ?? {}),
          record.idempotencyKey,
        ],
      );
      if (!result.rows[0]) throw new Error(`Claim ${record.claimId} non retourné par PostgreSQL.`);
      return toClaim(result.rows[0]);
    },

    findClaim: claimId => findClaim(claimId),
    findClaimForUpdate: claimId => findClaim(claimId, true),

    async findActiveClaimForTarget(contractId, paymentId) {
      const result = await db.query<ClaimRow>(
        `SELECT * FROM claims
          WHERE contract_id = $1
            AND payment_id IS NOT DISTINCT FROM $2
            AND status NOT IN ('RESOLVED', 'REJECTED', 'CLOSED')
          ORDER BY created_at ASC, claim_id ASC
          LIMIT 1
          FOR UPDATE`,
        [contractId, paymentId ?? null],
      );
      return result.rows[0] ? toClaim(result.rows[0]) : null;
    },

    async listForParty(actorId, limit, afterId) {
      const bounded = boundedLimit(limit);
      const result = afterId
        ? await db.query<ClaimRow>(
            `SELECT current_claim.* FROM claims AS current_claim
              JOIN claims AS cursor_claim ON cursor_claim.claim_id = $2
              WHERE (current_claim.claimant_id = $1 OR current_claim.respondent_id = $1)
                AND (current_claim.created_at < cursor_claim.created_at
                  OR (current_claim.created_at = cursor_claim.created_at
                    AND current_claim.claim_id > cursor_claim.claim_id))
              ORDER BY current_claim.created_at DESC, current_claim.claim_id ASC
              LIMIT $3`,
            [actorId, afterId, bounded],
          )
        : await db.query<ClaimRow>(
            `SELECT * FROM claims
              WHERE claimant_id = $1 OR respondent_id = $1
              ORDER BY created_at DESC, claim_id ASC
              LIMIT $2`,
            [actorId, bounded],
          );
      return result.rows.map(toClaim);
    },

    async listAll(limit, afterId) {
      const bounded = boundedLimit(limit);
      const result = afterId
        ? await db.query<ClaimRow>(
            `SELECT current_claim.* FROM claims AS current_claim
              JOIN claims AS cursor_claim ON cursor_claim.claim_id = $1
              WHERE current_claim.created_at < cursor_claim.created_at
                OR (current_claim.created_at = cursor_claim.created_at
                  AND current_claim.claim_id > cursor_claim.claim_id)
              ORDER BY current_claim.created_at DESC, current_claim.claim_id ASC
              LIMIT $2`,
            [afterId, bounded],
          )
        : await db.query<ClaimRow>(
            'SELECT * FROM claims ORDER BY created_at DESC, claim_id ASC LIMIT $1',
            [bounded],
          );
      return result.rows.map(toClaim);
    },

    async transitionClaim(input) {
      const expected = [...new Set(input.expected)];
      if (expected.length === 0) return null;
      const result = await db.query<ClaimRow>(
        `UPDATE claims
            SET status = $2,
                updated_at = $3,
                due_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE due_at END,
                evidence_reference = CASE WHEN $6::boolean THEN $7::text ELSE evidence_reference END,
                resolved_at = CASE WHEN $8::boolean THEN $9::timestamptz ELSE resolved_at END,
                resolved_by = CASE WHEN $10::boolean THEN $11::text ELSE resolved_by END,
                resolution = CASE WHEN $12::boolean THEN $13::text ELSE resolution END,
                metadata = CASE WHEN $14::boolean
                  THEN metadata || jsonb_build_object('replacementId', $15::text)
                  ELSE metadata END
          WHERE claim_id = $1 AND status IN (${placeholders(16, expected.length)})
          RETURNING *`,
        [
          input.claimId,
          input.status,
          input.at,
          input.dueAt !== undefined,
          input.dueAt ?? null,
          input.evidenceReference !== undefined,
          input.evidenceReference ?? null,
          input.resolvedAt !== undefined,
          input.resolvedAt ?? null,
          input.resolvedBy !== undefined,
          input.resolvedBy ?? null,
          input.resolution !== undefined,
          input.resolution ?? null,
          input.replacementId !== undefined,
          input.replacementId ?? null,
          ...expected,
        ],
      );
      return result.rows[0] ? toClaim(result.rows[0]) : null;
    },

    async createEvidenceRequest(record) {
      const result = await db.query<EvidenceRow>(
        `INSERT INTO claim_evidence_requests (
           evidence_request_id, claim_id, requested_from, requested_by,
           requested_type, due_at, status, created_at, submitted_at,
           evidence_reference, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8)
         RETURNING *`,
        [
          record.evidenceRequestId,
          record.claimId,
          record.requestedFrom,
          record.requestedBy,
          record.requestedType,
          record.dueAt ?? null,
          record.status,
          record.createdAt,
          record.submittedAt ?? null,
          record.evidenceReference ?? null,
        ],
      );
      if (!result.rows[0]) throw new Error(`Evidence Request ${record.evidenceRequestId} non retournée par PostgreSQL.`);
      return toEvidenceRequest(result.rows[0]);
    },

    findEvidenceRequest: evidenceRequestId => findEvidenceRequest(evidenceRequestId),
    findEvidenceRequestForUpdate: evidenceRequestId => findEvidenceRequest(evidenceRequestId, true),

    async findPendingEvidenceRequestForClaim(claimId) {
      const result = await db.query<EvidenceRow>(
        `SELECT * FROM claim_evidence_requests
          WHERE claim_id = $1 AND status = 'PENDING'
          ORDER BY created_at DESC, evidence_request_id DESC
          LIMIT 1 FOR UPDATE`,
        [claimId],
      );
      return result.rows[0] ? toEvidenceRequest(result.rows[0]) : null;
    },

    async listEvidenceRequests(claimId) {
      const result = await db.query<EvidenceRow>(
        `SELECT * FROM claim_evidence_requests
          WHERE claim_id = $1
          ORDER BY created_at ASC, evidence_request_id ASC`,
        [claimId],
      );
      return result.rows.map(toEvidenceRequest);
    },

    async transitionEvidenceRequest(input) {
      const expected = [...new Set(input.expected)];
      if (expected.length === 0) return null;
      const result = await db.query<EvidenceRow>(
        `UPDATE claim_evidence_requests
            SET status = $2,
                updated_at = $3,
                submitted_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE submitted_at END,
                evidence_reference = CASE WHEN $6::boolean THEN $7::text ELSE evidence_reference END
          WHERE evidence_request_id = $1 AND status IN (${placeholders(8, expected.length)})
          RETURNING *`,
        [
          input.evidenceRequestId,
          input.status,
          input.at,
          input.submittedAt !== undefined,
          input.submittedAt ?? null,
          input.evidenceReference !== undefined,
          input.evidenceReference ?? null,
          ...expected,
        ],
      );
      return result.rows[0] ? toEvidenceRequest(result.rows[0]) : null;
    },

    async createRestriction(record) {
      let result: SqlQueryResult<RestrictionRow>;
      try {
        result = await db.query<RestrictionRow>(
          `INSERT INTO claim_restrictions (
             restriction_id, claim_id, user_id, scope, status, reason,
             applied_by, applied_at, released_by, released_at, release_reason
           ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, NULL, NULL, NULL)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [
            record.restrictionId,
            record.claimId,
            record.userId,
            record.scope,
            record.reason,
            record.appliedBy,
            record.appliedAt,
          ],
        );
      } catch (error) {
        if (postgresErrorCode(error) !== UNIQUE_VIOLATION) throw error;
        result = { rows: [], rowCount: 0 };
      }
      if (result.rows[0]) return toRestriction(result.rows[0]);
      return null;
    },

    async findRestriction(restrictionId) {
      const result = await db.query<RestrictionRow>(
        'SELECT * FROM claim_restrictions WHERE restriction_id = $1',
        [restrictionId],
      );
      return result.rows[0] ? toRestriction(result.rows[0]) : null;
    },

    findActiveRestriction: activeRestriction,

    async listRestrictions(claimId) {
      const result = await db.query<RestrictionRow>(
        `SELECT * FROM claim_restrictions
          WHERE claim_id = $1
          ORDER BY applied_at ASC, restriction_id ASC`,
        [claimId],
      );
      return result.rows.map(toRestriction);
    },

    async releaseRestriction(input) {
      const result = await db.query<RestrictionRow>(
        `UPDATE claim_restrictions
            SET status = 'RELEASED', released_by = $2, released_at = $3, release_reason = $4
          WHERE restriction_id = $1 AND status = 'ACTIVE'
          RETURNING *`,
        [input.restrictionId, input.actorId, input.at, input.reason],
      );
      return result.rows[0] ? toRestriction(result.rows[0]) : null;
    },

    async releaseActiveRestrictionsForClaim(input) {
      const result = await db.query<RestrictionRow>(
        `UPDATE claim_restrictions
            SET status = 'RELEASED', released_by = $2, released_at = $3, release_reason = $4
          WHERE claim_id = $1 AND status = 'ACTIVE'
          RETURNING *`,
        [input.claimId, input.actorId, input.at, input.reason],
      );
      return result.rows.map(toRestriction);
    },

    async hasActiveRestriction(contractId, userId, scope) {
      const result = await db.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM claim_restrictions restriction
             JOIN claims claim ON claim.claim_id = restriction.claim_id
            WHERE claim.contract_id = $1
              AND restriction.user_id = $2
              AND restriction.scope = $3
              AND restriction.status = 'ACTIVE'
              AND claim.status NOT IN ('RESOLVED', 'REJECTED', 'CLOSED')
         ) AS exists`,
        [contractId, userId, scope],
      );
      return result.rows[0]?.exists === true;
    },
  };
}
