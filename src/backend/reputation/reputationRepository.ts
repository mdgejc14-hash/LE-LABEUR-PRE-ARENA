/**
 * LE LABEUR — P0-REPUTATION — dépôt de lecture/écriture du ledger de réputation.
 *
 * Périmètre strict :
 *  - LECTURE (soi-même, ADMIN), VUE dérivée, historique expliqué, filtre période ;
 *  - RECONCILIATION explicite et idempotente des faits DÉJÀ PERSISTÉS ;
 *  - CORRECTION ADMIN (révocation / rétablissement motivés) — jamais silencieuse.
 *
 * Ce dépôt ne modifie NI contrat, NI paiement, NI litige, NI remplacement, NI
 * matching, et n'écrit AUCUN événement Outbox : un calcul de réputation ne
 * produit aucune notification. Toute intervention ADMIN est auditée dans le
 * ledger d'audit EXISTANT (`automation_audit_ledger`).
 */

import { ApiError } from '../api/errors';
import type { ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import type { AutomationStores } from '../automation/records';
import { newEntityId } from '../identity/ids';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import { sha256Fingerprint } from '../payments/paymentErrors';
import {
  REPUTATION_RULE_CODES,
  REPUTATION_RULES_VERSION,
  REPUTATION_SCORE_VERSION,
  type ReputationSourceEntityType,
  type ReputationStatus,
} from '../../domain/reputationRules';
import { computeReputationView, type ReputationView } from './reputationLedger';
import type { ReputationFactReader } from './reputationFacts';
import type { ReputationEntryQuery, ReputationEntryRecord, ReputationLedgerStore, ReputationAdminQuery } from './records';
import {
  reconcileReputationSubject,
  type ReputationReconciliationReport,
} from './reconciliationCore';

/**
 * P0-CRON-QUEUE — la réconciliation vit dans `reconciliationCore.ts` (cœur
 * partagé entre la commande explicite EXISTANTE et le job planifié) : ce dépôt
 * ne fait que la DÉLÉGUER. Aucune règle n'est modifiée.
 */
export type { ReputationReconciliationReport } from './reconciliationCore';

export const REPUTATION_API_SOURCE = 'api:P0-REPUTATION';

/** Permissions ADMIN RÉUTILISÉES : aucun code de permission n'est inventé. */
export const REPUTATION_ADMIN_READ_PERMISSION = 'audit:read';
export const REPUTATION_ADMIN_DECIDE_PERMISSION = 'incidents:arbitrate';

const MAX_REASON_LENGTH = 1000;
const MIN_REASON_LENGTH = 3;
const MAX_SUBJECT_ID_LENGTH = 128;

export interface ReputationRepositoryStores {
  reputation: ReputationLedgerStore;
  users: UserStore;
  /** Lecture seule des sources existantes (contrats, litiges, salaires confirmés). */
  reader: ReputationFactReader;
  automation: AutomationStores;
}

export interface ReputationRepositoryDependencies {
  stores: ReputationRepositoryStores;
  /** Obligatoire : la réputation n'est exposée qu'avec une transaction durable. */
  runInTransaction: <T>(operation: (stores: ReputationRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
}

export interface ReputationWindow {
  from?: string;
  to?: string;
}

export interface ReputationEntryView extends ReputationEntryRecord {
  /** Vrai si la règle persiste dans le catalogue COURANT (aucune réécriture). */
  ruleStillInCatalog: boolean;
}

export interface ReputationEntryDetail extends ReputationEntryView {
  rule: {
    code: string;
    version: string;
    category: string;
    direction: string;
    impact: number;
    explanation: string;
  };
  source: {
    event: string;
    eventId?: string;
    entityType: ReputationSourceEntityType;
    entityId: string;
  };
  history: ReputationEntryRecord['history'];
}

export interface ReputationCorrectionInput {
  action: 'REVERSE' | 'RESTORE';
  reason: string;
}

export interface ReputationAdminFilters {
  subjectUserId?: string;
  status?: ReputationStatus;
  sourceEntityType?: ReputationSourceEntityType;
  window?: ReputationWindow;
}

export interface OpenReputationRepository {
  getMine(actor: AuthenticatedActor, window?: ReputationWindow): Promise<ReputationView>;
  listMine(actor: AuthenticatedActor, page: PageRequest, window?: ReputationWindow): Promise<CursorPage<ReputationEntryView>>;
  reconcileMine(actor: AuthenticatedActor, command: ProductionCommandContext): Promise<ReputationReconciliationReport>;
  listAdmin(actor: AuthenticatedActor, page: PageRequest, filters?: ReputationAdminFilters): Promise<CursorPage<ReputationEntryView>>;
  getAdmin(actor: AuthenticatedActor, reputationId: string): Promise<ReputationEntryDetail>;
  correct(actor: AuthenticatedActor, reputationId: string, input: ReputationCorrectionInput, command: ProductionCommandContext): Promise<ReputationEntryDetail>;
  reconcileAdmin(actor: AuthenticatedActor, subjectUserId: string, command: ProductionCommandContext): Promise<ReputationReconciliationReport>;
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

function requireAdmin(actor: AuthenticatedActor, permission: string): void {
  if (actor.role !== 'ADMIN' || !actor.permissions.includes(permission as never)) {
    throw new ApiError('FORBIDDEN', `Accès réservé à l’administration (permission ${permission}).`);
  }
}

function conflict(message: string): ApiError {
  return new ApiError('BUSINESS_RULE_VIOLATION', message, undefined, 409);
}

function requireReason(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', 'Le motif de correction est obligatoire.');
  const reason = value.trim();
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw new ApiError('VALIDATION_ERROR', `Le motif doit contenir entre ${MIN_REASON_LENGTH} et ${MAX_REASON_LENGTH} caractères.`);
  }
  return reason;
}

/** Fenêtre de période validée sur la DATE DU FAIT ; toute valeur douteuse est refusée. */
export function parseReputationWindow(input: {
  from?: string | null;
  to?: string | null;
}): ReputationWindow | undefined {
  const parse = (value: string | null | undefined, label: string): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new ApiError('VALIDATION_ERROR', `${label} doit être une date ISO 8601 valide.`);
    return parsed.toISOString();
  };
  const from = parse(input.from, 'from');
  const to = parse(input.to, 'to');
  if (from && to && from > to) throw new ApiError('VALIDATION_ERROR', 'La période demandée est incohérente (from > to).');
  if (!from && !to) return undefined;
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function entryView(entry: ReputationEntryRecord): ReputationEntryView {
  return { ...entry, ruleStillInCatalog: REPUTATION_RULE_CODES.includes(entry.ruleCode) };
}

function detail(entry: ReputationEntryRecord): ReputationEntryDetail {
  return {
    ...entryView(entry),
    rule: {
      code: entry.ruleCode,
      version: entry.ruleVersion,
      category: entry.category,
      direction: entry.direction,
      impact: entry.impact,
      explanation: entry.explanation,
    },
    source: {
      event: entry.sourceEvent,
      ...(entry.sourceEventId ? { eventId: entry.sourceEventId } : {}),
      entityType: entry.sourceEntityType,
      entityId: entry.sourceEntityId,
    },
    history: entry.history,
  };
}

export function createReputationRepository(
  dependencies: ReputationRepositoryDependencies,
): OpenReputationRepository {
  const clock = dependencies.now ?? (() => new Date());
  const { runInTransaction } = dependencies;

  const activeAccount = async (
    current: ReputationRepositoryStores,
    actor: AuthenticatedActor,
  ): Promise<ServerUserRecord> => {
    const account = await current.users.findByIdForShare(actor.id);
    if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
    if (account.role !== actor.role) throw new ApiError('FORBIDDEN', 'Le rôle de la session ne correspond plus au compte.');
    if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'Compte non actif : l’accès à la réputation est indisponible.');
    return account;
  };

  const audit = async (
    current: ReputationRepositoryStores,
    input: {
      entityId: string;
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
      entityId: input.entityId,
      action: input.action,
      source: REPUTATION_API_SOURCE,
      ...(input.command ? { reference: input.command.idempotencyKey } : {}),
      ...(input.beforeState ? { beforeState: input.beforeState } : {}),
      ...(input.afterState ? { afterState: input.afterState } : {}),
    });
  };

  const reserve = async <Result>(
    current: ReputationRepositoryStores,
    actor: AuthenticatedActor,
    command: ProductionCommandContext,
    payload: unknown,
  ): Promise<{ replay: true; result: Result } | { replay: false }> => {
    const outcome = await current.automation.idempotency.reserve({
      actorId: actor.id,
      command: command.command,
      key: command.idempotencyKey,
      payloadHash: await sha256Fingerprint(JSON.stringify(payload)),
    });
    if (outcome.kind === 'conflict') {
      throw new ApiError('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée avec une charge utile différente.', undefined, 409);
    }
    if (outcome.kind === 'in-progress') {
      throw conflict('Une commande concurrente est en cours sur cette réputation : rejouez la requête.');
    }
    return outcome.kind === 'replay'
      ? { replay: true, result: outcome.result as Result }
      : { replay: false };
  };

  const complete = (
    current: ReputationRepositoryStores,
    actor: AuthenticatedActor,
    command: ProductionCommandContext,
    result: unknown,
  ): Promise<void> => current.automation.idempotency.complete(actor.id, command.command, command.idempotencyKey, result);

  /** Charge l'entrée et vérifie le droit de la lire (propriétaire ou ADMIN). */
  const loadForActor = async (
    current: ReputationRepositoryStores,
    actor: AuthenticatedActor,
    reputationId: string,
    admin: boolean,
  ): Promise<ReputationEntryRecord> => {
    const entry = await current.reputation.findById(reputationId);
    if (!entry) throw new ApiError('NOT_FOUND', 'Entrée de réputation introuvable.');
    if (!admin && entry.subjectUserId !== actor.id) {
      throw new ApiError('FORBIDDEN', 'Vous ne pouvez consulter que votre propre réputation.');
    }
    return entry;
  };

  /**
   * Réconciliation : DÉLÉGUÉE au cœur partagé (`reconciliationCore.ts`), qui
   * est aussi le seul chemin du job planifié P0-CRON-QUEUE. Idempotente par
   * construction (même clé de déduplication) : une seconde exécution n'ajoute
   * aucune ligne. Elle n'ÉCRIT QUE des entrées du sujet demandé et des traces
   * d'audit ; jamais une donnée métier d'un autre domaine.
   */
  const reconcileSubject = (
    current: ReputationRepositoryStores,
    input: { subjectUserId: string; actorId: string; at: string; command?: ProductionCommandContext },
  ): Promise<ReputationReconciliationReport> =>
    reconcileReputationSubject(
      {
        reputation: current.reputation,
        reader: current.reader,
        audit: current.automation.audit,
      },
      {
        subjectUserId: input.subjectUserId,
        actorId: input.actorId,
        at: input.at,
        source: REPUTATION_API_SOURCE,
        ...(input.command ? { reference: input.command.idempotencyKey } : {}),
      },
    );

  const pageEntries = async (
    records: ReputationEntryRecord[],
    page: PageRequest,
  ): Promise<CursorPage<ReputationEntryView>> => {
    const hasMore = records.length > page.limit;
    const visible = records.slice(0, page.limit);
    return {
      items: visible.map(entryView),
      cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].reputationId : null,
      limit: page.limit,
      hasMore,
    };
  };

  return {
    async getMine(suppliedActor, window) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const entries = await current.reputation.listForSubject(actor.id, {
          limit: 200,
          ...(window?.from ? { from: window.from } : {}),
          ...(window?.to ? { to: window.to } : {}),
        });
        return computeReputationView({
          subjectUserId: actor.id,
          entries,
          computedAt: clock().toISOString(),
          ...(window ? { window } : {}),
        });
      });
    },

    async listMine(suppliedActor, page, window) {
      const actor = requireActor(suppliedActor);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const query: ReputationEntryQuery = {
          limit: page.limit + 1,
          afterId: page.cursor,
          ...(window?.from ? { from: window.from } : {}),
          ...(window?.to ? { to: window.to } : {}),
        };
        const records = await current.reputation.listForSubject(actor.id, query);
        return pageEntries(records, page);
      });
    },

    async reconcileMine(suppliedActor, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      const command = requireCommand(actor, suppliedCommand);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const reservation = await reserve<ReputationReconciliationReport>(current, actor, command, { subjectUserId: actor.id });
        if (reservation.replay) return reservation.result;
        const at = clock().toISOString();
        const report = await reconcileSubject(current, { subjectUserId: actor.id, actorId: actor.id, at, command });
        await complete(current, actor, command, report);
        return report;
      });
    },

    async listAdmin(suppliedActor, page, filters) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, REPUTATION_ADMIN_READ_PERMISSION);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        if (filters?.subjectUserId && filters.subjectUserId.length > MAX_SUBJECT_ID_LENGTH) {
          throw new ApiError('VALIDATION_ERROR', 'subjectUserId est invalide.');
        }
        const query: ReputationAdminQuery = {
          limit: page.limit + 1,
          afterId: page.cursor,
          ...(filters?.subjectUserId ? { subjectUserId: filters.subjectUserId } : {}),
          ...(filters?.sourceEntityType ? { sourceEntityType: filters.sourceEntityType } : {}),
          ...(filters?.status ? { statuses: [filters.status] } : {}),
          ...(filters?.window?.from ? { from: filters.window.from } : {}),
          ...(filters?.window?.to ? { to: filters.window.to } : {}),
        };
        const records = await current.reputation.listAll(query);
        return pageEntries(records, page);
      });
    },

    async getAdmin(suppliedActor, reputationId) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, REPUTATION_ADMIN_READ_PERMISSION);
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const entry = await loadForActor(current, actor, reputationId, true);
        return detail(entry);
      });
    },

    async correct(suppliedActor, reputationId, suppliedInput, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, REPUTATION_ADMIN_DECIDE_PERMISSION);
      const command = requireCommand(actor, suppliedCommand);
      if (suppliedInput?.action !== 'REVERSE' && suppliedInput?.action !== 'RESTORE') {
        throw new ApiError('VALIDATION_ERROR', 'L’action de correction doit être REVERSE ou RESTORE.');
      }
      const reason = requireReason(suppliedInput.reason);
      const payload = { reputationId, action: suppliedInput.action, reason };

      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const reservation = await reserve<ReputationEntryDetail>(current, actor, command, payload);
        if (reservation.replay) return reservation.result;

        const entry = await current.reputation.findByIdForUpdate(reputationId);
        if (!entry) throw new ApiError('NOT_FOUND', 'Entrée de réputation introuvable.');

        const expected: readonly ReputationStatus[] = suppliedInput.action === 'REVERSE' ? ['ACTIVE'] : ['REVERSED'];
        if (!expected.includes(entry.status)) {
          throw conflict(
            suppliedInput.action === 'REVERSE'
              ? 'Cette entrée est déjà révoquée : aucune double révocation.'
              : 'Cette entrée n’est pas révoquée : aucun rétablissement possible.',
          );
        }

        const at = clock().toISOString();
        const updated = await current.reputation.compareAndSetStatus({
          reputationId,
          expected,
          status: suppliedInput.action === 'REVERSE' ? 'REVERSED' : 'ACTIVE',
          at,
          actorId: actor.id,
          reason,
          action: suppliedInput.action === 'REVERSE' ? 'REVERSED' : 'RESTORED',
        });
        if (!updated) throw conflict('Une correction concurrente a modifié cette entrée : la commande a été refusée.');

        await audit(current, {
          entityId: reputationId,
          actorId: actor.id,
          at,
          action: suppliedInput.action === 'REVERSE' ? 'REPUTATION_ENTRY_REVERSED' : 'REPUTATION_ENTRY_RESTORED',
          command,
          beforeState: {
            status: entry.status,
            reversedAt: entry.reversedAt ?? null,
            historyLength: entry.history.length,
          },
          afterState: {
            status: updated.status,
            subjectUserId: updated.subjectUserId,
            sourceEvent: updated.sourceEvent,
            sourceEntityType: updated.sourceEntityType,
            sourceEntityId: updated.sourceEntityId,
            ruleCode: updated.ruleCode,
            ruleVersion: updated.ruleVersion,
            reason,
            historyLength: updated.history.length,
            // La correction ne réécrit jamais l'histoire : elle l'augmente.
            historyAppendedOnly: true,
          },
        });

        const result = detail(updated);
        await complete(current, actor, command, result);
        return result;
      });
    },

    async reconcileAdmin(suppliedActor, suppliedSubjectId, suppliedCommand) {
      const actor = requireActor(suppliedActor);
      requireAdmin(actor, REPUTATION_ADMIN_DECIDE_PERMISSION);
      const command = requireCommand(actor, suppliedCommand);
      const subjectUserId = typeof suppliedSubjectId === 'string' ? suppliedSubjectId.trim() : '';
      if (!subjectUserId || subjectUserId.length > MAX_SUBJECT_ID_LENGTH) {
        throw new ApiError('VALIDATION_ERROR', 'subjectUserId est obligatoire.');
      }
      return runInTransaction(async current => {
        await activeAccount(current, actor);
        const subject = await current.users.findById(subjectUserId);
        if (!subject) throw new ApiError('NOT_FOUND', 'Utilisateur introuvable.');
        const reservation = await reserve<ReputationReconciliationReport>(current, actor, command, { subjectUserId });
        if (reservation.replay) return reservation.result;
        const at = clock().toISOString();
        const report = await reconcileSubject(current, { subjectUserId, actorId: actor.id, at, command });
        await complete(current, actor, command, report);
        return report;
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Handlers API                                                         */
/* ------------------------------------------------------------------ */

function readJsonObject(value: string): Record<string, unknown> {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps JSON invalide.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile doit être un objet JSON.');
  }
  return parsed as Record<string, unknown>;
}

function strictFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Champ non autorisé : ${extra.join(', ')}.`,
      { fields: ['PARAMETER_FORGERY_REJECTED', ...extra] },
    );
  }
}

export function createReputationApiHandlers(
  repository: OpenReputationRepository,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  const windowFromUrl = (url: URL) => parseReputationWindow({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });

  return {
    'reputation.mine.read': async context => repository.getMine(context.actor!, windowFromUrl(context.url)),
    'reputation.mine.entries.list': async context =>
      repository.listMine(context.actor!, context.page ?? { cursor: null, limit: 25 }, windowFromUrl(context.url)),
    'reputation.mine.reconcile': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, []);
      return repository.reconcileMine(context.actor!, context.command!);
    },
    'admin.reputation.entries.list': async context => {
      const subjectUserId = context.url.searchParams.get('subjectUserId') ?? undefined;
      const rawStatus = context.url.searchParams.get('status');
      let status: ReputationStatus | undefined;
      if (rawStatus !== null) {
        if (rawStatus !== 'ACTIVE' && rawStatus !== 'REVERSED') {
          throw new ApiError('VALIDATION_ERROR', 'Le filtre status doit être ACTIVE ou REVERSED.');
        }
        status = rawStatus;
      }
      const sourceEntityType = context.url.searchParams.get('sourceEntityType') ?? undefined;
      return repository.listAdmin(context.actor!, context.page ?? { cursor: null, limit: 25 }, {
        ...(subjectUserId ? { subjectUserId } : {}),
        ...(status ? { status } : {}),
        ...(sourceEntityType ? { sourceEntityType: sourceEntityType as ReputationSourceEntityType } : {}),
        ...(windowFromUrl(context.url) ? { window: windowFromUrl(context.url)! } : {}),
      });
    },
    'admin.reputation.entries.read': async context =>
      repository.getAdmin(context.actor!, context.params.reputationId),
    'admin.reputation.entries.correct': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['action', 'reason']);
      return repository.correct(context.actor!, context.params.reputationId, {
        action: body.action as ReputationCorrectionInput['action'],
        reason: body.reason as string,
      }, context.command!);
    },
    'admin.reputation.reconcile': async context => {
      const body = readJsonObject(await context.request.text());
      strictFields(body, ['subjectUserId']);
      return repository.reconcileAdmin(context.actor!, String(body.subjectUserId ?? ''), context.command!);
    },
  };
}

/** Versions exposées par la vue (contrôle de versionnement côté lecture). */
export const REPUTATION_VERSION_BANNER = {
  rulesVersion: REPUTATION_RULES_VERSION,
  scoreVersion: REPUTATION_SCORE_VERSION,
} as const;
