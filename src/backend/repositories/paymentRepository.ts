/**
 * LE LABEUR — P0-PAY-1 — repository du CYCLE PAIEMENT (domaine de production).
 *
 * Même chaîne que P0-E1/E3/E4/E5 et P0-F :
 *
 *   autorité de l'acteur : session serveur ONLY (`context.actor`) + compte relu ;
 *   autorité métier      : ligne `payments` relue `FOR UPDATE` ;
 *   autorité de la période et des montants : échéancier du CONTRAT (JSONB) ;
 *   écriture             : transaction unique = mutation + compare-and-set
 *                        + projection + événement d'Outbox + audit + idempotence ;
 *   rollback             : AUCUNE ligne résiduelle (aucun écrit hors transaction).
 *
 * Ce repository n'exécute aucun paiement : aucun appel réseau, aucun fournisseur,
 * aucun débit. `PAID` est un état métier posé par un rapprochement LOCAL
 * déterministe et une décision d'administration, jamais une preuve d'encaissement.
 *
 * Séparation stricte des flux : la nature d'un paiement (`SALARY` /
 * `PLATFORM_FEE`) est lue sur la ligne visée. Un `paymentType` envoyé par le
 * client est un incident (refusé) ; une route de commission ne peut jamais
 * toucher un paiement salarial, ni l'inverse.
 */

import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import type { ContractRecord, ContractStore, ContractHistoryEntry } from '../persistence/coreRecords';
import type { UserStore } from '../identity/stores';
import type {
  AuditLedgerStore,
  DomainEventOutbox,
  DurableIdempotencyStore,
} from '../automation/records';
import type { ContractPaymentProjectionWriter, PaymentDeclarationRecord, PaymentDeclarationStore, PaymentDraft, PaymentRecord, PaymentStoreError, PaymentStore, PaymentTransitionPatch } from '../persistence/paymentRecords';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteKey } from '../api/routeContracts';
import type { ApiRouteContext, ApiRouteHandler } from '../api/worker';
import { newEntityId } from '../identity/ids';
import { createDomainEvent, type DomainEvent } from '../automation/foundation';
import {
  CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS,
  PAYMENT_ADVANCE_MONTH_COMMAND,
  PAYMENT_AUDIT_ACTIONS,
  PAYMENT_CONFIRM_COMMAND,
  PAYMENT_DECLARATION_COMMAND,
  PAYMENT_REJECT_COMMAND,
  PAYMENT_TERMINAL_REFUSAL_REASON,
  PAYMENT_TRANSITION_RULES,
  PAYMENT_VERIFICATION_COMMAND,
  buildPaymentDraftsFromSchedule,
  evaluateMonthlyAdvance,
  evaluatePaymentDeclaration,
  evaluatePaymentTransition,
  isPaymentPeriodDue,
  normalizePaymentDeclarationPayload,
  paymentDeclarationId,
  paymentDeclarationIdempotencyKey,
  paymentDueIdempotencyKey,
  paymentEventId,
  type MonthlyAdvanceEvaluation,
  type MonthlyAdvancePlan,
  type PaymentLifecycleStatus,
  type PaymentProofMetadata,
  type PaymentTransitionOutcome,
  type PaymentTransitionRule,
  type PaymentType,
} from '../../domain/paymentLifecycle';
import {
  createLocalPaymentReconciliationService,
  createLocalPaymentVerificationService,
  type PaymentProviderAdapter,
  type PaymentReconciliationService,
  type PaymentVerificationService,
} from '../payments/paymentVerification';
import type {
  NormalizedPaymentTransaction,
  NormalizedReconciliationResult,
  NormalizedVerificationResult,
  NormalizedWebhookResult,
  ReconciliationVerdict,
} from '../../domain/paymentLifecycle';
import { PaymentLifecycleError, sha256Fingerprint } from '../payments/paymentErrors';
import { createPaymentProviderRegistry, type PaymentProviderRegistry } from '../payments/paymentProviderRegistry';

/** Source déclarée des écritures API du cycle (audits et événements). */
export const PAYMENT_API_SOURCE = 'api:P0-PAY-1';

/** Limite de page par défaut : même valeur que les domaines précédents. */
const DEFAULT_PAGE_LIMIT = 25;

/**
 * Stores nécessaires aux écritures du cycle déclenchées par l'automatisation.
 * C'est un SOUS-ensemble structurel de `PaymentRepositoryStores` : le worker
 * d'automatisation les fournit depuis sa propre transaction PostgreSQL.
 */
export interface PaymentCycleWriterStores {
  payments: PaymentStore;
  declarations: PaymentDeclarationStore;
  contractPayments: ContractPaymentProjectionWriter;
  outbox: DomainEventOutbox;
  audit: AuditLedgerStore;
}

export interface PaymentRepositoryStores {
  payments: PaymentStore;
  declarations: PaymentDeclarationStore;
  contractPayments: ContractPaymentProjectionWriter;
  contracts: ContractStore;
  users: UserStore;
  /** Outbox transactionnelle : commit → mutation + événement, rollback → rien. */
  outbox: DomainEventOutbox;
  audit: AuditLedgerStore;
  /** Idempotence DURABLE existante (`automation_idempotency`) : rien de neuf. */
  idempotency: DurableIdempotencyStore;
}

export interface PaymentRepositoryDependencies {
  stores: PaymentRepositoryStores;
  /** Chaque store lié à la callback est attaché à la MÊME transaction PostgreSQL. */
  runInTransaction?: <T>(operation: (stores: PaymentRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
  verification?: PaymentVerificationService;
  reconciliation?: PaymentReconciliationService;
  providerAdapter?: PaymentProviderAdapter;
  providerAdapters?: Map<string, PaymentProviderAdapter>;
  providerRegistry?: PaymentProviderRegistry;
  getProviderAdapter?: (providerId: string) => PaymentProviderAdapter;
}

export interface PaymentWebhookInput {
  headers: Record<string, string | undefined> | Headers;
  rawBody: string;
  url?: string;
  requestId?: string;
}

export interface PaymentWebhookOutcome {
  accepted: boolean;
  provider: string;
  externalTransactionId: string;
  paymentId?: string;
  status: PaymentLifecycleStatus | 'REJECTED' | 'UNKNOWN';
  action: string;
  replayed?: boolean;
  reasons?: readonly string[];
}

/** Vue API d'un paiement : l'agrégat + ses tentatives, jamais un statut inventé. */
export interface PaymentView {
  paymentId: string;
  contractId: string;
  employerId: string;
  candidateId: string;
  paymentType: PaymentType;
  scheduleEntryId: string;
  monthNumber: number;
  periodKey: string;
  amount: number;
  currency: string;
  scheduledAt: string;
  dueAt: string;
  status: PaymentLifecycleStatus;
  due: boolean;
  declared: boolean;
  verified: boolean;
  paid: boolean;
  rejected: boolean;
  idempotencyKey: string;
  declarationCount: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  submittedBy?: string;
  reference?: string;
  proof?: PaymentProofMetadata;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  externalTransactionId?: string;
  provider?: string;
  currentDeclarationId?: string;
  declarations: PaymentDeclarationRecord[];
  replayed?: boolean;
}

export interface MonthlyAdvanceView {
  contractId: string;
  fromMonth: number;
  toMonth: number;
  periodKey: string;
  paymentsMaterialized: number;
  replayed: boolean;
}

/* ------------------------------------------------------------------ */
/* Cache de rejeu process-local (frontière identique à P0-E1 → P0-F)     */
/* ------------------------------------------------------------------ */

interface PaymentIdempotencyEntry<T> {
  fingerprint: string;
  result?: T;
  pending?: Promise<{ value: T; replayed: boolean }>;
}

class InMemoryPaymentIdempotencyCache {
  private readonly records = new Map<string, PaymentIdempotencyEntry<unknown>>();

  /** `replayed` : la valeur vient du cache, l'opération n'a rien exécuté. */
  execute<T>(
    actorId: string,
    command: string,
    key: string,
    fingerprint: string,
    operation: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }> {
    const cacheKey = `${command}:${actorId}:${key}`;
    const existing = this.records.get(cacheKey) as PaymentIdempotencyEntry<T> | undefined;
    type Hit = { value: T; replayed: boolean };
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject<Hit>(new ApiError(
          'IDEMPOTENCY_CONFLICT',
          'Clé d’idempotence déjà utilisée avec une commande différente.',
          undefined,
          409,
        ));
      }
      // Rejeu reconnu : la valeur mémorisée est rendue, marquée comme rejeu.
      if (existing.result !== undefined) return Promise.resolve({ value: existing.result, replayed: true });
      if (existing.pending) return existing.pending;
    }

    const entry: PaymentIdempotencyEntry<T> = { fingerprint };
    const pending = Promise.resolve().then(operation).then(
      result => {
        entry.result = result;
        entry.pending = undefined;
        return { value: result, replayed: false };
      },
      error => {
        // Un échec n'est JAMAIS un rejeu : la clé est libérée pour l'itém.
        if (this.records.get(cacheKey) === (entry as PaymentIdempotencyEntry<unknown>)) {
          this.records.delete(cacheKey);
        }
        throw error;
      },
    );
    entry.pending = pending;
    this.records.set(cacheKey, entry as PaymentIdempotencyEntry<unknown>);
    return pending;
  }

  clear(): void {
    this.records.clear();
  }
}

export const paymentIdempotencyCache = new InMemoryPaymentIdempotencyCache();

/* ------------------------------------------------------------------ */
/* Aides                                                               */
/* ------------------------------------------------------------------ */

/**
 * Reconnaissance de l'erreur de store sans import d'exécution de la couche
 * persistance (frontière vérifiée par `src/backend/persistence/persistence.test.ts`)
 * : même discipline que `isDuplicateStoreError` du repository CONTRAT.
 */
function isPaymentStoreError(error: unknown): error is PaymentStoreError {
  return !!error
    && typeof error === 'object'
    && (error as { name?: unknown }).name === 'PaymentStoreError'
    && typeof (error as { failure?: unknown }).failure === 'string';
}

function requireTrustedActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) {
    throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  }
  return actor;
}

/** Traduction HTTP : le domaine ne connaît que des codes stables. */
function mapPaymentError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof PaymentLifecycleError) {
    switch (error.code) {
      case 'NOT_FOUND':
        throw new ApiError('NOT_FOUND', error.message);
      case 'FORBIDDEN':
        throw new ApiError('FORBIDDEN', error.message);
      case 'UNAUTHENTICATED':
        throw new ApiError('UNAUTHENTICATED', error.message);
      case 'VALIDATION':
        throw new ApiError('VALIDATION_ERROR', error.message, error.details);
      case 'CONFLICT':
      case 'IN_PROGRESS':
        throw new ApiError('BUSINESS_RULE_VIOLATION', error.message, error.details, 409);
      case 'NOT_IMPLEMENTED':
        throw new ApiError('NOT_IMPLEMENTED', error.message, error.details, 501);
      case 'BUSINESS_RULE':
      default:
        throw new ApiError('BUSINESS_RULE_VIOLATION', error.message, error.details);
    }
  }
  if (isPaymentStoreError(error)) {
    if (error.failure === 'NOT_FOUND') throw new ApiError('NOT_FOUND', error.message);
    if (error.failure === 'DUPLICATE') throw new ApiError('BUSINESS_RULE_VIOLATION', error.message, undefined, 409);
    throw new ApiError('BUSINESS_RULE_VIOLATION', error.message);
  }
  throw new ApiError('INTERNAL_ERROR', 'Le cycle paiement a échoué.');
}

function toView(
  record: PaymentRecord,
  declarations: readonly PaymentDeclarationRecord[],
  evaluatedAt: string,
  replayed = false,
): PaymentView {
  const view: PaymentView = {
    paymentId: record.paymentId,
    contractId: record.contractId,
    employerId: record.employerId,
    candidateId: record.candidateId,
    paymentType: record.paymentType,
    scheduleEntryId: record.scheduleEntryId,
    monthNumber: record.monthNumber,
    periodKey: record.periodKey,
    amount: record.amount,
    currency: record.currency,
    scheduledAt: record.scheduledAt,
    dueAt: record.dueAt,
    status: record.status,
    due: record.status === 'SCHEDULED' ? isPaymentPeriodDue(record.dueAt, evaluatedAt) : true,
    declared: record.submittedAt !== undefined,
    verified: record.status === 'VERIFIED' || record.status === 'PAID',
    paid: record.status === 'PAID',
    rejected: record.status === 'REJECTED',
    idempotencyKey: record.idempotencyKey,
    declarationCount: record.declarationCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    declarations: declarations.map(entry => ({ ...entry })),
  };
  const optional = [
    'submittedAt', 'submittedBy', 'reference', 'proof', 'verifiedAt', 'verifiedBy',
    'rejectedAt', 'rejectedBy', 'rejectionReason', 'externalTransactionId', 'provider',
    'currentDeclarationId',
  ] as const;
  for (const field of optional) {
    const value = record[field];
    if (value !== undefined) {
      Object.assign(view as unknown as Record<string, unknown>, { [field]: value });
    }
  }
  if (replayed) view.replayed = true;
  return view;
}

/** Identifiant d'entrée d'historique : même fabrique que `contractRepository`. */
function newHistoryId(): string {
  return newEntityId('ctr').replace(/^ctr_/, 'log_');
}

function historyEntry(event: string, description: string, actor: string, timestamp: string): ContractHistoryEntry {
  return { id: newHistoryId(), timestamp, event, description, actor };
}

function monthlyAdvanceRefusal(evaluation: MonthlyAdvanceEvaluation): string {
  switch (evaluation.kind) {
    case 'PERIODICITY_RULE_MISSING':
      return `Avancement refusé : ${evaluation.missingRule}`;
    case 'MAX_DURATION_REACHED':
      return `Durée contractuelle maximale atteinte (${evaluation.durationMonths} mois).`;
    case 'MONTH_ENTRY_MISSING':
      return `Aucune entrée d’échéancier pour le mois M${evaluation.monthNumber} : aucune période n’est inventée.`;
    default:
      return 'Avancement refusé.';
  }
}

/* ------------------------------------------------------------------ */
/* Repository                                                          */
/* ------------------------------------------------------------------ */

export interface OpenPaymentRepository {
  declarePayment(
    actor: AuthenticatedActor,
    expectedType: PaymentType,
    payload: unknown,
    command: ProductionCommandContext,
  ): Promise<PaymentView>;
  verifyPayment(actor: AuthenticatedActor, paymentId: string, command: ProductionCommandContext): Promise<PaymentView>;
  confirmPaymentPaid(actor: AuthenticatedActor, paymentId: string, command: ProductionCommandContext): Promise<PaymentView>;
  rejectPayment(
    actor: AuthenticatedActor,
    paymentId: string,
    reason: string,
    command: ProductionCommandContext,
  ): Promise<PaymentView>;
  advanceContractMonth(
    actor: AuthenticatedActor,
    contractId: string,
    command: ProductionCommandContext,
  ): Promise<MonthlyAdvanceView>;
  getMyPayments(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<PaymentView>>;
  getPayment(actor: AuthenticatedActor, paymentId: string): Promise<PaymentView | null>;
  getContractPayments(actor: AuthenticatedActor, contractId: string, page: PageRequest): Promise<CursorPage<PaymentView>>;
  getAdminPayments(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<PaymentView>>;
  /**
   * P0-PAY-2 — Traitement sécurisé et idempotent d'un webhook fournisseur.
   * Valide signature, timestamp anti-replay, payload, idempotence, absence
   * de collision de transaction, applique les transitions et l'audit.
   */
  processPaymentWebhook(input: PaymentWebhookInput): Promise<PaymentWebhookOutcome>;
  /**
   * P0-PAY-2 — Rapprochement explicite LE LABEUR vs source externe.
   * Compare provider, externalTransactionId, reference, amount, currency,
   * payer, recipient, date, et consigne la trace d'audit.
   */
  reconcilePayment(
    actor: AuthenticatedActor,
    paymentId: string,
    asOf?: string,
  ): Promise<NormalizedReconciliationResult>;
  /**
   * Écriture déclenchée par l'automatisation (aucune route ne l'expose) :
   * `SCHEDULED → DUE`. `writer` permet d'exécuter la transition dans la
   * transaction DÉJÀ ouverte du worker ; absent, le repository ouvre la sienne.
   */
  markPaymentDue(
    paymentId: string,
    context: { deadlineId?: string; jobId?: string; eventId?: string },
    writer?: PaymentCycleWriterStores,
  ): Promise<'applied' | 'duplicate'>;
  /** Balayage borné des paiements échus (ÉTAPE 23) — index partiel, jamais un scan. */
  sweepDuePayments(
    writer: PaymentCycleWriterStores,
    limit: number,
  ): Promise<{ scanned: number; applied: number; duplicates: number; paymentIds: string[] }>;
  materializePaymentsForContract(contractId: string): Promise<number>;
}

export function createPaymentRepository(
  dependencies: PaymentRepositoryDependencies,
): OpenPaymentRepository {
  const { stores, runInTransaction } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const verification = dependencies.verification ?? createLocalPaymentVerificationService();
  const reconciliation = dependencies.reconciliation ?? createLocalPaymentReconciliationService();

  const configuredAdapters = new Map<string, PaymentProviderAdapter>();
  for (const adapter of dependencies.providerAdapters?.values() ?? []) {
    configuredAdapters.set(adapter.providerId.trim().toUpperCase(), adapter);
  }
  if (dependencies.providerAdapter) {
    configuredAdapters.set(dependencies.providerAdapter.providerId.trim().toUpperCase(), dependencies.providerAdapter);
  }
  const providerRegistry = dependencies.providerRegistry
    ?? createPaymentProviderRegistry([...configuredAdapters.values()]);
  const getAdapter = (providerId: string): PaymentProviderAdapter =>
    dependencies.getProviderAdapter?.(providerId) ?? providerRegistry.resolve(providerId);

  const inTransaction = <T>(operation: (current: PaymentRepositoryStores) => Promise<T>): Promise<T> =>
    runInTransaction ? runInTransaction(operation) : operation(stores);

  const readView = async (
    current: PaymentRepositoryStores,
    paymentId: string,
    evaluatedAt: string,
    replayed = false,
  ): Promise<PaymentView> => {
    const record = await current.payments.findById(paymentId);
    if (!record) throw new ApiError('NOT_FOUND', 'Paiement introuvable.');
    const declarations = await current.declarations.listByPayment(paymentId);
    return toView(record, declarations, evaluatedAt, replayed);
  };

  /** Réservations durables : même table, mêmes codes que l'automatisation. */
  const reserve = async (
    current: PaymentRepositoryStores,
    input: { actorId: string; command: string; key: string; payload: string },
  ): Promise<'reserved' | 'replay'> => {
    const outcome = await current.idempotency.reserve({
      actorId: input.actorId,
      command: input.command,
      key: input.key,
      payloadHash: await sha256Fingerprint(input.payload),
    });
    if (outcome.kind === 'conflict') {
      throw new ApiError('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée avec une charge utile différente.', undefined, 409);
    }
    if (outcome.kind === 'in-progress') {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        'Une commande concurrente traite déjà ce paiement : rejouez la requête.',
        undefined,
        409,
      );
    }
    return outcome.kind === 'replay' ? 'replay' : 'reserved';
  };

  /**
   * Garde d'accès commune : compte actif, ligne verrouillée, contrat autorité,
   * et acteur de la règle de transition (ÉTAPE 21 : RBAC par nature de paiement).
   */
  const lockPaymentFor = async (
    current: PaymentRepositoryStores,
    actor: AuthenticatedActor,
    paymentId: string,
    rule: PaymentTransitionRule,
  ): Promise<{ payment: PaymentRecord; contract: ContractRecord }> => {
    const account = await current.users.findByIdForShare(actor.id);
    if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
    if (account.role !== actor.role) {
      throw new ApiError('FORBIDDEN', 'Action non autorisée : le rôle du compte ne permet pas cette opération.');
    }
    if (account.status !== 'ACTIVE') {
      throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : cette opération sur paiement est indisponible.');
    }

    const payment = await current.payments.findByIdForUpdate(paymentId);
    if (!payment) throw new ApiError('NOT_FOUND', 'Paiement introuvable.');

    // Autorité : la ligne `contracts`. Un paiement n'existe que par son contrat,
    // et c'est le contrat qui résout le propriétaire — jamais un champ client.
    const contract = await current.contracts.findByIdForUpdate(payment.contractId);
    if (!contract) throw new ApiError('NOT_FOUND', 'Contrat du paiement introuvable.');

    if (rule.actor === 'EMPLOYER') {
      if (actor.role !== 'EMPLOYER' || contract.employerId !== actor.id || payment.employerId !== actor.id) {
        throw new ApiError(
          'FORBIDDEN',
          'Action non autorisée : seul l’employeur du contrat peut déclarer ce paiement.',
        );
      }
    } else if (rule.actor === 'ADMIN') {
      if (actor.role !== 'ADMIN') {
        throw new ApiError(
          'FORBIDDEN',
          'Action non autorisée : la vérification et la décision appartiennent à l’administration.',
        );
      }
      const requiredPermission = rule.action === 'REJECT_DECLARATION' ? 'payments:reject' : 'payments:approve';
      if (!actor.permissions.includes(requiredPermission)) {
        throw new ApiError('FORBIDDEN', `Permission ${requiredPermission} requise.`);
      }
    } else {
      throw new ApiError(
        'FORBIDDEN',
        'Cette transition est produite par l’automatisation ou le service, jamais par une requête client.',
      );
    }

    if (contract.status !== 'ACTIVE') {
      throw new ApiError(
        'BUSINESS_RULE_VIOLATION',
        `Le cycle paiement ne progresse que sur un contrat actif (statut : ${contract.status}).`,
        undefined,
        409,
      );
    }

    return { payment, contract };
  };

  const appendAudit = async (
    current: PaymentCycleWriterStores,
    input: {
      action: string;
      actorId: string;
      paymentId: string;
      contractId: string;
      paymentType: PaymentType;
      periodKey: string;
      timestamp: string;
      beforeState: Record<string, unknown>;
      afterState: Record<string, unknown>;
      eventId?: string;
      jobId?: string;
      reference?: string;
      error?: string;
      source?: string;
    },
  ): Promise<void> => {
    // `entityId = paymentId` : l'audit du paiement reste distinct de celui du
    // contrat (P0-AUTO-2 audite le `contractId` sous `automation:P0-AUTO-2`).
    await current.audit.append({
      id: `audit_${input.action.toLowerCase()}_${input.paymentId}`.slice(0, 120),
      ...(input.eventId ? { eventId: input.eventId } : {}),
      actorId: input.actorId,
      timestamp: input.timestamp,
      entityId: input.paymentId,
      action: input.action,
      source: input.source ?? PAYMENT_API_SOURCE,
      ...(input.reference ? { reference: input.reference } : {}),
      beforeState: {
        paymentId: input.paymentId,
        contractId: input.contractId,
        paymentType: input.paymentType,
        periodKey: input.periodKey,
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...input.beforeState,
      },
      afterState: {
        paymentId: input.paymentId,
        contractId: input.contractId,
        paymentType: input.paymentType,
        periodKey: input.periodKey,
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...input.afterState,
      },
    });
  };

  const appendPaymentEvent = async (
    current: PaymentCycleWriterStores,
    input: {
      payment: PaymentRecord;
      eventType: string;
      actorId: string;
      timestamp: string;
      payload: Record<string, unknown>;
      occurrence?: number;
      source?: string;
      correlationId?: string;
      causationId?: string;
    },
  ): Promise<string> => {
    const event: DomainEvent = createDomainEvent({
      eventId: paymentEventId(input.payment.paymentId, input.eventType, input.occurrence),
      eventType: input.eventType as DomainEvent['eventType'],
      aggregateType: 'payment',
      aggregateId: input.payment.paymentId,
      actorId: input.actorId,
      timestamp: input.timestamp,
      payload: {
        paymentId: input.payment.paymentId,
        contractId: input.payment.contractId,
        employerId: input.payment.employerId,
        candidateId: input.payment.candidateId,
        paymentType: input.payment.paymentType,
        monthNumber: input.payment.monthNumber,
        periodKey: input.payment.periodKey,
        amount: input.payment.amount,
        currency: input.payment.currency,
        occurredAt: input.timestamp,
        ...input.payload,
        // ÉTAPE 18 : l'événement est PRÉPARÉ, jamais branché à un canal.
        channel: null,
        note: 'Aucun consumer de notification branché (P0-PAY-1) : module Notifications ultérieur.',
      },
      source: input.source ?? PAYMENT_API_SOURCE,
      version: 1,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.causationId ? { causationId: input.causationId } : {}),
    });
    await current.outbox.append(event);
    return event.eventId;
  };

  /** Projection sur les vues RÉELLES du contrat (jamais une réécriture). */
  const projectToContract = async (
    current: PaymentCycleWriterStores,
    input: {
      payment: PaymentRecord;
      next: PaymentRecord;
      timestamp: string;
      actorLabel: string;
      description: string;
      historyEvent: string;
      ledgerPatch?: Record<string, unknown>;
    },
  ): Promise<void> => {
    const entryStatus = CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS[input.next.status];
    const entryPatch: Record<string, unknown> = {};
    const ledgerPatch: Record<string, unknown> = { ...(input.ledgerPatch ?? {}) };

    if (input.next.paymentType === 'SALARY') {
      if (input.next.status === 'PENDING_VERIFICATION') {
        entryPatch.salaryDeclaredAt = input.next.submittedAt ?? input.timestamp;
        if (input.next.externalTransactionId) entryPatch.salaryTransactionId = input.next.externalTransactionId;
        if (input.next.proof?.fileName) entryPatch.salaryProofFileName = input.next.proof.fileName;
      }
      if (input.next.status === 'PAID') {
        entryPatch.salaryConfirmedAt = input.timestamp;
        entryPatch.isSalaryPaidToEmployee = true;
      }
    } else {
      if (input.next.status === 'PENDING_VERIFICATION') {
        entryPatch.commissionDeclaredAt = input.next.submittedAt ?? input.timestamp;
        ledgerPatch.status = entryStatus;
        ledgerPatch.amountSubmitted = input.next.amount;
      }
      if (input.next.status === 'VERIFIED' || input.next.status === 'PAID') {
        entryPatch.commissionVerifiedAt = input.next.verifiedAt ?? input.timestamp;
        if (input.next.externalTransactionId) entryPatch.commissionTransactionId = input.next.externalTransactionId;
        ledgerPatch.status = entryStatus;
        ledgerPatch.verifiedAt = input.next.verifiedAt ?? input.timestamp;
        ledgerPatch.paymentId = input.next.currentDeclarationId ?? input.next.paymentId;
      }
      if (input.next.status === 'REJECTED') {
        ledgerPatch.status = entryStatus;
        ledgerPatch.rejectionReason = input.next.rejectionReason ?? 'Déclaration rejetée.';
      }
    }

    await current.contractPayments.projectPaymentStatus({
      contractId: input.next.contractId,
      scheduleEntryId: input.next.scheduleEntryId,
      paymentType: input.next.paymentType,
      monthNumber: input.next.monthNumber,
      // La garde est le statut que la PROJECTION précédente a laissé : une
      // projection rejouée ne peut donc pas régresser ni doubler l'état.
      expectedEntryStatus: CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS[input.payment.status],
      entryStatus,
      entryPatch,
      ...(input.next.paymentType === 'PLATFORM_FEE' ? { ledgerPatch } : {}),
      ...(input.next.paymentType === 'PLATFORM_FEE'
        ? { contractCommission: { status: entryStatus, amountDue: input.next.amount } }
        : {}),
      historyEntry: historyEntry(
        input.historyEvent,
        `${input.description} — ${input.next.periodKey}, ${input.next.paymentType === 'PLATFORM_FEE' ? 'commission' : 'salaire'} `
        + `${input.next.amount} ${input.next.currency}.`,
        input.actorLabel,
        input.timestamp,
      ),
      updatedAt: input.timestamp,
    });
  };

  /** Règle du domaine, traduite en erreur HTTP — la matrice reste la seule autorité. */
  const applyRule = (rule: PaymentTransitionRule, status: PaymentLifecycleStatus): PaymentTransitionOutcome => {
    const outcome = evaluatePaymentTransition(rule, status);
    // `FORBIDDEN` et `TERMINAL` sont tous deux des conflits d'état : 409, avec le
    // motif du domaine. Un état terminal n'est jamais « corrigé » par une requête.
    if (outcome.kind === 'FORBIDDEN' || outcome.kind === 'TERMINAL') {
      throw new ApiError('BUSINESS_RULE_VIOLATION', outcome.reason, undefined, 409);
    }
    return outcome;
  };

  const withReplayCache = <T>(input: {
    actor: AuthenticatedActor;
    command: ProductionCommandContext | undefined;
    commandName: string;
    fingerprint: string;
    run: () => Promise<T>;
    /**
     * Marqueur de rejeu : une commande déjà traitée et déjà mémorisée est rendue
     * SANS second effet, mais le client doit pouvoir le distinguer d'une exécution
     * réelle (`replayed: true`). Aucun appelant n'est obligé de le fournir.
     */
    markReplay?: (value: T) => T;
  }): Promise<T> => {
    const clientKey = input.command?.idempotencyKey?.trim();
    if (!clientKey) return input.run();
    return paymentIdempotencyCache.execute(
      input.actor.id,
      input.commandName,
      clientKey,
      input.fingerprint,
      input.run,
    ).then(({ value, replayed }) => (replayed && input.markReplay ? input.markReplay(value) : value));
  };

  /** Vue de paiement marquée comme rejeu (aucune écriture produite). */
  const markViewReplay = (value: PaymentView): PaymentView => ({ ...value, replayed: true });

  const pageViews = async (
    current: PaymentRepositoryStores,
    records: readonly PaymentRecord[],
    page: PageRequest,
    keyOf: (record: PaymentRecord) => string,
  ): Promise<CursorPage<PaymentView>> => {
    const hasMore = records.length > page.limit;
    const visible = records.slice(0, page.limit);
    const evaluatedAt = now().toISOString();
    const items: PaymentView[] = [];
    for (const record of visible) {
      const declarations = await current.declarations.listByPayment(record.paymentId);
      items.push(toView(record, declarations, evaluatedAt));
    }
    return {
      items,
      cursor: hasMore && visible.length > 0 ? keyOf(visible[visible.length - 1]) : null,
      limit: page.limit,
      hasMore,
    };
  };

  const requireActiveAccount = async (actor: AuthenticatedActor): Promise<void> => {
    const account = await stores.users.findById(actor.id);
    if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
    if (account.role !== actor.role) throw new ApiError('FORBIDDEN', 'Accès interdit.');
    if (account.status !== 'ACTIVE') {
      throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : accès indisponible.');
    }
  };

  /* ---------------------------------------------------------------- */
  /* Écritures automatiques (aucune route)                              */
  /* ---------------------------------------------------------------- */

  const markPaymentDue = async (
    paymentId: string,
    context: { deadlineId?: string; jobId?: string; eventId?: string },
    current: PaymentCycleWriterStores,
    openTransaction: boolean,
  ): Promise<'applied' | 'duplicate'> => {
    const run = async (writer: PaymentCycleWriterStores): Promise<'applied' | 'duplicate'> => {
      const payment = await writer.payments.findByIdForUpdate(paymentId);
      if (!payment) return 'duplicate';
      const rule = PAYMENT_TRANSITION_RULES.MARK_DUE;
      if (payment.status !== 'SCHEDULED') return 'duplicate';

      const timestamp = now().toISOString();
      const updated = await writer.payments.compareAndSetStatus(paymentId, rule.from, {
        status: rule.to,
        updatedAt: timestamp,
      });
      if (!updated) return 'duplicate';

      const eventId = await appendPaymentEvent(writer, {
        payment,
        eventType: 'PAYMENT_DUE',
        actorId: 'SYSTEM',
        timestamp,
        source: 'automation:P0-PAY-1',
        payload: {
          from: 'SCHEDULED',
          to: 'DUE',
          dueAt: updated.dueAt,
          ...(context.deadlineId ? { deadlineId: context.deadlineId } : {}),
          ...(context.jobId ? { jobId: context.jobId } : {}),
          // La dédupication reste le paiement : deux échéances ne font pas deux
          // rappels du même paiement.
          dedupeKey: paymentDueIdempotencyKey(paymentId),
        },
        ...(context.eventId ? { causationId: context.eventId } : {}),
      });

      await projectToContract(writer, {
        payment,
        next: updated,
        timestamp,
        actorLabel: 'SYSTEM',
        description: 'Échéance atteinte : paiement devenu DUE',
        historyEvent: 'PAYMENT_DUE',
        ...(payment.paymentType === 'PLATFORM_FEE'
          ? { ledgerPatch: { status: CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS.DUE } }
          : {}),
      });

      await appendAudit(writer, {
        action: PAYMENT_AUDIT_ACTIONS.due,
        actorId: 'SYSTEM',
        paymentId,
        contractId: payment.contractId,
        paymentType: payment.paymentType,
        periodKey: payment.periodKey,
        timestamp,
        eventId,
        ...(context.jobId ? { jobId: context.jobId } : {}),
        beforeState: { status: payment.status },
        afterState: { status: 'DUE', source: 'automation:P0-PAY-1' },
        source: 'automation:P0-PAY-1',
      });
      return 'applied';
    };

    if (openTransaction && runInTransaction) {
      return inTransaction(current => run(current));
    }
    // Sinon la garantie vient du CAS seul : un second worker trouve zéro ligne et
    // rend `duplicate`, sans écriture ni événement.
    return run(current);
  };

  const materialize = async (
    current: PaymentCycleWriterStores,
    contract: ContractRecord,
    timestamp: string,
    monthNumbers?: readonly number[],
  ): Promise<number> => {
    const drafts = buildPaymentDraftsFromSchedule({
      contractId: contract.id,
      employerId: contract.employerId,
      candidateId: contract.employeeId,
      paymentSchedule: contract.paymentSchedule,
      scheduledAt: timestamp,
      ...(monthNumbers && monthNumbers.length > 0 ? { monthNumbers } : {}),
    });
    let created = 0;
    for (const draft of drafts) {
      const payload: PaymentDraft = {
        paymentId: draft.id,
        contractId: draft.contractId,
        employerId: draft.employerId,
        candidateId: draft.candidateId,
        paymentType: draft.paymentType,
        scheduleEntryId: draft.scheduleEntryId,
        monthNumber: draft.monthNumber,
        periodKey: draft.periodKey,
        amount: draft.amount,
        currency: draft.currency,
        scheduledAt: draft.scheduledAt,
        dueAt: draft.dueAt,
        status: draft.status,
        idempotencyKey: draft.idempotencyKey,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const result = await current.payments.createIfAbsent(payload);
      if (result.kind === 'created') created += 1;
    }
    return created;
  };

  return {
    /* -------------------------------------------------------------- */
    /* ÉTAPE 23 — passage à DUE, déclenché par l'automatisation         */
    /* -------------------------------------------------------------- */
    async markPaymentDue(paymentId, context, writer) {
      return markPaymentDue(paymentId, context, writer ?? stores, writer === undefined);
    },

    async sweepDuePayments(writer, limit) {
      const timestamp = now().toISOString();
      const due = await writer.payments.listScheduledDue(limit, timestamp);
      let applied = 0;
      let duplicates = 0;
      const paymentIds: string[] = [];
      for (const record of due) {
        const outcome = await markPaymentDue(record.paymentId, {}, writer, false);
        if (outcome === 'applied') {
          applied += 1;
          paymentIds.push(record.paymentId);
        } else {
          duplicates += 1;
        }
      }
      return { scanned: due.length, applied, duplicates, paymentIds };
    },

    /** Matérialisation de rattrapage (contrats activés avant P0-PAY-1). */
    async materializePaymentsForContract(contractId) {
      const contract = await stores.contracts.findById(contractId);
      if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
      return inTransaction(current => materialize(current, contract, now().toISOString()));
    },

    /* -------------------------------------------------------------- */
    /* ÉTAPE 6 — déclaration employeur                                  */
    /* -------------------------------------------------------------- */
    async declarePayment(actor, expectedType, payload, command) {
      const trusted = requireTrustedActor(actor);
      const normalized = normalizePaymentDeclarationPayload(payload);
      if (normalized.kind === 'INVALID') {
        throw new ApiError('VALIDATION_ERROR', 'La déclaration de paiement est invalide.', normalized.errors);
      }
      const body = normalized.payload;
      if (trusted.role !== 'EMPLOYER') {
        throw new ApiError('FORBIDDEN', 'Seul l’employeur du contrat peut déclarer un paiement.');
      }

      const fingerprint = JSON.stringify({ ...body, paymentType: expectedType });
      const durableKey = paymentDeclarationIdempotencyKey({
        actorId: trusted.id,
        command: PAYMENT_DECLARATION_COMMAND,
        idempotencyKey: command?.idempotencyKey ?? `server:${body.paymentId ?? `${body.contractId}:${body.periodKey}`}`,
      });

      const run = async (): Promise<PaymentView> => {
        try {
          return await inTransaction(async current => {
            const account = await current.users.findByIdForShare(trusted.id);
            if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
            if (account.role !== 'EMPLOYER' || account.status !== 'ACTIVE') {
              throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : la déclaration de paiement est indisponible.');
            }

            // Résolution de la ligne visée : par identifiant, ou par contrat +
            // période — la nature venant TOUJOURS de la ligne, jamais du client.
            let payment: PaymentRecord | null = null;
            if (body.paymentId) {
              payment = await current.payments.findByIdForUpdate(body.paymentId);
            } else if (body.contractId && body.periodKey) {
              const candidates = await current.payments.listByContract(body.contractId);
              payment = candidates.find(entry =>
                entry.periodKey === body.periodKey && entry.paymentType === expectedType) ?? null;
            }
            if (!payment) throw new ApiError('NOT_FOUND', 'Paiement introuvable pour cette période.');
            const paymentId = payment.paymentId;

            const contract = await current.contracts.findByIdForUpdate(payment.contractId);
            if (!contract) throw new ApiError('NOT_FOUND', 'Contrat du paiement introuvable.');
            // Propriétaire résolu depuis le CONTRAT, jamais depuis une déclaration.
            if (contract.employerId !== trusted.id || payment.employerId !== trusted.id) {
              throw new ApiError(
                'FORBIDDEN',
                'Action non autorisée : vous n’êtes pas l’employeur de ce paiement.',
              );
            }
            if (contract.status !== 'ACTIVE') {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                `Un paiement ne se déclare que sur un contrat actif (statut : ${contract.status}).`,
                undefined,
                409,
              );
            }
            if (payment.paymentType !== expectedType) {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                `Cette route ne traite que les paiements ${expectedType} ; le paiement visé est ${payment.paymentType}. `
                + 'Les flux salaire et commission sont strictement séparés.',
                undefined,
                409,
              );
            }
            if (body.periodKey && body.periodKey !== payment.periodKey) {
              throw new ApiError('BUSINESS_RULE_VIOLATION', 'La période déclarée ne correspond pas au paiement visé.', undefined, 409);
            }

            const rule = PAYMENT_TRANSITION_RULES.DECLARE_PAYMENT;
            const evaluatedAt = now().toISOString();
            const transition = applyRule(rule, payment.status);

            // Le rejeu de la MÊME commande (même clé, même empreinte) est servi
            // d'abord : il ne doit JAMAIS écrire une seconde tentative.
            const reservation = await reserve(current, {
              actorId: trusted.id,
              command: PAYMENT_DECLARATION_COMMAND,
              key: durableKey,
              payload: fingerprint,
            });
            if (reservation === 'replay') return readView(current, paymentId, evaluatedAt, true);

            if (transition.kind === 'ALREADY') {
              // Une déclaration EST déjà déposée sous une autre clé : ce n'est pas
              // un rejeu, et le modèle n'admet pas de seconde tentative par-dessus
              // une vérification en cours (`confirmMonthlyAction` n'accepte que
              // `DUE` ou `REJECTED`).
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                'Une déclaration est déjà en cours de vérification pour ce paiement : la régularisation passe par un rejet, puis une NOUVELLE déclaration.',
                undefined,
                409,
              );
            }

            // Garde métier du modèle (`confirmMonthlyAction`) : montant, devise,
            // échéance atteinte, référence obligatoire.
            const gate = evaluatePaymentDeclaration({
              paymentType: payment.paymentType,
              status: payment.status,
              amountDue: payment.amount,
              currency: payment.currency,
              dueAt: payment.dueAt,
              reference: body.reference,
              evaluatedAt,
              ...(body.amount !== undefined ? { declaredAmount: body.amount } : {}),
              ...(body.currency !== undefined ? { declaredCurrency: body.currency } : {}),
            });
            if (gate.kind === 'REJECTED_BY_RULE') {
              throw new ApiError('BUSINESS_RULE_VIOLATION', gate.reason, undefined, 422);
            }
            // Régularisation (ÉTAPE 9) : après rejet, la référence doit être nouvelle.
            if (payment.status === 'REJECTED' && payment.reference === body.reference) {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                'La régularisation exige une déclaration nouvelle : cette référence a déjà été rejetée.',
                undefined,
                422,
              );
            }

            const attemptNumber = await current.declarations.nextAttemptNumber(paymentId);
            const declarationId = paymentDeclarationId(paymentId, attemptNumber);

            // La transition est CLAIMÉE par CAS AVANT toute écriture : c'est le seul
            // point d'exclusion mutuelle du cycle. Un requérant concurrent qui le
            // perd sort donc SANS aucune ligne résiduelle (aucune tentative
            // orpheline, même sous un pilote qui partagerait une connexion).
            const patch: PaymentTransitionPatch = {
              status: rule.to,
              updatedAt: evaluatedAt,
              reference: body.reference,
              submittedAt: evaluatedAt,
              submittedBy: trusted.id,
              currentDeclarationId: declarationId,
              incrementDeclarationCount: true,
              ...(body.proof ? { proof: body.proof } : {}),
              ...(body.externalTransactionId ? { externalTransactionId: body.externalTransactionId } : {}),
              ...(body.provider ? { provider: body.provider } : {}),
            };
            const updated = await current.payments.compareAndSetStatus(paymentId, rule.from, patch);
            if (!updated) {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                'Une transition concurrente a modifié ce paiement : la déclaration n’a pas été appliquée.',
                undefined,
                409,
              );
            }

            const declaration = await current.declarations.create({
              declarationId,
              paymentId,
              contractId: payment.contractId,
              periodKey: payment.periodKey,
              paymentType: payment.paymentType,
              attemptNumber,
              amount: payment.amount,
              currency: payment.currency,
              reference: body.reference,
              ...(body.externalTransactionId ? { externalTransactionId: body.externalTransactionId } : {}),
              ...(body.provider ? { provider: body.provider } : {}),
              ...(body.proof ? { proof: body.proof } : {}),
              ...(body.comment ? { comment: body.comment } : {}),
              // La tentative porte l'identifiant déjà revendiqué par la transition :
              // `payments.current_declaration_id` et cette ligne pointent l'un vers
              // l'autre, sans écriture après coup.
              submittedAt: evaluatedAt,
              submittedBy: trusted.id,
              outcome: 'PENDING',
              idempotencyKey: durableKey,
              createdAt: evaluatedAt,
              updatedAt: evaluatedAt,
            });

            const declaredEventId = await appendPaymentEvent(current, {
              payment,
              eventType: 'PAYMENT_DECLARED',
              actorId: trusted.id,
              timestamp: evaluatedAt,
              occurrence: attemptNumber,
              correlationId: command?.requestId,
              causationId: command?.idempotencyKey,
              payload: {
                declarationId: declaration.declarationId,
                attemptNumber,
                reference: declaration.reference,
                submittedBy: trusted.id,
                ...(body.paidAt ? { paidAt: body.paidAt } : {}),
                dedupeKey: `${paymentId}:PAYMENT_DECLARED:${attemptNumber}`,
              },
            });
            await appendPaymentEvent(current, {
              payment,
              eventType: 'PAYMENT_PENDING_VERIFICATION',
              actorId: trusted.id,
              timestamp: evaluatedAt,
              occurrence: attemptNumber,
              correlationId: command?.requestId,
              causationId: command?.idempotencyKey,
              payload: {
                declarationId: declaration.declarationId,
                attemptNumber,
                status: 'PENDING_VERIFICATION',
                dedupeKey: `${paymentId}:PAYMENT_PENDING_VERIFICATION:${attemptNumber}`,
              },
            });

            await projectToContract(current, {
              payment,
              next: updated,
              timestamp: evaluatedAt,
              actorLabel: account.displayName || trusted.id,
              description: 'Déclaration soumise par l’employeur',
              historyEvent: 'PAYMENT_DECLARED',
            });

            await appendAudit(current, {
              action: PAYMENT_AUDIT_ACTIONS.submitted,
              actorId: trusted.id,
              paymentId,
              contractId: payment.contractId,
              paymentType: payment.paymentType,
              periodKey: payment.periodKey,
              timestamp: evaluatedAt,
              eventId: declaredEventId,
              reference: durableKey,
              beforeState: { status: payment.status, declarationCount: payment.declarationCount },
              afterState: {
                status: updated.status,
                declarationId: declaration.declarationId,
                attemptNumber,
                reference: declaration.reference,
                amount: declaration.amount,
                currency: declaration.currency,
                provider: declaration.provider ?? null,
                jobId: null,
                error: null,
              },
            });

            await current.idempotency.complete(trusted.id, PAYMENT_DECLARATION_COMMAND, durableKey, {
              declarationId: declaration.declarationId,
              paymentId,
              status: updated.status,
            });

            const declarations = await current.declarations.listByPayment(paymentId);
            return toView(updated, declarations, evaluatedAt);
          });
        } catch (error) {
          mapPaymentError(error);
        }
      };

      return withReplayCache({
        actor: trusted,
        command,
        commandName: PAYMENT_DECLARATION_COMMAND,
        fingerprint,
        run,
        markReplay: markViewReplay,
      });
    },

    /* -------------------------------------------------------------- */
    /* ÉTAPE 8 — vérification locale : VERIFIED ou REJECTED             */
    /* -------------------------------------------------------------- */
    async verifyPayment(actor, paymentId, command) {
      const trusted = requireTrustedActor(actor);
      const rule = PAYMENT_TRANSITION_RULES.VERIFY_DECLARATION;
      const fingerprint = JSON.stringify({ paymentId, action: 'VERIFY' });
      const durableKey = `${paymentId}:${PAYMENT_VERIFICATION_COMMAND}:${command?.idempotencyKey ?? 'server'}`;

      const run = async (): Promise<PaymentView> => {
        try {
          return await inTransaction(async current => {
            const { payment } = await lockPaymentFor(current, trusted, paymentId, rule);
            const timestamp = now().toISOString();

            const transition = applyRule(rule, payment.status);
            if (transition.kind === 'ALREADY') {
              return readView(current, payment.paymentId, timestamp, true);
            }
            const reservation = await reserve(current, {
              actorId: trusted.id,
              command: PAYMENT_VERIFICATION_COMMAND,
              key: durableKey,
              payload: fingerprint,
            });
            if (reservation === 'replay') return readView(current, payment.paymentId, timestamp, true);

            const declaration = payment.currentDeclarationId
              ? await current.declarations.findById(payment.currentDeclarationId)
              : null;
            if (!declaration) {
              throw new ApiError('BUSINESS_RULE_VIOLATION', 'Aucune déclaration courante à vérifier.', undefined, 409);
            }
            const history = await current.declarations.listByPayment(payment.paymentId);
            const rejectedReferences = history.filter(entry => entry.outcome === 'REJECTED').map(entry => entry.reference);

            await appendAudit(current, {
              action: PAYMENT_AUDIT_ACTIONS.verificationStarted,
              actorId: trusted.id,
              paymentId: payment.paymentId,
              contractId: payment.contractId,
              paymentType: payment.paymentType,
              periodKey: payment.periodKey,
              timestamp,
              reference: durableKey,
              beforeState: { status: payment.status },
              afterState: { service: verification.implementation, verdict: 'pending', declarationId: declaration.declarationId },
            });

            const result = await verification.verify({
              payment,
              declaration,
              payer: payment.employerId,
              recipient: payment.paymentType === 'PLATFORM_FEE' ? 'LE_LABEUR' : payment.candidateId,
              checkedAt: timestamp,
              previousReferences: rejectedReferences,
            });

            if (result.verdict === 'MISMATCHED') {
              const rejectRule = PAYMENT_TRANSITION_RULES.REJECT_DECLARATION;
              const reason = `Vérification locale écartée : ${result.reasons.join(' ')}`;
              const rejected = await current.payments.compareAndSetStatus(payment.paymentId, rejectRule.from, {
                status: rejectRule.to,
                updatedAt: timestamp,
                rejectedAt: timestamp,
                rejectedBy: trusted.id,
                rejectionReason: reason,
              });
              if (!rejected) {
                throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une transition concurrente a modifié ce paiement.', undefined, 409);
              }
              await current.declarations.compareAndSetOutcome(declaration.declarationId, 'PENDING', {
                outcome: 'REJECTED',
                reviewedAt: timestamp,
                reviewedBy: trusted.id,
                rejectionReason: reason,
                updatedAt: timestamp,
              });
              const eventId = await appendPaymentEvent(current, {
                payment,
                eventType: 'PAYMENT_REJECTED',
                actorId: trusted.id,
                timestamp,
                occurrence: declaration.attemptNumber,
                payload: {
                  declarationId: declaration.declarationId,
                  verdict: 'MISMATCHED',
                  reasons: result.reasons,
                  reason,
                  decidedBy: trusted.id,
                },
              });
              await projectToContract(current, {
                payment,
                next: rejected,
                timestamp,
                actorLabel: trusted.id,
                description: 'Déclaration écartée par la vérification',
                historyEvent: 'PAYMENT_REJECTED',
              });
              await appendAudit(current, {
                action: PAYMENT_AUDIT_ACTIONS.verificationMismatch,
                actorId: trusted.id,
                paymentId: payment.paymentId,
                contractId: payment.contractId,
                paymentType: payment.paymentType,
                periodKey: payment.periodKey,
                timestamp,
                eventId,
                reference: durableKey,
                error: result.reasons.join(' '),
                beforeState: { status: payment.status, verdict: 'pending' },
                afterState: { status: rejected.status, verdict: 'MISMATCHED', reasons: result.reasons, source: result.source },
              });
              await current.idempotency.complete(trusted.id, PAYMENT_VERIFICATION_COMMAND, durableKey, {
                verdict: 'MISMATCHED',
              });
              const declarations = await current.declarations.listByPayment(payment.paymentId);
              return toView(rejected, declarations, timestamp);
            }

            const updated = await current.payments.compareAndSetStatus(payment.paymentId, rule.from, {
              status: rule.to,
              updatedAt: timestamp,
              verifiedAt: timestamp,
              verifiedBy: trusted.id,
            });
            if (!updated) {
              throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une transition concurrente a modifié ce paiement.', undefined, 409);
            }
            await current.declarations.compareAndSetOutcome(declaration.declarationId, 'PENDING', {
              outcome: 'VERIFIED',
              reviewedAt: timestamp,
              reviewedBy: trusted.id,
              updatedAt: timestamp,
            });
            const eventId = await appendPaymentEvent(current, {
              payment,
              eventType: 'PAYMENT_APPROVED',
              actorId: trusted.id,
              timestamp,
              occurrence: declaration.attemptNumber,
              correlationId: command?.requestId,
              causationId: command?.idempotencyKey,
              payload: {
                declarationId: declaration.declarationId,
                verdict: 'MATCHED',
                verifiedBy: trusted.id,
                verifiedAt: timestamp,
                // Traçabilité : la décision est locale, aucun fournisseur consulté.
                verificationSource: result.source,
                movedFunds: false,
              },
            });
            await projectToContract(current, {
              payment,
              next: updated,
              timestamp,
              actorLabel: trusted.id,
              description: 'Déclaration vérifiée par LE LABEUR',
              historyEvent: 'PAYMENT_VERIFIED',
            });
            await appendAudit(current, {
              action: PAYMENT_AUDIT_ACTIONS.verified,
              actorId: trusted.id,
              paymentId: payment.paymentId,
              contractId: payment.contractId,
              paymentType: payment.paymentType,
              periodKey: payment.periodKey,
              timestamp,
              eventId,
              reference: durableKey,
              beforeState: { status: payment.status, declarationId: declaration.declarationId },
              afterState: {
                status: updated.status,
                verdict: 'MATCHED',
                source: result.source,
                movedFunds: false,
              },
            });
            await current.idempotency.complete(trusted.id, PAYMENT_VERIFICATION_COMMAND, durableKey, {
              verdict: 'MATCHED',
              status: updated.status,
            });
            const declarations = await current.declarations.listByPayment(payment.paymentId);
            return toView(updated, declarations, timestamp);
          });
        } catch (error) {
          mapPaymentError(error);
        }
      };

      return withReplayCache({
        actor: trusted,
        command,
        commandName: PAYMENT_VERIFICATION_COMMAND,
        fingerprint,
        run,
        markReplay: markViewReplay,
      });
    },

    /* -------------------------------------------------------------- */
    /* ÉTAPE 8/10 — VERIFIED → PAID par rapprochement local             */
    /* -------------------------------------------------------------- */
    async confirmPaymentPaid(actor, paymentId, command) {
      const trusted = requireTrustedActor(actor);
      const rule = PAYMENT_TRANSITION_RULES.CONFIRM_PAID;
      const fingerprint = JSON.stringify({ paymentId, action: 'CONFIRM_PAID' });
      const durableKey = `${paymentId}:${PAYMENT_CONFIRM_COMMAND}:${command?.idempotencyKey ?? 'server'}`;

      const run = async (): Promise<PaymentView> => {
        try {
          return await inTransaction(async current => {
            const { payment } = await lockPaymentFor(current, trusted, paymentId, rule);
            const timestamp = now().toISOString();

            const transition = applyRule(rule, payment.status);
            if (transition.kind === 'ALREADY') {
              return readView(current, payment.paymentId, timestamp, true);
            }
            const reservation = await reserve(current, {
              actorId: trusted.id,
              command: PAYMENT_CONFIRM_COMMAND,
              key: durableKey,
              payload: fingerprint,
            });
            if (reservation === 'replay') return readView(current, payment.paymentId, timestamp, true);

            const declaration = payment.currentDeclarationId
              ? await current.declarations.findById(payment.currentDeclarationId)
              : undefined;
            const decision = await reconciliation.reconcile({
              payment,
              ...(declaration ? { declaration } : {}),
              reconciledAt: timestamp,
            });
            if (decision.kind === 'NOT_CONFIRMED') {
              await appendAudit(current, {
                action: PAYMENT_AUDIT_ACTIONS.paid,
                actorId: trusted.id,
                paymentId: payment.paymentId,
                contractId: payment.contractId,
                paymentType: payment.paymentType,
                periodKey: payment.periodKey,
                timestamp,
                reference: durableKey,
                error: decision.reasons.join(' '),
                beforeState: { status: payment.status },
                afterState: { status: payment.status, decision: 'NOT_CONFIRMED', movedFunds: false },
              });
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                `Rapprochement refusé : ${decision.reasons.join(' ')}`,
                undefined,
                409,
              );
            }

            const updated = await current.payments.compareAndSetStatus(payment.paymentId, rule.from, {
              status: rule.to,
              updatedAt: timestamp,
            });
            if (!updated) {
              throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une transition concurrente a modifié ce paiement.', undefined, 409);
            }

            const eventId = await appendPaymentEvent(current, {
              payment,
              eventType: 'PAYMENT_PAID',
              actorId: trusted.id,
              timestamp,
              correlationId: command?.requestId,
              causationId: command?.idempotencyKey,
              payload: {
                consideredPaidAt: timestamp,
                reference: payment.reference ?? declaration?.reference ?? null,
                reconciliation: decision.note,
                // La vérité du cycle : AUCUN mouvement de fonds.
                movedFunds: false,
                providerTransactionId: null,
              },
            });

            await projectToContract(current, {
              payment,
              next: updated,
              timestamp,
              actorLabel: trusted.id,
              description: 'Paiement considéré comme payé après rapprochement local',
              historyEvent: 'PAYMENT_PAID',
            });

            await appendAudit(current, {
              action: PAYMENT_AUDIT_ACTIONS.paid,
              actorId: trusted.id,
              paymentId: payment.paymentId,
              contractId: payment.contractId,
              paymentType: payment.paymentType,
              periodKey: payment.periodKey,
              timestamp,
              eventId,
              reference: durableKey,
              beforeState: { status: payment.status },
              afterState: {
                status: updated.status,
                reference: updated.reference ?? null,
                provider: updated.provider ?? null,
                movedFunds: false,
                note: decision.note,
              },
            });
            await current.idempotency.complete(trusted.id, PAYMENT_CONFIRM_COMMAND, durableKey, {
              status: 'PAID',
              movedFunds: false,
            });
            const declarations = await current.declarations.listByPayment(payment.paymentId);
            return toView(updated, declarations, timestamp);
          });
        } catch (error) {
          mapPaymentError(error);
        }
      };

      return withReplayCache({
        actor: trusted,
        command,
        commandName: PAYMENT_CONFIRM_COMMAND,
        fingerprint,
        run,
        markReplay: markViewReplay,
      });
    },

    /* -------------------------------------------------------------- */
    /* ÉTAPE 9 — rejet motivé + régularisation par NOUVELLE déclaration   */
    /* -------------------------------------------------------------- */
    async rejectPayment(actor, paymentId, reason, command) {
      const trusted = requireTrustedActor(actor);
      const rule = PAYMENT_TRANSITION_RULES.REJECT_DECLARATION;
      const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
      if (!normalizedReason) {
        throw new ApiError('VALIDATION_ERROR', 'Le motif du rejet est requis.', {
          reason: ['Le motif du rejet est obligatoire.'],
        });
      }
      const fingerprint = JSON.stringify({ paymentId, reason: normalizedReason });
      const durableKey = `${paymentId}:${PAYMENT_REJECT_COMMAND}:${command?.idempotencyKey ?? 'server'}`;

      const run = async (): Promise<PaymentView> => {
        try {
          return await inTransaction(async current => {
            const { payment } = await lockPaymentFor(current, trusted, paymentId, rule);
            const timestamp = now().toISOString();

            const transition = applyRule(rule, payment.status);
            if (transition.kind === 'ALREADY') {
              return readView(current, payment.paymentId, timestamp, true);
            }
            const reservation = await reserve(current, {
              actorId: trusted.id,
              command: PAYMENT_REJECT_COMMAND,
              key: durableKey,
              payload: fingerprint,
            });
            if (reservation === 'replay') return readView(current, payment.paymentId, timestamp, true);

            const declaration = payment.currentDeclarationId
              ? await current.declarations.findById(payment.currentDeclarationId)
              : null;

            const updated = await current.payments.compareAndSetStatus(payment.paymentId, rule.from, {
              status: rule.to,
              updatedAt: timestamp,
              rejectedAt: timestamp,
              rejectedBy: trusted.id,
              rejectionReason: normalizedReason,
            });
            if (!updated) {
              throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une transition concurrente a modifié ce paiement.', undefined, 409);
            }
            if (declaration) {
              await current.declarations.compareAndSetOutcome(declaration.declarationId, 'PENDING', {
                outcome: 'REJECTED',
                reviewedAt: timestamp,
                reviewedBy: trusted.id,
                rejectionReason: normalizedReason,
                updatedAt: timestamp,
              });
            }

            const eventId = await appendPaymentEvent(current, {
              payment,
              eventType: 'PAYMENT_REJECTED',
              actorId: trusted.id,
              timestamp,
              ...(declaration ? { occurrence: declaration.attemptNumber } : {}),
              correlationId: command?.requestId,
              causationId: command?.idempotencyKey,
              payload: {
                ...(declaration ? { declarationId: declaration.declarationId } : {}),
                reason: normalizedReason,
                rejectedBy: trusted.id,
                regularization: 'nouvelle déclaration attendue',
                // La preuve précédente n'est jamais supprimée : la ligne reste.
                previousProofPreserved: declaration ? { reference: declaration.reference } : null,
              },
            });

            await projectToContract(current, {
              payment,
              next: updated,
              timestamp,
              actorLabel: trusted.id,
              description: 'Déclaration rejetée par LE LABEUR',
              historyEvent: 'PAYMENT_REJECTED',
            });

            await appendAudit(current, {
              action: PAYMENT_AUDIT_ACTIONS.rejected,
              actorId: trusted.id,
              paymentId: payment.paymentId,
              contractId: payment.contractId,
              paymentType: payment.paymentType,
              periodKey: payment.periodKey,
              timestamp,
              eventId,
              reference: durableKey,
              error: normalizedReason,
              beforeState: { status: payment.status, reference: payment.reference ?? null },
              afterState: {
                status: updated.status,
                rejectionReason: normalizedReason,
                rejectedBy: trusted.id,
                declarationPreserved: declaration?.declarationId ?? null,
              },
            });
            await current.idempotency.complete(trusted.id, PAYMENT_REJECT_COMMAND, durableKey, { status: 'REJECTED' });
            const declarations = await current.declarations.listByPayment(payment.paymentId);
            return toView(updated, declarations, timestamp);
          });
        } catch (error) {
          mapPaymentError(error);
        }
      };

      return withReplayCache({
        actor: trusted,
        command,
        commandName: PAYMENT_REJECT_COMMAND,
        fingerprint,
        run,
        markReplay: markViewReplay,
      });
    },

    /* -------------------------------------------------------------- */
    /* ÉTAPE 5 — avancement mensuel M1 → M2 → … (règle réelle du modèle) */
    /* -------------------------------------------------------------- */
    async advanceContractMonth(actor, contractId, command) {
      const trusted = requireTrustedActor(actor);
      const fingerprint = JSON.stringify({ contractId, action: 'ADVANCE_MONTH' });
      const durableKey = `${contractId}:${PAYMENT_ADVANCE_MONTH_COMMAND}:${command?.idempotencyKey ?? 'server'}`;

      const run = async (): Promise<MonthlyAdvanceView> => {
        try {
          return await inTransaction(async current => {
            const account = await current.users.findByIdForShare(trusted.id);
            if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
            if (account.status !== 'ACTIVE') {
              throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : l’avancement mensuel est indisponible.');
            }
            if (trusted.role !== 'EMPLOYER') {
              throw new ApiError('FORBIDDEN', 'Action non autorisée : seul l’employeur du contrat peut avancer le mois.');
            }

            const contract = await current.contracts.findByIdForUpdate(contractId?.trim() ?? '');
            if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
            if (contract.employerId !== trusted.id) {
              throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’employeur de ce contrat.');
            }
            if (contract.status !== 'ACTIVE') {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                `Seul un contrat actif avance de mois (statut : ${contract.status}).`,
                undefined,
                409,
              );
            }

            const evaluation = evaluateMonthlyAdvance({
              contractId: contract.id,
              status: contract.status,
              periodicity: contract.periodicity,
              currentMonth: contract.currentMonth,
              durationMonths: contract.durationMonths,
              monthlySalary: contract.monthlySalary,
              currency: contract.currency,
              paymentSchedule: contract.paymentSchedule,
            });
            if (evaluation.kind !== 'ADVANCE') {
              throw new ApiError('BUSINESS_RULE_VIOLATION', monthlyAdvanceRefusal(evaluation), undefined, 409);
            }
            const plan: MonthlyAdvancePlan = evaluation.plan;
            const timestamp = now().toISOString();

            const reservation = await reserve(current, {
              actorId: trusted.id,
              command: PAYMENT_ADVANCE_MONTH_COMMAND,
              key: durableKey,
              payload: fingerprint,
            });

            const applied = await current.contractPayments.advanceContractMonth({
              contractId: contract.id,
              fromMonth: contract.currentMonth,
              toMonth: plan.toMonth,
              checkpoint: { ...plan.checkpoint },
              ledgerEntry: { ...plan.ledgerEntry },
              commissionAmountDue: plan.commissionAmountDue,
              commissionStatus: plan.commissionStatus,
              historyEntry: historyEntry(
                plan.historyEvent,
                `${plan.description} — enregistré par ${account.displayName || trusted.id}.`,
                account.displayName || trusted.id,
                timestamp,
              ),
              updatedAt: timestamp,
            });

            const fresh = await current.contracts.findById(contract.id);
            const replayed = !applied && (fresh?.currentMonth ?? -1) === plan.toMonth;
            if (!applied && !replayed) {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                'Une transition concurrente a modifié ce contrat : l’avancement n’a pas été appliqué.',
                undefined,
                409,
              );
            }

            // Le cycle suit l'échéancier : le mois ouvert reçoit ses lignes de
            // paiement si elles manquent (contrat activé avant P0-PAY-1). Un
            // rejeu de la projection ne crée donc JAMAIS un second paiement.
            const paymentsMaterialized = await materialize(current, { ...contract, currentMonth: plan.toMonth }, timestamp, [plan.toMonth]);

            await appendAudit(current, {
              action: PAYMENT_AUDIT_ACTIONS.monthAdvanced,
              actorId: trusted.id,
              paymentId: contract.id,
              contractId: contract.id,
              paymentType: 'SALARY',
              periodKey: plan.periodKey,
              timestamp,
              reference: durableKey,
              beforeState: { currentMonth: contract.currentMonth, replayed: false },
              afterState: {
                currentMonth: plan.toMonth,
                periodKey: plan.periodKey,
                paymentsMaterialized,
                replayed,
                commissionPercentage: contract.commissionPercentage,
              },
            });

            if (reservation === 'reserved') {
              await current.idempotency.complete(trusted.id, PAYMENT_ADVANCE_MONTH_COMMAND, durableKey, {
                toMonth: plan.toMonth,
                replayed,
              });
            }

            return {
              contractId: contract.id,
              fromMonth: plan.fromMonth,
              toMonth: plan.toMonth,
              periodKey: plan.periodKey,
              paymentsMaterialized,
              replayed,
            };
          });
        } catch (error) {
          mapPaymentError(error);
        }
      };

      return withReplayCache({
        actor: trusted,
        command,
        commandName: PAYMENT_ADVANCE_MONTH_COMMAND,
        fingerprint,
        run,
        markReplay: value => ({ ...value, replayed: true }),
      });
    },

    /* -------------------------------------------------------------- */
    /* Lectures scope-aware (ÉTAPE 21)                                   */
    /* -------------------------------------------------------------- */
    async getMyPayments(actor, page) {
      const trusted = requireTrustedActor(actor);
      if (trusted.role !== 'EMPLOYER' && trusted.role !== 'CANDIDATE') {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : chaque partie consulte uniquement ses paiements.');
      }
      await requireActiveAccount(trusted);
      // Le salarié ne voit QUE ses salaires : la commission de plateforme n'est
      // pas sa donnée, même si elle concerne le même contrat.
      const records = trusted.role === 'EMPLOYER'
        ? await stores.payments.listByEmployer(trusted.id, page.limit + 1, page.cursor)
        : await stores.payments.listByCandidate(trusted.id, page.limit + 1, page.cursor, 'SALARY');
      return pageViews(stores, records, page, record => record.paymentId);
    },

    async getPayment(actor, paymentId) {
      const trusted = requireTrustedActor(actor);
      const normalized = paymentId?.trim();
      if (!normalized) return null;
      if (trusted.role !== 'ADMIN') await requireActiveAccount(trusted);

      const record = await stores.payments.findById(normalized);
      if (!record) return null;
      if (trusted.role === 'ADMIN') {
        if (!trusted.permissions.includes('payments:read:any')) {
          throw new ApiError('FORBIDDEN', 'Permission payments:read:any requise.');
        }
      } else if (record.employerId !== trusted.id && record.candidateId !== trusted.id) {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas partie de ce paiement.');
      }
      const declarations = await stores.declarations.listByPayment(record.paymentId);
      return toView(record, declarations, now().toISOString());
    },

    async getContractPayments(actor, contractId, page) {
      const trusted = requireTrustedActor(actor);
      await requireActiveAccount(trusted);
      const contract = await stores.contracts.findById(contractId?.trim() ?? '');
      if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
      if (trusted.role !== 'ADMIN' && contract.employerId !== trusted.id && contract.employeeId !== trusted.id) {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas partie de ce contrat.');
      }
      const records = await stores.payments.listByContract(contract.id, page.limit + 1);
      return pageViews(stores, records, page, record => record.paymentId);
    },

    async getAdminPayments(actor, page) {
      const trusted = requireTrustedActor(actor);
      if (trusted.role !== 'ADMIN') {
        throw new ApiError('FORBIDDEN', 'Accès réservé à l’administration.');
      }
      if (!trusted.permissions.includes('payments:read:any')) {
        throw new ApiError('FORBIDDEN', 'Permission payments:read:any requise.');
      }
      const account = await stores.users.findById(trusted.id);
      if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
      if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : accès indisponible.');
      if (page.cursor) {
        const cursor = await stores.payments.findById(page.cursor);
        if (!cursor) throw new ApiError('VALIDATION_ERROR', 'Le curseur de paiements est invalide.');
      }
      const records = await stores.payments.listAll(page.limit + 1, page.cursor);
      return pageViews(stores, records, page, record => record.paymentId);
    },

    /* -------------------------------------------------------------- */
    /* P0-PAY-2 — Webhook sécurisé fournisseur de paiement             */
    /* -------------------------------------------------------------- */
    async processPaymentWebhook(input: PaymentWebhookInput): Promise<PaymentWebhookOutcome> {
      // 1. Normalisation des en-têtes
      const headerMap: Record<string, string> = {};
      if (input.headers instanceof Headers) {
        input.headers.forEach((value, key) => { headerMap[key.toLowerCase()] = value; });
      } else if (input.headers) {
        for (const [key, value] of Object.entries(input.headers)) {
          if (typeof value === 'string') headerMap[key.toLowerCase()] = value;
        }
      }

      // 2. Vérification du corps JSON
      let parsedBody: Record<string, unknown> = {};
      try {
        parsedBody = JSON.parse(input.rawBody);
      } catch {
        throw new ApiError('VALIDATION_ERROR', 'Corps de webhook JSON illisible.', undefined, 400);
      }

      const provider = String(
        headerMap['x-provider']
        || headerMap['x-webhook-provider']
        || parsedBody.provider
        || 'TEST_GATEWAY',
      ).trim();

      const signature = String(
        headerMap['x-webhook-signature']
        || headerMap['x-signature']
        || headerMap['x-payment-signature']
        || '',
      ).trim();

      const timestampHeader = String(
        headerMap['x-webhook-timestamp']
        || headerMap['x-timestamp']
        || '',
      ).trim();

      if (!provider) {
        throw new ApiError('VALIDATION_ERROR', 'Fournisseur non spécifié dans le webhook.', undefined, 400);
      }

      const adapter = getAdapter(provider);
      const evaluatedAt = now().toISOString();
      const entityIdForAudit = String(
        parsedBody.paymentId
        || parsedBody.reference
        || parsedBody.externalTransactionId
        || 'UNKNOWN',
      );

      // 3. Validation de signature et horodatage via l'adaptateur
      let webhookResult: NormalizedWebhookResult;
      try {
        webhookResult = await adapter.handleWebhook({
          signature,
          timestamp: timestampHeader,
          rawBody: input.rawBody,
          headers: headerMap,
          payload: parsedBody,
        });
      } catch (error) {
        const errMsg = (error as Error)?.message ?? 'Signature ou horodatage invalide';
        // Auditer le rejet de signature / anti-replay (ÉTAPE 10)
        await stores.audit.append({
          id: `audit_wh_sig_rej_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`.slice(0, 120),
          actorId: `provider:${provider}`,
          timestamp: evaluatedAt,
          entityId: entityIdForAudit,
          action: PAYMENT_AUDIT_ACTIONS.signatureRejected,
          source: `webhook:${provider}`,
          beforeState: { provider },
          afterState: {
            provider,
            error: errMsg,
            timestamp: evaluatedAt,
          },
        }).catch(() => null);

        if (error instanceof PaymentLifecycleError && error.code === 'NOT_IMPLEMENTED') {
          throw new ApiError('NOT_IMPLEMENTED', error.message, undefined, 501);
        }
        if (error instanceof PaymentLifecycleError && error.code === 'VALIDATION') {
          throw new ApiError('VALIDATION_ERROR', error.message, undefined, 400);
        }
        if (error instanceof ApiError) throw error;
        throw new ApiError('UNAUTHENTICATED', errMsg, undefined, 401);
      }

      if (!webhookResult.accepted) {
        const errorMsg = webhookResult.reasons?.join(' ') || 'Webhook non accepté par l’adaptateur.';
        await stores.audit.append({
          id: `audit_wh_rej_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`.slice(0, 120),
          actorId: `provider:${provider}`,
          timestamp: evaluatedAt,
          entityId: entityIdForAudit,
          action: PAYMENT_AUDIT_ACTIONS.signatureRejected,
          source: `webhook:${provider}`,
          beforeState: { provider },
          afterState: { reasons: webhookResult.reasons, error: errorMsg },
        }).catch(() => null);
        throw new ApiError('VALIDATION_ERROR', errorMsg, undefined, 400);
      }

      // 4. Trace d'audit : webhook reçu & signature validée (ÉTAPE 10)
      await stores.audit.append({
        id: `audit_wh_sig_ok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`.slice(0, 120),
        actorId: `provider:${webhookResult.provider}`,
        timestamp: evaluatedAt,
        entityId: entityIdForAudit,
        action: PAYMENT_AUDIT_ACTIONS.signatureValidated,
        source: `webhook:${webhookResult.provider}`,
        beforeState: { provider: webhookResult.provider },
        afterState: {
          provider: webhookResult.provider,
          externalTransactionId: webhookResult.externalTransactionId,
          eventType: webhookResult.eventType,
          reference: webhookResult.reference,
          amount: webhookResult.amount,
          currency: webhookResult.currency,
        },
      }).catch(() => null);

      // 5. Exécution dans une transaction PostgreSQL unique
      return await inTransaction(async current => {
        const durableKey = `${webhookResult.provider}:webhook:${webhookResult.externalTransactionId}:${webhookResult.eventType}`;
        const fingerprint = await sha256Fingerprint(input.rawBody);

        // Idempotence & protection anti-replay durable (ÉTAPE 4, 7)
        const reservation = await reserve(current, {
          actorId: `provider:${webhookResult.provider}`,
          command: 'payments.WEBHOOK',
          key: durableKey,
          payload: fingerprint,
        });

        if (reservation === 'replay') {
          await appendAudit(current, {
            action: PAYMENT_AUDIT_ACTIONS.replayDetected,
            actorId: `provider:${webhookResult.provider}`,
            paymentId: entityIdForAudit,
            contractId: 'UNKNOWN',
            paymentType: 'SALARY',
            periodKey: 'UNKNOWN',
            timestamp: evaluatedAt,
            reference: durableKey,
            source: `webhook:${webhookResult.provider}`,
            beforeState: { provider: webhookResult.provider },
            afterState: {
              replayed: true,
              externalTransactionId: webhookResult.externalTransactionId,
              action: 'REPLAY',
            },
          });

          // Résolution de la ligne de paiement existante pour renvoyer son état
          let existingPayment: PaymentRecord | null = null;
          if (parsedBody.paymentId) {
            existingPayment = await current.payments.findById(parsedBody.paymentId as string);
          }
          if (!existingPayment && webhookResult.externalTransactionId) {
            existingPayment = await current.payments.findByExternalTransaction(webhookResult.provider, webhookResult.externalTransactionId);
          }
          if (!existingPayment && webhookResult.reference) {
            existingPayment = await current.payments.findByReference(webhookResult.reference);
          }

          return {
            accepted: true,
            provider: webhookResult.provider,
            externalTransactionId: webhookResult.externalTransactionId,
            paymentId: existingPayment?.paymentId,
            status: existingPayment?.status ?? 'UNKNOWN',
            action: 'REPLAY',
            replayed: true,
          };
        }

        // 6. Résolution du paiement cible
        let payment: PaymentRecord | null = null;
        if (parsedBody.paymentId) {
          payment = await current.payments.findById(parsedBody.paymentId as string);
        }
        if (!payment && webhookResult.reference) {
          payment = await current.payments.findByReference(webhookResult.reference);
          if (!payment) {
            const decls = await current.declarations.findByReference(webhookResult.reference);
            if (decls.length > 0) {
              payment = await current.payments.findById(decls[0].paymentId);
            }
          }
        }
        if (!payment && parsedBody.contractId && parsedBody.periodKey && parsedBody.paymentType) {
          const candidates = await current.payments.listByContract(parsedBody.contractId as string);
          payment = candidates.find(c => c.periodKey === parsedBody.periodKey && c.paymentType === parsedBody.paymentType) ?? null;
        }

        if (!payment) {
          await appendAudit(current, {
            action: PAYMENT_AUDIT_ACTIONS.duplicateDetected,
            actorId: `provider:${webhookResult.provider}`,
            paymentId: 'UNKNOWN',
            contractId: (parsedBody.contractId as string) ?? 'UNKNOWN',
            paymentType: 'SALARY',
            periodKey: (parsedBody.periodKey as string) ?? 'UNKNOWN',
            timestamp: evaluatedAt,
            reference: durableKey,
            source: `webhook:${webhookResult.provider}`,
            error: 'Paiement cible introuvable pour ce webhook.',
            beforeState: {},
            afterState: { externalTransactionId: webhookResult.externalTransactionId },
          });
          throw new ApiError('NOT_FOUND', 'Paiement cible introuvable pour cette transaction externe.', undefined, 404);
        }

        const paymentId = payment.paymentId;

        // 7. Détection de transaction dupliquée pour deux paiements différents (ÉTAPE 7)
        const conflictPayment = await current.payments.findByExternalTransaction(
          webhookResult.provider,
          webhookResult.externalTransactionId,
        );
        if (conflictPayment && conflictPayment.paymentId !== paymentId) {
          await appendAudit(current, {
            action: PAYMENT_AUDIT_ACTIONS.duplicateDetected,
            actorId: `provider:${webhookResult.provider}`,
            paymentId,
            contractId: payment.contractId,
            paymentType: payment.paymentType,
            periodKey: payment.periodKey,
            timestamp: evaluatedAt,
            reference: durableKey,
            source: `webhook:${webhookResult.provider}`,
            error: `Cette transaction externe ${webhookResult.externalTransactionId} est déjà associée au paiement ${conflictPayment.paymentId}.`,
            beforeState: { paymentId },
            afterState: { conflictPaymentId: conflictPayment.paymentId },
          });
          throw new ApiError('IDEMPOTENCY_CONFLICT', `Cette transaction externe est déjà associée à un autre paiement (${conflictPayment.paymentId}).`, undefined, 409);
        }

        const conflictDecl = await current.declarations.findByExternalTransaction(
          webhookResult.provider,
          webhookResult.externalTransactionId,
        );
        if (conflictDecl && conflictDecl.paymentId !== paymentId) {
          await appendAudit(current, {
            action: PAYMENT_AUDIT_ACTIONS.duplicateDetected,
            actorId: `provider:${webhookResult.provider}`,
            paymentId,
            contractId: payment.contractId,
            paymentType: payment.paymentType,
            periodKey: payment.periodKey,
            timestamp: evaluatedAt,
            reference: durableKey,
            source: `webhook:${webhookResult.provider}`,
            error: `Cette transaction externe a déjà été déclarée sur le paiement ${conflictDecl.paymentId}.`,
            beforeState: { paymentId },
            afterState: { conflictPaymentId: conflictDecl.paymentId },
          });
          throw new ApiError('IDEMPOTENCY_CONFLICT', 'Cette transaction externe a déjà été utilisée sur un autre paiement.', undefined, 409);
        }

        // Verrouillage pessimiste de la ligne du paiement cible
        const locked = await current.payments.findByIdForUpdate(paymentId);
        if (!locked) throw new ApiError('NOT_FOUND', 'Paiement introuvable.');

        // 8. Garde des statuts du cycle
        if (locked.status === 'SCHEDULED') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Paiement non encore exigible : statut courant « SCHEDULED ».', undefined, 409);
        }
        if (locked.status === 'PAID') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', PAYMENT_TERMINAL_REFUSAL_REASON, undefined, 409);
        }

        // 9. Validation métier de cohérence (montant, devise, parties)
        const mismatches: string[] = [];
        if (webhookResult.amount !== locked.amount) {
          mismatches.push(`Montant externe ${webhookResult.amount} ${webhookResult.currency} différent du montant dû ${locked.amount} ${locked.currency}.`);
        }
        if (webhookResult.currency.toUpperCase() !== locked.currency.toUpperCase()) {
          mismatches.push(`Devise externe ${webhookResult.currency} différente de la devise contractuelle ${locked.currency}.`);
        }
        if (locked.paymentType === 'PLATFORM_FEE' && webhookResult.recipient && webhookResult.recipient !== 'LE_LABEUR') {
          mismatches.push('La commission est due à LE LABEUR, jamais au salarié.');
        }
        if (locked.paymentType === 'SALARY' && webhookResult.recipient && webhookResult.recipient !== locked.candidateId) {
          mismatches.push(`Destinataire externe (${webhookResult.recipient}) différent du salarié attendu (${locked.candidateId}).`);
        }
        if (webhookResult.payer && webhookResult.payer !== locked.employerId) {
          mismatches.push(`Payeur externe (${webhookResult.payer}) différent de l’employeur (${locked.employerId}).`);
        }

        if (mismatches.length > 0) {
          const mismatchReason = `Vérification externe écartée : ${mismatches.join(' ')}`;
          if (locked.status === 'PENDING_VERIFICATION') {
            const rejectRule = PAYMENT_TRANSITION_RULES.REJECT_DECLARATION;
            const rejected = await current.payments.compareAndSetStatus(paymentId, rejectRule.from, {
              status: rejectRule.to,
              updatedAt: evaluatedAt,
              rejectedAt: evaluatedAt,
              rejectedBy: `provider:${webhookResult.provider}`,
              rejectionReason: mismatchReason,
            });

            if (locked.currentDeclarationId) {
              await current.declarations.compareAndSetOutcome(locked.currentDeclarationId, 'PENDING', {
                outcome: 'REJECTED',
                reviewedAt: evaluatedAt,
                reviewedBy: `provider:${webhookResult.provider}`,
                rejectionReason: mismatchReason,
                updatedAt: evaluatedAt,
              });
            }

            const eventId = await appendPaymentEvent(current, {
              payment: locked,
              eventType: 'PAYMENT_REJECTED',
              actorId: `provider:${webhookResult.provider}`,
              timestamp: evaluatedAt,
              payload: {
                verdict: 'MISMATCHED',
                reasons: mismatches,
                reason: mismatchReason,
                provider: webhookResult.provider,
                externalTransactionId: webhookResult.externalTransactionId,
              },
            });

            await projectToContract(current, {
              payment: locked,
              next: rejected ?? locked,
              timestamp: evaluatedAt,
              actorLabel: `provider:${webhookResult.provider}`,
              description: 'Déclaration rejetée après discordance du webhook externe',
              historyEvent: 'PAYMENT_REJECTED',
            });

            await appendAudit(current, {
              action: PAYMENT_AUDIT_ACTIONS.verificationMismatch,
              actorId: `provider:${webhookResult.provider}`,
              paymentId,
              contractId: locked.contractId,
              paymentType: locked.paymentType,
              periodKey: locked.periodKey,
              timestamp: evaluatedAt,
              eventId,
              reference: durableKey,
              source: `webhook:${webhookResult.provider}`,
              error: mismatchReason,
              beforeState: { status: locked.status },
              afterState: { status: 'REJECTED', verdict: 'MISMATCHED', reasons: mismatches },
            });

            await current.idempotency.complete(`provider:${webhookResult.provider}`, 'payments.WEBHOOK', durableKey, {
              status: 'REJECTED',
              verdict: 'MISMATCHED',
              reasons: mismatches,
            });

            return {
              accepted: true,
              provider: webhookResult.provider,
              externalTransactionId: webhookResult.externalTransactionId,
              paymentId,
              status: 'REJECTED',
              action: 'REJECTED',
              reasons: mismatches,
            };
          }

          // Si le paiement est DUE : refus de transition
          await appendAudit(current, {
            action: PAYMENT_AUDIT_ACTIONS.verificationMismatch,
            actorId: `provider:${webhookResult.provider}`,
            paymentId,
            contractId: locked.contractId,
            paymentType: locked.paymentType,
            periodKey: locked.periodKey,
            timestamp: evaluatedAt,
            reference: durableKey,
            source: `webhook:${webhookResult.provider}`,
            error: mismatchReason,
            beforeState: { status: locked.status },
            afterState: { status: locked.status, verdict: 'MISMATCHED', reasons: mismatches },
          });

          throw new ApiError('BUSINESS_RULE_VIOLATION', mismatchReason, undefined, 422);
        }

        // 10. Toutes les vérifications sont favorables : application des transitions
        let attemptNumber = locked.declarationCount + 1;
        let declarationId = paymentDeclarationId(paymentId, attemptNumber);

        if (locked.status === 'DUE' || locked.status === 'REJECTED') {
          // Étape 10.1 : DUE / REJECTED -> PENDING_VERIFICATION
          const declRule = PAYMENT_TRANSITION_RULES.DECLARE_PAYMENT;
          const patchDecl: PaymentTransitionPatch = {
            status: declRule.to,
            updatedAt: evaluatedAt,
            reference: webhookResult.reference,
            submittedAt: evaluatedAt,
            submittedBy: `provider:${webhookResult.provider}`,
            currentDeclarationId: declarationId,
            incrementDeclarationCount: true,
            externalTransactionId: webhookResult.externalTransactionId,
            provider: webhookResult.provider,
          };

          const declaredPayment = await current.payments.compareAndSetStatus(paymentId, declRule.from, patchDecl);
          if (!declaredPayment) {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une transition concurrente a modifié ce paiement.', undefined, 409);
          }

          await current.declarations.create({
            declarationId,
            paymentId,
            contractId: locked.contractId,
            periodKey: locked.periodKey,
            paymentType: locked.paymentType,
            attemptNumber,
            amount: webhookResult.amount,
            currency: webhookResult.currency,
            reference: webhookResult.reference,
            externalTransactionId: webhookResult.externalTransactionId,
            provider: webhookResult.provider,
            submittedAt: evaluatedAt,
            submittedBy: `provider:${webhookResult.provider}`,
            outcome: 'PENDING',
            idempotencyKey: durableKey,
            createdAt: evaluatedAt,
            updatedAt: evaluatedAt,
          });

          const declEventId = await appendPaymentEvent(current, {
            payment: locked,
            eventType: 'PAYMENT_DECLARED',
            actorId: `provider:${webhookResult.provider}`,
            timestamp: evaluatedAt,
            occurrence: attemptNumber,
            payload: {
              declarationId,
              reference: webhookResult.reference,
              provider: webhookResult.provider,
              externalTransactionId: webhookResult.externalTransactionId,
            },
          });

          await appendPaymentEvent(current, {
            payment: locked,
            eventType: 'PAYMENT_PENDING_VERIFICATION',
            actorId: `provider:${webhookResult.provider}`,
            timestamp: evaluatedAt,
            occurrence: attemptNumber,
            payload: {
              declarationId,
              provider: webhookResult.provider,
              externalTransactionId: webhookResult.externalTransactionId,
            },
          });

          await appendAudit(current, {
            action: PAYMENT_AUDIT_ACTIONS.submitted,
            actorId: `provider:${webhookResult.provider}`,
            paymentId,
            contractId: locked.contractId,
            paymentType: locked.paymentType,
            periodKey: locked.periodKey,
            timestamp: evaluatedAt,
            eventId: declEventId,
            reference: durableKey,
            source: `webhook:${webhookResult.provider}`,
            beforeState: { status: locked.status },
            afterState: { status: 'PENDING_VERIFICATION', declarationId },
          });
        } else {
          declarationId = locked.currentDeclarationId ?? paymentDeclarationId(paymentId, 1);
        }

        // Étape 10.2 : PENDING_VERIFICATION -> VERIFIED
        const verifyRule = PAYMENT_TRANSITION_RULES.VERIFY_DECLARATION;
        const verifiedPayment = await current.payments.compareAndSetStatus(paymentId, verifyRule.from, {
          status: verifyRule.to,
          updatedAt: evaluatedAt,
          verifiedAt: evaluatedAt,
          verifiedBy: `provider:${webhookResult.provider}`,
          externalTransactionId: webhookResult.externalTransactionId,
          provider: webhookResult.provider,
          reference: webhookResult.reference,
        });

        if (!verifiedPayment) {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Transition vers VERIFIED concurrente ou refusée.', undefined, 409);
        }

        await current.declarations.compareAndSetOutcome(declarationId, 'PENDING', {
          outcome: 'VERIFIED',
          reviewedAt: evaluatedAt,
          reviewedBy: `provider:${webhookResult.provider}`,
          updatedAt: evaluatedAt,
        });

        const verifiedEventId = await appendPaymentEvent(current, {
          payment: locked,
          eventType: 'PAYMENT_APPROVED',
          actorId: `provider:${webhookResult.provider}`,
          timestamp: evaluatedAt,
          occurrence: attemptNumber,
          payload: {
            declarationId,
            verdict: 'MATCHED',
            verifiedBy: `provider:${webhookResult.provider}`,
            verifiedAt: evaluatedAt,
            verificationSource: `provider:${webhookResult.provider}`,
            provider: webhookResult.provider,
            externalTransactionId: webhookResult.externalTransactionId,
            movedFunds: false,
          },
        });

        await projectToContract(current, {
          payment: locked,
          next: verifiedPayment,
          timestamp: evaluatedAt,
          actorLabel: `provider:${webhookResult.provider}`,
          description: 'Déclaration vérifiée via webhook externe',
          historyEvent: 'PAYMENT_VERIFIED',
        });

        await appendAudit(current, {
          action: PAYMENT_AUDIT_ACTIONS.verified,
          actorId: `provider:${webhookResult.provider}`,
          paymentId,
          contractId: locked.contractId,
          paymentType: locked.paymentType,
          periodKey: locked.periodKey,
          timestamp: evaluatedAt,
          eventId: verifiedEventId,
          reference: durableKey,
          source: `webhook:${webhookResult.provider}`,
          beforeState: { status: locked.status, declarationId },
          afterState: {
            status: verifiedPayment.status,
            provider: webhookResult.provider,
            externalTransactionId: webhookResult.externalTransactionId,
            verdict: 'MATCHED',
            movedFunds: false,
          },
        });

        await current.idempotency.complete(`provider:${webhookResult.provider}`, 'payments.WEBHOOK', durableKey, {
          status: 'VERIFIED',
          provider: webhookResult.provider,
          externalTransactionId: webhookResult.externalTransactionId,
        });

        // ARRÊT STRICT À VERIFIED : aucun saut vers PAID sans rapprochement explicite
        return {
          accepted: true,
          provider: webhookResult.provider,
          externalTransactionId: webhookResult.externalTransactionId,
          paymentId: locked.paymentId,
          status: verifiedPayment.status,
          action: 'VERIFIED',
        };
      });
    },

    /* -------------------------------------------------------------- */
    /* P0-PAY-2 — Rapprochement explicite (LE LABEUR vs Externe)      */
    /* -------------------------------------------------------------- */
    async reconcilePayment(actor, paymentId, asOf): Promise<NormalizedReconciliationResult> {
      const trusted = requireTrustedActor(actor);
      if (trusted.role !== 'ADMIN' && !trusted.permissions.includes('payments:read:any')) {
        throw new ApiError('FORBIDDEN', 'Permission payments:read:any requise.');
      }

      const timestamp = asOf ?? now().toISOString();
      return await inTransaction(async current => {
        const payment = await current.payments.findById(paymentId);
        if (!payment) throw new ApiError('NOT_FOUND', 'Paiement introuvable.');

        const declaration = payment.currentDeclarationId
          ? await current.declarations.findById(payment.currentDeclarationId)
          : (await current.declarations.listByPayment(paymentId))[0];

        const providerId = payment.provider ?? declaration?.provider ?? 'TEST_GATEWAY';
        const adapter = getAdapter(providerId);

        const extTx = payment.externalTransactionId ?? declaration?.externalTransactionId;
        let isDuplicate = false;
        if (extTx) {
          const otherPay = await current.payments.findByExternalTransaction(providerId, extTx);
          if (otherPay && otherPay.paymentId !== paymentId) isDuplicate = true;
        }

        const recResult = await adapter.reconcile({
          payment,
          ...(declaration ? { declaration } : {}),
          ...(extTx ? { externalTransactionId: extTx } : {}),
          asOf: timestamp,
          isDuplicate,
        });

        const auditAction = recResult.verdict === 'MATCH'
          ? PAYMENT_AUDIT_ACTIONS.reconciled
          : recResult.verdict === 'DUPLICATE'
            ? PAYMENT_AUDIT_ACTIONS.duplicateDetected
            : PAYMENT_AUDIT_ACTIONS.reconciliationMismatch;

        await appendAudit(current, {
          action: auditAction,
          actorId: trusted.id,
          paymentId,
          contractId: payment.contractId,
          paymentType: payment.paymentType,
          periodKey: payment.periodKey,
          timestamp,
          reference: `reconcile:${paymentId}`,
          source: `reconciliation:${providerId}`,
          beforeState: { status: payment.status },
          afterState: {
            verdict: recResult.verdict,
            comparisons: recResult.comparisons,
            reasons: recResult.reasons,
            externalTransactionId: recResult.externalTransactionId,
          },
          error: recResult.reasons.length > 0 ? recResult.reasons.join(' ') : undefined,
        });

        return recResult;
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Handlers API — domaine PAIEMENT uniquement                            */
/* ------------------------------------------------------------------ */

async function readJsonBody(context: ApiRouteContext): Promise<Record<string, unknown>> {
  const raw = await context.request.text();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object expected');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('VALIDATION_ERROR', 'Corps de requête JSON invalide.');
  }
}

export function createPaymentApiHandlers(
  repository: OpenPaymentRepository,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'payments.mine.list': async context => repository.getMyPayments(
      context.actor!,
      context.page ?? { cursor: null, limit: DEFAULT_PAGE_LIMIT },
    ),

    'payments.read': async context => {
      const payment = await repository.getPayment(context.actor!, context.params.paymentId);
      if (!payment) throw new ApiError('NOT_FOUND', 'Ressource introuvable.');
      return payment;
    },

    'payments.contract.list': async context => repository.getContractPayments(
      context.actor!,
      context.params.contractId,
      context.page ?? { cursor: null, limit: DEFAULT_PAGE_LIMIT },
    ),

    'payments.commission.declare': async context => apiJsonResponse(
      await repository.declarePayment(context.actor!, 'PLATFORM_FEE', await readJsonBody(context), context.command!),
      201,
      context.requestId,
    ),

    'payments.salary.declare': async context => apiJsonResponse(
      await repository.declarePayment(context.actor!, 'SALARY', await readJsonBody(context), context.command!),
      201,
      context.requestId,
    ),

    'admin.payments.list': async context => repository.getAdminPayments(
      context.actor!,
      context.page ?? { cursor: null, limit: DEFAULT_PAGE_LIMIT },
    ),

    'admin.payments.approve': async context => apiJsonResponse(
      await repository.verifyPayment(context.actor!, context.params.paymentId, context.command!),
      200,
      context.requestId,
    ),

    'admin.payments.confirm': async context => apiJsonResponse(
      await repository.confirmPaymentPaid(context.actor!, context.params.paymentId, context.command!),
      200,
      context.requestId,
    ),

    'admin.payments.reject': async context => {
      const body = await readJsonBody(context);
      return apiJsonResponse(
        await repository.rejectPayment(
          context.actor!,
          context.params.paymentId,
          typeof body.reason === 'string' ? body.reason : '',
          context.command!,
        ),
        200,
        context.requestId,
      );
    },

    // P0-PAY-2 — Webhook sécurisé fournisseur de paiement externe
    'webhooks.payment-provider.root': async context => {
      const rawBody = await context.request.text();
      const headers = Object.fromEntries(context.request.headers.entries());
      const outcome = await repository.processPaymentWebhook({
        headers,
        rawBody,
        url: context.url.toString(),
        requestId: context.requestId,
      });
      return apiJsonResponse(outcome, 200, context.requestId);
    },

    'webhooks.payment-provider': async context => {
      const rawBody = await context.request.text();
      const headers = Object.fromEntries(context.request.headers.entries());
      const outcome = await repository.processPaymentWebhook({
        headers,
        rawBody,
        url: context.url.toString(),
        requestId: context.requestId,
      });
      return apiJsonResponse(outcome, 200, context.requestId);
    },

    // P0-PAY-2 — Rapprochement explicite déclenché par un administrateur
    'admin.payments.reconcile': async context => {
      const body = await readJsonBody(context);
      const asOf = typeof body.asOf === 'string' ? body.asOf : undefined;
      const result = await repository.reconcilePayment(context.actor!, context.params.paymentId, asOf);
      return apiJsonResponse(result, 200, context.requestId);
    },

    // P0-PAY-1 — l'avancement mensuel est une commande du CYCLE PAIEMENTS. La
    // route `contracts.monthly-action` (points de contrôle et confirmations
    // bilatérales START/CONFIRM_*, hors périmètre) reste volontairement fermée :
    // lui donner un handler reviendrait à ouvrir le cycle des confirmations.
    'payments.advance-month': async context => apiJsonResponse(
      await repository.advanceContractMonth(context.actor!, context.params.contractId, context.command!),
      200,
      context.requestId,
    ),
  };
}
