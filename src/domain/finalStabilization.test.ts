import { mockService } from '../repositories/mockRepository';
import { buildPaymentSchedule } from './businessRules';

export interface StabilizationResult {
  name: string;
  success: boolean;
  details: string;
}

async function expectReject(action: () => Promise<unknown>, matcher?: string | RegExp): Promise<boolean> {
  try { await action(); return false; }
  catch (error: any) {
    const message = String(error?.message || error);
    return matcher ? (matcher instanceof RegExp ? matcher.test(message) : message.includes(matcher)) : true;
  }
}


function addSecondAdminForConcurrency(): void {
  const service = mockService as any;
  const admin = service.users.find((u: any) => u.id === 'user-admin-1');
  if (!admin) throw new Error('ADMIN principal absent.');
  service.users.push({ ...admin, id: 'user-admin-2', publicId: 'LAB-A-000002', email: 'admin2.benin@lelabeur.bj', fullName: 'Cellule Administrative B — QA' });
}

async function prepareBlockedEmployer() {
  mockService.resetAllData();
  const offer = await mockService.createOffer({
    title: 'Blocking QA', employerId: 'user-emp-1', employerName: 'x', employerLocation: 'Cotonou', contractType: 'Mission', remuneration: 100000,
    currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'x', responsibilities: ['x'], conditions: ['x'], selectionProcess: ['Direct'], durationMonths: 3
  }, 'user-emp-1');
  const app = await mockService.applyToOffer(offer.id, 'user-cand-8');
  await mockService.examineApplication(app.id, 'user-emp-1');
  await mockService.shortlistApplication(app.id, 'user-emp-1');
  const contract = await mockService.generateContract({
    offerId: offer.id, applicationId: app.id, employerId: 'user-emp-1', employerName: 'x', employeeId: 'user-cand-8', employeeName: 'x',
    jobTitle: offer.title, missionDescription: 'x', location: 'Cotonou', startDate: '15/07/2026', durationMonths: 3, monthlySalary: 100000, periodicity: 'Mensuel', conditions: []
  }, 'user-emp-1');
  await mockService.signContract(contract.id, 'EMPLOYEE', 'user-cand-8');
  const active = await mockService.getContractById(contract.id);
  if (!active) throw new Error('Contrat QA absent');
  await mockService.login('reine.houenou@bois-agencement.bj', 'EMPLOYER');
  const entry = active.paymentSchedule.find(e => e.monthNumber === 2);
  if (!entry) throw new Error('M2 absent');
  for (const e of active.paymentSchedule) {
    if (e.monthNumber === 1) { e.salaryStatus = 'PAID'; e.commissionStatus = 'NOT_APPLICABLE'; e.commissionAmount = 0; }
    else if (e.monthNumber === 2) { e.salaryStatus = 'DUE'; e.salaryDueDate = '2026-09-01'; e.commissionStatus = 'NOT_APPLICABLE'; e.commissionAmount = 0; }
    else { e.salaryStatus = 'SCHEDULED'; e.commissionStatus = 'NOT_APPLICABLE'; e.commissionAmount = 0; e.salaryDueDate = '2026-11-15'; }
  }
  await mockService.blockUser('user-emp-1', 'Échéance non régularisée après J+3.', 'user-admin-1');
  return { contract: active, entry };
}

export async function runFinalStabilizationTests(): Promise<StabilizationResult[]> {
  const results: StabilizationResult[] = [];
  const check = (name: string, success: boolean, details: string) => results.push({ name, success, details });

  // 1-3. Mock-local idempotency: same key => same object, no duplicate mutation.
  try {
    mockService.resetAllData();
    const data = {
      title: 'Idempotence QA', employerId: 'user-emp-1', employerName: 'IGNORED', employerLocation: 'Cotonou',
      contractType: 'Mission', remuneration: 100000, currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'QA',
      responsibilities: ['QA'], conditions: ['QA'], selectionProcess: ['Direct'], durationMonths: 1
    };
    const before = (await mockService.getAllOffers()).length;
    const a = await mockService.createOffer(data, 'user-emp-1', 'idem-offer-001');
    const b = await mockService.createOffer(data, 'user-emp-1', 'idem-offer-001');
    const after = (await mockService.getAllOffers()).length;
    check('Idempotence createOffer', a.id === b.id && after === before + 1, `before=${before}, after=${after}, ids=${a.id}/${b.id}`);
  } catch (e: any) { check('Idempotence createOffer', false, e.message); }

  try {
    mockService.resetAllData();
    const before = (await mockService.getMessages('CONV-001', 'user-cand-1')).length;
    const a = await mockService.sendMessage('CONV-001', 'Retry QA', 'user-cand-1', 'CANDIDATE', 'idem-msg-001');
    const b = await mockService.sendMessage('CONV-001', 'Retry QA', 'user-cand-1', 'CANDIDATE', 'idem-msg-001');
    const after = (await mockService.getMessages('CONV-001', 'user-cand-1')).length;
    check('Idempotence sendMessage', a.id === b.id && after === before + 1, `before=${before}, after=${after}, ids=${a.id}/${b.id}`);
  } catch (e: any) { check('Idempotence sendMessage', false, e.message); }

  try {
    mockService.resetAllData();
    const proposal = {
      conversationId: 'CONV-002', employerId: 'user-emp-2', employeeId: 'user-cand-2', employerName: 'IGNORED', employeeName: 'IGNORED',
      offerId: 'OFFER-002', applicationId: 'APP-002', missionTitle: 'QA proposal', amount: 100000, currency: 'FCFA',
      startDate: '15 Octobre 2026', durationMonths: 2, periodicity: 'Mensuel' as const, location: 'Calavi', conditions: []
    };
    const a = await mockService.sendProposal('CONV-002', proposal, 'user-emp-2', 'idem-prop-001');
    const b = await mockService.sendProposal('CONV-002', proposal, 'user-emp-2', 'idem-prop-001');
    check('Idempotence sendProposal', a.id === b.id, `ids=${a.id}/${b.id}`);
  } catch (e: any) { check('Idempotence sendProposal', false, e.message); }

  // 4. Reusing a key for a different command payload must not silently alias.
  try {
    mockService.resetAllData();
    const data = {
      title: 'Idempotence conflict', employerId: 'user-emp-1', employerName: 'IGNORED', employerLocation: 'Cotonou', contractType: 'Mission',
      remuneration: 100000, currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'QA', responsibilities: ['QA'], conditions: ['QA'], selectionProcess: ['Direct'], durationMonths: 1
    };
    await mockService.createOffer(data, 'user-emp-1', 'idem-conflict');
    const blocked = await expectReject(() => mockService.createOffer({ ...data, title: 'Different' }, 'user-emp-1', 'idem-conflict'), 'Clé d’idempotence');
    check('Idempotence key conflict', blocked, 'Une même clé ne peut pas être réutilisée pour une commande différente.');
  } catch (e: any) { check('Idempotence key conflict', false, e.message); }

  // 5. Already-open blocked session remains unable to perform sensitive mutations.
  try {
    const { contract, entry } = await prepareBlockedEmployer();
    const blockedCreate = await expectReject(() => mockService.createOffer({
      title: 'Blocked employer', employerId: 'user-emp-1', employerName: 'x', employerLocation: 'Cotonou', contractType: 'Mission', remuneration: 100000,
      currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'x', responsibilities: ['x'], conditions: ['x'], selectionProcess: ['x'], durationMonths: 1
    }, 'user-emp-1'), 'COMPTE BLOQUÉ');
    const current = await mockService.getContractById(contract.id);
    const dueEntry = current?.paymentSchedule.find(e => e.monthNumber === 2);
    if (!current || !dueEntry) throw new Error('Échéance M2 de régularisation absente.');
    const allowedRegularization = await mockService.confirmMonthlyAction(contract.id, 2, 'DECLARE_SALARY', 'user-emp-1', 'regularization', {
      amount: dueEntry.employeeShareAmount, txnId: 'BLOCKED-REG-001', proofFileName: 'proof.jpg'
    });
    check('Blocked open session', blockedCreate && allowedRegularization.paymentSchedule.find(e => e.monthNumber === 2)?.salaryStatus === 'PENDING_VERIFICATION', 'Mutation métier refusée, régularisation autorisée.');
  } catch (e: any) { check('Blocked open session', false, e.message); }

  // 6. Two admins cannot finalize the same payment with contradictory decisions.
  try {
    mockService.resetAllData();
    addSecondAdminForConcurrency();
    const a = await mockService.verifyCommissionPayment('PAY-001', 'user-admin-1');
    const paymentContract = await mockService.getContractById(a.contractId);
    const paymentEntry = paymentContract?.paymentSchedule.find(e => e.monthNumber === a.monthNumber);
    const paymentLedger = paymentContract?.commissionLedger.find(l => l.monthNumber === a.monthNumber);
    const secondRejected = await expectReject(() => mockService.rejectCommissionPayment('PAY-001', 'Conflit QA', 'user-admin-2'), 'Seul un paiement en vérification');
    check('Concurrent payment decision', a.status === 'PAID' && paymentEntry?.commissionStatus === 'PAID' && paymentLedger?.status === 'PAID' && secondRejected, `payment=${a.status}, schedule=${paymentEntry?.commissionStatus}, ledger=${paymentLedger?.status}`);
  } catch (e: any) { check('Concurrent payment decision', false, e.message); }

  // 7. Two admins cannot finalize the same incident twice.
  try {
    mockService.resetAllData();
    addSecondAdminForConcurrency();
    const a = await mockService.arbitrateIncident('INC-001', 'CONTINUER', 'Décision A', 'ADMIN A', 'user-admin-1');
    const incidentContract = await mockService.getContractById('CTR-003');
    const second = await expectReject(() => mockService.arbitrateIncident('INC-001', 'ANNULER', 'Décision B', 'ADMIN B', 'user-admin-2'), 'déjà traité');
    check('Concurrent incident decision', a.status === 'RESOLVED' && incidentContract?.status === 'ACTIVE' && incidentContract.history.some(h => h.event === 'INCIDENT_DECIDED_CONTINUE') && second, `incident=${a.status}, contract=${incidentContract?.status}`);
  } catch (e: any) { check('Concurrent incident decision', false, e.message); }

  // 8. Block then unblock on the same overdue account cannot bypass the due payment.
  try {
    const { contract } = await prepareBlockedEmployer();
    addSecondAdminForConcurrency();
    const blocked = await mockService.getProfile('user-emp-1', 'user-admin-1');
    const unblockBlocked = await expectReject(() => mockService.unblockUser('user-emp-1', 'user-admin-2'), 'échéance reste due');
    const notifications = await mockService.getNotifications('user-emp-1', 'EMPLOYER');
    check('Concurrent block/unblock', blocked?.accountStatus === 'BLOCKED' && unblockBlocked && notifications.some(n => n.type === 'ACCOUNT_BLOCKED'), `status=${blocked?.accountStatus}, blockedNotif=${notifications.some(n => n.type === 'ACCOUNT_BLOCKED')}`);
  } catch (e: any) { check('Concurrent block/unblock', false, e.message); }

  // 9. Last-place competition: only one contract can activate the offer.
  try {
    mockService.resetAllData();
    const offer = await mockService.createOffer({
      title: 'One-slot QA', employerId: 'user-emp-1', employerName: 'x', employerLocation: 'Cotonou', contractType: 'Mission', remuneration: 100000,
      currency: 'FCFA', location: 'Cotonou', skills: ['QA'], summary: 'x', responsibilities: ['x'], conditions: ['x'], selectionProcess: ['x'], durationMonths: 1
    }, 'user-emp-1');
    const a = await mockService.applyToOffer(offer.id, 'user-cand-1');
    const b = await mockService.applyToOffer(offer.id, 'user-cand-2');
    await mockService.examineApplication(a.id, 'user-emp-1');
    await mockService.shortlistApplication(a.id, 'user-emp-1');
    await mockService.examineApplication(b.id, 'user-emp-1');
    await mockService.shortlistApplication(b.id, 'user-emp-1');
    const c1 = await mockService.generateContract({ offerId: offer.id, applicationId: a.id, employerId: 'user-emp-1', employerName: 'x', employeeId: 'user-cand-1', employeeName: 'x', jobTitle: offer.title, missionDescription: 'x', location: 'Cotonou', startDate: '15/10/2026', durationMonths: 1, monthlySalary: 100000, periodicity: 'Mensuel', conditions: [] }, 'user-emp-1');
    await mockService.signContract(c1.id, 'EMPLOYEE', 'user-cand-1');
    const secondContract = await expectReject(() => mockService.generateContract({ offerId: offer.id, applicationId: b.id, employerId: 'user-emp-1', employerName: 'x', employeeId: 'user-cand-2', employeeName: 'x', jobTitle: offer.title, missionDescription: 'x', location: 'Cotonou', startDate: '15/10/2026', durationMonths: 1, monthlySalary: 100000, periodicity: 'Mensuel', conditions: [] }, 'user-emp-1'));
    const finalOffer = await mockService.getOfferById(offer.id);
    await mockService.login('reine.houenou@bois-agencement.bj', 'EMPLOYER');
    const finalA = await mockService.getContractById(c1.id);
    const finalApps = [await mockService.getApplicationsByOffer(offer.id)];
    const apps = finalApps[0];
    check('Concurrent candidate last place', secondContract && finalOffer?.status === 'FILLED' && apps.find(x => x.id === a.id)?.status === 'HIRED' && apps.find(x => x.id === b.id)?.status === 'CLOSED_OFFER_FILLED' && finalA?.status === 'ACTIVE', `offer=${finalOffer?.status}, A=${apps.find(x => x.id === a.id)?.status}, B=${apps.find(x => x.id === b.id)?.status}`);
  } catch (e: any) { check('Concurrent candidate last place', false, e.message); }

  // 10-14. Calendar boundary dates and durations.
  try {
    const cases = [
      ['31/01/2027', ['2027-02-28','2027-03-31','2027-04-30']],
      ['29/01/2028', ['2028-02-29','2028-03-29','2028-04-29']],
      ['30/04/2027', ['2027-05-30','2027-06-30','2027-07-30']],
      ['31/05/2027', ['2027-06-30','2027-07-31','2027-08-31']],
      ['31/07/2027', ['2027-08-31','2027-09-30','2027-10-31']],
      ['31/08/2027', ['2027-09-30','2027-10-31','2027-11-30']],
    ] as const;
    for (const [start, expected] of cases) {
      const schedule = buildPaymentSchedule({ contractId: 'DATE-QA', startDate: start, durationMonths: 3, monthlySalary: 100000, currency: 'FCFA' });
      const actual = schedule.map(e => e.salaryDueDate);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${start}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
    check('Calendar boundary dates', true, '28/02, 29/02 bissextile, 30/04, 31/05, 31/07, 31/08 vérifiés.');
  } catch (e: any) { check('Calendar boundary dates', false, e.message); }

  try {
    for (const duration of [1, 2, 12]) {
      const schedule = buildPaymentSchedule({ contractId: `DURATION-${duration}`, startDate: '15/10/2026', durationMonths: duration, monthlySalary: 100000, currency: 'FCFA' });
      if (schedule.length !== duration || schedule[0].monthNumber !== 1 || schedule[duration - 1].monthNumber !== duration) throw new Error(`Durée ${duration} invalide.`);
    }
    check('Contract durations 1/2/12 months', true, 'Calendriers de 1, 2 et 12 mois matérialisés correctement.');
  } catch (e: any) { check('Contract durations 1/2/12 months', false, e.message); }

  // 15-17. Global/admin reads.
  try {
    mockService.resetAllData();
    const nonAdmin = await expectReject(() => mockService.getRevenueMetrics('user-emp-1'), 'ADMIN uniquement');
    const admin = await mockService.getRevenueMetrics('user-admin-1');
    check('ADMIN revenue metrics', nonAdmin && typeof admin.totalGenerated === 'number', `nonAdmin=${nonAdmin}`);
  } catch (e: any) { check('ADMIN revenue metrics', false, e.message); }

  try {
    mockService.resetAllData();
    const nonAdmin = await expectReject(() => mockService.getAllAuditLogs('user-emp-1'), 'ADMIN uniquement');
    const admin = await mockService.getAllAuditLogs('user-admin-1');
    check('ADMIN audit logs', nonAdmin && Array.isArray(admin), `nonAdmin=${nonAdmin}, adminCount=${admin.length}`);
  } catch (e: any) { check('ADMIN audit logs', false, e.message); }

  try {
    mockService.resetAllData();
    const self = await mockService.getProfile('user-emp-1', 'user-emp-1');
    const cross = await expectReject(() => mockService.getProfile('user-cand-1', 'user-emp-1'), 'profil d’un autre utilisateur');
    const admin = await mockService.getProfile('user-cand-1', 'user-admin-1');
    check('Profile scoping', Boolean(self?.id === 'user-emp-1' && admin?.id === 'user-cand-1' && cross), `self=${self?.id}, admin=${admin?.id}, cross=${cross}`);
  } catch (e: any) { check('Profile scoping', false, e.message); }

  return results;
}
