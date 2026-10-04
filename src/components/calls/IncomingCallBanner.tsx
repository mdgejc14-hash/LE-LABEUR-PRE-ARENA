import React from 'react';
import { Phone, PhoneOff, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const IncomingCallBanner: React.FC = () => {
  const { incomingCall, acceptIncomingCall, rejectIncomingCall } = useApp();

  if (!incomingCall) return null;

  return (
    <div className="fixed top-3 left-3 right-3 z-50 max-w-md mx-auto bg-[#17233B] text-[#F3F3EC] p-4 rounded-xl border border-white/20 shadow-2xl animate-in slide-in-from-top-6 duration-300">
      <div className="flex items-center justify-between gap-3">
        {/* Caller Avatar */}
        <div className="relative shrink-0">
          <div className="w-13 h-13 rounded-full overflow-hidden border-2 border-[#1BA64B] p-0.5 animate-pulse">
            <img
              src={incomingCall.callerAvatar}
              alt={incomingCall.callerName}
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Caller Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#B5CEDB] uppercase tracking-wider font-semibold">
            <Shield className="w-3 h-3 text-[#B5CEDB]" />
            <span>APPEL ENTRANT LE LABEUR</span>
          </div>
          <h3 className="font-editorial text-lg font-bold text-[#F3F3EC] truncate leading-tight mt-0.5">
            {incomingCall.callerName}
          </h3>
          <p className="text-[11px] text-[#F3F3EC]/70 truncate font-operational">
            {incomingCall.callerHeadline}
          </p>
        </div>

        {/* Accept / Reject Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={rejectIncomingCall}
            aria-label="Refuser l'appel"
            className="w-11 h-11 rounded-full bg-[#E23D3D] text-white flex items-center justify-center hover:bg-[#E23D3D]/90 tap-feedback active:scale-95 shadow-md cursor-pointer"
            title="Refuser"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
          <button
            onClick={acceptIncomingCall}
            aria-label="Accepter l'appel"
            className="w-11 h-11 rounded-full bg-[#1BA64B] text-white flex items-center justify-center hover:bg-[#1BA64B]/90 tap-feedback active:scale-95 shadow-md cursor-pointer"
            title="Accepter"
          >
            <Phone className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
