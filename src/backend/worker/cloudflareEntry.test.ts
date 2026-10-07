/**
 * LE LABEUR — P0-C — tests déterministes de l'entrée Cloudflare Worker.
 *
 * Aucun réseau, aucun compte Cloudflare : le pilote PostgreSQL est injecté.
 * Ces tests vérifient la composition réelle (binding → client → composition),
 * la fermeture par défaut sans binding, la libération du pool quand la cible
 * change, et l'absence de retombée mémoire.
 */

import { createCloudflareWorker, runtimeTarget } from './cloudflareEntry';
import type { WorkerPostgresClient } from './pgClient';
import { toPostgresClientPort, type DriverPoolLike, type DriverQueryResult } from '../persistence/sqlClient';
import { PGlite } from '@electric-sql/pglite';
import { authRequest, authenticateActor, createOffersTestHarness } from '../api/offers.test';
import { createR2BucketObjectStorage, type R2BucketLike } from '../documents/storage';

/** Pilote `DriverPoolLike` sur une instance PGlite (base PostgreSQL réelle locale). */
function createPGliteDriver(database: PGlite): DriverPoolLike {
  const query = async <RowT = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<RowT>> => {
    const result = await database.query<RowT>(sql, [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  };
  return {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

/**
 * Binding R2 en mémoire (même surface structurelle que `R2Bucket`). Il sert à
 * prouver que l'entrée Worker CÂBLE réellement le binding R2 de l'environnement
 * dans le port `ObjectStorage` — sans compte Cloudflare ni bucket réel.
 */
function fakeR2Bucket(): R2BucketLike & { keys(): string[] } {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    keys: () => [...objects.keys()],
    async put(key, value, options) {
      const bytes = value instanceof Uint8Array
        ? value
        : new Uint8Array(await new Response(value as ReadableStream).arrayBuffer());
      objects.set(key, { bytes, ...(options?.httpMetadata?.contentType ? { contentType: options.httpMetadata.contentType } : {}) });
      return { key };
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        size: found.bytes.length,
        ...(found.contentType ? { httpMetadata: { contentType: found.contentType } } : {}),
        arrayBuffer: async () => found.bytes.slice().buffer,
      };
    },
    async head(key) {
      const found = objects.get(key);
      if (!found) return null;
      return { size: found.bytes.length, ...(found.contentType ? { httpMetadata: { contentType: found.contentType } } : {}) };
    },
    async delete(key) {
      for (const candidate of Array.isArray(key) ? key : [key]) objects.delete(candidate);
    },
  };
}

export interface CloudflareEntryTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface ScriptedPool extends DriverPoolLike {
  sql: string[];
  ended: boolean;
}

function createScriptedPool(): ScriptedPool {
  const pool: ScriptedPool = {
    sql: [],
    ended: false,
    async query<Row = Record<string, unknown>>(sql: string): Promise<DriverQueryResult<Row>> {
      pool.sql.push(sql);
      if (/schema_migrations/i.test(sql)) {
        const rows = ['0001_identity_and_core', '0002_role_permissions_seed', '0003_core_nucleus_alignment', '0004_proposals', '0005_contract_lifecycle', '0006_automation_foundation', '0007_contract_automation', '0008_payment_cycle', '0009_payment_external_reconciliation', '0010_salary_confirmation', '0011_dispute_claims', '0012_notifications', '0013_replacements', '0014_matching', '0015_reputation_ledger', '0016_documents', '0017_cron_queue']
          .map(id => ({ id }) as unknown as Row);
        return { rows, rowCount: rows.length };
      }
      return { rows: [{ ok: 1 } as unknown as Row], rowCount: 1 };
    },
    async connect() {
      return { query: pool.query.bind(pool), release() {} };
    },
    async end() {
      pool.ended = true;
    },
  };
  return pool;
}

export async function runCloudflareEntryTests(): Promise<CloudflareEntryTestResult[]> {
  const results: CloudflareEntryTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const connectionString = 'postgresql://lelabeur:local-secret@127.0.0.1:55432/lelabeur?sslmode=disable';
  const env = {
    GOOGLE_CLIENT_ID: 'p0c-test-client.apps.googleusercontent.com',
    PERSISTENCE: 'postgres',
    WORKER_ENV: 'test-local',
    HYPERDRIVE: { connectionString },
  };

  await check('P0-C Worker: binding Hyperdrive → compositeur postgres, /healthz réel', async () => {
    const pool = createScriptedPool();
    const runtime = createCloudflareWorker({
      createClient: (): WorkerPostgresClient => ({ client: toPostgresClientPort(pool), end: () => pool.end?.() ?? Promise.resolve() }),
    });
    {
      const response = await runtime.fetch(new Request('https://api.test/healthz'), env);
      const text = await response.text();
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = JSON.parse(text) as {
        status: string;
        persistence: { mode: string; reachable: boolean; migrations?: { status: string }; target?: { host: string; database: string } };
        runtime: { declaredEnvironment: string | null; hyperdriveBinding: boolean; runtime: string };
      };
      assert(body.status === 'ok', `status ok attendu, reçu ${body.status}`);
      assert(body.persistence.mode === 'postgres' && body.persistence.reachable === true, 'persistence postgres sondée attendue');
      assert(body.persistence.migrations?.status === 'applied', 'migrations appliquées attendues');
      assert(body.persistence.target?.host === '127.0.0.1', 'hôte réel du descripteur attendu');
      assert(body.persistence.target?.database === 'lelabeur', 'base réelle du descripteur attendue');
      assert(body.runtime.hyperdriveBinding === true && body.runtime.declaredEnvironment === 'test-local', 'runtime attendu');
      assert(!text.includes('local-secret'), 'aucun secret ne doit apparaître');
      assert(pool.sql.some(sql => /SELECT 1/i.test(sql)), 'la sonde SELECT 1 doit être exécutée');
    }
    assert(pool.ended, 'le pool de la requête doit être fermé après la réponse');
  });

  await check('P0-C Worker: sans binding → fermé, 503 sur /healthz, aucune connexion tentée', async () => {
    let created = 0;
    const runtime = createCloudflareWorker({
      createClient: () => {
        created += 1;
        return { client: toPostgresClientPort(createScriptedPool()), end: async () => undefined };
      },
    });
    const response = await runtime.fetch(new Request('https://api.test/healthz'), {
      GOOGLE_CLIENT_ID: 'client-id',
      PERSISTENCE: 'postgres',
    });
    const body = await response.json() as {
      status: string;
      persistence: { mode: string; reason: string; durable: boolean };
      runtime: { hyperdriveBinding: boolean };
    };
    assert(response.status === 503, `503 attendu, reçu ${response.status}`);
    assert(body.status === 'degraded' && body.persistence.mode === 'misconfigured', 'état misconfigured attendu');
    // Au niveau Worker, « postgres demandé sans connexion utilisable » est signalé
    // par missing-sql-client ; `runtime.hyperdriveBinding` dit si un binding a été fourni.
    assert(body.persistence.reason === 'missing-sql-client', `motif inattendu: ${body.persistence.reason}`);
    assert(body.runtime.hyperdriveBinding === false, 'aucun binding ne doit être annoncé');
    assert(body.persistence.durable === false, 'aucune durabilité ne doit être annoncée');
    assert(created === 0, 'aucun client ne doit être construit sans binding');
    const offers = await runtime.fetch(new Request('https://api.test/api/v1/offers'), { GOOGLE_CLIENT_ID: 'client-id' });
    assert(offers.status === 501, 'aucune route métier ne doit s’ouvrir');
    await runtime.dispose();
  });

  await check('P0-C Worker: un pool par requête, jamais réutilisé entre cibles', async () => {
    const pools: ScriptedPool[] = [];
    const runtime = createCloudflareWorker({
      createClient: () => {
        const pool = createScriptedPool();
        pools.push(pool);
        return { client: toPostgresClientPort(pool), end: () => pool.end?.() ?? Promise.resolve() };
      },
    });
    await runtime.fetch(new Request('https://api.test/healthz'), env);
    await runtime.fetch(new Request('https://api.test/healthz'), {
      ...env,
      HYPERDRIVE: { connectionString: 'postgresql://lelabeur:other@127.0.0.1:55433/lelabeur_other?sslmode=disable' },
    });
    assert(pools.length === 2, `un client par requête attendu, reçu ${pools.length}`);
    assert(pools.every(pool => pool.ended), 'chaque pool de requête doit être fermé après sa réponse');
    const firstTarget = runtimeTarget(env);
    const secondTarget = runtimeTarget({
      ...env,
      HYPERDRIVE: { connectionString: 'postgresql://lelabeur:other@127.0.0.1:55433/lelabeur_other?sslmode=disable' },
    });
    assert(firstTarget?.connectionString !== secondTarget?.connectionString, 'les cibles doivent différer');
    assert(Boolean(firstTarget?.connectionString), 'cible résolue attendue');
    await runtime.dispose();
  });

  await check('P0-CRON-QUEUE Worker: scheduled() sans binding = no-op explicite (aucun client, aucune écriture)', async () => {
    let created = 0;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
    const runtime = createCloudflareWorker({
      createClient: () => {
        created += 1;
        return { client: toPostgresClientPort(createScriptedPool()), end: async () => undefined };
      },
    });
    try {
      // PERSISTENCE=postgres SANS binding : la production déployée telle quelle.
      await runtime.scheduled!(
        { cron: '*/5 * * * *', scheduledTime: Date.now() },
        { GOOGLE_CLIENT_ID: 'client-id', PERSISTENCE: 'postgres', WORKER_ENV: 'production' },
      );
      // PERSISTENCE='closed' (frontière fermée) : même garantie.
      await runtime.scheduled!(
        { cron: '*/5 * * * *', scheduledTime: Date.now() },
        { GOOGLE_CLIENT_ID: 'client-id' },
      );
    } finally {
      console.log = originalLog;
    }
    assert(created === 0, 'aucun client PostgreSQL ne doit être construit sans cible');
    const ticks = logs.filter(line => line.includes('cron_tick'));
    assert(ticks.length === 2, `un signal d’exploitation par tick attendu, reçus ${ticks.length}`);
    for (const line of ticks) {
      assert(line.includes('cron_tick_skipped'), `tick sans cible = no-op tracé, reçu ${line}`);
      assert(!/postgres(ql)?:\/\//.test(line), 'aucune chaîne de connexion dans un log de tick');
    }
  });

  await check('P0-R2 Worker: binding R2 de l’environnement → domaine DOCUMENTS ouvert, objet réellement stocké, aucune clé exposée', async () => {
    const harness = await createOffersTestHarness();
    try {
      const { token, userId } = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      const driver = createPGliteDriver(harness.pg);
      const runtime = createCloudflareWorker({
        createClient: (): WorkerPostgresClient => ({ client: toPostgresClientPort(driver), end: async () => undefined }),
        // Même horloge que le harnais : sans elle, la session réelle serait vue
        // comme expirée par l'entrée (et le test mesurerait autre chose).
        now: () => harness.clock.value,
      });
      const baseEnv = {
        GOOGLE_CLIENT_ID: 'p0cf-entry-test.apps.googleusercontent.com',
        PERSISTENCE: 'postgres',
        WORKER_ENV: 'test-local',
        HYPERDRIVE: { connectionString: 'postgresql://lelabeur:secret@127.0.0.1:55432/lelabeur?sslmode=disable' },
      };
      const bytes = new TextEncoder().encode('%PDF-1.4 contrat via binding R2');
      const grantBody = JSON.stringify({
        title: 'Contrat via binding R2',
        fileName: 'contrat.pdf',
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        documentType: 'CONTRACT_DOCUMENT',
      });
      const grantRequest = () => authRequest('/api/v1/documents/upload-grants', token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0cf-entry-grant-001' },
        body: grantBody,
      });

      // Sans bucket : le domaine reste FERMÉ (aucune version sans objet).
      const closed = await runtime.fetch(grantRequest(), baseEnv);
      assert(closed.status === 501, `501 attendu sans binding R2, reçu ${closed.status}`);

      // Avec le binding R2 : la route existe et exige la session (401 sans cookie).
      const bucket = fakeR2Bucket();
      const envWithBucket = { ...baseEnv, DOCUMENTS_BUCKET: bucket };
      const anonymous = await runtime.fetch(
        authRequest('/api/v1/documents/upload-grants', null, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0cf-entry-grant-anon' },
          body: grantBody,
        }),
        envWithBucket,
      );
      assert(anonymous.status === 401, `401 attendu sans session, reçu ${anonymous.status}`);

      // Dépôt authentifié : le grant, le contenu (put R2) puis la lecture.
      const granted = await runtime.fetch(grantRequest(), envWithBucket);
      assert(granted.status < 400, `grant attendu (< 400), reçu ${granted.status}: ${await granted.clone().text()}`);
      const grant = await granted.json() as {
        document: { documentId: string; ownerUserId: string };
        version: { versionId: string };
        upload: { url: string; contentType: string };
      };
      assert(grant.document.ownerUserId === userId, 'propriétaire dérivé côté serveur');
      assert(grant.upload.url.startsWith('/api/v1/documents/'), 'URL de dépôt servie par l’API, jamais une clé d’objet');

      const uploaded = await runtime.fetch(
        authRequest(grant.upload.url, token, {
          method: 'POST',
          headers: { 'content-type': 'application/pdf', 'Idempotency-Key': 'p0cf-entry-content-001' },
          body: new Uint8Array(bytes),
        }),
        envWithBucket,
      );
      assert(uploaded.status < 400, `dépôt attendu (< 400), reçu ${uploaded.status}: ${await uploaded.clone().text()}`);
      assert(bucket.keys().length === 1, `un objet R2 attendu, reçus ${bucket.keys().length}`);

      const detail = await runtime.fetch(
        authRequest(`/api/v1/documents/${grant.document.documentId}`, token),
        envWithBucket,
      );
      const detailText = await detail.text();
      assert(detail.status === 200, `lecture attendue (200), reçue ${detail.status}`);
      assert(!/object_?key/i.test(detailText), 'aucune clé d’objet dans une réponse d’API');
      assert(!detailText.includes(bucket.keys()[0]), 'le chemin de l’objet n’est jamais exposé');

      // Le contenu relu provient bien de l’objet R2 stocké.
      const readBack = await createR2BucketObjectStorage(bucket).get(bucket.keys()[0]);
      assert(readBack !== null && readBack.size === bytes.length, 'objet R2 réellement écrit par le dépôt');
    } finally {
      await harness.close();
    }
  });

  await check('P0-C Worker: mode mémoire explicite ≠ postgres, aucune confusion de mode', async () => {
    const runtime = createCloudflareWorker({
      createClient: () => {
        throw new Error('aucun client ne doit être créé en mode mémoire');
      },
    });
    const response = await runtime.fetch(new Request('https://api.test/healthz'), {
      GOOGLE_CLIENT_ID: 'client-id',
      PERSISTENCE: 'memory',
    });
    const body = await response.json() as { persistence: { mode: string; durable: boolean } };
    assert(response.status === 200, 'mode mémoire explicite : 200');
    assert(body.persistence.mode === 'memory' && body.persistence.durable === false, 'mémoire non durable attendue');
    await runtime.dispose();
  });

  return results;
}
