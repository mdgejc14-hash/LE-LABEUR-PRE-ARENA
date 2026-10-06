/**
 * LE LABEUR — P0-AUTO-2 — worker d'automatisation.
 *
 * Parcours réel, aucun maillon simulé :
 *
 *   Worker → PostgreSQL → Outbox (`automation_outbox`) → Queue (claim
 *   `FOR UPDATE SKIP LOCKED` sur la même table, dont les colonnes `status`,
 *   `attempts`, `available_at` et `last_error` sont celles d'une file réelle)
 *   → `AutomationEngine` (fondation P0-AUTO-1) → handler → `ScheduledJob`
 *   (`automation_jobs`) → échéances (`automation_deadlines`) → ledger d'audit.
 *
 * Ce worker est EXPLICITEME déclenché (`drainEvents`, `runDueJobs`, `drain`) :
 * aucun `setInterval`, aucun timer, aucun Cron Trigger Cloudflare, aucune
 * Cloudflare Queue de production. Le déclencheur (Cron, `scheduled`, tâche
 * d'exploitation) appartient à une tranche ultérieure.
 *
 * Concurrence : deux workers peuvent tourner simultanément. Le claim verrouillé
 * leur distribue des messages DIFFÉRENTS, et l'idempotence durable
 * (`automation_idempotency` + index d'unicité) garantit qu'un même contrat ne
 * produit jamais deux échéanciers, deux échéances ou deux rappels.
 */

import type { PostgreSqlDatabase } from '../services/database';
import type {
  AutomationSqlFactory,
  AutomationStores,
} from './records';
import type { PersistedOutboxEvent } from './foundation';
import {
  ContractAutomationError,
  parseReminderJobType,
  type ContractAutomation,
  type ReminderJobOutcome,
} from './contractActivation';
import { contractActivatedIdempotencyKey } from '../../domain/contractScheduleAutomation';

/** Tentatives avant mise en `DEAD_LETTER` / `FAILED` (bornes d'exploitation). */
export const DEFAULT_MAX_ATTEMPTS = 5;
/** Délai de rejeu d'un message `RETRYABLE`. Aucune règle métier : valeur d'exploitation. */
export const DEFAULT_RETRY_DELAY_MS = 30_000;
export const DEFAULT_CLAIM_LIMIT = 25;

export interface AutomationWorkerDependencies {
  database: PostgreSqlDatabase;
  /** Fabrique des stores liés à la transaction courante (injectée, jamais importée). */
  createStores: AutomationSqlFactory;
  automation: ContractAutomation;
  now?: () => Date;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface EventDrainEntry {
  eventId: string;
  eventType: string;
  aggregateId: string;
  result: 'completed' | 'duplicate' | 'retryable' | 'dead-letter';
  attempts: number;
  error?: string;
}

export interface EventDrainReport {
  claimed: number;
  completed: number;
  duplicates: number;
  retried: number;
  deadLettered: number;
  entries: EventDrainEntry[];
}

export interface JobRunEntry {
  jobId: string;
  jobType: string;
  contractId: string;
  result: 'completed' | 'retryable' | 'failed';
  attempts: number;
  outcome?: ReminderJobOutcome;
  error?: string;
}

export interface JobRunReport {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  entries: JobRunEntry[];
}

export interface AutomationWorker {
  /** Vide l'outbox des événements ayant un handler réel. */
  drainEvents(limit?: number): Promise<EventDrainReport>;
  /** Exécute les jobs de rappel échus. */
  runDueJobs(limit?: number): Promise<JobRunReport>;
  /** Événements puis jobs : le parcours complet d'un cycle d'automatisation. */
  drain(limit?: number): Promise<{ events: EventDrainReport; jobs: JobRunReport }>;
  handledEventTypes: readonly string[];
  handledJobTypes: readonly string[];
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'erreur inconnue');
  return message.slice(0, 500);
}

/**
 * Clé de déduplication du moteur : pour `CONTRACT_ACTIVATED` elle porte le
 * CONTRAT (jamais l'identifiant d'événement), afin qu'un second événement
 * d'activation pour le même contrat — même avec un `eventId` différent — soit
 * reconnu comme doublon dès la couche moteur, avant la couche PostgreSQL.
 */
function engineIdempotencyKey(event: PersistedOutboxEvent): string {
  return event.eventType === 'CONTRACT_ACTIVATED'
    ? contractActivatedIdempotencyKey(event.aggregateId)
    : event.eventId;
}

export function createAutomationWorker(
  dependencies: AutomationWorkerDependencies,
): AutomationWorker {
  const { database, createStores, automation } = dependencies;
  const clock = dependencies.now ?? (() => new Date());
  const maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const inTransaction = <T>(operation: (stores: AutomationStores) => Promise<T>): Promise<T> =>
    database.run(async transaction => operation(createStores(transaction)));

  return {
    handledEventTypes: automation.handledEventTypes,
    handledJobTypes: automation.handledJobTypes,

    async drainEvents(limit = DEFAULT_CLAIM_LIMIT): Promise<EventDrainReport> {
      const report: EventDrainReport = {
        claimed: 0, completed: 0, duplicates: 0, retried: 0, deadLettered: 0, entries: [],
      };

      const claimedAt = clock();
      const claimed = await inTransaction(stores => stores.outbox.claimDue({
        limit,
        eventTypes: automation.handledEventTypes,
        now: claimedAt.toISOString(),
      }));
      report.claimed = claimed.length;

      for (const event of claimed) {
        const entry: EventDrainEntry = {
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          result: 'completed',
          attempts: event.attempts,
        };

        try {
          const result = await automation.engine.execute(event, engineIdempotencyKey(event));
          await inTransaction(stores =>
            stores.outbox.markProcessed(event.eventId, clock().toISOString()));
          entry.result = result === 'duplicate' ? 'duplicate' : 'completed';
          if (result === 'duplicate') report.duplicates += 1;
          report.completed += 1;
        } catch (error) {
          const message = errorMessage(error);
          entry.error = message;

          // Un traitement concurrent n'est pas un échec : le message est rejoué.
          const inProgress = error instanceof ContractAutomationError && error.code === 'IN_PROGRESS';
          if (!inProgress) {
            await automation.recordFailure({
              eventId: event.eventId,
              entityId: event.aggregateId,
              error: message,
            });
          }

          if (!inProgress && event.attempts >= maxAttempts) {
            await inTransaction(stores => stores.outbox.markDeadLetter(event.eventId, message));
            entry.result = 'dead-letter';
            report.deadLettered += 1;
          } else {
            const availableAt = new Date(clock().getTime() + retryDelayMs).toISOString();
            await inTransaction(stores =>
              stores.outbox.markRetryable(event.eventId, message, availableAt));
            entry.result = 'retryable';
            report.retried += 1;
          }
        }

        report.entries.push(entry);
      }

      return report;
    },

    async runDueJobs(limit = DEFAULT_CLAIM_LIMIT): Promise<JobRunReport> {
      const report: JobRunReport = { claimed: 0, completed: 0, retried: 0, failed: 0, entries: [] };

      const claimedAt = clock();
      const claimedRows = await inTransaction(stores => stores.jobs.claimDue({
        limit,
        jobTypes: automation.handledJobTypes,
        now: claimedAt.toISOString(),
      }));
      // `UPDATE … RETURNING` ne garantit pas l'ordre du sous-select : les jobs
      // sont réordonnés ici pour que le rappel à échéance soit toujours évalué
      // AVANT son escalade J+3 (OPEN → OVERDUE → ESCALATED).
      const claimed = [...claimedRows].sort((left, right) =>
        (left.dueAt === right.dueAt ? left.jobId.localeCompare(right.jobId) : left.dueAt.localeCompare(right.dueAt)));
      report.claimed = claimed.length;

      for (const job of claimed) {
        const entry: JobRunEntry = {
          jobId: job.jobId,
          jobType: job.jobType,
          contractId: job.target.aggregateId,
          result: 'completed',
          attempts: job.attempts,
        };

        const parsed = parseReminderJobType(job.jobType);
        const handler = parsed ? automation.jobs.get(job.jobType) : undefined;

        if (!parsed || !handler) {
          const message = `Aucun handler de job pour ${job.jobType}.`;
          await automation.recordFailure({
            jobId: job.jobId,
            entityId: job.target.aggregateId,
            error: message,
          });
          await inTransaction(stores => stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
            status: 'FAILED',
            at: clock().toISOString(),
            error: message,
          }));
          entry.result = 'failed';
          entry.error = message;
          report.failed += 1;
          report.entries.push(entry);
          continue;
        }

        try {
          // Une SEULE transaction : effets du rappel (événement préparé,
          // échéance, audit, idempotence) et passage du job à COMPLETED sont
          // atomiques. Un rollback annule les deux.
          const outcome = await database.run(async transaction => {
            const stores = createStores(transaction);
            const result = await handler({
              job,
              paymentKind: parsed.paymentKind,
              stage: parsed.stage,
              stores,
              now: clock(),
            });
            await stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
              status: 'COMPLETED',
              at: clock().toISOString(),
            });
            return result;
          });
          entry.outcome = outcome;
          report.completed += 1;
        } catch (error) {
          const message = errorMessage(error);
          entry.error = message;
          const inProgress = error instanceof ContractAutomationError && error.code === 'IN_PROGRESS';
          if (!inProgress) {
            await automation.recordFailure({
              jobId: job.jobId,
              entityId: job.target.aggregateId,
              error: message,
            });
          }
          if (!inProgress && job.attempts >= maxAttempts) {
            await inTransaction(stores => stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
              status: 'FAILED',
              at: clock().toISOString(),
              error: message,
            }));
            entry.result = 'failed';
            report.failed += 1;
          } else {
            await inTransaction(stores => stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
              status: 'RETRYABLE',
              at: clock().toISOString(),
              error: message,
              availableAt: new Date(clock().getTime() + retryDelayMs).toISOString(),
            }));
            entry.result = 'retryable';
            report.retried += 1;
          }
        }

        report.entries.push(entry);
      }

      return report;
    },

    async drain(limit = DEFAULT_CLAIM_LIMIT) {
      const events = await this.drainEvents(limit);
      const jobs = await this.runDueJobs(limit);
      return { events, jobs };
    },
  };
}
