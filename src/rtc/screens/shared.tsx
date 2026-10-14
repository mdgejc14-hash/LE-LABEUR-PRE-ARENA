/**
 * RTC — utilitaires partagés des huit écrans (aucun écran ici).
 *
 *  - sentinelle « non installé » : le serveur répond 501 quand la
 *    persistance PostgreSQL n'est pas composée (handlers WebRTC absents).
 *    L'écran l'affiche comme indisponible, jamais comme liste vide ni
 *    donnée simulée ;
 *  - teintes des statuts réels de Session et dérivations strictes depuis
 *    `WebRtcSessionView` (comptes, jalons, durées entre horodatages réels).
 */

import type { SealTone } from '../../design-system/components';
import { ApiClientError } from '../../repositories/apiClient';
import type {
  WebRtcSessionStatus,
  WebRtcSessionView,
} from '../api';
import {
  formatDateTime,
  formatDuration,
  participantRoleLabel,
  sessionStatusLabel,
} from '../vocabulary';

/** Sentinelle honnête : le backend répond 501 lorsque la persistance n'est pas installée. */
export interface RtcUnavailable {
  readonly unavailable: true;
}

const UNAVAILABLE: RtcUnavailable = { unavailable: true };

export function isRtcUnavailable(value: unknown): value is RtcUnavailable {
  return typeof value === 'object' && value !== null && (value as { unavailable?: unknown }).unavailable === true;
}

export async function unavailableWhenNotInstalled<T>(task: () => Promise<T>): Promise<T | RtcUnavailable> {
  try {
    return await task();
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.status === 501) return UNAVAILABLE;
    throw cause;
  }
}

/** Teinte d'affichage d'un statut réel de Session (jamais un statut renommé). */
export const SESSION_STATUS_TONES: Record<WebRtcSessionStatus, SealTone> = {
  CREATED: 'slate',
  CONNECTING: 'amber',
  ACTIVE: 'emerald',
  CLOSED: 'slate',
  EXPIRED: 'slate',
  FAILED: 'clay',
};

export function sessionStatusTone(status: WebRtcSessionStatus): SealTone {
  return SESSION_STATUS_TONES[status];
}

/** La Session accepte encore des entrées (ni terminée, ni expirée, ni échouée). */
export function isLiveSession(status: WebRtcSessionStatus): boolean {
  return status === 'CREATED' || status === 'CONNECTING' || status === 'ACTIVE';
}

/** Participants réellement entrés (joinedAt présent). */
export function joinedParticipants(session: WebRtcSessionView): number {
  return session.participants.filter((participant) => Boolean(participant.joinedAt)).length;
}

/** Rôle réel de l'initiateur, ou `null` si la Session ne le rattache à aucun participant. */
export function initiatorRole(session: WebRtcSessionView): string | null {
  const initiator = session.participants.find((participant) => participant.userId === session.initiatorId);
  return initiator ? participantRoleLabel(initiator.role) : null;
}

/** Faits réels d'une Session, affichables tels quels (jamais une valeur inventée). */
export function sessionFacts(session: WebRtcSessionView): readonly { label: string; value: string }[] {
  return [
    { label: 'Statut', value: `${sessionStatusLabel(session.status)} (${session.status})` },
    { label: 'Contrat', value: session.entityId },
    { label: 'Créée le', value: formatDateTime(session.createdAt) ?? '—' },
    { label: 'Expire le', value: formatDateTime(session.expiresAt) ?? '—' },
    { label: 'Clôturée le', value: session.closedAt ? (formatDateTime(session.closedAt) ?? '—') : '—' },
    { label: 'Durée', value: formatDuration(session.createdAt, session.closedAt) ?? '—' },
    { label: 'Entrées', value: `${joinedParticipants(session)} / ${session.participants.length}` },
  ];
}

/** Jalons réels d'une Session pour la frise (jamais une échéance calculée). */
export function sessionMilestones(session: WebRtcSessionView): readonly { label: string; detail?: string; done: boolean }[] {
  const steps: { label: string; detail?: string; done: boolean }[] = [
    { label: 'Session créée', detail: formatDateTime(session.createdAt) ?? undefined, done: true },
  ];
  for (const participant of session.participants) {
    steps.push({
      label: `${participantRoleLabel(participant.role)} entré`,
      detail: participant.joinedAt ? (formatDateTime(participant.joinedAt) ?? undefined) : 'non entré',
      done: Boolean(participant.joinedAt),
    });
  }
  if (session.status === 'ACTIVE') {
    steps.push({ label: 'Session active', done: true });
  } else if (session.closedAt) {
    steps.push({
      label: `${sessionStatusLabel(session.status)} (${session.status})`,
      detail: formatDateTime(session.closedAt) ?? undefined,
      done: true,
    });
  } else {
    steps.push({ label: 'Session active', detail: 'non atteinte', done: false });
  }
  return steps;
}
