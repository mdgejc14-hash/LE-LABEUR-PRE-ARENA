/**
 * P0-LOAD-TESTS — exécuteur de la campagne de charge.
 *
 * Usage :
 *   npx tsx scripts/run-load-tests.ts                # campagne complète
 *   npx tsx scripts/run-load-tests.ts --smoke        # fumée rapide
 *   npx tsx scripts/run-load-tests.ts --scenario A   # un scénario
 *   npx tsx scripts/run-load-tests.ts --waves 30     # vagues de concurrence
 *
 * Environnement : LOCAL uniquement (PGlite WASM en mémoire, workerd non
 * sollicité ici — voir `npm run verify:workerd`), simulateur R2 en mémoire,
 * AUCUNE écriture en base de production, AUCUN paiement réel, AUCUN PSP.
 * Cloudflare réel : BLOCKED_EXTERNAL_ACCESS (non disponible dans ce checkpoint).
 *
 * Sorties :
 *   docs/p0-load-tests/results-<runId>.json  — résultats bruts machine
 *   stdout                                    — tableaux comparatifs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runConflictSuite } from './loadtest/conflicts';
import { runResilienceSuite } from './loadtest/resilience';
import { runScenario, type ScenarioSpec } from './loadtest/executor';
import { runJourney, type JourneyContext } from './loadtest/journeys';
import { createLoadHarness } from './loadtest/harness';
import { LoadMetrics, type ScenarioReport } from './loadtest/metrics';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(REPO_ROOT, 'docs', 'p0-load-tests');

interface Args {
  smoke: boolean;
  scenario: string | null;
  waves: number;
  quick: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { smoke: false, scenario: null, waves: 15, quick: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--smoke') args.smoke = true;
    else if (token === '--quick') args.quick = true;
    else if (token === '--scenario') args.scenario = argv[++index]?.toUpperCase() ?? null;
    else if (token === '--waves') args.waves = Number(argv[++index] ?? 15);
  }
  return args;
}

const SCENARIOS: Record<string, ScenarioSpec> = {
  A: {
    name: 'A',
    label: '100 utilisateurs concurrents (50 paires, parcours complet)',
    users: 100,
    profile: 'full',
    concurrency: 50,
    cronIntervalMs: 2_000,
    securityLaneIntervalMs: 1_000,
  },
  B: {
    name: 'B',
    label: '1 000 utilisateurs (500 paires, parcours complet, jauge 100 requêtes en vol)',
    users: 1_000,
    profile: 'full',
    concurrency: 100,
    cronIntervalMs: 2_000,
    securityLaneIntervalMs: 1_500,
  },
  C: {
    name: 'C',
    label: '2 000 utilisateurs (1 000 paires, parcours complet, jauge 150 requêtes en vol)',
    users: 2_000,
    profile: 'full',
    concurrency: 150,
    cronIntervalMs: 2_000,
    securityLaneIntervalMs: 1_500,
  },
  D: {
    name: 'D',
    label: '10 000 utilisateurs SIMULÉS (5 000 paires, profil core, jauge 200 requêtes en vol)',
    users: 10_000,
    profile: 'core',
    concurrency: 200,
    cronIntervalMs: 3_000,
    securityLaneIntervalMs: 2_000,
    // Garde-fou RESOURCE_LIMITATION : 40 minutes max pour le scénario D.
    maxDurationMs: 40 * 60_000,
  },
};

function fmtReport(report: ScenarioReport): string {
  const lines: string[] = [];
  lines.push(`\n=== SCÉNARIO ${report.scenario} — ${report.label} ===`);
  lines.push(`utilisateurs=${report.users} unités=${report.journeyUnits} profil=${report.journeyProfile} concurrence=${report.concurrency}`);
  lines.push(`durée=${(report.durationMs / 1000).toFixed(1)}s requêtes=${report.totals.requests} req/s=${report.requestsPerSec} unités/s=${report.throughputJourneyUnitsPerSec}`);
  lines.push(`latence globale: mean=${report.global.meanMs}ms p50=${report.global.p50Ms}ms p95=${report.global.p95Ms}ms p99=${report.global.p99Ms}ms max=${report.global.maxMs}ms`);
  lines.push(`erreurs=${report.totals.errors} (${report.totals.requests ? ((report.totals.errors / report.totals.requests) * 100).toFixed(2) : '0'}%) timeouts=${report.totals.timeouts} retries=${report.totals.retries} rejets attendus=${report.totals.expectedRejections}`);
  lines.push(`statuts=${JSON.stringify(report.totals.statusCounts)}`);
  lines.push(`db: requêtes=${report.db.queries} mean=${report.db.meanMs}ms p95=${report.db.p95Ms}ms p99=${report.db.p99Ms}ms rollbacks=${report.db.rollbacks} erreurs=${report.db.errors}`);
  lines.push(`queue: ticks=${report.queue.ticks} (échecs=${report.queue.tickFailures}) jobs traités=${report.queue.jobsProcessedDuring} dead=${report.queue.after?.outboxDead ?? 0}+jobs=${report.queue.after?.jobsFailed ?? 0} depth après=${report.queue.after?.outboxPending ?? 0}/${report.queue.after?.jobsReady ?? 0}`);
  lines.push(`ressources: pic RSS=${report.resources.peakRssMb}MB pic heap=${report.resources.peakHeapUsedMb}MB cpu(user=${report.resources.cpuUserMs}ms sys=${report.resources.cpuSystemMs}ms) load1max=${report.resources.loadAvg1mMax}`);
  lines.push(`sécurité sous charge: probes=${report.security.probes} viol=${report.security.violations}${report.security.details.length ? ` (${report.security.details.join(' | ')})` : ''}`);
  lines.push(`santé (seuils techniques): ${report.health.saturated ? `SATURATION → ${report.health.breached.join('; ')}` : 'aucun seuil dépassé'}`);
  lines.push(`échecs d'unités: ${report.notes.filter(note => note.startsWith('Échecs')).join('')}`);
  if (report.unitFailures.length > 0) {
    lines.push(`  premiers échecs: ${report.unitFailures.slice(0, 5).map(failure => `#${failure.unit}@${failure.step}`).join(', ')}`);
  }
  return lines.join('\n');
}

function opsTable(report: ScenarioReport): string {
  const rows: string[] = ['opération | n | err | mean | p50 | p95 | p99 | octets moy.'];
  for (const [op, stats] of Object.entries(report.ops)) {
    rows.push(`${op} | ${stats.count} | ${stats.errors} | ${stats.meanMs} | ${stats.p50Ms} | ${stats.p95Ms} | ${stats.p99Ms} | ${stats.meanBytes}`);
  }
  return rows.join('\n');
}

async function runSmoke(): Promise<number> {
  console.log('--- SMOKE : 3 unités de parcours complètes ---');
  const harness = await createLoadHarness();
  const metrics = new LoadMetrics();
  const admin = await harness.provisionAdmin('Admin Smoke');
  let failures = 0;
  try {
    for (let unit = 0; unit < 3; unit += 1) {
      const ctx: JourneyContext = { harness, metrics, unit, profile: 'full', adminToken: admin.token };
      const outcome = await runJourney(ctx);
      console.log(`unit ${unit}: ${outcome.ok ? 'OK' : `FAIL @ ${outcome.failedStep} — ${outcome.detail}`}`);
      if (!outcome.ok) failures += 1;
    }
    const totals = metrics.totals();
    console.log(`requêtes=${totals.requests} erreurs=${totals.errors} db=${harness.dbMetrics.queries}`);
  } finally {
    await harness.close();
  }
  return failures === 0 ? 0 : 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');

  if (args.smoke) {
    const code = await runSmoke();
    process.exit(code);
  }

  const results: Record<string, unknown> = {
    runId,
    startedAt: new Date().toISOString(),
    environment: {
      local: 'PGlite WASM en process (Node 22), harness composeWorker identique aux tests API',
      workerd: 'non sollicité dans cette campagne (voir npm run verify:workerd)',
      postgres: 'PGlite WASM local (les vérifications PostgreSQL réelles = npm run verify:postgres)',
      cloudflare: 'BLOCKED_EXTERNAL_ACCESS — aucun compte, aucune ressource Cloudflare réelle',
      r2: 'simulateur local createInMemoryObjectStorage (aucun bucket R2 réel)',
      psp: 'aucun — aucun paiement réel déclenché',
      cpu: `${(globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency ?? 'n/a'} cœurs logiques (os.loadavg relevé par scénario)`,
      node: process.version,
    },
    thresholds: {
      note: 'Seuils TECHNIQUES de lecture, pas des seuils métier',
      errorRate: '> 1%', p95: '> 500 ms', p99: '> 2 000 ms', timeouts: '> 1 requête > 10 s',
    },
  };

  /* Suites de concurrence et de résilience */
  console.log('--- SUITE CONCURRENCE MÉTIER ---');
  const conflicts = await runConflictSuite({ waves: args.waves });
  for (const conflict of conflicts.cases) {
    console.log(
      `${conflict.ok ? 'PASS' : 'FAIL'} ${conflict.name}: vagues=${conflict.waves} tentatives=${conflict.attempts} succès=${conflict.successes} rejets attendus=${conflict.expectedRejections} violations=${conflict.invariantViolations} vague moyenne=${conflict.meanWaveMs}ms`,
    );
    for (const detail of conflict.details) console.log(`   - ${detail}`);
  }
  results.conflicts = conflicts;

  console.log('\n--- SUITE RÉSILIENCE ---');
  const resilience = await runResilienceSuite({ backlogUnits: args.quick ? 3 : 6 });
  for (const item of resilience.checks) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.detail}`);
  }
  results.resilience = resilience;

  /* Scénarios de charge */
  const selected = args.scenario
    ? [SCENARIOS[args.scenario]].filter(Boolean)
    : args.quick
      ? [SCENARIOS.A]
      : [SCENARIOS.A, SCENARIOS.B, SCENARIOS.C, SCENARIOS.D];
  if (selected.length === 0) {
    console.error(`Scénario inconnu : ${args.scenario}`);
    process.exit(2);
  }

  const reports: ScenarioReport[] = [];
  for (const spec of selected) {
    console.log(`\n--- SCÉNARIO ${spec.name} : ${spec.label} ---`);
    const report = await runScenario({
      ...spec,
      onProgress: (done, total) => console.log(`  [${spec.name}] ${done}/${total} unités`),
    });
    console.log(fmtReport(report));
    reports.push(report);
  }
  results.scenarios = reports;

  /* Écriture des résultats bruts */
  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = resolve(OUT_DIR, `results-${runId}.json`);
  writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log(`\nRésultats bruts : ${outFile}`);

  /* Tableau comparatif */
  console.log('\n=== COMPARATIF 100 / 1 000 / 2 000 / 10 000 ===');
  console.log('scen | users | durée(s) | req | req/s | p50 | p95 | p99 | err | timeouts | RSS(MB) | santé');
  for (const report of reports) {
    console.log(
      `${report.scenario} | ${report.users} | ${(report.durationMs / 1000).toFixed(1)} | ${report.totals.requests} | ${report.requestsPerSec} | ${report.global.p50Ms} | ${report.global.p95Ms} | ${report.global.p99Ms} | ${report.totals.errors} | ${report.totals.timeouts} | ${report.resources.peakRssMb} | ${report.health.saturated ? report.health.breached.join(',') : 'OK'}`,
    );
  }

  if (args.scenario === 'D' || selected.length === 1) {
    console.log('\n=== DÉTAIL DES OPÉRATIONS (dernier scénario) ===');
    console.log(opsTable(reports[reports.length - 1]));
  }

  /* Code de sortie : les suites d'invariants doivent rester vertes. */
  const securityViolations = reports.reduce((acc, report) => acc + report.security.violations, 0);
  const unitFailures = reports.reduce(
    (acc, report) => acc + Number(/Échecs d'unités : (\d+)/.exec(report.notes.join(' '))?.[1] ?? 0),
    0,
  );
  const failed = !conflicts.ok || !resilience.ok || securityViolations > 0 || unitFailures > 0;
  console.log(`\nBILAN : conflits=${conflicts.ok ? 'OK' : 'ÉCHEC'} résilience=${resilience.ok ? 'OK' : 'ÉCHEC'} violences sécurité=${securityViolations} échecs d'unités=${unitFailures}`);
  process.exit(failed ? 1 : 0);
}

void main();
