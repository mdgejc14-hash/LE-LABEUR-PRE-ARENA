-- LE LABEUR — P0-F — CYCLE DE VIE DU CONTRAT.
--
-- Périmètre : la table `contracts` seule, alignée sur le modèle réel
--   * types du domaine : src/types/index.ts (Contract, ContractStatus) ;
--   * règles métier   : MockRepository.generateContract / signContract /
--                       dissociateMonth2 (src/repositories/mockRepository.ts) ;
--   * contrats SQL    : src/backend/persistence/sqlCoreStores.ts
--                       (createSqlContractStore).
--
-- Aucun domaine nouveau n'est ouvert (paiements, commissions, incidents,
-- remplacements, notifications), aucun statut n'est ajouté ni retiré : la
-- contrainte `contracts_status_domain` de 0003 reste la référence.
--
-- Cette migration n'ajoute que ce qui manque au cycle CONTRAT réel :
--   1. `proposal_id` — lien explicite proposition ACCEPTED → contrat, avec
--      UNICITÉ (une proposition ne peut produire qu'un seul contrat) ;
--   2. une unicité partielle interdisant deux contrats NON terminaux pour le
--      même couple (offre, candidat) — c'est l'anti-doublon déjà appliqué par
--      `MockRepository.generateContract` (« Une candidature ou mission est déjà
--      associée à un contrat non terminé ») ;
--   3. l'index de lecture `contracts.application_id`.
--
-- Aucune donnée n'est migrée ni supprimée : migration AVANT uniquement.
-- PRÉPARÉE : aucune base n'est provisionnée ni migrée par cette phase.

BEGIN;

-- 1. Lien proposition → contrat (le identifiant de proposition est optionnel :
--    les contrats DEMO/historiques n'en possèdent pas).
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS proposal_id TEXT REFERENCES proposals (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_proposal_unique_idx
  ON contracts (proposal_id)
  WHERE proposal_id IS NOT NULL;

-- 2. Anti-doublon réel : un seul contrat NON terminal par (offre, candidat).
--    Un contrat TERMINATED / COMPLETED / REPLACED libère la place (cas du
--    remplacement et de la reprise), conformément au modèle réel.
CREATE UNIQUE INDEX IF NOT EXISTS contracts_offer_candidate_open_unique_idx
  ON contracts (offer_id, candidate_id)
  WHERE status NOT IN ('TERMINATED', 'COMPLETED', 'REPLACED');

-- 3. Lecture par candidature (le lien `applications.contract_id` de 0003 reste
--    la référence inverse).
CREATE INDEX IF NOT EXISTS contracts_application_idx ON contracts (application_id);

-- 4. Alignement réel des dates du contrat sur le modèle du domaine.
--    `Contract.startDate` / `endDate` (src/types/index.ts) sont des libellés
--    affichés tels quels (« 01 Novembre 2026 »), exactement comme
--    `proposals.start_date` / `end_date` (0004, TEXT), et c'est cette valeur
--    acceptée dans la proposition qui doit être conservée dans le contrat :
--    la conversion DATE → TEXT ne perd aucune donnée (`USING …::text`) et
--    conserve la contrainte NOT NULL existante.
ALTER TABLE contracts ALTER COLUMN start_date TYPE TEXT USING start_date::text;
ALTER TABLE contracts ALTER COLUMN end_date TYPE TEXT USING end_date::text;

COMMIT;
