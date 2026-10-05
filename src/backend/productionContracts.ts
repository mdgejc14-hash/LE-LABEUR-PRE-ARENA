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
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'CONTRACT_SIGNED'
  | 'INCIDENT_OPENED'
  | 'INCIDENT_DECIDED'
  | 'REPLACEMENT_CREATED'
  | 'CANDIDATE_TRANSFERRED'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_UNBLOCKED'
  | 'PAYMENT_OVERDUE_J3'
  /**
   * P0-E3/P0-E4 — cycle CANDIDATURE : types DÉCLARÉS pour le futur moteur
   * transactional Outbox/Queue, non encore produits. P0-E4 persiste uniquement
   * la transition dans la transaction PostgreSQL; aucun événement n'est écrit,
   * aucune file n'est créée, aucun consumer n'est installé.
   * Contrats documentés : `src/domain/applicationTransitions.ts`
   * (`DOCUMENTED_APPLICATION_EVENTS`).
   */
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_EXAMINED'
  | 'APPLICATION_SHORTLISTED'
  | 'APPLICATION_REJECTED'
  | 'APPLICATION_WITHDRAWN'
  /**
   * P0-E5 — cycle PROPOSITION d'embauche : types DÉCLARÉS pour le futur moteur
   * transactional Outbox/Queue, non encore produits. P0-E5 persiste uniquement
   * la transition dans la transaction PostgreSQL; aucun événement n'est écrit,
   * aucune file n'est créée, aucun consumer n'est installé.
   * Contrats documentés : `src/domain/proposalTransitions.ts`
   * (`DOCUMENTED_PROPOSAL_EVENTS`).
   */
  | 'PROPOSAL_SENT'
  | 'PROPOSAL_ACCEPTED'
  | 'PROPOSAL_DECLINED'
  | 'PROPOSAL_EXPIRED';

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
