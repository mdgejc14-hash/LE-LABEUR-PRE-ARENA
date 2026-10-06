/**
 * LE LABEUR — P0-C — tests déterministes de `/healthz` réel.
 *
 * Vérifie que le rapport suit l'état OBSERVÉ (sonde, migrations) sans jamais
 * annoncer une base non sondée, sans jamais exposer un secret, et que le mode
 * mémoire n'est jamais présenté comme PostgreSQL.
 */

import { composeWorker, resolveTestOnlyJwksUrl } from './entry';
import { buildHealthPayload, detectWorkerRuntime, healthPayloadContainsSecret, healthStatusCode } from './health';
import type { BoundaryHealthResponse, PersistenceHealthReport } from './health';
import { createPostgresDatabase } from '../persistence/postgresDatabase';
import { toPostgresClientPort, type DriverPoolLike, type DriverQueryResult } from '../persistence/sqlClient';

export interface HealthTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Extrait le rapport de persistance (échec explicite si la frontière est fermée). */
function requireReport(payload: BoundaryHealthResponse): PersistenceHealthReport {
  if (payload.persistence === 'not-configured') throw new Error('rapport de persistance attendu');
  return payload.persistence;
}

interface ScriptedOptions {
  migrationIds?: string[];
}

/** Pilote factice pour le chemin binding Hyperdrive (aucune connexion). */
function createScriptedDriver(options: ScriptedOptions): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(sql: string): Promise<DriverQueryResult<Row>> => {
    if (/schema_migrations/i.test(sql)) {
      const rows = (options.migrationIds ?? []).map(id => ({ id }) as unknown as Row);
      return { rows, rowCount: rows.length };
    }
    if (/SELECT 1/i.test(sql)) return { rows: [{ '?column?': 1 } as unknown as Row], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, async connect() { return { query, release() {} }; } };
}

async function readHealth(worker: { fetch(request: Request): Promise<Response> }): Promise<{ status: number; body: BoundaryHealthResponse; text: string }> {
  const response = await worker.fetch(new Request('https://api.test/healthz'));
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as BoundaryHealthResponse, text };
}

export async function runHealthReportTests(): Promise<HealthTestResult[]> {
  const results: HealthTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('P0-C /healthz: frontière fermée → boundary-only, jamais une base', async () => {
    const composition = composeWorker({ GOOGLE_CLIENT_ID: 'client-id' });
    const health = await readHealth(composition.worker);
    assert(health.status === 200, `200 attendu, reçu ${health.status}`);
    assert(health.body.status === 'boundary-only', 'status boundary-only attendu');
    assert(health.body.persistence === 'not-configured', 'aucune persistance ne doit être annoncée');
  });

  await check('P0-C /healthz: postgres + binding Hyperdrive → état RÉEL et descripteur sûr', async () => {
    const connectionString = 'postgresql://lelabeur:sup3r-s3cret@db.example.com:5432/lelabeur';
    const composition = composeWorker(
      {
        GOOGLE_CLIENT_ID: 'client-id',
        PERSISTENCE: 'postgres',
        WORKER_ENV: 'test-local',
        HYPERDRIVE: { connectionString },
      },
      toPostgresClientPort(createScriptedDriver({
        migrationIds: ['0001_identity_and_core', '0002_role_permissions_seed', '0003_core_nucleus_alignment', '0004_proposals', '0005_contract_lifecycle', '0006_automation_foundation', '0007_contract_automation', '0008_payment_cycle', '0009_payment_external_reconciliation', '0010_salary_confirmation', '0011_dispute_claims'],
      })),
    );
    assert(composition.mode === 'postgres', 'mode postgres attendu');
    const health = await readHealth(composition.worker);
    assert(health.status === 200, `200 attendu, reçu ${health.status}`);
    assert(health.body.status === 'ok', `status ok attendu, reçu ${health.body.status}`);
    const report = requireReport(health.body);
    assert(report.mode === 'postgres', 'mode postgres attendu');
    assert(report.reachable === true, 'base annoncée joignable');
    assert(report.durable === true, 'PostgreSQL annoncé durable');
    assert(report.target?.host === 'db.example.com', 'hôte du descripteur attendu');
    assert(report.target?.secretRedacted === true, 'descripteur explicitement expurgé');
    assert(report.migrations?.status === 'applied', 'migrations appliquées attendues');
    assert(health.body.runtime.declaredEnvironment === 'test-local', 'environnement déclaré attendu');
    assert(health.body.runtime.hyperdriveBinding === true, 'binding Hyperdrive annoncé');
    assert(!health.text.includes('sup3r-s3cret'), 'le mot de passe ne doit jamais apparaître');
    assert(!health.text.includes(connectionString), 'la chaîne de connexion ne doit jamais apparaître');
    assert(!healthPayloadContainsSecret(health.body, ['sup3r-s3cret']), 'aucun secret détecté');
  });

  await check('P0-C /healthz: base injoignable → 503 dégradé, erreur expurgée', async () => {
    const secret = 'sup3r-s3cret-rollback';
    const connectionString = `postgresql://u:${secret}@db.example.com:5432/lelabeur`;
    const failingDatabase = createPostgresDatabase(
      toPostgresClientPort({
        query: async () => { throw new Error(`panne de connexion ${connectionString}`); },
        async connect() { throw new Error(`panne de connexion ${connectionString}`); },
      }),
      { redactSecrets: [connectionString, secret] },
    );
    const composition = composeWorker(
      { GOOGLE_CLIENT_ID: 'client-id', PERSISTENCE: 'postgres', HYPERDRIVE: { connectionString } },
      failingDatabase,
    );
    assert(composition.mode === 'postgres', 'mode postgres attendu');

    const failing = await readHealth(composition.worker);
    assert(failing.status === 503, `503 attendu, reçu ${failing.status}`);
    assert(failing.body.status === 'degraded', 'status degraded attendu');
    const failingReport = requireReport(failing.body);
    assert(failingReport.reachable === false, 'base annoncée injoignable');
    assert(failingReport.durable === true, 'la cible reste PostgreSQL');
    assert(!failing.text.includes(secret), 'le secret ne doit pas apparaître dans l’erreur');
    assert(!failing.text.includes(connectionString), 'la chaîne de connexion ne doit pas apparaître');
    assert(Boolean(failingReport.error), 'motif expurgé attendu');
  });

  await check('P0-C /healthz: mode mémoire annoncé non durable, jamais PostgreSQL', async () => {
    const composition = composeWorker({ GOOGLE_CLIENT_ID: 'client-id', PERSISTENCE: 'memory' });
    assert(composition.mode === 'memory', 'mode mémoire attendu');
    const health = await readHealth(composition.worker);
    assert(health.status === 200, `200 attendu, reçu ${health.status}`);
    assert(health.body.status === 'ok', 'mode mémoire explicite = ok');
    const memoryReport = requireReport(health.body);
    assert(memoryReport.mode === 'memory', 'mode mémoire attendu');
    assert(memoryReport.durable === false, 'la mémoire ne doit jamais être annoncée durable');
    assert(memoryReport.reachable === null, 'aucune sonde pour la mémoire');
  });

  await check('P0-C /healthz: postgres sans connexion → fermé et signalé, jamais de retombée mémoire', async () => {
    const composition = composeWorker({ GOOGLE_CLIENT_ID: 'client-id', PERSISTENCE: 'postgres' });
    assert(composition.mode === 'closed', 'aucune retombée silencieuse');
    const health = await readHealth(composition.worker);
    assert(health.status === 503, `503 attendu, reçu ${health.status}`);
    assert(health.body.status === 'degraded', 'état dégradé attendu');
    const misconfigured = requireReport(health.body);
    assert(misconfigured.mode === 'misconfigured', 'mode misconfigured attendu');
    assert(misconfigured.reason === 'missing-sql-client', 'motif missing-sql-client attendu');
    assert(misconfigured.reachable === null, 'aucune sonde sans connexion');
    const offers = await composition.worker.fetch(new Request('https://api.test/api/v1/offers'));
    assert(offers.status === 501, 'aucune route métier ne doit s’ouvrir');
  });

  await check('P0-C /healthz: le constructeur de rapport ne fabrique jamais d’état', () => {
    const closed = buildHealthPayload({ decision: { kind: 'closed', reason: 'not-configured' }, runtime: { runtime: 'node', declaredEnvironment: null, hyperdriveBinding: false } });
    assert(closed.status === 'boundary-only', 'décision fermée → boundary-only');
    const unreachable = buildHealthPayload({
      decision: { kind: 'postgres', reason: 'hyperdrive-binding' },
      runtime: { runtime: 'node', declaredEnvironment: 'x', hyperdriveBinding: true },
    });
    assert(unreachable.status === 'degraded', 'sans sonde, postgres est dégradé (jamais ok)');
    assert(requireReport(unreachable).reachable === null, 'reachable null sans sonde');
    const payloadOk = buildHealthPayload({
      decision: { kind: 'postgres', reason: 'injected-database' },
      runtime: { runtime: 'node', declaredEnvironment: null, hyperdriveBinding: false },
      health: { reachable: true, checkedAt: 'a', latencyMs: 1 },
    });
    assert(payloadOk.status === 'ok', 'sonde ok → ok');
    assert(healthStatusCode(payloadOk) === 200 && healthStatusCode(unreachable) === 503, 'codes HTTP attendus');
    assert(healthPayloadContainsSecret(payloadOk, ['0123456789']) === false, 'aucun faux positif');
    assert(healthPayloadContainsSecret({ ...payloadOk, persistence: { mode: 'postgres', reason: 'injected-database', configured: true, durable: true, reachable: true, error: 'fuite 0123456789' } }, ['0123456789']) === true, 'un secret présent doit être détecté');
  });

  await check('P0-C JWKS de test : boucle locale uniquement, tout le reste refusé', () => {
    assert(resolveTestOnlyJwksUrl('http://127.0.0.1:8799/jwks') === 'http://127.0.0.1:8799/jwks', 'boucle locale acceptée');
    assert(resolveTestOnlyJwksUrl('http://localhost:8799/jwks') === 'http://localhost:8799/jwks', 'localhost accepté');
    assert(resolveTestOnlyJwksUrl('https://127.0.0.1:8799/jwks') === undefined, 'TLS local refusé');
    assert(resolveTestOnlyJwksUrl('https://www.googleapis.com/oauth2/v3/certs') === undefined, 'Google réel refusé comme override');
    assert(resolveTestOnlyJwksUrl('http://evil.example.com/jwks') === undefined, 'hôte externe refusé');
    assert(resolveTestOnlyJwksUrl('pas-une-url') === undefined, 'valeur invalide refusée');
    assert(resolveTestOnlyJwksUrl(undefined) === undefined, 'absence acceptée');
    assert(detectWorkerRuntime() === 'node', `runtime node attendu sous tsx, reçu ${detectWorkerRuntime()}`);
  });

  return results;
}
