/**
 * LE LABEUR — P0-LOAD-TESTS — primitives de mesure.
 *
 * Module SANS I/O : il ne fait qu'accumuler des échantillons et produire des
 * statistiques réelles (p50 / p95 / p99, taux d'erreur, timeouts, retries).
 * Aucun chiffre n'est estimé, extrapolé ni arrondi au-delà de la milliseconde :
 * tout ce qui sort d'ici provient d'échantillons réellement observés.
 *
 * Volontairement réutilisable par `npm test` (tests unitaires) : c'est le seul
 * fichier de la tranche qui doit rester pur.
 */

/** Échantillon élémentaire : une opération réellement exécutée. */
export interface Sample {
  /** Millisecondes écoulées, mesurées à l'horloge monotone. */
  durationMs: number;
  /** Succès fonctionnel (2xx/3xx attendu et obtenu). */
  ok: boolean;
  /** true si l'opération a été interrompue par un timeout client. */
  timeout?: boolean;
  /** Nombre de nouvelles tentatives réellement effectuées. */
  retries?: number;
  /** Code HTTP observé (0 si la réponse n'est jamais arrivée). */
  status?: number;
}

export interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

export interface OperationReport {
  /** Étiquette d'opération (ex. `POST /api/v1/offers`). */
  label: string;
  count: number;
  errors: number;
  errorRatePct: number;
  timeouts: number;
  retries: number;
  statusCounts: Record<string, number>;
  latency: LatencyStats;
}

export interface AggregateReport {
  requests: number;
  errors: number;
  errorRatePct: number;
  timeouts: number;
  retries: number;
  /** Requêtes par seconde RÉELLEMENT observées (requests / durée mur). */
  throughputRps: number;
  latency: LatencyStats;
  statusCounts: Record<string, number>;
  byOperation: OperationReport[];
}

const EMPTY_LATENCY: LatencyStats = {
  count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0,
};

/**
 * Quantile « nearest-rank » : aucune interpolation, aucune extrapolation.
 * La valeur renvoyée est une latence RÉELLEMENT observée.
 */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const clamped = Math.min(1, Math.max(0, q));
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(clamped * sorted.length) - 1));
  return sorted[index];
}

export function latencyStats(values: readonly number[]): LatencyStats {
  if (values.length === 0) return { ...EMPTY_LATENCY };
  const sorted = [...values].sort((a, b) => a - b);
  let total = 0;
  for (const value of sorted) total += value;
  return {
    count: sorted.length,
    p50: round2(quantile(sorted, 0.5)),
    p95: round2(quantile(sorted, 0.95)),
    p99: round2(quantile(sorted, 0.99)),
    min: round2(sorted[0]),
    max: round2(sorted[sorted.length - 1]),
    mean: round2(total / sorted.length),
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Collecteur par étiquette. Les durées sont conservées intégralement : à
 * 300 000 requêtes cela reste de l'ordre de quelques mégaoctets, et toute
 * approximation (réservoir, histogramme) introduirait une erreur sur les
 * quantiles — précisément ce que cette tranche doit mesurer sans inventer.
 */
export class MetricsCollector {
  private readonly buckets = new Map<string, { durations: number[]; errors: number; timeouts: number; retries: number; statuses: Map<string, number> }>();

  record(label: string, sample: Sample): void {
    let bucket = this.buckets.get(label);
    if (!bucket) {
      bucket = { durations: [], errors: 0, timeouts: 0, retries: 0, statuses: new Map<string, number>() };
      this.buckets.set(label, bucket);
    }
    bucket.durations.push(sample.durationMs);
    if (!sample.ok) bucket.errors += 1;
    if (sample.timeout) bucket.timeouts += 1;
    bucket.retries += sample.retries ?? 0;
    const statusKey = String(sample.status ?? 0);
    bucket.statuses.set(statusKey, (bucket.statuses.get(statusKey) ?? 0) + 1);
  }

  /** Fusionne un autre collecteur (agrégation multi-workers de charge). */
  merge(other: MetricsCollector): void {
    for (const [label, bucket] of other.buckets) {
      const target = this.buckets.get(label);
      if (!target) {
        this.buckets.set(label, {
          durations: [...bucket.durations],
          errors: bucket.errors,
          timeouts: bucket.timeouts,
          retries: bucket.retries,
          statuses: new Map(bucket.statuses),
        });
        continue;
      }
      for (const duration of bucket.durations) target.durations.push(duration);
      target.errors += bucket.errors;
      target.timeouts += bucket.timeouts;
      target.retries += bucket.retries;
      for (const [status, count] of bucket.statuses) {
        target.statuses.set(status, (target.statuses.get(status) ?? 0) + count);
      }
    }
  }

  operationReports(): OperationReport[] {
    const reports: OperationReport[] = [];
    for (const [label, bucket] of this.buckets) {
      reports.push({
        label,
        count: bucket.durations.length,
        errors: bucket.errors,
        errorRatePct: bucket.durations.length === 0 ? 0 : round2((bucket.errors / bucket.durations.length) * 100),
        timeouts: bucket.timeouts,
        retries: bucket.retries,
        statusCounts: Object.fromEntries([...bucket.statuses].sort((a, b) => a[0].localeCompare(b[0]))),
        latency: latencyStats(bucket.durations),
      });
    }
    reports.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return reports;
  }

  /** Rapport global, agrégé sur toutes les étiquettes. */
  aggregate(durationMs: number): AggregateReport {
    const durations: number[] = [];
    let errors = 0;
    let timeouts = 0;
    let retries = 0;
    const statuses = new Map<string, number>();
    for (const bucket of this.buckets.values()) {
      for (const duration of bucket.durations) durations.push(duration);
      errors += bucket.errors;
      timeouts += bucket.timeouts;
      retries += bucket.retries;
      for (const [status, count] of bucket.statuses) statuses.set(status, (statuses.get(status) ?? 0) + count);
    }
    const count = durations.length;
    return {
      requests: count,
      errors,
      errorRatePct: count === 0 ? 0 : round2((errors / count) * 100),
      timeouts,
      retries,
      throughputRps: durationMs <= 0 ? 0 : round2((count / durationMs) * 1000),
      latency: latencyStats(durations),
      statusCounts: Object.fromEntries([...statuses].sort((a, b) => a[0].localeCompare(b[0]))),
      byOperation: this.operationReports(),
    };
  }

  totalRequests(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) total += bucket.durations.length;
    return total;
  }

  totalErrors(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) total += bucket.errors;
    return total;
  }

  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Scheduler à concurrence bornée : exactement `concurrency` tâches en vol, sans
 * création de tâche inutile et sans file d'attente non mesurée.
 */
export async function runPool<T>(
  concurrency: number,
  tasks: readonly (() => Promise<T>)[],
  onSettled?: (result: T, index: number) => void,
): Promise<void> {
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const lane = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      const result = await tasks[index]();
      onSettled?.(result, index);
    }
  };
  const width = Math.max(1, Math.min(concurrency, tasks.length || 1));
  for (let laneIndex = 0; laneIndex < width; laneIndex += 1) workers.push(lane());
  await Promise.all(workers);
}

export function nowMs(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

export function formatMs(value: number): string {
  return `${round2(value)} ms`;
}
