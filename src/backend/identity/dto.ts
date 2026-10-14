/**
 * Sérialiseurs de sortie : aucune donnée de session, aucun jeton Google,
 * aucun `sub`, aucun hash et aucun champ interne ne sont exposés.
 */

import type { AuthenticatedActor } from '../productionContracts';
import type { ServerUserRecord } from './stores';

export interface SessionUserDto {
  id: string;
  role: ServerUserRecord['role'];
  status: ServerUserRecord['status'];
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export interface SessionDto {
  authenticated: true;
  user: SessionUserDto;
  /** Permissions effectives, utiles à l'affichage; l'autorisation reste serveur. */
  permissions: readonly string[];
}

export function toSessionUserDto(user: ServerUserRecord): SessionUserDto {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    displayName: user.displayName,
    email: user.email,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
  };
}

export function toSessionDto(actor: AuthenticatedActor, user: ServerUserRecord): SessionDto {
  return {
    authenticated: true,
    user: toSessionUserDto(user),
    permissions: [...actor.permissions],
  };
}

/** Projection ADMIN d'un utilisateur : pas de `sub`, pas de jeton, pas de hash. */
export interface AdminUserDto {
  id: string;
  role: ServerUserRecord['role'];
  status: ServerUserRecord['status'];
  email: string;
  displayName: string;
  createdAt: string;
}

export function toAdminUserDto(user: ServerUserRecord): AdminUserDto {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}
