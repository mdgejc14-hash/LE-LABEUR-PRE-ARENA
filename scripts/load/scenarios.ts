/**
 * LE LABEUR — P0-LOAD-TESTS-1 — scénarios de charge (ÉTAPE B, PARTIE 1).
 *
 * Parcours REPRÉSENTATIF couvert (les 8 familles demandées) :
 *   1. session/auth          — login Google signé + cookie de session + GET session ;
 *   2. création d'offre      — POST /api/v1/offers (EMPLOYER) ;
 *   3. qualification         — POST /api/v1/offers/:id/qualification (EMPLOYER) ;
 *   4. matching              — PATCH profil candidat (opt-in borné à 200, garde-fou
 *                              métier MAX_MATCHING_CANDIDATES), run + lecture ;
 *   5. candidature           — POST /api/v1/offers/:id/applications (CANDIDATE) ;
 *   6. proposition           — émission EMPLOYER + réponse ACCEPT CANDIDATE ;
 *   7. contrat               — création → envoi → signature → activation ;
 *   8. lecture de données    — listes publiques/privées, détails, /me, /auth/session.
 *
 * Les parcours paiement, WebRTC, remplacement avancé et autres charges complexes
 * sont EXCLUS de cette tranche (prévus pour les tranches suivantes si nécessaire).
 *
 * Modèle de charge : N utilisateurs simulés = N/2 EMPLOYER + N/2 CANDIDATE,
 * appariés en N/2 parcours complets (une offre par employeur, une candidature,
 * une proposition, un contrat activé par paire). La concurrence mesurée est le
 * nombre de parcours exécutés en parallèle.
 *
 * Discipline : chaque étape passe par le vrai worker composé (routing, sécurité,
 * session SQL, repositories, transactions, outbox). Aucune donnée réelle,
 * aucun PSP, aucun email/SMS : toutes les entités sont préfixées LOADTEST.
 */

import { SESSION_COOKIE_NAME } from '../../src/backend/identity/cookies';
import {
  loadRequest,
  type LoadHarness,
  type SyntheticRole,
  type UserPair,
} from './harness';
import type { RequestSample } from './metrics';

export interface JourneyRuntime {
  harness: LoadHarness;
  samples: RequestSample[];
  timeoutMs: number;
}

export interface JourneyOutcome {
  journeyId: string;
  completed: boolean;
  failedSteps: number;
  skippedSteps: number;
}

interface StepMeta {
  step: string;
  routeKey: string | null;
  method: string;
  template: string;
}

interface StepResult {
  status: number;
  json: Record<string, unknown> | null;
  /** En-tête set-cookie brut de la réponse (capture du token de session au login). */
  setCookie: string | null;
}

/** Dépendance absente (étape amont en échec) : l'étape est SAUTÉE, pas comptée en erreur. */
class DependencySkip extends Error {
  constructor(readonly missing: string) {
    super(`dépendance absente : ${missing}`);
  }
}

function dependent<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined || value === '') {
    throw new DependencySkip(name);
  }
  return value;
}

interface JourneyContext {
  employerToken: string | null;
  employerId: string | null;
  candidateToken: string | null;
  candidateId: string | null;
  offerId: string | null;
  applicationId: string | null;
  runId: string | null;
  proposalId: string | null;
  contractId: string | null;
}

/** Réponses de qualification ELIGIBLE_FOR_INDEPENDENT (mêmes formes que les tests). */
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

/**
 * Exécute UNE requête mesurée : latence réelle (performance.now), statut réel,
 * timeout (latence > seuil, requête non interrompue — mesurée telle quelle),
 * erreur (statut inattendu ou exception). Jamais de résultat simulé.
 */
async function executeStep(
  runtime: JourneyRuntime,
  journeyId: string,
  meta: StepMeta,
  path: string,
  token: string | null,
  init: RequestInit,
  expectedStatuses: readonly number[],
): Promise<StepResult | null> {
  const startedAt = performance.now();
  let status: number | null = null;
  let error: string | null = null;
  let json: Record<string, unknown> | null = null;
  let setCookie: string | null = null;
  try {
    const response = await runtime.harness.worker.fetch(loadRequest(path, token, init));
    status = response.status;
    setCookie = response.headers.get('set-cookie');
    const raw = await response.text();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          json = parsed as Record<string, unknown>;
        }
      } catch {
        // Corps non JSON : le statut HTTP reste la référence de succès.
      }
    }
    if (!expectedStatuses.includes(response.status)) {
      const bodyError = json && typeof json.error === 'object' && json.error !== null
        ? String((json.error as Record<string, unknown>).code ?? '')
        : '';
      error = bodyError || `statut inattendu (attendu ${expectedStatuses.join('/')})`;
    }
  } catch (exception) {
    error = `EXCEPTION: ${String((exception as Error)?.message ?? exception).slice(0, 200)}`;
  }
  const latencyMs = performance.now() - startedAt;
  runtime.samples.push({
    journeyId,
    step: meta.step,
    routeKey: meta.routeKey,
    method: meta.method,
    template: meta.template,
    status,
    ok: error === null,
    timeout: latencyMs > runtime.timeoutMs,
    latencyMs: Math.round(latencyMs * 1000) / 1000,
    error,
  });
  if (status === null || error !== null) return null;
  return { status, json, setCookie };
}

function jsonPost(body: unknown, idempotencyKey?: string): RequestInit {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return { method: 'POST', headers, body: JSON.stringify(body) };
}

function jsonPatch(body: unknown, idempotencyKey: string): RequestInit {
  return {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  };
}

function asId(json: Record<string, unknown> | null, field: string): string | null {
  const value = json?.[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sessionTokenFrom(result: StepResult): string {
  const header = result.setCookie ?? '';
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header);
  if (!match || !match[1]) throw new Error('cookie de session absent de la réponse d’authentification');
  return match[1];
}

/**
 * Parcours complet d'une paire (25 étapes ordonnées, données synthétiques).
 * Chaque étape est exécutée même si une lecture amont échoue, SAUF quand une
 * dépendance structurelle manque (token, identifiant) : alors SAUTÉE et
 * comptée séparément — jamais transformée en erreur factice.
 */
export async function runRepresentativeJourney(
  runtime: JourneyRuntime,
  pair: UserPair,
): Promise<JourneyOutcome> {
  const { journeyId } = pair;
  const harness = runtime.harness;
  const ctx: JourneyContext = {
    employerToken: null,
    employerId: null,
    candidateToken: null,
    candidateId: null,
    offerId: null,
    applicationId: null,
    runId: null,
    proposalId: null,
    contractId: null,
  };
  let failedSteps = 0;
  let skippedSteps = 0;

  const guard = async (fn: () => Promise<StepResult | null>): Promise<StepResult | null> => {
    try {
      const result = await fn();
      if (result === null) failedSteps += 1;
      return result;
    } catch (error) {
      if (error instanceof DependencySkip) {
        skippedSteps += 1;
        return null;
      }
      failedSteps += 1;
      throw error;
    }
  };

  const login = async (role: SyntheticRole): Promise<StepResult | null> => {
    const user = role === 'EMPLOYER' ? pair.employer : pair.candidate;
    return executeStep(
      runtime,
      journeyId,
      {
        step: role === 'EMPLOYER' ? 'auth.employer.login' : 'auth.candidate.login',
        routeKey: 'auth.google.credential',
        method: 'POST',
        template: '/api/v1/auth/google/credential',
      },
      '/api/v1/auth/google/credential',
      null,
      jsonPost({ credential: harness.credentials[user.identityKey], requestedRole: role }, `${journeyId}-${role.toLowerCase()}-login`),
      [200, 201],
    );
  };

  /* 1 — SESSION / AUTH ---------------------------------------------------- */

  const employerLogin = await guard(() => login('EMPLOYER'));
  if (employerLogin) {
    ctx.employerToken = sessionTokenFrom(employerLogin);
    ctx.employerId = asId((employerLogin.json?.user ?? null) as Record<string, unknown> | null, 'id');
  }

  const candidateLogin = await guard(() => login('CANDIDATE'));
  if (candidateLogin) {
    ctx.candidateToken = sessionTokenFrom(candidateLogin);
    ctx.candidateId = asId((candidateLogin.json?.user ?? null) as Record<string, unknown> | null, 'id');
  }

  /* 2 — CRÉATION D'OFFRE ---------------------------------------------------- */

  const offer = await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'offer.create', routeKey: 'offers.create', method: 'POST', template: '/api/v1/offers' },
      '/api/v1/offers',
      token,
      jsonPost({
        title: `LOADTEST Offre ${journeyId} — Chargé de communication`,
        contractType: 'CDI',
        remuneration: 175000,
        currency: 'FCFA',
        location: 'Cotonou',
        summary: `Mission synthétique de charge ${journeyId} (P0-LOAD-TESTS-1, données fictives).`,
      }, `${journeyId}-offer`),
      [201],
    );
  });
  if (offer) ctx.offerId = asId(offer.json, 'id');

  /* 3 — QUALIFICATION ------------------------------------------------------- */

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const offerId = dependent(ctx.offerId, 'offerId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'qualification.submit', routeKey: 'matching.qualification.submit', method: 'POST', template: '/api/v1/offers/:offerId/qualification' },
      `/api/v1/offers/${offerId}/qualification`,
      token,
      jsonPost({ answers: QUALIFICATION_ANSWERS }, `${journeyId}-qualification`),
      [200],
    );
  });

  /* 4 — MATCHING : profil candidat (opt-in borné à 200, garde-fou métier) ---- */

  if (pair.publishMatchingProfile) {
    await guard(() => {
      const token = dependent(ctx.candidateToken, 'candidateToken');
      return executeStep(
        runtime,
        journeyId,
        { step: 'matching.profile.update', routeKey: 'matching.profile.update', method: 'PATCH', template: '/api/v1/my/matching-profile' },
        '/api/v1/my/matching-profile',
        token,
        jsonPatch({ skills: ['Communication', 'Rédaction', 'Réseaux sociaux'], availability: 'AVAILABLE' }, `${journeyId}-matching-profile`),
        [200],
      );
    });
  }

  /* 8 — LECTURES PUBLIQUES (parcours candidat) ------------------------------ */

  await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'offers.list.read', routeKey: 'offers.public.list', method: 'GET', template: '/api/v1/offers' },
      '/api/v1/offers',
      token,
      { method: 'GET' },
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    const offerId = dependent(ctx.offerId, 'offerId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'offer.read', routeKey: 'offers.public.read', method: 'GET', template: '/api/v1/offers/:offerId' },
      `/api/v1/offers/${offerId}`,
      token,
      { method: 'GET' },
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    const offerId = dependent(ctx.offerId, 'offerId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'qualification.summary.read', routeKey: 'matching.qualification.summary', method: 'GET', template: '/api/v1/offers/:offerId/qualification-summary' },
      `/api/v1/offers/${offerId}/qualification-summary`,
      token,
      { method: 'GET' },
      [200],
    );
  });

  /* 5 — CANDIDATURE ---------------------------------------------------------- */

  const application = await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    const offerId = dependent(ctx.offerId, 'offerId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'application.create', routeKey: 'applications.create', method: 'POST', template: '/api/v1/offers/:offerId/applications' },
      `/api/v1/offers/${offerId}/applications`,
      token,
      jsonPost({ note: `Candidature synthétique ${journeyId} (campagne de charge).` }, `${journeyId}-application`),
      [201],
    );
  });
  if (application) ctx.applicationId = asId(application.json, 'id');

  /* 4 — MATCHING : run et lecture des résultats (EMPLOYER) ------------------- */

  const run = await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const offerId = dependent(ctx.offerId, 'offerId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'matching.run.create', routeKey: 'matching.runs.create', method: 'POST', template: '/api/v1/offers/:offerId/matching-runs' },
      `/api/v1/offers/${offerId}/matching-runs`,
      token,
      jsonPost({}, `${journeyId}-matching-run`),
      [200],
    );
  });
  if (run) ctx.runId = asId(run.json, 'runId');

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const runId = dependent(ctx.runId, 'runId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'matching.run.read', routeKey: 'matching.runs.read', method: 'GET', template: '/api/v1/matching-runs/:runId' },
      `/api/v1/matching-runs/${runId}`,
      token,
      { method: 'GET' },
      [200],
    );
  });

  /* 8 — LECTURE : candidatures reçues (EMPLOYER propriétaire) ---------------- */

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const offerId = dependent(ctx.offerId, 'offerId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'applications.offer.list.read', routeKey: 'applications.offer.list', method: 'GET', template: '/api/v1/offers/:offerId/applications' },
      `/api/v1/offers/${offerId}/applications`,
      token,
      { method: 'GET' },
      [200],
    );
  });

  /* 5 — DÉCISION CANDIDATURE : examen par l'employeur (cycle P0-E4 ouvert) --- */
  /* NB : /api/v1/my/applications et /api/v1/employer/applications sont        */
  /* volontairement FERMÉS (501 par conception « closed-by-default », vérifié  */
  /* par les tests P0-E3/E4) : ils ne font pas partie du parcours représentatif. */

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const applicationId = dependent(ctx.applicationId, 'applicationId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'application.examine', routeKey: 'applications.examine', method: 'POST', template: '/api/v1/applications/:applicationId/examine' },
      `/api/v1/applications/${applicationId}/examine`,
      token,
      jsonPost({}, `${journeyId}-examine`),
      [200],
    );
  });

  /* 6 — PROPOSITION : émission (EMPLOYER) + acceptation (CANDIDATE) ---------- */

  const proposal = await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const applicationId = dependent(ctx.applicationId, 'applicationId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'proposal.create', routeKey: 'proposals.create', method: 'POST', template: '/api/v1/conversations/:conversationId/proposals' },
      `/api/v1/conversations/cnv_load_${journeyId}/proposals`,
      token,
      jsonPost({
        applicationId,
        missionTitle: `LOADTEST Mission ${journeyId}`,
        amount: 291667,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Août 2026',
        durationMonths: 6,
        location: 'Cotonou',
        conditions: ['Horaires définis par l’employeur et présentés au candidat avant acceptation.'],
      }, `${journeyId}-proposal`),
      [201],
    );
  });
  if (proposal) ctx.proposalId = asId(proposal.json, 'id');

  await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    const proposalId = dependent(ctx.proposalId, 'proposalId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'proposal.respond.accept', routeKey: 'proposals.respond', method: 'POST', template: '/api/v1/proposals/:proposalId/respond' },
      `/api/v1/proposals/${proposalId}/respond`,
      token,
      jsonPost({ action: 'ACCEPT' }, `${journeyId}-respond`),
      [200],
    );
  });

  /* 7 — CONTRAT : création → envoi → signature → activation ------------------ */

  const contract = await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const proposalId = dependent(ctx.proposalId, 'proposalId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'contract.create', routeKey: 'contracts.create', method: 'POST', template: '/api/v1/contracts' },
      '/api/v1/contracts',
      token,
      jsonPost({ proposalId }, `${journeyId}-contract`),
      [201],
    );
  });
  if (contract) ctx.contractId = asId(contract.json, 'id');

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const contractId = dependent(ctx.contractId, 'contractId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'contract.send', routeKey: 'contracts.send', method: 'POST', template: '/api/v1/contracts/:contractId/send' },
      `/api/v1/contracts/${contractId}/send`,
      token,
      jsonPost({}, `${journeyId}-send`),
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    const contractId = dependent(ctx.contractId, 'contractId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'contract.sign', routeKey: 'contracts.sign', method: 'POST', template: '/api/v1/contracts/:contractId/sign' },
      `/api/v1/contracts/${contractId}/sign`,
      token,
      jsonPost({}, `${journeyId}-sign`),
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    const contractId = dependent(ctx.contractId, 'contractId');
    return executeStep(
      runtime,
      journeyId,
      { step: 'contract.activate', routeKey: 'contracts.activate', method: 'POST', template: '/api/v1/contracts/:contractId/activate' },
      `/api/v1/contracts/${contractId}/activate`,
      token,
      jsonPost({}, `${journeyId}-activate`),
      [200],
    );
  });

  /* 8 — LECTURES PRIVÉES DE FIN DE PARCOURS ----------------------------------- */

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'offers.mine.list.read', routeKey: 'offers.mine.list', method: 'GET', template: '/api/v1/my/offers' },
      '/api/v1/my/offers',
      token,
      { method: 'GET' },
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'contracts.employer.list.read', routeKey: 'contracts.mine.list', method: 'GET', template: '/api/v1/my/contracts' },
      '/api/v1/my/contracts',
      token,
      { method: 'GET' },
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'contracts.candidate.list.read', routeKey: 'contracts.mine.list', method: 'GET', template: '/api/v1/my/contracts' },
      '/api/v1/my/contracts',
      token,
      { method: 'GET' },
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'me.employer.read', routeKey: 'me.read', method: 'GET', template: '/api/v1/me' },
      '/api/v1/me',
      token,
      { method: 'GET' },
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.candidateToken, 'candidateToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'me.candidate.read', routeKey: 'me.read', method: 'GET', template: '/api/v1/me' },
      '/api/v1/me',
      token,
      { method: 'GET' },
      [200],
    );
  });

  await guard(() => {
    const token = dependent(ctx.employerToken, 'employerToken');
    return executeStep(
      runtime,
      journeyId,
      { step: 'auth.session.read', routeKey: 'auth.session', method: 'GET', template: '/api/v1/auth/session' },
      '/api/v1/auth/session',
      token,
      { method: 'GET' },
      [200],
    );
  });

  return {
    journeyId,
    completed: failedSteps === 0 && skippedSteps === 0,
    failedSteps,
    skippedSteps,
  };
}
