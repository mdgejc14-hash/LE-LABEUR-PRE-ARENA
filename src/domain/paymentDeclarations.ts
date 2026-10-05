/**
 * LE LABEUR — PHASE 4 — FONDATION MÉTIER « PAIEMENTS EMPLOYEUR ».
 *
 * Règles figées :
 *  1. L'employeur paie LE LABEUR **extérieurement**. LE LABEUR n'encaisse pas.
 *  2. L'employeur DÉCLARE le paiement et fournit une preuve (justificatif).
 *  3. La déclaration suit une machine d'états contrôlée (DRAFT → … → APPROVED).
 *  4. Un rejet ne supprime JAMAIS la dette : le montant reste dû.
 *  5. Tout rejet conserve : rejectionReason, reviewedBy, reviewedAt, historique.
 *  6. L'employeur peut régulariser puis soumettre à nouveau sans perdre l'historique.
 *  10. Aucune commission n'est recalculée ici : 25% M1 / 0% M2+ reste la source
 *      unique (`businessRules.ts`) et alimente `amountDue` via le calendrier
 *      contractuel existant.
 *  11. `dueDate` est conservée sur chaque déclaration pour qu'un futur
 *      automatisme J+3 (Cron/Queue côté serveur) puisse être branché sans
 *      refonte. Aucun scheduler n'est créé dans cette phase.
 *
 * Ce module est PURE : aucune persistance, aucun accès réseau, aucune date
 * implicite autre que celle passée en paramètre.
 */

import type {
  PaymentDeclaration,
  PaymentDeclarationKind,
  PaymentDeclarationStatus,
  PaymentHistoryEvent,
  PaymentHistoryEventType,
  PaymentMethod,
  PaymentProof,
  UserRole,
} from '../types';

export const PAYMENT_METHODS = [
  { id: 'MTN_MOMO', label: 'MTN Mobile Money' },
  { id: 'MOOV_MONEY', label: 'Moov Money' },
  { id: 'BANK_TRANSFER', label: 'Virement bancaire' },
  { id: 'CASH_DESK', label: 'Versement au guichet LE LABEUR' },
  { id: 'OTHER', label: 'Autre moyen de paiement' },
] as const;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = PAYMENT_METHODS.reduce(
  (acc, method) => ({ ...acc, [method.id]: method.label }),
  {} as Record<PaymentMethod, string>,
);

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && PAYMENT_METHODS.some(method => method.id === value);
}

export const PAYMENT_KIND_LABELS: Record<PaymentDeclarationKind, string> = {
  COMMISSION: 'Commission LE LABEUR',
  SALARY: 'Salaire du travailleur',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentDeclarationStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumise — à vérifier',
  UNDER_REVIEW: 'En cours de vérification',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée — à régulariser',
  RESUBMITTED: 'Régularisée — à re-vérifier',
};

export const PAYMENT_HISTORY_LABELS: Record<PaymentHistoryEventType, string> = {
  CREATED: 'Déclaration créée',
  UPDATED: 'Déclaration mise à jour',
  SUBMITTED: 'Déclaration soumise à vérification',
  REVIEW_STARTED: 'Vérification prise en charge par l’administration',
  APPROVED: 'Paiement approuvé',
  REJECTED: 'Paiement rejeté',
  RESUBMITTED: 'Déclaration régularisée et soumise à nouveau',
  EMPLOYER_BLOCKED: 'Compte employeur bloqué',
  EMPLOYER_UNBLOCKED: 'Compte employeur débloqué',
};

/**
 * Machine d'états autorisée. Toute transition absente de cette table est
 * refusée, quel que soit l'appelant (écran, client API, administrateur).
 */
export const PAYMENT_DECLARATION_TRANSITIONS: Record<PaymentDeclarationStatus, readonly PaymentDeclarationStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  RESUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
  REJECTED: ['RESUBMITTED'],
  APPROVED: [],
};

export function canTransitionPaymentDeclaration(
  from: PaymentDeclarationStatus,
  to: PaymentDeclarationStatus,
): boolean {
  return PAYMENT_DECLARATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPaymentDeclarationTransition(
  from: PaymentDeclarationStatus,
  to: PaymentDeclarationStatus,
): void {
  if (!canTransitionPaymentDeclaration(from, to)) {
    throw new Error(
      `Transition de paiement interdite : ${from} → ${to}. ` +
      `Transitions autorisées depuis ${from} : ${PAYMENT_DECLARATION_TRANSITIONS[from].join(', ') || 'aucune'}.`,
    );
  }
}

/** Déclarations qui nécessitent une action administrative. */
export function isPaymentAwaitingAdminAction(status: PaymentDeclarationStatus): boolean {
  return status === 'SUBMITTED' || status === 'UNDER_REVIEW' || status === 'RESUBMITTED';
}

/** Déclarations que l'employeur peut encore modifier. */
export function isPaymentEditableByEmployer(status: PaymentDeclarationStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

/** Un paiement approuvé est terminal (clôture du dossier). */
export function isPaymentSettled(status: PaymentDeclarationStatus): boolean {
  return status === 'APPROVED';
}

/** RÈGLE 4 : la dette subsiste tant que le paiement n'est pas approuvé. */
export function remainingDueAfter(declaration: PaymentDeclaration): number {
  if (isPaymentSettled(declaration.status)) return 0;
  return Math.max(0, declaration.amountDue);
}

export interface PaymentDeclarationInput {
  contractId: string;
  monthNumber: number;
  kind: PaymentDeclarationKind;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionId: string;
  reference?: string;
  paidAt: string;
  proof: Pick<PaymentProof, 'fileName' | 'uri' | 'documentId' | 'mimeType' | 'sizeBytes'>;
  comment?: string;
}

export const MAX_PAYMENT_COMMENT_LENGTH = 500;
export const MIN_REJECTION_REASON_LENGTH = 5;

export interface PaymentDeclarationValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

/**
 * Validation métier d'une déclaration (création, mise à jour, régularisation).
 * Le contrôle du montant attendu reste au repository : il lit le calendrier
 * contractuel réel, seule source de la commission (25% M1 / 0% M2+).
 */
export function validatePaymentDeclarationInput(
  input: Partial<PaymentDeclarationInput>,
  options: { partial?: boolean } = {},
): PaymentDeclarationValidationResult {
  const errors: Record<string, string> = {};
  const provided = (key: keyof PaymentDeclarationInput) => input[key] !== undefined && input[key] !== null && input[key] !== '';
  const require = (key: keyof PaymentDeclarationInput, message: string) => {
    if (!options.partial && !provided(key)) errors[key as string] = message;
  };

  require('contractId', 'Le contrat concerné est obligatoire.');
  if (provided('monthNumber') && (!Number.isInteger(input.monthNumber) || (input.monthNumber as number) < 1)) {
    errors.monthNumber = 'Le numéro de mois est invalide.';
  }
  if (provided('kind') && input.kind !== 'COMMISSION' && input.kind !== 'SALARY') {
    errors.kind = 'La nature du versement est invalide.';
  }
  if (provided('amount')) {
    if (!Number.isFinite(input.amount)) errors.amount = 'Le montant est invalide.';
    else if ((input.amount as number) <= 0) errors.amount = 'Le montant déclaré doit être supérieur à 0.';
  } else {
    require('amount', 'Le montant déclaré est obligatoire.');
  }
  if (provided('paymentMethod') && !isPaymentMethod(input.paymentMethod)) {
    errors.paymentMethod = 'Le moyen de paiement est invalide.';
  } else {
    require('paymentMethod', 'Le moyen de paiement est obligatoire.');
  }
  if (provided('transactionId') && String(input.transactionId).trim().length < 4) {
    errors.transactionId = 'L’ID de transaction est trop court pour être vérifié.';
  } else {
    require('transactionId', 'L’ID de transaction est obligatoire.');
  }
  if (provided('paidAt') && Number.isNaN(new Date(input.paidAt as string).getTime())) {
    errors.paidAt = 'La date et l’heure du paiement sont invalides.';
  } else {
    require('paidAt', 'La date et l’heure du paiement sont obligatoires.');
  }
  if (provided('proof')) {
    const proof = input.proof as PaymentDeclarationInput['proof'];
    if (!proof?.fileName?.trim()) errors.proof = 'Le justificatif est obligatoire (nom du fichier).';
    else if (!proof?.uri?.trim()) errors.proof = 'La référence du justificatif est obligatoire.';
  } else {
    require('proof', 'Le justificatif de paiement est obligatoire.');
  }
  if (provided('comment') && String(input.comment).length > MAX_PAYMENT_COMMENT_LENGTH) {
    errors.comment = `La remarque ne doit pas dépasser ${MAX_PAYMENT_COMMENT_LENGTH} caractères.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Variante qui lève la première erreur (style des repositories existants). */
export function assertValidPaymentDeclarationInput(
  input: Partial<PaymentDeclarationInput>,
  options?: { partial?: boolean },
): void {
  const { ok, errors } = validatePaymentDeclarationInput(input, options);
  if (!ok) throw new Error(Object.values(errors)[0]);
}

/** Le motif de rejet est OBLIGATOIRE et exploitable (RÈGLE 5). */
export function normalizeRejectionReason(reason: string | undefined | null): string {
  const value = (reason ?? '').trim();
  if (value.length < MIN_REJECTION_REASON_LENGTH) {
    throw new Error('Le motif du rejet est obligatoire pour informer l’employeur et tracer la décision.');
  }
  return value;
}

/** Retard en jours entiers d'une échéance (base de la future automatisation J+3). */
export function daysLateForPayment(dueDate: string | undefined, now: Date = new Date()): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(due)) return 0;
  const reference = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((reference - due) / 86400000));
}

export type PaymentBlockingRuleCode = 'J3_OVERDUE' | 'REPEATED_REJECTION' | 'REGULARIZED';

export interface PaymentBlockingEvaluation {
  canBlock: boolean;
  canUnblock: boolean;
  rule?: PaymentBlockingRuleCode;
  label: string;
  daysLate: number;
  /** Dossier en cours de vérification : l'employeur est protégé (J+3 suspendu). */
  underVerification: boolean;
}

/**
 * RÈGLE 8 — le blocage/déblocage est traçable et conditionné à une règle
 * métier explicite : jamais un blocage discrétionnaire sans motif daté.
 *
 * Cohérence avec la règle J+3 existante du compte employeur :
 *  · une déclaration EN VÉRIFICATION protège l'employeur (aucun blocage) ;
 *  · un dossier REJETÉ ou une échéance impayée depuis 3 jours rend la dette
 *    exigible et justifie le blocage (`scheduleOverdue` = constat du
 *    calendrier contractuel, seule source de l'échéancier) ;
 *  · le déblocage n'est autorisé qu'après régularisation VALIDÉE (dossier
 *    approuvé) ou disparition du motif.
 */
export function evaluatePaymentBlockingRule(input: {
  status: PaymentDeclarationStatus;
  dueDate?: string;
  rejectionCount: number;
  employerBlocked: boolean;
  /** Dette exigible constatée sur le calendrier contractuel (J+3). */
  scheduleOverdue?: boolean;
  now?: Date;
}): PaymentBlockingEvaluation {
  const now = input.now ?? new Date();
  const daysLate = daysLateForPayment(input.dueDate, now);
  const settled = isPaymentSettled(input.status);
  const underVerification = isPaymentAwaitingAdminAction(input.status);
  const scheduleOverdue = input.scheduleOverdue === true;
  const repeatedRejection = !settled && input.rejectionCount >= 2;

  if (input.employerBlocked) {
    if (settled) {
      return {
        canBlock: false,
        canUnblock: true,
        rule: 'REGULARIZED',
        label: 'Régularisation validée : le déblocage est autorisé.',
        daysLate,
        underVerification,
      };
    }
    if (underVerification) {
      return {
        canBlock: false,
        canUnblock: false,
        label: 'Déclaration en cours de vérification : le déblocage sera possible après validation.',
        daysLate,
        underVerification,
      };
    }
    if (scheduleOverdue) {
      return {
        canBlock: false,
        canUnblock: false,
        label: 'Blocage maintenu : une échéance reste impayée depuis au moins 3 jours.',
        daysLate,
        underVerification,
      };
    }
    return {
      canBlock: false,
      canUnblock: true,
      label: 'Plus d’échéance en retard : le déblocage est autorisé.',
      daysLate,
      underVerification,
    };
  }

  if (settled) {
    return {
      canBlock: false,
      canUnblock: false,
      label: 'Dossier approuvé : aucune mesure de blocage.',
      daysLate,
      underVerification,
    };
  }
  if (underVerification) {
    return {
      canBlock: false,
      canUnblock: false,
      label: 'Déclaration en cours de vérification : l’employeur est protégé, aucun blocage.',
      daysLate,
      underVerification,
    };
  }
  if (scheduleOverdue) {
    return {
      canBlock: true,
      canUnblock: false,
      rule: daysLate >= 3 ? 'J3_OVERDUE' : 'REPEATED_REJECTION',
      label: daysLate >= 3
        ? `Échéance impayée depuis ${daysLate} jour(s) (J+3 dépassé) : blocage justifié.`
        : `${input.rejectionCount} rejet(s) sur ce dossier et échéance impayée : blocage justifié.`,
      daysLate,
      underVerification,
    };
  }
  return {
    canBlock: false,
    canUnblock: false,
    label: repeatedRejection
      ? 'Rejets répétés, mais aucune échéance exigible : blocage non justifié.'
      : 'Aucune règle de blocage applicable à ce dossier.',
    daysLate,
    underVerification,
  };
}

export function buildPaymentReference(
  contractId: string,
  monthNumber: number,
  kind: PaymentDeclarationKind,
  sequence: number,
): string {
  const prefix = kind === 'COMMISSION' ? 'COMM' : 'SAL';
  return `${prefix}-${contractId}-M${String(monthNumber).padStart(2, '0')}-${String(sequence).padStart(3, '0')}`;
}

let historySequence = 0;

/** Fabrique un événement d'historique immuable (RÈGLE 8/9). */
export function createPaymentHistoryEvent(input: {
  paymentId: string;
  type: PaymentHistoryEventType;
  actorId: string;
  actorName: string;
  actorRole: UserRole | 'SYSTEM';
  fromStatus?: PaymentDeclarationStatus;
  toStatus?: PaymentDeclarationStatus;
  reason?: string;
  occurredAt: string;
  id?: string;
  metadata?: Record<string, unknown>;
}): PaymentHistoryEvent {
  historySequence += 1;
  return {
    id: input.id ?? `PH-${input.paymentId}-${historySequence}-${Date.now()}`,
    paymentId: input.paymentId,
    type: input.type,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    ...(input.reason ? { reason: input.reason } : {}),
    occurredAt: input.occurredAt,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

/** Copie défensive : l'historique n'est jamais muté par les écrans. */
export function readPaymentHistory(declaration: PaymentDeclaration): PaymentHistoryEvent[] {
  return [...declaration.history].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

/** Montant effectivement attendu pour une déclaration (jamais recalculé). */
export function hasAmountMismatch(declaration: PaymentDeclaration): boolean {
  return declaration.amount !== declaration.amountDue;
}
