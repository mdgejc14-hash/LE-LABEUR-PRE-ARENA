/**
 * P0-LOAD-TESTS — parcours métier exécutés sous charge.
 *
 * Chaque « unité de parcours » = un pair (EMPLOYER + CANDIDATE) connectés qui
 * exécutent le cycle réel via les routes HTTP existantes, plus les quelques
 * appels de service déjà utilisés par les suites (drain d'automatisation,
 * matérialisation des paiements) — jamais d'écriture SQL directe de domaine.
 *
 * Profils :
 *   - `full` : les 18 familles de parcours (auth, offres, qualification,
 *     matching, candidatures, propositions, contrats, finalisation,
 *     exécution, paiements/déclarations, litiges, remplacement*, réputation,
 *     notifications, documents/R2 simulé, cron/queue, WebRTC signaling,
 *     endpoints ADMIN) ;
 *   - `core` : version resserrée pour le scénario 10 000 utilisateurs
 *     simulés (les familles restantes sont couvertes par les scénarios
 *     A/B/C et les suites dédiées).
 *
 * (*) le remplacement complet (claim → décision REPLACE → publication) est
 * chronométré par les suites de concurrence ; le parcours standard ouvre le
 * litige et le fait réviser par l'ADMIN.
 */

import type { LoadHarness } from './harness';
import { drainUntilContractActivated, ltRequest, sweepUntilSalaryDue } from './harness';
import type { LoadMetrics } from './metrics';

export type JourneyProfile = 'full' | 'core';

export interface JourneyContext {
  harness: LoadHarness;
  metrics: LoadMetrics;
  unit: number;
  profile: JourneyProfile;
  adminToken: string;
}

export interface JourneyOutcome {
  ok: boolean;
  failedStep: string;
  detail: string;
  contractId: string;
}

export class JourneyStepError extends Error {
  constructor(
    readonly step: string,
    readonly status: number,
    detail: string,
  ) {
    super(`${step} → ${status}: ${detail}`);
  }
}

interface CallOptions {
  /** Statuts acceptés (défaut : 2xx). */
  accept?: (status: number) => boolean;
  /** Parse la réponse JSON (défaut : true pour mesurer la charge utile). */
  json?: boolean;
}

async function call(
  ctx: JourneyContext,
  step: string,
  path: string,
  options: Parameters<typeof ltRequest>[1] & CallOptions = {},
): Promise<{ status: number; body: unknown; bytes: number }> {
  const request = ltRequest(path, options);
  const started = performance.now();
  const response = await ctx.harness.worker.fetch(request);
  const text = await response.text();
  const durationMs = performance.now() - started;
  const bytes = Buffer.byteLength(text, 'utf8');
  let body: unknown = null;
  if (options.json !== false && text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  const accept = options.accept ?? ((status: number) => status >= 200 && status < 300);
  const ok = accept(response.status);
  ctx.metrics.record(step, { durationMs, status: response.status, ok, bytes });
  if (!ok) {
    throw new JourneyStepError(step, response.status, text.slice(0, 240));
  }
  return { status: response.status, body, bytes };
}

function key(ctx: JourneyContext, step: string): string {
  return `lt-${ctx.profile}-u${ctx.unit}-${step}`;
}

const OFFER_PAYLOAD = (unit: number) => ({
  title: `Mission load-test ${unit}`,
  contractType: 'CDI',
  remuneration: 350_000,
  currency: 'FCFA',
  location: 'Cotonou',
  departmentId: 'littoral',
  skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
  summary: `Parcours de charge P0-LOAD-TESTS numéro ${unit}.`,
  responsibilities: ['Développer les APIs', 'Rédiger les tests'],
  conditions: ['Temps plein', 'Présentiel'],
  selectionProcess: ['Entretien technique'],
  durationMonths: 4,
});

const QUALIFICATION_ANSWERS = {
  serviceNature: 'AUTONOMOUS_DELIVERABLE',
  deliverableDescription: 'Livraison de 20 visuels de campagne finalisés.',
  acceptanceCriteria: '20 fichiers conformes au format et à la charte validés.',
  acceptanceCriteriaObjective: true,
  compensationBasis: 'RESULT_OR_SERVICE',
  providerChoosesMethods: true,
  providerOrganizesTime: true,
  mayServeOtherClients: true,
  mayDeclineWithoutPenalty: true,
  professionalRisk: true,
  disciplinaryPower: false,
  continuousShift: false,
  dailyHierarchicalOrders: false,
  permanentIntegratedPosition: false,
  exclusivityRequired: false,
  exclusivityJustified: null,
  timePlaceConstraint: 'NONE',
  candidateFacingConstraintSummary: '',
  formalities: {
    majorityCheckPlanned: true,
    professionalStatusRequirementsIdentified: true,
    professionalAuthorizationRequired: false,
    professionalAuthorizationCheckPlanned: null,
    taxInvoicingRequirementsIdentified: true,
    insuranceRequired: false,
    insuranceRequirementsIdentified: null,
  },
};

const PROPOSAL_PAYLOAD = (offerId: string, applicationId: string, unit: number) => ({
  offerId,
  applicationId,
  missionTitle: `Mission proposition ${unit}`,
  amount: 160_000,
  currency: 'FCFA',
  periodicity: 'Mensuel',
  // Date antérieure à l'horloge de test (2026-10-05) : les échéances réelles
  // deviennent atteignables pour le balayage SCHEDULED → DUE.
  startDate: '01 Septembre 2026',
  durationMonths: 4,
  location: 'Cotonou',
  conditions: ['Horaires définis par l’employeur et présentés au candidat avant acceptation.'],
});

/** Compteur interne de logins (sérialisés côté appelant). */
let loginCounter = 0;

export interface JourneySessions {
  employerToken: string;
  employerId: string;
  candidateToken: string;
  candidateId: string;
}

/** Authentification des deux parties (2 requêtes réelles). */
export async function loginPair(ctx: JourneyContext): Promise<JourneySessions> {
  const employerIndex = ctx.unit * 2;
  const candidateIndex = ctx.unit * 2 + 1;
  const employerActor = await ctx.harness.actorFor('EMPLOYER', employerIndex);
  const candidateActor = await ctx.harness.actorFor('CANDIDATE', candidateIndex);
  const timedLogin = async (actor: Parameters<LoadHarness['login']>[0], userIndex: number) => {
    const started = performance.now();
    try {
      const result = await ctx.harness.login(actor);
      ctx.metrics.record('auth.login', {
        durationMs: performance.now() - started,
        status: 200,
        ok: true,
        bytes: 0,
      });
      loginCounter += 1;
      return result;
    } catch (error) {
      ctx.metrics.record('auth.login', {
        durationMs: performance.now() - started,
        status: 500,
        ok: false,
        bytes: 0,
      });
      throw error;
    } finally {
      void userIndex;
    }
  };
  const [employer, candidate] = await Promise.all([
    timedLogin(employerActor, employerIndex),
    timedLogin(candidateActor, candidateIndex),
  ]);
  return {
    employerToken: employer.token,
    employerId: employer.userId,
    candidateToken: candidate.token,
    candidateId: candidate.userId,
  };
}

export function journeysStarted(): number {
  return loginCounter;
}

/**
 * Parcours complet : les 18 familles mesurées par étape chronométrée.
 * Échec d'une étape = échec de l'unité (détail conservé pour l'analyse).
 */
export async function runJourney(ctx: JourneyContext): Promise<JourneyOutcome> {
  const failed = (step: string, detail: string): JourneyOutcome => ({
    ok: false,
    failedStep: step,
    detail,
    contractId: '',
  });
  try {
    const sessions = await loginPair(ctx);
    const { employerToken, candidateToken } = sessions;
    const eu = ctx.unit * 2;
    const cu = ctx.unit * 2 + 1;

    // --- 1. session ---
    await call(ctx, 'me.read', '/api/v1/me', { token: employerToken, userIndex: eu });

    // --- 2. création d'offre ---
    const offer = await call(ctx, 'offers.create', '/api/v1/offers', {
      token: employerToken,
      idempotencyKey: key(ctx, 'offer'),
      body: OFFER_PAYLOAD(ctx.unit),
      userIndex: eu,
      accept: status => status === 201,
    });
    const offerId = (offer.body as { id: string }).id;

    // --- 3. qualification + matching ---
    await call(ctx, 'matching.qualification', `/api/v1/offers/${offerId}/qualification`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'qualif'),
      body: { answers: QUALIFICATION_ANSWERS },
      userIndex: eu,
    });
    await call(ctx, 'matching.run', `/api/v1/offers/${offerId}/matching-runs`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'matchrun'),
      body: {},
      userIndex: eu,
      accept: status => status === 200 || status === 201,
    });

    // --- 4. candidature ---
    const application = await call(ctx, 'applications.create', `/api/v1/offers/${offerId}/applications`, {
      token: candidateToken,
      idempotencyKey: key(ctx, 'apply'),
      body: {},
      userIndex: cu,
      accept: status => status === 201,
    });
    const applicationId = (application.body as { id: string }).id;

    // --- 5. décisions employeur ---
    await call(ctx, 'applications.examine', `/api/v1/applications/${applicationId}/examine`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'examine'),
      body: {},
      userIndex: eu,
    });
    await call(ctx, 'applications.shortlist', `/api/v1/applications/${applicationId}/shortlist`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'shortlist'),
      body: {},
      userIndex: eu,
    });

    // --- 6. proposition ---
    const conversationId = `cnv-lt-${ctx.unit}`;
    const proposal = await call(ctx, 'proposals.create', `/api/v1/conversations/${conversationId}/proposals`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'proposal'),
      body: PROPOSAL_PAYLOAD(offerId, applicationId, ctx.unit),
      userIndex: eu,
      accept: status => status === 201,
    });
    const proposalId = (proposal.body as { id: string }).id;

    // --- 7. acceptation candidat ---
    await call(ctx, 'proposals.respond', `/api/v1/proposals/${proposalId}/respond`, {
      token: candidateToken,
      idempotencyKey: key(ctx, 'respond'),
      body: { action: 'ACCEPT' },
      userIndex: cu,
    });

    // --- 8. contrat : création, envoi, signature, activation ---
    const contract = await call(ctx, 'contracts.create', '/api/v1/contracts', {
      token: employerToken,
      idempotencyKey: key(ctx, 'contract'),
      body: { proposalId },
      userIndex: eu,
      accept: status => status === 201,
    });
    const contractId = (contract.body as { id: string }).id;
    await call(ctx, 'contracts.send', `/api/v1/contracts/${contractId}/send`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'send'),
      body: {},
      userIndex: eu,
    });
    await call(ctx, 'contracts.sign', `/api/v1/contracts/${contractId}/sign`, {
      token: candidateToken,
      idempotencyKey: key(ctx, 'sign'),
      body: {},
      userIndex: cu,
    });
    await call(ctx, 'contracts.activate', `/api/v1/contracts/${contractId}/activate`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'activate'),
      body: {},
      userIndex: eu,
    });

    // --- 9. file / automatisation (outbox CONTRACT_ACTIVATED → jobs) ---
    const drainStarted = performance.now();
    const drainReport = await drainUntilContractActivated(ctx.harness, contractId);
    ctx.metrics.record('automation.drain', {
      durationMs: performance.now() - drainStarted,
      status: drainReport ? 200 : 501,
      ok: drainReport,
      bytes: 0,
    });

    if (ctx.profile === 'core') {
      // --- profil resserré (scénario 10 000) : lecture + gouvernance ---
      await call(ctx, 'notifications.list', '/api/v1/my/notifications', { token: candidateToken, userIndex: cu });
      await call(ctx, 'reputation.mine', '/api/v1/my/reputation', { token: candidateToken, userIndex: cu });
      await call(ctx, 'admin.stats', '/api/v1/admin/stats', { token: ctx.adminToken, accept: status => status === 200 });
      return { ok: true, failedStep: '', detail: '', contractId };
    }

    // --- 10. finalisation d'embauche ---
    await call(ctx, 'contracts.finalize-hiring', `/api/v1/contracts/${contractId}/finalize-hiring`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'finalize'),
      body: {},
      userIndex: eu,
    });

    // --- 11. litige ouvert AVANT la confirmation M1 (règle réelle : la
    // confirmation de fin d'exécution pendant M1 exige un incident signalé) ---
    const claim = await call(ctx, 'claims.create', '/api/v1/claims', {
      token: candidateToken,
      idempotencyKey: key(ctx, 'claim'),
      body: {
        contractId,
        type: 'CONTRACT_INCIDENT',
        reason: `Incident de charge ${ctx.unit}.`,
      },
      userIndex: cu,
      accept: status => status === 201,
    });
    const claimId = (claim.body as { claimId: string }).claimId;
    await call(ctx, 'admin.claims.review', `/api/v1/admin/claims/${claimId}/review`, {
      token: ctx.adminToken,
      idempotencyKey: key(ctx, 'review'),
      body: { note: 'Revue sous charge P0-LOAD-TESTS.' },
      accept: status => status === 200,
    });

    // --- 12. exécution / confirmation ---
    await call(ctx, 'contracts.confirm-execution', `/api/v1/contracts/${contractId}/confirm-execution`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'confirm'),
      body: {},
      userIndex: eu,
    });

    // --- 13. paiements : échéancier réel, échéance, déclaration, ADMIN ---
    await call(ctx, 'payments.advance-month', `/api/v1/contracts/${contractId}/payments/advance-month`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'advance'),
      body: {},
      userIndex: eu,
    });
    const materializeStarted = performance.now();
    const materialized = await ctx.harness.composition.payments?.materializePaymentsForContract(contractId);
    ctx.metrics.record('payments.materialize', {
      durationMs: performance.now() - materializeStarted,
      status: 200,
      ok: true,
      bytes: 0,
    });
    const dueStarted = performance.now();
    const dueReport = await sweepUntilSalaryDue(ctx.harness, contractId);
    ctx.metrics.record('payments.run-due', {
      durationMs: performance.now() - dueStarted,
      status: dueReport.found ? 200 : 501,
      ok: dueReport.found,
      bytes: 0,
    });

    const payments = await ctx.harness.database.query<{ id: string; payment_type: string; status: string }>(
      `SELECT id, payment_type, status FROM payments
        WHERE contract_id = $1 AND payment_type = 'SALARY' AND status = 'DUE'
        ORDER BY month_number LIMIT 1`,
      [contractId],
    );
    const salaryPayment = payments.rows[0];
    if (!salaryPayment) {
      const state = await ctx.harness.database.query<{ id: string; status: string; payment_type: string }>(
        'SELECT id, status, payment_type FROM payments WHERE contract_id = $1',
        [contractId],
      );
      return failed(
        'payments.salary-declare',
        `aucun paiement SALARY DUE (matérialisés=${materialized}, état=${JSON.stringify(state.rows)})`,
      );
    }
    await call(ctx, 'payments.salary-declare', '/api/v1/payments/salary-declarations', {
      token: employerToken,
      idempotencyKey: key(ctx, 'declare'),
      body: { paymentId: salaryPayment.id, reference: `TX-LT-${ctx.unit}` },
      userIndex: eu,
      accept: status => status === 200 || status === 201,
    });
    await call(ctx, 'admin.payments.approve', `/api/v1/admin/payments/${salaryPayment.id}/approve`, {
      token: ctx.adminToken,
      idempotencyKey: key(ctx, 'approve'),
      body: {},
      accept: status => status === 200,
    });

    // --- 14. litige : la création/revue est mesurée ci-dessus (M1) ; on
    // consulte ici la liste ADMIN des réclamations sous charge ---
    await call(ctx, 'admin.claims.list', '/api/v1/admin/claims?limit=10', {
      token: ctx.adminToken,
      accept: status => status === 200,
    });

    // --- 15. réputation + notifications ---
    await call(ctx, 'notifications.list', '/api/v1/my/notifications', { token: candidateToken, userIndex: cu });
    await call(ctx, 'reputation.mine', '/api/v1/my/reputation', { token: candidateToken, userIndex: cu });

    // --- 16. documents / R2 simulé ---
    const content = `%PDF-1.4 contrat load-test ${ctx.unit}`;
    const grant = await call(ctx, 'documents.grant', '/api/v1/documents/upload-grants', {
      token: employerToken,
      idempotencyKey: key(ctx, 'doc-grant'),
      body: {
        title: 'Contrat de mission',
        fileName: 'contrat.pdf',
        contentType: 'application/pdf',
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        documentType: 'CONTRACT_DOCUMENT',
      },
      userIndex: eu,
      accept: status => status === 200 || status === 201,
    });
    const grantBody = grant.body as {
      document: { documentId: string };
      version: { versionId: string };
      upload: { url: string };
    };
    await call(ctx, 'documents.upload', grantBody.upload.url, {
      token: employerToken,
      idempotencyKey: key(ctx, 'doc-upload'),
      rawBody: content,
      contentType: 'application/pdf',
      userIndex: eu,
      accept: status => status === 200 || status === 201,
      json: false,
    });

    // --- 17. WebRTC signaling / session setup (côté serveur) ---
    const session = await call(ctx, 'webrtc.create', '/api/v1/webrtc-sessions', {
      token: employerToken,
      idempotencyKey: key(ctx, 'wbs'),
      body: { entityType: 'CONTRACT', entityId: contractId },
      userIndex: eu,
      accept: status => status === 201,
    });
    const sessionId = (session.body as { sessionId: string }).sessionId;
    await call(ctx, 'webrtc.join', `/api/v1/webrtc-sessions/${sessionId}/join`, {
      token: candidateToken,
      body: {},
      userIndex: cu,
    });
    const credEmployer = await call(ctx, 'webrtc.credential', `/api/v1/webrtc-sessions/${sessionId}/credentials`, {
      token: employerToken,
      body: {},
      userIndex: eu,
      accept: status => status === 201,
    });
    const credCandidate = await call(ctx, 'webrtc.credential', `/api/v1/webrtc-sessions/${sessionId}/credentials`, {
      token: candidateToken,
      body: {},
      userIndex: cu,
      accept: status => status === 201,
    });
    const employerCredential = (credEmployer.body as { credential: string }).credential;
    const candidateCredential = (credCandidate.body as { credential: string }).credential;
    await call(ctx, 'webrtc.signal-offer', `/api/v1/webrtc-sessions/${sessionId}/signaling`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'signal-o'),
      body: { type: 'OFFER', payload: { sdp: 'v=0\r\no=- load-test' } },
      headers: { 'X-WebRTC-Credential': employerCredential },
      userIndex: eu,
      accept: status => status === 201,
    });
    await call(ctx, 'webrtc.signal-answer', `/api/v1/webrtc-sessions/${sessionId}/signaling`, {
      token: candidateToken,
      idempotencyKey: key(ctx, 'signal-a'),
      body: { type: 'ANSWER', payload: { sdp: 'v=0\r\no=- load-test-answer' } },
      headers: { 'X-WebRTC-Credential': candidateCredential },
      userIndex: cu,
      accept: status => status === 201,
    });
    await call(ctx, 'webrtc.poll', `/api/v1/webrtc-sessions/${sessionId}/signaling?afterSequence=0&limit=50`, {
      token: candidateToken,
      headers: { 'X-WebRTC-Credential': candidateCredential },
      userIndex: cu,
    });
    await call(ctx, 'webrtc.close', `/api/v1/webrtc-sessions/${sessionId}/close`, {
      token: employerToken,
      idempotencyKey: key(ctx, 'wbs-close'),
      body: {},
      userIndex: eu,
    });

    // --- 18. endpoint ADMIN critique ---
    await call(ctx, 'admin.stats', '/api/v1/admin/stats', {
      token: ctx.adminToken,
      accept: status => status === 200,
    });

    return { ok: true, failedStep: '', detail: '', contractId };
  } catch (error) {
    if (error instanceof JourneyStepError) {
      return failed(error.step, error.message);
    }
    return failed('unexpected', String((error as Error)?.message ?? error));
  }
}
