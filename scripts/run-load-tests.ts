/**
 * LE LABEUR — P0-LOAD-TESTS-1 / P0-LOAD-TESTS-2 — point d'entrée des campagnes de charge.
 *
 * Usage :
 *   npm run test:load -- --users 100
 *   npm run test:load -- --users 1000
 *   npm run test:load -- --users 2000            (PARTIE 2 — P0-LOAD-TESTS-2)
 *   options : --concurrency N   (défaut : tous les parcours en parallèle)
 *             --timeout-ms N    (défaut : 30000 — seuil déclaratif de timeout)
 *             --label NOM       (étiquette de la campagne)
 *             --out-dir DIR     (défaut : load-reports)
 *             --no-write        (n'écrit aucun rapport JSON)
 *             --suite NOM       (défaut : campaign)
 *                                 campaign    → campagne d'utilisateurs (ci-dessous)
 *                                 concurrency → suite concurrence métier sous charge
 *                                 resilience  → suite résilience (P0-CRON-QUEUE réutilisé)
 *                                 part2       → campagne 2000 + concurrence + résilience
 *             --drain-budget-ms N (défaut : 420000 — budget du drain de file post-charge)
 *
 * Périmètre PARTIE 1 : campagnes 100 et 1 000 utilisateurs (P0-LOAD-TESTS-1).
 * Périmètre PARTIE 2 : campagne 2 000 utilisateurs UNIQUEMENT (P0-LOAD-TESTS-2),
 * avec latence SQL mesurée (sonde du harness) et drain réel de la file
 * d'automatisation après charge (queue/backlog/retries/dead-letter mesurés).
 * Les campagnes > 2 000 (notamment 10 000) restent REFUSÉES : hors tranche.
 *
 * Le rapport JSON (échantillons bruts + agrégats) est écrit dans load-reports/
 * — chaque chiffre publié est recalculable depuis les échantillons.
 *
 * Codes de sortie : 0 = campagne sans erreur ; 1 = campagne exécutée avec des
 * erreurs mesurées (le rapport les détaille) ; 2 = échec d'infrastructure.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createLoadHarness } from './load/harness';
import {
  aggregateByStep,
  aggregateDbLatency,
  aggregateStats,
  buildErrorsBreakdown,
  formatStepTable,
  type CampaignReport,
} from './load/metrics';
import { runCampaign } from './load/runner';
import { drainAutomationQueue } from './load/queue';
import { runConcurrencySuite } from './load/concurrency';
import { runResilienceSuite } from './load/resilience';
import { startResourceSampler } from './load/resources';
import { runPostCampaignIntegrity } from './load/integrity';

/** Borne de la PARTIE 2 : la campagne 2 000 est la plus grande autorisée en PARTIE 2. */
const MAX_USERS_PART_2 = 2000;
/** Borne de la PARTIE 3 (P0-LOAD-TESTS-3) : la campagne 10 000 est la plus grande autorisée. */
const MAX_USERS_PART_3 = 10_000;

/** Mission déduite de l'échelle (10 000 = P0-LOAD-TESTS-3). */
function missionFor(users: number): string {
  if (users > MAX_USERS_PART_2) return 'P0-LOAD-TESTS-3';
  if (users > 1000) return 'P0-LOAD-TESTS-2';
  return 'P0-LOAD-TESTS-1';
}

interface CliOptions {
  suite: 'campaign' | 'concurrency' | 'resilience' | 'part2' | 'part3';
  users: number | null;
  concurrency: number | null;
  timeoutMs: number;
  label: string | null;
  outDir: string;
  writeReport: boolean;
  allowOversized: boolean;
  drainBudgetMs: number;
  persistence: 'pglite' | 'postgres-server';
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    suite: 'campaign',
    users: null,
    concurrency: null,
    timeoutMs: 30_000,
    label: null,
    outDir: 'load-reports',
    writeReport: true,
    allowOversized: false,
    drainBudgetMs: 420_000,
    persistence: 'pglite',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      index += 1;
      if (index >= argv.length) throw new Error(`valeur manquante pour ${arg}`);
      return argv[index];
    };
    switch (arg) {
      case '--suite':
        options.suite = next() as CliOptions['suite'];
        break;
      case '--users':
        options.users = Number(next());
        break;
      case '--concurrency':
        options.concurrency = Number(next());
        break;
      case '--timeout-ms':
        options.timeoutMs = Number(next());
        break;
      case '--label':
        options.label = next();
        break;
      case '--out-dir':
        options.outDir = next();
        break;
      case '--no-write':
        options.writeReport = false;
        break;
      case '--allow-oversized':
        options.allowOversized = true;
        break;
      case '--drain-budget-ms':
        options.drainBudgetMs = Number(next());
        break;
      case '--persistence':
        options.persistence = next() as CliOptions['persistence'];
        break;
      default:
        throw new Error(`argument inconnu : ${arg}`);
    }
  }
  if (!['campaign', 'concurrency', 'resilience', 'part2', 'part3'].includes(options.suite)) {
    throw new Error(`--suite inconnu : ${options.suite} (attendu : campaign | concurrency | resilience | part2 | part3)`);
  }
  if (options.persistence !== 'pglite' && options.persistence !== 'postgres-server') {
    throw new Error(`--persistence inconnu : ${options.persistence} (attendu : pglite | postgres-server)`);
  }
  // `part2` / `part3` exécutent par défaut la campagne de leur tranche.
  if (options.users === null && (options.suite === 'part2' || options.suite === 'part3' || options.suite === 'campaign')) {
    options.users = options.suite === 'part2' ? 2000 : options.suite === 'part3' ? 10_000 : 100;
  }
  if (options.users === null) {
    // Les suites concurrence/résilience fixent leur propre échelle par défaut.
    return options;
  }
  if (!Number.isInteger(options.users) || options.users < 2 || options.users % 2 !== 0) {
    throw new Error('--users doit être un entier pair ≥ 2 (moitié EMPLOYER, moitié CANDIDATE)');
  }
  if (options.users > MAX_USERS_PART_3 && !options.allowOversized) {
    throw new Error(
      `P0-LOAD-TESTS-3 est borné à la campagne 10 000 -- reçu ${options.users}. `
      + `(--allow-oversized reste réservé à une exécution locale documentée).`,
    );
  }
  if (options.users > MAX_USERS_PART_2 && options.users !== MAX_USERS_PART_3 && !options.allowOversized) {
    throw new Error(
      `La PARTIE 3 autorise exactement la campagne 10 000 au-delà de 2 000 -- reçu ${options.users}.`,
    );
  }
  if (options.users > 1000 && options.users <= MAX_USERS_PART_2 && options.suite === 'campaign' && options.users !== 2000) {
    throw new Error(
      `La PARTIE 2 autorise exactement la campagne 2 000 dans la tranche 1001..2000 -- reçu ${options.users}.`,
    );
  }
  // À 10 000 utilisateurs, le drain de file est dimensionné en conséquence (sinon défaut 420 s).
  if (options.users >= MAX_USERS_PART_3 && !argv.includes('--drain-budget-ms')) {
    options.drainBudgetMs = 2_400_000;
  }
  if (options.concurrency !== null && (!Number.isInteger(options.concurrency) || options.concurrency < 1)) {
    throw new Error('--concurrency doit être un entier ≥ 1');
  }
  if (!Number.isInteger(options.drainBudgetMs) || options.drainBudgetMs < 1_000) {
    throw new Error('--drain-budget-ms doit être un entier ≥ 1000');
  }
  return options;
}

function writeSuiteReport(report: unknown, outDir: string, file: string): string {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, file);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

function printSuiteSummary(suite: string, report: { summary: { checks: number; passed: number; failed: number }; results: Array<{ name: string; success: boolean; detail: string }> }): number {
  console.log('');
  console.log('==============================================================');
  console.log(`RÉSULTATS — ${suite}`);
  console.log('==============================================================');
  console.log(`Contrôles : ${report.summary.passed}/${report.summary.checks} PASS, ${report.summary.failed} FAIL`);
  for (const result of report.results) {
    console.log(`  [${result.success ? 'PASS' : 'FAIL'}] ${result.name}${result.success ? '' : ` — ${result.detail}`}`);
  }
  return report.summary.failed > 0 ? 1 : 0;
}

async function runCampaignCli(cli: CliOptions, users: number): Promise<number> {
  const withDbMetrics = users > 1000;
  const mission = missionFor(users);
  const label = cli.label ?? `${mission} ${users} utilisateurs`;
  const startedAtIso = new Date().toISOString();
  const persistenceLabel = cli.persistence === 'postgres-server'
    ? 'PostgreSQL 17.10 SERVEUR réel (embedded-postgres, binaires natifs) + migrations réelles'
    : 'PostgreSQL embarqué (PGlite WASM) + migrations réelles';

  console.log(`[load] ${label}`);
  console.log(`[load] bootstrap : ${persistenceLabel} + composition complète du worker…`);
  const harness = await createLoadHarness({ userCount: users, persistence: cli.persistence });
  console.log(`[load] bootstrap terminé en ${harness.bootstrapMs} ms (persistance: ${harness.persistence}, horloge métier fixe ${harness.businessClockIso})`);

  const pairs = harness.pairs.length;
  // 10 000 utilisateurs simulés ≠ 10 000 requêtes simultanées : à cette échelle,
  // la concurrence par défaut est un pool contrôlé de 250 voies (documenté).
  const concurrency = cli.concurrency ?? (users >= MAX_USERS_PART_3 ? 250 : pairs);
  const matchingProfiles = harness.pairs.filter(pair => pair.publishMatchingProfile).length;
  console.log(`[load] ${users} utilisateurs → ${pairs} parcours (1 employeur + 1 candidat), ${matchingProfiles} profils de matching publiés (garde-fou 200)`);
  console.log(`[load] concurrence demandée : ${concurrency} voies parallèles`);

  try {
    /** Repère performance.now() de début de charge (fenêtre de la sonde SQL). */
    const loadStartedAtMs = performance.now();
    let lastLogged = -1;
    // P0-LOAD-TESTS-3 : échantillonnage réel des ressources (CPU/RSS/loadavg).
    const sampler = startResourceSampler(1000);
    const run = await runCampaign(harness, {
      concurrency,
      timeoutMs: cli.timeoutMs,
      onProgress: (completed, total) => {
        const step = Math.max(1, Math.floor(total / 20));
        if (completed === total || (completed % step === 0 && completed !== lastLogged)) {
          lastLogged = completed;
          console.log(`[load] progression : ${completed}/${total} parcours`);
        }
      },
    });
    const loadEndedAtMs = performance.now();

    // Latence SQL réelle du moteur de persistance pendant la charge (PARTIE 2+).
    const dbLatency = withDbMetrics
      ? aggregateDbLatency(harness.dbProbe, { fromMs: loadStartedAtMs, toMs: loadEndedAtMs })
      : null;

    // File d'automatisation réelle après charge — profondeur
    // puis drain mesuré (worker P0-CRON-QUEUE existant, passes bornées).
    // À 10 000 utilisateurs, la file est 5× plus profonde (cascade d'événements) :
    // les bornes de passes sont dimensionnées en conséquence.
    let queue: Awaited<ReturnType<typeof drainAutomationQueue>> | undefined;
    if (withDbMetrics) {
      const isPart3 = users >= MAX_USERS_PART_3;
      console.log('[load] drain de la file d’automatisation (worker P0-CRON-QUEUE existant, passes bornées)…');
      queue = await drainAutomationQueue(harness, {
        limitPerPass: isPart3 ? 500 : 200,
        maxPasses: isPart3 ? 1500 : 200,
        budgetMs: cli.drainBudgetMs,
        trigger: `load-tests-${mission.toLowerCase()}-drain`,
      });
      console.log(`[load] file : ${queue.passCount} passes, ${queue.durationMs.toFixed(0)} ms, convergence=${queue.converged} (raison: ${queue.stoppedReason})`);
      console.log(`[load] file : ${queue.totals.eventsClaimed} événements traités, ${queue.totals.eventsRetried} retries, ${queue.totals.eventsDeadLettered} dead-letters, ${queue.totals.jobsClaimed} jobs, ${queue.totals.jobsFailed} jobs FAILED`);
    }
    const resources = sampler.stop();

    // P0-LOAD-TESTS-3 : contrôles d'intégrité à l'échelle (après la phase de drain,
    // convergée ou non — un drain non convergé produirait un FAIL honnête de I7).
    let integrity: Awaited<ReturnType<typeof runPostCampaignIntegrity>> | undefined;
    if (users >= MAX_USERS_PART_3) {
      console.log('[load] contrôles d’intégrité post-campagne à l’échelle 10 000…');
      integrity = await runPostCampaignIntegrity(harness, {
        users,
        pairs,
        label: `${label} — intégrité`,
        businessClockIso: harness.businessClockIso,
        drain: queue
          ? { converged: queue.converged, stoppedReason: queue.stoppedReason, passCount: queue.passCount }
          : undefined,
      });
      console.log(`[load] intégrité : ${integrity.summary.passed}/${integrity.summary.checks} contrôles PASS`);
    }

    const steps = aggregateByStep(run.samples);
    const latency = aggregateStats(run.samples);
    const errorsBreakdown = buildErrorsBreakdown(run.samples);
    const journeysFailed = run.outcomes.filter(outcome => !outcome.completed).length;
    const skipped = run.outcomes.reduce((sum, outcome) => sum + outcome.skippedSteps, 0);
    const durationSeconds = run.durationMs / 1000;

    const totals = {
      usersSimulated: users,
      employers: harness.employers.length,
      candidates: harness.candidates.length,
      matchingProfilesPublished: matchingProfiles,
      pairs,
      concurrency: run.effectiveConcurrency,
      journeysStarted: run.outcomes.length,
      journeysCompleted: run.outcomes.length - journeysFailed,
      journeysFailed,
      stepsSkippedOnDependency: skipped,
      requests: latency.count,
      ok: latency.ok,
      errors: latency.errors,
      timeouts: latency.timeouts,
      durationMs: run.durationMs,
      bootstrapMs: harness.bootstrapMs,
      throughputRequestsPerSecond: durationSeconds > 0 ? Math.round((latency.count / durationSeconds) * 100) / 100 : 0,
      throughputJourneysPerMinute: durationSeconds > 0 ? Math.round(((run.outcomes.length - journeysFailed) / durationSeconds) * 60 * 100) / 100 : 0,
    };

    const report: CampaignReport = {
      campaign: {
        mission,
        label,
        startedAtIso,
        nodeVersion: process.version,
        platform: `${process.platform}/${process.arch}`,
        businessClockIso: harness.businessClockIso,
        timeoutThresholdMs: cli.timeoutMs,
        rateLimitNeutralized: true,
        persistence: persistenceLabel,
        runtime: 'worker composé réel, appels in-process (sans pile réseau)',
        percentileMethod: 'nearest-rank sur les échantillons triés',
        ...(users >= MAX_USERS_PART_3
          ? {
            populationStrategy: `${users} utilisateurs synthétiques (${totals.employers} EMPLOYER + ${totals.candidates} CANDIDATE) `
              + `= ${pairs} parcours complets ; concurrence réelle = pool contrôlé de ${run.effectiveConcurrency} voies `
              + `(10 000 utilisateurs simulés ≠ 10 000 requêtes simultanées ; pas de batching des parcours)`,
          }
          : {}),
      },
      totals,
      latency,
      steps,
      errorsBreakdown,
      samples: run.samples,
      ...(dbLatency && dbLatency.queryCount > 0 ? { dbLatency } : {}),
      ...(queue ? { queue } : {}),
      ...(resources ? { resources } : {}),
      ...(integrity ? { integrity } : {}),
    };

    console.log('');
    console.log('==============================================================');
    console.log(`RÉSULTATS — ${label}`);
    console.log('==============================================================');
    console.log(`Utilisateurs simulés : ${totals.usersSimulated} (${totals.employers} EMPLOYER + ${totals.candidates} CANDIDATE)`);
    console.log(`Parcours : ${totals.journeysStarted} (${totals.journeysCompleted} complets, ${totals.journeysFailed} en échec, ${totals.stepsSkippedOnDependency} étapes sautées sur dépendance)`);
    console.log(`Concurrence effective : ${totals.concurrency} voies parallèles`);
    console.log(`Durée de charge : ${(totals.durationMs / 1000).toFixed(2)} s (bootstrap base : ${(totals.bootstrapMs / 1000).toFixed(2)} s)`);
    console.log(`Requêtes : ${totals.requests} (${totals.ok} OK, ${totals.errors} erreurs, ${totals.timeouts} timeouts > ${cli.timeoutMs} ms)`);
    console.log(`Débit : ${totals.throughputRequestsPerSecond} req/s — ${totals.throughputJourneysPerMinute} parcours/min`);
    console.log(`Latences toutes requêtes : p50=${latency.p50Ms.toFixed(1)} ms, p95=${latency.p95Ms.toFixed(1)} ms, p99=${latency.p99Ms.toFixed(1)} ms, max=${latency.maxMs.toFixed(1)} ms, moyenne=${latency.meanMs.toFixed(1)} ms`);
    if (dbLatency && dbLatency.queryCount > 0) {
      const utilization = totals.durationMs > 0 ? Math.round((dbLatency.busyMs / totals.durationMs) * 1000) / 10 : 0;
      console.log(`Latence SQL (${cli.persistence === 'postgres-server' ? 'serveur PostgreSQL réel' : 'moteur embarqué PGlite'}) : ${dbLatency.queryCount} requêtes, p50=${dbLatency.p50Ms.toFixed(2)} ms, p95=${dbLatency.p95Ms.toFixed(2)} ms, p99=${dbLatency.p99Ms.toFixed(2)} ms, max=${dbLatency.maxMs.toFixed(2)} ms, occupé=${dbLatency.busyMs.toFixed(0)} ms (${utilization}% de la fenêtre de charge), transactions: ${dbLatency.transactions.begun} begun / ${dbLatency.transactions.committed} committed / ${dbLatency.transactions.rolledBack} rolledBack`);
    }
    if (queue) {
      console.log(`File post-charge : profondeur avant = ${queue.depthBefore.totalOutbox} événements / ${queue.depthBefore.totalJobs} jobs ; drain = ${queue.passCount} passes en ${queue.durationMs.toFixed(0)} ms (convergence=${queue.converged}) ; retries=${queue.totals.eventsRetried}, dead-letters=${queue.totals.eventsDeadLettered}, jobs FAILED=${queue.totals.jobsFailed}`);
    }
    if (resources) {
      const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(0);
      console.log(`Ressources : RSS min/max/moy = ${mb(resources.rss.minBytes)}/${mb(resources.rss.maxBytes)}/${mb(resources.rss.meanBytes)} Mo, heap max = ${mb(resources.heapUsed.maxBytes)} Mo, CPU moyen/max = ${resources.cpuPercentMean}%/${resources.cpuPercentMax}% du temps mural, loadavg1 max = ${resources.loadavg1Max.toFixed(2)} (${resources.static.cpuCount} cœurs, ${mb(resources.static.totalMemBytes)} Mo RAM)`);
    }
    if (integrity) {
      console.log(`Intégrité post-campagne : ${integrity.summary.passed}/${integrity.summary.checks} contrôles PASS`);
      for (const result of integrity.results) {
        console.log(`  [${result.success ? 'PASS' : 'FAIL'}] ${result.name}${result.success ? '' : ` — ${result.detail}`}`);
      }
    }
    console.log('');
    console.log(formatStepTable(steps));
    if (errorsBreakdown.length > 0) {
      console.log('');
      console.log('ERREURS MESURÉES (regroupées) :');
      for (const entry of errorsBreakdown.slice(0, 20)) {
        console.log(`  ${entry.count}× ${entry.key} — exemple ${entry.example.journeyId}`);
      }
    }

    if (cli.writeReport) {
      const persistenceSuffix = cli.persistence === 'postgres-server' ? '_postgres-server' : '';
      const file = writeSuiteReport(report, cli.outDir, `${mission}_users-${users}${persistenceSuffix}.json`);
      console.log('');
      console.log(`[load] rapport écrit : ${file}`);
    }

    return totals.errors > 0 || (integrity && integrity.summary.failed > 0) ? 1 : 0;
  } finally {
    await harness.close();
  }
}

async function main(): Promise<number> {
  const cli = parseArgs(process.argv.slice(2));
  const users = cli.users ?? 0;

  // Ordre de la PARTIE 2 : CAMPAGNE 2000 → CONCURRENCE → RÉSILIENCE.
  // PARTIE 3 (P0-LOAD-TESTS-3) : CAMPAGNE 10 000 uniquement — les suites
  // concurrence/résilience de la PARTIE 2 ne sont PAS rejouées (réutilisées telles quelles).
  if (cli.suite === 'campaign' || cli.suite === 'part2' || cli.suite === 'part3') {
    const campaignExit = await runCampaignCli(cli, users);
    if (cli.suite === 'campaign' || cli.suite === 'part3') return campaignExit;
    if (campaignExit !== 0) return campaignExit;
  }

  if (cli.suite === 'concurrency' || cli.suite === 'part2') {
    console.log('[load] suite CONCURRENCE MÉTIER sous charge (P0-LOAD-TESTS-2)…');
    const concurrencyReport = await runConcurrencySuite({
      ...(cli.suite === 'concurrency' && users >= 2 ? { users } : {}),
    });
    if (cli.writeReport) {
      const file = writeSuiteReport(concurrencyReport, cli.outDir, 'P0-LOAD-TESTS-2_concurrency.json');
      console.log(`[load] rapport écrit : ${file}`);
    }
    const concurrencyExit = printSuiteSummary('P0-LOAD-TESTS-2 concurrence métier', concurrencyReport);
    if (cli.suite === 'concurrency') return concurrencyExit;
    if (concurrencyExit !== 0) return concurrencyExit;
  }

  if (cli.suite === 'resilience' || cli.suite === 'part2') {
    console.log('[load] suite RÉSILIENCE (P0-LOAD-TESTS-2, moteur P0-CRON-QUEUE réutilisé)…');
    const resilienceReport = await runResilienceSuite({
      ...(cli.suite === 'resilience' && users >= 2 ? { users } : {}),
    });
    if (cli.writeReport) {
      const file = writeSuiteReport(resilienceReport, cli.outDir, 'P0-LOAD-TESTS-2_resilience.json');
      console.log(`[load] rapport écrit : ${file}`);
    }
    const resilienceExit = printSuiteSummary('P0-LOAD-TESTS-2 résilience', resilienceReport);
    if (cli.suite === 'resilience') return resilienceExit;
    if (resilienceExit !== 0) return resilienceExit;
  }

  return 0;
}

main().then(
  code => {
    process.exitCode = code;
  },
  error => {
    console.error(`[load] ÉCHEC INFRASTRUCTURE : ${String((error as Error)?.message ?? error)}`);
    process.exitCode = 2;
  },
);
