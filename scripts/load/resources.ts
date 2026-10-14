/**
 * LE LABEUR — P0-LOAD-TESTS-3 — échantillonnage des ressources du processus de charge.
 *
 * AUCUNE valeur synthétisée : le sampler lit `process.memoryUsage()`,
 * `process.cpuUsage()` et `os.loadavg()` à intervalle fixe pendant la fenêtre
 * de charge, et le rapport conserve les bornes (min/max) réellement observées.
 *
 * Le CPU est rapporté en pourcentage du temps mural écoulé (somme user+system
 * du processus, normalisée par le nombre de cœurs lus dans `os.cpus()`).
 */

import os from 'node:os';

export interface ResourceSample {
  /** performance.now() relatif au démarrage du sampler. */
  atMs: number;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  /** Cumul user+system du PROCESSUS (ms CPU) depuis le démarrage du sampler. */
  cpuTotalMs: number;
  loadavg1: number;
}

export interface ResourceReport {
  intervalMs: number;
  sampleCount: number;
  /** Fenêtre couverte par le sampler (ms). */
  windowMs: number;
  static: {
    cpuCount: number;
    cpuModel: string;
    totalMemBytes: number;
    platform: string;
    nodeVersion: string;
  };
  rss: { minBytes: number; maxBytes: number; meanBytes: number };
  heapUsed: { minBytes: number; maxBytes: number; meanBytes: number };
  external: { minBytes: number; maxBytes: number; meanBytes: number };
  /** % moyen du temps mural consommé en CPU (processus, tous cœurs). */
  cpuPercentMean: number;
  /** % maximal du temps mural consommé en CPU (processus, tous cœurs). */
  cpuPercentMax: number;
  loadavg1Max: number;
  samples: ResourceSample[];
}

export interface ResourceSampler {
  stop: () => ResourceReport;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Démarre un échantillonneur. `stop()` fige les agrégats — aucun chiffre n'est
 * extrapolé au-delà des échantillons réellement collectés.
 */
export function startResourceSampler(intervalMs = 1000): ResourceSampler {
  const startedAt = performance.now();
  const cpuStart = process.cpuUsage();
  const samples: ResourceSample[] = [];
  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage(cpuStart);
    const loadavg = os.loadavg();
    samples.push({
      atMs: Math.round((performance.now() - startedAt) * 100) / 100,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      cpuTotalMs: Math.round(((cpu.user + cpu.system) / 1000) * 100) / 100,
      loadavg1: loadavg[0] ?? 0,
    });
  }, intervalMs);
  // Le sampler ne doit jamais empêcher le processus de finir.
  timer.unref?.();

  return {
    stop: () => {
      clearInterval(timer);
      const windowMs = Math.round((performance.now() - startedAt) * 100) / 100;
      const cpuEnd = process.cpuUsage(cpuStart);
      // CPU cumulé du processus sur la fenêtre (ms) — % du temps mural.
      const cpuCumulMs = (cpuEnd.user + cpuEnd.system) / 1000;
      const cpuCount = os.cpus().length || 1;
      const rssValues = samples.map(sample => sample.rssBytes);
      const heapValues = samples.map(sample => sample.heapUsedBytes);
      const externalValues = samples.map(sample => sample.externalBytes);
      // Taux instantané par intervalle entre deux échantillons (% du temps mural).
      const intervalRates: number[] = [];
      for (let index = 1; index < samples.length; index += 1) {
        const deltaCpu = samples[index].cpuTotalMs - samples[index - 1].cpuTotalMs;
        const deltaWall = samples[index].atMs - samples[index - 1].atMs;
        if (deltaWall > 0) intervalRates.push((deltaCpu / deltaWall) * 100);
      }
      return {
        intervalMs,
        sampleCount: samples.length,
        windowMs,
        static: {
          cpuCount,
          cpuModel: os.cpus()[0]?.model ?? 'inconnu',
          totalMemBytes: os.totalmem(),
          platform: `${process.platform}/${process.arch}`,
          nodeVersion: process.version,
        },
        rss: {
          minBytes: rssValues.length > 0 ? Math.min(...rssValues) : 0,
          maxBytes: rssValues.length > 0 ? Math.max(...rssValues) : 0,
          meanBytes: Math.round(mean(rssValues)),
        },
        heapUsed: {
          minBytes: heapValues.length > 0 ? Math.min(...heapValues) : 0,
          maxBytes: heapValues.length > 0 ? Math.max(...heapValues) : 0,
          meanBytes: Math.round(mean(heapValues)),
        },
        external: {
          minBytes: externalValues.length > 0 ? Math.min(...externalValues) : 0,
          maxBytes: externalValues.length > 0 ? Math.max(...externalValues) : 0,
          meanBytes: Math.round(mean(externalValues)),
        },
        // % moyen du temps mural consommé en CPU par le processus de charge
        // (peut dépasser 100 % : WASM + threads auxiliaires). Non normalisé par
        // cœur : c'est la consommation réelle du processus qui est rapportée.
        cpuPercentMean: Math.round((cpuCumulMs / Math.max(1, windowMs)) * 10000) / 100,
        cpuPercentMax: intervalRates.length > 0 ? Math.round(Math.max(...intervalRates) * 100) / 100 : 0,
        loadavg1Max: samples.length > 0 ? Math.max(...samples.map(sample => sample.loadavg1)) : 0,
        samples,
      };
    },
  };
}
