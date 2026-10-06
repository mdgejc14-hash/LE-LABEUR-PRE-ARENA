/**
 * LE LABEUR — P0-AUTO-2 — ports de persistance de l'automatisation.
 *
 * Ce module ne crée AUCUNE connexion et n'importe AUCUN pilote : il décrit les
 * ports au-dessus desquels la fondation P0-AUTO-1 devient réellement exécutable.
 * Les adaptateurs PostgreSQL vivent dans
 * `src/backend/persistence/sqlAutomationStores.ts` (frontière Worker), comme les
 * adaptateurs du noyau vivent dans `sqlCoreStores.ts`.
 *
 * Aucune abstraction nouvelle n'est inventée : les formes manipulées sont celles
 * DÉJÀ déclarées par `src/backend/automation/foundation.ts` (`DomainEvent`,
 * `PersistedOutboxEvent`, `OutboxStatus`, `ScheduledJob`, `JobStatus`,
 * `Deadline`, `DeadlineStatus`, `AuditLedgerEntry`, `IdempotencyStore`).
 */

import type { PostgreSqlDatabase, SqlQueryExecutor } from '../services/database';
import type { ContractRecord } from '../persistence/coreRecords';
import type {
  AuditLedgerEntry,
  Deadline,
  DeadlineStatus,
  DomainEvent,
  DomainEventType,
  IdempotencyResult,
  JobStatus,
  PersistedOutboxEvent,
  ScheduledJob,
} from './foundation';
import type {
  ContractActivationPlan,
  PaymentKind,
  ReminderStage,
  ScheduleDeadlineKind,
} from '../../domain/contractScheduleAutomation';
import type { ContractHistoryEntry } from '../persistence/coreRecords';

/** Exécuteur SQL accepté par les adaptateurs (base racine ou transaction). */
export type AutomationSqlExecutor = SqlQueryExecutor;

/** Fabrique d'adaptateurs liés à une base ou à une transaction. */
export type AutomationSqlFactory = (executor: AutomationSqlExecutor) => AutomationStores;

/* ------------------------------------------------------------------ */
/* Outbox / file                                                        */
/* ------------------------------------------------------------------ */

/**
 * Outbox durable. L'écriture d'un événement DOIT passer par la même transaction
 * que la mutation métier : c'est la garantie « commit → mutation + event,
 * rollback → ni mutation ni event ».
 */
export interface DomainEventOutbox {
  /**
   * Insère un événement. L'identifiant étant la clé primaire, un rejeu du même
   * événement produit `DUPLICATE` et jamais une seconde ligne.
   */
  append(event: DomainEvent): Promise<{ kind: 'appended' } | { kind: 'duplicate'; existing: PersistedOutboxEvent }>;
  findById(eventId: string): Promise<PersistedOutboxEvent | null>;
  /**
   * Claim borné et verrouillé (`FOR UPDATE SKIP LOCKED`) : deux workers
   * concurrents ne traitent jamais le même événement. Seuls les types demandés
   * sont réclamés — un événement sans consumer reste `PENDING`.
   */
  claimDue(input: {
    limit: number;
    eventTypes: readonly DomainEventType[];
    now: string;
  }): Promise<PersistedOutboxEvent[]>;
  markProcessed(eventId: string, processedAt: string): Promise<void>;
  markRetryable(eventId: string, error: string, availableAt: string): Promise<void>;
  markDeadLetter(eventId: string, error: string): Promise<void>;
  listByAggregate(aggregateType: string, aggregateId: string): Promise<PersistedOutboxEvent[]>;
}

/* ------------------------------------------------------------------ */
/* Jobs planifiés (ScheduledJob de la fondation)                        */
/* ------------------------------------------------------------------ */

export interface ScheduledJobDraft {
  jobId: string;
  jobType: string;
  aggregateType: string;
  aggregateId: string;
  dueAt: string;
  idempotencyKey: string;
  createdAt: string;
  /** Identifiant de l'entrée d'échéancier rappelée (`PaymentScheduleEntry.id`). */
  reference?: string;
}

/** `ScheduledJob` de la fondation + la référence métier ajoutée par 0007. */
export interface AutomationJob extends ScheduledJob {
  reference?: string;
}

export interface ScheduledJobStore {
  /**
   * Création idempotente : l'unicité PostgreSQL de `idempotency_key`
   * (migration 0007) fait qu'un second appel concurrent renvoie `duplicate`
   * au lieu d'insérer une seconde ligne.
   */
  createIfAbsent(draft: ScheduledJobDraft): Promise<{ kind: 'created'; job: AutomationJob } | { kind: 'duplicate'; job: AutomationJob }>;
  findById(jobId: string): Promise<AutomationJob | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<AutomationJob | null>;
  /** Claim borné et verrouillé des jobs échus (`FOR UPDATE SKIP LOCKED`). */
  claimDue(input: { limit: number; jobTypes?: readonly string[]; now: string }): Promise<AutomationJob[]>;
  /**
   * Compare-and-set de statut : un job déjà `COMPLETED` ne peut jamais repasser
   * `RUNNING`, donc jamais être exécuté deux fois.
   */
  compareAndSetStatus(
    jobId: string,
    expected: readonly JobStatus[],
    patch: { status: JobStatus; at: string; error?: string; availableAt?: string },
  ): Promise<AutomationJob | null>;
  listByAggregate(aggregateType: string, aggregateId: string): Promise<AutomationJob[]>;
}

/* ------------------------------------------------------------------ */
/* Deadlines / SLA                                                      */
/* ------------------------------------------------------------------ */

export type AutomationDeadlineKind = ScheduleDeadlineKind | 'CLAIM_EVIDENCE';

export interface DeadlineDraft {
  id: string;
  aggregateType: string;
  aggregateId: string;
  kind: AutomationDeadlineKind;
  dueAt: string;
  sla: string;
  /** No grace period is invented for a claim deadline. */
  gracePeriodMs?: number;
  escalation: string;
  reference: string;
  idempotencyKey: string;
  sourceEventId?: string;
  createdAt: string;
}

export interface AutomationDeadline extends Deadline {
  kind: AutomationDeadlineKind;
  reference?: string;
  idempotencyKey: string;
  sourceEventId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface DeadlineStore {
  /** Création idempotente (unicité PostgreSQL de `idempotency_key`). */
  createIfAbsent(draft: DeadlineDraft): Promise<{ kind: 'created'; deadline: AutomationDeadline } | { kind: 'duplicate'; deadline: AutomationDeadline }>;
  findById(deadlineId: string): Promise<AutomationDeadline | null>;
  /** Compare-and-set de statut : une échéance déjà `ESCALATED` ne recule jamais. */
  compareAndSetStatus(
    deadlineId: string,
    expected: readonly DeadlineStatus[],
    patch: { status: DeadlineStatus; at: string },
  ): Promise<AutomationDeadline | null>;
  listByAggregate(aggregateType: string, aggregateId: string): Promise<AutomationDeadline[]>;
  listDue(input: { limit: number; now: string }): Promise<AutomationDeadline[]>;
}

/* ------------------------------------------------------------------ */
/* Ledger d'audit                                                       */
/* ------------------------------------------------------------------ */

export interface AuditLedgerStore {
  append(entry: AuditLedgerEntry): Promise<AuditLedgerEntry>;
  listByEntity(entityId: string, limit?: number): Promise<AuditLedgerEntry[]>;
}

/* ------------------------------------------------------------------ */
/* Idempotence durable (interface `IdempotencyStore` de la fondation)    */
/* ------------------------------------------------------------------ */

export interface DurableIdempotencyStore {
  reserve(input: {
    actorId: string;
    command: string;
    key: string;
    payloadHash: string;
  }): Promise<IdempotencyResult<unknown>>;
  complete(actorId: string, command: string, key: string, result: unknown): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Écriture de l'échéancier sur le contrat                              */
/* ------------------------------------------------------------------ */

/**
 * Écriture de l'échéancier salarial et de commission sur la ligne contrat.
 *
 * Portée volontairement hors de `ContractStore` (P0-A/P0-F) : elle n'appartient
 * qu'à l'automatisation et ne doit pas élargir le cycle restreint du contrat.
 *
 * L'écriture est un compare-and-set doublement gardé :
 *   `WHERE id = $1 AND status = 'ACTIVE' AND jsonb_array_length(payment_schedule) = 0`
 * Un contrat déjà doté d'un échéancier ne peut donc JAMAIS en recevoir un second,
 * même sous deux workers concurrents — c'est la contrainte PostgreSQL qui porte
 * la garantie « aucun double schedule », pas un verrou applicatif ajouté.
 */
export interface ContractScheduleWriter {
  applyActivationPlan(
    contractId: string,
    plan: Extract<ContractActivationPlan, { kind: 'SCHEDULED' }>,
    input: { historyEntry: ContractHistoryEntry; updatedAt: string },
  ): Promise<ContractRecord | null>;
  /**
   * Contrat dont la périodicité n'a aucune règle de cadence : aucun échéancier
   * n'est écrit, seule une entrée d'historique explicite est ajoutée. Gardé par
   * `status = 'ACTIVE'` et par l'absence d'échéancier, donc rejouable sans effet
   * supplémentaire.
   */
  recordMissingScheduleRule(
    contractId: string,
    input: { historyEntry: ContractHistoryEntry; updatedAt: string; periodicity: string },
  ): Promise<ContractRecord | null>;
  findByIdForUpdate(contractId: string): Promise<ContractRecord | null>;
}

/* ------------------------------------------------------------------ */
/* Jeu complet                                                          */
/* ------------------------------------------------------------------ */

import type { PaymentStores } from '../persistence/paymentRecords';

export interface AutomationStores {
  outbox: DomainEventOutbox;
  jobs: ScheduledJobStore;
  deadlines: DeadlineStore;
  audit: AuditLedgerStore;
  idempotency: DurableIdempotencyStore;
  contractSchedules: ContractScheduleWriter;
  /**
   * P0-PAY-1 — stores du cycle paiement, fournis UNIQUEMENT lorsque le runtime
   * dispose d'une base durable. Absents, l'automatisation conserve exactement le
   * comportement P0-AUTO-2 : aucune ligne de paiement materialisée, aucun rappel
   * pré-échéance armé. Aucun second mécanisme : mêmes tables de transaction,
   * même Outbox, même ledger d'audit, même idempotence durable.
   */
  payments?: PaymentStores;
}

export interface AutomationStoreDependencies {
  database: PostgreSqlDatabase;
}

/** Rappel d'un job : nature de paiement et étape (échéance ou J+3). */
export interface ReminderJobTarget {
  paymentKind: PaymentKind;
  stage: ReminderStage;
}
