/**
 * LE LABEUR — P0-LOAD-TESTS-1 — point d'entrée des campagnes de charge.
 *
 * Usage :
 *   npm run test:load -- --users 100
 *   npm run test:load -- --users 1000
 *   options : --concurrency N   (défaut : tous les parcours en parallèle)
 *             --timeout-ms N    (défaut : 30000 — seuil déclaratif de timeout)
 *             --label NOM       (étiquette de la campagne)
 *             --out-dir DIR     (défaut : load-reports)
 *             --no-write        (n'écrit aucun rapport JSON)
 *
 * Périmètre PARTIE 1 : campagnes 100 et 1 000 utilisateurs UNIQUEMENT.
 * Les campagnes 2 000 / 10 000 sont explicitement hors tranche (--users refuse
 * toute valeur > 1000 sauf --allow-oversized pour usage local documenté).
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
  aggregateStats,
  buildErrorsBreakdown,
  formatStepTable,
  type CampaignReport,
} from './load/metrics';
import { runCampaign } from './load/runner';

interface CliOptions {
  users: number;
  concurrency: number | null;
  timeoutMs: number;
  label: string | null;
  outDir: string;
  writeReport: boolean;
  allowOversized: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    users: 0,
    concurrency: null,
    timeoutMs: 30_000,
    label: null,
    outDir: 'load-reports',
    writeReport: true,
    allowOversized: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      index += 1;
      if (index >= argv.length) throw new Error(`valeur manquante pour ${arg}`);
      return argv[index];
    };
    switch (arg) {
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
      default:
        throw new Error(`argument inconnu : ${arg}`);
    }
  }
  if (!Number.isInteger(options.users) || options.users < 2 || options.users % 2 !== 0) {
    throw new Error('--users doit être un entier pair ≥ 2 (moitié EMPLOYER, moitié CANDIDATE)');
  }
  if (options.users > 1000 && !options.allowOversized) {
    throw new Error(
      `P0-LOAD-TESTS-1 est borné aux campagnes 100 / 1 000 -- reçu ${options.users}. `
      + 'Les campagnes 2 000 / 10 000 sont hors tranche (utiliser --allow-oversized pour une exécution locale documentée).',
    );
  }
  if (options.concurrency !== null && (!Number.isInteger(options.concurrency) || options.concurrency < 1)) {
    throw new Error('--concurrency doit être un entier ≥ 1');
  }
  return options;
}

async function main(): Promise<number> {
  const cli = parseArgs(process.argv.slice(2));
  const label = cli.label ?? `P0-LOAD-TESTS-1 ${cli.users} utilisateurs`;
  const startedAtIso = new Date().toISOString();

  console.log(`[load] ${label}`);
  console.log(`[load] bootstrap : PGlite + migrations réelles + composition complète du worker…`);
  const harness = await createLoadHarness({ userCount: cli.users });
  console.log(`[load] bootstrap terminé en ${harness.bootstrapMs} ms (horloge métier fixe ${harness.businessClockIso})`);

  const pairs = harness.pairs.length;
  const concurrency = cli.concurrency ?? pairs;
  const matchingProfiles = harness.pairs.filter(pair => pair.publishMatchingProfile).length;
  console.log(`[load] ${cli.users} utilisateurs → ${pairs} parcours (1 employeur + 1 candidat), ${matchingProfiles} profils de matching publiés (garde-fou 200)`);
  console.log(`[load] concurrence demandée : ${concurrency} voies parallèles`);

  try {
    let lastLogged = -1;
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

    const steps = aggregateByStep(run.samples);
    const latency = aggregateStats(run.samples);
    const errorsBreakdown = buildErrorsBreakdown(run.samples);
    const journeysFailed = run.outcomes.filter(outcome => !outcome.completed).length;
    const skipped = run.outcomes.reduce((sum, outcome) => sum + outcome.skippedSteps, 0);
    const durationSeconds = run.durationMs / 1000;

    const totals = {
      usersSimulated: cli.users,
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
        mission: 'P0-LOAD-TESTS-1',
        label,
        startedAtIso,
        nodeVersion: process.version,
        platform: `${process.platform}/${process.arch}`,
        businessClockIso: harness.businessClockIso,
        timeoutThresholdMs: cli.timeoutMs,
        rateLimitNeutralized: true,
        persistence: 'PostgreSQL embarqué (PGlite WASM) + migrations réelles',
        runtime: 'worker composé réel, appels in-process (sans pile réseau)',
        percentileMethod: 'nearest-rank sur les échantillons triés',
      },
      totals,
      latency,
      steps,
      errorsBreakdown,
      samples: run.samples,
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
      const outDir = resolve(cli.outDir);
      mkdirSync(outDir, { recursive: true });
      const file = resolve(outDir, `P0-LOAD-TESTS-1_users-${cli.users}.json`);
      writeFileSync(file, JSON.stringify(report, null, 2));
      console.log('');
      console.log(`[load] rapport écrit : ${file}`);
    }

    return totals.errors > 0 ? 1 : 0;
  } finally {
    await harness.close();
  }
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
