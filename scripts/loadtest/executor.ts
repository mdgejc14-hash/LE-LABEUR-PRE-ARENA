/**
 * P0-LOAD-TESTS — exécuteur de scénarios de charge.
 *
 * Méthode (documentée dans le rapport) :
 *   - 1 « unité de parcours » = 2 utilisateurs (EMPLOYER + CANDIDATE) qui
 *     exécutent le cycle réel via HTTP ;
 *   - tous les utilisateurs du scénario sont authentifiés pendant la fenêtre
 *     de mesure (le login est la première étape de chaque unité) ;
 *   - la jauge `concurrency` borne les requêtes en vol (pool de workers —
 *     « 10 000 utilisateurs simulés » ne signifie pas 10 000 connexions
 *     simultanées) ;
 *   - une lane Cron exécute `runScheduledCycle` réel en arrière-plan ;
 *   - une lane Sécurité envoie des probes RBAC/ownership/idempotence/
 *     rate-limit pendant la charge et compte TOUT contournement ;
 *   - snapshots file (outbox/jobs), latence DB, CPU/RAM relevés en continu.
 */

import type { LoadHarness } from './harness';
import { createLoadHarness, ltRequest } from './harness';
import {
  DEFAULT_READING_THRESHOLDS,
  evaluateScenarioHealth,
  LoadMetrics,
  ResourceSampler,
  type QueueSnapshot,
  type ScenarioReport,
} from './metrics';
import { runJourney, type JourneyProfile } from './journeys';

export interface ScenarioSpec {
  name: string;
  label: string;
  users: number;
  profile: JourneyProfile;
  /** Requêtes en vol max (pool de workers). */
  concurrency: number;
  cronIntervalMs?: number;
  securityLaneIntervalMs?: number;
  queueSampleIntervalMs?: number;
  /** Garde-fou : coupe le scénario après N ms (RESOURCE_LIMITATION). */
  maxDurationMs?: number;
  onProgress?: (done: number, total: number) => void;
}

async function queueSnapshot(harness: LoadHarness): Promise<QueueSnapshot> {
  const [outbox, jobs, jobsTotal, jobsRetried] = await Promise.all([
    harness.database.query<{ status: string; count: string }>(
      'SELECT status, count(*)::text AS count FROM automation_outbox GROUP BY status',
    ),
    harness.database.query<{ status: string; count: string }>(
      'SELECT status, count(*)::text AS count FROM automation_jobs GROUP BY status',
    ),
    harness.database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM automation_jobs WHERE status = 'COMPLETED'",
    ),
    harness.database.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM automation_jobs WHERE attempts > 1',
    ),
  ]);
  const byStatus = (rows: Array<{ status: string; count: string }>, status: string): number =>
    Number(rows.find(row => row.status === status)?.count ?? 0);
  const outboxRows = outbox.rows;
  const jobRows = jobs.rows;
  return {
    outboxPending: byStatus(outboxRows, 'PENDING') + byStatus(outboxRows, 'RETRYABLE'),
    outboxProcessing: byStatus(outboxRows, 'PROCESSING'),
    outboxDead: byStatus(outboxRows, 'DEAD_LETTER'),
    jobsReady: byStatus(jobRows, 'PENDING') + byStatus(jobRows, 'RETRYABLE'),
    jobsRunning: byStatus(jobRows, 'RUNNING'),
    jobsDead: 0,
    jobsFailed: byStatus(jobRows, 'FAILED'),
    jobsProcessedTotal: Number(jobsTotal.rows[0]?.count ?? 0),
    jobsAttemptsGt1: Number(jobsRetried.rows[0]?.count ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Lane sécurité : probes attendus sous charge                        */
/* ------------------------------------------------------------------ */

interface SecurityProbe {
  name: string;
  /** Quelle session porter (le cookie est appliqué par la lane). */
  auth: 'none' | 'candidate' | 'employer' | 'forged';
  build: () => Request;
  expect: (status: number) => boolean;
}

const SECURITY_PROBES: SecurityProbe[] = [
  {
    name: 'rbac.admin-route-as-candidate',
    auth: 'candidate',
    build: () => ltRequest('/api/v1/admin/users?limit=5'),
    expect: status => status === 403,
  },
  {
    name: 'rbac.admin-route-unauthenticated',
    auth: 'none',
    build: () => ltRequest('/api/v1/admin/stats'),
    expect: status => status === 401,
  },
  {
    name: 'rbac.internal-path-blocked',
    auth: 'none',
    build: () => ltRequest('/api/v1/internal/queue'),
    expect: status => status === 404,
  },
  {
    name: 'rbac.cron-path-blocked',
    auth: 'none',
    build: () => ltRequest('/cron/drain'),
    expect: status => status === 404,
  },
  {
    name: 'forged-self-param-rejected',
    auth: 'candidate',
    build: () => ltRequest('/api/v1/my/contracts?userId=usr_forged'),
    expect: status => status === 400,
  },
  {
    name: 'mutation-without-idempotency-key',
    auth: 'employer',
    build: () => ltRequest('/api/v1/offers', {
      method: 'POST',
      body: { title: 'x' },
    }),
    expect: status => status === 400,
  },
  {
    name: 'candidate-cannot-create-offer',
    auth: 'candidate',
    build: () => ltRequest('/api/v1/offers', {
      method: 'POST',
      idempotencyKey: 'security-probe-role-offer',
      body: { title: 'x' },
    }),
    expect: status => status === 403,
  },
  {
    name: 'session-forged-cookie-rejected',
    auth: 'forged',
    build: () => ltRequest('/api/v1/my/notifications'),
    expect: status => status === 401,
  },
];

/* ------------------------------------------------------------------ */
/* Scénario                                                            */
/* ------------------------------------------------------------------ */

export async function runScenario(spec: ScenarioSpec): Promise<ScenarioReport> {
  const harness: LoadHarness = await createLoadHarness();
  const metrics = new LoadMetrics();
  const resources = new ResourceSampler();
  const admin = await harness.provisionAdmin(`Admin ${spec.name}`);
  const units = Math.max(1, Math.floor(spec.users / 2));
  const startedAtIso = new Date().toISOString();
  const startedAt = Date.now();

  const queueBefore = await queueSnapshot(harness);
  let queueAfter: QueueSnapshot | null = null;

  const unitFailures: ScenarioReport['unitFailures'] = [];
  let unitFailuresTotal = 0;

  /* Lane Cron */
  let cronTicks = 0;
  let cronFailures = 0;
  let cronBusy = false;
  const cronIntervalMs = spec.cronIntervalMs ?? 2_000;
  const cronTimer = setInterval(() => {
    if (cronBusy) return;
    cronBusy = true;
    const begin = performance.now();
    harness.composition.automationWorker
      ?.runScheduledCycle({ limit: 20, trigger: 'p0-load-tests' })
      .then(() => {
        metrics.record('cron.tick', {
          durationMs: performance.now() - begin,
          status: 200,
          ok: true,
          bytes: 0,
        });
        cronTicks += 1;
      })
      .catch((error: unknown) => {
        metrics.record('cron.tick', {
          durationMs: performance.now() - begin,
          status: 500,
          ok: false,
          bytes: 0,
        });
        cronFailures += 1;
        void error;
      })
      .finally(() => {
        cronBusy = false;
      });
  }, cronIntervalMs);
  cronTimer.unref?.();

  /* Lane sécurité */
  let securityProbes = 0;
  let securityViolations = 0;
  const securityDetails: string[] = [];
  let securityCursor = 0;
  const probeTokens: Record<'candidate' | 'employer', string | null> = {
    candidate: null,
    employer: null,
  };
  const probeToken = async (kind: 'candidate' | 'employer'): Promise<string> => {
    if (probeTokens[kind]) return probeTokens[kind] as string;
    const actor = await harness.actorFor(kind === 'candidate' ? 'CANDIDATE' : 'EMPLOYER', kind === 'candidate' ? 3 : 2);
    const session = await harness.login(actor);
    probeTokens[kind] = session.token;
    return session.token;
  };
  const securityIntervalMs = spec.securityLaneIntervalMs ?? 1_500;
  const securityTimer = setInterval(() => {
    void (async () => {
      try {
        const probe = SECURITY_PROBES[securityCursor % SECURITY_PROBES.length];
        securityCursor += 1;
        const request = probe.build();
        if (probe.auth === 'forged') {
          request.headers.set('cookie', '__Host-lelabeur_session=forged-session-token-value');
        } else if (probe.auth !== 'none') {
          request.headers.set('cookie', `__Host-lelabeur_session=${await probeToken(probe.auth)}`);
        }
        const begin = performance.now();
        const response = await harness.worker.fetch(request);
        const text = await response.text();
        const ok = probe.expect(response.status);
        metrics.record(`security.${probe.name}`, {
          durationMs: performance.now() - begin,
          status: response.status,
          ok,
          bytes: Buffer.byteLength(text, 'utf8'),
        }, { expectedRejection: ok });
        securityProbes += 1;
        if (!ok) {
          securityViolations += 1;
          if (securityDetails.length < 20) {
            securityDetails.push(`${probe.name} → ${response.status} (${text.slice(0, 120)})`);
          }
        }
      } catch (error) {
        securityViolations += 1;
        securityProbes += 1;
        if (securityDetails.length < 20) {
          securityDetails.push(`probe-error: ${String((error as Error)?.message ?? error)}`);
        }
      }
    })();
  }, securityIntervalMs);
  securityTimer.unref?.();

  /* Snapshot file */
  const queueTimer = setInterval(() => {
    void queueSnapshot(harness).catch(() => undefined);
  }, spec.queueSampleIntervalMs ?? 2_000);
  queueTimer.unref?.();

  resources.start(500);

  /* Pool de workers : `concurrency` requêtes en vol max */
  const poolSize = Math.max(1, Math.min(spec.concurrency, units));
  let nextUnit = 0;
  let done = 0;
  const maxDurationMs = spec.maxDurationMs ?? 0;
  let stoppedByGuard = false;

  const workerLoop = async (): Promise<void> => {
    for (;;) {
      if (stoppedByGuard) return;
      const unit = nextUnit;
      nextUnit += 1;
      if (unit >= units) return;
      const outcome = await runJourney({
        harness,
        metrics,
        unit,
        profile: spec.profile,
        adminToken: admin.token,
      });
      done += 1;
      if (!outcome.ok) {
        unitFailuresTotal += 1;
        if (unitFailures.length < 50) {
          unitFailures.push({ unit, step: outcome.failedStep, detail: outcome.detail.slice(0, 300) });
        }
      }
      if (spec.onProgress && done % 25 === 0) spec.onProgress(done, units);
      if (maxDurationMs > 0 && Date.now() - startedAt > maxDurationMs) {
        stoppedByGuard = true;
      }
    }
  };

  await Promise.all(Array.from({ length: poolSize }, () => workerLoop()));

  /* Drain final borné + snapshots */
  try {
    await harness.composition.automationWorker?.drainEvents(500);
    await harness.composition.automationWorker?.runDueJobs(200);
    await harness.composition.automationWorker?.runScheduledCycle({ limit: 50, trigger: 'p0-load-tests-final' });
  } catch {
    // Les échecs de drain final sont comptés dans cronFailures s'ils surviennent.
    cronFailures += 1;
  }
  queueAfter = await queueSnapshot(harness);

  clearInterval(cronTimer);
  clearInterval(securityTimer);
  clearInterval(queueTimer);
  resources.stop();

  const durationMs = Date.now() - startedAt;
  const totals = metrics.totals();
  const global = metrics.global();

  /* DB latency */
  const dbDurations = [...harness.dbMetrics.durations].sort((a, b) => a - b);
  const dbMean = dbDurations.length
    ? dbDurations.reduce((acc, value) => acc + value, 0) / dbDurations.length
    : 0;
  const dbQuantile = (p: number): number => {
    if (dbDurations.length === 0) return 0;
    const index = Math.min(dbDurations.length - 1, Math.floor((p / 100) * dbDurations.length));
    return Math.round(dbDurations[index] * 100) / 100;
  };

  const jobsProcessedDuring = queueAfter
    ? Math.max(0, queueAfter.jobsProcessedTotal - queueBefore.jobsProcessedTotal)
    : 0;

  const health = evaluateScenarioHealth(totals, global, DEFAULT_READING_THRESHOLDS);
  const notes: string[] = [];
  if (stoppedByGuard) {
    notes.push(`RESOURCE_LIMITATION : scénario interrompu après ${maxDurationMs}ms (${done}/${units} unités terminées).`);
  }
  if (spec.profile === 'core') {
    notes.push('Profil core : les familles litige/paiements/documents/WebRTC/remplacement sont couvertes par les scénarios full et les suites dédiées.');
  }

  const report: ScenarioReport = {
    scenario: spec.name,
    label: spec.label,
    users: spec.users,
    journeyUnits: units,
    journeyProfile: spec.profile,
    concurrency: spec.concurrency,
    startedAtIso,
    durationMs,
    requestsPerSec: durationMs > 0 ? Math.round((totals.requests / durationMs) * 1000) : 0,
    throughputJourneyUnitsPerSec: durationMs > 0 ? Math.round((done / durationMs) * 1000 * 100) / 100 : 0,
    totals,
    global,
    ops: metrics.stats(),
    queue: {
      before: queueBefore,
      after: queueAfter,
      ticks: cronTicks,
      tickFailures: cronFailures,
      jobsProcessedDuring,
    },
    db: {
      queries: harness.dbMetrics.queries,
      meanMs: Math.round(dbMean * 100) / 100,
      p95Ms: dbQuantile(95),
      p99Ms: dbQuantile(99),
      rollbacks: harness.dbMetrics.rollbacks,
      errors: harness.dbMetrics.errors,
    },
    resources: { ...resources.summary(), timeline: resources.timeline(30) },
    security: { probes: securityProbes, violations: securityViolations, details: securityDetails },
    unitFailures,
    health,
    notes: [
      ...notes,
      `Unités terminées : ${done}/${units}.`,
      `Échecs d'unités : ${unitFailuresTotal}.`,
    ],
  };
  if (unitFailuresTotal > unitFailures.length) {
    report.notes.push(`(détail des échecs limité à ${unitFailures.length} entrées sur ${unitFailuresTotal})`);
  }

  await harness.close();
  return report;
}
