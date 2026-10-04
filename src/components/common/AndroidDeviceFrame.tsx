import React, { useState, useEffect } from 'react';
import { Wifi, BatteryMedium, Signal } from 'lucide-react';

interface AndroidDeviceFrameProps {
  children: React.ReactNode;
}

export const AndroidDeviceFrame: React.FC<AndroidDeviceFrameProps> = ({ children }) => {
  const [time, setTime] = useState('09:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-screen max-h-screen bg-[#F3F3EC] flex flex-col justify-start items-center overflow-hidden">
      {/* Native Android Mobile Canvas Container */}
      <div className="w-full max-w-md h-full max-h-screen bg-[#F3F3EC] text-[#17233B] flex flex-col relative shadow-sm border-x border-[#17233B]/5 font-operational select-none overflow-hidden">
        
        {/* Android Native Status Bar */}
        <header 
          className="h-8 bg-[#F3F3EC] px-4 flex items-center justify-between text-xs text-[#17233B]/80 font-medium shrink-0 border-b border-[#17233B]/5 z-30"
          aria-label="Barre d état système Android"
        >
          <span className="font-semibold text-[13px] tracking-tight text-[#17233B] font-mono">
            {time}
          </span>
          {/* Center Punch-hole Camera */}
          <div className="w-3.5 h-3.5 rounded-full bg-[#17233B]/20 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[#17233B]/70" />
          </div>
          <div className="flex items-center gap-2 text-[#17233B]">
            <Signal className="w-3.5 h-3.5 stroke-[2]" />
            <Wifi className="w-3.5 h-3.5 stroke-[2]" />
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] font-mono">100%</span>
              <BatteryMedium className="w-4 h-4 fill-current stroke-[1.5]" />
            </div>
          </div>
        </header>

        {/* Viewport Content Area - single scroll root managed by active screen */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative bg-[#F3F3EC]">
          {children}
        </div>

        {/* Android Gesture Navigation Bar Pill */}
        <footer 
          className="h-5 bg-[#FFFFFF] flex items-center justify-center shrink-0 border-t border-[#17233B]/10 z-30"
          aria-label="Barre de navigation par gestes Android"
        >
          <div className="w-28 h-1 bg-[#17233B]/30 rounded-full" />
        </footer>
      </div>
    </div>
  );
};
