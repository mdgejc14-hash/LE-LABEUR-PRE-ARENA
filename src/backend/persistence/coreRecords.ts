/**
 * LE LABEUR — P0-A — contrats de persistance du noyau relationnel.
 *
 * Périmètre strict (celui de l'audit `ca99324`) : utilisateurs, identités
 * externes, sessions, permissions, offres, candidatures, contrats.
 * Aucun autre domaine (paiements, incidents, remplacements, messages,
 * notifications, documents) n'est modélisé ici.
 *
 * Les enregistrements sont DÉRIVÉS des types du domaine (`src/types/index.ts`)
 * par `Pick` : renommer un champ métier casse la compilation. Les domaines
 * d'états sont dérivés de la même source et vérifiés par
 * `CORE_DOMAIN_EXACTNESS` (garde-fou de compilation) puis par les tests, qui
 * les comparent aux contraintes CHECK des migrations.
 */

import type { Permission } from '../productionContracts';
import type {
  Application,
  ApplicationStatus,
  CommissionPaymentStatus,
  Contract,
  ContractStatus,
  FilterState,
  Offer,
  UserRole,
} from '../../types';

/**
 * `true` uniquement si les valeurs déclarées couvrent EXACTEMENT l'union
 * métier (ni valeur manquante, ni valeur en trop).
 */
type ExactDomain<Union extends string, Values extends readonly Union[]> =
  Exclude<Union, Values[number]> extends never
    ? (Exclude<Values[number], Union> extends never ? true : { extraValues: Exclude<Values[number], Union> })
    : { missingValues: Exclude<Union, Values[number]> };

export const USER_ROLE_VALUES = ['CANDIDATE', 'EMPLOYER', 'ADMIN'] as const;
export const ACCOUNT_STATUS_VALUES = ['ACTIVE', 'BLOCKED', 'PENDING'] as const;
export const EXTERNAL_IDENTITY_PROVIDER_VALUES = ['GOOGLE'] as const;
export const OFFER_STATUS_VALUES = ['ACTIVE', 'FILLED', 'CANCELLED', 'PAUSED'] as const;
export const APPLICATION_STATUS_VALUES = [
  'PENDING',
  'REVIEW',
  'SHORTLISTED',
  'REJECTED',
  'WITHDRAWN',
  'HIRED',
  'CONTRACTED',
  'CLOSED_OFFER_FILLED',
] as const;
export const CONTRACT_STATUS_VALUES = [
  'DRAFT',
  'PENDING_EMPLOYER',
  'PENDING_EMPLOYEE',
  'SIGNATURE',
  'ACTIVE',
  'SUSPENDED',
  'INCIDENT',
  'TERMINATED',
  'COMPLETED',
  'REPLACED',
] as const;
export const COMMISSION_STATUS_VALUES = [
  'SCHEDULED',
  'DUE',
  'PENDING_VERIFICATION',
  'PAID',
  'REJECTED',
  'NOT_APPLICABLE',
] as const;

/**
 * Garde-fou de compilation : si `src/types/index.ts` ou la migration
 * `migrations/0003_core_nucleus_alignment.sql` évolue d'un côté seulement, ce
 * tableau ne compile plus (ou le test de cohérence échoue).
 */
export const CORE_DOMAIN_EXACTNESS = [
  true satisfies ExactDomain<UserRole, typeof USER_ROLE_VALUES>,
  true satisfies ExactDomain<Offer['status'], typeof OFFER_STATUS_VALUES>,
  true satisfies ExactDomain<ApplicationStatus, typeof APPLICATION_STATUS_VALUES>,
  true satisfies ExactDomain<ContractStatus, typeof CONTRACT_STATUS_VALUES>,
  true satisfies ExactDomain<CommissionPaymentStatus, typeof COMMISSION_STATUS_VALUES>,
] as const;

/** Tables du noyau : seules celles créées par les migrations 0001/0002/0003. */
export const CORE_TABLES = ['users', 'external_identities', 'sessions', 'permissions', 'role_permissions', 'user_permissions', 'offers', 'applications', 'contracts'] as const;

export type CoreTable = (typeof CORE_TABLES)[number];

export const DEFAULT_STORE_LIMIT = 50;
export const MAX_STORE_LIMIT = 200;

/** Borne toute lecture : aucune requête non bornée ne doit atteindre la base. */
export function clampStoreLimit(limit: number | undefined, fallback: number = DEFAULT_STORE_LIMIT, max: number = MAX_STORE_LIMIT): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  const truncated = Math.trunc(limit);
  if (truncated <= 0) return fallback;
  return Math.min(truncated, max);
}

export type CoreStoreName = 'offers' | 'applications' | 'contracts' | 'permissions';

export type CoreStoreFailure =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'INVALID_STATUS'
  | 'INVALID_ROW'
  | 'CONSTRAINT';

/** Erreur stable et sans secret, partagée par les adaptateurs mémoire et SQL. */
export class CoreStoreError extends Error {
  constructor(readonly failure: CoreStoreFailure, readonly entity: CoreStoreName, message: string) {
    super(message);
    this.name = 'CoreStoreError';
  }
}

export function assertStatusDomain<Status extends string>(
  value: Status,
  allowed: readonly Status[],
  entity: CoreStoreName,
): void {
  if (!allowed.includes(value)) {
    throw new CoreStoreError('INVALID_STATUS', entity, `Statut « ${value} » hors domaine pour ${entity}.`);
  }
}

/* ------------------------------------------------------------------ */
/* Enregistrements (dérivés du domaine)                               */
/* ------------------------------------------------------------------ */

export type OfferRecord = Pick<Offer,
  | 'id' | 'employerId' | 'title' | 'contractType' | 'remuneration' | 'currency' | 'location'
  | 'departmentId' | 'municipalityId' | 'arrondissementId' | 'localityId' | 'locationLabel'
  | 'domainId' | 'jobId' | 'postedDate' | 'isUrgent' | 'isLeLabeurJob' | 'leLabeurTag'
  | 'skills' | 'summary' | 'responsibilities' | 'conditions' | 'selectionProcess'
  | 'status' | 'startDate' | 'durationMonths'
> & { createdAt: string; updatedAt: string };

export type ApplicationRecord = Pick<Application,
  | 'id' | 'offerId' | 'candidateId' | 'status' | 'appliedDate' | 'note' | 'remuneration' | 'contractId' | 'history'
> & { createdAt: string; updatedAt: string };

export type ContractRecord = Pick<Contract,
  | 'id' | 'offerId' | 'applicationId' | 'employerId' | 'employeeId' | 'status'
  | 'monthlySalary' | 'currency' | 'startDate' | 'endDate' | 'currentMonth' | 'durationMonths'
  | 'periodicity' | 'missionDescription' | 'location' | 'conditions' | 'additionalNotes'
  | 'employerSigned' | 'employeeSigned' | 'employerSignedAt' | 'employeeSignedAt'
  | 'commissionPercentage' | 'commissionAmountDue' | 'commissionStatus'
  | 'monthlyCheckpoints' | 'commissionLedger' | 'paymentSchedule' | 'history'
  | 'replacementId' | 'replacedContractId' | 'incidentId'
> & { createdAt: string; updatedAt: string };

/* ------------------------------------------------------------------ */
/* Ports de stockage                                                  */
/* ------------------------------------------------------------------ */

export interface OfferStore {
  create(record: OfferRecord): Promise<OfferRecord>;
  findById(offerId: string): Promise<OfferRecord | null>;
  listByEmployer(employerId: string, limit?: number): Promise<OfferRecord[]>;
  updateStatus(offerId: string, status: Offer['status'], updatedAt: string): Promise<OfferRecord | null>;
  listPublic(limit?: number, filter?: Partial<FilterState>): Promise<OfferRecord[]>;
}

export interface ApplicationStore {
  create(record: ApplicationRecord): Promise<ApplicationRecord>;
  findById(applicationId: string): Promise<ApplicationRecord | null>;
  listByOffer(offerId: string): Promise<ApplicationRecord[]>;
  listByCandidate(candidateId: string, limit?: number): Promise<ApplicationRecord[]>;
  updateStatus(
    applicationId: string,
    status: ApplicationStatus,
    updatedAt: string,
    contractId?: string | null,
  ): Promise<ApplicationRecord | null>;
}

export interface ContractStore {
  create(record: ContractRecord): Promise<ContractRecord>;
  findById(contractId: string): Promise<ContractRecord | null>;
  listByEmployer(employerId: string, limit?: number): Promise<ContractRecord[]>;
  listByEmployee(employeeId: string, limit?: number): Promise<ContractRecord[]>;
  updateStatus(contractId: string, status: ContractStatus, updatedAt: string): Promise<ContractRecord | null>;
}

export interface PermissionStore {
  listRolePermissions(role: UserRole): Promise<Permission[]>;
  listUserPermissions(userId: string): Promise<Permission[]>;
  /** Union rôle + grants explicites, dédupliquée et triée. */
  listEffectivePermissions(userId: string, role: UserRole): Promise<Permission[]>;
}

export interface CoreStores {
  offers: OfferStore;
  applications: ApplicationStore;
  contracts: ContractStore;
  permissions: PermissionStore;
}
