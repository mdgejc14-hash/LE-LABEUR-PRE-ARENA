import type { AuthenticatedActor, GoogleCredentialExchange, GoogleCredentialVerifier, GoogleExternalIdentity } from '../productionContracts';
import type { UserRole } from '../../types';

export type SelfAssignableRole = Exclude<UserRole, 'ADMIN'>;

export interface ServerSession {
  actor: AuthenticatedActor;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface SessionRepository {
  findByOpaqueSessionId(sessionId: string): Promise<ServerSession | null>;
  createForActor(actorId: string, expiresAt: string): Promise<ServerSession>;
  revoke(sessionId: string, revokedAt: string): Promise<void>;
}

export interface GoogleAccountLinkRepository {
  /** Unique external identity is stored as provider + verified Google `sub`. */
  findByExternalSubject(provider: 'GOOGLE', subject: string): Promise<{ actorId: string } | null>;
  linkVerifiedIdentity(input: {
    actorId: string;
    provider: 'GOOGLE';
    subject: string;
    verifiedEmail: string;
    linkedAt: string;
  }): Promise<void>;
}

export interface GoogleAuthResult {
  /** Client-safe session result; no bearer credential or server permission set. */
  userId: string;
  role: SelfAssignableRole;
  displayName: string;
  email: string;
  avatarUrl?: string;
  expiresAt: string;
}

/**
 * Authentication boundary for later implementation. The verifier must check
 * Google signature, issuer, audience, expiry and verified-email claims. The
 * Google `sub` is the stable external identity; email is not its primary key.
 */
export interface AuthenticationService {
  authenticateRequest(request: Request): Promise<AuthenticatedActor | null>;
  exchangeGoogleCredential(input: GoogleCredentialExchange): Promise<GoogleAuthResult>;
  logout(request: Request): Promise<void>;
}

export interface AuthenticationDependencies {
  googleVerifier: GoogleCredentialVerifier;
  sessions: SessionRepository;
  googleAccounts: GoogleAccountLinkRepository;
  now(): Date;
}

/**
 * The concrete authentication implementation is intentionally not supplied in
 * this pass: there are no provider credentials or persistent session store.
 * These dependencies make the eventual verifier and server session explicit.
 */
export type VerifiedGoogleIdentity = GoogleExternalIdentity;
