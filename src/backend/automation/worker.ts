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

import type { PostgreSqlDatabase, SqlTransaction } from '../services/database';
import type {
  AutomationJob,
  AutomationSqlFactory,
  AutomationStores,
} from './records';
import type { DomainEventType, PersistedOutboxEvent } from './foundation';
import {
  ContractAutomationError,
  parseReminderJobType,
  type ContractAutomation,
  type ReminderJobOutcome,
} from './contractActivation';
import type { PaymentDueSweepReport, PreDueReminderOutcome } from './paymentCycle';
import { contractActivatedIdempotencyKey } from '../../domain/contractScheduleAutomation';

/** Tentatives avant mise en `DEAD_LETTER` / `FAILED` (bornes d'exploitation). */
export const DEFAULT_MAX_ATTEMPTS = 5;
/** Délai de rejeu d'un message `RETRYABLE`. Aucune règle métier : valeur d'exploitation. */
export const DEFAULT_RETRY_DELAY_MS = 30_000;
export const DEFAULT_CLAIM_LIMIT = 25;

export interface SupplementalAutomationProcessor {
  handledEventTypes: readonly DomainEventType[];
  handledJobTypes: readonly string[];
  handleEvent(event: PersistedOutboxEvent): Promise<'completed' | 'duplicate'>;
  /** Called inside the same transaction that marks the shared automation job complete. */
  handleJob(job: AutomationJob, now: Date, stores: AutomationStores, transaction: SqlTransaction): Promise<void>;
}

export interface AutomationWorkerDependencies {
  database: PostgreSqlDatabase;
  /** Fabrique des stores liés à la transaction courante (injectée, jamais importée). */
  createStores: AutomationSqlFactory;
  automation: ContractAutomation;
  /** P0-DISPUTE-1 — handlers Claim branchés sur la même Outbox/jobs/deadlines. */
  supplemental?: SupplementalAutomationProcessor;
  now?: () => Date;
  maxAttempts?: number;
  retryDelayMs?: number;
  /**
   * P0-PAY-1 — balayage des paiements échus (`SCHEDULED → DUE`), exécuté dans la
   * MÊME transaction que les stores du worker. Absent (runtime sans base durable
   * de paiement), le cycle reste exactement celui de P0-AUTO-2.
   */
  duePayments?: (stores: AutomationStores, limit: number) => Promise<PaymentDueSweepReport>;
  /** P0-PAY-3 — jobs batch/retry/revue; ils partagent automation_jobs et ce worker. */
  paymentReconciliationJobs?: {
    jobTypes: readonly string[];
    handle: (job: AutomationJob, now: Date) => Promise<void>;
  };
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
  /** P0-PAY-1 — évaluation consignée par le rappel pré-échéance (aucun effet d'état). */
  preDue?: PreDueReminderOutcome;
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
  /** P0-PAY-1 — bascule `SCHEDULED → DUE` des paiements d'échéance atteinte. */
  runDuePayments(limit?: number): Promise<PaymentDueSweepReport>;
  /**
   * Événements, paiements, jobs : le parcours complet d'un cycle
   * d'automatisation. L'ordre importe : un contrat activé produit ses paiements
   * avant que le balayage ne les trouve, et les rappels sont évalués après la
   * bascule d'échéance.
   */
  drain(limit?: number): Promise<{ events: EventDrainReport; payments: PaymentDueSweepReport; jobs: JobRunReport }>;
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
  const supplemental = dependencies.supplemental;
  const clock = dependencies.now ?? (() => new Date());
  const maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const inTransaction = <T>(operation: (stores: AutomationStores) => Promise<T>): Promise<T> =>
    database.run(async transaction => operation(createStores(transaction)));

  return {
    handledEventTypes: [...new Set([...automation.handledEventTypes, ...(supplemental?.handledEventTypes ?? [])])],
    handledJobTypes: [...new Set([...automation.handledJobTypes, ...(supplemental?.handledJobTypes ?? [])])],

    async drainEvents(limit = DEFAULT_CLAIM_LIMIT): Promise<EventDrainReport> {
      const report: EventDrainReport = {
        claimed: 0, completed: 0, duplicates: 0, retried: 0, deadLettered: 0, entries: [],
      };

      const claimedAt = clock();
      const claimed = await inTransaction(stores => stores.outbox.claimDue({
        limit,
        eventTypes: [...new Set([...automation.handledEventTypes, ...(supplemental?.handledEventTypes ?? [])])],
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
          const result = supplemental?.handledEventTypes.includes(event.eventType)
            ? await supplemental.handleEvent(event)
            : await automation.engine.execute(event, engineIdempotencyKey(event));
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
        jobTypes: [...new Set([...automation.handledJobTypes, ...(supplemental?.handledJobTypes ?? [])])],
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

        // P0-PAY-1 — le rappel pré-échéance partage le claim, le compteur de
        // tentatives et le passage `RUNNING → COMPLETED` des jobs de rappel : il
        // n'a ni file ni ordonnanceur à lui.
        const isPreDue = automation.preDueJobType !== null && job.jobType === automation.preDueJobType;
        const parsed = parseReminderJobType(job.jobType);
        const handler = parsed ? automation.jobs.get(job.jobType) : undefined;
        const reconciliationHandler = dependencies.paymentReconciliationJobs?.jobTypes.includes(job.jobType)
          ? dependencies.paymentReconciliationJobs.handle
          : undefined;
        const supplementalHandler = supplemental?.handledJobTypes.includes(job.jobType) ? supplemental.handleJob : undefined;

        if (!isPreDue && (!parsed || !handler) && !reconciliationHandler && !supplementalHandler) {
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
          if (reconciliationHandler) {
            // Le batch travaille en chunks et ouvre une transaction par item;
            // le résultat métier est idempotent si le worker s'arrête avant le
            // passage du job à COMPLETED (le même automation_jobs le reprend).
            await reconciliationHandler(job, clock());
            await inTransaction(stores => stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
              status: 'COMPLETED',
              at: clock().toISOString(),
            }));
          } else if (supplementalHandler) {
            // Les traitements Claim partagent le job PostgreSQL, le verrou et
            // la transaction du worker. Aucun scheduler parallèle n'est ajouté.
            await database.run(async transaction => {
              const stores = createStores(transaction);
              await supplementalHandler(job, clock(), stores, transaction);
              await stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
                status: 'COMPLETED',
                at: clock().toISOString(),
              });
            });
          } else {
            // Une SEULE transaction : effets du rappel (événement préparé,
            // échéance, audit, idempotence) et passage du job à COMPLETED sont
            // atomiques. Un rollback annule les deux.
            const runResult = await database.run(async transaction => {
              const stores = createStores(transaction);
              if (isPreDue && automation.handlePreDueJob) {
                const preDue = await automation.handlePreDueJob({ job, stores, now: clock() });
                await stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
                  status: 'COMPLETED',
                  at: clock().toISOString(),
                });
                entry.preDue = preDue;
                return undefined;
              }
              // `handler` et `parsed` sont nécessairement présents ici : la branche
              // pré-échéance est déjà sortie, et le garde-fou ci-dessus a rejeté les
              // types sans handler.
              const result = await handler!({
                job,
                paymentKind: parsed!.paymentKind,
                stage: parsed!.stage,
                stores,
                now: clock(),
              });
              await stores.jobs.compareAndSetStatus(job.jobId, ['RUNNING'], {
                status: 'COMPLETED',
                at: clock().toISOString(),
              });
              return result;
            });
            entry.outcome = runResult;
          }
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

    async runDuePayments(limit = DEFAULT_CLAIM_LIMIT): Promise<PaymentDueSweepReport> {
      const sweep = dependencies.duePayments;
      if (!sweep) return { scanned: 0, applied: 0, duplicates: 0, paymentIds: [] };
      return inTransaction(stores => sweep(stores, limit));
    },

    async drain(limit = DEFAULT_CLAIM_LIMIT) {
      const events = await this.drainEvents(limit);
      const payments = await this.runDuePayments(limit);
      const jobs = await this.runDueJobs(limit);
      return { events, payments, jobs };
    },
  };
}
