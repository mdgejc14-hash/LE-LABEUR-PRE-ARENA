/** P0-AUTO-1 — provider-neutral automation foundation. No business rules live here. */
import type { OutboxEventType } from '../productionContracts';

export type DomainEventType = OutboxEventType | 'NOTIFICATION_CREATED' | 'NOTIFICATION_REQUIRED' | 'NOTIFICATION_SENT' | 'NOTIFICATION_FAILED';
export interface DomainEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string; eventType: DomainEventType; aggregateType: string; aggregateId: string;
  actorId?: string; timestamp: string; payload: T; source: string; version: number;
  correlationId?: string; causationId?: string;
}
export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'RETRYABLE' | 'DEAD_LETTER';
export interface PersistedOutboxEvent extends DomainEvent { status: OutboxStatus; attempts: number; availableAt: string; processedAt?: string; lastError?: string; }

export interface QueueMessage<T = unknown> { id: string; body: T; attempts: number; availableAt: string; }
export interface Queue<T = unknown> { enqueue(body: T, availableAt?: Date): Promise<QueueMessage<T>>; claim(limit: number, now?: Date): Promise<QueueMessage<T>[]>; acknowledge(id: string): Promise<void>; retry(id: string, error: string, availableAt: Date): Promise<void>; deadLetter(id: string, error: string): Promise<void>; }

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'RETRYABLE' | 'FAILED';
export interface ScheduledJob { jobId: string; jobType: string; target: { aggregateType: string; aggregateId: string }; dueAt: string; status: JobStatus; attempts: number; idempotencyKey: string; createdAt: string; startedAt?: string; completedAt?: string; lastError?: string; }
export type DeadlineStatus = 'OPEN' | 'MET' | 'OVERDUE' | 'ESCALATED' | 'CANCELLED';
export interface Deadline { id: string; aggregateType: string; aggregateId: string; dueAt: string; status: DeadlineStatus; sla?: string; gracePeriodMs?: number; escalation?: string; }
export interface AuditLedgerEntry { id: string; eventId?: string; actorId: string | 'SYSTEM'; timestamp: string; entityId: string; action: string; beforeState?: Record<string, unknown>; afterState?: Record<string, unknown>; source: string; reference?: string; }
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';
export interface NotificationEvent { id: string; type: 'NOTIFICATION_CREATED' | 'NOTIFICATION_REQUIRED' | 'NOTIFICATION_SENT' | 'NOTIFICATION_FAILED'; recipient: string; eventId?: string; channel: string; template?: string; status: NotificationStatus; timestamp: string; correlationId?: string; idempotencyKey: string; }

export type IdempotencyResult<T> = { kind: 'reserved' } | { kind: 'replay'; result: T } | { kind: 'conflict' } | { kind: 'in-progress' };
export interface IdempotencyStore<T = unknown> { reserve(input: { actorId: string; command: string; key: string; payloadHash: string }): Promise<IdempotencyResult<T>>; complete(actorId: string, command: string, key: string, result: T): Promise<void>; }
export interface AutomationContext { event: DomainEvent; idempotencyKey: string; }
export type AutomationHandler = (context: AutomationContext) => Promise<void>;
export class AutomationEngine {
  constructor(private readonly registry: AutomationRegistry, private readonly processed = new Set<string>()) {}
  async execute(event: DomainEvent, idempotencyKey = event.eventId): Promise<'completed' | 'duplicate'> {
    if (this.processed.has(idempotencyKey)) return 'duplicate';
    const handler = this.registry.get(event.eventType); if (!handler) throw new Error(`No handler registered: ${event.eventType}`);
    await handler({ event, idempotencyKey }); this.processed.add(idempotencyKey); return 'completed';
  }
}

export class AutomationRegistry {
  private readonly handlers = new Map<DomainEventType, AutomationHandler>();
  register(type: DomainEventType, handler: AutomationHandler): void { if (this.handlers.has(type)) throw new Error(`Handler already registered: ${type}`); this.handlers.set(type, handler); }
  get(type: DomainEventType): AutomationHandler | undefined { return this.handlers.get(type); }
}

export class InMemoryQueue<T> implements Queue<T> {
  private readonly messages = new Map<string, QueueMessage<T>>(); private sequence = 0;
  async enqueue(body: T, availableAt = new Date()): Promise<QueueMessage<T>> { const message = { id: `q-${++this.sequence}`, body, attempts: 0, availableAt: availableAt.toISOString() }; this.messages.set(message.id, message); return message; }
  async claim(limit: number, now = new Date()): Promise<QueueMessage<T>[]> { const result: QueueMessage<T>[] = []; for (const message of this.messages.values()) { if (result.length >= limit) break; if (message.availableAt <= now.toISOString()) { message.attempts++; result.push(message); } } return result; }
  async acknowledge(id: string): Promise<void> { this.messages.delete(id); }
  async retry(id: string, error: string, availableAt: Date): Promise<void> { const message = this.messages.get(id); if (message) { message.availableAt = availableAt.toISOString(); message.body = message.body; void error; } }
  async deadLetter(id: string): Promise<void> { this.messages.delete(id); }
}

export function createDomainEvent(input: Omit<DomainEvent, 'eventId' | 'timestamp' | 'version'> & { eventId?: string; timestamp?: string; version?: number }): DomainEvent { return { ...input, eventId: input.eventId ?? crypto.randomUUID(), timestamp: input.timestamp ?? new Date().toISOString(), version: input.version ?? 1 }; }
export function serializeDomainEvent(event: DomainEvent): string { return JSON.stringify(event); }
export function deserializeDomainEvent(value: string): DomainEvent { const parsed = JSON.parse(value) as DomainEvent; if (!parsed.eventId || !parsed.eventType || !parsed.aggregateId) throw new Error('Invalid domain event'); return parsed; }
