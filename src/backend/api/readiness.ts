/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — rapport de PRÉPARATION PRODUCTION
 * (`/readyz`).
 *
 * Rôle : répondre à UNE question — « la production est-elle réellement
 * exploitable ? » — à partir d'OBSERVATIONS RÉELLES uniquement :
 *
 *   1. Worker vivant (runtime observé) ;
 *   2. PostgreSQL accessible (sonde `SELECT 1`) ;
 *   3. migrations attendues réellement appliquées (`schema_migrations`) ;
 *   4. file durable accessible (`automation_outbox` / `automation_jobs`) ;
 *   5. Cron déclaré ET dernier tick réellement tracé (`CRON_TICK_EXECUTED`) ;
 *   6. worker d'automatisation composé (handlers déclarés) ;
 *   7. notifications In-App accessibles (lecture bornée) ;
 *   8. documents accessibles (lecture bornée) ;
 *   9. R2 accessible (sonde `head` sur une clé dédiée, AUCUNE écriture) ;
 *  10. ledger d'audit opérationnel (dernière entrée).
 *
 * Règles :
 *  - aucune valeur inventée : un composant absent est `blocked`, jamais `ok` ;
 *  - aucun secret : les entrées d'inventaire sont décrites par leur PRÉSENCE ;
 *  - aucune écriture : toutes les vérifications sont des lectures bornées
 *    (`LIMIT 1`, compteurs) — un smoke check ne doit jamais modifier un dossier
 *    métier réel ;
 *  - la projection publique ne contient que des identifiants et des statuts ;
 *    le détail (hôtes, compteurs, identifiants de migration) exige une session
 *    ADMIN disposant de `audit:read`.
 */

import type { DatabaseHealthProbe, SqlQueryExecutor } from '../services/database';
import type { PersistenceDecision, SafePostgresDescriptor } from '../persistence/config';
import { readMigrationState } from '../persistence/migrationState';
import { redactSqlSecrets } from '../persistence/sqlClient';
import { DEFAULT_STALE_CLAIM_MS } from '../automation/worker';
import {
  auditRuntimeProductionResources,
  type ProductionEnvironmentView,
  type ProductionResourceAuditEntry,
} from '../worker/productionResources';
import type { HealthRuntimeDescriptor, MigrationState } from './health';

export const READINESS_API_VERSION = 'v1';

/** Clé de sonde R2 : lecture seule, jamais écrite par le Worker. */
export const R2_READINESS_PROBE_KEY = 'readiness/probe';

export type ReadinessCheckId =
  | 'worker'
  | 'postgres'
  | 'migrations'
  | 'queue'
  | 'cron'
  | 'automation'
  | 'notifications'
  | 'documents'
  | 'r2'
  | 'audit';

export type ReadinessCheckStatus = 'ok' | 'degraded' | 'blocked';
export type ReadinessOverallStatus = 'ready' | 'degraded' | 'blocked';

export interface ReadinessCheck {
  id: ReadinessCheckId;
  label: string;
  status: ReadinessCheckStatus;
  /** Détail expurgé (aucun secret, aucune chaîne de connexion). */
  detail: string;
  /** Valeurs observées NON sensibles (masquées dans la projection publique). */
  observed?: Record<string, string | number | boolean | null>;
}

export interface ReadinessReport {
  status: ReadinessOverallStatus;
  apiVersion: typeof READINESS_API_VERSION;
  checkedAt: string;
  runtime: HealthRuntimeDescriptor;
  checks: ReadinessCheck[];
  resources: ProductionResourceAuditEntry[];
  /** Invariants de production violés (messages expurgés). */
  violations?: string[];
}

/** Projection publique : statuts seuls, aucun détail d'exploitation. */
export interface PublicReadinessProjection {
  status: ReadinessOverallStatus;
  apiVersion: typeof READINESS_API_VERSION;
  checkedAt: string;
  detailed: false;
  checks: Array<{ id: ReadinessCheckId; status: ReadinessCheckStatus }>;
}

export interface DetailedReadinessReport extends ReadinessReport {
  detailed: true;
}

export type ReadinessResponse = PublicReadinessProjection | DetailedReadinessReport;

/** Un blocage rend 503 ; un état dégradé reste 200 (le service répond). */
export function readinessStatusCode(report: ReadinessReport): number {
  return report.status === 'blocked' ? 503 : 200;
}

export function summarizeReadiness(checks: readonly ReadinessCheck[]): ReadinessOverallStatus {
  if (checks.some(check => check.status === 'blocked')) return 'blocked';
  if (checks.some(check => check.status === 'degraded')) return 'degraded';
  return 'ready';
}

export function projectReadiness(report: ReadinessReport, detailed: boolean): ReadinessResponse {
  if (detailed) return { ...report, detailed: true };
  return {
    status: report.status,
    apiVersion: report.apiVersion,
    checkedAt: report.checkedAt,
    detailed: false,
    checks: report.checks.map(check => ({ id: check.id, status: check.status })),
  };
}

/** Garde-fou de test : aucune valeur sensible ne doit apparaître dans le rapport. */
export function readinessContainsSecret(report: ReadinessReport, secrets: readonly (string | undefined)[]): boolean {
  const serialized = JSON.stringify(report);
  return secrets.some(secret => Boolean(secret) && secret!.length >= 8 && serialized.includes(secret!));
}

export interface R2HeadLike {
  head(key: string): Promise<{ size: number } | null>;
}

export interface ReadinessDependencies {
  env: ProductionEnvironmentView & { DOCUMENTS_BUCKET?: unknown };
  runtime: HealthRuntimeDescriptor;
  decision: PersistenceDecision;
  /** Sonde `SELECT 1` réelle ; absente = aucune base construite. */
  probe?: DatabaseHealthProbe;
  /** Accès SQL durable (lectures bornées) ; absent en mode mémoire/fermé. */
  database?: SqlQueryExecutor;
  target?: SafePostgresDescriptor;
  /** Worker d'automatisation composé (handlers réellement déclarés). */
  automationWorker?: { handledEventTypes: readonly string[]; handledJobTypes: readonly string[] };
  notificationsAvailable?: boolean;
  documentsAvailable?: boolean;
  /** Invariants de production violés (fermeture franche) — messages expurgés. */
  violations?: readonly string[];
  now?: () => Date;
}

const CHECK_LABELS: Record<ReadinessCheckId, string> = {
  worker: 'Worker vivant',
  postgres: 'PostgreSQL accessible',
  migrations: 'Migrations attendues appliquées',
  queue: 'File durable (Outbox / jobs) accessible',
  cron: 'Cron déclaré et ticks tracés',
  automation: 'Worker d’automatisation opérationnel',
  notifications: 'Notifications In-App accessibles',
  documents: 'Documents accessibles',
  r2: 'Bucket R2 accessible',
  audit: 'Ledger d’audit opérationnel',
};

function check(id: ReadinessCheckId, status: ReadinessCheckStatus, detail: string, observed?: ReadinessCheck['observed']): ReadinessCheck {
  return { id, label: CHECK_LABELS[id], status, detail, ...(observed ? { observed } : {}) };
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
}

function toCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 't' || value === 'true') return true;
  if (value === 'f' || value === 'false') return false;
  return null;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'erreur inconnue');
  return redactSqlSecrets(message.slice(0, 300));
}

/** Borne d'orphanisation d'un claim, exprimée pour PostgreSQL (constante validée). */
export function staleClaimSeconds(staleClaimMs: number = DEFAULT_STALE_CLAIM_MS): number {
  const seconds = Math.floor(staleClaimMs / 1000);
  if (!Number.isInteger(seconds) || seconds < 60) return 60;
  return seconds;
}

/**
 * Cadence de cron déclarée : chaîne à 5 champs. Aucune valeur par défaut n'est
 * inventée — l'absence reste une absence (le check est alors `blocked`).
 */
export function readDeclaredCronCadence(env: { CRON_CADENCE?: string }): string | null {
  const raw = env.CRON_CADENCE?.trim();
  if (!raw) return null;
  const fields = raw.split(/\s+/);
  if (fields.length !== 5) return null;
  if (!fields.every(field => /^[0-9*/,\-A-Za-z]+$/.test(field))) return null;
  return raw;
}

interface QueueAuditRow {
  due_events: unknown;
  due_jobs: unknown;
  stale_events: unknown;
  stale_jobs: unknown;
  dead_lettered_events: unknown;
  last_tick_at: unknown;
  tick_count: unknown;
  last_audit_at: unknown;
}

const QUEUE_AUDIT_SQL = `
SELECT
  (SELECT count(*)::int FROM automation_outbox
     WHERE status IN ('PENDING','RETRYABLE') AND available_at <= now()) AS due_events,
  (SELECT count(*)::int FROM automation_jobs
     WHERE status IN ('PENDING','RETRYABLE') AND due_at <= now()) AS due_jobs,
  (SELECT count(*)::int FROM automation_outbox
     WHERE status = 'PROCESSING'
       AND (processing_started_at IS NULL
            OR processing_started_at < now() - make_interval(secs => $1::int))) AS stale_events,
  (SELECT count(*)::int FROM automation_jobs
     WHERE status = 'RUNNING'
       AND (started_at IS NULL
            OR started_at < now() - make_interval(secs => $1::int))) AS stale_jobs,
  (SELECT count(*)::int FROM automation_outbox WHERE status = 'DEAD_LETTER') AS dead_lettered_events,
  (SELECT occurred_at FROM automation_audit_ledger
     WHERE action = 'CRON_TICK_EXECUTED' ORDER BY occurred_at DESC LIMIT 1) AS last_tick_at,
  (SELECT count(*)::int FROM automation_audit_ledger
     WHERE action = 'CRON_TICK_EXECUTED') AS tick_count,
  (SELECT occurred_at FROM automation_audit_ledger ORDER BY occurred_at DESC LIMIT 1) AS last_audit_at
`;

/**
 * Construit le rapporteur `/readyz`. Toutes les dépendances sont injectées :
 * ce module ne construit aucun client et n'ouvre aucune connexion.
 */
export function createReadinessReporter(dependencies: ReadinessDependencies): () => Promise<ReadinessReport> {
  const clock = dependencies.now ?? (() => new Date());

  return async function report(): Promise<ReadinessReport> {
    const checks: ReadinessCheck[] = [];
    const cadence = readDeclaredCronCadence(dependencies.env);

    /* 1 — Worker vivant : la seule observation certaine est l'exécution courante. */
    checks.push(check('worker', 'ok', 'Le Worker répond : runtime observé et environnement déclaré consignés.', {
      runtime: dependencies.runtime.runtime,
      declaredEnvironment: dependencies.runtime.declaredEnvironment,
      apiVersion: READINESS_API_VERSION,
      hyperdriveBinding: dependencies.runtime.hyperdriveBinding,
      cronDeclared: Boolean(cadence),
    }));

    /* 2 — PostgreSQL : sonde réelle, jamais déduite de la configuration. */
    if (dependencies.probe) {
      const health = await dependencies.probe.check();
      checks.push(check(
        'postgres',
        health.reachable ? 'ok' : 'blocked',
        health.reachable
          ? `Sonde SELECT 1 réussie (${health.latencyMs ?? '?'} ms).`
          : `Sonde SELECT 1 en échec : ${health.error ?? 'motif non exposé'}`,
        {
          mode: dependencies.decision.kind,
          reason: dependencies.decision.reason,
          durable: true,
          reachable: health.reachable,
          latencyMs: health.latencyMs ?? null,
          source: dependencies.target?.source ?? null,
          host: dependencies.target?.host ?? null,
          database: dependencies.target?.database ?? null,
          sslRequired: dependencies.target?.sslRequired ?? null,
        },
      ));
    } else {
      checks.push(check(
        'postgres',
        'blocked',
        `Aucune sonde disponible : persistance « ${dependencies.decision.kind} » (${dependencies.decision.reason}).`,
        { mode: dependencies.decision.kind, reason: dependencies.decision.reason, durable: dependencies.decision.kind === 'postgres' },
      ));
    }

    /* 3 — Migrations : lues dans `schema_migrations`, jamais supposées. */
    if (dependencies.database) {
      const state: MigrationState = await readMigrationState(dependencies.database);
      checks.push(check(
        'migrations',
        state.status === 'applied' ? 'ok' : 'blocked',
        state.status === 'applied'
          ? `${state.applied.length} migrations attendues appliquées, aucune en attente.`
          : state.status === 'pending'
            ? `Migrations en attente : ${state.pending.join(', ')}.`
            : state.detail ?? 'État des migrations indisponible.',
        { status: state.status, applied: state.applied.length, pending: state.pending.length },
      ));
    } else {
      checks.push(check('migrations', 'blocked', 'Aucune base durable : état des migrations non vérifiable.', { status: 'unknown' }));
    }

    /* 4 — File durable + 5 — Cron + 10 — Audit : une seule lecture bornée. */
    if (dependencies.database) {
      try {
        const result = await dependencies.database.query<QueueAuditRow>(QUEUE_AUDIT_SQL, [staleClaimSeconds()]);
        const row = result.rows[0];
        const dueEvents = toCount(row?.due_events) ?? 0;
        const dueJobs = toCount(row?.due_jobs) ?? 0;
        const staleEvents = toCount(row?.stale_events) ?? 0;
        const staleJobs = toCount(row?.stale_jobs) ?? 0;
        const deadLettered = toCount(row?.dead_lettered_events) ?? 0;
        const lastTickAt = toIso(row?.last_tick_at);
        const tickCount = toCount(row?.tick_count) ?? 0;
        const lastAuditAt = toIso(row?.last_audit_at);

        const staleClaims = staleEvents + staleJobs;
        const queueStatus: ReadinessCheckStatus = deadLettered > 0 || staleClaims > 0 ? 'degraded' : 'ok';
        checks.push(check(
          'queue',
          queueStatus,
          queueStatus === 'ok'
            ? 'File durable lisible : aucun message en dead-letter, aucun claim orphelin.'
            : `File durable lisible mais attention requise (dead-letter ${deadLettered}, claims orphelins ${staleClaims}).`,
          { dueEvents, dueJobs, staleClaims, deadLettered },
        ));

        const cronStatus: ReadinessCheckStatus = !cadence ? 'blocked' : lastTickAt ? 'ok' : 'degraded';
        checks.push(check(
          'cron',
          cronStatus,
          !cadence
            ? 'Aucune cadence déclarée (CRON_CADENCE absente) : la planification n’est pas prouvable.'
            : lastTickAt
              ? `Cadence déclarée « ${cadence} » et dernier tick réellement tracé.`
              : `Cadence déclarée « ${cadence} » mais AUCUN tick tracé : le déclencheur n’a pas encore tourné.`,
          { declaredCadence: cadence, lastTickAt, tickCount },
        ));

        checks.push(check(
          'audit',
          lastAuditAt ? 'ok' : 'degraded',
          lastAuditAt
            ? 'Ledger d’audit lisible (dernière entrée horodatée).'
            : 'Ledger d’audit lisible mais aucune entrée enregistrée.',
          { lastAuditAt, cronTicks: tickCount },
        ));
      } catch (error) {
        const detail = `File durable/ledger inaccessibles : ${safeError(error)}`;
        checks.push(check('queue', 'blocked', detail));
        checks.push(check('cron', 'blocked', detail));
        checks.push(check('audit', 'blocked', detail));
      }
    } else {
      checks.push(check('queue', 'blocked', 'Aucune base durable : la file ne peut pas être vérifiée.'));
      checks.push(check('cron', 'blocked', cadence ? 'Cadence déclarée mais aucun ledger pour prouver un tick.' : 'Aucune cadence déclarée.', { declaredCadence: cadence }));
      checks.push(check('audit', 'blocked', 'Aucune base durable : le ledger d’audit n’est pas vérifiable.'));
    }

    /* 6 — Worker d'automatisation. */
    if (dependencies.automationWorker) {
      checks.push(check(
        'automation',
        'ok',
        'Worker d’automatisation composé : handlers d’événements et de jobs déclarés.',
        {
          handledEventTypes: dependencies.automationWorker.handledEventTypes.length,
          handledJobTypes: dependencies.automationWorker.handledJobTypes.length,
        },
      ));
    } else {
      checks.push(check('automation', 'blocked', 'Worker d’automatisation non composé : automatisations planifiées inopérantes.'));
    }

    /* 7 — Notifications In-App : lecture bornée (aucune diffusion, aucune écriture). */
    if (dependencies.notificationsAvailable && dependencies.database) {
      try {
        const result = await dependencies.database.query<{ last_notification_at: unknown }>(
          'SELECT (SELECT created_at FROM notifications ORDER BY created_at DESC LIMIT 1) AS last_notification_at',
        );
        const lastNotificationAt = toIso(result.rows[0]?.last_notification_at);
        checks.push(check(
          'notifications',
          'ok',
          'Boîte In-App lisible (lecture bornée d’une ligne).',
          { lastNotificationAt },
        ));
      } catch (error) {
        checks.push(check('notifications', 'blocked', `Boîte In-App illisible : ${safeError(error)}`));
      }
    } else {
      checks.push(check('notifications', 'blocked', 'Service de notification non composé (routes 501).'));
    }

    /* 8 — Documents : lecture bornée des métadonnées (le contenu reste protégé). */
    if (dependencies.documentsAvailable && dependencies.database) {
      try {
        const result = await dependencies.database.query<{ last_document_at: unknown }>(
          'SELECT (SELECT created_at FROM documents ORDER BY created_at DESC LIMIT 1) AS last_document_at',
        );
        const lastDocumentAt = toIso(result.rows[0]?.last_document_at);
        checks.push(check(
          'documents',
          'ok',
          'Métadonnées documentaires lisibles (aucun accès au contenu, aucun object_key exposé).',
          { lastDocumentAt },
        ));
      } catch (error) {
        checks.push(check('documents', 'blocked', `Métadonnées documentaires illisibles : ${safeError(error)}`));
      }
    } else {
      checks.push(check('documents', 'blocked', 'Dépôt documentaire non composé (base durable et stockage objet requis).'));
    }

    /* 9 — R2 : sonde `head` sur une clé dédiée — jamais d'écriture. */
    const bucket = dependencies.env.DOCUMENTS_BUCKET as R2HeadLike | undefined;
    if (bucket && typeof bucket.head === 'function') {
      try {
        const found = await bucket.head(R2_READINESS_PROBE_KEY);
        checks.push(check(
          'r2',
          'ok',
          'Binding R2 répondant à une lecture `head` (aucune écriture effectuée).',
          { binding: 'DOCUMENTS_BUCKET', probeKey: R2_READINESS_PROBE_KEY, probeObjectPresent: Boolean(found) },
        ));
      } catch (error) {
        checks.push(check('r2', 'blocked', `Binding R2 déclaré mais lecture impossible : ${safeError(error)}`, { binding: 'DOCUMENTS_BUCKET' }));
      }
    } else {
      checks.push(check('r2', 'blocked', 'Aucun binding R2 : le domaine documents reste fermé (aucune présignature simulée).'));
    }

    const resources = auditRuntimeProductionResources(dependencies.env);

    return {
      status: summarizeReadiness(checks),
      apiVersion: READINESS_API_VERSION,
      checkedAt: clock().toISOString(),
      runtime: dependencies.runtime,
      checks,
      resources,
      ...(dependencies.violations && dependencies.violations.length > 0 ? { violations: [...dependencies.violations] } : {}),
    };
  };
}
