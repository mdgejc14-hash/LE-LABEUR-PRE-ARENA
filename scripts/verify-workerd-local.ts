/**
 * LE LABEUR — P0-C / P0-E3 / P0-E4 / P0-E5 / P0-DISPUTE-1 — vérification du Worker dans le runtime workerd
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
 *    withdraw) s'exécute sous workerd et persiste dans PostgreSQL ;
 *  - le cycle PROPOSITION P0-E5 (émission, acceptation, expiration, REVISE
 *    fermé, tiers refusé) s'exécute sous workerd et persiste dans PostgreSQL ;
 *  - le cycle CONTRAT P0-F (création depuis une proposition ACCEPTED, envoi,
 *    double signature, activation, fin COMPLETED, rupture TERMINATED en M2,
 *    protection M1, états terminaux) s'exécute sous workerd et persiste dans
 *    PostgreSQL ;
 *  - P0-AUTO-2 : l'activation produite SOUS workerd écrit `CONTRACT_ACTIVATED`
 *    dans l'Outbox PostgreSQL, puis le worker d'automatisation (runtime local,
 *    AUCUN Cron ni Queue Cloudflare de production) le consomme et crée
 *    réellement l'échéancier salarial, l'échéancier de commission, les
 *    échéances et les jobs de rappel — avec audit, idempotence et escalade J+3.
 *
 * Ce que ce script NE prouve PAS :
 *  - il n'y a ni compte Cloudflare, ni Hyperdrive déployé, ni `wrangler deploy`,
 *    ni base managée : c'est un runtime workerd LOCAL (TEST/LOCAL). `wrangler
 *    dev --remote` et le déploiement restent UNAVAILABLE dans cette session.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

import { base64UrlEncode, hashSessionToken } from '../src/backend/identity/ids';
import { applyMigrations, loadMigrations } from '../src/backend/persistence/migrationRunner';
import { EXPECTED_MIGRATION_IDS } from '../src/backend/persistence/migrationManifest';
import { toPostgresClientPort } from '../src/backend/persistence/sqlClient';
import { SESSION_COOKIE_NAME } from '../src/backend/identity/cookies';
import { composeWorker } from '../src/backend/api/entry';
import { createPostgresDatabase } from '../src/backend/persistence/postgresDatabase';
import {
  PAYMENT_OVERDUE_GRACE_PERIOD_MS,
  contractActivatedEventId,
} from '../src/domain/contractScheduleAutomation';

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
  console.log(' LE LABEUR — P0-C / P0-E3→E5 / P0-F / P0-AUTO-2 / P0-DISPUTE-1 — runtime workerd + binding Hyperdrive local');
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
  let p0Auto2ContractId = '';

  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('lelabeur');

    await check('Migrations réelles appliquées avant démarrage du Worker', async () => {
      const client = toPostgresClientPort(pool);
      const migrations = loadMigrations(MIGRATIONS_DIR);
      // Attendu dérivé du MANIFESTE (et non d'un nombre écrit en dur) : c'est
      // la cause réelle de l'échec apparu quand `0006_automation_foundation` a
      // été ajoutée sans aligner cette assertion sur le manifeste.
      assert(
        JSON.stringify(migrations.map(migration => migration.id)) === JSON.stringify(EXPECTED_MIGRATION_IDS),
        `migrations du répertoire désalignées du manifeste: ${migrations.map(migration => migration.id).join(', ')}`,
      );
      const applied = await applyMigrations(client, migrations);
      assert(
        applied.applied.length === EXPECTED_MIGRATION_IDS.length,
        `${EXPECTED_MIGRATION_IDS.length} migrations attendues, reçues ${applied.applied.length}`,
      );
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
      // Durée locale de vérification explicite; la configuration produit n'a pas de défaut.
      '--var', 'CLAIM_EVIDENCE_DEADLINE_MS:60000',
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
      // `require` n'existe pas dans ce module ESM : lire le log avec l'import
      // du dessus, sinon l'erreur de diagnostic écrasait la cause réelle.
      throw new Error(`${String((error as Error).message)}\n--- wrangler.log ---\n${readFileSync(wranglerLog, 'utf8').slice(-3000)}`);
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

    await check('P0-PAY-2 workerd : routes webhook fournisseur ouvertes et sécurisées (401 sans signature)', async () => {
      const rootWebhook = await fetch(`${base}/api/webhooks/payment-provider`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      assert(rootWebhook.status === 401, `401 attendu sur webhook racine sans signature, reçu ${rootWebhook.status}`);

      const v1Webhook = await fetch(`${base}/api/v1/webhooks/payment-provider`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      assert(v1Webhook.status === 401, `401 attendu sur webhook v1 sans signature, reçu ${v1Webhook.status}`);
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


    await check('P0-E5 workerd → PostgreSQL : proposition émise, acceptée, expirée ; REVISE et tiers refusés', async () => {
      // Offre dédiée (le couple offre/candidat de P0-E3/E4 est déjà consommé).
      const createOffer = await fetch(`${base}/api/v1/offers`, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0e5-workerd-offer-001',
        },
        body: JSON.stringify({
          title: 'Offre workerd P0-E5',
          contractType: 'CDI',
          remuneration: 175000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre utilisée pour vérifier le cycle PROPOSITION worker réel.',
        }),
      });
      assert(createOffer.status === 201, `création offre P0-E5 : 201 attendu, reçu ${createOffer.status}`);
      const offer = await createOffer.json() as { id: string; status: string };
      assert(offer.status === 'ACTIVE', 'offre P0-E5 ACTIVE attendue');

      const submission = await fetch(`${base}/api/v1/offers/${offer.id}/applications`, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0e5-workerd-application-001',
        },
        body: JSON.stringify({ note: 'Candidature pour le cycle PROPOSITION.' }),
      });
      assert(submission.status === 201, `soumission P0-E5 : 201 attendu, reçu ${submission.status}`);
      const application = await submission.json() as { id: string; status: string };
      assert(application.status === 'PENDING', 'candidature admissible PENDING attendue');

      const employerProposalHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const candidateProposalHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const proposalBody = {
        offerId: offer.id,
        applicationId: application.id,
        missionTitle: 'Mission workerd P0-E5',
        amount: 175000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 6,
        location: 'Cotonou',
        conditions: ['Temps plein'],
      };

      // 1. ÉMISSION — SENT réellement persisté par workerd.
      const created = await fetch(`${base}/api/v1/conversations/cnv_p0e5_workerd/proposals`, {
        method: 'POST',
        headers: employerProposalHeaders('p0e5-workerd-proposal-001'),
        body: JSON.stringify(proposalBody),
      });
      assert(created.status === 201, `création proposition 201 attendue, reçue ${created.status}`);
      const proposal = await created.json() as { id: string; status: string; employerId: string; employeeId: string };
      assert(proposal.status === 'SENT', `SENT attendu, reçu ${proposal.status}`);
      assert(proposal.employerId === employerId && proposal.employeeId === userId, 'parties dérivées côté serveur');
      const stored = await pool.query<{ status: string; application_id: string; amount: string }>(
        'SELECT status, application_id, amount FROM proposals WHERE id = $1', [proposal.id],
      );
      assert(stored.rows[0]?.status === 'SENT', 'SENT persisté dans PostgreSQL par workerd');
      assert(stored.rows[0]?.application_id === application.id && Number(stored.rows[0]?.amount) === 175000, 'données métier persistées');

      // 2. Tiers refusé (403) et REVISE fermé (501), sans écriture.
      const otherEmployerExpire = await fetch(`${base}/api/v1/proposals/${proposal.id}/expire`, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${otherEmployerCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0e5-workerd-other-employer-001',
        },
        body: '{}',
      });
      assert(otherEmployerExpire.status === 403, `autre employeur refusé (403), reçu ${otherEmployerExpire.status}`);
      const revise = await fetch(`${base}/api/v1/proposals/${proposal.id}/respond`, {
        method: 'POST',
        headers: candidateProposalHeaders('p0e5-workerd-revise-001'),
        body: JSON.stringify({ action: 'REVISE', notes: 'Ajuster.' }),
      });
      assert(revise.status === 501, `REVISE doit rester fermé (501), reçu ${revise.status}`);

      // 3. ACCEPTATION + rejeu idempotent + refus d'une seconde réponse.
      const accepted = await fetch(`${base}/api/v1/proposals/${proposal.id}/respond`, {
        method: 'POST',
        headers: candidateProposalHeaders('p0e5-workerd-accept-001'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      });
      assert(accepted.status === 200, `acceptation 200 attendue, reçue ${accepted.status}`);
      assert(((await accepted.json()) as { status: string }).status === 'ACCEPTED', 'ACCEPTED attendu');
      const replay = await fetch(`${base}/api/v1/proposals/${proposal.id}/respond`, {
        method: 'POST',
        headers: candidateProposalHeaders('p0e5-workerd-accept-001'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      });
      assert(replay.status === 200, `rejeu idempotent 200 attendu, reçu ${replay.status}`);
      const afterAccept = await pool.query<{ status: string }>('SELECT status FROM proposals WHERE id = $1', [proposal.id]);
      assert(afterAccept.rows[0]?.status === 'ACCEPTED', 'ACCEPTED persisté une seule fois');
      const closed = await fetch(`${base}/api/v1/proposals/${proposal.id}/respond`, {
        method: 'POST',
        headers: candidateProposalHeaders('p0e5-workerd-accept-002'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      });
      assert(closed.status === 409, `proposition close : 409 attendu, reçu ${closed.status}`);

      // 4. Frontière exacte : l'acceptation seule ne crée aucun contrat (la
      //    création est une action P0-F explicite), ni offre FILLED.
      const contracts = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM contracts WHERE application_id = $1', [application.id],
      );
      assert(Number(contracts.rows[0]?.count ?? 0) === 0, 'l’acceptation P0-E5 ne crée aucun contrat (création explicite en P0-F)');
      const offerRow = await pool.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [offer.id]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'l’offre reste ACTIVE (aucun FILLED en P0-E5)');

      // 5. EXPIRATION explicite par l'émetteur, puis réponse refusée.
      const second = await fetch(`${base}/api/v1/conversations/cnv_p0e5_workerd/proposals`, {
        method: 'POST',
        headers: employerProposalHeaders('p0e5-workerd-proposal-002'),
        body: JSON.stringify({ ...proposalBody, missionTitle: 'Mission workerd P0-E5 à expirer' }),
      });
      assert(second.status === 201, `seconde proposition 201 attendue, reçue ${second.status}`);
      const secondProposal = await second.json() as { id: string };
      const expired = await fetch(`${base}/api/v1/proposals/${secondProposal.id}/expire`, {
        method: 'POST',
        headers: employerProposalHeaders('p0e5-workerd-expire-001'),
        body: '{}',
      });
      assert(expired.status === 200, `expiration 200 attendue, reçue ${expired.status}`);
      assert(((await expired.json()) as { status: string }).status === 'EXPIRED', 'EXPIRED attendu');
      const expiredRow = await pool.query<{ status: string }>('SELECT status FROM proposals WHERE id = $1', [secondProposal.id]);
      assert(expiredRow.rows[0]?.status === 'EXPIRED', 'EXPIRED persisté dans PostgreSQL');
      const acceptExpired = await fetch(`${base}/api/v1/proposals/${secondProposal.id}/respond`, {
        method: 'POST',
        headers: candidateProposalHeaders('p0e5-workerd-accept-expired-001'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      });
      assert(acceptExpired.status === 409, `proposition expirée : 409 attendu, reçu ${acceptExpired.status}`);
    });

    await check('P0-F workerd → PostgreSQL : contrat créé depuis ACCEPTED, envoyé, signé, activé, terminé (COMPLETED) et rompu (TERMINATED, M2)', async () => {
      const ownerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const workerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });

      /** Chaîne réelle offre → candidature → proposition acceptée → contrat ACTIVE. */
      const buildActiveContract = async (suffix: string): Promise<{
        contractId: string;
        offerId: string;
        applicationId: string;
      }> => {
        const offerResponse = await fetch(`${base}/api/v1/offers`, {
          method: 'POST',
          headers: ownerHeaders(`p0f-workerd-offer-${suffix}`),
          body: JSON.stringify({
            title: `Offre workerd P0-F ${suffix}`,
            contractType: 'CDI',
            remuneration: 175000,
            currency: 'FCFA',
            location: 'Cotonou',
            summary: 'Offre utilisée pour vérifier le cycle CONTRAT worker réel.',
          }),
        });
        assert(offerResponse.status === 201, `création offre ${suffix} : 201 attendu, reçu ${offerResponse.status}`);
        const offer = await offerResponse.json() as { id: string; status: string };
        assert(offer.status === 'ACTIVE', 'offre ACTIVE attendue');

        const applicationResponse = await fetch(`${base}/api/v1/offers/${offer.id}/applications`, {
          method: 'POST',
          headers: workerHeaders(`p0f-workerd-application-${suffix}`),
          body: JSON.stringify({ note: `Candidature CONTRAT ${suffix}.` }),
        });
        assert(applicationResponse.status === 201, `soumission ${suffix} : 201 attendu, reçue ${applicationResponse.status}`);
        const application = await applicationResponse.json() as { id: string; status: string };

        const proposalResponse = await fetch(`${base}/api/v1/conversations/cnv_p0f_workerd/proposals`, {
          method: 'POST',
          headers: ownerHeaders(`p0f-workerd-proposal-${suffix}`),
          body: JSON.stringify({
            offerId: offer.id,
            applicationId: application.id,
            missionTitle: `Mission workerd P0-F ${suffix}`,
            amount: 175000,
            currency: 'FCFA',
            periodicity: 'Mensuel',
            startDate: '01 Novembre 2026',
            durationMonths: 6,
            location: 'Cotonou',
            conditions: ['Temps plein'],
          }),
        });
        assert(proposalResponse.status === 201, `proposition ${suffix} : 201 attendu, reçue ${proposalResponse.status}`);
        const proposal = await proposalResponse.json() as { id: string };

        const accepted = await fetch(`${base}/api/v1/proposals/${proposal.id}/respond`, {
          method: 'POST',
          headers: workerHeaders(`p0f-workerd-accept-${suffix}`),
          body: JSON.stringify({ action: 'ACCEPT' }),
        });
        assert(accepted.status === 200, `acceptation ${suffix} : 200 attendu, reçue ${accepted.status}`);

        const created = await fetch(`${base}/api/v1/contracts`, {
          method: 'POST',
          headers: ownerHeaders(`p0f-workerd-contract-${suffix}`),
          body: JSON.stringify({ proposalId: proposal.id }),
        });
        assert(created.status === 201, `création contrat ${suffix} : 201 attendu, reçue ${created.status}`);
        const contract = await created.json() as { id: string; status: string };
        assert(contract.status === 'DRAFT', `DRAFT attendu, reçu ${contract.status}`);

        const sent = await fetch(`${base}/api/v1/contracts/${contract.id}/send`, {
          method: 'POST',
          headers: ownerHeaders(`p0f-workerd-send-${suffix}`),
          body: '{}',
        });
        assert(sent.status === 200, `envoi ${suffix} : 200 attendu, reçu ${sent.status}`);
        const signed = await fetch(`${base}/api/v1/contracts/${contract.id}/sign`, {
          method: 'POST',
          headers: workerHeaders(`p0f-workerd-sign-${suffix}`),
          body: '{}',
        });
        assert(signed.status === 200, `signature salarié ${suffix} : 200 attendue, reçue ${signed.status}`);
        const activated = await fetch(`${base}/api/v1/contracts/${contract.id}/activate`, {
          method: 'POST',
          headers: ownerHeaders(`p0f-workerd-activate-${suffix}`),
          body: '{}',
        });
        assert(activated.status === 200, `activation ${suffix} : 200 attendue, reçue ${activated.status}`);
        assert(((await activated.json()) as { status: string }).status === 'ACTIVE', `ACTIVE attendu (${suffix})`);

        return { contractId: contract.id, offerId: offer.id, applicationId: application.id };
      };

      // 1. Cycle nominal : DRAFT → SIGNATURE → ACTIVE → COMPLETED.
      const completed = await buildActiveContract('completed-001');
      const storedDraft = await pool.query<{
        status: string; proposal_id: string | null; application_id: string | null;
        employer_signed: boolean; employee_signed: boolean;
      }>(
        'SELECT status, proposal_id, application_id, employer_signed, employee_signed FROM contracts WHERE id = $1',
        [completed.contractId],
      );
      assert(storedDraft.rows[0]?.proposal_id !== null && storedDraft.rows[0]?.application_id !== null, 'liens proposition/candidature persistés');
      assert(storedDraft.rows[0]?.employer_signed === true && storedDraft.rows[0]?.employee_signed === true, 'double signature persistée');

      const ended = await fetch(`${base}/api/v1/contracts/${completed.contractId}/end`, {
        method: 'POST',
        headers: ownerHeaders('p0f-workerd-end-001'),
        body: '{}',
      });
      assert(ended.status === 200, `fin 200 attendue, reçue ${ended.status}`);
      assert(((await ended.json()) as { status: string }).status === 'COMPLETED', 'COMPLETED attendu (ENDED du plan)');
      const endReplay = await fetch(`${base}/api/v1/contracts/${completed.contractId}/end`, {
        method: 'POST',
        headers: ownerHeaders('p0f-workerd-end-002'),
        body: '{}',
      });
      assert(endReplay.status === 409, `fin après fin : 409 attendu, reçu ${endReplay.status}`);
      const activateAfterEnd = await fetch(`${base}/api/v1/contracts/${completed.contractId}/activate`, {
        method: 'POST',
        headers: ownerHeaders('p0f-workerd-activate-after-end-001'),
        body: '{}',
      });
      assert(activateAfterEnd.status === 409, `ENDED → ACTIVE interdit : 409 attendu, reçu ${activateAfterEnd.status}`);

      // 2. Rupture : M1 protégé, M2 autorisé et persisté.
      const terminated = await buildActiveContract('terminated-001');
      const inFirstMonth = await fetch(`${base}/api/v1/contracts/${terminated.contractId}/terminate`, {
        method: 'POST',
        headers: ownerHeaders('p0f-workerd-terminate-m1-001'),
        body: JSON.stringify({ reason: 'Rupture M1 interdite.' }),
      });
      assert(inFirstMonth.status === 409, `terminaison M1 : 409 attendu, reçu ${inFirstMonth.status}`);
      await pool.query('UPDATE contracts SET current_month = 2 WHERE id = $1', [terminated.contractId]);
      const termination = await fetch(`${base}/api/v1/contracts/${terminated.contractId}/terminate`, {
        method: 'POST',
        headers: ownerHeaders('p0f-workerd-terminate-001'),
        body: JSON.stringify({ reason: 'Fin de mission anticipée convenue (vérification workerd).' }),
      });
      assert(termination.status === 200, `terminaison M2 : 200 attendue, reçue ${termination.status}`);
      assert(((await termination.json()) as { status: string }).status === 'TERMINATED', 'TERMINATED attendu');
      const signAfterTerminate = await fetch(`${base}/api/v1/contracts/${terminated.contractId}/sign`, {
        method: 'POST',
        headers: workerHeaders('p0f-workerd-sign-after-terminate-001'),
        body: '{}',
      });
      assert(signAfterTerminate.status === 409, `signature après terminaison : 409 attendu, reçue ${signAfterTerminate.status}`);

      // 3. Historique et absence d'automatisation post-contrat.
      const historyRow = await pool.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM contracts WHERE id = $1', [completed.contractId],
      );
      assert(historyRow.rows[0]?.status === 'COMPLETED', 'COMPLETED persisté par workerd');
      const contractHistory = (typeof historyRow.rows[0]?.history === 'string'
        ? JSON.parse(String(historyRow.rows[0]?.history))
        : historyRow.rows[0]?.history) as Array<{ event: string }>;
      for (const event of ['CONTRACT_CREATED', 'EMPLOYER_SIGNED', 'EMPLOYEE_SIGNED', 'CONTRACT_ACTIVATED_BILATERAL', 'CONTRACT_COMPLETED']) {
        assert(contractHistory.some(entry => entry.event === event), `événement ${event} absent de l’historique persisté`);
      }
      const offerRow = await pool.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [completed.offerId]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'FILLED reste l’étape d’automatisation post-contrat à venir');
      const applicationRow = await pool.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM applications WHERE id = $1', [completed.applicationId],
      );
      assert(applicationRow.rows[0]?.status === 'PENDING', 'HIRED/CONTRACTED restent l’étape d’automatisation post-contrat');
      assert(applicationRow.rows[0]?.contract_id === completed.contractId, 'candidature rattachée à son contrat');
    });

    await check('P0-AUTO-2 workerd → PostgreSQL → Outbox → Queue → Worker → AutomationEngine : échéancier, échéances et rappels réels', async () => {
      const ownerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const workerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });

      // 1. Chaîne réelle produite PAR LE RUNTIME workerd. Date de début
      //    antérieure à l’exécution : les échéances M1 sont réellement échues,
      //    ce qui permet de vérifier les rappels J+3 sans inventer de règle.
      const offerResponse = await fetch(`${base}/api/v1/offers`, {
        method: 'POST',
        headers: ownerHeaders('p0auto2-workerd-offer-001'),
        body: JSON.stringify({
          title: 'Offre workerd P0-AUTO-2',
          contractType: 'CDI',
          remuneration: 175000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre utilisée pour vérifier l’automatisation contractuelle sous workerd.',
        }),
      });
      assert(offerResponse.status === 201, `création offre : 201 attendu, reçu ${offerResponse.status}`);
      const offer = await offerResponse.json() as { id: string };

      const applicationResponse = await fetch(`${base}/api/v1/offers/${offer.id}/applications`, {
        method: 'POST',
        headers: workerHeaders('p0auto2-workerd-application-001'),
        body: JSON.stringify({ note: 'Candidature automatisation P0-AUTO-2.' }),
      });
      assert(applicationResponse.status === 201, `soumission : 201 attendu, reçu ${applicationResponse.status}`);
      const application = await applicationResponse.json() as { id: string };

      const proposalResponse = await fetch(`${base}/api/v1/conversations/cnv_p0auto2_workerd/proposals`, {
        method: 'POST',
        headers: ownerHeaders('p0auto2-workerd-proposal-001'),
        body: JSON.stringify({
          offerId: offer.id,
          applicationId: application.id,
          missionTitle: 'Mission workerd P0-AUTO-2',
          amount: 175000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Août 2026',
          durationMonths: 6,
          location: 'Cotonou',
          conditions: ['Temps plein'],
        }),
      });
      assert(proposalResponse.status === 201, `proposition : 201 attendu, reçu ${proposalResponse.status}`);
      const proposal = await proposalResponse.json() as { id: string };

      const accepted = await fetch(`${base}/api/v1/proposals/${proposal.id}/respond`, {
        method: 'POST',
        headers: workerHeaders('p0auto2-workerd-accept-001'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      });
      assert(accepted.status === 200, `acceptation : 200 attendu, reçu ${accepted.status}`);

      const created = await fetch(`${base}/api/v1/contracts`, {
        method: 'POST',
        headers: ownerHeaders('p0auto2-workerd-contract-001'),
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      assert(created.status === 201, `création contrat : 201 attendu, reçu ${created.status}`);
      const contract = await created.json() as { id: string };
      p0Auto2ContractId = contract.id;

      const sent = await fetch(`${base}/api/v1/contracts/${contract.id}/send`, {
        method: 'POST', headers: ownerHeaders('p0auto2-workerd-send-001'), body: '{}',
      });
      assert(sent.status === 200, `envoi : 200 attendu, reçu ${sent.status}`);
      const signed = await fetch(`${base}/api/v1/contracts/${contract.id}/sign`, {
        method: 'POST', headers: workerHeaders('p0auto2-workerd-sign-001'), body: '{}',
      });
      assert(signed.status === 200, `signature : 200 attendu, reçu ${signed.status}`);
      const activated = await fetch(`${base}/api/v1/contracts/${contract.id}/activate`, {
        method: 'POST', headers: ownerHeaders('p0auto2-workerd-activate-001'), body: '{}',
      });
      assert(activated.status === 200, `activation : 200 attendu, reçu ${activated.status}`);
      assert(((await activated.json()) as { status: string }).status === 'ACTIVE', 'ACTIVE attendu');

      // 2. Le runtime workerd a écrit l’événement dans PostgreSQL — et RIEN
      //    d’autre : l’échéancier appartient au worker d’automatisation.
      const eventRow = await pool.query<{ id: string; event_type: string; status: string; attempts: number; payload: unknown }>(
        `SELECT id, event_type, status, attempts, payload FROM automation_outbox
          WHERE aggregate_type = 'contract' AND aggregate_id = $1`,
        [contract.id],
      );
      assert(eventRow.rows.length === 1, `un seul événement attendu, reçus ${eventRow.rows.length}`);
      assert(eventRow.rows[0].event_type === 'CONTRACT_ACTIVATED', 'CONTRACT_ACTIVATED écrit par workerd');
      assert(eventRow.rows[0].id === contractActivatedEventId(contract.id), 'identifiant déterministe');
      assert(eventRow.rows[0].status === 'PENDING', 'événement en attente de son consumer');
      const payload = eventRow.rows[0].payload as Record<string, unknown>;
      for (const field of ['contractId', 'proposalId', 'offerId', 'applicationId', 'occurredAt']) {
        assert(payload[field] !== undefined, `charge utile documentée incomplète: ${field}`);
      }
      const beforeRow = await pool.query<{ payment_schedule: unknown }>(
        'SELECT payment_schedule FROM contracts WHERE id = $1', [contract.id],
      );
      assert((beforeRow.rows[0]?.payment_schedule as unknown[]).length === 0, 'aucun échéancier écrit par la requête HTTP');

      // 3. Worker d’automatisation LOCAL sur le MÊME PostgreSQL réel : parcours
      //    Outbox → Queue (claim FOR UPDATE SKIP LOCKED) → AutomationEngine.
      //    Aucun Cron ni Queue Cloudflare de production n’est utilisé ici.
      const automationDatabase = createPostgresDatabase(toPostgresClientPort(pool));
      const automationComposition = composeWorker(
        { GOOGLE_CLIENT_ID: AUDIENCE, PERSISTENCE: 'postgres' },
        automationDatabase,
        { googleVerifier: { verifyCredential: async () => { throw new Error('non utilisé par l’automatisation'); } } },
      );
      assert(automationComposition.automationWorker !== undefined, 'worker d’automatisation composé sur PostgreSQL réel');

      const drained = await automationComposition.automationWorker!.drainEvents(25);
      const entry = drained.entries.find(item => item.eventId === contractActivatedEventId(contract.id));
      assert(entry !== undefined, `événement réclamé attendu, reçu ${JSON.stringify(drained.entries)}`);
      assert(entry!.result === 'completed', `traitement attendu, reçu ${entry!.result}`);
      const afterEvent = await pool.query<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM automation_outbox WHERE id = $1', [contractActivatedEventId(contract.id)],
      );
      assert(afterEvent.rows[0]?.status === 'PROCESSED' && afterEvent.rows[0]?.attempts === 1, 'événement traité dans PostgreSQL');

      // 4. Échéancier salarial + échéancier de commission réellement persistés.
      const stored = await pool.query<{
        payment_schedule: unknown; monthly_checkpoints: unknown; commission_ledger: unknown;
        commission_amount_due: string; commission_status: string; commission_percentage: string; history: unknown;
      }>(
        `SELECT payment_schedule, monthly_checkpoints, commission_ledger, commission_amount_due,
                commission_status, commission_percentage, history
           FROM contracts WHERE id = $1`,
        [contract.id],
      );
      const schedule = stored.rows[0]?.payment_schedule as Array<Record<string, unknown>>;
      assert(schedule.length === 6, `6 périodes attendues, reçues ${schedule.length}`);
      assert(schedule[0].commissionAmount === 43750 && schedule[0].employeeShareAmount === 131250, '25 % / 75 % en M1');
      assert(schedule[1].commissionAmount === 0 && schedule[1].commissionStatus === 'NOT_APPLICABLE', '0 % en M2+');
      assert(Number(stored.rows[0]?.commission_percentage) === 25, 'règle de 25 % inchangée');
      assert(Number(stored.rows[0]?.commission_amount_due) === 43750, 'commission due M1');
      assert((stored.rows[0]?.monthly_checkpoints as unknown[]).length === 1, 'point de contrôle M1');
      assert((stored.rows[0]?.commission_ledger as unknown[]).length === 1, 'grand livre de commission M1');
      assert(
        schedule.every(item => item.salaryStatus === 'SCHEDULED' && item.salaryTransactionId === undefined),
        'aucun paiement réel effectué',
      );
      const history = stored.rows[0]?.history as Array<{ event: string }>;
      for (const event of ['CONTRACT_ACTIVATED_BILATERAL', 'PAYMENT_SCHEDULE_CREATED']) {
        assert(history.some(item => item.event === event), `événement ${event} absent de l’historique`);
      }

      // 5. Échéances et rappels persistés, aucun doublon au rejeu.
      const deadlines = await pool.query<{ count: string; grace: string; escalation: string }>(
        `SELECT count(*)::text AS count,
                min(grace_period_ms)::text AS grace,
                min(escalation) AS escalation
           FROM automation_deadlines WHERE aggregate_id = $1`,
        [contract.id],
      );
      assert(Number(deadlines.rows[0]?.count ?? 0) === 7, `7 échéances attendues, reçues ${deadlines.rows[0]?.count}`);
      assert(Number(deadlines.rows[0]?.grace) === PAYMENT_OVERDUE_GRACE_PERIOD_MS, 'grâce J+3 réelle');
      assert(deadlines.rows[0]?.escalation === 'PAYMENT_OVERDUE_J3', 'escalade réelle');
      const jobs = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_jobs WHERE aggregate_id = $1', [contract.id],
      );
      assert(Number(jobs.rows[0]?.count ?? 0) === 14, `14 rappels attendus, reçus ${jobs.rows[0]?.count}`);

      const replay = await automationComposition.automationWorker!.drainEvents(25);
      assert(
        replay.entries.every(item => item.eventId !== contractActivatedEventId(contract.id)),
        'un événement déjà traité n’est jamais réclamé deux fois',
      );
      const afterReplay = await pool.query<{ count: string }>(
        `SELECT (SELECT count(*) FROM automation_deadlines WHERE aggregate_id = $1)
              + (SELECT count(*) FROM automation_jobs WHERE aggregate_id = $1) AS count`,
        [contract.id],
      );
      assert(Number(afterReplay.rows[0]?.count ?? 0) === 21, 'aucun doublon d’échéance ni de rappel au rejeu');

      // 6. Rappels échus : événements préparés, escalade J+3, AUCUN canal.
      await pool.query(
        `UPDATE contracts
            SET payment_schedule = (
              SELECT jsonb_agg(
                CASE WHEN (entry->>'monthNumber')::int = 1
                  THEN entry || '{"salaryStatus":"DUE","commissionStatus":"DUE"}'::jsonb
                  ELSE entry
                END ORDER BY (entry->>'monthNumber')::int)
                FROM jsonb_array_elements(payment_schedule) AS entry
            )
          WHERE id = $1`,
        [contract.id],
      );
      const reminders = await automationComposition.automationWorker!.runDueJobs(50);
      const reminderEntries = reminders.entries.filter(item => item.contractId === contract.id);
      assert(reminderEntries.length >= 4, `au moins 4 rappels M1 échus, reçus ${reminderEntries.length}`);
      // M1 est la seule période basculée en DUE : les rappels vérifiés sont ceux
      // de M1, identifiés par leur référence d'échéancier (ordre de claim non
      // garanti par `UPDATE … RETURNING`).
      const m1Reference = `PSE-${contract.id}-M1`;
      const j3 = reminderEntries.find(item => item.jobType === 'SALARY_OVERDUE_J3_REMINDER' && item.jobId.endsWith(m1Reference))!;
      assert(j3 !== undefined, 'rappel J+3 de M1 attendu');
      assert(j3.outcome?.eligibility === 'ELIGIBLE', `rappel J+3 éligible attendu, reçu ${j3.outcome?.eligibility}`);
      assert(j3.outcome?.daysLate! >= 3, `J+3 réel attendu, reçu ${j3.outcome?.daysLate}`);
      assert(j3.outcome?.notificationType === 'PAYMENT_OVERDUE_J3', 'type de notification réel');
      assert(j3.outcome?.deadlineStatus === 'ESCALATED', 'échéance escaladée');

      const dueReminder = reminderEntries.find(item => item.jobType === 'SALARY_DUE_REMINDER' && item.jobId.endsWith(m1Reference))!;
      assert(dueReminder.outcome?.eligibility === 'ELIGIBLE', 'rappel à échéance éligible');
      assert(dueReminder.outcome?.notificationType === 'MONTHLY_CHECKPOINT', 'type de notification réel');

      // M2 reste SCHEDULED : le basculement appartient au cycle paiements, non
      // ouvert — aucun événement n'est inventé.
      const m2Reference = `PSE-${contract.id}-M2`;
      const m2Due = reminderEntries.find(item => item.jobType === 'SALARY_DUE_REMINDER' && item.jobId.endsWith(m2Reference))!;
      assert(m2Due !== undefined, 'rappel de M2 échu attendu');
      assert(m2Due.outcome?.eligibility === 'NOT_ELIGIBLE', `M2 non éligible attendu, reçu ${m2Due.outcome?.eligibility}`);
      assert(m2Due.outcome?.eventId === null, 'aucun événement inventé pour une échéance non basculée');
      assert(String(m2Due.outcome?.reason ?? '').includes('cycle paiements'), 'la raison documente la règle absente');

      const notificationEvents = await pool.query<{ event_type: string; status: string; attempts: number; payload: unknown }>(
        `SELECT event_type, status, attempts, payload FROM automation_outbox
          WHERE aggregate_id = $1 AND event_type IN ('NOTIFICATION_REQUIRED', 'PAYMENT_OVERDUE_J3')`,
        [contract.id],
      );
      assert(notificationEvents.rows.length >= 4, `événements préparés attendus, reçus ${notificationEvents.rows.length}`);
      for (const row of notificationEvents.rows) {
        assert((row.payload as Record<string, unknown>).channel === null, 'AUCUN canal de notification');
        assert(row.status === 'PENDING' && row.attempts === 0, 'aucun consumer : événement préparé, jamais envoyé');
      }
      const channels = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%notification%' OR table_name ILIKE '%email%' OR table_name ILIKE '%sms%'
                 OR table_name ILIKE '%whatsapp%' OR table_name ILIKE '%push%')`,
      );
      assert(channels.rows.length === 0, 'aucune table de canal de notification');

      // 7. Post-contractuel NON ouvert : offre et candidature inchangées.
      const offerRow = await pool.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [offer.id]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'aucun passage FILLED (tranche post-contractuelle dédiée)');
      const applicationRow = await pool.query<{ status: string }>(
        'SELECT status FROM applications WHERE id = $1', [application.id],
      );
      assert(applicationRow.rows[0]?.status === 'PENDING', 'aucun HIRED / CONTRACTED produit');

      // 8. Audit réel dans PostgreSQL.
      const audit = await pool.query<{ action: string; actor_id: string; source: string; event_id: string | null }>(
        `SELECT action, actor_id, source, event_id FROM automation_audit_ledger WHERE entity_id = $1`,
        [contract.id],
      );
      for (const action of ['CONTRACT_SCHEDULE_CREATED', 'CONTRACT_PAYMENT_DEADLINES_CREATED', 'CONTRACT_REMINDER_JOBS_SCHEDULED', 'SCHEDULE_J3_ELIGIBILITY_RECORDED']) {
        assert(audit.rows.some(row => row.action === action), `action d’audit manquante: ${action}`);
      }
      // P0-PAY-1 : le cycle paiements écrit SA propre trace sur le même contrat,
      // sous sa source — les deux automatisations restent attribuables.
      assert(
        audit.rows.some(row => row.action === 'PAYMENTS_MATERIALIZED' && row.source === 'automation:P0-PAY-1'),
        'la matérialisation du cycle paiements est tracée sous sa source propre',
      );
      assert(
        audit.rows.every(row => row.actor_id === 'SYSTEM' && (
          row.source === 'automation:P0-AUTO-2'
          || (row.source === 'automation:P0-PAY-1' && row.action === 'PAYMENTS_MATERIALIZED')
        )),
        'source et acteur réels de l’automatisation',
      );

      // Un paiement par échéance de l’échéancier, tous encore SCHEDULED : le cycle
      // matériel des états métier, il n’exécute aucun paiement.
      const cycle = await pool.query<{ rows: number; scheduled: number }>(
        `SELECT count(*)::int AS rows,
                count(*) FILTER (WHERE status <> 'SCHEDULED')::int AS scheduled
           FROM payments WHERE contract_id = $1`,
        [contract.id],
      );
      assert(cycle.rows[0]?.rows === 7, `7 lignes de paiement attendues (6 salaires + 1 commission), reçues ${String(cycle.rows[0]?.rows)}`);
      assert(cycle.rows[0]?.scheduled === 0, 'aucun paiement sorti de SCHEDULED sans échéance atteinte');
      const declarations = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payment_declarations',
      );
      assert(Number(declarations.rows[0]?.count ?? 0) === 0, 'aucune déclaration inventée par l’automatisation');
      assert(
        audit.rows.some(row => row.event_id === contractActivatedEventId(contract.id)),
        'eventId tracé dans l’audit',
      );
    });

    await check('P0-SALARY-1 workerd → PostgreSQL : éligibilité, OTP non exposé, nonce, audit de refus', async () => {
      const salary = await pool.query<{ id: string }>(
        "SELECT id FROM payments WHERE contract_id=$1 AND payment_type='SALARY' AND month_number=1",
        [p0Auto2ContractId],
      );
      const fee = await pool.query<{ id: string }>("SELECT id FROM payments WHERE payment_type='PLATFORM_FEE' LIMIT 1");
      assert(salary.rows[0] && fee.rows[0], 'paiements du contrat attendus');
      const send = (id: string, cookie: string, key: string, body: object = {}) => fetch(`${base}/api/v1/payments/${id}/salary-confirmation-request`, {
        method: 'POST', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
      });
      const scheduled = await send(salary.rows[0].id, employerCookie, 'salary-workerd-scheduled');
      assert(scheduled.status !== 200, 'SCHEDULED non éligible sous workerd');
      const commission = await send(fee.rows[0].id, employerCookie, 'salary-workerd-fee');
      assert(commission.status !== 200, 'commission non éligible sous workerd');
      // Fixture locale: PAID est un état métier injecté par SQL; aucun transfert de fonds.
      await pool.query(`UPDATE payments SET status='PAID', submitted_at=now(), reference='LOCAL-TEST',
        current_declaration_id='LOCAL-TEST', verified_at=now() WHERE id=$1`, [salary.rows[0].id]);
      const [first, second] = await Promise.all([
        send(salary.rows[0].id, employerCookie, 'salary-workerd-one'),
        send(salary.rows[0].id, employerCookie, 'salary-workerd-one'),
      ]);
      assert(first.status === 200 && second.status === 200, 'demande idempotente sous workerd');
      const response = await first.json() as { nonce: string; otp?: string };
      assert(response.nonce.length === 64 && response.otp === undefined, 'nonce rendu, OTP jamais exposé');
      const rows = await pool.query<{ otp_digest: string }>('SELECT otp_digest FROM salary_confirmations WHERE payment_id=$1', [salary.rows[0].id]);
      assert(rows.rows.length === 1 && rows.rows[0].otp_digest.length === 64, 'une seule preuve, OTP hashé');
      const refused = await fetch(`${base}/api/v1/payments/${salary.rows[0].id}/salary-confirmation`, {
        method: 'POST', headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`, 'content-type': 'application/json', 'Idempotency-Key': 'salary-workerd-refused' },
        body: JSON.stringify({ otp: '000000', nonce: 'invalid' }),
      });
      assert(refused.status !== 200, 'nonce invalide refusé par workerd');
      const audit = await pool.query<{ action: string }>("SELECT action FROM automation_audit_ledger WHERE entity_id=$1 AND action='SALARY_CONFIRMATION_CONFLICT'", [salary.rows[0].id]);
      assert(audit.rows.length === 1, 'audit durable de rejet');
    });

    await check('P0-DISPUTE-1 workerd → PostgreSQL : Claim, parties authentifiées, preuve en attente et deadline configurée', async () => {
      const payment = await pool.query<{
        id: string; contract_id: string; candidate_id: string; employer_id: string; status: string; confirmed_at: Date | null;
      }>(
        `SELECT p.id,p.contract_id,p.candidate_id,p.employer_id,p.status,proof.confirmed_at
           FROM payments p
           JOIN salary_confirmations proof ON proof.payment_id=p.id
          WHERE p.contract_id=$1 AND p.payment_type='SALARY' AND p.month_number=1 AND p.status='PAID'
            AND proof.contract_id=p.contract_id AND proof.candidate_id=p.candidate_id
            AND proof.employer_id=p.employer_id AND proof.amount=p.amount AND proof.currency=p.currency`,
        [p0Auto2ContractId],
      );
      const target = payment.rows[0];
      assert(target && target.candidate_id === userId && target.employer_id === employerId, 'paiement lié aux parties de la session');
      assert(target.confirmed_at === null, 'preuve encore en attente : aucun constat automatique de faute ou de règlement');
      const create = () => fetch(`${base}/api/v1/claims`, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0-dispute-workerd-create-001',
        },
        body: JSON.stringify({
          contractId: target.contract_id,
          paymentId: target.id,
          type: 'SALARY_NOT_RECEIVED',
          reason: 'Vérification P0-DISPUTE-1 sur le cycle réel.',
        }),
      });
      const response = await create();
      assert(response.status === 201, `201 attendu sous workerd, reçu ${response.status}`);
      const body = await response.json() as { claimId: string; status: string; claimantId: string; respondentId: string; salaryConfirmationId: string };
      assert(body.status === 'OPEN' && body.claimantId === userId && body.respondentId === employerId, 'parties issues de la session et du contrat persisté');
      assert(body.salaryConfirmationId === target.id, 'référence de confirmation dérivée de PostgreSQL');
      const replay = await create();
      const replayBody = await replay.json() as { claimId: string };
      assert(replay.status === 201 && replayBody.claimId === body.claimId, 'rejeu idempotent stable via workerd');
      const outsider = await fetch(`${base}/api/v1/claims/${body.claimId}`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${otherEmployerCookie}` },
      });
      assert(outsider.status === 403, 'employeur tiers refusé par l’API workerd');

      // Le consumer est le worker d’automatisation local sur la même vraie base,
      // sans Cron/Queue Cloudflare de production.
      const automationDatabase = createPostgresDatabase(toPostgresClientPort(pool));
      const automationComposition = composeWorker(
        { GOOGLE_CLIENT_ID: AUDIENCE, PERSISTENCE: 'postgres', CLAIM_EVIDENCE_DEADLINE_MS: '60000' },
        automationDatabase,
        { googleVerifier: { verifyCredential: async () => { throw new Error('non utilisé par le worker Claim'); } } },
      );
      assert(automationComposition.automationWorker !== undefined, 'consumer branché sur les stores PostgreSQL existants');
      const createdDrain = await automationComposition.automationWorker!.drainEvents(50);
      assert(createdDrain.entries.some(entry => entry.aggregateId === body.claimId && entry.eventType === 'CLAIM_CREATED' && entry.result === 'completed'), 'CLAIM_CREATED consommé');
      const deadlineDrain = await automationComposition.automationWorker!.drainEvents(50);
      assert(deadlineDrain.entries.some(entry => entry.aggregateId === body.claimId && entry.eventType === 'CLAIM_EVIDENCE_REQUESTED' && entry.result === 'completed'), 'CLAIM_EVIDENCE_REQUESTED consommé');
      const claim = await pool.query<{ status: string; resolved_by: string | null; due_at: Date | null; salary_confirmation_id: string }>(
        'SELECT status,resolved_by,due_at,salary_confirmation_id FROM claims WHERE claim_id=$1', [body.claimId],
      );
      assert(claim.rows[0].status === 'EVIDENCE_REQUESTED' && claim.rows[0].resolved_by === null, 'preuve manquante : aucune résolution ni attribution automatique');
      assert(claim.rows[0].salary_confirmation_id === target.id && claim.rows[0].due_at !== null, 'preuve rattachée et deadline opérateur persistée');
      const evidence = await pool.query<{ status: string; due_at: Date | null; requested_from: string }>(
        'SELECT status,due_at,requested_from FROM claim_evidence_requests WHERE claim_id=$1', [body.claimId],
      );
      const deadline = await pool.query<{ due_at: Date | null; status: string; grace_period_ms: string | null; escalation: string }>(
        "SELECT due_at,status,grace_period_ms,escalation FROM automation_deadlines WHERE aggregate_type='CLAIM' AND aggregate_id=$1",
        [body.claimId],
      );
      const job = await pool.query<{ job_type: string; status: string }>(
        "SELECT job_type,status FROM automation_jobs WHERE aggregate_type='CLAIM' AND aggregate_id=$1", [body.claimId],
      );
      assert(evidence.rows.length === 1 && evidence.rows[0].status === 'PENDING' && evidence.rows[0].requested_from === employerId, 'demande de preuve adressée à l’employeur lié au contrat');
      assert(deadline.rows.length === 1 && deadline.rows[0].status === 'OPEN' && deadline.rows[0].grace_period_ms === null && deadline.rows[0].escalation === 'ADMIN_REVIEW', 'deadline configurée sans grâce inventée');
      assert(Date.parse(String(deadline.rows[0].due_at)) === Date.parse(String(evidence.rows[0].due_at)), 'échéance partagée entre demande, deadline et job');
      assert(job.rows.length === 1 && job.rows[0].job_type === 'CLAIM_EVIDENCE_DEADLINE' && job.rows[0].status === 'PENDING', 'job de deadline dans le scheduler existant');
      const audit = await pool.query<{ action: string }>('SELECT action FROM automation_audit_ledger WHERE entity_id=$1', [body.claimId]);
      assert(audit.rows.some(row => row.action === 'CLAIM_CREATED') && audit.rows.some(row => row.action === 'CLAIM_EVIDENCE_REQUESTED') && audit.rows.some(row => row.action === 'CLAIM_EVIDENCE_DEADLINE_SCHEDULED'), 'ledger audit existant mis à jour');
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
