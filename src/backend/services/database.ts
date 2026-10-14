import type { TransactionBoundary, TransactionContext } from '../productionContracts';

export interface SqlQueryResult<Row> {
  rows: Row[];
  rowCount: number;
}

export interface SqlQueryExecutor {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}

export interface SqlTransaction extends TransactionContext, SqlQueryExecutor {}

/**
 * Server-only PostgreSQL port. The Worker composition receives its driver
 * through this boundary (for example, a client backed by Cloudflare Hyperdrive).
 * No browser package or database credential belongs in this interface.
 */
export interface PostgreSqlDatabase extends TransactionBoundary, SqlQueryExecutor {
  run<T>(operation: (transaction: SqlTransaction) => Promise<T>): Promise<T>;
}

export interface DatabaseHealth {
  reachable: boolean;
  checkedAt: string;
  latencyMs?: number;
  /**
   * Motif d'échec, déjà expurgé de tout secret (voir redactSqlSecrets).
   * Optionnel : `reachable: false` suffit à un consommateur qui n'affiche pas
   * le détail.
   */
  error?: string;
}

export interface DatabaseHealthProbe {
  check(): Promise<DatabaseHealth>;
}
