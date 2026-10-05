/**
 * LE LABEUR — PHASE 4 — tests déterministes
 * « PAIEMENTS EMPLOYEUR + CONTRÔLE ADMINISTRATIF »
 *
 * Les scénarios s'exécutent sur le vrai MockRepository (instance isolée) et sur
 * les garde-fous serveur réels. Aucun test n'est « simulé » : chaque assertion
 * porte sur le résultat renvoyé par le repository.
 */

import { MockService } from '../repositories/mockRepository';
import type { CreatePaymentDeclarationInput } from '../repositories/interfaces';
import {
  canTransitionPaymentDeclaration,
  daysLateForPayment,
  evaluatePaymentBlockingRule,
  isPaymentAwaitingAdminAction,
  PAYMENT_DECLARATION_TRANSITIONS,
  validatePaymentDeclarationInput,
} from './paymentDeclarations';
import {
  requireAdminPaymentMutation,
  requireEmployerOwnership,
  requirePaymentRejectionReason,
  requirePaymentTransition,
  toPaymentAccessTarget,
} from '../backend/api/paymentDeclarationGuard';
import type { AuthenticatedActor } from '../backend/productionContracts';
import type { PaymentDeclaration } from '../types';

export interface PaymentDeclarationTestResult {
  name: string;
  success: boolean;
  detail: string;
}

type Service = MockService;

const ADMIN_ID = 'user-admin-1';
const EMPLOYER_A = 'user-emp-1';
const EMPLOYER_B = 'user-emp-2';
const EMPLOYER_LATE = 'user-emp-4';

const adminActor: AuthenticatedActor = {
  id: ADMIN_ID,
  role: 'ADMIN',
  permissions: ['payments:read:any', 'payments:review', 'payments:approve', 'payments:reject', 'users:block', 'users:unblock'],
  sessionId: 'session-admin-phase4',
};

const employerActor: AuthenticatedActor = {
  id: EMPLOYER_A,
  role: 'EMPLOYER',
  permissions: [],
  sessionId: 'session-employer-phase4',
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function expectReject(action: () => Promise<unknown> | unknown, matcher?: string): Promise<string> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (matcher && !message.toLowerCase().includes(matcher.toLowerCase())) {
      throw new Error(`Message inattendu. Attendu contenant « ${matcher} », reçu « ${message} ».`);
    }
    return message;
  }
  throw new Error('L’action devait être refusée.');
}

function baseInput(patch: Partial<CreatePaymentDeclarationInput> = {}): CreatePaymentDeclarationInput {
  return {
    contractId: 'CTR-001',
    monthNumber: 3,
    kind: 'SALARY',
    amount: 30000,
    paymentMethod: 'MTN_MOMO',
    transactionId: 'TXN-QA-20261005-0001',
    paidAt: '2026-10-05T09:30:00.000Z',
    proof: { fileName: 'recu_qa.png', uri: 'blob:qa-proof' },
    comment: 'Déclaration de test déterministe.',
    ...patch,
  };
}

/** Crée un contrat de test (offre → candidature → contrat) pour l'employeur A. */
async function createQaContract(service: Service, candidateId: string, monthlySalary: number) {
  const offer = await service.createOffer({
    title: 'Contrat QA Phase 4',
    employerId: EMPLOYER_A,
    employerName: 'Atelier Bois & Agencement Bénin',
    employerLocation: 'Cotonou',
    contractType: 'Mission',
    remuneration: monthlySalary,
    currency: 'FCFA',
    location: 'Cotonou',
    skills: ['QA'],
    summary: 'Contrat de test déterministe.',
    responsibilities: ['QA'],
    conditions: ['QA'],
    selectionProcess: ['Direct'],
    durationMonths: 3,
  }, EMPLOYER_A);
  const application = await service.applyToOffer(offer.id, candidateId);
  await service.examineApplication(application.id, EMPLOYER_A);
  await service.shortlistApplication(application.id, EMPLOYER_A);
  return service.generateContract({
    offerId: offer.id,
    applicationId: application.id,
    employerId: EMPLOYER_A,
    employerName: 'Atelier Bois & Agencement Bénin',
    employeeId: candidateId,
    employeeName: 'Salarié QA',
    jobTitle: offer.title,
    missionDescription: 'Mission de test déterministe.',
    location: 'Cotonou',
    startDate: '15/09/2026',
    durationMonths: 3,
    monthlySalary,
    periodicity: 'Mensuel',
    conditions: [],
  }, EMPLOYER_A);
}

/** Cycle complet : création → soumission → prise en charge par l'admin. */
async function createSubmittedDeclaration(service: Service, patch: Partial<CreatePaymentDeclarationInput> = {}) {
  const created = await service.createPaymentDeclaration(baseInput(patch), EMPLOYER_A);
  await service.submitPaymentDeclaration(created.id, EMPLOYER_A);
  await service.startPaymentDeclarationReview(created.id, ADMIN_ID);
  return service.getPaymentDeclaration(created.id, ADMIN_ID) as Promise<PaymentDeclaration>;
}

export async function runPaymentDeclarationTests(): Promise<PaymentDeclarationTestResult[]> {
  const results: PaymentDeclarationTestResult[] = [];

  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  /* ---------------------------------------------------------------- */
  /* 1. Création d'une déclaration                                     */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · création d’une déclaration de paiement', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(baseInput(), EMPLOYER_A);
    assert(created.id.startsWith('PAYD-'), `Identifiant inattendu : ${created.id}`);
    assert(created.status === 'DRAFT', `Statut initial attendu DRAFT, reçu ${created.status}`);
    assert(created.employerId === EMPLOYER_A, 'L’employeur déclarant est incorrect.');
    assert(created.contractId === 'CTR-001', 'Le contrat rattaché est incorrect.');
    assert(created.amountDue === 30000, `Montant attendu 30 000 (salaire M3), reçu ${created.amountDue}`);
    assert(created.amount === 30000, 'Le montant déclaré doit être conservé.');
    assert(created.paymentMethod === 'MTN_MOMO', 'Le moyen de paiement doit être conservé.');
    assert(created.transactionId === 'TXN-QA-20261005-0001', 'L’ID de transaction doit être conservé.');
    assert(created.proof.fileName === 'recu_qa.png', 'Le justificatif doit être conservé.');
    assert(created.history.length === 1 && created.history[0].type === 'CREATED', 'L’historique doit contenir la création.');
    assert(created.reference.length > 0, 'Une référence doit être générée.');
  });

  await check('PHASE4 · validations métier à la création', async () => {
    const service = new MockService();
    await expectReject(() => service.createPaymentDeclaration(baseInput({ amount: 0 }), EMPLOYER_A), 'montant');
    await expectReject(() => service.createPaymentDeclaration(baseInput({ transactionId: 'X' }), EMPLOYER_A), 'transaction');
    await expectReject(() => service.createPaymentDeclaration(baseInput({ proof: { fileName: '', uri: '' } }), EMPLOYER_A), 'justificatif');
    await expectReject(() => service.createPaymentDeclaration(baseInput({ paidAt: 'hier' }), EMPLOYER_A), 'date');
    const validation = validatePaymentDeclarationInput({ amount: -5 });
    assert(!validation.ok && Boolean(validation.errors.amount), 'Un montant négatif doit être rejeté.');
  });

  await check('PHASE4 · aucune commission due en M2+ (25% M1 / 0% M2+)', async () => {
    const service = new MockService();
    await expectReject(
      () => service.createPaymentDeclaration(baseInput({ monthNumber: 2, kind: 'COMMISSION', amount: 5000 }), EMPLOYER_A),
      'aucune commission',
    );
  });

  /* ---------------------------------------------------------------- */
  /* 2. Soumission                                                     */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · soumission d’une déclaration', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(baseInput(), EMPLOYER_A);
    const submitted = await service.submitPaymentDeclaration(created.id, EMPLOYER_A);
    assert(submitted.status === 'SUBMITTED', `Statut attendu SUBMITTED, reçu ${submitted.status}`);
    assert(Boolean(submitted.submittedAt), 'La date de soumission doit être renseignée.');
    assert(submitted.history.some(e => e.type === 'SUBMITTED'), 'L’événement SUBMITTED doit être tracé.');
    assert(isPaymentAwaitingAdminAction(submitted.status), 'Une déclaration soumise attend une action admin.');
  });

  await check('PHASE4 · l’administration est notifiée à la soumission', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(baseInput(), EMPLOYER_A);
    await service.submitPaymentDeclaration(created.id, EMPLOYER_A);
    const notifications = await service.getNotifications(ADMIN_ID, 'ADMIN');
    const submitted = notifications.filter(n => n.type === 'PAYMENT_DECLARATION_SUBMITTED');
    assert(submitted.length > 0, 'Les administrateurs doivent être notifiés d’une déclaration à vérifier.');
  });

  /* ---------------------------------------------------------------- */
  /* 3. Approbation                                                    */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · approbation d’une déclaration', async () => {
    const service = new MockService();
    const underReview = await createSubmittedDeclaration(service);
    assert(underReview.status === 'UNDER_REVIEW', `Statut attendu UNDER_REVIEW, reçu ${underReview.status}`);
    const approved = await service.approvePaymentDeclaration(underReview.id, ADMIN_ID, 'Preuve concordante.');
    assert(approved.status === 'APPROVED', `Statut attendu APPROVED, reçu ${approved.status}`);
    assert(approved.reviewedBy === ADMIN_ID, 'reviewedBy doit identifier l’administrateur.');
    assert(Boolean(approved.reviewedAt), 'reviewedAt doit être renseigné.');
    assert(approved.history.some(e => e.type === 'APPROVED' && e.actorId === ADMIN_ID), 'L’approbation doit être tracée.');
    const employerNotifications = await service.getNotifications(EMPLOYER_A, 'EMPLOYER');
    assert(
      employerNotifications.some(n => n.type === 'PAYMENT_DECLARATION_APPROVED'),
      'L’employeur doit être informé de l’approbation.',
    );
  });

  /* ---------------------------------------------------------------- */
  /* 4 & 5. Rejet avec motif obligatoire                               */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · rejet avec motif obligatoire', async () => {
    const service = new MockService();
    const underReview = await createSubmittedDeclaration(service);
    const reason = 'Montant non concordant avec la part salarié du mois 3.';
    const rejected = await service.rejectPaymentDeclaration(underReview.id, reason, ADMIN_ID);
    assert(rejected.status === 'REJECTED', `Statut attendu REJECTED, reçu ${rejected.status}`);
    assert(rejected.rejectionReason === reason, 'Le motif du rejet doit être conservé intégralement.');
    assert(rejected.reviewedBy === ADMIN_ID, 'reviewedBy doit identifier l’administrateur.');
    assert(Boolean(rejected.reviewedAt), 'reviewedAt doit être renseigné.');
    assert(rejected.rejectionCount === 1, 'Le compteur de rejets doit être incrémenté.');
    const rejectionEvent = rejected.history.find(e => e.type === 'REJECTED');
    assert(rejectionEvent?.reason === reason, 'L’événement de rejet doit porter le motif.');
    assert(rejectionEvent?.actorId === ADMIN_ID, 'L’événement de rejet doit porter l’auteur.');
    const employerNotifications = await service.getNotifications(EMPLOYER_A, 'EMPLOYER');
    assert(
      employerNotifications.some(n => n.type === 'PAYMENT_DECLARATION_REJECTED' && n.message.includes(reason)),
      'L’employeur doit être informé du rejet et de son motif.',
    );
  });

  await check('PHASE4 · impossibilité de rejeter sans motif', async () => {
    const service = new MockService();
    const underReview = await createSubmittedDeclaration(service);
    await expectReject(() => service.rejectPaymentDeclaration(underReview.id, '   ', ADMIN_ID), 'motif');
    await expectReject(() => service.rejectPaymentDeclaration(underReview.id, 'abc', ADMIN_ID), 'motif');
    const still = await service.getPaymentDeclaration(underReview.id, ADMIN_ID);
    assert(still?.status === 'UNDER_REVIEW', 'Un rejet refusé ne doit pas modifier le dossier.');
  });

  await check('PHASE4 · le rejet ne supprime pas la dette', async () => {
    const service = new MockService();
    const underReview = await createSubmittedDeclaration(service);
    const before = underReview.amountDue;
    const rejected = await service.rejectPaymentDeclaration(underReview.id, 'Justificatif illisible.', ADMIN_ID);
    assert(rejected.amountDue === before, 'Le montant dû doit rester identique après un rejet.');
    assert(rejected.status !== 'APPROVED', 'Un paiement rejeté ne peut pas être considéré comme réglé.');
  });

  /* ---------------------------------------------------------------- */
  /* 6. Régularisation / resoumission                                  */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · resoumission après rejet', async () => {
    const service = new MockService();
    const underReview = await createSubmittedDeclaration(service, { amount: 25000 });
    const rejected = await service.rejectPaymentDeclaration(underReview.id, 'Montant incomplet.', ADMIN_ID);
    const resubmitted = await service.resubmitPaymentDeclaration(
      rejected.id,
      { amount: 30000, transactionId: 'TXN-QA-20261005-0002', comment: 'Complément réglé.' },
      EMPLOYER_A,
    );
    assert(resubmitted.status === 'RESUBMITTED', `Statut attendu RESUBMITTED, reçu ${resubmitted.status}`);
    assert(resubmitted.amount === 30000, 'Le montant régularisé doit être enregistré.');
    assert(resubmitted.transactionId === 'TXN-QA-20261005-0002', 'Le nouvel ID de transaction doit être enregistré.');
    assert(resubmitted.resubmissionCount === 1, 'La régularisation doit être comptée.');
    assert(Boolean(resubmitted.resubmittedAt), 'La date de régularisation doit être renseignée.');
    assert(resubmitted.rejectionReason === 'Montant incomplet.', 'Le motif du rejet reste consultable.');
  });

  await check('PHASE4 · conservation de l’historique après régularisation', async () => {
    const service = new MockService();
    const underReview = await createSubmittedDeclaration(service);
    const historyAfterReview = underReview.history.length;
    const rejected = await service.rejectPaymentDeclaration(underReview.id, 'Preuve illisible.', ADMIN_ID);
    const resubmitted = await service.resubmitPaymentDeclaration(rejected.id, { amount: 30000 }, EMPLOYER_A);
    const types = resubmitted.history.map(e => e.type);
    for (const expected of ['CREATED', 'SUBMITTED', 'REVIEW_STARTED', 'REJECTED', 'RESUBMITTED']) {
      assert(types.includes(expected as never), `L’historique doit conserver l’événement ${expected}.`);
    }
    assert(
      resubmitted.history.length >= historyAfterReview + 2,
      'Aucun événement d’historique ne doit être supprimé.',
    );
    const stored = await service.getPaymentHistory(resubmitted.id, ADMIN_ID);
    assert(stored.length === resubmitted.history.length, 'L’historique lu doit être complet.');
    const historyBeforeApproval = resubmitted.history.length;
    const approved = await service.approvePaymentDeclaration(resubmitted.id, ADMIN_ID);
    assert(approved.history.length === historyBeforeApproval + 1, 'L’approbation s’ajoute à l’historique.');
  });

  /* ---------------------------------------------------------------- */
  /* 9. Contrôle de propriété employeur                                */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · contrôle de propriété employeur', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(baseInput(), EMPLOYER_A);
    await expectReject(() => service.submitPaymentDeclaration(created.id, EMPLOYER_B), 'appartient');
    await expectReject(() => service.getPaymentDeclaration(created.id, EMPLOYER_B), 'autorisé');
    await expectReject(() => service.resubmitPaymentDeclaration(created.id, { amount: 30000 }, EMPLOYER_B), 'appartient');
    const own = await service.listEmployerPayments(EMPLOYER_A, EMPLOYER_A);
    assert(own.every(item => item.employerId === EMPLOYER_A), 'Un employeur ne voit que ses déclarations.');
    await expectReject(() => service.listEmployerPayments(EMPLOYER_A, EMPLOYER_B), 'autre employeur');
  });

  await check('PHASE4 · un employeur ne peut pas créer pour le contrat d’un autre', async () => {
    const service = new MockService();
    await expectReject(() => service.createPaymentDeclaration(baseInput(), EMPLOYER_B), 'n’appartient pas');
  });

  /* ---------------------------------------------------------------- */
  /* 10. Interdiction d’action admin par un employeur                  */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · interdiction d’action admin par un employeur', async () => {
    const service = new MockService();
    const underReview = await createSubmittedDeclaration(service);
    await expectReject(() => service.approvePaymentDeclaration(underReview.id, EMPLOYER_A), 'ADMIN uniquement');
    await expectReject(() => service.rejectPaymentDeclaration(underReview.id, 'Motif employeur.', EMPLOYER_A), 'ADMIN uniquement');
    await expectReject(() => service.startPaymentDeclarationReview(underReview.id, EMPLOYER_A), 'ADMIN uniquement');
    await expectReject(() => service.blockEmployerForPayment(underReview.id, 'Blocage employeur.', EMPLOYER_A), 'ADMIN uniquement');
    await expectReject(() => service.listAdminPayments(EMPLOYER_A), 'ADMIN uniquement');
    const untouched = await service.getPaymentDeclaration(underReview.id, ADMIN_ID);
    assert(untouched?.status === 'UNDER_REVIEW', 'Aucune action employeur n’a dû modifier le dossier.');
  });

  /* ---------------------------------------------------------------- */
  /* 11. Cohérence des transitions d'état                              */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · cohérence des transitions d’état', async () => {
    assert(canTransitionPaymentDeclaration('DRAFT', 'SUBMITTED'), 'DRAFT → SUBMITTED doit être autorisée.');
    assert(canTransitionPaymentDeclaration('SUBMITTED', 'UNDER_REVIEW'), 'SUBMITTED → UNDER_REVIEW doit être autorisée.');
    assert(canTransitionPaymentDeclaration('UNDER_REVIEW', 'APPROVED'), 'UNDER_REVIEW → APPROVED doit être autorisée.');
    assert(canTransitionPaymentDeclaration('UNDER_REVIEW', 'REJECTED'), 'UNDER_REVIEW → REJECTED doit être autorisée.');
    assert(canTransitionPaymentDeclaration('REJECTED', 'RESUBMITTED'), 'REJECTED → RESUBMITTED doit être autorisée.');
    assert(canTransitionPaymentDeclaration('RESUBMITTED', 'APPROVED'), 'RESUBMITTED → APPROVED doit être autorisée.');
    assert(!canTransitionPaymentDeclaration('DRAFT', 'APPROVED'), 'DRAFT → APPROVED doit être interdite.');
    assert(!canTransitionPaymentDeclaration('APPROVED', 'REJECTED'), 'APPROVED → REJECTED doit être interdite.');
    assert(!canTransitionPaymentDeclaration('APPROVED', 'APPROVED'), 'APPROVED → APPROVED doit être interdite.');
    assert(!canTransitionPaymentDeclaration('REJECTED', 'APPROVED'), 'REJECTED → APPROVED doit être interdite.');
    assert(PAYMENT_DECLARATION_TRANSITIONS.APPROVED.length === 0, 'APPROVED doit être un état terminal.');
  });

  await check('PHASE4 · une transition interdite est refusée par le repository', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(baseInput(), EMPLOYER_A);
    await expectReject(() => service.approvePaymentDeclaration(created.id, ADMIN_ID), 'Transition');
    const submitted = await service.submitPaymentDeclaration(created.id, EMPLOYER_A);
    await expectReject(() => service.submitPaymentDeclaration(submitted.id, EMPLOYER_A), 'Transition');
    await service.startPaymentDeclarationReview(submitted.id, ADMIN_ID);
    const approved = await service.approvePaymentDeclaration(submitted.id, ADMIN_ID);
    await expectReject(() => service.rejectPaymentDeclaration(approved.id, 'Trop tard.', ADMIN_ID), 'Transition');
  });

  /* ---------------------------------------------------------------- */
  /* 8. Blocage / déblocage traçable                                   */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · blocage J+3 tracé puis déblocage après régularisation', async () => {
    const service = new MockService();
    const declaration = await service.getPaymentDeclaration('PAYD-2026-005', ADMIN_ID);
    assert(declaration !== null, 'La déclaration de démonstration J+3 est absente.');
    const payment = declaration as PaymentDeclaration;
    assert(daysLateForPayment(payment.dueDate) >= 3, 'Le dossier de démonstration doit être en retard de 3 jours ou plus.');

    // Le contrôle doit d'abord constater l'impayé : le rejet remet l'échéance à DUE.
    await service.startPaymentDeclarationReview(payment.id, ADMIN_ID);
    await service.rejectPaymentDeclaration(payment.id, 'Montant déclaré inférieur au montant dû.', ADMIN_ID);

    const blocked = await service.blockEmployerForPayment(payment.id, 'Échéance impayée depuis J+3.', ADMIN_ID);
    assert(blocked.employer.accountStatus === 'BLOCKED', 'Le compte employeur doit être bloqué.');
    assert(
      blocked.declaration.history.some(e => e.type === 'EMPLOYER_BLOCKED' && e.actorId === ADMIN_ID),
      'Le blocage doit être tracé dans l’historique du paiement.',
    );

    // Déblocage refusé tant que la régularisation n'est pas validée.
    await expectReject(
      () => service.unblockEmployerForPayment(payment.id, 'Régularisation annoncée.', ADMIN_ID),
      'Déblocage refusé',
    );

    // Régularisation par l'employeur, puis validation par l'administration.
    await service.resubmitPaymentDeclaration(payment.id, { amount: 11250, transactionId: 'TXN-MTN-20261005-9911' }, EMPLOYER_LATE);
    await service.startPaymentDeclarationReview(payment.id, ADMIN_ID);
    await service.approvePaymentDeclaration(payment.id, ADMIN_ID, 'Régularisation validée.');
    const unlocked = await service.unblockEmployerForPayment(payment.id, 'Régularisation validée.', ADMIN_ID);
    assert(unlocked.employer.accountStatus === 'ACTIVE', 'Le compte employeur doit être débloqué.');
    assert(
      unlocked.declaration.history.some(e => e.type === 'EMPLOYER_UNBLOCKED'),
      'Le déblocage doit être tracé dans l’historique du paiement.',
    );
    assert(
      unlocked.declaration.history.some(e => e.type === 'EMPLOYER_BLOCKED'),
      'L’historique du blocage doit être conservé après déblocage.',
    );
  });

  await check('PHASE4 · aucune règle de blocage applicable = aucun blocage', async () => {
    const service = new MockService();
    // PAYD-2026-001 : échéance future, aucun rejet → blocage non justifié.
    await expectReject(
      () => service.blockEmployerForPayment('PAYD-2026-001', 'Blocage arbitraire.', ADMIN_ID),
      'Blocage refusé',
    );
  });

  await check('PHASE4 · règle de blocage (fonction pure, déterministe)', () => {
    const reference = new Date('2026-10-05T00:00:00.000Z');
    assert(daysLateForPayment('2026-10-01', reference) === 4, 'Retard de 4 jours attendu.');
    assert(daysLateForPayment('2026-10-20', reference) === 0, 'Aucun retard avant l’échéance.');
    const overdue = evaluatePaymentBlockingRule({
      status: 'REJECTED',
      dueDate: '2026-09-30',
      rejectionCount: 1,
      employerBlocked: false,
      scheduleOverdue: true,
      now: reference,
    });
    assert(overdue.canBlock && overdue.rule === 'J3_OVERDUE', 'Un retard J+3 constaté doit autoriser le blocage.');
    // Un dossier en vérification protège l'employeur : aucun blocage.
    const underVerification = evaluatePaymentBlockingRule({
      status: 'UNDER_REVIEW',
      dueDate: '2026-09-30',
      rejectionCount: 0,
      employerBlocked: false,
      scheduleOverdue: true,
      now: reference,
    });
    assert(!underVerification.canBlock && underVerification.underVerification, 'Une déclaration en vérification ne doit pas être blocable.');
    // Rejets répétés sans échéance exigible : pas de blocage.
    const repeated = evaluatePaymentBlockingRule({
      status: 'REJECTED',
      dueDate: '2026-10-20',
      rejectionCount: 2,
      employerBlocked: false,
      scheduleOverdue: false,
      now: reference,
    });
    assert(!repeated.canBlock, 'Sans échéance exigible, les rejets répétés ne suffisent pas à bloquer.');
    const settled = evaluatePaymentBlockingRule({
      status: 'APPROVED',
      dueDate: '2026-09-30',
      rejectionCount: 1,
      employerBlocked: true,
      scheduleOverdue: false,
      now: reference,
    });
    assert(settled.canUnblock && !settled.canBlock, 'Un dossier approuvé autorise le déblocage.');
  });

  /* ---------------------------------------------------------------- */
  /* Filtres / compteurs administratifs                                */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · compteur des paiements à vérifier (admin)', async () => {
    const service = new MockService();
    const all = await service.listAdminPayments(ADMIN_ID);
    const awaiting = await service.listAdminPayments(ADMIN_ID, { awaitingAdminAction: true });
    assert(all.length >= 5, `Le jeu de démonstration doit contenir au moins 5 dossiers (reçus ${all.length}).`);
    assert(awaiting.length === all.filter(p => isPaymentAwaitingAdminAction(p.status)).length, 'Le filtre « à traiter » est incohérent.');
    assert(awaiting.every(p => isPaymentAwaitingAdminAction(p.status)), 'Le filtre « à traiter » doit exclure les dossiers clos.');
    const rejectedOnly = await service.listAdminPayments(ADMIN_ID, { status: 'REJECTED' });
    assert(rejectedOnly.every(p => p.status === 'REJECTED'), 'Le filtre par statut est incohérent.');
    const searched = await service.listAdminPayments(ADMIN_ID, { search: 'Ateliers Métal' });
    assert(searched.length === 1 && searched[0].employerId === EMPLOYER_LATE, 'La recherche par employeur est incohérente.');
  });

  /* ---------------------------------------------------------------- */
  /* Garde-fous serveur (frontière API)                                */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · garde-fou serveur : propriété employeur', () => {
    const service = new MockService();
    const target = toPaymentAccessTarget({ id: 'PAYD-2026-001', employerId: EMPLOYER_A, status: 'SUBMITTED' } as PaymentDeclaration);
    requireEmployerOwnership(employerActor, target);
    const foreign = toPaymentAccessTarget({ id: 'PAYD-2026-001', employerId: EMPLOYER_B, status: 'SUBMITTED' } as PaymentDeclaration);
    let denied = false;
    try {
      requireEmployerOwnership(employerActor, foreign);
    } catch (error) {
      denied = (error as { status?: number }).status === 403;
    }
    assert(denied, 'Un employeur étranger doit être refusé (403).');
    assert(service instanceof MockService, 'Instance de service inattendue.');
  });

  await check('PHASE4 · garde-fou serveur : action admin interdite à un employeur', () => {
    const target = toPaymentAccessTarget({ id: 'PAYD-2026-001', employerId: EMPLOYER_A, status: 'UNDER_REVIEW' } as PaymentDeclaration);
    let denied = false;
    try {
      requireAdminPaymentMutation(employerActor, target, 'payments:approve', 'APPROVED');
    } catch (error) {
      denied = (error as { status?: number }).status === 403;
    }
    assert(denied, 'Un employeur ne doit jamais approuver un paiement (403).');
    requireAdminPaymentMutation(adminActor, target, 'payments:approve', 'APPROVED');
  });

  await check('PHASE4 · garde-fou serveur : transition et motif de rejet', () => {
    const target = toPaymentAccessTarget({ id: 'PAYD-2026-001', employerId: EMPLOYER_A, status: 'DRAFT' } as PaymentDeclaration);
    let refused = false;
    try {
      requirePaymentTransition(target, 'APPROVED');
    } catch (error) {
      refused = (error as { status?: number }).status === 422;
    }
    assert(refused, 'Une transition interdite doit renvoyer 422.');

    let validationFailed = false;
    try {
      requirePaymentRejectionReason('  ');
    } catch (error) {
      validationFailed = (error as { status?: number }).status === 400;
    }
    assert(validationFailed, 'Un motif de rejet vide doit renvoyer 400.');
    assert(requirePaymentRejectionReason('  Montant non concordant  ') === 'Montant non concordant', 'Le motif doit être normalisé.');
  });

  /* ---------------------------------------------------------------- */
  /* Règle 10 : aucune commission réinventée                           */
  /* ---------------------------------------------------------------- */
  await check('PHASE4 · commission 25% M1 / 0% M2+ non réinventée', async () => {
    const service = new MockService();
    // Contrat dédié au test : 40 000 FCFA → commission M1 = 10 000 (25%).
    const contract = await createQaContract(service, 'user-cand-3', 40000);
    const commission = await service.createPaymentDeclaration(
      { ...baseInput(), contractId: contract.id, monthNumber: 1, kind: 'COMMISSION', amount: 10000, transactionId: 'TXN-QA-M1-0001' },
      EMPLOYER_A,
    );
    assert(commission.amountDue === 10000, `Commission M1 attendue 10 000 (25% de 40 000), reçue ${commission.amountDue}`);
    const salary = await service.createPaymentDeclaration(
      { ...baseInput(), contractId: contract.id, monthNumber: 1, kind: 'SALARY', amount: 30000, transactionId: 'TXN-QA-M1-0002' },
      EMPLOYER_A,
    );
    assert(salary.amountDue === 30000, `Part salarié M1 attendue 30 000 (75% de 40 000), reçue ${salary.amountDue}`);
    const salaryM2 = await service.createPaymentDeclaration(
      { ...baseInput(), contractId: contract.id, monthNumber: 2, kind: 'SALARY', amount: 40000, transactionId: 'TXN-QA-M2-0001' },
      EMPLOYER_A,
    );
    assert(salaryM2.amountDue === 40000, `Salaire M2 attendu 40 000 (100% au travailleur), reçu ${salaryM2.amountDue}`);
    await expectReject(
      () => service.createPaymentDeclaration(
        { ...baseInput(), contractId: contract.id, monthNumber: 2, kind: 'COMMISSION', amount: 100, transactionId: 'TXN-QA-M2-C' },
        EMPLOYER_A,
      ),
      'aucune commission',
    );
    // Les montants relus viennent du calendrier contractuel existant.
    assert(commission.amountDue + salary.amountDue === 40000, 'La répartition M1 doit rester 25% / 75%.');
  });

  return results;
}
