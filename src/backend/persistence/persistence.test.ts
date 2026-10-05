/**
 * LE LABEUR — P0-A — tests de la fondation PostgreSQL.
 *
 * Ces tests ne se connectent à AUCUNE base : ils vérifient
 *  - la cohérence des migrations SQL avec les types du domaine et les colonnes
 *    réellement utilisées par les adaptateurs ;
 *  - le comportement de l'adaptateur PostgreSQL (transactions, erreurs,
 *    paramétrage, expurgation de secrets) au travers d'un pilote factice ;
 *  - la matrice de configuration Worker ↔ Hyperdrive ;
 *  - la séparation DEMO/API (le bundle navigateur n'atteint jamais la couche
 *    PostgreSQL, et la frontière reste fermée par défaut).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRepositoryMode } from '../../repositories/mode';
import { getRepositoryMode } from '../../repositories/provider';
import { composeWorker, resolveWorkerPersistence } from '../api/entry';
import { createApiWorker } from '../api/worker';
import { ADMIN_PERMISSIONS } from '../identity/permissions';
import {
  PLACEHOLDER_CONNECTION_STRING,
  describePostgresTarget,
  requestedPersistenceMode,
  resolvePersistenceDecision,
  resolvePostgresTarget,
} from './config';
import {
  APPLICATION_STATUS_VALUES,
  COMMISSION_STATUS_VALUES,
  CONTRACT_STATUS_VALUES,
  CORE_DOMAIN_EXACTNESS,
  CORE_TABLES,
  CoreStoreError,
  OFFER_STATUS_VALUES,
  USER_ROLE_VALUES,
  type ApplicationRecord,
  type ContractRecord,
  type OfferRecord,
} from './coreRecords';
import { createInMemoryCoreStores } from './coreStores';
import { createPostgresDatabase } from './postgresDatabase';
import { createSqlCoreStores } from './sqlCoreStores';
import {
  SqlClientContractError,
  postgresErrorCode,
  redactSqlSecrets,
  toPostgresClientPort,
  type DriverConnectionLike,
  type DriverPoolLike,
  type DriverQueryResult,
} from './sqlClient';

export interface PostgresFoundationTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/* ------------------------------------------------------------------ */
/* Analyse SQL (sous-ensemble strictement limité aux migrations écrites ici) */
/* ------------------------------------------------------------------ */

interface ColumnSpec {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
}

type Schema = Map<string, Map<string, ColumnSpec>>;

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n');
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const COLUMN_CONSTRAINT_KEYWORDS = new Set(['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude']);

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter(name => name.endsWith('.sql')).sort();
}

function migrationSql(files: string[]): string {
  return files.map(name => read(resolve(MIGRATIONS_DIR, name))).join('\n');
}

function buildSchema(sql: string): Schema {
  const schema: Schema = new Map();
  let match: RegExpExecArray | null;

  const createTable = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
  while ((match = createTable.exec(sql))) {
    const columns = new Map<string, ColumnSpec>();
    for (const rawPart of splitTopLevel(match[2])) {
      const part = rawPart.trim();
      if (!part) continue;
      const name = part.split(/\s+/)[0];
      if (COLUMN_CONSTRAINT_KEYWORDS.has(name.toLowerCase())) continue;
      if (!/^[a-z_]+$/.test(name)) continue;
      columns.set(name, {
        name,
        notNull: /\bNOT NULL\b/i.test(part),
        hasDefault: /\bDEFAULT\b/i.test(part),
      });
    }
    schema.set(match[1], columns);
  }

  const addColumn = /ALTER TABLE\s+([a-z_]+)\s+ADD COLUMN IF NOT EXISTS\s+([a-z_]+)\s+([^;]*);/gi;
  while ((match = addColumn.exec(sql))) {
    const columns = schema.get(match[1]);
    if (!columns) continue;
    columns.set(match[2], {
      name: match[2],
      notNull: /\bNOT NULL\b/i.test(match[3]),
      hasDefault: /\bDEFAULT\b/i.test(match[3]),
    });
  }

  const setDefault = /ALTER TABLE\s+([a-z_]+)\s+ALTER COLUMN\s+([a-z_]+)\s+SET DEFAULT/gi;
  while ((match = setDefault.exec(sql))) {
    const column = schema.get(match[1])?.get(match[2]);
    if (column) column.hasDefault = true;
  }

  const setNotNull = /ALTER TABLE\s+([a-z_]+)\s+ALTER COLUMN\s+([a-z_]+)\s+SET NOT NULL/gi;
  while ((match = setNotNull.exec(sql))) {
    const column = schema.get(match[1])?.get(match[2]);
    if (column) column.notNull = true;
  }

  const rename = /ALTER TABLE\s+([a-z_]+)\s+RENAME COLUMN\s+([a-z_]+)\s+TO\s+([a-z_]+)/gi;
  while ((match = rename.exec(sql))) {
    const columns = schema.get(match[1]);
    const column = columns?.get(match[2]);
    if (!columns || !column) continue;
    columns.delete(match[2]);
    columns.set(match[3], { ...column, name: match[3] });
  }
  return schema;
}

/** Domaines d'états : `CHECK (col IN (...))` inline ou via ADD CONSTRAINT. */
function collectStatusDomains(sql: string): Map<string, string[]> {
  const domains = new Map<string, string[]>();
  const inline = /CHECK\s*\(\s*([a-z_]+)\s+IN\s*\(([^)]*)\)\s*\)/gi;
  const createTable = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
  let match: RegExpExecArray | null;
  while ((match = createTable.exec(sql))) {
    const bodyInline = new RegExp(inline.source, 'gi');
    let columnMatch: RegExpExecArray | null;
    while ((columnMatch = bodyInline.exec(match[2]))) {
      domains.set(`${match[1]}.${columnMatch[1]}`, parseInList(columnMatch[2]));
    }
  }
  const altered = /ALTER TABLE\s+([a-z_]+)\s+ADD CONSTRAINT\s+[a-z_]+\s+CHECK\s*\(\s*([a-z_]+)\s+IN\s*\(([^)]*)\)\s*\)/gi;
  while ((match = altered.exec(sql))) {
    domains.set(`${match[1]}.${match[2]}`, parseInList(match[3]));
  }
  return domains;
}

function parseInList(list: string): string[] {
  return list
    .split(',')
    .map(value => value.trim().replace(/^'/, '').replace(/'$/, ''))
    .filter(Boolean)
    .sort();
}

interface WriteStatement {
  table: string;
  columns: string[];
  kind: 'insert' | 'update';
}

function extractWriteStatements(sql: string): WriteStatement[] {
  const statements: WriteStatement[] = [];
  let match: RegExpExecArray | null;
  const insert = /INSERT INTO\s+([a-z_]+)\s*\(([\s\S]*?)\)\s*VALUES/gi;
  while ((match = insert.exec(sql))) {
    statements.push({
      table: match[1],
      kind: 'insert',
      columns: match[2]
        .split(',')
        .map(column => column.trim())
        .filter(column => /^[a-z_]+$/.test(column)),
    });
  }
  const update = /UPDATE\s+([a-z_]+)\s+SET\s+([\s\S]*?)\s+WHERE/gi;
  while ((match = update.exec(sql))) {
    statements.push({
      table: match[1],
      kind: 'update',
      columns: splitTopLevel(match[2])
        .map(assignment => assignment.split('=')[0].trim())
        .filter(column => /^[a-z_]+$/.test(column)),
    });
  }
  return statements;
}

/* ------------------------------------------------------------------ */
/* Pilote factice                                                     */
/* ------------------------------------------------------------------ */

type Responder = (sql: string, values: readonly unknown[]) => DriverQueryResult<Record<string, unknown>>;

class ScriptedDriver implements DriverPoolLike {
  readonly statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  released = 0;
  connects = 0;

  constructor(private readonly responder: Responder) {}

  async query<Row = Record<string, unknown>>(sql: string, values: readonly unknown[] = []): Promise<DriverQueryResult<Row>> {
    this.statements.push({ sql, values });
    return this.responder(sql, values) as unknown as DriverQueryResult<Row>;
  }

  async connect(): Promise<DriverConnectionLike> {
    this.connects += 1;
    return {
      query: <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => this.query<Row>(text, values),
      release: () => {
        this.released += 1;
      },
    };
  }

  get sqlText(): string {
    return this.statements.map(statement => statement.sql).join('\n');
  }
}

class QueryOnlyDriver implements DriverPoolLike {
  async query<Row = Record<string, unknown>>(): Promise<DriverQueryResult<Row>> {
    return { rows: [] as Row[], rowCount: 0 };
  }
}

function respondWith(row: Record<string, unknown>): Responder {
  return () => ({ rows: [row], rowCount: 1 });
}

function postgresFailure(code: string, message = 'erreur PostgreSQL simulée'): Responder {
  return () => {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    throw error;
  };
}

const offerRow: Record<string, unknown> = {
  id: 'ofr_test',
  employer_id: 'usr_employer',
  title: 'Cuisinier',
  status: 'ACTIVE',
  contract_type: 'CDI',
  remuneration: '75000.00',
  currency: 'FCFA',
  location: 'Cotonou',
  department_id: 'littoral',
  municipality_id: null,
  arrondissement_id: null,
  locality_id: null,
  location_label: 'Cotonou, Littoral',
  domain_id: null,
  job_id: null,
  posted_date: '2026-09-01T00:00:00.000Z',
  is_urgent: false,
  is_le_labeur_job: true,
  le_labeur_tag: 'URGENT',
  skills: ['cuisine'],
  summary: 'Résumé',
  responsibilities: [],
  conditions: [],
  selection_process: [],
  start_date: '2026-10-01',
  duration_months: 6,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
};

const applicationRow: Record<string, unknown> = {
  id: 'app_test',
  offer_id: 'ofr_test',
  candidate_id: 'usr_candidate',
  status: 'PENDING',
  applied_date: '2026-09-03T00:00:00.000Z',
  note: null,
  remuneration: '75000',
  contract_id: null,
  history: [{ action: 'APPLIED', timestamp: '2026-09-03T00:00:00.000Z', actor: 'CANDIDATE' }],
  created_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
};

const contractRow: Record<string, unknown> = {
  id: 'ctr_test',
  offer_id: 'ofr_test',
  application_id: 'app_test',
  employer_id: 'usr_employer',
  candidate_id: 'usr_candidate',
  status: 'SIGNATURE',
  monthly_salary: '75000.00',
  currency: 'FCFA',
  start_date: '2026-10-01T00:00:00.000Z',
  end_date: null,
  current_month: 1,
  duration_months: 6,
  periodicity: 'Mensuel',
  mission_description: 'Mission',
  location: 'Cotonou',
  conditions: ['8 h/jour'],
  additional_notes: null,
  employer_signed: true,
  employee_signed: false,
  employer_signed_at: null,
  employee_signed_at: null,
  commission_percentage: '25.00',
  commission_amount_due: '18750.00',
  commission_status: 'SCHEDULED',
  monthly_checkpoints: [],
  commission_ledger: [],
  payment_schedule: [],
  history: JSON.stringify([{ action: 'CREATED', timestamp: '2026-09-10T00:00:00.000Z', actor: 'EMPLOYER' }]),
  replacement_id: null,
  replaced_contract_id: null,
  incident_id: null,
  created_at: '2026-09-10T00:00:00.000Z',
  updated_at: '2026-09-10T00:00:00.000Z',
};

const coreRowResponder: Responder = sql => {
  if (/applications/.test(sql)) return { rows: [applicationRow], rowCount: 1 };
  if (/contracts/.test(sql)) return { rows: [contractRow], rowCount: 1 };
  return { rows: [offerRow], rowCount: 1 };
};

const validOffer: OfferRecord = {
  id: 'ofr_test',
  employerId: 'usr_employer',
  title: 'Cuisinier',
  contractType: 'CDI',
  remuneration: 75_000,
  currency: 'FCFA',
  location: 'Cotonou',
  postedDate: '2026-09-01T00:00:00.000Z',
  isUrgent: false,
  isLeLabeurJob: false,
  skills: ['cuisine'],
  summary: 'Résumé',
  responsibilities: [],
  conditions: [],
  selectionProcess: [],
  status: 'ACTIVE',
  startDate: '2026-10-01',
  durationMonths: 6,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const validApplication: ApplicationRecord = {
  id: 'app_test',
  offerId: 'ofr_test',
  candidateId: 'usr_candidate',
  status: 'PENDING',
  appliedDate: '2026-09-03T00:00:00.000Z',
  history: [],
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
};

const validContract: ContractRecord = {
  id: 'ctr_test',
  offerId: 'ofr_test',
  applicationId: 'app_test',
  employerId: 'usr_employer',
  employeeId: 'usr_candidate',
  status: 'SIGNATURE',
  monthlySalary: 75_000,
  currency: 'FCFA',
  startDate: '2026-10-01',
  currentMonth: 1,
  durationMonths: 6,
  periodicity: 'Mensuel',
  missionDescription: 'Mission',
  location: 'Cotonou',
  conditions: ['8 h/jour'],
  employerSigned: false,
  employeeSigned: false,
  commissionPercentage: 25,
  commissionAmountDue: 18_750,
  commissionStatus: 'SCHEDULED',
  monthlyCheckpoints: [],
  commissionLedger: [],
  paymentSchedule: [],
  history: [],
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};

/* ------------------------------------------------------------------ */
/* Suite                                                              */
/* ------------------------------------------------------------------ */

export async function runPostgresFoundationTests(): Promise<PostgresFoundationTestResult[]> {
  const results: PostgresFoundationTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const expectCoreError = async (
    action: () => Promise<unknown>,
    failure: CoreStoreError['failure'],
  ): Promise<void> => {
    try {
      await action();
    } catch (error) {
      assert(error instanceof CoreStoreError, `CoreStoreError attendue, reçu ${String(error)}`);
      assert(
        (error as CoreStoreError).failure === failure,
        `échec attendu ${failure}, reçu ${(error as CoreStoreError).failure}`,
      );
      return;
    }
    throw new Error(`aucune erreur levée (attendu ${failure})`);
  };

  const files = migrationFiles();
  const sql = migrationSql(files);
  const schema = buildSchema(sql);
  const domains = collectStatusDomains(sql);

  /* -------------------- 1. Migrations -------------------- */

  await check('Migrations: fichiers numérotés sans trou ni doublon', () => {
    assert(files.length >= 3, 'les migrations 0001, 0002 et 0003 doivent être présentes');
    const prefixes = files.map(name => name.split('_')[0]);
    assert(new Set(prefixes).size === prefixes.length, 'préfixe de migration dupliqué');
    prefixes.forEach((prefix, index) => {
      assert(prefix === String(index + 1).padStart(4, '0'), `numérotation non contiguë: ${prefix}`);
    });
  });

  await check('Migrations: chaque fichier ouvre et ferme une transaction', () => {
    for (const name of files) {
      const content = stripSqlComments(read(resolve(MIGRATIONS_DIR, name)));
      assert(/\bBEGIN;/.test(content), `${name} doit ouvrir une transaction`);
      assert(/\bCOMMIT;/.test(content), `${name} doit fermer une transaction`);
      assert(!/\bROLLBACK\b/.test(content), `${name} ne doit pas contenir de ROLLBACK`);
    }
  });

  await check('Migrations: aucune instruction destructrice', () => {
    const stripped = stripSqlComments(sql);
    for (const forbidden of [/\bDROP TABLE\b/i, /\bDROP COLUMN\b/i, /\bTRUNCATE\b/i, /\bDELETE FROM\b/i]) {
      assert(!forbidden.test(stripped), `instruction destructrice détectée: ${forbidden}`);
    }
    assert(!/\bDROP CONSTRAINT\b(?! IF EXISTS)/i.test(stripped), 'tout DROP CONSTRAINT doit être gardé par IF EXISTS');
  });

  await check('Migrations: les 9 tables du noyau sont créées', () => {
    for (const table of CORE_TABLES) {
      assert(schema.has(table), `table manquante: ${table}`);
      assert(schema.get(table)!.size > 0, `table vide: ${table}`);
    }
    const extra = [...schema.keys()].filter(key => !CORE_TABLES.includes(key as (typeof CORE_TABLES)[number]));
    assert(extra.length === 0, `tables hors noyau détectées: ${extra.join(', ')}`);
  });

  await check('Migrations: domaines d’états identiques aux types TypeScript', () => {
    assert(CORE_DOMAIN_EXACTNESS.every(Boolean), 'les garde-fous de compilation des domaines doivent être vrais');
    const expected: Array<[string, readonly string[]]> = [
      ['users.role', USER_ROLE_VALUES],
      ['offers.status', OFFER_STATUS_VALUES],
      ['applications.status', APPLICATION_STATUS_VALUES],
      ['contracts.status', CONTRACT_STATUS_VALUES],
      ['contracts.commission_status', COMMISSION_STATUS_VALUES],
    ];
    for (const [key, values] of expected) {
      const found = domains.get(key);
      assert(found, `aucune contrainte CHECK trouvée pour ${key}`);
      assert(
        JSON.stringify(found) === JSON.stringify([...values].sort()),
        `domaine ${key} désaligné: SQL=${JSON.stringify(found)} types=${JSON.stringify([...values].sort())}`,
      );
    }
  });

  await check('Migrations: seed des permissions identique à ADMIN_PERMISSIONS', () => {
    const seed = read(resolve(MIGRATIONS_DIR, '0002_role_permissions_seed.sql'));
    const codes = [...seed.matchAll(/\('([a-z:_]+)'\)/g)].map(match => match[1]).sort();
    assert(codes.length === ADMIN_PERMISSIONS.length, `attendu ${ADMIN_PERMISSIONS.length} permissions, trouvé ${codes.length}`);
    assert(JSON.stringify(codes) === JSON.stringify([...ADMIN_PERMISSIONS].sort()), 'le seed SQL et ADMIN_PERMISSIONS divergent');
  });

  await check('Migrations: 0003 rejouable, renommage gardé', () => {
    const alignment = stripSqlComments(read(resolve(MIGRATIONS_DIR, '0003_core_nucleus_alignment.sql')));
    const statements = alignment.split(';');
    let addedColumns = 0;
    for (const statement of statements) {
      if (/ADD COLUMN/i.test(statement)) {
        addedColumns += 1;
        assert(/ADD COLUMN IF NOT EXISTS/i.test(statement), `ADD COLUMN non rejouable: ${statement.trim().slice(0, 60)}`);
      }
      if (/DROP CONSTRAINT/i.test(statement)) {
        assert(/DROP CONSTRAINT IF EXISTS/i.test(statement), `DROP CONSTRAINT non gardé: ${statement.trim().slice(0, 60)}`);
      }
    }
    assert(addedColumns > 0, '0003 doit ajouter des colonnes');
    assert(/DO \$\$[\s\S]*information_schema\.columns[\s\S]*END \$\$/.test(alignment), 'le renommage doit être gardé par un bloc conditionnel');
    assert(/RENAME COLUMN salary TO monthly_salary/.test(alignment), 'le renommage attendu doit être présent');
  });

  await check('Migrations: aucun secret ni chaîne de connexion', () => {
    for (const name of files) {
      const content = read(resolve(MIGRATIONS_DIR, name));
      assert(!/postgres(ql)?:\/\//i.test(content), `${name} contient une chaîne de connexion`);
      assert(!/password\s*=/i.test(content), `${name} contient un mot de passe`);
    }
  });

  await check('Schéma: les colonnes écrites par les adaptateurs existent', async () => {
    const driver = new ScriptedDriver(coreRowResponder);
    const stores = createSqlCoreStores(createPostgresDatabase(toPostgresClientPort(driver)));
    await stores.offers.create(validOffer);
    await stores.offers.updateStatus('ofr_test', 'PAUSED', '2026-09-02T00:00:00.000Z');
    await stores.applications.create(validApplication);
    await stores.applications.updateStatus('app_test', 'REVIEW', '2026-09-04T00:00:00.000Z', 'ctr_test');
    await stores.contracts.create(validContract);
    await stores.contracts.updateStatus('ctr_test', 'ACTIVE', '2026-09-11T00:00:00.000Z');

    const writes = extractWriteStatements(driver.sqlText);
    assert(writes.length >= 6, `au moins 6 écritures attendues, trouvées ${writes.length}`);
    for (const write of writes) {
      const columns = schema.get(write.table);
      assert(columns, `table inconnue des migrations: ${write.table}`);
      for (const column of write.columns) {
        assert(
          columns!.has(column),
          `colonne absente du schéma: ${write.table}.${column} (${write.kind})`,
        );
      }
    }
  });

  await check('Schéma: colonnes NOT NULL sans défaut fournies par les INSERT', async () => {
    const driver = new ScriptedDriver(coreRowResponder);
    const stores = createSqlCoreStores(createPostgresDatabase(toPostgresClientPort(driver)));
    await stores.offers.create(validOffer);
    await stores.applications.create(validApplication);
    await stores.contracts.create(validContract);

    const writes = extractWriteStatements(driver.sqlText).filter(write => write.kind === 'insert');
    for (const table of ['offers', 'applications', 'contracts']) {
      const columns = schema.get(table)!;
      const provided = new Set(writes.filter(write => write.table === table).flatMap(write => write.columns));
      assert(provided.size > 0, `aucun INSERT collecté pour ${table}`);
      for (const column of columns.values()) {
        if (!column.notNull || column.hasDefault) continue;
        assert(provided.has(column.name), `colonne NOT NULL sans défaut non fournie: ${table}.${column.name}`);
      }
    }
  });

  /* -------------------- 2. Adaptateur -------------------- */

  await check('Adaptateur: pilote sans connexion dédiée → transactions refusées', async () => {
    const port = toPostgresClientPort(new QueryOnlyDriver());
    const database = createPostgresDatabase(port);
    let failure: unknown = null;
    try {
      await database.run(async () => 'jamais exécuté');
    } catch (error) {
      failure = error;
    }
    assert(failure instanceof SqlClientContractError, `SqlClientContractError attendue, reçu ${String(failure)}`);
    assert(port.end === undefined, 'aucune méthode end ne doit être inventée');
  });

  await check('Adaptateur: résultat normalisé quand rowCount est nul', async () => {
    const driver = new ScriptedDriver(() => ({ rows: [offerRow], rowCount: null }));
    const port = toPostgresClientPort(driver);
    const result = await port.query('SELECT * FROM offers');
    assert(result.rowCount === 1, 'rowCount nul doit être remplacé par le nombre de lignes');
    const empty = toPostgresClientPort(new ScriptedDriver(() => ({ rows: [], rowCount: null })));
    assert((await empty.query('SELECT 1')).rowCount === 0, 'rowCount 0 attendu pour un résultat vide');
    let rejected = false;
    try {
      await toPostgresClientPort(new ScriptedDriver(() => ({} as DriverQueryResult<Record<string, unknown>>))).query('SELECT 1');
    } catch {
      rejected = true;
    }
    assert(rejected, 'un résultat sans lignes doit être refusé explicitement');
  });

  await check('Adaptateur: BEGIN / SET LOCAL / COMMIT dans l’ordre', async () => {
    const driver = new ScriptedDriver(respondWith(offerRow));
    const database = createPostgresDatabase(toPostgresClientPort(driver), {
      statementTimeoutMs: 5_000,
      applicationName: 'lelabeur-test',
    });
    const value = await database.run(async transaction => {
      assert(typeof transaction.transactionId === 'string' && transaction.transactionId.length > 0, 'transactionId requis');
      await transaction.query('SELECT 1');
      return 'ok';
    });
    assert(value === 'ok', 'la transaction doit restituer le résultat');
    const sequence = driver.statements.map(statement => statement.sql);
    assert(sequence[0] === 'BEGIN', `séquence inattendue: ${sequence.join(' | ')}`);
    assert(sequence[1] === 'SET LOCAL statement_timeout = 5000', `timeout inattendu: ${sequence[1]}`);
    assert(sequence[2] === "SET LOCAL application_name = 'lelabeur-test'", `application_name inattendu: ${sequence[2]}`);
    assert(sequence[sequence.length - 1] === 'COMMIT', 'la transaction doit se terminer par COMMIT');
    assert(driver.released === 1, 'la connexion doit être libérée exactement une fois');
    assert(driver.connects === 1, 'une seule connexion dédiée doit être ouverte');
  });

  await check('Adaptateur: ROLLBACK sur erreur et libération systématique', async () => {
    const driver = new ScriptedDriver(respondWith(offerRow));
    const database = createPostgresDatabase(toPostgresClientPort(driver));
    let failure: unknown = null;
    try {
      await database.run(async () => {
        throw new Error('échec métier simulé');
      });
    } catch (error) {
      failure = error;
    }
    assert((failure as Error)?.message === 'échec métier simulé', 'l’erreur d’origine doit être propagée');
    assert(driver.statements.map(statement => statement.sql).includes('ROLLBACK'), 'ROLLBACK attendu');
    assert(driver.released === 1, 'la connexion doit être libérée après échec');
  });

  await check('Adaptateur: transactions HTTP simultanées utilisent des connexions indépendantes', async () => {
    const driver = new ScriptedDriver(respondWith(offerRow));
    const database = createPostgresDatabase(toPostgresClientPort(driver));
    let entered = 0;
    let releaseBarrier = () => {};
    const barrier = new Promise<void>(resolve => { releaseBarrier = resolve; });
    const transaction = () => database.run(async connection => {
      entered += 1;
      if (entered === 2) releaseBarrier();
      await barrier;
      await connection.query('SELECT 1');
      return connection.transactionId;
    });

    const ids = await Promise.all([transaction(), transaction()]);
    assert(ids[0] !== ids[1], 'chaque transaction doit avoir son propre identifiant.');
    assert(driver.connects === 2 && driver.released === 2, 'deux connexions dédiées doivent être acquises et libérées.');
    assert(driver.statements.filter(statement => statement.sql === 'BEGIN').length === 2, 'les deux transactions doivent démarrer.');
    assert(driver.statements.filter(statement => statement.sql === 'COMMIT').length === 2, 'les deux transactions doivent valider.');
  });

  await check('Adaptateur: timeout et application_name validés (aucune injection)', () => {
    const port = toPostgresClientPort(new ScriptedDriver(respondWith(offerRow)));
    for (const options of [
      { statementTimeoutMs: 10 },
      { statementTimeoutMs: 999_999 },
      { statementTimeoutMs: 12.5 },
      { applicationName: "a'; DROP TABLE users; --" },
      { applicationName: 'LeLabeur' },
    ]) {
      let thrown = false;
      try {
        createPostgresDatabase(port, options);
      } catch {
        thrown = true;
      }
      assert(thrown, `options invalides acceptées: ${JSON.stringify(options)}`);
    }
  });

  await check('Adaptateur: secrets absents des erreurs et de la sonde', async () => {
    const secret = 'postgresql://lelabeur:sup3r-s3cret@db.example.com:5432/lelabeur';
    const driver = new ScriptedDriver(() => {
      throw new Error(`connexion refusée pour ${secret} (password=sup3r-s3cret)`);
    });
    const database = createPostgresDatabase(toPostgresClientPort(driver), { redactSecrets: [secret] });
    const health = await database.check();
    assert(health.reachable === false, 'la sonde doit signaler l’échec');
    assert(typeof health.latencyMs === 'number', 'la latence doit être mesurée');
    assert(health.error !== undefined && !health.error.includes('sup3r-s3cret'), `secret présent dans l’erreur: ${health.error}`);
    assert(health.error?.includes('[secret-redacted]'), 'l’erreur doit être expurgée');
    assert(redactSqlSecrets('password=hunter2 reste', []) === 'password=[redacted] reste', 'motif password=… non expurgé');
    assert(postgresErrorCode({ code: '23505' }) === '23505', 'code PostgreSQL attendu');
    assert(postgresErrorCode(new Error('sans code')) === undefined, 'un code absent doit rester absent');
    const healthy = await createPostgresDatabase(toPostgresClientPort(new ScriptedDriver(respondWith(offerRow)))).check();
    assert(healthy.reachable === true && healthy.error === undefined, 'sonde nominale attendue');
  });

  /* -------------------- 3. Stores du noyau -------------------- */

  await check('Noyau SQL: insertions paramétrées, aucune interpolation', async () => {
    const driver = new ScriptedDriver(coreRowResponder);
    const stores = createSqlCoreStores(createPostgresDatabase(toPostgresClientPort(driver)));
    const hostile = { ...validOffer, title: 'Titre « piégé » ${injection} ; DROP TABLE offers' };
    await stores.offers.create(hostile);
    const insert = driver.statements.at(-1)!;
    assert(/^INSERT INTO offers/.test(insert.sql), 'INSERT INTO offers attendu');
    assert(!insert.sql.includes('injection'), 'aucune valeur ne doit être interpolée dans le SQL');
    const placeholders = [...insert.sql.matchAll(/\$(\d+)/g)].map(match => Number(match[1]));
    const maxPlaceholder = Math.max(...placeholders);
    assert(maxPlaceholder === insert.values.length, `placeholders=${maxPlaceholder} valeurs=${insert.values.length}`);
    assert(new Set(placeholders).size === maxPlaceholder, 'placeholders non contigus');
    assert(insert.values.includes(hostile.title), 'la valeur doit être transmise en paramètre');
    assert(driver.sqlText.includes('RETURNING *'), 'les INSERT doivent retourner la ligne écrite');
  });

  await check('Noyau SQL: mapping ligne → enregistrement (JSONB objet et texte)', async () => {
    const driver = new ScriptedDriver(coreRowResponder);
    const stores = createSqlCoreStores(createPostgresDatabase(toPostgresClientPort(driver)));
    const contract = await stores.contracts.findById('ctr_test');
    assert(contract !== null, 'le contrat doit être lu');
    assert(contract!.employeeId === 'usr_candidate', 'candidate_id doit devenir employeeId');
    assert(contract!.monthlySalary === 75_000, 'monthly_salary numérique attendu');
    assert(contract!.commissionPercentage === 25, 'commission_percentage numérique attendu');
    assert(contract!.startDate === '2026-10-01', `date attendue 2026-10-01, reçue ${contract!.startDate}`);
    assert(contract!.history.length === 1, 'history JSONB texte doit être désérialisé');
    assert(contract!.employerSigned === true && contract!.employeeSigned === false, 'signatures mal mappées');
    assert(contract!.applicationId === 'app_test', 'application_id attendu');

    const offer = await stores.offers.findById('ofr_test');
    assert(offer!.skills[0] === 'cuisine', 'skills JSONB attendu');
    assert(offer!.leLabeurTag === 'URGENT', 'le_labeur_tag attendu');
    assert(offer!.durationMonths === 6, 'duration_months attendu');

    const application = await stores.applications.findById('app_test');
    assert(application!.remuneration === 75_000, 'remuneration numérique attendue');
    assert(application!.history.length === 1, 'history candidature attendu');
  });

  await check('Noyau SQL: erreurs PostgreSQL traduites, autres erreurs propagées', async () => {
    const duplicate = createSqlCoreStores(
      createPostgresDatabase(toPostgresClientPort(new ScriptedDriver(postgresFailure('23505')))),
    );
    await expectCoreError(() => duplicate.applications.create(validApplication), 'DUPLICATE');
    await expectCoreError(() => duplicate.offers.create(validOffer), 'DUPLICATE');

    const invalidStatus = createSqlCoreStores(
      createPostgresDatabase(toPostgresClientPort(new ScriptedDriver(postgresFailure('23514')))),
    );
    await expectCoreError(() => invalidStatus.offers.updateStatus('ofr_test', 'PAUSED', '2026-09-02T00:00:00.000Z'), 'INVALID_STATUS');

    const missingReference = createSqlCoreStores(
      createPostgresDatabase(toPostgresClientPort(new ScriptedDriver(postgresFailure('23503')))),
    );
    await expectCoreError(() => missingReference.applications.create(validApplication), 'CONSTRAINT');

    const network = createSqlCoreStores(
      createPostgresDatabase(toPostgresClientPort(new ScriptedDriver(postgresFailure('08006')))),
    );
    let propagated = '';
    try {
      await network.offers.findById('ofr_test');
    } catch (error) {
      propagated = String((error as Error)?.message ?? error);
    }
    assert(propagated === 'erreur PostgreSQL simulée', `l’erreur inconnue doit être propagée telle quelle, reçu « ${propagated} »`);

    await expectCoreError(
      () => duplicate.offers.updateStatus('ofr_test', 'INEXISTANT' as never, '2026-09-02T00:00:00.000Z'),
      'INVALID_STATUS',
    );
    await expectCoreError(
      () => duplicate.contracts.updateStatus('ctr_test', 'INEXISTANT' as never, '2026-09-02T00:00:00.000Z'),
      'INVALID_STATUS',
    );
  });

  await check('Noyau SQL: permissions = union rôle + utilisateur', async () => {
    const driver = new ScriptedDriver(sql =>
      /user_permissions/.test(sql)
        ? { rows: [{ permission_code: 'payments:approve' }], rowCount: 1 }
        : { rows: [{ permission_code: 'users:block' }], rowCount: 1 },
    );
    const stores = createSqlCoreStores(createPostgresDatabase(toPostgresClientPort(driver)));
    const effective = await stores.permissions.listEffectivePermissions('usr_admin', 'ADMIN');
    assert(effective.length === 1, 'la requête effective doit être une union dédupliquée');
    const union = driver.statements.at(-1)!;
    assert(/UNION/.test(union.sql), 'UNION attendue');
    assert(JSON.stringify(union.values) === JSON.stringify(['ADMIN', 'usr_admin']), `paramètres inattendus: ${JSON.stringify(union.values)}`);
    await stores.permissions.listRolePermissions('ADMIN');
    assert(/FROM role_permissions WHERE role = \$1/.test(driver.statements.at(-1)!.sql), 'requête rôle attendue');
    await stores.permissions.listUserPermissions('usr_admin');
    assert(/FROM user_permissions WHERE user_id = \$1/.test(driver.statements.at(-1)!.sql), 'requête utilisateur attendue');
  });

  await check('Noyau mémoire: mêmes règles que le noyau SQL', async () => {
    const stores = createInMemoryCoreStores();
    await stores.offers.create(validOffer);
    await expectCoreError(() => stores.offers.create(validOffer), 'DUPLICATE');
    await expectCoreError(() => stores.offers.updateStatus('ofr_test', 'DRAFT' as never, '2026-09-02T00:00:00.000Z'), 'INVALID_STATUS');
    assert((await stores.offers.updateStatus('ofr_test', 'PAUSED', '2026-09-02T00:00:00.000Z'))?.status === 'PAUSED', 'mise à jour de statut attendue');
    assert((await stores.offers.findById('absent')) === null, 'offre absente → null');

    await stores.applications.create(validApplication);
    await expectCoreError(() => stores.applications.create({ ...validApplication, id: 'app_test_2' }), 'DUPLICATE');
    assert((await stores.applications.listByOffer('ofr_test')).length === 1, 'une candidature attendue par offre');

    await stores.contracts.create(validContract);
    assert((await stores.contracts.listByEmployee('usr_candidate')).length === 1, 'contrat attendu pour le salarié');
    assert((await stores.contracts.listByEmployer('usr_employer', 1)).length === 1, 'limite respectée');
    assert((await stores.contracts.updateStatus('ctr_test', 'ACTIVE', '2026-09-11T00:00:00.000Z'))?.status === 'ACTIVE', 'statut contrat attendu');

    const permissions = await stores.permissions.listEffectivePermissions('usr_admin', 'ADMIN');
    assert(permissions.length === ADMIN_PERMISSIONS.length, 'l’ADMIN doit hériter des 24 permissions');
    assert((await stores.permissions.listEffectivePermissions('usr_candidate', 'CANDIDATE')).length === 0, 'aucune permission transverse pour CANDIDATE');
  });

  /* -------------------- 4. Configuration -------------------- */

  await check('Config: absent → fermé (aucune ouverture implicite)', () => {
    assert(requestedPersistenceMode({}) === undefined, 'aucun mode ne doit être déduit');
    assert(resolvePersistenceDecision({}).kind === 'closed', 'sans configuration la persistance reste fermée');
    assert(resolvePersistenceDecision({ PERSISTENCE: 'closed' }).reason === 'explicitly-closed', 'motif explicite attendu');
  });

  await check('Config: mode mémoire explicite et alias historique', () => {
    assert(resolvePersistenceDecision({ PERSISTENCE: 'memory' }).kind === 'memory', 'memory attendu');
    assert(resolvePersistenceDecision({ PERSISTENCE: 'MEMORY ' }).kind === 'memory', 'casse et espaces tolérés');
    assert(resolvePersistenceDecision({ IDENTITY_STORE: 'memory' }).reason === 'explicit-memory-store', 'alias historique attendu');
    assert(
      resolvePersistenceDecision({ IDENTITY_STORE: 'postgres' }).kind === 'misconfigured',
      'postgres sans connexion ne doit pas retomber en mémoire',
    );
  });

  await check('Config: mode inconnu → misconfigured', () => {
    const decision = resolvePersistenceDecision({ PERSISTENCE: 'mysql' });
    assert(decision.kind === 'misconfigured', 'mode inconnu refusé');
    assert(decision.reason === 'invalid-persistence-mode', `motif inattendu: ${decision.reason}`);
  });

  await check('Config: postgres sans binding ni client → misconfigured', () => {
    const decision = resolvePersistenceDecision({ PERSISTENCE: 'postgres' });
    assert(
      decision.kind === 'misconfigured' && decision.reason === 'missing-sql-client',
      `décision inattendue: ${JSON.stringify(decision)}`,
    );
    const withClient = resolvePersistenceDecision({ PERSISTENCE: 'postgres' }, { hasSqlClient: true });
    assert(withClient.kind === 'misconfigured' && withClient.reason === 'missing-hyperdrive-binding', 'binding manquant attendu');
    const injected = resolvePersistenceDecision({ PERSISTENCE: 'postgres' }, { hasDatabase: true });
    assert(injected.kind === 'postgres' && injected.reason === 'injected-database', 'base injectée attendue');
  });

  await check('Config: cible Hyperdrive résolue et décrite sans secret', () => {
    const secret = 'postgresql://lelabeur:sup3r-s3cret@db.example.com:6543/lelabeur?sslmode=require';
    const resolved = resolvePostgresTarget({ HYPERDRIVE: { connectionString: secret }, DB_POOL_MAX: '7' });
    if (!resolved.ok) throw new Error(`résolution attendue, reçu ${resolved.reason}`);
    assert(resolved.target.source === 'HYPERDRIVE', 'source Hyperdrive attendue');
    assert(resolved.target.poolMax === 7, 'poolMax attendu');
    assert(resolved.decision.reason === 'hyperdrive-binding', 'motif attendu');

    const descriptor = describePostgresTarget(resolved.target);
    const serialized = JSON.stringify(descriptor);
    assert(!serialized.includes('sup3r-s3cret'), `secret présent dans le descripteur: ${serialized}`);
    assert(descriptor.host === 'db.example.com' && descriptor.port === 6543, 'hôte/port attendus');
    assert(descriptor.database === 'lelabeur', 'base attendue');
    assert(descriptor.sslRequired === true, 'sslmode=require attendu');
    assert(descriptor.secretRedacted === true, 'marqueur d’expurgation attendu');

    const fallback = resolvePostgresTarget({ POSTGRES_CONNECTION_STRING: secret });
    assert(fallback.ok && fallback.target.source === 'POSTGRES_CONNECTION_STRING', 'repli direct attendu');
  });

  await check('Config: placeholders et schémas non PostgreSQL refusés', () => {
    const placeholder = resolvePostgresTarget({ POSTGRES_CONNECTION_STRING: PLACEHOLDER_CONNECTION_STRING });
    assert(!placeholder.ok && placeholder.reason === 'placeholder-connection-string', 'placeholder refusé attendu');
    const mysql = resolvePostgresTarget({ POSTGRES_CONNECTION_STRING: 'mysql://user:pass@host:3306/db' });
    assert(!mysql.ok && mysql.reason === 'unsupported-connection-scheme', 'schéma non PostgreSQL refusé attendu');
    const broken = resolvePostgresTarget({ POSTGRES_CONNECTION_STRING: 'postgresql://' });
    assert(!broken.ok && broken.reason === 'invalid-connection-string', 'chaîne invalide refusée attendue');
    const empty = resolvePostgresTarget({});
    assert(!empty.ok && empty.reason === 'missing-hyperdrive-binding', 'absence de cible attendue');
    const local = resolvePostgresTarget({ POSTGRES_CONNECTION_STRING: 'postgresql://localhost/lelabeur' });
    assert(local.ok, 'une configuration locale de développement reste acceptée');
  });

  await check('Config: bornes de pool, timeout et nom d’application', () => {
    const base = { POSTGRES_CONNECTION_STRING: 'postgresql://u:p@db.example.com/lelabeur' };
    for (const env of [
      { ...base, DB_POOL_MAX: '0' },
      { ...base, DB_POOL_MAX: '21' },
      { ...base, DB_POOL_MAX: 'beaucoup' },
      { ...base, DB_STATEMENT_TIMEOUT_MS: '99' },
      { ...base, DB_STATEMENT_TIMEOUT_MS: '120001' },
      { ...base, DB_APPLICATION_NAME: "x'; DROP TABLE users; --" },
    ]) {
      const resolution = resolvePostgresTarget(env);
      assert(!resolution.ok, `configuration invalide acceptée: ${JSON.stringify(env)}`);
    }
    const accepted = resolvePostgresTarget({ ...base, DB_STATEMENT_TIMEOUT_MS: '30000', DB_APPLICATION_NAME: 'lelabeur-test' });
    assert(accepted.ok && accepted.target.statementTimeoutMs === 30_000, 'timeout explicite attendu');
  });

  await check('Config: .env.example ne contient que des placeholders commentés', () => {
    const content = read(resolve(REPO_ROOT, '.env.example'));
    const activeLines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    for (const line of activeLines) {
      assert(/^VITE_[A-Z0-9_]+=/.test(line), `variable serveur non commentée détectée: ${line}`);
    }
    assert(/# PERSISTENCE=/.test(content), 'PERSISTENCE doit être documentée');
    assert(/# HYPERDRIVE=/.test(content), 'HYPERDRIVE doit être documenté');
    assert(/# POSTGRES_CONNECTION_STRING=/.test(content), 'POSTGRES_CONNECTION_STRING doit être documenté');
    assert(content.includes(PLACEHOLDER_CONNECTION_STRING), 'le placeholder documentaire doit être indiqué');
    assert(!/^POSTGRES_CONNECTION_STRING=.+/m.test(content), 'aucune connexion réelle ne doit être commitée');
  });

  /* -------------------- 5. Séparation DEMO / API -------------------- */

  await check('Séparation: MODE DEMO reste le défaut', () => {
    assert(getRepositoryMode() === 'mock', 'getRepositoryMode doit rester mock');
    assert(resolveRepositoryMode({}).mode === 'mock', 'sans configuration → mock');
    assert(resolveRepositoryMode({ VITE_DEMO_MODE: 'false' }).mode === 'mock', 'chemin API manquant → mock');
    assert(
      resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: 'https://evil.test' }).mode === 'mock',
      'URL absolue refusée → mock',
    );
    assert(
      resolveRepositoryMode({ VITE_DEMO_MODE: 'false', VITE_API_BASE_PATH: '/api/v1' }).mode === 'api',
      'configuration explicite → api',
    );
  });

  await check('Séparation: aucun import d’exécution vers la persistance hors du Worker', () => {
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'persistence' && directory === resolve(REPO_ROOT, 'src', 'backend')) continue;
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
        const content = read(path);
        for (const line of content.split('\n')) {
          if (!/(from\s+'[^']*(persistence|services\/database|identity\/sqlStores))/.test(line)) continue;
          if (/^\s*import\s+type\b/.test(line)) continue;
          const relative = path.slice(REPO_ROOT.length + 1);
          // Frontières Worker autorisées : composition serveur (P0-A) et runtime
          // Cloudflare réel (P0-C : entrée Worker + pilote pg). Aucun autre fichier
          // ne peut importer la persistance au runtime.
          const workerBoundaryFiles = new Set([
            'src/backend/api/entry.ts',
            'src/backend/worker/cloudflareEntry.ts',
            'src/backend/worker/pgClient.ts',
          ]);
          if (workerBoundaryFiles.has(relative)) continue;
          offenders.push(relative);
        }
      }
    };
    walk(resolve(REPO_ROOT, 'src'));
    assert(offenders.length === 0, `import d’exécution de la persistance hors Worker: ${[...new Set(offenders)].join(', ')}`);
  });

  await check('Séparation: le bundle navigateur n’atteint jamais la couche PostgreSQL', () => {
    const visited = new Set<string>();
    const queue = [resolve(REPO_ROOT, 'src', 'main.tsx')];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      if (!existsSync(file)) continue;
      const content = read(file);
      for (const match of content.matchAll(/from\s+'(\.[^']+)'/g)) {
        const target = resolve(dirname(file), match[1]);
        for (const candidate of [target, `${target}.ts`, `${target}.tsx`, resolve(target, 'index.ts'), resolve(target, 'index.tsx')]) {
          if (!existsSync(candidate) || visited.has(candidate)) continue;
          if (!statSync(candidate).isFile()) continue;
          queue.push(candidate);
        }
      }
    }
    const forbidden = [...visited].filter(file =>
      /src[\\/]backend[\\/](persistence|api[\\/]entry|services[\\/]database|identity[\\/]sqlStores)/.test(file),
    );
    assert(forbidden.length === 0, `le bundle navigateur atteint la couche serveur: ${forbidden.join(', ')}`);
    assert(visited.size > 10, 'le graphe d’imports doit être effectivement parcouru');
  });

  await check('Séparation: frontière fermée par défaut (401/501 conservés)', async () => {
    const composition = composeWorker({ GOOGLE_CLIENT_ID: 'client-id' });
    assert(composition.mode === 'closed', 'sans persistance, le Worker reste fermé');
    assert(composition.persistence.reason === 'not-configured', `motif inattendu: ${composition.persistence.reason}`);
    const admin = await composition.worker.fetch(new Request('https://api.test/api/v1/admin/users'));
    assert(admin.status === 401, `accès ADMIN non authentifié: ${admin.status}`);
    const offers = await composition.worker.fetch(new Request('https://api.test/api/v1/offers'));
    assert(offers.status === 501, `route métier sans handler: ${offers.status}`);
    const health = await composition.worker.fetch(new Request('https://api.test/healthz'));
    assert(health.status === 200, 'healthz doit rester disponible');
    const body = (await health.json()) as { status: string; persistence: string };
    assert(body.status === 'boundary-only' && body.persistence === 'not-configured', 'healthz ne doit pas annoncer une base');
    assert(composition.core === undefined, 'aucun store ne doit exister sans persistance');
  });

  await check('Séparation: composition postgres → stores SQL, routes métier toujours 501', async () => {
    const driver = new ScriptedDriver(coreRowResponder);
    const composition = composeWorker(
      {
        GOOGLE_CLIENT_ID: 'client-id',
        PERSISTENCE: 'postgres',
        HYPERDRIVE: { connectionString: 'postgresql://lelabeur:sup3r-s3cret@db.example.com:5432/lelabeur' },
      },
      toPostgresClientPort(driver),
    );
    assert(composition.mode === 'postgres', `mode attendu postgres, reçu ${composition.mode}`);
    assert(composition.persistence.reason === 'hyperdrive-binding', `motif inattendu: ${composition.persistence.reason}`);
    assert(composition.core !== undefined, 'les stores du noyau doivent être résolus');
    for (const store of ['offers', 'applications', 'contracts', 'permissions'] as const) {
      assert(composition.core?.[store] !== undefined, `store manquant: ${store}`);
    }
    await composition.core.offers.create(validOffer);
    assert(/INSERT INTO offers/.test(driver.sqlText), 'le store SQL doit être celui utilisé');

    const offers = await composition.worker.fetch(new Request('https://api.test/api/v1/offers'));
    assert(offers.status === 501, `aucun handler métier ne doit être branché: ${offers.status}`);
    const admin = await composition.worker.fetch(new Request('https://api.test/api/v1/admin/users'));
    assert(admin.status === 401, `session requise: ${admin.status}`);

    const misconfigured = composeWorker({ GOOGLE_CLIENT_ID: 'client-id', PERSISTENCE: 'postgres' });
    assert(misconfigured.mode === 'closed', 'postgres sans connexion doit rester fermé');
    assert(misconfigured.persistence.reason === 'missing-sql-client', 'aucune retombée silencieuse en mémoire');
    assert(misconfigured.core === undefined, 'aucun store ne doit être construit sans base');

    const memory = resolveWorkerPersistence({ PERSISTENCE: 'memory' });
    assert(memory.decision.kind === 'memory' && memory.core !== undefined, 'le mode mémoire doit fournir un noyau mémoire');
    assert(memory.database === undefined, 'aucune base en mode mémoire');
  });

  await check('Séparation: la frontière nue ignore toute persistance', async () => {
    const boundary = createApiWorker({ authenticate: async () => null });
    const response = await boundary.fetch(new Request('https://api.test/api/v1/offers'));
    assert(response.status === 501, 'la frontière nue doit rester 501');
    const health = await boundary.fetch(new Request('https://api.test/healthz'));
    const body = (await health.json()) as { persistence: string };
    assert(body.persistence === 'not-configured', 'aucune persistance ne doit être annoncée');
  });

  return results;
}
