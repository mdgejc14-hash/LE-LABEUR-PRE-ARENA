/**
 * LE LABEUR — P0-A — adaptateur PostgreSQL.
 *
 * Implémente les ports EXISTANTS (`PostgreSqlDatabase`, `DatabaseHealthProbe`)
 * au-dessus du port client `PostgresClientPort`. Aucune connexion n'est ouverte
 * ici : le pilote (Hyperdrive + `pg`) est injecté par la composition.
 *
 * Garanties :
 *  - transactions réelles sur une connexion dédiée (BEGIN / COMMIT / ROLLBACK) ;
 *  - `statement_timeout` et `application_name` validés par construction, donc
 *    injectables sans interpolation libre ;
 *  - toute erreur exposée est expurgée des secrets de connexion.
 */

import type {
  DatabaseHealth,
  DatabaseHealthProbe,
  PostgreSqlDatabase,
  SqlQueryResult,
  SqlTransaction,
} from '../services/database';
import { redactSqlSecrets, type PostgresClientPort } from './sqlClient';

export const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;
export const MIN_STATEMENT_TIMEOUT_MS = 100;
export const MAX_STATEMENT_TIMEOUT_MS = 120_000;
export const DEFAULT_APPLICATION_NAME = 'lelabeur-worker';

/** Nom d'application PostgreSQL restreint : aucune valeur libre n'est injectée. */
export const APPLICATION_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export interface PostgresDatabaseOptions {
  /** Durée maximale d'une requête (100..120000 ms). Défaut : 15000. */
  statementTimeoutMs?: number;
  /** Identifiant visible dans `pg_stat_activity`. Défaut : `lelabeur-worker`. */
  applicationName?: string;
  /** Secrets à expurger des erreurs exposées (jamais journalisés en clair). */
  redactSecrets?: readonly (string | undefined)[];
}

interface ResolvedPostgresDatabaseOptions {
  statementTimeoutMs: number;
  applicationName: string;
  redactSecrets: readonly (string | undefined)[];
}

function resolveOptions(options: PostgresDatabaseOptions): ResolvedPostgresDatabaseOptions {
  const statementTimeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < MIN_STATEMENT_TIMEOUT_MS || statementTimeoutMs > MAX_STATEMENT_TIMEOUT_MS) {
    throw new Error(
      `statementTimeoutMs doit être un entier entre ${MIN_STATEMENT_TIMEOUT_MS} et ${MAX_STATEMENT_TIMEOUT_MS} ms.`,
    );
  }
  const applicationName = options.applicationName ?? DEFAULT_APPLICATION_NAME;
  if (!APPLICATION_NAME_PATTERN.test(applicationName)) {
    throw new Error('applicationName doit respecter ^[a-z][a-z0-9_-]{0,31}$.');
  }
  return { statementTimeoutMs, applicationName, redactSecrets: options.redactSecrets ?? [] };
}

function newTransactionId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `tx_${cryptoApi.randomUUID()}`;
  return `tx_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Construit l'implémentation `PostgreSqlDatabase` + sonde de santé.
 *
 * Le timeout et le nom d'application sont posés avec `SET LOCAL` : ils ne
 * s'appliquent qu'à la transaction courante et ne fuient pas vers la connexion
 * suivante du pool.
 */
export function createPostgresDatabase(
  client: PostgresClientPort,
  options: PostgresDatabaseOptions = {},
): PostgreSqlDatabase & DatabaseHealthProbe {
  const resolved = resolveOptions(options);

  return {
    async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>> {
      return client.query<Row>(sql, values);
    },

    async run<T>(operation: (transaction: SqlTransaction) => Promise<T>): Promise<T> {
      // Chaque appel réserve sa propre connexion. Un verrou global ici ferait
      // échouer les requêtes HTTP simultanées pourtant indépendantes.
      const connection = await client.acquire();
      try {
        await connection.query('BEGIN');
        await connection.query(`SET LOCAL statement_timeout = ${resolved.statementTimeoutMs}`);
        await connection.query(`SET LOCAL application_name = '${resolved.applicationName}'`);
        // Le contexte expose la MÊME connexion : toutes les requêtes atomiques
        // doivent passer par ce transaction handle, pas par la base racine.
        const transaction: SqlTransaction = {
          transactionId: newTransactionId(),
          query: (sql, values) => connection.query(sql, values),
        };
        const result = await operation(transaction);
        await connection.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await connection.query('ROLLBACK');
        } catch {
          // Le rollback ne doit jamais masquer l'erreur d'origine.
        }
        throw error;
      } finally {
        try {
          await connection.release();
        } catch {
          // Libération best-effort : la connexion reste comptabilisée par le pool.
        }
      }
    },

    async check(): Promise<DatabaseHealth> {
      const startedAt = Date.now();
      const checkedAt = new Date().toISOString();
      try {
        await client.query('SELECT 1');
        return { reachable: true, checkedAt, latencyMs: Date.now() - startedAt };
      } catch (error) {
        const message = String((error as Error)?.message ?? error);
        return {
          reachable: false,
          checkedAt,
          latencyMs: Date.now() - startedAt,
          error: redactSqlSecrets(message, resolved.redactSecrets),
        };
      }
    },
  };
}
