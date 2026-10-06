/** P0-AUTO-1 — provider-neutral automation contracts and local queue. */
import type { OutboxEventType } from '../productionContracts';

export type DomainEventType =
  | OutboxEventType
  | 'NOTIFICATION_CREATED'
  | 'NOTIFICATION_REQUIRED'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_FAILED';

export interface DomainEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  actorId?: string | 'SYSTEM';
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
  lastError?: string;
}

export interface Queue<T = unknown> {
  enqueue(body: T, availableAt?: Date): Promise<QueueMessage<T>>;
  claim(limit: number, now?: Date): Promise<QueueMessage<T>[]>;
  acknowledge(id: string): Promise<void>;
  retry(id: string, error: string, availableAt: Date): Promise<void>;
  deadLetter(id: string, error: string): Promise<void>;
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'RETRYABLE' | 'FAILED';

/** Persistent ScheduledJob model backed by the existing automation_jobs table. */
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
  availableAt?: string;
  claimedBy?: string;
  eventId?: string;
  source?: string;
  payload?: Record<string, unknown>;
  lastError?: string;
}

export type DeadlineStatus = 'OPEN' | 'MET' | 'OVERDUE' | 'ESCALATED' | 'CANCELLED';

/** Existing Deadline model, now persisted in automation_deadlines. */
export interface Deadline {
  id: string;
  aggregateType: string;
  aggregateId: string;
  dueAt: string;
  status: DeadlineStatus;
  sla?: string;
  gracePeriodMs?: number;
  escalation?: string;
  jobId?: string;
  idempotencyKey?: string;
  eventId?: string;
  createdAt?: string;
  updatedAt?: string;
  payload?: Record<string, unknown>;
}

export interface AuditLedgerEntry {
  id: string;
  eventId?: string;
  jobId?: string;
  actorId: string | 'SYSTEM';
  timestamp: string;
  entityId: string;
  action: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  source: string;
  reference?: string;
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

export type IdempotencyResult<T> =
  | { kind: 'reserved' }
  | { kind: 'replay'; result: T }
  | { kind: 'conflict' }
  | { kind: 'in-progress' };

/** Durable implementation uses the existing automation_idempotency table. */
export interface IdempotencyStore<T = unknown> {
  reserve(input: {
    actorId: string;
    command: string;
    key: string;
    payloadHash: string;
  }): Promise<IdempotencyResult<T>>;
  complete(actorId: string, command: string, key: string, result: T): Promise<void>;
  release(actorId: string, command: string, key: string): Promise<void>;
}

export interface ScheduledJobStore {
  createIfAbsent(job: ScheduledJob): Promise<ScheduledJob>;
  findById(jobId: string): Promise<ScheduledJob | null>;
  findByIdForUpdate(jobId: string): Promise<ScheduledJob | null>;
  findByIdempotencyKey(key: string): Promise<ScheduledJob | null>;
  claimDueBatch(limit: number, now: Date, workerId: string): Promise<ScheduledJob[]>;
  complete(jobId: string, workerId: string, completedAt: string): Promise<void>;
  retry(jobId: string, workerId: string, error: string, availableAt: string): Promise<void>;
}

export interface DeadlineStore {
  createIfAbsent(deadline: Deadline): Promise<Deadline>;
  setStatus(idempotencyKey: string, status: DeadlineStatus, updatedAt: string): Promise<void>;
}

export interface AuditLedgerStore {
  append(entry: AuditLedgerEntry): Promise<void>;
}

export interface AutomationContext {
  event: DomainEvent;
  idempotencyKey: string;
}

export type AutomationHandler = (context: AutomationContext) => Promise<void>;
export type AutomationExecutionResult = 'completed' | 'duplicate' | 'in-progress';

async function eventFingerprint(event: DomainEvent): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(event));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export class AutomationEngine {
  private readonly inFlight = new Map<string, Promise<AutomationExecutionResult>>();

  constructor(
    private readonly registry: AutomationRegistry,
    private readonly processed = new Set<string>(),
    private readonly idempotencyStore?: IdempotencyStore,
  ) {}

  async execute(event: DomainEvent, idempotencyKey = event.eventId): Promise<AutomationExecutionResult> {
    if (this.processed.has(idempotencyKey)) return 'duplicate';

    const current = this.inFlight.get(idempotencyKey);
    if (current) {
      const result = await current;
      return result === 'in-progress' ? 'in-progress' : 'duplicate';
    }

    const execution = this.executeOnce(event, idempotencyKey);
    this.inFlight.set(idempotencyKey, execution);
    try {
      return await execution;
    } finally {
      this.inFlight.delete(idempotencyKey);
    }
  }

  private async executeOnce(event: DomainEvent, idempotencyKey: string): Promise<AutomationExecutionResult> {
    const handler = this.registry.get(event.eventType);
    if (!handler) throw new Error(`No handler registered: ${event.eventType}`);

    const actorId = 'SYSTEM';
    const command = 'automation.execute';
    let reservation = false;
    if (this.idempotencyStore) {
      const result = await this.idempotencyStore.reserve({
        actorId,
        command,
        key: idempotencyKey,
        payloadHash: await eventFingerprint(event),
      });
      if (result.kind === 'conflict') throw new Error('Automation idempotency key reused with a different event payload.');
      if (result.kind === 'replay') {
        this.processed.add(idempotencyKey);
        return 'duplicate';
      }
      if (result.kind === 'in-progress') return 'in-progress';
      reservation = true;
    }

    try {
      await handler({ event, idempotencyKey });
      if (reservation) await this.idempotencyStore!.complete(actorId, command, idempotencyKey, { completed: true });
      this.processed.add(idempotencyKey);
      return 'completed';
    } catch (error) {
      if (reservation) {
        try {
          await this.idempotencyStore!.release(actorId, command, idempotencyKey);
        } catch {
          // Preserve the handler error; the durable reservation has a lease.
        }
      }
      throw error;
    }
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

interface InMemoryQueueMessage<T> extends QueueMessage<T> {
  claimedUntil?: string;
}

/** Existing local Queue, with visibility leases so concurrent workers do not claim the same message. */
export class InMemoryQueue<T> implements Queue<T> {
  private readonly messages = new Map<string, InMemoryQueueMessage<T>>();
  private readonly deadLettersById = new Map<string, QueueMessage<T>>();
  private sequence = 0;
  private readonly leaseMs: number;

  constructor(leaseMs = 30_000) {
    this.leaseMs = leaseMs;
  }

  async enqueue(body: T, availableAt = new Date()): Promise<QueueMessage<T>> {
    const message: InMemoryQueueMessage<T> = {
      id: `q-${++this.sequence}`,
      body,
      attempts: 0,
      availableAt: availableAt.toISOString(),
    };
    this.messages.set(message.id, message);
    return { ...message };
  }

  async claim(limit: number, now = new Date()): Promise<QueueMessage<T>[]> {
    if (!Number.isInteger(limit) || limit <= 0) return [];
    const result: QueueMessage<T>[] = [];
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + this.leaseMs).toISOString();
    for (const message of this.messages.values()) {
      if (result.length >= limit) break;
      if (message.availableAt > nowIso || (message.claimedUntil && message.claimedUntil > nowIso)) continue;
      message.attempts += 1;
      message.claimedUntil = leaseUntil;
      result.push({ ...message });
    }
    return result;
  }

  async acknowledge(id: string): Promise<void> {
    this.messages.delete(id);
  }

  async retry(id: string, error: string, availableAt: Date): Promise<void> {
    const message = this.messages.get(id);
    if (!message) return;
    message.lastError = error;
    message.availableAt = availableAt.toISOString();
    message.claimedUntil = undefined;
  }

  async deadLetter(id: string, error: string): Promise<void> {
    const message = this.messages.get(id);
    if (!message) return;
    this.deadLettersById.set(id, { ...message, lastError: error });
    this.messages.delete(id);
  }

  get deadLetterCount(): number {
    return this.deadLettersById.size;
  }
}

export function createDomainEvent(
  input: Omit<DomainEvent, 'eventId' | 'timestamp' | 'version'> & {
    eventId?: string;
    timestamp?: string;
    version?: number;
  },
): DomainEvent {
  return {
    ...input,
    eventId: input.eventId ?? globalThis.crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    version: input.version ?? 1,
  };
}

export function serializeDomainEvent(event: DomainEvent): string {
  return JSON.stringify(event);
}

export function deserializeDomainEvent(value: string): DomainEvent {
  const parsed = JSON.parse(value) as DomainEvent;
  if (!parsed.eventId || !parsed.eventType || !parsed.aggregateType || !parsed.aggregateId || !parsed.timestamp) {
    throw new Error('Invalid domain event');
  }
  if (!parsed.payload || typeof parsed.payload !== 'object' || Array.isArray(parsed.payload)) {
    throw new Error('Invalid domain event payload');
  }
  return parsed;
}
