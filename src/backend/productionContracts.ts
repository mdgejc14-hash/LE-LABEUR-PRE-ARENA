/**
 * LE LABEUR — contrats de frontière production.
 *
 * Ce fichier ne contient aucun adaptateur de base de données ni aucune
 * garantie de persistance. Les acteurs décrits ici sont construits côté
 * serveur après validation de la session; ils ne sont jamais acceptés depuis
 * un champ de requête client.
 */

import type { PaymentScheduleEntry, UserProfile, UserRole } from '../types';

export type Permission =
  | 'users:read:any'
  | 'users:block'
  | 'users:unblock'
  | 'offers:read:any'
  | 'offers:moderate'
  | 'applications:read:any'
  | 'applications:moderate'
  | 'contracts:read:any'
  | 'contracts:moderate'
  | 'payments:read:any'
  | 'payments:approve'
  | 'payments:reject'
  | 'schedules:read:any'
  | 'incidents:read:any'
  | 'incidents:arbitrate'
  | 'replacements:read:any'
  | 'replacements:manage'
  | 'notifications:read:any'
  | 'calls:read:any'
  | 'match:read:any'
  | 'communications:read:any'
  | 'documents:read:any'
  | 'audit:read'
  | 'stats:read';

/**
 * Identité autorisée d'une requête, issue de la session vérifiée côté serveur.
 * Ne pas sérialiser cet objet dans une réponse API ni le prendre depuis le body.
 */
export interface AuthenticatedActor {
  readonly id: string;
  readonly role: UserRole;
  readonly permissions: readonly Permission[];
  readonly sessionId: string;
}

/** Alias historique conservé pendant la transition de frontière. */
export type ServerActor = AuthenticatedActor;

export interface CursorPage<T> {
  items: T[];
  cursor: string | null;
  limit: number;
  hasMore: boolean;
}

export interface PageRequest {
  cursor: string | null;
  limit: number;
}

/** Public directory projection: no email, phone, address, Google sub or account state. */
export type PublicProfileProjection = Pick<UserProfile,
  | 'id' | 'publicId' | 'role' | 'fullName' | 'name' | 'verified' | 'firstName' | 'lastName'
  | 'headline' | 'location' | 'departmentId' | 'communeId' | 'arrondissementId' | 'localityId'
  | 'avatarUrl' | 'bio' | 'skills' | 'experienceYears' | 'desiredContract' | 'desiredSalary'
  | 'availability' | 'portfolio' | 'matchCompatibility' | 'companyName' | 'activity' | 'teamSize'
  | 'foundedYear' | 'formations' | 'certifications'
>;

export interface ProductionCommandContext {
  /** Construit depuis la session authentifiée, jamais depuis le client. */
  actor: AuthenticatedActor;
  command: string;
  /** Reçu depuis l'en-tête Idempotency-Key; la persistance est future. */
  idempotencyKey: string;
  requestId: string;
}

export interface IdempotencyRecord<TResult = unknown> {
  key: string;
  actorId: string;
  command: string;
  payloadHash: string;
  status: 'PROCESSING' | 'COMPLETED';
  result?: TResult;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}

export interface IdempotencyStore {
  /**
   * Futur stockage durable et transactionnel. La clé unique est scellée sur
   * (actorId, command, key); un payload différent doit produire un conflit.
   */
  reserve<TResult>(input: Omit<IdempotencyRecord<TResult>, 'status' | 'result' | 'completedAt'>): Promise<
    | { kind: 'reserved' }
    | { kind: 'replay'; result: TResult }
    | { kind: 'conflict' }
    | { kind: 'in-progress' }
  >;
  complete<TResult>(actorId: string, command: string, key: string, result: TResult): Promise<void>;
}

export interface TransactionContext {
  /** Identifiant de corrélation propre à l'implémentation DB future. */
  readonly transactionId: string;
}

export interface TransactionBoundary {
  /** À implémenter avec une vraie transaction DB; aucun fallback mémoire. */
  run<T>(operation: (transaction: TransactionContext) => Promise<T>): Promise<T>;
}

export interface ProductionAuditEvent {
  id: string;
  actorId: string | 'SYSTEM';
  actorRole: UserRole | 'SYSTEM';
  action: string;
  entity: string;
  entityId: string;
  reason?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  requestId: string;
  occurredAt: string;
}

export type OutboxEventType =
  | 'PAYMENT_DECLARED'
  | 'PAYMENT_SUBMITTED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_REJECTED'
  /**
   * P0-PAY-1 — cycle PAIEMENT. Ces types complètent la chaîne
   * `SCHEDULED → DUE → PENDING_VERIFICATION → VERIFIED → PAID` :
   * `PAYMENT_DUE` (échéance atteinte), `PAYMENT_PENDING_VERIFICATION`
   * (déclaration soumise, en attente) et `PAYMENT_PAID` (rapprochement local,
   * AUCUN mouvement de fonds). Ils sont produits dans l'Outbox transactionnelle
   * réelle. P0-SALARY-1 consomme `PAYMENT_PAID` pour les seuls salaires afin de
   * déclencher la demande de confirmation existante; cela ne confirme jamais le
   * salaire du travailleur. Aucun de ces événements ne déclenche de canal de
   * notification, de SMS ni de webhook sortant.
   */
  | 'PAYMENT_DUE'
  | 'PAYMENT_PENDING_VERIFICATION'
  | 'PAYMENT_PAID'
  | 'SALARY_CONFIRMATION_REQUESTED'
  | 'SALARY_CONFIRMED'
  /** P0-PAY-3 — demande de batch normalisé; aucun paiement réel ni notification. */
  | 'PAYMENT_RECONCILIATION_BATCH_REQUESTED'
  /** P0-DISPUTE-1 — claims and evidence workflow; P0-NOTIFICATIONS observes covered events In-App only. */
  | 'CLAIM_CREATED'
  | 'CLAIM_EVIDENCE_REQUESTED'
  | 'CLAIM_EVIDENCE_SUBMITTED'
  | 'CLAIM_DEADLINE_REACHED'
  | 'CLAIM_ESCALATED'
  | 'CLAIM_RESTRICTION_APPLIED'
  | 'CLAIM_RESTRICTION_RELEASED'
  | 'CLAIM_RESOLVED'
  | 'CLAIM_REJECTED'
  | 'CONTRACT_SIGNED'
  | 'INCIDENT_OPENED'
  | 'INCIDENT_DECIDED'
  | 'REPLACEMENT_CREATED'
  | 'CANDIDATE_TRANSFERRED'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_UNBLOCKED'
  | 'PAYMENT_OVERDUE_J3'
  /**
   * P0-E3/P0-E4 — cycle CANDIDATURE : événements Outbox transactionnels.
   * NotificationAutomation observe les types MAPPED sans remplacer les
   * producteurs; APPLICATION_EXAMINED demeure non consommé.
   */
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_EXAMINED'
  | 'APPLICATION_SHORTLISTED'
  | 'APPLICATION_REJECTED'
  | 'APPLICATION_WITHDRAWN'
  /**
   * P0-E5 — cycle PROPOSITION d'embauche : événements Outbox transactionnels.
   * NotificationAutomation observe les événements couverts; l'expiration
   * demeure UNMAPPED et n'émet aucune notification.
   */
  | 'PROPOSAL_SENT'
  | 'PROPOSAL_ACCEPTED'
  | 'PROPOSAL_DECLINED'
  | 'PROPOSAL_EXPIRED'
  /**
   * P0-F/P0-REPLACEMENT — `CONTRACT_ACTIVATED` est produit par le cycle
   * d'activation P0-AUTO-2. Les autres types restent disponibles dans le
   * catalogue de notification, mais P0-REPLACEMENT n'ajoute pas de producteur.
   */
  | 'CONTRACT_CREATED'
  | 'CONTRACT_SENT'
  | 'CONTRACT_ACTIVATED'
  | 'CONTRACT_ENDED'
  | 'CONTRACT_TERMINATED'
  /** P0-WEBRTC — invitation liée à une session de contrat persistée. */
  | 'WEBRTC_SESSION_INVITED';

export interface OutboxEvent {
  id: string;
  type: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  /** Stable key for consumer-side deduplication. */
  dedupeKey: string;
}

export interface OutboxRepository {
  /** Must be inserted through the same transaction as the business mutation. */
  append(transaction: TransactionContext, event: OutboxEvent): Promise<void>;
  claimBatch(limit: number, consumer: string): Promise<OutboxEvent[]>;
  markDelivered(eventId: string, consumer: string, deliveredAt: string): Promise<void>;
  releaseForRetry(eventId: string, consumer: string, reasonCode: string): Promise<void>;
}

/** Minimal, immutable schedule data given to a future J+3 worker. */
export interface ScheduleEntrySnapshot {
  id: PaymentScheduleEntry['id'];
  contractId: PaymentScheduleEntry['contractId'];
  monthNumber: PaymentScheduleEntry['monthNumber'];
  salaryDueDate: PaymentScheduleEntry['salaryDueDate'];
  commissionDueDate: PaymentScheduleEntry['commissionDueDate'];
  salaryAmount: PaymentScheduleEntry['salaryAmount'];
  commissionAmount: PaymentScheduleEntry['commissionAmount'];
  salaryStatus: PaymentScheduleEntry['salaryStatus'];
  commissionStatus: PaymentScheduleEntry['commissionStatus'];
}

export interface DueScheduleJob {
  scheduleEntry: ScheduleEntrySnapshot;
  evaluatedAt: string;
}

export interface ScheduleWorkerResult {
  eventId: string;
  eligibleKinds: Array<'SALARY' | 'COMMISSION'>;
  notified: boolean;
}

/**
 * Contract only: no frontend timer, localStorage scheduler, or mock transaction.
 * The future Cron handler must load eligible rows from persistent storage.
 */
export interface ScheduleWorkerBoundary {
  processDueSchedule(job: DueScheduleJob): Promise<ScheduleWorkerResult>;
}

export interface GoogleExternalIdentity {
  /** Stable Google `sub`, verified server-side. */
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export interface GoogleCredentialExchange {
  credential: string;
  requestedRole: Exclude<UserRole, 'ADMIN'>;
  intent: 'login' | 'register';
}

export interface GoogleCredentialVerifier {
  verifyCredential(credential: string): Promise<GoogleExternalIdentity>;
}

export interface SignalingCredentialClaims {
  /** Matches the current signaling Worker token claim; populated from session only. */
  userId: string;
  exp: number;
  /** Future issuer must constrain the user to the active call/participants. */
  callId?: string;
  participantIds: readonly string[];
  iat: number;
  audience: 'lelabeur-signaling';
}

export const SHORT_LIVED_CALL_CREDENTIAL_MAX_SECONDS = 300;

export interface ShortLivedSignalingCredential {
  credential: string;
  expiresAt: string;
  endpoint: string;
}

export interface ShortLivedIceServerCredential {
  urls: string | readonly string[];
  username?: string;
  credential?: string;
}

export interface ShortLivedIceConfiguration {
  iceServers: ShortLivedIceServerCredential[];
  expiresAt: string;
}

/** P0-WEBRTC — état explicite de l'abstraction STUN/TURN, jamais un faux provider. */
export type WebRtcIceConfigurationState = 'AVAILABLE' | 'NOT_CONFIGURED' | 'BLOCKED_EXTERNAL_ACCESS';

export interface WebRtcIceConfiguration {
  state: WebRtcIceConfigurationState;
  iceServers: ShortLivedIceServerCredential[];
  /** STUN public sans credential: null; TURN temporaire: expiration obligatoire. */
  expiresAt: string | null;
  reason?: string;
}

export type WebRtcEntityType = 'CONTRACT';
export type WebRtcSessionStatus = 'CREATED' | 'CONNECTING' | 'ACTIVE' | 'CLOSED' | 'EXPIRED' | 'FAILED';
export type WebRtcParticipantRole = 'EMPLOYER' | 'CANDIDATE';
export type WebRtcSignalingMessageType =
  | 'INVITATION'
  | 'PARTICIPANT_JOINED'
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'TRANSPORT_CONNECTED'
  | 'SESSION_CLOSED';

export interface WebRtcSessionParticipant {
  userId: string;
  role: WebRtcParticipantRole;
  invitedAt: string;
  joinedAt?: string;
}

/** Projection publique minimale; aucun credential ni payload ICE/SDP n'y figure. */
export interface WebRtcSessionView {
  sessionId: string;
  entityType: WebRtcEntityType;
  entityId: string;
  initiatorId: string;
  participants: WebRtcSessionParticipant[];
  status: WebRtcSessionStatus;
  createdAt: string;
  expiresAt: string;
  closedAt?: string;
}

/** Le payload est exposé uniquement à l'autre participant, pendant la session. */
export interface WebRtcSignalingMessage {
  messageId: string;
  sessionId: string;
  sequence: number;
  participantId: string;
  receiverId: string;
  timestamp: string;
  type: WebRtcSignalingMessageType;
  payload: Record<string, unknown>;
}

/** Credential opaque, de portée session/participant et limité à cinq minutes. */
export interface WebRtcSessionCredential {
  credential: string;
  sessionId: string;
  participantId: string;
  expiresAt: string;
  transport: 'REST_POLLING';
  endpoint: string;
}

export interface DocumentMetadata {
  id: string;
  ownerId?: string;
  title: string;
  fileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  objectKey: string;
  createdAt: string;
}

export interface SignedDocumentUrl {
  url: string;
  expiresAt: string;
}
