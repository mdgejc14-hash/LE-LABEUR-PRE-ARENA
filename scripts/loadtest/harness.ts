/**
 * P0-LOAD-TESTS — harness de charge, dérivé du harness d'intégration existant
 * (`createOffersTestHarness` dans `src/backend/api/offers.test.ts`).
 *
 * Réutilisation assumée (audit P0-LOAD-TESTS) :
 *   - `composeWorker` — composition réelle du Worker (routes, RBAC, sécurité) ;
 *   - PGlite WASM + `migrations/*.sql` — base ISOLÉE en mémoire, jamais la
 *     production, jamais un réseau externe ;
 *   - `createGoogleCredentialVerifier` — flux d'authentification réel avec
 *     JWKS local (clé de test), aucune dépendance Google ;
 *   - `createInMemoryObjectStorage` — SIMULATEUR R2 local (Cloudflare réel
 *     indisponible : marqué BLOCKED_EXTERNAL_ACCESS dans le rapport) ;
 *   - session cookie + `authRequest` — mêmes helpers que les tests API.
 *
 * Ajouts propres au load test :
 *   - identités synthétiques EN QUANTITÉ (employeurs/candidats N) ;
 *   - IP simulée par utilisateur (rate-limit auth réaliste, horloge figée) ;
 *   - métrique DB interne (latence SQL, rollbacks, erreurs) via un driver
 *     instrumenté ;
 *   - provisioning ADMIN (même technique que les suites existantes).
 *
 * AUCUNE écriture hors de cette base de test ; aucun paiement réel ; aucun PSP
 * réel ; aucun dossier utilisateur réel.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeWorker, type WorkerComposition } from '../../src/backend/api/entry';
import { SESSION_COOKIE_NAME } from '../../src/backend/identity/cookies';
import { base64UrlEncode, newEntityId, newOpaqueSessionToken } from '../../src/backend/identity/ids';
import { createGoogleCredentialVerifier } from '../../src/backend/identity/googleVerifier';
import { createInMemoryObjectStorage } from '../../src/backend/documents/storage';
import type { GoogleCredentialVerifier, GoogleExternalIdentity } from '../../src/backend/productionContracts';
import { createSqlIdentityStores } from '../../src/backend/identity/sqlStores';
import { createPostgresDatabase } from '../../src/backend/persistence/postgresDatabase';
import {
  toPostgresClientPort,
  type DriverPoolLike,
  type DriverQueryResult,
} from '../../src/backend/persistence/sqlClient';
import { offerIdempotencyCache } from '../../src/backend/repositories/offerRepository';
import type { PostgreSqlDatabase } from '../../src/backend/services/database';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

export const LOADTEST_AUDIENCE = 'p0-load-tests-client.apps.googleusercontent.com';
export const LOADTEST_CLOCK_ISO = '2026-10-05T14:00:00.000Z';

/* ------------------------------------------------------------------ */
/* Métrique DB instrumentée                                           */
/* ------------------------------------------------------------------ */

export interface DbMetrics {
  queries: number;
  errors: number;
  rollbacks: number;
  durations: number[];
}

const DB_DURATION_CAP = 400_000;

function createInstrumentedDriver(database: PGlite, metrics: DbMetrics): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<Row>> => {
    const started = performance.now();
    try {
      const result = await database.query<Row>(sql, [...values]);
      return { rows: result.rows, rowCount: result.rowCount };
    } catch (error) {
      metrics.errors += 1;
      throw error;
    } finally {
      const duration = performance.now() - started;
      if (metrics.durations.length < DB_DURATION_CAP) metrics.durations.push(duration);
      if (/^\s*rollback\b/i.test(sql)) metrics.rollbacks += 1;
      metrics.queries += 1;
    }
  };

  return {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Identités synthétiques + credentials JWT locaux                     */
/* ------------------------------------------------------------------ */

export type LoadRole = 'EMPLOYER' | 'CANDIDATE';

export interface LoadActor {
  role: LoadRole;
  /** Index utilisateur (0..users-1). */
  userIndex: number;
  subject: string;
  email: string;
  displayName: string;
  credential: string;
}

async function createCredentialSigner(clock: { value: Date }): Promise<{
  verifier: GoogleCredentialVerifier;
  sign: (identity: GoogleExternalIdentity) => Promise<string>;
}> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = {
    kty: exported.kty,
    n: exported.n,
    e: exported.e,
    alg: 'RS256',
    kid: 'p0-load-tests-kid',
    use: 'sig',
  };
  const verifier = createGoogleCredentialVerifier({
    audience: LOADTEST_AUDIENCE,
    jwksUrl: 'https://load-tests.test/jwks',
    now: () => clock.value,
    fetcher: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'content-type': 'application/json' },
    }),
  });

  const sign = async (identity: GoogleExternalIdentity): Promise<string> => {
    const issuedAt = Math.floor(clock.value.getTime() / 1000);
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: 'p0-load-tests-kid' })));
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: LOADTEST_AUDIENCE,
      sub: identity.subject,
      iat: issuedAt,
      exp: issuedAt + 300,
      email: identity.email,
      email_verified: identity.emailVerified,
      name: identity.displayName,
    })));
    const signedContent = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(signedContent),
    );
    return `${signedContent}.${base64UrlEncode(new Uint8Array(signature))}`;
  };

  return { verifier, sign };
}

function actorIdentity(role: LoadRole, userIndex: number): GoogleExternalIdentity {
  const kind = role === 'EMPLOYER' ? 'employer' : 'candidate';
  return {
    subject: `p0lt-${kind}-${userIndex}`,
    email: `${kind}${userIndex}@load-tests.test`,
    emailVerified: true,
    displayName: `${role === 'EMPLOYER' ? 'Emploi' : 'Candidat'} Load ${userIndex}`,
  };
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

export interface LoadHarness {
  composition: WorkerComposition;
  worker: { fetch(request: Request): Promise<Response> };
  database: PostgreSqlDatabase;
  pg: PGlite;
  clock: { value: Date };
  dbMetrics: DbMetrics;
  objectStorage: ReturnType<typeof createInMemoryObjectStorage>;
  /** IP simulée déterministe par utilisateur (rate-limit auth par sujet). */
  simulatedIp(userIndex: number): string;
  /** Crée (au besoin) l'identité + credential de l'utilisateur. */
  actorFor(role: LoadRole, userIndex: number): Promise<LoadActor>;
  /** Connexion réelle (POST /auth/google/credential) → cookie de session. */
  login(actor: LoadActor): Promise<{ token: string; userId: string }>;
  /** ADMIN provisionné (même technique que les suites existantes). */
  provisionAdmin(displayName: string): Promise<{ token: string; userId: string }>;
  close(): Promise<void>;
}

export interface LoadHarnessOptions {
  /** Horloge déterministe identique aux suites existantes. */
  clockIso?: string;
}

export async function createLoadHarness(options: LoadHarnessOptions = {}): Promise<LoadHarness> {
  offerIdempotencyCache.clear();
  const pg = new PGlite();
  const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    await pg.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
  }

  const dbMetrics: DbMetrics = { queries: 0, errors: 0, rollbacks: 0, durations: [] };
  const driver = createInstrumentedDriver(pg, dbMetrics);
  const database = createPostgresDatabase(toPostgresClientPort(driver));
  const clock = { value: new Date(options.clockIso ?? LOADTEST_CLOCK_ISO) };
  const { verifier, sign } = await createCredentialSigner(clock);
  const objectStorage = createInMemoryObjectStorage();

  const composition = composeWorker({
    GOOGLE_CLIENT_ID: LOADTEST_AUDIENCE,
    PERSISTENCE: 'postgres',
    SESSION_TTL_SECONDS: '3600',
  }, database, {
    googleVerifier: verifier,
    now: () => clock.value,
    documentStorage: objectStorage,
    documentUrlSigningSecret: 'p0-load-tests-r2-signing-secret',
  });

  const actors = new Map<string, LoadActor>();
  const credentialCache = new Map<string, string>();

  const simulatedIp = (userIndex: number): string => {
    const a = 10 + Math.floor(userIndex / (254 * 254));
    const b = Math.floor(userIndex / 254) % 254;
    const c = userIndex % 254;
    return `${a % 256}.${b}.${c}.1`;
  };

  const actorFor = async (role: LoadRole, userIndex: number): Promise<LoadActor> => {
    const key = `${role}:${userIndex}`;
    const existing = actors.get(key);
    if (existing) return existing;
    const identity = actorIdentity(role, userIndex);
    const cached = credentialCache.get(identity.subject);
    const credential: string = cached ?? (await sign(identity));
    if (!cached) credentialCache.set(identity.subject, credential);
    const actor: LoadActor = {
      role,
      userIndex,
      subject: identity.subject,
      email: identity.email,
      displayName: identity.displayName ?? identity.email,
      credential,
    };
    actors.set(key, actor);
    return actor;
  };

  const login = async (actor: LoadActor): Promise<{ token: string; userId: string }> => {
    const response = await composition.worker.fetch(new Request(
      'https://api.test/api/v1/auth/google/credential',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': simulatedIp(actor.userIndex),
        },
        body: JSON.stringify({ credential: actor.credential, requestedRole: actor.role }),
      },
    ));
    if (response.status !== 200 && response.status !== 201) {
      const text = await response.text();
      throw new Error(`login ${actor.role}#${actor.userIndex} → ${response.status}: ${text.slice(0, 200)}`);
    }
    const header = response.headers.get('set-cookie') ?? '';
    const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header);
    if (!match || !match[1]) throw new Error('cookie de session absent');
    const body = await response.json() as { user: { id: string } };
    return { token: match[1], userId: body.user.id };
  };

  const provisionAdmin = async (displayName: string): Promise<{ token: string; userId: string }> => {
    const userId = newEntityId('usr');
    const token = newOpaqueSessionToken();
    const createdAt = new Date(clock.value.getTime()).toISOString();
    const expiresAt = new Date(clock.value.getTime() + 3_600_000).toISOString();
    const stores = createSqlIdentityStores(database);
    await stores.transaction(async transaction => {
      await transaction.users.create({
        id: userId,
        role: 'ADMIN',
        status: 'ACTIVE',
        email: `admin.${userId}@load-tests.test`,
        displayName,
      });
      await transaction.sessions.create({ userId, token, createdAt, expiresAt });
    });
    return { token, userId };
  };

  return {
    composition,
    worker: composition.worker,
    database,
    pg,
    clock,
    dbMetrics,
    objectStorage,
    simulatedIp,
    actorFor,
    login,
    provisionAdmin,
    close: async () => {
      await pg.close();
      offerIdempotencyCache.clear();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Drain ciblé                                                         */
/* ------------------------------------------------------------------ */

/**
 * Draine l'outbox jusqu'à ce que l'événement `CONTRACT_ACTIVATED` du contrat
 * soit `PROCESSED` (borné). Un simple `drainEvents(50)` ne suffit plus quand
 * le backlog de plusieurs unités s'accumule : la file est servie dans l'ordre
 * et l'événement le plus récent peut rester derrière.
 */
export async function drainUntilContractActivated(
  harness: LoadHarness,
  contractId: string,
  maxPasses = 30,
): Promise<boolean> {
  const worker = harness.composition.automationWorker;
  if (!worker) return false;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const row = await harness.database.query<{ status: string }>(
      "SELECT status FROM automation_outbox WHERE aggregate_id = $1 AND event_type = 'CONTRACT_ACTIVATED'",
      [contractId],
    );
    const status = row.rows[0]?.status;
    if (status === 'PROCESSED') return true;
    await worker.drainEvents(100);
  }
  return false;
}

/**
 * Balayage `SCHEDULED → DUE` borné jusqu'à ce que le contrat possède un
 * paiement SALARY DUE. `runDuePayments(limit)` est borné globalement : sous
 * charge, les lignes d'autres contrats peuvent saturer la limite du passage.
 */
export async function sweepUntilSalaryDue(
  harness: LoadHarness,
  contractId: string,
  maxPasses = 40,
  limit = 250,
): Promise<{ passes: number; found: boolean }> {
  const worker = harness.composition.automationWorker;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const due = await harness.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM payments
        WHERE contract_id = $1 AND payment_type = 'SALARY' AND status = 'DUE'`,
      [contractId],
    );
    if (Number(due.rows[0]?.count ?? 0) > 0) return { passes: pass, found: true };
    if (worker) await worker.runDuePayments(limit);
  }
  return { passes: maxPasses, found: false };
}

/* ------------------------------------------------------------------ */
/* Requêtes typées                                                     */
/* ------------------------------------------------------------------ */

export interface LtRequestOptions {
  method?: string;
  token?: string | null;
  idempotencyKey?: string;
  body?: unknown;
  rawBody?: BodyInit;
  contentType?: string;
  headers?: Record<string, string>;
  userIndex?: number;
}

/**
 * Construit une requête API identique à celles des suites existantes
 * (`authRequest`), avec en plus l'IP simulée de l'utilisateur pour que le
 * rate-limit `auth` soit réaliste par sujet (horloge figée oblige).
 */
export function ltRequest(path: string, options: LtRequestOptions = {}): Request {
  const headers = new Headers(options.headers);
  if (options.token) headers.set('cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.body !== undefined) headers.set('content-type', options.contentType ?? 'application/json');
  if (options.contentType && options.rawBody !== undefined) headers.set('content-type', options.contentType);
  if (options.userIndex !== undefined) {
    const index = options.userIndex;
    const a = 10 + Math.floor(index / (254 * 254));
    const b = Math.floor(index / 254) % 254;
    const c = index % 254;
    headers.set('cf-connecting-ip', `${a % 256}.${b}.${c}.1`);
  }
  const body = options.rawBody !== undefined
    ? options.rawBody
    : (options.body !== undefined ? JSON.stringify(options.body) : undefined);
  return new Request(`https://api.test${path}`, {
    method: options.method ?? (body !== undefined ? 'POST' : 'GET'),
    headers,
    ...(body !== undefined ? { body } : {}),
  });
}
