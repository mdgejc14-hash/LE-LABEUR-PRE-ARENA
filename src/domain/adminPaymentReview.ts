/**
 * PHASES 4C/4D — préparation de l'affichage ADMIN des paiements soumis.
 *
 * Ces fonctions sont pures : elles résolvent l'employeur et le contrat d'une
 * déclaration de paiement externe et produisent les libellés affichés par
 * l'écran « Paiements à vérifier », ainsi que la lecture de la décision
 * administrative (APPROVED / REJECTED) déjà enregistrée par le Repository.
 * Aucune décision n'est prise ici : le Repository reste la seule autorité
 * d'écriture et l'UI ne fait que présenter son résultat.
 */

import type {
  Contract,
  ExternalPaymentMethod,
  PaymentDeclaration,
  PaymentDeclarationStatus,
  SystemAuditLog,
  UserProfile,
} from '../types';
import {
  EXTERNAL_PAYMENT_METHOD_LABELS,
  PAYMENT_DECLARATION_STATUS_LABELS,
} from '../types';

const MISSING = '—';

/** Rendu lisible d'un horodatage ISO ; toute valeur absente ou invalide devient « — ». */
export function formatDeclarationMoment(iso?: string): string {
  if (!iso) return MISSING;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return MISSING;
  const day = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} à ${time}`;
}

/**
 * Valeur de tri d'un horodatage : ISO (déclaration) comme « jj/mm/aaaa — hh:mm »
 * (journal d'audit du dépôt). Une valeur illisible trie en dernier.
 */
export function sortableDeclarationMoment(value?: string): number {
  if (!value) return 0;
  const iso = Date.parse(value);
  if (!Number.isNaN(iso)) return iso;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})(?:[^\d]{1,3}(\d{2}):(\d{2}))?/);
  if (!match) return 0;
  const [, day, month, year, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour ?? 0), Number(minute ?? 0));
}

/** Motif de rejet administratif : obligatoire, non vide après nettoyage. */
export function normalizeRejectionReason(rejectionReason?: string): string {
  const reason = String(rejectionReason ?? '').trim();
  if (!reason) throw new Error('Le motif du rejet est obligatoire.');
  return reason;
}

/** Libellé de la décision enregistrée, sans jamais inventer de statut. */
export function formatDeclarationDecision(declaration: PaymentDeclaration): string {
  if (declaration.status === 'APPROVED') return 'Déclaration approuvée par l’administration';
  if (declaration.status === 'REJECTED') return 'Déclaration rejetée par l’administration';
  return MISSING;
}

export interface AdminPaymentDeclarationView {
  paymentId: string;
  status: PaymentDeclarationStatus;
  statusLabel: string;
  employerId: string;
  /** Raison sociale de l'employeur (celle portée par le contrat), sinon le titulaire du compte. */
  employerName: string;
  /** Nom du titulaire du compte employeur, quand le compte est résolu. */
  employerAccountName?: string;
  employerPublicId: string;
  employerEmail?: string;
  contractId: string;
  contractOfferTitle: string;
  contractEmployeeName: string;
  contractMonthlySalary?: number;
  contractMonthlySalaryLabel: string;
  contractCurrency?: string;
  contractStartDate?: string;
  contractStatus?: string;
  amount: number;
  currency: string;
  amountLabel: string;
  paymentMethod: ExternalPaymentMethod;
  paymentMethodLabel: string;
  transactionId: string;
  reference: string;
  paidAt: string;
  paidAtLabel: string;
  submittedAt: string;
  submittedAtLabel: string;
  /** ISO 8601 — décision administrative (Phase 4D) ; absent tant que le dossier attend l'ADMIN. */
  reviewedAt: string;
  reviewedAtLabel: string;
  /** Identifiant interne de l'ADMIN auteur de la décision. */
  reviewedBy: string;
  /** Motif obligatoire d'un rejet ; absent pour une approbation. */
  rejectionReason: string;
  /** Lecture de la décision enregistrée : « — » tant qu'aucune n'est prise. */
  decisionLabel: string;
  /** Le dossier est encore en attente d'une décision administrative. */
  pendingDecision: boolean;
  createdAt: string;
  createdAtLabel: string;
  updatedAt: string;
  updatedAtLabel: string;
  proofDocumentId?: string;
  proofReference?: string;
  proofLabel: string;
  hasProof: boolean;
  comment?: string;
}

export function resolveDeclarationEmployer(
  declaration: PaymentDeclaration,
  employers: readonly UserProfile[],
): UserProfile | undefined {
  return employers.find(employer => employer.id === declaration.employerId);
}

export function resolveDeclarationContract(
  declaration: PaymentDeclaration,
  contracts: readonly Contract[],
): Contract | undefined {
  return contracts.find(contract => contract.id === declaration.contractId);
}

/**
 * Nom affiché pour l'ADMIN auteur d'une décision : le nom du compte quand il
 * est résolu, sinon l'identifiant interne enregistré par le Repository.
 */
export function resolveDeclarationReviewer(
  reviewedBy: string | undefined,
  users: readonly UserProfile[],
): string {
  if (!reviewedBy) return MISSING;
  return users.find(user => user.id === reviewedBy)?.fullName || reviewedBy;
}

/**
 * Assemble les données affichées pour une déclaration. L'employeur vient du
 * compte quand il est disponible, sinon du contrat ; les champs manquants sont
 * remplacés par un tiret plutôt que masqués.
 */
export function buildAdminPaymentDeclarationView(
  declaration: PaymentDeclaration,
  contract?: Contract,
  employer?: UserProfile,
): AdminPaymentDeclarationView {
  const method = declaration.paymentMethod as ExternalPaymentMethod;
  const status = declaration.status as PaymentDeclarationStatus;
  return {
    paymentId: declaration.paymentId,
    status,
    statusLabel: PAYMENT_DECLARATION_STATUS_LABELS[status] ?? status,
    employerId: declaration.employerId,
    employerName: employer?.companyName || contract?.employerName || employer?.fullName || declaration.employerId,
    employerAccountName: employer?.fullName || undefined,
    employerPublicId: employer?.publicId || contract?.employerPublicId || MISSING,
    employerEmail: employer?.email || undefined,
    contractId: declaration.contractId,
    contractOfferTitle: contract?.offerTitle || MISSING,
    contractEmployeeName: contract?.employeeName || MISSING,
    contractMonthlySalary: contract?.monthlySalary,
    contractMonthlySalaryLabel: typeof contract?.monthlySalary === 'number'
      ? `${contract.monthlySalary.toLocaleString('fr-FR')} ${contract.currency}`
      : MISSING,
    contractCurrency: contract?.currency,
    contractStartDate: contract?.startDate,
    contractStatus: contract?.status,
    amount: declaration.amount,
    currency: declaration.currency,
    amountLabel: `${declaration.amount.toLocaleString('fr-FR')} ${declaration.currency}`,
    paymentMethod: method,
    paymentMethodLabel: EXTERNAL_PAYMENT_METHOD_LABELS[method] ?? method,
    transactionId: declaration.transactionId,
    reference: declaration.reference,
    paidAt: declaration.paidAt,
    paidAtLabel: formatDeclarationMoment(declaration.paidAt),
    submittedAt: declaration.submittedAt ?? '',
    submittedAtLabel: formatDeclarationMoment(declaration.submittedAt),
    reviewedAt: declaration.reviewedAt ?? '',
    reviewedAtLabel: formatDeclarationMoment(declaration.reviewedAt),
    reviewedBy: declaration.reviewedBy ?? '',
    rejectionReason: declaration.rejectionReason ?? '',
    decisionLabel: formatDeclarationDecision(declaration),
    pendingDecision: declaration.status === 'SUBMITTED',
    createdAt: declaration.createdAt,
    createdAtLabel: formatDeclarationMoment(declaration.createdAt),
    updatedAt: declaration.updatedAt,
    updatedAtLabel: formatDeclarationMoment(declaration.updatedAt),
    proofDocumentId: declaration.proofDocumentId,
    proofReference: declaration.proofReference,
    proofLabel: declaration.proofDocumentId
      ? `Document joint · ${declaration.proofDocumentId}`
      : declaration.proofReference
        ? `Référence du justificatif · ${declaration.proofReference}`
        : 'Aucun justificatif transmis',
    hasProof: Boolean(declaration.proofDocumentId || declaration.proofReference),
    comment: declaration.comment,
  };
}

export type AdminPaymentDeclarationHistoryOrigin = 'AUDIT' | 'DECLARATION';

export interface AdminPaymentDeclarationHistoryEntry {
  id: string;
  at: string;
  atLabel: string;
  label: string;
  detail: string;
  origin: AdminPaymentDeclarationHistoryOrigin;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  PAYMENT_DECLARATION_CREATED: 'Déclaration créée',
  PAYMENT_DECLARATION_UPDATED: 'Déclaration modifiée',
  PAYMENT_DECLARATION_SUBMITTED: 'Déclaration soumise',
  PAYMENT_DECLARATION_APPROVED: 'Déclaration approuvée',
  PAYMENT_DECLARATION_REJECTED: 'Déclaration rejetée',
};

/** Actions du journal d'audit correspondant à chaque fait porté par la déclaration. */
const DECLARATION_FACT_AUDIT_ACTIONS: Record<'CREATED' | 'SUBMITTED' | 'UPDATED' | 'DECIDED', readonly string[]> = {
  CREATED: ['PAYMENT_DECLARATION_CREATED'],
  SUBMITTED: ['PAYMENT_DECLARATION_SUBMITTED'],
  UPDATED: ['PAYMENT_DECLARATION_UPDATED'],
  DECIDED: ['PAYMENT_DECLARATION_APPROVED', 'PAYMENT_DECLARATION_REJECTED'],
};

/**
 * Historique du dossier : les faits portés par la déclaration (création,
 * soumission, mise à jour, décision administrative) sont complétés par le
 * journal d'audit du dépôt. Un fait déjà tracé par le journal n'est pas
 * dupliqué, mais rien n'est jamais perdu : une décision enregistrée laisse
 * visibles la création et la soumission qui la précèdent.
 */
export function buildAdminPaymentDeclarationHistory(
  declaration: PaymentDeclaration,
  logs: readonly SystemAuditLog[],
): AdminPaymentDeclarationHistoryEntry[] {
  const declarationLogs = logs.filter(log => log.entityId === declaration.paymentId);
  const auditedActions = new Set(declarationLogs.map(log => log.action));
  const isAudited = (fact: keyof typeof DECLARATION_FACT_AUDIT_ACTIONS): boolean =>
    DECLARATION_FACT_AUDIT_ACTIONS[fact].some(action => auditedActions.has(action));

  const auditEntries: AdminPaymentDeclarationHistoryEntry[] = declarationLogs.map((log, index) => ({
    id: `AUDIT-${log.id || index}`,
    at: log.timestamp,
    atLabel: log.timestamp,
    label: AUDIT_ACTION_LABELS[log.action] ?? log.action,
    detail: log.summary,
    origin: 'AUDIT' as const,
  }));

  const derived: AdminPaymentDeclarationHistoryEntry[] = [];
  if (!isAudited('CREATED')) {
    derived.push({
      id: `${declaration.paymentId}-CREATED`,
      at: declaration.createdAt,
      atLabel: formatDeclarationMoment(declaration.createdAt),
      label: 'Déclaration créée',
      detail: `Brouillon ${declaration.paymentId} enregistré par l’employeur.`,
      origin: 'DECLARATION',
    });
  }
  if (declaration.submittedAt && !isAudited('SUBMITTED')) {
    derived.push({
      id: `${declaration.paymentId}-SUBMITTED`,
      at: declaration.submittedAt,
      atLabel: formatDeclarationMoment(declaration.submittedAt),
      label: 'Déclaration soumise',
      detail: `Déclaration ${declaration.paymentId} transmise pour vérification administrative.`,
      origin: 'DECLARATION',
    });
  }
  if (declaration.reviewedAt && !isAudited('DECIDED')) {
    derived.push({
      id: `${declaration.paymentId}-REVIEWED`,
      at: declaration.reviewedAt,
      atLabel: formatDeclarationMoment(declaration.reviewedAt),
      label: declaration.status === 'REJECTED' ? 'Déclaration rejetée' : 'Déclaration approuvée',
      detail: declaration.status === 'REJECTED'
        ? `Rejet enregistré par l’administration${declaration.rejectionReason ? ` : ${declaration.rejectionReason}` : ''}.`
        : `Approbation enregistrée par l’administration sur ${declaration.paymentId}.`,
      origin: 'DECLARATION',
    });
  }
  const updatedIsDecision = Boolean(declaration.reviewedAt) && declaration.updatedAt === declaration.reviewedAt;
  if (
    declaration.updatedAt !== declaration.createdAt
    && declaration.updatedAt !== declaration.submittedAt
    && !updatedIsDecision
    && !isAudited('UPDATED')
  ) {
    derived.push({
      id: `${declaration.paymentId}-UPDATED`,
      at: declaration.updatedAt,
      atLabel: formatDeclarationMoment(declaration.updatedAt),
      label: 'Dernière mise à jour',
      detail: `Dernière modification enregistrée sur ${declaration.paymentId}.`,
      origin: 'DECLARATION',
    });
  }

  // Du plus récent au plus ancien : les deux origines sont triées ensemble.
  return [...auditEntries, ...derived]
    .map((entry, index) => ({ entry, index, moment: sortableDeclarationMoment(entry.at) }))
    .sort((a, b) => (b.moment - a.moment) || (a.index - b.index))
    .map(item => item.entry);
}

/**
 * Règle de tri partagée par le Repository et l'écran : seules les déclarations
 * soumises sont retenues, de la soumission la plus récente à la plus ancienne.
 */
export function sortSubmittedDeclarationsForAdmin(
  declarations: readonly PaymentDeclaration[],
): PaymentDeclaration[] {
  return declarations
    .filter(declaration => declaration.status === 'SUBMITTED')
    .slice()
    .sort((a, b) => (b.submittedAt ?? b.updatedAt).localeCompare(a.submittedAt ?? a.updatedAt));
}
