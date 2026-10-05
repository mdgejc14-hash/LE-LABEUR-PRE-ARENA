/**
 * LE LABEUR — P0-E4 — tests Worker/API → repository métier → PostgreSQL
 * du CYCLE DE DÉCISION d'une candidature.
 *
 * Périmètre ouvert : EXAMINE, SHORTLIST, REJECT (employeur propriétaire) et
 * WITHDRAW (candidat propriétaire). Propositions, contrats, paiements,
 * commissions, plaintes, remplacements et notifications générales restent
 * fermés (501) : une vérification explicite le confirme.
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from './offers.test';
import { ApiError } from './errors';
import type { AuthenticatedActor } from '../productionContracts';
import type { ApplicationRecord, ContractRecord, OfferRecord } from '../persistence/coreRecords';
import { createSqlUserStore } from '../identity/sqlStores';
import {
  createSqlApplicationStore,
  createSqlContractStore,
  createSqlOfferStore,
} from '../persistence/sqlCoreStores';
import { applicationIdempotencyCache } from '../repositories/applicationRepository';
import { resolveRepositoryMode } from '../../repositories/mode';
import type { Application, ApplicationStatus } from '../../types';

type DecisionAction = 'examine' | 'shortlist' | 'reject' | 'withdraw';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeOffer(
  id: string,
  employerId: string,
  status: OfferRecord['status'] = 'ACTIVE',
): OfferRecord {
  const timestamp = '2026-10-05T15:00:00.000Z';
  return {
    id,
    employerId,
    title: `Offre ${id}`,
    contractType: 'CDI',
    remuneration: 150_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: timestamp,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre de test P0-E4.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

let seedCounter = 0;

async function seedApplication(
  harness: Harness,
  input: { offerId: string; candidateId: string; status?: ApplicationStatus; contractId?: string },
): Promise<string> {
  seedCounter += 1;
  const timestamp = new Date(harness.clock.value.getTime() + seedCounter * 1_000).toISOString();
  const record: ApplicationRecord = {
    id: `app_p0e4_${String(seedCounter).padStart(3, '0')}`,
    offerId: input.offerId,
    candidateId: input.candidateId,
    status: input.status ?? 'PENDING',
    appliedDate: timestamp,
    history: [{ action: 'Candidature transmise', timestamp, actor: 'Jean Candidat' }],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.contractId ? { contractId: input.contractId } : {}),
  };
  await createSqlApplicationStore(harness.database).create(record);
  return record.id;
}

/**
 * Contrat minimal UNIQUEMENT pour vérifier le garde « candidature déjà liée à
 * un contrat » : le domaine CONTRAT reste fermé en P0-E4, aucune route ni
 * transition de contrat n'est ouverte ici.
 */
async function seedContract(
  harness: Harness,
  input: { id: string; offerId: string; applicationId: string; employerId: string; candidateId: string },
): Promise<void> {
  const timestamp = harness.clock.value.toISOString();
  const record: ContractRecord = {
    id: input.id,
    offerId: input.offerId,
    applicationId: input.applicationId,
    employerId: input.employerId,
    employeeId: input.candidateId,
    status: 'SIGNATURE',
    monthlySalary: 150_000,
    currency: 'FCFA',
    startDate: '2026-11-01',
    currentMonth: 1,
    durationMonths: 6,
    periodicity: 'Mensuel',
    missionDescription: 'Mission hors périmètre P0-E4 (fixture de test).',
    location: 'Cotonou',
    conditions: [],
    employerSigned: false,
    employeeSigned: false,
    commissionPercentage: 25,
    commissionAmountDue: 37_500,
    commissionStatus: 'SCHEDULED',
    monthlyCheckpoints: [],
    commissionLedger: [],
    paymentSchedule: [],
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await createSqlContractStore(harness.database).create(record);
}

function decisionRequest(
  applicationId: string,
  token: string | null,
  action: DecisionAction,
  key: string,
  body: Record<string, unknown> = {},
): Request {
  return authRequest(`/api/v1/applications/${encodeURIComponent(applicationId)}/${action}`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

interface PersistedApplication {
  status: string;
  note: string | null;
  history: Array<{ action: string; timestamp: string; actor: string }>;
  updatedAt: string;
}

async function readApplication(harness: Harness, applicationId: string): Promise<PersistedApplication | null> {
  const result = await harness.database.query<{
    status: string;
    note: string | null;
    history: unknown;
    updated_at: unknown;
  }>('SELECT status, note, history, updated_at FROM applications WHERE id = $1', [applicationId]);
  const row = result.rows[0];
  if (!row) return null;
  const history = typeof row.history === 'string' ? JSON.parse(row.history) : row.history;
  return {
    status: row.status,
    note: row.note,
    history: Array.isArray(history) ? history as PersistedApplication['history'] : [],
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ''),
  };
}

export async function runApplicationDecisionTests(): Promise<OfferTestResult[]> {
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
  let otherCandidateToken = '';
  let otherCandidateId = '';
  let employerToken = '';
  let employerId = '';
  let otherEmployerToken = '';

  // Une offre dédiée par scénario : la contrainte UNIQUE(offer_id, candidate_id)
  // du modèle réel interdit deux candidatures d'un même candidat sur une offre.
  const offerIds = {
    examine: 'ofr_p0e4_examine',
    blockedEmployer: 'ofr_p0e4_blocked_employer',
    shortlist: 'ofr_p0e4_shortlist',
    reject: 'ofr_p0e4_reject',
    rejectBlank: 'ofr_p0e4_reject_blank',
    withdraw: 'ofr_p0e4_withdraw',
    withdrawOtherCandidate: 'ofr_p0e4_withdraw_other_candidate',
    withdrawEmployer: 'ofr_p0e4_withdraw_employer',
    concurrentExamine: 'ofr_p0e4_concurrent_examine',
    concurrentMixed: 'ofr_p0e4_concurrent_mixed',
    terminal: 'ofr_p0e4_terminal',
    sequences: 'ofr_p0e4_sequences',
    shortlistedExamine: 'ofr_p0e4_shortlisted_examine',
    otherEmployer: 'ofr_p0e4_other_employer',
    unknownActor: 'ofr_p0e4_unknown_actor',
    paused: 'ofr_p0e4_paused',
    rollback: 'ofr_p0e4_rollback',
    compareAndSet: 'ofr_p0e4_compare_and_set',
    contracted: 'ofr_p0e4_contracted',
    idempotent: 'ofr_p0e4_idempotent',
    idempotentConflict: 'ofr_p0e4_idempotent_conflict',
    idempotentRepeat: 'ofr_p0e4_idempotent_repeat',
  };

  try {
    await check('P0-E4 Setup: sessions candidat, autre candidat, employeur propriétaire, autre employeur + offres', async () => {
      const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      candidateToken = candidate.token;
      candidateId = candidate.userId;
      const otherCandidate = await authenticateActor(harness, 'candidate-2', 'CANDIDATE');
      otherCandidateToken = otherCandidate.token;
      otherCandidateId = otherCandidate.userId;
      const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      employerToken = employer.token;
      employerId = employer.userId;
      const otherEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      otherEmployerToken = otherEmployer.token;

      const offers = createSqlOfferStore(harness.database);
      for (const [key, id] of Object.entries(offerIds)) {
        await offers.create(makeOffer(id, employerId, key === 'paused' ? 'PAUSED' : 'ACTIVE'));
      }
      assert(candidateId !== otherCandidateId, 'deux candidats distincts');
    });

    /* ---------------- 1. EXAMEN par le propriétaire ---------------- */

    let examinedId = '';
    await check('P0-E4 Examen: EMPLOYER propriétaire PENDING → REVIEW, persistance PostgreSQL et historique', async () => {
      examinedId = await seedApplication(harness, { offerId: offerIds.examine, candidateId });
      const response = await harness.worker.fetch(decisionRequest(
        examinedId, employerToken, 'examine', 'p0e4-examine-owner-001',
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const application = await response.json() as Application;
      assert(application.status === 'REVIEW', `statut REVIEW attendu, reçu ${application.status}`);
      assert(application.id === examinedId, 'candidature visée');

      const stored = await readApplication(harness, examinedId);
      assert(stored?.status === 'REVIEW', 'statut REVIEW réellement persisté');
      assert(
        stored?.history.length === 2 && /examen/i.test(stored.history[1].action),
        `entrée d’historique d’examen persistée, reçu ${JSON.stringify(stored?.history)}`,
      );
    });

    await check('P0-E4 Examen répété: aucune seconde transition, historique inchangé', async () => {
      const response = await harness.worker.fetch(decisionRequest(
        examinedId, employerToken, 'examine', 'p0e4-examine-owner-002',
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const stored = await readApplication(harness, examinedId);
      assert(stored?.status === 'REVIEW', 'statut inchangé');
      assert(stored?.history.length === 2, `aucune entrée d’historique dupliquée, reçu ${stored?.history.length}`);
    });

    /* ---------------- 2. SHORTLIST par le propriétaire ---------------- */

    let shortlistedId = '';
    await check('P0-E4 Shortlist: EMPLOYER propriétaire REVIEW → SHORTLISTED, persistance PostgreSQL', async () => {
      shortlistedId = await seedApplication(harness, { offerId: offerIds.shortlist, candidateId, status: 'REVIEW' });
      const response = await harness.worker.fetch(decisionRequest(
        shortlistedId, employerToken, 'shortlist', 'p0e4-shortlist-owner-001',
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const application = await response.json() as Application;
      assert(application.status === 'SHORTLISTED', `SHORTLISTED attendu, reçu ${application.status}`);
      const stored = await readApplication(harness, shortlistedId);
      assert(stored?.status === 'SHORTLISTED', 'SHORTLISTED réellement persisté');
      assert(
        stored?.history.some(entry => /sélectionné|selectionne/i.test(entry.action)),
        'entrée d’historique de sélection persistée',
      );
    });

    await check('P0-E4 Shortlist: PENDING → SHORTLISTED direct également autorisé par le modèle réel', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.shortlist, candidateId: otherCandidateId });
      const response = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'shortlist', 'p0e4-shortlist-direct-001',
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      assert((await readApplication(harness, id))?.status === 'SHORTLISTED', 'SHORTLISTED persisté');
    });

    await check('P0-E4 Shortlist: offre non ACTIVE refusée (409)', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.paused, candidateId });
      const response = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'shortlist', 'p0e4-shortlist-paused-001',
      ));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      assert((await readApplication(harness, id))?.status === 'PENDING', 'candidature inchangée');
    });

    /* ---------------- 3. REJET par le propriétaire ---------------- */

    await check('P0-E4 Rejet: EMPLOYER propriétaire REVIEW → REJECTED, motif enregistré et persisté', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.reject, candidateId, status: 'REVIEW' });
      const response = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'reject', 'p0e4-reject-owner-001',
        { note: 'Profil trop junior pour la mission.' },
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const application = await response.json() as Application;
      assert(application.status === 'REJECTED', `REJECTED attendu, reçu ${application.status}`);
      assert(application.note === 'Profil trop junior pour la mission.', `motif restitué, reçu ${application.note}`);

      const stored = await readApplication(harness, id);
      assert(stored?.status === 'REJECTED', 'REJECTED réellement persisté');
      assert(stored?.note === 'Profil trop junior pour la mission.', 'motif persisté dans PostgreSQL');
      assert(
        stored?.history.some(entry => entry.action.includes('Profil trop junior pour la mission.')),
        'motif repris dans l’historique',
      );
    });

    await check('P0-E4 Rejet sans motif: le défaut du modèle réel est appliqué (aucun champ inventé)', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.reject, candidateId: otherCandidateId });
      const response = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'reject', 'p0e4-reject-default-001',
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const stored = await readApplication(harness, id);
      assert(stored?.status === 'REJECTED', 'REJECTED persisté');
      assert(
        stored?.note === 'Dossier non retenu pour cette mission.',
        `défaut du modèle réel appliqué, reçu ${stored?.note}`,
      );
    });

    await check('P0-E4 Rejet: motif blanc ignoré, défaut du modèle réel conservé', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.rejectBlank, candidateId });
      const response = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'reject', 'p0e4-reject-blank-001',
        { note: '    ' },
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const stored = await readApplication(harness, id);
      assert(stored?.status === 'REJECTED', 'REJECTED persisté');
      assert(stored?.note === 'Dossier non retenu pour cette mission.', 'motif vide non persisté');
    });

    /* ---------------- 4. RETRAIT par le candidat ---------------- */

    await check('P0-E4 Retrait: CANDIDATE propriétaire SHORTLISTED → WITHDRAWN, persistance PostgreSQL', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.withdraw, candidateId, status: 'SHORTLISTED' });
      const response = await harness.worker.fetch(decisionRequest(
        id, candidateToken, 'withdraw', 'p0e4-withdraw-owner-001',
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const application = await response.json() as Application;
      assert(application.status === 'WITHDRAWN', `WITHDRAWN attendu, reçu ${application.status}`);
      const stored = await readApplication(harness, id);
      assert(stored?.status === 'WITHDRAWN', 'WITHDRAWN réellement persisté');
      assert(
        stored?.history.some(entry => /retirée/i.test(entry.action)),
        'entrée d’historique de retrait persistée',
      );
    });

    await check('P0-E4 Retrait: PENDING → WITHDRAWN autorisé par le modèle réel', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.withdraw, candidateId: otherCandidateId });
      const response = await harness.worker.fetch(decisionRequest(
        id, otherCandidateToken, 'withdraw', 'p0e4-withdraw-pending-001',
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      assert((await readApplication(harness, id))?.status === 'WITHDRAWN', 'WITHDRAWN persisté');
    });

    /* ---------------- 5. AUTORISATION ---------------- */

    await check('P0-E4 Autorisation: un autre EMPLOYER est refusé (403) sur les trois décisions', async () => {
      const targets: Array<[DecisionAction, string]> = [
        ['examine', await seedApplication(harness, { offerId: offerIds.otherEmployer, candidateId })],
        ['shortlist', shortlistedId],
        ['reject', shortlistedId],
      ];
      for (const [action, target] of targets) {
        const response = await harness.worker.fetch(decisionRequest(
          target,
          otherEmployerToken,
          action,
          `p0e4-other-employer-${action}-001`,
          action === 'reject' ? { note: 'Refus non autorisé.' } : {},
        ));
        assert(response.status === 403, `${action}: 403 attendu, reçu ${response.status}`);
      }
      assert((await readApplication(harness, targets[0][1]))?.status === 'PENDING', 'aucune modification par un tiers');
      assert((await readApplication(harness, shortlistedId))?.status === 'SHORTLISTED', 'candidature shortlistée intacte');
    });

    await check('P0-E4 Autorisation: un autre CANDIDATE ne peut pas retirer la candidature d’un tiers (403)', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.withdrawOtherCandidate, candidateId });
      const response = await harness.worker.fetch(decisionRequest(
        id, otherCandidateToken, 'withdraw', 'p0e4-other-candidate-withdraw-001',
      ));
      assert(response.status === 403, `403 attendu, reçu ${response.status}`);
      assert((await readApplication(harness, id))?.status === 'PENDING', 'candidature du tiers intacte');
    });

    await check('P0-E4 Autorisation: un EMPLOYER ne peut pas retirer une candidature (403)', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.withdrawEmployer, candidateId });
      const response = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'withdraw', 'p0e4-employer-withdraw-001',
      ));
      assert(response.status === 403, `403 attendu, reçu ${response.status}`);
      assert((await readApplication(harness, id))?.status === 'PENDING', 'candidature intacte');
    });

    await check('P0-E4 Autorisation: acteur inconnu (aucune ligne PostgreSQL) refusé par le repository', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.unknownActor, candidateId });
      const unknownEmployer: AuthenticatedActor = {
        id: 'usr_p0e4_unknown_employer',
        role: 'EMPLOYER',
        permissions: [],
        sessionId: 'ses_p0e4_unknown_employer',
      };
      const unknownCandidate: AuthenticatedActor = {
        id: 'usr_p0e4_unknown_candidate',
        role: 'CANDIDATE',
        permissions: [],
        sessionId: 'ses_p0e4_unknown_candidate',
      };
      assert(harness.applications, 'repository candidature attendu dans la composition PostgreSQL');
      const calls: Array<() => Promise<unknown>> = [
        () => harness.applications!.examine(unknownEmployer, id, {
          actor: unknownEmployer, command: 'applications.examine', idempotencyKey: 'p0e4-unknown-examine-001', requestId: 'req-p0e4-unknown',
        }),
        () => harness.applications!.shortlist(unknownEmployer, id, {
          actor: unknownEmployer, command: 'applications.shortlist', idempotencyKey: 'p0e4-unknown-shortlist-001', requestId: 'req-p0e4-unknown',
        }),
        () => harness.applications!.reject(unknownEmployer, id, 'Motif', {
          actor: unknownEmployer, command: 'applications.reject', idempotencyKey: 'p0e4-unknown-reject-001', requestId: 'req-p0e4-unknown',
        }),
        () => harness.applications!.withdraw(unknownCandidate, id, {
          actor: unknownCandidate, command: 'applications.withdraw', idempotencyKey: 'p0e4-unknown-withdraw-001', requestId: 'req-p0e4-unknown',
        }),
      ];
      for (const call of calls) {
        let error: unknown;
        try {
          await call();
        } catch (caught) {
          error = caught;
        }
        assert(
          error instanceof ApiError && error.code === 'UNAUTHENTICATED',
          `UNAUTHENTICATED attendu, reçu ${String(error)}`,
        );
      }
      assert((await readApplication(harness, id))?.status === 'PENDING', 'aucune écriture pour un acteur inconnu');
    });

    await check('P0-E4 Compte bloqué: employeur propriétaire non ACTIF ne peut plus décider et l’état est intact', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.blockedEmployer, candidateId });

      await harness.database.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [employerId]);
      const blockedResponse = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'examine', 'p0e4-blocked-employer-001',
      ));
      assert(
        blockedResponse.status === 401 || blockedResponse.status === 403,
        `401/403 attendu pour un compte bloqué, reçu ${blockedResponse.status}`,
      );
      assert((await readApplication(harness, id))?.status === 'PENDING', 'aucune décision appliquée par un compte bloqué');

      // Règle repository (compte non ACTIF) vérifiée directement, sans session HTTP.
      await harness.database.query("UPDATE users SET status = 'PENDING' WHERE id = $1", [employerId]);
      const pendingActor: AuthenticatedActor = {
        id: employerId, role: 'EMPLOYER', permissions: [], sessionId: 'ses_p0e4_pending_employer',
      };
      let error: unknown;
      try {
        await harness.applications!.examine(pendingActor, id, {
          actor: pendingActor, command: 'applications.examine', idempotencyKey: 'p0e4-pending-employer-001', requestId: 'req-p0e4-pending',
        });
      } catch (caught) {
        error = caught;
      }
      assert(
        error instanceof ApiError && error.code === 'FORBIDDEN',
        `FORBIDDEN attendu pour un compte non actif, reçu ${String(error)}`,
      );
      assert((await readApplication(harness, id))?.status === 'PENDING', 'aucune écriture pour un compte non actif');

      await harness.database.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [employerId]);
    });

    /* ---------------- 6. TRANSITIONS INTERDITES ---------------- */

    await check('P0-E4 Transition interdite: REJECTED et WITHDRAWN ne sont plus modifiables (409)', async () => {
      const rejected = await seedApplication(harness, { offerId: offerIds.terminal, candidateId, status: 'REJECTED' });
      const withdrawn = await seedApplication(harness, { offerId: offerIds.terminal, candidateId: otherCandidateId, status: 'WITHDRAWN' });

      for (const action of ['examine', 'shortlist', 'reject'] as const) {
        const response = await harness.worker.fetch(decisionRequest(
          rejected, employerToken, action, `p0e4-terminal-rejected-${action}-001`,
          action === 'reject' ? { note: 'Refus tardif.' } : {},
        ));
        assert(response.status === 409, `REJECTED/${action}: 409 attendu, reçu ${response.status}`);
      }
      const withdrawAfterReject = await harness.worker.fetch(decisionRequest(
        rejected, candidateToken, 'withdraw', 'p0e4-terminal-rejected-withdraw-001',
      ));
      assert(withdrawAfterReject.status === 409, `retrait après rejet: 409 attendu, reçu ${withdrawAfterReject.status}`);

      for (const action of ['examine', 'shortlist', 'reject'] as const) {
        const response = await harness.worker.fetch(decisionRequest(
          withdrawn, employerToken, action, `p0e4-terminal-withdrawn-${action}-001`,
          action === 'reject' ? { note: 'Refus tardif.' } : {},
        ));
        assert(response.status === 409, `WITHDRAWN/${action}: 409 attendu, reçu ${response.status}`);
      }
      const replayWithdraw = await harness.worker.fetch(decisionRequest(
        withdrawn, otherCandidateToken, 'withdraw', 'p0e4-terminal-withdrawn-replay-002',
      ));
      assert(
        replayWithdraw.status === 409,
        `WITHDRAWN est terminal: 409 attendu même pour un retrait répété, reçu ${replayWithdraw.status}`,
      );
      assert((await readApplication(harness, withdrawn))?.history.length === 1, 'aucune entrée d’historique ajoutée');

      assert((await readApplication(harness, rejected))?.status === 'REJECTED', 'REJECTED inchangé');
      assert((await readApplication(harness, withdrawn))?.status === 'WITHDRAWN', 'WITHDRAWN inchangé');
    });

    await check('P0-E4 Transition interdite: EXAMINE après SHORTLIST refusé (409)', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.shortlistedExamine, candidateId, status: 'SHORTLISTED' });
      const response = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'examine', 'p0e4-shortlisted-examine-001',
      ));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      assert((await readApplication(harness, id))?.status === 'SHORTLISTED', 'SHORTLISTED inchangé');
    });

    await check('P0-E4 Séquences: décision après retrait refusée; retrait après shortlist autorisé', async () => {
      const first = await seedApplication(harness, { offerId: offerIds.sequences, candidateId });
      const withdraw = await harness.worker.fetch(decisionRequest(first, candidateToken, 'withdraw', 'p0e4-seq-withdraw-001'));
      assert(withdraw.status === 200, `retrait 200 attendu, reçu ${withdraw.status}`);
      const examineAfterWithdraw = await harness.worker.fetch(decisionRequest(
        first, employerToken, 'examine', 'p0e4-seq-examine-after-withdraw-001',
      ));
      assert(examineAfterWithdraw.status === 409, `décision après retrait: 409 attendu, reçu ${examineAfterWithdraw.status}`);
      assert((await readApplication(harness, first))?.status === 'WITHDRAWN', 'WITHDRAWN préservé');

      const second = await seedApplication(harness, { offerId: offerIds.sequences, candidateId: otherCandidateId });
      const shortlist = await harness.worker.fetch(decisionRequest(second, employerToken, 'shortlist', 'p0e4-seq-shortlist-001'));
      assert(shortlist.status === 200, `shortlist 200 attendu, reçu ${shortlist.status}`);
      const withdrawAfterDecision = await harness.worker.fetch(decisionRequest(
        second, otherCandidateToken, 'withdraw', 'p0e4-seq-withdraw-after-shortlist-001',
      ));
      assert(withdrawAfterDecision.status === 200, `retrait après décision: 200 attendu, reçu ${withdrawAfterDecision.status}`);
      assert((await readApplication(harness, second))?.status === 'WITHDRAWN', 'WITHDRAWN final persisté');
    });

    await check('P0-E4 Candidature liée à un contrat: aucune décision P0-E4 autorisée (409)', async () => {
      const applicationId = 'app_p0e4_contracted';
      seedCounter += 1;
      const timestamp = harness.clock.value.toISOString();
      await createSqlApplicationStore(harness.database).create({
        id: applicationId,
        offerId: offerIds.contracted,
        candidateId,
        status: 'SHORTLISTED',
        appliedDate: timestamp,
        history: [{ action: 'Candidature transmise', timestamp, actor: 'Jean Candidat' }],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      // Le contrat référence l'application et l'application référence le
      // contrat : la fixture respecte l'ordre imposé par les clés étrangères.
      await seedContract(harness, {
        id: 'ctr_p0e4_fixture',
        offerId: offerIds.contracted,
        applicationId,
        employerId,
        candidateId,
      });
      await harness.database.query('UPDATE applications SET contract_id = $2 WHERE id = $1', [
        applicationId,
        'ctr_p0e4_fixture',
      ]);

      for (const action of ['examine', 'shortlist', 'reject'] as const) {
        const response = await harness.worker.fetch(decisionRequest(
          applicationId, employerToken, action, `p0e4-contracted-${action}-001`,
          action === 'reject' ? { note: 'Hors périmètre.' } : {},
        ));
        assert(response.status === 409, `${action} sur candidature contractée: 409 attendu, reçu ${response.status}`);
      }
      const withdraw = await harness.worker.fetch(decisionRequest(
        applicationId, candidateToken, 'withdraw', 'p0e4-contracted-withdraw-001',
      ));
      assert(withdraw.status === 409, `retrait sur candidature contractée: 409 attendu, reçu ${withdraw.status}`);
      assert((await readApplication(harness, applicationId))?.status === 'SHORTLISTED', 'statut inchangé');
    });

    /* ---------------- 7. IDEMPOTENCE ---------------- */

    await check('P0-E4 Idempotence: même Idempotency-Key rejoue le même résultat sans double effet', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.idempotent, candidateId });
      const first = await harness.worker.fetch(decisionRequest(id, employerToken, 'examine', 'p0e4-idem-examine-001'));
      assert(first.status === 200, `200 attendu, reçu ${first.status}`);
      const firstBody = await first.json() as Application;

      const replay = await harness.worker.fetch(decisionRequest(id, employerToken, 'examine', 'p0e4-idem-examine-001'));
      assert(replay.status === 200, `rejeu 200 attendu, reçu ${replay.status}`);
      const replayBody = await replay.json() as Application;
      assert(replayBody.id === firstBody.id && replayBody.status === 'REVIEW', 'même candidature rejouée');

      const stored = await readApplication(harness, id);
      assert(stored?.status === 'REVIEW', 'une seule transition persistée');
      assert(stored?.history.length === 2, `une seule entrée d’historique ajoutée, reçu ${stored?.history.length}`);
    });

    await check('P0-E4 Idempotence: même clé avec charge utile différente → 409 IDEMPOTENCY_CONFLICT', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.idempotentConflict, candidateId });
      const first = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'reject', 'p0e4-idem-conflict-001', { note: 'Motif A.' },
      ));
      assert(first.status === 200, `200 attendu, reçu ${first.status}`);
      const conflict = await harness.worker.fetch(decisionRequest(
        id, employerToken, 'reject', 'p0e4-idem-conflict-001', { note: 'Motif B.' },
      ));
      assert(conflict.status === 409, `409 attendu, reçu ${conflict.status}`);
      const body = await conflict.json() as { error: { code: string } };
      assert(body.error.code === 'IDEMPOTENCY_CONFLICT', `IDEMPOTENCY_CONFLICT attendu, reçu ${body.error.code}`);
      assert((await readApplication(harness, id))?.note === 'Motif A.', 'le premier motif reste la référence');
    });

    await check('P0-E4 Idempotence: action répétée avec une clé différente → statut inchangé, historique unique', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.idempotentRepeat, candidateId });
      const first = await harness.worker.fetch(decisionRequest(id, employerToken, 'shortlist', 'p0e4-idem-repeat-a-001'));
      const second = await harness.worker.fetch(decisionRequest(id, employerToken, 'shortlist', 'p0e4-idem-repeat-b-001'));
      assert(first.status === 200 && second.status === 200, `200/200 attendus, reçus ${first.status}/${second.status}`);
      const stored = await readApplication(harness, id);
      assert(stored?.status === 'SHORTLISTED', 'SHORTLISTED persisté une seule fois');
      assert(stored?.history.length === 2, `aucune entrée d’historique dupliquée, reçu ${stored?.history.length}`);
    });

    /* ---------------- 8. CONCURRENCE ---------------- */

    await check('P0-E4 Concurrence: deux examens simultanés → une seule transition appliquée', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.concurrentExamine, candidateId });
      const [first, second] = await Promise.all([
        harness.worker.fetch(decisionRequest(id, employerToken, 'examine', 'p0e4-race-examine-a-001')),
        harness.worker.fetch(decisionRequest(id, employerToken, 'examine', 'p0e4-race-examine-b-001')),
      ]);
      assert(first.status === 200 && second.status === 200, `200/200 attendus, reçus ${first.status}/${second.status}`);
      const [bodyA, bodyB] = await Promise.all([
        first.json() as Promise<Application>,
        second.json() as Promise<Application>,
      ]);
      assert(bodyA.status === 'REVIEW' && bodyB.status === 'REVIEW', 'les deux réponses décrivent l’état final');
      const stored = await readApplication(harness, id);
      assert(stored?.status === 'REVIEW', 'REVIEW persisté une seule fois');
      assert(stored?.history.length === 2, `une seule entrée d’examen, reçu ${stored?.history.length}`);
    });

    await check('P0-E4 Concurrence: décision employeur et retrait candidat simultanés → aucun état impossible', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.concurrentMixed, candidateId });
      const [decision, withdraw] = await Promise.all([
        harness.worker.fetch(decisionRequest(id, employerToken, 'shortlist', 'p0e4-race-shortlist-001')),
        harness.worker.fetch(decisionRequest(id, candidateToken, 'withdraw', 'p0e4-race-withdraw-001')),
      ]);
      for (const response of [decision, withdraw]) {
        assert(
          response.status === 200 || response.status === 409,
          `200/409 attendus (jamais 5xx), reçu ${response.status}`,
        );
      }
      const stored = await readApplication(harness, id);
      assert(
        stored?.status === 'SHORTLISTED' || stored?.status === 'WITHDRAWN',
        `état final légal attendu, reçu ${stored?.status}`,
      );
      assert((stored?.history.length ?? 0) <= 3, `aucun historique perdu ni dupliqué, reçu ${stored?.history.length}`);
    });

    /* ---------------- 9. ROLLBACK POSTGRESQL ---------------- */

    await check('P0-E4 Rollback SQL: une décision dans une transaction échouée n’est pas persistée', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.rollback, candidateId });
      const before = await readApplication(harness, id);
      let failed = false;
      try {
        await harness.database.run(async transaction => {
          await createSqlApplicationStore(transaction).compareAndSetStatus(id, 'PENDING', {
            status: 'REVIEW',
            updatedAt: harness.clock.value.toISOString(),
            historyEntry: {
              action: 'Dossier passé en examen technique',
              timestamp: harness.clock.value.toISOString(),
              actor: 'Rollback Test',
            },
          });
          throw new Error('SIMULATED_P0E4_DECISION_TRANSACTION_FAILURE');
        });
      } catch (error) {
        failed = String((error as Error)?.message ?? error).includes('SIMULATED_P0E4_DECISION_TRANSACTION_FAILURE');
      }
      assert(failed, 'erreur volontaire propagée');
      const after = await readApplication(harness, id);
      assert(after?.status === before?.status && after?.status === 'PENDING', 'statut inchangé après ROLLBACK');
      assert(after?.history.length === before?.history.length, 'aucune entrée d’historique survivante');
    });

    await check('P0-E4 Compare-and-set: une décision depuis un statut obsolète n’écrit rien', async () => {
      const id = await seedApplication(harness, { offerId: offerIds.compareAndSet, candidateId });
      const stale = await createSqlApplicationStore(harness.database).compareAndSetStatus(id, 'REVIEW', {
        status: 'REJECTED',
        updatedAt: harness.clock.value.toISOString(),
        historyEntry: { action: 'Décision périmée', timestamp: harness.clock.value.toISOString(), actor: 'Test' },
      });
      assert(stale === null, 'une transition depuis un statut obsolète ne doit rien écrire');
      assert((await readApplication(harness, id))?.status === 'PENDING', 'statut PENDING préservé');
    });

    /* ---------------- 10. PÉRIMÈTRE ET SÉPARATION DEMO/API ---------------- */

    await check('P0-E4 Périmètre: paiements, incidents, remplacements et messages restent fermés (501)', async () => {
      // Les propositions ont été ouvertes par P0-E5 (`/conversations/:id/proposals`)
      // et les contrats par P0-F (`/contracts` n'est plus un handler absent) ; ce
      // test conserve la frontière fermée des autres domaines, sans affaiblir le
      // contrôle P0-E4.
      const closed = await Promise.all([
        harness.worker.fetch(authRequest('/api/v1/conversations/cnv_p0e4/messages', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0e4-closed-messages-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/replacements/rep_p0e4_absent', employerToken)),
        harness.worker.fetch(authRequest('/api/v1/payments/commission-declarations', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0e4-closed-payments-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/incidents', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0e4-closed-incidents-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/my/applications', candidateToken)),
        harness.worker.fetch(authRequest('/api/v1/employer/applications', employerToken)),
        harness.worker.fetch(authRequest(`/api/v1/applications/${examinedId}`, candidateToken)),
      ]);
      assert(
        closed.every(response => response.status === 501),
        `501 attendu pour tout handler non ouvert, reçus ${closed.map(response => response.status).join('/')}`,
      );
    });

    await check('P0-E4 Séparation DEMO/API: DEMO reste Mock par défaut, état de référence en PostgreSQL', async () => {
      const demo = resolveRepositoryMode({});
      const api = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' });
      assert(demo.mode === 'mock', 'MODE DEMO doit rester le défaut');
      assert(api.mode === 'api', 'MODE API exige la configuration explicite same-origin');

      // Les décisions P0-E4 passées par l’API ont écrit dans PostgreSQL et
      // nulle part ailleurs : aucune retombée mock/localStorage.
      const stored = await readApplication(harness, examinedId);
      assert(stored?.status === 'REVIEW', 'l’état de référence reste la ligne PostgreSQL');
      const user = await createSqlUserStore(harness.database).findById(candidateId);
      assert(user?.id === candidateId, 'les acteurs sont relus depuis PostgreSQL');
    });
  } finally {
    await harness.close();
    applicationIdempotencyCache.clear();
  }

  return results;
}
