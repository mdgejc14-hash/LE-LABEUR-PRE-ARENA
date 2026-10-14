import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PUBLIC_SCREENS } from './catalog';
import {
  PublicAuth, describeLoginFailure, probeSession, publicError, retryAfterSecondsFrom,
} from './auth';
import { SystemFeedback } from './SystemFeedback';
import { HttpApiClient, ApiClientError } from '../repositories/apiClient';
import { STATE_GUARD_CATALOG } from '../design-system/generated/stateGuardCatalog';
import { KineticText } from '../design-system/components/KineticText';
import { ParticleCanvas } from '../design-system/components/ParticleCanvas';
import { resolveRoute } from '../routing/resolveRoute';
import { API_ROUTE_CONTRACTS, findApiRoute } from '../backend/api/routeContracts';
import { createIdentityApiWorker } from '../backend/api/identityWorker';
import { createSessionService } from '../backend/identity/sessionService';
import { createInMemoryIdentityStores } from '../backend/identity/stores';
import type { GoogleCredentialVerifier } from '../backend/productionContracts';
import {
  PUBLIC_AUTH_GAPS, PUBLIC_AUTH_GAP_ROUTES, PUBLIC_GAPS, PUBLIC_GAP_ROUTES,
  PUBLIC_SCREEN_GAPS, PUBLIC_SCREEN_GAP_ROUTES,
} from './gaps';

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
  await check('PUB-05…08: every declared signup, OTP, recovery and legal operation is a real BACKEND_GAP', () => {
    assert.deepEqual(Object.keys(PUBLIC_AUTH_GAPS), ['PUB-05', 'PUB-06', 'PUB-07', 'PUB-08']);
    assert.equal(PUBLIC_AUTH_GAP_ROUTES.length, 12);
    for (const operation of PUBLIC_AUTH_GAP_ROUTES) {
      assert.equal(findApiRoute(operation.method, operation.path), undefined,
        `${operation.screenCode} unexpectedly resolved ${operation.method} ${operation.path}`);
    }
    const salaryOtp = findApiRoute('POST', '/api/v1/payments/payment-test/salary-confirmation');
    assert.equal(salaryOtp?.key, 'payments.salary.confirmation.confirm');
    assert.deepEqual(salaryOtp?.roles, ['CANDIDATE']);
    assert.equal(salaryOtp?.permission, undefined);
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
    const usedContracts = ['auth.google.credential', 'auth.session', 'auth.logout'].map((key) => {
      const route = API_ROUTE_CONTRACTS.find((item) => item.key === key);
      assert.ok(route, `${key} contract missing`);
      return { key: route.key, method: route.method, path: route.path, authentication: route.authentication, scope: route.scope, permission: 'permission' in route ? route.permission : undefined };
    });
    assert.deepEqual(usedContracts, [
      { key: 'auth.google.credential', method: 'POST', path: '/api/v1/auth/google/credential', authentication: 'public', scope: 'public', permission: undefined },
      { key: 'auth.session', method: 'GET', path: '/api/v1/auth/session', authentication: 'required', scope: 'self', permission: undefined },
      { key: 'auth.logout', method: 'POST', path: '/api/v1/auth/logout', authentication: 'required', scope: 'self', permission: undefined },
    ]);
    for (const call of calls) {
      assert.equal(call.init.credentials, 'include'); assert.equal(call.init.cache, 'no-store');
      assert.ok(API_ROUTE_CONTRACTS.some((route) => route.path === call.url.pathname));
      assert.ok(!new Headers(call.init.headers).has('authorization'));
    }
    assert.deepEqual(JSON.parse(calls[0].init.body as string), { credential: 'opaque-credential', requestedRole: 'EMPLOYER', intent: 'login' });
  });

  /* ─────────────── PUB-AUTH-2 — écrans publics restants ─────────────── */

  await check('PUB-01…04 + PUB-09/10 : chaque opération annoncée absente est réellement sans contrat', () => {
    assert.deepEqual(Object.keys(PUBLIC_SCREEN_GAPS), ['PUB-01', 'PUB-02', 'PUB-03', 'PUB-04', 'PUB-09', 'PUB-10']);
    assert.equal(PUBLIC_SCREEN_GAP_ROUTES.length, 14);
    for (const operation of PUBLIC_SCREEN_GAP_ROUTES) {
      assert.equal(findApiRoute(operation.method, operation.path), undefined,
        `${operation.screenCode} unexpectedly resolved ${operation.method} ${operation.path}`);
    }
    for (const gap of Object.values(PUBLIC_SCREEN_GAPS)) {
      assert.ok(gap.explanation.length > 120, 'chaque BACKEND_GAP explique précisément la capacité absente');
    }
    const statusPage = PUBLIC_SCREEN_GAPS['PUB-10'];
    assert.ok(statusPage.operations.some((operation) => operation.path === '/api/v1/status/services'));
    assert.ok(statusPage.explanation.includes('/healthz') && statusPage.explanation.includes('pas une page de statut métier'));
    return '14 opérations PUB-01…04/09/10 vérifiées absentes des contrats serveur';
  });

  await check('Registres PUB fusionnés : 8 fiches déclarées, 26 opérations, PUB-05…08 intact', () => {
    assert.deepEqual(Object.keys(PUBLIC_AUTH_GAPS), ['PUB-05', 'PUB-06', 'PUB-07', 'PUB-08']);
    assert.equal(PUBLIC_AUTH_GAP_ROUTES.length, 12);
    assert.deepEqual(Object.keys(PUBLIC_GAPS), ['PUB-05', 'PUB-06', 'PUB-07', 'PUB-08', 'PUB-01', 'PUB-02', 'PUB-03', 'PUB-04', 'PUB-09', 'PUB-10']);
    assert.equal(PUBLIC_GAP_ROUTES.length, 26);
    for (const operation of PUBLIC_GAP_ROUTES) {
      assert.equal(findApiRoute(operation.method, operation.path), undefined,
        `registre fusionné incohérent : ${operation.method} ${operation.path}`);
    }
    return '26 opérations déclarées, aucune ne résout un contrat serveur';
  });

  await check('Faits serveur revendiqués par PUB-04 : bucket auth réel et limitation 60/60 s', () => {
    const security = readFileSync(new URL('../backend/api/security.ts', import.meta.url), 'utf8');
    assert.ok(security.includes("'auth.google.credential': 'auth'"), 'la connexion Google doit être rattachée au bucket auth');
    assert.ok(security.includes('auth: { maxRequests: 60, windowMs: 60_000 }'), 'la politique auth 60/60 s doit être celle du code');
    assert.ok(security.includes("retryAfterSeconds: [String(retryAfterSeconds)]"), 'le 429 doit transmettre sa temporisation');
    const contracts = API_ROUTE_CONTRACTS.filter((route) => route.key === 'auth.google.credential');
    assert.deepEqual(contracts.map((route) => [route.method, route.path, route.authentication]), [['POST', '/api/v1/auth/google/credential', 'public']]);
    return 'bucket auth 60/60 s et temporisation serveur confirmés dans le code';
  });

  await check('Serveur réel : compte bloqué → 403 sans motif structuré ; compte actif → session ACTIVE', async () => {
    const verifier: GoogleCredentialVerifier = {
      async verifyCredential(credential: string) {
        if (credential !== 'valid-credential') throw new Error('invalid');
        return { subject: 'subject-1', email: 'candidate@example.com', emailVerified: true, displayName: 'Candidat Test' };
      },
    };
    const stores = createInMemoryIdentityStores();
    const sessions = createSessionService({ stores, googleVerifier: verifier, now: () => new Date('2026-10-12T08:00:00.000Z') });
    const worker = createIdentityApiWorker({ sessions, stores, cookie: { secure: true } });
    const login = () => worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'valid-credential', requestedRole: 'CANDIDATE', intent: 'login' }),
    }));

    const active = await login();
    assert.equal(active.status, 201, 'première connexion : compte créé par le serveur');
    const activeBody = await active.json() as { user: { id: string; status: string; role: string } };
    assert.equal(activeBody.user.status, 'ACTIVE');
    const cookie = (active.headers.get('set-cookie') ?? '').split(';')[0];
    assert.ok(cookie.includes('lelabeur_session'), 'cookie de session attendu');

    const session = await worker.fetch(new Request('https://api.test/api/v1/auth/session', { headers: { cookie } }));
    assert.equal(session.status, 200);
    assert.equal(((await session.json()) as { user: { status: string } }).user.status, 'ACTIVE');

    const user = await stores.users.findById(activeBody.user.id);
    assert.ok(user, 'utilisateur persistant attendu');
    user.status = 'BLOCKED';

    const refused = await login();
    assert.equal(refused.status, 403);
    const refusal = await refused.json() as { error: { code: string; details?: unknown } };
    assert.equal(refusal.error.code, 'FORBIDDEN');
    assert.equal(refusal.error.details, undefined, 'aucun motif structuré n’est transmis par l’API');
    const blockedSession = await worker.fetch(new Request('https://api.test/api/v1/auth/session', { headers: { cookie } }));
    assert.equal(blockedSession.status, 401, 'un compte non ACTIF ne confirme aucune session');
    return '403 sans motif structuré, 401 sans session active, 200 + ACTIVE pour un compte actif';
  });

  await check('Serveur réel : la limitation auth répond 429 avec une temporisation du serveur', async () => {
    const verifier: GoogleCredentialVerifier = {
      async verifyCredential(credential: string) {
        if (credential !== 'valid-credential') throw new Error('invalid');
        return { subject: 'subject-2', email: 'candidate@example.com', emailVerified: true, displayName: 'Candidat Test' };
      },
    };
    const stores = createInMemoryIdentityStores();
    const now = () => new Date('2026-10-12T08:00:00.000Z');
    const sessions = createSessionService({ stores, googleVerifier: verifier, now });
    const worker = createIdentityApiWorker({ sessions, stores, cookie: { secure: true }, now });
    const attempt = (index: number) => worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: index === 999 ? 'invalid-credential' : 'valid-credential', requestedRole: 'CANDIDATE' }),
    }));
    let throttled: Response | null = null;
    for (let index = 0; index <= 60; index += 1) {
      const response = await attempt(index);
      if (response.status === 429) { throttled = response; break; }
      assert.ok(response.status === 200 || response.status === 201, `réponse inattendue ${response.status}`);
    }
    assert.ok(throttled, 'la 61e tentative du bucket auth doit être limitée');
    const payload = await throttled.json() as { error: { code: string; details: Record<string, string[]> } };
    assert.equal(payload.error.code, 'RATE_LIMITED');
    assert.deepEqual(payload.error.details.bucket, ['auth']);
    const seconds = retryAfterSecondsFrom(new ApiClientError('limited', 429, 'RATE_LIMITED', undefined, payload.error.details));
    assert.ok(seconds !== null && seconds >= 1 && seconds <= 60, `temporisation serveur attendue, reçue ${String(seconds)}`);
    return `limitée après 60 requêtes ; temporisation serveur = ${String(seconds)} s`;
  });

  await check('PUB-04 : la temporisation affichée vient du serveur, jamais d’une estimation', () => {
    const withValue = describeLoginFailure(new ApiClientError('limited', 429, 'RATE_LIMITED', 'req-abc-12345', { bucket: ['auth'], retryAfterSeconds: ['42'] }));
    assert.equal(withValue.throttled, true); assert.equal(withValue.retryAfterSeconds, 42);
    assert.equal(withValue.failure.state, '429'); assert.equal(withValue.failure.correlationId, 'req-abc-12345');
    const withoutValue = describeLoginFailure(new ApiClientError('limited', 429, 'RATE_LIMITED'));
    assert.equal(withoutValue.throttled, true); assert.equal(withoutValue.retryAfterSeconds, null);
    for (const raw of ['0', '-3', 'abc', '99999', '']) {
      assert.equal(retryAfterSecondsFrom(new ApiClientError('limited', 429, 'RATE_LIMITED', undefined, { retryAfterSeconds: [raw] })), null, `valeur refusée : ${raw}`);
    }
    assert.equal(retryAfterSecondsFrom(new ApiClientError('server', 500, 'INTERNAL_ERROR')), null);
    const forbidden = describeLoginFailure(new ApiClientError('', 403, 'FORBIDDEN'));
    assert.equal(forbidden.inactiveAccount, true); assert.equal(forbidden.throttled, false);
    assert.equal(describeLoginFailure(new Error('private')).inactiveAccount, false);
    return 'seule une valeur entière 1…3600 transmise par l’API est exploitée';
  });

  await check('PUB-03/09 : la sonde de session ne conclut que sur une réponse serveur', async () => {
    const sessionResponse = (status: number, body: unknown) => new PublicAuth(new HttpApiClient({
      fetcher: async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    }));
    const active = await probeSession(sessionResponse(200, { authenticated: true, user: { id: 'u1', role: 'CANDIDATE', status: 'ACTIVE', displayName: 'Test' } }));
    assert.deepEqual(active, { state: 'active', role: 'CANDIDATE' });
    assert.equal((await probeSession(sessionResponse(401, { error: { code: 'UNAUTHENTICATED', message: 's' } }))).state, 'none');
    assert.equal((await probeSession(sessionResponse(403, { error: { code: 'FORBIDDEN', message: 's' } }))).state, 'none');
    assert.equal((await probeSession(sessionResponse(500, { error: { code: 'INTERNAL_ERROR', message: 's' } }))).state, 'error');
    const offline = new PublicAuth(new HttpApiClient({ fetcher: async () => { throw new Error('private'); } }));
    assert.equal((await probeSession(offline)).state, 'offline');
    assert.equal((await probeSession(new PublicAuth(new HttpApiClient({ fetcher: async () => new Response(JSON.stringify({ user: { id: 'x', role: 'EMPLOYER', status: 'BLOCKED' } })) })))).state, 'none');
    assert.equal((await probeSession(null)).state, 'error', 'sans API configurée, aucune vérification n’est possible');
    return 'actif / aucune session / hors-ligne / erreur distingués sans inventer de statut';
  });

  await check('C-14 KineticText : texte intégral conservé, aucune lettre perdue ni dupliquée', () => {
    const text = 'Le travail, cadré, prouvé, payé.';
    const html = renderToStaticMarkup(<KineticText text={text} as="h1" className="lbm-display-2" staggerMs={40} />);
    assert.ok(html.startsWith('<h1'), 'le conteneur doit être la balise demandée');
    const rendered = html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    assert.equal(rendered, text);
    assert.ok(html.includes('lbm-kinetic__char') && html.includes('--kinetic-delay:360ms'), 'décalage lettre par lettre attendu (40 ms)');
    assert.ok(!html.includes('aria-hidden'), 'le texte reste lisible par les lecteurs d’écran');
    return 'texte identique, décalages 40 ms, aucune image';
  });

  await check('C-15 ParticleCanvas : décor pur, aucune boucle au rendu serveur', () => {
    const html = renderToStaticMarkup(<ParticleCanvas density={120} alpha={0.1} direction="drift" />);
    assert.ok(html.includes('<canvas') && html.includes('aria-hidden="true"'), 'canvas décoratif attendu');
    assert.ok(html.includes('data-direction="drift"'));
    assert.ok(!/tabindex|role="button"/.test(html), 'aucune interaction');
    return 'canvas aria-hidden rendu côté serveur';
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
