/**
 * LE LABEUR — P0-E5 — tests Worker/API → repository métier → PostgreSQL
 * du cycle PROPOSITION D'EMBAUCHE.
 *
 * Périmètre ouvert : émission (EMPLOYER propriétaire d'une offre, vers une
 * candidature admissible), acceptation et déclinaison (CANDIDATE destinataire),
 * expiration explicite (EMPLOYER émetteur) et lecture ADMIN. Contrats, paiements,
 * commissions, plaintes, remplacements, notifications générales et messages
 * restent fermés (501) : une vérification explicite le confirme.
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from './offers.test';
import { ApiError } from './errors';
import type { AuthenticatedActor } from '../productionContracts';
import type { ApplicationRecord, ContractRecord, OfferRecord, ProposalRecord } from '../persistence/coreRecords';
import { createSqlIdentityStores, createSqlUserStore } from '../identity/sqlStores';
import {
  createSqlApplicationStore,
  createSqlContractStore,
  createSqlOfferStore,
  createSqlProposalStore,
} from '../persistence/sqlCoreStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { proposalIdempotencyCache } from '../repositories/proposalRepository';
import { resolveRepositoryMode } from '../../repositories/mode';
import type { MissionProposal, ProposalStatus } from '../../types';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeOffer(id: string, employerId: string, status: OfferRecord['status'] = 'ACTIVE'): OfferRecord {
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
    summary: 'Offre de test P0-E5.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function seedApplication(
  harness: Harness,
  input: { id: string; offerId: string; candidateId: string; status?: ApplicationRecord['status']; contractId?: string },
): Promise<string> {
  const timestamp = '2026-10-05T15:10:00.000Z';
  const record: ApplicationRecord = {
    id: input.id,
    offerId: input.offerId,
    candidateId: input.candidateId,
    status: input.status ?? 'PENDING',
    appliedDate: timestamp,
    history: [{ action: 'Candidature transmise', timestamp, actor: 'Candidat P0-E5' }],
    createdAt: timestamp,
    updatedAt: timestamp,
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
    applicationId: string;
    employerId: string;
    employeeId: string;
    status: ProposalStatus;
    contractId?: string;
    conversationId?: string;
  },
): Promise<ProposalRecord> {
  const timestamp = '2026-10-05T15:20:00.000Z';
  const record: ProposalRecord = {
    id: input.id,
    conversationId: input.conversationId ?? `cnv_${input.id}`,
    offerId: input.offerId,
    applicationId: input.applicationId,
    employerId: input.employerId,
    employeeId: input.employeeId,
    missionTitle: `Mission ${input.id}`,
    amount: 150_000,
    currency: 'FCFA',
    periodicity: 'Mensuel',
    startDate: '01 Novembre 2026',
    durationMonths: 6,
    location: 'Cotonou',
    conditions: ['Temps plein'],
    status: input.status,
    sentAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.contractId ? { contractId: input.contractId } : {}),
  };
  return createSqlProposalStore(harness.database).create(record);
}

function proposalCreateRequest(
  conversationId: string,
  token: string | null,
  key: string,
  body: Record<string, unknown>,
): Request {
  return authRequest(`/api/v1/conversations/${encodeURIComponent(conversationId)}/proposals`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

function proposalRespondRequest(
  proposalId: string,
  token: string | null,
  key: string,
  body: Record<string, unknown>,
): Request {
  return authRequest(`/api/v1/proposals/${encodeURIComponent(proposalId)}/respond`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

function proposalExpireRequest(proposalId: string, token: string | null, key: string): Request {
  return authRequest(`/api/v1/proposals/${encodeURIComponent(proposalId)}/expire`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: '{}',
  });
}

interface PersistedProposal {
  status: string;
  employerId: string;
  employeeId: string;
  offerId: string;
  applicationId: string | null;
  conversationId: string;
  amount: string;
  updatedAt: string;
}

async function readProposal(harness: Harness, proposalId: string): Promise<PersistedProposal | null> {
  const result = await harness.database.query<{
    status: string;
    employer_id: string;
    employee_id: string;
    offer_id: string;
    application_id: string | null;
    conversation_id: string;
    amount: string;
    updated_at: unknown;
  }>(
    `SELECT status, employer_id, employee_id, offer_id, application_id, conversation_id, amount, updated_at
       FROM proposals WHERE id = $1`,
    [proposalId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    status: row.status,
    employerId: row.employer_id,
    employeeId: row.employee_id,
    offerId: row.offer_id,
    applicationId: row.application_id,
    conversationId: row.conversation_id,
    amount: String(row.amount),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ''),
  };
}

async function countProposalRows(harness: Harness, where = '1 = 1', values: unknown[] = []): Promise<number> {
  const result = await harness.database.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM proposals WHERE ${where}`,
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
      displayName: 'Admin P0-E5',
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { token, userId };
}

export async function runProposalDomainTests(): Promise<OfferTestResult[]> {
  proposalIdempotencyCache.clear();
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
  let otherEmployerId = '';

  const offers = {
    send: 'ofr_p0e5_send',
    foreign: 'ofr_p0e5_foreign',
    paused: 'ofr_p0e5_paused',
    contracted: 'ofr_p0e5_contracted',
    respond: 'ofr_p0e5_respond',
    terminal: (status: string) => `ofr_p0e5_terminal_${status.toLowerCase()}`,
    concurrentAccept: 'ofr_p0e5_concurrent_accept',
    concurrentDecline: 'ofr_p0e5_concurrent_decline',
    concurrentExpire: 'ofr_p0e5_concurrent_expire',
    idempotent: 'ofr_p0e5_idempotent',
    list: 'ofr_p0e5_list',
  };

  const applicationIds = {
    send: 'app_p0e5_send',
    foreign: 'app_p0e5_foreign',
    paused: 'app_p0e5_paused',
    contracted: 'app_p0e5_contracted',
    respond: 'app_p0e5_respond',
    concurrentAccept: 'app_p0e5_concurrent_accept',
    concurrentDecline: 'app_p0e5_concurrent_decline',
    concurrentExpire: 'app_p0e5_concurrent_expire',
    idempotent: 'app_p0e5_idempotent',
    list: 'app_p0e5_list',
  };

  try {
    await check('P0-E5 Setup: sessions candidat, autre candidat, employeur propriétaire, autre employeur, ADMIN + offres', async () => {
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
      otherEmployerId = otherEmployer.userId;
      await provisionAdmin(harness);

      const store = createSqlOfferStore(harness.database);
      await Promise.all([
        store.create(makeOffer(offers.send, employerId)),
        store.create(makeOffer(offers.foreign, otherEmployerId)),
        store.create(makeOffer(offers.paused, employerId, 'PAUSED')),
        store.create(makeOffer(offers.contracted, employerId)),
        store.create(makeOffer(offers.respond, employerId)),
        store.create(makeOffer(offers.concurrentAccept, employerId)),
        store.create(makeOffer(offers.concurrentDecline, employerId)),
        store.create(makeOffer(offers.concurrentExpire, employerId)),
        store.create(makeOffer(offers.idempotent, employerId)),
        store.create(makeOffer(offers.list, employerId)),
        ...['REJECTED', 'WITHDRAWN', 'HIRED', 'CONTRACTED', 'CLOSED_OFFER_FILLED'].map(status =>
          store.create(makeOffer(offers.terminal(status), employerId))),
      ]);
      assert(candidateId !== otherCandidateId && employerId !== otherEmployerId, 'acteurs distincts');
    });

    /* ---------------- 1. ÉMISSION ---------------- */

    let sentProposalId = '';
    await check('P0-E5 Émission: EMPLOYER propriétaire crée une proposition SENT, réellement persistée en PostgreSQL', async () => {
      await seedApplication(harness, { id: applicationIds.send, offerId: offers.send, candidateId });
      const response = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_send', employerToken, 'p0e5-send-001', {
        offerId: offers.send,
        applicationId: applicationIds.send,
        missionTitle: 'Menuisier qualifié',
        amount: 150_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 6,
        location: 'Cotonou',
        conditions: ['Temps plein'],
      }));
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const body = await response.json() as MissionProposal;
      sentProposalId = body.id;
      assert(body.id.startsWith('prp_'), `identifiant prp_* attendu, reçu ${body.id}`);
      assert(body.status === 'SENT', `statut SENT attendu, reçu ${body.status}`);
      assert(body.employerId === employerId, 'employerId dérivé de la session');
      assert(body.employeeId === candidateId, 'employeeId dérivé de la candidature');
      assert(body.employerName === 'Société Alpha', 'nom employeur résolu depuis users');
      assert(body.applicationId === applicationIds.send, 'candidature liée');
      assert(body.offerId === offers.send, 'offre liée');
      assert(body.conversationId === 'cnv_p0e5_send', 'conversation de transport conservée');

      const stored = await readProposal(harness, sentProposalId);
      assert(stored?.status === 'SENT', 'SENT réellement persisté');
      assert(stored?.employerId === employerId && stored?.employeeId === candidateId, 'parties persistées correctes');
      assert(stored?.applicationId === applicationIds.send && stored?.offerId === offers.send, 'références SQL correctes');
      assert(Number(stored?.amount) === 150_000, 'montant persisté');

      // Aucune conséquence hors périmètre : ni offre FILLED, ni candidature modifiée, ni contrat.
      const offer = await harness.database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [offers.send]);
      assert(offer.rows[0]?.status === 'ACTIVE', 'l’offre reste ACTIVE (P0-E5 ne produit pas FILLED)');
      const application = await harness.database.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM applications WHERE id = $1', [applicationIds.send],
      );
      assert(application.rows[0]?.status === 'PENDING', 'la candidature reste PENDING');
      assert(application.rows[0]?.contract_id === null, 'aucun contrat créé');
    });

    await check('P0-E5 Émission: candidature inexistante refusée (404)', async () => {
      const response = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_missing', employerToken, 'p0e5-send-missing-001', {
        applicationId: 'app_p0e5_inexistante',
        missionTitle: 'Mission',
        amount: 100_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      }));
      assert(response.status === 404, `404 attendu, reçu ${response.status}`);
    });

    await check('P0-E5 Émission: candidature d’une autre offre refusée (409)', async () => {
      const response = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_mismatch', employerToken, 'p0e5-send-mismatch-001', {
        offerId: offers.foreign,
        applicationId: applicationIds.send,
        missionTitle: 'Mission',
        amount: 100_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      }));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
    });

    await check('P0-E5 Autorisation: propose sur la candidature d’une offre d’un autre employeur → 403', async () => {
      await seedApplication(harness, { id: applicationIds.foreign, offerId: offers.foreign, candidateId });
      const response = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_foreign', employerToken, 'p0e5-send-foreign-001', {
        applicationId: applicationIds.foreign,
        missionTitle: 'Mission',
        amount: 100_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      }));
      assert(response.status === 403, `403 attendu, reçu ${response.status}`);
      assert(await countProposalRows(harness, 'application_id = $1', [applicationIds.foreign]) === 0, 'aucune écriture pour un tiers');
      assert(otherEmployerId !== employerId, 'employeurs distincts');
    });

    await check('P0-E5 Émission: candidatures terminales (P0-E4) refusées (409) chacune', async () => {
      const terminalStatuses = ['REJECTED', 'WITHDRAWN', 'HIRED', 'CONTRACTED', 'CLOSED_OFFER_FILLED'] as const;
      for (const status of terminalStatuses) {
        const offerId = offers.terminal(status);
        const applicationId = await seedApplication(harness, {
          id: `app_p0e5_terminal_${status.toLowerCase()}`,
          offerId,
          candidateId,
          status,
        });
        const response = await harness.worker.fetch(proposalCreateRequest(
          `cnv_p0e5_terminal_${status.toLowerCase()}`,
          employerToken,
          `p0e5-send-terminal-${status.toLowerCase()}-001`,
          {
            applicationId,
            missionTitle: 'Mission',
            amount: 100_000,
            currency: 'FCFA',
            periodicity: 'Mensuel',
            startDate: '01 Novembre 2026',
            durationMonths: 3,
            location: 'Cotonou',
          },
        ));
        assert(response.status === 409, `${status}: 409 attendu, reçu ${response.status}`);
        assert(await countProposalRows(harness, 'application_id = $1', [applicationId]) === 0, `${status}: aucune proposition écrite`);
      }
    });

    await check('P0-E5 Émission: candidature déjà liée à un contrat refusée (409)', async () => {
      // FK croisées `applications.contract_id` ↔ `contracts.application_id` :
      // la candidature est créée d'abord, le contrat ensuite, puis le lien est posé.
      await seedApplication(harness, {
        id: applicationIds.contracted,
        offerId: offers.contracted,
        candidateId,
      });
      const timestamp = '2026-10-05T15:30:00.000Z';
      const contract: ContractRecord = {
        id: 'ctr_p0e5_seed',
        offerId: offers.contracted,
        applicationId: applicationIds.contracted,
        employerId,
        employeeId: candidateId,
        status: 'SIGNATURE',
        monthlySalary: 150_000,
        currency: 'FCFA',
        startDate: '2026-11-01',
        currentMonth: 1,
        durationMonths: 6,
        periodicity: 'Mensuel',
        missionDescription: 'Fixture hors périmètre P0-E5.',
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
      await createSqlContractStore(harness.database).create(contract);
      await harness.database.query('UPDATE applications SET contract_id = $1 WHERE id = $2', [
        contract.id,
        applicationIds.contracted,
      ]);

      const response = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_contracted', employerToken, 'p0e5-send-contracted-001', {
        applicationId: applicationIds.contracted,
        missionTitle: 'Mission',
        amount: 100_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      }));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
    });

    await check('P0-E5 Émission: offre non ACTIVE refusée (409)', async () => {
      await seedApplication(harness, { id: applicationIds.paused, offerId: offers.paused, candidateId });
      const response = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_paused', employerToken, 'p0e5-send-paused-001', {
        applicationId: applicationIds.paused,
        missionTitle: 'Mission',
        amount: 100_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      }));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
    });

    await check('P0-E5 Émission: charge utile invalide refusée (400) — montant, périodicité, champ d’autorité client', async () => {
      const base = {
        applicationId: applicationIds.send,
        missionTitle: 'Mission',
        amount: 100_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      };
      const cases: Array<[string, Record<string, unknown>]> = [
        ['montant nul', { ...base, amount: 0 }],
        ['périodicité inventée', { ...base, periodicity: 'Trimestriel' }],
        ['durée nulle', { ...base, durationMonths: 0 }],
        ['champ inconnu', { ...base, status: 'ACCEPTED' }],
        ['identité client fournie', { ...base, employeeId: otherCandidateId }],
      ];
      for (const [label, body] of cases) {
        const response = await harness.worker.fetch(proposalCreateRequest(
          'cnv_p0e5_invalid',
          employerToken,
          `p0e5-send-invalid-${label.replace(/[^a-z]/gi, '').toLowerCase()}-001`,
          body,
        ));
        assert(response.status === 400, `${label}: 400 attendu, reçu ${response.status}`);
      }
      assert(await countProposalRows(harness, 'conversation_id = $1', ['cnv_p0e5_invalid']) === 0, 'aucune écriture invalide');
    });

    await check('P0-E5 Autorisation: CANDIDATE ne peut pas émettre (403 routeur) et un acteur inconnu est refusé (401)', async () => {
      const response = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_role', candidateToken, 'p0e5-send-role-001', {
        applicationId: applicationIds.send,
        missionTitle: 'Mission',
        amount: 100_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      }));
      assert(response.status === 403, `403 attendu, reçu ${response.status}`);

      assert(harness.proposals, 'repository proposition attendu dans la composition PostgreSQL');
      const unknownEmployer: AuthenticatedActor = {
        id: 'usr_p0e5_unknown',
        role: 'EMPLOYER',
        permissions: [],
        sessionId: 'ses_p0e5_unknown',
      };
      let error: unknown;
      try {
        await harness.proposals!.createProposal(unknownEmployer, 'cnv_p0e5_unknown', {
          offerId: offers.send,
          applicationId: applicationIds.send,
          missionTitle: 'Mission',
          amount: 100_000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Novembre 2026',
          durationMonths: 3,
          location: 'Cotonou',
          conditions: [],
        }, {
          actor: unknownEmployer, command: 'proposals.create', idempotencyKey: 'p0e5-unknown-send-001', requestId: 'req-p0e5-unknown',
        });
      } catch (caught) {
        error = caught;
      }
      assert(
        error instanceof ApiError && error.code === 'UNAUTHENTICATED',
        `UNAUTHENTICATED attendu pour un acteur inconnu, reçu ${String(error)}`,
      );
    });

    /* ---------------- 2. RÉPONSES ---------------- */

    await check('P0-E5 Acceptation: CANDIDATE destinataire SENT → ACCEPTED, persisté, sans contrat ni offre FILLED', async () => {
      await seedApplication(harness, { id: applicationIds.respond, offerId: offers.respond, candidateId });
      await seedProposal(harness, {
        id: 'prp_p0e5_accept',
        offerId: offers.respond,
        applicationId: applicationIds.respond,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const response = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_accept', candidateToken, 'p0e5-accept-001', { action: 'ACCEPT' },
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as MissionProposal;
      assert(body.status === 'ACCEPTED', `ACCEPTED attendu, reçu ${body.status}`);
      const stored = await readProposal(harness, 'prp_p0e5_accept');
      assert(stored?.status === 'ACCEPTED', 'ACCEPTED réellement persisté');
      const contracts = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM contracts WHERE application_id = $1', [applicationIds.respond],
      );
      assert(Number(contracts.rows[0]?.count ?? 0) === 0, 'aucun contrat créé par P0-E5');
      const offer = await harness.database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [offers.respond]);
      assert(offer.rows[0]?.status === 'ACTIVE', 'l’offre reste ACTIVE');
    });

    await check('P0-E5 Déclinaison: CANDIDATE destinataire SENT → DECLINED, persisté', async () => {
      await seedProposal(harness, {
        id: 'prp_p0e5_decline',
        offerId: offers.respond,
        applicationId: applicationIds.respond,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const response = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_decline', candidateToken, 'p0e5-decline-001', { action: 'DECLINE', notes: 'Trop loin.' },
      ));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as MissionProposal;
      assert(body.status === 'DECLINED', `DECLINED attendu, reçu ${body.status}`);
      assert(
        body.revisionNotes === undefined,
        'aucun champ de motif inventé : le modèle réel ne stocke un texte que pour une révision',
      );
      assert((await readProposal(harness, 'prp_p0e5_decline'))?.status === 'DECLINED', 'DECLINED persisté');
    });

    await check('P0-E5 Autorisation: un autre CANDIDATE et l’EMPLOYER ne peuvent pas répondre (403)', async () => {
      await seedProposal(harness, {
        id: 'prp_p0e5_other_responder',
        offerId: offers.respond,
        applicationId: applicationIds.respond,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const byOther = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_other_responder', otherCandidateToken, 'p0e5-other-candidate-001', { action: 'ACCEPT' },
      ));
      assert(byOther.status === 403, `403 attendu pour un autre candidat, reçu ${byOther.status}`);
      const byEmployer = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_other_responder', employerToken, 'p0e5-employer-respond-001', { action: 'ACCEPT' },
      ));
      assert(byEmployer.status === 403, `403 attendu pour l’employeur, reçu ${byEmployer.status}`);
      assert((await readProposal(harness, 'prp_p0e5_other_responder'))?.status === 'SENT', 'proposition intacte');
    });

    await check('P0-E5 Réponse: proposition inexistante (404) et action invalide (400) refusées', async () => {
      const missing = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_absent', candidateToken, 'p0e5-missing-respond-001', { action: 'ACCEPT' },
      ));
      assert(missing.status === 404, `404 attendu, reçu ${missing.status}`);
      const invalid = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_other_responder', candidateToken, 'p0e5-invalid-action-001', { action: 'HACK' },
      ));
      assert(invalid.status === 400, `400 attendu, reçu ${invalid.status}`);
    });

    await check('P0-E5 Périmètre: REVISE (REVISION_REQUESTED) reste fermé (501), aucune écriture', async () => {
      const response = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_other_responder', candidateToken, 'p0e5-revise-001', { action: 'REVISE', notes: 'Ajuster le salaire.' },
      ));
      assert(response.status === 501, `501 attendu, reçu ${response.status}`);
      const body = await response.json() as { error: { code: string } };
      assert(body.error.code === 'NOT_IMPLEMENTED', `NOT_IMPLEMENTED attendu, reçu ${body.error.code}`);
      assert((await readProposal(harness, 'prp_p0e5_other_responder'))?.status === 'SENT', 'proposition intacte');
    });

    /* ---------------- 3. EXPIRATION ---------------- */

    await check('P0-E5 Expiration: EMPLOYER émetteur SENT → EXPIRED, persisté', async () => {
      await seedProposal(harness, {
        id: 'prp_p0e5_expire',
        offerId: offers.respond,
        applicationId: applicationIds.respond,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const response = await harness.worker.fetch(proposalExpireRequest('prp_p0e5_expire', employerToken, 'p0e5-expire-001'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as MissionProposal;
      assert(body.status === 'EXPIRED', `EXPIRED attendu, reçu ${body.status}`);
      assert((await readProposal(harness, 'prp_p0e5_expire'))?.status === 'EXPIRED', 'EXPIRED réellement persisté');

      // Même Idempotency-Key : rejeu sans effet, état clos inchangé.
      const replay = await harness.worker.fetch(proposalExpireRequest('prp_p0e5_expire', employerToken, 'p0e5-expire-001'));
      assert(replay.status === 200, `rejeu d’expiration 200 attendu, reçu ${replay.status}`);
      assert(((await replay.json()) as MissionProposal).status === 'EXPIRED', 'rejeu : même état EXPIRED');
      assert((await readProposal(harness, 'prp_p0e5_expire'))?.status === 'EXPIRED', 'aucun second effet');
    });

    await check('P0-E5 Autorisation: expiration refusée au CANDIDATE (403 routeur) et à un autre EMPLOYER (403 repository)', async () => {
      await seedProposal(harness, {
        id: 'prp_p0e5_expire_guard',
        offerId: offers.respond,
        applicationId: applicationIds.respond,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const byCandidate = await harness.worker.fetch(proposalExpireRequest('prp_p0e5_expire_guard', candidateToken, 'p0e5-expire-candidate-001'));
      assert(byCandidate.status === 403, `403 attendu pour le candidat, reçu ${byCandidate.status}`);
      const byOtherEmployer = await harness.worker.fetch(proposalExpireRequest('prp_p0e5_expire_guard', otherEmployerToken, 'p0e5-expire-other-employer-001'));
      assert(byOtherEmployer.status === 403, `403 attendu pour un autre employeur, reçu ${byOtherEmployer.status}`);
      const missing = await harness.worker.fetch(proposalExpireRequest('prp_p0e5_expire_absent', employerToken, 'p0e5-expire-missing-001'));
      assert(missing.status === 404, `404 attendu pour une proposition inexistante, reçu ${missing.status}`);
      assert((await readProposal(harness, 'prp_p0e5_expire_guard'))?.status === 'SENT', 'proposition intacte');
    });

    /* ---------------- 4. TRANSITIONS INTERDITES ---------------- */

    await check('P0-E5 Transitions interdites: états clos (ACCEPTED, DECLINED, EXPIRED) refusent toute action (409)', async () => {
      await seedProposal(harness, { id: 'prp_p0e5_closed_accepted', offerId: offers.respond, applicationId: applicationIds.respond, employerId, employeeId: candidateId, status: 'ACCEPTED' });
      await seedProposal(harness, { id: 'prp_p0e5_closed_declined', offerId: offers.respond, applicationId: applicationIds.respond, employerId, employeeId: candidateId, status: 'DECLINED' });
      await seedProposal(harness, { id: 'prp_p0e5_closed_expired', offerId: offers.respond, applicationId: applicationIds.respond, employerId, employeeId: candidateId, status: 'EXPIRED' });

      const attempts: Array<[string, Request]> = [
        ['ACCEPT après ACCEPTED', proposalRespondRequest('prp_p0e5_closed_accepted', candidateToken, 'p0e5-closed-accept-001', { action: 'ACCEPT' })],
        ['DECLINE après ACCEPTED', proposalRespondRequest('prp_p0e5_closed_accepted', candidateToken, 'p0e5-closed-decline-001', { action: 'DECLINE' })],
        ['EXPIRE après ACCEPTED', proposalExpireRequest('prp_p0e5_closed_accepted', employerToken, 'p0e5-closed-expire-001')],
        ['ACCEPT après DECLINED', proposalRespondRequest('prp_p0e5_closed_declined', candidateToken, 'p0e5-closed-accept-002', { action: 'ACCEPT' })],
        ['DECLINE après DECLINED', proposalRespondRequest('prp_p0e5_closed_declined', candidateToken, 'p0e5-closed-decline-002', { action: 'DECLINE' })],
        ['ACCEPT après EXPIRED', proposalRespondRequest('prp_p0e5_closed_expired', candidateToken, 'p0e5-closed-accept-003', { action: 'ACCEPT' })],
        ['EXPIRE après EXPIRED', proposalExpireRequest('prp_p0e5_closed_expired', employerToken, 'p0e5-closed-expire-003')],
      ];
      for (const [label, request] of attempts) {
        const response = await harness.worker.fetch(request);
        assert(response.status === 409, `${label}: 409 attendu, reçu ${response.status}`);
      }
      assert((await readProposal(harness, 'prp_p0e5_closed_accepted'))?.status === 'ACCEPTED', 'ACCEPTED inchangé');
      assert((await readProposal(harness, 'prp_p0e5_closed_declined'))?.status === 'DECLINED', 'DECLINED inchangé');
      assert((await readProposal(harness, 'prp_p0e5_closed_expired'))?.status === 'EXPIRED', 'EXPIRED inchangé');
    });

    await check('P0-E5 Transitions interdites: DRAFT et REVISION_REQUESTED (non produits par P0-E5) refusés (409)', async () => {
      await seedProposal(harness, { id: 'prp_p0e5_draft', offerId: offers.respond, applicationId: applicationIds.respond, employerId, employeeId: candidateId, status: 'DRAFT' });
      await seedProposal(harness, { id: 'prp_p0e5_revision', offerId: offers.respond, applicationId: applicationIds.respond, employerId, employeeId: candidateId, status: 'REVISION_REQUESTED' });

      const draftAccept = await harness.worker.fetch(proposalRespondRequest('prp_p0e5_draft', candidateToken, 'p0e5-draft-accept-001', { action: 'ACCEPT' }));
      assert(draftAccept.status === 409, `DRAFT/ACCEPT: 409 attendu, reçu ${draftAccept.status}`);
      const revisionAccept = await harness.worker.fetch(proposalRespondRequest('prp_p0e5_revision', candidateToken, 'p0e5-revision-accept-001', { action: 'ACCEPT' }));
      assert(revisionAccept.status === 409, `REVISION_REQUESTED/ACCEPT: 409 attendu, reçu ${revisionAccept.status}`);
      const revisionExpire = await harness.worker.fetch(proposalExpireRequest('prp_p0e5_revision', employerToken, 'p0e5-revision-expire-001'));
      assert(revisionExpire.status === 409, `REVISION_REQUESTED/EXPIRE: 409 attendu, reçu ${revisionExpire.status}`);
      assert((await readProposal(harness, 'prp_p0e5_draft'))?.status === 'DRAFT', 'DRAFT inchangé');
      assert((await readProposal(harness, 'prp_p0e5_revision'))?.status === 'REVISION_REQUESTED', 'REVISION_REQUESTED inchangé');
    });

    await check('P0-E5 Périmètre contrat: une proposition déjà liée à un contrat n’accepte plus rien (409)', async () => {
      await seedProposal(harness, {
        id: 'prp_p0e5_linked_contract',
        offerId: offers.respond,
        applicationId: applicationIds.respond,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
        contractId: 'ctr_p0e5_seed',
      });
      const response = await harness.worker.fetch(proposalRespondRequest(
        'prp_p0e5_linked_contract', candidateToken, 'p0e5-linked-contract-001', { action: 'ACCEPT' },
      ));
      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      assert((await readProposal(harness, 'prp_p0e5_linked_contract'))?.status === 'SENT', 'proposition intacte');
    });

    /* ---------------- 5. IDEMPOTENCE ---------------- */

    await check('P0-E5 Idempotence: même clé, même charge utile → rejeu sans seconde écriture', async () => {
      await seedApplication(harness, { id: applicationIds.idempotent, offerId: offers.idempotent, candidateId });
      const body = {
        applicationId: applicationIds.idempotent,
        missionTitle: 'Mission idempotente',
        amount: 120_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      };
      const first = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_idem', employerToken, 'p0e5-idem-create-001', body));
      assert(first.status === 201, `201 attendu, reçu ${first.status}`);
      const firstBody = await first.json() as MissionProposal;
      const replay = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_idem', employerToken, 'p0e5-idem-create-001', body));
      assert(replay.status === 201, `rejeu 201 attendu, reçu ${replay.status}`);
      const replayBody = await replay.json() as MissionProposal;
      assert(replayBody.id === firstBody.id, 'même proposition rejouée');
      assert(await countProposalRows(harness, 'application_id = $1', [applicationIds.idempotent]) === 1, 'une seule proposition persistée');
    });

    await check('P0-E5 Idempotence: même clé, charge utile différente → 409 IDEMPOTENCY_CONFLICT', async () => {
      const conflict = await harness.worker.fetch(proposalCreateRequest('cnv_p0e5_idem', employerToken, 'p0e5-idem-create-001', {
        applicationId: applicationIds.idempotent,
        missionTitle: 'Mission différente',
        amount: 130_000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 3,
        location: 'Cotonou',
      }));
      assert(conflict.status === 409, `409 attendu, reçu ${conflict.status}`);
      const body = await conflict.json() as { error: { code: string } };
      assert(body.error.code === 'IDEMPOTENCY_CONFLICT', `IDEMPOTENCY_CONFLICT attendu, reçu ${body.error.code}`);

      await seedProposal(harness, {
        id: 'prp_p0e5_idem_respond',
        offerId: offers.idempotent,
        applicationId: applicationIds.idempotent,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const first = await harness.worker.fetch(proposalRespondRequest('prp_p0e5_idem_respond', candidateToken, 'p0e5-idem-respond-001', { action: 'ACCEPT' }));
      assert(first.status === 200, `200 attendu, reçu ${first.status}`);
      const sameKeyReplay = await harness.worker.fetch(proposalRespondRequest('prp_p0e5_idem_respond', candidateToken, 'p0e5-idem-respond-001', { action: 'ACCEPT' }));
      assert(sameKeyReplay.status === 200, `rejeu idempotent 200 attendu, reçu ${sameKeyReplay.status}`);
      assert((await readProposal(harness, 'prp_p0e5_idem_respond'))?.status === 'ACCEPTED', 'une seule transition appliquée');
      const otherKey = await harness.worker.fetch(proposalRespondRequest('prp_p0e5_idem_respond', candidateToken, 'p0e5-idem-respond-002', { action: 'ACCEPT' }));
      assert(otherKey.status === 409, `action répétée avec une autre clé: 409 attendu, reçu ${otherKey.status}`);

      // Même clé, action différente (charge utile différente) → conflit d'idempotence.
      await seedProposal(harness, {
        id: 'prp_p0e5_idem_conflict',
        offerId: offers.idempotent,
        applicationId: applicationIds.idempotent,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const accepted = await harness.worker.fetch(proposalRespondRequest('prp_p0e5_idem_conflict', candidateToken, 'p0e5-idem-conflict-001', { action: 'ACCEPT' }));
      assert(accepted.status === 200, `200 attendu, reçu ${accepted.status}`);
      const conflicting = await harness.worker.fetch(proposalRespondRequest('prp_p0e5_idem_conflict', candidateToken, 'p0e5-idem-conflict-001', { action: 'DECLINE' }));
      assert(conflicting.status === 409, `409 attendu, reçu ${conflicting.status}`);
      const conflictBody = await conflicting.json() as { error: { code: string } };
      assert(conflictBody.error.code === 'IDEMPOTENCY_CONFLICT', `IDEMPOTENCY_CONFLICT attendu, reçu ${conflictBody.error.code}`);
      assert((await readProposal(harness, 'prp_p0e5_idem_conflict'))?.status === 'ACCEPTED', 'la première réponse reste la référence');
    });

    /* ---------------- 6. CONCURRENCE ---------------- */

    await check('P0-E5 Concurrence: deux acceptations simultanées → aucun double effet, aucun état impossible', async () => {
      await seedApplication(harness, { id: applicationIds.concurrentAccept, offerId: offers.concurrentAccept, candidateId });
      await seedProposal(harness, {
        id: 'prp_p0e5_race_accept',
        offerId: offers.concurrentAccept,
        applicationId: applicationIds.concurrentAccept,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const [first, second] = await Promise.all([
        harness.worker.fetch(proposalRespondRequest('prp_p0e5_race_accept', candidateToken, 'p0e5-race-accept-a-001', { action: 'ACCEPT' })),
        harness.worker.fetch(proposalRespondRequest('prp_p0e5_race_accept', candidateToken, 'p0e5-race-accept-b-001', { action: 'ACCEPT' })),
      ]);
      for (const response of [first, second]) {
        assert(response.status === 200 || response.status === 409, `200/409 attendus (jamais 5xx), reçu ${response.status}`);
        if (response.status === 200) {
          const body = await response.json() as MissionProposal;
          assert(body.status === 'ACCEPTED', `état final attendu ACCEPTED, reçu ${body.status}`);
        }
      }
      assert((await readProposal(harness, 'prp_p0e5_race_accept'))?.status === 'ACCEPTED', 'ACCEPTED persisté une seule fois');
      assert(
        await countProposalRows(harness, "status = 'ACCEPTED' AND application_id = $1", [applicationIds.concurrentAccept]) === 1,
        'aucune proposition dupliquée',
      );
    });

    await check('P0-E5 Concurrence: deux déclinaisons simultanées → un seul DECLINED', async () => {
      await seedApplication(harness, { id: applicationIds.concurrentDecline, offerId: offers.concurrentDecline, candidateId });
      await seedProposal(harness, {
        id: 'prp_p0e5_race_decline',
        offerId: offers.concurrentDecline,
        applicationId: applicationIds.concurrentDecline,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const [first, second] = await Promise.all([
        harness.worker.fetch(proposalRespondRequest('prp_p0e5_race_decline', candidateToken, 'p0e5-race-decline-a-001', { action: 'DECLINE' })),
        harness.worker.fetch(proposalRespondRequest('prp_p0e5_race_decline', candidateToken, 'p0e5-race-decline-b-001', { action: 'DECLINE' })),
      ]);
      for (const response of [first, second]) {
        assert(response.status === 200 || response.status === 409, `200/409 attendus, reçu ${response.status}`);
      }
      assert((await readProposal(harness, 'prp_p0e5_race_decline'))?.status === 'DECLINED', 'DECLINED persisté une seule fois');
    });

    await check('P0-E5 Concurrence: expiration et acceptation simultanées → état final légal, jamais incohérent', async () => {
      await seedApplication(harness, { id: applicationIds.concurrentExpire, offerId: offers.concurrentExpire, candidateId });
      await seedProposal(harness, {
        id: 'prp_p0e5_race_expire',
        offerId: offers.concurrentExpire,
        applicationId: applicationIds.concurrentExpire,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const [expire, accept] = await Promise.all([
        harness.worker.fetch(proposalExpireRequest('prp_p0e5_race_expire', employerToken, 'p0e5-race-expire-001')),
        harness.worker.fetch(proposalRespondRequest('prp_p0e5_race_expire', candidateToken, 'p0e5-race-expire-accept-001', { action: 'ACCEPT' })),
      ]);
      for (const response of [expire, accept]) {
        assert(response.status === 200 || response.status === 409, `200/409 attendus, reçu ${response.status}`);
        if (response.status === 200) {
          const body = await response.json() as MissionProposal;
          assert(
            body.status === 'EXPIRED' || body.status === 'ACCEPTED',
            `état final légal attendu, reçu ${body.status}`,
          );
        }
      }
      const stored = await readProposal(harness, 'prp_p0e5_race_expire');
      assert(
        stored?.status === 'EXPIRED' || stored?.status === 'ACCEPTED',
        `état final légal attendu en base, reçu ${stored?.status}`,
      );
    });

    /* ---------------- 7. LECTURE ADMIN ---------------- */

    await check('P0-E5 Lecture: ADMIN autorisé (permission SQL) liste les propositions réellement persistées', async () => {
      await seedApplication(harness, { id: applicationIds.list, offerId: offers.list, candidateId });
      await seedProposal(harness, {
        id: 'prp_p0e5_listed',
        offerId: offers.list,
        applicationId: applicationIds.list,
        employerId,
        employeeId: candidateId,
        status: 'SENT',
      });
      const forbiddenEmployer = await harness.worker.fetch(authRequest('/api/v1/admin/proposals', employerToken));
      assert(forbiddenEmployer.status === 403, `403 attendu pour un EMPLOYER, reçu ${forbiddenEmployer.status}`);
      const forbiddenCandidate = await harness.worker.fetch(authRequest('/api/v1/admin/proposals', candidateToken));
      assert(forbiddenCandidate.status === 403, `403 attendu pour un CANDIDATE, reçu ${forbiddenCandidate.status}`);

      // ADMIN provisionné côté serveur (jamais en self-service) : session SQL.
      const adminId = newEntityId('usr');
      const adminToken = newOpaqueSessionToken();
      const createdAt = harness.clock.value.toISOString();
      const expiresAt = new Date(harness.clock.value.getTime() + 3_600_000).toISOString();
      const stores = createSqlIdentityStores(harness.database);
      await stores.transaction(async transaction => {
        await transaction.users.create({
          id: adminId, role: 'ADMIN', status: 'ACTIVE', email: `admin.list.${adminId}@example.com`, displayName: 'Admin P0-E5',
        });
        await transaction.sessions.create({ userId: adminId, token: adminToken, createdAt, expiresAt });
      });

      const allowed = await harness.worker.fetch(authRequest('/api/v1/admin/proposals?limit=50', adminToken));
      assert(allowed.status === 200, `200 attendu pour l’ADMIN, reçu ${allowed.status}`);
      const page = await allowed.json() as { items: Array<{ id: string; status: string }>; hasMore: boolean; limit: number };
      assert(page.items.some(item => item.id === 'prp_p0e5_listed'), 'la proposition persistée est lue depuis PostgreSQL');
      assert(page.items.every(item => typeof item.status === 'string'), 'statuts projetés');

      const invalidCursor = await harness.worker.fetch(authRequest('/api/v1/admin/proposals?cursor=prp_p0e5_absent', adminToken));
      assert(invalidCursor.status === 400, `400 attendu pour un curseur inconnu, reçu ${invalidCursor.status}`);

      const unauthenticated = await harness.worker.fetch(authRequest('/api/v1/admin/proposals', null));
      assert(unauthenticated.status === 401, `401 attendu sans session, reçu ${unauthenticated.status}`);
    });

    /* ---------------- 8. ROLLBACK ET CONCURRENCE D'ÉCRITURE ---------------- */

    await check('P0-E5 Rollback PostgreSQL: une proposition écrite dans une transaction échouée n’est pas persistée', async () => {
      const proposalId = 'prp_p0e5_rollback';
      let failed = false;
      try {
        await harness.database.run(async transaction => {
          await createSqlProposalStore(transaction).create({
            id: proposalId,
            conversationId: 'cnv_p0e5_rollback',
            offerId: offers.respond,
            applicationId: applicationIds.respond,
            employerId,
            employeeId: candidateId,
            missionTitle: 'Proposition rollback',
            amount: 90_000,
            currency: 'FCFA',
            periodicity: 'Mensuel',
            startDate: '01 Novembre 2026',
            durationMonths: 2,
            location: 'Cotonou',
            conditions: [],
            status: 'SENT',
            sentAt: harness.clock.value.toISOString(),
            createdAt: harness.clock.value.toISOString(),
            updatedAt: harness.clock.value.toISOString(),
          });
          throw new Error('SIMULATED_P0E5_TRANSACTION_FAILURE');
        });
      } catch (error) {
        failed = String((error as Error)?.message ?? error).includes('SIMULATED_P0E5_TRANSACTION_FAILURE');
      }
      assert(failed, 'erreur volontaire propagée');
      assert(await readProposal(harness, proposalId) === null, 'aucune ligne ne survit au ROLLBACK');

      // Compare-and-set depuis un statut obsolète : aucune écriture.
      const stale = await createSqlProposalStore(harness.database).compareAndSetStatus('prp_p0e5_expire_guard', 'ACCEPTED', {
        status: 'DECLINED',
        updatedAt: harness.clock.value.toISOString(),
      });
      assert(stale === null, 'une transition depuis un statut obsolète ne doit rien écrire');
      assert((await readProposal(harness, 'prp_p0e5_expire_guard'))?.status === 'SENT', 'statut SENT préservé');

      // Compte non ACTIF : refus explicite, aucune écriture.
      await harness.database.query("UPDATE users SET status = 'PENDING' WHERE id = $1", [candidateId]);
      const pendingActor: AuthenticatedActor = {
        id: candidateId, role: 'CANDIDATE', permissions: [], sessionId: 'ses_p0e5_pending_candidate',
      };
      let error: unknown;
      try {
        await harness.proposals!.respondToProposal(pendingActor, 'prp_p0e5_expire_guard', 'ACCEPT', undefined, {
          actor: pendingActor, command: 'proposals.respond', idempotencyKey: 'p0e5-pending-candidate-001', requestId: 'req-p0e5-pending',
        });
      } catch (caught) {
        error = caught;
      }
      assert(
        error instanceof ApiError && error.code === 'FORBIDDEN',
        `FORBIDDEN attendu pour un compte non actif, reçu ${String(error)}`,
      );
      assert((await readProposal(harness, 'prp_p0e5_expire_guard'))?.status === 'SENT', 'aucune écriture pour un compte non actif');
      await harness.database.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [candidateId]);
    });

    /* ---------------- 9. PÉRIMÈTRE ET SÉPARATION DEMO/API ---------------- */

    await check('P0-E5 Périmètre: contrats, paiements, incidents, messages et listes de candidatures restent fermés (501)', async () => {
      const closed = await Promise.all([
        harness.worker.fetch(authRequest('/api/v1/contracts', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0e5-closed-contracts-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/payments/commission-declarations', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0e5-closed-payments-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/incidents', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0e5-closed-incidents-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/conversations/cnv_p0e5/messages', employerToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0e5-closed-messages-001' },
          body: '{}',
        })),
        harness.worker.fetch(authRequest('/api/v1/my/applications', candidateToken)),
        harness.worker.fetch(authRequest('/api/v1/applications/app_p0e5_send', employerToken)),
      ]);
      assert(
        closed.every(response => response.status === 501),
        `501 attendu pour tout handler non ouvert, reçus ${closed.map(response => response.status).join('/')}`,
      );
    });

    await check('P0-E5 Séparation DEMO/API: DEMO reste Mock par défaut, l’état de référence est PostgreSQL', async () => {
      const demo = resolveRepositoryMode({});
      const api = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' });
      assert(demo.mode === 'mock', 'MODE DEMO doit rester le défaut');
      assert(api.mode === 'api', 'MODE API exige la configuration explicite same-origin');

      const stored = await readProposal(harness, sentProposalId);
      assert(stored?.status === 'SENT', 'l’état de référence reste la ligne PostgreSQL');
      const user = await createSqlUserStore(harness.database).findById(candidateId);
      assert(user?.id === candidateId, 'les acteurs sont relus depuis PostgreSQL');
    });
  } finally {
    await harness.close();
    proposalIdempotencyCache.clear();
  }

  return results;
}
