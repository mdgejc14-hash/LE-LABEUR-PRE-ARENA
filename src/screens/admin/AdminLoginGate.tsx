import React, { useState } from 'react';
import { ShieldCheck, Lock, AlertTriangle, ArrowLeft, Loader2, KeyRound } from 'lucide-react';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { EditorialButton } from '../../components/common/EditorialButton';
import { useApp } from '../../context/AppContext';
import { appRepositories as repositories } from '../../repositories/provider';

export const AdminLoginGate: React.FC = () => {
  const { login, setScreen } = useApp();
  const [email, setEmail] = useState('admin.benin@lelabeur.bj');
  const [password, setPassword] = useState('AdminSecret2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      // Verification pre-check against existing users
      const users = await repositories.getAllUsers('user-admin-1').catch(() => []);
      const matched = users.find(u => u.email.toLowerCase() === normalizedEmail);
      if (matched && matched.role !== 'ADMIN') {
        throw new Error("Accès refusé : Ce compte est un profil public et ne dispose pas des privilèges d'administration.");
      }

      await login(normalizedEmail, 'ADMIN');
      // Navigation will automatically update to Admin Portal because currentUser.role === 'ADMIN'
    } catch (err: any) {
      setError(err.message || 'Authentification administrative échouée.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToPublic = () => {
    if (typeof window !== 'undefined') {
      if (window.location.hash) window.location.hash = '';
      if (window.location.pathname.startsWith('/admin')) {
        window.history.pushState(null, '', '/');
      }
    }
    setScreen('ROLE_SELECTION');
  };

  return (
    <div className="min-h-screen bg-[#F3F3EC] flex flex-col justify-between p-6 select-none font-operational text-[#17233B]">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-xl w-full mx-auto pt-4">
        <BrandLogo variant="default" className="h-7 max-w-[140px] w-auto" />
        <span className="text-[10px] uppercase tracking-widest text-[#17233B]/70 font-semibold px-2 py-0.5 border border-[#17233B]/15 bg-white rounded-[3px]">
          Guichet Interne
        </span>
      </div>

      {/* Main Content */}
      <div className="max-w-md w-full mx-auto my-auto py-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-[#17233B]/5 border border-[#17233B]/15 flex items-center justify-center mx-auto text-[#17233B] mb-3">
            <Lock className="w-6 h-6 stroke-[1.8]" />
          </div>
          <span className="editorial-kicker">
            CELLULE DE CONTRÔLE ET D'ARBITRAGE
          </span>
          <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight">
            Accès Administrateur
          </h1>
          <p className="text-xs text-[#17233B]/70 leading-relaxed max-w-sm mx-auto">
            Connexion réservée au personnel habilité pour la gestion opérationnelle et déontologique de LE LABEUR au Bénin.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-[#A33A2B]/10 border border-[#A33A2B]/20 rounded-[4px] flex items-start gap-2.5 text-xs text-[#A33A2B]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="bg-white border border-[#17233B]/10 rounded-[4px] p-6 space-y-4 shadow-xs">
          <div>
            <label className="block text-xs font-medium text-[#17233B] mb-1.5">
              Identifiant officiel (Email interne)
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              placeholder="admin.benin@lelabeur.bj"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#17233B] mb-1.5">
              Clé d'authentification
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              placeholder="••••••••••••"
            />
          </div>

          <div className="pt-2">
            <EditorialButton
              variant="primary"
              fullWidth
              size="md"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span>Vérification des accréditations...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 mr-2" />
                  <span>Entrer dans la tour de contrôle</span>
                </>
              )}
            </EditorialButton>
          </div>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={handleReturnToPublic}
            className="inline-flex items-center text-xs text-[#17233B]/60 hover:text-[#17233B] font-medium py-1.5 px-3 rounded cursor-pointer tap-feedback"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            <span>Retourner au parcours public</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center max-w-md mx-auto pb-4">
        <p className="text-[11px] text-[#17233B]/40">
          Système déontologique certifié LE LABEUR · République du Bénin.
        </p>
      </div>
    </div>
  );
};
