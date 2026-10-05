/**
 * LE LABEUR — P0-C — état réel des migrations, lisible par le Worker.
 *
 * Lecture seule de `schema_migrations`. Aucune supposition : si la table est
 * absente (migrations jamais appliquées) ou si la base est injoignable, l'état
 * reste `unknown` avec un motif constant — jamais un texte d'erreur brut qui
 * pourrait contenir un hôte ou une chaîne de connexion.
 */

import type { MigrationState } from '../api/health';
import type { SqlQueryExecutor } from '../services/database';
import { EXPECTED_MIGRATION_IDS, SCHEMA_MIGRATIONS_TABLE } from './migrationManifest';

export async function readMigrationState(db: SqlQueryExecutor): Promise<MigrationState> {
  try {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY id ASC`,
    );
    const applied = result.rows.map(row => String(row.id));
    const pending = EXPECTED_MIGRATION_IDS.filter(id => !applied.includes(id));
    return {
      status: pending.length === 0 ? 'applied' : 'pending',
      applied,
      pending,
    };
  } catch {
    return {
      status: 'unknown',
      applied: [],
      pending: [],
      detail: `Table ${SCHEMA_MIGRATIONS_TABLE} illisible : migrations non appliquées ou base injoignable.`,
    };
  }
}
