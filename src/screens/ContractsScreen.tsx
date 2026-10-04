import React, { useState } from 'react';
import {
  FileText,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  Calendar,
  DollarSign,
  MapPin,
  Clock,
  Shield,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Contract } from '../types';
import { EditorialButton } from '../components/common/EditorialButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { EditorialSheet } from '../components/common/EditorialSheet';

const INCIDENT_REASONS = [
  "Conditions différentes de l'accord",
  "Salaire non payé",
  "Problème sur les conditions de travail",
  "Absence / abandon",
  "Comportement problématique",
  "Désaccord sur la mission",
  "Autre"
];

export const ContractsScreen: React.FC = () => {
  const {
    currentUser,
    currentRole,
    contracts,
    conversations,
    openConversationForContext,
    signContract,
    reportIncident,
    terminateMission,
    confirmMonthlyAction,
    candidates
  } = useApp();

  const [activeTab, setActiveTab] = useState<'ALL' | 'SIGNATURE' | 'ACTIVE' | 'INCIDENT' | 'TERMINATED'>('ALL');
  const [selectedContractForView, setSelectedContractForView] = useState<Contract | null>(null);

  // Modal Incident
  const [incidentContract, setIncidentContract] = useState<Contract | null>(null);
  const [incidentReason, setIncidentReason] = useState<string>(INCIDENT_REASONS[0]);
  const [incidentDescription, setIncidentDescription] = useState<string>('');
  const [incidentEvidence, setIncidentEvidence] = useState<string>('');
  const [incidentSubmitting, setIncidentSubmitting] = useState<boolean>(false);
  const [incidentSuccessMessage, setIncidentSuccessMessage] = useState<string | null>(null);

  // Modal Fin de mission (M2+)
  const [terminationContract, setTerminationContract] = useState<Contract | null>(null);
  const [terminationReason, setTerminationReason] = useState<string>('');
  const [terminationSubmitting, setTerminationSubmitting] = useState<boolean>(false);
  const [terminationSuccessMessage, setTerminationSuccessMessage] = useState<string | null>(null);

  // Modal Signature Candidat
  const [signingContract, setSigningContract] = useState<Contract | null>(null);
  const [signingSubmitting, setSigningSubmitting] = useState<boolean>(false);

  // RÈGLE 4 & 10 : Utiliser uniquement les contrats du currentUser
  const myContracts = contracts.filter(c => {
    if (currentRole === 'ADMIN') return true;
    if (currentRole === 'EMPLOYER') return c.employerId === currentUser?.id;
    return c.employeeId === currentUser?.id;
  });

  const signatureContracts = myContracts.filter(c => c.status === 'SIGNATURE' || c.status === 'PENDING_EMPLOYEE' || c.status === 'PENDING_EMPLOYER');
  const activeContracts = myContracts.filter(c => c.status === 'ACTIVE');
  const incidentContracts = myContracts.filter(c => c.status === 'INCIDENT');
  const terminatedContracts = myContracts.filter(c => c.status === 'TERMINATED' || c.status === 'COMPLETED' || c.status === 'SUSPENDED');

  const filteredContracts = myContracts.filter(c => {
    if (activeTab === 'SIGNATURE') return signatureContracts.includes(c);
    if (activeTab === 'ACTIVE') return activeContracts.includes(c);
    if (activeTab === 'INCIDENT') return incidentContracts.includes(c);
    if (activeTab === 'TERMINATED') return terminatedContracts.includes(c);
    return true;
  });

  const handleOpenConversation = async (contract: Contract) => {
    const targetUserId = currentRole === 'EMPLOYER' ? contract.employeeId : contract.employerId;
    const targetUserName = currentRole === 'EMPLOYER' ? contract.employeeName : contract.employerName;
    const targetPublicId = currentRole === 'EMPLOYER' ? contract.employeePublicId : contract.employerPublicId;
    const targetRole = currentRole === 'EMPLOYER' ? 'CANDIDATE' : 'EMPLOYER';

    await openConversationForContext(
      {
        id: targetUserId,
        publicId: targetPublicId,
        name: targetUserName,
        role: targetRole,
        avatarUrl: ''
      },
      {
        contextType: 'CONTRACT',
        contextRefId: contract.id,
        contextTitle: contract.offerTitle || `Contrat ${contract.id}`
      }
    );
  };

  const handleConfirmSign = async () => {
    if (!signingContract) return;
    setSigningSubmitting(true);
    try {
      await signContract(signingContract.id, 'EMPLOYEE');
      setSigningContract(null);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la signature');
    } finally {
      setSigningSubmitting(false);
    }
  };

  const handleSubmitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentContract) return;
    setIncidentSubmitting(true);
    try {
      await reportIncident(
        incidentContract.id,
        incidentReason,
        incidentDescription,
        incidentEvidence
      );
      setIncidentSuccessMessage("Votre signalement a été transmis à la cellule LE LABEUR. Le contrat est placé sous arbitrage.");
      setTimeout(() => {
        setIncidentSuccessMessage(null);
        setIncidentContract(null);
        setIncidentDescription('');
        setIncidentEvidence('');
      }, 2000);
    } catch (err: any) {
      alert(err.message || 'Erreur lors du signalement');
    } finally {
      setIncidentSubmitting(false);
    }
  };

  const handleSalaryDecision = async (contract: Contract, action: 'CONFIRM_SALARY_RECEIVED' | 'CONTEST_SALARY_NOT_RECEIVED') => {
    const entry = contract.paymentSchedule?.find(item => item.monthNumber === contract.currentMonth) || contract.paymentSchedule?.[0];
    if (!entry) return;
    try {
      await confirmMonthlyAction(contract.id, entry.monthNumber, action);
    } catch (err: any) {
      alert(err.message || 'Impossible de traiter cette action de salaire.');
    }
  };

  const handleSubmitTermination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminationContract) return;
    setTerminationSubmitting(true);
    try {
      await terminateMission(terminationContract.id, terminationReason);
      setTerminationSuccessMessage("Fin de mission confirmée et notifiée à l'autre partie.");
      setTimeout(() => {
        setTerminationSuccessMessage(null);
        setTerminationContract(null);
        setTerminationReason('');
      }, 1800);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la rupture');
    } finally {
      setTerminationSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F3F3EC] p-5 pb-24 font-operational text-[#17233B] select-none no-scrollbar">
      {/* En-tête éditorial architectural (ERA Residence Style) */}
      <div className="mb-6 space-y-1">
        <span className="editorial-kicker">
          {currentRole === 'EMPLOYER' ? 'ESPACE RECRUTEUR — ACCORDS' : 'ESPACE ARTISAN — ENGAGEMENTS'}
        </span>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight leading-tight">
          Mes Contrats
        </h1>
        <p className="text-xs text-[#17233B]/70 leading-relaxed pt-0.5">
          Cadre officiel, suivi des missions, signatures bilatérales et protection déontologique.
        </p>
      </div>

      {/* 4 Tabs Segmented Selector */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-2 mb-4 border-b border-[#17233B]/10">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors shrink-0 cursor-pointer ${
            activeTab === 'ALL'
              ? 'bg-[#17233B] text-[#F3F3EC]'
              : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
          }`}
        >
          Tous ({myContracts.length})
        </button>
        <button
          onClick={() => setActiveTab('SIGNATURE')}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors shrink-0 cursor-pointer ${
            activeTab === 'SIGNATURE'
              ? 'bg-[#340C24] text-[#F8BBCB] font-semibold'
              : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
          }`}
        >
          En signature ({signatureContracts.length})
        </button>
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors shrink-0 cursor-pointer ${
            activeTab === 'ACTIVE'
              ? 'bg-[#1BA64B] text-white font-semibold'
              : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
          }`}
        >
          Actifs ({activeContracts.length})
        </button>
        <button
          onClick={() => setActiveTab('INCIDENT')}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors shrink-0 cursor-pointer ${
            activeTab === 'INCIDENT'
              ? 'bg-[#FFA800] text-[#17233B] font-semibold'
              : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
          }`}
        >
          Incidents ({incidentContracts.length})
        </button>
        <button
          onClick={() => setActiveTab('TERMINATED')}
          className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-colors shrink-0 cursor-pointer ${
            activeTab === 'TERMINATED'
              ? 'bg-[#17233B]/70 text-white font-semibold'
              : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
          }`}
        >
          Terminés ({terminatedContracts.length})
        </button>
      </div>

      {/* Contracts List */}
      <div className="space-y-4">
        {filteredContracts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-[4px] border border-[#17233B]/10 space-y-2">
            <FileText className="w-8 h-8 text-[#17233B]/30 mx-auto" />
            <h3 className="font-editorial text-lg font-bold text-[#17233B]">
              Aucun contrat dans cette section
            </h3>
            <p className="text-xs text-[#17233B]/60 max-w-xs mx-auto">
              {currentRole === 'EMPLOYER'
                ? "Préparez un contrat depuis vos discussions avec les candidats retenus."
                : "Vos propositions acceptées et contrats signés apparaîtront ici."}
            </p>
          </div>
        ) : (
          filteredContracts.map(contract => {
            const isEmployer = currentRole === 'EMPLOYER';
            const otherPartyName = isEmployer ? contract.employeeName : contract.employerName;
            const otherPartyPublicId = isEmployer ? contract.employeePublicId : contract.employerPublicId;
            const needsMySignature = contract.status === 'SIGNATURE' && (
              (!isEmployer && !contract.employeeSigned) || (isEmployer && !contract.employerSigned)
            );
            const isM1 = contract.currentMonth === 1;
            const canDissociateM2 = contract.status === 'ACTIVE' && contract.currentMonth >= 2;

            return (
              <article
                key={contract.id}
                className="bg-white rounded-[4px] border border-[#17233B]/12 p-5 shadow-xs space-y-3.5"
              >
                {/* Header Carte Contrat */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#17233B]/50 uppercase font-semibold">
                        {contract.id}
                      </span>
                      <span className="text-[10px] text-[#17233B]/40 font-mono">·</span>
                      <span className="font-mono text-[10px] text-[#340C24] font-bold">
                        Mois {contract.currentMonth}
                      </span>
                    </div>
                    <h3 className="font-editorial text-xl font-bold text-[#17233B] mt-0.5 leading-snug">
                      {contract.offerTitle}
                    </h3>
                    <p className="text-xs text-[#17233B]/70 mt-0.5">
                      {isEmployer ? 'Salarié :' : 'Employeur :'} <strong>{otherPartyName}</strong>
                      {otherPartyPublicId && (
                        <span className="ml-1.5 font-mono text-[10px] text-[#17233B]/60 bg-[#17233B]/5 px-1 py-0.5 rounded">
                          {otherPartyPublicId}
                        </span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={contract.status} />
                </div>

                {/* Données Principales */}
                <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-[#F3F3EC] rounded-[4px] text-xs">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">
                      Rémunération
                    </span>
                    <span className="font-mono font-bold text-sm text-[#17233B] mt-0.5 block">
                      {contract.monthlySalary.toLocaleString()} {contract.currency}
                    </span>
                    <span className="text-[10px] text-[#17233B]/60">
                      {isM1 ? '75% direct / 25% LE LABEUR' : '100% direct travailleur'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block font-medium">
                      Durée & Début
                    </span>
                    <span className="font-medium text-[#17233B] mt-0.5 block">
                      {contract.durationMonths} mois
                    </span>
                    <span className="text-[10px] text-[#17233B]/60">
                      Dès le {contract.startDate}
                    </span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-[#17233B]/8 flex items-center gap-1.5 text-[11px] text-[#17233B]/70">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-[#17233B]/50" />
                    <span className="truncate">{contract.location}</span>
                  </div>
                </div>

                {/* État de signature */}
                {contract.status === 'SIGNATURE' && (
                  <div className="p-3 bg-[#340C24]/5 border border-[#340C24]/15 rounded-[4px] text-xs text-[#340C24] space-y-1">
                    <div className="flex items-center justify-between font-semibold">
                      <span>État des signatures bilatérales</span>
                      <span className="text-[10px] font-mono">2 requis</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div className="flex items-center gap-1.5">
                        {contract.employerSigned ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#1BA64B]" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-[#FFA800]" />
                        )}
                        <span>Employeur : {contract.employerSigned ? 'Signé' : 'En attente'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {contract.employeeSigned ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#1BA64B]" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-[#FFA800]" />
                        )}
                        <span>Salarié : {contract.employeeSigned ? 'Signé' : 'En attente'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* État d'incident */}
                {contract.status === 'INCIDENT' && (
                  <div className="p-3 bg-[#FFA800]/10 border border-[#FFA800]/25 rounded-[4px] text-xs text-[#17233B] space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#340C24]">
                      <AlertTriangle className="w-4 h-4 text-[#FFA800] shrink-0" />
                      <span>Dossier sous arbitrage LE LABEUR</span>
                    </div>
                    <p className="text-[11px] text-[#17233B]/80 leading-relaxed">
                      Un signalement a été transmis à la cellule centrale. Les décisions d'arbitrage (Continuer, Remplacer, Annuler) vous seront notifiées.
                    </p>
                  </div>
                )}

                {/* Échéancier du contrat */}
                {contract.paymentSchedule?.length > 0 && (
                  <div className="p-3 bg-white border border-[#17233B]/10 rounded-[4px] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="editorial-kicker">ÉCHÉANCES</span>
                      <span className="text-[10px] font-mono text-[#17233B]/50">{contract.paymentSchedule.length} mois</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {contract.paymentSchedule.filter(entry => entry.monthNumber === contract.currentMonth || entry.monthNumber === 1).slice(0, 2).map(entry => (
                        <div key={entry.id} className="flex items-center justify-between gap-2 p-2 bg-[#F3F3EC] rounded-[3px] text-[10px]">
                          <div className="min-w-0">
                            <span className="font-mono font-bold">M{entry.monthNumber}</span>
                            <span className="ml-1.5 text-[#17233B]/60">Échéance {entry.salaryDueDate}</span>
                            <div className="truncate text-[#17233B]/70 mt-0.5">Salaire {entry.employeeShareAmount.toLocaleString()} FCFA · {entry.salaryStatus}</div>
                            {entry.commissionAmount > 0 && <div className="truncate text-[#17233B]/70">Commission {entry.commissionAmount.toLocaleString()} FCFA · {entry.commissionStatus}</div>}
                          </div>
                          {!isEmployer && entry.salaryStatus === 'PENDING_VERIFICATION' && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => handleSalaryDecision(contract, 'CONTEST_SALARY_NOT_RECEIVED')} className="px-2 py-1 rounded border border-[#E23D3D]/25 text-[#E23D3D] font-semibold cursor-pointer">Contester</button>
                              <button type="button" onClick={() => handleSalaryDecision(contract, 'CONFIRM_SALARY_RECEIVED')} className="px-2 py-1 rounded bg-[#1BA64B] text-white font-semibold cursor-pointer">Confirmer</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions Cartes Contrat */}
                <div className="pt-2 border-t border-[#17233B]/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <EditorialButton
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedContractForView(contract)}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1 text-[#17233B]/60" />
                      <span>Voir le contrat</span>
                    </EditorialButton>
                    <button
                      type="button"
                      onClick={() => handleOpenConversation(contract)}
                      className="px-2.5 py-1.5 rounded-[4px] text-xs font-medium text-[#17233B] hover:bg-[#17233B]/5 transition-colors flex items-center gap-1 tap-feedback cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#17233B]/60" />
                      <span>Conversation</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Action Signer (Candidat en attente) */}
                    {needsMySignature && !isEmployer && (
                      <EditorialButton
                        variant="primary"
                        size="sm"
                        onClick={() => setSigningContract(contract)}
                      >
                        <FileSignature className="w-3.5 h-3.5 mr-1" />
                        <span>Signer</span>
                      </EditorialButton>
                    )}

                    {/* Action Signaler un problème (Contrat ACTIVE) */}
                    {contract.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => setIncidentContract(contract)}
                        className="px-2.5 py-1.5 text-xs text-[#340C24] font-medium border border-[#340C24]/20 rounded-[4px] hover:bg-[#340C24]/5 tap-feedback flex items-center gap-1 cursor-pointer"
                        title="Signaler un problème à LE LABEUR"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-[#340C24]" />
                        <span>Signaler un problème</span>
                      </button>
                    )}

                    {/* Action Mettre fin à la mission (Mois 2+) */}
                    {canDissociateM2 && (
                      <button
                        type="button"
                        onClick={() => setTerminationContract(contract)}
                        className="px-2.5 py-1.5 text-xs text-[#E23D3D] font-medium border border-[#E23D3D]/30 rounded-[4px] hover:bg-[#E23D3D]/5 tap-feedback flex items-center gap-1 cursor-pointer"
                        title="Fin de mission convenue (M2+)"
                      >
                        <XCircle className="w-3.5 h-3.5 text-[#E23D3D]" />
                        <span>Mettre fin</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* MODAL 1 : Voir le contrat en détail */}
      {selectedContractForView && (
        <EditorialSheet
          isOpen={Boolean(selectedContractForView)}
          onClose={() => setSelectedContractForView(null)}
          title="Contrat de Travail Officiel"
          subtitle={`Réf. ${selectedContractForView.id} — République du Bénin`}
          footer={
            <div className="flex items-center justify-between gap-3">
              <EditorialButton
                variant="outline"
                className="flex-1"
                onClick={() => setSelectedContractForView(null)}
              >
                Fermer
              </EditorialButton>
              {selectedContractForView.status === 'SIGNATURE' && currentRole === 'CANDIDATE' && !selectedContractForView.employeeSigned && (
                <EditorialButton
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    const c = selectedContractForView;
                    setSelectedContractForView(null);
                    setSigningContract(c);
                  }}
                >
                  <FileSignature className="w-4 h-4 mr-1.5" />
                  Signer maintenant
                </EditorialButton>
              )}
            </div>
          }
        >
          <div className="space-y-4 font-operational text-xs">
            {/* Identification officielle des deux parties */}
            <div className="p-3.5 bg-white rounded border border-[#17233B]/12 space-y-2.5">
              <span className="editorial-kicker block">
                Parties Contractantes
              </span>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-mono text-[#17233B]/50 block">Employeur</span>
                  <strong className="text-sm text-[#17233B] block">{selectedContractForView.employerName}</strong>
                  <span className="text-[10px] font-mono text-[#17233B]/60">
                    ID : {selectedContractForView.employerPublicId || 'Identifiant indisponible'}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-mono text-[#17233B]/50 block">Salarié / Artisan</span>
                  <strong className="text-sm text-[#17233B] block">{selectedContractForView.employeeName}</strong>
                  <span className="text-[10px] font-mono text-[#17233B]/60">
                    ID : {selectedContractForView.employeePublicId || 'Identifiant indisponible'}
                  </span>
                </div>
              </div>
            </div>

            {/* Objet du Contrat & Rémunération */}
            <div className="p-3.5 bg-white rounded border border-[#17233B]/12 space-y-2">
              <span className="editorial-kicker block">
                Poste & Conditions
              </span>
              <h4 className="font-editorial text-lg font-bold text-[#17233B]">
                {selectedContractForView.offerTitle}
              </h4>
              <p className="text-xs text-[#17233B]/80 leading-relaxed">
                {selectedContractForView.missionDescription}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#17233B]/8">
                <div>
                  <span className="text-[10px] font-mono text-[#17233B]/50 uppercase">Salaire Convenu</span>
                  <p className="font-mono text-base font-bold text-[#17233B]">
                    {selectedContractForView.monthlySalary.toLocaleString()} {selectedContractForView.currency}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#17233B]/50 uppercase">Durée de Mission</span>
                  <p className="font-semibold text-[#17233B]">
                    {selectedContractForView.durationMonths} mois (dès le {selectedContractForView.startDate})
                  </p>
                </div>
              </div>
            </div>

            {/* Règles déontologiques 25%/0% */}
            <div className="p-3.5 bg-[#340C24]/5 border border-[#340C24]/15 rounded text-xs space-y-1.5 text-[#340C24]">
              <div className="flex items-center gap-1.5 font-bold text-sm">
                <Shield className="w-4 h-4 text-[#340C24]" />
                <span>Règle Déontologique LE LABEUR</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[#17233B]/80">
                <strong>Mois 1 :</strong> L employeur verse directement 75% du salaire convenu ({Math.round(selectedContractForView.monthlySalary * 0.75).toLocaleString()} FCFA) au travailleur, et s acquitte de 25% ({Math.round(selectedContractForView.monthlySalary * 0.25).toLocaleString()} FCFA) à LE LABEUR.<br />
                <strong>Mois 2 et suivants :</strong> 100% au travailleur ({selectedContractForView.monthlySalary.toLocaleString()} FCFA), 0 FCFA à LE LABEUR. Le travailleur ne paie jamais rien.
              </p>
            </div>

            {/* Calendrier des paiements */}
            {selectedContractForView.paymentSchedule?.length > 0 && (
              <div className="p-3.5 bg-white rounded border border-[#17233B]/12 space-y-2.5">
                <span className="editorial-kicker block">Calendrier des paiements</span>
                <div className="space-y-1.5">
                  {selectedContractForView.paymentSchedule.map(entry => (
                    <div key={entry.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-2 p-2 bg-[#F3F3EC] rounded text-[10px]">
                      <span className="font-mono font-bold">M{entry.monthNumber}</span>
                      <div>
                        <div className="font-semibold">Échéance {entry.salaryDueDate}</div>
                        <div className="text-[#17233B]/60">Salaire : {entry.employeeShareAmount.toLocaleString()} FCFA · {entry.salaryStatus}</div>
                        {entry.commissionAmount > 0 && <div className="text-[#17233B]/60">Commission : {entry.commissionAmount.toLocaleString()} FCFA · {entry.commissionStatus}</div>}
                      </div>
                      <span className="font-mono text-[#17233B]/50">{entry.periodKey}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conditions de travail */}
            {selectedContractForView.conditions && selectedContractForView.conditions.length > 0 && (
              <div className="p-3.5 bg-white rounded border border-[#17233B]/12 space-y-1.5">
                <span className="editorial-kicker block">Conditions Particulières</span>
                {selectedContractForView.conditions.map((c, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[11px] text-[#17233B]/80">
                    <span className="text-[#17233B]/40 font-mono">·</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Historique du contrat */}
            <div className="p-3.5 bg-white rounded border border-[#17233B]/12 space-y-2">
              <span className="editorial-kicker block">Historique & Audit</span>
              <div className="space-y-1.5">
                {selectedContractForView.history.map((h, i) => (
                  <div key={i} className="text-[11px] border-b border-[#17233B]/5 pb-1">
                    <div className="flex justify-between text-[9px] font-mono text-[#17233B]/50">
                      <span>{h.timestamp}</span>
                      <span>{h.actor}</span>
                    </div>
                    <p className="text-[#17233B] font-medium">{h.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </EditorialSheet>
      )}

      {/* MODAL 2 : Signature Candidat */}
      {signingContract && (
        <EditorialSheet
          isOpen={Boolean(signingContract)}
          onClose={() => setSigningContract(null)}
          title="Accepter et Signer le Contrat"
          subtitle={`Mission : ${signingContract.offerTitle}`}
          footer={
            <div className="flex items-center gap-3">
              <EditorialButton
                variant="outline"
                className="flex-1"
                disabled={signingSubmitting}
                onClick={() => setSigningContract(null)}
              >
                Annuler
              </EditorialButton>
              <EditorialButton
                variant="primary"
                className="flex-1"
                disabled={signingSubmitting}
                onClick={handleConfirmSign}
              >
                {signingSubmitting ? 'Signature...' : 'Signer le contrat'}
              </EditorialButton>
            </div>
          }
        >
          <div className="space-y-4 font-operational text-xs">
            <div className="p-4 bg-white rounded border border-[#17233B]/10 space-y-2">
              <div className="flex items-center gap-2 text-sm font-editorial font-bold text-[#17233B]">
                <Shield className="w-4 h-4 text-[#1BA64B]" />
                <span>Engagement Réciproque</span>
              </div>
              <p className="text-xs text-[#17233B]/80 leading-relaxed">
                En signant ce contrat, vous vous engagez à respecter les conditions convenues avec l employeur <strong>{signingContract.employerName}</strong> pour un salaire mensuel de <strong>{signingContract.monthlySalary.toLocaleString()} {signingContract.currency}</strong>.
              </p>
              <p className="text-[11px] text-[#17233B]/60 leading-relaxed pt-1 border-t border-[#17233B]/8">
                Votre premier mois est garanti sous la protection déontologique LE LABEUR.
              </p>
            </div>

            <div className="p-3 bg-[#F3F3EC] rounded border border-[#17233B]/10 text-xs">
              <span className="text-[10px] font-mono text-[#17233B]/50 uppercase block">Votre identifiant signataire</span>
              <span className="font-mono font-bold text-sm text-[#17233B]">{currentUser?.publicId}</span>
              <span className="block text-[11px] text-[#17233B]/70 mt-0.5">{currentUser?.fullName}</span>
            </div>
          </div>
        </EditorialSheet>
      )}

      {/* MODAL 3 : Signaler un problème / Plainte (RÈGLES 7 & 8) */}
      {incidentContract && (
        <EditorialSheet
          isOpen={Boolean(incidentContract)}
          onClose={() => setIncidentContract(null)}
          title="Signaler un Problème"
          subtitle={`Contrat : ${incidentContract.offerTitle} (${incidentContract.id})`}
          footer={
            <div className="flex items-center gap-3">
              <EditorialButton
                variant="outline"
                className="flex-1"
                disabled={incidentSubmitting}
                onClick={() => setIncidentContract(null)}
              >
                Annuler
              </EditorialButton>
              <EditorialButton
                variant="primary"
                className="flex-1"
                disabled={incidentSubmitting || !incidentDescription.trim()}
                onClick={handleSubmitIncident}
              >
                {incidentSubmitting ? 'Transmission...' : 'Transmettre à LE LABEUR'}
              </EditorialButton>
            </div>
          }
        >
          <form onSubmit={handleSubmitIncident} className="space-y-4 font-operational text-xs">
            {incidentSuccessMessage && (
              <div className="p-3 bg-[#1BA64B]/10 border border-[#1BA64B]/30 rounded text-[#1BA64B] font-medium leading-relaxed">
                {incidentSuccessMessage}
              </div>
            )}

            <div className="p-3 bg-[#FFA800]/10 border border-[#FFA800]/25 rounded text-xs text-[#17233B] space-y-1">
              <strong>Procédure officielle d'arbitrage :</strong>
              <p className="text-[11px] text-[#17233B]/80 leading-relaxed">
                Votre signalement sera instruit par l administration LE LABEUR. Aucune rupture unilatérale directe n est admise ; la cellule étudie le litige (Continuer, Remplacer, Annuler).
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Motif du problème *
              </label>
              <select
                value={incidentReason}
                onChange={e => setIncidentReason(e.target.value)}
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              >
                {INCIDENT_REASONS.map((r, i) => (
                  <option key={i} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Description détaillée des faits *
              </label>
              <textarea
                rows={4}
                required
                value={incidentDescription}
                onChange={e => setIncidentDescription(e.target.value)}
                placeholder="Décrivez précisément ce qui ne correspond pas à l accord convenu..."
                className="w-full p-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Commentaire ou référence de preuve (facultatif)
              </label>
              <input
                type="text"
                value={incidentEvidence}
                onChange={e => setIncidentEvidence(e.target.value)}
                placeholder="Ex. Relevé de présence, message, photo du chantier..."
                className="w-full h-10 px-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>
          </form>
        </EditorialSheet>
      )}

      {/* MODAL 4 : Mettre fin à la mission (Mois 2+) (RÈGLE 9) */}
      {terminationContract && (
        <EditorialSheet
          isOpen={Boolean(terminationContract)}
          onClose={() => setTerminationContract(null)}
          title="Mettre Fin à la Mission (Mois 2+)"
          subtitle={`Contrat : ${terminationContract.offerTitle}`}
          footer={
            <div className="flex items-center gap-3">
              <EditorialButton
                variant="outline"
                className="flex-1"
                disabled={terminationSubmitting}
                onClick={() => setTerminationContract(null)}
              >
                Annuler
              </EditorialButton>
              <EditorialButton
                variant="danger"
                className="flex-1"
                disabled={terminationSubmitting || !terminationReason.trim()}
                onClick={handleSubmitTermination}
              >
                {terminationSubmitting ? 'Traitement...' : 'Confirmer la fin de mission'}
              </EditorialButton>
            </div>
          }
        >
          <form onSubmit={handleSubmitTermination} className="space-y-4 font-operational text-xs">
            {terminationSuccessMessage && (
              <div className="p-3 bg-[#1BA64B]/10 border border-[#1BA64B]/30 rounded text-[#1BA64B] font-medium leading-relaxed">
                {terminationSuccessMessage}
              </div>
            )}

            <div className="p-3 bg-white rounded border border-[#17233B]/10 text-xs text-[#17233B]/80 leading-relaxed">
              <p>
                Vous êtes en <strong>Mois {terminationContract.currentMonth}</strong> de contrat. À partir du 2ème mois, l accord permet une fin de mission convenue bilatérale avec motif obligatoire.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#17233B]/70 font-semibold mb-1">
                Motif de la fin de mission *
              </label>
              <textarea
                rows={3}
                required
                value={terminationReason}
                onChange={e => setTerminationReason(e.target.value)}
                placeholder="Indiquez clairement le motif de clôture (fin de chantier, accord mutuel...)"
                className="w-full p-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              />
            </div>
          </form>
        </EditorialSheet>
      )}
    </div>
  );
};
