-- LE LABEUR — P0-R2 — DOCUMENTS & PREUVES (métadonnées, versions, liens, rétention).
--
-- Constat d'inspection (ce qui EXISTAIT, ce qui est RÉUTILISÉ, ce qui est CRÉÉ) :
--   * `src/backend/services/documents.ts` : port `ObjectStorage` DÉJÀ déclaré
--     (adaptateur de production prévu : Cloudflare R2). Cette tranche l'ÉTEND
--     (`get`/`head`) au lieu de créer une seconde infrastructure documentaire.
--   * Le catalogue de routes (`routeContracts.ts`) déclarait DÉJÀ
--     `documents.mine.list`, `documents.upload-grant`, `documents.signed-download`
--     et `admin.documents.list` — sans aucun handler (501). Ils sont implémentés.
--   * `automation_audit_ledger` (0006) : SEUL ledger d'audit du dépôt — réutilisé
--     pour chaque création, enregistrement de contenu, lien, téléchargement,
--     vérification d'intégrité et révocation. AUCUN second ledger d'audit.
--   * `automation_idempotency` (0006) : idempotence durable des commandes —
--     réutilisée telle quelle.
--   * `contracts` (0001/0003/0005) : signatures existantes (`employer_signed`,
--     `employee_signed`, dates) — le lien `ACCEPTANCE_PROOF` n'est accepté que si
--     la signature référencée EXISTE. Aucun mécanisme de signature n'est recréé :
--     le système de confirmation/OTP existant (P0-SALARY-1) n'est pas doublonné.
--   * `claims` / `claim_evidence_requests` (0011) : la référence de preuve
--     existante (`evidence_reference`, TEXT libre) n'est PAS réécrite ; les
--     documents R2 peuvent se lier aux claims sans modifier P0-DISPUTE-1.
--   * `permissions` / `role_permissions` / `user_permissions` (0001/0002) :
--     AUCUN nouveau code de permission. Lectures ADMIN : `documents:read:any`
--     (code existant) ; révocation ADMIN : `incidents:arbitrate` (précédent
--     P0-REPUTATION pour les corrections auditées).
--
-- Modèle (séparation stricte) :
--   * `documents`               : métadonnées du document logique (aucun octet) ;
--   * `document_versions`       : version adressée par contenu — clé d'objet
--     physique, empreinte SHA-256, taille réelle, provenance, statut ;
--   * `document_entity_links`   : relation version ↔ entité métier (contrat,
--     proposition, claim, remplacement, paiement, confirmation salariale,
--     utilisateur) — une acceptation reste rattachée à la VERSION EXACTE ;
--   * `document_retention_policies` : classe de conservation PAR TYPE de
--     document. AUCUNE durée n'est inventée : toutes les lignes sont semées
--     `PENDING_LEGAL_VALIDATION` avec `retention_days = NULL` ; une durée ne
--     peut exister que dans l'état `CONFIGURED`, signée et datée (validation
--     juridique ultérieure), et toute purge physique relève d'une tranche
--     ultérieure après validation — jamais de ce code.
--
-- Garanties portées par la BASE :
--   * `document_versions_number_uidx` : une version n'a qu'un numéro par
--     document — deux créations concurrentes ne peuvent aboutir au même
--     numéro (APPEND-ONLY : jamais d'écrasement silencieux) ;
--   * `document_versions_status_complete_check` : `PENDING_UPLOAD` n'a ni hash
--     ni taille ; `ACTIVE` a hash + taille + date d'enregistrement ; `REVOKED`
--     exige version enregistrée + auteur + date + motif (jamais silencieuse) ;
--   * `document_versions_hash_format_check` : empreinte SHA-256 hexadécimale ;
--   * `document_entity_links_acceptance_check` : un lien `ACCEPTANCE_PROOF`
--     exige le signataire ET la date d'acceptation ;
--   * `document_entity_links_dedupe_uidx` : un même lien logique ne peut pas
--     être inséré deux fois, même sous concurrence (idempotence) ;
--   * `document_retention_duration_check` : aucune durée tant que la validation
--     juridique n'a pas eu lieu (aucune durée globale inventée) ;
--   * aucune suppression : `ON DELETE RESTRICT` partout — les preuves ne
--     disparaissent pas avec un compte.
--
-- Neutralité juridique : l'attestation est une « Attestation électronique de
-- traçabilité » applicative — le système ne la présente jamais comme un
-- justificatif d'un régime bancaire ou salarial, comme un dispositif
-- d'horodatage d'un niveau qualifié, ni comme une garantie de valeur probante
-- supérieure délivrée par un tiers. Cette table ne contient AUCUNE logique
-- financière (le modèle reste : Prix Prestataire + Frais SaaS LE LABEUR =
-- Coût Client).
--
-- Migration AVANT uniquement : aucune donnée existante n'est migrée, modifiée
-- ou supprimée ; aucune migration antérieure n'est réécrite.

BEGIN;

-- 1. Politiques de conservation, une ligne PAR TYPE de document. Le seed pose
--    la classification, jamais les durées (validation juridique requise).
CREATE TABLE document_retention_policies (
  document_type          TEXT PRIMARY KEY
                         CHECK (document_type IN (
                           'CONTRACT_DOCUMENT', 'ACCEPTANCE_PROOF',
                           'MISSION_JUSTIFICATION', 'EXECUTION_PROOF',
                           'WORKFLOW_SUPPORT', 'TRACEABILITY_ATTESTATION',
                           'VERIFICATION_DOCUMENT', 'TEMPORARY'
                         )),
  retention_class        TEXT NOT NULL
                         CHECK (retention_class IN (
                           'CONTRACTUAL', 'TRACEABILITY', 'MISSION',
                           'VERIFICATION', 'TEMPORARY'
                         )),
  retention_days         INTEGER
                         CHECK (retention_days IS NULL
                                OR (retention_days > 0 AND retention_days <= 36500)),
  duration_status        TEXT NOT NULL DEFAULT 'PENDING_LEGAL_VALIDATION'
                         CHECK (duration_status IN ('PENDING_LEGAL_VALIDATION', 'CONFIGURED')),
  configured_by          TEXT,
  configured_at          TIMESTAMPTZ,
  notes                  TEXT,
  CONSTRAINT document_retention_duration_check CHECK (
    (duration_status = 'PENDING_LEGAL_VALIDATION'
      AND retention_days IS NULL AND configured_by IS NULL AND configured_at IS NULL)
    OR (duration_status = 'CONFIGURED'
      AND retention_days IS NOT NULL
      AND configured_by IS NOT NULL AND configured_at IS NOT NULL)
  )
);

INSERT INTO document_retention_policies (document_type, retention_class, notes) VALUES
  ('CONTRACT_DOCUMENT',       'CONTRACTUAL',  'Contrat / version de contrat : durée à fixer après validation juridique.'),
  ('ACCEPTANCE_PROOF',        'CONTRACTUAL',  'Preuve d''acceptation rattachée à la version exacte : même régime que le contrat.'),
  ('TRACEABILITY_ATTESTATION','TRACEABILITY', 'Attestation électronique de traçabilité : durée à fixer après validation juridique.'),
  ('MISSION_JUSTIFICATION',   'MISSION',      'Justificatif associé à une mission : durée à fixer après validation juridique.'),
  ('EXECUTION_PROOF',         'MISSION',      'Preuve d''exécution : durée à fixer après validation juridique.'),
  ('WORKFLOW_SUPPORT',        'MISSION',      'Pièce documentaire d''un workflow existant : durée à fixer après validation juridique.'),
  ('VERIFICATION_DOCUMENT',   'VERIFICATION', 'Document de vérification à finalité déclarée : accès restreint, durée à fixer.'),
  ('TEMPORARY',               'TEMPORARY',    'Document temporaire : durée à fixer après validation juridique.');

-- 2. Métadonnées du document logique (aucun contenu binaire : l'objet physique
--    vit dans le stockage objet — adaptateur R2, port `ObjectStorage`).
CREATE TABLE documents (
  document_id            TEXT PRIMARY KEY,
  owner_user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title                  TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  file_name              TEXT NOT NULL
                         CHECK (length(file_name) BETWEEN 1 AND 150
                                AND file_name ~ '^[^/\\:*?"<>|]+$'),
  document_type          TEXT NOT NULL REFERENCES document_retention_policies (document_type),
  -- Finalité / justification : obligatoire côté application pour tout document
  -- sensible (VERIFICATION_DOCUMENT) ; bornée ici.
  purpose_note           TEXT CHECK (purpose_note IS NULL OR length(btrim(purpose_note)) BETWEEN 3 AND 500),
  retention_class        TEXT NOT NULL
                         CHECK (retention_class IN (
                           'CONTRACTUAL', 'TRACEABILITY', 'MISSION',
                           'VERIFICATION', 'TEMPORARY'
                         )),
  status                 TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  -- Plus haute version ENREGISTRÉE (contenu reçu) ; 0 = aucun contenu reçu.
  current_version_number INTEGER NOT NULL DEFAULT 0 CHECK (current_version_number >= 0),
  history                JSONB NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_typeof(history) = 'array'),
  created_at             TIMESTAMPTZ NOT NULL,
  created_by             TEXT NOT NULL,
  revoked_at             TIMESTAMPTZ,
  revoked_by             TEXT,
  revocation_reason      TEXT,
  CONSTRAINT documents_revocation_complete_check CHECK (
    (status = 'ACTIVE'
      AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (status = 'REVOKED'
      AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND length(btrim(revocation_reason)) BETWEEN 3 AND 1000)
  )
);

CREATE INDEX documents_owner_idx
  ON documents (owner_user_id, created_at DESC, document_id ASC);

CREATE INDEX documents_status_idx
  ON documents (status, document_type);

CREATE INDEX documents_created_idx
  ON documents (created_at DESC, document_id ASC);

-- 3. Versions : chaque modification de contenu crée une NOUVELLE ligne ; une
--    version existante n'est jamais écrasée (immutabilité du contenu).
CREATE TABLE document_versions (
  version_id             TEXT PRIMARY KEY,
  document_id            TEXT NOT NULL REFERENCES documents (document_id) ON DELETE RESTRICT,
  version_number         INTEGER NOT NULL CHECK (version_number >= 1),
  -- Clé d'objet physique, générée par le serveur (jamais reçue du client) :
  -- segmentée, sans '..', sans caractère d'échappement, non devinable (UUID).
  object_key             TEXT NOT NULL
                         CHECK (length(object_key) BETWEEN 1 AND 512
                                AND object_key ~ '^[A-Za-z0-9][A-Za-z0-9/_-]*$'
                                AND object_key NOT LIKE '%..%'),
  content_type           TEXT NOT NULL
                         CHECK (content_type IN (
                           'application/pdf', 'image/jpeg',
                           'image/png', 'image/webp'
                         )),
  -- Taille déclarée au grant (attendue à l'octet près à l'enregistrement).
  declared_size_bytes    INTEGER NOT NULL
                         CHECK (declared_size_bytes > 0 AND declared_size_bytes <= 26214400),
  -- Taille RÉELLE mesurée au dépôt ; NULL tant que le contenu n'est pas reçu.
  size_bytes             INTEGER CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 26214400)),
  cryptographic_hash     TEXT CHECK (cryptographic_hash IS NULL OR cryptographic_hash ~ '^[0-9a-f]{64}$'),
  hash_algorithm         TEXT NOT NULL DEFAULT 'SHA-256' CHECK (hash_algorithm = 'SHA-256'),
  provenance             TEXT NOT NULL DEFAULT 'USER_UPLOAD'
                         CHECK (provenance IN ('USER_UPLOAD', 'SYSTEM_EXPORT')),
  status                 TEXT NOT NULL DEFAULT 'PENDING_UPLOAD'
                         CHECK (status IN ('PENDING_UPLOAD', 'ACTIVE', 'REVOKED')),
  created_at             TIMESTAMPTZ NOT NULL,
  created_by             TEXT NOT NULL,
  registered_at          TIMESTAMPTZ,
  revoked_at             TIMESTAMPTZ,
  revoked_by             TEXT,
  revocation_reason      TEXT,
  CONSTRAINT document_versions_status_complete_check CHECK (
    (status = 'PENDING_UPLOAD'
      AND size_bytes IS NULL AND cryptographic_hash IS NULL AND registered_at IS NULL
      AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (status = 'ACTIVE'
      AND size_bytes IS NOT NULL AND cryptographic_hash IS NOT NULL AND registered_at IS NOT NULL
      AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (status = 'REVOKED'
      AND size_bytes IS NOT NULL AND cryptographic_hash IS NOT NULL AND registered_at IS NOT NULL
      AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND length(btrim(revocation_reason)) BETWEEN 3 AND 1000)
  )
);

-- Une seule version N par document, même sous concurrence.
CREATE UNIQUE INDEX document_versions_number_uidx
  ON document_versions (document_id, version_number);

-- Une clé d'objet physique ne désigne qu'une version (adressage par contenu).
CREATE UNIQUE INDEX document_versions_object_key_uidx
  ON document_versions (object_key);

-- Cohérence document-version pour la clé étrangère composée des liens.
CREATE UNIQUE INDEX document_versions_id_document_uidx
  ON document_versions (version_id, document_id);

CREATE INDEX document_versions_document_idx
  ON document_versions (document_id, version_number DESC, version_id ASC);

-- 4. Liens version ↔ entité métier. Une acceptation/signature reste attachée à
--    la VERSION EXACTE (hash présent) — une nouvelle version ne déplace jamais
--    les liens existants (référençabilité historique garantie).
CREATE TABLE document_entity_links (
  link_id                TEXT PRIMARY KEY,
  document_id            TEXT NOT NULL,
  document_version_id    TEXT NOT NULL,
  -- Clé composée : le lien ne peut pas désigner une version d'un AUTRE document.
  FOREIGN KEY (document_version_id, document_id)
    REFERENCES document_versions (version_id, document_id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES documents (document_id) ON DELETE RESTRICT,
  entity_type            TEXT NOT NULL
                         CHECK (entity_type IN (
                           'CONTRACT', 'PROPOSAL', 'CLAIM', 'REPLACEMENT',
                           'PAYMENT', 'SALARY_CONFIRMATION', 'USER'
                         )),
  entity_id              TEXT NOT NULL,
  link_purpose           TEXT NOT NULL
                         CHECK (link_purpose IN (
                           'CONTRACT_VERSION', 'ACCEPTANCE_PROOF',
                           'EXECUTION_PROOF', 'JUSTIFICATION', 'EVIDENCE',
                           'ATTESTATION', 'VERIFICATION', 'SUPPORTING'
                         )),
  -- Pour ACCEPTANCE_PROOF : signataire réel (partie du contrat) et date de son
  -- acceptation EXISTANTE (vérifiée contre la signature du contrat).
  related_actor_id       TEXT,
  related_event_ref      TEXT,
  accepted_at            TIMESTAMPTZ,
  note                   TEXT CHECK (note IS NULL OR length(btrim(note)) BETWEEN 3 AND 500),
  created_at             TIMESTAMPTZ NOT NULL,
  created_by             TEXT NOT NULL,
  CONSTRAINT document_entity_links_acceptance_check CHECK (
    (link_purpose = 'ACCEPTANCE_PROOF'
      AND related_actor_id IS NOT NULL AND accepted_at IS NOT NULL)
    OR (link_purpose <> 'ACCEPTANCE_PROOF' AND accepted_at IS NULL)
  )
);

-- Un même lien logique = une ligne, même sous concurrence (idempotence) :
--  - hors acceptation : unicité sur (version, entité, finalité) ;
--  - acceptation : unicité PAR SIGNATAIRE (les deux signatures d'un même
--    contrat sont deux preuves distinctes rattachées à la même version).
CREATE UNIQUE INDEX document_entity_links_dedupe_uidx
  ON document_entity_links (document_version_id, entity_type, entity_id, link_purpose)
  WHERE link_purpose <> 'ACCEPTANCE_PROOF';

CREATE UNIQUE INDEX document_entity_links_acceptance_uidx
  ON document_entity_links (document_version_id, entity_type, entity_id, link_purpose, related_actor_id)
  WHERE link_purpose = 'ACCEPTANCE_PROOF';

CREATE INDEX document_entity_links_document_idx
  ON document_entity_links (document_id, created_at DESC, link_id ASC);

CREATE INDEX document_entity_links_version_idx
  ON document_entity_links (document_version_id, link_id ASC);

CREATE INDEX document_entity_links_entity_idx
  ON document_entity_links (entity_type, entity_id, link_purpose);

COMMIT;
