/**
 * LE LABEUR — P0-R2 — adaptateur PostgreSQL documentaire (migration 0016).
 *
 * Une seule responsabilité : les tables `documents`, `document_versions`,
 * `document_entity_links` et `document_retention_policies`, plus la LECTURE
 * des entités existantes nécessaire au contrôle d'accès et aux vérifications
 * d'acceptation (`DocumentAccessReader` — aucune écriture hors des tables R2).
 *
 * Toutes les garanties structurelles (unicité de version, déduplication des
 * liens, complétude des statuts, hash SHA-256) sont portées par la base : cet
 * adaptateur ne contourne jamais une contrainte, il la sert.
 */

import type { SqlQueryExecutor } from '../services/database';
import type {
  DocumentAdminQuery,
  DocumentEntityLinkRecord,
  DocumentHistoryEntry,
  DocumentLinkStore,
  DocumentListQuery,
  DocumentRecord,
  DocumentRetentionPolicyRecord,
  DocumentRetentionStore,
  DocumentAccessReader,
  DocumentStore,
  DocumentVersionRecord,
  DocumentVersionStore,
} from '../documents/records';
import type {
  DocumentContentType,
  DocumentEntityType,
  DocumentType,
  DocumentVersionStatus,
} from '../../domain/documentRules';
import { clampStoreLimit } from './coreRecords';

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505');
}

/* ------------------------------------------------------------------ */
/* documents                                                          */
/* ------------------------------------------------------------------ */

interface DocumentRow {
  document_id: string;
  owner_user_id: string;
  title: string;
  file_name: string;
  document_type: string;
  purpose_note: string | null;
  retention_class: string;
  status: string;
  current_version_number: number;
  history: DocumentHistoryEntry[] | null;
  created_at: string | Date;
  created_by: string;
  revoked_at: string | Date | null;
  revoked_by: string | null;
  revocation_reason: string | null;
}

function toDocument(row: DocumentRow): DocumentRecord {
  return {
    documentId: row.document_id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    fileName: row.file_name,
    documentType: row.document_type as DocumentType,
    ...(row.purpose_note ? { purposeNote: row.purpose_note } : {}),
    retentionClass: row.retention_class as DocumentRecord['retentionClass'],
    status: row.status as DocumentRecord['status'],
    currentVersionNumber: Number(row.current_version_number),
    history: Array.isArray(row.history) ? row.history : [],
    createdAt: timestamp(row.created_at),
    createdBy: row.created_by,
    ...(row.revoked_at ? { revokedAt: timestamp(row.revoked_at) } : {}),
    ...(row.revoked_by ? { revokedBy: row.revoked_by } : {}),
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}),
  };
}

export function createSqlDocumentStore(db: SqlQueryExecutor): DocumentStore {
  const findById = async (documentId: string, lock: boolean): Promise<DocumentRecord | null> => {
    const result = await db.query<DocumentRow>(
      `SELECT * FROM documents WHERE document_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [documentId],
    );
    return result.rows[0] ? toDocument(result.rows[0]) : null;
  };

  return {
    async create(record) {
      const result = await db.query<DocumentRow>(
        `INSERT INTO documents (
           document_id, owner_user_id, title, file_name, document_type,
           purpose_note, retention_class, status, current_version_number,
           history, created_at, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',0,'[]'::jsonb,$8,$9)
         RETURNING *`,
        [
          record.documentId,
          record.ownerUserId,
          record.title,
          record.fileName,
          record.documentType,
          record.purposeNote ?? null,
          record.retentionClass,
          record.createdAt,
          record.createdBy,
        ],
      );
      return toDocument(result.rows[0]);
    },

    findById(documentId) {
      return findById(documentId, false);
    },

    findByIdForUpdate(documentId) {
      return findById(documentId, true);
    },

    async listForOwner(ownerUserId, query: DocumentListQuery) {
      const limit = clampStoreLimit(query.limit, 50);
      const values: unknown[] = [ownerUserId];
      let keyset = '';
      if (query.afterId) {
        const cursor = await db.query<{ created_at: string | Date }>(
          'SELECT created_at FROM documents WHERE document_id = $1 AND owner_user_id = $2',
          [query.afterId, ownerUserId],
        );
        const row = cursor.rows[0];
        if (row) {
          values.push(timestamp(row.created_at), query.afterId);
          keyset = 'AND (created_at < $2 OR (created_at = $2 AND document_id > $3))';
        }
      }
      values.push(limit);
      const result = await db.query<DocumentRow>(
        `SELECT * FROM documents
          WHERE owner_user_id = $1 ${keyset}
          ORDER BY created_at DESC, document_id ASC
          LIMIT $${values.length}`,
        values,
      );
      return result.rows.map(toDocument);
    },

    async listAll(query: DocumentAdminQuery) {
      const limit = clampStoreLimit(query.limit, 50);
      const clauses: string[] = [];
      const values: unknown[] = [];
      let index = 1;
      if (query.ownerUserId) {
        clauses.push(`owner_user_id = $${index++}`);
        values.push(query.ownerUserId);
      }
      if (query.documentType) {
        clauses.push(`document_type = $${index++}`);
        values.push(query.documentType);
      }
      if (query.status) {
        clauses.push(`status = $${index++}`);
        values.push(query.status);
      }
      if (query.afterId) {
        const cursor = await db.query<{ created_at: string | Date }>(
          'SELECT created_at FROM documents WHERE document_id = $1',
          [query.afterId],
        );
        const row = cursor.rows[0];
        if (row) {
          clauses.push(`(created_at < $${index} OR (created_at = $${index} AND document_id > $${index + 1}))`);
          values.push(timestamp(row.created_at), query.afterId);
          index += 2;
        }
      }
      values.push(limit);
      const result = await db.query<DocumentRow>(
        `SELECT * FROM documents
          ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
          ORDER BY created_at DESC, document_id ASC
          LIMIT $${index}`,
        values,
      );
      return result.rows.map(toDocument);
    },

    async advanceCurrentVersion(documentId, versionNumber) {
      await db.query(
        `UPDATE documents
            SET current_version_number = GREATEST(current_version_number, $2)
          WHERE document_id = $1`,
        [documentId, versionNumber],
      );
    },

    async appendHistory(documentId, historyEntry) {
      await db.query(
        `UPDATE documents
            SET history = history || $2::jsonb
          WHERE document_id = $1`,
        [documentId, JSON.stringify([historyEntry])],
      );
    },

    async compareAndSetRevocation(input) {
      const result = await db.query<DocumentRow>(
        `UPDATE documents
            SET status = 'REVOKED',
                revoked_at = $2,
                revoked_by = $3,
                revocation_reason = $4,
                history = history || $5::jsonb
          WHERE document_id = $1
            AND status = 'ACTIVE'
          RETURNING *`,
        [input.documentId, input.at, input.actorId, input.reason, JSON.stringify([input.historyEntry])],
      );
      return result.rows[0] ? toDocument(result.rows[0]) : null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* document_versions                                                  */
/* ------------------------------------------------------------------ */

interface DocumentVersionRow {
  version_id: string;
  document_id: string;
  version_number: number;
  object_key: string;
  content_type: string;
  declared_size_bytes: number;
  size_bytes: number | null;
  cryptographic_hash: string | null;
  hash_algorithm: string;
  provenance: string;
  status: string;
  created_at: string | Date;
  created_by: string;
  registered_at: string | Date | null;
  revoked_at: string | Date | null;
  revoked_by: string | null;
  revocation_reason: string | null;
}

function toVersion(row: DocumentVersionRow): DocumentVersionRecord {
  return {
    versionId: row.version_id,
    documentId: row.document_id,
    versionNumber: Number(row.version_number),
    objectKey: row.object_key,
    contentType: row.content_type as DocumentContentType,
    declaredSizeBytes: Number(row.declared_size_bytes),
    ...(row.size_bytes !== null ? { sizeBytes: Number(row.size_bytes) } : {}),
    ...(row.cryptographic_hash ? { cryptographicHash: row.cryptographic_hash } : {}),
    hashAlgorithm: 'SHA-256',
    provenance: row.provenance as DocumentVersionRecord['provenance'],
    status: row.status as DocumentVersionStatus,
    createdAt: timestamp(row.created_at),
    createdBy: row.created_by,
    ...(row.registered_at ? { registeredAt: timestamp(row.registered_at) } : {}),
    ...(row.revoked_at ? { revokedAt: timestamp(row.revoked_at) } : {}),
    ...(row.revoked_by ? { revokedBy: row.revoked_by } : {}),
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}),
  };
}

export function createSqlDocumentVersionStore(db: SqlQueryExecutor): DocumentVersionStore {
  const findById = async (versionId: string, lock: boolean): Promise<DocumentVersionRecord | null> => {
    const result = await db.query<DocumentVersionRow>(
      `SELECT * FROM document_versions WHERE version_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [versionId],
    );
    return result.rows[0] ? toVersion(result.rows[0]) : null;
  };

  return {
    async create(record) {
      const result = await db.query<DocumentVersionRow>(
        `INSERT INTO document_versions (
           version_id, document_id, version_number, object_key, content_type,
           declared_size_bytes, hash_algorithm, provenance, status,
           created_at, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'SHA-256',$7,'PENDING_UPLOAD',$8,$9)
         RETURNING *`,
        [
          record.versionId,
          record.documentId,
          record.versionNumber,
          record.objectKey,
          record.contentType,
          record.declaredSizeBytes,
          record.provenance,
          record.createdAt,
          record.createdBy,
        ],
      );
      return toVersion(result.rows[0]);
    },

    findById(versionId) {
      return findById(versionId, false);
    },

    findByIdForUpdate(versionId) {
      return findById(versionId, true);
    },

    async findByDocumentAndNumber(documentId, versionNumber) {
      const result = await db.query<DocumentVersionRow>(
        'SELECT * FROM document_versions WHERE document_id = $1 AND version_number = $2',
        [documentId, versionNumber],
      );
      return result.rows[0] ? toVersion(result.rows[0]) : null;
    },

    async listForDocument(documentId) {
      const result = await db.query<DocumentVersionRow>(
        `SELECT * FROM document_versions
          WHERE document_id = $1
          ORDER BY version_number ASC, version_id ASC`,
        [documentId],
      );
      return result.rows.map(toVersion);
    },

    async nextVersionNumber(documentId) {
      const result = await db.query<{ next: number }>(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next
           FROM document_versions
          WHERE document_id = $1`,
        [documentId],
      );
      return Number(result.rows[0]?.next ?? 1);
    },

    async registerContent(input) {
      const result = await db.query<DocumentVersionRow>(
        `UPDATE document_versions
            SET status = 'ACTIVE',
                size_bytes = $2,
                cryptographic_hash = $3,
                registered_at = $4
          WHERE version_id = $1
            AND status = 'PENDING_UPLOAD'
          RETURNING *`,
        [input.versionId, input.sizeBytes, input.cryptographicHash, input.registeredAt],
      );
      return result.rows[0] ? toVersion(result.rows[0]) : null;
    },

    async compareAndSetRevocation(input) {
      const result = await db.query<DocumentVersionRow>(
        `UPDATE document_versions
            SET status = 'REVOKED',
                revoked_at = $2,
                revoked_by = $3,
                revocation_reason = $4
          WHERE version_id = $1
            AND status = 'ACTIVE'
          RETURNING *`,
        [input.versionId, input.at, input.actorId, input.reason],
      );
      return result.rows[0] ? toVersion(result.rows[0]) : null;
    },

    async countActiveLinkedToDocument(documentId) {
      const result = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM document_versions
          WHERE document_id = $1 AND status = 'ACTIVE'`,
        [documentId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },
  };
}

/* ------------------------------------------------------------------ */
/* document_entity_links                                              */
/* ------------------------------------------------------------------ */

interface DocumentLinkRow {
  link_id: string;
  document_id: string;
  document_version_id: string;
  entity_type: string;
  entity_id: string;
  link_purpose: string;
  related_actor_id: string | null;
  related_event_ref: string | null;
  accepted_at: string | Date | null;
  note: string | null;
  created_at: string | Date;
  created_by: string;
}

function toLink(row: DocumentLinkRow): DocumentEntityLinkRecord {
  return {
    linkId: row.link_id,
    documentId: row.document_id,
    documentVersionId: row.document_version_id,
    entityType: row.entity_type as DocumentEntityType,
    entityId: row.entity_id,
    linkPurpose: row.link_purpose as DocumentEntityLinkRecord['linkPurpose'],
    ...(row.related_actor_id ? { relatedActorId: row.related_actor_id } : {}),
    ...(row.related_event_ref ? { relatedEventRef: row.related_event_ref } : {}),
    ...(row.accepted_at ? { acceptedAt: timestamp(row.accepted_at) } : {}),
    ...(row.note ? { note: row.note } : {}),
    createdAt: timestamp(row.created_at),
    createdBy: row.created_by,
  };
}

export function createSqlDocumentLinkStore(db: SqlQueryExecutor): DocumentLinkStore {
  return {
    async createIfAbsent(record) {
      try {
        const inserted = await db.query<DocumentLinkRow>(
          `INSERT INTO document_entity_links (
             link_id, document_id, document_version_id, entity_type, entity_id,
             link_purpose, related_actor_id, related_event_ref, accepted_at,
             note, created_at, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           -- Sans cible explicite : les index d'unicité sont partiels (dédoublonnage des
           -- liens d'acceptation par signataire), Postgres choisit alors l'index applicable.
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [
            record.linkId,
            record.documentId,
            record.documentVersionId,
            record.entityType,
            record.entityId,
            record.linkPurpose,
            record.relatedActorId ?? null,
            record.relatedEventRef ?? null,
            record.acceptedAt ?? null,
            record.note ?? null,
            record.createdAt,
            record.createdBy,
          ],
        );
        if (inserted.rows[0]) return { kind: 'created' as const, link: toLink(inserted.rows[0]) };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      // L'unicité des liens d'acceptation inclut le signataire (index partiels).
      const existing = record.linkPurpose === 'ACCEPTANCE_PROOF'
        ? await db.query<DocumentLinkRow>(
            `SELECT * FROM document_entity_links
              WHERE document_version_id = $1 AND entity_type = $2 AND entity_id = $3
                AND link_purpose = $4 AND related_actor_id IS NOT DISTINCT FROM $5`,
            [record.documentVersionId, record.entityType, record.entityId, record.linkPurpose, record.relatedActorId ?? null],
          )
        : await db.query<DocumentLinkRow>(
            `SELECT * FROM document_entity_links
              WHERE document_version_id = $1 AND entity_type = $2 AND entity_id = $3 AND link_purpose = $4`,
            [record.documentVersionId, record.entityType, record.entityId, record.linkPurpose],
          );
      const row = existing.rows[0];
      if (!row) throw new Error('Lien documentaire introuvable après collision d’unicité.');
      return { kind: 'duplicate' as const, link: toLink(row) };
    },

    async listForDocument(documentId) {
      const result = await db.query<DocumentLinkRow>(
        `SELECT * FROM document_entity_links
          WHERE document_id = $1
          ORDER BY created_at ASC, link_id ASC`,
        [documentId],
      );
      return result.rows.map(toLink);
    },

    async listForVersion(documentVersionId) {
      const result = await db.query<DocumentLinkRow>(
        `SELECT * FROM document_entity_links
          WHERE document_version_id = $1
          ORDER BY created_at ASC, link_id ASC`,
        [documentVersionId],
      );
      return result.rows.map(toLink);
    },

    async listForEntity(entityType, entityId, limit) {
      const bounded = clampStoreLimit(limit, 50);
      const result = await db.query<DocumentLinkRow>(
        `SELECT * FROM document_entity_links
          WHERE entity_type = $1 AND entity_id = $2
          ORDER BY created_at DESC, link_id ASC
          LIMIT $3`,
        [entityType, entityId, bounded],
      );
      return result.rows.map(toLink);
    },

    async countAcceptanceLinksForVersion(documentVersionId) {
      const result = await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM document_entity_links
          WHERE document_version_id = $1 AND link_purpose = 'ACCEPTANCE_PROOF'`,
        [documentVersionId],
      );
      return Number(result.rows[0]?.count ?? 0);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Lecteur d'accès — entités EXISTANTES, lecture seule, strictement bornée */
/* ------------------------------------------------------------------ */

export function createSqlDocumentAccessReader(db: SqlQueryExecutor): DocumentAccessReader {
  const pair = async (sql: string, values: readonly unknown[]): Promise<readonly string[] | null> => {
    const result = await db.query<{ a: string; b: string | null }>(sql, values);
    const row = result.rows[0];
    if (!row) return null;
    return row.b ? [row.a, row.b] : [row.a];
  };

  return {
    entityPartyIds(entityType, entityId) {
      switch (entityType) {
        case 'CONTRACT':
          return pair('SELECT employer_id AS a, candidate_id AS b FROM contracts WHERE id = $1', [entityId]);
        case 'PROPOSAL':
          return pair('SELECT employer_id AS a, employee_id AS b FROM proposals WHERE id = $1', [entityId]);
        case 'CLAIM':
          return pair('SELECT claimant_id AS a, respondent_id AS b FROM claims WHERE claim_id = $1', [entityId]);
        case 'REPLACEMENT':
          return pair('SELECT employer_id AS a, selected_candidate_id AS b FROM replacements WHERE replacement_id = $1', [entityId]);
        case 'PAYMENT':
          return pair('SELECT employer_id AS a, candidate_id AS b FROM payments WHERE id = $1', [entityId]);
        case 'SALARY_CONFIRMATION':
          return pair('SELECT employer_id AS a, candidate_id AS b FROM salary_confirmations WHERE payment_id = $1', [entityId]);
        case 'USER':
          return pair('SELECT id AS a, NULL AS b FROM users WHERE id = $1', [entityId]);
      }
    },

    async contractSignatureAt(contractId, signerId) {
      const result = await db.query<{
        employer_id: string;
        candidate_id: string;
        employer_signed: boolean;
        employee_signed: boolean;
        employer_signed_at: string | Date | null;
        employee_signed_at: string | Date | null;
      }>(
        `SELECT employer_id, candidate_id, employer_signed, employee_signed,
                employer_signed_at, employee_signed_at
           FROM contracts WHERE id = $1`,
        [contractId],
      );
      const row = result.rows[0];
      if (!row) return null;
      if (row.employer_id === signerId && row.employer_signed && row.employer_signed_at) {
        return timestamp(row.employer_signed_at);
      }
      if (row.candidate_id === signerId && row.employee_signed && row.employee_signed_at) {
        return timestamp(row.employee_signed_at);
      }
      return null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Politiques de conservation (lecture seule dans cette tranche)        */
/* ------------------------------------------------------------------ */

interface RetentionRow {
  document_type: string;
  retention_class: string;
  retention_days: number | null;
  duration_status: string;
  configured_by: string | null;
  configured_at: string | Date | null;
}

function toPolicy(row: RetentionRow): DocumentRetentionPolicyRecord {
  return {
    documentType: row.document_type as DocumentType,
    retentionClass: row.retention_class as DocumentRetentionPolicyRecord['retentionClass'],
    retentionDays: row.retention_days === null ? null : Number(row.retention_days),
    durationStatus: row.duration_status as DocumentRetentionPolicyRecord['durationStatus'],
    ...(row.configured_by ? { configuredBy: row.configured_by } : {}),
    ...(row.configured_at ? { configuredAt: timestamp(row.configured_at) } : {}),
  };
}

export function createSqlDocumentRetentionStore(db: SqlQueryExecutor): DocumentRetentionStore {
  return {
    async getPolicy(documentType) {
      const result = await db.query<RetentionRow>(
        'SELECT * FROM document_retention_policies WHERE document_type = $1',
        [documentType],
      );
      return result.rows[0] ? toPolicy(result.rows[0]) : null;
    },
    async listPolicies() {
      const result = await db.query<RetentionRow>(
        'SELECT * FROM document_retention_policies ORDER BY document_type ASC',
      );
      return result.rows.map(toPolicy);
    },
  };
}
