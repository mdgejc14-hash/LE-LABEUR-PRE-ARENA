import type { OutboxEvent, OutboxRepository } from '../productionContracts';
import type { OutboxConsumer, OutboxDispatcherBoundary } from '../services/outbox';
import type {
  AutomationEngine,
  DomainEvent,
  IdempotencyStore,
  Queue,
  ScheduledJob,
  ScheduledJobRegistry,
  ScheduledJobRepository,
} from './foundation';
import { executeIdempotently, hashCanonicalJson, isDomainEvent } from './foundation';

export interface OutboxDispatchResult {
  claimed: number;
  enqueued: number;
  retried: number;
}

function domainEventFromOutbox(event: OutboxEvent): DomainEvent {
  return {
    eventId: event.id,
    eventType: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    ...(event.actorId ? { actorId: event.actorId } : {}),
    timestamp: event.occurredAt,
    payload: event.payload,
    source: event.source ?? 'automation.outbox',
    version: event.version ?? 1,
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    ...(event.causationId ? { causationId: event.causationId } : {}),
  };
}

export interface OutboxDispatcherOptions {
  repository: OutboxRepository;
  queue: Queue<DomainEvent>;
  consumerName: string;
  limit: number;
  now?: () => Date;
}

/** Existing OutboxConsumer port adapted to the local durable queue. */
export class QueueOutboxConsumer implements OutboxConsumer {
  constructor(private readonly queue: Queue<DomainEvent>) {}

  async consume(event: OutboxEvent): Promise<void> {
    const domainEvent = domainEventFromOutbox(event);
    await this.queue.enqueue(domainEvent, new Date(event.occurredAt), event.id);
  }
}

/** Concrete implementation of the already-declared dispatcher boundary. */
export class OutboxDispatcher implements OutboxDispatcherBoundary {
  async dispatchBatch(input: Parameters<OutboxDispatcherBoundary['dispatchBatch']>[0]): Promise<{
    claimed: number;
    delivered: number;
    retried: number;
  }> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
      throw new Error('Outbox dispatch limit must be 1..1000.');
    }
    const events = await input.repository.claimBatch(input.limit, input.consumerName);
    let delivered = 0;
    let retried = 0;
    for (const event of events) {
      try {
        await input.consumer.consume(event);
        await input.repository.markDelivered(event.id, input.consumerName, input.now);
        delivered += 1;
      } catch (error) {
        try {
          await input.repository.releaseForRetry(
            event.id,
            input.consumerName,
            String((error as Error)?.message ?? error).slice(0, 2000),
          );
        } catch {
          // The outbox lease can be reclaimed after expiry if storage failed too.
        }
        retried += 1;
      }
    }
    return { claimed: events.length, delivered, retried };
  }
}

/**
 * Moves committed outbox rows to the durable Queue using the declared Outbox
 * dispatcher/consumer contracts. Queue IDs are the outbox event IDs, so a crash
 * between enqueue and outbox acknowledgement is replay-safe.
 */
export async function dispatchOutboxBatch(options: OutboxDispatcherOptions): Promise<OutboxDispatchResult> {
  const now = options.now ?? (() => new Date());
  const result = await new OutboxDispatcher().dispatchBatch({
    repository: options.repository,
    consumer: new QueueOutboxConsumer(options.queue),
    consumerName: options.consumerName,
    limit: options.limit,
    now: now().toISOString(),
  });
  return { claimed: result.claimed, enqueued: result.delivered, retried: result.retried };
}

export interface AutomationWorkerOptions {
  maxAttempts?: number;
  retryBaseMs?: number;
  now?: () => Date;
}

export interface AutomationWorkerResult {
  claimed: number;
  completed: number;
  duplicate: number;
  retried: number;
  deadLettered: number;
}

/** Local/test queue consumer: claim → AutomationEngine → acknowledge/retry. */
export class AutomationWorker {
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly queue: Queue<DomainEvent>,
    private readonly engine: AutomationEngine,
    options: AutomationWorkerOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 8;
    this.retryBaseMs = options.retryBaseMs ?? 1000;
    this.now = options.now ?? (() => new Date());
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) throw new Error('maxAttempts must be positive.');
    if (!Number.isInteger(this.retryBaseMs) || this.retryBaseMs < 0) throw new Error('retryBaseMs cannot be negative.');
  }

  async runBatch(limit = 20, requestedNow = this.now()): Promise<AutomationWorkerResult> {
    const messages = await this.queue.claim(limit, requestedNow);
    const result: AutomationWorkerResult = {
      claimed: messages.length,
      completed: 0,
      duplicate: 0,
      retried: 0,
      deadLettered: 0,
    };

    for (const message of messages) {
      try {
        if (!isDomainEvent(message.body)) throw new Error('Queue item is not a valid domain event.');
        const execution = await this.engine.execute(message.body, message.body.eventId);
        await this.queue.acknowledge(message.id);
        if (execution === 'duplicate') result.duplicate += 1;
        else result.completed += 1;
      } catch (error) {
        const messageText = String((error as Error)?.message ?? error).slice(0, 2000);
        try {
          if (message.attempts >= this.maxAttempts) {
            await this.queue.deadLetter(message.id, messageText);
            result.deadLettered += 1;
          } else {
            await this.queue.retry(message.id, messageText, new Date(
              requestedNow.getTime() + retryDelay(this.retryBaseMs, message.attempts),
            ));
            result.retried += 1;
          }
        } catch {
          // A lost claim is recovered by the persisted lease; never ack it as success.
          result.retried += 1;
        }
      }
    }
    return result;
  }
}

export interface ScheduledJobWorkerOptions {
  workerId: string;
  maxAttempts?: number;
  claimLeaseMs?: number;
  retryBaseMs?: number;
  now?: () => Date;
}

export interface ScheduledJobWorkerResult {
  claimed: number;
  completed: number;
  duplicate: number;
  retryable: number;
  failed: number;
}

/** Due job runner for a local worker; production Cron is intentionally absent. */
export class ScheduledJobWorker {
  private readonly maxAttempts: number;
  private readonly claimLeaseMs: number;
  private readonly retryBaseMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly jobs: ScheduledJobRepository,
    private readonly registry: ScheduledJobRegistry,
    private readonly idempotency: IdempotencyStore,
    private readonly options: ScheduledJobWorkerOptions,
  ) {
    this.maxAttempts = options.maxAttempts ?? 8;
    this.claimLeaseMs = options.claimLeaseMs ?? 60_000;
    this.retryBaseMs = options.retryBaseMs ?? 1000;
    this.now = options.now ?? (() => new Date());
    if (!options.workerId.trim()) throw new Error('workerId is required.');
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) throw new Error('maxAttempts must be positive.');
    if (!Number.isInteger(this.claimLeaseMs) || this.claimLeaseMs < 100) throw new Error('claimLeaseMs must be at least 100ms.');
    if (!Number.isInteger(this.retryBaseMs) || this.retryBaseMs < 0) throw new Error('retryBaseMs cannot be negative.');
  }

  async runBatch(limit = 20, requestedNow = this.now()): Promise<ScheduledJobWorkerResult> {
    const jobs = await this.jobs.claimDue(limit, this.options.workerId, requestedNow, this.claimLeaseMs);
    const result: ScheduledJobWorkerResult = {
      claimed: jobs.length,
      completed: 0,
      duplicate: 0,
      retryable: 0,
      failed: 0,
    };

    for (const job of jobs) {
      try {
        const handler = this.registry.get(job.jobType);
        if (!handler) throw new Error(`No scheduled job handler registered: ${job.jobType}`);
        const payloadHash = await hashCanonicalJson({
          jobType: job.jobType,
          target: job.target,
          idempotencyKey: job.idempotencyKey,
        });
        const execution = await executeIdempotently(this.idempotency, {
          actorId: 'SYSTEM',
          command: `scheduled-job:${job.jobType}`,
          key: job.idempotencyKey,
          payloadHash,
          createdAt: requestedNow.toISOString(),
        }, async () => {
          await handler(job);
          return { status: 'completed' as const, jobId: job.jobId };
        });
        await this.jobs.complete(job.jobId, this.options.workerId, this.now().toISOString());
        if (execution.kind === 'duplicate') result.duplicate += 1;
        else result.completed += 1;
      } catch (error) {
        const message = String((error as Error)?.message ?? error).slice(0, 2000);
        const retryAt = new Date(requestedNow.getTime() + retryDelay(this.retryBaseMs, job.attempts)).toISOString();
        try {
          const status = await this.jobs.retry(
            job.jobId,
            this.options.workerId,
            message,
            retryAt,
            this.maxAttempts,
          );
          if (status === 'FAILED') result.failed += 1;
          else result.retryable += 1;
        } catch {
          // A stale worker cannot overwrite the winner; lease expiry enables recovery.
          result.retryable += 1;
        }
      }
    }
    return result;
  }
}

export function retryDelay(baseMs: number, attempt: number): number {
  if (baseMs === 0) return 0;
  const exponent = Math.max(0, Math.min(16, attempt - 1));
  return Math.min(5 * 60_000, baseMs * 2 ** exponent);
}

export function isAutomationEvent(value: unknown): value is DomainEvent {
  return isDomainEvent(value);
}

// Keep the public type visible to callers constructing handlers without forcing
// them to import an implementation detail from the persistence adapter.
export type { ScheduledJob };
