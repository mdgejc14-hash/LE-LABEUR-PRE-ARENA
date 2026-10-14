/**
 * LE LABEUR — P0-REPLACEMENT — persistent replacement dossier API.
 *
 * The employer publishes the replacement offer; candidates use the regular
 * Offer → Application → Proposal → Contract pipeline. This repository does
 * not pick candidates, score them, or transfer them outside that workflow.
 */

import type { ReplacementDossier } from '../../types';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteContext, ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import type { AutomationStores } from '../automation/records';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import { newEntityId } from '../identity/ids';
import type { ContractStore, OfferRecord, OfferStore } from '../persistence/coreRecords';
import type { PageRequest, CursorPage, AuthenticatedActor, ProductionCommandContext } from '../productionContracts';
import { sha256Fingerprint } from '../payments/paymentErrors';
import { buildOfferRecord } from '../repositories/offerRepository';
import type { ServerCreateOfferInput } from '../repositories/contracts';
import { REPLACEMENT_API_SOURCE, type ReplacementRecord, type ReplacementStore } from './records';


const MAX_PAGE_LIMIT = 100;
const REPLACEMENT_OFFER_FIELDS = [
  'title', 'contractType', 'remuneration', 'currency', 'location', 'departmentId',
  'municipalityId', 'arrondissementId', 'localityId', 'locationLabel', 'domainId',
  'jobId', 'isUrgent', 'skills', 'summary', 'responsibilities', 'conditions',
  'selectionProcess', 'startDate', 'durationMonths',
] as const;

export interface ReplacementRepositoryStores {
  replacements: ReplacementStore;
  contracts: ContractStore;
  offers: OfferStore;
  users: UserStore;
  automation: AutomationStores;
}

export interface ReplacementRepositoryDependencies {
  stores: ReplacementRepositoryStores;
  runInTransaction?: <T>(operation: (stores: ReplacementRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
}

export interface OpenReplacementRepository {
  listMine(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<ReplacementDossier>>;
  get(actor: AuthenticatedActor, replacementId: string): Promise<ReplacementDossier>;
  listAdmin(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<ReplacementDossier>>;
  publishOffer(
    actor: AuthenticatedActor,
    replacementId: string,
    offer: ServerCreateOfferInput,
    command: ProductionCommandContext,
  ): Promise<ReplacementDossier>;
}

function requireActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}

function requireCommand(command: ProductionCommandContext | null | undefined): ProductionCommandContext {
  if (!command?.idempotencyKey?.trim() || !command.command) {
    throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
  }
  return command;
}

function statusCode(status: number): ApiError {
  return new ApiError('BUSINESS_RULE_VIOLATION', 'La commande de remplacement n’a pas pu être appliquée.', undefined, status);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

function readOfferBody(value: unknown): ServerCreateOfferInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile de l’offre de remplacement est invalide.');
  }
  const body = value as Record<string, unknown>;
  const extra = Object.keys(body).filter(key => !(REPLACEMENT_OFFER_FIELDS as readonly string[]).includes(key));
  if (extra.length > 0) throw new ApiError('VALIDATION_ERROR', `Champ non autorisé : ${extra.join(', ')}.`);
  return body as unknown as ServerCreateOfferInput;
}

async function readStrictJsonBody(context: ApiRouteContext): Promise<ServerCreateOfferInput> {
  let parsed: unknown;
  try {
    const raw = await context.request.text();
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps JSON invalide.');
  }
  return readOfferBody(parsed);
}

export function toReplacementProjection(
  record: ReplacementRecord,
  employer: ServerUserRecord | null,
  offer: OfferRecord | null,
  selectedCandidate: ServerUserRecord | null,
): ReplacementDossier {
  return {
    id: record.replacementId,
    // Legacy UI field retained as a read-only alias; the persistent source is a Claim.
    incidentId: record.claimId,
    claimId: record.claimId,
    originalContractId: record.originalContractId,
    employerId: record.employerId,
    employerName: employer?.displayName ?? '',
    ...(record.offerId ? { urgentOfferId: record.offerId } : {}),
    ...(offer ? { urgentOfferTitle: offer.title } : {}),
    ...(record.selectedCandidateId ? { selectedCandidateId: record.selectedCandidateId } : {}),
    ...(selectedCandidate ? { selectedCandidateName: selectedCandidate.displayName } : {}),
    ...(record.selectedApplicationId ? { selectedApplicationId: record.selectedApplicationId } : {}),
    ...(record.selectedProposalId ? { selectedProposalId: record.selectedProposalId } : {}),
    ...(record.newContractId ? { newContractId: record.newContractId } : {}),
    status: record.status,
    openedAt: record.createdAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createReplacementRepository(
  dependencies: ReplacementRepositoryDependencies,
): OpenReplacementRepository {
  const { stores, runInTransaction } = dependencies;
  const clock = dependencies.now ?? (() => new Date());

  const inTransaction = <T>(operation: (current: ReplacementRepositoryStores) => Promise<T>): Promise<T> =>
    runInTransaction ? runInTransaction(operation) : operation(stores);

  const requireActiveAccount = async (
    current: ReplacementRepositoryStores,
    actor: AuthenticatedActor,
    role: 'CANDIDATE' | 'EMPLOYER' | 'ADMIN',
  ): Promise<ServerUserRecord> => {
    const account = await current.users.findByIdForShare(actor.id);
    if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
    if (account.role !== role || actor.role !== role) throw new ApiError('FORBIDDEN', 'Le rôle du compte ne permet pas cette opération.');
    if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'Compte non actif : cette opération de remplacement est indisponible.');
    return account;
  };

  const project = async (
    current: ReplacementRepositoryStores,
    record: ReplacementRecord,
  ): Promise<ReplacementDossier> => {
    const [employer, offer, candidate] = await Promise.all([
      current.users.findById(record.employerId),
      record.offerId ? current.offers.findById(record.offerId) : Promise.resolve(null),
      record.selectedCandidateId ? current.users.findById(record.selectedCandidateId) : Promise.resolve(null),
    ]);
    return toReplacementProjection(record, employer, offer, candidate);
  };

  const page = async (
    current: ReplacementRepositoryStores,
    records: ReplacementRecord[],
    request: PageRequest,
  ): Promise<CursorPage<ReplacementDossier>> => {
    const hasMore = records.length > request.limit;
    const visible = records.slice(0, request.limit);
    return {
      items: await Promise.all(visible.map(record => project(current, record))),
      cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].replacementId : null,
      limit: request.limit,
      hasMore,
    };
  };

  const reserve = async <T>(
    current: ReplacementRepositoryStores,
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
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une commande concurrente traite déjà ce remplacement : rejouez la requête.', undefined, 409);
    }
    return outcome.kind === 'replay'
      ? { replay: true, result: outcome.result as T }
      : { replay: false };
  };

  const complete = async (
    current: ReplacementRepositoryStores,
    actorId: string,
    command: ProductionCommandContext,
    result: unknown,
  ): Promise<void> => current.automation.idempotency.complete(actorId, command.command, command.idempotencyKey, result);

  return {
    async listMine(suppliedActor, request) {
      const actor = requireActor(suppliedActor);
      if (actor.role !== 'EMPLOYER' && actor.role !== 'CANDIDATE') {
        throw new ApiError('FORBIDDEN', 'Seules les parties d’un contrat peuvent consulter un remplacement.');
      }
      await requireActiveAccount(stores, actor, actor.role);
      const limit = Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.trunc(request.limit || 25)));
      const records = await stores.replacements.listForParty(actor.id, limit + 1, request.cursor);
      return page(stores, records, { ...request, limit });
    },

    async get(suppliedActor, replacementId) {
      const actor = requireActor(suppliedActor);
      const record = await stores.replacements.findById(replacementId);
      if (!record) throw new ApiError('NOT_FOUND', 'Remplacement introuvable.');
      if (actor.role === 'ADMIN') {
        if (!actor.permissions.includes('replacements:read:any')) throw new ApiError('FORBIDDEN', 'Permission replacements:read:any requise.');
        await requireActiveAccount(stores, actor, 'ADMIN');
      } else if (actor.role === 'EMPLOYER') {
        await requireActiveAccount(stores, actor, 'EMPLOYER');
        if (record.employerId !== actor.id) throw new ApiError('NOT_FOUND', 'Remplacement introuvable.');
      } else if (actor.role === 'CANDIDATE') {
        await requireActiveAccount(stores, actor, 'CANDIDATE');
        const sourceContract = await stores.contracts.findById(record.originalContractId);
        if (!sourceContract || (sourceContract.employeeId !== actor.id && record.selectedCandidateId !== actor.id)) {
          throw new ApiError('NOT_FOUND', 'Remplacement introuvable.');
        }
      } else {
        throw new ApiError('FORBIDDEN', 'Accès interdit.');
      }
      return project(stores, record);
    },

    async listAdmin(suppliedActor, request) {
      const actor = requireActor(suppliedActor);
      if (actor.role !== 'ADMIN' || !actor.permissions.includes('replacements:read:any')) {
        throw new ApiError('FORBIDDEN', 'Permission replacements:read:any requise.');
      }
      await requireActiveAccount(stores, actor, 'ADMIN');
      const limit = Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.trunc(request.limit || 25)));
      const records = await stores.replacements.listAll(limit + 1, request.cursor);
      return page(stores, records, { ...request, limit });
    },

    async publishOffer(suppliedActor, replacementId, suppliedOffer, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      if (actor.role !== 'EMPLOYER') throw new ApiError('FORBIDDEN', 'Seul l’employeur propriétaire peut publier l’offre de remplacement.');
      const command = requireCommand(suppliedCommand);
      const offer = readOfferBody(suppliedOffer);
      const payload = { replacementId, offer };
      try {
        return await inTransaction(async current => {
          const reservation = await reserve<ReplacementDossier>(current, actor.id, command, payload);
          if (reservation.replay) return reservation.result;
          const employer = await requireActiveAccount(current, actor, 'EMPLOYER');
          const replacement = await current.replacements.findByIdForUpdate(replacementId);
          if (!replacement) throw new ApiError('NOT_FOUND', 'Remplacement introuvable.');
          if (replacement.employerId !== actor.id) throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’employeur du remplacement.');
          if (replacement.status !== 'PENDING_OFFER' || replacement.offerId) {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'L’offre de remplacement est déjà publiée ou le dossier n’accepte plus d’offre.', undefined, 409);
          }

          const at = clock().toISOString();
          const offerRecord = buildOfferRecord(newEntityId('ofr'), employer.id, offer, at);
          const createdOffer = await current.offers.create(offerRecord);
          const updated = await current.replacements.attachOffer({
            replacementId: replacement.replacementId,
            offerId: createdOffer.id,
            at,
          });
          if (!updated) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le dossier a été modifié par une commande concurrente.', undefined, 409);

          await current.automation.audit.append({
            id: newEntityId('rev'),
            actorId: actor.id,
            timestamp: at,
            entityId: replacement.replacementId,
            action: 'REPLACEMENT_OFFER_PUBLISHED',
            source: REPLACEMENT_API_SOURCE,
            reference: command.idempotencyKey,
            beforeState: { status: replacement.status, offerId: null },
            afterState: { status: updated.status, offerId: createdOffer.id },
          });
          const response = await project(current, updated);
          await complete(current, actor.id, command, response);
          return response;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Un remplacement ou une offre de remplacement existe déjà pour cet engagement.', undefined, 409);
        }
        throw error;
      }
    },
  };
}

export function createReplacementApiHandlers(
  repository: OpenReplacementRepository,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'replacements.mine.list': async context => repository.listMine(context.actor!, context.page ?? { cursor: null, limit: 25 }),
    'replacements.read': async context => repository.get(context.actor!, context.params.replacementId),
    'admin.replacements.list': async context => repository.listAdmin(context.actor!, context.page ?? { cursor: null, limit: 25 }),
    'admin.replacements.read': async context => repository.get(context.actor!, context.params.replacementId),
    'replacements.offer.create': async context => {
      const result = await repository.publishOffer(
        context.actor!,
        context.params.replacementId,
        await readStrictJsonBody(context),
        context.command!,
      );
      return apiJsonResponse(result, 201, context.requestId);
    },
  };
}
