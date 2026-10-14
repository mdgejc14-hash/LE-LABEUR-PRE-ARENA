/**
 * PUB-05…PUB-08 — backend capabilities are not inferred from the design API
 * list. These are the concrete route shapes the screen fiches describe, kept
 * here only so the UI and tests can state exactly what is still unavailable.
 * No request is made to any of these routes.
 */

export type PublicAuthGapCode = 'PUB-05' | 'PUB-06' | 'PUB-07' | 'PUB-08';
export type PublicAuthOperation = {
  readonly method: 'GET' | 'POST';
  readonly path: string;
};

export const PUBLIC_AUTH_GAPS: Readonly<Record<PublicAuthGapCode, {
  readonly operations: readonly PublicAuthOperation[];
  readonly explanation: string;
}>> = {
  'PUB-05': {
    operations: [
      { method: 'POST', path: '/api/v1/auth/register' },
      { method: 'GET', path: '/api/v1/geo/phone-policy' },
      { method: 'POST', path: '/api/v1/legal/consent' },
    ],
    explanation: 'Les contrats d’inscription, de politique téléphonique et de consentement versionné décrits par PUB-05 ne sont pas déclarés et leurs handlers sont absents. La route Google existante accepte un champ « register », mais le service de session ne distingue pas cette intention et peut créer un compte actif sans vérification du téléphone ni preuve de consentement ; elle ne peut donc pas remplacer ce parcours. Aucun champ personnel n’est collecté et la création reste désactivée.',
  },
  'PUB-06': {
    operations: [
      { method: 'POST', path: '/api/v1/auth/otp/verify' },
      { method: 'POST', path: '/api/v1/auth/otp/resend' },
      { method: 'GET', path: '/api/v1/auth/otp/status' },
    ],
    explanation: 'Aucun contrat ni handler OTP d’authentification n’est disponible pour vérifier, renvoyer ou consulter un code. L’OTP existant est exclusivement lié à la confirmation de Salaire sur un paiement et n’est pas réutilisé ici. Aucun code, compte à rebours ou état de vérification n’est demandé ou simulé.',
  },
  'PUB-07': {
    operations: [
      { method: 'POST', path: '/api/v1/auth/recovery/start' },
      { method: 'POST', path: '/api/v1/auth/recovery/confirm' },
      { method: 'GET', path: '/api/v1/auth/recovery/channels' },
    ],
    explanation: 'Aucun contrat ni handler ne permet de découvrir un canal vérifié, de démarrer une récupération ou de la confirmer. Sans ce parcours serveur anti-énumération, l’écran ne collecte ni adresse e-mail ni numéro de téléphone et n’annonce aucun envoi.',
  },
  'PUB-08': {
    operations: [
      { method: 'GET', path: '/api/v1/legal/documents' },
      { method: 'GET', path: '/api/v1/legal/documents/legal-document/version' },
      { method: 'POST', path: '/api/v1/legal/consent' },
    ],
    explanation: 'Aucun contrat ni handler ne fournit un document juridique approuvé avec sa version et son empreinte, ni ne consigne le consentement correspondant. Aucun texte, numéro de version, hash, téléchargement ou consentement n’est inventé ; consulter ou accepter un document reste indisponible.',
  },
};

export const PUBLIC_AUTH_GAP_ROUTES: readonly (PublicAuthOperation & {
  readonly screenCode: PublicAuthGapCode;
})[] = (Object.entries(PUBLIC_AUTH_GAPS) as [PublicAuthGapCode, (typeof PUBLIC_AUTH_GAPS)[PublicAuthGapCode]][])
  .flatMap(([screenCode, gap]) => gap.operations.map(operation => ({ screenCode, ...operation })));

/**
 * PUB-AUTH-2 — capacités manquantes des écrans publics RESTANTS
 * (PUB-01, PUB-02, PUB-03, PUB-04, PUB-09, PUB-10).
 *
 * Même règle que PUB-05…PUB-08 : chaque opération listée est une référence de
 * la fiche, vérifiée absente de `src/backend/api/routeContracts.ts` (donc sans
 * handler). Aucune requête n'est émise vers ces chemins : l'écran affiche le
 * BACKEND_GAP et laisse ses contrôles désactivés.
 *
 * Ce qui existe réellement et sert ces écrans :
 *  - `GET /api/v1/auth/session` (session serveur, statut ACTIVE, rôle effectif) ;
 *  - `POST /api/v1/auth/google/credential` (connexion Google vérifiée serveur) ;
 *  - `POST /api/v1/auth/logout` (révocation de session) ;
 *  - la limitation de débit réelle du Worker sur le bucket `auth` (429 + details.retryAfterSeconds) ;
 *  - le rapport `/healthz` (frontière API/persistance), qui n'est PAS une page de statut.
 */

export type PublicScreenGapCode = 'PUB-01' | 'PUB-02' | 'PUB-03' | 'PUB-04' | 'PUB-09' | 'PUB-10';

export const PUBLIC_SCREEN_GAPS: Readonly<Record<PublicScreenGapCode, {
  readonly operations: readonly PublicAuthOperation[];
  readonly explanation: string;
}>> = {
  'PUB-01': {
    operations: [
      { method: 'GET', path: '/api/v1/health' },
    ],
    explanation: 'PUB-01 · GET /api/v1/health — absent : Le préchauffage de la fiche vise une route /v1/health qui n’existe pas : le seul rapport de santé réel du Worker est /healthz (frontière API/persistance, hors du préfixe /api/v1). Il n’est pas appelé ici et n’est pas présenté comme un état de service. Le préchauffage de session utilise le contrat réel GET /api/v1/auth/session. Le champ particulaire est un canvas 2D décoratif : ni GLSL 120 fps, ni Skia hors thread JS, aucune mesure de performance n’est affichée.',
  },
  'PUB-02': {
    operations: [
      { method: 'GET', path: '/api/v1/public/story' },
      { method: 'GET', path: '/api/v1/public/stats' },
    ],
    explanation: 'PUB-02 · GET /api/v1/public/story et GET /api/v1/public/stats — absents : Aucun contrat ni handler ne publie le récit public ni d’agrégats vérifiés. La vitrine reste donc statique : les trois preuves sont les affirmations produit de la fiche, aucun compteur, aucune statistique d’usage et aucune donnée serveur ne sont affichés — et l’exemple de prix est la transcription littérale des trois lignes FIN de la fiche, sans calcul.',
  },
  'PUB-03': {
    operations: [
      { method: 'POST', path: '/api/v1/onboarding/role' },
      { method: 'GET', path: '/api/v1/onboarding/role-policy' },
    ],
    explanation: 'PUB-03 · POST /api/v1/onboarding/role et GET /api/v1/onboarding/role-policy — absents : Aucun contrat ni handler ne fixe le rôle pendant l’inscription, ni n’expose la politique de changement. Le seul contrat réel est POST /api/v1/auth/google/credential : le champ requestedRole y est accepté pour la CRÉATION d’un compte (rôles self-service uniquement) et GET /api/v1/auth/session LIT le rôle effectif du serveur. Aucun changement de rôle d’un compte existant n’existe : la promesse de la fiche « modifiable une fois dans les 30 jours via le support » n’est pas affichée. Un choix de profil dans cette interface n’est jamais une autorisation : l’autorisation reste calculée par le serveur à chaque requête.',
  },
  'PUB-04': {
    operations: [
      { method: 'POST', path: '/api/v1/auth/login' },
      { method: 'POST', path: '/api/v1/auth/magic-link' },
      { method: 'GET', path: '/api/v1/auth/throttle-status' },
    ],
    explanation: 'PUB-04 · POST /api/v1/auth/login, POST /api/v1/auth/magic-link et GET /api/v1/auth/throttle-status — absents : Le mot de passe, le lien magique et l’interrogation de limitation de la fiche n’ont ni contrat ni handler. La connexion réellement disponible est Google (POST /api/v1/auth/google/credential). La limitation de débit RÉELLE du Worker couvre le bucket « auth » (60 requêtes / 60 s, clé acteur ou empreinte de requête) et répond 429 avec details.retryAfterSeconds : seule cette valeur du serveur peut être affichée, aucun décompte local, aucun CAPTCHA et aucun délai croissant ne sont simulés. Un 403 de cette route vient du service de session lorsque le compte n’est pas actif : aucun motif de blocage n’est transmis par l’API.',
  },
  'PUB-09': {
    operations: [
      { method: 'GET', path: '/api/v1/account/block-status' },
      { method: 'POST', path: '/api/v1/account/appeal' },
      { method: 'GET', path: '/api/v1/account/export' },
    ],
    explanation: 'PUB-09 · GET /api/v1/account/block-status, POST /api/v1/account/appeal et GET /api/v1/account/export — absents : Aucun contrat ne rend le motif, la durée ou l’échéance de révision d’un blocage, ne reçoit une contestation (formulaire → ADM-26) ni ne produit un export de données. Le seul fait serveur disponible est binaire : GET /api/v1/auth/session répond 200 avec status ACTIVE pour un compte actif, 401 sinon, et POST /api/v1/auth/google/credential répond 403 lorsque le compte n’est pas actif — sans motif. Cette URL ne prouve donc aucune suspension : aucun motif, aucune date, aucun délai de traitement et aucune tuile d’export ou de contestation ne sont activés.',
  },
  'PUB-10': {
    operations: [
      { method: 'GET', path: '/api/v1/status/window' },
      { method: 'GET', path: '/api/v1/status/services' },
      { method: 'POST', path: '/api/v1/notify/maintenance-resume' },
    ],
    explanation: 'PUB-10 · GET /api/v1/status/window, GET /api/v1/status/services et POST /api/v1/notify/maintenance-resume — absents : Ni la fenêtre de maintenance, ni l’état des services, ni un abonnement à la reprise n’ont de contrat ou de handler. Le rapport /healthz du Worker (mode boundary-only / ok / degraded, sondage de persistance, migrations appliquées) décrit UNIQUEMENT la frontière API/persistance : ce n’est pas une page de statut métier, il n’est pas appelé par cet écran et son absence ne prouve aucun état de service. Aucune heure de reprise, aucune progression, aucune garantie de report d’échéance et aucune notification ne sont affichées ou programmées.',
  },
};

export const PUBLIC_SCREEN_GAP_ROUTES: readonly (PublicAuthOperation & {
  readonly screenCode: PublicScreenGapCode;
})[] = (Object.entries(PUBLIC_SCREEN_GAPS) as [PublicScreenGapCode, (typeof PUBLIC_SCREEN_GAPS)[PublicScreenGapCode]][])
  .flatMap(([screenCode, gap]) => gap.operations.map(operation => ({ screenCode, ...operation })));

/** Union des deux registres : toute fiche PUB qui déclare au moins une absence. */
export type PublicGapCode = PublicAuthGapCode | PublicScreenGapCode;

export const PUBLIC_GAPS: Readonly<Record<PublicGapCode, { readonly operations: readonly PublicAuthOperation[]; readonly explanation: string }>> = {
  ...PUBLIC_AUTH_GAPS,
  ...PUBLIC_SCREEN_GAPS,
};

export const PUBLIC_GAP_ROUTES: readonly (PublicAuthOperation & { readonly screenCode: PublicGapCode })[] = [
  ...PUBLIC_AUTH_GAP_ROUTES,
  ...PUBLIC_SCREEN_GAP_ROUTES,
];
