/**
 * LE LABEUR — P0-NOTIFICATIONS — adaptateur PostgreSQL de la boîte In-App.
 *
 * Même frontière que `sqlClaimStores.ts` / `sqlPaymentStores.ts` : ce module ne
 * crée aucune connexion et n'importe aucun pilote ; il reçoit un
 * `SqlQueryExecutor` (base racine ou transaction courante).
 *
 * Aucune table de canal externe n'est touchée : seuls `notifications` et
 * `users` (résolution des ADMIN autorisés) sont lus ou écrits.
 */

import type { UserRole } from '../../types';
import type { SqlQueryExecutor } from '../services/database';
import { postgresErrorCode } from './sqlClient';
import type {
  NotificationChannelStatus,
  NotificationListQuery,
  NotificationReadState,
  NotificationRecord,
  NotificationStore,
} from '../notifications/records';

const UNIQUE_VIOLATION = '23505';

function readText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function readOptionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return readText(value);
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedLimit(limit: number, max = 101): number {
  if (!Number.isFinite(limit)) return 25;
  const value = Math.trunc(limit);
  if (value < 1) return 25;
  return Math.min(value, max);
}

interface NotificationRow {
  id: string;
  recipient_id: string;
  recipient_role: UserRole;
  type: NotificationRecord['type'];
  title: string;
  message: string;
  link_screen: string | null;
  link_id: string | null;
  source_event_id: string | null;
  source_event_type: string | null;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload: unknown;
  dedupe_key: string;
  is_read: boolean;
  read_at: unknown;
  push_status: NotificationChannelStatus;
  email_status: NotificationChannelStatus;
  created_at: unknown;
  updated_at: unknown;
}

function toNotification(row: NotificationRow): NotificationRecord {
  const linkScreen = readOptionalText(row.link_screen);
  const linkId = readOptionalText(row.link_id);
  const sourceEventId = readOptionalText(row.source_event_id);
  const sourceEventType = readOptionalText(row.source_event_type);
  const aggregateType = readOptionalText(row.aggregate_type);
  const aggregateId = readOptionalText(row.aggregate_id);
  const readAt = readOptionalText(row.read_at);
  return {
    id: row.id,
    recipientId: row.recipient_id,
    recipientRole: row.recipient_role,
    type: row.type,
    title: row.title,
    message: row.message,
    ...(linkScreen ? { linkRef: { screen: linkScreen, ...(linkId ? { id: linkId } : {}) } } : {}),
    ...(sourceEventId ? { sourceEventId } : {}),
    ...(sourceEventType ? { sourceEventType } : {}),
    ...(aggregateType ? { aggregateType } : {}),
    ...(aggregateId ? { aggregateId } : {}),
    payload: readJsonObject(row.payload),
    dedupeKey: row.dedupe_key,
    isRead: row.is_read,
    ...(readAt ? { readAt } : {}),
    pushStatus: row.push_status,
    emailStatus: row.email_status,
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
  };
}

const COLUMNS = `id, recipient_id, recipient_role, type, title, message, link_screen, link_id,
  source_event_id, source_event_type, aggregate_type, aggregate_id, payload, dedupe_key,
  is_read, read_at, push_status, email_status, created_at, updated_at`;

function readStateFilter(readState: NotificationReadState | null | undefined): string {
  if (readState === 'UNREAD') return ' AND notifications.is_read = FALSE';
  if (readState === 'READ') return ' AND notifications.is_read = TRUE';
  return '';
}

export function createSqlNotificationStore(db: SqlQueryExecutor): NotificationStore {
  /**
   * Pagination par curseur. Le prédicat est EXACTEMENT cohérent avec l'ordre
   * `created_at DESC, id ASC` : `created_at < curseur` OU (`created_at` égal ET
   * `id > curseur`). C'est la même forme que `sqlClaimStores.listForClaimant` :
   * deux notifications créées dans la même milliseconde restent donc
   * strictement ordonnées, jamais rejouées ni sautées.
   *
   * Placements : les valeurs du `where` occupent $1..$n, la LIMITE est $n+1 et
   * le curseur — quand il existe — est $n+2.
   */
  const page = async (
    where: string,
    values: readonly unknown[],
    query: NotificationListQuery,
  ): Promise<NotificationRecord[]> => {
    const afterId = query.afterId ?? null;
    const limitIndex = values.length + 1;
    const cursorIndex = values.length + 2;
    const cursorFilter = afterId
      ? ` AND (notifications.created_at < cursor.created_at
              OR (notifications.created_at = cursor.created_at AND notifications.id > cursor.id))`
      : '';
    const join = afterId ? ` JOIN notifications AS cursor ON cursor.id = $${cursorIndex}` : '';
    const params: readonly unknown[] = afterId
      ? [...values, boundedLimit(query.limit), afterId]
      : [...values, boundedLimit(query.limit)];
    const result = await db.query<NotificationRow>(
      `SELECT notifications.* FROM notifications${join}
        WHERE ${where}${cursorFilter}${readStateFilter(query.readState)}
        ORDER BY notifications.created_at DESC, notifications.id ASC
        LIMIT $${limitIndex}`,
      params,
    );
    return result.rows.map(toNotification);
  };

  return {
    async createIfAbsent(record) {
      try {
        const inserted = await db.query<NotificationRow>(
          `INSERT INTO notifications (
             id, recipient_id, recipient_role, type, title, message, link_screen, link_id,
             source_event_id, source_event_type, aggregate_type, aggregate_id, payload, dedupe_key,
             is_read, read_at, push_status, email_status, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT (recipient_id, dedupe_key) DO NOTHING
           RETURNING ${COLUMNS}`,
          [
            record.id,
            record.recipientId,
            record.recipientRole,
            record.type,
            record.title,
            record.message,
            record.linkRef?.screen ?? null,
            record.linkRef?.id ?? null,
            record.sourceEventId ?? null,
            record.sourceEventType ?? null,
            record.aggregateType ?? null,
            record.aggregateId ?? null,
            JSON.stringify(record.payload ?? {}),
            record.dedupeKey,
            record.isRead,
            record.readAt ?? null,
            record.pushStatus,
            record.emailStatus,
            record.createdAt,
            record.updatedAt,
          ],
        );
        if (inserted.rows[0]) return { kind: 'created', notification: toNotification(inserted.rows[0]) };
        // `DO NOTHING` sans ligne retournée = la ligne existait déjà (rejeu,
        // concurrence ou retry de worker) : l'existante est relue, jamais dupliquée.
        const existing = await db.query<NotificationRow>(
          `SELECT ${COLUMNS} FROM notifications WHERE recipient_id = $1 AND dedupe_key = $2`,
          [record.recipientId, record.dedupeKey],
        );
        if (!existing.rows[0]) throw new Error('Notification idempotente introuvable après conflit.');
        return { kind: 'duplicate', notification: toNotification(existing.rows[0]) };
      } catch (error) {
        // Une course concurrente sur l'index unique est un DOUBLON, pas un échec.
        if (postgresErrorCode(error) !== UNIQUE_VIOLATION) throw error;
        const existing = await db.query<NotificationRow>(
          `SELECT ${COLUMNS} FROM notifications WHERE recipient_id = $1 AND dedupe_key = $2`,
          [record.recipientId, record.dedupeKey],
        );
        if (!existing.rows[0]) throw error;
        return { kind: 'duplicate', notification: toNotification(existing.rows[0]) };
      }
    },

    async findById(notificationId) {
      const result = await db.query<NotificationRow>(
        `SELECT ${COLUMNS} FROM notifications WHERE id = $1`,
        [notificationId],
      );
      return result.rows[0] ? toNotification(result.rows[0]) : null;
    },

    async listForRecipient(recipientId, query) {
      return page('notifications.recipient_id = $1', [recipientId], query);
    },

    async listAll(query) {
      return page('TRUE', [], query);
    },

    async countUnread(recipientId) {
      const result = await db.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM notifications WHERE recipient_id = $1 AND is_read = FALSE',
        [recipientId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },

    async markRead(notificationId, recipientId, at) {
      const updated = await db.query<NotificationRow>(
        `UPDATE notifications
            SET is_read = TRUE, read_at = $3, updated_at = $3
          WHERE id = $1 AND recipient_id = $2 AND is_read = FALSE
          RETURNING ${COLUMNS}`,
        [notificationId, recipientId, at],
      );
      if (updated.rows[0]) return toNotification(updated.rows[0]);
      // Déjà lue (rejeu idempotent) : la ligne du PROPRIÉTAIRE est relue telle
      // quelle. Un identifiant étranger ne retourne jamais rien.
      const existing = await db.query<NotificationRow>(
        `SELECT ${COLUMNS} FROM notifications WHERE id = $1 AND recipient_id = $2`,
        [notificationId, recipientId],
      );
      return existing.rows[0] ? toNotification(existing.rows[0]) : null;
    },

    async markAllRead(recipientId, at) {
      const result = await db.query<{ id: string }>(
        `UPDATE notifications
            SET is_read = TRUE, read_at = $2, updated_at = $2
          WHERE recipient_id = $1 AND is_read = FALSE
          RETURNING id`,
        [recipientId, at],
      );
      return result.rowCount;
    },

    async recordChannelOutcome(notificationId, channel, status, at) {
      const column = channel === 'PUSH' ? 'push_status' : 'email_status';
      await db.query(
        `UPDATE notifications SET ${column} = $2, updated_at = $3 WHERE id = $1`,
        [notificationId, status, at],
      );
    },

    async listActiveAdmins(limit) {
      const result = await db.query<{ id: string; role: UserRole }>(
        `SELECT id, role FROM users
          WHERE role = 'ADMIN' AND status = 'ACTIVE'
          ORDER BY id ASC
          LIMIT $1`,
        [boundedLimit(limit, 25)],
      );
      return result.rows.map(row => ({ userId: row.id, role: row.role }));
    },
  };
}
