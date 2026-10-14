/** PostgreSQL stores for server identity, external identities, sessions and RBAC. */

import type { PostgreSqlDatabase, SqlQueryExecutor } from '../services/database';
import { createSqlPermissionStore } from './permissionStore';
import { hashSessionToken, newEntityId } from './ids';
import type {
  ExternalIdentityRecord,
  ExternalIdentityStore,
  IdentityStoreTransaction,
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
  created_at: string | Date;
  updated_at: string | Date;
}

interface ExternalIdentityRow {
  id: string;
  user_id: string;
  provider: 'GOOGLE';
  subject: string;
  verified_email: string;
  linked_at: string | Date;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string | Date;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  last_seen_at?: string | Date | null;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toUser(row: UserRow): ServerUserRecord {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    email: row.email,
    displayName: row.display_name,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toExternalIdentity(row: ExternalIdentityRow): ExternalIdentityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    subject: row.subject,
    verifiedEmail: row.verified_email,
    linkedAt: toIso(row.linked_at),
  };
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    ...(row.revoked_at ? { revokedAt: toIso(row.revoked_at) } : {}),
    ...(row.last_seen_at ? { lastSeenAt: toIso(row.last_seen_at) } : {}),
  };
}

export function createSqlUserStore(db: SqlQueryExecutor): UserStore {
  return {
    async findById(userId) {
      const result = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
      return result.rows[0] ? toUser(result.rows[0]) : null;
    },
    async findByIdForShare(userId) {
      const result = await db.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR SHARE', [userId]);
      return result.rows[0] ? toUser(result.rows[0]) : null;
    },
    async findByEmail(email) {
      const result = await db.query<UserRow>('SELECT * FROM users WHERE email = lower($1)', [email.trim()]);
      return result.rows[0] ? toUser(result.rows[0]) : null;
    },
    async create(input) {
      const result = await db.query<UserRow>(
        `INSERT INTO users (id, role, status, email, display_name, avatar_url)
         VALUES ($1, $2, $3, lower($4), $5, $6)
         RETURNING *`,
        [input.id, input.role, input.status, input.email.trim(), input.displayName, input.avatarUrl ?? null],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné l’utilisateur créé.');
      return toUser(result.rows[0]);
    },
    async list(limit) {
      const result = await db.query<UserRow>('SELECT * FROM users ORDER BY created_at DESC, id ASC LIMIT $1', [limit]);
      return result.rows.map(toUser);
    },
  };
}

export function createSqlExternalIdentityStore(db: SqlQueryExecutor): ExternalIdentityStore {
  return {
    async findByExternalSubject(provider, subject) {
      const result = await db.query<ExternalIdentityRow>(
        'SELECT * FROM external_identities WHERE provider = $1 AND subject = $2',
        [provider, subject],
      );
      return result.rows[0] ? toExternalIdentity(result.rows[0]) : null;
    },
    async link(input): Promise<ExternalIdentityRecord> {
      const id = newEntityId('idn');
      const inserted = await db.query<ExternalIdentityRow>(
        `INSERT INTO external_identities (id, user_id, provider, subject, verified_email, linked_at)
         VALUES ($1, $2, $3, $4, lower($5), $6)
         ON CONFLICT (provider, subject) DO NOTHING
         RETURNING *`,
        [id, input.userId, input.provider, input.subject, input.verifiedEmail.trim(), input.linkedAt],
      );
      if (inserted.rows[0]) return toExternalIdentity(inserted.rows[0]);

      // A concurrent transaction may have linked the same Google `sub` first.
      // Return the persisted canonical owner; never claim that our proposed link won.
      const canonical = await this.findByExternalSubject(input.provider, input.subject);
      if (!canonical) throw new Error('L’identité externe n’a pas pu être résolue après un conflit unique.');
      return canonical;
    },
  };
}

export function createSqlSessionStore(db: SqlQueryExecutor): SessionStore {
  return {
    async create(input) {
      const tokenHash = await hashSessionToken(input.token);
      const id = newEntityId('ses');
      const result = await db.query<SessionRow>(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, input.userId, tokenHash, input.createdAt, input.expiresAt],
      );
      if (!result.rows[0]) throw new Error('PostgreSQL n’a pas retourné la session créée.');
      return toSession(result.rows[0]);
    },
    async findByToken(token) {
      const tokenHash = await hashSessionToken(token);
      const result = await db.query<SessionRow>('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
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

function createIdentityStoreTransaction(db: SqlQueryExecutor): IdentityStoreTransaction {
  return {
    users: createSqlUserStore(db),
    identities: createSqlExternalIdentityStore(db),
    sessions: createSqlSessionStore(db),
    permissions: createSqlPermissionStore(db),
    async lockIdentityResolution(provider, subject, verifiedEmail) {
      // Locks keys in lexical order to prevent deadlocks when independent Google
      // subjects are concurrently linked to the same verified email. hashtext
      // collisions only serialize unrelated resolutions; they cannot authorize.
      const keys = [
        `lelabeur:identity:${provider}:${subject}`,
        `lelabeur:email:${verifiedEmail.trim().toLowerCase()}`,
      ].sort();
      for (const key of keys) {
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      }
    },
  };
}

/** SQL-backed view; every callback gets stores bound to the same DB transaction. */
export function createSqlIdentityStores(database: PostgreSqlDatabase): IdentityStores {
  const root = createIdentityStoreTransaction(database);
  return {
    ...root,
    async transaction(operation) {
      return database.run(transaction => operation(createIdentityStoreTransaction(transaction)));
    },
  };
}
