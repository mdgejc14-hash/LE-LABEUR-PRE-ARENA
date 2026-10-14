/**
 * LE LABEUR — P0-LOAD-TESTS-2 — suite CONCURRENCE MÉTIER (PARTIE 2).
 *
 * Courses de concurrence RÉELLES SOUS CHARGE : pendant qu'une charge de fond
 * de parcours représentatifs tourne (mêmes scénarios P0-LOAD-TESTS-1 via
 * `runCampaign`), des opérations métier SIMULTANÉES sont déclenchées sur des
 * paires dédiées, à travers la VRAIE API (worker composé, sessions SQL,
 * transactions, outbox) :
 *
 *   C1  décisions simultanées : double examen (idempotent) et
 *       shortlist vs rejet (une seule transition gagnante) ;
 *   C2  ACCEPT/DECLINE simultanés sur la même proposition ;
 *   C3  confirmations simultanées d'exécution (contrat) ;
 *   C4  paiements simultanés : deux déclarations de salaire concurrentes ;
 *   C5  remplacements simultanés : deux décisions REPLACE concurrentes ;
 *   C6  WebRTC simultané : créations/join/signaling/fermetures concurrentes,
 *       expiration et purge ;
 *   C7  deux Crons simultanés SOUS CHARGE → un seul effet métier ;
 *   C8  deux workers simultanés SOUS CHARGE → une seule réservation.
 *
 * Invariants vérifiés en base (SQL réel, jamais déduits des seuls statuts HTTP) :
 * une seule transition gagnante ; aucune double écriture métier ; aucune double
 * notification (clé (recipientId, dedupeKey) unique) ; aucune double réputation
 * (index de déduplication PostgreSQL) ; aucun double remplacement ; idempotence
 * conservée (rejeu stable).
 */

import { contractActivatedEventId } from '../../src/domain/contractScheduleAutomation';
import { aggregateStats, type RequestSample, type SuiteCheckResult, type SuiteReport } from './metrics';
import { createLoadHarness, LOAD_BUSINESS_CLOCK_ISO } from './harness';
import { runCampaign, type CampaignRunResult } from './runner';
import {
  activateContractChain,
  countRows,
  measuredRequest,
  provisionAdmin,
  sql,
  type ContractChain,
  type Row,
} from './chains';
import { drainAutomationQueue } from './queue';
import type { StepResult } from './scenarios';

interface RaceOutcome {
  statuses: number[];
  bodies: Array<Record<string, unknown> | null>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function firstRow(rows: Row[]): Row | undefined {
  return rows[0];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function runConcurrencySuite(options: { users?: number } = {}): Promise<SuiteReport> {
  // 109 paires = 218 utilisateurs : 40 de charge de fond, 69 dédiées aux courses.
  const usersSynthetic = options.users ?? 218;
  const startedAtIso = new Date().toISOString();
  const results: SuiteCheckResult[] = [];
  const samples: RequestSample[] = [];
  const measurements: Record<string, unknown> = {
    scale: { usersSynthetic, backgroundPairs: 40, racePairs: usersSynthetic / 2 - 40 },
    races: {} as Record<string, unknown>,
  };

  const harness = await createLoadHarness({ userCount: usersSynthetic });
  const runtime = { harness, samples, timeoutMs: 30_000 };
  const pairs = harness.pairs;
  const backgroundPairs = pairs.slice(0, 40);
  const racePairs = pairs.slice(40);

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

  const request = (
    journeyId: string,
    step: string,
    routeKey: string,
    method: string,
    template: string,
    path: string,
    token: string | null,
    init: RequestInit,
    expectedStatuses: readonly number[],
  ): Promise<StepResult | null> =>
    measuredRequest(runtime, journeyId, { step, routeKey, method, template }, path, token, init, expectedStatuses);

  const jsonInit = (body: unknown, idempotencyKey?: string, extraHeaders: Record<string, string> = {}): RequestInit => {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...extraHeaders };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return { method: 'POST', headers, body: JSON.stringify(body) };
  };

  /** Exécute des requêtes concurrentes et capture statuts + corps (aucun gagnant présupposé). */
  const race = async (
    journeyId: string,
    step: string,
    routeKey: string,
    method: string,
    template: string,
    requests: ReadonlyArray<{ path: string; token: string | null; init: RequestInit }>,
    legalStatuses: readonly number[],
  ): Promise<RaceOutcome> => {
    const responses = await Promise.all(requests.map(req =>
      request(journeyId, step, routeKey, method, template, req.path, req.token, req.init, legalStatuses)));
    return {
      statuses: responses.map(response => response?.status ?? -1),
      bodies: responses.map(response => (response?.json ?? null) as Record<string, unknown> | null),
    };
  };

  const chainFor = async (index: number, keyPrefix: string, stopAfter?: 'application' | 'proposal' | 'contract'): Promise<ContractChain> =>
    activateContractChain(runtime, racePairs[index], stopAfter ? { keyPrefix, stopAfter } : { keyPrefix });

  /* ------------------------------------------------------------------ */
  /* Charge de fond : parcours représentatifs P0-LOAD-TESTS-1 (40 paires) */
  /* ------------------------------------------------------------------ */
  let backgroundLoad: Promise<CampaignRunResult> | null = null;
  try {
    backgroundLoad = runCampaign(harness, {
      concurrency: 40,
      timeoutMs: 30_000,
      pairs: backgroundPairs,
    });

    /* C1 — DÉCISIONS SIMULTANÉES ------------------------------------------ */
    const examineChains: ContractChain[] = [];
    const mixedChains: ContractChain[] = [];
    const rejectChains: ContractChain[] = [];
    await check('C1 décisions simultanées sous charge : examen idempotent, shortlist vs rejet (séquence légale), rejet vs rejet (une seule transition gagnante)', async () => {
      for (let index = 0; index < 10; index += 1) {
        examineChains.push(await chainFor(index, `race-c1-examine-${String(index + 1).padStart(2, '0')}`, 'application'));
        mixedChains.push(await chainFor(10 + index, `race-c1-mixed-${String(index + 1).padStart(2, '0')}`, 'application'));
        rejectChains.push(await chainFor(20 + index, `race-c1-reject-${String(index + 1).padStart(2, '0')}`, 'application'));
      }

      // (a) double EXAMEN simultané : idempotent — les deux voies décrivent l'état
      //     final, UNE seule transition persistée, aucun historique dupliqué (P0-E4).
      let examineOk200 = 0;
      for (let index = 0; index < examineChains.length; index += 1) {
        const chain = examineChains[index];
        const applicationId = chain.applicationId!;
        const outcome = await race(
          chain.journeyId, 'race.application.examine', 'applications.examine', 'POST',
          '/api/v1/applications/:applicationId/examine',
          [0, 1].map(lane => ({
            path: `/api/v1/applications/${applicationId}/examine`,
            token: chain.session.employerToken,
            init: jsonInit({}, `race-c1-examine-${index}-${lane}`),
          })),
          [200],
        );
        examineOk200 += outcome.statuses.filter(status => status === 200).length;
        const row = firstRow(await sql(harness, 'SELECT status, history FROM applications WHERE id=$1', [applicationId]));
        assert(row?.status === 'REVIEW', `état final REVIEW, reçu ${row?.status}`);
        const history = Array.isArray(row?.history) ? row!.history as Row[] : [];
        assert(history.length === 2, `une seule entrée d’examen (historique 2), reçu ${history.length}`);
      }
      assert(examineOk200 === 20, `les 20 examens concurrents sont 200, reçu ${examineOk200}`);

      // (b) SHORTLIST vs REJET simultanés : le domaine AUTORISE la séquence
      //     SHORTLISTED → REJECTED (matrice P0-E4) : les deux voies peuvent
      //     légalement s'appliquer dans l'ordre. Invariants : aucun 5xx, état
      //     final légal, CHAQUE action appliquée AU PLUS une fois (aucune
      //     écriture dupliquée), un seul événement par action.
      let mixedBothApplied = 0;
      for (let index = 0; index < mixedChains.length; index += 1) {
        const chain = mixedChains[index];
        const applicationId = chain.applicationId!;
        const outcome = await race(
          chain.journeyId, 'race.application.decision', 'applications.shortlist', 'POST',
          '/api/v1/applications/:applicationId/:action',
          [
            { path: `/api/v1/applications/${applicationId}/shortlist`, token: chain.session.employerToken, init: jsonInit({}, `race-c1-short-${index}`) },
            { path: `/api/v1/applications/${applicationId}/reject`, token: chain.session.employerToken, init: jsonInit({}, `race-c1-rej-${index}`) },
          ],
          [200, 409],
        );
        assert(outcome.statuses.every(status => status === 200 || status === 409), `statuts légaux, reçu ${outcome.statuses.join('/')}`);
        const row = firstRow(await sql(harness, 'SELECT status, history FROM applications WHERE id=$1', [applicationId]));
        assert(row?.status === 'SHORTLISTED' || row?.status === 'REJECTED', `état final légal, reçu ${row?.status}`);
        const history = Array.isArray(row?.history) ? row!.history as Row[] : [];
        const shortlistEntries = history.filter(entry => String(entry.action).startsWith('Candidat sélectionné')).length;
        const rejectEntries = history.filter(entry => String(entry.action).startsWith('Candidature non retenue')).length;
        assert(shortlistEntries <= 1 && rejectEntries <= 1, `chaque action au plus une fois (S=${shortlistEntries}, R=${rejectEntries})`);
        const shortlistEvents = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id=$1 AND event_type='APPLICATION_SHORTLISTED'`, [applicationId]);
        const rejectEvents = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id=$1 AND event_type='APPLICATION_REJECTED'`, [applicationId]);
        assert(shortlistEvents === shortlistEntries && rejectEvents === rejectEntries, `un événement par action réellement appliquée (S=${shortlistEvents}/${shortlistEntries}, R=${rejectEvents}/${rejectEntries})`);
        if (shortlistEntries === 1 && rejectEntries === 1) mixedBothApplied += 1;
      }

      // (c) REJET vs REJET simultanés (clés différentes) : transitions
      //     EXCLUSIVES — exactement UNE gagnante, l'autre 409, REJECTED
      //     persisté une seule fois, un seul événement, un seul historique.
      let rejectWinners = 0;
      let rejectLosers = 0;
      for (let index = 0; index < rejectChains.length; index += 1) {
        const chain = rejectChains[index];
        const applicationId = chain.applicationId!;
        const outcome = await race(
          chain.journeyId, 'race.application.reject', 'applications.reject', 'POST',
          '/api/v1/applications/:applicationId/reject',
          [0, 1].map(lane => ({
            path: `/api/v1/applications/${applicationId}/reject`,
            token: chain.session.employerToken,
            init: jsonInit({}, `race-c1-rejr-${index}-${lane}`),
          })),
          [200, 409],
        );
        const okCount = outcome.statuses.filter(status => status === 200).length;
        rejectWinners += okCount;
        rejectLosers += outcome.statuses.filter(status => status === 409).length;
        assert(okCount === 1, `exactement un rejet gagnant, reçu ${outcome.statuses.join('/')}`);
        const row = firstRow(await sql(harness, 'SELECT status, history FROM applications WHERE id=$1', [applicationId]));
        assert(row?.status === 'REJECTED', `REJECTED persisté, reçu ${row?.status}`);
        const history = Array.isArray(row?.history) ? row!.history as Row[] : [];
        const rejectEntries = history.filter(entry => String(entry.action).startsWith('Candidature non retenue')).length;
        assert(rejectEntries === 1, `une seule entrée de rejet, reçu ${rejectEntries}`);
        const rejectEvents = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id=$1 AND event_type='APPLICATION_REJECTED'`, [applicationId]);
        assert(rejectEvents === 1, `un seul événement APPLICATION_REJECTED, reçu ${rejectEvents}`);
      }
      assert(rejectWinners === 10 && rejectLosers === 10, `10 gagnants / 10 perdants, reçu ${rejectWinners}/${rejectLosers}`);

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        decisionsSimultanees: {
          examinePairs: 10,
          mixedPairs: 10,
          rejectPairs: 10,
          mixedBothAppliedLegally: mixedBothApplied,
          rejectWinners,
          rejectLosers,
          doubleTransitions: 0,
        },
      };
    });

    /* C2 — ACCEPT/DECLINE SIMULTANÉS --------------------------------------- */
    const proposalChains: ContractChain[] = [];
    await check('C2 ACCEPT/DECLINE simultanés sous charge : une seule réponse gagnante, un seul événement terminal', async () => {
      for (let index = 0; index < 10; index += 1) {
        proposalChains.push(await chainFor(30 + index, `race-c2-${String(index + 1).padStart(2, '0')}`, 'proposal'));
      }
      let accepted = 0;
      let declined = 0;
      for (let index = 0; index < proposalChains.length; index += 1) {
        const chain = proposalChains[index];
        const proposalId = chain.proposalId!;
        const outcome = await race(
          chain.journeyId, 'race.proposal.respond', 'proposals.respond', 'POST',
          '/api/v1/proposals/:proposalId/respond',
          [
            { path: `/api/v1/proposals/${proposalId}/respond`, token: chain.session.candidateToken, init: jsonInit({ action: 'ACCEPT' }, `race-c2-acc-${index}`) },
            { path: `/api/v1/proposals/${proposalId}/respond`, token: chain.session.candidateToken, init: jsonInit({ action: 'DECLINE' }, `race-c2-dec-${index}`) },
          ],
          [200, 409],
        );
        const ok = outcome.statuses.filter(status => status === 200).length;
        assert(ok === 1, `exactement une réponse gagnante, reçu ${outcome.statuses.join('/')}`);
        const row = firstRow(await sql(harness, 'SELECT status FROM proposals WHERE id=$1', [proposalId]));
        assert(row?.status === 'ACCEPTED' || row?.status === 'DECLINED', `état final légal, reçu ${row?.status}`);
        if (row?.status === 'ACCEPTED') accepted += 1; else declined += 1;
        // Un seul événement terminal dans l'Outbox pour cette proposition.
        const terminalEvents = await countRows(
          harness,
          `SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id=$1 AND event_type IN ('PROPOSAL_ACCEPTED','PROPOSAL_DECLINED')`,
          [proposalId],
        );
        assert(terminalEvents === 1, `un seul événement terminal, reçu ${terminalEvents}`);
      }
      assert(accepted + declined === 10, 'les 10 propositions sont toutes dans un état terminal');

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        acceptDeclineSimultanes: { pairs: 10, accepted, declined, doubleEvents: 0 },
      };
    });

    /* C3 — CONFIRMATIONS SIMULTANÉES --------------------------------------- */
    const contractChains: ContractChain[] = [];
    await check('C3 confirmations simultanées d’exécution sous charge : idempotence sous concurrence, aucune double écriture par commande', async () => {
      // État de référence réel des confirmations (P0-CONTRACT-POST) : contrat
      // ACTIVÉ → drain de l'activation → avancement M1→M2 (la protection « un
      // incident est exigé pendant M1 » est levée à partir de M2) → courses.
      for (let index = 0; index < 7; index += 1) {
        contractChains.push(await chainFor(40 + index, `race-c3-${String(index + 1).padStart(2, '0')}`));
      }
      for (const chain of contractChains) {
        const eventId = `evt_contract_ACTIVATED_${chain.contractId}`;
        for (let pass = 0; pass < 12; pass += 1) {
          const row = firstRow(await sql(harness, 'SELECT status FROM automation_outbox WHERE id=$1', [eventId]));
          if (row?.status === 'PROCESSED') break;
          await harness.automationWorker.drainEvents(100);
        }
        const advanced = await request(
          chain.journeyId, 'race.payments.advance-month', 'payments.advance-month', 'POST',
          `/api/v1/contracts/:contractId/payments/advance-month`,
          `/api/v1/contracts/${chain.contractId}/payments/advance-month`,
          chain.session.employerToken, jsonInit({}, `race-c3-advance-${chain.journeyId}`),
          [200],
        );
        assert(advanced !== null, `avancement M2 attendu pour ${chain.contractId}`);
      }

      const confirmedEntries = async (contractId: string): Promise<Row[]> => {
        const row = firstRow(await sql(harness, 'SELECT history FROM contracts WHERE id=$1', [contractId]));
        const history = Array.isArray(row?.history) ? row!.history as Row[] : [];
        return history.filter(entry => entry.event === 'EXECUTION_CONFIRMED');
      };

      // (a) même clé d'idempotence, requêtes CONCURRENTES : le rejeu est
      //     absorbé — UNE seule entrée EXECUTION_CONFIRMED (jamais doublée).
      for (let index = 0; index < contractChains.length; index += 1) {
        const chain = contractChains[index];
        const contractId = chain.contractId!;
        const outcome = await race(
          chain.journeyId, 'race.contract.confirm-execution', 'contracts.confirm-execution', 'POST',
          '/api/v1/contracts/:contractId/confirm-execution',
          [0, 1].map(() => ({
            path: `/api/v1/contracts/${contractId}/confirm-execution`,
            token: chain.session.employerToken,
            init: jsonInit({}, `race-c3-samekey-${index}`),
          })),
          [200, 409],
        );
        assert(outcome.statuses.every(status => status === 200 || status === 409), `statuts légaux, reçu ${outcome.statuses.join('/')}`);
        assert(outcome.statuses.some(status => status === 200), `au moins une confirmation acceptée, reçu ${outcome.statuses.join('/')}`);
        const entries = await confirmedEntries(contractId);
        assert(entries.length === 1, `même clé → UNE seule entrée EXECUTION_CONFIRMED, reçu ${entries.length}`);
      }

      // (b) les DEUX parties confirment simultanément (clés distinctes) :
      //     chaque commande est écrite UNE fois — exactement DEUX nouvelles
      //     entrées (une par partie), aucune écriture dupliquée d'une même commande.
      for (let index = 0; index < contractChains.length; index += 1) {
        const chain = contractChains[index];
        const contractId = chain.contractId!;
        const before = (await confirmedEntries(contractId)).length;
        const outcome = await race(
          chain.journeyId, 'race.contract.confirm-execution', 'contracts.confirm-execution', 'POST',
          '/api/v1/contracts/:contractId/confirm-execution',
          [
            { path: `/api/v1/contracts/${contractId}/confirm-execution`, token: chain.session.employerToken, init: jsonInit({}, `race-c3-emp-${index}`) },
            { path: `/api/v1/contracts/${contractId}/confirm-execution`, token: chain.session.candidateToken, init: jsonInit({}, `race-c3-can-${index}`) },
          ],
          [200, 409],
        );
        assert(outcome.statuses.every(status => status === 200 || status === 409), `statuts légaux, reçu ${outcome.statuses.join('/')}`);
        assert(outcome.statuses.some(status => status === 200), `au moins une confirmation acceptée, reçu ${outcome.statuses.join('/')}`);
        const entries = await confirmedEntries(contractId);
        assert(entries.length - before === 2, `deux commandes distinctes → exactement deux nouvelles entrées, reçu ${entries.length - before}`);
        const newActors = entries.slice(before).map(entry => String(entry.actor));
        assert(new Set(newActors).size === 2, `une entrée par partie (${newActors.join(',')})`);
      }

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        confirmationsSimultanees: { pairs: 7, doubleWrittenCommands: 0 },
      };
    });

    /* C7 — DEUX CRONS SIMULTANÉS SOUS CHARGE -------------------------------- */
    await check('C7 deux Crons simultanés sous charge → un seul effet métier (échéancier unique, ticks ×2)', async () => {
      const chain = await chainFor(50, 'race-c7-dual-cron');
      const peer = harness.composePeerAutomationWorker();
      const [first, second] = await Promise.all([
        harness.automationWorker.runScheduledCycle({ limit: 100, trigger: 'race-dual-cron' }),
        peer.runScheduledCycle({ limit: 100, trigger: 'race-dual-cron' }),
      ]);
      const eventId = contractActivatedEventId(chain.contractId!);
      const row = firstRow(await sql(harness, 'SELECT status, attempts FROM automation_outbox WHERE id=$1', [eventId]));
      assert(row?.status === 'PROCESSED' && Number(row?.attempts) === 1, `CONTRACT_ACTIVATED traité UNE fois, reçu ${row?.status}/${row?.attempts}`);
      const schedule = firstRow(await sql(harness, 'SELECT payment_schedule FROM contracts WHERE id=$1', [chain.contractId]));
      const scheduleRows = Array.isArray(schedule?.payment_schedule) ? schedule!.payment_schedule as Row[] : [];
      assert(scheduleRows.length === 6, `échéancier unique de 6, reçu ${scheduleRows.length}`);
      const idem = await countRows(
        harness,
        'SELECT count(*)::text AS count FROM automation_idempotency WHERE command=$1 AND idempotency_key=$2',
        ['automation.CONTRACT_ACTIVATED', `${chain.contractId}:CONTRACT_ACTIVATED`],
      );
      assert(idem === 1, 'une seule réserve d’idempotence d’activation pour CE contrat');
      const ticks = await countRows(harness, `SELECT count(*)::text AS count FROM automation_audit_ledger WHERE action='CRON_TICK_EXECUTED' AND after_state->>'trigger'='race-dual-cron'`);
      assert(ticks === 2, `les deux ticks sont tracés, reçu ${ticks}`);
      const claimedTotal = first.events.claimed + second.events.claimed;
      const duplicatesTotal = first.events.duplicates + second.events.duplicates;
      assert(claimedTotal + duplicatesTotal >= 4, `les événements dus sont traités une seule fois au total (${claimedTotal}+${duplicatesTotal})`);

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        deuxCronsSousCharge: { schedulesProjected: 6, ticksTraced: ticks, eventsClaimedTotal: claimedTotal, eventsDuplicatesTotal: duplicatesTotal },
      };
    });

    /* C8 — DEUX WORKERS SIMULTANÉS SOUS CHARGE ------------------------------- */
    await check('C8 deux workers simultanés sous charge → une seule réservation du job réarmé', async () => {
      const chain = await chainFor(51, 'race-c8-dual-worker');
      const eventId = contractActivatedEventId(chain.contractId!);
      // Drain CIBLÉ : jusqu'à CE que l'activation de cette chaîne soit traitée
      // et qu'un rappel COMPLETED existe pour la réarmer (drain borné, pas complet).
      let prepared = false;
      for (let pass = 0; pass < 15 && !prepared; pass += 1) {
        await harness.automationWorker.drainEvents(100);
        await harness.automationWorker.runDueJobs(100);
        const row = firstRow(await sql(harness, 'SELECT status FROM automation_outbox WHERE id=$1', [eventId]));
        const job = firstRow(await sql(
          harness,
          `SELECT job_id FROM automation_jobs WHERE aggregate_id=$1 AND job_type='SALARY_DUE_REMINDER' AND status='COMPLETED' LIMIT 1`,
          [chain.contractId],
        ));
        prepared = row?.status === 'PROCESSED' && Boolean(job);
      }
      assert(prepared, 'chaîne drainée et rappel COMPLETED prêt à être réarmé');
      const jobs = await sql(
        harness,
        `SELECT job_id FROM automation_jobs WHERE aggregate_id=$1 AND job_type='SALARY_DUE_REMINDER' AND status='COMPLETED' LIMIT 1`,
        [chain.contractId],
      );
      const targetJob = asText(firstRow(jobs)?.job_id);
      const before = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type='NOTIFICATION_REQUIRED'`);
      await sql(harness, `UPDATE automation_jobs SET status='PENDING', attempts=0, started_at=NULL, completed_at=NULL, last_error=NULL WHERE job_id=$1`, [targetJob]);
      const peer = harness.composePeerAutomationWorker();
      const [first, second] = await Promise.all([
        harness.automationWorker.runDueJobs(100),
        peer.runDueJobs(100),
      ]);
      const claimed = first.claimed + second.claimed;
      assert(claimed === 1, `le job réarmé est claimé UNE fois entre les deux workers sous charge, reçu ${claimed}`);
      const after = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type='NOTIFICATION_REQUIRED'`);
      assert(after === before, 'rejeu idempotent : aucun second effet');

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        deuxWorkersSousCharge: { totalClaimed: claimed },
      };
    });

    /* Drain complet (queue réelle) — matérialise notifications + paiements. */
    await check('drain de la file après les courses (worker existant) → notifications et paiements matérialisés, convergence', async () => {
      const report = await drainAutomationQueue(harness, { limitPerPass: 150, maxPasses: 90, budgetMs: 300_000, trigger: 'race-drain' });
      assert(report.converged, `file convergée (raison: ${report.stoppedReason}, passes: ${report.passCount})`);
      measurements.queueDrain = {
        passes: report.passCount,
        durationMs: report.durationMs,
        eventsClaimed: report.totals.eventsClaimed,
        eventsCompleted: report.totals.eventsCompleted,
        eventsDuplicates: report.totals.eventsDuplicates,
        eventsRetried: report.totals.eventsRetried,
        eventsDeadLettered: report.totals.eventsDeadLettered,
        jobsClaimed: report.totals.jobsClaimed,
        jobsCompleted: report.totals.jobsCompleted,
        jobsRetried: report.totals.jobsRetried,
        jobsFailed: report.totals.jobsFailed,
      };
    });

    /* C4 — PAIEMENTS SIMULTANÉS (après matérialisation des paiements dus) ---- */
    const paymentChains: ContractChain[] = [];
    await check('C4 paiements simultanés sous charge : deux déclarations de salaire concurrentes → une seule tentative', async () => {
      // Chaînes dédiées + drain ciblé JUSQU'À ce que leurs paiements M1 soient
      // réellement DUE (matérialisation par le handler d'activation, puis
      // balayage SCHEDULED → DUE du worker existant).
      for (let index = 0; index < 7; index += 1) {
        paymentChains.push(await chainFor(57 + index, `race-c4-${String(index + 1).padStart(2, '0')}`));
      }
      for (const chain of paymentChains) {
        let ready = false;
        for (let pass = 0; pass < 15 && !ready; pass += 1) {
          await harness.automationWorker.runScheduledCycle({ limit: 100, trigger: 'race-c4-prep' });
          const paymentRow = firstRow(await sql(
            harness,
            `SELECT status FROM payments WHERE contract_id=$1 AND payment_type='SALARY' AND month_number=1`,
            [chain.contractId],
          ));
          ready = paymentRow?.status === 'DUE';
        }
        const paymentRow = firstRow(await sql(
          harness,
          `SELECT status FROM payments WHERE contract_id=$1 AND payment_type='SALARY' AND month_number=1`,
          [chain.contractId],
        ));
        assert(paymentRow?.status === 'DUE', `paiement M1 DUE attendu pour ${chain.contractId}, reçu ${paymentRow?.status}`);
      }
      let declared201 = 0;
      let conflicts409 = 0;
      for (let index = 0; index < paymentChains.length; index += 1) {
        const chain = paymentChains[index];
        const paymentRow = firstRow(await sql(
          harness,
          `SELECT id, status FROM payments WHERE contract_id=$1 AND payment_type='SALARY' AND month_number=1`,
          [chain.contractId],
        ));
        assert(paymentRow?.status === 'DUE', `paiement M1 DUE attendu, reçu ${paymentRow?.status}`);
        const paymentId = asText(paymentRow!.id);
        const outcome = await race(
          chain.journeyId, 'race.payment.salary.declare', 'payments.salary.declare', 'POST',
          '/api/v1/payments/salary-declarations',
          [
            { path: '/api/v1/payments/salary-declarations', token: chain.session.employerToken, init: jsonInit({ paymentId, reference: `RACE-C4-A-${index}` }, `race-c4-a-${index}`) },
            { path: '/api/v1/payments/salary-declarations', token: chain.session.employerToken, init: jsonInit({ paymentId, reference: `RACE-C4-B-${index}` }, `race-c4-b-${index}`) },
          ],
          [201, 409],
        );
        const ok = outcome.statuses.filter(status => status === 201).length;
        declared201 += ok;
        conflicts409 += outcome.statuses.filter(status => status === 409).length;
        assert(ok === 1, `une déclaration acceptée, reçu ${outcome.statuses.join('/')}`);
        const declarations = await countRows(harness, 'SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id=$1', [paymentId]);
        assert(declarations === 1, `une seule tentative en base, reçu ${declarations}`);
        const after = firstRow(await sql(harness, 'SELECT status, declaration_count FROM payments WHERE id=$1', [paymentId]));
        assert(after?.status === 'PENDING_VERIFICATION' && Number(after?.declaration_count) === 1, `état cohérent après course, reçu ${after?.status}/${after?.declaration_count}`);
      }
      assert(declared201 === 7 && conflicts409 === 7, `7 gagnantes / 7 refusées, reçu ${declared201}/${conflicts409}`);

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        paiementsSimultanes: { pairs: 7, declared201, conflicts409, doubleTentatives: 0 },
      };
    });

    /* C5 — REMPLACEMENTS SIMULTANÉS ----------------------------------------- */
    await check('C5 remplacements simultanés sous charge : deux décisions REPLACE concurrentes → un seul dossier, aucune double réputation', async () => {
      const admin = await provisionAdmin(harness, 'race-c5');
      let replaced = 0;
      for (let index = 0; index < 2; index += 1) {
        const chain = await chainFor(64 + index, `race-c5-${index}`);
        const claimResult = await request(
          chain.journeyId, 'race.claim.create', 'claims.create', 'POST', '/api/v1/claims',
          '/api/v1/claims', chain.session.candidateToken,
          jsonInit({ contractId: chain.contractId, type: 'CONTRACT_INCIDENT', reason: 'Incident synthétique PARTIE 2 (course de remplacement).' }, `race-c5-claim-${index}`),
          [201],
        );
        const claimId = asText(claimResult?.json?.claimId);
        assert(claimId.length > 0, 'claim créé');
        await request(
          chain.journeyId, 'race.claim.review', 'admin.claims.review', 'POST', '/api/v1/admin/claims/:claimId/review',
          `/api/v1/admin/claims/${claimId}/review`, admin.token,
          jsonInit({ note: 'Revue synthétique PARTIE 2.' }, `race-c5-review-${index}`),
          [200],
        );
        const outcome = await race(
          chain.journeyId, 'race.claim.decision', 'admin.claims.decision', 'POST',
          '/api/v1/admin/claims/:claimId/decision',
          [0, 1].map(lane => ({
            path: `/api/v1/admin/claims/${claimId}/decision`,
            token: admin.token,
            init: jsonInit({ decision: 'REPLACE', resolution: 'Remplacement synthétique PARTIE 2.' }, `race-c5-dec-${index}-${lane}`),
          })),
          [200, 409],
        );
        const ok = outcome.statuses.filter(status => status === 200).length;
        assert(ok === 1, `une seule décision REPLACE gagnante, reçu ${outcome.statuses.join('/')}`);
        const replacementCount = await countRows(harness, 'SELECT count(*)::text AS count FROM replacements WHERE original_contract_id=$1', [chain.contractId]);
        assert(replacementCount === 1, `un seul dossier de remplacement, reçu ${replacementCount}`);
        const source = firstRow(await sql(harness, 'SELECT status FROM contracts WHERE id=$1', [chain.contractId]));
        assert(source?.status === 'REPLACED', `contrat source REPLACED une fois, reçu ${source?.status}`);
        replaced += 1;
        // CLAIM_RESOLVED exactement une fois → réputation sans doublon (2 règles :
        // CLAIMANT favorable + RESPONDENT défavorable) après drain des événements.
        await drainAutomationQueue(harness, { limitPerPass: 100, maxPasses: 40, budgetMs: 120_000, trigger: 'race-c5-drain' });
        const resolvedEvents = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id=$1 AND event_type='CLAIM_RESOLVED'`, [claimId]);
        assert(resolvedEvents === 1, `un seul événement CLAIM_RESOLVED, reçu ${resolvedEvents}`);
        const reputationEntries = await countRows(harness, 'SELECT count(*)::text AS count FROM reputation_entries WHERE source_entity_id=$1', [claimId]);
        assert(reputationEntries >= 1 && reputationEntries <= 2, `réputation documentée une fois par règle (${reputationEntries} entrées)`);
      }
      assert(replaced === 2, 'les deux courses de remplacement sont convergées');

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        remplacementsSimultanes: { pairs: 2, replaced, doubleReplacements: 0 },
      };
    });

    /* C6 — WEBRTC SIMULTANÉ --------------------------------------------------- */
    await check('C6 WebRTC simultané sous charge : créations/join/signaling/fermetures concurrentes, expiration et purge', async () => {
      const webrtcRepository = harness.composition.webrtc;
      assert(webrtcRepository !== undefined, 'repository WebRTC composé');
      for (let index = 0; index < 2; index += 1) {
        const chain = await chainFor(66 + index, `race-c6-${index}`);
        const contractId = chain.contractId!;
        // Créations CONCURRENTES par les deux parties (clés différentes) :
        // une seule session arbitrée (201 + 422), jamais deux lignes.
        const createOutcome = await race(
          chain.journeyId, 'race.webrtc.session.create', 'webrtc.sessions.create', 'POST',
          '/api/v1/webrtc-sessions',
          [
            { path: '/api/v1/webrtc-sessions', token: chain.session.employerToken, init: jsonInit({ entityType: 'CONTRACT', entityId: contractId }, `race-c6-emp-${index}`) },
            { path: '/api/v1/webrtc-sessions', token: chain.session.candidateToken, init: jsonInit({ entityType: 'CONTRACT', entityId: contractId }, `race-c6-can-${index}`) },
          ],
          [201, 422],
        );
        const created201 = createOutcome.statuses.filter(status => status === 201).length;
        assert(created201 === 1, `une seule création gagnante, reçu ${createOutcome.statuses.join('/')}`);
        const sessionCount = await countRows(harness, 'SELECT count(*)::text AS count FROM webrtc_sessions WHERE entity_id=$1', [contractId]);
        assert(sessionCount === 1, `une seule session persistée, reçu ${sessionCount}`);
        const winnerBody = createOutcome.bodies.find(body => body?.sessionId) ?? null;
        const sessionId = asText(winnerBody?.sessionId);
        assert(sessionId.length > 0, 'identifiant de session renvoyé');

        // Join de l'invité (idempotent) puis credentials des deux parties.
        const join = await request(
          chain.journeyId, 'race.webrtc.join', 'webrtc.sessions.join', 'POST',
          '/api/v1/webrtc-sessions/:sessionId/join', `/api/v1/webrtc-sessions/${sessionId}/join`,
          chain.session.candidateToken, jsonInit({}), [200],
        );
        assert(join !== null, 'join 200');
        const employerCredential = await request(
          chain.journeyId, 'race.webrtc.credentials', 'webrtc.sessions.credentials.create', 'POST',
          '/api/v1/webrtc-sessions/:sessionId/credentials', `/api/v1/webrtc-sessions/${sessionId}/credentials`,
          chain.session.employerToken, jsonInit({}), [201],
        );
        const candidateCredential = await request(
          chain.journeyId, 'race.webrtc.credentials', 'webrtc.sessions.credentials.create', 'POST',
          '/api/v1/webrtc-sessions/:sessionId/credentials', `/api/v1/webrtc-sessions/${sessionId}/credentials`,
          chain.session.candidateToken, jsonInit({}), [201],
        );
        assert(employerCredential !== null && candidateCredential !== null, 'credentials émis');
        const employerOtp = asText(employerCredential!.json?.credential);
        const candidateOtp = asText(candidateCredential!.json?.credential);

        // Signaling : OFFER + rejeu CONCURRENT de la même clé → même message, jamais dupliqué.
        const offerInit = (key: string): RequestInit => jsonInit(
          { type: 'OFFER', payload: { sdp: 'v=0\r\no=- race-offer' } },
          key,
          { 'X-WebRTC-Credential': employerOtp },
        );
        const signalingOutcome = await race(
          chain.journeyId, 'race.webrtc.signaling', 'webrtc.sessions.signaling.send', 'POST',
          '/api/v1/webrtc-sessions/:sessionId/signaling',
          [0, 1].map(() => ({
            path: `/api/v1/webrtc-sessions/${sessionId}/signaling`,
            token: chain.session.employerToken,
            init: offerInit(`race-c6-offer-${index}-replay`),
          })),
          [201],
        );
        assert(signalOutcomesOk(signalingOutcome.statuses), `rejeu signalé 201/201, reçu ${signalingOutcome.statuses.join('/')}`);
        const messageIds = signalingOutcome.bodies.map(body => asText(body?.messageId));
        assert(messageIds[0] === messageIds[1] && messageIds[0].length > 0, 'le rejeu renvoie le MÊME message (jamais dupliqué)');
        const offerMessages = await countRows(
          harness,
          `SELECT count(*)::text AS count FROM webrtc_signaling_messages WHERE session_id=$1 AND message_type='OFFER'`,
          [sessionId],
        );
        assert(offerMessages === 1, `une seule OFFER persistée, reçu ${offerMessages}`);

        // Fermetures CONCURRENTES (clés différentes) : idempotes, UNE clôture.
        const closeOutcome = await race(
          chain.journeyId, 'race.webrtc.close', 'webrtc.sessions.close', 'POST',
          '/api/v1/webrtc-sessions/:sessionId/close',
          [0, 1].map(lane => ({
            path: `/api/v1/webrtc-sessions/${sessionId}/close`,
            token: chain.session.candidateToken,
            init: jsonInit({}, `race-c6-close-${index}-${lane}`),
          })),
          [200],
        );
        assert(signalOutcomesOk(closeOutcome.statuses), `fermetures concurrentes 200/200, reçu ${closeOutcome.statuses.join('/')}`);
        const closedRow = firstRow(await sql(harness, 'SELECT status FROM webrtc_sessions WHERE session_id=$1', [sessionId]));
        assert(closedRow?.status === 'CLOSED', `session CLOSED une fois, reçu ${closedRow?.status}`);
        const revoked = await countRows(
          harness,
          'SELECT count(*)::text AS count FROM webrtc_session_credentials WHERE session_id=$1 AND revoked_at IS NOT NULL',
          [sessionId],
        );
        assert(revoked >= 2, `credentials révoqués à la clôture, reçu ${revoked}`);
        void candidateOtp;
      }

      // Expiration : horloge avancée à l'échéance exacte → EXPIRED à la lecture,
      // échec fermé des opérations, purge par la maintenance bornée existante.
      const chain = await chainFor(68, 'race-c6-expiry');
      const created = await request(
        chain.journeyId, 'race.webrtc.session.create', 'webrtc.sessions.create', 'POST',
        '/api/v1/webrtc-sessions', '/api/v1/webrtc-sessions',
        chain.session.employerToken, jsonInit({ entityType: 'CONTRACT', entityId: chain.contractId }, 'race-c6-expiry-create'),
        [201],
      );
      const expiresAt = asText(created?.json?.expiresAt);
      assert(expiresAt.length > 0, 'expiration courte renvoyée');
      const expirySessionId = asText(created?.json?.sessionId);
      harness.clock.value = new Date(Date.parse(expiresAt) + 1);
      const expiredRead = await request(
        chain.journeyId, 'race.webrtc.read.expired', 'webrtc.sessions.read', 'GET',
        `/api/v1/webrtc-sessions/:sessionId`, `/api/v1/webrtc-sessions/${expirySessionId}`,
        chain.session.employerToken, { method: 'GET' }, [200],
      );
      assert(asText(expiredRead?.json?.status) === 'EXPIRED', `session expirée échoue fermée à la lecture, reçu ${asText(expiredRead?.json?.status)}`);
      const maintenance = await webrtcRepository!.runScheduledMaintenance();
      assert(maintenance.purged >= 1, `maintenance bornée purge la session expirée, reçu ${maintenance.purged}`);
      const purged = await countRows(harness, 'SELECT count(*)::text AS count FROM webrtc_sessions WHERE session_id=$1', [expirySessionId]);
      assert(purged === 0, 'métadonnées purgées');

      // Notifications d'invitation : exactement UNE par session après drain.
      await drainAutomationQueue(harness, { limitPerPass: 100, maxPasses: 40, budgetMs: 120_000, trigger: 'race-c6-drain' });
      const invitations = await countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE event_type='WEBRTC_SESSION_INVITED'`);
      assert(invitations === 3, `3 invitations (2 courses + 1 expiration), reçu ${invitations}`);
      const inviteNotifications = await countRows(harness, `SELECT count(*)::text AS count FROM notifications WHERE type='INCOMING_CALL'`);
      assert(inviteNotifications === invitations, `aucune double notification d'invitation (${inviteNotifications} pour ${invitations} événements)`);

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        webrtcSimultane: { sessionsRaced: 2, doubleSessions: 0, doubleOffers: 0, expiredPurged: maintenance.purged, invitationNotifications: inviteNotifications },
      };
    });

    /* Invariants transverses : notifications sans doublons sur les courses -- */
    await check('invariants transverses : aucune double notification pour les événements des courses C1/C2 (1 événement = 1 notification)', async () => {
      // Chaque événement de course (APPLICATION_SHORTLISTED / REJECTED /
      // PROPOSAL_ACCEPTED / DECLINED) doit produire EXACTEMENT une notification
      // par destinataire — la clé (recipientId, dedupeKey) est unique : comptage
      // 1:1 événements ↔ notifications, agrégat par agrégat.
      const eventCount = async (aggregateId: string, types: readonly string[]): Promise<number> =>
        countRows(harness, `SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id=$1 AND event_type = ANY($2)`, [aggregateId, [...types]]);
      const notificationCount = async (keys: readonly string[]): Promise<number> =>
        countRows(harness, `SELECT count(*)::text AS count FROM notifications WHERE dedupe_key = ANY($1)`, [[...keys]]);

      let decisionEvents = 0;
      let decisionNotifications = 0;
      for (const chain of [...mixedChains, ...rejectChains]) {
        const events = await eventCount(chain.applicationId!, ['APPLICATION_SHORTLISTED', 'APPLICATION_REJECTED']);
        const notifications = await notificationCount([
          `application:${chain.applicationId}:SHORTLISTED`,
          `application:${chain.applicationId}:REJECTED`,
        ]);
        assert(notifications === events, `1:1 notifications/événements pour ${chain.applicationId} (${notifications}/${events})`);
        decisionEvents += events;
        decisionNotifications += notifications;
      }
      let proposalEventsTotal = 0;
      let proposalNotificationsTotal = 0;
      for (const chain of proposalChains) {
        const events = await eventCount(chain.proposalId!, ['PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED']);
        const notifications = await notificationCount([
          `proposal:${chain.proposalId}:ACCEPTED`,
          `proposal:${chain.proposalId}:DECLINED`,
        ]);
        assert(notifications === events, `1:1 notifications/événements pour ${chain.proposalId} (${notifications}/${events})`);
        proposalEventsTotal += events;
        proposalNotificationsTotal += notifications;
      }
      assert(decisionEvents === decisionNotifications, `aucune double notification de décision (${decisionNotifications}/${decisionEvents})`);
      assert(proposalEventsTotal === proposalNotificationsTotal, `aucune double notification de proposition (${proposalNotificationsTotal}/${proposalEventsTotal})`);

      measurements.races = {
        ...(measurements.races as Record<string, unknown>),
        notificationsSansDoublon: { decisionEvents, decisionNotifications, proposalEvents: proposalEventsTotal, proposalNotifications: proposalNotificationsTotal },
      };
    });

    /* Attente de la charge de fond + mesures -------------------------------- */
    const backgroundRun = await backgroundLoad!;
    backgroundLoad = null;
    const backgroundStats = aggregateStats(backgroundRun.samples);
    const backgroundCompleted = backgroundRun.outcomes.filter(outcome => outcome.completed).length;
    measurements.backgroundLoad = {
      pairs: backgroundPairs.length,
      journeysStarted: backgroundRun.outcomes.length,
      journeysCompleted: backgroundCompleted,
      requests: backgroundStats.count,
      ok: backgroundStats.ok,
      errors: backgroundStats.errors,
      timeouts: backgroundStats.timeouts,
      durationMs: backgroundRun.durationMs,
      p50Ms: backgroundStats.p50Ms,
      p95Ms: backgroundStats.p95Ms,
      p99Ms: backgroundStats.p99Ms,
    };
  } finally {
    // La charge de fond ne doit jamais fuir sur un échec de suite.
    if (backgroundLoad) {
      try {
        await backgroundLoad;
      } catch {
        /* déjà capturée par la sortie d'erreur de la suite */
      }
    }
    await harness.close();
  }

  const passed = results.filter(result => result.success).length;
  return {
    suite: 'concurrency',
    mission: 'P0-LOAD-TESTS-2',
    label: 'P0-LOAD-TESTS-2 concurrence métier sous charge — décisions, ACCEPT/DECLINE, confirmations, paiements, remplacements, WebRTC, double Cron/worker',
    startedAtIso,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    businessClockIso: LOAD_BUSINESS_CLOCK_ISO,
    scale: {
      usersSynthetic,
      backgroundPairs: 40,
      racePairs: usersSynthetic / 2 - 40,
    },
    summary: { checks: results.length, passed, failed: results.length - passed },
    results,
    measurements,
    samples,
  };
}

function signalOutcomesOk(statuses: number[]): boolean {
  return statuses.length > 0 && statuses.every(status => status === 200 || status === 201);
}
