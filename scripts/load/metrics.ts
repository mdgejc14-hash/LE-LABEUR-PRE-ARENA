/**
 * LE LABEUR — P0-LOAD-TESTS-1 — métriques de charge (PARTIE 1 : 100 / 1 000).
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
