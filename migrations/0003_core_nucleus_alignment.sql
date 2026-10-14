-- LE LABEUR — P0-A — alignement du noyau relationnel.
--
-- Périmètre : offres, candidatures, contrats (+ contraintes d'état).
-- Objectif : rendre le schéma cohérent avec
--   * les types du domaine (src/types/index.ts),
--   * les domaines d'états déclarés dans src/backend/persistence/coreRecords.ts,
--   * les requêtes des adaptateurs src/backend/persistence/sqlCoreStores.ts.
--
-- Migration AVANT uniquement, rejouable (ADD COLUMN IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS, renommage gardé par un bloc conditionnel).
-- Aucune donnée métier n'est migrée ni supprimée.
--
-- À appliquer AVANT toute écriture applicative : les valeurs historiques
-- 'DRAFT' (offers), 'SENT' (applications) et 'PENDING_SIGNATURE' (contracts)
-- des migrations 0001/0002 ne sont produites par aucun adaptateur.
--
-- PRÉPARÉE : aucune base n'est provisionnée ni migrée par cette phase.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. OFFERS
-- ---------------------------------------------------------------------------
ALTER TABLE offers ALTER COLUMN status SET DEFAULT 'ACTIVE';
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_status_domain;
ALTER TABLE offers ADD CONSTRAINT offers_status_domain
  CHECK (status IN ('ACTIVE', 'FILLED', 'CANCELLED', 'PAUSED'));

ALTER TABLE offers ADD COLUMN IF NOT EXISTS department_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS municipality_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS arrondissement_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS locality_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS location_label TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS domain_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS posted_date TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE offers ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS is_le_labeur_job BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS le_labeur_tag TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS selection_process JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS duration_months INTEGER;
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_duration_positive;
ALTER TABLE offers ADD CONSTRAINT offers_duration_positive
  CHECK (duration_months IS NULL OR duration_months > 0);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS filled_at TIMESTAMPTZ;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS offers_status_posted_idx ON offers (status, posted_date DESC);
CREATE INDEX IF NOT EXISTS offers_employer_status_idx ON offers (employer_id, status, posted_date DESC);

-- ---------------------------------------------------------------------------
-- 2. APPLICATIONS
-- ---------------------------------------------------------------------------
ALTER TABLE applications ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_domain;
ALTER TABLE applications ADD CONSTRAINT applications_status_domain
  CHECK (status IN ('PENDING', 'REVIEW', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN', 'HIRED', 'CONTRACTED', 'CLOSED_OFFER_FILLED'));

ALTER TABLE applications ADD COLUMN IF NOT EXISTS applied_date TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE applications ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS remuneration TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contract_id TEXT REFERENCES contracts (id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS applications_candidate_status_idx ON applications (candidate_id, status, applied_date DESC);
CREATE INDEX IF NOT EXISTS applications_offer_status_idx ON applications (offer_id, status);
CREATE INDEX IF NOT EXISTS applications_contract_idx ON applications (contract_id);

-- ---------------------------------------------------------------------------
-- 3. CONTRACTS
-- ---------------------------------------------------------------------------
-- `salary` (0001) devient `monthly_salary` : même valeur, nom aligné sur le domaine.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'contracts' AND column_name = 'salary'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'contracts' AND column_name = 'monthly_salary'
  ) THEN
    ALTER TABLE contracts RENAME COLUMN salary TO monthly_salary;
  END IF;
END $$;

ALTER TABLE contracts ALTER COLUMN status SET DEFAULT 'SIGNATURE';
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_domain;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_domain
  CHECK (status IN ('DRAFT', 'PENDING_EMPLOYER', 'PENDING_EMPLOYEE', 'SIGNATURE', 'ACTIVE', 'SUSPENDED', 'INCIDENT', 'TERMINATED', 'COMPLETED', 'REPLACED'));

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS current_month INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_current_month_positive;
ALTER TABLE contracts ADD CONSTRAINT contracts_current_month_positive CHECK (current_month >= 1);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_months INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_duration_positive;
ALTER TABLE contracts ADD CONSTRAINT contracts_duration_positive CHECK (duration_months > 0);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS periodicity TEXT NOT NULL DEFAULT 'Mensuel';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS mission_description TEXT NOT NULL DEFAULT '';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS additional_notes TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS employer_signed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS employee_signed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS employer_signed_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS employee_signed_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 25;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_commission_percentage_range;
ALTER TABLE contracts ADD CONSTRAINT contracts_commission_percentage_range
  CHECK (commission_percentage >= 0 AND commission_percentage <= 100);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_amount_due NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_commission_amount_positive;
ALTER TABLE contracts ADD CONSTRAINT contracts_commission_amount_positive CHECK (commission_amount_due >= 0);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_status TEXT NOT NULL DEFAULT 'SCHEDULED';
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_commission_status_domain;
ALTER TABLE contracts ADD CONSTRAINT contracts_commission_status_domain
  CHECK (commission_status IN ('SCHEDULED', 'DUE', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'NOT_APPLICABLE'));
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS monthly_checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_ledger JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_schedule JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Références volontairement SANS clé étrangère : les tables `incidents` et
-- `replacements` sont hors du noyau P0-A.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS replacement_id TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS replaced_contract_id TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS incident_id TEXT;

-- Le domaine exige une date de début ; aucune ligne ne peut exister avant le
-- branchement des adaptateurs.
ALTER TABLE contracts ALTER COLUMN start_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS contracts_status_updated_idx ON contracts (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS contracts_candidate_status_idx ON contracts (candidate_id, status);

COMMIT;
