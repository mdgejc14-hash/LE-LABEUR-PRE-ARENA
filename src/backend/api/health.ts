/**
 * LE LABEUR — P0-C — rapport de santé RÉEL de la persistance.
 *
 * Règles strictes :
 *  - le rapport décrit l'état RÉELLEMENT observé (sonde `SELECT 1`), jamais un
 *    état souhaité ni simulé ;
 *  - aucun secret n'est exposé : ni chaîne de connexion, ni mot de passe, ni
 *    jeton. Seul le descripteur sûr de P0-A (`describePostgresTarget`) et un
 *    message d'erreur expurgé (`redactSqlSecrets`) peuvent sortir ;
 *  - un mode mémoire est annoncé comme NON durable, jamais comme PostgreSQL ;
 *  - la frontière fermée conserve la forme historique
 *    `{ status: 'boundary-only', persistence: 'not-configured' }`.
 */

import type { DatabaseHealth } from '../services/database';
import type { PersistenceDecision, PersistenceReason, SafePostgresDescriptor } from '../persistence/config';

/** État des migrations lu dans `schema_migrations` (jamais deviné). */
export interface MigrationState {
  status: 'applied' | 'pending' | 'unknown';
  applied: string[];
  pending: string[];
  /** Motif expurgé quand l'état est `unknown` (table absente, base injoignable). */
  detail?: string;
}

export interface HealthRuntimeDescriptor {
  /** `workerd` = runtime Cloudflare, `node` = scripts/tests locaux. */
  runtime: 'workerd' | 'node' | 'unknown';
  /** Valeur déclarée par l'exploitant (var `WORKER_ENV`), jamais déduite. */
  declaredEnvironment: string | null;
  /** Le Worker a-t-il reçu un binding Hyperdrive ? (aucun secret dans le booléen) */
  hyperdriveBinding: boolean;
}

export interface PersistenceHealthReport {
  mode: PersistenceDecision['kind'];
  reason: PersistenceReason;
  configured: boolean;
  /** `true` uniquement pour PostgreSQL ; la mémoire n'est jamais durable. */
  durable: boolean;
  /** `null` = non applicable (aucune sonde), jamais `true` par défaut. */
  reachable: boolean | null;
  checkedAt?: string;
  latencyMs?: number;
  target?: SafePostgresDescriptor;
  migrations?: MigrationState;
  /** Message déjà expurgé ; jamais de chaîne de connexion ni de mot de passe. */
  error?: string;
}

export type BoundaryHealthResponse =
  | {
      status: 'boundary-only';
      apiVersion: 'v1';
      persistence: 'not-configured';
      runtime: HealthRuntimeDescriptor;
    }
  | {
      status: 'ok' | 'degraded';
      apiVersion: 'v1';
      persistence: PersistenceHealthReport;
      runtime: HealthRuntimeDescriptor;
    };

export interface HealthReportInputs {
  decision: PersistenceDecision;
  runtime: HealthRuntimeDescriptor;
  /** Résultat réel de la sonde ; absent = aucune sonde disponible. */
  health?: DatabaseHealth;
  target?: SafePostgresDescriptor;
  migrations?: MigrationState;
}

/** Construit le corps `/healthz` sans jamais inventer d'état. */
export function buildHealthPayload(inputs: HealthReportInputs): BoundaryHealthResponse {
  const { decision, runtime } = inputs;

  if (decision.kind === 'closed') {
    return {
      status: 'boundary-only',
      apiVersion: 'v1',
      persistence: 'not-configured',
      runtime,
    };
  }

  const report: PersistenceHealthReport = {
    mode: decision.kind,
    reason: decision.reason,
    configured: true,
    durable: decision.kind === 'postgres',
    reachable: inputs.health?.reachable ?? null,
  };
  if (inputs.health?.checkedAt) report.checkedAt = inputs.health.checkedAt;
  if (typeof inputs.health?.latencyMs === 'number') report.latencyMs = inputs.health.latencyMs;
  if (inputs.target) report.target = inputs.target;
  if (inputs.migrations) report.migrations = inputs.migrations;
  if (inputs.health && !inputs.health.reachable && inputs.health.error) {
    report.error = inputs.health.error;
  }

  const degraded = decision.kind === 'memory' ? false : report.reachable !== true;
  return {
    status: degraded ? 'degraded' : 'ok',
    apiVersion: 'v1',
    persistence: report,
    runtime,
  };
}

/** 200 : frontière fermée ou persistence configurée et joignable. 503 sinon. */
export function healthStatusCode(payload: BoundaryHealthResponse): number {
  return payload.status === 'degraded' ? 503 : 200;
}

/** Détection honnête du runtime courant (aucune revendication de déploiement). */
export function detectWorkerRuntime(): HealthRuntimeDescriptor['runtime'] {
  const navigatorLike = globalThis as { navigator?: { userAgent?: string } };
  const userAgent = navigatorLike.navigator?.userAgent ?? '';
  if (/Cloudflare-Workers|workerd/i.test(userAgent)) return 'workerd';
  const processLike = globalThis as { process?: { versions?: { node?: string } } };
  if (processLike.process?.versions?.node) return 'node';
  return 'unknown';
}

/**
 * Vérifie qu'un rapport ne contient aucune valeur sensible. Utilisé par les
 * tests de sécurité et disponible côté Worker pour refuser d'émettre un corps
 * qui aurait fui (protection en profondeur).
 */
export function healthPayloadContainsSecret(
  payload: BoundaryHealthResponse,
  secrets: readonly (string | undefined)[],
): boolean {
  const serialized = JSON.stringify(payload);
  return secrets.some(secret => Boolean(secret) && secret!.length >= 8 && serialized.includes(secret!));
}
