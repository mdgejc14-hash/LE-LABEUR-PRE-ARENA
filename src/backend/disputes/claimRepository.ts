/**
 * LE LABEUR — P0-DISPUTE-1 — production Claim repository.
 *
 * Les contrats/paiements/users sont la source d'autorité. Acteur depuis la
 * session, relations résolues en base, mutation + Outbox + audit + idempotence
 * dans une transaction PostgreSQL unique. Ce module ne touche jamais aux fonds.
 */

import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteKey } from '../api/routeContracts';
import type { ApiRouteContext, ApiRouteHandler } from '../api/worker';
import { createDomainEvent } from '../automation/foundation';
import type { AutomationStores } from '../automation/records';
import { newEntityId } from '../identity/ids';
import type { UserStore } from '../identity/stores';
import type { ContractStore } from '../persistence/coreRecords';
import type { PaymentStore } from '../persistence/paymentRecords';
import type { SqlQueryExecutor } from '../services/database';
import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import { sha256Fingerprint } from '../payments/paymentErrors';
import type { ClaimEvidenceDeadlineConfiguration } from './config';
import {
  CLAIM_EVIDENCE_TYPE_VALUES,
  CLAIM_OPEN_STATUSES,
  CLAIM_TERMINAL_STATUSES,
  CLAIM_TYPE_VALUES,
  type ClaimEvidenceRequestRecord,
  type ClaimEvidenceType,
  type ClaimRecord,
  type ClaimRestrictionRecord,
  type ClaimRestrictionScope,
  type ClaimStatus,
  type ClaimStore,
  type ClaimType,
} from './records';

export const CLAIM_API_SOURCE = 'api:P0-DISPUTE-1';
export const CLAIM_SYSTEM_SOURCE = 'automation:P0-DISPUTE-1';
export const CLAIM_EVENT_TYPES = [
  'CLAIM_CREATED',
  'CLAIM_EVIDENCE_REQUESTED',
  'CLAIM_EVIDENCE_SUBMITTED',
  'CLAIM_DEADLINE_REACHED',
  'CLAIM_ESCALATED',
  'CLAIM_RESTRICTION_APPLIED',
  'CLAIM_RESTRICTION_RELEASED',
  'CLAIM_RESOLVED',
  'CLAIM_REJECTED',
] as const;

const MAX_REASON_LENGTH = 1000;
const MAX_REFERENCE_LENGTH = 500;
const MAX_PAGE_LIMIT = 100;
const AUTOMATION_IDEMPOTENCY_ACTOR = 'SYSTEM';

export interface CreateClaimInput {
  contractId: string;
  paymentId?: string;
  type: ClaimType;
  reason: string;
  evidenceReference?: string;
}

export interface SubmitClaimEvidenceInput {
  evidenceReference: string;
}

export interface AdminClaimEvidenceInput {
  requestedFrom?: string;
  requestedType: ClaimEvidenceType;
}

export interface AdminClaimDecisionInput {
  decision: 'RESOLVE' | 'REJECT';
  resolution: string;
}

export interface ClaimView extends ClaimRecord {
  evidenceRequests: ClaimEvidenceRequestRecord[];
  restrictions: ClaimRestrictionRecord[];
}

export interface ClaimRepositoryStores {
  claims: ClaimStore;
  contracts: ContractStore;
  payments: PaymentStore;
  users: UserStore;
  automation: AutomationStores;
  /** Same SQL transaction as the stores above, for existing salary-confirmation and contract linkage rows. */
  sql: SqlQueryExecutor;
}

export interface ClaimRepositoryDependencies {
  stores: ClaimRepositoryStores;
  runInTransaction?: <T>(operation: (stores: ClaimRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
  evidenceDeadlineMs?: number | null;
  evidenceDeadlineConfiguration?: ClaimEvidenceDeadlineConfiguration;
}

export interface OpenClaimRepository {
  listMine(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<ClaimView>>;
  get(actor: AuthenticatedActor, claimId: string): Promise<ClaimView>;
  create(actor: AuthenticatedActor, input: CreateClaimInput, command: ProductionCommandContext): Promise<ClaimView>;
  submitEvidence(actor: AuthenticatedActor, claimId: string, evidenceRequestId: string, input: SubmitClaimEvidenceInput, command: ProductionCommandContext): Promise<ClaimView>;
  listAdmin(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<ClaimView>>;
  getAdmin(actor: AuthenticatedActor, claimId: string): Promise<ClaimView>;
  review(actor: AuthenticatedActor, claimId: string, note: string | undefined, command: ProductionCommandContext): Promise<ClaimView>;
  requestEvidence(actor: AuthenticatedActor, claimId: string, input: AdminClaimEvidenceInput, command: ProductionCommandContext): Promise<ClaimView>;
  decide(actor: AuthenticatedActor, claimId: string, input: AdminClaimDecisionInput, command: ProductionCommandContext): Promise<ClaimView>;
  applyRestriction(actor: AuthenticatedActor, claimId: string, reason: string, command: ProductionCommandContext): Promise<ClaimRestrictionRecord>;
  releaseRestriction(actor: AuthenticatedActor, claimId: string, restrictionId: string, reason: string, command: ProductionCommandContext): Promise<ClaimRestrictionRecord>;
}

function requireActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}

function requirePartyRole(actor: AuthenticatedActor): void {
  if (actor.role !== 'CANDIDATE' && actor.role !== 'EMPLOYER') {
    throw new ApiError('FORBIDDEN', 'Seules les parties du contrat peuvent déposer ou consulter un Claim.');
  }
}

function requireAdminRole(actor: AuthenticatedActor): void {
  if (actor.role !== 'ADMIN') throw new ApiError('FORBIDDEN', 'Accès réservé à l’administration.');
}

function requireText(value: unknown, label: string, minLength: number, maxLength: number): string {
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', `${label} doit être du texte.`);
  const result = value.trim();
  if (result.length < minLength || result.length > maxLength) {
    throw new ApiError('VALIDATION_ERROR', `${label} doit contenir entre ${minLength} et ${maxLength} caractères.`);
  }
  return result;
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', `${label} doit être du texte.`);
  const result = value.trim();
  if (!result) return undefined;
  if (result.length > maxLength) throw new ApiError('VALIDATION_ERROR', `${label} ne doit pas dépasser ${maxLength} caractères.`);
  return result;
}

function normalizeCreateInput(value: CreateClaimInput): CreateClaimInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile du Claim est invalide.');
  }
  if (!(CLAIM_TYPE_VALUES as readonly unknown[]).includes(value.type)) {
    throw new ApiError('VALIDATION_ERROR', 'Le type de Claim est invalide.');
  }
  const contractId = requireText(value.contractId, 'contractId', 1, 128);
  const paymentId = optionalText(value.paymentId, 'paymentId', 128);
  const reason = requireText(value.reason, 'reason', 3, MAX_REASON_LENGTH);
  const evidenceReference = optionalText(value.evidenceReference, 'evidenceReference', MAX_REFERENCE_LENGTH);
  if ((value.type === 'SALARY_NOT_RECEIVED' || value.type === 'PAYMENT_DISPUTE') && !paymentId) {
    throw new ApiError('VALIDATION_ERROR', 'Un paiement existant est requis pour ce type de Claim.');
  }
  if ((value.type === 'CONTRACT_INCIDENT' || value.type === 'OTHER_REVIEW_REQUIRED') && paymentId) {
    throw new ApiError('VALIDATION_ERROR', 'Ce type de Claim doit être rattaché au contrat, sans paymentId.');
  }
  return { contractId, ...(paymentId ? { paymentId } : {}), type: value.type, reason, ...(evidenceReference ? { evidenceReference } : {}) };
}

function normalizeEvidenceType(value: unknown): ClaimEvidenceType {
  if (!(CLAIM_EVIDENCE_TYPE_VALUES as readonly unknown[]).includes(value)) {
    throw new ApiError('VALIDATION_ERROR', 'Le type de preuve demandé est invalide.');
  }
  return value as ClaimEvidenceType;
}

function normalizeDecision(value: AdminClaimDecisionInput): AdminClaimDecisionInput {
  if (!value || (value.decision !== 'RESOLVE' && value.decision !== 'REJECT')) {
    throw new ApiError('VALIDATION_ERROR', 'La décision doit être RESOLVE ou REJECT.');
  }
  return { decision: value.decision, resolution: requireText(value.resolution, 'resolution', 3, MAX_REASON_LENGTH) };
}

function mapUniqueConflict(error: unknown): never {
  const code = error !== null && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === '23505') {
    throw new ApiError('BUSINESS_RULE_VIOLATION', 'Un Claim actif ou une demande de preuve équivalente existe déjà.', undefined, 409);
  }
  throw error;
}

function requireCommand(command: ProductionCommandContext | null | undefined): ProductionCommandContext {
  if (!command?.idempotencyKey?.trim() || !command.command) {
    throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
  }
  return command;
}

function isPartyClaim(claim: ClaimRecord, actorId: string): boolean {
  return claim.claimantId === actorId || claim.respondentId === actorId;
}

function isClaimOpen(status: ClaimStatus): boolean {
  return (CLAIM_OPEN_STATUSES as readonly ClaimStatus[]).includes(status);
}

function isClaimTerminal(status: ClaimStatus): boolean {
  return (CLAIM_TERMINAL_STATUSES as readonly ClaimStatus[]).includes(status);
}

function nextEvidenceDeadline(now: Date, deadlineMs: number | null | undefined): string | undefined {
  if (deadlineMs === null || deadlineMs === undefined) return undefined;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'La durée de réponse configurée pour les preuves est invalide.');
  }
  const dueAt = new Date(now.getTime() + deadlineMs);
  if (!Number.isFinite(dueAt.getTime())) throw new ApiError('SERVICE_UNAVAILABLE', 'La durée de réponse configurée est hors limites.');
  return dueAt.toISOString();
}

function makeEvidenceType(claim: ClaimRecord): ClaimEvidenceType {
  if (claim.type === 'SALARY_NOT_RECEIVED' || claim.type === 'PAYMENT_DISPUTE') return 'PAYMENT_PROOF';
  if (claim.type === 'CONTRACT_INCIDENT') return 'CONTRACT_EVIDENCE';
  return 'SUPPORTING_EVIDENCE';
}

function evidenceDeadlineFromInput(
  input: { evidenceRequestId: string; dueAt?: string; createdAt: string },
  deadlineMs: number | null | undefined,
): string | undefined {
  const clock = new Date(input.createdAt);
  return nextEvidenceDeadline(clock, deadlineMs);
}

export function createClaimRepository(dependencies: ClaimRepositoryDependencies): OpenClaimRepository {
  const { stores, runInTransaction } = dependencies;
  const clock = dependencies.now ?? (() => new Date());
  const deadlineMs = dependencies.evidenceDeadlineMs;
  const ensureDeadlineConfigurationValid = () => {
    const configuration = dependencies.evidenceDeadlineConfiguration;
    if (configuration && !configuration.valid) {
      throw new ApiError('SERVICE_UNAVAILABLE', configuration.detail, undefined, 503);
    }
  };

  const inTransaction = <T>(operation: (current: ClaimRepositoryStores) => Promise<T>): Promise<T> =>
    runInTransaction ? runInTransaction(operation) : operation(stores);

  const requireAccount = async (current: ClaimRepositoryStores, actor: AuthenticatedActor, admin = false): Promise<void> => {
    const user = await current.users.findByIdForShare(actor.id);
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
    if (user.role !== actor.role) throw new ApiError('FORBIDDEN', 'Le rôle de la session ne correspond plus au compte.');
    if (user.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'Compte non actif : cette opération Claim est indisponible.');
    if (admin ? user.role !== 'ADMIN' : user.role !== 'CANDIDATE' && user.role !== 'EMPLOYER') {
      throw new ApiError('FORBIDDEN', admin ? 'Accès réservé à l’administration.' : 'Seules les parties du contrat peuvent agir sur un Claim.');
    }
  };

  const view = async (current: ClaimRepositoryStores, claim: ClaimRecord): Promise<ClaimView> => ({
    ...claim,
    evidenceRequests: await current.claims.listEvidenceRequests(claim.claimId),
    restrictions: await current.claims.listRestrictions(claim.claimId),
  });

  const reserve = async <T>(
    current: ClaimRepositoryStores,
    actorId: string,
    command: ProductionCommandContext,
    payload: unknown,
  ): Promise<{ replay: true; result: T } | { replay: false }> => {
    const outcome = await current.automation.idempotency.reserve({
      actorId,
      command: command.command,
      key: command.idempotencyKey,
      payloadHash: await sha256Fingerprint(JSON.stringify(payload)),
    });
    if (outcome.kind === 'conflict') {
      throw new ApiError('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée avec une charge utile différente.', undefined, 409);
    }
    if (outcome.kind === 'in-progress') {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une commande concurrente traite déjà ce Claim : rejouez la requête.', undefined, 409);
    }
    if (outcome.kind === 'replay') return { replay: true, result: outcome.result as T };
    return { replay: false };
  };

  const complete = async (
    current: ClaimRepositoryStores,
    actorId: string,
    command: ProductionCommandContext,
    result: unknown,
  ): Promise<void> => current.automation.idempotency.complete(
    actorId,
    command.command,
    command.idempotencyKey,
    result,
  );

  const audit = async (
    current: ClaimRepositoryStores,
    input: {
      claimId: string;
      actorId: string;
      at: string;
      action: string;
      command?: ProductionCommandContext;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
    },
  ): Promise<void> => {
    await current.automation.audit.append({
      id: newEntityId('rev'),
      actorId: input.actorId,
      timestamp: input.at,
      entityId: input.claimId,
      action: input.action,
      source: CLAIM_API_SOURCE,
      ...(input.command ? { reference: input.command.idempotencyKey } : {}),
      ...(input.beforeState ? { beforeState: input.beforeState } : {}),
      ...(input.afterState ? { afterState: input.afterState } : {}),
    });
  };

  const outbox = async (
    current: ClaimRepositoryStores,
    input: {
      eventId: string;
      eventType: (typeof CLAIM_EVENT_TYPES)[number];
      claimId: string;
      actorId: string;
      at: string;
      payload: Record<string, unknown>;
      source: string;
      command?: ProductionCommandContext;
    },
  ): Promise<void> => {
    await current.automation.outbox.append(createDomainEvent({
      eventId: input.eventId,
      eventType: input.eventType,
      aggregateType: 'CLAIM',
      aggregateId: input.claimId,
      actorId: input.actorId,
      timestamp: input.at,
      payload: input.payload,
      source: input.source,
      correlationId: input.command?.requestId,
      causationId: input.command?.idempotencyKey,
    }));
  };

  const requirePartyOfClaim = async (
    current: ClaimRepositoryStores,
    actor: AuthenticatedActor,
    claim: ClaimRecord,
  ): Promise<void> => {
    if (!isPartyClaim(claim, actor.id)) throw new ApiError('FORBIDDEN', 'Vous n’êtes pas partie à ce Claim.');
    const contract = await current.contracts.findById(claim.contractId);
    if (!contract) throw new ApiError('NOT_FOUND', 'Contrat du Claim introuvable.');
    const partyRole = actor.id === claim.claimantId || actor.id === claim.respondentId;
    const matchesContract = actor.id === contract.employerId
      ? actor.role === 'EMPLOYER'
      : actor.id === contract.employeeId && actor.role === 'CANDIDATE';
    if (!partyRole || !matchesContract) throw new ApiError('FORBIDDEN', 'L’identité du compte ne correspond pas à une partie du contrat.');
  };

  const loadClaimView = async (current: ClaimRepositoryStores, claimId: string): Promise<ClaimView> => {
    const claim = await current.claims.findClaim(claimId);
    if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
    return view(current, claim);
  };

  const cancelPendingEvidenceAndJobs = async (
    current: ClaimRepositoryStores,
    claim: ClaimRecord,
    at: string,
    actorId: string,
    reason: string,
  ): Promise<void> => {
    const requests = await current.claims.listEvidenceRequests(claim.claimId);
    for (const request of requests) {
      if (request.status === 'PENDING') {
        await current.claims.transitionEvidenceRequest({
          evidenceRequestId: request.evidenceRequestId,
          expected: ['PENDING'],
          status: 'CANCELLED',
          at,
          submittedAt: null,
          evidenceReference: null,
        });
      }
      const deadlineId = `claim-evidence-deadline:${request.evidenceRequestId}`;
      const deadline = await current.automation.deadlines.findById(deadlineId);
      if (deadline) {
        await current.automation.deadlines.compareAndSetStatus(deadline.id, ['OPEN', 'OVERDUE'], {
          status: 'CANCELLED',
          at,
        });
      }
      const job = await current.automation.jobs.findByIdempotencyKey(`claim-evidence-job:${request.evidenceRequestId}`);
      if (job) {
        await current.automation.jobs.compareAndSetStatus(job.jobId, ['PENDING', 'RETRYABLE'], {
          status: 'COMPLETED',
          at,
        });
      }
    }
    await current.claims.releaseActiveRestrictionsForClaim({ claimId: claim.claimId, actorId, reason, at });
  };

  const linkContractIncident = async (
    current: ClaimRepositoryStores,
    contractId: string,
    claimId: string,
    at: string,
  ): Promise<void> => {
    const linked = await current.sql.query<{ id: string }>(
      `UPDATE contracts SET incident_id = $2, updated_at = $3
        WHERE id = $1 AND incident_id IS NULL
        RETURNING id`,
      [contractId, claimId, at],
    );
    if (linked.rows.length !== 1) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le contrat possède déjà un lien incident actif.', undefined, 409);
    }
  };

  const clearContractIncidentLink = async (
    current: ClaimRepositoryStores,
    claim: ClaimRecord,
    at: string,
  ): Promise<void> => {
    if (claim.type !== 'CONTRACT_INCIDENT') return;
    await current.sql.query(
      `UPDATE contracts SET incident_id = NULL, updated_at = $3
        WHERE id = $1 AND incident_id = $2`,
      [claim.contractId, claim.claimId, at],
    );
  };

  const cancelRequestDeadline = async (
    current: ClaimRepositoryStores,
    evidenceRequestId: string,
    at: string,
  ): Promise<void> => {
    const deadline = await current.automation.deadlines.findById(`claim-evidence-deadline:${evidenceRequestId}`);
    if (deadline) {
      await current.automation.deadlines.compareAndSetStatus(deadline.id, ['OPEN', 'OVERDUE'], { status: 'MET', at });
    }
    const job = await current.automation.jobs.findByIdempotencyKey(`claim-evidence-job:${evidenceRequestId}`);
    if (job) {
      await current.automation.jobs.compareAndSetStatus(job.jobId, ['PENDING', 'RETRYABLE'], { status: 'COMPLETED', at });
    }
  };

  const pageClaims = async (
    current: ClaimRepositoryStores,
    records: ClaimRecord[],
    page: PageRequest,
  ): Promise<CursorPage<ClaimView>> => {
    const hasMore = records.length > page.limit;
    const visible = records.slice(0, page.limit);
    return {
      items: await Promise.all(visible.map(record => view(current, record))),
      cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].claimId : null,
      limit: page.limit,
      hasMore,
    };
  };

  const executeCommand = async <T>(
    actorId: string,
    command: ProductionCommandContext,
    payload: unknown,
    operation: (current: ClaimRepositoryStores, at: string) => Promise<T>,
  ): Promise<T> => {
    requireCommand(command);
    try {
      return await inTransaction(async current => {
        const reservation = await reserve<T>(current, actorId, command, payload);
        if (reservation.replay) return reservation.result;
        const at = clock().toISOString();
        const result = await operation(current, at);
        await complete(current, actorId, command, result);
        return result;
      });
    } catch (error) {
      return mapUniqueConflict(error);
    }
  };

  const createEvidenceRequest = async (
    current: ClaimRepositoryStores,
    claim: ClaimRecord,
    input: { requestedFrom: string; requestedBy: string; requestedType: ClaimEvidenceType; at: string },
  ): Promise<ClaimEvidenceRequestRecord> => {
    const evidenceRequestId = newEntityId('evr');
    const dueAt = evidenceDeadlineFromInput({ evidenceRequestId, createdAt: input.at }, deadlineMs);
    return current.claims.createEvidenceRequest({
      evidenceRequestId,
      claimId: claim.claimId,
      requestedFrom: input.requestedFrom,
      requestedBy: input.requestedBy,
      requestedType: input.requestedType,
      status: 'PENDING',
      createdAt: input.at,
      ...(dueAt ? { dueAt } : {}),
    });
  };

  return {
    async listMine(suppliedActor, page) {
      const actor = requireActor(suppliedActor);
      requirePartyRole(actor);
      await requireAccount(stores, actor);
      return pageClaims(stores, await stores.claims.listForParty(actor.id, page.limit + 1, page.cursor), page);
    },

    async get(suppliedActor, claimId) {
      const actor = requireActor(suppliedActor);
      requirePartyRole(actor);
      await requireAccount(stores, actor);
      const claim = await stores.claims.findClaim(claimId);
      if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
      await requirePartyOfClaim(stores, actor, claim);
      return view(stores, claim);
    },

    async create(suppliedActor, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requirePartyRole(actor);
      const command = requireCommand(suppliedCommand);
      const input = normalizeCreateInput(suppliedInput);
      const payload = { ...input };
      return executeCommand(actor.id, command, payload, async (current, at) => {
        await requireAccount(current, actor);
        // Lock order mirrors the payment repository (payment → contract) to
        // avoid a claim/payment-transition deadlock under concurrent requests.
        const payment = input.paymentId ? await current.payments.findByIdForUpdate(input.paymentId) : null;
        if (input.paymentId && !payment) throw new ApiError('NOT_FOUND', 'Paiement introuvable.');
        const contract = await current.contracts.findByIdForUpdate(input.contractId);
        if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
        const isEmployer = contract.employerId === actor.id && actor.role === 'EMPLOYER';
        const isCandidate = contract.employeeId === actor.id && actor.role === 'CANDIDATE';
        if (!isEmployer && !isCandidate) throw new ApiError('FORBIDDEN', 'Seules les parties persistées du contrat peuvent créer un Claim.');
        if (input.type === 'CONTRACT_INCIDENT' && contract.status !== 'ACTIVE' && contract.status !== 'SUSPENDED') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Un incident contractuel ne peut être lié qu’à un contrat actif ou suspendu.', undefined, 409);
        }

        let paymentId: string | undefined;
        let salaryConfirmationId: string | undefined;
        if (payment) {
          if (payment.contractId !== contract.id
            || payment.employerId !== contract.employerId
            || payment.candidateId !== contract.employeeId) {
            throw new ApiError('FORBIDDEN', 'Le paiement n’est pas rattaché aux parties de ce contrat.');
          }
          if (input.type === 'SALARY_NOT_RECEIVED' && payment.paymentType !== 'SALARY') {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Un Claim de salaire doit cibler un paiement SALARY.', undefined, 409);
          }
          paymentId = payment.paymentId;
          if (payment.paymentType === 'SALARY') {
            const confirmation = await current.sql.query<{ payment_id: string }>(
              `SELECT payment_id FROM salary_confirmations
                WHERE payment_id = $1 AND contract_id = $2 AND candidate_id = $3 AND employer_id = $4
                FOR UPDATE`,
              [payment.paymentId, contract.id, contract.employeeId, contract.employerId],
            );
            if (confirmation.rows[0]) salaryConfirmationId = confirmation.rows[0].payment_id;
          }
        }

        const existing = await current.claims.findActiveClaimForTarget(contract.id, paymentId);
        if (existing) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Un Claim est déjà ouvert pour cette cible.', undefined, 409);

        const claimId = newEntityId('clm');
        const claim = await current.claims.createClaim({
          claimId,
          contractId: contract.id,
          ...(paymentId ? { paymentId } : {}),
          ...(salaryConfirmationId ? { salaryConfirmationId } : {}),
          claimantId: actor.id,
          respondentId: isEmployer ? contract.employeeId : contract.employerId,
          type: input.type,
          reason: input.reason,
          status: 'OPEN',
          createdAt: at,
          ...(input.evidenceReference ? { evidenceReference: input.evidenceReference } : {}),
          metadata: { evidenceReferenceKind: input.evidenceReference ? 'REFERENCE_ONLY' : null },
          idempotencyKey: command.idempotencyKey,
        });
        if (input.type === 'CONTRACT_INCIDENT') await linkContractIncident(current, contract.id, claim.claimId, at);

        await outbox(current, {
          eventId: `claim-created:${claim.claimId}`,
          eventType: 'CLAIM_CREATED',
          claimId: claim.claimId,
          actorId: actor.id,
          at,
          payload: { claimId: claim.claimId, contractId: claim.contractId, ...(claim.paymentId ? { paymentId: claim.paymentId } : {}), type: claim.type },
          source: CLAIM_API_SOURCE,
          command,
        });
        await audit(current, {
          claimId: claim.claimId,
          actorId: actor.id,
          at,
          action: 'CLAIM_CREATED',
          command,
          afterState: { status: claim.status, type: claim.type, contractId: claim.contractId, ...(claim.paymentId ? { paymentId: claim.paymentId } : {}) },
        });
        return view(current, claim);
      });
    },

    async submitEvidence(suppliedActor, claimId, evidenceRequestId, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requirePartyRole(actor);
      const command = requireCommand(suppliedCommand);
      const evidenceReference = requireText(suppliedInput?.evidenceReference, 'evidenceReference', 1, MAX_REFERENCE_LENGTH);
      const payload = { claimId, evidenceRequestId, evidenceReference };
      return executeCommand(actor.id, command, payload, async (current, at) => {
        await requireAccount(current, actor);
        const claim = await current.claims.findClaimForUpdate(claimId);
        if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
        await requirePartyOfClaim(current, actor, claim);
        if (!isClaimOpen(claim.status) || claim.status !== 'EVIDENCE_REQUESTED') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le Claim n’attend pas de preuve.', undefined, 409);
        }
        const request = await current.claims.findEvidenceRequestForUpdate(evidenceRequestId);
        if (!request || request.claimId !== claim.claimId) throw new ApiError('NOT_FOUND', 'Demande de preuve introuvable.');
        if (request.requestedFrom !== actor.id) throw new ApiError('FORBIDDEN', 'Cette preuve a été demandée à l’autre partie.');
        if (request.status !== 'PENDING') throw new ApiError('BUSINESS_RULE_VIOLATION', 'La demande de preuve n’est plus ouverte.', undefined, 409);
        if (request.dueAt && Date.parse(request.dueAt) <= Date.parse(at)) {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le délai de réponse est dépassé; le Claim sera examiné par ADMIN.', undefined, 409);
        }

        const submitted = await current.claims.transitionEvidenceRequest({
          evidenceRequestId: request.evidenceRequestId,
          expected: ['PENDING'],
          status: 'SUBMITTED',
          at,
          submittedAt: at,
          evidenceReference,
        });
        if (!submitted) throw new ApiError('BUSINESS_RULE_VIOLATION', 'La demande de preuve a été modifiée par une requête concurrente.', undefined, 409);
        const updated = await current.claims.transitionClaim({
          claimId: claim.claimId,
          expected: ['EVIDENCE_REQUESTED'],
          status: 'UNDER_REVIEW',
          at,
          dueAt: null,
          evidenceReference,
        });
        if (!updated) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le Claim a été modifié par une requête concurrente.', undefined, 409);
        await cancelRequestDeadline(current, request.evidenceRequestId, at);
        await outbox(current, {
          eventId: `claim-evidence-submitted:${request.evidenceRequestId}`,
          eventType: 'CLAIM_EVIDENCE_SUBMITTED',
          claimId: claim.claimId,
          actorId: actor.id,
          at,
          payload: { claimId: claim.claimId, evidenceRequestId: request.evidenceRequestId },
          source: CLAIM_API_SOURCE,
          command,
        });
        await audit(current, {
          claimId: claim.claimId,
          actorId: actor.id,
          at,
          action: 'CLAIM_EVIDENCE_SUBMITTED',
          command,
          beforeState: { status: claim.status, evidenceRequestStatus: request.status },
          afterState: { status: updated.status, evidenceRequestStatus: submitted.status, evidenceReferenceKind: 'REFERENCE_ONLY' },
        });
        return view(current, updated);
      });
    },

    async listAdmin(suppliedActor, page) {
      const actor = requireActor(suppliedActor);
      requireAdminRole(actor);
      await requireAccount(stores, actor, true);
      return pageClaims(stores, await stores.claims.listAll(page.limit + 1, page.cursor), page);
    },

    async getAdmin(suppliedActor, claimId) {
      const actor = requireActor(suppliedActor);
      requireAdminRole(actor);
      await requireAccount(stores, actor, true);
      return loadClaimView(stores, claimId);
    },

    async review(suppliedActor, claimId, note, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdminRole(actor);
      const command = requireCommand(suppliedCommand);
      const normalizedNote = optionalText(note, 'note', 500);
      return executeCommand(actor.id, command, { claimId, note: normalizedNote ?? null }, async (current, at) => {
        await requireAccount(current, actor, true);
        const claim = await current.claims.findClaimForUpdate(claimId);
        if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
        if (isClaimTerminal(claim.status)) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Un Claim clôturé ne peut plus être mis en revue.', undefined, 409);
        if (claim.status !== 'ADMIN_REVIEW') {
          const updated = await current.claims.transitionClaim({
            claimId,
            expected: [claim.status],
            status: 'ADMIN_REVIEW',
            at,
          });
          if (!updated) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le Claim a été modifié par une requête concurrente.', undefined, 409);
          await outbox(current, {
            eventId: `claim-escalated:${claim.claimId}:${at}`,
            eventType: 'CLAIM_ESCALATED',
            claimId: claim.claimId,
            actorId: actor.id,
            at,
            payload: { claimId: claim.claimId, fromStatus: claim.status, toStatus: 'ADMIN_REVIEW', reason: 'ADMIN_REVIEW_REQUESTED' },
            source: CLAIM_API_SOURCE,
            command,
          });
          await audit(current, {
            claimId,
            actorId: actor.id,
            at,
            action: 'CLAIM_ADMIN_REVIEW_STARTED',
            command,
            beforeState: { status: claim.status },
            afterState: { status: updated.status, ...(normalizedNote ? { note: normalizedNote } : {}) },
          });
          return view(current, updated);
        }
        return view(current, claim);
      });
    },

    async requestEvidence(suppliedActor, claimId, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdminRole(actor);
      const command = requireCommand(suppliedCommand);
      const requestedType = normalizeEvidenceType(suppliedInput?.requestedType);
      const requestedFrom = optionalText(suppliedInput?.requestedFrom, 'requestedFrom', 128);
      return executeCommand(actor.id, command, { claimId, requestedType, requestedFrom: requestedFrom ?? null }, async (current, at) => {
        await requireAccount(current, actor, true);
        ensureDeadlineConfigurationValid();
        const claim = await current.claims.findClaimForUpdate(claimId);
        if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
        if (claim.status !== 'ADMIN_REVIEW' && claim.status !== 'UNDER_REVIEW') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une nouvelle preuve ne peut être demandée qu’en revue ADMIN.', undefined, 409);
        }
        if (await current.claims.findPendingEvidenceRequestForClaim(claimId)) {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une demande de preuve est déjà ouverte.', undefined, 409);
        }
        const recipient = requestedFrom ?? claim.respondentId;
        if (recipient !== claim.claimantId && recipient !== claim.respondentId) {
          throw new ApiError('VALIDATION_ERROR', 'La preuve doit être demandée à une partie persistée du contrat.');
        }
        const request = await createEvidenceRequest(current, claim, {
          requestedFrom: recipient,
          requestedBy: actor.id,
          requestedType,
          at,
        });
        const updated = await current.claims.transitionClaim({
          claimId,
          expected: [claim.status],
          status: 'EVIDENCE_REQUESTED',
          at,
          dueAt: request.dueAt ?? null,
        });
        if (!updated) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le Claim a été modifié par une requête concurrente.', undefined, 409);
        await outbox(current, {
          eventId: `claim-evidence-requested:${request.evidenceRequestId}`,
          eventType: 'CLAIM_EVIDENCE_REQUESTED',
          claimId,
          actorId: actor.id,
          at,
          payload: { claimId, evidenceRequestId: request.evidenceRequestId, requestedFrom: recipient, requestedType, ...(request.dueAt ? { dueAt: request.dueAt } : {}) },
          source: CLAIM_API_SOURCE,
          command,
        });
        await audit(current, {
          claimId,
          actorId: actor.id,
          at,
          action: 'CLAIM_EVIDENCE_REQUESTED',
          command,
          beforeState: { status: claim.status },
          afterState: { status: updated.status, evidenceRequestId: request.evidenceRequestId, requestedFrom: recipient, requestedType, dueAt: request.dueAt ?? null },
        });
        return view(current, updated);
      });
    },

    async decide(suppliedActor, claimId, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdminRole(actor);
      const command = requireCommand(suppliedCommand);
      const input = normalizeDecision(suppliedInput);
      return executeCommand(actor.id, command, { claimId, ...input }, async (current, at) => {
        await requireAccount(current, actor, true);
        const claim = await current.claims.findClaimForUpdate(claimId);
        if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
        if (claim.status !== 'ADMIN_REVIEW') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le Claim doit être en ADMIN_REVIEW avant une décision.', undefined, 409);
        }
        const terminalStatus: ClaimStatus = input.decision === 'RESOLVE' ? 'RESOLVED' : 'REJECTED';
        const updated = await current.claims.transitionClaim({
          claimId,
          expected: ['ADMIN_REVIEW'],
          status: terminalStatus,
          at,
          dueAt: null,
          resolvedAt: at,
          resolvedBy: actor.id,
          resolution: input.resolution,
        });
        if (!updated) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le Claim a été modifié par une requête concurrente.', undefined, 409);
        await cancelPendingEvidenceAndJobs(current, claim, at, actor.id, 'Restrictions et demandes fermées à la décision ADMIN.');
        await clearContractIncidentLink(current, claim, at);
        const eventType = terminalStatus === 'RESOLVED' ? 'CLAIM_RESOLVED' : 'CLAIM_REJECTED';
        await outbox(current, {
          eventId: `claim-${input.decision.toLowerCase()}:${claim.claimId}`,
          eventType,
          claimId,
          actorId: actor.id,
          at,
          payload: { claimId, decision: input.decision, resolution: input.resolution, actorType: 'ADMIN' },
          source: CLAIM_API_SOURCE,
          command,
        });
        await audit(current, {
          claimId,
          actorId: actor.id,
          at,
          action: `CLAIM_${input.decision}`,
          command,
          beforeState: { status: claim.status },
          afterState: { status: updated.status, resolution: input.resolution, releasedRestrictions: true },
        });
        return view(current, updated);
      });
    },

    async applyRestriction(suppliedActor, claimId, suppliedReason, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdminRole(actor);
      const command = requireCommand(suppliedCommand);
      const reason = requireText(suppliedReason, 'reason', 3, MAX_REASON_LENGTH);
      const scope: ClaimRestrictionScope = 'CONTRACT_TERMINATE';
      return executeCommand(actor.id, command, { claimId, scope, reason }, async (current, at) => {
        await requireAccount(current, actor, true);
        const claim = await current.claims.findClaimForUpdate(claimId);
        if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
        if (claim.status !== 'ADMIN_REVIEW' || claim.type !== 'CONTRACT_INCIDENT') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une restriction provisoire n’est possible qu’en revue ADMIN d’un incident contractuel.', undefined, 409);
        }
        const contract = await current.contracts.findByIdForUpdate(claim.contractId);
        if (!contract || contract.incidentId !== claim.claimId) {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le lien incident Claim/Contract n’est plus actif.', undefined, 409);
        }
        const restriction = await current.claims.createRestriction({
          restrictionId: newEntityId('rsk'),
          claimId,
          userId: contract.employerId,
          scope,
          status: 'ACTIVE',
          reason,
          appliedBy: actor.id,
          appliedAt: at,
        });
        if (!restriction) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une restriction provisoire active existe déjà.', undefined, 409);
        await outbox(current, {
          eventId: `claim-restriction-applied:${restriction.restrictionId}`,
          eventType: 'CLAIM_RESTRICTION_APPLIED',
          claimId,
          actorId: actor.id,
          at,
          payload: { claimId, restrictionId: restriction.restrictionId, userId: restriction.userId, scope, reversible: true },
          source: CLAIM_API_SOURCE,
          command,
        });
        await audit(current, {
          claimId,
          actorId: actor.id,
          at,
          action: 'CLAIM_PROVISIONAL_RESTRICTION_APPLIED',
          command,
          afterState: { restrictionId: restriction.restrictionId, userId: restriction.userId, scope, status: restriction.status, reversible: true },
        });
        return restriction;
      });
    },

    async releaseRestriction(suppliedActor, claimId, restrictionId, suppliedReason, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdminRole(actor);
      const command = requireCommand(suppliedCommand);
      const reason = requireText(suppliedReason, 'reason', 3, MAX_REASON_LENGTH);
      return executeCommand(actor.id, command, { claimId, restrictionId, reason }, async (current, at) => {
        await requireAccount(current, actor, true);
        const claim = await current.claims.findClaimForUpdate(claimId);
        if (!claim) throw new ApiError('NOT_FOUND', 'Claim introuvable.');
        const existing = await current.claims.findRestriction(restrictionId);
        if (!existing || existing.claimId !== claimId) throw new ApiError('NOT_FOUND', 'Restriction du Claim introuvable.');
        if (existing.status !== 'ACTIVE') throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette restriction est déjà révoquée.', undefined, 409);
        const released = await current.claims.releaseRestriction({ restrictionId, actorId: actor.id, reason, at });
        if (!released) throw new ApiError('BUSINESS_RULE_VIOLATION', 'La restriction a été modifiée par une requête concurrente.', undefined, 409);
        await outbox(current, {
          eventId: `claim-restriction-released:${restrictionId}`,
          eventType: 'CLAIM_RESTRICTION_RELEASED',
          claimId,
          actorId: actor.id,
          at,
          payload: { claimId, restrictionId, userId: released.userId, scope: released.scope },
          source: CLAIM_API_SOURCE,
          command,
        });
        await audit(current, {
          claimId,
          actorId: actor.id,
          at,
          action: 'CLAIM_PROVISIONAL_RESTRICTION_RELEASED',
          command,
          beforeState: { restrictionId, status: 'ACTIVE' },
          afterState: { restrictionId, status: 'RELEASED', reason },
        });
        return released;
      });
    },
  };
}

async function readStrictJsonBody(context: ApiRouteContext, allowedFields: readonly string[]): Promise<Record<string, unknown>> {
  const raw = await context.request.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) as unknown : {};
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps de requête JSON invalide.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile doit être un objet JSON.');
  }
  const record = body as Record<string, unknown>;
  const unexpected = Object.keys(record).filter(key => !allowedFields.includes(key));
  if (unexpected.length > 0) {
    throw new ApiError('VALIDATION_ERROR', `Champ(s) non autorisé(s) : ${unexpected.join(', ')}.`);
  }
  return record;
}

export function createClaimApiHandlers(repository: OpenClaimRepository): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  const requireRequestActorAndCommand = (context: ApiRouteContext): { actor: AuthenticatedActor; command: ProductionCommandContext } => {
    if (!context.actor) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
    if (!context.command) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
    return { actor: context.actor, command: context.command };
  };

  return {
    'claims.mine.list': async context => repository.listMine(context.actor!, context.page ?? { cursor: null, limit: 25 }),
    'claims.read': async context => repository.get(context.actor!, context.params.claimId),
    'claims.create': async context => {
      const { actor, command } = requireRequestActorAndCommand(context);
      const body = await readStrictJsonBody(context, ['contractId', 'paymentId', 'type', 'reason', 'evidenceReference']);
      const result = await repository.create(actor, body as unknown as CreateClaimInput, command);
      return apiJsonResponse(result, 201, context.requestId);
    },
    'claims.evidence.submit': async context => {
      const { actor, command } = requireRequestActorAndCommand(context);
      const body = await readStrictJsonBody(context, ['evidenceReference']);
      const result = await repository.submitEvidence(actor, context.params.claimId, context.params.evidenceRequestId, body as unknown as SubmitClaimEvidenceInput, command);
      return apiJsonResponse(result, 200, context.requestId);
    },
    'admin.claims.list': async context => repository.listAdmin(context.actor!, context.page ?? { cursor: null, limit: 25 }),
    'admin.claims.read': async context => repository.getAdmin(context.actor!, context.params.claimId),
    'admin.claims.review': async context => {
      const { actor, command } = requireRequestActorAndCommand(context);
      const body = await readStrictJsonBody(context, ['note']);
      const note = optionalText(body.note, 'note', 500);
      return repository.review(actor, context.params.claimId, note, command);
    },
    'admin.claims.evidence.request': async context => {
      const { actor, command } = requireRequestActorAndCommand(context);
      const body = await readStrictJsonBody(context, ['requestedFrom', 'requestedType']);
      return repository.requestEvidence(actor, context.params.claimId, {
        requestedFrom: body.requestedFrom as string | undefined,
        requestedType: body.requestedType as ClaimEvidenceType,
      }, command);
    },
    'admin.claims.decision': async context => {
      const { actor, command } = requireRequestActorAndCommand(context);
      const body = await readStrictJsonBody(context, ['decision', 'resolution']);
      return repository.decide(actor, context.params.claimId, body as unknown as AdminClaimDecisionInput, command);
    },
    'admin.claims.restriction.apply': async context => {
      const { actor, command } = requireRequestActorAndCommand(context);
      const body = await readStrictJsonBody(context, ['reason']);
      return repository.applyRestriction(actor, context.params.claimId, body.reason as string, command);
    },
    'admin.claims.restriction.release': async context => {
      const { actor, command } = requireRequestActorAndCommand(context);
      const body = await readStrictJsonBody(context, ['reason']);
      return repository.releaseRestriction(actor, context.params.claimId, context.params.restrictionId, body.reason as string, command);
    },
  };
}
