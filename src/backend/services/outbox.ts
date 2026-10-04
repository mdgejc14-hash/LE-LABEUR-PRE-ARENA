import type { OutboxEvent, OutboxEventType, OutboxRepository } from '../productionContracts';

export interface OutboxEffectContract {
  eventType: OutboxEventType;
  sideEffects: readonly string[];
  idempotencyKey: string;
}

/**
 * Event contract for later transactional outbox wiring. These are not emitted
 * by the mock and are not yet persisted or consumed in Phase 1.
 */
export const OUTBOX_EFFECT_CONTRACTS: readonly OutboxEffectContract[] = [
  { eventType: 'PAYMENT_DECLARED', sideEffects: ['notify the relevant reviewer', 'update payment activity feed'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_APPROVED', sideEffects: ['notify employer and employee', 'refresh schedule state'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_REJECTED', sideEffects: ['notify employer with the recorded reason', 'refresh schedule state'], idempotencyKey: 'event.id' },
  { eventType: 'CONTRACT_SIGNED', sideEffects: ['notify both parties', 'refresh offer and application views'], idempotencyKey: 'event.id' },
  { eventType: 'INCIDENT_OPENED', sideEffects: ['notify authorized participants and Admin queue'], idempotencyKey: 'event.id' },
  { eventType: 'INCIDENT_DECIDED', sideEffects: ['notify incident participants of the recorded decision'], idempotencyKey: 'event.id' },
  { eventType: 'REPLACEMENT_CREATED', sideEffects: ['notify the authorized replacement workflow'], idempotencyKey: 'event.id' },
  { eventType: 'CANDIDATE_TRANSFERRED', sideEffects: ['notify the candidate and employer', 'refresh replacement and contract views'], idempotencyKey: 'event.id' },
  { eventType: 'ACCOUNT_BLOCKED', sideEffects: ['notify the account owner and authorized Admins'], idempotencyKey: 'event.id' },
  { eventType: 'ACCOUNT_UNBLOCKED', sideEffects: ['notify the account owner'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_OVERDUE_J3', sideEffects: ['notify employer and authorized Admins', 'record scheduler audit event'], idempotencyKey: 'schedule-entry + payment-kind + due-date + J3' },
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
