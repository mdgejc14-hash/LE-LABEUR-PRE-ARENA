/**
 * LE LABEUR — P0-REPUTATION — adaptateur PostgreSQL du ledger de réputation.
 *
 * Deux responsabilités, séparées :
 *  1. `createSqlReputationStore` : la table `reputation_entries` (migration 0015)
 *     uniquement. Insertion idempotente, lectures keyset bornées, bascule de
 *     statut conditionnelle et APPEND-ONLY de l'historique.
 *  2. `createSqlReputationFactReader` : la LECTURE des sources EXISTANTES
 *     (contrats, litiges, paiements, confirmations salariales). Aucune donnée
 *     métier n'est recréée, aucune table existante n'est écrite.
 */

import type { ClaimStore } from '../disputes/records';
import { createSqlClaimStore } from './sqlClaimStores';
import type { ContractStore } from './coreRecords';
import { createSqlContractStore } from './sqlCoreStores';
import type { PaymentStore } from './paymentRecords';
import { createSqlPaymentStores } from './sqlPaymentStores';
import type { SqlQueryExecutor } from '../services/database';
import type {
  ReputationCategory,
  ReputationDirection,
  ReputationProvenance,
  ReputationSourceEntityType,
  ReputationStatus,
} from '../../domain/reputationRules';
import type {
  ReputationAdminQuery,
  ReputationEntryDraft,
  ReputationEntryQuery,
  ReputationEntryRecord,
  ReputationHistoryEntry,
  ReputationLedgerStore,
} from '../reputation/records';
import type { ConfirmedSalaryFact, ReputationFactReader } from '../reputation/reputationFacts';
import { MAX_REPUTATION_FACTS_PER_SUBJECT } from '../reputation/reputationFacts';
import { clampStoreLimit } from './coreRecords';

interface ReputationRow {
  reputation_id: string;
  subject_user_id: string;
  source_event: string;
  source_event_id: string | null;
  source_entity_type: string;
  source_entity_id: string;
  rule_code: string;
  rule_version: string;
  category: string;
  direction: string;
  impact: number;
  explanation: string;
  actor_id: string;
  provenance: string;
  occurred_at: string | Date;
  created_at: string | Date;
  status: string;
  reversed_at: string | Date | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  history: ReputationHistoryEntry[] | null;
  dedupe_key: string;
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRecord(row: ReputationRow): ReputationEntryRecord {
  return {
    reputationId: row.reputation_id,
    subjectUserId: row.subject_user_id,
    sourceEvent: row.source_event,
    ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    sourceEntityType: row.source_entity_type as ReputationSourceEntityType,
    sourceEntityId: row.source_entity_id,
    ruleCode: row.rule_code,
    ruleVersion: row.rule_version,
    category: row.category as ReputationCategory,
    direction: row.direction as ReputationDirection,
    impact: Number(row.impact),
    explanation: row.explanation,
    actorId: row.actor_id,
    provenance: row.provenance as ReputationProvenance,
    occurredAt: timestamp(row.occurred_at),
    createdAt: timestamp(row.created_at),
    status: row.status as ReputationStatus,
    ...(row.reversed_at ? { reversedAt: timestamp(row.reversed_at) } : {}),
    ...(row.reversed_by ? { reversedBy: row.reversed_by } : {}),
    ...(row.reversal_reason ? { reversalReason: row.reversal_reason } : {}),
    history: Array.isArray(row.history) ? row.history : [],
    dedupeKey: row.dedupe_key,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

/** Filtres communs (statut, provenance, période sur la date du FAIT). */
function filters(
  query: ReputationEntryQuery,
  startIndex: number,
): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let index = startIndex;
  if (query.statuses && query.statuses.length > 0) {
    clauses.push(`AND status = ANY($${index}::text[])`);
    values.push([...query.statuses]);
    index += 1;
  }
  if (query.provenance) {
    clauses.push(`AND provenance = $${index}`);
    values.push(query.provenance);
    index += 1;
  }
  if (query.from) {
    clauses.push(`AND occurred_at >= $${index}`);
    values.push(query.from);
    index += 1;
  }
  if (query.to) {
    clauses.push(`AND occurred_at <= $${index}`);
    values.push(query.to);
    index += 1;
  }
  return { sql: clauses.join(' '), values };
}

/** Curseur keyset (occurred_at DESC, reputation_id ASC) partagé par les lectures. */
async function keysetClause(
  db: SqlQueryExecutor,
  afterId: string | null | undefined,
  index: number,
): Promise<{ sql: string; values: unknown[] }> {
  if (!afterId) return { sql: '', values: [] };
  const cursor = await db.query<{ occurred_at: string | Date }>(
    'SELECT occurred_at FROM reputation_entries WHERE reputation_id = $1',
    [afterId],
  );
  const row = cursor.rows[0];
  if (!row) return { sql: '', values: [] };
  return {
    sql: `AND (occurred_at < $${index} OR (occurred_at = $${index} AND reputation_id > $${index + 1}))`,
    values: [timestamp(row.occurred_at), afterId],
  };
}

export function createSqlReputationStore(db: SqlQueryExecutor): ReputationLedgerStore {
  const findById = async (reputationId: string, lock: boolean): Promise<ReputationEntryRecord | null> => {
    const result = await db.query<ReputationRow>(
      `SELECT * FROM reputation_entries WHERE reputation_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [reputationId],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  };

  return {
    async appendIfAbsent(draft: ReputationEntryDraft) {
      try {
        const inserted = await db.query<ReputationRow>(
          `INSERT INTO reputation_entries (
             reputation_id, subject_user_id, source_event, source_event_id,
             source_entity_type, source_entity_id, rule_code, rule_version,
             category, direction, impact, explanation, actor_id, provenance,
             occurred_at, created_at, status, history, dedupe_key
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'ACTIVE','[]'::jsonb,$17)
           ON CONFLICT (dedupe_key) DO NOTHING
           RETURNING *`,
          [
            draft.reputationId,
            draft.subjectUserId,
            draft.sourceEvent,
            draft.sourceEventId ?? null,
            draft.sourceEntityType,
            draft.sourceEntityId,
            draft.ruleCode,
            draft.ruleVersion,
            draft.category,
            draft.direction,
            draft.impact,
            draft.explanation,
            draft.actorId,
            draft.provenance,
            draft.occurredAt,
            draft.createdAt,
            draft.dedupeKey,
          ],
        );
        if (inserted.rows[0]) return { kind: 'created' as const, entry: toRecord(inserted.rows[0]) };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Rejeu CONCURRENT du même fait : même clé primaire, même fait logique.
      }
      const existing = await db.query<ReputationRow>(
        'SELECT * FROM reputation_entries WHERE dedupe_key = $1',
        [draft.dedupeKey],
      );
      const row = existing.rows[0];
      if (!row) throw new Error('Entrée de réputation introuvable après collision d’unicité.');
      return { kind: 'duplicate' as const, entry: toRecord(row) };
    },

    findById(reputationId) {
      return findById(reputationId, false);
    },

    findByIdForUpdate(reputationId) {
      return findById(reputationId, true);
    },

    async listForSubject(subjectUserId, query: ReputationEntryQuery) {
      const limit = clampStoreLimit(query.limit, 50, MAX_REPUTATION_FACTS_PER_SUBJECT);
      const extra = filters(query, 2);
      const keyset = await keysetClause(db, query.afterId, 2 + extra.values.length);
      const result = await db.query<ReputationRow>(
        `SELECT * FROM reputation_entries
          WHERE subject_user_id = $1 ${extra.sql} ${keyset.sql}
          ORDER BY occurred_at DESC, reputation_id ASC
          LIMIT $${2 + extra.values.length + keyset.values.length}`,
        [subjectUserId, ...extra.values, ...keyset.values, limit],
      );
      return result.rows.map(toRecord);
    },

    async listAll(query: ReputationAdminQuery) {
      const limit = clampStoreLimit(query.limit, 50, MAX_REPUTATION_FACTS_PER_SUBJECT);
      const clauses: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      if (query.subjectUserId) {
        clauses.push(`subject_user_id = $${index}`);
        values.push(query.subjectUserId);
        index += 1;
      }
      if (query.sourceEntityType) {
        clauses.push(`source_entity_type = $${index}`);
        values.push(query.sourceEntityType);
        index += 1;
      }
      if (query.sourceEntityId) {
        clauses.push(`source_entity_id = $${index}`);
        values.push(query.sourceEntityId);
        index += 1;
      }
      const extra = filters(query, index);
      const keyset = await keysetClause(db, query.afterId, index + extra.values.length);
      const where = [...clauses, ...(extra.sql ? [extra.sql.replace(/^AND /, '')] : [])]
        .filter(Boolean)
        .join(' AND ');
      const result = await db.query<ReputationRow>(
        `SELECT * FROM reputation_entries
          ${where ? `WHERE ${where}` : ''} ${keyset.sql.replace(/^AND /, where ? 'AND ' : 'WHERE ')}
          ORDER BY occurred_at DESC, reputation_id ASC
          LIMIT $${index + extra.values.length + keyset.values.length}`,
        [...values, ...extra.values, ...keyset.values, limit],
      );
      return result.rows.map(toRecord);
    },

    async compareAndSetStatus(input) {
      const historyEntry: ReputationHistoryEntry = {
        at: input.at,
        actorId: input.actorId,
        action: input.action,
        reason: input.reason,
        fromStatus: input.expected[0],
        toStatus: input.status,
      };
      const reversed = input.status === 'REVERSED';
      const result = await db.query<ReputationRow>(
        `UPDATE reputation_entries
            SET status = $3,
                reversed_at = CASE WHEN $3 = 'REVERSED' THEN $2::timestamptz ELSE NULL END,
                reversed_by = CASE WHEN $3 = 'REVERSED' THEN $4::text ELSE NULL END,
                reversal_reason = CASE WHEN $3 = 'REVERSED' THEN $5::text ELSE NULL END,
                history = history || $6::jsonb
          WHERE reputation_id = $1
            AND status = ANY($7::text[])
          RETURNING *`,
        [
          input.reputationId,
          input.at,
          input.status,
          input.actorId,
          input.reason,
          JSON.stringify([historyEntry]),
          [...input.expected],
        ],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async countForSubject(subjectUserId, statuses) {
      const result = statuses && statuses.length > 0
        ? await db.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM reputation_entries WHERE subject_user_id = $1 AND status = ANY($2::text[])',
            [subjectUserId, [...statuses]],
          )
        : await db.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM reputation_entries WHERE subject_user_id = $1',
            [subjectUserId],
          );
      return Number(result.rows[0]?.count ?? 0);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Lecteurs de faits EXISTANTS (aucune écriture)                        */
/* ------------------------------------------------------------------ */

interface SalaryConfirmationRow {
  payment_id: string;
  contract_id: string;
  employer_id: string;
  candidate_id: string;
  confirmed_at: string | Date;
}

export interface ReputationFactReaders {
  reader: ReputationFactReader;
  stores: {
    payments: PaymentStore;
    contracts: ContractStore;
    claims: ClaimStore;
  };
}

/**
 * Construit le lecteur de faits sur les stores EXISTANTS + la seule lecture
 * directe nécessaire (`salary_confirmations`, qui n'a pas de port dédié) —
 * strictement bornée, en lecture seule, sans jointure vers un autre domaine.
 */
export function createSqlReputationFactReader(db: SqlQueryExecutor): ReputationFactReader {
  const payments = createSqlPaymentStores(db).payments;
  const contracts = createSqlContractStore(db);
  const claims = createSqlClaimStore(db);

  return {
    payments: { findById: paymentId => payments.findById(paymentId) },
    contracts: {
      listByEmployer: (employerId, limit) => contracts.listByEmployer(employerId, limit),
      listByEmployee: (employeeId, limit) => contracts.listByEmployee(employeeId, limit),
    },
    claims: {
      findClaim: claimId => claims.findClaim(claimId),
      listForParty: (actorId, limit, afterId) => claims.listForParty(actorId, limit, afterId),
    },
    async listConfirmedSalariesForEmployer(employerId: string, limit: number) {
      const bounded = clampStoreLimit(limit, 50, MAX_REPUTATION_FACTS_PER_SUBJECT);
      const result = await db.query<SalaryConfirmationRow>(
        `SELECT payment_id, contract_id, employer_id, candidate_id, confirmed_at
           FROM salary_confirmations
          WHERE employer_id = $1 AND confirmed_at IS NOT NULL
          ORDER BY confirmed_at DESC, payment_id ASC
          LIMIT $2`,
        [employerId, bounded],
      );
      return result.rows.map<ConfirmedSalaryFact>(row => ({
        paymentId: row.payment_id,
        contractId: row.contract_id,
        employerId: row.employer_id,
        candidateId: row.candidate_id,
        confirmedAt: timestamp(row.confirmed_at),
      }));
    },
  };
}
