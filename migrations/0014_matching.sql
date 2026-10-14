-- LE LABEUR — P0-MATCHING — qualification versionnée et classement explicable.
-- Aucun candidat n'est affecté, accepté, rejeté ni transféré par ces tables.
-- Aucun paiement, prix, notification, donnée sensible ou calendrier n'est ajouté.

BEGIN;

CREATE TABLE IF NOT EXISTS candidate_matching_profiles (
  candidate_id       TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  skills             JSONB NOT NULL DEFAULT '[]'::jsonb,
  department_id      TEXT,
  municipality_id    TEXT,
  arrondissement_id  TEXT,
  locality_id        TEXT,
  availability       TEXT NOT NULL DEFAULT 'UNDECLARED'
                     CHECK (availability IN ('AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'UNDECLARED')),
  created_at         TIMESTAMPTZ NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL,
  CONSTRAINT candidate_matching_profiles_skills_array
    CHECK (jsonb_typeof(skills) = 'array')
);
CREATE INDEX IF NOT EXISTS candidate_matching_profiles_availability_idx
  ON candidate_matching_profiles (availability, candidate_id);
CREATE INDEX IF NOT EXISTS candidate_matching_profiles_department_idx
  ON candidate_matching_profiles (department_id, candidate_id)
  WHERE department_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mission_qualifications (
  qualification_id  TEXT PRIMARY KEY,
  offer_id          TEXT NOT NULL UNIQUE REFERENCES offers (id) ON DELETE RESTRICT,
  employer_id       TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  answers           JSONB NOT NULL,
  initial_decision  TEXT NOT NULL
                    CHECK (initial_decision IN ('ELIGIBLE_FOR_INDEPENDENT', 'HUMAN_REVIEW_REQUIRED', 'BLOCKED')),
  decision          TEXT NOT NULL
                    CHECK (decision IN ('ELIGIBLE_FOR_INDEPENDENT', 'HUMAN_REVIEW_REQUIRED', 'BLOCKED')),
  reasons           JSONB NOT NULL,
  rule_version      TEXT NOT NULL,
  evaluated_at      TIMESTAMPTZ NOT NULL,
  reviewed_by       TEXT REFERENCES users (id) ON DELETE RESTRICT,
  reviewed_at       TIMESTAMPTZ,
  review_reason     TEXT,
  CONSTRAINT mission_qualifications_answers_object CHECK (jsonb_typeof(answers) = 'object'),
  CONSTRAINT mission_qualifications_reasons_array CHECK (jsonb_typeof(reasons) = 'array'),
  CONSTRAINT mission_qualifications_review_consistent CHECK (
    (reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL AND decision = initial_decision)
    OR
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL
      AND initial_decision = 'HUMAN_REVIEW_REQUIRED'
      AND decision IN ('ELIGIBLE_FOR_INDEPENDENT', 'BLOCKED'))
  )
);
CREATE INDEX IF NOT EXISTS mission_qualifications_review_queue_idx
  ON mission_qualifications (qualification_id)
  WHERE decision = 'HUMAN_REVIEW_REQUIRED';
CREATE INDEX IF NOT EXISTS mission_qualifications_employer_idx
  ON mission_qualifications (employer_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS matching_runs (
  run_id           TEXT PRIMARY KEY,
  offer_id         TEXT NOT NULL REFERENCES offers (id) ON DELETE RESTRICT,
  qualification_id TEXT NOT NULL REFERENCES mission_qualifications (qualification_id) ON DELETE RESTRICT,
  employer_id      TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  sort_by          TEXT NOT NULL CHECK (sort_by IN ('score', 'skills', 'location', 'availability')),
  sort_direction   TEXT NOT NULL CHECK (sort_direction IN ('ASC', 'DESC')),
  rules_version    TEXT NOT NULL,
  criteria         JSONB NOT NULL,
  results          JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  CONSTRAINT matching_runs_criteria_object CHECK (jsonb_typeof(criteria) = 'object'),
  CONSTRAINT matching_runs_results_array CHECK (jsonb_typeof(results) = 'array')
);
CREATE INDEX IF NOT EXISTS matching_runs_offer_created_idx
  ON matching_runs (offer_id, created_at DESC, run_id);
CREATE INDEX IF NOT EXISTS matching_runs_employer_created_idx
  ON matching_runs (employer_id, created_at DESC, run_id);

COMMIT;
