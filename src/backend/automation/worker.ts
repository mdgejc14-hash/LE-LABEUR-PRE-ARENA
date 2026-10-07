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
 * Ce worker est déclenché par UNE front unique :
 *  - explicitement (`drainEvents`, `runDueJobs`, `drain`) : aucun
 *    `setInterval`, aucun timer applicatif, aucune Cloudflare Queue de
 *    production ;
 *  - périodiquement (`runScheduledCycle`) : la PASSÉE bornée exécutée par le
 *    Cron Trigger existant (`scheduled()` de `cloudflareEntry.ts`). P0-CRON-
 *    QUEUE : le déclencheur ne « pense » PAS la plateforme — il ne fait que
 *    (1) récupérer les claims orphelins (crash après réservation, avant ack :
 *    rejeu idempotent, jamais un job perdu en silence) et (2) lancer le drain
 *    EXISTANT, une seule fois, avec trace d'audit du tick
 *    (`CRON_TICK_EXECUTED`). Aucune action métier n'est produite par le
 *    trigger lui-même ; AUCUN `[triggers]` de production n'est installé dans
 *    cette tranche (décision CLOUDFLARE PRODUCTION).
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
import {
  AUTOMATION_SYSTEM_ACTOR,
  contractActivatedIdempotencyKey,
} from '../../domain/contractScheduleAutomation';
import { newEntityId } from '../identity/ids';

/** Tentatives avant mise en `DEAD_LETTER` / `FAILED` (bornes d'exploitation). */
export const DEFAULT_MAX_ATTEMPTS = 5;
/** Délai de rejeu d'un message `RETRYABLE`. Aucune règle métier : valeur d'exploitation. */
export const DEFAULT_RETRY_DELAY_MS = 30_000;
export const DEFAULT_CLAIM_LIMIT = 25;
/**
 * P0-CRON-QUEUE — borne d'orphanisation d'un claim (`RUNNING` / `PROCESSING`) :
 * crash après réservation, avant ack. Valeur d'exploitation UNIQUEMENT — elle
 * doit rester supérieure au timeout de toute requête déclarée
 * (`DB_STATEMENT_TIMEOUT_MS = 15 000`) : un traitement réellement en cours ne
 * doit jamais être confondu avec un orphelin. Le rejeu est sans double effet
 * parce que les handlers existants sont idempotents.
 */
export const DEFAULT_STALE_CLAIM_MS = 10 * 60_000;

/** Source déclarée de la couche déclenchement périodique (audit). */
export const CRON_QUEUE_SOURCE = 'automation:P0-CRON-QUEUE';

export interface StaleRecoveryReport {
  at: string;
  eventsRecovered: number;
  eventsDeadLettered: number;
  jobsRecovered: number;
  jobsFailed: number;
}

/**
 * P0-CRON-QUEUE — rapport d'une PASSÉE du déclenchement périodique : ce qu'un
 * tick Cron a réellement fait (récupération des orphelins + drain complet),
 * avec horodatage, afin que chaque déclenchement soit identifiable dans
 * l'audit (exigence observabilité).
 */
export interface ScheduledCycleReport {
  /** Identifiant du déclencheur (`scheduled` pour le Cron Trigger Cloudflare). */
  trigger: string;
  at: string;
  durationMs: number;
  recovered: StaleRecoveryReport;
  events: EventDrainReport;
  payments: PaymentDueSweepReport;
  jobs: JobRunReport;
}

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
  /**
   * P0-NOTIFICATIONS — processeurs SUPPLÉMENTAIRES, branchés sur la même
   * Outbox, le même claim verrouillé et les mêmes tentatives.
   *
   * Un événement est routé vers TOUS les processeurs qui déclarent son type,
   * PUIS (si l'automatisation le déclare aussi) vers l'`AutomationEngine`.
   * C'est ce qui permet à la couche de notification d'observer un événement
   * métier SANS le « voler » à son producteur de référence : `CLAIM_CREATED`
   * reste traité par le processeur Claim, et notifié par le processeur
   * Notification, dans la même passe et sous le même claim.
   *
   * Les types de JOB, eux, restent exclusifs : les processeurs sont consultés
   * dans l'ordre et le PREMIER qui déclare le type le traite.
   */
  processors?: readonly SupplementalAutomationProcessor[];
  now?: () => Date;
  maxAttempts?: number;
  retryDelayMs?: number;
  /** P0-CRON-QUEUE — borne d'orphanisation d'un claim (valeur d'exploitation). */
  staleClaimMs?: number;
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
  /**
   * P0-CRON-QUEUE — récupération déterministe des claims orphelins (crash
   * APRÈS réservation, AVANT ack) : les lignes `PROCESSING` / `RUNNING` dont le
   * claim est plus vieux que la borne repassent `RETRYABLE` (rejeu idempotent
   * des handlers EXISTANTS) ou au terminal `DEAD_LETTER` / `FAILED` quand la
   * borne de tentatives est atteinte. Aucun job ne reste perdu en silence ;
   * chaque récupération est tracée dans le ledger d'audit EXISTANT.
   */
  recoverStaleClaims(): Promise<StaleRecoveryReport>;
  /**
   * P0-CRON-QUEUE — une PASSÉE bornée du déclenchement périodique, telle que
   * l'exécute le Cron Trigger : récupération des orphelins, puis le drain
   * complet EXISTANT (événements → paiements échus → jobs échus), puis la
   * trace d'audit du tick (`CRON_TICK_EXECUTED`). Le déclencheur ne produit
   * AUCUNE action métier directement : il ne fait que lancer ce worker.
   */
  runScheduledCycle(input?: { limit?: number; trigger?: string }): Promise<ScheduledCycleReport>;
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
  // `supplemental` (P0-DISPUTE-1) reste accepté tel quel et garde sa PRIORITÉ
  // d'ordre : il est simplement normalisé en tête de liste, donc le
  // comportement des compositions existantes est strictement inchangé.
  const supplementalProcessors: readonly SupplementalAutomationProcessor[] = [
    ...(dependencies.supplemental ? [dependencies.supplemental] : []),
    ...(dependencies.processors ?? []),
  ];
  const handledEventTypes = [
    ...new Set([
      ...automation.handledEventTypes,
      ...supplementalProcessors.flatMap(processor => processor.handledEventTypes),
    ]),
  ];
  const handledJobTypes = [
    ...new Set([
      ...automation.handledJobTypes,
      ...supplementalProcessors.flatMap(processor => processor.handledJobTypes),
    ]),
  ];
  const clock = dependencies.now ?? (() => new Date());
  const maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const staleClaimMs = dependencies.staleClaimMs ?? DEFAULT_STALE_CLAIM_MS;

  const inTransaction = <T>(operation: (stores: AutomationStores) => Promise<T>): Promise<T> =>
    database.run(async transaction => operation(createStores(transaction)));

  return {
    handledEventTypes,
    handledJobTypes,

    async drainEvents(limit = DEFAULT_CLAIM_LIMIT): Promise<EventDrainReport> {
      const report: EventDrainReport = {
        claimed: 0, completed: 0, duplicates: 0, retried: 0, deadLettered: 0, entries: [],
      };

      const claimedAt = clock();
      const claimed = await inTransaction(stores => stores.outbox.claimDue({
        limit,
        eventTypes: handledEventTypes,
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
          // 1. Le moteur d'automatisation EXISTANT traite le type qu'il déclare.
          const engineResult = automation.handledEventTypes.includes(event.eventType)
            ? await automation.engine.execute(event, engineIdempotencyKey(event))
            : null;
          // 2. Chaque processeur qui déclare le type observe le MÊME événement,
          //    dans l'ordre de composition. Aucun ne le « vole » à un autre.
          let processorDuplicate = false;
          for (const processor of supplementalProcessors) {
            if (!processor.handledEventTypes.includes(event.eventType)) continue;
            const outcome = await processor.handleEvent(event);
            if (outcome === 'duplicate') processorDuplicate = true;
          }
          const result = engineResult === 'duplicate' || processorDuplicate ? 'duplicate' : 'completed';
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
        jobTypes: handledJobTypes,
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
        // Les types de job restent EXCLUSIFS : le premier processeur qui
        // déclare le type le traite (aucun doublon d'exécution possible).
        const supplementalHandler = supplementalProcessors
          .find(processor => processor.handledJobTypes.includes(job.jobType))
          ?.handleJob;

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

    async recoverStaleClaims(): Promise<StaleRecoveryReport> {
      const at = clock();
      const staleBefore = new Date(at.getTime() - staleClaimMs).toISOString();
      const reason =
        `Claim orphelin : traitement ${CRON_QUEUE_SOURCE} relâché après la borne d'exploitation `
        + `(${staleClaimMs} ms) — crash probable après réservation, avant ack.`;

      const outbox = await inTransaction(stores => stores.outbox.recoverStale({
        now: at.toISOString(),
        staleBefore,
        maxAttempts,
        reason,
      }));
      const jobs = await inTransaction(stores => stores.jobs.recoverStale({
        now: at.toISOString(),
        staleBefore,
        maxAttempts,
        reason,
      }));

      const report: StaleRecoveryReport = {
        at: at.toISOString(),
        eventsRecovered: outbox.recovered,
        eventsDeadLettered: outbox.deadLettered,
        jobsRecovered: jobs.recovered,
        jobsFailed: jobs.failed,
      };

      if (outbox.recovered > 0 || outbox.deadLettered > 0) {
        await inTransaction(stores => stores.audit.append({
          id: newEntityId('rev'),
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp: report.at,
          entityId: 'outbox',
          action: outbox.deadLettered > 0
            ? 'STALE_OUTBOX_EVENTS_DEAD_LETTERED'
            : 'STALE_OUTBOX_EVENTS_RECOVERED',
          source: CRON_QUEUE_SOURCE,
          afterState: {
            recovered: outbox.recovered,
            deadLettered: outbox.deadLettered,
            staleAfterMs: staleClaimMs,
            maxAttempts,
            eventIds: outbox.ids.slice(0, 20),
            note: 'Rejeu idempotent : aucun second effet métier possible.',
          },
        }));
      }
      if (jobs.recovered > 0 || jobs.failed > 0) {
        await inTransaction(stores => stores.audit.append({
          id: newEntityId('rev'),
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp: report.at,
          entityId: 'jobs',
          action: jobs.failed > 0 ? 'STALE_JOBS_FAILED' : 'STALE_JOBS_RECOVERED',
          source: CRON_QUEUE_SOURCE,
          afterState: {
            recovered: jobs.recovered,
            failed: jobs.failed,
            staleAfterMs: staleClaimMs,
            maxAttempts,
            jobIds: jobs.ids.slice(0, 20),
            note: 'Rejeu idempotent : aucun second effet métier possible.',
          },
        }));
      }

      return report;
    },

    async runScheduledCycle(input: { limit?: number; trigger?: string } = {}): Promise<ScheduledCycleReport> {
      const limit = input.limit ?? DEFAULT_CLAIM_LIMIT;
      const trigger = input.trigger ?? 'scheduled';
      const startedAt = clock();
      const report: ScheduledCycleReport = {
        trigger,
        at: startedAt.toISOString(),
        durationMs: 0,
        recovered: {
          at: startedAt.toISOString(),
          eventsRecovered: 0,
          eventsDeadLettered: 0,
          jobsRecovered: 0,
          jobsFailed: 0,
        },
        events: { claimed: 0, completed: 0, duplicates: 0, retried: 0, deadLettered: 0, entries: [] },
        payments: { scanned: 0, applied: 0, duplicates: 0, paymentIds: [] },
        jobs: { claimed: 0, completed: 0, retried: 0, failed: 0, entries: [] },
      };

      try {
        // L'ordre importe : les orphelins sont remis en file AVANT le claim,
        // puis le drain EXISTANT s'exécute tel quel (événements → paiements →
        // jobs). Le déclencheur n'appelle AUCUNE action métier directement.
        report.recovered = await this.recoverStaleClaims();
        report.events = await this.drainEvents(limit);
        report.payments = await this.runDuePayments(limit);
        report.jobs = await this.runDueJobs(limit);
      } catch (error) {
        // Un tick partiel/échoué reste identifiable : la trace est écrite
        // HORS de la transaction échouée, comme les autres échecs du worker.
        const message = errorMessage(error);
        await inTransaction(stores => stores.audit.append({
          id: newEntityId('rev'),
          actorId: AUTOMATION_SYSTEM_ACTOR,
          timestamp: clock().toISOString(),
          entityId: `cron:${trigger}`,
          action: 'CRON_TICK_FAILED',
          source: CRON_QUEUE_SOURCE,
          afterState: { trigger, at: report.at, error: message },
        })).catch(() => undefined);
        throw error;
      }

      report.durationMs = clock().getTime() - startedAt.getTime();
      // Trace du tick : chaque déclenchement périodique est identifiable
      // (timestamp, déclencheur, compteurs de chaque étape du drain réel).
      await inTransaction(stores => stores.audit.append({
        id: newEntityId('rev'),
        actorId: AUTOMATION_SYSTEM_ACTOR,
        timestamp: clock().toISOString(),
        entityId: `cron:${trigger}`,
        action: 'CRON_TICK_EXECUTED',
        source: CRON_QUEUE_SOURCE,
        afterState: {
          trigger,
          at: report.at,
          durationMs: report.durationMs,
          limit,
          recovered: {
            eventsRecovered: report.recovered.eventsRecovered,
            eventsDeadLettered: report.recovered.eventsDeadLettered,
            jobsRecovered: report.recovered.jobsRecovered,
            jobsFailed: report.recovered.jobsFailed,
          },
          events: {
            claimed: report.events.claimed,
            completed: report.events.completed,
            duplicates: report.events.duplicates,
            retried: report.events.retried,
            deadLettered: report.events.deadLettered,
          },
          payments: {
            scanned: report.payments.scanned,
            applied: report.payments.applied,
            duplicates: report.payments.duplicates,
          },
          jobs: {
            claimed: report.jobs.claimed,
            completed: report.jobs.completed,
            retried: report.jobs.retried,
            failed: report.jobs.failed,
          },
        },
      }));

      return report;
    },

    async drain(limit = DEFAULT_CLAIM_LIMIT) {
      const events = await this.drainEvents(limit);
      const payments = await this.runDuePayments(limit);
      const jobs = await this.runDueJobs(limit);
      return { events, payments, jobs };
    },
  };
}
