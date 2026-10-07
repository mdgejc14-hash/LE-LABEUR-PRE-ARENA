-- LE LABEUR — P0-WEBRTC — sessions métier et signaling éphémère.
--
-- Les sessions utilisateur restent celles de `sessions` (0001). Ce domaine
-- ajoute uniquement les sessions d'appel, liées à un contrat ACTIVE, ainsi
-- que les participants, messages de signalisation et credentials temporaires.
-- Aucun flux audio/vidéo, enregistrement, transcription ou document n'est stocké.
-- Les SDP/candidats ICE sont vidés à la fermeture/expiration; les métadonnées
-- sont purgées dès l'expiration initiale de la session par le Cron existant.
-- Aucune durée post-appel n'est inventée; aucune conservation permanente.
--
-- Aucun Durable Object, binding TURN, provider externe ou ressource Cloudflare
-- n'est créé par cette migration.

BEGIN;

CREATE TABLE webrtc_sessions (
  session_id               TEXT PRIMARY KEY,
  entity_type              TEXT NOT NULL CHECK (entity_type IN ('CONTRACT')),
  entity_id                TEXT NOT NULL REFERENCES contracts (id) ON DELETE RESTRICT,
  initiator_id             TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status                   TEXT NOT NULL
                           CHECK (status IN ('CREATED', 'CONNECTING', 'ACTIVE', 'CLOSED', 'EXPIRED', 'FAILED')),
  created_at               TIMESTAMPTZ NOT NULL,
  expires_at               TIMESTAMPTZ NOT NULL,
  closed_at                TIMESTAMPTZ,
  retention_until          TIMESTAMPTZ NOT NULL,
  next_message_sequence    BIGINT NOT NULL DEFAULT 0 CHECK (next_message_sequence >= 0),
  CONSTRAINT webrtc_session_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT webrtc_session_retention_after_expiry CHECK (retention_until >= expires_at),
  CONSTRAINT webrtc_session_terminal_timestamp CHECK (
    (status IN ('CREATED', 'CONNECTING', 'ACTIVE') AND closed_at IS NULL)
    OR (status IN ('CLOSED', 'EXPIRED', 'FAILED') AND closed_at IS NOT NULL)
  )
);

-- Un seul appel non terminal par contrat, même si les deux parties initient
-- simultanément. La contrainte PostgreSQL, et non un verrou applicatif seul,
-- arbitre la concurrence.
CREATE UNIQUE INDEX webrtc_one_live_session_per_contract_idx
  ON webrtc_sessions (entity_type, entity_id)
  WHERE status IN ('CREATED', 'CONNECTING', 'ACTIVE');
CREATE INDEX webrtc_sessions_expiry_idx
  ON webrtc_sessions (expires_at, session_id)
  WHERE status IN ('CREATED', 'CONNECTING', 'ACTIVE');
CREATE INDEX webrtc_sessions_retention_idx
  ON webrtc_sessions (retention_until, session_id)
  WHERE status IN ('CLOSED', 'EXPIRED', 'FAILED');

CREATE TABLE webrtc_session_participants (
  session_id         TEXT NOT NULL REFERENCES webrtc_sessions (session_id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  participant_role   TEXT NOT NULL CHECK (participant_role IN ('EMPLOYER', 'CANDIDATE')),
  invited_at         TIMESTAMPTZ NOT NULL,
  joined_at          TIMESTAMPTZ,
  PRIMARY KEY (session_id, user_id),
  CONSTRAINT webrtc_participant_join_after_invitation CHECK (joined_at IS NULL OR joined_at >= invited_at),
  CONSTRAINT webrtc_session_one_party_per_role UNIQUE (session_id, participant_role)
);
CREATE INDEX webrtc_participants_user_idx
  ON webrtc_session_participants (user_id, session_id);

CREATE TABLE webrtc_signaling_messages (
  message_id               TEXT PRIMARY KEY,
  session_id               TEXT NOT NULL REFERENCES webrtc_sessions (session_id) ON DELETE CASCADE,
  sequence                 BIGINT NOT NULL CHECK (sequence > 0),
  participant_id           TEXT NOT NULL,
  receiver_id              TEXT NOT NULL,
  message_type             TEXT NOT NULL
                           CHECK (message_type IN ('INVITATION', 'PARTICIPANT_JOINED', 'OFFER', 'ANSWER', 'ICE_CANDIDATE', 'TRANSPORT_CONNECTED', 'SESSION_CLOSED')),
  payload                  JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash             TEXT,
  client_message_key_hash  TEXT,
  created_at               TIMESTAMPTZ NOT NULL,
  payload_redacted_at      TIMESTAMPTZ,
  CONSTRAINT webrtc_message_sequence_unique UNIQUE (session_id, sequence),
  CONSTRAINT webrtc_message_sender_participant_fkey
    FOREIGN KEY (session_id, participant_id)
    REFERENCES webrtc_session_participants (session_id, user_id) ON DELETE CASCADE,
  CONSTRAINT webrtc_message_receiver_participant_fkey
    FOREIGN KEY (session_id, receiver_id)
    REFERENCES webrtc_session_participants (session_id, user_id) ON DELETE CASCADE,
  CONSTRAINT webrtc_message_distinct_parties CHECK (participant_id <> receiver_id)
);
CREATE UNIQUE INDEX webrtc_message_idempotency_unique_idx
  ON webrtc_signaling_messages (session_id, participant_id, client_message_key_hash)
  WHERE client_message_key_hash IS NOT NULL;
CREATE INDEX webrtc_messages_recipient_sequence_idx
  ON webrtc_signaling_messages (session_id, receiver_id, sequence);

CREATE TABLE webrtc_session_credentials (
  credential_id     TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  participant_id    TEXT NOT NULL,
  auth_session_id   TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL UNIQUE,
  issued_at         TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  CONSTRAINT webrtc_credential_expiry_after_issue CHECK (expires_at > issued_at),
  CONSTRAINT webrtc_credential_lifetime_max_5m CHECK (expires_at <= issued_at + INTERVAL '5 minutes'),
  CONSTRAINT webrtc_credential_session_participant_fkey
    FOREIGN KEY (session_id, participant_id)
    REFERENCES webrtc_session_participants (session_id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX webrtc_one_active_credential_per_party_session_idx
  ON webrtc_session_credentials (session_id, participant_id, auth_session_id)
  WHERE revoked_at IS NULL;
CREATE INDEX webrtc_credentials_expiry_idx
  ON webrtc_session_credentials (expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
