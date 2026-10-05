/**
 * LE LABEUR — P0-C / P0-E3 / P0-E4 — vérification du Worker dans le runtime workerd
 * avec un binding Hyperdrive local.
 *
 *   Requête HTTP → workerd → binding HYPERDRIVE → PostgreSQL réel → réponse
 *
 * Ce que ce script prouve :
 *  - le bundle du Worker (entrée `src/backend/worker/cloudflareEntry.ts`) se
 *    construit et s'exécute sous workerd avec `nodejs_compat` et `pg` ;
 *  - le binding Hyperdrive est réellement lu (`env.HYPERDRIVE.connectionString`
 *    alimenté par `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`) ;
 *  - `/healthz` décrit l'état réel (base joignable, migrations appliquées) ;
 *  - le parcours Google signé → session → /me → logout écrit réellement dans
 *    PostgreSQL, sans jamais exposer de secret ;
 *  - le cycle de décision P0-E4 (examine, shortlist, rejet refusé à un tiers,
 *    withdraw) s'exécute sous workerd et persiste dans PostgreSQL.
 *
 * Ce que ce script NE prouve PAS :
 *  - il n'y a ni compte Cloudflare, ni Hyperdrive déployé, ni `wrangler deploy`,
 *    ni base managée : c'est un runtime workerd LOCAL (TEST/LOCAL). `wrangler
 *    dev --remote` et le déploiement restent UNAVAILABLE dans cette session.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

import { base64UrlEncode, hashSessionToken } from '../src/backend/identity/ids';
import { applyMigrations, loadMigrations } from '../src/backend/persistence/migrationRunner';
import { toPostgresClientPort } from '../src/backend/persistence/sqlClient';
import { SESSION_COOKIE_NAME } from '../src/backend/identity/cookies';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORK_DIR = resolve(REPO_ROOT, '.tmp', 'verify-workerd');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');
const AUDIENCE = 'p0c-workerd-client.apps.googleusercontent.com';
const WRANGLER_PORT = Number(process.env.WORKERD_PORT ?? 8788);

const results: Array<{ name: string; success: boolean; detail: string }> = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, test: () => Promise<void> | void): Promise<void> {
  try {
    await test();
    results.push({ name, success: true, detail: 'OK' });
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = String((error as Error)?.message ?? error);
    results.push({ name, success: false, detail });
    console.error(`FAIL ${name} — ${detail}`);
  }
}

async function waitForHttp(url: string, timeoutMs: number): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
    }
  }
  throw new Error(`workerd injoignable sur ${url}: ${String((lastError as Error)?.message ?? lastError)}`);
}

function cookieToken(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const token = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header)?.[1];
  assert(token, 'cookie de session attendu depuis workerd');
  return token;
}

interface TestJwks {
  server: Server;
  port: number;
  credentials: Record<string, string>;
}

/** JWKS de test servi en boucle locale (jamais joignable hors de la machine). */
async function startTestJwks(): Promise<TestJwks> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const kid = 'p0c-workerd-key';
  const publicJwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid, alg: 'RS256', use: 'sig' };

  const server = createServer((request, response) => {
    if (request.url?.startsWith('/jwks')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  assert(address && typeof address === 'object', 'port JWKS introuvable');

  const identities = {
    candidate: { subject: 'google-sub-p0e3-candidate', email: 'workerd.candidate@example.com', name: 'Workerd Candidate' },
    employer: { subject: 'google-sub-p0e3-employer', email: 'workerd.employer@example.com', name: 'Workerd Employer' },
    otherEmployer: { subject: 'google-sub-p0e3-other-employer', email: 'workerd.other-employer@example.com', name: 'Workerd Other Employer' },
  };
  const credentials: Record<string, string> = {};
  for (const [key, identity] of Object.entries(identities)) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid })));
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: AUDIENCE,
      sub: identity.subject,
      iat: issuedAt,
      exp: issuedAt + 300,
      email: identity.email,
      email_verified: true,
      name: identity.name,
    })));
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    credentials[key] = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  }
  return { server, port: address.port, credentials };
}

async function main(): Promise<void> {
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });

  console.log('============================================================');
  console.log(' LE LABEUR — P0-C / P0-E3 / P0-E4 — runtime workerd + binding Hyperdrive local');
  console.log('============================================================');
  console.log('Runtime          : workerd (wrangler dev --local) — PAS un déploiement Cloudflare');
  console.log('Base             : PostgreSQL 17.10 RÉEL local (binaire embarqué, TEST/LOCAL)');
  console.log('Hyperdrive réel  : NON — binding alimenté par la variable locale, aucun Hyperdrive déployé');
  console.log('------------------------------------------------------------');

  const port = Number(process.env.PG_PORT ?? 55435);
  const dataDir = resolve(WORK_DIR, 'pgdata');
  const password = randomBytes(18).toString('hex');
  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'lelabeur',
    password,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
    onError: () => undefined,
  });

  const jwks = await startTestJwks();
  let wrangler: ChildProcess | null = null;
  const pool = new Pool({
    connectionString: `postgresql://lelabeur:${password}@127.0.0.1:${port}/lelabeur?sslmode=disable`,
    max: 3,
  });
  const localConnectionString = `postgresql://lelabeur:${password}@127.0.0.1:${port}/lelabeur?sslmode=disable`;
  const wranglerLog = resolve(WORK_DIR, 'wrangler.log');
  let sessionCookie = '';
  let userId = '';
  let employerCookie = '';
  let workerdApplicationId = '';
  let employerId = '';
  let otherEmployerCookie = '';
  let otherEmployerId = '';

  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('lelabeur');

    await check('Migrations réelles appliquées avant démarrage du Worker', async () => {
      const client = toPostgresClientPort(pool);
      const applied = await applyMigrations(client, loadMigrations(MIGRATIONS_DIR));
      assert(applied.applied.length === 3, `3 migrations attendues, reçues ${applied.applied.length}`);
    });

    const logStream = (chunk: Buffer | string) => writeFileSync(wranglerLog, chunk, { flag: 'a' });
    writeFileSync(wranglerLog, '');
    wrangler = spawn(resolve(REPO_ROOT, 'node_modules', '.bin', 'wrangler'), [
      'dev',
      '--local',
      '--port', String(WRANGLER_PORT),
      '--var', `GOOGLE_CLIENT_ID:${AUDIENCE}`,
      '--var', 'WORKER_ENV:workerd-local',
      '--var', 'PERSISTENCE:postgres',
      '--var', 'COOKIE_SECURE:false',
      '--var', 'SESSION_TTL_SECONDS:600',
      '--var', `TEST_ONLY_GOOGLE_JWKS_URL:http://127.0.0.1:${jwks.port}/jwks`,
    ], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        CI: 'true',
        WRANGLER_SEND_METRICS: 'false',
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: localConnectionString,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    wrangler.stdout?.on('data', logStream);
    wrangler.stderr?.on('data', logStream);

    const base = `http://127.0.0.1:${WRANGLER_PORT}`;
    let health: Response;
    try {
      health = await waitForHttp(`${base}/healthz`, 120_000);
    } catch (error) {
      throw new Error(`${String((error as Error).message)}\n--- wrangler.log ---\n${require('node:fs').readFileSync(wranglerLog, 'utf8').slice(-3000)}`);
    }

    await check('workerd + Hyperdrive local : /healthz réel (base joignable, migrations appliquées)', async () => {
      assert(health.status === 200, `200 attendu, reçu ${health.status}`);
      const text = await health.text();
      const body = JSON.parse(text) as {
        status: string;
        persistence: {
          mode: string;
          reason: string;
          reachable: boolean;
          durable: boolean;
          target?: { host: string; port: number; database: string; source: string };
          migrations?: { status: string; applied: string[] };
        };
        runtime: { runtime: string; declaredEnvironment: string | null; hyperdriveBinding: boolean };
      };
      assert(body.status === 'ok', `status ok attendu, reçu ${body.status}`);
      assert(body.persistence.mode === 'postgres' && body.persistence.reachable === true, 'base réellement sondée attendue');
      assert(body.persistence.reason === 'hyperdrive-binding', `raison attendue hyperdrive-binding, reçue ${body.persistence.reason}`);
      assert(body.persistence.target?.source === 'HYPERDRIVE', 'la source doit être le binding Hyperdrive');
      // Le proxy Hyperdrive local de wrangler expose un hôte virtuel dédié :
      // sa présence prouve que la connexion passe bien par le binding.
      assert(body.persistence.target?.host?.endsWith('hyperdrive.local') === true, `hôte du proxy Hyperdrive local attendu, reçu ${body.persistence.target?.host}`);
      assert(body.persistence.target?.database === 'lelabeur', 'base locale attendue');
      assert(body.persistence.migrations?.status === 'applied', 'migrations appliquées attendues');
      assert(body.runtime.runtime === 'workerd', `runtime workerd attendu, reçu ${body.runtime.runtime}`);
      assert(body.runtime.hyperdriveBinding === true, 'binding Hyperdrive attendu');
      assert(body.runtime.declaredEnvironment === 'workerd-local', 'environnement déclaré attendu');
      assert(!text.includes(password), 'aucun secret ne doit apparaître dans /healthz');
    });

    await check('workerd : frontière fermée pour les routes métier non ouvertes (501), OFFRES ouvert (200), et sans session (401)', async () => {
      const offers = await fetch(`${base}/api/v1/offers`);
      assert(offers.status === 200, `200 attendu pour route OFFRES ouverte, reçu ${offers.status}`);
      const closedDomain = await fetch(`${base}/api/v1/resources`);
      assert(closedDomain.status === 501, `501 attendu pour une route hors périmètre sans handler, reçu ${closedDomain.status}`);
      const admin = await fetch(`${base}/api/v1/admin/users`);
      assert(admin.status === 401, `401 attendu sans session, reçu ${admin.status}`);
    });

    await check('workerd → PostgreSQL : login Google signé, session réellement persistée', async () => {
      const response = await fetch(`${base}/api/v1/auth/google/credential`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: jwks.credentials.candidate, requestedRole: 'CANDIDATE' }),
      });
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const body = await response.json() as { authenticated: boolean; user: { id: string; role: string } };
      assert(body.authenticated && body.user.role === 'CANDIDATE', 'session candidate attendue');
      userId = body.user.id;
      sessionCookie = cookieToken(response);

      const users = await pool.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
      const sessions = await pool.query<{ token_hash: string }>(
        'SELECT token_hash FROM sessions WHERE user_id = $1 AND revoked_at IS NULL', [userId],
      );
      assert(users.rows[0]?.role === 'CANDIDATE', 'utilisateur écrit par le Worker dans PostgreSQL');
      assert(sessions.rows[0]?.token_hash === await hashSessionToken(sessionCookie), 'session hashée écrite par le Worker');
    });

    await check('P0-E3 workerd → PostgreSQL : soumission candidature et lecture par le propriétaire', async () => {
      const employerLogin = await fetch(`${base}/api/v1/auth/google/credential`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: jwks.credentials.employer, requestedRole: 'EMPLOYER' }),
      });
      assert(employerLogin.status === 201, `connexion employeur 201 attendue, reçue ${employerLogin.status}`);
      employerId = ((await employerLogin.json()) as { user: { id: string } }).user.id;
      employerCookie = cookieToken(employerLogin);

      const otherEmployerLogin = await fetch(`${base}/api/v1/auth/google/credential`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: jwks.credentials.otherEmployer, requestedRole: 'EMPLOYER' }),
      });
      assert(otherEmployerLogin.status === 201, `connexion autre employeur 201 attendue, reçue ${otherEmployerLogin.status}`);
      otherEmployerId = ((await otherEmployerLogin.json()) as { user: { id: string } }).user.id;
      otherEmployerCookie = cookieToken(otherEmployerLogin);

      const createOffer = await fetch(`${base}/api/v1/offers`, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0e3-workerd-offer-001',
        },
        body: JSON.stringify({
          title: 'Offre workerd P0-E3',
          contractType: 'CDI',
          remuneration: 180000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre utilisée pour vérifier le flux worker réel.',
        }),
      });
      assert(createOffer.status === 201, `création offre 201 attendue, reçue ${createOffer.status}`);
      const offer = await createOffer.json() as { id: string; employerId: string };
      assert(offer.employerId === employerId, 'offre rattachée à l’employeur connecté');

      const submission = await fetch(`${base}/api/v1/offers/${offer.id}/applications`, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0e3-workerd-application-001',
        },
        body: JSON.stringify({ note: 'Disponible pour un entretien.' }),
      });
      assert(submission.status === 201, `POST candidature 201 attendu, reçu ${submission.status}`);
      const application = await submission.json() as { id: string; offerId: string; candidateId: string; status: string };
      assert(application.offerId === offer.id && application.candidateId === userId, 'candidature reliée à la bonne offre et au bon candidat');
      assert(application.status === 'PENDING', 'statut PENDING attendu');
      workerdApplicationId = application.id;

      const stored = await pool.query<{ offer_id: string; candidate_id: string; status: string; note: string | null }>(
        'SELECT offer_id, candidate_id, status, note FROM applications WHERE id = $1', [application.id],
      );
      assert(stored.rows.length === 1 && stored.rows[0].candidate_id === userId, 'ligne candidature persistée dans PostgreSQL');
      assert(stored.rows[0].offer_id === offer.id && stored.rows[0].status === 'PENDING', 'offre et statut persistés');
      assert(stored.rows[0].note === 'Disponible pour un entretien.', 'note persistée');

      const ownerHeaders = { cookie: `${SESSION_COOKIE_NAME}=${employerCookie}` };
      const path = `${base}/api/v1/offers/${offer.id}/applications?limit=10`;
      const [ownerListA, ownerListB] = await Promise.all([fetch(path, { headers: ownerHeaders }), fetch(path, { headers: ownerHeaders })]);
      assert(ownerListA.status === 200 && ownerListB.status === 200, 'consultations simultanées du propriétaire autorisées');
      const [listA, listB] = await Promise.all([
        ownerListA.json() as Promise<{ items: Array<{ id: string; candidateId: string }> }>,
        ownerListB.json() as Promise<{ items: Array<{ id: string; candidateId: string }> }>,
      ]);
      assert(listA.items.length === 1 && listB.items.length === 1, 'les deux consultations retournent une seule candidature');
      assert(listA.items[0].id === application.id && listB.items[0].id === application.id, 'même résultat PostgreSQL');

      const otherEmployer = await fetch(`${base}/api/v1/offers/${offer.id}/applications`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${otherEmployerCookie}` },
      });
      assert(otherEmployer.status === 403, `autre employeur refusé (403), reçu ${otherEmployer.status}`);
      const candidateRead = await fetch(`${base}/api/v1/offers/${offer.id}/applications`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}` },
      });
      assert(candidateRead.status === 403, `candidat refusé sur la liste privée (403), reçu ${candidateRead.status}`);
      const closedLifecycle = await fetch(`${base}/api/v1/my/applications`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}` },
      });
      assert(closedLifecycle.status === 501, `la liste générale des candidatures reste fermée (501), reçu ${closedLifecycle.status}`);
      assert(otherEmployerId !== employerId, 'employeurs distincts');
    });

    await check('P0-E4 workerd → PostgreSQL : EMPLOYER examine et shortliste, tiers refusé, CANDIDATE retire', async () => {
      assert(workerdApplicationId, 'la candidature P0-E3 doit exister pour enchaîner le cycle de décision');
      const ownerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const path = (action: string) => `${base}/api/v1/applications/${workerdApplicationId}/${action}`;

      // 1. EXAMINE — PENDING → REVIEW, réellement écrit par workerd.
      const examined = await fetch(path('examine'), {
        method: 'POST',
        headers: ownerHeaders('p0e4-workerd-examine-001'),
        body: '{}',
      });
      assert(examined.status === 200, `examen 200 attendu, reçu ${examined.status}`);
      let stored = await pool.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM applications WHERE id = $1', [workerdApplicationId],
      );
      assert(stored.rows[0]?.status === 'REVIEW', 'REVIEW persisté par workerd dans PostgreSQL');
      const historyAfterExamine = (typeof stored.rows[0]?.history === 'string'
        ? JSON.parse(String(stored.rows[0]?.history))
        : stored.rows[0]?.history) as Array<{ action: string }>;
      assert(historyAfterExamine.length === 2, `historique alimenté, reçu ${historyAfterExamine.length} entrée(s)`);

      // 2. Un autre employeur ne décide jamais sur cette offre (403).
      const otherEmployerDecision = await fetch(path('shortlist'), {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${otherEmployerCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0e4-workerd-other-employer-001',
        },
        body: '{}',
      });
      assert(otherEmployerDecision.status === 403, `autre employeur refusé (403), reçu ${otherEmployerDecision.status}`);

      // 3. SHORTLIST — REVIEW → SHORTLISTED, puis rejeu idempotent (même clé).
      const shortlisted = await fetch(path('shortlist'), {
        method: 'POST',
        headers: ownerHeaders('p0e4-workerd-shortlist-001'),
        body: '{}',
      });
      assert(shortlisted.status === 200, `shortlist 200 attendu, reçu ${shortlisted.status}`);
      const replay = await fetch(path('shortlist'), {
        method: 'POST',
        headers: ownerHeaders('p0e4-workerd-shortlist-001'),
        body: '{}',
      });
      assert(replay.status === 200, `rejeu 200 attendu, reçu ${replay.status}`);
      stored = await pool.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM applications WHERE id = $1', [workerdApplicationId],
      );
      assert(stored.rows[0]?.status === 'SHORTLISTED', 'SHORTLISTED persisté dans PostgreSQL');
      const historyAfterShortlist = (typeof stored.rows[0]?.history === 'string'
        ? JSON.parse(String(stored.rows[0]?.history))
        : stored.rows[0]?.history) as Array<{ action: string }>;
      assert(historyAfterShortlist.length === 3, `aucune entrée dupliquée au rejeu, reçu ${historyAfterShortlist.length}`);

      // 4. WITHDRAW par le candidat — SHORTLISTED → WITHDRAWN.
      const withdrawn = await fetch(path('withdraw'), {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0e4-workerd-withdraw-001',
        },
        body: '{}',
      });
      assert(withdrawn.status === 200, `retrait 200 attendu, reçu ${withdrawn.status}`);
      stored = await pool.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM applications WHERE id = $1', [workerdApplicationId],
      );
      assert(stored.rows[0]?.status === 'WITHDRAWN', 'WITHDRAWN persisté dans PostgreSQL');

      // 5. État terminal : plus aucune décision acceptée (409).
      const afterWithdraw = await fetch(path('examine'), {
        method: 'POST',
        headers: ownerHeaders('p0e4-workerd-examine-after-withdraw-001'),
        body: '{}',
      });
      assert(afterWithdraw.status === 409, `décision après retrait: 409 attendu, reçu ${afterWithdraw.status}`);
    });

    await check('workerd → PostgreSQL : session relue, /me résolu, logout révoqué en base', async () => {
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}` };
      const session = await fetch(`${base}/api/v1/auth/session`, { headers });
      assert(session.status === 200, `session attendue 200, reçue ${session.status}`);
      const me = await fetch(`${base}/api/v1/me`, { headers });
      assert(me.status === 200, `me attendu 200, reçu ${me.status}`);
      const body = await me.json() as { user: { id: string } };
      assert(body.user.id === userId, 'acteur résolu depuis PostgreSQL');

      const logout = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers });
      assert(logout.status === 200, `logout attendu 200, reçu ${logout.status}`);
      const revoked = await pool.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM sessions WHERE user_id = $1', [userId],
      );
      assert(revoked.rows[0]?.revoked_at !== null && revoked.rows[0]?.revoked_at !== undefined, 'revoked_at persisté');
      const reuse = await fetch(`${base}/api/v1/auth/session`, { headers });
      assert(reuse.status === 401, `session révoquée : 401 attendu, reçu ${reuse.status}`);
    });
  } catch (error) {
    results.push({ name: 'Exécution workerd', success: false, detail: String((error as Error)?.message ?? error) });
    console.error(`ERREUR FATALE: ${String((error as Error)?.message ?? error)}`);
  } finally {
    if (wrangler && !wrangler.killed) {
      wrangler.kill('SIGTERM');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 1500));
      if (!wrangler.killed) wrangler.kill('SIGKILL');
    }
    await pool.end().catch(() => undefined);
    await new Promise<void>(resolvePromise => jwks.server.close(() => resolvePromise()));
    await postgres.stop().catch(() => undefined);
    rmSync(dataDir, { recursive: true, force: true });
  }

  const failed = results.filter(result => !result.success);
  console.log('------------------------------------------------------------');
  console.log(`Total: ${results.length - failed.length}/${results.length} PASS; ${failed.length} FAIL`);
  console.log('Rappel : runtime workerd LOCAL + PostgreSQL local. Aucun déploiement Cloudflare réel.');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
