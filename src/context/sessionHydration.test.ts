/**
 * Hydratation de session (défaut « session valide bloquée par 501 »).
 *
 * Le test de reproduction utilise le vrai Worker d'identité derrière le client
 * HTTP du frontend : seules les lectures métier non installées répondent 501.
 */

import { createIdentityApiWorker } from '../backend/api/identityWorker';
import { createSessionService } from '../backend/identity/sessionService';
import { createInMemoryIdentityStores } from '../backend/identity/stores';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';
import { ApiRepository } from '../repositories/apiRepository';
import { createLegacyApiRepositoryAdapter } from '../repositories/legacyApiAdapter';
import type { AppRepositoryBundle } from '../repositories/provider';
import { hydrateSessionResources, readSecondaryResource, type SessionReadRepositories } from './sessionHydration';
import type { UserProfile } from '../types';

export interface SessionHydrationTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CREDENTIAL = 'hydration-valid-credential';

function createIdentityOnlyBackend() {
  const stores = createInMemoryIdentityStores();
  const sessions = createSessionService({
    stores,
    googleVerifier: {
      async verifyCredential(credential: string) {
        if (credential !== CREDENTIAL) throw new Error('invalid credential');
        return { subject: 'hydration-sub', email: 'candidat.hydratation@example.com', emailVerified: true, displayName: 'Candidat Hydratation' };
      },
    },
    now: () => new Date('2026-10-14T09:00:00.000Z'),
    sessionTtlSeconds: 3600,
  });
  const worker = createIdentityApiWorker({ sessions, stores, cookie: { secure: true }, now: () => new Date('2026-10-14T09:00:00.000Z') });
  const jar = new Map<string, string>();
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (jar.size > 0) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    const response = await worker.fetch(new Request(String(input), { ...init, headers } as RequestInit));
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
    return response;
  };
  const adapter: AppRepositoryBundle = createLegacyApiRepositoryAdapter(new ApiRepository(new HttpApiClient({ fetcher })));
  return { adapter };
}

/** Dépôt factice contrôlé : chaque lecture renvoie `impl` (utilisé pour les cas d'erreur). */
function fakeReads(impl: (name: string) => unknown): SessionReadRepositories & { calls: string[] } {
  const calls: string[] = [];
  const names = [
    'getConversations', 'getFavorites', 'getAllOffers', 'getApplicationsByCandidate', 'getApplicationsByEmployer',
    'getAllApplications', 'getContractsByUser', 'getAllCandidates', 'getResourceDocuments', 'listEmployerPayments',
  ];
  const repo: Record<string, unknown> = { calls };
  for (const name of names) {
    repo[name] = (..._args: unknown[]) => {
      calls.push(name);
      return impl(name);
    };
  }
  return repo as unknown as SessionReadRepositories & { calls: string[] };
}

const CANDIDATE: UserProfile = {
  id: 'usr_candidate_hydration',
  role: 'CANDIDATE',
  email: 'candidat.hydratation@example.com',
  fullName: 'Candidat Hydratation',
} as unknown as UserProfile;

export async function runSessionHydrationTests(): Promise<SessionHydrationTestResult[]> {
  const results: SessionHydrationTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('H1 reproduction : l’agrégat Promise.all rejette sur une lecture 501 alors que la session est valide', async () => {
    const { adapter } = createIdentityOnlyBackend();
    const user = await adapter.authenticateGoogleCredential(
      { sub: 'ignored', email: 'x@example.com', name: 'x', credential: CREDENTIAL, email_verified: true } as never,
      'CANDIDATE',
    );
    // Session serveur valide.
    assert((await adapter.getCurrentSession())?.id === user.id, 'la session serveur doit être valide');
    // Ancien comportement : toutes les lectures en un seul Promise.all.
    let legacyStatus = 0;
    try {
      await Promise.all([
        adapter.getConversations(user.id),
        adapter.getFavorites(user.id),
        adapter.getAllOffers(),
        adapter.getApplicationsByCandidate(user.id),
        adapter.getContractsByUser(user.id, user.role),
      ]);
    } catch (error) {
      legacyStatus = error instanceof ApiClientError ? error.status : -1;
    }
    assert(legacyStatus === 501, `le défaut attendu (501) n’est pas reproduit : ${legacyStatus}`);
  });

  await check('H2 correction : une lecture 501 n’annule pas la session et reste explicitement indisponible', async () => {
    const { adapter } = createIdentityOnlyBackend();
    const user = await adapter.authenticateGoogleCredential(
      { sub: 'ignored', email: 'x@example.com', name: 'x', credential: CREDENTIAL, email_verified: true } as never,
      'CANDIDATE',
    );
    const hydrated = await hydrateSessionResources(user, adapter);
    assert((await adapter.getCurrentSession())?.id === user.id, 'la session serveur doit rester valide');
    const { resourceStatuses } = hydrated;
    for (const key of ['offers', 'conversations', 'favorites', 'applications', 'contracts'] as const) {
      assert(resourceStatuses[key].state === 'unavailable', `${key} doit être unavailable (501), obtenu ${resourceStatuses[key].state}`);
    }
    // Aucune donnée inventée : les capacités absentes ne fournissent rien.
    assert(hydrated.offers.length === 0 && hydrated.conversations.length === 0 && hydrated.favorites.length === 0, 'aucune donnée fictive');
    assert(hydrated.applications.length === 0 && hydrated.contracts.length === 0 && hydrated.paymentDeclarations.length === 0, 'aucune donnée fictive');
    // Un candidat ne charge jamais la liste des candidats (portée rôle).
    assert(resourceStatuses.candidates.state === 'ready' && hydrated.candidates.length === 0, 'candidats : portée candidat');
  });

  await check('H3 erreur technique : non transformée en liste vide « réussie »', async () => {
    const repos = fakeReads((name) => {
      if (name === 'getAllOffers') return Promise.reject(new ApiClientError('Serveur indisponible', 503, 'INVALID_RESPONSE'));
      if (name === 'getFavorites') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve([]);
    });
    const hydrated = await hydrateSessionResources(CANDIDATE, repos);
    assert(hydrated.resourceStatuses.offers.state === 'error', 'erreur 503 doit être state=error');
    assert(hydrated.resourceStatuses.favorites.state === 'error', 'erreur réseau doit être state=error');
    assert(hydrated.resourceStatuses.conversations.state === 'ready', 'une lecture réussie reste ready');
  });

  await check('H4 succès : les données réelles du serveur sont exposées avec statut ready', async () => {
    const repos = fakeReads((name) => {
      if (name === 'getAllOffers') return Promise.resolve([{ id: 'off_1' }]);
      if (name === 'getFavorites') return Promise.resolve(['off_1']);
      return Promise.resolve([]);
    });
    const hydrated = await hydrateSessionResources(CANDIDATE, repos);
    assert(hydrated.offers.length === 1 && hydrated.offers[0].id === 'off_1', 'offres réelles attendues');
    assert(hydrated.favorites.length === 1 && hydrated.favorites[0] === 'off_1', 'favoris réels attendus');
    assert(Object.values(hydrated.resourceStatuses).every(status => status.state === 'ready'), 'tous les statuts doivent être ready');
    // Le candidat n'interroge ni les candidats ni les paiements employeur.
    assert(!repos.calls.includes('getAllCandidates') && !repos.calls.includes('listEmployerPayments'), 'portée candidat violée');
  });

  await check('H5 rôle EMPLOYER : paiements et candidats appelés dans sa portée', async () => {
    const repos = fakeReads(() => Promise.resolve([]));
    const employer = { ...CANDIDATE, id: 'usr_employer_hydration', role: 'EMPLOYER' } as unknown as UserProfile;
    await hydrateSessionResources(employer, repos);
    assert(repos.calls.includes('listEmployerPayments') && repos.calls.includes('getAllCandidates'), 'employeur : portée attendue');
    assert(repos.calls.includes('getApplicationsByEmployer') && !repos.calls.includes('getApplicationsByCandidate'), 'candidatures employeur');
  });

  await check('H6 readSecondaryResource : 501 ⇒ unavailable, autre erreur ⇒ error, jamais de données', async () => {
    const unavailable = await readSecondaryResource(() => Promise.reject(new ApiClientError('pas encore exposé', 501, 'NOT_IMPLEMENTED')));
    assert(unavailable.status.state === 'unavailable' && unavailable.data === null, '501 doit être unavailable sans données');
    const failed = await readSecondaryResource(() => Promise.reject(new ApiClientError('interdit', 403, 'FORBIDDEN')));
    assert(failed.status.state === 'error' && failed.data === null, '403 doit être error sans données');
    const ok = await readSecondaryResource(async () => [1, 2]);
    assert(ok.status.state === 'ready' && Array.isArray(ok.data) && ok.data.length === 2, 'succès doit être ready avec données');
  });

  return results;
}
