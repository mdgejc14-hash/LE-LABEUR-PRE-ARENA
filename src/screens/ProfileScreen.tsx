import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  User,
  MapPin,
  LogOut,
  ShieldCheck,
  Edit3,
  BookOpen,
  ArrowRight,
  FileText,
  DollarSign
} from 'lucide-react';
import { EditProfileModal } from '../components/profiles/EditProfileModal';
import { BrandLogo } from '../components/brand/BrandLogo';

export const ProfileScreen: React.FC = () => {
  const {
    currentUser,
    currentRole,
    setResourceCatalogOpen,
    setScreen,
    logout
  } = useApp();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // RÈGLE 1 & 2 : Vraie déconnexion supprimant la session et menant à ROLE_SELECTION
  // Aucun bouton "Retour à l'accueil", "Changer de rôle" ou "Revoir la présentation"
  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex-1 bg-[#F3F3EC] p-5 pb-24 font-operational text-[#17233B]">
      {/* Profil Header Card */}
      <div className="bg-white border border-[#17233B]/10 rounded-[4px] p-5 shadow-xs mb-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-[#17233B]/5 border border-[#17233B]/10 flex items-center justify-center overflow-hidden">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-7 h-7 text-[#17233B]/50" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-editorial text-xl font-bold text-[#17233B]">
                  {currentUser?.name || 'Utilisateur LE LABEUR'}
                </h2>
                {currentUser?.verified && (
                  <span title="Profil vérifié LE LABEUR">
                    <ShieldCheck className="w-4 h-4 text-[#340C24]" />
                  </span>
                )}
              </div>
              <p className="text-xs text-[#17233B]/60 mt-0.5">
                {currentRole === 'EMPLOYER' ? 'Employeur / Recruteur' : 'Artisan / Candidat qualifié'}
              </p>
              {currentUser?.location && (
                <div className="flex items-center gap-1 text-[11px] text-[#17233B]/50 mt-1">
                  <MapPin className="w-3 h-3" />
                  <span>{currentUser.location}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-[#17233B]/15 text-[#17233B] hover:bg-[#17233B]/5 tap-feedback cursor-pointer"
            aria-label="Modifier le profil"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>

        {/* RÈGLE 11 : Identifiant public unique affiché clairement */}
        <div className="p-3 bg-[#F3F3EC] rounded-[4px] border border-[#17233B]/8 flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wider block font-medium">
              Identifiant officiel LE LABEUR
            </span>
            <span className="font-mono font-bold text-sm text-[#17233B]">
              {currentUser?.publicId || 'Identifiant indisponible'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#1BA64B] bg-[#1BA64B]/10 px-2 py-0.5 rounded font-medium">
            Certifié
          </span>
        </div>

        {/* Détails complémentaires */}
        <div className="pt-2 border-t border-[#17233B]/8 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-[#17233B]/50 block uppercase tracking-wider">Téléphone</span>
            <span className="font-mono font-medium text-[#17233B]">{currentUser?.phone || '+229 97 00 00 00'}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#17233B]/50 block uppercase tracking-wider">Cadre contractuel</span>
            <span className="text-[#340C24] font-medium">Accord clair 25%/0%</span>
          </div>
        </div>
      </div>

      {/* Raccourci vers Mes Contrats */}
      <div className="space-y-3 mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#17233B]/60">
          Contrats & Missions
        </h3>
        <button
          onClick={() => setScreen('CONTRACTS')}
          className="w-full bg-white border border-[#17233B]/10 rounded-[4px] p-4 flex items-center justify-between text-left hover:border-[#17233B]/25 transition-colors tap-feedback cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[4px] bg-[#17233B]/5 border border-[#17233B]/10 flex items-center justify-center text-[#17233B]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#17233B]">
                Mes Contrats
              </h4>
              <p className="text-[11px] text-[#17233B]/60 mt-0.5">
                Consulter les contrats en signature, actifs, incidents et terminés
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#17233B]/40" />
        </button>

        {/* PHASE 4A : raccourci employeur vers les déclarations de paiement */}
        {currentRole === 'EMPLOYER' && (
          <button
            onClick={() => setScreen('PAYMENTS')}
            className="w-full bg-white border border-[#17233B]/10 rounded-[4px] p-4 flex items-center justify-between text-left hover:border-[#17233B]/25 transition-colors tap-feedback cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[4px] bg-[#17233B]/5 border border-[#17233B]/10 flex items-center justify-center text-[#17233B]">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-[#17233B]">
                  Mes Paiements
                </h4>
                <p className="text-[11px] text-[#17233B]/60 mt-0.5">
                  Déclarations de règlements effectués hors plateforme et justificatifs
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#17233B]/40" />
          </button>
        )}
      </div>

      {/* Documentation & Fiches pratiques */}
      <div className="space-y-3 mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#17233B]/60">
          Documentation & Fiches pratiques
        </h3>
        <button
          onClick={() => setResourceCatalogOpen(true)}
          className="w-full bg-white border border-[#17233B]/10 rounded-[4px] p-4 flex items-center justify-between text-left hover:border-[#17233B]/25 transition-colors tap-feedback cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[4px] bg-[#340C24]/5 border border-[#340C24]/15 flex items-center justify-center text-[#340C24]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#17233B]">
                Documents officiels & Fiches pratiques
              </h4>
              <p className="text-[11px] text-[#17233B]/60 mt-0.5">
                Consulter les guides pour artisans et employeurs
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[#17233B]/40" />
        </button>
      </div>

      {/* RÈGLE 2 : Compte & Déconnexion uniquement */}
      <div className="space-y-3 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#17233B]/60">
          Gestion du Compte
        </h3>
        <button
          onClick={handleLogout}
          className="w-full bg-white border border-[#17233B]/10 rounded-[4px] p-3.5 flex items-center justify-between text-left hover:border-[#17233B]/25 transition-colors tap-feedback cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-4 h-4 text-[#991B1B]" />
            <span className="text-xs font-medium text-[#991B1B]">
              Se déconnecter
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-[#17233B]/40" />
        </button>
      </div>

      {/* Pied de page officiel Bénin */}
      <div className="pt-6 border-t border-[#17233B]/10 text-center space-y-2">
        <BrandLogo variant="mark" className="w-8 h-8 mx-auto opacity-70" />
        <p className="text-[11px] font-editorial font-bold text-[#17233B]">
          LE LABEUR — République du Bénin
        </p>
        <p className="text-[10px] text-[#17233B]/50 max-w-xs mx-auto">
          Plateforme professionnelle d'intermédiation de travail qualifié sous règles déontologiques strictes.
        </p>
      </div>

      {/* Modal d'édition */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />
    </div>
  );
};
