import type {
  AppNotification,
  Application,
  CommissionPaymentRecord,
  CommunicationEvent,
  CallRecord,
  ChatMessage,
  Contract,
  Conversation,
  FilterState,
  Incident,
  MissionProposal,
  Offer,
  ReplacementDossier,
  ResourceDocument,
  SystemAuditLog,
  UserProfile,
  UserRole,
} from '../../types';
import type { RevenueMetrics } from '../../repositories/interfaces';
import type {
  AuthenticatedActor,
  CursorPage,
  DocumentMetadata,
  DueScheduleJob,
  GoogleCredentialExchange,
  ProductionAuditEvent,
  ProductionCommandContext,
  PublicProfileProjection,
  ScheduleEntrySnapshot,
  ShortLivedIceConfiguration,
  ShortLivedSignalingCredential,
} from '../productionContracts';
import type { GoogleAuthResult } from '../services/authentication';
import type { CreateDocumentMetadata, DocumentService, DocumentUploadGrant } from '../services/documents';
import type { OpenClaimRepository } from '../disputes/claimRepository';

export type ServerSelfProfilePatch = Partial<Pick<UserProfile,
  | 'fullName' | 'firstName' | 'lastName' | 'phone' | 'headline' | 'location'
  | 'departmentId' | 'communeId' | 'arrondissementId' | 'localityId' | 'detailedAddress'
  | 'avatarUrl' | 'bio' | 'skills' | 'experienceYears' | 'desiredContract' | 'desiredSalary'
  | 'availability' | 'portfolio' | 'formations' | 'certifications' | 'companyName'
  | 'managerName' | 'activity' | 'teamSize' | 'foundedYear'
>>;

export type ServerCreateOfferInput = Omit<Offer,
  'id' | 'employerId' | 'employerName' | 'employerPublicId' | 'employerLocation' | 'employerAvatar' | 'postedDate' | 'compatibilityScore' | 'status' | 'isLeLabeurJob' | 'leLabeurTag'
>;

export type ServerCreateProposalInput = Omit<MissionProposal,
  'id' | 'conversationId' | 'contractId' | 'employerId' | 'employeeId' | 'employerName' | 'employeeName' | 'status' | 'sentAt' | 'updatedAt'
>;

/**
 * P0-F — création d'un contrat depuis une proposition ACCEPTED.
 *
 * Seule la proposition d'origine est fournie : `offerId`, `applicationId`,
 * `employerId`, `employeeId` et **toutes les modalités acceptées** (montant,
 * devise, périodicité, date de début, durée, lieu, conditions) sont dérivés
 * côté serveur de la chaîne persistée Offer → Application → Proposal. Aucun
 * acteur ni aucun montant ne peut donc être imposé par le client.
 */
export interface ServerCreateContractInput {
  proposalId: string;
  additionalNotes?: string;
}

export interface ServerIncidentReportInput {
  contractId: string;
  reason: string;
  description: string;
  evidenceNote?: string;
  evidenceDocumentId?: string;
}

export interface ServerPaymentDeclarationInput {
  contractId: string;
  monthNumber: number;
  senderPhone: string;
  transactionId: string;
  amountPaid: number;
  reference?: string;
  paymentDate?: string;
  paymentTime?: string;
  proofDocumentId: string;
  notes?: string;
}

/**
 * Server-side repository ports. Actor is injected by trusted API middleware;
 * methods must never accept actorId/role from the request body as authority.
 */
export interface ServerAuthRepository {
  getSessionActor(actor: AuthenticatedActor): Promise<AuthenticatedActor>;
  authenticateGoogleCredential(input: GoogleCredentialExchange): Promise<GoogleAuthResult>;
  revokeOwnSession(actor: AuthenticatedActor): Promise<void>;
}

export interface ServerUserRepository {
  getMyProfile(actor: AuthenticatedActor): Promise<UserProfile>;
  updateMyProfile(actor: AuthenticatedActor, patch: ServerSelfProfilePatch): Promise<UserProfile>;
  getProfile(actor: AuthenticatedActor, userId: string): Promise<UserProfile | null>;
  searchPublicCandidates(actor: AuthenticatedActor | null, filter: Partial<FilterState>, page: { cursor: string | null; limit: number }): Promise<CursorPage<PublicProfileProjection>>;
  searchPublicEmployers(actor: AuthenticatedActor | null, page: { cursor: string | null; limit: number }): Promise<CursorPage<PublicProfileProjection>>;
}

export interface ServerOfferRepository {
  listPublicOffers(actor: AuthenticatedActor | null, filter: FilterState, page: { cursor: string | null; limit: number }): Promise<CursorPage<Offer>>;
  getOffer(actor: AuthenticatedActor | null, offerId: string): Promise<Offer | null>;
  getMyOffers(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Offer>>;
  createOffer(actor: AuthenticatedActor, data: ServerCreateOfferInput, command: ProductionCommandContext): Promise<Offer>;
  setOfferStatus(actor: AuthenticatedActor, offerId: string, status: Offer['status'], command: ProductionCommandContext): Promise<Offer>;
}

export interface ServerApplicationSubmissionInput {
  /** Optional short candidate note; all identity and offer fields are server-derived. */
  note?: string;
}

export interface ServerApplicationRepository {
  getMyApplications(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Application>>;
  getEmployerApplications(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Application>>;
  getAdminApplications(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Application>>;
  getApplication(actor: AuthenticatedActor, applicationId: string): Promise<Application | null>;
  listApplicationsForOffer(actor: AuthenticatedActor, offerId: string, page: { cursor: string | null; limit: number }): Promise<CursorPage<Application>>;
  applyToOffer(actor: AuthenticatedActor, offerId: string, command: ProductionCommandContext, payload?: ServerApplicationSubmissionInput): Promise<Application>;
  withdraw(actor: AuthenticatedActor, applicationId: string, command: ProductionCommandContext): Promise<Application>;
  examine(actor: AuthenticatedActor, applicationId: string, command: ProductionCommandContext): Promise<Application>;
  shortlist(actor: AuthenticatedActor, applicationId: string, command: ProductionCommandContext): Promise<Application>;
  reject(actor: AuthenticatedActor, applicationId: string, note: string | undefined, command: ProductionCommandContext): Promise<Application>;
}

export interface ServerProposalRepository {
  getAdminProposals(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<MissionProposal>>;
  createProposal(actor: AuthenticatedActor, conversationId: string, proposal: ServerCreateProposalInput, command: ProductionCommandContext): Promise<MissionProposal>;
  respondToProposal(actor: AuthenticatedActor, proposalId: string, action: 'ACCEPT' | 'REVISE' | 'DECLINE', notes: string | undefined, command: ProductionCommandContext): Promise<MissionProposal>;
  /**
   * P0-E5 — expiration explicite d'une proposition (`SENT → EXPIRED`).
   * Le moteur Cron/Queue futur produira la même transition ; aucun scheduler
   * n'existe à cette étape (`src/domain/proposalTransitions.ts`).
   */
  expireProposal(actor: AuthenticatedActor, proposalId: string, command: ProductionCommandContext): Promise<MissionProposal>;
}

export interface ServerContractRepository {
  getMyContracts(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Contract>>;
  getAdminContracts(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Contract>>;
  getContract(actor: AuthenticatedActor, contractId: string): Promise<Contract | null>;
  /** P0-F — création depuis une proposition ACCEPTED (statut initial `DRAFT`). */
  createContract(actor: AuthenticatedActor, data: ServerCreateContractInput, command: ProductionCommandContext): Promise<Contract>;
  /** P0-F — envoi `DRAFT → SIGNATURE` (l'employeur appose sa signature). */
  sendContract(actor: AuthenticatedActor, contractId: string, command: ProductionCommandContext): Promise<Contract>;
  /** P0-F — signature de la partie concernée (`SIGNATURE`, une seule fois par partie). */
  signContract(actor: AuthenticatedActor, contractId: string, command: ProductionCommandContext): Promise<Contract>;
  /** P0-F — activation `SIGNATURE (double signature) → ACTIVE`. */
  activateContract(actor: AuthenticatedActor, contractId: string, command: ProductionCommandContext): Promise<Contract>;
  /** P0-F — fin normale `ACTIVE → COMPLETED` (plan : ENDED). */
  endContract(actor: AuthenticatedActor, contractId: string, command: ProductionCommandContext): Promise<Contract>;
  /** P0-F — rupture motivée `ACTIVE → TERMINATED` (protection M1 conservée). */
  terminateContract(actor: AuthenticatedActor, contractId: string, reason: string, command: ProductionCommandContext): Promise<Contract>;
  /**
   * P0-CONTRACT-POST — finalisation d'embauche sur contrat ACTIF (RÈGLE 21) :
   * offre `ACTIVE → FILLED`, candidature retenue `→ HIRED → CONTRACTED`, autres
   * candidatures ouvertes `→ CLOSED_OFFER_FILLED`. Explicite, idempotente,
   * transactionnelle ; aucun statut nouveau, aucune notification, aucun paiement.
   */
  finalizeHiring(actor: AuthenticatedActor, contractId: string, command: ProductionCommandContext): Promise<Contract>;
  /**
   * P0-CONTRACT-POST / FIN-CONFIRMATION — confirmation de fin d'exécution.
   * Vérifie le contrat ACTIVE, l'autorisation de la partie, la protection M1,
   * la non-concurrence, ajoute l'historique/audit et relie au système de
   * litiges P0-DISPUTE-1 si une contestation est déclarée.
   */
  confirmExecution(actor: AuthenticatedActor, contractId: string, contest?: string, command?: ProductionCommandContext): Promise<Contract>;
  /** Cycle paiements/mensuel — HORS P0-F (reste 501). */
  confirmMonthlyAction(actor: AuthenticatedActor, contractId: string, input: unknown, command: ProductionCommandContext): Promise<Contract>;
}

export interface ServerPaymentRepository {
  getMyPayments(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<CommissionPaymentRecord>>;
  getPayment(actor: AuthenticatedActor, paymentId: string): Promise<CommissionPaymentRecord | null>;
  getContractPayments(actor: AuthenticatedActor, contractId: string, page: { cursor: string | null; limit: number }): Promise<CursorPage<CommissionPaymentRecord>>;
  declarePayment(actor: AuthenticatedActor, input: ServerPaymentDeclarationInput, command: ProductionCommandContext): Promise<CommissionPaymentRecord>;
  getAdminPayments(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<CommissionPaymentRecord>>;
  approvePayment(actor: AuthenticatedActor, paymentId: string, command: ProductionCommandContext): Promise<CommissionPaymentRecord>;
  rejectPayment(actor: AuthenticatedActor, paymentId: string, reason: string, command: ProductionCommandContext): Promise<CommissionPaymentRecord>;
}

export interface ServerScheduleRepository {
  getMySchedules(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<ScheduleEntrySnapshot>>;
  getAdminSchedules(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<ScheduleEntrySnapshot>>;
  loadScheduleEntryForWorker(scheduleEntryId: string): Promise<ScheduleEntrySnapshot | null>;
  findSchedulesDueForEvaluation(asOf: string, limit: number): Promise<ScheduleEntrySnapshot[]>;
}

/** P0-DISPUTE-1 — production Claim cycle, distinct from the legacy DEMO incidents. */
export interface ServerClaimRepository extends OpenClaimRepository {}

export interface ServerIncidentRepository {
  getMyIncidents(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Incident>>;
  getIncident(actor: AuthenticatedActor, incidentId: string): Promise<Incident | null>;
  getAdminIncidents(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Incident>>;
  reportIncident(actor: AuthenticatedActor, input: ServerIncidentReportInput, command: ProductionCommandContext): Promise<Incident>;
  arbitrateIncident(actor: AuthenticatedActor, incidentId: string, decision: NonNullable<Incident['adminDecision']>, note: string, command: ProductionCommandContext): Promise<Incident>;
}

export interface ServerReplacementRepository {
  getMyReplacements(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<ReplacementDossier>>;
  getAdminReplacements(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<ReplacementDossier>>;
  assignCandidate(actor: AuthenticatedActor, replacementId: string, candidateId: string, command: ProductionCommandContext): Promise<ReplacementDossier>;
  transferCandidate(actor: AuthenticatedActor, replacementId: string, command: ProductionCommandContext): Promise<ReplacementDossier>;
  finalizeContract(actor: AuthenticatedActor, replacementId: string, command: ProductionCommandContext): Promise<{ replacement: ReplacementDossier; contract: Contract }>;
}

export interface ServerMessageRepository {
  getMyConversations(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Conversation>>;
  getConversationMessages(actor: AuthenticatedActor, conversationId: string, page: { cursor: string | null; limit: number }): Promise<CursorPage<ChatMessage>>;
  sendMessage(actor: AuthenticatedActor, conversationId: string, text: string, command: ProductionCommandContext): Promise<ChatMessage>;
  markConversationRead(actor: AuthenticatedActor, conversationId: string, command: ProductionCommandContext): Promise<void>;
}

export interface ServerCallRepository {
  getMyCallHistory(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<CallRecord>>;
  initiate(actor: AuthenticatedActor, input: { receiverId: string; conversationId?: string }, command: ProductionCommandContext): Promise<CallRecord>;
  accept(actor: AuthenticatedActor, callId: string, command: ProductionCommandContext): Promise<CallRecord>;
  reject(actor: AuthenticatedActor, callId: string, command: ProductionCommandContext): Promise<CallRecord>;
  end(actor: AuthenticatedActor, callId: string, durationSeconds: number, command: ProductionCommandContext): Promise<CallRecord>;
  issueSignalingCredential(actor: AuthenticatedActor, callId?: string): Promise<ShortLivedSignalingCredential>;
  issueIceConfiguration(actor: AuthenticatedActor, callId: string): Promise<ShortLivedIceConfiguration>;
}

export interface ServerNotificationRepository {
  getMyNotifications(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<AppNotification>>;
  markNotificationRead(actor: AuthenticatedActor, notificationId: string, command: ProductionCommandContext): Promise<void>;
}

export interface ServerAdminRepository {
  getAdminUsers(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<UserProfile>>;
  getAdminOffers(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Offer>>;
  getAdminApplications(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Application>>;
  getAdminContracts(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<Contract>>;
  getAdminNotifications(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<AppNotification>>;
  getAdminCalls(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<CallRecord>>;
  getAdminCommunicationEvents(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<CommunicationEvent>>;
  getAdminStats(actor: AuthenticatedActor): Promise<RevenueMetrics>;
  blockUser(actor: AuthenticatedActor, userId: string, reason: string, command: ProductionCommandContext): Promise<UserProfile>;
  unblockUser(actor: AuthenticatedActor, userId: string, command: ProductionCommandContext): Promise<UserProfile>;
}

export interface ServerAuditRepository {
  getAdminAudit(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<ProductionAuditEvent>>;
  appendBusinessAudit(transactionId: string, event: Omit<ProductionAuditEvent, 'id' | 'occurredAt'>): Promise<void>;
}

export interface ServerDocumentRepository {
  listMyDocuments(actor: AuthenticatedActor, page: { cursor: string | null; limit: number }): Promise<CursorPage<DocumentMetadata>>;
  createUploadGrant(actor: AuthenticatedActor, metadata: Omit<CreateDocumentMetadata, 'ownerId'>): Promise<DocumentUploadGrant>;
  createDownloadGrant(actor: AuthenticatedActor, documentId: string): ReturnType<DocumentService['createDownloadGrant']>;
}

export interface ServerResourceRepository {
  listPublished(actor: AuthenticatedActor | null, targetRole: ResourceDocument['targetRole'] | undefined, page: { cursor: string | null; limit: number }): Promise<CursorPage<ResourceDocument>>;
  getPublished(actor: AuthenticatedActor | null, resourceId: string): Promise<ResourceDocument | null>;
}

/** Composition root for domain adapters behind the future Worker API. */
export interface ProductionRepositoryPorts {
  auth: ServerAuthRepository;
  users: ServerUserRepository;
  offers: ServerOfferRepository;
  applications: ServerApplicationRepository;
  proposals: ServerProposalRepository;
  contracts: ServerContractRepository;
  payments: ServerPaymentRepository;
  schedules: ServerScheduleRepository;
  claims: ServerClaimRepository;
  incidents: ServerIncidentRepository;
  replacements: ServerReplacementRepository;
  messages: ServerMessageRepository;
  calls: ServerCallRepository;
  notifications: ServerNotificationRepository;
  admin: ServerAdminRepository;
  audit: ServerAuditRepository;
  documents: ServerDocumentRepository;
  resources: ServerResourceRepository;
}
