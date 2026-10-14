/** P0-E3 — tests Worker/API → repository métier → PostgreSQL pour CANDIDATURES. */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from './offers.test';
import { ApiError } from './errors';
import type { AuthenticatedActor } from '../productionContracts';
import type { ApplicationRecord, OfferRecord } from '../persistence/coreRecords';
import { createSqlUserStore } from '../identity/sqlStores';
import { createSqlApplicationStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { applicationIdempotencyCache } from '../repositories/applicationRepository';
import { resolveRepositoryMode } from '../../repositories/mode';
import type { Application } from '../../types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeOffer(
  id: string,
  employerId: string,
  status: OfferRecord['status'] = 'ACTIVE',
): OfferRecord {
  const timestamp = '2026-10-05T14:00:00.000Z';
  return {
    id,
    employerId,
    title: `Offre ${id}`,
    contractType: 'CDI',
    remuneration: 125_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: timestamp,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre de test P0-E3.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function applyRequest(
  offerId: string,
  token: string | null,
  key: string,
  body: Record<string, unknown> = {},
): Request {
  return authRequest(`/api/v1/offers/${encodeURIComponent(offerId)}/applications`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

async function countApplications(harness: Awaited<ReturnType<typeof createOffersTestHarness>>, offerId: string): Promise<number> {
  const result = await harness.database.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM applications WHERE offer_id = $1',
    [offerId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function runApplicationDomainTests(): Promise<OfferTestResult[]> {
  applicationIdempotencyCache.clear();
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const harness = await createOffersTestHarness();
  let candidateToken = '';
  let candidateId = '';
  let employerToken = '';
  let employerId = '';
  let otherEmployerToken = '';
  let otherEmployerId = '';
  const offerIds = {
    primary: 'ofr_p0e3_primary',
    concurrent: 'ofr_p0e3_concurrent',
    cancelled: 'ofr_p0e3_cancelled',
    filled: 'ofr_p0e3_filled',
    paused: 'ofr_p0e3_paused',
    changesBeforeSubmit: 'ofr_p0e3_changes-before-submit',
    rollback: 'ofr_p0e3_rollback',
  };

  try {
    await check('P0-E3 Setup: sessions candidat + employeur propriétaire + autre employeur, offres PostgreSQL', async () => {
      const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      candidateToken = candidate.token;
      candidateId = candidate.userId;
      const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      employerToken = employer.token;
      employerId = employer.userId;
      const otherEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      otherEmployerToken = otherEmployer.token;
      otherEmployerId = otherEmployer.userId;

      const offers = createSqlOfferStore(harness.database);
      await offers.create(makeOffer(offerIds.primary, employerId));
      await offers.create(makeOffer(offerIds.concurrent, employerId));
      await offers.create(makeOffer(offerIds.cancelled, employerId, 'CANCELLED'));
      await offers.create(makeOffer(offerIds.filled, employerId, 'FILLED'));
      await offers.create(makeOffer(offerIds.paused, employerId, 'PAUSED'));
      await offers.create(makeOffer(offerIds.changesBeforeSubmit, employerId));
      await offers.create(makeOffer(offerIds.rollback, employerId));
    });

    let primaryApplicationId = '';
    await check('P0-E3 Soumission: CANDIDATE autorisé; candidateId dérivé de la session et ligne relue en PostgreSQL', async () => {
      const response = await harness.worker.fetch(applyRequest(
        offerIds.primary,
        candidateToken,
        'p0e3-submit-primary-001',
        { note: 'Disponible dès novembre.', candidateId: otherEmployerId },
      ));
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const application = await response.json() as Application;
      primaryApplicationId = application.id;
      assert(application.candidateId === candidateId, 'candidateId doit provenir de la session serveur');
      assert(application.offerId === offerIds.primary, 'offerId attendu');
      assert(application.status === 'PENDING', 'statut initial PENDING attendu');
      assert(application.note === 'Disponible dès novembre.', 'note de soumission restituée');

      const stored = await harness.database.query<{
        id: string;
        offer_id: string;
        candidate_id: string;
        status: string;
        note: string | null;
      }>('SELECT id, offer_id, candidate_id, status, note FROM applications WHERE id = $1', [application.id]);
      assert(stored.rows.length === 1, 'candidature effectivement persistée dans PostgreSQL');
      assert(stored.rows[0].candidate_id === candidateId, 'candidate_id PostgreSQL issu de la session');
      assert(stored.rows[0].offer_id === offerIds.primary && stored.rows[0].status === 'PENDING', 'références et statut persistés');
      assert(stored.rows[0].note === 'Disponible dès novembre.', 'note persistée');
    });

    await check('P0-E3 Authentification: candidat inconnu et requête sans session refusés (401)', async () => {
      const response = await harness.worker.fetch(applyRequest(
        offerIds.primary,
        null,
        'p0e3-unknown-candidate-001',
      ));
      assert(response.status === 401, `401 attendu sans session, reçu ${response.status}`);

      const unknownActor: AuthenticatedActor = {
        id: 'usr_p0e3_unknown_candidate',
        role: 'CANDIDATE',
        permissions: [],
        sessionId: 'ses_p0e3_unknown_candidate',
      };
      assert(harness.applications, 'repository candidature attendu dans la composition PostgreSQL');
      let error: unknown;
      try {
        await harness.applications.applyToOffer(
          unknownActor,
          offerIds.primary,
          {
            actor: unknownActor,
            command: 'applications.create',
            idempotencyKey: 'p0e3-unknown-candidate-002',
            requestId: 'req-p0e3-unknown',
          },
        );
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof ApiError && error.code === 'UNAUTHENTICATED', 'acteur CANDIDATE absent de PostgreSQL refusé');
    });

    await check('P0-E3 Rôle: EMPLOYER refusé pour la soumission (403)', async () => {
      const response = await harness.worker.fetch(applyRequest(
        offerIds.primary,
        employerToken,
        'p0e3-employer-submit-001',
      ));
      assert(response.status === 403, `403 attendu, reçu ${response.status}`);
    });

    await check('P0-E3 Compte bloqué: la soumission est refusée et aucune ligne n’est créée', async () => {
      await harness.database.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [candidateId]);
      const response = await harness.worker.fetch(applyRequest(
        offerIds.rollback,
        candidateToken,
        'p0e3-blocked-candidate-001',
      ));
      assert(response.status === 401 || response.status === 403, `401/403 attendu, reçu ${response.status}`);
      assert(await countApplications(harness, offerIds.rollback) === 0, 'aucune candidature créée pour le compte bloqué');

      await harness.database.query("UPDATE users SET status = 'PENDING' WHERE id = $1", [candidateId]);
      const pendingActor: AuthenticatedActor = {
        id: candidateId,
        role: 'CANDIDATE',
        permissions: [],
        sessionId: 'ses_p0e3_pending_candidate',
      };
      assert(harness.applications, 'repository candidature attendu dans la composition PostgreSQL');
      let pendingError: unknown;
      try {
        await harness.applications.applyToOffer(
          pendingActor,
          offerIds.rollback,
          {
            actor: pendingActor,
            command: 'applications.create',
            idempotencyKey: 'p0e3-pending-candidate-direct-001',
            requestId: 'req-p0e3-pending',
          },
        );
      } catch (error) {
        pendingError = error;
      }
      assert(pendingError instanceof ApiError && pendingError.code === 'FORBIDDEN', 'compte PENDING refusé par le repository');
      assert(await countApplications(harness, offerIds.rollback) === 0, 'aucune candidature créée pour le compte non actif');
      await harness.database.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [candidateId]);
    });

    await check('P0-E3 Offre inexistante refusée (404)', async () => {
      const response = await harness.worker.fetch(applyRequest(
        'ofr_p0e3_absent',
        candidateToken,
        'p0e3-missing-offer-001',
      ));
      assert(response.status === 404, `404 attendu, reçu ${response.status}`);
    });

    await check('P0-E3 Admissibilité: offres CANCELLED, FILLED et PAUSED refusées', async () => {
      for (const [label, offerId] of [
        ['CANCELLED', offerIds.cancelled],
        ['FILLED', offerIds.filled],
        ['PAUSED', offerIds.paused],
      ] as const) {
        const response = await harness.worker.fetch(applyRequest(
          offerId,
          candidateToken,
          `p0e3-ineligible-${label.toLowerCase()}-001`,
        ));
        assert(response.status === 409, `${label}: 409 attendu, reçu ${response.status}`);
        assert(await countApplications(harness, offerId) === 0, `${label}: aucune insertion attendue`);
      }
    });

    await check('P0-E3 Idempotence: même Idempotency-Key rejoue le même résultat sans seconde ligne', async () => {
      const first = await harness.worker.fetch(applyRequest(
        offerIds.primary,
        candidateToken,
        'p0e3-submit-primary-001',
        { note: 'Disponible dès novembre.', candidateId: otherEmployerId },
      ));
      assert(first.status === 201, `rejeu 201 attendu, reçu ${first.status}`);
      const replay = await first.json() as Application;
      assert(replay.id === primaryApplicationId, 'le replay renvoie la même candidature');
      assert(await countApplications(harness, offerIds.primary) === 1, 'une seule ligne pour candidat + offre');
    });

    await check('P0-E3 Idempotence: même clé avec note différente retourne 409', async () => {
      const response = await harness.worker.fetch(applyRequest(
        offerIds.primary,
        candidateToken,
        'p0e3-submit-primary-001',
        { note: 'Une charge utile différente.' },
      ));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      const body = await response.json() as { error: { code: string } };
      assert(body.error.code === 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT attendu');
    });

    await check('P0-E3 Doublon métier: une autre clé retrouve la candidature existante sans doublon', async () => {
      const response = await harness.worker.fetch(applyRequest(
        offerIds.primary,
        candidateToken,
        'p0e3-submit-primary-002',
        { note: 'Autre contenu ignoré car déjà candidat.' },
      ));
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const duplicate = await response.json() as Application;
      assert(duplicate.id === primaryApplicationId, 'la candidature existante est retournée');
      assert(await countApplications(harness, offerIds.primary) === 1, 'la contrainte métier empêche un double enregistrement');
    });

    await check('P0-E3 Concurrence: deux soumissions concurrentes du même candidat et de la même offre créent une seule ligne', async () => {
      const requestA = harness.worker.fetch(applyRequest(
        offerIds.concurrent,
        candidateToken,
        'p0e3-race-submit-key-001',
        { note: 'Soumission concurrente A.' },
      ));
      const requestB = harness.worker.fetch(applyRequest(
        offerIds.concurrent,
        candidateToken,
        'p0e3-race-submit-key-002',
        { note: 'Soumission concurrente B.' },
      ));
      const [responseA, responseB] = await Promise.all([requestA, requestB]);
      assert(responseA.status === 201 && responseB.status === 201, `201/201 attendus, reçus ${responseA.status}/${responseB.status}`);
      const [applicationA, applicationB] = await Promise.all([
        responseA.json() as Promise<Application>,
        responseB.json() as Promise<Application>,
      ]);
      assert(applicationA.id === applicationB.id, 'les deux requêtes reçoivent la candidature canonique');
      assert(await countApplications(harness, offerIds.concurrent) === 1, 'aucun doublon SQL concurrent');
    });

    await check('P0-E3 Éligibilité à l’écriture: une offre annulée avant la soumission est refusée', async () => {
      await createSqlOfferStore(harness.database).updateStatus(
        offerIds.changesBeforeSubmit,
        'CANCELLED',
        harness.clock.value.toISOString(),
      );
      const response = await harness.worker.fetch(applyRequest(
        offerIds.changesBeforeSubmit,
        candidateToken,
        'p0e3-changed-offer-key-001',
      ));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      assert(await countApplications(harness, offerIds.changesBeforeSubmit) === 0, 'aucune insertion sur offre devenue non admissible');
    });

    await check('P0-E3 Consultation: l’employeur propriétaire ne voit que les candidatures de cette offre', async () => {
      const response = await harness.worker.fetch(authRequest(
        `/api/v1/offers/${offerIds.primary}/applications?limit=20`,
        employerToken,
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const page = await response.json() as { items: Application[]; limit: number; hasMore: boolean };
      assert(page.items.length === 1 && page.items[0].id === primaryApplicationId, 'seule la candidature de cette offre est retournée');
      assert(page.items[0].candidateId === candidateId, 'candidat relu depuis le store');
      assert(page.limit === 20 && page.hasMore === false, 'enveloppe de page attendue');
    });

    await check('P0-E3 Consultation: un autre employeur reçoit 403', async () => {
      const response = await harness.worker.fetch(authRequest(
        `/api/v1/offers/${offerIds.primary}/applications`,
        otherEmployerToken,
      ));
      assert(response.status === 403, `403 attendu, reçu ${response.status}`);
    });

    await check('P0-E3 Confidentialité: un CANDIDATE ne peut pas lire la liste privée (403)', async () => {
      const response = await harness.worker.fetch(authRequest(
        `/api/v1/offers/${offerIds.primary}/applications`,
        candidateToken,
      ));
      assert(response.status === 403, `403 attendu, reçu ${response.status}`);
    });

    await check('P0-E3 Consultation concurrente: le propriétaire reçoit des résultats PostgreSQL cohérents', async () => {
      const path = `/api/v1/offers/${offerIds.primary}/applications?limit=20`;
      const [responseA, responseB] = await Promise.all([
        harness.worker.fetch(authRequest(path, employerToken)),
        harness.worker.fetch(authRequest(path, employerToken)),
      ]);
      assert(responseA.status === 200 && responseB.status === 200, 'deux consultations autorisées attendues');
      const [pageA, pageB] = await Promise.all([
        responseA.json() as Promise<{ items: Application[] }>,
        responseB.json() as Promise<{ items: Application[] }>,
      ]);
      assert(pageA.items.length === 1 && pageB.items.length === 1, 'les deux pages contiennent uniquement la candidature de l’offre');
      assert(pageA.items[0].id === pageB.items[0].id, 'les consultations simultanées sont cohérentes');
    });

    await check('P0-E3 Consultation SQL: pagination keyset bornée et curseur limité à la même offre', async () => {
      const secondCandidateId = 'usr_p0e3_page_candidate';
      const secondApplicationId = 'app_p0e3_page_candidate';
      await createSqlUserStore(harness.database).create({
        id: secondCandidateId,
        role: 'CANDIDATE',
        status: 'ACTIVE',
        email: 'p0e3.pagination@example.com',
        displayName: 'Pagination Candidate',
      });
      const appliedAt = new Date(harness.clock.value.getTime() + 1_000).toISOString();
      const record: ApplicationRecord = {
        id: secondApplicationId,
        offerId: offerIds.primary,
        candidateId: secondCandidateId,
        status: 'PENDING',
        appliedDate: appliedAt,
        history: [],
        createdAt: appliedAt,
        updatedAt: appliedAt,
      };
      await createSqlApplicationStore(harness.database).create(record);

      const firstResponse = await harness.worker.fetch(authRequest(
        `/api/v1/offers/${offerIds.primary}/applications?limit=1`,
        employerToken,
      ));
      assert(firstResponse.status === 200, `première page 200 attendue, reçu ${firstResponse.status}`);
      const firstPage = await firstResponse.json() as { items: Application[]; cursor: string | null; hasMore: boolean };
      assert(firstPage.items.length === 1 && firstPage.hasMore && firstPage.cursor, 'première page bornée et curseur attendu');

      const secondResponse = await harness.worker.fetch(authRequest(
        `/api/v1/offers/${offerIds.primary}/applications?limit=1&cursor=${encodeURIComponent(firstPage.cursor)}`,
        employerToken,
      ));
      assert(secondResponse.status === 200, `seconde page 200 attendue, reçu ${secondResponse.status}`);
      const secondPage = await secondResponse.json() as { items: Application[]; cursor: string | null; hasMore: boolean };
      assert(secondPage.items.length === 1 && secondPage.items[0].id === secondApplicationId, 'le curseur continue au candidat suivant');
      assert(secondPage.hasMore === false && secondPage.cursor === null, 'dernière page sans suite');
    });

    await check('P0-E3 Rollback SQL: une erreur après INSERT annule la candidature', async () => {
      const rolledBackId = 'app_p0e3_rollback';
      let rolledBack = false;
      try {
        await harness.database.run(async transaction => {
          await createSqlApplicationStore(transaction).create({
            id: rolledBackId,
            offerId: offerIds.rollback,
            candidateId,
            status: 'PENDING',
            appliedDate: harness.clock.value.toISOString(),
            history: [],
            createdAt: harness.clock.value.toISOString(),
            updatedAt: harness.clock.value.toISOString(),
          });
          throw new Error('SIMULATED_APPLICATION_TRANSACTION_FAILURE');
        });
      } catch (error) {
        rolledBack = String((error as Error)?.message ?? error).includes('SIMULATED_APPLICATION_TRANSACTION_FAILURE');
      }
      assert(rolledBack, 'erreur volontaire propagée');
      const found = await harness.database.query<{ id: string }>('SELECT id FROM applications WHERE id = $1', [rolledBackId]);
      assert(found.rows.length === 0, 'aucune candidature ne survit au ROLLBACK');
    });

    await check('P0-E3/P0-E4 Périmètre: les listes générales restent fermées (501); les quatre décisions sont ouvertes par P0-E4', async () => {
      // P0-E3 n'ouvrait que la soumission et la consultation par offre
      // propriétaire. P0-E4 ouvre les quatre décisions du cycle (examine,
      // shortlist, reject, withdraw) : elles ne doivent plus répondre 501.
      const closedResponses = await Promise.all([
        harness.worker.fetch(authRequest('/api/v1/my/applications', candidateToken)),
        harness.worker.fetch(authRequest('/api/v1/employer/applications', employerToken)),
        harness.worker.fetch(authRequest(`/api/v1/applications/${primaryApplicationId}`, candidateToken)),
      ]);
      assert(closedResponses.length === 3, 'trois opérations APPLICATION non ouvertes sont contrôlées');
      assert(closedResponses.every(response => response.status === 501),
        `les handlers non ouverts doivent répondre 501, reçus ${closedResponses.map(response => response.status).join('/')}`);

      const decisions: Array<[string, 'withdraw' | 'examine' | 'shortlist' | 'reject', string]> = [
        ['examine', 'examine', employerToken],
        ['shortlist', 'shortlist', employerToken],
        ['reject', 'reject', employerToken],
        ['withdraw', 'withdraw', candidateToken],
      ];
      const statuses: string[] = [];
      for (const [label, action, token] of decisions) {
        const response = await harness.worker.fetch(authRequest(
          `/api/v1/applications/${primaryApplicationId}/${action}`,
          token,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'Idempotency-Key': `p0e4-open-${label}-001` },
            body: action === 'reject' ? JSON.stringify({ note: 'Contrôle de périmètre P0-E4.' }) : '{}',
          },
        ));
        assert(response.status !== 501, `${label} doit être ouvert par P0-E4, reçu 501`);
        statuses.push(`${label}:${response.status}`);
      }
      // PENDING → REVIEW → SHORTLISTED → REJECTED, puis retrait refusé (terminal).
      assert(
        statuses.join(' ') === 'examine:200 shortlist:200 reject:200 withdraw:409',
        `enchaînement P0-E4 attendu, reçu ${statuses.join(' ')}`,
      );
    });

    await check('P0-E3 Séparation DEMO/API: DEMO reste Mock par défaut, API activée explicitement', async () => {
      const demo = resolveRepositoryMode({});
      const api = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' });
      assert(demo.mode === 'mock', 'MODE DEMO doit rester le défaut');
      assert(api.mode === 'api', 'MODE API exige la configuration explicite same-origin');
      assert(await countApplications(harness, offerIds.primary) === 2, 'les deux candidatures proviennent du store PostgreSQL, sans fallback mock/localStorage');
    });
  } finally {
    await harness.close();
    applicationIdempotencyCache.clear();
  }

  return results;
}
