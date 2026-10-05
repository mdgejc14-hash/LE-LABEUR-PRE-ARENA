/**
 * LE LABEUR — P0-C — tests déterministes du runner de migrations.
 *
 * Le moteur utilisé ici est PGlite (PostgreSQL en WASM) : ces tests valident la
 * LOGIQUE du runner (ordre, trace, idempotence, checksum), pas une ressource
 * distante. L'application réelle sur PostgreSQL 17.10 est vérifiée par
 * `scripts/verify-postgres-e2e.ts` (`npm run verify:postgres`).
 */

import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXPECTED_MIGRATION_IDS } from './migrationManifest';
import {
  MigrationError,
  applyMigrations,
  buildMigrationBatch,
  loadMigrations,
  sha256Hex,
  stripTransactionEnvelope,
} from './migrationRunner';
import { toPostgresClientPort, type DriverPoolLike, type DriverQueryOutcome, type DriverQueryResult } from './sqlClient';

export interface MigrationRunnerTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** PGlite n'accepte qu'une instruction par `query` : le lot transactionnel passe par `exec`. */
function createPGliteDriver(database: PGlite): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<Row>> => {
    const statements = sql.split(';').filter(part => part.trim().length > 0);
    if (values.length === 0 && statements.length > 1) {
      await database.exec(sql);
      return { rows: [], rowCount: 0 };
    }
    const result = await database.query<Row>(sql, [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  };
  return { query, async connect() { return { query, release() {} }; } };
}

export async function runMigrationRunnerTests(): Promise<MigrationRunnerTestResult[]> {
  const results: MigrationRunnerTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('P0-C migrations: le manifeste attendu correspond exactement aux fichiers réels', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    assert(
      JSON.stringify(migrations.map(migration => migration.id)) === JSON.stringify(EXPECTED_MIGRATION_IDS),
      `manifeste désaligné: ${migrations.map(migration => migration.id).join(', ')}`,
    );
    for (const migration of migrations) {
      assert(/^[0-9a-f]{64}$/.test(migration.checksum), 'checksum SHA-256 attendu');
      assert(migration.checksum === sha256Hex(migration.sql), 'checksum non calculé sur le contenu réel');
    }
  });

  await check('P0-C migrations: l’enveloppe transactionnelle est validée, jamais supposée', () => {
    assert(stripTransactionEnvelope('BEGIN;\nSELECT 1;\nCOMMIT;\n').trim() === 'SELECT 1;', 'corps attendu');
    assert(stripTransactionEnvelope('-- c\nBEGIN;\nSELECT 1;\nCOMMIT;\n-- fin\n').trim() === 'SELECT 1;', 'commentaires tolérés');
    const invalid: Array<[string, string]> = [
      ['SELECT 1;', 'sans enveloppe'],
      ['BEGIN;\nBEGIN;\nSELECT 1;\nCOMMIT;', 'BEGIN multiple'],
      ['BEGIN;\nSELECT 1;\nCOMMIT;\nSELECT 2;', 'SQL après COMMIT'],
      ['SELECT 0;\nBEGIN;\nSELECT 1;\nCOMMIT;', 'SQL avant BEGIN'],
    ];
    for (const [sql, label] of invalid) {
      let failed = false;
      try {
        stripTransactionEnvelope(sql);
      } catch (error) {
        failed = error instanceof MigrationError;
      }
      assert(failed, `enveloppe invalide acceptée (${label})`);
    }
    let batchFailed = false;
    try {
      buildMigrationBatch({ id: '0001_x', file: '0001_x.sql', sql: 'SELECT 1;', checksum: 'a'.repeat(64) });
    } catch {
      batchFailed = true;
    }
    assert(batchFailed, 'un fichier sans enveloppe ne doit pas produire de lot');
  });

  await check('P0-C migrations: l’adaptateur agrège un résultat pg multi-instructions', async () => {
    // node-postgres renvoie un tableau de résultats pour `BEGIN; …; COMMIT;`.
    const driver: DriverPoolLike = {
      async query<Row = Record<string, unknown>>(): Promise<DriverQueryOutcome<Row>> {
        const parts: DriverQueryResult<Row>[] = [
          { rows: [], rowCount: null },
          { rows: [{ id: '0001' }] as unknown as Row[], rowCount: 1 },
          { rows: [], rowCount: 1 },
        ];
        return parts;
      },
    };
    const port = toPostgresClientPort(driver);
    const aggregated = await port.query<{ id: string }>('BEGIN; SELECT 1; COMMIT;');
    assert(aggregated.rows.length === 1 && aggregated.rows[0].id === '0001', 'les lignes doivent être agrégées');
    assert(aggregated.rowCount === 2, `rowCount agrégé attendu, reçu ${aggregated.rowCount}`);
  });

  const pg = new PGlite();
  const client = toPostgresClientPort(createPGliteDriver(pg));
  const migrations = loadMigrations(MIGRATIONS_DIR);

  try {
    await check('P0-C migrations: application réelle 0001→0005 puis idempotence', async () => {
      const first = await applyMigrations(client, migrations);
      assert(first.applied.length === migrations.length, `toutes les migrations doivent être appliquées (reçu ${first.applied.length})`);
      assert(first.skipped.length === 0, 'aucune migration déjà appliquée au premier passage');

      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      const names = tables.rows.map(row => row.table_name);
      for (const expected of ['users', 'external_identities', 'sessions', 'permissions', 'role_permissions', 'user_permissions', 'offers', 'applications', 'contracts', 'schema_migrations']) {
        assert(names.includes(expected), `table absente après migration: ${expected}`);
      }

      const recorded = await client.query<{ id: string; checksum: string; duration_ms: number }>(
        'SELECT id, checksum, duration_ms FROM schema_migrations ORDER BY id ASC',
      );
      assert(recorded.rows.length === migrations.length, 'une trace par migration attendue');
      for (const migration of migrations) {
        const row = recorded.rows.find(candidate => candidate.id === migration.id);
        assert(row?.checksum === migration.checksum, `trace manquante ou divergente: ${migration.id}`);
      }

      const seeded = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM role_permissions WHERE role = 'ADMIN'`,
      );
      assert(Number(seeded.rows[0]?.count ?? 0) > 0, 'le seed 0002 doit être appliqué (permissions ADMIN)');

      const second = await applyMigrations(client, migrations);
      assert(second.applied.length === 0, 'aucune migration ne doit être rejouée');
      assert(second.skipped.length === migrations.length, 'toutes les migrations doivent être ignorées');
    });

    await check('P0-C migrations: un fichier modifié après application est refusé (checksum)', async () => {
      const directory = mkdtempSync(resolve(tmpdir(), 'lelabeur-migrations-'));
      try {
        const first = migrations[0];
        writeFileSync(resolve(directory, first.file), `${first.sql}\n-- modification interdite après application\n`);
        for (const migration of migrations.slice(1)) {
          writeFileSync(resolve(directory, migration.file), readFileSync(resolve(MIGRATIONS_DIR, migration.file)));
        }
        const tampered = loadMigrations(directory);
        let message = '';
        try {
          await applyMigrations(client, tampered);
        } catch (error) {
          message = String((error as Error)?.message ?? error);
        }
        assert(/divergent/i.test(message), `divergence de checksum attendue, reçu: ${message || '(aucune erreur)'}`);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  } finally {
    await pg.close();
  }

  return results;
}
