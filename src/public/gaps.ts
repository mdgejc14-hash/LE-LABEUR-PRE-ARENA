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
