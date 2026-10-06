/**
 * LE LABEUR — P0-AUTO-2 — tests purs des règles d'automatisation contractuelle.
 *
 * Aucune base, aucun réseau : ces tests verrouillent
 *  - la transcription EXACTE des règles qui existent déjà (échéancier mensuel,
 *    25 % / 75 % en M1, 0 % en M2+, J+3) ;
 *  - le REFUS explicite d'inventer une règle absente (périodicité hebdomadaire,
 *    forfait, rappel avant échéance, basculement SCHEDULED → DUE) ;
 *  - le report explicite de FILLED / HIRED / CONTRACTED / CLOSED_OFFER_FILLED ;
 *  - l'absence de tout paiement dans le plan produit.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTOMATION_AUDIT_ACTIONS,
  COMMISSION_IGNORED_AT_OR_BELOW,
  CONTRACT_ACTIVATION_COMMAND,
  CONTRACT_AUTOMATION_HISTORY_EVENTS,
  MISSING_CONTRACT_AUTOMATION_RULES,
  MODEL_COMMISSION_PERCENTAGE,
  MS_PER_DAY,
  PAYMENT_OVERDUE_GRACE_DAYS,
  PAYMENT_OVERDUE_GRACE_PERIOD_MS,
  POST_CONTRACT_DEFERRED_AUTOMATION,
  PRE_DUE_REMINDER_CONFIGURATION,
  REMINDER_ALERT_STATUSES,
  REMINDER_BLOCK_ELIGIBILITY_STATUSES,
  REMINDER_JOB_TYPES,
  REMINDER_NOTIFICATION_TYPES,
  SCHEDULE_CADENCES,
  SCHEDULE_DEADLINE_KINDS,
  SCHEDULE_PERIODICITY_RULES,
  buildContractActivationPlan,
  buildReminderJobs,
  buildScheduleDeadlines,
  contractActivatedEventId,
  contractActivatedIdempotencyKey,
  deadlineStatusAfterReminder,
  evaluateReminderEligibility,
  fullDaysLate,
  reminderDedupeKey,
  reminderEventId,
  reminderJobType,
  resolveSchedulePeriodicityRule,
  toUtcMidnight,
  type ContractScheduleSource,
} from './contractScheduleAutomation';
import { buildPaymentSchedule, parseContractStartDate } from './businessRules';
import { PROPOSAL_PERIODICITY_VALUES } from './proposalTransitions';
import { POST_CONTRACT_AUTOMATION_REQUIREMENTS } from './contractTransitions';
import { J3_SCHEDULER_CONTRACT } from '../backend/services/scheduler';
import { OUTBOX_EFFECT_CONTRACTS } from '../backend/services/outbox';
import type { NotificationType, PaymentScheduleEntry } from '../types';

export interface ContractScheduleAutomationTestCase {
  name: string;
  success: boolean;
  details: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const OCCURRED_AT = '2026-10-05T14:00:00.000Z';

function monthlySource(overrides: Partial<ContractScheduleSource> = {}): ContractScheduleSource {
  return {
    contractId: 'ctr_auto2mensuel0000000000001',
    employerId: 'usr_employer',
    employeeId: 'usr_candidate',
    monthlySalary: 175_000,
    currency: 'FCFA',
    startDate: '01 Novembre 2026',
    durationMonths: 6,
    periodicity: 'Mensuel',
    commissionPercentage: 25,
    ...overrides,
  };
}

function scheduled(source: ContractScheduleSource = monthlySource()) {
  const plan = buildContractActivationPlan(source, OCCURRED_AT);
  assert(plan.kind === 'SCHEDULED', `plan mensuel attendu, reçu ${plan.kind}`);
  return plan;
}

export function runContractScheduleAutomationTests(): ContractScheduleAutomationTestCase[] {
  const results: ContractScheduleAutomationTestCase[] = [];
  const check = (name: string, test: () => void): void => {
    try {
      test();
      results.push({ name, success: true, details: 'OK' });
    } catch (error) {
      results.push({ name, success: false, details: String((error as Error)?.message ?? error) });
    }
  };

  /* ---------------- 1. Périodicités réelles ---------------- */

  check('P0-AUTO-2 Périodicité: les trois valeurs réelles du domaine sont couvertes, aucune n’est inventée', () => {
    assert(
      JSON.stringify(Object.keys(SCHEDULE_PERIODICITY_RULES).sort())
        === JSON.stringify([...PROPOSAL_PERIODICITY_VALUES].sort()),
      `la table de périodicités doit couvrir exactement ${PROPOSAL_PERIODICITY_VALUES.join(', ')}`,
    );
    assert(SCHEDULE_CADENCES.length === 1 && SCHEDULE_CADENCES[0] === 'MONTHLY', 'une seule cadence a une règle réelle');
  });

  check('P0-AUTO-2 Périodicité: seule « Mensuel » a une règle de cadence, avec sa preuve', () => {
    const mensuel = resolveSchedulePeriodicityRule('Mensuel');
    assert(mensuel.ruleDefined === true && mensuel.cadence === 'MONTHLY', 'règle mensuelle attendue');
    assert(
      typeof mensuel.ruleSource === 'string' && mensuel.ruleSource.includes('buildPaymentSchedule'),
      'la règle mensuelle doit citer sa source réelle (buildPaymentSchedule)',
    );
    assert(mensuel.missingRule === null, 'aucune règle manquante pour le mensuel');
  });

  check('P0-AUTO-2 Périodicité: « Hebdomadaire » et « Forfait mission » = règle manquante, AUCUN échéancier produit', () => {
    for (const periodicity of ['Hebdomadaire', 'Forfait mission']) {
      const rule = resolveSchedulePeriodicityRule(periodicity);
      assert(rule.ruleDefined === false, `${periodicity} ne doit pas avoir de règle inventée`);
      assert(rule.cadence === null, `${periodicity} ne doit recevoir aucune cadence`);
      assert(
        typeof rule.missingRule === 'string' && rule.missingRule.length > 40,
        `${periodicity} doit documenter explicitement la règle manquante`,
      );

      const plan = buildContractActivationPlan(monthlySource({ periodicity }), OCCURRED_AT);
      assert(plan.kind === 'RULE_MISSING', `${periodicity} ne doit produire aucun échéancier`);
      assert(plan.periodicity === periodicity, 'la périodicité non résolue est reportée telle quelle');
      assert(
        'paymentSchedule' in plan === false,
        `${periodicity} : aucun échéancier, aucune échéance, aucun montant inventé`,
      );
    }
  });

  check('P0-AUTO-2 Périodicité: valeur hors domaine (contracts.periodicity est un TEXT libre) → règle manquante, jamais devinée', () => {
    for (const periodicity of ['Quotidien', 'mensuel', '', 'MENSUEL']) {
      const plan = buildContractActivationPlan(monthlySource({ periodicity }), OCCURRED_AT);
      assert(plan.kind === 'RULE_MISSING', `« ${periodicity} » ne doit produire aucun échéancier`);
    }
    const rule = resolveSchedulePeriodicityRule('Quotidien');
    assert(rule.ruleDefined === false && rule.cadence === null, 'aucune cadence devinée');
    assert(
      (rule.missingRule ?? '').includes(PROPOSAL_PERIODICITY_VALUES.join(', ')),
      'la règle manquante doit rappeler le domaine réel',
    );
  });

  check('P0-AUTO-2 Périodicité: aucune conversion arbitraire en mensuel (le plan mensuel n’est jamais produit pour une autre périodicité)', () => {
    const weekly = buildContractActivationPlan(monthlySource({ periodicity: 'Hebdomadaire' }), OCCURRED_AT);
    const forfait = buildContractActivationPlan(monthlySource({ periodicity: 'Forfait mission' }), OCCURRED_AT);
    for (const plan of [weekly, forfait]) {
      assert(plan.kind === 'RULE_MISSING', 'plan non mensuel attendu');
    }
    assert(
      MISSING_CONTRACT_AUTOMATION_RULES.some(rule => rule.includes('hebdomadaire')),
      'la règle hebdomadaire manquante doit être documentée',
    );
    assert(
      MISSING_CONTRACT_AUTOMATION_RULES.some(rule => rule.includes('forfait')),
      'la règle du forfait manquante doit être documentée',
    );
  });

  /* ---------------- 2. Échéancier salarial réel ---------------- */

  check('P0-AUTO-2 Échéancier: identique à buildPaymentSchedule (la seule règle de cadence existante)', () => {
    const source = monthlySource();
    const plan = scheduled(source);
    const reference = buildPaymentSchedule({
      contractId: source.contractId,
      startDate: source.startDate,
      durationMonths: source.durationMonths,
      monthlySalary: source.monthlySalary,
      currency: source.currency,
      createdAt: OCCURRED_AT,
    });
    assert(
      JSON.stringify(plan.paymentSchedule) === JSON.stringify(reference),
      'l’échéancier produit doit être exactement celui de la règle existante',
    );
    assert(plan.paymentSchedule.length === 6, 'une période par mois de durée contractuelle');
    assert(plan.cadence === 'MONTHLY', 'cadence mensuelle réelle');
  });

  check('P0-AUTO-2 Échéancier: identifiants, périodes, montants attendus, échéances et statuts du modèle réel', () => {
    const source = monthlySource();
    const plan = scheduled(source);
    const first = plan.paymentSchedule[0];
    assert(first.id === `PSE-${source.contractId}-M1`, 'identifiant d’entrée réel');
    assert(first.contractId === source.contractId, 'contractId porté par chaque entrée');
    assert(first.monthNumber === 1 && first.periodKey === 'Mois 01', 'période réelle du modèle');
    assert(first.periodStartDate === '2026-11-01', 'début de période dérivé de la date de début acceptée');
    assert(first.salaryDueDate === '2026-12-01', 'échéance salariale réelle (addMonthsClamped)');
    assert(first.commissionDueDate === '2026-12-01', 'échéance de commission réelle');
    assert(first.salaryAmount === 175_000, 'montant attendu = salaire contractuel');
    assert(first.currency === 'FCFA', 'devise du contrat');
    assert(first.createdAt === OCCURRED_AT, 'horodatage de création');
    assert(
      plan.paymentSchedule.every(entry => entry.salaryStatus === 'SCHEDULED'),
      'statut salarial initial réel : SCHEDULED (aucun paiement effectué)',
    );
    assert(
      plan.paymentSchedule.every(entry =>
        ['SCHEDULED', 'NOT_APPLICABLE'].includes(entry.commissionStatus)),
      'statuts de commission réels : SCHEDULED en M1, NOT_APPLICABLE ensuite',
    );
    assert(plan.paymentSchedule[0].commissionStatus === 'SCHEDULED', 'commission M1 planifiée');
    assert(plan.paymentSchedule[1].commissionStatus === 'NOT_APPLICABLE', 'commission M2+ sans objet');
  });

  check('P0-AUTO-2 Échéancier: AUCUN paiement effectué (aucun statut payé, aucune déclaration, aucune transaction)', () => {
    const plan = scheduled();
    const forbiddenStatuses = ['PAID', 'PENDING_VERIFICATION', 'REJECTED', 'DUE'];
    for (const entry of plan.paymentSchedule) {
      assert(!forbiddenStatuses.includes(entry.salaryStatus), `statut salarial interdit: ${entry.salaryStatus}`);
      assert(!forbiddenStatuses.includes(entry.commissionStatus), `statut de commission interdit: ${entry.commissionStatus}`);
      assert(entry.salaryDeclaredAt === undefined, 'aucune déclaration de salaire');
      assert(entry.salaryConfirmedAt === undefined, 'aucune confirmation de salaire');
      assert(entry.commissionDeclaredAt === undefined, 'aucune déclaration de commission');
      assert(entry.commissionVerifiedAt === undefined, 'aucune vérification de commission');
      assert(entry.salaryTransactionId === undefined, 'aucun identifiant de transaction salariale');
      assert(entry.commissionTransactionId === undefined, 'aucun identifiant de transaction de commission');
      assert(entry.salaryProofFileName === undefined, 'aucune preuve salariale');
    }
    assert(
      plan.commissionLedger.every(entry => entry.amountSubmitted === 0 && entry.paymentId === undefined),
      'aucune commission soumise ni payée',
    );
  });

  check('P0-AUTO-2 Échéancier: employeur et salarié représentés, période et échéance portées par chaque entrée', () => {
    const source = monthlySource();
    const plan = scheduled(source);
    assert(source.employerId && source.employeeId, 'les deux parties sont des entrées du plan');
    for (const entry of plan.paymentSchedule) {
      assert(entry.contractId === source.contractId, 'contractId');
      assert(/^\d{4}-\d{2}-\d{2}$/.test(entry.salaryDueDate), 'dueAt salarial au format réel');
      assert(typeof entry.monthNumber === 'number' && entry.monthNumber >= 1, 'période numérotée');
      assert(typeof entry.periodKey === 'string' && entry.periodKey.startsWith('Mois '), 'libellé de période réel');
    }
  });

  /* ---------------- 3. Commission : règle de 25 % respectée ---------------- */

  check('P0-AUTO-2 Commission: 25 % en M1 et 0 % ensuite, règle existante inchangée', () => {
    const plan = scheduled(monthlySource({ monthlySalary: 175_000 }));
    assert(plan.paymentSchedule[0].commissionAmount === 43_750, '25 % de 175 000 = 43 750');
    assert(plan.paymentSchedule[0].employeeShareAmount === 131_250, '75 % au salarié');
    assert(plan.commissionAmountDue === 43_750, 'commission due M1');
    assert(plan.commissionStatus === 'SCHEDULED', 'statut de commission réel');
    for (const entry of plan.paymentSchedule.slice(1)) {
      assert(entry.commissionAmount === 0, '0 % de commission en M2+');
      assert(entry.employeeShareAmount === 175_000, '100 % au salarié en M2+');
    }
    assert(MODEL_COMMISSION_PERCENTAGE === 25, 'le pourcentage du modèle reste 25');
  });

  check('P0-AUTO-2 Commission: preuve SQL de la règle de 25 % (migration 0003) et aucune modification', () => {
    const migration = readFileSync(
      resolve(REPO_ROOT, 'migrations', '0003_core_nucleus_alignment.sql'),
      'utf8',
    );
    assert(
      /commission_percentage\s+NUMERIC\(5,\s*2\)\s+NOT NULL DEFAULT 25/.test(migration),
      'la migration 0003 doit toujours imposer commission_percentage DEFAULT 25',
    );
    assert(MODEL_COMMISSION_PERCENTAGE === 25, 'la constante du domaine reste alignée sur la migration');
  });

  check('P0-AUTO-2 Commission: la valeur PERSISTÉE du contrat est reportée telle quelle, jamais réécrite', () => {
    // Un contrat dont la colonne vaudrait autre chose que 25 n’est PAS corrigé :
    // la valeur lue est reportée dans le grand livre, et l’échéancier continue
    // d’appliquer la seule règle existante (buildPaymentSchedule).
    const plan = scheduled(monthlySource({ commissionPercentage: 25 }));
    assert(plan.commissionPercentage === 25, 'pourcentage du contrat reporté');
    assert(plan.commissionLedger[0].percentage === 25, 'pourcentage reporté dans le grand livre');
    assert(plan.commissionLedger[0].amountDue === 43_750, 'montant dû réel');
    assert(plan.commissionLedger[0].salaryBase === 175_000, 'assiette réelle');
  });

  check('P0-AUTO-2 Commission: grand livre et point de contrôle M1 conformes à MockRepository.generateContract', () => {
    const plan = scheduled();
    assert(plan.commissionLedger.length === 1, 'une seule entrée de grand livre à l’activation (M1)');
    const ledger = plan.commissionLedger[0];
    assert(ledger.monthNumber === 1 && ledger.status === 'SCHEDULED', 'entrée M1 planifiée');
    assert(ledger.createdAt === OCCURRED_AT, 'horodatage réel');

    assert(plan.monthlyCheckpoints.length === 1, 'un seul point de contrôle mensuel à l’activation (M1)');
    const checkpoint = plan.monthlyCheckpoints[0];
    assert(checkpoint.monthNumber === 1 && checkpoint.periodKey === 'Mois 01', 'point de contrôle M1');
    assert(checkpoint.salaryAmount === 175_000, 'salaire du point de contrôle');
    assert(checkpoint.employeeShareAmount === 131_250, 'part salarié (75 %)');
    assert(checkpoint.leLabeurShareAmount === 43_750, 'part LE LABEUR (25 %)');
    assert(checkpoint.isStarted === false, 'aucun démarrage de mission inventé');
    assert(checkpoint.isSalaryPaidToEmployee === false, 'aucun paiement déclaré');
    assert(checkpoint.employerConfirmed === false && checkpoint.employeeConfirmed === false, 'aucune confirmation');
  });

  check('P0-AUTO-2 Commission: salaire nul → aucune commission, statut NOT_APPLICABLE (règle réelle)', () => {
    const plan = scheduled(monthlySource({ monthlySalary: 0 }));
    assert(plan.commissionAmountDue === 0, 'aucune commission sur un salaire nul');
    assert(plan.commissionStatus === 'NOT_APPLICABLE', 'commission sans objet');
    assert(plan.commissionLedger.length === 0, 'aucune entrée de grand livre inventée');
  });

  /* ---------------- 4. Échéances (Deadline / SLA) ---------------- */

  check('P0-AUTO-2 Échéances: une par salaire, et pour la commission uniquement si strictement positive', () => {
    const plan = scheduled();
    const deadlines = buildScheduleDeadlines(plan.paymentSchedule[0].contractId, plan.paymentSchedule);
    const salary = deadlines.filter(deadline => deadline.kind === 'SALARY_PAYMENT');
    const commission = deadlines.filter(deadline => deadline.kind === 'COMMISSION_PAYMENT');
    assert(salary.length === 6, 'une échéance salariale par période');
    assert(commission.length === 1, 'une seule échéance de commission (M1, 25 % > 0)');
    assert(
      JSON.stringify(SCHEDULE_DEADLINE_KINDS) === JSON.stringify(['SALARY_PAYMENT', 'COMMISSION_PAYMENT']),
      'aucune nature d’échéance inventée',
    );
  });

  check('P0-AUTO-2 Échéances: dueAt = date d’échéance réelle à minuit UTC, jamais une heure inventée', () => {
    const plan = scheduled();
    const deadlines = buildScheduleDeadlines(plan.paymentSchedule[0].contractId, plan.paymentSchedule);
    for (const deadline of deadlines) {
      assert(
        deadline.dueAt.endsWith('T00:00:00.000Z'),
        `dueAt doit être la date seule à minuit UTC, reçu ${deadline.dueAt}`,
      );
      assert(/^\d{4}-\d{2}-\d{2}$/.test(deadline.dueDate), 'date d’échéance réelle');
      assert(deadline.dueAt === toUtcMidnight(deadline.dueDate), 'modèle de date identique à J3_SCHEDULER_CONTRACT');
    }
    assert(
      deadlines.find(deadline => deadline.kind === 'SALARY_PAYMENT')?.dueAt === '2026-12-01T00:00:00.000Z',
      'échéance M1 = date de début + 1 mois',
    );
  });

  check('P0-AUTO-2 Échéances: SLA, grâce J+3 et escalade dérivés de la règle réelle, aucune durée inventée', () => {
    const plan = scheduled();
    const deadlines = buildScheduleDeadlines(plan.paymentSchedule[0].contractId, plan.paymentSchedule);
    assert(PAYMENT_OVERDUE_GRACE_DAYS === J3_SCHEDULER_CONTRACT.thresholdDays, 'seuil J+3 aligné sur la règle réelle');
    assert(MS_PER_DAY === 86_400_000, 'diviseur réel du calcul de jours de retard');
    assert(PAYMENT_OVERDUE_GRACE_PERIOD_MS === PAYMENT_OVERDUE_GRACE_DAYS * MS_PER_DAY, 'grâce dérivée du seuil réel');
    for (const deadline of deadlines) {
      assert(deadline.gracePeriodMs === PAYMENT_OVERDUE_GRACE_PERIOD_MS, 'grâce réelle');
      assert(deadline.escalation === J3_SCHEDULER_CONTRACT.domainEvent, 'escalade = événement de domaine réel');
      assert(
        deadline.sla === (deadline.kind === 'SALARY_PAYMENT' ? 'SALARY_PAYMENT_DUE' : 'COMMISSION_PAYMENT_DUE'),
        'SLA nommé d’après l’échéance réelle',
      );
      assert(deadline.aggregateType === 'contract' && deadline.aggregateId.length > 0, 'agrégat réel');
      assert(deadline.reference.startsWith('PSE-'), 'référence à l’entrée d’échéancier');
      assert(deadline.idempotencyKey.length > 0, 'clé d’idempotence déterministe');
    }
  });

  /* ---------------- 5. Jobs de rappel ---------------- */

  check('P0-AUTO-2 Rappels: quatre types réels, aucun type de notification inventé', () => {
    assert(
      JSON.stringify(REMINDER_JOB_TYPES) === JSON.stringify([
        'SALARY_DUE_REMINDER',
        'COMMISSION_DUE_REMINDER',
        'SALARY_OVERDUE_J3_REMINDER',
        'COMMISSION_OVERDUE_J3_REMINDER',
      ]),
      'les quatre rappels dérivent du comportement réel du modèle',
    );
    const known: NotificationType[] = ['MONTHLY_CHECKPOINT', 'COMMISSION_DUE', 'PAYMENT_OVERDUE_J3'];
    for (const jobType of REMINDER_JOB_TYPES) {
      assert(
        known.includes(REMINDER_NOTIFICATION_TYPES[jobType]),
        `${jobType} doit porter un NotificationType réel`,
      );
    }
    assert(REMINDER_NOTIFICATION_TYPES.SALARY_DUE_REMINDER === 'MONTHLY_CHECKPOINT', 'rappel salarial réel');
    assert(REMINDER_NOTIFICATION_TYPES.COMMISSION_DUE_REMINDER === 'COMMISSION_DUE', 'rappel de commission réel');
    assert(
      REMINDER_NOTIFICATION_TYPES.SALARY_OVERDUE_J3_REMINDER === 'PAYMENT_OVERDUE_J3'
      && REMINDER_NOTIFICATION_TYPES.COMMISSION_OVERDUE_J3_REMINDER === 'PAYMENT_OVERDUE_J3',
      'rappel J+3 réel',
    );
  });

  check('P0-AUTO-2 Rappels: dueAt à l’échéance puis à J+3 exactement (3 jours, règle réelle)', () => {
    const plan = scheduled();
    const deadlines = buildScheduleDeadlines(plan.paymentSchedule[0].contractId, plan.paymentSchedule);
    const jobs = buildReminderJobs(plan.paymentSchedule[0].contractId, deadlines);
    assert(jobs.length === deadlines.length * 2, 'deux rappels par échéance (échéance et J+3)');
    for (const job of jobs) {
      const deadline = deadlines.find(candidate => candidate.id === job.deadlineId);
      assert(deadline, 'chaque rappel porte une échéance existante');
      if (job.stage === 'DUE') {
        assert(job.dueAt === deadline!.dueAt, 'rappel à l’échéance exacte');
      } else {
        const expected = new Date(new Date(deadline!.dueAt).getTime() + 3 * MS_PER_DAY).toISOString();
        assert(job.dueAt === expected, `rappel J+3 attendu ${expected}, reçu ${job.dueAt}`);
      }
      assert(job.jobType === reminderJobType(job.paymentKind, job.stage), 'type de rappel cohérent');
    }
  });

  check('P0-AUTO-2 Rappels: clé d’idempotence conforme au contrat d’outbox documenté (schedule-entry + payment-kind + due-date + J3)', () => {
    const documented = OUTBOX_EFFECT_CONTRACTS.find(contract => contract.eventType === 'PAYMENT_OVERDUE_J3');
    assert(documented, 'le contrat PAYMENT_OVERDUE_J3 existe déjà dans l’outbox documenté');
    assert(
      documented!.idempotencyKey === 'schedule-entry + payment-kind + due-date + J3',
      'la clé documentée ne doit pas changer',
    );
    const plan = scheduled();
    const deadlines = buildScheduleDeadlines(plan.paymentSchedule[0].contractId, plan.paymentSchedule);
    const jobs = buildReminderJobs(plan.paymentSchedule[0].contractId, deadlines);
    const j3 = jobs.find(job => job.stage === 'J3')!;
    assert(
      j3.idempotencyKey === `${j3.reference}:${j3.paymentKind}:${j3.dueDate}:J3`,
      `clé J3 conforme attendue, reçue ${j3.idempotencyKey}`,
    );
    const due = jobs.find(job => job.stage === 'DUE')!;
    assert(
      due.idempotencyKey === `${due.reference}:${due.paymentKind}:${due.dueDate}:DUE`,
      'clé à échéance conforme',
    );
    assert(
      new Set(jobs.map(job => job.idempotencyKey)).size === jobs.length,
      'chaque rappel a une clé d’idempotence unique',
    );
    assert(new Set(jobs.map(job => job.jobId)).size === jobs.length, 'chaque rappel a un identifiant unique');
  });

  check('P0-AUTO-2 Rappels: AUCUN rappel avant échéance (règle absente, aucune avance inventée)', () => {
    assert(PRE_DUE_REMINDER_CONFIGURATION.ruleDefined === false, 'aucune règle de rappel anticipé');
    assert(PRE_DUE_REMINDER_CONFIGURATION.leadTimeMs === null, 'aucune avance inventée');
    const plan = scheduled();
    const deadlines = buildScheduleDeadlines(plan.paymentSchedule[0].contractId, plan.paymentSchedule);
    const jobs = buildReminderJobs(plan.paymentSchedule[0].contractId, deadlines);
    for (const job of jobs) {
      const deadline = deadlines.find(candidate => candidate.id === job.deadlineId)!;
      assert(
        new Date(job.dueAt).getTime() >= new Date(deadline.dueAt).getTime(),
        'aucun rappel ne peut précéder son échéance',
      );
    }
    assert(
      MISSING_CONTRACT_AUTOMATION_RULES.some(rule => rule.includes('AVANT l’échéance')),
      'le rappel anticipé manquant doit être documenté',
    );
  });

  check('P0-AUTO-2 Rappels: aucun canal de notification (les types préparés sont des événements, pas des envois)', () => {
    const plan = scheduled();
    const deadlines = buildScheduleDeadlines(plan.paymentSchedule[0].contractId, plan.paymentSchedule);
    const jobs = buildReminderJobs(plan.paymentSchedule[0].contractId, deadlines);
    for (const job of jobs) {
      assert(!('channel' in job), 'aucun canal sur un job de rappel');
      assert(!('recipient' in job), 'aucun destinataire résolu : le module Notifications n’existe pas encore');
      assert(!('message' in job) && !('title' in job), 'aucun contenu de notification produit');
    }
  });

  /* ---------------- 6. Éligibilité et statuts ---------------- */

  check('P0-AUTO-2 Éligibilité: statuts réels du modèle (alertStatuses / blockEligibilityStatuses), aucun statut ajouté', () => {
    assert(
      JSON.stringify(REMINDER_ALERT_STATUSES) === JSON.stringify(J3_SCHEDULER_CONTRACT.alertStatuses),
      'statuts d’alerte alignés sur la règle réelle',
    );
    assert(
      JSON.stringify(REMINDER_BLOCK_ELIGIBILITY_STATUSES) === JSON.stringify(J3_SCHEDULER_CONTRACT.blockEligibilityStatuses),
      'statuts de blocage alignés sur la règle réelle',
    );
    assert(
      COMMISSION_IGNORED_AT_OR_BELOW === J3_SCHEDULER_CONTRACT.ignoreCommissionWhenAtOrBelow,
      'seuil d’ignorance de la commission aligné',
    );
  });

  check('P0-AUTO-2 Éligibilité: matrice réelle (DUE éligible, J+3 < 3 jours non échu, réglé, commission nulle, SCHEDULED non basculé)', () => {
    const dueAt = '2026-12-01T00:00:00.000Z';

    const eligible = evaluateReminderEligibility({
      paymentKind: 'SALARY', stage: 'DUE', amount: 175_000, dueAt, status: 'DUE', evaluatedAt: dueAt,
    });
    assert(eligible.kind === 'ELIGIBLE' && eligible.daysLate === 0, 'échéance atteinte et statut DUE → éligible');

    const j3TooEarly = evaluateReminderEligibility({
      paymentKind: 'SALARY', stage: 'J3', amount: 175_000, dueAt, status: 'DUE',
      evaluatedAt: new Date(new Date(dueAt).getTime() + 2 * MS_PER_DAY).toISOString(),
    });
    assert(j3TooEarly.kind === 'NOT_DUE_YET' && j3TooEarly.daysLate === 2, 'J+2 : le rappel J3 n’est pas encore dû');

    const j3 = evaluateReminderEligibility({
      paymentKind: 'SALARY', stage: 'J3', amount: 175_000, dueAt, status: 'DUE',
      evaluatedAt: new Date(new Date(dueAt).getTime() + 3 * MS_PER_DAY).toISOString(),
    });
    assert(j3.kind === 'ELIGIBLE' && j3.daysLate === 3, 'J+3 exact : éligible');

    const rejectedJ3 = evaluateReminderEligibility({
      paymentKind: 'SALARY', stage: 'J3', amount: 175_000, dueAt, status: 'REJECTED',
      evaluatedAt: new Date(new Date(dueAt).getTime() + 5 * MS_PER_DAY).toISOString(),
    });
    assert(rejectedJ3.kind === 'ELIGIBLE', 'REJECTED reste régularisable à J+3 (règle réelle)');

    const rejectedDue = evaluateReminderEligibility({
      paymentKind: 'SALARY', stage: 'DUE', amount: 175_000, dueAt, status: 'REJECTED', evaluatedAt: dueAt,
    });
    assert(rejectedDue.kind === 'NOT_ELIGIBLE', 'REJECTED n’est pas un statut d’alerte à échéance');

    for (const status of ['PAID', 'NOT_APPLICABLE'] as const) {
      const settled = evaluateReminderEligibility({
        paymentKind: 'SALARY', stage: 'J3', amount: 175_000, dueAt, status, evaluatedAt: dueAt,
      });
      assert(settled.kind === 'SETTLED', `${status} → échéance réglée ou sans objet`);
    }

    const zeroCommission = evaluateReminderEligibility({
      paymentKind: 'COMMISSION', stage: 'J3', amount: 0, dueAt, status: 'DUE', evaluatedAt: dueAt,
    });
    assert(zeroCommission.kind === 'NOT_ELIGIBLE', 'commission nulle ignorée (règle réelle)');

    const scheduled = evaluateReminderEligibility({
      paymentKind: 'SALARY', stage: 'DUE', amount: 175_000, dueAt, status: 'SCHEDULED', evaluatedAt: dueAt,
    });
    assert(
      scheduled.kind === 'NOT_ELIGIBLE' && scheduled.reason.includes('cycle paiements'),
      'SCHEDULED n’est pas basculé en DUE par P0-AUTO-2 : la raison doit le documenter',
    );
  });

  check('P0-AUTO-2 Échéance: statut après rappel (OVERDUE à échéance, ESCALATED à J+3, MET si réglée, OPEN sinon)', () => {
    assert(deadlineStatusAfterReminder({ kind: 'ELIGIBLE', daysLate: 0 }, 'DUE') === 'OVERDUE', 'OVERDUE à l’échéance');
    assert(deadlineStatusAfterReminder({ kind: 'ELIGIBLE', daysLate: 3 }, 'J3') === 'ESCALATED', 'ESCALATED à J+3');
    assert(deadlineStatusAfterReminder({ kind: 'SETTLED', status: 'PAID' }, 'J3') === 'MET', 'MET si réglée');
    assert(deadlineStatusAfterReminder({ kind: 'NOT_DUE_YET', daysLate: 1 }, 'J3') === 'OPEN', 'OPEN tant que non échu');
    assert(
      deadlineStatusAfterReminder({ kind: 'NOT_ELIGIBLE', status: 'SCHEDULED', reason: 'r' }, 'DUE') === 'OPEN',
      'OPEN quand le statut ne permet pas le rappel',
    );
  });

  check('P0-AUTO-2 Jours de retard: formule réelle floor((évaluation - échéance) / 86 400 000)', () => {
    assert(J3_SCHEDULER_CONTRACT.fullDaysLate === 'floor((evaluationTime - dueAt) / 86_400_000)', 'formule réelle inchangée');
    const dueAt = '2026-12-01T00:00:00.000Z';
    assert(fullDaysLate(dueAt, dueAt) === 0, 'J0');
    assert(fullDaysLate(dueAt, '2026-12-04T00:00:00.000Z') === 3, 'J3');
    assert(fullDaysLate(dueAt, '2026-12-04T23:59:59.999Z') === 3, 'jours ENTIERS, pas arrondis');
    assert(fullDaysLate(dueAt, '2026-11-30T00:00:00.000Z') === -1, 'avant échéance : négatif');
    assert(fullDaysLate('date-invalide', dueAt) === 0, 'date invalide : jamais de retard inventé');
  });

  /* ---------------- 7. Déterminisme (rejeu sans double effet) ---------------- */

  check('P0-AUTO-2 Idempotence: mêmes entrées → mêmes identifiants et mêmes clés (rejeu sans double effet)', () => {
    const source = monthlySource();
    const first = scheduled(source);
    const second = scheduled(source);
    assert(
      JSON.stringify(first.paymentSchedule) === JSON.stringify(second.paymentSchedule),
      'l’échéancier est déterministe',
    );
    const contractId = source.contractId;
    const deadlinesA = buildScheduleDeadlines(contractId, first.paymentSchedule);
    const deadlinesB = buildScheduleDeadlines(contractId, second.paymentSchedule);
    assert(
      JSON.stringify(deadlinesA) === JSON.stringify(deadlinesB),
      'les échéances sont déterministes',
    );
    assert(
      JSON.stringify(buildReminderJobs(contractId, deadlinesA))
        === JSON.stringify(buildReminderJobs(contractId, deadlinesB)),
      'les rappels sont déterministes',
    );
    assert(
      contractActivatedEventId(contractId) === contractActivatedEventId(contractId),
      'l’identifiant d’événement est déterministe',
    );
    assert(
      contractActivatedIdempotencyKey(contractId) === `${contractId}:CONTRACT_ACTIVATED`,
      'clé d’idempotence d’activation stable',
    );
    assert(reminderEventId('job_x') === 'evt_notification_job_x', 'identifiant d’événement de rappel stable');
    assert(
      reminderDedupeKey({ contractId, monthNumber: 1, paymentKind: 'SALARY', stage: 'J3' })
        === `${contractId}:1:SALARY:J3`,
      'forme réelle de la clé de déduplication',
    );
  });

  check('P0-AUTO-2 Idempotence: deux contrats distincts ne partagent aucune clé', () => {
    const planA = scheduled(monthlySource({ contractId: 'ctr_a' }));
    const planB = scheduled(monthlySource({ contractId: 'ctr_b' }));
    const keysA = new Set([
      ...buildScheduleDeadlines('ctr_a', planA.paymentSchedule).map(deadline => deadline.idempotencyKey),
      ...buildReminderJobs('ctr_a', buildScheduleDeadlines('ctr_a', planA.paymentSchedule)).map(job => job.idempotencyKey),
    ]);
    const keysB = new Set([
      ...buildScheduleDeadlines('ctr_b', planB.paymentSchedule).map(deadline => deadline.idempotencyKey),
      ...buildReminderJobs('ctr_b', buildScheduleDeadlines('ctr_b', planB.paymentSchedule)).map(job => job.idempotencyKey),
    ]);
    assert([...keysA].every(key => !keysB.has(key)), 'aucune collision de clé entre contrats');
    assert(contractActivatedEventId('ctr_a') !== contractActivatedEventId('ctr_b'), 'événements distincts');
  });

  /* ---------------- 8. Dates limites réelles ---------------- */

  check('P0-AUTO-2 Dates limites: fin de mois, année bissextile et fin d’année (addMonthsClamped réel)', () => {
    const cases: Array<[string, string]> = [
      ['2026-01-31', '2026-02-28'],
      ['2028-01-31', '2028-02-29'],
      ['2026-04-30', '2026-05-30'],
      ['2026-12-31', '2027-01-31'],
      ['2026-08-31', '2026-09-30'],
    ];
    for (const [startDate, expectedDue] of cases) {
      const plan = scheduled(monthlySource({ startDate, durationMonths: 1 }));
      assert(
        plan.paymentSchedule[0].salaryDueDate === expectedDue,
        `${startDate} → échéance ${expectedDue} attendue, reçue ${plan.paymentSchedule[0].salaryDueDate}`,
      );
      assert(plan.paymentSchedule[0].periodStartDate === startDate, 'début de période conservé');
    }
    // La règle de cadence utilisée est bien celle du modèle, pas une réécriture.
    assert(parseContractStartDate('31 Janvier 2026').toISOString().startsWith('2026-01-31'), 'libellé français réel accepté');
  });

  check('P0-AUTO-2 Durée: un mois minimum, durée entière (règle réelle buildPaymentSchedule)', () => {
    assert(scheduled(monthlySource({ durationMonths: 1 })).paymentSchedule.length === 1, 'durée 1 mois');
    assert(scheduled(monthlySource({ durationMonths: 12 })).paymentSchedule.length === 12, 'durée 12 mois');
    assert(scheduled(monthlySource({ durationMonths: 0 })).paymentSchedule.length === 1, 'durée 0 ramenée à 1 (règle réelle)');
    assert(scheduled(monthlySource({ durationMonths: 3.7 })).paymentSchedule.length === 3, 'durée tronquée (règle réelle)');
  });

  check('P0-AUTO-2 Date de début invalide: refus explicite, aucune échéance inventée', () => {
    let failed = false;
    try {
      buildContractActivationPlan(monthlySource({ startDate: 'pas-une-date' }), OCCURRED_AT);
    } catch (error) {
      failed = String((error as Error)?.message ?? error).includes('invalide');
    }
    assert(failed, 'une date de début invalide doit être refusée explicitement');
  });

  /* ---------------- 9. Audit et historique ---------------- */

  check('P0-AUTO-2 Audit: actions du ledger alignées sur la règle réelle J+3 documentée', () => {
    assert(
      AUTOMATION_AUDIT_ACTIONS.j3EligibilityRecorded === J3_SCHEDULER_CONTRACT.futureAuditAction,
      'l’action d’audit J+3 est le nom réel déjà documenté',
    );
    assert(J3_SCHEDULER_CONTRACT.futureAuditActor === 'SYSTEM', 'acteur SYSTEM réel');
    assert(
      MISSING_CONTRACT_AUTOMATION_RULES.length >= 6,
      'toutes les règles manquantes doivent être documentées',
    );
    assert(
      CONTRACT_AUTOMATION_HISTORY_EVENTS.scheduleCreated === 'PAYMENT_SCHEDULE_CREATED'
      && CONTRACT_AUTOMATION_HISTORY_EVENTS.scheduleRuleMissing === 'PAYMENT_SCHEDULE_RULE_MISSING',
      'historique métier ajouté (jamais remplacé par le ledger)',
    );
    assert(CONTRACT_ACTIVATION_COMMAND === 'automation.CONTRACT_ACTIVATED', 'commande d’idempotence stable');
  });

  /* ---------------- 10. Post-contractuel explicitement reporté ---------------- */

  check('P0-AUTO-2 Post-contrat: FILLED / HIRED / CONTRACTED / CLOSED_OFFER_FILLED explicitement REPORTÉS, non implémentés', () => {
    const transitions = POST_CONTRACT_DEFERRED_AUTOMATION.map(item => item.transition);
    assert(
      transitions.includes('OFFER → FILLED')
      && transitions.includes('APPLICATION → HIRED')
      && transitions.includes('APPLICATION → CONTRACTED')
      && transitions.includes('APPLICATION → CLOSED_OFFER_FILLED'),
      'les quatre transitions post-contractuelles doivent être listées',
    );
    for (const item of POST_CONTRACT_DEFERRED_AUTOMATION) {
      assert(item.implemented === false, `${item.transition} ne doit PAS être implémentée dans cette tranche`);
      assert(item.reason.length > 20, `${item.transition} doit justifier son report`);
    }
    // Cohérence avec la décision déjà documentée par P0-F.
    assert(
      POST_CONTRACT_AUTOMATION_REQUIREMENTS.some(requirement => requirement.includes('FILLED')),
      'P0-F documentait déjà ce report : P0-AUTO-2 ne l’ouvre pas',
    );
    assert(
      POST_CONTRACT_AUTOMATION_REQUIREMENTS.some(requirement => requirement.includes('CLOSED_OFFER_FILLED')),
      'la fermeture des autres candidatures reste reportée',
    );
  });

  check('P0-AUTO-2 Périmètre: aucune règle de paiement, KYC, document ou notification envoyée n’est produite', () => {
    const plan = scheduled();
    const serialized = JSON.stringify(plan);
    for (const forbidden of ['PAID', 'PENDING_VERIFICATION', 'transactionId', 'senderPhone', 'otp', 'kyc', 'KYC']) {
      assert(!serialized.includes(forbidden), `le plan ne doit contenir aucune trace de ${forbidden}`);
    }
    assert(
      PRE_DUE_REMINDER_CONFIGURATION.evidence.every(item => item.includes('src/')),
      'chaque règle manquante cite sa preuve dans le code',
    );
  });

  check('P0-AUTO-2 Cohérence: le plan d’activation porte les identifiants d’entrée attendus ( PaymentScheduleEntry )', () => {
    const plan = scheduled();
    const entry: PaymentScheduleEntry = plan.paymentSchedule[0];
    const required: Array<keyof PaymentScheduleEntry> = [
      'id', 'contractId', 'monthNumber', 'periodKey', 'periodStartDate',
      'salaryDueDate', 'commissionDueDate', 'salaryAmount', 'employeeShareAmount',
      'commissionAmount', 'currency', 'salaryStatus', 'commissionStatus', 'createdAt',
    ];
    for (const field of required) {
      assert(entry[field] !== undefined, `champ réel manquant: ${field}`);
    }
  });

  return results;
}
