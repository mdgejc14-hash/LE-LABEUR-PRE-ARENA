import React, { useState } from 'react';
import { Search, MapPin, Bookmark, BookmarkCheck, MessageSquare, Phone } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserProfile } from '../types';
import { EditorialButton } from '../components/common/EditorialButton';
import { getAvatar } from '../utils/assets';

export const TalentsScreen: React.FC = () => {
  const { candidates, openCandidateDetail, openConversationForContext, startAudioCall } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [savedTalents, setSavedTalents] = useState<string[]>([]);
  const [callToast, setCallToast] = useState<string | null>(null);

  const filteredCandidates = candidates.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.headline.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q) ||
      c.skills.some(s => s.toLowerCase().includes(q)) ||
      c.availability.toLowerCase().includes(q)
    );
  });

  const toggleSaveTalent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (savedTalents.includes(id)) {
      setSavedTalents(savedTalents.filter(t => t !== id));
    } else {
      setSavedTalents([...savedTalents, id]);
    }
  };

  const handleContact = async (cand: UserProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    await openConversationForContext(
      {
        id: cand.id,
        publicId: cand.publicId,
        name: cand.fullName,
        role: 'CANDIDATE',
        avatarUrl: cand.avatarUrl || getAvatar(cand.id)
      },
      {
        contextType: 'OFFER',
        contextRefId: `TALENT-${cand.id}`,
        contextTitle: `Échange direct — ${cand.headline || cand.fullName}`
      }
    );
  };

  const handleAudioCallDirect = async (cand: UserProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startAudioCall({
        id: cand.id,
        fullName: cand.fullName,
        role: 'CANDIDATE',
        avatarUrl: cand.avatarUrl || getAvatar(cand.id),
        headline: cand.headline
      });
    } catch {
      setCallToast(`Impossible de lancer l'appel audio avec ${cand.fullName}`);
      setTimeout(() => setCallToast(null), 3000);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-6 bg-[#F3F3EC] select-none font-operational text-xs">
      <div className="px-5 pt-4 pb-3 border-b border-[#17233B]/10 bg-[#F3F3EC]">
        <span className="text-[11px] font-operational uppercase tracking-widest text-[#17233B]/50 font-semibold">
          Espace Recruteur — Vivier Bénin
        </span>
        <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight mt-0.5">
          Artisans & Professionnels
        </h1>
        <p className="font-operational text-xs text-[#17233B]/70 mt-1">
          Profils qualifiés, références vérifiées et disponibles pour mission.
        </p>

        <div className="relative mt-3">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#17233B]/40" />
          <input
            type="text"
            placeholder="Métier, compétence ou disponibilité..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-3 bg-[#FFFFFF] border border-[#17233B]/15 rounded-[4px] text-xs font-operational text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
          />
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center justify-between text-[11px] font-operational uppercase tracking-widest text-[#17233B]/50 font-semibold">
          <span>{filteredCandidates.length} Artisans disponibles</span>
          <span>Index par compétences</span>
        </div>

        {filteredCandidates.map(cand => {
          const isSaved = savedTalents.includes(cand.id);
          return (
            <article
              key={cand.id}
              onClick={() => openCandidateDetail(cand)}
              className="bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/12 hover:border-[#17233B]/30 transition-all cursor-pointer tap-feedback overflow-hidden p-4 shadow-xs"
            >
              <div className="flex items-start gap-4">
                <div className="w-20 h-24 rounded-[4px] overflow-hidden bg-[#F3F3EC] border border-[#17233B]/10 shrink-0">
                  <img
                    src={cand.avatarUrl || getAvatar(cand.id)}
                    alt={cand.fullName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-editorial text-lg font-bold text-[#17233B] leading-tight truncate">
                      {cand.fullName}
                    </h3>
                    {cand.matchCompatibility && (
                      <span className="text-[10px] font-operational font-bold px-1.5 py-0.5 bg-[#1BA64B]/10 text-[#1BA64B] rounded-[2px] shrink-0">
                        {cand.matchCompatibility}% adéquation
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-operational font-medium text-[#17233B]/80 mt-0.5 line-clamp-1">
                    {cand.headline}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] font-operational text-[#17233B]/60 mt-1">
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                      {cand.location.split(' ')[0]}
                    </span>
                    <span>·</span>
                    <span className="font-mono text-[10px] text-[#340C24] font-semibold">
                      {cand.publicId}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {cand.skills.slice(0, 3).map((skill, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-operational text-[#17233B]/70 bg-[#17233B]/5 px-1.5 py-0.5 rounded-[2px]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[#17233B]/10 flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => toggleSaveTalent(cand.id, e)}
                  className="p-1.5 text-[#17233B]/60 hover:text-[#17233B] rounded tap-feedback cursor-pointer"
                  aria-label="Enregistrer ce profil"
                >
                  {isSaved ? (
                    <BookmarkCheck className="w-4 h-4 fill-[#340C24] text-[#340C24]" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleAudioCallDirect(cand, e)}
                    className="py-1.5 px-2.5 border border-[#1BA64B]/30 bg-[#1BA64B]/10 rounded text-[#17233B] hover:bg-[#1BA64B]/20 tap-feedback flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer"
                    title="Appel audio direct LE LABEUR"
                  >
                    <Phone className="w-3.5 h-3.5 text-[#1BA64B]" />
                    <span>Appeler</span>
                  </button>
                  <EditorialButton
                    variant="primary"
                    size="sm"
                    onClick={(e) => handleContact(cand, e)}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    <span>Contacter</span>
                  </EditorialButton>
                </div>
              </div>
            </article>
          );
        })}
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
