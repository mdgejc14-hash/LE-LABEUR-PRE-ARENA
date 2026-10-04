import React, { useState } from 'react';
import { UserCheck, Building2, Check, ArrowRight } from 'lucide-react';
import { EditorialButton } from '../components/common/EditorialButton';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { BrandLogo } from '../components/brand/BrandLogo';

export const RoleSelectionScreen: React.FC = () => {
  const { setScreen, setRole } = useApp();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const handleContinue = async (roleToApply?: UserRole) => {
    const role = roleToApply || selectedRole;
    if (!role) return;
    await setRole(role);
    setScreen('AUTH');
  };

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
  };

  const handleDoubleClick = async (role: UserRole) => {
    setSelectedRole(role);
    await handleContinue(role);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-between select-none bg-[#F3F3EC] h-full overflow-hidden">
      {/* Scrollable Main Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
        {/* Header with Brand Logo */}
        <div className="pt-1">
          <div className="mb-4">
            <BrandLogo variant="default" className="h-7 max-w-[140px] w-auto" />
          </div>
          <span className="editorial-kicker">
            01 · VOTRE PROFIL
          </span>
          <h2 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight mt-1 leading-tight">
            Choisissez votre profil
          </h2>
          <p className="font-operational text-xs sm:text-sm text-[#17233B]/70 mt-2 leading-relaxed">
            Sélectionnez ce que vous souhaitez faire sur LE LABEUR au Bénin.
          </p>
        </div>

        {/* Role Choices */}
        <div className="space-y-4">
          {/* Candidate Option */}
          <div
            onClick={() => handleSelectRole('CANDIDATE')}
            onDoubleClick={() => handleDoubleClick('CANDIDATE')}
            className={`p-5 rounded-[4px] border transition-all cursor-pointer tap-feedback ${
              selectedRole === 'CANDIDATE'
                ? 'border-[#17233B] bg-[#FFFFFF] shadow-none ring-1 ring-[#17233B]'
                : 'border-[#17233B]/12 bg-[#FFFFFF]/70 hover:bg-[#FFFFFF]'
            }`}
            role="button"
            tabIndex={0}
            aria-pressed={selectedRole === 'CANDIDATE'}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3.5">
                <div className={`w-10 h-10 rounded-[4px] flex items-center justify-center shrink-0 ${
                  selectedRole === 'CANDIDATE' ? 'bg-[#17233B] text-[#F3F3EC]' : 'bg-[#17233B]/5 text-[#17233B]/70'
                }`}>
                  <UserCheck className="w-5 h-5 stroke-[1.8]" />
                </div>
                <div>
                  <h3 className="font-editorial text-2xl font-bold text-[#17233B] leading-snug">
                    Je cherche du travail
                  </h3>
                  <p className="font-operational text-xs text-[#17233B]/70 mt-1 leading-relaxed">
                    Voir les offres près de chez moi, postuler simplement et travailler avec un accord clair.
                  </p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center mt-1 shrink-0 ${
                selectedRole === 'CANDIDATE' ? 'border-[#17233B] bg-[#17233B] text-white' : 'border-[#17233B]/25'
              }`}>
                {selectedRole === 'CANDIDATE' && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
              </div>
            </div>
            {selectedRole === 'CANDIDATE' && (
              <div className="mt-3 pt-3 border-t border-[#17233B]/10 flex items-center gap-2 text-[11px] font-operational text-[#17233B]/80 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1BA64B] shrink-0" />
                <span>Le travailleur ne paie jamais LE LABEUR (0 FCFA de frais).</span>
              </div>
            )}
          </div>

          {/* Employer Option */}
          <div
            onClick={() => handleSelectRole('EMPLOYER')}
            onDoubleClick={() => handleDoubleClick('EMPLOYER')}
            className={`p-5 rounded-[4px] border transition-all cursor-pointer tap-feedback ${
              selectedRole === 'EMPLOYER'
                ? 'border-[#17233B] bg-[#FFFFFF] shadow-none ring-1 ring-[#17233B]'
                : 'border-[#17233B]/12 bg-[#FFFFFF]/70 hover:bg-[#FFFFFF]'
            }`}
            role="button"
            tabIndex={0}
            aria-pressed={selectedRole === 'EMPLOYER'}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3.5">
                <div className={`w-10 h-10 rounded-[4px] flex items-center justify-center shrink-0 ${
                  selectedRole === 'EMPLOYER' ? 'bg-[#17233B] text-[#F3F3EC]' : 'bg-[#17233B]/5 text-[#17233B]/70'
                }`}>
                  <Building2 className="w-5 h-5 stroke-[1.8]" />
                </div>
                <div>
                  <h3 className="font-editorial text-2xl font-bold text-[#17233B] leading-snug">
                    Je cherche quelqu un pour travailler
                  </h3>
                  <p className="font-operational text-xs text-[#17233B]/70 mt-1 leading-relaxed">
                    Publier des offres, trouver des personnes compétentes et formaliser notre accord.
                  </p>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center mt-1 shrink-0 ${
                selectedRole === 'EMPLOYER' ? 'border-[#17233B] bg-[#17233B] text-white' : 'border-[#17233B]/25'
              }`}>
                {selectedRole === 'EMPLOYER' && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
              </div>
            </div>
            {selectedRole === 'EMPLOYER' && (
              <div className="mt-3 pt-3 border-t border-[#17233B]/10 flex items-center gap-2 text-[11px] font-operational text-[#17233B]/80 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B5CEDB] shrink-0" />
                <span>Publication gratuite — Remplacement prioritaire si incident.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Footer - Always visible in viewport */}
      <div className="p-4 px-6 bg-[#F3F3EC] border-t border-[#17233B]/10 shrink-0 z-20 space-y-1.5">
        <EditorialButton
          variant="primary"
          fullWidth
          disabled={!selectedRole}
          onClick={() => handleContinue()}
          aria-label={
            !selectedRole
              ? 'Veuillez choisir un profil pour continuer'
              : selectedRole === 'CANDIDATE'
              ? 'Continuer vers l espace Candidat'
              : 'Continuer vers l espace Employeur'
          }
        >
          <span>
            {!selectedRole
              ? 'Continuer'
              : selectedRole === 'CANDIDATE'
              ? 'Continuer · Espace Candidat'
              : 'Continuer · Espace Employeur'}
          </span>
          <ArrowRight className="w-4 h-4 ml-2" />
        </EditorialButton>
        {!selectedRole && (
          <p className="text-[11px] font-operational text-center text-[#17233B]/55">
            Sélectionnez une option ci-dessus pour continuer.
          </p>
        )}
      </div>
    </div>
  );
};
