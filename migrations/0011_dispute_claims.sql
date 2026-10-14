-- LE LABEUR — P0-DISPUTE-1 — premier cycle métier de litige.
--
-- Additive uniquement : les Claims s'attachent aux contrats, paiements et
-- confirmations salariales existants. L'Outbox, les jobs, les deadlines,
-- l'idempotence durable et le ledger d'audit restent ceux de 0006/0007.
-- Aucun mouvement de fonds, remplacement, KYC, coffre documentaire ou canal
-- de notification n'est créé ici.

BEGIN;

CREATE TABLE claims (
  claim_id                TEXT PRIMARY KEY,
  contract_id             TEXT NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
  payment_id              TEXT REFERENCES payments (id) ON DELETE RESTRICT,
  salary_confirmation_id  TEXT REFERENCES salary_confirmations (payment_id) ON DELETE SET NULL,
  claimant_id             TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  respondent_id           TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  type                    TEXT NOT NULL
                          CHECK (type IN ('SALARY_NOT_RECEIVED', 'PAYMENT_DISPUTE',
                                          'CONTRACT_INCIDENT', 'OTHER_REVIEW_REQUIRED')),
  reason                  TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  status                  TEXT NOT NULL
                          CHECK (status IN ('OPEN', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW',
                                            'ADMIN_REVIEW', 'RESOLVED', 'REJECTED', 'CLOSED')),
  created_at              TIMESTAMPTZ NOT NULL,
  due_at                  TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resolved_by             TEXT,
  resolution              TEXT,
  evidence_reference       TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(metadata) = 'object'),
  idempotency_key         TEXT NOT NULL,
  updated_at              TIMESTAMPTZ NOT NULL,
  CONSTRAINT claims_distinct_parties CHECK (claimant_id <> respondent_id),
  CONSTRAINT claims_payment_scope CHECK (
    (type IN ('SALARY_NOT_RECEIVED', 'PAYMENT_DISPUTE') AND payment_id IS NOT NULL)
    OR (type IN ('CONTRACT_INCIDENT', 'OTHER_REVIEW_REQUIRED') AND payment_id IS NULL)
  ),
  CONSTRAINT claims_salary_confirmation_requires_payment
    CHECK (salary_confirmation_id IS NULL OR payment_id IS NOT NULL),
  CONSTRAINT claims_terminal_decision_complete CHECK (
    (status IN ('RESOLVED', 'REJECTED', 'CLOSED')
      AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL)
    OR (status NOT IN ('RESOLVED', 'REJECTED', 'CLOSED')
      AND resolved_at IS NULL AND resolved_by IS NULL AND resolution IS NULL)
  )
);

-- Un seul dossier actif par contrat ou paiement ciblé, indépendamment du
-- déclarant : la contrainte PostgreSQL tranche aussi les créations concurrentes.
CREATE UNIQUE INDEX claims_one_open_per_target_idx
  ON claims (contract_id, COALESCE(payment_id, ''))
  WHERE status NOT IN ('RESOLVED', 'REJECTED', 'CLOSED');

CREATE INDEX claims_claimant_created_idx ON claims (claimant_id, created_at DESC, claim_id ASC);
CREATE INDEX claims_respondent_created_idx ON claims (respondent_id, created_at DESC, claim_id ASC);
CREATE INDEX claims_status_created_idx ON claims (status, created_at DESC, claim_id ASC);

CREATE TABLE claim_evidence_requests (
  evidence_request_id  TEXT PRIMARY KEY,
  claim_id             TEXT NOT NULL REFERENCES claims (claim_id) ON DELETE RESTRICT,
  requested_from       TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  requested_by         TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  requested_type       TEXT NOT NULL
                       CHECK (requested_type IN ('PAYMENT_PROOF', 'CONTRACT_EVIDENCE', 'SUPPORTING_EVIDENCE')),
  due_at               TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING', 'SUBMITTED', 'CANCELLED', 'EXPIRED')),
  created_at           TIMESTAMPTZ NOT NULL,
  submitted_at         TIMESTAMPTZ,
  evidence_reference   TEXT,
  updated_at           TIMESTAMPTZ NOT NULL,
  CONSTRAINT claim_evidence_submission_complete CHECK (
    (status = 'SUBMITTED' AND submitted_at IS NOT NULL AND evidence_reference IS NOT NULL)
    OR (status <> 'SUBMITTED' AND submitted_at IS NULL AND evidence_reference IS NULL)
  )
);

CREATE UNIQUE INDEX claim_one_pending_evidence_request_idx
  ON claim_evidence_requests (claim_id)
  WHERE status = 'PENDING';
CREATE INDEX claim_evidence_request_due_idx
  ON claim_evidence_requests (due_at, evidence_request_id)
  WHERE status = 'PENDING' AND due_at IS NOT NULL;
CREATE INDEX claim_evidence_request_history_idx
  ON claim_evidence_requests (claim_id, created_at, evidence_request_id);

CREATE TABLE claim_restrictions (
  restriction_id  TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL REFERENCES claims (claim_id) ON DELETE RESTRICT,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  scope           TEXT NOT NULL CHECK (scope IN ('CONTRACT_TERMINATE')),
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED')),
  reason          TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  applied_by      TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  applied_at      TIMESTAMPTZ NOT NULL,
  released_by     TEXT REFERENCES users (id) ON DELETE RESTRICT,
  released_at     TIMESTAMPTZ,
  release_reason  TEXT,
  CONSTRAINT claim_restriction_release_complete CHECK (
    (status = 'ACTIVE' AND released_by IS NULL AND released_at IS NULL AND release_reason IS NULL)
    OR (status = 'RELEASED' AND released_by IS NOT NULL AND released_at IS NOT NULL
        AND release_reason IS NOT NULL AND length(btrim(release_reason)) BETWEEN 3 AND 1000)
  )
);

CREATE UNIQUE INDEX claim_active_restriction_unique_idx
  ON claim_restrictions (claim_id, user_id, scope)
  WHERE status = 'ACTIVE';
CREATE INDEX claim_restrictions_user_active_idx
  ON claim_restrictions (user_id, claim_id)
  WHERE status = 'ACTIVE';
CREATE INDEX claim_restrictions_claim_idx
  ON claim_restrictions (claim_id, applied_at, restriction_id);

-- `contracts.incident_id` était volontairement sans FK tant que le domaine
-- incident n'existait pas. Il conserve cette compatibilité et pointe vers le
-- Claim seulement pour les nouveaux incidents contractuels de cette tranche.
CREATE INDEX IF NOT EXISTS contracts_incident_id_idx
  ON contracts (incident_id)
  WHERE incident_id IS NOT NULL;

COMMIT;
