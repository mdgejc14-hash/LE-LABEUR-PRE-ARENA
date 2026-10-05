/**
 * LE LABEUR — Phase 3 : traduction d'une session serveur vers le profil UI.
 *
 * Le serveur est la seule autorité : seuls `id`, `role` et `status` renvoyés
 * par `/api/v1/auth/session` ou `/api/v1/me` sont retenus. Aucun champ fourni
 * par le client (actorId, role, sub, token) n'est accepté ici.
 */

import type { UserProfile, UserRole } from '../types';

const ROLES: readonly UserRole[] = ['CANDIDATE', 'EMPLOYER', 'ADMIN'];

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ROLES.includes(value as UserRole);
}

interface ServerSessionUserShape {
  id?: unknown;
  role?: unknown;
  status?: unknown;
  displayName?: unknown;
  fullName?: unknown;
  name?: unknown;
  email?: unknown;
  avatarUrl?: unknown;
  publicId?: unknown;
}

/**
 * Accepte la forme Phase 2 (`{ authenticated, user, permissions }`) et la forme
 * historique (`{ user, expiresAt }`). Retourne `null` si la session n'est pas
 * exploitable (non authentifiée, rôle inconnu, compte non actif).
 */
export function mapServerSessionToProfile(payload: unknown): UserProfile | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as { authenticated?: unknown; user?: unknown };
  if (envelope.authenticated === false) return null;

  const source = (envelope.user && typeof envelope.user === 'object' ? envelope.user : payload) as ServerSessionUserShape;
  if (typeof source.id !== 'string' || source.id.length === 0) return null;
  if (!isRole(source.role)) return null;
  if (typeof source.status === 'string' && source.status !== 'ACTIVE') return null;

  const displayName = [source.displayName, source.fullName, source.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?? (typeof source.email === 'string' ? source.email : 'Utilisateur LE LABEUR');

  // Profil UI minimal : le reste est chargé par les routes métier authentifiées.
  return {
    ...(source as Record<string, unknown>),
    id: source.id,
    role: source.role,
    fullName: displayName,
    name: displayName,
    email: typeof source.email === 'string' ? source.email : '',
    ...(typeof source.avatarUrl === 'string' ? { avatarUrl: source.avatarUrl } : {}),
  } as unknown as UserProfile;
}
