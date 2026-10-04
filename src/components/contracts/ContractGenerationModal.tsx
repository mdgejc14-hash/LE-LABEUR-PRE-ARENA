import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSignature,
  ShieldCheck,
  Briefcase,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EditorialSheet } from '../common/EditorialSheet';
import { EditorialButton } from '../common/EditorialButton';
import {
  calculateFirstMonthCommission,
  calculateFirstMonthEmployeeShare,
  calculateLaterMonthCommission,
  calculateLaterMonthEmployeeShare,
} from '../../domain/businessRules';
import { Offer } from '../../types';

interface ContractGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: { id: string; name: string; avatarUrl?: string; headline?: string; publicId?: string };
  offerId?: string;
  offerTitle?: string;
  applicationId?: string;
}

export const ContractGenerationModal: React.FC<ContractGenerationModalProps> = ({
  isOpen,
  onClose,
  candidate,
  offerId: initialOfferId,
  offerTitle: initialOfferTitle,
  applicationId: initialAppId
}) => {
  const {
    currentUser,
    offers,
    applications,
    generateContractFromRecruitment,
    setScreen,
    candidates
  } = useApp();

  // Candidat réel avec publicId
  const candidateFullProfile = useMemo(() => {
    return candidates.find(c => c.id === candidate.id);
  }, [candidates, candidate.id]);

  const candidatePublicId = candidate.publicId || candidateFullProfile?.publicId || 'Identifiant indisponible';

  // RÈGLE 14 : Liste contenant UNIQUEMENT les offres de l'employeur connecté
  const myEmployerOffers = useMemo(() => {
    return offers.filter(o => o.employerId === currentUser?.id);
  }, [offers, currentUser?.id]);

  // Offres auxquelles ce salarié a candidaté
  const candidateApplications = useMemo(() => {
    return applications.filter(a => a.candidateId === candidate.id && myEmployerOffers.some(o => o.id === a.offerId));
  }, [applications, candidate.id, myEmployerOffers]);

  // Tri pour prioriser les offres auxquelles ce salarié a candidaté
  const prioritizedOffers = useMemo(() => {
    const appliedOfferIds = candidateApplications.map(a => a.offerId);
    return [...myEmployerOffers].sort((a, b) => {
      const aApplied = appliedOfferIds.includes(a.id);
      const bApplied = appliedOfferIds.includes(b.id);
      if (aApplied && !bApplied) return -1;
      if (!aApplied && bApplied) return 1;
      return 0;
    });
  }, [myEmployerOffers, candidateApplications]);

  // État de sélection d'offre
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');

  // Form states
  const [jobTitle, setJobTitle] = useState('');
  const [missionDescription, setMissionDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('15 Octobre 2026');
  const [durationMonths, setDurationMonths] = useState(6);
  const [monthlySalary, setMonthlySalary] = useState(180000);
  const [periodicity, setPeriodicity] = useState('Mensuel');
  const [conditions, setConditions] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('Mission sous déontologie LE LABEUR : protection Mois 1 et suivi bilatéral.');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successCreatedId, setSuccessCreatedId] = useState<string | null>(null);

  // RÈGLE 15 : Préremplissage automatique dès que l'employeur choisit une offre
  const applyOfferData = (offer: Offer) => {
    setJobTitle(offer.title);
    setMonthlySalary(offer.remuneration || 150000);
    setLocation(offer.location || offer.employerLocation || 'Cotonou');
    setDurationMonths(offer.durationMonths || 6);
    setStartDate(offer.startDate || '15 Octobre 2026');
    setMissionDescription(offer.summary || `Prestation soignée pour le poste : ${offer.title}`);
    
    const combinedConditions = [
      ...(offer.conditions || []),
      ...(offer.responsibilities ? [`Responsabilités : ${offer.responsibilities.slice(0, 2).join(' ; ')}`] : [])
    ];
    setConditions(combinedConditions.join('\n'));
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessCreatedId(null);
      
      // Trouver l'offre initiale appropriée
      let targetOffer: Offer | undefined;
      if (initialOfferId) {
        targetOffer = myEmployerOffers.find(o => o.id === initialOfferId);
      }
      if (!targetOffer && candidateApplications.length > 0) {
        targetOffer = myEmployerOffers.find(o => o.id === candidateApplications[0].offerId);
      }
      if (!targetOffer && prioritizedOffers.length > 0) {
        targetOffer = prioritizedOffers[0];
      }

      if (targetOffer) {
        setSelectedOfferId(targetOffer.id);
        applyOfferData(targetOffer);
      } else {
        setSelectedOfferId('');
      }
    }
  }, [isOpen, initialOfferId, myEmployerOffers, candidateApplications, prioritizedOffers]);

  const handleSelectOfferChange = (newId: string) => {
    setSelectedOfferId(newId);
    const found = myEmployerOffers.find(o => o.id === newId);
    if (found) {
      applyOfferData(found);
    }
  };

  const commissionAmount = calculateFirstMonthCommission(monthlySalary);
  const employeeFirstMonthShare = calculateFirstMonthEmployeeShare(monthlySalary);
  const laterMonthSalary = calculateLaterMonthEmployeeShare(monthlySalary);
  const laterMonthCommission = calculateLaterMonthCommission();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSubmitting(true);
    setErrorMessage(null);

    // RÈGLE 12 & 16 : Validation stricte d'offre
    if (!selectedOfferId || !selectedOfferId.trim()) {
      setErrorMessage("Veuillez sélectionner une offre valide parmi vos offres publiées.");
      setSubmitting(false);
      return;
    }

    const selectedOffer = myEmployerOffers.find(o => o.id === selectedOfferId);
    if (!selectedOffer || selectedOffer.employerId !== currentUser.id) {
      setErrorMessage("Action refusée : l'offre sélectionnée n'appartient pas à votre compte employeur.");
      setSubmitting(false);
      return;
    }

    // Trouver si une candidature existe
    const matchedApp = candidateApplications.find(a => a.offerId === selectedOfferId);
    const appIdToUse = initialAppId || matchedApp?.id;

    if (appIdToUse) {
      const app = applications.find(a => a.id === appIdToUse);
      if (app && (app.offerId !== selectedOfferId || app.candidateId !== candidate.id)) {
        setErrorMessage("Discordance entre l'offre et le candidat concerné pour cette candidature.");
        setSubmitting(false);
        return;
      }
    }

    try {
      const conditionsList = conditions
        .split('\n')
        .map(c => c.trim())
        .filter(Boolean);

      const contract = await generateContractFromRecruitment({
        offerId: selectedOffer.id, // RÈGLE 12 : Vrai offerId vérifié, AUCUN fallback
        applicationId: appIdToUse,
        employerId: currentUser.id,
        employerName: currentUser.fullName,
        employeeId: candidate.id,
        employeeName: candidate.name,
        jobTitle,
        missionDescription,
        location,
        startDate,
        durationMonths: Number(durationMonths),
        monthlySalary: Number(monthlySalary),
        periodicity,
        conditions: conditionsList,
        additionalNotes
      });

      setSuccessCreatedId(contract.id);
      setTimeout(() => {
        setSuccessCreatedId(null);
        onClose();
        setScreen('CONTRACTS');
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de la génération du contrat.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EditorialSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Préparer un Contrat de Travail"
      subtitle="Proposition officielle et accord clair entre les deux parties"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-operational text-xs pb-6">
        {errorMessage && (
          <div className="p-3 bg-[#E23D3D]/10 border border-[#E23D3D]/30 rounded text-[#E23D3D] font-medium leading-relaxed flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successCreatedId && (
          <div className="p-3 bg-[#1BA64B]/10 border border-[#1BA64B]/30 rounded text-[#1BA64B] font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <div>
              <p>Contrat {successCreatedId} préparé au statut SIGNATURE !</p>
              <p className="text-[11px] font-normal text-[#17233B]/80 mt-0.5">
                La carte de contrat et la notification ont été envoyées au salarié dans la discussion.
              </p>
            </div>
          </div>
        )}

        {/* RÈGLE 13 : Salarié connu en lecture seule */}
        <div className="p-3.5 bg-white rounded border border-[#17233B]/10 space-y-2">
          <span className="editorial-kicker block">
            Salarié / Artisan Retenu (Lecture seule)
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[10px] uppercase font-mono text-[#17233B]/50 block">Nom</span>
              <strong className="text-sm text-[#17233B]">{candidate.name}</strong>
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-[#17233B]/50 block">Identifiant public LE LABEUR</span>
              <span className="font-mono font-bold text-xs text-[#340C24] bg-[#340C24]/5 px-2 py-0.5 rounded">
                {candidatePublicId}
              </span>
            </div>
          </div>
        </div>

        {/* RÈGLE 14 & 15 : Choix de l'offre de l'employeur connecté */}
        <div className="space-y-1">
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            Choisir l'offre de travail *
          </label>
          {myEmployerOffers.length === 0 ? (
            <div className="p-3 bg-[#FFA800]/10 border border-[#FFA800]/20 rounded text-xs text-[#17233B]">
              Vous n avez pas encore publié d offre pour votre entreprise. Veuillez publier une offre avant de préparer un contrat.
            </div>
          ) : (
            <select
              value={selectedOfferId}
              required
              onChange={e => handleSelectOfferChange(e.target.value)}
              className="w-full h-11 px-3 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
            >
              <option value="">-- Sélectionnez l offre --</option>
              {prioritizedOffers.map(o => {
                const isCandidateApp = candidateApplications.some(a => a.offerId === o.id);
                return (
                  <option key={o.id} value={o.id}>
                    {o.title} — {o.remuneration.toLocaleString()} FCFA ({o.location}) {isCandidateApp ? '★ Candidature reçue' : ''}
                  </option>
                );
              })}
            </select>
          )}
          <span className="text-[10px] text-[#17233B]/50 block pt-0.5">
            Sélectionner une offre préremplit automatiquement les éléments du contrat.
          </span>
        </div>

        {/* Champs du contrat préremplis modifiables */}
        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            Titre de la mission / Métier *
          </label>
          <input
            type="text"
            required
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            Description du travail à réaliser *
          </label>
          <textarea
            rows={2}
            required
            value={missionDescription}
            onChange={e => setMissionDescription(e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
              Lieu du travail *
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
              Date de début *
            </label>
            <input
              type="text"
              required
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
              Salaire convenu (FCFA) *
            </label>
            <input
              type="number"
              step={1000}
              min={10000}
              required
              value={monthlySalary}
              onChange={e => setMonthlySalary(Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] font-mono font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
              Durée (mois) *
            </label>
            <input
              type="number"
              min={1}
              max={36}
              required
              value={durationMonths}
              onChange={e => setDurationMonths(Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B]"
            />
          </div>
        </div>

        {/* Encadré transparence financière 25% / 0% */}
        <div className="p-3 bg-[#17233B]/5 rounded border border-[#17233B]/15 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-editorial text-xs font-bold text-[#17233B]">
              Calcul clair LE LABEUR
            </span>
            <span className="text-[9px] font-mono uppercase bg-[#17233B] text-white px-1.5 py-0.5 rounded font-bold">
              Règle 25% / 0%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#17233B]/10 text-[11px]">
            <div className="p-2 bg-white rounded border border-[#17233B]/5">
              <span className="text-[#17233B]/60 block text-[9px] uppercase font-bold">Mois 1</span>
              <p className="text-[#17233B] mt-0.5">
                Au travailleur (75%) : <strong>{employeeFirstMonthShare.toLocaleString()} FCFA</strong><br />
                Commission LE LABEUR (25%) : <strong>{commissionAmount.toLocaleString()} FCFA</strong>
              </p>
            </div>
            <div className="p-2 bg-white rounded border border-[#17233B]/5">
              <span className="text-[#17233B]/60 block text-[9px] uppercase font-bold">Mois 2 et suivants</span>
              <p className="text-[#17233B] mt-0.5">
                Au travailleur (100%) : <strong>{laterMonthSalary.toLocaleString()} FCFA</strong><br />
                Commission LE LABEUR (0%) : <strong>{laterMonthCommission} FCFA</strong>
              </p>
            </div>
          </div>
          <p className="text-[10px] text-[#340C24] font-medium leading-tight">
            * L employeur s acquitte de la commission. Le salarié ne paie JAMAIS LE LABEUR.
          </p>
        </div>

        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            Conditions de travail (1 par ligne)
          </label>
          <textarea
            rows={3}
            value={conditions}
            onChange={e => setConditions(e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            Clauses et remarques complémentaires
          </label>
          <input
            type="text"
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B]"
          />
        </div>

        {/* Bouton de génération officiel (RÈGLE 17) */}
        <div className="pt-2">
          <EditorialButton
            variant="primary"
            fullWidth
            type="submit"
            disabled={submitting || !selectedOfferId}
          >
            <FileSignature className="w-4 h-4 mr-1.5" />
            <span>{submitting ? 'Préparation...' : 'Préparer et envoyer le contrat'}</span>
          </EditorialButton>
        </div>
      </form>
    </EditorialSheet>
  );
};
