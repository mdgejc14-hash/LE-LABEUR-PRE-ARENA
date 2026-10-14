-- LE LABEUR — Phase 2 — migration initiale PostgreSQL (identité + entités de base).
-- PRÉPARÉE : aucune base n'est provisionnée ni migrée par cette phase.
-- Conventions d'IDs : texte applicatif `prefixe_<26 base32>` (voir src/backend/identity/ids.ts).

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('CANDIDATE', 'EMPLOYER', 'ADMIN')),
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'PENDING')),
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);

-- Identité externe vérifiée côté serveur : le couple (provider, sub) est unique.
CREATE TABLE IF NOT EXISTS external_identities (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('GOOGLE')),
  subject         TEXT NOT NULL,
  verified_email  TEXT NOT NULL,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_identities_provider_subject_key UNIQUE (provider, subject)
);
CREATE INDEX IF NOT EXISTS external_identities_user_idx ON external_identities (user_id);

-- Sessions serveur : seul le SHA-256 du jeton opaque est stocké.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  user_agent   TEXT,
  ip_hash      TEXT,
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- Permissions : le rôle reste la source primaire; les grants explicites sont additifs.
CREATE TABLE IF NOT EXISTS permissions (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role            TEXT NOT NULL CHECK (role IN ('CANDIDATE', 'EMPLOYER', 'ADMIN')),
  permission_code TEXT NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_code)
);

-- Entités de base : structure minimale, aucune migration des données mock.
CREATE TABLE IF NOT EXISTS offers (
  id            TEXT PRIMARY KEY,
  employer_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT',
  contract_type TEXT NOT NULL,
  remuneration  NUMERIC(14, 2) NOT NULL CHECK (remuneration >= 0),
  currency      TEXT NOT NULL DEFAULT 'FCFA',
  location      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offers_employer_idx ON offers (employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_status_idx ON offers (status, created_at DESC);

CREATE TABLE IF NOT EXISTS applications (
  id           TEXT PRIMARY KEY,
  offer_id     TEXT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'SENT',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT applications_unique_candidate_offer UNIQUE (offer_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS applications_candidate_idx ON applications (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_offer_idx ON applications (offer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contracts (
  id             TEXT PRIMARY KEY,
  offer_id       TEXT REFERENCES offers (id) ON DELETE SET NULL,
  application_id TEXT REFERENCES applications (id) ON DELETE SET NULL,
  employer_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  candidate_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'PENDING_SIGNATURE',
  salary         NUMERIC(14, 2) NOT NULL CHECK (salary >= 0),
  currency       TEXT NOT NULL DEFAULT 'FCFA',
  start_date     DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contracts_distinct_parties CHECK (employer_id <> candidate_id)
);
CREATE INDEX IF NOT EXISTS contracts_employer_idx ON contracts (employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_candidate_idx ON contracts (candidate_id, created_at DESC);

COMMIT;
