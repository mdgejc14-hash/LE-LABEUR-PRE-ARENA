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
        const rows = ['0001_identity_and_core', '0002_role_permissions_seed', '0003_core_nucleus_alignment', '0004_proposals', '0005_contract_lifecycle', '0006_automation_foundation', '0007_contract_automation', '0008_payment_cycle', '0009_payment_external_reconciliation', '0010_salary_confirmation', '0011_dispute_claims', '0012_notifications', '0013_replacements', '0014_matching', '0015_reputation_ledger']
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
