/**
 * P0-REPUTATION — tests Worker/API → PostgreSQL du ledger de réputation.
 *
 * Ce que ces tests démontrent, sur les cycles RÉELS du dépôt (aucun simulacre
 * métier, aucune donnée inventée) :
 *   - les faits documentés existants (`contracts.history` `CONTRACT_COMPLETED` /
 *     `EXECUTION_CONFIRMED`, `salary_confirmations`, décision ADMIN de Claim,
 *     événements Outbox `SALARY_CONFIRMED` / `CLAIM_RESOLVED`) produisent des
 *     entrées expliquées, versionnées et idempotentes ;
 *   - la NEUTRALITÉ : Claim ouvert, preuve demandée, restriction provisoire,
 *     Claim rejeté, remplacement et auto-résolution système ne produisent AUCUNE
 *     pénalité ;
 *   - la correction ADMIN est motivée, auditée dans le ledger d'audit EXISTANT,
 *     et n'écrit jamais l'histoire (historique append-only) ;
 *   - aucune régression : cycle paiement, P0-REPLACEMENT et P0-MATCHING sont
 *     inchangés, et le ranking de matching n'est JAMAIS alimenté par la
 *     réputation.
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
import { buildContractActivationPlan } from '../../domain/contractScheduleAutomation';
import { paymentIdFor } from '../../domain/paymentLifecycle';
import { NOTIFICATION_EVENT_COVERAGE } from '../../domain/notificationCatalog';
import type { ContractHistoryEntry } from '../persistence/coreRecords';
import {
  REPUTATION_AUTOMATION_EVENT_TYPES,
  REPUTATION_FACT_COVERAGE,
  REPUTATION_MAX_ABSOLUTE_IMPACT,
  REPUTATION_RULES,
  REPUTATION_RULES_VERSION,
  REPUTATION_RULE_CODES,
  assertNoProtectedAttributeFields,
  findReputationRule,
  reputationDirectionFromImpact,
} from '../../domain/reputationRules';
import { expectedDirection } from '../reputation/reputationLedger';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');
const MATCHING_DIRS = ['src/backend/matching', 'src/domain'];
const SEED_AT = '2026-10-05T14:00:00.000Z';
const MONTHLY_SALARY = 175_000;
const FROZEN_CLOCK = new Date('2026-10-05T14:00:00.000Z');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface ReputationEntryRow {
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
  occurred_at: string;
  created_at: string;
  status: string;
  reversed_at: string | null;
  reversed_by: string | null;
  reversal_reason: string | null;
  history: Array<Record<string, unknown>>;
  dedupe_key: string;
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

async function jsonOf<T>(response: Response): Promise<T> {
  assert(response.status < 400, `réponse attendue < 400, reçue ${response.status}: ${await response.clone().text()}`);
  return response.json() as Promise<T>;
}

async function provisionAdmin(harness: TestHarness): Promise<{ userId: string; token: string }> {
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
      email: `admin.reputation.${userId}@example.com`,
      displayName: 'Admin P0-REPUTATION',
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { userId, token };
}

/**
 * Exécute la passe d'automatisation RÉELLE. Les producteurs du cycle paiement
 * (P0-PAY-1 / P0-SALARY-1) horodatent avec `new Date()` : l'horloge injectée est
 * donc temporairement alignée sur l'horloge réelle le temps de la passe, puis
 * restaurée pour garder des assertions déterministes côté API.
 */
async function drainProducers(harness: TestHarness, limit = 100) {
  assert(harness.automationWorker, 'worker d’automatisation attendu');
  const frozen = harness.clock.value;
  harness.clock.value = new Date();
  try {
    return await harness.automationWorker.drain(limit);
  } finally {
    harness.clock.value = frozen;
  }
}

async function drainEvents(harness: TestHarness, limit = 100) {
  assert(harness.automationWorker, 'worker d’automatisation attendu');
  const frozen = harness.clock.value;
  harness.clock.value = new Date();
  try {
    return await harness.automationWorker.drainEvents(limit);
  } finally {
    harness.clock.value = frozen;
  }
}

async function readEntries(
  harness: TestHarness,
  filter: { subjectUserId?: string; sourceEvent?: string; sourceEntityId?: string; ruleCode?: string } = {},
): Promise<ReputationEntryRow[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const push = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(`${sql} $${values.length}`);
  };
  if (filter.subjectUserId) push('subject_user_id =', filter.subjectUserId);
  if (filter.sourceEvent) push('source_event =', filter.sourceEvent);
  if (filter.sourceEntityId) push('source_entity_id =', filter.sourceEntityId);
  if (filter.ruleCode) push('rule_code =', filter.ruleCode);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await harness.database.query<ReputationEntryRow>(
    `SELECT * FROM reputation_entries ${where} ORDER BY occurred_at DESC, reputation_id ASC`,
    values,
  );
  return result.rows.map(row => ({ ...row, impact: Number(row.impact) }));
}

async function seedOffer(harness: TestHarness, employerId: string, title: string): Promise<string> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create({
    id: offerId,
    employerId,
    title,
    contractType: 'CDI',
    remuneration: MONTHLY_SALARY,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_AT,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Gestion'],
    summary: 'Offre seedée pour P0-REPUTATION.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  });
  return offerId;
}

interface SeedContractInput {
  employerId: string;
  candidateId: string;
  status: 'ACTIVE' | 'COMPLETED';
  history?: ContractHistoryEntry[];
  withSchedule?: boolean;
  durationMonths?: number;
}

/** Contrat réel seedé depuis le modèle P0-AUTO-2 (jamais un statut inventé). */
async function seedContract(harness: TestHarness, input: SeedContractInput): Promise<string> {
  const offerId = await seedOffer(harness, input.employerId, `Offre réputation ${newEntityId('ofr')}`);
  const contractId = newEntityId('ctr');
  const durationMonths = input.durationMonths ?? 2;
  const plan = input.withSchedule
    ? buildContractActivationPlan({
        contractId,
        employerId: input.employerId,
        employeeId: input.candidateId,
        periodicity: 'Mensuel',
        startDate: '05 Septembre 2026',
        durationMonths,
        monthlySalary: MONTHLY_SALARY,
        currency: 'FCFA',
        commissionPercentage: 25,
      }, SEED_AT)
    : null;
  const scheduledPlan = plan && plan.kind === 'SCHEDULED' ? plan : null;
  if (input.withSchedule) assert(scheduledPlan, 'échéancier Mensuel réel attendu');
  await createSqlContractStore(harness.database).create({
    id: contractId,
    offerId,
    employerId: input.employerId,
    employeeId: input.candidateId,
    status: input.status,
    monthlySalary: MONTHLY_SALARY,
    currency: 'FCFA',
    startDate: '05 Septembre 2026',
    currentMonth: 1,
    durationMonths,
    periodicity: 'Mensuel',
    missionDescription: 'Mission seedée P0-REPUTATION.',
    location: 'Cotonou',
    conditions: ['Temps plein'],
    employerSigned: true,
    employeeSigned: true,
    commissionPercentage: scheduledPlan?.commissionPercentage ?? 25,
    commissionAmountDue: scheduledPlan?.commissionAmountDue ?? 0,
    commissionStatus: scheduledPlan?.commissionStatus ?? 'NOT_APPLICABLE',
    monthlyCheckpoints: scheduledPlan ? [...scheduledPlan.monthlyCheckpoints] : [],
    commissionLedger: scheduledPlan ? [...scheduledPlan.commissionLedger] : [],
    paymentSchedule: scheduledPlan ? [...scheduledPlan.paymentSchedule] : [],
    history: input.history ?? [],
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  });
  return contractId;
}

function historyEntry(input: {
  id: string;
  event: string;
  actor: string;
  timestamp: string;
  description?: string;
}): ContractHistoryEntry {
  return {
    id: input.id,
    timestamp: input.timestamp,
    event: input.event,
    description: input.description ?? `Fait documenté ${input.event}.`,
    actor: input.actor,
  };
}

/** Force un paiement salarial à `PAID` en respectant les CHECK du cycle 0008. */
async function markSalaryPaid(harness: TestHarness, paymentId: string, employerId: string, reference: string) {
  const at = new Date().toISOString();
  await harness.database.query(
    `UPDATE payments
        SET status = 'PAID', submitted_at = $2, submitted_by = $3, reference = $4,
            verified_at = $5, verified_by = $6, current_declaration_id = $7,
            declaration_count = GREATEST(declaration_count, 1)
      WHERE id = $1`,
    [paymentId, SEED_AT, employerId, reference, at, 'admin:seed', `dec_${paymentId}`],
  );
}

export async function runReputationTests(): Promise<OfferTestResult[]> {
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  /* ----------------------------------------------------------------- */
  /* 1-3 : catalogue, couverture, interdits (pur, aucune base)          */
  /* ----------------------------------------------------------------- */

  await check('P0-REPUTATION catalogue: règles entières, versionnées, jamais un score stocké', async () => {
    assert(REPUTATION_RULES.length >= 6, `catalogue attendu, reçu ${REPUTATION_RULES.length}`);
    const pairs = new Set(REPUTATION_RULES.map(rule => `${rule.factType}:${rule.party}`));
    assert(pairs.size === REPUTATION_RULES.length, 'un couple fait/partie = une seule règle');
    for (const rule of REPUTATION_RULES) {
      assert(rule.ruleVersion === REPUTATION_RULES_VERSION, `version explicite pour ${rule.code}`);
      assert(Number.isSafeInteger(rule.impact), `impact entier pour ${rule.code}`);
      assert(Math.abs(rule.impact) <= REPUTATION_MAX_ABSOLUTE_IMPACT, `impact borné pour ${rule.code}`);
      assert(rule.explanation.trim().length >= 20, `explication déterministe pour ${rule.code}`);
      assert(reputationDirectionFromImpact(rule.impact) === expectedDirection(rule.impact), 'direction dérivée de l’impact');
      assert(REPUTATION_RULE_CODES.includes(rule.code), `code déclaré: ${rule.code}`);
    }
    assert(findReputationRule('CLAIM_RESOLVED', 'WORKER') === null, 'aucune entrée « par défaut » sans règle');
    assert(findReputationRule('SALARY_CONFIRMED', 'EMPLOYER')?.impact === 3, 'poids de la confirmation salariale documenté');
    assert(findReputationRule('CONTRACT_COMPLETED', 'WORKER')?.impact === 3, 'poids du contrat terminé documenté');
    assert(findReputationRule('EXECUTION_CONFIRMED', 'WORKER')?.impact === 2, 'poids de l’exécution confirmée documenté');
    assert(findReputationRule('CLAIM_RESOLVED', 'RESPONDENT')?.impact === -4, 'seul impact négatif du catalogue');
  });

  await check('P0-REPUTATION couverture: chaque événement du dépôt est déclaré, règle ou raison', async () => {
    const declared = new Set(REPUTATION_FACT_COVERAGE.map(entry => entry.source));
    for (const event of NOTIFICATION_EVENT_COVERAGE) {
      // La couverture de notification contient des lignes d'ALIAS documentés
      // (`..._ALIAS_...`) qui ne sont pas des types d'événements réels : seuls
      // les types réellement produits par l'Outbox sont exigés ici.
      if (/_ALIAS_/.test(event.eventType)) continue;
      assert(declared.has(event.eventType), `événement non audité par la réputation: ${event.eventType}`);
    }
    for (const foundation of ['NOTIFICATION_CREATED', 'NOTIFICATION_REQUIRED', 'NOTIFICATION_SENT', 'NOTIFICATION_FAILED']) {
      assert(declared.has(foundation), `événement de fondation non audité: ${foundation}`);
    }
    const mapped = REPUTATION_FACT_COVERAGE.filter(entry => entry.status === 'MAPPED').map(entry => entry.source).sort();
    const automation = [...REPUTATION_AUTOMATION_EVENT_TYPES].sort();
    assert(automation.length > 0, 'liste exécutable non vide');
    for (const source of automation) assert(mapped.includes(source), `liste exécutable hors couverture: ${source}`);
    for (const entry of REPUTATION_FACT_COVERAGE) {
      if (entry.status === 'NO_REPUTATION_RULE') {
        assert((entry.reason ?? '').trim().length >= 20, `raison d’exclusion documentée pour ${entry.source}`);
        assert(!entry.ruleCodes?.length, `aucune règle déclarée pour une source exclue: ${entry.source}`);
      } else {
        assert(Boolean(entry.ruleCodes?.length), `règle déclarée pour une source MAPPED: ${entry.source}`);
      }
    }
    // Les faits PERSISTÉS sans producteur d'événement sont couverts explicitement.
    for (const persisted of ['CONTRACT_COMPLETED', 'EXECUTION_CONFIRMED']) {
      const entry = REPUTATION_FACT_COVERAGE.find(candidate => candidate.source === persisted);
      assert(entry?.status === 'MAPPED' && Boolean(entry.producer), `${persisted} doit être un fait documenté persisté`);
    }
    for (const excluded of ['CLAIM_CREATED', 'CLAIM_REJECTED', 'CLAIM_RESTRICTION_APPLIED', 'REPLACEMENT_CREATED', 'PAYMENT_DECLARED', 'PAYMENT_PAID']) {
      const entry = REPUTATION_FACT_COVERAGE.find(candidate => candidate.source === excluded);
      assert(entry?.status === 'NO_REPUTATION_RULE', `${excluded} ne doit produire aucune règle`);
    }
  });

  await check('P0-REPUTATION interdits: aucun attribut protégé, aucune appréciation personnelle', async () => {
    for (const forbidden of ['origin', 'ethnicity', 'religion', 'opinion', 'unionMembership', 'health', 'sexualLife', 'geneticData', 'biometric', 'politicalOpinion']) {
      let threw = false;
      try {
        assertNoProtectedAttributeFields({ [forbidden]: 'valeur' });
      } catch {
        threw = true;
      }
      assert(threw, `champ protégé refusé: ${forbidden}`);
    }
    assertNoProtectedAttributeFields({ impact: 3, ruleCode: 'CONTRACT_COMPLETED_PARTY', provenance: 'EVENT', dedupeKey: 'x' });
    const migration = readFileSync(resolve(MIGRATIONS_DIR, '0015_reputation_ledger.sql'), 'utf8').toLowerCase();
    for (const forbidden of ['religion', 'ethnicity', 'health', 'biometric', 'genetic', 'sexual', 'politic', 'union', 'photo', 'criminal']) {
      assert(!migration.includes(forbidden), `schéma de réputation interdit: ${forbidden}`);
    }
  });

  /* ----------------------------------------------------------------- */
  /* 4-8 : faits documentés (positifs, négatif, niveau de preuve)       */
  /* ----------------------------------------------------------------- */

  const salaryOtps = new Map<string, string>();
  const harness: TestHarness = await createOffersTestHarness((paymentId, otp) => salaryOtps.set(paymentId, otp));
  let candidateToken = '';
  let candidateId = '';
  let employerToken = '';
  let employerId = '';
  let otherEmployerToken = '';
  let otherEmployerId = '';
  let otherCandidateToken = '';
  let otherCandidateId = '';
  let adminToken = '';
  let adminId = '';
  let contractCompletedId = '';
  let contractCompletedEntryId = '';
  /** Vue observée AVANT révocation : les assertions restent RELATIVES. */
  let viewBeforeReversal: { netImpact: number; reversedEntryCount: number } | null = null;
  let scheduleContractId = '';
  let schedulePaymentId = '';
  let replacedContractId = '';

  try {
    await check('P0-REPUTATION environnement: acteurs réels, ADMIN provisionné, contrats documentés', async () => {
      const employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      employerToken = employer.token;
      employerId = employer.userId;
      const candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      candidateToken = candidate.token;
      candidateId = candidate.userId;
      const otherEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      otherEmployerToken = otherEmployer.token;
      otherEmployerId = otherEmployer.userId;
      const otherCandidate = await authenticateActor(harness, 'candidate-2', 'CANDIDATE');
      otherCandidateToken = otherCandidate.token;
      otherCandidateId = otherCandidate.userId;
      const admin = await provisionAdmin(harness);
      adminToken = admin.token;
      adminId = admin.userId;

      // Contrat TERMINÉ documenté : exécution confirmée puis clôture.
      contractCompletedId = await seedContract(harness, {
        employerId,
        candidateId,
        status: 'COMPLETED',
        history: [
          historyEntry({ id: 'log_execution_confirmed', event: 'EXECUTION_CONFIRMED', actor: candidateId, timestamp: '2026-09-30T10:00:00.000Z' }),
          historyEntry({ id: 'log_contract_completed', event: 'CONTRACT_COMPLETED', actor: employerId, timestamp: '2026-10-01T10:00:00.000Z' }),
        ],
      });

      // Contrat ACTIF avec échéancier réel : cycle paiement + litiges.
      scheduleContractId = await seedContract(harness, {
        employerId: otherEmployerId,
        candidateId: otherCandidateId,
        status: 'ACTIVE',
        withSchedule: true,
      });
      assert(harness.payments, 'dépôt paiement attendu');
      const materialized = await harness.payments.materializePaymentsForContract(scheduleContractId);
      assert(materialized >= 2, `paiements matérialisés attendus, reçus ${materialized}`);
      schedulePaymentId = paymentIdFor(scheduleContractId, 'SALARY', 1);

      // Contrat ACTIF destiné à l'incident contractuel et au remplacement.
      replacedContractId = await seedContract(harness, {
        employerId: otherEmployerId,
        candidateId,
        status: 'ACTIVE',
      });

      assert(harness.reputation, 'dépôt de réputation composé');
      assert(REPUTATION_RULES_VERSION === 'P0-REPUTATION-1', 'version de règles observable');
    });

    await check('P0-REPUTATION POSITIF: contrat terminé → +3 pour le salarié et pour l’employeur (réconciliation)', async () => {
      const first = await post(harness, '/api/v1/my/reputation/reconcile', candidateToken, 'rep-reconcile-candidate-1', {});
      const report = await jsonOf<{ appended: number; duplicates: number; scanned: number }>(first);
      assert(report.appended >= 2, `deux faits documentés attendus, reçus ${JSON.stringify(report)}`);

      const entries = await readEntries(harness, { subjectUserId: candidateId, sourceEvent: 'CONTRACT_COMPLETED' });
      assert(entries.length === 1, `une entrée CONTRACT_COMPLETED, reçue ${entries.length}`);
      const entry = entries[0];
      assert(entry.source_entity_type === 'CONTRACT' && entry.source_entity_id === contractCompletedId, 'entité source = contrat réel');
      assert(entry.source_event_id === 'log_contract_completed', 'preuve source = entrée d’historique réelle');
      assert(entry.impact === 3 && entry.direction === 'POSITIVE' && entry.category === 'MISSION_EXECUTION', 'impact/direction/catégorie de la règle');
      assert(entry.rule_code === 'CONTRACT_COMPLETED_PARTY' && entry.rule_version === REPUTATION_RULES_VERSION, 'règle et version persistées');
      assert(entry.provenance === 'RECONCILIATION', 'provenance = réconciliation de faits persistés');
      assert(entry.status === 'ACTIVE' && entry.history.length === 0, 'entrée initialement active, sans correction');
      assert(new Date(entry.occurred_at).toISOString() === '2026-10-01T10:00:00.000Z', 'date du FAIT, jamais celle de l’écriture');
      assert(entry.explanation.includes('Contrat') && entry.explanation.length > 20, 'explication déterministe');
      contractCompletedEntryId = entry.reputation_id;

      const employerReconcile = await post(harness, '/api/v1/my/reputation/reconcile', employerToken, 'rep-reconcile-employer-1', {});
      await jsonOf(employerReconcile);
      const employerEntries = await readEntries(harness, { subjectUserId: employerId, sourceEntityId: contractCompletedId });
      assert(employerEntries.some(item => item.rule_code === 'CONTRACT_COMPLETED_PARTY'), 'le contrat terminé crédite les DEUX parties');
      assert(employerEntries.some(item => item.rule_code === 'EXECUTION_CONFIRMED_PARTY'), 'l’exécution confirmée crédite les DEUX parties');
    });

    await check('P0-REPUTATION POSITIF: exécution confirmée → +2, fait distinct du contrat terminé', async () => {
      const entries = await readEntries(harness, { subjectUserId: candidateId, sourceEvent: 'EXECUTION_CONFIRMED' });
      assert(entries.length === 1, `une entrée EXECUTION_CONFIRMED, reçue ${entries.length}`);
      const entry = entries[0];
      assert(entry.impact === 2 && entry.category === 'MISSION_EXECUTION' && entry.direction === 'POSITIVE', 'impact +2 documenté');
      assert(entry.source_event_id === 'log_execution_confirmed', 'preuve = entrée d’historique réelle');
      assert(entry.dedupe_key === `EXECUTION_CONFIRMED_PARTY:CONTRACT:${contractCompletedId}:${candidateId}`, 'clé d’unicité dérivée du fait');
      const view = await jsonOf<{ derived: { netImpact: number; activeEntryCount: number; categories: Array<{ category: string; impact: number }> } }>(
        await get(harness, '/api/v1/my/reputation', candidateToken),
      );
      assert(view.derived.activeEntryCount === 2 && view.derived.netImpact === 5, `vue dérivée 2 entrées / +5, reçue ${JSON.stringify(view.derived)}`);
      assert(view.derived.categories.every(category => category.category === 'MISSION_EXECUTION'), 'répartition par catégorie');
    });

    await check('P0-REPUTATION POSITIF: salaire confirmé par le salarié (OTP réel) → +3 pour l’employeur', async () => {
      assert(harness.payments, 'dépôt paiement attendu');
      await markSalaryPaid(harness, schedulePaymentId, otherEmployerId, 'REF-P0-REPUTATION-1');
      // Le canal OTP local de test est capturé à la composition du harnais : le
      // salarié confirme avec le code RÉELLEMENT émis, comme en production.
      const requestResponse = await post(harness, `/api/v1/payments/${schedulePaymentId}/salary-confirmation-request`, otherEmployerToken, 'rep-salary-request-1', {});
      assert(requestResponse.status === 200, `demande de confirmation attendue, reçue ${requestResponse.status}`);
      const nonceRow = await harness.database.query<{ nonce: string }>(
        'SELECT nonce FROM salary_confirmations WHERE payment_id = $1',
        [schedulePaymentId],
      );
      assert(nonceRow.rows.length === 1 && nonceRow.rows[0].nonce.length === 64, 'nonce persisté côté base');
      const otp = salaryOtps.get(schedulePaymentId);
      assert(typeof otp === 'string' && /^\d{6}$/.test(otp), 'OTP émis par le canal de test local');
      const confirmResponse = await post(harness, `/api/v1/payments/${schedulePaymentId}/salary-confirmation`, otherCandidateToken, 'rep-salary-confirm-1', {
        otp,
        nonce: nonceRow.rows[0].nonce,
      });
      assert(confirmResponse.status === 200, `confirmation attendue, reçue ${confirmResponse.status}`);
      const confirmed = await confirmResponse.json() as { status: string; eventId: string };
      assert(confirmed.status === 'SALARY_CONFIRMED', 'état final SALARY_CONFIRMED');

      const drain = await drainEvents(harness, 50);
      assert(drain.deadLettered === 0, `aucun événement dead-letter, reçu ${JSON.stringify(drain.entries.filter(entry => entry.result === 'dead-letter'))}`);
      const entries = await readEntries(harness, { subjectUserId: otherEmployerId, sourceEvent: 'SALARY_CONFIRMED' });
      assert(entries.length === 1, `une entrée SALARY_CONFIRMED, reçue ${entries.length}`);
      const entry = entries[0];
      assert(entry.provenance === 'EVENT', 'provenance = événement Outbox observé');
      assert(entry.source_entity_type === 'PAYMENT' && entry.source_entity_id === schedulePaymentId, 'entité source = paiement réel');
      assert(entry.source_event_id === confirmed.eventId, 'preuve = identifiant d’événement réel');
      assert(entry.impact === 3 && entry.category === 'PAYMENT_RELIABILITY' && entry.rule_code === 'SALARY_RECEIPT_CONFIRMED_EMPLOYER', 'règle de fiabilité de paiement');
      assert(entry.subject_user_id === otherEmployerId, 'le sujet est l’EMPLOYEUR du paiement');
      const payment = await harness.database.query<{ status: string }>('SELECT status FROM payments WHERE id = $1', [schedulePaymentId]);
      assert(payment.rows[0]?.status === 'PAID', 'le cycle paiement reste inchangé');
    });

    await check('P0-REPUTATION preuve: seule la confirmation persistée compte, jamais la déclaration PAID', async () => {
      // Le reader de faits ne retient que les confirmations RÉELLES.
      const confirmations = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM salary_confirmations WHERE employer_id = $1 AND confirmed_at IS NOT NULL',
        [otherEmployerId],
      );
      assert(confirmations.rows[0].count === '1', 'une seule confirmation persistée');
      const payments = await harness.database.query<{ status: string; reference: string | null }>(
        'SELECT status, reference FROM payments WHERE employer_id = $1 AND payment_type = $2',
        [otherEmployerId, 'SALARY'],
      );
      const paid = payments.rows.filter(row => row.status === 'PAID');
      assert(paid.length >= 1, 'au moins un paiement PAID (rapprochement local déclaré, aucun fonds)');
      // Aucune entrée ne peut provenir d'une déclaration, d'une vérification ou
      // d'un rapprochement : seuls les faits documentés portent une règle.
      const all = await readEntries(harness, { subjectUserId: otherEmployerId });
      for (const entry of all) {
        assert(!entry.source_event.startsWith('PAYMENT_'), `aucune entrée issue d’un statut de paiement: ${entry.source_event}`);
      }
      const paymentFacts = await readEntries(harness, { subjectUserId: otherEmployerId, sourceEvent: 'PAYMENT_PAID' });
      assert(paymentFacts.length === 0, 'PAID (rapprochement local, aucun fonds) ne produit aucune entrée');
    });

    await check('P0-REPUTATION NÉGATIF: décision ADMIN défavorable → −4 au défendeur, +1 au demandeur, tracée', async () => {
      const secondMonthPayment = paymentIdFor(scheduleContractId, 'SALARY', 2);
      const created = await post(harness, '/api/v1/claims', otherCandidateToken, 'rep-claim-decision-1', {
        contractId: scheduleContractId,
        paymentId: secondMonthPayment,
        type: 'SALARY_NOT_RECEIVED',
        reason: 'Salaire du mois 2 non reçu, décision ADMIN demandée.',
      });
      assert(created.status === 201, `Claim attendu, reçu ${created.status}`);
      const { claimId } = await created.json() as { claimId: string };

      const review = await post(harness, `/api/v1/admin/claims/${claimId}/review`, adminToken, 'rep-claim-review-1', { note: 'Instruction ADMIN.' });
      assert(review.status === 200, `revue ADMIN attendue, reçue ${review.status}`);
      const decision = await post(harness, `/api/v1/admin/claims/${claimId}/decision`, adminToken, 'rep-claim-decision-1', {
        decision: 'RESOLVE',
        resolution: 'Faits retenus après instruction : le salaire du mois 2 n’a pas été versé.',
      });
      assert(decision.status === 200, `décision ADMIN attendue, reçue ${decision.status}`);

      const drain = await drainEvents(harness, 50);
      assert(drain.deadLettered === 0, 'aucun dead-letter sur la décision');
      const entries = await readEntries(harness, { sourceEntityId: claimId });
      assert(entries.length === 2, `deux entrées attendues (une par partie), reçues ${entries.length}`);
      const respondent = entries.find(entry => entry.subject_user_id === otherEmployerId);
      const claimant = entries.find(entry => entry.subject_user_id === otherCandidateId);
      assert(respondent?.impact === -4 && respondent.category === 'DISPUTE_OUTCOME' && respondent.direction === 'NEGATIVE', 'impact négatif documenté par la décision');
      assert(respondent.provenance === 'EVENT' && respondent.rule_code === 'ADMIN_DECISION_UNFAVORABLE_RESPONDENT', 'règle négative versionnée');
      assert(claimant?.impact === 1 && claimant.rule_code === 'ADMIN_DECISION_FAVORABLE_CLAIMANT', 'la demande retenue est documentée');
      assert(respondent.actor_id === adminId && respondent.source_entity_type === 'CLAIM', 'acteur réel = décideur ADMIN');
      assert(respondent.explanation.includes('après instruction'), 'explication de la décision');

      const audit = await harness.database.query<{ action: string }>(
        'SELECT action FROM automation_audit_ledger WHERE entity_id = $1 ORDER BY occurred_at',
        [respondent.reputation_id],
      );
      assert(audit.rows.some(row => row.action === 'REPUTATION_ENTRY_CREATED'), 'création auditée dans le ledger EXISTANT');
    });

    /* ----------------------------------------------------------------- */
    /* 9-12 : neutralité (aucune pénalité automatique)                    */
    /* ----------------------------------------------------------------- */

    await check('P0-REPUTATION neutralité: Claim ouvert ou en cours → AUCUNE entrée', async () => {
      const thirdMonthPayment = paymentIdFor(scheduleContractId, 'SALARY', 2);
      const created = await post(harness, '/api/v1/claims', otherCandidateToken, 'rep-claim-open-1', {
        contractId: scheduleContractId,
        paymentId: thirdMonthPayment,
        type: 'PAYMENT_DISPUTE',
        reason: 'Litige ouvert, aucune sanction attendue.',
      });
      assert(created.status === 201, `Claim attendu, reçu ${created.status}`);
      const { claimId } = await created.json() as { claimId: string };
      const before = await harness.database.query<{ status: string }>('SELECT status FROM claims WHERE claim_id = $1', [claimId]);
      assert(before.rows[0].status !== 'RESOLVED', 'Claim non résolu');
      await drainEvents(harness, 50);
      const entries = await readEntries(harness, { sourceEntityId: claimId });
      assert(entries.length === 0, `un Claim ouvert ne produit aucune entrée, reçues ${entries.length}`);
      const view = await jsonOf<{ derived: { activeEntryCount: number } }>(await get(harness, '/api/v1/my/reputation', otherEmployerToken));
      assert(typeof view.derived.activeEntryCount === 'number', 'vue calculable sans pénalité');
    });

    await check('P0-REPUTATION neutralité: auto-résolution SYSTÈME (salaire confirmé) → AUCUNE faute', async () => {
      const created = await post(harness, '/api/v1/claims', otherCandidateToken, 'rep-claim-auto-1', {
        contractId: scheduleContractId,
        paymentId: schedulePaymentId,
        type: 'SALARY_NOT_RECEIVED',
        reason: 'Contestation d’un salaire pourtant confirmé reçu.',
      });
      assert(created.status === 201, `Claim attendu, reçu ${created.status}`);
      const { claimId } = await created.json() as { claimId: string };
      await drainEvents(harness, 50);
      const claim = await harness.database.query<{ status: string; resolved_by: string | null }>(
        'SELECT status, resolved_by FROM claims WHERE claim_id = $1',
        [claimId],
      );
      assert(claim.rows[0].status === 'RESOLVED' && claim.rows[0].resolved_by === 'SYSTEM', 'auto-résolution déterministe réelle');
      const audit = await harness.database.query<{ action: string; after_state: Record<string, unknown> }>(
        'SELECT action, after_state FROM automation_audit_ledger WHERE entity_id = $1',
        [claimId],
      );
      assert(audit.rows.some(row => row.action === 'CLAIM_AUTO_RESOLVED_SALARY_CONFIRMED' && row.after_state.faultAttributed === false), 'aucune faute attribuée');
      const entries = await readEntries(harness, { sourceEntityId: claimId });
      assert(entries.length === 0, `une auto-résolution système ne produit aucune entrée, reçues ${entries.length}`);
    });

    await check('P0-REPUTATION neutralité: Claim rejeté, preuve demandée et restriction réversible → AUCUNE entrée', async () => {
      const created = await post(harness, '/api/v1/claims', otherEmployerToken, 'rep-claim-incident-1', {
        contractId: scheduleContractId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Incident contractuel soumis à instruction.',
      });
      assert(created.status === 201, `Claim attendu, reçu ${created.status}`);
      const { claimId } = await created.json() as { claimId: string };
      const review = await post(harness, `/api/v1/admin/claims/${claimId}/review`, adminToken, 'rep-claim-incident-review', { note: 'Analyse incident.' });
      assert(review.status === 200, `revue attendue, reçue ${review.status}`);
      const restriction = await post(harness, `/api/v1/admin/claims/${claimId}/restrictions`, adminToken, 'rep-claim-restriction', {
        reason: 'Mesure provisoire réversible pendant l’instruction.',
      });
      assert(restriction.status === 200, `restriction attendue, reçue ${restriction.status}`);
      const { restrictionId } = await restriction.json() as { restrictionId: string };
      const released = await post(harness, `/api/v1/admin/claims/${claimId}/restrictions/${restrictionId}/release`, adminToken, 'rep-claim-restriction-release', {
        reason: 'Mesure levée après vérification.',
      });
      assert(released.status === 200, `levée attendue, reçue ${released.status}`);
      const decision = await post(harness, `/api/v1/admin/claims/${claimId}/decision`, adminToken, 'rep-claim-incident-decision', {
        decision: 'REJECT',
        resolution: 'Faits non retenus après instruction.',
      });
      assert(decision.status === 200, `décision attendue, reçue ${decision.status}`);
      await drainEvents(harness, 50);
      const entries = await readEntries(harness, { sourceEntityId: claimId });
      assert(entries.length === 0, `rejet + restriction provisoire ≠ sanction, reçues ${entries.length}`);
      // Le rejet ne sanctionne JAMAIS le demandeur (P0-REPUTATION, neutralité).
      const rejectedClaim = await harness.database.query<{ status: string }>('SELECT status FROM claims WHERE claim_id = $1', [claimId]);
      assert(rejectedClaim.rows[0].status === 'REJECTED', 'Claim rejeté documenté');
      const neutral = await readEntries(harness, { sourceEvent: 'CLAIM_REJECTED' });
      assert(neutral.length === 0, 'CLAIM_REJECTED ne produit aucune entrée');
    });

    await check('P0-REPUTATION neutralité: remplacement → aucune pénalité du seul fait d’être remplacé', async () => {
      const created = await post(harness, '/api/v1/claims', otherEmployerToken, 'rep-claim-replace-1', {
        contractId: replacedContractId,
        type: 'CONTRACT_INCIDENT',
        reason: 'Incident justifiant un remplacement encadré.',
      });
      assert(created.status === 201, `Claim attendu, reçu ${created.status}`);
      const { claimId } = await created.json() as { claimId: string };
      const review = await post(harness, `/api/v1/admin/claims/${claimId}/review`, adminToken, 'rep-claim-replace-review', { note: 'Incident à remplacer.' });
      assert(review.status === 200, `revue attendue, reçue ${review.status}`);
      const decision = await post(harness, `/api/v1/admin/claims/${claimId}/decision`, adminToken, 'rep-claim-replace-decision', {
        decision: 'REPLACE',
        resolution: 'Remplacement ordonné après instruction de l’incident.',
      });
      assert(decision.status === 200, `décision REPLACE attendue, reçue ${decision.status}`);
      await drainEvents(harness, 50);

      const replacements = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM replacements');
      assert(Number(replacements.rows[0].count) >= 1, 'dossier de remplacement réel créé');
      const replacementEntries = await readEntries(harness, { sourceEvent: 'REPLACEMENT_CREATED' });
      assert(replacementEntries.length === 0, 'REPLACEMENT_CREATED ne produit AUCUNE entrée à lui seul');
      const claimEntries = await readEntries(harness, { sourceEntityId: claimId });
      assert(claimEntries.length === 2 && claimEntries.every(entry => entry.source_entity_type === 'CLAIM'), 'les seules entrées viennent de la décision ADMIN, jamais du remplacement');
      const workerEntry = claimEntries.find(entry => entry.subject_user_id === candidateId);
      assert(workerEntry?.impact === -4 && workerEntry.source_event === 'CLAIM_RESOLVED', 'le remplacé n’est pénalisé que par une décision ADMIN motivée');
      const replacementRow = await harness.database.query<{ claim_id: string; status: string }>('SELECT claim_id, status FROM replacements LIMIT 1');
      assert(replacementRow.rows[0].claim_id === claimId, 'le dossier de remplacement reste la propriété du cycle P0-REPLACEMENT');
    });

    /* ----------------------------------------------------------------- */
    /* 13-15 : idempotence et concurrence                                 */
    /* ----------------------------------------------------------------- */

    await check('P0-REPUTATION idempotence: réconciliation rejouée → aucune nouvelle ligne, rejeu reconnu', async () => {
      const before = await readEntries(harness, { subjectUserId: candidateId });
      const replay = await post(harness, '/api/v1/my/reputation/reconcile', candidateToken, 'rep-reconcile-candidate-1', {});
      const replayedReport = await jsonOf<{ appended: number; duplicates: number }>(replay);
      assert(replayedReport.appended === 2 && replayedReport.duplicates === 0, `rejeu exact : rapport d’origine restitué, reçu ${JSON.stringify(replayedReport)}`);
      const fresh = await post(harness, '/api/v1/my/reputation/reconcile', candidateToken, 'rep-reconcile-candidate-2', {});
      const freshReport = await jsonOf<{ appended: number; duplicates: number }>(fresh);
      assert(freshReport.appended === 0, 'aucune seconde ligne pour un fait déjà journalisé');
      const after = await readEntries(harness, { subjectUserId: candidateId });
      assert(after.length === before.length, `ledger stable: ${before.length} → ${after.length}`);
    });

    await check('P0-REPUTATION concurrence: deux réconciliations simultanées → une seule entrée par fait', async () => {
      const concurrentContractId = await seedContract(harness, {
        employerId,
        candidateId: otherCandidateId,
        status: 'COMPLETED',
        history: [historyEntry({ id: 'log_concurrent_completed', event: 'CONTRACT_COMPLETED', actor: employerId, timestamp: '2026-10-02T10:00:00.000Z' })],
      });
      const [first, second] = await Promise.all([
        post(harness, '/api/v1/my/reputation/reconcile', otherCandidateToken, 'rep-concurrent-a', {}),
        post(harness, '/api/v1/my/reputation/reconcile', otherCandidateToken, 'rep-concurrent-b', {}),
      ]);
      assert(first.status < 400 && second.status < 400, `deux commandes acceptées, reçues ${first.status}/${second.status}`);
      const entries = await readEntries(harness, { sourceEntityId: concurrentContractId });
      assert(entries.length === 1, `une seule ligne malgré la concurrence, reçues ${entries.length}`);
      assert(entries[0].subject_user_id === otherCandidateId, 'sujet de l’entrée concurrente');
    });

    await check('P0-REPUTATION idempotence: rejeu d’un événement Outbox → aucun doublon', async () => {
      const salaryEvents = await harness.database.query<{ id: string; status: string }>(
        "SELECT id, status FROM automation_outbox WHERE event_type = 'SALARY_CONFIRMED'",
      );
      assert(salaryEvents.rows.length === 1, 'un seul événement SALARY_CONFIRMED logique');
      await harness.database.query("UPDATE automation_outbox SET status = 'PENDING', processed_at = NULL WHERE id = $1", [salaryEvents.rows[0].id]);
      const drain = await drainEvents(harness, 50);
      assert(drain.entries.some(entry => entry.eventType === 'SALARY_CONFIRMED' && entry.result === 'duplicate'), 'rejeu reconnu comme doublon');
      const entries = await readEntries(harness, { subjectUserId: otherEmployerId, sourceEvent: 'SALARY_CONFIRMED' });
      assert(entries.length === 1, `un seul fait, une seule entrée, reçues ${entries.length}`);
    });

    /* ----------------------------------------------------------------- */
    /* 16-19 : correction ADMIN, audit, explication, version              */
    /* ----------------------------------------------------------------- */

    await check('P0-REPUTATION correction ADMIN: révocation motivée → REVERSED, exclue du score, histoire non réécrite', async () => {
      const beforeView = await jsonOf<{ derived: { netImpact: number; reversedEntryCount: number } }>(await get(harness, '/api/v1/my/reputation', candidateToken));
      viewBeforeReversal = beforeView.derived;
      const response = await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-reverse-1', {
        action: 'REVERSE',
        reason: 'Source corrigée : la clôture du contrat a été annulée par une décision postérieure.',
      });
      const corrected = await jsonOf<{ status: string; history: Array<Record<string, unknown>>; impact: number; explanation: string }>(response);
      assert(corrected.status === 'REVERSED', 'entrée révoquée');
      assert(corrected.impact === 3 && corrected.explanation.length > 20, 'impact et explication d’origine conservés');
      assert(corrected.history.length === 1 && corrected.history[0].action === 'REVERSED', 'historique append-only');
      const row = (await readEntries(harness, { subjectUserId: candidateId, sourceEvent: 'CONTRACT_COMPLETED' }))[0];
      assert(row.status === 'REVERSED' && row.reversed_by === adminId && typeof row.reversal_reason === 'string', 'auteur, date et motif obligatoires');
      const view = await jsonOf<{ derived: { netImpact: number; activeEntryCount: number; reversedEntryCount: number } }>(
        await get(harness, '/api/v1/my/reputation', candidateToken),
      );
      assert(
        view.derived.reversedEntryCount === (viewBeforeReversal?.reversedEntryCount ?? 0) + 1
        && view.derived.netImpact === (viewBeforeReversal?.netImpact ?? 0) - 3,
        `score dérivé corrigé sans réécriture, avant ${JSON.stringify(beforeView.derived)}, après ${JSON.stringify(view.derived)}`,
      );
      const listed = await jsonOf<{ items: Array<{ reputationId: string; status: string }> }>(
        await get(harness, '/api/v1/my/reputation/entries?limit=50', candidateToken),
      );
      assert(listed.items.some(item => item.reputationId === contractCompletedEntryId && item.status === 'REVERSED'), 'l’histoire reste consultable');
    });

    await check('P0-REPUTATION correction ADMIN: rétablissement → ACTIVE, historique conservé', async () => {
      const response = await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-restore-1', {
        action: 'RESTORE',
        reason: 'Correction annulée : la clôture du contrat est confirmée comme valide.',
      });
      const restored = await jsonOf<{ status: string; history: Array<Record<string, unknown>> }>(response);
      assert(restored.status === 'ACTIVE', 'entrée rétablie');
      assert(restored.history.length === 2, 'les deux corrections restent tracées');
      assert(restored.history[0].action === 'REVERSED' && restored.history[1].action === 'RESTORED', 'ordre chronologique conservé');
      const view = await jsonOf<{ derived: { netImpact: number; reversedEntryCount: number } }>(await get(harness, '/api/v1/my/reputation', candidateToken));
      assert(
        view.derived.netImpact === viewBeforeReversal?.netImpact
        && view.derived.reversedEntryCount === viewBeforeReversal?.reversedEntryCount,
        `score recalculé après rétablissement, reçu ${JSON.stringify(view.derived)}`,
      );
    });

    await check('P0-REPUTATION correction ADMIN: motif et état exigés, idempotence de la commande', async () => {
      const noReason = await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-noreason-1', {
        action: 'REVERSE',
        reason: '',
      });
      assert(noReason.status === 400, `motif obligatoire, reçu ${noReason.status}`);
      const unknown = await post(harness, '/api/v1/admin/reputation/entries/rpt_inconnu/correct', adminToken, 'rep-correct-unknown-1', {
        action: 'REVERSE',
        reason: 'Entrée inexistante.',
      });
      assert(unknown.status === 404, `entrée inconnue, reçu ${unknown.status}`);

      const first = await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-reverse-2', {
        action: 'REVERSE',
        reason: 'Deuxième révocation motivée de contrôle.',
      });
      assert(first.status === 200, `révocation attendue, reçue ${first.status}`);
      const double = await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-reverse-3', {
        action: 'REVERSE',
        reason: 'Tentative de double révocation.',
      });
      assert(double.status === 409, `double révocation refusée, reçue ${double.status}`);
      const replay = await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-reverse-2', {
        action: 'REVERSE',
        reason: 'Deuxième révocation motivée de contrôle.',
      });
      assert(replay.status === 200, `même clé, même charge : résultat stable, reçu ${replay.status}`);
      const conflict = await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-reverse-2', {
        action: 'REVERSE',
        reason: 'Charge utile différente sous la même clé.',
      });
      assert(conflict.status === 409, `conflit d’idempotence, reçu ${conflict.status}`);
      // Rétablissement final : le ledger revient à l'état nominal pour la suite.
      await post(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}/correct`, adminToken, 'rep-correct-restore-2', {
        action: 'RESTORE',
        reason: 'Rétablissement après contrôle des corrections.',
      });
      const row = (await readEntries(harness, { subjectUserId: candidateId, sourceEvent: 'CONTRACT_COMPLETED' }))[0];
      assert(row.status === 'ACTIVE' && row.history.length === 4, 'historique complet des quatre corrections');
    });

    await check('P0-REPUTATION audit: un SEUL ledger d’audit, chaque intervention tracée avec son auteur', async () => {
      const audit = await harness.database.query<{ action: string; actor_id: string; after_state: Record<string, unknown>; before_state: Record<string, unknown> }>(
        'SELECT action, actor_id, before_state, after_state FROM automation_audit_ledger WHERE entity_id = $1 ORDER BY occurred_at',
        [contractCompletedEntryId],
      );
      const actions = audit.rows.map(row => row.action);
      assert(actions.includes('REPUTATION_ENTRY_REVERSED'), 'révocation auditée');
      assert(actions.includes('REPUTATION_ENTRY_RESTORED'), 'rétablissement audité');
      const reversal = audit.rows.find(row => row.action === 'REPUTATION_ENTRY_REVERSED');
      assert(reversal?.actor_id === adminId, 'auteur réel de la correction');
      assert(typeof reversal.after_state.reason === 'string' && reversal.after_state.historyAppendedOnly === true, 'motif et caractère append-only tracés');
      assert(reversal.before_state.status === 'ACTIVE' && reversal.after_state.status === 'REVERSED', 'avant/après conservés');
      // Aucun second ledger d'audit n'existe pour la réputation.
      const tables = await harness.database.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%audit%'",
      );
      assert(tables.rows.length === 1 && tables.rows[0].table_name === 'automation_audit_ledger', `ledger d’audit unique, reçu ${JSON.stringify(tables.rows)}`);
    });

    await check('P0-REPUTATION lecture: explication, provenance, version et pagination keyset exposées', async () => {
      const response = await get(harness, '/api/v1/my/reputation/entries?limit=1', otherEmployerToken);
      const page = await jsonOf<{ items: Array<Record<string, unknown>>; limit: number; hasMore: boolean; cursor: string | null }>(response);
      assert(page.limit === 1 && page.items.length === 1, 'page bornée demandée');
      assert(page.hasMore && typeof page.cursor === 'string', 'curseur keyset fourni');
      const detail = await jsonOf<{ rule: { code: string; version: string; explanation: string }; source: { event: string; entityType: string; entityId: string }; history: unknown[] }>(
        await get(harness, `/api/v1/admin/reputation/entries/${String(page.items[0].reputationId)}`, adminToken),
      );
      assert(detail.rule.version === REPUTATION_RULES_VERSION, 'version de la règle exposée');
      assert(detail.rule.explanation.length > 20, 'explication exposée');
      assert(detail.source.entityId.length > 0 && detail.source.event.length > 0, 'entité et fait source exposés');
      assert(Array.isArray(detail.history), 'historique exposé');
      const second = await jsonOf<{ items: Array<Record<string, unknown>> }>(
        await get(harness, `/api/v1/my/reputation/entries?limit=1&cursor=${encodeURIComponent(String(page.cursor))}`, otherEmployerToken),
      );
      assert(second.items.length >= 1 && second.items[0].reputationId !== page.items[0].reputationId, 'page suivante distincte (keyset)');
      const filtered = await jsonOf<{ derived: { activeEntryCount: number } }>(
        await get(harness, '/api/v1/my/reputation?from=2030-01-01T00:00:00.000Z', otherEmployerToken),
      );
      assert(filtered.derived.activeEntryCount === 0, 'filtre de période sur la date du fait');
    });

    await check('P0-REPUTATION permissions: réputation d’autrui inaccessible, ADMIN sans permission refusé', async () => {
      const asCandidate = await get(harness, '/api/v1/admin/reputation/entries', candidateToken);
      assert(asCandidate.status === 403, `liste ADMIN refusée à un non-ADMIN, reçue ${asCandidate.status}`);
      const asOtherUser = await get(harness, `/api/v1/admin/reputation/entries/${contractCompletedEntryId}`, otherCandidateToken);
      assert(asOtherUser.status === 403, `entrée d’autrui inaccessible, reçue ${asOtherUser.status}`);
      await harness.database.query('DELETE FROM role_permissions WHERE role = $1 AND permission_code = $2', ['ADMIN', 'audit:read']);
      const denied = await get(harness, '/api/v1/admin/reputation/entries', adminToken);
      assert(denied.status === 403, `ADMIN sans permission refusé, reçu ${denied.status}`);
      await harness.database.query('INSERT INTO role_permissions (role, permission_code) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['ADMIN', 'audit:read']);
      const allowed = await jsonOf<{ items: Array<Record<string, unknown>> }>(await get(harness, '/api/v1/admin/reputation/entries?limit=50', adminToken));
      assert(allowed.items.length >= 3, 'ADMIN habilité lit les entrées');
      const mine = await jsonOf<{ items: Array<{ subjectUserId: string }> }>(await get(harness, '/api/v1/my/reputation/entries?limit=50', candidateToken));
      assert(mine.items.every(item => item.subjectUserId === candidateId), 'lecture « self » strictement limitée à son propre ledger');
      const anonymous = await harness.worker.fetch(new Request('https://api.test/api/v1/my/reputation'));
      assert(anonymous.status === 401, `authentification requise, reçue ${anonymous.status}`);
    });

    /* ----------------------------------------------------------------- */
    /* 22-24 : non-régression P0-MATCHING / PAIEMENT / REPLACEMENT        */
    /* ----------------------------------------------------------------- */

    await check('P0-REPUTATION non-régression P0-MATCHING: aucune référence, aucune écriture, aucun poids touché', async () => {
      const offenders: string[] = [];
      for (const relative of MATCHING_DIRS) {
        const directory = resolve(REPO_ROOT, relative);
        for (const file of readdirSync(directory)) {
          if (!/matching/i.test(file) || !file.endsWith('.ts')) continue;
          const content = readFileSync(resolve(directory, file), 'utf8');
          if (/reputation/i.test(content)) offenders.push(`${relative}/${file}`);
        }
      }
      assert(offenders.length === 0, `le matching ne doit jamais dépendre de la réputation: ${offenders.join(', ')}`);
      const matchingTables = ['candidate_matching_profiles', 'mission_qualifications', 'matching_runs'];
      for (const table of matchingTables) {
        const count = await harness.database.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
        assert(count.rows[0].count === '0', `${table} ne doit pas être alimenté par la réputation (reçu ${count.rows[0].count})`);
      }
      const migration = readFileSync(resolve(MIGRATIONS_DIR, '0015_reputation_ledger.sql'), 'utf8').toLowerCase();
      for (const forbidden of ['matching', 'skills_weight', 'zone_weight', 'availability_weight', 'rank']) {
        assert(!migration.includes(forbidden), `la migration de réputation ne touche pas au matching: ${forbidden}`);
      }
    });

    await check('P0-REPUTATION non-régression PAIEMENT: aucun statut, montant ou référence modifié', async () => {
      const rows = await harness.database.query<{ id: string; status: string; amount: string; reference: string | null; declaration_count: number }>(
        'SELECT id, status, amount, reference, declaration_count FROM payments WHERE contract_id = $1 ORDER BY id',
        [scheduleContractId],
      );
      assert(rows.rows.length >= 3, 'paiements du contrat réel présents');
      const salary = rows.rows.find(row => row.id === schedulePaymentId);
      assert(salary?.status === 'PAID' && salary.reference === 'REF-P0-REPUTATION-1', 'paiement confirmé inchangé (statut et référence déclarée)');
      assert(Number(salary.declaration_count) >= 1 && Number(salary.amount) > 0, 'tentatives et montant conservés');
      const declarations = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM payment_declarations WHERE payment_id = $1', [schedulePaymentId]);
      assert(declarations.rows[0].count === '0', 'aucune déclaration inventée par la réputation');
      const migration = readFileSync(resolve(MIGRATIONS_DIR, '0015_reputation_ledger.sql'), 'utf8');
      assert(!/alter\s+table\s+payments/i.test(migration), 'aucune écriture de schéma sur le cycle paiement');
      assert(!/\b(insert\s+into|update|delete\s+from)\s+payments\b/i.test(migration), 'aucune écriture de données sur le cycle paiement');
    });

    await check('P0-REPUTATION non-régression REPLACEMENT: dossier intact, aucune entrée propre au remplacement', async () => {
      const replacements = await harness.database.query<{ replacement_id: string; claim_id: string; status: string; original_contract_id: string }>(
        'SELECT replacement_id, claim_id, status, original_contract_id FROM replacements',
      );
      assert(replacements.rows.length === 1, `un dossier de remplacement, reçu ${replacements.rows.length}`);
      assert(replacements.rows[0].status === 'PENDING_OFFER' && replacements.rows[0].original_contract_id === replacedContractId, 'état P0-REPLACEMENT inchangé');
      const linked = await harness.database.query<{ replacement_id: string | null }>('SELECT replacement_id FROM contracts WHERE id = $1', [replacedContractId]);
      assert(linked.rows[0].replacement_id === replacements.rows[0].replacement_id, 'lien historique porté par le cycle remplacement');
      const migration = readFileSync(resolve(MIGRATIONS_DIR, '0015_reputation_ledger.sql'), 'utf8');
      assert(!/alter\s+table\s+replacements/i.test(migration), 'aucune écriture de schéma sur le cycle remplacement');
      assert(!/\b(insert\s+into|update|delete\s+from)\s+replacements\b/i.test(migration), 'aucune écriture de données sur le cycle remplacement');
      const entries = await readEntries(harness, { sourceEvent: 'REPLACEMENT_CREATED' });
      assert(entries.length === 0, 'aucune entrée issue du remplacement lui-même');
    });
  } finally {
    await harness.close();
  }

  return results;
}
