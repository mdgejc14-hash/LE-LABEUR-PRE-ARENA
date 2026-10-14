/**
 * P0-R2 — tests Worker/API → PostgreSQL de la brique DOCUMENTS & PREUVES.
 *
 * Ce que ces tests démontrent, sur PostgreSQL RÉEL (PGlite) et un adaptateur
 * objet local déterministe injecté (jamais de production simulée) :
 *   - création/upload, métadonnées correctes, empreinte SHA-256 mesurée ;
 *   - versionnement APPEND-ONLY (v2 ne remplace jamais v1), récupération de la
 *     bonne version, immutabilité du contenu enregistré ;
 *   - intégrité : recalcul à la vérification et à chaque téléchargement
 *     (contenu altéré = diffusion refusée) ;
 *   - liens version ↔ entité métier : contrat, acceptation rattachée à la
 *     version EXACTE et à une signature RÉELLE existante ;
 *   - ownership / permissions / anti-IDOR : aucun accès à la seule connaissance
 *     d'un identifiant ; `object_key` n'apparaît dans AUCUNE réponse ;
 *   - ADMIN avec permission existante (`documents:read:any`) ; ADMIN privé de
 *     la permission (role_permissions retirée) : refus — et rétablissement via
 *     grant `user_permissions` : accès — le RBAC réel tranche ;
 *   - révocation ADMIN motivée, auditée, historique append-only, acceptations
 *     préservées ; aucune suppression physique exposée (DELETE = 405) ;
 *   - rétention : classification par type semée, durées NULL en attendant la
 *     validation juridique (aucune durée inventée) ;
 *   - garde-fous : aucune formulation interdite, aucune logique financière,
 *     aucune importation de payments/réputation/matching/notifications dans la
 *     brique ; non-régression des suites existantes (elles tournent dans le
 *     même `npm test`).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
  type TestHarness,
} from './offers.test';
import { createSqlContractStore, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import type { ContractRecord, OfferRecord } from '../persistence/coreRecords';
import { EXPECTED_MIGRATION_IDS } from '../persistence/migrationManifest';
import { createInMemoryObjectStorage, createR2BucketObjectStorage, type InMemoryObjectStorage, type R2BucketLike } from '../documents/storage';
import { sha256Hex, createDocumentUrlSigner } from '../documents/hash';
import {
  DOCUMENT_FINANCIAL_DENYLIST,
  DOCUMENT_TYPES,
  DOCUMENT_WORDING_DENYLIST,
  MAX_DOCUMENT_CONTENT_BYTES,
  RETENTION_CLASSES,
  TRACEABILITY_ATTESTATION_LABEL,
  findDocumentLinkRuleViolation,
  linkPurposesForDocumentType,
} from '../../domain/documentRules';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');
const R2_SOURCES = [
  'migrations/0016_documents.sql',
  'src/backend/documents/records.ts',
  'src/backend/documents/documentRepository.ts',
  'src/backend/documents/storage.ts',
  'src/backend/documents/hash.ts',
  'src/backend/persistence/sqlDocumentStores.ts',
];
const SEED_TIMESTAMP = '2026-10-05T14:00:00.000Z';
const SIGNING_SECRET = 'test-only-document-url-signing-secret-0123456789';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function bytesOf(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

function post(harness: TestHarness, path: string, token: string, key: string, body: unknown) {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  }));
}

function get(harness: TestHarness, path: string, token: string) {
  return harness.worker.fetch(authRequest(path, token));
}

function uploadBytes(harness: TestHarness, path: string, token: string, key: string, contentType: string, bytes: Uint8Array) {
  return harness.worker.fetch(authRequest(path, token, {
    method: 'POST',
    headers: { 'content-type': contentType, 'Idempotency-Key': key },
    body: new Uint8Array(bytes),
  }));
}

async function jsonOf<T>(response: Response): Promise<T> {
  assert(response.status < 400, `réponse attendue < 400, reçue ${response.status}: ${await response.clone().text()}`);
  return response.json() as Promise<T>;
}

function makeOffer(id: string, employerId: string): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre ${id}`,
    contractType: 'CDI',
    remuneration: 150_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_TIMESTAMP,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre de test P0-R2.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

/** Contrat RÉEL signé des deux côtés (signatures existantes, dates présentes). */
async function seedSignedContract(harness: TestHarness, employerId: string, candidateId: string): Promise<ContractRecord> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, employerId));
  const record: ContractRecord = {
    id: newEntityId('ctr'),
    offerId,
    employerId,
    employeeId: candidateId,
    status: 'ACTIVE',
    monthlySalary: 175_000,
    currency: 'FCFA',
    startDate: '01 Novembre 2026',
    currentMonth: 1,
    durationMonths: 6,
    periodicity: 'Mensuel',
    missionDescription: 'Mission de test P0-R2',
    location: 'Cotonou',
    conditions: ['Temps plein'],
    employerSigned: true,
    employeeSigned: true,
    employerSignedAt: '2026-10-02T09:00:00.000Z',
    employeeSignedAt: '2026-10-03T10:00:00.000Z',
    commissionPercentage: 25,
    commissionAmountDue: 0,
    commissionStatus: 'SCHEDULED',
    monthlyCheckpoints: [],
    commissionLedger: [],
    paymentSchedule: [],
    history: [],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
  await createSqlContractStore(harness.database).create(record);
  return record;
}

async function provisionAdmin(harness: TestHarness, tag: string): Promise<{ userId: string; token: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = harness.clock.value.toISOString();
  const expiresAt = new Date(harness.clock.value.getTime() + 3_600_000).toISOString();
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async transaction => {
    await transaction.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.documents.${tag}.${userId}@example.com`,
      displayName: `Admin P0-R2 ${tag}`,
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { userId, token };
}

interface GrantBody {
  document: {
    documentId: string;
    ownerUserId: string;
    title: string;
    fileName: string;
    documentType: string;
    purposeNote?: string;
    status: string;
    currentVersionNumber: number;
    retention: { retentionClass: string; durationStatus: string; retentionDays: number | null };
    createdAt: string;
    createdBy: string;
    revokedBy?: string;
  };
  version: {
    versionId: string;
    versionNumber: number;
    contentType: string;
    declaredSizeBytes: number;
    sizeBytes?: number;
    cryptographicHash?: string;
    hashAlgorithm: string;
    provenance: string;
    status: string;
    registeredAt?: string;
    revokedAt?: string;
    revokedBy?: string;
    revocationReason?: string;
    retainUntil: string | null;
  };
  upload: { url: string; method: string; contentType: string; expectedSizeBytes: number };
}

const CONTRACT_META = (content: string) => ({
  title: 'Contrat de mission',
  fileName: 'contrat.pdf',
  contentType: 'application/pdf',
  sizeBytes: bytesOf(content).length,
  documentType: 'CONTRACT_DOCUMENT',
});

async function createAndRegister(
  harness: TestHarness,
  token: string,
  tag: string,
  content: string,
  meta: Record<string, unknown> = {},
): Promise<GrantBody> {
  const grantResponse = await post(harness, '/api/v1/documents/upload-grants', token, `doc-grant-${tag}`, {
    ...CONTRACT_META(content),
    ...meta,
  });
  const grant = await jsonOf<GrantBody>(grantResponse);
  const uploadResponse = await uploadBytes(
    harness,
    grant.upload.url,
    token,
    `doc-content-${tag}`,
    grant.upload.contentType,
    bytesOf(content),
  );
  await jsonOf(uploadResponse);
  return grant;
}

async function auditActions(harness: TestHarness, entityId: string): Promise<string[]> {
  const result = await harness.database.query<{ action: string }>(
    `SELECT action FROM automation_audit_ledger
      WHERE entity_id = $1 AND source = 'api:P0-R2-DOCUMENTS'
      ORDER BY occurred_at ASC, id ASC`,
    [entityId],
  );
  return result.rows.map(row => row.action);
}

export async function runDocumentDomainTests(): Promise<OfferTestResult[]> {
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void> | void) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  /* ------------------------------------------------------------------ */
  /* Adaptateurs de stockage (sans Worker)                               */
  /* ------------------------------------------------------------------ */

  await check('P0-R2 stockage: adaptateur local — put/get/head/delete et absence', async () => {
    const storage = createInMemoryObjectStorage();
    const key = 'docs/test/obj';
    assert(!(await storage.get(key)), 'get sur absents doit renvoyer null');
    await storage.put(key, bytesOf('abc'), 'application/pdf');
    assert(storage.objectCount() === 1 && storage.has(key), 'objet attendu après put');
    const got = await storage.get(key);
    assert(got && got.size === 3 && got.contentType === 'application/pdf', 'get doit restituer le contenu');
    const head = await storage.head(key);
    assert(head && head.size === 3, 'head doit exposer la taille');
    await storage.put(key, bytesOf('s'.repeat(4)), 'application/pdf'); // put idempotent par clé
    assert((await storage.get(key))?.size === 4, 'put sur même clé remplace le contenu physique');
    await storage.delete(key);
    assert(!storage.has(key), 'delete doit retirer l’objet');
    await storage.delete(key); // delete idempotent
  });

  await check('P0-R2 stockage: adaptateur R2 structural — mapping du binding, présignature hors tranche', async () => {
    const calls: string[] = [];
    const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
    const fakeBucket: R2BucketLike = {
      async put(key, value, options) {
        calls.push(`put:${key}`);
        objects.set(key, { bytes: value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer), contentType: options?.httpMetadata?.contentType });
      },
      async get(key) {
        calls.push(`get:${key}`);
        const found = objects.get(key);
        if (!found) return null;
        return {
          size: found.bytes.length,
          httpMetadata: found.contentType ? { contentType: found.contentType } : undefined,
          arrayBuffer: async () => found.bytes.slice().buffer,
        };
      },
      async head(key) {
        const found = objects.get(key);
        return found ? { size: found.bytes.length } : null;
      },
      async delete(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
      },
    };
    const r2 = createR2BucketObjectStorage(fakeBucket);
    await r2.put('docs/a/b', bytesOf('pdf-v1'), 'application/pdf');
    const got = await r2.get('docs/a/b');
    assert(got && got.size === 6 && got.contentType === 'application/pdf', 'get R2 doit restituer contenu et type');
    assert((await r2.get('docs/absent')) === null, 'objet R2 absent → null');
    const head = await r2.head('docs/a/b');
    assert(head && head.size === 6, 'head R2 doit exposer la taille');
    await r2.delete('docs/a/b');
    assert((await r2.head('docs/a/b')) === null, 'delete R2 doit retirer l’objet');
    assert(calls.includes('put:docs/a/b') && calls.includes('get:docs/a/b'), 'les appels doivent passer par le binding');
    let presignRefused = false;
    try {
      await r2.createSignedDownloadUrl('docs/a/b', 60);
    } catch (error) {
      presignRefused = error instanceof Error && /CLOUDFLARE PRODUCTION/.test(error.message);
    }
    assert(presignRefused, 'la présignature R2 doit rester hors tranche (501 explicite)');
  });

  await check('P0-R2 signature HMAC: URL signée vérifiable, altération refusée', async () => {
    const signer = createDocumentUrlSigner(SIGNING_SECRET);
    const signature = await signer.sign('payload');
    assert(await signer.verify('payload', signature), 'la signature doit vérifier');
    assert(!(await signer.verify('payload-altérée', signature)), 'une charge altérée ne doit pas vérifier');
    let rejected = false;
    try {
      createDocumentUrlSigner('court');
    } catch {
      rejected = true;
    }
    assert(rejected, 'un secret trop court doit être refusé');
  });

  /* ------------------------------------------------------------------ */
  /* Garde-fous (sources)                                               */
  /* ------------------------------------------------------------------ */

  await check('P0-R2 garde-fous: libellé d’attestation exact, aucune formulation interdite dans les sources R2', () => {
    assert(TRACEABILITY_ATTESTATION_LABEL === 'Attestation électronique de traçabilité', 'libellé d’attestation exact requis');
    for (const relative of R2_SOURCES) {
      const content = readFileSync(resolve(REPO_ROOT, relative), 'utf8');
      for (const pattern of DOCUMENT_WORDING_DENYLIST) {
        assert(!pattern.test(content), `${relative}: formulation interdite (${pattern})`);
      }
    }
  });

  await check('P0-R2 garde-fous: aucune logique financière ni répartition dans la brique', () => {
    for (const relative of R2_SOURCES) {
      const content = readFileSync(resolve(REPO_ROOT, relative), 'utf8');
      for (const pattern of DOCUMENT_FINANCIAL_DENYLIST) {
        assert(!pattern.test(content), `${relative}: logique financière interdite (${pattern})`);
      }
    }
  });

  await check('P0-R2 garde-fous: la brique n’importe ni paiement, ni réputation, ni matching, ni notifications', () => {
    const forbidden = /from '\.\.?(?:\/\.\.)*\/(payments|reputation|matching|notifications|disputes)\//;
    for (const relative of [
      'src/backend/documents/records.ts',
      'src/backend/documents/documentRepository.ts',
      'src/backend/documents/storage.ts',
      'src/backend/documents/hash.ts',
      'src/domain/documentRules.ts',
    ]) {
      const content = readFileSync(resolve(REPO_ROOT, relative), 'utf8');
      assert(!forbidden.test(content), `${relative} ne doit rien importer de payments/reputation/matching/notifications/disputes`);
    }
  });

  await check('P0-R2 règles: matrice document ↔ lien pure et exhaustive', () => {
    for (const type of DOCUMENT_TYPES) {
      assert(linkPurposesForDocumentType(type).length > 0, `${type} doit avoir au moins une finalité de lien`);
    }
    assert(findDocumentLinkRuleViolation({ documentType: 'VERIFICATION_DOCUMENT', linkPurpose: 'CONTRACT_VERSION', entityType: 'CONTRACT' }) !== null, 'un document de vérification ne devient jamais version de contrat');
    assert(findDocumentLinkRuleViolation({ documentType: 'CONTRACT_DOCUMENT', linkPurpose: 'ACCEPTANCE_PROOF', entityType: 'PAYMENT' }) !== null, 'une acceptation ne vise qu’un contrat');
    assert(findDocumentLinkRuleViolation({ documentType: 'CONTRACT_DOCUMENT', linkPurpose: 'CONTRACT_VERSION', entityType: 'CONTRACT' }) === null, 'version de contrat sur contrat autorisée');
    assert(findDocumentLinkRuleViolation({ documentType: 'TRACEABILITY_ATTESTATION', linkPurpose: 'ATTESTATION', entityType: 'CONTRACT' }) === null, 'attestation de traçabilité liable au contrat');
    assert(findDocumentLinkRuleViolation({ documentType: 'EXECUTION_PROOF', linkPurpose: 'EXECUTION_PROOF', entityType: 'SALARY_CONFIRMATION' }) === null, 'preuve d’exécution liable à la confirmation salariale');
    assert(DOCUMENT_TYPES.length === 8 && RETENTION_CLASSES.length === 5, 'typologie et classes de conservation attendues');
  });

  await check('P0-R2 migrations: manifeste aligné, rétention documentaire sans durée inventée', async () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
    assert(files.length === EXPECTED_MIGRATION_IDS.length, 'le manifeste doit couvrir exactement les migrations du dépôt');
    // P0-WEBRTC 0018 vient après la dernière migration dédiée au domaine R2.
    assert(EXPECTED_MIGRATION_IDS[EXPECTED_MIGRATION_IDS.length - 1] === '0018_webrtc_sessions', '0018_webrtc_sessions doit être la dernière migration');
    const migration = readFileSync(resolve(MIGRATIONS_DIR, '0016_documents.sql'), 'utf8');
    assert(migration.includes('PENDING_LEGAL_VALIDATION'), 'durées en attente de validation juridique');
    assert(!/INSERT INTO document_retention_policies[^;]*retention_days[^;]*[0-9]/is.test(migration.replace(/retention_days\s+INTEGER[^,]*/i, '')), 'aucune durée ne doit être semée');
  });

  /* ------------------------------------------------------------------ */
  /* Parcours Worker complet                                             */
  /* ------------------------------------------------------------------ */

  const storage: InMemoryObjectStorage = createInMemoryObjectStorage();
  const harness = await createOffersTestHarness(undefined, {
    documentStorage: storage,
    documentUrlSigningSecret: SIGNING_SECRET,
  });

  try {
    const { token: employerToken, userId: employerId } = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
    const { token: candidateToken, userId: candidateId } = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
    const { token: outsiderToken, userId: outsiderId } = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
    assert(harness.documents, 'le dépôt documents doit être composé (base durable + stockage injecté)');

    await check('P0-R2 upload: création du document, métadonnées et grant de version 1', async () => {
      const content = '%PDF-1.4 contenu v1 du contrat';
      const response = await post(harness, '/api/v1/documents/upload-grants', employerToken, `doc-grant-creation`, CONTRACT_META(content));
      const grant = await jsonOf<GrantBody>(response);
      assert(grant.document.documentId.startsWith('doc_'), 'identifiant doc_ attendu');
      assert(grant.document.ownerUserId === employerId && grant.document.createdBy === employerId, 'owner/subject = déposant');
      assert(grant.document.documentType === 'CONTRACT_DOCUMENT', 'type documentaire conservé');
      assert(grant.document.retention.retentionClass === 'CONTRACTUAL', 'classe de conservation du contrat');
      assert(grant.document.retention.durationStatus === 'PENDING_LEGAL_VALIDATION', 'aucune durée tant que non validée');
      assert(grant.document.retention.retentionDays === null, 'aucune durée inventée');
      assert(grant.document.status === 'ACTIVE' && grant.document.currentVersionNumber === 0, 'document actif sans contenu reçu');
      assert(grant.version.versionNumber === 1 && grant.version.status === 'PENDING_UPLOAD', 'version 1 en attente de contenu');
      assert(grant.version.provenance === 'USER_UPLOAD' && grant.version.hashAlgorithm === 'SHA-256', 'provenance et algorithme');
      assert(grant.version.retainUntil === null, 'aucune échéance sans durée validée');
      assert(grant.version.cryptographicHash === undefined, 'aucune empreinte avant contenu');
      assert(grant.upload.url === `/api/v1/documents/${grant.document.documentId}/versions/${grant.version.versionId}/content`, 'URL de dépôt API');
      assert(grant.upload.expectedSizeBytes === bytesOf(content).length, 'taille attendue conservée');
      // Aucune clé d'objet ne fuit dans la réponse.
      assert(!JSON.stringify(grant).includes('objectKey') && !JSON.stringify(grant).includes('docs/'), 'object_key ne doit jamais être exposée');
      void candidateId; void outsiderToken; void outsiderId; void candidateToken;
    });

    await check('P0-R2 validation: type, taille, contenu et finalité obligatoires', async () => {
      const invalidType = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-1', { ...CONTRACT_META('x'), documentType: 'PASSPORT_SCAN' });
      assert(invalidType.status === 400, `400 attendu (type inconnu), reçu ${invalidType.status}`);
      const invalidMime = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-2', { ...CONTRACT_META('x'), contentType: 'text/html' });
      assert(invalidMime.status === 400, `400 attendu (MIME), reçu ${invalidMime.status}`);
      const zeroSize = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-3', { ...CONTRACT_META('x'), sizeBytes: 0 });
      assert(zeroSize.status === 400, `400 attendu (taille 0), reçu ${zeroSize.status}`);
      const tooLarge = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-4', { ...CONTRACT_META('x'), sizeBytes: MAX_DOCUMENT_CONTENT_BYTES + 1 });
      assert(tooLarge.status === 400, `400 attendu (taille excessive), reçu ${tooLarge.status}`);
      const noTitle = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-5', { ...CONTRACT_META('x'), title: '   ' });
      assert(noTitle.status === 400, `400 attendu (titre vide), reçu ${noTitle.status}`);
      const unsafeName = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-6', { ...CONTRACT_META('x'), fileName: '../secret.pdf' });
      assert(unsafeName.status === 400, `400 attendu (nom de fichier dangereux), reçu ${unsafeName.status}`);
      const noPurpose = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-7', { ...CONTRACT_META('x'), documentType: 'VERIFICATION_DOCUMENT' });
      assert(noPurpose.status === 400, `400 attendu (finalité obligatoire), reçu ${noPurpose.status}`);
      const forgedProvenance = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-val-8', { ...CONTRACT_META('x'), provenance: 'SYSTEM_EXPORT' });
      assert(forgedProvenance.status === 400, `400 attendu (champ provenance interdit), reçu ${forgedProvenance.status}`);
      const withoutKey = await harness.worker.fetch(authRequest('/api/v1/documents/upload-grants', employerToken, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(CONTRACT_META('x')),
      }));
      assert(withoutKey.status === 400, `400 attendu sans Idempotency-Key, reçu ${withoutKey.status}`);
    });

    await check('P0-R2 upload contenu: empreinte SHA-256, taille réelle, document courant', async () => {
      const content = '%PDF-1.4 contrat signé des deux parties — VERSION 1';
      const grant = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-grant-hash', CONTRACT_META(content)));
      const expected = await sha256Hex(bytesOf(content));
      const registered = await jsonOf<{ version: GrantBody['version']; replayed: boolean }>(await uploadBytes(
        harness, grant.upload.url, employerToken, 'doc-content-hash', 'application/pdf', bytesOf(content),
      ));
      assert(registered.replayed === false, 'premier enregistrement, pas un rejeu');
      assert(registered.version.status === 'ACTIVE', 'version active après dépôt');
      assert(registered.version.cryptographicHash === expected, 'empreinte SHA-256 mesurée sur le contenu');
      assert(registered.version.sizeBytes === bytesOf(content).length, 'taille réelle mesurée');
      assert(registered.version.registeredAt !== undefined, 'horodatage d’enregistrement');
      const detail = await jsonOf<GrantBody['document'] & { versions: GrantBody['version'][] }>(await get(harness, `/api/v1/documents/${grant.document.documentId}`, employerToken));
      assert(detail.currentVersionNumber === 1, 'pointeur de version courante avancé');
      const actions = await auditActions(harness, grant.document.documentId);
      assert(actions.includes('DOCUMENT_CREATED') && actions.includes('DOCUMENT_CONTENT_REGISTERED'), 'audit de création et d’enregistrement');
    });

    await check('P0-R2 contenu: type et taille déclarés respectés à l’octet', async () => {
      const content = '%PDF-1.4 contenu refusé-puis-accepté';
      const grant = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-grant-mismatch', CONTRACT_META(content)));
      const wrongType = await uploadBytes(harness, grant.upload.url, employerToken, 'doc-content-mismatch-1', 'image/png', bytesOf(content));
      assert(wrongType.status === 400, `400 attendu (type reçu ≠ déclaré), reçu ${wrongType.status}`);
      const wrongSize = await uploadBytes(harness, grant.upload.url, employerToken, 'doc-content-mismatch-2', 'application/pdf', bytesOf(`${content}x`));
      assert(wrongSize.status === 400, `400 attendu (taille reçue ≠ déclarée), reçu ${wrongSize.status}`);
      const version = await jsonOf<GrantBody['document'] & { versions: GrantBody['version'][] }>(await get(harness, `/api/v1/documents/${grant.document.documentId}`, employerToken));
      assert(version.versions[0].status === 'PENDING_UPLOAD', 'un dépôt refusé laisse la version en attente');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 versionnement: v2 sans écraser v1, immutabilité, rejeu idempotent, récupération exacte', async () => {
      const v1Content = '%PDF-1.4 VERSION 1 — contenu initial';
      const v2Content = '%PDF-1.4 VERSION 2 — contenu corrigé';
      const grant = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-grant-v12', CONTRACT_META(v1Content)));
      const docId = grant.document.documentId;
      const v1Id = grant.version.versionId;
      const hashV1 = await sha256Hex(bytesOf(v1Content));
      const hashV2 = await sha256Hex(bytesOf(v2Content));
      await jsonOf(await uploadBytes(harness, grant.upload.url, employerToken, 'doc-content-v1', 'application/pdf', bytesOf(v1Content)));

      // Rejeu du MÊME contenu : idempotent ; contenu différent : refusé (immutabilité).
      const replay = await jsonOf<{ replayed: boolean }>(await uploadBytes(harness, grant.upload.url, employerToken, 'doc-content-v1-replay', 'application/pdf', bytesOf(v1Content)));
      assert(replay.replayed === true, 'rejeu du même contenu idempotent');
      const immutable = await uploadBytes(harness, grant.upload.url, employerToken, 'doc-content-v1-other', 'application/pdf', bytesOf(`${v1Content}-alt`));
      assert(immutable.status === 409, `409 attendu (immutabilité), reçu ${immutable.status}`);

      // Création de la version 2 : l'ancienne n'est JAMAIS modifiée.
      const v2Grant = await jsonOf<{ version: GrantBody['version']; upload: GrantBody['upload'] }>(await post(harness, `/api/v1/documents/${docId}/versions`, employerToken, 'doc-grant-v2', { contentType: 'application/pdf', sizeBytes: bytesOf(v2Content).length }));
      assert(v2Grant.version.versionNumber === 2 && v2Grant.version.status === 'PENDING_UPLOAD', 'version 2 créée en attente');
      await jsonOf(await uploadBytes(harness, v2Grant.upload.url, employerToken, 'doc-content-v2', 'application/pdf', bytesOf(v2Content)));

      const versions = await jsonOf<GrantBody['version'][]>(await get(harness, `/api/v1/documents/${docId}/versions`, employerToken));
      assert(versions.length === 2, 'deux versions coexistent');
      assert(versions[0].versionNumber === 1 && versions[0].cryptographicHash === hashV1, 'v1 intacte après v2');
      assert(versions[1].versionNumber === 2 && versions[1].cryptographicHash === hashV2, 'v2 possède sa propre empreinte');
      const detail = await jsonOf<GrantBody['document']>(await get(harness, `/api/v1/documents/${docId}`, employerToken));
      assert(detail.currentVersionNumber === 2, 'pointeur courant = 2');

      // Récupération de la BONNE version, octet par octet.
      const dl1 = await get(harness, `/api/v1/documents/${docId}/versions/${v1Id}/content`, employerToken);
      assert(dl1.status === 200, 'téléchargement v1 autorisé');
      assert(new TextDecoder().decode(new Uint8Array(await dl1.arrayBuffer())) === v1Content, 'contenu v1 exact');
      assert(dl1.headers.get('x-content-sha256') === hashV1, 'empreinte v1 servie');
      const dl2 = await get(harness, `/api/v1/documents/${docId}/versions/${v2Grant.version.versionId}/content`, employerToken);
      assert(dl2.status === 200 && new TextDecoder().decode(new Uint8Array(await dl2.arrayBuffer())) === v2Content, 'contenu v2 exact');
      assert(dl2.headers.get('content-type') === 'application/pdf', 'type de contenu conservé');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 accès: ownership strict, aucune fuite par IDOR', async () => {
      const grant = await createAndRegister(harness, employerToken, 'idor', '%PDF-1.4 document protégé');
      const docId = grant.document.documentId;
      const vId = grant.version.versionId;
      // Un tiers qui connaît documentId + versionId ne peut RIEN lire ni télécharger.
      const readAttempt = await get(harness, `/api/v1/documents/${docId}`, outsiderToken);
      assert(readAttempt.status === 403, `403 attendu (lecture tierce), reçu ${readAttempt.status}`);
      const versionsAttempt = await get(harness, `/api/v1/documents/${docId}/versions`, outsiderToken);
      assert(versionsAttempt.status === 403, `403 attendu (versions tierces), reçu ${versionsAttempt.status}`);
      const downloadAttempt = await get(harness, `/api/v1/documents/${docId}/versions/${vId}/content`, outsiderToken);
      assert(downloadAttempt.status === 403 && (await downloadAttempt.arrayBuffer()).byteLength < 4096, 'aucun octet servi à un tiers');
      const linkAttempt = await post(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, outsiderToken, 'idor-link', { entityType: 'USER', entityId: outsiderId, linkPurpose: 'SUPPORTING' });
      assert(linkAttempt.status === 403, `403 attendu (lien par tiers), reçu ${linkAttempt.status}`);
      const newVersionAttempt = await post(harness, `/api/v1/documents/${docId}/versions`, outsiderToken, 'idor-version', { contentType: 'application/pdf', sizeBytes: 16 });
      assert(newVersionAttempt.status === 403, `403 attendu (version par tiers), reçu ${newVersionAttempt.status}`);
      const uploadAttempt = await uploadBytes(harness, `/api/v1/documents/${docId}/versions/${vId}/content`, outsiderToken, 'idor-upload', 'application/pdf', bytesOf('%PDF-1.4 fake!!'.padEnd(16)));
      assert(uploadAttempt.status === 403, `403 attendu (dépôt par tiers), reçu ${uploadAttempt.status}`);
      // La réponse d'erreur ne révèle aucune métadonnée sensible.
      const bodyText = JSON.stringify(await (await get(harness, `/api/v1/documents/${docId}`, outsiderToken)).json());
      assert(!bodyText.includes('docs/') && !bodyText.includes('object'), 'aucune clé d’objet ne fuit dans les erreurs');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 existence: document, version et objet physique inexistants', async () => {
      const missingDoc = await get(harness, '/api/v1/documents/doc_absent00000000000000000000', employerToken);
      assert(missingDoc.status === 404, `404 attendu (document inexistant), reçu ${missingDoc.status}`);
      const missingGrant = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-grant-404', CONTRACT_META('%PDF-1.4 pending')));
      const missingVersion = await get(harness, `/api/v1/documents/${missingGrant.document.documentId}/versions/dver_absent0000000000000000000/content`, employerToken);
      assert(missingVersion.status === 404, `404 attendu (version inexistante), reçu ${missingVersion.status}`);
      const pendingDownload = await get(harness, missingGrant.upload.url, employerToken);
      assert(pendingDownload.status === 410, `410 attendu (contenu non enregistré), reçu ${pendingDownload.status}`);
      // Accès à une version d'un AUTRE document via son identifiant : 404 (jamais de clé).
      const other = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-grant-404b', CONTRACT_META('%PDF-1.4 autre')));
      const crossed = await get(harness, `/api/v1/documents/${missingGrant.document.documentId}/versions/${other.version.versionId}/content`, employerToken);
      assert(crossed.status === 404, `404 attendu (version d'un autre document), reçu ${crossed.status}`);
      void candidateToken; void candidateId;
    });

    await check('P0-R2 liens: version ↔ contrat, entité réelle exigée, partie exigée', async () => {
      const contract = await seedSignedContract(harness, employerId, candidateId);
      const pending = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-link-pending', CONTRACT_META('%PDF-1.4 contrat à lier')));
      const pendingLink = await post(harness, `/api/v1/documents/${pending.document.documentId}/versions/${pending.version.versionId}/links`, employerToken, 'doc-link-1', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'CONTRACT_VERSION' });
      assert(pendingLink.status === 409, `409 attendu (lien sur version sans empreinte), reçu ${pendingLink.status}`);
      const grant = await createAndRegister(harness, employerToken, 'linked', '%PDF-1.4 contrat lié v1');
      const docId = grant.document.documentId;
      const vId = grant.version.versionId;
      const unknownEntity = await post(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-link-2', { entityType: 'CONTRACT', entityId: 'ctr_absent0000000000000000000', linkPurpose: 'CONTRACT_VERSION' });
      assert(unknownEntity.status === 404, `404 attendu (entité inexistante), reçu ${unknownEntity.status}`);
      const contractLink = await jsonOf<{ link: { linkPurpose: string; entityId: string }; duplicated: boolean }>(await post(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-link-3', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'CONTRACT_VERSION' }));
      assert(contractLink.duplicated === false && contractLink.link.entityId === contract.id, 'lien contrat créé');
      const duplicate = await jsonOf<{ duplicated: boolean }>(await post(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-link-4', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'CONTRACT_VERSION' }));
      assert(duplicate.duplicated === true, 'lien dupliqué idempotent (aucune seconde ligne)');
      // Une non-partie du contrat ne peut pas y lier son document.
      const outsiderGrant = await createAndRegister(harness, outsiderToken, 'outsider', '%PDF-1.4 doc tiers');
      const notParty = await post(harness, `/api/v1/documents/${outsiderGrant.document.documentId}/versions/${outsiderGrant.version.versionId}/links`, outsiderToken, 'doc-link-5', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'CONTRACT_VERSION' });
      assert(notParty.status === 403, `403 attendu (lieur non partie), reçu ${notParty.status}`);
      // Matrice : type de lien incompatible avec le type de document.
      const missionDoc = await createAndRegister(harness, candidateToken, 'mission-just', '%PDF-1.4 justificatif', { documentType: 'MISSION_JUSTIFICATION', title: 'Justificatif', fileName: 'justificatif.pdf' });
      const wrongPurpose = await post(harness, `/api/v1/documents/${missionDoc.document.documentId}/versions/${missionDoc.version.versionId}/links`, candidateToken, 'doc-link-6', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'CONTRACT_VERSION' });
      assert(wrongPurpose.status === 400, `400 attendu (matrice purpose/type), reçu ${wrongPurpose.status}`);
      void candidateId;
    });

    await check('P0-R2 acceptation: rattachée à la version EXACTE et à une signature RÉELLE', async () => {
      const contract = await seedSignedContract(harness, employerId, candidateId);
      const grant = await createAndRegister(harness, employerToken, 'acceptance', '%PDF-1.4 contrat + acceptations');
      const docId = grant.document.documentId;
      const vId = grant.version.versionId;
      const employerAcceptance = await jsonOf<{ link: { linkPurpose: string; relatedActorId?: string; acceptedAt?: string } }>(await post(
        harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-accept-1',
        { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'ACCEPTANCE_PROOF', relatedActorId: employerId },
      ));
      assert(employerAcceptance.link.relatedActorId === employerId, 'signataire employeur rattaché');
      assert(employerAcceptance.link.acceptedAt === contract.employerSignedAt, 'acceptation = date de signature EXISTANTE');
      const candidateAcceptance = await jsonOf<{ link: { relatedActorId?: string } }>(await post(
        harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-accept-2',
        { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'ACCEPTANCE_PROOF', relatedActorId: candidateId },
      ));
      assert(candidateAcceptance.link.relatedActorId === candidateId, 'seconde signature = second lien (unicité par signataire)');
      const wrongSigner = await post(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-accept-3', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'ACCEPTANCE_PROOF', relatedActorId: outsiderId });
      assert(wrongSigner.status === 409, `409 attendu (signature inexistante), reçu ${wrongSigner.status}`);
      const noSigner = await post(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-accept-4', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'ACCEPTANCE_PROOF' });
      assert(noSigner.status === 400, `400 attendu (signataire requis), reçu ${noSigner.status}`);
      // Une version ultérieure ne déplace pas les acceptations historiques.
      const v2 = await jsonOf<{ version: GrantBody['version']; upload: GrantBody['upload'] }>(await post(harness, `/api/v1/documents/${docId}/versions`, employerToken, 'doc-accept-v2', { contentType: 'application/pdf', sizeBytes: bytesOf('%PDF-1.4 v2 post-acceptation').length }));
      await uploadBytes(harness, v2.upload.url, employerToken, 'doc-accept-v2-content', 'application/pdf', bytesOf('%PDF-1.4 v2 post-acceptation'));
      const linksV1 = await jsonOf<Array<{ documentVersionId: string; linkPurpose: string }>>(await get(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken));
      const linksV2 = await jsonOf<unknown[]>(await get(harness, `/api/v1/documents/${docId}/versions/${v2.version.versionId}/links`, employerToken));
      assert(linksV1.filter(link => link.linkPurpose === 'ACCEPTANCE_PROOF').length === 2, 'les deux acceptations restent sur la version 1');
      assert(linksV2.length === 0, 'la version 2 n’hérite d’aucune acceptation');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 attestation: type dédié, lien ATTESTATION au contrat, provenance utilisateur seule', async () => {
      const contract = await seedSignedContract(harness, employerId, candidateId);
      const grant = await createAndRegister(harness, employerToken, 'attestation', '%PDF-1.4 attestation de traçabilité', {
        documentType: 'TRACEABILITY_ATTESTATION',
        title: 'Attestation export mission',
        fileName: 'attestation.pdf',
      });
      assert(grant.version.provenance === 'USER_UPLOAD', 'dans cette tranche la provenance est utilisateur (pas de générateur système)');
      const linked = await post(harness, `/api/v1/documents/${grant.document.documentId}/versions/${grant.version.versionId}/links`, employerToken, 'doc-attest-1', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'ATTESTATION' });
      assert(linked.status === 200, `lien ATTESTATION accepté, reçu ${linked.status}`);
      void candidateToken; void candidateId;
    });

    await check('P0-R2 vérification: finalité obligatoire, sujet seul, accès restreint (aucun accès participant)', async () => {
      const contract = await seedSignedContract(harness, employerId, candidateId);
      const selfDoc = await createAndRegister(harness, candidateToken, 'verification', '%PDF-1.4 document de vérification', {
        documentType: 'VERIFICATION_DOCUMENT',
        purposeNote: 'Vérification d’expérience déclarée pour la mission en cours.',
        title: 'Référence professionnelle',
        fileName: 'reference.pdf',
      });
      const otherSubject = await post(harness, `/api/v1/documents/${selfDoc.document.documentId}/versions/${selfDoc.version.versionId}/links`, candidateToken, 'doc-verif-1', { entityType: 'USER', entityId: employerId, linkPurpose: 'VERIFICATION' });
      assert(otherSubject.status === 403, `403 attendu (vérification limitée à son sujet), reçu ${otherSubject.status}`);
      const selfLink = await post(harness, `/api/v1/documents/${selfDoc.document.documentId}/versions/${selfDoc.version.versionId}/links`, candidateToken, 'doc-verif-2', { entityType: 'USER', entityId: candidateId, linkPurpose: 'VERIFICATION' });
      assert(selfLink.status === 200, `lien de vérification sur son propre sujet, reçu ${selfLink.status}`);
      // Même lié à un contrat dont l'employeur est partie, un document de
      // vérification ne lui est JAMAIS exposé (accès restreint).
      const employerRead = await get(harness, `/api/v1/documents/${selfDoc.document.documentId}`, employerToken);
      assert(employerRead.status === 403, `403 attendu (accès restreint), reçu ${employerRead.status}`);
      void contract; void outsiderToken;
    });

    await check('P0-R2 participants: l’autre partie lit les métadonnées et télécharge via le lien', async () => {
      const contract = await seedSignedContract(harness, employerId, candidateId);
      const grant = await createAndRegister(harness, employerToken, 'participant', '%PDF-1.4 visible par les parties');
      await jsonOf(await post(harness, `/api/v1/documents/${grant.document.documentId}/versions/${grant.version.versionId}/links`, employerToken, 'doc-part-1', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'SUPPORTING' }));
      const candidateRead = await get(harness, `/api/v1/documents/${grant.document.documentId}`, candidateToken);
      assert(candidateRead.status === 200, `la partie liée lit les métadonnées, reçu ${candidateRead.status}`);
      const candidateDl = await get(harness, `/api/v1/documents/${grant.document.documentId}/versions/${grant.version.versionId}/content`, candidateToken);
      assert(candidateDl.status === 200, 'la partie liée télécharge');
      const strangerRead = await get(harness, `/api/v1/documents/${grant.document.documentId}`, outsiderToken);
      assert(strangerRead.status === 403, 'un non-partie reste exclu');
      void candidateId;
    });

    await check('P0-R2 intégrité: vérification explicite, contenu altéré détecté et diffusion refusée', async () => {
      const content = '%PDF-1.4 intégrité démontrée';
      const grant = await createAndRegister(harness, employerToken, 'integrity', content);
      const docId = grant.document.documentId;
      const vId = grant.version.versionId;
      const ok = await jsonOf<{ match: boolean; expectedHash: string; actualHash: string; objectPresent: boolean; scope: string }>(await post(
        harness, `/api/v1/documents/${docId}/versions/${vId}/verify`, employerToken, 'doc-verify-1', {},
      ));
      assert(ok.match === true && ok.objectPresent === true, 'empreinte conforme sur contenu intact');
      assert(ok.expectedHash === ok.actualHash && ok.scope === 'TECHNICAL_INTEGRITY', 'vérification technique rapportée');

      const keyRow = await harness.database.query<{ object_key: string }>(
        'SELECT object_key FROM document_versions WHERE version_id = $1', [vId],
      );
      const objectKey = keyRow.rows[0]?.object_key;
      assert(objectKey, 'clé d’objet présente en base (jamais via API)');
      storage.dangerouslyReplaceForIntegrityTest(objectKey, bytesOf('%PDF-1.4 CONTENU FALSIFIÉ !!!!'));

      const ko = await jsonOf<{ match: boolean; actualHash: string }>(await post(harness, `/api/v1/documents/${docId}/versions/${vId}/verify`, employerToken, 'doc-verify-2', {}));
      assert(ko.match === false, 'altération détectée par recalcul');
      assert(ko.actualHash !== ok.actualHash, 'empreinte recalculée divergente');
      const blocked = await get(harness, `/api/v1/documents/${docId}/versions/${vId}/content`, employerToken);
      assert(blocked.status === 409, `diffusion refusée (intégrité), reçu ${blocked.status}`);
      const actions = await auditActions(harness, docId);
      assert(actions.filter(action => action === 'DOCUMENT_INTEGRITY_VERIFIED').length === 2, 'deux vérifications auditées (conforme puis divergente)');
      // Restauration du contenu pour ne pas polluer la suite.
      storage.dangerouslyReplaceForIntegrityTest(objectKey, bytesOf(content));
      void candidateToken; void candidateId;
    });

    await check('P0-R2 idempotence: replay exact, conflit de clé, clés manquantes', async () => {
      const content = '%PDF-1.4 idempotence';
      const first = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-idem-1', CONTRACT_META(content)));
      const replay = await jsonOf<GrantBody>(await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-idem-1', CONTRACT_META(content)));
      assert(replay.document.documentId === first.document.documentId, 'replay = même document');
      const conflictResponse = await post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-idem-1', CONTRACT_META(`${content} différent`));
      assert(conflictResponse.status === 409, `409 attendu (clé + charge différente), reçu ${conflictResponse.status}`);
      const mine = await jsonOf<{ items: Array<{ documentId: string }> }>(await get(harness, '/api/v1/my/documents?limit=100', employerToken));
      assert(mine.items.filter(item => item.documentId === first.document.documentId).length === 1, 'une seule ligne malgré le rejeu');
      const vGrant = await jsonOf<{ version: GrantBody['version'] }>(await post(harness, `/api/v1/documents/${first.document.documentId}/versions`, employerToken, 'doc-idem-2', { contentType: 'application/pdf', sizeBytes: 12 }));
      const vReplay = await jsonOf<{ version: GrantBody['version'] }>(await post(harness, `/api/v1/documents/${first.document.documentId}/versions`, employerToken, 'doc-idem-2', { contentType: 'application/pdf', sizeBytes: 12 }));
      assert(vReplay.version.versionId === vGrant.version.versionId, 'replay de création de version = même version');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 concurrence: créations concurrentes sérialisées, aucune duplication', async () => {
      // Même clé en concurrence: une seule réserve, zéro doublon.
      const [a, b] = await Promise.all([
        post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-conc-1', CONTRACT_META('%PDF-1.4 concurrence')),
        post(harness, '/api/v1/documents/upload-grants', employerToken, 'doc-conc-1', CONTRACT_META('%PDF-1.4 concurrence')),
      ]);
      assert(a.status === 200 && (b.status === 200 || b.status === 409), `premier succès + rejoué/refusé, reçus ${a.status}/${b.status}`);
      const firstBody = await a.json() as GrantBody;
      if (b.status === 200) {
        const secondBody = await b.json() as GrantBody;
        assert(secondBody.document.documentId === firstBody.document.documentId, 'rejeu concurrent = même document');
      }
      const mine = await jsonOf<{ items: Array<{ documentId: string }> }>(await get(harness, '/api/v1/my/documents?limit=100', employerToken));
      assert(mine.items.filter(item => item.documentId === firstBody.document.documentId).length === 1, 'aucune duplication sous concurrence');

      // Deux créations de version concurrentes (clés distinctes): numéros uniques.
      const [vA, vB] = await Promise.all([
        post(harness, `/api/v1/documents/${firstBody.document.documentId}/versions`, employerToken, 'doc-conc-v1', { contentType: 'application/pdf', sizeBytes: 8 }),
        post(harness, `/api/v1/documents/${firstBody.document.documentId}/versions`, employerToken, 'doc-conc-v2', { contentType: 'application/pdf', sizeBytes: 8 }),
      ]);
      assert(vA.status === 200 && vB.status === 200, `deux versions concurrentes aboutissent, reçus ${vA.status}/${vB.status}`);
      const versionsBody = await jsonOf<GrantBody['version'][]>(await get(harness, `/api/v1/documents/${firstBody.document.documentId}/versions`, employerToken));
      const numbers = versionsBody.map(version => version.versionNumber);
      assert(new Set(numbers).size === numbers.length, 'jamais deux versions avec le même numéro');
      assert(Math.max(...numbers) === numbers.length, 'numérotation continue sans trou ni doublon');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 pagination: liste privée keyset du propriétaire', async () => {
      const ownerTag = `mine-${Date.now()}`;
      for (let index = 0; index < 3; index += 1) {
        await createAndRegister(harness, candidateToken, `${ownerTag}-${index}`, `%PDF-1.4 doc ${ownerTag} ${index}`);
      }
      const page1 = await jsonOf<{ items: GrantBody['document'][]; cursor: string | null; hasMore: boolean }>(await get(harness, '/api/v1/my/documents?limit=2', candidateToken));
      assert(page1.items.length === 2 && page1.hasMore === true && page1.cursor, 'première page bornée avec curseur');
      const page2 = await jsonOf<{ items: GrantBody['document'][]; hasMore: boolean }>(await get(harness, `/api/v1/my/documents?limit=2&cursor=${encodeURIComponent(page1.cursor!)}`, candidateToken));
      assert(page2.items.length >= 1, 'seconde page via curseur');
      assert(page1.items.every(item => item.ownerUserId === candidateId), 'uniquement ses propres documents');
      void candidateId;
    });

    await check('P0-R2 rétention: politiques semées par type, durées en attente (rien d’inventé)', async () => {
      const policies = await harness.database.query<{ document_type: string; retention_days: number | null; duration_status: string }>(
        'SELECT document_type, retention_days, duration_status FROM document_retention_policies ORDER BY document_type ASC',
      );
      assert(policies.rows.length === DOCUMENT_TYPES.length, 'une politique par type de document');
      assert(policies.rows.every(row => row.retention_days === null && row.duration_status === 'PENDING_LEGAL_VALIDATION'), 'aucune durée tant que la validation juridique n’a pas eu lieu');
      const types = policies.rows.map(row => row.document_type).sort();
      assert(JSON.stringify(types) === JSON.stringify([...DOCUMENT_TYPES].sort()), 'couverture exacte de la typologie');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 URL signée: émission horodatée, usage valide, altération et expiration refusées', async () => {
      const content = '%PDF-1.4 téléchargement signé';
      const grant = await createAndRegister(harness, employerToken, 'signed', content);
      const docId = grant.document.documentId;
      const vId = grant.version.versionId;
      const issued = await jsonOf<{ url: string; expiresAt: string }>(await post(harness, `/api/v1/documents/${docId}/signed-download-url`, employerToken, 'unused-key-not-required', { versionId: vId }));
      assert(issued.url.includes(`/api/v1/documents/${docId}/versions/${vId}/content?token=`), 'URL signée sur la route de contenu');
      assert(Date.parse(issued.expiresAt) === harness.clock.value.getTime() + 300_000, 'échéance de 300 s respectée');
      const viaSignedUrl = await get(harness, issued.url, employerToken);
      assert(viaSignedUrl.status === 200 && new TextDecoder().decode(new Uint8Array(await viaSignedUrl.arrayBuffer())) === content, 'téléchargement via URL signée');
      const tampered = await get(harness, `${issued.url}00`, employerToken);
      assert(tampered.status === 403, 'jeton altéré refusé');
      const outsiderSigned = await get(harness, issued.url, outsiderToken);
      assert(outsiderSigned.status === 403, 'le jeton est lié à l’acteur émetteur');
      harness.clock.value = new Date(harness.clock.value.getTime() + 301_000);
      try {
        const expired = await get(harness, issued.url, employerToken);
        assert(expired.status === 403, 'jeton expiré refusé');
      } finally {
        harness.clock.value = new Date(harness.clock.value.getTime() - 301_000);
      }
      const actions = await auditActions(harness, docId);
      assert(actions.includes('DOCUMENT_SIGNED_URL_ISSUED') && actions.includes('DOCUMENT_DOWNLOADED'), 'émission et téléchargement audités');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 composition sans secret: URL signée 501 explicite, téléchargement authentifié fonctionnel', async () => {
      const storageNoSecret = createInMemoryObjectStorage();
      const noSecretHarness = await createOffersTestHarness(undefined, { documentStorage: storageNoSecret });
      try {
        const { token } = await authenticateActor(noSecretHarness, 'employer-1', 'EMPLOYER');
        const grant = await createAndRegister(noSecretHarness, token, 'nosecret', '%PDF-1.4 sans secret');
        const signed = await post(noSecretHarness, `/api/v1/documents/${grant.document.documentId}/signed-download-url`, token, 'x', {});
        assert(signed.status === 501, `501 attendu (signature non configurée), reçu ${signed.status}`);
        const direct = await get(noSecretHarness, grant.upload.url, token);
        assert(direct.status === 200, 'le téléchargement authentifié reste disponible');
      } finally {
        await noSecretHarness.close();
      }
      void candidateToken; void candidateId;
    });

    await check('P0-R2 composition sans stockage: routes documents fermées (fail-closed)', async () => {
      const bareHarness = await createOffersTestHarness();
      try {
        const { token } = await authenticateActor(bareHarness, 'employer-1', 'EMPLOYER');
        const response = await post(bareHarness, '/api/v1/documents/upload-grants', token, 'failclosed', CONTRACT_META('%PDF-1.4 x'));
        assert(response.status === 501, `501 attendu sans stockage objet injecté, reçu ${response.status}`);
        const list = await get(bareHarness, '/api/v1/my/documents', token);
        assert(list.status === 501, `501 attendu (liste) sans stockage, reçu ${list.status}`);
      } finally {
        await bareHarness.close();
      }
      void candidateToken; void candidateId;
    });

    /* ---------------- ADMIN ---------------- */

    await check('P0-R2 admin: lecture avec permission existante, filtres, détail complet', async () => {
      const admin = await provisionAdmin(harness, 'read');
      const contract = await seedSignedContract(harness, employerId, candidateId);
      const grant = await createAndRegister(harness, employerToken, 'admin-read', '%PDF-1.4 admin lit');
      await jsonOf(await post(harness, `/api/v1/documents/${grant.document.documentId}/versions/${grant.version.versionId}/links`, employerToken, 'doc-admin-link', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'CONTRACT_VERSION' }));
      const list = await jsonOf<{ items: GrantBody['document'][] }>(await get(harness, `/api/v1/admin/documents?ownerUserId=${employerId}&documentType=CONTRACT_DOCUMENT`, admin.token));
      assert(list.items.some(item => item.documentId === grant.document.documentId), 'le document figure dans la liste ADMIN filtrée');
      const detail = await jsonOf<GrantBody['document'] & { versions: unknown[]; links: unknown[] }>(await get(harness, `/api/v1/admin/documents/${grant.document.documentId}`, admin.token));
      assert(detail.versions.length === 1 && detail.links.length === 1, 'détail ADMIN complet (versions + liens)');
      const adminDownload = await get(harness, `/api/v1/documents/${grant.document.documentId}/versions/${grant.version.versionId}/content`, admin.token);
      assert(adminDownload.status === 200, 'l’ADMIN avec permission télécharge (audit trail)');
      // Permissions de la route ADMIN : scope + permission existante gardent l'entrée.
      const outsiderAdmin = await get(harness, '/api/v1/admin/documents', outsiderToken);
      assert(outsiderAdmin.status === 403, 'un non-ADMIN n’atteint jamais la route ADMIN');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 admin: permission retirée du rôle → refus ; grant utilisateur → accès (RBAC réel)', async () => {
      const admin = await provisionAdmin(harness, 'rbac');
      const grant = await createAndRegister(harness, employerToken, 'admin-rbac', '%PDF-1.4 rbac');
      const before = await get(harness, `/api/v1/admin/documents/${grant.document.documentId}`, admin.token);
      assert(before.status === 200, 'ADMIN avec permission avant retrait');
      await harness.database.query(
        `DELETE FROM role_permissions WHERE role = 'ADMIN' AND permission_code = 'documents:read:any'`,
      );
      try {
        const denied = await get(harness, `/api/v1/admin/documents/${grant.document.documentId}`, admin.token);
        assert(denied.status === 403, 'ADMIN sans la permission existante est refusé (jamais bypassé par le rôle)');
        const deniedList = await get(harness, '/api/v1/admin/documents', admin.token);
        assert(deniedList.status === 403, 'liste ADMIN refusée sans permission');
        // Grant explicite utilisateur : le RBAC du dépôt rétablit l'accès.
        await harness.database.query(
          `INSERT INTO user_permissions (user_id, permission_code) VALUES ($1, 'documents:read:any') ON CONFLICT DO NOTHING`,
          [admin.userId],
        );
        const granted = await get(harness, `/api/v1/admin/documents/${grant.document.documentId}`, admin.token);
        assert(granted.status === 200, 'grant user_permissions rétablit l’accès');
      } finally {
        await harness.database.query(
          `INSERT INTO role_permissions (role, permission_code) VALUES ('ADMIN', 'documents:read:any') ON CONFLICT DO NOTHING`,
        );
      }
      const restored = await get(harness, `/api/v1/admin/documents/${grant.document.documentId}`, admin.token);
      assert(restored.status === 200, 'seed role_permissions restauré');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 révocation: version révoquée motivée et auditée, contenu retiré, références préservées, append-only', async () => {
      const admin = await provisionAdmin(harness, 'revoke');
      const contract = await seedSignedContract(harness, employerId, candidateId);
      const content = '%PDF-1.4 version à révoquer';
      const grant = await createAndRegister(harness, employerToken, 'revocation', content);
      const docId = grant.document.documentId;
      const vId = grant.version.versionId;
      await jsonOf(await post(harness, `/api/v1/documents/${docId}/versions/${vId}/links`, employerToken, 'doc-rev-link', { entityType: 'CONTRACT', entityId: contract.id, linkPurpose: 'ACCEPTANCE_PROOF', relatedActorId: employerId }));

      // Garde-fous avant révocation.
      const noReason = await post(harness, `/api/v1/admin/documents/${docId}/versions/${vId}/revoke`, admin.token, 'doc-rev-0', {});
      assert(noReason.status === 400, `400 attendu (motif requis), reçu ${noReason.status}`);
      const outsiderRevoke = await post(harness, `/api/v1/admin/documents/${docId}/versions/${vId}/revoke`, outsiderToken, 'doc-rev-1', { reason: 'tentative externe' });
      assert(outsiderRevoke.status === 403, 'un non-ADMIN ne révoque jamais');

      const revoked = await jsonOf<GrantBody['version']>(await post(harness, `/api/v1/admin/documents/${docId}/versions/${vId}/revoke`, admin.token, 'doc-rev-2', { reason: 'Version déposée hors finalité déclarée.' }));
      assert(revoked.status === 'REVOKED' && revoked.revokedBy === admin.userId, 'version révoquée horodatée et signée');
      assert(revoked.revocationReason === 'Version déposée hors finalité déclarée.', 'motif conservé');
      assert(revoked.cryptographicHash !== undefined, 'empreinte historique conservée');

      const again = await post(harness, `/api/v1/admin/documents/${docId}/versions/${vId}/revoke`, admin.token, 'doc-rev-3', { reason: 'double' });
      assert(again.status === 409, `409 attendu (aucune double révocation), reçu ${again.status}`);

      // Contenu retiré pour les non-ADMIN ; référence intacte (métadonnées + liens).
      const blocked = await get(harness, `/api/v1/documents/${docId}/versions/${vId}/content`, employerToken);
      assert(blocked.status === 410, `410 attendu (contenu révoqué non diffusé), reçu ${blocked.status}`);
      const detail = await jsonOf<GrantBody['document'] & { versions: GrantBody['version'][]; links: Array<{ documentVersionId: string; linkPurpose: string }>; history?: unknown[] }>(await get(harness, `/api/v1/documents/${docId}`, employerToken));
      assert(detail.versions[0].status === 'REVOKED', 'la version révoquée reste référençable');
      assert(detail.links.filter(link => link.linkPurpose === 'ACCEPTANCE_PROOF').length === 1, 'l’acceptation historique n’est pas rompue');
      const historyRow = await harness.database.query<{ history: Array<{ action: string; versionNumber?: number }> }>(
        'SELECT history FROM documents WHERE document_id = $1', [docId],
      );
      assert(historyRow.rows[0]?.history.some(entry => entry.action === 'DOCUMENT_VERSION_REVOKED' && entry.versionNumber === 1), 'historique append-only enrichi (jamais réécrit)');
      const actions = await auditActions(harness, docId);
      assert(actions.includes('DOCUMENT_VERSION_REVOKED'), 'révocation auditée dans le ledger existant');
      const adminRow = await harness.database.query<{ after_state: { acceptanceLinksPreserved?: number } }>(
        `SELECT after_state FROM automation_audit_ledger WHERE entity_id = $1 AND action = 'DOCUMENT_VERSION_REVOKED'`, [docId],
      );
      assert(adminRow.rows[0]?.after_state.acceptanceLinksPreserved === 1, 'préservation des acceptations tracée');

      // L'ADMIN conserve l'accès d'audit à l'objet révoqué.
      const adminDownload = await get(harness, `/api/v1/documents/${docId}/versions/${vId}/content`, admin.token);
      assert(adminDownload.status === 200, 'accès AUDIT ADMIN à la version révoquée');
      assert(adminDownload.headers.get('x-document-version-status') === 'REVOKED', 'statut révoqué signalé');

      // Aucune suppression physique n'est offerte (méthode DELETE absente du catalogue).
      const deletion = await harness.worker.fetch(authRequest(`/api/v1/documents/${docId}`, admin.token, { method: 'DELETE' }));
      assert(deletion.status === 405, `405 attendu (aucune suppression exposée), reçu ${deletion.status}`);
      void candidateToken; void candidateId;
    });

    await check('P0-R2 révocation document: statut global, contenu indisponible, auditée', async () => {
      const admin = await provisionAdmin(harness, 'docrevoke');
      const grant = await createAndRegister(harness, employerToken, 'document-revocation', '%PDF-1.4 document à révoquer');
      const docId = grant.document.documentId;
      const revoked = await jsonOf<GrantBody['document']>(await post(harness, `/api/v1/admin/documents/${docId}/revoke`, admin.token, 'doc-whole-rev', { reason: 'Document hors finalité (retiré sur signalement).' }));
      assert(revoked.status === 'REVOKED' && revoked.revokedBy === admin.userId, 'document révoqué');
      const blocked = await get(harness, `/api/v1/documents/${docId}/versions/${grant.version.versionId}/content`, employerToken);
      assert(blocked.status === 410, 'contenu indisponible après révocation du document');
      const newVersion = await post(harness, `/api/v1/documents/${docId}/versions`, employerToken, 'doc-whole-rev-v2', { contentType: 'application/pdf', sizeBytes: 10 });
      assert(newVersion.status === 409, 'aucune nouvelle version sur un document révoqué');
      const actions = await auditActions(harness, docId);
      assert(actions.includes('DOCUMENT_REVOKED'), 'révocation du document auditée');
      void candidateToken; void candidateId;
    });

    await check('P0-R2 non-régression: réputation et autres domaines coexistents sur la même composition', async () => {
      // P0-REPUTATION (independant) reste fonctionnel sur ce même harness.
      const reputation = await get(harness, '/api/v1/my/reputation', candidateToken);
      assert(reputation.status === 200, `P0-REPUTATION intact (${reputation.status})`);
      const contractsResponse = await get(harness, '/api/v1/my/contracts', employerToken);
      assert(contractsResponse.status === 200, 'cycle CONTRAT intact');
      const paymentsResponse = await get(harness, '/api/v1/my/payments', employerToken);
      assert(paymentsResponse.status === 200 || paymentsResponse.status === 501, 'cycle PAIEMENT préservé (routes inchangées)');
      const claimsList = await get(harness, '/api/v1/my/claims', candidateToken);
      assert(claimsList.status === 200, 'cycle CLAIM intact');
      const replacements = await get(harness, '/api/v1/my/replacements', employerToken);
      assert(replacements.status === 200, 'P0-REPLACEMENT intact');
      const matchingProfile = await get(harness, '/api/v1/my/matching-profile', candidateToken);
      assert(matchingProfile.status === 200 || matchingProfile.status === 404, 'P0-MATCHING intact');
      void candidateId; void outsiderId;
    });
  } finally {
    await harness.close();
  }

  return results;
}
