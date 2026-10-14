/**
 * Candidatures (priorité 4) : aucune fausse confirmation, erreurs visibles,
 * reprise sans doublon, état « envoyée » dérivé de la liste serveur.
 */

import type { Application } from '../types';
import { ApiRepository } from '../repositories/apiRepository';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';
import { createLegacyApiRepositoryAdapter } from '../repositories/legacyApiAdapter';
import { createKeyedAttempts } from '../repositories/idempotency';
import { apiJsonResponse } from '../backend/api/errors';
import {
  applicationErrorMessage,
  hasActiveApplication,
  submitApplication,
} from './applicationSubmission';

export interface ApplicationSubmissionTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const APPLICATION: Application = {
  id: 'app_test_1',
  offerId: 'ofr_a',
  offerTitle: 'Menuisier',
  candidateId: 'usr_candidate_1',
  candidateName: 'Candidat',
  status: 'PENDING',
} as unknown as Application;

function sequentialKeys(): () => string {
  let n = 0;
  return () => `k-${++n}`;
}

export async function runApplicationSubmissionTests(): Promise<ApplicationSubmissionTestResult[]> {
  const results: ApplicationSubmissionTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('A1 reproduction : « déjà postulé » dépendait d’un état local persistant entre offres', () => {
    // Logique legacy (OfferDetailScreen) : `applications.some(...) || hasApplied`.
    // Après une candidature à l'offre A, l'écran de l'offre B gardait hasApplied=true.
    const legacyAlreadyApplied = (apps: Application[], offerId: string, hasApplied: boolean) =>
      apps.some(a => a.offerId === offerId && a.status !== 'WITHDRAWN') || hasApplied;
    const serverList: Application[] = [];
    assert(legacyAlreadyApplied(serverList, 'ofr_b', true) === true, 'le défaut legacy est reproduit (faux « envoyée »)');
    assert(hasActiveApplication(serverList, 'ofr_b') === false, 'la correction ne se fonde que sur la liste serveur');
  });

  await check('A2 état « envoyée » : liste serveur seule, retirée et autre offre exclues', () => {
    const apps = [
      { ...APPLICATION, offerId: 'ofr_a', status: 'WITHDRAWN' },
      { ...APPLICATION, id: 'app_2', offerId: 'ofr_b', status: 'PENDING' },
    ] as Application[];
    assert(hasActiveApplication(apps, 'ofr_a') === false, 'candidature retirée non active');
    assert(hasActiveApplication(apps, 'ofr_b') === true, 'candidature active de la liste serveur');
    assert(hasActiveApplication(apps, 'ofr_c') === false, 'autre offre non active');
  });

  await check('A3 succès : candidature confirmée (identifiée), clé libérée', async () => {
    const attempts = createKeyedAttempts<string>(sequentialKeys());
    const sent: string[] = [];
    const app = await submitApplication('ofr_a', async (_id, key) => { sent.push(key); return APPLICATION; }, attempts);
    assert(app.id === 'app_test_1', 'candidature renvoyée par le serveur');
    assert(sent[0] === 'k-1', 'la clé est transmise');
    assert(attempts.keyFor('ofr_a') === 'k-2', 'après succès, une nouvelle tentative a une nouvelle clé');
  });

  await check('A4 erreur 500 : échec visible, aucune confirmation, reprise avec la même clé', async () => {
    const attempts = createKeyedAttempts<string>(sequentialKeys());
    const keys: string[] = [];
    let calls = 0;
    const send = async (_id: string, key: string) => {
      keys.push(key);
      calls += 1;
      if (calls === 1) throw new ApiClientError('Erreur interne', 500, 'INTERNAL_ERROR');
      return APPLICATION;
    };
    let failed = false;
    try { await submitApplication('ofr_a', send, attempts); } catch (error) {
      failed = true;
      assert(applicationErrorMessage(error).includes('pas pu être confirmée'), 'message : non confirmée');
    }
    assert(failed, 'échec 500 doit être remonté');
    await submitApplication('ofr_a', send, attempts);
    assert(keys[0] === keys[1], 'reprise : même clé, donc pas de doublon côté serveur');
  });

  await check('A5 501 : message explicite « aucune candidature enregistrée », clé libérée', async () => {
    const attempts = createKeyedAttempts<string>(sequentialKeys());
    let message = '';
    try {
      await submitApplication('ofr_a', async () => { throw new ApiClientError('x', 501, 'NOT_IMPLEMENTED'); }, attempts);
    } catch (error) { message = applicationErrorMessage(error); }
    assert(message.includes('Aucune candidature n’a été enregistrée'), 'pas de faux succès en 501');
    assert(attempts.keyFor('ofr_a') === 'k-2', '501 est un refus définitif : clé libérée');
  });

  await check('A6 réponse de succès sans identifiant : aucune confirmation', async () => {
    const attempts = createKeyedAttempts<string>(sequentialKeys());
    let thrown = false;
    try { await submitApplication('ofr_a', async () => ({} as Application), attempts); } catch { thrown = true; }
    assert(thrown, 'une réponse sans candidature identifiée ne confirme rien');
  });

  await check('A7 4xx serveur : message métier visible (compte non actif), clé libérée', async () => {
    const attempts = createKeyedAttempts<string>(sequentialKeys());
    let message = '';
    try {
      await submitApplication('ofr_a', async () => {
        throw new ApiClientError('COMPTE NON ACTIF : la soumission de candidature est indisponible.', 403, 'FORBIDDEN');
      }, attempts);
    } catch (error) { message = applicationErrorMessage(error); }
    assert(message.startsWith('COMPTE NON ACTIF'), 'message serveur conservé');
  });

  await check('A8 transport réel : POST /offers/:id/applications avec Idempotency-Key, reprise sans doublon', async () => {
    const seen: { url: string; method: string; key: string | null }[] = [];
    let call = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      seen.push({ url: url.pathname, method: String(init?.method), key: new Headers(init?.headers).get('Idempotency-Key') });
      call += 1;
      // Première tentative : coupure réseau (la réponse n'arrive pas).
      if (call === 1) throw new TypeError('Failed to fetch');
      return apiJsonResponse(APPLICATION, 201);
    };
    const adapter = createLegacyApiRepositoryAdapter(new ApiRepository(new HttpApiClient({ fetcher })));
    const attempts = createKeyedAttempts<string>(sequentialKeys());
    const send = (id: string, key: string) => adapter.applyToOffer(id, 'usr_candidate_1', key);
    let networkMessage = '';
    try { await submitApplication('ofr_a', send, attempts); } catch (error) { networkMessage = applicationErrorMessage(error); }
    assert(networkMessage.includes('pas pu être confirmée'), 'coupure réseau : pas de faux succès');
    const app = await submitApplication('ofr_a', send, attempts);
    assert(app.id === 'app_test_1', 'reprise confirmée par le serveur');
    assert(seen.length === 2 && seen.every(s => s.method === 'POST' && s.url === '/api/v1/offers/ofr_a/applications'), 'deux POST sur la bonne route');
    assert(seen[0].key !== null && seen[0].key === seen[1].key, 'même Idempotency-Key à la reprise');
  });

  return results;
}
