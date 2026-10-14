/**
 * LE LABEUR — P0-C — application réelle des migrations PostgreSQL.
 *
 * Utilisation (aucune valeur secrète en ligne de commande) :
 *
 *   MIGRATION_DATABASE_URL="postgresql://…" npm run migrate -- --status
 *   MIGRATION_DATABASE_URL="postgresql://…" npm run migrate
 *   MIGRATION_DATABASE_URL="postgresql://…" npm run migrate -- --dry-run
 *
 * La chaîne de connexion provient exclusivement de l'environnement
 * (`MIGRATION_DATABASE_URL`, `DATABASE_URL` ou `POSTGRES_CONNECTION_STRING`) :
 * elle n'est jamais imprimée, jamais journalisée, jamais committée.
 */

import { Pool } from 'pg';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describePostgresTarget, resolvePostgresTarget } from '../src/backend/persistence/config';
import {
  applyMigrations,
  loadMigrations,
  migrationStatus,
} from '../src/backend/persistence/migrationRunner';
import { redactSqlSecrets, toPostgresClientPort } from '../src/backend/persistence/sqlClient';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

function connectionStringFromEnvironment(): string | undefined {
  return (
    process.env.MIGRATION_DATABASE_URL?.trim()
    || process.env.DATABASE_URL?.trim()
    || process.env.POSTGRES_CONNECTION_STRING?.trim()
    || undefined
  );
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const connectionString = connectionStringFromEnvironment();
  if (!connectionString) {
    console.error(
      'Aucune chaîne de connexion fournie. Définir MIGRATION_DATABASE_URL (ou DATABASE_URL / POSTGRES_CONNECTION_STRING).',
    );
    process.exitCode = 2;
    return;
  }

  const target = resolvePostgresTarget({ PERSISTENCE: 'postgres', POSTGRES_CONNECTION_STRING: connectionString });
  if (!target.ok) {
    console.error(`Configuration PostgreSQL refusée: ${target.reason}`);
    process.exitCode = 2;
    return;
  }

  const descriptor = describePostgresTarget(target.target);
  console.log(`Cible (sans secret): ${descriptor.host}:${descriptor.port}/${descriptor.database} (source=${descriptor.source})`);

  const migrations = loadMigrations(MIGRATIONS_DIR);
  console.log(`Migrations attendues: ${migrations.map(migration => migration.id).join(', ')}`);

  const pool = new Pool({
    connectionString: target.target.connectionString,
    max: Math.min(target.target.poolMax, 5),
    application_name: `${target.target.applicationName}-migrate`,
  });
  const client = toPostgresClientPort(pool);

  try {
    if (args.has('--status') || args.has('--dry-run')) {
      const status = await migrationStatus(client, migrations);
      console.log(`Appliquées: ${status.applied.join(', ') || '(aucune)'}`);
      console.log(`En attente: ${status.pending.join(', ') || '(aucune)'}`);
      if (args.has('--dry-run') && status.pending.length > 0) {
        console.log('Mode --dry-run : aucune migration appliquée.');
      }
      return;
    }

    const result = await applyMigrations(
      client,
      migrations,
      { statementTimeoutMs: target.target.statementTimeoutMs, onProgress: message => console.log(message) },
      [target.target.connectionString],
    );
    const status = await migrationStatus(client, migrations);
    console.log(`Appliquées maintenant: ${result.applied.join(', ') || '(aucune)'}`);
    console.log(`Déjà appliquées: ${result.skipped.join(', ') || '(aucune)'}`);
    console.log(`État final: applied=[${status.applied.join(', ')}] pending=[${status.pending.join(', ')}]`);
    if (status.pending.length > 0) {
      console.error('Des migrations restent en attente : état incohérent.');
      process.exitCode = 1;
    }
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    console.error(`Échec des migrations: ${redactSqlSecrets(message, [target.target.connectionString])}`);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

void main();
