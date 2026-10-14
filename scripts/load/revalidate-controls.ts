/**
 * LE LABEUR — P0-LOAD-TESTS-3 (finalisation) — revalidation CIBLÉE des contrôles
 * I2, I3, I4, I7 (et de la classification du résidu de file).
 *
 * Ce script NE relance PAS la campagne 10 000 et NE modifie PAS les rapports
 * existants. Il rejoue, sur un PostgreSQL 17.10 serveur RÉEL (embedded-postgres),
 * une petite population réelle (parcours complets via le worker composé réel),
 * puis applique les contrôles d'intégrité corrigés :
 *
 *   1. drain BORNÉ volontairement (reproduit la condition du 10 000 : borne de
 *      passes atteinte) → I7 doit classer BACKLOG_NON_DRAINE, sans échec métier ;
 *   2. drain complet (convergence) → I7 doit classer FUTURE_PENDING / NONE ;
 *   3. contrôles négatifs : les ANCIENNES formes (contracts.history->>'action',
 *      statut 'ACTIVATED') doivent échouer sur les MÊMES données, prouvant que
 *      la correction change bien le résultat et n'est pas un contournement.
 *
 * Usage : npx tsx scripts/load/revalidate-controls.ts [--users 200] [--out FICHIER]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createLoadHarness } from './harness';
import { runCampaign } from './runner';
import { drainAutomationQueue, snapshotQueueDepth } from './queue';
import { classifyQueueResidue, runPostCampaignIntegrity, type IntegrityReport } from './integrity';

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

const users = Number(argValue('--users', '200'));
const outFile = resolve(argValue('--out', 'load-reports/P0-LOAD-TESTS-3_revalidation_I2-I3-I4-I7.json'));

if (!Number.isInteger(users) || users < 2 || users % 2 !== 0) {
  throw new Error('--users doit être un entier pair ≥ 2');
}

function summarize(report: IntegrityReport) {
  return {
    summary: report.summary,
    results: report.results.map(result => ({ name: result.name, success: result.success, detail: result.detail })),
  };
}

async function main(): Promise<number> {
  const startedAtIso = new Date().toISOString();
  console.log(`[revalidation] ${users} utilisateurs synthétiques, PostgreSQL 17.10 serveur réel (pas de campagne 10 000)`);
  const harness = await createLoadHarness({ userCount: users, persistence: 'postgres-server' });
  const pairs = harness.pairs.length;
  const clockIso = harness.businessClockIso;
  try {
    console.log(`[revalidation] ${pairs} parcours complets…`);
    const run = await runCampaign(harness, { concurrency: pairs, timeoutMs: 30_000 });
    const journeysCompleted = run.outcomes.filter(outcome => outcome.completed).length;
    console.log(`[revalidation] parcours complets : ${journeysCompleted}/${pairs}`);

    // ── Phase 1 : drain BORNÉ (condition du 10 000 : borne de passes atteinte) ──
    const depthBeforeBounded = await snapshotQueueDepth(harness);
    const bounded = await drainAutomationQueue(harness, {
      limitPerPass: 5,
      maxPasses: 2,
      budgetMs: 120_000,
      trigger: 'load-tests-p0-load-tests-3-revalidation-bounded',
    });
    const integrityBounded = await runPostCampaignIntegrity(harness, {
      users,
      pairs,
      label: 'revalidation — drain borné',
      businessClockIso: clockIso,
      drain: { converged: bounded.converged, stoppedReason: bounded.stoppedReason, passCount: bounded.passCount },
    });

    // ── Phase 2 : drain COMPLET jusqu'à convergence ──
    const full = await drainAutomationQueue(harness, {
      limitPerPass: 200,
      maxPasses: 200,
      budgetMs: 300_000,
      trigger: 'load-tests-p0-load-tests-3-revalidation-full',
    });
    const integrityFull = await runPostCampaignIntegrity(harness, {
      users,
      pairs,
      label: 'revalidation — drain complet',
      businessClockIso: clockIso,
      drain: { converged: full.converged, stoppedReason: full.stoppedReason, passCount: full.passCount },
    });

    // ── Contrôles négatifs : anciennes formes sur les MÊMES données ──
    const oldI2Contracts = await harness.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM contracts WHERE (
         SELECT count(*) FROM (
           SELECT e->>'action' AS action FROM jsonb_array_elements(history) e
           GROUP BY action HAVING count(*) > 1
         ) duplicated
       ) > 0`,
    );
    const oldI3Activated = await harness.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM contracts WHERE status = 'ACTIVATED'`,
    );
    const newI3Active = await harness.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM contracts WHERE status = 'ACTIVE'`,
    );
    const notifications = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');
    const requiredEvents = await harness.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type = 'NOTIFICATION_REQUIRED'`,
    );
    const distinctEventTypes = await harness.database.query<{ count: string }>(
      `SELECT count(DISTINCT event_type)::text AS count FROM automation_outbox`,
    );

    // ── Diagnostic I2 : quels événements d'historique contrats sont dupliqués ? ──
    const i2Diagnostic = await harness.database.query<{ event: string; contracts: string; maxPerContract: string }>(
      `SELECT event, count(*)::text AS contracts, max(n)::text AS "maxPerContract" FROM (
         SELECT c.id, e->>'event' AS event, count(*) AS n
         FROM contracts c, jsonb_array_elements(c.history) e
         GROUP BY c.id, e->>'event' HAVING count(*) > 1
       ) d GROUP BY event ORDER BY event`,
    );
    const i2Sample = await harness.database.query<{ id: string; history: unknown }>(
      `SELECT c.id, c.history FROM contracts c WHERE (
         SELECT count(*) FROM (SELECT e->>'event' FROM jsonb_array_elements(c.history) e GROUP BY 1 HAVING count(*) > 1) x
       ) > 0 LIMIT 1`,
    );

    // ── Sensibilité : injection CONTRÔLÉE de doublons réels (après les mesures) ──
    // Deux contrats : (A) entrée PAYMENT_DUE identique répétée ; (B) événement de
    // cycle de vie CONTRACT_CREATED recopié. I2 doit alors ÉCHOUER sur les deux.
    const sensitivityBefore = await runPostCampaignIntegrity(harness, {
      users, pairs, label: 'sensibilité — avant injection', businessClockIso: clockIso,
      drain: { converged: full.converged, stoppedReason: full.stoppedReason, passCount: full.passCount },
    });
    await harness.database.query(
      `UPDATE contracts SET history = history || jsonb_build_array((
         SELECT e FROM jsonb_array_elements(history) e WHERE e->>'event' = 'PAYMENT_DUE' LIMIT 1))
       WHERE id = (SELECT c.id FROM contracts c WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(c.history) e WHERE e->>'event' = 'PAYMENT_DUE') ORDER BY c.id LIMIT 1)`,
    );
    await harness.database.query(
      `UPDATE contracts SET history = history || jsonb_build_array((
         SELECT e FROM jsonb_array_elements(history) e WHERE e->>'event' = 'CONTRACT_CREATED' LIMIT 1))
       WHERE id = (SELECT c.id FROM contracts c WHERE c.id <> (
         SELECT c2.id FROM contracts c2 WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(c2.history) e WHERE e->>'event' = 'PAYMENT_DUE') ORDER BY c2.id LIMIT 1)
         ORDER BY c.id LIMIT 1)`,
    );
    const sensitivityAfter = await runPostCampaignIntegrity(harness, {
      users, pairs, label: 'sensibilité — après injection', businessClockIso: clockIso,
      drain: { converged: full.converged, stoppedReason: full.stoppedReason, passCount: full.passCount },
    });
    const i2Before = sensitivityBefore.results.find(r => r.name.startsWith('I2 '))!;
    const i2After = sensitivityAfter.results.find(r => r.name.startsWith('I2 '))!;
    const sensitivityOk = i2Before.success && !i2After.success;
    console.log(`\n== sensibilité I2 : avant=${i2Before.success ? 'PASS' : 'FAIL'}, après injection=${i2After.success ? 'PASS' : 'FAIL'} (${i2After.detail}) ==`);

    // ── Tests unitaires de la classification I7 (les 4 situations) ──
    const base = {
      outboxRetryable: 0, outboxDeadLetter: 0, jobsFailed: 0,
      outboxPendingDue: 0, outboxPendingFuture: 0, jobsPendingDue: 0, jobsPendingFuture: 0,
    };
    const classificationCases = [
      { name: 'backlog échu + drain borné', counts: { ...base, outboxPendingDue: 3 }, drain: { converged: false, stoppedReason: 'max-passes', passCount: 200 }, expected: 'BACKLOG_NON_DRAINE' },
      { name: 'jobs futurs seuls + convergé', counts: { ...base, jobsPendingFuture: 40 }, drain: { converged: true, stoppedReason: 'empty-pass', passCount: 9 }, expected: 'FUTURE_PENDING' },
      { name: 'DEAD_LETTER', counts: { ...base, outboxDeadLetter: 1 }, drain: { converged: true, stoppedReason: 'empty-pass', passCount: 9 }, expected: 'ANOMALIE' },
      { name: 'échu alors que drain déclaré convergé', counts: { ...base, jobsPendingDue: 2 }, drain: { converged: true, stoppedReason: 'empty-pass', passCount: 9 }, expected: 'ECHEC_CONVERGENCE' },
      { name: 'échu sans état de drain', counts: { ...base, jobsPendingDue: 2 }, drain: undefined, expected: 'ECHEC_CONVERGENCE' },
      { name: 'aucun résidu', counts: { ...base }, drain: { converged: true, stoppedReason: 'empty-pass', passCount: 1 }, expected: 'NONE' },
    ].map(testCase => ({
      name: testCase.name,
      expected: testCase.expected,
      actual: classifyQueueResidue(testCase.counts, testCase.drain).kind,
    }));
    const classificationOk = classificationCases.every(testCase => testCase.expected === testCase.actual);

    const report = {
      mission: 'P0-LOAD-TESTS-3',
      kind: 'REVALIDATION_CIBLEE_I2_I3_I4_I7',
      notOfficialCampaign: true,
      startedAtIso,
      finishedAtIso: new Date().toISOString(),
      persistence: harness.persistence,
      businessClockIso: clockIso,
      population: { usersSimulated: users, pairs, journeysCompleted, journeysFailed: pairs - journeysCompleted },
      queue: {
        boundedPhase: {
          converged: bounded.converged,
          stoppedReason: bounded.stoppedReason,
          passCount: bounded.passCount,
          limitPerPass: bounded.limitPerPass,
          maxPasses: bounded.maxPasses,
          depthBefore: depthBeforeBounded,
          depthAfter: bounded.depthAfter,
          totals: bounded.totals,
        },
        fullPhase: {
          converged: full.converged,
          stoppedReason: full.stoppedReason,
          passCount: full.passCount,
          depthAfter: full.depthAfter,
          totals: full.totals,
        },
      },
      integrityBoundedDrain: summarize(integrityBounded),
      integrityFullDrain: summarize(integrityFull),
      measurementsFullDrain: integrityFull.measurements,
      negativeControls: {
        oldI2ContractsActionKey_duplicatedContracts: Number(oldI2Contracts.rows[0]?.count ?? 0),
        oldI3StatusActivated_contracts: Number(oldI3Activated.rows[0]?.count ?? 0),
        newI3StatusActive_contracts: Number(newI3Active.rows[0]?.count ?? 0),
      },
      i4Measurement: {
        notifications: Number(notifications.rows[0]?.count ?? 0),
        notificationRequiredEvents: Number(requiredEvents.rows[0]?.count ?? 0),
        distinctOutboxEventTypes: Number(distinctEventTypes.rows[0]?.count ?? 0),
        note: 'Ratio informatif : la relation événement↔notification n\'est pas 1:1 ; seul l\'absence de doublon (recipient_id, dedupe_key) est asserté.',
      },
      i2Sensitivity: {
        beforeInjection: { success: i2Before.success, detail: i2Before.detail },
        afterInjection: { success: i2After.success, detail: i2After.detail },
        injected: 'une entrée PAYMENT_DUE identique répétée (contrat A) ; une entrée CONTRACT_CREATED recopiée (contrat B)',
        ok: sensitivityOk,
      },
      i2DiagnosticFullDrain: {
        duplicatedEventsByType: i2Diagnostic.rows,
        sampleContractHistory: i2Sample.rows[0]?.history ?? null,
      },
      classificationUnitCases: { ok: classificationOk, cases: classificationCases },
    };

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(report, null, 2));

    const line = (r: { name: string; success: boolean; detail: string }) => `  [${r.success ? 'PASS' : 'FAIL'}] ${r.name} — ${r.detail}`;
    console.log('\n== drain borné ==');
    for (const r of integrityBounded.results) console.log(line(r));
    console.log('\n== drain complet ==');
    for (const r of integrityFull.results) console.log(line(r));
    console.log('\n== diagnostic I2 (drain complet) ==');
    console.log(JSON.stringify(i2Diagnostic.rows));
    console.log('\n== contrôles négatifs (anciennes formes sur mêmes données) ==');
    console.log(JSON.stringify(report.negativeControls));
    console.log(`\n== classification I7 unitaire : ${classificationOk ? 'OK' : 'KO'} ==`);
    console.log(`[revalidation] rapport : ${outFile}`);

    // Périmètre de cette revalidation : I2, I3, I4, I7 (I1/I5/I6 rapportés, non gatés).
    const SCOPE = ['I2', 'I3', 'I4', 'I7'];
    const inScope = (r: { name: string }) => SCOPE.some(code => r.name.startsWith(code + ' '));
    const failedInScope = [...integrityBounded.results, ...integrityFull.results].filter(r => inScope(r) && !r.success);
    const ok = failedInScope.length === 0 && classificationOk && journeysCompleted === pairs && sensitivityOk;
    return ok ? 0 : 1;
  } finally {
    await harness.close();
  }
}

main().then(
  code => { process.exitCode = code; },
  error => { console.error(error); process.exitCode = 2; },
);
