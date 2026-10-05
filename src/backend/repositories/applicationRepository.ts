/**
 * LE LABEUR — P0-E3 — soumission et consultation ciblée des CANDIDATURES.
 *
 * Chaîne : Worker/API → repository métier → stores noyau → PostgreSQL.
 * Seules la soumission par un candidat et la consultation par l'employeur
 * propriétaire d'une offre sont implémentées ici; le reste du cycle demeure fermé.
 */

import type { Application } from '../../types';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteKey } from '../api/routeContracts';
import type { ApiRouteHandler, ApiRouteContext } from '../api/worker';
import { newEntityId } from '../identity/ids';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import type { ApplicationRecord, ApplicationStore, CoreStoreError, OfferRecord, OfferStore } from '../persistence/coreRecords';
import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import type {
  ServerApplicationRepository,
  ServerApplicationSubmissionInput,
} from './contracts';

export interface ApplicationRepositoryStores {
  applications: ApplicationStore;
  offers: OfferStore;
  users: UserStore;
}

export interface ApplicationRepositoryDependencies {
  stores: ApplicationRepositoryStores;
  /** SQL callers bind every store in the callback to the same PostgreSQL transaction. */
  runInTransaction?: <T>(operation: (stores: ApplicationRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
}

interface IdempotencyEntry {
  fingerprint: string;
  result?: Application;
  pending?: Promise<Application>;
}

class InMemoryApplicationIdempotencyCache {
  private readonly records = new Map<string, IdempotencyEntry>();

  execute(
    actorId: string,
    command: string,
    key: string,
    fingerprint: string,
    operation: () => Promise<Application>,
  ): Promise<Application> {
    const cacheKey = `${command}:${actorId}:${key}`;
    const existing = this.records.get(cacheKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new ApiError(
          'IDEMPOTENCY_CONFLICT',
          'Clé d’idempotence déjà utilisée avec une commande différente.',
          undefined,
          409,
        ));
      }
      if (existing.result) return Promise.resolve(existing.result);
      if (existing.pending) return existing.pending;
    }

    // Reserve synchronously before the first await, so concurrent requests with
    // the same key cannot both start a business transaction.
    const entry: IdempotencyEntry = { fingerprint };
    const pending = Promise.resolve().then(operation).then(
      result => {
        entry.result = result;
        entry.pending = undefined;
        return result;
      },
      error => {
        if (this.records.get(cacheKey) === entry) this.records.delete(cacheKey);
        throw error;
      },
    );
    entry.pending = pending;
    this.records.set(cacheKey, entry);
    return pending;
  }

  clear(): void {
    this.records.clear();
  }
}

/** Process-local replay cache, matching the existing OFFRES idempotency boundary. */
export const applicationIdempotencyCache = new InMemoryApplicationIdempotencyCache();

function normalizePayload(value: ServerApplicationSubmissionInput | undefined): ServerApplicationSubmissionInput {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile de candidature est invalide.');
  }
  const note = value.note;
  if (note !== undefined && typeof note !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 'La note de candidature doit être du texte.');
  }
  const normalizedNote = note?.trim();
  return normalizedNote ? { note: normalizedNote } : {};
}

function toApplicationProjection(
  record: ApplicationRecord,
  offer: OfferRecord,
  candidate: ServerUserRecord | null,
  employer: ServerUserRecord | null,
): Application {
  return {
    id: record.id,
    offerId: record.offerId,
    offerTitle: offer.title,
    ...(employer ? { employerName: employer.displayName } : {}),
    candidateId: record.candidateId,
    candidateName: candidate?.displayName ?? '',
    candidateHeadline: '',
    candidateAvatar: candidate?.avatarUrl ?? '',
    appliedDate: record.appliedDate,
    status: record.status,
    history: record.history.map(entry => ({ ...entry })),
    ...(record.remuneration !== undefined ? { remuneration: record.remuneration } : {}),
    ...(record.note !== undefined ? { note: record.note } : {}),
    ...(record.contractId ? { contractId: record.contractId } : {}),
  };
}

function requireTrustedActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) {
    throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  }
  return actor;
}

function requireCandidate(actor: AuthenticatedActor): void {
  if (actor.role !== 'CANDIDATE') {
    throw new ApiError('FORBIDDEN', 'Seul un candidat peut soumettre une candidature.');
  }
}

function requireEmployer(actor: AuthenticatedActor): void {
  if (actor.role !== 'EMPLOYER') {
    throw new ApiError('FORBIDDEN', 'Seul un employeur propriétaire peut consulter les candidatures de cette offre.');
  }
}

export function createApplicationRepository(
  dependencies: ApplicationRepositoryDependencies,
): Pick<ServerApplicationRepository, 'applyToOffer' | 'listApplicationsForOffer'> {
  const { stores, runInTransaction } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const toProjectionFromStores = async (
    record: ApplicationRecord,
    currentStores: ApplicationRepositoryStores,
  ): Promise<Application> => {
    const [offer, candidate] = await Promise.all([
      currentStores.offers.findById(record.offerId),
      currentStores.users.findById(record.candidateId),
    ]);
    if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
    const employer = await currentStores.users.findById(offer.employerId);
    return toApplicationProjection(record, offer, candidate, employer);
  };

  return {
    async applyToOffer(
      suppliedActor: AuthenticatedActor,
      suppliedOfferId: string,
      command: ProductionCommandContext,
      suppliedPayload?: ServerApplicationSubmissionInput,
    ): Promise<Application> {
      const actor = requireTrustedActor(suppliedActor);
      requireCandidate(actor);
      const offerId = suppliedOfferId?.trim();
      if (!offerId) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
      const payload = normalizePayload(suppliedPayload);
      const idempotencyKey = command?.idempotencyKey?.trim();
      const fingerprint = JSON.stringify({ offerId, payload });

      const submit = async (): Promise<Application> => {
        const executeMutation = async (currentStores: ApplicationRepositoryStores): Promise<Application> => {
          // Re-read and lock current identity and offer state in the write
          // transaction; request data never selects the candidate identity.
          const candidate = await currentStores.users.findByIdForShare(actor.id);
          if (!candidate) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
          if (candidate.role !== 'CANDIDATE') {
            throw new ApiError('FORBIDDEN', 'Le rôle du compte ne permet pas de soumettre une candidature.');
          }
          if (candidate.status !== 'ACTIVE') {
            throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : la soumission de candidature est indisponible.');
          }

          const offer = await currentStores.offers.findByIdForShare(offerId);
          if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
          if (offer.status !== 'ACTIVE') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Cette offre n’est pas admissible à une candidature (statut : ${offer.status}).`,
              undefined,
              409,
            );
          }

          const employer = await currentStores.users.findByIdForShare(offer.employerId);
          if (!employer || employer.role !== 'EMPLOYER' || employer.status !== 'ACTIVE') {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette offre n’est pas admissible à une candidature.', undefined, 409);
          }

          // The database UNIQUE(offer_id, candidate_id) constraint is the final
          // guard against concurrent submissions. The shared offer-row lock
          // serializes eligibility against concurrent status changes.
          const existing = await currentStores.applications.findByOfferAndCandidate(offerId, actor.id);
          if (existing) {
            return toApplicationProjection(existing, offer, candidate, employer);
          }

          // Événement métier futur à produire : APPLICATION_SUBMITTED. P0-E3
          // persiste seulement la candidature; il n'ajoute ni moteur d'événements
          // ni consumer Outbox.
          const appliedAt = now().toISOString();
          const record: ApplicationRecord = {
            id: newEntityId('app'),
            offerId,
            candidateId: actor.id,
            status: 'PENDING',
            appliedDate: appliedAt,
            history: [{
              action: 'Candidature transmise',
              timestamp: appliedAt,
              actor: candidate.displayName,
            }],
            createdAt: appliedAt,
            updatedAt: appliedAt,
            ...(payload.note ? { note: payload.note } : {}),
          };
          const saved = await currentStores.applications.create(record);
          return toApplicationProjection(saved, offer, candidate, employer);
        };

        try {
          return runInTransaction
            ? await runInTransaction(executeMutation)
            : await executeMutation(stores);
        } catch (error) {
          // A writer not taking the offer lock can still race us; resolve the
          // unique-key winner after our SQL transaction has rolled back.
          if (isDuplicateStoreError(error)) {
            const existing = await stores.applications.findByOfferAndCandidate(offerId, actor.id);
            if (existing) return toProjectionFromStores(existing, stores);
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une candidature existe déjà pour cette offre et ce candidat.', undefined, 409);
          }
          throw error;
        }
      };

      if (!idempotencyKey) return submit();
      return applicationIdempotencyCache.execute(
        actor.id,
        command.command || 'applications.create',
        idempotencyKey,
        fingerprint,
        submit,
      );
    },

    async listApplicationsForOffer(
      suppliedActor: AuthenticatedActor,
      suppliedOfferId: string,
      page: PageRequest,
    ): Promise<CursorPage<Application>> {
      const actor = requireTrustedActor(suppliedActor);
      requireEmployer(actor);
      const offerId = suppliedOfferId?.trim();
      if (!offerId) throw new ApiError('NOT_FOUND', 'Offre introuvable.');

      const employer = await stores.users.findById(actor.id);
      if (!employer) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
      if (employer.role !== 'EMPLOYER') throw new ApiError('FORBIDDEN', 'Accès interdit.');
      if (employer.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : accès indisponible.');

      const offer = await stores.offers.findById(offerId);
      if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
      if (offer.employerId !== actor.id) {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas le propriétaire de cette offre.');
      }

      if (page.cursor) {
        const cursorRecord = await stores.applications.findById(page.cursor);
        if (!cursorRecord || cursorRecord.offerId !== offerId) {
          throw new ApiError('VALIDATION_ERROR', 'Le curseur de candidatures est invalide.');
        }
      }

      const records = await stores.applications.listByOffer(offerId, page.limit + 1, page.cursor);
      const hasMore = records.length > page.limit;
      const visible = records.slice(0, page.limit);
      const items = await Promise.all(visible.map(async record => {
        const candidate = await stores.users.findById(record.candidateId);
        return toApplicationProjection(record, offer, candidate, employer);
      }));
      return {
        items,
        cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].id : null,
        limit: page.limit,
        hasMore,
      };
    },
  };
}

function isDuplicateStoreError(error: unknown): error is CoreStoreError {
  return Boolean(
    error
    && typeof error === 'object'
    && 'failure' in error
    && (error as CoreStoreError).failure === 'DUPLICATE',
  );
}

async function readJsonBody(context: ApiRouteContext): Promise<Record<string, unknown>> {
  const raw = await context.request.text();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('object expected');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps de requête JSON invalide.');
  }
}

export function createApplicationApiHandlers(
  repository: Pick<ServerApplicationRepository, 'applyToOffer' | 'listApplicationsForOffer'>,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'applications.create': async context => {
      const body = await readJsonBody(context);
      // candidateId, role and other actor fields are deliberately not forwarded.
      const application = await repository.applyToOffer(
        context.actor!,
        context.params.offerId,
        context.command!,
        body as ServerApplicationSubmissionInput,
      );
      return apiJsonResponse(application, 201, context.requestId);
    },
    'applications.offer.list': async context => repository.listApplicationsForOffer(
      context.actor!,
      context.params.offerId,
      context.page ?? { cursor: null, limit: 25 },
    ),
  };
}
