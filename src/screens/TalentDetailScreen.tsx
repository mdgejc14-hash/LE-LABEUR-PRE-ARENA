import React, { useState } from 'react';
import { ArrowLeft, MapPin, MessageSquare, Phone, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';
import { HairlineDivider } from '../components/common/HairlineDivider';
import { getAvatar } from '../utils/assets';

export const TalentDetailScreen: React.FC = () => {
  const { selectedCandidate, navigateBack, backToFeed, openConversationForContext, startAudioCall } = useApp();
  const [callToast, setCallToast] = useState<string | null>(null);

  if (!selectedCandidate) {
    return (
      <div className="p-8 text-center bg-[#F3F3EC]">
        <p className="font-editorial text-lg text-[#17233B]">Profil non sélectionné</p>
        <EditorialButton onClick={navigateBack || backToFeed} className="mt-4">
          Retour au répertoire
        </EditorialButton>
      </div>
    );
  }

  const handleStartChat = async () => {
    await openConversationForContext(
      {
        id: selectedCandidate.id,
        publicId: selectedCandidate.publicId,
        name: selectedCandidate.fullName,
        role: 'CANDIDATE',
        avatarUrl: selectedCandidate.avatarUrl || getAvatar(selectedCandidate.id)
      },
      {
        contextType: 'OFFER',
        contextRefId: `TALENT-${selectedCandidate.id}`,
        contextTitle: `Échange direct — ${selectedCandidate.headline || selectedCandidate.fullName}`
      }
    );
  };

  const handleAudioCall = async () => {
    try {
      await startAudioCall({
        id: selectedCandidate.id,
        fullName: selectedCandidate.fullName,
        role: 'CANDIDATE',
        avatarUrl: selectedCandidate.avatarUrl || getAvatar(selectedCandidate.id),
        headline: selectedCandidate.headline
      });
    } catch {
      setCallToast("Microphone non disponible pour l'appel.");
      setTimeout(() => setCallToast(null), 3000);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F3F3EC] select-none font-operational text-xs overflow-hidden">
      <div className="sticky top-0 z-30 bg-[#F3F3EC] border-b border-[#17233B]/10 px-4 h-14 flex items-center justify-between shrink-0">
        <button
          onClick={navigateBack || backToFeed}
          className="flex items-center gap-1.5 text-xs font-operational font-medium text-[#17233B]/70 hover:text-[#17233B] py-1.5 px-2 -ml-2 rounded tap-feedback cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour</span>
        </button>
        <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-[#17233B]/50">
          ID : {selectedCandidate.publicId}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 pb-24 space-y-6 max-w-lg mx-auto w-full no-scrollbar">
        <div className="flex items-start gap-4">
          <div className="w-24 h-28 rounded-[4px] overflow-hidden bg-[#FFFFFF] border border-[#17233B]/15 shrink-0 shadow-sm">
            <img
              src={selectedCandidate.avatarUrl || getAvatar(selectedCandidate.id)}
              alt={selectedCandidate.fullName}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#340C24] font-bold">
              {selectedCandidate.publicId}
            </span>
            <h1 className="font-editorial text-2xl font-bold text-[#17233B] leading-tight mt-0.5">
              {selectedCandidate.fullName}
            </h1>
            <p className="text-xs font-operational font-medium text-[#17233B]/80 mt-1">
              {selectedCandidate.headline}
            </p>
            <div className="flex items-center gap-1.5 text-xs font-operational text-[#17233B]/60 mt-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>{selectedCandidate.location}</span>
            </div>
          </div>
        </div>

        <HairlineDivider />

        <div className="grid grid-cols-2 gap-3 p-4 bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/10 font-operational shadow-xs">
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#17233B]/50 tracking-wider">
              Disponibilité
            </span>
            <p className="text-sm font-semibold text-[#1BA64B] mt-0.5">
              {selectedCandidate.availability}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-[#17233B]/50 tracking-wider">
              Expérience
            </span>
            <p className="text-sm font-semibold text-[#17233B] mt-0.5">
              {selectedCandidate.experienceYears} années certifiées
            </p>
          </div>
          <div className="col-span-2 pt-2 border-t border-[#17233B]/10">
            <span className="text-[10px] uppercase font-semibold text-[#17233B]/50 tracking-wider">
              Conditions Souhaitées
            </span>
            <p className="text-xs text-[#17233B]/80 mt-0.5 font-medium">
              {selectedCandidate.desiredContract} · {selectedCandidate.desiredSalary}
            </p>
          </div>
        </div>

        <div>
          <h2 className="font-editorial text-lg font-bold text-[#17233B] mb-2">
            À Propos
          </h2>
          <p className="font-operational text-xs text-[#17233B]/80 leading-relaxed bg-[#FFFFFF] p-4 rounded-[4px] border border-[#17233B]/10">
            {selectedCandidate.bio}
          </p>
        </div>

        <div>
          <h2 className="font-editorial text-lg font-bold text-[#17233B] mb-2">
            Compétences & Savoir-faire
          </h2>
          <div className="flex flex-wrap gap-2">
            {selectedCandidate.skills.map((skill, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-[#FFFFFF] text-[#17233B] text-xs font-operational font-medium rounded-[4px] border border-[#17233B]/15"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-[#17233B]/10 rounded-[4px] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#17233B] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1BA64B]" />
              <span>Communication Sécurisée</span>
            </span>
            <span className="text-[10px] font-mono text-[#17233B]/50">Audio Direct In-App</span>
          </div>
          <p className="text-[11px] text-[#17233B]/70 leading-normal">
            Échangez directement dans l'application. Votre numéro personnel reste protégé.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleAudioCall}
              className="w-full py-2 px-3 border border-[#1BA64B]/30 bg-[#1BA64B]/10 rounded text-xs font-semibold text-[#17233B] hover:bg-[#1BA64B]/20 flex items-center justify-center gap-1.5 tap-feedback cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-[#1BA64B]" />
              <span>Appeler</span>
            </button>
            <button
              onClick={handleStartChat}
              className="w-full py-2 px-3 border border-[#17233B]/20 bg-[#F3F3EC] rounded text-xs font-semibold text-[#17233B] hover:bg-[#17233B]/10 flex items-center justify-center gap-1.5 tap-feedback cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Envoyer un message</span>
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F3F3EC] border-t border-[#17233B]/15 z-30 max-w-md mx-auto flex items-center gap-2">
        <EditorialButton
          variant="outline"
          onClick={handleAudioCall}
        >
          <Phone className="w-4 h-4 mr-1 text-[#1BA64B]" />
          <span>Appeler</span>
        </EditorialButton>
        <EditorialButton
          variant="primary"
          fullWidth
          onClick={handleStartChat}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          <span>Contacter / Proposer</span>
        </EditorialButton>
      </div>

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
