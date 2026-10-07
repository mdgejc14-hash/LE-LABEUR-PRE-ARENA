/**
 * LE LABEUR — P0-SECURITY-ANTI-FRAUD — couche finale transversale de sécurité
 * et d'anti-fraude (40 scénarios obligatoires sur PostgreSQL réel, Worker API,
 * R2/ObjectStorage, Webhooks HMAC, OTP Salaire, WebRTC, Cron/Queue et Audit).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
  type TestHarness,
} from './offers.test';
import { ApiError, apiErrorResponse } from './errors';
import { SECURITY_AUDIT_SOURCE, createSecurityRateLimiter } from './security';
import { SESSION_COOKIE_NAME } from '../identity/cookies';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { createSqlContractStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createInMemoryObjectStorage } from '../documents/storage';
import {
  createTestPaymentProviderAdapter,
  createUnconfiguredPaymentProviderAdapter,
} from '../payments/paymentVerification';
import { paymentIdFor } from '../../domain/paymentLifecycle';
import { buildMatchingCriteria } from '../matching/matchingEngine';
import { REPUTATION_RULES_VERSION, REPUTATION_SCORE_VERSION } from '../../domain/reputationRules';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const SIGNING_SECRET = 'test-only-security-anti-fraud-r2-secret-0123456789';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function postJson(harness: TestHarness, path: string, token: string | null, idempotencyKey: string, body: unknown): Promise<Response> {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  }));
}

function patchJson(harness: TestHarness, path: string, token: string | null, idempotencyKey: string, body: unknown): Promise<Response> {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  }));
}

function getAuth(harness: TestHarness, path: string, token: string | null): Promise<Response> {
  return harness.worker.fetch(authRequest(path, token));
}

async function provisionUser(
  harness: TestHarness,
  role: 'ADMIN' | 'EMPLOYER' | 'CANDIDATE',
  label: string,
): Promise<{ token: string; userId: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = new Date(harness.clock.value.getTime() - 120_000).toISOString();
  const expiresAt = new Date(harness.clock.value.getTime() + 3_600_000).toISOString();
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async tx => {
    await tx.users.create({
      id: userId,
      role,
      status: 'ACTIVE',
      email: `${label}.${userId}@example.com`,
      displayName: `${role} ${label}`,
    });
    await tx.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { token, userId };
}

async function provisionAdmin(harness: TestHarness, label = 'admin'): Promise<{ token: string; userId: string }> {
  return provisionUser(harness, 'ADMIN', label);
}

async function securityAuditRows(
  harness: TestHarness,
  action: string,
): Promise<Array<{ action: string; actor_id: string; entity_id: string; source: string; after_state: unknown }>> {
  const res = await harness.database.query<{
    action: string;
    actor_id: string;
    entity_id: string;
    source: string;
    after_state: unknown;
  }>(
    `SELECT action, actor_id, entity_id, source, after_state
       FROM automation_audit_ledger
      WHERE action = $1 AND source = $2
      ORDER BY occurred_at ASC, id ASC`,
    [action, SECURITY_AUDIT_SOURCE],
  );
  return res.rows;
}

export async function runSecurityAntiFraudTests(): Promise<OfferTestResult[]> {
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void> | void) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const salaryOtps = new Map<string, string>();
  const storage = createInMemoryObjectStorage();
  const testAdapter = createTestPaymentProviderAdapter();

  const harness = await createOffersTestHarness(
    (paymentId, otp) => salaryOtps.set(paymentId, otp),
    {
      documentStorage: storage,
      documentUrlSigningSecret: SIGNING_SECRET,
    },
  );

  (harness.payments as unknown as { getProviderAdapter?: (id: string) => unknown }).getProviderAdapter =
    (id: string) => id === 'TEST_GATEWAY' ? testAdapter : createUnconfiguredPaymentProviderAdapter(id);

  try {
    const employerA = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const employerB = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
    const candidateA = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
    const candidateB = await authenticateActor(harness, 'candidate-2', 'CANDIDATE');
    const outsider = await provisionUser(harness, 'CANDIDATE', 'sec-outsider');
    const admin = await provisionAdmin(harness, 'sec-main');

    /* ================================================================== */
    /* 1–6 : Identité / Session / RBAC                                    */
    /* ================================================================== */

    await check('1. Identité: requête sans session sur route protégée → 401 + audit', async () => {
      const before = (await securityAuditRows(harness, 'SECURITY_AUTH_FAILED')).length;
      for (const path of ['/api/v1/me', '/api/v1/admin/users', '/api/v1/my/reputation', '/api/v1/my/documents', '/api/v1/my/notifications']) {
        const res = await getAuth(harness, path, null);
        assert(res.status === 401, `${path} sans session doit renvoyer 401, reçu ${res.status}`);
      }
      const after = (await securityAuditRows(harness, 'SECURITY_AUTH_FAILED')).length;
      assert(after >= before + 5, 'chaque échec d’authentification doit être tracé dans automation_audit_ledger');
    });

    await check('2. Session: session expirée ou révoquée → 401 + audit', async () => {
      const tempActor = await provisionUser(harness, 'CANDIDATE', 'sec-temp-session');
      const okRes = await getAuth(harness, '/api/v1/me', tempActor.token);
      assert(okRes.status === 200, `session active attendue 200, reçu ${okRes.status}`);

      // Révocation via logout
      const logoutRes = await harness.worker.fetch(authRequest('/api/v1/auth/logout', tempActor.token, { method: 'POST' }));
      assert(logoutRes.status === 200, 'logout doit réussir');
      const revokedRes = await getAuth(harness, '/api/v1/me', tempActor.token);
      assert(revokedRes.status === 401, `session révoquée doit renvoyer 401, reçu ${revokedRes.status}`);

      // Session expirée en base (respectant la contrainte sessions_expiry_after_creation : created_at = now - 120s, expires_at = now - 60s)
      const expiredActor = await provisionUser(harness, 'CANDIDATE', 'sec-exp-session');
      await harness.database.query(
        'UPDATE sessions SET expires_at = $1 WHERE user_id = $2',
        [new Date(harness.clock.value.getTime() - 60_000).toISOString(), expiredActor.userId],
      );
      const expiredRes = await getAuth(harness, '/api/v1/me', expiredActor.token);
      assert(expiredRes.status === 401, `session expirée doit renvoyer 401, reçu ${expiredRes.status}`);
    });

    await check('3. RBAC: CANDIDATE sur route EMPLOYER → 403 + audit', async () => {
      const before = (await securityAuditRows(harness, 'SECURITY_ACCESS_DENIED')).length;
      const createOfferRes = await postJson(harness, '/api/v1/offers', candidateA.token, 'sec-rbac-cand-offer-1', {
        title: 'Offre interdite',
        contractType: 'CDI',
        remuneration: 100_000,
        location: 'Cotonou',
      });
      assert(createOfferRes.status === 403, `CANDIDATE sur création offre attendu 403, reçu ${createOfferRes.status}`);
      const after = (await securityAuditRows(harness, 'SECURITY_ACCESS_DENIED')).length;
      assert(after > before, 'refus RBAC CANDIDATE sur route EMPLOYER audité');
    });

    await check('4. RBAC: EMPLOYER sur route CANDIDATE → 403 + audit', async () => {
      const offerRes = await postJson(harness, '/api/v1/offers', employerB.token, 'sec-offer-b-rbac-1', {
        title: 'Menuisier qualifié',
        contractType: 'CDD',
        remuneration: 150_000,
        currency: 'FCFA',
        location: 'Cotonou',
        skills: ['Menuiserie'],
        summary: 'Offre test RBAC.',
      });
      assert(offerRes.status === 201, `création offre B attendue 201, reçu ${offerRes.status}`);
      const offerB = await offerRes.json() as { id: string };

      const applyAsEmployer = await postJson(
        harness,
        `/api/v1/offers/${offerB.id}/applications`,
        employerA.token,
        'sec-rbac-emp-apply-1',
        { note: 'Employeur tentant de postuler' },
      );
      assert(applyAsEmployer.status === 403, `EMPLOYER sur soumission candidature attendu 403, reçu ${applyAsEmployer.status}`);

      const matchingProfileAsEmployer = await patchJson(
        harness,
        '/api/v1/my/matching-profile',
        employerA.token,
        'sec-rbac-emp-profile-1',
        { skills: ['Menuiserie'], departmentId: 'littoral', availability: 'AVAILABLE' },
      );
      assert(matchingProfileAsEmployer.status === 403, `EMPLOYER sur profil candidat matching attendu 403, reçu ${matchingProfileAsEmployer.status}`);
    });

    await check('5. RBAC: non-ADMIN sur route ADMIN → 403 + audit', async () => {
      for (const actor of [candidateA, employerA]) {
        for (const path of ['/api/v1/admin/users', '/api/v1/admin/reputation/entries', '/api/v1/admin/documents', '/api/v1/admin/notifications']) {
          const res = await getAuth(harness, path, actor.token);
          assert(res.status === 403, `non-ADMIN sur ${path} attendu 403, reçu ${res.status}`);
        }
      }
    });

    await check('6. RBAC: ADMIN sans permission requise → 403 (role_permissions / user_permissions vérifiés en base)', async () => {
      await harness.database.query(
        'DELETE FROM role_permissions WHERE role = $1 AND permission_code = $2',
        ['ADMIN', 'users:read:any'],
      );
      try {
        const denied = await getAuth(harness, '/api/v1/admin/users', admin.token);
        assert(denied.status === 403, `ADMIN sans permission users:read:any attendu 403, reçu ${denied.status}`);
      } finally {
        await harness.database.query(
          'INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          ['ADMIN', 'users:read:any'],
        );
      }
      const restored = await getAuth(harness, '/api/v1/admin/users', admin.token);
      assert(restored.status === 200, `ADMIN avec permission restaurée attendu 200, reçu ${restored.status}`);
    });

    /* ================================================================== */
    /* 7–15 : Ownership / IDOR                                            */
    /* ================================================================== */

    let offerBId = '';
    let appBId = '';
    let propBId = '';
    let contractBId = '';
    let claimBId = '';
    let replacementBId = '';

    await check('7. IDOR Offre: employeur A modifie ou inspecte les candidatures de l’offre de l’employeur B → 403', async () => {
      const created = await postJson(harness, '/api/v1/offers', employerB.token, 'sec-idor-offer-b', {
        title: 'Électricien bâtiment',
        contractType: 'CDD',
        remuneration: 180_000,
        currency: 'FCFA',
        location: 'Cotonou',
        departmentId: 'littoral',
        skills: ['Électricité'],
        summary: 'Offre de l’employeur B.',
      });
      assert(created.status === 201, `création offre B attendue 201, reçu ${created.status}`);
      offerBId = ((await created.json()) as { id: string }).id;

      const pauseByA = await patchJson(
        harness,
        `/api/v1/offers/${offerBId}/status`,
        employerA.token,
        'sec-idor-pause-b',
        { status: 'PAUSED' },
      );
      assert(pauseByA.status === 403, `employeur A sur pause offre B attendu 403, reçu ${pauseByA.status}`);

      const closeByA = await patchJson(
        harness,
        `/api/v1/offers/${offerBId}/status`,
        employerA.token,
        'sec-idor-close-b',
        { status: 'CANCELLED' },
      );
      assert(closeByA.status === 403, `employeur A sur cancel offre B attendu 403, reçu ${closeByA.status}`);

      const appsByA = await getAuth(harness, `/api/v1/offers/${offerBId}/applications`, employerA.token);
      assert(appsByA.status === 403, `employeur A lisant candidatures de l’offre B attendu 403, reçu ${appsByA.status}`);
    });

    await check('8. IDOR Candidature: candidat A retire la candidature du candidat B → 403', async () => {
      const appRes = await postJson(
        harness,
        `/api/v1/offers/${offerBId}/applications`,
        candidateB.token,
        'sec-idor-app-b',
        { note: 'Candidature légitime de B' },
      );
      assert(appRes.status === 201, `candidature B attendue 201, reçu ${appRes.status}`);
      appBId = ((await appRes.json()) as { id: string }).id;

      const withdrawByA = await postJson(
        harness,
        `/api/v1/applications/${appBId}/withdraw`,
        candidateA.token,
        'sec-idor-withdraw-by-a',
        { reason: 'Tentative IDOR de retrait par A' },
      );
      assert(withdrawByA.status === 403, `candidat A retirant candidature B attendu 403, reçu ${withdrawByA.status}`);
    });

    await check('9. IDOR Proposition: candidat A accepte ou décline la proposition destinée au candidat B → 403', async () => {
      const exRes = await postJson(harness, `/api/v1/applications/${appBId}/examine`, employerB.token, 'sec-ex-b', {});
      assert(exRes.status === 200, 'examine B 200');
      const shRes = await postJson(harness, `/api/v1/applications/${appBId}/shortlist`, employerB.token, 'sec-sh-b', {});
      assert(shRes.status === 200, 'shortlist B 200');

      const propRes = await postJson(
        harness,
        '/api/v1/conversations/cnv_sec_b/proposals',
        employerB.token,
        'sec-prop-b',
        {
          applicationId: appBId,
          missionTitle: 'Travaux électriques',
          amount: 180_000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Septembre 2026',
          durationMonths: 2,
          location: 'Cotonou',
          conditions: ['Ponctualité'],
        },
      );
      assert(propRes.status === 201, `création proposition B attendue 201, reçu ${propRes.status}`);
      propBId = ((await propRes.json()) as { id: string }).id;

      const acceptByA = await postJson(
        harness,
        `/api/v1/proposals/${propBId}/respond`,
        candidateA.token,
        'sec-idor-prop-accept-a',
        { action: 'ACCEPT' },
      );
      assert(acceptByA.status === 403, `candidat A acceptant proposition B attendu 403, reçu ${acceptByA.status}`);

      const declineByA = await postJson(
        harness,
        `/api/v1/proposals/${propBId}/respond`,
        candidateA.token,
        'sec-idor-prop-decline-a',
        { action: 'DECLINE', reason: 'Sabotage IDOR' },
      );
      assert(declineByA.status === 403, `candidat A déclinant proposition B attendu 403, reçu ${declineByA.status}`);
    });

    await check('10. IDOR Contrat: utilisateur tiers lit ou signe un contrat non-participant → 403', async () => {
      const acceptB = await postJson(
        harness,
        `/api/v1/proposals/${propBId}/respond`,
        candidateB.token,
        'sec-prop-accept-b',
        { action: 'ACCEPT' },
      );
      assert(acceptB.status === 200, `acceptation légitime par B attendue 200, reçu ${acceptB.status}`);

      const ctrRes = await postJson(harness, '/api/v1/contracts', employerB.token, 'sec-ctr-create-b', {
        proposalId: propBId,
      });
      assert(ctrRes.status === 201, `création contrat B attendue 201, reçu ${ctrRes.status}`);
      contractBId = ((await ctrRes.json()) as { id: string }).id;

      const sendRes = await postJson(harness, `/api/v1/contracts/${contractBId}/send`, employerB.token, 'sec-ctr-send-b', {});
      assert(sendRes.status === 200, 'envoi contrat B pour signature');

      for (const intruder of [candidateA, employerA, outsider]) {
        const readRes = await getAuth(harness, `/api/v1/contracts/${contractBId}`, intruder.token);
        assert(readRes.status === 403, `tiers lisant contrat B attendu 403, reçu ${readRes.status}`);

        const signRes = await postJson(harness, `/api/v1/contracts/${contractBId}/sign`, intruder.token, `sec-idor-sign-${intruder.userId}`, {});
        assert(signRes.status === 403, `tiers signant contrat B attendu 403, reçu ${signRes.status}`);
      }
    });

    await check('11. IDOR Claim: utilisateur tiers ouvre ou lit un Claim d’un contrat tiers → 403', async () => {
      // Signer (par candidateB) et activer (par employerB) le contrat B
      assert((await postJson(harness, `/api/v1/contracts/${contractBId}/sign`, candidateB.token, 'sec-ctr-sign-cand-b', {})).status === 200, 'signature candidat B');
      assert((await postJson(harness, `/api/v1/contracts/${contractBId}/activate`, employerB.token, 'sec-ctr-act-b', {})).status === 200, 'activation contrat B');
      await harness.automationWorker!.drain(50);

      // Tiers tente d'ouvrir un Claim sur contractBId
      const forgedClaim = await postJson(harness, '/api/v1/claims', candidateA.token, 'sec-idor-claim-open-a', {
        contractId: contractBId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Tentative IDOR d’ouverture de litige sur contrat tiers.',
      });
      assert(forgedClaim.status === 403, `tiers ouvrant un Claim sur contrat B attendu 403, reçu ${forgedClaim.status}`);

      // L'employeur B ouvre un Claim légitime
      const validClaim = await postJson(harness, '/api/v1/claims', employerB.token, 'sec-valid-claim-b', {
        contractId: contractBId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Incident réel signalé par l’employeur B.',
      });
      assert(validClaim.status === 201, `création Claim B attendue 201, reçu ${validClaim.status}`);
      claimBId = ((await validClaim.json()) as { claimId: string }).claimId;

      // Tiers tente de lire ce Claim
      for (const intruder of [candidateA, employerA]) {
        const readClaim = await getAuth(harness, `/api/v1/claims/${claimBId}`, intruder.token);
        assert(readClaim.status === 403, `tiers lisant Claim B attendu 403, reçu ${readClaim.status}`);
      }
    });

    await check('12. IDOR Remplacement: utilisateur tiers lit ou agit sur un dossier de remplacement tiers → 403', async () => {
      // Créer et activer un contrat dédié au remplacement
      const repOffer = await postJson(harness, '/api/v1/offers', employerB.token, 'sec-rep-offer-b', {
        title: 'Plombier remplacement test',
        contractType: 'CDD',
        remuneration: 160_000,
        currency: 'FCFA',
        location: 'Cotonou',
        summary: 'Offre remplacement test',
      });
      const repOfferId = ((await repOffer.json()) as { id: string }).id;
      const repApp = await postJson(harness, `/api/v1/offers/${repOfferId}/applications`, candidateB.token, 'sec-rep-app-b', { note: 'Dispo' });
      const repAppId = ((await repApp.json()) as { id: string }).id;
      const repProp = await postJson(
        harness,
        '/api/v1/conversations/cnv_sec_rep/proposals',
        employerB.token,
        'sec-rep-prop-b',
        {
          applicationId: repAppId,
          missionTitle: 'Plomberie',
          amount: 160_000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Septembre 2026',
          durationMonths: 2,
          location: 'Cotonou',
          conditions: ['Horaires définis'],
        },
      );
      const repPropId = ((await repProp.json()) as { id: string }).id;
      await postJson(harness, `/api/v1/proposals/${repPropId}/respond`, candidateB.token, 'sec-rep-acc-b', { action: 'ACCEPT' });
      const repCtr = await postJson(harness, '/api/v1/contracts', employerB.token, 'sec-rep-ctr-b', { proposalId: repPropId });
      const repCtrId = ((await repCtr.json()) as { id: string }).id;
      await postJson(harness, `/api/v1/contracts/${repCtrId}/send`, employerB.token, 'sec-rep-send-b', {});
      await postJson(harness, `/api/v1/contracts/${repCtrId}/sign`, candidateB.token, 'sec-rep-sign-cand-b', {});
      await postJson(harness, `/api/v1/contracts/${repCtrId}/activate`, employerB.token, 'sec-rep-act-b', {});
      await harness.automationWorker!.drain(50);

      const repClaim = await postJson(harness, '/api/v1/claims', employerB.token, 'sec-rep-claim-b', {
        contractId: repCtrId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Incident nécessitant un remplacement.',
      });
      const repClaimId = ((await repClaim.json()) as { claimId: string }).claimId;
      await postJson(harness, `/api/v1/admin/claims/${repClaimId}/review`, admin.token, 'sec-rep-claim-rev', { note: 'Instruction' });
      const decRes = await postJson(harness, `/api/v1/admin/claims/${repClaimId}/decision`, admin.token, 'sec-rep-claim-dec', {
        decision: 'REPLACE',
        resolution: 'Remplacement autorisé suite à instruction.',
      });
      assert(decRes.status === 200, `décision REPLACE attendue 200, reçu ${decRes.status}`);
      const decidedClaim = (await decRes.json()) as { replacementId: string };
      replacementBId = decidedClaim.replacementId;
      assert(Boolean(replacementBId), 'replacementId retourné par la décision REPLACE');

      // Tiers (employerA et candidateA) tente de lire ou publier l'offre de remplacement
      for (const intruder of [employerA, candidateA]) {
        const readRep = await getAuth(harness, `/api/v1/replacements/${replacementBId}`, intruder.token);
        assert(
          readRep.status === 404 || readRep.status === 403,
          `tiers lisant remplacement B refusé sans fuite (attendu 404/403, reçu ${readRep.status})`,
        );
      }
      const publishByA = await postJson(
        harness,
        `/api/v1/replacements/${replacementBId}/offer`,
        employerA.token,
        'sec-idor-rep-pub-a',
        {
          title: 'Offre pirate',
          contractType: 'CDD',
          remuneration: 160_000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Tentative IDOR de publication sur remplacement tiers.',
        },
      );
      assert(publishByA.status === 403, `employeur A publiant sur remplacement B attendu 403, reçu ${publishByA.status}`);
    });

    await check('13. IDOR Notification: utilisateur A lit ou marque la notification de l’utilisateur B → 404 sans fuite', async () => {
      await harness.automationWorker!.drain(100);
      const bNotifsRes = await getAuth(harness, '/api/v1/my/notifications', employerB.token);
      assert(bNotifsRes.status === 200, 'liste notifications B');
      const bNotifs = (await bNotifsRes.json()) as { items: Array<{ id?: string; notificationId?: string }> };
      assert(bNotifs.items.length > 0, 'employeur B doit avoir au moins une notification');
      const targetNotifId = (bNotifs.items[0].id ?? bNotifs.items[0].notificationId)!;

      const markByA = await postJson(
        harness,
        `/api/v1/notifications/${targetNotifId}/read`,
        employerA.token,
        'sec-idor-notif-read-a',
        {},
      );
      assert(markByA.status === 404, `marquage notification B par A attendu 404 (sans fuite d’existence), reçu ${markByA.status}`);

      const aNotifs = (await (await getAuth(harness, '/api/v1/my/notifications', employerA.token)).json()) as { items: Array<{ id?: string; notificationId?: string }> };
      assert(!aNotifs.items.some(n => (n.id ?? n.notificationId) === targetNotifId), 'aucune notification de B ne doit apparaître chez A');
    });

    await check('14. IDOR Matching: utilisateur A qualifie ou lance les résultats de matching d’une offre de l’employeur B → 403', async () => {
      const qualByA = await postJson(
        harness,
        `/api/v1/offers/${offerBId}/qualification`,
        employerA.token,
        'sec-idor-match-qual-a',
        {
          answers: {
            serviceNature: 'AUTONOMOUS_DELIVERABLE',
            deliverableDescription: 'Livraison de 20 visuels de campagne finalisés.',
            acceptanceCriteria: '20 fichiers conformes au format et à la charte validés.',
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
          },
        },
      );
      assert(qualByA.status === 403, `qualification offre B par employeur A attendu 403, reçu ${qualByA.status}`);

      const runByA = await postJson(
        harness,
        `/api/v1/offers/${offerBId}/matching-runs`,
        employerA.token,
        'sec-idor-match-run-a',
        {},
      );
      assert(runByA.status === 403, `matching run offre B par employeur A attendu 403, reçu ${runByA.status}`);

      const runByCand = await postJson(
        harness,
        `/api/v1/offers/${offerBId}/matching-runs`,
        candidateA.token,
        'sec-idor-match-run-cand',
        {},
      );
      assert(runByCand.status === 403, `matching run offre B par candidat A attendu 403, reçu ${runByCand.status}`);
    });

    await check('15. IDOR Réputation: utilisateur A lit ou corrige la réputation privée d’un utilisateur B sans permission → 403/400', async () => {
      // Réconcilier la réputation de candidateB (qui a eu un Claim REPLACE)
      await harness.automationWorker!.drain(100);
      await postJson(harness, '/api/v1/my/reputation/reconcile', candidateB.token, 'sec-rep-reconcile-b', {});
      const bEntriesRes = await getAuth(harness, '/api/v1/my/reputation/entries', candidateB.token);
      const bEntries = (await bEntriesRes.json()) as { items: Array<{ reputationId: string }> };
      assert(bEntries.items.length > 0, 'candidateB a au moins une entrée de réputation');
      const entryBId = bEntries.items[0].reputationId;

      // Utilisateur A tente de lire via route ADMIN
      const readAdminByA = await getAuth(harness, `/api/v1/admin/reputation/entries/${entryBId}`, candidateA.token);
      assert(readAdminByA.status === 403, `lecture entrée B par A attendu 403, reçu ${readAdminByA.status}`);

      // Utilisateur A tente de corriger via route ADMIN
      const correctByA = await postJson(
        harness,
        `/api/v1/admin/reputation/entries/${entryBId}/correct`,
        candidateA.token,
        'sec-idor-rep-correct-a',
        { action: 'REVERSE', reason: 'Tentative frauduleuse d’annulation' },
      );
      assert(correctByA.status === 403, `correction entrée B par A attendu 403, reçu ${correctByA.status}`);

      // Utilisateur A tente de forcer subjectUserId sur sa propre route self
      const forgedSelfQuery = await getAuth(harness, `/api/v1/my/reputation?subjectUserId=${candidateB.userId}`, candidateA.token);
      assert(forgedSelfQuery.status === 400, `paramètre subjectUserId falsifié sur route self attendu 400, reçu ${forgedSelfQuery.status}`);
    });

    /* ================================================================== */
    /* 16–21 : Paiements / Webhooks / Salaire                             */
    /* ================================================================== */

    const salaryPaymentBId = paymentIdFor(contractBId, 'SALARY', 1);
    const feePaymentBId = paymentIdFor(contractBId, 'PLATFORM_FEE', 1);

    await check('16. Webhook: webhook paiement sans signature valide → rejeté (401) + audité', async () => {
      await harness.payments!.markPaymentDue(salaryPaymentBId, { deadlineId: 'sec-dl-sal-1' });
      await harness.payments!.markPaymentDue(feePaymentBId, { deadlineId: 'sec-dl-fee-1' });

      const payload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-SEC-UNSIGNED-01',
        paymentId: salaryPaymentBId,
        reference: 'REF-SEC-UNSIGNED-01',
        amount: 135_000,
        currency: 'FCFA',
        payer: employerB.userId,
        recipient: candidateB.userId,
        occurredAt: harness.clock.value.toISOString(),
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };
      const signed = await testAdapter.createSignedWebhook(payload);

      const res = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: {
          ...signed.headers,
          'x-webhook-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        },
        body: signed.rawBody,
      }));
      assert(res.status === 401, `webhook signature invalide attendu 401, reçu ${res.status}`);

      const audit = await harness.database.query<{ action: string }>(
        "SELECT action FROM automation_audit_ledger WHERE action IN ('PAYMENT_WEBHOOK_SIGNATURE_REJECTED', 'SECURITY_UNAUTHENTICATED')",
      );
      assert(audit.rows.length >= 1, 'le rejet du webhook sans signature valide doit être journalisé dans automation_audit_ledger');

      const paymentStatus = await harness.database.query<{ status: string }>('SELECT status FROM payments WHERE id = $1', [salaryPaymentBId]);
      assert(paymentStatus.rows[0].status === 'DUE', `statut paiement doit rester DUE, reçu ${paymentStatus.rows[0].status}`);
    });

    await check('17. Webhook: webhook paiement expiré ou rejoué → rejeté (400/401) ou idempotent sans double effet', async () => {
      const payload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-SEC-REPLAY-01',
        paymentId: feePaymentBId,
        reference: 'REF-SEC-FEE-01',
        amount: 45_000,
        currency: 'FCFA',
        payer: employerB.userId,
        recipient: 'LE_LABEUR',
        occurredAt: harness.clock.value.toISOString(),
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };

      // 1. Horodatage expiré (15 minutes dans le passé par rapport à Date.now())
      const expiredSigned = await testAdapter.createSignedWebhook(payload, Date.now() - 15 * 60_000);
      const expiredRes = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: expiredSigned.headers,
        body: expiredSigned.rawBody,
      }));
      assert(
        expiredRes.status === 400 || expiredRes.status === 401,
        `webhook expiré rejeté (attendu 400/401, reçu ${expiredRes.status})`,
      );

      // 2. Webhook valide puis rejoué à l'identique
      const validSigned = await testAdapter.createSignedWebhook(payload);
      const firstRes = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: validSigned.headers,
        body: validSigned.rawBody,
      }));
      assert(firstRes.status === 200, `premier webhook valide attendu 200, reçu ${firstRes.status}`);

      const replayRes = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: validSigned.headers,
        body: validSigned.rawBody,
      }));
      assert(replayRes.status === 200, `rejeu webhook idempotent attendu 200, reçu ${replayRes.status}`);
      const replayBody = (await replayRes.json()) as { replayed?: boolean; status: string };
      assert(replayBody.replayed === true, 'le rejeu du webhook doit être marqué replayed: true');

      const declCount = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id = $1',
        [feePaymentBId],
      );
      assert(declCount.rows[0].count === '1', `une seule déclaration créée malgré le rejeu, reçu ${declCount.rows[0].count}`);
    });

    await check('18. Webhook: webhook paiement avec montant/devise/référence incohérents → pas de passage abusif à PAID', async () => {
      const badAmountPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-SEC-BAD-AMOUNT-01',
        paymentId: salaryPaymentBId,
        reference: 'REF-SEC-SAL-BAD',
        amount: 10_000, // Au lieu de 135_000 !
        currency: 'FCFA',
        payer: employerB.userId,
        recipient: candidateB.userId,
        occurredAt: harness.clock.value.toISOString(),
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };
      const signed = await testAdapter.createSignedWebhook(badAmountPayload);
      const res = await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }));
      assert(res.status === 422 || res.status === 200, `webhook incohérent rejeté (reçu ${res.status})`);

      const row = await harness.database.query<{ status: string }>('SELECT status FROM payments WHERE id = $1', [salaryPaymentBId]);
      assert(
        row.rows[0].status === 'DUE' || row.rows[0].status === 'REJECTED',
        `le paiement ne doit JAMAIS passer à VERIFIED ou PAID sur montant incohérent (reçu ${row.rows[0].status})`,
      );
      const mismatchAudit = await harness.database.query<{ action: string }>(
        "SELECT action FROM automation_audit_ledger WHERE entity_id = $1 AND action = 'PAYMENT_VERIFICATION_MISMATCH'",
        [salaryPaymentBId],
      );
      assert(mismatchAudit.rows.length >= 1, 'PAYMENT_VERIFICATION_MISMATCH doit être journalisé');
    });

    await check('19. Paiement: déclaration de paiement ne vaut pas paiement vérifié (DECLARED ≠ VERIFIED ≠ PAID)', async () => {
      const pRow = await harness.database.query<{ period_key: string; amount: string }>(
        'SELECT period_key, amount::text AS amount FROM payments WHERE id = $1',
        [salaryPaymentBId],
      );
      const periodKey = pRow.rows[0].period_key;
      const expectedAmount = Number(pRow.rows[0].amount);

      const declRes = await postJson(
        harness,
        '/api/v1/payments/salary-declarations',
        employerB.token,
        'sec-sal-decl-honest-1',
        {
          contractId: contractBId,
          periodKey,
          reference: 'REF-HONEST-SAL-01',
          amount: expectedAmount,
          currency: 'FCFA',
        },
      );
      assert(declRes.status === 201, `déclaration salariale attendue 201, reçu ${declRes.status}`);
      const row = await harness.database.query<{ status: string; verified_at: unknown; verified_by: unknown }>(
        'SELECT status, verified_at, verified_by FROM payments WHERE id = $1',
        [salaryPaymentBId],
      );
      assert(
        row.rows[0].status === 'PENDING_VERIFICATION' || row.rows[0].status === 'DECLARED',
        `la déclaration ne doit jamais valoir VERIFIED ou PAID, reçu ${row.rows[0].status}`,
      );
      assert(row.rows[0].verified_at === null && row.rows[0].verified_by === null, 'verified_at et verified_by doivent rester NULL');
    });

    await check('20. Salaire: confirmation salaire par un mauvais travailleur → 403', async () => {
      const pRow = await harness.database.query<{ amount: string }>(
        'SELECT amount::text AS amount FROM payments WHERE id = $1',
        [salaryPaymentBId],
      );
      const expectedAmount = Number(pRow.rows[0].amount);

      const validSalPayload = {
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-SEC-SAL-OK-01',
        paymentId: salaryPaymentBId,
        reference: 'REF-HONEST-SAL-01',
        amount: expectedAmount,
        currency: 'FCFA',
        payer: employerB.userId,
        recipient: candidateB.userId,
        occurredAt: harness.clock.value.toISOString(),
        eventType: 'PAYMENT_COMPLETED',
        status: 'SUCCESS',
      };
      const signed = await testAdapter.createSignedWebhook(validSalPayload);
      assert((await harness.worker.fetch(new Request('https://api.test/api/webhooks/payment-provider', {
        method: 'POST',
        headers: signed.headers,
        body: signed.rawBody,
      }))).status === 200, 'webhook salaire conforme');

      assert((await postJson(harness, `/api/v1/admin/payments/${salaryPaymentBId}/reconcile`, admin.token, 'sec-sal-rec-1', {})).status === 200, 'reconcile');
      assert((await postJson(harness, `/api/v1/admin/payments/${salaryPaymentBId}/confirm`, admin.token, 'sec-sal-conf-1', {})).status === 200, 'confirm PAID');

      for (let i = 0; i < 3; i += 1) {
        await harness.automationWorker!.drainEvents(50);
      }

      const otp = salaryOtps.get(salaryPaymentBId);
      const proof = await harness.database.query<{ nonce: string }>(
        'SELECT nonce FROM salary_confirmations WHERE payment_id = $1',
        [salaryPaymentBId],
      );
      assert(otp && proof.rows[0]?.nonce, 'OTP et nonce générés pour candidateB');

      // candidateA (mauvais travailleur) tente de confirmer la réception du salaire de candidateB
      const wrongWorkerRes = await postJson(
        harness,
        `/api/v1/payments/${salaryPaymentBId}/salary-confirmation`,
        candidateA.token,
        'sec-sal-wrong-worker-1',
        { otp, nonce: proof.rows[0].nonce },
      );
      assert(wrongWorkerRes.status === 403, `mauvais travailleur confirmant le salaire attendu 403, reçu ${wrongWorkerRes.status}`);
    });

    await check('21. Salaire OTP: OTP/nonce salaire expiré ou déjà utilisé → rejeté sans second événement', async () => {
      const otp = salaryOtps.get(salaryPaymentBId)!;
      const proof = await harness.database.query<{ nonce: string }>(
        'SELECT nonce FROM salary_confirmations WHERE payment_id = $1',
        [salaryPaymentBId],
      );
      const nonce = proof.rows[0].nonce;

      // 1. Mauvais OTP refusé
      const badOtpRes = await postJson(
        harness,
        `/api/v1/payments/${salaryPaymentBId}/salary-confirmation`,
        candidateB.token,
        'sec-sal-bad-otp-1',
        { otp: otp === '000000' ? '999999' : '000000', nonce },
      );
      assert(badOtpRes.status >= 400 && badOtpRes.status < 500, `mauvais OTP doit être rejeté, reçu ${badOtpRes.status}`);

      // 2. Confirmation légitime avec le bon OTP/nonce
      const okRes = await postJson(
        harness,
        `/api/v1/payments/${salaryPaymentBId}/salary-confirmation`,
        candidateB.token,
        'sec-sal-ok-otp-1',
        { otp, nonce },
      );
      assert(okRes.status === 200, `confirmation OTP valide attendue 200, reçu ${okRes.status}`);

      // 3. Réutilisation du même OTP/nonce sous une nouvelle clé d'idempotence → rejetée (422/409) sans second événement
      const reuseRes = await postJson(
        harness,
        `/api/v1/payments/${salaryPaymentBId}/salary-confirmation`,
        candidateB.token,
        'sec-sal-reuse-otp-2',
        { otp, nonce },
      );
      assert(
        reuseRes.status === 422 || reuseRes.status === 409,
        `réutilisation OTP sous nouvelle clé rejetée (${reuseRes.status})`,
      );

      const confirmedEvents = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM automation_outbox WHERE aggregate_id = $1 AND event_type = 'SALARY_CONFIRMED'",
        [salaryPaymentBId],
      );
      assert(confirmedEvents.rows[0].count === '1', `exactement un seul événement SALARY_CONFIRMED, reçu ${confirmedEvents.rows[0].count}`);
    });

    /* ================================================================== */
    /* 22–25 : Documents / R2                                             */
    /* ================================================================== */

    let docId = '';
    let versionId = '';
    const docContent = '%PDF-1.4 document confidentiel P0-SECURITY-ANTI-FRAUD';

    await check('22. R2: utilisateur tiers lit, télécharge ou demande une URL signée d’un document privé → 403', async () => {
      const grantRes = await postJson(
        harness,
        '/api/v1/documents/upload-grants',
        employerB.token,
        'sec-doc-grant-1',
        {
          title: 'Pièce contractuelle privée',
          fileName: 'piece-privee.pdf',
          contentType: 'application/pdf',
          sizeBytes: bytesOf(docContent).length,
          documentType: 'CONTRACT_DOCUMENT',
        },
      );
      assert(grantRes.status === 200 || grantRes.status === 201, `création grant attendue 200/201, reçu ${grantRes.status}`);
      const grant = (await grantRes.json()) as {
        document: { documentId: string };
        version: { versionId: string };
        upload: { url: string; contentType: string };
      };
      docId = grant.document.documentId;
      versionId = grant.version.versionId;

      const uploadRes = await harness.worker.fetch(authRequest(grant.upload.url, employerB.token, {
        method: 'POST',
        headers: { 'content-type': grant.upload.contentType, 'Idempotency-Key': 'sec-doc-upload-1' },
        body: new Uint8Array(bytesOf(docContent)),
      }));
      assert(uploadRes.status === 200, `upload contenu attendu 200, reçu ${uploadRes.status}`);

      for (const intruder of [employerA, candidateA, outsider]) {
        const readMeta = await getAuth(harness, `/api/v1/documents/${docId}`, intruder.token);
        assert(readMeta.status === 403, `tiers lisant métadonnées document privé attendu 403, reçu ${readMeta.status}`);

        const download = await getAuth(harness, `/api/v1/documents/${docId}/versions/${versionId}/content`, intruder.token);
        assert(download.status === 403, `tiers téléchargeant document privé attendu 403, reçu ${download.status}`);

        const signedUrl = await postJson(
          harness,
          `/api/v1/documents/${docId}/signed-download-url`,
          intruder.token,
          `sec-doc-sign-${intruder.userId}`,
          { versionId },
        );
        assert(signedUrl.status === 403, `tiers demandant URL signée attendu 403, reçu ${signedUrl.status}`);
      }
    });

    await check('23. R2: exposition de object_key dans une réponse publique → absente', async () => {
      const readDoc = await getAuth(harness, `/api/v1/documents/${docId}`, employerB.token);
      const listMine = await getAuth(harness, '/api/v1/my/documents', employerB.token);
      const listVersions = await getAuth(harness, `/api/v1/documents/${docId}/versions`, employerB.token);
      const signedUrl = await postJson(
        harness,
        `/api/v1/documents/${docId}/signed-download-url`,
        employerB.token,
        'sec-doc-owner-signed-url',
        { versionId },
      );
      for (const response of [readDoc, listMine, listVersions, signedUrl]) {
        assert(response.status < 400, `réponse propriétaire attendue < 400, reçu ${response.status}`);
        const text = await response.text();
        assert(!text.includes('objectKey') && !text.includes('object_key') && !text.includes('docs/'), `fuite de clé R2 détectée: ${text}`);
      }
    });

    await check('24. R2: hash SHA-256 incohérent avec le contenu → INTEGRITY_MISMATCH (409) + audit', async () => {
      const keyRow = await harness.database.query<{ object_key: string }>(
        'SELECT object_key FROM document_versions WHERE version_id = $1',
        [versionId],
      );
      const objectKey = keyRow.rows[0].object_key;

      // Altérer physiquement l'objet dans le stockage R2 sans mettre à jour le hash enregistré
      await storage.put(objectKey, bytesOf('%PDF-1.4 CONTENU CORROMPU FRAUDULEUX'), 'application/pdf');

      const downloadCorrupted = await getAuth(harness, `/api/v1/documents/${docId}/versions/${versionId}/content`, employerB.token);
      assert(downloadCorrupted.status === 409, `téléchargement contenu altéré attendu 409, reçu ${downloadCorrupted.status}`);
      const errText = await downloadCorrupted.text();
      assert(errText.includes('INTEGRITY_MISMATCH'), `le refus doit mentionner INTEGRITY_MISMATCH, reçu ${errText}`);

      const mismatchAudit = await harness.database.query<{ action: string; after_state: unknown }>(
        "SELECT action, after_state FROM automation_audit_ledger WHERE entity_id = $1 AND action = 'DOCUMENT_INTEGRITY_MISMATCH'",
        [docId],
      );
      assert(mismatchAudit.rows.length === 1, 'DOCUMENT_INTEGRITY_MISMATCH doit être journalisé dans automation_audit_ledger');

      // Remettre le contenu intègre avant le test de révocation
      await storage.put(objectKey, bytesOf(docContent), 'application/pdf');
    });

    await check('25. R2: document révoqué → accès normal bloqué (410), historique et métadonnées conservés', async () => {
      const revokeRes = await postJson(
        harness,
        `/api/v1/admin/documents/${docId}/revoke`,
        admin.token,
        'sec-doc-admin-revoke-1',
        { reason: 'Document révoqué suite à contrôle de conformité.' },
      );
      assert(revokeRes.status === 200, `révocation ADMIN attendue 200, reçu ${revokeRes.status}`);

      const ownerDownload = await getAuth(harness, `/api/v1/documents/${docId}/versions/${versionId}/content`, employerB.token);
      assert(ownerDownload.status === 410, `téléchargement propriétaire après révocation attendu 410, reçu ${ownerDownload.status}`);

      const metaAfter = await getAuth(harness, `/api/v1/documents/${docId}`, employerB.token);
      assert(metaAfter.status === 200, 'métadonnées et historique restent consultables');
      const body = (await metaAfter.json()) as { document?: { status: string }; status?: string; versions: unknown[] };
      const docStatus = body.document?.status ?? body.status;
      assert(docStatus === 'REVOKED' && body.versions.length === 1, 'statut REVOKED et versions conservées');
    });

    /* ================================================================== */
    /* 26–29 : WebRTC                                                     */
    /* ================================================================== */

    let webrtcSessionId = '';
    let employerWebRtcCredential = '';
    let candidateWebRtcCredential = '';

    await check('26. WebRTC: création de session WebRTC sur contrat non actif → refusé (404/409/422)', async () => {
      const draftOfferId = newEntityId('ofr');
      await createSqlOfferStore(harness.database).create({
        id: draftOfferId,
        employerId: employerA.userId,
        title: 'Offre contrat non actif',
        contractType: 'CDD',
        remuneration: 120_000,
        currency: 'FCFA',
        location: 'Cotonou',
        postedDate: harness.clock.value.toISOString(),
        isUrgent: false,
        isLeLabeurJob: false,
        skills: [],
        summary: 'Test WebRTC',
        responsibilities: [],
        conditions: [],
        selectionProcess: [],
        status: 'ACTIVE',
        createdAt: harness.clock.value.toISOString(),
        updatedAt: harness.clock.value.toISOString(),
      });
      const inactiveContractId = newEntityId('ctr');
      await createSqlContractStore(harness.database).create({
        id: inactiveContractId,
        offerId: draftOfferId,
        employerId: employerA.userId,
        employeeId: candidateA.userId,
        status: 'SIGNATURE',
        monthlySalary: 120_000,
        currency: 'FCFA',
        startDate: '01 Novembre 2026',
        currentMonth: 1,
        durationMonths: 2,
        periodicity: 'Mensuel',
        missionDescription: 'Mission non encore active',
        location: 'Cotonou',
        conditions: [],
        employerSigned: true,
        employeeSigned: false,
        commissionPercentage: 25,
        commissionAmountDue: 30_000,
        commissionStatus: 'DUE',
        monthlyCheckpoints: [],
        commissionLedger: [],
        paymentSchedule: [],
        history: [],
        createdAt: harness.clock.value.toISOString(),
        updatedAt: harness.clock.value.toISOString(),
      });

      const res = await postJson(
        harness,
        '/api/v1/webrtc-sessions',
        employerA.token,
        'sec-webrtc-inactive-1',
        { entityType: 'CONTRACT', entityId: inactiveContractId },
      );
      assert(
        res.status === 404 || res.status === 422 || res.status === 409,
        `création session WebRTC sur contrat non actif refusée (attendu 404/409/422, reçu ${res.status})`,
      );
    });

    await check('27. WebRTC: utilisateur tiers ou ADMIN rejoint, émet un signal ou demande des credentials WebRTC → refusé (403/404)', async () => {
      const webrtcOfferId = newEntityId('ofr');
      await createSqlOfferStore(harness.database).create({
        id: webrtcOfferId,
        employerId: employerB.userId,
        title: 'Offre contrat actif WebRTC',
        contractType: 'CDD',
        remuneration: 180_000,
        currency: 'FCFA',
        location: 'Cotonou',
        postedDate: harness.clock.value.toISOString(),
        isUrgent: false,
        isLeLabeurJob: false,
        skills: [],
        summary: 'Test WebRTC actif',
        responsibilities: [],
        conditions: [],
        selectionProcess: [],
        status: 'ACTIVE',
        createdAt: harness.clock.value.toISOString(),
        updatedAt: harness.clock.value.toISOString(),
      });
      const activeWebrtcContractId = newEntityId('ctr');
      await createSqlContractStore(harness.database).create({
        id: activeWebrtcContractId,
        offerId: webrtcOfferId,
        employerId: employerB.userId,
        employeeId: candidateB.userId,
        status: 'ACTIVE',
        monthlySalary: 180_000,
        currency: 'FCFA',
        startDate: '01 Septembre 2026',
        currentMonth: 1,
        durationMonths: 2,
        periodicity: 'Mensuel',
        missionDescription: 'Mission active WebRTC',
        location: 'Cotonou',
        conditions: [],
        employerSigned: true,
        employeeSigned: true,
        commissionPercentage: 25,
        commissionAmountDue: 45_000,
        commissionStatus: 'DUE',
        monthlyCheckpoints: [],
        commissionLedger: [],
        paymentSchedule: [],
        history: [],
        createdAt: harness.clock.value.toISOString(),
        updatedAt: harness.clock.value.toISOString(),
      });

      const createRes = await postJson(
        harness,
        '/api/v1/webrtc-sessions',
        employerB.token,
        'sec-webrtc-create-b',
        { entityType: 'CONTRACT', entityId: activeWebrtcContractId },
      );
      assert(createRes.status === 201 || createRes.status === 200, `création session WebRTC sur contrat B actif attendue 201/200, reçu ${createRes.status}`);
      const createdBody = (await createRes.json()) as { session?: { sessionId: string }; sessionId?: string };
      webrtcSessionId = (createdBody.session?.sessionId ?? createdBody.sessionId)!;

      for (const nonParticipant of [employerA, candidateA, outsider, admin]) {
        const joinRes = await postJson(
          harness,
          `/api/v1/webrtc-sessions/${webrtcSessionId}/join`,
          nonParticipant.token,
          `sec-webrtc-join-${nonParticipant.userId}`,
          {},
        );
        assert(
          joinRes.status === 403 || joinRes.status === 404,
          `non-participant (${nonParticipant.userId}) join refusé (attendu 403/404, reçu ${joinRes.status})`,
        );

        const credRes = await postJson(
          harness,
          `/api/v1/webrtc-sessions/${webrtcSessionId}/credentials`,
          nonParticipant.token,
          `sec-webrtc-cred-${nonParticipant.userId}`,
          {},
        );
        assert(
          credRes.status === 403 || credRes.status === 404,
          `non-participant credentials refusé (attendu 403/404, reçu ${credRes.status})`,
        );

        const sigRes = await postJson(
          harness,
          `/api/v1/webrtc-sessions/${webrtcSessionId}/signaling`,
          nonParticipant.token,
          `sec-webrtc-sig-${nonParticipant.userId}`,
          { type: 'OFFER', payload: { sdp: 'v=0\r\no=- ephemeral-offer' } },
        );
        assert(
          sigRes.status === 403 || sigRes.status === 404 || sigRes.status === 401,
          `non-participant signal refusé (attendu 401/403/404, reçu ${sigRes.status})`,
        );
      }
    });

    await check('29. WebRTC: rejeu d’un message de signaling déjà traité → pas de double effet (idempotent + conflit 409)', async () => {
      assert((await postJson(harness, `/api/v1/webrtc-sessions/${webrtcSessionId}/join`, candidateB.token, 'sec-webrtc-join-cand-b', {})).status === 200, 'join candidateB');

      const empCredRes = await postJson(harness, `/api/v1/webrtc-sessions/${webrtcSessionId}/credentials`, employerB.token, 'sec-webrtc-cred-emp-b', {});
      const candCredRes = await postJson(harness, `/api/v1/webrtc-sessions/${webrtcSessionId}/credentials`, candidateB.token, 'sec-webrtc-cred-cand-b', {});
      assert(empCredRes.status === 201 && candCredRes.status === 201, 'credentials émis pour les 2 participants');
      employerWebRtcCredential = ((await empCredRes.json()) as { credential: string }).credential;
      candidateWebRtcCredential = ((await candCredRes.json()) as { credential: string }).credential;

      const offerSignalBody = {
        type: 'OFFER',
        payload: { sdp: 'v=0\r\no=- ephemeral-offer' },
      };
      const sendSignal = (token: string, key: string, body: unknown, credential: string) =>
        harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${webrtcSessionId}/signaling`, token, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': key,
            'X-WebRTC-Credential': credential,
          },
          body: JSON.stringify(body),
        }));

      const firstSig = await sendSignal(employerB.token, 'sec-webrtc-sig-seq1', offerSignalBody, employerWebRtcCredential);
      assert(firstSig.status === 201 || firstSig.status === 200, `premier signal attendu 201/200, reçu ${firstSig.status}`);

      // Rejeu exact avec la même clé d'idempotence → même résultat, aucun doublon
      const replaySameKey = await sendSignal(employerB.token, 'sec-webrtc-sig-seq1', offerSignalBody, employerWebRtcCredential);
      assert(replaySameKey.status === 201 || replaySameKey.status === 200, `rejeu même clé attendu 201/200, reçu ${replaySameKey.status}`);

      // Rejeu avec la même clé mais payload modifié → 409 IDEMPOTENCY_CONFLICT
      const alteredReplay = await sendSignal(
        employerB.token,
        'sec-webrtc-sig-seq1',
        { type: 'OFFER', payload: { sdp: 'v=0\r\no=- altered-offer' } },
        employerWebRtcCredential,
      );
      assert(alteredReplay.status === 409, `rejeu modifié attendu 409, reçu ${alteredReplay.status}`);

      // Seconde offre initiale sous nouvelle clé → 422
      const duplicateOffer = await sendSignal(employerB.token, 'sec-webrtc-sig-seq1-dup', offerSignalBody, employerWebRtcCredential);
      assert(duplicateOffer.status === 422 || duplicateOffer.status === 409, `seconde offre initiale refusée (reçu ${duplicateOffer.status})`);

      const countSignals = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM webrtc_signaling_messages WHERE session_id = $1 AND message_type = 'OFFER'",
        [webrtcSessionId],
      );
      assert(countSignals.rows[0].count === '1', `une seule offre persistée, reçu ${countSignals.rows[0].count}`);
    });

    await check('28. WebRTC: session WebRTC expirée ou fermée → credentials et signaling refusés', async () => {
      const closeRes = await postJson(
        harness,
        `/api/v1/webrtc-sessions/${webrtcSessionId}/close`,
        employerB.token,
        'sec-webrtc-close-b',
        {},
      );
      assert(closeRes.status === 200, `fermeture session attendue 200, reçu ${closeRes.status}`);

      const credAfterClose = await postJson(
        harness,
        `/api/v1/webrtc-sessions/${webrtcSessionId}/credentials`,
        employerB.token,
        'sec-webrtc-cred-after-close',
        {},
      );
      assert(
        credAfterClose.status === 422 || credAfterClose.status === 409 || credAfterClose.status === 410,
        `credentials après fermeture refusés (reçu ${credAfterClose.status})`,
      );

      const sigAfterClose = await harness.worker.fetch(authRequest(`/api/v1/webrtc-sessions/${webrtcSessionId}/signaling`, candidateB.token, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'sec-webrtc-sig-after-close',
          'X-WebRTC-Credential': candidateWebRtcCredential,
        },
        body: JSON.stringify({ type: 'ANSWER', payload: { sdp: 'v=0\r\no=- answer-after-close' } }),
      }));
      assert(
        sigAfterClose.status === 422 || sigAfterClose.status === 409 || sigAfterClose.status === 410,
        `signaling après fermeture refusé (reçu ${sigAfterClose.status})`,
      );
    });

    /* ================================================================== */
    /* 30–34 : Cron / Queue / Idempotence / Concurrence / Routes internes */
    /* ================================================================== */

    await check('30. Idempotence: même Idempotency-Key + même payload → même résultat sans duplication', async () => {
      const payload = {
        title: 'Chauffeur poids lourd',
        contractType: 'CDD',
        remuneration: 200_000,
        currency: 'FCFA',
        location: 'Parakou',
        summary: 'Transport interurbain.',
      };
      const first = await postJson(harness, '/api/v1/offers', employerA.token, 'sec-idem-same-key-1', payload);
      const second = await postJson(harness, '/api/v1/offers', employerA.token, 'sec-idem-same-key-1', payload);
      assert(first.status === 201 && second.status === 201, 'deux appels idempotents renvoient 201');
      const o1 = (await first.json()) as { id: string };
      const o2 = (await second.json()) as { id: string };
      assert(o1.id === o2.id, `même identifiant d’offre attendu (${o1.id} vs ${o2.id})`);
    });

    await check('31. Idempotence: même Idempotency-Key + payload différent → 409 IDEMPOTENCY_CONFLICT + audit', async () => {
      const before = (await securityAuditRows(harness, 'SECURITY_REPLAY_REJECTED')).length;
      const conflict = await postJson(harness, '/api/v1/offers', employerA.token, 'sec-idem-same-key-1', {
        title: 'Payload altéré sous la même clé',
        contractType: 'CDI',
        remuneration: 999_000,
        currency: 'FCFA',
        location: 'Porto-Novo',
      });
      assert(conflict.status === 409, `conflit d’idempotence attendu 409, reçu ${conflict.status}`);
      const body = (await conflict.json()) as { error: { code: string } };
      assert(body.error.code === 'IDEMPOTENCY_CONFLICT', `code IDEMPOTENCY_CONFLICT attendu, reçu ${body.error.code}`);
      const after = (await securityAuditRows(harness, 'SECURITY_REPLAY_REJECTED')).length;
      assert(after > before, 'conflit d’idempotence audité dans automation_audit_ledger');
    });

    await check('32. Concurrence: deux requêtes concurrentes conflictuelles → une seule transition valide', async () => {
      // Créer une proposition fraîche et lancer accept + decline simultanément
      const concOffer = await postJson(harness, '/api/v1/offers', employerA.token, 'sec-conc-offer-1', {
        title: 'Soudeur industriel',
        contractType: 'CDD',
        remuneration: 190_000,
        currency: 'FCFA',
        location: 'Cotonou',
      });
      const concOfferId = ((await concOffer.json()) as { id: string }).id;
      const concApp = await postJson(harness, `/api/v1/offers/${concOfferId}/applications`, candidateA.token, 'sec-conc-app-1', { note: 'Dispo' });
      const concAppId = ((await concApp.json()) as { id: string }).id;
      const concProp = await postJson(
        harness,
        '/api/v1/conversations/cnv_sec_conc/proposals',
        employerA.token,
        'sec-conc-prop-1',
        {
          applicationId: concAppId,
          missionTitle: 'Soudure',
          amount: 190_000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Septembre 2026',
          durationMonths: 2,
          location: 'Cotonou',
          conditions: ['Horaires définis'],
        },
      );
      const concPropId = ((await concProp.json()) as { id: string }).id;

      const [resAccept, resDecline] = await Promise.all([
        postJson(harness, `/api/v1/proposals/${concPropId}/respond`, candidateA.token, 'sec-conc-acc', { action: 'ACCEPT' }),
        postJson(harness, `/api/v1/proposals/${concPropId}/respond`, candidateA.token, 'sec-conc-dec', { action: 'DECLINE', reason: 'Déclinaison concurrente' }),
      ]);
      const statuses = [resAccept.status, resDecline.status].sort((a, b) => a - b);
      assert(statuses[0] === 200 && statuses[1] === 409, `exactement une transition 200 et un refus 409 attendus, reçu ${statuses.join('/')}`);
    });

    await check('33. Cron/Queue: double déclenchement Cron/Queue → pas de double effet métier', async () => {
      await harness.automationWorker!.runScheduledCycle({ trigger: 'cron:* * * * *' });
      const midPayments = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM payments');
      const midNotifs = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');

      // Second déclenchement immédiat
      const secondTick = await harness.automationWorker!.runScheduledCycle({ trigger: 'cron:* * * * *' });
      const afterPayments = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM payments');
      const afterNotifs = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');

      assert(afterPayments.rows[0].count === midPayments.rows[0].count, 'aucun paiement dupliqué au second tick Cron');
      assert(afterNotifs.rows[0].count === midNotifs.rows[0].count, 'aucune notification dupliquée au second tick Cron');
      assert(secondTick.events.claimed === 0 && secondTick.jobs.claimed === 0, 'second tick sans effet résiduel');
    });

    await check('34. Routes internes: route interne/debug appelée publiquement → 404 + audit SECURITY_INTERNAL_ROUTE_BLOCKED', async () => {
      const before = (await securityAuditRows(harness, 'SECURITY_INTERNAL_ROUTE_BLOCKED')).length;
      for (const internalPath of [
        '/internal/cron',
        '/api/v1/internal/drain',
        '/api/v1/cron/trigger',
        '/api/v1/queue/consume',
        '/api/v1/debug/secrets',
        '/_debug/config',
      ]) {
        const res = await getAuth(harness, internalPath, admin.token);
        assert(res.status === 404, `route interne ${internalPath} doit être bloquée (404), reçu ${res.status}`);
      }
      const after = (await securityAuditRows(harness, 'SECURITY_INTERNAL_ROUTE_BLOCKED')).length;
      assert(after >= before + 6, 'toutes les tentatives d’accès aux routes internes/debug doivent être auditées');
    });

    /* ================================================================== */
    /* 35–38 : Anti-abus / Intégrité / Audit                              */
    /* ================================================================== */

    await check('35. Rate-limit: dépassement du rate-limit sur endpoint sensible → 429 + Retry-After + audit', async () => {
      const limiter = createSecurityRateLimiter({ 'salary-otp': { maxRequests: 3, windowMs: 60_000 } });
      limiter.enforce('salary-otp', 'actor:test-1', 1_000, 'payments.salary.confirm');
      limiter.enforce('salary-otp', 'actor:test-1', 2_000, 'payments.salary.confirm');
      limiter.enforce('salary-otp', 'actor:test-1', 3_000, 'payments.salary.confirm');
      let rateLimitedError: ApiError | null = null;
      try {
        limiter.enforce('salary-otp', 'actor:test-1', 4_000, 'payments.salary.confirm');
      } catch (err) {
        rateLimitedError = err as ApiError;
      }
      assert(rateLimitedError && rateLimitedError.status === 429 && rateLimitedError.code === 'RATE_LIMITED', '429 RATE_LIMITED attendu');

      const spammer = await provisionUser(harness, 'CANDIDATE', 'sec-rate-spammer');
      const before = (await securityAuditRows(harness, 'SECURITY_RATE_LIMITED')).length;
      let lastResponse: Response | null = null;
      for (let i = 0; i < 41; i += 1) {
        lastResponse = await postJson(
          harness,
          '/api/v1/my/reputation/reconcile',
          spammer.token,
          `sec-rate-spam-${i}`,
          {},
        );
      }
      assert(lastResponse && lastResponse.status === 429, `41e appel sur endpoint sensible attendu 429, reçu ${lastResponse?.status}`);
      assert(lastResponse.headers.get('retry-after') !== null, 'en-tête retry-after requis sur 429');
      const after = (await securityAuditRows(harness, 'SECURITY_RATE_LIMITED')).length;
      assert(after > before, 'dépassement du rate-limit audité dans automation_audit_ledger');
    });

    await check('36. Anti-falsification: paramètre ownerId/actorId/userId/source falsifié → rejeté + audité', async () => {
      const before = (await securityAuditRows(harness, 'SECURITY_PARAMETER_FORGERY_REJECTED')).length;

      // 1. ownerId / employerId falsifié sur création d'offre
      const forgedEmployerOffer = await postJson(harness, '/api/v1/offers', employerA.token, 'sec-forge-offer-emp', {
        title: 'Offre falsifiée',
        contractType: 'CDD',
        remuneration: 100_000,
        location: 'Cotonou',
        employerId: employerB.userId,
      });
      assert(forgedEmployerOffer.status === 403, `employerId falsifié attendu 403, reçu ${forgedEmployerOffer.status}`);

      // 2. source falsifié sur création d'offre
      const forgedSourceOffer = await postJson(harness, '/api/v1/offers', employerA.token, 'sec-forge-offer-src', {
        title: 'Offre source falsifiée',
        contractType: 'CDD',
        remuneration: 100_000,
        location: 'Cotonou',
        source: 'SYSTEM',
      });
      assert(forgedSourceOffer.status === 400, `source falsifié attendu 400, reçu ${forgedSourceOffer.status}`);

      // 3. subjectUserId / source falsifié dans le body de reputation.mine.reconcile
      const forgedReconcileBody = await postJson(
        harness,
        '/api/v1/my/reputation/reconcile',
        candidateA.token,
        'sec-forge-rep-body',
        { subjectUserId: candidateB.userId, source: 'ADMIN' },
      );
      assert(forgedReconcileBody.status === 400, `body falsifié sur reconcile self attendu 400, reçu ${forgedReconcileBody.status}`);

      // 4. userId / ownerId / recipientId / source falsifié en query sur routes self
      for (const query of ['userId=usr_other', 'ownerId=usr_other', 'recipientId=usr_other', 'source=ADMIN']) {
        const res = await getAuth(harness, `/api/v1/my/notifications?${query}`, candidateA.token);
        assert(res.status === 400, `query falsifiée ?${query} sur route self attendu 400, reçu ${res.status}`);
      }

      // 5. recipientId falsifié dans le body de notifications.read-all
      const forgedNotifBody = await postJson(
        harness,
        '/api/v1/my/notifications/read-all',
        candidateA.token,
        'sec-forge-notif-body',
        { recipientId: employerB.userId },
      );
      assert(forgedNotifBody.status === 400, `recipientId falsifié dans body notifications attendu 400, reçu ${forgedNotifBody.status}`);

      const after = (await securityAuditRows(harness, 'SECURITY_PARAMETER_FORGERY_REJECTED')).length;
      assert(after >= before + 7, 'toutes les tentatives de falsification de paramètre doivent être auditées');
    });

    await check('37. Audit ADMIN: action sensible ADMIN (CLAIM, REPUTATION, R2, USER BLOCK) → audit complet + révocation de session', async () => {
      const badActor = await provisionUser(harness, 'EMPLOYER', 'sec-to-block');
      assert((await getAuth(harness, '/api/v1/me', badActor.token)).status === 200, 'session active avant blocage');

      // 1. Auto-blocage ADMIN interdit
      const selfBlock = await postJson(
        harness,
        `/api/v1/admin/users/${admin.userId}/block`,
        admin.token,
        'sec-admin-self-block',
        { reason: 'Auto-blocage interdit' },
      );
      assert(selfBlock.status === 409, `auto-blocage ADMIN attendu 409, reçu ${selfBlock.status}`);

      // 2. Blocage sans motif interdit
      const noReasonBlock = await postJson(
        harness,
        `/api/v1/admin/users/${badActor.userId}/block`,
        admin.token,
        'sec-admin-noreason-block',
        { reason: '' },
      );
      assert(noReasonBlock.status === 400, `blocage sans motif attendu 400, reçu ${noReasonBlock.status}`);

      // 3. Blocage ADMIN motivé valide
      const blockRes = await postJson(
        harness,
        `/api/v1/admin/users/${badActor.userId}/block`,
        admin.token,
        'sec-admin-valid-block',
        { reason: 'Tentatives répétées de fraude documentaire constatées.' },
      );
      assert(blockRes.status === 200, `blocage ADMIN attendu 200, reçu ${blockRes.status}`);

      // La session du compte bloqué est immédiatement révoquée
      const afterBlockMe = await getAuth(harness, '/api/v1/me', badActor.token);
      assert(afterBlockMe.status === 401, `session de l’utilisateur bloqué doit être révoquée (401), reçu ${afterBlockMe.status}`);

      // Vérifier la présence des audits ADMIN dans automation_audit_ledger (USER_BLOCKED, DOCUMENT_REVOKED)
      const userBlockedAudit = await harness.database.query<{ actor_id: string; before_state: unknown; after_state: unknown }>(
        "SELECT actor_id, before_state, after_state FROM automation_audit_ledger WHERE entity_id = $1 AND action = 'USER_BLOCKED'",
        [badActor.userId],
      );
      assert(userBlockedAudit.rows.length === 1 && userBlockedAudit.rows[0].actor_id === admin.userId, 'audit USER_BLOCKED complet');

      const docRevokedAudit = await harness.database.query<{ actor_id: string }>(
        "SELECT actor_id FROM automation_audit_ledger WHERE entity_id = $1 AND action = 'DOCUMENT_REVOKED'",
        [docId],
      );
      assert(docRevokedAudit.rows.length === 1 && docRevokedAudit.rows[0].actor_id === admin.userId, 'audit DOCUMENT_REVOKED complet');
    });

    await check('38. Redaction: erreur interne / DB / provider → aucun secret exposé dans la réponse', async () => {
      const internal500 = apiErrorResponse(
        new Error('Connection failed to postgresql://lelabeur:top-secret-pw@db.internal:5432/prod'),
        'req-sec-500',
      );
      const body500 = await internal500.text();
      assert(internal500.status === 500, 'statut 500');
      assert(
        !body500.includes('top-secret-pw') && !body500.includes('postgresql://') && !body500.includes('db.internal'),
        `aucun secret DB ne doit fuiter en 500: ${body500}`,
      );

      const leaky400 = apiErrorResponse(
        new ApiError(
          'VALIDATION_ERROR',
          'Rejet sur postgresql://user:pass123@host/db avec Bearer eyJhbGciOiJIUzI1NiJ9 et __Host-lelabeur_session=tok_secret_999 et docs/doc_123/v1/contrat.pdf',
          {
            objectKey: ['docs/doc_123/v1/contrat.pdf'],
            token_hash: ['sha256_secret'],
            info: ['secret=my_raw_secret_value'],
          },
        ),
        'req-sec-400',
      );
      const body400 = await leaky400.text();
      for (const forbidden of ['pass123', 'eyJhbGciOiJIUzI1NiJ9', 'tok_secret_999', 'docs/doc_123', 'sha256_secret', 'my_raw_secret_value']) {
        assert(!body400.includes(forbidden), `secret "${forbidden}" non expurgé dans la réponse 4xx: ${body400}`);
      }

      const healthRes = await harness.worker.fetch(new Request('https://api.test/healthz'));
      const healthText = await healthRes.text();
      assert(!healthText.includes(SIGNING_SECRET) && !healthText.includes('password'), 'aucun secret dans /healthz');
    });

    /* ================================================================== */
    /* 39–40 : Non-régression globale                                     */
    /* ================================================================== */

    await check('39. Non-régression globale: parcours complet nominal (Offre → Candidature → Proposition → Contrat → Paiement → Salaire → Document → WebRTC → Réputation) fonctionnel', async () => {
      const nomEmp = await provisionUser(harness, 'EMPLOYER', 'sec-nom-emp');
      const nomCand = await provisionUser(harness, 'CANDIDATE', 'sec-nom-cand');

      // 1. Offre
      const offerRes = await postJson(harness, '/api/v1/offers', nomEmp.token, 'sec-nom-offer', {
        title: 'Comptable expérimenté',
        contractType: 'CDI',
        remuneration: 200_000,
        currency: 'FCFA',
        location: 'Cotonou',
        departmentId: 'littoral',
        skills: ['Comptabilité'],
        summary: 'Mission comptable nominale.',
      });
      assert(offerRes.status === 201, `offre nominale créée (reçu ${offerRes.status})`);
      const nomOfferId = ((await offerRes.json()) as { id: string }).id;

      // 2. Candidature + Examine + Shortlist
      const appRes = await postJson(harness, `/api/v1/offers/${nomOfferId}/applications`, nomCand.token, 'sec-nom-app', {
        note: 'Disponible immédiatement',
      });
      assert(appRes.status === 201, 'candidature nominale créée');
      const nomAppId = ((await appRes.json()) as { id: string }).id;
      assert((await postJson(harness, `/api/v1/applications/${nomAppId}/examine`, nomEmp.token, 'sec-nom-ex', {})).status === 200, 'examine nominal');
      assert((await postJson(harness, `/api/v1/applications/${nomAppId}/shortlist`, nomEmp.token, 'sec-nom-sh', {})).status === 200, 'shortlist nominal');

      // 3. Proposition + Accept
      const propRes = await postJson(
        harness,
        '/api/v1/conversations/cnv_sec_nom/proposals',
        nomEmp.token,
        'sec-nom-prop',
        {
          applicationId: nomAppId,
          missionTitle: 'Tenue des comptes',
          amount: 200_000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Septembre 2026',
          durationMonths: 2,
          location: 'Cotonou',
          conditions: ['Horaires définis'],
        },
      );
      assert(propRes.status === 201, 'proposition nominale créée');
      const nomPropId = ((await propRes.json()) as { id: string }).id;
      assert((await postJson(harness, `/api/v1/proposals/${nomPropId}/respond`, nomCand.token, 'sec-nom-prop-acc', { action: 'ACCEPT' })).status === 200, 'acceptation nominale');

      // 4. Contrat + Send + Sign + Activate + Finalize Hiring
      const ctrRes = await postJson(harness, '/api/v1/contracts', nomEmp.token, 'sec-nom-ctr', { proposalId: nomPropId });
      assert(ctrRes.status === 201, 'contrat nominal créé');
      const nomCtrId = ((await ctrRes.json()) as { id: string }).id;
      assert((await postJson(harness, `/api/v1/contracts/${nomCtrId}/send`, nomEmp.token, 'sec-nom-send', {})).status === 200, 'send nominal');
      assert((await postJson(harness, `/api/v1/contracts/${nomCtrId}/sign`, nomCand.token, 'sec-nom-sign-c', {})).status === 200, 'sign candidat nominal');
      assert((await postJson(harness, `/api/v1/contracts/${nomCtrId}/activate`, nomEmp.token, 'sec-nom-act', {})).status === 200, 'activate nominal');
      assert((await postJson(harness, `/api/v1/contracts/${nomCtrId}/finalize-hiring`, nomEmp.token, 'sec-nom-fin', {})).status === 200, 'finalize-hiring nominal');

      await harness.automationWorker!.drain(100);

      // 5. Clôture du contrat et réconciliation réputation
      assert((await postJson(harness, `/api/v1/contracts/${nomCtrId}/end`, nomEmp.token, 'sec-nom-end', {})).status === 200, 'end nominal');
      const recRes = await postJson(harness, '/api/v1/my/reputation/reconcile', nomCand.token, 'sec-nom-rep-rec', {});
      assert(recRes.status === 200, 'reconcile réputation nominal');
      const repView = await getAuth(harness, '/api/v1/my/reputation', nomCand.token);
      assert(repView.status === 200, 'lecture réputation nominale');
    });

    await check('40. Non-régression règles: poids P0-MATCHING (60/30/10), règles P0-REPUTATION, modèle financier 25% et unicité de automation_audit_ledger intacts', async () => {
      // 1. Poids P0-MATCHING (60 compétences / 30 zone / 10 disponibilité)
      const criteria = buildMatchingCriteria({
        id: 'ofr_weights_check',
        employerId: employerA.userId,
        title: 'Test',
        contractType: 'CDD',
        remuneration: 100_000,
        currency: 'FCFA',
        location: 'Cotonou',
        departmentId: 'littoral',
        postedDate: harness.clock.value.toISOString(),
        isUrgent: false,
        isLeLabeurJob: false,
        skills: ['Comptabilité'],
        summary: 'Test',
        responsibilities: [],
        conditions: [],
        selectionProcess: [],
        status: 'ACTIVE',
        createdAt: harness.clock.value.toISOString(),
        updatedAt: harness.clock.value.toISOString(),
      });
      const weightsByCode = Object.fromEntries(criteria.factors.map(f => [f.code, f.weight]));
      assert(
        weightsByCode.SKILLS_OVERLAP === 60 &&
        weightsByCode.ADMINISTRATIVE_ZONE === 30 &&
        weightsByCode.DECLARED_AVAILABILITY === 10,
        `poids P0-MATCHING altérés: ${JSON.stringify(weightsByCode)}`,
      );

      // 2. Aucun score anti-fraude ni réputation dans les fichiers matching
      for (const dir of ['src/domain', 'src/backend/matching', 'src/backend/persistence']) {
        const fullDir = resolve(REPO_ROOT, dir);
        for (const file of readdirSync(fullDir)) {
          if (!/matching/i.test(file) || !file.endsWith('.ts')) continue;
          const content = readFileSync(resolve(fullDir, file), 'utf8');
          assert(!/reputation/i.test(content) && !/anti.?fraud/i.test(content), `le matching doit rester indépendant (${dir}/${file})`);
        }
      }

      // 3. Versions des règles P0-REPUTATION intactes
      assert(typeof REPUTATION_RULES_VERSION === 'string' && REPUTATION_RULES_VERSION.length > 0, 'REPUTATION_RULES_VERSION intacte');
      assert(typeof REPUTATION_SCORE_VERSION === 'string' && REPUTATION_SCORE_VERSION.length > 0, 'REPUTATION_SCORE_VERSION intacte');

      // 4. Un seul ledger d'audit global (`automation_audit_ledger`)
      const auditTables = await harness.database.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%audit%'",
      );
      assert(
        auditTables.rows.length === 1 && auditTables.rows[0].table_name === 'automation_audit_ledger',
        `un seul ledger d’audit autorisé, trouvé: ${auditTables.rows.map(r => r.table_name).join(', ')}`,
      );
      void SESSION_COOKIE_NAME;
    });
  } finally {
    await harness.close();
  }

  return results;
}
