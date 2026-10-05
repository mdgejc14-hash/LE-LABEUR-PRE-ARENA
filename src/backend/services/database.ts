import type { TransactionBoundary, TransactionContext } from '../productionContracts';

export interface SqlQueryResult<Row> {
  rows: Row[];
  rowCount: number;
}

export interface SqlTransaction extends TransactionContext {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}

/**
 * Server-only PostgreSQL port. A future Cloudflare adapter will obtain a
 * connection through Hyperdrive. No browser package or DB credential belongs
 * in this interface, and no implementation is installed in Phase 1.
 */
export interface PostgreSqlDatabase extends TransactionBoundary {
  run<T>(operation: (transaction: SqlTransaction) => Promise<T>): Promise<T>;
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
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
