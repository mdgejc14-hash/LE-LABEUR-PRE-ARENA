import type {
  AppNotification,
  Application,
  CallRecord,
  ChatMessage,
  CommunicationEvent,
  CommissionPaymentRecord,
  Contract,
  Conversation,
  FilterState,
  Incident,
  MissionProposal,
  Offer,
  PaymentDeclaration,
  PaymentHistoryEvent,
  ReplacementDossier,
  ResourceDocument,
  UserProfile,
  UserRole,
} from '../types';
import type { CursorPage, DocumentMetadata, ProductionAuditEvent, PublicProfileProjection, ScheduleEntrySnapshot, ShortLivedIceConfiguration, ShortLivedSignalingCredential, SignedDocumentUrl } from '../backend/productionContracts';
import type { PaymentBlockingEvaluation, RevenueMetrics } from './interfaces';
import { HttpApiClient, type ApiClientOptions } from './apiClient';

export interface ApiPageOptions {
  cursor?: string | null;
  limit?: number;
}

export interface IdempotentCommandOptions {
  /** Must be reused by the caller when retrying the same logical command. */
  idempotencyKey: string;
}

export interface ApiClientSession {
  /** UI display state only; the server remains the authorization authority. */
  user: UserProfile;
  expiresAt: string;
}

export type SelfProfilePatch = Partial<Pick<UserProfile,
  | 'fullName' | 'firstName' | 'lastName' | 'phone' | 'headline' | 'location'
  | 'departmentId' | 'communeId' | 'arrondissementId' | 'localityId' | 'detailedAddress'
  | 'avatarUrl' | 'bio' | 'skills' | 'experienceYears' | 'desiredContract' | 'desiredSalary'
  | 'availability' | 'portfolio' | 'formations' | 'certifications' | 'companyName'
  | 'managerName' | 'activity' | 'teamSize' | 'foundedYear'
>>;

export type CreateOfferInput = Omit<Offer,
  'id' | 'employerId' | 'employerName' | 'employerPublicId' | 'employerLocation' | 'employerAvatar' | 'postedDate' | 'compatibilityScore' | 'status' | 'isLeLabeurJob' | 'leLabeurTag'
>;

export interface CreateContractInput {
  offerId: string;
  applicationId: string;
  startDate: string;
  durationMonths: number;
  monthlySalary: number;
  periodicity: string;
  conditions: string[];
  missionDescription: string;
  location: string;
  additionalNotes?: string;
}

export interface IncidentReportInput {
  contractId: string;
  reason: string;
  description: string;
  evidenceNote?: string;
  evidenceDocumentId?: string;
}

export type CreateProposalInput = Omit<MissionProposal,
  'id' | 'conversationId' | 'contractId' | 'employerId' | 'employerName' | 'employeeId' | 'employeeName' | 'status' | 'sentAt' | 'updatedAt'
>;

export interface AudioMessageInput {
  audioDocumentId: string;
  durationSeconds: number;
  waveform?: number[];
}

/** PHASE 4 — déclaration de paiement externe par l'employeur. */
export type CreatePaymentDeclarationInput = {
  contractId: string;
  monthNumber: number;
  kind: PaymentDeclaration['kind'];
  amount: number;
  paymentMethod: PaymentDeclaration['paymentMethod'];
  transactionId: string;
  reference?: string;
  paidAt: string;
  proof: {
    fileName: string;
    uri: string;
    documentId?: string;
    mimeType?: string;
    sizeBytes?: number;
  };
  comment?: string;
};

export type UpdatePaymentDeclarationInput = Partial<CreatePaymentDeclarationInput>;

export type PaymentDeclarationFilter = {
  status?: PaymentDeclaration['status'] | 'ALL';
  employerId?: string;
  contractId?: string;
  kind?: PaymentDeclaration['kind'] | 'ALL';
  awaitingAdminAction?: boolean;
  search?: string;
};

export type EmployerAccountActionResult = {
  declaration: PaymentDeclaration;
  employer: UserProfile;
};

export type CommissionDeclarationInput = {
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
};

export interface AdminCollectionApi {
  listUsers(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<UserProfile>>;
  listOffers(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<Offer>>;
  listApplications(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<Application>>;
  listProposals(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<MissionProposal>>;
  listContracts(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<Contract>>;
  listPayments(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<CommissionPaymentRecord>>;
  listSchedules(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<ScheduleEntrySnapshot>>;
  listIncidents(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<Incident>>;
  listReplacements(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<ReplacementDossier>>;
  listNotifications(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<AppNotification>>;
  listDocuments(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<DocumentMetadata>>;
  listAudit(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<ProductionAuditEvent>>;
  listStats(): Promise<RevenueMetrics>;
  assignReplacement(replacementId: string, candidateId: string, command: IdempotentCommandOptions): Promise<ReplacementDossier>;
  transferReplacement(replacementId: string, command: IdempotentCommandOptions): Promise<ReplacementDossier>;
  finalizeReplacement(replacementId: string, command: IdempotentCommandOptions): Promise<{ replacement: ReplacementDossier; contract: Contract }>;
  blockUser(userId: string, reason: string, command: IdempotentCommandOptions): Promise<UserProfile>;
  unblockUser(userId: string, command: IdempotentCommandOptions): Promise<UserProfile>;
  approvePayment(paymentId: string, command: IdempotentCommandOptions): Promise<CommissionPaymentRecord>;
  rejectPayment(paymentId: string, reason: string, command: IdempotentCommandOptions): Promise<CommissionPaymentRecord>;
  /* PHASE 4 — contrôle administratif des déclarations de paiement. */
  listPaymentDeclarations(page?: ApiPageOptions, filter?: Record<string, string>): Promise<CursorPage<PaymentDeclaration>>;
  getPaymentDeclaration(paymentId: string): Promise<PaymentDeclaration | null>;
  getPaymentDeclarationHistory(paymentId: string, page?: ApiPageOptions): Promise<CursorPage<PaymentHistoryEvent>>;
  getPaymentBlockingEvaluation(paymentId: string): Promise<PaymentBlockingEvaluation>;
  startPaymentDeclarationReview(paymentId: string, command: IdempotentCommandOptions): Promise<PaymentDeclaration>;
  approvePaymentDeclaration(paymentId: string, note: string | undefined, command: IdempotentCommandOptions): Promise<PaymentDeclaration>;
  rejectPaymentDeclaration(paymentId: string, reason: string, command: IdempotentCommandOptions): Promise<PaymentDeclaration>;
  blockEmployerForPayment(paymentId: string, reason: string, command: IdempotentCommandOptions): Promise<EmployerAccountActionResult>;
  unblockEmployerForPayment(paymentId: string, reason: string, command: IdempotentCommandOptions): Promise<EmployerAccountActionResult>;
  arbitrateIncident(incidentId: string, input: { decision: string; note: string }, command: IdempotentCommandOptions): Promise<Incident>;
  listCalls(page?: ApiPageOptions): Promise<CursorPage<CallRecord>>;
  listMatchEvents(page?: ApiPageOptions): Promise<CursorPage<unknown>>;
  listCommunicationEvents(page?: ApiPageOptions): Promise<CursorPage<CommunicationEvent>>;
  listWhatsAppEvents(page?: ApiPageOptions): Promise<CursorPage<unknown>>;
}

/**
 * HTTP repository adapter for the future API. It sends no actorId/actorRole;
 * those are derived by Worker authentication middleware. The React app remains
 * on the unchanged mock adapter until persistent handlers are implemented.
 */
export class ApiRepository {
  readonly auth;
  readonly users;
  readonly offers;
  readonly applications;
  readonly proposals;
  readonly contracts;
  readonly payments;
  readonly paymentDeclarations;
  readonly schedules;
  readonly incidents;
  readonly replacements;
  readonly messages;
  readonly notifications;
  readonly admin: AdminCollectionApi;
  readonly audit;
  readonly documents;
  readonly calls;

  constructor(private readonly http: HttpApiClient = new HttpApiClient()) {
    this.auth = {
      /** Enveloppe de session serveur; sa forme est normalisée par sessionMapping. */
      getSession: () => this.http.request<unknown>('/auth/session'),
      /** Identité de l'acteur authentifié, dérivée du cookie de session. */
      getMe: () => this.http.request<unknown>('/me'),
      exchangeGoogleCredential: (credential: string, requestedRole: Exclude<UserRole, 'ADMIN'>, intent: 'login' | 'register' = 'login') =>
        this.http.request<unknown>('/auth/google/credential', {
          method: 'POST',
          body: { credential, requestedRole, intent },
        }),
      logout: () => this.http.request<void>('/auth/logout', { method: 'POST', body: {} }),
    };

    this.users = {
      getMe: () => this.http.request<UserProfile>('/users/me'),
      updateMe: (patch: SelfProfilePatch) => this.http.request<UserProfile>('/users/me', { method: 'PATCH', body: patch }),
      getProfile: (userId: string) => this.http.request<UserProfile | null>(`/users/${encodeURIComponent(userId)}`),
      listCandidates: (page: ApiPageOptions = {}, filter: Partial<FilterState> = {}) =>
        this.page<PublicProfileProjection>('/directory/candidates', page, filter as Record<string, unknown>),
      listEmployers: (page: ApiPageOptions = {}) => this.page<PublicProfileProjection>('/directory/employers', page),
    };

    this.offers = {
      listPublic: (page: ApiPageOptions = {}, filter: Partial<FilterState> = {}) =>
        this.page<Offer>('/offers', page, filter as Record<string, unknown>),
      getPublic: (offerId: string) => this.http.request<Offer | null>(`/offers/${encodeURIComponent(offerId)}`),
      getMyOffers: (page: ApiPageOptions = {}) => this.page<Offer>('/my/offers', page),
      create: (input: CreateOfferInput, command: IdempotentCommandOptions) =>
        this.http.request<Offer>('/offers', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
      setStatus: (offerId: string, status: Offer['status'], command: IdempotentCommandOptions) =>
        this.http.request<Offer>(`/offers/${encodeURIComponent(offerId)}/status`, {
          method: 'PATCH', body: { status }, idempotencyKey: command.idempotencyKey,
        }),
      listFavorites: () => this.http.request<string[]>('/my/favorites'),
      toggleFavorite: (offerId: string, command: IdempotentCommandOptions) =>
        this.http.request<{ isFavorite: boolean }>(`/offers/${encodeURIComponent(offerId)}/favorite`, {
          method: 'POST', body: {}, idempotencyKey: command.idempotencyKey,
        }),
    };

    this.applications = {
      getMine: (page: ApiPageOptions = {}) => this.page<Application>('/my/applications', page),
      getForEmployer: (page: ApiPageOptions = {}) => this.page<Application>('/employer/applications', page),
      getForOffer: (offerId: string, page: ApiPageOptions = {}) => this.page<Application>(`/offers/${encodeURIComponent(offerId)}/applications`, page),
      getById: (applicationId: string) => this.http.request<Application | null>(`/applications/${encodeURIComponent(applicationId)}`),
      apply: (offerId: string, command: IdempotentCommandOptions) =>
        this.http.request<Application>(`/offers/${encodeURIComponent(offerId)}/applications`, {
          method: 'POST', body: {}, idempotencyKey: command.idempotencyKey,
        }),
      withdraw: (applicationId: string, command: IdempotentCommandOptions) =>
        this.http.request<Application>(`/applications/${encodeURIComponent(applicationId)}/withdraw`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      examine: (applicationId: string, command: IdempotentCommandOptions) =>
        this.http.request<Application>(`/applications/${encodeURIComponent(applicationId)}/examine`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      shortlist: (applicationId: string, command: IdempotentCommandOptions) =>
        this.http.request<Application>(`/applications/${encodeURIComponent(applicationId)}/shortlist`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      reject: (applicationId: string, note: string | undefined, command: IdempotentCommandOptions) =>
        this.http.request<Application>(`/applications/${encodeURIComponent(applicationId)}/reject`, { method: 'POST', body: { note }, idempotencyKey: command.idempotencyKey }),
    };

    this.proposals = {
      create: (conversationId: string, proposal: CreateProposalInput, command: IdempotentCommandOptions) =>
        this.http.request<MissionProposal>(`/conversations/${encodeURIComponent(conversationId)}/proposals`, { method: 'POST', body: proposal, idempotencyKey: command.idempotencyKey }),
      respond: (proposalId: string, action: 'ACCEPT' | 'REVISE' | 'DECLINE', notes: string | undefined, command: IdempotentCommandOptions) =>
        this.http.request<MissionProposal>(`/proposals/${encodeURIComponent(proposalId)}/respond`, { method: 'POST', body: { action, notes }, idempotencyKey: command.idempotencyKey }),
    };

    this.contracts = {
      getMine: (page: ApiPageOptions = {}) => this.page<Contract>('/my/contracts', page),
      getById: (contractId: string) => this.http.request<Contract | null>(`/contracts/${encodeURIComponent(contractId)}`),
      create: (input: CreateContractInput, command: IdempotentCommandOptions) =>
        this.http.request<Contract>('/contracts', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
      sign: (contractId: string, command: IdempotentCommandOptions) =>
        this.http.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/sign`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      confirmMonthlyAction: (contractId: string, input: Record<string, unknown>, command: IdempotentCommandOptions) =>
        this.http.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/monthly-actions`, { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
    };

    this.payments = {
      getMine: (page: ApiPageOptions = {}) => this.page<CommissionPaymentRecord>('/my/payments', page),
      getById: (paymentId: string) => this.http.request<CommissionPaymentRecord | null>(`/payments/${encodeURIComponent(paymentId)}`),
      getByContract: (contractId: string, page: ApiPageOptions = {}) => this.page<CommissionPaymentRecord>(`/contracts/${encodeURIComponent(contractId)}/payments`, page),
      declareCommission: (input: CommissionDeclarationInput, command: IdempotentCommandOptions) =>
        this.http.request<CommissionPaymentRecord>('/payments/commission-declarations', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
    };

    // PHASE 4 : aucune donnée d'acteur n'est envoyée — le serveur dérive tout.
    this.paymentDeclarations = {
      getMine: (page: ApiPageOptions = {}, filter: PaymentDeclarationFilter = {}) =>
        this.page<PaymentDeclaration>('/employer/payment-declarations', page, filter as Record<string, unknown>),
      getById: (paymentId: string) => this.http.request<PaymentDeclaration | null>(`/payment-declarations/${encodeURIComponent(paymentId)}`),
      getHistory: (paymentId: string, page: ApiPageOptions = {}) => this.page<PaymentHistoryEvent>(`/payment-declarations/${encodeURIComponent(paymentId)}/history`, page),
      create: (input: CreatePaymentDeclarationInput, command: IdempotentCommandOptions) =>
        this.http.request<PaymentDeclaration>('/payment-declarations', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
      update: (paymentId: string, patch: UpdatePaymentDeclarationInput, command: IdempotentCommandOptions) =>
        this.http.request<PaymentDeclaration>(`/payment-declarations/${encodeURIComponent(paymentId)}`, { method: 'PATCH', body: patch, idempotencyKey: command.idempotencyKey }),
      submit: (paymentId: string, command: IdempotentCommandOptions) =>
        this.http.request<PaymentDeclaration>(`/payment-declarations/${encodeURIComponent(paymentId)}/submit`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      resubmit: (paymentId: string, patch: UpdatePaymentDeclarationInput, command: IdempotentCommandOptions) =>
        this.http.request<PaymentDeclaration>(`/payment-declarations/${encodeURIComponent(paymentId)}/resubmit`, { method: 'POST', body: patch, idempotencyKey: command.idempotencyKey }),
    };

    this.schedules = {
      getMine: (page: ApiPageOptions = {}) => this.page<ScheduleEntrySnapshot>('/my/schedules', page),
    };

    this.incidents = {
      getMine: (page: ApiPageOptions = {}) => this.page<Incident>('/my/incidents', page),
      getById: (incidentId: string) => this.http.request<Incident | null>(`/incidents/${encodeURIComponent(incidentId)}`),
      report: (input: IncidentReportInput, command: IdempotentCommandOptions) =>
        this.http.request<Incident>('/incidents', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
    };

    this.replacements = {
      getMine: (page: ApiPageOptions = {}) => this.page<ReplacementDossier>('/my/replacements', page),
      getById: (replacementId: string) => this.http.request<ReplacementDossier | null>(`/replacements/${encodeURIComponent(replacementId)}`),
    };

    this.messages = {
      getMyConversations: (page: ApiPageOptions = {}) => this.page<Conversation>('/my/conversations', page),
      createConversation: (input: { targetUserId: string; contextType: Conversation['contextType']; contextRefId: string }, command: IdempotentCommandOptions) =>
        this.http.request<Conversation>('/conversations', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
      getMessages: (conversationId: string, page: ApiPageOptions = {}) => this.page<ChatMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, page),
      send: (conversationId: string, text: string, command: IdempotentCommandOptions) =>
        this.http.request<ChatMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: { text }, idempotencyKey: command.idempotencyKey }),
      sendAudio: (conversationId: string, input: AudioMessageInput, command: IdempotentCommandOptions) =>
        this.http.request<ChatMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: { type: 'AUDIO', ...input }, idempotencyKey: command.idempotencyKey }),
      markRead: (conversationId: string, command: IdempotentCommandOptions) =>
        this.http.request<void>(`/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
    };

    this.notifications = {
      getMine: (page: ApiPageOptions = {}) => this.page<AppNotification>('/my/notifications', page),
      markRead: (notificationId: string, command: IdempotentCommandOptions) =>
        this.http.request<void>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      markAllRead: (command: IdempotentCommandOptions) =>
        this.http.request<void>('/my/notifications/read-all', { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
    };

    const adminPage = <T>(resource: string, page: ApiPageOptions = {}, filter: Record<string, string> = {}) =>
      this.page<T>(`/admin/${resource}`, page, filter);
    this.admin = {
      listUsers: (page, filter) => adminPage<UserProfile>('users', page, filter),
      listOffers: (page, filter) => adminPage<Offer>('offers', page, filter),
      listApplications: (page, filter) => adminPage<Application>('applications', page, filter),
      listProposals: (page, filter) => adminPage<MissionProposal>('proposals', page, filter),
      listContracts: (page, filter) => adminPage<Contract>('contracts', page, filter),
      listPayments: (page, filter) => adminPage<CommissionPaymentRecord>('payments', page, filter),
      listSchedules: (page, filter) => adminPage<ScheduleEntrySnapshot>('schedules', page, filter),
      listIncidents: (page, filter) => adminPage<Incident>('incidents', page, filter),
      listReplacements: (page, filter) => adminPage<ReplacementDossier>('replacements', page, filter),
      listNotifications: (page, filter) => adminPage<AppNotification>('notifications', page, filter),
      listDocuments: (page, filter) => adminPage<DocumentMetadata>('documents', page, filter),
      listAudit: (page, filter) => adminPage<ProductionAuditEvent>('audit', page, filter),
      listStats: () => this.http.request<RevenueMetrics>('/admin/stats'),
      assignReplacement: (replacementId, candidateId, command) => this.http.request<ReplacementDossier>(`/admin/replacements/${encodeURIComponent(replacementId)}/assign`, { method: 'POST', body: { candidateId }, idempotencyKey: command.idempotencyKey }),
      transferReplacement: (replacementId, command) => this.http.request<ReplacementDossier>(`/admin/replacements/${encodeURIComponent(replacementId)}/transfer`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      finalizeReplacement: (replacementId, command) => this.http.request<{ replacement: ReplacementDossier; contract: Contract }>(`/admin/replacements/${encodeURIComponent(replacementId)}/finalize`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      blockUser: (userId, reason, command) => this.http.request<UserProfile>(`/admin/users/${encodeURIComponent(userId)}/block`, { method: 'POST', body: { reason }, idempotencyKey: command.idempotencyKey }),
      unblockUser: (userId, command) => this.http.request<UserProfile>(`/admin/users/${encodeURIComponent(userId)}/unblock`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      approvePayment: (paymentId, command) => this.http.request<CommissionPaymentRecord>(`/admin/payments/${encodeURIComponent(paymentId)}/approve`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      rejectPayment: (paymentId, reason, command) => this.http.request<CommissionPaymentRecord>(`/admin/payments/${encodeURIComponent(paymentId)}/reject`, { method: 'POST', body: { reason }, idempotencyKey: command.idempotencyKey }),
      listPaymentDeclarations: (page, filter) => adminPage<PaymentDeclaration>('payment-declarations', page, filter),
      getPaymentDeclaration: (paymentId) => this.http.request<PaymentDeclaration | null>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}`),
      getPaymentDeclarationHistory: (paymentId, page = {}) => this.page<PaymentHistoryEvent>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}/history`, page),
      getPaymentBlockingEvaluation: (paymentId) => this.http.request<PaymentBlockingEvaluation>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}/blocking-evaluation`),
      startPaymentDeclarationReview: (paymentId, command) => this.http.request<PaymentDeclaration>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}/review`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      approvePaymentDeclaration: (paymentId, note, command) => this.http.request<PaymentDeclaration>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}/approve`, { method: 'POST', body: { note }, idempotencyKey: command.idempotencyKey }),
      rejectPaymentDeclaration: (paymentId, reason, command) => this.http.request<PaymentDeclaration>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}/reject`, { method: 'POST', body: { reason }, idempotencyKey: command.idempotencyKey }),
      blockEmployerForPayment: (paymentId, reason, command) => this.http.request<EmployerAccountActionResult>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}/block-employer`, { method: 'POST', body: { reason }, idempotencyKey: command.idempotencyKey }),
      unblockEmployerForPayment: (paymentId, reason, command) => this.http.request<EmployerAccountActionResult>(`/admin/payment-declarations/${encodeURIComponent(paymentId)}/unblock-employer`, { method: 'POST', body: { reason }, idempotencyKey: command.idempotencyKey }),
      arbitrateIncident: (incidentId, input, command) => this.http.request<Incident>(`/admin/incidents/${encodeURIComponent(incidentId)}/arbitrate`, { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
      listCalls: (page = {}) => adminPage<CallRecord>('calls', page),
      listMatchEvents: (page = {}) => adminPage<unknown>('match-events', page),
      listCommunicationEvents: (page = {}) => adminPage<CommunicationEvent>('communication-events', page),
      listWhatsAppEvents: (page = {}) => adminPage<unknown>('whatsapp-events', page),
    };

    this.audit = {
      list: (page: ApiPageOptions = {}) => this.page<ProductionAuditEvent>('/admin/audit', page),
    };

    this.documents = {
      listMine: (page: ApiPageOptions = {}) => this.page<DocumentMetadata>('/my/documents', page),
      listPublishedResources: (page: ApiPageOptions = {}, roleTarget?: ResourceDocument['targetRole']) => this.page<ResourceDocument>('/resources', page, { roleTarget }),
      getPublishedResource: (resourceId: string) => this.http.request<ResourceDocument | null>(`/resources/${encodeURIComponent(resourceId)}`),
      createUploadGrant: (input: Record<string, unknown>, command: IdempotentCommandOptions) =>
        this.http.request<{ documentId: string; uploadUrl: string; expiresAt: string }>('/documents/upload-grants', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
      createDownloadGrant: (documentId: string) =>
        this.http.request<SignedDocumentUrl>(`/documents/${encodeURIComponent(documentId)}/signed-download-url`, { method: 'POST', body: {} }),
    };

    this.calls = {
      getMine: (page: ApiPageOptions = {}) => this.page<CallRecord>('/my/calls', page),
      initiate: (input: { receiverId: string; conversationId?: string }, command: IdempotentCommandOptions) =>
        this.http.request<CallRecord>('/calls', { method: 'POST', body: input, idempotencyKey: command.idempotencyKey }),
      accept: (callId: string, command: IdempotentCommandOptions) =>
        this.http.request<CallRecord>(`/calls/${encodeURIComponent(callId)}/accept`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      reject: (callId: string, command: IdempotentCommandOptions) =>
        this.http.request<CallRecord>(`/calls/${encodeURIComponent(callId)}/reject`, { method: 'POST', body: {}, idempotencyKey: command.idempotencyKey }),
      end: (callId: string, durationSeconds: number, command: IdempotentCommandOptions) =>
        this.http.request<CallRecord>(`/calls/${encodeURIComponent(callId)}/end`, { method: 'POST', body: { durationSeconds }, idempotencyKey: command.idempotencyKey }),
      getIceConfiguration: (callId: string) => this.http.request<ShortLivedIceConfiguration>(`/calls/${encodeURIComponent(callId)}/ice-configuration`, { method: 'POST', body: {} }),
      issueSignalingCredential: (callId?: string) => this.http.request<ShortLivedSignalingCredential>(
        callId ? `/calls/${encodeURIComponent(callId)}/signaling-credential` : '/calls/signaling-credential',
        { method: 'POST', body: {} },
      ),
    };
  }

  private page<T>(path: string, page: ApiPageOptions = {}, query: Record<string, unknown> = {}): Promise<CursorPage<T>> {
    const stringQuery: Record<string, string | number | boolean | null | undefined> = {
      ...query as Record<string, string | number | boolean | null | undefined>,
      cursor: page.cursor,
      limit: page.limit,
    };
    return this.http.request<CursorPage<T>>(path, { query: stringQuery });
  }
}

export function createApiRepository(options?: ApiClientOptions): ApiRepository {
  return new ApiRepository(new HttpApiClient(options));
}
