/**
 * PHASE 4C — préparation de l'affichage ADMIN des paiements soumis.
 *
 * Ces fonctions sont pures : elles résolvent l'employeur et le contrat d'une
 * déclaration de paiement externe et produisent les libellés affichés par
 * l'écran « Paiements à vérifier ». Aucune décision administrative n'est prise
 * ici : UNDER_REVIEW / APPROVED / REJECTED restent hors périmètre et le
 * Repository reste la seule autorité de lecture.
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
};

/**
 * Historique du dossier : le journal d'audit du dépôt est utilisé dès qu'il
 * contient des événements pour cette déclaration ; sinon l'horodatage porté par
 * la déclaration elle-même est présenté (création / soumission / mise à jour).
 * Aucune entrée n'est inventée au-delà de ces faits.
 */
export function buildAdminPaymentDeclarationHistory(
  declaration: PaymentDeclaration,
  logs: readonly SystemAuditLog[],
): AdminPaymentDeclarationHistoryEntry[] {
  const auditEntries: AdminPaymentDeclarationHistoryEntry[] = logs
    .filter(log => log.entityId === declaration.paymentId)
    .map((log, index) => ({
      id: `AUDIT-${log.id || index}`,
      at: log.timestamp,
      atLabel: log.timestamp,
      label: AUDIT_ACTION_LABELS[log.action] ?? log.action,
      detail: log.summary,
      origin: 'AUDIT' as const,
    }));

  // Les journaux sont stockés du plus récent au plus ancien : l'ordre est conservé.
  if (auditEntries.length > 0) return auditEntries;

  const derived: AdminPaymentDeclarationHistoryEntry[] = [{
    id: `${declaration.paymentId}-CREATED`,
    at: declaration.createdAt,
    atLabel: formatDeclarationMoment(declaration.createdAt),
    label: 'Déclaration créée',
    detail: `Brouillon ${declaration.paymentId} enregistré par l’employeur.`,
    origin: 'DECLARATION',
  }];
  if (declaration.submittedAt) {
    derived.push({
      id: `${declaration.paymentId}-SUBMITTED`,
      at: declaration.submittedAt,
      atLabel: formatDeclarationMoment(declaration.submittedAt),
      label: 'Déclaration soumise',
      detail: `Déclaration ${declaration.paymentId} transmise pour vérification administrative.`,
      origin: 'DECLARATION',
    });
  }
  if (declaration.updatedAt !== declaration.createdAt && declaration.updatedAt !== declaration.submittedAt) {
    derived.push({
      id: `${declaration.paymentId}-UPDATED`,
      at: declaration.updatedAt,
      atLabel: formatDeclarationMoment(declaration.updatedAt),
      label: 'Dernière mise à jour',
      detail: `Dernière modification enregistrée sur ${declaration.paymentId}.`,
      origin: 'DECLARATION',
    });
  }
  return derived.reverse();
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
