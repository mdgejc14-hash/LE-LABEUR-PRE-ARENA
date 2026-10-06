/**
 * LE LABEUR — P0-PAY-1 — adaptateurs PostgreSQL du cycle PAIEMENT.
 *
 * Mêmes règles que `sqlCoreStores.ts` et `sqlAutomationStores.ts` :
 *  - requêtes exclusivement paramétrées ($1..$n) : aucune valeur interpolée ;
 *    les seuls identifiants de colonne présents dans le SQL proviennent de
 *    tables fermées vérifiées en amont (`SCHEDULE_STATUS_COLUMN`), jamais d'une
 *    entrée utilisateur ;
 *  - JSONB lu en tolérant les pilotes qui renvoient du texte ;
 *  - les écritures concurrentes sont tranchées par PostgreSQL (clés primaires,
 *    index d'unicité, `FOR UPDATE`, compare-and-set) : AUCUN second mécanisme de
 *    concurrence n'est ajouté côté applicatif ;
 *  - une projection JSONB est une fusion (`elem || $patch`), jamais une
 *    réécriture : une preuve ou une entrée d'historique existante ne peut pas
 *    être effacée par une transition ultérieure.
 */

import type { SqlQueryExecutor, SqlQueryResult } from '../services/database';
import { postgresErrorCode } from './sqlClient';
import {
  assertPaymentStatusDomain,
  PaymentStoreError,
  type ContractPaymentProjectionWriter,
  type DeclarationOutcomePatch,
  type PaymentDeclarationRecord,
  type PaymentDeclarationStore,
  type PaymentDraft,
  type PaymentRecord,
  type PaymentStores,
  type PaymentStore,
  type PaymentTransitionPatch,
} from './paymentRecords';
import type { PaymentLifecycleStatus, PaymentProofMetadata, PaymentType } from '../../domain/paymentLifecycle';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === UNIQUE_VIOLATION;
}

function readText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

function readNullableText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return readText(value);
}

function readNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isFinite(parsed)) {
    throw new PaymentStoreError('INVALID_ROW', 'payments', 'Colonne numérique illisible.');
  }
  return parsed;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readJson<T extends object>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : undefined;
    } catch {
      throw new PaymentStoreError('INVALID_ROW', 'payments', 'Colonne JSONB illisible.');
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as T : undefined;
}

function placeholders(start: number, count: number): string {
  return Array.from({ length: count }, (_, index) => `$${start + index}`).join(', ');
}

function boundedLimit(limit: number | undefined, fallback = 50, max = 200): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  const truncated = Math.trunc(limit);
  if (truncated <= 0) return fallback;
  return Math.min(truncated, max);
}

/* ------------------------------------------------------------------ */
/* payments                                                            */
/* ------------------------------------------------------------------ */

interface PaymentRow {
  id: string;
  contract_id: string;
  employer_id: string;
  candidate_id: string;
  payment_type: PaymentType;
  schedule_entry_id: string;
  month_number: number;
  period_key: string;
  amount: unknown;
  currency: string;
  scheduled_at: unknown;
  due_at: unknown;
  status: PaymentLifecycleStatus;
  submitted_at: unknown;
  submitted_by: string | null;
  reference: string | null;
  proof: unknown;
  verified_at: unknown;
  verified_by: string | null;
  rejected_at: unknown;
  rejected_by: string | null;
  rejection_reason: string | null;
  external_transaction_id: string | null;
  provider: string | null;
  declaration_count: number;
  current_declaration_id: string | null;
  idempotency_key: string;
  created_at: unknown;
  updated_at: unknown;
}

function toPaymentRecord(row: PaymentRow): PaymentRecord {
  const submittedAt = readNullableText(row.submitted_at);
  const submittedBy = readNullableText(row.submitted_by);
  const reference = readNullableText(row.reference);
  const proof = readJson<PaymentProofMetadata>(row.proof);
  const verifiedAt = readNullableText(row.verified_at);
  const verifiedBy = readNullableText(row.verified_by);
  const rejectedAt = readNullableText(row.rejected_at);
  const rejectedBy = readNullableText(row.rejected_by);
  const rejectionReason = readNullableText(row.rejection_reason);
  const externalTransactionId = readNullableText(row.external_transaction_id);
  const provider = readNullableText(row.provider);
  const currentDeclarationId = readNullableText(row.current_declaration_id);
  return {
    paymentId: row.id,
    contractId: row.contract_id,
    employerId: row.employer_id,
    candidateId: row.candidate_id,
    paymentType: row.payment_type,
    scheduleEntryId: row.schedule_entry_id,
    monthNumber: Number(row.month_number),
    periodKey: row.period_key,
    amount: readNumber(row.amount),
    currency: row.currency,
    scheduledAt: readText(row.scheduled_at),
    dueAt: readText(row.due_at),
    status: row.status,
    declarationCount: Number(row.declaration_count ?? 0),
    idempotencyKey: row.idempotency_key,
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
    ...(submittedAt !== undefined ? { submittedAt } : {}),
    ...(submittedBy !== undefined ? { submittedBy } : {}),
    ...(reference !== undefined ? { reference } : {}),
    ...(proof !== undefined ? { proof } : {}),
    ...(verifiedAt !== undefined ? { verifiedAt } : {}),
    ...(verifiedBy !== undefined ? { verifiedBy } : {}),
    ...(rejectedAt !== undefined ? { rejectedAt } : {}),
    ...(rejectedBy !== undefined ? { rejectedBy } : {}),
    ...(rejectionReason !== undefined ? { rejectionReason } : {}),
    ...(externalTransactionId !== undefined ? { externalTransactionId } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(currentDeclarationId !== undefined ? { currentDeclarationId } : {}),
  };
}

const PAYMENT_INSERT_COLUMNS = [
  'id', 'contract_id', 'employer_id', 'candidate_id', 'payment_type',
  'schedule_entry_id', 'month_number', 'period_key', 'amount', 'currency',
  'scheduled_at', 'due_at', 'status', 'declaration_count', 'idempotency_key',
  'created_at', 'updated_at',
] as const;

export function createSqlPaymentStore(db: SqlQueryExecutor): PaymentStore {
  const byId = async (paymentId: string): Promise<PaymentRecord | null> => {
    const result = await db.query<PaymentRow>('SELECT * FROM payments WHERE id = $1', [paymentId]);
    return result.rows[0] ? toPaymentRecord(result.rows[0]) : null;
  };
  const byKey = async (idempotencyKey: string): Promise<PaymentRecord | null> => {
    const result = await db.query<PaymentRow>(
      'SELECT * FROM payments WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    return result.rows[0] ? toPaymentRecord(result.rows[0]) : null;
  };

  return {
    async createIfAbsent(draft: PaymentDraft) {
      assertPaymentStatusDomain(draft.status, 'payments');
      let result: SqlQueryResult<PaymentRow>;
      try {
        result = await db.query<PaymentRow>(
          `INSERT INTO payments (${PAYMENT_INSERT_COLUMNS.join(', ')})
           VALUES (${placeholders(1, PAYMENT_INSERT_COLUMNS.length)})
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *`,
          [
            draft.paymentId,
            draft.contractId,
            draft.employerId,
            draft.candidateId,
            draft.paymentType,
            draft.scheduleEntryId,
            draft.monthNumber,
            draft.periodKey,
            draft.amount,
            draft.currency,
            draft.scheduledAt,
            draft.dueAt,
            draft.status,
            0,
            draft.idempotencyKey,
            draft.createdAt,
            draft.updatedAt,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Deux workers concurrents : la ligne existe déjà, jamais de doublon.
          const existing = await byKey(draft.idempotencyKey).catch(() => null);
          const found = existing ?? await byId(draft.paymentId);
          if (found) return { kind: 'duplicate', payment: found };
        }
        throw error;
      }
      if (result.rows[0]) return { kind: 'created', payment: toPaymentRecord(result.rows[0]) };
      const existing = await byKey(draft.idempotencyKey);
      if (!existing) {
        throw new PaymentStoreError('DUPLICATE', 'payments', `Paiement ${draft.paymentId} ni inséré ni retrouvé.`);
      }
      return { kind: 'duplicate', payment: existing };
    },

    findById: byId,

    async findByIdForUpdate(paymentId) {
      const result = await db.query<PaymentRow>(
        'SELECT * FROM payments WHERE id = $1 FOR UPDATE',
        [paymentId],
      );
      return result.rows[0] ? toPaymentRecord(result.rows[0]) : null;
    },

    async findByContractAndPeriod(contractId, paymentType, monthNumber) {
      const result = await db.query<PaymentRow>(
        `SELECT * FROM payments
          WHERE contract_id = $1 AND payment_type = $2 AND month_number = $3`,
        [contractId, paymentType, monthNumber],
      );
      return result.rows[0] ? toPaymentRecord(result.rows[0]) : null;
    },

    async compareAndSetStatus(paymentId, expected, patch) {
      assertPaymentStatusDomain(patch.status, 'payments');
      const statuses = [...new Set(expected)];
      if (statuses.length === 0) return null;
      statuses.forEach(status => assertPaymentStatusDomain(status, 'payments'));

      // Les affectations sont construites depuis une liste FERMÉE de colonnes :
      // aucune clé libre ne peut entrer dans le SQL.
      const assignments: string[] = ['status = $2', 'updated_at = $3'];
      const values: unknown[] = [paymentId, patch.status, patch.updatedAt];
      const assign = (column: string, value: unknown): void => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };
      if (patch.reference !== undefined) assign('reference', patch.reference);
      if (patch.submittedAt !== undefined) assign('submitted_at', patch.submittedAt);
      if (patch.submittedBy !== undefined) assign('submitted_by', patch.submittedBy);
      if (patch.proof !== undefined) assign('proof', JSON.stringify(patch.proof));
      if (patch.externalTransactionId !== undefined) assign('external_transaction_id', patch.externalTransactionId);
      if (patch.provider !== undefined) assign('provider', patch.provider);
      if (patch.verifiedAt !== undefined) assign('verified_at', patch.verifiedAt);
      if (patch.verifiedBy !== undefined) assign('verified_by', patch.verifiedBy);
      if (patch.rejectedAt !== undefined) assign('rejected_at', patch.rejectedAt);
      if (patch.rejectedBy !== undefined) assign('rejected_by', patch.rejectedBy);
      if (patch.rejectionReason !== undefined) assign('rejection_reason', patch.rejectionReason);
      if (patch.currentDeclarationId !== undefined) assign('current_declaration_id', patch.currentDeclarationId);
      if (patch.incrementDeclarationCount) assignments.push('declaration_count = declaration_count + 1');

      const guardIndex = values.length + 1;
      try {
        const result = await db.query<PaymentRow>(
          `UPDATE payments
              SET ${assignments.join(', ')}
            WHERE id = $1
              AND status IN (${placeholders(guardIndex, statuses.length)})
            RETURNING *`,
          [...values, ...statuses],
        );
        return result.rows[0] ? toPaymentRecord(result.rows[0]) : null;
      } catch (error) {
        const code = postgresErrorCode(error);
        if (code === '23514') {
          throw new PaymentStoreError(
            'INVALID_STATUS',
            'payments',
            `Contrainte du cycle violée pour le paiement ${paymentId} (transition ${patch.status} refusée par PostgreSQL).`,
          );
        }
        throw error;
      }
    },

    async listByContract(contractId, limit) {
      const result = await db.query<PaymentRow>(
        `SELECT * FROM payments
          WHERE contract_id = $1
          ORDER BY month_number ASC, payment_type ASC
          LIMIT $2`,
        [contractId, boundedLimit(limit)],
      );
      return result.rows.map(toPaymentRecord);
    },

    async listByEmployer(employerId, limit, afterId) {
      return listScoped(db, 'employer_id', employerId, limit, afterId);
    },

    async listByCandidate(candidateId, limit, afterId, paymentType) {
      return listScoped(db, 'candidate_id', candidateId, limit, afterId, paymentType);
    },

    async listScheduledDue(limit, now) {
      // Balayage BORNÉ sur l'index partiel `(due_at, id) WHERE status IN
      // ('SCHEDULED','DUE')` : aucune table n'est scannée en entier et aucun
      // job par utilisateur n'existe pour déclencher ce balayage.
      const result = await db.query<PaymentRow>(
        `SELECT * FROM payments
          WHERE status = 'SCHEDULED' AND due_at <= $2::timestamptz
          ORDER BY due_at ASC, id ASC
          LIMIT $1`,
        [boundedLimit(limit, 25, 200), now],
      );
      return result.rows.map(toPaymentRecord);
    },

    async listAll(limit, afterId) {
      const bounded = boundedLimit(limit);
      const result = afterId
        ? await db.query<PaymentRow>(
            `SELECT * FROM payments
              WHERE (updated_at, id) < (
                SELECT p.updated_at, p.id FROM payments AS p WHERE p.id = $1
              )
              ORDER BY updated_at DESC, id ASC
              LIMIT $2`,
            [afterId, bounded],
          )
        : await db.query<PaymentRow>(
            'SELECT * FROM payments ORDER BY updated_at DESC, id ASC LIMIT $1',
            [bounded],
          );
      return result.rows.map(toPaymentRecord);
    },
  };
}

/** Lecture bornée keyset (updatedAt, id) pour `listByEmployer` / `listByCandidate`. */
async function listScoped(
  db: SqlQueryExecutor,
  column: 'employer_id' | 'candidate_id',
  scopeId: string,
  limit: number | undefined,
  afterId: string | null | undefined,
  paymentType?: PaymentType,
): Promise<PaymentRecord[]> {
  const bounded = boundedLimit(limit);
  // `column` provient d'une union fermée locale, jamais d'une entrée appelante,
  // et `paymentType` est une valeur du domaine SQL : les deux sont interpolés
  // comme des LITTÉRAUX fermés, jamais comme du texte utilisateur.
  const typeIndex = afterId ? 4 : 3;
  const typeFilter = paymentType ? ` AND payment_type = $${typeIndex}` : '';
  const result = afterId
    ? await db.query<PaymentRow>(
        `SELECT * FROM payments
          WHERE ${column} = $1
            AND (updated_at, id) < (
              SELECT p.updated_at, p.id FROM payments AS p WHERE p.id = $3
            )${typeFilter}
          ORDER BY updated_at DESC, id ASC
          LIMIT $2`,
        paymentType ? [scopeId, bounded, afterId, paymentType] : [scopeId, bounded, afterId],
      )
    : await db.query<PaymentRow>(
        `SELECT * FROM payments
          WHERE ${column} = $1${typeFilter}
          ORDER BY updated_at DESC, id ASC
          LIMIT $2`,
        paymentType ? [scopeId, bounded, paymentType] : [scopeId, bounded],
      );
  return result.rows.map(toPaymentRecord);
}

/* ------------------------------------------------------------------ */
/* payment_declarations                                                */
/* ------------------------------------------------------------------ */

interface DeclarationRow {
  id: string;
  payment_id: string;
  contract_id: string;
  period_key: string;
  payment_type: PaymentType;
  attempt_number: number;
  amount: unknown;
  currency: string;
  reference: string;
  external_transaction_id: string | null;
  provider: string | null;
  proof: unknown;
  comment: string | null;
  submitted_at: unknown;
  submitted_by: string;
  outcome: PaymentDeclarationRecord['outcome'];
  reviewed_at: unknown;
  reviewed_by: string | null;
  rejection_reason: string | null;
  idempotency_key: string;
  created_at: unknown;
  updated_at: unknown;
}

function toDeclarationRecord(row: DeclarationRow): PaymentDeclarationRecord {
  const externalTransactionId = readNullableText(row.external_transaction_id);
  const provider = readNullableText(row.provider);
  const proof = readJson<PaymentProofMetadata>(row.proof);
  const comment = readNullableText(row.comment);
  const reviewedAt = readNullableText(row.reviewed_at);
  const reviewedBy = readNullableText(row.reviewed_by);
  const rejectionReason = readNullableText(row.rejection_reason);
  return {
    declarationId: row.id,
    paymentId: row.payment_id,
    contractId: row.contract_id,
    periodKey: row.period_key,
    paymentType: row.payment_type,
    attemptNumber: Number(row.attempt_number),
    amount: readNumber(row.amount),
    currency: row.currency,
    reference: row.reference,
    submittedAt: readText(row.submitted_at),
    submittedBy: row.submitted_by,
    outcome: row.outcome,
    idempotencyKey: row.idempotency_key,
    createdAt: readText(row.created_at),
    updatedAt: readText(row.updated_at),
    ...(externalTransactionId !== undefined ? { externalTransactionId } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(proof !== undefined ? { proof } : {}),
    ...(comment !== undefined ? { comment } : {}),
    ...(reviewedAt !== undefined ? { reviewedAt } : {}),
    ...(reviewedBy !== undefined ? { reviewedBy } : {}),
    ...(rejectionReason !== undefined ? { rejectionReason } : {}),
  };
}

export function createSqlPaymentDeclarationStore(db: SqlQueryExecutor): PaymentDeclarationStore {
  return {
    async create(record) {
      try {
        const result = await db.query<DeclarationRow>(
          `INSERT INTO payment_declarations (
             id, payment_id, contract_id, period_key, payment_type, attempt_number,
             amount, currency, reference, external_transaction_id, provider, proof,
             comment, submitted_at, submitted_by, outcome, idempotency_key,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15,
             'PENDING', $16, $17, $17
           )
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *`,
          [
            record.declarationId,
            record.paymentId,
            record.contractId,
            record.periodKey,
            record.paymentType,
            record.attemptNumber,
            record.amount,
            record.currency,
            record.reference,
            record.externalTransactionId ?? null,
            record.provider ?? null,
            record.proof ? JSON.stringify(record.proof) : null,
            record.comment ?? null,
            record.submittedAt,
            record.submittedBy,
            record.idempotencyKey,
            record.createdAt,
          ],
        );
        if (result.rows[0]) return toDeclarationRecord(result.rows[0]);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      // Rejeu de la MÊME déclaration (même Idempotency-Key) : la ligne existante
      // est rendue telle quelle, aucune seconde tentative n'est écrite.
      const replay = await db.query<DeclarationRow>(
        'SELECT * FROM payment_declarations WHERE idempotency_key = $1',
        [record.idempotencyKey],
      );
      if (replay.rows[0]) return toDeclarationRecord(replay.rows[0]);
      throw new PaymentStoreError(
        'DUPLICATE',
        'payment_declarations',
        `Tentative ${record.attemptNumber} déjà enregistrée pour le paiement ${record.paymentId} : `
        + 'une déclaration concurrente a déposé une autre preuve, la précédente est conservée.',
      );
    },

    async findById(declarationId) {
      const result = await db.query<DeclarationRow>(
        'SELECT * FROM payment_declarations WHERE id = $1',
        [declarationId],
      );
      return result.rows[0] ? toDeclarationRecord(result.rows[0]) : null;
    },

    async findByIdempotencyKey(idempotencyKey) {
      const result = await db.query<DeclarationRow>(
        'SELECT * FROM payment_declarations WHERE idempotency_key = $1',
        [idempotencyKey],
      );
      return result.rows[0] ? toDeclarationRecord(result.rows[0]) : null;
    },

    async nextAttemptNumber(paymentId) {
      const result = await db.query<{ max: string | null }>(
        'SELECT max(attempt_number)::text AS max FROM payment_declarations WHERE payment_id = $1',
        [paymentId],
      );
      const max = readOptionalNumber(result.rows[0]?.max ?? null);
      return max === undefined ? 1 : max + 1;
    },

    async listByPayment(paymentId, limit) {
      const result = await db.query<DeclarationRow>(
        `SELECT * FROM payment_declarations
          WHERE payment_id = $1
          ORDER BY attempt_number ASC
          LIMIT $2`,
        [paymentId, boundedLimit(limit)],
      );
      return result.rows.map(toDeclarationRecord);
    },

    async compareAndSetOutcome(declarationId, expected, patch) {
      const assignments = ['outcome = $2', 'updated_at = $3'];
      const values: unknown[] = [declarationId, patch.outcome, patch.updatedAt];
      const assign = (column: string, value: unknown): void => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };
      if (patch.reviewedAt !== undefined) assign('reviewed_at', patch.reviewedAt);
      if (patch.reviewedBy !== undefined) assign('reviewed_by', patch.reviewedBy);
      if (patch.rejectionReason !== undefined) assign('rejection_reason', patch.rejectionReason);
      // Garde CAS : l'index du paramètre d'attente est TOUJOURS calculé après les
      // affectations (un index figé écraserait un paramètre déjà lié).
      const guardIndex = values.length + 1;
      const result = await db.query<DeclarationRow>(
        `UPDATE payment_declarations
            SET ${assignments.join(', ')}
          WHERE id = $1 AND outcome = $${guardIndex}
          RETURNING *`,
        [...values, expected],
      );
      return result.rows[0] ? toDeclarationRecord(result.rows[0]) : null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Projection sur les vues réelles du contrat                          */
/* ------------------------------------------------------------------ */

/** Colonnes de statut de l'entrée d'échéancier : table fermée, jamais un champ libre. */
const SCHEDULE_STATUS_COLUMN: Record<PaymentType, 'salaryStatus' | 'commissionStatus'> = {
  SALARY: 'salaryStatus',
  PLATFORM_FEE: 'commissionStatus',
};

export function createSqlContractPaymentProjectionWriter(db: SqlQueryExecutor): ContractPaymentProjectionWriter {
  return {
    async projectPaymentStatus(input) {
      const statusColumn = SCHEDULE_STATUS_COLUMN[input.paymentType];
      let projected = false;

      const schedule = await db.query<{ id: string }>(
        // Fusion de l'entrée d'échéancier ciblée, gardée par son statut courant :
        // une projection rejouée ne remonte jamais un état et n'en écrase pas un
        // plus avancé. `history` n'est jamais réécrit, seulement complété.
        `UPDATE contracts
            SET payment_schedule = (
                  SELECT jsonb_agg(
                           CASE WHEN elem->>'id' = $2
                                THEN (elem || $3::jsonb)
                                ELSE elem
                           END
                           ORDER BY ord
                         )
                     FROM jsonb_array_elements(payment_schedule) WITH ORDINALITY AS entry(elem, ord)
                ),
                updated_at = $6
          WHERE id = $1
            AND EXISTS (
              SELECT 1
                FROM jsonb_array_elements(payment_schedule) AS e
               WHERE e->>'id' = $2
                 AND e->>$4 = $5
            )
          RETURNING id`,
        [
          input.contractId,
          input.scheduleEntryId,
          JSON.stringify({ ...input.entryPatch, [statusColumn]: input.entryStatus }),
          statusColumn,
          input.expectedEntryStatus,
          input.updatedAt,
        ],
      );
      projected = schedule.rows.length > 0;

      if (input.ledgerPatch && input.paymentType === 'PLATFORM_FEE') {
        await db.query<{ id: string }>(
          `UPDATE contracts
              SET commission_ledger = (
                    SELECT jsonb_agg(
                             CASE WHEN (elem->>'monthNumber')::int = $2::int
                                  THEN (elem || $3::jsonb)
                                  ELSE elem
                             END
                             ORDER BY ord
                           )
                       FROM jsonb_array_elements(commission_ledger) WITH ORDINALITY AS entry(elem, ord)
                  ),
                  commission_status = CASE
                    WHEN $4::text IS NOT NULL AND $2::int = current_month THEN $4::text
                    ELSE commission_status
                  END,
                  commission_amount_due = CASE
                    WHEN $5::numeric IS NOT NULL AND $2::int = current_month THEN $5::numeric
                    ELSE commission_amount_due
                  END,
                  updated_at = $6
            WHERE id = $1
              AND EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(commission_ledger) AS e
                 WHERE (e->>'monthNumber')::int = $2::int
              )
            RETURNING id`,
          [
            input.contractId,
            input.monthNumber,
            JSON.stringify(input.ledgerPatch),
            input.contractCommission?.status ?? null,
            input.contractCommission?.amountDue ?? null,
            input.updatedAt,
          ],
        );
      }

      if (input.historyEntry) {
        await db.query<{ id: string }>(
          `UPDATE contracts
              SET history = history || $2::jsonb,
                  updated_at = $3
            WHERE id = $1
            RETURNING id`,
          [input.contractId, JSON.stringify([input.historyEntry]), input.updatedAt],
        );
      }

      return projected;
    },

    async advanceContractMonth(input) {
      const result = await db.query<{ id: string }>(
        // Compare-and-set double : mois courant attendu ET absence déjà vérifiée
        // du point de contrôle cible — un rejeu de l'avancement ne produit donc
        // jamais un second point de contrôle ni un mois sauté.
        `UPDATE contracts
            SET current_month = $2,
                monthly_checkpoints = monthly_checkpoints || $3::jsonb,
                commission_ledger = CASE
                  WHEN EXISTS (
                    SELECT 1 FROM jsonb_array_elements(commission_ledger) AS l
                     WHERE (l->>'monthNumber')::int = $2
                  )
                  THEN commission_ledger
                  ELSE commission_ledger || $4::jsonb
                END,
                commission_amount_due = $5,
                commission_status = $6,
                updated_at = $7,
                history = history || $8::jsonb
          WHERE id = $1
            AND status = 'ACTIVE'
            AND current_month = $9
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(monthly_checkpoints) AS c
               WHERE (c->>'monthNumber')::int = $2
            )
          RETURNING id`,
        [
          input.contractId,
          input.toMonth,
          JSON.stringify([input.checkpoint]),
          JSON.stringify([input.ledgerEntry]),
          input.commissionAmountDue,
          input.commissionStatus,
          input.updatedAt,
          JSON.stringify([input.historyEntry]),
          input.fromMonth,
        ],
      );
      return result.rows.length > 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Jeu complet                                                         */
/* ------------------------------------------------------------------ */

export function createSqlPaymentStores(db: SqlQueryExecutor): PaymentStores {
  return {
    payments: createSqlPaymentStore(db),
    declarations: createSqlPaymentDeclarationStore(db),
    contractPayments: createSqlContractPaymentProjectionWriter(db),
  };
}
