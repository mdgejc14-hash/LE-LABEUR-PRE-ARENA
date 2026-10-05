/**
 * LE LABEUR — P0-C — client PostgreSQL réel du Worker (`pg` + Hyperdrive).
 *
 * Ce module est le SEUL point du dépôt qui importe un pilote PostgreSQL. Il
 * n'est atteignable que depuis `src/backend/worker/cloudflareEntry.ts`, jamais
 * depuis le bundle navigateur (un test d'isolation le vérifie).
 *
 * Contraintes appliquées (documentation Cloudflare Hyperdrive) :
 *  - `nodejs_compat` active `node:net`/`node:tls`, requis par `pg` ;
 *  - le pool local reste petit (`DB_POOL_MAX`, plafonné à 5) : Hyperdrive est
 *    le pool réel côté edge ;
 *  - les transactions passent par une connexion dédiée (`pool.connect()`), donc
 *    `SET LOCAL` s'applique à la transaction Hyperdrive courante ;
 *  - la chaîne de connexion n'est jamais journalisée ni sérialisée.
 */

import { Pool } from 'pg';

import type { ResolvedPostgresTarget } from '../persistence/config';
import { toPostgresClientPort, type PostgresClientPort } from '../persistence/sqlClient';

/** Limite Workers documentée : au-delà, les connexions parallèles sont refusées. */
export const MAX_WORKER_DB_CONNECTIONS = 5;

export interface WorkerPostgresClient {
  client: PostgresClientPort;
  /** Ferme le pool local (l'Hyperdrive distant n'est pas affecté par ce pool). */
  end(): Promise<void>;
}

export interface WorkerPgClientOptions {
  maxConnections?: number;
}

/**
 * Construit le pool `pg` à partir de la cible réellement résolue
 * (binding Hyperdrive, ou secret de repli `POSTGRES_CONNECTION_STRING`).
 */
export function createWorkerPostgresClient(
  target: ResolvedPostgresTarget,
  options: WorkerPgClientOptions = {},
): WorkerPostgresClient {
  const requested = options.maxConnections ?? target.poolMax;
  const max = Math.max(1, Math.min(requested, MAX_WORKER_DB_CONNECTIONS));
  const pool = new Pool({
    connectionString: target.connectionString,
    max,
    application_name: target.applicationName,
    // Un isolate Workers peut être recyclé : le pool ne doit pas retenir le processus.
    allowExitOnIdle: true,
  });
  return {
    client: toPostgresClientPort(pool),
    async end() {
      try {
        await pool.end();
      } catch {
        // Fermeture best-effort : aucune donnée de connexion ne doit être exposée.
      }
    },
  };
}
