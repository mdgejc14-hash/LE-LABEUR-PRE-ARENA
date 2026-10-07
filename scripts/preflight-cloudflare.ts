/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — préflight d'exploitation.
 *
 *   npm run verify:cloudflare                     → rapport de préparation (lecture seule)
 *   npm run verify:cloudflare -- --require-production  → PORTE DE DÉPLOIEMENT (échoue si une ressource manque)
 *   npm run verify:cloudflare -- --remote         → sonde les commandes Cloudflare RÉELLES (read-only)
 *   npm run verify:cloudflare -- --no-bundle      → saute la construction du bundle production
 *
 * Ce que ce script fait :
 *  1. il lit la configuration RÉELLE (`wrangler.toml`, entrée Worker, migrations,
 *     catalogue de routes) et vérifie que les décisions d'architecture sont
 *     tenues (Cron branché sur le handler existant, file = Outbox
 *     transactionnelle, R2 derrière le port `ObjectStorage`, aucune ressource
 *     inventée) ;
 *  2. il exécute des SONDES DÉTERMINISTES hors ligne (composition du Worker,
 *     fail-closed, résolution de la cible PostgreSQL, absence de secret) ;
 *  3. il construit le bundle de production (`wrangler deploy --dry-run`) pour
 *     prouver que le Worker se déploie TEL QUEL ;
 *  4. avec `--remote`, il exécute UNIQUEMENT des commandes Cloudflare de
 *     LECTURE (`wrangler whoami`, `hyperdrive list`, `r2 bucket list`,
 *     `deployments list`) et rapporte ce qu'elles disent réellement.
 *
 * Ce que ce script NE fait PAS :
 *  - il n'invente aucune valeur d'infrastructure (account ID, Hyperdrive ID,
 *    bucket, Queue, URL de production, secret) ;
 *  - il n'écrit ni en base ni dans un bucket, ne déclenche aucun paiement, aucun
 *    transfert, aucun drain métier : l'unique écriture possible est le dossier
 *    de sortie du bundle (`--outdir`, gitignoré) ;
 *  - il ne transforme jamais un blocage externe en succès : un manque de
 *    credential est `BLOCKED`, une ressource absente est `NOT_CONFIGURED`, un
 *    artefact non déployé est `NOT_DEPLOYED`.
 *
 * Statuts : PASS | FAIL | BLOCKED | NOT_RUN (aucun autre). Un qualificatif
 * d'état externe (`PREPARED`, `BLOCKED_EXTERNAL_ACCESS`, `NOT_CONFIGURED`,
 * `NOT_DEPLOYED`, `DEPLOYED_AND_VERIFIED`) peut l'accompagner.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeWorker } from '../src/backend/api/entry';
import {
  PLACEHOLDER_CONNECTION_STRING,
  resolvePostgresTarget,
  type WorkerPersistenceEnvironment,
} from '../src/backend/persistence/config';
import { toPostgresClientPort, type DriverPoolLike } from '../src/backend/persistence/sqlClient';
import { EXPECTED_MIGRATION_IDS } from '../src/backend/persistence/migrationManifest';
import { createR2BucketObjectStorage, type R2BucketLike } from '../src/backend/documents/storage';
import { detectWorkerRuntime } from '../src/backend/api/health';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_DIR = resolve(REPO_ROOT, '.tmp', 'preflight-bundle');

/** Chaîne SYNTHÉTIQUE de sonde : boucle locale, jamais une cible de production. */
const PROBE_CONNECTION_STRING = 'postgresql://probe:probe@127.0.0.1:5432/probe?sslmode=disable';

type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
type ExternalQualifier =
  | 'PREPARED'
  | 'BLOCKED_EXTERNAL_ACCESS'
  | 'NOT_CONFIGURED'
  | 'NOT_DEPLOYED'
  | 'DEPLOYED_AND_VERIFIED';

interface CheckItem {
  area: string;
  name: string;
  status: Status;
  qualifier?: ExternalQualifier;
  detail: string;
  /**
   * `true` = le déploiement production ne peut pas servir correctement sans cet
   * élément : la porte `--require-production` le refuse. Chaque élément bloquant
   * est une ressource RÉELLE que seul l'exploitant peut fournir.
   */
  blocking?: boolean;
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(argument => argument.startsWith('--')));
const REQUIRE_PRODUCTION = flags.has('--require-production');
const REMOTE = flags.has('--remote');
const BUNDLE = !flags.has('--no-bundle');

const items: CheckItem[] = [];
const failures: string[] = [];

function record(
  area: string,
  name: string,
  status: Status,
  detail: string,
  qualifier?: ExternalQualifier,
  blocking = false,
): void {
  items.push({ area, name, status, detail, ...(qualifier ? { qualifier } : {}), ...(blocking ? { blocking: true } : {}) });
  if (status === 'FAIL') failures.push(`${area} — ${name}: ${detail}`);
}

function check(area: string, name: string, test: () => void, detail: string, qualifier?: ExternalQualifier): void {
  try {
    test();
    record(area, name, 'PASS', detail, qualifier);
  } catch (error) {
    record(area, name, 'FAIL', String((error as Error)?.message ?? error));
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(relativePath: string): string {
  const absolute = resolve(REPO_ROOT, relativePath);
  assert(existsSync(absolute), `fichier manquant: ${relativePath}`);
  return readFileSync(absolute, 'utf8');
}

/** Lignes ACTIVES d'un TOML (les commentaires portent la documentation). */
function activeTomlLines(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.replace(/\s+#.*$/, ''))
    .filter(line => line.trim().length > 0 && !line.trim().startsWith('#'));
}

/* ------------------------------------------------------------------ */
/* Sondes techniques                                                   */
/* ------------------------------------------------------------------ */

/** Pilote factice : aucune connexion n'est ouverte par ces sondes. */
function scriptedDriver(): DriverPoolLike {
  const query = async () => ({ rows: [], rowCount: 0 });
  return { query, async connect() { return { query, release() {} }; } };
}

/** Bucket R2 en mémoire : sert à prouver que le câblage R2 ouvre le domaine documents. */
function fakeBucket(): R2BucketLike {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    async put(key, value, options) {
      const bytes = value instanceof Uint8Array
        ? value
        : new Uint8Array(await new Response(value as ReadableStream).arrayBuffer());
      objects.set(key, { bytes, ...(options?.httpMetadata?.contentType ? { contentType: options.httpMetadata.contentType } : {}) });
      return {};
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

/* ------------------------------------------------------------------ */
/* Rapport                                                             */
/* ------------------------------------------------------------------ */

function main(): void {
  const wrangler = read('wrangler.toml');
  const activeWrangler = activeTomlLines(wrangler).join('\n');
  const entry = read('src/backend/worker/cloudflareEntry.ts');
  const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const routeContracts = read('src/backend/api/routeContracts.ts');
  const migrations = readdirSync(resolve(REPO_ROOT, 'migrations')).filter(file => file.endsWith('.sql')).sort();

  /**
   * Environnement de SONDAGE (hors ligne) : mêmes modes que la production, avec
   * une audience publique SYNTHÉTIQUE qui n'ouvre rien — elle sert uniquement à
   * franchir la frontière « audience absente » pour exercer la composition
   * PostgreSQL/R2. Aucune valeur d'infrastructure n'est inventée ici.
   */
  const productionVars = {
    PERSISTENCE: 'postgres',
    WORKER_ENV: 'production',
    GOOGLE_CLIENT_ID: 'preflight-probe.invalid',
  };

  /* ---------------------------------------------------------------- */
  /* 1. WORKER                                                         */
  /* ---------------------------------------------------------------- */
  check('Worker', 'Entrée réelle (fetch + scheduled)', () => {
    assert(existsSync(resolve(REPO_ROOT, 'src/backend/worker/cloudflareEntry.ts')), 'cloudflareEntry.ts absent');
    const defaultExport = entry.slice(entry.indexOf('export default {'));
    assert(/fetch\s*\(/.test(defaultExport), 'handler fetch() non exporté');
    assert(/scheduled\s*\(/.test(defaultExport), 'handler scheduled() non exporté');
  }, 'src/backend/worker/cloudflareEntry.ts exporte fetch() et scheduled()');

  check('Worker', 'Runtime compatible node-postgres', () => {
    assert(/compatibility_flags\s*=\s*\[\s*"nodejs_compat"\s*\]/.test(wrangler), 'nodejs_compat absent');
    const date = /compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/.exec(wrangler)?.[1];
    assert(Boolean(date) && date! >= '2024-09-23', 'compatibility_date invalide');
  }, 'nodejs_compat + compatibility_date figée');

  check('Worker', 'Profil production complet (vars redéclarées)', () => {
    assert(/\[env\.production\]/.test(wrangler), 'profil production absent');
    for (const variable of ['PERSISTENCE', 'DB_POOL_MAX', 'DB_STATEMENT_TIMEOUT_MS', 'DB_APPLICATION_NAME', 'SESSION_TTL_SECONDS', 'COOKIE_SECURE', 'WORKER_ENV']) {
      const productionBlock = wrangler.slice(wrangler.indexOf('[env.production.vars]'), wrangler.indexOf('triggers]') > 0 ? wrangler.indexOf('[env.production.triggers]') : undefined);
      assert(new RegExp(`^${variable}\\s*=`, 'm').test(productionBlock), `var production manquante: ${variable}`);
    }
  }, 'vars de production redéclarées (non héritées par Wrangler)');

  if (BUNDLE) {
    mkdirSync(dirname(BUNDLE_DIR), { recursive: true });
    rmSync(BUNDLE_DIR, { recursive: true, force: true });
    const wranglerBin = resolve(REPO_ROOT, 'node_modules', '.bin', 'wrangler');
    if (!existsSync(wranglerBin)) {
      record('Worker', 'Bundle de production (dry-run)', 'NOT_RUN', 'wrangler absent (npm install requis)');
    } else {
      const run = spawnSync(wranglerBin, ['deploy', '--dry-run', '--env', 'production', '--outdir', BUNDLE_DIR], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
        timeout: 300_000,
      });
      const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
      if (run.status !== 0) {
        record('Worker', 'Bundle de production (dry-run)', 'FAIL', output.trim().split('\n').slice(-6).join(' | '));
      } else {
        const upload = /Total Upload:\s*([^\n]+)/.exec(output)?.[1]?.trim() ?? 'taille inconnue';
        record('Worker', 'Bundle de production (dry-run)', 'PASS', `bundle construit sans credential (${upload})`, 'PREPARED');
      }
    }
  } else {
    record('Worker', 'Bundle de production (dry-run)', 'NOT_RUN', 'désactivé par --no-bundle');
  }

  /* ---------------------------------------------------------------- */
  /* 2. CRON                                                           */
  /* ---------------------------------------------------------------- */
  const cronsEntry = /^\s*crons\s*=\s*\[([^\]]*)\]/m.exec(wrangler.slice(wrangler.indexOf('[env.production.triggers]')))?.[1] ?? '';
  const crons = [...cronsEntry.matchAll(/"([^"]+)"/g)].map(match => match[1]);

  check('Cron', 'Trigger de production déclaré', () => {
    assert(/\[env\.production\.triggers\]/.test(activeWrangler), 'bloc [env.production.triggers] ACTIF absent');
    assert(crons.length >= 1, 'aucune expression cron active');
    for (const expression of crons) {
      const fields = expression.trim().split(/\s+/);
      assert(fields.length === 5, `expression cron non standard (5 champs attendus): ${expression}`);
    }
  }, `crons actifs: ${crons.join(', ') || '(aucun)'}`);

  check('Cron', 'Branché sur le handler et le worker EXISTANTS', () => {
    assert(/runScheduledCycle\s*\(/.test(entry), 'scheduled() n’appelle pas runScheduledCycle');
    assert(read('src/backend/automation/worker.ts').includes('runScheduledCycle'), 'runScheduledCycle absent du worker');
    assert(!/(?<![\w.])setInterval\s*\(/.test(entry), 'ordonnanceur applicatif détecté');
    assert(!/(?<![\w.])setTimeout\s*\(/.test(entry), 'minuteur applicatif détecté');
  }, 'Cron → scheduled() → runScheduledCycle (aucun second ordonnanceur)');

  check('Cron', 'Endpoint de test /__scheduled absent de la porte de déploiement', () => {
    assert(!/--test-scheduled/.test(packageJson.scripts['deploy:worker'] ?? ''), '--test-scheduled présent dans deploy:worker');
    assert(!/--test-scheduled/.test(packageJson.scripts['dev:worker'] ?? ''), '--test-scheduled présent dans dev:worker');
    assert(/--test-scheduled/.test(packageJson.scripts['dev:worker:scheduled'] ?? ''), 'le test local du Cron doit rester explicite (dev:worker:scheduled)');
  }, 'le déclenchement de test reste local (--test-scheduled) et hors production');

  check('Cron', 'Tick inerte sans base (aucune écriture implicite)', () => {
    const composition = composeWorker({ ...productionVars } as WorkerPersistenceEnvironment);
    assert(composition.mode === 'closed' || composition.persistence.kind !== 'postgres', 'aucune base ne doit être ouverte sans binding');
  }, 'sans binding Hyperdrive, la composition reste fermée (aucune base implicite)');

  record(
    'Cron',
    'Trigger installé côté Cloudflare',
    'BLOCKED',
    'aucun compte Cloudflare authentifié dans cette session : le trigger est déclaré dans la configuration et s’installe AU DÉPLOIEMENT ; sa présence réelle se vérifie après coup (wrangler deployments status / dashboard)',
    'NOT_DEPLOYED',
  );

  /* ---------------------------------------------------------------- */
  /* 3. QUEUE                                                          */
  /* ---------------------------------------------------------------- */
  const queueMigration = ['0006_automation_foundation.sql', '0017_cron_queue.sql']
    .filter(file => migrations.includes(file))
    .map(file => read(`migrations/${file}`))
    .join('\n');
  const automationWorker = read('src/backend/automation/worker.ts');

  check('Queue', 'File canonique = Outbox PostgreSQL transactionnelle', () => {
    assert(migrations.includes('0006_automation_foundation.sql'), 'migration 0006 absente');
    for (const column of ['status', 'attempts', 'available_at', 'last_error']) {
      assert(queueMigration.includes(column), `colonne de file manquante: ${column}`);
    }
    assert(/automation_outbox/.test(queueMigration), 'table automation_outbox absente');
  }, 'automation_outbox porte statut, tentatives, disponibilité et dernière erreur');

  check('Queue', 'Claim, retry et lettre morte conservés dans le worker existant', () => {
    assert(automationWorker.includes('FOR UPDATE SKIP LOCKED'), 'claim verrouillé absent');
    assert(automationWorker.includes('DEAD_LETTER'), 'lettre morte absente');
    assert(automationWorker.includes('RECOVER') || automationWorker.includes('recoverStaleClaims'), 'récupération des claims orphelins absente');
  }, 'claim FOR UPDATE SKIP LOCKED, retry, DEAD_LETTER et récupération des orphelins');

  check('Queue', 'Aucune Cloudflare Queue activée (décision documentée)', () => {
    assert(!/^\s*\[\[(env\.production\.)?queues/m.test(activeWrangler), 'un binding queues est ACTIF');
    const defaultExport = entry.slice(entry.indexOf('export default {'));
    assert(!/\bqueue\s*\(/.test(defaultExport), 'un handler queue() est exporté');
    assert(/QUEUE \(production\)/.test(wrangler), 'décision QUEUE non documentée');
  }, 'la file reste l’Outbox transactionnelle ; aucun handler queue() exporté');

  record(
    'Queue',
    'Ressource Cloudflare Queues',
    'PASS',
    'VOLONTAIREMENT NON IMPLÉMENTÉE : non requise par l’architecture retenue (l’Outbox est la file) — aucune ressource Cloudflare à créer, aucun blocage',
  );

  /* ---------------------------------------------------------------- */
  /* 4. POSTGRESQL / HYPERDRIVE                                        */
  /* ---------------------------------------------------------------- */
  check('PostgreSQL', 'Resolver fail-closed (aucune base implicite)', () => {
    assert(!resolvePostgresTarget({} as WorkerPersistenceEnvironment).ok, 'une cible a été résolue sans configuration');
    const placeholder = resolvePostgresTarget({ POSTGRES_CONNECTION_STRING: PLACEHOLDER_CONNECTION_STRING } as WorkerPersistenceEnvironment);
    assert(!placeholder.ok, 'la chaîne d’exemple documentaire doit être refusée');
    const resolved = resolvePostgresTarget({ HYPERDRIVE: { connectionString: PROBE_CONNECTION_STRING } } as WorkerPersistenceEnvironment);
    assert(resolved.ok && resolved.decision.reason === 'hyperdrive-binding', 'le binding Hyperdrive doit être prioritaire');
  }, 'sans binding → refus ; placeholder documentaire → refus ; binding Hyperdrive → source retenue');

  check('PostgreSQL', 'Limites de pool et de timeout déclarées', () => {
    assert(/DB_POOL_MAX\s*=\s*"5"/.test(wrangler), 'DB_POOL_MAX attendu');
    assert(/DB_STATEMENT_TIMEOUT_MS\s*=\s*"15000"/.test(wrangler), 'DB_STATEMENT_TIMEOUT_MS attendu');
  }, 'pool ≤ 5 connexions, timeout d’énoncé 15 s');

  check('PostgreSQL', 'Timeout d’énoncé appliqué et pool non persistant', () => {
    const database = read('src/backend/persistence/postgresDatabase.ts');
    assert(database.includes('SET LOCAL statement_timeout'), 'le timeout d’énoncé doit être posé par transaction (SET LOCAL)');
    assert(!/Pool\(/.test(read('src/backend/worker/cloudflareEntry.ts')), 'le pool doit rester créé par requête (Hyperdrive est le pool réel)');
    assert(/createWorkerPostgresClient/.test(read('src/backend/worker/cloudflareEntry.ts')), 'le client réel du Worker doit être utilisé');
  }, 'SET LOCAL statement_timeout par transaction ; pool créé par requête et fermé ensuite');

  check('PostgreSQL', 'Migrations alignées sur le manifeste lu par /healthz', () => {
    assert(migrations.length === EXPECTED_MIGRATION_IDS.length, `${EXPECTED_MIGRATION_IDS.length} migrations attendues, ${migrations.length} trouvées`);
    for (const expected of EXPECTED_MIGRATION_IDS) {
      assert(migrations.includes(`${expected}.sql`), `migration absente du disque: ${expected}`);
    }
    assert(existsSync(resolve(REPO_ROOT, 'scripts', 'migrate.ts')), 'runner de migrations absent');
  }, `${EXPECTED_MIGRATION_IDS.length} migrations présentes et alignées sur le manifeste`);

  record(
    'PostgreSQL',
    'Hyperdrive de production',
    'BLOCKED',
    'aucun Hyperdrive n’existe dans cette session ; le profil production n’active volontairement aucun binding (le Worker répond 503 misconfigured)',
    'BLOCKED_EXTERNAL_ACCESS',
    true,
  );
  record(
    'PostgreSQL',
    'Migrations appliquées sur la base de production',
    'BLOCKED',
    'aucune chaîne de connexion réelle : exécuter MIGRATION_DATABASE_URL=… npm run migrate -- --status puis npm run migrate',
    'BLOCKED_EXTERNAL_ACCESS',
    true,
  );

  /* ---------------------------------------------------------------- */
  /* 5. R2 / DOCUMENTS                                                 */
  /* ---------------------------------------------------------------- */
  check('R2', 'Binding de développement aligné sur le code', () => {
    assert(/\[\[r2_buckets\]\]/.test(activeWrangler), 'binding r2_buckets absent du profil local');
    assert(/binding\s*=\s*"DOCUMENTS_BUCKET"/.test(activeWrangler), 'nom de binding inattendu');
    assert(/env\.DOCUMENTS_BUCKET/.test(read('src/backend/api/entry.ts')), 'la composition ne lit pas env.DOCUMENTS_BUCKET');
  }, 'binding DOCUMENTS_BUCKET lu par la composition (simulateur local pour wrangler dev)');

  check('R2', 'Domaine DOCUMENTS fermé sans bucket, ouvert avec bucket', () => {
    const client = toPostgresClientPort(scriptedDriver());
    const withoutBucket = composeWorker({ ...productionVars, HYPERDRIVE: { connectionString: PROBE_CONNECTION_STRING } }, client);
    assert(!withoutBucket.documents, 'le domaine documents doit rester fermé sans stockage objet');
    const withBucket = composeWorker(
      { ...productionVars, HYPERDRIVE: { connectionString: PROBE_CONNECTION_STRING }, DOCUMENTS_BUCKET: fakeBucket() },
      client,
    );
    assert(Boolean(withBucket.documents), 'le domaine documents doit s’ouvrir avec un bucket injecté');
  }, 'fail-closed sans bucket, ouvert avec un binding R2 (port ObjectStorage inchangé)');

  check('R2', 'Abstraction ObjectStorage préservée (aucune clé exposée, aucun URL présignée)', () => {
    const storage = read('src/backend/documents/storage.ts');
    assert(/createR2BucketObjectStorage/.test(storage), 'adaptateur R2 absent');
    assert(/NOT_IMPLEMENTED/.test(storage), 'la présignature directe R2 doit rester explicitement non implémentée');
    assert(/abstraction|port/i.test(storage), 'documentation du port ObjectStorage attendue');
    const views = read('src/backend/documents/documentRepository.ts');
    assert(/object_key/.test(views), 'l’invariant « object_key jamais exposé » doit rester documenté dans le service documentaire');
  }, 'hash, versionnement et contrôle d’accès restent dans le service documentaire (aucun object_key en réponse)');

  check('R2', 'Aucune route documents publique', () => {
    const publicLines = routeContracts
      .split('\n')
      .filter(line => line.includes('authentication: \'public\'') && line.includes('documents'));
    assert(publicLines.length === 0, `route documents publique détectée: ${publicLines[0] ?? ''}`);
  }, 'les routes documents exigent une session (owner ou ADMIN)');

  record(
    'R2',
    'Bucket documentaire de production',
    'BLOCKED',
    'aucun bucket réel : créer le bucket puis activer [[env.production.r2_buckets]] avec le nom réel. Non bloquant pour le déploiement (le domaine DOCUMENTS reste fermé en 501, jamais un stockage implicite)',
    'BLOCKED_EXTERNAL_ACCESS',
  );

  /* ---------------------------------------------------------------- */
  /* 6. NOTIFICATIONS                                                  */
  /* ---------------------------------------------------------------- */
  check('Notifications', 'Canal In-App persisté', () => {
    assert(migrations.includes('0012_notifications.sql'), 'migration 0012 absente');
  }, 'boîte de réception In-App persistée (migration 0012)');

  check('Notifications', 'Aucun fournisseur Push/Email composé', () => {
    const composition = composeWorker({ ...productionVars } as WorkerPersistenceEnvironment);
    const channels = composeWorker(
      { ...productionVars, HYPERDRIVE: { connectionString: PROBE_CONNECTION_STRING } },
      toPostgresClientPort(scriptedDriver()),
    ).notificationChannels;
    assert(composition.notificationChannels.push === null && composition.notificationChannels.email === null, 'aucun provider ne doit être composé (frontière fermée)');
    assert(channels.push === null && channels.email === null, 'aucun provider ne doit être composé en mode PostgreSQL');
  }, 'Push/Email restent des abstractions : aucun provider, aucun canal externe (NOT_CONFIGURED)');

  /* ---------------------------------------------------------------- */
  /* 7. AUDIT / OBSERVABILITÉ                                          */
  /* ---------------------------------------------------------------- */
  check('Audit', 'Ledger d’audit existant et trace du tick', () => {
    const foundation = read('migrations/0006_automation_foundation.sql');
    assert(/automation_audit_ledger/.test(foundation), 'ledger d’audit absent');
    assert(/CRON_TICK_EXECUTED/.test(automationWorker), 'trace CRON_TICK_EXECUTED absente du worker');
    assert(/CRON_TICK_FAILED/.test(automationWorker), 'trace CRON_TICK_FAILED absente du worker');
  }, 'CRON_TICK_EXECUTED / CRON_TICK_FAILED écrits dans le ledger existant');

  check('Audit', 'Log d’exploitation du tick (compteurs uniquement)', () => {
    assert(/cron_tick_executed/.test(entry), 'log cron_tick_executed absent');
    assert(/cron_tick_skipped/.test(entry), 'log cron_tick_skipped absent');
    assert(!/console\.log\([^)]*connectionString/.test(entry), 'une chaîne de connexion ne doit jamais être journalisée');
  }, 'une ligne structurée par tick (compteurs), trace durable dans l’audit');

  /* ---------------------------------------------------------------- */
  /* 8. SÉCURITÉ                                                       */
  /* ---------------------------------------------------------------- */
  check('Sécurité', 'Aucun secret dans la configuration', () => {
    assert(!/postgres(ql)?:\/\//i.test(activeWrangler), 'chaîne de connexion active dans wrangler.toml');
    assert(!/^\s*TEST_ONLY_GOOGLE_JWKS_URL/m.test(activeWrangler), 'variable de test déclarée dans la configuration déployée');
    assert(!/(secret|token|password|api[_-]?key)\s*=\s*"[^"]+"/i.test(activeWrangler), 'valeur ressemblant à un secret dans une ligne active');
  }, 'aucune valeur secrète en clair ; les secrets passent par `wrangler secret put`');

  check('Sécurité', 'Aucune route de debug, de test ou de drain', () => {
    for (const needle of ['debug', 'drain', 'internal', '/_test', '__scheduled']) {
      const lines = routeContracts.split('\n').filter(line => line.toLowerCase().includes(needle));
      assert(lines.length === 0, `route suspecte dans le catalogue (${needle}): ${lines[0] ?? ''}`);
    }
  }, 'aucune route publique de debug/drain dans le catalogue de routes');

  check('Sécurité', 'Posture same-origin (aucun CORS ouvert)', () => {
    const files = ['src/backend/api/worker.ts', 'src/backend/api/identityWorker.ts', 'src/backend/api/security.ts'];
    for (const file of files) {
      const content = read(file).toLowerCase();
      assert(!content.includes('access-control-allow-origin'), `${file}: en-tête CORS détecté`);
      assert(!content.includes('access-control-allow-credentials'), `${file}: en-tête CORS détecté`);
    }
  }, 'aucun en-tête CORS émis : le navigateur reste sur la même origine que l’API');

  check('Sécurité', 'Routes ADMIN : rôle et session exigés, jamais publiques', () => {
    const adminLines = routeContracts.split('\n').filter(line => line.includes("scope: 'admin'"));
    assert(adminLines.length >= 10, `catalogue ADMIN attendu, reçu ${adminLines.length} route(s)`);
    for (const line of adminLines) {
      assert(line.includes("authentication: 'required'"), `route ADMIN sans session exigée: ${line.trim()}`);
      assert(/permission:/.test(line), `route ADMIN sans permission explicite: ${line.trim()}`);
    }
  }, 'chaque route ADMIN exige une session ET une permission explicite (jamais un rôle implicite)');

  check('Sécurité', 'Aucun endpoint HTTP de migration', () => {
    const lines = routeContracts.split('\n').filter(line => /migrat/i.test(line));
    assert(lines.length === 0, `route de migration détectée dans le catalogue: ${lines[0] ?? ''}`);
    assert(existsSync(resolve(REPO_ROOT, 'scripts', 'migrate.ts')), 'les migrations doivent rester une opération d’exploitation (CLI)');
  }, 'les migrations restent une opération CLI (MIGRATION_DATABASE_URL), jamais une route publique');

  check('Sécurité', 'Aucun secret PostgreSQL dans le bundle navigateur', () => {
    const sources = readdirSync(resolve(REPO_ROOT, 'src'), { recursive: true })
      .map(entry => String(entry))
      .filter(relative => /\.(ts|tsx)$/.test(relative));
    for (const relative of sources) {
      const content = read(`src/${relative}`);
      assert(!/VITE_[A-Z_]*(POSTGRES|HYPERDRIVE|SIGNING_SECRET|DOCUMENT_URL)/.test(content), `variable serveur exposée via VITE_*: src/${relative}`);
    }
  }, 'aucune variable serveur n’est exposée au bundle via VITE_*');

  check('Sécurité', 'Modèle de paiement intouché (aucun escrow, wallet ou transfert interne)', () => {
    const forbidden = /escrow|wallet|custody|internal[_-]?transfer/i;
    for (const file of ['src/backend/payments/paymentProviderRegistry.ts', 'src/backend/automation/paymentCycle.ts', 'migrations/0008_payment_cycle.sql']) {
      assert(!forbidden.test(read(file)), `motif interdit détecté dans ${file}`);
    }
  }, 'aucun escrow, wallet ni transfert interne ; aucun paiement n’est déclenché par le préflight');

  const productionVarsBlock = wrangler.slice(wrangler.indexOf('[env.production.vars]'), wrangler.indexOf('[env.production.triggers]'));
  const productionAudience = (/^GOOGLE_CLIENT_ID\s*=\s*"([^"]*)"/m.exec(productionVarsBlock)?.[1] ?? '').trim();
  if (productionAudience.length === 0) {
    record(
      'Identité',
      'Audience Google publique de production',
      'BLOCKED',
      'GOOGLE_CLIENT_ID est vide : la frontière reste FERMÉE (401/501) et le Worker ne sert aucune route protégée. Valeur publique à fournir par l’exploitant (Google Cloud Console), jamais un secret',
      'BLOCKED_EXTERNAL_ACCESS',
      true,
    );
  } else {
    check('Identité', 'Audience Google publique de production', () => {
      assert(/\.apps\.googleusercontent\.com$/.test(productionAudience), 'audience Google inattendue (identifiant client OAuth attendu)');
    }, 'audience OAuth publique déclarée sans secret');
  }

  /* ---------------------------------------------------------------- */
  /* 9. SONDE DISTANTE (lecture seule, optionnelle)                     */
  /* ---------------------------------------------------------------- */
  if (REMOTE) {
    const wranglerBin = resolve(REPO_ROOT, 'node_modules', '.bin', 'wrangler');
    const runWrangler = (args: string[]): { ok: boolean; output: string } => {
      if (!existsSync(wranglerBin)) return { ok: false, output: 'wrangler absent (npm install requis)' };
      const run = spawnSync(wranglerBin, args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
        timeout: 120_000,
      });
      return { ok: run.status === 0, output: `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() };
    };

    const whoami = runWrangler(['whoami']);
    const authenticated = whoami.ok && !/not authenticated/i.test(whoami.output) && /Account|accounts/i.test(whoami.output);
    if (!authenticated) {
      record('Distant', 'Authentification Cloudflare (wrangler whoami)', 'BLOCKED', `réponse réelle: ${whoami.output.split('\n').slice(-2).join(' | ') || '(vide)'}`, 'BLOCKED_EXTERNAL_ACCESS');
      record('Distant', 'Ressources Cloudflare (Hyperdrive, R2, déploiements)', 'NOT_RUN', 'aucune authentification : rien n’a été sondé (aucune valeur inventée)');
    } else {
      record('Distant', 'Authentification Cloudflare (wrangler whoami)', 'PASS', whoami.output.split('\n').slice(0, 3).join(' | '));
      for (const [label, args] of [
        ['Hyperdrive', ['hyperdrive', 'list']],
        ['Buckets R2', ['r2', 'bucket', 'list']],
        ['Déploiements du Worker', ['deployments', 'list', '--name', 'lelabeur-api']],
      ] as const) {
        const probe = runWrangler([...args]);
        record(
          'Distant',
          label,
          probe.ok ? 'PASS' : 'FAIL',
          probe.output.split('\n').slice(0, 8).join(' | ') || '(aucune sortie)',
        );
      }
    }
  } else {
    record('Distant', 'Sondes Cloudflare', 'NOT_RUN', 'relancer avec --remote pour exécuter les commandes de lecture (whoami, hyperdrive list, r2 bucket list)');
  }

  /* ---------------------------------------------------------------- */
  /* Sortie                                                            */
  /* ---------------------------------------------------------------- */
  const width = Math.max(...items.map(item => item.area.length));
  console.log('============================================================');
  console.log(' LE LABEUR — P0-CLOUDFLARE-PRODUCTION — préflight');
  console.log(` Mode: ${REQUIRE_PRODUCTION ? 'PORTE DE DÉPLOIEMENT (--require-production)' : 'rapport de préparation'}`
    + `${REMOTE ? ' + sondes distantes' : ' (hors ligne)'}`);
  console.log(` Runtime de détection: ${detectWorkerRuntime()} — rappel : ce script ne déploie RIEN`);
  console.log('============================================================');
  for (const item of items) {
    const qualifier = item.qualifier ? ` [${item.qualifier}]` : '';
    console.log(`${item.status.padEnd(7)} ${item.area.padEnd(width)} | ${item.name}${qualifier}`);
    console.log(`        ${item.detail}`);
  }

  const counts = {
    pass: items.filter(item => item.status === 'PASS').length,
    fail: items.filter(item => item.status === 'FAIL').length,
    blocked: items.filter(item => item.status === 'BLOCKED').length,
    notRun: items.filter(item => item.status === 'NOT_RUN').length,
  };
  console.log('------------------------------------------------------------');
  console.log(`Total: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.blocked} BLOCKED, ${counts.notRun} NOT RUN`);
  console.log('Smoke checks d’exploitation (aucun paiement, aucun transfert, aucune écriture métier) :');
  console.log('  npx wrangler whoami');
  console.log('  npx wrangler hyperdrive list && npx wrangler r2 bucket list');
  console.log('  MIGRATION_DATABASE_URL="postgresql://…" npm run migrate -- --status');
  console.log('  npx wrangler deploy --env production        # uniquement après préflight --require-production');
  console.log('  curl -sS https://<worker>/healthz | head -c 400     # status ok, migrations applied');
  console.log('  npx wrangler tail --env production                  # vérifier les lignes cron_tick_executed');
  console.log('Rappel : ce préflight ne prouve AUCUNE conformité juridique ni aucun agrément.');

  const productionBlockers = items.filter(item => item.blocking);
  if (REQUIRE_PRODUCTION && productionBlockers.length > 0) {
    console.log('------------------------------------------------------------');
    console.log(`PORTE DE DÉPLOIEMENT FERMÉE : ${productionBlockers.length} ressource(s) de production non disponible(s).`);
    for (const item of productionBlockers) console.log(`  - ${item.area} / ${item.name} (${item.qualifier ?? 'non disponible'})`);
    process.exitCode = 1;
    return;
  }
  if (failures.length > 0) {
    console.log('------------------------------------------------------------');
    console.log(`PRÉFLIGHT EN ÉCHEC : ${failures.length} incohérence(s) à corriger.`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main();
