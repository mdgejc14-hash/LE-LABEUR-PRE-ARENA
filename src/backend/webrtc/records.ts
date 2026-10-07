/** P0-WEBRTC — persistence ports for a temporary, contract-linked WebRTC session. */

import type {
  WebRtcEntityType,
  WebRtcParticipantRole,
  WebRtcSessionStatus,
  WebRtcSignalingMessageType,
} from '../productionContracts';

export interface WebRtcSessionRecord {
  sessionId: string;
  entityType: WebRtcEntityType;
  entityId: string;
  initiatorId: string;
  status: WebRtcSessionStatus;
  createdAt: string;
  expiresAt: string;
  closedAt?: string;
  retentionUntil: string;
  nextMessageSequence: number;
}

export interface WebRtcParticipantRecord {
  sessionId: string;
  userId: string;
  role: WebRtcParticipantRole;
  invitedAt: string;
  joinedAt?: string;
}

export interface WebRtcSignalingMessageRecord {
  messageId: string;
  sessionId: string;
  sequence: number;
  participantId: string;
  receiverId: string;
  type: WebRtcSignalingMessageType;
  payload: Record<string, unknown>;
  payloadHash?: string;
  clientMessageKeyHash?: string;
  createdAt: string;
  payloadRedactedAt?: string;
}

export interface WebRtcCredentialRecord {
  credentialId: string;
  sessionId: string;
  participantId: string;
  authSessionId: string;
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface WebRtcSessionStore {
  findSession(sessionId: string): Promise<WebRtcSessionRecord | null>;
  /** Locks the session row for status/message/credential compare-and-set operations. */
  findSessionForUpdate(sessionId: string): Promise<WebRtcSessionRecord | null>;
  findLiveSessionForEntity(entityType: WebRtcEntityType, entityId: string): Promise<WebRtcSessionRecord | null>;
  listForParticipant(userId: string, limit: number, afterId?: string | null): Promise<WebRtcSessionRecord[]>;
  listParticipants(sessionId: string): Promise<WebRtcParticipantRecord[]>;
  findParticipant(sessionId: string, userId: string): Promise<WebRtcParticipantRecord | null>;
  createSession(record: WebRtcSessionRecord): Promise<WebRtcSessionRecord>;
  createParticipant(record: WebRtcParticipantRecord): Promise<WebRtcParticipantRecord>;
  markParticipantJoined(sessionId: string, userId: string, at: string): Promise<WebRtcParticipantRecord | null>;
  transitionStatus(input: {
    sessionId: string;
    expected: readonly WebRtcSessionStatus[];
    status: WebRtcSessionStatus;
    at: string;
    retentionUntil?: string;
  }): Promise<WebRtcSessionRecord | null>;
  hasMessageType(sessionId: string, type: WebRtcSignalingMessageType): Promise<boolean>;
  hasMessageFromParticipant(sessionId: string, type: WebRtcSignalingMessageType, participantId: string): Promise<boolean>;
  findMessageByClientKey(sessionId: string, participantId: string, keyHash: string): Promise<WebRtcSignalingMessageRecord | null>;
  appendMessage(record: Omit<WebRtcSignalingMessageRecord, 'sequence'>): Promise<WebRtcSignalingMessageRecord>;
  listMessagesForRecipient(input: {
    sessionId: string;
    receiverId: string;
    afterSequence: number;
    limit: number;
  }): Promise<WebRtcSignalingMessageRecord[]>;
  redactSignalingPayloads(sessionId: string, at: string): Promise<number>;
  revokeCredentialsForParticipant(sessionId: string, participantId: string, at: string): Promise<number>;
  revokeCredentialsForSession(sessionId: string, at: string): Promise<number>;
  createCredential(record: WebRtcCredentialRecord): Promise<WebRtcCredentialRecord>;
  findCredentialByHash(tokenHash: string): Promise<WebRtcCredentialRecord | null>;
  isAuthenticationSessionActive(authSessionId: string, userId: string, at: string): Promise<boolean>;
  listLiveDue(input: { at: string; limit: number }): Promise<WebRtcSessionRecord[]>;
  listRetentionDue(input: { at: string; limit: number }): Promise<WebRtcSessionRecord[]>;
  deleteSessions(sessionIds: readonly string[]): Promise<number>;
}

export const WEBRTC_SESSION_LIVE_STATUSES: readonly WebRtcSessionStatus[] = ['CREATED', 'CONNECTING', 'ACTIVE'];
export const WEBRTC_SESSION_TERMINAL_STATUSES: readonly WebRtcSessionStatus[] = ['CLOSED', 'EXPIRED', 'FAILED'];
export const WEBRTC_SIGNALING_PAYLOAD_MESSAGE_TYPES: readonly WebRtcSignalingMessageType[] = ['OFFER', 'ANSWER', 'ICE_CANDIDATE'];
