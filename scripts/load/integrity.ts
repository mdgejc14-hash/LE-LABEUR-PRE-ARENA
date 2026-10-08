/**
 * LE LABEUR — P0-LOAD-TESTS-3 — vérifications d'INTÉGRITÉ post-campagne à l'échelle.
 *
 * Ce module ne recrée PAS la suite de concurrence P0-LOAD-TESTS-2 (courses
 * métier rejouées à petite échelle) : il vérifie, directement en base APRÈS la
 * campagne 10 000, que la charge n'a produit :
 *   - aucune double transition métier (événements d'historique dupliqués) ;
 *   - aucun double effet métier (compteurs exacts par rapport aux parcours) ;
 *   - aucune duplication de notification (clé de déduplication) ;
 *   - aucune duplication de réputation (clé de déduplication) ;
 *   - aucun contournement d'idempotence (compteurs d'idempotence exacts) ;
 *   - aucun résidu anormal de file (retry / dead-letter / jobs échoués).
 *
 * FORMES RÉELLES DES HISTORIQUES (vérifiées dans le code source) :
 *   - applications.history : entrées `{ action, timestamp, actor }` (champ `action`) ;
 *   - contracts.history    : entrées `{ id, timestamp, event, description, actor }`
 *     (champ `event` — ex. CONTRACT_CREATED, EMPLOYER_SIGNED, CONTRACT_SIGNED,
 *     CONTRACT_ACTIVATED_BILATERAL).
 *   - statut final d'un contrat activé : 'ACTIVE' (matrice P0-F).
 *
 * HORLOGE MÉTIER FIXE : les jobs à échéance future (due_at > horloge de campagne)
 * ne sont JAMAIS réclamables par le drain — un résidu PENDING de jobs est donc
 * un état normal, y compris à convergence (constat identique à la campagne
 * 2 000 de référence : 8 000 jobs PENDING sur 14 000). Le contrôle I7 porte sur
 * les résidus ANORMAUX (RETRYABLE, DEAD_LETTER, FAILED), pas sur les PENDING.
 *
 * Tous les contrôles sont des requêtes SQL réelles sur la base de la campagne ;
 * aucune valeur n'est estimée.
 */

import type { LoadHarness } from './harness';
import type { SuiteCheckResult } from './metrics';

export interface IntegrityReport {
  mission: string;
  label: string;
  /** Population réellement simulée (utilisateurs synthétiques = 2 × parcours). */
  expected: { users: number; pairs: number };
  summary: { checks: number; passed: number; failed: number };
  results: SuiteCheckResult[];
  /** Compteurs SQL réels observés (preuve, jamais inventés). */
  measurements: Record<string, number>;
}

interface Row {
  [column: string]: unknown;
}

async function countRows(harness: LoadHarness, sql: string, values: readonly unknown[] = []): Promise<number> {
  const result = await harness.database.query<Row>(sql, values);
  const first = result.rows[0];
  if (!first) return 0;
  const value = Object.values(first)[0];
  return Number(value);
}

async function collectCounts(harness: LoadHarness, expectedPairs: number): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  counts.users = await countRows(harness, 'SELECT count(*)::text AS count FROM users');
  counts.sessions = await countRows(harness, 'SELECT count(*)::text AS count FROM sessions');
  counts.offers = await countRows(harness, 'SELECT count(*)::text AS count FROM offers');
  counts.missionQualifications = await countRows(harness, 'SELECT count(*)::text AS count FROM mission_qualifications');
  counts.candidateMatchingProfiles = await countRows(harness, 'SELECT count(*)::text AS count FROM candidate_matching_profiles');
  counts.applications = await countRows(harness, 'SELECT count(*)::text AS count FROM applications');
  counts.applicationsReview = await countRows(harness, `SELECT count(*)::text AS count FROM applications WHERE status = 'REVIEW'`);
  counts.matchingRuns = await countRows(harness, 'SELECT count(*)::text AS count FROM matching_runs');
  counts.proposals = await countRows(harness, 'SELECT count(*)::text AS count FROM proposals');
  counts.proposalsAccepted = await countRows(harness, `SELECT count(*)::text AS count FROM proposals WHERE status = 'ACCEPTED'`);
  counts.contracts = await countRows(harness, 'SELECT count(*)::text AS count FROM contracts');
  counts.contractsActive = await countRows(harness, `SELECT count(*)::text AS count FROM contracts WHERE status = 'ACTIVE'`);
  counts.notifications = await countRows(harness, 'SELECT count(*)::text AS count FROM notifications');
  counts.reputationEntries = await countRows(harness, 'SELECT count(*)::text AS count FROM reputation_entries');
  counts.outboxTotal = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_outbox');
  counts.outboxProcessed = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'PROCESSED'`);
  counts.outboxPending = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'PENDING'`);
  counts.outboxRetryable = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'RETRYABLE'`);
  counts.outboxDeadLetter = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'DEAD_LETTER'`);
  counts.outboxContractActivatedEvents = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type = 'CONTRACT_ACTIVATED'`);
  counts.outboxNotificationEvents = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type = 'NOTIFICATION_REQUIRED'`);
  counts.jobsTotal = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_jobs');
  counts.jobsCompleted = await countRows(harness, `SELECT count(*)::text AS count FROM automation_jobs WHERE status = 'COMPLETED'`);
  counts.jobsPending = await countRows(harness, `SELECT count(*)::text AS count FROM automation_jobs WHERE status = 'PENDING'`);
  counts.jobsFailed = await countRows(harness, `SELECT count(*)::text AS count FROM automation_jobs WHERE status IN ('FAILED', 'RETRYABLE', 'RUNNING')`);
  counts.idempotencyRows = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_idempotency');
  counts.idempotencyContractActivation = await countRows(harness, `SELECT count(*)::text AS count FROM automation_idempotency WHERE command = 'automation.CONTRACT_ACTIVATED'`);
  counts.expectedPairs = expectedPairs;
  return counts;
}

/**
 * Exécute les contrôles d'intégrité post-campagne. `expectedPairs` = nombre de
 * parcours réellement exécutés (population / 2).
 */
export async function runPostCampaignIntegrity(
  harness: LoadHarness,
  options: { users: number; pairs: number; label: string },
): Promise<IntegrityReport> {
  const expectedPairs = options.pairs;
  const results: SuiteCheckResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    const startedAt = performance.now();
    try {
      await test();
      results.push({ name, success: true, detail: 'OK', durationMs: Math.round((performance.now() - startedAt) * 100) / 100 });
    } catch (error) {
      results.push({
        name,
        success: false,
        detail: String((error as Error)?.message ?? error).slice(0, 400),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    }
  };
  const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
  };

  const counts = await collectCounts(harness, expectedPairs);

  await check('I1 population et effets métier 1:1 avec les parcours (aucun double effet)', async () => {
    assert(counts.users === options.users, `users: attendu ${options.users}, reçu ${counts.users}`);
    assert(counts.offers === expectedPairs, `offers: attendu ${expectedPairs}, reçu ${counts.offers}`);
    assert(counts.applications === expectedPairs, `applications: attendu ${expectedPairs}, reçu ${counts.applications}`);
    assert(counts.proposals === expectedPairs, `proposals: attendu ${expectedPairs}, reçu ${counts.proposals}`);
    assert(counts.contracts === expectedPairs, `contracts: attendu ${expectedPairs}, reçu ${counts.contracts}`);
    assert(counts.matchingRuns === expectedPairs, `matching_runs: attendu ${expectedPairs}, reçu ${counts.matchingRuns}`);
  });

  await check('I2 aucune double transition : historique sans événement dupliqué (applications.action + contracts.event)', async () => {
    // applications.history : entrées { action, timestamp, actor }.
    const duplicatedApplications = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM applications WHERE (
         SELECT count(*) FROM (
           SELECT e->>'action' AS action FROM jsonb_array_elements(history) e
           GROUP BY action HAVING count(*) > 1
         ) duplicated
       ) > 0`,
    );
    assert(duplicatedApplications === 0, `applications avec action d'historique dupliquée: ${duplicatedApplications}`);
    // contracts.history : entrées { id, timestamp, event, description, actor }.
    const duplicatedContracts = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM contracts WHERE (
         SELECT count(*) FROM (
           SELECT e->>'event' AS event FROM jsonb_array_elements(history) e
           GROUP BY event HAVING count(*) > 1
         ) duplicated
       ) > 0`,
    );
    assert(duplicatedContracts === 0, `contrats avec événement d'historique dupliqué: ${duplicatedContracts}`);
  });

  await check('I3 état final métier attendu : candidatures REVIEW, contrats ACTIVE (1 activation), propositions ACCEPTED', async () => {
    assert(counts.applicationsReview === expectedPairs, `applications REVIEW: ${counts.applicationsReview}/${expectedPairs}`);
    assert(counts.contractsActive === expectedPairs, `contrats ACTIVE: ${counts.contractsActive}/${expectedPairs}`);
    assert(counts.proposalsAccepted === expectedPairs, `propositions ACCEPTED: ${counts.proposalsAccepted}/${expectedPairs}`);
    // Une activation = exactement un événement d'historique CONTRACT_ACTIVATED_BILATERAL.
    const contractsWithoutSingleActivation = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM contracts WHERE (
         SELECT count(*) FROM jsonb_array_elements(history) e WHERE e->>'event' = 'CONTRACT_ACTIVATED_BILATERAL'
       ) <> 1`,
    );
    assert(contractsWithoutSingleActivation === 0, `contrats sans exactement 1 activation: ${contractsWithoutSingleActivation}`);
  });

  await check('I4 aucune duplication de notification (clé de déduplication recipient_id + dedupe_key)', async () => {
    const duplicated = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM (
         SELECT recipient_id, dedupe_key FROM notifications
         GROUP BY recipient_id, dedupe_key HAVING count(*) > 1
       ) d`,
    );
    assert(duplicated === 0, `notifications dupliquées (recipient_id, dedupe_key): ${duplicated}`);
    // Les notifications sont projetées depuis ~30 types d'événements couverts
    // (NOTIFICATION_REQUIRED n'est qu'un type parmi d'autres) : la relation
    // exacte 1:1 événement↔notification n'est PAS un invariant. Invariant
    // retenu : chaque événement NOTIFICATION_REQUIRED produit au moins une
    // notification, et aucune notification n'est dupliquée (garde ci-dessus).
    assert(
      counts.notifications >= counts.outboxNotificationEvents,
      `notifications ${counts.notifications} < événements NOTIFICATION_REQUIRED ${counts.outboxNotificationEvents}`,
    );
  });

  await check('I5 aucune duplication de réputation (clé de déduplication)', async () => {
    const duplicated = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM (
         SELECT dedupe_key FROM reputation_entries
         GROUP BY dedupe_key HAVING count(*) > 1
       ) d`,
    );
    assert(duplicated === 0, `entrées de réputation dupliquées (dedupe_key): ${duplicated}`);
  });

  await check('I6 aucun contournement d\'idempotence (compteurs d\'idempotence exacts)', async () => {
    assert(
      counts.idempotencyContractActivation === expectedPairs,
      `commandes d'idempotence CONTRACT_ACTIVATED: attendu ${expectedPairs}, reçu ${counts.idempotencyContractActivation}`,
    );
    assert(
      counts.outboxContractActivatedEvents === expectedPairs,
      `événements CONTRACT_ACTIVATED: attendu ${expectedPairs}, reçu ${counts.outboxContractActivatedEvents}`,
    );
  });

  await check('I7 file d\'automatisation : aucun résidu anormal (0 RETRYABLE, 0 DEAD_LETTER, 0 job FAILED/RUNNING/RETRYABLE)', async () => {
    // Un résidu PENDING (événements non drainés si borne de passes atteinte ;
    // jobs à échéance future sous horloge métier fixe) est un état normal,
    // constaté aussi à la campagne 2 000 de référence. Les résidus ANORMAUX
    // sont les retries, dead-letters et jobs en échec.
    assert(counts.outboxRetryable === 0, `outbox RETRYABLE résiduel: ${counts.outboxRetryable}`);
    assert(counts.outboxDeadLetter === 0, `outbox DEAD_LETTER résiduel: ${counts.outboxDeadLetter}`);
    assert(counts.jobsFailed === 0, `jobs FAILED/RUNNING/RETRYABLE résiduels: ${counts.jobsFailed}`);
  });

  const passed = results.filter(result => result.success).length;
  return {
    mission: 'P0-LOAD-TESTS-3',
    label: options.label,
    expected: { users: options.users, pairs: expectedPairs },
    summary: { checks: results.length, passed, failed: results.length - passed },
    results,
    measurements: counts,
  };
}
