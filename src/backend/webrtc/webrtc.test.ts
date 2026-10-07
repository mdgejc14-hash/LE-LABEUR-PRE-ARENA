/**
 * P0-WEBRTC integration/security checks. PostgreSQL executes locally in PGlite;
 * no remote TURN, Cloudflare or WebRTC media resource is assumed.
 */

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from '../api/offers.test';
import type { ContractRecord, OfferRecord } from '../persistence/coreRecords';
import { createSqlContractStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createSqlIdentityStores, createSqlUserStore } from '../identity/sqlStores';
import { hashSessionToken, newEntityId, newOpaqueSessionToken } from '../identity/ids';
import type { WebRtcIceConfiguration, WebRtcSessionView, WebRtcSignalingMessage } from '../productionContracts';
import {
  WEBRTC_CREDENTIAL_TTL_MS,
  WEBRTC_SESSION_TTL_MS,
  validateWebRtcIceConfiguration,
} from './webrtcRepository';

const SEED_AT = '2026-10-05T14:00:00.000Z';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeOffer(id: string, employerId: string): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre WebRTC ${id}`,
    contractType: 'CDI',
    remuneration: 175_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_AT,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre seedée uniquement pour tester une session temporaire.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
}

async function seedContract(
  harness: Awaited<ReturnType<typeof createOffersTestHarness>>,
  employerId: string,
  candidateId: string,
  status: ContractRecord['status'] = 'ACTIVE',
): Promise<string> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, employerId));
  const contractId = newEntityId('ctr');
  const contract: ContractRecord = {
    id: contractId,
    offerId,
    employerId,
    employeeId: candidateId,
    status,
    monthlySalary: 175_000,
    currency: 'FCFA',
    startDate: '01 Octobre 2026',
    currentMonth: 1,
    durationMonths: 2,
    periodicity: 'Mensuel',
    missionDescription: 'Contrat actif lié à une session éphémère P0-WEBRTC.',
    location: 'Cotonou',
    conditions: ['Temps plein'],
    employerSigned: true,
    employeeSigned: true,
    employerSignedAt: SEED_AT,
    employeeSignedAt: SEED_AT,
    commissionPercentage: 25,
    commissionAmountDue: 0,
    commissionStatus: 'SCHEDULED',
    monthlyCheckpoints: [],
    commissionLedger: [],
    paymentSchedule: [],
    history: [],
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
  await createSqlContractStore(harness.database).create(contract);
  return contractId;
}

async function provisionAdmin(harness: Awaited<ReturnType<typeof createOffersTestHarness>>): Promise<{ userId: string; token: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const at = harness.clock.value.toISOString();
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async tx => {
    await tx.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `webrtc.admin.${userId}@example.com`,
      displayName: 'Admin test WebRTC',
    });
    await tx.sessions.create({ userId, token, createdAt: at, expiresAt: new Date(harness.clock.value.getTime() + 3_600_000).toISOString() });
  });
  return { userId, token };
}

function post(
  harness: Awaited<ReturnType<typeof createOffersTestHarness>>,
  path: string,
  token: string | null,
  body: unknown,
  options: { key?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(options.headers ?? {}) };
  if (options.key) headers['Idempotency-Key'] = options.key;
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }));
}

async function responseBody<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

function closeResponse(harness: Awaited<ReturnType<typeof createOffersTestHarness>>, sessionId: string, token: string, key: string): Promise<Response> {
  return post(harness, `/api/v1/webrtc-sessions/${sessionId}/close`, token, {}, { key });
}

export async function runWebRtcTests(): Promise<OfferTestResult[]> {
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
    const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const employer2 = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
    const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
    const candidate2 = await authenticateActor(harness, 'candidate-2', 'CANDIDATE');
      const admin = await provisionAdmin(harness);
      const contractId = await seedContract(harness, employer.userId, candidate.userId);
    const secondContractId = await seedContract(harness, employer.userId, candidate2.userId);
    const draftContractId = await seedContract(harness, employer.userId, candidate.userId, 'DRAFT');
    const invalidationContractId = await seedContract(harness, employer.userId, candidate2.userId);
    const participantStateContractId = await seedContract(harness, employer.userId, candidate.userId);
    const concurrentContractId = await seedContract(harness, employer.userId, candidate2.userId);

    await check('P0-WEBRTC authZ: seules les parties persistées d’un contrat ACTIVE peuvent initier; tiers, ADMIN et entité non ACTIVE refusés', async () => {
      const noAuth = await post(harness, '/api/v1/webrtc-sessions', null, { entityType: 'CONTRACT', entityId: contractId }, { key: 'webrtc_noauth_0001' });
      assert(noAuth.status === 401, `non authentifié refusé, reçu ${noAuth.status}`);
      const outsiderEmployer = await post(harness, '/api/v1/webrtc-sessions', employer2.token, { entityType: 'CONTRACT', entityId: contractId }, { key: 'webrtc_outemp_0001' });
      assert(outsiderEmployer.status === 403, `employeur tiers refusé, reçu ${outsiderEmployer.status}`);
      const outsiderCandidate = await post(harness, '/api/v1/webrtc-sessions', candidate2.token, { entityType: 'CONTRACT', entityId: contractId }, { key: 'webrtc_outcan_0001' });
      assert(outsiderCandidate.status === 403, `candidat tiers refusé, reçu ${outsiderCandidate.status}`);
      const existingAdminPermission = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM role_permissions WHERE role = 'ADMIN' AND permission_code = 'calls:read:any'",
      );
      assert(Number(existingAdminPermission.rows[0]?.count) === 1, 'permission transverse calls:read:any reste issue du RBAC existant');
      const adminResponse = await post(harness, '/api/v1/webrtc-sessions', admin.token, { entityType: 'CONTRACT', entityId: contractId }, { key: 'webrtc_admin_0001' });
      assert(adminResponse.status === 403, `ADMIN sans override privé refusé, reçu ${adminResponse.status}`);
      const inactive = await post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CONTRACT', entityId: draftContractId }, { key: 'webrtc_draft_0001' });
      assert(inactive.status === 404, `contrat non ACTIVE refusé, reçu ${inactive.status}`);
      const wrongEntity = await post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CLAIM', entityId: contractId }, { key: 'webrtc_entity_0001' });
      assert(wrongEntity.status === 400, `type d'entité hors périmètre refusé, reçu ${wrongEntity.status}`);
      const forgedParticipant = await post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CONTRACT', entityId: contractId, receiverId: candidate2.userId }, { key: 'webrtc_forge_0001' });
      assert(forgedParticipant.status === 400, `identité de participant fournie par client refusée, reçu ${forgedParticipant.status}`);
      assert(harness.webrtc !== undefined, 'le repository WebRTC est composé avec une base durable');
    });

    let sessionId = '';
    await check('P0-WEBRTC création: contrat réel, idempotence durable et concurrence PostgreSQL sans doublon', async () => {
      const first = await post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CONTRACT', entityId: contractId }, { key: 'webrtc_create_0001' });
      assert(first.status === 201, `création 201 attendue, reçue ${first.status}`);
      const created = await responseBody<WebRtcSessionView>(first);
      sessionId = created.sessionId;
      assert(/^wbs_/.test(sessionId), 'identifiant serveur de session attendu');
      assert(created.status === 'CREATED' && created.initiatorId === employer.userId, 'état et initiateur persistés');
      assert(created.participants.length === 2, 'exactement deux participants réels');
      assert(created.participants.some(participant => participant.userId === employer.userId && participant.role === 'EMPLOYER' && Boolean(participant.joinedAt)), 'employeur réel auto-rejoint');
      assert(created.participants.some(participant => participant.userId === candidate.userId && participant.role === 'CANDIDATE' && !participant.joinedAt), 'candidat réel invité, non présumé présent');
      assert(created.expiresAt === new Date(harness.clock.value.getTime() + WEBRTC_SESSION_TTL_MS).toISOString(), 'expiration courte et déterministe');
      assert(!JSON.stringify(created).includes('credential'), 'aucun credential dans la projection de session');

      const replay = await post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CONTRACT', entityId: contractId }, { key: 'webrtc_create_0001' });
      assert(replay.status === 201, `rejeu exact idempotent, reçu ${replay.status}`);
      assert((await responseBody<WebRtcSessionView>(replay)).sessionId === sessionId, 'rejeu renvoie la session canonique');
      const idempotencyConflict = await post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CONTRACT', entityId: secondContractId }, { key: 'webrtc_create_0001' });
      assert(idempotencyConflict.status === 409, `même clé/autre entité en conflit, reçu ${idempotencyConflict.status}`);
      const duplicateLive = await post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CONTRACT', entityId: contractId }, { key: 'webrtc_create_0002' });
      assert(duplicateLive.status === 422, `session live unique par contrat, reçu ${duplicateLive.status}`);
      const persisted = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM webrtc_sessions WHERE entity_id = $1', [contractId]);
      assert(Number(persisted.rows[0]?.count) === 1, 'aucun doublon de session persisté');

      const concurrentCreates = await Promise.all([
        post(harness, '/api/v1/webrtc-sessions', employer.token, { entityType: 'CONTRACT', entityId: concurrentContractId }, { key: 'webrtc_race_employer_01' }),
        post(harness, '/api/v1/webrtc-sessions', candidate2.token, { entityType: 'CONTRACT', entityId: concurrentContractId }, { key: 'webrtc_race_candidate_01' }),
      ]);
      const raceStatuses = concurrentCreates.map(response => response.status).sort((left, right) => left - right);
      assert(raceStatuses[0] === 201 && raceStatuses[1] === 422, `création concurrente arbitre une seule session : ${raceStatuses.join('/')}`);
      const concurrentCount = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM webrtc_sessions WHERE entity_id = $1', [concurrentContractId]);
      assert(Number(concurrentCount.rows[0]?.count) === 1, 'contrainte PostgreSQL et verrou contrat empêchent le doublon concurrent');

      const participantIds = await harness.database.query<{ user_id: string }>('SELECT user_id FROM webrtc_session_participants WHERE session_id = $1 ORDER BY user_id', [sessionId]);
      assert(participantIds.rows.length === 2 && participantIds.rows.some(row => row.user_id === employer.userId) && participantIds.rows.some(row => row.user_id === candidate.userId), 'liste de participants créée exclusivement depuis le contrat');
      const event = await harness.database.query<{ event_type: string; payload: unknown }>('SELECT event_type, payload FROM automation_outbox WHERE aggregate_id = $1 AND event_type = $2', [contractId, 'WEBRTC_SESSION_INVITED']);
      assert(event.rows.length === 1 && event.rows[0]?.event_type === 'WEBRTC_SESSION_INVITED', 'invitation écrite dans l’Outbox partagée, une seule fois');
    });

    await check('P0-WEBRTC intégration P0-NOTIFICATIONS: l’invitation Outbox est In-App au seul autre participant', async () => {
      assert(harness.automationWorker !== undefined, 'AutomationWorker existant composé');
      await harness.automationWorker!.drainEvents(50);
      const notifications = await harness.database.query<{ recipient_id: string; recipient_role: string; type: string; payload: unknown; push_status: string; email_status: string }>(
        'SELECT recipient_id, recipient_role, type, payload, push_status, email_status FROM notifications WHERE payload->>\'sessionId\' = $1',
        [sessionId],
      );
      assert(notifications.rows.length === 1, `une notification In-App attendue, reçu ${notifications.rows.length}`);
      assert(notifications.rows[0]?.recipient_id === candidate.userId && notifications.rows[0]?.recipient_role === 'CANDIDATE', 'seul le candidat réellement invité reçoit l’intention');
      assert(notifications.rows[0]?.type === 'INCOMING_CALL', 'type réel INCOMING_CALL réutilisé');
      assert(notifications.rows[0]?.push_status === 'NOT_AVAILABLE' && notifications.rows[0]?.email_status === 'NOT_AVAILABLE', 'aucun canal externe prétendu disponible');
      await harness.automationWorker!.drainEvents(50);
      const duplicateCheck = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications WHERE payload->>\'sessionId\' = $1', [sessionId]);
      assert(Number(duplicateCheck.rows[0]?.count) === 1, 'rejeu de l’Outbox sans doublon de notification');
    });

    await check('P0-WEBRTC lecture et membership: IDOR/ADMIN refusés, invitation visible seulement aux parties', async () => {
      const own = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}`, employer.token));
      assert(own.status === 200 && (await responseBody<WebRtcSessionView>(own)).sessionId === sessionId, 'participant lit sa session');
      const inviteeList = await harness.worker.fetch(authRequest('/api/v1/my/webrtc-sessions', candidate.token));
      assert(inviteeList.status === 200, `liste du candidat autorisé, reçu ${inviteeList.status}`);
      const list = await responseBody<{ items: WebRtcSessionView[] }>(inviteeList);
      assert(list.items.some(item => item.sessionId === sessionId), 'invitation incluse dans la liste du participant');
      const outsider = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}`, candidate2.token));
      assert(outsider.status === 404, `tiers reçoit une réponse non énumérante, reçu ${outsider.status}`);
      const adminRead = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}`, admin.token));
      assert(adminRead.status === 403, `ADMIN n’a pas d’override privé, reçu ${adminRead.status}`);
      const preJoinCredential = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/credentials`, candidate.token, {});
      assert(preJoinCredential.status === 422, `credential interdit avant l’adhésion, reçu ${preJoinCredential.status}`);
    });

    await check('P0-WEBRTC invitation/join: adhésion explicite, idempotente et auditée', async () => {
      const joinedResponse = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/join`, candidate.token, {});
      assert(joinedResponse.status === 200, `join 200 attendu, reçu ${joinedResponse.status}`);
      const joined = await responseBody<WebRtcSessionView>(joinedResponse);
      assert(joined.status === 'CONNECTING', 'session passe à CONNECTING après le join réel');
      assert(Boolean(joined.participants.find(participant => participant.userId === candidate.userId)?.joinedAt), 'horodatage de join persisté');
      const joinedAgain = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/join`, candidate.token, {});
      assert(joinedAgain.status === 200, 'join répété idempotent');
      const joinedMessages = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM webrtc_signaling_messages WHERE session_id = $1 AND message_type = $2',
        [sessionId, 'PARTICIPANT_JOINED'],
      );
      assert(Number(joinedMessages.rows[0]?.count) === 1, 'un seul message de contrôle PARTICIPANT_JOINED');
    });

    let employerCredential = '';
    let candidateCredential = '';
    let employerAuthSessionId = '';
    await check('P0-WEBRTC credentials: opaque, limités à cinq minutes et liés à la session d’identité', async () => {
      const employerIssued = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/credentials`, employer.token, {});
      const candidateIssued = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/credentials`, candidate.token, {});
      assert(employerIssued.status === 201 && candidateIssued.status === 201, 'credentials émis après join des deux parties');
      const employerBody = await responseBody<{ credential: string; expiresAt: string; sessionId: string; participantId: string; transport: string }>(employerIssued);
      const candidateBody = await responseBody<{ credential: string; expiresAt: string; sessionId: string; participantId: string; transport: string }>(candidateIssued);
      employerCredential = employerBody.credential;
      candidateCredential = candidateBody.credential;
      assert(employerCredential.length >= 32 && candidateCredential.length >= 32, 'jetons opaques aléatoires');
      assert(employerBody.sessionId === sessionId && employerBody.participantId === employer.userId, 'credential employeur lié à la session et à l’acteur');
      assert(employerBody.transport === 'REST_POLLING', 'transport annoncé sans WebSocket/Durable Object fictif');
      assert(Date.parse(employerBody.expiresAt) - harness.clock.value.getTime() === WEBRTC_CREDENTIAL_TTL_MS, 'durée maximale de cinq minutes');
      const stored = await harness.database.query<{ token_hash: string; auth_session_id: string; participant_id: string }>(
        'SELECT token_hash, auth_session_id, participant_id FROM webrtc_session_credentials WHERE session_id = $1 AND participant_id = $2',
        [sessionId, employer.userId],
      );
      assert(stored.rows.length === 1 && stored.rows[0]?.token_hash === await hashSessionToken(employerCredential), 'seul le SHA-256 du credential est persisté');
      assert(stored.rows[0]?.token_hash !== employerCredential && stored.rows[0]?.participant_id === employer.userId, 'aucun credential en clair et participation vérifiée');
      employerAuthSessionId = stored.rows[0]!.auth_session_id;
      const tokenSearch = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM webrtc_signaling_messages
          WHERE payload::text LIKE $1`,
        [`%${employerCredential}%`],
      );
      assert(Number(tokenSearch.rows[0]?.count) === 0, 'credential absent des payloads de signalisation');
    });

    await check('P0-WEBRTC signaling: offer/answer/ICE, ordre strict, validation, idempotence/replay et réception au seul destinataire', async () => {
      const makeSignal = (token: string, type: string, payload: Record<string, unknown>, key: string, credential: string) =>
        post(harness, `/api/v1/webrtc-sessions/${sessionId}/signaling`, token, { type, payload }, { key, headers: { 'X-WebRTC-Credential': credential } });
      const answerBeforeOffer = await makeSignal(candidate.token, 'ANSWER', { sdp: 'v=0\r\nanswer' }, 'webrtc_answerfirst_01', candidateCredential);
      assert(answerBeforeOffer.status === 422, `réponse avant offre refusée, reçu ${answerBeforeOffer.status}`);
      const forgedEnvelope = await makeSignal(employer.token, 'OFFER', { sdp: 'v=0\r\n...', receiverId: candidate.userId }, 'webrtc_forged_0001', employerCredential);
      assert(forgedEnvelope.status === 400, `champ participant client refusé, reçu ${forgedEnvelope.status}`);
      const wrongCredential = await makeSignal(employer.token, 'OFFER', { sdp: 'v=0\r\n...' }, 'webrtc_wrongcred_01', candidateCredential);
      assert(wrongCredential.status === 401, `credential du mauvais participant refusé, reçu ${wrongCredential.status}`);
      const missingCredential = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/signaling`, employer.token, { type: 'OFFER', payload: { sdp: 'v=0' } }, { key: 'webrtc_missingcred_1' });
      assert(missingCredential.status === 401, `credential absent refusé, reçu ${missingCredential.status}`);
      const outsiderCredential = await makeSignal(candidate2.token, 'OFFER', { sdp: 'v=0' }, 'webrtc_outsidermsg1', candidateCredential);
      assert(outsiderCredential.status === 404, `tiers ne peut pas utiliser un credential volé, reçu ${outsiderCredential.status}`);

      const offerInput = { type: 'OFFER', payload: { sdp: 'v=0\r\no=- ephemeral-offer' } };
      const offered = await makeSignal(employer.token, 'OFFER', offerInput.payload, 'webrtc_offer_00001', employerCredential);
      assert(offered.status === 201, `offer 201 attendu, reçu ${offered.status}`);
      const offer = await responseBody<WebRtcSignalingMessage>(offered);
      assert(offer.type === 'OFFER' && offer.participantId === employer.userId && offer.receiverId === candidate.userId, 'sender et recipient calculés par le serveur');
      const offerReplay = await makeSignal(employer.token, 'OFFER', offerInput.payload, 'webrtc_offer_00001', employerCredential);
      assert(offerReplay.status === 201 && (await responseBody<WebRtcSignalingMessage>(offerReplay)).messageId === offer.messageId, 'rejeu exact sans duplication');
      const alteredReplay = await makeSignal(employer.token, 'OFFER', { sdp: 'v=0 changed' }, 'webrtc_offer_00001', employerCredential);
      assert(alteredReplay.status === 409, `rejeu modifié refusé, reçu ${alteredReplay.status}`);
      const repeatedOffer = await makeSignal(employer.token, 'OFFER', { sdp: 'v=0 second' }, 'webrtc_offer_00002', employerCredential);
      assert(repeatedOffer.status === 422, `une seule offre initiale, reçu ${repeatedOffer.status}`);
      const wrongOfferParty = await makeSignal(candidate.token, 'OFFER', { sdp: 'v=0' }, 'webrtc_offer_cand01', candidateCredential);
      assert(wrongOfferParty.status === 403, `offre de la partie invitée refusée, reçu ${wrongOfferParty.status}`);

      const answer = await makeSignal(candidate.token, 'ANSWER', { sdp: 'v=0\r\no=- ephemeral-answer' }, 'webrtc_answer_00001', candidateCredential);
      assert(answer.status === 201, `answer 201 attendu, reçu ${answer.status}`);
      const answerMessage = await responseBody<WebRtcSignalingMessage>(answer);
      assert(answerMessage.receiverId === employer.userId && answerMessage.participantId === candidate.userId, 'answer acheminée uniquement à l’initiateur');
      const duplicateAnswer = await makeSignal(candidate.token, 'ANSWER', { sdp: 'v=0 second' }, 'webrtc_answer_00002', candidateCredential);
      assert(duplicateAnswer.status === 422, `une seule answer autorisée, reçu ${duplicateAnswer.status}`);

      const candidateIce = await makeSignal(employer.token, 'ICE_CANDIDATE', { candidate: 'candidate:1 1 UDP 2122260223 192.0.2.1 54400 typ host', sdpMid: '0', sdpMLineIndex: 0 }, 'webrtc_ice_emp_0001', employerCredential);
      assert(candidateIce.status === 201, `ICE candidat 201 attendu, reçu ${candidateIce.status}`);
      const candidateIce2 = await makeSignal(candidate.token, 'ICE_CANDIDATE', { candidate: 'candidate:2 1 UDP 2122260222 192.0.2.2 54401 typ host', sdpMid: '0', sdpMLineIndex: 0 }, 'webrtc_ice_can_0001', candidateCredential);
      assert(candidateIce2.status === 201, `ICE inverse 201 attendu, reçu ${candidateIce2.status}`);
      const replayIce = await makeSignal(employer.token, 'ICE_CANDIDATE', { candidate: 'candidate:1 1 UDP 2122260223 192.0.2.1 54400 typ host', sdpMid: '0', sdpMLineIndex: 0 }, 'webrtc_ice_emp_0001', employerCredential);
      assert(replayIce.status === 201 && (await responseBody<WebRtcSignalingMessage>(replayIce)).messageId === (await responseBody<WebRtcSignalingMessage>(candidateIce)).messageId, 'rejeu ICE idempotent');

      const employerPoll = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}/signaling?afterSequence=0&limit=50`, employer.token, {
        headers: { 'X-WebRTC-Credential': employerCredential },
      }));
      const candidatePoll = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}/signaling?afterSequence=0&limit=50`, candidate.token, {
        headers: { 'X-WebRTC-Credential': candidateCredential },
      }));
      assert(employerPoll.status === 200 && candidatePoll.status === 200, 'poll authentifié pour les deux participants');
      const employerMessages = await responseBody<{ messages: WebRtcSignalingMessage[] }>(employerPoll);
      const candidateMessages = await responseBody<{ messages: WebRtcSignalingMessage[] }>(candidatePoll);
      assert(employerMessages.messages.some(message => message.type === 'ANSWER'), 'l’initiateur reçoit answer');
      assert(!employerMessages.messages.some(message => message.type === 'OFFER'), 'l’émetteur ne relit pas son propre SDP');
      assert(candidateMessages.messages.some(message => message.type === 'OFFER'), 'l’invité reçoit offer');
      assert(!candidateMessages.messages.some(message => message.type === 'ANSWER'), 'l’émetteur ne relit pas sa propre answer');
      assert(candidateMessages.messages.every(message => message.receiverId === candidate.userId), 'le poll est filtré sur receiverId serveur');
      const oversized = await makeSignal(employer.token, 'OFFER', { sdp: 'x'.repeat(40 * 1024) }, 'webrtc_oversize_001', employerCredential);
      assert(oversized.status === 400, `SDP hors limite refusée, reçu ${oversized.status}`);
    });

    await check('P0-WEBRTC transport et ICE: statut ACTIVE uniquement après deux rapports, configuration NOT_CONFIGURED explicite', async () => {
      const iceResponse = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/ice-configuration`, employer.token, {});
      assert(iceResponse.status === 200, `état ICE disponible, reçu ${iceResponse.status}`);
      const ice = await responseBody<WebRtcIceConfiguration>(iceResponse);
      assert(ice.state === 'NOT_CONFIGURED' && ice.iceServers.length === 0 && ice.expiresAt === null, 'aucun STUN/TURN inventé');
      const inviteeConnected = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/connected`, candidate.token, {}, { key: 'webrtc_connected_can_01', headers: { 'X-WebRTC-Credential': candidateCredential } });
      const inviteeConnectedView = inviteeConnected.status === 200 ? await responseBody<WebRtcSessionView>(inviteeConnected) : null;
      assert(inviteeConnected.status === 200 && inviteeConnectedView?.status === 'CONNECTING', `un rapport client seul ne déclare pas ACTIVE (${inviteeConnected.status}/${inviteeConnectedView?.status ?? 'no-body'})`);
      const replayConnected = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/connected`, candidate.token, {}, { key: 'webrtc_connected_can_01', headers: { 'X-WebRTC-Credential': candidateCredential } });
      assert(replayConnected.status === 200, 'rejeu idempotent du rapport de connexion');
      const initiatorConnected = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/connected`, employer.token, {}, { key: 'webrtc_connected_emp_01', headers: { 'X-WebRTC-Credential': employerCredential } });
      assert(initiatorConnected.status === 200 && (await responseBody<WebRtcSessionView>(initiatorConnected)).status === 'ACTIVE', 'ACTIVE après confirmation des deux participants authentifiés');
    });

    await check('P0-WEBRTC ICE/TURN validation: credentials TURN de cinq minutes, statuts et secrets non configurés/indisponibles honnêtes', async () => {
      const now = harness.clock.value;
      const available: WebRtcIceConfiguration = {
        state: 'AVAILABLE',
        iceServers: [{ urls: 'turns:turn.invalid:5349', username: 'temporary-user', credential: 'temporary-secret' }],
        expiresAt: new Date(now.getTime() + WEBRTC_CREDENTIAL_TTL_MS).toISOString(),
      };
      const accepted = validateWebRtcIceConfiguration(available, now);
      assert(accepted.state === 'AVAILABLE' && accepted.iceServers.length === 1, 'TURN fourni par un issuer injecté accepté pour test local');
      const expired = validateWebRtcIceConfiguration({ ...available, expiresAt: new Date(now.getTime() - 1).toISOString() }, now);
      assert(expired.state === 'BLOCKED_EXTERNAL_ACCESS' && expired.iceServers.length === 0, 'TURN expiré n’est jamais annoncé disponible');
      const permanent = validateWebRtcIceConfiguration({ ...available, expiresAt: new Date(now.getTime() + 6 * 60_000).toISOString() }, now);
      assert(permanent.state === 'BLOCKED_EXTERNAL_ACCESS', 'credential TURN au-delà de cinq minutes refusé');
      const lie = validateWebRtcIceConfiguration({ state: 'NOT_CONFIGURED', iceServers: [{ urls: 'stun:stun.invalid' }], expiresAt: null }, now);
      assert(lie.state === 'BLOCKED_EXTERNAL_ACCESS' && lie.iceServers.length === 0, 'serveur retourné avec statut NOT_CONFIGURED déclenche fail-closed');
      assert(!JSON.stringify(expired).includes('temporary-secret') && !JSON.stringify(lie).includes('temporary-secret'), 'secret jamais inclus dans erreur ou état bloqué');
    });

    await check('P0-WEBRTC authZ dynamique: credential lié à la session d’authentification, expiration et révocation empêchent rejeu/changement d’identité', async () => {
      const rotatedAuthToken = newOpaqueSessionToken();
      const rotatedAt = harness.clock.value.toISOString();
      const identityStores = createSqlIdentityStores(harness.database);
      await identityStores.sessions.create({
        userId: employer.userId,
        token: rotatedAuthToken,
        createdAt: rotatedAt,
        expiresAt: new Date(harness.clock.value.getTime() + 2 * 60 * 60_000).toISOString(),
      });
      const changedIdentity = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}/signaling?afterSequence=0`, rotatedAuthToken, {
        headers: { 'X-WebRTC-Credential': employerCredential },
      }));
      assert(changedIdentity.status === 401, `credential d’un ancien user-session refusé, reçu ${changedIdentity.status}`);
      harness.clock.value = new Date(harness.clock.value.getTime() + WEBRTC_CREDENTIAL_TTL_MS + 1);
      const expiredCredential = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}/signaling?afterSequence=0`, employer.token, {
        headers: { 'X-WebRTC-Credential': employerCredential },
      }));
      assert(expiredCredential.status === 401, `credential expiré refusé, reçu ${expiredCredential.status}`);
      const newCredentialResponse = await post(harness, `/api/v1/webrtc-sessions/${sessionId}/credentials`, employer.token, {});
      assert(newCredentialResponse.status === 201, 'un participant authentifié peut obtenir un nouveau credential temporaire');
      employerCredential = (await responseBody<{ credential: string }>(newCredentialResponse)).credential;
      const originalHash = await hashSessionToken(employer.token);
      const authSession = await harness.database.query<{ id: string }>('SELECT id FROM sessions WHERE token_hash = $1', [originalHash]);
      assert(authSession.rows[0]?.id === employerAuthSessionId, 'la session WebRTC référence la session utilisateur d’origine');
      await harness.database.query('UPDATE sessions SET revoked_at = $2 WHERE id = $1', [employerAuthSessionId, harness.clock.value.toISOString()]);
      const revoked = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}`, employer.token));
      assert(revoked.status === 401, `révocation user-session empêche l’accès WebRTC, reçu ${revoked.status}`);
    });

    await check('P0-WEBRTC close/concurrence/audit: clôture idempotente, payload SDP/ICE redacted immédiatement, credentials révoqués', async () => {
      // Le credential employeur vient d'être révoqué avec sa session d'identité.
      // L'autre partie peut fermer la session; aucune élévation de rôle n'est requise.
      const [first, second] = await Promise.all([
        closeResponse(harness, sessionId, candidate.token, 'webrtc_close_00001'),
        closeResponse(harness, sessionId, candidate.token, 'webrtc_close_00002'),
      ]);
      assert(first.status === 200 && second.status === 200, `close concurrent idempotent, statuts ${first.status}/${second.status}`);
      assert((await responseBody<WebRtcSessionView>(first)).status === 'CLOSED', 'session terminale CLOSED');
      const replay = await closeResponse(harness, sessionId, candidate.token, 'webrtc_close_00003');
      assert(replay.status === 200 && (await responseBody<WebRtcSessionView>(replay)).status === 'CLOSED', 'rejeu close stable');
      const messages = await harness.database.query<{ message_type: string; payload: unknown; payload_redacted_at: unknown }>(
        'SELECT message_type, payload, payload_redacted_at FROM webrtc_signaling_messages WHERE session_id = $1', [sessionId],
      );
      const sensitive = messages.rows.filter(row => ['OFFER', 'ANSWER', 'ICE_CANDIDATE'].includes(row.message_type));
      assert(sensitive.length >= 4 && sensitive.every(row => row.payload_redacted_at && JSON.stringify(row.payload) === '{}'), 'SDP/candidats ICE vidés en fin d’appel');
      const credentials = await harness.database.query<{ revoked_at: unknown }>('SELECT revoked_at FROM webrtc_session_credentials WHERE session_id = $1', [sessionId]);
      assert(credentials.rows.length >= 3 && credentials.rows.every(row => row.revoked_at), 'tous les credentials révoqués à la clôture');
      const audit = await harness.database.query<{ action: string; before_state: unknown; after_state: unknown }>('SELECT action, before_state, after_state FROM automation_audit_ledger WHERE entity_id = $1', [sessionId]);
      assert(audit.rows.some(row => row.action === 'WEBRTC_SESSION_CREATED') && audit.rows.some(row => row.action === 'WEBRTC_SESSION_CLOSED'), 'ledger d’audit partagé conserve création et clôture');
      assert(!JSON.stringify(audit.rows).includes('ephemeral-offer') && !JSON.stringify(audit.rows).includes('ephemeral-answer') && !JSON.stringify(audit.rows).includes('temporary-secret'), 'aucun SDP/credential dans le ledger');
      const blockedPoll = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${sessionId}/signaling?afterSequence=0`, candidate.token, {
        headers: { 'X-WebRTC-Credential': candidateCredential },
      }));
      assert(blockedPoll.status === 422, `poll impossible après clôture, reçu ${blockedPoll.status}`);
    });

    await check('P0-WEBRTC state change: contrat devenu terminal ferme et redige la session avant le refus d’accès', async () => {
      const freshEmployerToken = newOpaqueSessionToken();
      const activeAt = harness.clock.value.toISOString();
      await createSqlIdentityStores(harness.database).sessions.create({
        userId: employer.userId,
        token: freshEmployerToken,
        createdAt: activeAt,
        expiresAt: new Date(harness.clock.value.getTime() + 2 * 60 * 60_000).toISOString(),
      });
      const createdResponse = await post(harness, '/api/v1/webrtc-sessions', freshEmployerToken, {
        entityType: 'CONTRACT', entityId: invalidationContractId,
      }, { key: 'webrtc_state_change_create_01' });
      assert(createdResponse.status === 201, `session liée au contrat actif, reçu ${createdResponse.status}`);
      const created = await responseBody<WebRtcSessionView>(createdResponse);
      const joined = await post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/join`, candidate2.token, {});
      assert(joined.status === 200, `participant invité rejoint, reçu ${joined.status}`);
      const [employerIssued, candidateIssued] = await Promise.all([
        post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/credentials`, freshEmployerToken, {}),
        post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/credentials`, candidate2.token, {}),
      ]);
      assert(employerIssued.status === 201 && candidateIssued.status === 201, 'credentials temporaires des deux parties');
      const employerCredential = (await responseBody<{ credential: string }>(employerIssued)).credential;
      const offer = await post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/signaling`, freshEmployerToken, {
        type: 'OFFER', payload: { sdp: 'v=0\\r\\no=- contract-state-transition-offer' },
      }, { key: 'webrtc_state_change_offer_01', headers: { 'X-WebRTC-Credential': employerCredential } });
      assert(offer.status === 201, `signal initial persisté, reçu ${offer.status}`);

      await createSqlContractStore(harness.database).updateStatus(
        invalidationContractId,
        'TERMINATED',
        new Date(harness.clock.value.getTime() + 1).toISOString(),
      );
      const denied = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${created.sessionId}`, freshEmployerToken));
      assert(denied.status === 403, `contrat terminal interdit l’accès, reçu ${denied.status}`);
      const session = await harness.database.query<{ status: string }>('SELECT status FROM webrtc_sessions WHERE session_id = $1', [created.sessionId]);
      assert(session.rows[0]?.status === 'FAILED', 'changement d’état métier ferme la session en FAILED');
      const signal = await harness.database.query<{ payload: unknown; payload_redacted_at: unknown }>(
        'SELECT payload, payload_redacted_at FROM webrtc_signaling_messages WHERE session_id = $1 AND message_type = \'OFFER\'',
        [created.sessionId],
      );
      assert(signal.rows[0]?.payload_redacted_at && JSON.stringify(signal.rows[0]?.payload) === '{}', 'SDP effacé dans la transaction de révocation');
      const credentials = await harness.database.query<{ revoked_at: unknown }>(
        'SELECT revoked_at FROM webrtc_session_credentials WHERE session_id = $1', [created.sessionId],
      );
      assert(credentials.rows.length === 2 && credentials.rows.every(row => row.revoked_at), 'credentials des deux parties révoqués');
      const audit = await harness.database.query<{ action: string }>(
        'SELECT action FROM automation_audit_ledger WHERE entity_id = $1', [created.sessionId],
      );
      assert(audit.rows.some(row => row.action === 'WEBRTC_SESSION_FAILED'), 'changement métier audité dans le ledger partagé');
    });

    await check('P0-WEBRTC participant state: compte partenaire bloqué ferme la session et révoque les credentials', async () => {
      const freshEmployerToken = newOpaqueSessionToken();
      const activeAt = harness.clock.value.toISOString();
      await createSqlIdentityStores(harness.database).sessions.create({
        userId: employer.userId,
        token: freshEmployerToken,
        createdAt: activeAt,
        expiresAt: new Date(harness.clock.value.getTime() + 2 * 60 * 60_000).toISOString(),
      });
      const createdResponse = await post(harness, '/api/v1/webrtc-sessions', freshEmployerToken, {
        entityType: 'CONTRACT', entityId: participantStateContractId,
      }, { key: 'webrtc_partner_blocked_create_01' });
      assert(createdResponse.status === 201, `session sur contrat actif, reçu ${createdResponse.status}`);
      const created = await responseBody<WebRtcSessionView>(createdResponse);
      const joined = await post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/join`, candidate.token, {});
      assert(joined.status === 200, `participant réel rejoint, reçu ${joined.status}`);
      const [employerIssued, candidateIssued] = await Promise.all([
        post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/credentials`, freshEmployerToken, {}),
        post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/credentials`, candidate.token, {}),
      ]);
      assert(employerIssued.status === 201 && candidateIssued.status === 201, 'credentials temporaires émis avant révocation');
      const employerCredential = (await responseBody<{ credential: string }>(employerIssued)).credential;
      const offer = await post(harness, `/api/v1/webrtc-sessions/${created.sessionId}/signaling`, freshEmployerToken, {
        type: 'OFFER', payload: { sdp: 'v=0\\r\\no=- blocked-peer-offer' },
      }, { key: 'webrtc_partner_blocked_offer_01', headers: { 'X-WebRTC-Credential': employerCredential } });
      assert(offer.status === 201, `SDP temporaire persisté, reçu ${offer.status}`);

      await harness.database.query('UPDATE users SET status = \'BLOCKED\' WHERE id = $1', [candidate.userId]);
      const denied = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${created.sessionId}`, freshEmployerToken));
      assert(denied.status === 403, `compte partenaire bloqué invalide l’appel, reçu ${denied.status}`);
      const session = await harness.database.query<{ status: string }>('SELECT status FROM webrtc_sessions WHERE session_id = $1', [created.sessionId]);
      assert(session.rows[0]?.status === 'FAILED', 'session fermée dès le prochain contrôle du compte partenaire');
      const signal = await harness.database.query<{ payload: unknown; payload_redacted_at: unknown }>(
        'SELECT payload, payload_redacted_at FROM webrtc_signaling_messages WHERE session_id = $1 AND message_type = \'OFFER\'',
        [created.sessionId],
      );
      assert(signal.rows[0]?.payload_redacted_at && JSON.stringify(signal.rows[0]?.payload) === '{}', 'SDP redacted lors du blocage du partenaire');
      const credentials = await harness.database.query<{ revoked_at: unknown }>(
        'SELECT revoked_at FROM webrtc_session_credentials WHERE session_id = $1', [created.sessionId],
      );
      assert(credentials.rows.length === 2 && credentials.rows.every(row => row.revoked_at), 'credentials des deux participants révoqués');
    });

    await check('P0-WEBRTC expiry/purge: session expirée échoue fermée, contenu effacé et métadonnées purgées par maintenance bornée', async () => {
      const longAuthToken = newOpaqueSessionToken();
      const now = harness.clock.value;
      await createSqlIdentityStores(harness.database).sessions.create({
        userId: employer.userId,
        token: longAuthToken,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 3 * 60 * 60_000).toISOString(),
      });
      const createdResponse = await post(harness, '/api/v1/webrtc-sessions', longAuthToken, { entityType: 'CONTRACT', entityId: secondContractId }, { key: 'webrtc_expire_make_01' });
      assert(createdResponse.status === 201, `seconde session créée, reçu ${createdResponse.status}`);
      const expiring = await responseBody<WebRtcSessionView>(createdResponse);
      const scheduledExpiry = Date.parse(expiring.expiresAt);
      harness.clock.value = new Date(scheduledExpiry + 1);
      const expiredResponse = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${expiring.sessionId}`, longAuthToken));
      assert(expiredResponse.status === 200 && (await responseBody<WebRtcSessionView>(expiredResponse)).status === 'EXPIRED', 'expiration appliquée côté lecture sans croire le client');
      const expiredRow = await harness.database.query<{ status: string; retention_until: string | Date; expires_at: string | Date }>(
        'SELECT status, retention_until, expires_at FROM webrtc_sessions WHERE session_id = $1', [expiring.sessionId],
      );
      assert(expiredRow.rows[0]?.status === 'EXPIRED', 'état EXPIRED persisté');
      const retention = new Date(expiredRow.rows[0]!.retention_until).getTime();
      const expiry = new Date(expiredRow.rows[0]!.expires_at).getTime();
      assert(retention === expiry, 'aucune rétention post-appel arbitraire');
      const maintenance = await harness.webrtc!.runScheduledMaintenance();
      assert(maintenance.purged >= 1, 'Cron/maintenance purge le terminal arrivé à son expiry d’origine');
      const purged = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM webrtc_sessions WHERE session_id = $1', [expiring.sessionId]);
      assert(Number(purged.rows[0]?.count) === 0, 'métadonnées et enfants purgés après le tick de maintenance');
      assert(harness.clock.value.getTime() - now.getTime() === WEBRTC_SESSION_TTL_MS + 1, 'expiration observée à l’échéance exacte de la session');
    });

    await check('P0-WEBRTC no-recording/no-biometrics/no-secret: schéma fermé aux médias, biométrie, transcription et credential permanent', async () => {
      const columns = await harness.database.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name LIKE 'webrtc_%'`,
      );
      const fields = columns.rows.map(row => `${row.table_name}.${row.column_name}`).join(' ').toLowerCase();
      assert(!/recording|transcript|biometric|face|voiceprint|precise_location|media_blob/.test(fields), 'aucun champ média, biométrique ou géolocalisation ajouté');
      const tables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE '%webrtc%'`,
      );
      assert(tables.rows.length === 4, `quatre tables minimales attendues, reçu ${tables.rows.length}`);
      const uniquePermission = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM permissions WHERE code ILIKE '%webrtc%'`,
      );
      assert(Number(uniquePermission.rows[0]?.count) === 0, 'aucune permission parallèle créée; auth existante, rôle et parties gouvernent l’accès');
      const storedToken = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM webrtc_session_credentials WHERE token_hash = $1',
        [employerCredential],
      );
      assert(Number(storedToken.rows[0]?.count) === 0, 'le jeton permanent ou temporaire en clair n’est jamais stocké');
    });
  } finally {
    await harness.close();
  }

  return results;
}
