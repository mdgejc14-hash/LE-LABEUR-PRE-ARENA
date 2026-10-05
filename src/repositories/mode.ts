/**
 * Sélection explicite MODE DEMO / MODE API (Phase 2).
 *
 * MODE DEMO → MockRepository (défaut, la démo existante n'est pas modifiée).
 * MODE API  → ServerRepository (ApiRepository + pont AppContext) : uniquement
 * si `VITE_DEMO_MODE=false` ET `VITE_API_BASE_PATH` same-origin est fourni.
 *
 * Aucun secret n'est lu ici; seul un chemin same-origin est accepté.
 */

import { createApiAppRepositoryAdapter } from './apiAppAdapter';
import { configureRepositoryAdapter, type AppRepositoryBundle, type RepositoryMode } from './provider';

export interface RepositoryEnvironment {
  VITE_DEMO_MODE?: string;
  VITE_API_BASE_PATH?: string;
}

export interface RepositoryModeDecision {
  mode: RepositoryMode;
  basePath?: string;
  reason: string;
}

export function resolveRepositoryMode(env: RepositoryEnvironment): RepositoryModeDecision {
  const demo = env.VITE_DEMO_MODE?.trim().toLowerCase();
  const basePath = env.VITE_API_BASE_PATH?.trim();
  if (demo !== 'false') {
    return { mode: 'mock', reason: 'VITE_DEMO_MODE n’est pas explicitement "false".' };
  }
  if (!basePath || !basePath.startsWith('/') || basePath.startsWith('//') || /^[a-z]+:/i.test(basePath)) {
    return { mode: 'mock', reason: 'Aucun chemin API same-origin valide n’est configuré.' };
  }
  return { mode: 'api', basePath, reason: 'Backend API same-origin configuré.' };
}

/**
 * Construit le bundle correspondant au mode résolu. Le mock reste disponible et
 * inchangé; le serveur n'est activé qu'en mode API explicite.
 */
export function createRepositoryForEnvironment(env: RepositoryEnvironment): {
  decision: RepositoryModeDecision;
  adapter?: AppRepositoryBundle;
} {
  const decision = resolveRepositoryMode(env);
  if (decision.mode === 'mock') return { decision };
  return { decision, adapter: createApiAppRepositoryAdapter({ basePath: decision.basePath }) };
}

/** À appeler uniquement au point de composition de l'application. */
export function applyRepositoryMode(env: RepositoryEnvironment): RepositoryModeDecision {
  const { decision, adapter } = createRepositoryForEnvironment(env);
  if (adapter) configureRepositoryAdapter(adapter, 'api');
  return decision;
}
