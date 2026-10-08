import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'node:child_process';
import { PUBLIC_SCREENS } from './catalog';
import { PublicAuth, publicError } from './auth';
import { SystemFeedback } from './SystemFeedback';
import { HttpApiClient, ApiClientError } from '../repositories/apiClient';
import { STATE_GUARD_CATALOG } from '../design-system/generated/stateGuardCatalog';
import { resolveRoute } from '../routing/resolveRoute';
import { API_ROUTE_CONTRACTS } from '../backend/api/routeContracts';

export async function runPublicTests() {
  const results: { name: string; success: boolean; detail?: string }[] = [];
  const check = async (name: string, run: () => unknown) => {
    try { await run(); results.push({ name, success: true }); }
    catch (error) { results.push({ name, success: false, detail: String(error) }); }
  };
  await check('PUB catalogue matches canonical Python source', () => execFileSync('python3', ['scripts/design/generate-public-catalog.py', '--check']));
  await check('10 exact opt-in public routes; root and legacy subpaths untouched', () => {
    assert.equal(PUBLIC_SCREENS.length, 10);
    for (const screen of PUBLIC_SCREENS) {
      const route = resolveRoute(screen.route + '/?ignored=1');
      assert.equal(route.kind, 'shell');
      if (route.kind === 'shell') { assert.equal(route.shell, 'PUBLIC'); assert.equal(route.unitId, screen.code); }
    }
    for (const path of ['/', '/old', '/connexion/other']) assert.equal(resolveRoute(path).kind, 'legacy');
  });
  for (const entry of STATE_GUARD_CATALOG) await check(`SYS ${entry.key}: glyph, factual copy, truthful exit and no unsupported actions`, () => {
    const html = renderToStaticMarkup(<SystemFeedback state={entry.key} correlationId="req-abc-12345" />);
    assert.ok(html.includes(`data-state="${entry.key}"`));
    assert.ok(html.includes('svg')); assert.ok(html.includes('Revenir')); assert.ok(html.includes('req-abc-12345'));
    assert.ok(!html.includes('Me notifier')); assert.ok(!html.includes('Demander une dérogation'));
    if (entry.key === '401') assert.ok(html.includes('Se reconnecter'));
  });
  await check('API errors: status mapping; raw messages, details and unsafe correlation never rendered', () => {
    for (const status of [401, 403, 404, 409, 422, 425, 429, 500, 502, 503, 504]) {
      const error = publicError(new ApiClientError('password=secret', status, 'INVALID_RESPONSE', 'Bearer secret', { token: ['secret'] }));
      assert.equal(error.state, String(status));
      assert.ok(!renderToStaticMarkup(<SystemFeedback {...error} />).includes('secret'));
    }
    assert.equal(publicError(new ApiClientError('network', 0, 'NETWORK_ERROR')).state, 'offline');
    assert.equal(publicError(new Error('private')).state, '500');
  });
  await check('Auth reuses only registered endpoints, HttpOnly cookie transport, server role', async () => {
    const calls: { url: URL; init: RequestInit }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: new URL(String(input)), init: init! });
      return new Response(JSON.stringify({ authenticated: true, user: { id: 'server-user', role: 'CANDIDATE', status: 'ACTIVE', displayName: 'Test' } }), { status: 200 });
    };
    const api = new PublicAuth(new HttpApiClient({ fetcher }));
    const user = await api.google('opaque-credential', 'EMPLOYER', 'login');
    assert.equal(user.role, 'CANDIDATE');
    await api.logout();
    assert.deepEqual(calls.map((call) => call.url.pathname), ['/api/v1/auth/google/credential', '/api/v1/auth/session', '/api/v1/auth/logout']);
    for (const call of calls) {
      assert.equal(call.init.credentials, 'include'); assert.equal(call.init.cache, 'no-store');
      assert.ok(API_ROUTE_CONTRACTS.some((route) => route.path === call.url.pathname));
      assert.ok(!new Headers(call.init.headers).has('authorization'));
    }
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { credential: 'opaque-credential', requestedRole: 'EMPLOYER', intent: 'login' });
  });
  await check('No fallback session on invalid/blocked user or network failure; abort forwarded', async () => {
    const controller = new AbortController();
    const api = new PublicAuth(new HttpApiClient({ fetcher: async (_input, init) => {
      assert.equal(init?.signal, controller.signal);
      return new Response(JSON.stringify({ user: { id: 'x', role: 'EMPLOYER', status: 'BLOCKED' } }));
    } }));
    await assert.rejects(api.session(controller.signal));
    const offline = new PublicAuth(new HttpApiClient({ fetcher: async () => { throw new Error('private'); } }));
    await assert.rejects(offline.session(), (error: unknown) => publicError(error).state === 'offline');
  });
  return results;
}
