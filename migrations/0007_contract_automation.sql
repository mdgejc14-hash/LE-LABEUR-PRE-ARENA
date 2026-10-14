-- LE LABEUR — P0-AUTO-2 — AUTOMATISATION CONTRACTUELLE.
--
-- Périmètre : rendre RÉELLEMENT exécutable le cycle
--   CONTRACT_ACTIVE → échéancier salarial → échéancier de commission
--                   → échéances de paiement → rappels
-- au-dessus de la fondation P0-AUTO-1 (`0006_automation_foundation.sql`).
--
-- Constat d'inspection (ce qui existait déjà, ce qui manquait) :
--   * `automation_outbox`      : EXISTANT (0006) — colonnes de file réelles
--                                (status, attempts, available_at, last_error)
--                                et index d'échéance. Rien à recréer.
--   * `automation_jobs`        : EXISTANT (0006) — `ScheduledJob` de la
--                                fondation. Il manquait l'UNICITÉ de la clé
--                                d'idempotence, sans laquelle deux workers
--                                concurrents peuvent créer deux fois le même
--                                job. Ajoutée ici (index, jamais DROP).
--   * `automation_idempotency` : EXISTANT (0006) — clé primaire
--                                (actor_id, command, idempotency_key). Réutilisé
--                                tel quel, aucun second mécanisme n'est créé.
--   * `automation_audit_ledger`: EXISTANT (0006) — `AuditLedgerEntry` de la
--                                fondation. Il manquait un index de lecture par
--                                entité. Ajouté ici.
--   * `Deadline` / SLA         : le type EXISTE dans la fondation
--                                (`src/backend/automation/foundation.ts`) mais
--                                AUCUNE table ne le portait. `automation_deadlines`
--                                est créée ici : c'est l'unique table nouvelle.
--
-- Aucun domaine métier nouveau n'est ouvert : ni paiements, ni commissions
-- déclarées, ni notifications, ni incidents, ni remplacements, ni KYC, ni R2.
-- L'échéancier salarial et l'échéancier de commission restent portés par les
-- colonnes JSONB RÉELLES du contrat (`contracts.payment_schedule`,
-- `monthly_checkpoints`, `commission_ledger`, `commission_percentage`,
-- `commission_amount_due`, `commission_status`) créées par 0001/0003 : aucune
-- table parallèle n'est créée, aucune donnée n'est dupliquée.
--
-- Aucune donnée n'est migrée ni supprimée : migration AVANT uniquement.
-- Aucune modification rétroactive de 0001 → 0006.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DEADLINES / SLA — persistance du type `Deadline` de la fondation.
--
--    Une ligne = une échéance de paiement d'un contrat (salaire ou commission)
--    pour une période donnée. `due_at` n'est JAMAIS inventé : il provient de
--    `PaymentScheduleEntry.salaryDueDate` / `commissionDueDate` produits par
--    `buildPaymentSchedule` (`src/domain/businessRules.ts`), la seule règle de
--    cadence existante du modèle réel.
--
--    `grace_period_ms` et `escalation` portent la règle J+3 RÉELLE du modèle
--    (`J3_SCHEDULER_CONTRACT.thresholdDays = 3`,
--    `MockRepository.syncPaymentSchedule` : `if (daysLate < 3) continue;`).
--
--    `idempotency_key` est UNIQUE : deux traitements concurrents du même
--    `CONTRACT_ACTIVATED` ne peuvent pas créer deux fois la même échéance.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_deadlines (
  id                TEXT PRIMARY KEY,
  aggregate_type    TEXT NOT NULL,
  aggregate_id      TEXT NOT NULL,
  kind              TEXT NOT NULL,
  due_at            TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','MET','OVERDUE','ESCALATED','CANCELLED')),
  sla               TEXT,
  grace_period_ms   BIGINT,
  escalation        TEXT,
  reference         TEXT,
  idempotency_key   TEXT NOT NULL,
  source_event_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_deadlines_idempotency_unique_idx
  ON automation_deadlines (idempotency_key);

CREATE INDEX IF NOT EXISTS automation_deadlines_due_idx
  ON automation_deadlines (due_at, id)
  WHERE status IN ('OPEN', 'OVERDUE');

CREATE INDEX IF NOT EXISTS automation_deadlines_aggregate_idx
  ON automation_deadlines (aggregate_type, aggregate_id);

-- ---------------------------------------------------------------------------
-- 2. JOBS — unicité réelle de la clé d'idempotence (fondation 0006).
--
--    `automation_jobs.idempotency_key` était NOT NULL mais NON unique : rien
--    n'empêchait deux workers de créer deux fois le même rappel. L'unicité est
--    la contrainte PostgreSQL qui rend le rejeu sans double effet, conformément
--    à l'exigence « ne pas créer un deuxième framework de concurrence ».
--
--    `reference` (nullable, ajout AVANT) porte l'identifiant de l'entrée
--    d'échéancier rappelée (`PaymentScheduleEntry.id`), comme
--    `automation_deadlines.reference` : sans elle, un job de rappel ne pourrait
--    retrouver son échéance qu'en recalculant ou en analysant sa clé.
-- ---------------------------------------------------------------------------
ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS automation_jobs_idempotency_unique_idx
  ON automation_jobs (idempotency_key);

CREATE INDEX IF NOT EXISTS automation_jobs_aggregate_idx
  ON automation_jobs (aggregate_type, aggregate_id);

-- ---------------------------------------------------------------------------
-- 3. OUTBOX / LEDGER — lectures d'exploitation.
--
--    L'outbox de 0006 porte déjà l'index de claim `(available_at, id)`.
--    Manquaient la lecture par agrégat (suivi d'un contrat) et la lecture du
--    ledger d'audit par entité.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS automation_outbox_aggregate_idx
  ON automation_outbox (aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS automation_audit_ledger_entity_idx
  ON automation_audit_ledger (entity_id, occurred_at);

COMMIT;
