/**
 * LE LABEUR — P0-C — runner de migrations réel (hors bundle Worker).
 *
 * Objectifs :
 *  - appliquer `migrations/0001…0003` dans l'ordre sur une base PostgreSQL
 *    réelle, sans modifier les fichiers SQL existants ;
 *  - enregistrer chaque migration dans `schema_migrations` DANS LA MÊME
 *    transaction que la migration elle-même (application + trace atomiques) ;
 *  - être idempotent : une migration déjà appliquée n'est jamais rejouée, et
 *    toute divergence de checksum est refusée (pas de relecture silencieuse) ;
 *  - n'exposer aucun secret : les erreurs sont expurgées avant d'être levées ;
 *  - P0-CLOUDFLARE-PRODUCTION — sérialiser DEUX exécutions concurrentes (deux
 *    opérateurs, une CI et un poste) par un verrou consultatif de session
 *    PostgreSQL : le second exécutant attend, constate les migrations déjà
 *    tracées et ne rejoue rien. Le verrou est libéré dans tous les cas.
 *
 * Les fichiers SQL fournis contiennent leur propre enveloppe `BEGIN;`/`COMMIT;`.
 * Le runner refuse une enveloppe absente, multiple ou mal placée, puis exécute
 * le corps dans un lot unique `BEGIN; … INSERT schema_migrations …; COMMIT;`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { redactSqlSecrets, type PostgresClientPort, type SqlConnectionHandle } from './sqlClient';
import { SCHEMA_MIGRATIONS_DDL, SCHEMA_MIGRATIONS_TABLE } from './migrationManifest';

export const MIGRATION_ID_PATTERN = /^[0-9]{4}_[a-z0-9_]+$/;

/**
 * Verrou consultatif de session (constante, jamais une valeur libre) : une
 * seule exécution de migrations à la fois sur une base donnée. Il protège
 * l'UNIQUE table de suivi `schema_migrations` — il ne crée ni verrou applicatif
 * métier, ni table, ni mécanisme concurrent parallèle.
 */
export const MIGRATION_ADVISORY_LOCK_KEY = 741852963;

export interface MigrationFile {
  /** Identifiant stable, dérivé du nom de fichier sans extension. */
  id: string;
  file: string;
  sql: string;
  /** SHA-256 hexadécimal du contenu du fichier. */
  checksum: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function migrationIdFromFile(file: string): string {
  const id = file.replace(/\.sql$/i, '');
  if (!MIGRATION_ID_PATTERN.test(id)) {
    throw new MigrationError(`Nom de migration invalide: ${file}`);
  }
  return id;
}

/** Charge les migrations d'un répertoire, triées par nom (ordre d'application). */
export function loadMigrations(directory: string): MigrationFile[] {
  const migrations = readdirSync(resolve(directory))
    .filter(file => file.toLowerCase().endsWith('.sql'))
    .sort()
    .map(file => {
      const sql = readFileSync(resolve(directory, file), 'utf8');
      return { id: migrationIdFromFile(file), file, sql, checksum: sha256Hex(sql) };
    });
  if (migrations.length === 0) {
    throw new MigrationError(`Aucune migration SQL trouvée dans ${directory}.`);
  }
  return migrations;
}

const BEGIN_LINE = /^\s*BEGIN\s*;\s*$/i;
const COMMIT_LINE = /^\s*COMMIT\s*;\s*$/i;

/**
 * Retire l'enveloppe transactionnelle unique du fichier. Refuse tout fichier
 * dont la structure n'est pas exactement `BEGIN; … COMMIT;`.
 */
export function stripTransactionEnvelope(sql: string): string {
  const lines = sql.split(/\r?\n/);
  const beginIndexes = lines.reduce<number[]>((acc, line, index) => (BEGIN_LINE.test(line) ? [...acc, index] : acc), []);
  const commitIndexes = lines.reduce<number[]>((acc, line, index) => (COMMIT_LINE.test(line) ? [...acc, index] : acc), []);
  if (beginIndexes.length !== 1 || commitIndexes.length !== 1) {
    throw new MigrationError(
      `Enveloppe transactionnelle invalide: ${beginIndexes.length} BEGIN et ${commitIndexes.length} COMMIT détectés.`,
    );
  }
  const [beginIndex] = beginIndexes;
  const [commitIndex] = commitIndexes;
  if (commitIndex < beginIndex) {
    throw new MigrationError('Enveloppe transactionnelle invalide: COMMIT avant BEGIN.');
  }
  const beforeBegin = lines.slice(0, beginIndex).join('\n');
  if (beforeBegin.split('\n').some(line => line.trim().length > 0 && !line.trim().startsWith('--'))) {
    throw new MigrationError('Enveloppe transactionnelle invalide: du SQL précède le BEGIN.');
  }
  const afterCommit = lines.slice(commitIndex + 1).join('\n');
  if (afterCommit.split('\n').some(line => line.trim().length > 0 && !line.trim().startsWith('--'))) {
    throw new MigrationError('Enveloppe transactionnelle invalide: du SQL suit le COMMIT.');
  }
  return lines.slice(beginIndex + 1, commitIndex).join('\n');
}

export interface MigrationBatch {
  sql: string;
  id: string;
  checksum: string;
}

/**
 * Construit le lot atomique d'application. `id` et `checksum` sont validés par
 * construction (`MIGRATION_ID_PATTERN`, SHA-256 hexadécimal) : aucune valeur
 * libre n'est interpolée dans le SQL.
 */
export function buildMigrationBatch(migration: MigrationFile, statementTimeoutMs?: number): MigrationBatch {
  if (!MIGRATION_ID_PATTERN.test(migration.id)) {
    throw new MigrationError(`Identifiant de migration invalide: ${migration.id}`);
  }
  if (!/^[0-9a-f]{64}$/.test(migration.checksum)) {
    throw new MigrationError('Checksum de migration invalide.');
  }
  const body = stripTransactionEnvelope(migration.sql);
  const timeout = typeof statementTimeoutMs === 'number' ? `SET LOCAL statement_timeout = ${statementTimeoutMs};\n` : '';
  const record =
    `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (id, checksum, applied_at, duration_ms) ` +
    `VALUES ('${migration.id}', '${migration.checksum}', now(), 0)`;
  return {
    id: migration.id,
    checksum: migration.checksum,
    sql: `BEGIN;\n${timeout}${body}\n${record};\nCOMMIT;\n`,
  };
}

export interface ApplyMigrationsOptions {
  statementTimeoutMs?: number;
  onProgress?: (message: string) => void;
}

export interface ApplyMigrationsResult {
  applied: string[];
  skipped: string[];
}

/** Panne de migration : message déjà expurgé des secrets de connexion. */
function migrationFailure(error: unknown, secrets: readonly (string | undefined)[]): MigrationError {
  const message = String((error as Error)?.message ?? error);
  return new MigrationError(redactSqlSecrets(message, secrets));
}

/**
 * Applique les migrations sur une connexion PostgreSQL réelle.
 * `secrets` sert uniquement à expurger les erreurs remontées.
 */
export async function applyMigrations(
  client: PostgresClientPort,
  migrations: readonly MigrationFile[],
  options: ApplyMigrationsOptions = {},
  secrets: readonly (string | undefined)[] = [],
): Promise<ApplyMigrationsResult> {
  const applied: string[] = [];
  const skipped: string[] = [];
  // UNE connexion dédiée pour toute l'exécution : la table de suivi, les lots
  // transactionnels et le verrou consultatif vivent sur la MÊME session.
  let handle: SqlConnectionHandle | undefined;
  let locked = false;

  try {
    try {
      handle = await client.acquire();
      await handle.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
      locked = true;
      await handle.query(SCHEMA_MIGRATIONS_DDL);
    } catch (error) {
      throw migrationFailure(error, secrets);
    }

    for (const migration of migrations) {
      let existing: string | null = null;
      try {
        const result = await handle.query<{ checksum: string }>(
          `SELECT checksum FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE id = $1`,
          [migration.id],
        );
        existing = result.rows[0]?.checksum ?? null;
      } catch (error) {
        throw migrationFailure(error, secrets);
      }

      if (existing !== null) {
        if (existing !== migration.checksum) {
          throw new MigrationError(
            `Checksum divergent pour ${migration.id}: la migration a été modifiée après application.`,
          );
        }
        skipped.push(migration.id);
        options.onProgress?.(`= ${migration.id} (déjà appliquée)`);
        continue;
      }

      const batch = buildMigrationBatch(migration, options.statementTimeoutMs);
      const startedAt = Date.now();
      try {
        await handle.query(batch.sql);
      } catch (error) {
        throw migrationFailure(error, secrets);
      }

      try {
        await handle.query(
          `UPDATE ${SCHEMA_MIGRATIONS_TABLE} SET duration_ms = $1 WHERE id = $2 AND duration_ms = 0`,
          [Date.now() - startedAt, migration.id],
        );
      } catch {
        // La migration est appliquée et tracée; la durée est un confort d'exploitation.
      }

      applied.push(migration.id);
      options.onProgress?.(`+ ${migration.id} appliquée`);
    }
  } finally {
    // Un lot interrompu laisse la session en transaction avortée : le ROLLBACK
    // garantit que la libération du verrou aboutit, sans masquer l'erreur
    // d'origine (déjà levée par l'appelant).
    try {
      if (handle && locked) await handle.query('ROLLBACK');
    } catch {
      // Aucune transaction ouverte : rien à annuler.
    }
    try {
      if (handle && locked) await handle.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    } catch {
      // La fermeture de la session libère le verrou de toute façon.
    }
    try {
      await handle?.release();
    } catch {
      // Libération best-effort : l'erreur d'origine reste prioritaire.
    }
  }

  return { applied, skipped };
}

/** Liste l'état appliqué/en attente sans rien modifier. */
export async function migrationStatus(
  client: PostgresClientPort,
  migrations: readonly MigrationFile[],
): Promise<{ applied: string[]; pending: string[] }> {
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY id ASC`,
    );
    const applied = result.rows.map(row => String(row.id));
    return { applied, pending: migrations.map(migration => migration.id).filter(id => !applied.includes(id)) };
  } catch {
    return { applied: [], pending: migrations.map(migration => migration.id) };
  }
}
