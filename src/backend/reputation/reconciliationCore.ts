/**
 * LE LABEUR — P0-REPUTATION — CŒUR de réconciliation, partagé.
 *
 * P0-CRON-QUEUE : ce module EXTRAIT la réconciliation EXISTANTE de
 * `reputationRepository.ts` (aucune règle modifiée, aucun fait réinterprété)
 * afin qu'elle puisse être exécutée de DEUX fronts, sans aucune logique
 * dupliquée :
 *   1. la commande explicite EXISTANTE (`reconcileMine` / `reconcileAdmin`) ;
 *   2. un job planifié `REPUTATION_RECONCILIATION` dans la file EXISTANTE
 *      (`automation_jobs`), traité par le worker d'automatisation EXISTANT —
 *      c'est le « préparateur d'exécution future » exigé par P0-CRON-QUEUE.
 *
 * Garanties inchangées : idempotente par construction (même clé de
 * déduplication dans `reputation_entries`) : une seconde exécution n'ajoute
 * aucune ligne ; n'écrit QUE des entrées du sujet demandé et des traces
 * d'audit ; AUCUN événement Outbox (donc aucune notification) ; aucun accès
 * réseau.
 */

import type { AuditLedgerStore } from '../automation/records';
import { newEntityId } from '../identity/ids';
import {
  REPUTATION_RULES_VERSION,
  assertNoProtectedAttributeFields,
} from '../../domain/reputationRules';
import { buildReputationEntries } from './reputationLedger';
import { listDocumentedFactsForSubject, type ReputationFactReader } from './reputationFacts';
import type { ReputationLedgerStore } from './records';

export interface ReputationReconciliationReport {
  subjectUserId: string;
  scanned: number;
  appended: number;
  duplicates: number;
  rulesVersion: string;
  reconciledAt: string;
  /** Aucune donnée sensible n'est collectée : rappel explicite de la finalité. */
  purpose: string;
}

/** Stores LIÉS À LA TRANSACTION en cours (jamais au pool). */
export interface ReputationReconciliationStores {
  reputation: ReputationLedgerStore;
  /** Lecture seule des sources existantes (contrats, litiges, salaires confirmés). */
  reader: ReputationFactReader;
  /** Ledger d'audit EXISTANT (`automation_audit_ledger`). */
  audit: AuditLedgerStore;
}

export interface ReputationReconciliationInput {
  subjectUserId: string;
  /** `SYSTEM` pour l'exécution planifiée ; l'ID d'acteur pour la commande. */
  actorId: string;
  at: string;
  /** Source d'audit : `api:P0-REPUTATION` ou `automation:P0-REPUTATION`. */
  source: string;
  /** Référence d'audit : clé d'idempotence de la commande ou identifiant du job. */
  reference?: string;
}

/**
 * Réconciliation : applique les faits DÉJÀ PERSISTÉS du sujet. Idempotente par
 * construction (même clé de déduplication) : une seconde exécution n'ajoute
 * aucune ligne. Elle n'ÉCRIT QUE des entrées du sujet demandé et des traces
 * d'audit ; jamais une donnée métier d'un autre domaine.
 */
export async function reconcileReputationSubject(
  stores: ReputationReconciliationStores,
  input: ReputationReconciliationInput,
): Promise<ReputationReconciliationReport> {
  const { facts, scanned } = await listDocumentedFactsForSubject(stores.reader, input.subjectUserId);
  let appended = 0;
  let duplicates = 0;

  for (const resolved of facts) {
    const drafts = buildReputationEntries({
      fact: resolved.fact,
      subjects: resolved.subjects,
      provenance: 'RECONCILIATION',
      createdAt: input.at,
      // La réconciliation d'un utilisateur n'écrit JAMAIS dans le ledger d'un autre.
      onlySubjectUserId: input.subjectUserId,
    });
    for (const draft of drafts) {
      assertNoProtectedAttributeFields(draft as unknown as Record<string, unknown>);
      const outcome = await stores.reputation.appendIfAbsent(draft);
      if (outcome.kind === 'duplicate') {
        duplicates += 1;
        continue;
      }
      appended += 1;
      await stores.audit.append({
        id: newEntityId('rev'),
        actorId: input.actorId,
        timestamp: input.at,
        entityId: outcome.entry.reputationId,
        action: 'REPUTATION_ENTRY_CREATED',
        source: input.source,
        ...(input.reference ? { reference: input.reference } : {}),
        beforeState: { entryPresent: false },
        afterState: {
          subjectUserId: outcome.entry.subjectUserId,
          sourceEvent: outcome.entry.sourceEvent,
          sourceEntityType: outcome.entry.sourceEntityType,
          sourceEntityId: outcome.entry.sourceEntityId,
          ruleCode: outcome.entry.ruleCode,
          ruleVersion: outcome.entry.ruleVersion,
          impact: outcome.entry.impact,
          direction: outcome.entry.direction,
          provenance: outcome.entry.provenance,
          occurredAt: outcome.entry.occurredAt,
        },
      });
    }
  }

  await stores.audit.append({
    id: newEntityId('rev'),
    actorId: input.actorId,
    timestamp: input.at,
    entityId: input.subjectUserId,
    action: 'REPUTATION_RECONCILED',
    source: input.source,
    ...(input.reference ? { reference: input.reference } : {}),
    afterState: { scanned, appended, duplicates, rulesVersion: REPUTATION_RULES_VERSION },
  });

  return {
    subjectUserId: input.subjectUserId,
    scanned,
    appended,
    duplicates,
    rulesVersion: REPUTATION_RULES_VERSION,
    reconciledAt: input.at,
    purpose: 'Finalité : documenter une fiabilité de coopération à partir de faits déjà persistés (minimisation, aucun attribut protégé).',
  };
}
