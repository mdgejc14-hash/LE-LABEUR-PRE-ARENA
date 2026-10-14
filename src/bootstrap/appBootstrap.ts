/**
 * LE LABEUR — Phase 3 : point de composition unique du mode de données.
 *
 * MODE DEMO → MockRepository + session mock (comportement existant inchangé).
 * MODE API  → ApiRepository + session serveur (cookie HttpOnly, /me).
 *
 * Les deux ne sont jamais mélangés dans une même requête : un seul bundle est
 * actif pour toute la durée de vie de l'application.
 */

import { applyRepositoryMode, type RepositoryEnvironment, type RepositoryModeDecision } from '../repositories/mode';
import { getRepositoryMode } from '../repositories/provider';

let decision: RepositoryModeDecision | null = null;

export function readViteEnvironment(): RepositoryEnvironment {
  const env = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;
  return {
    VITE_DEMO_MODE: env?.VITE_DEMO_MODE,
    VITE_API_BASE_PATH: env?.VITE_API_BASE_PATH,
  };
}

/** Idempotent : à appeler une seule fois, avant le rendu React. */
export function bootstrapRepositoryMode(env: RepositoryEnvironment = readViteEnvironment()): RepositoryModeDecision {
  decision ??= applyRepositoryMode(env);
  return decision;
}

export function getBootstrapDecision(): RepositoryModeDecision {
  return decision ?? { mode: getRepositoryMode(), reason: 'Composition non initialisée; mode courant du provider.' };
}

export function isApiMode(): boolean {
  return getRepositoryMode() === 'api';
}
