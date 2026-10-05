/**
 * LE LABEUR — P0-E3/P0-E4 — cycle restreint des CANDIDATURES.
 *
 * Chaîne : Worker/API → repository métier → stores noyau → PostgreSQL.
 *
 * P0-E3 : soumission par un candidat, consultation par l'employeur propriétaire.
 * P0-E4 : premier cycle de décision, sans propositions ni contrats —
 *   EMPLOYER propriétaire : EXAMINE (PENDING → REVIEW),
 *                           SHORTLIST (PENDING|REVIEW → SHORTLISTED),
 *                           REJECT (PENDING|REVIEW|SHORTLISTED → REJECTED) ;
 *   CANDIDATE             : WITHDRAW (PENDING|REVIEW|SHORTLISTED → WITHDRAWN).
 *
 * Toute autre transition reste fermée : la matrice est portée par
 * `src/domain/applicationTransitions.ts`, dérivée du modèle réel.
 */

import type { Application } from '../../types';
import {
  APPLICATION_DECISION_RULES,
  DEFAULT_REJECTION_NOTE,
  evaluateApplicationDecision,
  normalizeRejectionNote,
  type ApplicationDecision,
} from '../../domain/applicationTransitions';
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

/** Sous-ensemble CANDIDATURES réellement ouvert par P0-E3 + P0-E4. */
export type OpenApplicationRepository = Pick<ServerApplicationRepository,
  | 'applyToOffer'
  | 'listApplicationsForOffer'
  | 'examine'
  | 'shortlist'
  | 'reject'
  | 'withdraw'
>;

export function createApplicationRepository(
  dependencies: ApplicationRepositoryDependencies,
): OpenApplicationRepository {
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

  /**
   * P0-E4 — moteur de décision unique pour EXAMINE / SHORTLIST / REJECT / WITHDRAW.
   *
   * Garanties, dans cet ordre :
   *  1. l'acteur vient de la session serveur (jamais du corps de requête) ;
   *  2. le compte doit exister, porter le rôle de la décision et être ACTIVE ;
   *  3. l'autorisation est résolue depuis les lignes relues (propriétaire de
   *     l'offre pour l'employeur, candidat de la candidature pour le retrait) ;
   *  4. la transition est évaluée contre le statut courant verrouillé ;
   *  5. l'écriture est un compare-and-set SQL : une décision concurrente qui a
   *     gagné n'est jamais écrasée.
   */
  const decide = async (input: {
    decision: ApplicationDecision;
    actor: AuthenticatedActor;
    applicationId: string;
    command: ProductionCommandContext;
    note?: string;
  }): Promise<Application> => {
    const rule = APPLICATION_DECISION_RULES[input.decision];
    const actor = requireTrustedActor(input.actor);
    if (actor.role !== rule.actorRole) {
      throw new ApiError(
        'FORBIDDEN',
        rule.actorRole === 'EMPLOYER'
          ? 'Action non autorisée : seul l’employeur propriétaire de l’offre peut décider sur cette candidature.'
          : 'Action non autorisée : un candidat ne peut retirer que sa propre candidature.',
      );
    }

    const applicationId = input.applicationId?.trim();
    if (!applicationId) throw new ApiError('NOT_FOUND', 'Candidature introuvable.');
    // Le motif de rejet est nettoyé ici ; le modèle réel applique un défaut,
    // il n'exige pas de motif (contrairement aux déclarations de paiement).
    const note = input.decision === 'REJECT' ? normalizeRejectionNote(input.note) : undefined;
    const idempotencyKey = input.command?.idempotencyKey?.trim();
    const fingerprint = JSON.stringify({ applicationId, decision: input.decision, note: note ?? null });

    const execute = async (): Promise<Application> => {
      const mutate = async (currentStores: ApplicationRepositoryStores): Promise<Application> => {
        const account = await currentStores.users.findByIdForShare(actor.id);
        if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
        if (account.role !== rule.actorRole) {
          throw new ApiError('FORBIDDEN', 'Le rôle du compte ne permet pas cette décision sur candidature.');
        }
        if (account.status !== 'ACTIVE') {
          throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : la décision sur candidature est indisponible.');
        }

        // Verrou de ligne : sérialise deux décisions concurrentes.
        const application = await currentStores.applications.findByIdForUpdate(applicationId);
        if (!application) throw new ApiError('NOT_FOUND', 'Candidature introuvable.');

        const offer = await currentStores.offers.findByIdForShare(application.offerId);
        if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');

        if (rule.actorRole === 'EMPLOYER') {
          // Propriété de l'offre : comparée à la donnée relue côté serveur.
          if (offer.employerId !== actor.id) {
            throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas le propriétaire de cette offre.');
          }
          if (rule.requiresActiveOffer && offer.status !== 'ACTIVE') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Cette offre n’accepte plus de sélection (statut : ${offer.status}).`,
              undefined,
              409,
            );
          }
        } else if (application.candidateId !== actor.id) {
          throw new ApiError('FORBIDDEN', 'Action non autorisée : un candidat ne peut retirer que sa propre candidature.');
        }

        // Une candidature déjà liée à un contrat sort du périmètre P0-E4.
        if (application.contractId) {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette candidature est déjà associée à un contrat.', undefined, 409);
        }

        const outcome = evaluateApplicationDecision(input.decision, application.status);
        if (outcome.kind === 'ALREADY_APPLIED') {
          // Rejeu ou action répétée : aucune écriture, aucun doublon d'historique.
          return toProjectionFromStores(application, currentStores);
        }
        if (outcome.kind === 'TERMINAL') {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            `${rule.terminalMessage} (statut : ${outcome.current}).`,
            undefined,
            409,
          );
        }
        if (outcome.kind === 'FORBIDDEN') {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            `Transition de candidature invalide : « ${input.decision} » depuis « ${outcome.current} ».`,
            undefined,
            409,
          );
        }

        const timestamp = now().toISOString();
        const reason = input.decision === 'REJECT' ? note ?? DEFAULT_REJECTION_NOTE : undefined;
        const updated = await currentStores.applications.compareAndSetStatus(applicationId, application.status, {
          status: outcome.to,
          updatedAt: timestamp,
          historyEntry: { action: rule.historyAction(reason), timestamp, actor: account.displayName },
          ...(reason !== undefined ? { note: reason } : {}),
        });

        if (!updated) {
          // Le compare-and-set a perdu : une décision concurrente a gagné.
          const fresh = await currentStores.applications.findByIdForUpdate(applicationId);
          if (!fresh) throw new ApiError('NOT_FOUND', 'Candidature introuvable.');
          if (fresh.status === rule.to) return toProjectionFromStores(fresh, currentStores);
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            'Une décision concurrente a modifié cette candidature : l’action n’a pas été appliquée.',
            undefined,
            409,
          );
        }

        // Événement métier futur à produire : `rule.event` (APPLICATION_EXAMINED,
        // APPLICATION_SHORTLISTED, APPLICATION_REJECTED, APPLICATION_WITHDRAWN).
        // P0-E4 ne crée ni moteur Outbox, ni file, ni consumer : seule la
        // transition est persistée, dans la même transaction PostgreSQL.
        return toProjectionFromStores(updated, currentStores);
      };

      return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
    };

    if (!idempotencyKey) return execute();
    return applicationIdempotencyCache.execute(
      actor.id,
      input.command?.command || `applications.${input.decision}`,
      idempotencyKey,
      fingerprint,
      execute,
    );
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

    // --- P0-E4 : cycle de décision (EMPLOYER propriétaire) ---

    async examine(actor, applicationId, command) {
      return decide({ decision: 'EXAMINE', actor, applicationId, command });
    },

    async shortlist(actor, applicationId, command) {
      return decide({ decision: 'SHORTLIST', actor, applicationId, command });
    },

    async reject(actor, applicationId, note, command) {
      return decide({ decision: 'REJECT', actor, applicationId, command, note });
    },

    // --- P0-E4 : retrait par le candidat ---

    async withdraw(actor, applicationId, command) {
      return decide({ decision: 'WITHDRAW', actor, applicationId, command });
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
  repository: OpenApplicationRepository,
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

    // --- P0-E4 : handlers de décision, et uniquement ceux-là ---
    // Propositions, contrats, paiements, commissions, plaintes, remplacements
    // et notifications générales demeurent sans handler (501).

    'applications.examine': async context => apiJsonResponse(
      await repository.examine(context.actor!, context.params.applicationId, context.command!),
      200,
      context.requestId,
    ),

    'applications.shortlist': async context => apiJsonResponse(
      await repository.shortlist(context.actor!, context.params.applicationId, context.command!),
      200,
      context.requestId,
    ),

    'applications.reject': async context => {
      const body = await readJsonBody(context);
      // Seul le motif est lu : l'acteur, l'offre et la candidature viennent du
      // contexte de session et du chemin, jamais du corps.
      const rawNote = typeof body.note === 'string'
        ? body.note
        : (typeof body.reason === 'string' ? body.reason : undefined);
      const application = await repository.reject(
        context.actor!,
        context.params.applicationId,
        rawNote,
        context.command!,
      );
      return apiJsonResponse(application, 200, context.requestId);
    },

    'applications.withdraw': async context => apiJsonResponse(
      await repository.withdraw(context.actor!, context.params.applicationId, context.command!),
      200,
      context.requestId,
    ),
  };
}
