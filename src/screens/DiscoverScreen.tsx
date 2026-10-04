import React, { useState } from 'react';
import { Search, SlidersHorizontal, Bookmark, BookmarkCheck, ShieldAlert, MapPin, CheckCircle2, Sparkles, Navigation } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';
import { HairlineDivider } from '../components/common/HairlineDivider';
import { FilterBottomSheet } from './FilterBottomSheet';
import { searchActivities } from '../data/activityCatalog';

export const DiscoverScreen: React.FC = () => {
  const {
    offers,
    favorites,
    toggleFavorite,
    openOfferDetail,
    filterState,
    updateFilterState,
    resetFilters,
    applyToOffer
  } = useApp();

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [justAppliedId, setJustAppliedId] = useState<string | null>(null);

  // RÈGLE 21 & 23 : Une offre FILLED ne doit JAMAIS apparaître dans le catalogue candidat
  const activePublicOffers = offers.filter(o => o.status === 'ACTIVE');

  const filteredOffers = activePublicOffers.filter(o => {
    if (filterState.searchQuery) {
      const q = filterState.searchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const directMatch =
        o.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
        o.skills.some(s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) ||
        o.location.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
        o.employerName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q) ||
        (o.summary && o.summary.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));

      const catalogMatchedJobs = searchActivities(q);
      const taxonomicMatch = catalogMatchedJobs.some(job => {
        if (o.domainId && o.domainId === job.domainId) return true;
        if (o.jobId && o.jobId === job.id) return true;
        const offerSkillsLower = o.skills.map(s => s.toLowerCase());
        const hasSkillOverlap = job.skills.some(js => offerSkillsLower.some(os => os.includes(js.toLowerCase()) || js.toLowerCase().includes(os)));
        return hasSkillOverlap || o.title.toLowerCase().includes(job.title.toLowerCase());
      });

      if (!directMatch && !taxonomicMatch) return false;
    }

    // 1. Filtrage géographique hiérarchique par IDs structurés (Autorité de référence)
    const hasStructuredGeo = Boolean(
      filterState.departmentId ||
      filterState.communeId ||
      filterState.arrondissementId ||
      filterState.localityId
    );

    if (filterState.departmentId && o.departmentId !== filterState.departmentId) {
      return false;
    }
    if (filterState.communeId && o.municipalityId !== filterState.communeId) {
      return false;
    }
    if (filterState.arrondissementId && o.arrondissementId !== filterState.arrondissementId) {
      return false;
    }
    if (filterState.localityId && o.localityId !== filterState.localityId) {
      return false;
    }

    // 2. Filtrage textuel de localisation libre (UNIQUEMENT si aucun ID géographique structuré n'est sélectionné)
    if (!hasStructuredGeo && filterState.location && !o.location.toLowerCase().includes(filterState.location.toLowerCase())) {
      return false;
    }

    if (filterState.selectedDomain && o.domainId !== filterState.selectedDomain) {
      return false;
    }
    if (filterState.selectedJob && o.jobId !== filterState.selectedJob) {
      return false;
    }
    if (filterState.contractType && filterState.contractType !== 'ALL' && !o.contractType.toLowerCase().includes(filterState.contractType.toLowerCase())) {
      return false;
    }
    if (filterState.selectedSkills.length > 0) {
      const hasSkill = filterState.selectedSkills.some(s => o.skills.includes(s));
      if (!hasSkill) return false;
    }
    return true;
  });

  const handleQuickApply = async (e: React.MouseEvent, offerId: string) => {
    e.stopPropagation();
    try {
      await applyToOffer(offerId);
      setJustAppliedId(offerId);
      setTimeout(() => setJustAppliedId(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Impossible de postuler');
    }
  };

  const hasActiveFilters = 
    filterState.location !== '' || 
    Boolean(filterState.departmentId) ||
    Boolean(filterState.communeId) ||
    Boolean(filterState.selectedDomain) ||
    Boolean(filterState.selectedJob) ||
    (filterState.contractType !== '' && filterState.contractType !== 'ALL') || 
    filterState.selectedSkills.length > 0;

  const featuredOffer = filteredOffers.find(o => o.id === 'OFFER-001') || filteredOffers[0];
  const forYouOffers = filteredOffers.filter(o => o.id !== featuredOffer?.id && !o.isLeLabeurJob && o.compatibilityScore >= 88);
  const nearbyOffers = filteredOffers.filter(o => o.id !== featuredOffer?.id && !o.isLeLabeurJob && o.compatibilityScore < 88);
  const urgentOffers = filteredOffers.filter(o => o.isLeLabeurJob || o.isUrgent);

  return (
    <div className="flex-1 flex flex-col pb-16 bg-[#F3F3EC] select-none font-operational text-[#17233B]">
      {/* En-tête Éditorial & Recherche */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-[#17233B]/60 font-medium mb-1">
          <MapPin className="w-3.5 h-3.5 text-[#17233B]/70" />
          <span className="tracking-wide">Cotonou · Calavi · Porto-Novo · Parakou — Bénin</span>
        </div>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight leading-tight">
          Trouver un travail
        </h1>
        <p className="text-xs text-[#17233B]/70 mt-1 max-w-sm leading-relaxed">
          Offres vérifiées d artisanat et postes qualifiés sous accord clair LE LABEUR.
        </p>

        {/* Barre de Recherche & Bouton Filtres */}
        <div className="flex items-center gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[#17233B]/40" />
            <input
              type="text"
              placeholder="Métier, compétence ou quartier au Bénin..."
              value={filterState.searchQuery}
              onChange={e => updateFilterState({ searchQuery: e.target.value })}
              className="w-full h-11 pl-9 pr-3 bg-[#FFFFFF] border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
            />
          </div>
          <button
            onClick={() => setIsFilterSheetOpen(true)}
            className={`h-11 px-3.5 flex items-center gap-1.5 rounded-[4px] border text-xs font-medium transition-colors tap-feedback cursor-pointer ${
              hasActiveFilters
                ? 'bg-[#17233B] text-[#F3F3EC] border-[#17233B]'
                : 'bg-[#FFFFFF] text-[#17233B]/75 border-[#17233B]/15 hover:border-[#17233B]/40'
            }`}
            aria-label="Ouvrir les filtres"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filtres</span>
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFA800]" />
            )}
          </button>
        </div>
      </div>

      <HairlineDivider className="my-2" />

      {/* RECHERCHE ACTIVE OU FILTRÉE */}
      {(filterState.searchQuery || hasActiveFilters) ? (
        <section className="px-5 py-3 space-y-4">
          <div className="flex items-center justify-between">
            <span className="editorial-kicker">
              {filteredOffers.length} OFFRE(S) CORRESPONDANTE(S)
            </span>
            <button
              onClick={resetFilters}
              className="text-[11px] text-[#17233B]/60 hover:text-[#17233B] underline underline-offset-2 cursor-pointer"
            >
              Effacer filtres
            </button>
          </div>

          <div className="divide-y divide-[#17233B]/10">
            {filteredOffers.map(offer => {
              const isFav = favorites.includes(offer.id);
              const isApplied = justAppliedId === offer.id;

              return (
                <article
                  key={offer.id}
                  onClick={() => openOfferDetail(offer)}
                  className="py-4 hover:bg-[#FFFFFF]/40 transition-colors cursor-pointer tap-feedback space-y-2.5"
                >
                  {offer.isUrgent && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#340C24] uppercase">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#340C24]" />
                      <span>{offer.leLabeurTag || 'MISSION URGENTE LE LABEUR'}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-[#17233B]/60">
                    <span className="font-semibold text-[#17233B]">{offer.employerName}</span>
                    <span>{offer.location}</span>
                  </div>

                  <h3 className="font-editorial text-2xl font-bold text-[#17233B] tracking-tight leading-snug">
                    {offer.title}
                  </h3>

                  <div className="flex items-baseline justify-between text-xs pt-0.5">
                    <div>
                      <span className="font-mono text-base font-bold text-[#17233B]">
                        {offer.remuneration.toLocaleString()} {offer.currency}
                      </span>
                      <span className="text-[#17233B]/60 font-medium ml-1.5">
                        · {offer.contractType}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-[#1BA64B]">
                      {offer.compatibilityScore}% correspondance
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {offer.skills.slice(0, 3).map((s, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] text-[#17233B]/70 bg-white border border-[#17233B]/10 px-2 py-0.5 rounded-[2px]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(offer.id);
                      }}
                      className="p-1.5 text-[#17233B]/60 hover:text-[#17233B] rounded tap-feedback cursor-pointer"
                      aria-label={isFav ? 'Retirer' : 'Enregistrer'}
                    >
                      {isFav ? (
                        <BookmarkCheck className="w-4 h-4 fill-[#340C24] text-[#340C24]" />
                      ) : (
                        <Bookmark className="w-4 h-4 stroke-[1.6]" />
                      )}
                    </button>
                    <EditorialButton
                      variant={offer.isUrgent ? 'primary' : 'primary'}
                      size="sm"
                      onClick={(e) => handleQuickApply(e, offer.id)}
                    >
                      {isApplied ? 'Postulé' : 'Postuler'}
                    </EditorialButton>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        /* VUE ÉDITORIALE EN 4 CHAPITRES */
        <div className="space-y-8 mt-2">
          {/* CHAPITRE 01 — À LA UNE */}
          {featuredOffer && (
            <section className="px-5">
              <div className="flex items-center justify-between mb-3">
                <span className="editorial-kicker">
                  01 · À LA UNE · MISSION DU JOUR
                </span>
                <span className="text-[10px] font-mono text-[#1BA64B] font-bold">
                  {featuredOffer.compatibilityScore}% accord
                </span>
              </div>

              <article 
                onClick={() => openOfferDetail(featuredOffer)}
                className="bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/12 overflow-hidden cursor-pointer tap-feedback shadow-none"
              >
                <div className="relative w-full h-44 bg-[#17233B] flex items-center justify-center overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="400" height="220" fill="#17233B"/>
                    <line x1="30" y1="180" x2="370" y2="180" stroke="#B5CEDB" strokeWidth="1.5" strokeOpacity="0.4"/>
                    <rect x="60" y="50" width="130" height="130" stroke="#B5CEDB" strokeWidth="1.5" strokeOpacity="0.6"/>
                    <circle cx="270" cy="115" r="45" stroke="#F8BBCB" strokeWidth="1.5" strokeOpacity="0.7"/>
                    <text x="60" y="38" fontFamily="Georgia, serif" fontSize="13" fill="#F3F3EC" opacity="0.85">AGENCEMENT D'ART & BOIS NOBLE</text>
                  </svg>
                  <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 bg-[#17233B]/90 text-[#F3F3EC] text-[10px] font-medium rounded-[2px] tracking-wide border border-white/10">
                    {featuredOffer.employerLocation}
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-[#17233B]/70 truncate">
                      {featuredOffer.employerName}
                    </span>
                    <span className="text-xs text-[#17233B]/50 shrink-0">
                      {featuredOffer.location}
                    </span>
                  </div>

                  <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight leading-snug">
                    {featuredOffer.title}
                  </h2>

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="font-mono text-lg font-bold text-[#17233B]">
                      {featuredOffer.remuneration.toLocaleString()} {featuredOffer.currency}
                    </span>
                    <span className="text-xs text-[#17233B]/60 font-medium">
                      · {featuredOffer.contractType}
                    </span>
                  </div>

                  <p className="text-xs text-[#17233B]/75 leading-relaxed line-clamp-2">
                    {featuredOffer.summary}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {featuredOffer.skills.slice(0, 4).map((skill, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] text-[#17233B]/80 bg-[#17233B]/5 px-2 py-0.5 rounded-[2px]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-[#17233B]/10 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#1BA64B] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{featuredOffer.compatibilityScore}% correspondance</span>
                    </div>
                    <EditorialButton
                      variant="primary"
                      size="sm"
                      onClick={(e) => handleQuickApply(e, featuredOffer.id)}
                    >
                      {justAppliedId === featuredOffer.id ? 'Postulé' : 'Postuler'}
                    </EditorialButton>
                  </div>
                </div>
              </article>
            </section>
          )}

          {/* CHAPITRE 02 — POUR VOUS */}
          {forYouOffers.length > 0 && (
            <section className="px-5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#340C24]" />
                  <span className="editorial-kicker text-[#17233B]">
                    02 · POUR VOUS · COMPATIBILITÉ
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#17233B]/40">
                  {forYouOffers.length} postes
                </span>
              </div>

              <div className="divide-y divide-[#17233B]/10 border-y border-[#17233B]/10 bg-white/50 rounded-[4px] px-4">
                {forYouOffers.map(offer => (
                  <article
                    key={offer.id}
                    onClick={() => openOfferDetail(offer)}
                    className="py-4 cursor-pointer tap-feedback space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-[#17233B]/60">
                      <span className="font-semibold text-[#17233B]">{offer.employerName}</span>
                      <span>{offer.location}</span>
                    </div>

                    <h3 className="font-editorial text-xl font-bold text-[#17233B] leading-snug">
                      {offer.title}
                    </h3>

                    <div className="flex items-baseline justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-[#17233B] text-sm">
                          {offer.remuneration.toLocaleString()} {offer.currency}
                        </span>
                        <span className="text-[#17233B]/60 font-medium ml-1.5">· {offer.contractType}</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#1BA64B]">
                        {offer.compatibilityScore}% accord
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs text-[#17233B] underline underline-offset-2 font-medium">
                        Voir les détails
                      </span>
                      <EditorialButton
                        variant="primary"
                        size="sm"
                        onClick={(e) => handleQuickApply(e, offer.id)}
                      >
                        {justAppliedId === offer.id ? 'Postulé' : 'Postuler'}
                      </EditorialButton>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* CHAPITRE 03 — MISSIONS URGENTES */}
          {urgentOffers.length > 0 && (
            <section className="px-5 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#340C24]" />
                  <span className="editorial-kicker text-[#340C24]">
                    03 · MISSIONS URGENTES LE LABEUR
                  </span>
                </div>
                <span className="text-[9px] font-mono text-[#340C24] bg-[#340C24]/10 px-1.5 py-0.5 rounded font-bold">
                  PRIORITAIRE
                </span>
              </div>

              <div className="space-y-3">
                {urgentOffers.map(job => (
                  <article
                    key={job.id}
                    onClick={() => openOfferDetail(job)}
                    className="p-5 bg-white rounded-[4px] border border-[#340C24]/20 shadow-none space-y-3 cursor-pointer tap-feedback"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-[#340C24] font-mono uppercase tracking-wider">
                        {job.leLabeurTag || 'MISSION URGENTE LE LABEUR'}
                      </span>
                      <span className="text-[#17233B]/60">{job.location}</span>
                    </div>

                    <h3 className="font-editorial text-2xl font-bold text-[#17233B] leading-snug">
                      {job.title}
                    </h3>

                    <p className="text-xs text-[#17233B]/75 leading-relaxed line-clamp-2">
                      {job.summary}
                    </p>

                    <div className="flex items-baseline justify-between text-xs pt-2 border-t border-[#17233B]/10">
                      <div>
                        <span className="font-mono font-bold text-base text-[#17233B]">
                          {job.remuneration.toLocaleString()} {job.currency}
                        </span>
                        <span className="text-[10px] text-[#17233B]/50 block">Règlement direct garanti LE LABEUR</span>
                      </div>
                      <EditorialButton
                        variant="primary"
                        size="sm"
                        onClick={(e) => handleQuickApply(e, job.id)}
                      >
                        {justAppliedId === job.id ? 'Postulé' : 'Postuler en urgence'}
                      </EditorialButton>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Filter Bottom Sheet */}
      <FilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        filterState={filterState}
        onApply={updateFilterState}
        onReset={resetFilters}
        resultsCount={filteredOffers.length}
      />
    </div>
  );
};
