/**
 * P0-LOAD-TESTS — suite de CONCURRENCE MÉTIER.
 *
 * Chaque cas rejoue une course réelle (requêtes HTTP concurrentes, clés
 * d'idempotence DISTINCTES) plusieurs vagues de suite, puis vérifie
 * l'invariant d'intégrité en base :
 *
 *   - deux candidatures simultanées        → 1 ligne, le perdant refusé ;
 *   - deux décisions simultanées           → exactement 1 gagnant ;
 *   - acceptation/refus simultanés         → exactement 1 gagnant ;
 *   - activation simultanée                → 1 seul CONTRACT_ACTIVATED ;
 *   - deux confirmations d'exécution       → statut stable, mesure des
 *                                             entrées d'historique ;
 *   - deux paiements (déclarations)        → 1 déclaration, 1 victoire ;
 *   - deux remplacements (REPLACE)         → 1 dossier ;
 *   - deux Cron simultanés                 → aucun double effet métier ;
 *   - deux workers simultanés              → chaque événement traité 1 fois ;
 *   - deux appels WebRTC concurrents       → 1 session.
 *
 * Aucune écriture hors de la base de test, aucun paiement réel.
 */

import { composeWorker } from '../../src/backend/api/entry';
import { createLoadHarness, drainUntilContractActivated, ltRequest, sweepUntilSalaryDue, type LoadHarness } from './harness';

export interface ConflictCaseResult {
  name: string;
  waves: number;
  attempts: number;
  successes: number;
  expectedRejections: number;
  invariantViolations: number;
  details: string[];
  meanWaveMs: number;
  ok: boolean;
}

export interface ConflictSuiteResult {
  cases: ConflictCaseResult[];
  ok: boolean;
}

interface Session {
  token: string;
  userId: string;
}

async function jsonOf(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (response.status >= 400) {
    throw new Error(`${response.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

async function post(
  harness: LoadHarness,
  path: string,
  token: string,
  idempotencyKey: string,
  body: unknown,
  userIndex?: number,
): Promise<Response> {
  return harness.worker.fetch(ltRequest(path, {
    token,
    idempotencyKey,
    body,
    ...(userIndex !== undefined ? { userIndex } : {}),
  }));
}

/** Session d'un pair (unit index identique aux scénarios). */
async function loginPair(harness: LoadHarness, unit: number): Promise<{ employer: Session; candidate: Session }> {
  const employerActor = await harness.actorFor('EMPLOYER', unit * 2);
  const candidateActor = await harness.actorFor('CANDIDATE', unit * 2 + 1);
  const [employer, candidate] = await Promise.all([
    harness.login(employerActor),
    harness.login(candidateActor),
  ]);
  return { employer, candidate };
}

const OFFER_BODY = (tag: string) => ({
  title: `Offre conflit ${tag}`,
  contractType: 'CDI',
  remuneration: 300_000,
  currency: 'FCFA',
  location: 'Cotonou',
  departmentId: 'littoral',
  skills: ['Gestion'],
  summary: `Scénario de concurrence ${tag}.`,
  responsibilities: ['Exécuter la mission'],
  conditions: ['Temps plein'],
  selectionProcess: ['Entretien'],
  durationMonths: 4,
});

const PROPOSAL_BODY = (offerId: string, applicationId: string, tag: string) => ({
  offerId,
  applicationId,
  missionTitle: `Mission conflit ${tag}`,
  amount: 150_000,
  currency: 'FCFA',
  periodicity: 'Mensuel',
  startDate: '01 Septembre 2026',
  durationMonths: 4,
  location: 'Cotonou',
  conditions: ['Temps plein'],
});

interface SetupResult {
  offerId: string;
  applicationId?: string;
  proposalId?: string;
  contractId?: string;
  salaryPaymentId?: string;
  claimId?: string;
}

/**
 * Amène un pair jusqu'à l'état requis (HTTP réel, mêmes règles que les
 * scénarios), puis laisse la course se faire sur l'étape ciblée.
 */
export async function setup(
  harness: LoadHarness,
  unit: number,
  target: 'application' | 'shortlisted' | 'proposal' | 'proposal-accepted' | 'contract-draft' | 'contract-active' | 'materialized' | 'due-payment' | 'claim',
  tag: string,
): Promise<SetupResult> {
  const sessions = await loginPair(harness, unit);
  const eu = unit * 2;
  const cu = unit * 2 + 1;

  const offer = await jsonOf(await post(
    harness, '/api/v1/offers', sessions.employer.token, `cf-${tag}-offer`, OFFER_BODY(tag), eu,
  ));
  const offerId = String(offer.id);
  const result: SetupResult = { offerId };
  if (target === 'application') return result;

  const application = await jsonOf(await post(
    harness, `/api/v1/offers/${offerId}/applications`, sessions.candidate.token, `cf-${tag}-apply`, {}, cu,
  ));
  result.applicationId = String(application.id);

  if (target === 'shortlisted' || target === 'proposal' || target === 'proposal-accepted'
    || target === 'contract-active' || target === 'materialized' || target === 'due-payment' || target === 'claim') {
    await jsonOf(await post(
      harness, `/api/v1/applications/${result.applicationId}/examine`, sessions.employer.token, `cf-${tag}-exam`, {}, eu,
    ));
    await jsonOf(await post(
      harness, `/api/v1/applications/${result.applicationId}/shortlist`, sessions.employer.token, `cf-${tag}-short`, {}, eu,
    ));
  }
  if (target === 'shortlisted') return result;

  const proposal = await jsonOf(await post(
    harness, `/api/v1/conversations/cnv-${tag}/proposals`, sessions.employer.token, `cf-${tag}-prop`,
    PROPOSAL_BODY(offerId, result.applicationId, tag), eu,
  ));
  result.proposalId = String(proposal.id);
  if (target === 'proposal') return result;

  await jsonOf(await post(
    harness, `/api/v1/proposals/${result.proposalId}/respond`, sessions.candidate.token, `cf-${tag}-resp`,
    { action: 'ACCEPT' }, cu,
  ));
  if (target === 'proposal-accepted') return result;

  const contract = await jsonOf(await post(
    harness, '/api/v1/contracts', sessions.employer.token, `cf-${tag}-ctr`, { proposalId: result.proposalId }, eu,
  ));
  result.contractId = String(contract.id);
  if (target === 'contract-draft') return result;
  await jsonOf(await post(harness, `/api/v1/contracts/${result.contractId}/send`, sessions.employer.token, `cf-${tag}-send`, {}, eu));
  await jsonOf(await post(harness, `/api/v1/contracts/${result.contractId}/sign`, sessions.candidate.token, `cf-${tag}-sign`, {}, cu));
  await jsonOf(await post(harness, `/api/v1/contracts/${result.contractId}/activate`, sessions.employer.token, `cf-${tag}-act`, {}, eu));
  if (target === 'contract-active') return result;

  await drainUntilContractActivated(harness, result.contractId);
  await jsonOf(await post(
    harness, `/api/v1/contracts/${result.contractId}/payments/advance-month`, sessions.employer.token, `cf-${tag}-adv`, {}, eu,
  ));
  await harness.composition.payments?.materializePaymentsForContract(result.contractId);
  if (target === 'materialized') return result;
  await sweepUntilSalaryDue(harness, result.contractId);

  const payments = await harness.database.query<{ id: string }>(
    `SELECT id FROM payments WHERE contract_id = $1 AND payment_type = 'SALARY' AND status = 'DUE'
      ORDER BY month_number LIMIT 1`,
    [result.contractId],
  );
  if (payments.rows[0]) result.salaryPaymentId = payments.rows[0].id;
  if (target === 'due-payment') return result;

  if (target === 'claim') {
    const claim = await jsonOf(await post(
      harness, '/api/v1/claims', sessions.candidate.token, `cf-${tag}-claim`,
      { contractId: result.contractId, type: 'CONTRACT_INCIDENT', reason: `Incident ${tag}` }, cu,
    ));
    result.claimId = String(claim.claimId);
  }
  return result;
}

interface WaveOutcome {
  statuses: number[];
  bodies: unknown[];
  ms: number;
}

async function raceWave(requests: Request[], harness: LoadHarness): Promise<WaveOutcome> {
  const started = performance.now();
  const responses = await Promise.all(requests.map(request => harness.worker.fetch(request)));
  const statuses: number[] = [];
  const bodies: unknown[] = [];
  for (const response of responses) {
    const text = await response.text();
    try {
      bodies.push(text ? JSON.parse(text) : null);
    } catch {
      bodies.push(null);
    }
    statuses.push(response.status);
  }
  return { statuses, bodies, ms: performance.now() - started };
}

function newCase(name: string): ConflictCaseResult {
  return {
    name,
    waves: 0,
    attempts: 0,
    successes: 0,
    expectedRejections: 0,
    invariantViolations: 0,
    details: [],
    meanWaveMs: 0,
    ok: true,
  };
}

function finalize(result: ConflictCaseResult, totalMs: number): ConflictCaseResult {
  result.meanWaveMs = result.waves > 0 ? Math.round((totalMs / result.waves) * 100) / 100 : 0;
  result.ok = result.invariantViolations === 0;
  return result;
}

export interface ConflictSuiteOptions {
  waves?: number;
  unitBase?: number;
}

export async function runConflictSuite(options: ConflictSuiteOptions = {}): Promise<ConflictSuiteResult> {
  const waves = options.waves ?? 15;
  const harness = await createLoadHarness();
  const admin = await harness.provisionAdmin('Admin Conflits');
  const cases: ConflictCaseResult[] = [];
  let unit = options.unitBase ?? 90_000;
  const nextUnit = (): number => {
    unit += 1;
    return unit;
  };

  try {
    /* 1 — deux candidatures simultanées (même candidat, mêmes clés différentes) */
    {
      const result = newCase('applications.double-submit');
      let totalMs = 0;
      for (let wave = 0; wave < waves; wave += 1) {
        const tag = `dupapp-${wave}`;
        const u = nextUnit();
        const sessions = await loginPair(harness, u);
        const offer = await jsonOf(await post(harness, '/api/v1/offers', sessions.employer.token, `cf-${tag}-offer`, OFFER_BODY(tag), u * 2));
        const offerId = String(offer.id);
        const outcome = await raceWave([
          ltRequest(`/api/v1/offers/${offerId}/applications`, {
            token: sessions.candidate.token, idempotencyKey: `cf-${tag}-a`, body: {}, userIndex: u * 2 + 1,
          }),
          ltRequest(`/api/v1/offers/${offerId}/applications`, {
            token: sessions.candidate.token, idempotencyKey: `cf-${tag}-b`, body: {}, userIndex: u * 2 + 1,
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        const successes = outcome.statuses.filter(status => status === 201).length;
        result.successes += successes;
        result.expectedRejections += outcome.statuses.filter(status => status === 409 || status === 400).length;
        const rows = await harness.database.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM applications WHERE offer_id = $1', [offerId],
        );
        // Les deux réponses 201 peuvent retourner la MÊME candidature (le
        // serveur arbitre l'unicité (offre, candidat)) : c'est la base qui
        // qui doit contenir UNE ligne et UNE seule création réelle.
        const createdIds = new Set(
          outcome.bodies
            .filter((_, index) => outcome.statuses[index] === 201)
            .map(body => String((body as { id?: string } | null)?.id ?? '')),
        );
        const rowCount = Number(rows.rows[0].count);
        if (rowCount !== 1 || createdIds.size !== 1 || successes < 1) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(`vague ${wave}: succès=${successes}, lignes=${rowCount}, ids=${[...createdIds].join('/') || 'aucun'}, statuts=${outcome.statuses.join('/')}`);
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 2 — deux décisions simultanées (reject employeur vs withdraw candidat) */
    {
      const result = newCase('applications.reject-vs-withdraw');
      let totalMs = 0;
      for (let wave = 0; wave < waves; wave += 1) {
        const tag = `dec-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'shortlisted', tag);
        const sessions = await loginPair(harness, u);
        const outcome = await raceWave([
          ltRequest(`/api/v1/applications/${seeded.applicationId}/reject`, {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-rej`, body: { note: 'Conflit P0' }, userIndex: u * 2,
          }),
          ltRequest(`/api/v1/applications/${seeded.applicationId}/withdraw`, {
            token: sessions.candidate.token, idempotencyKey: `cf-${tag}-wd`, body: {}, userIndex: u * 2 + 1,
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        const winners = outcome.statuses.filter(status => status === 200).length;
        result.successes += winners;
        result.expectedRejections += outcome.statuses.filter(status => status === 409).length;
        const state = await harness.database.query<{ status: string }>(
          'SELECT status FROM applications WHERE id = $1', [seeded.applicationId!],
        );
        const finalStatus = state.rows[0]?.status;
        if (winners !== 1 || (finalStatus !== 'REJECTED' && finalStatus !== 'WITHDRAWN')) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(`vague ${wave}: gagnants=${winners}, statut=${finalStatus}, statuts=${outcome.statuses.join('/')}`);
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 3 — acceptation/refus simultanés sur une proposition */
    {
      const result = newCase('proposals.accept-vs-decline');
      let totalMs = 0;
      for (let wave = 0; wave < waves; wave += 1) {
        const tag = `resp-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'proposal', tag);
        const sessions = await loginPair(harness, u);
        const outcome = await raceWave([
          ltRequest(`/api/v1/proposals/${seeded.proposalId}/respond`, {
            token: sessions.candidate.token, idempotencyKey: `cf-${tag}-acc`, body: { action: 'ACCEPT' }, userIndex: u * 2 + 1,
          }),
          ltRequest(`/api/v1/proposals/${seeded.proposalId}/respond`, {
            token: sessions.candidate.token, idempotencyKey: `cf-${tag}-dec`, body: { action: 'DECLINE' }, userIndex: u * 2 + 1,
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        const winners = outcome.statuses.filter(status => status === 200).length;
        result.successes += winners;
        result.expectedRejections += outcome.statuses.filter(status => status === 409).length;
        const state = await harness.database.query<{ status: string }>(
          'SELECT status FROM proposals WHERE id = $1', [seeded.proposalId!],
        );
        const finalStatus = state.rows[0]?.status;
        if (winners !== 1 || (finalStatus !== 'ACCEPTED' && finalStatus !== 'DECLINED')) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(`vague ${wave}: gagnants=${winners}, statut=${finalStatus}, statuts=${outcome.statuses.join('/')}`);
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 4 — activation simultanée du contrat */
    {
      const result = newCase('contracts.double-activate');
      let totalMs = 0;
      for (let wave = 0; wave < waves; wave += 1) {
        const tag = `act-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'contract-draft', tag);
        const sessions = await loginPair(harness, u);
        // Envoi + signature avant la course sur l'activation.
        await jsonOf(await post(harness, `/api/v1/contracts/${seeded.contractId}/send`, sessions.employer.token, `cf-${tag}-send`, {}, u * 2));
        await jsonOf(await post(harness, `/api/v1/contracts/${seeded.contractId}/sign`, sessions.candidate.token, `cf-${tag}-sign`, {}, u * 2 + 1));
        const outcome = await raceWave([
          ltRequest(`/api/v1/contracts/${seeded.contractId}/activate`, {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-a1`, body: {}, userIndex: u * 2,
          }),
          ltRequest(`/api/v1/contracts/${seeded.contractId}/activate`, {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-a2`, body: {}, userIndex: u * 2,
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        const wins = outcome.statuses.filter(status => status === 200).length;
        result.successes += wins;
        result.expectedRejections += outcome.statuses.filter(status => status === 409 || status === 400).length;
        const [outbox, state] = await Promise.all([
          harness.database.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id = $1 AND event_type = 'CONTRACT_ACTIVATED'",
            [seeded.contractId],
          ),
          harness.database.query<{ status: string; history: Array<{ event: string }> }>(
            'SELECT status, history FROM contracts WHERE id = $1', [seeded.contractId],
          ),
        ]);
        const activatedEvents = Number(outbox.rows[0].count);
        // L'activation API écrit `CONTRACT_ACTIVATED_BILATERAL` dans
        // l'historique (l'événement d'Outbox reste `CONTRACT_ACTIVATED`).
        const activatedHistory = (state.rows[0]?.history ?? [])
          .filter(entry => entry.event === 'CONTRACT_ACTIVATED' || entry.event === 'CONTRACT_ACTIVATED_BILATERAL')
          .length;
        if (state.rows[0]?.status !== 'ACTIVE' || activatedEvents !== 1 || activatedHistory !== 1) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(
              `vague ${wave}: statut=${state.rows[0]?.status}, outbox=${activatedEvents}, historique=${activatedHistory}, réponses=${outcome.statuses.join('/')}`,
            );
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 5 — deux confirmations d'exécution (même acteur, clés distinctes) */
    {
      const result = newCase('contracts.double-confirm-execution');
      let totalMs = 0;
      for (let wave = 0; wave < waves; wave += 1) {
        const tag = `conf-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'contract-active', tag);
        const sessions = await loginPair(harness, u);
        // Incident requis en M1 pour confirmer (règle métier réelle).
        await jsonOf(await post(
          harness, '/api/v1/claims', sessions.candidate.token, `cf-${tag}-claim`,
          { contractId: seeded.contractId, type: 'CONTRACT_INCIDENT', reason: `Incident ${tag}` }, u * 2 + 1,
        ));
        const outcome = await raceWave([
          ltRequest(`/api/v1/contracts/${seeded.contractId}/confirm-execution`, {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-c1`, body: {}, userIndex: u * 2,
          }),
          ltRequest(`/api/v1/contracts/${seeded.contractId}/confirm-execution`, {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-c2`, body: {}, userIndex: u * 2,
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        result.successes += outcome.statuses.filter(status => status === 200).length;
        result.expectedRejections += outcome.statuses.filter(status => status === 409).length;
        const state = await harness.database.query<{ status: string; history: Array<{ event: string }> }>(
          'SELECT status, history FROM contracts WHERE id = $1', [seeded.contractId],
        );
        const confirmations = (state.rows[0]?.history ?? []).filter(entry => entry.event === 'EXECUTION_CONFIRMED').length;
        // Invariant : le statut ne double jamais. Deux entrées pour deux
        // confirmations du MÊME acteur = duplication d'historique (comptée).
        if (state.rows[0]?.status !== 'ACTIVE' || confirmations > 1) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(
              `vague ${wave}: statut=${state.rows[0]?.status}, EXECUTION_CONFIRMED=${confirmations}, réponses=${outcome.statuses.join('/')}`,
            );
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 6 — deux déclarations de paiement simultanées */
    {
      const result = newCase('payments.double-declare');
      let totalMs = 0;
      for (let wave = 0; wave < waves; wave += 1) {
        const tag = `pay-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'due-payment', tag);
        if (!seeded.salaryPaymentId) {
          result.invariantViolations += 1;
          result.details.push(`vague ${wave}: aucun paiement SALARY DUE`);
          continue;
        }
        const sessions = await loginPair(harness, u);
        const outcome = await raceWave([
          ltRequest('/api/v1/payments/salary-declarations', {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-d1`,
            body: { paymentId: seeded.salaryPaymentId, reference: `TX-${tag}-1` }, userIndex: u * 2,
          }),
          ltRequest('/api/v1/payments/salary-declarations', {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-d2`,
            body: { paymentId: seeded.salaryPaymentId, reference: `TX-${tag}-2` }, userIndex: u * 2,
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        const wins = outcome.statuses.filter(status => status === 200 || status === 201).length;
        result.successes += wins;
        result.expectedRejections += outcome.statuses.filter(status => status === 409 || status === 400).length;
        const rows = await harness.database.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id = $1',
          [seeded.salaryPaymentId],
        );
        const declarationRows = Number(rows.rows[0].count);
        if (wins !== 1 || declarationRows !== 1) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(`vague ${wave}: succès=${wins}, déclarations=${declarationRows}, statuts=${outcome.statuses.join('/')}`);
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 7 — deux remplacements simultanés (décision REPLACE ×2) */
    {
      const result = newCase('replacements.double-replace');
      let totalMs = 0;
      const wavesReplacement = Math.max(3, Math.floor(waves / 3));
      for (let wave = 0; wave < wavesReplacement; wave += 1) {
        const tag = `repl-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'claim', tag);
        if (!seeded.claimId) {
          result.invariantViolations += 1;
          result.details.push(`vague ${wave}: claim absent`);
          continue;
        }
        const review = await post(harness, `/api/v1/admin/claims/${seeded.claimId}/review`, admin.token, `cf-${tag}-rev`, { note: 'Revue conflit' });
        await review.text();
        const outcome = await raceWave([
          ltRequest(`/api/v1/admin/claims/${seeded.claimId}/decision`, {
            token: admin.token, idempotencyKey: `cf-${tag}-r1`,
            body: { decision: 'REPLACE', resolution: 'Contrat remplacé (course P0-LOAD-TESTS).' },
          }),
          ltRequest(`/api/v1/admin/claims/${seeded.claimId}/decision`, {
            token: admin.token, idempotencyKey: `cf-${tag}-r2`,
            body: { decision: 'REPLACE', resolution: 'Contrat remplacé (course P0-LOAD-TESTS).' },
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        const wins = outcome.statuses.filter(status => status === 200).length;
        result.successes += wins;
        result.expectedRejections += outcome.statuses.filter(status => status === 409).length;
        const rows = await harness.database.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM replacements WHERE original_contract_id = $1',
          [seeded.contractId],
        );
        const replacements = Number(rows.rows[0].count);
        if (wins !== 1 || replacements !== 1) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(`vague ${wave}: succès=${wins}, dossiers=${replacements}, statuts=${outcome.statuses.join('/')}`);
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 8 — deux Cron simultanés (aucun double effet métier) */
    {
      const result = newCase('cron.double-tick');
      let totalMs = 0;
      const wavesCron = Math.max(3, Math.floor(waves / 3));
      for (let wave = 0; wave < wavesCron; wave += 1) {
        const tag = `cron-${wave}`;
        const u = nextUnit();
        // Paiements matérialisés mais NON balayés : le SCHEDULED → DUE réel
        // doit être produit par le double Cron concurrent.
        await setup(harness, u, 'materialized', tag);
        const started = performance.now();
        const cycle = harness.composition.automationWorker!;
        await Promise.all([
          cycle.runScheduledCycle({ limit: 50, trigger: 'loadtest-cron-a' }),
          cycle.runScheduledCycle({ limit: 50, trigger: 'loadtest-cron-b' }),
        ]);
        totalMs += performance.now() - started;
        result.waves += 1;
        result.attempts += 2;
        result.successes += 2;
        // Invariant : aucun paiement ne reçoit DEUX événements PAYMENT_DUE.
        const globalDupes = await harness.database.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM (
            SELECT aggregate_id FROM automation_outbox WHERE event_type = 'PAYMENT_DUE'
            GROUP BY aggregate_id HAVING count(*) > 1
          ) duplicated`,
        );
        const duplicated = Number(globalDupes.rows[0].count);
        if (duplicated > 0) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(`vague ${wave}: ${duplicated} paiement(s) avec PAYMENT_DUE dupliqué`);
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 9 — deux workers simultanés (chaque événement traité UNE fois) */
    {
      const result = newCase('workers.double-drain');
      let totalMs = 0;
      const wavesDrain = Math.max(3, Math.floor(waves / 5));
      for (let wave = 0; wave < wavesDrain; wave += 1) {
        const tag = `drain-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'contract-active', tag);
        // Backlog : l'outbox contient CONTRACT_ACTIVATED + invitations non drainées.
        const backlog = await harness.database.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM automation_outbox WHERE status = 'PENDING'",
        );
        const pending = Number(backlog.rows[0].count);
        const cycle = harness.composition.automationWorker!;
        const second = composeWorker(
          { GOOGLE_CLIENT_ID: 'p0-load-tests-client.apps.googleusercontent.com', PERSISTENCE: 'postgres', SESSION_TTL_SECONDS: '3600' },
          harness.database,
          { now: () => harness.clock.value },
        );
        const started = performance.now();
        const [reportA, reportB] = await Promise.all([
          cycle.drainEvents(50),
          (second.automationWorker ?? cycle).drainEvents(50),
        ]);
        totalMs += performance.now() - started;
        result.waves += 1;
        result.attempts += 2;
        result.successes += 2;
        void reportA;
        void reportB;
        // Invariant : l'événement CONTRACT_ACTIVATED du contrat source est
        // consommé UNE FOIS (PROCESSED, tentatives bornées) et aucun
        // événement/jobs du contrat ne reste réservé (orophelin) après drain.
        const contractEvents = await harness.database.query<{ status: string; attempts: number }>(
          "SELECT status, attempts FROM automation_outbox WHERE aggregate_id = $1 AND event_type = 'CONTRACT_ACTIVATED'",
          [seeded.contractId],
        );
        const stuck = await harness.database.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM automation_outbox
            WHERE aggregate_id = $1 AND status = 'PROCESSING'`,
          [seeded.contractId],
        );
        const stuckJobs = await harness.database.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM automation_jobs WHERE aggregate_id = $1 AND status = 'RUNNING'",
          [seeded.contractId],
        );
        const activated = contractEvents.rows[0];
        const stuckCount = Number(stuck.rows[0].count) + Number(stuckJobs.rows[0].count);
        if (!activated || activated.status !== 'PROCESSED' || Number(activated.attempts) > 1 || stuckCount > 0) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(
              `vague ${wave}: CONTRACT_ACTIVATED=${activated?.status}/attempts=${activated?.attempts}, bloqués=${stuckCount}`,
            );
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }

    /* 10 — deux appels WebRTC concurrents (une seule session live) */
    {
      const result = newCase('webrtc.double-create-session');
      let totalMs = 0;
      for (let wave = 0; wave < waves; wave += 1) {
        const tag = `wbs-${wave}`;
        const u = nextUnit();
        const seeded = await setup(harness, u, 'contract-active', tag);
        const sessions = await loginPair(harness, u);
        const outcome = await raceWave([
          ltRequest('/api/v1/webrtc-sessions', {
            token: sessions.employer.token, idempotencyKey: `cf-${tag}-w1`,
            body: { entityType: 'CONTRACT', entityId: seeded.contractId }, userIndex: u * 2,
          }),
          ltRequest('/api/v1/webrtc-sessions', {
            token: sessions.candidate.token, idempotencyKey: `cf-${tag}-w2`,
            body: { entityType: 'CONTRACT', entityId: seeded.contractId }, userIndex: u * 2 + 1,
          }),
        ], harness);
        totalMs += outcome.ms;
        result.waves += 1;
        result.attempts += 2;
        const wins = outcome.statuses.filter(status => status === 201).length;
        result.successes += wins;
        result.expectedRejections += outcome.statuses.filter(status => status === 422 || status === 409).length;
        const rows = await harness.database.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM webrtc_sessions WHERE entity_id = $1',
          [seeded.contractId],
        );
        const sessionsCount = Number(rows.rows[0].count);
        if (wins !== 1 || sessionsCount !== 1) {
          result.invariantViolations += 1;
          if (result.details.length < 5) {
            result.details.push(`vague ${wave}: succès=${wins}, sessions=${sessionsCount}, statuts=${outcome.statuses.join('/')}`);
          }
        }
      }
      cases.push(finalize(result, totalMs));
    }
  } finally {
    await harness.close();
  }

  return { cases, ok: cases.every(item => item.ok) };
}

export type { ConflictCaseResult as ConflictCase };
