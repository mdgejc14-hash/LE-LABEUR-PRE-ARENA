-- LE LABEUR — P0-REPUTATION — LEDGER DE RÉPUTATION (aucun score opaque).
--
-- Constat d'inspection (ce qui EXISTAIT, ce qui est RÉUTILISÉ) :
--   * `automation_outbox` (0006) : événements métier RÉELS déjà produits par les
--     cycles existants (`SALARY_CONFIRMED`, `CLAIM_RESOLVED`, …). La réputation
--     les OBSERVE, elle n'en crée aucun et n'en modifie aucun.
--   * `automation_audit_ledger` (0006) : SEUL ledger d'audit du dépôt. Il reste
--     la trace des décisions (création d'entrée, correction ADMIN,
--     réconciliation). AUCUN second ledger d'audit n'est créé ici.
--   * `automation_idempotency` (0006) : idempotence durable des commandes ADMIN
--     et d'auto-réconciliation ; réutilisée telle quelle.
--   * `contracts.status` / `contracts.history` (0001/0003/0005) : faits
--     documentés DÉJÀ persistés (`COMPLETED`, entrées `CONTRACT_COMPLETED`,
--     `EXECUTION_CONFIRMED`).
--   * `salary_confirmations` (0010) : confirmation de réception par le salarié —
--     niveau de preuve retenu pour un paiement salarial. Une DÉCLARATION
--     (`payments.reference`) n'est jamais un fait suffisant.
--   * `claims` (0011) : `status = 'RESOLVED'` avec `resolved_by` (ADMIN) est une
--     décision ADMIN documentée. `resolved_by = 'SYSTEM'` (auto-résolution
--     déterministe P0-DISPUTE-1) n'attribue AUCUNE faute et ne produit donc
--     aucune entrée.
--   * `replacements` (0013) : un remplacement n'est jamais, à lui seul, un fait
--     de faute ; il n'existe aucune règle de réputation sur ce seul état.
--   * `users`, `permissions`, `role_permissions`, `user_permissions` : aucun
--     nouveau code de permission n'est créé. Les lectures ADMIN réutilisent
--     `audit:read` et les corrections `incidents:arbitrate`.
--
-- Modèle : le LEDGER est la source de vérité. Chaque ligne porte le fait source,
-- l'entité source, la règle et sa version, l'impact, l'explication, l'acteur, la
-- date du fait, le statut et une historique APPEND-ONLY. Aucun score n'est
-- stocké : le score est une VUE dérivée, recalculée par du code pur.
--
-- Neutralité portée par la BASE :
--   * `reputation_entries_dedupe_unique_idx` : un même fait logique ne peut pas
--     produire deux entrées, même sous deux workers concurrents ;
--   * `reputation_entries_direction_impact_check` : une entrée POSITIVE a un
--     impact > 0, une NÉGATIVE < 0, une NEUTRE = 0 (aucun impact incohérent) ;
--   * `reputation_entries_reversal_complete_check` : une entrée révoquée porte
--     toujours son auteur, sa date et son motif — jamais une annulation
--     silencieuse ;
--   * aucune colonne de donnée sensible ou protégée n'existe dans cette table.
--
-- Migration AVANT uniquement : aucune donnée existante n'est migrée, modifiée ou
-- supprimée ; aucune migration antérieure n'est réécrite.

BEGIN;

CREATE TABLE reputation_entries (
  reputation_id       TEXT PRIMARY KEY,
  -- Sujet de l'entrée : le titulaire de la réputation concernée. La
  -- suppression d'un compte emporte ses entrées (minimisation : aucune
  -- réputation orpheline conservée pour un compte disparu) ; aucun autre
  -- domaine n'est touché.
  subject_user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Fait source RÉEL (nom réel du dépôt : fait d'événement ou fait persisté).
  source_event        TEXT NOT NULL,
  -- Identifiant de la preuve source (identifiant d'événement Outbox, identifiant
  -- d'entrée d'historique de contrat, identifiant de ligne). Optionnel : un fait
  -- persisté peut être identifié par son seul couple entité/date.
  source_event_id     TEXT,
  source_entity_type  TEXT NOT NULL
                      CHECK (source_entity_type IN ('CONTRACT', 'CLAIM', 'PAYMENT', 'REPLACEMENT', 'ACCOUNT')),
  source_entity_id    TEXT NOT NULL,
  -- Règle ayant produit l'entrée, et sa version : une entrée ancienne reste
  -- lisible et explicable même après une évolution des règles.
  rule_code           TEXT NOT NULL,
  rule_version        TEXT NOT NULL,
  category            TEXT NOT NULL
                      CHECK (category IN ('MISSION_EXECUTION', 'PAYMENT_RELIABILITY', 'DISPUTE_OUTCOME')),
  direction           TEXT NOT NULL CHECK (direction IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL')),
  impact              INTEGER NOT NULL CHECK (impact BETWEEN -100 AND 100),
  explanation         TEXT NOT NULL CHECK (length(btrim(explanation)) BETWEEN 3 AND 1000),
  -- Acteur du fait : identifiant utilisateur, ou 'SYSTEM' pour une production
  -- automatique (aucune clé étrangère : 'SYSTEM' n'est pas un compte).
  actor_id            TEXT NOT NULL,
  -- PROVENANCE de l'entrée — provenance du FAIT dans le dépôt, jamais une
  -- caractéristique de personne : événement Outbox observé, réconciliation de
  -- faits déjà persistés, ou décision ADMIN (correction suivie dans l'audit).
  provenance          TEXT NOT NULL CHECK (provenance IN ('EVENT', 'RECONCILIATION', 'ADMIN_DECISION')),
  -- Date du FAIT documenté (≠ date de création de la ligne).
  occurred_at         TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVERSED')),
  reversed_at         TIMESTAMPTZ,
  reversed_by         TEXT,
  reversal_reason     TEXT,
  -- Journal APPEND-ONLY des corrections administratives : l'histoire n'est
  -- jamais réécrite, chaque correction AJOUTE une entrée horodatée.
  history             JSONB NOT NULL DEFAULT '[]'::jsonb
                      CHECK (jsonb_typeof(history) = 'array'),
  dedupe_key          TEXT NOT NULL,
  CONSTRAINT reputation_entries_direction_impact_check CHECK (
    (direction = 'POSITIVE' AND impact > 0)
    OR (direction = 'NEGATIVE' AND impact < 0)
    OR (direction = 'NEUTRAL' AND impact = 0)
  ),
  CONSTRAINT reputation_entries_reversal_complete_check CHECK (
    (status = 'ACTIVE'
      AND reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
    OR (status = 'REVERSED'
      AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL
      AND reversal_reason IS NOT NULL
      AND length(btrim(reversal_reason)) BETWEEN 3 AND 1000)
  )
);

-- Un fait logique = une entrée, y compris sous concurrence : la garantie est
-- une contrainte PostgreSQL, jamais un verrou applicatif ajouté.
CREATE UNIQUE INDEX reputation_entries_dedupe_unique_idx
  ON reputation_entries (dedupe_key);

-- Lecture du sujet (vue dérivée et historique), keyset par (occurred_at, id).
CREATE INDEX reputation_entries_subject_idx
  ON reputation_entries (subject_user_id, occurred_at DESC, reputation_id ASC);

CREATE INDEX reputation_entries_subject_status_idx
  ON reputation_entries (subject_user_id, status);

-- Lecture par entité source : permet de retrouver la provenance d'une entrée.
CREATE INDEX reputation_entries_source_idx
  ON reputation_entries (source_entity_type, source_entity_id, reputation_id);

-- Lecture ADMIN globale, keyset par (occurred_at, id).
CREATE INDEX reputation_entries_occurred_idx
  ON reputation_entries (occurred_at DESC, reputation_id ASC);

COMMIT;
