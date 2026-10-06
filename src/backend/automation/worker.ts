/** Local Automation Worker: PostgreSQL Outbox → the existing Queue → AutomationEngine → ScheduledJob. */
import type { OutboxRepository } from '../productionContracts';
import { newEntityId } from '../identity/ids';
import { redactSqlSecrets } from '../persistence/sqlClient';
import type {
  AuditLedgerStore,
  AutomationEngine,
  DomainEvent,
  Queue,
  ScheduledJob,
  ScheduledJobStore,
} from './foundation';
import { toDomainEvent } from './postgres';

const DEFAULT_BATCH_SIZE = 50;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export interface ScheduledJobExecutor {
  execute(job: ScheduledJob, workerId: string, evaluatedAt: Date): Promise<void>;
}

export interface AutomationWorkerDependencies {
  outbox: OutboxRepository;
  queue: Queue<DomainEvent>;
  engine: AutomationEngine;
  jobs: ScheduledJobStore;
  audit: AuditLedgerStore;
  scheduledJobExecutor: ScheduledJobExecutor;
  now?: () => Date;
  workerId?: string;
}

export interface OutboxDrainResult {
  claimed: number;
  delivered: number;
  retried: number;
  duplicates: number;
}

export interface ScheduledJobDrainResult {
  claimed: number;
  completed: number;
  retried: number;
}

function safeError(error: unknown): string {
  return redactSqlSecrets(String((error as Error)?.message ?? error)).slice(0, 1000);
}

function nextRetryAt(now: Date, attempts: number): Date {
  const delay = Math.min(MAX_RETRY_DELAY_MS, 5_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delay);
}

/**
 * A single provider-neutral worker used by the API composition and local
 * verification. Production Cron/Cloudflare Queue bindings remain out of scope.
 */
export class AutomationWorker {
  readonly workerId: string;
  private readonly now: () => Date;

  constructor(private readonly dependencies: AutomationWorkerDependencies) {
    this.workerId = dependencies.workerId ?? newEntityId('job');
    this.now = dependencies.now ?? (() => new Date());
  }

  async processOutboxBatch(limit = DEFAULT_BATCH_SIZE): Promise<OutboxDrainResult> {
    const events = await this.dependencies.outbox.claimBatch(limit, this.workerId);
    const result: OutboxDrainResult = { claimed: events.length, delivered: 0, retried: 0, duplicates: 0 };

    for (const outboxEvent of events) {
      try {
        await this.dependencies.queue.enqueue(toDomainEvent(outboxEvent), this.now());
      } catch (error) {
        await this.retryOutbox(outboxEvent, error);
        result.retried += 1;
      }
    }

    const messages = await this.dependencies.queue.claim(limit, this.now());
    for (const message of messages) {
      const event = message.body;
      try {
        const execution = await this.dependencies.engine.execute(event, event.eventId);
        if (execution === 'in-progress') throw new Error('Automation event is already being processed by another worker.');
        await this.dependencies.outbox.markDelivered(event.eventId, this.workerId, this.now().toISOString());
        await this.dependencies.queue.acknowledge(message.id);
        if (execution === 'duplicate') result.duplicates += 1;
        else result.delivered += 1;
      } catch (error) {
        await this.retryOutbox({
          id: event.eventId,
          aggregateId: event.aggregateId,
          aggregateType: event.aggregateType,
          type: event.eventType,
          payload: event.payload,
        }, error);
        await this.dependencies.queue.retry(message.id, safeError(error), nextRetryAt(this.now(), message.attempts));
        result.retried += 1;
      }
    }

    return result;
  }

  async processDueJobs(limit = DEFAULT_BATCH_SIZE, evaluatedAt = this.now()): Promise<ScheduledJobDrainResult> {
    const jobs = await this.dependencies.jobs.claimDueBatch(limit, evaluatedAt, this.workerId);
    const result: ScheduledJobDrainResult = { claimed: jobs.length, completed: 0, retried: 0 };

    for (const job of jobs) {
      try {
        await this.dependencies.scheduledJobExecutor.execute(job, this.workerId, evaluatedAt);
        result.completed += 1;
      } catch (error) {
        const message = safeError(error);
        await this.dependencies.jobs.retry(
          job.jobId,
          this.workerId,
          message,
          nextRetryAt(evaluatedAt, job.attempts).toISOString(),
        );
        try {
          await this.dependencies.audit.append({
            id: `aud_job_retry_${job.jobId}_${job.attempts}`,
            eventId: job.eventId,
            jobId: job.jobId,
            actorId: 'SYSTEM',
            timestamp: evaluatedAt.toISOString(),
            entityId: job.target.aggregateId,
            action: 'SCHEDULED_JOB_RETRYABLE',
            source: 'AutomationWorker',
            reference: job.idempotencyKey,
            result: { status: 'RETRYABLE', attempt: job.attempts },
            error: message,
          });
        } catch {
          // The durable job retry state is authoritative if audit is unavailable.
        }
        result.retried += 1;
      }
    }

    // Events emitted by due/reminder jobs re-enter through the same local Queue
    // and AutomationEngine. No notification channel is invoked here.
    if (jobs.length > 0) await this.processOutboxBatch(limit);
    return result;
  }

  private async retryOutbox(
    event: {
      id: string;
      aggregateId: string;
      aggregateType: string;
      type: string;
      payload: Record<string, unknown>;
    },
    error: unknown,
  ): Promise<void> {
    const message = safeError(error);
    try {
      await this.dependencies.outbox.releaseForRetry(event.id, this.workerId, message);
    } catch {
      // An expired claim lease makes an un-released record claimable again.
    }
    try {
      await this.dependencies.audit.append({
        id: `aud_outbox_retry_${event.id}_${this.now().getTime()}`,
        eventId: event.id,
        actorId: 'SYSTEM',
        timestamp: this.now().toISOString(),
        entityId: event.aggregateId,
        action: 'AUTOMATION_EVENT_RETRYABLE',
        source: 'AutomationWorker',
        reference: event.type,
        result: { status: 'RETRYABLE' },
        error: message,
      });
    } catch {
      // Outbox status/last_error remains the durable retry record.
    }
  }
}
