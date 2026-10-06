/**
 * LE LABEUR — P0-CONTRACT-POST — tests Worker/API → repository métier → PostgreSQL
 * de la cascade d'embauche (`finalize-hiring`) et de la tranche WORK EXECUTION.
 *
 * Périmètre ouvert : sur contrat ACTIF (employeur propriétaire, idempotent,
 * transactionnel) — offre `ACTIVE → FILLED`, candidature retenue
 * `→ HIRED → CONTRACTED`, autres candidatures ouvertes `→ CLOSED_OFFER_FILLED`
 * (RÈGLE 21 du modèle réel + sortie `CONTRACTED` documentée comme MANQUE).
 *
 * Verrouillé sans modification : l'activation P0-F et l'automatisation
 * P0-AUTO-2 ne produisent toujours AUCUNE cascade ; `monthly-actions`,
 * incidents, remplacements, notifications et messages restent fermés (501) ;
 * aucun paiement n'est exécuté ; aucun statut nouveau n'existe.
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
  type TestHarness,
} from './offers.test';
import type { ApplicationRecord, OfferRecord, ProposalRecord } from '../persistence/coreRecords';
import {
  createSqlApplicationStore,
  createSqlOfferStore,
  createSqlProposalStore,
} from '../persistence/sqlCoreStores';
import { newEntityId } from '../identity/ids';
import { contractIdempotencyCache } from '../repositories/contractRepository';
import type { AuthenticatedActor } from '../productionContracts';
import type { ApplicationStatus, Contract, ProposalStatus } from '../../types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SEED_TIMESTAMP = '2026-10-05T15:00:00.000Z';

function makeOffer(id: string, employerId: string, status: OfferRecord['status'] = 'ACTIVE'): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre ${id}`,
    contractType: 'CDI',
    remuneration: 150_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_TIMESTAMP,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre de test P0-CONTRACT-POST.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

async function seedApplication(
  harness: TestHarness,
  input: {
    id: string;
    offerId: string;
    candidateId: string;
    status?: ApplicationRecord['status'];
  },
): Promise<string> {
  const record: ApplicationRecord = {
    id: input.id,
    offerId: input.offerId,
    candidateId: input.candidateId,
    status: input.status ?? 'SHORTLISTED',
    appliedDate: SEED_TIMESTAMP,
    history: [{ action: 'Candidature transmise', timestamp: SEED_TIMESTAMP, actor: 'Candidat P0-CONTRACT-POST' }],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
  await createSqlApplicationStore(harness.database).create(record);
  return record.id;
}

async function seedProposal(
  harness: TestHarness,
  input: {
    id: string;
    offerId: string;
    applicationId: string;
    employerId: string;
    employeeId: string;
  },
): Promise<ProposalRecord> {
  const record: ProposalRecord = {
    id: input.id,
    conversationId: `cnv_${input.id}`,
    offerId: input.offerId,
    applicationId: input.applicationId,
    employerId: input.employerId,
    employeeId: input.employeeId,
    missionTitle: `Mission ${input.id}`,
    amount: 175_000,
    currency: 'FCFA',
    periodicity: 'Mensuel',
    startDate: '01 Novembre 2026',
    durationMonths: 6,
    location: 'Cotonou',
    conditions: ['Temps plein'],
    status: 'ACCEPTED' satisfies ProposalStatus,
    sentAt: SEED_TIMESTAMP,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
  return createSqlProposalStore(harness.database).create(record);
}

interface SeedChainOptions {
  employerId: string;
  employeeId: string;
  applicationStatus?: ApplicationRecord['status'];
}

/** Offre ACTIVE + candidature + proposition ACCEPTED liées, identifiants neufs. */
async function seedProposalChain(harness: TestHarness, options: SeedChainOptions): Promise<{
  offerId: string;
  applicationId: string;
  proposalId: string;
}> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, options.employerId));
  const applicationId = newEntityId('app');
  await seedApplication(harness, {
    id: applicationId,
    offerId,
    candidateId: options.employeeId,
    status: options.applicationStatus,
  });
  const proposalId = newEntityId('prp');
  await seedProposal(harness, {
    id: proposalId,
    offerId,
    applicationId,
    employerId: options.employerId,
    employeeId: options.employeeId,
  });
  return { offerId, applicationId, proposalId };
}

/** Candidat concurrent : ligne `users` directe (aucune session requise). */
async function seedCompetitor(harness: TestHarness, offerId: string, local: string, status: ApplicationStatus): Promise<string> {
  const userId = newEntityId('usr');
  await harness.database.query(
    'INSERT INTO users (id, role, status, email, display_name) VALUES ($1, $2, $3, $4, $5)',
    [userId, 'CANDIDATE', 'ACTIVE', `${local}@example.com`, `Concurrent ${local}`],
  );
  const applicationId = newEntityId('app');
  await harness.database.query(
    'INSERT INTO applications (id, offer_id, candidate_id, status) VALUES ($1, $2, $3, $4)',
    [applicationId, offerId, userId, status],
  );
  return applicationId;
}

function contractActionRequest(
  contractId: string,
  action: 'send' | 'sign' | 'activate' | 'end' | 'terminate',
  token: string | null,
  key: string,
  body: Record<string, unknown> = {},
): Request {
  return authRequest(`/api/v1/contracts/${encodeURIComponent(contractId)}/${action}`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

function finalizeRequest(contractId: string, token: string | null, key: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  return authRequest(`/api/v1/contracts/${encodeURIComponent(contractId)}/finalize-hiring`, token, {
    method: 'POST',
    headers,
    body: '{}',
  });
}

/** Cycle nominal complet jusqu'au contrat ACTIF, via l'API. */
async function createActiveContract(
  harness: TestHarness,
  input: { employerToken: string; candidateToken: string; proposalId: string; keyPrefix: string },
): Promise<string> {
  const created = await harness.worker.fetch(authRequest('/api/v1/contracts', input.employerToken, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `${input.keyPrefix}-create` },
    body: JSON.stringify({ proposalId: input.proposalId }),
  }));
  assert(created.status === 201, `création 201 attendue, reçue ${created.status}`);
  const contract = await created.json() as Contract;
  const sent = await harness.worker.fetch(contractActionRequest(contract.id, 'send', input.employerToken, `${input.keyPrefix}-send`));
  assert(sent.status === 200, `envoi 200 attendu, reçu ${sent.status}`);
  const signed = await harness.worker.fetch(contractActionRequest(contract.id, 'sign', input.candidateToken, `${input.keyPrefix}-sign`));
  assert(signed.status === 200, `signature 200 attendue, reçue ${signed.status}`);
  const activated = await harness.worker.fetch(contractActionRequest(contract.id, 'activate', input.employerToken, `${input.keyPrefix}-activate`));
  assert(activated.status === 200, `activation 200 attendue, reçue ${activated.status}`);
  return contract.id;
}

function readHistoryActions(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : typeof value === 'string' ? JSON.parse(value) as unknown : [];
  if (!Array.isArray(rows)) return [];
  return rows.map(entry => String((entry as { action?: unknown }).action ?? ''));
}

async function readOfferStatus(harness: TestHarness, offerId: string): Promise<string | null> {
  const result = await harness.database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [offerId]);
  return result.rows[0]?.status ?? null;
}

async function readApplication(harness: TestHarness, applicationId: string): Promise<{
  status: string;
  actions: string[];
  contractId: string | null;
} | null> {
  const result = await harness.database.query<{ status: string; history: unknown; contract_id: string | null }>(
    'SELECT status, history, contract_id FROM applications WHERE id = $1',
    [applicationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { status: row.status, actions: readHistoryActions(row.history), contractId: row.contract_id };
}

async function readContractStatus(harness: TestHarness, contractId: string): Promise<string | null> {
  const result = await harness.database.query<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [contractId]);
  return result.rows[0]?.status ?? null;
}

export async function runPostContractDomainTests(): Promise<OfferTestResult[]> {
  contractIdempotencyCache.clear();
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

  try {
    let employerToken = '';
    let employerId = '';
    let otherEmployerToken = '';
    let candidateToken = '';
    let candidateId = '';
    let secondCandidateToken = '';

    await check('P0-CONTRACT-POST Setup: sessions EMPLOYER, tiers EMPLOYER et CANDIDATE', async () => {
      const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      employerToken = employer.token;
      employerId = employer.userId;
      const other = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      otherEmployerToken = other.token;
      const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      candidateToken = candidate.token;
      candidateId = candidate.userId;
      const second = await authenticateActor(harness, 'candidate-2', 'CANDIDATE');
      secondCandidateToken = second.token;
      assert(employerId && candidateId, 'acteurs initialisés');
    });

    /* ---------------- 1. CASCADE NOMINALE ---------------- */

    await check('P0-CONTRACT-POST Cascade: ACTIVE → offre FILLED, retenue HIRED → CONTRACTED, autres ouvertes CLOSED_OFFER_FILLED', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const pendingId = await seedCompetitor(harness, chain.offerId, 'post.pending.001', 'PENDING');
      const reviewId = await seedCompetitor(harness, chain.offerId, 'post.review.001', 'REVIEW');
      const shortlistedId = await seedCompetitor(harness, chain.offerId, 'post.short.001', 'SHORTLISTED');
      const rejectedId = await seedCompetitor(harness, chain.offerId, 'post.rejected.001', 'REJECTED');
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-cascade-001',
      });
      assert(await readOfferStatus(harness, chain.offerId) === 'ACTIVE', 'offre ACTIVE avant finalisation');
      assert((await readApplication(harness, chain.applicationId))?.status === 'SHORTLISTED', 'retenue SHORTLISTED avant finalisation');

      const response = await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-cascade-finalize-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as Contract;
      assert(body.id === contractId && body.status === 'ACTIVE', 'le contrat reste ACTIF (exécution en cours)');

      assert(await readOfferStatus(harness, chain.offerId) === 'FILLED', 'offre FILLED persistée');
      const winning = await readApplication(harness, chain.applicationId);
      assert(winning?.status === 'CONTRACTED', `retenue CONTRACTED attendue, reçue ${winning?.status}`);
      assert(winning?.contractId === contractId, 'lien P0-F conservé');
      assert(
        winning?.actions.length === 3
          && winning.actions[1] === 'Candidature retenue — contrat actif'
          && winning.actions[2] === 'Engagement contractualisé — contrat actif',
        `historique HIRED puis CONTRACTED attendu, reçu ${JSON.stringify(winning?.actions)}`,
      );

      for (const otherId of [pendingId, reviewId, shortlistedId]) {
        const other = await readApplication(harness, otherId);
        assert(other?.status === 'CLOSED_OFFER_FILLED', `autre ${otherId} CLOSED_OFFER_FILLED attendue, reçue ${other?.status}`);
        assert(
          other?.actions.length === 1 && other.actions[0] === 'Candidature clôturée — offre pourvue',
          `historique de clôture attendu pour ${otherId}`,
        );
      }
      const rejected = await readApplication(harness, rejectedId);
      assert(rejected?.status === 'REJECTED', 'candidature déjà rejetée ignorée, jamais réécrite');
      assert(rejected?.actions.length === 0, 'aucune entrée parasite sur une candidature ignorée');
      assert(await readContractStatus(harness, contractId) === 'ACTIVE', 'contrat intact');
    });

    /* ---------------- 2. AUTORISATION ---------------- */

    await check('P0-CONTRACT-POST Autorisation: tiers 403, candidat 403, anonyme 401, clé manquante 400, inconnu 404 — zéro écriture', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const otherId = await seedCompetitor(harness, chain.offerId, 'post.auth.001', 'PENDING');
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-auth-001',
      });

      const byOther = await harness.worker.fetch(finalizeRequest(contractId, otherEmployerToken, 'post-auth-other-001'));
      assert(byOther.status === 403, `403 attendu pour un tiers, reçu ${byOther.status}`);
      const byCandidate = await harness.worker.fetch(finalizeRequest(contractId, candidateToken, 'post-auth-candidate-001'));
      assert(byCandidate.status === 403, `403 attendu pour le candidat (routeur), reçu ${byCandidate.status}`);
      const anonymous = await harness.worker.fetch(finalizeRequest(contractId, null, 'post-auth-anon-001'));
      assert(anonymous.status === 401, `401 attendu sans session, reçu ${anonymous.status}`);
      const noKey = await harness.worker.fetch(finalizeRequest(contractId, employerToken, null));
      assert(noKey.status === 400, `400 attendu sans Idempotency-Key, reçu ${noKey.status}`);
      const missing = await harness.worker.fetch(finalizeRequest('ctr_post_absent', employerToken, 'post-auth-missing-001'));
      assert(missing.status === 404, `404 attendu, reçu ${missing.status}`);

      assert(await readOfferStatus(harness, chain.offerId) === 'ACTIVE', 'offre intacte');
      assert((await readApplication(harness, chain.applicationId))?.status === 'SHORTLISTED', 'retenue intacte');
      assert((await readApplication(harness, otherId))?.status === 'PENDING', 'autre intacte');
      assert(await readContractStatus(harness, contractId) === 'ACTIVE', 'contrat intact');
      assert(secondCandidateToken.length > 0, 'session concurrente disponible');
    });

    /* ---------------- 3. GARDES ---------------- */

    await check('P0-CONTRACT-POST Gardes: DRAFT, SIGNATURE, COMPLETED et TERMINATED refusés (409) sans écriture', async () => {
      const draftChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const draftCreated = await harness.worker.fetch(authRequest('/api/v1/contracts', employerToken, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'post-guard-draft-create' },
        body: JSON.stringify({ proposalId: draftChain.proposalId }),
      }));
      assert(draftCreated.status === 201, `création 201 attendue, reçue ${draftCreated.status}`);
      const draftContract = await draftCreated.json() as Contract;
      const onDraft = await harness.worker.fetch(finalizeRequest(draftContract.id, employerToken, 'post-guard-draft-001'));
      assert(onDraft.status === 409, `409 attendu sur DRAFT, reçu ${onDraft.status}`);

      const signatureChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const signatureCreated = await harness.worker.fetch(authRequest('/api/v1/contracts', employerToken, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'post-guard-signature-create' },
        body: JSON.stringify({ proposalId: signatureChain.proposalId }),
      }));
      const signatureContract = await signatureCreated.json() as Contract;
      await harness.worker.fetch(contractActionRequest(signatureContract.id, 'send', employerToken, 'post-guard-signature-send'));
      const onSignature = await harness.worker.fetch(finalizeRequest(signatureContract.id, employerToken, 'post-guard-signature-001'));
      assert(onSignature.status === 409, `409 attendu sur SIGNATURE, reçu ${onSignature.status}`);

      const completedChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const completedId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: completedChain.proposalId,
        keyPrefix: 'post-guard-completed',
      });
      const ended = await harness.worker.fetch(contractActionRequest(completedId, 'end', employerToken, 'post-guard-completed-end'));
      assert(ended.status === 200, `fin 200 attendue, reçue ${ended.status}`);
      const onCompleted = await harness.worker.fetch(finalizeRequest(completedId, employerToken, 'post-guard-completed-001'));
      assert(onCompleted.status === 409, `409 attendu sur COMPLETED, reçu ${onCompleted.status}`);

      const terminatedChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const terminatedId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: terminatedChain.proposalId,
        keyPrefix: 'post-guard-terminated',
      });
      await harness.database.query('UPDATE contracts SET current_month = 2 WHERE id = $1', [terminatedId]);
      const terminated = await harness.worker.fetch(contractActionRequest(
        terminatedId, 'terminate', employerToken, 'post-guard-terminated-end', { reason: 'Rupture M2 convenue.' },
      ));
      assert(terminated.status === 200, `rupture 200 attendue, reçue ${terminated.status}`);
      const onTerminated = await harness.worker.fetch(finalizeRequest(terminatedId, employerToken, 'post-guard-terminated-001'));
      assert(onTerminated.status === 409, `409 attendu sur TERMINATED, reçu ${onTerminated.status}`);

      for (const offerId of [draftChain.offerId, signatureChain.offerId, completedChain.offerId, terminatedChain.offerId]) {
        assert(await readOfferStatus(harness, offerId) === 'ACTIVE', `offre ${offerId} intacte`);
      }
    });

    await check('P0-CONTRACT-POST Gardes: contrat sans candidature refusé (409) sans écriture ; référence pendante impossible (FK)', async () => {
      const orphanOfferId = newEntityId('ofr');
      await createSqlOfferStore(harness.database).create(makeOffer(orphanOfferId, employerId));
      const orphanId = newEntityId('ctr');
      await harness.database.query(
        `INSERT INTO contracts (id, offer_id, employer_id, candidate_id, status, monthly_salary, currency, start_date)
         VALUES ($1, $2, $3, $4, 'ACTIVE', 175000, 'FCFA', '01 Novembre 2026')`,
        [orphanId, orphanOfferId, employerId, candidateId],
      );
      const orphan = await harness.worker.fetch(finalizeRequest(orphanId, employerToken, 'post-guard-orphan-001'));
      assert(orphan.status === 409, `409 attendu sans candidature, reçu ${orphan.status}`);
      assert(await readOfferStatus(harness, orphanOfferId) === 'ACTIVE', 'offre orpheline intacte');

      // `contracts.application_id` porte une FK vers `applications` (0001) :
      // une référence pendante est rejetée par PostgreSQL lui-même, la garde
      // 404 du repository reste donc défensive et inatteignable par SQL.
      let fkFailed = false;
      try {
        await harness.database.query(
          `INSERT INTO contracts (id, offer_id, application_id, employer_id, candidate_id, status, monthly_salary, currency, start_date)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 175000, 'FCFA', '01 Novembre 2026')`,
          [newEntityId('ctr'), orphanOfferId, 'app_post_absente', employerId, candidateId],
        );
      } catch {
        fkFailed = true;
      }
      assert(fkFailed, 'la FK interdit une référence de candidature pendante');
    });

    await check('P0-CONTRACT-POST Gardes: candidature retenue retirée après activation → 409, zéro écriture', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const otherId = await seedCompetitor(harness, chain.offerId, 'post.withdrawn.001', 'PENDING');
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-guard-withdrawn',
      });
      // Incohérence inter-domaines volontaire (P0-E4 la refuse via API : écriture SQL directe).
      await harness.database.query(`UPDATE applications SET status = 'WITHDRAWN' WHERE id = $1`, [chain.applicationId]);
      const response = await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-guard-withdrawn-001'));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      assert(await readOfferStatus(harness, chain.offerId) === 'ACTIVE', 'offre intacte');
      assert((await readApplication(harness, otherId))?.status === 'PENDING', 'autre intacte');
    });

    await check('P0-CONTRACT-POST Gardes: offre PAUSED ou CANCELLED après activation → 409, zéro écriture', async () => {
      const pausedChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const pausedContractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: pausedChain.proposalId,
        keyPrefix: 'post-guard-paused',
      });
      await harness.database.query(`UPDATE offers SET status = 'PAUSED' WHERE id = $1`, [pausedChain.offerId]);
      const onPaused = await harness.worker.fetch(finalizeRequest(pausedContractId, employerToken, 'post-guard-paused-001'));
      assert(onPaused.status === 409, `409 attendu sur PAUSED, reçu ${onPaused.status}`);
      assert((await readApplication(harness, pausedChain.applicationId))?.status === 'SHORTLISTED', 'retenue intacte (PAUSED)');

      const cancelledChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const cancelledContractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: cancelledChain.proposalId,
        keyPrefix: 'post-guard-cancelled',
      });
      await harness.database.query(`UPDATE offers SET status = 'CANCELLED' WHERE id = $1`, [cancelledChain.offerId]);
      const onCancelled = await harness.worker.fetch(finalizeRequest(cancelledContractId, employerToken, 'post-guard-cancelled-001'));
      assert(onCancelled.status === 409, `409 attendu sur CANCELLED, reçu ${onCancelled.status}`);
      assert((await readApplication(harness, cancelledChain.applicationId))?.status === 'SHORTLISTED', 'retenue intacte (CANCELLED)');
    });

    /* ---------------- 4. IDEMPOTENCE, CONVERGENCE, CONCURRENCE ---------------- */

    await check('P0-CONTRACT-POST Idempotence: rejeu même clé → 200 identique ; même clé sur autre contrat → 409 conflit', async () => {
      const chainA = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractA = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chainA.proposalId,
        keyPrefix: 'post-idem-a',
      });
      const first = await harness.worker.fetch(finalizeRequest(contractA, employerToken, 'post-idem-shared-001'));
      assert(first.status === 200, `200 attendu, reçu ${first.status}`);
      const before = await readApplication(harness, chainA.applicationId);

      const replay = await harness.worker.fetch(finalizeRequest(contractA, employerToken, 'post-idem-shared-001'));
      assert(replay.status === 200, `200 attendu au rejeu, reçu ${replay.status}`);
      const after = await readApplication(harness, chainA.applicationId);
      assert(
        after?.status === 'CONTRACTED' && after.actions.length === before?.actions.length,
        'rejeu sans écriture ni doublon d’historique',
      );

      const chainB = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractB = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chainB.proposalId,
        keyPrefix: 'post-idem-b',
      });
      const conflict = await harness.worker.fetch(finalizeRequest(contractB, employerToken, 'post-idem-shared-001'));
      assert(conflict.status === 409, `409 attendu (conflit de clé), reçu ${conflict.status}`);
      assert(await readOfferStatus(harness, chainB.offerId) === 'ACTIVE', 'aucune cascade sur conflit de clé');
    });

    await check('P0-CONTRACT-POST Convergence: autre clé après cascade complète → 200, zéro écriture', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const otherId = await seedCompetitor(harness, chain.offerId, 'post.converge.001', 'REVIEW');
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-converge',
      });
      const first = await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-converge-001'));
      assert(first.status === 200, `200 attendu, reçu ${first.status}`);
      const winningBefore = await readApplication(harness, chain.applicationId);
      const otherBefore = await readApplication(harness, otherId);

      const again = await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-converge-002'));
      assert(again.status === 200, `200 attendu (convergence), reçu ${again.status}`);
      const winningAfter = await readApplication(harness, chain.applicationId);
      const otherAfter = await readApplication(harness, otherId);
      assert(
        winningAfter?.status === 'CONTRACTED' && winningAfter.actions.length === winningBefore?.actions.length,
        'retenue convergée sans écriture',
      );
      assert(
        otherAfter?.status === 'CLOSED_OFFER_FILLED' && otherAfter.actions.length === otherBefore?.actions.length,
        'autre convergée sans écriture',
      );
      assert(await readOfferStatus(harness, chain.offerId) === 'FILLED', 'offre FILLED conservée');
    });

    await check('P0-CONTRACT-POST Concurrence: deux finalisations simultanées → 200/200, une seule cascade', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const otherId = await seedCompetitor(harness, chain.offerId, 'post.race.001', 'SHORTLISTED');
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-race',
      });
      const [first, second] = await Promise.all([
        harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-race-a-001')),
        harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-race-b-001')),
      ]);
      assert(first.status === 200 && second.status === 200, `200/200 attendus, reçus ${first.status}/${second.status}`);
      const winning = await readApplication(harness, chain.applicationId);
      assert(winning?.status === 'CONTRACTED', 'retenue CONTRACTED');
      assert(
        winning?.actions.filter(action => action === 'Candidature retenue — contrat actif').length === 1
          && winning?.actions.filter(action => action === 'Engagement contractualisé — contrat actif').length === 1,
        `une seule entrée HIRED et CONTRACTED, reçues ${JSON.stringify(winning?.actions)}`,
      );
      const other = await readApplication(harness, otherId);
      assert(
        other?.status === 'CLOSED_OFFER_FILLED' && other.actions.length === 1,
        'une seule entrée de clôture',
      );
      assert(await readOfferStatus(harness, chain.offerId) === 'FILLED', 'offre FILLED');
    });

    /* ---------------- 5. BALAYAGE COMPLET + ROLLBACK ---------------- */

    await check('P0-CONTRACT-POST Balayage: 205 concurrentes ouvertes (2 pages keyset) toutes clôturées', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const total = 205;
      for (let index = 0; index < total; index += 1) {
        const status: ApplicationStatus = index % 3 === 0 ? 'PENDING' : index % 3 === 1 ? 'REVIEW' : 'SHORTLISTED';
        await seedCompetitor(harness, chain.offerId, `post.bulk.${String(index).padStart(3, '0')}`, status);
      }
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-bulk',
      });
      const response = await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-bulk-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const counts = await harness.database.query<{ status: string; count: string }>(
        'SELECT status, count(*)::text AS count FROM applications WHERE offer_id = $1 GROUP BY status',
        [chain.offerId],
      );
      const byStatus = new Map(counts.rows.map(row => [row.status, Number(row.count)]));
      assert(byStatus.get('CONTRACTED') === 1, `1 CONTRACTED attendue, reçue ${byStatus.get('CONTRACTED')}`);
      assert(byStatus.get('CLOSED_OFFER_FILLED') === total, `${total} CLOSED_OFFER_FILLED attendues, reçues ${byStatus.get('CLOSED_OFFER_FILLED')}`);
      assert(await readOfferStatus(harness, chain.offerId) === 'FILLED', 'offre FILLED');
    });

    await check('P0-CONTRACT-POST Rollback: une transaction échouée sur candidatures/offre ne persiste rien', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      let failed = false;
      try {
        await harness.database.run(async transaction => {
          const { createSqlApplicationStore: createTxApplications, createSqlOfferStore: createTxOffers } =
            await import('../persistence/sqlCoreStores');
          await createTxApplications(transaction).compareAndSetStatus(chain.applicationId, 'SHORTLISTED', {
            status: 'HIRED',
            updatedAt: harness.clock.value.toISOString(),
            historyEntry: { action: 'jamais écrit', timestamp: harness.clock.value.toISOString(), actor: 'test' },
          });
          await createTxOffers(transaction).updateStatus(chain.offerId, 'FILLED', harness.clock.value.toISOString());
          throw new Error('SIMULATED_POST_TRANSACTION_FAILURE');
        });
      } catch (error) {
        failed = String((error as Error)?.message ?? error).includes('SIMULATED_POST_TRANSACTION_FAILURE');
      }
      assert(failed, 'erreur volontaire propagée');
      assert(await readOfferStatus(harness, chain.offerId) === 'ACTIVE', 'aucune offre FILLED ne survit au ROLLBACK');
      const application = await readApplication(harness, chain.applicationId);
      assert(application?.status === 'SHORTLISTED', 'aucune candidature HIRED ne survit au ROLLBACK');
      assert(application?.actions.some(action => action === 'jamais écrit') === false, 'aucune entrée parasite');
    });

    /* ---------------- 6. NON-RÉGRESSION ---------------- */

    await check('P0-CONTRACT-POST Non-régression: sans finalize-hiring, activation et automatisation ne cascadent rien', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const otherId = await seedCompetitor(harness, chain.offerId, 'post.noregress.001', 'PENDING');
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-noregress',
      });
      await harness.automationWorker!.drainEvents(10);
      await harness.automationWorker!.runDueJobs(20);
      assert(await readOfferStatus(harness, chain.offerId) === 'ACTIVE', 'offre ACTIVE (P0-F/P0-AUTO-2 conservés)');
      assert((await readApplication(harness, chain.applicationId))?.status === 'SHORTLISTED', 'retenue SHORTLISTED (P0-F/P0-AUTO-2 conservés)');
      assert((await readApplication(harness, otherId))?.status === 'PENDING', 'autre PENDING (P0-F/P0-AUTO-2 conservés)');
      assert(await readContractStatus(harness, contractId) === 'ACTIVE', 'contrat ACTIF');

      // `finalize-hiring` reste le seul producteur de la cascade.
      const response = await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-noregress-finalize-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      assert(await readOfferStatus(harness, chain.offerId) === 'FILLED', 'offre FILLED après finalize-hiring');
      assert((await readApplication(harness, chain.applicationId))?.status === 'CONTRACTED', 'retenue CONTRACTED après finalize-hiring');
    });

    await check('P0-CONTRACT-POST Périmètre: mensuel, incidents, remplacements, notifications, messages fermés (501) ; aucun paiement exécuté', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-scope',
      });
      await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-scope-finalize-001'));

      const closed = await Promise.all([
        harness.worker.fetch(authRequest(`/api/v1/contracts/${contractId}/monthly-actions`, employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'post-scope-monthly-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/incidents', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'post-scope-incidents-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/replacements/rep_post_absent', employerToken)),
        harness.worker.fetch(authRequest('/api/v1/conversations/cnv_post/messages', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'post-scope-messages-001' },
          body: '{}',
        })),
      ]);
      assert(
        closed.every(response => response.status === 501),
        `501 attendu pour tout handler non ouvert, reçus ${closed.map(response => response.status).join('/')}`,
      );
      // P0-NOTIFICATIONS a OUVERT la lecture In-App : la route n'est plus un
      // handler absent, et la frontière réelle devient la SÉPARATION entre
      // comptes — jamais des enregistrements inventés ni ceux d'un autre.
      const notifications = await harness.worker.fetch(authRequest('/api/v1/my/notifications', employerToken));
      assert(notifications.status === 200, `200 attendu pour la lecture In-App ouverte, reçu ${notifications.status}`);
      const notificationsPage = await notifications.json() as { items: Array<{ recipientId: string }>; limit: number; hasMore: boolean };
      assert(
        notificationsPage.items.every(item => item.recipientId === employerId),
        'la lecture In-App est strictement propriétaire : aucune notification d’un autre compte',
      );
      const paymentRows = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payments WHERE contract_id = $1',
        [contractId],
      );
      assert(Number(paymentRows.rows[0]?.count ?? 0) === 0, 'aucun paiement créé hors du cycle');
      const contractRow = await harness.database.query<{ status: string }>(
        'SELECT status FROM contracts WHERE id = $1',
        [contractId],
      );
      assert(contractRow.rows[0]?.status === 'ACTIVE', 'aucun effet hors domaine');
    });

    await check('P0-CONTRACT-POST Acteur non ACTIF: session PENDING rejetée (401) et garde repository (403), zéro écriture', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createActiveContract(harness, {
        employerToken,
        candidateToken,
        proposalId: chain.proposalId,
        keyPrefix: 'post-pending',
      });
      await harness.database.query(`UPDATE users SET status = 'PENDING' WHERE id = $1`, [employerId]);
      // Frontière API : l’authentification de session ne résout aucun acteur
      // non ACTIF (`sessionService` → null → 401, comportement conçu).
      const response = await harness.worker.fetch(finalizeRequest(contractId, employerToken, 'post-pending-001'));
      assert(response.status === 401, `401 attendu, reçu ${response.status}`);
      assert(await readOfferStatus(harness, chain.offerId) === 'ACTIVE', 'offre intacte');
      assert((await readApplication(harness, chain.applicationId))?.status === 'SHORTLISTED', 'retenue intacte');

      // Défense en profondeur : le repository refuse lui-même (403), comme P0-F.
      const pendingActor: AuthenticatedActor = {
        id: employerId, role: 'EMPLOYER', permissions: [], sessionId: newEntityId('ses'),
      };
      let repositoryError: unknown;
      try {
        await harness.contracts!.finalizeHiring(pendingActor, contractId, {
          actor: pendingActor,
          command: 'contracts.finalize-hiring',
          idempotencyKey: 'post-pending-direct-001',
          requestId: 'req-post-pending',
        });
      } catch (caught) {
        repositoryError = caught;
      }
      assert(repositoryError instanceof Error && repositoryError.message.length > 0, 'un refus explicite est attendu');
      assert(await readOfferStatus(harness, chain.offerId) === 'ACTIVE', 'offre intacte (appel direct)');
      await harness.database.query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [employerId]);
    });
  } finally {
    await harness.close();
    contractIdempotencyCache.clear();
  }

  return results;
}
