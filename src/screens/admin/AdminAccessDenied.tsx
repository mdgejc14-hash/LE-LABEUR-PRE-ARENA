import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { EditorialButton } from '../../components/common/EditorialButton';
import { useApp } from '../../context/AppContext';

export const AdminAccessDenied: React.FC = () => {
  const { currentUser, setScreen } = useApp();

  const handleReturn = () => {
    // Clear URL hash or path and return to main screen
    if (typeof window !== 'undefined') {
      if (window.location.hash) window.location.hash = '';
      if (window.location.pathname.startsWith('/admin')) {
        window.history.pushState(null, '', '/');
      }
    }
    setScreen('MAIN');
  };

  return (
    <div className="min-h-screen bg-[#F3F3EC] flex flex-col justify-between p-6 select-none font-operational text-[#17233B]">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-xl w-full mx-auto pt-4">
        <BrandLogo variant="default" className="h-7 max-w-[140px] w-auto" />
        <span className="text-[10px] uppercase tracking-widest text-[#A33A2B] font-semibold px-2 py-0.5 border border-[#A33A2B]/20 bg-[#A33A2B]/5 rounded-[3px]">
          Sécurité Interne
        </span>
      </div>

      {/* Main Content */}
      <div className="max-w-md w-full mx-auto my-auto py-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-[#A33A2B]/10 border border-[#A33A2B]/20 flex items-center justify-center mx-auto text-[#A33A2B]">
          <ShieldAlert className="w-8 h-8 stroke-[1.8]" />
        </div>

        <div className="space-y-2">
          <span className="editorial-kicker text-[#A33A2B]">
            ERREUR 403 · ACCÈS STRICTEMENT RESTREINT
          </span>
          <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight">
            Accès Refusé à la Cellule d'Administration
          </h1>
          <p className="text-xs sm:text-sm text-[#17233B]/70 leading-relaxed max-w-sm mx-auto">
            Le portail administratif central est réservé exclusivement au personnel accrédité de LE LABEUR en République du Bénin.
          </p>
        </div>

        <div className="p-4 bg-white border border-[#17233B]/10 rounded-[4px] text-left space-y-2 text-xs">
          <div className="flex items-center justify-between text-[#17233B]/60 text-[11px]">
            <span>Profil actuellement connecté :</span>
            <span className="font-semibold text-[#17233B]">{currentUser?.role || 'UTILISATEUR PUBLIC'}</span>
          </div>
          <div className="flex items-center justify-between text-[#17233B]/60 text-[11px]">
            <span>Identifiant :</span>
            <span className="font-mono text-[#17233B]">{currentUser?.publicId || 'Non renseigné'}</span>
          </div>
          <div className="flex items-center justify-between text-[#17233B]/60 text-[11px]">
            <span>Règle d'imperméabilité :</span>
            <span className="text-[#A33A2B] font-medium">Refus automatique</span>
          </div>
        </div>

        <div className="pt-2">
          <EditorialButton
            variant="primary"
            fullWidth
            onClick={handleReturn}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span>Retourner à mon espace personnel</span>
          </EditorialButton>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center max-w-md mx-auto pb-4">
        <p className="text-[11px] text-[#17233B]/40">
          Système d'audit et de contrôle déontologique LE LABEUR · Cotonou, République du Bénin.
        </p>
      </div>
    </div>
  );
};
