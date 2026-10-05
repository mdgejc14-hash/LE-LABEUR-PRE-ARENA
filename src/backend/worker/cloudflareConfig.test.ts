/**
 * LE LABEUR — P0-C — tests de contrat de la configuration Cloudflare.
 *
 * Ces tests ne contactent AUCUN service Cloudflare : ils vérifient que la
 * configuration préparée est cohérente, fail-closed, et qu'aucun secret n'entre
 * dans le dépôt. Ils garantissent aussi l'isolation du pilote `pg` hors du
 * bundle navigateur.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CloudflareConfigTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepoFile(relativePath: string): string {
  const absolute = resolve(REPO_ROOT, relativePath);
  assert(existsSync(absolute), `fichier manquant: ${relativePath}`);
  return readFileSync(absolute, 'utf8');
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
  // Seules les lignes actives comptent : les commentaires portent la documentation
  // des commandes `wrangler hyperdrive create` (jamais une configuration réelle).
  const activeWrangler = wrangler.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');

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
    assert(/\[\[hyperdrive\]\]/.test(wrangler), 'binding hyperdrive attendu');
    assert(/binding\s*=\s*"HYPERDRIVE"/.test(wrangler), 'nom de binding HYPERDRIVE attendu');
    assert(/CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE/.test(readRepoFile('.dev.vars.example')), 'développement local documenté via la variable Hyperdrive standard');
    assert(/\[env\.production\]/.test(wrangler), 'profil production explicite attendu');
    assert(/\[env\.production\.vars\]/.test(wrangler), 'les vars ne sont pas héritées : production doit les redéclarer');
    assert(/WORKER_ENV\s*=\s*"production"/.test(wrangler), 'WORKER_ENV=production attendu');
    assert(/WORKER_ENV\s*=\s*"development"/.test(wrangler), 'WORKER_ENV=development attendu');
    // Les bindings ne sont pas hérités : le placeholder de développement ne doit pas
    // être réutilisé tel quel en production.
    const productionBlock = wrangler.slice(wrangler.indexOf('[env.production]'));
    assert(!/^\s*\[\[env\.production\.hyperdrive\]\]/m.test(productionBlock), 'production ne doit pas activer un Hyperdrive inexistant');
    assert(/npx wrangler hyperdrive create/.test(productionBlock), 'la création du Hyperdrive de production doit être documentée');
    // Hors périmètre P0-C.
    for (const forbidden of ['r2_buckets', 'queues', 'durable_objects', 'kv_namespaces', 'triggers = ', 'scheduled']) {
      assert(!activeWrangler.toLowerCase().includes(forbidden), `P0-C ne doit déclarer aucun ${forbidden}`);
    }
  });

  await check('P0-C config: aucun secret PostgreSQL committé', () => {
    assert(!/postgres(ql)?:\/\//i.test(activeWrangler), 'wrangler.toml ne doit contenir aucune chaîne de connexion active');
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
    const gitignore = readRepoFile('.gitignore');
    assert(/^\.dev\.vars$/m.test(gitignore) && /^\.dev\.vars\.\*$/m.test(gitignore), '.dev.vars doit être gitignoré');
    assert(/^!\.dev\.vars\.example$/m.test(gitignore), "l'exemple doit rester versionné");
  });

  await check('P0-C config: scripts npm de migration/vérification présents', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
    for (const script of ['migrate', 'verify:postgres', 'dev:worker']) {
      assert(Boolean(pkg.scripts[script]), `script npm manquant: ${script}`);
    }
    assert(Boolean(pkg.dependencies.pg), 'pg doit être une dépendance de production (runtime Worker)');
    assert(Boolean(pkg.devDependencies['@types/pg']), '@types/pg attendu en dev');
    assert(Boolean(pkg.devDependencies.wrangler), 'wrangler attendu en dev');
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

  return results;
}
