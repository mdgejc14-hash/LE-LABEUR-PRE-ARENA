import React, { useState } from 'react';
import { Eye, EyeOff, AlertTriangle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';
import { EditorialButton } from '../components/common/EditorialButton';
import { useApp } from '../context/AppContext';
import { BrandLogo } from '../components/brand/BrandLogo';
import { triggerGoogleSignInPrompt } from '../services/auth/GoogleAuthService';

export const AuthScreen: React.FC = () => {
  const { login, register, loginWithGoogle, registerWithGoogle, currentRole, setScreen } = useApp();
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState(
    currentRole === 'ADMIN'
      ? 'admin.benin@lelabeur.bj'
      : currentRole === 'EMPLOYER'
        ? 'reine.houenou@bois-agencement.bj'
        : 'amina.dossou@lelabeur.bj'
  );
  const [fullName, setFullName] = useState(
    currentRole === 'ADMIN'
      ? 'Cellule Centrale LE LABEUR'
      : currentRole === 'EMPLOYER'
        ? 'Reine Houénou'
        : 'Amina Dossou'
  );
  const [password, setPassword] = useState('Secret2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !email.includes('@')) {
      setErrorMessage('Veuillez renseigner une adresse email valide.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'LOGIN') {
        await login(email, currentRole);
      } else {
        await register(email, fullName, currentRole);
      }
      setSuccessMessage('Connexion réussie.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Une erreur est survenue lors de l’authentification.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setGoogleLoading(true);

    try {
      const payload = await triggerGoogleSignInPrompt(currentRole);
      if (mode === 'LOGIN') {
        await loginWithGoogle(payload, currentRole);
        setSuccessMessage('Connexion Google réussie.');
      } else {
        await registerWithGoogle(payload, currentRole);
        setSuccessMessage('Compte créé et associé avec succès.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Échec de l’authentification Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const isAccountNotFoundWithGoogle = errorMessage.includes("Aucun compte LE LABEUR n'est associé");

  return (
    <div className="flex-1 min-h-0 flex flex-col select-none bg-[#F3F3EC] h-full overflow-hidden">
      {/* Top Bar with Back to Role & Logo (Before authentication only) */}
      <div className="flex items-center justify-between p-4 px-6 border-b border-[#17233B]/5 shrink-0 bg-[#F3F3EC] z-10">
        <button
          type="button"
          onClick={() => setScreen('ROLE_SELECTION')}
          className="flex items-center text-xs font-operational font-medium text-[#17233B]/60 hover:text-[#17233B] py-1.5 px-2 -ml-2 rounded tap-feedback cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          <span>Changer de profil</span>
        </button>
        <BrandLogo variant="default" className="h-6 max-w-[120px] w-auto" />
      </div>

      {/* Scrollable Main Content - Accessible on small screens and when virtual keyboard is open */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar p-6 space-y-5 pb-24">
        <div className="space-y-1.5">
          <span className="editorial-kicker">
            ESPACE PERSONNEL · {currentRole === 'ADMIN' ? 'ADMINISTRATION' : currentRole === 'EMPLOYER' ? 'EMPLOYEUR' : 'CANDIDAT'}
          </span>
          <h2 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight">
            {mode === 'LOGIN' ? 'Connexion' : 'Créer mon compte'}
          </h2>
          <p className="font-operational text-xs sm:text-sm text-[#17233B]/70 leading-relaxed pt-1">
            {mode === 'LOGIN'
              ? 'Accédez à vos offres, vos échanges et vos contrats au Bénin.'
              : 'Remplissez vos informations pour commencer vos collaborations.'}
          </p>
        </div>

        {/* Tab Toggle Login / Register */}
        <div className="flex items-center bg-[#FFFFFF] border border-[#17233B]/12 rounded-[4px] p-1">
          <button
            type="button"
            onClick={() => { setMode('LOGIN'); setErrorMessage(''); setSuccessMessage(''); }}
            className={`flex-1 py-2 text-xs font-operational font-medium rounded-[3px] transition-colors tap-feedback cursor-pointer ${
              mode === 'LOGIN' ? 'bg-[#17233B] text-[#F3F3EC]' : 'text-[#17233B]/60 hover:text-[#17233B]'
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => { setMode('REGISTER'); setErrorMessage(''); setSuccessMessage(''); }}
            className={`flex-1 py-2 text-xs font-operational font-medium rounded-[3px] transition-colors tap-feedback cursor-pointer ${
              mode === 'REGISTER' ? 'bg-[#17233B] text-[#F3F3EC]' : 'text-[#17233B]/60 hover:text-[#17233B]'
            }`}
          >
            Inscription
          </button>
        </div>

        {/* Google Authentication Button */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="w-full h-12 px-4 rounded-[4px] border border-[#17233B]/18 bg-[#FFFFFF] hover:bg-[#FFFFFF]/90 text-[#17233B] font-operational text-xs sm:text-sm font-medium flex items-center justify-center gap-3 transition-colors tap-feedback cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-none"
            aria-label={mode === 'LOGIN' ? 'Continuer avec Google pour se connecter' : 'Continuer avec Google pour créer mon compte'}
          >
            {googleLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#17233B]" />
                <span>Connexion Google en cours...</span>
              </>
            ) : (
              <>
                {/* Official Google Brand Icon */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.4 7.36 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.13z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.6 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
                </svg>
                <span>Continuer avec Google</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-1 h-[1px] bg-[#17233B]/10" />
            <span className="text-[10px] font-operational uppercase tracking-widest text-[#17233B]/45 font-semibold">
              ou avec email
            </span>
            <div className="flex-1 h-[1px] bg-[#17233B]/10" />
          </div>
        </div>

        {/* Error & Success Banners */}
        {errorMessage && (
          <div className="p-3.5 bg-[#E23D3D]/8 border border-[#E23D3D]/25 rounded-[4px] space-y-2 text-xs text-[#E23D3D] font-operational">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            {isAccountNotFoundWithGoogle && mode === 'LOGIN' && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => { setMode('REGISTER'); setErrorMessage(''); }}
                  className="px-3 py-1.5 bg-[#17233B] text-[#F3F3EC] rounded text-[11px] font-medium tap-feedback cursor-pointer"
                >
                  Créer un compte maintenant
                </button>
              </div>
            )}
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-[#1BA64B]/8 border border-[#1BA64B]/20 rounded-[4px] flex items-start gap-2.5 text-xs text-[#1BA64B] font-operational">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Classic Form */}
        <form onSubmit={handleSubmit} className="space-y-4 font-operational">
          {mode === 'REGISTER' && (
            <div>
              <label className="block text-xs font-medium text-[#17233B] mb-1.5">
                Nom et Prénoms
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ex. Amina Dossou"
                className="w-full h-12 px-3.5 bg-[#FFFFFF] border border-[#17233B]/15 rounded-[4px] text-xs sm:text-sm text-[#17233B] placeholder-[#17233B]/35 focus:outline-none focus:border-[#17233B] select-text"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[#17233B] mb-1.5">
              Adresse Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre.email@domaine.bj"
              className="w-full h-12 px-3.5 bg-[#FFFFFF] border border-[#17233B]/15 rounded-[4px] text-xs sm:text-sm text-[#17233B] placeholder-[#17233B]/35 focus:outline-none focus:border-[#17233B] select-text"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#17233B] mb-1.5">
              Mot de Passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full h-12 pl-3.5 pr-11 bg-[#FFFFFF] border border-[#17233B]/15 rounded-[4px] text-xs sm:text-sm text-[#17233B] placeholder-[#17233B]/35 focus:outline-none focus:border-[#17233B] select-text"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-[#17233B]/40 hover:text-[#17233B] cursor-pointer"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="pt-2">
            <EditorialButton
              variant="primary"
              fullWidth
              size="md"
              disabled={loading || googleLoading}
              type="submit"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <span>Validation...</span>
                </>
              ) : (
                <span>{mode === 'LOGIN' ? 'Se connecter' : 'Créer mon compte'}</span>
              )}
            </EditorialButton>
          </div>
        </form>

        {/* Footer Note */}
        <div className="pt-2 pb-4 text-center">
          <p className="text-[11px] font-operational text-[#17233B]/45">
            LE LABEUR applique des protocoles stricts de déontologie professionnelle en République du Bénin.
          </p>
        </div>
      </div>
    </div>
  );
};
