/**
 * LE LABEUR — P0-NOTIFICATIONS — service de notification réel.
 *
 *   ÉVÉNEMENT MÉTIER → (Outbox / Automation Engine EXISTANTS) → ce service
 *   → notification persistée (IN-APP) → PUSH → EMAIL (abstractions)
 *
 * Ce service n'est PAS un moteur d'automatisation : il est appelé par le
 * `AutomationWorker` EXISTANT (`SupplementalAutomationProcessor`), qui porte
 * déjà le claim Outbox, les tentatives, le retry et le dead-letter, et il
 * alimente les routes `notifications.*` DÉJÀ déclarées par le catalogue.
 *
 * GARANTIES PORTÉES PAR CE MODULE
 *  1. Destinataire : chaque notification est rattachée à un compte RÉEL
 *     (`users`) et, quand l'événement porte un contrat, à une PARTIE de ce
 *     contrat. Aucun sélecteur « tous les utilisateurs » n'existe : la
 *     diffusion globale est structurellement impossible.
 *  2. Idempotence : la clé `(recipientId, dedupeKey)` est unique en base. Un
 *     rejeu exact, deux événements concurrents, un retry de worker ou un alias
 *     d'événement ne produisent jamais deux notifications identiques.
 *  3. Traçabilité : chaque ligne conserve l'événement source (id, type) et
 *     l'agrégat. Les commandes de lecture utilisent l'idempotence durable
 *     EXISTANTE (`automation_idempotency`) et le ledger EXISTANT.
 *  4. Canaux : In-App d'abord (persistée), puis Push, puis Email. Sans provider
 *     injecté, l'état reste `NOT_AVAILABLE` — jamais un faux envoi.
 */

import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import type { PostgreSqlDatabase, SqlQueryExecutor, SqlTransaction } from '../services/database';
import type { AuditLedgerStore, DurableIdempotencyStore } from '../automation/records';
import type { UserStore } from '../identity/stores';
import { newEntityId } from '../identity/ids';
import { ApiError } from '../api/errors';
import { sha256Fingerprint } from '../payments/paymentErrors';
import {
  resolveNotificationIntents,
  type NotificationAudienceSelector,
  type NotificationEventLike,
} from '../../domain/notificationCatalog';
import {
  createNotificationChannelRegistry,
  type NotificationChannelRegistry,
  type NotificationDeliveryTarget,
} from './channels';
import type {
  NotificationChannelStatus,
  NotificationRecord,
  NotificationStore,
} from './records';

export const NOTIFICATION_API_SOURCE = 'api:P0-NOTIFICATIONS';
export const NOTIFICATION_SYSTEM_SOURCE = 'automation:P0-NOTIFICATIONS';
export const NOTIFICATION_READ_ACTION = 'NOTIFICATION_READ';
export const NOTIFICATION_READ_ALL_ACTION = 'NOTIFICATIONS_READ_ALL';

/** Bornes d'exploitation : jamais une diffusion illimitée vers les ADMIN. */
export const MAX_ADMIN_RECIPIENTS = 10;
export const MAX_PAGE_ITEMS = 101;

export interface NotificationStores {
  notifications: NotificationStore;
  users: UserStore;
  audit: AuditLedgerStore;
  idempotency: DurableIdempotencyStore;
  /** La même transaction que les stores ci-dessus. */
  sql: SqlQueryExecutor & SqlTransaction;
}

export type NotificationSqlFactory = (executor: SqlTransaction) => NotificationStores;

export interface NotificationServiceDependencies {
  database: PostgreSqlDatabase;
  createStores: NotificationSqlFactory;
  /** Abstractions Push/Email. Vide par défaut : aucun provider réel. */
  channels?: NotificationChannelRegistry;
  now?: () => Date;
}

export interface NotificationDeliveryReport {
  eventId: string;
  eventType: string;
  /** Intentions produites par le catalogue (0 si l'événement est UNMAPPED). */
  intents: number;
  created: number;
  duplicates: number;
  /** Destinataires RÉELLEMENT visés (comptes vérifiés). */
  recipients: string[];
  push: Record<NotificationChannelStatus, number>;
  email: Record<NotificationChannelStatus, number>;
  reason?: string;
}

export interface NotificationView extends NotificationRecord {
  readState: 'READ' | 'UNREAD';
}

export interface OpenNotificationService {
  /** Consommateur d'événement : appelé par l'AutomationWorker EXISTANT. */
  deliverForEvent(event: NotificationEventLike): Promise<NotificationDeliveryReport>;
  listMine(actor: AuthenticatedActor, page: PageRequest, readState?: 'READ' | 'UNREAD' | null): Promise<CursorPage<NotificationView>>;
  countUnread(actor: AuthenticatedActor): Promise<number>;
  markRead(actor: AuthenticatedActor, notificationId: string, command: ProductionCommandContext): Promise<NotificationView>;
  markAllRead(actor: AuthenticatedActor, command: ProductionCommandContext): Promise<{ marked: number }>;
  listAdmin(actor: AuthenticatedActor, page: PageRequest): Promise<CursorPage<NotificationView>>;
}

function emptyChannelCounts(): Record<NotificationChannelStatus, number> {
  return { NOT_AVAILABLE: 0, SKIPPED: 0, DELIVERED: 0, FAILED: 0 };
}

function toView(record: NotificationRecord): NotificationView {
  return { ...record, readState: record.isRead ? 'READ' : 'UNREAD' };
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Le compte de l'acteur doit être ACTIVE : un compte inactif n'agit pas. */
async function requireAccount(stores: NotificationStores, actor: AuthenticatedActor): Promise<void> {
  const account = await stores.users.findById(actor.id);
  if (!account) throw new ApiError('UNAUTHENTICATED', 'Compte introuvable.');
  if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'Ce compte n’est pas actif.');
}

function requireCommand(command: ProductionCommandContext | undefined): ProductionCommandContext {
  if (!command) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
  return command;
}

interface EventParties {
  employerId?: string;
  workerId?: string;
  /** Le contrat de l'événement, uniquement s'il est RÉELLEMENT résolu en base. */
  contractId?: string;
}

export function createNotificationService(
  dependencies: NotificationServiceDependencies,
): OpenNotificationService {
  const { database, createStores } = dependencies;
  const channels = dependencies.channels ?? createNotificationChannelRegistry();
  const clock = dependencies.now ?? (() => new Date());

  const inTransaction = <T>(operation: (stores: NotificationStores) => Promise<T>): Promise<T> =>
    database.run(async transaction => operation(createStores(transaction)));

  /* ---------------------------------------------------------------- */
  /* Résolution des destinataires (jamais une diffusion globale)       */
  /* ---------------------------------------------------------------- */

  const resolveParties = async (
    transaction: SqlTransaction,
    event: NotificationEventLike,
    payload: Record<string, unknown>,
  ): Promise<EventParties> => {
    let contractId = text(payload.contractId);
    if (!contractId && event.aggregateType.toUpperCase() === 'CLAIM') {
      const claim = await transaction.query<{ contract_id: string }>(
        'SELECT contract_id FROM claims WHERE claim_id = $1',
        [event.aggregateId],
      );
      contractId = claim.rows[0]?.contract_id;
    }
    if (contractId) {
      const contract = await transaction.query<{ employer_id: string; candidate_id: string }>(
        'SELECT employer_id, candidate_id FROM contracts WHERE id = $1',
        [contractId],
      );
      const row = contract.rows[0];
      if (row) return { employerId: row.employer_id, workerId: row.candidate_id, contractId };
    }
    const employerId = text(payload.employerId);
    const workerId = text(payload.employeeId) ?? text(payload.candidateId);
    return {
      ...(employerId ? { employerId } : {}),
      ...(workerId ? { workerId } : {}),
    };
  };

  /**
   * Un destinataire n'est retenu que s'il existe en base ET si son rôle est
   * celui attendu pour le sélecteur. Tout autre cas l'écarte : jamais un envoi
   * à un tiers, et jamais un échec global de l'événement pour un seul candidat
   * invalide.
   */
  const isEligibleRecipient = async (
    stores: NotificationStores,
    userId: string,
    expectedRole: 'EMPLOYER' | 'CANDIDATE' | 'ADMIN',
  ): Promise<boolean> => {
    const account = await stores.users.findById(userId);
    return Boolean(account && account.role === expectedRole);
  };

  /** L'agrégat de l'événement est-il un dossier RÉELLEMENT persisté ? */
  const aggregateIsPersisted = async (
    stores: NotificationStores,
    event: NotificationEventLike,
    parties: EventParties,
  ): Promise<boolean> => {
    if (parties.contractId) return true;
    if (event.aggregateType.toUpperCase() !== 'CLAIM') return false;
    const result = await stores.sql.query<{ claim_id: string }>(
      'SELECT claim_id FROM claims WHERE claim_id = $1',
      [event.aggregateId],
    );
    return Boolean(result.rows[0]);
  };

  const resolveRecipients = async (
    stores: NotificationStores,
    event: NotificationEventLike,
    parties: EventParties,
    audiences: readonly NotificationAudienceSelector[],
    payload: Record<string, unknown>,
  ): Promise<Array<{ userId: string; role: 'EMPLOYER' | 'CANDIDATE' | 'ADMIN' }>> => {
    const resolved: Array<{ userId: string; role: 'EMPLOYER' | 'CANDIDATE' | 'ADMIN' }> = [];
    const seen = new Set<string>();
    const add = (userId: string | undefined, role: 'EMPLOYER' | 'CANDIDATE' | 'ADMIN') => {
      if (!userId || seen.has(userId)) return;
      seen.add(userId);
      resolved.push({ userId, role });
    };

    const adminsAreRelevant = audiences.includes('ADMIN')
      ? await aggregateIsPersisted(stores, event, parties)
      : false;

    for (const audience of audiences) {
      if (audience === 'EMPLOYER') {
        add(parties.employerId, 'EMPLOYER');
      } else if (audience === 'WORKER') {
        add(parties.workerId, 'CANDIDATE');
      } else if (audience === 'ADMIN') {
        // Les ADMIN ne sont ciblés que si l'agrégat est un dossier PERSISTÉ :
        // sans dossier à examiner, aucun administrateur n'est notifié. La
        // sélection reste bornée (`MAX_ADMIN_RECIPIENTS`), jamais « tous ».
        if (!adminsAreRelevant) continue;
        for (const admin of await stores.notifications.listActiveAdmins(MAX_ADMIN_RECIPIENTS)) {
          add(admin.userId, 'ADMIN');
        }
      } else if (audience === 'OTHER_PARTY') {
        // L'auteur (`payload.party`) est exclu, jamais deviné : sans `party`
        // persisté, la partie « autre » n'est pas déterminable.
        const party = text(payload.party);
        if (party === 'EMPLOYER') add(parties.workerId, 'CANDIDATE');
        else if (party === 'EMPLOYEE') add(parties.employerId, 'EMPLOYER');
      }
    }

    const verified: Array<{ userId: string; role: 'EMPLOYER' | 'CANDIDATE' | 'ADMIN' }> = [];
    for (const candidate of resolved) {
      if (await isEligibleRecipient(stores, candidate.userId, candidate.role)) verified.push(candidate);
    }
    return verified;
  };

  /* ---------------------------------------------------------------- */
  /* Livraison                                                         */
  /* ---------------------------------------------------------------- */

  const attemptChannels = async (
    stores: NotificationStores,
    record: NotificationRecord,
    counts: { push: Record<NotificationChannelStatus, number>; email: Record<NotificationChannelStatus, number> },
  ): Promise<void> => {
    const target: NotificationDeliveryTarget = {
      notificationId: record.id,
      recipientId: record.recipientId,
      recipientRole: record.recipientRole,
      type: record.type,
      title: record.title,
      message: record.message,
      payload: record.payload,
      createdAt: record.createdAt,
    };
    // ORDRE DE CANAL : In-App (déjà persistée) → PUSH → EMAIL.
    for (const kind of ['PUSH', 'EMAIL'] as const) {
      const bucket = kind === 'PUSH' ? counts.push : counts.email;
      if (!channels.isAvailable(kind)) {
        // Aucun provider : aucun appel, aucun état écrit. `NOT_AVAILABLE` ne
        // prétend jamais qu'un envoi a eu lieu.
        bucket.NOT_AVAILABLE += 1;
        continue;
      }
      const status = await channels.deliver(kind, target);
      bucket[status] += 1;
      await stores.notifications.recordChannelOutcome(record.id, kind, status, clock().toISOString());
    }
  };

  const deliverForEvent = async (event: NotificationEventLike): Promise<NotificationDeliveryReport> => {
    const intents = resolveNotificationIntents(event);
    const report: NotificationDeliveryReport = {
      eventId: event.eventId,
      eventType: event.eventType,
      intents: intents.length,
      created: 0,
      duplicates: 0,
      recipients: [],
      push: emptyChannelCounts(),
      email: emptyChannelCounts(),
    };
    if (intents.length === 0) {
      report.reason = 'Aucune règle de notification pour cet événement (UNMAPPED).';
      return report;
    }

    return inTransaction(async stores => {
      for (const intent of intents) {
        const payload = event.payload ?? {};
        const parties = await resolveParties(stores.sql, event, payload);
        const recipients = await resolveRecipients(stores, event, parties, intent.audiences, payload);
        const at = clock().toISOString();

        for (const recipient of recipients) {
          const record: NotificationRecord = {
            id: newEntityId('ntf'),
            recipientId: recipient.userId,
            recipientRole: recipient.role,
            type: intent.notificationType,
            title: intent.title,
            message: intent.message,
            ...(intent.link ? { linkRef: intent.link } : {}),
            sourceEventId: event.eventId,
            sourceEventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: intent.payload,
            dedupeKey: intent.dedupeKey,
            isRead: false,
            pushStatus: 'NOT_AVAILABLE',
            emailStatus: 'NOT_AVAILABLE',
            createdAt: at,
            updatedAt: at,
          };
          // CANAL 1 — IN-APP : l'écriture est le canal. Un rejeu renvoie la
          // ligne existante, jamais une seconde.
          const stored = await stores.notifications.createIfAbsent(record);
          if (stored.kind === 'created') report.created += 1;
          else report.duplicates += 1;
          if (!report.recipients.includes(recipient.userId)) report.recipients.push(recipient.userId);
          // CANAUX 2 et 3 — PUSH puis EMAIL, uniquement si un provider est
          // réellement disponible.
          await attemptChannels(stores, stored.notification, report);
        }
      }
      return report;
    });
  };

  /* ---------------------------------------------------------------- */
  /* Lecture et marquage (routes `notifications.*` du catalogue)       */
  /* ---------------------------------------------------------------- */

  const pageOf = (records: NotificationRecord[], page: PageRequest): CursorPage<NotificationView> => {
    const hasMore = records.length > page.limit;
    const visible = records.slice(0, page.limit);
    return {
      items: visible.map(toView),
      cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].id : null,
      limit: page.limit,
      hasMore,
    };
  };

  const boundedLimit = (page: PageRequest): number =>
    Number.isFinite(page.limit) ? Math.min(Math.max(Math.trunc(page.limit), 1), MAX_PAGE_ITEMS - 1) : 25;

  /** Idempotence durable EXISTANTE : même convention que le repository Claim. */
  const executeCommand = async <T>(
    actor: AuthenticatedActor,
    command: ProductionCommandContext,
    payload: unknown,
    operation: (stores: NotificationStores, at: string) => Promise<T>,
  ): Promise<T> => {
    requireCommand(command);
    const actorId = actor.id;
    return inTransaction(async stores => {
      await requireAccount(stores, actor);
      const outcome = await stores.idempotency.reserve({
        actorId,
        command: command.command,
        key: command.idempotencyKey,
        payloadHash: await sha256Fingerprint(JSON.stringify(payload)),
      });
      if (outcome.kind === 'conflict') {
        throw new ApiError('IDEMPOTENCY_CONFLICT', 'Clé d’idempotence déjà utilisée avec une charge utile différente.', undefined, 409);
      }
      if (outcome.kind === 'in-progress') {
        throw new ApiError('BUSINESS_RULE_VIOLATION', 'Une commande concurrente traite déjà cette notification : rejouez la requête.', undefined, 409);
      }
      if (outcome.kind === 'replay') return outcome.result as T;
      const result = await operation(stores, clock().toISOString());
      await stores.idempotency.complete(actorId, command.command, command.idempotencyKey, result);
      return result;
    });
  };

  return {
    deliverForEvent,

    async listMine(suppliedActor, page, readState = null) {
      const actor = suppliedActor;
      return inTransaction(async stores => {
        await requireAccount(stores, actor);
        const effective: PageRequest = { cursor: page.cursor, limit: boundedLimit(page) };
        const records = await stores.notifications.listForRecipient(actor.id, {
          limit: effective.limit + 1,
          afterId: effective.cursor,
          readState,
        });
        return pageOf(records, effective);
      });
    },

    async countUnread(suppliedActor) {
      const actor = suppliedActor;
      return inTransaction(async stores => {
        await requireAccount(stores, actor);
        return stores.notifications.countUnread(actor.id);
      });
    },

    async markRead(suppliedActor, notificationId, suppliedCommand) {
      const actor = suppliedActor;
      const command = requireCommand(suppliedCommand);
      return executeCommand(actor, command, { notificationId }, async (stores, at) => {
        const existing = await stores.notifications.findById(notificationId);
        // Un identifiant inexistant ET un identifiant appartenant à un autre
        // utilisateur produisent la MÊME réponse : aucune fuite d'existence.
        if (!existing || existing.recipientId !== actor.id) {
          throw new ApiError('NOT_FOUND', 'Notification introuvable.');
        }
        const updated = await stores.notifications.markRead(notificationId, actor.id, at);
        if (!updated) throw new ApiError('NOT_FOUND', 'Notification introuvable.');
        // Une seule entrée d'audit par commande : le rejeu est absorbé par
        // l'idempotence durable AVANT d'atteindre cette écriture.
        await stores.audit.append({
          id: newEntityId('rev'),
          actorId: actor.id,
          timestamp: at,
          entityId: notificationId,
          action: NOTIFICATION_READ_ACTION,
          source: NOTIFICATION_API_SOURCE,
          reference: command.idempotencyKey,
          afterState: { notificationId, readState: 'READ', recipientRole: existing.recipientRole },
        });
        return toView(updated);
      });
    },

    async markAllRead(suppliedActor, suppliedCommand) {
      const actor = suppliedActor;
      const command = requireCommand(suppliedCommand);
      return executeCommand(actor, command, { scope: 'ALL' }, async (stores, at) => {
        const marked = await stores.notifications.markAllRead(actor.id, at);
        await stores.audit.append({
          id: newEntityId('rev'),
          actorId: actor.id,
          timestamp: at,
          entityId: actor.id,
          action: NOTIFICATION_READ_ALL_ACTION,
          source: NOTIFICATION_API_SOURCE,
          reference: command.idempotencyKey,
          afterState: { marked },
        });
        return { marked };
      });
    },

    async listAdmin(suppliedActor, page) {
      const actor = suppliedActor;
      return inTransaction(async stores => {
        await requireAccount(stores, actor);
        const effective: PageRequest = { cursor: page.cursor, limit: boundedLimit(page) };
        const records = await stores.notifications.listAll({
          limit: effective.limit + 1,
          afterId: effective.cursor,
        });
        return pageOf(records, effective);
      });
    },
  };
}
