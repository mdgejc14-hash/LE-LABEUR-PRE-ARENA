/**
 * Adaptateur PostgreSQL de l'identité (PRÉPARÉ, NON BRANCHÉ).
 *
 * Ce module ne crée aucune connexion : il attend une implémentation de
 * `PostgreSqlDatabase` (Cloudflare Hyperdrive côté Worker). Tant qu'aucune
 * connexion n'est fournie, le Worker reste en mode fermé ou en mode mémoire.
 * Les requêtes ci-dessous correspondent aux migrations de `migrations/`.
 */

import type { PostgreSqlDatabase } from '../services/database';
import { hashSessionToken, newEntityId } from './ids';
import type {
  ExternalIdentityRecord,
  ExternalIdentityStore,
  IdentityStores,
  ServerUserRecord,
  SessionRecord,
  SessionStore,
  UserStore,
} from './stores';

interface UserRow {
  id: string;
  role: ServerUserRecord['role'];
  status: ServerUserRecord['status'];
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

function toUser(row: UserRow): ServerUserRecord {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    email: row.email,
    displayName: row.display_name,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function createSqlUserStore(db: PostgreSqlDatabase): UserStore {
  return {
    async findById(userId) {
      const result = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
      return result.rows[0] ? toUser(result.rows[0]) : null;
    },
    async findByEmail(email) {
      const result = await db.query<UserRow>('SELECT * FROM users WHERE email = lower($1)', [email]);
      return result.rows[0] ? toUser(result.rows[0]) : null;
    },
    async create(input) {
      const result = await db.query<UserRow>(
        `INSERT INTO users (id, role, status, email, display_name, avatar_url)
         VALUES ($1, $2, $3, lower($4), $5, $6)
         RETURNING *`,
        [input.id, input.role, input.status, input.email, input.displayName, input.avatarUrl ?? null],
      );
      return toUser(result.rows[0]);
    },
    async list(limit) {
      const result = await db.query<UserRow>('SELECT * FROM users ORDER BY created_at DESC LIMIT $1', [limit]);
      return result.rows.map(toUser);
    },
  };
}

export function createSqlExternalIdentityStore(db: PostgreSqlDatabase): ExternalIdentityStore {
  return {
    async findByExternalSubject(provider, subject) {
      const result = await db.query<{
        id: string; user_id: string; provider: 'GOOGLE'; subject: string; verified_email: string; linked_at: string;
      }>('SELECT * FROM external_identities WHERE provider = $1 AND subject = $2', [provider, subject]);
      const row = result.rows[0];
      return row
        ? {
          id: row.id,
          userId: row.user_id,
          provider: row.provider,
          subject: row.subject,
          verifiedEmail: row.verified_email,
          linkedAt: new Date(row.linked_at).toISOString(),
        }
        : null;
    },
    async link(input): Promise<ExternalIdentityRecord> {
      const id = newEntityId('idn');
      await db.query(
        `INSERT INTO external_identities (id, user_id, provider, subject, verified_email, linked_at)
         VALUES ($1, $2, $3, $4, lower($5), $6)
         ON CONFLICT (provider, subject) DO NOTHING`,
        [id, input.userId, input.provider, input.subject, input.verifiedEmail, input.linkedAt],
      );
      return { id, ...input };
    },
  };
}

export function createSqlSessionStore(db: PostgreSqlDatabase): SessionStore {
  const toSession = (row: {
    id: string; user_id: string; token_hash: string; created_at: string; expires_at: string; revoked_at: string | null;
  }): SessionRecord => ({
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at).toISOString() } : {}),
  });

  return {
    async create(input) {
      const tokenHash = await hashSessionToken(input.token);
      const id = newEntityId('ses');
      await db.query(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, input.userId, tokenHash, input.createdAt, input.expiresAt],
      );
      return { id, userId: input.userId, tokenHash, createdAt: input.createdAt, expiresAt: input.expiresAt };
    },
    async findByToken(token) {
      const tokenHash = await hashSessionToken(token);
      const result = await db.query<{
        id: string; user_id: string; token_hash: string; created_at: string; expires_at: string; revoked_at: string | null;
      }>('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
      return result.rows[0] ? toSession(result.rows[0]) : null;
    },
    async revoke(sessionId, revokedAt) {
      await db.query('UPDATE sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL', [sessionId, revokedAt]);
    },
    async revokeAllForUser(userId, revokedAt) {
      await db.query('UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, revokedAt]);
    },
  };
}

export function createSqlIdentityStores(db: PostgreSqlDatabase): IdentityStores {
  return {
    users: createSqlUserStore(db),
    identities: createSqlExternalIdentityStore(db),
    sessions: createSqlSessionStore(db),
  };
}
