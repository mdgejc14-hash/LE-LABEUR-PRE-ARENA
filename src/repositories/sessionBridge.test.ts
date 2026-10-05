/**
 * LE LABEUR — Phase 3 — pont FRONTEND ↔ AUTH API ↔ SESSION SERVEUR.
 *
 * Les tests font tourner le vrai Worker d'identité Phase 2 derrière le client
 * HTTP du frontend (avec bocal à cookies), sans aucun mock d'authentification.
 */

import type { GoogleCredentialVerifier } from '../backend/productionContracts';
import { createIdentityApiWorker } from '../backend/api/identityWorker';
import { createSessionService } from '../backend/identity/sessionService';
import { createInMemoryIdentityStores, type IdentityStores } from '../backend/identity/stores';
import { ApiClientError, HttpApiClient } from './apiClient';
import { ApiRepository } from './apiRepository';
import { createLegacyApiRepositoryAdapter } from './legacyApiAdapter';
import { mapServerSessionToProfile } from './sessionMapping';
import { resolveRepositoryMode } from './mode';
import { getRepositoryMode, selectRepositoryAdapter, type AppRepositoryBundle } from './provider';
import { mockService } from './mockRepository';
import {
  canReachAdminBoundary,
  clearStoredRolePreference,
  initialRoleForMode,
  landingTabForRole,
  readStoredRolePreference,
  ROLE_PREFERENCE_STORAGE_KEY,
  shouldRestoreAuthenticatedScreen,
} from '../context/sessionRouting';

export interface SessionBridgeTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CREDENTIAL = 'phase3-valid-credential';

function verifier(subject: string, email: string): GoogleCredentialVerifier {
  return {
    async verifyCredential(credential: string) {
      if (credential !== CREDENTIAL) throw new Error('invalid credential');
      return { subject, email, emailVerified: true, displayName: 'Utilisateur Test' };
    },
  };
}

interface Backend {
  adapter: AppRepositoryBundle;
  stores: IdentityStores;
  clock: { value: Date };
  /** Simule un rechargement de page : nouveau client, cookies conservés. */
  reload(): AppRepositoryBundle;
  /** Simule la perte du cookie (navigateur vidé). */
  dropCookies(): void;
}

function createBackend(subject = 'google-sub-phase3', email = 'candidat@example.com', ttlSeconds = 3600): Backend {
  const clock = { value: new Date('2026-10-05T09:00:00.000Z') };
  const stores = createInMemoryIdentityStores();
  const sessions = createSessionService({
    stores,
    googleVerifier: verifier(subject, email),
    now: () => clock.value,
    sessionTtlSeconds: ttlSeconds,
  });
  const worker = createIdentityApiWorker({ sessions, stores, cookie: { secure: true }, now: () => clock.value });

  let jar = new Map<string, string>();
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (jar.size > 0) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    const response = await worker.fetch(new Request(String(input), { ...init, headers } as RequestInit));
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value || /Max-Age=0/i.test(setCookie)) jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  };

  const build = () => createLegacyApiRepositoryAdapter(new ApiRepository(new HttpApiClient({ fetcher })));
  return {
    adapter: build(),
    stores,
    clock,
    reload: build,
    dropCookies: () => { jar = new Map(); },
  };
}

async function loginGoogle(backend: Backend, role: 'CANDIDATE' | 'EMPLOYER' = 'CANDIDATE', adapter = backend.adapter) {
  return adapter.authenticateGoogleCredential(
    { sub: 'client-sub-ignored', email: 'spoof@example.com', name: 'Spoof', credential: CREDENTIAL, email_verified: true },
    role,
  );
}

async function promote(backend: Backend, userId: string, role: 'ADMIN'): Promise<void> {
  const user = await backend.stores.users.findById(userId);
  assert(user, 'user must exist');
  Object.assign(user, { role });
}

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
}

export async function runSessionBridgeTests(): Promise<SessionBridgeTestResult[]> {
  const results: SessionBridgeTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('1. MODE DEMO : mock actif, session mock inchangée', async () => {
    assert(getRepositoryMode() === 'mock', 'demo mode must remain the default');
    assert(resolveRepositoryMode({ VITE_DEMO_MODE: 'true', VITE_API_BASE_PATH: '/api/v1' }).mode === 'mock', 'demo flag must win');
    const registered = await mockService.registerWithGoogle({
      googleSub: 'google-sub-phase3-demo', email: 'demo.phase3@example.com', fullName: 'Démo Phase 3', role: 'CANDIDATE',
    });
    const demoUser = await mockService.loginWithGoogle('google-sub-phase3-demo', 'CANDIDATE');
    assert(registered.id === demoUser.id && demoUser.role === 'CANDIDATE', 'mock Google login broken');
    assert(selectRepositoryAdapter('mock', { mock: 'mock-bundle' }) === 'mock-bundle', 'mock selection changed');
    await mockService.logout();
  });

  await check('2. MODE API : sélection explicite, jamais mélangée au mock', () => {
    const decision = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' });
    assert(decision.mode === 'api' && decision.basePath === '/api/v1', 'api mode not resolved');
    let rejected = false;
    try { selectRepositoryAdapter('api', { mock: 'mock-bundle' }); } catch { rejected = true; }
    assert(rejected, 'API mode must never silently fall back to the mock');
  });

  await check('3. Login Google : credential → session serveur → profil', async () => {
    const backend = createBackend();
    const user = await loginGoogle(backend);
    assert(user.id.startsWith('usr_'), 'server identity expected');
    assert(user.role === 'CANDIDATE' && user.email === 'candidat@example.com', 'server profile not mapped');
    assert(user.id !== 'client-sub-ignored', 'client sub must not become the identity');
  });

  await check('4. Session valide : getCurrentSession renvoie l’acteur serveur', async () => {
    const backend = createBackend();
    const logged = await loginGoogle(backend);
    const session = await backend.adapter.getCurrentSession();
    assert(session && session.id === logged.id && session.role === 'CANDIDATE', 'session not recognized');
  });

  await check('5. Session absente : getCurrentSession = null, pas de repli mock', async () => {
    const backend = createBackend();
    const session = await backend.adapter.getCurrentSession();
    assert(session === null, 'missing session must yield null');
    let denied = false;
    try { await backend.adapter.getAllUsers('anything'); } catch (error) {
      denied = error instanceof ApiClientError && error.status === 401;
    }
    assert(denied, 'unauthenticated admin call must fail with 401, not mock data');
  });

  await check('6. Logout : session invalidée côté serveur et côté client', async () => {
    const backend = createBackend();
    await loginGoogle(backend);
    await backend.adapter.logout();
    assert(backend.adapter.getCurrentUser() === null, 'client session state must be cleared');
    assert((await backend.adapter.getCurrentSession()) === null, 'server session must be revoked');
    const storage = new MemoryStorage();
    storage.setItem(ROLE_PREFERENCE_STORAGE_KEY, 'ADMIN');
    clearStoredRolePreference(storage);
    assert(readStoredRolePreference(storage) === null, 'role preference must be cleared on logout');
  });

  await check('7. Refresh : la session serveur est restaurée par le cookie', async () => {
    const backend = createBackend();
    const logged = await loginGoogle(backend, 'EMPLOYER');
    const afterReload = backend.reload();
    const restored = await afterReload.getCurrentSession();
    assert(restored && restored.id === logged.id && restored.role === 'EMPLOYER', 'refresh must restore the server session');
    assert(shouldRestoreAuthenticatedScreen('api', true), 'API mode must route straight to the authenticated space');
    assert(!shouldRestoreAuthenticatedScreen('mock', true), 'demo mode keeps its existing flow');
    backend.dropCookies();
    assert((await backend.reload().getCurrentSession()) === null, 'without cookie there is no session');
  });

  await check('8. CANDIDATE : espace candidat, frontière ADMIN refusée (403)', async () => {
    const backend = createBackend();
    const user = await loginGoogle(backend, 'CANDIDATE');
    assert(landingTabForRole(user.role) === 'DISCOVER', 'candidate must land on DISCOVER');
    assert(!canReachAdminBoundary(user.role, true), 'candidate must not reach the admin boundary');
    let status = 0;
    try { await backend.adapter.getAllUsers(user.id); } catch (error) { status = (error as ApiClientError).status; }
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('9. EMPLOYER : espace employeur, frontière ADMIN refusée (403)', async () => {
    const backend = createBackend('google-sub-employer', 'employeur@example.com');
    const user = await loginGoogle(backend, 'EMPLOYER');
    assert(user.role === 'EMPLOYER' && landingTabForRole(user.role) === 'DASHBOARD', 'employer must land on DASHBOARD');
    let status = 0;
    try { await backend.adapter.getAllUsers(user.id); } catch (error) { status = (error as ApiClientError).status; }
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('10. ADMIN : frontière ADMIN atteinte avec une session serveur ADMIN', async () => {
    const backend = createBackend('google-sub-admin', 'admin@lelabeur.bj');
    const user = await loginGoogle(backend);
    await promote(backend, user.id, 'ADMIN');
    const session = await backend.adapter.getCurrentSession();
    assert(session?.role === 'ADMIN', 'server must announce the ADMIN role');
    assert(canReachAdminBoundary(session?.role, true) && landingTabForRole('ADMIN') === 'DASHBOARD', 'admin routing broken');
    const users = await backend.adapter.getAllUsers(user.id);
    assert(Array.isArray(users) && users.length === 1, 'admin boundary must answer');
    assert(!JSON.stringify(users).includes('tokenHash'), 'admin payload must stay clean');
  });

  await check('11. Rôle falsifié côté client : ignoré par le pont', async () => {
    const backend = createBackend();
    let refused = false;
    try {
      await backend.adapter.authenticateGoogleCredential(
        { sub: 'x', email: 'x@example.com', name: 'x', credential: CREDENTIAL, email_verified: true },
        'ADMIN',
      );
    } catch (error) { refused = error instanceof ApiClientError && error.status === 403; }
    assert(refused, 'self-service ADMIN must be refused by the client bridge');
    const user = await loginGoogle(backend);
    assert(user.role === 'CANDIDATE', 'server role is authoritative');
    assert(initialRoleForMode('api', 'ADMIN') === 'CANDIDATE', 'stored ADMIN preference must not be restored in API mode');
    assert(!canReachAdminBoundary('ADMIN', false), 'no session means no admin access');
    let switchRefused = false;
    try { await backend.adapter.switchRole('ADMIN'); } catch { switchRefused = true; }
    assert(switchRefused, 'client-side role switching must be refused');
  });

  await check('12. actorId falsifié : la portée vient de la session', async () => {
    const backend = createBackend();
    const user = await loginGoogle(backend);
    const session = await backend.adapter.getCurrentSession();
    assert(session?.id === user.id, 'session identity mismatch');
    let status = 0;
    try { await backend.adapter.getAllApplications('usr_victim_forged'); } catch (error) { status = (error as ApiClientError).status; }
    assert(status === 403, `forged actorId must not grant admin scope (got ${status})`);
    assert(mapServerSessionToProfile({ authenticated: false, user: { id: 'usr_x', role: 'ADMIN' } }) === null, 'unauthenticated payload must map to null');
    assert(mapServerSessionToProfile({ user: { id: 'usr_x', role: 'ADMIN', status: 'BLOCKED' } }) === null, 'blocked account must map to null');
    assert(mapServerSessionToProfile({ user: { id: 'usr_x', role: 'SUPERUSER' } }) === null, 'unknown role must map to null');
  });

  await check('13. Login classique : aucune identité locale fabriquée en MODE API', async () => {
    const backend = createBackend();
    let status = 0;
    try { await backend.adapter.login('attacker@example.com', 'ADMIN'); } catch (error) { status = (error as ApiClientError).status; }
    assert(status === 501, `classic login must fail closed (got ${status})`);
    assert((await backend.adapter.getCurrentSession()) === null, 'no session may be created client-side');
  });

  await check('14. Session expirée : le frontend retombe à l’état déconnecté', async () => {
    const backend = createBackend('google-sub-expiry', 'expire@example.com', 60);
    await loginGoogle(backend);
    backend.clock.value = new Date(backend.clock.value.getTime() + 61_000);
    const session = await backend.reload().getCurrentSession();
    assert(session === null, 'expired session must be treated as logged out');
  });

  return results;
}
