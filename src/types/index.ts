export type UserRole = 'CANDIDATE' | 'EMPLOYER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'BLOCKED';

export type ContractStatus = 
  | 'DRAFT'
  | 'PENDING_EMPLOYER'
  | 'PENDING_EMPLOYEE'
  | 'SIGNATURE'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'INCIDENT'
  | 'TERMINATED'
  | 'COMPLETED'
  | 'REPLACED';

export type ApplicationStatus = 
  | 'PENDING'
  | 'REVIEW'
  | 'SHORTLISTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'HIRED'
  | 'CONTRACTED'
  | 'CLOSED_OFFER_FILLED';

export type ProposalStatus = 
  | 'DRAFT'
  | 'SENT'
  | 'REVISION_REQUESTED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED';

export type CommissionPaymentStatus = 
  | 'SCHEDULED'
  | 'DUE'
  | 'PENDING_VERIFICATION'
  | 'PAID'
  | 'REJECTED'
  | 'NOT_APPLICABLE';

export type SalaryPaymentStatus =
  | 'SCHEDULED'
  | 'DUE'
  | 'PENDING_VERIFICATION'
  | 'PAID'
  | 'REJECTED'
  | 'NOT_APPLICABLE';

export type IncidentStatus = 
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'WAITING_EMPLOYEE'
  | 'WAITING_EMPLOYER'
  | 'RESOLVED'
  | 'TERMINATED'
  | 'REPLACEMENT_REQUESTED'
  | 'REPLACEMENT_IN_PROGRESS'
  | 'CLOSED';

export type CallStatus = 
  | 'IDLE'
  | 'CALLING'
  | 'RINGING'
  | 'ACCEPTING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'REJECTED'
  | 'MISSED'
  | 'ENDED'
  | 'FAILED';

export type CallDirection = 'INCOMING' | 'OUTGOING';

export interface CallRecord {
  id: string;
  conversationId?: string;
  callerId: string;
  callerName: string;
  callerRole: UserRole;
  callerAvatar: string;
  callerHeadline: string;
  receiverId: string;
  receiverName: string;
  receiverRole: UserRole;
  receiverAvatar: string;
  receiverHeadline: string;
  status: CallStatus;
  direction: CallDirection;
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  durationSeconds: number;
  isMuted?: boolean;
  isSpeakerOn?: boolean;
  networkQuality?: 'EXCELLENT' | 'GOOD' | 'POOR';
  webrtcSessionId?: string;
}

export type CommunicationEventType =
  | 'CONVERSATION_CREATED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_READ'
  | 'VOICE_SENT'
  | 'CALL_INITIATED'
  | 'CALL_ACCEPTED'
  | 'CALL_REJECTED'
  | 'CALL_MISSED'
  | 'CALL_ENDED'
  | 'CALL_FAILED'
  | 'PROPOSAL_CREATED'
  | 'CONTRACT_GENERATED'
  | 'CONTRACT_ACCEPTED'
  | 'CONTRACT_REJECTED';

export interface CommunicationEvent {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  recipientId: string;
  recipientName: string;
  recipientRole: UserRole;
  offerId?: string;
  applicationId?: string;
  contractId?: string;
  conversationId?: string;
  type: CommunicationEventType;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type ResourceCategory = 
  | 'CANDIDAT' 
  | 'ENTRETIEN' 
  | 'CONTRAT' 
  | 'SECURITE' 
  | 'RECRUTEMENT' 
  | 'OFFRE' 
  | 'MISSION' 
  | 'JURIDIQUE';

export type ResourceRoleTarget = 'EMPLOYEE' | 'EMPLOYER' | 'ALL';

export interface ResourceDocument {
  id: string;
  title: string;
  description: string;
  fileName: string;
  logicalPath: string;
  category: ResourceCategory;
  targetRole: ResourceRoleTarget;
  publishedDate: string;
  orderIndex: number;
  status: 'ACTIVE' | 'ARCHIVED';
  fileSize: string;
  pageCount: number;
  summaryPoints: string[];
  keyChapters: { title: string; excerpt: string }[];
  pdfDataUri?: string;
}

export type NotificationType =
  | 'NEW_APPLICATION'
  | 'APPLICATION_SHORTLISTED'
  | 'APPLICATION_REJECTED'
  | 'APPLICATION_WITHDRAWN'
  | 'NEW_MESSAGE'
  | 'VOICE_MESSAGE'
  | 'INCOMING_CALL'
  | 'MISSED_CALL'
  | 'PROPOSAL_RECEIVED'
  | 'PROPOSAL_ACCEPTED'
  | 'PROPOSAL_DECLINED'
  | 'PROPOSAL_REVISION_REQUESTED'
  | 'CONTRACT_PENDING_SIGNATURE'
  | 'CONTRACT_SIGNED'
  | 'CONTRACT_ACTIVE'
  | 'MISSION_START_REQUIRED'
  | 'MISSION_CONFIRMED'
  | 'MISSION_DIVERGENCE'
  | 'MONTHLY_CHECKPOINT'
  | 'SALARY_DECLARED'
  | 'SALARY_CONFIRMED'
  | 'SALARY_CONTESTED'
  | 'COMMISSION_DUE'
  | 'COMMISSION_DECLARED'
  | 'COMMISSION_VERIFIED'
  | 'COMMISSION_REJECTED'
  | 'PAYMENT_OVERDUE_J3'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_UNBLOCKED'
  | 'INCIDENT_REPORTED'
  | 'INCIDENT_DECIDED'
  | 'REPLACEMENT_INITIATED'
  | 'URGENT_JOB_PUBLISHED'
  | 'CANDIDATE_TRANSFERRED';

export interface AppNotification {
  id: string;
  recipientId: string;
  recipientRole?: UserRole;
  isBroadcast?: boolean;
  type: NotificationType;
  title: string;
  message: string;
  linkRef?: { screen: string; id?: string };
  dedupeKey?: string;
  isRead: boolean;
  createdAt: string;
}

export interface GoogleIdPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
  credential: string;
}

export interface UserProfile {
  id: string;
  publicId: string; // Ex: LAB-C-000001 ou LAB-R-000001
  role: UserRole;
  googleSub?: string;
  accountStatus?: AccountStatus;
  blockedAt?: string;
  blockedBy?: string;
  blockReason?: string;
  unlockedAt?: string;
  unlockedBy?: string;
  fullName: string;
  name?: string;
  verified?: boolean;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  headline: string;
  location: string;
  departmentId?: string;
  communeId?: string;
  arrondissementId?: string;
  localityId?: string;
  detailedAddress?: string;
  avatarUrl: string;
  bio: string;
  skills: string[];
  experienceYears: number;
  desiredContract: string;
  desiredSalary: string;
  availability: string;
  portfolio: { title: string; subtitle: string; year: string }[];
  matchCompatibility?: number;
  companyName?: string;
  managerName?: string;
  activity?: string;
  teamSize?: string;
  foundedYear?: string;
  formations?: { title: string; institution: string; year: string }[];
  certifications?: string[];
}

export interface Offer {
  id: string;
  employerId: string;
  employerName: string;
  employerPublicId?: string;
  employerLocation: string;
  employerAvatar?: string;
  title: string;
  contractType: string;
  remuneration: number;
  currency: string;
  location: string;
  departmentId?: string;
  municipalityId?: string;
  arrondissementId?: string;
  localityId?: string;
  locationLabel?: string;
  domainId?: string;
  jobId?: string;
  postedDate: string;
  isUrgent?: boolean;
  isLeLabeurJob?: boolean;
  leLabeurTag?: string;
  skills: string[];
  summary: string;
  responsibilities: string[];
  conditions: string[];
  selectionProcess: string[];
  compatibilityScore: number;
  status: 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'PAUSED';
  startDate?: string;
  durationMonths?: number;
}

export interface Application {
  id: string;
  offerId: string;
  offerTitle: string;
  employerName?: string;
  candidateId: string;
  candidateName: string;
  candidatePublicId?: string;
  candidateHeadline: string;
  candidateAvatar: string;
  appliedDate: string;
  status: ApplicationStatus;
  remuneration?: number | string;
  note?: string;
  contractId?: string;
  history: { action: string; timestamp: string; actor: string }[];
}

export interface MissionProposal {
  id: string;
  conversationId: string;
  contractId?: string;
  offerId: string;
  applicationId?: string;
  employerId: string;
  employerName: string;
  employeeId: string;
  employeeName: string;
  missionTitle: string;
  amount: number;
  currency: string;
  periodicity: 'Mensuel' | 'Hebdomadaire' | 'Forfait mission';
  startDate: string;
  endDate?: string;
  durationMonths: number;
  location: string;
  conditions: string[];
  status: ProposalStatus;
  sentAt: string;
  updatedAt: string;
  revisionNotes?: string;
}

export interface PaymentScheduleEntry {
  id: string;
  contractId: string;
  monthNumber: number;
  periodKey: string;
  periodStartDate: string;
  salaryDueDate: string;
  commissionDueDate: string;
  salaryAmount: number;
  employeeShareAmount: number;
  commissionAmount: number;
  currency: string;
  salaryStatus: SalaryPaymentStatus;
  commissionStatus: CommissionPaymentStatus;
  salaryDeclaredAt?: string;
  salaryConfirmedAt?: string;
  commissionDeclaredAt?: string;
  commissionVerifiedAt?: string;
  salaryTransactionId?: string;
  commissionTransactionId?: string;
  salaryProofFileName?: string;
  commissionProofFileName?: string;
  createdAt: string;
}

export interface MonthlyFollowupCheckpoint {
  monthNumber: number;
  periodKey: string;
  salaryAmount: number;
  employeeShareAmount: number;
  leLabeurShareAmount: number;
  currency: string;
  isStarted: boolean;
  employerStartAnswer?: 'YES' | 'NO';
  employeeStartAnswer?: 'YES' | 'NO';
  startConfirmed?: boolean;
  startDivergence?: boolean;
  resolvedByAdmin?: boolean;
  divergenceArbitrationNote?: string;
  isSalaryPaidToEmployee: boolean;
  salaryDeclaredAt?: string;
  salaryPhone?: string;
  salaryTxnId?: string;
  salaryProofFileName?: string;
  employeeSalaryConfirmation?: 'RECEIVED' | 'NOT_RECEIVED';
  employeeSalaryConfirmedAt?: string;
  employerConfirmed: boolean;
  employeeConfirmed: boolean;
  notes?: string;
  confirmedAt?: string;
}

export interface ContractAuditLog {
  id: string;
  timestamp: string;
  event: string;
  description: string;
  actor: string;
}

export interface CommissionLedgerEntry {
  contractId: string;
  monthNumber: number;
  salaryBase: number;
  percentage: number;
  amountDue: number;
  amountSubmitted: number;
  status: CommissionPaymentStatus;
  paymentId?: string;
  createdAt: string;
  verifiedAt?: string;
  rejectionReason?: string;
}

export interface CommissionPaymentRecord {
  paymentId: string;
  contractId: string;
  offerTitle: string;
  employerId: string;
  employerName: string;
  employeeId: string;
  employeeName: string;
  monthNumber: number;
  periodKey: string;
  amountDue: number;
  amountSubmitted: number;
  currency: string;
  transactionId: string;
  senderPhone: string;
  reference?: string;
  paymentMethod?: string;
  paymentDate: string;
  paymentTime: string;
  proofUri: string;
  proofFileName?: string;
  status: CommissionPaymentStatus;
  createdAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  notes?: string;
}

/**
 * PHASES 4A/4B — Déclaration de paiement externe (employeur).
 *
 * Le règlement est effectué HORS plateforme (Mobile Money, virement, espèces…).
 * L'employeur déclare ensuite l'opération et son justificatif. Cette étape ne
 * couvre que le versant EMPLOYEUR : le contrôle administratif (UNDER_REVIEW,
 * APPROVED, REJECTED, RESUBMITTED) est préparé dans le type mais n'est pas
 * encore piloté par une interface.
 */
export type PaymentDeclarationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESUBMITTED';

export type ExternalPaymentMethod =
  | 'MOBILE_MONEY'
  | 'BANK_TRANSFER'
  | 'CASH'
  | 'CHEQUE'
  | 'OTHER';

/** Statuts réservés à l'administration (étape suivante) : non produits par l'employeur. */
export const PAYMENT_DECLARATION_ADMIN_STATUSES: readonly PaymentDeclarationStatus[] = [
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RESUBMITTED',
];

export const EXTERNAL_PAYMENT_METHODS: readonly ExternalPaymentMethod[] = [
  'MOBILE_MONEY',
  'BANK_TRANSFER',
  'CASH',
  'CHEQUE',
  'OTHER',
];

export const EXTERNAL_PAYMENT_METHOD_LABELS: Record<ExternalPaymentMethod, string> = {
  MOBILE_MONEY: 'Mobile Money (MTN / Moov)',
  BANK_TRANSFER: 'Virement bancaire',
  CASH: 'Espèces',
  CHEQUE: 'Chèque',
  OTHER: 'Autre moyen',
};

export const PAYMENT_DECLARATION_STATUS_LABELS: Record<PaymentDeclarationStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  UNDER_REVIEW: 'En contrôle',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  RESUBMITTED: 'Resoumis',
};

/** Champs saisis par l'employeur pour créer ou modifier une déclaration. */
export interface PaymentDeclarationInput {
  contractId: string;
  amount: number;
  paymentMethod: ExternalPaymentMethod;
  transactionId: string;
  reference: string;
  /** ISO 8601 — date/heure réelle du règlement hors plateforme. */
  paidAt: string;
  proofDocumentId?: string;
  proofReference?: string;
  comment?: string;
}

export interface PaymentDeclaration extends PaymentDeclarationInput {
  paymentId: string;
  employerId: string;
  currency: string;
  status: PaymentDeclarationStatus;
  /** ISO 8601 — renseigné lors de la soumission employeur (Phase 4B). */
  submittedAt?: string;
  /** ISO 8601 — renseigné lors de la décision administrative (Phase 4D). */
  reviewedAt?: string;
  /** Identifiant interne de l'ADMIN auteur de la décision (Phase 4D). */
  reviewedBy?: string;
  /** Motif obligatoire d'un rejet administratif (Phase 4D). */
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  offerId: string;
  offerTitle: string;
  applicationId?: string;
  /**
   * P0-F — proposition d'embauche ACCEPTED à l'origine du contrat.
   * Un seul contrat peut être créé par proposition (invariant persisté par
   * `migrations/0005_contract_lifecycle.sql`).
   */
  proposalId?: string;
  employerId: string;
  employerName: string;
  employerPublicId?: string;
  employeeId: string;
  employeeName: string;
  employeePublicId?: string;
  monthlySalary: number;
  currency: string;
  startDate: string;
  endDate?: string;
  currentMonth: number;
  status: ContractStatus;
  employerSigned?: boolean;
  employerSignedAt?: string;
  employeeSigned?: boolean;
  employeeSignedAt?: string;
  signedByEmployer?: boolean;
  signedByEmployee?: boolean;
  missionDescription: string;
  location: string;
  durationMonths: number;
  periodicity: string;
  conditions: string[];
  additionalNotes?: string;
  monthlyCheckpoints: MonthlyFollowupCheckpoint[];
  commissionLedger: CommissionLedgerEntry[];
  paymentSchedule: PaymentScheduleEntry[];
  commissionPercentage: number;
  commissionAmountDue: number;
  firstMonthCommission?: number;
  commissionStatus: CommissionPaymentStatus;
  latestPaymentId?: string;
  replacementId?: string;
  replacedContractId?: string;
  incidentId?: string;
  history: ContractAuditLog[];
}

export interface Incident {
  id: string;
  contractId: string;
  offerTitle: string;
  employerId: string;
  employerName: string;
  employeeId: string;
  employeeName: string;
  reportedBy: 'EMPLOYER' | 'EMPLOYEE';
  declaredBy?: string;
  reason: string;
  description: string;
  evidenceNote?: string;
  createdAt: string;
  status: IncidentStatus;
  adminDecision?: 'CONTINUER' | 'ANNULER' | 'REMPLACER' | 'CLÔTURER' | 'SUSPENDRE';
  arbitrationDecision?: string;
  arbitrationNotes?: string;
  arbitratedAt?: string;
  decisionNote?: string;
  decidedAt?: string;
  decidedBy?: string;
  history: { action: string; timestamp: string; actor: string }[];
}

export interface ReplacementDossier {
  id: string;
  /** Legacy display alias; persistent replacements point this at the source Claim. */
  incidentId: string;
  /** Canonical persistent incident reference for the PostgreSQL workflow. */
  claimId?: string;
  originalContractId: string;
  employerId: string;
  employerName: string;
  /** Populated after the employer publishes the replacement offer. */
  urgentOfferId?: string;
  urgentOfferTitle?: string;
  selectedCandidateId?: string;
  selectedCandidatePublicId?: string;
  selectedCandidateName?: string;
  selectedApplicationId?: string;
  selectedProposalId?: string;
  newContractId?: string;
  status: 'PENDING_OFFER' | 'SOURCING_CANDIDATES' | 'CANDIDATE_SELECTED' | 'TRANSFERRED_TO_EMPLOYER' | 'CONTRACT_FINALIZED';
  openedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateTransfer {
  transferId: string;
  replacementId: string;
  offerId: string;
  candidateId: string;
  candidateName: string;
  targetEmployerId: string;
  targetEmployerName: string;
  status: 'SELECTED' | 'TRANSFER_PENDING' | 'TRANSFERRED' | 'DECLINED' | 'COMPLETED';
  createdAt: string;
  completedAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: UserRole;
  text?: string;
  isVoice?: boolean;
  audioDurationSeconds?: number;
  audioUrl?: string;
  audioDataUrl?: string;
  waveform?: number[];
  sentAt: string;
  isRead: boolean;
  status?: 'SENT' | 'DELIVERED' | 'READ';
  isSystemEvent?: boolean;
  proposal?: MissionProposal;
  isCallEvent?: boolean;
  callRecord?: CallRecord;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  otherParticipant: {
    id: string;
    publicId?: string;
    name: string;
    role: UserRole;
    avatarUrl: string;
  };
  contextType: 'OFFER' | 'APPLICATION' | 'PROPOSAL' | 'CONTRACT' | 'INCIDENT' | 'REPLACEMENT';
  contextTitle: string;
  contextRefId: string;
  lastMessageText: string;
  lastMessageTime: string;
  unreadCount: number;
}

export interface SystemAuditLog {
  id: string;
  timestamp: string;
  actor: string;
  role: UserRole | 'SYSTEM';
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  metadata?: Record<string, any>;
}

export interface FilterState {
  searchQuery: string;
  location: string;
  departmentId?: string;
  communeId?: string;
  arrondissementId?: string;
  localityId?: string;
  contractType: string;
  minSalary: number;
  availability: string;
  remoteOption: 'ALL' | 'ON_SITE' | 'HYBRID' | 'REMOTE';
  selectedSkills: string[];
  selectedDomain?: string;
  selectedJob?: string;
}

export interface RevenueMetrics {
  totalCommissionsDue?: number;
  totalCommissionsReceived?: number;
  totalCommissionsPending?: number;
  totalDue?: number;
  totalEncaissed?: number;
  collectionRate?: number;
}

