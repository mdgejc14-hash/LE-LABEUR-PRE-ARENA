/**
 * LE LABEUR — P0-LOAD-TESTS-1 — harness de charge (ÉTAPE A, audit + réutilisation).
 *
 * AUDIT DES OUTILS EXISTANTS (réutilisés, rien n'est dupliqué) :
 *   - `createOffersTestHarness` (src/backend/api/offers.test.ts) : patron de
 *     référence — PGlite + migrations réelles + composeWorker + fausses
 *     credentials Google RS256 vérifiées par le VRAI vérificateur ;
 *   - helpers PostgreSQL/PGlite : `createPostgresDatabase`, `toPostgresClientPort`,
 *     pilote `DriverPoolLike` sur `@electric-sql/pglite` (identique aux tests) ;
 *   - composition réelle : `composeWorker` (src/backend/api/entry.ts) — le mÊME
 *     graphe d'objets que la production Worker (routeur, sécurité, sessions SQL,
 *     repositories, transactions, outbox) ;
 *   - workerd / Hyperdrive : couverts par `verify:workerd` / `verify:postgres`
 *     (hors périmètre de la boucle de charge in-process, cf. limites) ;
 *   - fixtures : les parcours réutilisent les formes de charge utile validées
 *     par les tests d'intégration (cronQueue.test.ts, securityAntiFraud.test.ts) ;
 *   - authentification : `POST /api/v1/auth/google/credential` + cookie de
 *     session — jamais de contournement, les utilisateurs synthétiques passent
 *     par la vrai chaîne JWT → session SQL.
 *
 * CE QUI EST CRÉÉ ICI (le minimum pour une campagne reproductible) :
 *   1. génération de N utilisateurs SYNTHÉTIQUES (paires employeur/candidat) ;
 *   2. émetteur de credentials Google RS256 signées par une clé de campagne
 *      éphémère (audience dédiée, JWKS servi par un fetcher in-process) ;
 *   3. composition du worker réel avec :
 *      - persistance PGlite (PostgreSQL WASM embarqué) + migrations réelles ;
 *      - horloge métier FIXE (déterminisme ; la latence est mesurée hors horloge
 *        métier, via performance.now()) ;
 *      - politique de rate-limit neutralisée de façon EXPLICITE pour mesurer la
 *        capacité brute de la chaîne (le comportement anti-fraude lui-même est
 *        vérifié par P0-SECURITY-ANTI-FRAUD, hors mesure de capacité) ;
 *   4. client HTTP in-process (Request → worker.fetch) avec mesure par requête.
 *
 * P0-LOAD-TESTS-2 (PARTIE 2 — additions strictement additives, la PARTIE 1 est
 * inchangée dans son comportement) :
 *   - exposition du port `database` et du worker d'automatisation EXISTANT
 *     (`automationWorker`, P0-CRON-QUEUE) composé par le même `composeWorker` ;
 *   - `composePeerAutomationWorker()` : second worker sur la MÊME base pour les
 *     tests « deux workers simultanés » (même discipline que cronQueue.test.ts) ;
 *   - horloge métier mutable (`clock`) — les campagnes ne l'avancent jamais ;
 *   - sonde de latence SQL (`dbProbe`) : chaque requête du moteur embarqué est
 *     mesurée sans modifier aucun comportement (métriques DB de la PARTIE 2).
 *
 * DONNÉES : 100 % synthétiques (emails en .invalid, noms préfixés LOADTEST).
 * AUCUN PSP, AUCUN email/SMS réel, AUCUNE cible de production.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeWorker, type WorkerComposition } from '../../src/backend/api/entry';
import type { AutomationWorker } from '../../src/backend/automation/worker';
import type { PostgreSqlDatabase } from '../../src/backend/services/database';
import { SESSION_COOKIE_NAME } from '../../src/backend/identity/cookies';
import { base64UrlEncode } from '../../src/backend/identity/ids';
import { createGoogleCredentialVerifier } from '../../src/backend/identity/googleVerifier';
import type { GoogleExternalIdentity } from '../../src/backend/productionContracts';
import { createPostgresDatabase } from '../../src/backend/persistence/postgresDatabase';
import {
  toPostgresClientPort,
  type DriverPoolLike,
  type DriverQueryResult,
} from '../../src/backend/persistence/sqlClient';
import { offerIdempotencyCache } from '../../src/backend/repositories/offerRepository';
import type { RateLimitRule } from '../../src/backend/api/security';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

/** Audience dédiée aux campagnes de charge — distincte des audiences de tests. */
export const LOAD_AUDIENCE = 'load-p0-load-tests-1-audience';
const LOAD_KID = 'load-p0-load-tests-1-kid';

/** Horloge métier synthétique fixe : rend les campagnes reproductibles. */
export const LOAD_BUSINESS_CLOCK_ISO = '2026-10-05T14:00:00.000Z';

export type SyntheticRole = 'EMPLOYER' | 'CANDIDATE';

export interface SyntheticUser {
  index: number;
  role: SyntheticRole;
  identityKey: string;
  email: string;
  displayName: string;
  subject: string;
}

export interface UserPair {
  journeyId: string;
  employer: SyntheticUser;
  candidate: SyntheticUser;
  /**
   * Le bassin de matching est plafonné à MAX_MATCHING_CANDIDATES (200) par le
   * domaine : seul un sous-ensemble borné de candidats publie un profil de
   * matching (opt-in), sinon `matching-runs` répondrait 409 par garde-fou métier.
   */
  publishMatchingProfile: boolean;
}

export interface LoadHarness {
  pg: PGlite;
  worker: { fetch(request: Request): Promise<Response> };
  /** Composition complète du worker (repositories, webrtc, payments…) — lecture seule. */
  composition: WorkerComposition;
  /** Port PostgreSQL réel (requêtes + transactions) — mêmes frontières que la production. */
  database: PostgreSqlDatabase;
  /**
   * P0-LOAD-TESTS-2 — worker d'automatisation P0-CRON-QUEUE composé par le MÊME
   * `composeWorker` (aucun second moteur) : claim verrouillé, retry, dead-letter,
   * récupération d'orphelins, `runScheduledCycle`. Réutilisé tel quel par les
   * suites résilience/queue de la PARTIE 2.
   */
  automationWorker: AutomationWorker;
  /**
   * Compose un SECOND worker d'automatisation sur la MÊME base (même discipline
   * que `freshAutomationWorker` de cronQueue.test.ts) pour les tests « deux
   * workers simultanés ». Aucun état partagé en mémoire : seule la base est commune.
   */
  composePeerAutomationWorker(): AutomationWorker;
  /**
   * Horloge métier MUTABLE, initialisée à l'horloge fixe de campagne. Les
   * campagnes ne l'avancent JAMAIS (déterminisme identique à la PARTIE 1) ;
   * les suites résilience l'avancent explicitement (retry, expiration).
   */
  clock: { value: Date };
  /**
   * P0-LOAD-TESTS-2 — sonde de latence SQL : chaque requête exécutée par le
   * moteur PostgreSQL embarqué est horodatée (latence + intervalle), sans
   * modifier aucun comportement. Agrégation dans `metrics.ts`.
   */
  dbProbe: DbLatencyProbe;
  employers: SyntheticUser[];
  candidates: SyntheticUser[];
  pairs: UserPair[];
  /** Credentials JWT signées, indexées par identityKey. */
  credentials: Record<string, string>;
  businessClockIso: string;
  bootstrapMs: number;
  close: () => Promise<void>;
}

/**
 * Sonde de latence SQL brute (enregistrement uniquement, aucune interprétation).
 * `intervals` conserve [début, fin) en ms `performance.now()` pour calculer la
 * fraction occupée du moteur (fusion des intervalles — voir `aggregateDbLatency`).
 */
export interface DbLatencyProbe {
  latencies: number[];
  intervals: Array<[number, number]>;
  transactions: { begun: number; committed: number; rolledBack: number };
  /** Horodatage `performance.now()` du démarrage du harness (repère des fenêtres). */
  startedAtMs: number;
}

/** Politique neutralisée : mesure de capacité brute, explicitement déclarée au rapport. */
const NEUTRALIZED_RATE_LIMIT: Record<string, RateLimitRule> = {
  auth: { maxRequests: 2_147_483_647, windowMs: 60_000 },
  webhook: { maxRequests: 2_147_483_647, windowMs: 60_000 },
  'salary-otp': { maxRequests: 2_147_483_647, windowMs: 60_000 },
  'webrtc-signaling': { maxRequests: 2_147_483_647, windowMs: 60_000 },
  'domain-mutations': { maxRequests: 2_147_483_647, windowMs: 60_000 },
  'documents-access': { maxRequests: 2_147_483_647, windowMs: 60_000 },
  'reconciliation-sensitive': { maxRequests: 2_147_483_647, windowMs: 60_000 },
};

/** Pilote DriverPoolLike sur PGlite — même forme que les tests d'intégration.
 * P0-LOAD-TESTS-2 : chaque requête est mesurée (latence + intervalle) par la
 * sonde — AUCUN comportement n'est modifié. */
function createPGliteDriver(database: PGlite, probe: DbLatencyProbe | null): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<Row>> => {
    if (!probe) {
      const direct = await database.query<Row>(sql, [...values]);
      return { rows: direct.rows, rowCount: direct.rowCount };
    }
    const startedAt = performance.now();
    try {
      const result = await database.query<Row>(sql, [...values]);
      return { rows: result.rows, rowCount: result.rowCount };
    } finally {
      const endedAt = performance.now();
      probe.latencies.push(endedAt - startedAt);
      probe.intervals.push([startedAt, endedAt]);
      const head = sql.trimStart().slice(0, 7).toUpperCase();
      if (head.startsWith('BEGIN')) probe.transactions.begun += 1;
      else if (head.startsWith('COMMIT')) probe.transactions.committed += 1;
      else if (head.startsWith('ROLLBACK')) probe.transactions.rolledBack += 1;
    }
  };
  return {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

export function buildSyntheticUsers(userCount: number): { employers: SyntheticUser[]; candidates: SyntheticUser[] } {
  if (!Number.isInteger(userCount) || userCount < 2 || userCount % 2 !== 0) {
    throw new Error(`users doit être un entier pair ≥ 2 (moitié EMPLOYER, moitié CANDIDATE), reçu ${userCount}`);
  }
  const half = userCount / 2;
  const employers: SyntheticUser[] = [];
  const candidates: SyntheticUser[] = [];
  for (let index = 0; index < half; index += 1) {
    const tag = String(index + 1).padStart(5, '0');
    employers.push({
      index,
      role: 'EMPLOYER',
      identityKey: `load-employer-${tag}`,
      email: `load.employer.${tag}@loadtest.invalid`,
      displayName: `LOADTEST Société Synthétique ${tag}`,
      subject: `google-sub-load-employer-${tag}`,
    });
    candidates.push({
      index,
      role: 'CANDIDATE',
      identityKey: `load-candidate-${tag}`,
      email: `load.candidate.${tag}@loadtest.invalid`,
      displayName: `LOADTEST Candidat Synthétique ${tag}`,
      subject: `google-sub-load-candidate-${tag}`,
    });
  }
  return { employers, candidates };
}

/**
 * Émet des credentials Google RS256 signées pour chaque utilisateur synthétique.
 * Même mécanisme que `buildTestCredentials` (offers.test.ts) : clé éphémère de
 * campagne, JWKS exposé par un fetcher in-process, vérification par le VRAI
 * `createGoogleCredentialVerifier`. Aucune clé n'est persistée.
 */
async function buildSyntheticCredentials(
  users: readonly SyntheticUser[],
  businessClock: Date,
): Promise<{ verifier: ReturnType<typeof createGoogleCredentialVerifier>; credentials: Record<string, string> }> {
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
    kid: LOAD_KID,
    use: 'sig',
  };
  const verifier = createGoogleCredentialVerifier({
    audience: LOAD_AUDIENCE,
    jwksUrl: 'https://loadtest.invalid/jwks',
    now: () => businessClock,
    fetcher: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'content-type': 'application/json' },
    }),
  });

  const credentials: Record<string, string> = {};
  const issuedAt = Math.floor(businessClock.getTime() / 1000);
  for (const user of users) {
    const identity: GoogleExternalIdentity = {
      subject: user.subject,
      email: user.email,
      emailVerified: true,
      displayName: user.displayName,
    };
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: LOAD_KID })));
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: LOAD_AUDIENCE,
      sub: identity.subject,
      iat: issuedAt,
      exp: issuedAt + 3600,
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
    credentials[user.identityKey] = `${signedContent}.${base64UrlEncode(new Uint8Array(signature))}`;
  }
  return { verifier, credentials };
}

export interface CreateLoadHarnessOptions {
  userCount: number;
  /** Garde-fou métier P0-MATCHING : bassin plafonné à 200 profils candidats. */
  maxMatchingProfiles?: number;
}

export async function createLoadHarness(options: CreateLoadHarnessOptions): Promise<LoadHarness> {
  const startedAt = performance.now();
  const { employers, candidates } = buildSyntheticUsers(options.userCount);
  const clock = { value: new Date(LOAD_BUSINESS_CLOCK_ISO) };

  offerIdempotencyCache.clear();
  const pg = new PGlite();
  const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    await pg.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
  }

  const dbProbe: DbLatencyProbe = {
    latencies: [],
    intervals: [],
    transactions: { begun: 0, committed: 0, rolledBack: 0 },
    startedAtMs: startedAt,
  };
  const database = createPostgresDatabase(toPostgresClientPort(createPGliteDriver(pg, dbProbe)));
  const google = await buildSyntheticCredentials([...employers, ...candidates], clock.value);

  const compose = (): WorkerComposition =>
    composeWorker(
      {
        GOOGLE_CLIENT_ID: LOAD_AUDIENCE,
        PERSISTENCE: 'postgres',
        SESSION_TTL_SECONDS: '7200',
        WORKER_ENV: 'load-tests-p0-load-tests-1',
      },
      database,
      {
        googleVerifier: google.verifier,
        now: () => clock.value,
        rateLimitPolicy: NEUTRALIZED_RATE_LIMIT,
      },
    );

  const composition = compose();
  if (!composition.automationWorker) {
    await pg.close();
    throw new Error('worker d’automatisation attendu dans la composition PostgreSQL durable');
  }

  const maxMatchingProfiles = options.maxMatchingProfiles ?? 200;
  const pairs: UserPair[] = employers.map((employer, index) => ({
    journeyId: `pair-${String(index + 1).padStart(5, '0')}`,
    employer,
    candidate: candidates[index],
    publishMatchingProfile: index < maxMatchingProfiles,
  }));

  const bootstrapMs = Math.round((performance.now() - startedAt) * 100) / 100;

  return {
    pg,
    worker: composition.worker,
    composition,
    database,
    automationWorker: composition.automationWorker,
    composePeerAutomationWorker: () => {
      const peer = compose();
      if (!peer.automationWorker) {
        throw new Error('worker d’automatisation attendu dans la composition peer');
      }
      return peer.automationWorker;
    },
    clock,
    dbProbe,
    employers,
    candidates,
    pairs,
    credentials: google.credentials,
    businessClockIso: LOAD_BUSINESS_CLOCK_ISO,
    bootstrapMs,
    close: async () => {
      await pg.close();
      offerIdempotencyCache.clear();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Client HTTP in-process                                              */
/* ------------------------------------------------------------------ */

export function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header);
  if (!match || !match[1]) throw new Error('cookie de session absent de la réponse d’authentification');
  return match[1];
}

export function loadRequest(path: string, sessionToken: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (sessionToken) headers.set('cookie', `${SESSION_COOKIE_NAME}=${sessionToken}`);
  return new Request(`https://loadtest.invalid${path}`, { ...init, headers });
}
