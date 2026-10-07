/**
 * LE LABEUR — P0-C — entrée Cloudflare Worker réelle.
 *
 * Chaîne réelle visée :
 *   Requête → Worker (workerd) → binding HYPERDRIVE → pool PostgreSQL → réponse
 *
 * Choix d'exécution (validé sous workerd) :
 *  - un pool `pg` est construit PAR REQUÊTE, puis fermé via `ctx.waitUntil` :
 *    Hyperdrive est le pool réel, et réutiliser un pool module-level entre
 *    requêtes conduit à réutiliser une connexion standby devenue invalide
 *    (« code hung » observé sous wrangler dev) ;
 *  - le client n'est construit QUE si la persistance l'exige et qu'une cible
 *    est réellement résolue (binding Hyperdrive ou secret de repli) ; sinon la
 *    composition reste fermée, sans retombée silencieuse ;
 *  - aucune connexion n'est tentée au démarrage : seul `/healthz` sonde la base,
 *    et toutes les erreurs restent expurgées.
 *
 * ⚠️ Cette entrée n'est PAS déployée : aucun compte Cloudflare, aucun ID
 * Hyperdrive et aucune base distante ne sont disponibles dans cette session.
 * P0-CLOUDFLARE-PRODUCTION : le profil `production` de `wrangler.toml` déclare
 * désormais le Cron Trigger (voir `[env.production.triggers]`) ; les bindings
 * Hyperdrive et R2 de production restent absents tant que les ressources
 * n'existent pas (fail-closed documenté, vérifié par
 * `npm run verify:cloudflare`).
 */

import { composeWorker, type WorkerEnvironment } from '../api/entry';
import {
  resolvePostgresTarget,
  type ResolvedPostgresTarget,
} from '../persistence/config';
import { createWorkerPostgresClient, type WorkerPostgresClient } from './pgClient';

export interface CloudflareWorkerEnvironment extends WorkerEnvironment {}

export interface CloudflareWorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface CloudflareWorkerOptions {
  /**
   * Injection (tests/vérifications locales) : remplace le pilote `pg`.
   * En production, le client réel `pg` + Hyperdrive est utilisé.
   */
  createClient?: (target: ResolvedPostgresTarget) => WorkerPostgresClient;
  now?: () => Date;
}

/** Chargement minimal reçu d'un déclenchement planifié Cloudflare. */
export interface CloudflareScheduledEvent {
  readonly cron: string;
  readonly scheduledTime: number;
}

export interface CloudflareWorkerRuntime {
  fetch(request: Request, env: CloudflareWorkerEnvironment, ctx?: CloudflareWorkerExecutionContext): Promise<Response>;
  /**
   * P0-PAY-1 / P0-CRON-QUEUE — point d'ENTRÉE du déclenchement planifié.
   *
   * Garde-fou de sécurité : le trigger ne peut produire AUCUNE action métier
   * arbitraire — il appelle la passée bornée du worker d'automatisation DÉJÀ
   * réel (`runScheduledCycle` = récupération des claims orphelins → événements
   * → paiements échus → jobs échus), puis la maintenance bornée des seules
   * sessions WebRTC éphémères (expiration, redaction, purge). Chaque tick est
   * tracé dans l'audit (`CRON_TICK_EXECUTED`); les transitions WebRTC utilisent
   * aussi le ledger partagé. Aucune file ni ordonnanceur parallèle n'est créé.
   * Les mutations restent dans les workers/services déjà autorisés (handlers
   * déclarés, idempotence, ownership, permissions).
   *
   * P0-CLOUDFLARE-PRODUCTION — le déclencheur est désormais DÉCLARÉ dans le
   * profil `production` de `wrangler.toml` (`[env.production.triggers]`,
   * cadence d'exploitation documentée sur place) : le Cron Trigger Cloudflare
   * appelle CE handler, et rien d'autre. Aucun second ordonnanceur, aucun
   * timer applicatif, aucun `setInterval`, aucune logique métier ici.
   *
   * Sans cible de persistance résolue (aucun binding Hyperdrive, aucun secret
   * de repli), le tick est un NO-OP tracé (`cron_tick_skipped`) : activer le
   * Cron avant la base ne provoque aucune erreur et aucune écriture.
   */
  scheduled?(event: CloudflareScheduledEvent, env: CloudflareWorkerEnvironment, ctx?: CloudflareWorkerExecutionContext): Promise<void>;
  /** Compatibilité/arrêt local : aucun pool n'est conservé entre requêtes. */
  dispose(): Promise<void>;
}

/** Décrit la cible SANS secret (utilisé par `/healthz` et les vérifications). */
export function runtimeTarget(env: WorkerEnvironment): ResolvedPostgresTarget | undefined {
  if (rawPersistenceMode(env) !== 'postgres') return undefined;
  const target = resolvePostgresTarget(env);
  return target.ok ? target.target : undefined;
}

function rawPersistenceMode(env: WorkerEnvironment): string {
  return (env.PERSISTENCE?.trim() || env.IDENTITY_STORE?.trim() || 'closed').toLowerCase();
}

/** Passée bornée par déclenchement (borne d'exploitation, jamais une taille de file). */
/**
 * Limite bornée du drain déclenché par un événement planifié.
 *
 * RESTREINT à ce module (non exporté) : dans un module d'entrée Worker, toute
 * exportation de premier niveau est interprétée par workerd comme un handler.
 * Un nombre exporté ferait échouer le démarrage du runtime — et aucun nombre de
 * drain ne doit donc voyager hors de ce fichier.
 */
const SCHEDULED_DRAIN_LIMIT = 25;

/**
 * Ligne de journal STRUCTURÉE d'un tick de Cron : uniquement des compteurs et
 * des motifs d'état, jamais un identifiant métier, un payload, une chaîne de
 * connexion ou un secret. Volontairement sans dépendance (aucun import de la
 * couche observabilité métier) pour rester dans le chemin d'un déclenchement.
 */
function logTick(
  event: 'cron_tick_executed' | 'cron_tick_skipped' | 'cron_tick_unavailable' | 'cron_tick_failed',
  cron: string,
  startedAt: number,
  counters: Record<string, number | string>,
): void {
  try {
    console.log(JSON.stringify({
      source: 'automation:P0-CRON-QUEUE',
      event,
      cron,
      handler: 'scheduled',
      durationMs: Math.max(0, Date.now() - startedAt),
      ...counters,
    }));
  } catch {
    // Un log ne doit jamais faire échouer un tick.
  }
}

export function createCloudflareWorker(options: CloudflareWorkerOptions = {}): CloudflareWorkerRuntime {
  const createClient = options.createClient ?? createWorkerPostgresClient;

  async function fetch(
    request: Request,
    env: CloudflareWorkerEnvironment,
    ctx?: CloudflareWorkerExecutionContext,
  ): Promise<Response> {
    let created: WorkerPostgresClient | null = null;
    try {
      const target = runtimeTarget(env);
      if (target) {
        try {
          created = createClient(target);
        } catch {
          // Cible déclarée mais client impossible à construire : composition
          // fermée, jamais de bascule vers la mémoire.
          created = null;
        }
      }

      const composition = composeWorker(env, created?.client, {
        ...(options.now ? { now: options.now } : {}),
      });
      const response = await composition.worker.fetch(request);

      if (created) {
        const closing = created.end();
        if (ctx?.waitUntil) ctx.waitUntil(closing);
        else await closing;
      }
      return response;
    } catch (error) {
      if (created) await created.end().catch(() => undefined);
      throw error;
    }
  }

  return {
    async fetch(
      request: Request,
      env: CloudflareWorkerEnvironment,
      ctx?: CloudflareWorkerExecutionContext,
    ): Promise<Response> {
      try {
        return await fetch(request, env, ctx);
      } catch {
        // Dernier rempart : aucune exception ne doit fuir un détail interne.
        return new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Une erreur interne est survenue.',
              requestId: 'unavailable',
            },
          }),
          { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } },
        );
      }
    },

    /**
     * P0-PAY-1 / P0-CRON-QUEUE / P0-WEBRTC — déclenchement planifié : une
     * passée bornée du worker d'automatisation existant (récupération des claims
     * orphelins + Outbox + balayage `SCHEDULED → DUE` + jobs échus), puis la
     * maintenance des sessions temporaires WebRTC (expiration, redaction des
     * messages, purge bornée), sur une construction éphémère du Worker (même
     * discipline que `fetch` : pool créé puis fermé). Aucun second ordonnanceur,
     * aucune queue distincte, aucune route HTTP dédiée et aucun détail interne
     * exposé.
     *
     * OBSERVABILITÉ (P0-CLOUDFLARE-PRODUCTION) — chaque tick produit UNE ligne
     * structurée compacte, composée uniquement de compteurs (jamais un
     * identifiant métier, un payload, une chaîne de connexion ou un secret) :
     *   * `cron_tick_executed`    : tick terminé (compteurs réels du drain) ;
     *   * `cron_tick_skipped`     : tick sans cible de persistance (no-op
     *                               explicite, jamais silencieux) ;
     *   * `cron_tick_unavailable` : client impossible à construire ;
     *   * `cron_tick_failed`      : échec — détail gardé dans l'audit durable
     *                               (`CRON_TICK_FAILED`), jamais dans le log.
     * La trace durable de référence reste le ledger d'audit
     * (`CRON_TICK_EXECUTED`, acteur SYSTEM) : le log n'est qu'un signal
     * d'exploitation.
     */
    async scheduled(
      event: CloudflareScheduledEvent,
      env: CloudflareWorkerEnvironment,
      ctx?: CloudflareWorkerExecutionContext,
    ): Promise<void> {
      const cron = typeof event?.cron === 'string' ? event.cron : 'unknown';
      const run = async (): Promise<void> => {
        let created: WorkerPostgresClient | null = null;
        const startedAt = Date.now();
        try {
          const target = runtimeTarget(env);
          if (!target) {
            logTick('cron_tick_skipped', cron, startedAt, { reason: 'persistence-not-configured' });
            return;
          }
          try {
            created = createClient(target);
          } catch {
            logTick('cron_tick_unavailable', cron, startedAt, { reason: 'client-not-constructed' });
            return;
          }
          const composition = composeWorker(env, created?.client, {
            ...(options.now ? { now: options.now } : {}),
          });
          const report = await composition.automationWorker?.runScheduledCycle({
            limit: SCHEDULED_DRAIN_LIMIT,
            trigger: 'scheduled',
          });
          const webrtcMaintenance = await composition.webrtc?.runScheduledMaintenance();
          if (report || webrtcMaintenance) {
            logTick('cron_tick_executed', cron, startedAt, {
              ...(report ? {
                eventsClaimed: report.events.claimed,
                eventsCompleted: report.events.completed,
                eventsRetried: report.events.retried,
                eventsDeadLettered: report.events.deadLettered,
                paymentsApplied: report.payments.applied,
                jobsClaimed: report.jobs.claimed,
                jobsCompleted: report.jobs.completed,
                jobsRetried: report.jobs.retried,
                jobsFailed: report.jobs.failed,
                staleRecovered: report.recovered.eventsRecovered + report.recovered.jobsRecovered,
              } : {}),
              webrtcExpired: webrtcMaintenance?.expired ?? 0,
              webrtcPurged: webrtcMaintenance?.purged ?? 0,
            });
          }
          if (created) await created.end();
          created = null;
        } catch {
          // Un déclenchement planifié ne propage jamais un détail interne
          // (la trace `CRON_TICK_FAILED` reste dans l'audit si elle a pu
          // être écrite).
          logTick('cron_tick_failed', cron, startedAt, { reason: 'unhandled' });
        } finally {
          if (created) await created.end().catch(() => undefined);
        }
      };
      if (ctx?.waitUntil) {
        ctx.waitUntil(run());
        return;
      }
      await run();
    },

    /** Aucun pool persistant : conservé pour compatibilité d'interface. */
    async dispose(): Promise<void> {
      return undefined;
    },
  };
}

const defaultRuntime = createCloudflareWorker();

export default {
  fetch(
    request: Request,
    env: CloudflareWorkerEnvironment,
    ctx: CloudflareWorkerExecutionContext,
  ): Promise<Response> {
    return defaultRuntime.fetch(request, env, ctx);
  },
  scheduled(
    event: CloudflareScheduledEvent,
    env: CloudflareWorkerEnvironment,
    ctx: CloudflareWorkerExecutionContext,
  ): Promise<void> {
    return defaultRuntime.scheduled!(event, env, ctx);
  },
};
