/**
 * LE LABEUR — P0-C / P0-E3 — vérification réelle de bout en bout.
 *
 *   Worker/API → PostgreSQL réel → réponse
 *
 * Deux sources de base possibles :
 *   1. une URL fournie par l'environnement (`MIGRATION_DATABASE_URL` /
 *      `DATABASE_URL` / `POSTGRES_CONNECTION_STRING`) ;
 *   2. sinon, un moteur PostgreSQL 17.10 RÉEL démarré localement à partir des
 *      binaires natifs `embedded-postgres` (TEST/LOCAL — ni Cloudflare, ni base
 *      managée, ni production).
 *
 * Ce script ne simule rien : les transactions COMMIT/ROLLBACK, les lectures et
 * écritures, les migrations et la sonde `/healthz` s'exécutent sur le moteur.
 * Cloudflare (Hyperdrive, workerd déployé) reste hors de portée ici : aucun
 * compte ni credential n'est disponible, et la sortie le rappelle.
 *
 * Sortie : un rapport PASS/FAIL ligne par ligne ; code de sortie 1 si échec.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeWorker } from '../src/backend/api/entry';
import { SESSION_COOKIE_NAME } from '../src/backend/identity/cookies';
import { createGoogleCredentialVerifier } from '../src/backend/identity/googleVerifier';
import { base64UrlEncode, hashSessionToken, newEntityId, newOpaqueSessionToken } from '../src/backend/identity/ids';
import { createSqlIdentityStores } from '../src/backend/identity/sqlStores';
import { createSqlPermissionStore } from '../src/backend/identity/permissionStore';
import { createSqlUserStore } from '../src/backend/identity/sqlStores';
import { describePostgresTarget, resolvePostgresTarget } from '../src/backend/persistence/config';
import { applyMigrations, loadMigrations, migrationStatus } from '../src/backend/persistence/migrationRunner';
import { createPostgresDatabase } from '../src/backend/persistence/postgresDatabase';
import { createWorkerPostgresClient } from '../src/backend/worker/pgClient';
import { redactSqlSecrets, toPostgresClientPort } from '../src/backend/persistence/sqlClient';
import { resolveRepositoryMode } from '../src/repositories/mode';
import type { GoogleCredentialVerifier, GoogleExternalIdentity } from '../src/backend/productionContracts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');
const DEFAULT_PORT = 55432;
const TEST_AUDIENCE = 'p0c-verify-client.apps.googleusercontent.com';

const results: Array<{ name: string; success: boolean; detail: string }> = [];

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireEnvConnection(): string | undefined {
  return (
    process.env.MIGRATION_DATABASE_URL?.trim()
    || process.env.DATABASE_URL?.trim()
    || process.env.POSTGRES_CONNECTION_STRING?.trim()
    || undefined
  );
}

interface LocalPostgres {
  kind: 'embedded';
  connectionString: string;
  password: string;
  stop(): Promise<void>;
}

async function startEmbeddedPostgres(): Promise<LocalPostgres> {
  const port = Number(process.env.PG_PORT ?? DEFAULT_PORT);
  const dataDir = resolve(REPO_ROOT, '.tmp', 'verify-postgres', `data-${port}`);
  mkdirSync(resolve(REPO_ROOT, '.tmp', 'verify-postgres'), { recursive: true });
  rmSync(dataDir, { recursive: true, force: true });

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
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('lelabeur');
  return {
    kind: 'embedded',
    connectionString: `postgresql://lelabeur:${password}@127.0.0.1:${port}/lelabeur?sslmode=disable`,
    password,
    stop: async () => {
      await postgres.stop().catch(() => undefined);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function waitForDatabase(connectionString: string, attempts = 30): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await pool.query('SELECT 1');
        return;
      } catch (error) {
        if (attempt === attempts) throw error;
        await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
      }
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

interface SignedGoogleCredentials {
  verifier: GoogleCredentialVerifier;
  credentials: Record<string, string>;
  identities: Record<string, GoogleExternalIdentity>;
}

const verifiedIdentities: Record<string, GoogleExternalIdentity> = {
  candidate: {
    subject: 'google-sub-p0c-candidate',
    email: 'candidate.p0c@example.com',
    emailVerified: true,
    displayName: 'Candidate P0-C',
  },
  employer: {
    subject: 'google-sub-p0c-employer',
    email: 'employer.p0c@example.com',
    emailVerified: true,
    displayName: 'Employer P0-C',
  },
  otherEmployer: {
    subject: 'google-sub-p0c-other-employer',
    email: 'other-employer.p0c@example.com',
    emailVerified: true,
    displayName: 'Other Employer P0-C',
  },
};

async function createSignedGoogleCredentials(): Promise<SignedGoogleCredentials> {
  const now = new Date();
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const kid = 'p0c-verify-key';
  const publicJwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid, alg: 'RS256', use: 'sig' };
  const verifier = createGoogleCredentialVerifier({
    audience: TEST_AUDIENCE,
    jwksUrl: 'http://127.0.0.1:1/jwks', // jamais appelé : le fetcher ci-dessous est injecté.
    now: () => now,
    fetcher: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'content-type': 'application/json' },
    }),
  });

  const credentials: Record<string, string> = {};
  for (const [name, identity] of Object.entries(verifiedIdentities)) {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid })));
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: TEST_AUDIENCE,
      sub: identity.subject,
      iat: issuedAt,
      exp: issuedAt + 300,
      email: identity.email,
      email_verified: identity.emailVerified,
      name: identity.displayName,
    })));
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    credentials[name] = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  }
  return { verifier, credentials, identities: verifiedIdentities };
}

function cookieToken(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const token = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header)?.[1];
  assert(token, 'cookie de session attendu');
  return token;
}

function withSession(path: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  return new Request(`https://api.test${path}`, { ...init, headers });
}

async function main(): Promise<void> {
  const providedUrl = requireEnvConnection();
  let local: LocalPostgres | null = null;
  let connectionString: string;
  let sourceLabel: string;

  if (providedUrl) {
    connectionString = providedUrl;
    sourceLabel = 'base fournie par l’environnement';
  } else {
    local = await startEmbeddedPostgres();
    connectionString = local.connectionString;
    sourceLabel = 'PostgreSQL 17.10 RÉEL local (binaire embarqué, TEST/LOCAL)';
  }

  const resolved = resolvePostgresTarget({ PERSISTENCE: 'postgres', POSTGRES_CONNECTION_STRING: connectionString });
  if (!resolved.ok) {
    console.error(`Configuration refusée: ${resolved.reason}`);
    process.exitCode = 2;
    if (local) await local.stop();
    return;
  }
  const descriptor = describePostgresTarget(resolved.target);
  const secrets = [connectionString, local?.password, resolved.target.connectionString];

  console.log('============================================================');
  console.log(' LE LABEUR — P0-C / P0-E3 — vérification Worker/API → PostgreSQL');
  console.log('============================================================');
  console.log(`Source base      : ${sourceLabel}`);
  console.log(`Cible (sans secret): ${descriptor.host}:${descriptor.port}/${descriptor.database} (source=${descriptor.source})`);
  console.log('Cloudflare réel  : NON testé — aucun compte/credential/Hyperdrive dans cette session.');
  console.log('------------------------------------------------------------');

  await waitForDatabase(connectionString);

  const pool = new Pool({ connectionString, max: 5, application_name: 'lelabeur-p0c-verify' });
  const client = toPostgresClientPort(pool);
  const database = createPostgresDatabase(client, { redactSecrets: secrets });
  // Client réel du Worker (pg + pool plafonné), construit exactement comme
  // l'entrée Cloudflare le fait à partir de la cible résolue.
  const workerClient = createWorkerPostgresClient(resolved.target);
  const compositionClient = toPostgresClientPort({
    query: (sql, values) => workerClient.client.query(sql, values),
    async connect() {
      const handle = await workerClient.client.acquire();
      return {
        query: (sql, values) => handle.query(sql, values),
        release: () => { void handle.release(); },
      };
    },
  });

  try {
    const migrations = loadMigrations(MIGRATIONS_DIR);

    await check('Connexion PostgreSQL réelle (SELECT 1)', async () => {
      const health = await database.check();
      assert(health.reachable, `base injoignable: ${health.error ?? 'inconnu'}`);
      assert(typeof health.latencyMs === 'number', 'latence attendue');
    });

    let migrationResult: Awaited<ReturnType<typeof applyMigrations>> | null = null;
    await check('Migrations 0001→0003 appliquées sur le moteur réel', async () => {
      migrationResult = await applyMigrations(client, migrations, {
        statementTimeoutMs: 15000,
        onProgress: message => console.log(`     ${message}`),
      }, secrets);
      const status = await migrationStatus(client, migrations);
      const expected = migrations.map(migration => migration.id);
      assert(status.pending.length === 0, `migrations en attente: ${status.pending.join(', ')}`);
      for (const id of expected) assert(status.applied.includes(id), `migration non tracée: ${id}`);
    });

    await check('Idempotence : une seconde exécution ne rejoue aucune migration', async () => {
      const second = await applyMigrations(client, migrations, {}, secrets);
      assert(second.applied.length === 0, `migrations rejouées: ${second.applied.join(', ')}`);
      assert(second.skipped.length === migrations.length, 'toutes les migrations doivent être ignorées');
    });

    await check('Schéma attendu présent (identité, RBAC, noyau)', async () => {
      const expectedTables = [
        'users', 'external_identities', 'sessions', 'permissions', 'role_permissions', 'user_permissions',
        'offers', 'applications', 'contracts',
      ];
      const tables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      const names = tables.rows.map(row => row.table_name);
      for (const table of expectedTables) assert(names.includes(table), `table absente: ${table}`);
      const seeded = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM role_permissions WHERE role = $1', ['ADMIN']);
      assert(Number(seeded.rows[0]?.count ?? 0) > 0, 'permissions ADMIN non seedées');
    });

    await check('Transaction COMMIT : écriture visible après validation', async () => {
      const code = `p0c:commit:${newEntityId('ofr')}`;
      await database.run(async transaction => {
        await transaction.query('INSERT INTO permissions (code, description) VALUES ($1, $2)', [code, 'P0-C commit probe']);
      });
      const found = await database.query<{ code: string }>('SELECT code FROM permissions WHERE code = $1', [code]);
      assert(found.rows.length === 1, 'l’écriture validée doit être visible');
      await database.query('DELETE FROM permissions WHERE code = $1', [code]);
    });

    await check('Transaction ROLLBACK : l’échec annule toutes les écritures', async () => {
      const code = `p0c:rollback:${newEntityId('ofr')}`;
      let failed = false;
      try {
        await database.run(async transaction => {
          await transaction.query('INSERT INTO permissions (code, description) VALUES ($1, $2)', [code, 'P0-C rollback probe']);
          throw new Error('échec volontaire pour vérifier le ROLLBACK');
        });
      } catch {
        failed = true;
      }
      assert(failed, 'l’échec doit être propagé');
      const found = await database.query<{ code: string }>('SELECT code FROM permissions WHERE code = $1', [code]);
      assert(found.rows.length === 0, 'aucune ligne ne doit survivre au ROLLBACK');
    });

    await check('users : écriture puis relecture via les stores SQL', async () => {
      const users = createSqlUserStore(database);
      const email = `p0c-store-${Date.now()}@example.com`;
      const created = await users.create({
        id: newEntityId('usr'),
        role: 'CANDIDATE',
        status: 'ACTIVE',
        email,
        displayName: 'Store Probe',
      });
      const byId = await users.findById(created.id);
      const byEmail = await users.findByEmail(email.toUpperCase());
      assert(byId?.id === created.id && byEmail?.id === created.id, 'lecture users incohérente');
      await database.query('DELETE FROM users WHERE id = $1', [created.id]);
    });

    await check('sessions : écriture/lecture, seul le SHA-256 du jeton est stocké', async () => {
      const stores = createSqlIdentityStores(database);
      const userId = newEntityId('usr');
      const token = newOpaqueSessionToken();
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      await stores.transaction(async transaction => {
        await transaction.users.create({
          id: userId,
          role: 'CANDIDATE',
          status: 'ACTIVE',
          email: `p0c-session-${userId}@example.com`,
          displayName: 'Session Probe',
        });
        await transaction.sessions.create({ userId, token, createdAt, expiresAt });
      });
      const session = await stores.sessions.findByToken(token);
      assert(session?.userId === userId, 'session non relue par jeton');
      const stored = await database.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE id = $1', [session!.id]);
      assert(stored.rows[0]?.token_hash === await hashSessionToken(token), 'hash attendu');
      assert(stored.rows[0]?.token_hash !== token, 'le jeton clair ne doit jamais être persisté');
      await database.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await database.query('DELETE FROM users WHERE id = $1', [userId]);
    });

    await check('permissions : lecture SQL du RBAC (role_permissions / user_permissions)', async () => {
      const permissions = createSqlPermissionStore(database);
      const rolePermissions = await permissions.listRolePermissions('ADMIN');
      assert(rolePermissions.includes('users:read:any'), 'permission ADMIN attendue');
      const candidateRole = await permissions.listRolePermissions('CANDIDATE');
      // Constat réel, non masqué : la migration 0002 ne seed que le rôle ADMIN.
      console.log(`     role_permissions CANDIDATE en base: [${candidateRole.join(', ')}] (seed 0002 = ADMIN uniquement)`);
      const effective = await permissions.listEffectivePermissions('usr_absent', 'CANDIDATE');
      assert(Array.isArray(effective), 'lecture effective attendue');
    });

    const google = await createSignedGoogleCredentials();
    const env = {
      GOOGLE_CLIENT_ID: TEST_AUDIENCE,
      PERSISTENCE: 'postgres',
      SESSION_TTL_SECONDS: '3600',
      COOKIE_SECURE: 'false',
      WORKER_ENV: 'local-verify',
      DB_APPLICATION_NAME: 'lelabeur-worker',
      // Chemin de cible identique à un binding : le Worker résout lui-même la
      // chaîne de connexion (ici via le repli documenté, jamais un secret en dur).
      POSTGRES_CONNECTION_STRING: connectionString,
    };
    const composition = composeWorker(env, compositionClient, { googleVerifier: google.verifier });
    assert(composition.mode === 'postgres', `mode postgres attendu, reçu ${composition.mode}`);
    assert(composition.persistence.reason === 'connection-string', `raison attendue connection-string, reçue ${composition.persistence.reason}`);

    await check('/healthz : état réel de la persistence, sans secret', async () => {
      const response = await composition.worker.fetch(new Request('https://api.test/healthz'));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const text = await response.text();
      const body = JSON.parse(text) as {
        status: string;
        persistence: { mode: string; reachable: boolean; durable: boolean; migrations?: { status: string; applied: string[] }; target?: { host?: string } };
        runtime: { declaredEnvironment: string | null };
      };
      assert(body.status === 'ok', `status attendu ok, reçu ${body.status}`);
      assert(body.persistence.mode === 'postgres' && body.persistence.reachable === true, 'persistence réelle attendue');
      assert(body.persistence.durable === true, 'PostgreSQL doit être annoncé durable');
      assert(body.persistence.migrations?.status === 'applied', 'migrations appliquées attendues');
      assert(body.persistence.migrations.applied.length === migrations.length, 'toutes les migrations doivent être listées');
      assert(body.persistence.target?.host === '127.0.0.1', 'hôte de la cible attendu');
      assert(body.runtime.declaredEnvironment === 'local-verify', 'environnement déclaré attendu');
      for (const secret of secrets) {
        if (secret && secret.length >= 8) assert(!text.includes(secret), 'un secret de connexion a fuité dans /healthz');
      }
    });

    let sessionCookie = '';
    let candidateId = '';
    await check('Worker/API → PostgreSQL : credential Google → users + external_identities + sessions', async () => {
      const response = await composition.worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: google.credentials.candidate, requestedRole: 'ADMIN' }),
      }));
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const body = await response.json() as { authenticated: boolean; user: { id: string; role: string; email: string } };
      assert(body.authenticated && body.user.role === 'CANDIDATE', 'ADMIN ne doit pas être auto-attribuable');
      candidateId = body.user.id;
      sessionCookie = cookieToken(response);

      const users = await database.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [candidateId]);
      const identities = await database.query<{ subject: string }>(
        'SELECT subject FROM external_identities WHERE user_id = $1', [candidateId],
      );
      const sessions = await database.query<{ token_hash: string }>(
        'SELECT token_hash FROM sessions WHERE user_id = $1 AND revoked_at IS NULL', [candidateId],
      );
      assert(users.rows[0]?.role === 'CANDIDATE', 'utilisateur réellement écrit');
      assert(identities.rows[0]?.subject === google.identities.candidate.subject, 'identité externe réellement écrite');
      assert(sessions.rows[0]?.token_hash === await hashSessionToken(sessionCookie), 'session hashée en base');
    });

    await check('Worker/API → PostgreSQL : session relue depuis la base (GET /auth/session, GET /me)', async () => {
      const session = await composition.worker.fetch(withSession('/api/v1/auth/session', sessionCookie));
      assert(session.status === 200, `session attendue 200, reçue ${session.status}`);
      const me = await composition.worker.fetch(withSession('/api/v1/me', sessionCookie));
      assert(me.status === 200, `me attendu 200, reçu ${me.status}`);
      const body = await me.json() as { user: { id: string } };
      assert(body.user.id === candidateId, 'acteur résolu depuis PostgreSQL');
    });

    let employerId = '';
    let employerCookie = '';
    let otherEmployerId = '';
    let otherEmployerCookie = '';
    await check('P0-E3 Worker/API → PostgreSQL : CANDIDATE soumet, EMPLOYER propriétaire consulte, tiers refusé', async () => {
      const employerLogin = await composition.worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: google.credentials.employer, requestedRole: 'EMPLOYER' }),
      }));
      assert(employerLogin.status === 201, `connexion EMPLOYER 201 attendue, reçue ${employerLogin.status}`);
      employerId = ((await employerLogin.json()) as { user: { id: string } }).user.id;
      employerCookie = cookieToken(employerLogin);

      const otherEmployerLogin = await composition.worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: google.credentials.otherEmployer, requestedRole: 'EMPLOYER' }),
      }));
      assert(otherEmployerLogin.status === 201, `connexion autre EMPLOYER 201 attendue, reçue ${otherEmployerLogin.status}`);
      otherEmployerId = ((await otherEmployerLogin.json()) as { user: { id: string } }).user.id;
      otherEmployerCookie = cookieToken(otherEmployerLogin);

      const createOffer = await composition.worker.fetch(withSession('/api/v1/offers', employerCookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0c-e3-offer-create-001' },
        body: JSON.stringify({
          title: 'Offre P0-E3 vérification PostgreSQL',
          contractType: 'CDI',
          remuneration: 175000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre créée par le Worker pour tester les candidatures.',
        }),
      }));
      assert(createOffer.status === 201, `création offre 201 attendue, reçue ${createOffer.status}`);
      const offer = await createOffer.json() as { id: string; employerId: string };
      assert(offer.employerId === employerId, 'offre reliée à l’employeur authentifié');

      const submission = await composition.worker.fetch(withSession(`/api/v1/offers/${offer.id}/applications`, sessionCookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0c-e3-application-submit-001' },
        body: JSON.stringify({ note: 'Disponible pour un entretien.' }),
      }));
      assert(submission.status === 201, `soumission 201 attendue, reçue ${submission.status}`);
      const application = await submission.json() as { id: string; offerId: string; candidateId: string; status: string };
      assert(application.offerId === offer.id && application.candidateId === candidateId, 'candidature reliée au bon offerId/candidateId');
      assert(application.status === 'PENDING', 'statut PENDING attendu');

      const persisted = await database.query<{ offer_id: string; candidate_id: string; status: string; note: string | null }>(
        'SELECT offer_id, candidate_id, status, note FROM applications WHERE id = $1', [application.id],
      );
      assert(persisted.rows.length === 1, 'candidature réellement persistée');
      assert(persisted.rows[0].offer_id === offer.id && persisted.rows[0].candidate_id === candidateId, 'références SQL attendues');
      assert(persisted.rows[0].status === 'PENDING' && persisted.rows[0].note === 'Disponible pour un entretien.', 'données métier SQL attendues');

      const ownerList = await composition.worker.fetch(withSession(`/api/v1/offers/${offer.id}/applications?limit=10`, employerCookie));
      assert(ownerList.status === 200, `consultation propriétaire 200 attendue, reçue ${ownerList.status}`);
      const listBody = await ownerList.json() as { items: Array<{ id: string; candidateId: string }>; hasMore: boolean };
      assert(listBody.items.length === 1 && listBody.items[0].id === application.id, 'l’employeur propriétaire consulte cette candidature');
      assert(listBody.items[0].candidateId === candidateId && listBody.hasMore === false, 'liste limitée à l’offre et au candidat persistés');

      const otherEmployer = await composition.worker.fetch(withSession(`/api/v1/offers/${offer.id}/applications`, otherEmployerCookie));
      assert(otherEmployer.status === 403, `autre employeur refusé: 403 attendu, reçu ${otherEmployer.status}`);
      const candidateList = await composition.worker.fetch(withSession(`/api/v1/offers/${offer.id}/applications`, sessionCookie));
      assert(candidateList.status === 403, `candidate refusé sur la liste privée: 403 attendu, reçu ${candidateList.status}`);
      assert(otherEmployerId !== employerId, 'comptes employeurs distincts');
    });

    await check('Worker/API → PostgreSQL : ADMIN provisionné côté serveur + permissions SQL', async () => {
      const adminId = newEntityId('usr');
      const adminToken = newOpaqueSessionToken();
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 3600_000).toISOString();
      const identityStores = createSqlIdentityStores(database);
      await identityStores.transaction(async transaction => {
        await transaction.users.create({
          id: adminId, role: 'ADMIN', status: 'ACTIVE', email: `admin.p0c.${adminId}@example.com`, displayName: 'Admin P0-C',
        });
        await transaction.sessions.create({ userId: adminId, token: adminToken, createdAt, expiresAt });
      });

      // Un ADMIN sans permission SQL ne doit pas passer : vérifie que l'autorisation vient de la base.
      await database.run(async transaction => {
        await transaction.query('DELETE FROM role_permissions WHERE role = $1 AND permission_code = $2', ['ADMIN', 'users:read:any']);
      });
      const denied = await composition.worker.fetch(withSession('/api/v1/admin/users', adminToken));
      assert(denied.status === 403, `403 attendu sans permission SQL, reçu ${denied.status}`);

      await database.run(async transaction => {
        await transaction.query('INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['ADMIN', 'users:read:any']);
      });
      const allowed = await composition.worker.fetch(withSession('/api/v1/admin/users?limit=10', adminToken));
      assert(allowed.status === 200, `200 attendu avec permission SQL, reçu ${allowed.status}`);
      const body = await allowed.json() as { items: Array<{ id: string; role: string }> };
      assert(body.items.some(item => item.id === adminId || item.id === candidateId), 'lecture users via l’API attendue');

      await database.query('DELETE FROM sessions WHERE user_id = $1', [adminId]);
      await database.query('DELETE FROM users WHERE id = $1', [adminId]);
    });

    await check('Worker/API → PostgreSQL : logout révoque la session en base', async () => {
      const response = await composition.worker.fetch(withSession('/api/v1/auth/logout', sessionCookie, { method: 'POST' }));
      assert(response.status === 200, `logout attendu 200, reçu ${response.status}`);
      const revoked = await database.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM sessions WHERE user_id = $1', [candidateId],
      );
      assert(revoked.rows.length > 0 && revoked.rows[0].revoked_at !== null, 'revoked_at doit être persisté');
      const reuse = await composition.worker.fetch(withSession('/api/v1/auth/session', sessionCookie));
      assert(reuse.status === 401, 'une session révoquée doit être refusée');
      await database.query('DELETE FROM sessions WHERE user_id = $1', [candidateId]);
      await database.query('DELETE FROM external_identities WHERE user_id = $1', [candidateId]);
      await database.query('DELETE FROM users WHERE id = $1', [candidateId]);
      if (employerId) await database.query('DELETE FROM users WHERE id = $1', [employerId]);
      if (otherEmployerId) await database.query('DELETE FROM users WHERE id = $1', [otherEmployerId]);
    });

    await check('MODE DEMO inchangé : MockRepository par défaut, API seulement si explicite', () => {
      const demo = resolveRepositoryMode({});
      const demoExplicit = resolveRepositoryMode({ VITE_DEMO_MODE: 'true' });
      const api = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' });
      const apiBlocked = resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: 'https://elsewhere.example.com' });
      assert(demo.mode === 'mock' && demoExplicit.mode === 'mock', 'DEMO doit rester le défaut');
      assert(api.mode === 'api', 'mode API attendu avec chemin same-origin');
      assert(apiBlocked.mode === 'mock', 'aucun chemin non same-origin ne doit activer l’API');
    });
  } catch (error) {
    const message = redactSqlSecrets(String((error as Error)?.message ?? error), secrets);
    console.error(`ERREUR FATALE: ${message}`);
    results.push({ name: 'Exécution globale', success: false, detail: message });
  } finally {
    await workerClient.end().catch(() => undefined);
    await pool.end().catch(() => undefined);
    if (local) await local.stop().catch(() => undefined);
  }

  const failed = results.filter(result => !result.success);
  console.log('------------------------------------------------------------');
  console.log(`Total: ${results.length - failed.length}/${results.length} PASS; ${failed.length} FAIL`);
  console.log(`Cloudflare réel : NON testé (aucun credential) — voir docs/CLOUDFLARE_WORKER_POSTGRES.md`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
