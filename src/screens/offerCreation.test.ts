/**
 * Création d'offre depuis les écrans employeur (priorité 3).
 *
 * - Reproduction du défaut : le payload legacy contenait des conditions inventées
 *   et un employeur de repli factice.
 * - Correction : payload conforme au DTO `POST /offers`, appel réel du transport
 *   (HttpApiClient + adaptateur legacy) avec en-tête Idempotency-Key, succès
 *   confirmé uniquement sur réponse serveur, erreurs visibles, reprise sans doublon.
 */

import type { Offer } from '../types';
import type { CreateOfferInput } from '../repositories/apiRepository';
import { ApiRepository } from '../repositories/apiRepository';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';
import { createLegacyApiRepositoryAdapter } from '../repositories/legacyApiAdapter';
import { apiJsonResponse } from '../backend/api/errors';
import {
  buildOfferPayload,
  createOfferAttemptTracker,
  offerCreationErrorMessage,
  submitOfferForm,
  type OfferFormValues,
} from './offerCreationForm';

export interface OfferCreationTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const VALID: OfferFormValues = {
  title: '  Menuisier d’agencement  ',
  contractType: 'Mission 6 mois',
  location: 'Cotonou — Cadjèhoun Kpota (Littoral)',
  remuneration: '180000',
  skills: 'Menuiserie, Lecture de plan, ',
  summary: 'Pose soignée.',
};

const SERVER_OFFER: Offer = {
  id: 'ofr_test_1',
  employerId: 'usr_employer_1',
  employerName: 'Atelier',
  employerLocation: 'Cotonou',
  title: 'Menuisier d’agencement',
  contractType: 'Mission 6 mois',
  remuneration: 180000,
  currency: 'FCFA',
  location: 'Cotonou — Cadjèhoun Kpota (Littoral)',
  postedDate: '2026-10-14T09:00:00.000Z',
  isUrgent: false,
  isLeLabeurJob: false,
  skills: ['Menuiserie', 'Lecture de plan'],
  summary: 'Pose soignée.',
  responsibilities: [],
  conditions: [],
  selectionProcess: [],
  compatibilityScore: 90,
  status: 'ACTIVE',
};

/** Passage de clés déterministe pour les tests. */
function sequentialKeys(): () => string {
  let n = 0;
  return () => `key-${++n}`;
}

export async function runOfferCreationTests(): Promise<OfferCreationTestResult[]> {
  const results: OfferCreationTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('O1 reproduction : le payload legacy inventait conditions et employeur', () => {
    // Copie fidèle du payload envoyé par l'ancien callback (écran « Offres »).
    const legacy = {
      title: 'Menuisier',
      employerId: 'user-emp-1',
      employerName: 'Atelier Bois & Agencement Bénin',
      contractType: 'Mission 6 mois',
      remuneration: 180000,
      responsibilities: ['Exécution soignée des ouvrages confiés', 'Respect du planning'],
      conditions: ['Règlement direct de fin de mois', 'Matériel de protection fourni'],
      selectionProcess: ['Examen du profil', 'Échange direct', 'Proposition de mission'],
    };
    const serialized = JSON.stringify(legacy);
    assert(serialized.includes('user-emp-1'), 'repli employeur factice reproduit');
    assert(serialized.includes('Règlement direct de fin de mois'), 'condition inventée reproduite');
  });

  await check('O2 validation : aucun envoi si le formulaire est invalide', async () => {
    const calls: unknown[] = [];
    const outcome = await submitOfferForm(
      { ...VALID, title: '   ', location: '', remuneration: '-5', contractType: '' },
      createOfferAttemptTracker(sequentialKeys()),
      async (payload) => { calls.push(payload); return SERVER_OFFER; },
    );
    assert(outcome.kind === 'invalid', 'champs invalides doivent être refusés');
    assert(calls.length === 0, 'aucune requête ne doit partir');
    assert(outcome.kind === 'invalid' && outcome.errors.title && outcome.errors.location && outcome.errors.remuneration && outcome.errors.contractType, 'erreurs par champ attendues');
    const empty = buildOfferPayload({ ...VALID, remuneration: '' });
    assert(!empty.ok && !!empty.errors.remuneration, 'rémunération vide refusée (pas de 0 implicite)');
  });

  await check('O3 payload conforme au DTO : champs réels seulement, rien d’inventé', () => {
    const result = buildOfferPayload(VALID);
    assert(result.ok, 'formulaire valide attendu');
    const p = result.payload as unknown as Record<string, unknown>;
    assert(p.title === 'Menuisier d’agencement', 'titre normalisé');
    assert(p.remuneration === 180000 && typeof p.remuneration === 'number', 'rémunération numérique');
    assert(JSON.stringify(p.skills) === JSON.stringify(['Menuiserie', 'Lecture de plan']), 'compétences découpées sans vide');
    assert(JSON.stringify(p.conditions) === '[]' && JSON.stringify(p.responsibilities) === '[]', 'aucune condition inventée');
    for (const forbidden of ['id', 'status', 'employerId', 'employerName', 'isLeLabeurJob', 'durationMonths', 'role', 'permissions', 'source']) {
      assert(!(forbidden in p), `champ interdit ou non saisi présent : ${forbidden}`);
    }
  });

  await check('O4 succès : confirmé seulement après réponse serveur avec identifiant', async () => {
    const tracker = createOfferAttemptTracker(sequentialKeys());
    let sentKey = '';
    const outcome = await submitOfferForm(VALID, tracker, async (_payload, key) => { sentKey = key; return SERVER_OFFER; });
    assert(outcome.kind === 'created' && outcome.offer.id === 'ofr_test_1', 'création confirmée attendue');
    assert(sentKey === 'key-1', 'la clé d’idempotence doit être transmise');
  });

  await check('O5 réponse de succès incomplète : pas de confirmation', async () => {
    const outcome = await submitOfferForm(VALID, createOfferAttemptTracker(sequentialKeys()), async () => ({} as Offer));
    assert(outcome.kind === 'failed', 'une réponse sans identifiant ne confirme rien');
  });

  await check('O6 erreur serveur 500 : message visible, même clé à la reprise (pas de doublon)', async () => {
    const tracker = createOfferAttemptTracker(sequentialKeys());
    const keys: string[] = [];
    let attempt = 0;
    const send = async (_p: CreateOfferInput, key: string) => {
      keys.push(key);
      attempt += 1;
      if (attempt === 1) throw new ApiClientError('Erreur interne', 500, 'INTERNAL_ERROR');
      return SERVER_OFFER;
    };
    const first = await submitOfferForm(VALID, tracker, send);
    assert(first.kind === 'failed' && first.message.includes('pas confirmé'), 'échec 500 affiché sans faux succès');
    const retry = await submitOfferForm(VALID, tracker, send);
    assert(retry.kind === 'created', 'la reprise aboutit');
    assert(keys[0] === keys[1], 'la reprise doit réutiliser la même clé');
  });

  await check('O7 coupure réseau (status 0) : clé conservée, reprise sans doublon', async () => {
    const tracker = createOfferAttemptTracker(sequentialKeys());
    const keys: string[] = [];
    let first = true;
    const send = async (_p: CreateOfferInput, key: string) => {
      keys.push(key);
      if (first) { first = false; throw new ApiClientError('indisponible', 0, 'NETWORK_ERROR'); }
      return SERVER_OFFER;
    };
    const outcome = await submitOfferForm(VALID, tracker, send);
    assert(outcome.kind === 'failed', 'réseau coupé : pas de confirmation');
    await submitOfferForm(VALID, tracker, send);
    assert(keys[0] === keys[1], 'issue inconnue : la clé doit être conservée');
  });

  await check('O8 erreur 400 : message serveur visible, demande définitive (nouvelle clé ensuite)', async () => {
    const tracker = createOfferAttemptTracker(sequentialKeys());
    const keys: string[] = [];
    const send = async (_p: CreateOfferInput, key: string) => {
      keys.push(key);
      throw new ApiClientError('Le lieu de la mission est obligatoire.', 400, 'VALIDATION_ERROR');
    };
    const outcome = await submitOfferForm(VALID, tracker, send);
    assert(outcome.kind === 'failed' && outcome.message === 'Le lieu de la mission est obligatoire.', 'message de validation serveur visible');
    await submitOfferForm(VALID, tracker, send);
    assert(keys[0] !== keys[1], 'rejet définitif : une nouvelle tentative utilise une nouvelle clé');
  });

  await check('O9 501 : aucun faux succès, message explicite', async () => {
    const outcome = await submitOfferForm(VALID, createOfferAttemptTracker(sequentialKeys()), async () => {
      throw new ApiClientError('non exposée', 501, 'NOT_IMPLEMENTED');
    });
    assert(outcome.kind === 'failed' && outcome.message.includes('pas encore disponible'), '501 doit être signalé comme indisponible');
    assert(offerCreationErrorMessage(new ApiClientError('x', 403, 'FORBIDDEN')).includes('session'), '403 : message de session');
  });

  await check('O10 modification du formulaire après échec : nouvelle clé', async () => {
    const tracker = createOfferAttemptTracker(sequentialKeys());
    const keys: string[] = [];
    const send = async (_p: CreateOfferInput, key: string) => { keys.push(key); throw new ApiClientError('x', 500, 'INTERNAL_ERROR'); };
    await submitOfferForm(VALID, tracker, send);
    await submitOfferForm({ ...VALID, remuneration: '200000' }, tracker, send);
    assert(keys[0] !== keys[1], 'un payload différent ne doit pas réutiliser la clé');
  });

  await check('O11 transport réel : POST /offers, DTO sans champs serveur, Idempotency-Key stable à la reprise', async () => {
    const sent: { method: string; body: Record<string, unknown>; key: string | null }[] = [];
    let call = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      assert(url.pathname === '/api/v1/offers', `route inattendue : ${url.pathname}`);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      sent.push({ method: String(init?.method), body, key: new Headers(init?.headers).get('Idempotency-Key') });
      call += 1;
      if (call === 1) return apiJsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne' } }, 500);
      return apiJsonResponse(SERVER_OFFER, 201);
    };
    const adapter = createLegacyApiRepositoryAdapter(new ApiRepository(new HttpApiClient({ fetcher })));
    const tracker = createOfferAttemptTracker(sequentialKeys());
    const send = (payload: CreateOfferInput, key: string) => adapter.createOffer(
      { ...payload, employerId: 'usr_employer_1', employerName: 'Atelier', employerLocation: payload.location } as never,
      'usr_employer_1',
      key,
    );
    const first = await submitOfferForm(VALID, tracker, send);
    assert(first.kind === 'failed', 'premier appel en erreur serveur');
    const second = await submitOfferForm(VALID, tracker, send);
    assert(second.kind === 'created' && second.offer.id === 'ofr_test_1', 'reprise confirmée par le serveur');
    assert(sent.length === 2 && sent.every(s => s.method === 'POST'), 'deux POST réellement envoyés');
    assert(sent[0].key && sent[0].key === sent[1].key, 'même Idempotency-Key à la reprise');
    const body = sent[1].body;
    for (const forbidden of ['employerId', 'employerName', 'employerLocation', 'status', 'id', 'isLeLabeurJob']) {
      assert(!(forbidden in body), `le DTO ne doit pas contenir ${forbidden}`);
    }
    assert(body.title === 'Menuisier d’agencement' && body.remuneration === 180000, 'corps conforme au formulaire');
  });

  return results;
}
