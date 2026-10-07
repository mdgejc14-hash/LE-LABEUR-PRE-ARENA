/**
 * LE LABEUR — P0-REPUTATION — enregistrements et PORT de persistance du ledger.
 *
 * Aucun adaptateur, aucune connexion, aucun pilote : ce module décrit l'entrée de
 * réputation — sujet, fait source, entité source, règle/version, impact,
 * explication, acteur, date, statut, historique APPEND-ONLY — et le port
 * au-dessus duquel le dépôt PostgreSQL (`sqlReputationStores.ts`) et le dépôt
 * mémoire de test se branchent.
 *
 * Le LEDGER est la source de vérité. Aucun score n'est stocké ici : le score est
 * une vue dérivée (`reputationLedger.ts`).
 */

import type {
  ReputationCategory,
  ReputationDirection,
  ReputationProvenance,
  ReputationSourceEntityType,
  ReputationStatus,
} from '../../domain/reputationRules';

/** Entrée du journal APPEND-ONLY des corrections administratives. */
export interface ReputationHistoryEntry {
  at: string;
  actorId: string;
  action: 'REVERSED' | 'RESTORED';
  reason: string;
  fromStatus: ReputationStatus;
  toStatus: ReputationStatus;
}

/** Entrée de réputation persistée. */
export interface ReputationEntryRecord {
  reputationId: string;
  subjectUserId: string;
  /** Nom RÉEL du fait/événement source (dépôt). */
  sourceEvent: string;
  /** Identifiant de la preuve source (événement Outbox, entrée d'historique). */
  sourceEventId?: string;
  sourceEntityType: ReputationSourceEntityType;
  sourceEntityId: string;
  ruleCode: string;
  ruleVersion: string;
  category: ReputationCategory;
  direction: ReputationDirection;
  impact: number;
  explanation: string;
  actorId: string;
  provenance: ReputationProvenance;
  /** Date du FAIT documenté, jamais celle de l'écriture. */
  occurredAt: string;
  createdAt: string;
  status: ReputationStatus;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
  history: ReputationHistoryEntry[];
  /** Clé d'unicité : un fait logique produit une seule entrée. */
  dedupeKey: string;
}

/** Brouillon d'entrée : le statut initial est toujours `ACTIVE`, sans correction. */
export type ReputationEntryDraft = Omit<
  ReputationEntryRecord,
  'status' | 'reversedAt' | 'reversedBy' | 'reversalReason' | 'history'
>;

export interface ReputationEntryQuery {
  limit: number;
  /** Curseur keyset : identifiant de la dernière entrée lue. */
  afterId?: string | null;
  /** Filtre de période sur la DATE DU FAIT (facultatif). */
  from?: string;
  to?: string;
  statuses?: readonly ReputationStatus[];
  provenance?: ReputationProvenance;
}

export interface ReputationAdminQuery extends ReputationEntryQuery {
  subjectUserId?: string;
  sourceEntityType?: ReputationSourceEntityType;
  sourceEntityId?: string;
}

export interface ReputationLedgerStore {
  /**
   * Insertion idempotente : l'unicité PostgreSQL de `dedupe_key` fait qu'un
   * second appel — même concurrent — renvoie `duplicate` sans seconde ligne.
   */
  appendIfAbsent(
    draft: ReputationEntryDraft,
  ): Promise<{ kind: 'created'; entry: ReputationEntryRecord } | { kind: 'duplicate'; entry: ReputationEntryRecord }>;
  findById(reputationId: string): Promise<ReputationEntryRecord | null>;
  findByIdForUpdate(reputationId: string): Promise<ReputationEntryRecord | null>;
  listForSubject(subjectUserId: string, query: ReputationEntryQuery): Promise<ReputationEntryRecord[]>;
  listAll(query: ReputationAdminQuery): Promise<ReputationEntryRecord[]>;
  /**
   * Bascule de statut conditionnelle (ACTIVE → REVERSED, REVERSED → ACTIVE) :
   * `null` si le statut courant n'est plus celui attendu (correction concurrente).
   * L'historique est AJOUTÉ côté SQL (`history || jsonb`), jamais réécrit.
   */
  compareAndSetStatus(input: {
    reputationId: string;
    expected: readonly ReputationStatus[];
    status: ReputationStatus;
    at: string;
    actorId: string;
    reason: string;
    action: ReputationHistoryEntry['action'];
  }): Promise<ReputationEntryRecord | null>;
  countForSubject(subjectUserId: string, statuses?: readonly ReputationStatus[]): Promise<number>;
}
