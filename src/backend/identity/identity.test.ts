/**
 * LE LABEUR — Phase 2 — tests de la frontière identité/session/RBAC.
 * Aucun test existant n'est modifié ou supprimé.
 */

import type { GoogleCredentialVerifier } from '../productionContracts';
import { createIdentityApiWorker } from '../api/identityWorker';
import { composeWorker } from '../api/entry';
import { SESSION_COOKIE_NAME, readSessionCookie, serializeSessionCookie } from './cookies';
import { createGoogleCredentialVerifier } from './googleVerifier';
import { createSessionService, type SessionService } from './sessionService';
import { createInMemoryIdentityStores, type IdentityStores } from './stores';
import { permissionsForRole } from './permissions';
import { resolveRepositoryMode } from '../../repositories/mode';
import { getRepositoryMode } from '../../repositories/provider';

export interface IdentityTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const VALID_CREDENTIAL = 'valid-google-credential';

function fakeGoogleVerifier(subject = 'google-sub-1', email = 'candidate@example.com'): GoogleCredentialVerifier {
  return {
    async verifyCredential(credential: string) {
      if (credential !== VALID_CREDENTIAL) throw new Error('invalid credential');
      return { subject, email, emailVerified: true, displayName: 'Candidat Test' };
    },
  };
}

interface Harness {
  worker: { fetch(request: Request): Promise<Response> };
  sessions: SessionService;
  stores: IdentityStores;
  clock: { value: Date };
}

function createHarness(verifier: GoogleCredentialVerifier = fakeGoogleVerifier(), ttlSeconds = 3600): Harness {
  const clock = { value: new Date('2026-10-05T08:00:00.000Z') };
  const stores = createInMemoryIdentityStores();
  const sessions = createSessionService({
    stores,
    googleVerifier: verifier,
    now: () => clock.value,
    sessionTtlSeconds: ttlSeconds,
  });
  const worker = createIdentityApiWorker({ sessions, stores, cookie: { secure: true } });
  return { worker, sessions, stores, clock };
}

function sessionCookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const match = /__Host-lelabeur_session=([^;]*)/.exec(header);
  assert(match && match[1], 'session cookie missing from response');
  return match[1];
}

async function login(harness: Harness, body: Record<string, unknown> = { credential: VALID_CREDENTIAL, requestedRole: 'CANDIDATE' }) {
  return harness.worker.fetch(new Request('https://api.test/api/v1/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function authed(path: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  return new Request(`https://api.test${path}`, { ...init, headers });
}

async function promoteToRole(harness: Harness, userId: string, role: 'ADMIN' | 'EMPLOYER'): Promise<void> {
  const user = await harness.stores.users.findById(userId);
  assert(user, 'user must exist');
  // Promotion serveur uniquement (procédure interne), jamais exposée au client.
  Object.assign(user, { role });
}

export async function runIdentitySessionTests(): Promise<IdentityTestResult[]> {
  const results: IdentityTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('1. Credential Google valide → session serveur créée', async () => {
    const harness = createHarness();
    const response = await login(harness);
    assert(response.status === 201, `expected 201, got ${response.status}`);
    const body = await response.json() as { user: { id: string; role: string }; permissions: string[] };
    assert(body.user.role === 'CANDIDATE' && body.user.id.startsWith('usr_'), 'server identity not created');
    const cookieHeader = response.headers.get('set-cookie') ?? '';
    assert(cookieHeader.includes('HttpOnly') && cookieHeader.includes('Secure') && cookieHeader.includes('SameSite=Lax'), 'session cookie not hardened');
    const token = sessionCookieFrom(response);
    const stored = await harness.stores.sessions.findByToken(token);
    assert(stored && stored.tokenHash !== token, 'session token must be stored hashed only');
    const serialized = JSON.stringify(body);
    assert(!serialized.includes(token) && !serialized.includes('google-sub-1'), 'session/Google data leaked in response');
  });

  await check('2. Credential Google invalide → 401', async () => {
    const harness = createHarness();
    const response = await login(harness, { credential: 'forged', requestedRole: 'CANDIDATE' });
    const body = await response.json() as { error: { code: string } };
    assert(response.status === 401 && body.error.code === 'UNAUTHENTICATED', `expected 401, got ${response.status}`);
    assert(!response.headers.get('set-cookie'), 'no session cookie may be issued');
  });

  await check('3. Session absente → 401 sur route protégée', async () => {
    const harness = createHarness();
    const me = await harness.worker.fetch(new Request('https://api.test/api/v1/me'));
    assert(me.status === 401, `expected 401, got ${me.status}`);
    const adminRoute = await harness.worker.fetch(new Request('https://api.test/api/v1/admin/users'));
    assert(adminRoute.status === 401, 'admin route must require a session');
    const invalidCookie = await harness.worker.fetch(authed('/api/v1/me', 'not-a-real-token'));
    assert(invalidCookie.status === 401, 'unknown session token must be rejected');
  });

  await check('4. CANDIDATE → route ADMIN = 403', async () => {
    const harness = createHarness();
    const token = sessionCookieFrom(await login(harness));
    for (const path of ['/api/v1/admin/users', '/api/v1/admin/contracts', '/api/v1/admin/stats']) {
      const response = await harness.worker.fetch(authed(path, token));
      assert(response.status === 403, `${path} expected 403, got ${response.status}`);
    }
  });

  await check('5. EMPLOYER → route ADMIN = 403', async () => {
    const harness = createHarness();
    const token = sessionCookieFrom(await login(harness, { credential: VALID_CREDENTIAL, requestedRole: 'EMPLOYER' }));
    const session = await harness.worker.fetch(authed('/api/v1/me', token));
    const body = await session.json() as { user: { role: string } };
    assert(body.user.role === 'EMPLOYER', 'employer role not persisted');
    const response = await harness.worker.fetch(authed('/api/v1/admin/users', token));
    assert(response.status === 403, `expected 403, got ${response.status}`);
  });

  await check('6. ADMIN → route ADMIN autorisée', async () => {
    const harness = createHarness();
    const loginResponse = await login(harness);
    const token = sessionCookieFrom(loginResponse);
    const created = await loginResponse.json() as { user: { id: string } };
    await promoteToRole(harness, created.user.id, 'ADMIN');
    const response = await harness.worker.fetch(authed('/api/v1/admin/users?limit=10', token));
    assert(response.status === 200, `expected 200, got ${response.status}`);
    const body = await response.json() as { items: Array<Record<string, unknown>> };
    assert(Array.isArray(body.items) && body.items.length === 1, 'admin users projection missing');
    const serialized = JSON.stringify(body);
    assert(!serialized.includes('tokenHash') && !serialized.includes('google-sub-1'), 'admin DTO leaked internal fields');
    for (const path of ['/api/v1/admin/offers', '/api/v1/admin/applications', '/api/v1/admin/contracts',
      '/api/v1/admin/payments', '/api/v1/admin/incidents', '/api/v1/admin/replacements',
      '/api/v1/admin/audit', '/api/v1/admin/stats']) {
      const adminResponse = await harness.worker.fetch(authed(path, token));
      assert(adminResponse.status === 200, `${path} expected 200, got ${adminResponse.status}`);
    }
    assert(permissionsForRole('ADMIN').length > 0 && permissionsForRole('CANDIDATE').length === 0, 'RBAC matrix inverted');
  });

  await check('7. Logout → session invalidée', async () => {
    const harness = createHarness();
    const token = sessionCookieFrom(await login(harness));
    assert((await harness.worker.fetch(authed('/api/v1/me', token))).status === 200, 'session must be valid before logout');
    const logoutResponse = await harness.worker.fetch(authed('/api/v1/auth/logout', token, { method: 'POST' }));
    assert(logoutResponse.status === 200, `logout expected 200, got ${logoutResponse.status}`);
    assert((logoutResponse.headers.get('set-cookie') ?? '').includes('Max-Age=0'), 'logout must clear the cookie');
    const after = await harness.worker.fetch(authed('/api/v1/me', token));
    assert(after.status === 401, 'revoked session must be rejected');
    const replay = await harness.worker.fetch(authed('/api/v1/admin/users', token));
    assert(replay.status === 401, 'revoked session must not reach admin routes');
  });

  await check('8. actorId falsifié dans le body → ignoré', async () => {
    const harness = createHarness();
    const loginResponse = await login(harness);
    const token = sessionCookieFrom(loginResponse);
    const created = await loginResponse.json() as { user: { id: string } };
    const forged = await harness.worker.fetch(authed('/api/v1/me', token, {
      method: 'GET',
      headers: { 'x-actor-id': 'usr_admin_forged' },
    }));
    const body = await forged.json() as { user: { id: string } };
    assert(body.user.id === created.user.id, 'actor must come from the session, not from the request');
    const otherLogin = await login(createHarness(), { credential: VALID_CREDENTIAL, actorId: 'usr_admin_forged' });
    const otherBody = await otherLogin.json() as { user: { id: string } };
    assert(otherBody.user.id !== 'usr_admin_forged', 'client actorId must never become the server identity');
  });

  await check('9. role falsifié (body/header) → ignoré', async () => {
    const harness = createHarness();
    const token = sessionCookieFrom(await login(harness, {
      credential: VALID_CREDENTIAL,
      requestedRole: 'ADMIN',
      role: 'ADMIN',
    }));
    const me = await harness.worker.fetch(authed('/api/v1/me', token, { headers: { 'x-actor-role': 'ADMIN' } }));
    const body = await me.json() as { user: { role: string }; permissions: string[] };
    assert(body.user.role === 'CANDIDATE', 'self-service ADMIN role must be refused');
    assert(body.permissions.length === 0, 'candidate must have no admin permission');
    const admin = await harness.worker.fetch(authed('/api/v1/admin/users', token, { headers: { 'x-actor-role': 'ADMIN' } }));
    assert(admin.status === 403, 'forged role header must not elevate the actor');
  });

  await check('10. Session expirée → 401', async () => {
    const harness = createHarness(fakeGoogleVerifier(), 60);
    const token = sessionCookieFrom(await login(harness));
    assert((await harness.worker.fetch(authed('/api/v1/me', token))).status === 200, 'session should start valid');
    harness.clock.value = new Date(harness.clock.value.getTime() + 61_000);
    const expired = await harness.worker.fetch(authed('/api/v1/me', token));
    assert(expired.status === 401, `expected 401 after expiry, got ${expired.status}`);
  });

  await check('11. Cookie de session : lecture/écriture isolées', () => {
    const serialized = serializeSessionCookie('token-value', { maxAgeSeconds: 120 });
    assert(serialized.startsWith(`${SESSION_COOKIE_NAME}=token-value`), 'cookie name/value invalid');
    assert(serialized.includes('Path=/') && serialized.includes('Max-Age=120'), 'cookie attributes missing');
    const parsed = readSessionCookie(new Request('https://api.test/', {
      headers: { cookie: `other=1; ${SESSION_COOKIE_NAME}=abc123; third=2` },
    }));
    assert(parsed === 'abc123', 'cookie parsing failed');
    assert(readSessionCookie(new Request('https://api.test/')) === null, 'absent cookie must be null');
  });

  await check('12. Vérificateur Google réel rejette un credential malformé', async () => {
    const verifier = createGoogleCredentialVerifier({
      audience: 'client-id.apps.googleusercontent.com',
      fetcher: async () => new Response(JSON.stringify({ keys: [] }), { status: 200 }),
    });
    let rejected = false;
    try { await verifier.verifyCredential('not-a-jwt'); } catch { rejected = true; }
    assert(rejected, 'malformed credential must be rejected server-side');
    const harness = createHarness(verifier);
    const response = await login(harness);
    assert(response.status === 401, 'unverifiable credential must produce 401');
  });

  await check('13. Composition Worker fermée sans GOOGLE_CLIENT_ID', async () => {
    const closed = composeWorker({});
    assert(closed.mode === 'closed', 'worker must stay closed without a Google audience');
    const response = await closed.worker.fetch(new Request('https://api.test/api/v1/admin/users'));
    assert(response.status === 401, 'closed worker must reject admin access');
    const memory = composeWorker({ GOOGLE_CLIENT_ID: 'client-id', IDENTITY_STORE: 'memory' });
    assert(memory.mode === 'memory', 'explicit memory store should compose');
    const withoutStore = composeWorker({ GOOGLE_CLIENT_ID: 'client-id' });
    assert(withoutStore.mode === 'closed', 'no store configured must not silently open the API');
  });

  await check('14. MODE DEMO reste le défaut; MODE API est explicite', () => {
    assert(getRepositoryMode() === 'mock', 'mock/demo mode must remain the default');
    assert(resolveRepositoryMode({}).mode === 'mock', 'absent configuration must stay in demo');
    assert(resolveRepositoryMode({ VITE_DEMO_MODE: 'false' }).mode === 'mock', 'API mode requires a same-origin base path');
    assert(resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: 'https://evil.test' }).mode === 'mock', 'absolute API URL must be refused');
    assert(resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' }).mode === 'api', 'explicit API mode should resolve');
  });

  return results;
}
