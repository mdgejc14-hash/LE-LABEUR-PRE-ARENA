/**
 * PRE — accès frontend aux routes BACKEND EXISTANTES.
 *
 * Règles absolues :
 *  - aucun endpoint n'est créé, renommé ou contourné ; chaque chemin appelé ici
 *    existe déjà dans `src/backend/api/routeContracts.ts` (vérifié par test) ;
 *  - les DTO non exposés par `src/types/index.ts` sont importés EN TYPE depuis
 *    le backend (aucune dépendance runtime, aucun contrat dupliqué) ;
 *  - transport : `HttpApiClient` same-origin, cookie HttpOnly,
 *    `credentials: 'include'`, `cache: 'no-store'` (fondation P0/P1) ;
 *  - les commandes portent une clé d'idempotence explicite ;
 *  - le candidat ne voit QUE ses salaires (`payments.mine.list` filtre
 *    `paymentType = SALARY` côté serveur) : aucune donnée de commission
 *    employeur n'est jamais demandée ni affichée.
 */

import type {
  Application,
  Contract,
  MissionProposal,
  Offer,
  ReplacementDossier,
} from '../types';
import type { ClaimView } from '../backend/disputes/claimRepository';
import type { ClaimStatus, ClaimType } from '../backend/disputes/records';
import type { PaymentView } from '../backend/repositories/paymentRepository';
import type { NotificationView } from '../backend/notifications/notificationService';
import type { CandidateMatchingProfileRecord } from '../backend/matching/records';
import type { ReputationView } from '../backend/reputation/reputationLedger';
import type { ReputationEntryView } from '../backend/reputation/reputationRepository';
import type { DocumentSummaryView, DocumentUploadGrantView } from '../backend/documents/documentRepository';
import type { ServerApplicationSubmissionInput } from '../backend/repositories/contracts';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';

export type {
  ClaimView,
  ClaimStatus,
  ClaimType,
  PaymentView,
  NotificationView,
  CandidateMatchingProfileRecord,
  ReputationView,
  ReputationEntryView,
  DocumentSummaryView,
  DocumentUploadGrantView,
};

/** Charge utile de candidature : strictement le type serveur (`{ note? }`). */
export type PrestataireApplicationDraft = ServerApplicationSubmissionInput;

export interface PrestataireClaimDraft {
  contractId: string;
  paymentId?: string;
  type: ClaimType;
  reason: string;
  evidenceReference?: string;
}

/** Réponse de la confirmation de salaire (P0-SALARY) : statut réel, jamais un reçu inventé. */
export interface SalaryConfirmationResult {
  readonly status: string;
  readonly paymentId: string;
  readonly confirmedAt?: string;
  readonly eventId?: string;
}

export interface PrestataireSession {
  readonly actor: { id: string; role: string; status: string; displayName: string; email?: string };
  readonly permissions: readonly string[];
}

export interface PrestatairePage<T> {
  readonly items: T[];
  readonly hasMore: boolean;
  readonly cursor: string | null;
}

/** Chemins réellement appelés par cette interface (gardés par test contre routeContracts.ts). */
export const PRESTATAIRE_API_PATHS: readonly string[] = [
  '/api/v1/auth/session',
  '/api/v1/offers',
  '/api/v1/offers/:offerId',
  '/api/v1/offers/:offerId/applications',
  '/api/v1/my/applications',
  '/api/v1/applications/:applicationId',
  '/api/v1/applications/:applicationId/withdraw',
  '/api/v1/proposals/:proposalId/respond',
  '/api/v1/my/contracts',
  '/api/v1/contracts/:contractId',
  '/api/v1/contracts/:contractId/sign',
  '/api/v1/contracts/:contractId/confirm-execution',
  '/api/v1/contracts/:contractId/payments',
  '/api/v1/my/payments',
  '/api/v1/payments/:paymentId',
  '/api/v1/payments/:paymentId/salary-confirmation',
  '/api/v1/my/schedules',
  '/api/v1/my/claims',
  '/api/v1/claims',
  '/api/v1/claims/:claimId',
  '/api/v1/claims/:claimId/evidence-requests/:evidenceRequestId/submit',
  '/api/v1/my/replacements',
  '/api/v1/replacements/:replacementId',
  '/api/v1/my/reputation',
  '/api/v1/my/reputation/entries',
  '/api/v1/my/documents',
  '/api/v1/documents/upload-grants',
  '/api/v1/documents/:documentId',
  '/api/v1/documents/:documentId/versions',
  '/api/v1/documents/:documentId/signed-download-url',
  '/api/v1/my/notifications',
  '/api/v1/notifications/:notificationId/read',
  '/api/v1/my/notifications/read-all',
  '/api/v1/my/matching-profile',
];

/** Clé d'idempotence explicite (jamais réutilisée entre deux commandes). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `pre-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function page<T>(payload: unknown): PrestatairePage<T> {
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

export class PrestataireApi {
  constructor(private readonly client: HttpApiClient) {}

  private list<T>(path: string, options: ListOptions = {}): Promise<PrestatairePage<T>> {
    return this.client
      .request<unknown>(path, {
        query: { limit: options.limit ?? 25, cursor: options.cursor ?? null },
        signal: options.signal,
      })
      .then((payload) => page<T>(payload));
  }

  /* ── Session ── */

  session(signal?: AbortSignal): Promise<PrestataireSession> {
    return this.client
      .request<unknown>('/auth/session', { signal })
      .then((payload) => {
        const value = payload as { user?: unknown; permissions?: unknown } | null;
        const actor = value?.user as { id?: unknown; role?: unknown; status?: unknown; displayName?: unknown; email?: unknown } | null;
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
          permissions: Array.isArray(value?.permissions)
            ? (value.permissions as unknown[]).filter((item): item is string => typeof item === 'string')
            : [],
        };
      });
  }

  /* ── Marché des offres (lecture publique) ── */

  offers(options: ListOptions = {}): Promise<PrestatairePage<Offer>> {
    return this.list<Offer>('/offers', options);
  }

  offer(offerId: string, signal?: AbortSignal): Promise<Offer> {
    return this.client.request<Offer>(`/offers/${encodeURIComponent(offerId)}`, { signal });
  }

  /* ── Candidatures (création, lecture déclarée, retrait) ── */

  myApplications(options: ListOptions = {}): Promise<PrestatairePage<Application>> {
    return this.list<Application>('/my/applications', options);
  }

  application(applicationId: string, signal?: AbortSignal): Promise<Application> {
    return this.client.request<Application>(`/applications/${encodeURIComponent(applicationId)}`, { signal });
  }

  /** Dépôt de candidature : la charge utile est strictement `{ note? }` (type serveur). */
  applyToOffer(offerId: string, draft: PrestataireApplicationDraft, signal?: AbortSignal): Promise<Application> {
    return this.client.request<Application>(`/offers/${encodeURIComponent(offerId)}/applications`, {
      method: 'POST',
      body: draft,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** Retrait de candidature : la route réelle ne prend AUCUN corps. */
  withdrawApplication(applicationId: string, signal?: AbortSignal): Promise<Application> {
    return this.client.request<Application>(`/applications/${encodeURIComponent(applicationId)}/withdraw`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Propositions (réponse candidat réelle : ACCEPT / DECLINE) ── */

  respondToProposal(proposalId: string, action: 'ACCEPT' | 'DECLINE', notes?: string, signal?: AbortSignal): Promise<MissionProposal> {
    return this.client.request<MissionProposal>(`/proposals/${encodeURIComponent(proposalId)}/respond`, {
      method: 'POST',
      body: { action, ...(notes ? { notes } : {}) },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Contrats ── */

  myContracts(options: ListOptions = {}): Promise<PrestatairePage<Contract>> {
    return this.list<Contract>('/my/contracts', options);
  }

  contract(contractId: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}`, { signal });
  }

  /** Signature candidat : la commande ne porte AUCUN corps (identité et horodatage serveur). */
  signContract(contractId: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/sign`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** Constat d'exécution du contrat (rôle CANDIDATE autorisé par le contrat de route). */
  confirmContractExecution(contractId: string, signal?: AbortSignal): Promise<Contract> {
    return this.client.request<Contract>(`/contracts/${encodeURIComponent(contractId)}/confirm-execution`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Paiements & salaire (le candidat ne reçoit QUE ses salaires) ── */

  myPayments(options: ListOptions = {}): Promise<PrestatairePage<PaymentView>> {
    return this.list<PaymentView>('/my/payments', options);
  }

  /**
   * Sonde honnête de GET /my/schedules : la route est déclarée dans
   * routeContracts.ts SANS handler installé (501 NOT_IMPLEMENTED). L’appel est
   * réel : l’écran affiche l’état d’erreur du serveur au lieu d’inventer un
   * échéancier.
   */
  listSchedulesProbe(signal?: AbortSignal): Promise<unknown> {
    return this.client.request<unknown>('/my/schedules', { query: { limit: 100 }, signal });
  }

  payment(paymentId: string, signal?: AbortSignal): Promise<PaymentView> {
    return this.client.request<PaymentView>(`/payments/${encodeURIComponent(paymentId)}`, { signal });
  }

  contractPayments(contractId: string, options: ListOptions = {}): Promise<PrestatairePage<PaymentView>> {
    return this.list<PaymentView>(`/contracts/${encodeURIComponent(contractId)}/payments`, options);
  }

  /**
   * P0-SALARY — confirmation de réception du salaire par le candidat (OTP + nonce).
   * Un paiement déclaré n'est pas vérifié ; un paiement vérifié/payé n'est pas
   * confirmé tant que cette commande n'a pas réussi. Aucun statut n'est déduit ici.
   */
  confirmSalary(paymentId: string, otp: string, nonce: string, signal?: AbortSignal): Promise<SalaryConfirmationResult> {
    return this.client.request<SalaryConfirmationResult>(`/payments/${encodeURIComponent(paymentId)}/salary-confirmation`, {
      method: 'POST',
      body: { otp, nonce },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Claims ── */

  myClaims(options: ListOptions = {}): Promise<PrestatairePage<ClaimView>> {
    return this.list<ClaimView>('/my/claims', options);
  }

  claim(claimId: string, signal?: AbortSignal): Promise<ClaimView> {
    return this.client.request<ClaimView>(`/claims/${encodeURIComponent(claimId)}`, { signal });
  }

  createClaim(draft: PrestataireClaimDraft, signal?: AbortSignal): Promise<ClaimView> {
    return this.client.request<ClaimView>('/claims', { method: 'POST', body: draft, idempotencyKey: newIdempotencyKey(), signal });
  }

  submitClaimEvidence(claimId: string, evidenceRequestId: string, evidenceReference: string, signal?: AbortSignal): Promise<ClaimView> {
    return this.client.request<ClaimView>(
      `/claims/${encodeURIComponent(claimId)}/evidence-requests/${encodeURIComponent(evidenceRequestId)}/submit`,
      { method: 'POST', body: { evidenceReference }, idempotencyKey: newIdempotencyKey(), signal },
    );
  }

  /* ── Remplacements ── */

  myReplacements(options: ListOptions = {}): Promise<PrestatairePage<ReplacementDossier>> {
    return this.list<ReplacementDossier>('/my/replacements', options);
  }

  replacement(replacementId: string, signal?: AbortSignal): Promise<ReplacementDossier> {
    return this.client.request<ReplacementDossier>(`/replacements/${encodeURIComponent(replacementId)}`, { signal });
  }

  /* ── Réputation (ledger existant, vue dérivée) ── */

  myReputation(signal?: AbortSignal): Promise<ReputationView> {
    return this.client.request<ReputationView>('/my/reputation', { signal });
  }

  myReputationEntries(options: ListOptions = {}): Promise<PrestatairePage<ReputationEntryView>> {
    return this.list<ReputationEntryView>('/my/reputation/entries', options);
  }

  /* ── Documents (R2 : upload-grant, lecture, versions, URL signée) ── */

  myDocuments(options: ListOptions = {}): Promise<PrestatairePage<DocumentSummaryView>> {
    return this.list<DocumentSummaryView>('/my/documents', options);
  }

  document(documentId: string, signal?: AbortSignal): Promise<DocumentSummaryView & { versions?: unknown[] }> {
    return this.client.request<DocumentSummaryView & { versions?: unknown[] }>(`/documents/${encodeURIComponent(documentId)}`, { signal });
  }

  documentVersions(documentId: string, signal?: AbortSignal): Promise<unknown[]> {
    return this.client
      .request<unknown>(`/documents/${encodeURIComponent(documentId)}/versions`, { signal })
      .then((payload) => {
        const value = payload as { items?: unknown } | null;
        return Array.isArray(value?.items) ? value.items : [];
      });
  }

  /** Demande de grant d'upload R2 : le contenu ne transite que par l'URL retournée. */
  requestUploadGrant(
    draft: { title: string; fileName: string; contentType: string; sizeBytes: number; documentType: string; purposeNote?: string },
    signal?: AbortSignal,
  ): Promise<DocumentUploadGrantView> {
    return this.client.request<DocumentUploadGrantView>('/documents/upload-grants', {
      method: 'POST',
      body: draft,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** Nouvelle version d'un document EXISTANT (append-only) : métadonnées + grant R2. */
  createDocumentVersion(
    documentId: string,
    input: { contentType: string; sizeBytes: number },
    signal?: AbortSignal,
  ): Promise<DocumentUploadGrantView> {
    return this.client.request<DocumentUploadGrantView>(`/documents/${encodeURIComponent(documentId)}/versions`, {
      method: 'POST',
      body: input,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /** URL de téléchargement signée (durée courte) : jamais de clé d'objet exposée. */
  signedDownloadUrl(documentId: string, signal?: AbortSignal): Promise<{ url: string }> {
    return this.client.request<{ url: string }>(`/documents/${encodeURIComponent(documentId)}/signed-download-url`, {
      method: 'POST',
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /**
   * Upload binaire du contenu d'une version vers l'URL de grant R2 (chemin API
   * same-origin retourné par le serveur ; la clé d'objet n'est jamais exposée).
   */
  async uploadDocumentContent(uploadUrl: string, bytes: Uint8Array, contentType: string, signal?: AbortSignal): Promise<void> {
    if (!uploadUrl.startsWith('/') || uploadUrl.startsWith('//')) {
      throw new ApiClientError('URL de grant invalide.', 500, 'INVALID_RESPONSE');
    }
    const response = await fetch(uploadUrl, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': contentType, 'Idempotency-Key': newIdempotencyKey() },
      body: bytes as unknown as BodyInit,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      throw new ApiClientError('Le téléversement du document a échoué.', response.status, 'INVALID_RESPONSE');
    }
  }

  /* ── Notifications ── */

  myNotifications(options: ListOptions & { state?: 'READ' | 'UNREAD' | null } = {}): Promise<PrestatairePage<NotificationView>> {
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

  /* ── Profil de matching (candidat) ── */

  matchingProfile(signal?: AbortSignal): Promise<CandidateMatchingProfileRecord | null> {
    return this.client.request<CandidateMatchingProfileRecord | null>('/my/matching-profile', { signal });
  }

  updateMatchingProfile(
    profile: { skills?: string[]; availability?: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' | 'UNDECLARED' },
    signal?: AbortSignal,
  ): Promise<CandidateMatchingProfileRecord> {
    return this.client.request<CandidateMatchingProfileRecord>('/my/matching-profile', {
      method: 'PATCH',
      body: profile,
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }
}

export { ApiClientError, HttpApiClient };
