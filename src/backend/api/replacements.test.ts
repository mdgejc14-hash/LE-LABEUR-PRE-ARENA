/**
 * P0-REPLACEMENT — tests d'intégration du workflow persistant PostgreSQL.
 *
 * Le test traverse le Claim existant, publie une offre normale, réutilise les
 * repositories Application/Proposal/Contract, vérifie l'outbox/notification et
 * active finalement un contrat successeur distinct. Aucun matching ni paiement
 * n'est déplacé du contrat source.
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from './offers.test';
import type { AuthenticatedActor, Permission, ProductionCommandContext } from '../productionContracts';
import type { ContractRecord, OfferRecord } from '../persistence/coreRecords';
import { createSqlContractStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { buildContractActivationPlan } from '../../domain/contractScheduleAutomation';

const SEED_AT = '2026-10-05T14:00:00.000Z';
const SOURCE_START_DATE = '05 Septembre 2026';
const MONTHLY_SALARY = 175_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function command(actor: AuthenticatedActor, name: string, idempotencyKey: string): ProductionCommandContext {
  return { actor, command: name, idempotencyKey, requestId: `req-${idempotencyKey}` };
}

function post(
  harness: Awaited<ReturnType<typeof createOffersTestHarness>>,
  path: string,
  token: string,
  key: string,
  body: unknown,
): Promise<Response> {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }));
}

async function responseJson<T>(response: Response, expectedStatus: number, label: string): Promise<T> {
  const text = await response.text();
  assert(response.status === expectedStatus, `${label}: ${expectedStatus} attendu, reçu ${response.status}; ${text}`);
  return JSON.parse(text) as T;
}

async function actorFor(
  harness: Awaited<ReturnType<typeof createOffersTestHarness>>,
  userId: string,
  role: AuthenticatedActor['role'],
  permissions: readonly Permission[] = [],
): Promise<AuthenticatedActor> {
  const sessions = await harness.database.query<{ id: string }>(
    'SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  assert(sessions.rows[0], `session réelle attendue pour ${userId}`);
  return { id: userId, role, permissions, sessionId: sessions.rows[0].id };
}

async function provisionAdmin(harness: Awaited<ReturnType<typeof createOffersTestHarness>>): Promise<{ userId: string; token: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = harness.clock.value.toISOString();
  const identities = createSqlIdentityStores(harness.database);
  await identities.transaction(async stores => {
    await stores.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.replacement.${userId}@example.com`,
      displayName: 'Admin P0-REPLACEMENT',
    });
    await stores.sessions.create({
      userId,
      token,
      createdAt,
      expiresAt: new Date(harness.clock.value.getTime() + 3_600_000).toISOString(),
    });
  });
  return { userId, token };
}

async function provisionCandidate(
  harness: Awaited<ReturnType<typeof createOffersTestHarness>>,
  displayName: string,
): Promise<AuthenticatedActor> {
  const userId = newEntityId('usr');
  await createSqlIdentityStores(harness.database).users.create({
    id: userId,
    role: 'CANDIDATE',
    status: 'ACTIVE',
    email: `${userId}@replacement.test`,
    displayName,
  });
  // Ces appels ciblent les repositories derrière la frontière Worker : la
  // session n'est pas relue par les repositories, mais l'acteur reste typé et
  // son compte/son rôle sont toujours relus dans PostgreSQL.
  return { id: userId, role: 'CANDIDATE', permissions: [], sessionId: `test-session-${userId}` };
}

async function seedActiveSourceContract(
  harness: Awaited<ReturnType<typeof createOffersTestHarness>>,
  employerId: string,
  employeeId: string,
): Promise<string> {
  const offerId = newEntityId('ofr');
  const offer: OfferRecord = {
    id: offerId,
    employerId,
    title: `Mission source ${offerId}`,
    contractType: 'CDD',
    remuneration: MONTHLY_SALARY,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_AT,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Gestion'],
    summary: 'Offre d’origine pour le test P0-REPLACEMENT.',
    responsibilities: [],
    conditions: ['Temps plein'],
    selectionProcess: [],
    status: 'ACTIVE',
    durationMonths: 2,
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
  await createSqlOfferStore(harness.database).create(offer);

  const contractId = newEntityId('ctr');
  const plan = buildContractActivationPlan({
    contractId,
    employerId,
    employeeId,
    periodicity: 'Mensuel',
    startDate: SOURCE_START_DATE,
    durationMonths: 2,
    monthlySalary: MONTHLY_SALARY,
    currency: 'FCFA',
    commissionPercentage: 25,
  }, SEED_AT);
  assert(plan.kind === 'SCHEDULED', `plan mensuel source attendu, reçu ${plan.kind}`);
  const contract: ContractRecord = {
    id: contractId,
    offerId,
    employerId,
    employeeId,
    status: 'ACTIVE',
    monthlySalary: MONTHLY_SALARY,
    currency: 'FCFA',
    startDate: SOURCE_START_DATE,
    currentMonth: 1,
    durationMonths: 2,
    periodicity: 'Mensuel',
    missionDescription: 'Contrat source P0-REPLACEMENT.',
    location: 'Cotonou',
    conditions: ['Temps plein'],
    employerSigned: true,
    employeeSigned: true,
    commissionPercentage: plan.commissionPercentage,
    commissionAmountDue: plan.commissionAmountDue,
    commissionStatus: plan.commissionStatus,
    monthlyCheckpoints: [...plan.monthlyCheckpoints],
    commissionLedger: [...plan.commissionLedger],
    paymentSchedule: [...plan.paymentSchedule],
    history: [{
      id: newEntityId('rev'),
      timestamp: SEED_AT,
      event: 'CONTRACT_ACTIVATED',
      description: 'Historique antérieur du contrat source à conserver.',
      actor: 'Test P0-REPLACEMENT',
    }],
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
  await createSqlContractStore(harness.database).create(contract);
  return contractId;
}

function proposalInput(offerId: string, applicationId: string, missionTitle: string) {
  return {
    offerId,
    applicationId,
    missionTitle,
    amount: 160_000,
    currency: 'FCFA',
    periodicity: 'Mensuel' as const,
    startDate: '01 Novembre 2026',
    durationMonths: 4,
    location: 'Cotonou',
    conditions: ['Horaires définis par l’employeur et présentés au candidat avant acceptation.'],
  };
}

export async function runReplacementDomainTests(): Promise<OfferTestResult[]> {
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
    let employerId = '';
    let employerToken = '';
    let employer: AuthenticatedActor | null = null;
    let otherEmployerToken = '';
    let originalCandidateId = '';
    let originalCandidateToken = '';
    let candidate2: AuthenticatedActor | null = null;
    let candidate3: AuthenticatedActor | null = null;
    let candidate4: AuthenticatedActor | null = null;
    let adminId = '';
    let adminToken = '';
    let originalContractId = '';
    let sourcePaymentSnapshot: Array<{ id: string; payment_type: string; amount: string; status: string; updated_at: string }> = [];
    let claimId = '';
    let replacementId = '';
    let replacementOfferId = '';
    let replacementOfferTitle = '';
    let declinedProposalId = '';
    let acceptedProposalId = '';
    let newContractId = '';

    await check('P0-REPLACEMENT ouverture, REPLACE concurrent/idempotent, ownership, historique, audit, notifications et paiements inchangés', async () => {
      const employerSession = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      employerId = employerSession.userId;
      employerToken = employerSession.token;
      employer = await actorFor(harness, employerId, 'EMPLOYER');
      const otherEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      otherEmployerToken = otherEmployer.token;
      const originalCandidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      originalCandidateId = originalCandidate.userId;
      originalCandidateToken = originalCandidate.token;
      candidate2 = await actorFor(harness, (await authenticateActor(harness, 'candidate-2', 'CANDIDATE')).userId, 'CANDIDATE');
      candidate3 = await provisionCandidate(harness, 'Candidat remplacement 3');
      candidate4 = await provisionCandidate(harness, 'Candidat remplacement 4');
      const provisionedAdmin = await provisionAdmin(harness);
      adminId = provisionedAdmin.userId;
      adminToken = provisionedAdmin.token;

      originalContractId = await seedActiveSourceContract(harness, employerId, originalCandidateId);
      assert(harness.payments, 'repository paiement PostgreSQL requis pour le contrôle de non-régression');
      await harness.payments.materializePaymentsForContract(originalContractId);
      const beforePayments = await harness.database.query<{ id: string; payment_type: string; amount: string; status: string; updated_at: string }>(
        'SELECT id,payment_type,amount::text AS amount,status,updated_at::text AS updated_at FROM payments WHERE contract_id=$1 ORDER BY id',
        [originalContractId],
      );
      assert(beforePayments.rows.length > 0, 'paiements préexistants matérialisés pour le contrat source');
      sourcePaymentSnapshot = beforePayments.rows;

      const claimResponse = await post(harness, '/api/v1/claims', originalCandidateToken, 'replacement-claim-create-001', {
        contractId: originalContractId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Incident nécessitant un remplacement durable de la mission.',
      });
      const claim = await responseJson<{ claimId: string; status: string }>(claimResponse, 201, 'création du Claim incident');
      claimId = claim.claimId;
      assert(claim.status === 'OPEN', 'Claim incident ouvert dans le cycle existant');

      const review = await post(harness, `/api/v1/admin/claims/${claimId}/review`, adminToken, 'replacement-claim-review-001', {
        note: 'Revue d’un incident contractuel.',
      });
      await responseJson(review, 200, 'revue ADMIN du Claim');

      const decisionKeyA = 'replacement-claim-replace-a-001';
      const decisionKeyB = 'replacement-claim-replace-b-001';
      const [decisionA, decisionB] = await Promise.all([
        post(harness, `/api/v1/admin/claims/${claimId}/decision`, adminToken, decisionKeyA, {
          decision: 'REPLACE',
          resolution: 'Le contrat initial est remplacé; le candidat doit postuler et accepter une proposition.',
        }),
        post(harness, `/api/v1/admin/claims/${claimId}/decision`, adminToken, decisionKeyB, {
          decision: 'REPLACE',
          resolution: 'Le contrat initial est remplacé; le candidat doit postuler et accepter une proposition.',
        }),
      ]);
      const decisionResults = [
        { response: decisionA, key: decisionKeyA },
        { response: decisionB, key: decisionKeyB },
      ];
      const winner = decisionResults.find(item => item.response.status === 200);
      const loser = decisionResults.find(item => item.response.status !== 200);
      assert(winner && loser, `une seule décision concurrente doit gagner (statuts ${decisionA.status}/${decisionB.status})`);
      assert(loser.response.status === 409, `la décision concurrente perdante doit être refusée par CAS, reçu ${loser.response.status}`);
      const decidedClaim = await responseJson<{ status: string; replacementId?: string }>(winner.response, 200, 'décision REPLACE');
      assert(decidedClaim.status === 'RESOLVED' && decidedClaim.replacementId, 'décision REPLACE résout le Claim et retourne le dossier');
      replacementId = decidedClaim.replacementId;

      const replay = await post(harness, `/api/v1/admin/claims/${claimId}/decision`, adminToken, winner.key, {
        decision: 'REPLACE',
        resolution: 'Le contrat initial est remplacé; le candidat doit postuler et accepter une proposition.',
      });
      const replayedClaim = await responseJson<{ replacementId?: string }>(replay, 200, 'rejeu idempotent de la décision REPLACE');
      assert(replayedClaim.replacementId === replacementId, 'rejeu retourne le même remplacement');
      const replacementCount = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM replacements WHERE original_contract_id=$1',
        [originalContractId],
      );
      assert(replacementCount.rows[0]?.count === '1', 'contrainte active : un seul dossier de remplacement pour le contrat source');

      const source = await harness.database.query<{ status: string; replacement_id: string; incident_id: string | null; history: Array<Record<string, unknown>> }>(
        'SELECT status,replacement_id,incident_id,history FROM contracts WHERE id=$1',
        [originalContractId],
      );
      assert(source.rows[0].status === 'REPLACED', 'ancien contrat marqué REPLACED à la décision');
      assert(source.rows[0].replacement_id === replacementId && source.rows[0].incident_id === null, 'l’ancien contrat pointe vers le dossier et son incident est clos');
      assert(source.rows[0].history.length === 2, 'historique source préservé et complété sans écrasement');
      assert(source.rows[0].history[0].event === 'CONTRACT_ACTIVATED' && source.rows[0].history[1].event === 'CONTRACT_REPLACED', 'historique initial + marqueur REPLACED conservés');

      const employerRead = await harness.worker.fetch(authRequest(`/api/v1/replacements/${replacementId}`, employerToken));
      const employerDossier = await responseJson<{ id: string; originalContractId: string; status: string }>(employerRead, 200, 'lecture propriétaire employeur');
      assert(employerDossier.id === replacementId && employerDossier.originalContractId === originalContractId && employerDossier.status === 'PENDING_OFFER', 'dossier persistant visible à l’employeur propriétaire');
      const sourceCandidateRead = await harness.worker.fetch(authRequest(`/api/v1/replacements/${replacementId}`, originalCandidateToken));
      assert(sourceCandidateRead.status === 200, 'titulaire du contrat source reste partie autorisée');
      const nonPartyRead = await harness.worker.fetch(authRequest(`/api/v1/replacements/${replacementId}`, otherEmployerToken));
      assert(nonPartyRead.status === 404, `un autre employeur ne peut pas lire le dossier, reçu ${nonPartyRead.status}`);
      const candidate2Read = await harness.worker.fetch(authRequest(`/api/v1/replacements/${replacementId}`, (await authenticateActor(harness, 'candidate-2', 'CANDIDATE')).token));
      assert(candidate2Read.status === 404, `candidat non sélectionné non partie au dossier, reçu ${candidate2Read.status}`);
      const adminList = await harness.worker.fetch(authRequest('/api/v1/admin/replacements?limit=10', adminToken));
      const adminPage = await responseJson<{ items: Array<{ id: string }> }>(adminList, 200, 'lecture ADMIN des remplacements');
      assert(adminPage.items.some(item => item.id === replacementId), 'permission ADMIN replacements:read:any réutilisée');

      const forbiddenPublish = await post(harness, `/api/v1/replacements/${replacementId}/offer`, otherEmployerToken, 'replacement-offer-wrong-owner-001', {
        title: 'Offre non autorisée', contractType: 'CDD', remuneration: 160_000, currency: 'FCFA', location: 'Cotonou',
        isUrgent: true, skills: ['Gestion'], summary: 'Offre refusée.', responsibilities: [], conditions: [], selectionProcess: [], durationMonths: 4,
      });
      assert(forbiddenPublish.status === 403, `un employeur tiers ne publie pas l’offre, reçu ${forbiddenPublish.status}`);

      const offerInput = {
        title: 'Remplacement mission source',
        contractType: 'CDD',
        remuneration: 160_000,
        currency: 'FCFA',
        location: 'Cotonou',
        isUrgent: true,
        skills: ['Gestion'],
        summary: 'Offre de remplacement publiée par l’employeur propriétaire.',
        responsibilities: ['Poursuivre la mission existante selon ses modalités.'],
        conditions: ['Modalités présentées dans la proposition avant acceptation.'],
        selectionProcess: ['Candidature, sélection et proposition.'],
        startDate: '2026-11-01',
        durationMonths: 4,
      };
      replacementOfferTitle = offerInput.title;
      const published = await post(harness, `/api/v1/replacements/${replacementId}/offer`, employerToken, 'replacement-offer-publish-001', offerInput);
      const publishedDossier = await responseJson<{ urgentOfferId: string; status: string }>(published, 201, 'publication de l’offre par l’employeur');
      replacementOfferId = publishedDossier.urgentOfferId;
      assert(replacementOfferId.startsWith('ofr_') && publishedDossier.status === 'SOURCING_CANDIDATES', 'offre standard liée au dossier et candidats recherchés');
      const publicationReplay = await post(harness, `/api/v1/replacements/${replacementId}/offer`, employerToken, 'replacement-offer-publish-001', offerInput);
      const replayedDossier = await responseJson<{ urgentOfferId: string }>(publicationReplay, 201, 'rejeu idempotent de publication');
      assert(replayedDossier.urgentOfferId === replacementOfferId, 'rejeu publication conserve la même offre');
      const publicationConflict = await post(harness, `/api/v1/replacements/${replacementId}/offer`, employerToken, 'replacement-offer-publish-001', { ...offerInput, title: 'Payload différent' });
      assert(publicationConflict.status === 409, `clé d’idempotence avec payload divergent refusée, reçu ${publicationConflict.status}`);
      const publishAgain = await post(harness, `/api/v1/replacements/${replacementId}/offer`, employerToken, 'replacement-offer-publish-second-key-001', offerInput);
      assert(publishAgain.status === 409, `deuxième offre sur le même remplacement refusée, reçu ${publishAgain.status}`);

      assert(harness.automationWorker, 'worker de notifications existant requis');
      await harness.automationWorker.drainEvents(100);
      const replacementNotices = await harness.database.query<{ recipient_id: string; type: string; source_event_type: string }>(
        `SELECT recipient_id,type,source_event_type FROM notifications
          WHERE aggregate_type='REPLACEMENT' AND aggregate_id=$1 AND source_event_type='REPLACEMENT_CREATED'
          ORDER BY recipient_id`,
        [replacementId],
      );
      assert(replacementNotices.rows.length === 3, `notification unique pour employeur, titulaire initial et ADMIN (reçu ${replacementNotices.rows.length})`);
      assert(replacementNotices.rows.some(row => row.recipient_id === employerId && row.type === 'REPLACEMENT_INITIATED'), 'employeur notifié via P0-NOTIFICATIONS');
      assert(replacementNotices.rows.some(row => row.recipient_id === originalCandidateId && row.type === 'REPLACEMENT_INITIATED'), 'titulaire initial notifié via P0-NOTIFICATIONS');
      assert(replacementNotices.rows.some(row => row.recipient_id === adminId && row.type === 'REPLACEMENT_INITIATED'), 'ADMIN notifié via P0-NOTIFICATIONS');
      await harness.automationWorker.drainEvents(100);
      const noticeCount = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM notifications WHERE aggregate_type='REPLACEMENT' AND aggregate_id=$1 AND source_event_type='REPLACEMENT_CREATED'",
        [replacementId],
      );
      assert(noticeCount.rows[0]?.count === '3', 'rejeu du worker ne duplique pas les notifications');
      const events = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM automation_outbox WHERE event_type='REPLACEMENT_CREATED' AND aggregate_id=$1",
        [replacementId],
      );
      assert(events.rows[0]?.count === '1', 'un seul événement REPLACEMENT_CREATED est émis malgré le rejeu/conflit concurrent');
      const audit = await harness.database.query<{ action: string }>(
        'SELECT action FROM automation_audit_ledger WHERE entity_id=$1',
        [replacementId],
      );
      assert(audit.rows.some(row => row.action === 'REPLACEMENT_CREATED') && audit.rows.some(row => row.action === 'REPLACEMENT_OFFER_PUBLISHED'), 'décision et publication inscrites au ledger d’audit existant');

      const paymentsAfterDecision = await harness.database.query<{ id: string; payment_type: string; amount: string; status: string; updated_at: string }>(
        'SELECT id,payment_type,amount::text AS amount,status,updated_at::text AS updated_at FROM payments WHERE contract_id=$1 ORDER BY id',
        [originalContractId],
      );
      assert(JSON.stringify(paymentsAfterDecision.rows) === JSON.stringify(sourcePaymentSnapshot), 'décision et sourcing ne modifient aucun paiement source');
    });

    await check('P0-REPLACEMENT candidature éligible, CAS de sélection, retrait/refus et consentement explicite', async () => {
      assert(employer && candidate2 && candidate3 && candidate4, 'acteurs du workflow initialisés');
      assert(harness.applications && harness.proposals, 'repositories Application et Proposal existants requis');
      assert(replacementOfferId && originalCandidateToken, 'offre de remplacement publiée');

      const originalCandidateApplication = await post(
        harness,
        `/api/v1/offers/${replacementOfferId}/applications`,
        originalCandidateToken,
        'replacement-original-candidate-apply-001',
        {},
      );
      assert(originalCandidateApplication.status === 409, `le titulaire initial ne peut pas postuler à son propre remplacement, reçu ${originalCandidateApplication.status}`);

      const firstApplication = await harness.applications.applyToOffer(
        candidate2,
        replacementOfferId,
        command(candidate2, 'applications.create', 'replacement-candidate-2-apply-001'),
        { note: 'Candidature volontaire au poste publié.' },
      );
      const secondApplication = await harness.applications.applyToOffer(
        candidate3,
        replacementOfferId,
        command(candidate3, 'applications.create', 'replacement-candidate-3-apply-001'),
        { note: 'Je prends connaissance des modalités proposées.' },
      );
      assert(firstApplication.status === 'PENDING' && secondApplication.status === 'PENDING', 'les candidats éligibles utilisent Application normal');

      const shortlistResults = await Promise.allSettled([
        harness.applications.shortlist(employer, firstApplication.id, command(employer, 'applications.shortlist', 'replacement-shortlist-candidate-2-001')),
        harness.applications.shortlist(employer, secondApplication.id, command(employer, 'applications.shortlist', 'replacement-shortlist-candidate-3-001')),
      ]);
      const selectedResult = shortlistResults.find(result => result.status === 'fulfilled');
      const rejectedResult = shortlistResults.find(result => result.status === 'rejected');
      assert(selectedResult?.status === 'fulfilled' && rejectedResult?.status === 'rejected', 'une seule sélection concurrente gagne le CAS du dossier');
      const losingError = rejectedResult.reason as { status?: number };
      assert(losingError.status === 409, `seconde sélection refusée par conflit (409), reçu ${String(losingError.status)}`);
      const selectedApplication = selectedResult.value;
      const otherApplication = selectedApplication.id === firstApplication.id ? secondApplication : firstApplication;
      assert(selectedApplication.status === 'SHORTLISTED', 'sélection utilise la transition SHORTLISTED existante');

      const selectedActor = selectedApplication.candidateId === candidate2.id ? candidate2 : candidate3;
      const withdrawal = await harness.applications.withdraw(
        selectedActor,
        selectedApplication.id,
        command(selectedActor, 'applications.withdraw', 'replacement-selected-withdraw-001'),
      );
      assert(withdrawal.status === 'WITHDRAWN', 'retrait de la candidature sélectionnée suit le cycle normal');
      const withdrawalState = await harness.database.query<{ status: string; selected_application_id: string | null }>(
        'SELECT status,selected_application_id FROM replacements WHERE replacement_id=$1',
        [replacementId],
      );
      assert(withdrawalState.rows[0].status === 'SOURCING_CANDIDATES' && withdrawalState.rows[0].selected_application_id === null, 'retrait libère la sélection de façon transactionnelle');

      await harness.applications.shortlist(
        employer,
        otherApplication.id,
        command(employer, 'applications.shortlist', 'replacement-shortlist-fallback-001'),
      );
      const declinedCandidate = otherApplication.candidateId === candidate2.id ? candidate2 : candidate3;
      const declineProposal = await harness.proposals.createProposal(
        employer,
        'conversation-replacement-decline',
        proposalInput(replacementOfferId, otherApplication.id, replacementOfferTitle),
        command(employer, 'proposals.create', 'replacement-proposal-decline-001'),
      );
      declinedProposalId = declineProposal.id;
      const declined = await harness.proposals.respondToProposal(
        declinedCandidate,
        declineProposal.id,
        'DECLINE',
        'Je décline cette proposition.',
        command(declinedCandidate, 'proposals.respond', 'replacement-proposal-decline-response-001'),
      );
      assert(declined.status === 'DECLINED', 'le refus du candidat utilise la transition Proposal existante');
      const declineState = await harness.database.query<{ status: string; selected_application_id: string | null; selected_proposal_id: string | null }>(
        'SELECT status,selected_application_id,selected_proposal_id FROM replacements WHERE replacement_id=$1',
        [replacementId],
      );
      assert(declineState.rows[0].status === 'SOURCING_CANDIDATES' && declineState.rows[0].selected_application_id === null && declineState.rows[0].selected_proposal_id === null, 'refus candidat libère le dossier sans transfert forcé');

      const finalApplication = await harness.applications.applyToOffer(
        candidate4,
        replacementOfferId,
        command(candidate4, 'applications.create', 'replacement-candidate-4-apply-001'),
        { note: 'Candidature après réouverture du sourcing.' },
      );
      await harness.applications.shortlist(
        employer,
        finalApplication.id,
        command(employer, 'applications.shortlist', 'replacement-shortlist-candidate-4-001'),
      );
      const acceptedProposal = await harness.proposals.createProposal(
        employer,
        'conversation-replacement-accept',
        proposalInput(replacementOfferId, finalApplication.id, replacementOfferTitle),
        command(employer, 'proposals.create', 'replacement-proposal-accept-001'),
      );
      acceptedProposalId = acceptedProposal.id;
      const consent = await harness.proposals.respondToProposal(
        candidate4,
        acceptedProposal.id,
        'ACCEPT',
        undefined,
        command(candidate4, 'proposals.respond', 'replacement-proposal-accept-response-001'),
      );
      assert(consent.status === 'ACCEPTED', 'consentement explicite du candidat persisté par Proposal');
      const acceptedReplay = await harness.proposals.respondToProposal(
        candidate4,
        acceptedProposal.id,
        'ACCEPT',
        undefined,
        command(candidate4, 'proposals.respond', 'replacement-proposal-accept-response-001'),
      );
      assert(acceptedReplay.status === 'ACCEPTED', 'rejeu du consentement ne crée pas de second effet');
      const acceptedState = await harness.database.query<{ status: string; selected_application_id: string; selected_candidate_id: string; selected_proposal_id: string }>(
        'SELECT status,selected_application_id,selected_candidate_id,selected_proposal_id FROM replacements WHERE replacement_id=$1',
        [replacementId],
      );
      assert(acceptedState.rows[0].status === 'TRANSFERRED_TO_EMPLOYER', 'seule la proposition ACCEPTED permet le passage au contrat');
      assert(acceptedState.rows[0].selected_application_id === finalApplication.id && acceptedState.rows[0].selected_candidate_id === candidate4.id && acceptedState.rows[0].selected_proposal_id === acceptedProposal.id, 'liens candidature/candidat/proposition cohérents');
    });

    await check('P0-REPLACEMENT contrat successeur distinct, liens bidirectionnels, cycle normal et paiements séparés', async () => {
      assert(employer && candidate4, 'acteur employeur et candidat retenu initialisés');
      assert(harness.contracts && harness.automationWorker && harness.payments, 'repositories Contrat/Paiement et worker existants requis');
      assert(acceptedProposalId && replacementId && originalContractId, 'proposition acceptée et dossier de remplacement présents');

      const createCommand = command(employer, 'contracts.create', 'replacement-contract-create-001');
      const newContract = await harness.contracts.createContract(employer, { proposalId: acceptedProposalId }, createCommand);
      newContractId = newContract.id;
      const createReplay = await harness.contracts.createContract(employer, { proposalId: acceptedProposalId }, createCommand);
      assert(createReplay.id === newContractId, 'rejeu création contrat retourne le même contrat distinct');
      assert(newContractId !== originalContractId && newContract.status === 'DRAFT', 'contrat successeur distinct au statut initial DRAFT');
      assert(newContract.replacementId === replacementId && newContract.replacedContractId === originalContractId, 'contrat successeur lié au dossier et au contrat source');

      const replacement = await harness.database.query<{
        status: string; original_contract_id: string; selected_application_id: string; selected_candidate_id: string;
        selected_proposal_id: string; new_contract_id: string;
      }>(
        'SELECT status,original_contract_id,selected_application_id,selected_candidate_id,selected_proposal_id,new_contract_id FROM replacements WHERE replacement_id=$1',
        [replacementId],
      );
      assert(replacement.rows[0].status === 'CONTRACT_FINALIZED' && replacement.rows[0].original_contract_id === originalContractId && replacement.rows[0].new_contract_id === newContractId, 'dossier conserve ses deux contrats liés');
      assert(replacement.rows[0].selected_proposal_id === acceptedProposalId && replacement.rows[0].selected_candidate_id === candidate4.id, 'dossier conserve le consentement et le candidat choisis');

      const sourceBeforeActivation = await harness.database.query<{ status: string; replacement_id: string; history: Array<Record<string, unknown>> }>(
        'SELECT status,replacement_id,history FROM contracts WHERE id=$1',
        [originalContractId],
      );
      assert(sourceBeforeActivation.rows[0].status === 'REPLACED' && sourceBeforeActivation.rows[0].replacement_id === replacementId, 'contrat source reste REPLACED');
      assert(sourceBeforeActivation.rows[0].history.length === 3, 'historique source append-only après le lien du successeur');
      assert(sourceBeforeActivation.rows[0].history[0].event === 'CONTRACT_ACTIVATED'
        && sourceBeforeActivation.rows[0].history[1].event === 'CONTRACT_REPLACED'
        && sourceBeforeActivation.rows[0].history[2].event === 'REPLACEMENT_SUCCESSOR_LINKED', 'toute la séquence reste auditable');
      const proposalLink = await harness.database.query<{ contract_id: string | null }>('SELECT contract_id FROM proposals WHERE id=$1', [acceptedProposalId]);
      const applicationLink = await harness.database.query<{ contract_id: string | null; status: string }>(
        'SELECT contract_id,status FROM applications WHERE id=$1',
        [replacement.rows[0].selected_application_id],
      );
      assert(proposalLink.rows[0].contract_id === newContractId && applicationLink.rows[0].contract_id === newContractId, 'contrat rattaché à la proposition acceptée et à sa candidature');

      const beforeNewExecution = await harness.database.query<{ id: string; payment_type: string; amount: string; status: string; updated_at: string }>(
        'SELECT id,payment_type,amount::text AS amount,status,updated_at::text AS updated_at FROM payments WHERE contract_id=$1 ORDER BY id',
        [originalContractId],
      );
      assert(JSON.stringify(beforeNewExecution.rows) === JSON.stringify(sourcePaymentSnapshot), 'création du contrat successeur ne modifie aucune ligne financière source');

      const sent = await harness.contracts.sendContract(employer, newContractId, command(employer, 'contracts.send', 'replacement-contract-send-001'));
      assert(sent.status === 'SIGNATURE', 'envoi via le cycle normal de contrat');
      await harness.contracts.signContract(candidate4, newContractId, command(candidate4, 'contracts.sign', 'replacement-contract-sign-001'));
      const activated = await harness.contracts.activateContract(employer, newContractId, command(employer, 'contracts.activate', 'replacement-contract-activate-001'));
      assert(activated.status === 'ACTIVE', 'activation bilatérale via le cycle normal démarre la nouvelle exécution');
      await harness.automationWorker.drainEvents(100);

      const sourceAfterActivation = await harness.database.query<{ id: string; payment_type: string; amount: string; status: string; updated_at: string }>(
        'SELECT id,payment_type,amount::text AS amount,status,updated_at::text AS updated_at FROM payments WHERE contract_id=$1 ORDER BY id',
        [originalContractId],
      );
      assert(JSON.stringify(sourceAfterActivation.rows) === JSON.stringify(sourcePaymentSnapshot), 'activation du successeur ne transfère ni ne réécrit les paiements source');
      const successorPayments = await harness.database.query<{ id: string; contract_id: string; status: string }>(
        'SELECT id,contract_id,status FROM payments WHERE contract_id=$1 ORDER BY id',
        [newContractId],
      );
      assert(successorPayments.rows.length > 0, 'échéances éventuelles du successeur produites par l’automatisation existante');
      assert(successorPayments.rows.every(row => row.contract_id === newContractId && row.status === 'SCHEDULED'), 'paiements successeurs distincts du cycle normal, aucun transfert ni paiement exécuté');
      assert(successorPayments.rows.every(row => !sourcePaymentSnapshot.some(sourceRow => sourceRow.id === row.id)), 'aucun identifiant de paiement réutilisé entre les contrats');

      const legacyDirectOperations = await Promise.all([
        post(harness, `/api/v1/admin/replacements/${replacementId}/assign`, adminToken, 'replacement-legacy-assign-001', { candidateId: candidate4.id }),
        post(harness, `/api/v1/admin/replacements/${replacementId}/transfer`, adminToken, 'replacement-legacy-transfer-001', {}),
        post(harness, `/api/v1/admin/replacements/${replacementId}/finalize`, adminToken, 'replacement-legacy-finalize-001', {}),
      ]);
      assert(legacyDirectOperations.every(response => response.status === 501), `assign/transfer/finalize directs restent fermés, reçus ${legacyDirectOperations.map(response => response.status).join('/')}`);
    });
  } finally {
    await harness.close();
  }

  return results;
}
