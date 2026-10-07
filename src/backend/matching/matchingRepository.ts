/**
 * LE LABEUR — P0-MATCHING — qualification, human review and transparent results.
 *
 * All mutations use the existing PostgreSQL transaction, Outbox-adjacent
 * idempotency and audit ledger infrastructure. This repository never mutates
 * applications, replacements, proposals, contracts, prices or payments.
 */

import { ApiError } from '../api/errors';
import type { ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import type { AutomationStores } from '../automation/records';
import { newEntityId } from '../identity/ids';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import type { OfferRecord, OfferStore } from '../persistence/coreRecords';
import type { AuthenticatedActor, CursorPage, PageRequest, ProductionCommandContext } from '../productionContracts';
import { sha256Fingerprint } from '../payments/paymentErrors';
import {
  QUALIFICATION_RULES_VERSION,
  RANKING_RULES_VERSION,
  type CandidateMatchingProfileRecord,
  type MatchingRunRecord,
  type MatchingSortBy,
  type MatchingSortDirection,
  type MissionQualificationAnswers,
  type MissionQualificationRecord,
  type QualificationDecision,
} from './records';
import { evaluateMissionQualification, parseMissionQualificationAnswers } from './qualification';
import { parseCandidateMatchingProfile, parseMatchingSort, rankMatchingCandidates } from './matchingEngine';
import type { MatchingStores } from './records';

const API_SOURCE = 'api:P0-MATCHING';
const MAX_REVIEW_PAGE_LIMIT = 100;
export const MAX_MATCHING_CANDIDATES = 200;

export interface MatchingRepositoryStores {
  offers: OfferStore;
  users: UserStore;
  matching: MatchingStores;
  automation: AutomationStores;
}

export interface QualificationReviewQueueItem {
  qualification: MissionQualificationRecord;
  offerTitle: string;
  employerDisplayName: string;
}

export interface MissionConstraintSummary {
  offerId: string;
  timePlaceConstraint: MissionQualificationAnswers['timePlaceConstraint'];
  candidateFacingConstraintSummary: string;
  candidateDecidesWhetherToApplyOrAccept: true;
  automaticAssignment: false;
}

export interface OpenMatchingRepository {
  submitQualification(actor: AuthenticatedActor, offerId: string, answers: unknown, command: ProductionCommandContext): Promise<MissionQualificationRecord>;
  getQualification(actor: AuthenticatedActor, offerId: string): Promise<MissionQualificationRecord>;
  getPublicMissionConstraints(offerId: string): Promise<MissionConstraintSummary>;
  listPendingReviews(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<QualificationReviewQueueItem>>;
  resolveHumanReview(actor: AuthenticatedActor, qualificationId: string, input: unknown, command: ProductionCommandContext): Promise<MissionQualificationRecord>;
  getMyCandidateProfile(actor: AuthenticatedActor): Promise<CandidateMatchingProfileRecord | null>;
  updateCandidateProfile(actor: AuthenticatedActor, input: unknown, command: ProductionCommandContext): Promise<CandidateMatchingProfileRecord>;
  createMatchingRun(actor: AuthenticatedActor, offerId: string, sorting: unknown, command: ProductionCommandContext): Promise<MatchingRunRecord>;
  getMatchingRun(actor: AuthenticatedActor, runId: string): Promise<MatchingRunRecord>;
}

function requireActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  return actor;
}

function requireCommand(actor: AuthenticatedActor, command: ProductionCommandContext | null | undefined): ProductionCommandContext {
  if (!command?.idempotencyKey?.trim() || !command.command) {
    throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
  }
  if (command.actor.id !== actor.id || command.actor.role !== actor.role) {
    throw new ApiError('FORBIDDEN', 'La commande ne correspond pas à la session authentifiée.');
  }
  return command;
}

function conflict(message: string): ApiError {
  return new ApiError('BUSINESS_RULE_VIOLATION', message, undefined, 409);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

function actorState(actor: AuthenticatedActor, account: ServerUserRecord): void {
  if (account.role !== actor.role) throw new ApiError('FORBIDDEN', 'Le rôle de la session ne correspond plus au compte.');
  if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'Compte non actif : cette opération de matching est indisponible.');
}

function adminReviewPermission(actor: AuthenticatedActor): void {
  if (actor.role !== 'ADMIN' || !actor.permissions.includes('offers:moderate')) {
    throw new ApiError('FORBIDDEN', 'La revue humaine requiert la permission ADMIN offers:moderate.');
  }
}

function parseReviewInput(value: unknown): { decision: 'ELIGIBLE_FOR_INDEPENDENT' | 'BLOCKED'; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', 'La décision de revue doit être un objet JSON.');
  }
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).filter(key => !['decision', 'reason'].includes(key));
  if (unknown.length > 0) throw new ApiError('VALIDATION_ERROR', `Champ non autorisé dans la revue : ${unknown.join(', ')}.`);
  if (input.decision !== 'ELIGIBLE_FOR_INDEPENDENT' && input.decision !== 'BLOCKED') {
    throw new ApiError('VALIDATION_ERROR', 'La revue doit conclure ELIGIBLE_FOR_INDEPENDENT ou BLOCKED.');
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.trim().length > 1000) {
    throw new ApiError('VALIDATION_ERROR', 'Un motif de revue de 10 à 1000 caractères est obligatoire.');
  }
  return { decision: input.decision, reason: input.reason.trim() };
}

export function createMatchingRepository(input: {
  stores: MatchingRepositoryStores;
  /** Required: P0-MATCHING is exposed only with durable atomic persistence. */
  runInTransaction: <T>(operation: (stores: MatchingRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
}): OpenMatchingRepository {
  const { stores, runInTransaction } = input;
  const clock = input.now ?? (() => new Date());

  const activeAccount = async (
    current: MatchingRepositoryStores,
    suppliedActor: AuthenticatedActor,
    role: 'EMPLOYER' | 'CANDIDATE' | 'ADMIN',
  ): Promise<ServerUserRecord> => {
    const actor = requireActor(suppliedActor);
    const account = await current.users.findByIdForShare(actor.id);
    if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
    actorState(actor, account);
    if (actor.role !== role || account.role !== role) throw new ApiError('FORBIDDEN', `Cette opération est réservée au rôle ${role}.`);
    return account;
  };

  const ownedActiveOffer = async (
    current: MatchingRepositoryStores,
    actor: AuthenticatedActor,
    offerId: string,
  ): Promise<{ employer: ServerUserRecord; offer: OfferRecord }> => {
    const employer = await activeAccount(current, actor, 'EMPLOYER');
    const offer = await current.offers.findByIdForShare(offerId);
    if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
    if (offer.employerId !== employer.id) throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’employeur propriétaire de cette offre.');
    if (offer.status !== 'ACTIVE') throw conflict('Le matching est disponible uniquement pour une offre ACTIVE.');
    return { employer, offer };
  };

  const reserve = async <Result>(
    current: MatchingRepositoryStores,
    actor: AuthenticatedActor,
    command: ProductionCommandContext,
    payload: unknown,
  ): Promise<{ replay: true; result: Result } | { replay: false }> => {
    const result = await current.automation.idempotency.reserve({
      actorId: actor.id,
      command: command.command,
      key: command.idempotencyKey,
      payloadHash: await sha256Fingerprint(JSON.stringify(payload)),
    });
    if (result.kind === 'conflict') {
      throw new ApiError('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée avec une charge utile différente.', undefined, 409);
    }
    if (result.kind === 'in-progress') {
      throw conflict('Une commande concurrente est en cours; rejouez la même requête.');
    }
    return result.kind === 'replay'
      ? { replay: true, result: result.result as Result }
      : { replay: false };
  };

  const complete = (
    current: MatchingRepositoryStores,
    actor: AuthenticatedActor,
    command: ProductionCommandContext,
    result: unknown,
  ): Promise<void> => current.automation.idempotency.complete(actor.id, command.command, command.idempotencyKey, result);

  const audit = async (
    current: MatchingRepositoryStores,
    actor: AuthenticatedActor,
    input: {
      entityId: string;
      at: string;
      action: string;
      command?: ProductionCommandContext;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
    },
  ): Promise<void> => {
    await current.automation.audit.append({
      id: newEntityId('rev'),
      actorId: actor.id,
      timestamp: input.at,
      entityId: input.entityId,
      action: input.action,
      source: API_SOURCE,
      ...(input.command ? { reference: input.command.idempotencyKey } : {}),
      ...(input.beforeState ? { beforeState: input.beforeState } : {}),
      ...(input.afterState ? { afterState: input.afterState } : {}),
    });
  };

  return {
    async submitQualification(suppliedActor, offerId, suppliedAnswers, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      const answers = parseMissionQualificationAnswers(suppliedAnswers);
      const payload = { offerId, answers };
      try {
        return await runInTransaction(async current => {
          const { employer, offer } = await ownedActiveOffer(current, actor, offerId);
          const reservation = await reserve<MissionQualificationRecord>(current, actor, command, payload);
          if (reservation.replay) return reservation.result;
          const evaluated = evaluateMissionQualification(answers);
          const at = clock().toISOString();
          const record: MissionQualificationRecord = {
            qualificationId: newEntityId('qlf'),
            offerId: offer.id,
            employerId: employer.id,
            answers,
            initialDecision: evaluated.decision,
            decision: evaluated.decision,
            reasons: evaluated.reasons,
            ruleVersion: evaluated.ruleVersion,
            evaluatedAt: at,
          };
          const saved = await current.matching.qualifications.create(record);
          await audit(current, actor, {
            entityId: saved.qualificationId,
            at,
            action: 'MISSION_QUALIFICATION_EVALUATED',
            command,
            afterState: {
              offerId: saved.offerId,
              ruleVersion: saved.ruleVersion,
              decision: saved.decision,
              reasons: saved.reasons,
            },
          });
          await complete(current, actor, command, saved);
          return saved;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict('Une qualification existe déjà pour cette offre et reste verrouillée. Aucune modification des réponses ne permet de contourner un blocage; contactez l’administration en cas d’erreur factuelle.');
        }
        throw error;
      }
    },

    async getQualification(suppliedActor, offerId) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor, 'EMPLOYER');
        const offer = await current.offers.findById(offerId);
        if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
        if (offer.employerId !== actor.id) throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’employeur propriétaire de cette offre.');
        const qualification = await current.matching.qualifications.findByOfferId(offerId);
        if (!qualification) throw new ApiError('NOT_FOUND', 'Qualification introuvable.');
        return qualification;
      });
    },

    async getPublicMissionConstraints(offerId) {
      return runInTransaction(async current => {
        const offer = await current.offers.findById(offerId);
        if (!offer || offer.status !== 'ACTIVE') throw new ApiError('NOT_FOUND', 'Offre introuvable.');
        const qualification = await current.matching.qualifications.findByOfferId(offerId);
        if (!qualification) throw new ApiError('NOT_FOUND', 'Résumé des contraintes indisponible.');
        return {
          offerId,
          timePlaceConstraint: qualification.answers.timePlaceConstraint,
          candidateFacingConstraintSummary: qualification.answers.candidateFacingConstraintSummary,
          candidateDecidesWhetherToApplyOrAccept: true,
          automaticAssignment: false,
        };
      });
    },

    async listPendingReviews(suppliedActor, request) {
      const actor = requireActor(suppliedActor);
      adminReviewPermission(actor);
      return runInTransaction(async current => {
        await activeAccount(current, actor, 'ADMIN');
        const limit = Math.max(1, Math.min(MAX_REVIEW_PAGE_LIMIT, Math.trunc(request.limit || 25)));
        const rows = await current.matching.qualifications.listPendingReview(limit + 1, request.cursor);
        const visible = rows.slice(0, limit);
        const items = await Promise.all(visible.map(async qualification => {
          const [offer, employer] = await Promise.all([
            current.offers.findById(qualification.offerId),
            current.users.findById(qualification.employerId),
          ]);
          return {
            qualification,
            offerTitle: offer?.title ?? 'Offre indisponible',
            employerDisplayName: employer?.displayName ?? 'Employeur indisponible',
          };
        }));
        return {
          items,
          cursor: rows.length > limit && visible.length ? visible[visible.length - 1].qualificationId : null,
          limit,
          hasMore: rows.length > limit,
        };
      });
    },

    async resolveHumanReview(suppliedActor, qualificationId, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      adminReviewPermission(actor);
      const command = requireCommand(actor, suppliedCommand);
      const resolution = parseReviewInput(suppliedInput);
      const payload = { qualificationId, ...resolution };
      return runInTransaction(async current => {
        await activeAccount(current, actor, 'ADMIN');
        const reservation = await reserve<MissionQualificationRecord>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;
        const previous = await current.matching.qualifications.findByQualificationId(qualificationId);
        if (!previous) throw new ApiError('NOT_FOUND', 'Qualification introuvable.');
        if (previous.decision !== 'HUMAN_REVIEW_REQUIRED' || previous.reviewedAt) {
          throw conflict('Cette qualification ne peut plus être revue; la décision humaine est à usage unique.');
        }
        const at = clock().toISOString();
        const saved = await current.matching.qualifications.resolveHumanReview({
          qualificationId,
          expectedDecision: 'HUMAN_REVIEW_REQUIRED',
          decision: resolution.decision,
          reviewedBy: actor.id,
          reviewedAt: at,
          reviewReason: resolution.reason,
        });
        if (!saved) throw conflict('Une autre revue humaine a déjà été enregistrée.');
        await audit(current, actor, {
          entityId: saved.qualificationId,
          at,
          action: 'MISSION_QUALIFICATION_REVIEWED',
          command,
          beforeState: { decision: previous.decision, ruleVersion: previous.ruleVersion },
          afterState: {
            offerId: saved.offerId,
            decision: saved.decision,
            reviewedBy: saved.reviewedBy,
            reviewedAt: saved.reviewedAt,
            reviewReason: saved.reviewReason,
            reasons: saved.reasons,
          },
        });
        await complete(current, actor, command, saved);
        return saved;
      });
    },

    async getMyCandidateProfile(suppliedActor) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor, 'CANDIDATE');
        return current.matching.candidateProfiles.findByCandidateId(actor.id);
      });
    },

    async updateCandidateProfile(suppliedActor, suppliedProfile, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      const profile = parseCandidateMatchingProfile(suppliedProfile);
      const payload = { profile };
      return runInTransaction(async current => {
        await activeAccount(current, actor, 'CANDIDATE');
        const reservation = await reserve<CandidateMatchingProfileRecord>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;
        const before = await current.matching.candidateProfiles.findByCandidateId(actor.id);
        const at = clock().toISOString();
        const record: CandidateMatchingProfileRecord = {
          candidateId: actor.id,
          ...profile,
          createdAt: before?.createdAt ?? at,
          updatedAt: at,
        };
        const saved = await current.matching.candidateProfiles.upsert(record);
        await audit(current, actor, {
          entityId: actor.id,
          at,
          action: 'CANDIDATE_MATCHING_PROFILE_UPDATED',
          command,
          beforeState: before ? { availability: before.availability, skillCount: before.skills.length } : { profilePresent: false },
          afterState: { availability: saved.availability, skillCount: saved.skills.length, fields: Object.keys(profile).sort() },
        });
        await complete(current, actor, command, saved);
        return saved;
      });
    },

    async createMatchingRun(suppliedActor, offerId, suppliedSorting, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      const sorting = parseMatchingSort(suppliedSorting);
      const payload = { offerId, sorting };
      return runInTransaction(async current => {
        const { employer, offer } = await ownedActiveOffer(current, actor, offerId);
        const reservation = await reserve<MatchingRunRecord>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;
        const qualification = await current.matching.qualifications.findByOfferId(offerId);
        if (!qualification) {
          throw conflict('La mission doit être qualifiée avant de produire des résultats.');
        }
        if (qualification.decision === 'BLOCKED') {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le parcours indépendant est bloqué pour cette mission; aucun résultat de matching ne sera produit.', {
            decision: [qualification.decision],
            reasons: qualification.reasons.filter(reason => reason.severity === 'BLOCK').map(reason => reason.code),
          }, 422);
        }
        if (qualification.decision === 'HUMAN_REVIEW_REQUIRED') {
          throw conflict('La revue humaine doit être terminée avant tout résultat de matching. Les réponses ne doivent pas être modifiées pour contourner cette étape.');
        }
        const candidates = await current.matching.candidateProfiles.listActiveCandidates(MAX_MATCHING_CANDIDATES + 1);
        if (candidates.length > MAX_MATCHING_CANDIDATES) {
          throw conflict(`Le bassin dépasse la limite P0 de ${MAX_MATCHING_CANDIDATES} profils; aucun classement partiel n’a été produit.`);
        }
        const ranked = rankMatchingCandidates(offer, candidates, sorting);
        const at = clock().toISOString();
        const record: MatchingRunRecord = {
          runId: newEntityId('mtr'),
          offerId,
          qualificationId: qualification.qualificationId,
          employerId: employer.id,
          sortBy: sorting.sortBy,
          sortDirection: sorting.sortDirection,
          rulesVersion: RANKING_RULES_VERSION,
          criteria: ranked.criteria,
          results: ranked.results,
          createdAt: at,
        };
        const saved = await current.matching.runs.create(record);
        await audit(current, actor, {
          entityId: saved.runId,
          at,
          action: 'MATCHING_RESULTS_CREATED',
          command,
          afterState: {
            offerId: saved.offerId,
            qualificationId: saved.qualificationId,
            qualificationRuleVersion: qualification.ruleVersion,
            rankingRuleVersion: saved.rulesVersion,
            sortBy: saved.sortBy,
            sortDirection: saved.sortDirection,
            criteria: saved.criteria,
            resultCount: saved.results.length,
            resultCandidateIds: saved.results.map(result => result.candidateId),
            clientMakesFinalChoice: true,
            automaticAssignment: false,
          },
        });
        await complete(current, actor, command, saved);
        return saved;
      });
    },

    async getMatchingRun(suppliedActor, runId) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor, 'EMPLOYER');
        const run = await current.matching.runs.findById(runId);
        if (!run) throw new ApiError('NOT_FOUND', 'Résultat de matching introuvable.');
        if (run.employerId !== actor.id) throw new ApiError('FORBIDDEN', 'Action non autorisée : vous ne possédez pas ces résultats.');
        return run;
      });
    },
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps JSON invalide.');
  }
}

function strictObject(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', `${label} doit être un objet JSON.`);
  }
  const input = value as Record<string, unknown>;
  const extra = Object.keys(input).filter(key => !allowed.includes(key));
  if (extra.length > 0) throw new ApiError('VALIDATION_ERROR', `Champ non autorisé dans ${label} : ${extra.join(', ')}.`);
  return input;
}

export function createMatchingApiHandlers(
  repository: OpenMatchingRepository,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'matching.qualification.submit': async context => {
      const input = strictObject(await readJsonBody(context.request), ['answers'], 'qualification');
      return repository.submitQualification(context.actor!, context.params.offerId, input.answers, context.command!);
    },
    'matching.qualification.read': async context =>
      repository.getQualification(context.actor!, context.params.offerId),
    'matching.qualification.summary': async context =>
      repository.getPublicMissionConstraints(context.params.offerId),
    'matching.qualification.review.list': async context =>
      repository.listPendingReviews(context.actor!, context.page ?? { cursor: null, limit: 25 }),
    'matching.qualification.review': async context =>
      repository.resolveHumanReview(context.actor!, context.params.qualificationId, await readJsonBody(context.request), context.command!),
    'matching.profile.read': async context => repository.getMyCandidateProfile(context.actor!),
    'matching.profile.update': async context =>
      repository.updateCandidateProfile(context.actor!, await readJsonBody(context.request), context.command!),
    'matching.runs.create': async context =>
      repository.createMatchingRun(context.actor!, context.params.offerId, await readJsonBody(context.request), context.command!),
    'matching.runs.read': async context => repository.getMatchingRun(context.actor!, context.params.runId),
  };
}
