/**
 * LE LABEUR — Phase 2 : matrice RBAC serveur.
 *
 * Les permissions ne sont jamais lues depuis le client. Elles sont dérivées du
 * rôle stocké en base, au moment de la résolution de la session.
 */

import type { Permission } from '../productionContracts';
import type { UserRole } from '../../types';

export const ADMIN_PERMISSIONS: readonly Permission[] = [
  'users:read:any',
  'users:block',
  'users:unblock',
  'offers:read:any',
  'offers:moderate',
  'applications:read:any',
  'applications:moderate',
  'contracts:read:any',
  'contracts:moderate',
  'payments:read:any',
  'payments:approve',
  'payments:reject',
  'schedules:read:any',
  'incidents:read:any',
  'incidents:arbitrate',
  'replacements:read:any',
  'replacements:manage',
  'notifications:read:any',
  'calls:read:any',
  'match:read:any',
  'communications:read:any',
  'documents:read:any',
  'audit:read',
  'stats:read',
];

/** CANDIDATE et EMPLOYER n'ont aucune permission transverse. */
export function permissionsForRole(role: UserRole): readonly Permission[] {
  return role === 'ADMIN' ? ADMIN_PERMISSIONS : [];
}

export type SelfAssignableRole = Exclude<UserRole, 'ADMIN'>;

export function isSelfAssignableRole(value: unknown): value is SelfAssignableRole {
  return value === 'CANDIDATE' || value === 'EMPLOYER';
}
