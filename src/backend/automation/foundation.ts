/** P0-AUTO-1 + runtime integration — provider-neutral automation contracts. */
import type {
  IdempotencyStore as DurableIdempotencyStore,
  OutboxEventType,
} from '../productionContracts';

export type DomainEventType = OutboxEventType | 'NOTIFICATION_CREATED' | 'NOTIFICATION_REQUIRED' | 'NOTIFICATION_SENT' | 'NOTIFICATION_FAILED';

export interface DomainEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  actorId?: string;
  timestamp: string;
  payload: T;
  source: string;
  version: number;
  correlationId?: string;
  causationId?: string;
}

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'RETRYABLE' | 'DEAD_LETTER';
export interface PersistedOutboxEvent extends DomainEvent {
  status: OutboxStatus;
  attempts: number;
  availableAt: string;
  processedAt?: string;
  lastError?: string;
}

export interface QueueMessage<T = unknown> {
  id: string;
  body: T;
  attempts: number;
  availableAt: string;
}

export interface Queue<T = unknown> {
  enqueue(body: T, availableAt?: Date, id?: string): Promise<QueueMessage<T>>;
  claim(limit: number, now?: Date): Promise<QueueMessage<T>[]>;
  acknowledge(id: string): Promise<void>;
  retry(id: string, error: string, availableAt: Date): Promise<void>;
  deadLetter(id: string, error: string): Promise<void>;
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'RETRYABLE' | 'FAILED';
export interface ScheduledJob {
  jobId: string;
  jobType: string;
  target: { aggregateType: string; aggregateId: string };
  dueAt: string;
  status: JobStatus;
  attempts: number;
  idempotencyKey: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}

/** PostgreSQL-backed job port; no browser timer or production cron implied. */
export interface ScheduledJobRepository {
  create(job: ScheduledJob): Promise<ScheduledJob>;
  claimDue(limit: number, worker: string, now: Date, leaseDurationMs: number): Promise<ScheduledJob[]>;
  complete(jobId: string, worker: string, completedAt: string): Promise<void>;
  retry(jobId: string, worker: string, error: string, availableAt: string, maxAttempts: number): Promise<JobStatus>;
}

export type DeadlineStatus = 'OPEN' | 'MET' | 'OVERDUE' | 'ESCALATED' | 'CANCELLED';
export interface Deadline {
  id: string;
  aggregateType: string;
  aggregateId: string;
  dueAt: string;
  status: DeadlineStatus;
  sla?: string;
  gracePeriodMs?: number;
  escalation?: string;
}

export interface AuditLedgerEntry {
  id: string;
  eventId?: string;
  actorId: string | 'SYSTEM';
  timestamp: string;
  entityId: string;
  action: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  source: string;
  reference?: string;
}

export interface AuditLedgerRepository {
  append(entry: AuditLedgerEntry): Promise<void>;
  findByEventId(eventId: string): Promise<AuditLedgerEntry[]>;
}

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';
export interface NotificationEvent {
  id: string;
  type: 'NOTIFICATION_CREATED' | 'NOTIFICATION_REQUIRED' | 'NOTIFICATION_SENT' | 'NOTIFICATION_FAILED';
  recipient: string;
  eventId?: string;
  channel: string;
  template?: string;
  status: NotificationStatus;
  timestamp: string;
  correlationId?: string;
  idempotencyKey: string;
}

/** The production contract is the single idempotency-store abstraction. */
export type IdempotencyStore = DurableIdempotencyStore;
export type IdempotencyResult<T> =
  | { kind: 'reserved' }
  | { kind: 'replay'; result: T }
  | { kind: 'conflict' }
  | { kind: 'in-progress' };

export interface IdempotencyInput {
  actorId: string;
  command: string;
  key: string;
  payloadHash: string;
  createdAt: string;
}

export class IdempotencyConflictError extends Error {
  constructor(message = 'Idempotency key reused with a different payload.') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyInProgressError extends Error {
  constructor(message = 'An execution with this idempotency key is already in progress.') {
    super(message);
    this.name = 'IdempotencyInProgressError';
  }
}

export async function executeIdempotently<TResult>(
  store: IdempotencyStore,
  input: IdempotencyInput,
  operation: () => Promise<TResult>,
): Promise<{ kind: 'completed'; result: TResult } | { kind: 'duplicate'; result: TResult }> {
  const reservation = await store.reserve<TResult>(input);
  if (reservation.kind === 'replay') return { kind: 'duplicate', result: reservation.result };
  if (reservation.kind === 'conflict') throw new IdempotencyConflictError();
  if (reservation.kind === 'in-progress') throw new IdempotencyInProgressError();

  try {
    const result = await operation();
    await store.complete(input.actorId, input.command, input.key, result);
    return { kind: 'completed', result };
  } catch (error) {
    try {
      await store.release(input.actorId, input.command, input.key);
    } catch {
      // Un bail DB expirant permet la reprise après une panne du stockage.
    }
    throw error;
  }
}

export interface AutomationContext {
  event: DomainEvent;
  idempotencyKey: string;
}
export type AutomationHandler = (context: AutomationContext) => Promise<void>;

export class AutomationEngine {
  constructor(
    private readonly registry: AutomationRegistry,
    private readonly processed = new Set<string>(),
    private readonly idempotencyStore?: IdempotencyStore,
  ) {}

  async execute(event: DomainEvent, idempotencyKey = event.eventId): Promise<'completed' | 'duplicate'> {
    if (!isDomainEvent(event)) throw new Error('Invalid domain event.');
    const handler = this.registry.get(event.eventType);
    if (!handler) throw new Error(`No handler registered: ${event.eventType}`);
    const processedKey = `${event.eventType}:${idempotencyKey}`;

    if (!this.idempotencyStore && this.processed.has(processedKey)) return 'duplicate';
    if (this.idempotencyStore) {
      const payloadHash = await hashCanonicalJson(event);
      const execution = await executeIdempotently(this.idempotencyStore, {
        actorId: 'SYSTEM',
        command: `automation:${event.eventType}`,
        key: idempotencyKey,
        payloadHash,
        createdAt: new Date().toISOString(),
      }, async () => {
        await handler({ event, idempotencyKey });
        return { status: 'completed' as const };
      });
      this.processed.add(processedKey);
      return execution.kind === 'duplicate' ? 'duplicate' : 'completed';
    }

    await handler({ event, idempotencyKey });
    this.processed.add(processedKey);
    return 'completed';
  }
}

export class AutomationRegistry {
  private readonly handlers = new Map<DomainEventType, AutomationHandler>();
  register(type: DomainEventType, handler: AutomationHandler): void {
    if (this.handlers.has(type)) throw new Error(`Handler already registered: ${type}`);
    this.handlers.set(type, handler);
  }
  get(type: DomainEventType): AutomationHandler | undefined {
    return this.handlers.get(type);
  }
}

export type ScheduledJobHandler = (job: ScheduledJob) => Promise<void>;

export class ScheduledJobRegistry {
  private readonly handlers = new Map<string, ScheduledJobHandler>();
  register(jobType: string, handler: ScheduledJobHandler): void {
    if (!jobType.trim()) throw new Error('jobType is required.');
    if (this.handlers.has(jobType)) throw new Error(`Scheduled job handler already registered: ${jobType}`);
    this.handlers.set(jobType, handler);
  }
  get(jobType: string): ScheduledJobHandler | undefined {
    return this.handlers.get(jobType);
  }
}

interface InMemoryQueueEntry<T> extends QueueMessage<T> {
  state: 'PENDING' | 'PROCESSING';
  lastError?: string;
}

/** Simple, claim-safe queue for deterministic tests; production data uses PostgreSQL. */
export class InMemoryQueue<T> implements Queue<T> {
  private readonly messages = new Map<string, InMemoryQueueEntry<T>>();
  private readonly deadLetters = new Map<string, { body: T; error: string }>();
  private sequence = 0;

  async enqueue(body: T, availableAt = new Date(), id?: string): Promise<QueueMessage<T>> {
    const messageId = id ?? `q-${++this.sequence}`;
    const existing = this.messages.get(messageId);
    if (existing) {
      if (stableJson(existing.body) !== stableJson(body)) throw new Error(`Queue message ID collision: ${messageId}`);
      return copyMessage(existing);
    }
    const deadLetter = this.deadLetters.get(messageId);
    if (deadLetter) {
      if (stableJson(deadLetter.body) !== stableJson(body)) throw new Error(`Queue message ID collision: ${messageId}`);
      return { id: messageId, body: deadLetter.body, attempts: 0, availableAt: availableAt.toISOString() };
    }
    const message: InMemoryQueueEntry<T> = {
      id: messageId,
      body,
      attempts: 0,
      availableAt: validIso(availableAt),
      state: 'PENDING',
    };
    this.messages.set(messageId, message);
    return copyMessage(message);
  }

  async claim(limit: number, now = new Date()): Promise<QueueMessage<T>[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Queue claim limit must be 1..1000.');
    const nowIso = validIso(now);
    const result: QueueMessage<T>[] = [];
    for (const message of this.messages.values()) {
      if (result.length >= limit) break;
      if (message.state !== 'PENDING' || message.availableAt > nowIso) continue;
      message.state = 'PROCESSING';
      message.attempts += 1;
      result.push(copyMessage(message));
    }
    return result;
  }

  async acknowledge(id: string): Promise<void> {
    this.messages.delete(id);
  }

  async retry(id: string, error: string, availableAt: Date): Promise<void> {
    const message = this.messages.get(id);
    if (!message) return;
    message.state = 'PENDING';
    message.availableAt = validIso(availableAt);
    message.lastError = error.slice(0, 2000);
  }

  async deadLetter(id: string, error: string): Promise<void> {
    const message = this.messages.get(id);
    if (!message) return;
    this.deadLetters.set(id, { body: message.body, error: error.slice(0, 2000) });
    this.messages.delete(id);
  }
}

export function createDomainEvent(
  input: Omit<DomainEvent, 'eventId' | 'timestamp' | 'version'>
    & { eventId?: string; timestamp?: string; version?: number },
): DomainEvent {
  const event: DomainEvent = {
    ...input,
    eventId: input.eventId ?? globalThis.crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    version: input.version ?? 1,
  };
  if (!isDomainEvent(event)) throw new Error('Invalid domain event.');
  return event;
}

export function serializeDomainEvent(event: DomainEvent): string {
  if (!isDomainEvent(event)) throw new Error('Invalid domain event.');
  return JSON.stringify(event);
}

export function deserializeDomainEvent(value: string): DomainEvent {
  const parsed = JSON.parse(value) as DomainEvent;
  if (!isDomainEvent(parsed)) throw new Error('Invalid domain event.');
  return parsed;
}

export function isDomainEvent(value: unknown): value is DomainEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Partial<DomainEvent>;
  return typeof event.eventId === 'string' && event.eventId.length > 0
    && typeof event.eventType === 'string' && event.eventType.length > 0
    && typeof event.aggregateType === 'string' && event.aggregateType.length > 0
    && typeof event.aggregateId === 'string' && event.aggregateId.length > 0
    && typeof event.timestamp === 'string' && !Number.isNaN(Date.parse(event.timestamp))
    && Boolean(event.payload) && typeof event.payload === 'object' && !Array.isArray(event.payload)
    && typeof event.source === 'string' && event.source.length > 0
    && Number.isInteger(event.version) && (event.version ?? 0) > 0;
}

export async function hashCanonicalJson(value: unknown): Promise<string> {
  const input = new TextEncoder().encode(stableJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => stableJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function validIso(value: Date): string {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid date.');
  return new Date(timestamp).toISOString();
}

function copyMessage<T>(message: QueueMessage<T>): QueueMessage<T> {
  return { id: message.id, body: message.body, attempts: message.attempts, availableAt: message.availableAt };
}
