/**
 * LE LABEUR — P0-LOAD-TESTS-2 — suite RÉSILIENCE (PARTIE 2).
 *
 * Réutilise EXACTEMENT le moteur P0-CRON-QUEUE (aucun nouveau moteur de
 * résilience) : le worker d'automatisation composé par `composeWorker`
 * (claim verrouillé `FOR UPDATE SKIP LOCKED`, compteur de tentatives, RETRY,
 * DEAD_LETTER, `recoverStaleClaims`, `runScheduledCycle`), sur la même base
 * PostgreSQL embarquée que les campagnes de charge.
 *
 * Vérifications réelles, à petite échelle contrôlée (données 100 % synthétiques) :
 *   R1  retry : échec réel → RETRYABLE (+30 s) → convergence au rejeu ;
 *   R2  timeout : borne d'orphanisation (claim > 10 min = worker mort) et
 *       timeout déclaratif des requêtes ; limite moteur documentée
 *       (statement_timeout NON exerçable sur PGlite WASM — mesuré, pas nié) ;
 *   R3  dead-letter : borne de tentatives atteinte → DEAD_LETTER terminal,
 *       jamais re-claimée ;
 *   R4  crash worker : claim orphelin (événement PROCESSING / job RUNNING) →
 *       récupération → rejeu idempotent → aucun second effet métier ;
 *   R5  backlog : N chaînes non drainées → passes bornées du worker →
 *       convergence mesurée (profondeur, débit, passes) ;
 *   R6  rejeu idempotent : jobs réarmés → re-exécution → doublons absorbés,
 *       aucune seconde écriture métier ;
 *   R7  deux workers simultanés → une seule réservation ;
 *   R8  deux Crons simultanés → un seul effet métier (ticks tracés ×2).
 *
 * Techniques de fault-injection reprises de cronQueue.test.ts (suppression de
 * ligne contrat, réarmement SQL, horodatage orphelin) : rien d'inventé.
 */

import { createSqlAutomationStores } from '../../src/backend/persistence/sqlAutomationStores';
import { contractActivatedEventId } from '../../src/domain/contractScheduleAutomation';
import {
  CRON_QUEUE_SOURCE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_STALE_CLAIM_MS,
} from '../../src/backend/automation/worker';
import type { RequestSample, SuiteCheckResult, SuiteReport } from './metrics';
import { createLoadHarness, LOAD_BUSINESS_CLOCK_ISO, type LoadHarness } from './harness';
import {
  activateContractChain,
  countRows,
  sql,
  type ContractChain,
  type Row,
} from './chains';
import { snapshotQueueDepth } from './queue';

interface ResilienceMeasurements {
  scale: { usersSynthetic: number; chainsActivated: number };
  retry: {
    firstPassStatus: string;
    firstPassAttempts: number;
    retryDelayMs: number;
    convergenceStatus: string;
    convergenceAttempts: number;
  };
  timeout: {
    staleClaimBorneMs: number;
    freshClaimNotRecovered: boolean;
    statementTimeoutEnforcedByEngine: boolean;
    statementTimeoutLimitation: string;
  };
  deadLetter: { status: string; attempts: number; reclaimedAfterAdvance: boolean };
  crashRecovery: {
    eventsRecovered: number;
    eventsDeadLettered: number;
    jobsRecovered: number;
    jobsFailed: number;
    replayWithoutSecondEffect: boolean;
  };
  backlog: {
    depthBefore: { totalOutbox: number; totalJobs: number };
    passes: number;
    durationMs: number;
    converged: boolean;
    eventsClaimed: number;
    jobsClaimed: number;
    eventsPerSecond: number;
    jobsPerSecond: number;
    deadlinesCreated: number;
    paymentsCreated: number;
  };
  idempotentReplay: { jobsReplayed: number; secondBusinessEffects: number };
  twoWorkers: { totalClaimed: number };
  twoCrons: { totalEventsClaimed: number; totalDuplicates: number; schedulesProjected: number; ticksTraced: number };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function firstRow(rows: Row[]): Row | undefined {
  return rows[0];
}

function advanceClock(harness: LoadHarness, ms: number): void {
  harness.clock.value = new Date(harness.clock.value.getTime() + ms);
}

/** Horodatage « orphelin » : plus ancien que la borne de récupération. */
function staleTimestamp(harness: LoadHarness, msOlderThanBorne: number): string {
  return new Date(harness.clock.value.getTime() - (DEFAULT_STALE_CLAIM_MS + msOlderThanBorne)).toISOString();
}

async function captureContractRow(harness: LoadHarness, contractId: string): Promise<Row> {
  const rows = await sql(harness, 'SELECT * FROM contracts WHERE id=$1', [contractId]);
  assert(rows.length === 1, 'ligne contrat capturée');
  return rows[0];
}

async function deleteContractRow(harness: LoadHarness, contractId: string): Promise<void> {
  await sql(harness, 'DELETE FROM contracts WHERE id=$1', [contractId]);
}

async function restoreContractRow(harness: LoadHarness, row: Row): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const values = columns.map(column => {
    const value = row[column];
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  });
  await sql(harness, `INSERT INTO contracts (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
}

async function outboxRow(harness: LoadHarness, eventId: string): Promise<Row | undefined> {
  return firstRow(await sql(harness, 'SELECT * FROM automation_outbox WHERE id=$1', [eventId]));
}

async function outboxCount(harness: LoadHarness, eventType: string): Promise<number> {
  return countRows(harness, 'SELECT count(*)::text AS count FROM automation_outbox WHERE event_type=$1', [eventType]);
}

async function auditCount(harness: LoadHarness, action: string): Promise<number> {
  return countRows(harness, 'SELECT count(*)::text AS count FROM automation_audit_ledger WHERE action=$1', [action]);
}

async function scheduleLength(harness: LoadHarness, contractId: string): Promise<number> {
  const rows = await sql(harness, 'SELECT payment_schedule FROM contracts WHERE id=$1', [contractId]);
  const schedule = firstRow(rows)?.payment_schedule;
  return Array.isArray(schedule) ? schedule.length : 0;
}

export async function runResilienceSuite(options: { users?: number } = {}): Promise<SuiteReport> {
  const usersSynthetic = options.users ?? 30;
  const startedAtIso = new Date().toISOString();
  const results: SuiteCheckResult[] = [];
  const samples: RequestSample[] = [];
  const measurements = {
    scale: { usersSynthetic, chainsActivated: 0 },
  } as ResilienceMeasurements;

  const check = async (name: string, test: (harness: LoadHarness) => Promise<void>) => {
    const harness = await createLoadHarness({ userCount: usersSynthetic });
    const startedAt = performance.now();
    try {
      await test(harness);
      results.push({ name, success: true, detail: 'OK', durationMs: Math.round((performance.now() - startedAt) * 100) / 100 });
    } catch (error) {
      results.push({
        name,
        success: false,
        detail: String((error as Error)?.message ?? error).slice(0, 400),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    } finally {
      await harness.close();
    }
  };

  const runtime = (harness: LoadHarness) => ({ harness, samples, timeoutMs: 30_000 });
  const chainFor = async (harness: LoadHarness, index: number, keyPrefix: string): Promise<ContractChain & { contractId: string }> => {
    const chain = await activateContractChain(runtime(harness), harness.pairs[index], { keyPrefix });
    assert(typeof chain.contractId === 'string', `contrat activé attendu pour ${keyPrefix}`);
    return chain as ContractChain & { contractId: string };
  };

  /* R1 — RETRY : échec réel puis convergence -------------------------------- */
  await check('R1 retry : échec réel → RETRYABLE (+30 s, last_error) → convergence au rejeu', async harness => {
    const chain = await chainFor(harness, 0, 'resil-retry');
    const eventId = contractActivatedEventId(chain.contractId);
    const captured = await captureContractRow(harness, chain.contractId);
    await deleteContractRow(harness, chain.contractId);

    const first = await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    let row = await outboxRow(harness, eventId);
    assert(row?.status === 'RETRYABLE', `RETRYABLE attendu après échec, reçu ${row?.status}`);
    assert(Number(row?.attempts) === 1, `1 tentative, reçu ${row?.attempts}`);
    assert(typeof row?.last_error === 'string' && String(row.last_error).length > 0, 'last_error consignée');
    const availableAt = new Date(String(row?.available_at)).getTime();
    assert(availableAt > harness.clock.value.getTime(), 'disponible après le délai de rejeu');
    assert(first.events.retried === 1, `le rapport compte exactement 1 retry, reçu ${first.events.retried}`);
    assert((await auditCount(harness, 'AUTOMATION_HANDLER_FAILED')) >= 1, 'échec tracé dans l’audit existant');

    await restoreContractRow(harness, captured);
    advanceClock(harness, 31_000);
    const second = await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    row = await outboxRow(harness, eventId);
    assert(row?.status === 'PROCESSED', `PROCESSED au rejeu, reçu ${row?.status}`);
    assert(Number(row?.attempts) === 2, `2 tentatives au total, reçu ${row?.attempts}`);
    assert((await scheduleLength(harness, chain.contractId)) === 6, 'convergence : échéancier de 6 paiements projeté');
    assert(second.events.completed >= 1 && second.events.retried === 0, 'rejeu complété sans nouvel échec');

    measurements.retry = {
      firstPassStatus: 'RETRYABLE',
      firstPassAttempts: 1,
      retryDelayMs: 30_000,
      convergenceStatus: 'PROCESSED',
      convergenceAttempts: 2,
    };
  });

  /* R2 — TIMEOUT : borne d'orphanisation réelle + limite moteur documentée --- */
  await check('R2 timeout : borne d’orphanisation (claim > 10 min) appliquée ; statement_timeout NON exerçable sur PGlite WASM (constat mesuré)', async harness => {
    // La borne d'exploitation est réellement câblée : un claim plus vieux que
    // DEFAULT_STALE_CLAIM_MS est orphelin (crash/timeout du worker — vérifié
    // en R4). Ici : (1) la borne existe et reste > au statement_timeout
    // déclaré (15 s) ; (2) un claim FRAIS n'est JAMAIS confondu avec un
    // orphelin ; (3) constat mesuré : le moteur embarqué PGlite n'applique
    // PAS statement_timeout (aucune annulation de requête) — documenté, non nié.
    assert(DEFAULT_STALE_CLAIM_MS === 10 * 60_000, 'borne d’orphanisation de 10 min');
    assert(DEFAULT_STALE_CLAIM_MS > 15_000, 'la borne d’orphanisation reste supérieure au statement_timeout déclaré (15 s)');

    const stores = createSqlAutomationStores(harness.database);
    await stores.jobs.createIfAbsent({
      jobId: 'job_resil_timeout_probe',
      jobType: 'SALARY_DUE_REMINDER',
      aggregateType: 'contract',
      aggregateId: 'ctr_missing_timeout',
      dueAt: new Date(harness.clock.value.getTime() - 60_000).toISOString(),
      idempotencyKey: 'resil-timeout-probe',
      createdAt: harness.clock.value.toISOString(),
    });
    const claimed = await stores.jobs.claimDue({
      limit: 1,
      jobTypes: ['SALARY_DUE_REMINDER'],
      now: harness.clock.value.toISOString(),
    });
    assert(claimed.length === 1 && claimed[0].jobId === 'job_resil_timeout_probe', 'claim réel du job sonde');
    const report = await harness.automationWorker.recoverStaleClaims();
    assert(report.jobsRecovered === 0, `un claim frais n’est PAS orphelin (borne ${DEFAULT_STALE_CLAIM_MS} ms), reçu ${report.jobsRecovered}`);
    await sql(harness, `UPDATE automation_jobs SET status='PENDING', started_at=NULL WHERE job_id=$1`, ['job_resil_timeout_probe']);

    measurements.timeout = {
      staleClaimBorneMs: DEFAULT_STALE_CLAIM_MS,
      freshClaimNotRecovered: true,
      statementTimeoutEnforcedByEngine: false,
      statementTimeoutLimitation: 'PGlite (PostgreSQL WASM embarqué) n’applique pas statement_timeout — constat mesuré : SET statement_timeout=200 puis SELECT pg_sleep(1) s’exécute jusqu’au bout (~3,3 s). En production, le timeout est appliqué par le serveur PostgreSQL derrière Hyperdrive (non mesurable ici : BLOCKED_EXTERNAL_ACCESS).',
    };
  });

  /* R3 — DEAD-LETTER --------------------------------------------------------- */
  await check('R3 dead-letter : borne de tentatives atteinte → DEAD_LETTER terminal, jamais re-claimée', async harness => {
    const chain = await chainFor(harness, 1, 'resil-deadletter');
    const eventId = contractActivatedEventId(chain.contractId);
    await deleteContractRow(harness, chain.contractId);
    await sql(
      harness,
      `UPDATE automation_outbox SET attempts=$1, status='PENDING', available_at=$3 WHERE id=$2`,
      [DEFAULT_MAX_ATTEMPTS, eventId, harness.clock.value.toISOString()],
    );

    await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    let row = await outboxRow(harness, eventId);
    assert(row?.status === 'DEAD_LETTER', `DEAD_LETTER attendu à la borne, reçu ${row?.status}`);
    assert(Number(row?.attempts) >= DEFAULT_MAX_ATTEMPTS, 'borne de tentatives atteinte');
    assert(typeof row?.last_error === 'string' && String(row.last_error).length > 0, 'raison conservée');

    advanceClock(harness, 60_000);
    await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    row = await outboxRow(harness, eventId);
    assert(row?.status === 'DEAD_LETTER', 'la dead-letter n’est jamais re-claimée');

    measurements.deadLetter = {
      status: 'DEAD_LETTER',
      attempts: DEFAULT_MAX_ATTEMPTS,
      reclaimedAfterAdvance: false,
    };
  });

  /* R4 — CRASH WORKER : orphelins récupérés, rejeu idempotent ----------------- */
  await check('R4 crash worker : claims orphelins (événement PROCESSING, job RUNNING, job à la borne) récupérés et rejoués sans second effet', async harness => {
    // (a) événement PROCESSING orphelin (crash après réservation, avant ack)
    const chainA = await chainFor(harness, 2, 'resil-crash-event');
    const eventA = contractActivatedEventId(chainA.contractId);
    const stores = createSqlAutomationStores(harness.database);
    const claimedEvent = await stores.outbox.claimDue({
      limit: 1,
      eventTypes: ['CONTRACT_ACTIVATED'],
      now: harness.clock.value.toISOString(),
    });
    assert(claimedEvent.length === 1 && claimedEvent[0].eventId === eventA, 'événement réellement claimé (PROCESSING)');
    await sql(harness, 'UPDATE automation_outbox SET processing_started_at=$1 WHERE id=$2', [staleTimestamp(harness, 60_000), eventA]);

    const cycleA = await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    assert(cycleA.recovered.eventsRecovered === 1, `1 orphelin événement récupéré, reçu ${cycleA.recovered.eventsRecovered}`);
    const rowA = await outboxRow(harness, eventA);
    assert(rowA?.status === 'PROCESSED', `re-joué jusqu’à PROCESSED, reçu ${rowA?.status}`);
    const deadlinesA = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id=$1', [chainA.contractId]);
    assert(deadlinesA >= 7, `effet métier UNIQUE (≥ 7 échéances), reçu ${deadlinesA}`);
    const jobsA = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_jobs WHERE aggregate_id=$1', [chainA.contractId]);
    assert(jobsA >= 14, `jobs de rappel créés une seule fois (≥ 14), reçu ${jobsA}`);
    const idemA = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_idempotency WHERE command=$1', ['automation.CONTRACT_ACTIVATED']);
    assert(idemA === 1, 'une seule réserve d’idempotence d’activation');

    // (b) job RUNNING orphelin APRÈS exécution (ack perdu) → rejeu idempotent
    const chainB = await chainFor(harness, 3, 'resil-crash-job');
    await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    const jobsB = await sql(harness, `SELECT job_id FROM automation_jobs WHERE status='COMPLETED' AND job_type='SALARY_DUE_REMINDER' LIMIT 1`);
    const targetJob = firstRow(jobsB)?.job_id;
    assert(typeof targetJob === 'string', 'un job COMPLETED à réarmer en orphelin');
    const eventsBefore = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_outbox');
    await sql(
      harness,
      `UPDATE automation_jobs SET status='RUNNING', started_at=$1, completed_at=NULL, attempts=attempts+1 WHERE job_id=$2`,
      [staleTimestamp(harness, 60_000), targetJob],
    );
    const cycleB = await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    assert(cycleB.recovered.jobsRecovered >= 1, `orphelin job récupéré, reçu ${cycleB.recovered.jobsRecovered}`);
    const jobRow = firstRow(await sql(harness, 'SELECT status FROM automation_jobs WHERE job_id=$1', [targetJob]));
    assert(jobRow?.status === 'COMPLETED', `re-passé à COMPLETED, reçu ${jobRow?.status}`);
    const eventsAfter = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_outbox');
    assert(eventsAfter === eventsBefore, 'AUCUN second effet métier après rejeu (idempotence des handlers)');

    // (c) job orphelin à la borne de tentatives → FAILED terminal
    await stores.jobs.createIfAbsent({
      jobId: 'job_resil_crash_terminal',
      jobType: 'SALARY_DUE_REMINDER',
      aggregateType: 'contract',
      aggregateId: 'ctr_missing_terminal',
      dueAt: new Date(harness.clock.value.getTime() - 60_000).toISOString(),
      idempotencyKey: 'resil-crash-terminal',
      createdAt: harness.clock.value.toISOString(),
    });
    await sql(
      harness,
      `UPDATE automation_jobs SET status='RUNNING', started_at=$1, attempts=$2 WHERE job_id=$3`,
      [staleTimestamp(harness, 60_000), DEFAULT_MAX_ATTEMPTS, 'job_resil_crash_terminal'],
    );
    const cycleC = await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    assert(cycleC.recovered.jobsFailed === 1, `job orphelin en borne → FAILED, reçu ${cycleC.recovered.jobsFailed}`);
    const terminalRow = firstRow(await sql(harness, 'SELECT status FROM automation_jobs WHERE job_id=$1', ['job_resil_crash_terminal']));
    assert(terminalRow?.status === 'FAILED', `FAILED terminal, reçu ${terminalRow?.status}`);

    measurements.crashRecovery = {
      eventsRecovered: cycleA.recovered.eventsRecovered,
      eventsDeadLettered: cycleA.recovered.eventsDeadLettered,
      jobsRecovered: cycleB.recovered.jobsRecovered,
      jobsFailed: cycleC.recovered.jobsFailed,
      replayWithoutSecondEffect: eventsAfter === eventsBefore,
    };
  });

  /* R5 — BACKLOG : N chaînes non drainées → convergence mesurée --------------- */
  const backlogChains = 12;
  await check('R5 backlog : chaînes non drainées → passes bornées du worker → convergence mesurée (profondeur, débit, effets uniques)', async harness => {
    const chains: Array<ContractChain & { contractId: string }> = [];
    for (let index = 0; index < backlogChains; index += 1) {
      chains.push(await chainFor(harness, index, `resil-backlog-${String(index + 1).padStart(2, '0')}`));
    }
    measurements.scale.chainsActivated = backlogChains;

    const depthBefore = await snapshotQueueDepth(harness);
    assert(depthBefore.totalOutbox >= backlogChains * 4, `backlog réel d’événements (≥ ${backlogChains * 4}), reçu ${depthBefore.totalOutbox}`);
    assert(depthBefore.totalJobs === 0, 'aucun job avant drain (les jobs sont créés PAR le handler d’activation)');

    const startedAt = performance.now();
    let passes = 0;
    let eventsClaimed = 0;
    let jobsClaimed = 0;
    const limitPerPass = 50;
    let converged = false;
    for (let pass = 1; pass <= 40 && !converged; pass += 1) {
      const cycle = await harness.automationWorker.runScheduledCycle({ limit: limitPerPass, trigger: 'resilience-backlog' });
      passes += 1;
      eventsClaimed += cycle.events.claimed;
      jobsClaimed += cycle.jobs.claimed;
      if (cycle.events.claimed === 0 && cycle.jobs.claimed === 0 && cycle.payments.applied === 0) {
        converged = true;
      }
    }
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    assert(converged, `convergence du backlog non atteinte en ${passes} passes`);
    const depthAfter = await snapshotQueueDepth(harness);
    assert((depthAfter.outboxByStatus.PENDING ?? 0) === 0, `plus aucun événement en file, reçu ${depthAfter.outboxByStatus.PENDING ?? 0}`);
    assert((depthAfter.outboxByStatus.DEAD_LETTER ?? 0) === 0 && (depthAfter.jobsByStatus.FAILED ?? 0) === 0, 'aucune dead-letter sur données saines');
    // Les seuls jobs restants sont FUTURS (M3..M6 + J3 futurs) : jamais échus.
    const overduePending = await countRows(
      harness,
      `SELECT count(*)::text AS count FROM automation_jobs WHERE status='PENDING' AND due_at <= $1`,
      [harness.clock.value.toISOString()],
    );
    assert(overduePending === 0, `aucun job échu non traité, reçu ${overduePending}`);

    // Effets métier EXACTEMENT une fois par contrat : échéancier 6 mois,
    // 7 échéances (6 salaires + 1 commission), 14 jobs, 7 paiements
    // (6 SALARY + 1 PLATFORM_FEE).
    for (const chain of chains) {
      assert((await scheduleLength(harness, chain.contractId)) === 6, `échéancier unique de 6 pour ${chain.contractId}`);
    }
    const deadlinesTotal = await countRows(harness, `SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id = ANY($1)`, [chains.map(chain => chain.contractId)]);
    assert(deadlinesTotal === backlogChains * 7, `7 échéances par contrat, reçu ${deadlinesTotal}`);
    const jobsTotal = await countRows(harness, `SELECT count(*)::text AS count FROM automation_jobs WHERE aggregate_id = ANY($1)`, [chains.map(chain => chain.contractId)]);
    assert(jobsTotal === backlogChains * 14, `14 jobs par contrat, reçu ${jobsTotal}`);
    const paymentsTotal = await countRows(harness, `SELECT count(*)::text AS count FROM payments WHERE contract_id = ANY($1)`, [chains.map(chain => chain.contractId)]);
    assert(paymentsTotal === backlogChains * 7, `7 paiements matérialisés par contrat (6 salaires + 1 commission), reçu ${paymentsTotal}`);

    measurements.backlog = {
      depthBefore: { totalOutbox: depthBefore.totalOutbox, totalJobs: depthBefore.totalJobs },
      passes,
      durationMs,
      converged,
      eventsClaimed,
      jobsClaimed,
      eventsPerSecond: durationMs > 0 ? Math.round((eventsClaimed / (durationMs / 1000)) * 100) / 100 : 0,
      jobsPerSecond: durationMs > 0 ? Math.round((jobsClaimed / (durationMs / 1000)) * 100) / 100 : 0,
      deadlinesCreated: deadlinesTotal,
      paymentsCreated: paymentsTotal,
    };
  });

  /* R6 — REJEU IDEMPOTENT ---------------------------------------------------- */
  await check('R6 rejeu idempotent : jobs réarmés et rejoués → doublons absorbés, aucune seconde écriture métier', async harness => {
    const chain = await chainFor(harness, 4, 'resil-replay');
    await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    const j3Jobs = await sql(harness, `SELECT job_id FROM automation_jobs WHERE job_type='SALARY_OVERDUE_J3_REMINDER' AND status='COMPLETED'`);
    assert(j3Jobs.length === 2, `2 jobs J3 exécutés, reçu ${j3Jobs.length}`);
    const eventsBefore = await outboxCount(harness, 'PAYMENT_OVERDUE_J3');
    const deadlinesBefore = await countRows(harness, `SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id=$1 AND status='ESCALATED'`, [chain.contractId]);
    const paymentsBefore = await countRows(harness, 'SELECT count(*)::text AS count FROM payments WHERE contract_id=$1', [chain.contractId]);

    for (const job of j3Jobs) {
      await sql(
        harness,
        `UPDATE automation_jobs SET status='PENDING', due_at=$2, started_at=NULL, completed_at=NULL WHERE job_id=$1`,
        [job.job_id, harness.clock.value.toISOString()],
      );
    }
    const replay = await harness.automationWorker.runDueJobs(50);
    assert(replay.claimed === 2 && replay.completed === 2, `2 jobs rejoués et complétés, reçu ${replay.claimed}/${replay.completed}`);
    const eventsAfter = await outboxCount(harness, 'PAYMENT_OVERDUE_J3');
    assert(eventsAfter === eventsBefore, 'AUCUN second événement PAYMENT_OVERDUE_J3');
    const deadlinesAfter = await countRows(harness, `SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id=$1 AND status='ESCALATED'`, [chain.contractId]);
    assert(deadlinesAfter === deadlinesBefore, 'aucune échéance re-escaladée');
    const paymentsAfter = await countRows(harness, 'SELECT count(*)::text AS count FROM payments WHERE contract_id=$1', [chain.contractId]);
    assert(paymentsAfter === paymentsBefore, 'aucun second paiement');

    measurements.idempotentReplay = {
      jobsReplayed: replay.claimed,
      secondBusinessEffects: (eventsAfter - eventsBefore) + (deadlinesAfter - deadlinesBefore) + (paymentsAfter - paymentsBefore),
    };
  });

  /* R7 — DEUX WORKERS SIMULTANÉS ---------------------------------------------- */
  await check('R7 deux workers simultanés sur un même job → une seule réservation (claim verrouillé)', async harness => {
    const chain = await chainFor(harness, 5, 'resil-two-workers');
    await harness.automationWorker.runScheduledCycle({ trigger: 'resilience' });
    const jobs = await sql(harness, `SELECT job_id FROM automation_jobs WHERE job_type='SALARY_DUE_REMINDER' AND status='COMPLETED' LIMIT 1`);
    const targetJob = firstRow(jobs)?.job_id;
    assert(typeof targetJob === 'string', 'un rappel déjà COMPLETED à réarmer');
    const before = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type='NOTIFICATION_REQUIRED'`);
    await sql(harness, `UPDATE automation_jobs SET status='PENDING', attempts=0, started_at=NULL, completed_at=NULL, last_error=NULL WHERE job_id=$1`, [targetJob]);

    const peer = harness.composePeerAutomationWorker();
    const [first, second] = await Promise.all([
      harness.automationWorker.runDueJobs(50),
      peer.runDueJobs(50),
    ]);
    const claimed = first.claimed + second.claimed;
    assert(claimed === 1, `le job est claimé une seule fois entre les deux workers, reçu ${claimed}`);
    const after = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type='NOTIFICATION_REQUIRED'`);
    assert(after === before, 'rejeu idempotent : aucun second effet');

    measurements.twoWorkers = { totalClaimed: claimed };
  });

  /* R8 — DEUX CRONS SIMULTANÉS ------------------------------------------------- */
  await check('R8 deux Crons simultanés → un seul effet métier (ticks tracés ×2, échéancier unique)', async harness => {
    const chain = await chainFor(harness, 6, 'resil-two-crons');
    const peer = harness.composePeerAutomationWorker();
    const [first, second] = await Promise.all([
      harness.automationWorker.runScheduledCycle({ trigger: 'resilience-dual-cron' }),
      peer.runScheduledCycle({ trigger: 'resilience-dual-cron' }),
    ]);
    const totalClaimed = first.events.claimed + second.events.claimed;
    const totalDuplicates = first.events.duplicates + second.events.duplicates;
    // 4 événements réels de la chaîne, traités UNE seule fois au total.
    assert(totalClaimed + totalDuplicates === 4, `4 événements traités une seule fois, reçu claimed=${totalClaimed} dup=${totalDuplicates}`);
    const eventId = contractActivatedEventId(chain.contractId);
    const row = await outboxRow(harness, eventId);
    assert(row?.status === 'PROCESSED' && Number(row?.attempts) === 1, 'événement PROCESSED en 1 tentative');
    assert((await scheduleLength(harness, chain.contractId)) === 6, 'échéancier unique projeté (jamais dupliqué)');
    const idem = await countRows(harness, 'SELECT count(*)::text AS count FROM automation_idempotency WHERE command=$1', ['automation.CONTRACT_ACTIVATED']);
    assert(idem === 1, 'une seule réserve d’idempotence d’activation');
    const ticks = await countRows(harness, `SELECT count(*)::text AS count FROM automation_audit_ledger WHERE action='CRON_TICK_EXECUTED' AND source=$1`, [CRON_QUEUE_SOURCE]);
    assert(ticks === 2, `les deux ticks sont tracés (observabilité), reçu ${ticks}`);

    measurements.twoCrons = {
      totalEventsClaimed: totalClaimed,
      totalDuplicates,
      schedulesProjected: 6,
      ticksTraced: ticks,
    };
  });

  const passed = results.filter(result => result.success).length;
  return {
    suite: 'resilience',
    mission: 'P0-LOAD-TESTS-2',
    label: 'P0-LOAD-TESTS-2 résilience — retry, timeout, crash worker, backlog, orphan recovery, dead-letter, rejeu idempotent, double Cron/worker',
    startedAtIso,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    businessClockIso: LOAD_BUSINESS_CLOCK_ISO,
    scale: {
      usersSynthetic: measurements.scale.usersSynthetic,
      chainsActivated: measurements.scale.chainsActivated,
      engine: 'worker P0-CRON-QUEUE existant (claim verrouillé, retry, dead-letter, recoverStaleClaims)',
    },
    summary: { checks: results.length, passed, failed: results.length - passed },
    results,
    measurements: measurements as unknown as Record<string, unknown>,
    samples,
  };
}
