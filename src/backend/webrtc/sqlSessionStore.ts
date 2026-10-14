import type { SqlQueryExecutor } from '../services/database';
import type { WebRtcSessionStore } from './records';
import type {
  WebRtcCredentialRecord,
  WebRtcParticipantRecord,
  WebRtcSessionRecord,
  WebRtcSignalingMessageRecord,
} from './records';
import type { WebRtcEntityType, WebRtcParticipantRole, WebRtcSessionStatus, WebRtcSignalingMessageType } from '../productionContracts';

interface SessionRow {
  session_id: string;
  entity_type: WebRtcEntityType;
  entity_id: string;
  initiator_id: string;
  status: WebRtcSessionStatus;
  created_at: string | Date;
  expires_at: string | Date;
  closed_at: string | Date | null;
  retention_until: string | Date;
  next_message_sequence: number | string;
}
interface ParticipantRow {
  session_id: string;
  user_id: string;
  participant_role: WebRtcParticipantRole;
  invited_at: string | Date;
  joined_at: string | Date | null;
}
interface MessageRow {
  message_id: string;
  session_id: string;
  sequence: number | string;
  participant_id: string;
  receiver_id: string;
  message_type: WebRtcSignalingMessageType;
  payload: Record<string, unknown> | string;
  payload_hash: string | null;
  client_message_key_hash: string | null;
  created_at: string | Date;
  payload_redacted_at: string | Date | null;
}
interface CredentialRow {
  credential_id: string;
  session_id: string;
  participant_id: string;
  auth_session_id: string;
  token_hash: string;
  issued_at: string | Date;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function parsePayload(value: Record<string, unknown> | string): Record<string, unknown> {
  const payload = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}
function toSession(row: SessionRow): WebRtcSessionRecord {
  return {
    sessionId: row.session_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    initiatorId: row.initiator_id,
    status: row.status,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    ...(row.closed_at ? { closedAt: toIso(row.closed_at) } : {}),
    retentionUntil: toIso(row.retention_until),
    nextMessageSequence: Number(row.next_message_sequence),
  };
}
function toParticipant(row: ParticipantRow): WebRtcParticipantRecord {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    role: row.participant_role,
    invitedAt: toIso(row.invited_at),
    ...(row.joined_at ? { joinedAt: toIso(row.joined_at) } : {}),
  };
}
function toMessage(row: MessageRow): WebRtcSignalingMessageRecord {
  return {
    messageId: row.message_id,
    sessionId: row.session_id,
    sequence: Number(row.sequence),
    participantId: row.participant_id,
    receiverId: row.receiver_id,
    type: row.message_type,
    payload: parsePayload(row.payload),
    ...(row.payload_hash ? { payloadHash: row.payload_hash } : {}),
    ...(row.client_message_key_hash ? { clientMessageKeyHash: row.client_message_key_hash } : {}),
    createdAt: toIso(row.created_at),
    ...(row.payload_redacted_at ? { payloadRedactedAt: toIso(row.payload_redacted_at) } : {}),
  };
}
function toCredential(row: CredentialRow): WebRtcCredentialRecord {
  return {
    credentialId: row.credential_id,
    sessionId: row.session_id,
    participantId: row.participant_id,
    authSessionId: row.auth_session_id,
    tokenHash: row.token_hash,
    issuedAt: toIso(row.issued_at),
    expiresAt: toIso(row.expires_at),
    ...(row.revoked_at ? { revokedAt: toIso(row.revoked_at) } : {}),
  };
}
const SESSION_COLUMNS = `session_id, entity_type, entity_id, initiator_id, status,
  created_at, expires_at, closed_at, retention_until, next_message_sequence`;
const MESSAGE_COLUMNS = `message_id, session_id, sequence, participant_id, receiver_id,
  message_type, payload, payload_hash, client_message_key_hash, created_at, payload_redacted_at`;
const CREDENTIAL_COLUMNS = `credential_id, session_id, participant_id, auth_session_id,
  token_hash, issued_at, expires_at, revoked_at`;

/** PostgreSQL adapter; caller supplies the root connection or current transaction. */
export function createSqlWebRtcSessionStore(db: SqlQueryExecutor): WebRtcSessionStore {
  return {
    async findSession(sessionId) {
      const result = await db.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM webrtc_sessions WHERE session_id = $1`, [sessionId]);
      return result.rows[0] ? toSession(result.rows[0]) : null;
    },
    async findSessionForUpdate(sessionId) {
      const result = await db.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM webrtc_sessions WHERE session_id = $1 FOR UPDATE`, [sessionId]);
      return result.rows[0] ? toSession(result.rows[0]) : null;
    },
    async findLiveSessionForEntity(entityType, entityId) {
      const result = await db.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM webrtc_sessions
          WHERE entity_type = $1 AND entity_id = $2
            AND status IN ('CREATED', 'CONNECTING', 'ACTIVE')
          ORDER BY created_at DESC, session_id DESC LIMIT 1`,
        [entityType, entityId],
      );
      return result.rows[0] ? toSession(result.rows[0]) : null;
    },
    async listForParticipant(userId, limit, afterId) {
      const result = await db.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS}
           FROM webrtc_sessions s
          WHERE EXISTS (
            SELECT 1 FROM webrtc_session_participants p
             WHERE p.session_id = s.session_id AND p.user_id = $1
          )
            AND ($3::text IS NULL OR (s.created_at, s.session_id) < (
              SELECT cursor.created_at, cursor.session_id FROM webrtc_sessions cursor WHERE cursor.session_id = $3
            ))
          ORDER BY s.created_at DESC, s.session_id DESC
          LIMIT $2`,
        [userId, limit, afterId ?? null],
      );
      return result.rows.map(toSession);
    },
    async listParticipants(sessionId) {
      const result = await db.query<ParticipantRow>(
        `SELECT session_id, user_id, participant_role, invited_at, joined_at
           FROM webrtc_session_participants WHERE session_id = $1 ORDER BY participant_role, user_id`,
        [sessionId],
      );
      return result.rows.map(toParticipant);
    },
    async findParticipant(sessionId, userId) {
      const result = await db.query<ParticipantRow>(
        `SELECT session_id, user_id, participant_role, invited_at, joined_at
           FROM webrtc_session_participants WHERE session_id = $1 AND user_id = $2`,
        [sessionId, userId],
      );
      return result.rows[0] ? toParticipant(result.rows[0]) : null;
    },
    async createSession(record) {
      const result = await db.query<SessionRow>(
        `INSERT INTO webrtc_sessions (
           session_id, entity_type, entity_id, initiator_id, status,
           created_at, expires_at, closed_at, retention_until, next_message_sequence
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${SESSION_COLUMNS}`,
        [record.sessionId, record.entityType, record.entityId, record.initiatorId, record.status,
          record.createdAt, record.expiresAt, record.closedAt ?? null, record.retentionUntil, record.nextMessageSequence],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné la session WebRTC créée.');
      return toSession(result.rows[0]);
    },
    async createParticipant(record) {
      const result = await db.query<ParticipantRow>(
        `INSERT INTO webrtc_session_participants (session_id, user_id, participant_role, invited_at, joined_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING session_id, user_id, participant_role, invited_at, joined_at`,
        [record.sessionId, record.userId, record.role, record.invitedAt, record.joinedAt ?? null],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné le participant WebRTC créé.');
      return toParticipant(result.rows[0]);
    },
    async markParticipantJoined(sessionId, userId, at) {
      const result = await db.query<ParticipantRow>(
        `UPDATE webrtc_session_participants SET joined_at = $3
          WHERE session_id = $1 AND user_id = $2 AND joined_at IS NULL
          RETURNING session_id, user_id, participant_role, invited_at, joined_at`,
        [sessionId, userId, at],
      );
      return result.rows[0] ? toParticipant(result.rows[0]) : this.findParticipant(sessionId, userId);
    },
    async transitionStatus(input) {
      const result = await db.query<SessionRow>(
        `UPDATE webrtc_sessions
            SET status = $3,
                closed_at = CASE WHEN $3 IN ('CLOSED', 'EXPIRED', 'FAILED') THEN $4::timestamptz ELSE NULL END,
                retention_until = COALESCE($5::timestamptz, retention_until)
          WHERE session_id = $1 AND status = ANY($2::text[])
          RETURNING ${SESSION_COLUMNS}`,
        [input.sessionId, input.expected, input.status, input.at, input.retentionUntil ?? null],
      );
      return result.rows[0] ? toSession(result.rows[0]) : null;
    },
    async hasMessageType(sessionId, type) {
      const result = await db.query<{ present: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM webrtc_signaling_messages WHERE session_id = $1 AND message_type = $2) AS present`,
        [sessionId, type],
      );
      return result.rows[0]?.present ?? false;
    },
    async hasMessageFromParticipant(sessionId, type, participantId) {
      const result = await db.query<{ present: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM webrtc_signaling_messages
            WHERE session_id = $1 AND message_type = $2 AND participant_id = $3
         ) AS present`,
        [sessionId, type, participantId],
      );
      return result.rows[0]?.present ?? false;
    },
    async findMessageByClientKey(sessionId, participantId, keyHash) {
      const result = await db.query<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS} FROM webrtc_signaling_messages
          WHERE session_id = $1 AND participant_id = $2 AND client_message_key_hash = $3`,
        [sessionId, participantId, keyHash],
      );
      return result.rows[0] ? toMessage(result.rows[0]) : null;
    },
    async appendMessage(record) {
      // Sequence allocation is a single UPDATE. A transaction caller locks the
      // parent row before reaching this method, so concurrent messages serialize.
      const allocated = await db.query<{ next_message_sequence: number | string }>(
        `UPDATE webrtc_sessions SET next_message_sequence = next_message_sequence + 1
          WHERE session_id = $1 RETURNING next_message_sequence`,
        [record.sessionId],
      );
      const sequence = Number(allocated.rows[0]?.next_message_sequence);
      if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error('Séquence de signalisation indisponible.');
      const result = await db.query<MessageRow>(
        `INSERT INTO webrtc_signaling_messages (
           message_id, session_id, sequence, participant_id, receiver_id, message_type,
           payload, payload_hash, client_message_key_hash, created_at, payload_redacted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         RETURNING ${MESSAGE_COLUMNS}`,
        [record.messageId, record.sessionId, sequence, record.participantId, record.receiverId,
          record.type, JSON.stringify(record.payload), record.payloadHash ?? null,
          record.clientMessageKeyHash ?? null, record.createdAt, record.payloadRedactedAt ?? null],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné le message WebRTC créé.');
      return toMessage(result.rows[0]);
    },
    async listMessagesForRecipient(input) {
      const result = await db.query<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS} FROM webrtc_signaling_messages
          WHERE session_id = $1 AND receiver_id = $2 AND sequence > $3
          ORDER BY sequence ASC LIMIT $4`,
        [input.sessionId, input.receiverId, input.afterSequence, input.limit],
      );
      return result.rows.map(toMessage);
    },
    async redactSignalingPayloads(sessionId, at) {
      const result = await db.query(
        `UPDATE webrtc_signaling_messages SET payload = '{}'::jsonb, payload_redacted_at = $2
          WHERE session_id = $1 AND payload_redacted_at IS NULL`,
        [sessionId, at],
      );
      return result.rowCount;
    },
    async revokeCredentialsForParticipant(sessionId, participantId, at) {
      const result = await db.query(
        `UPDATE webrtc_session_credentials SET revoked_at = COALESCE(revoked_at, $3)
          WHERE session_id = $1 AND participant_id = $2 AND revoked_at IS NULL`,
        [sessionId, participantId, at],
      );
      return result.rowCount;
    },
    async revokeCredentialsForSession(sessionId, at) {
      const result = await db.query(
        `UPDATE webrtc_session_credentials SET revoked_at = COALESCE(revoked_at, $2)
          WHERE session_id = $1 AND revoked_at IS NULL`,
        [sessionId, at],
      );
      return result.rowCount;
    },
    async createCredential(record) {
      const result = await db.query<CredentialRow>(
        `INSERT INTO webrtc_session_credentials (
           credential_id, session_id, participant_id, auth_session_id, token_hash, issued_at, expires_at, revoked_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${CREDENTIAL_COLUMNS}`,
        [record.credentialId, record.sessionId, record.participantId, record.authSessionId,
          record.tokenHash, record.issuedAt, record.expiresAt, record.revokedAt ?? null],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné le credential WebRTC créé.');
      return toCredential(result.rows[0]);
    },
    async findCredentialByHash(tokenHash) {
      const result = await db.query<CredentialRow>(
        `SELECT ${CREDENTIAL_COLUMNS} FROM webrtc_session_credentials WHERE token_hash = $1`, [tokenHash],
      );
      return result.rows[0] ? toCredential(result.rows[0]) : null;
    },
    async isAuthenticationSessionActive(authSessionId, userId, at) {
      const result = await db.query<{ active: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM sessions
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > $3
         ) AS active`,
        [authSessionId, userId, at],
      );
      return result.rows[0]?.active ?? false;
    },
    async listLiveDue(input) {
      const result = await db.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM webrtc_sessions
          WHERE status IN ('CREATED', 'CONNECTING', 'ACTIVE') AND expires_at <= $1
          ORDER BY expires_at, session_id LIMIT $2`,
        [input.at, input.limit],
      );
      return result.rows.map(toSession);
    },
    async listRetentionDue(input) {
      const result = await db.query<SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM webrtc_sessions
          WHERE status IN ('CLOSED', 'EXPIRED', 'FAILED') AND retention_until <= $1
          ORDER BY retention_until, session_id LIMIT $2`,
        [input.at, input.limit],
      );
      return result.rows.map(toSession);
    },
    async deleteSessions(sessionIds) {
      if (sessionIds.length === 0) return 0;
      const result = await db.query(
        `DELETE FROM webrtc_sessions
          WHERE session_id = ANY($1::text[]) AND status IN ('CLOSED', 'EXPIRED', 'FAILED')`,
        [sessionIds],
      );
      return result.rowCount;
    },
  };
}
