-- LE LABEUR — intégration du runtime Automation local.
--
-- 0006 établit les tables métier transversales. Cette migration complète leur
-- capacité d'exécution locale (claims avec bail, file durable, déduplication)
-- sans modifier ni rejouer les migrations déjà livrées.

BEGIN;

-- Outbox : clé stable + bail récupérable pour un dispatcher crashé.
ALTER TABLE automation_outbox
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS processing_owner TEXT,
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;
UPDATE automation_outbox SET dedupe_key = id WHERE dedupe_key IS NULL;
ALTER TABLE automation_outbox ALTER COLUMN dedupe_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS automation_outbox_dedupe_key_unique_idx
  ON automation_outbox (dedupe_key);
CREATE INDEX IF NOT EXISTS automation_outbox_claim_lease_idx
  ON automation_outbox (claim_expires_at, id)
  WHERE status = 'PROCESSING';

-- Queue locale durable. Le message_id est l'identifiant d'événement outbox :
-- un rejeu du dispatcher ne peut pas créer un second effet en file.
CREATE TABLE IF NOT EXISTS automation_queue (
  message_id TEXT PRIMARY KEY,
  body JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'ACKNOWLEDGED', 'RETRYABLE', 'DEAD_LETTER')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_owner TEXT,
  claim_expires_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS automation_queue_due_idx
  ON automation_queue (available_at, created_at, message_id)
  WHERE status IN ('PENDING', 'RETRYABLE');
CREATE INDEX IF NOT EXISTS automation_queue_claim_lease_idx
  ON automation_queue (claim_expires_at, message_id)
  WHERE status = 'PROCESSING';

-- Jobs : claims récupérables après crash et unicité de leur clé d'idempotence.
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS processing_owner TEXT;
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ;
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;
UPDATE automation_jobs SET available_at = due_at WHERE available_at IS NULL;
ALTER TABLE automation_jobs ALTER COLUMN available_at SET DEFAULT now();
ALTER TABLE automation_jobs ALTER COLUMN available_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS automation_jobs_available_due_idx
  ON automation_jobs (available_at, due_at, job_id)
  WHERE status IN ('PENDING', 'RETRYABLE');
CREATE UNIQUE INDEX IF NOT EXISTS automation_jobs_idempotency_key_unique_idx
  ON automation_jobs (idempotency_key);
CREATE INDEX IF NOT EXISTS automation_jobs_claim_lease_idx
  ON automation_jobs (claim_expires_at, job_id)
  WHERE status = 'RUNNING';

-- Une réservation PROCESSING expirée peut être reprise après la mort du worker.
ALTER TABLE automation_idempotency ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE automation_idempotency ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
UPDATE automation_idempotency
   SET lease_expires_at = created_at + INTERVAL '15 minutes'
 WHERE status = 'PROCESSING' AND lease_expires_at IS NULL;
CREATE INDEX IF NOT EXISTS automation_idempotency_lease_idx
  ON automation_idempotency (lease_expires_at)
  WHERE status = 'PROCESSING';

-- L'audit de l'exécution est l'effet persistant de démonstration. La paire
-- (event_id, action) empêche un handler rejoué d'insérer un second effet.
CREATE UNIQUE INDEX IF NOT EXISTS automation_audit_event_action_unique_idx
  ON automation_audit_ledger (event_id, action);

COMMIT;
