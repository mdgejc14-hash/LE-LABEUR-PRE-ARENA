/**
 * LE LABEUR — P0-LOAD-TESTS — environnement de charge RÉEL.
 *
 *   client HTTP (TCP réel) → serveur HTTP local → `composition.worker.fetch`
 *                          → pool `pg` instrumenté → PostgreSQL 17.10 RÉEL
 *
 * Rien n'est simulé :
 *  - le moteur PostgreSQL est un binaire natif (`embedded-postgres`), le même
 *    que celui de `npm run verify:postgres` (TEST/LOCAL, jamais une base
 *    managée) ;
 *  - les migrations 0001→0018 du dépôt sont appliquées par le runner réel ;
 *  - le Worker est composé par `composeWorker` (la fonction de production), le
 *    même chemin que l'entrée Cloudflare ;
 *  - les requêtes passent par une SOCKET TCP réelle (`node:http`), pas par un
 *    appel de fonction : la mesure inclut donc la pile réseau, le serveur HTTP
 *    et le worker.
 *
 * Ce qui reste HORS de portée, et n'est donc jamais chiffré : Hyperdrive,
 * workerd déployé, R2 réel et TURN réel. Le stockage objet est un adaptateur
 * mémoire INJECTÉ (le domaine documents est fail-closed sans lui) ; l'absence
 * de TURN est un ÉTAT OBSERVÉ (`NOT_CONFIGURED`), pas une invention.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeWorker, type WorkerComposition, type WorkerEnvironment } from '../../src/backend/api/entry';
import type { GoogleCredentialVerifier } from '../../src/backend/productionContracts';
import { createPostgresDatabase } from '../../src/backend/persistence/postgresDatabase';
import { applyMigrations, loadMigrations } from '../../src/backend/persistence/migrationRunner';
import { toPostgresClientPort, type PostgresClientPort } from '../../src/backend/persistence/sqlClient';
import { createSqlIdentityStores } from '../../src/backend/identity/sqlStores';
import { SESSION_COOKIE_NAME } from '../../src/backend/identity/cookies';
import { createGoogleCredentialVerifier } from '../../src/backend/identity/googleVerifier';
import { base64UrlEncode, newEntityId, newOpaqueSessionToken } from '../../src/backend/identity/ids';
import { createInMemoryObjectStorage } from '../../src/backend/documents/storage';
import { MetricsCollector, type Sample } from './loadMetrics';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

export const LOAD_TEST_AUDIENCE = 'p0-loadtests.apps.googleusercontent.com';

/* ------------------------------------------------------------------ */
/* Instrumentation du client PostgreSQL                                */
/* ------------------------------------------------------------------ */

export interface DatabaseProbe {
  /** Latence RÉELLE de chaque requête SQL (`pool.query`), en ms. */
  query: MetricsCollector;
  /** Temps d'ATTENTE d'une connexion (`pool.acquire`) : mesure de saturation. */
  acquire: MetricsCollector;
  /** Une mesure synthétique de bout en bout (`SELECT 1`) par échantillonnage. */
  ping: MetricsCollector;
}

export function createDatabaseProbe(): DatabaseProbe {
  return { query: new MetricsCollector(), acquire: new MetricsCollector(), ping: new MetricsCollector() };
}

/**
 * Enveloppe le port client SANS changer sa sémantique : elle chronomètre
 * uniquement. `acquire` distingue l'attente de connexion (saturation du pool)
 * du temps d'exécution SQL.
 */
export function instrumentPostgresClient(client: PostgresClientPort, probe: DatabaseProbe): PostgresClientPort {
  async function time<T>(
    collector: MetricsCollector,
    label: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const started = process.hrtime.bigint();
    let sample: Sample;
    try {
      const result = await work();
      sample = { durationMs: elapsedMs(started), ok: true, status: 200 };
      collector.record(label, sample);
      return result;
    } catch (error) {
      sample = { durationMs: elapsedMs(started), ok: false, status: 500 };
      collector.record(label, sample);
      throw error;
    }
  }

  return {
    query: <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) =>
      time(probe.query, 'sql.query', () => client.query<Row>(sql, values)),
    acquire: async () => {
      const handle = await time(probe.acquire, 'pool.acquire', () => client.acquire());
      return {
        query: <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) =>
          time(probe.query, 'sql.tx.query', () => handle.query<Row>(sql, values)),
        release: () => handle.release(),
      };
    },
    ...(client.end ? { end: () => client.end!() } : {}),
  };
}

function elapsedMs(started: bigint): number {
  return Number((process.hrtime.bigint() - started) / 1_000_000n);
}

/* ------------------------------------------------------------------ */
/* Moteur PostgreSQL local                                             */
/* ------------------------------------------------------------------ */

export interface LoadEnvironmentOptions {
  /** Vérificateur Google des identités de la campagne (clé éphémère locale). */
  googleVerifier: GoogleCredentialVerifier;
  port?: number;
  /** Taille du pool `pg` (le Worker de production est plafonné à 5). */
  poolMax?: number;
  statementTimeoutMs?: number;
  /** Applique les migrations (toujours vrai pour un environnement neuf). */
  migrate?: boolean;
}

export interface LoadEnvironment {
  connectionString: string;
  /** Chaîne expurgée du mot de passe : affichable, jamais secrète. */
  publicTarget: string;
  pool: Pool;
  composition: WorkerComposition;
  probe: DatabaseProbe;
  server: Server;
  baseUrl: string;
  /** Horodatage de démarrage du serveur HTTP (mesures). */
  startedAtMs: number;
  /** OTP salaire capturés par la composition (jamais exposés par l'API). */
  salaryOtps: Map<string, string>;
  /** Compteurs Cron/Queue réellement observés (ticks réussis / échecs de tick). */
  cron: { ticks: number; failed: number };
  stop(): Promise<void>;
}

async function startEmbeddedPostgres(port: number): Promise<{ instance: EmbeddedPostgres; connectionString: string; password: string; dataDir: string }> {
  const dataDir = resolve(REPO_ROOT, '.tmp', 'loadtests', `data-${port}`);
  mkdirSync(resolve(REPO_ROOT, '.tmp', 'loadtests'), { recursive: true });
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
    instance: postgres,
    connectionString: `postgresql://lelabeur:${password}@127.0.0.1:${port}/lelabeur?sslmode=disable`,
    password,
    dataDir,
  };
}

async function waitForDatabase(connectionString: string, attempts = 60): Promise<void> {
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

function toRequest(request: IncomingMessage, body: Buffer, baseUrl: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const entry of value) headers.append(name, entry);
    else headers.set(name, value);
  }
  const method = (request.method ?? 'GET').toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(`${baseUrl}${request.url ?? '/'}`, {
    method,
    headers,
    ...(hasBody && body.length > 0 ? { body: new Uint8Array(body) } : {}),
  });
}

async function writeResponse(nodeResponse: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return; // traité ci-dessous
    headers[name] = value;
  });
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (cookies.length > 0) headers['set-cookie'] = cookies;
  nodeResponse.writeHead(response.status, headers);
  const buffer = Buffer.from(await response.arrayBuffer());
  nodeResponse.end(buffer);
}

/* ------------------------------------------------------------------ */
/* Identités Google signées (clé éphémère, boucle locale)              */
/* ------------------------------------------------------------------ */

/**
 * Réserve d'identités virtualisée : toutes les identités de la campagne sont
 * signées AVANT la fenêtre de mesure (une signature RSA par utilisateur est un
 * coût de PRÉPARATION, jamais un coût de charge interpolé).
 */
export interface LoadIdentityPool {
  verifier: GoogleCredentialVerifier;
  total: number;
  /** Alloue `count` identités consécutives : renvoie leurs JWT signés. */
  allocate(count: number): string[];
  remaining(): number;
}

export async function createLoadIdentityPool(total: number): Promise<LoadIdentityPool> {
  const now = new Date();
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const kid = 'p0-loadtests-key';
  const publicJwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid, alg: 'RS256', use: 'sig' };
  const verifier = createGoogleCredentialVerifier({
    audience: LOAD_TEST_AUDIENCE,
    jwksUrl: 'http://127.0.0.1:1/jwks', // jamais appelé : le fetcher est injecté.
    now: () => now,
    fetcher: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'content-type': 'application/json' },
    }),
  });

  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid })));
  const issuedAt = Math.floor(now.getTime() / 1000);
  const credentials: string[] = new Array(total);
  const batch = 256;
  for (let offset = 0; offset < total; offset += batch) {
    const size = Math.min(batch, total - offset);
    const signed = await Promise.all(Array.from({ length: size }, async (_, index) => {
      const identity = `u-${String(offset + index).padStart(7, '0')}`;
      const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: LOAD_TEST_AUDIENCE,
        sub: `google-sub-${identity}`,
        iat: issuedAt,
        exp: issuedAt + 86_400,
        email: `${identity}@loadtests.example`,
        email_verified: true,
        name: `Load ${identity}`,
      })));
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        new TextEncoder().encode(`${header}.${payload}`),
      );
      return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
    }));
    signed.forEach((credential, index) => { credentials[offset + index] = credential; });
  }

  let cursor = 0;
  return {
    verifier,
    total,
    allocate(count: number): string[] {
      if (cursor + count > total) throw new Error(`réserve d'identités épuisée (${cursor}+${count} > ${total})`);
      const slice = credentials.slice(cursor, cursor + count);
      cursor += count;
      return slice;
    },
    remaining: () => total - cursor,
  };
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

export async function startLoadEnvironment(options: LoadEnvironmentOptions): Promise<LoadEnvironment> {
  const port = options.port ?? Number(process.env.LOADTEST_PG_PORT ?? 55532);
  const poolMax = options.poolMax ?? Number(process.env.LOADTEST_DB_POOL ?? 40);
  const statementTimeoutMs = options.statementTimeoutMs ?? 15_000;

  const embedded = await startEmbeddedPostgres(port);
  await waitForDatabase(embedded.connectionString);

  const pool = new Pool({
    connectionString: embedded.connectionString,
    max: poolMax,
    application_name: 'lelabeur-loadtests',
  });
  pool.on('error', () => undefined);

  const probe = createDatabaseProbe();
  const rawClient = toPostgresClientPort(pool);
  const instrumented = instrumentPostgresClient(rawClient, probe);
  const database = createPostgresDatabase(instrumented, {
    statementTimeoutMs,
    applicationName: 'lelabeur-loadtests',
    redactSecrets: [embedded.connectionString, embedded.password],
  });

  if (options.migrate !== false) {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    // Les migrations passent par le client NON instrumenté : elles ne font pas
    // partie de la fenêtre de mesure (elles s'exécutent avant le chronomètre).
    await applyMigrations(rawClient, migrations, { statementTimeoutMs: 30_000 }, [
      embedded.connectionString,
      embedded.password,
    ]);
  }

  const salaryOtps = new Map<string, string>();
  const env: WorkerEnvironment = {
    GOOGLE_CLIENT_ID: LOAD_TEST_AUDIENCE,
    PERSISTENCE: 'postgres',
    POSTGRES_CONNECTION_STRING: embedded.connectionString,
    SESSION_TTL_SECONDS: '86400',
    DB_POOL_MAX: String(poolMax),
    DB_STATEMENT_TIMEOUT_MS: String(statementTimeoutMs),
    DB_APPLICATION_NAME: 'lelabeur-loadtests',
    WORKER_ENV: 'loadtests',
  };
  const composition = composeWorker(env, database, {
    googleVerifier: options.googleVerifier,
    // Stockage objet INJECTÉ : le domaine documents est fail-closed sans lui.
    // R2 RÉEL indisponible dans cette session — jamais de chiffre R2 inventé.
    documentStorage: createInMemoryObjectStorage(),
    salaryTestOtpSink: (paymentId, otp) => { salaryOtps.set(paymentId, otp); },
  });

  let httpPort = 0;
  const server = createServer((nodeRequest, nodeResponse) => {
    const chunks: Buffer[] = [];
    nodeRequest.on('data', chunk => chunks.push(Buffer.from(chunk)));
    nodeRequest.on('end', () => {
      void (async () => {
        try {
          const request = toRequest(nodeRequest, Buffer.concat(chunks), `http://127.0.0.1:${httpPort}`);
          const response = await composition.worker.fetch(request);
          await writeResponse(nodeResponse, response);
        } catch (error) {
          if (!nodeResponse.headersSent) nodeResponse.writeHead(500, { 'content-type': 'application/json' });
          nodeResponse.end(JSON.stringify({ error: 'LOAD_TEST_SERVER_ERROR', message: String((error as Error)?.message ?? error) }));
        }
      })();
    });
  });
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 130_000;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') httpPort = address.port;
      resolvePromise();
    });
  });

  const publicTarget = `127.0.0.1:${port}/lelabeur`;

  return {
    connectionString: embedded.connectionString,
    publicTarget,
    pool,
    composition,
    probe,
    server,
    baseUrl: `http://127.0.0.1:${httpPort}`,
    startedAtMs: Date.now(),
    salaryOtps,
    cron: { ticks: 0, failed: 0 },
    async stop() {
      await new Promise<void>(resolvePromise => server.close(() => resolvePromise()));
      await pool.end().catch(() => undefined);
      await embedded.instance.stop().catch(() => undefined);
      rmSync(embedded.dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Provisionne un ADMIN RÉEL côté serveur (jamais auto-attribuable depuis
 * l'API) : même mécanisme que les vérifications PostgreSQL existantes.
 */
export async function provisionAdmin(environment: LoadEnvironment, label: string): Promise<{ userId: string; token: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const stores = createSqlIdentityStores(
    createPostgresDatabase(toPostgresClientPort(environment.pool), { redactSecrets: [environment.connectionString] }),
  );
  await stores.transaction(async transaction => {
    await transaction.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.${label}.${userId}@loadtests.example`,
      displayName: `Load Admin ${label}`,
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { userId, token };
}

export function adminCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}
