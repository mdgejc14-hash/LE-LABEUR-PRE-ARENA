/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — invariants de PRODUCTION.
 *
 * Objectif : rendre impossible le déploiement d'une production « ouverte par
 * accident » — c'est-à-dire une production qui servirait le trafic avec une
 * persistance non durable, un cookie non TLS, un override de test, ou sans la
 * moindre cible PostgreSQL résolue.
 *
 * Ce module est PUR : il lit le nom d'environnement déclaré et l'environnement
 * du Worker, et produit une DÉCISION. Il ne se connecte à rien, ne lit aucun
 * secret et ne journalise aucune valeur.
 *
 * Portée volontairement limitée : les invariants ne s'appliquent QUE si
 * `WORKER_ENV` vaut exactement `production`. Les profils `development`,
 * `workerd-local`, `test-local` (tests et vérifications) ne sont pas affectés.
 */

import {
  requestedPersistenceMode,
  resolvePostgresTarget,
  type PersistenceReason,
  type WorkerPersistenceEnvironment,
} from '../persistence/config';

/** Code d'invariant — la valeur est aussi le motif publié par `/healthz`. */
export type ProductionGuardCode = Extract<
  PersistenceReason,
  | 'production-requires-postgres'
  | 'production-insecure-cookie'
  | 'production-test-jwks-override'
  | 'production-missing-hyperdrive'
>;

export interface ProductionGuardViolation {
  code: ProductionGuardCode;
  /** Message expurgé (aucune valeur de secret, aucune chaîne de connexion). */
  message: string;
  /** Conséquence RÉELLE sur le service (fermeture franche). */
  consequence: string;
}

export interface ProductionGuardEnvironment extends WorkerPersistenceEnvironment {
  WORKER_ENV?: string;
  COOKIE_SECURE?: string;
  TEST_ONLY_GOOGLE_JWKS_URL?: string;
}

export interface ProductionGuardEvaluation {
  /** L'environnement déclaré est-il `production` ? (jamais déduit) */
  production: boolean;
  violations: ProductionGuardViolation[];
  /** `true` dès qu'une violation existe : la frontière reste fermée. */
  blocking: boolean;
  /** Motif publié par `/healthz` (première violation, par ordre de priorité). */
  primaryReason: ProductionGuardCode | null;
}

export const PRODUCTION_ENVIRONMENT_NAME = 'production';

/**
 * Évalue les invariants de production. Ordre de priorité (le premier motif est
 * celui publié par `/healthz`) :
 *   1. persistance PostgreSQL exigée ;
 *   2. cookie de session TLS exigé ;
 *   3. aucun override de test ;
 *   4. cible PostgreSQL réellement résolue (binding Hyperdrive).
 */
export function evaluateProductionGuard(env: ProductionGuardEnvironment): ProductionGuardEvaluation {
  const production = env.WORKER_ENV?.trim().toLowerCase() === PRODUCTION_ENVIRONMENT_NAME;
  if (!production) {
    return { production: false, violations: [], blocking: false, primaryReason: null };
  }

  const violations: ProductionGuardViolation[] = [];
  const mode = requestedPersistenceMode(env);

  if (mode !== 'postgres') {
    violations.push({
      code: 'production-requires-postgres',
      message: `Persistance déclarée « ${mode ?? 'absente'} » : la production exige ` +
        'PERSISTENCE=postgres (aucune retombée mémoire, aucune frontière ouverte sans durabilité).',
      consequence: 'Worker fermé : /healthz 503 `degraded`, routes métier 501, déclencheur périodique sans effet.',
    });
  }

  if (env.COOKIE_SECURE?.trim().toLowerCase() === 'false') {
    violations.push({
      code: 'production-insecure-cookie',
      message: 'COOKIE_SECURE=false est refusé en production : aucun cookie de session ne doit circuler en clair.',
      consequence: 'Aucune session n’est servie (fermeture franche) tant que la valeur n’est pas corrigée.',
    });
  }

  if (env.TEST_ONLY_GOOGLE_JWKS_URL?.trim()) {
    violations.push({
      code: 'production-test-jwks-override',
      message: 'TEST_ONLY_GOOGLE_JWKS_URL est défini en production : un override de vérification de test ne doit ' +
        'jamais accompagner un déploiement (la valeur est de toute façon ignorée hors boucle locale).',
      consequence: 'Déploiement refusé par la frontière : la configuration est considérée invalide.',
    });
  }

  const target = resolvePostgresTarget(env);
  if (!target.ok) {
    violations.push({
      code: 'production-missing-hyperdrive',
      message: `Aucune cible PostgreSQL exploitable (${target.reason}) : le binding Hyperdrive de production ` +
        'doit être créé et reporté dans wrangler.toml avant tout déploiement.',
      consequence: 'Persistance `misconfigured` : /healthz 503, aucun client construit, aucun travail planifié exécuté.',
    });
  }

  return {
    production: true,
    violations,
    blocking: violations.length > 0,
    primaryReason: violations[0]?.code ?? null,
  };
}
