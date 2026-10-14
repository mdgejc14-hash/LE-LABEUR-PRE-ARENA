-- LE LABEUR — P0-NOTIFICATIONS — couche de NOTIFICATION (In-App / Push / Email).
--
-- Additive uniquement : cette migration ne modifie AUCUNE table des tranches
-- précédentes. L'Outbox, les jobs, les échéances, l'idempotence durable et le
-- ledger d'audit restent ceux de 0006/0007 ; le cycle paiement, le salaire et
-- les claims restent ceux de 0008/0009/0010/0011.
--
-- Une SEULE table est créée : la boîte In-App, canal PRIORITAIRE de l'ordre
-- In-App → Push → Email. Aucune table de fournisseur Push, d'email, de SMS, de
-- WhatsApp, de jeton d'appareil, de webhook ou de secret n'est créée : les
-- canaux Push et Email restent des ABSTRACTIONS côté code, sans provider réel,
-- sans secret et sans configuration de production.

BEGIN;

CREATE TABLE notifications (
  id                TEXT PRIMARY KEY,
  -- Le destinataire est TOUJOURS un compte réel : aucune diffusion anonyme,
  -- aucun « broadcast ». La FK est la garantie que la cible existe.
  recipient_id      TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  recipient_role    TEXT NOT NULL
                    CHECK (recipient_role IN ('CANDIDATE', 'EMPLOYER', 'ADMIN')),
  -- `NotificationType` réel du modèle (`src/types/index.ts`) : jamais inventé.
  type              TEXT NOT NULL,
  title             TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  message           TEXT NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 1000),
  -- `linkRef` du modèle (`{ screen, id }`), facultatif.
  link_screen       TEXT,
  link_id           TEXT,
  -- Événement métier SOURCE : traçabilité de bout en bout (Outbox → notification).
  source_event_id   TEXT,
  source_event_type TEXT,
  aggregate_type    TEXT,
  aggregate_id      TEXT,
  -- Charge utile structurée (identifiants métier), jamais un secret.
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb
                    CHECK (jsonb_typeof(payload) = 'object'),
  -- Clé d'idempotence durable : un rejeu du MÊME événement logique pour le MÊME
  -- destinataire ne produit jamais une seconde ligne (index unique ci-dessous).
  dedupe_key        TEXT NOT NULL CHECK (length(btrim(dedupe_key)) BETWEEN 1 AND 300),
  -- Statut lu / non lu (modèle `AppNotification.isRead`).
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  read_at           TIMESTAMPTZ,
  -- État RÉEL du canal externe. `NOT_AVAILABLE` est la valeur par défaut tant
  -- qu'aucun provider n'est injecté : jamais de faux « envoyé ».
  push_status       TEXT NOT NULL DEFAULT 'NOT_AVAILABLE'
                    CHECK (push_status IN ('NOT_AVAILABLE', 'DELIVERED', 'FAILED')),
  email_status      TEXT NOT NULL DEFAULT 'NOT_AVAILABLE'
                    CHECK (email_status IN ('NOT_AVAILABLE', 'DELIVERED', 'FAILED')),
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL,
  CONSTRAINT notifications_read_state_complete CHECK (
    (is_read AND read_at IS NOT NULL)
    OR ((NOT is_read) AND read_at IS NULL)
  ),
  CONSTRAINT notifications_link_complete CHECK (
    (link_screen IS NULL AND link_id IS NULL)
    OR (link_screen IS NOT NULL AND length(btrim(link_screen)) > 0)
  )
);

-- Idempotence : c'est la CONTRAINTE PostgreSQL qui tranche deux créations
-- concurrentes, jamais un verrou applicatif ajouté.
CREATE UNIQUE INDEX notifications_recipient_dedupe_unique_idx
  ON notifications (recipient_id, dedupe_key);

-- Lecture « mes notifications », ordre stable (created_at DESC, id ASC).
CREATE INDEX notifications_recipient_created_idx
  ON notifications (recipient_id, created_at DESC, id ASC);

-- Compteur / liste des non lues.
CREATE INDEX notifications_recipient_unread_idx
  ON notifications (recipient_id, created_at DESC, id ASC)
  WHERE is_read = FALSE;

-- Traçabilité inverse : retrouver les notifications issues d'un événement.
CREATE INDEX notifications_source_event_idx
  ON notifications (source_event_id)
  WHERE source_event_id IS NOT NULL;

-- Vue ADMIN (permission `notifications:read:any`), même ordre stable.
CREATE INDEX notifications_admin_created_idx
  ON notifications (created_at DESC, id ASC);

COMMIT;
