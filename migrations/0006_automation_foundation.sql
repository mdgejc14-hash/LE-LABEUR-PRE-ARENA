-- P0-AUTO-1 — durable, provider-neutral automation foundation.
BEGIN;
CREATE TABLE IF NOT EXISTS automation_outbox (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
  actor_id TEXT, payload JSONB NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  correlation_id TEXT, causation_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PROCESSED','RETRYABLE','DEAD_LETTER')),
  attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ, last_error TEXT
);
CREATE INDEX IF NOT EXISTS automation_outbox_due_idx ON automation_outbox (available_at, id) WHERE status IN ('PENDING','RETRYABLE');
CREATE TABLE IF NOT EXISTS automation_jobs (
  job_id TEXT PRIMARY KEY, job_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','RETRYABLE','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0, idempotency_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, last_error TEXT
);
CREATE INDEX IF NOT EXISTS automation_jobs_due_idx ON automation_jobs (due_at, job_id) WHERE status IN ('PENDING','RETRYABLE');
CREATE TABLE IF NOT EXISTS automation_idempotency (
  actor_id TEXT NOT NULL, command TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING','COMPLETED')), result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ,
  PRIMARY KEY (actor_id, command, idempotency_key)
);
CREATE TABLE IF NOT EXISTS automation_audit_ledger (
  id TEXT PRIMARY KEY, event_id TEXT, actor_id TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), entity_id TEXT NOT NULL,
  action TEXT NOT NULL, before_state JSONB, after_state JSONB, source TEXT NOT NULL, reference TEXT
);
COMMIT;
