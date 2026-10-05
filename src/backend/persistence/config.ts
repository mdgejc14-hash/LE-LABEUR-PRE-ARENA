/**
 * LE LABEUR — P0-A — configuration Worker → PostgreSQL / Hyperdrive.
 *
 * Ce module ne se connecte à rien : il lit l'environnement du Worker et
 * produit une DÉCISION explicite. Règles :
 *  - aucun défaut implicite : sans configuration, la persistance reste fermée ;
 *  - jamais de retombée silencieuse vers la mémoire quand PostgreSQL est
 *    demandé mais indisponible (`misconfigured`) ;
 *  - le secret de connexion n'est jamais journalisé, sérialisé ni renvoyé :
 *    seul un descripteur sûr (hôte, base, options) est exposé.
 */

import {
  APPLICATION_NAME_PATTERN,
  DEFAULT_APPLICATION_NAME,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  MAX_STATEMENT_TIMEOUT_MS,
  MIN_STATEMENT_TIMEOUT_MS,
} from './postgresDatabase';

export type PersistenceMode = 'closed' | 'memory' | 'postgres';

export type PersistenceReason =
  | 'not-configured'
  | 'explicitly-closed'
  | 'explicit-memory-store'
  | 'injected-database'
  | 'hyperdrive-binding'
  | 'connection-string'
  | 'invalid-persistence-mode'
  | 'missing-sql-client'
  | 'missing-hyperdrive-binding'
  | 'invalid-connection-string'
  | 'unsupported-connection-scheme'
  | 'placeholder-connection-string'
  | 'invalid-pool-max'
  | 'invalid-statement-timeout'
  | 'invalid-application-name';

export interface PersistenceDecision {
  /** Mode effectif de la composition : 'misconfigured' n'ouvre jamais l'API. */
  kind: 'closed' | 'memory' | 'postgres' | 'misconfigured';
  reason: PersistenceReason;
}

/** Binding Hyperdrive tel qu'exposé par Cloudflare (`env.HYPERDRIVE.connectionString`). */
export interface HyperdriveBinding {
  connectionString?: string;
}

/** Sous-ensemble d'environnement Worker reconnu par la persistance. */
export interface WorkerPersistenceEnvironment {
  /** 'closed' | 'memory' | 'postgres' — absent = fermé. */
  PERSISTENCE?: string;
  /** Alias historique conservé : 'memory' | 'postgres'. */
  IDENTITY_STORE?: string;
  HYPERDRIVE?: HyperdriveBinding;
  /** Secret de repli si aucun binding Hyperdrive n'est disponible. */
  POSTGRES_CONNECTION_STRING?: string;
  DB_POOL_MAX?: string;
  DB_STATEMENT_TIMEOUT_MS?: string;
  DB_APPLICATION_NAME?: string;
}

export const DEFAULT_POOL_MAX = 5;
export const MIN_POOL_MAX = 1;
export const MAX_POOL_MAX = 20;

/**
 * Valeur UNIQUEMENT documentaire : elle ne doit jamais être fournie comme
 * configuration réelle. `resolvePostgresTarget` la refuse explicitement.
 */
export const PLACEHOLDER_CONNECTION_STRING = 'postgresql://user:password@host:5432/database';

export interface ResolvedPostgresTarget {
  /** SECRET : jamais journalisé, jamais sérialisé, jamais renvoyé par une route. */
  connectionString: string;
  source: 'HYPERDRIVE' | 'POSTGRES_CONNECTION_STRING';
  poolMax: number;
  statementTimeoutMs: number;
  applicationName: string;
}

/** Descripteur sûr : tout ce qui peut être journalisé ou exposé sans risque. */
export interface SafePostgresDescriptor {
  host: string;
  port: number;
  database: string;
  source: ResolvedPostgresTarget['source'];
  poolMax: number;
  statementTimeoutMs: number;
  applicationName: string;
  sslRequired: boolean;
  secretRedacted: true;
}

export type PostgresTargetResolution =
  | { ok: true; target: ResolvedPostgresTarget; decision: PersistenceDecision }
  | { ok: false; reason: PersistenceReason };

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}

/** Mode demandé, avec alias historique `IDENTITY_STORE`. */
export function requestedPersistenceMode(env: WorkerPersistenceEnvironment): PersistenceMode | 'invalid' | undefined {
  const raw = env.PERSISTENCE?.trim() || env.IDENTITY_STORE?.trim();
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (normalized === 'closed' || normalized === 'memory' || normalized === 'postgres') return normalized;
  return 'invalid';
}

interface ParsedConnection {
  host: string;
  port: number;
  database: string;
  sslRequired: boolean;
}

function parseConnectionString(connectionString: string): ParsedConnection | { error: PersistenceReason } {
  const trimmed = connectionString.trim();
  if (trimmed.toLowerCase() === PLACEHOLDER_CONNECTION_STRING) {
    return { error: 'placeholder-connection-string' };
  }
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    return { error: 'unsupported-connection-scheme' };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: 'invalid-connection-string' };
  }
  const host = url.hostname;
  const password = url.password;
  if (!host) return { error: 'invalid-connection-string' };
  if (host === 'host' && password === 'password') return { error: 'placeholder-connection-string' };
  const database = url.pathname.replace(/^\//, '');
  const port = url.port ? Number.parseInt(url.port, 10) : 5432;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return { error: 'invalid-connection-string' };
  return {
    host,
    port,
    database: database || 'postgres',
    sslRequired: (url.searchParams.get('sslmode') ?? '').toLowerCase() === 'require',
  };
}

/**
 * Résout la cible PostgreSQL sans ouvrir de connexion.
 * Le champ `connectionString` du résultat est un secret : ne jamais l'exposer.
 */
export function resolvePostgresTarget(env: WorkerPersistenceEnvironment): PostgresTargetResolution {
  const candidates: Array<{ source: ResolvedPostgresTarget['source']; value?: string }> = [
    { source: 'HYPERDRIVE', value: env.HYPERDRIVE?.connectionString?.trim() },
    { source: 'POSTGRES_CONNECTION_STRING', value: env.POSTGRES_CONNECTION_STRING?.trim() },
  ];
  const selected = candidates.find(candidate => Boolean(candidate.value));
  if (!selected?.value) {
    return { ok: false, reason: 'missing-hyperdrive-binding' };
  }
  const source = selected.source;
  const connectionString = selected.value;

  const parsed = parseConnectionString(connectionString);
  if ('error' in parsed) return { ok: false, reason: parsed.error };

  const poolMax = parseInteger(env.DB_POOL_MAX) ?? DEFAULT_POOL_MAX;
  if (!Number.isInteger(poolMax) || poolMax < MIN_POOL_MAX || poolMax > MAX_POOL_MAX) {
    return { ok: false, reason: 'invalid-pool-max' };
  }

  const statementTimeoutRaw = parseInteger(env.DB_STATEMENT_TIMEOUT_MS);
  const statementTimeoutMs = statementTimeoutRaw ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < MIN_STATEMENT_TIMEOUT_MS || statementTimeoutMs > MAX_STATEMENT_TIMEOUT_MS) {
    return { ok: false, reason: 'invalid-statement-timeout' };
  }

  const applicationName = env.DB_APPLICATION_NAME?.trim() || DEFAULT_APPLICATION_NAME;
  if (!APPLICATION_NAME_PATTERN.test(applicationName)) {
    return { ok: false, reason: 'invalid-application-name' };
  }

  return {
    ok: true,
    target: { connectionString, source, poolMax, statementTimeoutMs, applicationName },
    decision: {
      kind: 'postgres',
      reason: source === 'HYPERDRIVE' ? 'hyperdrive-binding' : 'connection-string',
    },
  };
}

/** Projection sûre : jamais de mot de passe, de chaîne complète ni de jeton. */
export function describePostgresTarget(target: ResolvedPostgresTarget): SafePostgresDescriptor {
  const parsed = parseConnectionString(target.connectionString);
  const safe = 'error' in parsed
    ? { host: '[indisponible]', port: 5432, database: '[indisponible]', sslRequired: false }
    : { host: parsed.host, port: parsed.port, database: parsed.database, sslRequired: parsed.sslRequired };
  return {
    ...safe,
    source: target.source,
    poolMax: target.poolMax,
    statementTimeoutMs: target.statementTimeoutMs,
    applicationName: target.applicationName,
    secretRedacted: true,
  };
}

/** Décision de composition, indépendante du fournisseur de données injecté. */
export function resolvePersistenceDecision(
  env: WorkerPersistenceEnvironment,
  injected: { hasDatabase?: boolean; hasSqlClient?: boolean } = {},
): PersistenceDecision {
  const mode = requestedPersistenceMode(env);
  if (mode === undefined) return { kind: 'closed', reason: 'not-configured' };
  if (mode === 'invalid') return { kind: 'misconfigured', reason: 'invalid-persistence-mode' };
  if (mode === 'closed') return { kind: 'closed', reason: 'explicitly-closed' };
  if (mode === 'memory') return { kind: 'memory', reason: 'explicit-memory-store' };
  if (injected.hasDatabase) return { kind: 'postgres', reason: 'injected-database' };
  if (!injected.hasSqlClient) return { kind: 'misconfigured', reason: 'missing-sql-client' };
  const target = resolvePostgresTarget(env);
  if (!target.ok) return { kind: 'misconfigured', reason: target.reason };
  return target.decision;
}
