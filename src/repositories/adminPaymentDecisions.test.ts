/**
 * LE LABEUR — Phase 4D — décision administrative sur un paiement soumis.
 *
 * Couvre les deux opérations Repository de décision (SUBMITTED → APPROVED et
 * SUBMITTED → REJECTED) : périmètre ADMIN, exigence du statut SUBMITTED, motif
 * de rejet obligatoire, auteur et horodatage de la décision, conservation du
 * propriétaire des données et de l'historique, interdiction ferme côté
 * EMPLOYER, affichage du nouveau statut, persistance et échec fermé en MODE API.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MockService } from './mockRepository';
import { ApiClientError } from './apiClient';
import { ApiRepository } from './apiRepository';
import { createLegacyApiRepositoryAdapter } from './legacyApiAdapter';
import { appRepositories } from './provider';
import {
  AdminPaymentDeclarationDetail,
  AdminPaymentRejectionForm,
  AdminPaymentsVerification,
} from '../screens/admin/AdminPaymentsVerification';
import {
  buildAdminPaymentDeclarationHistory,
  buildAdminPaymentDeclarationView,
  normalizeRejectionReason,
  resolveDeclarationContract,
  resolveDeclarationEmployer,
  resolveDeclarationReviewer,
  sortableDeclarationMoment,
} from '../domain/adminPaymentReview';
import {
  PAYMENT_DECLARATION_STATUS_LABELS,
  PaymentDeclaration,
  PaymentDeclarationInput,
} from '../types';

export interface AdminPaymentDecisionTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectReject(action: () => Promise<unknown>, matcher?: string | RegExp): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error) {
    if (!matcher) return true;
    const message = String((error as Error)?.message ?? error);
    return matcher instanceof RegExp ? matcher.test(message) : message.includes(matcher);
  }
}

const ADMIN = 'user-admin-1';
const ADMIN_NAME = 'Cellule Centrale de Contrôle LE LABEUR Bénin';
const EMPLOYER = 'user-emp-1';
const OTHER_EMPLOYER = 'user-emp-2';
const CANDIDATE = 'user-cand-1';

/** Déclarations du seed : deux soumises (décidables) et un brouillon employeur. */
const APPROVABLE_ID = 'PDECL-DEMO-0001';
const REJECTABLE_ID = 'PDECL-DEMO-0003';
const DRAFT_ID = 'PDECL-DEMO-0002';
const DECLARATIONS_KEY = 'lelabeur_v5_payment_declarations';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
}

/** Exécute un scénario avec un localStorage isolé, puis restaure l'environnement. */
async function withMemoryStorage<T>(test: (storage: MemoryStorage) => Promise<T>): Promise<T> {
  const storage = new MemoryStorage();
  const globalRef = globalThis as unknown as { localStorage?: unknown };
  const previous = globalRef.localStorage;
  globalRef.localStorage = storage;
  try {
    return await test(storage);
  } finally {
    if (previous === undefined) delete globalRef.localStorage;
    else globalRef.localStorage = previous;
  }
}

/** Champs déclarés par l'employeur : la décision administrative ne doit rien y changer. */
const EMPLOYER_OWNED_FIELDS = [
  'employerId',
  'contractId',
  'amount',
  'currency',
  'paymentMethod',
  'transactionId',
  'reference',
  'paidAt',
  'proofDocumentId',
  'proofReference',
  'comment',
  'submittedAt',
  'createdAt',
] as const;

function assertEmployerDataUnchanged(before: PaymentDeclaration, after: PaymentDeclaration): void {
  for (const field of EMPLOYER_OWNED_FIELDS) {
    assert(
      before[field] === after[field],
      `champ employeur modifié par la décision : ${field} (${String(before[field])} → ${String(after[field])})`,
    );
  }
}

/** reviewedAt doit être un horodatage ISO valide, postérieur à la soumission. */
function assertReviewMoment(declaration: PaymentDeclaration): void {
  assert(Boolean(declaration.reviewedAt), 'reviewedAt manquant après décision');
  const reviewed = Date.parse(declaration.reviewedAt!);
  assert(!Number.isNaN(reviewed), `reviewedAt invalide : ${declaration.reviewedAt}`);
  assert(declaration.reviewedAt === new Date(reviewed).toISOString(), 'reviewedAt non ISO 8601');
  const submitted = Date.parse(declaration.submittedAt ?? '');
  assert(!Number.isNaN(submitted), 'submittedAt manquant sur une déclaration décidée');
  assert(reviewed >= submitted, 'reviewedAt antérieur à la soumission');
  assert(reviewed <= Date.now() + 1000, 'reviewedAt dans le futur');
  assert(declaration.updatedAt === declaration.reviewedAt, 'updatedAt non aligné sur la décision');
}

function declarationInput(sequence: number): PaymentDeclarationInput {
  return {
    contractId: 'CTR-001',
    amount: 7500,
    paymentMethod: 'MOBILE_MONEY',
    transactionId: `TXN-MTN-PHASE4D-${sequence}`,
    reference: `REF-LABEUR-CTR001-4D${sequence}`,
    paidAt: '2026-09-20T14:30:00.000Z',
    proofReference: `RECU-MTN-4D${sequence}`,
    comment: 'Règlement Mobile Money déclaré par l’employeur.',
  };
}

export async function runAdminPaymentDecisionTests(): Promise<AdminPaymentDecisionTestResult[]> {
  const results: AdminPaymentDecisionTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('1. Abstraction Repository : les deux opérations de décision sont exposées par le bundle applicatif', () => {
    const operations = ['approvePaymentDeclaration', 'rejectPaymentDeclaration'] as const;
    for (const operation of operations) {
      assert(typeof appRepositories[operation] === 'function', `${operation} absent du bundle de repositories`);
      assert(typeof new MockService()[operation] === 'function', `${operation} absent du MockService`);
    }
  });

  await check('2. ADMIN : approbation d’une déclaration SUBMITTED → APPROVED, données employeur conservées', async () => {
    const service = new MockService();
    const before = await service.getSubmittedPaymentDeclaration(APPROVABLE_ID, ADMIN);
    assert(before, 'déclaration soumise absente du seed');

    const approved = await service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
    assert(approved.status === 'APPROVED', `statut attendu APPROVED, reçu ${approved.status}`);
    assert(approved.reviewedBy === ADMIN, `reviewedBy attendu ${ADMIN}, reçu ${String(approved.reviewedBy)}`);
    assertReviewMoment(approved);
    assert(approved.rejectionReason === undefined, 'une approbation ne porte pas de motif de rejet');
    assertEmployerDataUnchanged(before, approved);

    const stored = await service.getPaymentDeclaration(APPROVABLE_ID, EMPLOYER);
    assert(stored?.status === 'APPROVED', 'la décision n’est pas relisible dans le dépôt');
  });

  await check('3. ADMIN : rejet d’une déclaration SUBMITTED → REJECTED avec motif conservé et nettoyé', async () => {
    const service = new MockService();
    const before = await service.getSubmittedPaymentDeclaration(REJECTABLE_ID, ADMIN);
    assert(before, 'déclaration soumise absente du seed');

    const reason = 'Montant déclaré non concordant avec l’échéance du contrat CTR-003.';
    const rejected = await service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, reason);
    assert(rejected.status === 'REJECTED', `statut attendu REJECTED, reçu ${rejected.status}`);
    assert(rejected.rejectionReason === reason, `motif non conservé : ${String(rejected.rejectionReason)}`);
    assert(rejected.reviewedBy === ADMIN, `reviewedBy attendu ${ADMIN}, reçu ${String(rejected.reviewedBy)}`);
    assertReviewMoment(rejected);
    assertEmployerDataUnchanged(before, rejected);

    const trimmed = await service.rejectPaymentDeclaration(APPROVABLE_ID, ADMIN, '   Bordereau de virement illisible   ');
    assert(trimmed.rejectionReason === 'Bordereau de virement illisible', `motif non nettoyé : ${String(trimmed.rejectionReason)}`);
  });

  await check('4. Motif obligatoire : un rejet sans motif est refusé et ne modifie rien', async () => {
    await withMemoryStorage(async storage => {
      const service = new MockService();
      service.resetAllData();
      const before = storage.getItem(DECLARATIONS_KEY);
      assert(before, 'magasin de déclarations absent avant le test');

      for (const empty of ['', ' ', '   ', '\n\t ']) {
        assert(
          await expectReject(() => service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, empty), 'motif du rejet est obligatoire'),
          `rejet accepté avec un motif vide : « ${empty} »`,
        );
      }
      assert(
        await expectReject(() => service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, undefined as unknown as string), 'motif du rejet est obligatoire'),
        'rejet accepté sans argument de motif',
      );
      assert(
        await expectReject(() => service.rejectPaymentDeclaration(REJECTABLE_ID, EMPLOYER, ''), 'ADMIN uniquement'),
        'le contrôle du rôle doit précéder tout autre traitement',
      );

      const untouched = await service.getSubmittedPaymentDeclaration(REJECTABLE_ID, ADMIN);
      assert(untouched?.status === 'SUBMITTED', `statut modifié par un rejet refusé : ${String(untouched?.status)}`);
      assert(!untouched?.reviewedBy && !untouched?.reviewedAt && !untouched?.rejectionReason, 'champs de décision renseignés malgré le refus');

      const logs = await service.getAllAuditLogs(ADMIN);
      assert(
        !logs.some(log => log.action === 'PAYMENT_DECLARATION_REJECTED' && log.entityId === REJECTABLE_ID),
        'un rejet refusé a été tracé dans le journal d’audit',
      );
      assert(before === storage.getItem(DECLARATIONS_KEY), 'le magasin a été modifié par un rejet refusé');
    });
  });

  await check('5. Statut exigé : seule une déclaration SUBMITTED peut être approuvée ou rejetée', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.approvePaymentDeclaration(DRAFT_ID, ADMIN), 'SUBMITTED'), 'un brouillon employeur est approuvable');
    assert(await expectReject(() => service.rejectPaymentDeclaration(DRAFT_ID, ADMIN, 'Motif'), 'SUBMITTED'), 'un brouillon employeur est rejetable');
    assert(await expectReject(() => service.approvePaymentDeclaration('PDECL-INEXISTANT', ADMIN), 'introuvable'), 'une déclaration inexistante est approuvée');
    assert(await expectReject(() => service.rejectPaymentDeclaration('PDECL-INEXISTANT', ADMIN, 'Motif'), 'introuvable'), 'une déclaration inexistante est rejetée');

    const draft = await service.getPaymentDeclaration(DRAFT_ID, EMPLOYER);
    assert(draft?.status === 'DRAFT' && !draft?.reviewedBy, 'brouillon employeur modifié par une décision refusée');

    await service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
    assert(await expectReject(() => service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN), 'SUBMITTED'), 'une déclaration APPROVED est approuvable une seconde fois');
    assert(await expectReject(() => service.rejectPaymentDeclaration(APPROVABLE_ID, ADMIN, 'Motif tardif'), 'SUBMITTED'), 'une déclaration APPROVED devient rejetable');

    const rejected = await service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, 'Justificatif absent');
    assert(rejected.rejectionReason === 'Justificatif absent', 'motif du premier rejet perdu');
    assert(await expectReject(() => service.approvePaymentDeclaration(REJECTABLE_ID, ADMIN), 'SUBMITTED'), 'une déclaration REJECTED devient approuvable');
    const second = await expectReject(() => service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, 'Second motif'), 'SUBMITTED');
    assert(second, 'une déclaration REJECTED est rejetable une seconde fois');
    const reread = await service.getPaymentDeclaration(REJECTABLE_ID, OTHER_EMPLOYER);
    assert(reread?.rejectionReason === 'Justificatif absent', 'le motif du rejet enregistré a été écrasé');

    // Le dossier décidé sort du périmètre de consultation et de décision.
    const list = await service.listSubmittedPaymentDeclarations(ADMIN);
    assert(list.length === 0, `aucune déclaration soumise ne doit rester, reçu ${list.length}`);
    assert(await expectReject(() => service.getSubmittedPaymentDeclaration(APPROVABLE_ID, ADMIN), 'soumises'), 'un dossier approuvé reste consultable comme soumis');
  });

  await check('6. EMPLOYER interdit : aucune décision possible, propriétaire et données conservés', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.approvePaymentDeclaration(APPROVABLE_ID, EMPLOYER), 'ADMIN uniquement'), 'l’employeur propriétaire peut approuver sa déclaration');
    assert(await expectReject(() => service.rejectPaymentDeclaration(APPROVABLE_ID, EMPLOYER, 'Motif'), 'ADMIN uniquement'), 'l’employeur propriétaire peut rejeter sa déclaration');
    assert(await expectReject(() => service.approvePaymentDeclaration(REJECTABLE_ID, OTHER_EMPLOYER), 'ADMIN uniquement'), 'un employeur tiers peut approuver');
    assert(await expectReject(() => service.rejectPaymentDeclaration(REJECTABLE_ID, OTHER_EMPLOYER, 'Motif'), 'ADMIN uniquement'), 'un employeur tiers peut rejeter');
    assert(await expectReject(() => service.approvePaymentDeclaration(APPROVABLE_ID, CANDIDATE), 'ADMIN uniquement'), 'un candidat peut approuver');
    assert(await expectReject(() => service.rejectPaymentDeclaration(APPROVABLE_ID, CANDIDATE, 'Motif'), 'ADMIN uniquement'), 'un candidat peut rejeter');
    assert(await expectReject(() => service.approvePaymentDeclaration(APPROVABLE_ID, 'user-inconnu'), 'introuvable'), 'acteur inconnu accepté');
    assert(await expectReject(() => service.rejectPaymentDeclaration(APPROVABLE_ID, '   ', 'Motif'), 'actorId'), 'actorId vide accepté');

    const untouched = await service.getSubmittedPaymentDeclaration(APPROVABLE_ID, ADMIN);
    assert(untouched?.status === 'SUBMITTED' && !untouched?.reviewedBy && !untouched?.reviewedAt, 'déclaration modifiée par une décision refusée');

    // L'employeur ne peut pas non plus contourner la décision par ses propres opérations.
    assert(await expectReject(() => service.updatePaymentDeclaration(APPROVABLE_ID, { amount: 1 }, EMPLOYER), 'brouillon'), 'l’employeur modifie une déclaration soumise');
    assert(await expectReject(() => service.submitPaymentDeclaration(APPROVABLE_ID, EMPLOYER), 'brouillon'), 'l’employeur resoumet une déclaration soumise');

    const approved = await service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
    assert(approved.employerId === EMPLOYER, 'propriétaire des données perdu après décision');
    const employerView = await service.getPaymentDeclaration(APPROVABLE_ID, EMPLOYER);
    assert(employerView?.status === 'APPROVED', 'l’employeur ne voit pas le nouveau statut');
    assert(employerView?.employerId === EMPLOYER, 'propriétaire des données perdu côté employeur');
    assert(employerView?.amount === approved.amount && employerView?.reference === approved.reference, 'données déclarées altérées après décision');
    const employerList = await service.listEmployerPayments(EMPLOYER, EMPLOYER);
    assert(employerList.some(item => item.paymentId === APPROVABLE_ID), 'la déclaration décidée a disparu de l’espace employeur');
    assert(await expectReject(() => service.updatePaymentDeclaration(APPROVABLE_ID, { amount: 1 }, EMPLOYER), 'brouillon'), 'l’employeur modifie une déclaration approuvée');
  });

  await check('7. Historique conservé : création et soumission restent visibles après la décision', async () => {
    const service = new MockService();
    const rejected = await service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, 'Bordereau de virement illisible');
    const approved = await service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
    const logs = await service.getAllAuditLogs(ADMIN);

    const rejectedHistory = buildAdminPaymentDeclarationHistory(rejected, logs);
    assert(rejectedHistory.length >= 3, `historique attendu >= 3 entrées, reçu ${rejectedHistory.length}`);
    assert(rejectedHistory.some(entry => entry.label === 'Déclaration créée'), 'création perdue après la décision');
    assert(rejectedHistory.some(entry => entry.label === 'Déclaration soumise'), 'soumission perdue après la décision');
    const rejection = rejectedHistory.find(entry => entry.label === 'Déclaration rejetée');
    assert(rejection, 'décision de rejet absente de l’historique');
    assert(rejection.origin === 'AUDIT', 'la décision doit provenir du journal d’audit');
    assert(rejection.detail.includes('Bordereau de virement illisible'), 'motif absent du détail de l’historique');
    assert(
      rejectedHistory.every(entry => entry.label !== 'Déclaration approuvée'),
      'une approbation inventée dans l’historique d’un rejet',
    );

    const approvedHistory = buildAdminPaymentDeclarationHistory(approved, logs);
    assert(approvedHistory.some(entry => entry.label === 'Déclaration créée'), 'création perdue après approbation');
    assert(approvedHistory.some(entry => entry.label === 'Déclaration soumise'), 'soumission perdue après approbation');
    assert(approvedHistory.some(entry => entry.label === 'Déclaration approuvée'), 'approbation absente de l’historique');

    for (const history of [rejectedHistory, approvedHistory]) {
      const moments = history.map(entry => sortableDeclarationMoment(entry.at));
      assert(
        moments.every((value, index) => index === 0 || value <= moments[index - 1]),
        'historique non trié du plus récent au plus ancien',
      );
      assert(history.every(entry => entry.atLabel.length > 0 && entry.detail.length > 0), 'entrée d’historique incomplète');
    }

    assert(
      logs.some(log => log.action === 'PAYMENT_DECLARATION_REJECTED' && log.entityId === REJECTABLE_ID && log.role === 'ADMIN'),
      'trace d’audit du rejet absente',
    );
    assert(
      logs.some(log => log.action === 'PAYMENT_DECLARATION_APPROVED' && log.entityId === APPROVABLE_ID && log.role === 'ADMIN'),
      'trace d’audit de l’approbation absente',
    );
    assert(
      logs.some(log => log.action === 'DISCOVERY_INDEX_INITIALIZED'),
      'le journal d’audit antérieur a été écrasé par la décision',
    );
  });

  await check('8. Historique complet : création → soumission → décision, sans doublon ni perte', async () => {
    await withMemoryStorage(async () => {
      const service = new MockService();
      const created = await service.createPaymentDeclaration(declarationInput(1), EMPLOYER);
      await service.submitPaymentDeclaration(created.paymentId, EMPLOYER);
      const approved = await service.approvePaymentDeclaration(created.paymentId, ADMIN);
      const logs = await service.getAllAuditLogs(ADMIN);
      const history = buildAdminPaymentDeclarationHistory(approved, logs);

      const labels = history.map(entry => entry.label);
      for (const expected of ['Déclaration créée', 'Déclaration soumise', 'Déclaration approuvée']) {
        assert(labels.includes(expected), `${expected} absent de l’historique complet`);
        assert(labels.filter(label => label === expected).length === 1, `${expected} dupliqué dans l’historique`);
      }
      assert(history.every(entry => entry.origin === 'AUDIT'), 'un fait tracé par le journal est dupliqué depuis la déclaration');
      const moments = history.map(entry => sortableDeclarationMoment(entry.at));
      assert(
        moments.every((value, index) => index === 0 || value <= moments[index - 1]),
        'historique complet non trié du plus récent au plus ancien',
      );
    });
  });

  await check('9. reviewedBy / reviewedAt : auteur ADMIN, horodatage ISO et rendu lisible', async () => {
    const service = new MockService();
    await service.login('admin.benin@lelabeur.bj', 'ADMIN');
    const users = await service.getAllUsers(ADMIN);
    const approved = await service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
    const rejected = await service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, 'Montant non concordant');

    for (const decision of [approved, rejected]) {
      assert(decision.reviewedBy === ADMIN, `reviewedBy attendu ${ADMIN}, reçu ${String(decision.reviewedBy)}`);
      assertReviewMoment(decision);
      assert(decision.reviewedAt !== decision.submittedAt, 'reviewedAt confondu avec submittedAt');
    }
    assert(approved.reviewedBy === rejected.reviewedBy, 'auteur de décision incohérent entre deux dossiers');

    const approvedView = buildAdminPaymentDeclarationView(
      approved,
      resolveDeclarationContract(approved, await service.getContractsByUser(ADMIN, 'ADMIN')),
      resolveDeclarationEmployer(approved, users),
    );
    assert(approvedView.status === 'APPROVED' && approvedView.statusLabel === PAYMENT_DECLARATION_STATUS_LABELS.APPROVED, 'statut approuvé mal rendu');
    assert(approvedView.reviewedBy === ADMIN, 'reviewedBy absent de la vue');
    assert(/^\d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}$/.test(approvedView.reviewedAtLabel), `reviewedAt mal rendu : ${approvedView.reviewedAtLabel}`);
    assert(approvedView.decisionLabel === 'Déclaration approuvée par l’administration', `libellé de décision inattendu : ${approvedView.decisionLabel}`);
    assert(approvedView.pendingDecision === false, 'un dossier approuvé reste marqué en attente de décision');
    assert(approvedView.rejectionReason === '', 'motif de rejet inventé sur une approbation');

    const rejectedView = buildAdminPaymentDeclarationView(
      rejected,
      resolveDeclarationContract(rejected, await service.getContractsByUser(ADMIN, 'ADMIN')),
      resolveDeclarationEmployer(rejected, users),
    );
    assert(rejectedView.statusLabel === PAYMENT_DECLARATION_STATUS_LABELS.REJECTED, 'statut rejeté mal rendu');
    assert(rejectedView.rejectionReason === 'Montant non concordant', 'motif absent de la vue');
    assert(rejectedView.decisionLabel === 'Déclaration rejetée par l’administration', `libellé de décision inattendu : ${rejectedView.decisionLabel}`);

    const pending = await service.createPaymentDeclaration(declarationInput(2), EMPLOYER);
    const pendingView = buildAdminPaymentDeclarationView(pending, undefined, undefined);
    assert(pendingView.reviewedAt === '' && pendingView.reviewedBy === '', 'champs de décision renseignés avant toute décision');
    assert(pendingView.reviewedAtLabel === '—', 'horodatage de décision inventé');
    assert(pendingView.decisionLabel === '—', 'décision inventée avant décision administrative');

    assert(resolveDeclarationReviewer(ADMIN, users) === ADMIN_NAME, 'nom de l’ADMIN non résolu');
    assert(resolveDeclarationReviewer('user-inconnu', users) === 'user-inconnu', 'relecteur inconnu non replié sur son identifiant');
    assert(resolveDeclarationReviewer(undefined, users) === '—', 'relecteur absent mal rendu');
  });

  await check('10. Persistance : la décision survit à une relecture du dépôt et vide la liste « à vérifier »', async () => {
    await withMemoryStorage(async storage => {
      const service = new MockService();
      service.resetAllData();
      await service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
      await service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, 'Montant non concordant avec l’échéance');

      const stored = JSON.parse(storage.getItem(DECLARATIONS_KEY)!) as PaymentDeclaration[];
      const approved = stored.find(item => item.paymentId === APPROVABLE_ID);
      assert(approved?.status === 'APPROVED' && approved.reviewedBy === ADMIN && Boolean(approved.reviewedAt), 'approbation non persistée');
      const rejected = stored.find(item => item.paymentId === REJECTABLE_ID);
      assert(rejected?.status === 'REJECTED' && rejected.rejectionReason === 'Montant non concordant avec l’échéance', 'rejet non persisté');
      const draft = stored.find(item => item.paymentId === DRAFT_ID);
      assert(draft?.status === 'DRAFT' && !draft.reviewedBy && !draft.reviewedAt, 'brouillon employeur altéré par une décision');

      const reloaded = new MockService();
      const list = await reloaded.listSubmittedPaymentDeclarations(ADMIN);
      assert(list.length === 0, `liste « à vérifier » encore alimentée après décision : ${list.length}`);
      const employerView = await reloaded.getPaymentDeclaration(APPROVABLE_ID, EMPLOYER);
      assert(employerView?.status === 'APPROVED' && employerView?.reviewedBy === ADMIN, 'décision non relue depuis le dépôt');
      const logs = await reloaded.getAllAuditLogs(ADMIN);
      const rejectedReread = await reloaded.getPaymentDeclaration(REJECTABLE_ID, OTHER_EMPLOYER);
      assert(rejectedReread?.status === 'REJECTED', 'rejet non relu depuis le dépôt');
      const history = buildAdminPaymentDeclarationHistory(rejectedReread!, logs);
      assert(history.some(entry => entry.label === 'Déclaration rejetée'), 'décision absente de l’historique relu');
      assert(history.some(entry => entry.label === 'Déclaration créée'), 'création absente de l’historique relu');
    });
  });

  await check('11. Affichage ADMIN : Approuver / Rejeter, motif obligatoire et nouveau statut affiché', async () => {
    const service = new MockService();
    await service.login('admin.benin@lelabeur.bj', 'ADMIN');
    const declarations = await service.listSubmittedPaymentDeclarations(ADMIN);
    const contracts = await service.getContractsByUser(ADMIN, 'ADMIN');
    const employers = await service.getAllUsers(ADMIN);
    const detail = await service.getSubmittedPaymentDeclaration(APPROVABLE_ID, ADMIN);
    assert(detail, 'détail indisponible pour le rendu');
    const detailProps = {
      declaration: detail,
      contracts,
      employers,
      auditLogs: await service.getAllAuditLogs(ADMIN),
      onBack: () => {},
    };

    // Sans callback de décision (consultation Phase 4C), le détail reste en lecture seule.
    const readOnlyMarkup = renderToStaticMarkup(React.createElement(AdminPaymentDeclarationDetail, detailProps));
    assert(readOnlyMarkup.includes('lecture seule'), 'mention de lecture seule perdue');
    assert(!readOnlyMarkup.includes('Approuver') && !readOnlyMarkup.includes('Rejeter'), 'décision exposée sans opération du Repository');
    assert(readOnlyMarkup.includes('Aucune décision administrative enregistrée'), 'état de décision ambigu en lecture seule');

    // Avec les opérations du Repository : les deux actions sont proposées.
    const decidableMarkup = renderToStaticMarkup(React.createElement(AdminPaymentDeclarationDetail, {
      ...detailProps,
      onApprove: () => {},
      onReject: () => {},
    }));
    assert(decidableMarkup.includes('Décision administrative'), 'section de décision absente du détail');
    assert(decidableMarkup.includes('Approuver'), 'bouton « Approuver » absent du détail');
    assert(decidableMarkup.includes('Rejeter'), 'bouton « Rejeter » absent du détail');
    assert(decidableMarkup.includes('Le rejet exige un motif'), 'exigence du motif non annoncée');
    assert(!decidableMarkup.includes('Nouveau statut'), 'décision affichée avant toute action');

    // Formulaire de motif : rendu, valeur saisie reprise, confirmation et annulation.
    const formMarkup = renderToStaticMarkup(React.createElement(AdminPaymentRejectionForm, {
      value: 'Montant déclaré non concordant',
      onChange: () => {},
      onConfirm: () => {},
      onCancel: () => {},
    }));
    assert(formMarkup.includes('Motif du rejet (obligatoire)'), 'libellé du motif absent du formulaire');
    assert(formMarkup.includes('Montant déclaré non concordant'), 'motif saisi absent du formulaire');
    assert(formMarkup.includes('Confirmer le rejet'), 'confirmation du rejet absente du formulaire');
    assert(formMarkup.includes('Annuler'), 'annulation absente du formulaire');
    let emptyReasonError = '';
    try {
      normalizeRejectionReason('   ');
    } catch (error) {
      emptyReasonError = String((error as Error)?.message ?? error);
    }
    assert(emptyReasonError.includes('motif du rejet est obligatoire'), `motif vide accepté par la règle UI : ${emptyReasonError}`);

    // Après décision : le nouveau statut est affiché clairement, les actions disparaissent.
    const approved = await service.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
    const approvedMarkup = renderToStaticMarkup(React.createElement(AdminPaymentDeclarationDetail, {
      ...detailProps,
      declaration: approved,
      auditLogs: await service.getAllAuditLogs(ADMIN),
      onApprove: () => {},
      onReject: () => {},
    }));
    assert(approvedMarkup.includes(`Nouveau statut : ${PAYMENT_DECLARATION_STATUS_LABELS.APPROVED}`), 'nouveau statut approuvé non affiché');
    assert(approvedMarkup.includes(`Décision enregistrée par ${ADMIN_NAME} le`), 'auteur et horodatage de la décision non affichés');
    assert(approvedMarkup.includes(PAYMENT_DECLARATION_STATUS_LABELS.APPROVED), 'badge de statut absent après approbation');
    assert(approvedMarkup.includes('Dossier clos'), 'clôture du dossier non signalée');
    assert(!approvedMarkup.includes('Approuver') && !approvedMarkup.includes('Rejeter'), 'actions encore proposées sur un dossier décidé');

    const rejected = await service.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, 'Justificatif de virement manquant');
    const rejectedMarkup = renderToStaticMarkup(React.createElement(AdminPaymentDeclarationDetail, {
      ...detailProps,
      declaration: rejected,
      auditLogs: await service.getAllAuditLogs(ADMIN),
      onApprove: () => {},
      onReject: () => {},
    }));
    assert(rejectedMarkup.includes(`Nouveau statut : ${PAYMENT_DECLARATION_STATUS_LABELS.REJECTED}`), 'nouveau statut rejeté non affiché');
    assert(rejectedMarkup.includes('Motif du rejet : Justificatif de virement manquant'), 'motif du rejet non affiché après décision');
    assert(!rejectedMarkup.includes('Approuver') && !rejectedMarkup.includes('Rejeter'), 'actions encore proposées sur un dossier rejeté');

    // La liste reste une consultation : aucune action de décision n'y est exposée.
    const listMarkup = renderToStaticMarkup(React.createElement(AdminPaymentsVerification, {
      declarations,
      contracts,
      employers,
      onOpenDeclaration: () => {},
    }));
    assert(listMarkup.includes('Paiements à vérifier'), 'titre de la liste absent du rendu');
    assert(!listMarkup.includes('Approuver') && !listMarkup.includes('Rejeter'), 'décision administrative exposée dans la liste');
  });

  await check('12. MODE API : les décisions échouent en 501, sans repli sur le mock', async () => {
    const adapter = createLegacyApiRepositoryAdapter({} as ApiRepository);
    let approveFailed = false;
    try {
      await adapter.approvePaymentDeclaration(APPROVABLE_ID, ADMIN);
    } catch (error) {
      approveFailed = error instanceof ApiClientError && error.status === 501;
    }
    assert(approveFailed, 'approvePaymentDeclaration doit échouer en 501 tant que l’API ne l’expose pas');

    let rejectFailed = false;
    try {
      await adapter.rejectPaymentDeclaration(REJECTABLE_ID, ADMIN, 'Motif');
    } catch (error) {
      rejectFailed = error instanceof ApiClientError && error.status === 501;
    }
    assert(rejectFailed, 'rejectPaymentDeclaration doit échouer en 501 tant que l’API ne l’expose pas');
  });

  return results;
}
