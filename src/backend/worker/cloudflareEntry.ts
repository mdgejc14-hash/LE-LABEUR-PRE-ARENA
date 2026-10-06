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
   * P0-PAY-1 — point d'ENTRÉE d'un déclenchement planifié : il appelle le worker
   * d'automatisation DÉJÀ réel (`drain()` = événements → paiements échus → jobs
   * de rappel). Aucune planification de production n'est installée ici :
   * aucun bloc `[triggers]`/`crons` dans `wrangler.toml`, aucun timer applicatif,
   * aucun `setInterval`. Déployer ce handler sans ajouter de cron ne déclenche
   * donc rien — c'est une décision d'exploitation ultérieure.
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
     * P0-PAY-1 — déclenchement planifié : une seule passée bornée de l'Outbox,
     * du balayage `SCHEDULED → DUE` et des jobs échus, sur une construction
     * éphémère du Worker (même discipline que `fetch` : pool créé puis fermé).
     * Aucune route HTTP n'existe pour ce parcours et aucune erreur n'est exposée.
     */
    async scheduled(
      event: CloudflareScheduledEvent,
      env: CloudflareWorkerEnvironment,
      ctx?: CloudflareWorkerExecutionContext,
    ): Promise<void> {
      void event;
      const run = async (): Promise<void> => {
        let created: WorkerPostgresClient | null = null;
        try {
          const target = runtimeTarget(env);
          if (!target) return;
          try {
            created = createClient(target);
          } catch {
            return;
          }
          const composition = composeWorker(env, created?.client, {
            ...(options.now ? { now: options.now } : {}),
          });
          await composition.automationWorker?.drain(SCHEDULED_DRAIN_LIMIT);
          if (created) await created.end();
          created = null;
        } catch {
          // Un déclenchement planifié ne propage jamais un détail interne.
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
