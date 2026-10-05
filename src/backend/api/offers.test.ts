/**
 * LE LABEUR — P0-E1 — tests d'intégration réels du domaine OFFRES.
 *
 * Périmètre couvert :
 *  - Création d'offre par EMPLOYER
 *  - Persistance réelle PostgreSQL (PGlite WASM)
 *  - Récupération unitaire (GET /offers/:id)
 *  - Liste publique des offres (GET /offers)
 *  - Liste privée de l'employeur (GET /my/offers)
 *  - Contrôle d'ownership (interdiction de créer pour un tiers, isolation des offres privées)
 *  - Contrôle des rôles (CANDIDATE et ADMIN rejetés en création et /my/offers)
 *  - Refus des accès interdits (401 sans session, 403 compte bloqué, 400 validation)
 *  - Idempotence (replay sur répétition identique, 409 sur conflit de charge utile)
 *  - Rollback transactionnel en cas d'échec
 *  - Séparation DEMO / API (routes hors périmètre 501, mock inchangé)
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeWorker } from './entry';
import { SESSION_COOKIE_NAME } from '../identity/cookies';
import { base64UrlEncode } from '../identity/ids';
import { createGoogleCredentialVerifier } from '../identity/googleVerifier';
import type { GoogleCredentialVerifier, GoogleExternalIdentity } from '../productionContracts';
import type { PostgreSqlDatabase } from '../services/database';
import { createPostgresDatabase } from '../persistence/postgresDatabase';
import { createSqlOfferStore } from '../persistence/sqlCoreStores';
import {
  toPostgresClientPort,
  type DriverPoolLike,
  type DriverQueryResult,
} from '../persistence/sqlClient';
import { offerIdempotencyCache } from '../repositories/offerRepository';
import { getRepositoryMode } from '../../repositories/provider';
import { resolveRepositoryMode } from '../../repositories/mode';
import type { Offer } from '../../types';

export interface OfferTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

const TEST_AUDIENCE = 'test-offers-audience';
const TEST_KID = 'test-offers-kid';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createPGliteDriver(database: PGlite): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<Row>> => {
    const result = await database.query<Row>(sql, [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  };

  return {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

const testIdentities: Record<string, GoogleExternalIdentity> = {
  'employer-1': {
    subject: 'google-sub-employer-1',
    email: 'employer1@example.com',
    emailVerified: true,
    displayName: 'Société Alpha',
  },
  'employer-2': {
    subject: 'google-sub-employer-2',
    email: 'employer2@example.com',
    emailVerified: true,
    displayName: 'Cabinet Bêta',
  },
  'candidate-1': {
    subject: 'google-sub-candidate-1',
    email: 'candidate1@example.com',
    emailVerified: true,
    displayName: 'Jean Candidat',
  },
};

async function buildTestCredentials(clock: { value: Date }): Promise<{
  verifier: GoogleCredentialVerifier;
  credentials: Record<string, string>;
}> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = {
    kty: exported.kty,
    n: exported.n,
    e: exported.e,
    alg: 'RS256',
    kid: TEST_KID,
    use: 'sig',
  };
  const verifier = createGoogleCredentialVerifier({
    audience: TEST_AUDIENCE,
    jwksUrl: 'https://google.test/jwks',
    now: () => clock.value,
    fetcher: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { 'content-type': 'application/json' },
    }),
  });

  const credentials: Record<string, string> = {};
  for (const [name, identity] of Object.entries(testIdentities)) {
    const issuedAt = Math.floor(clock.value.getTime() / 1000);
    const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: TEST_KID })));
    const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: TEST_AUDIENCE,
      sub: identity.subject,
      iat: issuedAt,
      exp: issuedAt + 300,
      email: identity.email,
      email_verified: identity.emailVerified,
      name: identity.displayName,
      picture: identity.avatarUrl,
    })));
    const signedContent = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(signedContent),
    );
    credentials[name] = `${signedContent}.${base64UrlEncode(new Uint8Array(signature))}`;
  }

  return { verifier, credentials };
}

interface TestHarness {
  database: PostgreSqlDatabase;
  pg: PGlite;
  worker: { fetch(request: Request): Promise<Response> };
  clock: { value: Date };
  credentials: Record<string, string>;
  close: () => Promise<void>;
}

async function createOffersTestHarness(): Promise<TestHarness> {
  offerIdempotencyCache.clear();
  const pg = new PGlite();
  const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    await pg.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
  }

  const database = createPostgresDatabase(toPostgresClientPort(createPGliteDriver(pg)));
  const clock = { value: new Date('2026-10-05T14:00:00.000Z') };
  const google = await buildTestCredentials(clock);

  const composition = composeWorker({
    GOOGLE_CLIENT_ID: TEST_AUDIENCE,
    PERSISTENCE: 'postgres',
    SESSION_TTL_SECONDS: '3600',
  }, database, {
    googleVerifier: google.verifier,
    now: () => clock.value,
  });

  return {
    database,
    pg,
    worker: composition.worker,
    clock,
    credentials: google.credentials,
    close: async () => {
      await pg.close();
      offerIdempotencyCache.clear();
    },
  };
}

function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header);
  assert(match && match[1], 'cookie de session attendu');
  return match[1];
}

async function authenticateActor(harness: TestHarness, identityKey: string, requestedRole: string): Promise<{
  token: string;
  userId: string;
}> {
  const response = await harness.worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential: harness.credentials[identityKey], requestedRole }),
  }));
  assert(response.status === 200 || response.status === 201, `échec auth: ${response.status}`);
  const body = await response.json() as { user: { id: string } };
  return { token: cookieFrom(response), userId: body.user.id };
}

function authRequest(path: string, token: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (token) headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  return new Request(`https://api.test${path}`, { ...init, headers });
}

export async function runOfferDomainTests(): Promise<OfferTestResult[]> {
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const harness = await createOffersTestHarness();

  try {
    let employer1Token = '';
    let employer1Id = '';
    let employer2Token = '';
    let employer2Id = '';
    let candidateToken = '';
    let candidateId = '';
    let createdOfferId = '';

    await check('P0-E1 Setup: création des sessions EMPLOYER 1, EMPLOYER 2 et CANDIDATE', async () => {
      const e1 = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      employer1Token = e1.token;
      employer1Id = e1.userId;

      const e2 = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      employer2Token = e2.token;
      employer2Id = e2.userId;

      const c = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      candidateToken = c.token;
      candidateId = c.userId;

      assert(employer1Id && employer2Id && candidateId, 'acteurs initialisés');
    });

    const initialPayload = {
      title: 'Développeur TypeScript',
      contractType: 'CDI',
      remuneration: 350000,
      currency: 'FCFA',
      location: 'Cotonou',
      departmentId: 'littoral',
      skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
      summary: 'Mission de développement backend robuste.',
      responsibilities: ['Développer les APIs', 'Rédiger les tests'],
      conditions: ['Temps plein', 'Présentiel'],
      selectionProcess: ['Entretien technique'],
      durationMonths: 12,
    };

    await check('P0-E1 Création: EMPLOYER crée une offre avec succès (201)', async () => {
      const response = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'key-create-offer-001',
        },
        body: JSON.stringify(initialPayload),
      }));

      assert(response.status === 201, `201 attendu, reçu ${response.status}`);
      const body = await response.json() as Offer;
      assert(body.id.startsWith('ofr_'), `ID attendu ofr_*, reçu ${body.id}`);
      assert(body.employerId === employer1Id, 'employerId doit être celui de l’acteur connecté');
      assert(body.employerName === 'Société Alpha', 'employerName doit provenir du profil employeur');
      assert(body.status === 'ACTIVE', 'statut initial ACTIVE attendu');
      assert(body.remuneration === 350000, 'remuneration attendue');
      assert(body.contractType === 'CDI', 'contractType attendu');
      assert(body.skills.length === 3, 'skills attendus');
      createdOfferId = body.id;
    });

    await check('P0-E1 Persistance PostgreSQL: l’offre est réellement stockée en base', async () => {
      const query = await harness.database.query<{
        id: string;
        employer_id: string;
        title: string;
        status: string;
        remuneration: string;
        skills: string;
      }>('SELECT id, employer_id, title, status, remuneration, skills FROM offers WHERE id = $1', [createdOfferId]);

      assert(query.rows.length === 1, 'une ligne doit exister dans offers');
      const row = query.rows[0];
      assert(row.employer_id === employer1Id, 'employer_id en base cohérent');
      assert(row.title === 'Développeur TypeScript', 'title en base cohérent');
      assert(row.status === 'ACTIVE', 'status en base actif');
      assert(Number(row.remuneration) === 350000, 'remuneration en base cohérente');
    });

    await check('P0-E1 Idempotence: répétition identique retourne le résultat rejoué sans doublon', async () => {
      const response = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'key-create-offer-001',
        },
        body: JSON.stringify(initialPayload),
      }));

      assert(response.status === 201 || response.status === 200, `rejeu attendu réussi, reçu ${response.status}`);
      const body = await response.json() as Offer;
      assert(body.id === createdOfferId, 'même offre retournée en rejeu');

      const count = await harness.database.query<{ total: string }>('SELECT count(*) AS total FROM offers');
      assert(Number(count.rows[0].total) === 1, 'aucun doublon ne doit être inséré en base');
    });

    await check('P0-E1 Idempotence: même clé avec charge utile différente retourne 409', async () => {
      const modifiedPayload = {
        title: 'Titre différent avec la même clé',
        contractType: 'CDD',
        remuneration: 500000,
        location: 'Porto-Novo',
      };

      const response = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'key-create-offer-001',
        },
        body: JSON.stringify(modifiedPayload),
      }));

      assert(response.status === 409, `409 attendu, reçu ${response.status}`);
      const body = await response.json() as { error: { code: string } };
      assert(body.error.code === 'IDEMPOTENCY_CONFLICT', 'code IDEMPOTENCY_CONFLICT attendu');
    });

    await check('P0-E1 Consultation unitaire: GET /offers/:id public/candidat résout l’offre', async () => {
      const response = await harness.worker.fetch(authRequest(`/api/v1/offers/${createdOfferId}`, candidateToken));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as Offer;
      assert(body.id === createdOfferId, 'ID d’offre attendu');
      assert(body.employerName === 'Société Alpha', 'nom employeur projeté');
      assert(body.status === 'ACTIVE', 'statut actif');
    });

    await check('P0-E1 Consultation unitaire: offre inexistante retourne 404', async () => {
      const response = await harness.worker.fetch(authRequest('/api/v1/offers/ofr_inexistant_999', null));
      assert(response.status === 404, `404 attendu, reçu ${response.status}`);
    });

    await check('P0-E1 Liste publique: GET /offers retourne les offres actives', async () => {
      const response = await harness.worker.fetch(authRequest('/api/v1/offers?limit=10', null));
      assert(response.status === 200, `200 attendu, reçu ${response.status}`);
      const body = await response.json() as { items: Offer[]; hasMore: boolean; limit: number };
      assert(Array.isArray(body.items) && body.items.length === 1, 'une offre attendue dans la liste publique');
      assert(body.items[0].id === createdOfferId, 'offre créée présente');
    });

    await check('P0-E1 Liste employeur: GET /my/offers retourne uniquement les offres de l’employeur', async () => {
      // Employer 2 crée sa propre offre
      const resE2 = await harness.worker.fetch(authRequest('/api/v1/offers', employer2Token, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'key-create-offer-e2',
        },
        body: JSON.stringify({
          title: 'Comptable Senior',
          contractType: 'CDD',
          remuneration: 250000,
          location: 'Parakou',
        }),
      }));
      assert(resE2.status === 201, 'offre employeur 2 créée');
      const offerE2 = await resE2.json() as Offer;

      // Employer 1 consulte /my/offers
      const listE1 = await harness.worker.fetch(authRequest('/api/v1/my/offers', employer1Token));
      assert(listE1.status === 200, '200 attendu pour /my/offers employeur 1');
      const bodyE1 = await listE1.json() as { items: Offer[] };
      assert(bodyE1.items.length === 1 && bodyE1.items[0].id === createdOfferId, 'seule l’offre 1 doit être listée pour employeur 1');

      // Employer 2 consulte /my/offers
      const listE2 = await harness.worker.fetch(authRequest('/api/v1/my/offers', employer2Token));
      assert(listE2.status === 200, '200 attendu pour /my/offers employeur 2');
      const bodyE2 = await listE2.json() as { items: Offer[] };
      assert(bodyE2.items.length === 1 && bodyE2.items[0].id === offerE2.id, 'seule l’offre 2 doit être listée pour employeur 2');
    });

    await check('P0-E1 Ownership: tentative de créer une offre pour un autre employeur rejetée (403)', async () => {
      const response = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'key-spoofed-employer',
        },
        body: JSON.stringify({
          employerId: employer2Id, // tentative de créer au nom de l'employeur 2
          title: 'Usurpation d’identité',
          contractType: 'CDI',
          remuneration: 200000,
          location: 'Cotonou',
        }),
      }));

      assert(response.status === 403, `403 attendu pour tentative d’assignation tierce, reçu ${response.status}`);
    });

    await check('P0-E1 Ownership & Visibilité: une offre non-ACTIVE n’est visible que par son propriétaire', async () => {
      // Passer l'offre de l'employeur 1 à PAUSED directement en base
      await harness.database.query("UPDATE offers SET status = 'PAUSED' WHERE id = $1", [createdOfferId]);

      // Le propriétaire peut toujours la consulter via GET /offers/:id
      const ownerRead = await harness.worker.fetch(authRequest(`/api/v1/offers/${createdOfferId}`, employer1Token));
      assert(ownerRead.status === 200, 'le propriétaire doit pouvoir voir sa propre offre en pause');
      const ownerOffer = await ownerRead.json() as Offer;
      assert(ownerOffer.status === 'PAUSED', 'statut PAUSED visible par le propriétaire');

      // Un candidat ne peut pas la voir : 404
      const candidateRead = await harness.worker.fetch(authRequest(`/api/v1/offers/${createdOfferId}`, candidateToken));
      assert(candidateRead.status === 404, 'un candidat ne doit pas voir une offre en pause (404)');

      // Un autre employeur ne peut pas la voir : 404
      const otherEmployerRead = await harness.worker.fetch(authRequest(`/api/v1/offers/${createdOfferId}`, employer2Token));
      assert(otherEmployerRead.status === 404, 'un autre employeur ne doit pas voir l’offre en pause (404)');

      // La liste publique ne la contient plus
      const publicList = await harness.worker.fetch(authRequest('/api/v1/offers', null));
      const publicBody = await publicList.json() as { items: Offer[] };
      assert(!publicBody.items.some(o => o.id === createdOfferId), 'l’offre en pause ne doit pas figurer dans la liste publique');

      // Remettre en ACTIVE
      await harness.database.query("UPDATE offers SET status = 'ACTIVE' WHERE id = $1", [createdOfferId]);
    });

    await check('P0-E1 Rôles: CANDIDATE ne peut pas créer d’offre (403) ni consulter /my/offers (403)', async () => {
      const createRes = await harness.worker.fetch(authRequest('/api/v1/offers', candidateToken, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-candidate-create' },
        body: JSON.stringify({ title: 'Offre Candidat', contractType: 'CDI', remuneration: 100000, location: 'Cotonou' }),
      }));
      assert(createRes.status === 403, `création par candidat attendue 403, reçue ${createRes.status}`);

      const myOffersRes = await harness.worker.fetch(authRequest('/api/v1/my/offers', candidateToken));
      assert(myOffersRes.status === 403, `/my/offers par candidat attendu 403, reçu ${myOffersRes.status}`);
    });

    await check('P0-E1 Rôles: ADMIN ne peut pas créer d’offre directe (403) ni accéder à /my/offers (403)', async () => {
      // Provisionner un token ADMIN
      const adminIdentity: GoogleExternalIdentity = {
        subject: 'google-sub-admin-offers',
        email: 'admin.offers@example.com',
        emailVerified: true,
        displayName: 'Administrateur',
      };
      await harness.database.query(
        "INSERT INTO users (id, role, status, email, display_name) VALUES ('usr_admin_offers', 'ADMIN', 'ACTIVE', 'admin.offers@example.com', 'Administrateur')",
      );
      await harness.database.query(
        "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES ('ses_admin_offers', 'usr_admin_offers', 'dummy_hash', now(), now() + interval '1 hour')",
      );

      // Créer un jeton de session pour cet admin
      const token = 'admin_session_token_direct';
      const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const encodedHash = base64UrlEncode(new Uint8Array(tokenHash));
      await harness.database.query(
        'UPDATE sessions SET token_hash = $1 WHERE id = $2', [encodedHash, 'ses_admin_offers'],
      );

      const adminCreate = await harness.worker.fetch(authRequest('/api/v1/offers', token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-admin-create' },
        body: JSON.stringify({ title: 'Offre Admin', contractType: 'CDI', remuneration: 100000, location: 'Cotonou' }),
      }));
      assert(adminCreate.status === 403, `création par ADMIN attendue 403, reçue ${adminCreate.status}`);

      const adminMyOffers = await harness.worker.fetch(authRequest('/api/v1/my/offers', token));
      assert(adminMyOffers.status === 403, `/my/offers par ADMIN attendu 403, reçu ${adminMyOffers.status}`);
    });

    await check('P0-E1 Accès interdit: absence de session retourne 401 sur création et /my/offers', async () => {
      const anonPost = await harness.worker.fetch(authRequest('/api/v1/offers', null, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-anon-create' },
        body: JSON.stringify({ title: 'Sans Auth', contractType: 'CDI', remuneration: 100000, location: 'Cotonou' }),
      }));
      assert(anonPost.status === 401, `401 attendu sur POST sans auth, reçu ${anonPost.status}`);

      const anonMine = await harness.worker.fetch(authRequest('/api/v1/my/offers', null));
      assert(anonMine.status === 401, `401 attendu sur /my/offers sans auth, reçu ${anonMine.status}`);
    });

    await check('P0-E1 Accès interdit: employeur avec compte BLOQUÉ ne peut pas créer d’offre (401/403)', async () => {
      // Bloquer l'employeur 1
      await harness.database.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [employer1Id]);

      const response = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': 'key-blocked-employer',
        },
        body: JSON.stringify({ title: 'Offre bloquée', contractType: 'CDI', remuneration: 100000, location: 'Cotonou' }),
      }));

      assert(response.status === 401 || response.status === 403, `refus attendu pour employeur bloqué, reçu ${response.status}`);

      // Les offres existantes de l'employeur bloqué disparaissent de la liste publique
      const publicList = await harness.worker.fetch(authRequest('/api/v1/offers', null));
      const body = await publicList.json() as { items: Offer[] };
      assert(!body.items.some(o => o.employerId === employer1Id), 'les offres de l’employeur bloqué ne doivent pas être visibles');

      // Débloquer l'employeur 1
      await harness.database.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [employer1Id]);
    });

    await check('P0-E1 Validation: données obligatoires manquantes ou invalides retournent 400', async () => {
      const base = { title: 'Titre', contractType: 'CDI', remuneration: 100000, location: 'Cotonou' };

      // Manque title
      const noTitle = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'val-1' },
        body: JSON.stringify({ ...base, title: '   ' }),
      }));
      assert(noTitle.status === 400, `titre vide doit retourner 400, reçu ${noTitle.status}`);

      // Manque contractType
      const noContract = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'val-2' },
        body: JSON.stringify({ ...base, contractType: '' }),
      }));
      assert(noContract.status === 400, `type de contrat manquant doit retourner 400, reçu ${noContract.status}`);

      // Rémunération négative
      const negRemun = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'val-3' },
        body: JSON.stringify({ ...base, remuneration: -100 }),
      }));
      assert(negRemun.status === 400, `rémunération négative doit retourner 400, reçu ${negRemun.status}`);

      // Manque location
      const noLocation = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'val-4' },
        body: JSON.stringify({ ...base, location: '' }),
      }));
      assert(noLocation.status === 400, `lieu manquant doit retourner 400, reçu ${noLocation.status}`);

      // Absence de clé d'idempotence
      const noKey = await harness.worker.fetch(authRequest('/api/v1/offers', employer1Token, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(base),
      }));
      assert(noKey.status === 400, `clé d’idempotence manquante doit retourner 400, reçu ${noKey.status}`);
    });

    await check('P0-E1 Rollback: une transaction échouée annule toute écriture dans PostgreSQL', async () => {
      const initialCount = await harness.database.query<{ count: string }>('SELECT count(*) AS count FROM offers');
      const startCount = Number(initialCount.rows[0].count);

      let rolledBack = false;
      try {
        await harness.database.run(async tx => {
          const store = createSqlOfferStore(tx);
          await store.create({
            id: 'ofr_rollback_test',
            employerId: employer1Id,
            title: 'Offre vouée au rollback',
            contractType: 'CDI',
            remuneration: 100000,
            currency: 'FCFA',
            location: 'Cotonou',
            postedDate: new Date().toISOString(),
            status: 'ACTIVE',
            skills: [],
            summary: '',
            responsibilities: [],
            conditions: [],
            selectionProcess: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          // Forcer un échec dans la transaction
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      } catch (error) {
        rolledBack = String((error as Error)?.message ?? error).includes('SIMULATED_TRANSACTION_FAILURE');
      }

      assert(rolledBack, 'l’erreur doit avoir été levée');
      const finalCount = await harness.database.query<{ count: string }>('SELECT count(*) AS count FROM offers');
      assert(Number(finalCount.rows[0].count) === startCount, 'le nombre d’offres en base doit rester inchangé après rollback');

      const lookup = await harness.database.query('SELECT * FROM offers WHERE id = $1', ['ofr_rollback_test']);
      assert(lookup.rows.length === 0, 'l’offre créée dans la transaction avortée ne doit pas exister');
    });

    await check('P0-E1 Séparation DEMO / API: routes hors périmètre OFFRES restent 501', async () => {
      const appRoute = await harness.worker.fetch(authRequest('/api/v1/resources', null));
      assert(appRoute.status === 501, `route hors périmètre /resources doit rester 501, reçu ${appRoute.status}`);

      const complexOfferStatus = await harness.worker.fetch(authRequest(`/api/v1/offers/${createdOfferId}/status`, employer1Token, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-status-update' },
        body: JSON.stringify({ status: 'PAUSED' }),
      }));
      assert(complexOfferStatus.status === 501, `transition complexe d’offre réservée P0-E2 doit rester 501, reçu ${complexOfferStatus.status}`);

      const favoriteRoute = await harness.worker.fetch(authRequest(`/api/v1/offers/${createdOfferId}/favorite`, employer1Token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-fav-001' },
      }));
      assert(favoriteRoute.status === 501, `favoris réservés aux étapes futures doivent rester 501, reçu ${favoriteRoute.status}`);

      // Mode DEMO reste mock par défaut
      assert(getRepositoryMode() === 'mock', 'le mode par défaut du front reste mock');
      assert(resolveRepositoryMode({}).mode === 'mock', 'résolution sans env reste mock');
    });
  } finally {
    await harness.close();
  }

  return results;
}
