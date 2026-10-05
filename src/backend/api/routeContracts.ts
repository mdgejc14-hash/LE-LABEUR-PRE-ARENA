import type { Permission } from '../productionContracts';
import type { UserRole } from '../../types';

export type ApiRouteScope = 'public' | 'self' | 'owner' | 'participant' | 'admin';

export interface ApiRouteContract {
  key: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  authentication: 'public' | 'required';
  scope: ApiRouteScope;
  roles?: readonly UserRole[];
  permission?: Permission;
  collection?: boolean;
  idempotency?: boolean;
  /** Future mutating handlers must append their audit event in the same transaction. */
  auditOnMutation?: boolean;
}

/**
 * Contract catalog only. The Phase 1 Worker enforces authentication/RBAC and
 * returns NOT_IMPLEMENTED until a persistent domain handler is installed.
 */
export const API_ROUTE_CONTRACTS = [
  { key: 'auth.session', method: 'GET', path: '/api/v1/auth/session', authentication: 'required', scope: 'self' },
  { key: 'auth.google.credential', method: 'POST', path: '/api/v1/auth/google/credential', authentication: 'public', scope: 'public' },
  { key: 'auth.logout', method: 'POST', path: '/api/v1/auth/logout', authentication: 'required', scope: 'self', auditOnMutation: true },
  { key: 'auth.google', method: 'POST', path: '/api/v1/auth/google', authentication: 'public', scope: 'public' },
  { key: 'me.read', method: 'GET', path: '/api/v1/me', authentication: 'required', scope: 'self' },

  { key: 'users.me.read', method: 'GET', path: '/api/v1/users/me', authentication: 'required', scope: 'self' },
  { key: 'users.me.update', method: 'PATCH', path: '/api/v1/users/me', authentication: 'required', scope: 'self', auditOnMutation: true },
  { key: 'users.profile.read', method: 'GET', path: '/api/v1/users/:userId', authentication: 'required', scope: 'owner' },
  { key: 'users.candidates.list', method: 'GET', path: '/api/v1/directory/candidates', authentication: 'public', scope: 'public', collection: true },
  { key: 'users.employers.list', method: 'GET', path: '/api/v1/directory/employers', authentication: 'public', scope: 'public', collection: true },

  { key: 'offers.public.list', method: 'GET', path: '/api/v1/offers', authentication: 'public', scope: 'public', collection: true },
  { key: 'offers.public.read', method: 'GET', path: '/api/v1/offers/:offerId', authentication: 'public', scope: 'public' },
  { key: 'offers.mine.list', method: 'GET', path: '/api/v1/my/offers', authentication: 'required', scope: 'self', collection: true, roles: ['EMPLOYER'] },
  { key: 'offers.create', method: 'POST', path: '/api/v1/offers', authentication: 'required', scope: 'self', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'offers.status.update', method: 'PATCH', path: '/api/v1/offers/:offerId/status', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'offers.favorites.list', method: 'GET', path: '/api/v1/my/favorites', authentication: 'required', scope: 'self' },
  { key: 'offers.favorites.toggle', method: 'POST', path: '/api/v1/offers/:offerId/favorite', authentication: 'required', scope: 'self', idempotency: true, auditOnMutation: true },

  { key: 'applications.mine.list', method: 'GET', path: '/api/v1/my/applications', authentication: 'required', scope: 'self', collection: true, roles: ['CANDIDATE'] },
  { key: 'applications.employer.list', method: 'GET', path: '/api/v1/employer/applications', authentication: 'required', scope: 'self', collection: true, roles: ['EMPLOYER'] },
  { key: 'applications.offer.list', method: 'GET', path: '/api/v1/offers/:offerId/applications', authentication: 'required', scope: 'owner', collection: true, roles: ['EMPLOYER'] },
  { key: 'applications.read', method: 'GET', path: '/api/v1/applications/:applicationId', authentication: 'required', scope: 'owner' },
  { key: 'applications.create', method: 'POST', path: '/api/v1/offers/:offerId/applications', authentication: 'required', scope: 'self', roles: ['CANDIDATE'], idempotency: true, auditOnMutation: true },
  { key: 'applications.withdraw', method: 'POST', path: '/api/v1/applications/:applicationId/withdraw', authentication: 'required', scope: 'owner', roles: ['CANDIDATE'], idempotency: true, auditOnMutation: true },
  { key: 'applications.examine', method: 'POST', path: '/api/v1/applications/:applicationId/examine', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'applications.shortlist', method: 'POST', path: '/api/v1/applications/:applicationId/shortlist', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'applications.reject', method: 'POST', path: '/api/v1/applications/:applicationId/reject', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },

  { key: 'proposals.create', method: 'POST', path: '/api/v1/conversations/:conversationId/proposals', authentication: 'required', scope: 'participant', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'proposals.respond', method: 'POST', path: '/api/v1/proposals/:proposalId/respond', authentication: 'required', scope: 'participant', roles: ['CANDIDATE'], idempotency: true, auditOnMutation: true },

  { key: 'contracts.mine.list', method: 'GET', path: '/api/v1/my/contracts', authentication: 'required', scope: 'self', collection: true },
  { key: 'contracts.read', method: 'GET', path: '/api/v1/contracts/:contractId', authentication: 'required', scope: 'owner' },
  { key: 'contracts.create', method: 'POST', path: '/api/v1/contracts', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'contracts.sign', method: 'POST', path: '/api/v1/contracts/:contractId/sign', authentication: 'required', scope: 'owner', idempotency: true, auditOnMutation: true },
  { key: 'contracts.monthly-action', method: 'POST', path: '/api/v1/contracts/:contractId/monthly-actions', authentication: 'required', scope: 'owner', idempotency: true, auditOnMutation: true },

  { key: 'payments.mine.list', method: 'GET', path: '/api/v1/my/payments', authentication: 'required', scope: 'self', collection: true },
  { key: 'payments.read', method: 'GET', path: '/api/v1/payments/:paymentId', authentication: 'required', scope: 'owner' },
  { key: 'payments.contract.list', method: 'GET', path: '/api/v1/contracts/:contractId/payments', authentication: 'required', scope: 'owner', collection: true },
  { key: 'payments.commission.declare', method: 'POST', path: '/api/v1/payments/commission-declarations', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'schedules.mine.list', method: 'GET', path: '/api/v1/my/schedules', authentication: 'required', scope: 'self', collection: true },

  /* PHASE 4 — déclarations de paiement employeur (paiement externe déclaré).
     Toutes les mutations exigent une clé d'idempotence et un audit serveur. */
  { key: 'payments.declarations.create', method: 'POST', path: '/api/v1/payment-declarations', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'payments.declarations.mine.list', method: 'GET', path: '/api/v1/employer/payment-declarations', authentication: 'required', scope: 'self', collection: true, roles: ['EMPLOYER'] },
  { key: 'payments.declarations.read', method: 'GET', path: '/api/v1/payment-declarations/:paymentId', authentication: 'required', scope: 'owner' },
  { key: 'payments.declarations.update', method: 'PATCH', path: '/api/v1/payment-declarations/:paymentId', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'payments.declarations.submit', method: 'POST', path: '/api/v1/payment-declarations/:paymentId/submit', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'payments.declarations.resubmit', method: 'POST', path: '/api/v1/payment-declarations/:paymentId/resubmit', authentication: 'required', scope: 'owner', roles: ['EMPLOYER'], idempotency: true, auditOnMutation: true },
  { key: 'payments.declarations.history', method: 'GET', path: '/api/v1/payment-declarations/:paymentId/history', authentication: 'required', scope: 'owner', collection: true },

  { key: 'incidents.mine.list', method: 'GET', path: '/api/v1/my/incidents', authentication: 'required', scope: 'self', collection: true },
  { key: 'incidents.read', method: 'GET', path: '/api/v1/incidents/:incidentId', authentication: 'required', scope: 'owner' },
  { key: 'incidents.report', method: 'POST', path: '/api/v1/incidents', authentication: 'required', scope: 'owner', idempotency: true, auditOnMutation: true },
  { key: 'replacements.mine.list', method: 'GET', path: '/api/v1/my/replacements', authentication: 'required', scope: 'self', collection: true },
  { key: 'replacements.read', method: 'GET', path: '/api/v1/replacements/:replacementId', authentication: 'required', scope: 'owner' },

  { key: 'messages.conversations.mine', method: 'GET', path: '/api/v1/my/conversations', authentication: 'required', scope: 'self', collection: true },
  { key: 'messages.conversation.create', method: 'POST', path: '/api/v1/conversations', authentication: 'required', scope: 'participant', idempotency: true, auditOnMutation: true },
  { key: 'messages.conversation.list', method: 'GET', path: '/api/v1/conversations/:conversationId/messages', authentication: 'required', scope: 'participant', collection: true },
  { key: 'messages.send', method: 'POST', path: '/api/v1/conversations/:conversationId/messages', authentication: 'required', scope: 'participant', idempotency: true, auditOnMutation: true },
  { key: 'messages.read', method: 'POST', path: '/api/v1/conversations/:conversationId/read', authentication: 'required', scope: 'participant', idempotency: true, auditOnMutation: true },
  { key: 'notifications.mine.list', method: 'GET', path: '/api/v1/my/notifications', authentication: 'required', scope: 'self', collection: true },
  { key: 'notifications.read', method: 'POST', path: '/api/v1/notifications/:notificationId/read', authentication: 'required', scope: 'self', idempotency: true, auditOnMutation: true },
  { key: 'notifications.read-all', method: 'POST', path: '/api/v1/my/notifications/read-all', authentication: 'required', scope: 'self', idempotency: true, auditOnMutation: true },

  { key: 'calls.mine.list', method: 'GET', path: '/api/v1/my/calls', authentication: 'required', scope: 'self', collection: true },
  { key: 'calls.create', method: 'POST', path: '/api/v1/calls', authentication: 'required', scope: 'self', idempotency: true, auditOnMutation: true },
  { key: 'calls.accept', method: 'POST', path: '/api/v1/calls/:callId/accept', authentication: 'required', scope: 'participant', idempotency: true, auditOnMutation: true },
  { key: 'calls.reject', method: 'POST', path: '/api/v1/calls/:callId/reject', authentication: 'required', scope: 'participant', idempotency: true, auditOnMutation: true },
  { key: 'calls.end', method: 'POST', path: '/api/v1/calls/:callId/end', authentication: 'required', scope: 'participant', idempotency: true, auditOnMutation: true },
  { key: 'calls.signaling-credential', method: 'POST', path: '/api/v1/calls/signaling-credential', authentication: 'required', scope: 'participant' },
  { key: 'calls.ice-configuration', method: 'POST', path: '/api/v1/calls/:callId/ice-configuration', authentication: 'required', scope: 'participant' },
  { key: 'calls.call-signaling-credential', method: 'POST', path: '/api/v1/calls/:callId/signaling-credential', authentication: 'required', scope: 'participant' },
  { key: 'resources.published.list', method: 'GET', path: '/api/v1/resources', authentication: 'public', scope: 'public', collection: true },
  { key: 'resources.published.read', method: 'GET', path: '/api/v1/resources/:resourceId', authentication: 'public', scope: 'public' },
  { key: 'documents.mine.list', method: 'GET', path: '/api/v1/my/documents', authentication: 'required', scope: 'self', collection: true },
  { key: 'documents.upload-grant', method: 'POST', path: '/api/v1/documents/upload-grants', authentication: 'required', scope: 'self', idempotency: true, auditOnMutation: true },
  { key: 'documents.signed-download', method: 'POST', path: '/api/v1/documents/:documentId/signed-download-url', authentication: 'required', scope: 'owner' },

  { key: 'admin.documents.list', method: 'GET', path: '/api/v1/admin/documents', authentication: 'required', scope: 'admin', permission: 'documents:read:any', collection: true },
  { key: 'admin.calls.list', method: 'GET', path: '/api/v1/admin/calls', authentication: 'required', scope: 'admin', permission: 'calls:read:any', collection: true },
  { key: 'admin.match-events.list', method: 'GET', path: '/api/v1/admin/match-events', authentication: 'required', scope: 'admin', permission: 'match:read:any', collection: true },
  { key: 'admin.communication-events.list', method: 'GET', path: '/api/v1/admin/communication-events', authentication: 'required', scope: 'admin', permission: 'communications:read:any', collection: true },
  { key: 'admin.whatsapp-events.list', method: 'GET', path: '/api/v1/admin/whatsapp-events', authentication: 'required', scope: 'admin', permission: 'communications:read:any', collection: true },

  { key: 'admin.users.list', method: 'GET', path: '/api/v1/admin/users', authentication: 'required', scope: 'admin', permission: 'users:read:any', collection: true },
  { key: 'admin.users.block', method: 'POST', path: '/api/v1/admin/users/:userId/block', authentication: 'required', scope: 'admin', permission: 'users:block', idempotency: true, auditOnMutation: true },
  { key: 'admin.users.unblock', method: 'POST', path: '/api/v1/admin/users/:userId/unblock', authentication: 'required', scope: 'admin', permission: 'users:unblock', idempotency: true, auditOnMutation: true },
  { key: 'admin.offers.list', method: 'GET', path: '/api/v1/admin/offers', authentication: 'required', scope: 'admin', permission: 'offers:read:any', collection: true },
  { key: 'admin.applications.list', method: 'GET', path: '/api/v1/admin/applications', authentication: 'required', scope: 'admin', permission: 'applications:read:any', collection: true },
  { key: 'admin.proposals.list', method: 'GET', path: '/api/v1/admin/proposals', authentication: 'required', scope: 'admin', permission: 'applications:read:any', collection: true },
  { key: 'admin.contracts.list', method: 'GET', path: '/api/v1/admin/contracts', authentication: 'required', scope: 'admin', permission: 'contracts:read:any', collection: true },
  { key: 'admin.payments.list', method: 'GET', path: '/api/v1/admin/payments', authentication: 'required', scope: 'admin', permission: 'payments:read:any', collection: true },
  { key: 'admin.payments.approve', method: 'POST', path: '/api/v1/admin/payments/:paymentId/approve', authentication: 'required', scope: 'admin', permission: 'payments:approve', idempotency: true, auditOnMutation: true },
  { key: 'admin.payments.reject', method: 'POST', path: '/api/v1/admin/payments/:paymentId/reject', authentication: 'required', scope: 'admin', permission: 'payments:reject', idempotency: true, auditOnMutation: true },
  /* PHASE 4 — contrôle administratif des déclarations de paiement. */
  { key: 'admin.payment-declarations.list', method: 'GET', path: '/api/v1/admin/payment-declarations', authentication: 'required', scope: 'admin', permission: 'payments:read:any', collection: true },
  { key: 'admin.payment-declarations.read', method: 'GET', path: '/api/v1/admin/payment-declarations/:paymentId', authentication: 'required', scope: 'admin', permission: 'payments:read:any' },
  { key: 'admin.payment-declarations.history', method: 'GET', path: '/api/v1/admin/payment-declarations/:paymentId/history', authentication: 'required', scope: 'admin', permission: 'payments:read:any', collection: true },
  { key: 'admin.payment-declarations.blocking', method: 'GET', path: '/api/v1/admin/payment-declarations/:paymentId/blocking-evaluation', authentication: 'required', scope: 'admin', permission: 'payments:read:any' },
  { key: 'admin.payment-declarations.review', method: 'POST', path: '/api/v1/admin/payment-declarations/:paymentId/review', authentication: 'required', scope: 'admin', permission: 'payments:review', idempotency: true, auditOnMutation: true },
  { key: 'admin.payment-declarations.approve', method: 'POST', path: '/api/v1/admin/payment-declarations/:paymentId/approve', authentication: 'required', scope: 'admin', permission: 'payments:approve', idempotency: true, auditOnMutation: true },
  { key: 'admin.payment-declarations.reject', method: 'POST', path: '/api/v1/admin/payment-declarations/:paymentId/reject', authentication: 'required', scope: 'admin', permission: 'payments:reject', idempotency: true, auditOnMutation: true },
  { key: 'admin.payment-declarations.block-employer', method: 'POST', path: '/api/v1/admin/payment-declarations/:paymentId/block-employer', authentication: 'required', scope: 'admin', permission: 'users:block', idempotency: true, auditOnMutation: true },
  { key: 'admin.payment-declarations.unblock-employer', method: 'POST', path: '/api/v1/admin/payment-declarations/:paymentId/unblock-employer', authentication: 'required', scope: 'admin', permission: 'users:unblock', idempotency: true, auditOnMutation: true },
  { key: 'admin.schedules.list', method: 'GET', path: '/api/v1/admin/schedules', authentication: 'required', scope: 'admin', permission: 'schedules:read:any', collection: true },
  { key: 'admin.incidents.list', method: 'GET', path: '/api/v1/admin/incidents', authentication: 'required', scope: 'admin', permission: 'incidents:read:any', collection: true },
  { key: 'admin.incidents.arbitrate', method: 'POST', path: '/api/v1/admin/incidents/:incidentId/arbitrate', authentication: 'required', scope: 'admin', permission: 'incidents:arbitrate', idempotency: true, auditOnMutation: true },
  { key: 'admin.replacements.list', method: 'GET', path: '/api/v1/admin/replacements', authentication: 'required', scope: 'admin', permission: 'replacements:read:any', collection: true },
  { key: 'admin.replacements.assign', method: 'POST', path: '/api/v1/admin/replacements/:replacementId/assign', authentication: 'required', scope: 'admin', permission: 'replacements:manage', idempotency: true, auditOnMutation: true },
  { key: 'admin.replacements.transfer', method: 'POST', path: '/api/v1/admin/replacements/:replacementId/transfer', authentication: 'required', scope: 'admin', permission: 'replacements:manage', idempotency: true, auditOnMutation: true },
  { key: 'admin.replacements.finalize', method: 'POST', path: '/api/v1/admin/replacements/:replacementId/finalize', authentication: 'required', scope: 'admin', permission: 'replacements:manage', idempotency: true, auditOnMutation: true },
  { key: 'admin.notifications.list', method: 'GET', path: '/api/v1/admin/notifications', authentication: 'required', scope: 'admin', permission: 'notifications:read:any', collection: true },
  { key: 'admin.audit.list', method: 'GET', path: '/api/v1/admin/audit', authentication: 'required', scope: 'admin', permission: 'audit:read', collection: true },
  { key: 'admin.stats.read', method: 'GET', path: '/api/v1/admin/stats', authentication: 'required', scope: 'admin', permission: 'stats:read' },
] as const satisfies readonly ApiRouteContract[];

export type ApiRouteKey = (typeof API_ROUTE_CONTRACTS)[number]['key'];

export function routePathMatches(template: string, pathname: string): boolean {
  const expected = template.split('/').filter(Boolean);
  const actual = pathname.split('/').filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((part, index) => part.startsWith(':') || part === actual[index]);
}

export function findApiRoute(method: string, pathname: string): ApiRouteContract | undefined {
  const normalizedMethod = method.toUpperCase();
  return API_ROUTE_CONTRACTS.find(route => route.method === normalizedMethod && routePathMatches(route.path, pathname));
}

export function findApiPath(pathname: string): boolean {
  return API_ROUTE_CONTRACTS.some(route => routePathMatches(route.path, pathname));
}
