import { ApiRepository, CreateOfferInput } from '../../repositories/apiRepository';
import { createLegacyApiRepositoryAdapter } from '../../repositories/legacyApiAdapter';
import { appRepositories, getRepositoryMode, selectRepositoryAdapter } from '../../repositories/provider';
import { ApiClientError, HttpApiClient } from '../../repositories/apiClient';
import { createCommandContext, requireIdempotencyKey } from './commands';
import { ApiError, apiErrorResponse } from './errors';
import { parsePageRequest } from './pagination';
import { requireAdmin, requireAuth, requireOwnership, requireParticipant, requireRole } from './security';
import { createApiWorker } from './worker';
import type { AuthenticatedActor, Permission } from '../productionContracts';

export interface FoundationTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectError(action: () => unknown | Promise<unknown>, predicate: (error: unknown) => boolean): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    return predicate(error);
  }
}

const candidate: AuthenticatedActor = {
  id: 'server-candidate-1',
  role: 'CANDIDATE',
  permissions: [],
  sessionId: 'session-candidate',
};

const adminPermissions: Permission[] = ['users:read:any', 'users:block'];
const admin: AuthenticatedActor = {
  id: 'server-admin-1',
  role: 'ADMIN',
  permissions: adminPermissions,
  sessionId: 'session-admin',
};

export async function runBackendBoundaryTests(): Promise<FoundationTestResult[]> {
  const results: FoundationTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('RBAC rejects missing actor', () => {
    assert(expectSyncError(() => requireAuth(null), 401), 'missing actor should return 401');
  });
  await check('RBAC keeps candidate distinct from ADMIN', () => {
    assert(expectSyncError(() => requireRole(candidate, 'ADMIN'), 403), 'candidate must not satisfy ADMIN role');
  });
  await check('ADMIN permission is checked independently from role', () => {
    const noPermission: AuthenticatedActor = { ...admin, permissions: [] };
    assert(expectSyncError(() => requireAdmin(noPermission, 'users:read:any'), 403), 'ADMIN without permission must be denied');
  });
  await check('Ownership has no implicit ADMIN bypass', () => {
    assert(expectSyncError(() => requireOwnership(admin, 'another-user'), 403), 'admin ownership bypass must be explicit');
    requireOwnership(admin, 'another-user', 'users:read:any');
  });
  await check('Participant scope is checked against server-loaded membership', () => {
    requireParticipant(candidate, ['server-candidate-1', 'server-employer-1']);
    assert(expectSyncError(() => requireParticipant(candidate, ['server-employer-1']), 403), 'non-participant must be denied');
  });
  await check('Pagination is bounded and cursor opaque', () => {
    const page = parsePageRequest(new URLSearchParams('cursor=opaque%3Aabc&limit=100'));
    assert(page.cursor === 'opaque:abc' && page.limit === 100, 'expected decoded opaque cursor and limit');
    assert(parsePageRequest(new URLSearchParams()).limit === 25, 'expected default limit 25');
    assert(expectSyncError(() => parsePageRequest(new URLSearchParams('limit=101')), 400), 'limit above max should return 400');
  });
  await check('Idempotency header is validated but not persisted', () => {
    assert(requireIdempotencyKey(new Headers({ 'Idempotency-Key': 'phase1-key-0001' })) === 'phase1-key-0001', 'key should be returned unchanged');
    assert(expectSyncError(() => requireIdempotencyKey(new Headers()), 400), 'missing key should return 400');
  });
  await check('API worker fails closed for unauthenticated Admin route', async () => {
    const worker = createApiWorker({ authenticate: async () => null, createRequestId: () => 'req-test-1' });
    const response = await worker.fetch(new Request('https://api.test/api/v1/admin/users'));
    const payload = await response.json() as { error: { code: string; requestId: string } };
    assert(response.status === 401 && payload.error.code === 'UNAUTHENTICATED', 'expected 401');
    assert(payload.error.requestId === 'req-test-1', 'request id should be correlated');
  });
  await check('API worker ignores client-supplied role and actor IDs', async () => {
    const worker = createApiWorker({ authenticate: async () => candidate });
    const response = await worker.fetch(new Request('https://api.test/api/v1/admin/users', {
      method: 'GET',
      headers: { 'x-actor-id': 'server-admin-1', 'x-actor-role': 'ADMIN' },
    }));
    assert(response.status === 403, 'client headers must not elevate a candidate');
  });
  await check('API worker requires ADMIN permission on an Admin route', async () => {
    const noReadPermission: AuthenticatedActor = { ...admin, permissions: [] };
    const worker = createApiWorker({ authenticate: async () => noReadPermission });
    const response = await worker.fetch(new Request('https://api.test/api/v1/admin/users'));
    assert(response.status === 403, 'ADMIN without users:read:any must be denied');
  });
  await check('Known Admin route is explicit and still unimplemented without a store', async () => {
    const worker = createApiWorker({ authenticate: async () => admin, createRequestId: () => 'req-test-2' });
    const response = await worker.fetch(new Request('https://api.test/api/v1/admin/users?limit=10'));
    const payload = await response.json() as { error: { code: string; requestId: string } };
    assert(response.status === 501 && payload.error.code === 'NOT_IMPLEMENTED', 'known route must not serve mock records');
    assert(payload.error.requestId === 'req-test-2', 'request id should be present');
  });
  await check('Mutating Admin route requires an idempotency key', async () => {
    const worker = createApiWorker({ authenticate: async () => admin });
    const response = await worker.fetch(new Request('https://api.test/api/v1/admin/users/user-2/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'test' }),
    }));
    assert(response.status === 400, 'missing idempotency key should be rejected before the handler');
  });
  await check('Handler receives actor from authenticator, not request body', async () => {
    const seen = { actorId: '', key: '' };
    const worker = createApiWorker({
      authenticate: async () => admin,
      handlers: {
        'admin.users.block': async context => {
          seen.actorId = context.actor?.id ?? '';
          seen.key = context.command?.idempotencyKey ?? '';
          return { accepted: true };
        },
      },
    });
    const response = await worker.fetch(new Request('https://api.test/api/v1/admin/users/user-2/block', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'block-key-0001' },
      body: JSON.stringify({ actorId: 'forged', actorRole: 'CANDIDATE', reason: 'test' }),
    }));
    assert(response.status === 200 && seen.actorId === 'server-admin-1', 'server actor must be passed to handler');
    assert(seen.key === 'block-key-0001', 'command context should include the validated key');
  });
  await check('500 API errors do not expose exception details', async () => {
    const response = apiErrorResponse(new Error('db password must-not-leak'), 'req-redacted');
    const text = await response.text();
    assert(response.status === 500 && !text.includes('must-not-leak'), 'internal error was exposed');
    assert(text.includes('req-redacted'), 'request ID was omitted');
  });
  await check('API repository sends same-origin paths and idempotency header', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 'offer-1' }), { status: 201, headers: { 'content-type': 'application/json' } });
    };
    const repository = new ApiRepository(new HttpApiClient({ fetcher }));
    const offer = {
      title: 'QA', contractType: 'MISSION', remuneration: 100000, currency: 'FCFA', location: 'Cotonou',
      skills: [], summary: 'QA', responsibilities: [], conditions: [], selectionProcess: [],
    } as CreateOfferInput;
    await repository.offers.create(offer, { idempotencyKey: 'offer-key-0001' });
    const url = new URL(capturedUrl);
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    assert(url.pathname === '/api/v1/offers', 'expected same-origin API route');
    assert(new Headers(capturedInit?.headers).get('Idempotency-Key') === 'offer-key-0001', 'idempotency header missing');
    assert(!('actorId' in body) && !('actorRole' in body), 'client actor fields must not be sent');
    assert(capturedInit?.credentials === 'include', 'session cookie must be sent');
  });
  await check('Google API exchange sends credential, never a trusted sub', async () => {
    let capturedBody = '';
    const fetcher: typeof fetch = async (_input, init) => {
      capturedBody = String(init?.body);
      return new Response(JSON.stringify({ user: { id: 'user-1' }, expiresAt: '2026-10-04T12:00:00Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const repository = new ApiRepository(new HttpApiClient({ fetcher }));
    await repository.auth.exchangeGoogleCredential('signed-google-credential', 'CANDIDATE');
    const body = JSON.parse(capturedBody) as Record<string, unknown>;
    assert(body.credential === 'signed-google-credential', 'credential must be sent to the backend');
    assert(!('sub' in body) && body.requestedRole === 'CANDIDATE', 'sub must be verified by the backend');
  });
  await check('API errors retain server error code and request ID', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ error: {
      code: 'FORBIDDEN', message: 'Accès interdit.', requestId: 'req-denied',
    } }), { status: 403, headers: { 'content-type': 'application/json' } });
    const repository = new ApiRepository(new HttpApiClient({ fetcher }));
    const denied = await expectError(() => repository.users.getMe(), error =>
      error instanceof ApiClientError && error.status === 403 && error.code === 'FORBIDDEN' && error.requestId === 'req-denied');
    assert(denied, 'API error mapping failed');
  });
  await check('AppContext repository provider defaults to unchanged mock', async () => {
    assert(getRepositoryMode() === 'mock', 'mock must remain the active default');
    assert(typeof appRepositories.getCurrentSession === 'function', 'session seam missing');
    const chosen = selectRepositoryAdapter('mock', { mock: 'mock-adapter' });
    assert(chosen === 'mock-adapter', 'mock provider selection changed');
    let apiSelectionRejected = false;
    try { selectRepositoryAdapter('api', { mock: 'mock-adapter' }); } catch { apiSelectionRejected = true; }
    assert(apiSelectionRejected, 'missing API adapter must be rejected, not silently use mock');
  });
  await check('Legacy API bridge derives scoping from endpoint, not caller IDs', async () => {
    let capturedUrl = '';
    const fetcher: typeof fetch = async input => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ items: [{ id: 'contract-1' }], cursor: null, limit: 100, hasMore: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const adapter = createLegacyApiRepositoryAdapter(new ApiRepository(new HttpApiClient({ fetcher })));
    const contracts = await adapter.getContractsByUser('attacker-selected-user', 'ADMIN');
    const url = new URL(capturedUrl);
    assert(url.pathname === '/api/v1/my/contracts', 'expected server-derived self route');
    assert(!capturedUrl.includes('attacker-selected-user') && contracts[0]?.id === 'contract-1', 'caller identity leaked to API');
  });

  return results;
}

function expectSyncError(action: () => unknown, expectedStatus: number): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof ApiError && error.status === expectedStatus;
  }
}
