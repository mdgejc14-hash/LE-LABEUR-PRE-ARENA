import React, { useRef } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { EditorialButton } from '../components/common/EditorialButton';
import { useApp } from '../context/AppContext';
import { BrandLogo } from '../components/brand/BrandLogo';

interface Slide {
  repere: string;
  title: string;
  subtitle: string;
  caption: string;
  svgGraphic: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    repere: '01 · TROUVER UN TRAVAIL',
    title: 'Trouvez des offres près de chez vous',
    subtitle: 'Choisissez votre métier, votre zone et regardez les offres qui vous intéressent au Bénin.',
    caption: 'Des offres selon votre métier et votre zone.',
    svgGraphic: (
      <svg className="w-full h-full" viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="360" height="220" fill="#17233B"/>
        <circle cx="180" cy="100" r="45" stroke="#C5A059" strokeWidth="2" strokeDasharray="4 4"/>
        <circle cx="180" cy="100" r="12" fill="#C5A059"/>
        <path d="M180 30 V70" stroke="#B5CEDB" strokeWidth="1.5"/>
        <path d="M180 130 V170" stroke="#B5CEDB" strokeWidth="1.5"/>
        <path d="M110 100 H150" stroke="#B5CEDB" strokeWidth="1.5"/>
        <path d="M210 100 H250" stroke="#B5CEDB" strokeWidth="1.5"/>
        <text x="180" y="195" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fill="#F3F3EC" opacity="0.9">VIVIER NATIONAL D'ARTISANS</text>
      </svg>
    )
  },
  {
    repere: '02 · CHOISIR LA BONNE OFFRE',
    title: 'Regardez les informations avant de postuler',
    subtitle: 'Métier, salaire, lieu et conditions : vous voyez l essentiel avant de vous décider.',
    caption: 'Les informations importantes sont claires.',
    svgGraphic: (
      <svg className="w-full h-full" viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="360" height="220" fill="#1E2C48"/>
        <rect x="50" y="40" width="260" height="130" rx="6" fill="#17233B" stroke="#C5A059" strokeWidth="1.5"/>
        <line x1="75" y1="75" x2="210" y2="75" stroke="#F3F3EC" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="75" y1="95" x2="160" y2="95" stroke="#B5CEDB" strokeWidth="1.5" strokeLinecap="round"/>
        <rect x="75" y="120" width="100" height="24" rx="3" fill="#C5A059" fillOpacity="0.2" stroke="#C5A059"/>
        <text x="125" y="136" textAnchor="middle" fontFamily="monospace" fontSize="10" fill="#C5A059" fontWeight="bold">180 000 FCFA</text>
        <circle cx="270" cy="105" r="22" stroke="#F8BBCB" strokeWidth="1.5"/>
        <path d="M262 105 L268 111 L278 99" stroke="#1BA64B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  },
  {
    repere: '03 · COMMENCER EN TOUTE CLARTÉ',
    title: 'Un accord clair avant de commencer',
    subtitle: 'Vous échangez, vous êtes d accord, le contrat est préparé et la mission est suivie.',
    caption: 'Un contrat clair et validé avant de commencer.',
    svgGraphic: (
      <svg className="w-full h-full" viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="360" height="220" fill="#17233B"/>
        <rect x="70" y="30" width="220" height="150" rx="4" fill="#F3F3EC"/>
        <line x1="95" y1="60" x2="220" y2="60" stroke="#17233B" strokeWidth="3" strokeLinecap="round"/>
        <line x1="95" y1="80" x2="265" y2="80" stroke="#17233B" strokeOpacity="0.3" strokeWidth="1.5"/>
        <line x1="95" y1="100" x2="265" y2="100" stroke="#17233B" strokeOpacity="0.3" strokeWidth="1.5"/>
        <line x1="95" y1="120" x2="210" y2="120" stroke="#17233B" strokeOpacity="0.3" strokeWidth="1.5"/>
        <circle cx="120" cy="150" r="14" fill="#340C24"/>
        <path d="M116 150 L119 153 L125 146" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="240" cy="150" r="14" fill="#17233B"/>
        <path d="M236 150 L239 153 L245 146" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
];

export const OnboardingScreen: React.FC = () => {
  const { setScreen, onboardingStep, setOnboardingStep } = useApp();
  const touchStartX = useRef<number | null>(null);
  const currentSlide = SLIDES[onboardingStep] || SLIDES[0];

  const handleNext = () => {
    if (onboardingStep < SLIDES.length - 1) {
      setOnboardingStep(onboardingStep + 1);
    } else {
      setScreen('ROLE_SELECTION');
    }
  };

  const handlePrev = () => {
    if (onboardingStep > 0) {
      setOnboardingStep(onboardingStep - 1);
    }
  };

  const handleSkip = () => {
    setScreen('ROLE_SELECTION');
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const distance = touchStartX.current - e.changedTouches[0].clientX;
    if (distance > 40 && onboardingStep < SLIDES.length - 1) {
      setOnboardingStep(onboardingStep + 1);
    } else if (distance < -40 && onboardingStep > 0) {
      setOnboardingStep(onboardingStep - 1);
    }
    touchStartX.current = null;
  };

  return (
    <div 
      className="flex-1 flex flex-col justify-between p-6 select-none bg-[#F3F3EC] h-full"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between shrink-0 pt-1">
        <BrandLogo variant="default" className="h-7 max-w-[140px] w-auto" />
        {onboardingStep < SLIDES.length - 1 ? (
          <button
            onClick={handleSkip}
            className="text-xs font-operational font-medium text-[#17233B]/60 hover:text-[#17233B] py-1.5 px-3 rounded-full hover:bg-[#17233B]/5 tap-feedback cursor-pointer"
          >
            Passer
          </button>
        ) : (
          <span className="editorial-kicker text-[#17233B]/40">
            03 / 03
          </span>
        )}
      </div>

      {/* Main Slide Content */}
      <div className="flex-1 flex flex-col justify-center my-auto py-3">
        <div className="relative w-full h-56 sm:h-64 rounded-[6px] overflow-hidden border border-[#17233B]/10 bg-[#17233B] mb-6 shrink-0 shadow-xs flex items-center justify-center">
          {currentSlide.svgGraphic}
          <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-[#17233B]/90 backdrop-blur-xs text-[#F3F3EC] text-[10px] font-operational font-medium rounded-[3px] tracking-wide border border-white/10">
            {currentSlide.caption}
          </div>
        </div>

        <div className="space-y-2">
          <p className="editorial-kicker">
            {currentSlide.repere}
          </p>
          <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight leading-tight">
            {currentSlide.title}
          </h2>
          <p className="font-operational text-xs sm:text-sm text-[#17233B]/75 leading-relaxed max-w-sm pt-1">
            {currentSlide.subtitle}
          </p>
        </div>
      </div>

      {/* Footer: Pagination & Actions */}
      <div className="shrink-0 pt-2 pb-1">
        <div className="flex items-center justify-center gap-1.5 mb-5" aria-label="Progression">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setOnboardingStep(idx)}
              aria-label={`Aller au slide ${idx + 1}`}
              className={`h-1.5 transition-all rounded-full cursor-pointer ${
                idx === onboardingStep 
                  ? 'w-7 bg-[#17233B]' 
                  : 'w-2 bg-[#17233B]/20 hover:bg-[#17233B]/40'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          {onboardingStep > 0 && (
            <EditorialButton
              variant="outline"
              onClick={handlePrev}
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              <span>Précédent</span>
            </EditorialButton>
          )}
          <EditorialButton
            variant="primary"
            onClick={handleNext}
            className="flex-1"
          >
            <span>{onboardingStep === SLIDES.length - 1 ? 'Commencer' : 'Continuer'}</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </EditorialButton>
        </div>
      </div>
    </div>
  );
};
