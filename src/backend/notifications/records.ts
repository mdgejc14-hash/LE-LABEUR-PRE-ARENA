/**
 * LE LABEUR — P0-NOTIFICATIONS — records et port de persistance.
 *
 * Les formes manipulées ici ne sont PAS de nouvelles abstractions de domaine :
 * elles projettent le modèle `AppNotification` DÉJÀ déclaré par le dépôt
 * (`src/types/index.ts` : `id`, `recipientId`, `recipientRole`, `type`, `title`,
 * `message`, `linkRef`, `dedupeKey`, `isRead`, `createdAt`) augmenté de la
 * traçabilité d'événement source exigée par cette tranche.
 *
 * Aucun canal externe n'est représenté ici : le tableau de bord des canaux vit
 * dans `channels.ts` (abstraction seulement, aucun provider réel).
 */

import type { NotificationType, UserRole } from '../../types';

/**
 * Ordre de canal À PRÉSERVER : In-App d'abord, puis Push, puis Email.
 * Toute livraison parcourt ce tableau dans cet ordre exact.
 */
export const NOTIFICATION_CHANNEL_ORDER = ['IN_APP', 'PUSH', 'EMAIL'] as const;
export type NotificationChannelKind = (typeof NOTIFICATION_CHANNEL_ORDER)[number];

/**
 * État RÉEL d'un canal pour une notification donnée. `NOT_AVAILABLE` est l'état
 * honnête quand aucun provider n'est injecté : il ne signifie jamais « envoyé ».
 * `SKIPPED` signifie qu'un provider existe mais que le destinataire n'a pas de
 * cible de livraison persistée (aucun jeton d'appareil, aucun email disponible).
 */
export const NOTIFICATION_CHANNEL_STATUSES = ['NOT_AVAILABLE', 'SKIPPED', 'DELIVERED', 'FAILED'] as const;
export type NotificationChannelStatus = (typeof NOTIFICATION_CHANNEL_STATUSES)[number];

/** Statut de lecture, dérivé de `isRead` du modèle. */
export type NotificationReadState = 'READ' | 'UNREAD';

export interface NotificationRecord {
  id: string;
  recipientId: string;
  recipientRole: UserRole;
  /** `NotificationType` réel du modèle — jamais un nom inventé. */
  type: NotificationType;
  title: string;
  message: string;
  linkRef?: { screen: string; id?: string };
  /** Événement métier à l'origine de cette notification (traçabilité). */
  sourceEventId?: string;
  sourceEventType?: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
  /** Clé d'idempotence : (`recipientId`, `dedupeKey`) est unique en base. */
  dedupeKey: string;
  isRead: boolean;
  readAt?: string;
  pushStatus: NotificationChannelStatus;
  emailStatus: NotificationChannelStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListQuery {
  limit: number;
  afterId?: string | null;
  /** Filtre explicite du propriétaire : `UNREAD` n'expose que les non lues. */
  readState?: NotificationReadState | null;
}

export interface NotificationStore {
  /**
   * Création idempotente : la contrainte d'unicité `(recipient_id, dedupe_key)`
   * fait qu'un second appel — y compris concurrent — renvoie la ligne existante
   * au lieu d'en insérer une seconde.
   */
  createIfAbsent(record: NotificationRecord): Promise<{ kind: 'created'; notification: NotificationRecord } | { kind: 'duplicate'; notification: NotificationRecord }>;
  findById(notificationId: string): Promise<NotificationRecord | null>;
  listForRecipient(recipientId: string, query: NotificationListQuery): Promise<NotificationRecord[]>;
  listAll(query: NotificationListQuery): Promise<NotificationRecord[]>;
  countUnread(recipientId: string): Promise<number>;
  /** Compare-and-set de lecture : une notification déjà lue ne recule jamais. */
  markRead(notificationId: string, recipientId: string, at: string): Promise<NotificationRecord | null>;
  markAllRead(recipientId: string, at: string): Promise<number>;
  /**
   * Enregistre l'état RÉEL d'un canal externe (Push ou Email). Sans provider
   * injecté, la valeur écrite reste `NOT_AVAILABLE` : jamais un faux « envoyé ».
   */
  recordChannelOutcome(
    notificationId: string,
    channel: 'PUSH' | 'EMAIL',
    status: NotificationChannelStatus,
    at: string,
  ): Promise<void>;
  /**
   * Résolution des destinataires ADMIN autorisés (`notifications:read:any`).
   * Bornée : jamais « tous les utilisateurs ».
   */
  listActiveAdmins(limit: number): Promise<Array<{ userId: string; role: UserRole }>>;
}
