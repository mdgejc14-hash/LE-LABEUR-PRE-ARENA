import type { OutboxEvent, OutboxEventType, OutboxRepository } from '../productionContracts';

export interface OutboxEffectContract {
  eventType: OutboxEventType;
  sideEffects: readonly string[];
  idempotencyKey: string;
}

/**
 * Catalogue d'intentions d'effets asynchrones, distinct de leur implémentation.
 * P0-AUTO relie seulement APPLICATION_SUBMITTED au worker local; son handler
 * persiste une trace d'audit et n'envoie aucune notification métier.
 */
export const OUTBOX_EFFECT_CONTRACTS: readonly OutboxEffectContract[] = [
  { eventType: 'PAYMENT_DECLARED', sideEffects: ['notify the relevant reviewer', 'update payment activity feed'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_APPROVED', sideEffects: ['notify employer and employee', 'refresh schedule state'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_REJECTED', sideEffects: ['notify employer with the recorded reason', 'refresh schedule state'], idempotencyKey: 'event.id' },
  /**
   * Cycle CONTRAT — porté par P0-F.
   *
   * Les types du cycle sont documentés, mais aucun producteur CONTRACT_* ni
   * handler/notification de domaine n'est branché à l'Automation. Les
   * transitions restent persistées par le repository CONTRAT sans effet
   * asynchrone. Charges utiles et clés de déduplication de référence :
   * `src/domain/contractTransitions.ts` (`DOCUMENTED_CONTRACT_EVENTS`).
   */
  { eventType: 'CONTRACT_SIGNED', sideEffects: ['notify both parties', 'refresh offer and application views'], idempotencyKey: 'contractId + SIGNED + party' },
  { eventType: 'CONTRACT_CREATED', sideEffects: ['no asynchronous effect in P0-F'], idempotencyKey: 'contractId + CREATED' },
  { eventType: 'CONTRACT_SENT', sideEffects: ['notify the target employee'], idempotencyKey: 'contractId + SENT' },
  { eventType: 'CONTRACT_ACTIVATED', sideEffects: ['refresh offer and application views', 'FILLED / HIRED automation stays a later step'], idempotencyKey: 'contractId + ACTIVATED' },
  { eventType: 'CONTRACT_ENDED', sideEffects: ['close the mission for both parties'], idempotencyKey: 'contractId + ENDED' },
  { eventType: 'CONTRACT_TERMINATED', sideEffects: ['freeze the schedule and notify both parties (later step)'], idempotencyKey: 'contractId + TERMINATED' },
  { eventType: 'INCIDENT_OPENED', sideEffects: ['notify authorized participants and Admin queue'], idempotencyKey: 'event.id' },
  { eventType: 'INCIDENT_DECIDED', sideEffects: ['notify incident participants of the recorded decision'], idempotencyKey: 'event.id' },
  { eventType: 'REPLACEMENT_CREATED', sideEffects: ['notify the authorized replacement workflow'], idempotencyKey: 'event.id' },
  { eventType: 'CANDIDATE_TRANSFERRED', sideEffects: ['notify the candidate and employer', 'refresh replacement and contract views'], idempotencyKey: 'event.id' },
  { eventType: 'ACCOUNT_BLOCKED', sideEffects: ['notify the account owner and authorized Admins'], idempotencyKey: 'event.id' },
  { eventType: 'ACCOUNT_UNBLOCKED', sideEffects: ['notify the account owner'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_OVERDUE_J3', sideEffects: ['notify employer and authorized Admins', 'record scheduler audit event'], idempotencyKey: 'schedule-entry + payment-kind + due-date + J3' },
  /**
   * P0-E3/P0-E4 — cycle CANDIDATURE.
   *
   * `APPLICATION_SUBMITTED` est produit transactionnellement (P0-AUTO); les
   * événements de décision restent déclaratifs et sans producteur. Le worker
   * local ne fait qu'inscrire une trace d'audit, sans notification métier.
   * Charges utiles et clés de référence :
   * `src/domain/applicationTransitions.ts` (`DOCUMENTED_APPLICATION_EVENTS`).
   */
  { eventType: 'APPLICATION_SUBMITTED', sideEffects: ['notify the offer owner'], idempotencyKey: 'applicationId + SUBMITTED' },
  { eventType: 'APPLICATION_EXAMINED', sideEffects: ['refresh the employer application view'], idempotencyKey: 'applicationId + EXAMINED' },
  { eventType: 'APPLICATION_SHORTLISTED', sideEffects: ['notify the shortlisted candidate'], idempotencyKey: 'applicationId + SHORTLISTED' },
  { eventType: 'APPLICATION_REJECTED', sideEffects: ['notify the candidate with the recorded reason'], idempotencyKey: 'applicationId + REJECTED' },
  { eventType: 'APPLICATION_WITHDRAWN', sideEffects: ['notify the offer owner of the withdrawal'], idempotencyKey: 'applicationId + WITHDRAWN' },
  /**
   * P0-E5 — cycle PROPOSITION d'embauche.
   *
   * Aucun producteur PROPOSAL_* ni handler de domaine n'est branché à
   * l'Automation. L'émission, l'acceptation, la déclinaison et l'expiration
   * restent persistées dans la transaction métier sans effet asynchrone.
   * Charges utiles et clés de référence :
   * `src/domain/proposalTransitions.ts` (`DOCUMENTED_PROPOSAL_EVENTS`).
   * La nomenclature du code est conservée : `DECLINED`, jamais `REJECTED`.
   */
  { eventType: 'PROPOSAL_SENT', sideEffects: ['notify the target candidate'], idempotencyKey: 'proposalId + SENT' },
  { eventType: 'PROPOSAL_ACCEPTED', sideEffects: ['notify the emitting employer', 'prepare contract creation in the next step'], idempotencyKey: 'proposalId + ACCEPTED' },
  { eventType: 'PROPOSAL_DECLINED', sideEffects: ['notify the emitting employer'], idempotencyKey: 'proposalId + DECLINED' },
  { eventType: 'PROPOSAL_EXPIRED', sideEffects: ['close the proposal for both parties'], idempotencyKey: 'proposalId + EXPIRED' },
] as const;

export interface OutboxConsumer {
  /** Consumer must be safe to replay the same event ID. */
  consume(event: OutboxEvent): Promise<void>;
}

export interface OutboxDispatcherBoundary {
  dispatchBatch(input: {
    repository: OutboxRepository;
    consumer: OutboxConsumer;
    consumerName: string;
    limit: number;
    now: string;
  }): Promise<{ claimed: number; delivered: number; retried: number }>;
}
