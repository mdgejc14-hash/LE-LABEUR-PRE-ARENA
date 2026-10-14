/**
 * LE LABEUR — Phase 4C — consultation ADMIN des paiements soumis.
 *
 * Couvre l'opération Repository qui liste les déclarations SUBMITTED, celle qui
 * en ouvre le détail, les refus fermés (EMPLOYER / CANDIDATE / acteur inconnu),
 * la lecture seule, les données réellement affichées et l'échec fermé en MODE
 * API. Aucune décision administrative (UNDER_REVIEW / APPROVED / REJECTED)
 * n'est testée : elle reste hors périmètre.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MockService } from './mockRepository';
import { INITIAL_PAYMENT_DECLARATIONS } from './mockData';
import { ApiClientError } from './apiClient';
import { ApiRepository } from './apiRepository';
import { createLegacyApiRepositoryAdapter } from './legacyApiAdapter';
import { appRepositories } from './provider';
import {
  AdminPaymentDeclarationDetail,
  AdminPaymentsVerification,
} from '../screens/admin/AdminPaymentsVerification';
import {
  buildAdminPaymentDeclarationHistory,
  buildAdminPaymentDeclarationView,
  resolveDeclarationContract,
  resolveDeclarationEmployer,
} from '../domain/adminPaymentReview';
import {
  EXTERNAL_PAYMENT_METHOD_LABELS,
  PAYMENT_DECLARATION_STATUS_LABELS,
  PaymentDeclaration,
} from '../types';

export interface PaymentDeclarationTestResult {
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
const EMPLOYER = 'user-emp-1';
const OTHER_EMPLOYER = 'user-emp-2';
const CANDIDATE = 'user-cand-1';

/** Déclarations soumises du seed de démonstration. */
const SUBMITTED_IDS = ['PDECL-DEMO-0001', 'PDECL-DEMO-0003'];
const DRAFT_ID = 'PDECL-DEMO-0002';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
}

function assertCompleteDeclaration(declaration: PaymentDeclaration): void {
  assert(Boolean(declaration.paymentId), 'paymentId manquant');
  assert(Boolean(declaration.employerId), 'employerId manquant');
  assert(Boolean(declaration.contractId), 'contractId manquant');
  assert(Number.isFinite(declaration.amount) && declaration.amount > 0, 'amount invalide');
  assert(Boolean(declaration.paymentMethod), 'paymentMethod manquant');
  assert(Boolean(declaration.transactionId), 'transactionId manquant');
  assert(Boolean(declaration.reference), 'reference manquante');
  assert(!Number.isNaN(new Date(declaration.paidAt).getTime()), 'paidAt invalide');
  assert(declaration.status === 'SUBMITTED', `statut attendu SUBMITTED, reçu ${declaration.status}`);
  assert(Boolean(declaration.submittedAt), 'submittedAt manquant');
  assert(Boolean(declaration.proofDocumentId || declaration.proofReference), 'justificatif manquant');
  assert(Boolean(declaration.createdAt) && Boolean(declaration.updatedAt), 'horodatages manquants');
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

export async function runAdminPaymentDeclarationTests(): Promise<PaymentDeclarationTestResult[]> {
  const results: PaymentDeclarationTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('1. Abstraction Repository : les deux opérations ADMIN sont exposées par le bundle applicatif', () => {
    const operations = ['listSubmittedPaymentDeclarations', 'getSubmittedPaymentDeclaration'] as const;
    for (const operation of operations) {
      assert(typeof appRepositories[operation] === 'function', `${operation} absent du bundle de repositories`);
      assert(typeof new MockService()[operation] === 'function', `${operation} absent du MockService`);
    }
  });

  await check('2. MODE DEMO : au moins deux déclarations SUBMITTED, portées par deux employeurs distincts', async () => {
    const service = new MockService();
    const list = await service.listSubmittedPaymentDeclarations(ADMIN);
    assert(list.length >= 2, `seed ADMIN attendu >= 2 déclarations soumises, reçu ${list.length}`);
    for (const declaration of list) assertCompleteDeclaration(declaration);
    const employers = new Set(list.map(item => item.employerId));
    assert(employers.size >= 2, `seed attendu sur >= 2 employeurs, reçu ${employers.size}`);
    assert(list.some(item => item.paymentId === 'PDECL-DEMO-0001'), 'seed sans la déclaration soumise du contrat CTR-001');
    assert(list.some(item => item.paymentId === 'PDECL-DEMO-0003'), 'seed sans la déclaration soumise du contrat CTR-003');
    assert(
      INITIAL_PAYMENT_DECLARATIONS.filter(seed => SUBMITTED_IDS.includes(seed.paymentId)).every(seed => seed.status === 'SUBMITTED'),
      'le seed de démonstration doit marquer ces déclarations comme soumises',
    );
  });

  await check('3. ADMIN : liste limitée aux déclarations soumises, de la plus récente à la plus ancienne', async () => {
    const service = new MockService();
    const list = await service.listSubmittedPaymentDeclarations(ADMIN);
    assert(list.every(item => item.status === 'SUBMITTED'), 'la liste ADMIN expose un statut autre que SUBMITTED');
    assert(!list.some(item => item.paymentId === DRAFT_ID), 'un brouillon employeur est exposé à l’administration');
    const dates = list.map(item => new Date(item.submittedAt!).getTime());
    assert(dates.every((value, index) => index === 0 || value <= dates[index - 1]), 'liste ADMIN non triée du plus récent au plus ancien');
    assert(list[0].paymentId === 'PDECL-DEMO-0003', `soumission la plus récente attendue en tête, reçu ${list[0].paymentId}`);
  });

  await check('4. Refus fermé : un EMPLOYER ne peut pas utiliser les opérations administratives', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.listSubmittedPaymentDeclarations(EMPLOYER), 'ADMIN uniquement'), 'un employeur peut lister les paiements soumis');
    assert(await expectReject(() => service.listSubmittedPaymentDeclarations(OTHER_EMPLOYER), 'ADMIN uniquement'), 'un autre employeur peut lister les paiements soumis');
    assert(await expectReject(() => service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', EMPLOYER), 'ADMIN uniquement'), 'un employeur peut ouvrir un dossier administratif');
    assert(await expectReject(() => service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', OTHER_EMPLOYER), 'ADMIN uniquement'), 'un employeur tiers peut ouvrir un dossier administratif');
  });

  await check('5. Refus fermé : candidat, acteur inconnu et actorId vide restent sans accès', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.listSubmittedPaymentDeclarations(CANDIDATE), 'ADMIN uniquement'), 'un candidat peut lister les paiements soumis');
    assert(await expectReject(() => service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', CANDIDATE), 'ADMIN uniquement'), 'un candidat peut ouvrir un dossier administratif');
    assert(await expectReject(() => service.listSubmittedPaymentDeclarations('user-inconnu'), 'introuvable'), 'acteur inconnu accepté');
    assert(await expectReject(() => service.listSubmittedPaymentDeclarations(''), 'actorId'), 'actorId vide accepté');
    assert(await expectReject(() => service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', '   '), 'actorId'), 'actorId blanc accepté');
  });

  await check('6. ADMIN : détail d’une déclaration soumise, complet et détaché du dépôt', async () => {
    const service = new MockService();
    const detail = await service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', ADMIN);
    assert(detail, 'déclaration soumise introuvable pour l’ADMIN');
    assertCompleteDeclaration(detail);
    assert(detail.employerId === 'user-emp-1', 'employeur inattendu');
    assert(detail.contractId === 'CTR-001', 'contrat inattendu');
    assert(detail.reference === 'SAL-CTR-001-M1', 'référence inattendue');
    assert(detail.proofDocumentId === 'DOC-REC-SAL-CTR001-M1', 'justificatif inattendu');
    assert(Boolean(detail.comment), 'commentaire employeur manquant');

    detail.amount = 1;
    const reread = await service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', ADMIN);
    assert(reread?.amount === 22500, 'la lecture ADMIN expose une référence mutable du dépôt');
  });

  await check('7. Le détail ADMIN refuse une déclaration non soumise (fail closed) et un identifiant inconnu renvoie null', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.getSubmittedPaymentDeclaration(DRAFT_ID, ADMIN), 'soumises'), 'un brouillon employeur est consultable par l’ADMIN');
    const missing = await service.getSubmittedPaymentDeclaration('PDECL-INEXISTANT', ADMIN);
    assert(missing === null, `déclaration inexistante : null attendu, reçu ${String(missing)}`);
  });

  await check('8. Lecture seule : la consultation ADMIN ne modifie ni le statut ni le magasin', async () => {
    await withMemoryStorage(async storage => {
      const service = new MockService();
      service.resetAllData();
      const before = storage.getItem('lelabeur_v5_payment_declarations');
      assert(before, 'magasin de déclarations absent avant le test');

      await service.listSubmittedPaymentDeclarations(ADMIN);
      await service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', ADMIN);
      await service.getSubmittedPaymentDeclaration('PDECL-DEMO-0003', ADMIN);

      const after = storage.getItem('lelabeur_v5_payment_declarations');
      assert(before === after, 'la consultation ADMIN a modifié le magasin de déclarations');
      const statuses = (JSON.parse(after!) as PaymentDeclaration[])
        .filter(item => SUBMITTED_IDS.includes(item.paymentId))
        .map(item => item.status);
      assert(statuses.length === 2 && statuses.every(status => status === 'SUBMITTED'), 'les statuts soumis ont changé après consultation');
      const draft = (JSON.parse(after!) as PaymentDeclaration[]).find(item => item.paymentId === DRAFT_ID);
      assert(draft?.status === 'DRAFT', 'le brouillon employeur a changé après consultation ADMIN');
    });
  });

  await check('9. Affichage : la vue ADMIN expose employeur, contrat, montant, moyen, transaction, référence, dates et statut', async () => {
    const service = new MockService();
    await service.login('admin.benin@lelabeur.bj', 'ADMIN');
    const declarations = await service.listSubmittedPaymentDeclarations(ADMIN);
    const contracts = await service.getContractsByUser(ADMIN, 'ADMIN');
    const employers = await service.getAllUsers(ADMIN);
    const declaration = declarations.find(item => item.paymentId === 'PDECL-DEMO-0003');
    assert(declaration, 'déclaration soumise CTR-003 absente');

    const view = buildAdminPaymentDeclarationView(
      declaration,
      resolveDeclarationContract(declaration, contracts),
      resolveDeclarationEmployer(declaration, employers),
    );

    assert(view.employerId === 'user-emp-2', 'employeur non repris');
    assert(view.employerName === 'Les Bâtisseurs du Golfe Bénin', `raison sociale inattendue : ${view.employerName}`);
    assert(view.employerAccountName === 'Jean-Baptiste Soglo', `titulaire du compte inattendu : ${view.employerAccountName}`);
    assert(view.employerPublicId === 'LAB-R-000002', `identifiant employeur inattendu : ${view.employerPublicId}`);
    assert(view.contractId === 'CTR-003', 'contrat non repris');
    assert(view.contractOfferTitle === 'Électricien Bâtiment Réseau Ondulé Clinique', `mission inattendue : ${view.contractOfferTitle}`);
    assert(view.contractEmployeeName === 'Rodrigue Akpakoun', 'salarié du contrat non repris');
    assert(view.contractMonthlySalary === 140000, 'salaire mensuel du contrat non repris');
    assert(view.amount === 35000 && view.currency === 'FCFA', 'montant déclaré non repris');
    assert(view.amountLabel.endsWith('FCFA'), `libellé du montant incomplet : ${view.amountLabel}`);
    assert(view.paymentMethod === 'BANK_TRANSFER', 'moyen de paiement non repris');
    assert(view.paymentMethodLabel === EXTERNAL_PAYMENT_METHOD_LABELS.BANK_TRANSFER, 'libellé du moyen de paiement inattendu');
    assert(view.transactionId === 'VIR-BOA-20261001-55210', 'transactionId non repris');
    assert(view.reference === 'COMM-CTR-003-M1', 'référence non reprise');
    assert(view.paidAt === declaration.paidAt && /^\d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}$/.test(view.paidAtLabel), `date de paiement mal rendue : ${view.paidAtLabel}`);
    assert(view.submittedAt === declaration.submittedAt && /^\d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}$/.test(view.submittedAtLabel), `date de soumission mal rendue : ${view.submittedAtLabel}`);
    assert(view.status === 'SUBMITTED' && view.statusLabel === PAYMENT_DECLARATION_STATUS_LABELS.SUBMITTED, 'statut mal rendu');
  });

  await check('10. Affichage : justificatif, commentaire, informations contractuelles et historique', async () => {
    const service = new MockService();
    await service.login('admin.benin@lelabeur.bj', 'ADMIN');
    const declarations = await service.listSubmittedPaymentDeclarations(ADMIN);
    const contracts = await service.getContractsByUser(ADMIN, 'ADMIN');
    const employers = await service.getAllUsers(ADMIN);
    const auditLogs = await service.getAllAuditLogs(ADMIN);
    const byReference = declarations.find(item => item.paymentId === 'PDECL-DEMO-0003');
    const byDocument = declarations.find(item => item.paymentId === 'PDECL-DEMO-0001');
    assert(byReference && byDocument, 'déclarations soumises du seed absentes');

    const referenceView = buildAdminPaymentDeclarationView(
      byReference,
      resolveDeclarationContract(byReference, contracts),
      resolveDeclarationEmployer(byReference, employers),
    );
    assert(referenceView.hasProof, 'justificatif par référence non détecté');
    assert(referenceView.proofReference === 'BORDEREAU-BOA-55210', 'référence du justificatif non reprise');
    assert(referenceView.proofLabel.includes('BORDEREAU-BOA-55210'), `libellé du justificatif inattendu : ${referenceView.proofLabel}`);
    assert(Boolean(referenceView.comment?.includes('virement bancaire BOA')), 'commentaire employeur non repris');
    assert(referenceView.contractStatus === 'INCIDENT', 'statut du contrat non repris');
    assert(referenceView.contractStartDate === '20 Septembre 2026', 'date de début du contrat non reprise');

    const documentView = buildAdminPaymentDeclarationView(
      byDocument,
      resolveDeclarationContract(byDocument, contracts),
      resolveDeclarationEmployer(byDocument, employers),
    );
    assert(documentView.proofDocumentId === 'DOC-REC-SAL-CTR001-M1', 'document justificatif non repris');
    assert(documentView.proofLabel.includes('DOC-REC-SAL-CTR001-M1'), `libellé du document inattendu : ${documentView.proofLabel}`);

    const history = buildAdminPaymentDeclarationHistory(byReference, auditLogs);
    assert(history.length >= 2, `historique attendu >= 2 entrées, reçu ${history.length}`);
    assert(history.some(entry => entry.label === 'Déclaration créée'), 'création absente de l’historique');
    assert(history.some(entry => entry.label === 'Déclaration soumise'), 'soumission absente de l’historique');
    assert(history.every(entry => entry.atLabel.length > 0 && entry.detail.length > 0), 'entrée d’historique incomplète');
    assert(new Date(history[0].at).getTime() >= new Date(history[history.length - 1].at).getTime(), 'historique non trié du plus récent au plus ancien');
  });

  await check('11. Affichage : le rendu de la section ADMIN et du détail contient les données attendues', async () => {
    const service = new MockService();
    await service.login('admin.benin@lelabeur.bj', 'ADMIN');
    const declarations = await service.listSubmittedPaymentDeclarations(ADMIN);
    const contracts = await service.getContractsByUser(ADMIN, 'ADMIN');
    const employers = await service.getAllUsers(ADMIN);
    const auditLogs = await service.getAllAuditLogs(ADMIN);
    const detail = await service.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', ADMIN);
    assert(detail, 'détail indisponible pour le rendu');

    const listMarkup = renderToStaticMarkup(React.createElement(AdminPaymentsVerification, {
      declarations,
      contracts,
      employers,
      onOpenDeclaration: () => {},
    }));
    assert(listMarkup.includes('Paiements à vérifier'), 'titre « Paiements à vérifier » absent du rendu');
    assert(listMarkup.includes('Atelier Bois &amp; Agencement Bénin'), 'raison sociale CTR-001 absente du rendu');
    assert(listMarkup.includes('Les Bâtisseurs du Golfe Bénin'), 'raison sociale CTR-003 absente du rendu');
    assert(listMarkup.includes('Jean-Baptiste Soglo'), 'titulaire du compte absent du rendu');
    assert(listMarkup.includes('CTR-001') && listMarkup.includes('CTR-003'), 'contrats absents du rendu');
    assert(listMarkup.includes('SAL-MTN-8829104'), 'transactionId absent du rendu');
    assert(listMarkup.includes('COMM-CTR-003-M1'), 'référence absente du rendu');
    assert(listMarkup.includes(EXTERNAL_PAYMENT_METHOD_LABELS.MOBILE_MONEY), 'moyen de paiement absent du rendu');
    assert(listMarkup.includes(PAYMENT_DECLARATION_STATUS_LABELS.SUBMITTED), 'statut Soumis absent du rendu');
    assert(listMarkup.includes('Ouvrir le détail'), 'action d’ouverture absente du rendu');
    assert(!listMarkup.includes(DRAFT_ID), 'brouillon employeur exposé dans le rendu ADMIN');
    assert(!listMarkup.includes('Approuver') && !listMarkup.includes('Rejeter'), 'décision administrative présente dans la consultation');

    const detailMarkup = renderToStaticMarkup(React.createElement(AdminPaymentDeclarationDetail, {
      declaration: detail,
      contracts,
      employers,
      auditLogs,
      onBack: () => {},
    }));
    assert(detailMarkup.includes('Dossier de paiement'), 'en-tête du détail absent du rendu');
    assert(detailMarkup.includes('Atelier Bois &amp; Agencement Bénin'), 'raison sociale absente du détail');
    assert(detailMarkup.includes('Reine Houénou'), 'titulaire du compte employeur absent du détail');
    assert(detailMarkup.includes('DOC-REC-SAL-CTR001-M1'), 'justificatif absent du détail');
    assert(detailMarkup.includes('Amina Dossou'), 'salarié du contrat absent du détail');
    assert(detailMarkup.includes('Part nette salariée'), 'commentaire employeur absent du détail');
    assert(detailMarkup.includes('Historique'), 'section historique absente du détail');
    assert(detailMarkup.includes('Horodatage déclaration'), 'origine de l’historique absente du détail');
    assert(detailMarkup.includes('lecture seule'), 'mention de lecture seule absente du détail');
    assert(!detailMarkup.includes('UNDER_REVIEW') && !detailMarkup.includes('APPROVED') && !detailMarkup.includes('REJECTED'), 'statuts administratifs hors périmètre présents dans le détail');
  });

  await check('12. MODE API : les opérations ADMIN échouent en 501, sans repli sur le mock', async () => {
    const adapter = createLegacyApiRepositoryAdapter({} as ApiRepository);
    let listFailed = false;
    try {
      await adapter.listSubmittedPaymentDeclarations(ADMIN);
    } catch (error) {
      listFailed = error instanceof ApiClientError && error.status === 501;
    }
    assert(listFailed, 'listSubmittedPaymentDeclarations doit échouer en 501 tant que l’API ne l’expose pas');

    let detailFailed = false;
    try {
      await adapter.getSubmittedPaymentDeclaration('PDECL-DEMO-0001', ADMIN);
    } catch (error) {
      detailFailed = error instanceof ApiClientError && error.status === 501;
    }
    assert(detailFailed, 'getSubmittedPaymentDeclaration doit échouer en 501 tant que l’API ne l’expose pas');
  });

  return results;
}
