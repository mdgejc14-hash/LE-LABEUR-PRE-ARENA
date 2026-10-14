/** P0-MATCHING — deterministic, PostgreSQL, API, safety and regression tests. */

import { PGlite } from '@electric-sql/pglite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../api/errors';
import { createApiWorker } from '../api/worker';
import { createSqlAutomationStores } from '../persistence/sqlAutomationStores';
import { createSqlCoreStores, createSqlOfferStore } from '../persistence/sqlCoreStores';
import { createSqlMatchingStores } from '../persistence/sqlMatchingStores';
import { createSqlUserStore } from '../identity/sqlStores';
import type { ServerUserRecord } from '../identity/stores';
import { createMatchingApiHandlers, createMatchingRepository, type MatchingRepositoryStores } from './matchingRepository';
import { evaluateMissionQualification, parseMissionQualificationAnswers } from './qualification';
import { parseCandidateMatchingProfile, parseMatchingSort, rankMatchingCandidates } from './matchingEngine';
import type { MatchingRunRecord, MissionQualificationAnswers } from './records';
import type { AuthenticatedActor } from '../productionContracts';
import { createPostgresDatabase } from '../persistence/postgresDatabase';
import { toPostgresClientPort, type DriverPoolLike, type DriverQueryResult } from '../persistence/sqlClient';
import { applyMigrations, loadMigrations } from '../persistence/migrationRunner';
import type { OfferRecord } from '../persistence/coreRecords';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'migrations');

export interface MatchingTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validAnswers(overrides: Partial<MissionQualificationAnswers> = {}): MissionQualificationAnswers {
  return {
    serviceNature: 'AUTONOMOUS_DELIVERABLE',
    deliverableDescription: 'Livraison de 20 visuels de campagne finalisés.',
    acceptanceCriteria: '20 fichiers conformes au format et à la charte validés.',
    acceptanceCriteriaObjective: true,
    compensationBasis: 'RESULT_OR_SERVICE',
    providerChoosesMethods: true,
    providerOrganizesTime: true,
    mayServeOtherClients: true,
    mayDeclineWithoutPenalty: true,
    professionalRisk: true,
    disciplinaryPower: false,
    continuousShift: false,
    dailyHierarchicalOrders: false,
    permanentIntegratedPosition: false,
    exclusivityRequired: false,
    exclusivityJustified: null,
    timePlaceConstraint: 'NONE',
    candidateFacingConstraintSummary: '',
    formalities: {
      majorityCheckPlanned: true,
      professionalStatusRequirementsIdentified: true,
      professionalAuthorizationRequired: false,
      professionalAuthorizationCheckPlanned: null,
      taxInvoicingRequirementsIdentified: true,
      insuranceRequired: false,
      insuranceRequirementsIdentified: null,
    },
    ...overrides,
  };
}

function makeOffer(offerId: string, employerId: string, overrides: Partial<OfferRecord> = {}): OfferRecord {
  const at = '2026-10-07T12:00:00.000Z';
  return {
    id: offerId,
    employerId,
    title: 'Mission de conception visuelle',
    contractType: 'Prestation',
    remuneration: 100000,
    currency: 'FCFA',
    location: 'Cotonou',
    departmentId: 'dept-1',
    municipalityId: 'commune-1',
    arrondissementId: 'arr-1',
    localityId: 'loc-1',
    domainId: 'design',
    jobId: 'designer',
    postedDate: at,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Création visuelle', 'Mise en page'],
    summary: 'Livrables graphiques définis.',
    responsibilities: ['Livrer les visuels convenus.'],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function actor(id: string, role: AuthenticatedActor['role'], permissions: AuthenticatedActor['permissions'] = []): AuthenticatedActor {
  return { id, role, permissions, sessionId: `session-${id}` };
}

function command(suppliedActor: AuthenticatedActor, commandName: string, key: string) {
  return { actor: suppliedActor, command: commandName, idempotencyKey: key, requestId: `request-${key}` };
}

async function expectApiError(action: () => Promise<unknown>, status: number, message: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert(error instanceof ApiError, `ApiError attendue: ${String(error)}`);
    assert(error.status === status, `HTTP ${status} attendu, reçu ${error.status}`);
    return;
  }
  throw new Error(message);
}

function createPGliteDriver(database: PGlite): DriverPoolLike {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<DriverQueryResult<Row>> => {
    const statements = sql.split(';').filter(part => part.trim().length > 0);
    if (values.length === 0 && statements.length > 1) {
      await database.exec(sql);
      return { rows: [], rowCount: 0 };
    }
    const result = await database.query<Row>(sql, [...values]);
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
  };
  return { query, async connect() { return { query, release() {} }; } };
}

export async function runMatchingTests(): Promise<MatchingTestResult[]> {
  const results: MatchingTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('Qualification: une mission indépendante, documentée et conforme aux formalités est éligible produit', () => {
    const result = evaluateMissionQualification(validAnswers());
    assert(result.decision === 'ELIGIBLE_FOR_INDEPENDENT', `décision reçue: ${result.decision}`);
    assert(result.ruleVersion === 'P0-MATCHING-QUALIFICATION-1', 'version de règle persistable attendue');
    assert(result.reasons.some(reason => reason.code === 'PRODUCT_SCREENING_PASSED' && reason.severity === 'INFO'), 'justification structurée attendue');
    assert(result.reasons.every(reason => !reason.explanation.toLowerCase().includes('qualification juridique définitive') || reason.severity === 'INFO'), 'aucune conclusion juridique définitive');
  });

  await check('Qualification: un indice bloquant produit un refus déterministe', () => {
    const first = evaluateMissionQualification(validAnswers({ disciplinaryPower: true }));
    const second = evaluateMissionQualification(validAnswers({ disciplinaryPower: true }));
    assert(first.decision === 'BLOCKED', 'pouvoir disciplinaire doit bloquer');
    assert(JSON.stringify(first) === JSON.stringify(second), 'mêmes réponses doivent produire décision et raisons identiques');
    assert(first.reasons.some(reason => reason.code === 'DISCIPLINARY_POWER_PRESENT' && reason.severity === 'BLOCK'), 'raison structurée du blocage attendue');
  });

  await check('Qualification: une réponse ambiguë ou incomplète est envoyée en revue humaine', () => {
    const answers = validAnswers({ timePlaceConstraint: 'STRONG', candidateFacingConstraintSummary: 'Présence nécessaire dans un atelier client à certains moments.' });
    const result = evaluateMissionQualification(answers);
    assert(result.decision === 'HUMAN_REVIEW_REQUIRED', 'contrainte forte doit demander une revue');
    assert(result.reasons.some(reason => reason.code === 'STRONG_TIME_OR_PLACE_CONSTRAINT'), 'raison de revue attendue');
    const incomplete = evaluateMissionQualification(parseMissionQualificationAnswers({ serviceNature: 'AUTONOMOUS_DELIVERABLE' }));
    assert(incomplete.decision === 'HUMAN_REVIEW_REQUIRED', 'informations manquantes ne doivent pas passer');
  });

  await check('Qualification: shift continu, hiérarchie quotidienne et poste permanent bloquent', () => {
    for (const answers of [
      validAnswers({ continuousShift: true }),
      validAnswers({ dailyHierarchicalOrders: true }),
      validAnswers({ permanentIntegratedPosition: true }),
      validAnswers({ serviceNature: 'PRESENCE_BASED' }),
      validAnswers({ compensationBasis: 'TIME_OR_PRESENCE' }),
      validAnswers({ providerChoosesMethods: false }),
      validAnswers({ providerOrganizesTime: false }),
      validAnswers({ mayDeclineWithoutPenalty: false }),
    ]) {
      assert(evaluateMissionQualification(answers).decision === 'BLOCKED', 'une règle bloquante doit refuser le parcours');
    }
  });

  await check('Qualification: livrable autonome, réception objective et droit réel de refuser passent', () => {
    const result = evaluateMissionQualification(validAnswers({
      deliverableDescription: 'Audit indépendant remis sous forme de rapport.',
      acceptanceCriteria: 'Rapport comportant les sections convenues et sources vérifiables.',
      acceptanceCriteriaObjective: true,
      mayDeclineWithoutPenalty: true,
    }));
    assert(result.decision === 'ELIGIBLE_FOR_INDEPENDENT', `décision reçue: ${result.decision}`);
  });

  await check('Qualification: formalités majorité, statut, autorisation, fiscalité et assurance incomplètes exigent une revue', () => {
    const cases: MissionQualificationAnswers[] = [
      validAnswers({ formalities: { ...validAnswers().formalities, majorityCheckPlanned: false } }),
      validAnswers({ formalities: { ...validAnswers().formalities, professionalStatusRequirementsIdentified: false } }),
      validAnswers({ formalities: { ...validAnswers().formalities, professionalAuthorizationRequired: true, professionalAuthorizationCheckPlanned: false } }),
      validAnswers({ formalities: { ...validAnswers().formalities, taxInvoicingRequirementsIdentified: false } }),
      validAnswers({ formalities: { ...validAnswers().formalities, insuranceRequired: true, insuranceRequirementsIdentified: false } }),
    ];
    for (const answers of cases) assert(evaluateMissionQualification(answers).decision === 'HUMAN_REVIEW_REQUIRED', 'une formalité non résolue doit demander une revue');
  });

  await check('Qualification: l’exclusivité non justifiée bloque et une justification alléguée reste en revue', () => {
    assert(evaluateMissionQualification(validAnswers({ exclusivityRequired: true, exclusivityJustified: false })).decision === 'BLOCKED', 'exclusivité non justifiée doit bloquer');
    const reviewed = evaluateMissionQualification(validAnswers({ exclusivityRequired: true, exclusivityJustified: true }));
    assert(reviewed.decision === 'HUMAN_REVIEW_REQUIRED', 'le moteur ne doit pas valider lui-même une justification d’exclusivité');
  });

  await check('Matching: les critères protégés ne sont ni acceptés dans le profil/tri ni lus par le moteur', () => {
    for (const protectedField of ['origin', 'ethnicity', 'religion', 'opinion', 'unionMembership', 'health', 'sexualLife', 'geneticData', 'biometric', 'disputeCount']) {
      let profileRejected = false;
      try { parseCandidateMatchingProfile({ skills: ['Design'], availability: 'AVAILABLE', [protectedField]: 'x' }); } catch (error) { profileRejected = error instanceof ApiError; }
      assert(profileRejected, `${protectedField} doit être refusé`);
      let sortRejected = false;
      try { parseMatchingSort({ sortBy: 'score', [protectedField]: 'x' }); } catch (error) { sortRejected = error instanceof ApiError; }
      assert(sortRejected, `${protectedField} ne doit pas entrer dans le classement`);
    }
    const profile = parseCandidateMatchingProfile({ skills: ['Design'], availability: 'AVAILABLE' });
    assert(!('health' in profile) && !('religion' in profile) && !('disputeCount' in profile), 'aucun facteur protégé ne doit être ajouté au profil moteur');
  });

  await check('Matching: le score est déterministe et expliqué par les seuls facteurs annoncés', () => {
    const offer = makeOffer('offer-unit', 'employer-unit');
    const candidates = [
      { candidateId: 'candidate-b', displayName: 'B', skills: ['Création visuelle'], departmentId: 'dept-1', availability: 'AVAILABLE' as const, createdAt: 't', updatedAt: 't' },
      { candidateId: 'candidate-a', displayName: 'A', skills: ['Mise en page', 'Création visuelle'], departmentId: 'dept-1', municipalityId: 'commune-1', arrondissementId: 'arr-1', localityId: 'loc-1', availability: 'AVAILABLE' as const, createdAt: 't', updatedAt: 't' },
    ];
    const sorting = { sortBy: 'score' as const, sortDirection: 'DESC' as const };
    const first = rankMatchingCandidates(offer, candidates, sorting);
    const second = rankMatchingCandidates(offer, [...candidates].reverse(), sorting);
    assert(JSON.stringify(first) === JSON.stringify(second), 'ordre identique malgré un ordre source différent');
    assert(first.results[0].candidateId === 'candidate-a' && first.results[0].score === 100, 'meilleur score attendu');
    assert(first.results[0].breakdown.skills.matchedSkills.length === 2, 'compétences correspondantes visibles');
    assert(first.results[0].breakdown.location.match === 'LOCALITY', 'niveau de zone explicable');
    assert(first.criteria.factors.map(factor => factor.code).join(',') === 'SKILLS_OVERLAP,ADMINISTRATIVE_ZONE,DECLARED_AVAILABILITY', 'critères utilisés explicitement annoncés');
    assert(first.criteria.clientMakesFinalChoice && !first.criteria.automaticAssignment, 'aucune affectation automatique');
  });

  await check('Matching: changer le tri ne modifie pas les profils sources', () => {
    const offer = makeOffer('offer-sort', 'employer-sort');
    const candidates = [
      { candidateId: 'c1', displayName: 'Un', skills: ['Création visuelle', 'Mise en page'], availability: 'AVAILABLE' as const, createdAt: 't', updatedAt: 't' },
      { candidateId: 'c2', displayName: 'Deux', skills: ['Autre compétence'], availability: 'LIMITED' as const, createdAt: 't', updatedAt: 't' },
    ];
    const before = JSON.stringify(candidates);
    const desc = rankMatchingCandidates(offer, candidates, { sortBy: 'skills', sortDirection: 'DESC' });
    const asc = rankMatchingCandidates(offer, candidates, { sortBy: 'skills', sortDirection: 'ASC' });
    assert(desc.results[0].candidateId !== asc.results[0].candidateId, 'le tri alternatif doit changer l’ordre lorsque les valeurs divergent');
    assert(JSON.stringify(candidates) === before, 'aucune donnée de profil source ne doit muter');
  });

  const pg = new PGlite();
  try {
    const client = toPostgresClientPort(createPGliteDriver(pg));
    const database = createPostgresDatabase(client);
    const migrations = loadMigrations(MIGRATIONS_DIR);
    await applyMigrations(client, migrations);

    const userStore = createSqlUserStore(database);
    const core = createSqlCoreStores(database);
    const matchingStores = createSqlMatchingStores(database);
    const automation = createSqlAutomationStores(database);
    const buildStores = (tx: Parameters<typeof createSqlMatchingStores>[0]): MatchingRepositoryStores => ({
      offers: createSqlOfferStore(tx),
      users: createSqlUserStore(tx),
      matching: createSqlMatchingStores(tx),
      automation: createSqlAutomationStores(tx),
    });
    const repository = createMatchingRepository({
      stores: { offers: core.offers, users: userStore, matching: matchingStores, automation },
      runInTransaction: operation => database.run(tx => operation(buildStores(tx))),
      now: () => new Date('2026-10-07T12:00:00.000Z'),
    });

    const employer = actor('employer-main', 'EMPLOYER');
    const otherEmployer = actor('employer-other', 'EMPLOYER');
    const candidateA = actor('candidate-a', 'CANDIDATE');
    const candidateB = actor('candidate-b', 'CANDIDATE');
    const candidateC = actor('candidate-c', 'CANDIDATE');
    const candidateD = actor('candidate-d', 'CANDIDATE');
    const admin = actor('admin-main', 'ADMIN', ['offers:moderate', 'offers:read:any', 'match:read:any']);
    const adminWithoutReview = actor('admin-no-review', 'ADMIN', ['match:read:any']);

    const createUser = async (id: string, role: ServerUserRecord['role'], suffix: string) => userStore.create({
      id,
      role,
      status: 'ACTIVE',
      email: `${suffix}@example.test`,
      displayName: `Profil ${suffix}`,
    });
    for (const [id, role, suffix] of [
      ['employer-main', 'EMPLOYER', 'employer-main'],
      ['employer-other', 'EMPLOYER', 'employer-other'],
      ['candidate-a', 'CANDIDATE', 'candidate-a'],
      ['candidate-b', 'CANDIDATE', 'candidate-b'],
      ['candidate-c', 'CANDIDATE', 'candidate-c'],
      ['candidate-d', 'CANDIDATE', 'candidate-d'],
      ['admin-main', 'ADMIN', 'admin-main'],
      ['admin-no-review', 'ADMIN', 'admin-no-review'],
    ] as const) await createUser(id, role, suffix);

    const at = '2026-10-07T12:00:00.000Z';
    const offers = [
      makeOffer('offer-valid', employer.id, { skills: ['Création visuelle', 'Mise en page'] }),
      makeOffer('offer-shift', employer.id),
      makeOffer('offer-review', employer.id),
      makeOffer('offer-review-block', employer.id),
      makeOffer('offer-discipline', employer.id),
      makeOffer('offer-other', otherEmployer.id),
      makeOffer('offer-concurrent', employer.id),
      makeOffer('offer-idempotent', employer.id),
    ];
    for (const offer of offers) await core.offers.create(offer);

    await check('Qualification persistée: mission valide éligible et audit/version présents', async () => {
      const saved = await repository.submitQualification(
        employer,
        'offer-valid',
        validAnswers(),
        command(employer, 'matching.qualification.submit', 'qual-valid-key-0001'),
      );
      assert(saved.decision === 'ELIGIBLE_FOR_INDEPENDENT', 'qualification éligible attendue');
      assert(saved.ruleVersion === 'P0-MATCHING-QUALIFICATION-1', 'version de règle attendue');
      const auditRows = await automation.audit.listByEntity(saved.qualificationId);
      assert(auditRows.length === 1, 'une trace d’audit attendue');
      assert(auditRows[0].actorId === employer.id && auditRows[0].timestamp === at, 'acteur et date traçables');
      assert((auditRows[0].afterState?.reasons as unknown[]).length > 0, 'raisons structurées auditées');
    });

    await check('Qualification persistée: critère bloquant, horaires assimilables à un shift et pouvoir disciplinaire bloquent', async () => {
      const shift = await repository.submitQualification(employer, 'offer-shift', validAnswers({ continuousShift: true }), command(employer, 'matching.qualification.submit', 'qual-shift-key-0001'));
      const discipline = await repository.submitQualification(employer, 'offer-discipline', validAnswers({ disciplinaryPower: true }), command(employer, 'matching.qualification.submit', 'qual-disc-key-0001'));
      assert(shift.decision === 'BLOCKED' && shift.reasons.some(reason => reason.code === 'CONTINUOUS_SHIFT'), 'shift bloqué');
      assert(discipline.decision === 'BLOCKED', 'pouvoir disciplinaire bloqué');
    });

    await check('Qualification persistée: ambiguïté en file ADMIN; la revue seule peut résoudre sans réécrire les réponses', async () => {
      const summary = 'La remise finale nécessite un accès ponctuel au site client, sans horaire continu.';
      const pending = await repository.submitQualification(
        employer,
        'offer-review',
        validAnswers({ timePlaceConstraint: 'STRONG', candidateFacingConstraintSummary: summary }),
        command(employer, 'matching.qualification.submit', 'qual-review-key-0001'),
      );
      assert(pending.decision === 'HUMAN_REVIEW_REQUIRED', 'revue humaine attendue');
      const queue = await repository.listPendingReviews(admin, { cursor: null, limit: 25 });
      assert(queue.items.some(item => item.qualification.qualificationId === pending.qualificationId), 'dossier visible dans la file ADMIN');
      await expectApiError(() => repository.createMatchingRun(employer, 'offer-review', {}, command(employer, 'matching.runs.create', 'run-pending-key-001')), 409, 'matching avant revue accepté');
      await expectApiError(() => repository.listPendingReviews(adminWithoutReview, { cursor: null, limit: 25 }), 403, 'admin sans offers:moderate autorisé');
      const beforeAnswers = JSON.stringify(pending.answers);
      const reviewed = await repository.resolveHumanReview(
        admin,
        pending.qualificationId,
        { decision: 'ELIGIBLE_FOR_INDEPENDENT', reason: 'Les contraintes ponctuelles sont expliquées et ne constituent pas un horaire continu.' },
        command(admin, 'matching.qualification.review', 'review-eligible-key-001'),
      );
      assert(reviewed.initialDecision === 'HUMAN_REVIEW_REQUIRED' && reviewed.decision === 'ELIGIBLE_FOR_INDEPENDENT', 'décision initiale et revue conservées');
      assert(reviewed.reviewedBy === admin.id && reviewed.reviewedAt === at && reviewed.reviewReason, 'acteur/date/motif de revue conservés');
      assert(JSON.stringify(reviewed.answers) === beforeAnswers, 'la revue ne modifie jamais les réponses du client');
      const events = await automation.audit.listByEntity(reviewed.qualificationId);
      assert(events.length === 2 && events.some(event => event.action === 'MISSION_QUALIFICATION_EVALUATED') && events.some(event => event.action === 'MISSION_QUALIFICATION_REVIEWED'), 'évaluation et revue auditées');
      const reviewBlocked = await repository.submitQualification(
        employer,
        'offer-review-block',
        validAnswers({ timePlaceConstraint: 'STRONG', candidateFacingConstraintSummary: summary }),
        command(employer, 'matching.qualification.submit', 'qual-review-block-key-001'),
      );
      const blockedReview = await repository.resolveHumanReview(
        admin,
        reviewBlocked.qualificationId,
        { decision: 'BLOCKED', reason: 'Les éléments examinés restent incompatibles avec les critères produit.' },
        command(admin, 'matching.qualification.review', 'review-blocked-key-001'),
      );
      assert(blockedReview.decision === 'BLOCKED', 'la revue humaine peut bloquer');
      await expectApiError(() => repository.createMatchingRun(employer, 'offer-review-block', {}, command(employer, 'matching.runs.create', 'run-review-block-key')), 422, 'une décision BLOCKED revue doit permettre le matching');
    });

    await check('Profil candidat: ownership, champs minimaux, non-disponible exclu sans calendrier', async () => {
      await repository.updateCandidateProfile(candidateA, {
        skills: ['Création visuelle', 'Mise en page'], departmentId: 'dept-1', municipalityId: 'commune-1', arrondissementId: 'arr-1', localityId: 'loc-1', availability: 'AVAILABLE',
      }, command(candidateA, 'matching.profile.update', 'profile-a-key-0001'));
      await repository.updateCandidateProfile(candidateB, {
        skills: ['Création visuelle'], departmentId: 'dept-1', availability: 'AVAILABLE',
      }, command(candidateB, 'matching.profile.update', 'profile-b-key-0001'));
      await repository.updateCandidateProfile(candidateC, {
        skills: ['Photographie'], availability: 'LIMITED',
      }, command(candidateC, 'matching.profile.update', 'profile-c-key-0001'));
      await repository.updateCandidateProfile(candidateD, {
        skills: ['Création visuelle', 'Mise en page'], departmentId: 'dept-1', availability: 'UNAVAILABLE',
      }, command(candidateD, 'matching.profile.update', 'profile-d-key-0001'));
      assert((await repository.getMyCandidateProfile(candidateA))?.candidateId === candidateA.id, 'candidate lit son propre profil');
      await expectApiError(() => repository.getMyCandidateProfile(employer), 403, 'employeur peut lire profil candidat privé');
      const query = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM candidate_matching_profiles WHERE candidate_id = $1", [candidateA.id]);
      assert(Number(query.rows[0]?.count) === 1, 'un profil minimal persisté');
      const columns = await database.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'candidate_matching_profiles'");
      const columnNames = columns.rows.map(row => row.column_name).join(',').toLowerCase();
      assert(!/(health|religion|ethnic|biometric|genetic|sexual|political|address|latitude|longitude|email|phone)/.test(columnNames), 'aucune donnée sensible, adresse précise ou contact');
    });

    let firstRun: MatchingRunRecord | null = null;
    await check('Matching persistant: ranking explicable, critères/version, client décide, aucun candidat affecté', async () => {
      const result = await repository.createMatchingRun(
        employer,
        'offer-valid',
        { sortBy: 'score', sortDirection: 'DESC' },
        command(employer, 'matching.runs.create', 'run-score-key-0001'),
      );
      firstRun = result;
      assert(result.rulesVersion === 'P0-MATCHING-RANKING-1', 'version de ranking attendue');
      assert(result.criteria.clientMakesFinalChoice && !result.criteria.automaticAssignment, 'choix client maintenu');
      assert(result.results.map(candidate => candidate.candidateId).join(',') === 'candidate-a,candidate-b,candidate-c', 'ordre transparent attendu; candidat indisponible exclu');
      assert(result.results[0].score === 100 && result.results[0].scoreMaximum === 100, 'score complet et expliqué');
      assert(result.results[0].breakdown.skills.matchedSkills.join(',') === 'Création visuelle,Mise en page', 'compétences correspondantes visibles');
      assert(result.results[1].breakdown.location.match === 'DEPARTMENT', 'correspondance de zone expliquée');
      assert(result.results[2].breakdown.availability.declared === 'LIMITED', 'disponibilité simplement déclarée');
      const auditRows = await automation.audit.listByEntity(result.runId);
      assert(auditRows.length === 1 && auditRows[0].afterState?.automaticAssignment === false, 'résultats et non-affectation tracés');
      const applicationCount = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM applications');
      const replacementCount = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM replacements');
      const contractCount = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM contracts');
      assert(applicationCount.rows[0]?.count === '0' && replacementCount.rows[0]?.count === '0' && contractCount.rows[0]?.count === '0', 'aucune candidature, remplacement ou contrat créé');
    });

    await check('Matching: tri modifiable en créant un nouveau snapshot, idempotence et lecture propriétaire', async () => {
      const beforeProfiles = await Promise.all([candidateA, candidateB, candidateC, candidateD].map(candidate => matchingStores.candidateProfiles.findByCandidateId(candidate.id)));
      const replay = await repository.createMatchingRun(employer, 'offer-valid', { sortBy: 'score', sortDirection: 'DESC' }, command(employer, 'matching.runs.create', 'run-score-key-0001'));
      assert(replay.runId === firstRun?.runId, 'rejeu idempotent conserve le même run');
      const skillAsc = await repository.createMatchingRun(employer, 'offer-valid', { sortBy: 'skills', sortDirection: 'ASC' }, command(employer, 'matching.runs.create', 'run-skill-asc-key-001'));
      assert(skillAsc.runId !== firstRun?.runId, 'un tri différent est un nouveau snapshot');
      assert(skillAsc.results.map(result => result.candidateId).join(',') === 'candidate-c,candidate-b,candidate-a', 'tri alternatif annoncé');
      const afterProfiles = await Promise.all([candidateA, candidateB, candidateC, candidateD].map(candidate => matchingStores.candidateProfiles.findByCandidateId(candidate.id)));
      assert(JSON.stringify(beforeProfiles) === JSON.stringify(afterProfiles), 'le tri ne modifie aucune donnée source');
      assert((await repository.getMatchingRun(employer, skillAsc.runId)).runId === skillAsc.runId, 'employeur propriétaire lit les résultats');
      await expectApiError(() => repository.getMatchingRun(otherEmployer, skillAsc.runId), 403, 'un tiers peut lire le run');
      await expectApiError(() => repository.createMatchingRun(otherEmployer, 'offer-valid', {}, command(otherEmployer, 'matching.runs.create', 'run-other-key-0001')), 403, 'un autre employeur peut classer cette offre');
      await expectApiError(() => repository.createMatchingRun(employer, 'offer-valid', { sortBy: 'score', religion: true }, command(employer, 'matching.runs.create', 'run-sensitive-key-001')), 400, 'un critère protégé est accepté');
      await expectApiError(() => repository.createMatchingRun(employer, 'offer-valid', { sortBy: 'score', sortDirection: 'ASC' }, command(employer, 'matching.runs.create', 'run-score-key-0001')), 409, 'une clé réutilisée avec un payload différent doit être refusée');
    });

    await check('Matching: idempotence de qualification, réponses verrouillées et refus sans contournement', async () => {
      const answers = validAnswers();
      const key = 'qual-idempotent-key-001';
      const first = await repository.submitQualification(employer, 'offer-idempotent', answers, command(employer, 'matching.qualification.submit', key));
      const replay = await repository.submitQualification(employer, 'offer-idempotent', answers, command(employer, 'matching.qualification.submit', key));
      assert(first.qualificationId === replay.qualificationId, 'rejeu renvoie la même qualification');
      await expectApiError(() => repository.submitQualification(employer, 'offer-idempotent', validAnswers({ continuousShift: true }), command(employer, 'matching.qualification.submit', 'qual-idempotent-second-key')), 409, 'le client peut remplacer une qualification existante');
    });

    await check('Matching: public constraint summary montre le nécessaire sans score juridique; le candidat décide', async () => {
      const summary = await repository.getPublicMissionConstraints('offer-review');
      assert(summary.timePlaceConstraint === 'STRONG', 'contrainte de temps/lieu visible');
      assert(summary.candidateFacingConstraintSummary.includes('accès ponctuel'), 'résumé de contrainte candidat visible');
      assert(summary.candidateDecidesWhetherToApplyOrAccept && !summary.automaticAssignment, 'liberté du candidat et absence d’affectation');
      assert(!('decision' in summary) && !('reasons' in summary), 'aucune conclusion juridique exposée au public');
    });

    await check('Matching: conflits concurrents empêchent les doubles qualifications et doubles revues', async () => {
      const answer = validAnswers();
      const concurrent = await Promise.allSettled([
        repository.submitQualification(employer, 'offer-concurrent', answer, command(employer, 'matching.qualification.submit', 'qual-concurrent-key-01')),
        repository.submitQualification(employer, 'offer-concurrent', answer, command(employer, 'matching.qualification.submit', 'qual-concurrent-key-02')),
      ]);
      assert(concurrent.filter(item => item.status === 'fulfilled').length === 1, 'une seule qualification concurrente doit gagner');
      assert(concurrent.filter(item => item.status === 'rejected').length === 1, 'la seconde commande concurrente doit échouer');
      const nextOffer = makeOffer('offer-concurrent-review', employer.id);
      await core.offers.create(nextOffer);
      const review = await repository.submitQualification(
        employer,
        nextOffer.id,
        validAnswers({ timePlaceConstraint: 'STRONG', candidateFacingConstraintSummary: 'Intervention sur site selon les besoins annoncés.' }),
        command(employer, 'matching.qualification.submit', 'qual-concurrent-review-key'),
      );
      const reviewRaces = await Promise.allSettled([
        repository.resolveHumanReview(admin, review.qualificationId, { decision: 'BLOCKED', reason: 'Revue concurrente numéro un.' }, command(admin, 'matching.qualification.review', 'review-race-key-0001')),
        repository.resolveHumanReview(admin, review.qualificationId, { decision: 'ELIGIBLE_FOR_INDEPENDENT', reason: 'Revue concurrente numéro deux.' }, command(admin, 'matching.qualification.review', 'review-race-key-0002')),
      ]);
      assert(reviewRaces.filter(item => item.status === 'fulfilled').length === 1, 'une seule revue concurrente doit gagner');
    });

    await check('Matching API: auth/RBAC/ownership, idempotency HTTP et profil candidat isolé', async () => {
      const api = createApiWorker({
        authenticate: async request => {
          const id = request.headers.get('x-test-actor');
          return id === employer.id ? employer
            : id === otherEmployer.id ? otherEmployer
              : id === candidateA.id ? candidateA
                : id === adminWithoutReview.id ? adminWithoutReview
                  : id === admin.id ? admin
                    : null;
        },
        handlers: createMatchingApiHandlers(repository),
      });
      const base = 'https://api.test/api/v1';
      const unauthenticated = await api.fetch(new Request(`${base}/offers/offer-valid/matching-runs`, { method: 'POST', headers: { 'Idempotency-Key': 'api-unauth-key-001' }, body: '{}' }));
      assert(unauthenticated.status === 401, `401 attendu, reçu ${unauthenticated.status}`);
      const wrongRole = await api.fetch(new Request(`${base}/offers/offer-valid/qualification`, {
        method: 'POST',
        headers: { 'x-test-actor': candidateA.id, 'Idempotency-Key': 'api-wrong-role-key-01', 'content-type': 'application/json' },
        body: JSON.stringify({ answers: validAnswers() }),
      }));
      assert(wrongRole.status === 403, `403 attendu, reçu ${wrongRole.status}`);
      const deniedReview = await api.fetch(new Request(`${base}/admin/qualifications/review`, {
        headers: { 'x-test-actor': adminWithoutReview.id },
      }));
      assert(deniedReview.status === 403, `permission offers:moderate requise; reçu ${deniedReview.status}`);
      const summary = await api.fetch(new Request(`${base}/offers/offer-review/qualification-summary`));
      assert(summary.status === 200, `résumé public attendu, reçu ${summary.status}`);
      const update = await api.fetch(new Request(`${base}/my/matching-profile`, {
        method: 'PATCH',
        headers: { 'x-test-actor': candidateA.id, 'Idempotency-Key': 'api-profile-update-key', 'content-type': 'application/json' },
        body: JSON.stringify({ skills: ['Typographie'], availability: 'AVAILABLE' }),
      }));
      assert(update.status === 200, `mise à jour propriétaire attendue, reçu ${update.status}`);
      const profile = await api.fetch(new Request(`${base}/my/matching-profile`, { headers: { 'x-test-actor': candidateA.id } }));
      assert(profile.status === 200, `lecture profil candidat attendue, reçu ${profile.status}`);
    });

    await check('Matching: pas de nouvel événement ni notification asynchrone requis; audit existant utilisé', async () => {
      const outbox = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM automation_outbox');
      const notifications = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');
      assert(outbox.rows[0]?.count === '0', 'aucun événement Outbox inutile introduit');
      assert(notifications.rows[0]?.count === '0', 'aucune notification ni nouveau système créé');
      const audit = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM automation_audit_ledger WHERE source = 'api:P0-MATCHING'");
      assert(Number(audit.rows[0]?.count ?? 0) >= 6, 'le ledger d’audit existant porte les actions importantes');
    });
  } catch (error) {
    results.push({ name: 'Matching PostgreSQL/API setup', success: false, detail: String((error as Error)?.message ?? error) });
  } finally {
    await pg.close();
  }

  return results;
}
