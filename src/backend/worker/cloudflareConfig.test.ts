/**
 * LE LABEUR — P0-C puis P0-CLOUDFLARE-PRODUCTION — tests de contrat de la
 * configuration Cloudflare.
 *
 * Ces tests ne contactent AUCUN service Cloudflare : ils vérifient que la
 * configuration préparée est cohérente, fail-closed, et qu'aucun secret n'entre
 * dans le dépôt. Ils garantissent aussi l'isolation du pilote `pg` hors du
 * bundle navigateur.
 *
 * P0-CLOUDFLARE-PRODUCTION ajoute des garde-fous sur ce qui est désormais
 * DÉCLARÉ (Cron Trigger de production, binding R2 de développement) et sur ce
 * qui reste VOLONTAIREMENT non activé (bindings de ressources inexistantes,
 * Cloudflare Queue) : chaque décision est encodée ici pour qu'un changement
 * accidentel échoue bruyamment au lieu de passer inaperçu.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CloudflareConfigTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Placeholder explicite du binding Hyperdrive de développement (jamais un ID réel). */
const DEV_HYPERDRIVE_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
/** Tout marqueur `<…>` signale une valeur d'infrastructure à fournir par l'exploitant. */
const UNFILLED_MARKER = /<[A-Z][A-Z0-9_]*>/;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepoFile(relativePath: string): string {
  const absolute = resolve(REPO_ROOT, relativePath);
  assert(existsSync(absolute), `fichier manquant: ${relativePath}`);
  return readFileSync(absolute, 'utf8');
}

/** Lignes ACTIVES d'un TOML : les commentaires portent la documentation, pas la configuration. */
function activeLines(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.replace(/\s+#.*$/, ''))
    .filter(line => line.trim().length > 0 && !line.trim().startsWith('#'));
}

interface TomlTable {
  /** En-tête tel qu'écrit (`[vars]`, `[[r2_buckets]]`, `[env.production.triggers]`). */
  header: string;
  /** `vars` du tableau : clé → valeur brute (sans guillemets normalisés). */
  entries: string[];
}

/** Découpe un TOML minimal en tableaux ACTIFS (aucune dépendance ajoutée). */
function activeTables(content: string): TomlTable[] {
  const tables: TomlTable[] = [];
  let current: TomlTable = { header: '', entries: [] };
  for (const line of activeLines(content)) {
    const header = /^\s*(\[\[?[^\]]+\]\]?)\s*$/.exec(line);
    if (header) {
      if (current.header || current.entries.length > 0) tables.push(current);
      current = { header: header[1], entries: [] };
      continue;
    }
    current.entries.push(line.trim());
  }
  if (current.header || current.entries.length > 0) tables.push(current);
  return tables;
}

function tablesNamed(content: string, prefix: string): TomlTable[] {
  return activeTables(content).filter(table => table.header.includes(prefix));
}

/** Expression cron standard à 5 champs (minute heure jour mois jour-semaine). */
function cronMinuteGranularity(expression: string): number | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute] = fields;
  if (minute === '*') return 1;
  const step = /^\*\/(\d+)$/.exec(minute);
  if (step) {
    const value = Number.parseInt(step[1], 10);
    return Number.isInteger(value) && value >= 1 && value <= 59 ? value : null;
  }
  if (/^\d+$/.test(minute)) {
    const value = Number.parseInt(minute, 10);
    return value >= 0 && value <= 59 ? 60 : null;
  }
  if (/^\d+-\d+$/.test(minute)) return 1;
  if (/^(\d+|\d+-\d+)(,(\d+|\d+-\d+))+$/.test(minute)) return 1;
  return null;
}

/** Parcourt le graphe d'imports relatif + paquets depuis un point d'entrée. */
function collectImportGraph(entryPoint: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entryPoint];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file) || !existsSync(file) || !statSync(file).isFile()) continue;
    files.add(file);
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(file), specifier);
        for (const candidate of [target, `${target}.ts`, `${target}.tsx`, resolve(target, 'index.ts'), resolve(target, 'index.tsx')]) {
          if (existsSync(candidate) && statSync(candidate).isFile()) queue.push(candidate);
        }
      } else {
        packages.add(specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/'));
      }
    }
  }
  return { files, packages };
}

export async function runCloudflareConfigTests(): Promise<CloudflareConfigTestResult[]> {
  const results: CloudflareConfigTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const wrangler = readRepoFile('wrangler.toml');
  const entrySource = readRepoFile('src/backend/worker/cloudflareEntry.ts');
  const deployScriptGuardedMessage =
    'le déploiement production doit passer par le préflight (scripts/preflight-cloudflare.ts)';

  await check('P0-C config: wrangler.toml — entrée Worker réelle, runtime compatible pg', () => {
    assert(/main\s*=\s*"src\/backend\/worker\/cloudflareEntry\.ts"/.test(wrangler), 'main doit pointer vers l’entrée Worker');
    assert(existsSync(resolve(REPO_ROOT, 'src/backend/worker/cloudflareEntry.ts')), 'l’entrée Worker doit exister');
    assert(/compatibility_flags\s*=\s*\[\s*"nodejs_compat"\s*\]/.test(wrangler), 'nodejs_compat requis par node-postgres');
    const date = /compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/.exec(wrangler)?.[1];
    assert(Boolean(date), 'compatibility_date explicite requise');
    assert(date! >= '2024-09-23', 'compatibility_date >= 2024-09-23 requise pour nodejs_compat + pg');
    assert(date! <= new Date().toISOString().slice(0, 10), 'compatibility_date ne peut pas être future');
  });

  await check('P0-C config: binding Hyperdrive déclaré sans secret, dev/production séparés', () => {
    const hyperdrive = tablesNamed(wrangler, '[[hyperdrive]]');
    assert(hyperdrive.length === 1, `un unique binding Hyperdrive de développement attendu, reçu ${hyperdrive.length}`);
    assert(hyperdrive[0].entries.some(entry => /binding\s*=\s*"HYPERDRIVE"/.test(entry)), 'nom de binding HYPERDRIVE attendu');
    assert(
      hyperdrive[0].entries.some(entry => entry.includes(DEV_HYPERDRIVE_PLACEHOLDER)),
      'l’ID Hyperdrive de développement doit rester un placeholder explicite, jamais un ID réel',
    );
    assert(/CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE/.test(readRepoFile('.dev.vars.example')), 'développement local documenté via la variable Hyperdrive standard');
    assert(/\[env\.production\]/.test(wrangler), 'profil production explicite attendu');
    assert(/\[env\.production\.vars\]/.test(wrangler), 'les vars ne sont pas héritées : production doit les redéclarer');
    assert(/WORKER_ENV\s*=\s*"production"/.test(wrangler), 'WORKER_ENV=production attendu');
    assert(/WORKER_ENV\s*=\s*"development"/.test(wrangler), 'WORKER_ENV=development attendu');
    // Les bindings ne sont pas hérités : le placeholder de développement ne doit pas
    // être réutilisé tel quel en production.
    const productionBlock = wrangler.slice(wrangler.indexOf('[env.production]'));
    assert(!/^\s*\[\[env\.production\.hyperdrive\]\]\s*$/m.test(productionBlock), 'production ne doit pas activer un Hyperdrive inexistant');
    assert(/npx wrangler hyperdrive create/.test(productionBlock), 'la création du Hyperdrive de production doit être documentée');
  });

  await check('P0-CLOUDFLARE-PRODUCTION config: Cron Trigger ACTIF et branché sur le handler `scheduled()` existant', () => {
    // Non hérité : le trigger doit être déclaré DANS le profil production.
    const triggers = tablesNamed(wrangler, '[env.production.triggers]');
    assert(triggers.length === 1, `un bloc [env.production.triggers] attendu, reçu ${triggers.length}`);
    const cronsEntry = triggers[0].entries.find(entry => /^crons\s*=/.test(entry));
    assert(Boolean(cronsEntry), 'déclaration `crons = [...]` attendue');
    const expressions = [...cronsEntry!.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert(expressions.length >= 1, 'au moins une expression cron attendue');
    for (const expression of expressions) {
      assert(cronMinuteGranularity(expression) !== null, `expression cron invalide: ${expression}`);
    }
    // Un seul ordonnanceur : le trigger appelle le handler EXISTANT.
    assert(/scheduled\s*\(/.test(entrySource), 'le handler scheduled() doit exister dans l’entrée Worker');
    const defaultExport = entrySource.slice(entrySource.indexOf('export default {'));
    assert(/scheduled\s*\(/.test(defaultExport), 'le handler scheduled() doit être exporté par défaut (seul point d’entrée du Cron)');
    assert(/fetch\s*\(/.test(defaultExport), 'le handler fetch() doit rester exporté');
    // Aucun second ordonnanceur applicatif. On vise le CODE : les commentaires
    // documentent explicitement l'absence de `setInterval`/`setTimeout`.
    assert(!/(?<![\w.])setInterval\s*\(/.test(entrySource), 'aucun appel à setInterval() ne doit exister dans l’entrée Worker');
    assert(!/(?<![\w.])setTimeout\s*\(/.test(entrySource), 'aucun appel à setTimeout() ne doit exister dans l’entrée Worker');
    // Le trigger ne porte aucune logique métier : il n'appelle que le worker existant.
    assert(/runScheduledCycle\s*\(/.test(entrySource), 'le Cron doit appeler runScheduledCycle du worker d’automatisation EXISTANT');
  });

  await check('P0-CLOUDFLARE-PRODUCTION config: R2 (documents) — binding de développement local, production jamais inventée', () => {
    // Profil local : le bucket est celui du SIMULATEUR de `wrangler dev`.
    const devBuckets = activeTables(wrangler)
      .filter(table => table.header === '[[r2_buckets]]')
      .filter(table => table.entries.some(entry => /binding\s*=\s*"DOCUMENTS_BUCKET"/.test(entry)));
    assert(devBuckets.length === 1, 'binding R2 `DOCUMENTS_BUCKET` attendu pour le développement local');
    assert(
      devBuckets[0].entries.some(entry => /bucket_name\s*=\s*"lelabeur-documents-local-simulator"/.test(entry)),
      'le bucket de développement doit rester le simulateur local (jamais un bucket de production)',
    );
    // Le nom lu par le code est bien celui du binding (aucun découplage silencieux).
    assert(/env\.DOCUMENTS_BUCKET/.test(readRepoFile('src/backend/api/entry.ts')), 'la composition doit lire env.DOCUMENTS_BUCKET');
    // Production : aucun bucket déclaré tant qu'aucun bucket réel n'existe, et la
    // marche à suivre est documentée.
    const productionBlock = wrangler.slice(wrangler.indexOf('[env.production]'));
    assert(!/^\s*\[\[env\.production\.r2_buckets\]\]\s*$/m.test(productionBlock), 'production ne doit pas activer un bucket R2 inexistant');
    assert(/npx wrangler r2 bucket create/.test(productionBlock), 'la création du bucket de production doit être documentée');
    assert(/<R2_BUCKET_NAME_PRODUCTION>/.test(productionBlock), 'le nom du bucket de production doit rester un marqueur explicite');
  });

  await check('P0-CLOUDFLARE-PRODUCTION config: aucune ressource Cloudflare inventée dans les lignes ACTIVES', () => {
    for (const table of activeTables(wrangler)) {
      const isProductionBinding = /^\[\[env\.production\.(hyperdrive|r2_buckets|queues)/.test(table.header);
      if (!isProductionBinding) continue;
      const serialized = table.entries.join('\n');
      assert(!UNFILLED_MARKER.test(serialized), `${table.header}: un marqueur non renseigné ne doit jamais être déployé`);
      assert(!serialized.includes(DEV_HYPERDRIVE_PLACEHOLDER), `${table.header}: l’ID placeholder de développement ne doit jamais atteindre la production`);
      assert(!/postgres(ql)?:\/\//i.test(serialized), `${table.header}: aucune chaîne de connexion dans la configuration`);
    }
    // Les commandes d'activation restent documentées (commentaires) pour l'exploitant.
    for (const command of ['npx wrangler hyperdrive create', 'npx wrangler r2 bucket create']) {
      assert(wrangler.includes(command), `commande d’activation documentée attendue: ${command}`);
    }
  });

  await check('P0-CLOUDFLARE-PRODUCTION config: QUEUE — file transactionnelle existante, aucune Cloudflare Queue silencieuse', () => {
    // Décision d'architecture : la file canonique est l'Outbox PostgreSQL
    // (claim, tentatives, retry, DEAD_LETTER, écriture transactionnelle).
    const queueTables = activeTables(wrangler).filter(table => /^\[\[?(env\.production\.)?queues/.test(table.header));
    assert(queueTables.length === 0, 'aucun binding Cloudflare Queue ACTIF : la file canonique est l’Outbox PostgreSQL');
    // Le handler `queue()` d'un consumer Cloudflare Queues ne doit pas exister
    // sans producteur transactionnel (double écrit → divergence).
    const defaultExport = entrySource.slice(entrySource.indexOf('export default {'));
    assert(!/\bqueue\s*\(/.test(defaultExport), 'aucun handler queue() ne doit être exporté par l’entrée Worker (Outbox = file canonique)');
    // La décision et les conditions d'activation future sont documentées.
    assert(/QUEUE \(production\)/.test(wrangler), 'la décision QUEUE doit être documentée dans wrangler.toml');
    assert(
      wrangler.includes('[[env.production.queues.producers]]'),
      'le bloc d’activation future de la Queue doit rester documenté',
    );
    // Les garanties de la file existante sont bien celles du code.
    assert(/FOR UPDATE SKIP LOCKED/.test(readRepoFile('src/backend/automation/worker.ts')), 'claim verrouillé attendu sur la file existante');
  });

  await check('P0-C config: aucun secret PostgreSQL committé, aucune variable de test en production', () => {
    assert(!/postgres(ql)?:\/\//i.test(activeLines(wrangler).join('\n')), 'wrangler.toml ne doit contenir aucune chaîne de connexion active');
    const devVars = readRepoFile('.dev.vars.example');
    // Les lignes commentées sont de la documentation, pas de la configuration active.
    const activeDevVars = devVars.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
    const connectionStrings = [...activeDevVars.matchAll(/postgres(ql)?:\/\/[^\s"']+/gi)].map(match => match[0]);
    assert(connectionStrings.length > 0, 'l’exemple local doit montrer la variable Hyperdrive');
    for (const connectionString of connectionStrings) {
      assert(/@(127\.0\.0\.1|localhost)[:/]/.test(connectionString), 'seul un exemple en boucle locale est admis');
      assert(/sslmode=disable/.test(connectionString), 'l’exemple local doit être explicitement hors TLS');
    }
    for (const file of ['wrangler.toml', '.dev.vars.example']) {
      const content = file === 'wrangler.toml' ? wrangler : devVars;
      assert(!/password\s*=\s*"(?!motdepasse-local)/i.test(content), `${file}: aucun mot de passe réel ne doit être présent`);
    }
    // Aucune variable de vérification locale ne doit être déployée.
    assert(
      !/^\s*TEST_ONLY_GOOGLE_JWKS_URL/m.test(activeLines(wrangler).join('\n')),
      'TEST_ONLY_GOOGLE_JWKS_URL ne doit jamais être déclarée dans la configuration déployée',
    );
    const gitignore = readRepoFile('.gitignore');
    assert(/^\.dev\.vars$/m.test(gitignore) && /^\.dev\.vars\.\*$/m.test(gitignore), '.dev.vars doit être gitignoré');
    assert(/^!\.dev\.vars\.example$/m.test(gitignore), "l'exemple doit rester versionné");
  });

  await check('P0-CLOUDFLARE-PRODUCTION config: scripts de vérification et porte de déploiement', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
    for (const script of ['migrate', 'verify:postgres', 'verify:workerd', 'verify:cloudflare', 'dev:worker', 'deploy:worker']) {
      assert(Boolean(pkg.scripts[script]), `script npm manquant: ${script}`);
    }
    assert(Boolean(pkg.dependencies.pg), 'pg doit être une dépendance de production (runtime Worker)');
    assert(Boolean(pkg.devDependencies['@types/pg']), '@types/pg attendu en dev');
    assert(Boolean(pkg.devDependencies.wrangler), 'wrangler attendu en dev');
    // Garde-fou de déploiement : aucune commande ne déploie sans préflight.
    assert(
      /preflight-cloudflare\.ts --require-production/.test(pkg.scripts['deploy:worker'] ?? ''),
      `${deployScriptGuardedMessage} : ${pkg.scripts['deploy:worker'] ?? '(absent)'}`,
    );
    assert(
      !/--test-scheduled/.test(pkg.scripts['deploy:worker'] ?? ''),
      'la porte de déploiement ne doit jamais activer l’endpoint de test /__scheduled',
    );
    assert(/--test-scheduled/.test(pkg.scripts['dev:worker:scheduled'] ?? ''), 'le test local du Cron doit passer par --test-scheduled (jamais en production)');
    assert(/^(?!.*--remote)/.test(pkg.scripts['dev:worker'] ?? ''), 'le profil de développement reste local (aucun --remote)');
    for (const script of ['preflight-cloudflare.ts', 'verify-workerd-local.ts']) {
      assert(existsSync(resolve(REPO_ROOT, 'scripts', script)), `script attendu: scripts/${script}`);
    }
  });

  await check('P0-C config: le pilote pg est INATTEIGNABLE depuis le bundle navigateur', () => {
    const { files, packages } = collectImportGraph(resolve(REPO_ROOT, 'src', 'main.tsx'));
    assert(files.size > 20, 'le graphe navigateur doit être effectivement parcouru');
    assert(!packages.has('pg'), 'le bundle navigateur ne doit jamais importer pg');
    for (const file of files) {
      assert(!/[\\/]backend[\\/]worker[\\/]/.test(file), `le bundle navigateur ne doit pas atteindre ${file}`);
      assert(!/[\\/]backend[\\/]persistence[\\/]/.test(file), `le bundle navigateur ne doit pas atteindre ${file}`);
      assert(!/[\\/]backend[\\/]api[\\/]entry\.ts$/.test(file), `le bundle navigateur ne doit pas atteindre ${file}`);
    }
  });

  await check('P0-CLOUDFLARE-PRODUCTION config: la documentation d’exploitation couvre R2, Cron, Queue et secrets', () => {
    const runbook = readRepoFile('docs/P0-CLOUDFLARE_PRODUCTION.md');
    for (const topic of ['HYPERDRIVE', 'DOCUMENTS_BUCKET', 'DOCUMENT_URL_SIGNING_SECRET', 'POSTGRES_CONNECTION_STRING', 'triggers', 'automation_outbox']) {
      assert(runbook.includes(topic), `le runbook doit documenter ${topic}`);
    }
    // Les migrations réellement présentes sont celles du manifeste du Worker
    // (`/healthz` compare les deux : toute divergence serait un mensonge).
    const files = readdirSync(resolve(REPO_ROOT, 'migrations')).filter(file => file.endsWith('.sql')).sort();
    const manifest = readRepoFile('src/backend/persistence/migrationManifest.ts');
    for (const file of files) {
      assert(manifest.includes(file.replace(/\.sql$/, '')), `migration absente du manifeste: ${file}`);
    }
  });

  return results;
}
