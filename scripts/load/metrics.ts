/**
 * LE LABEUR — P0-LOAD-TESTS-1 — métriques de charge (PARTIE 1 : 100 / 1 000).
 * P0-LOAD-TESTS-2 — additions : latence SQL (sonde du harness), file
 * d'automatisation (queue/backlog/drain) et rapports des suites PARTIE 2.
 * Toutes partagent les MÊMES conventions : nearest-rank, arrondi 2 décimales,
 * aucun chiffre synthétisé.
 *
 * Collecte les échantillons RÉELS de chaque requête exécutée par le harness
 * (latence mesurée avec `performance.now()` autour de l'appel complet
 * `worker.fetch` + lecture du corps), puis calcule les agrégats :
 *
 *   - comptages : requêtes, succès, erreurs, timeouts, étapes sautées ;
 *   - latences : min / max / moyenne / p50 / p95 / p99 (méthode "rang le plus
 *     proche" — nearest-rank — sur les échantillons triés) ;
 *   - débit : requêtes/seconde et parcours/minute sur la durée murale réelle
 *     de la campagne.
 *
 * AUCUNE valeur n'est synthétisée ou extrapolée : chaque agrégat est calculé
 * sur les échantillons effectivement observés. Les échantillons bruts sont
 * conservés dans le rapport JSON afin que chaque chiffre soit re-vérifiable.
 */

export interface RequestSample {
  /** Identifiant du parcours (paire employeur/candidat) — ex. « pair-00042 ». */
  journeyId: string;
  /** Étape du parcours — ex. « offer.create », « contract.sign ». */
  step: string;
  /** Clé de route API (routeContracts) quand elle est connue. */
  routeKey: string | null;
  method: string;
  /** Gabarit de chemin (sans identifiants réels) — ex. « /api/v1/offers/:offerId ». */
  template: string;
  /** Statut HTTP réellement reçu ; null si exception avant toute réponse. */
  status: number | null;
  /** true si le statut reçu est l'un des statuts attendus pour l'étape. */
  ok: boolean;
  /** true si la latence dépasse le seuil de timeout de la campagne. */
  timeout: boolean;
  latencyMs: number;
  /** Code d'erreur applicatif / tag d'exception quand ok === false. */
  error: string | null;
}

export interface AggregateStats {
  count: number;
  ok: number;
  errors: number;
  timeouts: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface StepAggregate extends AggregateStats {
  step: string;
  routeKey: string | null;
  method: string;
  template: string;
}

export interface ErrorBreakdownEntry {
  /** Clé de regroupement : étape + statut + tag d'erreur. */
  key: string;
  count: number;
  /** Premier échantillon fautif observé (preuve, jamais inventé). */
  example: {
    journeyId: string;
    step: string;
    status: number | null;
    error: string | null;
  };
}

export interface CampaignTotals {
  usersSimulated: number;
  employers: number;
  candidates: number;
  matchingProfilesPublished: number;
  pairs: number;
  concurrency: number;
  journeysStarted: number;
  journeysCompleted: number;
  journeysFailed: number;
  stepsSkippedOnDependency: number;
  requests: number;
  ok: number;
  errors: number;
  timeouts: number;
  /** Durée murale réelle d'exécution de la charge (hors bootstrap de la base). */
  durationMs: number;
  bootstrapMs: number;
  throughputRequestsPerSecond: number;
  throughputJourneysPerMinute: number;
}

export interface CampaignReport {
  campaign: {
    mission: string;
    label: string;
    startedAtIso: string;
    nodeVersion: string;
    platform: string;
    /** Horloge métier fixe et SYNTHÉTIQUE (déterminisme ; jamais l'heure réelle). */
    businessClockIso: string;
    timeoutThresholdMs: number;
    /** Politique anti-fraude neutralisée pour mesurer la capacité brute : explicite. */
    rateLimitNeutralized: boolean;
    persistence: string;
    runtime: string;
    percentileMethod: string;
  };
  totals: CampaignTotals;
  latency: AggregateStats;
  steps: StepAggregate[];
  errorsBreakdown: ErrorBreakdownEntry[];
  /** Échantillons bruts de TOUTES les requêtes exécutées (auditabilité totale). */
  samples: RequestSample[];
  /**
   * P0-LOAD-TESTS-2 — latences SQL réelles du moteur embarqué (mesurées par la
   * sonde du harness pendant la fenêtre de charge). Optionnel : absent des
   * rapports de la PARTIE 1 (conventions inchangées).
   */
  dbLatency?: DbLatencyStats;
  /**
   * P0-LOAD-TESTS-2 — file d'automatisation après charge : profondeur réelle,
   * passes de drain mesurées (queue/backlog/retries/dead-letter). Optionnel.
   */
  queue?: QueueDrainReport;
}

/* ------------------------------------------------------------------ */
/* P0-LOAD-TESTS-2 — latence SQL du moteur embarqué                    */
/* ------------------------------------------------------------------ */

/** Agrégats de latence SQL (mêmes conventions que les latences HTTP). */
export interface DbLatencyStats {
  queryCount: number;
  /** Somme des latences individuelles (ms) — peut chevaucher si requêtes concurrentes. */
  totalMs: number;
  /** Union des intervalles d'exécution (ms) — fraction réellement occupée du moteur. */
  busyMs: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  transactions: { begun: number; committed: number; rolledBack: number };
}

/** Forme minimale attendue de la sonde du harness (découplée de harness.ts). */
export interface DbLatencyProbeLike {
  latencies: number[];
  intervals: Array<[number, number]>;
  transactions: { begun: number; committed: number; rolledBack: number };
}

/** Fusionne les intervalles [début, fin) chevauchants → temps occupé réel. */
function mergeIntervals(intervals: ReadonlyArray<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
  let busy = 0;
  let currentStart = sorted[0][0];
  let currentEnd = sorted[0][1];
  for (let index = 1; index < sorted.length; index += 1) {
    const [start, end] = sorted[index];
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
      continue;
    }
    busy += currentEnd - currentStart;
    currentStart = start;
    currentEnd = end;
  }
  busy += currentEnd - currentStart;
  return busy;
}

/**
 * Agrège la sonde SQL sur une fenêtre `performance.now()` (optionnelle) :
 * compte, percentiles nearest-rank, union des intervalles occupés.
 */
export function aggregateDbLatency(
  probe: DbLatencyProbeLike,
  window?: { fromMs: number; toMs?: number },
): DbLatencyStats {
  const to = window?.toMs ?? Number.POSITIVE_INFINITY;
  const indices = probe.intervals
    .map((interval, index) => ({ interval, index }))
    .filter(({ interval }) => interval[0] >= (window?.fromMs ?? 0) && interval[0] < to);
  const latencies = indices.map(({ index }) => probe.latencies[index]).sort((a, b) => a - b);
  if (latencies.length === 0) {
    return {
      queryCount: 0, totalMs: 0, busyMs: 0, minMs: 0, maxMs: 0, meanMs: 0,
      p50Ms: 0, p95Ms: 0, p99Ms: 0,
      transactions: { begun: 0, committed: 0, rolledBack: 0 },
    };
  }
  const total = latencies.reduce((sum, value) => sum + value, 0);
  return {
    queryCount: latencies.length,
    totalMs: round2(total),
    busyMs: round2(mergeIntervals(indices.map(({ interval }) => interval))),
    minMs: round2(latencies[0]),
    maxMs: round2(latencies[latencies.length - 1]),
    meanMs: round2(total / latencies.length),
    p50Ms: round2(nearestRankPercentile(latencies, 50)),
    p95Ms: round2(nearestRankPercentile(latencies, 95)),
    p99Ms: round2(nearestRankPercentile(latencies, 99)),
    transactions: {
      begun: probe.transactions.begun,
      committed: probe.transactions.committed,
      rolledBack: probe.transactions.rolledBack,
    },
  };
}

/* ------------------------------------------------------------------ */
/* P0-LOAD-TESTS-2 — file d'automatisation (queue / backlog)           */
/* ------------------------------------------------------------------ */

/** Profondeur réelle de la file, par statut (lecture SQL, jamais estimée). */
export interface QueueDepthSnapshot {
  outboxByStatus: Record<string, number>;
  jobsByStatus: Record<string, number>;
  totalOutbox: number;
  totalJobs: number;
}

/** UNE passe de drain mesurée (claim → handlers → ack), compteurs réels. */
export interface QueueDrainPass {
  pass: number;
  durationMs: number;
  eventsClaimed: number;
  eventsCompleted: number;
  eventsDuplicates: number;
  eventsRetried: number;
  eventsDeadLettered: number;
  jobsClaimed: number;
  jobsCompleted: number;
  jobsRetried: number;
  jobsFailed: number;
  paymentsSwept: number;
}

export interface QueueDrainReport {
  /** Stratégie réelle appliquée : passes bornées du worker P0-CRON-QUEUE existant. */
  strategy: string;
  limitPerPass: number;
  maxPasses: number;
  budgetMs: number;
  passCount: number;
  durationMs: number;
  /** true = une passe n'a plus rien réclamé (file vide des éléments échus). */
  converged: boolean;
  /** Raison honnête si convergence non atteinte (budget, backoff de retry…). */
  stoppedReason: 'empty-pass' | 'budget' | 'max-passes' | 'retry-backoff-pending';
  depthBefore: QueueDepthSnapshot;
  depthAfter: QueueDepthSnapshot;
  totals: {
    eventsClaimed: number;
    eventsCompleted: number;
    eventsDuplicates: number;
    eventsRetried: number;
    eventsDeadLettered: number;
    jobsClaimed: number;
    jobsCompleted: number;
    jobsRetried: number;
    jobsFailed: number;
    paymentsSwept: number;
  };
  passes: QueueDrainPass[];
}

/* ------------------------------------------------------------------ */
/* P0-LOAD-TESTS-2 — rapports des suites (concurrence / résilience)    */
/* ------------------------------------------------------------------ */

export interface SuiteCheckResult {
  name: string;
  success: boolean;
  detail: string;
  durationMs: number;
}

/**
 * Rapport d'une suite PARTIE 2 — mêmes conventions d'auditabilité que les
 * campagnes : horodatage, environnement, échelle, résultats nommés et
 * mesures structurées (jamais de chiffre inventé).
 */
export interface SuiteReport {
  suite: 'concurrency' | 'resilience';
  mission: string;
  label: string;
  startedAtIso: string;
  nodeVersion: string;
  platform: string;
  businessClockIso: string;
  /** Échelle réelle de la suite (utilisateurs synthétiques, paires, etc.). */
  scale: Record<string, number | string>;
  summary: { checks: number; passed: number; failed: number };
  results: SuiteCheckResult[];
  /** Mesures structurées propres à la suite (compteurs SQL réels, courses, etc.). */
  measurements: Record<string, unknown>;
  /** Échantillons HTTP mesurés pendant la suite (requêtes des parcours/étapes). */
  samples: RequestSample[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Percentile « rang le plus proche » : p-th du tableau trié, index ceil(p/100·n) − 1. */
export function nearestRankPercentile(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((percentile / 100) * sortedValues.length);
  const index = Math.min(sortedValues.length - 1, Math.max(0, rank - 1));
  return sortedValues[index];
}

export function aggregateStats(samples: readonly RequestSample[]): AggregateStats {
  if (samples.length === 0) {
    return { count: 0, ok: 0, errors: 0, timeouts: 0, minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }
  const latencies = samples.map(sample => sample.latencyMs).sort((a, b) => a - b);
  const total = latencies.reduce((sum, value) => sum + value, 0);
  return {
    count: samples.length,
    ok: samples.filter(sample => sample.ok).length,
    errors: samples.filter(sample => !sample.ok).length,
    timeouts: samples.filter(sample => sample.timeout).length,
    minMs: round2(latencies[0]),
    maxMs: round2(latencies[latencies.length - 1]),
    meanMs: round2(total / latencies.length),
    p50Ms: round2(nearestRankPercentile(latencies, 50)),
    p95Ms: round2(nearestRankPercentile(latencies, 95)),
    p99Ms: round2(nearestRankPercentile(latencies, 99)),
  };
}

/** Agrège les échantillons par étape de parcours, dans l'ordre de première occurrence. */
export function aggregateByStep(samples: readonly RequestSample[]): StepAggregate[] {
  const order: string[] = [];
  const grouped = new Map<string, RequestSample[]>();
  for (const sample of samples) {
    let bucket = grouped.get(sample.step);
    if (!bucket) {
      bucket = [];
      grouped.set(sample.step, bucket);
      order.push(sample.step);
    }
    bucket.push(sample);
  }
  return order.map(step => {
    const bucket = grouped.get(step)!;
    const first = bucket[0];
    return {
      step,
      routeKey: first.routeKey,
      method: first.method,
      template: first.template,
      ...aggregateStats(bucket),
    };
  });
}

/** Regroupe les erreurs par (étape, statut, tag) avec le premier exemple observé. */
export function buildErrorsBreakdown(samples: readonly RequestSample[]): ErrorBreakdownEntry[] {
  const grouped = new Map<string, ErrorBreakdownEntry>();
  for (const sample of samples) {
    if (sample.ok) continue;
    const key = `${sample.step} | status=${sample.status ?? 'EXCEPTION'} | ${sample.error ?? 'unexpected-status'}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, {
      key,
      count: 1,
      example: { journeyId: sample.journeyId, step: sample.step, status: sample.status, error: sample.error },
    });
  }
  return [...grouped.values()].sort((left, right) => right.count - left.count);
}

/** Formate un tableau texte des agrégats par étape (lisible en console / rapport). */
export function formatStepTable(steps: readonly StepAggregate[]): string {
  const header = ['step'.padEnd(28), 'n'.padStart(6), 'ok'.padStart(6), 'err'.padStart(5), 'p50'.padStart(9), 'p95'.padStart(9), 'p99'.padStart(9), 'max'.padStart(10)];
  const lines = [header.join(' '), header.map(column => '-'.repeat(column.length)).join(' ')];
  for (const step of steps) {
    lines.push([
      step.step.padEnd(28).slice(0, 28),
      String(step.count).padStart(6),
      String(step.ok).padStart(6),
      String(step.errors).padStart(5),
      `${step.p50Ms.toFixed(1)}ms`.padStart(9),
      `${step.p95Ms.toFixed(1)}ms`.padStart(9),
      `${step.p99Ms.toFixed(1)}ms`.padStart(9),
      `${step.maxMs.toFixed(1)}ms`.padStart(10),
    ].join(' '));
  }
  return lines.join('\n');
}
