/**
 * LE LABEUR — P0-F — tests Worker/API → repository métier → PostgreSQL
 * du cycle CONTRAT.
 *
 * Périmètre ouvert : création depuis une proposition ACCEPTED (EMPLOYER
 * propriétaire), envoi, signature (chaque partie), activation après double
 * signature, fin normale (COMPLETED) et rupture motivée (TERMINATED, M2+).
 * Lecture autorisée : `/my/contracts`, `/contracts/:id`, `/admin/contracts`.
 *
 * Restent fermés (501) : cycle mensuel/paiements, commissions, incidents,
 * remplacements, notifications générales et messages — une vérification
 * explicite le confirme.
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from './offers.test';
import type { AuthenticatedActor } from '../productionContracts';
import type { ApplicationRecord, OfferRecord, ProposalRecord } from '../persistence/coreRecords';
import { createSqlIdentityStores, createSqlUserStore } from '../identity/sqlStores';
import {
  createSqlApplicationStore,
  createSqlContractStore,
  createSqlOfferStore,
  createSqlProposalStore,
} from '../persistence/sqlCoreStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { contractIdempotencyCache } from '../repositories/contractRepository';
import { createContractAutomationRuntime } from '../automation/contractAutomation';
import { resolveRepositoryMode } from '../../repositories/mode';
import type { Contract, ProposalStatus } from '../../types';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

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
    summary: 'Offre de test P0-F.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

async function seedApplication(
  harness: Harness,
  input: {
    id: string;
    offerId: string;
    candidateId: string;
    status?: ApplicationRecord['status'];
    contractId?: string;
  },
): Promise<string> {
  const record: ApplicationRecord = {
    id: input.id,
    offerId: input.offerId,
    candidateId: input.candidateId,
    status: input.status ?? 'SHORTLISTED',
    appliedDate: SEED_TIMESTAMP,
    history: [{ action: 'Candidature transmise', timestamp: SEED_TIMESTAMP, actor: 'Candidat P0-F' }],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    ...(input.contractId ? { contractId: input.contractId } : {}),
  };
  await createSqlApplicationStore(harness.database).create(record);
  return record.id;
}

async function seedProposal(
  harness: Harness,
  input: {
    id: string;
    offerId: string;
    applicationId: string | null;
    employerId: string;
    employeeId: string;
    status: ProposalStatus;
    contractId?: string;
  },
): Promise<ProposalRecord> {
  const record: ProposalRecord = {
    id: input.id,
    conversationId: `cnv_${input.id}`,
    offerId: input.offerId,
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
    status: input.status,
    sentAt: SEED_TIMESTAMP,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    ...(input.applicationId ? { applicationId: input.applicationId } : {}),
    ...(input.contractId ? { contractId: input.contractId } : {}),
  };
  return createSqlProposalStore(harness.database).create(record);
}

interface SeedOptions {
  employerId: string;
  employeeId: string;
  proposalStatus?: ProposalStatus;
  offerStatus?: OfferRecord['status'];
  applicationStatus?: ApplicationRecord['status'];
  applicationCandidateId?: string;
  /** Proposition acceptée sans candidature (incohérence volontaire). */
  withoutApplication?: boolean;
}

/**
 * Crée une offre + une candidature + une proposition liées, avec des
 * identifiants neufs : chaque scénario dispose de ses propres lignes, aucun
 * partage d'état entre vérifications.
 */
async function seedProposalChain(harness: Harness, options: SeedOptions): Promise<{
  offerId: string;
  applicationId: string | null;
  proposalId: string;
}> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(
    makeOffer(offerId, options.employerId, options.offerStatus ?? 'ACTIVE'),
  );

  let applicationId: string | null = null;
  if (!options.withoutApplication) {
    applicationId = newEntityId('app');
    await seedApplication(harness, {
      id: applicationId,
      offerId,
      candidateId: options.applicationCandidateId ?? options.employeeId,
      status: options.applicationStatus,
    });
  }

  const proposalId = newEntityId('prp');
  await seedProposal(harness, {
    id: proposalId,
    offerId,
    applicationId,
    employerId: options.employerId,
    employeeId: options.employeeId,
    status: options.proposalStatus ?? 'ACCEPTED',
  });
  return { offerId, applicationId, proposalId };
}

function contractCreateRequest(token: string | null, key: string, body: Record<string, unknown>): Request {
  return authRequest('/api/v1/contracts', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
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

interface PersistedContract {
  status: string;
  employerId: string;
  employeeId: string;
  offerId: string;
  proposalId: string | null;
  applicationId: string | null;
  employerSigned: boolean;
  employeeSigned: boolean;
  currentMonth: number;
  history: Array<{ event: string }>;
}

async function readContract(harness: Harness, contractId: string): Promise<PersistedContract | null> {
  const result = await harness.database.query<{
    status: string;
    employer_id: string;
    candidate_id: string;
    offer_id: string;
    proposal_id: string | null;
    application_id: string | null;
    employer_signed: boolean;
    employee_signed: boolean;
    current_month: number;
    history: Array<{ event: string }> | null;
  }>(
    `SELECT status, employer_id, candidate_id, offer_id, proposal_id, application_id,
            employer_signed, employee_signed, current_month, history
       FROM contracts WHERE id = $1`,
    [contractId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    status: row.status,
    employerId: row.employer_id,
    employeeId: row.candidate_id,
    offerId: row.offer_id,
    proposalId: row.proposal_id,
    applicationId: row.application_id,
    employerSigned: row.employer_signed === true,
    employeeSigned: row.employee_signed === true,
    currentMonth: row.current_month,
    history: Array.isArray(row.history) ? row.history : [],
  };
}

async function countContractRows(harness: Harness, where = '1 = 1', values: unknown[] = []): Promise<number> {
  const result = await harness.database.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM contracts WHERE ${where}`,
    values,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function provisionAdmin(harness: Harness): Promise<{ token: string; userId: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = new Date(harness.clock.value.getTime()).toISOString();
  const expiresAt = new Date(harness.clock.value.getTime() + 3_600_000).toISOString();
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async transaction => {
    await transaction.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.${userId}@example.com`,
      displayName: 'Admin P0-F',
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { token, userId };
}

/** Crée un contrat DRAFT via l'API et renvoie son identifiant. */
async function createDraftContract(
  harness: Harness,
  employerToken: string,
  key: string,
  proposalId: string,
): Promise<string> {
  const response = await harness.worker.fetch(contractCreateRequest(employerToken, key, { proposalId }));
  assert(response.status === 201, `création DRAFT 201 attendue, reçue ${response.status}`);
  const body = await response.json() as Contract;
  assert(body.status === 'DRAFT', `DRAFT attendu, reçu ${body.status}`);
  return body.id;
}

/** Envoie un contrat (DRAFT → SIGNATURE) via l'API. */
async function sendContract(
  harness: Harness,
  employerToken: string,
  key: string,
  contractId: string,
): Promise<void> {
  const response = await harness.worker.fetch(contractActionRequest(contractId, 'send', employerToken, key));
  assert(response.status === 200, `envoi 200 attendu, reçu ${response.status}`);
}

export async function runContractDomainTests(): Promise<OfferTestResult[]> {
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
  let candidateToken = '';
  let candidateId = '';
  let otherCandidateToken = '';
  let otherCandidateId = '';
  let employerToken = '';
  let employerId = '';
  let otherEmployerToken = '';
  let adminToken = '';

  try {
    await check('P0-F Setup: sessions candidat, autre candidat, employeur propriétaire, autre employeur et ADMIN', async () => {
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
      const admin = await provisionAdmin(harness);
      adminToken = admin.token;

      assert(candidateId !== otherCandidateId, 'candidats distincts');
      assert(candidateId !== employerId && employerId !== otherEmployer.userId, 'rôles distincts');
      assert(adminToken.length > 0 && otherEmployerToken.length > 0, 'jetons émis');
      assert((await countContractRows(harness)) === 0, 'aucun contrat avant les scénarios');
    });

    /* ---------------- 1. CRÉATION ---------------- */

    let createdContractId = '';
    await check('P0-F Création: proposition ACCEPTED → contrat DRAFT persisté, proposition et candidature liées, offre et candidature inchangées', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const response = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-create-001', {
        proposalId: chain.proposalId,
      }));
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const body = await response.json() as Contract;
      createdContractId = body.id;
      assert(body.id.startsWith('ctr_'), `identifiant ctr_* attendu, reçu ${body.id}`);
      assert(body.status === 'DRAFT', `DRAFT attendu, reçu ${body.status}`);
      assert(body.proposalId === chain.proposalId, 'proposition liée');
      assert(body.offerId === chain.offerId, 'offre dérivée de la proposition');
      assert(body.applicationId === chain.applicationId, 'candidature dérivée de la proposition');
      assert(body.employerId === employerId, 'employerId dérivé de la session serveur');
      assert(body.employeeId === candidateId, 'employeeId dérivé de la proposition');
      assert(body.monthlySalary === 175_000, 'montant accepté repris (aucun montant client)');
      assert(body.employerSigned === false && body.employeeSigned === false, 'signatures vierges en brouillon');

      const stored = await readContract(harness, createdContractId);
      assert(stored?.status === 'DRAFT', 'DRAFT réellement persisté');
      assert(stored?.proposalId === chain.proposalId, 'proposal_id persisté');
      assert(stored?.applicationId === chain.applicationId, 'application_id persisté');
      assert(stored?.employerSigned === false && stored?.employeeSigned === false, 'drapeaux de signature persistés à faux');
      assert(stored?.history.some(entry => entry.event === 'CONTRACT_CREATED'), 'historique CONTRACT_CREATED persisté');

      const proposalRow = await harness.database.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM proposals WHERE id = $1', [chain.proposalId],
      );
      assert(proposalRow.rows[0]?.status === 'ACCEPTED', 'la proposition reste ACCEPTED');
      assert(proposalRow.rows[0]?.contract_id === createdContractId, 'proposals.contract_id renseigné');

      const applicationRow = await harness.database.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM applications WHERE id = $1', [chain.applicationId],
      );
      assert(applicationRow.rows[0]?.contract_id === createdContractId, 'applications.contract_id renseigné');
      assert(applicationRow.rows[0]?.status === 'SHORTLISTED', 'statut de candidature inchangé (HIRED hors P0-F)');

      const offerRow = await harness.database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [chain.offerId]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'l’offre reste ACTIVE (FILLED hors P0-F)');
      assert(await countContractRows(harness, 'proposal_id = $1', [chain.proposalId]) === 1, 'un seul contrat pour la proposition');
    });

    await check('P0-F Création: proposition inexistante (404) ; chaque statut non ACCEPTED refusé (409) sans écriture', async () => {
      const missing = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-create-missing-001', {
        proposalId: 'prp_p0f_absente',
      }));
      assert(missing.status === 404, `404 attendu, reçu ${missing.status}`);
      assert(await countContractRows(harness) === 1, 'aucun contrat créé pour une proposition inexistante');

      const rejected: ProposalStatus[] = ['SENT', 'DECLINED', 'EXPIRED', 'DRAFT', 'REVISION_REQUESTED'];
      for (const status of rejected) {
        const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId, proposalStatus: status });
        const response = await harness.worker.fetch(contractCreateRequest(
          employerToken,
          `p0f-create-status-${status.toLowerCase()}-001`,
          { proposalId: chain.proposalId },
        ));
        assert(response.status === 409, `${status}: 409 attendu, reçu ${response.status}`);
        const message = ((await response.json()) as { error: { message: string } }).error.message;
        assert(message.includes(status), `${status}: le refus doit nommer le statut réel, reçu « ${message} »`);
        assert(await countContractRows(harness, 'proposal_id = $1', [chain.proposalId]) === 0, `${status}: aucune écriture`);
      }

      // Proposition acceptée sans candidature : impossible de contractualiser.
      const orphan = await seedProposalChain(harness, { employerId, employeeId: candidateId, withoutApplication: true });
      const withoutApplication = await harness.worker.fetch(contractCreateRequest(
        employerToken, 'p0f-create-no-application-001', { proposalId: orphan.proposalId },
      ));
      assert(withoutApplication.status === 409, `409 attendu sans candidature, reçu ${withoutApplication.status}`);
      assert(await countContractRows(harness, 'proposal_id = $1', [orphan.proposalId]) === 0, 'aucune écriture sans candidature');
    });

    await check('P0-F Autorisation: autre employeur (403), CANDIDATE (403 routeur), identité imposée par le corps (400), anonyme (401)', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });

      const byOtherEmployer = await harness.worker.fetch(contractCreateRequest(
        otherEmployerToken, 'p0f-create-other-employer-001', { proposalId: chain.proposalId },
      ));
      assert(byOtherEmployer.status === 403, `403 attendu pour un autre employeur, reçu ${byOtherEmployer.status}`);

      const byCandidate = await harness.worker.fetch(contractCreateRequest(
        candidateToken, 'p0f-create-candidate-001', { proposalId: chain.proposalId },
      ));
      assert(byCandidate.status === 403, `403 attendu pour un CANDIDATE, reçu ${byCandidate.status}`);

      const injected = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-create-injected-001', {
        proposalId: chain.proposalId,
        employerId: 'usr_p0f_impose',
        employeeId: otherCandidateId,
        monthlySalary: 1,
      }));
      assert(injected.status === 400, `400 attendu pour identité/montant imposés, reçu ${injected.status}`);
      const injectedBody = await injected.json() as { error: { message: string } };
      assert(/Champ de contrat inconnu/i.test(injectedBody.error.message), 'le refus doit viser le champ d’autorité client');

      const unauthenticated = await harness.worker.fetch(contractCreateRequest(null, 'p0f-create-anon-001', {
        proposalId: chain.proposalId,
      }));
      assert(unauthenticated.status === 401, `401 attendu sans session, reçu ${unauthenticated.status}`);

      assert(await countContractRows(harness, 'proposal_id = $1', [chain.proposalId]) === 0, 'aucune écriture refusée');
      assert(await countContractRows(harness, 'employer_id = $1 AND candidate_id = $2', ['usr_p0f_impose', otherCandidateId]) === 0, 'aucune ligne fabriquée depuis le corps');
    });

    await check('P0-F Création: incohérences refusées (409) — autre offre, autre candidat, candidature non admissible, candidature déjà contractualisée, offre non ACTIVE', async () => {
      const totalBefore = await countContractRows(harness);

      // Candidature rattachée à une autre offre que celle de la proposition :
      // l'offre étrangère est dédiée à cette candidature (l'unicité
      // (offer_id, candidate_id) interdit d'en créer deux sur la même offre).
      const foreignOfferId = newEntityId('ofr');
      await createSqlOfferStore(harness.database).create(makeOffer(foreignOfferId, employerId));
      const foreignApplicationId = newEntityId('app');
      await seedApplication(harness, {
        id: foreignApplicationId,
        offerId: foreignOfferId,
        candidateId,
      });
      const ownChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const crossProposal = await seedProposal(harness, {
        id: newEntityId('prp'),
        offerId: ownChain.offerId,
        applicationId: foreignApplicationId,
        employerId,
        employeeId: candidateId,
        status: 'ACCEPTED',
      });
      const mismatchOfferResponse = await harness.worker.fetch(contractCreateRequest(
        employerToken, 'p0f-create-mismatch-offer-001', { proposalId: crossProposal.id },
      ));
      assert(mismatchOfferResponse.status === 409, `409 attendu (offre incohérente), reçu ${mismatchOfferResponse.status}`);
      assert(await countContractRows(harness, 'proposal_id = $1', [crossProposal.id]) === 0, 'aucune écriture pour une offre incohérente');

      // Candidature d'un autre candidat que celui de la proposition.
      const mismatchCandidate = await seedProposalChain(harness, {
        employerId,
        employeeId: candidateId,
        applicationCandidateId: otherCandidateId,
      });
      const mismatchCandidateResponse = await harness.worker.fetch(contractCreateRequest(
        employerToken, 'p0f-create-mismatch-candidate-001', { proposalId: mismatchCandidate.proposalId },
      ));
      assert(mismatchCandidateResponse.status === 409, `409 attendu (candidat incohérent), reçu ${mismatchCandidateResponse.status}`);

      // Candidature non admissible (REJECTED) malgré une proposition acceptée.
      const rejectedChain = await seedProposalChain(harness, {
        employerId,
        employeeId: candidateId,
        applicationStatus: 'REJECTED',
      });
      const rejectedResponse = await harness.worker.fetch(contractCreateRequest(
        employerToken, 'p0f-create-rejected-application-001', { proposalId: rejectedChain.proposalId },
      ));
      assert(rejectedResponse.status === 409, `409 attendu (candidature REJECTED), reçu ${rejectedResponse.status}`);

      // Candidature déjà liée à un contrat réel (lien inverse applications.contract_id).
      const contractedOfferId = newEntityId('ofr');
      await createSqlOfferStore(harness.database).create(makeOffer(contractedOfferId, employerId));
      const seededContractId = newEntityId('ctr');
      await createSqlContractStore(harness.database).create({
        id: seededContractId,
        offerId: contractedOfferId,
        employerId,
        employeeId: candidateId,
        status: 'ACTIVE',
        monthlySalary: 175_000,
        currency: 'FCFA',
        startDate: '01 Novembre 2026',
        currentMonth: 1,
        durationMonths: 6,
        periodicity: 'Mensuel',
        missionDescription: 'Contrat seedé P0-F',
        location: 'Cotonou',
        conditions: ['Temps plein'],
        employerSigned: true,
        employeeSigned: true,
        commissionPercentage: 25,
        commissionAmountDue: 0,
        commissionStatus: 'SCHEDULED',
        monthlyCheckpoints: [],
        commissionLedger: [],
        paymentSchedule: [],
        history: [],
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      });
      const contractedApplicationId = newEntityId('app');
      await seedApplication(harness, {
        id: contractedApplicationId,
        offerId: contractedOfferId,
        candidateId,
        contractId: seededContractId,
      });
      const contractedProposal = await seedProposal(harness, {
        id: newEntityId('prp'),
        offerId: contractedOfferId,
        applicationId: contractedApplicationId,
        employerId,
        employeeId: candidateId,
        status: 'ACCEPTED',
      });
      const alreadyContracted = await harness.worker.fetch(contractCreateRequest(
        employerToken, 'p0f-create-contracted-001', { proposalId: contractedProposal.id },
      ));
      assert(alreadyContracted.status === 409, `409 attendu (candidature contractualisée), reçu ${alreadyContracted.status}`);
      assert(await countContractRows(harness, 'proposal_id = $1', [contractedProposal.id]) === 0, 'aucune écriture pour une candidature contractualisée');

      // Offre non ACTIVE.
      const pausedChain = await seedProposalChain(harness, {
        employerId,
        employeeId: candidateId,
        offerStatus: 'PAUSED',
      });
      const paused = await harness.worker.fetch(contractCreateRequest(
        employerToken, 'p0f-create-non-active-001', { proposalId: pausedChain.proposalId },
      ));
      assert(paused.status === 409, `409 attendu (offre PAUSED), reçu ${paused.status}`);

      assert(await countContractRows(harness) === totalBefore + 1, 'seul le contrat seedé du scénario s’ajoute à l’existant');
      assert(await countContractRows(harness, 'status != $1 AND proposal_id IS NULL', ['ACTIVE']) === 0, 'aucune ligne contractuelle fabriquée par les refus');
    });

    await check('P0-F Création: proposition déjà utilisée refusée (409) — aucun double contrat', async () => {
      const totalBefore = await countContractRows(harness);
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const first = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-create-reuse-first-001', {
        proposalId: chain.proposalId,
      }));
      assert(first.status === 201, `201 attendu, reçu ${first.status}`);
      const created = await first.json() as Contract;
      assert(await countContractRows(harness) === totalBefore + 1, 'un contrat réellement persisté');

      const reuse = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-create-reuse-second-001', {
        proposalId: chain.proposalId,
      }));
      assert(reuse.status === 409, `409 attendu, reçu ${reuse.status}`);
      const body = await reuse.json() as { error: { message: string } };
      assert(/déjà associée à un contrat/i.test(body.error.message), 'message de proposition déjà utilisée attendu');
      assert(await countContractRows(harness, 'proposal_id = $1', [chain.proposalId]) === 1, 'toujours un seul contrat');
      const stored = await readContract(harness, created.id);
      assert(stored?.status === 'DRAFT' && stored?.history.length === 1, 'la proposition utilisée ne produit aucune écriture supplémentaire');
    });

    /* ---------------- 2. IDEMPOTENCE ET CONCURRENCE DE CRÉATION ---------------- */

    await check('P0-F Idempotence: même clé + même charge utile → rejeu sans seconde écriture ; même clé + charge différente → 409 IDEMPOTENCY_CONFLICT', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const first = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-idem-create-001', {
        proposalId: chain.proposalId,
      }));
      assert(first.status === 201, `201 attendu, reçu ${first.status}`);
      const firstBody = await first.json() as Contract;
      const replay = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-idem-create-001', {
        proposalId: chain.proposalId,
      }));
      assert(replay.status === 201, `rejeu 201 attendu, reçu ${replay.status}`);
      const replayBody = await replay.json() as Contract;
      assert(replayBody.id === firstBody.id, 'même contrat rejoué');
      assert(await countContractRows(harness, 'proposal_id = $1', [chain.proposalId]) === 1, 'une seule ligne persistée');

      const conflicting = await harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-idem-create-001', {
        proposalId: chain.proposalId,
        additionalNotes: 'Charge utile différente.',
      }));
      assert(conflicting.status === 409, `409 attendu, reçu ${conflicting.status}`);
      const conflictBody = await conflicting.json() as { error: { code: string } };
      assert(conflictBody.error.code === 'IDEMPOTENCY_CONFLICT', `IDEMPOTENCY_CONFLICT attendu, reçu ${conflictBody.error.code}`);

      // Rejeu d'une action de cycle : même clé ⇒ même résultat, sans double effet.
      const sendKey = 'p0f-idem-send-001';
      const sendFirst = await harness.worker.fetch(contractActionRequest(firstBody.id, 'send', employerToken, sendKey));
      assert(sendFirst.status === 200, `envoi 200 attendu, reçu ${sendFirst.status}`);
      const sendReplay = await harness.worker.fetch(contractActionRequest(firstBody.id, 'send', employerToken, sendKey));
      assert(sendReplay.status === 200, `rejeu d’envoi 200 attendu, reçu ${sendReplay.status}`);
      const stored = await readContract(harness, firstBody.id);
      assert(stored?.status === 'SIGNATURE', 'un seul envoi appliqué');
      assert(stored?.history.filter(entry => entry.event === 'EMPLOYER_SIGNED').length === 1, 'une seule entrée de signature employeur');
    });

    await check('P0-F Concurrence: deux créations simultanées pour la même proposition → un seul contrat, jamais deux', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const [first, second] = await Promise.all([
        harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-race-create-a-001', { proposalId: chain.proposalId })),
        harness.worker.fetch(contractCreateRequest(employerToken, 'p0f-race-create-b-001', { proposalId: chain.proposalId })),
      ]);
      for (const response of [first, second]) {
        assert(response.status === 201 || response.status === 409, `201/409 attendus (jamais 5xx), reçu ${response.status}`);
      }
      assert(first.status === 201 || second.status === 201, 'une création doit aboutir');
      assert(await countContractRows(harness, 'proposal_id = $1', [chain.proposalId]) === 1, 'aucun double contrat');
      const proposalRow = await harness.database.query<{ contract_id: string | null }>(
        'SELECT contract_id FROM proposals WHERE id = $1', [chain.proposalId],
      );
      assert(proposalRow.rows[0]?.contract_id !== null, 'la proposition est liée une seule fois');
      const applicationRow = await harness.database.query<{ contract_id: string | null }>(
        'SELECT contract_id FROM applications WHERE id = $1', [chain.applicationId],
      );
      assert(applicationRow.rows[0]?.contract_id === proposalRow.rows[0]?.contract_id, 'candidature et proposition pointent le même contrat');
    });

    /* ---------------- 3. ENVOI ET SIGNATURE ---------------- */

    let sentContractId = '';
    await check('P0-F Envoi: DRAFT → SIGNATURE par l’employeur propriétaire, signature employeur et historique persistés', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      sentContractId = await createDraftContract(harness, employerToken, 'p0f-send-create-001', chain.proposalId);
      const response = await harness.worker.fetch(contractActionRequest(sentContractId, 'send', employerToken, 'p0f-send-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as Contract;
      assert(body.status === 'SIGNATURE', `SIGNATURE attendu (SENT du plan), reçu ${body.status}`);
      assert(body.employerSigned === true && body.employeeSigned === false, 'signature employeur posée, salarié en attente');

      const stored = await readContract(harness, sentContractId);
      assert(stored?.status === 'SIGNATURE', 'SIGNATURE persisté');
      assert(stored?.employerSigned === true && stored?.employeeSigned === false, 'drapeaux persistés (SENT, pas encore SIGNED)');
      assert(stored?.history.some(entry => entry.event === 'EMPLOYER_SIGNED'), 'historique de signature employeur persisté');

      const offerRow = await harness.database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [chain.offerId]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'offre toujours ACTIVE');
      const applicationRow = await harness.database.query<{ status: string }>(
        'SELECT status FROM applications WHERE id = $1', [chain.applicationId],
      );
      assert(applicationRow.rows[0]?.status === 'SHORTLISTED', 'candidature inchangée (HIRED hors P0-F)');
    });

    await check('P0-F Envoi: refusé au tiers (403), au CANDIDATE (403 routeur), pour un contrat inexistant (404) et depuis SIGNATURE (409)', async () => {
      const byOtherEmployer = await harness.worker.fetch(contractActionRequest(sentContractId, 'send', otherEmployerToken, 'p0f-send-other-001'));
      assert(byOtherEmployer.status === 403, `403 attendu pour un autre employeur, reçu ${byOtherEmployer.status}`);
      const byCandidate = await harness.worker.fetch(contractActionRequest(sentContractId, 'send', candidateToken, 'p0f-send-candidate-001'));
      assert(byCandidate.status === 403, `403 attendu pour le candidat, reçu ${byCandidate.status}`);
      const missing = await harness.worker.fetch(contractActionRequest('ctr_p0f_absent', 'send', employerToken, 'p0f-send-missing-001'));
      assert(missing.status === 404, `404 attendu, reçu ${missing.status}`);
      const alreadySent = await harness.worker.fetch(contractActionRequest(sentContractId, 'send', employerToken, 'p0f-send-twice-001'));
      assert(alreadySent.status === 409, `409 attendu (déjà envoyé), reçu ${alreadySent.status}`);
      assert((await readContract(harness, sentContractId))?.status === 'SIGNATURE', 'état intact');
    });

    let fullySignedContractId = '';
    await check('P0-F Signature: le CANDIDATE salarié signe (SENT → SIGNED dérivé), l’employeur ne signe pas deux fois, les tiers sont refusés', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      fullySignedContractId = await createDraftContract(harness, employerToken, 'p0f-sign-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-sign-send-001', fullySignedContractId);

      const byOtherCandidate = await harness.worker.fetch(contractActionRequest(fullySignedContractId, 'sign', otherCandidateToken, 'p0f-sign-other-candidate-001'));
      assert(byOtherCandidate.status === 403, `403 attendu pour un autre candidat, reçu ${byOtherCandidate.status}`);
      const byOtherEmployer = await harness.worker.fetch(contractActionRequest(fullySignedContractId, 'sign', otherEmployerToken, 'p0f-sign-other-employer-001'));
      assert(byOtherEmployer.status === 403, `403 attendu pour un autre employeur, reçu ${byOtherEmployer.status}`);
      const unauthenticated = await harness.worker.fetch(contractActionRequest(fullySignedContractId, 'sign', null, 'p0f-sign-anon-001'));
      assert(unauthenticated.status === 401, `401 attendu sans session, reçu ${unauthenticated.status}`);

      // L'employeur a signé à l'envoi : une seconde signature est refusée (modèle réel).
      const employerAgain = await harness.worker.fetch(contractActionRequest(fullySignedContractId, 'sign', employerToken, 'p0f-sign-employer-again-001'));
      assert(employerAgain.status === 409, `409 attendu (signature employeur déjà enregistrée), reçu ${employerAgain.status}`);
      assert((await readContract(harness, fullySignedContractId))?.status === 'SIGNATURE', 'aucun état intermédiaire inventé');

      const response = await harness.worker.fetch(contractActionRequest(fullySignedContractId, 'sign', candidateToken, 'p0f-sign-employee-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as Contract;
      assert(body.status === 'SIGNATURE', `statut SIGNATURE conservé (SIGNED dérivé), reçu ${body.status}`);
      assert(body.employerSigned === true && body.employeeSigned === true, 'double signature : état SIGNED du plan');

      const stored = await readContract(harness, fullySignedContractId);
      assert(stored?.employerSigned === true && stored?.employeeSigned === true, 'double signature persistée');
      assert(stored?.status === 'SIGNATURE', 'aucun statut inventé pour SIGNED');
      assert(stored?.history.some(entry => entry.event === 'EMPLOYEE_SIGNED'), 'historique de signature salarié persisté');
      assert(
        stored?.history.filter(entry => entry.event === 'EMPLOYEE_SIGNED').length === 1
        && stored?.history.filter(entry => entry.event === 'EMPLOYER_SIGNED').length === 1,
        'chaque partie signe exactement une fois',
      );

      const twice = await harness.worker.fetch(contractActionRequest(fullySignedContractId, 'sign', candidateToken, 'p0f-sign-employee-twice-001'));
      assert(twice.status === 409, `409 attendu (signature déjà enregistrée), reçu ${twice.status}`);
    });

    await check('P0-F Signature: impossible avant envoi (DRAFT → 409) et après activation (ACTIVE → 409)', async () => {
      const draftChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const draftContractId = await createDraftContract(harness, employerToken, 'p0f-sign-draft-create-001', draftChain.proposalId);
      const onDraft = await harness.worker.fetch(contractActionRequest(draftContractId, 'sign', candidateToken, 'p0f-sign-draft-001'));
      assert(onDraft.status === 409, `409 attendu sur DRAFT, reçu ${onDraft.status}`);
      assert((await readContract(harness, draftContractId))?.employeeSigned === false, 'aucune signature écrite sur DRAFT');

      const activeChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const activeContractId = await createDraftContract(harness, employerToken, 'p0f-sign-active-create-001', activeChain.proposalId);
      await sendContract(harness, employerToken, 'p0f-sign-active-send-001', activeContractId);
      const sign = await harness.worker.fetch(contractActionRequest(activeContractId, 'sign', candidateToken, 'p0f-sign-active-sign-001'));
      assert(sign.status === 200, `signature 200 attendue, reçue ${sign.status}`);
      const activate = await harness.worker.fetch(contractActionRequest(activeContractId, 'activate', employerToken, 'p0f-sign-active-activate-001'));
      assert(activate.status === 200, `activation 200 attendue, reçue ${activate.status}`);
      const afterActivation = await harness.worker.fetch(contractActionRequest(activeContractId, 'sign', candidateToken, 'p0f-sign-after-activation-001'));
      assert(afterActivation.status === 409, `409 attendu après activation, reçu ${afterActivation.status}`);
      assert((await readContract(harness, activeContractId))?.status === 'ACTIVE', 'contrat actif intact');
    });

    /* ---------------- 4. ACTIVATION ---------------- */

    await check('P0-F Activation: refusée avant double signature, impossible pour un tiers, puis SIGNED → ACTIVE persisté', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0f-activate-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-activate-send-001', contractId);

      const beforeSignature = await harness.worker.fetch(contractActionRequest(contractId, 'activate', employerToken, 'p0f-activate-too-early-001'));
      assert(beforeSignature.status === 409, `409 attendu avant signature, reçu ${beforeSignature.status}`);
      const byOtherEmployer = await harness.worker.fetch(contractActionRequest(contractId, 'activate', otherEmployerToken, 'p0f-activate-other-001'));
      assert(byOtherEmployer.status === 403, `403 attendu pour un tiers, reçu ${byOtherEmployer.status}`);
      const byCandidate = await harness.worker.fetch(contractActionRequest(contractId, 'activate', candidateToken, 'p0f-activate-candidate-001'));
      assert(byCandidate.status === 403, `403 attendu pour le candidat (routeur), reçu ${byCandidate.status}`);
      const missing = await harness.worker.fetch(contractActionRequest('ctr_p0f_absent', 'activate', employerToken, 'p0f-activate-missing-001'));
      assert(missing.status === 404, `404 attendu, reçu ${missing.status}`);
      assert((await readContract(harness, contractId))?.status === 'SIGNATURE', 'aucune activation prématurée');

      const sign = await harness.worker.fetch(contractActionRequest(contractId, 'sign', candidateToken, 'p0f-activate-sign-001'));
      assert(sign.status === 200, `signature 200 attendue, reçue ${sign.status}`);

      const response = await harness.worker.fetch(contractActionRequest(contractId, 'activate', employerToken, 'p0f-activate-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as Contract;
      assert(body.status === 'ACTIVE', `ACTIVE attendu, reçu ${body.status}`);

      const stored = await readContract(harness, contractId);
      assert(stored?.status === 'ACTIVE', 'ACTIVE réellement persisté');
      assert(stored?.employerSigned === true && stored?.employeeSigned === true, 'activation seulement après double signature');
      assert(stored?.history.some(entry => entry.event === 'CONTRACT_ACTIVATED_BILATERAL'), 'historique d’activation persisté');

      const activationOutbox = await harness.database.query<{
        id: string; event_type: string; status: string; attempts: number;
      }>(
        'SELECT id, event_type, status, attempts FROM automation_outbox WHERE dedupe_key = $1',
        [`contract:${contractId}:CONTRACT_ACTIVATED`],
      );
      assert(activationOutbox.rows.length === 1, 'un seul événement CONTRACT_ACTIVATED durable');
      assert(activationOutbox.rows[0].event_type === 'CONTRACT_ACTIVATED', 'type d’activation conservé dans l’Outbox');
      assert(activationOutbox.rows[0].status === 'PROCESSED', 'Outbox → Queue → AutomationEngine consommé après commit');

      const automationProjection = await harness.database.query<{
        payment_schedule: unknown; commission_ledger: unknown; history: unknown;
      }>('SELECT payment_schedule, commission_ledger, history FROM contracts WHERE id = $1', [contractId]);
      const paymentSchedule = (typeof automationProjection.rows[0].payment_schedule === 'string'
        ? JSON.parse(automationProjection.rows[0].payment_schedule)
        : automationProjection.rows[0].payment_schedule) as Array<Record<string, unknown>>;
      const commissionLedger = (typeof automationProjection.rows[0].commission_ledger === 'string'
        ? JSON.parse(automationProjection.rows[0].commission_ledger)
        : automationProjection.rows[0].commission_ledger) as Array<Record<string, unknown>>;
      const activationHistory = (typeof automationProjection.rows[0].history === 'string'
        ? JSON.parse(automationProjection.rows[0].history)
        : automationProjection.rows[0].history) as Array<{ event: string }>;
      assert(paymentSchedule.length === 6, 'six périodes salaire produites depuis la durée réelle du contrat');
      const monthOne = paymentSchedule[0];
      const monthTwo = paymentSchedule[1];
      assert(monthOne.salaryDueDate === '2026-12-01', 'échéance salaire M1 dérivée de startDate');
      assert(monthOne.salaryAmount === 175_000, 'salaire mensuel repris du contrat');
      assert(monthOne.commissionAmount === 43_750 && monthOne.commissionPercentage === 25, 'commission M1 à 25 %');
      assert(monthOne.employerId === employerId && monthOne.employeeId === candidateId, 'parties persistées dans le schedule');
      assert(typeof monthOne.salaryDueJobId === 'string' && typeof monthOne.salaryReminderJobId === 'string', 'job salaire + rappel J+3 liés au schedule');
      assert(typeof monthOne.commissionDueJobId === 'string' && typeof monthOne.commissionReminderJobId === 'string', 'job commission + rappel J+3 liés au schedule');
      assert(monthTwo.commissionAmount === 0 && monthTwo.commissionStatus === 'NOT_APPLICABLE', 'aucune commission répétée après M1');
      assert(commissionLedger.length === 1 && commissionLedger[0].amountDue === 43_750, 'commission M1 projetée une seule fois');
      assert(activationHistory.filter(entry => entry.event === 'CONTRACT_ACTIVATED_BILATERAL').length === 1, 'l’automatisation ne réécrit pas l’historique métier');

      const jobCount = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_jobs
          WHERE aggregate_type = 'Contract' AND aggregate_id = $1
            AND job_type IN ('SALARY_PAYMENT_DUE', 'COMMISSION_PAYMENT_DUE', 'PAYMENT_OVERDUE_REMINDER')`,
        [contractId],
      );
      assert(Number(jobCount.rows[0]?.count) === 14, '14 jobs uniques : 6 salaires, 1 commission et 7 rappels J+3');
      const deadlineCount = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id = $1', [contractId],
      );
      assert(Number(deadlineCount.rows[0]?.count) === 7, 'une deadline par paiement salaire et commission planifiés');
      const auditCount = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_audit_ledger WHERE entity_id = $1', [contractId],
      );
      assert(Number(auditCount.rows[0]?.count) === 21, 'audit durable pour jobs salaire/commission, rappels et deadlines');
      const notificationCount = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_jobs
          WHERE aggregate_id = $1 AND job_type = 'NOTIFICATION_REQUIRED'`, [contractId],
      );
      assert(Number(notificationCount.rows[0]?.count) === 0, 'aucun canal ni job de notification envoyé à l’activation');

      // Redelivery after process restart relies on PostgreSQL idempotency, not
      // the in-memory processed-event cache.
      await harness.database.query(
        `UPDATE automation_outbox
            SET status = 'RETRYABLE', available_at = $2, processed_at = NULL, claimed_by = NULL
          WHERE id = $1`,
        [activationOutbox.rows[0].id, harness.clock.value.toISOString()],
      );
      const restartedAutomation = createContractAutomationRuntime(harness.database, () => harness.clock.value);
      const replay = await restartedAutomation.worker.processOutboxBatch();
      assert(replay.claimed === 1 && replay.duplicates === 1, 'rejeu après redémarrage reconnu par idempotence PostgreSQL');
      const jobsAfterReplay = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_jobs
          WHERE aggregate_type = 'Contract' AND aggregate_id = $1
            AND job_type IN ('SALARY_PAYMENT_DUE', 'COMMISSION_PAYMENT_DUE', 'PAYMENT_OVERDUE_REMINDER')`,
        [contractId],
      );
      assert(Number(jobsAfterReplay.rows[0]?.count) === 14, 'aucun schedule/job dupliqué après rejeu');

      // L’automatisation des candidatures/offres reste fermée.
      const offerRow = await harness.database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [chain.offerId]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'l’offre reste ACTIVE (FILLED = étape post-contrat à venir)');
      const applicationRow = await harness.database.query<{ status: string }>(
        'SELECT status FROM applications WHERE id = $1', [chain.applicationId],
      );
      assert(applicationRow.rows[0]?.status === 'SHORTLISTED', 'la candidature reste SHORTLISTED (HIRED/CONTRACTED à venir)');

      const alreadyActive = await harness.worker.fetch(contractActionRequest(contractId, 'activate', employerToken, 'p0f-activate-twice-001'));
      assert(alreadyActive.status === 409, `409 attendu sur contrat déjà actif, reçu ${alreadyActive.status}`);
    });

    await check('P0-AUTO-2 Échéances: due jobs, J+3, Outbox interne et jobs notification-ready sans envoi', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      await harness.database.query("UPDATE proposals SET start_date = '01 Septembre 2026' WHERE id = $1", [chain.proposalId]);
      const contractId = await createDraftContract(harness, employerToken, 'p0auto2-due-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0auto2-due-send-001', contractId);
      const signed = await harness.worker.fetch(contractActionRequest(contractId, 'sign', candidateToken, 'p0auto2-due-sign-001'));
      assert(signed.status === 200, `signature préalable 200 attendue, reçue ${signed.status}`);
      const activated = await harness.worker.fetch(contractActionRequest(contractId, 'activate', employerToken, 'p0auto2-due-activate-001'));
      assert(activated.status === 200, `activation 200 attendue, reçue ${activated.status}`);

      const contractRow = await harness.database.query<{
        payment_schedule: unknown; commission_status: string;
      }>('SELECT payment_schedule, commission_status FROM contracts WHERE id = $1', [contractId]);
      const schedule = (typeof contractRow.rows[0].payment_schedule === 'string'
        ? JSON.parse(contractRow.rows[0].payment_schedule)
        : contractRow.rows[0].payment_schedule) as Array<Record<string, unknown>>;
      assert(schedule[0].salaryStatus === 'DUE', 'due job fait passer le salaire M1 de SCHEDULED à DUE');
      assert(schedule[0].commissionStatus === 'DUE' && contractRow.rows[0].commission_status === 'DUE', 'due job commission M1 projeté');
      const deadlineRows = await harness.database.query<{ status: string; idempotency_key: string }>(
        'SELECT status, idempotency_key FROM automation_deadlines WHERE aggregate_id = $1 ORDER BY idempotency_key',
        [contractId],
      );
      const firstMonthDeadlines = deadlineRows.rows.filter(row => /:(salary|commission):1:deadline$/.test(row.idempotency_key));
      assert(firstMonthDeadlines.length === 2 && firstMonthDeadlines.every(row => row.status === 'OVERDUE'), 'deadlines salaire et commission passent OVERDUE après J+3');

      const emitted = await harness.database.query<{ event_type: string; status: string; count: string }>(
        `SELECT event_type, status, count(*)::text AS count FROM automation_outbox
          WHERE aggregate_id = $1 GROUP BY event_type, status`, [contractId],
      );
      const countEvent = (eventType: string) => Number(emitted.rows.find(row => row.event_type === eventType)?.count ?? 0);
      assert(countEvent('CONTRACT_ACTIVATED') === 1, 'événement d’activation unique');
      assert(countEvent('PAYMENT_SCHEDULE_DUE') === 2, 'événements internes salaire/commission à l’échéance');
      assert(countEvent('PAYMENT_OVERDUE_J3') === 2, 'rappels internes après les trois jours complets');
      assert(emitted.rows.every(row => row.status === 'PROCESSED'), 'événements remis à AutomationEngine');

      const notificationJobs = await harness.database.query<{ count: string; all_channel_null: boolean }>(
        `SELECT count(*)::text AS count,
                bool_and(payload->'channel' = 'null'::jsonb) AS all_channel_null
           FROM automation_jobs WHERE aggregate_id = $1 AND job_type = 'NOTIFICATION_REQUIRED'`,
        [contractId],
      );
      assert(Number(notificationJobs.rows[0]?.count) === 4, 'quatre jobs notification-ready créés pour due et J+3');
      assert(notificationJobs.rows[0]?.all_channel_null === true, 'aucun canal de notification n’est configuré ou appelé');
      const dueAudits = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_audit_ledger
          WHERE entity_id = $1 AND action = 'PAYMENT_OVERDUE_J3_EVENT_CREATED'`, [contractId],
      );
      assert(Number(dueAudits.rows[0]?.count) === 2, 'rappels audités sans transition de paiement');
    });

    await check('P0-AUTO-2 Rollback: conflit Outbox annule ACTIVE et son historique dans la même transaction', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0auto2-rollback-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0auto2-rollback-send-001', contractId);
      const signed = await harness.worker.fetch(contractActionRequest(contractId, 'sign', candidateToken, 'p0auto2-rollback-sign-001'));
      assert(signed.status === 200, `signature préalable 200 attendue, reçue ${signed.status}`);

      const dedupeKey = `contract:${contractId}:CONTRACT_ACTIVATED`;
      await harness.database.query(
        `INSERT INTO automation_outbox (
           id, event_type, aggregate_type, aggregate_id, actor_id, payload, source, version,
           created_at, status, attempts, available_at, dedupe_key
         ) VALUES ($1, 'CONTRACT_ACTIVATED', 'Contract', $2, $3, $4::jsonb, 'rollback-test', 1,
                   $5, 'PROCESSED', 0, $5, $6)`,
        [newEntityId('evt'), contractId, employerId, JSON.stringify({ contractId: 'different-payload' }), harness.clock.value.toISOString(), dedupeKey],
      );

      const rejected = await harness.worker.fetch(contractActionRequest(contractId, 'activate', employerToken, 'p0auto2-rollback-activate-001'));
      assert(rejected.status === 500, `échec d’append Outbox doit remonter en 500, reçu ${rejected.status}`);
      const afterFailure = await readContract(harness, contractId);
      assert(afterFailure?.status === 'SIGNATURE', 'ACTIVE est annulé par le ROLLBACK');
      assert(!afterFailure?.history.some(entry => entry.event === 'CONTRACT_ACTIVATED_BILATERAL'), 'aucun historique d’activation fantôme');
      const schedules = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_jobs WHERE aggregate_id = $1', [contractId],
      );
      assert(Number(schedules.rows[0]?.count) === 0, 'aucun schedule Automation après rollback de l’activation');
      await harness.database.query('DELETE FROM automation_outbox WHERE dedupe_key = $1', [dedupeKey]);
    });

    await check('P0-F Activation: DRAFT → ACTIVE refusée (409) sans passer par l’envoi et la signature', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const draftContractId = await createDraftContract(harness, employerToken, 'p0f-activate-draft-create-001', chain.proposalId);
      const response = await harness.worker.fetch(contractActionRequest(draftContractId, 'activate', employerToken, 'p0f-activate-draft-001'));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      assert((await readContract(harness, draftContractId))?.status === 'DRAFT', 'brouillon intact');
    });

    await check('P0-F Concurrence: deux activations simultanées → un seul ACTIVE ; deux signatures simultanées → un seul drapeau', async () => {
      const activateChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const concurrentActivateId = await createDraftContract(harness, employerToken, 'p0f-race-activate-create-001', activateChain.proposalId);
      await sendContract(harness, employerToken, 'p0f-race-activate-send-001', concurrentActivateId);
      const sign = await harness.worker.fetch(contractActionRequest(concurrentActivateId, 'sign', candidateToken, 'p0f-race-activate-sign-001'));
      assert(sign.status === 200, `signature préalable 200 attendue, reçue ${sign.status}`);

      const [first, second] = await Promise.all([
        harness.worker.fetch(contractActionRequest(concurrentActivateId, 'activate', employerToken, 'p0f-race-activate-a-001')),
        harness.worker.fetch(contractActionRequest(concurrentActivateId, 'activate', employerToken, 'p0f-race-activate-b-001')),
      ]);
      for (const response of [first, second]) {
        assert(response.status === 200 || response.status === 409, `200/409 attendus, reçu ${response.status}`);
      }
      const storedActive = await readContract(harness, concurrentActivateId);
      assert(storedActive?.status === 'ACTIVE', 'ACTIVE persisté une seule fois');
      assert(
        storedActive?.history.filter(entry => entry.event === 'CONTRACT_ACTIVATED_BILATERAL').length === 1,
        'une seule entrée d’activation',
      );
      const concurrentOutbox = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_outbox WHERE dedupe_key = $1',
        [`contract:${concurrentActivateId}:CONTRACT_ACTIVATED`],
      );
      assert(Number(concurrentOutbox.rows[0]?.count) === 1, 'un seul événement d’activation sous concurrence');
      const concurrentJobs = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_jobs
          WHERE aggregate_id = $1
            AND job_type IN ('SALARY_PAYMENT_DUE', 'COMMISSION_PAYMENT_DUE', 'PAYMENT_OVERDUE_REMINDER')`,
        [concurrentActivateId],
      );
      assert(Number(concurrentJobs.rows[0]?.count) === 14, 'un seul ensemble de schedules/jobs malgré les activations concurrentes');

      const signChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const concurrentSignId = await createDraftContract(harness, employerToken, 'p0f-race-sign-create-001', signChain.proposalId);
      await sendContract(harness, employerToken, 'p0f-race-sign-send-001', concurrentSignId);
      const [signFirst, signSecond] = await Promise.all([
        harness.worker.fetch(contractActionRequest(concurrentSignId, 'sign', candidateToken, 'p0f-race-sign-a-001')),
        harness.worker.fetch(contractActionRequest(concurrentSignId, 'sign', candidateToken, 'p0f-race-sign-b-001')),
      ]);
      for (const response of [signFirst, signSecond]) {
        assert(response.status === 200 || response.status === 409, `200/409 attendus, reçu ${response.status}`);
      }
      const storedSigned = await readContract(harness, concurrentSignId);
      assert(storedSigned?.employeeSigned === true, 'signature unique persistée');
      assert(storedSigned?.status === 'SIGNATURE', 'aucun état impossible');
      assert(
        storedSigned?.history.filter(entry => entry.event === 'EMPLOYEE_SIGNED').length === 1,
        'une seule entrée de signature salarié',
      );
    });

    /* ---------------- 5. FIN ET TERMINAISON ---------------- */

    await check('P0-F Fin: ACTIVE → COMPLETED par l’employeur propriétaire, persisté ; tiers, candidat et contrat inexistant refusés', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0f-end-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-end-send-001', contractId);
      await harness.worker.fetch(contractActionRequest(contractId, 'sign', candidateToken, 'p0f-end-sign-001'));
      await harness.worker.fetch(contractActionRequest(contractId, 'activate', employerToken, 'p0f-end-activate-001'));

      const byOtherEmployer = await harness.worker.fetch(contractActionRequest(contractId, 'end', otherEmployerToken, 'p0f-end-other-001'));
      assert(byOtherEmployer.status === 403, `403 attendu pour un tiers, reçu ${byOtherEmployer.status}`);
      const byCandidate = await harness.worker.fetch(contractActionRequest(contractId, 'end', candidateToken, 'p0f-end-candidate-001'));
      assert(byCandidate.status === 403, `403 attendu pour le candidat, reçu ${byCandidate.status}`);
      const missing = await harness.worker.fetch(contractActionRequest('ctr_p0f_absent', 'end', employerToken, 'p0f-end-missing-001'));
      assert(missing.status === 404, `404 attendu, reçu ${missing.status}`);

      const response = await harness.worker.fetch(contractActionRequest(contractId, 'end', employerToken, 'p0f-end-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as Contract;
      assert(body.status === 'COMPLETED', `COMPLETED attendu (ENDED du plan), reçu ${body.status}`);
      const stored = await readContract(harness, contractId);
      assert(stored?.status === 'COMPLETED', 'COMPLETED réellement persisté');
      assert(stored?.history.some(entry => entry.event === 'CONTRACT_COMPLETED'), 'historique de fin persisté');

      const again = await harness.worker.fetch(contractActionRequest(contractId, 'end', employerToken, 'p0f-end-twice-001'));
      assert(again.status === 409, `409 attendu sur contrat clos, reçu ${again.status}`);
      const activateAfterEnd = await harness.worker.fetch(contractActionRequest(contractId, 'activate', employerToken, 'p0f-end-reactivate-001'));
      assert(activateAfterEnd.status === 409, `409 attendu (ENDED → ACTIVE interdit), reçu ${activateAfterEnd.status}`);
    });

    await check('P0-F Fin: refusée depuis DRAFT (409) et depuis SIGNATURE (409, SENT → ENDED interdit)', async () => {
      const draftChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const draftContractId = await createDraftContract(harness, employerToken, 'p0f-end-draft-create-001', draftChain.proposalId);
      const onDraft = await harness.worker.fetch(contractActionRequest(draftContractId, 'end', employerToken, 'p0f-end-draft-001'));
      assert(onDraft.status === 409, `409 attendu sur DRAFT, reçu ${onDraft.status}`);

      const signatureChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const signatureContractId = await createDraftContract(harness, employerToken, 'p0f-end-signature-create-001', signatureChain.proposalId);
      await sendContract(harness, employerToken, 'p0f-end-signature-send-001', signatureContractId);
      const onSignature = await harness.worker.fetch(contractActionRequest(signatureContractId, 'end', employerToken, 'p0f-end-signature-001'));
      assert(onSignature.status === 409, `409 attendu sur SIGNATURE, reçu ${onSignature.status}`);
    });

    await check('P0-F Terminaison: motif obligatoire, protection M1 conservée, M2 → TERMINATED persisté, tiers refusés', async () => {
      const m1Chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const m1ContractId = await createDraftContract(harness, employerToken, 'p0f-terminate-m1-create-001', m1Chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-terminate-m1-send-001', m1ContractId);
      await harness.worker.fetch(contractActionRequest(m1ContractId, 'sign', candidateToken, 'p0f-terminate-m1-sign-001'));
      await harness.worker.fetch(contractActionRequest(m1ContractId, 'activate', employerToken, 'p0f-terminate-m1-activate-001'));

      const withoutReason = await harness.worker.fetch(contractActionRequest(m1ContractId, 'terminate', employerToken, 'p0f-terminate-no-reason-001'));
      assert(withoutReason.status === 400, `400 attendu sans motif, reçu ${withoutReason.status}`);
      const blankReason = await harness.worker.fetch(contractActionRequest(
        m1ContractId, 'terminate', employerToken, 'p0f-terminate-blank-reason-001', { reason: '   ' },
      ));
      assert(blankReason.status === 400, `400 attendu avec motif vide, reçu ${blankReason.status}`);
      const byOtherEmployer = await harness.worker.fetch(contractActionRequest(
        m1ContractId, 'terminate', otherEmployerToken, 'p0f-terminate-other-001', { reason: 'Motif tiers' },
      ));
      assert(byOtherEmployer.status === 403, `403 attendu pour un tiers, reçu ${byOtherEmployer.status}`);
      const byCandidate = await harness.worker.fetch(contractActionRequest(
        m1ContractId, 'terminate', candidateToken, 'p0f-terminate-candidate-001', { reason: 'Motif salarié' },
      ));
      assert(byCandidate.status === 403, `403 attendu pour le candidat (routeur), reçu ${byCandidate.status}`);
      const missing = await harness.worker.fetch(contractActionRequest(
        'ctr_p0f_absent', 'terminate', employerToken, 'p0f-terminate-missing-001', { reason: 'Motif' },
      ));
      assert(missing.status === 404, `404 attendu, reçu ${missing.status}`);

      // M1 : la rupture directe reste interdite (incident obligatoire, hors P0-F).
      const inFirstMonth = await harness.worker.fetch(contractActionRequest(
        m1ContractId, 'terminate', employerToken, 'p0f-terminate-m1-001', { reason: 'Rupture M1 interdite' },
      ));
      assert(inFirstMonth.status === 409, `409 attendu en M1, reçu ${inFirstMonth.status}`);
      assert((await readContract(harness, m1ContractId))?.status === 'ACTIVE', 'contrat M1 intact');

      // M2 : la rupture est possible et persistée.
      const m2Chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const m2ContractId = await createDraftContract(harness, employerToken, 'p0f-terminate-create-001', m2Chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-terminate-send-001', m2ContractId);
      await harness.worker.fetch(contractActionRequest(m2ContractId, 'sign', candidateToken, 'p0f-terminate-sign-001'));
      await harness.worker.fetch(contractActionRequest(m2ContractId, 'activate', employerToken, 'p0f-terminate-activate-001'));
      await harness.database.query('UPDATE contracts SET current_month = 2 WHERE id = $1', [m2ContractId]);

      const response = await harness.worker.fetch(contractActionRequest(
        m2ContractId, 'terminate', employerToken, 'p0f-terminate-001', { reason: 'Fin de mission anticipée convenue.' },
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as Contract;
      assert(body.status === 'TERMINATED', `TERMINATED attendu, reçu ${body.status}`);
      const stored = await readContract(harness, m2ContractId);
      assert(stored?.status === 'TERMINATED', 'TERMINATED réellement persisté');
      assert(stored?.history.some(entry => entry.event === 'CONTRACT_TERMINATED'), 'historique de rupture persisté');

      const endAfterTerminate = await harness.worker.fetch(contractActionRequest(m2ContractId, 'end', employerToken, 'p0f-terminate-then-end-001'));
      assert(endAfterTerminate.status === 409, `409 attendu (TERMINATED terminal), reçu ${endAfterTerminate.status}`);
      const activateAfterTerminate = await harness.worker.fetch(contractActionRequest(m2ContractId, 'activate', employerToken, 'p0f-terminate-reactivate-001'));
      assert(activateAfterTerminate.status === 409, `409 attendu (TERMINATED → ACTIVE interdit), reçu ${activateAfterTerminate.status}`);
      const signAfterTerminate = await harness.worker.fetch(contractActionRequest(m2ContractId, 'sign', candidateToken, 'p0f-terminate-sign-after-001'));
      assert(signAfterTerminate.status === 409, `409 attendu (signature impossible sur contrat terminé), reçu ${signAfterTerminate.status}`);
    });

    await check('P0-F Terminaison: refusée depuis DRAFT et depuis SIGNATURE (409)', async () => {
      const draftChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const draftContractId = await createDraftContract(harness, employerToken, 'p0f-terminate-draft-create-001', draftChain.proposalId);
      const onDraft = await harness.worker.fetch(contractActionRequest(
        draftContractId, 'terminate', employerToken, 'p0f-terminate-draft-001', { reason: 'Motif' },
      ));
      assert(onDraft.status === 409, `409 attendu sur DRAFT, reçu ${onDraft.status}`);

      const signatureChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const signatureContractId = await createDraftContract(harness, employerToken, 'p0f-terminate-signature-create-001', signatureChain.proposalId);
      await sendContract(harness, employerToken, 'p0f-terminate-signature-send-001', signatureContractId);
      const onSignature = await harness.worker.fetch(contractActionRequest(
        signatureContractId, 'terminate', employerToken, 'p0f-terminate-signature-001', { reason: 'Motif' },
      ));
      assert(onSignature.status === 409, `409 attendu sur SIGNATURE, reçu ${onSignature.status}`);
    });

    await check('P0-F Concurrence: deux fins simultanées → un seul COMPLETED', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const concurrentEndId = await createDraftContract(harness, employerToken, 'p0f-race-end-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-race-end-send-001', concurrentEndId);
      await harness.worker.fetch(contractActionRequest(concurrentEndId, 'sign', candidateToken, 'p0f-race-end-sign-001'));
      await harness.worker.fetch(contractActionRequest(concurrentEndId, 'activate', employerToken, 'p0f-race-end-activate-001'));

      const [first, second] = await Promise.all([
        harness.worker.fetch(contractActionRequest(concurrentEndId, 'end', employerToken, 'p0f-race-end-a-001')),
        harness.worker.fetch(contractActionRequest(concurrentEndId, 'end', employerToken, 'p0f-race-end-b-001')),
      ]);
      for (const response of [first, second]) {
        assert(response.status === 200 || response.status === 409, `200/409 attendus, reçu ${response.status}`);
      }
      const stored = await readContract(harness, concurrentEndId);
      assert(stored?.status === 'COMPLETED', 'COMPLETED persisté une seule fois');
      assert(
        stored?.history.filter(entry => entry.event === 'CONTRACT_COMPLETED').length === 1,
        'une seule entrée de fin',
      );
    });

    /* ---------------- 6. LECTURE ET AUTORISATION ---------------- */

    await check('P0-F Lecture: /my/contracts borné aux parties, /contracts/:id refuse un tiers (403), ADMIN lit via sa route et sa permission', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0f-read-create-001', chain.proposalId);

      const employerList = await harness.worker.fetch(authRequest('/api/v1/my/contracts?limit=100', employerToken));
      assert(employerList.status === 200, `200 attendu, reçu ${employerList.status}`);
      const employerPage = await employerList.json() as { items: Contract[] };
      assert(employerPage.items.length > 0, 'liste employeur non vide');
      assert(employerPage.items.every(item => item.employerId === employerId), 'liste employeur strictement bornée');
      assert(employerPage.items.some(item => item.id === contractId), 'le contrat de l’employeur est visible');

      const candidateList = await harness.worker.fetch(authRequest('/api/v1/my/contracts?limit=100', candidateToken));
      assert(candidateList.status === 200, `200 attendu, reçu ${candidateList.status}`);
      const candidatePage = await candidateList.json() as { items: Contract[] };
      assert(candidatePage.items.every(item => item.employeeId === candidateId), 'liste salarié strictement bornée');
      assert(candidatePage.items.some(item => item.id === contractId), 'le contrat du salarié est visible');

      const otherCandidateList = await harness.worker.fetch(authRequest('/api/v1/my/contracts', otherCandidateToken));
      assert(otherCandidateList.status === 200, `200 attendu, reçu ${otherCandidateList.status}`);
      const otherPage = await otherCandidateList.json() as { items: Contract[] };
      assert(otherPage.items.length === 0, 'aucun contrat pour un tiers');

      const partyRead = await harness.worker.fetch(authRequest(`/api/v1/contracts/${contractId}`, candidateToken));
      assert(partyRead.status === 200, `200 attendu pour une partie, reçu ${partyRead.status}`);
      const thirdPartyRead = await harness.worker.fetch(authRequest(`/api/v1/contracts/${contractId}`, otherEmployerToken));
      assert(thirdPartyRead.status === 403, `403 attendu pour un tiers, reçu ${thirdPartyRead.status}`);
      const missingRead = await harness.worker.fetch(authRequest('/api/v1/contracts/ctr_p0f_absent', employerToken));
      assert(missingRead.status === 404, `404 attendu, reçu ${missingRead.status}`);
      const unauthenticated = await harness.worker.fetch(authRequest('/api/v1/my/contracts', null));
      assert(unauthenticated.status === 401, `401 attendu sans session, reçu ${unauthenticated.status}`);

      const adminList = await harness.worker.fetch(authRequest('/api/v1/admin/contracts?limit=100', adminToken));
      assert(adminList.status === 200, `200 attendu pour ADMIN, reçu ${adminList.status}`);
      const adminPage = await adminList.json() as { items: Contract[] };
      assert(adminPage.items.length > 0, 'ADMIN lit les contrats persistés');
      assert(adminPage.items.some(item => item.id === contractId), 'le contrat est visible côté ADMIN');
      const adminReadAsPartyRoute = await harness.worker.fetch(authRequest(`/api/v1/contracts/${contractId}`, adminToken));
      assert(adminReadAsPartyRoute.status === 403, `403 attendu pour ADMIN sur la lecture « partie » (ADMIN n'est pas partie), reçu ${adminReadAsPartyRoute.status}`);
    });

    /* ---------------- 7. PERSISTANCE, ROLLBACK ET SÉPARATION DEMO/API ---------------- */

    await check('P0-F Persistance: compare-and-set obsolète et signature hors SIGNATURE n’écrivent rien', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0f-persist-create-001', chain.proposalId);
      const store = createSqlContractStore(harness.database);
      const timestamp = harness.clock.value.toISOString();

      const stale = await store.compareAndSetStatus(contractId, 'SIGNATURE', {
        status: 'ACTIVE',
        updatedAt: timestamp,
        historyEntry: { id: 'log_p0f_stale', timestamp, event: 'STALE', description: 'jamais écrit', actor: 'test' },
      });
      assert(stale === null, 'une transition depuis un statut obsolète ne doit rien écrire');
      const afterStale = await readContract(harness, contractId);
      assert(afterStale?.status === 'DRAFT', 'brouillon préservé');
      assert(afterStale?.history.some(entry => entry.event === 'STALE') === false, 'aucune entrée d’historique parasite');

      const unsignedWrite = await store.sign(contractId, 'EMPLOYEE', {
        signedAt: timestamp,
        historyEntry: { id: 'log_p0f_sign', timestamp, event: 'EMPLOYEE_SIGNED', description: 'jamais écrit', actor: 'test' },
      });
      assert(unsignedWrite === null, 'aucune signature hors SIGNATURE');
      const afterSign = await readContract(harness, contractId);
      assert(afterSign?.employeeSigned === false, 'drapeau intact');
      assert(afterSign?.history.some(entry => entry.event === 'EMPLOYEE_SIGNED') === false, 'aucune signature fantôme');
    });

    await check('P0-F Rollback PostgreSQL: un contrat écrit dans une transaction échouée n’est pas persisté, liens compris', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = newEntityId('ctr');
      let failed = false;
      try {
        await harness.database.run(async transaction => {
          await createSqlContractStore(transaction).create({
            id: contractId,
            proposalId: chain.proposalId,
            offerId: chain.offerId,
            applicationId: chain.applicationId!,
            employerId,
            employeeId: candidateId,
            status: 'DRAFT',
            monthlySalary: 175_000,
            currency: 'FCFA',
            startDate: '01 Novembre 2026',
            currentMonth: 1,
            durationMonths: 6,
            periodicity: 'Mensuel',
            missionDescription: 'Contrat rollback P0-F',
            location: 'Cotonou',
            conditions: ['Temps plein'],
            employerSigned: false,
            employeeSigned: false,
            commissionPercentage: 25,
            commissionAmountDue: 0,
            commissionStatus: 'SCHEDULED',
            monthlyCheckpoints: [],
            commissionLedger: [],
            paymentSchedule: [],
            history: [],
            createdAt: harness.clock.value.toISOString(),
            updatedAt: harness.clock.value.toISOString(),
          });
          await createSqlProposalStore(transaction).attachContract(chain.proposalId, contractId, harness.clock.value.toISOString());
          throw new Error('SIMULATED_P0F_TRANSACTION_FAILURE');
        });
      } catch (error) {
        failed = String((error as Error)?.message ?? error).includes('SIMULATED_P0F_TRANSACTION_FAILURE');
      }
      assert(failed, 'erreur volontaire propagée');
      assert(await readContract(harness, contractId) === null, 'aucun contrat ne survit au ROLLBACK');
      const proposalRow = await harness.database.query<{ contract_id: string | null }>(
        'SELECT contract_id FROM proposals WHERE id = $1', [chain.proposalId],
      );
      assert(proposalRow.rows[0]?.contract_id === null, 'aucun lien de proposition ne survit au ROLLBACK');
    });

    await check('P0-F Contrat déjà modifié: une action rejouée avec une autre clé sur un état modifié est refusée (409) sans double effet', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0f-modified-create-001', chain.proposalId);
      const first = await harness.worker.fetch(contractActionRequest(contractId, 'send', employerToken, 'p0f-modified-send-001'));
      assert(first.status === 200, `200 attendu, reçu ${first.status}`);
      const historyBefore = (await readContract(harness, contractId))?.history.length ?? 0;
      const replayOtherKey = await harness.worker.fetch(contractActionRequest(contractId, 'send', employerToken, 'p0f-modified-send-002'));
      assert(replayOtherKey.status === 409, `409 attendu, reçu ${replayOtherKey.status}`);
      const replayAgain = await harness.worker.fetch(contractActionRequest(contractId, 'send', employerToken, 'p0f-modified-send-003'));
      assert(replayAgain.status === 409, `409 attendu, reçu ${replayAgain.status}`);
      assert((await readContract(harness, contractId))?.history.length === historyBefore, 'aucune écriture supplémentaire');
    });

    await check('P0-F États refusés: DRAFT → ACTIVE et SENT → ACTIVE (mono-signature) refusés (409) sans aucune écriture', async () => {
      const draftChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const draftId = await createDraftContract(harness, employerToken, 'p0f-states-create-001', draftChain.proposalId);
      const draftToActive = await harness.worker.fetch(contractActionRequest(draftId, 'activate', employerToken, 'p0f-states-draft-active-001'));
      assert(draftToActive.status === 409, `DRAFT → ACTIVE: 409 attendu, reçu ${draftToActive.status}`);
      const untouched = await readContract(harness, draftId);
      assert(untouched?.status === 'DRAFT' && untouched?.history.length === 1, 'seule la création a été écrite');

      // SENT → ACTIVE : sans signature salarié.
      const sentChain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const sentId = await createDraftContract(harness, employerToken, 'p0f-states-sent-create-001', sentChain.proposalId);
      await sendContract(harness, employerToken, 'p0f-states-sent-send-001', sentId);
      const activateUnilateral = await harness.worker.fetch(contractActionRequest(sentId, 'activate', employerToken, 'p0f-states-sent-active-001'));
      assert(activateUnilateral.status === 409, `activation unilatérale: 409 attendu, reçu ${activateUnilateral.status}`);
      const sentStored = await readContract(harness, sentId);
      assert(sentStored?.status === 'SIGNATURE' && sentStored?.history.length === 2, 'SENT → ACTIVE refusé sans écriture');
    });

    await check('P0-F Périmètre: cycle mensuel, paiements, incidents, remplacements, notifications et messages restent fermés (501)', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const deliveredContractId = await createDraftContract(harness, employerToken, 'p0f-closed-create-001', chain.proposalId);

      const closed = await Promise.all([
        harness.worker.fetch(authRequest(`/api/v1/contracts/${deliveredContractId}/monthly-actions`, employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0f-closed-monthly-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/payments/commission-declarations', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0f-closed-payments-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/incidents', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0f-closed-incidents-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/replacements/rep_p0f_absent', employerToken)),
        harness.worker.fetch(authRequest('/api/v1/my/notifications', employerToken)),
        harness.worker.fetch(authRequest('/api/v1/conversations/cnv_p0f/messages', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0f-closed-messages-001' },
          body: '{}',
        })),
      ]);
      assert(
        closed.every(response => response.status === 501),
        `501 attendu pour tout handler non ouvert, reçus ${closed.map(response => response.status).join('/')}`,
      );
      assert((await readContract(harness, deliveredContractId))?.status === 'DRAFT', 'aucun effet hors domaine');
    });

    await check('P0-F Séparation DEMO/API: DEMO reste Mock par défaut, l’état de référence est PostgreSQL', async () => {
      const demo = resolveRepositoryMode({});
      const api = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' });
      assert(demo.mode === 'mock', 'MODE DEMO doit rester le défaut');
      assert(api.mode === 'api', 'MODE API exige la configuration explicite same-origin');

      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0f-separation-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-separation-send-001', contractId);

      const stored = await readContract(harness, contractId);
      assert(stored?.status === 'SIGNATURE', 'l’état de référence reste la ligne PostgreSQL');
      const user = await createSqlUserStore(harness.database).findById(candidateId);
      assert(user?.id === candidateId, 'les acteurs sont relus depuis PostgreSQL');
      assert(user?.status === 'ACTIVE', 'compte candidat actif');
    });

    await check('P0-F Acteur non ACTIF: aucune transition n’est appliquée par un compte PENDING (403)', async () => {
      const chain = await seedProposalChain(harness, { employerId, employeeId: candidateId });
      const contractId = await createDraftContract(harness, employerToken, 'p0f-pending-create-001', chain.proposalId);
      await sendContract(harness, employerToken, 'p0f-pending-send-001', contractId);

      await harness.database.query("UPDATE users SET status = 'PENDING' WHERE id = $1", [candidateId]);
      const pendingActor: AuthenticatedActor = {
        id: candidateId, role: 'CANDIDATE', permissions: [], sessionId: newEntityId('ses'),
      };
      let error: unknown;
      try {
        await harness.contracts!.signContract(pendingActor, contractId, {
          actor: pendingActor,
          command: 'contracts.sign',
          idempotencyKey: 'p0f-pending-candidate-001',
          requestId: 'req-p0f-pending',
        });
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof Error && error.message.length > 0, 'un refus explicite est attendu');
      assert((await readContract(harness, contractId))?.employeeSigned === false, 'aucune écriture pour un compte non actif');
      await harness.database.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [candidateId]);
      assert((await createSqlUserStore(harness.database).findById(candidateId))?.status === 'ACTIVE', 'compte restauré');
    });
  } finally {
    await harness.close();
    contractIdempotencyCache.clear();
  }

  return results;
}
