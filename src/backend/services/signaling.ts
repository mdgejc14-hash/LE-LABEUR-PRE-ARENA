import { SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS, type AuthenticatedActor, type ShortLivedIceConfiguration, type ShortLivedSignalingCredential, type WebRtcIceConfiguration } from '../productionContracts';

export const SIGNALING_CREDENTIAL_POLICY = {
  audience: 'lelabeur-signaling',
  maximumLifetimeSeconds: SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS,
  identitySource: 'authenticated server session',
  clientSuppliedUserIdIsAuthority: false,
  permanentClientSecret: false,
  verifyCallParticipantMembership: true,
  transport: 'wss',
} as const;

export const ICE_CONFIGURATION_POLICY = {
  maximumLifetimeSeconds: SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS,
  identitySource: 'authenticated server session',
  bindToActiveCallParticipants: true,
  permanentClientSecret: false,
} as const;

/**
 * P0-WEBRTC — persisted session transport policy. This is intentionally distinct
 * from the existing DEMO/legacy WebSocket adapter above: the implemented API
 * uses same-origin REST polling and does not imply a Durable Object or WSS
 * endpoint. Session membership and the current user-session are checked server-side.
 */
export const PERSISTED_WEBRTC_SIGNALING_POLICY = {
  transport: 'REST_POLLING',
  identitySource: 'authenticated server session',
  participantIdsClientSuppliedAsAuthority: false,
  contractPartiesDerivedFromPersistence: true,
  shortLivedSessionCredentialBoundToUserSession: true,
  pollRecipientBoundToAuthenticatedParticipant: true,
  payloadsRedactedAtSessionTermination: true,
  mediaStorage: false,
} as const;

export interface WebRtcSessionIceConfigurationIssuer {
  issueForActor(actor: AuthenticatedActor, sessionId: string): Promise<WebRtcIceConfiguration>;
}

export interface ActiveCallParticipants {
  callId: string;
  participantIds: readonly string[];
  status: string;
}

export interface CallParticipantRepository {
  findActiveCall(callId: string): Promise<ActiveCallParticipants | null>;
  isParticipant(callId: string, actorId: string): Promise<boolean>;
}

/** Server-only issuer; signing keys stay in Worker secrets, never VITE_*. */
export interface SignalingCredentialIssuer {
  issueForActor(actor: AuthenticatedActor, callId?: string): Promise<ShortLivedSignalingCredential>;
}

/** TURN credentials are temporary and scoped to the authenticated active call. */
export interface IceConfigurationIssuer {
  issueForActor(actor: AuthenticatedActor, callId: string): Promise<ShortLivedIceConfiguration>;
}
