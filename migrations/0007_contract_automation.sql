-- LE LABEUR — CONTRACT_ACTIVE → salary/commission schedules, deadlines and reminders.
--
-- This migration extends the existing P0-AUTO-1 tables; it does not introduce
-- another queue, scheduler or idempotency store. Contract payment details stay
-- in `contracts.payment_schedule` (the existing domain field), generic work
-- stays in `automation_jobs`, deadlines implement the existing Deadline model,
-- and contract activation is published through `automation_outbox`.
--
-- Reminder policy source: the existing J+3 policy in
-- `src/backend/services/scheduler.ts` (three complete days after the date-only
-- due date, interpreted at 00:00 UTC). No new business duration is introduced.

BEGIN;

-- Durable outbox deduplication and claim leases. Backfill existing events with
-- a stable per-row key before enforcing NOT NULL / uniqueness.
ALTER TABLE automation_outbox ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE automation_outbox ADD COLUMN IF NOT EXISTS claimed_by TEXT;
UPDATE automation_outbox SET dedupe_key = 'legacy:' || id WHERE dedupe_key IS NULL;
ALTER TABLE automation_outbox ALTER COLUMN dedupe_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS automation_outbox_dedupe_key_idx
  ON automation_outbox (dedupe_key);
CREATE INDEX IF NOT EXISTS automation_outbox_claim_idx
  ON automation_outbox (status, available_at, id)
  WHERE status IN ('PENDING', 'RETRYABLE', 'PROCESSING');

-- The existing ScheduledJob table now stores its typed payload and retry/claim
-- metadata. `due_at` remains the business deadline; `available_at` is only the
-- worker retry/lease time.
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'AutomationEngine';
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ;
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS claimed_by TEXT;
UPDATE automation_jobs SET available_at = due_at WHERE available_at IS NULL;
ALTER TABLE automation_jobs ALTER COLUMN available_at SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS automation_jobs_idempotency_key_idx
  ON automation_jobs (idempotency_key);
CREATE INDEX IF NOT EXISTS automation_jobs_claim_idx
  ON automation_jobs (available_at, due_at, job_id)
  WHERE status IN ('PENDING', 'RETRYABLE', 'RUNNING');

-- Recoverable persistent idempotency reservations for AutomationEngine.
ALTER TABLE automation_idempotency ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
UPDATE automation_idempotency
   SET lease_expires_at = created_at + INTERVAL '5 minutes'
 WHERE status = 'PROCESSING' AND lease_expires_at IS NULL;

-- Extend the existing automation audit ledger with explicit job/result/error
-- fields, retaining event_id, actor_id, entity_id, action, timestamp, source.
ALTER TABLE automation_audit_ledger ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE automation_audit_ledger ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE automation_audit_ledger ADD COLUMN IF NOT EXISTS error TEXT;

-- Durable implementation of the pre-existing Deadline abstraction. Schedule
-- jobs remain in automation_jobs; each deadline points to its due job and uses
-- the same stable idempotency scheme.
CREATE TABLE IF NOT EXISTS automation_deadlines (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'MET', 'OVERDUE', 'ESCALATED', 'CANCELLED')),
  sla TEXT,
  grace_period_ms BIGINT CHECK (grace_period_ms IS NULL OR grace_period_ms >= 0),
  escalation TEXT,
  job_id TEXT REFERENCES automation_jobs (job_id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_deadlines_due_idx
  ON automation_deadlines (due_at, id)
  WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS automation_deadlines_contract_idx
  ON automation_deadlines (aggregate_type, aggregate_id, due_at);

COMMIT;
