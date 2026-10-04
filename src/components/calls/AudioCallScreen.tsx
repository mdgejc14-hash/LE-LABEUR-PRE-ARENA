import React, { useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Radio, Shield, SignalHigh, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AudioCallScreen: React.FC = () => {
  const {
    activeCall,
    endActiveCall,
    toggleMuteCall,
    toggleSpeakerCall,
    callDurationSeconds,
  } = useApp();

  useEffect(() => {
    if (activeCall && (activeCall.status === 'FAILED' || activeCall.status === 'REJECTED' || activeCall.status === 'ENDED' || activeCall.status === 'MISSED')) {
      const timer = setTimeout(() => {
        endActiveCall();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [activeCall?.status, endActiveCall]);

  if (!activeCall) return null;

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (activeCall.status) {
      case 'CALLING':
        return 'Appel en cours...';
      case 'RINGING':
        return 'Sonnerie...';
      case 'ACCEPTING':
        return 'Acceptation en cours...';
      case 'CONNECTING':
        return 'Négociation WebRTC...';
      case 'CONNECTED':
        return formatSeconds(callDurationSeconds);
      case 'ENDED':
        return 'Appel terminé';
      case 'REJECTED':
        return 'Appel refusé';
      case 'MISSED':
        return 'Appel manqué';
      case 'FAILED':
        return 'Échec de connexion';
      default:
        return 'Connexion en cours...';
    }
  };

  const isConnected = activeCall.status === 'CONNECTED';
  const isFailed = activeCall.status === 'FAILED' || activeCall.status === 'REJECTED';

  return (
    <div className="fixed inset-0 z-50 bg-[#17233B] text-[#F3F3EC] flex flex-col justify-between p-6 select-none animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between pt-4">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-xs text-[10px] font-mono tracking-wider text-[#B5CEDB]">
          <Shield className="w-3.5 h-3.5 text-[#B5CEDB]" />
          <span>APPEL SÉCURISÉ LE LABEUR</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-[#F3F3EC]/70">
          <SignalHigh className={`w-3.5 h-3.5 ${isConnected ? 'text-[#1BA64B]' : 'text-[#B5CEDB]'}`} />
          <span>{isConnected ? 'WEBRTC ACTIF' : 'SIGNALING'}</span>
        </div>
      </div>

      {/* Center */}
      <div className="flex flex-col items-center text-center my-auto">
        <div className="relative mb-6">
          <div className={`w-32 h-32 rounded-full overflow-hidden border-2 p-1 transition-all ${
            isConnected
              ? 'border-[#1BA64B] shadow-[0_0_30px_rgba(27,166,75,0.25)]'
              : 'border-[#B5CEDB]/40 animate-pulse'
          }`}>
            <img
              src={activeCall.receiverAvatar || activeCall.callerAvatar}
              alt={activeCall.receiverName}
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          {isConnected && (
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#1BA64B] flex items-center justify-center border-2 border-[#17233B]">
              <Radio className="w-4 h-4 text-white animate-pulse" />
            </div>
          )}
        </div>

        <h2 className="font-editorial text-3xl font-bold text-[#F3F3EC] tracking-tight">
          {activeCall.receiverName || activeCall.callerName}
        </h2>
        <p className="text-xs font-operational text-[#B5CEDB] mt-1 max-w-xs font-medium">
          {activeCall.receiverHeadline || activeCall.callerHeadline}
        </p>

        {/* Live Call Status */}
        <div className="mt-5 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-xs">
          <span className={`text-sm font-mono tracking-widest uppercase font-bold ${
            isConnected ? 'text-[#1BA64B]' : isFailed ? 'text-[#E23D3D]' : 'text-[#F8BBCB]'
          }`}>
            {getStatusText()}
          </span>
        </div>

        {activeCall.status === 'RINGING' && (
          <p className="text-[11px] font-mono text-[#F3F3EC]/70 mt-4 max-w-xs">
            En attente de réponse du correspondant via le protocole WebRTC...
          </p>
        )}

        {activeCall.status === 'FAILED' && (
          <div className="mt-4 p-3 bg-[#E23D3D]/20 border border-[#E23D3D]/40 rounded-[4px] max-w-xs mx-auto flex items-center gap-2 text-xs text-[#F8BBCB]">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#E23D3D]" />
            <span>Impossible d'établir la connexion audio directe. Veuillez vérifier votre réseau.</span>
          </div>
        )}

        <p className="text-[10px] font-mono text-[#F3F3EC]/40 mt-6 max-w-xs text-center leading-relaxed">
          VoIP direct in-app LE LABEUR — Numéro de téléphone protégé
        </p>
      </div>

      {/* Bottom Action Controls */}
      <div className="pb-8">
        <div className="flex items-center justify-center gap-6 max-w-xs mx-auto">
          {/* Mute Button */}
          <button
            onClick={toggleMuteCall}
            aria-label={activeCall.isMuted ? 'Activer le micro' : 'Couper le micro'}
            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-transform active:scale-95 tap-feedback cursor-pointer ${
              activeCall.isMuted
                ? 'bg-[#E23D3D] text-white shadow-md'
                : 'bg-white/15 text-[#F3F3EC] hover:bg-white/25'
            }`}
          >
            {activeCall.isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* Hang Up Button */}
          <button
            onClick={() => endActiveCall()}
            aria-label="Terminer l'appel"
            className="w-18 h-18 rounded-full bg-[#E23D3D] text-white flex items-center justify-center shadow-lg hover:bg-[#E23D3D]/90 transition-transform active:scale-90 tap-feedback cursor-pointer"
          >
            <PhoneOff className="w-8 h-8" />
          </button>

          {/* Speaker Button */}
          <button
            onClick={toggleSpeakerCall}
            aria-label={activeCall.isSpeakerOn ? 'Désactiver le haut-parleur' : 'Activer le haut-parleur'}
            className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-transform active:scale-95 tap-feedback cursor-pointer ${
              activeCall.isSpeakerOn
                ? 'bg-[#B5CEDB] text-[#17233B] shadow-md'
                : 'bg-white/15 text-[#F3F3EC] hover:bg-white/25'
            }`}
          >
            {activeCall.isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
};
