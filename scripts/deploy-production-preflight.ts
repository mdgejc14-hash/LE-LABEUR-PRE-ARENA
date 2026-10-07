/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — contrôle AVANT DÉPLOIEMENT.
 *
 * Ce script n'exécute AUCUN déploiement et ne crée AUCUNE ressource : il AUDITE
 * ce qui est déclaré, ce qui est prouvable localement, et ce qui dépend d'une
 * ressource externe indisponible.
 *
 * Utilisation :
 *   npm run deploy:preflight               # audit local complet (aucun réseau)
 *   npm run deploy:preflight -- --external # + vérification Cloudflare (whoami,
 *                                          # hyperdrive list, r2 bucket list)
 *   npm run deploy:preflight -- --json     # sortie machine
 *
 * Codes de sortie :
 *   0 — configuration locale valide ET ressources externes vérifiées présentes ;
 *   3 — configuration locale valide MAIS ressources externes bloquées/non
 *       vérifiables (BLOCKED_EXTERNAL_ACCESS) : le déploiement n'est PAS prouvé ;
 *   1 — configuration locale invalide (à corriger avant tout déploiement).
 *
 * Règle absolue : aucun secret n'est lu, deviné, affiché ou écrit.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXPECTED_MIGRATION_IDS } from '../src/backend/persistence/migrationManifest';
import { loadMigrations, stripTransactionEnvelope } from '../src/backend/persistence/migrationRunner';
import { API_ROUTE_CONTRACTS } from '../src/backend/api/routeContracts';
import { evaluateProductionGuard } from '../src/backend/worker/productionGuard';
import {
  PRODUCTION_REQUIREMENTS,
  findWranglerProfile,
  isPlaceholderHyperdriveId,
  isPlaceholderValue,
  parseWranglerProfiles,
} from '../src/backend/worker/productionResources';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

type Status = 'ok' | 'blocked-external' | 'invalid';

interface Finding {
  id: string;
  status: Status;
  detail: string;
}

const findings: Finding[] = [];
const args = new Set(process.argv.slice(2));

function record(id: string, status: Status, detail: string): void {
  findings.push({ id, status, detail });
}

function assertLocal(id: string, condition: boolean, detail: string): boolean {
  record(id, condition ? 'ok' : 'invalid', detail);
  return condition;
}

function requireFile(relative: string): string {
  const absolute = resolve(REPO_ROOT, relative);
  if (!existsSync(absolute)) throw new Error(`fichier manquant: ${relative}`);
  return readFileSync(absolute, 'utf8');
}

/** Lignes ACTIVES d'un fichier de configuration (commentaires exclus). */
function activeLines(text: string): string[] {
  return text.split(/\r?\n/).filter(line => !line.trim().startsWith('#'));
}

async function runWrangler(commandArgs: string[], timeoutMs = 20_000): Promise<{ ok: boolean; output: string }> {
  return new Promise(resolvePromise => {
    execFile(
      resolve(REPO_ROOT, 'node_modules', '.bin', 'wrangler'),
      commandArgs,
      {
        cwd: REPO_ROOT,
        timeout: timeoutMs,
        env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
      },
      (error, stdout, stderr) => {
        const output = `${stdout ?? ''}\n${stderr ?? ''}`.trim();
        resolvePromise({ ok: !error, output });
      },
    );
  });
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- */
  /* 1 — Lecture de la configuration déclarée                          */
  /* ---------------------------------------------------------------- */
  const wranglerText = requireFile('wrangler.toml');
  const profiles = parseWranglerProfiles(wranglerText);
  const defaultProfile = findWranglerProfile(profiles, 'default');
  const production = findWranglerProfile(profiles, 'production');

  assertLocal(
    'worker.entry',
    defaultProfile?.main === 'src/backend/worker/cloudflareEntry.ts'
      && existsSync(resolve(REPO_ROOT, 'src/backend/worker/cloudflareEntry.ts')),
    `entrée Worker déclarée: ${defaultProfile?.main ?? '(absente)'}`,
  );

  const compatibilityDate = defaultProfile?.compatibilityDate ?? '';
  assertLocal(
    'worker.runtime',
    (defaultProfile?.compatibilityFlags ?? []).includes('nodejs_compat')
      && compatibilityDate >= '2024-09-23'
      && compatibilityDate <= new Date().toISOString().slice(0, 10),
    `compatibility_date=${compatibilityDate || '(absente)'}, flags=[${(defaultProfile?.compatibilityFlags ?? []).join(', ')}]`,
  );

  assertLocal(
    'production.profile',
    Boolean(production) && production?.workerName === defaultProfile?.workerName,
    production
      ? `profil production « ${production.workerName} » avec vars redéclarées (${Object.keys(production.vars).length} clés)`
      : 'profil [env.production] absent',
  );

  /* ---------------------------------------------------------------- */
  /* 2 — Invariants de production (garde-fou réel, mêmes règles que    */
  /*     celles appliquées par le Worker au runtime)                   */
  /* ---------------------------------------------------------------- */
  const productionVars = production?.vars ?? {};
  const declaredHyperdrive = (production?.hyperdrive ?? []).find(entry => entry.binding === 'HYPERDRIVE');
  const productionEnv = {
    ...productionVars,
    ...(declaredHyperdrive && !isPlaceholderHyperdriveId(declaredHyperdrive.value)
      ? { HYPERDRIVE: { connectionString: 'postgresql://declared@declared.invalid:5432/declared' } }
      : {}),
  };
  const guard = evaluateProductionGuard(productionEnv);
  const guardExpectations = guard.violations.map(violation => violation.code);
  assertLocal(
    'production.guard',
    guard.production && guard.violations.every(violation =>
      violation.code !== 'production-requires-postgres'
      && violation.code !== 'production-insecure-cookie'
      && violation.code !== 'production-test-jwks-override'),
    `invariants évalués (${guardExpectations.join(', ') || 'aucune violation'}) — fermeture franche si violation`,
  );

  /* ---------------------------------------------------------------- */
  /* 3 — Cron : cadence déclarée, miroir, et unicité de la valeur      */
  /* ---------------------------------------------------------------- */
  const productionCrons = production?.cronTriggers ?? [];
  const defaultCrons = defaultProfile?.cronTriggers ?? [];
  const declaredCadence = productionVars.CRON_CADENCE;
  assertLocal(
    'production.cron',
    productionCrons.length === 1
      && productionCrons[0] === declaredCadence
      && (declaredCadence?.split(/\s+/).length ?? 0) === 5
      && JSON.stringify(defaultCrons) === JSON.stringify(productionCrons),
    `crons production=[${productionCrons.join(', ')}] / CRON_CADENCE=${declaredCadence ?? '(absente)'} / crons dev=[${defaultCrons.join(', ')}]`,
  );

  /* ---------------------------------------------------------------- */
  /* 4 — R2 : binding + bucket privé, jamais un placeholder            */
  /* ---------------------------------------------------------------- */
  const r2 = (production?.r2Buckets ?? []).find(entry => entry.binding === 'DOCUMENTS_BUCKET');
  assertLocal(
    'production.r2',
    Boolean(r2?.value) && !isPlaceholderValue(r2?.value),
    r2?.value
      ? `binding DOCUMENTS_BUCKET déclaré pour le bucket « ${r2.value} » (privé, aucun domaine public)`
      : 'aucun binding DOCUMENTS_BUCKET déclaré en production',
  );

  /* ---------------------------------------------------------------- */
  /* 5 — Aucune seconde file / aucun stockage parallèle                */
  /* ---------------------------------------------------------------- */
  const forbiddenStorage = profiles.filter(profile =>
    profile.queues || profile.kvNamespaces || profile.durableObjects || profile.d1Databases || profile.services);
  assertLocal(
    'storage.single-source',
    forbiddenStorage.length === 0,
    forbiddenStorage.length === 0
      ? 'aucune Queue/KV/Durable Object/D1/Service déclarée : la file durable reste automation_outbox'
      : `stockages parallèles déclarés dans ${forbiddenStorage.map(profile => profile.name).join(', ')}`,
  );

  /* ---------------------------------------------------------------- */
  /* 6 — Secrets : jamais dans le dépôt, jamais dans les vars          */
  /* ---------------------------------------------------------------- */
  const secretNames = PRODUCTION_REQUIREMENTS.filter(requirement => requirement.secret).map(requirement => requirement.name);
  const varsDeclaringSecrets = secretNames.filter(name => Object.keys(productionVars).includes(name));
  const activeWrangler = activeLines(wranglerText).join('\n');
  const connectionStringLike = /postgres(ql)?:\/\/[^\s"']*@/i.test(activeWrangler);
  assertLocal(
    'secrets.not-committed',
    varsDeclaringSecrets.length === 0 && !connectionStringLike,
    varsDeclaringSecrets.length === 0 && !connectionStringLike
      ? 'aucun secret ni chaîne de connexion dans les lignes actives de wrangler.toml'
      : `secrets/valeurs interdits détectés: ${[...varsDeclaringSecrets, ...(connectionStringLike ? ['chaîne de connexion'] : [])].join(', ')}`,
  );

  const gitignore = requireFile('.gitignore');
  assertLocal(
    'secrets.gitignore',
    /^\.dev\.vars$/m.test(gitignore) && /^\.dev\.vars\.\*$/m.test(gitignore) && /^!\.dev\.vars\.example$/m.test(gitignore),
    '.dev.vars gitignoré, .dev.vars.example versionné',
  );

  /* ---------------------------------------------------------------- */
  /* 7 — Migrations : manifeste, ordre, enveloppe, empreintes          */
  /* ---------------------------------------------------------------- */
  const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(file => file.toLowerCase().endsWith('.sql')).sort();
  const migrations = loadMigrations(MIGRATIONS_DIR);
  const manifestAligned = JSON.stringify(migrations.map(migration => migration.id)) === JSON.stringify(EXPECTED_MIGRATION_IDS);
  assertLocal(
    'migrations.manifest',
    manifestAligned && migrationFiles.length === EXPECTED_MIGRATION_IDS.length,
    manifestAligned
      ? `${migrations.length} migrations de 0001 à ${EXPECTED_MIGRATION_IDS[EXPECTED_MIGRATION_IDS.length - 1]} alignées sur le manifeste lu par /healthz`
      : `manifeste désaligné: ${migrations.map(migration => migration.id).join(', ')}`,
  );

  let envelopesValid = true;
  let checksumsValid = true;
  for (const migration of migrations) {
    try {
      stripTransactionEnvelope(migration.sql);
    } catch {
      envelopesValid = false;
    }
    if (!/^[0-9a-f]{64}$/.test(migration.checksum)) checksumsValid = false;
  }
  assertLocal(
    'migrations.atomicity',
    envelopesValid && checksumsValid,
    envelopesValid && checksumsValid
      ? 'chaque migration porte son enveloppe BEGIN/COMMIT unique et son empreinte SHA-256 (jamais rejouée : schema_migrations + verrou consultatif)'
      : 'enveloppe transactionnelle ou empreinte invalide détectée',
  );

  /* ---------------------------------------------------------------- */
  /* 8 — Aucune route de debug/drain exposée                           */
  /* ---------------------------------------------------------------- */
  const forbiddenRoutes = API_ROUTE_CONTRACTS.filter(contract =>
    /(cron|scheduled|automation|debug|drain|__)/i.test(contract.path));
  assertLocal(
    'security.no-debug-route',
    forbiddenRoutes.length === 0,
    forbiddenRoutes.length === 0
      ? `${API_ROUTE_CONTRACTS.length} routes déclarées, aucune route de drain/cron/debug`
      : `routes interdites: ${forbiddenRoutes.map(route => route.path).join(', ')}`,
  );

  /* ---------------------------------------------------------------- */
  /* 9 — Ressources externes (jamais devinées, jamais inventées)       */
  /* ---------------------------------------------------------------- */
  const externalChecks = args.has('--external');
  const hyperdriveRequirement = PRODUCTION_REQUIREMENTS.find(requirement => requirement.id === 'hyperdrive');
  const bucketRequirement = PRODUCTION_REQUIREMENTS.find(requirement => requirement.id === 'documents-bucket');

  if (!declaredHyperdrive || isPlaceholderHyperdriveId(declaredHyperdrive.value)) {
    record(
      'external.hyperdrive',
      'blocked-external',
      `binding Hyperdrive de production NON déclaré (aucune ressource créée) — ${hyperdriveRequirement?.provisioning ?? ''}`,
    );
  } else if (!externalChecks) {
    record('external.hyperdrive', 'blocked-external', 'binding déclaré mais existence non vérifiée (relancer avec --external)');
  } else {
    const whoami = await runWrangler(['whoami']);
    const hyperdrives = whoami.ok ? await runWrangler(['hyperdrive', 'list']) : { ok: false, output: '' };
    const known = hyperdrives.ok && hyperdrives.output.includes(declaredHyperdrive.value);
    record(
      'external.hyperdrive',
      known ? 'ok' : 'blocked-external',
      known
        ? `Hyperdrive ${declaredHyperdrive.value} présent dans le compte`
        : `ressource non vérifiable (whoami=${whoami.ok ? 'ok' : 'indisponible'}) — ${hyperdriveRequirement?.provisioning ?? ''}`,
    );
  }

  if (!r2?.value || isPlaceholderValue(r2.value)) {
    record('external.r2-bucket', 'blocked-external', 'bucket R2 de production non déclaré');
  } else if (!externalChecks) {
    record(
      'external.r2-bucket',
      'blocked-external',
      `bucket « ${r2.value} » déclaré mais existence non vérifiée — ${bucketRequirement?.provisioning ?? ''}`,
    );
  } else {
    const buckets = await runWrangler(['r2', 'bucket', 'list']);
    const known = buckets.ok && buckets.output.includes(r2.value);
    record(
      'external.r2-bucket',
      known ? 'ok' : 'blocked-external',
      known
        ? `bucket « ${r2.value} » présent dans le compte`
        : `ressource non vérifiable (commande ${buckets.ok ? 'ok' : 'indisponible'}) — ${bucketRequirement?.provisioning ?? ''}`,
    );
  }

  if (!externalChecks) {
    record(
      'external.cloudflare-account',
      'blocked-external',
      'aucune vérification d’accès Cloudflare demandée (--external) : authentification, Hyperdrive et bucket R2 ne sont pas prouvés',
    );
  } else {
    const whoami = await runWrangler(['whoami']);
    record(
      'external.cloudflare-account',
      whoami.ok && /logged in|associated with the email|account/i.test(whoami.output) ? 'ok' : 'blocked-external',
      whoami.ok
        ? 'session Cloudflare active (aucun identifiant de compte affiché ici)'
        : 'accès Cloudflare indisponible : aucun credential dans cet environnement',
    );
  }

  /* ---------------------------------------------------------------- */
  /* 10 — Synthèse                                                     */
  /* ---------------------------------------------------------------- */
  const invalid = findings.filter(finding => finding.status === 'invalid');
  const blocked = findings.filter(finding => finding.status === 'blocked-external');

  if (args.has('--json')) {
    console.log(JSON.stringify({ findings, invalid: invalid.length, blocked: blocked.length }, null, 2));
  } else {
    console.log('============================================================');
    console.log(' LE LABEUR — P0-CLOUDFLARE-PRODUCTION — contrôle avant déploiement');
    console.log('============================================================');
    for (const finding of findings) {
      const prefix = finding.status === 'ok' ? 'OK      ' : finding.status === 'invalid' ? 'INVALID ' : 'BLOCKED_EXTERNAL_ACCESS ';
      console.log(`${prefix} ${finding.id} — ${finding.detail}`);
    }
    console.log('------------------------------------------------------------');
    console.log(`Contrôles locaux valides : ${findings.length - invalid.length - blocked.length}/${findings.length - blocked.length}`);
    console.log(`Blocages externes        : ${blocked.length}`);
    console.log(`Configuration invalide   : ${invalid.length}`);
    console.log('Aucun déploiement, aucune ressource créée, aucun secret lu par ce contrôle.');
  }

  process.exitCode = invalid.length > 0 ? 1 : blocked.length > 0 ? 3 : 0;
}

void main().catch(error => {
  console.error(`Préflight interrompu: ${String((error as Error)?.message ?? error)}`);
  process.exitCode = 1;
});
