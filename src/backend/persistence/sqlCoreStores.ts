/**
 * LE LABEUR — P0-A — adaptateur PostgreSQL du noyau relationnel.
 *
 * Implémente les ports de `coreRecords.ts` au-dessus de `PostgreSqlDatabase`.
 * Les requêtes correspondent EXACTEMENT aux colonnes créées par
 * `migrations/0001_identity_and_core.sql` et
 * `migrations/0003_core_nucleus_alignment.sql` ; le test
 * « colonnes utilisées par les adaptateurs présentes » échoue si les deux
 * divergent.
 *
 * Règles :
 *  - requêtes exclusivement paramétrées ($1..$n) : aucune valeur interpolée ;
 *  - JSONB lu en tolérant les pilotes qui renvoient du texte ;
 *  - erreurs PostgreSQL traduites en `CoreStoreError` stable (23505, 23514,
 *    23503) ; toute autre erreur est propagée telle quelle, jamais avalée ;
 *  - les stores OFFRES sont branchés; côté CANDIDATURES, seules la soumission
 *    et la consultation ciblée (P0-E3) puis les quatre décisions du cycle
 *    examine/shortlist/reject/withdraw (P0-E4, transition conditionnelle
 *    `compareAndSetStatus`) sont ouvertes; côté PROPOSITIONS (P0-E5), seules
 *    l'émission, l'acceptation, la déclinaison, l'expiration et la lecture
 *    autorisée le sont; les autres cycles métier restent fermés ;
 *  - la lecture des permissions est partagée avec le flux d'identité P0-B.
 */

import type { PostgreSqlDatabase, SqlQueryExecutor, SqlQueryResult } from '../services/database';
import { createSqlPermissionStore } from '../identity/permissionStore';
import {
  APPLICATION_STATUS_VALUES,
  assertStatusDomain,
  clampStoreLimit,
  CONTRACT_STATUS_VALUES,
  CoreStoreError,
  OFFER_STATUS_VALUES,
  PROPOSAL_STATUS_VALUES,
  type ApplicationRecord,
  type ApplicationStore,
  type ContractRecord,
  type ContractStore,
  type CoreStoreName,
  type CoreStores,
  type OfferRecord,
  type OfferStore,
  type ProposalRecord,
  type ProposalStore,
} from './coreRecords';
import { postgresErrorCode } from './sqlClient';

/** Ouvrier de lecture JSONB : objet déjà désérialisé ou texte JSON. */
function readJsonArray<Item>(value: unknown, entity: CoreStoreName, column: string, fallback: Item[]): Item[] {
  if (value === null || value === undefined) return [...fallback];
  if (Array.isArray(value)) return value as Item[];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as Item[];
    } catch {
      throw new CoreStoreError('INVALID_ROW', entity, `Colonne ${column} illisible (JSON invalide).`);
    }
  }
  throw new CoreStoreError('INVALID_ROW', entity, `Colonne ${column} n’est pas un tableau JSON.`);
}

function readTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Colonne DATE : `pg` renvoie un objet Date (minuit local) et certains pilotes
 * une chaîne. On restitue toujours `YYYY-MM-DD` sans décalage de fuseau.
 */
function readDate(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return isoDate ? isoDate[1] : text;
}

function readNullableDate(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : readDate(value);
}

function readNullableTimestamp(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : readTimestamp(value);
}

function readNullableString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function readNumeric(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/** `Application.remuneration` accepte `number | string` : le texte stocké est restitué tel quel. */
function readRemuneration(value: unknown): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return typeof value === 'number' ? value : String(value);
}

/** Traduit les codes PostgreSQL stables ; toute autre erreur est propagée. */
function translateSqlError(error: unknown, entity: CoreStoreName, duplicateMessage: string): never {
  const code = postgresErrorCode(error);
  if (code === '23505') throw new CoreStoreError('DUPLICATE', entity, duplicateMessage);
  if (code === '23514') throw new CoreStoreError('INVALID_STATUS', entity, `Contrainte de domaine violée pour ${entity}.`);
  if (code === '23503') throw new CoreStoreError('CONSTRAINT', entity, `Référence inexistante pour ${entity}.`);
  throw error;
}

interface OfferRow {
  id: string;
  employer_id: string;
  title: string;
  status: OfferRecord['status'];
  contract_type: string;
  remuneration: unknown;
  currency: string;
  location: string;
  department_id: string | null;
  municipality_id: string | null;
  arrondissement_id: string | null;
  locality_id: string | null;
  location_label: string | null;
  domain_id: string | null;
  job_id: string | null;
  posted_date: unknown;
  is_urgent: boolean;
  is_le_labeur_job: boolean;
  le_labeur_tag: string | null;
  skills: unknown;
  summary: string;
  responsibilities: unknown;
  conditions: unknown;
  selection_process: unknown;
  start_date: unknown;
  duration_months: number | null;
  created_at: unknown;
  updated_at: unknown;
}

function toOfferRecord(row: OfferRow): OfferRecord {
  return {
    id: row.id,
    employerId: row.employer_id,
    title: row.title,
    contractType: row.contract_type,
    remuneration: readNumeric(row.remuneration),
    currency: row.currency,
    location: row.location,
    status: row.status,
    postedDate: readTimestamp(row.posted_date),
    isUrgent: row.is_urgent,
    isLeLabeurJob: row.is_le_labeur_job,
    skills: readJsonArray<string>(row.skills, 'offers', 'skills', []),
    summary: row.summary,
    responsibilities: readJsonArray<string>(row.responsibilities, 'offers', 'responsibilities', []),
    conditions: readJsonArray<string>(row.conditions, 'offers', 'conditions', []),
    selectionProcess: readJsonArray<string>(row.selection_process, 'offers', 'selection_process', []),
    createdAt: readTimestamp(row.created_at),
    updatedAt: readTimestamp(row.updated_at),
    ...(readNullableString(row.department_id) !== undefined ? { departmentId: readNullableString(row.department_id) } : {}),
    ...(readNullableString(row.municipality_id) !== undefined ? { municipalityId: readNullableString(row.municipality_id) } : {}),
    ...(readNullableString(row.arrondissement_id) !== undefined ? { arrondissementId: readNullableString(row.arrondissement_id) } : {}),
    ...(readNullableString(row.locality_id) !== undefined ? { localityId: readNullableString(row.locality_id) } : {}),
    ...(readNullableString(row.location_label) !== undefined ? { locationLabel: readNullableString(row.location_label) } : {}),
    ...(readNullableString(row.domain_id) !== undefined ? { domainId: readNullableString(row.domain_id) } : {}),
    ...(readNullableString(row.job_id) !== undefined ? { jobId: readNullableString(row.job_id) } : {}),
    ...(readNullableString(row.le_labeur_tag) !== undefined ? { leLabeurTag: readNullableString(row.le_labeur_tag) } : {}),
    ...(readNullableDate(row.start_date) !== undefined ? { startDate: readNullableDate(row.start_date) } : {}),
    ...(row.duration_months !== null && row.duration_months !== undefined ? { durationMonths: row.duration_months } : {}),
  };
}

export function createSqlOfferStore(db: SqlQueryExecutor): OfferStore {
  return {
    async create(record) {
      assertStatusDomain(record.status, OFFER_STATUS_VALUES, 'offers');
      let result: SqlQueryResult<OfferRow>;
      try {
        result = await db.query<OfferRow>(
        `INSERT INTO offers (
           id, employer_id, title, status, contract_type, remuneration, currency, location,
           department_id, municipality_id, arrondissement_id, locality_id, location_label,
           domain_id, job_id, posted_date, is_urgent, is_le_labeur_job, le_labeur_tag,
           skills, summary, responsibilities, conditions, selection_process,
           start_date, duration_months, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19,
           $20::jsonb, $21, $22::jsonb, $23::jsonb, $24::jsonb,
           $25, $26, $27, $28
         ) RETURNING *`,
        [
          record.id,
          record.employerId,
          record.title,
          record.status,
          record.contractType,
          record.remuneration,
          record.currency,
          record.location,
          record.departmentId ?? null,
          record.municipalityId ?? null,
          record.arrondissementId ?? null,
          record.localityId ?? null,
          record.locationLabel ?? null,
          record.domainId ?? null,
          record.jobId ?? null,
          record.postedDate,
          record.isUrgent === true,
          record.isLeLabeurJob === true,
          record.leLabeurTag ?? null,
          JSON.stringify(record.skills ?? []),
          record.summary ?? '',
          JSON.stringify(record.responsibilities ?? []),
          JSON.stringify(record.conditions ?? []),
          JSON.stringify(record.selectionProcess ?? []),
          record.startDate ?? null,
          record.durationMonths ?? null,
          record.createdAt,
          record.updatedAt,
        ],
        );
      } catch (error) {
        return translateSqlError(error, 'offers', `Offre ${record.id} déjà persistée.`);
      }
      return toOfferRecord(result.rows[0]);
    },

    async findById(offerId) {
      const result = await db.query<OfferRow>('SELECT * FROM offers WHERE id = $1', [offerId]);
      return result.rows[0] ? toOfferRecord(result.rows[0]) : null;
    },

    async findByIdForShare(offerId) {
      const result = await db.query<OfferRow>('SELECT * FROM offers WHERE id = $1 FOR SHARE', [offerId]);
      return result.rows[0] ? toOfferRecord(result.rows[0]) : null;
    },

    async listByEmployer(employerId, limit) {
      const result = await db.query<OfferRow>(
        'SELECT * FROM offers WHERE employer_id = $1 ORDER BY posted_date DESC, id ASC LIMIT $2',
        [employerId, clampStoreLimit(limit)],
      );
      return result.rows.map(toOfferRecord);
    },

    async updateStatus(offerId, status, updatedAt) {
      assertStatusDomain(status, OFFER_STATUS_VALUES, 'offers');
      try {
        const result = await db.query<OfferRow>(
          'UPDATE offers SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *',
          [offerId, status, updatedAt],
        );
        return result.rows[0] ? toOfferRecord(result.rows[0]) : null;
      } catch (error) {
        // La contrainte CHECK de la base est le miroir du domaine : même erreur
        // stable que l'implémentation mémoire.
        return translateSqlError(error, 'offers', `Statut « ${status} » refusé pour l’offre ${offerId}.`);
      }
    },

    async listPublic(limit, filter) {
      const conditions: string[] = ["o.status = 'ACTIVE'", "u.status != 'BLOCKED'"];
      const values: unknown[] = [];

      if (filter?.departmentId?.trim()) {
        values.push(filter.departmentId.trim());
        conditions.push(`o.department_id = $${values.length}`);
      }
      if (filter?.communeId?.trim()) {
        values.push(filter.communeId.trim());
        conditions.push(`o.municipality_id = $${values.length}`);
      }
      if (filter?.contractType?.trim()) {
        values.push(filter.contractType.trim());
        conditions.push(`o.contract_type = $${values.length}`);
      }
      if (filter?.searchQuery?.trim()) {
        const pattern = `%${filter.searchQuery.trim().toLowerCase()}%`;
        values.push(pattern);
        const idx = values.length;
        conditions.push(`(lower(o.title) LIKE $${idx} OR lower(o.summary) LIKE $${idx} OR lower(o.location) LIKE $${idx})`);
      }

      values.push(clampStoreLimit(limit));
      const limitIdx = values.length;

      const sql = `SELECT o.* FROM offers o
                   JOIN users u ON u.id = o.employer_id
                   WHERE ${conditions.join(' AND ')}
                   ORDER BY o.posted_date DESC, o.id ASC
                   LIMIT $${limitIdx}`;

      const result = await db.query<OfferRow>(sql, values);
      return result.rows.map(toOfferRecord);
    },
  };
}

interface ApplicationRow {
  id: string;
  offer_id: string;
  candidate_id: string;
  status: ApplicationRecord['status'];
  applied_date: unknown;
  note: string | null;
  remuneration: string | null;
  contract_id: string | null;
  history: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function toApplicationRecord(row: ApplicationRow): ApplicationRecord {
  return {
    id: row.id,
    offerId: row.offer_id,
    candidateId: row.candidate_id,
    status: row.status,
    appliedDate: readTimestamp(row.applied_date),
    history: readJsonArray<ApplicationRecord['history'][number]>(row.history, 'applications', 'history', []),
    createdAt: readTimestamp(row.created_at),
    updatedAt: readTimestamp(row.updated_at),
    ...(readNullableString(row.note) !== undefined ? { note: readNullableString(row.note) } : {}),
    ...(readRemuneration(row.remuneration) !== undefined ? { remuneration: readRemuneration(row.remuneration) } : {}),
    ...(readNullableString(row.contract_id) !== undefined ? { contractId: readNullableString(row.contract_id) } : {}),
  };
}

export function createSqlApplicationStore(db: SqlQueryExecutor): ApplicationStore {
  return {
    async create(record) {
      assertStatusDomain(record.status, APPLICATION_STATUS_VALUES, 'applications');
      try {
        const result = await db.query<ApplicationRow>(
          `INSERT INTO applications (
             id, offer_id, candidate_id, status, applied_date, note, remuneration, contract_id, history, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
           RETURNING *`,
          [
            record.id,
            record.offerId,
            record.candidateId,
            record.status,
            record.appliedDate,
            record.note ?? null,
            record.remuneration === undefined ? null : String(record.remuneration),
            record.contractId ?? null,
            JSON.stringify(record.history ?? []),
            record.createdAt,
            record.updatedAt,
          ],
        );
        return toApplicationRecord(result.rows[0]);
      } catch (error) {
        return translateSqlError(
          error,
          'applications',
          'Une candidature existe déjà pour cette offre et ce candidat.',
        );
      }
    },

    async findById(applicationId) {
      const result = await db.query<ApplicationRow>('SELECT * FROM applications WHERE id = $1', [applicationId]);
      return result.rows[0] ? toApplicationRecord(result.rows[0]) : null;
    },

    async findByIdForUpdate(applicationId) {
      // Verrou de ligne réel : deux décisions concurrentes sur la même
      // candidature sont sérialisées par PostgreSQL, la seconde relit l'état
      // validé par la première.
      const result = await db.query<ApplicationRow>(
        'SELECT * FROM applications WHERE id = $1 FOR UPDATE',
        [applicationId],
      );
      return result.rows[0] ? toApplicationRecord(result.rows[0]) : null;
    },

    async compareAndSetStatus(applicationId, expectedStatus, patch) {
      assertStatusDomain(patch.status, APPLICATION_STATUS_VALUES, 'applications');
      assertStatusDomain(expectedStatus, APPLICATION_STATUS_VALUES, 'applications');
      try {
        const result = await db.query<ApplicationRow>(
          `UPDATE applications
              SET status = $2,
                  updated_at = $3,
                  history = history || $4::jsonb,
                  note = COALESCE($5, note)
            WHERE id = $1
              AND status = $6
          RETURNING *`,
          [
            applicationId,
            patch.status,
            patch.updatedAt,
            JSON.stringify([patch.historyEntry]),
            patch.note ?? null,
            expectedStatus,
          ],
        );
        return result.rows[0] ? toApplicationRecord(result.rows[0]) : null;
      } catch (error) {
        return translateSqlError(
          error,
          'applications',
          `Statut « ${patch.status} » refusé pour la candidature ${applicationId}.`,
        );
      }
    },

    async findByOfferAndCandidate(offerId, candidateId) {
      const result = await db.query<ApplicationRow>(
        'SELECT * FROM applications WHERE offer_id = $1 AND candidate_id = $2',
        [offerId, candidateId],
      );
      return result.rows[0] ? toApplicationRecord(result.rows[0]) : null;
    },

    async listByOffer(offerId, limit, afterId) {
      const boundedLimit = clampStoreLimit(limit);
      const result = afterId
        ? await db.query<ApplicationRow>(
            `SELECT a.*
               FROM applications AS a
              WHERE a.offer_id = $1
                AND (a.applied_date, a.id) > (
                  SELECT c.applied_date, c.id
                    FROM applications AS c
                   WHERE c.id = $2 AND c.offer_id = $1
                )
              ORDER BY a.applied_date ASC, a.id ASC
              LIMIT $3`,
            [offerId, afterId, boundedLimit],
          )
        : await db.query<ApplicationRow>(
            'SELECT * FROM applications WHERE offer_id = $1 ORDER BY applied_date ASC, id ASC LIMIT $2',
            [offerId, boundedLimit],
          );
      return result.rows.map(toApplicationRecord);
    },

    async listByCandidate(candidateId, limit) {
      const result = await db.query<ApplicationRow>(
        'SELECT * FROM applications WHERE candidate_id = $1 ORDER BY applied_date DESC, id ASC LIMIT $2',
        [candidateId, clampStoreLimit(limit)],
      );
      return result.rows.map(toApplicationRecord);
    },

    async updateStatus(applicationId, status, updatedAt, contractId) {
      assertStatusDomain(status, APPLICATION_STATUS_VALUES, 'applications');
      try {
        const result = await db.query<ApplicationRow>(
          `UPDATE applications
              SET status = $2,
                  updated_at = $3,
                  contract_id = COALESCE($4, contract_id)
            WHERE id = $1
          RETURNING *`,
          [applicationId, status, updatedAt, contractId ?? null],
        );
        return result.rows[0] ? toApplicationRecord(result.rows[0]) : null;
      } catch (error) {
        return translateSqlError(error, 'applications', `Statut « ${status} » refusé pour la candidature ${applicationId}.`);
      }
    },
  };
}

interface ContractRow {
  id: string;
  offer_id: string | null;
  application_id: string | null;
  employer_id: string;
  candidate_id: string;
  status: ContractRecord['status'];
  monthly_salary: unknown;
  currency: string;
  start_date: unknown;
  end_date: unknown;
  current_month: number;
  duration_months: number;
  periodicity: string;
  mission_description: string;
  location: string;
  conditions: unknown;
  additional_notes: string | null;
  employer_signed: boolean;
  employee_signed: boolean;
  employer_signed_at: unknown;
  employee_signed_at: unknown;
  commission_percentage: unknown;
  commission_amount_due: unknown;
  commission_status: ContractRecord['commissionStatus'];
  monthly_checkpoints: unknown;
  commission_ledger: unknown;
  payment_schedule: unknown;
  history: unknown;
  replacement_id: string | null;
  replaced_contract_id: string | null;
  incident_id: string | null;
  created_at: unknown;
  updated_at: unknown;
}

function toContractRow(row: ContractRow): ContractRecord {
  return {
    id: row.id,
    offerId: row.offer_id ?? '',
    employerId: row.employer_id,
    employeeId: row.candidate_id,
    status: row.status,
    monthlySalary: readNumeric(row.monthly_salary),
    currency: row.currency,
    startDate: readDate(row.start_date),
    currentMonth: row.current_month,
    durationMonths: row.duration_months,
    periodicity: row.periodicity,
    missionDescription: row.mission_description,
    location: row.location,
    conditions: readJsonArray<string>(row.conditions, 'contracts', 'conditions', []),
    employerSigned: row.employer_signed,
    employeeSigned: row.employee_signed,
    commissionPercentage: readNumeric(row.commission_percentage),
    commissionAmountDue: readNumeric(row.commission_amount_due),
    commissionStatus: row.commission_status,
    monthlyCheckpoints: readJsonArray<ContractRecord['monthlyCheckpoints'][number]>(row.monthly_checkpoints, 'contracts', 'monthly_checkpoints', []),
    commissionLedger: readJsonArray<ContractRecord['commissionLedger'][number]>(row.commission_ledger, 'contracts', 'commission_ledger', []),
    paymentSchedule: readJsonArray<ContractRecord['paymentSchedule'][number]>(row.payment_schedule, 'contracts', 'payment_schedule', []),
    history: readJsonArray<ContractRecord['history'][number]>(row.history, 'contracts', 'history', []),
    createdAt: readTimestamp(row.created_at),
    updatedAt: readTimestamp(row.updated_at),
    ...(readNullableString(row.application_id) !== undefined ? { applicationId: readNullableString(row.application_id) } : {}),
    ...(readNullableDate(row.end_date) !== undefined ? { endDate: readNullableDate(row.end_date) } : {}),
    ...(readNullableString(row.additional_notes) !== undefined ? { additionalNotes: readNullableString(row.additional_notes) } : {}),
    ...(readNullableTimestamp(row.employer_signed_at) !== undefined ? { employerSignedAt: readNullableTimestamp(row.employer_signed_at) } : {}),
    ...(readNullableTimestamp(row.employee_signed_at) !== undefined ? { employeeSignedAt: readNullableTimestamp(row.employee_signed_at) } : {}),
    ...(readNullableString(row.replacement_id) !== undefined ? { replacementId: readNullableString(row.replacement_id) } : {}),
    ...(readNullableString(row.replaced_contract_id) !== undefined ? { replacedContractId: readNullableString(row.replaced_contract_id) } : {}),
    ...(readNullableString(row.incident_id) !== undefined ? { incidentId: readNullableString(row.incident_id) } : {}),
  };
}

export function createSqlContractStore(db: PostgreSqlDatabase): ContractStore {
  return {
    async create(record) {
      assertStatusDomain(record.status, CONTRACT_STATUS_VALUES, 'contracts');
      let result: SqlQueryResult<ContractRow>;
      try {
        result = await db.query<ContractRow>(
        `INSERT INTO contracts (
           id, offer_id, application_id, employer_id, candidate_id, status,
           monthly_salary, currency, start_date, end_date, current_month, duration_months,
           periodicity, mission_description, location, conditions, additional_notes,
           employer_signed, employee_signed, employer_signed_at, employee_signed_at,
           commission_percentage, commission_amount_due, commission_status,
           monthly_checkpoints, commission_ledger, payment_schedule, history,
           replacement_id, replaced_contract_id, incident_id, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16::jsonb, $17,
           $18, $19, $20, $21,
           $22, $23, $24,
           $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb,
           $29, $30, $31, $32, $33
         ) RETURNING *`,
        [
          record.id,
          record.offerId,
          record.applicationId ?? null,
          record.employerId,
          record.employeeId,
          record.status,
          record.monthlySalary,
          record.currency,
          record.startDate,
          record.endDate ?? null,
          record.currentMonth,
          record.durationMonths,
          record.periodicity,
          record.missionDescription,
          record.location,
          JSON.stringify(record.conditions ?? []),
          record.additionalNotes ?? null,
          record.employerSigned === true,
          record.employeeSigned === true,
          record.employerSignedAt ?? null,
          record.employeeSignedAt ?? null,
          record.commissionPercentage,
          record.commissionAmountDue,
          record.commissionStatus,
          JSON.stringify(record.monthlyCheckpoints ?? []),
          JSON.stringify(record.commissionLedger ?? []),
          JSON.stringify(record.paymentSchedule ?? []),
          JSON.stringify(record.history ?? []),
          record.replacementId ?? null,
          record.replacedContractId ?? null,
          record.incidentId ?? null,
          record.createdAt,
          record.updatedAt,
        ],
        );
      } catch (error) {
        return translateSqlError(error, 'contracts', `Contrat ${record.id} déjà persisté.`);
      }
      return toContractRow(result.rows[0]);
    },

    async findById(contractId) {
      const result = await db.query<ContractRow>('SELECT * FROM contracts WHERE id = $1', [contractId]);
      return result.rows[0] ? toContractRow(result.rows[0]) : null;
    },

    async listByEmployer(employerId, limit) {
      const result = await db.query<ContractRow>(
        'SELECT * FROM contracts WHERE employer_id = $1 ORDER BY updated_at DESC, id ASC LIMIT $2',
        [employerId, clampStoreLimit(limit)],
      );
      return result.rows.map(toContractRow);
    },

    async listByEmployee(employeeId, limit) {
      const result = await db.query<ContractRow>(
        'SELECT * FROM contracts WHERE candidate_id = $1 ORDER BY updated_at DESC, id ASC LIMIT $2',
        [employeeId, clampStoreLimit(limit)],
      );
      return result.rows.map(toContractRow);
    },

    async updateStatus(contractId, status, updatedAt) {
      assertStatusDomain(status, CONTRACT_STATUS_VALUES, 'contracts');
      try {
        const result = await db.query<ContractRow>(
          'UPDATE contracts SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *',
          [contractId, status, updatedAt],
        );
        return result.rows[0] ? toContractRow(result.rows[0]) : null;
      } catch (error) {
        return translateSqlError(error, 'contracts', `Statut « ${status} » refusé pour le contrat ${contractId}.`);
      }
    },
  };
}

interface ProposalRow {
  id: string;
  conversation_id: string;
  contract_id: string | null;
  offer_id: string;
  application_id: string | null;
  employer_id: string;
  employee_id: string;
  mission_title: string;
  amount: unknown;
  currency: string;
  periodicity: ProposalRecord['periodicity'];
  start_date: string;
  end_date: string | null;
  duration_months: number;
  location: string;
  conditions: unknown;
  status: ProposalRecord['status'];
  revision_notes: string | null;
  sent_at: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function toProposalRecord(row: ProposalRow): ProposalRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    offerId: row.offer_id,
    employerId: row.employer_id,
    employeeId: row.employee_id,
    missionTitle: row.mission_title,
    amount: readNumeric(row.amount),
    currency: row.currency,
    periodicity: row.periodicity,
    startDate: row.start_date,
    durationMonths: row.duration_months,
    location: row.location,
    conditions: readJsonArray<string>(row.conditions, 'proposals', 'conditions', []),
    status: row.status,
    sentAt: readTimestamp(row.sent_at),
    createdAt: readTimestamp(row.created_at),
    updatedAt: readTimestamp(row.updated_at),
    ...(readNullableString(row.contract_id) !== undefined ? { contractId: readNullableString(row.contract_id) } : {}),
    ...(readNullableString(row.application_id) !== undefined ? { applicationId: readNullableString(row.application_id) } : {}),
    ...(readNullableString(row.end_date) !== undefined ? { endDate: readNullableString(row.end_date) } : {}),
    ...(readNullableString(row.revision_notes) !== undefined ? { revisionNotes: readNullableString(row.revision_notes) } : {}),
  };
}

export function createSqlProposalStore(db: SqlQueryExecutor): ProposalStore {
  return {
    async create(record) {
      assertStatusDomain(record.status, PROPOSAL_STATUS_VALUES, 'proposals');
      try {
        const result = await db.query<ProposalRow>(
          `INSERT INTO proposals (
             id, conversation_id, contract_id, offer_id, application_id,
             employer_id, employee_id, mission_title, amount, currency, periodicity,
             start_date, end_date, duration_months, location, conditions,
             status, revision_notes, sent_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16::jsonb,
             $17, $18, $19, $20, $21
           ) RETURNING *`,
          [
            record.id,
            record.conversationId,
            record.contractId ?? null,
            record.offerId,
            record.applicationId ?? null,
            record.employerId,
            record.employeeId,
            record.missionTitle,
            record.amount,
            record.currency,
            record.periodicity,
            record.startDate,
            record.endDate ?? null,
            record.durationMonths,
            record.location,
            JSON.stringify(record.conditions ?? []),
            record.status,
            record.revisionNotes ?? null,
            record.sentAt,
            record.createdAt,
            record.updatedAt,
          ],
        );
        return toProposalRecord(result.rows[0]);
      } catch (error) {
        return translateSqlError(error, 'proposals', `Proposition ${record.id} déjà persistée.`);
      }
    },

    async findById(proposalId) {
      const result = await db.query<ProposalRow>('SELECT * FROM proposals WHERE id = $1', [proposalId]);
      return result.rows[0] ? toProposalRecord(result.rows[0]) : null;
    },

    async findByIdForUpdate(proposalId) {
      // Verrou de ligne réel : deux réponses (ou une réponse et une expiration)
      // concurrentes sur la même proposition sont sérialisées par PostgreSQL.
      const result = await db.query<ProposalRow>(
        'SELECT * FROM proposals WHERE id = $1 FOR UPDATE',
        [proposalId],
      );
      return result.rows[0] ? toProposalRecord(result.rows[0]) : null;
    },

    async compareAndSetStatus(proposalId, expectedStatus, patch) {
      assertStatusDomain(patch.status, PROPOSAL_STATUS_VALUES, 'proposals');
      assertStatusDomain(expectedStatus, PROPOSAL_STATUS_VALUES, 'proposals');
      try {
        const result = await db.query<ProposalRow>(
          `UPDATE proposals
              SET status = $2,
                  updated_at = $3,
                  revision_notes = COALESCE($4, revision_notes)
            WHERE id = $1
              AND status = $5
          RETURNING *`,
          [
            proposalId,
            patch.status,
            patch.updatedAt,
            patch.revisionNotes ?? null,
            expectedStatus,
          ],
        );
        return result.rows[0] ? toProposalRecord(result.rows[0]) : null;
      } catch (error) {
        return translateSqlError(
          error,
          'proposals',
          `Statut « ${patch.status} » refusé pour la proposition ${proposalId}.`,
        );
      }
    },

    async listAll(limit, afterId) {
      const bounded = clampStoreLimit(limit);
      const result = afterId
        ? await db.query<ProposalRow>(
            `SELECT *
               FROM proposals
              WHERE (sent_at, id) < (
                SELECT c.sent_at, c.id FROM proposals AS c WHERE c.id = $1
              )
              ORDER BY sent_at DESC, id ASC
              LIMIT $2`,
            [afterId, bounded],
          )
        : await db.query<ProposalRow>(
            'SELECT * FROM proposals ORDER BY sent_at DESC, id ASC LIMIT $1',
            [bounded],
          );
      return result.rows.map(toProposalRecord);
    },
  };
}

export function createSqlCoreStores(db: PostgreSqlDatabase): CoreStores {
  return {
    offers: createSqlOfferStore(db),
    applications: createSqlApplicationStore(db),
    contracts: createSqlContractStore(db),
    proposals: createSqlProposalStore(db),
    permissions: createSqlPermissionStore(db),
  };
}
