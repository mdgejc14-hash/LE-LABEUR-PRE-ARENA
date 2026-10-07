/**
 * P0-LOAD-TESTS — métriques de charge.
 *
 * Collecte minimale mais complète, réutilisée par tous les scénarios :
 *   - latence par opération (moyenne, p50, p95, p99, min, max) ;
 *   - débit (throughput, requests/sec) ;
 *   - taux d'erreur, timeouts (seuil technique de lecture), retries ;
 *   - DB latency (sonde SQL interne au driver), transactions ROLLBACK ;
 *   - queue depth, jobs processed, dead-letter (relevés par le runner) ;
 *   - CPU / mémoire du processus ;
 *   - taille moyenne des charge utiles quand elle est mesurée.
 *
 * Les seuils appliqués plus bas sont des SEUILS TECHNIQUES DE LECTURE,
 * jamais des seuils métier : ils servent à comparer les scénarios entre eux
 * et à localiser le premier point de saturation observé.
 */

import os from 'node:os';

/** Seuil technique de lecture : une latence au-delà est comptée comme timeout. */
export const DEFAULT_TIMEOUT_THRESHOLD_MS = 10_000;

export interface OpStats {
  count: number;
  errors: number;
  timeouts: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  totalBytes: number;
  meanBytes: number;
}

export interface OpAggregate {
  count: number;
  errors: number;
  timeouts: number;
  bytes: number;
  durations: number[];
}

export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const rank = (p / 100) * (sortedAscending.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sortedAscending[low];
  const weight = rank - low;
  return sortedAscending[low] * (1 - weight) + sortedAscending[high] * weight;
}

function statsOf(aggregate: OpAggregate): OpStats {
  const sorted = [...aggregate.durations].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count,
    errors: aggregate.errors,
    timeouts: aggregate.timeouts,
    meanMs: count ? round2(sum / count) : 0,
    minMs: count ? round2(sorted[0]) : 0,
    maxMs: count ? round2(sorted[count - 1]) : 0,
    p50Ms: round2(percentile(sorted, 50)),
    p95Ms: round2(percentile(sorted, 95)),
    p99Ms: round2(percentile(sorted, 99)),
    totalBytes: aggregate.bytes,
    meanBytes: aggregate.bytes && count ? Math.round(aggregate.bytes / count) : 0,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Fenêtre glissante simple pour l'horodatage des durées. */
export interface RecordedSample {
  durationMs: number;
  status: number;
  ok: boolean;
  bytes: number;
}

export class LoadMetrics {
  private readonly ops = new Map<string, OpAggregate>();
  private readonly statusCounts = new Map<number, number>();
  private readonly timeoutThresholdMs: number;
  private retries = 0;
  private expectedRejections = 0;

  constructor(timeoutThresholdMs: number = DEFAULT_TIMEOUT_THRESHOLD_MS) {
    this.timeoutThresholdMs = timeoutThresholdMs;
  }

  record(
    op: string,
    sample: RecordedSample,
    options: { expectedRejection?: boolean } = {},
  ): void {
    let aggregate = this.ops.get(op);
    if (!aggregate) {
      aggregate = { count: 0, errors: 0, timeouts: 0, bytes: 0, durations: [] };
      this.ops.set(op, aggregate);
    }
    aggregate.count += 1;
    aggregate.bytes += sample.bytes;
    aggregate.durations.push(sample.durationMs);
    if (sample.durationMs >= this.timeoutThresholdMs) aggregate.timeouts += 1;
    const isExpected = options.expectedRejection === true;
    if (isExpected) {
      this.expectedRejections += 1;
    } else if (!sample.ok) {
      aggregate.errors += 1;
    }
    this.statusCounts.set(sample.status, (this.statusCounts.get(sample.status) ?? 0) + 1);
  }

  recordRetry(): void {
    this.retries += 1;
  }

  stats(): Record<string, OpStats> {
    const result: Record<string, OpStats> = {};
    for (const [op, aggregate] of [...this.ops.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      result[op] = statsOf(aggregate);
    }
    return result;
  }

  totals(): {
    requests: number;
    errors: number;
    timeouts: number;
    retries: number;
    expectedRejections: number;
    statusCounts: Record<string, number>;
  } {
    let requests = 0;
    let errors = 0;
    let timeouts = 0;
    let bytes = 0;
    for (const aggregate of this.ops.values()) {
      requests += aggregate.count;
      errors += aggregate.errors;
      timeouts += aggregate.timeouts;
      bytes += aggregate.bytes;
    }
    const statusCounts: Record<string, number> = {};
    for (const [status, count] of [...this.statusCounts.entries()].sort(([a], [b]) => a - b)) {
      statusCounts[String(status)] = count;
    }
    void bytes;
    return {
      requests,
      errors,
      timeouts,
      retries: this.retries,
      expectedRejections: this.expectedRejections,
      statusCounts,
    };
  }

  /** Agrégat synthétique « toutes opérations ». */
  global(): OpStats {
    const merged: OpAggregate = { count: 0, errors: 0, timeouts: 0, bytes: 0, durations: [] };
    for (const aggregate of this.ops.values()) {
      merged.count += aggregate.count;
      merged.errors += aggregate.errors;
      merged.timeouts += aggregate.timeouts;
      merged.bytes += aggregate.bytes;
      merged.durations.push(...aggregate.durations);
    }
    return statsOf(merged);
  }
}

export interface ResourceSample {
  atMs: number;
  rssMb: number;
  heapUsedMb: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  loadAvg1m: number;
}

export class ResourceSampler {
  private readonly samples: ResourceSample[] = [];
  private readonly startedAt = Date.now();
  private readonly cpuStart = process.cpuUsage();
  private timer: ReturnType<typeof setInterval> | null = null;

  start(intervalMs = 500): void {
    if (this.timer) return;
    this.sample();
    this.timer = setInterval(() => this.sample(), intervalMs);
    this.timer.unref?.();
  }

  sample(): void {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    this.samples.push({
      atMs: Date.now() - this.startedAt,
      rssMb: round2(memory.rss / (1024 * 1024)),
      heapUsedMb: round2(memory.heapUsed / (1024 * 1024)),
      cpuUserMs: Math.round((cpu.user - this.cpuStart.user) / 1000),
      cpuSystemMs: Math.round((cpu.system - this.cpuStart.system) / 1000),
      loadAvg1m: round2(os.loadavg()[0]),
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sample();
  }

  summary(): {
    peakRssMb: number;
    peakHeapUsedMb: number;
    cpuUserMs: number;
    cpuSystemMs: number;
    loadAvg1mMax: number;
    samples: number;
  } {
    if (this.samples.length === 0) {
      return { peakRssMb: 0, peakHeapUsedMb: 0, cpuUserMs: 0, cpuSystemMs: 0, loadAvg1mMax: 0, samples: 0 };
    }
    const last = this.samples[this.samples.length - 1];
    return {
      peakRssMb: Math.max(...this.samples.map(sample => sample.rssMb)),
      peakHeapUsedMb: Math.max(...this.samples.map(sample => sample.heapUsedMb)),
      cpuUserMs: last.cpuUserMs,
      cpuSystemMs: last.cpuSystemMs,
      loadAvg1mMax: Math.max(...this.samples.map(sample => sample.loadAvg1m)),
      samples: this.samples.length,
    };
  }

  timeline(limit = 40): ResourceSample[] {
    if (this.samples.length <= limit) return [...this.samples];
    const stride = Math.ceil(this.samples.length / limit);
    return this.samples.filter((_, index) => index % stride === 0);
  }
}

/**
 * Seuils techniques de lecture (PAS des seuils métier) : repères pour
 * comparer 100 / 1 000 / 2 000 / 10 000 et localiser la saturation.
 */
export interface ReadingThresholds {
  errorRate: number;
  p95Ms: number;
  p99Ms: number;
  timeoutCount: number;
}

export const DEFAULT_READING_THRESHOLDS: ReadingThresholds = {
  errorRate: 0.01,
  p95Ms: 500,
  p99Ms: 2_000,
  timeoutCount: 1,
};

export interface ScenarioHealth {
  breached: string[];
  saturated: boolean;
}

export function evaluateScenarioHealth(
  totals: { requests: number; errors: number; timeouts: number },
  global: OpStats,
  thresholds: ReadingThresholds = DEFAULT_READING_THRESHOLDS,
): ScenarioHealth {
  const breached: string[] = [];
  const errorRate = totals.requests > 0 ? totals.errors / totals.requests : 0;
  if (errorRate > thresholds.errorRate) {
    breached.push(`errorRate=${(errorRate * 100).toFixed(2)}% > ${(thresholds.errorRate * 100).toFixed(2)}%`);
  }
  if (global.p95Ms > thresholds.p95Ms) breached.push(`p95=${global.p95Ms}ms > ${thresholds.p95Ms}ms`);
  if (global.p99Ms > thresholds.p99Ms) breached.push(`p99=${global.p99Ms}ms > ${thresholds.p99Ms}ms`);
  if (totals.timeouts > thresholds.timeoutCount) {
    breached.push(`timeouts=${totals.timeouts} > ${thresholds.timeoutCount}`);
  }
  return { breached, saturated: breached.length > 0 };
}

export interface QueueSnapshot {
  outboxPending: number;
  outboxProcessing: number;
  outboxDead: number;
  jobsReady: number;
  jobsRunning: number;
  jobsDead: number;
  jobsFailed: number;
  jobsProcessedTotal: number;
  jobsAttemptsGt1: number;
}

export interface ScenarioReport {
  scenario: string;
  label: string;
  users: number;
  journeyUnits: number;
  journeyProfile: string;
  concurrency: number;
  startedAtIso: string;
  durationMs: number;
  requestsPerSec: number;
  throughputJourneyUnitsPerSec: number;
  totals: ReturnType<LoadMetrics['totals']>;
  global: OpStats;
  ops: Record<string, OpStats>;
  queue: {
    before: QueueSnapshot | null;
    after: QueueSnapshot | null;
    ticks: number;
    tickFailures: number;
    jobsProcessedDuring: number;
  };
  db: {
    queries: number;
    meanMs: number;
    p95Ms: number;
    p99Ms: number;
    rollbacks: number;
    errors: number;
  };
  resources: ReturnType<ResourceSampler['summary']> & { timeline?: ResourceSample[] };
  security: {
    probes: number;
    violations: number;
    details: string[];
  };
  unitFailures: Array<{ unit: number; step: string; detail: string }>;
  health: ScenarioHealth;
  notes: string[];
}
