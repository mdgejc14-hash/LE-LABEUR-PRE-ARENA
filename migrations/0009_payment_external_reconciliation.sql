-- LE LABEUR — P0-PAY-3 — registre externe, lots de rapprochement et revues ADMIN.
--
-- Cette migration conserve des données NORMALISÉES de règlement externe et les
-- résultats d'un rapprochement batch. Elle n'ajoute aucun fournisseur réel,
-- endpoint, secret, credential, contrat marchand, remboursement ou paiement.
-- `normalized_metadata` est construit depuis les champs autorisés ci-dessous;
-- tout `rawPayload` libre fourni par un adaptateur est volontairement omis.
--
-- Les paiements P0-PAY-1/P0-PAY-2 restent les seuls agrégats métier. Un MATCH
-- dans ces tables n'effectue aucune transition de Payment et ne signifie pas
-- qu'un mouvement de fonds LE LABEUR a été exécuté.

BEGIN;

-- Un même identifiant externe ne peut pas être déclaré sur plusieurs paiements
-- dans chaque table historique. La table de règlement ci-dessous ajoute la
-- garantie commune (provider, external_transaction_id) pour les batchs.
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_external_transaction_unique_idx
  ON payments (provider, external_transaction_id)
  WHERE provider IS NOT NULL AND external_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_declarations_provider_external_transaction_unique_idx
  ON payment_declarations (provider, external_transaction_id)
  WHERE provider IS NOT NULL AND external_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_reconciliation_batches (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  batch_key         TEXT NOT NULL,
  payload_hash      TEXT NOT NULL,
  requested_by      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  total_items       INTEGER NOT NULL CHECK (total_items >= 0),
  processed_items   INTEGER NOT NULL DEFAULT 0 CHECK (processed_items >= 0),
  matched_items     INTEGER NOT NULL DEFAULT 0 CHECK (matched_items >= 0),
  mismatched_items  INTEGER NOT NULL DEFAULT 0 CHECK (mismatched_items >= 0),
  not_found_items   INTEGER NOT NULL DEFAULT 0 CHECK (not_found_items >= 0),
  duplicate_items   INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_items >= 0),
  review_items      INTEGER NOT NULL DEFAULT 0 CHECK (review_items >= 0),
  failed_items      INTEGER NOT NULL DEFAULT 0 CHECK (failed_items >= 0),
  pending_items     INTEGER NOT NULL DEFAULT 0 CHECK (pending_items >= 0),
  processing_items  INTEGER NOT NULL DEFAULT 0 CHECK (processing_items >= 0),
  retryable_items   INTEGER NOT NULL DEFAULT 0 CHECK (retryable_items >= 0),
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  last_error        TEXT,
  CONSTRAINT payment_reconciliation_batches_provider_key_unique
    UNIQUE (provider, batch_key)
);

CREATE INDEX IF NOT EXISTS payment_reconciliation_batches_status_idx
  ON payment_reconciliation_batches (status, created_at, id);

CREATE TABLE IF NOT EXISTS payment_reconciliation_batch_items (
  id                     TEXT PRIMARY KEY,
  batch_id               TEXT NOT NULL REFERENCES payment_reconciliation_batches (id) ON DELETE CASCADE,
  item_index             INTEGER NOT NULL CHECK (item_index >= 0),
  provider               TEXT NOT NULL,
  external_transaction_id TEXT,
  reference              TEXT,
  normalized_metadata    JSONB NOT NULL,
  validation_reasons     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                 TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING', 'PROCESSING', 'RETRYABLE',
                                           'MATCH', 'MISMATCH', 'NOT_FOUND',
                                           'DUPLICATE', 'REVIEW_REQUIRED', 'FAILED')),
  result                 JSONB,
  matched_payment_id     TEXT REFERENCES payments (id) ON DELETE SET NULL,
  review_id              TEXT,
  attempts               INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim_token            TEXT,
  claimed_at             TIMESTAMPTZ,
  next_attempt_at        TIMESTAMPTZ NOT NULL,
  last_error             TEXT,
  created_at             TIMESTAMPTZ NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL,
  CONSTRAINT payment_reconciliation_batch_items_index_unique
    UNIQUE (batch_id, item_index)
);

CREATE INDEX IF NOT EXISTS payment_reconciliation_batch_items_pending_idx
  ON payment_reconciliation_batch_items (batch_id, next_attempt_at, item_index)
  WHERE status IN ('PENDING', 'RETRYABLE');

CREATE INDEX IF NOT EXISTS payment_reconciliation_batch_items_payment_idx
  ON payment_reconciliation_batch_items (matched_payment_id, created_at DESC)
  WHERE matched_payment_id IS NOT NULL;

-- Grand livre du règlement externe. Les clés externes sont immuables: une
-- seconde réception ne remplace pas silencieusement le premier payload.
CREATE TABLE IF NOT EXISTS payment_external_settlements (
  id                       TEXT PRIMARY KEY,
  provider                 TEXT NOT NULL,
  external_transaction_id  TEXT NOT NULL,
  reference                TEXT NOT NULL,
  amount                   NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency                 TEXT NOT NULL,
  payer                    TEXT NOT NULL,
  recipient                TEXT NOT NULL,
  occurred_at              TEXT NOT NULL,
  transaction_status       TEXT NOT NULL
                           CHECK (transaction_status IN ('PENDING', 'SUCCESS', 'FAILED',
                                                         'REJECTED', 'CANCELLED', 'UNKNOWN')),
  normalized_metadata      JSONB NOT NULL,
  reconciliation_status    TEXT NOT NULL
                           CHECK (reconciliation_status IN ('MATCH', 'MISMATCH', 'NOT_FOUND',
                                                             'DUPLICATE', 'REVIEW_REQUIRED')),
  matched_payment_id       TEXT REFERENCES payments (id) ON DELETE SET NULL,
  reconciliation_reasons  JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at            TIMESTAMPTZ NOT NULL,
  last_seen_at             TIMESTAMPTZ NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL,
  updated_at               TIMESTAMPTZ NOT NULL,
  CONSTRAINT payment_external_settlements_provider_transaction_unique
    UNIQUE (provider, external_transaction_id),
  CONSTRAINT payment_external_settlements_provider_reference_unique
    UNIQUE (provider, reference)
);

CREATE INDEX IF NOT EXISTS payment_external_settlements_status_idx
  ON payment_external_settlements (reconciliation_status, last_seen_at DESC, id);

CREATE INDEX IF NOT EXISTS payment_external_settlements_payment_idx
  ON payment_external_settlements (matched_payment_id, first_seen_at DESC)
  WHERE matched_payment_id IS NOT NULL;

-- Un paiement ne peut recevoir silencieusement deux règlements externes
-- différents reconnus MATCH. Les autres verdicts restent conservés pour review.
CREATE UNIQUE INDEX IF NOT EXISTS payment_external_settlements_one_match_per_payment_idx
  ON payment_external_settlements (matched_payment_id)
  WHERE matched_payment_id IS NOT NULL AND reconciliation_status = 'MATCH';

CREATE TABLE IF NOT EXISTS payment_reconciliation_reviews (
  id                  TEXT PRIMARY KEY,
  batch_id            TEXT NOT NULL REFERENCES payment_reconciliation_batches (id) ON DELETE CASCADE,
  batch_item_id       TEXT NOT NULL REFERENCES payment_reconciliation_batch_items (id) ON DELETE CASCADE,
  payment_id          TEXT REFERENCES payments (id) ON DELETE SET NULL,
  reason              TEXT NOT NULL,
  evidence_reference  TEXT,
  decision            TEXT NOT NULL DEFAULT 'OPEN'
                      CHECK (decision IN ('OPEN', 'CONFIRMED', 'REJECTED')),
  opened_by           TEXT NOT NULL,
  opened_at           TIMESTAMPTZ NOT NULL,
  actor_id            TEXT,
  decided_at          TIMESTAMPTZ,
  decision_evidence   TEXT,
  decision_note       TEXT,
  escalated_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL,
  CONSTRAINT payment_reconciliation_reviews_decision_requires_actor
    CHECK ((decision = 'OPEN' AND actor_id IS NULL AND decided_at IS NULL)
        OR (decision IN ('CONFIRMED', 'REJECTED') AND actor_id IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT payment_reconciliation_reviews_item_unique UNIQUE (batch_item_id)
);

CREATE INDEX IF NOT EXISTS payment_reconciliation_reviews_open_idx
  ON payment_reconciliation_reviews (opened_at, id)
  WHERE decision = 'OPEN';

CREATE INDEX IF NOT EXISTS payment_reconciliation_reviews_payment_idx
  ON payment_reconciliation_reviews (payment_id, opened_at DESC)
  WHERE payment_id IS NOT NULL;

-- Tentatives ADMIN de correction : persistées append-only avec les champs
-- normalisés proposés uniquement; elles ne réécrivent ni le settlement, ni le
-- résultat du rapprochement, ni l'état du Payment.
CREATE TABLE IF NOT EXISTS payment_reconciliation_correction_attempts (
  id                  TEXT PRIMARY KEY,
  review_id           TEXT NOT NULL REFERENCES payment_reconciliation_reviews (id) ON DELETE CASCADE,
  batch_id            TEXT NOT NULL REFERENCES payment_reconciliation_batches (id) ON DELETE CASCADE,
  batch_item_id       TEXT NOT NULL REFERENCES payment_reconciliation_batch_items (id) ON DELETE CASCADE,
  payment_id          TEXT REFERENCES payments (id) ON DELETE SET NULL,
  attempted_by        TEXT NOT NULL,
  idempotency_key     TEXT NOT NULL,
  proposed_changes    JSONB NOT NULL CHECK (jsonb_typeof(proposed_changes) = 'object'),
  evidence_reference  TEXT,
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status = 'RECORDED'),
  created_at          TIMESTAMPTZ NOT NULL,
  CONSTRAINT payment_reconciliation_correction_attempts_review_key_unique
    UNIQUE (review_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_reconciliation_correction_attempts_item_idx
  ON payment_reconciliation_correction_attempts (batch_item_id, created_at, id);

COMMIT;
