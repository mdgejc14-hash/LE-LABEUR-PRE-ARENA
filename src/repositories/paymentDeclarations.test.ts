/**
 * LE LABEUR — Phases 4A/4B — déclarations de paiement externe (côté EMPLOYEUR).
 *
 * Ces tests couvrent la création, lecture, liste, mise à jour des brouillons et
 * la transition DRAFT → SUBMITTED à travers le Repository existant (aucun
 * magasin de stockage parallèle). Le contrôle administratif n'est pas testé :
 * il n'est pas encore implémenté.
 */

import { MockService } from './mockRepository';
import { INITIAL_PAYMENT_DECLARATIONS } from './mockData';
import { ApiClientError } from './apiClient';
import { ApiRepository } from './apiRepository';
import { createLegacyApiRepositoryAdapter } from './legacyApiAdapter';
import { appRepositories } from './provider';
import { buildPaymentDeclarationPayload, type PaymentFormState } from '../screens/EmployerPaymentsScreen';
import {
  EXTERNAL_PAYMENT_METHODS,
  PAYMENT_DECLARATION_ADMIN_STATUSES,
  PaymentDeclaration,
  PaymentDeclarationInput,
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

const EMPLOYER = 'user-emp-1';
const OTHER_EMPLOYER = 'user-emp-2';
const CANDIDATE = 'user-cand-1';
const ADMIN = 'user-admin-1';

/** CTR-001 appartient à user-emp-1 ; CTR-003 à user-emp-2. */
const OWN_CONTRACT = 'CTR-001';
const FOREIGN_CONTRACT = 'CTR-003';

let sequence = 0;
function declarationInput(overrides: Partial<PaymentDeclarationInput> = {}): PaymentDeclarationInput {
  sequence += 1;
  return {
    contractId: OWN_CONTRACT,
    amount: 7500,
    paymentMethod: 'MOBILE_MONEY',
    transactionId: `TXN-MTN-20261005-${sequence}`,
    reference: `REF-LABEUR-CTR001-${sequence}`,
    paidAt: '2026-10-04T14:30:00.000Z',
    proofReference: `RECU-MTN-${sequence}`,
    comment: 'Règlement Mobile Money déclaré par l’employeur.',
    ...overrides,
  };
}

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
}

function assertCompleteDeclaration(declaration: PaymentDeclaration, expectedEmployer: string): void {
  assert(Boolean(declaration.paymentId), 'paymentId manquant');
  assert(declaration.employerId === expectedEmployer, 'employerId inattendu');
  assert(Boolean(declaration.contractId), 'contractId manquant');
  assert(Number.isFinite(declaration.amount) && declaration.amount > 0, 'amount invalide');
  assert(EXTERNAL_PAYMENT_METHODS.includes(declaration.paymentMethod), 'paymentMethod hors référentiel');
  assert(Boolean(declaration.transactionId), 'transactionId manquant');
  assert(Boolean(declaration.reference), 'reference manquante');
  assert(!Number.isNaN(new Date(declaration.paidAt).getTime()), 'paidAt invalide');
  assert(Boolean(declaration.proofDocumentId || declaration.proofReference), 'justificatif manquant');
  assert(Boolean(declaration.status), 'status manquant');
  assert(!Number.isNaN(new Date(declaration.createdAt).getTime()), 'createdAt invalide');
  assert(!Number.isNaN(new Date(declaration.updatedAt).getTime()), 'updatedAt invalide');
}

export async function runPaymentDeclarationTests(): Promise<PaymentDeclarationTestResult[]> {
  const results: PaymentDeclarationTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check('1. Abstraction Repository : les 5 opérations sont exposées par le bundle applicatif', () => {
    const operations = ['createPaymentDeclaration', 'getPaymentDeclaration', 'listEmployerPayments', 'updatePaymentDeclaration', 'submitPaymentDeclaration'] as const;
    for (const operation of operations) {
      assert(typeof appRepositories[operation] === 'function', `${operation} absent du bundle de repositories`);
      assert(typeof new MockService()[operation] === 'function', `${operation} absent du MockService`);
    }
  });

  await check('2. MODE DEMO : seed réaliste (un brouillon + une déclaration soumise)', async () => {
    const service = new MockService();
    const list = await service.listEmployerPayments(EMPLOYER, EMPLOYER);
    assert(list.length >= 2, `seed attendu >= 2 déclarations, reçu ${list.length}`);
    assert(list.some(item => item.status === 'DRAFT'), 'seed sans déclaration DRAFT');
    assert(list.some(item => item.status === 'SUBMITTED'), 'seed sans déclaration SUBMITTED');
    for (const declaration of list) assertCompleteDeclaration(declaration, EMPLOYER);
    assert(
      INITIAL_PAYMENT_DECLARATIONS.every(seed => seed.employerId === EMPLOYER && seed.contractId === OWN_CONTRACT),
      'le seed doit porter sur le contrat de l’employeur démo',
    );
  });

  await check('3. Création employeur : statut initial DRAFT, identifiant, devise et horodatage', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    assert(created.status === 'DRAFT', `statut initial attendu DRAFT, reçu ${created.status}`);
    assert(created.paymentId.startsWith('PDECL-'), `paymentId inattendu : ${created.paymentId}`);
    assert(created.employerId === EMPLOYER, 'employerId non dérivé de l’acteur');
    assert(created.currency === 'FCFA', 'devise du contrat non reprise');
    assert(created.submittedAt === undefined, 'un brouillon ne peut pas être horodaté comme soumis');
    assert(created.createdAt === created.updatedAt, 'createdAt et updatedAt doivent coïncider à la création');
    assertCompleteDeclaration(created, EMPLOYER);
    const reloaded = await service.getPaymentDeclaration(created.paymentId, EMPLOYER);
    assert(reloaded?.paymentId === created.paymentId, 'la déclaration créée doit être relisible');
  });

  await check('4. Liste « Mes paiements » : périmètre strict de l’employeur, tri du plus récent au plus ancien', async () => {
    const service = new MockService();
    const first = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    const second = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    const foreign = await service.createPaymentDeclaration(
      declarationInput({ contractId: FOREIGN_CONTRACT }),
      OTHER_EMPLOYER,
    );

    const list = await service.listEmployerPayments(EMPLOYER, EMPLOYER);
    assert(list.every(item => item.employerId === EMPLOYER), 'la liste contient une déclaration d’un autre employeur');
    assert(!list.some(item => item.paymentId === foreign.paymentId), 'déclaration étrangère exposée');
    assert(list.some(item => item.paymentId === first.paymentId) && list.some(item => item.paymentId === second.paymentId), 'déclarations propres absentes');
    const timestamps = list.map(item => new Date(item.createdAt).getTime());
    assert(timestamps.every((value, index) => index === 0 || value <= timestamps[index - 1]), 'liste non triée du plus récent au plus ancien');

    const foreignList = await service.listEmployerPayments(OTHER_EMPLOYER, OTHER_EMPLOYER);
    assert(foreignList.some(item => item.paymentId === foreign.paymentId), 'l’autre employeur ne retrouve pas sa déclaration');
  });

  await check('5. Mise à jour d’un brouillon : champs modifiés, statut conservé, updatedAt avancé', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    const updated = await service.updatePaymentDeclaration(created.paymentId, {
      amount: 8500,
      reference: 'REF-LABEUR-CTR001-CORRIGEE',
      comment: 'Montant corrigé après vérification du reçu.',
    }, EMPLOYER);

    assert(updated.amount === 8500, 'montant non mis à jour');
    assert(updated.reference === 'REF-LABEUR-CTR001-CORRIGEE', 'référence non mise à jour');
    assert(updated.comment === 'Montant corrigé après vérification du reçu.', 'commentaire non mis à jour');
    assert(updated.status === 'DRAFT', 'une mise à jour employeur ne doit pas changer le statut');
    assert(updated.submittedAt === undefined, 'submittedAt ne doit pas être rempli par l’employeur');
    assert(new Date(updated.updatedAt).getTime() >= new Date(created.createdAt).getTime(), 'updatedAt non avancé');
    assert(updated.transactionId === created.transactionId, 'les champs non fournis doivent être conservés');
    const reloaded = await service.getPaymentDeclaration(created.paymentId, EMPLOYER);
    assert(reloaded?.amount === 8500, 'mise à jour non relisible');
  });

  await check('6. Déclaration déjà soumise : verrouillée côté employeur', async () => {
    const service = new MockService();
    const submitted = (await service.listEmployerPayments(EMPLOYER, EMPLOYER)).find(item => item.status === 'SUBMITTED');
    assert(submitted, 'seed sans déclaration SUBMITTED');
    assert(await expectReject(
      () => service.updatePaymentDeclaration(submitted!.paymentId, { amount: 1 }, EMPLOYER),
      'brouillon',
    ), 'une déclaration soumise ne doit plus être modifiable par l’employeur');
  });

  await check('7. Propriété : un autre employeur ne peut ni lire ni modifier', async () => {
    const service = new MockService();
    const created = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    assert(await expectReject(() => service.getPaymentDeclaration(created.paymentId, OTHER_EMPLOYER), 'non autorisée'), 'lecture croisée autorisée');
    assert(await expectReject(() => service.updatePaymentDeclaration(created.paymentId, { amount: 1 }, OTHER_EMPLOYER), 'non autorisée'), 'modification croisée autorisée');
    assert(await expectReject(() => service.listEmployerPayments(EMPLOYER, OTHER_EMPLOYER), 'non autorisée'), 'liste d’un employeur tiers autorisée');
  });

  await check('8. Rôles hors périmètre employeur : échec fermé (candidat, admin, acteur inconnu)', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput(), CANDIDATE), 'EMPLOYER'), 'un candidat peut créer une déclaration');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput(), ADMIN), 'EMPLOYER'), 'un admin peut créer une déclaration employeur');
    assert(await expectReject(() => service.listEmployerPayments(EMPLOYER, CANDIDATE), 'non autorisée'), 'un candidat peut lister les paiements d’un employeur');
    assert(await expectReject(() => service.listEmployerPayments(EMPLOYER, ADMIN), 'non autorisée'), 'un admin peut lister les paiements d’un employeur (étape suivante)');
    assert(await expectReject(() => service.submitPaymentDeclaration('PDECL-DEMO-0002', CANDIDATE), 'EMPLOYER'), 'un candidat peut soumettre une déclaration');
    assert(await expectReject(() => service.submitPaymentDeclaration('PDECL-DEMO-0002', ADMIN), 'EMPLOYER'), 'un admin peut soumettre une déclaration employeur (hors périmètre)');
    assert(await expectReject(() => service.listEmployerPayments(EMPLOYER, ''), 'actorId'), 'actorId vide accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput(), 'user-inconnu'), 'introuvable'), 'acteur inconnu accepté');
  });

  await check('9. Contrat : inexistant ou appartenant à un autre employeur = refus', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ contractId: 'CTR-999' }), EMPLOYER), 'Contrat introuvable'), 'contrat inexistant accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ contractId: '' }), EMPLOYER), 'obligatoire'), 'contrat vide accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ contractId: FOREIGN_CONTRACT }), EMPLOYER), 'non autorisée'), 'contrat d’un autre employeur accepté');
  });

  await check('10. Validation des champs saisis (montant, moyen, transaction, référence, date, justificatif)', async () => {
    const service = new MockService();
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ amount: 0 }), EMPLOYER), 'supérieur à zéro'), 'montant nul accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ amount: -500 }), EMPLOYER), 'supérieur à zéro'), 'montant négatif accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ amount: 7500.5 }), EMPLOYER), 'entier'), 'montant non entier accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ paymentMethod: 'BITCOIN' as never }), EMPLOYER), 'Moyen de paiement'), 'moyen de paiement inconnu accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ transactionId: '   ' }), EMPLOYER), 'transaction'), 'ID de transaction vide accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ reference: '' }), EMPLOYER), 'référence'), 'référence vide acceptée');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ paidAt: '2026-13-45T99:99' }), EMPLOYER), 'invalide'), 'date invalide acceptée');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ paidAt: '2099-01-01T10:00:00.000Z' }), EMPLOYER), 'futur'), 'paiement daté dans le futur accepté');
    assert(await expectReject(() => service.createPaymentDeclaration(declarationInput({ proofDocumentId: undefined, proofReference: undefined }), EMPLOYER), 'justificatif'), 'déclaration sans justificatif acceptée');
  });

  await check('11. Justificatif : document OU référence, les deux formes sont acceptées', async () => {
    const service = new MockService();
    const byReference = await service.createPaymentDeclaration(declarationInput({ proofDocumentId: undefined, proofReference: 'RECU-MTN-0001' }), EMPLOYER);
    assert(byReference.proofReference === 'RECU-MTN-0001' && byReference.proofDocumentId === undefined, 'justificatif par référence mal enregistré');
    const byDocument = await service.createPaymentDeclaration(declarationInput({ proofDocumentId: 'DOC-REC-0002', proofReference: undefined }), EMPLOYER);
    assert(byDocument.proofDocumentId === 'DOC-REC-0002' && byDocument.proofReference === undefined, 'justificatif par document mal enregistré');
  });

  await check('12. Idempotence : une même clé ne crée pas de doublon, un payload différent est refusé', async () => {
    const service = new MockService();
    const input = declarationInput();
    const first = await service.createPaymentDeclaration(input, EMPLOYER, 'idem-paiement-001');
    const replay = await service.createPaymentDeclaration(input, EMPLOYER, 'idem-paiement-001');
    assert(first.paymentId === replay.paymentId, 'rejeu idempotent : paymentId différent');
    const list = await service.listEmployerPayments(EMPLOYER, EMPLOYER);
    assert(list.filter(item => item.paymentId === first.paymentId).length === 1, 'rejeu idempotent : doublon créé');
    assert(await expectReject(
      () => service.createPaymentDeclaration(declarationInput({ amount: 9999 }), EMPLOYER, 'idem-paiement-001'),
      'idempotence',
    ), 'une clé d’idempotence réutilisée avec un autre payload doit être refusée');
  });

  await check('13. Persistance : un seul magasin, celui du Repository (aucun stockage parallèle)', async () => {
    const storage = new MemoryStorage();
    const globalRef = globalThis as unknown as { localStorage?: unknown };
    const previous = globalRef.localStorage;
    globalRef.localStorage = storage;
    try {
      const service = new MockService();
      const created = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
      const raw = storage.getItem('lelabeur_v5_payment_declarations');
      assert(raw !== null, 'aucune persistance dans le magasin du Repository');
      assert(raw!.includes(created.paymentId), 'déclaration absente du magasin persisté');
      const storedIds = (JSON.parse(raw!) as PaymentDeclaration[]).map(item => item.paymentId);
      assert(storedIds.includes(created.paymentId), 'magasin persisté incohérent avec la création');

      // Rechargement : une nouvelle instance du même Repository retrouve la donnée.
      const reloaded = new MockService();
      const list = await reloaded.listEmployerPayments(EMPLOYER, EMPLOYER);
      assert(list.some(item => item.paymentId === created.paymentId), 'déclaration perdue au rechargement');
      const beforeUpdate = (await reloaded.getPaymentDeclaration(created.paymentId, EMPLOYER))!;
      await reloaded.updatePaymentDeclaration(created.paymentId, { amount: 6400 }, EMPLOYER);
      const persistedAfterUpdate = JSON.parse(storage.getItem('lelabeur_v5_payment_declarations')!) as PaymentDeclaration[];
      const persisted = persistedAfterUpdate.find(item => item.paymentId === created.paymentId);
      assert(persisted?.amount === 6400, 'mise à jour non persistée dans le magasin du Repository');
      assert(beforeUpdate.amount === 7500, 'état initial inattendu avant mise à jour');
    } finally {
      if (previous === undefined) delete globalRef.localStorage;
      else globalRef.localStorage = previous;
    }
  });

  await check('14. Périmètre : les statuts administratifs sont préparés mais jamais produits par l’employeur', async () => {
    const service = new MockService();
    const expected = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMITTED'];
    assert(expected.every(status => PAYMENT_DECLARATION_ADMIN_STATUSES.includes(status as never)), 'statuts administratifs manquants du modèle');
    const created = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    await service.updatePaymentDeclaration(created.paymentId, { amount: 7600 }, EMPLOYER);
    const list = await service.listEmployerPayments(EMPLOYER, EMPLOYER);
    assert(
      list.every(item => ['DRAFT', 'SUBMITTED'].includes(item.status)),
      'le parcours employeur ne doit produire que DRAFT ou SUBMITTED à cette étape',
    );
  });

  await check('15. MODE API : les nouvelles opérations échouent fermement, sans repli sur le mock', async () => {
    const adapter = createLegacyApiRepositoryAdapter({} as ApiRepository);
    const input = declarationInput();
    let createFailed = false;
    try {
      await adapter.createPaymentDeclaration(input, EMPLOYER);
    } catch (error) {
      createFailed = error instanceof ApiClientError && error.status === 501;
    }
    assert(createFailed, 'createPaymentDeclaration doit échouer en 501 tant que l’API ne l’expose pas');

    let listFailed = false;
    try {
      await adapter.listEmployerPayments(EMPLOYER, EMPLOYER);
    } catch (error) {
      listFailed = error instanceof ApiClientError && error.status === 501;
    }
    assert(listFailed, 'listEmployerPayments doit échouer en 501 tant que l’API ne l’expose pas');

    let submitFailed = false;
    try {
      await adapter.submitPaymentDeclaration('PDECL-API-001', EMPLOYER);
    } catch (error) {
      submitFailed = error instanceof ApiClientError && error.status === 501;
    }
    assert(submitFailed, 'submitPaymentDeclaration doit échouer en 501 tant que l’API ne l’expose pas');
  });


  await check('16. Parcours employeur : formulaire → enregistrement → liste « Mes Paiements »', async () => {
    const service = new MockService();
    // Saisie telle qu'elle sort des champs de l'écran (texte, espaces inclus).
    const form: PaymentFormState = {
      contractId: OWN_CONTRACT,
      amount: '7500',
      paymentMethod: 'MOBILE_MONEY',
      transactionId: '  TXN-MTN-20261005-7777 ',
      reference: ' REF-LABEUR-CTR001-M1 ',
      paymentDate: '2026-10-05',
      paymentTime: '09:15',
      proofDocumentId: '',
      proofReference: 'RECU-MTN-7777',
      comment: '  Règlement du Mois 1. ',
    };

    const payload = buildPaymentDeclarationPayload(form);
    assert(payload.amount === 7500, `montant texte non converti : ${payload.amount}`);
    assert(payload.transactionId === 'TXN-MTN-20261005-7777', 'ID de transaction non nettoyé');
    assert(payload.reference === 'REF-LABEUR-CTR001-M1', 'référence non nettoyée');
    assert(payload.proofDocumentId === undefined && payload.proofReference === 'RECU-MTN-7777', 'justificatif mal converti');
    assert(payload.comment === 'Règlement du Mois 1.', 'commentaire non nettoyé');
    assert(payload.paidAt === new Date('2026-10-05T09:15:00').toISOString(), `date/heure mal convertie : ${payload.paidAt}`);

    const saved = await service.createPaymentDeclaration(payload, EMPLOYER);
    assert(saved.status === 'DRAFT', `enregistrement : statut attendu DRAFT, reçu ${saved.status}`);

    const list = await service.listEmployerPayments(EMPLOYER, EMPLOYER);
    assert(list.some(item => item.paymentId === saved.paymentId), 'la déclaration enregistrée est absente de « Mes Paiements »');
    assert(list[0].paymentId === saved.paymentId, 'la dernière déclaration doit apparaître en tête de liste');

    const edited = await service.updatePaymentDeclaration(
      saved.paymentId,
      buildPaymentDeclarationPayload({ ...form, amount: '8000', reference: 'REF-LABEUR-CTR001-M1-BIS' }),
      EMPLOYER,
    );
    assert(edited.amount === 8000 && edited.reference === 'REF-LABEUR-CTR001-M1-BIS', 'modification depuis le formulaire non appliquée');
  });

  await check('17. Soumission réussie : le propriétaire fait passer DRAFT à SUBMITTED avec submittedAt', async () => {
    const service = new MockService();
    const draft = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    const submitted = await service.submitPaymentDeclaration(draft.paymentId, EMPLOYER);

    assert(submitted.status === 'SUBMITTED', `statut attendu SUBMITTED, reçu ${submitted.status}`);
    assert(submitted.employerId === EMPLOYER, 'la soumission doit rester attachée à son employeur propriétaire');
    assert(Boolean(submitted.submittedAt), 'submittedAt doit être renseigné lors de la soumission');
    assert(!Number.isNaN(new Date(submitted.submittedAt!).getTime()), 'submittedAt doit être un horodatage valide');
    assert(submitted.updatedAt === submitted.submittedAt, 'updatedAt doit refléter la soumission');
  });

  await check('18. Un autre employeur ne peut pas soumettre le paiement du propriétaire', async () => {
    const service = new MockService();
    const draft = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    assert(await expectReject(
      () => service.submitPaymentDeclaration(draft.paymentId, OTHER_EMPLOYER),
      'étrangère',
    ), 'un autre employeur a pu soumettre la déclaration');
    const unchanged = await service.getPaymentDeclaration(draft.paymentId, EMPLOYER);
    assert(unchanged?.status === 'DRAFT' && unchanged.submittedAt === undefined, 'la déclaration a changé après le refus');
  });

  await check('19. Une déclaration inexistante ne peut pas être soumise', async () => {
    const service = new MockService();
    assert(await expectReject(
      () => service.submitPaymentDeclaration('PDECL-INEXISTANT', EMPLOYER),
      'introuvable',
    ), 'un paiement inexistant a été accepté');
  });

  await check('20. Une déclaration déjà SUBMITTED ne peut pas être soumise une seconde fois', async () => {
    const service = new MockService();
    const draft = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    const firstSubmission = await service.submitPaymentDeclaration(draft.paymentId, EMPLOYER);
    assert(await expectReject(
      () => service.submitPaymentDeclaration(draft.paymentId, EMPLOYER),
      'brouillon',
    ), 'une deuxième soumission a été acceptée');
    const persistedState = await service.getPaymentDeclaration(draft.paymentId, EMPLOYER);
    assert(persistedState?.status === 'SUBMITTED', 'la déclaration n’est plus SUBMITTED après le refus');
    assert(persistedState?.submittedAt === firstSubmission.submittedAt, 'le premier horodatage de soumission a été écrasé');
  });

  await check('21. Un statut autre que DRAFT refuse la transition vers SUBMITTED', async () => {
    const storage = new MemoryStorage();
    const globalRef = globalThis as unknown as { localStorage?: unknown };
    const previous = globalRef.localStorage;
    globalRef.localStorage = storage;
    try {
      const service = new MockService();
      const draft = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
      const declarations = JSON.parse(storage.getItem('lelabeur_v5_payment_declarations')!) as PaymentDeclaration[];
      const changed = declarations.find(item => item.paymentId === draft.paymentId);
      assert(changed, 'déclaration absente du dépôt avant préparation de l’état de test');
      changed.status = 'UNDER_REVIEW';
      storage.setItem('lelabeur_v5_payment_declarations', JSON.stringify(declarations));

      const serviceWithOtherState = new MockService();
      assert(await expectReject(
        () => serviceWithOtherState.submitPaymentDeclaration(draft.paymentId, EMPLOYER),
        'brouillon',
      ), 'un statut UNDER_REVIEW a accepté la transition employeur');
      const unchanged = await serviceWithOtherState.getPaymentDeclaration(draft.paymentId, EMPLOYER);
      assert(unchanged?.status === 'UNDER_REVIEW', 'le statut non DRAFT a été altéré');
    } finally {
      if (previous === undefined) delete globalRef.localStorage;
      else globalRef.localStorage = previous;
    }
  });

  await check('22. Après soumission, la modification normale du brouillon est refusée', async () => {
    const service = new MockService();
    const draft = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
    await service.submitPaymentDeclaration(draft.paymentId, EMPLOYER);
    assert(await expectReject(
      () => service.updatePaymentDeclaration(draft.paymentId, { amount: 1 }, EMPLOYER),
      'brouillon',
    ), 'une déclaration soumise a été modifiable');
    const unchanged = await service.getPaymentDeclaration(draft.paymentId, EMPLOYER);
    assert(unchanged?.status === 'SUBMITTED' && unchanged.amount === draft.amount, 'les données soumises ont été modifiées');
  });

  await check('23. Le statut SUBMITTED et submittedAt persistent dans le dépôt du Repository', async () => {
    const storage = new MemoryStorage();
    const globalRef = globalThis as unknown as { localStorage?: unknown };
    const previous = globalRef.localStorage;
    globalRef.localStorage = storage;
    try {
      const service = new MockService();
      const draft = await service.createPaymentDeclaration(declarationInput(), EMPLOYER);
      const submitted = await service.submitPaymentDeclaration(draft.paymentId, EMPLOYER);
      const stored = JSON.parse(storage.getItem('lelabeur_v5_payment_declarations')!) as PaymentDeclaration[];
      const persisted = stored.find(item => item.paymentId === draft.paymentId);
      assert(persisted?.status === 'SUBMITTED', 'le dépôt ne contient pas le statut SUBMITTED');
      assert(persisted?.submittedAt === submitted.submittedAt, 'submittedAt non persisté');

      const reloaded = new MockService();
      const reloadedDeclaration = await reloaded.getPaymentDeclaration(draft.paymentId, EMPLOYER);
      assert(reloadedDeclaration?.status === 'SUBMITTED', 'la nouvelle instance Repository n’a pas relu SUBMITTED');
      assert(reloadedDeclaration?.submittedAt === submitted.submittedAt, 'la nouvelle instance Repository n’a pas relu submittedAt');
    } finally {
      if (previous === undefined) delete globalRef.localStorage;
      else globalRef.localStorage = previous;
    }
  });

  return results;
}
