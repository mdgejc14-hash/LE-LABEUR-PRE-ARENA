/**
 * LE LABEUR — P0-A — ports SQL bas niveau (Worker → Hyperdrive → PostgreSQL).
 *
 * Ce module ne crée AUCUNE connexion et n'importe AUCUN pilote : il décrit
 * uniquement la frontière entre le Worker et un pilote PostgreSQL compatible
 * `pg`. Le pilote réel est injecté par la composition (src/backend/api/entry.ts).
 * Conséquences voulues :
 *  - les adaptateurs sont testables sans base (pilote factice) ;
 *  - aucun secret, aucune dépendance driver et aucun accès réseau n'entrent
 *    dans le bundle navigateur ;
 *  - l'absence de connexion dédiée fait échouer les transactions explicitement
 *    au lieu de produire une sémantique incorrecte.
 */

import type { SqlQueryResult } from '../services/database';

export type { SqlQueryResult };

/** Résultat brut d'un pilote compatible `pg` : `rowCount` peut être nul. */
export interface DriverQueryResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

export interface DriverConnectionLike {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<DriverQueryResult<Row>>;
  release?(): void;
}

export interface DriverPoolLike {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<DriverQueryResult<Row>>;
  /** Optionnel : sans `connect()`, les transactions sont refusées. */
  connect?(): Promise<DriverConnectionLike>;
  end?(): Promise<void>;
}

export interface SqlConnectionHandle {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
  release(): Promise<void>;
}

export interface PostgresClientPort {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
  /** Connexion dédiée : obligatoire pour une transaction réelle (BEGIN/COMMIT sur la même session). */
  acquire(): Promise<SqlConnectionHandle>;
  end?(): Promise<void>;
}

/** Le pilote fourni ne respecte pas le contrat attendu (erreur de câblage, pas erreur métier). */
export class SqlClientContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlClientContractError';
  }
}

function normalizeResult<Row>(result: DriverQueryResult<Row> | undefined, context: string): SqlQueryResult<Row> {
  if (!result || !Array.isArray(result.rows)) {
    throw new SqlClientContractError(`Le pilote PostgreSQL n’a pas retourné de lignes exploitables (${context}).`);
  }
  return {
    rows: result.rows,
    rowCount: typeof result.rowCount === 'number' ? result.rowCount : result.rows.length,
  };
}

/**
 * Adapte un pilote `pg` (Pool ou Client) au port `PostgresClientPort`.
 *
 * `acquire()` exige `connect()` : un pool peut servir des connexions
 * différentes à chaque requête, donc une transaction n'est correcte que sur
 * une connexion explicitement réservée. Sans `connect()`, l'appel échoue
 * (fail-closed) plutôt que d'exécuter BEGIN/COMMIT sur des sessions distinctes.
 */
export function toPostgresClientPort(driver: DriverPoolLike): PostgresClientPort {
  const port: PostgresClientPort = {
    async query(sql, values) {
      return normalizeResult(await driver.query(sql, values), 'query');
    },
    async acquire(): Promise<SqlConnectionHandle> {
      if (typeof driver.connect !== 'function') {
        throw new SqlClientContractError(
          'Le pilote PostgreSQL ne permet pas d’obtenir une connexion dédiée : les transactions sont refusées.',
        );
      }
      const connection = await driver.connect();
      if (!connection || typeof connection.query !== 'function') {
        throw new SqlClientContractError('La connexion PostgreSQL obtenue n’expose pas de méthode query.');
      }
      return {
        async query(sql, values) {
          return normalizeResult(await connection.query(sql, values), 'transaction');
        },
        async release() {
          connection.release?.();
        },
      };
    },
  };
  const end = driver.end;
  if (typeof end === 'function') {
    port.end = async () => {
      await end.call(driver);
    };
  }
  return port;
}

/**
 * Retire tout secret d'un message avant journalisation ou exposition.
 * Utilisé par la sonde de santé et par la traduction d'erreurs PostgreSQL.
 */
export function redactSqlSecrets(message: string, secrets: readonly (string | undefined)[] = []): string {
  let redacted = message;
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    redacted = redacted.split(secret).join('[secret-redacted]');
  }
  return redacted
    .replace(/postgres(?:ql)?:\/\/[^\s@]*@/gi, 'postgresql://[redacted]@')
    .replace(/password\s*=\s*\S+/gi, 'password=[redacted]');
}

/** Code d'erreur PostgreSQL (`23505`, `23503`, `23514`, `57014`…) s'il existe. */
export function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}
