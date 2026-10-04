import React from 'react';
import { ArrowLeft, PlayCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BrandLogo } from '../brand/BrandLogo';
import { IS_DEMO_MODE } from '../../utils/config';

interface AndroidTopBarProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const AndroidTopBar: React.FC<AndroidTopBarProps> = ({
  title,
  showBack = false,
  onBack,
  rightAction
}) => {
  const { currentRole, setScenarioDrawerOpen, currentUser } = useApp();
  // Ne montrer les outils QA que si Admin authentifié en mode démo.
  // INTERDICTION STRICTE : Aucun utilisateur connecté (Candidat ou Employeur) ne doit voir de bouton pour changer de rôle ou basculer d'espace.
  const showAdminDemoTools = IS_DEMO_MODE && currentUser?.role === 'ADMIN';

  return (
    <header className="sticky top-0 z-30 h-14 bg-[#F3F3EC] border-b border-[#17233B]/10 px-4 flex items-center justify-between select-none">
      {/* Left Slot: Official BrandLogo or Back Navigation */}
      <div className="flex items-center gap-2 min-w-0">
        {showBack ? (
          <button
            onClick={onBack}
            className="w-10 h-10 -ml-1.5 flex items-center justify-center rounded-full text-[#17233B] hover:bg-[#17233B]/5 tap-feedback"
            aria-label="Retour"
          >
            <ArrowLeft className="w-4 h-4 stroke-[1.8]" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <BrandLogo variant="default" className="h-6 max-w-[130px] w-auto" />
            <span className="text-[9px] font-operational uppercase tracking-widest text-[#17233B]/45 font-medium px-1.5 py-0.5 border border-[#17233B]/10 rounded-[3px]">
              Bénin
            </span>
          </div>
        )}
        {title && (
          <h1 className="font-editorial text-base font-semibold text-[#17233B] truncate ml-1">
            {title}
          </h1>
        )}
      </div>

      {/* Right Slot */}
      <div className="flex items-center gap-2">
        {rightAction}
        {showAdminDemoTools && (
          <button
            onClick={() => setScenarioDrawerOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-operational font-medium text-[#17233B] bg-white border border-[#17233B]/15 hover:border-[#17233B]/30 rounded-full transition-colors tap-feedback"
            title="Console QA des tests"
          >
            <PlayCircle className="w-3.5 h-3.5 text-[#340C24]" />
            <span className="font-mono text-[10px] uppercase font-bold text-[#340C24]">QA / Tests</span>
          </button>
        )}
        {currentUser && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-medium text-[#17233B]/60 bg-white/80 border border-[#17233B]/10 px-2 py-0.5 rounded-[3px]">
              {currentUser.publicId || 'ID indisponible'}
            </span>
            <span className="text-[11px] font-operational font-medium text-[#17233B]/70 bg-white/70 border border-[#17233B]/10 px-2.5 py-0.5 rounded-full">
              {currentRole === 'EMPLOYER' ? 'Recruteur' : 'Artisan'}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};
