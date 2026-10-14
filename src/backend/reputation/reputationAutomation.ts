/**
 * LE LABEUR — P0-REPUTATION — processeur de réputation branché sur
 * l'automatisation EXISTANTE.
 *
 * Ce module n'est PAS un moteur : il implémente le contrat
 * `SupplementalAutomationProcessor` DÉJÀ déclaré par
 * `src/backend/automation/worker.ts` et hérite donc, sans une ligne de plus :
 *   - du claim verrouillé de l'Outbox (`FOR UPDATE SKIP LOCKED`) ;
 *   - du compteur de tentatives, du RETRY et du DEAD_LETTER ;
 *   - de l'idempotence durable et du ledger d'audit EXISTANTS.
 *
 * Il OBSERVE deux événements réels (`SALARY_CONFIRMED`, `CLAIM_RESOLVED`) et
 * n'écrit QUE des entrées de réputation et des traces d'audit :
 *   - aucun événement Outbox n'est ajouté (donc AUCUNE notification n'est
 *     déclenchée par un calcul de réputation) ;
 *   - aucune table d'un autre domaine n'est écrite ;
 *   - un fait non résolu (neutralité : auto-résolution système, source absente)
 *     n'échoue jamais : il est TRACÉ puis ignoré.
 *
 * P0-CRON-QUEUE — le processeur porte AUSSI le job planifié
 * `REPUTATION_RECONCILIATION` : il délègue la réconciliation EXISTANTE (cœur
 * partagé `reconciliationCore.ts`) exécutée par le worker d'automatisation
 * EXISTANT, dans la file EXISTANTE. Aucune nouvelle logique de réputation,
 * aucune nouvelle règle : le job n'est qu'une exécution DIFFÉRÉE de la
 * commande déjà ouverte, restée strictement idempotente (rejeu sans doublon).
 */

import type { SupplementalAutomationProcessor } from '../automation/worker';
import type { AutomationJob, AutomationStores, AuditLedgerStore } from '../automation/records';
import type { DomainEventType, PersistedOutboxEvent } from '../automation/foundation';
import type { SqlQueryExecutor, SqlTransaction } from '../services/database';
import { newEntityId } from '../identity/ids';
import { sha256Fingerprint } from '../payments/paymentErrors';
import {
  REPUTATION_AUTOMATION_EVENT_TYPES,
  REPUTATION_RULES_VERSION,
} from '../../domain/reputationRules';
import { buildReputationEntries } from './reputationLedger';
import type { ReputationLedgerStore } from './records';
import { resolveEventFact, type ReputationFactReader } from './reputationFacts';
import {
  reconcileReputationSubject,
  type ReputationReconciliationReport,
} from './reconciliationCore';

export const REPUTATION_AUTOMATION_SOURCE = 'automation:P0-REPUTATION';

/**
 * P0-CRON-QUEUE — job planifié de la réconciliation EXISTANTE.
 *
 * Ce job n'exécute AUCUNE nouvelle logique : il délègue au cœur partagé
 * (`reconciliationCore.ts`) la même réconciliation idempotente que la commande
 * explicite `reconcileMine`/`reconcileAdmin`. La file, le claim verrouillé, le
 * retry, la dead-letter, l'idempotence et l'audit sont ceux EXISTANTS du
 * worker d'automatisation.
 */
export const REPUTATION_RECONCILIATION_JOB_TYPE = 'REPUTATION_RECONCILIATION';
const REPUTATION_RECONCILIATION_COMMAND = 'automation.reputation.reconciliation';

/**
 * P0-CRON-QUEUE — préparation d'une exécution FUTURE de la réconciliation :
 * création IDEMPOTENTE du job dans la file existante (`automation_jobs`) et
 * trace d'audit. Le déclenchement (Cron, drain explicite) appartient au worker.
 */
export async function scheduleReputationReconciliationJob(input: {
  stores: AutomationStores;
  subjectUserId: string;
  dueAt: string;
  idempotencyKey: string;
  createdAt: string;
  reference?: string;
}): Promise<{ kind: 'created' | 'duplicate'; jobId: string }> {
  const jobId = `job_reputation_reconciliation_${input.idempotencyKey.replace(/[^a-z0-9]/gi, '_')}`.slice(0, 120);
  const outcome = await input.stores.jobs.createIfAbsent({
    jobId,
    jobType: REPUTATION_RECONCILIATION_JOB_TYPE,
    aggregateType: 'user',
    aggregateId: input.subjectUserId,
    dueAt: input.dueAt,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt,
    ...(input.reference ? { reference: input.reference } : {}),
  });
  await input.stores.audit.append({
    id: `audit_rev_recon_job_${input.idempotencyKey}`.slice(0, 120),
    actorId: 'SYSTEM',
    timestamp: input.createdAt,
    entityId: input.subjectUserId,
    action: 'REPUTATION_RECONCILIATION_JOB_SCHEDULED',
    source: REPUTATION_AUTOMATION_SOURCE,
    afterState: {
      jobId,
      jobType: REPUTATION_RECONCILIATION_JOB_TYPE,
      dueAt: input.dueAt,
      idempotencyKey: input.idempotencyKey,
      created: outcome.kind === 'created',
      note: 'La réconciliation est le cœur EXISTANT, idempotent : rejeu sans doublon.',
    },
  });
  return { kind: outcome.kind, jobId };
}

/**
 * Types d'événements RÉELLEMENT observés. Liste EXÉCUTABLE : le worker ne route
 * vers ce processeur que les types qu'il déclare, et un test vérifie qu'elle
 * correspond exactement aux sources `MAPPED` produites par l'Outbox.
 */
export const REPUTATION_HANDLED_EVENT_TYPES: readonly DomainEventType[] =
  REPUTATION_AUTOMATION_EVENT_TYPES as readonly DomainEventType[];

export interface ReputationAutomationStores {
  reputation: ReputationLedgerStore;
  audit: AuditLedgerStore;
  /** Lecture seule des sources existantes, dans la même transaction. */
  reader: ReputationFactReader;
}

export interface ReputationAutomationDependencies {
  /**
   * Frontière transactionnelle OBLIGATOIRE : l'entrée de réputation, sa trace
   * d'audit et le fait source commitent ou rollback ensemble. Sans elle, aucun
   * processeur n'est construit (fail-closed).
   */
  runInTransaction: <T>(operation: (stores: ReputationAutomationStores) => Promise<T>) => Promise<T>;
  /**
   * Fabrique de stores liés à une transaction (utilisée par la composition) :
   * OBLIGATOIRE pour le job planifié `REPUTATION_RECONCILIATION` (P0-CRON-
   * QUEUE) — absent, le job échoue explicitement (jamais un accès au pool).
   */
  createStores?: (executor: SqlQueryExecutor) => ReputationAutomationStores;
  now?: () => Date;
}

export interface ReputationEventReport {
  eventId: string;
  eventType: string;
  result: 'created' | 'duplicate' | 'skipped';
  createdEntryIds: string[];
  skipReason?: string;
}

/**
 * Processeur de réputation : le contrat EXISTANT
 * (`SupplementalAutomationProcessor`) augmenté d'un rapport détaillé, utile aux
 * vérifications et aux tests. Le worker n'utilise que le contrat existant.
 */
export interface ReputationAutomation extends SupplementalAutomationProcessor {
  handleEventDetailed(event: PersistedOutboxEvent): Promise<ReputationEventReport>;
}

/** Fabrique de processeur : `handleEvent` uniquement (aucun type de job). */
export function createReputationAutomation(
  dependencies: ReputationAutomationDependencies,
): ReputationAutomation {
  const clock = dependencies.now ?? (() => new Date());
  const run = dependencies.runInTransaction;

  /** Traitement d'un événement, dans UNE transaction avec ses traces d'audit. */
  const handle = async (event: PersistedOutboxEvent): Promise<ReputationEventReport> => {
    const createdAt = clock().toISOString();
    return run(async stores => {
      const resolution = await resolveEventFact(stores.reader, event);

      if (!resolution.resolved) {
        // Neutralité TRACÉE : aucun fait définitif n'est établi, donc aucune
        // entrée — mais la raison est consignée dans le ledger d'audit existant.
        await stores.audit.append({
          id: newEntityId('rev'),
          ...(event.eventId ? { eventId: event.eventId } : {}),
          actorId: 'SYSTEM',
          timestamp: createdAt,
          entityId: event.aggregateId,
          action: 'REPUTATION_FACT_SKIPPED',
          source: REPUTATION_AUTOMATION_SOURCE,
          afterState: {
            eventType: event.eventType,
            reason: resolution.skipReason ?? 'UNKNOWN',
            ruleVersion: REPUTATION_RULES_VERSION,
            entryCreated: false,
          },
        });
        return {
          eventId: event.eventId,
          eventType: event.eventType,
          result: 'skipped' as const,
          createdEntryIds: [],
          ...(resolution.skipReason ? { skipReason: resolution.skipReason } : {}),
        };
      }

      const drafts = buildReputationEntries({
        fact: resolution.resolved.fact,
        subjects: resolution.resolved.subjects,
        provenance: 'EVENT',
        createdAt,
      });

      const createdEntryIds: string[] = [];
      for (const draft of drafts) {
        const outcome = await stores.reputation.appendIfAbsent(draft);
        if (outcome.kind === 'duplicate') continue;
        createdEntryIds.push(outcome.entry.reputationId);
        await stores.audit.append({
          id: newEntityId('rev'),
          ...(event.eventId ? { eventId: event.eventId } : {}),
          actorId: 'SYSTEM',
          timestamp: createdAt,
          entityId: outcome.entry.reputationId,
          action: 'REPUTATION_ENTRY_CREATED',
          source: REPUTATION_AUTOMATION_SOURCE,
          reference: event.eventId,
          beforeState: { entryPresent: false },
          afterState: {
            subjectUserId: outcome.entry.subjectUserId,
            sourceEvent: outcome.entry.sourceEvent,
            sourceEntityType: outcome.entry.sourceEntityType,
            sourceEntityId: outcome.entry.sourceEntityId,
            ruleCode: outcome.entry.ruleCode,
            ruleVersion: outcome.entry.ruleVersion,
            category: outcome.entry.category,
            direction: outcome.entry.direction,
            impact: outcome.entry.impact,
            provenance: outcome.entry.provenance,
            occurredAt: outcome.entry.occurredAt,
          },
        });
      }

      return {
        eventId: event.eventId,
        eventType: event.eventType,
        result: createdEntryIds.length > 0 ? ('created' as const) : ('duplicate' as const),
        createdEntryIds,
      };
    });
  };

  return {
    handledEventTypes: REPUTATION_HANDLED_EVENT_TYPES,
    /**
     * P0-CRON-QUEUE — un SEUL type de job : la réconciliation EXISTANTE,
     * exécutée différée. Aucun autre ordonnancement n'est introduit.
     */
    handledJobTypes: [REPUTATION_RECONCILIATION_JOB_TYPE],

    handleEventDetailed: handle,

    async handleEvent(event) {
      const report = await handle(event);
      // Un fait déjà journalisé n'est PAS un échec : l'événement est traité.
      return report.result === 'duplicate' ? 'duplicate' : 'completed';
    },

    /**
     * P0-CRON-QUEUE — job planifié : exécute la réconciliation EXISTANTE dans
     * la transaction du worker (même claim, mêmes tentatives, même audit).
     * Idempotence DURABLE en tête : un rejeu (reprise après crash, double
     * déclenchement) ne produit JAMAIS de seconde entrée.
     */
    async handleJob(job: AutomationJob, now: Date, stores: AutomationStores, transaction: SqlTransaction) {
      const createReconciliationStores = dependencies.createStores;
      if (!createReconciliationStores) {
        // Fail-closed explicite : jamais un accès au pool ni une écriture non
        // transactionnelle (le job repasse en retry via le worker).
        throw new Error('Réconciliation réputation planifiée : stores transactionnels indisponibles.');
      }
      const at = now.toISOString();
      const reconciliationStores = createReconciliationStores(transaction);
      const reservation = await stores.idempotency.reserve({
        actorId: 'SYSTEM',
        command: REPUTATION_RECONCILIATION_COMMAND,
        key: job.idempotencyKey,
        payloadHash: await sha256Fingerprint(JSON.stringify({
          jobId: job.jobId,
          subjectUserId: job.target.aggregateId,
        })),
      });
      if (reservation.kind === 'conflict') {
        throw new Error('Réconciliation réputation : clé d\'idempotence utilisée avec une charge utile différente.');
      }
      if (reservation.kind === 'in-progress') {
        throw new Error('Réconciliation réputation : exécution concurrente en cours (rejeu du job).');
      }
      if (reservation.kind === 'replay') {
        // Déjà exécutée : aucune seconde écriture, le worker passe le job
        // à COMPLETED.
        return;
      }
      const report: ReputationReconciliationReport = await reconcileReputationSubject(reconciliationStores, {
        subjectUserId: job.target.aggregateId,
        actorId: 'SYSTEM',
        at,
        source: REPUTATION_AUTOMATION_SOURCE,
        reference: job.jobId,
      });
      await stores.idempotency.complete('SYSTEM', REPUTATION_RECONCILIATION_COMMAND, job.idempotencyKey, {
        scanned: report.scanned,
        appended: report.appended,
        duplicates: report.duplicates,
      });
    },
  };
}
