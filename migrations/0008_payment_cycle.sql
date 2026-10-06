-- LE LABEUR — P0-PAY-1 — CYCLE MÉTIER DES PAIEMENTS (AUCUN PAIEMENT RÉEL).
--
-- Périmètre : ouvrir LE CYCLE du domaine Payment au-dessus de l'automatisation
-- déjà réelle (P0-AUTO-1 / P0-AUTO-2), sans brancher le moindre paiement :
--
--   SCHEDULED → DUE → (déclaration employeur) → PENDING_VERIFICATION
--             → (vérification / rapprochement) → VERIFIED → PAID
--                                        ↘ REJECTED → (régularisation)
--
-- Constat d'inspection (ce qui EXISTAIT, ce qui a été PROLONGÉ) :
--   * `contracts.payment_schedule`, `contracts.commission_ledger`,
--     `contracts.monthly_checkpoints`, `contracts.commission_percentage`
--     (défaut 25), `contracts.commission_status`, `contracts.current_month` :
--     EXISTANTS (0001 / 0003 / 0005) et réellement écrits par P0-AUTO-2.
--     → ils RESTENT la source de l'échéancier : aucune table de planning
--       parallèle n'est créée ici, aucune colonne contractuelle n'est dupliquée.
--   * `automation_deadlines`, `automation_jobs`, `automation_outbox`,
--     `automation_idempotency`, `automation_audit_ledger` : EXISTANTS
--     (0006 / 0007). → seul mécanisme de planning, d'ordonnancement,
--       d'idempotence et d'audit ; P0-PAY-1 les RÉUTILISE, n'en crée AUCUN
--       second.
--   * `payment_schedule[].salaryStatus` / `commissionStatus`
--     (`SalaryPaymentStatus`, `CommissionPaymentStatus`) : EXISTANTS, domaine
--     `SCHEDULED / DUE / PENDING_VERIFICATION / PAID / REJECTED / NOT_APPLICABLE`.
--     → ce domaine n'est PAS élargi : `VERIFIED` est un état de l'agrégat
--       Payment, projeté côté contrat par `PENDING_VERIFICATION` (déclaration
--       validée, non encore considérée payée). Voir
--       `CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS` dans
--       `src/domain/paymentLifecycle.ts`.
--
-- Ce que cette migration ajoute (le strict minimum de l'agrégat Payment) :
--   1. `payments`             : UN paiement par (contrat, type, période). L'
--      unicité est portée par PostgreSQL, donc « un seul DUE », « une seule
--      déclaration identique » et « aucune transition impossible écrasant un
--      état plus avancé » sont des garanties de base de données, pas
--      applicatives. Des contraintes CHECK verrouillent les invariants du
--      cycle : pas de `VERIFIED`/`PAID` sans déclaration, pas de `PAID` sans
--      vérification, pas de `REJECTED` sans motif, pas de déclaration sans
--      référence.
--   2. `payment_declarations` : une ligne AJOUTÉE par tentative de déclaration
--      (jamais mise à jour, jamais supprimée) : `attempt_number` est unique par
--      paiement, donc une régularisation après `REJECTED` trace une nouvelle
--      tentative SANS écraser la preuve ni le motif précédents.
--
-- Aucun argent réel, aucun Mobile Money, aucun opérateur (MTN / Orange / Moov /
-- Wave), aucun agrégateur, aucun webhook fournisseur, aucun débit automatique,
-- aucun KYC, aucun R2 : aucune table ni colonne de fournisseur de paiement
-- n'existe ici. `provider` et `external_transaction_id` sont des champs TEXT
-- DÉCLARÉS par l'employeur, destinés au futur `PaymentProviderAdapter` ; ils ne
-- déclenchent AUCUN appel sortant.
--
-- Migration AVANT uniquement : aucune donnée n'est migrée, modifiée ni
-- supprimée ; aucune migration antérieure n'est réécrite.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PAIEMENTS — l'agrégat du cycle.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                      TEXT PRIMARY KEY,
  contract_id             TEXT NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  employer_id             TEXT NOT NULL,
  candidate_id            TEXT NOT NULL,
  payment_type            TEXT NOT NULL
                          CHECK (payment_type IN ('SALARY', 'PLATFORM_FEE')),
  schedule_entry_id       TEXT NOT NULL,
  month_number            INTEGER NOT NULL CHECK (month_number >= 1),
  period_key              TEXT NOT NULL,
  amount                  NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency                TEXT NOT NULL,
  scheduled_at            TIMESTAMPTZ NOT NULL,
  due_at                  TIMESTAMPTZ NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'SCHEDULED'
                          CHECK (status IN ('SCHEDULED', 'DUE', 'PENDING_VERIFICATION',
                                            'VERIFIED', 'PAID', 'REJECTED')),
  submitted_at            TIMESTAMPTZ,
  submitted_by            TEXT,
  reference               TEXT,
  proof                   JSONB,
  verified_at             TIMESTAMPTZ,
  verified_by             TEXT,
  rejected_at             TIMESTAMPTZ,
  rejected_by             TEXT,
  rejection_reason        TEXT,
  external_transaction_id TEXT,
  provider                TEXT,
  declaration_count       INTEGER NOT NULL DEFAULT 0 CHECK (declaration_count >= 0),
  current_declaration_id  TEXT,
  idempotency_key         TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un paiement déclaré porte obligatoirement sa référence (ÉTAPE 6 : la
  -- déclaration est liée à `reference`) ; un paiement déclaré porte
  -- obligatoirement la tentative courante (ÉTAPE 9 : rien n'est écrasé).
  CONSTRAINT payments_declared_requires_reference
    CHECK (submitted_at IS NULL OR reference IS NOT NULL),
  CONSTRAINT payments_declared_requires_attempt
    CHECK (submitted_at IS NULL OR current_declaration_id IS NOT NULL),
  -- `VERIFIED` et `PAID` ne sont jamais atteints sans déclaration préalable :
  -- la vérification est une étape DISTINCTE de la déclaration (ÉTAPE 7).
  CONSTRAINT payments_verified_requires_submission
    CHECK (status NOT IN ('PENDING_VERIFICATION', 'VERIFIED', 'PAID')
           OR (submitted_at IS NOT NULL AND current_declaration_id IS NOT NULL)),
  -- `PAID` exige une vérification (jamais DUE → PAID, jamais SCHEDULED → PAID).
  CONSTRAINT payments_paid_requires_verification
    CHECK (status <> 'PAID' OR verified_at IS NOT NULL),
  -- Un rejet est explicite et motivé (ÉTAPE 9).
  CONSTRAINT payments_rejected_requires_reason
    CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL)
);

-- UN paiement par (contrat, nature, période) : la garantie « pas de double
-- échéance de paiement » est une contrainte d'unicité, pas un verrou applicatif.
CREATE UNIQUE INDEX IF NOT EXISTS payments_contract_period_unique_idx
  ON payments (contract_id, payment_type, month_number);

-- Matérialisation idempotente : deux traitements concurrents du même
-- `CONTRACT_ACTIVATED` ne peuvent pas créer deux fois le même paiement.
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_unique_idx
  ON payments (idempotency_key);

-- Scan borné des échéances à basculer en DUE (jamais « une boucle qui charge
-- tous les paiements ») : index partiel sur les seuls statuts ouverts.
CREATE INDEX IF NOT EXISTS payments_due_scan_idx
  ON payments (due_at, id)
  WHERE status IN ('SCHEDULED', 'DUE');

CREATE INDEX IF NOT EXISTS payments_contract_idx
  ON payments (contract_id, period_key, payment_type);

CREATE INDEX IF NOT EXISTS payments_employer_status_idx
  ON payments (employer_id, status, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS payments_candidate_status_idx
  ON payments (candidate_id, status, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS payments_list_idx
  ON payments (updated_at DESC, id);

-- ---------------------------------------------------------------------------
-- 2. DÉCLARATIONS — l'historique des tentatives, append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_declarations (
  id                      TEXT PRIMARY KEY,
  payment_id              TEXT NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
  contract_id             TEXT NOT NULL,
  period_key              TEXT NOT NULL,
  payment_type            TEXT NOT NULL
                          CHECK (payment_type IN ('SALARY', 'PLATFORM_FEE')),
  attempt_number          INTEGER NOT NULL CHECK (attempt_number >= 1),
  amount                  NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  currency                TEXT NOT NULL,
  reference               TEXT NOT NULL,
  external_transaction_id TEXT,
  provider                TEXT,
  proof                   JSONB,
  comment                 TEXT,
  submitted_at            TIMESTAMPTZ NOT NULL,
  submitted_by            TEXT NOT NULL,
  outcome                 TEXT NOT NULL DEFAULT 'PENDING'
                          CHECK (outcome IN ('PENDING', 'VERIFIED', 'REJECTED')),
  reviewed_at             TIMESTAMPTZ,
  reviewed_by             TEXT,
  rejection_reason        TEXT,
  idempotency_key         TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Une tentative est une pièce d'audition complète : référence obligatoire,
  -- motif de rejet obligatoire, et un rejet ne supprime jamais la preuve.
  CONSTRAINT payment_declarations_rejected_requires_reason
    CHECK (outcome <> 'REJECTED' OR rejection_reason IS NOT NULL),
  CONSTRAINT payment_declarations_attempt_unique
    UNIQUE (payment_id, attempt_number),
  CONSTRAINT payment_declarations_idempotency_unique
    UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS payment_declarations_payment_idx
  ON payment_declarations (payment_id, attempt_number);

CREATE INDEX IF NOT EXISTS payment_declarations_review_idx
  ON payment_declarations (submitted_at, id)
  WHERE outcome = 'PENDING';

COMMIT;
