/**
 * LE LABEUR — PHASE 4 — garde-fous serveur des déclarations de paiement.
 *
 * Ces fonctions sont appelées **côté serveur uniquement**, après résolution de
 * la session. Elles ne reçoivent jamais un rôle ou un actorId venant du client :
 * `AuthenticatedActor` est construit par l'authentification du Worker.
 *
 * Elles contrôlent, dans cet ordre :
 *   1. l'acteur authentifié ;
 *   2. le rôle (EMPLOYER pour ses propres déclarations, ADMIN + permission) ;
 *   3. la propriété de la déclaration (employerId) ;
 *   4. la validité de la transition d'état.
 */

import type {
  PaymentDeclaration,
  PaymentDeclarationStatus,
} from '../../types';
import {
  assertPaymentDeclarationTransition,
  isPaymentEditableByEmployer,
  normalizeRejectionReason,
} from '../../domain/paymentDeclarations';
import type { AuthenticatedActor, Permission } from '../productionContracts';
import { ApiError } from './errors';
import { requireAdmin, requireAuth } from './security';

/** Vue minimale serveur d'une déclaration : suffisante pour l'autorisation. */
export interface PaymentDeclarationAccessTarget {
  id: string;
  employerId: string;
  status: PaymentDeclarationStatus;
}

export function toPaymentAccessTarget(declaration: PaymentDeclaration): PaymentDeclarationAccessTarget {
  return { id: declaration.id, employerId: declaration.employerId, status: declaration.status };
}

/** Action d'un employeur : authentifié, EMPLOYER, et propriétaire du dossier. */
export function requireEmployerOwnership(
  actor: AuthenticatedActor | null | undefined,
  target: PaymentDeclarationAccessTarget | null | undefined,
): AuthenticatedActor {
  const authenticated = requireAuth(actor);
  if (!target) throw new ApiError('NOT_FOUND', 'Déclaration de paiement introuvable.');
  if (authenticated.role !== 'EMPLOYER') {
    throw new ApiError('FORBIDDEN', 'Action réservée à l’employeur titulaire du contrat.');
  }
  if (authenticated.id !== target.employerId) {
    throw new ApiError('FORBIDDEN', 'Accès interdit : cette déclaration appartient à un autre employeur.');
  }
  return authenticated;
}

/**
 * Lecture : l'employeur propriétaire, ou un ADMIN disposant de la permission
 * explicite. ADMIN n'est jamais un contournement implicite de propriété.
 */
export function requirePaymentReadAccess(
  actor: AuthenticatedActor | null | undefined,
  target: PaymentDeclarationAccessTarget | null | undefined,
  adminPermission: Permission = 'payments:read:any',
): AuthenticatedActor {
  const authenticated = requireAuth(actor);
  if (!target) throw new ApiError('NOT_FOUND', 'Déclaration de paiement introuvable.');
  if (authenticated.id === target.employerId && authenticated.role === 'EMPLOYER') return authenticated;
  requireAdmin(authenticated, adminPermission);
  return authenticated;
}

/** Mutation administrative : rôle ADMIN **et** permission dédiée. */
export function requireAdminPaymentAction(
  actor: AuthenticatedActor | null | undefined,
  permission: Permission,
): AuthenticatedActor {
  const authenticated = requireAuth(actor);
  requireAdmin(authenticated, permission);
  return authenticated;
}

/** Mutation employeur : propriété + état modifiable + transition valide. */
export function requireEmployerPaymentMutation(
  actor: AuthenticatedActor | null | undefined,
  target: PaymentDeclarationAccessTarget | null | undefined,
  nextStatus: PaymentDeclarationStatus,
  options: { requireEditable?: boolean } = {},
): AuthenticatedActor {
  const authenticated = requireEmployerOwnership(actor, target);
  const declarationTarget = target as PaymentDeclarationAccessTarget;
  if (options.requireEditable !== false && !isPaymentEditableByEmployer(declarationTarget.status)) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      `Cette déclaration n’est plus modifiable (statut ${declarationTarget.status}).`,
    );
  }
  requirePaymentTransition(declarationTarget, nextStatus);
  return authenticated;
}

/** Mutation administrative : permission + transition valide. */
export function requireAdminPaymentMutation(
  actor: AuthenticatedActor | null | undefined,
  target: PaymentDeclarationAccessTarget | null | undefined,
  permission: Permission,
  nextStatus: PaymentDeclarationStatus,
): AuthenticatedActor {
  const authenticated = requireAdminPaymentAction(actor, permission);
  if (!target) throw new ApiError('NOT_FOUND', 'Déclaration de paiement introuvable.');
  requirePaymentTransition(target, nextStatus);
  return authenticated;
}

/** La transition doit exister dans la machine d'états (aucune exception client). */
export function requirePaymentTransition(
  target: PaymentDeclarationAccessTarget,
  nextStatus: PaymentDeclarationStatus,
): void {
  try {
    assertPaymentDeclarationTransition(target.status, nextStatus);
  } catch (error) {
    throw new ApiError(
      'BUSINESS_RULE_VIOLATION',
      error instanceof Error ? error.message : 'Transition de paiement interdite.',
    );
  }
}

/** Motif de rejet obligatoire et exploitable (RÈGLE 5). */
export function requirePaymentRejectionReason(reason: string | undefined | null): string {
  try {
    return normalizeRejectionReason(reason);
  } catch (error) {
    throw new ApiError(
      'VALIDATION_ERROR',
      error instanceof Error ? error.message : 'Le motif du rejet est obligatoire.',
      { reason: ['Le motif du rejet est obligatoire.'] },
    );
  }
}
