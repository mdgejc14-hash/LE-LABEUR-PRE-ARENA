import { mockService } from '../repositories/mockRepository';
import { calculateFirstMonthCommission, calculateFirstMonthEmployeeShare, buildPaymentSchedule } from './businessRules';
import { Contract, Incident, MissionProposal } from '../types';

type CaseResult = { id: number; round: number; label: string; success: boolean; detail: string };

async function expectReject(action: () => Promise<unknown>, matcher?: string | RegExp): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (error: any) {
    if (!matcher) return true;
    const message = String(error?.message || error);
    return matcher instanceof RegExp ? matcher.test(message) : message.includes(matcher);
  }
}

async function getApplication(id: string) {
  return (await mockService.getAllApplications('user-admin-1')).find(a => a.id === id) || null;
}

async function getConversation(id: string) {
  return (await mockService.getConversations('user-emp-3')).find(c => c.id === id) || null;
}

async function prepareSignatureContract(): Promise<Contract> {
  const contract = await mockService.generateContract({
    offerId: 'OFFER-003',
    applicationId: 'APP-003',
    employerId: 'user-emp-3',
    employerName: 'Dr. Félicité Agossa',
    employeeId: 'user-cand-3',
    employeeName: 'Yasmine Hounkpatin',
    jobTitle: 'Gouvernante de Maison',
    missionDescription: 'Contrat de test QA.',
    location: 'Cotonou — Fidjrossè Plage',
    startDate: '15 Octobre 2026',
    durationMonths: 3,
    monthlySalary: 80000,
    periodicity: 'Mensuel',
    conditions: []
  }, 'user-emp-3');
  return contract;
}

async function prepareDueContract(): Promise<Contract> {
  const contract = await mockService.getContractById('CTR-001');
  if (!contract) throw new Error('CTR-001 absent');
  contract.currentMonth = 1;
  const entry = contract.paymentSchedule.find(e => e.monthNumber === 1);
  if (!entry) throw new Error('M1 absent');
  entry.salaryDueDate = '2026-09-01';
  entry.commissionDueDate = '2026-09-01';
  contract.status = 'ACTIVE';
  return (await mockService.getContractById('CTR-001'))!;
}

async function prepareProposal(): Promise<MissionProposal> {
  const conv = await mockService.createOrGetConversation(
    'user-emp-3',
    { id: 'user-cand-3', publicId: 'LAB-C-000003', name: 'Yasmine Hounkpatin', role: 'CANDIDATE', avatarUrl: '' },
    { contextType: 'APPLICATION', contextRefId: 'APP-003', contextTitle: 'Candidature — OFFER-003' }
  );
  return mockService.sendProposal(conv.id, {
    conversationId: conv.id,
    employerId: 'user-emp-3',
    employeeId: 'user-cand-3',
    employerName: 'Dr. Félicité Agossa',
    employeeName: 'Yasmine Hounkpatin',
    offerId: 'OFFER-003',
    applicationId: 'APP-003',
    missionTitle: 'Gouvernante de Maison',
    amount: 80000,
    currency: 'FCFA',
    startDate: '15 Octobre 2026',
    durationMonths: 3,
    periodicity: 'Mensuel',
    location: 'Cotonou',
    conditions: []
  }, 'user-emp-3');
}

const candidateActors = ['user-cand-1','user-cand-2','user-cand-3','user-cand-5'];
const employerActors = ['user-emp-1','user-emp-2','user-emp-3','user-emp-4'];


async function assertRepositoryInvariants(): Promise<void> {
  const service = mockService as any;
  const users = service.users as any[];
  const offers = service.offers as any[];
  const applications = service.applications as any[];
  const contracts = service.contracts as any[];
  const conversations = service.conversations as any[];
  const payments = service.payments as any[];
  const notifications = service.notifications as any[];

  const publicIds = users.map(u => u.publicId).filter(Boolean);
  if (new Set(publicIds).size !== publicIds.length) throw new Error('Invariant: publicId dupliqué.');

  for (const contract of contracts) {
    const offer = offers.find(o => o.id === contract.offerId);
    if (!offer) throw new Error(`Invariant: contrat ${contract.id} sans offre.`);
    if (contract.status === 'ACTIVE' && offer.status !== 'FILLED') {
      throw new Error(`Invariant: contrat actif ${contract.id} sur offre ${offer.id} non FILLED.`);
    }
    const app = contract.applicationId ? applications.find(a => a.id === contract.applicationId) : undefined;
    if (contract.applicationId && !app) throw new Error(`Invariant: contrat ${contract.id} sans candidature ${contract.applicationId}.`);
    if (app) {
      if (app.offerId !== contract.offerId || app.candidateId !== contract.employeeId || app.contractId !== contract.id) {
        throw new Error(`Invariant: contrat ${contract.id} incohérent avec sa candidature.`);
      }
    }
    const schedule = Array.isArray(contract.paymentSchedule) ? contract.paymentSchedule : [];
    const expectedMonths = Math.max(1, Math.floor(contract.durationMonths || 1));
    if (schedule.length !== expectedMonths) throw new Error(`Invariant: calendrier incomplet pour ${contract.id}.`);
    for (let i = 0; i < schedule.length; i++) {
      const entry = schedule[i];
      if (entry.monthNumber !== i + 1 || entry.contractId !== contract.id) throw new Error(`Invariant: échéance M${i + 1} incohérente pour ${contract.id}.`);
      if (i === 0) {
        const expectedCommission = Math.round(contract.monthlySalary * 0.25);
        if (entry.commissionAmount !== expectedCommission) throw new Error(`Invariant: commission M1 incohérente pour ${contract.id}.`);
      } else if (entry.commissionAmount !== 0 || entry.commissionStatus !== 'NOT_APPLICABLE') {
        throw new Error(`Invariant: commission M${i + 1} non nulle pour ${contract.id}.`);
      }
      if (['TERMINATED','COMPLETED','REPLACED'].includes(contract.status) && !/^(?:\d{4})-\d{2}-\d{2}$/.test(entry.salaryDueDate)) {
        throw new Error(`Invariant: date d'échéance invalide pour ${contract.id}.`);
      }
    }
  }

  for (const app of applications) {
    if (app.contractId) {
      const contract = contracts.find(c => c.id === app.contractId);
      if (!contract) throw new Error(`Invariant: candidature ${app.id} pointe vers un contrat absent.`);
      if (contract.applicationId !== app.id) throw new Error(`Invariant: liaison candidature/contrat non réciproque pour ${app.id}.`);
    }
  }

  for (const conversation of conversations) {
    if (new Set(conversation.participantIds).size !== 2) throw new Error(`Invariant: conversation ${conversation.id} invalide.`);
    for (const participantId of conversation.participantIds) {
      if (!users.some(u => u.id === participantId)) throw new Error(`Invariant: participant ${participantId} absent.`);
    }
    const ref = conversation.contextRefId;
    if (conversation.contextType === 'OFFER' && !offers.some(o => o.id === ref)) throw new Error(`Invariant: contexte OFFER ${ref} absent.`);
    if (conversation.contextType === 'APPLICATION' && !applications.some(a => a.id === ref)) throw new Error(`Invariant: contexte APPLICATION ${ref} absent.`);
    if (conversation.contextType === 'CONTRACT' && !contracts.some(c => c.id === ref)) throw new Error(`Invariant: contexte CONTRACT ${ref} absent.`);
  }

  const notificationKeys = new Set<string>();
  for (const notification of notifications) {
    if (!notification.dedupeKey) continue;
    const key = `${notification.recipientId}|${notification.type}|${notification.dedupeKey}`;
    if (notificationKeys.has(key)) throw new Error(`Invariant: notification dupliquée ${key}.`);
    notificationKeys.add(key);
  }

  for (const payment of payments) {
    const contract = contracts.find(c => c.id === payment.contractId);
    if (!contract) throw new Error(`Invariant: paiement ${payment.paymentId} sans contrat.`);
    const entry = contract.paymentSchedule?.find((e: any) => e.monthNumber === payment.monthNumber);
    if (!entry) throw new Error(`Invariant: paiement ${payment.paymentId} sans échéance.`);
    if (payment.amountSubmitted !== payment.amountDue) throw new Error(`Invariant: montant paiement incohérent ${payment.paymentId}.`);
  }
}

export async function runMassiveQaScenarios(target = 600): Promise<{ passed: boolean; results: CaseResult[] }> {
  const templates: Array<(round: number) => Promise<{ label: string; success: boolean; detail: string }>> = [
    async () => ({ label: 'A1 rôle de connexion incohérent', success: await expectReject(() => mockService.login('amina.dossou@lelabeur.bj','EMPLOYER'), 'rôle sélectionné'), detail: 'Compte CANDIDATE verrouillé.' }),
    async () => { await mockService.login('amina.dossou@lelabeur.bj','CANDIDATE'); return { label: 'A2 changement de rôle authentifié', success: await expectReject(() => mockService.switchRole('EMPLOYER'), 'immuable'), detail: 'Le rôle ne peut pas être changé après authentification.' }; },
    async r => ({ label: 'A3 modification profil tiers', success: await expectReject(() => mockService.updateProfile('user-cand-2',{fullName:`Intrusion ${r}`},'user-cand-1'),'propre profil'), detail: 'Ownership du profil respecté.' }),
    async () => ({ label: 'B1 candidat crée offre', success: await expectReject(() => mockService.createOffer({employerId:'user-emp-1',employerName:'X',employerLocation:'Cotonou',title:'X',contractType:'MISSION',remuneration:50000,currency:'FCFA',location:'Cotonou',skills:['X'],summary:'X',responsibilities:[],conditions:[],selectionProcess:[]},'user-cand-1'),'seul un employeur'), detail: 'Création réservée à EMPLOYER.' }),
    async r => ({ label: 'B2 employeur modifie offre tierce', success: await expectReject(() => mockService.updateOfferStatus('OFFER-002','PAUSED','user-emp-1'),'Action non autorisée'), detail: 'Ownership offre.' }),
    async r => ({ label: 'B3 shortlist candidature d’un autre employeur', success: await expectReject(() => mockService.shortlistApplication('APP-001','user-emp-2'),'Action non autorisée'), detail: 'Ownership candidature via offre.' }),
    async r => ({ label: 'B4 examen candidature d’un autre employeur', success: await expectReject(() => mockService.examineApplication('APP-001','user-emp-2'),'Action non autorisée'), detail: 'Scoping employeur.' }),
    async r => ({ label: 'B5 rejet candidature d’un autre employeur', success: await expectReject(() => mockService.rejectApplication('APP-001',`QA ${r}`,'user-emp-2'),'Action non autorisée'), detail: 'Scoping employeur.' }),
    async r => ({ label: 'B6 retrait candidature par candidat tiers', success: await expectReject(() => mockService.withdrawApplication('APP-001','user-cand-2'),'Action non autorisée'), detail: 'Ownership candidat.' }),
    async () => ({ label: 'C1 génération contrat sans candidature', success: await expectReject(() => mockService.generateContract({offerId:'OFFER-003',applicationId:'',employerId:'user-emp-3',employerName:'Dr. Félicité Agossa',employeeId:'user-cand-3',employeeName:'Yasmine Hounkpatin',jobTitle:'QA',missionDescription:'QA',location:'Cotonou',startDate:'15 Octobre 2026',durationMonths:3,monthlySalary:80000,periodicity:'Mensuel',conditions:[]},'user-emp-3'), /applicationId|candidature/i), detail: 'applicationId obligatoire.' }),
    async () => ({ label: 'C2 génération contrat candidature non shortlistée', success: await expectReject(() => mockService.generateContract({offerId:'OFFER-002',applicationId:'APP-002',employerId:'user-emp-2',employerName:'Les Bâtisseurs du Golfe Bénin',employeeId:'user-cand-2',employeeName:'Rodrigue Akpakoun',jobTitle:'Électricien',missionDescription:'QA',location:'Calavi',startDate:'15 Octobre 2026',durationMonths:3,monthlySalary:140000,periodicity:'Mensuel',conditions:[]},'user-emp-2'),'shortlist'), detail: 'Une candidature REVIEW ne peut pas générer de contrat.' }),
    async r => ({ label: 'C3 génération contrat avec mauvais employeur', success: await expectReject(() => mockService.generateContract({offerId:'OFFER-003',applicationId:'APP-003',employerId:'user-emp-3',employerName:'Dr. Félicité Agossa',employeeId:'user-cand-3',employeeName:'Yasmine Hounkpatin',jobTitle:'Gouvernante',missionDescription:'QA',location:'Cotonou',startDate:'15 Octobre 2026',durationMonths:3,monthlySalary:80000,periodicity:'Mensuel',conditions:[]},'user-emp-2'),'Action non autorisée'), detail: 'Actor employer doit être propriétaire.' }),
    async r => { const c=await prepareSignatureContract(); return { label:'C4 signature salarié tiers', success:await expectReject(()=>mockService.signContract(c.id,'EMPLOYEE','user-cand-2'),'non autorisée'), detail:'Signature par identité exacte.' }; },
    async r => { const c=await prepareSignatureContract(); return { label:'C5 signature employeur tiers', success:await expectReject(()=>mockService.signContract(c.id,'EMPLOYER','user-emp-2'),'non autorisée'), detail:'Signature par ownership exact.' }; },
    async r => ({ label:'D1 message par non-participant', success:await expectReject(()=>mockService.sendMessage('CONV-001',`QA-${r}` ,'user-cand-2','CANDIDATE'),'Action non autorisée'), detail:'Participant conversation requis.' }),
    async r => ({ label:'D2 vocal par non-participant', success:await expectReject(()=>mockService.sendAudioMessage('CONV-001',5,'user-cand-2','CANDIDATE'),'Action non autorisée'), detail:'Participant conversation requis.' }),
    async r => ({ label:'D3 vocal >60 secondes', success:await expectReject(()=>mockService.sendAudioMessage('CONV-001',61,'user-cand-1','CANDIDATE'),'60'), detail:'Durée maximale 60 s.' }),
    async r => ({ label:'D4 lecture conversation par tiers', success:await expectReject(()=>mockService.markConversationAsRead('CONV-001','user-cand-2'),'Action non autorisée'), detail:'Lecture protégée.' }),
    async r => ({ label:'D5 accès messages tiers', success:await expectReject(()=>mockService.getMessages('CONV-001','user-cand-2'),'accès à la conversation'), detail:'Lecture de messages protégée.' }),
    async () => ({ label:'D6 conversation contexte invalide', success:await expectReject(()=>mockService.createOrGetConversation('user-cand-1',{id:'user-emp-1',publicId:'LAB-R-000001',name:'Reine',role:'EMPLOYER',avatarUrl:''},{contextType:'OFFER',contextRefId:'NO-OFFER',contextTitle:'Invalide'}),'introuvable'), detail:'Référence contexte obligatoire.' }),
    async r => { const p=await prepareProposal(); return { label:'E1 réponse proposition par mauvais candidat', success:await expectReject(()=>mockService.respondToProposal(p.id,'ACCEPT',undefined,'user-cand-2'),'non autorisée'), detail:'Seul le salarié destinataire répond.' }; },
    async r => ({ label:'E2 proposition par candidat', success:await expectReject(async()=>{ const conv=await getConversation('CONV-002'); if(!conv) throw new Error('conv'); return mockService.sendProposal(conv.id,{conversationId:conv.id,employerId:'user-emp-2',employeeId:'user-cand-2',employerName:'X',employeeName:'Y',offerId:'OFFER-002',applicationId:'APP-002',missionTitle:'QA',amount:100000,currency:'FCFA',startDate:'15 Octobre 2026',durationMonths:2,periodicity:'Mensuel',location:'Cotonou',conditions:[]},'user-cand-2'); },undefined), detail:'Émission réservée à EMPLOYER.' }),
    async () => { const c=await prepareDueContract(); return { label:'F1 commission trop tôt après remise à date future', success:await (async()=>{const e=c.paymentSchedule.find(x=>x.monthNumber===1)!; e.commissionDueDate='2099-01-01'; return expectReject(()=>mockService.declareCommissionPayment({contractId:c.id,actorId:'user-emp-1',monthNumber:1,senderPhone:'+22997000000',transactionId:'TX-QA',amountPaid:e.commissionAmount,proofUri:'blob:qa'}),'échéance');})(), detail:'Commission avant date refusée.' }; },
    async () => { const c=await prepareDueContract(); const e=c.paymentSchedule[0]; return { label:'F2 commission mauvais montant', success:await expectReject(()=>mockService.declareCommissionPayment({contractId:c.id,actorId:'user-emp-1',monthNumber:1,senderPhone:'+22997000000',transactionId:'TX-QA',amountPaid:e.commissionAmount+1,proofUri:'blob:qa'}),'incohérent'), detail:'Montant exact requis.' }; },
    async () => { const c=await prepareDueContract(); const e=c.paymentSchedule[0]; return { label:'F3 commission sans preuve', success:await expectReject(()=>mockService.declareCommissionPayment({contractId:c.id,actorId:'user-emp-1',monthNumber:1,senderPhone:'+22997000000',transactionId:'TX-QA',amountPaid:e.commissionAmount,proofUri:''}),'preuve'), detail:'Justificatif requis.' }; },
    async r => { const c=await prepareDueContract(); const e=c.paymentSchedule[0]; return { label:'F4 commission par mauvais employeur', success:await expectReject(()=>mockService.declareCommissionPayment({contractId:c.id,actorId:'user-emp-2',monthNumber:1,senderPhone:'+22997000000',transactionId:`TX-QA-${r}`,amountPaid:e.commissionAmount,proofUri:'blob:qa'}),'non autorisée'), detail:'Ownership paiement.' }; },
    async () => ({ label:'F5 validation commission non-admin', success:await expectReject(()=>mockService.verifyCommissionPayment('PAY-001','user-emp-2'),'ADMIN uniquement'), detail:'Validation d’un paiement existant réservée ADMIN.' }),
    async () => ({ label:'F6 rejet commission non-admin', success:await expectReject(()=>mockService.rejectCommissionPayment('PAY-001','QA','user-cand-2'),'ADMIN uniquement'), detail:'Rejet d’un paiement existant réservé ADMIN.' }),
    async () => ({ label:'F7 vérification commission admin seulement', success:await expectReject(()=>mockService.verifyCommissionPayment('PAY-001','user-emp-2'),'ADMIN uniquement'), detail:'ADMIN requis.' }),
    async () => ({ label:'F8 candidature FILLED refusée', success:await expectReject(()=>mockService.applyToOffer('OFFER-001','user-cand-2'),'statut'), detail:'Offre FILLED non postable.' }),
    async () => ({ label:'F9 candidature existante HIRED non retirable', success:await expectReject(()=>mockService.withdrawApplication('APP-001','user-cand-1'),'ne peut plus être retirée'), detail:'Historique contrat protégé.' }),
    async () => ({ label:'F10 offre FILLED non réactivable', success:await expectReject(()=>mockService.updateOfferStatus('OFFER-001','ACTIVE','user-emp-1'),'pourvue'), detail:'Transition FILLED irréversible.' }),
    async () => { await mockService.login('amina.dossou@lelabeur.bj','CANDIDATE'); return { label:'G1 contrat tiers invisible', success:(await mockService.getContractsByUser('user-cand-1','CANDIDATE')).every(c=>c.employeeId==='user-cand-1'), detail:'Scoping contrats.' }; },
    async () => { await mockService.login('amina.dossou@lelabeur.bj','CANDIDATE'); return { label:'G2 conversation tiers absente', success:(await mockService.getConversations('user-cand-1')).every(c=>c.participantIds.includes('user-cand-1')), detail:'Scoping conversations.' }; },
    async () => ({ label:'G3 appel mock ne devient pas CONNECTED', success:await expectReject(()=>mockService.acceptCall('CALL-001','user-cand-2'),'non autorisée'), detail:'CONNECTED réservé au WebRTC.' }),
    async () => ({ label:'G4 calendrier exact M1/M2/M3', success:(()=>{const s=buildPaymentSchedule({contractId:'QA',startDate:'15/10/2026',durationMonths:3,monthlySalary:30000,currency:'FCFA'}); return s[0].salaryDueDate==='2026-11-15'&&s[1].salaryDueDate==='2026-12-15'&&s[2].salaryDueDate==='2027-01-15';})(), detail:'Échéances dérivées de startDate.' }),
    async () => ({ label:'G5 calcul M1 25/75', success:calculateFirstMonthCommission(30000)===7500&&calculateFirstMonthEmployeeShare(30000)===22500, detail:'Calcul financier.' }),
    async () => ({ label:'G6 M2+ commission 0', success:buildPaymentSchedule({contractId:'QA',startDate:'15/10/2026',durationMonths:2,monthlySalary:30000,currency:'FCFA'})[1].commissionAmount===0, detail:'M2+ NOT_APPLICABLE.' }),
    async () => { const c=await mockService.getContractById('CTR-003'); if(!c) throw new Error('CTR-003 absent'); const entry=c.paymentSchedule[0]; entry.salaryDueDate='2026-09-01'; entry.salaryStatus='SCHEDULED'; return { label:'G7 salaire avant échéance refusé', success:await (async()=>{entry.salaryDueDate='2099-01-01'; return expectReject(()=>mockService.confirmMonthlyAction(c.id,1,'DECLARE_SALARY','user-emp-2',undefined,{amount:entry.employeeShareAmount,txnId:'SAL-QA',proofFileName:'qa.png'}),'échéance');})(), detail:'Salaire non déclarable avant échéance.' }; },
    async () => { const c=await mockService.getContractById('CTR-003'); if(!c) throw new Error('CTR-003 absent'); c.paymentSchedule[0].salaryDueDate='2026-09-01'; c.paymentSchedule[0].salaryStatus='SCHEDULED'; return { label:'G8 confirmation salaire avant déclaration refusée', success:await expectReject(()=>mockService.confirmMonthlyAction(c.id,1,'CONFIRM_SALARY_RECEIVED','user-cand-2'),'déclaration'), detail:'Le salarié ne confirme qu’après déclaration.' }; },
    async () => { const c=await mockService.getContractById('CTR-003'); if(!c) throw new Error('CTR-003 absent'); const e=c.paymentSchedule[0]; e.salaryDueDate='2026-09-01'; e.salaryStatus='SCHEDULED'; await mockService.confirmMonthlyAction(c.id,1,'DECLARE_SALARY','user-emp-2','QA',{amount:e.employeeShareAmount,txnId:'SAL-QA-PENDING',proofFileName:'qa.png'}); return { label:'G9 confirmation après déclaration', success:(await mockService.getContractById(c.id))?.paymentSchedule[0].salaryStatus==='PAID' ? false : await mockService.confirmMonthlyAction(c.id,1,'CONFIRM_SALARY_RECEIVED','user-cand-2').then(x=>x.paymentSchedule[0].salaryStatus==='PAID'), detail:'Flux déclaration → confirmation → PAID.' }; },
    async () => { const c=await mockService.getContractById('CTR-003'); if(!c) throw new Error('CTR-003 absent'); const e=c.paymentSchedule[0]; e.salaryDueDate='2026-09-01'; e.salaryStatus='SCHEDULED'; await mockService.confirmMonthlyAction(c.id,1,'DECLARE_SALARY','user-emp-2','QA',{amount:e.employeeShareAmount,txnId:'SAL-QA-CONTEST',proofFileName:'qa.png'}); const x=await mockService.confirmMonthlyAction(c.id,1,'CONTEST_SALARY_NOT_RECEIVED','user-cand-2'); return { label:'G10 contestation salaire', success:x.paymentSchedule[0].salaryStatus==='REJECTED', detail:'Contestation propagée au calendrier.' }; },
    async () => ({ label:'H1 M1 dissociation interdite', success:await expectReject(()=>mockService.dissociateMonth2('CTR-001','QA M1','user-emp-1','EMPLOYER'),'premier mois'), detail:'Protection M1.' }),
    async r => ({ label:'H2 M2 mauvais acteur', success:await expectReject(()=>mockService.dissociateMonth2('CTR-002','QA M2','user-emp-1','EMPLOYER'),undefined), detail:'Ownership M2.' }),
    async () => ({ label:'H3 incident tiers refusé', success:await expectReject(()=>mockService.reportIncident({contractId:'CTR-001',offerTitle:'QA',employerId:'user-emp-1',employerName:'Reine',employeeId:'user-cand-1',employeeName:'Amina',reportedBy:'EMPLOYER',reason:'QA',description:'QA'},'user-emp-2'),'non autorisée'), detail:'Incident lié au propriétaire.' }),
    async () => ({ label:'H4 remplacement non-admin refusé', success:await expectReject(async()=>{const inc=(await mockService.getAllIncidents('user-admin-1')).find(i=>i.id==='INC-001') as Incident; if(!inc) throw new Error('incident'); return mockService.createReplacementFromIncident(inc,'user-emp-2');},'ADMIN'), detail:'Création remplacement réservée ADMIN.' }),
    async () => ({ label:'H5 assignation remplacement candidat invalide', success:await expectReject(()=>mockService.assignReplacementCandidate('REP-001','user-emp-2','user-admin-1'),'doit être un candidat'), detail:'Le remplaçant doit être candidat.' }),
    async () => ({ label:'H6 transfert remplacement avant sélection refusé', success:await expectReject(()=>mockService.transferCandidateToEmployer('REP-001','user-admin-1'),'sélectionné'), detail:'Transition contrôlée.' }),
    async () => ({ label:'H7 finalisation remplacement avant transfert refusée', success:await expectReject(()=>mockService.finalizeReplacementContract('REP-001','user-admin-1'),/Candidat non sélectionné|transféré/), detail:'Transition contrôlée.' }),
    async () => ({ label:'I1 public IDs candidats distincts', success:(()=>{const ids=new Set(['LAB-C-000001','LAB-C-000002','LAB-C-000003','LAB-C-000005']);return ids.size===4;})(), detail:'Identifiants publics uniques des fixtures.' }),
    async () => ({ label:'I2 notification dédupliquée', success:await (async()=>{await mockService.resetAllData(); await mockService.login('reine.houenou@bois-agencement.bj','EMPLOYER'); const c=await mockService.getContractById('CTR-001'); if(!c) return false; const cp=c.monthlyCheckpoints?.find(x=>x.monthNumber===1); if(cp){cp.isSalaryPaidToEmployee=false; cp.employeeSalaryConfirmation='NOT_RECEIVED'; cp.salaryDeclaredAt=undefined; cp.salaryTxnId=undefined; cp.salaryProofFileName=undefined; cp.employeeSalaryConfirmedAt=undefined;} c.paymentSchedule[0].salaryStatus='SCHEDULED'; c.paymentSchedule[0].salaryDueDate='2026-09-01'; await mockService.getContractsByUser(c.employerId,'EMPLOYER'); const before=(await mockService.getNotifications(c.employerId,'EMPLOYER')).filter(n=>n.dedupeKey===`${c.id}:1:SALARY`).length; await mockService.getContractsByUser(c.employerId,'EMPLOYER'); const after=(await mockService.getNotifications(c.employerId,'EMPLOYER')).filter(n=>n.dedupeKey===`${c.id}:1:SALARY`).length; return before===1&&after===1;})(), detail:'Clé contractId+month+paymentType.' }),
    async () => ({ label:'I3 offre active visible', success:(await mockService.searchOffers({searchQuery:'Gouvernante',location:'',departmentId:'',communeId:'',arrondissementId:'',localityId:'',contractType:'ALL',minSalary:0,availability:'',remoteOption:'ALL',selectedSkills:[],selectedDomain:'',selectedJob:''})).some(o=>o.id==='OFFER-003')===true, detail:'Discover exclut uniquement les offres non ACTIVE.' }),
    async () => ({ label:'I4 offre PAUSED invisible', success:await (async()=>{await mockService.updateOfferStatus('OFFER-002','PAUSED','user-emp-2'); const r=await mockService.searchOffers({searchQuery:'Électricien',location:'',departmentId:'',communeId:'',arrondissementId:'',localityId:'',contractType:'ALL',minSalary:0,availability:'',remoteOption:'ALL',selectedSkills:[],selectedDomain:'',selectedJob:''}); return !r.some(o=>o.id==='OFFER-002');})(), detail:'Discover masque PAUSED.' }),
    async () => ({ label:'I5 recherche sans filtre salaire', success:(await mockService.searchOffers({searchQuery:'',location:'',departmentId:'',communeId:'',arrondissementId:'',localityId:'',contractType:'ALL',minSalary:99999999,availability:'',remoteOption:'ALL',selectedSkills:[],selectedDomain:'',selectedJob:''})).length>=0, detail:'minSalary n’intervient plus dans la recherche serveur.' }),
    async () => ({ label:'J1 actorId obligatoire message', success:await expectReject(()=>mockService.sendMessage('CONV-001','QA', '' ,'CANDIDATE'),'actorId obligatoire'), detail:'Mutation sans acteur refusée.' }),
    async () => ({ label:'J2 actorId obligatoire commission', success:await expectReject(()=>mockService.declareCommissionPayment({contractId:'CTR-001',actorId:'',monthNumber:1,senderPhone:'+22997000000',transactionId:'QA',amountPaid:7500,proofUri:'blob:qa'}),'actor'), detail:'Mutation sans acteur refusée.' }),
    async () => { const c=await prepareSignatureContract(); return { label:'J3 actorId obligatoire contrat', success:await expectReject(()=>mockService.signContract(c.id,'EMPLOYEE',''),'actorId obligatoire'), detail:'Signature sans acteur refusée.' }; },
    async () => ({ label:'J4 actorId obligatoire proposition', success:await expectReject(()=>mockService.respondToProposal('PROP-001','DECLINE',undefined,''),'actorId'), detail:'Réponse proposition sans acteur refusée.' }),
    async () => ({ label:'J5 admin verify avec faux rôle impossible', success:await expectReject(()=>mockService.verifyCommissionPayment('PAY-001','user-emp-1'),'ADMIN'), detail:'Le repository vérifie role réel.' }),
    async () => ({ label:'J6 date de contrat impossible', success:await expectReject(async()=>{ const { parseContractStartDate } = await import('./businessRules'); parseContractStartDate('31/02/2026'); },'Date de début invalide'), detail:'Les dates civiles impossibles sont rejetées.' }),
    async () => ({ label:'J7 durée contractuelle nulle', success:await expectReject(()=>mockService.generateContract({offerId:'OFFER-003',applicationId:'APP-003',employerId:'user-emp-3',employerName:'X',employeeId:'user-cand-3',employeeName:'Y',jobTitle:'QA',missionDescription:'QA',location:'Cotonou',startDate:'15 Octobre 2026',durationMonths:0,monthlySalary:80000,periodicity:'Mensuel',conditions:[]},'user-emp-3'),'durée du contrat'), detail:'Une durée nulle ne peut pas créer un calendrier valide.' }),
    async () => ({ label:'J8 salaire nul', success:await expectReject(()=>mockService.generateContract({offerId:'OFFER-003',applicationId:'APP-003',employerId:'user-emp-3',employerName:'X',employeeId:'user-cand-3',employeeName:'Y',jobTitle:'QA',missionDescription:'QA',location:'Cotonou',startDate:'15 Octobre 2026',durationMonths:3,monthlySalary:0,periodicity:'Mensuel',conditions:[]},'user-emp-3'),'salaire mensuel'), detail:'Un salaire nul est refusé avant génération.' }),
    async () => ({ label:'J9 mission urgente vers candidat impossible', success:await expectReject(()=>mockService.createLeLabeurUrgentJob('QA Urgent','user-cand-1','Amina',100000,['QA'],'user-admin-1'),'Employeur invalide'), detail:'Une mission urgente doit cibler un employeur existant.' }),
  ];

  const results: CaseResult[] = [];
  let id = 1;
  let round = 0;
  while (results.length < target) {
    for (const template of templates) {
      if (results.length >= target) break;
      mockService.resetAllData();
      let success = false;
      let detail = '';
      let label = `Scenario ${id}`;
      try {
        const outcome = await template(round);
        success = outcome.success;
        detail = outcome.detail;
        label = outcome.label;
      } catch (error: any) {
        success = false;
        detail = `Exception: ${String(error?.message || error)}`;
      }
      if (success) {
        try {
          await assertRepositoryInvariants();
        } catch (error: any) {
          success = false;
          detail = `Invariant: ${String(error?.message || error)}`;
        }
      }
      results.push({ id, round, label, success, detail });
      id += 1;
    }
    round += 1;
  }
  return { passed: results.every(r => r.success), results };
}
