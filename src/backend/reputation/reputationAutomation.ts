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
 */

import type { SupplementalAutomationProcessor } from '../automation/worker';
import type { AuditLedgerStore } from '../automation/records';
import type { DomainEventType, PersistedOutboxEvent } from '../automation/foundation';
import type { SqlQueryExecutor } from '../services/database';
import { newEntityId } from '../identity/ids';
import {
  REPUTATION_AUTOMATION_EVENT_TYPES,
  REPUTATION_RULES_VERSION,
} from '../../domain/reputationRules';
import { buildReputationEntries } from './reputationLedger';
import type { ReputationLedgerStore } from './records';
import { resolveEventFact, type ReputationFactReader } from './reputationFacts';

export const REPUTATION_AUTOMATION_SOURCE = 'automation:P0-REPUTATION';

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
  /** Fabrique de stores liés à une transaction (utilisée par la composition). */
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
    /** Aucun type de job : la réputation n'introduit aucun ordonnancement. */
    handledJobTypes: [],

    handleEventDetailed: handle,

    async handleEvent(event) {
      const report = await handle(event);
      // Un fait déjà journalisé n'est PAS un échec : l'événement est traité.
      return report.result === 'duplicate' ? 'duplicate' : 'completed';
    },

    async handleJob() {
      // Inatteignable : `handledJobTypes` est vide.
      throw new Error('La réputation ne traite aucun job planifié.');
    },
  };
}
