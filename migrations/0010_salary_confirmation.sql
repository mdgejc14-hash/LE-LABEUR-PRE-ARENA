BEGIN;
CREATE TABLE salary_confirmations (
 payment_id TEXT PRIMARY KEY REFERENCES payments(id),
 contract_id TEXT NOT NULL REFERENCES contracts(id),
 candidate_id TEXT NOT NULL,
 employer_id TEXT NOT NULL,
 period_key TEXT NOT NULL,
 amount NUMERIC(14,2) NOT NULL,
 currency TEXT NOT NULL,
 nonce TEXT NOT NULL UNIQUE,
 otp_digest TEXT NOT NULL,
 requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL,
 confirmed_at TIMESTAMPTZ,
 confirmed_by TEXT,
 confirmation_event_id TEXT UNIQUE,
 request_key TEXT NOT NULL,
 confirm_key TEXT,
 CONSTRAINT salary_confirmed_complete CHECK ((confirmed_at IS NULL AND confirmed_by IS NULL AND confirmation_event_id IS NULL) OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND confirmation_event_id IS NOT NULL))
);
CREATE INDEX salary_confirmations_candidate_pending_idx ON salary_confirmations(candidate_id, expires_at) WHERE confirmed_at IS NULL;
COMMIT;
