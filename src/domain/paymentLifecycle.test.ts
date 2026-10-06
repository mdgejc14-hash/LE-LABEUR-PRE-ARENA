/**
 * LE LABEUR — P0-PAY-1 — tests du domaine PAIEMENT (pur, sans E/S).
 *
 * Ces tests verrouillent la chaîne métier AVANT tout paiement réel : statuts,
 * matrice de transitions (dont les transitions interdites), matérialisation
 * depuis l'échéancier existant, séparation SALARY/PLATFORM_FEE, déclaration
 * (autorité serveur), vérification locale déterministe, rappels pré-échéance
 * (configuration seule, jamais une valeur inventée) et frontière fournisseur.
 *
 * Ils verrouillent aussi ce qui ne doit PAS changer : `commission_percentage`
 * (25 %), les statuts du contrat (aucun `VERIFIED` ajouté au modèle), et
 * l'absence de règle inventée pour les périodicités sans cadence.
 */

import {
  COMMISSION_IGNORED_AT_OR_BELOW,
  CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS,
  DOCUMENTED_PAYMENT_EVENTS,
  MISSING_PAYMENT_CYCLE_RULES,
  MODEL_COMMISSION_PERCENTAGE,
  MONTHLY_ACTIONS_OUT_OF_SCOPE,
  PAYMENT_ACTION_VALUES,
  PAYMENT_AUDIT_FIELDS,
  PAYMENT_DEFERRED_NOTIFICATION_EVENT_TYPES,
  PAYMENT_DOMAIN_EXACTNESS,
  PAYMENT_EVENT_CATALOG,
  PAYMENT_LIFECYCLE_STATUS_VALUES,
  PAYMENT_PRE_DUE_JOB_TYPE,
  PAYMENT_PRODUCED_EVENT_TYPES,
  PAYMENT_PROVIDER_ADAPTERS,
  PAYMENT_REFUSED_TRANSITIONS,
  PAYMENT_TRANSITION_RULES,
  PAYMENT_AUDIT_ACTIONS,
  evaluateReconciliation,
  type NormalizedPaymentTransaction,
} from './paymentLifecycle';
import {
  PAYMENT_AUTOMATION_SOURCE,
  PAYMENT_STATUS_MEANINGS,
  PAYMENT_TERMINAL_STATUSES,
  PAYMENT_TYPE_MAPPING,
  REAL_PAYMENT_OUT_OF_SCOPE,
  buildPaymentDrafts,
  buildPreDueReminderJobs,
  deadlineIdForPayment,
  evaluateMonthlyAdvance,
  evaluatePaymentDeclaration,
  evaluatePaymentTransition,
  evaluatePreDueReminder,
  isPaymentPeriodDue,
  normalizePaymentDeclarationPayload,
  PAYMENT_SETTLED_STATUSES,
  paymentDeclarationId,
  paymentDeclarationIdempotencyKey,
  paymentDueIdempotencyKey,
  paymentEventId,
  paymentIdFor,
  paymentIdempotencyKeyFor,
  paymentTypeForDeadlineKind,
  resolvePaymentPeriodicityRule,
  resolvePreDueLeadTimeMs,
  verifyPaymentDeclarationLocally,
  type PaymentAction,
  type PaymentDraft,
  type PaymentLifecycleStatus,
  type PaymentVerificationRequest,
} from './paymentLifecycle';
import { isPaymentDue } from './businessRules';

export interface PaymentLifecycleTestResult {
  name: string;
  success: boolean;
  details?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CONTRACT_ID = 'ctr_p0pay_domain';
const EMPLOYER_ID = 'usr_employer_p0pay';
const CANDIDATE_ID = 'usr_candidate_p0pay';
const SCHEDULED_AT = '2026-10-05T14:00:00.000Z';
const MONTHLY_SALARY = 175_000;

/** Échéance du mois `n` du contrat : date réelle à minuit UTC (modèle du dépôt). */
function periodDueDate(monthNumber: number): string {
  const date = new Date(Date.UTC(2026, 8 + monthNumber, 5));
  return date.toISOString().slice(0, 10);
}

function scheduleEntry(monthNumber: number, overrides: Partial<{
  commissionAmount: number;
  salaryAmount: number;
  employeeShareAmount: number;
  commissionDueDate: string;
  salaryDueDate: string;
}> = {}) {
  const periodStart = new Date(Date.UTC(2026, 8 + monthNumber - 1, 5)).toISOString().slice(0, 10);
  const dueDate = overrides.salaryDueDate ?? periodDueDate(monthNumber);
  return {
    id: `PSE-${CONTRACT_ID}-M${monthNumber}`,
    contractId: CONTRACT_ID,
    monthNumber,
    periodKey: `Mois ${String(monthNumber).padStart(2, '0')}`,
    periodStartDate: overrides.commissionDueDate ?? periodStart,
    salaryDueDate: dueDate,
    commissionDueDate: overrides.commissionDueDate ?? dueDate,
    salaryAmount: overrides.salaryAmount ?? 175_000,
    employeeShareAmount: overrides.employeeShareAmount ?? (monthNumber === 1 ? 131_250 : 175_000),
    commissionAmount: overrides.commissionAmount ?? (monthNumber === 1 ? 43_750 : 0),
    currency: 'FCFA',
    salaryStatus: 'SCHEDULED' as const,
    commissionStatus: (monthNumber === 1 ? 'SCHEDULED' : 'NOT_APPLICABLE') as 'SCHEDULED' | 'NOT_APPLICABLE',
    createdAt: SCHEDULED_AT,
  };
}

const ALL_STATUSES = PAYMENT_LIFECYCLE_STATUS_VALUES;

export function runPaymentLifecycleTests(): PaymentLifecycleTestResult[] {
  const results: PaymentLifecycleTestResult[] = [];
  const check = (name: string, test: () => void): void => {
    try {
      test();
      results.push({ name, success: true, details: 'OK' });
    } catch (error) {
      results.push({ name, success: false, details: String((error as Error)?.message ?? error) });
    }
  };

  /* ---------------- Statuts ---------------- */

  check('P0-PAY-1 Statuts: les six états du cycle sont exactement SCHEDULED, DUE, PENDING_VERIFICATION, VERIFIED, PAID, REJECTED', () => {
    assert(
      JSON.stringify(ALL_STATUSES) === JSON.stringify(['SCHEDULED', 'DUE', 'PENDING_VERIFICATION', 'VERIFIED', 'PAID', 'REJECTED']),
      `domaine inattendu: ${ALL_STATUSES.join(', ')}`,
    );
    for (const status of ALL_STATUSES) {
      assert(PAYMENT_STATUS_MEANINGS[status].length > 20, `sens non documenté pour ${status}`);
    }
    assert(PAYMENT_DOMAIN_EXACTNESS.every(Boolean), 'correspondance domaine/SQL affirmée par les constantes');
    assert(JSON.stringify(PAYMENT_TERMINAL_STATUSES) === JSON.stringify(['PAID']), 'seul PAID est terminal');
  });

  check('P0-PAY-1 Statuts: VERIFIED reste une projection, jamais un statut ajouté aux vues du contrat', () => {
    // Le typage `SalaryPaymentStatus | CommissionPaymentStatus` interdit déjà
    // `VERIFIED` : la projection contractuelle ne peut pas élargir le domaine.
    const allowed: readonly string[] = ['SCHEDULED', 'DUE', 'PENDING_VERIFICATION', 'PAID', 'REJECTED'];
    for (const [status, projected] of Object.entries(CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS)) {
      assert(allowed.includes(projected), `statut projeté hors domaine du contrat pour ${status}: ${projected}`);
    }
    assert(CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS.VERIFIED === 'PENDING_VERIFICATION', 'VERIFIED projeté en attente, pas en payé');
    assert(CONTRACT_LEDGER_STATUS_FOR_PAYMENT_STATUS.PAID === 'PAID', 'PAID projeté à l’identique');
  });

  /* ---------------- Matrice de transitions ---------------- */

  check('P0-PAY-1 Matrice: chaque action n’est admise que depuis ses statuts source', () => {
    const allowed: Array<[PaymentAction, PaymentLifecycleStatus]> = [
      ['MARK_DUE', 'SCHEDULED'],
      ['DECLARE_PAYMENT', 'DUE'],
      ['DECLARE_PAYMENT', 'REJECTED'],
      ['VERIFY_DECLARATION', 'PENDING_VERIFICATION'],
      ['CONFIRM_PAID', 'VERIFIED'],
      ['REJECT_DECLARATION', 'PENDING_VERIFICATION'],
    ];
    for (const [action, from] of allowed) {
      const rule = PAYMENT_TRANSITION_RULES[action];
      const outcome = evaluatePaymentTransition(rule, from);
      assert(outcome.kind === 'APPLY', `${action} depuis ${from} doit être admise, reçu ${outcome.kind}`);
      assert(rule.from.includes(from), `${action} doit déclarer ${from} comme statut source`);
      assert(rule.actor === (action === 'MARK_DUE' ? 'SYSTEM' : action === 'DECLARE_PAYMENT' ? 'EMPLOYER' : 'ADMIN'),
        `${action} : acteur autorisé conforme au rôle réellement requis`);
      assert(rule.auditAction.length > 0 && rule.historyEvent.length > 0 && rule.events.length > 0,
        `${action} : audit, historique et événements définis`);
      assert(rule.dedupeKey.includes('payment') || rule.dedupeKey.includes(' Payment') || rule.dedupeKey.length > 0,
        `${action} : clé de déduplication documentée`);
    }
    // Un paiement déjà VERIFIED n'est plus déclarable ; un paiement terminal non plus.
    assert(PAYMENT_TRANSITION_RULES.DECLARE_PAYMENT.from.includes('DUE') && PAYMENT_TRANSITION_RULES.DECLARE_PAYMENT.from.includes('REJECTED'),
      'déclaration admise depuis DUE et REJECTED uniquement');
    assert(PAYMENT_TRANSITION_RULES.REJECT_DECLARATION.requiresReason === true, 'le rejet exige un motif');
  });

  check('P0-PAY-1 Matrice: PAID → autre statut, DUE → PAID, SCHEDULED → PAID et REJECTED → PAID sont refusés', () => {
    const forbidden: Array<[PaymentAction, PaymentLifecycleStatus]> = [
      ['DECLARE_PAYMENT', 'PAID'],
      ['VERIFY_DECLARATION', 'PAID'],
      ['CONFIRM_PAID', 'PAID'],
      ['REJECT_DECLARATION', 'PAID'],
      ['MARK_DUE', 'PAID'],
      ['CONFIRM_PAID', 'DUE'],
      ['CONFIRM_PAID', 'SCHEDULED'],
      ['CONFIRM_PAID', 'PENDING_VERIFICATION'],
      ['CONFIRM_PAID', 'REJECTED'],
      ['VERIFY_DECLARATION', 'SCHEDULED'],
      ['VERIFY_DECLARATION', 'DUE'],
      ['DECLARE_PAYMENT', 'SCHEDULED'],
      ['DECLARE_PAYMENT', 'VERIFIED'],
      ['DECLARE_PAYMENT', 'PENDING_VERIFICATION'],
      ['MARK_DUE', 'DUE'],
    ];
    for (const [action, from] of forbidden) {
      const outcome = evaluatePaymentTransition(PAYMENT_TRANSITION_RULES[action], from);
      assert(outcome.kind !== 'APPLY', `${action} depuis ${from} ne doit jamais être appliquée`);
    }
    assert(PAYMENT_SETTLED_STATUSES.join(',') === 'VERIFIED,PAID', 'statuts sans objet du cycle connus');

    // Les interdits nommés par le plan sont explicitement listés.
    const listed = PAYMENT_REFUSED_TRANSITIONS.map(entry => `${entry.from}->${entry.to}`);
    for (const expected of ['SCHEDULED->PAID', 'DUE->PAID', 'PENDING_VERIFICATION->PAID', 'REJECTED->PAID', 'REJECTED->VERIFIED', 'PENDING_VERIFICATION->DUE']) {
      assert(listed.includes(expected), `transition interdite non documentée: ${expected}`);
    }
    for (const refusal of PAYMENT_REFUSED_TRANSITIONS) {
      assert(refusal.reason.length > 10, `motif d'interdiction manquant pour ${refusal.from}->${refusal.to}`);
    }
  });

  check('P0-PAY-1 Matrice: un rejeu est ALREADY (idempotent), jamais une erreur ni un second effet', () => {
    const replay = evaluatePaymentTransition(PAYMENT_TRANSITION_RULES.DECLARE_PAYMENT, 'PENDING_VERIFICATION');
    assert(replay.kind === 'ALREADY', `ALREADY attendu, reçu ${replay.kind}`);
    // `PAID` est la cible de `CONFIRM_PAID` : un rejeu reste idempotent (ALREADY),
    // tandis que toute AUTRE action sur un paiement payé est TERMINALE.
    const replayConfirm = evaluatePaymentTransition(PAYMENT_TRANSITION_RULES.CONFIRM_PAID, 'PAID');
    assert(replayConfirm.kind === 'ALREADY', `rejeu de confirmation idempotent attendu, reçu ${replayConfirm.kind}`);
    const terminal = evaluatePaymentTransition(PAYMENT_TRANSITION_RULES.DECLARE_PAYMENT, 'PAID');
    assert(terminal.kind === 'TERMINAL' && terminal.current === 'PAID', 'un paiement payé reste terminal pour les autres actions');
    assert(terminal.kind === 'TERMINAL' && /terminal/.test(terminal.reason), 'le refus terminal est motivé par le domaine');
    const verifyTerminal = evaluatePaymentTransition(PAYMENT_TRANSITION_RULES.VERIFY_DECLARATION, 'PAID');
    assert(verifyTerminal.kind === 'TERMINAL', 'aucune vérification après PAID');
    assert(JSON.stringify([...PAYMENT_ACTION_VALUES].sort()) === JSON.stringify(['CONFIRM_PAID', 'DECLARE_PAYMENT', 'MARK_DUE', 'REJECT_DECLARATION', 'VERIFY_DECLARATION'].sort()),
      'catalogue d’actions du cycle exact');
  });

  /* ---------------- Matérialisation ---------------- */

  check('P0-PAY-1 Paiements: un par période, commission ignorée à 0 %, identifiants et clés déterministes', () => {
    const drafts = buildPaymentDrafts({
      contractId: CONTRACT_ID,
      employerId: EMPLOYER_ID,
      candidateId: CANDIDATE_ID,
      paymentSchedule: [scheduleEntry(1), scheduleEntry(2), scheduleEntry(3)] as never,
      scheduledAt: SCHEDULED_AT,
    });
    assert(drafts.length === 4, `4 paiements attendus (3 salaires + 1 commission M1), reçus ${drafts.length}`);
    assert(drafts.every(draft => draft.status === 'SCHEDULED'), 'tout paiement naît SCHEDULED');
    assert(drafts.every(draft => draft.currency === 'FCFA' && draft.periodKey.length > 0), 'devise et période héritées de l’échéance');
    assert(!drafts.some(draft => draft.paymentType === 'PLATFORM_FEE' && draft.monthNumber !== 1),
      'aucune commission inventée pour M2/M3');
    const salaryM1 = drafts.find(draft => draft.paymentType === 'SALARY' && draft.monthNumber === 1)!;
    assert(salaryM1.amount === 131_250, 'le paiement salarial porte la part du salarié du modèle');
    const feeM1 = drafts.find(draft => draft.paymentType === 'PLATFORM_FEE' && draft.monthNumber === 1)!;
    assert(feeM1.amount === 43_750, 'la commission porte le montant dû à LE LABEUR');
    assert(feeM1.currency === 'FCFA', 'devise héritée de l’échéance, jamais réécrite');
    assert(salaryM1.dueAt === '2026-10-05T00:00:00.000Z', `échéance à minuit UTC, reçue ${salaryM1.dueAt}`);
    assert(salaryM1.id === paymentIdFor(CONTRACT_ID, 'SALARY', 1), 'identifiant déterministe');
    assert(salaryM1.idempotencyKey === paymentIdempotencyKeyFor(CONTRACT_ID, 'SALARY', 1), 'clé d’unicité déterministe');
    assert(salaryM1.scheduleEntryId === `PSE-${CONTRACT_ID}-M1`, 'lien vers l’entrée d’échéancier conservé');
    assert(COMMISSION_IGNORED_AT_OR_BELOW === 0, 'seuil de commission réelle');
    const repeated = buildPaymentDrafts({
      contractId: CONTRACT_ID,
      employerId: EMPLOYER_ID,
      candidateId: CANDIDATE_ID,
      paymentSchedule: [scheduleEntry(1)] as never,
      scheduledAt: '2027-01-01T00:00:00.000Z',
    });
    assert(repeated[0].id === salaryM1.id, 'le rejeu produit le MÊME identifiant (aucun doublon possible)');
  });

  check('P0-PAY-1 Lien échéance: la nature est dérivée du type d’échéance existant, jamais inventée', () => {
    assert(deadlineIdForPayment('SALARY', 'PSE-x-M1') === 'dl_SALARY_PAYMENT_PSE-x-M1', 'identifiant d’échéance réel du modèle');
    assert(deadlineIdForPayment('PLATFORM_FEE', 'PSE-x-M1') === 'dl_COMMISSION_PAYMENT_PSE-x-M1', 'échéance de commission');
    assert(paymentTypeForDeadlineKind('SALARY_PAYMENT') === 'SALARY', 'SALARY_PAYMENT → Salaire');
    assert(paymentTypeForDeadlineKind('COMMISSION_PAYMENT') === 'PLATFORM_FEE', 'COMMISSION_PAYMENT → Commission');
    assert(paymentTypeForDeadlineKind('UNKNOWN') === null, 'aucune nature devinée pour un type inconnu');
  });

  /* ---------------- Période: aucune règle inventée ---------------- */

  check('P0-PAY-1 Période: seule la cadence mensuelle a une règle; hebdomadaire et forfait restent à décider', () => {
    const monthly = resolvePaymentPeriodicityRule('Mensuel');
    assert(monthly.paymentsDefined === true && monthly.source !== null && monthly.missingRule === null,
      'la règle mensuelle du modèle est réutilisée, avec sa source');
    for (const periodicity of ['Hebdomadaire', 'Forfait', 'Quotidien', '', 'Inconnu']) {
      const rule = resolvePaymentPeriodicityRule(periodicity);
      assert(rule.paymentsDefined === false, `aucune règle ne doit être affirmée pour « ${periodicity} »`);
      assert(typeof rule.missingRule === 'string' && rule.missingRule.length > 20, `règle manquante documentée pour « ${periodicity} »`);
    }
  });

  check('P0-PAY-1 Avancement mensuel: M1 → M2 avec les montants du modèle, commission M2+ à 0 %, pourcentage jamais réécrit', () => {
    const evaluation = evaluateMonthlyAdvance({
      contractId: CONTRACT_ID,
      status: 'ACTIVE',
      periodicity: 'Mensuel',
      currentMonth: 1,
      durationMonths: 3,
      monthlySalary: MONTHLY_SALARY,
      currency: 'FCFA',
      paymentSchedule: [scheduleEntry(1), scheduleEntry(2), scheduleEntry(3)] as never,
    });
    assert(evaluation.kind === 'ADVANCE', `avancement attendu, reçu ${evaluation.kind}`);
    if (evaluation.kind !== 'ADVANCE') return;
    const plan = evaluation.plan;
    assert(plan.toMonth === 2 && plan.fromMonth === 1, 'le mois suit la séquence réelle');
    assert(plan.checkpoint.salaryAmount === MONTHLY_SALARY, 'salaire du modèle');
    assert(plan.checkpoint.employeeShareAmount === MONTHLY_SALARY, 'M2+ : part salarié = 100 % (règle réelle)');
    assert(plan.checkpoint.leLabeurShareAmount === 0, 'M2+ : commission à 0 % (règle réelle)');
    assert(plan.checkpoint.isStarted === true && plan.checkpoint.employerStartAnswer === 'YES', 'point de contrôle conforme au modèle');
    assert(plan.ledgerEntry.percentage === 0 && plan.ledgerEntry.amountDue === 0, 'grand livre M2 à 0 %');
    assert(plan.commissionStatus === 'NOT_APPLICABLE', 'vue de commission M2 NON_APPLICABLE (modèle)');
    assert(!('commissionPercentage' in plan), 'aucune réécriture de contracts.commission_percentage');
    assert(MODEL_COMMISSION_PERCENTAGE === 25, 'le pourcentage du modèle reste 25');
  });

  check('P0-PAY-1 Avancement mensuel: refus explicites (durée atteinte, mois sans échéancier, périodicité sans règle)', () => {
    const maxed = evaluateMonthlyAdvance({
      contractId: CONTRACT_ID, status: 'ACTIVE', periodicity: 'Mensuel', currentMonth: 3, durationMonths: 3,
      monthlySalary: MONTHLY_SALARY, currency: 'FCFA', paymentSchedule: [scheduleEntry(1)] as never,
    });
    assert(maxed.kind === 'MAX_DURATION_REACHED', `durée maximale attendue, reçue ${maxed.kind}`);

    const missing = evaluateMonthlyAdvance({
      contractId: CONTRACT_ID, status: 'ACTIVE', periodicity: 'Mensuel', currentMonth: 1, durationMonths: 6,
      monthlySalary: MONTHLY_SALARY, currency: 'FCFA', paymentSchedule: [scheduleEntry(1)] as never,
    });
    assert(missing.kind === 'MONTH_ENTRY_MISSING' && missing.monthNumber === 2, 'aucun mois inventé sans entrée d’échéancier');

    const weekly = evaluateMonthlyAdvance({
      contractId: CONTRACT_ID, status: 'ACTIVE', periodicity: 'Hebdomadaire', currentMonth: 1, durationMonths: 6,
      monthlySalary: MONTHLY_SALARY, currency: 'FCFA', paymentSchedule: [scheduleEntry(2)] as never,
    });
    assert(weekly.kind === 'PERIODICITY_RULE_MISSING', 'la périodicité sans règle refuse l’avancement au lieu d’être devinée');
  });

  /* ---------------- Déclaration ---------------- */

  check('P0-PAY-1 Déclaration: la charge utile n’accepte que les champs du plan (identité refusée)', () => {
    const valid = normalizePaymentDeclarationPayload({
      paymentId: paymentIdFor(CONTRACT_ID, 'SALARY', 1),
      reference: '  MOMO-0001  ',
      amount: '131250.4',
      currency: 'fcfa',
      provider: 'MOBILE_MONEY',
      externalTransactionId: 'EXT-1',
      paidAt: '2026-10-05T09:00:00Z',
      proofFileName: 'recu.pdf',
      comment: 'ok',
    });
    assert(valid.kind === 'VALID', `charge utile valide attendue, reçue ${JSON.stringify(valid)}`);
    if (valid.kind !== 'VALID') return;
    assert(valid.payload.reference === 'MOMO-0001', 'référence normalisée');
    assert(valid.payload.amount === 131_250, 'montant arrondi comme le modèle');
    assert(valid.payload.currency === 'FCFA', 'devise canonicisée');
    assert(valid.payload.proof?.fileName === 'recu.pdf', 'métadonnée de preuve structurée');
    assert(valid.payload.paidAt === '2026-10-05T09:00:00.000Z', 'date ISO conservée');

    for (const field of ['paymentType', 'employerId', 'employeeId', 'candidateId', 'status', 'submittedBy', 'verifiedBy', 'idempotencyKey']) {
      const rejected = normalizePaymentDeclarationPayload({
        paymentId: 'pay_salary_x_m1', reference: 'R-1', [field]: 'INJECTION',
      });
      assert(rejected.kind === 'INVALID', `le champ serveur ${field} doit être refusé du client`);
      if (rejected.kind === 'INVALID') {
        assert(rejected.errors[field]?.length === 1, `refus motivé pour ${field}`);
      }
    }

    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', unknownField: 1 }).kind === 'INVALID', 'champ inconnu refusé');
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p' }).kind === 'INVALID', 'référence obligatoire');
    assert(normalizePaymentDeclarationPayload({ reference: 'R-1' }).kind === 'INVALID', 'paymentId ou contrat + période requis');
    assert(normalizePaymentDeclarationPayload({ contractId: CONTRACT_ID, periodKey: 'Mois 01', reference: 'R-1' }).kind === 'VALID',
      'le couple contrat + période est suffisant');
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R'.repeat(121) }).kind === 'INVALID', 'longueur de référence bornée');
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', provider: 'MAGIC' }).kind === 'INVALID',
      'aucun fournisseur hors du vocabulaire réel du modèle');
    for (const method of ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER']) {
      assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', provider: method }).kind === 'VALID',
        `méthode du modèle refusée à tort: ${method}`);
    }
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', currency: 'XOF' }).kind === 'VALID',
      'devise ISO acceptée telle quelle (aucune conversion)');
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', currency: 'FCFA' }).kind === 'VALID',
      'devise réelle du contrat acceptée');
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', currency: 'fcfa' }).kind === 'VALID',
      'devise canonicisée en majuscules');
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', currency: 'FRANC CFA' }).kind === 'INVALID',
      'aucun texte libre pour la devise');
    assert(normalizePaymentDeclarationPayload({ paymentId: 'p', reference: 'R', amount: -5 }).kind === 'INVALID', 'montant négatif refusé');
    assert(normalizePaymentDeclarationPayload(null).kind === 'INVALID', 'charge utile absente refusée');
  });

  check('P0-PAY-1 Déclaration: admise seulement depuis DUE ou REJECTED, au montant dû, à l’échéance atteinte', () => {
    const base = {
      paymentType: 'SALARY' as const,
      amountDue: 131_250,
      currency: 'FCFA',
      dueAt: '2026-10-05T00:00:00.000Z',
      reference: 'MOMO-0001',
      evaluatedAt: '2026-10-05T14:00:00.000Z',
    };
    assert(evaluatePaymentDeclaration({ ...base, status: 'DUE' }).kind === 'ACCEPTED', 'DUE déclarable');
    assert(evaluatePaymentDeclaration({ ...base, status: 'REJECTED' }).kind === 'ACCEPTED', 'REJECTED déclarable à nouveau (régularisation)');
    for (const status of ['SCHEDULED', 'PENDING_VERIFICATION', 'VERIFIED', 'PAID'] as PaymentLifecycleStatus[]) {
      assert(evaluatePaymentDeclaration({ ...base, status }).kind === 'REJECTED_BY_RULE', `${status} ne doit pas être déclarable`);
    }
    assert(evaluatePaymentDeclaration({ ...base, status: 'DUE', declaredAmount: 130_000 }).kind === 'REJECTED_BY_RULE',
      'aucun montant partiel : le modèle ne connaît qu’un montant exact dû');
    assert(evaluatePaymentDeclaration({ ...base, status: 'DUE', declaredCurrency: 'XOF' }).kind === 'REJECTED_BY_RULE', 'devise du contrat obligatoire');
    assert(evaluatePaymentDeclaration({ ...base, status: 'DUE', reference: '   ' }).kind === 'REJECTED_BY_RULE', 'référence obligatoire');
    const early = evaluatePaymentDeclaration({ ...base, status: 'DUE', dueAt: '2026-12-01T00:00:00.000Z' });
    assert(early.kind === 'REJECTED_BY_RULE' && /prématurée/.test(early.reason), 'déclaration prématurée refusée (règle isPaymentDue)');
  });

  check('P0-PAY-1 Échéance: la lecture de période suit exactement la règle réelle isPaymentDue', () => {
    for (const [dueAt, evaluatedAt] of [
      ['2026-10-05T00:00:00.000Z', '2026-10-05T14:00:00.000Z'],
      ['2026-10-05T00:00:00.000Z', '2026-10-04T23:00:00.000Z'],
      ['2026-10-04T00:00:00.000Z', '2026-10-05T00:00:00.000Z'],
      ['2026-10-06T00:00:00.000Z', '2026-10-05T00:00:00.000Z'],
    ] as const) {
      assert(
        isPaymentPeriodDue(dueAt.slice(0, 10), evaluatedAt) === isPaymentDue(dueAt.slice(0, 10), new Date(evaluatedAt)),
        `désaccord avec la règle du modèle sur ${dueAt} / ${evaluatedAt}`,
      );
    }
  });

  /* ---------------- Vérification locale ---------------- */

  check('P0-PAY-1 Vérification: locale et déterministe, favorable seulement si tout correspond', () => {
    const evidence = {
      reference: 'MOMO-0001',
      amount: 131_250,
      currency: 'FCFA',
      payer: EMPLOYER_ID,
      recipient: CANDIDATE_ID,
      timestamp: '2026-10-05T09:00:00.000Z',
    };
    const request = (overrides: Partial<PaymentVerificationRequest> = {}): PaymentVerificationRequest => ({
      paymentId: paymentIdFor(CONTRACT_ID, 'SALARY', 1),
      contractId: CONTRACT_ID,
      paymentType: 'SALARY',
      expectedAmount: 131_250,
      expectedCurrency: 'FCFA',
      status: 'PENDING_VERIFICATION',
      evidence,
      ...overrides,
    });
    const matched = verifyPaymentDeclarationLocally(request(), SCHEDULED_AT);
    assert(matched.verdict === 'MATCHED' && matched.reasons.length === 0, `MATCHED attendu, reçu ${JSON.stringify(matched.reasons)}`);
    assert(matched.source === 'local-deterministic', 'la vérification se déclare LOCALE');
    assert(matched.checkedAt === SCHEDULED_AT, 'horodatage de décision conservé');

    const wrongAmount = verifyPaymentDeclarationLocally(request({ evidence: { ...evidence, amount: 130_000 } }), SCHEDULED_AT);
    assert(wrongAmount.verdict === 'MISMATCHED' && /Montant déclaré/.test(wrongAmount.reasons.join(' ')), 'montant divergent détecté');
    const wrongCurrency = verifyPaymentDeclarationLocally(request({ evidence: { ...evidence, currency: 'XOF' } }), SCHEDULED_AT);
    assert(wrongCurrency.verdict === 'MISMATCHED', 'devise divergente détectée');
    const emptyReference = verifyPaymentDeclarationLocally(request({ evidence: { ...evidence, reference: ' ' } }), SCHEDULED_AT);
    assert(emptyReference.verdict === 'MISMATCHED' && /Référence/.test(emptyReference.reasons.join(' ')), 'référence absente détectée');
    const providerOnly = verifyPaymentDeclarationLocally(request({ evidence: { ...evidence, provider: 'MTN_MOMO' } }), SCHEDULED_AT);
    assert(providerOnly.verdict === 'MISMATCHED' && /adaptateur de fournisseur/.test(providerOnly.reasons.join(' ')),
      'un fournisseur déclaré sans identifiant externe ne peut PAS être confirmé');
    const commissionToEmployee = verifyPaymentDeclarationLocally(request({
      paymentType: 'PLATFORM_FEE',
      evidence: { ...evidence, recipient: CANDIDATE_ID },
    }), SCHEDULED_AT);
    assert(commissionToEmployee.verdict === 'MISMATCHED' && /LE LABEUR/.test(commissionToEmployee.reasons.join(' ')),
      'la commission n’est jamais due au salarié');
    const repeatedReference = verifyPaymentDeclarationLocally(request({ previousReferences: ['MOMO-0001'] }), SCHEDULED_AT);
    assert(repeatedReference.verdict === 'MISMATCHED' && /régularisation/.test(repeatedReference.reasons.join(' ')),
      'la régularisation exige une NOUVELLE déclaration (preuve précédente conservée)');
    const notPending = verifyPaymentDeclarationLocally(request({ status: 'DUE' }), SCHEDULED_AT);
    assert(notPending.verdict === 'MISMATCHED', 'rien n’est vérifiable hors attente');
    const emptyPayer = verifyPaymentDeclarationLocally(request({ evidence: { ...evidence, payer: '', recipient: '' } }), SCHEDULED_AT);
    assert(/Payeur ou destinataire/.test(emptyPayer.reasons.join(' ')), 'les parties doivent être résolues depuis le contrat');
  });

  /* ---------------- Identifiants, clés, événements ---------------- */

  check('P0-PAY-1 Traçabilité: identifiants, clés et événements sont déterministes (un rejeu ne duplique rien)', () => {
    const paymentId = paymentIdFor(CONTRACT_ID, 'PLATFORM_FEE', 2);
    assert(paymentId === 'pay_platform_fee_ctr_p0pay_domain_M2', `identifiant instable: ${paymentId}`);
    assert(paymentDeclarationId(paymentId, 3) === `pdl_${paymentId}_A3`, 'identifiant de tentative daté du numéro');
    assert(paymentEventId(paymentId, 'PAYMENT_DUE') === `evt_PAYMENT_DUE_${paymentId}`, 'événement sans occurrence');
    assert(paymentEventId(paymentId, 'PAYMENT_DECLARED', 2) === `evt_PAYMENT_DECLARED_${paymentId}_A2`,
      'chaque tentative porte son propre événement');
    assert(paymentIdempotencyKeyFor(CONTRACT_ID, 'SALARY', 1) === `${CONTRACT_ID}:SALARY:M1`, 'unicité par période et nature');
    assert(paymentDueIdempotencyKey(paymentId) === `${paymentId}:PAYMENT_DUE`, 'clé de bascule portée par le paiement');
    const key = paymentDeclarationIdempotencyKey({ actorId: EMPLOYER_ID, command: 'payments.DECLARE', idempotencyKey: 'k-1' });
    assert(key === `${EMPLOYER_ID}:payments.DECLARE:k-1`, 'clé durable acteur + commande + clé client');
    assert(PAYMENT_AUTOMATION_SOURCE === 'automation:P0-PAY-1', 'source du cycle séparée de celle de P0-AUTO-2');
  });

  check('P0-PAY-1 Événements: catalogue complet, noms réels du code, aucun consumer ni canal branché', () => {
    const catalogued: readonly string[] = PAYMENT_EVENT_CATALOG.map(entry => entry.code);
    for (const required of ['PAYMENT_DUE', 'PAYMENT_DECLARED', 'PAYMENT_PENDING_VERIFICATION', 'PAYMENT_APPROVED', 'PAYMENT_PAID', 'PAYMENT_REJECTED', 'PAYMENT_OVERDUE_J3']) {
      assert(catalogued.includes(required), `événement ${required} absent du catalogue`);
    }
    for (const entry of PAYMENT_EVENT_CATALOG) {
      assert(entry.dedupeKey.length > 5, `clé de déduplication non documentée pour ${entry.code}`);
      assert(entry.plan.startsWith('PAYMENT_'), `le nom du plan doit être cité pour ${entry.code}`);
    }
    for (const type of PAYMENT_PRODUCED_EVENT_TYPES) {
      assert(type.startsWith('PAYMENT_'), `type produit hors cycle: ${type}`);
      assert(PAYMENT_DEFERRED_NOTIFICATION_EVENT_TYPES.length >= 0 && catalogued.includes(type), `type produit sans contrat: ${type}`);
    }
    for (const documented of DOCUMENTED_PAYMENT_EVENTS) {
      assert(documented.aggregateType === 'payment', `agrégat du contrat d'événement: ${documented.eventType}`);
      assert(documented.payload.length >= 3, `charge utile sous-documentée pour ${documented.eventType}`);
      assert(documented.sideEffects.every(effect => !/\bsms\b|e-?mail|whatsapp|push|virement|transfert d|mobile money|fonds exécut/i.test(effect)),
        `aucun canal ni mouvement réel ne doit être affirmé pour ${documented.eventType}`);
      assert(documented.dedupeKey.length > 5, `clé de déduplication absente pour ${documented.eventType}`);
    }
    assert(documentedEventTypes().every(type => !/SMS|EMAIL|WHATSAPP|PUSH/.test(type)),
      'aucun type d’événement de canal n’est inventé par le cycle');
    assert(PAYMENT_DEFERRED_NOTIFICATION_EVENT_TYPES.length >= 2, 'les événements reportés au module Notifications sont déclarés');
  });

  check('P0-PAY-1 Audit: les champs exigés sont conservés à chaque écriture', () => {
    for (const field of ['actor', 'paymentId', 'contractId', 'eventId', 'jobId', 'timestamp', 'source', 'beforeState', 'afterState', 'error']) {
      assert(PAYMENT_AUDIT_FIELDS.includes(field as never), `champ d’audit manquant: ${field}`);
    }
  });

  /* ---------------- Rappel pré-échéance ---------------- */

  check('P0-PAY-1 Rappel pré-échéance: aucune valeur par défaut, configuration explicite seulement', () => {
    for (const absent of [undefined, null, '', '   ']) {
      const resolution = resolvePreDueLeadTimeMs(absent);
      assert(resolution.leadTimeMs === null && resolution.configured === false, `aucune avance ne doit être déduite de ${String(absent)}`);
      assert(/par défaut/.test(resolution.detail), 'le motif explique l’absence de règle');
    }
    for (const invalid of ['0', '-3600000', 'abc', '1.5', String(31 * 24 * 3600 * 1000)]) {
      const resolution = resolvePreDueLeadTimeMs(invalid);
      assert(resolution.leadTimeMs === null && resolution.configured === false, `valeur refusée attendue pour ${invalid}`);
      assert(/refusée/.test(resolution.detail), 'le refus est motivé');
    }
    const configured = resolvePreDueLeadTimeMs('86400000');
    assert(configured.leadTimeMs === 86_400_000 && configured.configured === true, 'une valeur décidée par l’exploitant est acceptée');

    const drafts: PaymentDraft[] = [buildPaymentDrafts({
      contractId: CONTRACT_ID,
      employerId: EMPLOYER_ID,
      candidateId: CANDIDATE_ID,
      paymentSchedule: [scheduleEntry(1)] as never,
      scheduledAt: SCHEDULED_AT,
    })[0]];
    assert(buildPreDueReminderJobs({
      contractId: CONTRACT_ID,
      leadTimeMs: null,
      drafts,
      notificationTypeFor: () => 'MONTHLY_CHECKPOINT',
    }).length === 0, 'aucun job pré-échéance sans configuration');

    const armed = buildPreDueReminderJobs({
      contractId: CONTRACT_ID,
      leadTimeMs: 86_400_000,
      drafts,
      notificationTypeFor: () => 'MONTHLY_CHECKPOINT',
    });
    assert(armed.length === 1, 'un job armé par paiement quand la valeur est décidée');
    assert(armed[0].dueAt === '2026-10-04T00:00:00.000Z', `déclenchement = échéance - avance, reçu ${armed[0].dueAt}`);
    assert(armed[0].jobType === PAYMENT_PRE_DUE_JOB_TYPE, 'type de job du cycle');
    assert(armed[0].aggregateType === 'contract' && armed[0].aggregateId === CONTRACT_ID, 'le job porte le contrat, pas un nouvel agrégat');
    assert(armed[0].idempotencyKey.includes(PAYMENT_PRE_DUE_JOB_TYPE), 'clé d’idempotence du job liée au paiement');
    assert(armed[0].paymentId === drafts[0].id, 'le job cible le paiement précis');
  });

  check('P0-PAY-1 Rappel pré-échéance: éligibilité par statut (rien n’est notifié deux fois)', () => {
    assert(evaluatePreDueReminder('SCHEDULED').kind === 'NOT_YET_DUE', 'SCHEDULED est le seul état éligible');
    assert(evaluatePreDueReminder('DUE').kind === 'ALREADY_DUE', 'DUE relève du rappel à échéance');
    // DUE et REJECTED relèvent du rappel à échéance (J+3) de P0-AUTO-2, déjà armé.
    assert(evaluatePreDueReminder('DUE').kind === 'ALREADY_DUE', 'DUE relève du rappel à échéance');
    for (const status of ['PENDING_VERIFICATION', 'VERIFIED', 'PAID'] as PaymentLifecycleStatus[]) {
      assert(evaluatePreDueReminder(status).kind === 'SETTLED', `${status} ne doit plus être rappelé d’avance`);
    }
    assert(evaluatePreDueReminder('REJECTED').kind === 'ALREADY_DUE', 'un rejet est déjà échu : J+3, pas un rappel d’avance');
  });

  /* ---------------- Frontière paiement réel ---------------- */

  check('P0-PAY-1 Frontière: aucun paiement réel, aucun fournisseur, aucune donnée sensible dans le cycle', () => {
    assert(PAYMENT_PROVIDER_ADAPTERS.length >= 4 && PAYMENT_PROVIDER_ADAPTERS.every(adapter => adapter.implemented === false),
      'tous les adaptateurs de fournisseur sont déclarés NON IMPLÉMENTÉS');
    for (const provider of ['MTN', 'Orange', 'Moov', 'Wave']) {
      assert(PAYMENT_PROVIDER_ADAPTERS.some(adapter => adapter.providerId === provider), `${provider} doit être nommé explicitement`);
    }
    const joinedOut = REAL_PAYMENT_OUT_OF_SCOPE.join(' ');
    for (const keyword of ['Mobile Money', 'webhook', 'KYC', 'cron', 'commission_percentage']) {
      assert(joinedOut.toLowerCase().includes(keyword.toLowerCase()), `hors périmètre non affirmé: ${keyword}`);
    }
    const joinedMissing = MISSING_PAYMENT_CYCLE_RULES.join(' ');
    assert(/règle/.test(joinedMissing) && MISSING_PAYMENT_CYCLE_RULES.length >= 3, 'les règles à décider sont listées');
    for (const action of ['START', 'CONFIRM_EMPLOYER', 'PAID', 'DECLARE_SALARY']) {
      assert(MONTHLY_ACTIONS_OUT_OF_SCOPE.includes(action as never), `action du point de contrôle mensuel à ne pas ouvrir: ${action}`);
    }
    const codes = PAYMENT_TYPE_MAPPING.map(entry => entry.code).sort();
    assert(JSON.stringify(codes) === JSON.stringify(['PLATFORM_FEE', 'SALARY']), 'seules les deux natures du plan sont admises');
    for (const entry of PAYMENT_TYPE_MAPPING) {
      assert(/25 %|salaire|commission/i.test(entry.detail), `détail de correspondance insuffisant pour ${entry.code}`);
      assert(entry.plan.includes(entry.code) || entry.plan.toLowerCase().includes('salaire') || entry.plan.toLowerCase().includes('commission'),
        `le libellé du plan est rattaché au nom de code pour ${entry.code}`);
    }
  });

  /* ---------------- P0-PAY-2 : Réconciliation pure & Audit ---------------- */

  check('P0-PAY-2 Réconciliation pure: MATCH quand tous les critères concordent', () => {
    const tx: NormalizedPaymentTransaction = {
      provider: 'TEST_GATEWAY',
      externalTransactionId: 'TX-REC-001',
      reference: 'MOMO-REC-001',
      amount: 175_000,
      currency: 'FCFA',
      payer: EMPLOYER_ID,
      recipient: CANDIDATE_ID,
      occurredAt: '2026-10-06T10:00:00.000Z',
      status: 'SUCCESS',
    };
    const result = evaluateReconciliation({
      expected: {
        paymentId: 'pay_salary_001',
        provider: 'TEST_GATEWAY',
        externalTransactionId: 'TX-REC-001',
        reference: 'MOMO-REC-001',
        amount: 175_000,
        currency: 'FCFA',
        payer: EMPLOYER_ID,
        recipient: CANDIDATE_ID,
      },
      actual: tx,
      reconciledAt: '2026-10-06T12:00:00.000Z',
    });

    assert(result.verdict === 'MATCH', `MATCH attendu, reçu ${result.verdict}`);
    assert(result.comparisons.every(c => c.matched), 'toutes les comparaisons doivent être positives');
    assert(result.reasons.length === 0, 'aucun motif de rejet');
  });

  check('P0-PAY-2 Réconciliation pure: NOT_FOUND, DUPLICATE et REVIEW_REQUIRED', () => {
    const notFound = evaluateReconciliation({
      expected: { paymentId: 'pay_001', amount: 100_000, currency: 'FCFA', payer: EMPLOYER_ID, recipient: CANDIDATE_ID },
      actual: null,
      reconciledAt: '2026-10-06T12:00:00.000Z',
    });
    assert(notFound.verdict === 'NOT_FOUND', `NOT_FOUND attendu, reçu ${notFound.verdict}`);

    const duplicate = evaluateReconciliation({
      expected: { paymentId: 'pay_001', amount: 100_000, currency: 'FCFA', payer: EMPLOYER_ID, recipient: CANDIDATE_ID, isDuplicate: true },
      actual: null,
      reconciledAt: '2026-10-06T12:00:00.000Z',
    });
    assert(duplicate.verdict === 'DUPLICATE', `DUPLICATE attendu, reçu ${duplicate.verdict}`);

    const unknownStatus: NormalizedPaymentTransaction = {
      provider: 'TEST_GATEWAY', externalTransactionId: 'TX-002', reference: 'REF-002',
      amount: 100_000, currency: 'FCFA', payer: EMPLOYER_ID, recipient: CANDIDATE_ID,
      occurredAt: '2026-10-06T10:00:00.000Z', status: 'UNKNOWN',
    };
    const review = evaluateReconciliation({
      expected: { paymentId: 'pay_001', amount: 100_000, currency: 'FCFA', payer: EMPLOYER_ID, recipient: CANDIDATE_ID },
      actual: unknownStatus,
      reconciledAt: '2026-10-06T12:00:00.000Z',
    });
    assert(review.verdict === 'REVIEW_REQUIRED', `REVIEW_REQUIRED attendu, reçu ${review.verdict}`);
  });

  check('P0-PAY-2 Réconciliation pure: MISMATCH sur montant, devise, destinataire ou échec externe', () => {
    const baseTx: NormalizedPaymentTransaction = {
      provider: 'TEST_GATEWAY', externalTransactionId: 'TX-003', reference: 'REF-003',
      amount: 175_000, currency: 'FCFA', payer: EMPLOYER_ID, recipient: CANDIDATE_ID,
      occurredAt: '2026-10-06T10:00:00.000Z', status: 'SUCCESS',
    };
    const expected = {
      paymentId: 'pay_001', provider: 'TEST_GATEWAY', externalTransactionId: 'TX-003',
      reference: 'REF-003', amount: 175_000, currency: 'FCFA',
      payer: EMPLOYER_ID, recipient: CANDIDATE_ID,
    };

    // Montant discordant
    const amountMismatch = evaluateReconciliation({ expected: { ...expected, amount: 200_000 }, actual: baseTx, reconciledAt: '2026-10-06T12:00:00.000Z' });
    assert(amountMismatch.verdict === 'MISMATCH', 'MISMATCH attendu sur montant');

    // Devise discordante
    const currencyMismatch = evaluateReconciliation({ expected: { ...expected, currency: 'EUR' }, actual: baseTx, reconciledAt: '2026-10-06T12:00:00.000Z' });
    assert(currencyMismatch.verdict === 'MISMATCH', 'MISMATCH attendu sur devise');

    // Destinataire discordant
    const recipientMismatch = evaluateReconciliation({ expected: { ...expected, recipient: 'other_user' }, actual: baseTx, reconciledAt: '2026-10-06T12:00:00.000Z' });
    assert(recipientMismatch.verdict === 'MISMATCH', 'MISMATCH attendu sur destinataire');

    // Statut externe FAILED
    const failedTx = evaluateReconciliation({ expected, actual: { ...baseTx, status: 'FAILED' }, reconciledAt: '2026-10-06T12:00:00.000Z' });
    assert(failedTx.verdict === 'MISMATCH', 'MISMATCH attendu sur statut externe FAILED');
  });

  check('P0-PAY-2 Audit: actions d’audit du webhook et de la réconciliation cataloguées', () => {
    const required = [
      'PAYMENT_WEBHOOK_RECEIVED',
      'PAYMENT_WEBHOOK_SIGNATURE_VALIDATED',
      'PAYMENT_WEBHOOK_SIGNATURE_REJECTED',
      'PAYMENT_RECONCILED',
      'PAYMENT_RECONCILIATION_MISMATCH',
      'PAYMENT_DUPLICATE_DETECTED',
      'PAYMENT_REPLAY_DETECTED',
    ];
    const actions = Object.values(PAYMENT_AUDIT_ACTIONS);
    for (const req of required) {
      assert(actions.includes(req as never), `action d’audit P0-PAY-2 absente: ${req}`);
    }
  });

  function documentedEventTypes(): string[] {
    return DOCUMENTED_PAYMENT_EVENTS.map(entry => entry.eventType);
  }

  return results;
}
