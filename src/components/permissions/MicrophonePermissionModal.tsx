import React from 'react';
import { Mic, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EditorialSheet } from '../common/EditorialSheet';
import { EditorialButton } from '../common/EditorialButton';

export const MicrophonePermissionModal: React.FC = () => {
  const { micPermissionModalOpen, setMicPermissionModalOpen, requestMicPermission } = useApp();

  const handleGrant = async () => {
    await requestMicPermission();
    setMicPermissionModalOpen(false);
  };

  return (
    <EditorialSheet
      isOpen={micPermissionModalOpen}
      onClose={() => setMicPermissionModalOpen(false)}
      title="Autorisation Microphone"
      subtitle="Communication audio sécurisée et confidentielle"
    >
      <div className="space-y-4 font-operational text-xs">
        <div className="flex items-center justify-center py-4">
          <div className="w-16 h-16 rounded-full bg-[#17233B]/5 border border-[#17233B]/15 flex items-center justify-center text-[#17233B]">
            <Mic className="w-8 h-8" />
          </div>
        </div>

        <div className="p-3 bg-[#17233B]/5 rounded border border-[#17233B]/10 space-y-2">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1BA64B] shrink-0 mt-0.5" />
            <p className="text-[#17233B] leading-relaxed">
              <strong>À quoi sert le micro ?</strong><br />
              Il vous permet d'enregistrer des messages vocaux (jusqu'à 60 secondes) et de passer des appels audio en direct avec votre interlocuteur.
            </p>
          </div>
          <div className="flex items-start gap-2 pt-1 border-t border-[#17233B]/10">
            <Lock className="w-4 h-4 text-[#340C24] shrink-0 mt-0.5" />
            <p className="text-[#17233B]/80 leading-relaxed text-[11px]">
              <strong>Numéro privé protégé :</strong> Les échanges se font directement dans l'application. Votre numéro de téléphone personnel n'est pas partagé.
            </p>
          </div>
        </div>

        <div className="pt-2 space-y-2">
          <EditorialButton
            variant="primary"
            fullWidth
            onClick={handleGrant}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            <span>Autoriser le Microphone</span>
          </EditorialButton>
          <EditorialButton
            variant="outline"
            fullWidth
            onClick={() => setMicPermissionModalOpen(false)}
          >
            <span>Plus tard</span>
          </EditorialButton>
        </div>
      </div>
    </EditorialSheet>
  );
};
