/**
 * LE LABEUR — P0-LOAD-TESTS-2 — mesure de la file d'automatisation (queue/backlog).
 *
 * AUCUN nouveau moteur de file : tout passe par le worker P0-CRON-QUEUE
 * EXISTANT (`runScheduledCycle` = récupération d'orphelins + drain borné :
 * événements → paiements échus → jobs), composé par le même `composeWorker`.
 *
 * Ce module ne fait que :
 *   1. photographier la profondeur réelle de la file (SQL, par statut) ;
 *   2. exécuter des passes bornées du worker EXISTANT jusqu'à convergence,
 *      budget temps ou borne de passes — en MESURANT chaque passe ;
 *   3. rapporter les compteurs réels (claimed/completed/duplicates/retried/
 *      dead-lettered) sans jamais extrapoler.
 */

import type { LoadHarness } from './harness';
import type { QueueDepthSnapshot, QueueDrainPass, QueueDrainReport } from './metrics';

export async function snapshotQueueDepth(harness: LoadHarness): Promise<QueueDepthSnapshot> {
  const outbox = await harness.database.query<{ status: string; count: string }>(
    'SELECT status, count(*)::text AS count FROM automation_outbox GROUP BY status',
  );
  const jobs = await harness.database.query<{ status: string; count: string }>(
    'SELECT status, count(*)::text AS count FROM automation_jobs GROUP BY status',
  );
  const outboxByStatus: Record<string, number> = {};
  let totalOutbox = 0;
  for (const row of outbox.rows) {
    outboxByStatus[row.status] = Number(row.count);
    totalOutbox += Number(row.count);
  }
  const jobsByStatus: Record<string, number> = {};
  let totalJobs = 0;
  for (const row of jobs.rows) {
    jobsByStatus[row.status] = Number(row.count);
    totalJobs += Number(row.count);
  }
  return { outboxByStatus, jobsByStatus, totalOutbox, totalJobs };
}

export interface DrainQueueOptions {
  /** Nombre max d'éléments réclamés par passe (transmis au worker existant). */
  limitPerPass?: number;
  /** Nombre maximal de passes (garde-fou d'exécution). */
  maxPasses?: number;
  /** Budget temps total (ms) — la mesure s'arrête honnêtement au budget. */
  budgetMs?: number;
  /** Étiquette du déclencheur tracée dans l'audit (jamais « scheduled » de prod). */
  trigger?: string;
}

/**
 * Draine la file avec le worker EXISTANT, passe par passe, jusqu'à ce qu'une
 * passe ne réclame plus rien (convergence), ou jusqu'au budget/borne. Chaque
 * passe est un `runScheduledCycle` réel : récupération d'orphelins + drain.
 */
export async function drainAutomationQueue(
  harness: LoadHarness,
  options: DrainQueueOptions = {},
): Promise<QueueDrainReport> {
  const limitPerPass = options.limitPerPass ?? 200;
  const maxPasses = options.maxPasses ?? 150;
  const budgetMs = options.budgetMs ?? 240_000;
  const trigger = options.trigger ?? 'load-tests-p0-load-tests-2';

  const depthBefore = await snapshotQueueDepth(harness);
  const passes: QueueDrainPass[] = [];
  const totals = {
    eventsClaimed: 0, eventsCompleted: 0, eventsDuplicates: 0, eventsRetried: 0, eventsDeadLettered: 0,
    jobsClaimed: 0, jobsCompleted: 0, jobsRetried: 0, jobsFailed: 0, paymentsSwept: 0,
  };
  const startedAt = performance.now();
  let stoppedReason: QueueDrainReport['stoppedReason'] = 'max-passes';
  let converged = false;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const elapsed = performance.now() - startedAt;
    if (elapsed >= budgetMs) {
      stoppedReason = 'budget';
      break;
    }
    const passStartedAt = performance.now();
    const cycle = await harness.automationWorker.runScheduledCycle({ limit: limitPerPass, trigger });
    const passEntry: QueueDrainPass = {
      pass,
      durationMs: Math.round((performance.now() - passStartedAt) * 100) / 100,
      eventsClaimed: cycle.events.claimed,
      eventsCompleted: cycle.events.completed,
      eventsDuplicates: cycle.events.duplicates,
      eventsRetried: cycle.events.retried,
      eventsDeadLettered: cycle.events.deadLettered,
      jobsClaimed: cycle.jobs.claimed,
      jobsCompleted: cycle.jobs.completed,
      jobsRetried: cycle.jobs.retried,
      jobsFailed: cycle.jobs.failed,
      paymentsSwept: cycle.payments.applied,
    };
    passes.push(passEntry);
    totals.eventsClaimed += cycle.events.claimed;
    totals.eventsCompleted += cycle.events.completed;
    totals.eventsDuplicates += cycle.events.duplicates;
    totals.eventsRetried += cycle.events.retried;
    totals.eventsDeadLettered += cycle.events.deadLettered;
    totals.jobsClaimed += cycle.jobs.claimed;
    totals.jobsCompleted += cycle.jobs.completed;
    totals.jobsRetried += cycle.jobs.retried;
    totals.jobsFailed += cycle.jobs.failed;
    totals.paymentsSwept += cycle.payments.applied;

    if (cycle.events.claimed === 0 && cycle.jobs.claimed === 0 && cycle.payments.applied === 0) {
      // Rien de réclamable : soit la file est vide des éléments échus, soit des
      // retry attendent leur backoff (horloge fixe de campagne). Vérité en base.
      const depth = await snapshotQueueDepth(harness);
      const pendingRetry = (depth.outboxByStatus.RETRYABLE ?? 0) + (depth.jobsByStatus.RETRYABLE ?? 0);
      if (pendingRetry > 0) {
        stoppedReason = 'retry-backoff-pending';
      } else {
        converged = true;
        stoppedReason = 'empty-pass';
      }
      break;
    }
  }

  const depthAfter = await snapshotQueueDepth(harness);
  return {
    strategy: 'passes bornées du worker P0-CRON-QUEUE existant (runScheduledCycle : orphelins → événements → paiements échus → jobs)',
    limitPerPass,
    maxPasses,
    budgetMs,
    passCount: passes.length,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    converged,
    stoppedReason,
    depthBefore,
    depthAfter,
    totals,
    passes,
  };
}
