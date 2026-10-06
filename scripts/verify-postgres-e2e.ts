/**
 * LE LABEUR — P0-C / P0-E3 / P0-E4 / P0-E5 — vérification réelle de bout en bout.
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
import { createSqlApplicationStore } from '../src/backend/persistence/sqlCoreStores';
import { describePostgresTarget, resolvePostgresTarget } from '../src/backend/persistence/config';
import { applyMigrations, loadMigrations, migrationStatus } from '../src/backend/persistence/migrationRunner';
import { createPostgresDatabase } from '../src/backend/persistence/postgresDatabase';
import { createWorkerPostgresClient } from '../src/backend/worker/pgClient';
import { redactSqlSecrets, toPostgresClientPort } from '../src/backend/persistence/sqlClient';
import { resolveRepositoryMode } from '../src/repositories/mode';
import {
  PAYMENT_OVERDUE_GRACE_PERIOD_MS,
  contractActivatedEventId,
} from '../src/domain/contractScheduleAutomation';
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
  console.log(' LE LABEUR — P0-C / P0-E3→E5 / P0-F / P0-AUTO-2 — vérification Worker/API → PostgreSQL');
  console.log('============================================================');
  console.log(`Source base      : ${sourceLabel}`);
  console.log(`Cible (sans secret): ${descriptor.host}:${descriptor.port}/${descriptor.database} (source=${descriptor.source})`);
  console.log('Cloudflare réel  : NON testé — aucun compte/credential/Hyperdrive dans cette session.');
  console.log('------------------------------------------------------------');

  await waitForDatabase(connectionString);

  const pool = new Pool({ connectionString, max: 5, application_name: 'lelabeur-p0c-verify' });
  // Une connexion inactive coupée par l'extinction du moteur local ne doit pas
  // produire d'événement 'error' non traité (le résumé de vérification serait
  // perdu alors que tous les contrôles ont réussi).
  pool.on('error', () => undefined);
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
    await check('Migrations 0001→0008 appliquées sur le moteur réel', async () => {
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
        'offers', 'applications', 'contracts', 'proposals',
        // P0-AUTO-1 : outbox, jobs, idempotence, ledger. P0-AUTO-2 : échéances.
        'automation_outbox', 'automation_jobs', 'automation_idempotency',
        'automation_audit_ledger', 'automation_deadlines',
        // P0-PAY-1 : cycle métier des paiements (aucune table de fournisseur).
        'payments', 'payment_declarations',
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
    let p0e3ApplicationId = '';
    let p0e3SecondApplicationId = '';
    let p0e3OfferId = '';
    /** Réaffecté au bloc P0-E5 : offre dédiée à la vérification PROPOSITION. */
    let p0e5OfferId = '';
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
      p0e3OfferId = offer.id;

      const submission = await composition.worker.fetch(withSession(`/api/v1/offers/${offer.id}/applications`, sessionCookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0c-e3-application-submit-001' },
        body: JSON.stringify({ note: 'Disponible pour un entretien.' }),
      }));
      assert(submission.status === 201, `soumission 201 attendue, reçue ${submission.status}`);
      const application = await submission.json() as { id: string; offerId: string; candidateId: string; status: string };
      assert(application.offerId === offer.id && application.candidateId === candidateId, 'candidature reliée au bon offerId/candidateId');
      assert(application.status === 'PENDING', 'statut PENDING attendu');
      p0e3ApplicationId = application.id;

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


    await check('P0-E4 Worker/API → PostgreSQL : EMPLOYER examine, shortliste, rejette; CANDIDATE retire', async () => {
      assert(p0e3ApplicationId, 'la candidature P0-E3 doit exister pour enchaîner le cycle de décision');

      // Seconde candidature PENDING (même offre, autre candidat) : support du
      // rejet avec motif, sans toucher à la candidature du cycle principal.
      const secondCandidateId = newEntityId('usr');
      await createSqlUserStore(database).create({
        id: secondCandidateId,
        role: 'CANDIDATE',
        status: 'ACTIVE',
        email: `p0e4.${secondCandidateId.toLowerCase()}@example.com`,
        displayName: 'Candidat P0-E4',
      });
      p0e3SecondApplicationId = `app_p0e4_${secondCandidateId.slice(4).toLowerCase()}`;
      const secondAppliedAt = new Date().toISOString();
      await createSqlApplicationStore(database).create({
        id: p0e3SecondApplicationId,
        offerId: p0e3OfferId,
        candidateId: secondCandidateId,
        status: 'PENDING',
        appliedDate: secondAppliedAt,
        history: [{ action: 'Candidature transmise', timestamp: secondAppliedAt, actor: 'Candidat P0-E4' }],
        createdAt: secondAppliedAt,
        updatedAt: secondAppliedAt,
      });

      const employerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });

      // 1. EXAMINE — PENDING → REVIEW
      const examined = await composition.worker.fetch(withSession(`/api/v1/applications/${p0e3ApplicationId}/examine`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e4-examine-001'),
        body: '{}',
      }));
      assert(examined.status === 200, `examen 200 attendu, reçu ${examined.status}`);
      let stored: { rows: Array<{ status: string; history: unknown }> } = await database.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM applications WHERE id = $1', [p0e3ApplicationId],
      );
      assert(stored.rows[0]?.status === 'REVIEW', 'REVIEW persisté dans PostgreSQL par le Worker');
      let history = (typeof stored.rows[0]?.history === 'string'
        ? JSON.parse(String(stored.rows[0]?.history))
        : stored.rows[0]?.history) as Array<{ action: string }>;
      assert(history.length === 2, `historique P0-E4 alimenté, reçu ${history.length} entrée(s)`);

      // 2. SHORTLIST — REVIEW → SHORTLISTED
      const shortlisted = await composition.worker.fetch(withSession(`/api/v1/applications/${p0e3ApplicationId}/shortlist`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e4-shortlist-001'),
        body: '{}',
      }));
      assert(shortlisted.status === 200, `shortlist 200 attendu, reçu ${shortlisted.status}`);
      stored = await database.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM applications WHERE id = $1', [p0e3ApplicationId],
      );
      assert(stored.rows[0]?.status === 'SHORTLISTED', 'SHORTLISTED persisté dans PostgreSQL');

      // 3. Un autre employeur ne décide jamais sur cette offre (403)
      const otherEmployerDecision = await composition.worker.fetch(withSession(
        `/api/v1/applications/${p0e3ApplicationId}/reject`,
        otherEmployerCookie,
        {
          method: 'POST',
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${otherEmployerCookie}`,
            'content-type': 'application/json',
            'Idempotency-Key': 'p0c-e4-other-employer-reject-001',
          },
          body: JSON.stringify({ note: 'Refus non autorisé.' }),
        },
      ));
      assert(otherEmployerDecision.status === 403, `autre employeur refusé (403), reçu ${otherEmployerDecision.status}`);

      // 4. Idempotence — même clé, même résultat, une seule transition
      const replay = await composition.worker.fetch(withSession(`/api/v1/applications/${p0e3ApplicationId}/shortlist`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e4-shortlist-001'),
        body: '{}',
      }));
      assert(replay.status === 200, `rejeu 200 attendu, reçu ${replay.status}`);
      stored = await database.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM applications WHERE id = $1', [p0e3ApplicationId],
      );
      history = (typeof stored.rows[0]?.history === 'string'
        ? JSON.parse(String(stored.rows[0]?.history))
        : stored.rows[0]?.history) as Array<{ action: string }>;
      assert(history.length === 3, `aucune entrée d’historique dupliquée au rejeu, reçu ${history.length}`);

      // 5. WITHDRAW par le candidat — SHORTLISTED → WITHDRAWN
      const withdrawn = await composition.worker.fetch(withSession(`/api/v1/applications/${p0e3ApplicationId}/withdraw`, sessionCookie, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0c-e4-withdraw-001',
        },
        body: '{}',
      }));
      assert(withdrawn.status === 200, `retrait 200 attendu, reçu ${withdrawn.status}`);
      stored = await database.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM applications WHERE id = $1', [p0e3ApplicationId],
      );
      assert(stored.rows[0]?.status === 'WITHDRAWN', 'WITHDRAWN persisté dans PostgreSQL');

      // 6. État terminal : plus aucune décision n'est acceptée (409)
      const afterWithdraw = await composition.worker.fetch(withSession(`/api/v1/applications/${p0e3ApplicationId}/examine`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e4-examine-after-withdraw-001'),
        body: '{}',
      }));
      assert(afterWithdraw.status === 409, `décision après retrait: 409 attendu, reçu ${afterWithdraw.status}`);

      // 7. REJECT avec motif sur une candidature restée PENDING (seconde candidature)
      const rejected = await composition.worker.fetch(withSession(`/api/v1/applications/${p0e3SecondApplicationId}/reject`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e4-reject-001'),
        body: JSON.stringify({ note: 'Dossier non retenu (vérification PostgreSQL).' }),
      }));
      assert(rejected.status === 200, `rejet 200 attendu, reçu ${rejected.status}`);
      const rejectedRow = await database.query<{ status: string; note: string | null }>(
        'SELECT status, note FROM applications WHERE id = $1', [p0e3SecondApplicationId],
      );
      assert(rejectedRow.rows[0]?.status === 'REJECTED', 'REJECTED persisté dans PostgreSQL');
      assert(
        rejectedRow.rows[0]?.note === 'Dossier non retenu (vérification PostgreSQL).',
        'motif de rejet persisté dans PostgreSQL',
      );
    });


    await check('P0-E5 Worker/API → PostgreSQL : EMPLOYER envoie, CANDIDATE accepte, expiration et tiers refusés', async () => {
      assert(employerId && candidateId, 'acteurs P0-E3 nécessaires au cycle PROPOSITION');

      const employerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });

      // 0. Offre dédiée + candidature ADMISSIBLE : le couple (offre, candidat)
      //    de P0-E3/E4 est déjà consommé et sa candidature est devenue terminale.
      const dedicatedOffer = await composition.worker.fetch(withSession('/api/v1/offers', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e5-offer-create-001'),
        body: JSON.stringify({
          title: 'Offre P0-E5 vérification PostgreSQL',
          contractType: 'CDI',
          remuneration: 175000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre créée pour vérifier le cycle PROPOSITION.',
        }),
      }));
      assert(dedicatedOffer.status === 201, `création offre P0-E5 : 201 attendu, reçu ${dedicatedOffer.status}`);
      const p0e5Offer = await dedicatedOffer.json() as { id: string; status: string };
      assert(p0e5Offer.status === 'ACTIVE', 'offre P0-E5 ACTIVE attendue');
      p0e5OfferId = p0e5Offer.id;

      const admissible = await composition.worker.fetch(withSession(`/api/v1/offers/${p0e5Offer.id}/applications`, sessionCookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0c-e5-application-submit-001' },
        body: JSON.stringify({ note: 'Disponible pour une proposition.' }),
      }));
      assert(admissible.status === 201, `soumission admissible 201 attendue, reçue ${admissible.status}`);
      const admissibleApplication = await admissible.json() as { id: string; status: string };
      assert(admissibleApplication.status === 'PENDING', 'candidature admissible PENDING attendue');

      const proposalBody = (extra: Record<string, unknown> = {}) => JSON.stringify({
        offerId: p0e5OfferId,
        applicationId: admissibleApplication.id,
        missionTitle: 'Mission P0-E5 vérification PostgreSQL',
        amount: 175000,
        currency: 'FCFA',
        periodicity: 'Mensuel',
        startDate: '01 Novembre 2026',
        durationMonths: 6,
        location: 'Cotonou',
        conditions: ['Temps plein'],
        ...extra,
      });

      // 1. ÉMISSION — EMPLOYER propriétaire : 201, statut SENT persisté.
      const created = await composition.worker.fetch(withSession('/api/v1/conversations/cnv_p0e5_verify/proposals', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e5-proposal-create-001'),
        body: proposalBody(),
      }));
      assert(created.status === 201, `création proposition 201 attendue, reçue ${created.status}`);
      const proposal = await created.json() as { id: string; status: string; employerId: string; employeeId: string };
      assert(proposal.status === 'SENT', `statut SENT attendu, reçu ${proposal.status}`);
      assert(proposal.employerId === employerId && proposal.employeeId === candidateId, 'parties dérivées côté serveur');

      const storedProposal = await database.query<{ status: string; offer_id: string; application_id: string; amount: string }>(
        'SELECT status, offer_id, application_id, amount FROM proposals WHERE id = $1', [proposal.id],
      );
      assert(storedProposal.rows[0]?.status === 'SENT', 'SENT réellement persisté dans PostgreSQL');
      assert(storedProposal.rows[0]?.offer_id === p0e5OfferId && storedProposal.rows[0]?.application_id === admissibleApplication.id, 'références SQL attendues');
      assert(Number(storedProposal.rows[0]?.amount) === 175000, 'montant persisté');

      // 2. Un autre employeur ne peut ni expirer ni répondre (403) ; REVISE reste fermé (501).
      const otherEmployerExpire = await composition.worker.fetch(withSession(`/api/v1/proposals/${proposal.id}/expire`, otherEmployerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e5-other-employer-expire-001'),
        body: '{}',
      }));
      assert(otherEmployerExpire.status === 403, `autre employeur refusé (403), reçu ${otherEmployerExpire.status}`);
      const revise = await composition.worker.fetch(withSession(`/api/v1/proposals/${proposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0c-e5-revise-001',
        },
        body: JSON.stringify({ action: 'REVISE', notes: 'Ajuster le montant.' }),
      }));
      assert(revise.status === 501, `REVISE doit rester fermé (501), reçu ${revise.status}`);

      // 3. ACCEPTATION par le candidat destinataire + rejeu idempotent.
      const accepted = await composition.worker.fetch(withSession(`/api/v1/proposals/${proposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0c-e5-accept-001',
        },
        body: JSON.stringify({ action: 'ACCEPT' }),
      }));
      assert(accepted.status === 200, `acceptation 200 attendue, reçue ${accepted.status}`);
      const acceptedBody = await accepted.json() as { status: string };
      assert(acceptedBody.status === 'ACCEPTED', `ACCEPTED attendu, reçu ${acceptedBody.status}`);
      const replay = await composition.worker.fetch(withSession(`/api/v1/proposals/${proposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0c-e5-accept-001',
        },
        body: JSON.stringify({ action: 'ACCEPT' }),
      }));
      assert(replay.status === 200, `rejeu idempotent 200 attendu, reçu ${replay.status}`);
      const afterAccept = await database.query<{ status: string }>('SELECT status FROM proposals WHERE id = $1', [proposal.id]);
      assert(afterAccept.rows[0]?.status === 'ACCEPTED', 'ACCEPTED persisté une seule fois');
      const terminal = await composition.worker.fetch(withSession(`/api/v1/proposals/${proposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0c-e5-accept-002',
        },
        body: JSON.stringify({ action: 'ACCEPT' }),
      }));
      assert(terminal.status === 409, `proposition close : 409 attendu, reçu ${terminal.status}`);

      // 4. Frontière exacte : l'acceptation seule ne crée aucun contrat (la
      //    création est une action P0-F explicite), ni offre FILLED, ni
      //    candidature modifiée.
      const contracts = await database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM contracts WHERE application_id = $1', [admissibleApplication.id],
      );
      assert(Number(contracts.rows[0]?.count ?? 0) === 0, 'l’acceptation P0-E5 ne crée aucun contrat (création explicite en P0-F)');
      const offerRow = await database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [p0e5OfferId]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'l’offre reste ACTIVE (aucun passage FILLED en P0-E5)');
      const applicationRow = await database.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM applications WHERE id = $1', [admissibleApplication.id],
      );
      assert(applicationRow.rows[0]?.status === 'PENDING', 'la candidature reste PENDING');
      assert(applicationRow.rows[0]?.contract_id === null, 'aucun contrat lié à la candidature');

      // 5. EXPIRATION — même proposition, seconde émission, puis expiration par l'émetteur.
      const second = await composition.worker.fetch(withSession('/api/v1/conversations/cnv_p0e5_verify/proposals', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e5-proposal-create-002'),
        body: proposalBody({ missionTitle: 'Mission P0-E5 à expirer' }),
      }));
      assert(second.status === 201, `seconde proposition 201 attendue, reçue ${second.status}`);
      const secondProposal = await second.json() as { id: string };
      const expired = await composition.worker.fetch(withSession(`/api/v1/proposals/${secondProposal.id}/expire`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0c-e5-expire-001'),
        body: '{}',
      }));
      assert(expired.status === 200, `expiration 200 attendue, reçue ${expired.status}`);
      const expiredBody = await expired.json() as { status: string };
      assert(expiredBody.status === 'EXPIRED', `EXPIRED attendu, reçu ${expiredBody.status}`);
      const expiredRow = await database.query<{ status: string }>('SELECT status FROM proposals WHERE id = $1', [secondProposal.id]);
      assert(expiredRow.rows[0]?.status === 'EXPIRED', 'EXPIRED réellement persisté');
      const acceptExpired = await composition.worker.fetch(withSession(`/api/v1/proposals/${secondProposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
          'content-type': 'application/json',
          'Idempotency-Key': 'p0c-e5-accept-expired-001',
        },
        body: JSON.stringify({ action: 'ACCEPT' }),
      }));
      assert(acceptExpired.status === 409, `proposition expirée : 409 attendu, reçu ${acceptExpired.status}`);
    });

    await check('P0-F Worker/API → PostgreSQL : contrat créé depuis ACCEPTED, envoyé, signé, activé, terminé', async () => {
      assert(employerId && candidateId, 'acteurs P0-E3 nécessaires au cycle CONTRAT');

      const employerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const candidateHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });

      // 0. Chaîne dédiée : offre ACTIVE → candidature → proposition acceptée.
      const offerResponse = await composition.worker.fetch(withSession('/api/v1/offers', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-offer-001'),
        body: JSON.stringify({
          title: 'Offre P0-F vérification PostgreSQL',
          contractType: 'CDI',
          remuneration: 175000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre créée pour vérifier le cycle CONTRAT.',
        }),
      }));
      assert(offerResponse.status === 201, `création offre P0-F : 201 attendu, reçu ${offerResponse.status}`);
      const p0fOffer = await offerResponse.json() as { id: string; status: string };

      const applicationResponse = await composition.worker.fetch(withSession(`/api/v1/offers/${p0fOffer.id}/applications`, sessionCookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0f-e2e-application-001' },
        body: JSON.stringify({ note: 'Candidature pour le cycle CONTRAT.' }),
      }));
      assert(applicationResponse.status === 201, `soumission P0-F : 201 attendu, reçue ${applicationResponse.status}`);
      const p0fApplication = await applicationResponse.json() as { id: string; status: string };

      const proposalResponse = await composition.worker.fetch(withSession('/api/v1/conversations/cnv_p0f_verify/proposals', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-proposal-001'),
        body: JSON.stringify({
          offerId: p0fOffer.id,
          applicationId: p0fApplication.id,
          missionTitle: 'Mission P0-F vérification PostgreSQL',
          amount: 175000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Novembre 2026',
          durationMonths: 6,
          location: 'Cotonou',
          conditions: ['Temps plein'],
        }),
      }));
      assert(proposalResponse.status === 201, `proposition P0-F : 201 attendu, reçu ${proposalResponse.status}`);
      const p0fProposal = await proposalResponse.json() as { id: string; status: string };

      const acceptedProposal = await composition.worker.fetch(withSession(`/api/v1/proposals/${p0fProposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: candidateHeaders('p0f-e2e-proposal-accept-001'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      }));
      assert(acceptedProposal.status === 200, `acceptation P0-F : 200 attendu, reçu ${acceptedProposal.status}`);
      assert(((await acceptedProposal.json()) as { status: string }).status === 'ACCEPTED', 'ACCEPTED requis avant contrat');

      // 1. CRÉATION — DRAFT réellement persisté, liens proposition/candidature posés.
      const created = await composition.worker.fetch(withSession('/api/v1/contracts', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-create-001'),
        body: JSON.stringify({ proposalId: p0fProposal.id }),
      }));
      assert(created.status === 201, `création contrat 201 attendue, reçue ${created.status}`);
      const contract = await created.json() as {
        id: string; status: string; proposalId: string; applicationId: string;
        employerId: string; employeeId: string; monthlySalary: number;
        employerSigned: boolean; employeeSigned: boolean;
      };
      assert(contract.status === 'DRAFT', `DRAFT attendu, reçu ${contract.status}`);
      assert(contract.proposalId === p0fProposal.id && contract.applicationId === p0fApplication.id, 'références de proposition et candidature');
      assert(contract.employerId === employerId && contract.employeeId === candidateId, 'parties dérivées côté serveur');
      assert(contract.monthlySalary === 175000, 'montant accepté repris, jamais imposé par le client');
      assert(contract.employerSigned === false && contract.employeeSigned === false, 'signatures vierges en brouillon');

      const storedContract = await database.query<{
        status: string; proposal_id: string; application_id: string; employer_id: string;
        candidate_id: string; employer_signed: boolean; employee_signed: boolean; history: unknown;
      }>(
        `SELECT status, proposal_id, application_id, employer_id, candidate_id,
                employer_signed, employee_signed, history
           FROM contracts WHERE id = $1`,
        [contract.id],
      );
      assert(storedContract.rows[0]?.status === 'DRAFT', 'DRAFT réellement persisté dans PostgreSQL');
      assert(storedContract.rows[0]?.proposal_id === p0fProposal.id, 'proposals.contract_id → contracts.proposal_id persisté');
      assert(storedContract.rows[0]?.application_id === p0fApplication.id, 'candidature rattachée au contrat');
      assert(storedContract.rows[0]?.employer_signed === false && storedContract.rows[0]?.employee_signed === false, 'drapeaux persistés à faux');

      const linked = await database.query<{ contract_id: string | null }>(
        'SELECT contract_id FROM proposals WHERE id = $1', [p0fProposal.id],
      );
      assert(linked.rows[0]?.contract_id === contract.id, 'la proposition acceptée est consommée une seule fois');

      // 2. Proposition déjà utilisée : la seconde création est refusée sans écriture.
      const duplicate = await composition.worker.fetch(withSession('/api/v1/contracts', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-create-002'),
        body: JSON.stringify({ proposalId: p0fProposal.id }),
      }));
      assert(duplicate.status === 409, `proposition déjà utilisée : 409 attendu, reçu ${duplicate.status}`);
      const contractCount = await database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM contracts WHERE proposal_id = $1', [p0fProposal.id],
      );
      assert(Number(contractCount.rows[0]?.count ?? 0) === 1, 'un seul contrat par proposition');

      // 3. ENVOI — EMPLOYER propriétaire uniquement (le candidat est refusé).
      const candidateSend = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/send`, sessionCookie, {
        method: 'POST',
        headers: candidateHeaders('p0f-e2e-contract-send-candidate-001'),
        body: '{}',
      }));
      assert(candidateSend.status === 403, `envoi par le candidat refusé (403), reçu ${candidateSend.status}`);
      const sent = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/send`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-send-001'),
        body: '{}',
      }));
      assert(sent.status === 200, `envoi 200 attendu, reçu ${sent.status}`);
      const sentBody = await sent.json() as { status: string; employerSigned: boolean; employeeSigned: boolean };
      assert(sentBody.status === 'SIGNATURE', `SIGNATURE attendu (SENT du plan), reçu ${sentBody.status}`);
      assert(sentBody.employerSigned === true && sentBody.employeeSigned === false, 'SENT : une seule signature (employeur)');

      // 4. ACTIVATION refusée avant la signature du salarié, puis SIGNED → ACTIVE.
      const premature = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/activate`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-activate-early-001'),
        body: '{}',
      }));
      assert(premature.status === 409, `activation avant signature : 409 attendu, reçu ${premature.status}`);
      const signed = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/sign`, sessionCookie, {
        method: 'POST',
        headers: candidateHeaders('p0f-e2e-contract-sign-001'),
        body: '{}',
      }));
      assert(signed.status === 200, `signature salarié 200 attendue, reçue ${signed.status}`);
      const signedBody = await signed.json() as { status: string; employerSigned: boolean; employeeSigned: boolean };
      assert(signedBody.status === 'SIGNATURE', 'SIGNED reste porté par le statut réel SIGNATURE + double drapeau');
      assert(signedBody.employerSigned === true && signedBody.employeeSigned === true, 'double signature persistée');
      const activated = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/activate`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-activate-001'),
        body: '{}',
      }));
      assert(activated.status === 200, `activation 200 attendue, reçue ${activated.status}`);
      assert(((await activated.json()) as { status: string }).status === 'ACTIVE', 'ACTIVE attendu');

      // 5. Année 1 : la rupture directe reste protégée (incident obligatoire, hors P0-F).
      const terminatedInFirstMonth = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/terminate`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-terminate-m1-001'),
        body: JSON.stringify({ reason: 'Rupture M1 interdite.' }),
      }));
      assert(terminatedInFirstMonth.status === 409, `terminaison M1 : 409 attendu, reçu ${terminatedInFirstMonth.status}`);

      // 6. FIN normale — ACTIVE → COMPLETED, puis état terminal.
      const ended = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/end`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-end-001'),
        body: '{}',
      }));
      assert(ended.status === 200, `fin 200 attendue, reçue ${ended.status}`);
      assert(((await ended.json()) as { status: string }).status === 'COMPLETED', 'COMPLETED attendu (ENDED du plan)');
      const endedAgain = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/end`, employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0f-e2e-contract-end-002'),
        body: '{}',
      }));
      assert(endedAgain.status === 409, `fin après fin : 409 attendu, reçu ${endedAgain.status}`);

      const finalRow = await database.query<{ status: string; history: unknown }>(
        'SELECT status, history FROM contracts WHERE id = $1', [contract.id],
      );
      assert(finalRow.rows[0]?.status === 'COMPLETED', 'COMPLETED réellement persisté');
      const contractHistory = (typeof finalRow.rows[0]?.history === 'string'
        ? JSON.parse(String(finalRow.rows[0]?.history))
        : finalRow.rows[0]?.history) as Array<{ event: string }>;
      for (const event of ['CONTRACT_CREATED', 'EMPLOYER_SIGNED', 'EMPLOYEE_SIGNED', 'CONTRACT_ACTIVATED_BILATERAL', 'CONTRACT_COMPLETED']) {
        assert(contractHistory.some(entry => entry.event === event), `événement ${event} absent de l’historique persisté`);
      }

      // 7. Aucune automatisation post-contrat : offre ACTIVE, candidature non HIRED.
      const offerRow = await database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [p0fOffer.id]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'FILLED + fermeture des autres candidatures = automatisation post-contrat à venir');
      const applicationRow = await database.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM applications WHERE id = $1', [p0fApplication.id],
      );
      assert(applicationRow.rows[0]?.status === 'PENDING', 'HIRED/CONTRACTED restent l’étape d’automatisation post-contrat');
      assert(applicationRow.rows[0]?.contract_id === contract.id, 'la candidature reste rattachée à son contrat');
    });

    /* ================================================================== */
    /* P0-AUTO-2 — automatisation contractuelle réelle                     */
    /* ================================================================== */

    let p0auto2ContractId = '';
    let p0auto2OfferId = '';
    let p0auto2ApplicationId = '';

    await check('P0-AUTO-2 Worker/API → PostgreSQL : CONTRACT_ACTIVATED écrit dans l’Outbox dans la même transaction que l’activation', async () => {
      assert(employerId && candidateId, 'acteurs nécessaires au cycle CONTRAT automatisé');

      const employerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const candidateHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });

      // Chaîne dédiée. Date de début ANTÉRIEURE à l’exécution : les échéances M1
      // sont réellement échues, ce qui permet de vérifier les rappels J+3 sur le
      // moteur PostgreSQL sans inventer aucune règle temporelle.
      const offerResponse = await composition.worker.fetch(withSession('/api/v1/offers', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0auto2-offer-001'),
        body: JSON.stringify({
          title: 'Offre P0-AUTO-2 vérification PostgreSQL',
          contractType: 'CDI',
          remuneration: 175000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre créée pour vérifier l’automatisation contractuelle.',
        }),
      }));
      assert(offerResponse.status === 201, `création offre : 201 attendu, reçu ${offerResponse.status}`);
      const offer = await offerResponse.json() as { id: string };
      p0auto2OfferId = offer.id;

      const applicationResponse = await composition.worker.fetch(withSession(`/api/v1/offers/${offer.id}/applications`, sessionCookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0auto2-application-001' },
        body: JSON.stringify({ note: 'Candidature pour l’automatisation contractuelle.' }),
      }));
      assert(applicationResponse.status === 201, `soumission : 201 attendu, reçu ${applicationResponse.status}`);
      const application = await applicationResponse.json() as { id: string };
      p0auto2ApplicationId = application.id;

      const proposalResponse = await composition.worker.fetch(withSession('/api/v1/conversations/cnv_p0auto2_verify/proposals', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0auto2-proposal-001'),
        body: JSON.stringify({
          offerId: offer.id,
          applicationId: application.id,
          missionTitle: 'Mission P0-AUTO-2 vérification PostgreSQL',
          amount: 175000,
          currency: 'FCFA',
          periodicity: 'Mensuel',
          startDate: '01 Août 2026',
          durationMonths: 6,
          location: 'Cotonou',
          conditions: ['Temps plein'],
        }),
      }));
      assert(proposalResponse.status === 201, `proposition : 201 attendu, reçu ${proposalResponse.status}`);
      const proposal = await proposalResponse.json() as { id: string };

      const accepted = await composition.worker.fetch(withSession(`/api/v1/proposals/${proposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: candidateHeaders('p0auto2-proposal-accept-001'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      }));
      assert(accepted.status === 200, `acceptation : 200 attendu, reçu ${accepted.status}`);

      const created = await composition.worker.fetch(withSession('/api/v1/contracts', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0auto2-contract-create-001'),
        body: JSON.stringify({ proposalId: proposal.id }),
      }));
      assert(created.status === 201, `création contrat : 201 attendu, reçu ${created.status}`);
      const contract = await created.json() as { id: string };
      p0auto2ContractId = contract.id;

      for (const [action, headers, key] of [
        ['send', employerHeaders('p0auto2-contract-send-001'), employerCookie],
        ['sign', candidateHeaders('p0auto2-contract-sign-001'), sessionCookie],
        ['activate', employerHeaders('p0auto2-contract-activate-001'), employerCookie],
      ] as Array<[string, Record<string, string>, string]>) {
        const response = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/${action}`, key, {
          method: 'POST',
          headers,
          body: '{}',
        }));
        assert(response.status === 200, `${action} : 200 attendu, reçu ${response.status}`);
      }

      // 1. L’événement est écrit, la mutation aussi — et RIEN d’autre n’a encore
      //    été produit : l’échéancier appartient au worker, pas à la requête.
      const stored = await database.query<{
        status: string; payment_schedule: unknown; history: unknown; commission_percentage: string;
      }>('SELECT status, payment_schedule, history, commission_percentage FROM contracts WHERE id = $1', [contract.id]);
      assert(stored.rows[0]?.status === 'ACTIVE', 'ACTIVE réellement persisté');
      const scheduleBefore = stored.rows[0]?.payment_schedule as unknown[];
      assert(scheduleBefore.length === 0, 'aucun échéancier écrit par la requête d’activation (traitement asynchrone réel)');
      assert(Number(stored.rows[0]?.commission_percentage) === 25, 'commission_percentage du modèle inchangé (25)');

      const events = await database.query<{ id: string; event_type: string; status: string; attempts: number; payload: unknown }>(
        `SELECT id, event_type, status, attempts, payload FROM automation_outbox
          WHERE aggregate_type = 'contract' AND aggregate_id = $1 ORDER BY id ASC`,
        [contract.id],
      );
      assert(events.rows.length === 1, `un seul événement attendu, reçus ${events.rows.length}`);
      assert(events.rows[0].event_type === 'CONTRACT_ACTIVATED', 'CONTRACT_ACTIVATED attendu');
      assert(events.rows[0].id === contractActivatedEventId(contract.id), 'identifiant déterministe (dedupeKey « contractId + ACTIVATED »)');
      assert(events.rows[0].status === 'PENDING' && events.rows[0].attempts === 0, 'événement en attente de son consumer');
      const payload = events.rows[0].payload as Record<string, unknown>;
      for (const field of ['contractId', 'proposalId', 'offerId', 'applicationId', 'occurredAt']) {
        assert(payload[field] !== undefined, `charge utile documentée incomplète: ${field}`);
      }

      const deadlinesBefore = await database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id = $1', [contract.id],
      );
      assert(Number(deadlinesBefore.rows[0]?.count ?? 0) === 0, 'aucune échéance avant le worker');
      const jobsBefore = await database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_jobs WHERE aggregate_id = $1', [contract.id],
      );
      assert(Number(jobsBefore.rows[0]?.count ?? 0) === 0, 'aucun rappel avant le worker');
    });

    await check('P0-AUTO-2 PostgreSQL réel : DEUX workers concurrents drainent l’Outbox — un seul échéancier, jamais deux', async () => {
      // Seconde composition = second processus/instance réel, avec son propre
      // moteur et son propre cache de rejeu, sur la MÊME base PostgreSQL.
      const secondComposition = composeWorker(env, compositionClient, { googleVerifier: google.verifier });
      assert(secondComposition.automationWorker !== undefined, 'un second worker doit être composé');

      const [first, second] = await Promise.all([
        composition.automationWorker!.drainEvents(25),
        secondComposition.automationWorker!.drainEvents(25),
      ]);
      const entries = [...first.entries, ...second.entries];
      const target = entries.filter(entry => entry.eventId === contractActivatedEventId(p0auto2ContractId));
      assert(
        target.length === 1,
        `FOR UPDATE SKIP LOCKED doit confier l’événement à UN SEUL worker, reçu ${target.length}`,
      );
      assert(target[0].result === 'completed', `traitement attendu, reçu ${target[0].result}`);
      for (const entry of entries) {
        assert(entry.result !== 'retryable' && entry.result !== 'dead-letter', `aucun échec admis, reçu ${JSON.stringify(entry)}`);
      }

      // Les événements d’activation produits par les vérifications P0-F/P0-E5
      // précédentes sont traités par le même drain : preuve que la file est réelle.
      const pending = await database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_outbox
          WHERE event_type = 'CONTRACT_ACTIVATED' AND status IN ('PENDING', 'PROCESSING', 'RETRYABLE')`,
      );
      assert(Number(pending.rows[0]?.count ?? 0) === 0, 'aucun événement d’activation ne doit rester en attente');

      const stored = await database.query<{
        payment_schedule: unknown; monthly_checkpoints: unknown; commission_ledger: unknown;
        commission_amount_due: string; commission_status: string; current_month: number; history: unknown;
      }>(
        `SELECT payment_schedule, monthly_checkpoints, commission_ledger, commission_amount_due,
                commission_status, current_month, history
           FROM contracts WHERE id = $1`,
        [p0auto2ContractId],
      );
      const schedule = stored.rows[0]?.payment_schedule as Array<Record<string, unknown>>;
      assert(schedule.length === 6, `6 périodes attendues, reçues ${schedule.length}`);
      assert(schedule[0].id === `PSE-${p0auto2ContractId}-M1`, 'identifiant d’entrée réel');
      assert(schedule[0].salaryAmount === 175000, 'montant attendu réel');
      assert(schedule[0].employeeShareAmount === 131250, 'part salarié 75 %');
      assert(schedule[0].commissionAmount === 43750, 'commission M1 = 25 %');
      assert(schedule[1].commissionAmount === 0 && schedule[1].commissionStatus === 'NOT_APPLICABLE', '0 % en M2+');
      assert(Number(stored.rows[0]?.commission_amount_due) === 43750, 'commission due M1 persistée');
      assert(stored.rows[0]?.commission_status === 'SCHEDULED', 'statut de commission réel');
      assert(stored.rows[0]?.current_month === 1, 'aucun avancement mensuel inventé');
      assert((stored.rows[0]?.monthly_checkpoints as unknown[]).length === 1, 'point de contrôle M1');
      const ledger = stored.rows[0]?.commission_ledger as Array<Record<string, unknown>>;
      assert(ledger.length === 1 && ledger[0].percentage === 25 && ledger[0].amountDue === 43750, 'grand livre de commission M1');
      assert(
        ledger.every(entry => entry.amountSubmitted === 0 && entry.paymentId === undefined),
        'aucun paiement de commission effectué',
      );
      for (const entry of schedule) {
        assert(entry.salaryStatus === 'SCHEDULED', 'aucun paiement salarial effectué');
        assert(entry.salaryTransactionId === undefined && entry.salaryProofFileName === undefined, 'aucune preuve ni transaction');
      }
      const history = stored.rows[0]?.history as Array<{ event: string }>;
      for (const event of ['CONTRACT_CREATED', 'EMPLOYER_SIGNED', 'EMPLOYEE_SIGNED', 'CONTRACT_ACTIVATED_BILATERAL', 'PAYMENT_SCHEDULE_CREATED']) {
        assert(history.some(item => item.event === event), `événement ${event} absent de l’historique persisté`);
      }
      assert(
        history.filter(item => item.event === 'PAYMENT_SCHEDULE_CREATED').length === 1,
        'un seul échéancier créé malgré deux workers concurrents',
      );

      const deadlines = await database.query<{
        id: string; kind: string; status: string; due_at: Date; sla: string; grace_period_ms: string; escalation: string;
      }>(
        `SELECT id, kind, status, due_at, sla, grace_period_ms, escalation FROM automation_deadlines
          WHERE aggregate_id = $1 ORDER BY due_at ASC, id ASC`,
        [p0auto2ContractId],
      );
      assert(deadlines.rows.length === 7, `7 échéances attendues (6 salaires + 1 commission), reçues ${deadlines.rows.length}`);
      assert(deadlines.rows.filter(row => row.kind === 'SALARY_PAYMENT').length === 6, '6 échéances salariales');
      assert(deadlines.rows.filter(row => row.kind === 'COMMISSION_PAYMENT').length === 1, 'une échéance de commission (M1 > 0)');
      for (const row of deadlines.rows) {
        assert(row.status === 'OPEN', 'échéance ouverte');
        assert(row.due_at instanceof Date, 'dueAt TIMESTAMPTZ réel');
        assert(row.due_at.getUTCHours() === 0 && row.due_at.getUTCMinutes() === 0, 'dueAt à minuit UTC (modèle de date réel)');
        assert(Number(row.grace_period_ms) === PAYMENT_OVERDUE_GRACE_PERIOD_MS, 'grâce J+3 réelle');
        assert(row.escalation === 'PAYMENT_OVERDUE_J3', 'escalade réelle');
        assert(row.sla.length > 0, 'SLA renseigné');
      }
      const uniqueDeadlines = await database.query<{ count: string }>(
        `SELECT count(DISTINCT idempotency_key)::text AS count FROM automation_deadlines WHERE aggregate_id = $1`,
        [p0auto2ContractId],
      );
      assert(Number(uniqueDeadlines.rows[0]?.count ?? 0) === 7, 'aucune échéance dupliquée');

      const jobs = await database.query<{ job_id: string; job_type: string; status: string; due_at: Date; idempotency_key: string; reference: string | null }>(
        `SELECT job_id, job_type, status, due_at, idempotency_key, reference FROM automation_jobs
          WHERE aggregate_id = $1 ORDER BY due_at ASC, job_id ASC`,
        [p0auto2ContractId],
      );
      assert(jobs.rows.length === 14, `14 rappels attendus (7 échéances × 2), reçus ${jobs.rows.length}`);
      const uniqueJobs = await database.query<{ count: string }>(
        `SELECT count(DISTINCT idempotency_key)::text AS count FROM automation_jobs WHERE aggregate_id = $1`,
        [p0auto2ContractId],
      );
      assert(Number(uniqueJobs.rows[0]?.count ?? 0) === 14, 'aucun rappel dupliqué');
      assert(jobs.rows.every(row => row.status === 'PENDING' && row.reference !== null), 'rappels armés et référencés');
      const salaryDue = jobs.rows.find(row => row.job_type === 'SALARY_DUE_REMINDER')!;
      const salaryJ3 = jobs.rows.find(row => row.job_type === 'SALARY_OVERDUE_J3_REMINDER')!;
      assert(
        salaryJ3.due_at.getTime() - salaryDue.due_at.getTime() === PAYMENT_OVERDUE_GRACE_PERIOD_MS,
        'le rappel J+3 est exactement 3 jours après l’échéance',
      );
      assert(
        salaryJ3.idempotency_key.endsWith(':J3') && salaryDue.idempotency_key.endsWith(':DUE'),
        'clés d’idempotence conformes au contrat d’outbox documenté',
      );

      // Rejeu complet : aucun double effet.
      const replay = await composition.automationWorker!.drainEvents(25);
      assert(
        replay.entries.every(entry => entry.eventId !== contractActivatedEventId(p0auto2ContractId)),
        'un événement déjà traité n’est jamais réclamé deux fois',
      );
      const afterReplay = await database.query<{ count: string }>(
        `SELECT (SELECT count(*) FROM automation_deadlines WHERE aggregate_id = $1)
              + (SELECT count(*) FROM automation_jobs WHERE aggregate_id = $1) AS count`,
        [p0auto2ContractId],
      );
      assert(Number(afterReplay.rows[0]?.count ?? 0) === 21, `21 lignes d’automatisation attendues, reçu ${afterReplay.rows[0]?.count}`);

      const audit = await database.query<{ action: string; actor_id: string; source: string; event_id: string | null; entity_id: string }>(
        `SELECT action, actor_id, source, event_id, entity_id FROM automation_audit_ledger
          WHERE entity_id = $1 ORDER BY occurred_at ASC`,
        [p0auto2ContractId],
      );
      for (const action of ['CONTRACT_SCHEDULE_CREATED', 'CONTRACT_PAYMENT_DEADLINES_CREATED', 'CONTRACT_REMINDER_JOBS_SCHEDULED']) {
        assert(audit.rows.some(row => row.action === action), `action d’audit manquante: ${action}`);
      }
      for (const row of audit.rows) {
        assert(row.actor_id === 'SYSTEM', 'acteur SYSTEM');
        // Le cycle paiements écrit SES propres lignes d’audit sur le même contrat,
        // sous sa source : les deux traces restent distinctes et attribuable.
        assert(
          row.source === (row.action === 'PAYMENTS_MATERIALIZED' ? 'automation:P0-PAY-1' : 'automation:P0-AUTO-2'),
          `source de l’automatisation attendue pour ${row.action}, reçue ${row.source}`,
        );
        assert(row.entity_id === p0auto2ContractId, 'contractId tracé');
      }

      // P0-PAY-1 sur le moteur RÉEL : un paiement par échéance de l’échéancier,
      // aucun doublon malgré deux drains, aucun statut inventé, aucun job armé
      // sans décision de l’exploitant (aucune valeur par défaut).
      const cycleRows = await database.query<{
        id: string; payment_type: string; status: string; amount: string; idempotency_key: string; due_at: Date;
      }>(
        `SELECT id, payment_type, status, amount::text, idempotency_key, due_at FROM payments
          WHERE contract_id = $1 ORDER BY payment_type, month_number`,
        [p0auto2ContractId],
      );
      assert(cycleRows.rows.length === 7, `7 lignes de paiement attendues (6 salaires + 1 commission M1), reçues ${cycleRows.rows.length}`);
      assert(cycleRows.rows.every(row => row.status === 'SCHEDULED'), 'le cycle part de SCHEDULED : aucun paiement dû non plus');
      assert(Number(cycleRows.rows.find(row => row.payment_type === 'PLATFORM_FEE')?.amount ?? 0) > 0, 'commission M1 materialisée');
      assert(!cycleRows.rows.some(row => row.payment_type === 'PLATFORM_FEE' && Number(row.amount) === 0),
        'aucune ligne de commission à 0 % (règle réelle, rien d’inventé)');
      const uniqueCycleKeys = await database.query<{ count: string }>(
        'SELECT count(DISTINCT idempotency_key)::text AS count FROM payments WHERE contract_id = $1',
        [p0auto2ContractId],
      );
      assert(Number(uniqueCycleKeys.rows[0]?.count ?? 0) === 7, 'aucun paiement dupliqué par le rejeu du worker');
      const preDueJobs = await database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_jobs
          WHERE aggregate_id = $1 AND job_type = 'PAYMENT_PRE_DUE_REMINDER'`,
        [p0auto2ContractId],
      );
      assert(Number(preDueJobs.rows[0]?.count ?? 0) === 0, 'aucun rappel pré-échéance armé sans configuration');
      assert(
        audit.rows.some(row => row.event_id === contractActivatedEventId(p0auto2ContractId)),
        'eventId tracé dans l’audit',
      );
      const reservation = await database.query<{ status: string; actor_id: string }>(
        `SELECT status, actor_id FROM automation_idempotency
          WHERE command = 'automation.CONTRACT_ACTIVATED' AND idempotency_key = $1`,
        [`${p0auto2ContractId}:CONTRACT_ACTIVATED`],
      );
      assert(reservation.rows.length === 1 && reservation.rows[0].status === 'COMPLETED', 'idempotence durable clôturée');

      // Post-contractuel NON ouvert : offre et candidatures inchangées.
      const offerRow = await database.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [p0auto2OfferId]);
      assert(offerRow.rows[0]?.status === 'ACTIVE', 'aucun passage FILLED (tranche post-contractuelle dédiée)');
      const applicationRow = await database.query<{ status: string; contract_id: string | null }>(
        'SELECT status, contract_id FROM applications WHERE id = $1', [p0auto2ApplicationId],
      );
      assert(applicationRow.rows[0]?.status === 'PENDING', 'aucun HIRED / CONTRACTED produit');
      assert(applicationRow.rows[0]?.contract_id === p0auto2ContractId, 'lien P0-F conservé');
    });

    await check('P0-AUTO-2 PostgreSQL réel : périodicité « Hebdomadaire » sans règle — aucun échéancier inventé, règle manquante auditée', async () => {
      const employerHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${employerCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });
      const candidateHeaders = (key: string) => ({
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
        'content-type': 'application/json',
        'Idempotency-Key': key,
      });

      const offerResponse = await composition.worker.fetch(withSession('/api/v1/offers', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0auto2-weekly-offer-001'),
        body: JSON.stringify({
          title: 'Offre hebdomadaire P0-AUTO-2',
          contractType: 'CDD',
          remuneration: 60000,
          currency: 'FCFA',
          location: 'Cotonou',
          summary: 'Offre pour vérifier une périodicité sans règle de cadence.',
        }),
      }));
      assert(offerResponse.status === 201, `création offre : 201 attendu, reçu ${offerResponse.status}`);
      const offer = await offerResponse.json() as { id: string };

      const applicationResponse = await composition.worker.fetch(withSession(`/api/v1/offers/${offer.id}/applications`, sessionCookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0auto2-weekly-application-001' },
        body: JSON.stringify({ note: 'Candidature hebdomadaire.' }),
      }));
      assert(applicationResponse.status === 201, `soumission : 201 attendu, reçu ${applicationResponse.status}`);
      const application = await applicationResponse.json() as { id: string };

      const proposalResponse = await composition.worker.fetch(withSession('/api/v1/conversations/cnv_p0auto2_weekly/proposals', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0auto2-weekly-proposal-001'),
        body: JSON.stringify({
          offerId: offer.id,
          applicationId: application.id,
          missionTitle: 'Mission hebdomadaire P0-AUTO-2',
          amount: 60000,
          currency: 'FCFA',
          periodicity: 'Hebdomadaire',
          startDate: '01 Août 2026',
          durationMonths: 3,
          location: 'Cotonou',
          conditions: ['Temps partiel'],
        }),
      }));
      assert(proposalResponse.status === 201, `proposition : 201 attendu, reçu ${proposalResponse.status}`);
      const proposal = await proposalResponse.json() as { id: string };

      const accepted = await composition.worker.fetch(withSession(`/api/v1/proposals/${proposal.id}/respond`, sessionCookie, {
        method: 'POST',
        headers: candidateHeaders('p0auto2-weekly-accept-001'),
        body: JSON.stringify({ action: 'ACCEPT' }),
      }));
      assert(accepted.status === 200, `acceptation : 200 attendu, reçu ${accepted.status}`);

      const created = await composition.worker.fetch(withSession('/api/v1/contracts', employerCookie, {
        method: 'POST',
        headers: employerHeaders('p0auto2-weekly-contract-create-001'),
        body: JSON.stringify({ proposalId: proposal.id }),
      }));
      assert(created.status === 201, `création contrat : 201 attendu, reçu ${created.status}`);
      const contract = await created.json() as { id: string; periodicity: string };
      assert(contract.periodicity === 'Hebdomadaire', 'périodicité hebdomadaire réelle du modèle');

      for (const [action, headers, cookie] of [
        ['send', employerHeaders('p0auto2-weekly-send-001'), employerCookie],
        ['sign', candidateHeaders('p0auto2-weekly-sign-001'), sessionCookie],
        ['activate', employerHeaders('p0auto2-weekly-activate-001'), employerCookie],
      ] as Array<[string, Record<string, string>, string]>) {
        const response = await composition.worker.fetch(withSession(`/api/v1/contracts/${contract.id}/${action}`, cookie, {
          method: 'POST',
          headers,
          body: '{}',
        }));
        assert(response.status === 200, `${action} : 200 attendu, reçu ${response.status}`);
      }

      const report = await composition.automationWorker!.drainEvents(25);
      assert(
        report.entries.some(entry => entry.eventId === contractActivatedEventId(contract.id) && entry.result === 'completed'),
        `événement traité attendu, reçu ${JSON.stringify(report.entries)}`,
      );

      const stored = await database.query<{
        status: string; periodicity: string; payment_schedule: unknown; monthly_checkpoints: unknown;
        commission_ledger: unknown; commission_amount_due: string; commission_percentage: string; history: unknown;
      }>(
        `SELECT status, periodicity, payment_schedule, monthly_checkpoints, commission_ledger,
                commission_amount_due, commission_percentage, history
           FROM contracts WHERE id = $1`,
        [contract.id],
      );
      assert(stored.rows[0]?.status === 'ACTIVE', 'le contrat reste actif');
      assert(stored.rows[0]?.periodicity === 'Hebdomadaire', 'périodicité conservée telle quelle');
      assert((stored.rows[0]?.payment_schedule as unknown[]).length === 0, 'AUCUN échéancier inventé pour un contrat hebdomadaire');
      assert((stored.rows[0]?.monthly_checkpoints as unknown[]).length === 0, 'AUCUN point de contrôle inventé');
      assert((stored.rows[0]?.commission_ledger as unknown[]).length === 0, 'AUCUNE commission inventée');
      assert(Number(stored.rows[0]?.commission_amount_due) === 0, 'aucun montant inventé');
      assert(Number(stored.rows[0]?.commission_percentage) === 25, 'la règle de 25 % n’est pas modifiée');

      const history = stored.rows[0]?.history as Array<{ event: string; description: string }>;
      const missing = history.find(entry => entry.event === 'PAYMENT_SCHEDULE_RULE_MISSING');
      assert(missing !== undefined, 'la règle manquante doit être tracée dans l’historique métier');
      assert(missing!.description.includes('Hebdomadaire'), 'la périodicité non résolue est nommée');

      const deadlines = await database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_deadlines WHERE aggregate_id = $1', [contract.id],
      );
      assert(Number(deadlines.rows[0]?.count ?? 0) === 0, 'AUCUNE échéance inventée');
      const jobs = await database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM automation_jobs WHERE aggregate_id = $1', [contract.id],
      );
      assert(Number(jobs.rows[0]?.count ?? 0) === 0, 'AUCUN rappel inventé');

      const audit = await database.query<{ action: string; after_state: unknown }>(
        `SELECT action, after_state FROM automation_audit_ledger
          WHERE entity_id = $1 AND action = 'CONTRACT_SCHEDULE_RULE_MISSING'`,
        [contract.id],
      );
      assert(audit.rows.length === 1, 'la règle manquante est auditée une seule fois');
      const state = audit.rows[0].after_state as Record<string, unknown>;
      assert(state.periodicity === 'Hebdomadaire', 'périodicité auditée');
      assert(typeof state.missingRule === 'string' && String(state.missingRule).length > 40, 'règle manquante documentée');

      // Rejeu : toujours aucune invention.
      const replay = await composition.automationWorker!.drainEvents(25);
      assert(replay.claimed === 0, 'aucun événement à réclamer');
      const historyAfter = await database.query<{ history: unknown }>(
        'SELECT history FROM contracts WHERE id = $1', [contract.id],
      );
      assert(
        (historyAfter.rows[0]?.history as Array<{ event: string }>)
          .filter(entry => entry.event === 'PAYMENT_SCHEDULE_RULE_MISSING').length === 1,
        'une seule entrée de règle manquante après rejeu',
      );
    });

    await check('P0-AUTO-2 PostgreSQL réel : rappels échus → événements préparés, escalade J+3, AUCUN canal de notification', async () => {
      // État produit par le cycle paiements (NON ouvert par cette tranche) :
      // l’échéance M1 est basculée en DUE directement en base, ce qui est
      // exactement l’état que `syncPaymentSchedule` produira plus tard.
      const row = await database.query<{ payment_schedule: unknown }>(
        'SELECT payment_schedule FROM contracts WHERE id = $1', [p0auto2ContractId],
      );
      const schedule = (row.rows[0]?.payment_schedule as Array<Record<string, unknown>>).map(entry =>
        Number(entry.monthNumber) === 1 ? { ...entry, salaryStatus: 'DUE', commissionStatus: 'DUE' } : entry);
      await database.query('UPDATE contracts SET payment_schedule = $2::jsonb WHERE id = $1', [
        p0auto2ContractId,
        JSON.stringify(schedule),
      ]);

      const report = await composition.automationWorker!.runDueJobs(50);
      const entries = report.entries.filter(entry => entry.contractId === p0auto2ContractId);
      assert(entries.length >= 4, `au moins les 4 rappels M1 échus attendus, reçus ${entries.length}`);

      const salaryDue = entries.find(entry => entry.jobType === 'SALARY_DUE_REMINDER')!;
      assert(salaryDue.outcome?.eligibility === 'ELIGIBLE', 'rappel salarial éligible');
      assert(salaryDue.outcome?.notificationType === 'MONTHLY_CHECKPOINT', 'type de notification réel du modèle');
      assert(salaryDue.outcome?.eventType === 'NOTIFICATION_REQUIRED', 'événement de la fondation, aucun canal');

      const salaryJ3 = entries.find(entry => entry.jobType === 'SALARY_OVERDUE_J3_REMINDER')!;
      assert(salaryJ3.outcome?.eligibility === 'ELIGIBLE', 'rappel J+3 éligible');
      assert(salaryJ3.outcome?.daysLate! >= 3, `J+3 réel attendu, reçu ${salaryJ3.outcome?.daysLate}`);
      assert(salaryJ3.outcome?.notificationType === 'PAYMENT_OVERDUE_J3', 'type réel J+3');
      assert(salaryJ3.outcome?.eventType === 'PAYMENT_OVERDUE_J3', 'événement de domaine déjà déclaré');
      assert(salaryJ3.outcome?.deadlineStatus === 'ESCALATED', 'échéance escaladée');

      // Les échéances non basculées en DUE ne produisent RIEN (règle absente du
      // périmètre : le basculement appartient au cycle paiements).
      for (const entry of entries.filter(item => item.jobId !== salaryDue.jobId && item.jobId !== salaryJ3.jobId)) {
        if (entry.outcome?.eligibility === 'NOT_ELIGIBLE') {
          assert(entry.outcome?.eventId === null, 'aucun événement inventé pour une échéance non due');
          assert(String(entry.outcome?.reason ?? '').includes('cycle paiements'), 'la raison documente la règle absente');
        }
      }

      const events = await database.query<{ event_type: string; status: string; attempts: number; payload: unknown }>(
        `SELECT event_type, status, attempts, payload FROM automation_outbox
          WHERE aggregate_id = $1 AND event_type IN ('NOTIFICATION_REQUIRED', 'PAYMENT_OVERDUE_J3')
          ORDER BY id ASC`,
        [p0auto2ContractId],
      );
      assert(events.rows.length >= 4, `au moins 4 événements préparés, reçus ${events.rows.length}`);
      for (const event of events.rows) {
        const payload = event.payload as Record<string, unknown>;
        assert(payload.channel === null, 'AUCUN canal de notification');
        assert(String(payload.note).includes('aucun canal'), 'l’absence de canal est explicite');
        assert(payload.contractId === p0auto2ContractId, 'contractId porté');
        assert(payload.dedupeKey !== undefined, 'clé de déduplication réelle');
      }

      // Aucun consumer : les événements préparés restent PENDING et ne sont
      // jamais réclamés par le worker (le module Notifications n’existe pas).
      const drain = await composition.automationWorker!.drainEvents(50);
      assert(
        drain.entries.every(entry => entry.eventType !== 'NOTIFICATION_REQUIRED' && entry.eventType !== 'PAYMENT_OVERDUE_J3'),
        'le worker ne réclame que les types ayant un handler réel',
      );
      const stillPending = await database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_outbox
          WHERE aggregate_id = $1 AND event_type IN ('NOTIFICATION_REQUIRED', 'PAYMENT_OVERDUE_J3')
            AND status = 'PENDING' AND attempts = 0`,
        [p0auto2ContractId],
      );
      assert(Number(stillPending.rows[0]?.count ?? 0) === events.rows.length, 'événements préparés intacts');

      const channels = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%notification%' OR table_name ILIKE '%email%' OR table_name ILIKE '%sms%'
                 OR table_name ILIKE '%whatsapp%' OR table_name ILIKE '%push%')`,
      );
      assert(channels.rows.length === 0, 'aucune table de canal de notification créée');

      // P0-PAY-1 : SEULES les deux tables du cycle métier existent. Aucun
      // fournisseur, aucun webhook, aucun OTP, aucun KYC, aucun agrégateur.
      const paymentTables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name ILIKE '%payment%'
          ORDER BY table_name`,
      );
      assert(
        JSON.stringify(paymentTables.rows.map(row => row.table_name)) === JSON.stringify(['payment_declarations', 'payments']),
        `aucune autre table de paiement que le cycle métier, reçues ${paymentTables.rows.map(row => row.table_name).join(', ')}`,
      );
      const providerTables = await database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%provider%' OR table_name ILIKE '%webhook%' OR table_name ILIKE '%otp%'
                 OR table_name ILIKE '%kyc%' OR table_name ILIKE '%aggregator%' OR table_name ILIKE '%momo%'
                 OR table_name ILIKE '%mobile_money%')`,
      );
      assert(providerTables.rows.length === 0, 'aucune table de paiement réel: ' + providerTables.rows.map(row => row.table_name).join(', '));

      const audit = await database.query<{ action: string; after_state: unknown }>(
        `SELECT action, after_state FROM automation_audit_ledger
          WHERE entity_id = $1 AND action IN ('SCHEDULE_J3_ELIGIBILITY_RECORDED', 'SCHEDULE_DUE_REMINDER_RECORDED')`,
        [p0auto2ContractId],
      );
      assert(audit.rows.length >= 4, `audits de rappel attendus, reçus ${audit.rows.length}`);
      assert(
        audit.rows.some(item => item.action === 'SCHEDULE_J3_ELIGIBILITY_RECORDED'),
        'l’action d’audit J+3 est le nom réel déjà documenté',
      );
      for (const item of audit.rows.filter(entry => entry.action === 'SCHEDULE_J3_ELIGIBILITY_RECORDED')) {
        const state = item.after_state as Record<string, unknown>;
        for (const field of ['scheduleEntryId', 'paymentKind', 'dueDate', 'status', 'daysLate', 'outboxEventId']) {
          assert(state[field] !== undefined, `champ d’audit réel manquant: ${field}`);
        }
      }

      // Rejeu des rappels : aucun second événement.
      const again = await composition.automationWorker!.runDueJobs(50);
      assert(
        again.entries.every(entry => entry.contractId !== p0auto2ContractId),
        'un job terminé n’est jamais réclamé deux fois',
      );
      const eventsAfter = await database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_outbox
          WHERE aggregate_id = $1 AND event_type IN ('NOTIFICATION_REQUIRED', 'PAYMENT_OVERDUE_J3')`,
        [p0auto2ContractId],
      );
      assert(
        Number(eventsAfter.rows[0]?.count ?? 0) === events.rows.length,
        'aucun événement de rappel dupliqué',
      );
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

      // P0-F : la lecture ADMIN des contrats reste bornée à la permission seedée.
      const adminContracts = await composition.worker.fetch(withSession('/api/v1/admin/contracts?limit=5', adminToken));
      assert(adminContracts.status === 200, `lecture ADMIN des contrats : 200 attendu, reçu ${adminContracts.status}`);
      const adminContractsBody = await adminContracts.json() as { items: Array<{ id: string }> };
      assert(adminContractsBody.items.length > 0, 'l’ADMIN doit lire les contrats persistés via contracts:read:any');

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
