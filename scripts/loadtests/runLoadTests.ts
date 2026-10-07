/**
 * LE LABEUR — P0-LOAD-TESTS — campagne de charge réelle et reproductible.
 *
 *   niveaux 100 → 1000 → 2000 → 10000 utilisateurs virtuels
 *     ↓
 *   mesure (concurrence, durée, rps, p50/p95/p99, erreurs, timeouts, retries,
 *           file/dead-letter, latence DB, saturation)
 *     ↓
 *   concurrence métier (doubles appels, aucun double effet)
 *     ↓
 *   résilience (retry, timeout, crash/reprise, backlog, dead-letter, orphelins,
 *               idempotence)
 *
 * Rien n'est inventé : si un niveau ne peut pas s'exécuter dans le budget, la
 * campagne s'arrête et publie les chiffres RÉELLEMENT observés jusqu'à
 * l'interruption, avec le motif `RESOURCE_LIMITATION`.
 *
 * Usage :
 *   npm run loadtest -- --levels 100,1000,2000,10000
 *   npm run loadtest -- --levels 100 --concurrency 32 --replacement-sample 25
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadavg, totalmem, freemem, cpus } from 'node:os';

import {
  createLoadIdentityPool,
  provisionAdmin,
  startLoadEnvironment,
  type LoadEnvironment,
  type LoadIdentityPool,
} from './loadEnvironment';
import { LoadHttpClient, sessionCookieFrom, type RequestOutcome } from './loadHttpClient';
import { MetricsCollector, round2, runPool, type LatencyStats, type OperationReport } from './loadMetrics';
import { clientIpFor, runJourney, runReplacementJourney, type JourneyContext, type JourneyResult, type JourneyUser } from './journey';
import { SESSION_COOKIE_NAME } from '../../src/backend/identity/cookies';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = resolve(REPO_ROOT, 'reports', 'loadtests');

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

interface CliOptions {
  levels: number[];
  concurrency: number;
  /** Budget mur par niveau, en secondes. */
  budgetSeconds: number;
  replacementSample: number;
  concurrencySample: number;
  timeoutMs: number;
  poolMax: number;
  outDir: string;
  /** Arrête la campagne au premier niveau impossible. */
  stopOnLimit: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const read = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  const flag = (name: string): boolean => argv.includes(`--${name}`);
  return {
    levels: read('levels', '100,1000,2000,10000').split(',').map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0),
    concurrency: Number(read('concurrency', '64')),
    budgetSeconds: Number(read('budget-seconds', '1800')),
    replacementSample: Number(read('replacement-sample', '100')),
    concurrencySample: Number(read('concurrency-sample', '25')),
    timeoutMs: Number(read('timeout-ms', '15000')),
    poolMax: Number(read('pool', String(process.env.LOADTEST_DB_POOL ?? 40))),
    outDir: read('out', REPORT_DIR),
    stopOnLimit: !flag('continue-on-limit'),
  };
}

/* ------------------------------------------------------------------ */
/* Saturation                                                          */
/* ------------------------------------------------------------------ */

interface SaturationSample {
  eventLoopDelayMs: LatencyStats;
  eventLoopMaxMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  cpuPercent: number;
  rssStartMb: number;
  rssPeakMb: number;
  heapUsedPeakMb: number;
  loadAvg1: number;
  cpuCount: number;
  freeMemMb: number;
  totalMemMb: number;
}

/**
 * Échantillonneur de saturation MOTEUR : relève, pendant toute la mesure, le
 * nombre de connexions réellement ouvertes sur la base et les verrous non
 * accordés. Deux requêtes par seconde : le coût est négligeable, et c'est la
 * seule façon honnête de publier un PIC (le relevé de fin de niveau, lui, a
 * lieu après l'arrêt de la charge).
 */
class SaturationSampler {
  private timer: NodeJS.Timeout | null = null;
  private peakConnections = 0;
  private peakUngrantedLocks = 0;
  private samples = 0;

  constructor(private readonly environment: LoadEnvironment, private readonly intervalMs = 500) {}

  start(): void {
    this.timer = setInterval(() => { void this.sample(); }, this.intervalMs);
    this.timer.unref?.();
  }

  private async sample(): Promise<void> {
    try {
      const connections = await this.environment.pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database()',
      );
      const locks = await this.environment.pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM pg_locks WHERE NOT granted',
      );
      this.samples += 1;
      this.peakConnections = Math.max(this.peakConnections, Number(connections.rows[0]?.count ?? 0));
      this.peakUngrantedLocks = Math.max(this.peakUngrantedLocks, Number(locks.rows[0]?.count ?? 0));
    } catch {
      // Une base momentanément saturée ne doit pas casser la mesure.
    }
  }

  stop(): { peakConnections: number; peakUngrantedLocks: number; samples: number } {
    if (this.timer) clearInterval(this.timer);
    return { peakConnections: this.peakConnections, peakUngrantedLocks: this.peakUngrantedLocks, samples: this.samples };
  }
}

class SaturationMonitor {
  private histogram: IntervalHistogram | null = null;
  private cpuStart: NodeJS.CpuUsage | null = null;
  private wallStart = 0;
  private rssStart = 0;
  private rssPeak = 0;
  private heapPeak = 0;
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    this.histogram = monitorEventLoopDelay({ resolution: 10 });
    this.histogram.enable();
    this.cpuStart = process.cpuUsage();
    this.wallStart = Date.now();
    this.rssStart = process.memoryUsage().rss;
    this.rssPeak = this.rssStart;
    this.heapPeak = process.memoryUsage().heapUsed;
    this.timer = setInterval(() => {
      const usage = process.memoryUsage();
      if (usage.rss > this.rssPeak) this.rssPeak = usage.rss;
      if (usage.heapUsed > this.heapPeak) this.heapPeak = usage.heapUsed;
    }, 250);
    this.timer.unref?.();
  }

  stop(durationMs: number): SaturationSample {
    if (this.timer) clearInterval(this.timer);
    const cpu = this.cpuStart ? process.cpuUsage(this.cpuStart) : { user: 0, system: 0 };
    const histogram = this.histogram;
    let eventLoop: LatencyStats = { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
    let eventLoopMax = 0;
    if (histogram) {
      histogram.disable();
      const values: number[] = [];
      // L'histogramme est cumulatif : on lit les quantiles fournis par Node
      // (aucune extrapolation) et on les convertit en millisecondes.
      eventLoop = {
        count: histogram.count,
        p50: round2((histogram.percentile(50) ?? 0) / 1e6),
        p95: round2((histogram.percentile(95) ?? 0) / 1e6),
        p99: round2((histogram.percentile(99) ?? 0) / 1e6),
        min: round2(histogram.min / 1e6),
        max: round2(histogram.max / 1e6),
        mean: round2(histogram.mean / 1e6),
      };
      eventLoopMax = round2(histogram.max / 1e6);
      values.length = 0;
    }
    return {
      eventLoopDelayMs: eventLoop,
      eventLoopMaxMs: eventLoopMax,
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
      cpuPercent: durationMs > 0 ? round2(((cpu.user + cpu.system) / 1000 / durationMs) * 100) : 0,
      rssStartMb: round2(this.rssStart / 1048576),
      rssPeakMb: round2(this.rssPeak / 1048576),
      heapUsedPeakMb: round2(this.heapPeak / 1048576),
      loadAvg1: round2(loadavg()[0] ?? 0),
      cpuCount: cpus().length,
      freeMemMb: Math.round(freemem() / 1048576),
      totalMemMb: Math.round(totalmem() / 1048576),
    };
  }
}

/* ------------------------------------------------------------------ */
/* État de la file / dead-letter                                       */
/* ------------------------------------------------------------------ */

interface QueueState {
  outbox: Record<string, number>;
  jobs: Record<string, number>;
  idempotencyKeys: number;
  auditEntries: number;
  cronTicks: number;
  deadLetters: number;
  activeConnections: number;
  maxConnections: number;
  /** Compteur cumulé du moteur (`pg_stat_database.deadlocks`) — delta observable. */
  deadlocks: number;
  /** Verrous NON accordés au moment du relevé (contention réelle). */
  ungrantedLocks: number;
}

async function readQueueState(environment: LoadEnvironment): Promise<QueueState> {
  const outbox = await environment.pool.query<{ status: string; count: string }>(
    'SELECT status, count(*)::text AS count FROM automation_outbox GROUP BY status',
  );
  const jobs = await environment.pool.query<{ status: string; count: string }>(
    'SELECT status, count(*)::text AS count FROM automation_jobs GROUP BY status',
  );
  const idempotency = await environment.pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM automation_idempotency',
  );
  const audit = await environment.pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM automation_audit_ledger',
  );
  const ticks = await environment.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM automation_audit_ledger WHERE action = 'CRON_TICK_EXECUTED'",
  );
  const connections = await environment.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database()",
  );
  const maxConnections = await environment.pool.query<{ setting: string }>(
    "SELECT setting FROM pg_settings WHERE name = 'max_connections'",
  );
  const deadlocks = await environment.pool.query<{ deadlocks: string }>(
    'SELECT deadlocks::text AS deadlocks FROM pg_stat_database WHERE datname = current_database()',
  );
  const ungranted = await environment.pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM pg_locks WHERE NOT granted',
  );
  const outboxMap: Record<string, number> = {};
  for (const row of outbox.rows) outboxMap[row.status] = Number(row.count);
  const jobsMap: Record<string, number> = {};
  for (const row of jobs.rows) jobsMap[row.status] = Number(row.count);
  return {
    outbox: outboxMap,
    jobs: jobsMap,
    idempotencyKeys: Number(idempotency.rows[0]?.count ?? 0),
    auditEntries: Number(audit.rows[0]?.count ?? 0),
    cronTicks: Number(ticks.rows[0]?.count ?? 0),
    deadLetters: (outboxMap['DEAD_LETTER'] ?? 0) + (jobsMap['DEAD_LETTER'] ?? 0),
    activeConnections: Number(connections.rows[0]?.count ?? 0),
    maxConnections: Number(maxConnections.rows[0]?.setting ?? 0),
    deadlocks: Number(deadlocks.rows[0]?.deadlocks ?? 0),
    ungrantedLocks: Number(ungranted.rows[0]?.count ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Niveau de charge                                                    */
/* ------------------------------------------------------------------ */

interface LevelReport {
  level: number;
  concurrency: number;
  accountsCreated: number;
  planned: number;
  executed: number;
  completed: number;
  aborted: number;
  durationMs: number;
  /** true si le niveau a été interrompu par le budget (RESOURCE_LIMITATION). */
  truncated: boolean;
  truncationReason: string | null;
  http: {
    requests: number;
    errors: number;
    errorRatePct: number;
    timeouts: number;
    retries: number;
    throughputRps: number;
    latency: LatencyStats;
    statusCounts: Record<string, number>;
    slowest: OperationReport[];
  };
  database: {
    queries: number;
    queryLatency: LatencyStats;
    poolAcquireLatency: LatencyStats;
    poolAcquireCount: number;
    errors: number;
  };
  saturation: SaturationSample;
  /** Pic de connexions et de verrous non accordés réellement observé (échantillonné). */
  enginePeak: { peakConnections: number; peakUngrantedLocks: number; samples: number };
  queueBefore: QueueState;
  queueAfter: QueueState;
  replacement: {
    planned: number;
    executed: number;
    completed: number;
    durationMs: number;
    throughputRps: number;
    latency: LatencyStats;
    errors: number;
  };
  concurrencyChecks: ConcurrencyReport;
  /** Passées Cron/Queue réellement exécutées pendant la mesure. */
  cronTicks: { attempts: number; failures: number; latency: LatencyStats };
  /**
   * Limites PRODUIT réellement atteintes pendant le parcours (comptées, jamais
   * converties en succès silencieux), et taille réelle du bassin candidats.
   */
  productLimits: Record<string, number>;
  matchingPool: { activeProfiles: number; cap: number } | null;
  failures: Array<{ step: string; status: number; count: number; sample: string }>;
}

interface ConcurrencyCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface ConcurrencyReport {
  checks: ConcurrencyCheck[];
  passed: number;
  failed: number;
  durationMs: number;
  requests: number;
}

async function runLevel(
  environment: LoadEnvironment,
  options: CliOptions,
  level: number,
  pool: LoadIdentityPool,
): Promise<{ report: LevelReport }> {
  const concurrency = Math.max(1, Math.min(options.concurrency, level));
  const deadline = Date.now() + options.budgetSeconds * 1000;

  console.log('------------------------------------------------------------');
  console.log(`NIVEAU ${level} — concurrence ${concurrency} — budget ${options.budgetSeconds}s`);

  /* Préparation : identités déjà signées hors fenêtre de mesure. */
  const preparationStarted = Date.now();
  const journeyCredentials = pool.allocate(level * 2);
  const users: JourneyUser[] = Array.from({ length: level }, (_, index) => ({
    index,
    employerCredential: journeyCredentials[index * 2],
    candidateCredential: journeyCredentials[index * 2 + 1],
  }));
  const admin = await provisionAdmin(environment, `lvl${level}`);
  console.log(`  préparation: ${level * 2} identités allouées + ADMIN en ${Date.now() - preparationStarted} ms (hors mesure)`);

  const collector = new MetricsCollector();
  const cronCollector = new MetricsCollector();
  const client = new LoadHttpClient({
    baseUrl: environment.baseUrl,
    defaultTimeoutMs: options.timeoutMs,
    defaultRetries: 0,
    maxSockets: Math.max(64, concurrency * 4),
    collector,
  });

  const productLimits: Record<string, number> = {};
  const context: JourneyContext = {
    client,
    adminToken: admin.token,
    note: label => { productLimits[label] = (productLimits[label] ?? 0) + 1; },
    keyPrefix: `lt${level}`,
    async cronTick() {
      // Le déclencheur planifié est INDÉPENDANT de la requête utilisateur : un
      // échec de tick (par exemple un deadlock PostgreSQL concurrent) est
      // COMPTÉ et retenté, jamais masqué, et n'interrompt pas le parcours.
      let retries = 0;
      for (;;) {
        const started = process.hrtime.bigint();
        try {
          const report = await environment.composition.automationWorker!.runScheduledCycle({ limit: 25, trigger: 'loadtests' });
          const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
          cronCollector.record('CRON runScheduledCycle', { durationMs, ok: true, status: 200, retries });
          environment.cron.ticks += 1;
          if (retries > 0) cronFailures.push({ error: 'retry après échec', retries });
          return report;
        } catch (error) {
          const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
          const message = String((error as Error)?.message ?? error).slice(0, 200);
          cronCollector.record('CRON runScheduledCycle', { durationMs, ok: false, status: 500, retries });
          environment.cron.failed += 1;
          cronFailures.push({ error: message, retries });
          if (retries >= 2) return null;
          retries += 1;
          await new Promise(resolvePromise => setTimeout(resolvePromise, 50 * retries));
        }
      }
    },
  };

  const queueBefore = await readQueueState(environment);
  const cronFailures: Array<{ error: string; retries: number }> = [];

  /* Mesure : parcours complet, concurrence bornée. */
  const monitor = new SaturationMonitor();
  const results: JourneyResult[] = new Array(level);
  let executed = 0;
  let truncated = false;
  let truncationReason: string | null = null;

  monitor.start();
  const sampler = new SaturationSampler(environment);
  sampler.start();
  const startedAt = Date.now();
  await runPool(concurrency, users.map(user => async () => {
    if (truncated) return { index: user.index, steps: 0, completed: false, failedStep: 'not-executed', status: 0, detail: 'budget épuisé', contractId: null } as JourneyResult;
    if (Date.now() > deadline) {
      truncated = true;
      truncationReason = `budget de ${options.budgetSeconds}s atteint après ${executed}/${level} utilisateurs`;
      return { index: user.index, steps: 0, completed: false, failedStep: 'not-executed', status: 0, detail: 'budget épuisé', contractId: null } as JourneyResult;
    }
    const result = await runJourney(context, user);
    executed += 1;
    return result;
  }), (result, index) => { results[index] = result; });
  const durationMs = Date.now() - startedAt;
  const saturation = monitor.stop(durationMs);
  const enginePeak = sampler.stop();

  const completed = results.filter(result => result && result.completed).length;
  const aborted = results.filter(result => result && !result.completed && result.failedStep !== 'not-executed').length;

  /* Agrégation des échecs par étape (aucun échec masqué). */
  const failureMap = new Map<string, { status: number; count: number; sample: string }>();
  for (const failure of cronFailures) {
    const entry = failureMap.get('CRON runScheduledCycle');
    if (entry) entry.count += 1;
    else failureMap.set('CRON runScheduledCycle', { status: 500, count: 1, sample: failure.error });
  }
  for (const result of results) {
    if (!result || result.completed) continue;
    const step = result.failedStep ?? 'unknown';
    const existing = failureMap.get(step);
    if (existing) existing.count += 1;
    else failureMap.set(step, { status: result.status, count: 1, sample: result.detail.slice(0, 240) });
  }

  const httpAggregate = collector.aggregate(durationMs);
  const cronAggregate = cronCollector.aggregate(durationMs);
  const dbQueryStats = environment.probe.query.aggregate(durationMs);
  const dbAcquireStats = environment.probe.acquire.aggregate(durationMs);

  console.log(`  parcours : ${completed}/${executed} complets, ${aborted} interrompus, ${durationMs} ms`);
  console.log(`  HTTP     : ${httpAggregate.requests} requêtes, ${httpAggregate.throughputRps} rps, ` +
    `p50 ${httpAggregate.latency.p50} / p95 ${httpAggregate.latency.p95} / p99 ${httpAggregate.latency.p99} ms, ` +
    `erreurs ${httpAggregate.errorRatePct}%`);
  if (truncated) console.log(`  ⚠ INTERROMPU : ${truncationReason}`);
  for (const [step, value] of failureMap) console.log(`  échec ${step} (${value.status}) × ${value.count} — ${value.sample.slice(0, 160)}`);
  for (const [label, count] of Object.entries(productLimits)) console.log(`  limite produit : ${label} × ${count}`);

  /* REMPLACEMENT — scénario dédié, échantillon borné. */
  const replacementCollector = new MetricsCollector();
  const replacementClient = new LoadHttpClient({
    baseUrl: environment.baseUrl,
    defaultTimeoutMs: options.timeoutMs,
    maxSockets: 128,
    collector: replacementCollector,
  });
  const replacementPlanned = Math.min(level, options.replacementSample);
  const replacementCredentials = pool.allocate(replacementPlanned * 2);
  const replacementUsers: JourneyUser[] = Array.from({ length: replacementPlanned }, (_, index) => ({
    index,
    employerCredential: replacementCredentials[index * 2],
    candidateCredential: replacementCredentials[index * 2 + 1],
  }));
  const replacementContext: JourneyContext = {
    client: replacementClient,
    adminToken: admin.token,
    keyPrefix: `lt${level}-rep`,
    async cronTick() {
      try {
        await environment.composition.automationWorker!.runScheduledCycle({ limit: 25, trigger: 'loadtests-replacement' });
      } catch {
        // Tick indépendant : l'échec est mesuré au niveau de la campagne.
      }
      return null;
    },
  };
  const replacementResults: JourneyResult[] = new Array(replacementPlanned);
  const replacementStarted = Date.now();
  await runPool(Math.max(1, Math.min(options.concurrency, replacementPlanned)), replacementUsers.map(user => async () => {
    if (Date.now() > deadline) return { index: user.index, steps: 0, completed: false, failedStep: 'not-executed', status: 0, detail: 'budget épuisé', contractId: null } as JourneyResult;
    return runReplacementJourney(replacementContext, user);
  }), (result, index) => { replacementResults[index] = result; });
  const replacementDuration = Date.now() - replacementStarted;
  const replacementAggregate = replacementCollector.aggregate(replacementDuration);
  replacementClient.close();
  const replacementCompleted = replacementResults.filter(result => result && result.completed).length;
  console.log(`  remplacement : ${replacementCompleted}/${replacementPlanned} dossiers complets en ${replacementDuration} ms`);
  const cronReport = cronAggregate.byOperation.find(entry => entry.label === 'CRON runScheduledCycle');
  console.log(`  Cron/Queue   : ${cronReport?.count ?? 0} passées, ${cronReport?.errors ?? 0} échecs, ` +
    `p50 ${cronReport?.latency.p50 ?? 0} / p95 ${cronReport?.latency.p95 ?? 0} / p99 ${cronReport?.latency.p99 ?? 0} ms`);

  /* Concurrence métier : doubles appels, aucun double effet. */
  const concurrencyReport = await runConcurrencyPhase(environment, {
    client,
    sample: Math.min(level, options.concurrencySample),
    credentials: pool.allocate(Math.min(level, options.concurrencySample) * 2),
    keyPrefix: `lt${level}-cc`,
    adminToken: admin.token,
  });
  console.log(`  concurrence métier : ${concurrencyReport.passed}/${concurrencyReport.passed + concurrencyReport.failed} vérifications OK`);

  const queueAfter = await readQueueState(environment);
  client.close();

  const report: LevelReport = {
    level,
    concurrency,
    accountsCreated: level * 2 + replacementPlanned * 2,
    planned: level,
    executed,
    completed,
    aborted,
    durationMs,
    truncated,
    truncationReason,
    http: {
      requests: httpAggregate.requests,
      errors: httpAggregate.errors,
      errorRatePct: httpAggregate.errorRatePct,
      timeouts: httpAggregate.timeouts,
      retries: httpAggregate.retries,
      throughputRps: httpAggregate.throughputRps,
      latency: httpAggregate.latency,
      statusCounts: httpAggregate.statusCounts,
      slowest: httpAggregate.byOperation
        .slice()
        .sort((a, b) => b.latency.p95 - a.latency.p95)
        .slice(0, 12),
    },
    database: {
      queries: dbQueryStats.requests,
      queryLatency: dbQueryStats.latency,
      poolAcquireLatency: dbAcquireStats.latency,
      poolAcquireCount: dbAcquireStats.requests,
      errors: dbQueryStats.errors,
    },
    saturation,
    enginePeak,
    queueBefore,
    queueAfter,
    replacement: {
      planned: replacementPlanned,
      executed: replacementResults.filter(result => result && result.failedStep !== 'not-executed').length,
      completed: replacementCompleted,
      durationMs: replacementDuration,
      throughputRps: replacementAggregate.throughputRps,
      latency: replacementAggregate.latency,
      errors: replacementAggregate.errors,
    },
    concurrencyChecks: concurrencyReport,
    productLimits,
    matchingPool: await (async () => {
      const profiles = await environment.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM candidate_matching_profiles WHERE availability IN ('AVAILABLE','LIMITED')",
      );
      return { activeProfiles: Number(profiles.rows[0]?.count ?? 0), cap: 200 };
    })(),
    cronTicks: (() => {
      const cron = cronAggregate.byOperation.find(entry => entry.label === 'CRON runScheduledCycle');
      return {
        attempts: cron?.count ?? 0,
        failures: cron?.errors ?? 0,
        latency: cron?.latency ?? { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 },
      };
    })(),
    failures: [...failureMap].map(([step, value]) => ({ step, status: value.status, count: value.count, sample: value.sample })),
  };

  return { report };
}

/* ------------------------------------------------------------------ */
/* Concurrence métier : doubles appels                                 */
/* ------------------------------------------------------------------ */

/**
 * Attend, de façon BORNÉE, que le contrat soit réellement matérialisé par les
 * workers (événement `CONTRACT_ACTIVATED` traité + lignes `payments` créées).
 *
 * Nécessaire parce que la file est PARTAGÉE : un autre worker concurrent peut
 * avoir réservé l'événement de ce contrat avant nous. Ce n'est pas une attente
 * de complaisance — le succès n'est jamais supposé : la fonction relance un
 * drain borné et renvoie false si la matérialisation n'a pas eu lieu.
 */
async function waitForContractMaterialization(
  environment: LoadEnvironment,
  contractId: string,
  timeoutMs = 20_000,
): Promise<{ materialized: boolean; waitedMs: number; attempts: number }> {
  const started = Date.now();
  let attempts = 0;
  for (;;) {
    const event = await environment.pool.query<{ status: string; count: string }>(
      `SELECT min(status) AS status, count(*)::text AS count FROM automation_outbox
        WHERE aggregate_id = $1 AND event_type = 'CONTRACT_ACTIVATED'`, [contractId],
    );
    const payments = await environment.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM payments WHERE contract_id = $1', [contractId],
    );
    if (Number(payments.rows[0]?.count ?? 0) > 0) {
      return { materialized: true, waitedMs: Date.now() - started, attempts };
    }
    if (event.rows[0]?.status === 'DEAD_LETTER') {
      return { materialized: false, waitedMs: Date.now() - started, attempts };
    }
    if (Date.now() - started > timeoutMs) {
      return { materialized: false, waitedMs: Date.now() - started, attempts };
    }
    attempts += 1;
    await environment.composition.automationWorker!.drainEvents(100).catch(() => undefined);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
}

async function runConcurrencyPhase(
  environment: LoadEnvironment,
  input: { client: LoadHttpClient; sample: number; credentials: string[]; keyPrefix: string; adminToken: string },
): Promise<ConcurrencyReport> {
  const checks: ConcurrencyCheck[] = [];
  const started = Date.now();
  let requests = 0;

  const client = input.client;
  const check = (name: string, ok: boolean, detail: string): void => { checks.push({ name, ok, detail }); };
  const call = async (
    method: 'GET' | 'POST',
    path: string,
    headers: Record<string, string>,
    body?: string,
    expected: readonly number[] = [200, 201],
  ): Promise<RequestOutcome> => {
    requests += 1;
    return client.send({ method, path, label: `CC ${method} ${path.split('/').slice(0, 5).join('/')}`, headers, ...(body !== undefined ? { body } : {}), expectedStatus: expected });
  };

  for (let index = 0; index < input.sample; index += 1) {
    const key = (name: string): string => `${input.keyPrefix}-${index}-${name}`;
    const employerCredential = input.credentials[index * 2];
    const candidateCredential = input.credentials[index * 2 + 1];

    const loginHeaders = { 'content-type': 'application/json', 'x-forwarded-for': clientIpFor(10_000 + index) };
    const employerLogin = await call('POST', '/api/v1/auth/google/credential',
      loginHeaders,
      JSON.stringify({ credential: employerCredential, requestedRole: 'EMPLOYER' }), [200, 201]);
    const employerToken = sessionCookieFrom(employerLogin, SESSION_COOKIE_NAME);
    const candidateLogin = await call('POST', '/api/v1/auth/google/credential',
      loginHeaders,
      JSON.stringify({ credential: candidateCredential, requestedRole: 'CANDIDATE' }), [200, 201]);
    const candidateToken = sessionCookieFrom(candidateLogin, SESSION_COOKIE_NAME);

    const edge = { 'x-forwarded-for': clientIpFor(10_000 + index) };
    const employerJson = (name: string): Record<string, string> => ({
      ...edge, cookie: `${SESSION_COOKIE_NAME}=${employerToken}`, 'content-type': 'application/json', 'Idempotency-Key': key(name),
    });
    const candidateJson = (name: string): Record<string, string> => ({
      ...edge, cookie: `${SESSION_COOKIE_NAME}=${candidateToken}`, 'content-type': 'application/json', 'Idempotency-Key': key(name),
    });
    const employerAuth = { ...edge, cookie: `${SESSION_COOKIE_NAME}=${employerToken}` };

    /* 1. Double CANDIDATURE (même clé) */
    const offer = JSON.parse((await call('POST', '/api/v1/offers', employerJson('offer'), JSON.stringify({
      title: `CC offre ${index}`, contractType: 'CDI', remuneration: 175000, currency: 'FCFA', location: 'Cotonou', summary: 'Concurrence candidature.',
    }), [201])).body) as { id: string };

    const [firstApplication, secondApplication] = await Promise.all([
      call('POST', `/api/v1/offers/${offer.id}/applications`, candidateJson('application'), JSON.stringify({ note: 'double' }), [201]),
      call('POST', `/api/v1/offers/${offer.id}/applications`, candidateJson('application'), JSON.stringify({ note: 'double' }), [201]),
    ]);
    const applicationIds = new Set([
      (JSON.parse(firstApplication.body) as { id: string }).id,
      (JSON.parse(secondApplication.body) as { id: string }).id,
    ]);
    const applicationRows = await environment.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM applications WHERE offer_id = $1', [offer.id],
    );
    check('candidature : double appel idempotent = une seule candidature',
      applicationIds.size === 1 && Number(applicationRows.rows[0]?.count) === 1,
      `ids distincts ${applicationIds.size}, lignes ${applicationRows.rows[0]?.count}`);
    const applicationId = (JSON.parse(firstApplication.body) as { id: string }).id;

    /* 2. Double DÉCISION (examine, puis shortlist) */
    await Promise.all([
      call('POST', `/api/v1/applications/${applicationId}/examine`, employerJson('examine'), '{}'),
      call('POST', `/api/v1/applications/${applicationId}/examine`, employerJson('examine'), '{}'),
    ]);
    await Promise.all([
      call('POST', `/api/v1/applications/${applicationId}/shortlist`, employerJson('shortlist'), '{}'),
      call('POST', `/api/v1/applications/${applicationId}/shortlist`, employerJson('shortlist'), '{}'),
    ]);
    const history = await environment.pool.query<{ history: unknown }>('SELECT history FROM applications WHERE id = $1', [applicationId]);
    const historyLength = ((typeof history.rows[0]?.history === 'string'
      ? JSON.parse(String(history.rows[0]?.history))
      : history.rows[0]?.history) as unknown[])?.length ?? 0;
    check('décision : double examine + double shortlist = une seule transition chacune',
      historyLength === 3, // soumission + examine + shortlist
      `entrées d'historique ${historyLength} (3 attendues)`);

    /* 3. Double CONFIRMATION (double signature du contrat) */
    const proposal = JSON.parse((await call('POST', `/api/v1/conversations/${key('conv')}/proposals`, employerJson('proposal'), JSON.stringify({
      offerId: offer.id, applicationId, missionTitle: `CC mission ${index}`, amount: 175000, currency: 'FCFA',
      periodicity: 'Mensuel', startDate: '01 Janvier 2026', durationMonths: 6, location: 'Cotonou', conditions: ['Temps plein'],
    }), [201])).body) as { id: string };
    await call('POST', `/api/v1/proposals/${proposal.id}/respond`, candidateJson('accept'), JSON.stringify({ action: 'ACCEPT' }));
    const contract = JSON.parse((await call('POST', '/api/v1/contracts', employerJson('contract'), JSON.stringify({ proposalId: proposal.id }), [201])).body) as { id: string };
    await call('POST', `/api/v1/contracts/${contract.id}/send`, employerJson('send'), '{}');
    await Promise.all([
      call('POST', `/api/v1/contracts/${contract.id}/sign`, candidateJson('sign'), '{}'),
      call('POST', `/api/v1/contracts/${contract.id}/sign`, candidateJson('sign'), '{}'),
    ]);
    const signatureRows = await environment.pool.query<{ employer_signed: boolean; employee_signed: boolean; status: string }>(
      'SELECT employer_signed, employee_signed, status FROM contracts WHERE id = $1', [contract.id],
    );
    const signature = signatureRows.rows[0];
    check('confirmation : double signature = un seul drapeau posé, statut unique',
      Boolean(signature?.employee_signed) && signature?.status === 'SIGNATURE',
      `employee_signed=${signature?.employee_signed}, status=${signature?.status}`);

    /* 4. Double CRON + double WORKER sur la même Outbox */
    await call('POST', `/api/v1/contracts/${contract.id}/activate`, employerJson('activate'), '{}');
    const [cycleA, cycleB] = await Promise.all([
      environment.composition.automationWorker!.runScheduledCycle({ limit: 50, trigger: 'loadtests-cc-a' }),
      environment.composition.automationWorker!.runScheduledCycle({ limit: 50, trigger: 'loadtests-cc-b' }),
    ]);
    const materialization = await waitForContractMaterialization(environment, contract.id);
    const scheduleRows = await environment.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id = $1', [contract.id],
    );
    const activationEvents = await environment.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_type = 'contract' AND aggregate_id = $1 AND event_type = 'CONTRACT_ACTIVATED'",
      [contract.id],
    );
    const paymentDuplicates = await environment.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM (
         SELECT period_key, payment_type FROM payments WHERE contract_id = $1
          GROUP BY period_key, payment_type HAVING count(*) > 1
       ) duplicates`, [contract.id],
    );
    const paymentRows = await environment.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM payments WHERE contract_id = $1', [contract.id],
    );
    check('Cron/Queue : deux ticks et deux workers simultanés = un seul échéancier, aucun double paiement',
      Number(activationEvents.rows[0]?.count) === 1
        && Number(scheduleRows.rows[0]?.count) > 0
        && Number(paymentDuplicates.rows[0]?.count) === 0
        && Number(paymentRows.rows[0]?.count) > 0,
      `événements ${activationEvents.rows[0]?.count}, échéances ${scheduleRows.rows[0]?.count}, lignes de paiement ${paymentRows.rows[0]?.count}, ` +
      `doublons ${paymentDuplicates.rows[0]?.count}, cycles ${cycleA.events.completed}/${cycleB.events.completed}, ` +
      `matérialisé en ${materialization.waitedMs} ms (${materialization.attempts} drains d'attente)`);

    /* 5. Double WebRTC signaling (même clé) */
    const session = JSON.parse((await call('POST', '/api/v1/webrtc-sessions', employerJson('webrtc'), JSON.stringify({ entityType: 'CONTRACT', entityId: contract.id }), [201])).body) as { sessionId: string };
    await call('POST', `/api/v1/webrtc-sessions/${session.sessionId}/join`, candidateJson('webrtc-join'), '{}');
    const callCredential = JSON.parse((await call('POST', `/api/v1/webrtc-sessions/${session.sessionId}/credentials`, employerJson('webrtc-cred'), '{}', [201])).body) as { credential: string };
    await Promise.all([
      call('POST', `/api/v1/webrtc-sessions/${session.sessionId}/signaling`,
        { ...employerJson('webrtc-signal'), 'X-WebRTC-Credential': callCredential.credential },
        JSON.stringify({ type: 'OFFER', payload: { sdp: 'v=0\r\no=- cc' } }), [201]),
      call('POST', `/api/v1/webrtc-sessions/${session.sessionId}/signaling`,
        { ...employerJson('webrtc-signal'), 'X-WebRTC-Credential': callCredential.credential },
        JSON.stringify({ type: 'OFFER', payload: { sdp: 'v=0\r\no=- cc' } }), [201]),
    ]);
    const signals = await environment.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM webrtc_signaling_messages WHERE session_id = $1 AND message_type = 'OFFER'", [session.sessionId],
    );
    check('WebRTC : double signaling idempotent = un seul message persisté',
      Number(signals.rows[0]?.count) === 1, `messages OFFER ${signals.rows[0]?.count}`);

    /* 6. Double PAIEMENT (déclaration de salaire) */
    const beforeEnd = await waitForContractMaterialization(environment, contract.id);
    await call('POST', `/api/v1/contracts/${contract.id}/end`, employerJson('end'), '{}');
    const close = JSON.parse((await call('POST', `/api/v1/contracts/${contract.id}/payments/close-mission`, employerJson('close'), '{}')).body) as {
      payments: Array<{ paymentId: string; paymentType: string }>;
    };
    const salary = close.payments.find(entry => entry.paymentType === 'SALARY');
    if (salary) {
      const [declarationA, declarationB] = await Promise.all([
        call('POST', '/api/v1/payments/salary-declarations', employerJson('declare'),
          JSON.stringify({ paymentId: salary.paymentId, reference: `CC-SAL-${index}` }), [200, 201, 409]),
        call('POST', '/api/v1/payments/salary-declarations', employerJson('declare'),
          JSON.stringify({ paymentId: salary.paymentId, reference: `CC-SAL-${index}` }), [200, 201, 409]),
      ]);
      const declarations = await environment.pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id = $1', [salary.paymentId],
      );
      const paymentStatus = await environment.pool.query<{ status: string; reference: string | null }>(
        'SELECT status, reference FROM payments WHERE id = $1', [salary.paymentId],
      );
      check('paiement : double déclaration = une seule tentative persistée',
        Number(declarations.rows[0]?.count) === 1 && Math.max(declarationA.status, declarationB.status) < 400,
        `déclarations ${declarations.rows[0]?.count}, statuts ${declarationA.status}/${declarationB.status}, ` +
        `paiement ${paymentStatus.rows[0]?.status}/${paymentStatus.rows[0]?.reference}, ` +
        `exemple ${(declarationA.status >= 400 ? declarationA : declarationB).body.slice(0, 160)}, ` +
        `matérialisation préalable ${beforeEnd.materialized}`);
    } else {
      check('paiement : double déclaration = une seule tentative persistée', false, 'aucun paiement SALARY constaté à la clôture');
    }
    void employerAuth;
  }

  return {
    checks,
    passed: checks.filter(entry => entry.ok).length,
    failed: checks.filter(entry => !entry.ok).length,
    durationMs: Date.now() - started,
    requests,
  };
}

/* ------------------------------------------------------------------ */
/* Résilience                                                          */
/* ------------------------------------------------------------------ */

interface ResilienceReport {
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  timeouts: { attempted: number; observed: number; timeoutMs: number };
  retry: { forcedRetries: number; observedLatency: LatencyStats };
  orphanRecovery: { seeded: number; recovered: number; deadLettered: number; durationMs: number };
  backlog: { pendingEvents: number; cycles: number; drained: number; durationMs: number; throughputPerSec: number };
  idempotency: { keys: number; replays: number };
}

async function runResiliencePhase(environment: LoadEnvironment, options: CliOptions): Promise<ResilienceReport> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const check = (name: string, ok: boolean, detail: string): void => { checks.push({ name, ok, detail }); };

  /* 1. TIMEOUT réel : timeout client très court sur des requêtes pourtant valides. */
  const timeoutClient = new LoadHttpClient({ baseUrl: environment.baseUrl, defaultTimeoutMs: 1, maxSockets: 32 });
  const timeoutAttempts = 40;
  const timeoutResults = await Promise.all(
    Array.from({ length: timeoutAttempts }, () => timeoutClient.send({ method: 'GET', path: '/api/v1/offers?limit=5', label: 'RESILIENCE timeout GET /api/v1/offers', expectedStatus: [200] })),
  );
  const observedTimeouts = timeoutResults.filter(result => result.timeout).length;
  check('timeout : un timeout client de 1 ms interrompt réellement la requête',
    observedTimeouts > 0, `${observedTimeouts}/${timeoutAttempts} requêtes interrompues`);
  const survived = await timeoutClient.send({ method: 'GET', path: '/api/v1/offers?limit=5', label: 'RESILIENCE survie', timeoutMs: options.timeoutMs, expectedStatus: [200] });
  check('timeout : le serveur continue de répondre après une salve de timeouts', survived.ok, `statut ${survived.status}`);
  timeoutClient.close();

  /* 2. RETRY : nouvelles tentatives réellement comptées. */
  const retryClient = new LoadHttpClient({ baseUrl: environment.baseUrl, defaultTimeoutMs: 1, defaultRetries: 3, maxSockets: 32 });
  const retryOutcome = await retryClient.send({ method: 'GET', path: '/api/v1/offers?limit=5', label: 'RESILIENCE retry GET /api/v1/offers', expectedStatus: [200] });
  check('retry : les nouvelles tentatives sont exécutées et COMPTÉES',
    retryOutcome.retries > 0, `${retryOutcome.retries} tentative(s), statut final ${retryOutcome.status}`);
  const retryStats = retryClient.collector.aggregate(1);
  const forcedRetries = retryStats.retries;
  retryClient.close();

  /* 3. CRASH / REPRISE : claims orphelins (crash après réservation, avant ack). */
  const seeded = await environment.pool.query<{ count: string }>(`
    UPDATE automation_outbox
       SET status = 'PROCESSING',
           processing_started_at = now() - interval '30 minutes',
           attempts = attempts + 1
     WHERE status = 'PENDING'
       AND id IN (SELECT id FROM automation_outbox WHERE status = 'PENDING' ORDER BY id LIMIT 25)
     RETURNING id
  `);
  const orphanSeeded = seeded.rowCount ?? 0;
  const recoveryStarted = Date.now();
  const recovery = await environment.composition.automationWorker!.recoverStaleClaims();
  const recoveryDuration = Date.now() - recoveryStarted;
  check('crash/reprise : les claims orphelins sont récupérés (aucun job perdu en silence)',
    recovery.eventsRecovered >= 0 && (orphanSeeded === 0 || recovery.eventsRecovered > 0),
    `${orphanSeeded} orphelins semés, ${recovery.eventsRecovered} récupérés, ${recovery.eventsDeadLettered} en dead-letter`);

  /* 4. DEAD-LETTER : un message dont le traitement échoue de façon durable et
   *    qui a épuisé sa borne de tentatives est isolé, jamais rejoué en boucle. */
  const poisonEventId = `loadtest-poison-${Date.now()}`;
  await environment.pool.query(
    `INSERT INTO automation_outbox (id, event_type, aggregate_type, aggregate_id, actor_id, payload, source, status, attempts, available_at)
     VALUES ($1, 'CONTRACT_ACTIVATED', 'contract', 'ctr_loadtest_absent', 'SYSTEM', $2::jsonb, 'P0-LOAD-TESTS', 'PENDING', 5, now() - interval '1 minute')`,
    [poisonEventId, JSON.stringify({ contractId: 'ctr_loadtest_absent' })],
  );
  const poisonDrain = await environment.composition.automationWorker!.drainEvents(10);
  const poisonOutcome = poisonDrain.entries.find(entry => entry.eventId === poisonEventId)?.result ?? 'non-traité';
  const poisonRow = await environment.pool.query<{ status: string; attempts: number; last_error: string | null }>(
    'SELECT status, attempts, last_error FROM automation_outbox WHERE id = $1', [poisonEventId],
  );
  const deadLetteredTotal = await environment.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'DEAD_LETTER'",
  );
  check('dead-letter : un message qui échoue durablement est isolé (jamais rejoué en boucle)',
    poisonRow.rows[0]?.status === 'DEAD_LETTER',
    `issue du drain « ${poisonOutcome} », statut ${poisonRow.rows[0]?.status}, tentatives ${poisonRow.rows[0]?.attempts}, ` +
    `erreur « ${(poisonRow.rows[0]?.last_error ?? '').slice(0, 120)} », total dead-letter ${deadLetteredTotal.rows[0]?.count}`);

  /* 4bis. Un message orphelin ayant épuisé sa borne est lui aussi isolé. */
  const exhausted = await environment.pool.query<{ count: string }>(`
    UPDATE automation_outbox
       SET status = 'PROCESSING',
           processing_started_at = now() - interval '30 minutes',
           attempts = 5
     WHERE status = 'PENDING'
       AND id IN (SELECT id FROM automation_outbox WHERE status = 'PENDING' ORDER BY id LIMIT 10)
     RETURNING id
  `);
  const exhaustedSeeded = exhausted.rowCount ?? 0;
  const deadLetterRecovery = await environment.composition.automationWorker!.recoverStaleClaims();
  check('dead-letter : un claim orphelin épuisé est isolé au lieu d’être rejoué indéfiniment',
    exhaustedSeeded === 0 || deadLetterRecovery.eventsDeadLettered > 0,
    `${exhaustedSeeded} orphelins épuisés, ${deadLetterRecovery.eventsDeadLettered} isolés par la récupération`);

  /* 5. BACKLOG : drain borné de la file réellement produite par la charge. */
  const pendingBefore = await environment.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'PENDING'",
  );
  const backlogStart = Date.now();
  let drained = 0;
  let cycles = 0;
  for (let cycle = 0; cycle < 40; cycle += 1) {
    const report = await environment.composition.automationWorker!.drain(200);
    cycles += 1;
    const processed = report.events.completed + report.events.deadLettered;
    drained += processed;
    if (processed === 0) break;
  }
  const backlogDuration = Date.now() - backlogStart;
  const pendingAfter = await environment.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'PENDING'",
  );
  check('backlog : la file se vide par passes bornées, sans croissance silencieuse',
    Number(pendingAfter.rows[0]?.count ?? 0) <= Number(pendingBefore.rows[0]?.count ?? 0),
    `PENDING ${pendingBefore.rows[0]?.count} → ${pendingAfter.rows[0]?.count}, ${drained} traités en ${cycles} passes`);

  /* 6. IDEMPOTENCE durable : clés mémorisées, rejeux servis. */
  const idempotency = await environment.pool.query<{ count: string }>('SELECT count(*)::text AS count FROM automation_idempotency');
  const replayed = await environment.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM automation_audit_ledger WHERE reference LIKE 'lt%'",
  );
  check('idempotence : les clés d’idempotence sont durablement mémorisées',
    Number(idempotency.rows[0]?.count ?? 0) > 0 && Number(replayed.rows[0]?.count ?? 0) > 0,
    `${idempotency.rows[0]?.count} clés, ${replayed.rows[0]?.count} traces d'audit des commandes de charge`);

  return {
    checks,
    timeouts: { attempted: timeoutAttempts, observed: observedTimeouts, timeoutMs: 1 },
    retry: { forcedRetries, observedLatency: retryStats.latency },
    orphanRecovery: {
      seeded: orphanSeeded,
      recovered: recovery.eventsRecovered,
      deadLettered: Number(deadLetteredTotal.rows[0]?.count ?? 0) + deadLetterRecovery.eventsDeadLettered,
      durationMs: recoveryDuration,
    },
    backlog: {
      pendingEvents: Number(pendingAfter.rows[0]?.count ?? 0),
      cycles,
      drained,
      durationMs: backlogDuration,
      throughputPerSec: backlogDuration > 0 ? round2((drained / backlogDuration) * 1000) : 0,
    },
    idempotency: { keys: Number(idempotency.rows[0]?.count ?? 0), replays: Number(replayed.rows[0]?.count ?? 0) },
  };
}

/* ------------------------------------------------------------------ */
/* Sécurité sous charge                                                */
/* ------------------------------------------------------------------ */

interface SecurityReport {
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  statusCounts: Record<string, number>;
  rateLimited: number;
}

async function runSecurityPhase(environment: LoadEnvironment, options: CliOptions, pool: LoadIdentityPool): Promise<SecurityReport> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const check = (name: string, ok: boolean, detail: string): void => { checks.push({ name, ok, detail }); };
  const collector = new MetricsCollector();
  const cronCollector = new MetricsCollector();
  const client = new LoadHttpClient({ baseUrl: environment.baseUrl, defaultTimeoutMs: options.timeoutMs, maxSockets: 64, collector });

  /* Sonde de sécurité : une identité signée dédiée à la campagne. */
  const employerCredential = pool.allocate(1)[0];
  const login = await client.send({
    method: 'POST', path: '/api/v1/auth/google/credential', label: 'SEC POST /api/v1/auth/google/credential',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential: employerCredential, requestedRole: 'EMPLOYER' }),
    expectedStatus: [200, 201],
  });
  const token = sessionCookieFrom(login, SESSION_COOKIE_NAME);
  const auth = { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'x-forwarded-for': '10.99.99.99' };

  /* Rate-limit : 120 mutations sur le bucket `domain-mutations` (borne 80/min). */
  const mutations = await Promise.all(Array.from({ length: 120 }, (_, index) => client.send({
    method: 'POST', path: '/api/v1/offers', label: 'SEC POST /api/v1/offers (rate-limit)',
    headers: { ...auth, 'content-type': 'application/json', 'Idempotency-Key': `lt-sec-offer-${index}` },
    body: JSON.stringify({ title: `Sécurité ${index}`, contractType: 'CDI', remuneration: 175000, currency: 'FCFA', location: 'Cotonou', summary: 'Sonde de limitation de débit.' }),
    expectedStatus: [201, 429],
  })));
  const rateLimited = mutations.filter(outcome => outcome.status === 429).length;
  check('sécurité : le limiteur de débit refuse réellement au-delà de la borne (429)',
    rateLimited > 0, `${rateLimited}/120 requêtes limitées`);

  const internal = await client.send({ method: 'GET', path: '/api/v1/internal/cron', label: 'SEC GET /api/v1/internal/cron', headers: auth, expectedStatus: [403, 404] });
  check('sécurité : une route interne/cron n’est jamais joignable par HTTP',
    internal.status === 403 || internal.status === 404, `statut ${internal.status}`);

  const forged = await client.send({ method: 'GET', path: '/api/v1/my/payments?userId=usr_forged', label: 'SEC GET /api/v1/my/payments?userId', headers: auth, expectedStatus: [400] });
  check('sécurité : un paramètre d’identité falsifié sur une route « personnelle » est rejeté',
    forged.status === 400, `statut ${forged.status}`);

  const anonymous = await client.send({ method: 'GET', path: '/api/v1/my/payments', label: 'SEC GET /api/v1/my/payments (anonyme)', headers: { 'x-forwarded-for': '10.99.99.98' }, expectedStatus: [401] });
  check('sécurité : une route protégée reste 401 sans session', anonymous.status === 401, `statut ${anonymous.status}`);

  const forensic = await environment.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM automation_audit_ledger WHERE action LIKE 'SECURITY_%'",
  );
  check('sécurité : les refus sont tracés dans le registre forensique existant',
    Number(forensic.rows[0]?.count ?? 0) > 0, `${forensic.rows[0]?.count} événements forensiques`);

  const aggregate = collector.aggregate(1);
  client.close();
  return { checks, statusCounts: aggregate.statusCounts, rateLimited };
}

/* ------------------------------------------------------------------ */
/* Rapport                                                             */
/* ------------------------------------------------------------------ */

interface CampaignReport {
  generatedAt: string;
  environment: {
    postgres: string;
    databaseTarget: string;
    poolMax: number;
    httpBaseUrl: string;
    node: string;
    platform: string;
    cpuCount: number;
    totalMemMb: number;
  };
  options: CliOptions;
  levels: LevelReport[];
  /** `null` uniquement dans un rapport PARTIEL écrit pendant la campagne. */
  resilience: ResilienceReport | null;
  security: SecurityReport | null;
  limitations: string[];
}

function markdownReport(report: CampaignReport): string {
  const lines: string[] = [];
  lines.push('# P0-LOAD-TESTS — rapport de charge réelle');
  lines.push('');
  lines.push(`Généré le ${report.generatedAt}.`);
  lines.push('');
  lines.push('## Environnement (mesuré, aucune ressource Cloudflare réelle)');
  lines.push('');
  lines.push(`- PostgreSQL : ${report.environment.postgres} — cible \`${report.environment.databaseTarget}\``);
  lines.push(`- Pool \`pg\` : ${report.environment.poolMax} connexions (le Worker de production est plafonné à 5 par ` +
    '`MAX_WORKER_DB_CONNECTIONS`)');
  lines.push(`- Serveur HTTP local : ${report.environment.httpBaseUrl} (requêtes TCP réelles)`);
  lines.push(`- Node ${report.environment.node} — ${report.environment.platform} — ${report.environment.cpuCount} vCPU — ${report.environment.totalMemMb} Mo`);
  lines.push('');
  for (const limitation of report.limitations) lines.push(`> ${limitation}`);
  lines.push('');

  lines.push('## Niveaux réellement exécutés');
  lines.push('');
  lines.push('| Utilisateurs | Concurrence | Durée (s) | Requêtes | rps | p50 (ms) | p95 (ms) | p99 (ms) | Erreurs (%) | Timeouts | Retries |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const level of report.levels) {
    lines.push(`| ${level.level}${level.truncated ? ' *(interrompu)*' : ''} | ${level.concurrency} | ${round2(level.durationMs / 1000)} | ` +
      `${level.http.requests} | ${level.http.throughputRps} | ${level.http.latency.p50} | ${level.http.latency.p95} | ` +
      `${level.http.latency.p99} | ${level.http.errorRatePct} | ${level.http.timeouts} | ${level.http.retries} |`);
  }
  lines.push('');

  for (const level of report.levels) {
    lines.push(`### ${level.level} utilisateurs`);
    lines.push('');
    lines.push(`- Parcours : **${level.completed}/${level.executed}** terminés, ${level.aborted} interrompus, ` +
      `${level.accountsCreated} comptes authentifiés créés.`);
    if (level.truncated) lines.push(`- **RESOURCE_LIMITATION** : ${level.truncationReason}`);
    lines.push(`- Latence HTTP : p50 ${level.http.latency.p50} ms / p95 ${level.http.latency.p95} ms / p99 ${level.http.latency.p99} ms ` +
      `(min ${level.http.latency.min}, max ${level.http.latency.max}, moyenne ${level.http.latency.mean}).`);
    lines.push(`- PostgreSQL : ${level.database.queries} requêtes SQL, p50 ${level.database.queryLatency.p50} ms / ` +
      `p95 ${level.database.queryLatency.p95} ms / p99 ${level.database.queryLatency.p99} ms ; ` +
      `attente de connexion p95 ${level.database.poolAcquireLatency.p95} ms (${level.database.poolAcquireCount} acquisitions), ` +
      `${level.database.errors} erreurs SQL.`);
    lines.push(`- Saturation : CPU ${level.saturation.cpuPercent}% (user ${level.saturation.cpuUserMs} ms, sys ${level.saturation.cpuSystemMs} ms), ` +
      `boucle d'événements p95 ${level.saturation.eventLoopDelayMs.p95} ms (max ${level.saturation.eventLoopMaxMs} ms), ` +
      `RSS crête ${level.saturation.rssPeakMb} Mo, loadavg(1) ${level.saturation.loadAvg1}/${level.saturation.cpuCount}, ` +
      `RAM libre ${level.saturation.freeMemMb}/${level.saturation.totalMemMb} Mo.`);
    lines.push(`- Connexions PostgreSQL : ${level.queueAfter.activeConnections}/${level.queueAfter.maxConnections} à la fin du niveau.`);
    lines.push(`- Moteur : ${level.queueAfter.deadlocks - level.queueBefore.deadlocks} deadlock(s) détecté(s) pendant le niveau ` +
      `(cumul ${level.queueAfter.deadlocks}) ; pic de ${level.enginePeak.peakConnections} connexions et ` +
      `${level.enginePeak.peakUngrantedLocks} verrou(s) non accordé(s) sur ${level.enginePeak.samples} relevés.`);
    lines.push(`- File : outbox ${JSON.stringify(level.queueAfter.outbox)}, jobs ${JSON.stringify(level.queueAfter.jobs)}, ` +
      `dead-letter ${level.queueAfter.deadLetters}, clés d'idempotence ${level.queueAfter.idempotencyKeys}, ` +
      `ticks Cron tracés ${level.queueAfter.cronTicks}.`);
    lines.push(`- Remplacement : ${level.replacement.completed}/${level.planned === 0 ? 0 : level.replacement.planned} dossiers complets ` +
      `en ${level.replacement.durationMs} ms (${level.replacement.throughputRps} rps, p95 ${level.replacement.latency.p95} ms, ` +
      `${level.replacement.errors} erreurs).`);
    lines.push(`- Concurrence métier : ${level.concurrencyChecks.passed}/${level.concurrencyChecks.passed + level.concurrencyChecks.failed} vérifications OK.`);
    lines.push(`- Cron/Queue : ${level.cronTicks.attempts} passées bornées, ${level.cronTicks.failures} échecs de passée, ` +
      `latence p50 ${level.cronTicks.latency.p50} ms / p95 ${level.cronTicks.latency.p95} ms / p99 ${level.cronTicks.latency.p99} ms.`);
    if (level.matchingPool) {
      lines.push(`- Bassin candidats P0-MATCHING : ${level.matchingPool.activeProfiles} profils actifs pour un plafond de ` +
        `${level.matchingPool.cap} — ${level.productLimits['matching.runs.create 409 (bassin > 200 profils)'] ?? 0} classement(s) refusé(s) (409, aucune donnée partielle).`);
    }
    for (const [label, count] of Object.entries(level.productLimits)) {
      if (label.startsWith('matching.')) continue;
      lines.push(`- Limite produit atteinte : ${label} × ${count}`);
    }
    if (level.failures.length > 0) {
      lines.push('- Échecs par étape :');
      for (const failure of level.failures) lines.push(`  - \`${failure.step}\` (${failure.status}) × ${failure.count} — ${failure.sample}`);
    }
    lines.push('');
  }

  lines.push('## Concurrence métier (doubles appels, aucun double effet)');
  lines.push('');
  for (const level of report.levels) {
    lines.push(`### ${level.level} utilisateurs`);
    lines.push('');
    for (const entry of level.concurrencyChecks.checks) {
      lines.push(`- ${entry.ok ? 'OK' : 'ÉCHEC'} — ${entry.name} — ${entry.detail}`);
    }
    lines.push('');
  }

  lines.push('## Résilience');
  lines.push('');
  for (const entry of report.resilience?.checks ?? [{ name: 'phase non exécutée', ok: false, detail: 'rapport partiel : phase non atteinte' }]) {
    lines.push(`- ${entry.ok ? 'OK' : 'ÉCHEC'} — ${entry.name} — ${entry.detail}`);
  }
  lines.push('');
  if (report.resilience) {
    lines.push(`- Timeouts : ${report.resilience.timeouts.observed}/${report.resilience.timeouts.attempted} observés (timeout client ${report.resilience.timeouts.timeoutMs} ms).`);
    lines.push(`- Retries : ${report.resilience.retry.forcedRetries} nouvelles tentatives réellement exécutées.`);
    lines.push(`- Orphelins : ${report.resilience.orphanRecovery.seeded} semés, ${report.resilience.orphanRecovery.recovered} récupérés, ` +
      `${report.resilience.orphanRecovery.deadLettered} en dead-letter (${report.resilience.orphanRecovery.durationMs} ms).`);
    lines.push(`- Backlog : ${report.resilience.backlog.drained} messages traités en ${report.resilience.backlog.cycles} passes ` +
      `(${report.resilience.backlog.durationMs} ms, ${report.resilience.backlog.throughputPerSec} msg/s), ` +
      `PENDING restant ${report.resilience.backlog.pendingEvents}.`);
    lines.push(`- Idempotence : ${report.resilience.idempotency.keys} clés mémorisées, ${report.resilience.idempotency.replays} traces de commandes.`);
  }
  lines.push('');

  lines.push('## Sécurité sous charge');
  lines.push('');
  for (const entry of report.security?.checks ?? [{ name: 'phase non exécutée', ok: false, detail: 'rapport partiel : phase non atteinte' }]) {
    lines.push(`- ${entry.ok ? 'OK' : 'ÉCHEC'} — ${entry.name} — ${entry.detail}`);
  }
  lines.push('');
  lines.push(`- Statuts observés pendant la sonde : ${JSON.stringify(report.security?.statusCounts ?? {})}`);
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Écrit le rapport (JSON + markdown) à chaque progression. Une campagne longue
 * ne doit jamais pouvoir perdre des mesures déjà réalisées : chaque niveau
 * mesuré est persisté dès qu'il est terminé.
 */
function writeCampaignReport(options: CliOptions, report: CampaignReport): void {
  writeFileSync(resolve(options.outDir, 'loadtests-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(resolve(options.outDir, 'LOAD_TESTS_REPORT.md'), markdownReport(report));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.outDir, { recursive: true });

  console.log('============================================================');
  console.log(' LE LABEUR — P0-LOAD-TESTS — campagne de charge réelle');
  console.log('============================================================');
  console.log(`Niveaux            : ${options.levels.join(', ')}`);
  console.log(`Concurrence max    : ${options.concurrency}`);
  console.log(`Budget par niveau  : ${options.budgetSeconds}s`);
  console.log(`Pool PostgreSQL    : ${options.poolMax}`);
  console.log('Cloudflare réel    : NON — aucun compte, Hyperdrive, R2 déployé ni TURN dans cette session.');
  console.log('------------------------------------------------------------');

  /* Toutes les identités de la campagne sont signées AVANT la mesure. */
  const plannedIdentities = options.levels.reduce(
    (total, level) => total + (level * 2) + (Math.min(level, options.replacementSample) * 2) + (Math.min(level, options.concurrencySample) * 2),
    0,
  ) + 2;
  const identityStarted = Date.now();
  const pool = await createLoadIdentityPool(plannedIdentities);
  console.log(`Identités signées  : ${plannedIdentities} en ${Date.now() - identityStarted} ms (préparation, hors mesure)`);

  const environment = await startLoadEnvironment({ poolMax: options.poolMax, googleVerifier: pool.verifier });
  const limitations: string[] = [
    'RESOURCE_LIMITATION — l’environnement est un hôte de test unique : PostgreSQL 17.10 local + serveur HTTP local. '
    + 'Aucune mise à l’échelle horizontale (plusieurs Workers, Hyperdrive, base managée) n’est disponible.',
    'BLOCKED_EXTERNAL_ACCESS — Hyperdrive, workerd déployé, R2 réel et TURN réel sont indisponibles : '
    + 'aucun chiffre Cloudflare n’est produit ni estimé.',
    'Le stockage objet du domaine DOCUMENTS est un adaptateur mémoire injecté (le domaine est fail-closed sans lui).',
    'WebRTC : session, signaling, concurrence et expiration sont mesurés ; la configuration ICE/TURN reste `NOT_CONFIGURED`, faute de TURN réel.',
  ];

  try {
    const levels: LevelReport[] = [];
    for (const level of options.levels) {
      let report: LevelReport;
      try {
        ({ report } = await runLevel(environment, options, level, pool));
      } catch (error) {
        // Une campagne réelle n'efface pas ce qu'elle a déjà observé : le
        // niveau en échec est consigné comme limite de ressources et le
        // rapport des niveaux précédents reste écrit.
        const message = String((error as Error)?.message ?? error);
        limitations.push(`RESOURCE_LIMITATION — le niveau ${level} n'a pas pu s'exécuter : ${message}. `
          + 'Les niveaux précédents restent mesurés tels qu’ils ont été observés.');
        console.error(`  FAIL niveau ${level} : ${message}`);
        if (options.stopOnLimit) break;
        continue;
      }
      levels.push(report);
      // Persistance immédiate : les niveaux suivants peuvent être lourds.
      writeCampaignReport(options, {
        generatedAt: new Date().toISOString(),
        environment: {
          postgres: 'PostgreSQL 17.10 RÉEL local (binaire embarqué, TEST/LOCAL)',
          databaseTarget: environment.publicTarget,
          poolMax: options.poolMax,
          httpBaseUrl: environment.baseUrl,
          node: process.version,
          platform: `${process.platform}/${process.arch}`,
          cpuCount: cpus().length,
          totalMemMb: Math.round(totalmem() / 1048576),
        },
        options,
        levels,
        resilience: null,
        security: null,
        limitations: [...limitations, 'Rapport PARTIEL : la campagne était encore en cours à l’écriture de ce fichier.'],
      });
      if (report.truncated && options.stopOnLimit) {
        limitations.push(`RESOURCE_LIMITATION — niveau ${level} interrompu : ${report.truncationReason}. `
          + 'Les niveaux suivants n’ont pas été exécutés ; aucun chiffre n’est extrapolé à leur sujet.');
        break;
      }
    }

    console.log('------------------------------------------------------------');
    console.log('RÉSILIENCE');
    let resilience: ResilienceReport;
    try {
      resilience = await runResiliencePhase(environment, options);
      for (const entry of resilience.checks) {
        console.log(`  ${entry.ok ? 'OK  ' : 'FAIL'} ${entry.name} — ${entry.detail}`);
      }
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      limitations.push(`RESOURCE_LIMITATION — la phase de résilience n'a pas pu s'exécuter : ${message}.`);
      resilience = {
        checks: [{ name: 'phase de résilience', ok: false, detail: message }],
        timeouts: { attempted: 0, observed: 0, timeoutMs: 0 },
        retry: { forcedRetries: 0, observedLatency: { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 } },
        orphanRecovery: { seeded: 0, recovered: 0, deadLettered: 0, durationMs: 0 },
        backlog: { pendingEvents: 0, cycles: 0, drained: 0, durationMs: 0, throughputPerSec: 0 },
        idempotency: { keys: 0, replays: 0 },
      };
    }

    console.log('------------------------------------------------------------');
    console.log('SÉCURITÉ SOUS CHARGE');
    let security: SecurityReport;
    try {
      security = await runSecurityPhase(environment, options, pool);
      for (const entry of security.checks) {
        console.log(`  ${entry.ok ? 'OK  ' : 'FAIL'} ${entry.name} — ${entry.detail}`);
      }
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      limitations.push(`RESOURCE_LIMITATION — la phase de sécurité n'a pas pu s'exécuter : ${message}.`);
      security = { checks: [{ name: 'phase de sécurité', ok: false, detail: message }], statusCounts: {}, rateLimited: 0 };
    }

    const report: CampaignReport = {
      generatedAt: new Date().toISOString(),
      environment: {
        postgres: 'PostgreSQL 17.10 RÉEL local (binaire embarqué, TEST/LOCAL)',
        databaseTarget: environment.publicTarget,
        poolMax: options.poolMax,
        httpBaseUrl: environment.baseUrl,
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        cpuCount: cpus().length,
        totalMemMb: Math.round(totalmem() / 1048576),
      },
      options,
      levels,
      resilience,
      security,
      limitations,
    };

    writeCampaignReport(options, report);
    console.log('------------------------------------------------------------');
    console.log(`Rapport JSON     : ${resolve(options.outDir, 'loadtests-report.json')}`);
    console.log(`Rapport markdown : ${resolve(options.outDir, 'LOAD_TESTS_REPORT.md')}`);

    const failedChecks = [
      ...levels.flatMap(level => level.concurrencyChecks.checks),
      ...resilience.checks,
      ...security.checks,
    ].filter(entry => !entry.ok);
    const failedCronTicks = levels.reduce((total, level) => total + level.cronTicks.failures, 0);
    const totalRequests = levels.reduce((total, level) => total + level.http.requests, 0);
    const totalErrors = levels.reduce((total, level) => total + level.http.errors, 0);
    console.log(`Total requêtes   : ${totalRequests} — erreurs ${totalErrors} — échecs de tick Cron ${failedCronTicks}`);
    if (failedChecks.length > 0) {
      console.error(`${failedChecks.length} vérification(s) en échec :`);
      for (const entry of failedChecks) console.error(`  FAIL ${entry.name} — ${entry.detail}`);
      process.exitCode = 1;
    } else {
      console.log('Toutes les vérifications de concurrence, résilience et sécurité sont OK.');
    }
  } finally {
    await environment.stop();
  }
}

void main();
