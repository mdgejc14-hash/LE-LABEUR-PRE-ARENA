import type { AuthenticatedActor, Permission } from '../productionContracts';
import { ApiError } from './errors';

/** Fails closed if a route has no server-authenticated actor. */
export function requireAuth(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) {
    throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  }
  return actor;
}

export function requireRole(actor: AuthenticatedActor, role: AuthenticatedActor['role']): void {
  if (actor.role !== role) {
    throw new ApiError('FORBIDDEN', 'Accès interdit.');
  }
}

export function requirePermission(actor: AuthenticatedActor, permission: Permission): void {
  if (!actor.permissions.includes(permission)) {
    throw new ApiError('FORBIDDEN', 'Accès interdit.');
  }
}

/**
 * Ownership is checked against server-loaded resource data. ADMIN is not an
 * implicit ownership bypass; a specific permission is required when a route
 * intentionally allows an administrator to act on another user's resource.
 */
export function requireParticipant(actor: AuthenticatedActor, participantIds: readonly string[]): void {
  if (!participantIds.includes(actor.id)) {
    throw new ApiError('FORBIDDEN', 'Accès interdit.');
  }
}

export function requireOwnership(
  actor: AuthenticatedActor,
  ownerId: string,
  adminOverridePermission?: Permission,
): void {
  if (actor.id === ownerId) return;
  if (actor.role === 'ADMIN' && adminOverridePermission) {
    requirePermission(actor, adminOverridePermission);
    return;
  }
  throw new ApiError('FORBIDDEN', 'Accès interdit.');
}

export function requireAdmin(actor: AuthenticatedActor, permission?: Permission): void {
  requireRole(actor, 'ADMIN');
  if (permission) requirePermission(actor, permission);
}
