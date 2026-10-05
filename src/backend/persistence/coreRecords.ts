/**
 * LE LABEUR — P0-A — contrats de persistance du noyau relationnel.
 *
 * Périmètre strict : utilisateurs, identités externes, sessions, permissions,
 * offres, candidatures, contrats (P0-A) et propositions d'embauche (P0-E5).
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
  MissionProposal,
  Offer,
  ProposalStatus,
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
 * P0-E5 — statuts réellement déclarés par `ProposalStatus` : le vocabulaire
 * fonctionnel du plan (SENT/ACCEPTED/REJECTED/EXPIRED) n'est jamais substitué
 * aux noms du code (SENT/ACCEPTED/DECLINED/EXPIRED).
 */
export const PROPOSAL_STATUS_VALUES = [
  'DRAFT',
  'SENT',
  'REVISION_REQUESTED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
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
  true satisfies ExactDomain<ProposalStatus, typeof PROPOSAL_STATUS_VALUES>,
] as const;

/** Tables du noyau : migrations 0001/0002/0003 et `proposals` (P0-E5, migration 0004). */
export const CORE_TABLES = ['users', 'external_identities', 'sessions', 'permissions', 'role_permissions', 'user_permissions', 'offers', 'applications', 'contracts', 'proposals'] as const;

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

export type CoreStoreName = 'offers' | 'applications' | 'contracts' | 'proposals' | 'permissions';

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

/**
 * P0-E5 — enregistrement d'une PROPOSITION d'embauche.
 *
 * Dérivé de `MissionProposal` : `employerName` et `employeeName` sont OMIS
 * volontairement — comme `ApplicationRecord` omet les libellés de l'offre et du
 * candidat, les noms affichés sont résolus depuis `users` à la projection, jamais
 * dupliqués en base. Aucun champ d'échéance n'est ajouté : le modèle réel n'en
 * possède aucun (voir `PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS`).
 */
export type ProposalRecord = Pick<MissionProposal,
  | 'id' | 'conversationId' | 'contractId' | 'offerId' | 'applicationId'
  | 'employerId' | 'employeeId'
  | 'missionTitle' | 'amount' | 'currency' | 'periodicity' | 'startDate' | 'endDate'
  | 'durationMonths' | 'location' | 'conditions' | 'status' | 'revisionNotes'
  | 'sentAt' | 'updatedAt'
> & { createdAt: string };

/** Transition atomique d'une proposition (P0-E5) : statut cible + horodatage. */
export interface ProposalTransitionPatch {
  status: ProposalStatus;
  updatedAt: string;
  /** Renseigné uniquement par une future révision (`REVISE`, hors périmètre P0-E5). */
  revisionNotes?: string;
}

/** Transition atomique d'un contrat (P0-F) : statut cible + horodatage + historique AJOUTÉ. */
export interface ContractTransitionPatch {
  status: ContractStatus;
  updatedAt: string;
  /** Entrée AJOUTÉE au tableau `history` côté SQL (`history || jsonb`), jamais réécrite. */
  historyEntry: ContractHistoryEntry;
  /**
   * P0-F — `SEND` porte la signature de l'employeur dans le modèle réel :
   * le compare-and-set pose alors le drapeau et l'horodatage de cette partie
   * **dans la même écriture** que le changement de statut. Absent pour les
   * autres transitions (aucune signature implicite).
   */
  signatureParty?: 'EMPLOYER' | 'EMPLOYEE';
}

/** Signature d'une partie (P0-F) : drapeau + horodatage + historique AJOUTÉ. */
export interface ContractSignaturePatch {
  signedAt: string;
  historyEntry: ContractHistoryEntry;
}

export interface ProposalStore {
  create(record: ProposalRecord): Promise<ProposalRecord>;
  findById(proposalId: string): Promise<ProposalRecord | null>;
  /**
   * P0-E5 — verrou pessimiste de la ligne proposition (`SELECT … FOR UPDATE`).
   * Sérialise deux réponses ou expirations concurrentes; l'adaptateur mémoire
   * rend simplement la ligne courante (processus unique, sans verrou).
   */
  findByIdForUpdate(proposalId: string): Promise<ProposalRecord | null>;
  /**
   * P0-E5 — transition conditionnelle (compare-and-set).
   * Retourne `null` si la ligne n'existe pas ou si son statut n'est plus
   * `expectedStatus` : une transition concurrente a gagné, l'appelant relit puis
   * refuse ou rejoue de façon idempotente.
   */
  compareAndSetStatus(
    proposalId: string,
    expectedStatus: ProposalStatus,
    patch: ProposalTransitionPatch,
  ): Promise<ProposalRecord | null>;
  /** Lecture ADMIN (route existante `admin.proposals.list`), keyset par (sentAt, id). */
  listAll(limit?: number, afterId?: string | null): Promise<ProposalRecord[]>;
  /**
   * P0-F — lie la proposition acceptée à son contrat (`proposals.contract_id`).
   * Retourne `null` si la ligne n'existe pas ou si elle est déjà liée : une
   * création concurrente a gagné, l'appelant relit et refuse (409).
   */
  attachContract(proposalId: string, contractId: string, updatedAt: string): Promise<ProposalRecord | null>;
}

export type ContractRecord = Pick<Contract,
  | 'id' | 'proposalId' | 'offerId' | 'applicationId' | 'employerId' | 'employeeId' | 'status'
  | 'monthlySalary' | 'currency' | 'startDate' | 'endDate' | 'currentMonth' | 'durationMonths'
  | 'periodicity' | 'missionDescription' | 'location' | 'conditions' | 'additionalNotes'
  | 'employerSigned' | 'employeeSigned' | 'employerSignedAt' | 'employeeSignedAt'
  | 'commissionPercentage' | 'commissionAmountDue' | 'commissionStatus'
  | 'monthlyCheckpoints' | 'commissionLedger' | 'paymentSchedule' | 'history'
  | 'replacementId' | 'replacedContractId' | 'incidentId'
> & { createdAt: string; updatedAt: string };

/** Entrée d'historique d'un contrat (même forme que `Contract['history']`). */
export type ContractHistoryEntry = Contract['history'][number];

/* ------------------------------------------------------------------ */
/* Ports de stockage                                                  */
/* ------------------------------------------------------------------ */

export interface OfferStore {
  create(record: OfferRecord): Promise<OfferRecord>;
  findById(offerId: string): Promise<OfferRecord | null>;
  /** Locks the offer against status updates when called through a PostgreSQL transaction. */
  findByIdForShare(offerId: string): Promise<OfferRecord | null>;
  listByEmployer(employerId: string, limit?: number): Promise<OfferRecord[]>;
  updateStatus(offerId: string, status: Offer['status'], updatedAt: string): Promise<OfferRecord | null>;
  listPublic(limit?: number, filter?: Partial<FilterState>): Promise<OfferRecord[]>;
}

/** Entrée d'historique d'une candidature (même forme que `Application['history']`). */
export type ApplicationHistoryEntry = Application['history'][number];

/**
 * P0-E4 — décision atomique sur une candidature.
 * `historyEntry` est AJOUTÉ au tableau `history` côté SQL (`history || jsonb`),
 * jamais réécrit depuis une valeur lue : deux décisions concurrentes ne peuvent
 * pas se perdre une entrée d'historique.
 */
export interface ApplicationTransitionPatch {
  status: ApplicationStatus;
  updatedAt: string;
  historyEntry: ApplicationHistoryEntry;
  /** Motif de rejet (P0-E4) : renseigné uniquement par `REJECT`. */
  note?: string;
}

export interface ApplicationStore {
  create(record: ApplicationRecord): Promise<ApplicationRecord>;
  findById(applicationId: string): Promise<ApplicationRecord | null>;
  /**
   * P0-E4 — verrou pessimiste de la ligne candidature (`SELECT … FOR UPDATE`).
   * Sérialise deux décisions concurrentes sur la même candidature; l'adaptateur
   * mémoire rend simplement la ligne courante (processus unique, sans verrou).
   */
  findByIdForUpdate(applicationId: string): Promise<ApplicationRecord | null>;
  /**
   * P0-E4 — transition conditionnelle (compare-and-set).
   * Retourne `null` si la ligne n'existe pas ou si son statut n'est plus
   * `expectedStatus` : une décision concurrente a gagné, l'appelant relit puis
   * refuse ou rejoue de façon idempotente.
   */
  compareAndSetStatus(
    applicationId: string,
    expectedStatus: ApplicationStatus,
    patch: ApplicationTransitionPatch,
  ): Promise<ApplicationRecord | null>;
  findByOfferAndCandidate(offerId: string, candidateId: string): Promise<ApplicationRecord | null>;
  /** Keyset-paged by (appliedDate, id), oldest first; cursor is an application ID. */
  listByOffer(offerId: string, limit?: number, afterId?: string | null): Promise<ApplicationRecord[]>;
  listByCandidate(candidateId: string, limit?: number): Promise<ApplicationRecord[]>;
  updateStatus(
    applicationId: string,
    status: ApplicationStatus,
    updatedAt: string,
    contractId?: string | null,
  ): Promise<ApplicationRecord | null>;
  /**
   * P0-F — lie la candidature à son contrat (`applications.contract_id`), sans
   * changer son statut (HIRED / CONTRACTED restent l'étape d'automatisation
   * post-contrat). Retourne `null` si la candidature est déjà liée à un contrat.
   */
  attachContract(applicationId: string, contractId: string, updatedAt: string): Promise<ApplicationRecord | null>;
}

export interface ContractStore {
  create(record: ContractRecord): Promise<ContractRecord>;
  findById(contractId: string): Promise<ContractRecord | null>;
  /**
   * P0-F — verrou pessimiste de la ligne contrat (`SELECT … FOR UPDATE`).
   * Sérialise deux transitions concurrentes ; l'adaptateur mémoire rend
   * simplement la ligne courante (processus unique, sans verrou).
   */
  findByIdForUpdate(contractId: string): Promise<ContractRecord | null>;
  listByEmployer(employerId: string, limit?: number): Promise<ContractRecord[]>;
  listByEmployee(employeeId: string, limit?: number): Promise<ContractRecord[]>;
  /** Transition conditionnelle (compare-and-set) : `null` si le statut a changé. */
  compareAndSetStatus(
    contractId: string,
    expectedStatus: ContractStatus,
    patch: ContractTransitionPatch,
  ): Promise<ContractRecord | null>;
  /**
   * P0-F — signature d'une partie : `UPDATE … WHERE id = $1 AND status = 'SIGNATURE'
   * AND <party>_signed = false`, donc jamais deux fois la même signature et jamais
   * après activation/clôture. Retourne `null` si la garde a échoué.
   */
  sign(
    contractId: string,
    party: 'EMPLOYER' | 'EMPLOYEE',
    patch: ContractSignaturePatch,
  ): Promise<ContractRecord | null>;
  /** Lecture ADMIN (route existante `admin.contracts.list`), keyset par (updatedAt, id). */
  listAll(limit?: number, afterId?: string | null): Promise<ContractRecord[]>;
  /**
   * Transition de statut simple (port existant, conservé) — les transitions
   * P0-F passent par `compareAndSetStatus` / `sign`, qui ajoutent l'historique.
   */
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
  proposals: ProposalStore;
  permissions: PermissionStore;
}
