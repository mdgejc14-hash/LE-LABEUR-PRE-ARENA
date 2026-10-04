import React, { useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, CheckCircle2, Phone, MessageSquare, MapPin, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';
import { HairlineDivider } from '../components/common/HairlineDivider';

export const OfferDetailScreen: React.FC = () => {
  const {
    selectedOffer,
    navigateBack,
    backToFeed,
    favorites,
    toggleFavorite,
    applyToOffer,
    applications,
    openConversationForContext,
    startAudioCall,
    setActiveTab
  } = useApp();

  const [hasApplied, setHasApplied] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  if (!selectedOffer) {
    return (
      <div className="p-8 text-center bg-[#F3F3EC]">
        <p className="font-editorial text-lg text-[#17233B]">Offre non sélectionnée</p>
        <EditorialButton onClick={backToFeed} className="mt-4">
          Retour au catalogue
        </EditorialButton>
      </div>
    );
  }

  const isFav = favorites.includes(selectedOffer.id);
  const alreadyApplied = applications.some(a => a.offerId === selectedOffer.id && a.status !== 'WITHDRAWN') || hasApplied;

  const handleApply = async () => {
    try {
      await applyToOffer(selectedOffer.id);
      setHasApplied(true);
    } catch (err: any) {
      setActionFeedback(err.message || 'Impossible de postuler');
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  const handleStartMessage = async () => {
    try {
      await openConversationForContext(
        {
          id: selectedOffer.employerId,
          publicId: selectedOffer.employerPublicId,
          name: selectedOffer.employerName,
          role: 'EMPLOYER',
          avatarUrl: selectedOffer.employerAvatar || ''
        },
        {
          contextType: 'OFFER',
          contextRefId: selectedOffer.id,
          contextTitle: selectedOffer.title
        }
      );
    } catch (err: any) {
      setActionFeedback(err.message || 'Impossible d ouvrir la discussion');
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  const handleAudioCall = async () => {
    try {
      await startAudioCall({
        id: selectedOffer.employerId,
        fullName: selectedOffer.employerName,
        role: 'EMPLOYER',
        avatarUrl: '',
        headline: selectedOffer.employerName
      });
    } catch {
      setActionFeedback("Microphone non disponible pour l'appel.");
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F3F3EC] select-none text-[#17233B] font-operational overflow-hidden">
      <header className="sticky top-0 z-30 bg-[#F3F3EC] border-b border-[#17233B]/10 px-4 h-14 flex items-center justify-between shrink-0">
        <button
          onClick={navigateBack || backToFeed}
          className="flex items-center gap-1.5 text-xs font-medium text-[#17233B]/70 hover:text-[#17233B] py-1.5 px-2 -ml-2 rounded tap-feedback cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 stroke-[1.8]" />
          <span>Retour</span>
        </button>
        <button
          onClick={() => toggleFavorite(selectedOffer.id)}
          className="p-2 rounded-full text-[#17233B]/60 hover:text-[#17233B] hover:bg-[#17233B]/5 tap-feedback cursor-pointer"
          aria-label="Enregistrer"
        >
          {isFav ? (
            <BookmarkCheck className="w-5 h-5 fill-[#340C24] text-[#340C24]" />
          ) : (
            <Bookmark className="w-5 h-5 stroke-[1.6]" />
          )}
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-28 space-y-6 max-w-md mx-auto w-full no-scrollbar">
        <div className="flex items-center justify-between">
          <span className="editorial-kicker">
            DÉTAILS DE L OFFRE
          </span>
          {selectedOffer.isUrgent && (
            <span className="text-[10px] font-mono font-bold text-[#340C24] bg-[#340C24]/10 px-2 py-0.5 rounded-[2px] uppercase">
              {selectedOffer.leLabeurTag || 'URGENT'}
            </span>
          )}
        </div>

        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight leading-snug">
          {selectedOffer.title}
        </h1>

        <div className="space-y-1 text-xs">
          <p className="font-semibold text-sm text-[#17233B]">
            {selectedOffer.employerName}
          </p>
          <div className="flex items-center gap-2 text-[#17233B]/60">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {selectedOffer.location}
            </span>
            <span>·</span>
            <span>Publiée le {selectedOffer.postedDate}</span>
          </div>
        </div>

        <div className="py-4 px-5 bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/10 flex items-baseline justify-between shadow-none">
          <div>
            <span className="editorial-kicker block">
              Rémunération
            </span>
            <p className="text-2xl font-bold font-mono text-[#17233B] mt-1">
              {selectedOffer.remuneration.toLocaleString()} {selectedOffer.currency}
            </p>
            <p className="text-[11px] text-[#17233B]/50 mt-0.5">Versé directement par l employeur</p>
          </div>
          <div className="text-right">
            <span className="editorial-kicker block">
              Contrat
            </span>
            <p className="text-sm font-semibold text-[#17233B] mt-1">
              {selectedOffer.contractType}
            </p>
            <p className="text-[11px] text-[#1BA64B] font-medium mt-0.5">Accord clair</p>
          </div>
        </div>

        <HairlineDivider />

        <section className="space-y-3">
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Travail demandé
          </h2>
          <p className="text-xs sm:text-sm text-[#17233B]/80 leading-relaxed">
            {selectedOffer.summary}
          </p>

          {selectedOffer.responsibilities && selectedOffer.responsibilities.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="editorial-kicker">
                Ce que vous ferez :
              </p>
              {selectedOffer.responsibilities.map((resp, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-[#17233B]/80 leading-relaxed">
                  <span className="font-mono text-[#17233B]/40 font-bold shrink-0">0{idx + 1}.</span>
                  <span>{resp}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <HairlineDivider />

        <section className="space-y-3">
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Compétences requises
          </h2>
          <div className="flex flex-wrap gap-2">
            {selectedOffer.skills.map((skill, idx) => (
              <span
                key={idx}
                className="px-3.5 py-1.5 bg-[#FFFFFF] text-[#17233B] text-xs font-medium rounded-[4px] border border-[#17233B]/12"
              >
                {skill}
              </span>
            ))}
          </div>
        </section>

        <HairlineDivider />

        <div className="pt-2 p-3.5 bg-white rounded border border-[#17233B]/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-editorial font-bold text-[#17233B] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1BA64B]" />
              <span>Contact direct</span>
            </span>
            <span className="text-[9px] font-mono text-[#17233B]/50 uppercase tracking-wider">In-App</span>
          </div>
          <p className="text-[11px] text-[#17233B]/70 leading-relaxed">
            Parlez avec {selectedOffer.employerName} par message ou par appel direct sans partager votre numéro personnel.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleStartMessage}
              className="py-2 px-3 rounded border border-[#17233B]/20 bg-[#F3F3EC] text-[#17233B] text-xs font-medium hover:bg-[#17233B]/10 flex items-center justify-center gap-1.5 tap-feedback cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Envoyer un message</span>
            </button>
            <button
              onClick={handleAudioCall}
              className="py-2 px-3 rounded border border-[#1BA64B]/30 bg-[#1BA64B]/10 text-[#17233B] text-xs font-medium hover:bg-[#1BA64B]/20 flex items-center justify-center gap-1.5 tap-feedback cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-[#1BA64B]" />
              <span>Appeler</span>
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F3F3EC] border-t border-[#17233B]/15 z-30 max-w-md mx-auto">
        {alreadyApplied ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1BA64B]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Candidature envoyée</span>
            </div>
            <EditorialButton
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveTab('APPLICATIONS');
              }}
            >
              Mes Candidatures
            </EditorialButton>
          </div>
        ) : (
          <EditorialButton
            variant="primary"
            fullWidth
            onClick={handleApply}
          >
            <span>Postuler</span>
          </EditorialButton>
        )}
      </div>

      {actionFeedback && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-sm mx-auto p-3 bg-[#17233B] text-[#F3F3EC] rounded-[4px] shadow-lg flex items-center justify-between gap-2 text-xs font-operational animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1BA64B] shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-[10px] font-mono opacity-60 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
