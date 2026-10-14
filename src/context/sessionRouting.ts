/**
 * LE LABEUR — Phase 3 : routage d'après le rôle **de la session serveur**.
 *
 * Ces règles ne sont qu'une commodité d'UX. L'autorisation réelle reste
 * côté serveur (RBAC du Worker, Phase 2) : masquer un écran n'est pas une
 * protection.
 */

import type { UserRole } from '../types';
import type { RepositoryMode } from '../repositories/provider';

/** Sous-ensemble des onglets de `MainTab` utilisés comme atterrissage. */
export type MainTabName = 'DISCOVER' | 'DASHBOARD';

export const ROLE_PREFERENCE_STORAGE_KEY = 'lelabeur_v5_selected_role';

/** Onglet d'atterrissage par rôle authentifié. */
export function landingTabForRole(role: UserRole): MainTabName {
  return role === 'EMPLOYER' || role === 'ADMIN' ? 'DASHBOARD' : 'DISCOVER';
}

/**
 * En MODE API, la préférence de rôle stockée dans le navigateur n'est jamais
 * une identité : elle n'est qu'un pré-réglage d'écran avant authentification.
 * Un rôle ADMIN mémorisé ne doit jamais être restauré sans session serveur.
 */
export function initialRoleForMode(mode: RepositoryMode, storedRole: string | null): UserRole {
  if (storedRole !== 'EMPLOYER' && storedRole !== 'CANDIDATE' && storedRole !== 'ADMIN') return 'CANDIDATE';
  if (mode === 'api' && storedRole === 'ADMIN') return 'CANDIDATE';
  return storedRole;
}

/** En MODE API, une session serveur valide restaure directement l'espace. */
export function shouldRestoreAuthenticatedScreen(mode: RepositoryMode, hasServerSession: boolean): boolean {
  return mode === 'api' && hasServerSession;
}

/** L'accès à la frontière ADMIN demande une session serveur de rôle ADMIN. */
export function canReachAdminBoundary(role: UserRole | null | undefined, hasServerSession: boolean): boolean {
  return hasServerSession && role === 'ADMIN';
}

export function readStoredRolePreference(storage: Pick<Storage, 'getItem'> | null | undefined): string | null {
  try {
    return storage?.getItem(ROLE_PREFERENCE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function clearStoredRolePreference(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    storage?.removeItem(ROLE_PREFERENCE_STORAGE_KEY);
  } catch {
    // Le stockage navigateur n'est jamais une source d'autorité : échec ignoré.
  }
}
