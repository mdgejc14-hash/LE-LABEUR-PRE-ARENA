/**
 * EMP — accès frontend aux routes BACKEND EXISTANTES.
 *
 * Règles absolues :
 *  - aucun endpoint n'est créé, renommé ou contourné ; chaque chemin appelé ici
 *    existe déjà dans `src/backend/api/routeContracts.ts` (vérifié par test) ;
 *  - les DTO non exposés par `src/types/index.ts` sont importés EN TYPE depuis
 *    le backend (aucune dépendance runtime, aucun contrat dupliqué) ;
 *  - transport : `HttpApiClient` same-origin, cookie HttpOnly,
 *    `credentials: 'include'`, `cache: 'no-store'` (fondation P0/P1) ;
 *  - les commandes portent une clé d'idempotence explicite.
 */

import type {
  Application,
  Contract,
  Offer,
  ReplacementDossier,
} from '../types';
import type { ClaimView } from '../backend/disputes/claimRepository';
import type { ClaimStatus, ClaimType } from '../backend/disputes/records';
import type {
  MatchingRunRecord,
  MissionQualificationAnswers,
  MissionQualificationRecord,
} from '../backend/matching/records';
import type { PaymentView } from '../backend/repositories/paymentRepository';
import type { NotificationView } from '../backend/notifications/notificationService';
import type { ServerCreateOfferInput } from '../backend/repositories/contracts';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';

export type { ClaimView, ClaimStatus, ClaimType, MatchingRunRecord, MissionQualificationRecord, MissionQualificationAnswers, PaymentView, NotificationView };

/** Charge utile de création d'une offre : strictement le type serveur. */
export type EmployerOfferDraft = ServerCreateOfferInput;

export interface EmployerClaimDraft {
  contractId: string;
  paymentId?: string;
  type: ClaimType;
  reason: string;
  evidenceReference?: string;
}

export interface EmployerPaymentDeclarationDraft {
  contractId: string;
  paymentId?: string;
  periodKey?: string;
  reference: string;
  externalTransactionId?: string;
  provider?: string;
}

export interface EmployerSession {
  readonly actor: { id: string; role: string; status: string; displayName: string; email?: string };
  readonly permissions: readonly string[];
}

export interface EmployerPage<T> {
  readonly items: T[];
  readonly hasMore: boolean;
  readonly cursor: string | null;
}

/** Chemins réellement appelés par cette interface (gardés par test contre routeContracts.ts). */
export const EMPLOYER_API_PATHS: readonly string[] = [
  '/api/v1/auth/session',
  '/api/v1/my/offers',
  '/api/v1/offers',
  '/api/v1/offers/:offerId',
  '/api/v1/offers/:offerId/status',
  '/api/v1/offers/:offerId/applications',
  '/api/v1/offers/:offerId/qualification',
  '/api/v1/offers/:offerId/matching-runs',
  '/api/v1/matching-runs/:runId',
  '/api/v1/applications/:applicationId/examine',
  '/api/v1/applications/:applicationId/shortlist',
  '/api/v1/applications/:applicationId/reject',
  '/api/v1/my/contracts',
  '/api/v1/contracts/:contractId',
  '/api/v1/contracts/:contractId/send',
  '/api/v1/contracts/:contractId/sign',
  '/api/v1/contracts/:contractId/confirm-execution',
  '/api/v1/contracts/:contractId/terminate',
  '/api/v1/contracts/:contractId/payments',
  '/api/v1/my/payments',
  '/api/v1/payments/:paymentId',
  '/api/v1/payments/commission-declarations',
  '/api/v1/payments/salary-declarations',
  '/api/v1/payments/:paymentId/salary-confirmation-request',
  '/api/v1/contracts/:contractId/payments/close-mission',
  '/api/v1/my/claims',
  '/api/v1/claims',
  '/api/v1/claims/:claimId',
  '/api/v1/claims/:claimId/evidence-requests/:evidenceRequestId/submit',
  '/api/v1/my/replacements',
  '/api/v1/replacements/:replacementId',
  '/api/v1/replacements/:replacementId/offer',
  '/api/v1/my/notifications',
  '/api/v1/notifications/:notificationId/read',
  '/api/v1/my/notifications/read-all',
];

/** Clé d'idempotence explicite (jamais réutilisée entre deux commandes). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `emp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function page<T>(payload: unknown): EmployerPage<T> {
  const value = payload as { items?: unknown; hasMore?: unknown; cursor?: unknown } | null;
  if (!value || !Array.isArray(value.items)) throw new ApiClientError('Réponse paginée invalide.', 500, 'INVALID_RESPONSE');
  return {
    items: value.items as T[],
    hasMore: Boolean(value.hasMore),
    cursor: typeof value.cursor === 'string' ? value.cursor : null,
  };
}

export interface ListOptions {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly signal?: AbortSignal;
}

export class EmployerApi {
  constructor(private readonly client: HttpApiClient) {}

  private list<T>(path: string, options: ListOptions = {}): Promise<EmployerPage<T>> {
    return this.client
      .request<unknown>(path, {
        query: { limit: options.limit ?? 25, cursor: options.cursor ?? null },
        signal: options.signal,
      })
      .then((payload) => page<T>(payload));
  }

  /** Session serveur réelle : rôle, statut de compte et permissions. */
  session(signal?: AbortSignal): Promise<EmployerSession> {
    return this.client
      .request<{ user?: { id?: unknown; role?: unknown; status?: unknown; displayName?: unknown; email?: unknown }; permissions?: unknown }>('/auth/session', { signal })
      .then((payload) => {
        const actor = payload.user;
        if (!actor || typeof actor.id !== 'string' || typeof actor.role !== 'string') {
          throw new ApiClientError('Session serveur illisible.', 401, 'INVALID_RESPONSE');
        }
        return {
          actor: {
            id: actor.id,
            role: actor.role,
            status: typeof actor.status === 'string' ? actor.status : 'UNKNOWN',
            displayName: typeof actor.displayName === 'string' ? actor.displayName : '',
            ...(typeof actor.email === 'string' ? { email: actor.email } : {}),
          },
          permissions: Array.isArray(payload.permissions) ? payload.permissions.filter((item): item is string => typeof item === 'string') : [],
        };
      });
  }

  /* ── Offres (registre employeur, cycle de vie) ── */

  myOffers(options: ListOptions = {}): Promise<EmployerPage<Offer>> {
    return this.list<Offer>('/my/offers', options);
  }

  createOffer(draft: EmployerOfferDraft, signal?: AbortSignal): Promise<Offer> {
    return this.client.request<Offer>('/offers', { method: 'POST', body: draft, idempotencyKey: newIdempotencyKey(), signal });
  }

  setOfferStatus(offerId: string, status: 'ACTIVE' | 'PAUSED' | 'CANCELLED', signal?: AbortSignal): Promise<Offer> {
    return this.client.request<Offer>(`/offers/${encodeURIComponent(offerId)}/status`, {
      method: 'PATCH',
      body: { status },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Candidatures (par offre) ── */

  offerApplications(offerId: string, options: ListOptions = {}): Promise<EmployerPage<Application>> {
    return this.list<Application>(`/offers/${encodeURIComponent(offerId)}/applications`, options);
  }

  applicationAction(applicationId: string, action: 'examine' | 'shortlist' | 'reject', note?: string, signal?: AbortSignal): Promise<Application> {
    const path = `/applications/${encodeURIComponent(applicationId)}/${action}`;
    const body = action === 'reject' ? (note ? { note } : {}) : {};
    return this.client.request<Application>(path, { method: 'POST', body, idempotencyKey: newIdempotencyKey(), signal });
  }

  /* ── Qualification & matching ── */

  qualification(offerId: string, signal?: AbortSignal): Promise<MissionQualificationRecord | null> {
    return this.client.request<MissionQualificationRecord | null>(`/offers/${encodeURIComponent(offerId)}/qualification`, { signal });
  }

  submitQualification(offerId: string, answers: MissionQualificationAnswers, signal?: AbortSignal): Promise<MissionQualificationRecord> {
    return this.client.request<MissionQualificationRecord>(`/offers/${encodeURIComponent(offerId)}/qualification`, {
      method: 'POST',
      body: { answers },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  createMatchingRun(offerId: string, params: { sortBy?: string; sortDirection?: string } = {}, signal?: AbortSignal): Promise<MatchingRunRecord> {
    return this.client.request<MatchingRunRecord>(`/offers/${encodeURIComponent(offerId)}/matching-runs`, {
      method: 'POST',
      body: params,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  matchingRun(runId: string, signal?: AbortSignal): Promise<MatchingRunRecord> {
    return this.client.request<MatchingRunRecord>(`/matching-runs/${encodeURIComponent(runId)}`, { signal });
  }

  /* ── Contrats ── */

  myContracts(options: ListOptions = {}): Promise<EmployerPage<Contract>> {
    return this.list<Contract>('/my/contracts', options);
  }

  contract(contractId: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}`, { signal });
  }

  /** Envoi du contrat au candidat (brouillon → en attente de signature). */
  sendContract(contractId: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/send`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** Constat d'exécution du contrat (aucun corps : l'état réel est dérivé serveur). */
  confirmContractExecution(contractId: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/confirm-execution`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** Signature employeur : la commande ne porte AUCUN corps (identité et horodatage serveur). */
  signContract(contractId: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/sign`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  terminateContract(contractId: string, reason: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/terminate`, {
      method: 'POST',
      body: { reason },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Paiements ── */

  myPayments(options: ListOptions = {}): Promise<EmployerPage<PaymentView>> {
    return this.list<PaymentView>('/my/payments', options);
  }

  payment(paymentId: string, signal?: AbortSignal): Promise<PaymentView> {
    return this.client.request<PaymentView>(`/payments/${encodeURIComponent(paymentId)}`, { signal });
  }

  contractPayments(contractId: string, options: ListOptions = {}): Promise<EmployerPage<PaymentView>> {
    return this.list<PaymentView>(`/contracts/${encodeURIComponent(contractId)}/payments`, options);
  }

  /** Déclaration employeur d'un règlement de commission (hors plateforme). */
  declareCommission(draft: EmployerPaymentDeclarationDraft, signal?: AbortSignal): Promise<PaymentView> {
    return this.client.request<PaymentView>('/payments/commission-declarations', {
      method: 'POST',
      body: draft,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** Déclaration employeur d'un règlement de salaire (hors plateforme). */
  declareSalary(draft: EmployerPaymentDeclarationDraft, signal?: AbortSignal): Promise<PaymentView> {
    return this.client.request<PaymentView>('/payments/salary-declarations', {
      method: 'POST',
      body: draft,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** SALARY CONFIRMATION : demande de confirmation au candidat (OTP côté candidat). */
  requestSalaryConfirmation(paymentId: string, signal?: AbortSignal): Promise<unknown> {
    return this.client.request<unknown>(`/payments/${encodeURIComponent(paymentId)}/salary-confirmation-request`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  closeMissionPayments(contractId: string, signal?: AbortSignal): Promise<unknown> {
    return this.client.request<unknown>(`/contracts/${encodeURIComponent(contractId)}/payments/close-mission`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Claims ── */

  myClaims(options: ListOptions = {}): Promise<EmployerPage<ClaimView>> {
    return this.list<ClaimView>('/my/claims', options);
  }

  claim(claimId: string, signal?: AbortSignal): Promise<ClaimView> {
    return this.client.request<ClaimView>(`/claims/${encodeURIComponent(claimId)}`, { signal });
  }

  createClaim(draft: EmployerClaimDraft, signal?: AbortSignal): Promise<ClaimView> {
    return this.client.request<ClaimView>('/claims', { method: 'POST', body: draft, idempotencyKey: newIdempotencyKey(), signal });
  }

  submitClaimEvidence(claimId: string, evidenceRequestId: string, evidenceReference: string, signal?: AbortSignal): Promise<ClaimView> {
    return this.client.request<ClaimView>(
      `/claims/${encodeURIComponent(claimId)}/evidence-requests/${encodeURIComponent(evidenceRequestId)}/submit`,
      { method: 'POST', body: { evidenceReference }, idempotencyKey: newIdempotencyKey(), signal },
    );
  }

  /* ── Remplacements ── */

  myReplacements(options: ListOptions = {}): Promise<EmployerPage<ReplacementDossier>> {
    return this.list<ReplacementDossier>('/my/replacements', options);
  }

  replacement(replacementId: string, signal?: AbortSignal): Promise<ReplacementDossier> {
    return this.client.request<ReplacementDossier>(`/replacements/${encodeURIComponent(replacementId)}`, { signal });
  }

  /** Seule commande employeur du dossier : publier l'offre de reprise. */
  publishReplacementOffer(replacementId: string, offer: EmployerOfferDraft, signal?: AbortSignal): Promise<ReplacementDossier> {
    return this.client.request<ReplacementDossier>(`/replacements/${encodeURIComponent(replacementId)}/offer`, {
      method: 'POST',
      body: offer,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Notifications ── */

  myNotifications(options: ListOptions & { state?: 'READ' | 'UNREAD' | null } = {}): Promise<EmployerPage<NotificationView>> {
    return this.client
      .request<unknown>('/my/notifications', {
        query: { limit: options.limit ?? 25, cursor: options.cursor ?? null, state: options.state ?? null },
        signal: options.signal,
      })
      .then((payload) => page<NotificationView>(payload));
  }

  markNotificationRead(notificationId: string, signal?: AbortSignal): Promise<NotificationView> {
    return this.client.request<NotificationView>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  markAllNotificationsRead(signal?: AbortSignal): Promise<{ marked: number }> {
    return this.client.request<{ marked: number }>('/my/notifications/read-all', {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }
}

export { ApiClientError, HttpApiClient };
