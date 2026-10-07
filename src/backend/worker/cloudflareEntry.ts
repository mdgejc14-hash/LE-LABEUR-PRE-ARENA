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
 * P0-CLOUDFLARE-PRODUCTION :
 *  - la configuration de production est AUDITÉE avant composition
 *    (`evaluateProductionGuard`) : persistance PostgreSQL exigée, cookie TLS
 *    exigé, aucun override de test, cible PostgreSQL réellement résolue. Toute
 *    violation ferme la frontière (503 motivé) et neutralise `scheduled()` ;
 *  - `/readyz` est servi par la composition (`readiness`) : PostgreSQL,
 *    migrations, file durable, ticks de cron, R2, documents, notifications et
 *    audit, observés — jamais simulés.
 *
 * ⚠️ Aucun déploiement n'est réalisé par cette tranche : aucun compte
 * Cloudflare, aucun ID Hyperdrive et aucune base distante ne sont disponibles.
 * La configuration préparée REFUSE de fonctionner tant que ces ressources
 * n'existent pas réellement.
 */

import { composeWorker, type WorkerEnvironment } from '../api/entry';
import {
  resolvePostgresTarget,
  type ResolvedPostgresTarget,
} from '../persistence/config';
import { createWorkerPostgresClient, type WorkerPostgresClient } from './pgClient';
// P0-CLOUDFLARE-PRODUCTION — invariants de PRODUCTION évalués AVANT toute
// composition : une production mal configurée reste fermée (aucune connexion,
// aucune route métier, aucun travail planifié) au lieu de servir le trafic.
import { evaluateProductionGuard } from './productionGuard';

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
   * arbitraire — il appelle UNIQUEMENT la passée bornée du worker
   * d'automatisation DÉJÀ réel (`runScheduledCycle` = récupération des claims
   * orphelins → événements → paiements échus → jobs échus), et chaque tick est
   * tracé dans l'audit (`CRON_TICK_EXECUTED`). Les actions métier restent dans
   * les workers/services déjà autorisés (handlers déclarés, idempotence,
   * ownership, permissions).
   *
   * P0-CLOUDFLARE-PRODUCTION : le bloc `[triggers]` ACTIF de `wrangler.toml`
   * déclare la cadence (profil par défaut pour `wrangler dev --test-scheduled`,
   * profil `production` pour le déploiement). La cadence est une décision
   * d'EXPLOITATION, publiée par la variable `CRON_CADENCE` et vérifiée par
   * `/readyz` (dernier tick réellement tracé dans le ledger d'audit). Aucun
   * timer applicatif, aucun `setInterval`, aucun second ordonnanceur.
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
    // P0-CLOUDFLARE-PRODUCTION — production invalide : frontière fermée, motif publié.
    const guard = evaluateProductionGuard(env);
    if (guard.blocking) {
      const composition = composeWorker(env, undefined, {
        productionBlock: {
          reason: guard.primaryReason!,
          violations: guard.violations.map(violation => violation.message),
        },
      });
      return composition.worker.fetch(request);
    }

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
     * P0-PAY-1 / P0-CRON-QUEUE — déclenchement planifié : une seule passée
     * bornée (récupération des claims orphelins + Outbox + balayage
     * `SCHEDULED → DUE` + jobs échus), sur une construction éphémère du Worker
     * (même discipline que `fetch` : pool créé puis fermé). Le trigger n'appelle
     * QUE le worker d'automatisation existant — aucune autre méthode, aucune
     * action métier directe. Aucune route HTTP n'existe pour ce parcours et
     * aucune erreur n'est exposée.
     */
    async scheduled(
      event: CloudflareScheduledEvent,
      env: CloudflareWorkerEnvironment,
      ctx?: CloudflareWorkerExecutionContext,
    ): Promise<void> {
      void event;
      const run = async (): Promise<void> => {
        // Une production invalide ne déclenche AUCUN travail planifié : le
        // déclencheur reste sans effet plutôt que d'exécuter une automatisation
        // sur une configuration non prouvée.
        if (evaluateProductionGuard(env).blocking) return;
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
          await composition.automationWorker?.runScheduledCycle({
            limit: SCHEDULED_DRAIN_LIMIT,
            trigger: 'scheduled',
          });
          if (created) await created.end();
          created = null;
        } catch {
          // Un déclenchement planifié ne propage jamais un détail interne
          // (la trace `CRON_TICK_FAILED` reste dans l'audit si elle a pu
          // être écrite).
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
