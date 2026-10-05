import type { Conversation, FilterState, Offer, SystemAuditLog, UserProfile, UserRole } from '../types';
import type { ProductionAuditEvent, PublicProfileProjection } from '../backend/productionContracts';
import { ApiClientError } from './apiClient';
import { ApiRepository, type CreateContractInput, type CreateOfferInput, type CreateProposalInput, type IncidentReportInput, type SelfProfilePatch } from './apiRepository';
import type { AppRepositoryBundle } from './provider';
import { mapServerSessionToProfile } from './sessionMapping';

/**
 * Compatibility adapter for the existing AppContext repository signatures.
 * Actor ID/role arguments are intentionally ignored: the API derives identity
 * from its authenticated session. Any operation not yet backed by a route fails
 * closed instead of falling through to MockService.
 */
export function createLegacyApiRepositoryAdapter(api: ApiRepository): AppRepositoryBundle {
  let sessionUser: UserProfile | null = null;
  const key = () => globalThis.crypto?.randomUUID?.() ?? `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const firstPage = <T>(promise: Promise<{ items: T[] }>): Promise<T[]> => promise.then(page => page.items);
  const legacyPublicProfile = (profile: PublicProfileProjection): UserProfile => ({ ...profile, email: '', phone: '' }) as UserProfile;
  const publicProfiles = (page: Promise<{ items: PublicProfileProjection[] }>): Promise<UserProfile[]> => firstPage(page).then(items => items.map(legacyPublicProfile));
  const notReady = (operation: string): never => {
    throw new ApiClientError(`L’opération ${operation} n’est pas encore exposée par l’API.`, 501, 'NOT_IMPLEMENTED');
  };
  const unsupported = (operation: string) => (..._args: unknown[]) => notReady(operation);

  const omit = <T extends Record<string, unknown>>(value: T, keys: readonly string[]): Record<string, unknown> => {
    const result: Record<string, unknown> = { ...value };
    for (const item of keys) delete result[item];
    return result;
  };

  const safeProfilePatch = (patch: Partial<UserProfile>): SelfProfilePatch => {
    const allowed = new Set([
      'fullName', 'firstName', 'lastName', 'phone', 'headline', 'location', 'departmentId', 'communeId',
      'arrondissementId', 'localityId', 'detailedAddress', 'avatarUrl', 'bio', 'skills', 'experienceYears',
      'desiredContract', 'desiredSalary', 'availability', 'portfolio', 'formations', 'certifications',
      'companyName', 'managerName', 'activity', 'teamSize', 'foundedYear',
    ]);
    return Object.fromEntries(Object.entries(patch).filter(([field]) => allowed.has(field))) as SelfProfilePatch;
  };

  const asLegacyAudit = (event: ProductionAuditEvent): SystemAuditLog => ({
    id: event.id,
    timestamp: event.occurredAt,
    actor: event.actorId,
    role: event.actorRole,
    action: event.action,
    entity: event.entity,
    entityId: event.entityId,
    summary: event.reason ?? event.action,
    metadata: {
      requestId: event.requestId,
      ...(event.beforeState ? { beforeState: event.beforeState } : {}),
      ...(event.afterState ? { afterState: event.afterState } : {}),
    },
  });

  const handlers: Record<string, (...args: any[]) => unknown> = {
    getCurrentUser: () => sessionUser,
    getCurrentSession: async () => {
      try {
        // Autorité serveur : /auth/session puis /me pour l'acteur courant.
        const session = await api.auth.getSession();
        sessionUser = mapServerSessionToProfile(session);
        if (!sessionUser) return null;
        try {
          sessionUser = mapServerSessionToProfile(await api.auth.getMe()) ?? sessionUser;
        } catch (meError) {
          if (meError instanceof ApiClientError && meError.status === 401) {
            sessionUser = null;
            return null;
          }
        }
        return sessionUser;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          sessionUser = null;
          return null;
        }
        throw error;
      }
    },
    authenticateGoogleCredential: async (payload: { credential: string }, requestedRole: UserRole) => {
      if (requestedRole === 'ADMIN') throw new ApiClientError('Le rôle ADMIN ne peut pas être choisi au self-service.', 403, 'FORBIDDEN');
      if (!payload?.credential) throw new ApiClientError('Credential Google manquant.', 400, 'VALIDATION_ERROR');
      sessionUser = mapServerSessionToProfile(await api.auth.exchangeGoogleCredential(payload.credential, requestedRole, 'login'));
      if (!sessionUser) throw new ApiClientError('La session serveur n’a pas pu être établie.', 401, 'UNAUTHENTICATED');
      return sessionUser;
    },
    registerGoogleCredential: async (payload: { credential: string }, requestedRole: UserRole) => {
      if (requestedRole === 'ADMIN') throw new ApiClientError('Le rôle ADMIN ne peut pas être choisi au self-service.', 403, 'FORBIDDEN');
      if (!payload?.credential) throw new ApiClientError('Credential Google manquant.', 400, 'VALIDATION_ERROR');
      sessionUser = mapServerSessionToProfile(await api.auth.exchangeGoogleCredential(payload.credential, requestedRole, 'register'));
      if (!sessionUser) throw new ApiClientError('La session serveur n’a pas pu être établie.', 401, 'UNAUTHENTICATED');
      return sessionUser;
    },
    // Login classique : même principe que Google — la session serveur est la
    // seule autorité. Aucune identité locale n'est fabriquée tant que l'API
    // n'expose pas la route d'échange de credentials email/mot de passe.
    login: unsupported('auth.login/email (session serveur requise)'),
    register: unsupported('auth.register/email (session serveur requise)'),
    findUserByGoogleSub: unsupported('auth.findUserByGoogleSub'),
    loginWithGoogle: unsupported('auth.loginWithGoogle(sub-only)'),
    registerWithGoogle: unsupported('auth.registerWithGoogle(sub-only)'),
    switchRole: async () => { throw new ApiClientError('Le rôle du compte ne peut pas être modifié côté client.', 403, 'FORBIDDEN'); },
    logout: async () => { await api.auth.logout(); sessionUser = null; },

    getAllUsers: async (_actorId: string) => firstPage(api.admin.listUsers({ limit: 100 })),
    getProfile: (userId: string, _actorId: string) => api.users.getProfile(userId),
    getAllCandidates: async () => publicProfiles(api.users.listCandidates({ limit: 100 })),
    getAllEmployers: async () => publicProfiles(api.users.listEmployers({ limit: 100 })),
    searchCandidates: async (query: string, filter?: Partial<FilterState>) => publicProfiles(api.users.listCandidates({ limit: 100 }, { ...filter, searchQuery: query })),
    updateProfile: (_userId: string, patch: Partial<UserProfile>, _actorId: string) => api.users.updateMe(safeProfilePatch(patch)),
    blockUser: (userId: string, reason: string, _actorId: string) => api.admin.blockUser(userId, reason, { idempotencyKey: key() }),
    unblockUser: (userId: string, _actorId: string) => api.admin.unblockUser(userId, { idempotencyKey: key() }),

    getAllOffers: async () => firstPage(api.offers.listPublic({ limit: 100 })),
    getOfferById: (offerId: string) => api.offers.getPublic(offerId),
    searchOffers: async (filter: Parameters<typeof api.offers.listPublic>[1]) => firstPage(api.offers.listPublic({ limit: 100 }, filter)),
    createOffer: (input: Record<string, unknown>, _actorId: string, idempotencyKey?: string) => {
      const safeInput = omit(input, ['id', 'employerId', 'employerName', 'employerPublicId', 'employerLocation', 'employerAvatar', 'postedDate', 'compatibilityScore', 'status', 'isLeLabeurJob', 'leLabeurTag']) as CreateOfferInput;
      return api.offers.create(safeInput, { idempotencyKey: idempotencyKey || key() });
    },
    updateOfferStatus: (offerId: string, status: Offer['status'], _actorId: string) => api.offers.setStatus(offerId, status, { idempotencyKey: key() }),
    getOffersByEmployer: async (_employerId: string) => firstPage(api.offers.getMyOffers({ limit: 100 })),
    createLeLabeurUrgentJob: unsupported('offers.createLeLabeurUrgentJob'),
    toggleFavorite: async (offerId: string, _actorId: string) => (await api.offers.toggleFavorite(offerId, { idempotencyKey: key() })).isFavorite,
    getFavorites: async (_userId?: string) => api.offers.listFavorites(),

    getApplicationsByCandidate: async (_candidateId: string) => firstPage(api.applications.getMine({ limit: 100 })),
    getApplicationsByEmployer: async (_employerId: string) => firstPage(api.applications.getForEmployer({ limit: 100 })),
    getApplicationsByOffer: async (offerId: string) => firstPage(api.applications.getForOffer(offerId, { limit: 100 })),
    getAllApplications: async (_actorId: string) => firstPage(api.admin.listApplications({ limit: 100 })),
    applyToOffer: (offerId: string, _actorId: string) => api.applications.apply(offerId, { idempotencyKey: key() }),
    withdrawApplication: (applicationId: string, _actorId: string) => api.applications.withdraw(applicationId, { idempotencyKey: key() }),
    examineApplication: (applicationId: string, _actorId: string) => api.applications.examine(applicationId, { idempotencyKey: key() }),
    shortlistApplication: (applicationId: string, _actorId: string) => api.applications.shortlist(applicationId, { idempotencyKey: key() }),
    rejectApplication: (applicationId: string, note: string | undefined, _actorId: string) => api.applications.reject(applicationId, note, { idempotencyKey: key() }),

    getAllContracts: async (_actorId: string) => firstPage(api.admin.listContracts({ limit: 100 })),
    getContractById: (contractId: string) => api.contracts.getById(contractId),
    getContractsByUser: async (_userId: string, _role: UserRole) => firstPage(api.contracts.getMine({ limit: 100 })),
    generateContract: (data: Record<string, unknown>, _actorId: string) => {
      const input: CreateContractInput = {
        offerId: String(data.offerId ?? ''),
        applicationId: String(data.applicationId ?? ''),
        startDate: String(data.startDate ?? ''),
        durationMonths: Number(data.durationMonths),
        monthlySalary: Number(data.monthlySalary),
        periodicity: String(data.periodicity ?? ''),
        conditions: Array.isArray(data.conditions) ? data.conditions as string[] : [],
        missionDescription: String(data.missionDescription ?? ''),
        location: String(data.location ?? ''),
        ...(typeof data.additionalNotes === 'string' ? { additionalNotes: data.additionalNotes } : {}),
      };
      return api.contracts.create(input, { idempotencyKey: key() });
    },
    signContract: (contractId: string, _role: 'EMPLOYER' | 'EMPLOYEE', _actorId: string) => api.contracts.sign(contractId, { idempotencyKey: key() }),
    confirmMonthlyAction: (contractId: string, monthNumber: number, actionType: string, _actorId: string, notes?: string, metadata?: Record<string, unknown>) =>
      api.contracts.confirmMonthlyAction(contractId, { monthNumber, actionType, notes, metadata }, { idempotencyKey: key() }),
    resolveStartDivergence: unsupported('contracts.resolveStartDivergence'),
    advanceContractMonth: unsupported('contracts.advanceContractMonth'),
    dissociateMonth2: unsupported('contracts.dissociateMonth2'),

    getAllIncidents: async () => firstPage(api.admin.listIncidents({ limit: 100 })),
    getIncidentById: (incidentId: string, _actorId: string) => api.incidents.getById(incidentId),
    reportIncident: (input: Record<string, unknown>, _actorId: string) => {
      const safeInput: IncidentReportInput = {
        contractId: String(input.contractId ?? ''),
        reason: String(input.reason ?? ''),
        description: String(input.description ?? ''),
        ...(typeof input.evidenceNote === 'string' ? { evidenceNote: input.evidenceNote } : {}),
      };
      return api.incidents.report(safeInput, { idempotencyKey: key() });
    },
    arbitrateIncident: (incidentId: string, decision: string, note: string, _adminName: string, _actorId: string) =>
      api.admin.arbitrateIncident(incidentId, { decision, note }, { idempotencyKey: key() }),

    getAllReplacements: async () => firstPage(api.admin.listReplacements({ limit: 100 })),
    getReplacementById: (replacementId: string, _actorId: string) => api.replacements.getById(replacementId),
    createReplacementFromIncident: unsupported('replacements.createReplacementFromIncident'),
    assignReplacementCandidate: (replacementId: string, candidateId: string, _actorId: string) => api.admin.assignReplacement(replacementId, candidateId, { idempotencyKey: key() }),
    transferCandidateToEmployer: (replacementId: string, _actorId: string) => api.admin.transferReplacement(replacementId, { idempotencyKey: key() }),
    finalizeReplacementContract: (replacementId: string, _actorId: string) => api.admin.finalizeReplacement(replacementId, { idempotencyKey: key() }),

    getConversations: async (_userId: string) => firstPage(api.messages.getMyConversations({ limit: 100 })),
    getMessages: async (conversationId: string, _userId: string) => firstPage(api.messages.getMessages(conversationId, { limit: 100 })),
    sendMessage: (conversationId: string, text: string, _actorId: string, _senderRole: UserRole, idempotencyKey?: string) => api.messages.send(conversationId, text, { idempotencyKey: idempotencyKey || key() }),
    sendAudioMessage: unsupported('messages.sendAudioMessage (R2 upload required)'),
    sendProposal: (conversationId: string, proposal: Record<string, unknown>, _actorId: string, idempotencyKey?: string) => {
      const safeInput = omit(proposal, ['id', 'contractId', 'conversationId', 'employerId', 'employerName', 'employeeId', 'employeeName', 'status', 'sentAt', 'updatedAt']) as CreateProposalInput;
      return api.proposals.create(conversationId, safeInput, { idempotencyKey: idempotencyKey || key() });
    },
    respondToProposal: (proposalId: string, action: 'ACCEPT' | 'REVISE' | 'DECLINE', notes: string | undefined, _actorId: string) => api.proposals.respond(proposalId, action, notes, { idempotencyKey: key() }),
    markConversationAsRead: (conversationId: string, _actorId: string) => api.messages.markRead(conversationId, { idempotencyKey: key() }),
    createOrGetConversation: (userId: string, targetUser: { id: string; name: string; role: UserRole; avatarUrl: string }, context: { contextType: Conversation['contextType']; contextTitle: string; contextRefId: string }) =>
      api.messages.createConversation({ targetUserId: targetUser.id, contextType: context.contextType, contextRefId: context.contextRefId }, { idempotencyKey: key() }),

    getAllPaymentRecords: async () => firstPage(api.admin.listPayments({ limit: 100 })),
    getPaymentById: (paymentId: string, _actorId: string) => api.payments.getById(paymentId),
    getPaymentsByContract: async (contractId: string, _actorId: string) => firstPage(api.payments.getByContract(contractId, { limit: 100 })),
    declareCommissionPayment: (data: Record<string, unknown>) => {
      const proofDocumentId = typeof data.proofDocumentId === 'string' ? data.proofDocumentId : '';
      if (!proofDocumentId) throw new ApiClientError('Un justificatif R2 signé doit être transmis avant la déclaration.', 400, 'VALIDATION_ERROR');
      return api.payments.declareCommission({
        contractId: String(data.contractId ?? ''),
        monthNumber: Number(data.monthNumber),
        senderPhone: String(data.senderPhone ?? ''),
        transactionId: String(data.transactionId ?? ''),
        amountPaid: Number(data.amountPaid),
        proofDocumentId,
        ...(typeof data.reference === 'string' ? { reference: data.reference } : {}),
        ...(typeof data.paymentDate === 'string' ? { paymentDate: data.paymentDate } : {}),
        ...(typeof data.paymentTime === 'string' ? { paymentTime: data.paymentTime } : {}),
        ...(typeof data.notes === 'string' ? { notes: data.notes } : {}),
      }, { idempotencyKey: key() });
    },
    verifyCommissionPayment: (paymentId: string, _actorId: string) => api.admin.approvePayment(paymentId, { idempotencyKey: key() }),
    rejectCommissionPayment: (paymentId: string, reason: string, _actorId: string) => api.admin.rejectPayment(paymentId, reason, { idempotencyKey: key() }),
    getRevenueMetrics: () => api.admin.listStats(),
    submitPaymentDeclaration: unsupported('paymentDeclarations.submit'),

    getNotifications: async (_userId: string, _role?: UserRole) => firstPage(api.notifications.getMine({ limit: 100 })),
    markAsRead: (notificationId: string, _actorId: string) => api.notifications.markRead(notificationId, { idempotencyKey: key() }),
    markAllAsRead: (_userId: string, _actorId: string, _role?: UserRole) => api.notifications.markAllRead({ idempotencyKey: key() }),
    createNotification: unsupported('notifications.create (Outbox only)'),

    getAllAuditLogs: async () => (await firstPage(api.audit.list({ limit: 100 }))).map(asLegacyAudit),
    logEvent: unsupported('audit.logEvent (server transaction only)'),
    logCommunicationEvent: unsupported('communications.logEvent (server-owned)'),
    getCommunicationEvents: async () => firstPage(api.admin.listCommunicationEvents({ limit: 100 })),

    getResourceDocuments: async (roleTarget?: 'EMPLOYEE' | 'EMPLOYER' | 'ALL') => firstPage(api.documents.listPublishedResources({ limit: 100 }, roleTarget)),
    getResourceDocumentById: (documentId: string) => api.documents.getPublishedResource(documentId),

    initiateCall: (_caller: UserProfile, receiver: { id: string }, conversationId?: string) => api.calls.initiate({ receiverId: receiver.id, conversationId }, { idempotencyKey: key() }),
    acceptCall: (callId: string, _actorId: string) => api.calls.accept(callId, { idempotencyKey: key() }),
    rejectCall: (callId: string, _actorId: string) => api.calls.reject(callId, { idempotencyKey: key() }),
    endCall: (callId: string, durationSeconds: number, _actorId: string) => api.calls.end(callId, durationSeconds, { idempotencyKey: key() }),
    getCallHistory: async (_userId: string, _actorId: string) => firstPage(api.calls.getMine({ limit: 100 })),
  };

  return new Proxy(Object.create(null) as AppRepositoryBundle, {
    get(_target, property) {
      const handler = handlers[String(property)];
      if (handler) return handler;
      return unsupported(`repository.${String(property)}`);
    },
  });
}
