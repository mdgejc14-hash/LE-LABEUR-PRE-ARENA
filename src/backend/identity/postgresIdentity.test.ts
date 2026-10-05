/**
 * P0-B integration tests: real PostgreSQL-compatible execution in PGlite WASM.
 * These tests do not claim or require a Cloudflare account or production DB.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeWorker } from '../api/entry';
import { SESSION_COOKIE_NAME } from './cookies';
import { base64UrlEncode, hashSessionToken } from './ids';
import { createGoogleCredentialVerifier } from './googleVerifier';
import type { GoogleCredentialVerifier, GoogleExternalIdentity } from '../productionContracts';
import type { PostgreSqlDatabase } from '../services/database';
import { createPostgresDatabase } from '../persistence/postgresDatabase';
import {
  toPostgresClientPort,
  type DriverPoolLike,
  type DriverQueryResult,
} from '../persistence/sqlClient';

export interface PostgresIdentityTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createPGliteDriver(database: PGlite): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<Row>> => {
    const result = await database.query<Row>(sql, [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  };

  return {
    query,
    async connect() {
      // PGlite is one local PostgreSQL session. The adapter still exercises its
      // dedicated-connection transaction contract, including BEGIN/ROLLBACK.
      return { query, release() {} };
    },
  };
}

const verifiedIdentities: Record<string, GoogleExternalIdentity> = {
  'valid-candidate': {
    subject: 'google-sub-p0b-candidate',
    email: 'candidate.p0b@example.com',
    emailVerified: true,
    displayName: 'Candidate P0-B',
  },
  'same-email-different-subject': {
    subject: 'google-sub-p0b-secondary',
    email: 'CANDIDATE.P0B@example.com',
    emailVerified: true,
    displayName: 'Secondary Google profile',
  },
  'rollback-identity': {
    subject: 'google-sub-p0b-rollback',
    email: 'rollback.p0b@example.com',
    emailVerified: true,
    displayName: 'Rollback Candidate',
  },
};

const TEST_GOOGLE_AUDIENCE = 'p0b-test-client.apps.googleusercontent.com';
const TEST_GOOGLE_KID = 'p0b-local-test-key';

async function createSignedGoogleCredentials(clock: { value: Date }): Promise<{
  verifier: GoogleCredentialVerifier;
  credentials: Record<string, string>;
}> {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const publicJwk = {
    ...await crypto.subtle.exportKey('jwk', pair.publicKey),
    kid: TEST_GOOGLE_KID,
    alg: 'RS256',
    use: 'sig',
  };
  const verifier = createGoogleCredentialVerifier({
    audience: TEST_GOOGLE_AUDIENCE,
    jwksUrl: 'https://google.test/jwks',
    now: () => clock.value,
    fetcher: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'content-type': 'application/json' },
    }),
  });
  const credentials: Record<string, string> = {};
  for (const [name, identity] of Object.entries(verifiedIdentities)) {
    const issuedAt = Math.floor(clock.value.getTime() / 1000);
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: TEST_GOOGLE_KID })));
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: TEST_GOOGLE_AUDIENCE,
      sub: identity.subject,
      iat: issuedAt,
      exp: issuedAt + 300,
      email: identity.email,
      email_verified: identity.emailVerified,
      name: identity.displayName,
      picture: identity.avatarUrl,
    })));
    const signedContent = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(signedContent),
    );
    credentials[name] = `${signedContent}.${base64UrlEncode(new Uint8Array(signature))}`;
  }
  return { verifier, credentials };
}

interface P0BHarness {
  database: PostgreSqlDatabase;
  worker: { fetch(request: Request): Promise<Response> };
  clock: { value: Date };
  credentials: Record<string, string>;
  close(): Promise<void>;
}

async function createHarness(): Promise<P0BHarness> {
  const pg = new PGlite();
  const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    await pg.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
  }

  const database = createPostgresDatabase(toPostgresClientPort(createPGliteDriver(pg)));
  const clock = { value: new Date('2026-10-05T12:00:00.000Z') };
  const google = await createSignedGoogleCredentials(clock);
  const composition = composeWorker({
    GOOGLE_CLIENT_ID: TEST_GOOGLE_AUDIENCE,
    PERSISTENCE: 'postgres',
    SESSION_TTL_SECONDS: '60',
  }, database, {
    googleVerifier: google.verifier,
    now: () => clock.value,
  });
  assert(composition.mode === 'postgres', 'l’adaptateur PostgreSQL injecté doit sélectionner le mode API postgres.');
  assert(composition.persistence.reason === 'injected-database', 'la source test injectée doit être explicitement reconnue.');

  return { database, worker: composition.worker, clock, credentials: google.credentials, close: () => pg.close() };
}

async function login(
  harness: P0BHarness,
  credentialName: string,
  requestedRole = 'CANDIDATE',
): Promise<Response> {
  const credential = harness.credentials[credentialName];
  assert(credential, `credential signé absent: ${credentialName}`);
  return harness.worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential, requestedRole }),
  }));
}

function cookieToken(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const token = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header)?.[1];
  assert(token, 'le cookie de session doit être émis');
  return token;
}

function withSession(path: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  return new Request(`https://api.test${path}`, { ...init, headers });
}

async function count(database: PostgreSqlDatabase, sql: string, value: string): Promise<number> {
  const result = await database.query<{ count: string | number }>(sql, [value]);
  return Number(result.rows[0]?.count ?? 0);
}

export async function runPostgresIdentityTests(): Promise<PostgresIdentityTestResult[]> {
  const results: PostgresIdentityTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const harness = await createHarness();
  try {
    let userId = '';
    let firstToken = '';

    await check('P0-B PostgreSQL: credential vérifié → utilisateur, identité externe et session hashée', async () => {
      // Une demande ADMIN venant du client est ignorée; le nouvel utilisateur est CANDIDATE.
      const response = await login(harness, 'valid-candidate', 'ADMIN');
      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const body = await response.json() as { authenticated: boolean; user: { id: string; role: string; email: string } };
      assert(body.authenticated && body.user.role === 'CANDIDATE', 'un rôle ADMIN ne doit pas être auto-attribuable.');
      assert(body.user.id.startsWith('usr_') && body.user.email === 'candidate.p0b@example.com', 'profil serveur attendu.');
      userId = body.user.id;
      firstToken = cookieToken(response);

      const users = await harness.database.query<{ id: string; role: string; email: string }>(
        'SELECT id, role, email FROM users WHERE id = $1', [userId],
      );
      const identities = await harness.database.query<{ user_id: string; provider: string; subject: string; verified_email: string }>(
        'SELECT user_id, provider, subject, verified_email FROM external_identities WHERE user_id = $1', [userId],
      );
      const sessions = await harness.database.query<{ user_id: string; token_hash: string; revoked_at: unknown; expires_at: Date | string }>(
        'SELECT user_id, token_hash, revoked_at, expires_at FROM sessions WHERE user_id = $1', [userId],
      );
      assert(users.rows.length === 1 && users.rows[0].role === 'CANDIDATE', 'users doit être écrit dans PostgreSQL.');
      assert(identities.rows.length === 1, 'external_identities doit être écrite dans PostgreSQL.');
      assert(identities.rows[0].provider === 'GOOGLE' && identities.rows[0].subject === verifiedIdentities['valid-candidate'].subject, 'sub Google serveur attendu.');
      assert(identities.rows[0].verified_email === 'candidate.p0b@example.com', 'email vérifié normalisé attendu.');
      assert(sessions.rows.length === 1 && sessions.rows[0].user_id === userId, 'session serveur persistée attendue.');
      assert(sessions.rows[0].token_hash === await hashSessionToken(firstToken), 'seul le SHA-256 du jeton doit être persisté.');
      assert(sessions.rows[0].token_hash !== firstToken && sessions.rows[0].revoked_at === null, 'ni jeton clair ni révocation inattendue.');
      assert(Date.parse(String(sessions.rows[0].expires_at)) > harness.clock.value.getTime(), 'expiration future attendue.');
      const responseJson = JSON.stringify(body);
      assert(!responseJson.includes(firstToken) && !responseJson.includes(verifiedIdentities['valid-candidate'].subject), 'aucun jeton ni subject dans le DTO.');
    });

    await check('P0-B PostgreSQL: résolution existante par subject/email et flux /auth/session → /me', async () => {
      const sameSubject = await login(harness, 'valid-candidate', 'EMPLOYER');
      assert(sameSubject.status === 200, `login résolu attendu 200, reçu ${sameSubject.status}`);
      const sameSubjectBody = await sameSubject.json() as { user: { id: string; role: string } };
      assert(sameSubjectBody.user.id === userId && sameSubjectBody.user.role === 'CANDIDATE', 'le rôle persisté ne doit pas être remplacé par une préférence client.');

      const sameEmail = await login(harness, 'same-email-different-subject', 'EMPLOYER');
      assert(sameEmail.status === 200, `liaison email vérifié attendue 200, reçu ${sameEmail.status}`);
      const sameEmailBody = await sameEmail.json() as { user: { id: string; role: string } };
      assert(sameEmailBody.user.id === userId && sameEmailBody.user.role === 'CANDIDATE', 'un email vérifié existant doit réutiliser le même utilisateur/role.');
      assert(await count(harness.database, 'SELECT count(*) FROM users WHERE id = $1', userId) === 1, 'un utilisateur canonique attendu.');
      assert(await count(harness.database, 'SELECT count(*) FROM external_identities WHERE user_id = $1', userId) === 2, 'les deux sub Google doivent être persistés.');

      const token = cookieToken(sameEmail);
      const authSession = await harness.worker.fetch(withSession('/api/v1/auth/session', token));
      const me = await harness.worker.fetch(withSession('/api/v1/me', token));
      assert(authSession.status === 200 && me.status === 200, '/auth/session et /me doivent relire la session PostgreSQL.');
      const sessionBody = await authSession.json() as { authenticated: boolean; user: { id: string; role: string } };
      const meBody = await me.json() as { authenticated: boolean; user: { id: string; role: string } };
      assert(sessionBody.authenticated && meBody.authenticated, 'les DTO de session doivent être authentifiés.');
      assert(sessionBody.user.id === userId && meBody.user.id === userId, 'l’identité serveur doit rester cohérente.');
      assert(sessionBody.user.role === 'CANDIDATE' && meBody.user.role === 'CANDIDATE', 'le rôle doit venir de users, pas de la requête.');
    });

    await check('P0-B PostgreSQL: RBAC relu depuis role_permissions et user_permissions', async () => {
      await harness.database.query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [userId]);
      const adminToken = cookieToken(await login(harness, 'valid-candidate'));
      const initiallyAllowed = await harness.worker.fetch(withSession('/api/v1/admin/users', adminToken));
      assert(initiallyAllowed.status === 200, `le rôle et les permissions ADMIN seedés doivent autoriser, reçu ${initiallyAllowed.status}`);

      await harness.database.query(
        "DELETE FROM role_permissions WHERE role = 'ADMIN' AND permission_code = 'users:read:any'",
      );
      const roleGrantRemoved = await harness.worker.fetch(withSession('/api/v1/admin/users', adminToken));
      assert(roleGrantRemoved.status === 403, 'la révocation de role_permissions doit être effective sans cache statique.');

      await harness.database.query(
        "INSERT INTO user_permissions (user_id, permission_code) VALUES ($1, 'users:read:any')",
        [userId],
      );
      const userGrantAdded = await harness.worker.fetch(withSession('/api/v1/admin/users', adminToken));
      assert(userGrantAdded.status === 200, 'le grant user_permissions doit être additif et relu par le Worker.');
      const sessionResponse = await harness.worker.fetch(withSession('/api/v1/auth/session', adminToken));
      const sessionBody = await sessionResponse.json() as { user: { role: string }; permissions: string[] };
      assert(sessionBody.user.role === 'ADMIN', 'le rôle ADMIN doit être lu depuis la ligne users.');
      assert(sessionBody.permissions.includes('users:read:any'), 'les permissions effectives serveur doivent figurer dans /auth/session.');
      assert(sessionBody.permissions.includes('users:block'), 'les autres permissions de rôle restent fournies par PostgreSQL.');
    });

    await check('P0-B PostgreSQL: révocation, expiration et cookie de logout', async () => {
      assert((await harness.worker.fetch(withSession('/api/v1/me', firstToken))).status === 200, 'la session doit être valide avant logout.');
      const logout = await harness.worker.fetch(withSession('/api/v1/auth/logout', firstToken, { method: 'POST' }));
      assert(logout.status === 200 && (logout.headers.get('set-cookie') ?? '').includes('Max-Age=0'), 'logout doit expirer le cookie.');
      assert((await harness.worker.fetch(withSession('/api/v1/me', firstToken))).status === 401, 'une session révoquée ne doit plus authentifier.');
      const tokenHash = await hashSessionToken(firstToken);
      const revoked = await harness.database.query<{ revoked_at: Date | string | null }>(
        'SELECT revoked_at FROM sessions WHERE token_hash = $1', [tokenHash],
      );
      assert(revoked.rows.length === 1 && revoked.rows[0].revoked_at !== null, 'revoked_at doit être persisté en base.');

      const expiringToken = cookieToken(await login(harness, 'valid-candidate'));
      assert((await harness.worker.fetch(withSession('/api/v1/auth/session', expiringToken))).status === 200, 'la nouvelle session doit être active.');
      harness.clock.value = new Date(harness.clock.value.getTime() + 61_000);
      assert((await harness.worker.fetch(withSession('/api/v1/auth/session', expiringToken))).status === 401, 'une session expirée doit être refusée depuis PostgreSQL.');
      assert((await harness.worker.fetch(withSession('/api/v1/me', expiringToken))).status === 401, '/me doit aussi refuser la session expirée.');
    });

    await check('P0-B PostgreSQL: rollback complet si la création de session échoue', async () => {
      await harness.database.query(`
        CREATE FUNCTION p0b_fail_session_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'test-only session insert failure';
        END;
        $$
      `);
      await harness.database.query(`
        CREATE TRIGGER p0b_fail_session_insert BEFORE INSERT ON sessions
        FOR EACH ROW EXECUTE FUNCTION p0b_fail_session_insert()
      `);

      const failed = await login(harness, 'rollback-identity', 'EMPLOYER');
      assert(failed.status === 500, `échec forcé de session doit être une erreur serveur, reçu ${failed.status}`);
      const failureBody = await failed.json() as { error: { message: string } };
      assert(!failureBody.error.message.includes('test-only'), 'l’erreur DB interne ne doit pas être exposée.');
      assert(await count(harness.database, 'SELECT count(*) FROM users WHERE email = $1', 'rollback.p0b@example.com') === 0, 'l’utilisateur partiel doit être annulé.');
      assert(await count(harness.database, 'SELECT count(*) FROM external_identities WHERE subject = $1', verifiedIdentities['rollback-identity'].subject) === 0, 'le lien externe partiel doit être annulé.');
      assert(await count(harness.database, 'SELECT count(*) FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)', 'rollback.p0b@example.com') === 0, 'aucune session partielle ne doit exister.');

      await harness.database.query('DROP TRIGGER p0b_fail_session_insert ON sessions');
      await harness.database.query('DROP FUNCTION p0b_fail_session_insert()');
      const retry = await login(harness, 'rollback-identity', 'EMPLOYER');
      assert(retry.status === 201, 'la même identité doit pouvoir être créée après rollback.');
      assert(await count(harness.database, 'SELECT count(*) FROM users WHERE email = $1', 'rollback.p0b@example.com') === 1, 'une seule création après reprise attendue.');
    });
  } finally {
    await harness.close();
  }

  return results;
}
