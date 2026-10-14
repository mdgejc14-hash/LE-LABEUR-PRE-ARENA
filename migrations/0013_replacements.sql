-- LE LABEUR — P0-REPLACEMENT — remplacement durable d'un engagement.
--
-- Additif : le remplacement reste rattaché au Claim et au contrat initial ;
-- l'offre de sourcing, la candidature, la proposition et le contrat successeur
-- sont des entités distinctes du cycle métier déjà existant.
-- Aucun paiement n'est déplacé, copié, annulé ou recréé par cette migration.

BEGIN;

CREATE TABLE IF NOT EXISTS replacements (
  replacement_id         TEXT PRIMARY KEY,
  claim_id               TEXT NOT NULL UNIQUE REFERENCES claims (claim_id) ON DELETE RESTRICT,
  original_contract_id   TEXT NOT NULL UNIQUE REFERENCES contracts (id) ON DELETE RESTRICT,
  employer_id            TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  offer_id               TEXT UNIQUE REFERENCES offers (id) ON DELETE RESTRICT,
  selected_application_id TEXT REFERENCES applications (id) ON DELETE RESTRICT,
  selected_candidate_id   TEXT REFERENCES users (id) ON DELETE RESTRICT,
  selected_proposal_id    TEXT REFERENCES proposals (id) ON DELETE RESTRICT,
  new_contract_id         TEXT UNIQUE REFERENCES contracts (id) ON DELETE RESTRICT,
  status                 TEXT NOT NULL
                         CHECK (status IN ('PENDING_OFFER', 'SOURCING_CANDIDATES',
                                           'CANDIDATE_SELECTED', 'TRANSFERRED_TO_EMPLOYER',
                                           'CONTRACT_FINALIZED')),
  created_at             TIMESTAMPTZ NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL,
  CONSTRAINT replacements_selection_complete CHECK (
    (status = 'PENDING_OFFER'
      AND offer_id IS NULL
      AND selected_application_id IS NULL
      AND selected_candidate_id IS NULL
      AND selected_proposal_id IS NULL
      AND new_contract_id IS NULL)
    OR (status = 'SOURCING_CANDIDATES'
      AND offer_id IS NOT NULL
      AND selected_application_id IS NULL
      AND selected_candidate_id IS NULL
      AND selected_proposal_id IS NULL
      AND new_contract_id IS NULL)
    OR (status = 'CANDIDATE_SELECTED'
      AND offer_id IS NOT NULL
      AND selected_application_id IS NOT NULL
      AND selected_candidate_id IS NOT NULL
      AND new_contract_id IS NULL)
    OR (status = 'TRANSFERRED_TO_EMPLOYER'
      AND offer_id IS NOT NULL
      AND selected_application_id IS NOT NULL
      AND selected_candidate_id IS NOT NULL
      AND selected_proposal_id IS NOT NULL
      AND new_contract_id IS NULL)
    OR (status = 'CONTRACT_FINALIZED'
      AND offer_id IS NOT NULL
      AND selected_application_id IS NOT NULL
      AND selected_candidate_id IS NOT NULL
      AND selected_proposal_id IS NOT NULL
      AND new_contract_id IS NOT NULL)
  )
);

-- Une seule décision de remplacement et un seul dossier successeur par
-- engagement source, même si deux commandes concurrentes arrivent.
CREATE UNIQUE INDEX replacements_original_contract_unique_idx
  ON replacements (original_contract_id);
CREATE INDEX replacements_status_created_idx
  ON replacements (status, created_at, replacement_id);
CREATE INDEX replacements_employer_idx
  ON replacements (employer_id, replacement_id);
CREATE INDEX replacements_application_idx
  ON replacements (selected_application_id)
  WHERE selected_application_id IS NOT NULL;
CREATE INDEX replacements_candidate_idx
  ON replacements (selected_candidate_id, replacement_id)
  WHERE selected_candidate_id IS NOT NULL;

-- Les colonnes de lien existaient depuis 0003 sans FK, car le domaine n'était
-- pas encore persistant. NOT VALID conserve les anciennes lignes éventuelles,
-- tout en imposant les références aux nouveaux liens écrits par P0-REPLACEMENT.
ALTER TABLE contracts
  ADD CONSTRAINT contracts_replacement_id_fkey
  FOREIGN KEY (replacement_id) REFERENCES replacements (replacement_id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE contracts
  ADD CONSTRAINT contracts_replaced_contract_id_fkey
  FOREIGN KEY (replaced_contract_id) REFERENCES contracts (id)
  ON DELETE RESTRICT NOT VALID;

COMMIT;
