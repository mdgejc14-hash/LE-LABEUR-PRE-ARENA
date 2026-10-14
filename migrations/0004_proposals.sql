-- LE LABEUR — P0-E5 — PROPOSITIONS D'EMBAUCHE.
--
-- Périmètre : la table `proposals` seule, alignée sur le modèle réel
--   * types du domaine : src/types/index.ts (MissionProposal, ProposalStatus) ;
--   * règles métier   : MockRepository.sendProposal / respondToProposal ;
--   * contrats SQL    : src/backend/persistence/sqlCoreStores.ts (createSqlProposalStore).
-- Aucun autre domaine n'est ouvert (contrats, paiements, commissions, plaintes,
-- remplacements, notifications), aucun état nouveau n'est introduit.
--
-- Aucune donnée n'est migrée ni supprimée : migration AVANT uniquement.
-- PRÉPARÉE : aucune base n'est provisionnée ni migrée par cette phase.
--
-- Constat du modèle réel : `MissionProposal` ne porte AUCUN champ d'échéance.
-- P0-E5 modélise donc l'état `EXPIRED` de `ProposalStatus` sans inventer de
-- deadline (voir `src/domain/proposalTransitions.ts`,
-- `PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS`, et
-- `docs/P0-E5_PROPOSITIONS_EMBAUCHE.md`).

BEGIN;

CREATE TABLE IF NOT EXISTS proposals (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  contract_id     TEXT REFERENCES contracts (id) ON DELETE SET NULL,
  offer_id        TEXT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  application_id  TEXT REFERENCES applications (id) ON DELETE SET NULL,
  employer_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mission_title   TEXT NOT NULL,
  amount          NUMERIC(14, 2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'FCFA',
  periodicity     TEXT NOT NULL DEFAULT 'Mensuel',
  start_date      TEXT NOT NULL,
  end_date        TEXT,
  duration_months INTEGER NOT NULL,
  location        TEXT NOT NULL,
  conditions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('DRAFT', 'SENT', 'REVISION_REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  revision_notes  TEXT,
  sent_at         TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT proposals_amount_positive CHECK (amount > 0),
  CONSTRAINT proposals_duration_positive CHECK (duration_months > 0),
  CONSTRAINT proposals_periodicity_domain CHECK (periodicity IN ('Mensuel', 'Hebdomadaire', 'Forfait mission')),
  CONSTRAINT proposals_distinct_parties CHECK (employer_id <> employee_id)
);

CREATE INDEX IF NOT EXISTS proposals_offer_idx ON proposals (offer_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS proposals_application_idx ON proposals (application_id);
CREATE INDEX IF NOT EXISTS proposals_contract_idx ON proposals (contract_id);
CREATE INDEX IF NOT EXISTS proposals_employer_idx ON proposals (employer_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS proposals_employee_idx ON proposals (employee_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS proposals_status_idx ON proposals (status, sent_at DESC);

COMMIT;
