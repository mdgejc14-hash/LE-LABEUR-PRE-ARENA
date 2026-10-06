/**
 * LE LABEUR — P0-NOTIFICATIONS — processeur de notification branché sur
 * l'automatisation EXISTANTE.
 *
 * Ce module n'est PAS un moteur : il implémente le contrat
 * `SupplementalAutomationProcessor` DÉJÀ déclaré par
 * `src/backend/automation/worker.ts`. Il hérite donc, sans une ligne de code
 * supplémentaire :
 *   - du claim verrouillé de l'Outbox (`FOR UPDATE SKIP LOCKED`) ;
 *   - du compteur de tentatives, du RETRY et du DEAD_LETTER ;
 *   - de l'idempotence durable et du ledger d'audit EXISTANTS.
 *
 * Un événement est observé, jamais « volé » : le worker route le même message
 * vers TOUS les processeurs qui déclarent son type, et l'idempotence de la
 * notification (clé `(recipientId, dedupeKey)`) rend le rejeu inoffensif.
 */

import type { SupplementalAutomationProcessor } from '../automation/worker';
import type { DomainEventType, PersistedOutboxEvent } from '../automation/foundation';
import type { OpenNotificationService } from './notificationService';

/**
 * Types d'événements RÉELLEMENT couverts par une règle de notification. Cette
 * liste est l'exact pendant typé de `NOTIFICATION_EVENT_COVERAGE` filtré sur
 * `MAPPED` ; un test vérifie que les deux restent identiques, pour qu'aucune
 * règle ne puisse exister sans être déclarée dans l'audit de couverture (et
 * inversement).
 */
export const NOTIFICATION_AUTOMATION_EVENT_TYPES: readonly DomainEventType[] = [
  /* CANDIDATURE */
  'APPLICATION_SUBMITTED',
  'APPLICATION_SHORTLISTED',
  'APPLICATION_REJECTED',
  'APPLICATION_WITHDRAWN',
  /* PROPOSITION */
  'PROPOSAL_SENT',
  'PROPOSAL_ACCEPTED',
  'PROPOSAL_DECLINED',
  /* CONTRAT */
  'CONTRACT_SENT',
  'CONTRACT_SIGNED',
  'CONTRACT_ACTIVATED',
  'CONTRACT_TERMINATED',
  /* LITIGE */
  'CLAIM_CREATED',
  'CLAIM_EVIDENCE_REQUESTED',
  'CLAIM_EVIDENCE_SUBMITTED',
  'CLAIM_DEADLINE_REACHED',
  'CLAIM_ESCALATED',
  'CLAIM_RESTRICTION_APPLIED',
  'CLAIM_RESTRICTION_RELEASED',
  'CLAIM_RESOLVED',
  'CLAIM_REJECTED',
  /* PAIEMENT / SALAIRE */
  'PAYMENT_DUE',
  'PAYMENT_DECLARED',
  'PAYMENT_PENDING_VERIFICATION',
  'PAYMENT_APPROVED',
  'PAYMENT_VERIFIED',
  'PAYMENT_PAID',
  'PAYMENT_REJECTED',
  'PAYMENT_OVERDUE_J3',
  'NOTIFICATION_REQUIRED',
  'SALARY_CONFIRMATION_REQUESTED',
  'SALARY_CONFIRMED',
];

export interface NotificationAutomationDependencies {
  service: OpenNotificationService;
}

/**
 * Convertit un événement d'Outbox persisté en événement métier du catalogue,
 * sans rien réinterpréter : la charge utile est transmise telle qu'elle a été
 * persistée par le producteur.
 */
export function toNotificationEvent(event: PersistedOutboxEvent) {
  return {
    eventId: event.eventId,
    eventType: event.eventType as string,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload
      : {}) as Record<string, unknown>,
  };
}

export function createNotificationAutomation(
  dependencies: NotificationAutomationDependencies,
): SupplementalAutomationProcessor {
  const { service } = dependencies;

  return {
    handledEventTypes: NOTIFICATION_AUTOMATION_EVENT_TYPES,
    /** Aucun type de job : la notification n'introduit aucun ordonnancement. */
    handledJobTypes: [],

    async handleEvent(event) {
      const report = await service.deliverForEvent(toNotificationEvent(event));
      // Aucun destinataire valide ou règle absente ne sont PAS des échecs :
      // l'événement est traité, simplement sans notification (un échec réel
      // lèverait une exception et déclencherait le retry EXISTANT).
      return report.created > 0 ? 'completed' : report.duplicates > 0 ? 'duplicate' : 'completed';
    },

    async handleJob() {
      // Inatteignable : `handledJobTypes` est vide, donc le worker ne confie
      // jamais de job à ce processeur.
      throw new Error('La notification ne traite aucun job planifié.');
    },
  };
}
