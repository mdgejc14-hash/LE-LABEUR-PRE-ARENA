/**
 * Ports de persistance identité (Phase 2).
 *
 * Deux implémentations sont prévues :
 *  - `InMemoryIdentityStore` : tests et mode démo serveur, jamais production ;
 *  - `SqlIdentityStore` (src/backend/identity/sqlStores.ts) : PostgreSQL via
 *    Hyperdrive, préparé mais non branché tant qu'aucune connexion n'est fournie.
 */

import type { UserRole } from '../../types';
import { hashSessionToken, newEntityId, newOpaqueSessionToken } from './ids';

export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'PENDING';

export interface ServerUserRecord {
  id: string;
  role: UserRole;
  status: AccountStatus;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalIdentityRecord {
  id: string;
  userId: string;
  provider: 'GOOGLE';
  /** `sub` Google vérifié côté serveur. */
  subject: string;
  verifiedEmail: string;
  linkedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  /** SHA-256 du jeton opaque; le jeton en clair n'est jamais persisté. */
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastSeenAt?: string;
}

export interface UserStore {
  findById(userId: string): Promise<ServerUserRecord | null>;
  findByEmail(email: string): Promise<ServerUserRecord | null>;
  create(input: Omit<ServerUserRecord, 'createdAt' | 'updatedAt'>): Promise<ServerUserRecord>;
  list(limit: number): Promise<ServerUserRecord[]>;
}

export interface ExternalIdentityStore {
  findByExternalSubject(provider: 'GOOGLE', subject: string): Promise<ExternalIdentityRecord | null>;
  link(input: Omit<ExternalIdentityRecord, 'id'>): Promise<ExternalIdentityRecord>;
}

export interface SessionStore {
  create(input: { userId: string; token: string; createdAt: string; expiresAt: string }): Promise<SessionRecord>;
  findByToken(token: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, revokedAt: string): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: string): Promise<void>;
}

export interface IdentityStores {
  users: UserStore;
  identities: ExternalIdentityStore;
  sessions: SessionStore;
}

/** Implémentation mémoire : tests, mode démo et environnements sans PostgreSQL. */
export class InMemoryIdentityStore implements UserStore, ExternalIdentityStore {
  private readonly usersById = new Map<string, ServerUserRecord>();
  private readonly identitiesByKey = new Map<string, ExternalIdentityRecord>();
  private readonly sessionsById = new Map<string, SessionRecord>();
  private readonly sessionIdByTokenHash = new Map<string, string>();

  async findById(userId: string): Promise<ServerUserRecord | null> {
    return this.usersById.get(userId) ?? null;
  }

  async findByEmail(email: string): Promise<ServerUserRecord | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.usersById.values()) {
      if (user.email === normalized) return user;
    }
    return null;
  }

  async create(input: Omit<ServerUserRecord, 'createdAt' | 'updatedAt'>): Promise<ServerUserRecord> {
    const now = new Date().toISOString();
    const record: ServerUserRecord = { ...input, email: input.email.trim().toLowerCase(), createdAt: now, updatedAt: now };
    this.usersById.set(record.id, record);
    return record;
  }

  async list(limit: number): Promise<ServerUserRecord[]> {
    return [...this.usersById.values()].slice(0, Math.max(0, limit));
  }

  async findByExternalSubject(provider: 'GOOGLE', subject: string): Promise<ExternalIdentityRecord | null> {
    return this.identitiesByKey.get(`${provider}:${subject}`) ?? null;
  }

  async link(input: Omit<ExternalIdentityRecord, 'id'>): Promise<ExternalIdentityRecord> {
    const key = `${input.provider}:${input.subject}`;
    const existing = this.identitiesByKey.get(key);
    if (existing) return existing;
    const record: ExternalIdentityRecord = { id: newEntityId('idn'), ...input };
    this.identitiesByKey.set(key, record);
    return record;
  }

  async create_session(input: { userId: string; token: string; createdAt: string; expiresAt: string }): Promise<SessionRecord> {
    return this.create_sessionInternal(input);
  }

  private async create_sessionInternal(input: { userId: string; token: string; createdAt: string; expiresAt: string }): Promise<SessionRecord> {
    const tokenHash = await hashSessionToken(input.token);
    const record: SessionRecord = {
      id: newEntityId('ses'),
      userId: input.userId,
      tokenHash,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };
    this.sessionsById.set(record.id, record);
    this.sessionIdByTokenHash.set(tokenHash, record.id);
    return record;
  }

  async findByToken(token: string): Promise<SessionRecord | null> {
    const tokenHash = await hashSessionToken(token);
    const sessionId = this.sessionIdByTokenHash.get(tokenHash);
    if (!sessionId) return null;
    return this.sessionsById.get(sessionId) ?? null;
  }

  async revoke(sessionId: string, revokedAt: string): Promise<void> {
    const record = this.sessionsById.get(sessionId);
    if (!record || record.revokedAt) return;
    this.sessionsById.set(sessionId, { ...record, revokedAt });
  }

  async revokeAllForUser(userId: string, revokedAt: string): Promise<void> {
    for (const [id, record] of this.sessionsById) {
      if (record.userId === userId && !record.revokedAt) {
        this.sessionsById.set(id, { ...record, revokedAt });
      }
    }
  }
}

/** `SessionStore.create` ne peut pas partager le nom de `UserStore.create`. */
export function createInMemoryIdentityStores(): IdentityStores {
  const store = new InMemoryIdentityStore();
  return {
    users: store,
    identities: store,
    sessions: {
      create: input => store.create_session(input),
      findByToken: token => store.findByToken(token),
      revoke: (sessionId, revokedAt) => store.revoke(sessionId, revokedAt),
      revokeAllForUser: (userId, revokedAt) => store.revokeAllForUser(userId, revokedAt),
    },
  };
}

export { newOpaqueSessionToken };
