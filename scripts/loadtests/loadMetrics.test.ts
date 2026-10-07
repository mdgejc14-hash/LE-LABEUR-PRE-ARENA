/**
 * P0-LOAD-TESTS — tests déterministes des primitives de mesure.
 *
 * Ces tests ne prouvent pas la charge (c'est le rôle de `npm run loadtest`) :
 * ils verrouillent la CORRECTION des chiffres publiés — quantiles nearest-rank
 * sur des valeurs observées, agrégation multi-collecteurs, planification à
 * concurrence bornée. Un rapport de charge faux serait pire qu'aucun rapport.
 */

import { MetricsCollector, latencyStats, quantile, round2, runPool, type Sample } from './loadMetrics';

interface TestResult {
  name: string;
  success: boolean;
  details?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, test: () => Promise<void> | void): Promise<TestResult> {
  try {
    await test();
    return { name, success: true, details: 'OK' };
  } catch (error) {
    return { name, success: false, details: String((error as Error)?.message ?? error) };
  }
}

export async function runLoadMetricsTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  await results.push(await check('quantile: nearest-rank sur des valeurs réellement observées (aucune interpolation)', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    assert(quantile(values, 0.5) === 50, `p50 attendu 50, reçu ${quantile(values, 0.5)}`);
    assert(quantile(values, 0.9) === 90, `p90 attendu 90, reçu ${quantile(values, 0.9)}`);
    assert(quantile(values, 0.95) === 100, `p95 attendu 100, reçu ${quantile(values, 0.95)}`);
    assert(quantile(values, 1) === 100, 'p100 = maximum observé');
    assert(quantile([], 0.5) === 0, 'un échantillon vide vaut 0, jamais NaN');
  }));

  await results.push(await check('latencyStats: min/moyenne/quantiles calculés sur les échantillons fournis', () => {
    const stats = latencyStats([1, 2, 3, 4]);
    assert(stats.count === 4, `count attendu 4, reçu ${stats.count}`);
    assert(stats.min === 1 && stats.max === 4, `bornes attendues 1..4, reçues ${stats.min}..${stats.max}`);
    assert(stats.mean === 2.5, `moyenne attendue 2.5, reçue ${stats.mean}`);
    assert(stats.p50 === 2 && stats.p95 === 4 && stats.p99 === 4, `quantiles inattendus ${stats.p50}/${stats.p95}/${stats.p99}`);
  }));

  await results.push(await check('MetricsCollector: erreurs, timeouts et retries sont comptés, jamais déduits', () => {
    const collector = new MetricsCollector();
    const samples: Array<[string, Sample]> = [
      ['GET /a', { durationMs: 10, ok: true, status: 200 }],
      ['GET /a', { durationMs: 20, ok: false, status: 500 }],
      ['GET /a', { durationMs: 30, ok: false, status: 0, timeout: true }],
      ['GET /b', { durationMs: 5, ok: true, status: 201, retries: 2 }],
    ];
    for (const [label, sample] of samples) collector.record(label, sample);
    assert(collector.totalRequests() === 4, `4 requêtes attendues, reçues ${collector.totalRequests()}`);
    assert(collector.totalErrors() === 2, `2 erreurs attendues, reçues ${collector.totalErrors()}`);
    const aggregate = collector.aggregate(1000);
    assert(aggregate.errorRatePct === 50, `taux d'erreur attendu 50 %, reçu ${aggregate.errorRatePct}`);
    assert(aggregate.timeouts === 1, `1 timeout attendu, reçu ${aggregate.timeouts}`);
    assert(aggregate.retries === 2, `2 retries attendus, reçus ${aggregate.retries}`);
    assert(aggregate.throughputRps === 4, `débit attendu 4 req/s, reçu ${aggregate.throughputRps}`);
    assert(
      aggregate.statusCounts['200'] === 1 && aggregate.statusCounts['500'] === 1
      && aggregate.statusCounts['0'] === 1 && aggregate.statusCounts['201'] === 1,
      `statuts attendus {200:1, 500:1, 0:1, 201:1}, reçus ${JSON.stringify(aggregate.statusCounts)}`,
    );
    const operation = aggregate.byOperation.find(entry => entry.label === 'GET /a');
    assert(operation?.count === 3, `3 échantillons attendus sur GET /a, reçus ${operation?.count}`);
  }));

  await results.push(await check('MetricsCollector: la fusion de deux collectors de charge additionne les échantillons', () => {
    const first = new MetricsCollector();
    const second = new MetricsCollector();
    first.record('GET /a', { durationMs: 10, ok: true, status: 200 });
    second.record('GET /a', { durationMs: 30, ok: true, status: 200 });
    second.record('GET /b', { durationMs: 20, ok: false, status: 404 });
    first.merge(second);
    const aggregate = first.aggregate(100);
    assert(aggregate.requests === 3, `3 requêtes attendues, reçues ${aggregate.requests}`);
    assert(aggregate.errors === 1, `1 erreur attendue, reçue ${aggregate.errors}`);
    assert(aggregate.latency.max === 30, `latence max attendue 30, reçue ${aggregate.latency.max}`);
    assert(aggregate.byOperation.length === 2, 'les étiquettes des deux collectors sont conservées');
  }));

  await results.push(await check('runPool: concurrence bornée, aucune tâche perdue ni exécutée deux fois', async () => {
    const tasks = Array.from({ length: 50 }, (_, index) => async () => index);
    const seen: number[] = [];
    let inFlight = 0;
    let peak = 0;
    const wrapped = tasks.map(task => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1));
      inFlight -= 1;
      return task();
    });
    await runPool(8, wrapped, result => { seen.push(result); });
    assert(seen.length === 50, `50 résultats attendus, reçus ${seen.length}`);
    assert(new Set(seen).size === 50, 'chaque tâche a produit un résultat distinct');
    assert(peak <= 8, `concurrence bornée attendue (≤ 8), crête observée ${peak}`);
  }));

  await results.push(await check('runPool: une concurrence demandée supérieure au travail ne crée pas de voie inutile', async () => {
    let peak = 0;
    let inFlight = 0;
    await runPool(64, Array.from({ length: 3 }, () => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1));
      inFlight -= 1;
    }));
    assert(peak <= 3, `crête attendue ≤ 3, observée ${peak}`);
    assert(round2(1.234) === 1.23, 'arrondi d’affichage à 2 décimales');
  }));

  return results;
}
