import { createSalaryConfirmationHandlers } from '../payments/salaryConfirmation';
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
 * et la rupture motivée (P0-F) ; P0-AUTO-2 ajoute l'automatisation réelle
 * déclenchée par l'activation — événement `CONTRACT_ACTIVATED` écrit dans
 * l'Outbox PostgreSQL dans la MÊME transaction, puis worker → AutomationEngine →
 * échéancier salarial, échéancier de commission, échéances de paiement et jobs
 * de rappel ; P0-CONTRACT-POST ajoute la cascade d'embauche explicite
 * `finalize-hiring` sur contrat ACTIF (offre `FILLED`, candidature retenue
 * `HIRED → CONTRACTED`, autres candidatures `CLOSED_OFFER_FILLED`) — sans
 * modifier l'activation P0-F ni l'automatisation P0-AUTO-2 ; P0-DISPUTE-1,
 * P0-REPLACEMENT, P0-NOTIFICATIONS et P0-MATCHING ajoutent chacun leurs seuls
 * handlers versionnés et persistants. Les autres opérations restent fermées.
 * Le mode DEMO demeure séparé, inchangé et par défaut, et
 * n'est JAMAIS connecté à PostgreSQL.
 */

import type { DatabaseHealthProbe, PostgreSqlDatabase } from '../services/database';
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
// P0-AUTO-2 — automatisation contractuelle réelle (Outbox → Queue → Worker →
// AutomationEngine → jobs). Les adaptateurs PostgreSQL restent dans la couche
// persistance ; la composition est le seul point de câblage autorisé.
import { createSqlAutomationStores } from '../persistence/sqlAutomationStores';
import { createSqlPaymentStores } from '../persistence/sqlPaymentStores';
import { createSqlPaymentReconciliationStores } from '../persistence/sqlPaymentReconciliationStores';
import type { PaymentReconciliationStores } from '../persistence/paymentReconciliationRecords';
import {
  createPaymentApiHandlers,
  createPaymentRepository,
  type OpenPaymentRepository,
  type PaymentRepositoryStores,
} from '../repositories/paymentRepository';
import type { PaymentProviderAdapter } from '../payments/paymentVerification';
import { createPaymentProviderRegistry, type PaymentProviderRegistry } from '../payments/paymentProviderRegistry';
import {
  createPaymentReconciliationBatchService,
  type PaymentReconciliationBatchService,
} from '../payments/paymentReconciliationBatch';
import { createPaymentReconciliationApiHandlers } from '../payments/paymentReconciliationApi';
import { PAYMENT_RECONCILIATION_JOB_TYPES } from '../automation/paymentReconciliationJobs';
import {
  resolvePreDueLeadTimeFromEnv,
  runDuePaymentSweep,
} from '../automation/paymentCycle';
import { createContractAutomation, type ContractAutomation } from '../automation/contractActivation';
import { createAutomationWorker, type AutomationWorker } from '../automation/worker';
import type { AutomationStores } from '../automation/records';
import { createSqlClaimStore } from '../persistence/sqlClaimStores';
import { createSqlReplacementStore } from '../persistence/sqlReplacementStores';
import { createSqlMatchingStores } from '../persistence/sqlMatchingStores';
import { createMatchingRepository, createMatchingApiHandlers, type OpenMatchingRepository, type MatchingRepositoryStores } from '../matching/matchingRepository';
import { createClaimRepository, createClaimApiHandlers, type ClaimRepositoryStores, type OpenClaimRepository } from '../disputes/claimRepository';
import { createReplacementRepository, createReplacementApiHandlers, type OpenReplacementRepository, type ReplacementRepositoryStores } from '../replacements/replacementRepository';
import { createClaimAutomation } from '../disputes/claimAutomation';
import { resolveClaimEvidenceDeadline } from '../disputes/config';
// P0-NOTIFICATIONS — couche de notification : le canal In-App est persisté, et
// les canaux Push/Email ne sont que des ABSTRACTIONS (aucun provider réel,
// aucun secret, aucune configuration de production dans cette tranche).
import { createSqlNotificationStore } from '../persistence/sqlNotificationStores';
import { createNotificationService, type OpenNotificationService } from '../notifications/notificationService';
import { createNotificationAutomation } from '../notifications/notificationAutomation';
import { createNotificationApiHandlers } from '../notifications/notificationApi';
import {
  createNotificationChannelRegistry,
  type NotificationChannelRegistry,
} from '../notifications/channels';

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
  /**
   * P0-PAY-1 — avance (millisecondes) du rappel pré-échéance. AUCUNE valeur par
   * défaut : absente, aucun job pré-échéance n'est armé, car le modèle ne décide
   * pas cette règle (`PRE_DUE_REMINDER_CONFIGURATION.leadTimeMs === null`).
   */
  PAYMENT_PRE_DUE_LEAD_TIME_MS?: string;
  /** P0-DISPUTE-1 — aucune durée n'est posée si l'exploitant ne la configure pas. */
  CLAIM_EVIDENCE_DEADLINE_MS?: string;
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
  /** P0-F + P0-CONTRACT-POST : création depuis proposition acceptée, envoi, signature, activation, fin, rupture, finalisation d'embauche. */
  contracts?: OpenContractRepository;
  /** P0-DISPUTE-1 : cycle Claim persistent, absent hors PostgreSQL durable. */
  claims?: OpenClaimRepository;
  /** P0-REPLACEMENT : dossier persistant, candidature/proposition/consentement/contrat réutilisés. */
  replacements?: OpenReplacementRepository;
  /** P0-MATCHING : qualification versionnée + résultats persistés, uniquement en PostgreSQL durable. */
  matching?: OpenMatchingRepository;
  claimDeadlineConfiguration?: ReturnType<typeof resolveClaimEvidenceDeadline>;
  /**
   * P0-AUTO-2 : automatisation contractuelle (handler `CONTRACT_ACTIVATED` et
   * registre des jobs de rappel). Absente quand aucune base durable n'existe.
   */
  automation?: ContractAutomation;
  /**
   * P0-AUTO-2 : worker d'automatisation. Déclenché explicitement (`drain`,
   * `drainEvents`, `runDueJobs`) : aucun timer, aucun Cron, aucune Queue
   * Cloudflare de production dans cette tranche.
   */
  automationWorker?: AutomationWorker;
  /**
   * P0-NOTIFICATIONS — service de notification In-App + abstractions de canal.
   * Absent sans PostgreSQL durable : les routes de notification restent `501`.
   */
  notifications?: OpenNotificationService;
  /**
   * Fournisseurs Push/Email RÉELLEMENT composés. `null` = aucun provider, donc
   * état `NOT_AVAILABLE` : c'est l'état de cette tranche, et il est observable
   * sans exposer le moindre secret.
   */
  notificationChannels: { push: string | null; email: string | null };
  /**
   * P0-PAY-1 — cycle paiements (déclarations, vérification, rapprochement,
   * régularisation). Présent UNIQUEMENT quand une base PostgreSQL durable existe :
   * sans elle, les routes du domaine restent `501 NOT_IMPLEMENTED`.
   */
  payments?: OpenPaymentRepository;
  /** P0-PAY-3 — service batch/revue, uniquement lorsque PostgreSQL durable existe. */
  paymentReconciliation?: PaymentReconciliationBatchService;
  /** Registre multi-provider sans secrets; les slots non injectés restent inactifs. */
  paymentProviders?: PaymentProviderRegistry;
  /** État de la configuration du cycle, sans secret : observable par `/healthz`. */
  paymentCycle?: {
    available: boolean;
    preDueLeadTimeMs: number | null;
    preDueConfigured: boolean;
    preDueDetail: string;
  };
}

/** Serveur/test only: allows deterministic verification without changing env or DEMO behavior. */
export interface WorkerCompositionOverrides {
  googleVerifier?: GoogleCredentialVerifier;
  now?: () => Date;
  paymentProviderAdapter?: PaymentProviderAdapter;
  /** Test-only local OTP sink; never configured in production. */
  salaryTestOtpSink?: (paymentId: string, otp: string) => void;
  /**
   * P0-NOTIFICATIONS — providers Push/Email INJECTÉS, réservés aux
   * vérifications locales. La composition de production n'en injecte AUCUN :
   * l'infrastructure réelle (fournisseur, secrets, workers) est hors tranche.
   */
  notificationChannels?: NotificationChannelRegistry;
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
      // Frontière fermée : aucun canal n'est composé, donc aucun provider.
      notificationChannels: createNotificationChannelRegistry().describe(),
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
      // Frontière fermée : aucun canal n'est composé, donc aucun provider.
      notificationChannels: createNotificationChannelRegistry().describe(),
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
        return persistence.database!.run(async tx => {
          const automationStores = createSqlAutomationStores(tx);
          return operation({
            applications: createSqlApplicationStore(tx),
            offers: createSqlOfferStore(tx),
            users: createSqlUserStore(tx),
            contracts: createSqlContractStore(tx),
            replacements: createSqlReplacementStore(tx),
            outbox: automationStores.outbox,
          });
        });
      }
    : undefined;

  const applicationRepository = persistence.core
    ? createApplicationRepository({
        stores: {
          applications: persistence.core.applications,
          offers: persistence.core.offers,
          users: stores.users,
          ...(persistence.database ? {
            contracts: createSqlContractStore(persistence.database),
            replacements: createSqlReplacementStore(persistence.database),
            outbox: createSqlAutomationStores(persistence.database).outbox,
          } : {}),
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
        return persistence.database!.run(async tx => {
          const automationStores = createSqlAutomationStores(tx);
          return operation({
            proposals: createSqlProposalStore(tx),
            applications: createSqlApplicationStore(tx),
            offers: createSqlOfferStore(tx),
            users: createSqlUserStore(tx),
            replacements: createSqlReplacementStore(tx),
            outbox: automationStores.outbox,
          });
        });
      }
    : undefined;

  const proposalRepository = persistence.core
    ? createProposalRepository({
        stores: {
          proposals: persistence.core.proposals,
          applications: persistence.core.applications,
          offers: persistence.core.offers,
          users: stores.users,
          ...(persistence.database ? {
            replacements: createSqlReplacementStore(persistence.database),
            outbox: createSqlAutomationStores(persistence.database).outbox,
          } : {}),
        },
        runInTransaction: runProposalInTransaction,
        now: overrides.now,
      })
    : undefined;

  const proposalHandlers = proposalRepository
    ? createProposalApiHandlers(proposalRepository)
    : {};

  const runContractInTransaction = persistence.database
    ? async <T>(operation: (stores: ContractRepositoryStores) => Promise<T>): Promise<T> => {
        return persistence.database!.run(async tx => {
          // L'Outbox est lié à la MÊME transaction que la mutation du contrat :
          // COMMIT → mutation + historique + événement ; ROLLBACK → aucun des trois.
          const automationStores = createSqlAutomationStores(tx);
          return operation({
            contracts: createSqlContractStore(tx),
            proposals: createSqlProposalStore(tx),
            applications: createSqlApplicationStore(tx),
            offers: createSqlOfferStore(tx),
            users: createSqlUserStore(tx),
            claimRestrictions: createSqlClaimStore(tx),
            replacements: createSqlReplacementStore(tx),
            outbox: automationStores.outbox,
          });
        });
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
          ...(persistence.database ? {
            replacements: createSqlReplacementStore(persistence.database),
            outbox: createSqlAutomationStores(persistence.database).outbox,
          } : {}),
        },
        runInTransaction: runContractInTransaction,
        now: overrides.now,
      })
    : undefined;

  const contractHandlers = contractRepository
    ? createContractApiHandlers(contractRepository)
    : {};

  /*
   * P0-PAY-1 — cycle PAIEMENT.
   *
   * Comme l'automatisation, le cycle n'est branché QUE si une base PostgreSQL
   * durable existe : sans elle, aucune table `payments`, aucun Outbox, aucune
   * idempotence durable. En mode `memory` et en mode DEMO, les routes du domaine
   * restent donc `501 NOT_IMPLEMENTED` — c'est la cohérence, pas une lacune :
   * un cycle paiement sans transaction n'a aucune valeur de vérité.
   */
  const paymentCycleAvailable = Boolean(persistence.database && persistence.core);

  /**
   * Fabrique unique des stores du cycle : le repository, l'automatisation et le
   * worker construisent leurs stores paiement SUR LA TRANSACTION qui est la leur
   * — jamais sur le pool. C'est ce qui rend le COMMIT atomique pour
   * `mutation + projection + evenement + audit + idempotence`, et le ROLLBACK
   * total (aucune ligne residuelle apres un echec).
   */
  const buildPaymentStores = paymentCycleAvailable && persistence.database
    ? (tx: Parameters<typeof createSqlPaymentStores>[0]) => createSqlPaymentStores(tx)
    : undefined;

  /** Stores d'automatisation, enrichis du cycle quand une base durable existe. */
  const createAutomationStores = (
    tx: Parameters<typeof createSqlAutomationStores>[0],
  ): AutomationStores => {
    const base = createSqlAutomationStores(tx);
    if (!buildPaymentStores) return base;
    return { ...base, payments: buildPaymentStores(tx) };
  };

  const claimDeadlineConfiguration = resolveClaimEvidenceDeadline(env.CLAIM_EVIDENCE_DEADLINE_MS);
  const claimCycleAvailable = Boolean(persistence.database && persistence.core);
  const buildClaimStores = (tx: Parameters<typeof createSqlClaimStore>[0]): ClaimRepositoryStores => ({
    claims: createSqlClaimStore(tx),
    contracts: createSqlContractStore(tx),
    payments: createSqlPaymentStores(tx).payments,
    users: createSqlUserStore(tx),
    replacements: createSqlReplacementStore(tx),
    automation: createAutomationStores(tx),
    sql: tx,
  });
  const runClaimInTransaction = claimCycleAvailable && persistence.database
    ? async <T>(operation: (claimStores: ClaimRepositoryStores) => Promise<T>): Promise<T> =>
        persistence.database!.run(async tx => operation(buildClaimStores(tx)))
    : undefined;
  const claimRepository = claimCycleAvailable && persistence.database
    ? createClaimRepository({
        stores: buildClaimStores(persistence.database),
        runInTransaction: runClaimInTransaction,
        ...(overrides.now ? { now: overrides.now } : {}),
        evidenceDeadlineMs: claimDeadlineConfiguration.deadlineMs,
        evidenceDeadlineConfiguration: claimDeadlineConfiguration,
      })
    : undefined;
  const claimHandlers = claimRepository ? createClaimApiHandlers(claimRepository) : {};

  const buildReplacementStores = (tx: Parameters<typeof createSqlReplacementStore>[0]): ReplacementRepositoryStores => ({
    replacements: createSqlReplacementStore(tx),
    contracts: createSqlContractStore(tx),
    offers: createSqlOfferStore(tx),
    users: createSqlUserStore(tx),
    automation: createAutomationStores(tx),
  });
  const replacementCycleAvailable = Boolean(persistence.database && persistence.core);
  const runReplacementInTransaction = replacementCycleAvailable && persistence.database
    ? async <T>(operation: (replacementStores: ReplacementRepositoryStores) => Promise<T>): Promise<T> =>
        persistence.database!.run(async tx => operation(buildReplacementStores(tx)))
    : undefined;
  const replacementRepository = replacementCycleAvailable && persistence.database && persistence.core
    ? createReplacementRepository({
        stores: {
          replacements: createSqlReplacementStore(persistence.database),
          contracts: persistence.core.contracts,
          offers: persistence.core.offers,
          users: stores.users,
          automation: createAutomationStores(persistence.database),
        },
        runInTransaction: runReplacementInTransaction,
        ...(overrides.now ? { now: overrides.now } : {}),
      })
    : undefined;
  const replacementHandlers = replacementRepository
    ? createReplacementApiHandlers(replacementRepository)
    : {};

  // P0-MATCHING — transaction durable obligatoire pour qualification, audit,
  // idempotence et snapshots. Aucun fallback mémoire ni lien avec DEMO.
  const matchingCycleAvailable = Boolean(persistence.database && persistence.core);
  const buildMatchingStores = (tx: Parameters<typeof createSqlMatchingStores>[0]): MatchingRepositoryStores => ({
    offers: createSqlOfferStore(tx),
    users: createSqlUserStore(tx),
    matching: createSqlMatchingStores(tx),
    automation: createAutomationStores(tx),
  });
  const runMatchingInTransaction = matchingCycleAvailable && persistence.database
    ? async <T>(operation: (matchingStores: MatchingRepositoryStores) => Promise<T>): Promise<T> =>
        persistence.database!.run(async tx => operation(buildMatchingStores(tx)))
    : undefined;
  const matchingRepository = matchingCycleAvailable && persistence.database
    ? createMatchingRepository({
        stores: buildMatchingStores(persistence.database),
        runInTransaction: runMatchingInTransaction!,
        ...(overrides.now ? { now: overrides.now } : {}),
      })
    : undefined;
  const matchingHandlers = matchingRepository
    ? createMatchingApiHandlers(matchingRepository)
    : {};

  const paymentProviderRegistry = createPaymentProviderRegistry(
    overrides.paymentProviderAdapter ? [overrides.paymentProviderAdapter] : [],
  );

  const buildPaymentReconciliationStores = buildPaymentStores
    ? (tx: Parameters<typeof createSqlPaymentReconciliationStores>[0]) => {
        const automationStores = createSqlAutomationStores(tx);
        return createSqlPaymentReconciliationStores(tx, {
          audit: automationStores.audit,
          idempotency: automationStores.idempotency,
          outbox: automationStores.outbox,
          jobs: automationStores.jobs,
        });
      }
    : undefined;

  /** Avance de rappel pre-echeance : aucune valeur par defaut, aucune valeur devinee. */
  const preDueLeadTime = resolvePreDueLeadTimeFromEnv(env.PAYMENT_PRE_DUE_LEAD_TIME_MS);

  const runPaymentInTransaction = buildPaymentStores
    ? async <T>(operation: (stores: PaymentRepositoryStores) => Promise<T>): Promise<T> => {
        return persistence.database!.run(async tx => {
          const automationStores = createSqlAutomationStores(tx);
          const payments = buildPaymentStores(tx);
          return operation({
            payments: payments.payments,
            declarations: payments.declarations,
            contractPayments: payments.contractPayments,
            contracts: createSqlContractStore(tx),
            users: stores.users,
            outbox: automationStores.outbox,
            audit: automationStores.audit,
            idempotency: automationStores.idempotency,
          });
        });
      }
    : undefined;

  const paymentRepository = buildPaymentStores && persistence.core
    ? (() => {
        const automationStores = createSqlAutomationStores(persistence.database!);
        const payments = buildPaymentStores(persistence.database!);
        return createPaymentRepository({
          stores: {
            payments: payments.payments,
            declarations: payments.declarations,
            contractPayments: payments.contractPayments,
            contracts: persistence.core!.contracts,
            users: stores.users,
            outbox: automationStores.outbox,
            audit: automationStores.audit,
            idempotency: automationStores.idempotency,
          },
          ...(runPaymentInTransaction ? { runInTransaction: runPaymentInTransaction } : {}),
          ...(overrides.now ? { now: overrides.now } : {}),
          providerRegistry: paymentProviderRegistry,
          ...(overrides.paymentProviderAdapter ? { providerAdapter: overrides.paymentProviderAdapter } : {}),
        });
      })()
    : undefined;

  const paymentReconciliation = buildPaymentReconciliationStores && persistence.database
    ? createPaymentReconciliationBatchService({
        stores: buildPaymentReconciliationStores(persistence.database),
        runInTransaction: <T>(operation: (stores: PaymentReconciliationStores) => Promise<T>): Promise<T> =>
          persistence.database!.run(tx => operation(buildPaymentReconciliationStores(tx))),
        ...(overrides.now ? { now: overrides.now } : {}),
        isProviderConfigured: providerId => paymentProviderRegistry.isConfigured(providerId),
      })
    : undefined;

  const paymentHandlers = paymentRepository ? createPaymentApiHandlers(paymentRepository) : {};
  const paymentReconciliationHandlers = paymentReconciliation
    ? createPaymentReconciliationApiHandlers(paymentReconciliation)
    : {};

  /*
   * P0-AUTO-2 — automatisation contractuelle.
   *
   * Composée UNIQUEMENT quand une base PostgreSQL durable existe : sans elle il
   * n'y a ni Outbox, ni file, ni idempotence durable, et l'activation d'un
   * contrat est refusée (fail-closed) plutôt que produite sans événement.
   * Le mode `memory` et le mode DEMO ne sont donc pas concernés.
   *
   * P0-PAY-1 : les stores recus par l'automatisation portent en plus le cycle
   * paiement quand la base durable existe — c'est la seule origine des lignes
   * `payments` creees a l'activation et du balayage `SCHEDULED -> DUE`.
   */
  const automationRuntime = persistence.database
    ? {
        withTransaction: <T>(operation: (stores: AutomationStores) => Promise<T>): Promise<T> =>
          persistence.database!.run(async tx => operation(createAutomationStores(tx))),
        ...(overrides.now ? { now: overrides.now } : {}),
        paymentPreDueLeadTimeMs: preDueLeadTime.leadTimeMs,
        salaryConfirmation: async (paymentId: string) => {
          await createSalaryConfirmationHandlers(persistence.database!, overrides.salaryTestOtpSink, createSqlAutomationStores)
            .createRequest(paymentId, 'SYSTEM', `auto:${paymentId}`, true);
        },
      }
    : undefined;

  const contractAutomation = automationRuntime
    ? createContractAutomation(automationRuntime)
    : undefined;
  const claimAutomation = persistence.database && contractAutomation
    ? createClaimAutomation({
        database: persistence.database,
        createStores: createAutomationStores,
        createClaimStore: createSqlClaimStore,
        evidenceDeadlineMs: claimDeadlineConfiguration.deadlineMs,
        deadlineConfigurationValid: claimDeadlineConfiguration.valid,
        ...(overrides.now ? { now: overrides.now } : {}),
      })
    : undefined;

  /*
   * P0-NOTIFICATIONS — service de notification.
   *
   * Composé UNIQUEMENT quand une base PostgreSQL durable existe : sans elle il
   * n'y a ni Outbox à observer, ni table `notifications` à écrire, et les
   * routes restent `501 NOT_IMPLEMENTED` (fail-closed), exactement comme les
   * autres domaines persistants. Le mode DEMO n'est jamais connecté ici.
   */
  const notificationService: OpenNotificationService | undefined = persistence.database
    ? createNotificationService({
        database: persistence.database,
        createStores: tx => {
          const automationStores = createSqlAutomationStores(tx);
          return {
            notifications: createSqlNotificationStore(tx),
            users: createSqlUserStore(tx),
            audit: automationStores.audit,
            idempotency: automationStores.idempotency,
            sql: tx,
          };
        },
        ...(overrides.notificationChannels ? { channels: overrides.notificationChannels } : {}),
        ...(overrides.now ? { now: overrides.now } : {}),
      })
    : undefined;
  // Le processeur de notification est branché sur le worker EXISTANT : aucun
  // ordonnanceur, aucun moteur, aucune file supplémentaire.
  const notificationAutomation = notificationService
    ? createNotificationAutomation({ service: notificationService })
    : undefined;
  const notificationHandlers = notificationService
    ? createNotificationApiHandlers(notificationService)
    : {};

  const automationWorker = persistence.database && contractAutomation
    ? createAutomationWorker({
        database: persistence.database,
        createStores: createAutomationStores,
        automation: contractAutomation,
        ...(claimAutomation ? { supplemental: claimAutomation } : {}),
        // P0-NOTIFICATIONS — le même événement peut être observé par plusieurs
        // processeurs : `CLAIM_CREATED` reste traité par le Claim ET notifié.
        ...(notificationAutomation ? { processors: [notificationAutomation] } : {}),
        ...(overrides.now ? { now: overrides.now } : {}),
        ...(paymentRepository
          ? {
              duePayments: (stores: AutomationStores, limit: number) => runDuePaymentSweep({
                stores,
                limit,
                sweep: writer => paymentRepository.sweepDuePayments(writer, limit),
              }),
            }
          : {}),
        ...(paymentReconciliation
          ? {
              paymentReconciliationJobs: {
                jobTypes: PAYMENT_RECONCILIATION_JOB_TYPES,
                handle: (job: import('../automation/records').AutomationJob, at: Date) =>
                  paymentReconciliation.processAutomationJob(job, at),
              },
            }
          : {}),
      })
    : undefined;

  const domainHandlers = {
    ...offerHandlers,
    ...applicationHandlers,
    ...proposalHandlers,
    ...contractHandlers,
    // P0-DISPUTE-1 — Claim uniquement en PostgreSQL durable, DEMO reste séparé.
    ...claimHandlers,
    // P0-REPLACEMENT — lectures et publication d'offre; sélection et contrat
    // passent par les repositories Application/Proposal/Contract existants.
    ...replacementHandlers,
    // P0-MATCHING — qualification, revue humaine et résultats explicables.
    ...matchingHandlers,
    // P0-PAY-1 — cycle Payment existant.
    ...paymentHandlers,
    ...(persistence.database && mode === 'postgres' ? createSalaryConfirmationHandlers(persistence.database, overrides.salaryTestOtpSink, createSqlAutomationStores) : {}),
    // P0-PAY-3 — imports batch, ledger externe et revue ADMIN.
    ...paymentReconciliationHandlers,
    // P0-NOTIFICATIONS — lecture In-App et marquage lu/non lu (routes
    // DÉJÀ déclarées par le catalogue de routes). Absent sans base durable,
    // ces routes restent alors fermées (501).
    ...notificationHandlers,
  };

  return {
    mode,
    persistence: persistence.decision,
    core: persistence.core,
    offers: offerRepository,
    applications: applicationRepository,
    proposals: proposalRepository,
    contracts: contractRepository,
    claims: claimRepository,
    replacements: replacementRepository,
    matching: matchingRepository,
    claimDeadlineConfiguration,
    payments: paymentRepository,
    paymentReconciliation,
    paymentProviders: paymentProviderRegistry,
    paymentCycle: {
      available: paymentCycleAvailable,
      preDueLeadTimeMs: preDueLeadTime.leadTimeMs,
      preDueConfigured: preDueLeadTime.configured,
      preDueDetail: preDueLeadTime.detail,
    },
    ...(contractAutomation ? { automation: contractAutomation } : {}),
    ...(automationWorker ? { automationWorker } : {}),
    ...(notificationService ? { notifications: notificationService } : {}),
    notificationChannels: (overrides.notificationChannels ?? createNotificationChannelRegistry()).describe(),
    health,
    probe: persistence.probe,
    target: persistence.target,
    worker: createIdentityApiWorker({
      sessions,
      stores,
      health,
      cookie: { secure: env.COOKIE_SECURE !== 'false' },
      now: overrides.now,
      handlers: domainHandlers,
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
