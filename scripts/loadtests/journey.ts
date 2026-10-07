/**
 * LE LABEUR — P0-LOAD-TESTS — parcours métier réel exécuté sous charge.
 *
 * Un « utilisateur virtuel » = 1 EMPLOYER + 1 CANDIDATE, deux comptes
 * authentifiés distincts, qui exécutent le parcours complet :
 *
 *   auth/session → offres → qualification → matching → candidatures →
 *   décisions → propositions → contrats → Cron/Queue → WebRTC → documents →
 *   notifications → réputation → paiements → litiges
 *
 * Le REMPLACEMENT exige un contrat encore ACTIF au moment de la décision ADMIN,
 * alors que le cycle de paiement termine la mission : les deux ne peuvent pas
 * cohabiter sur le même contrat. Il est donc exécuté par un scénario dédié
 * (`runReplacementJourney`) sur un échantillon borné, mesuré séparément.
 *
 * Chaque requête est une requête HTTP réelle ; chaque étape porte une étiquette
 * de mesure ; aucun résultat n'est supposé — tout échec est enregistré et son
 * identité (étape, statut, extrait de corps) est conservée pour l'analyse.
 */

import { LoadHttpClient, jsonOf, sessionCookieFrom, type RequestOutcome } from './loadHttpClient';
import { SESSION_COOKIE_NAME } from '../../src/backend/identity/cookies';

export const JOURNEY_STEP_COUNT = 40;

/**
 * IP cliente SIMULÉE, transmise dans `x-forwarded-for` — exactement l'en-tête
 * que le bord (Cloudflare) pose en production et que le limiteur de débit lit
 * pour les routes non authentifiées. Sans cela, tous les utilisateurs virtuels
 * partageraient le même seau `auth` (60 req/min) depuis la boucle locale et le
 * limiteur — qui fonctionne — fausserait la mesure du parcours.
 *
 * Ce n'est PAS une ressource externe simulée : l'en-tête fait partie du
 * contrat d'entrée du Worker. L'identité serveur, elle, reste dérivée du
 * credential Google signé et de la session PostgreSQL.
 */
export function clientIpFor(index: number): string {
  return `10.${(index >> 16) & 63}.${(index >> 8) & 255}.${index & 255}`;
}

export interface JourneyUser {
  index: number;
  /** JWT Google signé de l'EMPLOYER (préparé hors fenêtre de mesure). */
  employerCredential: string;
  /** JWT Google signé du CANDIDATE (préparé hors fenêtre de mesure). */
  candidateCredential: string;
}

export interface JourneyResult {
  index: number;
  /** Nombre d'étapes HTTP réellement exécutées (succès + échecs HTTP). */
  steps: number;
  completed: boolean;
  failedStep: string | null;
  status: number;
  detail: string;
  contractId: string | null;
}

export interface JourneyContext {
  client: LoadHttpClient;
  /** Jeton de session d'un ADMIN réellement provisionné côté serveur. */
  adminToken: string;
  /** Préfixe des clés d'idempotence (unique par niveau de charge). */
  keyPrefix: string;
  /**
   * Exécute les étapes Cron/Queue (passée bornée, comme le Cron Trigger). Le
   * déclencheur est INDÉPENDANT de la requête utilisateur : un échec de tick
   * est compté par l'appelant (retry) et ne fait pas échouer le parcours.
   */
  cronTick: () => Promise<unknown>;
  /**
   * Compteur de LIMITES PRODUIT réellement atteintes (jamais un échec masqué) :
   * par exemple le plafond P0-MATCHING de 200 profils candidats dans le bassin,
   * qui refuse le classement (409, aucun résultat partiel).
   */
  note?: (label: string) => void;
}

const QUALIFICATION_ANSWERS = {
  serviceNature: 'AUTONOMOUS_DELIVERABLE',
  deliverableDescription: 'Livrables convenus et remis à la date convenue.',
  acceptanceCriteria: 'Livrables remis au format et au nombre convenus.',
  acceptanceCriteriaObjective: true,
  compensationBasis: 'RESULT_OR_SERVICE',
  providerChoosesMethods: true,
  providerOrganizesTime: true,
  mayServeOtherClients: true,
  mayDeclineWithoutPenalty: true,
  professionalRisk: true,
  disciplinaryPower: false,
  continuousShift: false,
  dailyHierarchicalOrders: false,
  permanentIntegratedPosition: false,
  exclusivityRequired: false,
  exclusivityJustified: null,
  timePlaceConstraint: 'NONE',
  candidateFacingConstraintSummary: '',
  formalities: {
    majorityCheckPlanned: true,
    professionalStatusRequirementsIdentified: true,
    professionalAuthorizationRequired: false,
    professionalAuthorizationCheckPlanned: null,
    taxInvoicingRequirementsIdentified: true,
    insuranceRequired: false,
    insuranceRequirementsIdentified: null,
  },
};

class JourneyAbort extends Error {
  constructor(readonly step: string, readonly status: number, readonly detail: string) {
    super(`${step} → ${status} ${detail}`);
    this.name = 'JourneyAbort';
  }
}

function cookie(token: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function jsonCookie(token: string, idempotencyKey: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${token}`, 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey };
}

/**
 * Exécute le parcours complet d'un utilisateur virtuel.
 * Toute exception fonctionnelle est transformée en résultat `completed: false`
 * (aucun utilisateur ne fait tomber la campagne de charge).
 */
export async function runJourney(context: JourneyContext, user: JourneyUser, stepCounter?: { value: number }): Promise<JourneyResult> {
  const { client, keyPrefix, adminToken } = context;
  const key = (name: string): string => `${keyPrefix}-u${user.index}-${name}`;
  let steps = 0;
  let contractId: string | null = null;

  const call = async (
    step: string,
    spec: { method: 'GET' | 'POST' | 'PATCH'; path: string; headers: Record<string, string>; body?: string | Uint8Array; expectedStatus?: readonly number[]; timeoutMs?: number },
    description: string,
  ): Promise<RequestOutcome> => {
    steps += 1;
    if (stepCounter) stepCounter.value += 1;
    const outcome = await client.send({
      method: spec.method,
      path: spec.path,
      label: `${spec.method} ${step}`,
      headers: { 'x-forwarded-for': clientIpFor(user.index), ...spec.headers },
      ...(spec.body !== undefined ? { body: spec.body } : {}),
      expectedStatus: spec.expectedStatus ?? [200, 201],
      ...(spec.timeoutMs ? { timeoutMs: spec.timeoutMs } : {}),
    });
    if (!outcome.ok) {
      throw new JourneyAbort(step, outcome.status, `${description}: ${outcome.status} ${outcome.error ?? outcome.body.slice(0, 180)}`);
    }
    return outcome;
  };

  try {
    /* 1. AUTH / SESSION ------------------------------------------------ */
    const employerCredential = user.employerCredential;
    const candidateCredential = user.candidateCredential;
    if (!employerCredential || !candidateCredential) throw new JourneyAbort('auth.setup', 0, 'identité absente');

    const employerLogin = await call(
      'auth/google/credential',
      {
        method: 'POST',
        path: '/api/v1/auth/google/credential',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: employerCredential, requestedRole: 'EMPLOYER' }),
        expectedStatus: [200, 201],
      },
      'connexion EMPLOYER',
    );
    const employerToken = sessionCookieFrom(employerLogin, SESSION_COOKIE_NAME);

    const candidateLogin = await call(
      'auth/google/credential',
      {
        method: 'POST',
        path: '/api/v1/auth/google/credential',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: candidateCredential, requestedRole: 'CANDIDATE' }),
        expectedStatus: [200, 201],
      },
      'connexion CANDIDATE',
    );
    const candidateToken = sessionCookieFrom(candidateLogin, SESSION_COOKIE_NAME);

    await call('auth/session', { method: 'GET', path: '/api/v1/auth/session', headers: cookie(employerToken) }, 'session employeur');
    await call('me', { method: 'GET', path: '/api/v1/me', headers: cookie(candidateToken) }, 'profil candidat');

    /* 2. OFFRES -------------------------------------------------------- */
    const offerOutcome = await call(
      'offers.create',
      {
        method: 'POST',
        path: '/api/v1/offers',
        headers: jsonCookie(employerToken, key('offer-create')),
        body: JSON.stringify({
          title: `Mission charge ${user.index}`,
          contractType: 'CDI',
          remuneration: 175000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre créée par la campagne de charge P0-LOAD-TESTS.',
        }),
        expectedStatus: [201],
      },
      'création offre',
    );
    const offer = jsonOf<{ id: string }>(offerOutcome);
    await call('offers.public.list', { method: 'GET', path: '/api/v1/offers?limit=10', headers: {} }, 'liste publique des offres');

    /* 3. QUALIFICATION + MATCHING -------------------------------------- */
    await call(
      'matching.profile.update',
      {
        method: 'PATCH',
        path: '/api/v1/my/matching-profile',
        headers: jsonCookie(candidateToken, key('matching-profile')),
        body: JSON.stringify({ skills: ['Conception visuelle'], availability: 'AVAILABLE' }),
      },
      'profil matching candidat',
    );
    await call(
      'matching.qualification.submit',
      {
        method: 'POST',
        path: `/api/v1/offers/${offer.id}/qualification`,
        headers: jsonCookie(employerToken, key('qualification')),
        body: JSON.stringify({ answers: QUALIFICATION_ANSWERS }),
      },
      'qualification missionnelle',
    );
    // LIMITE PRODUIT RÉELLE `MAX_MATCHING_CANDIDATES = 200` : au-delà, le
    // classement est REFUSÉ (409) sans résultat partiel. Ce n'est pas un échec
    // du parcours : c'est un comportement fail-closed du domaine, mesuré comme
    // tel et compté.
    const matchingOutcome = await call(
      'matching.runs.create',
      {
        method: 'POST',
        path: `/api/v1/offers/${offer.id}/matching-runs`,
        headers: jsonCookie(employerToken, key('matching-run')),
        body: JSON.stringify({ sortBy: 'score', sortDirection: 'DESC' }),
        expectedStatus: [200, 201, 409],
      },
      'run de matching',
    );
    if (matchingOutcome.status === 409) context.note?.('matching.runs.create 409 (bassin > 200 profils)');
    await call(
      'matching.qualification.summary',
      { method: 'GET', path: `/api/v1/offers/${offer.id}/qualification-summary`, headers: {} },
      'résumé public des contraintes',
    );

    /* 4. CANDIDATURES + DÉCISIONS -------------------------------------- */
    const applicationOutcome = await call(
      'applications.create',
      {
        method: 'POST',
        path: `/api/v1/offers/${offer.id}/applications`,
        headers: jsonCookie(candidateToken, key('application')),
        body: JSON.stringify({ note: 'Candidature de charge.' }),
        expectedStatus: [201],
      },
      'soumission candidature',
    );
    const application = jsonOf<{ id: string }>(applicationOutcome);
    // Route RÉELLEMENT implémentée pour la lecture employeur : la liste des
    // candidatures d'une offre détenue (`/employer/applications` reste 501 dans
    // l'état du dépôt — ce n'est pas une régression de cette tranche).
    await call('applications.offer.list', { method: 'GET', path: `/api/v1/offers/${offer.id}/applications?limit=10`, headers: cookie(employerToken) }, 'liste employeur par offre');
    // Lecture propriétaire RÉELLE de la candidature (`/my/applications` reste
    // 501 dans l'état du dépôt : constat, pas une invention de cette tranche).
    // Lecture publique de l'offre par le candidat : la lecture d'une
    // candidature par son auteur (`GET /applications/:id`) reste 501 dans
    // l'état du dépôt — constat documenté, pas une invention de cette tranche.
    await call('offers.public.read', { method: 'GET', path: `/api/v1/offers/${offer.id}`, headers: {} }, 'lecture publique de l’offre');
    await call(
      'applications.examine',
      { method: 'POST', path: `/api/v1/applications/${application.id}/examine`, headers: jsonCookie(employerToken, key('examine')), body: '{}' },
      'examen candidature',
    );
    await call(
      'applications.shortlist',
      { method: 'POST', path: `/api/v1/applications/${application.id}/shortlist`, headers: jsonCookie(employerToken, key('shortlist')), body: '{}' },
      'shortlist candidature',
    );

    /* 5. PROPOSITIONS --------------------------------------------------- */
    const proposalOutcome = await call(
      'proposals.create',
      {
        method: 'POST',
        path: `/api/v1/conversations/${key('conv')}/proposals`,
        headers: jsonCookie(employerToken, key('proposal')),
        body: JSON.stringify({
          offerId: offer.id,
          applicationId: application.id,
          missionTitle: `Mission charge ${user.index}`,
          amount: 175000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          // Début ANTÉRIEUR à la date du jour : les échéances M1/M2 sont donc
          // réellement atteintes, ce qui permet d'exercer le cycle de paiement
          // (constat d'échéance → déclaration) sans fabriquer d'état à la main.
          startDate: '01 Janvier 2026',
          durationMonths: 6,
          location: 'Cotonou',
          conditions: ['Temps plein'],
        }),
        expectedStatus: [201],
      },
      'émission proposition',
    );
    const proposal = jsonOf<{ id: string }>(proposalOutcome);
    await call(
      'proposals.respond',
      {
        method: 'POST',
        path: `/api/v1/proposals/${proposal.id}/respond`,
        headers: jsonCookie(candidateToken, key('proposal-accept')),
        body: JSON.stringify({ action: 'ACCEPT' }),
      },
      'acceptation proposition',
    );

    /* 6. CONTRATS ------------------------------------------------------- */
    const contractOutcome = await call(
      'contracts.create',
      {
        method: 'POST',
        path: '/api/v1/contracts',
        headers: jsonCookie(employerToken, key('contract')),
        body: JSON.stringify({ proposalId: proposal.id }),
        expectedStatus: [201],
      },
      'création contrat',
    );
    const contract = jsonOf<{ id: string }>(contractOutcome);
    contractId = contract.id;
    await call('contracts.send', { method: 'POST', path: `/api/v1/contracts/${contract.id}/send`, headers: jsonCookie(employerToken, key('send')), body: '{}' }, 'envoi contrat');
    await call('contracts.sign', { method: 'POST', path: `/api/v1/contracts/${contract.id}/sign`, headers: jsonCookie(candidateToken, key('sign')), body: '{}' }, 'signature salarié');
    await call('contracts.activate', { method: 'POST', path: `/api/v1/contracts/${contract.id}/activate`, headers: jsonCookie(employerToken, key('activate')), body: '{}' }, 'activation contrat');
    await call('contracts.read', { method: 'GET', path: `/api/v1/contracts/${contract.id}`, headers: cookie(employerToken) }, 'lecture contrat');

    /* 7. CRON / QUEUE ---------------------------------------------------- */
    await context.cronTick();

    /* 8. WEBRTC (session + signaling uniquement, aucun TURN) ------------- */
    const sessionOutcome = await call(
      'webrtc.sessions.create',
      {
        method: 'POST',
        path: '/api/v1/webrtc-sessions',
        headers: jsonCookie(employerToken, key('webrtc-create')),
        body: JSON.stringify({ entityType: 'CONTRACT', entityId: contract.id }),
        expectedStatus: [201],
      },
      'création session WebRTC',
    );
    const webrtcSession = jsonOf<{ sessionId: string }>(sessionOutcome);
    await call('webrtc.sessions.join', { method: 'POST', path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/join`, headers: jsonCookie(candidateToken, key('webrtc-join')), body: '{}' }, 'join candidat');

    const employerCredentialOutcome = await call(
      'webrtc.sessions.credentials.create',
      { method: 'POST', path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/credentials`, headers: jsonCookie(employerToken, key('webrtc-cred-e')), body: '{}', expectedStatus: [201] },
      'credential employeur',
    );
    const candidateCredentialOutcome = await call(
      'webrtc.sessions.credentials.create',
      { method: 'POST', path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/credentials`, headers: jsonCookie(candidateToken, key('webrtc-cred-c')), body: '{}', expectedStatus: [201] },
      'credential candidat',
    );
    const employerCallCredential = jsonOf<{ credential: string }>(employerCredentialOutcome).credential;
    const candidateCallCredential = jsonOf<{ credential: string }>(candidateCredentialOutcome).credential;

    await call(
      'webrtc.signaling.offer',
      {
        method: 'POST',
        path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/signaling`,
        headers: { ...jsonCookie(employerToken, key('webrtc-offer')), 'X-WebRTC-Credential': employerCallCredential },
        body: JSON.stringify({ type: 'OFFER', payload: { sdp: 'v=0\r\no=- loadtest-offer' } }),
        expectedStatus: [201],
      },
      'signaling OFFER',
    );
    await call(
      'webrtc.signaling.answer',
      {
        method: 'POST',
        path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/signaling`,
        headers: { ...jsonCookie(candidateToken, key('webrtc-answer')), 'X-WebRTC-Credential': candidateCallCredential },
        body: JSON.stringify({ type: 'ANSWER', payload: { sdp: 'v=0\r\no=- loadtest-answer' } }),
        expectedStatus: [201],
      },
      'signaling ANSWER',
    );
    await call('webrtc.signaling.poll', {
      method: 'GET',
      path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/signaling?afterSequence=0`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${candidateToken}`, 'X-WebRTC-Credential': candidateCallCredential },
    }, 'poll signaling');
    await call(
      'webrtc.ice-configuration',
      { method: 'POST', path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/ice-configuration`, headers: jsonCookie(employerToken, key('webrtc-ice')), body: '{}' },
      'état ICE/TURN (aucun TURN réel)',
    );
    await call(
      'webrtc.close',
      { method: 'POST', path: `/api/v1/webrtc-sessions/${webrtcSession.sessionId}/close`, headers: jsonCookie(employerToken, key('webrtc-close')), body: '{}' },
      'fermeture session WebRTC',
    );

    /* 9. DOCUMENTS (stockage objet injecté ; R2 réel indisponible) ------ */
    const documentBytes = new TextEncoder().encode(`%PDF-1.4 charge ${user.index}`);
    const grantOutcome = await call(
      'documents.upload-grant',
      {
        method: 'POST',
        path: '/api/v1/documents/upload-grants',
        headers: jsonCookie(employerToken, key('doc-grant')),
        body: JSON.stringify({
          title: `Contrat charge ${user.index}`,
          fileName: 'contrat-charge.pdf',
          contentType: 'application/pdf',
          sizeBytes: documentBytes.length,
          documentType: 'CONTRACT_DOCUMENT',
        }),
        expectedStatus: [200, 201],
      },
      'grant de dépôt documentaire',
    );
    const grant = jsonOf<{ document: { documentId: string }; version: { versionId: string }; upload: { url: string } }>(grantOutcome);
    await call(
      'documents.versions.content.upload',
      {
        method: 'POST',
        path: grant.upload.url,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${employerToken}`, 'content-type': 'application/pdf', 'Idempotency-Key': key('doc-content') },
        body: documentBytes,
      },
      'dépôt binaire',
    );
    await call(
      'documents.versions.integrity.verify',
      {
        method: 'POST',
        path: `/api/v1/documents/${grant.document.documentId}/versions/${grant.version.versionId}/verify`,
        headers: jsonCookie(employerToken, key('doc-verify')),
        body: '{}',
      },
      'vérification SHA-256',
    );
    await call('documents.mine.list', { method: 'GET', path: '/api/v1/my/documents?limit=10', headers: cookie(employerToken) }, 'liste documents');

    /* 10. NOTIFICATIONS --------------------------------------------------- */
    const notifications = await call('notifications.mine.list', { method: 'GET', path: '/api/v1/my/notifications?limit=20', headers: cookie(candidateToken) }, 'liste notifications');
    const notificationList = jsonOf<{ items: Array<{ id: string }> }>(notifications);
    if (notificationList.items.length > 0) {
      await call(
        'notifications.read',
        { method: 'POST', path: `/api/v1/notifications/${notificationList.items[0].id}/read`, headers: jsonCookie(candidateToken, key('notif-read')), body: '{}' },
        'marquage lu',
      );
    }

    /* 11. RÉPUTATION ------------------------------------------------------ */
    await call('reputation.mine.read', { method: 'GET', path: '/api/v1/my/reputation', headers: cookie(candidateToken) }, 'lecture réputation');
    await call(
      'reputation.mine.reconcile',
      { method: 'POST', path: '/api/v1/my/reputation/reconcile', headers: jsonCookie(candidateToken, key('reputation')), body: '{}' },
      'réconciliation réputation',
    );

    /* 12. PAIEMENTS (fin de mission → constat → déclarations) ------------- */
    await call('payments.contract.list', { method: 'GET', path: `/api/v1/contracts/${contract.id}/payments?limit=25`, headers: cookie(employerToken) }, 'échéancier du contrat');
    await call('payments.mine.list', { method: 'GET', path: '/api/v1/my/payments?limit=25', headers: cookie(candidateToken) }, 'paiements du salarié');
    await call('contracts.end', { method: 'POST', path: `/api/v1/contracts/${contract.id}/end`, headers: jsonCookie(employerToken, key('end')), body: '{}' }, 'fin de mission');
    const closeOutcome = await call(
      'payments.close-mission',
      { method: 'POST', path: `/api/v1/contracts/${contract.id}/payments/close-mission`, headers: jsonCookie(employerToken, key('close-mission')), body: '{}' },
      'constat des paiements attendus',
    );
    const closed = jsonOf<{ payments: Array<{ paymentId: string; paymentType: string; status: string }> }>(closeOutcome);
    const salaryPayment = closed.payments.find(entry => entry.paymentType === 'SALARY');
    const feePayment = closed.payments.find(entry => entry.paymentType === 'PLATFORM_FEE');

    if (salaryPayment) {
      await call(
        'payments.salary.declare',
        {
          method: 'POST',
          path: '/api/v1/payments/salary-declarations',
          headers: jsonCookie(employerToken, key('declare-salary')),
          body: JSON.stringify({ paymentId: salaryPayment.paymentId, reference: `REF-SAL-${user.index}` }),
          expectedStatus: [200, 201],
        },
        'déclaration de salaire',
      );
    }
    if (feePayment) {
      await call(
        'payments.commission.declare',
        {
          method: 'POST',
          path: '/api/v1/payments/commission-declarations',
          headers: jsonCookie(employerToken, key('declare-fee')),
          body: JSON.stringify({ paymentId: feePayment.paymentId, reference: `REF-FEE-${user.index}` }),
          expectedStatus: [200, 201],
        },
        'déclaration de commission',
      );
    }

    /* 13. LITIGES ---------------------------------------------------------- */
    if (salaryPayment) {
      await call(
        'claims.create',
        {
          method: 'POST',
          path: '/api/v1/claims',
          headers: jsonCookie(candidateToken, key('claim')),
          body: JSON.stringify({
            contractId: contract.id,
            paymentId: salaryPayment.paymentId,
            type: 'SALARY_NOT_RECEIVED',
            reason: 'Charge : vérification déterministe du cycle de litige.',
          }),
          expectedStatus: [201],
        },
        'ouverture de litige',
      );
      await call('claims.mine.list', { method: 'GET', path: '/api/v1/my/claims?limit=10', headers: cookie(candidateToken) }, 'liste des litiges');
    }
    await call('admin.claims.list', { method: 'GET', path: '/api/v1/admin/claims?limit=5', headers: cookie(adminToken) }, 'lecture ADMIN des litiges');

    return { index: user.index, steps, completed: true, failedStep: null, status: 200, detail: 'OK', contractId };
  } catch (error) {
    const abort = error instanceof JourneyAbort ? error : null;
    return {
      index: user.index,
      steps,
      completed: false,
      failedStep: abort?.step ?? 'unexpected',
      status: abort?.status ?? 500,
      detail: abort?.detail ?? String((error as Error)?.message ?? error),
      contractId,
    };
  }
}

/**
 * Scénario REMPLACEMENT : incident contractuel → décision ADMIN `REPLACE` →
 * offre de remplacement publiée par l'employeur. Exige un contrat ACTIF, donc
 * son propre cycle (offre → candidature → proposition → contrat).
 */
export async function runReplacementJourney(context: JourneyContext, user: JourneyUser): Promise<JourneyResult> {
  const { client, keyPrefix, adminToken } = context;
  const key = (name: string): string => `${keyPrefix}-r${user.index}-${name}`;
  let steps = 0;
  let contractId: string | null = null;

  const call = async (
    step: string,
    spec: { method: 'GET' | 'POST'; path: string; headers: Record<string, string>; body?: string; expectedStatus?: readonly number[] },
    description: string,
  ): Promise<RequestOutcome> => {
    steps += 1;
    const outcome = await client.send({
      method: spec.method,
      path: spec.path,
      label: `${spec.method} ${step}`,
      headers: { 'x-forwarded-for': clientIpFor(user.index), ...spec.headers },
      ...(spec.body !== undefined ? { body: spec.body } : {}),
      expectedStatus: spec.expectedStatus ?? [200, 201],
    });
    if (!outcome.ok) throw new JourneyAbort(step, outcome.status, `${description}: ${outcome.status} ${outcome.error ?? outcome.body.slice(0, 180)}`);
    return outcome;
  };

  try {
    const employerCredential = user.employerCredential;
    const candidateCredential = user.candidateCredential;
    if (!employerCredential || !candidateCredential) throw new JourneyAbort('auth.setup', 0, 'identité absente');

    const employerLogin = await call('auth/google/credential', {
      method: 'POST', path: '/api/v1/auth/google/credential',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: employerCredential, requestedRole: 'EMPLOYER' }),
      expectedStatus: [200, 201],
    }, 'connexion EMPLOYER');
    const employerToken = sessionCookieFrom(employerLogin, SESSION_COOKIE_NAME);
    const candidateLogin = await call('auth/google/credential', {
      method: 'POST', path: '/api/v1/auth/google/credential',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: candidateCredential, requestedRole: 'CANDIDATE' }),
      expectedStatus: [200, 201],
    }, 'connexion CANDIDATE');
    const candidateToken = sessionCookieFrom(candidateLogin, SESSION_COOKIE_NAME);

    const offer = jsonOf<{ id: string }>(await call('offers.create', {
      method: 'POST', path: '/api/v1/offers',
      headers: jsonCookie(employerToken, key('offer')),
      body: JSON.stringify({
        title: `Mission remplaçable ${user.index}`,
        contractType: 'CDD',
        remuneration: 175000,
        currency: 'FCFA',
        location: 'Cotonou',
        summary: 'Offre du scénario remplacement P0-LOAD-TESTS.',
      }),
      expectedStatus: [201],
    }, 'création offre'));
    const application = jsonOf<{ id: string }>(await call('applications.create', {
      method: 'POST', path: `/api/v1/offers/${offer.id}/applications`,
      headers: jsonCookie(candidateToken, key('application')),
      body: JSON.stringify({ note: 'Candidature remplacement.' }),
      expectedStatus: [201],
    }, 'candidature'));
    await call('applications.shortlist', {
      method: 'POST', path: `/api/v1/applications/${application.id}/shortlist`,
      headers: jsonCookie(employerToken, key('shortlist')), body: '{}',
    }, 'shortlist');
    const proposal = jsonOf<{ id: string }>(await call('proposals.create', {
      method: 'POST', path: `/api/v1/conversations/${key('conv')}/proposals`,
      headers: jsonCookie(employerToken, key('proposal')),
      body: JSON.stringify({
        offerId: offer.id, applicationId: application.id,
        missionTitle: `Mission remplaçable ${user.index}`,
        amount: 175000, currency: 'FCFA', periodicity: 'Mensuel',
        startDate: '01 Janvier 2026', durationMonths: 6,
        location: 'Cotonou', conditions: ['Temps plein'],
      }),
      expectedStatus: [201],
    }, 'proposition'));
    await call('proposals.respond', {
      method: 'POST', path: `/api/v1/proposals/${proposal.id}/respond`,
      headers: jsonCookie(candidateToken, key('accept')), body: JSON.stringify({ action: 'ACCEPT' }),
    }, 'acceptation');
    const contract = jsonOf<{ id: string }>(await call('contracts.create', {
      method: 'POST', path: '/api/v1/contracts',
      headers: jsonCookie(employerToken, key('contract')),
      body: JSON.stringify({ proposalId: proposal.id }),
      expectedStatus: [201],
    }, 'contrat'));
    contractId = contract.id;
    await call('contracts.send', { method: 'POST', path: `/api/v1/contracts/${contract.id}/send`, headers: jsonCookie(employerToken, key('send')), body: '{}' }, 'envoi');
    await call('contracts.sign', { method: 'POST', path: `/api/v1/contracts/${contract.id}/sign`, headers: jsonCookie(candidateToken, key('sign')), body: '{}' }, 'signature');
    await call('contracts.activate', { method: 'POST', path: `/api/v1/contracts/${contract.id}/activate`, headers: jsonCookie(employerToken, key('activate')), body: '{}' }, 'activation');

    // Incident contractuel : le contrat reste ACTIVE tant que l'ADMIN n'a pas
    // décidé — c'est la condition réelle du dossier de remplacement.
    const claim = jsonOf<{ claimId: string }>(await call('claims.create', {
      method: 'POST', path: '/api/v1/claims',
      headers: jsonCookie(employerToken, key('incident')),
      body: JSON.stringify({
        contractId: contract.id,
        type: 'CONTRACT_INCIDENT',
        reason: 'Charge : incident contractuel réel du scénario remplacement.',
      }),
      expectedStatus: [201],
    }, 'déclaration incident'));
    await call('admin.claims.review', {
      method: 'POST', path: `/api/v1/admin/claims/${claim.claimId}/review`,
      headers: jsonCookie(adminToken, key('review')), body: '{}',
    }, 'revue ADMIN');
    const decision = jsonOf<{ replacementId?: string | null }>(await call('admin.claims.decision', {
      method: 'POST', path: `/api/v1/admin/claims/${claim.claimId}/decision`,
      headers: jsonCookie(adminToken, key('decision')),
      body: JSON.stringify({ decision: 'REPLACE', resolution: 'Charge : remplacement décidé par l’administration.' }),
    }, 'décision REPLACE'));
    if (!decision.replacementId) throw new JourneyAbort('admin.claims.decision', 200, 'dossier de remplacement absent de la décision');
    await call('replacements.offer.create', {
      method: 'POST', path: `/api/v1/replacements/${decision.replacementId}/offer`,
      headers: jsonCookie(employerToken, key('replacement-offer')),
      body: JSON.stringify({
        title: `Offre de remplacement ${user.index}`,
        contractType: 'CDD',
        remuneration: 175000,
        currency: 'FCFA',
        location: 'Cotonou',
        summary: 'Offre de remplacement émise sous charge.',
      }),
      expectedStatus: [201],
    }, 'publication offre de remplacement');
    await call('replacements.mine.list', { method: 'GET', path: '/api/v1/my/replacements?limit=10', headers: cookie(employerToken) }, 'liste remplacements');

    return { index: user.index, steps, completed: true, failedStep: null, status: 200, detail: 'OK', contractId };
  } catch (error) {
    const abort = error instanceof JourneyAbort ? error : null;
    return {
      index: user.index, steps, completed: false,
      failedStep: abort?.step ?? 'unexpected',
      status: abort?.status ?? 500,
      detail: abort?.detail ?? String((error as Error)?.message ?? error),
      contractId,
    };
  }
}
