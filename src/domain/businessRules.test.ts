import {
  calculateFirstMonthCommission,
  calculateFirstMonthEmployeeShare,
  calculateLaterMonthCommission,
  calculateLaterMonthEmployeeShare,
  buildPaymentSchedule,
  parseContractStartDate,
} from './businessRules';
import { mockService } from '../repositories/mockRepository';
import { getBeninLocationCoverage, searchBeninLocations } from '../data/beninLocations';

export interface TestResult {
  id: number;
  name: string;
  success: boolean;
  details?: string;
}

async function createFreshTestContract(startDate: string, titleSuffix: string): Promise<{ id: string; employeeId: string; employerId: string }> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const offer = await mockService.createOffer({
    title: `QA Contract ${titleSuffix} ${suffix}`,
    employerId: 'user-emp-1',
    employerName: 'IGNORED',
    employerLocation: 'Cotonou',
    contractType: 'Mission',
    remuneration: 100000,
    currency: 'FCFA',
    location: 'Cotonou',
    skills: ['QA'],
    summary: 'Contrat isolé pour test métier',
    responsibilities: ['QA'],
    conditions: ['Test'],
    selectionProcess: ['Direct'],
    durationMonths: 3
  }, 'user-emp-1');

  const application = await mockService.applyToOffer(offer.id, 'user-cand-8');
  await mockService.examineApplication(application.id, 'user-emp-1');
  await mockService.shortlistApplication(application.id, 'user-emp-1');

  const contract = await mockService.generateContract({
    offerId: offer.id,
    applicationId: application.id,
    employerId: 'user-emp-1',
    employerName: 'IGNORED',
    employeeId: 'user-cand-8',
    employeeName: 'IGNORED',
    jobTitle: offer.title,
    missionDescription: 'Contrat isolé pour test métier',
    location: 'Cotonou',
    startDate,
    durationMonths: 3,
    monthlySalary: 100000,
    periodicity: 'Mensuel',
    conditions: ['Test']
  }, 'user-emp-1');

  await mockService.signContract(contract.id, 'EMPLOYEE', 'user-cand-8');
  const active = await mockService.getContractById(contract.id);
  if (!active || active.status !== 'ACTIVE') throw new Error('Contrat QA non activé.');

  // Rebuild from the isolated contract date so no seeded payment record can affect the test.
  active.startDate = startDate;
  active.paymentSchedule = [];
  return { id: active.id, employeeId: active.employeeId, employerId: active.employerId };
}

async function loginAs(userId: string): Promise<void> {
  const credentials: Record<string, { email: string; role: 'ADMIN' | 'EMPLOYER' | 'CANDIDATE' }> = {
    'user-admin-1': { email: 'admin.benin@lelabeur.bj', role: 'ADMIN' },
    'user-emp-1': { email: 'reine.houenou@bois-agencement.bj', role: 'EMPLOYER' },
    'user-emp-2': { email: 'jb.soglo@batisseurs-golfe.bj', role: 'EMPLOYER' },
    'user-cand-1': { email: 'amina.dossou@lelabeur.bj', role: 'CANDIDATE' },
    'user-cand-8': { email: 'modeste.kpadonou@lelabeur.bj', role: 'CANDIDATE' },
  };
  const credential = credentials[userId];
  if (!credential) throw new Error(`Utilisateur de test non configuré : ${userId}`);
  const session = await mockService.login(credential.email, credential.role);
  if (session.id !== userId) throw new Error(`Session QA inattendue : ${session.id} au lieu de ${userId}.`);
}

async function expectReject(action: () => Promise<unknown>, matcher?: string | RegExp): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error: any) {
    const message = String(error?.message || error);
    return matcher ? (matcher instanceof RegExp ? matcher.test(message) : message.includes(matcher)) : true;
  }
}

export async function runAllDeterministicTests(): Promise<{ passed: boolean; results: TestResult[] }> {
  const results: TestResult[] = [];
  mockService.resetAllData();

  const push = (id: number, name: string, success: boolean, details: string) => {
    results.push({ id, name, success, details });
  };

  // 1. Auth role lock
  try {
    const candidate = await mockService.login('amina.dossou@lelabeur.bj', 'CANDIDATE');
    push(1, 'TEST 1 : Candidat connecté -> rôle verrouillé', candidate.role === 'CANDIDATE', `Rôle: ${candidate.role}`);
  } catch (err: any) {
    push(1, 'TEST 1 : Candidat connecté -> rôle verrouillé', false, err.message);
  }

  // 2. Wrong login role rejected
  try {
    const blocked = await expectReject(
      () => mockService.login('amina.dossou@lelabeur.bj', 'EMPLOYER'),
      'rôle sélectionné'
    );
    push(2, 'TEST 2 : Compte existant -> changement de rôle refusé', blocked, 'Tentative de changement de rôle bloquée.');
  } catch (err: any) {
    push(2, 'TEST 2 : Compte existant -> changement de rôle refusé', false, err.message);
  }

  // 3. Logout clears session
  try {
    await mockService.logout();
    push(3, 'TEST 3 : Déconnexion -> session supprimée', mockService.getCurrentUser() === null, 'Session vide.');
  } catch (err: any) {
    push(3, 'TEST 3 : Déconnexion -> session supprimée', false, err.message);
  }

  // 4. Contracts exist and include schedule
  try {
    const contracts = await mockService.getAllContracts('user-admin-1');
    const pass = contracts.length > 0 && contracts.every(c => Array.isArray(c.paymentSchedule) && c.paymentSchedule.length === c.durationMonths);
    push(4, 'TEST 4 : Contrats -> calendrier de paiements matérialisé', pass, `${contracts.length} contrat(s), calendriers générés.`);
  } catch (err: any) {
    push(4, 'TEST 4 : Contrats -> calendrier de paiements matérialisé', false, err.message);
  }

  // 5. Employer scoping
  try {
    await loginAs('user-emp-1');
    const contracts = await mockService.getContractsByUser('user-emp-1', 'EMPLOYER');
    push(5, 'TEST 5 : Employeur -> isolation stricte des contrats', contracts.every(c => c.employerId === 'user-emp-1'), `${contracts.length} contrat(s) visibles.`);
  } catch (err: any) {
    push(5, 'TEST 5 : Employeur -> isolation stricte des contrats', false, err.message);
  }

  // 6. Candidate scoping
  try {
    await loginAs('user-cand-1');
    const contracts = await mockService.getContractsByUser('user-cand-1', 'CANDIDATE');
    push(6, 'TEST 6 : Candidat -> isolation stricte des contrats', contracts.every(c => c.employeeId === 'user-cand-1'), `${contracts.length} contrat(s) visibles.`);
  } catch (err: any) {
    push(6, 'TEST 6 : Candidat -> isolation stricte des contrats', false, err.message);
  }

  // 7. M1 direct termination blocked
  try {
    const ctr = await mockService.getContractById('CTR-001');
    if (ctr) ctr.currentMonth = 1;
    const blocked = await expectReject(
      () => mockService.dissociateMonth2('CTR-001', 'Arrêt direct en M1', 'user-emp-1', 'EMPLOYER'),
      /premier mois \(M1\)/
    );
    push(7, 'TEST 7 : Contrat M1 -> rupture directe bloquée', blocked, 'La protection M1 est active.');
  } catch (err: any) {
    push(7, 'TEST 7 : Contrat M1 -> rupture directe bloquée', false, err.message);
  }

  // 8. M2 dissociation requires real actor role
  try {
    const ctr = await mockService.getContractById('CTR-002');
    if (ctr) ctr.currentMonth = 2;
    const wrongRoleBlocked = await expectReject(
      () => mockService.dissociateMonth2('CTR-002', 'Tentative', 'user-emp-4', 'CANDIDATE'),
      'actorRole'
    );
    const valid = await mockService.dissociateMonth2('CTR-002', 'Fin de mission convenue', 'user-emp-4', 'EMPLOYER');
    push(8, 'TEST 8 : M2 -> actorId + actorRole + ownership vérifiés', wrongRoleBlocked && valid.status === 'TERMINATED', `Statut final: ${valid.status}`);
  } catch (err: any) {
    push(8, 'TEST 8 : M2 -> actorId + actorRole + ownership vérifiés', false, err.message);
  }

  // 9. Offer values used by generation UI
  try {
    const offer = await mockService.getOfferById('OFFER-001');
    push(9, 'TEST 9 : Offre sélectionnée -> données de référence intactes', Boolean(offer && offer.title && offer.remuneration > 0 && (offer.durationMonths ?? 0) > 0), `${offer?.title || 'inconnue'}`);
  } catch (err: any) {
    push(9, 'TEST 9 : Offre sélectionnée -> données de référence intactes', false, err.message);
  }

  // 10. Offer ownership
  try {
    const blocked = await expectReject(() => mockService.generateContract({
      offerId: 'OFFER-004', applicationId: 'APP-004', employerId: 'user-emp-1', employerName: 'Reine Houénou',
      employeeId: 'user-cand-5', employeeName: 'Christian Zannou', jobTitle: 'Test', missionDescription: 'Test',
      location: 'Porto-Novo', startDate: '2026-10-15', durationMonths: 3, monthlySalary: 50000,
      periodicity: 'Mensuel', conditions: []
    }, 'user-emp-1'), 'vous ne possédez');
    push(10, 'TEST 10 : Employeur -> offre d’un tiers inaccessible', blocked, 'Ownership de l’offre respecté.');
  } catch (err: any) {
    push(10, 'TEST 10 : Employeur -> offre d’un tiers inaccessible', false, err.message);
  }

  // 11. Generate from shortlisted application only
  let testCreatedContractId = '';
  try {
    const testOffer = await mockService.createOffer({
      title: 'Maçon Finisseur Test', employerId: 'user-emp-1', employerName: 'Atelier Bois & Agencement Bénin',
      employerLocation: 'Cotonou', contractType: 'Mission', remuneration: 120000, currency: 'FCFA', location: 'Cotonou',
      skills: ['Maçonnerie'], summary: 'Mission maçonnerie test', responsibilities: ['Maçonnerie'], conditions: ['Règlement garanti'],
      selectionProcess: ['Direct'], durationMonths: 3
    }, 'user-emp-1');
    const app = await mockService.applyToOffer(testOffer.id, 'user-cand-8');
    await mockService.examineApplication(app.id, 'user-emp-1');
    await mockService.shortlistApplication(app.id, 'user-emp-1');
    const contract = await mockService.generateContract({
      offerId: testOffer.id, applicationId: app.id, employerId: 'user-emp-1', employerName: 'Reine Houénou',
      employeeId: 'user-cand-8', employeeName: 'Modeste Kpadonou', jobTitle: 'Maçon Finisseur Test',
      missionDescription: 'Mission maçonnerie test', location: 'Cotonou', startDate: '15/10/2026', durationMonths: 3,
      monthlySalary: 120000, periodicity: 'Mensuel', conditions: ['EPI fournis']
    }, 'user-emp-1');
    testCreatedContractId = contract.id;
    push(11, 'TEST 11 : Contrat créé -> SIGNATURE et calendrier planifié', contract.status === 'SIGNATURE' && contract.employeeSigned === false && contract.paymentSchedule[0]?.commissionStatus === 'SCHEDULED', `Statut: ${contract.status}`);
  } catch (err: any) {
    push(11, 'TEST 11 : Contrat créé -> SIGNATURE et calendrier planifié', false, err.message);
  }

  // 12. Candidate signature activates contract
  try {
    const signed = await mockService.signContract(testCreatedContractId, 'EMPLOYEE', 'user-cand-8');
    push(12, 'TEST 12 : Signature salarié -> contrat ACTIVE', signed.status === 'ACTIVE' && signed.employeeSigned === true, `Statut: ${signed.status}`);
  } catch (err: any) {
    push(12, 'TEST 12 : Signature salarié -> contrat ACTIVE', false, err.message);
  }

  // 13. Active contract keeps application trace
  try {
    const contract = await mockService.getContractById(testCreatedContractId);
    const app = contract?.applicationId ? (await mockService.getAllApplications('user-admin-1')).find(a => a.id === contract.applicationId) : undefined;
    push(13, 'TEST 13 : Activation -> candidature retenue conservée dans l’historique', contract?.status === 'ACTIVE' && app?.status === 'HIRED', `Application: ${app?.status}`);
  } catch (err: any) {
    push(13, 'TEST 13 : Activation -> candidature retenue conservée dans l’historique', false, err.message);
  }

  // 14. Offer filled after activation
  try {
    const contract = await mockService.getContractById(testCreatedContractId);
    const offer = contract ? await mockService.getOfferById(contract.offerId) : null;
    push(14, 'TEST 14 : Activation -> offre FILLED', offer?.status === 'FILLED', `Offre: ${offer?.status}`);
  } catch (err: any) {
    push(14, 'TEST 14 : Activation -> offre FILLED', false, err.message);
  }

  // 15. Filled offer hidden from search
  try {
    const contract = await mockService.getContractById(testCreatedContractId);
    const results = await mockService.searchOffers({ searchQuery: 'Maçon Finisseur Test', location: '', departmentId: '', communeId: '', arrondissementId: '', localityId: '', contractType: '', minSalary: 0, availability: '', remoteOption: 'ALL', selectedSkills: [], selectedDomain: '', selectedJob: '' });
    push(15, 'TEST 15 : Offre FILLED -> invisible dans Discover', !results.some(o => o.id === contract?.offerId), `Trouvée dans Discover: ${results.some(o => o.id === contract?.offerId)}`);
  } catch (err: any) {
    push(15, 'TEST 15 : Offre FILLED -> invisible dans Discover', false, err.message);
  }

  // 16. Employer keeps offer history
  try {
    const contract = await mockService.getContractById(testCreatedContractId);
    await loginAs('user-emp-1');
    const history = await mockService.getOffersByEmployer('user-emp-1');
    push(16, 'TEST 16 : Offre FILLED -> historique employeur conservé', history.some(o => o.id === contract?.offerId), 'Offre conservée côté employeur.');
  } catch (err: any) {
    push(16, 'TEST 16 : Offre FILLED -> historique employeur conservé', false, err.message);
  }

  // 17. Contract conversation and message card are scoped
  try {
    await loginAs('user-emp-1');
    const convs = await mockService.getConversations('user-emp-1');
    const conv = convs.find(c => c.contextType === 'CONTRACT' && c.contextRefId === testCreatedContractId);
    const msgs = conv ? await mockService.getMessages(conv.id, 'user-emp-1') : [];
    const pass = Boolean(conv && msgs.some(m => m.proposal?.contractId === testCreatedContractId));
    push(17, 'TEST 17 : Contrat -> conversation dédiée et carte contrat', pass, `Conversation trouvée: ${Boolean(conv)}`);
  } catch (err: any) {
    push(17, 'TEST 17 : Contrat -> conversation dédiée et carte contrat', false, err.message);
  }

  // 18. Contract notification
  try {
    await loginAs('user-cand-8');
    const notifs = await mockService.getNotifications('user-cand-8');
    const pass = notifs.some(n => n.type === 'CONTRACT_PENDING_SIGNATURE' || n.type === 'CONTRACT_ACTIVE');
    push(18, 'TEST 18 : Candidat -> notification contrat', pass, `Notification reçue: ${pass}`);
  } catch (err: any) {
    push(18, 'TEST 18 : Candidat -> notification contrat', false, err.message);
  }

  // 19. No offer fallback
  try {
    const blocked = await expectReject(() => mockService.generateContract({
      offerId: '', applicationId: 'APP-001', employerId: 'user-emp-1', employerName: 'Reine Houénou', employeeId: 'user-cand-1',
      employeeName: 'Amina Dossou', jobTitle: 'Sans offre', missionDescription: 'Test', location: 'Cotonou', startDate: '2026-10-15',
      durationMonths: 3, monthlySalary: 50000, periodicity: 'Mensuel', conditions: []
    }, 'user-emp-1'), 'offerId');
    push(19, 'TEST 19 : Aucun fallback offerId', blocked, 'offerId vide rejeté.');
  } catch (err: any) {
    push(19, 'TEST 19 : Aucun fallback offerId', false, err.message);
  }

  // 20. Public candidate IDs unique
  try {
    const candidates = await mockService.getAllCandidates();
    const ids = candidates.map(c => c.publicId);
    const pass = ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => /^LAB-C-\d{6}$/.test(id));
    push(20, 'TEST 20 : ID public candidat unique', pass, `${ids.length} identifiant(s) vérifiés.`);
  } catch (err: any) {
    push(20, 'TEST 20 : ID public candidat unique', false, err.message);
  }

  // 21. Unauthorized contract signature
  try {
    const created = await mockService.generateContract({
      offerId: 'OFFER-003',
      applicationId: 'APP-003',
      employerId: 'user-emp-3',
      employerName: 'Employeur Test',
      employeeId: 'user-cand-3',
      employeeName: 'Yasmine Hounkpatin',
      jobTitle: 'Gouvernante de Maison',
      missionDescription: 'Test de contrôle de signature.',
      location: 'Cotonou',
      startDate: '15 Octobre 2026',
      durationMonths: 3,
      monthlySalary: 30000,
      periodicity: 'Mensuel',
      conditions: []
    }, 'user-emp-3');
    const blocked = await expectReject(() => mockService.signContract(created.id, 'EMPLOYEE', 'user-cand-6'), 'non autorisée');
    push(21, 'TEST 21 : Signature -> ownership obligatoire', blocked, 'Signature d’un autre salarié bloquée.');
  } catch (err: any) {
    push(21, 'TEST 21 : Signature -> ownership obligatoire', false, err.message);
  }

  // Extra regression assertions for the final phase.
  try {
    const schedule = buildPaymentSchedule({ contractId: 'TEST', startDate: '15/10/2026', durationMonths: 3, monthlySalary: 30000, currency: 'FCFA' });
    const pass = schedule[0]?.salaryDueDate === '2026-11-15' && schedule[1]?.salaryDueDate === '2026-12-15' && schedule[2]?.salaryDueDate === '2027-01-15' && schedule[0]?.commissionAmount === 7500 && schedule[1]?.commissionAmount === 0;
    push(22, 'TEST 22 : Calendrier -> échéances dérivées de la date de début', pass, schedule.map(s => `${s.monthNumber}:${s.salaryDueDate}`).join(', '));
  } catch (err: any) {
    push(22, 'TEST 22 : Calendrier -> échéances dérivées de la date de début', false, err.message);
  }

  try {
    const blocked = await expectReject(() => mockService.sendMessage('CONV-001', 'attaque', 'user-cand-6', 'CANDIDATE'), 'Action non autorisée');
    push(23, 'TEST 23 : Messagerie -> non-participant refusé', blocked, 'Écriture hors conversation bloquée.');
  } catch (err: any) {
    push(23, 'TEST 23 : Messagerie -> non-participant refusé', false, err.message);
  }

  try {
    const blocked = await expectReject(() => mockService.sendAudioMessage('CONV-001', 61, 'user-cand-1', 'CANDIDATE'), '60 secondes');
    push(24, 'TEST 24 : Vocal -> maximum 60 secondes', blocked, 'Durée excessive refusée.');
  } catch (err: any) {
    push(24, 'TEST 24 : Vocal -> maximum 60 secondes', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const notif = await mockService.createNotification({ recipientId: 'user-cand-1', type: 'NEW_MESSAGE', title: 'QA', message: 'QA', linkRef: { screen: 'MESSAGES' } });
    await mockService.markAsRead(notif.id, 'user-cand-1');
    const blocked = await expectReject(() => mockService.markAllAsRead('user-cand-1', 'user-cand-2'), 'vos propres notifications');
    push(25, 'TEST 25 : Notifications -> marquage global isolé', blocked, 'actorId doit correspondre au propriétaire.');
  } catch (err: any) {
    push(25, 'TEST 25 : Notifications -> marquage global isolé', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const blocked = await expectReject(() => mockService.createOrGetConversation('user-emp-1', { id: 'user-cand-1', publicId: 'LAB-C-000001', name: 'Falsifié', role: 'EMPLOYER', avatarUrl: '' }, { contextType: 'OFFER', contextRefId: 'OFFER-001', contextTitle: 'QA' }), 'rôle de l’interlocuteur');
    push(26, 'TEST 26 : Conversation -> identité cible incohérente refusée', blocked, 'Les métadonnées utilisateur ne peuvent pas être forgées.');
  } catch (err: any) {
    push(26, 'TEST 26 : Conversation -> identité cible incohérente refusée', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const blocked = await expectReject(() => mockService.reportIncident({ contractId: 'CTR-001', offerTitle: 'QA', employerId: 'user-emp-2', employerName: 'Faux', employeeId: 'user-cand-1', employeeName: 'Amina', reportedBy: 'EMPLOYER', reason: 'QA', description: 'QA' }, 'user-emp-1'), 'parties de l’incident');
    push(27, 'TEST 27 : Incident -> parties incohérentes refusées', blocked, 'L’incident doit reprendre les parties du contrat.');
  } catch (err: any) {
    push(27, 'TEST 27 : Incident -> parties incohérentes refusées', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const fakeIncident = { ...(await mockService.getIncidentById('INC-001', 'user-admin-1'))!, id: 'FAKE-INC', status: 'REPLACEMENT_REQUESTED' } as any;
    const blocked = await expectReject(() => mockService.createReplacementFromIncident(fakeIncident, 'user-admin-1'), 'Incident introuvable');
    push(28, 'TEST 28 : Remplacement -> incident non enregistré refusé', blocked, 'Le dossier doit partir du registre d’incidents.');
  } catch (err: any) {
    push(28, 'TEST 28 : Remplacement -> incident non enregistré refusé', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const blockedAdmin = await expectReject(() => mockService.login(`attacker-${Date.now()}@example.com`, 'ADMIN'), 'compte ADMIN');
    const duplicate = await expectReject(() => mockService.register('amina.dossou@lelabeur.bj', 'Usurpation', 'CANDIDATE'), 'compte existe déjà');
    push(29, 'TEST 29 : Authentification -> escalade ADMIN et réinscription refusées', blockedAdmin && duplicate, 'Création ADMIN arbitraire et réinscription d’un email existant bloquées.');
  } catch (err: any) {
    push(29, 'TEST 29 : Authentification -> escalade ADMIN et réinscription refusées', false, err.message);
  }

  try {
    await mockService.resetAllData();
    await loginAs('user-emp-1');
    const employerApps = await mockService.getApplicationsByEmployer('user-emp-1');
    await loginAs('user-cand-1');
    const candidateApps = await mockService.getApplicationsByCandidate('user-cand-1');
    await loginAs('user-emp-1');
    const employerOfferIds = new Set((await mockService.getOffersByEmployer('user-emp-1')).map(o => o.id));
    const pass = employerApps.every(a => employerOfferIds.has(a.offerId)) && candidateApps.every(a => a.candidateId === 'user-cand-1');
    push(30, 'TEST 30 : Data scoping -> candidatures limitées au propriétaire logique', pass, `Employeur: ${employerApps.length}, candidat: ${candidateApps.length}`);
  } catch (err: any) {
    push(30, 'TEST 30 : Data scoping -> candidatures limitées au propriétaire logique', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const base = { searchQuery: '', location: '', departmentId: '', communeId: '', arrondissementId: '', localityId: '', contractType: '', minSalary: 0, availability: '', remoteOption: 'ALL' as const, selectedSkills: [], selectedDomain: '', selectedJob: '' };
    const dept = await mockService.searchOffers({ ...base, departmentId: 'dept-littoral' });
    const commune = await mockService.searchOffers({ ...base, communeId: 'com-cotonou' });
    const arr = await mockService.searchOffers({ ...base, arrondissementId: 'arr-cotonou-12' });
    const locality = await mockService.searchOffers({ ...base, localityId: 'loc-fidjrosse-plage' });
    const domain = await mockService.searchOffers({ ...base, selectedDomain: 'dom-btp' });
    const job = await mockService.searchOffers({ ...base, selectedJob: 'job-electricien-batiment' });
    const pass = dept.every(o => o.departmentId === 'dept-littoral') && commune.every(o => o.municipalityId === 'com-cotonou') && arr.every(o => o.arrondissementId === 'arr-cotonou-12') && locality.every(o => o.localityId === 'loc-fidjrosse-plage') && domain.every(o => o.domainId === 'dom-btp') && job.every(o => o.jobId === 'job-electricien-batiment');
    push(31, 'TEST 31 : Recherche -> filtres géographiques et métiers côté repository', pass, `Résultats: département=${dept.length}, commune=${commune.length}, arrondissement=${arr.length}, localité=${locality.length}, domaine=${domain.length}, métier=${job.length}`);
  } catch (err: any) {
    push(31, 'TEST 31 : Recherche -> filtres géographiques et métiers côté repository', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const ctr = await mockService.getContractById('CTR-001');
    if (!ctr) throw new Error('Contrat test introuvable');
    ctr.startDate = '15/10/2026';
    ctr.currentMonth = 1;
    ctr.status = 'TERMINATED';
    ctr.paymentSchedule = [];
    const terminalFuture = await mockService.getContractById('CTR-001');
    const m1 = terminalFuture?.paymentSchedule.find(e => e.monthNumber === 1);
    const pass = m1?.salaryStatus === 'NOT_APPLICABLE' && m1?.commissionStatus === 'NOT_APPLICABLE';
    push(32, 'TEST 32 : Contrat terminal -> échéance future non créée comme DUE', pass, `M1 salaire=${m1?.salaryStatus}, commission=${m1?.commissionStatus}`);
  } catch (err: any) {
    push(32, 'TEST 32 : Contrat terminal -> échéance future non créée comme DUE', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const ctr = await mockService.getContractById('CTR-001');
    if (!ctr) throw new Error('Contrat test introuvable');
    ctr.startDate = '15/08/2026';
    ctr.currentMonth = 1;
    ctr.status = 'TERMINATED';
    ctr.paymentSchedule = [];
    const terminalPast = await mockService.getContractById('CTR-001');
    const m1 = terminalPast?.paymentSchedule.find(e => e.monthNumber === 1);
    const pass = (m1?.salaryStatus === 'DUE' || m1?.salaryStatus === 'PAID') && m1?.commissionStatus === 'DUE';
    push(33, 'TEST 33 : Contrat terminal -> échéance déjà arrivée conservée', pass, `M1 salaire=${m1?.salaryStatus}, commission=${m1?.commissionStatus}`);
  } catch (err: any) {
    push(33, 'TEST 33 : Contrat terminal -> échéance déjà arrivée conservée', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const stored = await mockService.getIncidentById('INC-001', 'user-admin-1');
    if (!stored) throw new Error('Incident test introuvable');
    stored.status = 'REPLACEMENT_REQUESTED';
    const forged = { ...stored, offerTitle: 'Offre forgée', employerName: 'Faux employeur' };
    const rep = await mockService.createReplacementFromIncident(forged, 'user-admin-1');
    if (!rep.urgentOfferId) throw new Error('Offre urgente DEMO absente');
    const offer = await mockService.getOfferById(rep.urgentOfferId);
    const contract = await mockService.getContractById(stored.contractId);
    const pass = Boolean(offer && offer.title.includes(stored.offerTitle) && !offer.title.includes('Offre forgée') && offer.employerId === stored.employerId && contract?.replacementId === rep.id);
    push(34, 'TEST 34 : Remplacement -> métadonnées canoniques de l’incident', pass, `Offre générée: ${offer?.title || 'absente'}`);
  } catch (err: any) {
    push(34, 'TEST 34 : Remplacement -> métadonnées canoniques de l’incident', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const call = await mockService.initiateCall(
      { ...(await mockService.getProfile('user-cand-1', 'user-cand-1'))! },
      { id: 'user-emp-1', fullName: 'Nom forgé', role: 'EMPLOYER', avatarUrl: 'fake', headline: 'Titre forgé' }
    );
    const target = await mockService.getProfile('user-emp-1', 'user-emp-1');
    const pass = Boolean(target && call.receiverName === target.fullName && call.receiverRole === target.role && call.receiverAvatar === target.avatarUrl && call.receiverHeadline === target.headline);
    push(35, 'TEST 35 : Appel -> identité du destinataire canonique', pass, `Destinataire: ${call.receiverName}`);
  } catch (err: any) {
    push(35, 'TEST 35 : Appel -> identité du destinataire canonique', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const created = await mockService.createOffer({
      title: 'Test identité canonique', employerId: 'user-emp-1', employerName: 'Faux employeur', employerLocation: 'Fausse ville',
      contractType: 'Mission', remuneration: 100000, currency: 'FCFA', location: 'Cotonou', skills: ['Test'], summary: 'Test', responsibilities: ['Test'], conditions: ['Test'], selectionProcess: ['Direct'], durationMonths: 3
    }, 'user-emp-1');
    const offerCanonical = created.employerName === (await mockService.getProfile('user-emp-1', 'user-emp-1'))?.fullName && created.employerPublicId === (await mockService.getProfile('user-emp-1', 'user-emp-1'))?.publicId;
    const app = await mockService.applyToOffer(created.id, 'user-cand-1');
    await mockService.examineApplication(app.id, 'user-emp-1');
    await mockService.shortlistApplication(app.id, 'user-emp-1');
    const contract = await mockService.generateContract({
      offerId: created.id, applicationId: app.id, employerId: 'user-emp-1', employerName: 'Faux employeur', employeeId: 'user-cand-1', employeeName: 'Faux salarié',
      jobTitle: 'Titre faux', missionDescription: 'Test', location: 'Cotonou', startDate: '15/10/2026', durationMonths: 3, monthlySalary: 100000, periodicity: 'Mensuel', conditions: []
    }, 'user-emp-1');
    const employer = await mockService.getProfile('user-emp-1', 'user-emp-1');
    const employee = await mockService.getProfile('user-cand-1', 'user-cand-1');
    const pass = offerCanonical && contract.employerName === employer?.fullName && contract.employeeName === employee?.fullName && contract.offerTitle === created.title;
    push(36, 'TEST 36 : Données métier -> identités canoniques dans offre et contrat', pass, `Employeur=${contract.employerName}, salarié=${contract.employeeName}, titre=${contract.offerTitle}`);
  } catch (err: any) {
    push(36, 'TEST 36 : Données métier -> identités canoniques dans offre et contrat', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const fresh = await createFreshTestContract('15/11/2026', 'FUTURE');
    const refreshed = await mockService.getContractById(fresh.id);
    const m1 = refreshed?.paymentSchedule.find(e => e.monthNumber === 1);
    const pass = m1?.commissionStatus === 'SCHEDULED' && m1?.salaryStatus === 'SCHEDULED';
    push(37, 'TEST 37 : Paiements -> M1 reste planifié avant échéance', pass, `Salaire=${m1?.salaryStatus}, commission=${m1?.commissionStatus}`);
  } catch (err: any) {
    push(37, 'TEST 37 : Paiements -> M1 reste planifié avant échéance', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const fresh = await createFreshTestContract('15/08/2026', 'WRONG-AMOUNT');
    const due = await mockService.getContractById(fresh.id);
    const m1 = due?.paymentSchedule.find(e => e.monthNumber === 1);
    const blockedAmount = await expectReject(() => mockService.declareCommissionPayment({
      contractId: fresh.id, actorId: fresh.employerId, monthNumber: 1, senderPhone: '+22997000000', transactionId: `TX-WRONG-${Date.now()}`, amountPaid: (m1?.commissionAmount || 0) + 1, proofUri: 'proof://qa'
    }), 'Montant de commission incohérent');
    push(38, 'TEST 38 : Commission -> montant incorrect refusé à échéance', m1?.commissionStatus === 'DUE' && blockedAmount, `Statut=${m1?.commissionStatus}`);
  } catch (err: any) {
    push(38, 'TEST 38 : Commission -> montant incorrect refusé à échéance', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const fresh = await createFreshTestContract('15/08/2026', 'VERIFY');
    const due = await mockService.getContractById(fresh.id);
    const m1 = due?.paymentSchedule.find(e => e.monthNumber === 1);
    if (!m1) throw new Error('Échéance M1 absente');
    const rec = await mockService.declareCommissionPayment({
      contractId: fresh.id, actorId: fresh.employerId, monthNumber: 1, senderPhone: '+22997000000', transactionId: `TX-QA-VERIFY-${Date.now()}`, amountPaid: m1.commissionAmount, proofUri: 'proof://qa', proofFileName: 'qa.png'
    });
    const wasPending = rec.status === 'PENDING_VERIFICATION';
    const afterDecl = await mockService.getContractById(fresh.id);
    const pending = afterDecl?.paymentSchedule.find(e => e.monthNumber === 1)?.commissionStatus === 'PENDING_VERIFICATION';
    const verified = await mockService.verifyCommissionPayment(rec.paymentId, 'user-admin-1');
    const afterVerify = await mockService.getContractById(fresh.id);
    const paid = afterVerify?.paymentSchedule.find(e => e.monthNumber === 1)?.commissionStatus === 'PAID';
    push(39, 'TEST 39 : Commission -> déclaration puis validation ADMIN', wasPending && pending && verified.status === 'PAID' && paid, `Après validation=${afterVerify?.paymentSchedule.find(e => e.monthNumber === 1)?.commissionStatus}`);
  } catch (err: any) {
    push(39, 'TEST 39 : Commission -> déclaration puis validation ADMIN', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const fresh = await createFreshTestContract('15/08/2026', 'REJECT');
    const due = await mockService.getContractById(fresh.id);
    const m1 = due?.paymentSchedule.find(e => e.monthNumber === 1);
    if (!m1) throw new Error('Échéance M1 absente');
    const rec = await mockService.declareCommissionPayment({
      contractId: fresh.id, actorId: fresh.employerId, monthNumber: 1, senderPhone: '+22997000000', transactionId: `TX-QA-REJECT-${Date.now()}`, amountPaid: m1.commissionAmount, proofUri: 'proof://qa'
    });
    const rejected = await mockService.rejectCommissionPayment(rec.paymentId, 'Preuve illisible', 'user-admin-1');
    const afterReject = await mockService.getContractById(fresh.id);
    const status = afterReject?.paymentSchedule.find(e => e.monthNumber === 1)?.commissionStatus;
    const redeclareBlockedUntilProof = await expectReject(() => mockService.declareCommissionPayment({
      contractId: fresh.id, actorId: fresh.employerId, monthNumber: 1, senderPhone: '+22997000000', transactionId: `TX-QA-REJECT2-${Date.now()}`, amountPaid: m1.commissionAmount, proofUri: ''
    }), 'preuve de paiement');
    push(40, 'TEST 40 : Commission -> rejet ADMIN remet l’échéance à DUE', rejected.status === 'REJECTED' && status === 'DUE' && redeclareBlockedUntilProof, `Statut après rejet=${status}`);
  } catch (err: any) {
    push(40, 'TEST 40 : Commission -> rejet ADMIN remet l’échéance à DUE', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const fresh = await createFreshTestContract('15/08/2026', 'NOTIF');
    await mockService.getContractById(fresh.id);
    await mockService.getContractById(fresh.id);
    const salaryNotifs = (await mockService.getNotifications(fresh.employerId)).filter(n => n.dedupeKey === `${fresh.id}:1:SALARY`);
    const commissionNotifs = (await mockService.getNotifications(fresh.employerId)).filter(n => n.dedupeKey === `${fresh.id}:1:COMMISSION`);
    push(41, 'TEST 41 : Notifications -> échéances idempotentes', salaryNotifs.length <= 1 && commissionNotifs.length <= 1, `Salaire=${salaryNotifs.length}, commission=${commissionNotifs.length}`);
  } catch (err: any) {
    push(41, 'TEST 41 : Notifications -> échéances idempotentes', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const schedule = buildPaymentSchedule({ contractId: 'QA-SCHEDULE', startDate: '31/01/2027', durationMonths: 3, monthlySalary: 30000, currency: 'FCFA' });
    const pass = schedule.length === 3 &&
      schedule[0].employeeShareAmount === 22500 && schedule[0].commissionAmount === 7500 &&
      schedule[1].employeeShareAmount === 30000 && schedule[1].commissionAmount === 0 &&
      schedule[2].employeeShareAmount === 30000 && schedule[2].commissionAmount === 0 &&
      schedule[0].salaryDueDate === '2027-02-28' && schedule[1].salaryDueDate === '2027-03-31' && schedule[2].salaryDueDate === '2027-04-30';
    push(42, 'TEST 42 : Calendrier -> répartition M1/M2+ et dates de fin de mois', pass, `${schedule.map(e => `${e.monthNumber}:${e.salaryDueDate}:${e.employeeShareAmount}/${e.commissionAmount}`).join(', ')}`);
  } catch (err: any) {
    push(42, 'TEST 42 : Calendrier -> répartition M1/M2+ et dates de fin de mois', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const c = await mockService.getContractById('CTR-001');
    if (!c) throw new Error('CTR-001 absent');
    c.status = 'COMPLETED';
    c.startDate = '15/11/2026';
    c.paymentSchedule = [];
    const refreshed = await mockService.getContractById('CTR-001');
    const futureStatuses = refreshed?.paymentSchedule.filter(e => e.monthNumber >= 1).every(e => e.salaryStatus === 'NOT_APPLICABLE' && e.commissionStatus === 'NOT_APPLICABLE');
    push(43, 'TEST 43 : Contrat terminé -> aucune échéance future ne devient DUE', Boolean(futureStatuses), `États: ${refreshed?.paymentSchedule.map(e => `M${e.monthNumber}/${e.salaryStatus}/${e.commissionStatus}`).join(', ')}`);
  } catch (err: any) {
    push(43, 'TEST 43 : Contrat terminé -> aucune échéance future ne devient DUE', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const blocked = await expectReject(() => mockService.generateContract({
      offerId: 'OFFER-002', applicationId: 'APP-002', employerId: 'user-emp-2', employerName: 'IGNORED', employeeId: 'user-cand-2', employeeName: 'IGNORED', jobTitle: 'QA', missionDescription: 'QA', location: 'Calavi', startDate: '15/11/2026', durationMonths: 3, monthlySalary: 100000, periodicity: 'Mensuel', conditions: []
    }, 'user-emp-2'), 'shortlistée');
    push(44, 'TEST 44 : Contrat -> génération impossible hors candidature SHORTLISTED', blocked, 'La transition application → contrat est verrouillée.');
  } catch (err: any) {
    push(44, 'TEST 44 : Contrat -> génération impossible hors candidature SHORTLISTED', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const blocked = await expectReject(() => mockService.createOrGetConversation('user-cand-1', { id: 'user-emp-1', name: 'Faux', role: 'EMPLOYER', avatarUrl: '' }, { contextType: 'CONTRACT', contextTitle: 'Contrat forgé', contextRefId: 'CTR-002' }), 'participants');
    push(45, 'TEST 45 : Conversation contrat -> paire employeur/salarié exacte', blocked, 'Une conversation ne peut pas détourner le contexte d’un autre contrat.');
  } catch (err: any) {
    push(45, 'TEST 45 : Conversation contrat -> paire employeur/salarié exacte', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const blocked = await expectReject(() => mockService.markAsRead('NOTIF-001', 'user-cand-2'), 'autorisée');
    push(46, 'TEST 46 : Notification -> marquage par un autre utilisateur refusé', blocked, 'Isolation des notifications.');
  } catch (err: any) {
    push(46, 'TEST 46 : Notification -> marquage par un autre utilisateur refusé', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const results = searchBeninLocations('Cadjèhoun');
    const pass = results.length > 0 && results.every(r => r.departmentId && r.communeId) && results.some(r => r.localityName === 'Cadjèhoun Kpota');
    push(47, 'TEST 47 : Géographie -> recherche hiérarchique par zone', pass, `Suggestions=${results.slice(0, 3).map(r => r.formattedLabel).join(' | ')}`);
  } catch (err: any) {
    push(47, 'TEST 47 : Géographie -> recherche hiérarchique par zone', false, err.message);
  }

  try {
    const coverage = getBeninLocationCoverage();
    const pass = coverage.departments === 12 && coverage.communes === 77 && coverage.arrondissements === 24 && coverage.localities === 94 && coverage.isComplete === false;
    push(48, 'TEST 48 : Géographie -> couverture actuelle correctement déclarée', pass, `${coverage.departments}/${coverage.targets.departments} départements, ${coverage.communes}/${coverage.targets.communes} communes, ${coverage.arrondissements}/${coverage.targets.arrondissements} arrondissements, ${coverage.localities}/${coverage.targets.localities} localités`);
  } catch (err: any) {
    push(48, 'TEST 48 : Géographie -> couverture actuelle correctement déclarée', false, err.message);
  }


  try {
    await mockService.resetAllData();
    const offer = await mockService.createOffer({
      title: `QA Proposal Context ${Date.now()}`, employerId: 'user-emp-1', employerName: 'IGNORED', employerLocation: 'Cotonou',
      contractType: 'Mission', remuneration: 80000, currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'QA',
      responsibilities: ['QA'], conditions: ['Test'], selectionProcess: ['Direct'], durationMonths: 3
    }, 'user-emp-1');
    const app = await mockService.applyToOffer(offer.id, 'user-cand-8');
    await mockService.examineApplication(app.id, 'user-emp-1');
    await mockService.shortlistApplication(app.id, 'user-emp-1');
    const unrelatedOffer = await mockService.createOffer({
      title: `QA Unrelated ${Date.now()}`, employerId: 'user-emp-1', employerName: 'IGNORED', employerLocation: 'Cotonou',
      contractType: 'Mission', remuneration: 70000, currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'QA',
      responsibilities: ['QA'], conditions: ['Test'], selectionProcess: ['Direct'], durationMonths: 3
    }, 'user-emp-1');
    const conv = await mockService.createOrGetConversation('user-emp-1', { id: 'user-cand-8', name: 'IGNORED', role: 'CANDIDATE', avatarUrl: '' }, {
      contextType: 'APPLICATION', contextTitle: offer.title, contextRefId: app.id
    });
    const blocked = await expectReject(() => mockService.sendProposal(conv.id, {
      conversationId: conv.id, offerId: unrelatedOffer.id, applicationId: undefined as any, employerId: 'user-emp-1', employerName: 'IGNORED',
      employeeId: 'user-cand-8', employeeName: 'IGNORED', missionTitle: unrelatedOffer.title, amount: 70000, currency: 'FCFA', periodicity: 'Mensuel',
      startDate: '15/11/2026', durationMonths: 3, location: 'Cotonou', conditions: []
    }, 'user-emp-1'), 'candidature');
    push(49, 'TEST 49 : Proposition -> contexte de conversation verrouillé', blocked, 'Une proposition ne peut pas détourner une conversation d’une autre candidature.');
  } catch (err: any) {
    push(49, 'TEST 49 : Proposition -> contexte de conversation verrouillé', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const inc = await mockService.getIncidentById('INC-001', 'user-admin-1');
    if (!inc) throw new Error('Incident initial absent');
    inc.status = 'RESOLVED';
    const blocked = await expectReject(() => mockService.arbitrateIncident('INC-001', 'CONTINUER', 'Deuxième décision interdite', 'IGNORED', 'user-admin-1'), 'déjà traité');
    push(50, 'TEST 50 : Incident -> double arbitrage refusé', blocked, `Statut=${inc.status}`);
  } catch (err: any) {
    push(50, 'TEST 50 : Incident -> double arbitrage refusé', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const c = await mockService.getContractById('CTR-001');
    if (!c) throw new Error('CTR-001 absent');
    c.status = 'TERMINATED';
    c.currentMonth = 2;
    const blocked = await expectReject(() => mockService.dissociateMonth2(c.id, 'Motif', c.employerId, 'EMPLOYER'), 'pas actif');
    push(51, 'TEST 51 : Contrat terminal -> dissociation refusée', blocked, `Statut=${c.status}`);
  } catch (err: any) {
    push(51, 'TEST 51 : Contrat terminal -> dissociation refusée', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const c = await mockService.getContractById('CTR-001');
    if (!c) throw new Error('CTR-001 absent');
    c.status = 'SIGNATURE';
    const initialStatus = c.status;
    const closed = await expectReject(() => mockService.reportIncident({
      contractId: c.id, employerId: c.employerId, employerName: c.employerName, employeeId: c.employeeId,
      employeeName: c.employeeName, offerTitle: c.offerTitle, reportedBy: 'EMPLOYER', reason: 'Test', description: 'Test'
    }, c.employerId), 'actif ou suspendu');
    push(52, 'TEST 52 : Incident -> ouverture hors contrat actif refusée', closed, `Contrat initial=${initialStatus}`);
  } catch (err: any) {
    push(52, 'TEST 52 : Incident -> ouverture hors contrat actif refusée', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const c = await mockService.getContractById('CTR-001');
    if (!c) throw new Error('CTR-001 absent');
    c.status = 'ACTIVE';
    await mockService.reportIncident({
      contractId: c.id, employerId: c.employerId, employerName: c.employerName, employeeId: c.employeeId,
      employeeName: c.employeeName, offerTitle: c.offerTitle, reportedBy: 'EMPLOYER', reason: 'Premier incident', description: 'Incident initial'
    }, c.employerId);
    const blocked = await expectReject(() => mockService.reportIncident({
      contractId: c.id, employerId: c.employerId, employerName: c.employerName, employeeId: c.employeeId,
      employeeName: c.employeeName, offerTitle: c.offerTitle, reportedBy: 'EMPLOYER', reason: 'Second incident', description: 'Deuxième incident'
    }, c.employerId), 'actif ou suspendu');
    push(53, 'TEST 53 : Incident -> second incident bloqué tant que le premier est ouvert', blocked, `Statut après premier incident=${c.status}`);
  } catch (err: any) {
    push(53, 'TEST 53 : Incident -> second incident bloqué tant que le premier est ouvert', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const conv = await mockService.createOrGetConversation('user-emp-1', { id: 'user-cand-8', name: 'IGNORED', role: 'CANDIDATE', avatarUrl: '' }, {
      contextType: 'OFFER', contextTitle: 'Offre QA', contextRefId: 'OFFER-001'
    });
    const blockedSend = await expectReject(() => mockService.sendMessage(conv.id, 'x', '', 'EMPLOYER'), 'actorId obligatoire');
    const blockedVoice = await expectReject(() => mockService.sendAudioMessage(conv.id, 10, '', 'EMPLOYER'), 'actorId obligatoire');
    const blockedRead = await expectReject(() => mockService.markConversationAsRead(conv.id, ''), 'actorId obligatoire');
    push(54, 'TEST 54 : Messagerie -> actorId obligatoire sur toutes les mutations', blockedSend && blockedVoice && blockedRead, 'Message, vocal et lecture sont tous protégés.');
  } catch (err: any) {
    push(54, 'TEST 54 : Messagerie -> actorId obligatoire sur toutes les mutations', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const users = (mockService as any).users as Array<{ id: string; publicId?: string }>;
    const candidate = users.find(u => u.id === 'user-cand-3');
    if (!candidate) throw new Error('Candidat de test absent');
    candidate.publicId = '';
    const blocked = await expectReject(() => mockService.generateContract({
      offerId: 'OFFER-003', applicationId: 'APP-003', employerId: 'user-emp-3', employerName: 'IGNORED',
      employeeId: 'user-cand-3', employeeName: 'IGNORED', jobTitle: 'QA', missionDescription: 'QA', location: 'Cotonou',
      startDate: '15 Octobre 2026', durationMonths: 3, monthlySalary: 80000, periodicity: 'Mensuel', conditions: []
    }, 'user-emp-3'), 'Identifiant public candidat manquant');
    push(55, 'TEST 55 : Contrat -> identifiant public candidat obligatoire', blocked, 'Aucun contrat ne peut être généré avec un publicId absent.');
  } catch (err: any) {
    push(55, 'TEST 55 : Contrat -> identifiant public candidat obligatoire', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const rep = await mockService.getReplacementById('REP-001', 'user-admin-1');
    if (!rep) throw new Error('REP-001 absent');
    await mockService.assignReplacementCandidate(rep.id, 'user-cand-3', 'user-admin-1');
    const users = (mockService as any).users as Array<{ id: string; role: string; publicId?: string }>;
    const candidate = users.find(u => u.id === 'user-cand-3');
    if (!candidate) throw new Error('Candidat de test absent');
    candidate.publicId = '';
    await mockService.transferCandidateToEmployer(rep.id, 'user-admin-1');
    const blocked = await expectReject(() => mockService.finalizeReplacementContract(rep.id, 'user-admin-1'), 'Identifiant public du candidat de remplacement manquant');
    push(56, 'TEST 56 : Remplacement -> candidat sans publicId refusé', blocked, 'La finalisation ne fabrique aucun identifiant public de secours.');
  } catch (err: any) {
    push(56, 'TEST 56 : Remplacement -> candidat sans publicId refusé', false, err.message);
  }

  try {
    await mockService.resetAllData();
    const rep = await mockService.getReplacementById('REP-001', 'user-admin-1');
    if (!rep) throw new Error('REP-001 absent');
    await mockService.assignReplacementCandidate(rep.id, 'user-cand-3', 'user-admin-1');
    const contracts = (mockService as any).contracts as Array<{ id: string; employerId: string }>;
    const original = contracts.find(c => c.id === rep.originalContractId);
    if (!original) throw new Error('Contrat d’origine absent');
    contracts.splice(contracts.findIndex(c => c.id === original.id), 1);
    await mockService.transferCandidateToEmployer(rep.id, 'user-admin-1');
    const blocked = await expectReject(() => mockService.finalizeReplacementContract(rep.id, 'user-admin-1'), 'Contrat d’origine introuvable');
    push(57, 'TEST 57 : Remplacement -> contrat d’origine obligatoire', blocked, 'La finalisation refuse tout fallback financier ou contractuel.');
  } catch (err: any) {
    push(57, 'TEST 57 : Remplacement -> contrat d’origine obligatoire', false, err.message);
  }

  // 58. Activation must be atomic when another active contract has already filled the offer.
  try {
    await mockService.resetAllData();
    const signature = await mockService.generateContract({
      offerId: 'OFFER-003', applicationId: 'APP-003', employerId: 'user-emp-3', employerName: 'IGNORED',
      employeeId: 'user-cand-3', employeeName: 'IGNORED', jobTitle: 'QA', missionDescription: 'QA', location: 'Cotonou',
      startDate: '15 Octobre 2026', durationMonths: 3, monthlySalary: 80000, periodicity: 'Mensuel', conditions: []
    }, 'user-emp-3');
    const contracts = (mockService as any).contracts as Array<any>;
    contracts.push({
      id: 'CTR-QA-COMPETING', offerId: signature.offerId, offerTitle: signature.offerTitle,
      employerId: signature.employerId, employerName: signature.employerName, employeeId: 'user-cand-8', employeeName: 'Concurrent',
      monthlySalary: signature.monthlySalary, currency: 'FCFA', startDate: signature.startDate, currentMonth: 1, status: 'ACTIVE',
      employerSigned: true, employeeSigned: true, missionDescription: 'Concurrent', location: signature.location, durationMonths: 3,
      periodicity: 'Mensuel', conditions: [], monthlyCheckpoints: [], commissionLedger: [], paymentSchedule: buildPaymentSchedule({ contractId: 'CTR-QA-COMPETING', startDate: signature.startDate, durationMonths: 3, monthlySalary: signature.monthlySalary, currency: 'FCFA' }),
      commissionPercentage: 25, commissionAmountDue: calculateFirstMonthCommission(signature.monthlySalary), commissionStatus: 'SCHEDULED', history: []
    });
    const blocked = await expectReject(() => mockService.signContract(signature.id, 'EMPLOYEE', signature.employeeId), 'déjà pourvue');
    const after = await mockService.getContractById(signature.id);
    const offer = await mockService.getOfferById(signature.offerId);
    const atomic = after?.status === 'SIGNATURE' && after?.employeeSigned === false && offer?.status === 'ACTIVE';
    push(58, 'TEST 58 : Activation de contrat -> transaction atomique si offre déjà pourvue', blocked && atomic, `Contrat=${after?.status}, salarié signé=${after?.employeeSigned}, offre=${offer?.status}`);
  } catch (err: any) {
    push(58, 'TEST 58 : Activation de contrat -> transaction atomique si offre déjà pourvue', false, err.message);
  }


  // 59-61. A candidature already linked to a contract cannot be transitioned backwards.
  for (const [id, label, action] of [
    [59, 'TEST 59 : Candidature contractualisée -> examen refusé', 'examine'],
    [60, 'TEST 60 : Candidature contractualisée -> shortlist refusée', 'shortlist'],
    [61, 'TEST 61 : Candidature contractualisée -> rejet refusé', 'reject']
  ] as const) {
    try {
      await mockService.resetAllData();
      const contract = await mockService.generateContract({
        offerId: 'OFFER-003', applicationId: 'APP-003', employerId: 'user-emp-3', employerName: 'IGNORED',
        employeeId: 'user-cand-3', employeeName: 'IGNORED', jobTitle: 'QA', missionDescription: 'QA', location: 'Cotonou',
        startDate: '15 Octobre 2026', durationMonths: 3, monthlySalary: 80000, periodicity: 'Mensuel', conditions: []
      }, 'user-emp-3');
      const expected = 'déjà associée à un contrat';
      const blocked = action === 'examine'
        ? await expectReject(() => mockService.examineApplication('APP-003', 'user-emp-3'), expected)
        : action === 'shortlist'
          ? await expectReject(() => mockService.shortlistApplication('APP-003', 'user-emp-3'), expected)
          : await expectReject(() => mockService.rejectApplication('APP-003', 'Test', 'user-emp-3'), expected);
      const app = ((mockService as any).applications as any[]).find((x: any) => x.id === 'APP-003');
      const stable = !!app && app.contractId === contract.id && app.status === 'SHORTLISTED';
      push(id, label, blocked && stable, `contractId=${app?.contractId}, status=${app?.status}`);
    } catch (err: any) {
      push(id, label, false, err.message);
    }
  }


  // 62. Future schedule entries frozen at termination must never reopen as DUE after time passes.
  try {
    await mockService.resetAllData();
    const c = await mockService.getContractById('CTR-001');
    if (!c) throw new Error('CTR-001 absent');
    c.status = 'ACTIVE';
    c.currentMonth = 2;
    const future = c.paymentSchedule.find(e => e.monthNumber === 3);
    if (!future) throw new Error('Échéance M3 absente');
    future.salaryDueDate = '2099-12-15';
    future.commissionDueDate = '2099-12-15';
    future.salaryStatus = 'SCHEDULED';
    future.commissionStatus = 'NOT_APPLICABLE';
    await mockService.dissociateMonth2(c.id, 'Fin QA', c.employerId, 'EMPLOYER');
    future.salaryDueDate = '2000-01-01';
    future.commissionDueDate = '2000-01-01';
    const refreshedAfterFreeze = await mockService.getContractById(c.id);
    const frozenEntry = refreshedAfterFreeze?.paymentSchedule.find(e => e.monthNumber === 3);
    if (frozenEntry?.salaryStatus !== 'NOT_APPLICABLE') throw new Error('M3 futur non gelé à la terminaison.');
    const refreshed = await mockService.getContractById(c.id);
    const entry = refreshed?.paymentSchedule.find(e => e.monthNumber === 3);
    const frozen = entry?.salaryStatus === 'NOT_APPLICABLE' && entry?.commissionStatus === 'NOT_APPLICABLE';
    push(62, 'TEST 62 : Contrat terminal -> échéance future gelée définitivement', !!frozen, `Salaire=${entry?.salaryStatus}, commission=${entry?.commissionStatus}`);
  } catch (err: any) {
    push(62, 'TEST 62 : Contrat terminal -> échéance future gelée définitivement', false, err.message);
  }


  // 63-68. Runtime enum validation must reject values that bypass TypeScript at runtime.
  const runtimeGuardCases: Array<{ id: number; name: string; run: () => Promise<unknown>; matcher: string }> = [
    {
      id: 63,
      name: 'TEST 63 : Offre -> statut runtime invalide refusé',
      run: async () => mockService.updateOfferStatus('OFFER-001', 'HACK' as any, 'user-emp-1'),
      matcher: 'Statut d’offre invalide'
    },
    {
      id: 64,
      name: 'TEST 64 : Incident -> déclarant runtime invalide refusé',
      run: async () => mockService.reportIncident({ contractId:'CTR-001', employerId:'user-emp-1', employerName:'X', employeeId:'user-cand-1', employeeName:'Y', offerTitle:'QA', reportedBy:'HACK' as any, reason:'QA', description:'QA' }, 'user-emp-1'),
      matcher: 'Type de déclarant'
    },
    {
      id: 65,
      name: 'TEST 65 : Arbitrage -> décision runtime invalide refusée',
      run: async () => mockService.arbitrateIncident('INC-001', 'HACK' as any, 'QA', 'Admin', 'user-admin-1'),
      matcher: 'Décision d’arbitrage invalide'
    },
    {
      id: 66,
      name: 'TEST 66 : Contrat -> rôle de signature runtime invalide refusé',
      run: async () => { const c = await mockService.generateContract({offerId:'OFFER-003',applicationId:'APP-003',employerId:'user-emp-3',employerName:'X',employeeId:'user-cand-3',employeeName:'Y',jobTitle:'QA',missionDescription:'QA',location:'Cotonou',startDate:'15 Octobre 2026',durationMonths:3,monthlySalary:80000,periodicity:'Mensuel',conditions:[]}, 'user-emp-3'); return mockService.signContract(c.id, 'HACK' as any, 'user-cand-3'); },
      matcher: 'Rôle de signature invalide'
    },
    {
      id: 67,
      name: 'TEST 67 : Paiement mensuel -> action runtime invalide refusée',
      run: async () => mockService.confirmMonthlyAction('CTR-001', 1, 'HACK' as any, 'user-emp-1'),
      matcher: 'Action mensuelle invalide'
    },
    {
      id: 68,
      name: 'TEST 68 : Proposition -> réponse runtime invalide refusée',
      run: async () => mockService.respondToProposal('PROP-001', 'HACK' as any, undefined, 'user-cand-1'),
      matcher: 'Réponse de proposition invalide'
    }
  ];
  for (const test of runtimeGuardCases) {
    try {
      await mockService.resetAllData();
      const blocked = await expectReject(test.run, test.matcher);
      push(test.id, test.name, blocked, `Valeur runtime non autorisée : ${test.matcher}.`);
    } catch (err: any) {
      push(test.id, test.name, false, err.message);
    }
  }



  // 73. Call history is scoped to the requesting actor.
  try {
    await mockService.resetAllData();
    const blocked = await expectReject(() => mockService.getCallHistory('user-cand-1', 'user-cand-2'), 'historique d’appel');
    push(73, 'TEST 73 : Historique appel -> acteur tiers refusé', blocked, 'Les appels ne sont visibles que par leur propriétaire ou ADMIN.');
  } catch (err: any) {
    push(73, 'TEST 73 : Historique appel -> acteur tiers refusé', false, err.message);
  }

  // 74-76. Contract input validation must reject impossible dates and amounts.
  const contractInputCases: Array<{ id: number; name: string; run: () => Promise<unknown>; matcher: string }> = [
    {
      id: 74,
      name: 'TEST 74 : Date contrat impossible refusée',
      run: async () => {
        parseContractStartDate('31/02/2026');
        return true;
      },
      matcher: 'Date de début invalide'
    },
    {
      id: 75,
      name: 'TEST 75 : Durée contractuelle nulle refusée',
      run: async () => mockService.generateContract({offerId:'OFFER-003',applicationId:'APP-003',employerId:'user-emp-3',employerName:'X',employeeId:'user-cand-3',employeeName:'Y',jobTitle:'QA',missionDescription:'QA',location:'Cotonou',startDate:'15 Octobre 2026',durationMonths:0,monthlySalary:80000,periodicity:'Mensuel',conditions:[]}, 'user-emp-3'),
      matcher: 'durée du contrat'
    },
    {
      id: 76,
      name: 'TEST 76 : Salaire contractuel nul refusé',
      run: async () => mockService.generateContract({offerId:'OFFER-003',applicationId:'APP-003',employerId:'user-emp-3',employerName:'X',employeeId:'user-cand-3',employeeName:'Y',jobTitle:'QA',missionDescription:'QA',location:'Cotonou',startDate:'15 Octobre 2026',durationMonths:3,monthlySalary:0,periodicity:'Mensuel',conditions:[]}, 'user-emp-3'),
      matcher: 'salaire mensuel'
    }
  ];
  for (const test of contractInputCases) {
    try {
      await mockService.resetAllData();
      const blocked = await expectReject(test.run, test.matcher);
      push(test.id, test.name, blocked, `Validation contractuelle appliquée : ${test.matcher}.`);
    } catch (err: any) {
      push(test.id, test.name, false, err.message);
    }
  }

  // 77-80. Runtime auth and urgent-job ownership validation.
  const authGuardCases: Array<{ id: number; name: string; run: () => Promise<unknown>; matcher: string }> = [
    {
      id: 77,
      name: 'TEST 69 : Connexion -> rôle runtime invalide refusé',
      run: async () => mockService.login(`qa-invalid-role-${Date.now()}@lelabeur.bj`, 'HACK' as any),
      matcher: 'Rôle de connexion invalide'
    },
    {
      id: 78,
      name: 'TEST 70 : Inscription -> rôle runtime invalide refusé',
      run: async () => mockService.register(`qa-invalid-register-${Date.now()}@lelabeur.bj`, 'QA', 'HACK' as any),
      matcher: 'Rôle d’inscription invalide'
    },
    {
      id: 79,
      name: 'TEST 71 : Changement de rôle -> valeur runtime invalide refusée',
      run: async () => { await mockService.login('admin.benin@lelabeur.bj', 'ADMIN'); return mockService.switchRole('HACK' as any); },
      matcher: 'Rôle de session invalide'
    },
    {
      id: 80,
      name: 'TEST 72 : Mission urgente -> employeur inexistant refusé',
      run: async () => mockService.createLeLabeurUrgentJob('QA Urgent', 'user-cand-1', 'Amina', 100000, ['QA'], 'user-admin-1', 'Cotonou', 'QA', 1),
      matcher: 'Employeur invalide'
    }
  ];
  for (const test of authGuardCases) {
    try {
      await mockService.resetAllData();
      const blocked = await expectReject(test.run, test.matcher);
      push(test.id, test.name, blocked, `Validation runtime appliquée : ${test.matcher}.`);
    } catch (err: any) {
      push(test.id, test.name, false, err.message);
    }
  }


  // 81-86. Payment due -> J+3 -> block -> regularization -> unblock.
  const prepareOverdueEmployer = async () => {
    await mockService.resetAllData();
    const { id } = await createFreshTestContract('15 Juillet 2026', 'BLOCKING');
    const contract = await mockService.getContractById(id);
    if (!contract) throw new Error('Contrat QA introuvable.');
    const entry = contract.paymentSchedule.find(e => e.monthNumber === 2);
    if (!entry) throw new Error('Échéance M2 QA introuvable.');
    for (const scheduleEntry of contract.paymentSchedule) {
      if (scheduleEntry.monthNumber === 1) {
        scheduleEntry.salaryStatus = 'PAID';
        scheduleEntry.commissionStatus = 'NOT_APPLICABLE';
        scheduleEntry.commissionAmount = 0;
      } else if (scheduleEntry.monthNumber === 2) {
        scheduleEntry.salaryStatus = 'DUE';
        scheduleEntry.salaryDueDate = '2026-09-01';
        scheduleEntry.commissionStatus = 'NOT_APPLICABLE';
        scheduleEntry.commissionAmount = 0;
        scheduleEntry.commissionDueDate = '2026-12-01';
      } else {
        scheduleEntry.salaryStatus = 'SCHEDULED';
        scheduleEntry.commissionStatus = 'NOT_APPLICABLE';
        scheduleEntry.commissionAmount = 0;
        scheduleEntry.salaryDueDate = '2026-11-15';
        scheduleEntry.commissionDueDate = '2026-12-15';
      }
    }
    await loginAs('user-admin-1');
    await mockService.getContractsByUser('user-admin-1', 'ADMIN');
    return { id, entry };
  };

  try {
    const { id } = await prepareOverdueEmployer();
    await mockService.getContractsByUser('user-admin-1', 'ADMIN');
    const employerJ3 = (await mockService.getNotifications('user-emp-1')).filter(n => n.type === 'PAYMENT_OVERDUE_J3' && n.linkRef?.id === id && n.dedupeKey?.includes(':2:SALARY:J3:EMPLOYER'));
    const adminJ3 = (await mockService.getNotifications('user-admin-1', 'ADMIN')).filter(n => n.type === 'PAYMENT_OVERDUE_J3' && n.linkRef?.id === id && n.dedupeKey?.includes(':2:SALARY:J3:ADMIN:'));
    const expectedAdminAlerts = (await mockService.getAllUsers('user-admin-1')).filter(user => user.role === 'ADMIN').length;
    push(81, 'TEST 81 : J+3 -> notification idempotente employeur + ADMIN', employerJ3.length === 1 && adminJ3.length === expectedAdminAlerts, `Employeur=${employerJ3.length}, ADMIN=${adminJ3.length}/${expectedAdminAlerts}`);
  } catch (err: any) {
    push(81, 'TEST 81 : J+3 -> notification idempotente employeur + ADMIN', false, err.message);
  }

  try {
    const { id } = await prepareOverdueEmployer();
    const blocked = await mockService.blockUser('user-emp-1', 'Échéance non régularisée après J+3.', 'user-admin-1');
    push(82, 'TEST 82 : Blocage ADMIN -> uniquement après J+3', blocked.accountStatus === 'BLOCKED' && blocked.blockedBy === 'user-admin-1' && !!blocked.blockedAt, `Statut=${blocked.accountStatus}, contrat=${id}`);
  } catch (err: any) {
    push(82, 'TEST 82 : Blocage ADMIN -> uniquement après J+3', false, err.message);
  }

  try {
    await prepareOverdueEmployer();
    await mockService.blockUser('user-emp-1', 'Échéance non régularisée après J+3.', 'user-admin-1');
    const blocked = await expectReject(() => mockService.createOffer({
      title: 'Offre interdite compte bloqué', employerId: 'user-emp-1', employerName: 'Employeur', employerLocation: 'Cotonou',
      contractType: 'Mission', remuneration: 100000, currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'x', responsibilities: ['x'],
      conditions: ['x'], selectionProcess: ['x'], durationMonths: 1
    }, 'user-emp-1'), 'COMPTE BLOQUÉ');
    push(83, 'TEST 83 : Compte bloqué -> mutation métier interdite', blocked, 'La création d’offre est refusée pendant le blocage.');
  } catch (err: any) {
    push(83, 'TEST 83 : Compte bloqué -> mutation métier interdite', false, err.message);
  }

  try {
    const { id, entry } = await prepareOverdueEmployer();
    await mockService.blockUser('user-emp-1', 'Échéance non régularisée après J+3.', 'user-admin-1');
    const afterDeclaration = await mockService.confirmMonthlyAction(id, 2, 'DECLARE_SALARY', 'user-emp-1', 'Régularisation après blocage', {
      amount: entry.employeeShareAmount,
      txnId: 'QA-BLOCKED-SALARY-001',
      proofFileName: 'preuve-qa.jpg'
    });
    push(84, 'TEST 84 : Compte bloqué -> déclaration de régularisation autorisée', afterDeclaration.paymentSchedule.find(e => e.monthNumber === 2)?.salaryStatus === 'PENDING_VERIFICATION', 'La seule voie autorisée pendant le blocage reste la régularisation du paiement.');
  } catch (err: any) {
    push(84, 'TEST 84 : Compte bloqué -> déclaration de régularisation autorisée', false, err.message);
  }

  try {
    const { id, entry } = await prepareOverdueEmployer();
    await mockService.blockUser('user-emp-1', 'Échéance non régularisée après J+3.', 'user-admin-1');
    await mockService.confirmMonthlyAction(id, 2, 'DECLARE_SALARY', 'user-emp-1', 'Régularisation', {
      amount: entry.employeeShareAmount, txnId: 'QA-BLOCKED-SALARY-002', proofFileName: 'preuve-qa.jpg'
    });
    const stillLocked = await expectReject(() => mockService.unblockUser('user-emp-1', 'user-admin-1'), 'paiement reste en vérification');
    push(85, 'TEST 85 : Déblocage -> interdit tant que la déclaration est en vérification', stillLocked, 'ADMIN doit attendre la validation du paiement.');
  } catch (err: any) {
    push(85, 'TEST 85 : Déblocage -> interdit tant que la déclaration est en vérification', false, err.message);
  }

  try {
    const { id, entry } = await prepareOverdueEmployer();
    await mockService.blockUser('user-emp-1', 'Échéance non régularisée après J+3.', 'user-admin-1');
    await mockService.confirmMonthlyAction(id, 2, 'DECLARE_SALARY', 'user-emp-1', 'Régularisation', {
      amount: entry.employeeShareAmount, txnId: 'QA-BLOCKED-SALARY-003', proofFileName: 'preuve-qa.jpg'
    });
    await mockService.confirmMonthlyAction(id, 2, 'CONFIRM_SALARY_RECEIVED', 'user-cand-8');
    const unblocked = await mockService.unblockUser('user-emp-1', 'user-admin-1');
    const notifications = await mockService.getNotifications('user-emp-1');
    const hasUnblockNotification = notifications.some(n => n.type === 'ACCOUNT_UNBLOCKED');
    push(86, 'TEST 86 : Paiement validé -> déblocage ADMIN explicite', unblocked.accountStatus === 'ACTIVE' && hasUnblockNotification, `Statut=${unblocked.accountStatus}, notification=${hasUnblockNotification}`);
  } catch (err: any) {
    push(86, 'TEST 86 : Paiement validé -> déblocage ADMIN explicite', false, err.message);
  }

  return { passed: results.every(r => r.success), results };
}
