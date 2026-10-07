/**
 * P0-WEBRTC — short-lived, contract-bound WebRTC orchestration.
 *
 * This repository never accepts participant IDs from the caller. It reloads
 * the ACTIVE contract and both accounts, then grants access only to its actual
 * employer and candidate. Authorization is checked again for every credential,
 * ICE, signaling, polling, read, join and close operation.
 *
 * REST polling is the implemented transport. SDP/ICE payloads are narrowly
 * validated, delivered only to the other participant, and redacted immediately
 * when the session ends. The remaining session metadata is purged at its
 * original expiry by the existing Cron worker. Media itself is never stored.
 */

import type {
  AuthenticatedActor,
  ProductionCommandContext,
  WebRtcEntityType,
  WebRtcIceConfiguration,
  WebRtcIceConfigurationState,
  WebRtcParticipantRole,
  WebRtcSessionCredential,
  WebRtcSessionParticipant,
  WebRtcSessionStatus,
  WebRtcSessionView,
  WebRtcSignalingMessage,
  WebRtcSignalingMessageType,
  ShortLivedIceServerCredential,
} from '../productionContracts';
import { SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS } from '../productionContracts';
import type { ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import { ApiError } from '../api/errors';
import { requireAuth, requireParticipant } from '../api/security';
import type { PostgreSqlDatabase, SqlTransaction } from '../services/database';
import type { WebRtcSessionIceConfigurationIssuer } from '../services/signaling';
import type { AuditLedgerStore, DurableIdempotencyStore, DomainEventOutbox } from '../automation/records';
import { createDomainEvent } from '../automation/foundation';
import type { ContractStore, ContractRecord } from '../persistence/coreRecords';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import { hashSessionToken, newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { sha256Fingerprint } from '../payments/paymentErrors';
import type {
  WebRtcCredentialRecord,
  WebRtcParticipantRecord,
  WebRtcSessionRecord,
  WebRtcSessionStore,
  WebRtcSignalingMessageRecord,
} from './records';
import {
  WEBRTC_SESSION_LIVE_STATUSES,
  WEBRTC_SESSION_TERMINAL_STATUSES,
} from './records';

export const WEBRTC_API_SOURCE = 'api:P0-WEBRTC';
export const WEBRTC_AUTOMATION_SOURCE = 'automation:P0-WEBRTC';
export const WEBRTC_SESSION_TTL_MS = 60 * 60_000;
export const WEBRTC_CREDENTIAL_TTL_MS = SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS * 1000;
export const WEBRTC_MAX_SIGNAL_PAYLOAD_BYTES = 48 * 1024;
export const WEBRTC_MAX_POLL_MESSAGES = 50;
export const WEBRTC_MAINTENANCE_BATCH_SIZE = 100;

const SIGNAL_MESSAGE_TYPES = ['OFFER', 'ANSWER', 'ICE_CANDIDATE'] as const;
const PARTICIPANT_ROLES = ['EMPLOYER', 'CANDIDATE'] as const;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const SESSION_ID_PATTERN = /^wbs_[0-9a-hjkmnp-tv-z]{26}$/;
const TERMINAL_STATUSES = new Set<WebRtcSessionStatus>(WEBRTC_SESSION_TERMINAL_STATUSES);

/** Commit privacy cleanup, then return the authorization error to the caller. */
class CommitThenThrow extends Error {
  constructor(readonly apiError: ApiError) {
    super(apiError.message);
  }
}

export interface WebRtcSessionRepositoryStores {
  sessions: WebRtcSessionStore;
  contracts: ContractStore;
  users: UserStore;
  audit: AuditLedgerStore;
  outbox: DomainEventOutbox;
  idempotency: DurableIdempotencyStore;
}

export type WebRtcSqlFactory = (executor: SqlTransaction) => WebRtcSessionRepositoryStores;

export type WebRtcIceConfigurationIssuer = WebRtcSessionIceConfigurationIssuer;

export interface WebRtcRepositoryDependencies {
  database: PostgreSqlDatabase;
  createStores: WebRtcSqlFactory;
  /** Omitted by the Worker composition: explicitly NOT_CONFIGURED. */
  iceConfigurationIssuer?: WebRtcIceConfigurationIssuer;
  now?: () => Date;
}

export interface WebRtcSessionRepository {
  listMine(actor: AuthenticatedActor, limit: number, cursor?: string | null): Promise<{ items: WebRtcSessionView[]; cursor: string | null; limit: number; hasMore: boolean }>;
  create(actor: AuthenticatedActor, input: { entityType: WebRtcEntityType; entityId: string }, command: ProductionCommandContext): Promise<WebRtcSessionView>;
  get(actor: AuthenticatedActor, sessionId: string): Promise<WebRtcSessionView>;
  join(actor: AuthenticatedActor, sessionId: string): Promise<WebRtcSessionView>;
  issueCredential(actor: AuthenticatedActor, sessionId: string): Promise<WebRtcSessionCredential>;
  getIceConfiguration(actor: AuthenticatedActor, sessionId: string): Promise<WebRtcIceConfiguration>;
  sendSignal(actor: AuthenticatedActor, sessionId: string, input: unknown, command: ProductionCommandContext, credential: string | null): Promise<WebRtcSignalingMessage>;
  reportTransportConnected(actor: AuthenticatedActor, sessionId: string, command: ProductionCommandContext, credential: string | null): Promise<WebRtcSessionView>;
  poll(actor: AuthenticatedActor, sessionId: string, afterSequence: number, limit: number, credential: string | null): Promise<{ messages: WebRtcSignalingMessage[]; nextSequence: number; hasMore: boolean }>;
  close(actor: AuthenticatedActor, sessionId: string, command?: ProductionCommandContext): Promise<WebRtcSessionView>;
  runScheduledMaintenance(): Promise<{ expired: number; purged: number }>;
}

interface AuthorizedSession {
  record: WebRtcSessionRecord;
  contract: ContractRecord;
  participants: WebRtcParticipantRecord[];
  participant: WebRtcParticipantRecord;
  peer: WebRtcParticipantRecord;
  account: ServerUserRecord;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function parseRole(role: string): WebRtcParticipantRole | null {
  return (PARTICIPANT_ROLES as readonly string[]).includes(role) ? role as WebRtcParticipantRole : null;
}
function iso(date: Date): string {
  return date.toISOString();
}
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
}
function createConflict(message: string): ApiError {
  return new ApiError('BUSINESS_RULE_VIOLATION', message);
}
function requireSafeId(value: string, message = 'Identifiant WebRTC invalide.'): string {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    throw new ApiError('VALIDATION_ERROR', message);
  }
  return value;
}
function ensureSessionId(sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new ApiError('NOT_FOUND', 'Session WebRTC introuvable.');
  return sessionId;
}
function toParticipantView(participant: WebRtcParticipantRecord): WebRtcSessionParticipant {
  return {
    userId: participant.userId,
    role: participant.role,
    invitedAt: participant.invitedAt,
    ...(participant.joinedAt ? { joinedAt: participant.joinedAt } : {}),
  };
}
function toSessionView(record: WebRtcSessionRecord, participants: WebRtcParticipantRecord[]): WebRtcSessionView {
  return {
    sessionId: record.sessionId,
    entityType: record.entityType,
    entityId: record.entityId,
    initiatorId: record.initiatorId,
    participants: participants.map(toParticipantView),
    status: record.status,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    ...(record.closedAt ? { closedAt: record.closedAt } : {}),
  };
}
function toMessageView(message: WebRtcSignalingMessageRecord): WebRtcSignalingMessage {
  return {
    messageId: message.messageId,
    sessionId: message.sessionId,
    sequence: message.sequence,
    participantId: message.participantId,
    receiverId: message.receiverId,
    timestamp: message.createdAt,
    type: message.type,
    payload: message.payloadRedactedAt ? {} : message.payload,
  };
}
function participantRoleFromContract(actor: AuthenticatedActor, contract: ContractRecord): WebRtcParticipantRole | null {
  if (actor.role === 'EMPLOYER' && contract.employerId === actor.id) return 'EMPLOYER';
  if (actor.role === 'CANDIDATE' && contract.employeeId === actor.id) return 'CANDIDATE';
  return null;
}
function otherContractParty(actorId: string, contract: ContractRecord): { userId: string; role: WebRtcParticipantRole } {
  if (actorId === contract.employerId) return { userId: contract.employeeId, role: 'CANDIDATE' };
  if (actorId === contract.employeeId) return { userId: contract.employerId, role: 'EMPLOYER' };
  throw new ApiError('FORBIDDEN', 'Accès interdit.');
}
function activeSessionStatus(status: WebRtcSessionStatus): boolean {
  return (WEBRTC_SESSION_LIVE_STATUSES as readonly WebRtcSessionStatus[]).includes(status);
}
function normalizePageLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 25;
  return Math.min(Math.trunc(limit), 100);
}
function normalizePollLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return WEBRTC_MAX_POLL_MESSAGES;
  return Math.min(Math.trunc(limit), WEBRTC_MAX_POLL_MESSAGES);
}

async function appendAudit(
  stores: WebRtcSessionRepositoryStores,
  input: {
    actorId: string | 'SYSTEM';
    at: string;
    sessionId: string;
    action: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    reference?: string;
  },
): Promise<void> {
  await stores.audit.append({
    id: newEntityId('evr'),
    actorId: input.actorId,
    timestamp: input.at,
    entityId: input.sessionId,
    action: input.action,
    source: WEBRTC_API_SOURCE,
    ...(input.beforeState ? { beforeState: input.beforeState } : {}),
    ...(input.afterState ? { afterState: input.afterState } : {}),
    ...(input.reference ? { reference: input.reference } : {}),
  });
}

function assertNoExtraKeys(record: Record<string, unknown>, allowed: readonly string[], message: string): void {
  if (Object.keys(record).some(key => !allowed.includes(key))) {
    throw new ApiError('VALIDATION_ERROR', message);
  }
}

export function validateWebRtcSignalInput(input: unknown): {
  type: (typeof SIGNAL_MESSAGE_TYPES)[number];
  payload: Record<string, unknown>;
} {
  const envelope = asRecord(input);
  if (!envelope) throw new ApiError('VALIDATION_ERROR', 'Le message de signalisation est invalide.');
  assertNoExtraKeys(envelope, ['type', 'payload'], 'Champs de signalisation non autorisés.');
  if (typeof envelope.type !== 'string' || !(SIGNAL_MESSAGE_TYPES as readonly string[]).includes(envelope.type)) {
    throw new ApiError('VALIDATION_ERROR', 'Type de signalisation non autorisé.');
  }
  const type = envelope.type as (typeof SIGNAL_MESSAGE_TYPES)[number];
  const payload = asRecord(envelope.payload);
  if (!payload) throw new ApiError('VALIDATION_ERROR', 'Le contenu du message de signalisation est invalide.');
  let normalized: Record<string, unknown>;
  if (type === 'OFFER' || type === 'ANSWER') {
    assertNoExtraKeys(payload, ['sdp'], 'Champs SDP non autorisés.');
    if (typeof payload.sdp !== 'string' || payload.sdp.length < 1 || payload.sdp.length > 32 * 1024) {
      throw new ApiError('VALIDATION_ERROR', 'La description WebRTC est vide ou dépasse la taille autorisée.');
    }
    normalized = { sdp: payload.sdp };
  } else {
    assertNoExtraKeys(payload, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'], 'Champs ICE non autorisés.');
    if (typeof payload.candidate !== 'string' || payload.candidate.length > 2048) {
      throw new ApiError('VALIDATION_ERROR', 'Le candidat ICE est invalide.');
    }
    if (payload.sdpMid !== undefined && (typeof payload.sdpMid !== 'string' || payload.sdpMid.length > 64)) {
      throw new ApiError('VALIDATION_ERROR', 'Le champ sdpMid est invalide.');
    }
    if (payload.sdpMLineIndex !== undefined && (!Number.isSafeInteger(payload.sdpMLineIndex) || Number(payload.sdpMLineIndex) < 0 || Number(payload.sdpMLineIndex) > 255)) {
      throw new ApiError('VALIDATION_ERROR', 'Le champ sdpMLineIndex est invalide.');
    }
    if (payload.usernameFragment !== undefined && (typeof payload.usernameFragment !== 'string' || payload.usernameFragment.length > 256)) {
      throw new ApiError('VALIDATION_ERROR', 'Le champ usernameFragment est invalide.');
    }
    normalized = {
      candidate: payload.candidate,
      ...(payload.sdpMid !== undefined ? { sdpMid: payload.sdpMid } : {}),
      ...(payload.sdpMLineIndex !== undefined ? { sdpMLineIndex: payload.sdpMLineIndex } : {}),
      ...(payload.usernameFragment !== undefined ? { usernameFragment: payload.usernameFragment } : {}),
    };
  }
  if (new TextEncoder().encode(JSON.stringify({ type, payload: normalized })).byteLength > WEBRTC_MAX_SIGNAL_PAYLOAD_BYTES) {
    throw new ApiError('VALIDATION_ERROR', 'Le message de signalisation dépasse la taille autorisée.');
  }
  return { type, payload: normalized };
}

function notConfiguredIceConfiguration(): WebRtcIceConfiguration {
  return {
    state: 'NOT_CONFIGURED',
    iceServers: [],
    expiresAt: null,
    reason: 'Aucun service STUN/TURN n’est configuré pour cet environnement.',
  };
}

function blockedIceConfiguration(): WebRtcIceConfiguration {
  return {
    state: 'BLOCKED_EXTERNAL_ACCESS',
    iceServers: [],
    expiresAt: null,
    reason: 'Le service ICE configuré n’est pas accessible.',
  };
}

function urlsOf(server: ShortLivedIceServerCredential): string[] | null {
  if (typeof server.urls === 'string') return [server.urls];
  if (Array.isArray(server.urls)) return [...server.urls];
  return null;
}
export function validateWebRtcIceConfiguration(value: WebRtcIceConfiguration, at: Date): WebRtcIceConfiguration {
  const states: readonly WebRtcIceConfigurationState[] = ['AVAILABLE', 'NOT_CONFIGURED', 'BLOCKED_EXTERNAL_ACCESS'];
  if (!value || !states.includes(value.state) || !Array.isArray(value.iceServers)) return blockedIceConfiguration();
  if (value.state !== 'AVAILABLE') {
    if (value.iceServers.length > 0 || value.expiresAt !== null) return blockedIceConfiguration();
    return value.state === 'NOT_CONFIGURED' ? notConfiguredIceConfiguration() : blockedIceConfiguration();
  }
  if (value.iceServers.length === 0 || value.iceServers.length > 8) return blockedIceConfiguration();
  const expiry = value.expiresAt ? Date.parse(value.expiresAt) : NaN;
  const now = at.getTime();
  const normalized: ShortLivedIceServerCredential[] = [];
  let hasTurn = false;
  for (const server of value.iceServers) {
    if (!server || typeof server !== 'object') return blockedIceConfiguration();
    const urls = urlsOf(server);
    if (!urls || urls.length === 0 || urls.length > 8 || urls.some(url => typeof url !== 'string' || url.length > 512 || !/^(stun|stuns|turn|turns):/i.test(url))) {
      return blockedIceConfiguration();
    }
    const turns = urls.some(url => /^turns?:/i.test(url));
    if (turns) {
      hasTurn = true;
      if (typeof server.username !== 'string' || server.username.length < 1 || server.username.length > 256
        || typeof server.credential !== 'string' || server.credential.length < 1 || server.credential.length > 512) {
        return blockedIceConfiguration();
      }
    } else if ((server.username !== undefined && typeof server.username !== 'string')
      || (server.credential !== undefined && typeof server.credential !== 'string')) {
      return blockedIceConfiguration();
    }
    normalized.push({
      urls: server.urls,
      ...(server.username !== undefined ? { username: server.username } : {}),
      ...(server.credential !== undefined ? { credential: server.credential } : {}),
    });
  }
  if (hasTurn && (!Number.isFinite(expiry) || expiry <= now || expiry > now + WEBRTC_CREDENTIAL_TTL_MS)) {
    return blockedIceConfiguration();
  }
  if (value.expiresAt !== null && (!Number.isFinite(expiry) || expiry <= now || expiry > now + WEBRTC_CREDENTIAL_TTL_MS)) {
    return blockedIceConfiguration();
  }
  return {
    state: 'AVAILABLE',
    iceServers: normalized,
    expiresAt: value.expiresAt,
  };
}

function translateUniqueError(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une session temporaire existe déjà pour ce contrat.');
  }
  throw error;
}

export function createWebRtcSessionRepository(
  dependencies: WebRtcRepositoryDependencies,
): WebRtcSessionRepository {
  const { database, createStores } = dependencies;
  const clock = dependencies.now ?? (() => new Date());
  const inTransaction = async <T>(operation: (stores: WebRtcSessionRepositoryStores) => Promise<T>): Promise<T> => {
    const result = await database.run(async transaction => {
      try {
        return { kind: 'value' as const, value: await operation(createStores(transaction)) };
      } catch (error) {
        if (error instanceof CommitThenThrow) return { kind: 'error' as const, error: error.apiError };
        throw error;
      }
    });
    if (result.kind === 'error') throw result.error;
    return result.value;
  };

  const validateActor = async (
    stores: WebRtcSessionRepositoryStores,
    suppliedActor: AuthenticatedActor,
    at: Date,
  ): Promise<ServerUserRecord> => {
    const actor = requireAuth(suppliedActor);
    const account = await stores.users.findById(actor.id);
    if (!account || account.status !== 'ACTIVE' || account.role !== actor.role) {
      throw new ApiError('FORBIDDEN', 'Ce compte n’est pas autorisé à utiliser les sessions WebRTC.');
    }
    const authSessionActive = await stores.sessions.isAuthenticationSessionActive(actor.sessionId, actor.id, iso(at));
    if (!authSessionActive) throw new ApiError('UNAUTHENTICATED', 'La session d’authentification n’est plus active.');
    return account;
  };

  const closeInternal = async (
    stores: WebRtcSessionRepositoryStores,
    record: WebRtcSessionRecord,
    status: Extract<WebRtcSessionStatus, 'CLOSED' | 'EXPIRED' | 'FAILED'>,
    at: Date,
    actorId: string | 'SYSTEM',
    reference?: string,
  ): Promise<WebRtcSessionRecord> => {
    if (TERMINAL_STATUSES.has(record.status)) return record;
    const updated = await stores.sessions.transitionStatus({
      sessionId: record.sessionId,
      expected: WEBRTC_SESSION_LIVE_STATUSES,
      status,
      at: iso(at),
    });
    const result = updated ?? await stores.sessions.findSession(record.sessionId);
    if (!result) throw new ApiError('NOT_FOUND', 'Session WebRTC introuvable.');
    if (updated) {
      await stores.sessions.redactSignalingPayloads(record.sessionId, iso(at));
      await stores.sessions.revokeCredentialsForSession(record.sessionId, iso(at));
      await appendAudit(stores, {
        actorId,
        at: iso(at),
        sessionId: record.sessionId,
        action: status === 'EXPIRED' ? 'WEBRTC_SESSION_EXPIRED' : status === 'FAILED' ? 'WEBRTC_SESSION_FAILED' : 'WEBRTC_SESSION_CLOSED',
        beforeState: { status: record.status },
        afterState: { status, closedAt: iso(at) },
        ...(reference ? { reference } : {}),
      });
    }
    return result;
  };

  const loadAuthorized = async (
    stores: WebRtcSessionRepositoryStores,
    suppliedActor: AuthenticatedActor,
    rawSessionId: string,
    at: Date,
    options: { lock?: boolean; expire?: boolean } = {},
  ): Promise<AuthorizedSession> => {
    const actor = requireAuth(suppliedActor);
    const sessionId = ensureSessionId(rawSessionId);
    const account = await validateActor(stores, actor, at);
    let record = options.lock
      ? await stores.sessions.findSessionForUpdate(sessionId)
      : await stores.sessions.findSession(sessionId);
    if (!record) throw new ApiError('NOT_FOUND', 'Session WebRTC introuvable.');
    const participants = await stores.sessions.listParticipants(sessionId);
    const participant = participants.find(candidate => candidate.userId === actor.id);
    if (!participant) throw new ApiError('NOT_FOUND', 'Session WebRTC introuvable.');
    // ADMIN and all non-participants are deliberately denied. No permission or
    // role override can grant access to a private contract call.
    requireParticipant(actor, participants.map(candidate => candidate.userId));
    const peer = participants.find(candidate => candidate.userId !== actor.id);
    if (!peer || participants.length !== 2) throw new ApiError('FORBIDDEN', 'Session WebRTC invalide.');

    const contract = await stores.contracts.findById(record.entityId);
    const actorParty = contract ? participantRoleFromContract(actor, contract) : null;
    const peerRole = contract
      ? (peer.userId === contract.employerId ? 'EMPLOYER' : peer.userId === contract.employeeId ? 'CANDIDATE' : null)
      : null;
    const [employerAccount, candidateAccount] = contract
      ? await Promise.all([
          stores.users.findById(contract.employerId),
          stores.users.findById(contract.employeeId),
        ])
      : [null, null];
    const contractPartiesActive = employerAccount?.status === 'ACTIVE' && employerAccount.role === 'EMPLOYER'
      && candidateAccount?.status === 'ACTIVE' && candidateAccount.role === 'CANDIDATE';
    const rolesMatch = actorParty === participant.role && peerRole === peer.role
      && contract?.status === 'ACTIVE'
      && contractPartiesActive
      && record.entityType === 'CONTRACT'
      && record.entityId === contract.id;
    if (!rolesMatch) {
      const denied = new ApiError('FORBIDDEN', 'Le contrat ou les participants ne sont plus autorisés pour cette session.');
      if (activeSessionStatus(record.status)) {
        await closeInternal(stores, record, 'FAILED', at, 'SYSTEM', 'contract-state-or-parties-changed');
        // Returning this sentinel from the transaction commits redaction,
        // revocation and audit before the API emits the normal 403 response.
        throw new CommitThenThrow(denied);
      }
      throw denied;
    }

    if (options.expire !== false && activeSessionStatus(record.status) && Date.parse(record.expiresAt) <= at.getTime()) {
      record = await closeInternal(stores, record, 'EXPIRED', at, 'SYSTEM');
    }
    return { record, contract, participants, participant, peer, account };
  };

  const requireUsable = (authorized: AuthorizedSession): void => {
    if (!activeSessionStatus(authorized.record.status)) {
      throw createConflict('La session WebRTC est terminée ou expirée.');
    }
  };

  const requireCredential = async (
    stores: WebRtcSessionRepositoryStores,
    authorized: AuthorizedSession,
    actor: AuthenticatedActor,
    rawCredential: string | null,
    at: Date,
  ): Promise<void> => {
    if (!rawCredential || rawCredential.length > 128 || !CREDENTIAL_PATTERN.test(rawCredential)) {
      throw new ApiError('UNAUTHENTICATED', 'Credential de signalisation requis.');
    }
    const tokenHash = await hashSessionToken(rawCredential);
    const credential = await stores.sessions.findCredentialByHash(tokenHash);
    if (!credential
      || credential.sessionId !== authorized.record.sessionId
      || credential.participantId !== actor.id
      || credential.authSessionId !== actor.sessionId
      || credential.revokedAt
      || Date.parse(credential.expiresAt) <= at.getTime()) {
      throw new ApiError('UNAUTHENTICATED', 'Credential de signalisation invalide ou expiré.');
    }
    if (!await stores.sessions.isAuthenticationSessionActive(actor.sessionId, actor.id, iso(at))) {
      throw new ApiError('UNAUTHENTICATED', 'La session d’authentification n’est plus active.');
    }
  };

  const viewInTransaction = async (
    stores: WebRtcSessionRepositoryStores,
    record: WebRtcSessionRecord,
  ): Promise<WebRtcSessionView> => toSessionView(record, await stores.sessions.listParticipants(record.sessionId));

  const create: WebRtcSessionRepository['create'] = async (actor, input, command) => {
    const at = clock();
    if (input?.entityType !== 'CONTRACT') throw new ApiError('VALIDATION_ERROR', 'Seul un contrat actif peut être associé à une session WebRTC.');
    const entityId = requireSafeId(input.entityId, 'Identifiant de contrat invalide.');
    if (!command?.idempotencyKey || command.actor.id !== actor.id) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
    const fingerprint = await sha256Fingerprint({ entityType: input.entityType, entityId });
    try {
      return await inTransaction(async stores => {
        await validateActor(stores, actor, at);
        const reservation = await stores.idempotency.reserve({
          actorId: actor.id,
          command: 'webrtc.sessions.create',
          key: command.idempotencyKey,
          payloadHash: fingerprint,
        });
        if (reservation.kind === 'conflict') throw new ApiError('IDEMPOTENCY_CONFLICT', 'La clé d’idempotence a déjà été utilisée avec une autre demande.');
        if (reservation.kind === 'in-progress') throw createConflict('La création de session est déjà en cours.');
        if (reservation.kind === 'replay') {
          const result = asRecord(reservation.result);
          const sessionId = text(result?.sessionId);
          if (!sessionId) throw new ApiError('INTERNAL_ERROR', 'Le résultat idempotent WebRTC est invalide.');
          const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
          return viewInTransaction(stores, authorized.record);
        }

        const contract = await stores.contracts.findByIdForUpdate(entityId);
        if (!contract || contract.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', 'Contrat actif introuvable.');
        const role = participantRoleFromContract(actor, contract);
        if (!role) throw new ApiError('FORBIDDEN', 'Seule une partie réelle du contrat peut initier un appel.');
        const employer = await stores.users.findByIdForShare(contract.employerId);
        const candidate = await stores.users.findByIdForShare(contract.employeeId);
        if (!employer || employer.status !== 'ACTIVE' || employer.role !== 'EMPLOYER'
          || !candidate || candidate.status !== 'ACTIVE' || candidate.role !== 'CANDIDATE') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Les deux comptes du contrat doivent être actifs et correspondre aux parties attendues.');
        }
        const peer = otherContractParty(actor.id, contract);
        const existing = await stores.sessions.findLiveSessionForEntity('CONTRACT', entityId);
        if (existing && Date.parse(existing.expiresAt) > at.getTime()) {
          throw createConflict('Une session temporaire existe déjà pour ce contrat.');
        }
        if (existing && activeSessionStatus(existing.status)) {
          await closeInternal(stores, existing, 'EXPIRED', at, 'SYSTEM');
        }

        const createdAt = iso(at);
        const expiresAt = iso(new Date(at.getTime() + WEBRTC_SESSION_TTL_MS));
        const sessionId = newEntityId('wbs');
        const record: WebRtcSessionRecord = {
          sessionId,
          entityType: 'CONTRACT',
          entityId,
          initiatorId: actor.id,
          status: 'CREATED',
          createdAt,
          expiresAt,
          retentionUntil: expiresAt,
          nextMessageSequence: 0,
        };
        await stores.sessions.createSession(record);
        await stores.sessions.createParticipant({
          sessionId, userId: contract.employerId, role: 'EMPLOYER', invitedAt: createdAt,
          ...(actor.id === contract.employerId ? { joinedAt: createdAt } : {}),
        });
        await stores.sessions.createParticipant({
          sessionId, userId: contract.employeeId, role: 'CANDIDATE', invitedAt: createdAt,
          ...(actor.id === contract.employeeId ? { joinedAt: createdAt } : {}),
        });
        await stores.sessions.appendMessage({
          messageId: newEntityId('wsm'), sessionId, participantId: actor.id, receiverId: peer.userId,
          type: 'INVITATION', payload: {}, createdAt,
        });
        await stores.outbox.append(createDomainEvent({
          eventType: 'WEBRTC_SESSION_INVITED',
          aggregateType: 'contract',
          aggregateId: entityId,
          actorId: actor.id,
          timestamp: createdAt,
          source: WEBRTC_API_SOURCE,
          correlationId: command.requestId,
          causationId: sessionId,
          payload: {
            contractId: entityId,
            sessionId,
            employerId: contract.employerId,
            employeeId: contract.employeeId,
            party: role === 'EMPLOYER' ? 'EMPLOYER' : 'EMPLOYEE',
          },
        }));
        await appendAudit(stores, {
          actorId: actor.id,
          at: createdAt,
          sessionId,
          action: 'WEBRTC_SESSION_CREATED',
          afterState: { status: 'CREATED', entityType: 'CONTRACT', entityId, expiresAt },
          reference: command.requestId,
        });
        await stores.idempotency.complete(actor.id, 'webrtc.sessions.create', command.idempotencyKey, { sessionId });
        return toSessionView(record, await stores.sessions.listParticipants(sessionId));
      });
    } catch (error) {
      translateUniqueError(error);
    }
  };

  const listMine: WebRtcSessionRepository['listMine'] = async (actor, requestedLimit, cursor) => {
    const at = clock();
    const limit = normalizePageLimit(requestedLimit);
    if (cursor !== undefined && cursor !== null) ensureSessionId(cursor);
    return inTransaction(async stores => {
      await validateActor(stores, actor, at);
      const rows = await stores.sessions.listForParticipant(actor.id, limit + 1, cursor);
      const visible: WebRtcSessionView[] = [];
      for (const row of rows.slice(0, limit)) {
        const authorized = await loadAuthorized(stores, actor, row.sessionId, at, { lock: true });
        visible.push(await viewInTransaction(stores, authorized.record));
      }
      const hasMore = rows.length > limit;
      return {
        items: visible,
        cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].sessionId : null,
        limit,
        hasMore,
      };
    });
  };

  const get: WebRtcSessionRepository['get'] = async (actor, sessionId) => {
    const at = clock();
    return inTransaction(async stores => {
      const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      return viewInTransaction(stores, authorized.record);
    });
  };

  const join: WebRtcSessionRepository['join'] = async (actor, sessionId) => {
    const at = clock();
    return inTransaction(async stores => {
      const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      requireUsable(authorized);
      if (actor.id === authorized.record.initiatorId) {
        throw createConflict('La session est déjà initiée par ce participant.');
      }
      if (!authorized.participant.joinedAt) {
        const joinedAt = iso(at);
        await stores.sessions.markParticipantJoined(sessionId, actor.id, joinedAt);
        const updated = await stores.sessions.transitionStatus({
          sessionId,
          expected: ['CREATED'],
          status: 'CONNECTING',
          at: joinedAt,
        });
        const current = updated ?? await stores.sessions.findSession(sessionId);
        if (!current) throw new ApiError('NOT_FOUND', 'Session WebRTC introuvable.');
        await stores.sessions.appendMessage({
          messageId: newEntityId('wsm'), sessionId, participantId: actor.id, receiverId: authorized.peer.userId,
          type: 'PARTICIPANT_JOINED', payload: {}, createdAt: joinedAt,
        });
        await appendAudit(stores, {
          actorId: actor.id,
          at: joinedAt,
          sessionId,
          action: 'WEBRTC_PARTICIPANT_JOINED',
          beforeState: { status: authorized.record.status },
          afterState: { status: current.status, participantRole: authorized.participant.role },
        });
        return viewInTransaction(stores, current);
      }
      return viewInTransaction(stores, authorized.record);
    });
  };

  const issueCredential: WebRtcSessionRepository['issueCredential'] = async (actor, sessionId) => {
    const at = clock();
    return inTransaction(async stores => {
      const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      requireUsable(authorized);
      if (authorized.participants.some(participant => !participant.joinedAt)) {
        throw createConflict('Les deux participants doivent rejoindre avant l’émission du credential.');
      }
      const plaintext = newOpaqueSessionToken();
      const expiresAt = iso(new Date(at.getTime() + WEBRTC_CREDENTIAL_TTL_MS));
      await stores.sessions.revokeCredentialsForParticipant(sessionId, actor.id, iso(at));
      const credential: WebRtcCredentialRecord = {
        credentialId: newEntityId('wbc'),
        sessionId,
        participantId: actor.id,
        authSessionId: actor.sessionId,
        tokenHash: await hashSessionToken(plaintext),
        issuedAt: iso(at),
        expiresAt,
      };
      await stores.sessions.createCredential(credential);
      await appendAudit(stores, {
        actorId: actor.id,
        at: iso(at),
        sessionId,
        action: 'WEBRTC_CREDENTIAL_ISSUED',
        afterState: { expiresAt, transport: 'REST_POLLING' },
      });
      return {
        credential: plaintext,
        sessionId,
        participantId: actor.id,
        expiresAt,
        transport: 'REST_POLLING',
        endpoint: `/api/v1/webrtc-sessions/${encodeURIComponent(sessionId)}/signaling`,
      };
    });
  };

  const getIceConfiguration: WebRtcSessionRepository['getIceConfiguration'] = async (actor, sessionId) => {
    const at = clock();
    const authorized = await inTransaction(async stores => {
      const current = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      requireUsable(current);
      if (current.participants.some(participant => !participant.joinedAt)) {
        throw createConflict('Les deux participants doivent rejoindre avant la configuration ICE.');
      }
      return current;
    });
    if (!dependencies.iceConfigurationIssuer) return notConfiguredIceConfiguration();
    try {
      const configuration = await dependencies.iceConfigurationIssuer.issueForActor(actor, authorized.record.sessionId);
      return validateWebRtcIceConfiguration(configuration, at);
    } catch {
      return blockedIceConfiguration();
    }
  };

  const sendSignal: WebRtcSessionRepository['sendSignal'] = async (actor, sessionId, rawInput, command, rawCredential) => {
    const at = clock();
    const input = validateWebRtcSignalInput(rawInput);
    if (!command?.idempotencyKey || command.actor.id !== actor.id) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
    return inTransaction(async stores => {
      const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      requireUsable(authorized);
      await requireCredential(stores, authorized, actor, rawCredential, at);
      if (authorized.participants.some(participant => !participant.joinedAt)) {
        throw createConflict('Les deux participants doivent rejoindre avant la signalisation.');
      }
      const keyHash = await hashSessionToken(command.idempotencyKey);
      const payloadHash = await sha256Fingerprint({ type: input.type, payload: input.payload });
      const replay = await stores.sessions.findMessageByClientKey(sessionId, actor.id, keyHash);
      if (replay) {
        if (replay.type !== input.type || replay.payloadHash !== payloadHash) {
          throw new ApiError('IDEMPOTENCY_CONFLICT', 'La clé d’idempotence a déjà servi à un autre message de signalisation.');
        }
        return toMessageView(replay);
      }
      if (authorized.record.status === 'CREATED') throw createConflict('La négociation WebRTC n’a pas encore commencé.');
      if (input.type === 'OFFER') {
        if (actor.id !== authorized.record.initiatorId) throw new ApiError('FORBIDDEN', 'Seul l’initiateur peut émettre l’offre.');
        if (await stores.sessions.hasMessageType(sessionId, 'OFFER')) throw createConflict('Une seule offre initiale est autorisée.');
      } else if (input.type === 'ANSWER') {
        if (actor.id === authorized.record.initiatorId) throw new ApiError('FORBIDDEN', 'Seul le participant invité peut répondre à l’offre.');
        if (!await stores.sessions.hasMessageType(sessionId, 'OFFER')) throw createConflict('Une offre doit être reçue avant la réponse.');
        if (await stores.sessions.hasMessageType(sessionId, 'ANSWER')) throw createConflict('Une seule réponse est autorisée.');
      } else if (!await stores.sessions.hasMessageType(sessionId, 'OFFER')) {
        throw createConflict('Un candidat ICE ne peut être émis avant l’offre.');
      }
      const message = await stores.sessions.appendMessage({
        messageId: newEntityId('wsm'),
        sessionId,
        participantId: actor.id,
        receiverId: authorized.peer.userId,
        type: input.type,
        payload: input.payload,
        payloadHash,
        clientMessageKeyHash: keyHash,
        createdAt: iso(at),
      });
      return toMessageView(message);
    });
  };

  const reportTransportConnected: WebRtcSessionRepository['reportTransportConnected'] = async (actor, sessionId, command, rawCredential) => {
    const at = clock();
    if (!command?.idempotencyKey || command.actor.id !== actor.id) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
    return inTransaction(async stores => {
      const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      requireUsable(authorized);
      await requireCredential(stores, authorized, actor, rawCredential, at);
      if (!await stores.sessions.hasMessageType(sessionId, 'ANSWER')) {
        throw createConflict('L’offre et la réponse doivent être échangées avant la confirmation de connexion.');
      }
      const keyHash = await hashSessionToken(command.idempotencyKey);
      const existing = await stores.sessions.findMessageByClientKey(sessionId, actor.id, keyHash);
      if (existing) {
        if (existing.type !== 'TRANSPORT_CONNECTED') throw new ApiError('IDEMPOTENCY_CONFLICT', 'La clé d’idempotence a déjà servi à un autre message.');
        return viewInTransaction(stores, authorized.record);
      }
      if (!await stores.sessions.hasMessageFromParticipant(sessionId, 'TRANSPORT_CONNECTED', actor.id)) {
        await stores.sessions.appendMessage({
          messageId: newEntityId('wsm'), sessionId, participantId: actor.id, receiverId: authorized.peer.userId,
          type: 'TRANSPORT_CONNECTED', payload: {}, payloadHash: await sha256Fingerprint({ type: 'TRANSPORT_CONNECTED' }),
          clientMessageKeyHash: keyHash, createdAt: iso(at),
        });
      }
      const bothReported = await Promise.all(authorized.participants.map(participant =>
        stores.sessions.hasMessageFromParticipant(sessionId, 'TRANSPORT_CONNECTED', participant.userId),
      ));
      let current = authorized.record;
      if (bothReported.every(Boolean) && current.status === 'CONNECTING') {
        const updated = await stores.sessions.transitionStatus({
          sessionId,
          expected: ['CONNECTING'],
          status: 'ACTIVE',
          at: iso(at),
        });
        current = updated ?? await stores.sessions.findSession(sessionId) ?? current;
        if (updated) {
          await appendAudit(stores, {
            actorId: actor.id,
            at: iso(at),
            sessionId,
            action: 'WEBRTC_TRANSPORT_REPORTED_CONNECTED',
            beforeState: { status: 'CONNECTING' },
            afterState: { status: 'ACTIVE', evidence: 'both-participants-client-reported' },
          });
        }
      }
      return viewInTransaction(stores, current);
    });
  };

  const poll: WebRtcSessionRepository['poll'] = async (actor, sessionId, afterSequence, requestedLimit, rawCredential) => {
    const at = clock();
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new ApiError('VALIDATION_ERROR', 'Le curseur de signalisation est invalide.');
    const limit = normalizePollLimit(requestedLimit);
    return inTransaction(async stores => {
      const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      requireUsable(authorized);
      await requireCredential(stores, authorized, actor, rawCredential, at);
      if (!authorized.participant.joinedAt || !authorized.peer.joinedAt) {
        throw createConflict('Les deux participants doivent rejoindre avant la lecture des messages.');
      }
      const records = await stores.sessions.listMessagesForRecipient({
        sessionId,
        receiverId: actor.id,
        afterSequence,
        limit: limit + 1,
      });
      const hasMore = records.length > limit;
      const messages = records.slice(0, limit).map(toMessageView);
      return {
        messages,
        nextSequence: messages.length > 0 ? messages[messages.length - 1].sequence : afterSequence,
        hasMore,
      };
    });
  };

  const close: WebRtcSessionRepository['close'] = async (actor, sessionId, command) => {
    const at = clock();
    if (command && command.actor.id !== actor.id) throw new ApiError('FORBIDDEN', 'Contexte de commande invalide.');
    return inTransaction(async stores => {
      const authorized = await loadAuthorized(stores, actor, sessionId, at, { lock: true });
      if (activeSessionStatus(authorized.record.status)) {
        const record = await closeInternal(stores, authorized.record, 'CLOSED', at, actor.id, command?.requestId);
        return viewInTransaction(stores, record);
      }
      return viewInTransaction(stores, authorized.record);
    });
  };

  const runScheduledMaintenance: WebRtcSessionRepository['runScheduledMaintenance'] = async () => {
    const at = clock();
    return inTransaction(async stores => {
      const due = await stores.sessions.listLiveDue({ at: iso(at), limit: WEBRTC_MAINTENANCE_BATCH_SIZE });
      let expired = 0;
      for (const dueSession of due) {
        const record = await stores.sessions.findSessionForUpdate(dueSession.sessionId);
        if (!record || !activeSessionStatus(record.status) || Date.parse(record.expiresAt) > at.getTime()) continue;
        const updated = await closeInternal(stores, record, 'EXPIRED', at, 'SYSTEM');
        if (updated.status === 'EXPIRED') expired += 1;
      }
      const dueForPurge = await stores.sessions.listRetentionDue({ at: iso(at), limit: WEBRTC_MAINTENANCE_BATCH_SIZE });
      const purged = await stores.sessions.deleteSessions(dueForPurge.map(record => record.sessionId));
      return { expired, purged };
    });
  };

  return { listMine, create, get, join, issueCredential, getIceConfiguration, sendSignal, reportTransportConnected, poll, close, runScheduledMaintenance };
}
