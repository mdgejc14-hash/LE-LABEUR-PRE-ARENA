/**
 * LE LABEUR — P0-PAY-1 — enregistrements et ports de persistance du PAIEMENT.
 *
 * Même discipline que `coreRecords.ts` (P0-A) : les enregistrements sont DÉRIVÉS
 * des types du domaine (`src/domain/paymentLifecycle.ts`) par `Pick`, donc
 * renommer un champ métier casse la compilation ; les domaines d'états sont
 * comparés aux contraintes CHECK de `migrations/0008_payment_cycle.sql` par les
 * tests.
 *
 * Aucun second mécanisme n'est créé : le planning reste `automation_deadlines` /
 * `automation_jobs`, l'idempotence reste `automation_idempotency` + index
 * d'unicité, l'audit reste `automation_audit_ledger`, l'échéancier reste les
 * colonnes JSONB du contrat.
 */

import type {
  Payment,
  PaymentDeclarationAttempt,
  PaymentLifecycleStatus,
  PaymentProofMetadata,
  PaymentType,
} from '../../domain/paymentLifecycle';
import {
  PAYMENT_LIFECYCLE_STATUS_VALUES,
  PAYMENT_TYPE_VALUES,
} from '../../domain/paymentLifecycle';
import type { ContractHistoryEntry } from './coreRecords';

/** Tables ouvertes par P0-PAY-1 (aucune autre). */
export const PAYMENT_TABLES = ['payments', 'payment_declarations'] as const;

export type PaymentTableName = (typeof PAYMENT_TABLES)[number];

export type PaymentStoreName = PaymentTableName | 'contract-payments';

export type PaymentStoreFailure =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'INVALID_STATUS'
  | 'INVALID_ROW'
  | 'CONSTRAINT';

/** Erreur stable et sans secret, même forme que `CoreStoreError`. */
export class PaymentStoreError extends Error {
  constructor(
    readonly failure: PaymentStoreFailure,
    readonly entity: PaymentStoreName,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentStoreError';
  }
}

/** Domaine SQL réellement posé par la migration 0008. */
export const PAYMENT_SQL_STATUS_DOMAIN = [
  'SCHEDULED',
  'DUE',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'PAID',
  'REJECTED',
] as const;

export const PAYMENT_SQL_TYPE_DOMAIN = ['SALARY', 'PLATFORM_FEE'] as const;

/**
 * Garde-fous de compilation : le domaine TypeScript et le domaine SQL doivent
 * couvrir exactement les mêmes valeurs (ni manque, ni surplus).
 */
export const PAYMENT_PERSISTENCE_EXACTNESS = [
  PAYMENT_LIFECYCLE_STATUS_VALUES.length === PAYMENT_SQL_STATUS_DOMAIN.length,
  PAYMENT_TYPE_VALUES.length === PAYMENT_SQL_TYPE_DOMAIN.length,
  (PAYMENT_LIFECYCLE_STATUS_VALUES as readonly string[]).every(value =>
    (PAYMENT_SQL_STATUS_DOMAIN as readonly string[]).includes(value)),
  (PAYMENT_TYPE_VALUES as readonly string[]).every(value =>
    (PAYMENT_SQL_TYPE_DOMAIN as readonly string[]).includes(value)),
] as const;

export function assertPaymentStatusDomain(value: string, entity: PaymentStoreName): asserts value is PaymentLifecycleStatus {
  if (!(PAYMENT_SQL_STATUS_DOMAIN as readonly string[]).includes(value)) {
    throw new PaymentStoreError('INVALID_STATUS', entity, `Statut « ${value} » hors domaine pour ${entity}.`);
  }
}

export function assertPaymentTypeDomain(value: string, entity: PaymentStoreName): asserts value is PaymentType {
  if (!(PAYMENT_SQL_TYPE_DOMAIN as readonly string[]).includes(value)) {
    throw new PaymentStoreError('INVALID_STATUS', entity, `Nature « ${value} » hors domaine pour ${entity}.`);
  }
}

/* ------------------------------------------------------------------ */
/* Enregistrements                                                     */
/* ------------------------------------------------------------------ */

/**
 * Ligne `payments`. Dérivée de l'agrégat `Payment` : AUCUN nom d'employeur, de
 * salarié ou d'offre n'est dupliqué — les libellés sont résolus à la projection
 * depuis `users` / `contracts`, comme pour `ContractRecord`.
 */
export type PaymentRecord = Pick<Payment,
  | 'paymentId' | 'contractId' | 'employerId' | 'candidateId' | 'paymentType'
  | 'scheduleEntryId' | 'monthNumber' | 'periodKey' | 'amount' | 'currency'
  | 'scheduledAt' | 'dueAt' | 'status' | 'submittedAt' | 'submittedBy' | 'reference'
  | 'proof' | 'verifiedAt' | 'verifiedBy' | 'rejectedAt' | 'rejectedBy' | 'rejectionReason'
  | 'externalTransactionId' | 'provider' | 'declarationCount' | 'currentDeclarationId'
  | 'idempotencyKey' | 'createdAt' | 'updatedAt'
>;

/** Ligne `payment_declarations` : une tentative, append-only. */
export type PaymentDeclarationRecord = Pick<PaymentDeclarationAttempt,
  | 'declarationId' | 'paymentId' | 'contractId' | 'periodKey' | 'paymentType'
  | 'attemptNumber' | 'amount' | 'currency' | 'reference' | 'externalTransactionId'
  | 'provider' | 'proof' | 'comment' | 'submittedAt' | 'submittedBy'
  | 'outcome' | 'reviewedAt' | 'reviewedBy' | 'rejectionReason'
  | 'idempotencyKey' | 'createdAt' | 'updatedAt'
>;

/** Brouillon d'insertion idempotente d'un paiement. */
export type PaymentDraft = Pick<PaymentRecord,
  | 'paymentId' | 'contractId' | 'employerId' | 'candidateId' | 'paymentType'
  | 'scheduleEntryId' | 'monthNumber' | 'periodKey' | 'amount' | 'currency'
  | 'scheduledAt' | 'dueAt' | 'status' | 'idempotencyKey'
> & { createdAt: string; updatedAt: string };

/* ------------------------------------------------------------------ */
/* Patches de transition (compare-and-set)                             */
/* ------------------------------------------------------------------ */

/**
 * Écriture d'une transition. Chaque champ n'est renseigné que par la transition
 * qui le produit : aucune valeur n'est supposée, aucun champ antérieur n'est
 * effacé (un rejet conserve la référence et la preuve de la tentative).
 */
export interface PaymentTransitionPatch {
  status: PaymentLifecycleStatus;
  updatedAt: string;
  reference?: string;
  submittedAt?: string;
  submittedBy?: string;
  proof?: PaymentProofMetadata;
  externalTransactionId?: string;
  provider?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  currentDeclarationId?: string;
  /** La déclaration AJOUTE une tentative : le compteur est incrémenté, jamais fixé. */
  incrementDeclarationCount?: boolean;
}

export interface DeclarationOutcomePatch {
  outcome: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Ports                                                               */
/* ------------------------------------------------------------------ */

export interface PaymentStore {
  /** Création idempotente (index d'unicité `payments_idempotency_unique_idx`). */
  createIfAbsent(draft: PaymentDraft): Promise<{ kind: 'created'; payment: PaymentRecord } | { kind: 'duplicate'; payment: PaymentRecord }>;
  findById(paymentId: string): Promise<PaymentRecord | null>;
  /** Verrou pessimiste : sérialise déclaration, vérification, rejet et DUE. */
  findByIdForUpdate(paymentId: string): Promise<PaymentRecord | null>;
  findByContractAndPeriod(
    contractId: string,
    paymentType: PaymentType,
    monthNumber: number,
  ): Promise<PaymentRecord | null>;
  findByExternalTransaction(
    provider: string,
    externalTransactionId: string,
  ): Promise<PaymentRecord | null>;
  findByReference(reference: string): Promise<PaymentRecord | null>;
  /** Transition conditionnelle : `null` si le statut a changé entre-temps. */
  compareAndSetStatus(
    paymentId: string,
    expected: readonly PaymentLifecycleStatus[],
    patch: PaymentTransitionPatch,
  ): Promise<PaymentRecord | null>;
  listByContract(contractId: string, limit?: number): Promise<PaymentRecord[]>;
  listByEmployer(employerId: string, limit?: number, afterId?: string | null): Promise<PaymentRecord[]>;
  /**
   * Lectures du SALARIÉ : filtrées par nature. Un salarié ne consulte que ses
   * paiements de SALAIRE — la commission de plateforme n'est pas sa donnée.
   */
  listByCandidate(
    candidateId: string,
    limit?: number,
    afterId?: string | null,
    paymentType?: PaymentType,
  ): Promise<PaymentRecord[]>;
  /** Lecture ADMIN, keyset par (updatedAt, id) — bornée, jamais un scan complet. */
  listAll(limit?: number, afterId?: string | null): Promise<PaymentRecord[]>;
  /** Paiements encore `SCHEDULED` dont l'échéance est atteinte (borné). */
  listScheduledDue(limit: number, now: string): Promise<PaymentRecord[]>;
}

export interface PaymentDeclarationStore {
  /** Insertion ajoutée : une tentative n'écrase jamais la précédente. */
  create(record: PaymentDeclarationRecord): Promise<PaymentDeclarationRecord>;
  findById(declarationId: string): Promise<PaymentDeclarationRecord | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<PaymentDeclarationRecord | null>;
  findByExternalTransaction(
    provider: string,
    externalTransactionId: string,
  ): Promise<PaymentDeclarationRecord | null>;
  findByReference(reference: string): Promise<PaymentDeclarationRecord[]>;
  nextAttemptNumber(paymentId: string): Promise<number>;
  listByPayment(paymentId: string, limit?: number): Promise<PaymentDeclarationRecord[]>;
  compareAndSetOutcome(
    declarationId: string,
    expected: 'PENDING',
    patch: DeclarationOutcomePatch,
  ): Promise<PaymentDeclarationRecord | null>;
}

/**
 * Projection du cycle sur les vues RÉELLES du contrat (échéancier JSONB, grand
 * livre de commission, historique). Chaque écriture est gardée par le statut
 * attendu de l'entrée : une projection rejouée ne peut pas régresser un état ni
 * en écraser un plus avancé.
 */
export interface ContractPaymentProjectionWriter {
  projectPaymentStatus(input: {
    contractId: string;
    scheduleEntryId: string;
    paymentType: PaymentType;
    /** Mois visé (clé du grand livre de commission). */
    monthNumber: number;
    /** Statut attendu dans l'entrée d'échéancier avant la projection. */
    expectedEntryStatus: string;
    /** Statut projeté (domaine du contrat, sans `VERIFIED`). */
    entryStatus: string;
    /** Champs additionnels fusionnés dans l'entrée (preuve, transaction…). */
    entryPatch: Record<string, unknown>;
    /** Patch du grand livre de commission (nature PLATFORM_FEE uniquement). */
    ledgerPatch?: Record<string, unknown>;
    /** Vue de commission du contrat, seulement si le mois est le mois courant. */
    contractCommission?: { status: string; amountDue: number };
    historyEntry?: ContractHistoryEntry;
    updatedAt: string;
  }): Promise<boolean>;
  advanceContractMonth(input: {
    contractId: string;
    fromMonth: number;
    toMonth: number;
    checkpoint: Record<string, unknown>;
    ledgerEntry: Record<string, unknown>;
    commissionAmountDue: number;
    commissionStatus: string;
    historyEntry: ContractHistoryEntry;
    updatedAt: string;
  }): Promise<boolean>;
}

/** Jeu complet utilisé par l'automatisation et par le repository. */
export interface PaymentStores {
  payments: PaymentStore;
  declarations: PaymentDeclarationStore;
  contractPayments: ContractPaymentProjectionWriter;
}
