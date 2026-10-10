/**
 * ADM — accès frontend aux routes BACKEND EXISTANTES (tranches P4A, P4B-1,
 * P4B-2, P4C et P4D).
 *
 * P4C-DESIGN-ADMIN-SALARY-PROOFS : aucune route nouvelle. Les écrans salaire
 * se limitent aux lectures déjà gardées (admin.payments.list, payments.read) ;
 * aucune route réservée à l'Employeur ou au Candidat (confirmation OTP) n'est
 * appelée ici.
 * P4D-DESIGN-ADMIN-CLAIMS : lectures et commandes de Claims utilisent les
 * routes `admin.claims.*` opérationnelles (permission incidents:read:any pour
 * lire, incidents:arbitrate pour revue/demande de justificatif/décision). Les
 * DTO et entrées viennent du repository réel ; les références de preuves restent
 * opaques à l'interface et aucune route document/partie n'est détournée.
 * P4E-1-DESIGN-ADMIN-REPLACEMENTS : lecture seule des dossiers de Remplacement
 * par `admin.replacements.list` / `admin.replacements.read` (permission serveur
 * replacements:read:any, revérifiée par `replacementRepository`) et lecture des
 * Propositions par `admin.proposals.list` (applications:read:any). Les routes
 * déclarées `admin.replacements.assign|transfer|finalize` restent VOLONTAIREMENT
 * sans handler (le consentement du Candidat passe par la Proposition) : elles ne
 * sont jamais appelées. `replacements.read` (Employeur/Candidat) et
 * `replacements.offer.create` (Employeur) ne sont pas détournées.
 * P4E-2-DESIGN-ADMIN-REPUTATION : lectures `admin.reputation.entries.list/read`
 * (audit:read) et commandes `admin.reputation.entries.correct` /
 * `admin.reputation.reconcile` (incidents:arbitrate, Idempotency-Key). La vue
 * dérivée `reputation.mine.read` (scope self) n'est jamais appelée. Aucune
 * route de contestation ni d'intégrité de chaîne n'existe : elles ne sont pas
 * inventées ici.
 * Règles absolues :
 *  - aucun endpoint n'est créé, renommé ou contourné ; chaque chemin appelé ici
 *    existe déjà dans `src/backend/api/routeContracts.ts` (vérifié par test) ;
 *  - les DTO non exposés par `src/types/index.ts` sont importés EN TYPE depuis
 *    le backend (aucune dépendance runtime, aucun contrat dupliqué) ;
 *  - transport : `HttpApiClient` same-origin, cookie HttpOnly,
 *    `credentials: 'include'`, `cache: 'no-store'` (fondation P0/P1) ;
 *  - les commandes portent une clé d'idempotence explicite ;
 *  - les permissions ADMIN restent déterminées par le serveur : ce client ne
 *    les lit que pour afficher l'état réel (jamais pour les décider).
 */

import type { AdminUserDto } from '../backend/identity/dto';
import type {
  MissionQualificationRecord,
  QualificationDecision,
} from '../backend/matching/records';
import type { QualificationReviewQueueItem } from '../backend/matching/matchingRepository';
import type {
  AdminClaimDecisionInput,
  AdminClaimEvidenceInput,
  ClaimView,
} from '../backend/disputes/claimRepository';
import type { PaymentView } from '../backend/repositories/paymentRepository';
import type { PaymentDeclarationRecord } from '../backend/persistence/paymentRecords';
import type {
  PaymentReconciliationBatchReport,
  PaymentReconciliationCorrectionAttemptInput,
  PaymentReconciliationReviewDecisionInput,
} from '../backend/payments/paymentReconciliationBatch';
import type {
  PaymentReconciliationCorrectionAttemptRecord,
  PaymentReconciliationReviewRecord,
} from '../backend/persistence/paymentReconciliationRecords';
import type { Contract, MissionProposal, ReplacementDossier } from '../types';
import type {
  ReputationCorrectionInput,
  ReputationEntryDetail,
  ReputationEntryView,
} from '../backend/reputation/reputationRepository';
import type { ReputationReconciliationReport } from '../backend/reputation/reconciliationCore';
import type { ReputationSourceEntityType, ReputationStatus } from '../domain/reputationRules';
import { ApiClientError, HttpApiClient } from '../repositories/apiClient';

export type {
  AdminUserDto,
  MissionQualificationRecord,
  QualificationDecision,
  QualificationReviewQueueItem,
  AdminClaimDecisionInput,
  AdminClaimEvidenceInput,
  ClaimView,
  Contract,
  MissionProposal,
  ReplacementDossier,
  PaymentView,
  PaymentDeclarationRecord,
  PaymentReconciliationBatchReport,
  PaymentReconciliationReviewRecord,
  PaymentReconciliationCorrectionAttemptRecord,
  ReputationCorrectionInput,
  ReputationEntryDetail,
  ReputationEntryView,
  ReputationReconciliationReport,
};

/** Session serveur réelle : rôle, statut de compte et permissions dérivées serveur. */
export interface AdminSession {
  readonly actor: { id: string; role: string; status: string; displayName: string; email?: string };
  readonly permissions: readonly string[];
}

export interface AdminPage<T> {
  readonly items: T[];
  readonly hasMore: boolean;
  readonly cursor: string | null;
  /** Frontière de contrôle renvoyée quand aucune persistance durable n'est ouverte. */
  readonly persistence?: string;
}

/** Réponse réelle de admin.stats.read (frontière de contrôle : métriques vides). */
export interface AdminStatsPayload {
  readonly resource: string;
  readonly scope: string;
  readonly persistence: string;
  readonly metrics: Record<string, unknown>;
}

/** Réponse réelle des collections de contrôle ADMIN (sans données métier). */
export interface AdminControlPayload {
  readonly resource: string;
  readonly scope: string;
  readonly items: unknown[];
  readonly cursor: string | null;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly persistence: string;
}

/** Chemins réellement appelés par cette interface (gardés par test contre routeContracts.ts). */
export const ADMIN_API_PATHS: readonly string[] = [
  '/api/v1/auth/session',
  '/api/v1/admin/users',
  '/api/v1/admin/users/:userId/block',
  '/api/v1/admin/qualifications/review',
  '/api/v1/admin/qualifications/:qualificationId/review',
  '/api/v1/admin/stats',
  '/api/v1/admin/audit',
  '/api/v1/admin/incidents',
  // P4B-1 — supervision des contrats : lecture ADMIN réelle du registre des
  // contrats et lecture ADMIN des Claims rattachés (incidents d'un contrat).
  '/api/v1/admin/contracts',
  // P4D — routes réellement composées du workflow Claim. La liste et la fiche
  // exigent incidents:read:any ; chaque commande exige incidents:arbitrate,
  // une Idempotency-Key et les gardes d'état appliquées par le Worker.
  '/api/v1/admin/claims',
  '/api/v1/admin/claims/:claimId',
  '/api/v1/admin/claims/:claimId/review',
  '/api/v1/admin/claims/:claimId/evidence-requests',
  '/api/v1/admin/claims/:claimId/decision',
  // P4E-1 — lectures ADMIN du workflow Remplacement (aucune commande ADMIN :
  // assign/transfer/finalize restent sans handler et ne sont jamais appelées).
  '/api/v1/admin/replacements',
  '/api/v1/admin/replacements/:replacementId',
  '/api/v1/admin/proposals',
  // P4E-2 — ledger ADMIN réel. La vue dérivée /my/reputation (scope self)
  // n'est pas listée : elle n'est jamais appelée par l'ADMIN.
  '/api/v1/admin/reputation/entries',
  '/api/v1/admin/reputation/entries/:reputationId',
  '/api/v1/admin/reputation/entries/:reputationId/correct',
  '/api/v1/admin/reputation/reconcile',
  // P4B-2 — lecture ADMIN des paiements et des lots de rapprochement déjà connus.
  '/api/v1/admin/payments',
  '/api/v1/payments/:paymentId',
  '/api/v1/admin/payments/:paymentId/approve',
  '/api/v1/admin/payments/:paymentId/reject',
  '/api/v1/admin/payments/:paymentId/confirm',
  '/api/v1/admin/payment-reconciliation/batches/:batchId',
  '/api/v1/admin/payment-reconciliation/batches/:batchId/retry',
  '/api/v1/admin/payment-reconciliation/reviews/:reviewId/decision',
  '/api/v1/admin/payment-reconciliation/reviews/:reviewId/correction-attempts',
];

/** Clé d'idempotence explicite (jamais réutilisée entre deux commandes). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function page<T>(payload: unknown): AdminPage<T> {
  const value = payload as { items?: unknown; hasMore?: unknown; cursor?: unknown } | null;
  if (!value || !Array.isArray(value.items)) throw new ApiClientError('Réponse paginée invalide.', 500, 'INVALID_RESPONSE');
  return {
    items: value.items as T[],
    hasMore: Boolean(value.hasMore),
    cursor: typeof value.cursor === 'string' ? value.cursor : null,
    ...(typeof (value as { persistence?: unknown }).persistence === 'string'
      ? { persistence: (value as { persistence: string }).persistence }
      : {}),
  };
}

export interface ListOptions {
  readonly limit?: number;
  readonly cursor?: string | null;
  readonly signal?: AbortSignal;
}

/** Filtres réellement acceptés par admin.reputation.entries.list. */
export interface ReputationListOptions extends ListOptions {
  readonly subjectUserId?: string;
  readonly status?: ReputationStatus;
  readonly sourceEntityType?: ReputationSourceEntityType;
  readonly from?: string;
  readonly to?: string;
}

/** Décisions réellement acceptées par le serveur pour une revue humaine. */
export const REVIEW_DECISION_OPTIONS: readonly QualificationDecision[] = ['ELIGIBLE_FOR_INDEPENDENT', 'BLOCKED'];

export class AdminApi {
  constructor(private readonly client: HttpApiClient) {}

  private list<T>(path: string, options: ListOptions = {}): Promise<AdminPage<T>> {
    return this.client
      .request<unknown>(path, {
        query: { limit: options.limit ?? 25, cursor: options.cursor ?? null },
        signal: options.signal,
      })
      .then((payload) => page<T>(payload));
  }

  /** Session serveur réelle : rôle, statut de compte et permissions. */
  session(signal?: AbortSignal): Promise<AdminSession> {
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

  /* ── Utilisateurs (registre ADMIN réel) ── */

  users(options: ListOptions = {}): Promise<AdminPage<AdminUserDto>> {
    return this.list<AdminUserDto>('/admin/users', options);
  }

  /**
   * Blocage ADMIN réel : POST /api/v1/admin/users/:userId/block { reason }.
   * Le serveur exige la permission users:block, un motif explicite, et pose
   * un verrouillage de ligne + révocation des sessions + audit USER_BLOCKED.
   */
  blockUser(userId: string, reason: string, signal?: AbortSignal): Promise<AdminUserDto> {
    return this.client.request<AdminUserDto>(`/admin/users/${encodeURIComponent(userId)}/block`, {
      method: 'POST',
      body: { reason },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Qualification (file de revue et décision humaine réelles) ── */

  reviewQueue(options: ListOptions = {}): Promise<AdminPage<QualificationReviewQueueItem>> {
    return this.list<QualificationReviewQueueItem>('/admin/qualifications/review', options);
  }

  /**
   * Décision de revue humaine réelle : POST /api/v1/admin/qualifications/:qualificationId/review
   * { decision, reason }. Idempotente, auditée (MISSION_QUALIFICATION_REVIEWED),
   * à usage unique (une qualification déjà revue renvoie un conflit 409).
   */
  decideReview(qualificationId: string, decision: QualificationDecision, reason: string, signal?: AbortSignal): Promise<MissionQualificationRecord> {
    return this.client.request<MissionQualificationRecord>(`/admin/qualifications/${encodeURIComponent(qualificationId)}/review`, {
      method: 'POST',
      body: { decision, reason },
      idempotencyKey: newIdempotencyKey(),
      signal,
    });
  }

  /* ── Contrats (P4B-1 — supervision des contrats, lecture ADMIN réelle) ── */

  /**
   * Registre ADMIN réel : `admin.contracts.list` (GET /api/v1/admin/contracts,
   * permission serveur `contracts:read:any`). Sans persistance PostgreSQL
   * durable, le serveur répond sa frontière de contrôle (collection vide,
   * `persistence: 'not-configured'`) : c'est l'état réel, affiché tel quel.
   */
  contracts(options: ListOptions = {}): Promise<AdminPage<Contract>> {
    return this.list<Contract>('/admin/contracts', options);
  }

  /**
   * Claims réels rattachés à un contrat : `admin.claims.list`
   * (GET /api/v1/admin/claims, permission serveur `incidents:read:any`).
   * Aucun filtre serveur par contrat n'existe : le rattachement est un filtre
   * local sur la page réellement chargée (état dit, jamais une donnée inventée).
   */
  claims(options: ListOptions = {}): Promise<AdminPage<ClaimView>> {
    return this.list<ClaimView>('/admin/claims', options);
  }

  /**
   * Fiche Claim ADMIN `admin.claims.read` (GET /api/v1/admin/claims/:claimId,
   * permission incidents:read:any). La réponse réelle est ClaimView ; ses
   * références opaques, metadata, salaryConfirmationId et idempotencyKey ne
   * doivent pas être rendus par l'interface.
   */
  claim(claimId: string, signal?: AbortSignal): Promise<ClaimView> {
    return this.client.request<ClaimView>(`/admin/claims/${encodeURIComponent(claimId)}`, { signal });
  }

  /** Mise en revue / escalade du Claim ; idempotent et audité côté serveur. */
  reviewClaim(claimId: string, note: string | undefined, signal?: AbortSignal, idempotencyKey = newIdempotencyKey()): Promise<ClaimView> {
    return this.client.request<ClaimView>(`/admin/claims/${encodeURIComponent(claimId)}/review`, {
      method: 'POST',
      body: { ...(note ? { note } : {}) },
      idempotencyKey,
      signal,
    });
  }

  /** Demande réelle de justificatif ; le serveur décide l'échéance configurée. */
  requestClaimEvidence(claimId: string, input: AdminClaimEvidenceInput, signal?: AbortSignal, idempotencyKey = newIdempotencyKey()): Promise<ClaimView> {
    return this.client.request<ClaimView>(`/admin/claims/${encodeURIComponent(claimId)}/evidence-requests`, {
      method: 'POST',
      body: input,
      idempotencyKey,
      signal,
    });
  }

  /** Le workflow réel n'accepte que RESOLVE/REJECT/REPLACE ; P4D n'expose
   * volontairement que RESOLVE et REJECT, REPLACE étant hors de cette tranche. */
  decideClaim(
    claimId: string,
    input: Omit<AdminClaimDecisionInput, 'decision'> & { decision: Exclude<AdminClaimDecisionInput['decision'], 'REPLACE'> },
    signal?: AbortSignal,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<ClaimView> {
    return this.client.request<ClaimView>(`/admin/claims/${encodeURIComponent(claimId)}/decision`, {
      method: 'POST',
      body: input,
      idempotencyKey,
      signal,
    });
  }

  /* ── Remplacements (P4E-1 — lecture seule du workflow existant) ── */

  /**
   * File ADMIN réelle `admin.replacements.list` (GET /api/v1/admin/replacements,
   * permission serveur `replacements:read:any`). Sans persistance durable, le
   * Worker répond sa frontière de contrôle (`persistence: 'not-configured'`) :
   * ce marqueur est conservé pour ne pas présenter une file vide comme réelle.
   */
  replacements(options: ListOptions = {}): Promise<AdminPage<ReplacementDossier>> {
    return this.list<ReplacementDossier>('/admin/replacements', options);
  }

  /** Dossier unitaire `admin.replacements.read` (même permission, même projection). */
  replacement(replacementId: string, signal?: AbortSignal): Promise<ReplacementDossier> {
    return this.client.request<ReplacementDossier>(`/admin/replacements/${encodeURIComponent(replacementId)}`, { signal });
  }

  /**
   * Propositions `admin.proposals.list` (GET /api/v1/admin/proposals, permission
   * `applications:read:any`). Aucun filtre serveur par Proposition : la
   * Proposition sélectionnée d'un Remplacement est recherchée dans la page
   * réellement chargée, jamais reconstituée.
   */
  proposals(options: ListOptions = {}): Promise<AdminPage<MissionProposal>> {
    return this.list<MissionProposal>('/admin/proposals', options);
  }

  /* ── Réputation (P4E-2 — ledger existant, aucune vue dérivée ADMIN) ── */

  /**
   * Ledger ADMIN `admin.reputation.entries.list` (GET /api/v1/admin/reputation/entries,
   * permission `audit:read`). Filtres serveur : subjectUserId, status
   * ACTIVE|REVERSED, sourceEntityType, from/to (date du fait). Sans
   * persistance, le Worker n'installe pas le handler (501 réel).
   */
  reputationEntries(options: ReputationListOptions = {}): Promise<AdminPage<ReputationEntryView>> {
    return this.client
      .request<unknown>('/admin/reputation/entries', {
        query: {
          limit: options.limit ?? 25,
          cursor: options.cursor ?? null,
          subjectUserId: options.subjectUserId ?? null,
          status: options.status ?? null,
          sourceEntityType: options.sourceEntityType ?? null,
          from: options.from ?? null,
          to: options.to ?? null,
        },
        signal: options.signal,
      })
      .then((payload) => page<ReputationEntryView>(payload));
  }

  /** Détail `admin.reputation.entries.read` (même permission). */
  reputationEntry(reputationId: string, signal?: AbortSignal): Promise<ReputationEntryDetail> {
    return this.client.request<ReputationEntryDetail>(
      `/admin/reputation/entries/${encodeURIComponent(reputationId)}`,
      { signal },
    );
  }

  /**
   * Correction ADMIN réelle : REVERSE (ACTIVE → REVERSED) ou RESTORE
   * (REVERSED → ACTIVE). Motif 3–1000 caractères. Idempotente, auditée
   * (REPUTATION_ENTRY_REVERSED / RESTORED). Permission incidents:arbitrate.
   */
  correctReputationEntry(
    reputationId: string,
    input: ReputationCorrectionInput,
    signal?: AbortSignal,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<ReputationEntryDetail> {
    return this.client.request<ReputationEntryDetail>(
      `/admin/reputation/entries/${encodeURIComponent(reputationId)}/correct`,
      {
        method: 'POST',
        body: { action: input.action, reason: input.reason },
        idempotencyKey,
        signal,
      },
    );
  }

  /**
   * Réconciliation ADMIN d'un sujet : relit les faits déjà persistés et
   * n'ajoute que les entrées manquantes. Ce n'est pas une vérification de
   * chaîne et ce n'est pas un nouveau score.
   */
  reconcileReputation(
    subjectUserId: string,
    signal?: AbortSignal,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<ReputationReconciliationReport> {
    return this.client.request<ReputationReconciliationReport>('/admin/reputation/reconcile', {
      method: 'POST',
      body: { subjectUserId },
      idempotencyKey,
      signal,
    });
  }

  /* ── Paiements et rapprochement (P4B-2 — routes réellement présentes) ── */

  /**
   * Registre ADMIN `admin.payments.list` — permission serveur `payments:read:any`.
   * La page peut être une frontière de contrôle `persistence: not-configured`;
   * ce marqueur est conservé pour distinguer absence de source et registre vide.
   */
  payments(options: ListOptions = {}): Promise<AdminPage<PaymentView>> {
    return this.list<PaymentView>('/admin/payments', options);
  }

  /**
   * Consultation unitaire réelle. La route `payments.read` est déclarée avec
   * scope `owner`, mais son handler autorise explicitement ADMIN avec
   * `payments:read:any`; aucun endpoint réservé aux parties n'est contourné.
   */
  payment(paymentId: string, signal?: AbortSignal): Promise<PaymentView> {
    return this.client.request<PaymentView>(`/payments/${encodeURIComponent(paymentId)}`, { signal });
  }

  /** Vérification de la déclaration courante par l'ADMIN (`payments:approve`). */
  verifyPayment(paymentId: string, signal?: AbortSignal, idempotencyKey = newIdempotencyKey()): Promise<PaymentView> {
    return this.client.request<PaymentView>(`/admin/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: 'POST',
      body: {},
      idempotencyKey,
      signal,
    });
  }

  /** Transition `VERIFIED → PAID` côté serveur après son rapprochement réel. */
  markPaymentPaid(paymentId: string, signal?: AbortSignal, idempotencyKey = newIdempotencyKey()): Promise<PaymentView> {
    return this.client.request<PaymentView>(`/admin/payments/${encodeURIComponent(paymentId)}/confirm`, {
      method: 'POST',
      body: {},
      idempotencyKey,
      signal,
    });
  }

  /** Rejet ADMIN avec motif obligatoire (`payments:reject`). */
  rejectPayment(paymentId: string, reason: string, signal?: AbortSignal, idempotencyKey = newIdempotencyKey()): Promise<PaymentView> {
    return this.client.request<PaymentView>(`/admin/payments/${encodeURIComponent(paymentId)}/reject`, {
      method: 'POST',
      body: { reason },
      idempotencyKey,
      signal,
    });
  }

  /** Lecture paginée d'un lot persisté, à partir de son identifiant connu. */
  paymentReconciliationBatch(batchId: string, options: ListOptions = {}): Promise<PaymentReconciliationBatchReport> {
    return this.client.request<PaymentReconciliationBatchReport>(
      `/admin/payment-reconciliation/batches/${encodeURIComponent(batchId)}`,
      {
        query: { limit: options.limit ?? 100, cursor: options.cursor ?? null },
        signal: options.signal,
      },
    );
  }

  /** Reprise idempotente des items FAILED/RETRYABLE (pas de transfert de fonds). */
  retryPaymentReconciliationBatch(batchId: string, signal?: AbortSignal, idempotencyKey = newIdempotencyKey()): Promise<PaymentReconciliationBatchReport> {
    return this.client.request<PaymentReconciliationBatchReport>(
      `/admin/payment-reconciliation/batches/${encodeURIComponent(batchId)}/retry`,
      {
        method: 'POST',
        body: {},
        idempotencyKey,
        signal,
      },
    );
  }

  /** Décision de revue ADMIN, idempotente et distincte du statut du Paiement. */
  decidePaymentReconciliationReview(
    reviewId: string,
    input: Omit<PaymentReconciliationReviewDecisionInput, 'idempotencyKey'>,
    signal?: AbortSignal,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<{ review: PaymentReconciliationReviewRecord; replayed?: boolean }> {
    return this.client.request(
      `/admin/payment-reconciliation/reviews/${encodeURIComponent(reviewId)}/decision`,
      {
        method: 'POST',
        body: input,
        idempotencyKey,
        signal,
      },
    );
  }

  /** Proposition append-only de correction ; le backend ne l'applique pas. */
  recordPaymentReconciliationCorrectionAttempt(
    reviewId: string,
    input: Omit<PaymentReconciliationCorrectionAttemptInput, 'idempotencyKey'>,
    signal?: AbortSignal,
    idempotencyKey = newIdempotencyKey(),
  ): Promise<{ correctionAttempt: PaymentReconciliationCorrectionAttemptRecord; replayed?: boolean }> {
    return this.client.request(
      `/admin/payment-reconciliation/reviews/${encodeURIComponent(reviewId)}/correction-attempts`,
      {
        method: 'POST',
        body: input,
        idempotencyKey,
        signal,
      },
    );
  }

  /* ── Frontières de contrôle ADMIN (réponses réelles, sans données métier) ── */

  stats(signal?: AbortSignal): Promise<AdminStatsPayload> {
    return this.client.request<AdminStatsPayload>('/admin/stats', { signal });
  }

  auditLog(options: ListOptions = {}): Promise<AdminControlPayload> {
    return this.list<unknown>('/admin/audit', options) as unknown as Promise<AdminControlPayload>;
  }

  incidents(options: ListOptions = {}): Promise<AdminControlPayload> {
    return this.list<unknown>('/admin/incidents', options) as unknown as Promise<AdminControlPayload>;
  }
}

export { ApiClientError, HttpApiClient };
