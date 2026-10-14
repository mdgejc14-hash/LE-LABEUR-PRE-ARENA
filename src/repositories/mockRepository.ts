import {
  AuthRepository,
  UserRepository,
  OfferRepository,
  ApplicationRepository,
  ContractRepository,
  IncidentRepository,
  MessageRepository,
  PaymentRepository,
  NotificationRepository,
  ReplacementRepository,
  AuditLogRepository,
  CallRepository,
  CommunicationTrackingRepository,
  ResourceRepository,
  RevenueMetrics,
} from './interfaces';
import {
  UserProfile,
  UserRole,
  Offer,
  Application,
  Contract,
  MonthlyFollowupCheckpoint,
  CommissionLedgerEntry,
  PaymentScheduleEntry,
  SalaryPaymentStatus,
  Incident,
  Conversation,
  ChatMessage,
  MissionProposal,
  ReplacementDossier,
  CandidateTransfer,
  CommissionPaymentRecord,
  AppNotification,
  SystemAuditLog,
  FilterState,
  CallRecord,
  CommunicationEvent,
  ResourceDocument,
  PaymentDeclaration,
  PaymentDeclarationInput,
  ExternalPaymentMethod,
  EXTERNAL_PAYMENT_METHODS,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_OFFERS,
  INITIAL_APPLICATIONS,
  INITIAL_CONTRACTS,
  INITIAL_PAYMENTS,
  INITIAL_PAYMENT_DECLARATIONS,
  INITIAL_INCIDENTS,
  INITIAL_REPLACEMENTS,
  INITIAL_PROPOSALS,
  INITIAL_CONVERSATIONS,
  INITIAL_MESSAGES,
  INITIAL_NOTIFICATIONS,
  INITIAL_SYSTEM_LOGS,
  INITIAL_CALLS,
  INITIAL_COMMUNICATION_EVENTS,
  INITIAL_RESOURCES,
} from './mockData';
import {
  calculateFirstMonthCommission,
  calculateFirstMonthEmployeeShare,
  calculateLaterMonthCommission,
  calculateLaterMonthEmployeeShare,
  buildPaymentSchedule,
  parseContractStartDate,
  isPaymentDue,
} from '../domain/businessRules';
import { normalizeRejectionReason, sortSubmittedDeclarationsForAdmin } from '../domain/adminPaymentReview';

const STORAGE_KEYS = {
  USERS: 'lelabeur_v5_users',
  CURRENT_USER_ID: 'lelabeur_v5_current_user_id',
  OFFERS: 'lelabeur_v5_offers',
  APPLICATIONS: 'lelabeur_v5_applications',
  CONTRACTS: 'lelabeur_v5_contracts',
  PAYMENTS: 'lelabeur_v5_payments',
  PAYMENT_DECLARATIONS: 'lelabeur_v5_payment_declarations',
  INCIDENTS: 'lelabeur_v5_incidents',
  REPLACEMENTS: 'lelabeur_v5_replacements',
  TRANSFERS: 'lelabeur_v5_transfers',
  PROPOSALS: 'lelabeur_v5_proposals',
  CONVERSATIONS: 'lelabeur_v5_conversations',
  MESSAGES: 'lelabeur_v5_messages',
  NOTIFICATIONS: 'lelabeur_v5_notifications',
  SYSTEM_LOGS: 'lelabeur_v5_system_logs',
  FAVORITES_BY_USER: 'lelabeur_v5_favorites_by_user',
  CALLS: 'lelabeur_v5_calls',
  COMMUNICATION_EVENTS: 'lelabeur_v5_comm_events',
  RESOURCES: 'lelabeur_v5_resources',
};

function getStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item);
  } catch {
    return fallback;
  }
}

function setStorage<T>(key: string, value: T): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Storage error', err);
  }
}

export class MockService implements
  AuthRepository,
  UserRepository,
  OfferRepository,
  ApplicationRepository,
  ContractRepository,
  IncidentRepository,
  MessageRepository,
  PaymentRepository,
  NotificationRepository,
  ReplacementRepository,
  AuditLogRepository,
  CallRepository,
  CommunicationTrackingRepository,
  ResourceRepository {
  private users: UserProfile[] = getStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
  private currentUserId: string = getStorage(STORAGE_KEYS.CURRENT_USER_ID, '');
  private offers: Offer[] = getStorage(STORAGE_KEYS.OFFERS, INITIAL_OFFERS);
  private applications: Application[] = getStorage(STORAGE_KEYS.APPLICATIONS, INITIAL_APPLICATIONS);
  private contracts: Contract[] = getStorage(STORAGE_KEYS.CONTRACTS, INITIAL_CONTRACTS) || [];
  private payments: CommissionPaymentRecord[] = getStorage(STORAGE_KEYS.PAYMENTS, INITIAL_PAYMENTS) || [];
  private paymentDeclarations: PaymentDeclaration[] = getStorage(STORAGE_KEYS.PAYMENT_DECLARATIONS, INITIAL_PAYMENT_DECLARATIONS) || [];
  private incidents: Incident[] = getStorage(STORAGE_KEYS.INCIDENTS, INITIAL_INCIDENTS) || [];
  private replacements: ReplacementDossier[] = getStorage(STORAGE_KEYS.REPLACEMENTS, INITIAL_REPLACEMENTS) || [];
  private transfers: CandidateTransfer[] = getStorage(STORAGE_KEYS.TRANSFERS, []) || [];
  private proposals: MissionProposal[] = getStorage(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS) || [];
  private conversations: Conversation[] = getStorage(STORAGE_KEYS.CONVERSATIONS, INITIAL_CONVERSATIONS) || [];
  private messages: Record<string, ChatMessage[]> = getStorage(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES) || {};
  private notifications: AppNotification[] = getStorage(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS) || [];
  private systemLogs: SystemAuditLog[] = getStorage(STORAGE_KEYS.SYSTEM_LOGS, INITIAL_SYSTEM_LOGS) || [];
  private favoritesByUser: Record<string, string[]> = getStorage(STORAGE_KEYS.FAVORITES_BY_USER, { 'user-cand-1': ['OFFER-001'] }) || {};
  private calls: CallRecord[] = getStorage(STORAGE_KEYS.CALLS, INITIAL_CALLS) || [];
  private communicationEvents: CommunicationEvent[] = getStorage(STORAGE_KEYS.COMMUNICATION_EVENTS, INITIAL_COMMUNICATION_EVENTS) || [];
  private resources: ResourceDocument[] = getStorage(STORAGE_KEYS.RESOURCES, INITIAL_RESOURCES) || [];
  private idSequence = 0;
  // Local-only retry protection for the mock. Production must enforce the same
  // contract server-side with durable idempotency records/uniqueness constraints.
  private idempotencyResults = new Map<string, { fingerprint: string; result: unknown }>();

  constructor() {
    // Chaque instance de MockService doit avoir son propre état en mémoire.
    // Sans copie profonde, les scénarios/tests et les sessions multiples partageaient
    // directement les tableaux INITIAL_* importés, ce qui pouvait contaminer une instance
    // par les mutations d'une autre. Le backend réel remplacera cette couche par une
    // persistance isolée côté serveur/base de données.
    const clone = <T>(value: T): T => {
      if (typeof structuredClone === 'function') return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    };
    this.users = clone(this.users).map(user => this.normalizeUserAccountState(user));
    this.offers = clone(this.offers);
    this.applications = clone(this.applications);
    this.contracts = clone(this.contracts).map(contract => this.ensurePaymentSchedule(contract));
    this.payments = clone(this.payments);
    this.paymentDeclarations = clone(this.paymentDeclarations);
    this.incidents = clone(this.incidents);
    this.replacements = clone(this.replacements);
    this.transfers = clone(this.transfers);
    this.proposals = clone(this.proposals);
    this.conversations = clone(this.conversations);
    this.messages = clone(this.messages);
    this.notifications = clone(this.notifications);
    this.systemLogs = clone(this.systemLogs);
    this.favoritesByUser = clone(this.favoritesByUser);
    this.calls = clone(this.calls);
    this.communicationEvents = clone(this.communicationEvents);
    this.resources = clone(this.resources);
  }


  private resolveMockIdempotency<T>(scope: string, actorId: string, idempotencyKey: string | undefined, input: unknown): T | undefined {
    if (!idempotencyKey?.trim()) return undefined;
    const key = `${scope}:${actorId}:${idempotencyKey.trim()}`;
    const fingerprint = JSON.stringify(input);
    const existing = this.idempotencyResults.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error('Clé d’idempotence déjà utilisée avec une commande différente.');
      }
      return existing.result as T;
    }
    return undefined;
  }

  private rememberMockIdempotency(scope: string, actorId: string, idempotencyKey: string | undefined, input: unknown, result: unknown): void {
    if (!idempotencyKey?.trim()) return;
    const key = `${scope}:${actorId}:${idempotencyKey.trim()}`;
    this.idempotencyResults.set(key, { fingerprint: JSON.stringify(input), result });
  }

  private normalizeUserAccountState(user: UserProfile): UserProfile {
    return {
      ...user,
      accountStatus: user.accountStatus || 'ACTIVE'
    };
  }

  // Projection strictement publique utilisée par les annuaires de talents.
  // Les données de contact et l'adresse détaillée ne doivent jamais être
  // chargées dans le navigateur d'un autre utilisateur.
  private toPublicDirectoryProfile(user: UserProfile): UserProfile {
    return {
      ...this.normalizeUserAccountState(user),
      email: '',
      phone: '',
      detailedAddress: undefined,
    };
  }

  private requireActor(actorId: string): UserProfile {
    if (!actorId || !actorId.trim()) {
      throw new Error('Action non autorisée : actorId obligatoire.');
    }
    const actor = this.users.find(u => u.id === actorId);
    if (!actor) {
      throw new Error('Action non autorisée : acteur introuvable.');
    }
    const normalized = this.normalizeUserAccountState(actor);
    if (normalized !== actor) {
      Object.assign(actor, normalized);
    }
    return actor;
  }

  private assertOperationalActor(actor: UserProfile, action = 'Cette action'): void {
    if (actor.role !== 'ADMIN' && actor.accountStatus === 'BLOCKED') {
      const reason = actor.blockReason ? ` Motif : ${actor.blockReason}` : '';
      throw new Error(`${action} est indisponible : COMPTE BLOQUÉ.${reason} Régularisez votre échéance puis demandez le déblocage à l administration.`);
    }
  }

  private requireOperationalActor(actorId: string, action = 'Cette action'): UserProfile {
    const actor = this.requireActor(actorId);
    this.assertOperationalActor(actor, action);
    return actor;
  }

  private assertRegularizationActor(actor: UserProfile, allowedActions: string[], actionType: string): void {
    if (actor.role === 'ADMIN' || actor.accountStatus !== 'BLOCKED') return;
    if (!allowedActions.includes(actionType)) {
      const reason = actor.blockReason ? ` Motif : ${actor.blockReason}` : '';
      throw new Error(`COMPTE BLOQUÉ : seule la régularisation des paiements reste autorisée.${reason}`);
    }
  }

  private getAdminUsers(): UserProfile[] {
    return this.users.filter(user => user.role === 'ADMIN');
  }

  private getOverdueDueEntries(userId: string, minimumDaysLate = 0): Array<{ contract: Contract; entry: PaymentScheduleEntry; paymentKind: 'SALARY' | 'COMMISSION'; daysLate: number }> {
    const now = new Date();
    const results: Array<{ contract: Contract; entry: PaymentScheduleEntry; paymentKind: 'SALARY' | 'COMMISSION'; daysLate: number }> = [];
    for (const contract of this.contracts.filter(candidate => candidate.employerId === userId)) {
      this.ensurePaymentSchedule(contract);
      for (const entry of contract.paymentSchedule) {
        const checks: Array<{ status: SalaryPaymentStatus; dueDate?: string; paymentKind: 'SALARY' | 'COMMISSION' }> = [
          { status: entry.salaryStatus, dueDate: entry.salaryDueDate, paymentKind: 'SALARY' },
          { status: entry.commissionStatus, dueDate: entry.commissionDueDate, paymentKind: 'COMMISSION' }
        ];
        for (const check of checks) {
          if (check.paymentKind === 'COMMISSION' && entry.commissionAmount <= 0) continue;
          if (!['DUE', 'REJECTED'].includes(check.status) || !check.dueDate) continue;
          const dueTime = new Date(check.dueDate).getTime();
          if (!Number.isFinite(dueTime)) continue;
          const daysLate = Math.max(0, Math.floor((now.getTime() - dueTime) / 86400000));
          if (daysLate >= minimumDaysLate) results.push({ contract, entry, paymentKind: check.paymentKind, daysLate });
        }
      }
    }
    return results;
  }

  private async hasOutstandingDue(userId: string): Promise<boolean> {
    return this.getOverdueDueEntries(userId, 0).length > 0;
  }

  private assertOwner(actorId: string, ownerId: string, message = 'Action non autorisée : vous ne possédez pas cette ressource.') {
    if (actorId !== ownerId) throw new Error(message);
  }

  private ensurePaymentSchedule(contract: Contract): Contract {
    const createdAt = contract.history?.[0]?.timestamp || new Date().toISOString();
    let schedule: PaymentScheduleEntry[] = Array.isArray(contract.paymentSchedule) && contract.paymentSchedule.length
      ? contract.paymentSchedule
      : buildPaymentSchedule({
          contractId: contract.id,
          startDate: contract.startDate,
          durationMonths: contract.durationMonths,
          monthlySalary: contract.monthlySalary,
          currency: contract.currency,
          createdAt
        });

    const terminal = contract.status === 'TERMINATED' || contract.status === 'COMPLETED' || contract.status === 'REPLACED';
    const canBecomeDue = ['ACTIVE', 'SUSPENDED', 'INCIDENT', 'TERMINATED', 'COMPLETED', 'REPLACED'].includes(contract.status);

    schedule = schedule.map(entry => {
      const checkpoint = contract.monthlyCheckpoints?.find(cp => cp.monthNumber === entry.monthNumber);
      const ledger = contract.commissionLedger?.find(l => l.monthNumber === entry.monthNumber);

      // Preserve payment history that was already due or paid. Future periods
      // frozen as NOT_APPLICABLE at termination must never become DUE later.
      if (terminal && entry.salaryStatus === 'NOT_APPLICABLE') {
        entry.salaryStatus = 'NOT_APPLICABLE';
        if (entry.monthNumber === 1 || entry.commissionAmount === 0) entry.commissionStatus = 'NOT_APPLICABLE';
        return entry;
      }
      if (terminal && !isPaymentDue(entry.salaryDueDate) && entry.salaryStatus === 'SCHEDULED') {
        entry.salaryStatus = 'NOT_APPLICABLE';
        entry.commissionStatus = 'NOT_APPLICABLE';
        return entry;
      }

      // Salary state is driven by the salary checkpoint and schedule due date.
      if (entry.salaryStatus === 'PAID' || checkpoint?.employeeSalaryConfirmation === 'RECEIVED' || checkpoint?.isSalaryPaidToEmployee) {
        entry.salaryStatus = 'PAID';
        entry.salaryConfirmedAt = entry.salaryConfirmedAt || checkpoint?.employeeSalaryConfirmedAt;
        entry.salaryTransactionId = entry.salaryTransactionId || checkpoint?.salaryTxnId;
        entry.salaryDeclaredAt = entry.salaryDeclaredAt || checkpoint?.salaryDeclaredAt;
        entry.salaryProofFileName = entry.salaryProofFileName || checkpoint?.salaryProofFileName;
      } else if (entry.salaryStatus === 'PENDING_VERIFICATION' || checkpoint?.salaryDeclaredAt) {
        entry.salaryStatus = 'PENDING_VERIFICATION';
        entry.salaryDeclaredAt = entry.salaryDeclaredAt || checkpoint?.salaryDeclaredAt;
        entry.salaryTransactionId = entry.salaryTransactionId || checkpoint?.salaryTxnId;
        entry.salaryProofFileName = entry.salaryProofFileName || checkpoint?.salaryProofFileName;
      } else if (entry.salaryStatus === 'REJECTED') {
        entry.salaryStatus = 'REJECTED';
      } else if (canBecomeDue && isPaymentDue(entry.salaryDueDate)) {
        entry.salaryStatus = 'DUE';
      } else {
        entry.salaryStatus = 'SCHEDULED';
      }

      // Commission state is scheduled in M1 and not applicable from M2 onwards.
      if (entry.monthNumber > 1) {
        entry.commissionStatus = 'NOT_APPLICABLE';
        entry.commissionAmount = 0;
      } else if (entry.commissionStatus === 'PAID' || ledger?.status === 'PAID' || contract.commissionStatus === 'PAID') {
        entry.commissionStatus = 'PAID';
        entry.commissionVerifiedAt = entry.commissionVerifiedAt || ledger?.verifiedAt;
        entry.commissionTransactionId = entry.commissionTransactionId || undefined;
      } else if (entry.commissionStatus === 'PENDING_VERIFICATION' || ledger?.status === 'PENDING_VERIFICATION' || contract.commissionStatus === 'PENDING_VERIFICATION') {
        entry.commissionStatus = 'PENDING_VERIFICATION';
      } else if (entry.commissionStatus === 'REJECTED' || ledger?.status === 'REJECTED') {
        entry.commissionStatus = 'REJECTED';
      } else if (entry.commissionStatus === 'DUE' || (canBecomeDue && isPaymentDue(entry.commissionDueDate))) {
        entry.commissionStatus = 'DUE';
      } else {
        entry.commissionStatus = 'SCHEDULED';
      }
      return entry;
    });

    contract.paymentSchedule = schedule;
    const currentEntry = schedule.find(entry => entry.monthNumber === contract.currentMonth) || schedule.find(entry => entry.monthNumber === 1);
    if (currentEntry) {
      contract.commissionPercentage = currentEntry.monthNumber === 1 ? 25 : 0;
      contract.commissionAmountDue = currentEntry.commissionAmount;
      contract.commissionStatus = currentEntry.commissionStatus;
    }
    return contract;
  }

  private freezeFuturePaymentEntries(contract: Contract): void {
    if (!Array.isArray(contract.paymentSchedule)) return;
    for (const entry of contract.paymentSchedule) {
      if (!isPaymentDue(entry.salaryDueDate)) {
        entry.salaryStatus = 'NOT_APPLICABLE';
        entry.commissionStatus = 'NOT_APPLICABLE';
      } else {
        if (entry.salaryStatus === 'SCHEDULED') entry.salaryStatus = 'DUE';
        if (entry.commissionAmount > 0 && entry.commissionStatus === 'SCHEDULED') entry.commissionStatus = 'DUE';
      }
    }
  }

  private async syncPaymentSchedule(contract: Contract): Promise<void> {
    this.ensurePaymentSchedule(contract);
    for (const entry of contract.paymentSchedule) {
      if (entry.salaryStatus === 'DUE') {
        await this.createNotification({
          recipientId: contract.employerId,
          type: 'MONTHLY_CHECKPOINT',
          title: 'Paiement de salaire à régulariser',
          message: `${entry.periodKey} — ${entry.salaryAmount.toLocaleString()} ${entry.currency} pour ${contract.employeeName}. Échéance : ${entry.salaryDueDate}. Action : payer HORS LE LABEUR puis déclarer le paiement dans l’application.`,
          linkRef: { screen: 'CONTRACTS', id: contract.id },
          dedupeKey: `${contract.id}:${entry.monthNumber}:SALARY`
        });
      }
      if (entry.commissionStatus === 'DUE' && entry.commissionAmount > 0) {
        await this.createNotification({
          recipientId: contract.employerId,
          type: 'COMMISSION_DUE',
          title: 'Commission LE LABEUR à régulariser',
          message: `${entry.periodKey} — Commission de ${entry.commissionAmount.toLocaleString()} ${entry.currency}. Échéance : ${entry.commissionDueDate}. Action : payer HORS LE LABEUR puis déclarer la commission.`,
          linkRef: { screen: 'CONTRACTS', id: contract.id },
          dedupeKey: `${contract.id}:${entry.monthNumber}:COMMISSION`
        });
      }

      const dueKinds: Array<{ status: SalaryPaymentStatus; dueDate?: string; amount: number; paymentKind: 'SALARY' | 'COMMISSION'; label: string }> = [
        { status: entry.salaryStatus, dueDate: entry.salaryDueDate, amount: entry.salaryAmount, paymentKind: 'SALARY', label: 'salaire' },
        { status: entry.commissionStatus, dueDate: entry.commissionDueDate, amount: entry.commissionAmount, paymentKind: 'COMMISSION', label: 'commission' }
      ];
      for (const due of dueKinds) {
        if (due.status !== 'DUE' || due.amount <= 0 || !due.dueDate) continue;
        const dueTime = new Date(due.dueDate).getTime();
        if (!Number.isFinite(dueTime)) continue;
        const daysLate = Math.floor((Date.now() - dueTime) / 86400000);
        if (daysLate < 3) continue;

        await this.createNotification({
          recipientId: contract.employerId,
          type: 'PAYMENT_OVERDUE_J3',
          title: 'J+3 — régularisation requise',
          message: `${entry.periodKey} — ${due.label} de ${due.amount.toLocaleString()} ${entry.currency} reste impayé depuis ${daysLate} jour(s). Votre compte peut être bloqué. Régularisez HORS LE LABEUR puis déclarez le paiement.`,
          linkRef: { screen: 'CONTRACTS', id: contract.id },
          dedupeKey: `${contract.id}:${entry.monthNumber}:${due.paymentKind}:J3:EMPLOYER`
        });
        for (const admin of this.getAdminUsers()) {
          await this.createNotification({
            recipientId: admin.id,
            type: 'PAYMENT_OVERDUE_J3',
            title: 'Alerte J+3 — échéance non régularisée',
            message: `${contract.employerName} — ${entry.periodKey}, ${due.label} de ${due.amount.toLocaleString()} ${entry.currency}, échéance ${due.dueDate}. L’échéance est impayée depuis ${daysLate} jour(s) ; le compte peut être bloqué.`,
            linkRef: { screen: 'CONTRACTS', id: contract.id },
            dedupeKey: `${contract.id}:${entry.monthNumber}:${due.paymentKind}:J3:ADMIN:${admin.id}`
          });
        }
      }
    }
    this.persistAll();
  }

  public resetAllData(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    this.users = JSON.parse(JSON.stringify(INITIAL_USERS));
    this.currentUserId = '';
    this.idempotencyResults.clear();
    this.offers = JSON.parse(JSON.stringify(INITIAL_OFFERS));
    this.applications = JSON.parse(JSON.stringify(INITIAL_APPLICATIONS));
    this.contracts = JSON.parse(JSON.stringify(INITIAL_CONTRACTS)).map((c: Contract) => this.ensurePaymentSchedule(c));
    this.payments = JSON.parse(JSON.stringify(INITIAL_PAYMENTS));
    this.paymentDeclarations = JSON.parse(JSON.stringify(INITIAL_PAYMENT_DECLARATIONS));
    this.incidents = JSON.parse(JSON.stringify(INITIAL_INCIDENTS));
    this.replacements = JSON.parse(JSON.stringify(INITIAL_REPLACEMENTS));
    this.transfers = [];
    this.proposals = JSON.parse(JSON.stringify(INITIAL_PROPOSALS));
    this.conversations = JSON.parse(JSON.stringify(INITIAL_CONVERSATIONS));
    this.messages = JSON.parse(JSON.stringify(INITIAL_MESSAGES));
    this.notifications = JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS));
    this.systemLogs = JSON.parse(JSON.stringify(INITIAL_SYSTEM_LOGS));
    this.favoritesByUser = { 'user-cand-1': ['OFFER-001'] };
    this.calls = JSON.parse(JSON.stringify(INITIAL_CALLS));
    this.communicationEvents = JSON.parse(JSON.stringify(INITIAL_COMMUNICATION_EVENTS));
    this.resources = JSON.parse(JSON.stringify(INITIAL_RESOURCES));
    this.persistAll();
  }

  private persistAll(): void {
    setStorage(STORAGE_KEYS.USERS, this.users);
    setStorage(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
    setStorage(STORAGE_KEYS.OFFERS, this.offers);
    setStorage(STORAGE_KEYS.APPLICATIONS, this.applications);
    setStorage(STORAGE_KEYS.CONTRACTS, this.contracts);
    setStorage(STORAGE_KEYS.PAYMENTS, this.payments);
    setStorage(STORAGE_KEYS.PAYMENT_DECLARATIONS, this.paymentDeclarations);
    setStorage(STORAGE_KEYS.INCIDENTS, this.incidents);
    setStorage(STORAGE_KEYS.REPLACEMENTS, this.replacements);
    setStorage(STORAGE_KEYS.TRANSFERS, this.transfers);
    setStorage(STORAGE_KEYS.PROPOSALS, this.proposals);
    setStorage(STORAGE_KEYS.CONVERSATIONS, this.conversations);
    setStorage(STORAGE_KEYS.MESSAGES, this.messages);
    setStorage(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    setStorage(STORAGE_KEYS.SYSTEM_LOGS, this.systemLogs);
    setStorage(STORAGE_KEYS.FAVORITES_BY_USER, this.favoritesByUser);
    setStorage(STORAGE_KEYS.CALLS, this.calls);
    setStorage(STORAGE_KEYS.COMMUNICATION_EVENTS, this.communicationEvents);
    setStorage(STORAGE_KEYS.RESOURCES, this.resources);
  }

  private nowDateTimeString(): string {
    const d = new Date();
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' — ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private createId(prefix: string): string {
    this.idSequence += 1;
    return `${prefix}-${Date.now()}-${this.idSequence}-${Math.floor(Math.random() * 1000000)}`;
  }

  private generatePublicId(role: UserRole): string {
    const prefix = role === 'EMPLOYER' ? 'LAB-R' : role === 'ADMIN' ? 'LAB-A' : 'LAB-C';
    const sameRoleCount = this.users.filter(u => u.role === role).length + 1;
    return `${prefix}-${sameRoleCount.toString().padStart(6, '0')}`;
  }

  // --- AuthRepository ---
  getCurrentUser(): UserProfile | null {
    if (!this.currentUserId) return null;
    return this.users.find(u => u.id === this.currentUserId) || null;
  }

  async login(email: string, role?: UserRole): Promise<UserProfile> {
    if (role !== undefined && !['CANDIDATE', 'EMPLOYER', 'ADMIN'].includes(role)) {
      throw new Error('Rôle de connexion invalide.');
    }
    const existing = this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      if (existing.accountStatus === 'BLOCKED') {
        throw new Error('Connexion refusée : ce compte est bloqué.');
      }
      if (role && existing.role !== role) {
        throw new Error('Action non autorisée : le rôle sélectionné ne correspond pas au compte.');
      }
      this.currentUserId = existing.id;
      setStorage(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
      this.persistAll();
      return existing;
    }

    const assignedRole = role || 'CANDIDATE';
    if (assignedRole === 'ADMIN') {
      throw new Error('Action non autorisée : un compte ADMIN doit exister et être attribué par le système.');
    }
    const newUser: UserProfile = {
      id: this.createId('user'),
      publicId: this.generatePublicId(assignedRole),
      role: assignedRole,
      accountStatus: 'ACTIVE',
      fullName: email.split('@')[0],
      name: email.split('@')[0],
      email: email,
      phone: '+229 97 00 00 00',
      headline: assignedRole === 'EMPLOYER' ? 'Recruteur Professionnel Bénin' : 'Artisan Qualifié Bénin',
      location: 'Cotonou (Littoral, Bénin)',
      departmentId: 'dept-littoral',
      communeId: 'com-cotonou',
      arrondissementId: 'arr-cotonou-12',
      localityId: 'loc-cadjehoun-kpota',
      detailedAddress: 'Cotonou Centre',
      avatarUrl: '',
      bio: 'Profil professionnel LE LABEUR République du Bénin.',
      skills: ['Artisanat', 'Rigueur', 'Engagement'],
      experienceYears: 4,
      desiredContract: 'CDI / Mission',
      desiredSalary: '100 000 FCFA',
      availability: 'Immédiate',
      portfolio: []
    };
    this.users.push(newUser);
    this.currentUserId = newUser.id;
    this.persistAll();
    return newUser;
  }

  async register(email: string, fullName: string, role: UserRole): Promise<UserProfile> {
    if (!['CANDIDATE', 'EMPLOYER', 'ADMIN'].includes(role)) {
      throw new Error('Rôle d’inscription invalide.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Email obligatoire.');
    const existing = this.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existing) throw new Error('Un compte existe déjà avec cet email.');
    if (role === 'ADMIN') {
      throw new Error('Action non autorisée : la création d’un compte ADMIN est réservée au système.');
    }
    const user = await this.login(normalizedEmail, role);
    user.fullName = fullName;
    user.name = fullName;
    user.publicId = this.generatePublicId(role);
    this.persistAll();
    return user;
  }

  async findUserByGoogleSub(googleSub: string): Promise<UserProfile | null> {
    if (!googleSub) return null;
    return this.users.find(u => u.googleSub === googleSub) || null;
  }

  async loginWithGoogle(googleSub: string, _role?: UserRole): Promise<UserProfile> {
    if (!googleSub) throw new Error('Identifiant Google (sub) obligatoire.');
    const existing = await this.findUserByGoogleSub(googleSub);
    if (!existing) {
      throw new Error("Aucun compte LE LABEUR n'est associé à ce compte Google. Veuillez vous inscrire d'abord.");
    }
    if (existing.accountStatus === 'BLOCKED') {
      throw new Error('Connexion refusée : ce compte est bloqué.');
    }
    // Restauration du rôle officiel du compte
    this.currentUserId = existing.id;
    setStorage(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
    this.persistAll();
    return existing;
  }

  async registerWithGoogle(data: { googleSub: string; email: string; fullName: string; role: UserRole; avatarUrl?: string }): Promise<UserProfile> {
    if (!data.googleSub) throw new Error('Identifiant Google (sub) obligatoire.');
    if (!['CANDIDATE', 'EMPLOYER'].includes(data.role)) {
      throw new Error('Rôle d’inscription Google invalide (CANDIDATE ou EMPLOYER requis).');
    }
    const normalizedEmail = (data.email || '').trim().toLowerCase();
    
    // 1. Déjà lié par googleSub
    const existingBySub = await this.findUserByGoogleSub(data.googleSub);
    if (existingBySub) {
      if (existingBySub.role !== data.role) {
        throw new Error(`Ce compte Google est déjà associé à un profil ${existingBySub.role}.`);
      }
      this.currentUserId = existingBySub.id;
      setStorage(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
      this.persistAll();
      return existingBySub;
    }

    // 2. Déjà existant par email -> lier googleSub si rôle identique
    if (normalizedEmail) {
      const existingByEmail = this.users.find(u => u.email.toLowerCase() === normalizedEmail);
      if (existingByEmail) {
        if (existingByEmail.role !== data.role) {
          throw new Error(`Un compte avec l’adresse ${normalizedEmail} existe déjà sous le profil ${existingByEmail.role}.`);
        }
        existingByEmail.googleSub = data.googleSub;
        if (data.avatarUrl && !existingByEmail.avatarUrl) {
          existingByEmail.avatarUrl = data.avatarUrl;
        }
        this.currentUserId = existingByEmail.id;
        setStorage(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
        this.persistAll();
        return existingByEmail;
      }
    }

    // 3. Nouveau compte LE LABEUR avec identité Google
    const displayName = (data.fullName || normalizedEmail.split('@')[0] || 'Utilisateur').trim();
    const newUser: UserProfile = {
      id: this.createId('user'),
      publicId: this.generatePublicId(data.role),
      role: data.role,
      googleSub: data.googleSub,
      accountStatus: 'ACTIVE',
      fullName: displayName,
      name: displayName,
      email: normalizedEmail || `google-${data.googleSub.slice(0, 8)}@lelabeur.bj`,
      phone: '+229 97 00 00 00',
      headline: data.role === 'EMPLOYER' ? 'Recruteur Professionnel Bénin' : 'Artisan Qualifié Bénin',
      location: 'Cotonou (Littoral, Bénin)',
      departmentId: 'dept-littoral',
      communeId: 'com-cotonou',
      arrondissementId: 'arr-cotonou-12',
      localityId: 'loc-cadjehoun-kpota',
      detailedAddress: 'Cotonou Centre',
      avatarUrl: data.avatarUrl || '',
      bio: 'Profil professionnel LE LABEUR République du Bénin vérifié par Google.',
      skills: ['Artisanat', 'Rigueur', 'Engagement'],
      experienceYears: 4,
      desiredContract: 'CDI / Mission',
      desiredSalary: '100 000 FCFA',
      availability: 'Immédiate',
      portfolio: []
    };

    this.users.push(newUser);
    this.currentUserId = newUser.id;
    setStorage(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
    this.persistAll();
    return newUser;
  }

  async switchRole(role: UserRole): Promise<UserProfile> {
    if (!['CANDIDATE', 'EMPLOYER', 'ADMIN'].includes(role)) {
      throw new Error('Rôle de session invalide.');
    }
    const current = this.getCurrentUser();
    if (!current) throw new Error('Action non autorisée : aucune session active.');
    if (current.role !== 'ADMIN') {
      if (current.role !== role) throw new Error('Action non autorisée : le rôle d’un compte authentifié est immuable.');
      return current;
    }
    const matching = this.users.find(u => u.role === role);
    if (!matching) throw new Error(`Aucun compte de démonstration disponible pour le rôle ${role}.`);
    this.currentUserId = matching.id;
    this.persistAll();
    return matching;
  }

  async logout(): Promise<void> {
    this.currentUserId = '';
    setStorage(STORAGE_KEYS.CURRENT_USER_ID, '');
  }

  // --- UserRepository ---
  async getAllUsers(actorId: string): Promise<UserProfile[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    return this.users.map(user => this.normalizeUserAccountState(user));
  }

  async blockUser(userId: string, reason: string, actorId: string): Promise<UserProfile> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    if (!reason?.trim()) throw new Error('Le motif de blocage est obligatoire.');
    const user = this.users.find(candidate => candidate.id === userId);
    if (!user) throw new Error('Utilisateur introuvable.');
    if (user.role === 'ADMIN') throw new Error('Un compte ADMIN ne peut pas être bloqué par cette procédure.');
    if (user.accountStatus === 'BLOCKED') return user;
    const overdue = this.getOverdueDueEntries(userId, 3);
    if (!overdue.length) throw new Error('Blocage refusé : aucune échéance non régularisée depuis au moins 3 jours n est constatée pour cet employeur.');
    const timestamp = this.nowDateTimeString();
    user.accountStatus = 'BLOCKED';
    user.blockedAt = timestamp;
    user.blockedBy = actor.id;
    user.blockReason = reason.trim();
    user.unlockedAt = undefined;
    user.unlockedBy = undefined;
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'ACCOUNT_BLOCKED',
      entity: 'UserProfile',
      entityId: user.id,
      summary: `Compte employeur bloqué pour J+3 : ${reason.trim()}.`
    });
    await this.createNotification({
      recipientId: user.id,
      type: 'ACCOUNT_BLOCKED',
      title: 'COMPTE BLOQUÉ',
      message: `Votre compte LE LABEUR a été bloqué. ${reason.trim()} Vous pouvez consulter vos échéances, effectuer le paiement hors plateforme puis déclarer la régularisation.`,
      linkRef: { screen: 'CONTRACTS' },
      // Un nouveau blocage après un déblocage est un nouvel événement.
      dedupeKey: `${user.id}:ACCOUNT_BLOCKED:${timestamp}`
    });
    this.persistAll();
    return user;
  }

  async unblockUser(userId: string, actorId: string): Promise<UserProfile> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    const user = this.users.find(candidate => candidate.id === userId);
    if (!user) throw new Error('Utilisateur introuvable.');
    if (user.accountStatus !== 'BLOCKED') throw new Error('Le compte n’est pas bloqué.');
    if (await this.hasOutstandingDue(userId)) throw new Error('Déblocage refusé : une échéance reste due ou rejetée.');
    const hasPendingVerification = this.contracts.filter(c => c.employerId === userId).some(contract => contract.paymentSchedule.some(entry => entry.salaryStatus === 'PENDING_VERIFICATION' || entry.commissionStatus === 'PENDING_VERIFICATION'));
    if (hasPendingVerification) throw new Error('Déblocage refusé : un paiement reste en vérification.');
    const timestamp = this.nowDateTimeString();
    user.accountStatus = 'ACTIVE';
    user.unlockedAt = timestamp;
    user.unlockedBy = actor.id;
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'ACCOUNT_UNBLOCKED',
      entity: 'UserProfile',
      entityId: user.id,
      summary: 'Compte employeur débloqué après régularisation validée.'
    });
    await this.createNotification({
      recipientId: user.id,
      type: 'ACCOUNT_UNBLOCKED',
      title: 'COMPTE DÉBLOQUÉ',
      message: 'Votre régularisation a été validée. Votre compte LE LABEUR est de nouveau fonctionnel.',
      linkRef: { screen: 'PROFILE' },
      dedupeKey: `${user.id}:ACCOUNT_UNBLOCKED:${timestamp}`
    });
    this.persistAll();
    return user;
  }

  async getProfile(id: string, actorId: string): Promise<UserProfile | null> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN' && actor.id !== id) {
      throw new Error('Action non autorisée : accès au profil d’un autre utilisateur.');
    }
    return this.users.find(u => u.id === id) || null;
  }

  async getAllCandidates(): Promise<UserProfile[]> {
    return this.users
      .filter(u => u.role === 'CANDIDATE' && u.accountStatus !== 'BLOCKED')
      .map(user => this.toPublicDirectoryProfile(user));
  }

  async getAllEmployers(): Promise<UserProfile[]> {
    return this.users
      .filter(u => u.role === 'EMPLOYER')
      .map(user => this.toPublicDirectoryProfile(user));
  }

  async searchCandidates(query: string, filter?: Partial<FilterState>): Promise<UserProfile[]> {
    const q = query.toLowerCase().trim();
    return this.users.filter(u => {
      if (u.role !== 'CANDIDATE' || u.accountStatus === 'BLOCKED') return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.headline.toLowerCase().includes(q) ||
        u.location.toLowerCase().includes(q) ||
        u.skills.some(s => s.toLowerCase().includes(q))
      );
    }).map(user => this.toPublicDirectoryProfile(user));
  }

  async updateProfile(userId: string, profile: Partial<UserProfile>, actorId: string): Promise<UserProfile> {
    const actor = this.requireOperationalActor(actorId, 'La modification du profil');
    this.assertOwner(actorId, userId, 'Action non autorisée : vous ne pouvez modifier que votre propre profil.');
    const user = this.users.find(u => u.id === userId);
    if (!user) throw new Error('Utilisateur non trouvé');
    const protectedFields: (keyof UserProfile)[] = ['id', 'publicId', 'role', 'email'];
    for (const field of protectedFields) {
      if (field in profile && profile[field] !== user[field]) {
        throw new Error(`Action non autorisée : le champ ${String(field)} est protégé.`);
      }
    }
    Object.assign(user, profile);
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'PROFILE_UPDATED',
      entity: 'UserProfile',
      entityId: user.id,
      summary: `Mise à jour du profil de ${user.fullName} (${user.role}).`
    });
    this.persistAll();
    return user;
  }

  // --- OfferRepository ---
  async getAllOffers(): Promise<Offer[]> {
    return this.offers;
  }

  async getOfferById(id: string): Promise<Offer | null> {
    return this.offers.find(o => o.id === id) || null;
  }

  async getOffersByEmployer(employerId: string): Promise<Offer[]> {
    const actor = this.requireActor(this.currentUserId);
    if (actor.role !== 'ADMIN' && (actor.role !== 'EMPLOYER' || actor.id !== employerId)) {
      throw new Error('Action non autorisée : accès aux offres d’un autre employeur.');
    }
    return this.offers.filter(o => o.employerId === employerId);
  }

  async updateOfferStatus(offerId: string, status: 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'PAUSED', actorId: string): Promise<Offer> {
    if (!['ACTIVE', 'FILLED', 'CANCELLED', 'PAUSED'].includes(status)) throw new Error('Statut d’offre invalide.');
    const actor = this.requireOperationalActor(actorId, 'La modification d’une offre');
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : seul un employeur peut modifier une offre.');
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) throw new Error('Offre non trouvée');
    this.assertOwner(actorId, offer.employerId);
    if (offer.status === 'FILLED' && status !== 'FILLED') throw new Error('Une offre pourvue ne peut pas être réactivée.');
    offer.status = status;
    this.persistAll();
    return offer;
  }

  async searchOffers(filter: FilterState): Promise<Offer[]> {
    return this.offers.filter(o => {
      // RÈGLE 21 & 23 : Une offre FILLED, CANCELLED ou PAUSED ne doit JAMAIS apparaître dans la recherche candidat
      if (o.status !== 'ACTIVE') {
        return false;
      }
      const employer = this.users.find(user => user.id === o.employerId);
      if (employer?.accountStatus === 'BLOCKED') return false;
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        const matchesQuery =
          o.title.toLowerCase().includes(q) ||
          o.summary.toLowerCase().includes(q) ||
          o.location.toLowerCase().includes(q) ||
          o.employerName.toLowerCase().includes(q) ||
          o.skills.some(s => s.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }
      // Le repository reste la source d'autorité du filtrage géographique et métier.
      // Lorsqu’une localisation structurée est sélectionnée (departmentId, communeId,
      // arrondissementId, localityId), les IDs géographiques font autorité.
      const hasStructuredGeo = Boolean(
        filter.departmentId ||
        filter.communeId ||
        filter.arrondissementId ||
        filter.localityId
      );

      if (filter.departmentId && o.departmentId !== filter.departmentId) return false;
      if (filter.communeId && o.municipalityId !== filter.communeId) return false;
      if (filter.arrondissementId && o.arrondissementId !== filter.arrondissementId) return false;
      if (filter.localityId && o.localityId !== filter.localityId) return false;

      // Filtrage textuel libre sur filter.location uniquement si aucun ID structuré n'est spécifié
      if (!hasStructuredGeo && filter.location && !o.location.toLowerCase().includes(filter.location.toLowerCase())) {
        return false;
      }

      if (filter.contractType && filter.contractType !== 'ALL' && !o.contractType.toLowerCase().includes(filter.contractType.toLowerCase())) {
        return false;
      }
      if (filter.selectedSkills.length > 0) {
        const hasSkill = filter.selectedSkills.some(s => o.skills.includes(s));
        if (!hasSkill) return false;
      }

      if (filter.selectedDomain && o.domainId !== filter.selectedDomain) return false;
      if (filter.selectedJob && o.jobId !== filter.selectedJob) return false;

      return true;
    });
  }

  async createOffer(offerData: Omit<Offer, 'id' | 'postedDate' | 'compatibilityScore' | 'status'>, actorId: string, idempotencyKey?: string): Promise<Offer> {
    const actor = this.requireOperationalActor(actorId, 'La création d’une offre');
    const retry = this.resolveMockIdempotency<Offer>('createOffer', actorId, idempotencyKey, offerData);
    if (retry) return retry;
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : seul un employeur peut créer une offre.');
    this.assertOwner(actorId, offerData.employerId);
    const newOffer: Offer = {
      ...offerData,
      employerId: actor.id,
      employerName: actor.fullName,
      employerPublicId: actor.publicId,
      employerAvatar: actor.avatarUrl,
      employerLocation: actor.location,
      id: this.createId('OFFER'),
      postedDate: "Aujourd'hui",
      compatibilityScore: 90,
      status: 'ACTIVE'
    };
    this.offers.unshift(newOffer);
    await this.logEvent({
      actor: actor.fullName,
      role: 'EMPLOYER',
      action: 'OFFER_CREATED',
      entity: 'Offer',
      entityId: newOffer.id,
      summary: `Offre publiée : ${newOffer.title} (${newOffer.remuneration.toLocaleString()} FCFA).`
    });
    this.persistAll();
    this.rememberMockIdempotency('createOffer', actorId, idempotencyKey, offerData, newOffer);
    return newOffer;
  }

  async createLeLabeurUrgentJob(
    title: string,
    employerId: string,
    employerName: string,
    remuneration: number,
    skills: string[],
    actorId: string,
    location?: string,
    description?: string,
    durationMonths: number = 3
  ): Promise<Offer> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : cette mission urgente est réservée à ADMIN.');
    const employer = this.users.find(u => u.id === employerId);
    if (!employer || employer.role !== 'EMPLOYER') {
      throw new Error('Employeur invalide : une mission urgente doit être rattachée à un compte EMPLOYER existant.');
    }
    const newOffer: Offer = {
      id: this.createId('OFFER-URGENT'),
      title,
      employerId,
      employerName: `LE LABEUR (Mandat : ${employer.fullName})`,
      employerLocation: location || 'Bureau de Coordination LE LABEUR Bénin',
      contractType: `Mission d'urgence ${durationMonths} mois`,
      remuneration,
      currency: 'FCFA',
      location: location || 'Chantier Prioritaire Cotonou',
      postedDate: 'À l instant',
      isUrgent: true,
      isLeLabeurJob: true,
      leLabeurTag: 'MISSION URGENTE',
      skills,
      summary: description || `Mission urgente émise sous mandat officiel LE LABEUR pour garantir la continuité du chantier suite à arbitrage.`,
      responsibilities: [
        'Prise de poste immédiate sous 24 à 48 heures.',
        'Respect scrupuleux du cahier des charges et des consignes de sécurité.',
        'Coordination directe avec les superviseurs LE LABEUR Bénin.'
      ],
      conditions: [
        'Règlement garanti par le protocole de suivi déontologique LE LABEUR.',
        'Commission de 25% appliquée sur le 1er salaire uniquement.'
      ],
      selectionProcess: [
        'Sélection prioritaire sous 12 heures par l équipe LE LABEUR.'
      ],
      compatibilityScore: 95,
      status: 'ACTIVE',
      durationMonths
    };
    this.offers.unshift(newOffer);
    await this.createNotification({
      recipientId: 'ALL',
      isBroadcast: true,
      recipientRole: 'CANDIDATE',
      type: 'URGENT_JOB_PUBLISHED',
      title: 'Nouvelle Mission Urgente LE LABEUR Bénin',
      message: `${title} (${remuneration.toLocaleString()} FCFA) est ouverte aux candidatures prioritaires.`,
      linkRef: { screen: 'OFFER_DETAIL', id: newOffer.id }
    });
    this.persistAll();
    return newOffer;
  }

  async toggleFavorite(offerId: string, actorId: string): Promise<boolean> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'CANDIDATE') throw new Error('Action non autorisée : seuls les candidats peuvent gérer leurs favoris.');
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) throw new Error('Offre non trouvée');
    if (!this.favoritesByUser[actorId]) this.favoritesByUser[actorId] = [];
    const userFavs = this.favoritesByUser[actorId];
    const idx = userFavs.indexOf(offerId);
    const isFav = idx < 0;
    if (isFav) userFavs.push(offerId); else userFavs.splice(idx, 1);
    this.persistAll();
    return isFav;
  }

  async getFavorites(userId?: string): Promise<string[]> {
    const uid = userId || this.currentUserId;
    if (!uid) return [];
    const actor = this.requireActor(this.currentUserId);
    if (actor.role !== 'ADMIN' && actor.id !== uid) {
      throw new Error('Action non autorisée : accès aux favoris d’un autre utilisateur.');
    }
    if (actor.role === 'ADMIN' && uid !== actor.id) {
      throw new Error('Action non autorisée : les favoris sont personnels.');
    }
    return this.favoritesByUser[uid] || [];
  }

  // --- ApplicationRepository ---
  async getApplicationsByCandidate(candidateId: string): Promise<Application[]> {
    const actor = this.requireActor(this.currentUserId);
    if (actor.role !== 'ADMIN' && (actor.role !== 'CANDIDATE' || actor.id !== candidateId)) {
      throw new Error('Action non autorisée : accès aux candidatures du candidat refusé.');
    }
    return this.applications.filter(a => a.candidateId === candidateId);
  }

  async getApplicationsByEmployer(employerId: string): Promise<Application[]> {
    const actor = this.requireActor(this.currentUserId);
    if (actor.role !== 'ADMIN' && (actor.role !== 'EMPLOYER' || actor.id !== employerId)) {
      throw new Error('Action non autorisée : accès aux candidatures de l’employeur refusé.');
    }
    const ownedOfferIds = new Set(this.offers.filter(o => o.employerId === employerId).map(o => o.id));
    return this.applications.filter(a => ownedOfferIds.has(a.offerId));
  }

  async getApplicationsByOffer(offerId: string): Promise<Application[]> {
    const actor = this.requireActor(this.currentUserId);
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) throw new Error('Offre non trouvée.');
    if (actor.role === 'ADMIN') return this.applications.filter(a => a.offerId === offerId);
    if (actor.role === 'EMPLOYER' && actor.id === offer.employerId) {
      return this.applications.filter(a => a.offerId === offerId);
    }
    if (actor.role === 'CANDIDATE' && this.applications.some(a => a.offerId === offerId && a.candidateId === actor.id)) {
      return this.applications.filter(a => a.offerId === offerId && a.candidateId === actor.id);
    }
    throw new Error('Action non autorisée : candidatures de cette offre non accessibles.');
  }

  async getAllApplications(actorId: string): Promise<Application[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    return this.applications;
  }

  async applyToOffer(offerId: string, actorId: string): Promise<Application> {
    const actor = this.requireOperationalActor(actorId, 'La candidature');
    if (actor.role !== 'CANDIDATE') throw new Error('Action non autorisée : seul un candidat peut postuler.');
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) throw new Error('Offre non trouvée');
    if (offer.status !== 'ACTIVE') throw new Error(`Impossible de postuler à cette offre (statut: ${offer.status}).`);
    const employer = this.users.find(user => user.id === offer.employerId);
    if (employer?.accountStatus === 'BLOCKED') throw new Error('Action refusée : le compte de l’employeur est bloqué.');
    const candidate = actor;
    const existing = this.applications.find(a => a.offerId === offerId && a.candidateId === candidate.id);
    if (existing) {
      if (existing.status === 'WITHDRAWN') {
        existing.status = 'PENDING';
        existing.history.push({ action: 'Candidature réactivée', timestamp: this.nowDateTimeString(), actor: candidate.fullName });
        this.persistAll();
      }
      return existing;
    }
    const newApp: Application = {
      id: this.createId('APP'),
      offerId,
      offerTitle: offer.title || 'Mission qualifiée',
      candidateId: candidate.id,
      candidateName: candidate.fullName,
      candidateHeadline: candidate.headline,
      candidateAvatar: candidate.avatarUrl,
      appliedDate: "Aujourd'hui",
      status: 'PENDING',
      history: [{ action: 'Candidature transmise', timestamp: this.nowDateTimeString(), actor: candidate.fullName }]
    };
    this.applications.unshift(newApp);
    await this.createNotification({
      recipientId: offer.employerId,
      type: 'NEW_APPLICATION',
      title: 'Nouvelle Candidature Reçue',
      message: `${candidate.fullName} (${candidate.headline}) a postulé à votre offre : ${offer.title}.`,
      linkRef: { screen: 'APPLICATIONS', id: newApp.id }
    });
    this.persistAll();
    return newApp;
  }

  async withdrawApplication(applicationId: string, actorId: string): Promise<Application> {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) throw new Error('Candidature non trouvée');
    const actor = this.requireOperationalActor(actorId, 'Le retrait de candidature');
    if (actor.role !== 'CANDIDATE' || app.candidateId !== actorId) throw new Error('Action non autorisée : un candidat ne peut retirer que sa propre candidature.');
    if (app.contractId) throw new Error('Cette candidature ne peut plus être retirée : un contrat lui est déjà associé.');
    if (['REJECTED','HIRED','CONTRACTED','CLOSED_OFFER_FILLED'].includes(app.status)) throw new Error('Cette candidature ne peut plus être retirée.');
    app.status = 'WITHDRAWN';
    app.history.push({
      action: 'Candidature retirée par le candidat',
      timestamp: this.nowDateTimeString(),
      actor: app.candidateName
    });
    this.persistAll();
    return app;
  }

  async examineApplication(applicationId: string, actorId: string): Promise<Application> {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) throw new Error('Candidature non trouvée');
    const actor = this.requireOperationalActor(actorId, 'L’examen de candidature');
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : seul l’employeur peut examiner une candidature.');
    const offer = this.offers.find(o => o.id === app.offerId);
    if (!offer) throw new Error('Offre non trouvée');
    this.assertOwner(actorId, offer.employerId);
    if (app.contractId) throw new Error('Cette candidature est déjà associée à un contrat.');
    if (app.status !== 'PENDING') throw new Error(`Transition de candidature invalide depuis ${app.status}.`);
    app.status = 'REVIEW';
    app.history.push({
      action: 'Dossier passé en examen technique',
      timestamp: this.nowDateTimeString(),
      actor: 'Recruteur'
    });
    this.persistAll();
    return app;
  }

  async shortlistApplication(applicationId: string, actorId: string): Promise<Application> {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) throw new Error('Candidature non trouvée');
    const actor = this.requireOperationalActor(actorId, 'La sélection de candidature');
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : seul l’employeur peut shortlister.');
    const offer = this.offers.find(o => o.id === app.offerId);
    if (!offer) throw new Error('Offre non trouvée');
    this.assertOwner(actorId, offer.employerId);
    if (offer.status !== 'ACTIVE') throw new Error('Cette offre n’accepte plus de sélection.');
    if (app.contractId) throw new Error('Cette candidature est déjà associée à un contrat.');
    if (!['PENDING','REVIEW'].includes(app.status)) throw new Error(`Transition de candidature invalide depuis ${app.status}.`);
    app.status = 'SHORTLISTED';
    app.history.push({
      action: 'Candidat sélectionné (Shortlist)',
      timestamp: this.nowDateTimeString(),
      actor: 'Recruteur'
    });
    await this.createNotification({
      recipientId: app.candidateId,
      type: 'APPLICATION_SHORTLISTED',
      title: 'Candidature Retenue !',
      message: `Votre dossier a été sélectionné pour la mission : ${app.offerTitle}. Une conversation est ouverte.`,
      linkRef: { screen: 'MESSAGES', id: app.id }
    });
    this.persistAll();
    return app;
  }

  async rejectApplication(applicationId: string, note: string | undefined, actorId: string): Promise<Application> {
    const app = this.applications.find(a => a.id === applicationId);
    if (!app) throw new Error('Candidature non trouvée');
    const actor = this.requireOperationalActor(actorId, 'Le refus de candidature');
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : seul l’employeur peut refuser une candidature.');
    const offer = this.offers.find(o => o.id === app.offerId);
    if (!offer) throw new Error('Offre non trouvée');
    this.assertOwner(actorId, offer.employerId);
    if (app.contractId) throw new Error('Cette candidature est déjà associée à un contrat.');
    if (!['PENDING','REVIEW','SHORTLISTED'].includes(app.status)) throw new Error(`Cette candidature ne peut plus être refusée depuis ${app.status}.`);
    app.status = 'REJECTED';
    app.note = note || 'Dossier non retenu pour cette mission.';
    app.history.push({
      action: `Candidature non retenue${note ? ` (${note})` : ''}`,
      timestamp: this.nowDateTimeString(),
      actor: 'Recruteur'
    });
    await this.createNotification({
      recipientId: app.candidateId,
      type: 'APPLICATION_REJECTED',
      title: 'Mise à jour candidature',
      message: `Votre candidature pour "${app.offerTitle}" n'a pas été retenue.`,
      linkRef: { screen: 'DISCOVER' }
    });
    this.persistAll();
    return app;
  }

  // --- ContractRepository ---
  async getAllContracts(actorId: string): Promise<Contract[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    for (const contract of this.contracts) await this.syncPaymentSchedule(contract);
    this.persistAll();
    return this.contracts;
  }

  async getContractById(id: string): Promise<Contract | null> {
    const contract = this.contracts.find(c => c.id === id) || null;
    if (contract) await this.syncPaymentSchedule(contract);
    return contract;
  }

  async getContractsByUser(userId: string, role: UserRole): Promise<Contract[]> {
    const actor = this.requireActor(this.currentUserId);
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      throw new Error('Action non autorisée : accès aux contrats d’un autre utilisateur.');
    }
    if (actor.role !== role) {
      throw new Error('Action non autorisée : rôle de lecture incohérent.');
    }
    const scoped = role === 'ADMIN'
      ? this.contracts
      : role === 'EMPLOYER'
        ? this.contracts.filter(c => c.employerId === userId)
        : this.contracts.filter(c => c.employeeId === userId);
    for (const contract of scoped) await this.syncPaymentSchedule(contract);
    return scoped;
  }

  /**
   * RÈGLES 10, 12, 14, 15, 16, 17, 18 :
   * Création et envoi de contrat sous vérification stricte
   */
  async generateContract(data: {
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
  }, actorId: string): Promise<Contract> {
    // RÈGLE 12 : Aucun fallback offerId || 'OFFER-001'. Un contrat ne doit jamais utiliser un offerId par défaut.
    if (!data.offerId || !data.offerId.trim()) {
      throw new Error("L'identifiant de l'offre (offerId) est obligatoire pour générer un contrat.");
    }

    const offer = this.offers.find(o => o.id === data.offerId);
    if (!offer) throw new Error(`Offre introuvable (${data.offerId}).`);
    const actor = this.requireOperationalActor(actorId, 'La génération de contrat');
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : seul l’employeur peut générer un contrat.');
    this.assertOwner(actorId, offer.employerId);
    if (data.employerId !== actorId) throw new Error('Action non autorisée : employerId ne correspond pas à actorId.');
    if (offer.status !== 'ACTIVE') throw new Error('Impossible de générer un contrat depuis une offre qui n’est plus active.');
    if (!data.applicationId) throw new Error('applicationId est obligatoire pour générer un contrat normal.');
    if (!Number.isInteger(data.durationMonths) || data.durationMonths <= 0) {
      throw new Error('La durée du contrat doit être un nombre entier de mois supérieur à zéro.');
    }
    if (!Number.isFinite(data.monthlySalary) || data.monthlySalary <= 0) {
      throw new Error('Le salaire mensuel doit être un montant positif.');
    }
    parseContractStartDate(data.startDate);
    const app = this.applications.find(a => a.id === data.applicationId);
    if (!app) throw new Error(`Candidature ${data.applicationId} introuvable.`);
    if (app.offerId !== data.offerId || app.candidateId !== data.employeeId) throw new Error("Discordance : la candidature ne correspond pas à l'offre et au candidat sélectionnés.");
    if (app.status !== 'SHORTLISTED') throw new Error('La candidature doit être shortlistée avant génération du contrat.');

    // ANTI-DOUBLON STRICT DE CONTRAT
    const existingActiveContract = this.contracts.find(c => {
      const matchApplication = data.applicationId && c.applicationId === data.applicationId;
      const matchCandidateOffer = c.offerId === data.offerId && c.employeeId === data.employeeId;
      const isTerminal = c.status === 'TERMINATED' || c.status === 'COMPLETED' || c.status === 'REPLACED';
      return (matchApplication || matchCandidateOffer) && !isTerminal;
    });
    if (existingActiveContract) {
      throw new Error(`Une candidature ou mission est déjà associée à un contrat non terminé (${existingActiveContract.id}).`);
    }

    const employerUser = this.users.find(u => u.id === data.employerId);
    const employeeUser = this.users.find(u => u.id === data.employeeId);
    if (!employerUser || employerUser.role !== 'EMPLOYER') throw new Error('Employeur introuvable.');
    if (!employerUser.publicId) throw new Error('Identifiant public employeur manquant.');
    if (!employeeUser || employeeUser.role !== 'CANDIDATE') throw new Error('Candidat introuvable.');
    if (!employeeUser.publicId) throw new Error('Identifiant public candidat manquant.');
    const canonicalEmployerName = employerUser.fullName;
    const canonicalEmployeeName = employeeUser.fullName;

    const timestamp = this.nowDateTimeString();
    const contractId = `CTR-${Date.now().toString().slice(-4)}`;
    const commissionAmount = calculateFirstMonthCommission(data.monthlySalary);
    const employeeShare = calculateFirstMonthEmployeeShare(data.monthlySalary);

    const initialLedgerEntry: CommissionLedgerEntry = {
      contractId,
      monthNumber: 1,
      salaryBase: data.monthlySalary,
      percentage: 25,
      amountDue: commissionAmount,
      amountSubmitted: 0,
      status: 'SCHEDULED',
      createdAt: timestamp,
    };

    // RÈGLE 17 : Le contrat doit être SIGNATURE et non ACTIVE
    const newContract: Contract = {
      id: contractId,
      offerId: data.offerId,
      offerTitle: offer.title,
      applicationId: data.applicationId,
      employerId: data.employerId,
      employerName: canonicalEmployerName,
      employerPublicId: employerUser.publicId,
      employeeId: data.employeeId,
      employeeName: canonicalEmployeeName,
      employeePublicId: employeeUser.publicId,
      monthlySalary: data.monthlySalary,
      currency: 'FCFA',
      startDate: data.startDate,
      currentMonth: 1,
      status: 'SIGNATURE',
      employerSigned: true,
      employerSignedAt: timestamp,
      employeeSigned: false,
      missionDescription: data.missionDescription,
      location: data.location,
      durationMonths: data.durationMonths,
      periodicity: data.periodicity,
      conditions: data.conditions,
      additionalNotes: data.additionalNotes || 'Contrat généré sous mandat déontologique LE LABEUR Bénin.',
      paymentSchedule: buildPaymentSchedule({ contractId, startDate: data.startDate, durationMonths: data.durationMonths, monthlySalary: data.monthlySalary, currency: 'FCFA', createdAt: timestamp }),
      monthlyCheckpoints: [
        {
          monthNumber: 1,
          periodKey: 'Mois 01',
          salaryAmount: data.monthlySalary,
          employeeShareAmount: employeeShare,
          leLabeurShareAmount: commissionAmount,
          currency: 'FCFA',
          isStarted: false,
          isSalaryPaidToEmployee: false,
          employerConfirmed: false,
          employeeConfirmed: false,
          notes: data.additionalNotes || 'En attente de signature bilatérale du salarié'
        }
      ],
      commissionLedger: [initialLedgerEntry],
      commissionPercentage: 25,
      commissionAmountDue: commissionAmount,
      commissionStatus: 'SCHEDULED',
      history: [
        {
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'CONTRACT_GENERATED',
          description: `Contrat généré et signé par l employeur (${canonicalEmployerName}). Rémunération : ${data.monthlySalary.toLocaleString()} FCFA/mois. En attente de signature de ${canonicalEmployeeName}.`,
          actor: canonicalEmployerName
        }
      ]
    };

    newContract.paymentSchedule = buildPaymentSchedule({ contractId: newContract.id, startDate: newContract.startDate, durationMonths: newContract.durationMonths, monthlySalary: newContract.monthlySalary, currency: newContract.currency, createdAt: timestamp });
    this.contracts.unshift(newContract);

    if (data.applicationId) {
      const app = this.applications.find(a => a.id === data.applicationId);
      if (app) app.contractId = contractId;
    }

    // RÈGLE 18 : Insérer automatiquement une carte de contrat dans la conversation
    const conv = await this.createOrGetConversation(data.employerId, {
      id: data.employeeId,
      publicId: employeeUser?.publicId,
      name: canonicalEmployeeName,
      role: 'CANDIDATE',
      avatarUrl: employeeUser?.avatarUrl || ''
    }, {
      contextType: 'CONTRACT',
      contextTitle: data.jobTitle,
      contextRefId: contractId
    });

    const proposal: MissionProposal = {
      id: this.createId('PROP'),
      conversationId: conv.id,
      contractId,
      offerId: data.offerId,
      applicationId: data.applicationId,
      employerId: data.employerId,
      employerName: canonicalEmployerName,
      employeeId: data.employeeId,
      employeeName: canonicalEmployeeName,
      missionTitle: data.jobTitle,
      amount: data.monthlySalary,
      currency: 'FCFA',
      periodicity: (data.periodicity as any) || 'Mensuel',
      startDate: data.startDate,
      durationMonths: data.durationMonths,
      location: data.location,
      conditions: data.conditions,
      status: 'SENT',
      sentAt: timestamp,
      updatedAt: timestamp
    };
    this.proposals.push(proposal);

    if (!this.messages[conv.id]) this.messages[conv.id] = [];
    this.messages[conv.id].push({
      id: this.createId('MSG'),
      conversationId: conv.id,
      senderId: data.employerId,
      senderRole: 'EMPLOYER',
      text: `CONTRAT DE TRAVAIL OFFICIEL : ${offer.title} — ${data.monthlySalary.toLocaleString()} FCFA/mois. En attente de votre signature pour validation bilatérale.`,
      sentAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
      proposal
    });

    conv.lastMessageText = `CONTRAT GÉNÉRÉ : ${offer.title}`;
    conv.lastMessageTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Notification salarié
    await this.createNotification({
      recipientId: data.employeeId,
      type: 'CONTRACT_PENDING_SIGNATURE',
      title: 'Nouveau Contrat de Travail Reçu',
      message: `${canonicalEmployerName} a préparé votre contrat pour "${offer.title}". Veuillez le consulter et signer pour l'activer.`,
      linkRef: { screen: 'CONTRACTS', id: contractId }
    });

    this.persistAll();
    return newContract;
  }

  /**
   * RÈGLES 6, 10, 19, 20, 21 :
   * Signature contractuelle et activation bilatérale
   */
  async signContract(contractId: string, role: 'EMPLOYER' | 'EMPLOYEE', actorId: string): Promise<Contract> {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) throw new Error('Contrat non trouvé');

    if (contract.status !== 'SIGNATURE' && contract.status !== 'DRAFT') {
      throw new Error(`Impossible de signer un contrat en statut ${contract.status}. Statut SIGNATURE attendu.`);
    }

    const actor = this.requireOperationalActor(actorId, 'La signature du contrat');
    if (role !== 'EMPLOYER' && role !== 'EMPLOYEE') throw new Error('Rôle de signature invalide.');
    if (role === 'EMPLOYER') {
      if (actor.role !== 'EMPLOYER' || contract.employerId !== actorId) throw new Error('Action non autorisée : cet employeur ne peut pas signer ce contrat.');
      if (contract.employerSigned) throw new Error('La signature employeur est déjà enregistrée.');
    } else {
      if (actor.role !== 'CANDIDATE' || contract.employeeId !== actorId) throw new Error('Action non autorisée : ce salarié ne peut pas signer ce contrat.');
      if (contract.employeeSigned) throw new Error('La signature salarié est déjà enregistrée.');
    }

    // Validate activation prerequisites before mutating either signature or contract state.
    // This prevents a partially-activated contract if the offer was filled concurrently.
    const activationOffer = this.offers.find(o => o.id === contract.offerId);
    if (!activationOffer) throw new Error('Offre du contrat introuvable.');
    if (activationOffer.status !== 'ACTIVE' && !(contract.employerSigned && contract.employeeSigned)) {
      throw new Error('Impossible de signer : cette offre n’est plus disponible.');
    }
    if (!(contract.employerSigned && contract.employeeSigned)) {
      const competingActive = this.contracts.some(c => c.id !== contract.id && c.offerId === contract.offerId && c.status === 'ACTIVE');
      if (competingActive) throw new Error('Cette offre est déjà pourvue par un autre contrat actif.');
    }

    const timestamp = this.nowDateTimeString();

    if (role === 'EMPLOYER') {
      contract.employerSigned = true;
      contract.employerSignedAt = timestamp;
      contract.history.push({
        id: `LOG-${Date.now()}`,
        timestamp,
        event: 'EMPLOYER_SIGNED',
        description: `Accord paraphé et signé par l'employeur (${contract.employerName}).`,
        actor: contract.employerName
      });
    } else {
      contract.employeeSigned = true;
      contract.employeeSignedAt = timestamp;
      contract.history.push({
        id: `LOG-${Date.now()}`,
        timestamp,
        event: 'EMPLOYEE_SIGNED',
        description: `Accord paraphé et signé par le salarié (${contract.employeeName}).`,
        actor: contract.employeeName
      });
    }

    // RÈGLE 6 & 20 : Le contrat ne devient ACTIVE que lorsque employerSigned === true ET employeeSigned === true
    if (contract.employerSigned && contract.employeeSigned) {
      contract.status = 'ACTIVE';
      contract.history.push({
        id: `LOG-${Date.now()}`,
        timestamp,
        event: 'CONTRACT_ACTIVATED_BILATERAL',
        description: `Double signature bilatérale complétée. Contrat officiel ACTIF avec protection Mois 1.`,
        actor: 'Système LE LABEUR'
      });

      const prop = this.proposals.find(p => p.contractId === contract.id);
      if (prop) {
        prop.status = 'ACCEPTED';
        prop.updatedAt = timestamp;
      }

      // RÈGLE 21 : Quand le contrat devient ACTIVE -> offer.status = 'FILLED'
      const offer = this.offers.find(o => o.id === contract.offerId);
      if (!offer) throw new Error('Offre du contrat introuvable.');
      offer.status = 'FILLED';
      for (const app of this.applications.filter(a => a.offerId === contract.offerId)) {
        if (app.id === contract.applicationId) {
          app.status = 'HIRED';
          app.history.push({ action: 'Candidature retenue — contrat actif', timestamp, actor: 'Système LE LABEUR' });
        } else if (['PENDING','REVIEW','SHORTLISTED'].includes(app.status)) {
          app.status = 'CLOSED_OFFER_FILLED';
          app.history.push({ action: 'Candidature clôturée — offre pourvue', timestamp, actor: 'Système LE LABEUR' });
          await this.createNotification({ recipientId: app.candidateId, type: 'APPLICATION_REJECTED', title: 'Le poste a déjà été pourvu.', message: 'Le poste a déjà été pourvu.', linkRef: { screen: 'DISCOVER', id: offer?.id }, dedupeKey: `${contract.offerId}:${app.id}:FILLED` });
        }
      }
      await this.syncPaymentSchedule(contract);

      await this.createNotification({
        recipientId: contract.employerId,
        type: 'CONTRACT_ACTIVE',
        title: 'Contrat Actif & Poste Pourvu',
        message: `Les deux parties ont signé le contrat ${contract.id}. Le poste est maintenant pourvu et l'offre a été retirée de la recherche publique.`,
        linkRef: { screen: 'CONTRACTS', id: contract.id }
      });

      await this.createNotification({
        recipientId: contract.employeeId,
        type: 'CONTRACT_ACTIVE',
        title: 'Contrat Actif & Validé',
        message: `Votre contrat ${contract.id} pour ${contract.offerTitle} est désormais actif. Votre mission commence.`,
        linkRef: { screen: 'CONTRACTS', id: contract.id }
      });
    }

    this.persistAll();
    return contract;
  }

  async confirmMonthlyAction(
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
  ): Promise<Contract> {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) throw new Error('Contrat non trouvé');

    const actor = this.requireActor(actorId);
    const allowedActions = ['START','PAID','CONFIRM_EMPLOYER','CONFIRM_EMPLOYEE','START_ANSWER_EMPLOYER','START_ANSWER_EMPLOYEE','DECLARE_SALARY','CONFIRM_SALARY_RECEIVED','CONTEST_SALARY_NOT_RECEIVED'];
    this.assertRegularizationActor(actor, ['DECLARE_SALARY', 'CONFIRM_SALARY_RECEIVED', 'CONTEST_SALARY_NOT_RECEIVED'], actionType);
    if (!allowedActions.includes(actionType)) throw new Error('Action mensuelle invalide.');
    const isEmployerAction = ['PAID', 'DECLARE_SALARY', 'START_ANSWER_EMPLOYER', 'CONFIRM_EMPLOYER'].includes(actionType);
    const isEmployeeAction = ['CONFIRM_SALARY_RECEIVED', 'CONTEST_SALARY_NOT_RECEIVED', 'START_ANSWER_EMPLOYEE', 'CONFIRM_EMPLOYEE'].includes(actionType);
    if (isEmployerAction && (actor.role !== 'EMPLOYER' || contract.employerId !== actorId)) throw new Error('Action non autorisée pour cet employeur.');
    if (isEmployeeAction && (actor.role !== 'CANDIDATE' || contract.employeeId !== actorId)) throw new Error('Action non autorisée pour ce salarié.');
    if (!isEmployerAction && !isEmployeeAction && actor.role !== 'ADMIN' && actor.id !== contract.employerId && actor.id !== contract.employeeId) throw new Error('Action non autorisée sur ce contrat.');
    this.ensurePaymentSchedule(contract);
    const entry = contract.paymentSchedule.find(e => e.monthNumber === monthNumber);
    if (!entry) throw new Error(`Échéance M${monthNumber} introuvable pour ce contrat.`);

    let checkpoint = contract.monthlyCheckpoints.find(cp => cp.monthNumber === monthNumber);
    if (!checkpoint) {
      const isM1 = monthNumber === 1;
      const empShare = isM1 ? calculateFirstMonthEmployeeShare(contract.monthlySalary) : calculateLaterMonthEmployeeShare(contract.monthlySalary);
      const leLabeurShare = isM1 ? calculateFirstMonthCommission(contract.monthlySalary) : calculateLaterMonthCommission();
      checkpoint = {
        monthNumber,
        periodKey: `Mois 0${monthNumber}`,
        salaryAmount: contract.monthlySalary,
        employeeShareAmount: empShare,
        leLabeurShareAmount: leLabeurShare,
        currency: contract.currency,
        isStarted: false,
        isSalaryPaidToEmployee: false,
        employerConfirmed: false,
        employeeConfirmed: false
      };
      contract.monthlyCheckpoints.push(checkpoint);
    }

    const timestamp = this.nowDateTimeString();

    if (actionType === 'START' || actionType === 'START_ANSWER_EMPLOYER') {
      const ans = metadata?.answer || 'YES';
      checkpoint.employerStartAnswer = ans;
      if (ans === 'YES' && checkpoint.employeeStartAnswer === 'YES') {
        checkpoint.startConfirmed = true;
        checkpoint.isStarted = true;
        checkpoint.startDivergence = false;
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'MISSION_CONFIRMED',
          description: `Mission confirmée démarrée bilatéralement.`,
          actor: 'Système LE LABEUR'
        });
      } else {
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'EMPLOYER_START_ANSWER',
          description: `Employeur confirme la prise de poste effective (${ans}).`,
          actor: contract.employerName
        });
      }
    } else if (actionType === 'START_ANSWER_EMPLOYEE') {
      const ans = metadata?.answer || 'YES';
      checkpoint.employeeStartAnswer = ans;
      if (ans === 'YES' && checkpoint.employerStartAnswer === 'YES') {
        checkpoint.startConfirmed = true;
        checkpoint.isStarted = true;
        checkpoint.startDivergence = false;
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'MISSION_CONFIRMED',
          description: `Mission confirmée démarrée bilatéralement.`,
          actor: 'Système LE LABEUR'
        });
      } else {
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'EMPLOYEE_START_ANSWER',
          description: `Salarié confirme la prise de poste effective (${ans}).`,
          actor: contract.employeeName
        });
      }
    } else if (actionType === 'PAID' || actionType === 'DECLARE_SALARY') {
      if (!['DUE', 'REJECTED'].includes(entry.salaryStatus) || !isPaymentDue(entry.salaryDueDate)) throw new Error('Le salaire ne peut être déclaré qu’à partir de sa date d’échéance ou après un rejet à régulariser.');
      const expectedShare = entry.employeeShareAmount;
      const netSalary = metadata?.amount ?? expectedShare;
      if (netSalary !== expectedShare) throw new Error(`Montant de salaire incohérent : ${expectedShare} ${contract.currency} attendu.`);
      if (!metadata?.txnId) throw new Error('La transaction de salaire est obligatoire.');
      entry.salaryStatus = 'PENDING_VERIFICATION';
      entry.salaryDeclaredAt = timestamp;
      entry.salaryTransactionId = metadata.txnId;
      entry.salaryProofFileName = metadata.proofFileName;
      checkpoint.salaryDeclaredAt = timestamp;
      checkpoint.salaryTxnId = metadata.txnId;
      checkpoint.salaryProofFileName = metadata.proofFileName;
      checkpoint.isSalaryPaidToEmployee = false;
      await this.createNotification({
        recipientId: contract.employeeId,
        type: 'SALARY_DECLARED',
        title: 'Déclaration de Versement de Salaire',
        message: `Votre employeur a déclaré le versement de votre salaire net (${netSalary.toLocaleString()} FCFA). Veuillez confirmer la bonne réception.`,
        linkRef: { screen: 'CONTRACTS', id: contract.id },
        dedupeKey: `${contract.id}:${monthNumber}:SALARY_DECLARED`
      });
    } else if (actionType === 'CONFIRM_SALARY_RECEIVED') {
      if (entry.salaryStatus !== 'PENDING_VERIFICATION') throw new Error('La réception du salaire ne peut être confirmée qu’après la déclaration de l’employeur.');
      checkpoint.employeeSalaryConfirmation = 'RECEIVED';
      checkpoint.employeeSalaryConfirmedAt = timestamp;
      entry.salaryStatus = 'PAID';
      entry.salaryConfirmedAt = timestamp;
      entry.salaryTransactionId = entry.salaryTransactionId || checkpoint.salaryTxnId;
      contract.history.push({
        id: `LOG-${Date.now()}`,
        timestamp,
        event: 'SALARY_CONFIRMED_BY_EMPLOYEE',
        description: `Réception du salaire confirmée par le salarié.`,
        actor: contract.employeeName
      });

      contract.commissionStatus = entry.commissionStatus;
      contract.commissionAmountDue = entry.commissionAmount;
    } else if (actionType === 'CONTEST_SALARY_NOT_RECEIVED') {
      if (entry.salaryStatus !== 'PENDING_VERIFICATION') throw new Error('Le salaire doit d’abord être déclaré par l’employeur avant toute contestation.');
      checkpoint.employeeSalaryConfirmation = 'NOT_RECEIVED';
      entry.salaryStatus = 'REJECTED';
      contract.history.push({
        id: `LOG-${Date.now()}`,
        timestamp,
        event: 'SALARY_CONTESTED_NOT_RECEIVED',
        description: `Signalement salarié : salaire non reçu sur le compte/numéro indiqué. Dossier transmis à LE LABEUR.`,
        actor: contract.employeeName
      });
      await this.createNotification({
        recipientId: contract.employerId,
        type: 'SALARY_CONTESTED',
        title: 'Salaire contesté par le salarié',
        message: `Le salarié ${contract.employeeName} conteste la réception du salaire ${entry.periodKey} sur le contrat ${contract.id}.`,
        linkRef: { screen: 'CONTRACTS', id: contract.id },
        dedupeKey: `${contract.id}:${monthNumber}:SALARY_CONTESTED:EMPLOYER`
      });
      for (const admin of this.getAdminUsers()) {
        await this.createNotification({
          recipientId: admin.id,
          type: 'SALARY_CONTESTED',
          title: 'Alerte Salaire Non Reçu',
          message: `Le salarié ${contract.employeeName} conteste la réception de son salaire sur le contrat ${contract.id}.`,
          linkRef: { screen: 'ADMIN', id: contract.id },
          dedupeKey: `${contract.id}:${monthNumber}:SALARY_CONTESTED:ADMIN:${admin.id}`
        });
      }
    }

    if (notes) checkpoint.notes = notes;
    this.persistAll();
    return contract;
  }

  async resolveStartDivergence(contractId: string, monthNumber: number, decision: 'CONFIRM' | 'CANCEL', note: string, actorId: string): Promise<Contract> {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) throw new Error('Contrat non trouvé');
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : seul ADMIN peut arbitrer ce conflit.');
    const checkpoint = contract.monthlyCheckpoints.find(cp => cp.monthNumber === monthNumber);
    if (!checkpoint) throw new Error('Mois introuvable');
    const timestamp = this.nowDateTimeString();
    checkpoint.resolvedByAdmin = true;
    checkpoint.divergenceArbitrationNote = note;

    if (decision === 'CONFIRM') {
      checkpoint.startConfirmed = true;
      checkpoint.isStarted = true;
      checkpoint.startDivergence = false;
      checkpoint.employerStartAnswer = 'YES';
      checkpoint.employeeStartAnswer = 'YES';
      contract.status = 'ACTIVE';
    } else {
      checkpoint.startConfirmed = false;
      checkpoint.isStarted = false;
      checkpoint.startDivergence = false;
      contract.status = 'TERMINATED';
      this.freezeFuturePaymentEntries(contract);
    }
    this.persistAll();
    return contract;
  }

  async advanceContractMonth(contractId: string, actorId: string): Promise<Contract> {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) throw new Error('Contrat non trouvé');
    const actor = this.requireOperationalActor(actorId, 'L’avancement du contrat');
    if (actor.role !== 'EMPLOYER' || actor.id !== contract.employerId) throw new Error('Action non autorisée : seul l’employeur du contrat peut avancer le mois.');
    this.ensurePaymentSchedule(contract);
    if (contract.status !== 'ACTIVE') {
      throw new Error(`Impossible d avancer un contrat non actif (statut: ${contract.status}).`);
    }
    if (contract.currentMonth >= contract.durationMonths) {
      throw new Error(`Durée contractuelle maximale atteinte (${contract.durationMonths} mois).`);
    }

    contract.currentMonth += 1;
    const currentEntry = contract.paymentSchedule.find(e => e.monthNumber === contract.currentMonth);
    const previousLedger = contract.commissionLedger.find(l => l.monthNumber === contract.currentMonth);
    const m2Commission = calculateLaterMonthCommission();
    const m2SalaryShare = calculateLaterMonthEmployeeShare(contract.monthlySalary);

    const m2LedgerEntry: CommissionLedgerEntry = {
      contractId: contract.id, monthNumber: contract.currentMonth, salaryBase: contract.monthlySalary, percentage: 0, amountDue: 0, amountSubmitted: 0, status: 'NOT_APPLICABLE', createdAt: this.nowDateTimeString()
    };
    if (!previousLedger) contract.commissionLedger.push(m2LedgerEntry);

    const newCheckpoint: MonthlyFollowupCheckpoint = {
      monthNumber: contract.currentMonth,
      periodKey: `Mois 0${contract.currentMonth}`,
      salaryAmount: contract.monthlySalary,
      employeeShareAmount: m2SalaryShare,
      leLabeurShareAmount: m2Commission,
      currency: contract.currency,
      isStarted: true,
      employerStartAnswer: 'YES',
      employeeStartAnswer: 'YES',
      startConfirmed: true,
      isSalaryPaidToEmployee: false,
      employerConfirmed: false,
      employeeConfirmed: false
    };
    contract.monthlyCheckpoints.push(newCheckpoint);
    const activeEntry = contract.paymentSchedule.find(e => e.monthNumber === contract.currentMonth);
    if (activeEntry) {
      contract.commissionPercentage = 0;
      contract.commissionAmountDue = activeEntry.commissionAmount;
      contract.commissionStatus = activeEntry.commissionStatus;
    }

    contract.history.push({
      id: `LOG-${Date.now()}`,
      timestamp: this.nowDateTimeString(),
      event: 'ADVANCE_MONTH',
      description: `Passage en Mois 0${contract.currentMonth}. Règle : 0% LE LABEUR, 100% employé.`,
      actor: 'Système LE LABEUR'
    });
    this.persistAll();
    return contract;
  }

  /**
   * RÈGLE 8, 9, 10 :
   * M1 — Protection : Pas de rupture directe pendant M1.
   * M2 et plus : Dissociation possible avec actorId + actorRole + motif obligatoire + notification.
   */
  async dissociateMonth2(contractId: string, reason: string, actorId: string, actorRole: UserRole): Promise<Contract> {
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) throw new Error('Contrat non trouvé');

    const actor = this.requireOperationalActor(actorId, 'La dissociation du contrat');
    if (actor.role !== actorRole) {
      throw new Error('Action non autorisée : actorRole ne correspond pas au rôle réel de actorId.');
    }
    if (actorRole !== 'EMPLOYER' && actorRole !== 'CANDIDATE') {
      throw new Error('Action non autorisée : dissociation réservée aux parties du contrat.');
    }

    // RÈGLE 10 : Vérification d'autorisation actorId et ownership
    if (actorRole === 'EMPLOYER' && contract.employerId !== actorId) {
      throw new Error('Action non autorisée : un employeur ne peut modifier que ses propres contrats.');
    }
    if (actorRole === 'CANDIDATE' && contract.employeeId !== actorId) {
      throw new Error('Action non autorisée : un salarié ne peut modifier que ses propres contrats.');
    }

    // RÈGLE 8 : Si contract.currentMonth === 1 : refus d'arrêt direct, incident obligatoire
    if (contract.status !== 'ACTIVE') {
      throw new Error(`Impossible de dissocier un contrat qui n’est pas actif (statut : ${contract.status}).`);
    }
    if (contract.currentMonth < 2) {
      throw new Error('Pendant le premier mois (M1), la protection interdit la rupture directe. Un incident doit obligatoirement être signalé à LE LABEUR.');
    }

    if (!reason || !reason.trim()) {
      throw new Error('Le motif de fin de mission est obligatoire.');
    }

    const actorUser = this.users.find(u => u.id === actorId);
    const actorDisplayName = actorUser?.fullName || (actorRole === 'EMPLOYER' ? contract.employerName : contract.employeeName);

    contract.status = 'TERMINATED';
    this.freezeFuturePaymentEntries(contract);
    contract.history.push({
      id: `LOG-${Date.now()}`,
      timestamp: this.nowDateTimeString(),
      event: 'DISSOCIATION_MONTH_2_PLUS',
      description: `Fin de mission décidée en M${contract.currentMonth} par ${actorDisplayName} (${actorRole}, ID: ${actorId}). Motif : ${reason}`,
      actor: actorDisplayName
    });

    const otherPartyId = actorId === contract.employerId ? contract.employeeId : contract.employerId;
    await this.createNotification({
      recipientId: otherPartyId,
      type: 'CONTRACT_ACTIVE',
      title: 'Fin de Mission Notifiée',
      message: `${actorDisplayName} a mis fin à la mission pour le contrat ${contract.offerTitle}. Motif : ${reason}`,
      linkRef: { screen: 'CONTRACTS', id: contract.id }
    });

    this.persistAll();
    return contract;
  }

  // --- IncidentRepository ---
  async getAllIncidents(actorId: string): Promise<Incident[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    return this.incidents;
  }

  async getIncidentById(id: string, actorId: string): Promise<Incident | null> {
    const actor = this.requireActor(actorId);
    const incident = this.incidents.find(i => i.id === id) || null;
    if (!incident) return null;
    if (actor.role !== 'ADMIN' && actor.id !== incident.employerId && actor.id !== incident.employeeId) {
      throw new Error('Action non autorisée : incident étranger.');
    }
    return incident;
  }

  /**
   * RÈGLES 7, 8, 10 :
   * Signalement de problème / plainte
   */
  async reportIncident(data: Omit<Incident, 'id' | 'createdAt' | 'status' | 'history'>, actorId: string): Promise<Incident> {
    const contract = this.contracts.find(c => c.id === data.contractId);
    if (!contract) throw new Error('Contrat non trouvé');
    if (!['ACTIVE', 'SUSPENDED'].includes(contract.status)) {
      throw new Error(`Un incident ne peut être ouvert que sur un contrat actif ou suspendu (statut actuel : ${contract.status}).`);
    }

    const actor = this.requireOperationalActor(actorId, 'Le signalement d’incident');
    if (data.reportedBy !== 'EMPLOYER' && data.reportedBy !== 'EMPLOYEE') throw new Error('Type de déclarant d’incident invalide.');
    if (data.reportedBy === 'EMPLOYER' && (actor.role !== 'EMPLOYER' || contract.employerId !== actorId)) throw new Error('Action non autorisée : cet employeur ne peut pas déclarer un incident sur ce contrat.');
    if (data.reportedBy === 'EMPLOYEE' && (actor.role !== 'CANDIDATE' || contract.employeeId !== actorId)) throw new Error('Action non autorisée : ce salarié ne peut pas déclarer un incident sur ce contrat.');
    if (data.employerId !== contract.employerId || data.employeeId !== contract.employeeId) {
      throw new Error('Action non autorisée : les parties de l’incident ne correspondent pas au contrat.');
    }

    if (!data.reason || !data.reason.trim()) {
      throw new Error("Le motif de l'incident est obligatoire.");
    }
    if (!data.description || !data.description.trim()) {
      throw new Error("La description de l'incident est obligatoire.");
    }

    const offer = this.offers.find(o => o.id === contract.offerId);
    const canonicalEmployer = this.users.find(u => u.id === contract.employerId);
    const canonicalEmployee = this.users.find(u => u.id === contract.employeeId);
    const canonicalOfferTitle = offer?.title || contract.offerTitle;
    const canonicalEmployerName = canonicalEmployer?.fullName || contract.employerName;
    const canonicalEmployeeName = canonicalEmployee?.fullName || contract.employeeName;
    const createdAt = this.nowDateTimeString();

    const newInc: Incident = {
      ...data,
      employerId: contract.employerId,
      employerName: canonicalEmployerName,
      employeeId: contract.employeeId,
      employeeName: canonicalEmployeeName,
      offerTitle: canonicalOfferTitle,
      id: this.createId('INC'),
      createdAt,
      status: 'OPEN',
      history: [
        {
          action: `Signalement déclaré par ${data.reportedBy === 'EMPLOYER' ? 'Employeur' : 'Salarié'} (${data.reason})`,
          timestamp: createdAt,
          actor: data.reportedBy === 'EMPLOYER' ? canonicalEmployerName : canonicalEmployeeName
        }
      ]
    };
    this.incidents.unshift(newInc);

    contract.status = 'INCIDENT';
    contract.incidentId = newInc.id;
    contract.history.push({
      id: `LOG-${Date.now()}`,
      timestamp: this.nowDateTimeString(),
      event: 'INCIDENT_OPENED',
      description: `Incident ouvert (${newInc.id}) : ${data.reason}. Dossier envoyé à LE LABEUR pour arbitrage.`,
      actor: data.reportedBy === 'EMPLOYER' ? canonicalEmployerName : canonicalEmployeeName
    });

    // Notifier l'autre partie et l'administrateur
    const otherPartyId = data.reportedBy === 'EMPLOYER' ? contract.employeeId : contract.employerId;
    await this.createNotification({
      recipientId: otherPartyId,
      type: 'INCIDENT_REPORTED',
      title: 'Problème Signalé sur le Contrat',
      message: `Un problème a été signalé sur votre mission "${canonicalOfferTitle}". Motif : ${data.reason}. Le dossier est en cours d'examen par LE LABEUR.`,
      linkRef: { screen: 'CONTRACTS', id: contract.id }
    });

    for (const admin of this.getAdminUsers()) {
      await this.createNotification({
        recipientId: admin.id,
        type: 'INCIDENT_REPORTED',
        title: 'Incident Contractuel Signalé',
        message: `Dossier ${newInc.id} ouvert pour ${canonicalOfferTitle}. Motif : ${data.reason}.`,
        linkRef: { screen: 'ADMIN', id: newInc.id },
        dedupeKey: `${newInc.id}:INCIDENT_REPORTED:${admin.id}`
      });
    }

    this.persistAll();
    return newInc;
  }

  async arbitrateIncident(
    incidentId: string,
    decision: 'CONTINUER' | 'ANNULER' | 'REMPLACER' | 'CLÔTURER' | 'SUSPENDRE',
    note: string,
    adminName: string,
    actorId: string
  ): Promise<Incident> {
    const inc = this.incidents.find(i => i.id === incidentId);
    if (!inc) throw new Error('Incident non trouvé');
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    if (!['CONTINUER','ANNULER','REMPLACER','CLÔTURER','SUSPENDRE'].includes(decision)) throw new Error('Décision d’arbitrage invalide.');
    if (!note || !note.trim()) throw new Error('Le motif de la décision administrative est obligatoire.');
    if (!['OPEN', 'UNDER_REVIEW'].includes(inc.status)) {
      throw new Error(`Transition d’incident invalide : le dossier est déjà traité (statut ${inc.status}).`);
    }
    adminName = actor.fullName;
    const timestamp = this.nowDateTimeString();
    inc.adminDecision = decision;
    inc.decisionNote = note;
    inc.decidedAt = timestamp;
    inc.decidedBy = adminName;

    const contract = this.contracts.find(c => c.id === inc.contractId);
    if (decision === 'CONTINUER') {
      inc.status = 'RESOLVED';
      if (contract) {
        contract.status = 'ACTIVE';
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'INCIDENT_DECIDED_CONTINUE',
          description: `Arbitrage rendu : Continuer la mission. Note : ${note}`,
          actor: adminName
        });
      }
    } else if (decision === 'SUSPENDRE') {
      inc.status = 'UNDER_REVIEW';
      if (contract) {
        contract.status = 'SUSPENDED';
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'INCIDENT_DECIDED_SUSPEND',
          description: `Arbitrage rendu : Gel et suspension provisoire du contrat. Note : ${note}`,
          actor: adminName
        });
      }
    } else if (decision === 'CLÔTURER' || decision === 'ANNULER') {
      inc.status = 'CLOSED';
      if (contract) {
        contract.status = 'TERMINATED';
        this.freezeFuturePaymentEntries(contract);
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'INCIDENT_DECIDED_CLOSE',
          description: `Arbitrage rendu : Clôture anticipée et résiliation du contrat. Note : ${note}`,
          actor: adminName
        });
      }
    } else if (decision === 'REMPLACER') {
      inc.status = 'REPLACEMENT_REQUESTED';
      if (contract) {
        contract.status = 'REPLACED';
        this.freezeFuturePaymentEntries(contract);
        contract.history.push({
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'INCIDENT_DECIDED_REPLACE',
          description: `Arbitrage rendu : Remplacement du prestataire en urgence. Note : ${note}`,
          actor: adminName
        });
      }
      await this.createReplacementFromIncident(inc, actorId);
    } else {
      inc.status = 'CLOSED';
    }

    inc.history.push({
      action: `Décision d'arbitrage : ${decision} (${note})`,
      timestamp,
      actor: adminName
    });

    await this.createNotification({
      recipientId: inc.employerId,
      type: 'INCIDENT_DECIDED',
      title: "Décision d'Arbitrage Rendue",
      message: `L'administration a tranché pour l'incident ${inc.id} : ${decision}. Note : ${note}`,
      linkRef: { screen: 'CONTRACTS', id: inc.contractId }
    });

    await this.createNotification({
      recipientId: inc.employeeId,
      type: 'INCIDENT_DECIDED',
      title: "Décision d'Arbitrage Rendue",
      message: `L'administration a tranché pour l'incident ${inc.id} : ${decision}. Note : ${note}`,
      linkRef: { screen: 'CONTRACTS', id: inc.contractId }
    });

    this.persistAll();
    return inc;
  }

  // --- ReplacementRepository ---
  async getAllReplacements(actorId: string): Promise<ReplacementDossier[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    return this.replacements;
  }

  async getReplacementById(id: string, actorId: string): Promise<ReplacementDossier | null> {
    const actor = this.requireActor(actorId);
    const replacement = this.replacements.find(r => r.id === id) || null;
    if (!replacement) return null;
    const candidateId = replacement.selectedCandidateId;
    if (actor.role !== 'ADMIN' && actor.id !== replacement.employerId && actor.id !== candidateId) {
      throw new Error('Action non autorisée : remplacement étranger.');
    }
    return replacement;
  }

  private requireMockReplacementOffer(
    replacement: ReplacementDossier,
  ): asserts replacement is ReplacementDossier & { urgentOfferId: string; urgentOfferTitle: string } {
    if (!replacement.urgentOfferId || !replacement.urgentOfferTitle) {
      throw new Error('L’offre de remplacement n’a pas encore été publiée.');
    }
  }

  async createReplacementFromIncident(incident: Incident, actorId: string): Promise<ReplacementDossier> {
    const timestamp = this.nowDateTimeString();
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : seul ADMIN peut créer un dossier de remplacement.');
    const storedIncident = this.incidents.find(i => i.id === incident.id);
    if (!storedIncident) throw new Error('Incident introuvable dans le registre LE LABEUR.');
    if (storedIncident.contractId !== incident.contractId || storedIncident.employerId !== incident.employerId || storedIncident.employeeId !== incident.employeeId) {
      throw new Error('Action non autorisée : incident incohérent avec son enregistrement.');
    }
    if (storedIncident.status !== 'REPLACEMENT_REQUESTED') {
      throw new Error('Le remplacement ne peut être créé qu’après un arbitrage de remplacement.');
    }
    const originalContract = this.contracts.find(c => c.id === storedIncident.contractId);
    if (!originalContract) throw new Error('Contrat d’origine introuvable pour le remplacement.');
    const remuneration = originalContract.monthlySalary;
    const urgentOffer = await this.createLeLabeurUrgentJob(
      `Remplacement Urgent : ${storedIncident.offerTitle}`,
      storedIncident.employerId,
      storedIncident.employerName,
      remuneration,
      ['Intervention immédiate', "Remplacement d'urgence", 'Artisan qualifié'],
      actorId,
      originalContract.location || 'Chantier Prioritaire Cotonou',
      `Mission de remplacement émise suite à arbitrage d'urgence (${storedIncident.id}). Prise de poste sous mandat LE LABEUR.`,
      originalContract.durationMonths || 3
    );
    const rep: ReplacementDossier = {
      id: this.createId('REP'),
      incidentId: incident.id,
      originalContractId: incident.contractId,
      employerId: incident.employerId,
      employerName: incident.employerName,
      urgentOfferId: urgentOffer.id,
      urgentOfferTitle: urgentOffer.title,
      status: 'SOURCING_CANDIDATES',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.replacements.unshift(rep);
    if (originalContract) {
      originalContract.replacementId = rep.id;
    }
    this.persistAll();
    return rep;
  }

  async assignReplacementCandidate(replacementId: string, candidateId: string, actorId: string): Promise<ReplacementDossier> {
    const rep = this.replacements.find(r => r.id === replacementId);
    if (!rep) throw new Error('Dossier de remplacement introuvable');
    this.requireMockReplacementOffer(rep);
    const actor = this.requireActor(actorId);
    this.assertOperationalActor(actor, 'Le transfert de remplacement');
    if (actor.role !== 'ADMIN' && !(actor.role === 'EMPLOYER' && actor.id === rep.employerId)) {
      throw new Error('Action non autorisée sur ce dossier de remplacement.');
    }
    if (rep.status !== 'SOURCING_CANDIDATES') {
      throw new Error(`Transition invalide : le dossier ${rep.id} n’est pas en sourcing de candidats.`);
    }
    const candidate = this.users.find(u => u.id === candidateId);
    if (!candidate || candidate.role !== 'CANDIDATE') {
      throw new Error('Le remplaçant sélectionné doit être un candidat existant.');
    }
    rep.selectedCandidateId = candidateId;
    rep.selectedCandidateName = candidate.fullName;

    // Le remplacement suit réellement le même chaînage métier qu’un recrutement :
    // mission urgente -> candidature -> sélection -> transfert -> contrat.
    const existingApplication = this.applications.find(
      a => a.offerId === rep.urgentOfferId && a.candidateId === candidateId
    );
    if (existingApplication) {
      existingApplication.status = 'SHORTLISTED';
      existingApplication.history.push({
        action: `Candidature sélectionnée dans le dossier de remplacement ${rep.id}`,
        timestamp: this.nowDateTimeString(),
        actor: actor.fullName
      });
    } else {
      const applicationId = this.createId('APP-REP');
      this.applications.unshift({
        id: applicationId,
        offerId: rep.urgentOfferId,
        offerTitle: rep.urgentOfferTitle,
        candidateId,
        candidateName: candidate.fullName,
        candidateHeadline: candidate.headline,
        candidateAvatar: candidate.avatarUrl,
        appliedDate: "Aujourd'hui",
        status: 'SHORTLISTED',
        history: [{
          action: `Candidature créée et sélectionnée via le dossier de remplacement ${rep.id}`,
          timestamp: this.nowDateTimeString(),
          actor: actor.fullName
        }]
      });
    }

    rep.status = 'CANDIDATE_SELECTED';
    rep.updatedAt = this.nowDateTimeString();
    this.persistAll();
    return rep;
  }

  async transferCandidateToEmployer(replacementId: string, actorId: string): Promise<ReplacementDossier> {
    const rep = this.replacements.find(r => r.id === replacementId);
    if (!rep) throw new Error('Dossier de remplacement introuvable');
    this.requireMockReplacementOffer(rep);
    const actor = this.requireActor(actorId);
    this.assertOperationalActor(actor, 'La finalisation de remplacement');
    if (actor.role !== 'ADMIN' && !(actor.role === 'EMPLOYER' && actor.id === rep.employerId)) {
      throw new Error('Action non autorisée sur ce dossier de remplacement.');
    }
    if (rep.status !== 'CANDIDATE_SELECTED') {
      throw new Error(`Transition invalide : le dossier ${rep.id} doit d’abord avoir un candidat sélectionné.`);
    }
    if (!rep.selectedCandidateId) throw new Error('Aucun candidat sélectionné pour le transfert');
    rep.status = 'TRANSFERRED_TO_EMPLOYER';
    rep.updatedAt = this.nowDateTimeString();
    const transfer: CandidateTransfer = {
      transferId: this.createId('TRF'),
      replacementId: rep.id,
      offerId: rep.urgentOfferId,
      candidateId: rep.selectedCandidateId,
      candidateName: rep.selectedCandidateName || 'Artisan',
      targetEmployerId: rep.employerId,
      targetEmployerName: rep.employerName,
      status: 'TRANSFERRED',
      createdAt: this.nowDateTimeString()
    };
    this.transfers.unshift(transfer);
    this.persistAll();
    return rep;
  }

  async finalizeReplacementContract(replacementId: string, actorId: string): Promise<{ replacement: ReplacementDossier; newContract: Contract }> {
    const rep = this.replacements.find(r => r.id === replacementId);
    if (!rep || !rep.selectedCandidateId) throw new Error('Candidat non sélectionné pour la finalisation');
    this.requireMockReplacementOffer(rep);
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN' && !(actor.role === 'EMPLOYER' && actor.id === rep.employerId)) {
      throw new Error('Action non autorisée sur ce dossier de remplacement.');
    }
    if (rep.status !== 'TRANSFERRED_TO_EMPLOYER') {
      throw new Error(`Transition invalide : le dossier ${rep.id} doit être transféré à l’employeur avant finalisation.`);
    }

    const timestamp = this.nowDateTimeString();
    const newContractId = this.createId('CTR-REP');
    const candidate = this.users.find(u => u.id === rep.selectedCandidateId);
    if (!candidate || candidate.role !== 'CANDIDATE') throw new Error('Candidat de remplacement introuvable ou invalide.');
    if (!candidate.publicId) throw new Error('Identifiant public du candidat de remplacement manquant.');
    const originalContract = this.contracts.find(c => c.id === rep.originalContractId);
    if (!originalContract) throw new Error('Contrat d’origine introuvable pour finaliser le remplacement.');
    const replacementApplication = this.applications.find(
      a => a.offerId === rep.urgentOfferId && a.candidateId === rep.selectedCandidateId
    );
    if (!replacementApplication) {
      throw new Error('Candidature de remplacement introuvable pour finaliser le contrat.');
    }
    if (replacementApplication.status !== 'SHORTLISTED') {
      throw new Error('La candidature de remplacement doit être shortlistée avant finalisation du contrat.');
    }
    const remuneration = originalContract.monthlySalary;
    const commissionAmount = calculateFirstMonthCommission(remuneration);
    const employeeShare = calculateFirstMonthEmployeeShare(remuneration);

    const newContract: Contract = {
      id: newContractId,
      offerId: rep.urgentOfferId,
      offerTitle: rep.urgentOfferTitle,
      applicationId: replacementApplication.id,
      employerId: rep.employerId,
      employerName: rep.employerName,
      employerPublicId: originalContract.employerPublicId,
      employeeId: rep.selectedCandidateId,
      employeeName: candidate.fullName,
      employeePublicId: candidate.publicId,
      monthlySalary: remuneration,
      currency: 'FCFA',
      startDate: new Date().toISOString().slice(0, 10),
      currentMonth: 1,
      status: 'SIGNATURE',
      employerSigned: true,
      employerSignedAt: timestamp,
      employeeSigned: false,
      missionDescription: originalContract?.missionDescription || 'Mission urgente sous mandat LE LABEUR.',
      location: originalContract?.location || 'Chantier Prioritaire Cotonou',
      durationMonths: originalContract?.durationMonths || 3,
      periodicity: originalContract?.periodicity || 'Mensuel',
      conditions: originalContract?.conditions || ['Prise de poste immédiate sous 48h.'],
      additionalNotes: `Contrat issu du remplacement ${rep.id} (suite à incident ${rep.incidentId}).`,
      paymentSchedule: buildPaymentSchedule({ contractId: newContractId, startDate: new Date().toISOString().slice(0, 10), durationMonths: originalContract?.durationMonths || 3, monthlySalary: remuneration, currency: 'FCFA', createdAt: timestamp }),
      monthlyCheckpoints: [
        {
          monthNumber: 1,
          periodKey: 'Mois 01',
          salaryAmount: remuneration,
          employeeShareAmount: employeeShare,
          leLabeurShareAmount: commissionAmount,
          currency: 'FCFA',
          isStarted: false,
          isSalaryPaidToEmployee: false,
          employerConfirmed: false,
          employeeConfirmed: false,
          notes: `Contrat de remplacement en attente de signature de l artisan.`
        }
      ],
      commissionLedger: [
        {
          contractId: newContractId,
          monthNumber: 1,
          salaryBase: remuneration,
          percentage: 25,
          amountDue: commissionAmount,
          amountSubmitted: 0,
          status: 'SCHEDULED',
          createdAt: timestamp
        }
      ],
      commissionPercentage: 25,
      commissionAmountDue: commissionAmount,
      commissionStatus: 'SCHEDULED',
      replacedContractId: rep.originalContractId,
      replacementId: rep.id,
      incidentId: rep.incidentId,
      history: [
        {
          id: `LOG-${Date.now()}`,
          timestamp,
          event: 'REPLACEMENT_CONTRACT_INITIATED',
          description: `Nouveau contrat de remplacement initié suite à défaillance sur ${rep.originalContractId}.`,
          actor: 'Cellule LE LABEUR'
        }
      ]
    };
    newContract.paymentSchedule = buildPaymentSchedule({
      contractId: newContract.id,
      startDate: newContract.startDate,
      durationMonths: newContract.durationMonths,
      monthlySalary: newContract.monthlySalary,
      currency: newContract.currency,
      createdAt: timestamp
    });
    newContract.commissionLedger = newContract.commissionLedger.map(entry => ({ ...entry, contractId: newContract.id }));
    this.contracts.unshift(newContract);
    replacementApplication.contractId = newContract.id;
    rep.newContractId = newContract.id;
    rep.status = 'CONTRACT_FINALIZED';
    rep.updatedAt = timestamp;

    const conv = await this.createOrGetConversation(
      rep.employerId,
      {
        id: candidate.id,
        publicId: candidate.publicId,
        name: candidate.fullName,
        role: 'CANDIDATE',
        avatarUrl: candidate.avatarUrl || ''
      },
      {
        contextType: 'CONTRACT',
        contextTitle: rep.urgentOfferTitle,
        contextRefId: newContract.id
      }
    );
    if (!this.messages[conv.id]) this.messages[conv.id] = [];
    this.messages[conv.id].push({
      id: this.createId('MSG-REP-CONTRACT'),
      conversationId: conv.id,
      senderId: rep.employerId,
      senderRole: 'EMPLOYER',
      text: `CONTRAT DE REMPLACEMENT : ${rep.urgentOfferTitle}. En attente de votre signature pour l’activation.`,
      sentAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      isRead: false
    });
    conv.lastMessageText = `CONTRAT DE REMPLACEMENT : ${rep.urgentOfferTitle}`;
    conv.lastMessageTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    await this.createNotification({
      recipientId: candidate.id,
      type: 'CONTRACT_PENDING_SIGNATURE',
      title: 'Contrat de remplacement reçu',
      message: `Le dossier de remplacement ${rep.id} a généré votre contrat ${newContract.id}. Veuillez le consulter et le signer pour l’activer.`,
      linkRef: { screen: 'CONTRACTS', id: newContract.id },
      dedupeKey: `${newContract.id}:PENDING_SIGNATURE`
    });

    this.persistAll();
    return { replacement: rep, newContract };
  }

  // --- MessageRepository ---
  async getConversations(userId: string): Promise<Conversation[]> {
    if (!userId) return [];
    const actor = this.requireActor(this.currentUserId);
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      throw new Error('Action non autorisée : accès aux conversations d’un autre utilisateur.');
    }
    const user = this.users.find(u => u.id === userId);
    if (user?.role === 'ADMIN') return this.conversations;
    return this.conversations.filter(c => c.participantIds.includes(userId));
  }

  async getMessages(conversationId: string, userId: string): Promise<ChatMessage[]> {
    const actor = this.requireActor(userId);
    const conv = this.conversations.find(c => c.id === conversationId);
    if (!conv) throw new Error('Conversation introuvable.');
    if (actor.role !== 'ADMIN' && !conv.participantIds.includes(userId)) {
      throw new Error('Action non autorisée : accès à la conversation refusé.');
    }
    return this.messages[conversationId] || [];
  }

  async sendMessage(conversationId: string, text: string, actorId: string, senderRole: UserRole, idempotencyKey?: string): Promise<ChatMessage> {
    const actor = this.requireOperationalActor(actorId, 'L’envoi d’un message');
    const retry = this.resolveMockIdempotency<ChatMessage>('sendMessage', actorId, idempotencyKey, { conversationId, text, senderRole });
    if (retry) return retry;
    if (actor.role !== senderRole) throw new Error('Action non autorisée : rôle de l’acteur incohérent.');
    const conv = this.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.participantIds.includes(actorId)) throw new Error('Action non autorisée : conversation introuvable ou acteur non participant.');
    if (!this.messages[conversationId]) this.messages[conversationId] = [];
    const msg: ChatMessage = {
      id: this.createId('MSG'),
      conversationId, senderId: actorId, senderRole, text,
      sentAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), isRead: false
    };
    this.messages[conversationId].push(msg);
    conv.lastMessageText = text; conv.lastMessageTime = msg.sentAt;
    const otherId = conv.participantIds.find(id => id !== actorId);
    if (otherId) conv.unreadCount = (conv.unreadCount || 0) + 1;
    this.persistAll();
    this.rememberMockIdempotency('sendMessage', actorId, idempotencyKey, { conversationId, text, senderRole }, msg);
    return msg;
  }

  async sendAudioMessage(
    conversationId: string, durationSeconds: number, actorId: string, senderRole: UserRole,
    audioDataUrl?: string, waveform?: number[]
  ): Promise<ChatMessage> {
    const actor = this.requireOperationalActor(actorId, 'L’envoi d’un message vocal');
    if (actor.role !== senderRole) throw new Error('Action non autorisée : rôle de l’acteur incohérent.');
    const conv = this.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.participantIds.includes(actorId)) throw new Error('Action non autorisée : conversation introuvable ou acteur non participant.');
    if (durationSeconds <= 0 || durationSeconds > 60) throw new Error('La note vocale doit durer entre 1 et 60 secondes.');
    if (!this.messages[conversationId]) this.messages[conversationId] = [];
    const duration = durationSeconds;
    const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const msg: ChatMessage = {
      id: this.createId('MSG-VOICE'),
      conversationId, senderId: actorId, senderRole, isVoice: true, audioDurationSeconds: duration,
      audioDataUrl: audioDataUrl || '',
      waveform: waveform || [20,45,70,85,60,40,75,90,50,30,65,80,95,60,40,25],
      sentAt: timeStr, isRead: false, status: 'DELIVERED'
    };
    this.messages[conversationId].push(msg); conv.lastMessageText=`Note vocale (${duration}s)`; conv.lastMessageTime=timeStr;
    const receiverId = conv.participantIds.find(id => id !== actorId);
    const receiver = receiverId ? this.users.find(u => u.id === receiverId) : undefined;
    if (receiver) await this.createNotification({ recipientId: receiver.id, type: 'VOICE_MESSAGE', title: 'Nouveau Message Vocal', message: `${actor.fullName} vous a envoyé un message vocal (${duration}s).`, linkRef: { screen: 'CHAT_DETAIL', id: conversationId } });
    this.persistAll(); return msg;
  }

  async markConversationAsRead(conversationId: string, actorId: string): Promise<void> {
    const actor = this.requireOperationalActor(actorId, 'La lecture d’une conversation');
    const conv = this.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.participantIds.includes(actorId)) throw new Error('Action non autorisée : acteur non participant.');
    conv.unreadCount = 0;
    for (const msg of (this.messages[conversationId] || [])) if (msg.senderId !== actorId) { msg.isRead = true; msg.status='READ'; }
    this.persistAll();
  }


  async createOrGetConversation(
    userId: string,
    targetUser: { id: string; publicId?: string; name: string; role: UserRole; avatarUrl: string },
    context: { contextType: 'OFFER' | 'APPLICATION' | 'PROPOSAL' | 'CONTRACT' | 'INCIDENT' | 'REPLACEMENT'; contextTitle: string; contextRefId: string }
  ): Promise<Conversation> {
    const actor = this.requireOperationalActor(userId, 'La création d’une conversation');
    if (!['OFFER','APPLICATION','PROPOSAL','CONTRACT','INCIDENT','REPLACEMENT'].includes(context.contextType)) throw new Error('Contexte de conversation invalide.');
    const target = this.users.find(u => u.id === targetUser.id);
    if (!target) throw new Error('Interlocuteur introuvable.');
    if (targetUser.id === userId) throw new Error('Une conversation doit avoir deux participants distincts.');
    if (targetUser.role !== target.role) throw new Error('Action non autorisée : rôle de l’interlocuteur incohérent.');

    const participantSet = new Set([userId, target.id]);
    const assertPair = (a: string, b: string) => {
      if (participantSet.size !== 2 || !participantSet.has(a) || !participantSet.has(b)) {
        throw new Error('Action non autorisée : les participants ne correspondent pas au contexte métier.');
      }
    };
    switch (context.contextType) {
      case 'OFFER': {
        const offer = this.offers.find(o => o.id === context.contextRefId);
        if (!offer) throw new Error('Offre du contexte introuvable.');
        if (!participantSet.has(offer.employerId)) {
          throw new Error('Action non autorisée : une conversation d’offre doit inclure son employeur.');
        }
        const candidateId = [...participantSet].find(id => id !== offer.employerId);
        const candidate = candidateId ? this.users.find(u => u.id === candidateId) : undefined;
        if (!candidate || candidate.role !== 'CANDIDATE') {
          throw new Error('Action non autorisée : une conversation d’offre doit opposer l’employeur à un candidat.');
        }
        break;
      }
      case 'APPLICATION': {
        const app = this.applications.find(a => a.id === context.contextRefId);
        if (!app) throw new Error('Candidature du contexte introuvable.');
        const offer = this.offers.find(o => o.id === app.offerId);
        if (!offer) throw new Error('Offre de la candidature introuvable.');
        assertPair(app.candidateId, offer.employerId);
        break;
      }
      case 'PROPOSAL': {
        const proposal = this.proposals.find(p => p.id === context.contextRefId);
        if (!proposal) throw new Error('Proposition du contexte introuvable.');
        assertPair(proposal.employeeId, proposal.employerId);
        break;
      }
      case 'CONTRACT': {
        const contract = this.contracts.find(c => c.id === context.contextRefId);
        if (!contract) throw new Error('Contrat du contexte introuvable.');
        assertPair(contract.employeeId, contract.employerId);
        break;
      }
      case 'INCIDENT': {
        const incident = this.incidents.find(i => i.id === context.contextRefId);
        if (!incident) throw new Error('Incident du contexte introuvable.');
        assertPair(incident.employeeId, incident.employerId);
        break;
      }
      case 'REPLACEMENT': {
        const rep = this.replacements.find(r => r.id === context.contextRefId);
        if (!rep || !rep.selectedCandidateId) throw new Error('Remplacement du contexte introuvable ou sans candidat.');
        assertPair(rep.selectedCandidateId, rep.employerId);
        break;
      }
    }

    const existing = this.conversations.find(c =>
      c.participantIds.includes(userId) &&
      c.participantIds.includes(targetUser.id) &&
      c.contextType === context.contextType &&
      c.contextRefId === context.contextRefId
    );
    if (existing) return existing;

    const newConv: Conversation = {
      id: this.createId('CONV'),
      participantIds: [userId, targetUser.id],
      otherParticipant: {
        id: target.id, publicId: target.publicId,
        name: target.fullName, role: target.role, avatarUrl: target.avatarUrl
      },
      contextType: context.contextType, contextTitle: context.contextTitle, contextRefId: context.contextRefId,
      lastMessageText: `Discussion ouverte pour : ${context.contextTitle}`,
      lastMessageTime: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      unreadCount: 0
    };
    this.conversations.unshift(newConv);
    this.messages[newConv.id] = [];
    await this.logEvent({
      actor: actor.fullName, role: actor.role, action: 'CONVERSATION_CREATED', entity: 'Conversation',
      entityId: newConv.id, summary: `Conversation ${context.contextType} créée pour ${context.contextRefId}.`,
      metadata: { contextType: context.contextType, contextRefId: context.contextRefId, participantIds: newConv.participantIds }
    });
    this.persistAll();
    return newConv;
  }

  async sendProposal(
    conversationId: string,
    proposalData: Omit<MissionProposal, 'id' | 'status' | 'sentAt' | 'updatedAt'>,
    actorId: string,
    idempotencyKey?: string
  ): Promise<MissionProposal> {
    const actor = this.requireOperationalActor(actorId, 'La création d’une proposition');
    const retry = this.resolveMockIdempotency<MissionProposal>('sendProposal', actorId, idempotencyKey, { conversationId, proposalData });
    if (retry) return retry;
    if (actor.role !== 'EMPLOYER' || actor.id !== proposalData.employerId) {
      throw new Error('Action non autorisée : seul l’employeur émetteur peut créer la proposition.');
    }
    if (!proposalData.amount || proposalData.amount <= 0) throw new Error('Le montant de la rémunération doit être supérieur à zéro.');
    const conv = this.conversations.find(c => c.id === conversationId);
    if (!conv || !conv.participantIds.includes(actorId) || !conv.participantIds.includes(proposalData.employeeId)) {
      throw new Error('Action non autorisée : conversation ou participant invalide.');
    }
    const employee = this.users.find(u => u.id === proposalData.employeeId);
    if (!employee || employee.role !== 'CANDIDATE') {
      throw new Error('Action non autorisée : une proposition ne peut viser qu’un candidat.');
    }
    if (conv.contextType !== 'OFFER' && conv.contextType !== 'APPLICATION' && conv.contextType !== 'PROPOSAL') {
      throw new Error('Action non autorisée : contexte de conversation incompatible avec une proposition.');
    }
    const offer = this.offers.find(o => o.id === proposalData.offerId);
    if (!offer || offer.employerId !== actorId || offer.status !== 'ACTIVE') throw new Error('Action non autorisée : offre invalide ou non détenue.');

    let linkedApplication: Application | undefined;
    if (proposalData.applicationId) {
      linkedApplication = this.applications.find(a => a.id === proposalData.applicationId);
      if (!linkedApplication || linkedApplication.offerId !== offer.id || linkedApplication.candidateId !== proposalData.employeeId) {
        throw new Error('Action non autorisée : candidature incompatible.');
      }
    }

    if (conv.contextType === 'OFFER') {
      if (conv.contextRefId !== offer.id) throw new Error('Action non autorisée : la proposition ne correspond pas au contexte de l’offre.');
      if (!linkedApplication) throw new Error('Action non autorisée : une proposition d’offre doit être liée à une candidature.');
    } else if (conv.contextType === 'APPLICATION') {
      if (!linkedApplication || conv.contextRefId !== linkedApplication.id) throw new Error('Action non autorisée : la proposition ne correspond pas au contexte de la candidature.');
    } else {
      const sourceProposal = this.proposals.find(p => p.id === conv.contextRefId);
      if (!sourceProposal || sourceProposal.employerId !== actorId || sourceProposal.employeeId !== proposalData.employeeId || sourceProposal.offerId !== offer.id) {
        throw new Error('Action non autorisée : le contexte de proposition ne correspond pas aux parties et à l’offre.');
      }
      if (!linkedApplication || (sourceProposal.applicationId && sourceProposal.applicationId !== linkedApplication.id)) {
        throw new Error('Action non autorisée : la nouvelle proposition ne correspond pas à la candidature d’origine.');
      }
    }
    const timestamp = this.nowDateTimeString();
    const canonicalEmployeeName = employee.fullName;
    const proposal: MissionProposal = {
      ...proposalData,
      employerName: actor.fullName,
      employeeName: canonicalEmployeeName,
      id: this.createId('PROP'),
      status: 'SENT', sentAt: timestamp, updatedAt: timestamp
    };
    this.proposals.push(proposal);
    if (!this.messages[conversationId]) this.messages[conversationId] = [];
    this.messages[conversationId].push({
      id: this.createId('MSG-PROP'), conversationId, senderId: actorId, senderRole: 'EMPLOYER', sentAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), isRead: false, proposal
    });
    conv.lastMessageText = `PROPOSITION DE MISSION : ${proposal.missionTitle}`;
    conv.lastMessageTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    await this.createNotification({ recipientId: proposal.employeeId, type: 'PROPOSAL_RECEIVED', title: 'Nouvelle proposition de mission', message: `${proposal.employerName} vous propose la mission « ${proposal.missionTitle} ».`, linkRef: { screen: 'CHAT_DETAIL', id: conversationId }, dedupeKey: `${proposal.id}:RECEIVED` });
    this.persistAll();
    this.rememberMockIdempotency('sendProposal', actorId, idempotencyKey, { conversationId, proposalData }, proposal);
    return proposal;
  }

  /**
   * RÈGLE 19 :
   * respondToProposal('ACCEPT') ne doit PAS signer automatiquement un contrat si le candidat n'a pas réellement validé le contrat.
   * Le flux doit être :
   * PROPOSITION -> CONTRAT EN SIGNATURE -> CANDIDAT OUVRE -> CANDIDAT VALIDE / SIGNE -> CONTRAT ACTIVE.
   */
  async respondToProposal(proposalId: string, action: 'ACCEPT' | 'REVISE' | 'DECLINE', revisionNotes: string | undefined, actorId: string): Promise<MissionProposal> {
    const prop = this.proposals.find(p => p.id === proposalId);
    if (!prop) throw new Error('Proposition introuvable');

    const actor = this.requireOperationalActor(actorId, 'La réponse à une proposition');
    if (!['ACCEPT','REVISE','DECLINE'].includes(action)) throw new Error('Réponse de proposition invalide.');
    if (actor.role !== 'CANDIDATE' || prop.employeeId !== actorId) {
      throw new Error('Action non autorisée : seul le salarié destinataire peut répondre à cette proposition.');
    }
    const conv = this.conversations.find(c => c.id === prop.conversationId);
    if (!conv || !conv.participantIds.includes(actorId) || !conv.participantIds.includes(prop.employerId)) {
      throw new Error('Action non autorisée : conversation de proposition invalide.');
    }
    if (!['SENT','REVISION_REQUESTED'].includes(prop.status)) throw new Error(`Cette proposition ne peut plus recevoir de réponse (statut: ${prop.status}).`);

    const timestamp = this.nowDateTimeString();
    if (action === 'ACCEPT') {
      prop.status = 'ACCEPTED';
    } else if (action === 'REVISE') {
      prop.status = 'REVISION_REQUESTED';
      if (revisionNotes) prop.revisionNotes = revisionNotes;
    } else {
      prop.status = 'DECLINED';
    }
    prop.updatedAt = timestamp;

    for (const convId in this.messages) {
      const msg = this.messages[convId].find(m => m.proposal?.id === proposalId);
      if (msg && msg.proposal) {
        msg.proposal.status = prop.status;
        if (revisionNotes) msg.proposal.revisionNotes = revisionNotes;
      }
    }

    if (action === 'ACCEPT') {
      // Notifier l'employeur que la proposition a été acceptée et qu'il peut préparer ou que le contrat doit être signé
      await this.createNotification({
        recipientId: prop.employerId,
        type: 'PROPOSAL_ACCEPTED',
        title: 'Proposition Acceptée !',
        message: `${prop.employeeName} a validé votre proposition pour "${prop.missionTitle}". Vous pouvez maintenant préparer ou finaliser le contrat.`,
        linkRef: { screen: 'CHAT_DETAIL', id: prop.conversationId }
      });
    } else if (action === 'REVISE') {
      await this.createNotification({
        recipientId: prop.employerId,
        type: 'PROPOSAL_REVISION_REQUESTED',
        title: "Demande d'Ajustement sur Proposition",
        message: `${prop.employeeName} demande une modification sur : ${prop.missionTitle}${revisionNotes ? ` (${revisionNotes})` : ''}.`,
        linkRef: { screen: 'CHAT_DETAIL', id: prop.conversationId }
      });
    } else {
      await this.createNotification({
        recipientId: prop.employerId,
        type: 'PROPOSAL_DECLINED',
        title: 'Proposition Déclinée',
        message: `${prop.employeeName} a décliné la proposition pour : ${prop.missionTitle}.`,
        linkRef: { screen: 'CHAT_DETAIL', id: prop.conversationId }
      });
    }

    this.persistAll();
    return prop;
  }

  // --- PaymentRepository ---
  async getAllPaymentRecords(actorId: string): Promise<CommissionPaymentRecord[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    return this.payments;
  }

  async getPaymentById(paymentId: string, actorId: string): Promise<CommissionPaymentRecord | null> {
    const actor = this.requireActor(actorId);
    const payment = this.payments.find(p => p.paymentId === paymentId) || null;
    if (!payment) return null;
    const contract = this.contracts.find(c => c.id === payment.contractId);
    if (!contract) throw new Error('Contrat associé au paiement introuvable.');
    if (actor.role !== 'ADMIN' && actor.id !== contract.employerId && actor.id !== contract.employeeId) {
      throw new Error('Action non autorisée : paiement étranger.');
    }
    return payment;
  }

  async getPaymentsByContract(contractId: string, actorId: string): Promise<CommissionPaymentRecord[]> {
    const actor = this.requireActor(actorId);
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) throw new Error('Contrat introuvable.');
    if (actor.role !== 'ADMIN' && actor.id !== contract.employerId && actor.id !== contract.employeeId) {
      throw new Error('Action non autorisée : paiements d’un contrat étranger.');
    }
    return this.payments.filter(p => p.contractId === contractId);
  }

  async declareCommissionPayment(data: {
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
  }): Promise<CommissionPaymentRecord> {
    const contract = this.contracts.find(c => c.id === data.contractId);
    if (!contract) throw new Error('Contrat non trouvé');
    const actor = this.requireActor(data.actorId);
    if (actor.role !== 'EMPLOYER' || contract.employerId !== data.actorId) throw new Error('Action non autorisée : seul l’employeur du contrat peut déclarer la commission.');
    this.ensurePaymentSchedule(contract);
    // Une déclaration de régularisation reste autorisée même après blocage.
    if (actor.accountStatus === 'BLOCKED') {
      const blockedEntry = contract.paymentSchedule.find(e => e.monthNumber === data.monthNumber);
      if (!blockedEntry || blockedEntry.commissionStatus !== 'DUE') {
        throw new Error('COMPTE BLOQUÉ : aucune commission exigible à régulariser pour cette période.');
      }
    }
    const entry = contract.paymentSchedule.find(e => e.monthNumber === data.monthNumber);
    if (!entry) throw new Error('Échéance de commission introuvable.');
    if (entry.commissionAmount <= 0 || entry.commissionStatus === 'NOT_APPLICABLE') throw new Error('Aucune commission n’est due pour cette période.');
    if (!isPaymentDue(entry.commissionDueDate) || entry.commissionStatus !== 'DUE') throw new Error('La commission ne peut être déclarée qu’à partir de sa date d’échéance.');
    if (data.amountPaid !== entry.commissionAmount) throw new Error(`Montant de commission incohérent : ${entry.commissionAmount} ${contract.currency} attendu.`);
    if (!data.transactionId?.trim()) throw new Error('L ID de transaction est obligatoire pour déclarer le paiement.');
    if (!data.proofUri?.trim()) throw new Error('La preuve de paiement est obligatoire.');
    if (!data.senderPhone?.trim()) throw new Error('Le numéro émetteur est obligatoire.');
    if (this.payments.some(p => p.contractId === contract.id && p.monthNumber === data.monthNumber && p.status === 'PENDING_VERIFICATION')) throw new Error('Cette commission est déjà en vérification.');
    const paymentId = `PAY-${Date.now().toString().slice(-5)}-${Math.floor(Math.random()*1000)}`;
    const now = new Date();
    const paymentDate = data.paymentDate || now.toLocaleDateString('fr-FR');
    const paymentTime = data.paymentTime || now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const reference = data.reference || `REF-LABEUR-${Date.now().toString().slice(-5)}`;
    const newPayment: CommissionPaymentRecord = {
      paymentId, contractId: contract.id, offerTitle: contract.offerTitle,
      employerId: contract.employerId, employerName: contract.employerName,
      employeeId: contract.employeeId, employeeName: contract.employeeName,
      monthNumber: data.monthNumber, periodKey: entry.periodKey,
      amountDue: entry.commissionAmount, amountSubmitted: data.amountPaid,
      currency: contract.currency, transactionId: data.transactionId,
      senderPhone: data.senderPhone, reference, paymentDate, paymentTime,
      proofUri: data.proofUri, proofFileName: data.proofFileName || 'recu_paiement.png',
      status: 'PENDING_VERIFICATION', createdAt: `${paymentDate} — ${paymentTime}`, notes: data.notes
    };
    this.payments.unshift(newPayment);
    for (const admin of this.getAdminUsers()) {
      await this.createNotification({
        recipientId: admin.id,
        type: 'COMMISSION_DECLARED',
        title: 'Nouvelle déclaration de commission',
        message: `${contract.employerName} a déclaré ${entry.commissionAmount.toLocaleString()} ${contract.currency} pour ${entry.periodKey}. Dossier ${paymentId} à vérifier.`,
        linkRef: { screen: 'ADMIN', id: paymentId },
        dedupeKey: `${paymentId}:ADMIN:${admin.id}:DECLARED`
      });
    }
    entry.commissionStatus = 'PENDING_VERIFICATION';
    entry.commissionDeclaredAt = `${paymentDate} — ${paymentTime}`;
    entry.commissionTransactionId = data.transactionId;
    entry.commissionProofFileName = data.proofFileName;
    contract.latestPaymentId = paymentId;
    contract.commissionStatus = entry.commissionStatus;
    contract.commissionAmountDue = entry.commissionAmount;
    const ledger = contract.commissionLedger.find(l => l.monthNumber === data.monthNumber);
    if (ledger) { ledger.status = 'PENDING_VERIFICATION'; ledger.amountSubmitted = data.amountPaid; ledger.paymentId = paymentId; }
    this.persistAll();
    return newPayment;
  }

  async verifyCommissionPayment(paymentId: string, actorId: string): Promise<CommissionPaymentRecord> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    const payment = this.payments.find(p => p.paymentId === paymentId);
    if (!payment) throw new Error('Dossier de paiement non trouvé');
    if (payment.status !== 'PENDING_VERIFICATION') throw new Error('Seul un paiement en vérification peut être validé.');
    const timestamp = this.nowDateTimeString();
    payment.status = 'PAID'; payment.verifiedAt = timestamp; payment.verifiedBy = actorId;
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'COMMISSION_PAYMENT_VERIFIED',
      entity: 'CommissionPaymentRecord',
      entityId: payment.paymentId,
      summary: `Paiement ${payment.paymentId} approuvé.`
    });
    const contract = this.contracts.find(c => c.id === payment.contractId);
    if (contract) {
      this.ensurePaymentSchedule(contract);
      const entry = contract.paymentSchedule.find(e => e.monthNumber === payment.monthNumber);
      if (entry) { entry.commissionStatus = 'PAID'; entry.commissionVerifiedAt = timestamp; entry.commissionTransactionId = payment.transactionId; }
      contract.commissionStatus = entry?.commissionStatus || contract.commissionStatus;
      contract.commissionAmountDue = entry?.commissionAmount || 0;
      const ledger = contract.commissionLedger.find(l => l.monthNumber === payment.monthNumber);
      if (ledger) { ledger.status = 'PAID'; ledger.verifiedAt = timestamp; }
      await this.createNotification({
        recipientId: contract.employerId,
        type: 'COMMISSION_VERIFIED',
        title: 'Commission LE LABEUR validée',
        message: `Votre déclaration ${payment.paymentId} pour ${payment.periodKey} a été approuvée par l’administration. L’échéance est maintenant PAID.`,
        linkRef: { screen: 'CONTRACTS', id: contract.id },
        dedupeKey: `${payment.paymentId}:EMPLOYER:VERIFIED`
      });
    }
    this.persistAll(); return payment;
  }

  async rejectCommissionPayment(paymentId: string, reason: string, actorId: string): Promise<CommissionPaymentRecord> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    if (!reason?.trim()) throw new Error('Le motif de rejet est obligatoire pour auditer un dossier de paiement.');
    const payment = this.payments.find(p => p.paymentId === paymentId);
    if (!payment) throw new Error('Dossier de paiement non trouvé');
    if (payment.status !== 'PENDING_VERIFICATION') throw new Error('Seul un paiement en vérification peut être rejeté.');
    const timestamp = this.nowDateTimeString();
    payment.status = 'REJECTED'; payment.rejectionReason = reason; payment.verifiedAt = timestamp; payment.verifiedBy = actorId;
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'COMMISSION_PAYMENT_REJECTED',
      entity: 'CommissionPaymentRecord',
      entityId: payment.paymentId,
      summary: `Paiement ${payment.paymentId} rejeté : ${reason}.`
    });
    const contract = this.contracts.find(c => c.id === payment.contractId);
    if (contract) {
      this.ensurePaymentSchedule(contract);
      const entry = contract.paymentSchedule.find(e => e.monthNumber === payment.monthNumber);
      if (entry) { entry.commissionStatus = 'DUE'; entry.commissionVerifiedAt = timestamp; }
      contract.commissionStatus = entry?.commissionStatus || contract.commissionStatus;
      contract.commissionAmountDue = entry?.commissionAmount || 0;
      const ledger = contract.commissionLedger.find(l => l.monthNumber === payment.monthNumber);
      if (ledger) { ledger.status = 'DUE'; ledger.rejectionReason = reason; }
      await this.createNotification({
        recipientId: contract.employerId,
        type: 'COMMISSION_REJECTED',
        title: 'Commission LE LABEUR à régulariser',
        message: `Votre déclaration ${payment.paymentId} pour ${payment.periodKey} a été rejetée. Motif : ${reason}. L’échéance reste régularisable.`,
        linkRef: { screen: 'CONTRACTS', id: contract.id },
        dedupeKey: `${payment.paymentId}:EMPLOYER:REJECTED`
      });
    }
    this.persistAll(); return payment;
  }

  // --- PaymentRepository — PHASES 4A/4B : déclaration employeur ---
  // Le règlement est effectué hors plateforme ; l'employeur crée un brouillon,
  // peut le modifier puis le soumettre une seule fois. Le contrôle
  // administratif est traité plus bas (PHASE 4D) et reste inaccessible à
  // l'employeur : aucune de ces opérations ne produit APPROVED ni REJECTED.

  private nowIsoString(): string {
    return new Date().toISOString();
  }

  /**
   * Normalise et valide le contenu saisi par l'employeur. Le contrat doit
   * exister et appartenir à l'employeur ; aucun champ requis ne peut être vide.
   */
  private normalizePaymentDeclarationInput(input: Partial<PaymentDeclarationInput>, employerId: string): PaymentDeclarationInput {
    const contractId = String(input.contractId ?? '').trim();
    if (!contractId) throw new Error('Le contrat concerné est obligatoire.');
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) throw new Error('Contrat introuvable.');
    if (contract.employerId !== employerId) throw new Error('Action non autorisée : contrat d’un autre employeur.');

    const amount = input.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Le montant déclaré doit être un nombre supérieur à zéro.');
    }
    if (!Number.isInteger(amount)) throw new Error('Le montant doit être un nombre entier de FCFA.');

    const paymentMethod = input.paymentMethod as ExternalPaymentMethod;
    if (!paymentMethod || !EXTERNAL_PAYMENT_METHODS.includes(paymentMethod)) {
      throw new Error('Moyen de paiement non reconnu.');
    }

    const transactionId = String(input.transactionId ?? '').trim();
    if (!transactionId) throw new Error('L ID de transaction est obligatoire.');

    const reference = String(input.reference ?? '').trim();
    if (!reference) throw new Error('La référence du paiement est obligatoire.');

    const paidAtRaw = String(input.paidAt ?? '').trim();
    const paidAtDate = new Date(paidAtRaw);
    if (!paidAtRaw || Number.isNaN(paidAtDate.getTime())) throw new Error('La date du paiement est invalide.');
    if (paidAtDate.getTime() > Date.now()) throw new Error('La date du paiement ne peut pas être dans le futur.');

    const proofDocumentId = input.proofDocumentId?.trim() || undefined;
    const proofReference = input.proofReference?.trim() || undefined;
    if (!proofDocumentId && !proofReference) throw new Error('Un justificatif est obligatoire : document joint ou référence.');

    return {
      contractId,
      amount,
      paymentMethod,
      transactionId,
      reference,
      paidAt: paidAtDate.toISOString(),
      proofDocumentId,
      proofReference,
      comment: input.comment?.trim() || undefined
    };
  }

  /** Résout une déclaration et vérifie que l'acteur en est bien l'employeur propriétaire. */
  private requireOwnedPaymentDeclaration(paymentId: string, actor: UserProfile): PaymentDeclaration {
    const declaration = this.paymentDeclarations.find(d => d.paymentId === paymentId);
    if (!declaration) throw new Error('Déclaration de paiement introuvable.');
    if (declaration.employerId !== actor.id) throw new Error('Action non autorisée : déclaration de paiement étrangère.');
    return declaration;
  }

  async createPaymentDeclaration(input: PaymentDeclarationInput, actorId: string, idempotencyKey?: string): Promise<PaymentDeclaration> {
    const replay = this.resolveMockIdempotency<PaymentDeclaration>('paymentDeclaration.create', actorId, idempotencyKey, input);
    if (replay) return replay;

    const actor = this.requireActor(actorId);
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : EMPLOYER uniquement.');
    const normalized = this.normalizePaymentDeclarationInput(input, actor.id);
    const contract = this.contracts.find(c => c.id === normalized.contractId);
    if (!contract) throw new Error('Contrat introuvable.');

    const timestamp = this.nowIsoString();
    const declaration: PaymentDeclaration = {
      ...normalized,
      paymentId: this.createId('PDECL'),
      employerId: actor.id,
      currency: contract.currency,
      status: 'DRAFT',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.paymentDeclarations.unshift(declaration);
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'PAYMENT_DECLARATION_CREATED',
      entity: 'PaymentDeclaration',
      entityId: declaration.paymentId,
      summary: `Déclaration de paiement externe ${declaration.paymentId} enregistrée en brouillon (${declaration.amount} ${declaration.currency}).`
    });
    this.persistAll();
    // Les appelants reçoivent toujours un instantané détaché : aucune mutation
    // externe ne peut atteindre l'état du dépôt.
    const snapshot: PaymentDeclaration = { ...declaration };
    this.rememberMockIdempotency('paymentDeclaration.create', actorId, idempotencyKey, input, snapshot);
    return snapshot;
  }

  async getPaymentDeclaration(paymentId: string, actorId: string): Promise<PaymentDeclaration | null> {
    const actor = this.requireActor(actorId);
    const declaration = this.paymentDeclarations.find(d => d.paymentId === paymentId) || null;
    if (!declaration) return null;
    if (declaration.employerId !== actor.id) throw new Error('Action non autorisée : déclaration de paiement étrangère.');
    return { ...declaration };
  }

  async listEmployerPayments(employerId: string, actorId: string): Promise<PaymentDeclaration[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'EMPLOYER' || actor.id !== employerId) {
      throw new Error('Action non autorisée : seul l’employeur peut consulter ses déclarations de paiement.');
    }
    return this.paymentDeclarations
      .filter(declaration => declaration.employerId === employerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(declaration => ({ ...declaration }));
  }

  async updatePaymentDeclaration(paymentId: string, patch: Partial<PaymentDeclarationInput>, actorId: string): Promise<PaymentDeclaration> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : EMPLOYER uniquement.');
    const declaration = this.requireOwnedPaymentDeclaration(paymentId, actor);
    if (declaration.status !== 'DRAFT') {
      throw new Error('Seule une déclaration en brouillon peut être modifiée.');
    }
    const normalized = this.normalizePaymentDeclarationInput({ ...declaration, ...patch }, actor.id);
    const contract = this.contracts.find(c => c.id === normalized.contractId);
    if (!contract) throw new Error('Contrat introuvable.');

    Object.assign(declaration, normalized, { currency: contract.currency, updatedAt: this.nowIsoString() });
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'PAYMENT_DECLARATION_UPDATED',
      entity: 'PaymentDeclaration',
      entityId: declaration.paymentId,
      summary: `Déclaration de paiement externe ${declaration.paymentId} mise à jour (${declaration.amount} ${declaration.currency}).`
    });
    this.persistAll();
    return { ...declaration };
  }

  async submitPaymentDeclaration(paymentId: string, actorId: string): Promise<PaymentDeclaration> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'EMPLOYER') throw new Error('Action non autorisée : EMPLOYER uniquement.');
    const declaration = this.requireOwnedPaymentDeclaration(paymentId, actor);
    if (declaration.status !== 'DRAFT') {
      throw new Error('Seule une déclaration en brouillon peut être soumise.');
    }

    const submittedAt = this.nowIsoString();
    declaration.status = 'SUBMITTED';
    declaration.submittedAt = submittedAt;
    declaration.updatedAt = submittedAt;
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'PAYMENT_DECLARATION_SUBMITTED',
      entity: 'PaymentDeclaration',
      entityId: declaration.paymentId,
      summary: `Déclaration de paiement externe ${declaration.paymentId} soumise par l’employeur.`
    });
    this.persistAll();
    return { ...declaration };
  }

  // --- PaymentRepository — PHASE 4C : consultation ADMIN des paiements soumis ---
  // L'administration ne fait que lire les déclarations que les employeurs ont
  // soumises : aucune décision (UNDER_REVIEW / APPROVED / REJECTED) n'est
  // produite ici et l'état du dépôt n'est jamais modifié.

  /** Résout un acteur et exige le rôle ADMIN (échec fermé pour tous les autres rôles). */
  private requireAdminActor(actorId: string): UserProfile {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    return actor;
  }

  async listSubmittedPaymentDeclarations(actorId: string): Promise<PaymentDeclaration[]> {
    this.requireAdminActor(actorId);
    return sortSubmittedDeclarationsForAdmin(this.paymentDeclarations).map(declaration => ({ ...declaration }));
  }

  async getSubmittedPaymentDeclaration(paymentId: string, actorId: string): Promise<PaymentDeclaration | null> {
    this.requireAdminActor(actorId);
    const declaration = this.paymentDeclarations.find(item => item.paymentId === paymentId) || null;
    if (!declaration) return null;
    if (declaration.status !== 'SUBMITTED') {
      throw new Error('Action non autorisée : seules les déclarations soumises sont consultables par l’administration.');
    }
    return { ...declaration };
  }

  // --- PaymentRepository — PHASE 4D : décision administrative ---
  // SUBMITTED → APPROVED ou SUBMITTED → REJECTED, ADMIN uniquement. La décision
  // n'altère ni le propriétaire des données (employerId), ni les informations
  // déclarées par l'employeur, ni l'historique du dossier : elle ajoute le
  // statut décidé, son auteur, son horodatage et, pour un rejet, son motif.

  /** Résout une déclaration décidable : dossier existant et statut obligatoirement SUBMITTED. */
  private requireReviewablePaymentDeclaration(paymentId: string): PaymentDeclaration {
    const declaration = this.paymentDeclarations.find(item => item.paymentId === paymentId);
    if (!declaration) throw new Error('Déclaration de paiement introuvable.');
    if (declaration.status !== 'SUBMITTED') {
      throw new Error('Action non autorisée : seule une déclaration au statut SUBMITTED peut faire l’objet d’une décision administrative.');
    }
    return declaration;
  }

  async approvePaymentDeclaration(paymentId: string, actorId: string): Promise<PaymentDeclaration> {
    const actor = this.requireAdminActor(actorId);
    const declaration = this.requireReviewablePaymentDeclaration(paymentId);

    const reviewedAt = this.nowIsoString();
    declaration.status = 'APPROVED';
    declaration.reviewedBy = actor.id;
    declaration.reviewedAt = reviewedAt;
    declaration.rejectionReason = undefined;
    declaration.updatedAt = reviewedAt;
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'PAYMENT_DECLARATION_APPROVED',
      entity: 'PaymentDeclaration',
      entityId: declaration.paymentId,
      summary: `Déclaration de paiement externe ${declaration.paymentId} approuvée par l’administration (${declaration.amount} ${declaration.currency}).`
    });
    this.persistAll();
    return { ...declaration };
  }

  async rejectPaymentDeclaration(paymentId: string, actorId: string, rejectionReason: string): Promise<PaymentDeclaration> {
    const actor = this.requireAdminActor(actorId);
    const reason = normalizeRejectionReason(rejectionReason);
    const declaration = this.requireReviewablePaymentDeclaration(paymentId);

    const reviewedAt = this.nowIsoString();
    declaration.status = 'REJECTED';
    declaration.reviewedBy = actor.id;
    declaration.reviewedAt = reviewedAt;
    declaration.rejectionReason = reason;
    declaration.updatedAt = reviewedAt;
    await this.logEvent({
      actor: actor.fullName,
      role: actor.role,
      action: 'PAYMENT_DECLARATION_REJECTED',
      entity: 'PaymentDeclaration',
      entityId: declaration.paymentId,
      summary: `Déclaration de paiement externe ${declaration.paymentId} rejetée par l’administration. Motif : ${reason}${/[.!?]$/.test(reason) ? '' : '.'}`
    });
    this.persistAll();
    return { ...declaration };
  }

  async getRevenueMetrics(actorId: string): Promise<RevenueMetrics> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    for (const contract of this.contracts) this.ensurePaymentSchedule(contract);

    const verifiedPayments = this.payments.filter(p => p.status === 'PAID');
    const pendingPayments = this.payments.filter(p => p.status === 'PENDING_VERIFICATION');
    const rejectedPayments = this.payments.filter(p => p.status === 'REJECTED');
    const scheduleEntries = this.contracts.flatMap(c => c.paymentSchedule.map(entry => ({ contract: c, entry })));

    const totalEncaissed = verifiedPayments.reduce((acc, p) => acc + p.amountSubmitted, 0);
    const totalPendingVerification = pendingPayments.reduce((acc, p) => acc + p.amountSubmitted, 0);
    const totalRejected = rejectedPayments.reduce((acc, p) => acc + p.amountSubmitted, 0);
    const totalDue = scheduleEntries
      .filter(({ entry }) => entry.commissionStatus === 'DUE' && entry.commissionAmount > 0)
      .reduce((acc, { entry }) => acc + entry.commissionAmount, 0);
    const totalGenerated = totalEncaissed + totalPendingVerification + totalDue;

    const byMonthMap: Record<string, number> = {};
    verifiedPayments.forEach(p => {
      byMonthMap[p.periodKey] = (byMonthMap[p.periodKey] || 0) + p.amountSubmitted;
    });
    const byMonth = Object.keys(byMonthMap).map(m => ({ month: m, amount: byMonthMap[m] }));

    const byEmployerMap: Record<string, { employerName: string; amount: number }> = {};
    verifiedPayments.forEach(p => {
      if (!byEmployerMap[p.employerId]) {
        byEmployerMap[p.employerId] = { employerName: p.employerName, amount: 0 };
      }
      byEmployerMap[p.employerId].amount += p.amountSubmitted;
    });
    const byEmployer = Object.keys(byEmployerMap).map(k => ({
      employerId: k,
      employerName: byEmployerMap[k].employerName,
      amount: byEmployerMap[k].amount
    }));

    const currentByContract = this.contracts.map(c => {
      const entry = c.paymentSchedule.find(e => e.monthNumber === c.currentMonth) || c.paymentSchedule[0];
      return {
        contractId: c.id,
        title: c.offerTitle,
        amount: entry?.commissionAmount || 0,
        status: entry?.commissionStatus || c.commissionStatus
      };
    });

    return {
      monthCommission: totalEncaissed,
      totalGenerated,
      totalEncaissed,
      totalPendingVerification,
      totalRejected,
      totalDue,
      activeContractsCount: this.contracts.filter(c => c.status === 'ACTIVE').length,
      firstSalariesCount: this.contracts.filter(c => {
        const entry = c.paymentSchedule.find(e => e.monthNumber === 1);
        return entry?.salaryStatus === 'PAID';
      }).length,
      commissionedContractsCount: new Set(verifiedPayments.map(p => p.contractId)).size,
      byMonth,
      byEmployer,
      byContract: currentByContract
    };
  }

  // --- NotificationRepository ---
  async getNotifications(userId: string, role?: UserRole): Promise<AppNotification[]> {
    if (!userId) return [];
    const actor = this.currentUserId ? this.requireActor(this.currentUserId) : this.requireActor(userId);
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      throw new Error('Action non autorisée : accès aux notifications d’un autre utilisateur.');
    }
    const user = this.users.find(u => u.id === userId);
    if (user?.role === 'ADMIN') return this.notifications;
    return this.notifications.filter(n => {
      if (n.recipientId === userId) return true;
      if (n.recipientId === 'ALL' || n.isBroadcast === true) {
        if (!role || !n.recipientRole || n.recipientRole === role) return true;
      }
      return false;
    });
  }

  async markAsRead(notificationId: string, actorId: string): Promise<void> {
    const actor = this.requireActor(actorId);
    const notif = this.notifications.find(n => n.id === notificationId);
    if (!notif) throw new Error('Notification introuvable.');
    const canRead = notif.recipientId === actor.id || (notif.isBroadcast === true && (!notif.recipientRole || notif.recipientRole === actor.role));
    if (!canRead) throw new Error('Action non autorisée : cette notification ne vous appartient pas.');
    notif.isRead = true;
    this.persistAll();
  }

  async markAllAsRead(userId: string, actorId: string, role?: UserRole): Promise<void> {
    const actor = this.requireActor(actorId);
    if (actor.id !== userId) throw new Error('Action non autorisée : vous ne pouvez marquer comme lues que vos propres notifications.');
    if (role && actor.role !== role) throw new Error('Action non autorisée : rôle de notification incohérent.');
    this.notifications.forEach(n => {
      if (n.recipientId === actor.id || (n.isBroadcast && (!n.recipientRole || n.recipientRole === actor.role))) {
        n.isRead = true;
      }
    });
    this.persistAll();
  }

  async createNotification(data: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>): Promise<AppNotification> {
    if (data.dedupeKey) {
      const existing = this.notifications.find(n => n.recipientId === data.recipientId && n.type === data.type && n.dedupeKey === data.dedupeKey);
      if (existing) return existing;
    }
    const newNotif: AppNotification = {
      ...data,
      id: this.createId('NOTIF'),
      createdAt: this.nowDateTimeString(),
      isRead: false
    };
    this.notifications.unshift(newNotif);
    this.persistAll();
    return newNotif;
  }

  // --- AuditLogRepository ---
  async getAllAuditLogs(actorId: string): Promise<SystemAuditLog[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN') throw new Error('Action non autorisée : ADMIN uniquement.');
    return this.systemLogs;
  }

  async logEvent(logData: Omit<SystemAuditLog, 'id' | 'timestamp'>): Promise<SystemAuditLog> {
    const newLog: SystemAuditLog = {
      ...logData,
      id: this.createId('SYS-LOG'),
      timestamp: this.nowDateTimeString()
    };
    this.systemLogs.unshift(newLog);
    this.persistAll();
    return newLog;
  }

  // --- CallRepository ---
  async initiateCall(
    caller: UserProfile,
    receiver: { id: string; fullName: string; role: UserRole; avatarUrl: string; headline: string },
    conversationId?: string
  ): Promise<CallRecord> {
    const actor = this.requireOperationalActor(caller.id, 'L’appel audio');
    if (actor.role !== caller.role || actor.fullName !== caller.fullName) {
      throw new Error('Action non autorisée : identité de l’appelant incohérente.');
    }
    const target = this.users.find(u => u.id === receiver.id);
    if (!target) throw new Error('Destinataire de l’appel introuvable.');
    if (target.id === actor.id) throw new Error('Un utilisateur ne peut pas s’appeler lui-même.');
    if (target.role !== receiver.role) throw new Error('Action non autorisée : rôle du destinataire incohérent.');
    if (conversationId) {
      const conv = this.conversations.find(c => c.id === conversationId);
      if (!conv || !conv.participantIds.includes(actor.id) || !conv.participantIds.includes(target.id)) {
        throw new Error('Action non autorisée : la conversation de l’appel ne correspond pas aux participants.');
      }
    }
    const callId = this.createId('CALL');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-FR');
    
    const callRecord: CallRecord = {
      id: callId,
      conversationId,
      callerId: caller.id,
      callerName: actor.fullName,
      callerRole: actor.role,
      callerAvatar: actor.avatarUrl,
      callerHeadline: actor.headline,
      receiverId: target.id,
      receiverName: target.fullName,
      receiverRole: target.role,
      receiverAvatar: target.avatarUrl,
      receiverHeadline: target.headline,
      status: 'CALLING',
      direction: 'OUTGOING',
      startedAt: `${dateStr} ${timeStr}`,
      durationSeconds: 0,
      isMuted: false,
      isSpeakerOn: false,
      networkQuality: 'EXCELLENT',
      webrtcSessionId: `webrtc-${callId}`
    };
    this.calls.unshift(callRecord);

    if (conversationId && this.messages[conversationId]) {
      this.messages[conversationId].push({
        id: this.createId('MSG-CALL'),
        conversationId,
        senderId: actor.id,
        senderRole: actor.role,
        sentAt: timeStr,
        isRead: false,
        isCallEvent: true,
        callRecord
      });
      const conv = this.conversations.find(c => c.id === conversationId);
      if (conv) {
        conv.lastMessageText = `Appel audio initié`;
        conv.lastMessageTime = timeStr;
      }
    }

    await this.createNotification({
      recipientId: receiver.id,
      type: 'INCOMING_CALL',
      title: 'Appel Audio LE LABEUR',
      message: `${caller.fullName} vous appelle directement via LE LABEUR.`,
      linkRef: { screen: 'CHAT_DETAIL', id: conversationId }
    });

    this.persistAll();
    return callRecord;
  }

  async acceptCall(callId: string, actorId: string): Promise<CallRecord> {
    const call = this.calls.find(c => c.id === callId);
    if (!call) throw new Error('Appel introuvable');
    const actor = this.requireOperationalActor(actorId, 'L’acceptation de l’appel');
    if (actorId !== call.receiverId) throw new Error('Action non autorisée : seul le destinataire peut accepter cet appel.');
    call.status = 'ACCEPTING';
    this.persistAll();
    return call;
  }

  async rejectCall(callId: string, actorId: string): Promise<CallRecord> {
    const call = this.calls.find(c => c.id === callId);
    if (!call) throw new Error('Appel introuvable');
    const actor = this.requireOperationalActor(actorId, 'La gestion de l’appel');
    if (actorId !== call.receiverId && actorId !== call.callerId) throw new Error('Action non autorisée : acteur extérieur à l’appel.');
    const now = new Date();
    call.status = 'REJECTED';
    call.endedAt = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    this.persistAll();
    return call;
  }

  async endCall(callId: string, durationSeconds: number, actorId: string): Promise<CallRecord> {
    const call = this.calls.find(c => c.id === callId);
    if (!call) throw new Error('Appel introuvable');
    const actor = this.requireOperationalActor(actorId, 'La gestion de l’appel');
    if (actorId !== call.receiverId && actorId !== call.callerId) throw new Error('Action non autorisée : acteur extérieur à l’appel.');
    if (durationSeconds < 0 || durationSeconds > 24 * 60 * 60) throw new Error('Durée d’appel invalide.');
    const now = new Date();
    const finalStatus = durationSeconds > 0 ? 'ENDED' : 'MISSED';
    call.status = finalStatus;
    call.durationSeconds = durationSeconds;
    call.endedAt = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    this.persistAll();
    return call;
  }

  async getCallHistory(userId: string, actorId: string): Promise<CallRecord[]> {
    const actor = this.requireActor(actorId);
    if (actor.role !== 'ADMIN' && actor.id !== userId) {
      throw new Error('Action non autorisée : historique d’appel réservé à son propriétaire.');
    }
    return this.calls.filter(c => c.callerId === userId || c.receiverId === userId);
  }

  // --- CommunicationTrackingRepository ---
  async logCommunicationEvent(eventData: Omit<CommunicationEvent, 'id' | 'timestamp'>): Promise<CommunicationEvent> {
    const event: CommunicationEvent = {
      ...eventData,
      id: this.createId('COM-EVT'),
      timestamp: this.nowDateTimeString()
    };
    this.communicationEvents.unshift(event);
    this.persistAll();
    return event;
  }

  async getCommunicationEvents(filter?: { userId?: string; offerId?: string; contractId?: string }): Promise<CommunicationEvent[]> {
    const actor = this.requireActor(this.currentUserId);
    if (actor.role !== 'ADMIN') {
      if (!filter?.userId || filter.userId !== actor.id) {
        throw new Error('Action non autorisée : les événements de communication doivent être bornés à l’utilisateur courant.');
      }
    }
    return this.communicationEvents.filter(e => {
      if (filter?.userId && e.actorId !== filter.userId && e.recipientId !== filter.userId) return false;
      if (filter?.offerId && e.offerId !== filter.offerId) return false;
      if (filter?.contractId && e.contractId !== filter.contractId) return false;
      return true;
    });
  }

  // --- ResourceRepository ---
  async getResourceDocuments(roleTarget?: 'EMPLOYEE' | 'EMPLOYER' | 'ALL'): Promise<ResourceDocument[]> {
    if (!roleTarget || roleTarget === 'ALL') {
      return this.resources;
    }
    return this.resources.filter(r => r.targetRole === roleTarget || r.targetRole === 'ALL');
  }

  async getResourceDocumentById(id: string): Promise<ResourceDocument | null> {
    return this.resources.find(r => r.id === id) || null;
  }
}

export const mockService = new MockService();
