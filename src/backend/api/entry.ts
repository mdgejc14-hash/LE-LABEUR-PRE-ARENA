/**
 * Composition root du Worker LE LABEUR (identité Phase 2 / persistance P0-B).
 *
 * États possibles, explicites et sans retombée silencieuse :
 *  - `closed`      : aucun `GOOGLE_CLIENT_ID`, ou persistance non configurée →
 *                    frontière Phase 1 (401/501) ;
 *  - `memory`      : identité + noyau en mémoire, tests/démo serveur uniquement ;
 *  - `postgres`    : stores SQL via PostgreSQL/Hyperdrive — nécessite une
 *                    connexion injectée (database ou client + binding).
 *
 * P0-B : l'identité, la session et le RBAC utilisent les stores SQL quand une
 * base/client est injecté. Les handlers métier offres/candidatures/contrats
 * restent 501. Le mode DEMO (MockRepository) reste inchangé et par défaut.
 */

import type { PostgreSqlDatabase } from '../services/database';
import { createGoogleCredentialVerifier } from '../identity/googleVerifier';
import type { GoogleCredentialVerifier } from '../productionContracts';
import { createSessionService } from '../identity/sessionService';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { createInMemoryIdentityStores, type IdentityStores } from '../identity/stores';
import { createInMemoryCoreStores } from '../persistence/coreStores';
import {
  describePostgresTarget,
  resolvePersistenceDecision,
  resolvePostgresTarget,
  type PersistenceDecision,
  type SafePostgresDescriptor,
  type WorkerPersistenceEnvironment,
} from '../persistence/config';
import type { CoreStores } from '../persistence/coreRecords';
import { createPostgresDatabase } from '../persistence/postgresDatabase';
import { createSqlCoreStores } from '../persistence/sqlCoreStores';
import type { PostgresClientPort } from '../persistence/sqlClient';
import { createApiWorker } from './worker';
import { createIdentityApiWorker } from './identityWorker';

export interface WorkerEnvironment extends WorkerPersistenceEnvironment {
  GOOGLE_CLIENT_ID?: string;
  SESSION_TTL_SECONDS?: string;
  COOKIE_SECURE?: string;
}

export type WorkerIdentityMode = 'closed' | 'memory' | 'postgres';

export interface WorkerPersistenceResolution {
  decision: PersistenceDecision;
  database?: PostgreSqlDatabase;
  /** Noyau relationnel résolu. Aucun handler ne le consomme encore en P0-A. */
  core?: CoreStores;
  /** Descripteur SANS secret, utilisable pour l'observabilité. */
  target?: SafePostgresDescriptor;
}

export interface WorkerComposition {
  mode: WorkerIdentityMode;
  /** Motif exact de la persistance retenue ; `misconfigured` n'ouvre jamais l'API. */
  persistence: PersistenceDecision;
  worker: { fetch(request: Request): Promise<Response> };
  core?: CoreStores;
}

/** Serveur/test only: allows deterministic verification without changing env or DEMO behavior. */
export interface WorkerCompositionOverrides {
  googleVerifier?: GoogleCredentialVerifier;
  now?: () => Date;
}

function isInjectedDatabase(value: PostgreSqlDatabase | PostgresClientPort): value is PostgreSqlDatabase {
  return typeof (value as { run?: unknown }).run === 'function';
}

/**
 * Résout la persistance à partir de l'environnement et d'un éventuel accès
 * déjà construit (base injectée pour les tests, ou client SQL + binding).
 */
export function resolveWorkerPersistence(
  env: WorkerPersistenceEnvironment,
  injected?: PostgreSqlDatabase | PostgresClientPort,
): WorkerPersistenceResolution {
  const database = injected && isInjectedDatabase(injected) ? injected : undefined;
  const client = injected && !database ? (injected as PostgresClientPort) : undefined;

  const decision = resolvePersistenceDecision(env, {
    hasDatabase: Boolean(database),
    hasSqlClient: Boolean(client),
  });

  if (decision.kind === 'postgres' && database) {
    return {
      decision,
      database,
      core: createSqlCoreStores(database),
    };
  }

  if (decision.kind === 'postgres' && client) {
    const target = resolvePostgresTarget(env);
    if (!target.ok) {
      // Incohérence impossible en pratique (la décision a déjà validé la cible),
      // conservée pour ne jamais ouvrir l'API par défaut.
      return { decision: { kind: 'misconfigured', reason: target.reason } };
    }
    const created = createPostgresDatabase(client, {
      statementTimeoutMs: target.target.statementTimeoutMs,
      applicationName: target.target.applicationName,
      redactSecrets: [target.target.connectionString],
    });
    return {
      decision,
      database: created,
      core: createSqlCoreStores(created),
      target: describePostgresTarget(target.target),
    };
  }

  if (decision.kind === 'memory') {
    return { decision, core: createInMemoryCoreStores() };
  }

  return { decision };
}

export function composeWorker(
  env: WorkerEnvironment,
  injected?: PostgreSqlDatabase | PostgresClientPort,
  overrides: WorkerCompositionOverrides = {},
): WorkerComposition {
  const persistence = resolveWorkerPersistence(env, injected);
  const audience = env.GOOGLE_CLIENT_ID?.trim();
  if (!audience) {
    // Aucun vérificateur Google : la frontière reste fermée par défaut.
    return {
      mode: 'closed',
      persistence: persistence.decision,
      worker: createApiWorker({ authenticate: async () => null }),
    };
  }

  let stores: IdentityStores;
  let mode: WorkerIdentityMode;
  if (persistence.database) {
    stores = createSqlIdentityStores(persistence.database);
    mode = 'postgres';
  } else if (persistence.decision.kind === 'memory') {
    stores = createInMemoryIdentityStores();
    mode = 'memory';
  } else {
    return {
      mode: 'closed',
      persistence: persistence.decision,
      worker: createApiWorker({ authenticate: async () => null }),
    };
  }

  const sessions = createSessionService({
    stores,
    googleVerifier: overrides.googleVerifier ?? createGoogleCredentialVerifier({ audience }),
    sessionTtlSeconds: env.SESSION_TTL_SECONDS ? Number(env.SESSION_TTL_SECONDS) : undefined,
    now: overrides.now,
  });

  return {
    mode,
    persistence: persistence.decision,
    core: persistence.core,
    worker: createIdentityApiWorker({
      sessions,
      stores,
      cookie: { secure: env.COOKIE_SECURE !== 'false' },
      now: overrides.now,
    }),
  };
}

let cachedComposition: WorkerComposition | null = null;

export default {
  fetch(request: Request, env: WorkerEnvironment = {}): Promise<Response> {
    // La composition (et son store mémoire éventuel) est conservée entre requêtes.
    cachedComposition ??= composeWorker(env);
    return cachedComposition.worker.fetch(request);
  },
};
