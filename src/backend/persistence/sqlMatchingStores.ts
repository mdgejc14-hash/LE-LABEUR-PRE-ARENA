/** PostgreSQL adapters for P0-MATCHING qualification, profiles and run snapshots. */

import type { SqlQueryExecutor, SqlQueryResult } from '../services/database';
import type {
  CandidateDeclaredAvailability,
  CandidateMatchingCandidate,
  CandidateMatchingProfileRecord,
  MatchingCriteriaSnapshot,
  MatchingResultSnapshot,
  MatchingRunRecord,
  MatchingSortBy,
  MatchingSortDirection,
  MissionQualificationAnswers,
  MissionQualificationRecord,
  MissionQualificationStore,
  CandidateMatchingProfileStore,
  MatchingRunStore,
  MatchingStores,
  QualificationDecision,
  QualificationReason,
} from '../matching/records';

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function readJson<Value>(value: unknown, label: string): Value {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Value;
    } catch {
      throw new Error(`Donnée JSONB illisible dans ${label}.`);
    }
  }
  if (value === null || value === undefined) throw new Error(`Donnée JSONB absente dans ${label}.`);
  return value as Value;
}

function bounded(limit: number, max = 201): number {
  if (!Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(max, Math.trunc(limit)));
}

interface QualificationRow {
  qualification_id: string;
  offer_id: string;
  employer_id: string;
  answers: unknown;
  initial_decision: QualificationDecision;
  decision: QualificationDecision;
  reasons: unknown;
  rule_version: string;
  evaluated_at: unknown;
  reviewed_by: string | null;
  reviewed_at: unknown;
  review_reason: string | null;
}

function toQualification(row: QualificationRow): MissionQualificationRecord {
  const reviewedBy = optionalString(row.reviewed_by);
  const reviewedAt = row.reviewed_at === null || row.reviewed_at === undefined ? undefined : iso(row.reviewed_at);
  const reviewReason = optionalString(row.review_reason);
  return {
    qualificationId: row.qualification_id,
    offerId: row.offer_id,
    employerId: row.employer_id,
    answers: readJson<MissionQualificationAnswers>(row.answers, 'mission_qualifications.answers'),
    initialDecision: row.initial_decision,
    decision: row.decision,
    reasons: readJson<QualificationReason[]>(row.reasons, 'mission_qualifications.reasons'),
    ruleVersion: row.rule_version,
    evaluatedAt: iso(row.evaluated_at),
    ...(reviewedBy ? { reviewedBy } : {}),
    ...(reviewedAt ? { reviewedAt } : {}),
    ...(reviewReason ? { reviewReason } : {}),
  };
}

interface CandidateProfileRow {
  candidate_id: string;
  skills: unknown;
  department_id: string | null;
  municipality_id: string | null;
  arrondissement_id: string | null;
  locality_id: string | null;
  availability: CandidateDeclaredAvailability;
  created_at: unknown;
  updated_at: unknown;
  display_name?: string;
}

function toCandidateProfile(row: CandidateProfileRow): CandidateMatchingProfileRecord {
  return {
    candidateId: row.candidate_id,
    skills: readJson<string[]>(row.skills, 'candidate_matching_profiles.skills'),
    ...(row.department_id ? { departmentId: row.department_id } : {}),
    ...(row.municipality_id ? { municipalityId: row.municipality_id } : {}),
    ...(row.arrondissement_id ? { arrondissementId: row.arrondissement_id } : {}),
    ...(row.locality_id ? { localityId: row.locality_id } : {}),
    availability: row.availability,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

interface MatchingRunRow {
  run_id: string;
  offer_id: string;
  qualification_id: string;
  employer_id: string;
  sort_by: MatchingSortBy;
  sort_direction: MatchingSortDirection;
  rules_version: string;
  criteria: unknown;
  results: unknown;
  created_at: unknown;
}

function toMatchingRun(row: MatchingRunRow): MatchingRunRecord {
  return {
    runId: row.run_id,
    offerId: row.offer_id,
    qualificationId: row.qualification_id,
    employerId: row.employer_id,
    sortBy: row.sort_by,
    sortDirection: row.sort_direction,
    rulesVersion: row.rules_version,
    criteria: readJson<MatchingCriteriaSnapshot>(row.criteria, 'matching_runs.criteria'),
    results: readJson<MatchingResultSnapshot[]>(row.results, 'matching_runs.results'),
    createdAt: iso(row.created_at),
  };
}

export function createSqlMissionQualificationStore(db: SqlQueryExecutor): MissionQualificationStore {
  return {
    async create(record) {
      const result = await db.query<QualificationRow>(
        `INSERT INTO mission_qualifications (
           qualification_id, offer_id, employer_id, answers, initial_decision,
           decision, reasons, rule_version, evaluated_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9)
         RETURNING *`,
        [
          record.qualificationId,
          record.offerId,
          record.employerId,
          JSON.stringify(record.answers),
          record.initialDecision,
          record.decision,
          JSON.stringify(record.reasons),
          record.ruleVersion,
          record.evaluatedAt,
        ],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné la qualification créée.');
      return toQualification(result.rows[0]);
    },

    async findByOfferId(offerId) {
      const result = await db.query<QualificationRow>(
        'SELECT * FROM mission_qualifications WHERE offer_id = $1',
        [offerId],
      );
      return result.rows[0] ? toQualification(result.rows[0]) : null;
    },

    async findByQualificationId(qualificationId) {
      const result = await db.query<QualificationRow>(
        'SELECT * FROM mission_qualifications WHERE qualification_id = $1',
        [qualificationId],
      );
      return result.rows[0] ? toQualification(result.rows[0]) : null;
    },

    async listPendingReview(limit, afterId = null) {
      const result = await db.query<QualificationRow>(
        `SELECT * FROM mission_qualifications
          WHERE decision = 'HUMAN_REVIEW_REQUIRED'
            AND ($2::text IS NULL OR qualification_id > $2)
          ORDER BY qualification_id ASC
          LIMIT $1`,
        [bounded(limit, 101), afterId],
      );
      return result.rows.map(toQualification);
    },

    async resolveHumanReview(input) {
      const result = await db.query<QualificationRow>(
        `UPDATE mission_qualifications
            SET decision = $2, reviewed_by = $3, reviewed_at = $4, review_reason = $5
          WHERE qualification_id = $1
            AND decision = $6
            AND reviewed_at IS NULL
          RETURNING *`,
        [
          input.qualificationId,
          input.decision,
          input.reviewedBy,
          input.reviewedAt,
          input.reviewReason,
          input.expectedDecision,
        ],
      );
      return result.rows[0] ? toQualification(result.rows[0]) : null;
    },
  };
}

export function createSqlCandidateMatchingProfileStore(db: SqlQueryExecutor): CandidateMatchingProfileStore {
  return {
    async upsert(record) {
      const result = await db.query<CandidateProfileRow>(
        `INSERT INTO candidate_matching_profiles (
           candidate_id, skills, department_id, municipality_id, arrondissement_id,
           locality_id, availability, created_at, updated_at
         ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (candidate_id) DO UPDATE SET
           skills = EXCLUDED.skills,
           department_id = EXCLUDED.department_id,
           municipality_id = EXCLUDED.municipality_id,
           arrondissement_id = EXCLUDED.arrondissement_id,
           locality_id = EXCLUDED.locality_id,
           availability = EXCLUDED.availability,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          record.candidateId,
          JSON.stringify(record.skills),
          record.departmentId ?? null,
          record.municipalityId ?? null,
          record.arrondissementId ?? null,
          record.localityId ?? null,
          record.availability,
          record.createdAt,
          record.updatedAt,
        ],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné le profil de matching.');
      return toCandidateProfile(result.rows[0]);
    },

    async findByCandidateId(candidateId) {
      const result = await db.query<CandidateProfileRow>(
        'SELECT * FROM candidate_matching_profiles WHERE candidate_id = $1',
        [candidateId],
      );
      return result.rows[0] ? toCandidateProfile(result.rows[0]) : null;
    },

    async listActiveCandidates(limit) {
      const result: SqlQueryResult<CandidateProfileRow> = await db.query<CandidateProfileRow>(
        `SELECT p.*, u.display_name
           FROM candidate_matching_profiles p
           JOIN users u ON u.id = p.candidate_id
          WHERE u.role = 'CANDIDATE' AND u.status = 'ACTIVE'
          ORDER BY p.candidate_id ASC
          LIMIT $1`,
        [bounded(limit)],
      );
      return result.rows.map(row => ({
        ...toCandidateProfile(row),
        displayName: row.display_name ?? 'Prestataire',
      }));
    },
  };
}

export function createSqlMatchingRunStore(db: SqlQueryExecutor): MatchingRunStore {
  return {
    async create(record) {
      const result = await db.query<MatchingRunRow>(
        `INSERT INTO matching_runs (
           run_id, offer_id, qualification_id, employer_id, sort_by, sort_direction,
           rules_version, criteria, results, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
         RETURNING *`,
        [
          record.runId,
          record.offerId,
          record.qualificationId,
          record.employerId,
          record.sortBy,
          record.sortDirection,
          record.rulesVersion,
          JSON.stringify(record.criteria),
          JSON.stringify(record.results),
          record.createdAt,
        ],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné le résultat de matching.');
      return toMatchingRun(result.rows[0]);
    },

    async findById(runId) {
      const result = await db.query<MatchingRunRow>(
        'SELECT * FROM matching_runs WHERE run_id = $1',
        [runId],
      );
      return result.rows[0] ? toMatchingRun(result.rows[0]) : null;
    },
  };
}

export function createSqlMatchingStores(db: SqlQueryExecutor): MatchingStores {
  return {
    qualifications: createSqlMissionQualificationStore(db),
    candidateProfiles: createSqlCandidateMatchingProfileStore(db),
    runs: createSqlMatchingRunStore(db),
  };
}
