/**
 * LE LABEUR — P0-E1 — adaptateur de repository OFFRES serveur.
 *
 * Chaîne : API Worker → repository → stores noyau → PostgreSQL
 *
 * Périmètre strict :
 *  - EMPLOYER : créer une offre (propre compte), consulter ses propres offres
 *  - Candidat / Public : consulter les offres actives des employeurs non bloqués
 *  - ADMIN : contrôles préservés, aucune élévation implicite
 *  - Transitions d'état complexes (pause, annulation, FILLED) réservées à P0-E2
 */

import type { FilterState, Offer } from '../../types';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteKey } from '../api/routeContracts';
import type { ApiRouteHandler } from '../api/worker';
import { newEntityId } from '../identity/ids';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import type { OfferRecord, OfferStore } from '../persistence/coreRecords';
import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import type { ServerCreateOfferInput, ServerOfferRepository } from './contracts';

export interface OfferRepositoryStores {
  offers: OfferStore;
  users: UserStore;
}

export interface OfferRepositoryDependencies {
  stores: OfferRepositoryStores;
  runInTransaction?: <T>(operation: (stores: OfferRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
}

interface IdempotencyCacheEntry {
  fingerprint: string;
  result: Offer;
}

class InMemoryIdempotencyCache {
  private readonly records = new Map<string, IdempotencyCacheEntry>();

  get(actorId: string, command: string, key: string): IdempotencyCacheEntry | undefined {
    return this.records.get(`${command}:${actorId}:${key}`);
  }

  set(actorId: string, command: string, key: string, fingerprint: string, result: Offer): void {
    this.records.set(`${command}:${actorId}:${key}`, { fingerprint, result });
  }

  clear(): void {
    this.records.clear();
  }
}

export const offerIdempotencyCache = new InMemoryIdempotencyCache();

export function toOfferProjection(record: OfferRecord, employer: ServerUserRecord | null): Offer {
  return {
    id: record.id,
    employerId: record.employerId,
    employerName: employer?.displayName || 'Employeur',
    employerAvatar: employer?.avatarUrl || undefined,
    employerLocation: record.locationLabel || record.location,
    employerPublicId: employer?.id,
    title: record.title,
    contractType: record.contractType,
    remuneration: record.remuneration,
    currency: record.currency,
    location: record.location,
    ...(record.departmentId ? { departmentId: record.departmentId } : {}),
    ...(record.municipalityId ? { municipalityId: record.municipalityId } : {}),
    ...(record.arrondissementId ? { arrondissementId: record.arrondissementId } : {}),
    ...(record.localityId ? { localityId: record.localityId } : {}),
    ...(record.locationLabel ? { locationLabel: record.locationLabel } : {}),
    ...(record.domainId ? { domainId: record.domainId } : {}),
    ...(record.jobId ? { jobId: record.jobId } : {}),
    postedDate: record.postedDate,
    isUrgent: record.isUrgent ?? false,
    isLeLabeurJob: record.isLeLabeurJob ?? false,
    ...(record.leLabeurTag ? { leLabeurTag: record.leLabeurTag } : {}),
    skills: record.skills ?? [],
    summary: record.summary ?? '',
    responsibilities: record.responsibilities ?? [],
    conditions: record.conditions ?? [],
    selectionProcess: record.selectionProcess ?? [],
    compatibilityScore: 90,
    status: record.status,
    ...(record.startDate ? { startDate: record.startDate } : {}),
    ...(record.durationMonths !== undefined && record.durationMonths !== null ? { durationMonths: record.durationMonths } : {}),
  };
}

export function createOfferRepository(dependencies: OfferRepositoryDependencies): ServerOfferRepository {
  const { stores, runInTransaction } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  return {
    async createOffer(actor: AuthenticatedActor, data: ServerCreateOfferInput, command: ProductionCommandContext): Promise<Offer> {
      if (!actor || actor.role !== 'EMPLOYER') {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : seul un employeur peut créer une offre.');
      }

      const user = await stores.users.findById(actor.id);
      if (!user) {
        throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
      }
      if (user.status === 'BLOCKED') {
        throw new ApiError('FORBIDDEN', 'COMPTE BLOQUÉ : la création d’offre est indisponible.');
      }

      // Contrôle d'ownership strict : l'employeur ne peut créer d'offre que pour son propre compte
      const candidateEmployerId = (data as { employerId?: string }).employerId;
      if (candidateEmployerId && candidateEmployerId !== actor.id) {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : un employeur ne peut créer une offre que pour son propre compte.');
      }

      const idempotencyKey = command?.idempotencyKey?.trim();
      const payloadFingerprint = JSON.stringify(data);
      if (idempotencyKey) {
        const replay = offerIdempotencyCache.get(actor.id, 'offers.create', idempotencyKey);
        if (replay) {
          if (replay.fingerprint !== payloadFingerprint) {
            throw new ApiError('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée avec une commande différente.', undefined, 409);
          }
          return replay.result;
        }
      }

      // Validation des données obligatoires
      if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
        throw new ApiError('VALIDATION_ERROR', 'Le titre de l’offre est obligatoire.');
      }
      if (!data.contractType || typeof data.contractType !== 'string' || !data.contractType.trim()) {
        throw new ApiError('VALIDATION_ERROR', 'Le type de contrat est obligatoire.');
      }
      if (typeof data.remuneration !== 'number' || !Number.isFinite(data.remuneration) || data.remuneration < 0) {
        throw new ApiError('VALIDATION_ERROR', 'La rémunération doit être un nombre supérieur ou égal à zéro.');
      }
      if (!data.location || typeof data.location !== 'string' || !data.location.trim()) {
        throw new ApiError('VALIDATION_ERROR', 'Le lieu de la mission est obligatoire.');
      }
      if (data.durationMonths !== undefined && data.durationMonths !== null) {
        if (!Number.isInteger(data.durationMonths) || data.durationMonths <= 0) {
          throw new ApiError('VALIDATION_ERROR', 'La durée en mois doit être un entier strictement positif.');
        }
      }

      const nowIso = now().toISOString();
      const offerId = newEntityId('ofr');

      const record: OfferRecord = {
        id: offerId,
        employerId: actor.id,
        title: data.title.trim(),
        contractType: data.contractType.trim(),
        remuneration: data.remuneration,
        currency: data.currency?.trim() || 'FCFA',
        location: data.location.trim(),
        ...(data.departmentId?.trim() ? { departmentId: data.departmentId.trim() } : {}),
        ...(data.municipalityId?.trim() ? { municipalityId: data.municipalityId.trim() } : {}),
        ...(data.arrondissementId?.trim() ? { arrondissementId: data.arrondissementId.trim() } : {}),
        ...(data.localityId?.trim() ? { localityId: data.localityId.trim() } : {}),
        ...(data.locationLabel?.trim() ? { locationLabel: data.locationLabel.trim() } : {}),
        ...(data.domainId?.trim() ? { domainId: data.domainId.trim() } : {}),
        ...(data.jobId?.trim() ? { jobId: data.jobId.trim() } : {}),
        postedDate: nowIso,
        isUrgent: Boolean(data.isUrgent),
        isLeLabeurJob: false,
        skills: Array.isArray(data.skills) ? data.skills.filter(s => typeof s === 'string') : [],
        summary: typeof data.summary === 'string' ? data.summary.trim() : '',
        responsibilities: Array.isArray(data.responsibilities) ? data.responsibilities.filter(s => typeof s === 'string') : [],
        conditions: Array.isArray(data.conditions) ? data.conditions.filter(s => typeof s === 'string') : [],
        selectionProcess: Array.isArray(data.selectionProcess) ? data.selectionProcess.filter(s => typeof s === 'string') : [],
        ...(data.startDate?.trim() ? { startDate: data.startDate.trim() } : {}),
        ...(data.durationMonths ? { durationMonths: data.durationMonths } : {}),
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      let saved: OfferRecord;
      if (dependencies.runInTransaction) {
        saved = await dependencies.runInTransaction(async txStores => {
          return await txStores.offers.create(record);
        });
      } else {
        saved = await stores.offers.create(record);
      }

      const offer = toOfferProjection(saved, user);
      if (idempotencyKey) {
        offerIdempotencyCache.set(actor.id, 'offers.create', idempotencyKey, payloadFingerprint, offer);
      }
      return offer;
    },

    async getOffer(actor: AuthenticatedActor | null, offerId: string): Promise<Offer | null> {
      if (!offerId || typeof offerId !== 'string' || !offerId.trim()) return null;
      const record = await stores.offers.findById(offerId.trim());
      if (!record) return null;

      const employer = await stores.users.findById(record.employerId);

      const isOwner = actor?.id === record.employerId;
      if (!isOwner) {
        // Un utilisateur tiers ne peut voir que les offres actives des employeurs non bloqués
        if (record.status !== 'ACTIVE') return null;
        if (employer?.status === 'BLOCKED') return null;
      }

      return toOfferProjection(record, employer);
    },

    async listPublicOffers(
      _actor: AuthenticatedActor | null,
      filter: FilterState,
      page: PageRequest,
    ): Promise<CursorPage<Offer>> {
      const records = await stores.offers.listPublic(page.limit + 1, filter);
      const hasMore = records.length > page.limit;
      const sliced = records.slice(0, page.limit);

      const items = await Promise.all(
        sliced.map(async r => {
          const emp = await stores.users.findById(r.employerId);
          return toOfferProjection(r, emp);
        }),
      );

      const cursor = hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null;
      return {
        items,
        cursor,
        limit: page.limit,
        hasMore,
      };
    },

    async getMyOffers(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<Offer>> {
      if (!actor || actor.role !== 'EMPLOYER') {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : seul un employeur peut consulter ses offres.');
      }
      const records = await stores.offers.listByEmployer(actor.id, page.limit + 1);
      const hasMore = records.length > page.limit;
      const sliced = records.slice(0, page.limit);

      const employer = await stores.users.findById(actor.id);
      const items = sliced.map(r => toOfferProjection(r, employer));

      const cursor = hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null;
      return {
        items,
        cursor,
        limit: page.limit,
        hasMore,
      };
    },

    async setOfferStatus(): Promise<Offer> {
      throw new ApiError('NOT_IMPLEMENTED', 'Cette opération backend n’est pas encore configurée.');
    },
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps de requête JSON invalide.');
  }
}

export function createOfferApiHandlers(repository: ServerOfferRepository): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'offers.create': async context => {
      const body = await readJsonBody(context.request);
      const offer = await repository.createOffer(context.actor!, body as ServerCreateOfferInput, context.command!);
      return apiJsonResponse(offer, 201, context.requestId);
    },

    'offers.public.read': async context => {
      const offer = await repository.getOffer(context.actor, context.params.offerId);
      if (!offer) {
        throw new ApiError('NOT_FOUND', 'Ressource introuvable.');
      }
      return offer;
    },

    'offers.public.list': async context => {
      const filter: Partial<FilterState> = {};
      const q = context.url.searchParams.get('q') || context.url.searchParams.get('searchQuery');
      if (q?.trim()) filter.searchQuery = q.trim();
      const dep = context.url.searchParams.get('departmentId');
      if (dep?.trim()) filter.departmentId = dep.trim();
      const com = context.url.searchParams.get('communeId');
      if (com?.trim()) filter.communeId = com.trim();
      const contract = context.url.searchParams.get('contractType');
      if (contract?.trim()) filter.contractType = contract.trim();

      const pageRequest = context.page ?? { cursor: null, limit: 25 };
      return await repository.listPublicOffers(context.actor, filter as FilterState, pageRequest);
    },

    'offers.mine.list': async context => {
      const pageRequest = context.page ?? { cursor: null, limit: 25 };
      return await repository.getMyOffers(context.actor!, pageRequest);
    },
  };
}
