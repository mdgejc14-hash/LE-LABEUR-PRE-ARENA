import {
  UserProfile,
  UserRole,
  Offer,
  Application,
  Contract,
  Incident,
  Conversation,
  ChatMessage,
  MissionProposal,
  ReplacementDossier,
  CommissionPaymentRecord,
  AppNotification,
  SystemAuditLog,
  FilterState,
  CallRecord,
  CommunicationEvent,
  ResourceDocument,
  PaymentDeclaration,
  PaymentDeclarationInput,
} from '../types';

export interface RevenueMetrics {
  monthCommission: number;
  totalGenerated: number;
  totalEncaissed: number;
  totalPendingVerification: number;
  totalRejected: number;
  totalDue: number;
  activeContractsCount: number;
  firstSalariesCount: number;
  commissionedContractsCount: number;
  byMonth: { month: string; amount: number }[];
  byEmployer: { employerId: string; employerName: string; amount: number }[];
  byContract: { contractId: string; title: string; amount: number; status: string }[];
}

export interface AuthRepository {
  getCurrentUser(): UserProfile | null;
  login(email: string, role?: UserRole): Promise<UserProfile>;
  register(email: string, fullName: string, role: UserRole): Promise<UserProfile>;
  findUserByGoogleSub(googleSub: string): Promise<UserProfile | null>;
  loginWithGoogle(googleSub: string, role?: UserRole): Promise<UserProfile>;
  registerWithGoogle(data: { googleSub: string; email: string; fullName: string; role: UserRole; avatarUrl?: string }): Promise<UserProfile>;
  switchRole(role: UserRole): Promise<UserProfile>;
  logout(): Promise<void>;
}

export interface UserRepository {
  getAllUsers(actorId: string): Promise<UserProfile[]>;
  blockUser(userId: string, reason: string, actorId: string): Promise<UserProfile>;
  unblockUser(userId: string, actorId: string): Promise<UserProfile>;
  getProfile(id: string, actorId: string): Promise<UserProfile | null>;
  getAllCandidates(): Promise<UserProfile[]>;
  getAllEmployers(): Promise<UserProfile[]>;
  searchCandidates(query: string, filter?: Partial<FilterState>): Promise<UserProfile[]>;
  updateProfile(userId: string, profile: Partial<UserProfile>, actorId: string): Promise<UserProfile>;
}

export interface OfferRepository {
  getAllOffers(): Promise<Offer[]>;
  getOfferById(id: string): Promise<Offer | null>;
  searchOffers(filter: FilterState): Promise<Offer[]>;
  createOffer(offer: Omit<Offer, 'id' | 'postedDate' | 'compatibilityScore' | 'status'>, actorId: string, idempotencyKey?: string): Promise<Offer>;
  updateOfferStatus(offerId: string, status: 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'PAUSED', actorId: string): Promise<Offer>;
  getOffersByEmployer(employerId: string): Promise<Offer[]>;
  createLeLabeurUrgentJob(
    title: string,
    employerId: string,
    employerName: string,
    remuneration: number,
    skills: string[],
    actorId: string,
    location?: string,
    description?: string,
    durationMonths?: number
  ): Promise<Offer>;
  toggleFavorite(offerId: string, actorId: string): Promise<boolean>;
  getFavorites(userId?: string): Promise<string[]>;
}

export interface ApplicationRepository {
  getApplicationsByCandidate(candidateId: string): Promise<Application[]>;
  getApplicationsByEmployer(employerId: string): Promise<Application[]>;
  getApplicationsByOffer(offerId: string): Promise<Application[]>;
  getAllApplications(actorId: string): Promise<Application[]>;
  applyToOffer(offerId: string, actorId: string): Promise<Application>;
  withdrawApplication(applicationId: string, actorId: string): Promise<Application>;
  examineApplication(applicationId: string, actorId: string): Promise<Application>;
  shortlistApplication(applicationId: string, actorId: string): Promise<Application>;
  rejectApplication(applicationId: string, note: string | undefined, actorId: string): Promise<Application>;
}

export interface ContractRepository {
  getAllContracts(actorId: string): Promise<Contract[]>;
  getContractById(id: string): Promise<Contract | null>;
  getContractsByUser(userId: string, role: UserRole): Promise<Contract[]>;
  generateContract(data: {
    offerId: string;
    applicationId: string;
    employerId: string;
    employerName: string;
    employeeId: string;
    employeeName: string;
    jobTitle: string;
    missionDescription: string;
    location: string;
    startDate: string;
    durationMonths: number;
    monthlySalary: number;
    periodicity: string;
    conditions: string[];
    additionalNotes?: string;
  }, actorId: string): Promise<Contract>;
  signContract(contractId: string, role: 'EMPLOYER' | 'EMPLOYEE', actorId: string): Promise<Contract>;
  confirmMonthlyAction(
    contractId: string,
    monthNumber: number,
    actionType:
      | 'START'
      | 'PAID'
      | 'CONFIRM_EMPLOYER'
      | 'CONFIRM_EMPLOYEE'
      | 'START_ANSWER_EMPLOYER'
      | 'START_ANSWER_EMPLOYEE'
      | 'DECLARE_SALARY'
      | 'CONFIRM_SALARY_RECEIVED'
      | 'CONTEST_SALARY_NOT_RECEIVED',
    actorId: string,
    notes?: string,
    metadata?: {
      phone?: string;
      txnId?: string;
      amount?: number;
      proofFileName?: string;
      answer?: 'YES' | 'NO';
    }
  ): Promise<Contract>;
  resolveStartDivergence(contractId: string, monthNumber: number, decision: 'CONFIRM' | 'CANCEL', note: string, actorId: string): Promise<Contract>;
  advanceContractMonth(contractId: string, actorId: string): Promise<Contract>;
  dissociateMonth2(contractId: string, reason: string, actorId: string, actorRole: UserRole): Promise<Contract>;
}

export interface IncidentRepository {
  getAllIncidents(actorId: string): Promise<Incident[]>;
  getIncidentById(id: string, actorId: string): Promise<Incident | null>;
  reportIncident(data: Omit<Incident, 'id' | 'createdAt' | 'status' | 'history'>, actorId: string): Promise<Incident>;
  arbitrateIncident(
    incidentId: string,
    decision: 'CONTINUER' | 'ANNULER' | 'REMPLACER' | 'CLÔTURER' | 'SUSPENDRE',
    note: string,
    adminName: string,
    actorId: string
  ): Promise<Incident>;
}

export interface MessageRepository {
  getConversations(userId: string): Promise<Conversation[]>;
  getMessages(conversationId: string, userId: string): Promise<ChatMessage[]>;
  sendMessage(conversationId: string, text: string, actorId: string, senderRole: UserRole, idempotencyKey?: string): Promise<ChatMessage>;
  sendAudioMessage(
    conversationId: string,
    durationSeconds: number,
    actorId: string,
    senderRole: UserRole,
    audioDataUrl?: string,
    waveform?: number[]
  ): Promise<ChatMessage>;
  sendProposal(conversationId: string, proposal: Omit<MissionProposal, 'id' | 'status' | 'sentAt' | 'updatedAt'>, actorId: string, idempotencyKey?: string): Promise<MissionProposal>;
  respondToProposal(proposalId: string, action: 'ACCEPT' | 'REVISE' | 'DECLINE', revisionNotes: string | undefined, actorId: string): Promise<MissionProposal>;
  markConversationAsRead(conversationId: string, actorId: string): Promise<void>;
  createOrGetConversation(
    userId: string,
    targetUser: { id: string; publicId?: string; name: string; role: UserRole; avatarUrl: string },
    context: { contextType: 'OFFER' | 'APPLICATION' | 'PROPOSAL' | 'CONTRACT' | 'INCIDENT' | 'REPLACEMENT'; contextTitle: string; contextRefId: string }
  ): Promise<Conversation>;
}

export interface CallRepository {
  initiateCall(caller: UserProfile, receiver: { id: string; fullName: string; role: UserRole; avatarUrl: string; headline: string }, conversationId?: string): Promise<CallRecord>;
  acceptCall(callId: string, actorId: string): Promise<CallRecord>;
  rejectCall(callId: string, actorId: string): Promise<CallRecord>;
  endCall(callId: string, durationSeconds: number, actorId: string): Promise<CallRecord>;
  getCallHistory(userId: string, actorId: string): Promise<CallRecord[]>;
}

export interface CommunicationTrackingRepository {
  logCommunicationEvent(event: Omit<CommunicationEvent, 'id' | 'timestamp'>): Promise<CommunicationEvent>;
  getCommunicationEvents(filter?: { userId?: string; offerId?: string; contractId?: string }): Promise<CommunicationEvent[]>;
}

export interface ResourceRepository {
  getResourceDocuments(roleTarget?: 'EMPLOYEE' | 'EMPLOYER' | 'ALL'): Promise<ResourceDocument[]>;
  getResourceDocumentById(id: string): Promise<ResourceDocument | null>;
}

export interface PaymentRepository {
  getAllPaymentRecords(actorId: string): Promise<CommissionPaymentRecord[]>;
  getPaymentById(paymentId: string, actorId: string): Promise<CommissionPaymentRecord | null>;
  getPaymentsByContract(contractId: string, actorId: string): Promise<CommissionPaymentRecord[]>;
  declareCommissionPayment(data: {
    contractId: string;
    actorId: string;
    monthNumber: number;
    senderPhone: string;
    transactionId: string;
    amountPaid: number;
    reference?: string;
    paymentDate?: string;
    paymentTime?: string;
    proofUri: string;
    proofFileName?: string;
    notes?: string;
  }): Promise<CommissionPaymentRecord>;
  verifyCommissionPayment(paymentId: string, actorId: string): Promise<CommissionPaymentRecord>;
  rejectCommissionPayment(paymentId: string, reason: string, actorId: string): Promise<CommissionPaymentRecord>;
  getRevenueMetrics(actorId: string): Promise<RevenueMetrics>;
  /**
   * PHASES 4A/4B — déclaration de paiement externe (côté EMPLOYEUR uniquement).
   * Même abstraction Repository que le reste du domaine : un seul système de
   * stockage, aucun magasin parallèle.
   */
  createPaymentDeclaration(input: PaymentDeclarationInput, actorId: string, idempotencyKey?: string): Promise<PaymentDeclaration>;
  getPaymentDeclaration(paymentId: string, actorId: string): Promise<PaymentDeclaration | null>;
  listEmployerPayments(employerId: string, actorId: string): Promise<PaymentDeclaration[]>;
  updatePaymentDeclaration(paymentId: string, patch: Partial<PaymentDeclarationInput>, actorId: string): Promise<PaymentDeclaration>;
  submitPaymentDeclaration(paymentId: string, actorId: string): Promise<PaymentDeclaration>;
  /**
   * PHASE 4C — consultation administrative, strictement en lecture seule.
   * `listSubmittedPaymentDeclarations` expose à l'ADMIN les déclarations que
   * les employeurs ont soumises ; `getSubmittedPaymentDeclaration` en ouvre le
   * détail. Aucune de ces deux opérations ne produit de transition de statut
   * (UNDER_REVIEW / APPROVED / REJECTED restent hors périmètre).
   */
  listSubmittedPaymentDeclarations(actorId: string): Promise<PaymentDeclaration[]>;
  getSubmittedPaymentDeclaration(paymentId: string, actorId: string): Promise<PaymentDeclaration | null>;
}

export interface NotificationRepository {
  getNotifications(userId: string, role?: UserRole): Promise<AppNotification[]>;
  markAsRead(notificationId: string, actorId: string): Promise<void>;
  markAllAsRead(userId: string, actorId: string, role?: UserRole): Promise<void>;
  createNotification(data: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>): Promise<AppNotification>;
}

export interface ReplacementRepository {
  getAllReplacements(actorId: string): Promise<ReplacementDossier[]>;
  getReplacementById(id: string, actorId: string): Promise<ReplacementDossier | null>;
  createReplacementFromIncident(incident: Incident, actorId: string): Promise<ReplacementDossier>;
  assignReplacementCandidate(replacementId: string, candidateId: string, actorId: string): Promise<ReplacementDossier>;
  transferCandidateToEmployer(replacementId: string, actorId: string): Promise<ReplacementDossier>;
  finalizeReplacementContract(replacementId: string, actorId: string): Promise<{ replacement: ReplacementDossier; newContract: Contract }>;
}

export interface AuditLogRepository {
  getAllAuditLogs(actorId: string): Promise<SystemAuditLog[]>;
  logEvent(log: Omit<SystemAuditLog, 'id' | 'timestamp'>): Promise<SystemAuditLog>;
}
