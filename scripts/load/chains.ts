/**
 * LE LABEUR — P0-LOAD-TESTS-2 — chaînes métier réelles pour les suites PARTIE 2.
 *
 * Réutilisation stricte du framework P0-LOAD-TESTS-1 :
 *   - chaque requête passe par `executeStep` (scenarios.ts) → même client
 *     in-process, même mesure de latence, mêmes échantillons ;
 *   - les identités viennent du harness (credentials RS256 réelles) ;
 *   - la chaîne reprend EXACTEMENT le parcours validé par P0-LOAD-TESTS-1 et
 *     cronQueue.test.ts : offre → candidature → proposition ACCEPT → contrat
 *     signé → ACTIVÉ (outbox CONTRACT_ACTIVATED écrite en transaction).
 *
 * Aucun nouveau moteur : ce module ne fait que composer des appels existants.
 */

import type { LoadHarness, UserPair } from './harness';
import { newEntityId, newOpaqueSessionToken } from '../../src/backend/identity/ids';
import { createSqlIdentityStores } from '../../src/backend/identity/sqlStores';
import {
  asId,
  executeStep,
  jsonPost,
  sessionTokenFrom,
  type JourneyRuntime,
  type StepResult,
} from './scenarios';

export interface PairSession {
  employerToken: string;
  employerId: string;
  candidateToken: string;
  candidateId: string;
}

export interface ContractChain {
  journeyId: string;
  session: PairSession;
  offerId: string;
  applicationId: string | null;
  conversationId: string | null;
  proposalId: string | null;
  contractId: string | null;
}

/** Connexion réelle des deux acteurs de la paire (JWT RS256 → session SQL). */
export async function loginPair(
  runtime: JourneyRuntime,
  pair: UserPair,
): Promise<PairSession> {
  const login = async (role: 'EMPLOYER' | 'CANDIDATE'): Promise<StepResult> => {
    const user = role === 'EMPLOYER' ? pair.employer : pair.candidate;
    const result = await executeStep(
      runtime,
      pair.journeyId,
      {
        step: role === 'EMPLOYER' ? 'auth.employer.login' : 'auth.candidate.login',
        routeKey: 'auth.google.credential',
        method: 'POST',
        template: '/api/v1/auth/google/credential',
      },
      '/api/v1/auth/google/credential',
      null,
      jsonPost(
        { credential: runtime.harness.credentials[user.identityKey], requestedRole: role },
        `${pair.journeyId}-${role.toLowerCase()}-login`,
      ),
      [200, 201],
    );
    if (!result) throw new Error(`login ${role} échoué pour ${pair.journeyId}`);
    return result;
  };

  const employerLogin = await login('EMPLOYER');
  const candidateLogin = await login('CANDIDATE');
  const employerId = asId((employerLogin.json?.user ?? null) as Record<string, unknown> | null, 'id');
  const candidateId = asId((candidateLogin.json?.user ?? null) as Record<string, unknown> | null, 'id');
  if (!employerId || !candidateId) throw new Error(`identités manquantes pour ${pair.journeyId}`);
  return {
    employerToken: sessionTokenFrom(employerLogin),
    employerId,
    candidateToken: sessionTokenFrom(candidateLogin),
    candidateId,
  };
}

export interface ActivateChainOptions {
  /** Préfixe des clés d'idempotence (doit être unique par chaîne). */
  keyPrefix: string;
  startDate?: string;
  durationMonths?: number;
  periodicity?: string;
  /**
   * Arrêt anticipé de la chaîne (P0-LOAD-TESTS-2) : 'offer' (offre seule),
   * 'application' (offre + candidature), 'proposal' (jusqu'à la proposition
   * SENT, SANS réponse), 'contract' (défaut : contrat ACTIVÉ).
   */
  stopAfter?: 'offer' | 'application' | 'proposal' | 'contract';
}

/**
 * Chaîne offre → contrat ACTIVÉ via la VRAIE API (étapes mesurées).
 * Le contrat activé écrit son événement `CONTRACT_ACTIVATED` dans l'Outbox
 * (transaction réelle) — laissée PENDING : c'est la file que les suites
 * résilience/queue drainent ensuite avec le worker EXISTANT.
 * `stopAfter` permet de s'arrêter plus tôt (courses P0-LOAD-TESTS-2).
 */
export async function activateContractChain(
  runtime: JourneyRuntime,
  pair: UserPair,
  options: ActivateChainOptions,
): Promise<ContractChain> {
  const session = await loginPair(runtime, pair);
  const { journeyId } = pair;
  const keyPrefix = options.keyPrefix;
  const post = async (
    step: string,
    routeKey: string,
    method: string,
    template: string,
    path: string,
    token: string,
    body: unknown,
    idempotencyKey: string,
    expected: readonly number[],
  ): Promise<StepResult> => {
    const result = await executeStep(
      runtime,
      journeyId,
      { step, routeKey, method, template },
      path,
      token,
      jsonPost(body, idempotencyKey),
      expected,
    );
    if (!result) throw new Error(`étape ${step} échouée pour ${journeyId}`);
    return result;
  };

  const offer = await post(
    'offer.create', 'offers.create', 'POST', '/api/v1/offers',
    '/api/v1/offers', session.employerToken,
    {
      title: `LOADTEST Offre ${keyPrefix} — Chargé de communication`,
      contractType: 'CDI',
      remuneration: 175000,
      currency: 'FCFA',
      location: 'Cotonou',
      summary: `Mission synthétique PARTIE 2 ${keyPrefix} (données fictives).`,
    },
    `${keyPrefix}-offer`, [201],
  );
  const offerId = asId(offer.json, 'id');
  if (!offerId) throw new Error(`offerId manquant pour ${journeyId}`);
  if (options.stopAfter === 'offer') {
    return { journeyId, session, offerId, applicationId: null, conversationId: null, proposalId: null, contractId: null };
  }

  const application = await post(
    'application.create', 'applications.create', 'POST', '/api/v1/offers/:offerId/applications',
    `/api/v1/offers/${offerId}/applications`, session.candidateToken,
    { note: `Candidature synthétique ${keyPrefix} (PARTIE 2).` },
    `${keyPrefix}-application`, [201],
  );
  const applicationId = asId(application.json, 'id');
  if (!applicationId) throw new Error(`applicationId manquant pour ${journeyId}`);
  if (options.stopAfter === 'application') {
    return { journeyId, session, offerId, applicationId, conversationId: null, proposalId: null, contractId: null };
  }

  const conversationId = `cnv_${keyPrefix}`;
  const proposal = await post(
    'proposal.create', 'proposals.create', 'POST', '/api/v1/conversations/:conversationId/proposals',
    `/api/v1/conversations/${conversationId}/proposals`, session.employerToken,
    {
      applicationId,
      missionTitle: `LOADTEST Mission ${keyPrefix}`,
      amount: 291667,
      currency: 'FCFA',
      periodicity: options.periodicity ?? 'Mensuel',
      startDate: options.startDate ?? '01 Août 2026',
      durationMonths: options.durationMonths ?? 6,
      location: 'Cotonou',
      conditions: ['Horaires définis par l’employeur et présentés au candidat avant acceptation.'],
    },
    `${keyPrefix}-proposal`, [201],
  );
  const proposalId = asId(proposal.json, 'id');
  if (!proposalId) throw new Error(`proposalId manquant pour ${journeyId}`);
  if (options.stopAfter === 'proposal') {
    return { journeyId, session, offerId, applicationId, conversationId, proposalId, contractId: null };
  }

  await post(
    'proposal.respond.accept', 'proposals.respond', 'POST', '/api/v1/proposals/:proposalId/respond',
    `/api/v1/proposals/${proposalId}/respond`, session.candidateToken,
    { action: 'ACCEPT' },
    `${keyPrefix}-respond`, [200],
  );

  const contract = await post(
    'contract.create', 'contracts.create', 'POST', '/api/v1/contracts',
    '/api/v1/contracts', session.employerToken,
    { proposalId },
    `${keyPrefix}-contract`, [201],
  );
  const contractId = asId(contract.json, 'id');
  if (!contractId) throw new Error(`contractId manquant pour ${journeyId}`);

  await post(
    'contract.send', 'contracts.send', 'POST', '/api/v1/contracts/:contractId/send',
    `/api/v1/contracts/${contractId}/send`, session.employerToken, {},
    `${keyPrefix}-send`, [200],
  );
  await post(
    'contract.sign', 'contracts.sign', 'POST', '/api/v1/contracts/:contractId/sign',
    `/api/v1/contracts/${contractId}/sign`, session.candidateToken, {},
    `${keyPrefix}-sign`, [200],
  );
  const activated = await post(
    'contract.activate', 'contracts.activate', 'POST', '/api/v1/contracts/:contractId/activate',
    `/api/v1/contracts/${contractId}/activate`, session.employerToken, {},
    `${keyPrefix}-activate`, [200],
  );
  const status = (activated.json?.status ?? null);
  if (status !== 'ACTIVE') throw new Error(`contrat non ACTIVE pour ${journeyId} : ${String(status)}`);

  return { journeyId, session, offerId, applicationId, conversationId, proposalId, contractId };
}

/* ------------------------------------------------------------------ */
/* Lectures SQL ciblées (mêmes formes que cronQueue.test.ts)           */
/* ------------------------------------------------------------------ */

export type Row = Record<string, unknown>;

export async function sql<T = Row>(
  harness: LoadHarness,
  query: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await harness.database.query<T>(query, [...params]);
  return result.rows;
}

export async function countRows(harness: LoadHarness, query: string, params: readonly unknown[] = []): Promise<number> {
  const rows = await sql<{ count: string }>(harness, query, params);
  return Number(rows[0]?.count ?? 0);
}

/** Provisionne un ADMIN réel (users + session SQL) — jamais en self-service. */
export async function provisionAdmin(harness: LoadHarness, label: string): Promise<{ userId: string; token: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const now = harness.clock.value;
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async transaction => {
    await transaction.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.${label}.${userId}@loadtest.invalid`,
      displayName: `LOADTEST Admin ${label}`,
    });
    await transaction.sessions.create({
      userId,
      token,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    });
  });
  return { userId, token };
}

/** Exécute une requête HTTP mesurée brute (pour les courses de concurrence). */
export async function measuredRequest(
  runtime: JourneyRuntime,
  journeyId: string,
  meta: { step: string; routeKey: string | null; method: string; template: string },
  path: string,
  token: string | null,
  init: RequestInit,
  expectedStatuses: readonly number[],
): Promise<StepResult | null> {
  return executeStep(runtime, journeyId, meta, path, token, init, expectedStatuses);
}
