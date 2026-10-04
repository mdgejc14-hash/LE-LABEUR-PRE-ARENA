import React, { useEffect } from 'react';
import { BrandLogo } from '../components/brand/BrandLogo';
import { useApp } from '../context/AppContext';

export const SplashScreen: React.FC = () => {
  const { setScreen } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      setScreen('ONBOARDING');
    }, 2000);
    return () => clearTimeout(timer);
  }, [setScreen]);

  return (
    <div
      onClick={() => setScreen('ONBOARDING')}
      className="flex-1 w-full bg-[#F3F3EC] flex flex-col items-center justify-center p-8 select-none cursor-pointer"
      title="Appuyez pour continuer"
    >
      <div className="text-center space-y-4 animate-in fade-in zoom-in-95 duration-420">
        <span className="text-[10px] font-mono tracking-widest text-[#17233B]/60 uppercase font-semibold block">
          RÉPUBLIQUE DU BÉNIN
        </span>
        
        {/* Logo Officiel */}
        <div className="flex items-center justify-center py-2">
          <BrandLogo variant="default" className="h-16 sm:h-20 max-w-[280px] w-auto drop-shadow-xs" />
        </div>
        <div className="w-12 h-[1.5px] bg-[#C5A059] mx-auto my-1" />
        
        <p className="font-operational text-xs tracking-wider text-[#17233B]/70 font-medium">
          L'Accord Clair entre Travailleur et Employeur
        </p>
        <span className="text-[10px] text-[#17233B]/40 pt-4 block font-mono">
          Démarrage en cours...
        </span>
      </div>
    </div>
  );
};
