import React from 'react';
import { Bookmark, Trash2, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';

export const FavoritesScreen: React.FC = () => {
  const { offers, favorites, toggleFavorite, openOfferDetail, setActiveTab } = useApp();
  const favoriteOffers = offers.filter(o => favorites.includes(o.id));

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#F3F3EC] select-none pb-20 font-operational text-xs text-[#17233B]">
      <div className="mb-4">
        <span className="editorial-kicker">
          Sélection Personnelle
        </span>
        <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight mt-0.5">
          Mes Favoris
        </h1>
        <p className="font-operational text-xs text-[#17233B]/70 mt-1">
          Offres enregistrées pour postuler plus tard.
        </p>
      </div>

      {favoriteOffers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
          <div className="w-14 h-14 rounded-full bg-[#17233B]/5 flex items-center justify-center text-[#17233B]/40 mb-4">
            <Bookmark className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h2 className="font-editorial text-xl font-bold text-[#17233B]">
            Aucun favori enregistré
          </h2>
          <p className="font-operational text-xs text-[#17233B]/60 max-w-xs mt-1.5 leading-relaxed">
            Cliquez sur le signet d une offre pour la conserver ici.
          </p>
          <div className="mt-6">
            <EditorialButton
              variant="primary"
              size="md"
              onClick={() => setActiveTab('DISCOVER')}
            >
              <span>Découvrir les offres</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </EditorialButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-widest text-[#17233B]/50 font-semibold">
            {favoriteOffers.length} {favoriteOffers.length > 1 ? 'Offres enregistrées' : 'Offre enregistrée'}
          </div>
          {favoriteOffers.map(offer => (
            <article
              key={offer.id}
              onClick={() => openOfferDetail(offer)}
              className="p-4 bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 transition-all cursor-pointer tap-feedback shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono text-[#17233B]/50">{offer.employerName} · {offer.location}</span>
                  <h3 className="font-editorial text-base font-bold text-[#17233B] mt-0.5">
                    {offer.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(offer.id);
                  }}
                  className="p-1.5 text-[#E23D3D]/70 hover:text-[#E23D3D] rounded tap-feedback cursor-pointer"
                  aria-label="Retirer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#17233B]/10 text-xs font-operational">
                <span className="font-mono font-bold text-[#17233B]">
                  {offer.remuneration.toLocaleString()} {offer.currency}
                </span>
                <span className="text-[#17233B]/60 font-medium">
                  {offer.contractType}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
