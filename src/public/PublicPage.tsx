import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { GlassSurface, NeoPressButton, SquircleCard, StatusSeal } from '../design-system/components';
import { transitionFor, usePrefersReducedMotion } from '../design-system/motion';
import { getBootstrapDecision } from '../bootstrap/appBootstrap';
import { HttpApiClient } from '../repositories/apiClient';
import { isGoogleAuthAvailable, triggerGoogleSignInPrompt } from '../services/auth/GoogleAuthService';
import { Link, navigate } from '../routing/navigation';
import { PUBLIC_SCREENS } from './catalog';
import { PublicAuth, publicError, type PublicRole } from './auth';
import { SystemFeedback } from './SystemFeedback';
import './public.css';

function configuredAuth() {
  const decision = getBootstrapDecision();
  return decision.mode === 'api' ? new PublicAuth(new HttpApiClient({ basePath: decision.basePath })) : null;
}
function storedRole(): PublicRole | null {
  try {
    const value = sessionStorage.getItem('lbm-public-role');
    return value === 'EMPLOYER' || value === 'CANDIDATE' ? value : null;
  } catch { return null; }
}
function rememberRole(role: PublicRole) {
  // Only a requested onboarding profile, never used as an authorization decision.
  try { sessionStorage.setItem('lbm-public-role', role); } catch { /* storage optional */ }
}
function ExitLinks() {
  return <nav className="lbm-public__links" aria-label="Navigation publique">
    <Link href="/accueil">Accueil</Link><Link href="/connexion">Se connecter</Link>
    <Link href="/legal">CGU / Confidentialité</Link><Link href="/">Parcours existant</Link>
  </nav>;
}
function Notice({ children }: { children: ReactNode }) {
  return <GlassSurface level={1} className="lbm-public__notice"><p>{children}</p></GlassSurface>;
}
function Title({ children }: { children: ReactNode }) { return <h1 className="lbm-title">{children}</h1>; }

function Splash() {
  const reduced = usePrefersReducedMotion();
  const [error, setError] = useState<ReturnType<typeof publicError> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let destination = '/accueil';
    let live = true;
    const api = configuredAuth();
    if (!navigator.onLine) { setError({ state: 'offline' }); return; }
    // Boot never waits longer than 1600 ms for a slow session endpoint.
    const timer = window.setTimeout(() => { if (live) navigate(destination, { replace: true }); }, reduced ? 120 : 1600);
    if (api) void api.session(controller.signal).then(() => { destination = '/'; }).catch((cause) => {
      if (!live || controller.signal.aborted) return;
      const failure = publicError(cause);
      if (failure.state !== '401') { clearTimeout(timer); setError(failure); }
    });
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [reduced]);
  if (error) return <SystemFeedback {...error} />;
  return <div className="lbm-public__splash" onClick={() => navigate('/accueil', { replace: true })}>
    <div role="progressbar" aria-label="Ouverture de LE LABEUR">
      <motion.div initial={{ opacity: 0, scale: reduced ? 1 : 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={transitionFor('heavy', reduced)}>
        <StatusSeal tone="gold" label="LE LABEUR" glyph="◈" />
      </motion.div>
    </div>
    <NeoPressButton className="lbm-public__skip" onClick={() => navigate('/accueil', { replace: true })}>Continuer</NeoPressButton>
  </div>;
}

function Home() {
  return <>
    <section data-zone="hero"><p className="lbm-kicker">LE LABEUR</p><Title>Le travail, cadré, prouvé, payé.</Title></section>
    <section data-zone="kpi" className="lbm-public__grid" aria-label="Trois preuves">
      {['Qualification juridique 100% humaine en revue', 'Prix prestataire affiché en clair', 'Salaire confirmé par OTP'].map((text) =>
        <GlassSurface key={text} level={2} className="lbm-panel"><p className="lbm-body">{text}</p></GlassSurface>)}
    </section>
    <section data-zone="list" aria-label="Déroulé en trois actes" className="lbm-public__grid">
      {['Je publie une mission cadrée', 'Je choisis un candidat', 'Le contrat, le salaire, la preuve'].map((text, index) =>
        <SquircleCard key={text} radius={28} elevation={1} className="lbm-panel"><p className="lbm-kicker">0{index + 1}</p><h2 className="lbm-public__subtitle">{text}</h2></SquircleCard>)}
    </section>
    <section data-zone="price" aria-label="Exemple de prix en lecture seule">
      <SquircleCard radius={22} className="lbm-panel"><h2 className="lbm-public__subtitle">Exemple</h2>
        <dl className="lbm-public__price">{[['Prix Prestataire', '250 000 F'], ['Frais SaaS', '25 000 F'], ['Total Client', '275 000 F']].map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </SquircleCard>
    </section>
    <div data-zone="cta" className="lbm-public__actions"><NeoPressButton variant="primary" onClick={() => navigate('/onboarding/profil')}>Créer mon compte</NeoPressButton><Link href="/connexion">J'ai déjà un compte</Link></div>
  </>;
}

function RoleChoice({ role, onChange }: { role: PublicRole | null; onChange: (role: PublicRole) => void }) {
  return <fieldset className="lbm-public__roles"><legend>Profil</legend>
    {(['EMPLOYER', 'CANDIDATE'] as const).map((value) => <label key={value} className="lbm-public__role">
      <input type="radio" name="profile" value={value} checked={role === value} onChange={() => onChange(value)} />
      <StatusSeal tone={value === 'EMPLOYER' ? 'gold' : 'emerald'} glyph={value === 'EMPLOYER' ? '◈' : '◉'} label={value === 'EMPLOYER' ? 'Client' : 'Prestataire'} />
      <span>{value === 'EMPLOYER' ? 'Publier, qualifier, choisir, payer.' : 'Candidater, s’engager, exécuter, prouver, encaisser.'}</span>
    </label>)}
  </fieldset>;
}
function Profile() {
  const [role, setRole] = useState<PublicRole | null>(null);
  const lockedUntil = useRef(0);
  function choose(value: PublicRole) {
    if (Date.now() < lockedUntil.current) return;
    lockedUntil.current = Date.now() + 400;
    setRole(value); rememberRole(value);
  }
  return <><Title>Comment allez-vous travailler sur LE LABEUR ?</Title><p className="lbm-lede">Le profil détermine vos écrans, vos droits et vos engagements.</p>
    <RoleChoice role={role} onChange={choose} />
    <Notice>Ce choix prépare l'inscription. Aucun rôle de compte existant n'est modifié ici.</Notice>
    <NeoPressButton variant="primary" disabled={!role} onClick={() => navigate('/inscription')}>{role ? `Continuer en tant que ${role === 'EMPLOYER' ? 'Client' : 'Prestataire'}` : 'Continuer'}</NeoPressButton>
  </>;
}

function Login() {
  const [role, setRole] = useState<PublicRole | null>(storedRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof publicError> | null>(null);
  const [auth] = useState(configuredAuth);
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  const attempt = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { live.current = false; controller.current?.abort(); }, []);
  const enabled = Boolean(auth && isGoogleAuthAvailable());
  async function login() {
    if (!role || !auth || pending.current) return;
    const currentAttempt = ++attempt.current;
    pending.current = true; setBusy(true); setError(null);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const timeout = window.setTimeout(() => {
      controller.current?.abort();
      if (live.current && attempt.current === currentAttempt) { pending.current = false; setBusy(false); setError({ state: '504' }); }
    }, 30000);
    try {
      const payload = await triggerGoogleSignInPrompt(role);
      if (!live.current || signal.aborted) return;
      if (!payload.credential) throw new Error('Credential absent');
      await auth.google(payload.credential, role, 'login', signal);
      if (live.current && !signal.aborted) navigate('/'); // legacy restores the server session and selects its role
    } catch (cause) {
      if (live.current && !signal.aborted) setError(publicError(cause));
    } finally {
      clearTimeout(timeout);
      if (attempt.current === currentAttempt) { pending.current = false; if (live.current) setBusy(false); }
    }
  }
  return <><Title>Bon retour.</Title>
    <GlassSurface level={2} className="lbm-panel lbm-public__stack">
      <RoleChoice role={role} onChange={(value) => { setRole(value); rememberRole(value); }} />
      <Notice>La connexion disponible utilise Google. Le mot de passe et le lien magique ne sont pas disponibles dans cette version.</Notice>
      {!enabled && <p role="status">Connexion Google non configurée dans cet environnement. Aucun compte de démonstration ne sera connecté ici.</p>}
      <NeoPressButton variant="primary" disabled={!enabled || !role || busy} onClick={login}>Continuer avec Google</NeoPressButton>
      <Link href="/recuperation">Mot de passe oublié</Link><Link href="/onboarding/profil">Créer mon compte</Link>
    </GlassSurface>
    {busy && <SystemFeedback state="loading" back={() => navigate('/accueil')} />}
    {error && <div role="alert"><SystemFeedback {...error} back={() => setError(null)} /></div>}
  </>;
}

/** Unsupported contracts are intentionally not emulated with fake forms or mock successes. */
function Registration() {
  const role = storedRole();
  return <><Title>Ouvrons votre espace de travail.</Title>
    {role && <StatusSeal tone={role === 'EMPLOYER' ? 'gold' : 'emerald'} label={role === 'EMPLOYER' ? 'Client' : 'Prestataire'} />}
    <Notice>L'inscription décrite ici nécessite la vérification du téléphone et l'enregistrement du consentement légal. Ces services ne sont pas disponibles dans cette version. Aucune donnée d'inscription n'est collectée.</Notice>
    <NeoPressButton variant="primary" disabled>Créer mon compte</NeoPressButton>
    <Link href="/onboarding/profil">Changer de profil</Link><Link href="/connexion">Déjà inscrit ? Se connecter</Link>
  </>;
}
function Otp() {
  return <><Title>Dernière étape.</Title>
    <Notice>Aucune vérification OTP d'authentification n'est disponible dans cette version. Aucun code n'a été envoyé.</Notice>
    <p className="lbm-body">LE LABEUR ne vous demandera jamais ce code par téléphone.</p>
    <NeoPressButton variant="primary" disabled>Vérifier</NeoPressButton><Link href="/inscription">Changer de numéro</Link>
  </>;
}
function Recovery() {
  return <><Title>Reprenons ensemble.</Title>
    <Notice>La récupération par e-mail ou SMS n'est pas disponible dans cette version. Aucun lien n'a été envoyé.</Notice>
    <NeoPressButton variant="primary" disabled>Envoyer le lien de récupération</NeoPressButton><Link href="/connexion">Retour connexion</Link>
  </>;
}
function Legal() {
  return <><Title>CGU / Confidentialité</Title>
    <Notice>Le document légal versionné n'est pas disponible dans cette version. Aucun texte, numéro de version ou consentement n'est simulé.</Notice>
    <NeoPressButton variant="primary" disabled>Télécharger le PDF</NeoPressButton>
  </>;
}
function Blocked() {
  const [error, setError] = useState<ReturnType<typeof publicError> | null>(null);
  const [busy, setBusy] = useState(false);
  const [auth] = useState(configuredAuth);
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; controller.current?.abort(); }, []);
  async function logout() {
    if (!auth || busy) return;
    setBusy(true); setError(null);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const timer = setTimeout(() => {
      controller.current?.abort();
      if (live.current) { setError({ state: '504' }); setBusy(false); }
    }, 10000);
    try { await auth.logout(signal); if (!signal.aborted) navigate('/accueil'); }
    catch (cause) { if (!signal.aborted) setError(publicError(cause)); }
    finally { clearTimeout(timer); if (live.current) setBusy(false); }
  }
  return <><SystemFeedback state="403" />
    <Notice>Le détail de la mesure et la voie de contestation ne sont pas disponibles ici. Aucun motif de suspension n'est déduit de cette URL.</Notice>
    <NeoPressButton disabled={!auth || busy} variant="ghost" onClick={logout}>Se déconnecter</NeoPressButton>
    {error && <div role="alert"><SystemFeedback {...error} /></div>}
  </>;
}
function Maintenance() {
  return <><SystemFeedback state="maintenance" />
    <Notice>La fenêtre de maintenance et l'état des services ne sont pas fournis. Aucune heure de reprise, progression ou garantie de sauvegarde n'est estimée.</Notice>
  </>;
}

export function PublicPage({ pathname }: { pathname: string }) {
  const screen = PUBLIC_SCREENS.find((item) => item.route === pathname)!;
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    document.title = `${screen.title} — LE LABEUR`;
    document.getElementById('lbm-main')?.focus();
    return () => { document.title = 'LE LABEUR'; };
  }, [screen.title]);
  const pages: Record<string, () => ReactNode> = {
    'PUB-01': Splash, 'PUB-02': Home, 'PUB-03': Profile, 'PUB-04': Login, 'PUB-05': Registration,
    'PUB-06': Otp, 'PUB-07': Recovery, 'PUB-08': Legal, 'PUB-09': Blocked, 'PUB-10': Maintenance,
  };
  const Page = pages[screen.code];
  return <motion.div className="lbm-page lbm-public" data-screen={screen.code}
    initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={transitionFor('soft', reduced)}>
    <Page />{screen.code !== 'PUB-01' && <ExitLinks />}
  </motion.div>;
}
