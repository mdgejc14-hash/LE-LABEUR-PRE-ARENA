import React, { useState } from 'react';
import {
  Briefcase,
  Users,
  Clock,
  ArrowRight,
  Plus,
  DollarSign,
  FileText,
  AlertTriangle,
  MessageSquare,
  Check,
  X,
  Phone,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { EditorialSheet } from '../components/common/EditorialSheet';
import { HairlineDivider } from '../components/common/HairlineDivider';

export const EmployerDashboardScreen: React.FC = () => {
  const {
    currentUser,
    offers,
    applications,
    contracts,
    candidates,
    openOfferDetail,
    openConversationForContext,
    examineApplication,
    shortlistApplication,
    rejectApplication,
    createOffer,
    setScreen,
    setActiveTab,
    paymentDeclarations,
    declareCommission,
    confirmMonthlyAction,
    startAudioCall
  } = useApp();

  const [newOfferModalOpen, setNewOfferModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSalary, setNewSalary] = useState('180000');
  const [newLocation, setNewLocation] = useState('Cotonou — Cadjèhoun Kpota (Littoral)');
  const [newContractType, setNewContractType] = useState('Mission 6 mois');
  const [newSkills, setNewSkills] = useState('Agencement, Lecture de plan, Finition');
  const [newSummary, setNewSummary] = useState('');

  // Payment declaration modal for employer
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentPhone, setPaymentPhone] = useState('+229 97 60 70 80');
  const [paymentTxnId, setPaymentTxnId] = useState('TXN-MTN-8829104');
  const [paymentAmount, setPaymentAmount] = useState('7500');
  const [paymentDate, setPaymentDate] = useState('2026-10-04');
  const [paymentTime, setPaymentTime] = useState('14:30');
  const [paymentReference, setPaymentReference] = useState('REF-LABEUR-001');
  const [paymentProofFileName, setPaymentProofFileName] = useState('capture_recu_momo.png');
  const [paymentNotes, setPaymentNotes] = useState('Règlement Mobile Money / virement.');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'SALARY' | 'COMMISSION'>('COMMISSION');
  const [paymentContractId, setPaymentContractId] = useState<string>('');
  const [paymentMonthNumber, setPaymentMonthNumber] = useState(1);
  const [scheduleTab, setScheduleTab] = useState<'UPCOMING' | 'DUE' | 'PENDING' | 'PAID'>('UPCOMING');
  const [callToast, setCallToast] = useState<string | null>(null);

  // Données de l'employeur connecté
  const myOffers = offers.filter(o => !o.isLeLabeurJob && o.employerId === currentUser?.id);
  const myOfferIds = myOffers.map(o => o.id);
  const myApplications = applications.filter(a => myOfferIds.includes(a.offerId));
  const myContracts = contracts.filter(c => c.employerId === currentUser?.id);

  // RÈGLE 24 & AUDIT : Ne plus confondre offres en recrutement et missions en cours !
  const filledOfferIds = new Set(myContracts.filter(c => c.status === 'ACTIVE').map(c => c.offerId));
  const offersInRecruitment = myOffers.filter(o => o.status === 'ACTIVE' && !filledOfferIds.has(o.id));
  const missionsInProgress = myContracts.filter(c => c.status === 'ACTIVE');
  const pendingApps = myApplications.filter(a => a.status === 'PENDING' || a.status === 'REVIEW');

  // Les échéances sont pilotées par le calendrier du contrat. Une échéance
  // n'est exigible qu'à sa date : aucune condition supplémentaire de confirmation
  // du salaire ne doit rendre la commission artificiellement DUE ou bloquée.
  const scheduleRows = myContracts.flatMap(contract => (contract.paymentSchedule || []).flatMap(entry => {
    const rows: Array<{ contract: typeof contract; monthNumber: number; kind: 'SALARY' | 'COMMISSION'; status: string; amount: number; label: string; employeeName: string }> = [];
    if (entry.salaryStatus !== 'NOT_APPLICABLE') {
      rows.push({
        contract,
        monthNumber: entry.monthNumber,
        kind: 'SALARY',
        status: entry.salaryStatus,
        amount: entry.employeeShareAmount,
        label: `Salaire ${contract.employeeName}`,
        employeeName: contract.employeeName
      });
    }
    if (entry.commissionAmount > 0 && entry.commissionStatus !== 'NOT_APPLICABLE') {
      rows.push({
        contract,
        monthNumber: entry.monthNumber,
        kind: 'COMMISSION',
        status: entry.commissionStatus,
        amount: entry.commissionAmount,
        label: 'Commission LE LABEUR',
        employeeName: contract.employeeName
      });
    }
    return rows;
  }));

  const scheduleFilterMap: Record<typeof scheduleTab, string[]> = {
    UPCOMING: ['SCHEDULED'],
    DUE: ['DUE', 'REJECTED'],
    PENDING: ['PENDING_VERIFICATION'],
    PAID: ['PAID']
  };
  const visibleScheduleRows = scheduleRows.filter(row => scheduleFilterMap[scheduleTab].includes(row.status));
  const dueContracts = myContracts.filter(c => c.paymentSchedule?.some(e => e.commissionStatus === 'DUE' && e.commissionAmount > 0));
  const totalCommissionDue = scheduleRows.filter(row => row.kind === 'COMMISSION' && row.status === 'DUE').reduce((sum, row) => sum + row.amount, 0);

  const handleCreateOffer = async () => {
    if (!newTitle.trim()) return;
    const skillsList = newSkills.split(',').map(s => s.trim()).filter(Boolean);
    await createOffer({
      title: newTitle,
      employerId: currentUser?.id || 'user-emp-1',
      employerName: currentUser?.fullName || "Atelier Bois & Agencement Bénin",
      employerLocation: newLocation,
      contractType: newContractType,
      remuneration: Number(newSalary) || 180000,
      currency: 'FCFA',
      location: newLocation,
      isUrgent: false,
      isLeLabeurJob: false,
      skills: skillsList.length > 0 ? skillsList : ['Artisanat qualifié'],
      summary: newSummary || 'Recherche professionnelle qualifiée sous contrat LE LABEUR.',
      responsibilities: ['Exécution soignée des ouvrages confiés', 'Respect du planning convenu'],
      conditions: ['Règlement direct de fin de mois', 'Matériel de protection fourni'],
      selectionProcess: ['Examen du profil', 'Échange direct', 'Proposition de mission'],
      durationMonths: 6
    });
    setNewOfferModalOpen(false);
    setNewTitle('');
    setNewSummary('');
  };

  const openPaymentModal = (contract: any, monthNumber: number, mode: 'SALARY' | 'COMMISSION') => {
    const entry = contract.paymentSchedule?.find((item: any) => item.monthNumber === monthNumber);
    if (!entry) return;
    setPaymentContractId(contract.id);
    setPaymentMonthNumber(monthNumber);
    setPaymentMode(mode);
    setPaymentAmount(String(mode === 'SALARY' ? entry.employeeShareAmount : entry.commissionAmount));
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    const targetContract = myContracts.find(c => c.id === paymentContractId);
    if (!targetContract) return;
    if (paymentMode === 'SALARY') {
      await confirmMonthlyAction(
        targetContract.id,
        paymentMonthNumber,
        'DECLARE_SALARY',
        paymentNotes,
        {
          phone: paymentPhone,
          txnId: paymentTxnId,
          amount: Number(paymentAmount),
          proofFileName: paymentProofFileName
        }
      );
    } else {
      await declareCommission({
        contractId: targetContract.id,
        monthNumber: paymentMonthNumber,
        senderPhone: paymentPhone,
        transactionId: paymentTxnId,
        amountPaid: Number(paymentAmount) || 0,
        paymentDate,
        paymentTime,
        reference: paymentReference,
        proofUri: `blob:${paymentProofFileName}`,
        proofFileName: paymentProofFileName,
        notes: paymentNotes
      });
    }
    setPaymentSuccess(true);
    setTimeout(() => {
      setPaymentSuccess(false);
      setPaymentModalOpen(false);
    }, 1800);
  };

  const handleContactCandidate = async (app: any) => {
    const fullCand = candidates.find(c => c.id === app.candidateId);
    await openConversationForContext(
      {
        id: app.candidateId,
        publicId: fullCand?.publicId || '',
        name: app.candidateName,
        role: 'CANDIDATE',
        avatarUrl: app.candidateAvatar || fullCand?.avatarUrl || ''
      },
      {
        contextType: 'APPLICATION',
        contextRefId: app.id,
        contextTitle: `${app.offerTitle} — Candidature`
      }
    );
  };

  const handleAudioCallDirect = async (app: any) => {
    try {
      await startAudioCall({
        id: app.candidateId,
        fullName: app.candidateName,
        role: 'CANDIDATE',
        avatarUrl: app.candidateAvatar || '',
        headline: app.offerTitle
      });
    } catch {
      setCallToast("Microphone non disponible pour l'appel.");
      setTimeout(() => setCallToast(null), 3000);
    }
  };

  const blockedEmployerRows = scheduleRows.filter(row => ['DUE', 'REJECTED'].includes(row.status));
  const blockedTotalDue = blockedEmployerRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#F3F3EC] select-none pb-24 font-operational text-xs text-[#17233B]">
      {currentUser?.accountStatus === 'BLOCKED' && (
        <div className="mb-5 rounded-2xl border border-[#A33A2B]/25 bg-[#A33A2B]/5 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#A33A2B] font-bold">COMPTE BLOQUÉ</p>
              <h2 className="text-lg font-semibold text-[#17233B] mt-1">Régularisation requise</h2>
              <p className="text-xs text-[#17233B]/65 mt-1">
                {currentUser.blockReason || 'Une échéance n’est pas régularisée depuis au moins 3 jours.'}
              </p>
            </div>
            <AlertTriangle className="w-5 h-5 text-[#A33A2B] shrink-0" />
          </div>
          <div className="rounded-xl bg-white border border-[#17233B]/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-[#17233B]/50">Montant restant dû</p>
            <p className="text-xl font-semibold text-[#17233B] mt-1">{blockedTotalDue.toLocaleString()} FCFA</p>
            {blockedEmployerRows[0] && (
              <p className="text-xs text-[#17233B]/60 mt-1">
                {blockedEmployerRows[0].label} · échéance {blockedEmployerRows[0].contract.paymentSchedule.find(e => e.monthNumber === blockedEmployerRows[0].monthNumber)?.salaryDueDate || blockedEmployerRows[0].contract.paymentSchedule.find(e => e.monthNumber === blockedEmployerRows[0].monthNumber)?.commissionDueDate}
              </p>
            )}
          </div>
          <p className="text-[11px] text-[#17233B]/65">
            Effectuez le paiement HORS LE LABEUR, puis utilisez « Déclarer » sur l’échéance concernée. Les autres mutations du compte restent bloquées jusqu’à validation et déverrouillage par l’administration.
          </p>
          <EditorialButton variant="primary" size="sm" onClick={() => setScreen('CONTRACTS')}>
            Voir les échéances
          </EditorialButton>
        </div>
      )}
      {/* RÈGLE 30 : Ordre éditorial : REPÈRE -> Titre -> Missions en cours / Recrutement */}
      <div className="mb-6 space-y-1">
        <div className="flex items-center justify-between">
          <span className="editorial-kicker">
            TABLEAU DE BORD RECRUTEUR
          </span>
          <span className="font-mono text-[10px] text-[#17233B]/60 bg-white border border-[#17233B]/10 px-2 py-0.5 rounded">
            {currentUser?.publicId || 'Identifiant indisponible'}
          </span>
        </div>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight leading-tight">
          Bonjour, {currentUser?.fullName || "Atelier Bois & Agencement Bénin"}
        </h1>
        <p className="text-xs text-[#17233B]/70 leading-relaxed pt-0.5">
          Suivi de vos recrutements, contrats en cours et partenariats certifiés au Bénin.
        </p>
      </div>

      {/* Alerte commission si existante */}
      {dueContracts.length > 0 && (
        <div className="p-4 bg-[#FFA800]/10 border border-[#FFA800]/30 rounded-[4px] mb-5 space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#FFA800] shrink-0" />
              <span className="font-editorial text-base font-bold text-[#17233B]">
                Commission LE LABEUR exigible : {totalCommissionDue.toLocaleString()} FCFA
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase bg-[#FFA800]/20 text-[#17233B] font-bold px-1.5 py-0.5 rounded">
              25% 1er Mois
            </span>
          </div>
          <p className="text-xs text-[#17233B]/80 leading-relaxed">
            Pour le contrat <strong>{dueContracts[0].offerTitle}</strong> (Salarié : {dueContracts[0].employeeName}). Règle déontologique : vos recrutements et publications restent <strong>100% ouverts</strong> et non bloqués.
          </p>
          <div className="pt-1 flex items-center justify-end">
            <EditorialButton
              variant="primary"
              size="sm"
              onClick={() => {
                const dueRow = scheduleRows.find(row => row.kind === 'COMMISSION' && row.status === 'DUE');
                if (dueRow) openPaymentModal(dueRow.contract, dueRow.monthNumber, 'COMMISSION');
              }}
            >
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              <span>Déclarer le règlement</span>
            </EditorialButton>
          </div>
        </div>
      )}

      {/* RÈGLE 24 & 30 : Données principales éditoriales bien séparées */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
        <div 
          onClick={() => setActiveTab('OFFERS')}
          className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all tap-feedback"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#17233B]/50 block">
            Offres en recrutement
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-editorial text-2xl font-bold text-[#17233B]">
              {offersInRecruitment.length}
            </span>
            <Briefcase className="w-4 h-4 text-[#17233B]/30" />
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('APPLICATIONS')}
          className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all tap-feedback"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#17233B]/50 block">
            Candidatures
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-editorial text-2xl font-bold text-[#17233B]">
              {myApplications.length}
            </span>
            <Users className="w-4 h-4 text-[#17233B]/30" />
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('APPLICATIONS')}
          className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all tap-feedback"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#FFA800] font-bold block">
            À examiner
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-editorial text-2xl font-bold text-[#FFA800]">
              {pendingApps.length}
            </span>
            <Clock className="w-4 h-4 text-[#FFA800]" />
          </div>
        </div>

        {/* RÈGLE 24 : MISSIONS EN COURS vient des contrats ACTIVE ! */}
        <div 
          onClick={() => setScreen('CONTRACTS')}
          className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all tap-feedback"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#1BA64B] font-bold block">
            Missions en cours
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-editorial text-2xl font-bold text-[#1BA64B]">
              {missionsInProgress.length}
            </span>
            <ShieldCheck className="w-4 h-4 text-[#1BA64B]" />
          </div>
        </div>

        <div 
          onClick={() => setScreen('CONTRACTS')}
          className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all tap-feedback"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#17233B]/50 block">
            Contrats
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-editorial text-2xl font-bold text-[#17233B]">
              {myContracts.length}
            </span>
            <FileText className="w-4 h-4 text-[#17233B]/30" />
          </div>
        </div>

        <div 
          onClick={() => setScreen('CONTRACTS')}
          className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all tap-feedback"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#17233B]/50 block">
            Commission due
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-editorial text-base sm:text-lg font-bold text-[#17233B] truncate">
              {dueContracts.length > 0 ? `${totalCommissionDue.toLocaleString()} F` : '0 F'}
            </span>
            <DollarSign className="w-4 h-4 text-[#17233B]/30" />
          </div>
        </div>

        {/* PHASE 4 — espace « Paiements » : déclaration des règlements externes. */}
        <div 
          onClick={() => setActiveTab('PAYMENTS')}
          className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all tap-feedback"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#17233B]/50 block">
            Mes paiements
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-editorial text-2xl font-bold text-[#17233B]">
              {paymentDeclarations.length}
            </span>
            <Wallet className="w-4 h-4 text-[#17233B]/30" />
          </div>
          <span className="text-[10px] text-[#17233B]/50 block mt-1">
            {paymentDeclarations.filter(p => p.status === 'REJECTED').length} à régulariser
          </span>
        </div>
      </div>

      {/* Échéances contractuelles : calendrier unique du contrat, filtré par état. */}
      <section className="mb-6 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="editorial-kicker">SUIVI FINANCIER</span>
            <h2 className="font-editorial text-xl font-bold text-[#17233B]">Échéances</h2>
            <p className="text-[11px] text-[#17233B]/60">Salaires et commission du contrat, selon la date d’exigibilité.</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-[#17233B]/50">{scheduleRows.length} opération(s)</span>
            <button
              type="button"
              onClick={() => setActiveTab('PAYMENTS')}
              className="px-2.5 py-1 bg-[#17233B] text-white rounded-[3px] text-[10px] font-semibold uppercase tracking-wide inline-flex items-center gap-1 cursor-pointer tap-feedback"
            >
              <Wallet className="w-3 h-3" />
              Déclarer un paiement
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-white border border-[#17233B]/10 rounded-[4px]">
          {[
            ['UPCOMING', 'À VENIR'],
            ['DUE', 'À PAYER'],
            ['PENDING', 'EN VÉRIFICATION'],
            ['PAID', 'VALIDÉS']
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScheduleTab(id as typeof scheduleTab)}
              className={`px-2 py-2 rounded-[3px] text-[9px] font-mono font-bold uppercase tracking-tight cursor-pointer ${scheduleTab === id ? 'bg-[#17233B] text-white' : 'text-[#17233B]/60 hover:bg-[#17233B]/5'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {visibleScheduleRows.length === 0 ? (
          <div className="p-4 bg-white border border-[#17233B]/10 rounded-[4px] text-xs text-[#17233B]/60 text-center">
            Aucune échéance dans cette catégorie.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleScheduleRows.map(row => (
              <div key={`${row.contract.id}-${row.kind}-${row.monthNumber}`} className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/10 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wide text-[#17233B]/50">M{row.monthNumber} · {row.kind === 'SALARY' ? 'SALAIRE' : 'COMMISSION'}</div>
                    <div className="font-editorial text-base font-bold text-[#17233B]">{row.label}</div>
                    <div className="text-[10px] text-[#17233B]/60 truncate">{row.contract.offerTitle} · {row.contract.employeeName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-[#17233B]">{row.amount.toLocaleString()} FCFA</div>
                    <div className="text-[10px] text-[#17233B]/50">{row.status === 'SCHEDULED' ? 'À venir' : row.status === 'DUE' ? 'À payer' : row.status === 'PENDING_VERIFICATION' ? 'En vérification' : row.status === 'PAID' ? 'Validé' : 'À traiter'}</div>
                  </div>
                </div>
                {['DUE', 'REJECTED'].includes(row.status) && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#17233B]/5">
                    <span className="text-[11px] font-semibold text-[#FFA800]">
                      {row.status === 'REJECTED' ? 'Régularisation à déclarer' : 'Paiement à déclarer aujourd’hui'}
                    </span>
                    <EditorialButton size="sm" variant="primary" onClick={() => openPaymentModal(row.contract, row.monthNumber, row.kind)}>
                      Déclarer
                    </EditorialButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Action Bar (RÈGLE 3 & 4 : bouton Mes Contrats ouvre ContractsScreen) */}
      <div className="flex items-center gap-2.5 mb-6">
        <EditorialButton
          variant="primary"
          size="md"
          className="flex-1"
          onClick={() => setNewOfferModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          <span>Publier une Offre</span>
        </EditorialButton>
        <EditorialButton
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={() => setScreen('CONTRACTS')}
        >
          <FileText className="w-4 h-4 mr-2 text-[#340C24]" />
          <span>Mes Contrats</span>
        </EditorialButton>
      </div>

      {/* Section Candidatures Récentes */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-xl font-bold text-[#17233B]">
              Candidatures Reçues
            </h2>
            <p className="text-[11px] text-[#17233B]/60">
              Profils qualifiés ayant postulé à vos offres
            </p>
          </div>
          <button
            onClick={() => setActiveTab('APPLICATIONS')}
            className="text-xs font-semibold text-[#17233B] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Voir tout ({myApplications.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {myApplications.length === 0 ? (
          <div className="p-5 bg-white rounded border border-[#17233B]/10 text-center text-[#17233B]/60">
            Aucune candidature en attente pour le moment.
          </div>
        ) : (
          myApplications.slice(0, 3).map(app => (
            <div
              key={app.id}
              className="p-3.5 bg-white rounded-[4px] border border-[#17233B]/12 shadow-xs space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={app.candidateAvatar}
                    alt={app.candidateName}
                    className="w-11 h-11 rounded-[3px] object-cover shrink-0 border border-[#17233B]/10"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <h4 className="font-editorial text-base font-bold text-[#17233B] truncate">
                      {app.candidateName}
                    </h4>
                    <p className="text-[11px] text-[#17233B]/70 truncate">
                      {app.candidateHeadline}
                    </p>
                    <p className="text-[10px] font-mono text-[#17233B]/50 truncate mt-0.5">
                      Sur : <em>{app.offerTitle}</em>
                    </p>
                  </div>
                </div>
                <StatusBadge status={app.status} />
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#17233B]/5">
                <button
                  type="button"
                  onClick={() => handleAudioCallDirect(app)}
                  className="py-1 px-2.5 border border-[#1BA64B]/30 bg-[#1BA64B]/10 rounded text-[#17233B] hover:bg-[#1BA64B]/20 tap-feedback flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                  title="Appel direct LE LABEUR"
                >
                  <Phone className="w-3.5 h-3.5 text-[#1BA64B]" />
                  <span>Appel</span>
                </button>
                <EditorialButton
                  variant="outline"
                  size="sm"
                  onClick={() => handleContactCandidate(app)}
                >
                  <MessageSquare className="w-3 h-3 mr-1" />
                  <span>Message</span>
                </EditorialButton>
                {app.status === 'PENDING' && (
                  <EditorialButton
                    variant="secondary"
                    size="sm"
                    onClick={() => examineApplication(app.id)}
                  >
                    <span>Examiner</span>
                  </EditorialButton>
                )}
                {app.status !== 'SHORTLISTED' && (
                  <EditorialButton
                    variant="primary"
                    size="sm"
                    onClick={() => shortlistApplication(app.id)}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    <span>Retenir</span>
                  </EditorialButton>
                )}
                {app.status !== 'REJECTED' && (
                  <button
                    onClick={() => rejectApplication(app.id)}
                    title="Refuser la candidature"
                    className="w-7 h-7 flex items-center justify-center rounded text-[#E23D3D] hover:bg-[#E23D3D]/10 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <HairlineDivider className="mb-6" />

      {/* Mes Offres Publiées */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-xl font-bold text-[#17233B]">
              Mes Offres Publiées
            </h2>
            <p className="text-[11px] text-[#17233B]/60">
              Postes visibles par les candidats ou déjà pourvus
            </p>
          </div>
          <button
            onClick={() => setActiveTab('OFFERS')}
            className="text-xs font-semibold text-[#17233B] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Gérer ({myOffers.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {myOffers.length === 0 ? (
          <div className="p-6 bg-white rounded border border-[#17233B]/10 text-center space-y-2">
            <p className="font-editorial text-base text-[#17233B] font-bold">
              Vous n'avez pas encore publié d'offre
            </p>
            <p className="text-xs text-[#17233B]/60">
              Publiez votre premier besoin gratuitement.
            </p>
            <EditorialButton
              variant="primary"
              size="sm"
              onClick={() => setNewOfferModalOpen(true)}
            >
              Publier maintenant
            </EditorialButton>
          </div>
        ) : (
          myOffers.map(offer => {
            const offerApps = applications.filter(a => a.offerId === offer.id);
            const isFilled = offer.status === 'FILLED';
            return (
              <div
                key={offer.id}
                onClick={() => openOfferDetail(offer)}
                className={`p-4 bg-white rounded-[4px] border ${
                  isFilled ? 'border-[#1BA64B]/30 bg-[#1BA64B]/3' : 'border-[#17233B]/12'
                } hover:border-[#17233B]/30 cursor-pointer shadow-xs transition-all space-y-2 tap-feedback`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[#17233B]/50">{offer.id} · {offer.postedDate}</span>
                      {isFilled && (
                        <span className="text-[10px] font-mono text-[#1BA64B] bg-[#1BA64B]/10 px-1.5 py-0.5 rounded font-bold">
                          POSTE POURVU (Retirée de la recherche)
                        </span>
                      )}
                    </div>
                    <h3 className="font-editorial text-lg font-bold text-[#17233B] mt-0.5">
                      {offer.title}
                    </h3>
                    <p className="text-xs font-operational text-[#17233B]/60 mt-0.5">
                      {offer.location} · {offer.contractType}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#17233B] bg-[#17233B]/5 px-2 py-1 rounded">
                    {offer.remuneration.toLocaleString()} {offer.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 text-[11px] border-t border-[#17233B]/5 text-[#17233B]/70">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Users className="w-3.5 h-3.5 text-[#17233B]/50" />
                    <span>{offerApps.length} candidature(s)</span>
                  </span>
                  <span className="font-semibold text-[#17233B] flex items-center gap-1">
                    <span>{isFilled ? "Voir l'offre archivée" : 'Détails'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Publier Offre */}
      <EditorialSheet
        isOpen={newOfferModalOpen}
        onClose={() => setNewOfferModalOpen(false)}
        title="Publier un Besoin de Recrutement"
        subtitle="Gratuit à la publication au Bénin"
        footer={
          <EditorialButton
            variant="primary"
            fullWidth
            onClick={handleCreateOffer}
          >
            Valider et publier
          </EditorialButton>
        }
      >
        <div className="space-y-3 font-operational text-xs">
          <div>
            <label className="block font-medium text-[#17233B] mb-1">Intitulé du poste / Métier</label>
            <input
              type="text"
              placeholder="Ex. Menuisier d'Art & Agencement"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-[#17233B] mb-1">Salaire (FCFA/mois)</label>
              <input
                type="number"
                value={newSalary}
                onChange={e => setNewSalary(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-[#17233B] mb-1">Type de contrat</label>
              <input
                type="text"
                value={newContractType}
                onChange={e => setNewContractType(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-[#17233B] mb-1">Lieu du chantier au Bénin</label>
            <input
              type="text"
              value={newLocation}
              onChange={e => setNewLocation(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-[#17233B] mb-1">Compétences attendues (séparées par virgules)</label>
            <input
              type="text"
              value={newSkills}
              onChange={e => setNewSkills(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-[#17233B] mb-1">Description du travail</label>
            <textarea
              rows={2}
              placeholder="Précisez ce qui est attendu..."
              value={newSummary}
              onChange={e => setNewSummary(e.target.value)}
              className="w-full p-2 bg-white border border-[#17233B]/20 rounded text-xs"
            />
          </div>
        </div>
      </EditorialSheet>

      {/* Modal Paiement Commission */}
      <EditorialSheet
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title={paymentMode === 'SALARY' ? 'Déclarer le Paiement de Salaire' : 'Déclarer le Paiement de Commission'}
        subtitle={paymentMode === 'SALARY' ? `Salaire M${paymentMonthNumber} — part salarié` : `Commission M${paymentMonthNumber} — LE LABEUR`}
        footer={
          <EditorialButton
            variant="primary"
            fullWidth
            onClick={handleConfirmPayment}
          >
            {paymentSuccess ? 'Paiement déclaré avec succès !' : 'Soumettre le justificatif'}
          </EditorialButton>
        }
      >
        <div className="space-y-3 font-operational text-xs">
          {paymentSuccess ? (
            <div className="p-3 bg-[#1BA64B]/10 border border-[#1BA64B]/30 rounded text-[#1BA64B] text-center font-medium">
              Justificatif transmis à l administration centrale pour vérification.
            </div>
          ) : (
            <>
              <p className="text-xs text-[#17233B]/80 leading-relaxed">
                Après avoir effectué le transfert hors-application (MTN Mobile Money, Moov Money ou virement), renseignez le reçu :
              </p>
              <div>
                <label className="block font-medium text-[#17233B] mb-1">Numéro de téléphone émetteur</label>
                <input
                  type="text"
                  value={paymentPhone}
                  onChange={e => setPaymentPhone(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-[#17233B] mb-1">ID de Transaction</label>
                  <input
                    type="text"
                    value={paymentTxnId}
                    onChange={e => setPaymentTxnId(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#17233B] mb-1">Montant Réglé (FCFA)</label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-[#17233B] mb-1">Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#17233B] mb-1">Heure</label>
                  <input
                    type="time"
                    value={paymentTime}
                    onChange={e => setPaymentTime(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#17233B] mb-1">Référence</label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  placeholder="Ex. REF-LELABEUR-001"
                  className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#17233B] mb-1">Preuve / Capture du reçu</label>
                <div className="flex items-center gap-2 p-2 bg-white border border-[#17233B]/20 rounded">
                  <span className="font-mono text-[11px] text-[#17233B]/80 truncate flex-1">
                    {paymentProofFileName}
                  </span>
                  <label className="px-2.5 py-1 bg-[#17233B]/10 hover:bg-[#17233B]/20 rounded text-[11px] font-semibold cursor-pointer">
                    Parcourir
                    <input
                      type="file"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setPaymentProofFileName(file.name);
                      }}
                    />
                  </label>
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#17233B] mb-1">Remarque facultative</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#17233B]/20 rounded text-xs"
                />
              </div>
            </>
          )}
        </div>
      </EditorialSheet>

      {callToast && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-sm mx-auto p-3 bg-[#17233B] text-[#F3F3EC] rounded-[4px] shadow-lg flex items-center justify-between gap-2 text-xs font-operational animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1BA64B] shrink-0" />
            <span>{callToast}</span>
          </div>
          <button
            onClick={() => setCallToast(null)}
            className="text-[10px] font-mono opacity-60 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
