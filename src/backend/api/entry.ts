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
 * base/client est injecté. OFFRES est ouvert pour son périmètre P0-E1/E2 et
 * CANDIDATURES pour la soumission, la consultation de l'offre propriétaire
 * (P0-E3) et le premier cycle de décision EXAMINE / SHORTLIST / REJECT /
 * WITHDRAW (P0-E4) ; PROPOSITIONS pour l'émission, l'acceptation, la
 * déclinaison, l'expiration et la lecture ADMIN (P0-E5) ; CONTRATS pour la
 * création depuis une proposition acceptée, la signature, l'activation, la fin
 * et la rupture motivée (P0-F). P0-AUTO-2 planifie le schedule existant et
 * la commission contractuelle à l'activation, sans ouvrir paiements/déclarations,
 * transferts d'argent, plaintes, remplacements ni notifications réelles. Le
 * mode DEMO demeure séparé, inchangé et par défaut.
 */

import type { DatabaseHealthProbe, PostgreSqlDatabase } from '../services/database';
import { createContractAutomationRuntime } from '../automation/contractAutomation';
import type { AutomationWorker } from '../automation/worker';
import { createGoogleCredentialVerifier } from '../identity/googleVerifier';
import type { GoogleCredentialVerifier } from '../productionContracts';
import { createSessionService } from '../identity/sessionService';
import { createSqlIdentityStores, createSqlUserStore } from '../identity/sqlStores';
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
import type { CoreStores, OfferStore } from '../persistence/coreRecords';
import { readMigrationState } from '../persistence/migrationState';
import { createPostgresDatabase } from '../persistence/postgresDatabase';
import {
  createSqlApplicationStore,
  createSqlContractStore,
  createSqlCoreStores,
  createSqlOfferStore,
  createSqlProposalStore,
} from '../persistence/sqlCoreStores';
import type { PostgresClientPort } from '../persistence/sqlClient';
import { buildHealthPayload, detectWorkerRuntime, type BoundaryHealthResponse } from './health';
import { createApiWorker, type ApiHealthReporter } from './worker';
import { createIdentityApiWorker } from './identityWorker';
import {
  createApplicationApiHandlers,
  createApplicationRepository,
  type OpenApplicationRepository,
} from '../repositories/applicationRepository';
import { createOfferApiHandlers, createOfferRepository } from '../repositories/offerRepository';
import type { ServerOfferRepository } from '../repositories/contracts';
import type { ApplicationRepositoryStores } from '../repositories/applicationRepository';
import {
  createProposalApiHandlers,
  createProposalRepository,
  type OpenProposalRepository,
  type ProposalRepositoryStores,
} from '../repositories/proposalRepository';
import {
  createContractApiHandlers,
  createContractRepository,
  type ContractRepositoryStores,
  type OpenContractRepository,
} from '../repositories/contractRepository';

export interface WorkerEnvironment extends WorkerPersistenceEnvironment {
  GOOGLE_CLIENT_ID?: string;
  SESSION_TTL_SECONDS?: string;
  COOKIE_SECURE?: string;
  /** Nom déclaré de l'environnement déployé (`development`, `production`…) : informatif, jamais deviné. */
  WORKER_ENV?: string;
  /**
   * UNIQUEMENT pour les vérifications locales : JWKS servi en boucle locale.
   * Toute valeur non-loopback est ignorée, donc inutilisable en production.
   */
  TEST_ONLY_GOOGLE_JWKS_URL?: string;
}

export type WorkerIdentityMode = 'closed' | 'memory' | 'postgres';

export interface WorkerPersistenceResolution {
  decision: PersistenceDecision;
  database?: PostgreSqlDatabase;
  /** Sonde réelle (`SELECT 1`) disponible dès qu'une base est construite. */
  probe?: DatabaseHealthProbe;
  /** Noyau relationnel résolu; seuls les domaines ouverts par les handlers l'utilisent. */
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
  /** Rapport `/healthz` réel (sonde + migrations), sans aucun secret. */
  health: ApiHealthReporter;
  /** Sonde réelle ; absente quand aucune base n'est configurée. */
  probe?: DatabaseHealthProbe;
  /** Descripteur sûr de la cible, si une cible a été résolue. */
  target?: SafePostgresDescriptor;
  offers?: ServerOfferRepository;
  /** P0-E3 + P0-E4 : soumission, consultation par offre propriétaire et cycle de décision. */
  applications?: OpenApplicationRepository;
  /** P0-E5 : émission, acceptation, déclinaison, expiration et lecture ADMIN. */
  proposals?: OpenProposalRepository;
  /** P0-F : création depuis proposition acceptée, envoi, signature, activation, fin, rupture. */
  contracts?: OpenContractRepository;
  /** P0-AUTO-2 : Worker PostgreSQL local (Outbox → Queue → AutomationEngine). */
  automation?: AutomationWorker;
}

/** Serveur/test only: allows deterministic verification without changing env or DEMO behavior. */
export interface WorkerCompositionOverrides {
  googleVerifier?: GoogleCredentialVerifier;
  now?: () => Date;
}

function isInjectedDatabase(value: PostgreSqlDatabase | PostgresClientPort): value is PostgreSqlDatabase {
  return typeof (value as { run?: unknown }).run === 'function';
}

function isHealthProbe(value: PostgreSqlDatabase): value is PostgreSqlDatabase & DatabaseHealthProbe {
  return typeof (value as { check?: unknown }).check === 'function';
}

/**
 * JWKS de test accepté uniquement en boucle locale (vérifications locales).
 * Toute autre valeur est ignorée : aucun détournement possible en production.
 */
export function resolveTestOnlyJwksUrl(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    const loopback = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
    return url.protocol === 'http:' && loopback ? candidate : undefined;
  } catch {
    return undefined;
  }
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
      probe: isHealthProbe(database) ? database : undefined,
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
      probe: created,
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
  const runtime = {
    runtime: detectWorkerRuntime(),
    declaredEnvironment: env.WORKER_ENV?.trim() || null,
    hyperdriveBinding: Boolean(env.HYPERDRIVE?.connectionString?.trim()),
  };

  /**
   * Rapport de santé construit sur l'état OBSERVÉ : sonde `SELECT 1` quand une
   * base existe, état réel des migrations sinon. Jamais de secret, jamais de
   * valeur inventée.
   */
  const health: ApiHealthReporter = async (): Promise<BoundaryHealthResponse> => {
    const database = persistence.database;
    const checked = persistence.probe ? await persistence.probe.check() : undefined;
    const migrations = database ? await readMigrationState(database) : undefined;
    return buildHealthPayload({
      decision: persistence.decision,
      runtime,
      health: checked,
      target: persistence.target,
      migrations,
    });
  };

  const audience = env.GOOGLE_CLIENT_ID?.trim();
  if (!audience) {
    // Aucun vérificateur Google : la frontière reste fermée par défaut,
    // mais `/healthz` continue de décrire l'état réel de la persistance.
    return {
      mode: 'closed',
      persistence: persistence.decision,
      health,
      probe: persistence.probe,
      target: persistence.target,
      worker: createApiWorker({ authenticate: async () => null, health }),
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
      health,
      probe: persistence.probe,
      target: persistence.target,
      worker: createApiWorker({ authenticate: async () => null, health }),
    };
  }

  const testJwksUrl = resolveTestOnlyJwksUrl(env.TEST_ONLY_GOOGLE_JWKS_URL);
  const sessions = createSessionService({
    stores,
    googleVerifier: overrides.googleVerifier
      ?? createGoogleCredentialVerifier({ audience, ...(testJwksUrl ? { jwksUrl: testJwksUrl } : {}) }),
    sessionTtlSeconds: env.SESSION_TTL_SECONDS ? Number(env.SESSION_TTL_SECONDS) : undefined,
    now: overrides.now,
  });

  const runInTransaction = persistence.database
    ? async <T>(operation: (txStores: { offers: OfferStore; users: IdentityStores['users'] }) => Promise<T>): Promise<T> => {
        return persistence.database!.run(async tx => {
          return operation({
            offers: createSqlOfferStore(tx),
            users: stores.users,
          });
        });
      }
    : undefined;

  const offerRepository = persistence.core
    ? createOfferRepository({
        stores: {
          offers: persistence.core.offers,
          users: stores.users,
        },
        runInTransaction,
        now: overrides.now,
      })
    : undefined;

  const offerHandlers = offerRepository ? createOfferApiHandlers(offerRepository) : {};

  const runApplicationInTransaction = persistence.database
    ? async <T>(operation: (txStores: ApplicationRepositoryStores) => Promise<T>): Promise<T> => {
        return persistence.database!.run(async tx => operation({
          applications: createSqlApplicationStore(tx),
          offers: createSqlOfferStore(tx),
          users: createSqlUserStore(tx),
        }));
      }
    : undefined;

  const applicationRepository = persistence.core
    ? createApplicationRepository({
        stores: {
          applications: persistence.core.applications,
          offers: persistence.core.offers,
          users: stores.users,
        },
        runInTransaction: runApplicationInTransaction,
        now: overrides.now,
      })
    : undefined;

  const applicationHandlers = applicationRepository
    ? createApplicationApiHandlers(applicationRepository)
    : {};

  const runProposalInTransaction = persistence.database
    ? async <T>(operation: (stores: ProposalRepositoryStores) => Promise<T>): Promise<T> => {
        return persistence.database!.run(async tx => operation({
          proposals: createSqlProposalStore(tx),
          applications: createSqlApplicationStore(tx),
          offers: createSqlOfferStore(tx),
          users: createSqlUserStore(tx),
        }));
      }
    : undefined;

  const proposalRepository = persistence.core
    ? createProposalRepository({
        stores: {
          proposals: persistence.core.proposals,
          applications: persistence.core.applications,
          offers: persistence.core.offers,
          users: stores.users,
        },
        runInTransaction: runProposalInTransaction,
        now: overrides.now,
      })
    : undefined;

  const proposalHandlers = proposalRepository
    ? createProposalApiHandlers(proposalRepository)
    : {};

  const contractAutomation = persistence.database
    ? createContractAutomationRuntime(persistence.database, overrides.now)
    : undefined;

  const runContractInTransaction = persistence.database
    ? async <T>(operation: (stores: ContractRepositoryStores) => Promise<T>): Promise<T> => {
        return persistence.database!.run(async tx => operation({
          contracts: createSqlContractStore(tx),
          proposals: createSqlProposalStore(tx),
          applications: createSqlApplicationStore(tx),
          offers: createSqlOfferStore(tx),
          users: createSqlUserStore(tx),
          ...(contractAutomation ? {
            automation: {
              appendOutbox: (event) => contractAutomation.outbox.append(tx, event),
            },
          } : {}),
        }));
      }
    : undefined;

  const contractRepository = persistence.core
    ? createContractRepository({
        stores: {
          contracts: persistence.core.contracts,
          proposals: persistence.core.proposals,
          applications: persistence.core.applications,
          offers: persistence.core.offers,
          users: stores.users,
        },
        runInTransaction: runContractInTransaction,
        now: overrides.now,
      })
    : undefined;

  const contractHandlers = contractRepository
    ? createContractApiHandlers(contractRepository)
    : {};

  const domainHandlers = {
    ...offerHandlers,
    ...applicationHandlers,
    ...proposalHandlers,
    ...contractHandlers,
  };

  const apiWorker = createIdentityApiWorker({
    sessions,
    stores,
    health,
    cookie: { secure: env.COOKIE_SECURE !== 'false' },
    now: overrides.now,
    handlers: domainHandlers,
  });
  const worker: WorkerComposition['worker'] = contractAutomation
    ? {
        async fetch(request) {
          const response = await apiWorker.fetch(request);
          // Post-response local drain: the mutation/outbox commit is already
          // complete. Failures never turn a committed API command into a
          // misleading HTTP error; the durable Outbox lease/retry recovers it.
          try {
            await contractAutomation.worker.processOutboxBatch();
            await contractAutomation.worker.processDueJobs();
          } catch {
            // PostgreSQL outbox/jobs remain the source of truth for retry.
          }
          return response;
        },
      }
    : apiWorker;

  return {
    mode,
    persistence: persistence.decision,
    core: persistence.core,
    offers: offerRepository,
    applications: applicationRepository,
    proposals: proposalRepository,
    contracts: contractRepository,
    automation: contractAutomation?.worker,
    health,
    probe: persistence.probe,
    target: persistence.target,
    worker,
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
