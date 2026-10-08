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
 * 2 000 de référence : 8 000 jobs PENDING sur 14 000). Le contrôle I7 classe le
 * résidu (backlog non drainé / PENDING futurs / anomalies / échec de convergence)
 * au lieu de le traiter comme une panne unique — voir `classifyQueueResidue`.
 *
 * Tous les contrôles sont des requêtes SQL réelles sur la base de la campagne ;
 * aucune valeur n'est estimée.
 */

import type { LoadHarness } from './harness';
import type { SuiteCheckResult } from './metrics';

/** État de convergence réel du drain (P0-CRON-QUEUE, passes bornées). */
export interface IntegrityDrainState {
  converged: boolean;
  stoppedReason: string;
  passCount: number;
}

/**
 * Classification du résidu de file (I7). Les quatre situations sont distinctes :
 *   - BACKLOG_NON_DRAINE : résidu échu, drain NON convergé (borne atteinte) ;
 *   - FUTURE_PENDING     : jobs à échéance future, état normal (horloge fixe) ;
 *   - ANOMALIE           : RETRYABLE / DEAD_LETTER / FAILED / RUNNING résiduels ;
 *   - ECHEC_CONVERGENCE  : drain déclaré convergé MAIS résidu échu, ou drain
 *                          inconnu avec résidu échu (convergence non prouvée).
 */
export type QueueResidueClass = 'NONE' | 'BACKLOG_NON_DRAINE' | 'FUTURE_PENDING' | 'ANOMALIE' | 'ECHEC_CONVERGENCE';

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

async function collectCounts(harness: LoadHarness, expectedPairs: number, clockIso: string): Promise<Record<string, number>> {
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
  // Résidus de file classés par rapport à l'horloge métier (même comparaison que
  // le worker : claim `due_at <= $1` / `available_at <= $1`).
  counts.jobsPendingDue = await countRows(harness, `SELECT count(*)::text AS count FROM automation_jobs WHERE status = 'PENDING' AND due_at <= $1`, [clockIso]);
  counts.jobsPendingFuture = await countRows(harness, `SELECT count(*)::text AS count FROM automation_jobs WHERE status = 'PENDING' AND due_at > $1`, [clockIso]);
  counts.jobsRunning = await countRows(harness, `SELECT count(*)::text AS count FROM automation_jobs WHERE status = 'RUNNING'`);
  counts.outboxPendingDue = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'PENDING' AND available_at <= $1`, [clockIso]);
  counts.outboxPendingFuture = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'PENDING' AND available_at > $1`, [clockIso]);
  counts.expectedPairs = expectedPairs;
  return counts;
}

/**
 * Classe le résidu de file (I7) à partir de compteurs SQL réels et de l'état
 * de convergence du drain. Fonction pure (testable sans base).
 */
export function classifyQueueResidue(
  counts: Record<string, number>,
  drain: IntegrityDrainState | undefined,
): { kind: QueueResidueClass; detail: string } {
  const anomalies = (counts.outboxRetryable ?? 0) + (counts.outboxDeadLetter ?? 0) + (counts.jobsFailed ?? 0);
  if (anomalies > 0) {
    return {
      kind: 'ANOMALIE',
      detail: `ANOMALIE: outbox RETRYABLE=${counts.outboxRetryable ?? 0}, DEAD_LETTER=${counts.outboxDeadLetter ?? 0}, jobs FAILED/RETRYABLE/RUNNING=${counts.jobsFailed ?? 0}`,
    };
  }
  const dueOutbox = counts.outboxPendingDue ?? 0;
  const dueJobs = counts.jobsPendingDue ?? 0;
  const futureJobs = counts.jobsPendingFuture ?? 0;
  const futureOutbox = counts.outboxPendingFuture ?? 0;
  const due = dueOutbox + dueJobs;
  const futureSummary = `jobs PENDING à échéance future=${futureJobs}, outbox PENDING futur=${futureOutbox} (normal sous horloge fixe)`;
  if (due === 0) {
    return {
      kind: futureJobs + futureOutbox > 0 ? 'FUTURE_PENDING' : 'NONE',
      detail: `aucun résidu échu ; ${futureSummary}`,
    };
  }
  if (drain === undefined) {
    return {
      kind: 'ECHEC_CONVERGENCE',
      detail: `ÉCHEC DE CONVERGENCE: ${due} élément(s) échu(s) PENDING (outbox=${dueOutbox}, jobs=${dueJobs}) sans état de drain attestant la convergence`,
    };
  }
  if (drain.converged) {
    return {
      kind: 'ECHEC_CONVERGENCE',
      detail: `ÉCHEC DE CONVERGENCE: drain déclaré convergé (${drain.stoppedReason}, ${drain.passCount} passes) mais ${due} élément(s) échu(s) PENDING (outbox=${dueOutbox}, jobs=${dueJobs})`,
    };
  }
  return {
    kind: 'BACKLOG_NON_DRAINE',
    detail: `BACKLOG NON DRAINÉ: ${due} élément(s) échu(s) PENDING (outbox=${dueOutbox}, jobs=${dueJobs}) — drain NON convergé (raison: ${drain.stoppedReason}, ${drain.passCount} passes) ; ${futureSummary}`,
  };
}

/**
 * Exécute les contrôles d'intégrité post-campagne. `expectedPairs` = nombre de
 * parcours réellement exécutés (population / 2).
 */
export async function runPostCampaignIntegrity(
  harness: LoadHarness,
  options: {
    users: number;
    pairs: number;
    label: string;
    /** Horloge métier de la campagne (défaut : horloge fixe du harness). */
    businessClockIso?: string;
    /** État de convergence du drain ; absent = convergence inconnue. */
    drain?: IntegrityDrainState;
  },
): Promise<IntegrityReport> {
  const expectedPairs = options.pairs;
  const results: SuiteCheckResult[] = [];
  const check = async (name: string, test: () => Promise<string | void>) => {
    const startedAt = performance.now();
    try {
      const detail = await test();
      results.push({ name, success: true, detail: detail ?? 'OK', durationMs: Math.round((performance.now() - startedAt) * 100) / 100 });
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

  const clockIso = options.businessClockIso ?? harness.businessClockIso;
  const counts = await collectCounts(harness, expectedPairs, clockIso);

  await check('I1 population et effets métier 1:1 avec les parcours (aucun double effet)', async () => {
    assert(counts.users === options.users, `users: attendu ${options.users}, reçu ${counts.users}`);
    assert(counts.offers === expectedPairs, `offers: attendu ${expectedPairs}, reçu ${counts.offers}`);
    assert(counts.applications === expectedPairs, `applications: attendu ${expectedPairs}, reçu ${counts.applications}`);
    assert(counts.proposals === expectedPairs, `proposals: attendu ${expectedPairs}, reçu ${counts.proposals}`);
    assert(counts.contracts === expectedPairs, `contracts: attendu ${expectedPairs}, reçu ${counts.contracts}`);
    assert(counts.matchingRuns === expectedPairs, `matching_runs: attendu ${expectedPairs}, reçu ${counts.matchingRuns}`);
  });

  await check('I2 aucune double transition : historique sans répétition de cycle de vie ni entrée identique (applications.action, contracts.event+description)', async () => {
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
    // (a) événements de CYCLE DE VIE uniques par contrat (création, signatures,
    //     activation bilatérale) : au plus une occurrence par contrat.
    const duplicatedLifecycle = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM (
         SELECT c.id FROM contracts c, jsonb_array_elements(c.history) e
         WHERE e->>'event' IN ('CONTRACT_CREATED', 'EMPLOYER_SIGNED', 'EMPLOYEE_SIGNED', 'CONTRACT_ACTIVATED_BILATERAL')
         GROUP BY c.id, e->>'event' HAVING count(*) > 1
       ) d`,
    );
    // (b) aucun DOUBLE EFFET : une même paire (event, description) ne se répète pas.
    //     Les types répétables légitimes (PAYMENT_DUE : une échéance par période et
    //     par nature) ont des descriptions distinctes ; une répétition identique est
    //     une double transition réelle, quel que soit le type d'événement.
    const duplicatedIdenticalContracts = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM (
         SELECT c.id FROM contracts c, jsonb_array_elements(c.history) e
         GROUP BY c.id, e->>'event', e->>'description' HAVING count(*) > 1
       ) d`,
    );
    assert(
      duplicatedLifecycle === 0 && duplicatedIdenticalContracts === 0,
      `cycle de vie dupliqué: ${duplicatedLifecycle} contrat(s) ; entrée identique répétée: ${duplicatedIdenticalContracts} contrat(s)`,
    );
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
    // La garantie vérifiée est l'ABSENCE DE DOUBLON selon (recipient_id, dedupe_key)
    // (index unique `notifications_recipient_dedupe`). La relation événement↔notification
    // n'est PAS 1:1 : les notifications sont projetées depuis ~30 types d'événements,
    // NOTIFICATION_REQUIRED n'en étant qu'un. Le ratio est une mesure, pas une assertion.
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

  await check('I7 file d\'automatisation : aucune anomalie (RETRYABLE/DEAD_LETTER/FAILED/RUNNING) ni échec de convergence', async () => {
    // Anomalies : toujours FAIL.
    assert(counts.outboxRetryable === 0, `outbox RETRYABLE résiduel: ${counts.outboxRetryable}`);
    assert(counts.outboxDeadLetter === 0, `outbox DEAD_LETTER résiduel: ${counts.outboxDeadLetter}`);
    assert(counts.jobsFailed === 0, `jobs FAILED/RETRYABLE/RUNNING résiduels: ${counts.jobsFailed}`);
    const residue = classifyQueueResidue(counts, options.drain);
    // Échec de convergence : FAIL (drain déclaré convergé, ou convergence non prouvée).
    assert(residue.kind !== 'ECHEC_CONVERGENCE', residue.detail);
    // NONE / FUTURE_PENDING / BACKLOG_NON_DRAINE : pas une panne ; le détail donne la
    // classification exacte. La convergence n'est PAS revendiquée si le drain a
    // atteint une borne (BACKLOG_NON_DRAINE).
    return `${residue.kind}: ${residue.detail}`;
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
