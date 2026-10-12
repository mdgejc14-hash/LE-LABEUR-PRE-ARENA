import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { GlassSurface, KineticText, NeoPressButton, ParticleCanvas, SquircleCard, StatusSeal } from '../design-system/components';
import { transitionFor, usePrefersReducedMotion } from '../design-system/motion';
import { getBootstrapDecision } from '../bootstrap/appBootstrap';
import { HttpApiClient } from '../repositories/apiClient';
import { isGoogleAuthAvailable, triggerGoogleSignInPrompt } from '../services/auth/GoogleAuthService';
import { Link, navigate } from '../routing/navigation';
import { PUBLIC_SCREENS } from './catalog';
import {
  PublicAuth, LOGIN_TIMEOUT_FAILURE, describeLoginFailure, probeSession, publicError,
  type LoginFailure, type PublicRole, type SessionProbe,
} from './auth';
import { PUBLIC_GAPS, type PublicGapCode } from './gaps';
import { SystemFeedback } from './SystemFeedback';
import './public.css';

/**
 * P1-DESIGN-PUBLIC-AUTH + PUB-AUTH-2 — les dix écrans publics.
 *
 * Règles conservées : seuls les contrats serveur RÉELS sont appelés
 * (`/auth/session`, `/auth/google/credential`, `/auth/logout`), une préférence
 * de profil vit en sessionStorage et n'est jamais une autorisation, et toute
 * capacité absente est déclarée BACKEND_GAP avec ses contrôles désactivés.
 */

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

const ROLE_LABEL: Record<PublicRole, string> = { EMPLOYER: 'Client', CANDIDATE: 'Prestataire' };
function roleTone(role: PublicRole): 'gold' | 'emerald' { return role === 'EMPLOYER' ? 'gold' : 'emerald'; }
function roleWording(role: string): string {
  if (role === 'EMPLOYER') return 'Client';
  if (role === 'CANDIDATE') return 'Prestataire';
  return role;
}
function accountLabel(role: string): string {
  return role === 'ADMIN' ? 'Supervision (ADMIN)' : roleWording(role);
}

const EXIT_LINKS = [
  { href: '/accueil', label: 'Accueil' },
  { href: '/connexion', label: 'Se connecter' },
  { href: '/legal', label: 'CGU / Confidentialité' },
  { href: '/', label: 'Parcours existant' },
] as const;

/** Navigation publique : aucun lien vers la page courante (elle resterait un cul-de-sac). */
function ExitLinks({ pathname }: { pathname: string }) {
  const links = EXIT_LINKS.filter((item) => item.href !== pathname);
  return <nav className="lbm-public__links" aria-label="Navigation publique">
    {links.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
    {links.length !== EXIT_LINKS.length && <span className="lbm-caption lbm-muted">Vous êtes sur cette page.</span>}
  </nav>;
}
function Notice({ children, title }: { children: ReactNode; title?: string }) {
  return <GlassSurface level={1} className="lbm-public__notice">
    {title && <p className="lbm-kicker">{title}</p>}
    <p className="lbm-body">{children}</p>
  </GlassSurface>;
}
function BackendGap({ code }: { code: PublicGapCode }) {
  const gap = PUBLIC_GAPS[code];
  const id = `public-${code.toLowerCase()}-backend-gap`;
  return <GlassSurface level={1} id={id} role="note" className="lbm-public__gap" data-backend-gap="true">
    <p className="lbm-kicker">BACKEND_GAP · {code}</p>
    <p className="lbm-body">{gap.explanation}</p>
  </GlassSurface>;
}
function gapDescription(code: PublicGapCode) { return `public-${code.toLowerCase()}-backend-gap`; }
function Title({ children }: { children: ReactNode }) { return <h1 className="lbm-title">{children}</h1>; }

/** Sonde de session réelle (GET /api/v1/auth/session) : aucune conclusion sans réponse serveur. */
function useSessionProbe(): SessionProbe | null {
  const [probe, setProbe] = useState<SessionProbe | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    void probeSession(configuredAuth(), controller.signal).then((result) => { if (live) setProbe(result); });
    return () => { live = false; controller.abort(); };
  }, []);
  return probe;
}

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
  return <div className="lbm-public__stage lbm-public__splash" data-zone="canvas" onClick={() => navigate('/accueil', { replace: true })}>
    <ParticleCanvas density={120} alpha={0.1} direction="drift" />
    <div className="lbm-public__forge" aria-hidden="true" />
    <div data-zone="hero" className="lbm-public__emblem">
      <div role="progressbar" aria-label="Ouverture de LE LABEUR">
        <motion.div initial={{ opacity: 0, scale: reduced ? 1 : 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={transitionFor('heavy', reduced)}>
          <div className="lbm-public__emblem-seal" aria-hidden="true">
            <StatusSeal tone="gold" label="Sceau LE LABEUR" glyph="◈" />
          </div>
        </motion.div>
      </div>
      <KineticText as="h1" className="lbm-display-1 lbm-public__wordmark" text="LE LABEUR" staggerMs={40} delayMs={reduced ? 0 : 360} />
    </div>
    <div data-zone="cta" className="lbm-public__splash-action">
      <NeoPressButton className="lbm-public__skip" onClick={() => navigate('/accueil', { replace: true })}>Continuer</NeoPressButton>
    </div>
  </div>;
}

function Home() {
  return <>
    <div className="lbm-public__stage lbm-public__hero" data-zone="hero">
      <ParticleCanvas density={90} alpha={0.1} direction="rise" />
      <p className="lbm-kicker">LE LABEUR</p>
      <KineticText as="h1" className="lbm-display-2 lbm-public__promise" text="Le travail, cadré, prouvé, payé." staggerMs={24} />
    </div>
    <section data-zone="kpi" className="lbm-public__grid" aria-label="Trois preuves">
      {['Qualification juridique 100% humaine en revue', 'Prix prestataire affiché en clair', 'Salaire confirmé par OTP'].map((text) =>
        <GlassSurface key={text} level={2} className="lbm-panel"><p className="lbm-caption lbm-muted">Preuve</p><p className="lbm-body">{text}</p></GlassSurface>)}
    </section>
    <section data-zone="list" aria-label="Déroulé en trois actes" className="lbm-public__grid">
      {['Je publie une mission cadrée', 'Je choisis un candidat', 'Le contrat, le salaire, la preuve'].map((text, index) =>
        <SquircleCard key={text} radius={28} elevation={1} className="lbm-panel"><p className="lbm-kicker">0{index + 1}</p><h2 className="lbm-title-2">{text}</h2></SquircleCard>)}
    </section>
    <section data-zone="price" aria-label="Exemple de prix en lecture seule">
      <SquircleCard radius={22} className="lbm-panel"><h2 className="lbm-title-2">Exemple</h2>
        <dl className="lbm-public__price">{[['Prix Prestataire', '250 000 F'], ['Frais SaaS', '25 000 F'], ['Total Client', '275 000 F']].map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </SquircleCard>
    </section>
    <div data-zone="cta" className="lbm-public__actions">
      <NeoPressButton variant="primary" onClick={() => navigate('/onboarding/profil')}>Créer mon compte</NeoPressButton>
      <NeoPressButton variant="ghost" onClick={() => navigate('/connexion')}>J'ai déjà un compte</NeoPressButton>
    </div>
    <p className="lbm-caption lbm-muted">
      <Link href="/legal">CGU / Confidentialité</Link> · <Link href="/connexion">Se connecter</Link>
    </p>
  </>;
}

function RoleChoice({ role, onChange, describe }: { role: PublicRole | null; onChange: (role: PublicRole) => void; describe?: string }) {
  return <fieldset className="lbm-public__roles" aria-describedby={describe}><legend>Profil</legend>
    {(['EMPLOYER', 'CANDIDATE'] as const).map((value) => <label key={value} className="lbm-public__role" data-role={value}>
      <input type="radio" name="profile" value={value} checked={role === value} onChange={() => onChange(value)} />
      <StatusSeal tone={roleTone(value)} glyph={value === 'EMPLOYER' ? '◈' : '◉'} label={ROLE_LABEL[value]} />
      <span>{value === 'EMPLOYER' ? 'Publier, qualifier, choisir, payer.' : 'Candidater, s’engager, exécuter, prouver, encaisser.'}</span>
    </label>)}
  </fieldset>;
}

function Profile() {
  const [role, setRole] = useState<PublicRole | null>(null);
  const probe = useSessionProbe();
  const lockedUntil = useRef(0);
  function choose(value: PublicRole) {
    if (Date.now() < lockedUntil.current) return;
    lockedUntil.current = Date.now() + 400;
    setRole(value); rememberRole(value);
  }
  return <><Title>Comment allez-vous travailler sur LE LABEUR ?</Title>
    <p className="lbm-lede">Le profil détermine vos écrans, vos droits et vos engagements.</p>
    <RoleChoice role={role} onChange={choose} describe={gapDescription('PUB-03')} />
    <Notice title="Aucune autorisation ici">Ce choix prépare l'inscription et n'est jamais une autorisation : c'est le serveur qui calcule vos droits à chaque requête. Aucun rôle de compte existant n'est modifié par cet écran.</Notice>
    {probe?.state === 'active' && <GlassSurface level={1} className="lbm-public__notice" role="note" data-session-role={probe.role}>
      <p className="lbm-kicker">Session serveur</p>
      <p className="lbm-body">Rôle effectif du compte connecté : <strong>{accountLabel(probe.role)}</strong>, lu par GET /api/v1/auth/session. Cette lecture fait foi ; la préférence ci-dessus ne la change pas.</p>
    </GlassSurface>}
    <BackendGap code="PUB-03" />
    <NeoPressButton variant="primary" className={role ? `lbm-public__cta lbm-public__cta--${roleTone(role)}` : 'lbm-public__cta'}
      disabled={!role} aria-describedby={gapDescription('PUB-03')} onClick={() => navigate('/inscription')}>
      {role ? `Continuer en tant que ${ROLE_LABEL[role]}` : 'Continuer'}
    </NeoPressButton>
  </>;
}

function Login() {
  const [role, setRole] = useState<PublicRole | null>(storedRole);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
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
    pending.current = true; setBusy(true); setFailure(null);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const timeout = window.setTimeout(() => {
      controller.current?.abort();
      if (live.current && attempt.current === currentAttempt) { pending.current = false; setBusy(false); setFailure(LOGIN_TIMEOUT_FAILURE); }
    }, 30000);
    try {
      const payload = await triggerGoogleSignInPrompt(role);
      if (!live.current || signal.aborted) return;
      if (!payload.credential) throw new Error('Credential absent');
      await auth.google(payload.credential, role, 'login', signal);
      if (live.current && !signal.aborted) navigate('/'); // legacy restores the server session and selects its role
    } catch (cause) {
      if (live.current && !signal.aborted) setFailure(describeLoginFailure(cause));
    } finally {
      clearTimeout(timeout);
      if (attempt.current === currentAttempt) { pending.current = false; if (live.current) setBusy(false); }
    }
  }
  return <><Title>Bon retour.</Title>
    <GlassSurface level={2} className="lbm-panel lbm-public__stack" >
      <div data-zone="form" className="lbm-public__stack">
        <RoleChoice role={role} onChange={(value) => { setRole(value); rememberRole(value); }} describe={gapDescription('PUB-04')} />
        <p className="lbm-caption lbm-muted">La connexion disponible utilise Google. La préférence de profil ci-dessus est transmise à la création d'un compte ; elle ne modifie jamais un compte existant.</p>
      </div>
      <div data-zone="cta" className="lbm-public__stack">
        {!enabled && <p role="status">Connexion Google non configurée dans cet environnement. Aucun compte de démonstration ne sera connecté ici.</p>}
        <NeoPressButton variant="primary" disabled={!enabled || !role || busy} onClick={login} aria-describedby={gapDescription('PUB-04')}>Continuer avec Google</NeoPressButton>
        <Link href="/recuperation">Mot de passe oublié</Link><Link href="/onboarding/profil">Créer mon compte</Link>
      </div>
    </GlassSurface>
    <div data-zone="list" className="lbm-public__facts">
      <p className="lbm-caption lbm-muted">Ce que cette version fait réellement : session HttpOnly gérée par le serveur, révocable par « Se déconnecter » (POST /api/v1/auth/logout).</p>
      <p className="lbm-caption lbm-muted">Aucun mot de passe n'est collecté ni stocké : cet écran n'envoie que le jeton Google vérifié par l'API.</p>
      <p className="lbm-caption lbm-muted">Aucun jeton n'est conservé dans le navigateur ; seul le profil souhaité l'est, pour préparer l'inscription.</p>
    </div>
    <BackendGap code="PUB-04" />
    {busy && <SystemFeedback state="loading" back={() => navigate('/accueil')} />}
    {failure && <div role="alert" className="lbm-public__stack">
      <SystemFeedback {...failure.failure} back={() => setFailure(null)} />
      {failure.throttled && <Notice title="Limitation de débit serveur">
        {failure.retryAfterSeconds
          ? `L'API a répondu 429 et transmet une temporisation de ${failure.retryAfterSeconds} s (details.retryAfterSeconds). Aucun décompte local n'est calculé : cette valeur vient du serveur.`
          : "L'API a répondu 429 sans transmettre de durée de report : aucune valeur n'est affichée pour ne pas estimer à la place du serveur."}
      </Notice>}
      {failure.inactiveAccount && <Notice title="Connexion refusée (403)">
        L'API a refusé cette connexion avec un 403 : le compte associé n'est pas actif côté serveur. Le motif n'est transmis par aucun contrat — <Link href="/compte-bloque">voir l'écran de compte bloqué</Link>.
      </Notice>}
    </div>}
  </>;
}

/** Unsupported contracts are intentionally not emulated with fake forms or mock successes. */
function Registration() {
  const role = storedRole();
  return <><Title>Ouvrons votre espace de travail.</Title>
    {role && <StatusSeal tone={roleTone(role)} label={ROLE_LABEL[role]} />}
    <BackendGap code="PUB-05" />
    <NeoPressButton variant="primary" disabled aria-describedby={gapDescription('PUB-05')}>Créer mon compte</NeoPressButton>
    <Link href="/onboarding/profil">Changer de profil</Link><Link href="/connexion">Déjà inscrit ? Se connecter</Link>
  </>;
}
function Otp() {
  return <><Title>Dernière étape.</Title>
    <BackendGap code="PUB-06" />
    <p className="lbm-body">LE LABEUR ne vous demandera jamais un code de confirmation par téléphone.</p>
    <NeoPressButton variant="primary" disabled aria-describedby={gapDescription('PUB-06')}>Vérifier</NeoPressButton><Link href="/inscription">Changer de numéro</Link>
  </>;
}
function Recovery() {
  return <><Title>Reprenons ensemble.</Title>
    <BackendGap code="PUB-07" />
    <NeoPressButton variant="primary" disabled aria-describedby={gapDescription('PUB-07')}>Envoyer le lien de récupération</NeoPressButton><Link href="/connexion">Retour connexion</Link>
  </>;
}
function Legal() {
  return <><Title>CGU / Confidentialité</Title>
    <BackendGap code="PUB-08" />
    <div className="lbm-public__actions">
      <NeoPressButton variant="primary" disabled aria-describedby={gapDescription('PUB-08')}>Accepter la version en vigueur</NeoPressButton>
      <NeoPressButton variant="ghost" disabled aria-describedby={gapDescription('PUB-08')}>Télécharger le document</NeoPressButton>
    </div>
  </>;
}

/** Verdict du blocage : uniquement ce que le serveur a réellement répondu. */
function sessionVerdict(probe: SessionProbe | null, error: ReturnType<typeof publicError> | null): string {
  if (error) return "L'API n'a pas répondu : aucune conclusion n'est tirée sur l'état du compte.";
  if (!probe) return 'Vérification de la session auprès de GET /api/v1/auth/session…';
  if (probe.state === 'active') return `Le serveur confirme un compte actif (rôle ${accountLabel(probe.role)}) : aucune suspension n'est enregistrée sur cette session.`;
  if (probe.state === 'none') return "Aucune session active n'est confirmée par le serveur (401/403). Cela peut être une fin de session, une révocation ou un compte non actif : le motif d'un éventuel blocage n'est exposé par aucun contrat.";
  return "L'état de la session n'a pas pu être vérifié : aucune conclusion n'est tirée sur l'état du compte.";
}

function Blocked() {
  const [error, setError] = useState<ReturnType<typeof publicError> | null>(null);
  const [busy, setBusy] = useState(false);
  const [auth] = useState(configuredAuth);
  const probe = useSessionProbe();
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
  return <><SystemFeedback state="403" back={() => navigate('/accueil')} />
    <GlassSurface level={1} className="lbm-public__notice" role="note" data-session-probe={probe?.state ?? 'pending'}>
      <p className="lbm-kicker">État vérifié côté serveur</p>
      <p className="lbm-body">{sessionVerdict(probe, error)}</p>
    </GlassSurface>
    <BackendGap code="PUB-09" />
    <div className="lbm-public__actions">
      <NeoPressButton variant="primary" disabled aria-describedby={gapDescription('PUB-09')}>Déposer une contestation</NeoPressButton>
      <NeoPressButton variant="ghost" disabled aria-describedby={gapDescription('PUB-09')}>Télécharger mes données</NeoPressButton>
      <NeoPressButton disabled={!auth || busy} variant="text" onClick={logout}>Se déconnecter</NeoPressButton>
    </div>
    {error && <div role="alert"><SystemFeedback {...error} /></div>}
  </>;
}

function Maintenance() {
  return <><SystemFeedback state="maintenance" />
    <Notice title="Ce qui est vérifiable">La fenêtre de maintenance et l'état des services ne sont publiés par aucune API de cette version. Le rapport /healthz décrit la seule frontière API/persistance du Worker : ce n'est pas une page de statut métier, il n'est pas appelé ici et son absence ne prouve aucun état de service.</Notice>
    <BackendGap code="PUB-10" />
    <div className="lbm-public__actions">
      <NeoPressButton variant="primary" disabled aria-describedby={gapDescription('PUB-10')}>Me prévenir à la reprise</NeoPressButton>
      <NeoPressButton variant="ghost" disabled aria-describedby={gapDescription('PUB-10')}>Voir l'état des services</NeoPressButton>
    </div>
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
    <Page />{screen.code !== 'PUB-01' && <ExitLinks pathname={pathname} />}
  </motion.div>;
}
