/**
 * Ports de persistance identité (Phase 2 / P0-B).
 *
 * Les opérations de création d'une identité et de sa session sont exécutées
 * via `IdentityStores.transaction`. Le store PostgreSQL fournit une vue liée
 * à une connexion transactionnelle dédiée; le store mémoire ne sert qu'aux
 * tests et au mode serveur `memory` explicite.
 */

import type { UserRole } from '../../types';
import type { Permission } from '../productionContracts';
import type { PermissionStore } from '../persistence/coreRecords';
import { ADMIN_PERMISSIONS, permissionsForRole } from './permissions';
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
  /** Locks the user row against account-status changes in a PostgreSQL transaction. */
  findByIdForShare(userId: string): Promise<ServerUserRecord | null>;
  findByEmail(email: string): Promise<ServerUserRecord | null>;
  create(input: Omit<ServerUserRecord, 'createdAt' | 'updatedAt'>): Promise<ServerUserRecord>;
  list(limit: number): Promise<ServerUserRecord[]>;
}

export interface ExternalIdentityStore {
  findByExternalSubject(provider: 'GOOGLE', subject: string): Promise<ExternalIdentityRecord | null>;
  /** Returns the canonical persisted link when a unique-key race was resolved by PostgreSQL. */
  link(input: Omit<ExternalIdentityRecord, 'id'>): Promise<ExternalIdentityRecord>;
}

export interface SessionStore {
  create(input: { userId: string; token: string; createdAt: string; expiresAt: string }): Promise<SessionRecord>;
  findByToken(token: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, revokedAt: string): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: string): Promise<void>;
}

/** Transaction-scoped view; it deliberately does not expose another transaction method. */
export interface IdentityStoreTransaction {
  users: UserStore;
  identities: ExternalIdentityStore;
  sessions: SessionStore;
  permissions: PermissionStore;
  /** Serializes resolution by stable Google subject and verified email in PostgreSQL. */
  lockIdentityResolution(provider: 'GOOGLE', subject: string, verifiedEmail: string): Promise<void>;
}

export interface IdentityStores extends IdentityStoreTransaction {
  transaction<T>(operation: (transaction: IdentityStoreTransaction) => Promise<T>): Promise<T>;
}

/** Implémentation mémoire : tests, mode serveur explicite, jamais le MODE DEMO frontend. */
export class InMemoryIdentityStore implements UserStore, ExternalIdentityStore {
  private readonly usersById = new Map<string, ServerUserRecord>();
  private readonly identitiesByKey = new Map<string, ExternalIdentityRecord>();
  private readonly sessionsById = new Map<string, SessionRecord>();
  private readonly sessionIdByTokenHash = new Map<string, string>();

  async findById(userId: string): Promise<ServerUserRecord | null> {
    return this.usersById.get(userId) ?? null;
  }

  async findByIdForShare(userId: string): Promise<ServerUserRecord | null> {
    // The memory identity store is single-process and has no database row locks.
    return this.findById(userId);
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

  async createSession(input: { userId: string; token: string; createdAt: string; expiresAt: string }): Promise<SessionRecord> {
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

function createInMemoryPermissionStore(): PermissionStore {
  const rolePermissions: Record<UserRole, readonly Permission[]> = {
    CANDIDATE: permissionsForRole('CANDIDATE'),
    EMPLOYER: permissionsForRole('EMPLOYER'),
    ADMIN: ADMIN_PERMISSIONS,
  };
  const userPermissions = new Map<string, readonly Permission[]>();
  const effective = (userId: string, role: UserRole) =>
    [...new Set<Permission>([...rolePermissions[role], ...(userPermissions.get(userId) ?? [])])].sort();
  return {
    async listRolePermissions(role) { return [...rolePermissions[role]]; },
    async listUserPermissions(userId) { return [...(userPermissions.get(userId) ?? [])]; },
    async listEffectivePermissions(userId, role) { return effective(userId, role); },
  };
}

/**
 * Le store mémoire est volontairement hors de la garantie PostgreSQL; il
 * conserve un seul état serveur pour les tests et les compositions explicites
 * `memory`. Le parcours frontend DEMO reste celui de MockRepository.
 */
export function createInMemoryIdentityStores(permissionStore?: PermissionStore): IdentityStores {
  const store = new InMemoryIdentityStore();
  const permissions = permissionStore ?? createInMemoryPermissionStore();
  const transactionView: IdentityStoreTransaction = {
    users: store,
    identities: store,
    sessions: {
      create: input => store.createSession(input),
      findByToken: token => store.findByToken(token),
      revoke: (sessionId, revokedAt) => store.revoke(sessionId, revokedAt),
      revokeAllForUser: (userId, revokedAt) => store.revokeAllForUser(userId, revokedAt),
    },
    permissions,
    async lockIdentityResolution() {
      // Single-process memory store; only PostgreSQL requires transaction locks.
    },
  };

  return {
    ...transactionView,
    async transaction(operation) {
      return operation(transactionView);
    },
  };
}

export { newOpaqueSessionToken };
