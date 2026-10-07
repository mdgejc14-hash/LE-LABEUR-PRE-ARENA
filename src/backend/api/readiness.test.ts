/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — tests déterministes de `GET /readyz`.
 *
 * Aucun réseau, aucun Cloudflare : le pilote PostgreSQL est scripté et le
 * binding R2 est un faux. Ces tests vérifient que :
 *  - un composant absent est `blocked` et jamais `ok` ;
 *  - une observation défavorable (dead-letter, claim orphelin, aucun tick de
 *    cron) est signalée ;
 *  - le détail d'exploitation n'est servi qu'à un ADMIN disposant de
 *    `audit:read` ;
 *  - aucune valeur sensible (chaîne de connexion, mot de passe) n'apparaît.
 */

import { composeWorker } from './entry';
import {
  READINESS_API_VERSION,
  projectReadiness,
  readinessContainsSecret,
  readinessStatusCode,
  readDeclaredCronCadence,
  staleClaimSeconds,
  type ReadinessReport,
} from './readiness';
import { createApiWorker } from './worker';
import type { WorkerEnvironment } from './entry';
import { DEFAULT_STALE_CLAIM_MS } from '../automation/worker';
import { toPostgresClientPort, type DriverPoolLike, type DriverQueryResult } from '../persistence/sqlClient';
import type { R2BucketLike } from '../documents/storage';
import type { AuthenticatedActor } from '../productionContracts';

export interface ReadinessTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const MIGRATION_IDS = [
  '0001_identity_and_core', '0002_role_permissions_seed', '0003_core_nucleus_alignment',
  '0004_proposals', '0005_contract_lifecycle', '0006_automation_foundation',
  '0007_contract_automation', '0008_payment_cycle', '0009_payment_external_reconciliation',
  '0010_salary_confirmation', '0011_dispute_claims', '0012_notifications',
  '0013_replacements', '0014_matching', '0015_reputation_ledger', '0016_documents', '0017_cron_queue',
];

interface DriverOptions {
  migrationIds?: string[];
  lastTickAt?: string | null;
  tickCount?: number;
  lastAuditAt?: string | null;
  deadLettered?: number;
  staleEvents?: number;
  staleJobs?: number;
  dueEvents?: number;
  dueJobs?: number;
  lastNotificationAt?: string | null;
  lastDocumentAt?: string | null;
  failQueueQuery?: string;
}

function createScriptedDriver(options: DriverOptions = {}): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(sql: string): Promise<DriverQueryResult<Row>> => {
    if (/automation_audit_ledger/i.test(sql)) {
      if (options.failQueueQuery) throw new Error(options.failQueueQuery);
      return {
        rows: [{
          due_events: options.dueEvents ?? 0,
          due_jobs: options.dueJobs ?? 0,
          stale_events: options.staleEvents ?? 0,
          stale_jobs: options.staleJobs ?? 0,
          dead_lettered_events: options.deadLettered ?? 0,
          last_tick_at: options.lastTickAt ?? null,
          tick_count: options.tickCount ?? 0,
          last_audit_at: options.lastAuditAt ?? null,
        }] as unknown as Row[],
        rowCount: 1,
      };
    }
    if (/FROM notifications/i.test(sql)) {
      return { rows: [{ last_notification_at: options.lastNotificationAt ?? null }] as unknown as Row[], rowCount: 1 };
    }
    if (/FROM documents/i.test(sql)) {
      return { rows: [{ last_document_at: options.lastDocumentAt ?? null }] as unknown as Row[], rowCount: 1 };
    }
    if (/schema_migrations/i.test(sql)) {
      const rows = (options.migrationIds ?? MIGRATION_IDS).map(id => ({ id }) as unknown as Row);
      return { rows, rowCount: rows.length };
    }
    if (/SELECT 1/i.test(sql)) return { rows: [{ '?column?': 1 } as unknown as Row], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, async connect() { return { query, release() {} }; } };
}

function createFakeBucket(options: { fail?: boolean; objectPresent?: boolean } = {}): R2BucketLike {
  return {
    async head() {
      if (options.fail) throw new Error('R2 indisponible (jeton expiré)');
      return options.objectPresent ? { size: 12 } : null;
    },
    async put() { return {}; },
    async get() { return null; },
    async delete() { return undefined; },
  };
}

const CGO = 'google-web-client-id.apps.googleusercontent.com';

async function readinessOf(
  driverOptions: DriverOptions,
  envOverrides: Partial<WorkerEnvironment> = {},
): Promise<{ status: number; report: ReadinessReport; text: string }> {
  const connectionString = 'postgresql://lelabeur:sup3r-secret-p0@db.example.com:5432/lelabeur?sslmode=require';
  const composition = composeWorker(
    {
      GOOGLE_CLIENT_ID: CGO,
      PERSISTENCE: 'postgres',
      WORKER_ENV: 'test-local',
      HYPERDRIVE: { connectionString },
      CRON_CADENCE: '*/5 * * * *',
      DOCUMENTS_BUCKET: createFakeBucket(),
      ...envOverrides,
    },
    toPostgresClientPort(createScriptedDriver(driverOptions)),
  );
  const report = await composition.readiness();
  const response = await composition.worker.fetch(new Request('https://api.test/readyz'));
  return { status: response.status, report, text: await response.text() };
}

export async function runReadinessTests(): Promise<ReadinessTestResult[]> {
  const results: ReadinessTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('P0-CPROD /readyz : dix vérifications, état « ready » quand tout est réellement observé', async () => {
    const { status, report, text } = await readinessOf({
      lastTickAt: '2026-10-07T11:00:00.000Z',
      tickCount: 42,
      lastAuditAt: '2026-10-07T11:00:00.000Z',
      lastNotificationAt: '2026-10-07T10:30:00.000Z',
      lastDocumentAt: '2026-10-07T10:00:00.000Z',
      dueEvents: 2,
      dueJobs: 1,
    });
    assert(report.checks.length === 10, `10 vérifications attendues, reçu ${report.checks.length}`);
    assert(report.status === 'ready', `status ready attendu, reçu ${report.status}`);
    assert(report.apiVersion === READINESS_API_VERSION, 'apiVersion attendue');
    assert(status === 200, `200 attendu, reçu ${status}`);
    const byId = new Map(report.checks.map(entry => [entry.id, entry]));
    assert(byId.get('postgres')?.status === 'ok', 'postgres sondé');
    assert(byId.get('migrations')?.status === 'ok', 'migrations appliquées');
    assert(byId.get('queue')?.status === 'ok', 'file durable saine');
    assert(byId.get('cron')?.status === 'ok', 'cron déclaré ET tick tracé');
    assert(byId.get('r2')?.status === 'ok', 'binding R2 sondé par head');
    assert(byId.get('documents')?.status === 'ok' && byId.get('notifications')?.status === 'ok', 'domaines lisibles');
    assert(byId.get('audit')?.status === 'ok', 'ledger lisible');
    // Projection publique : statuts seuls.
    assert(!text.includes('db.example.com'), 'l’hôte ne doit pas apparaître côté public');
    assert(!text.includes('lastTickAt'), 'aucune valeur observée côté public');
    assert(!text.includes('DOCUMENTS_BUCKET'), 'aucun nom de binding côté public');
    const publicBody = JSON.parse(text) as { detailed: boolean; checks: Array<{ id: string; status: string }> };
    assert(publicBody.detailed === false, 'le rapport public n’est pas détaillé');
    assert(publicBody.checks.every(entry => Object.keys(entry).length === 2), 'statuts seuls attendus');
    assert(!readinessContainsSecret(report, ['sup3r-secret-p0']), 'aucun secret dans le rapport complet');
  });

  await check('P0-CPROD /readyz : absence de R2 ou de cadence → « blocked », jamais un faux « ok »', async () => {
    const withoutBucket = await readinessOf({ lastTickAt: '2026-10-07T11:00:00.000Z', lastAuditAt: '2026-10-07T11:00:00.000Z' }, { DOCUMENTS_BUCKET: undefined });
    const r2 = withoutBucket.report.checks.find(entry => entry.id === 'r2');
    assert(r2?.status === 'blocked', 'R2 absent = blocked');
    assert(withoutBucket.report.status === 'blocked', 'un blocage rend le rapport bloqué');
    assert(withoutBucket.status === 503, 'un blocage rend 503');
    assert(!withoutBucket.report.checks.some(entry => entry.id === 'r2' && entry.status === 'ok'), 'aucun ok simulé');
    assert(/présignature simulée/.test(r2?.detail ?? ''), 'la fermeture du domaine documents doit être explicite');

    const withoutCadence = await readinessOf({ lastTickAt: '2026-10-07T11:00:00.000Z', lastAuditAt: '2026-10-07T11:00:00.000Z' }, { CRON_CADENCE: '' });
    const cron = withoutCadence.report.checks.find(entry => entry.id === 'cron');
    assert(cron?.status === 'blocked', 'cadence absente = blocked');
    assert(/Aucune cadence déclarée/.test(cron?.detail ?? ''), 'motif explicite attendu');
  });

  await check('P0-CPROD /readyz : une anomalie d’exploitation est signalée (dead-letter, claim orphelin, aucun tick)', async () => {
    const degraded = await readinessOf({
      deadLettered: 3,
      staleEvents: 1,
      staleJobs: 0,
      tickCount: 0,
      lastTickAt: null,
      lastAuditAt: '2026-10-07T10:00:00.000Z',
    });
    const queue = degraded.report.checks.find(entry => entry.id === 'queue');
    assert(queue?.status === 'degraded', 'dead-letter/claims orphelins = état dégradé signalé');
    assert(queue?.observed?.deadLettered === 3, 'compteur réel de dead-letter');
    const cron = degraded.report.checks.find(entry => entry.id === 'cron');
    assert(cron?.status === 'degraded', 'cadence déclarée sans tick = dégradé');
    assert(/AUCUN tick tracé/.test(cron?.detail ?? ''), 'absence de preuve explicitement énoncée');
    assert(degraded.report.status === 'degraded', 'rapport global dégradé');
    assert(degraded.status === 200, 'dégradé reste 200 (le service répond)');
  });

  await check('P0-CPROD /readyz : base inutilisable → blocages motivés et expurgés du secret', async () => {
    const failing = await readinessOf({ failQueueQuery: 'connexion refusée: postgresql://lelabeur:sup3r-secret-p0@db.example.com:5432/lelabeur' });
    for (const id of ['queue', 'cron', 'audit']) {
      const entry = failing.report.checks.find(candidate => candidate.id === id);
      assert(entry?.status === 'blocked', `${id} doit être bloqué`);
    }
    assert(failing.status === 503, '503 attendu');
    const serialized = JSON.stringify(failing.report);
    assert(!serialized.includes('sup3r-secret-p0'), 'le secret ne doit jamais apparaître');
    assert(!/lelabeur:sup3r/.test(serialized), 'les identifiants ne doivent jamais apparaître');
    assert(/postgresql:\/\/\[redacted\]@/.test(serialized), 'le message doit être expurgé, pas supprimé');
    // …et la projection PUBLIQUE ne contient de toute façon aucun message d’erreur.
    assert(!failing.text.includes('db.example.com'), 'aucun hôte dans la réponse anonyme');
    assert(!failing.text.includes('postgresql://'), 'aucune chaîne de connexion dans la réponse anonyme');
    assert(!readinessContainsSecret(failing.report, ['sup3r-secret-p0']), 'aucun secret détecté dans le rapport');
  });

  await check('P0-CPROD /readyz : frontière fermée → réponses « blocked » sans invention', async () => {
    const closed = composeWorker({ GOOGLE_CLIENT_ID: CGO });
    const report = await closed.readiness();
    assert(report.status === 'blocked', 'frontière fermée = blocked');
    assert(report.checks.find(entry => entry.id === 'postgres')?.status === 'blocked', 'aucune sonde disponible');
    assert(report.checks.find(entry => entry.id === 'worker')?.status === 'ok', 'le Worker répond bien');
    assert(report.resources.some(entry => entry.id === 'hyperdrive' && entry.status === 'absent'), 'ressource absente annoncée');

    const bare = createApiWorker({ authenticate: async () => null });
    const response = await bare.fetch(new Request('https://api.test/readyz'));
    assert(response.status === 503, `503 attendu sans rapporteur, reçu ${response.status}`);
    const body = await response.json() as { status: string; checks: unknown[] };
    assert(body.status === 'blocked' && body.checks.length === 0, 'aucun « ready » par défaut');
  });

  await check('P0-CPROD /readyz : détail réservé à ADMIN + audit:read, méthode GET uniquement', async () => {
    const report: ReadinessReport = {
      status: 'ready',
      apiVersion: READINESS_API_VERSION,
      checkedAt: '2026-10-07T12:00:00.000Z',
      runtime: { runtime: 'workerd', declaredEnvironment: 'production', hyperdriveBinding: true },
      checks: [{ id: 'worker', label: 'Worker vivant', status: 'ok', detail: 'observé', observed: { runtime: 'workerd' } }],
      resources: [],
    };
    const admin: AuthenticatedActor = {
      id: 'usr_admin', role: 'ADMIN', permissions: ['audit:read'], sessionId: 'ses_1',
    };
    const adminWithoutPermission: AuthenticatedActor = { id: 'usr_admin2', role: 'ADMIN', permissions: [], sessionId: 'ses_2' };
    const employer: AuthenticatedActor = { id: 'usr_emp', role: 'EMPLOYER', permissions: ['audit:read'], sessionId: 'ses_3' };

    const workerFor = (actor: AuthenticatedActor | null) => createApiWorker({
      authenticate: async () => actor,
      readiness: () => report,
    });

    const detailed = await workerFor(admin).fetch(new Request('https://api.test/readyz'));
    assert(detailed.status === 200, 'détail ADMIN servi');
    const detailedBody = await detailed.json() as { detailed: boolean; resources: unknown[]; checks: Array<{ observed?: unknown }> };
    assert(detailedBody.detailed === true, 'détail attendu pour ADMIN + audit:read');
    assert(Array.isArray(detailedBody.resources), 'inventaire exposé au détail');
    assert(Boolean(detailedBody.checks[0]?.observed), 'valeurs observées exposées au détail');

    for (const actor of [adminWithoutPermission, employer, null]) {
      const response = await workerFor(actor).fetch(new Request('https://api.test/readyz'));
      const body = await response.json() as { detailed: boolean; resources?: unknown };
      assert(body.detailed === false, `détail refusé pour ${actor?.role ?? 'anonyme'}`);
      assert(body.resources === undefined, 'aucun inventaire sans permission');
    }

    const post = await workerFor(admin).fetch(new Request('https://api.test/readyz', { method: 'POST', body: '{}' }));
    assert(post.status === 404, `POST /readyz refusé, reçu ${post.status}`);

    const failing = createApiWorker({ authenticate: async () => null, readiness: () => { throw new Error('panne'); } });
    const failingResponse = await failing.fetch(new Request('https://api.test/readyz'));
    assert(failingResponse.status === 503, 'un rapporteur défaillant ne produit pas un 500 opaque');
    const failingBody = await failingResponse.json() as { error: { code: string } };
    assert(failingBody.error.code === 'SERVICE_UNAVAILABLE', 'motif SERVICE_UNAVAILABLE attendu');
  });

  await check('P0-CPROD /readyz : helpers purs (cadence, borne de claims, projection, code HTTP)', () => {
    assert(readDeclaredCronCadence({ CRON_CADENCE: '*/5 * * * *' }) === '*/5 * * * *', 'cadence valide acceptée');
    assert(readDeclaredCronCadence({ CRON_CADENCE: '*/5 * * *' }) === null, 'cadence invalide refusée');
    assert(readDeclaredCronCadence({ CRON_CADENCE: '' }) === null, 'absence refusée (aucune valeur inventée)');
    assert(readDeclaredCronCadence({}) === null, 'variable absente refusée');
    assert(staleClaimSeconds() === Math.floor(DEFAULT_STALE_CLAIM_MS / 1000), 'borne alignée sur le worker existant');
    assert(staleClaimSeconds(1) === 60, 'borne minimale appliquée');
    const blocked: ReadinessReport = {
      status: 'blocked',
      apiVersion: READINESS_API_VERSION,
      checkedAt: 'x',
      runtime: { runtime: 'node', declaredEnvironment: null, hyperdriveBinding: false },
      checks: [{ id: 'postgres', label: 'PostgreSQL accessible', status: 'blocked', detail: 'aucune sonde', observed: { host: 'secret-host' } }],
      resources: [{ id: 'hyperdrive', kind: 'binding', name: 'HYPERDRIVE', secret: false, severity: 'blocking', status: 'absent', detail: 'aucun binding' }],
    };
    assert(readinessStatusCode(blocked) === 503, 'statut HTTP bloqué');
    const projected = projectReadiness(blocked, false);
    assert(projected.detailed === false, 'projection publique');
    assert(!JSON.stringify(projected).includes('secret-host'), 'aucune observation publique');
    const detailed = projectReadiness(blocked, true);
    assert(detailed.detailed === true && JSON.stringify(detailed).includes('secret-host'), 'détail conservé pour ADMIN');
  });

  return results;
}
