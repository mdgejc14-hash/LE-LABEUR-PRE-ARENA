/**
 * LE LABEUR — P0-LOAD-TESTS-1 — exécuteur de campagne (pool de concurrence).
 *
 * Pool borné minimal : `concurrency` voies parallèles tirent les parcours d'une
 * file commune ; chaque parcours exécute ses ~25 étapes séquentiellement
 * (réalisme utilisateur : un parcours = une succession d'actions). La durée
 * murale mesurée encadre l'ensemble de la charge ; le débit en découle.
 *
 * Reproductibilité : pour un même (users, scénario), la charge est identique —
 * mêmes identités synthétiques, mêmes clés d'idempotence, base fraîche
 * reconstruite à chaque campagne (migrations réelles).
 */

import type { LoadHarness, UserPair } from './harness';
import type { RequestSample } from './metrics';
import { runRepresentativeJourney, type JourneyOutcome, type JourneyRuntime } from './scenarios';

export interface CampaignRunOptions {
  /** Nombre de parcours exécutés en parallèle (défaut : tous les parcours). */
  concurrency: number;
  /** Seuil de timeout déclaré (ms) : mesure déclarative — la requête n'est pas interrompue. */
  timeoutMs: number;
  onProgress?: (completed: number, total: number) => void;
  /**
   * P0-LOAD-TESTS-2 — sous-ensemble de parcours à exécuter (défaut : TOUS les
   * parcours du harness, comportement PARTIE 1 inchangé). Utilisé par la suite
   * concurrence pour générer une charge de fond sur une partie des paires
   * pendant que les courses de concurrence utilisent les autres.
   */
  pairs?: readonly UserPair[];
}

export interface CampaignRunResult {
  samples: RequestSample[];
  outcomes: JourneyOutcome[];
  durationMs: number;
  effectiveConcurrency: number;
}

export async function runCampaign(
  harness: LoadHarness,
  options: CampaignRunOptions,
): Promise<CampaignRunResult> {
  const samples: RequestSample[] = [];
  const outcomes: JourneyOutcome[] = [];
  const runtime: JourneyRuntime = { harness, samples, timeoutMs: options.timeoutMs };
  const pairs: readonly UserPair[] = options.pairs ?? harness.pairs;
  const effectiveConcurrency = Math.max(1, Math.min(options.concurrency, pairs.length));

  let nextIndex = 0;
  let completed = 0;
  const startedAt = performance.now();

  const lanes = Array.from({ length: effectiveConcurrency }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= pairs.length) return;
      const outcome = await runRepresentativeJourney(runtime, pairs[index]);
      outcomes.push(outcome);
      completed += 1;
      options.onProgress?.(completed, pairs.length);
    }
  });
  await Promise.all(lanes);

  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  return { samples, outcomes, durationMs, effectiveConcurrency };
}
