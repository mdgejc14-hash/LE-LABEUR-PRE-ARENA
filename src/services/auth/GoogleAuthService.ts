/**
 * Service d'authentification Google Identity Services pour LE LABEUR.
 *
 * Conforme aux spécifications :
 * - Utilisation de Google Identity Services officiel (GSI web).
 * - Utilisation de l'identifiant stable `sub` (Google Subject ID).
 * - Client ID fourni via VITE_GOOGLE_CLIENT_ID (aucun secret stocké en client).
 * - Préparation de la frontière vers le futur backend de production.
 */

import { GoogleIdPayload } from '../../types';
import { IS_DEMO_MODE } from '../../utils/config';

export function getGoogleClientId(): string {
  const envVal = typeof import.meta !== 'undefined'
    ? (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID
    : '';
  return (envVal || '').trim();
}

export function isGoogleAuthAvailable(): boolean {
  return Boolean(getGoogleClientId());
}

/**
 * Décode la charge utile (payload) d'un ID Token JWT Google sans dépendance externe.
 * Note : La vérification cryptographique de la signature RSA doit être exécutée
 * côté serveur par le futur backend de production.
 */
export function decodeGoogleJwt(credential: string): GoogleIdPayload {
  if (!credential || typeof credential !== 'string') {
    throw new Error('Jeton Google manquant ou invalide.');
  }

  const parts = credential.split('.');
  if (parts.length < 2) {
    throw new Error('Format de jeton Google ID Token invalide.');
  }

  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);

    if (!parsed.sub) {
      throw new Error('Identifiant stable Google (sub) absent du jeton.');
    }

    return {
      sub: String(parsed.sub),
      email: String(parsed.email || '').toLowerCase(),
      name: String(parsed.name || parsed.given_name || parsed.email?.split('@')[0] || 'Utilisateur Google'),
      picture: parsed.picture ? String(parsed.picture) : undefined,
      email_verified: Boolean(parsed.email_verified),
      credential
    };
  } catch (err: any) {
    throw new Error(err.message || 'Impossible de décoder les informations du compte Google.');
  }
}

/**
 * Charge dynamiquement le SDK Google Identity Services officiel si non présent.
 */
export async function loadGoogleIdentityServicesScript(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ((window as any).google?.accounts?.id) return;

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-gsi-client');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Échec du chargement de Google Identity Services.')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Impossible de contacter le service Google Identity (vérifiez la connexion réseau).'));
    document.head.appendChild(script);
  });
}

/**
 * Lance le flux officiel Google Identity Services via popup / OneTap.
 */
export async function triggerGoogleSignInPrompt(roleHint?: string): Promise<GoogleIdPayload> {
  const clientId = getGoogleClientId();

  // Si aucun Client ID n'est configuré
  if (!clientId) {
    if (IS_DEMO_MODE) {
      // En mode démonstration / QA sans GCP configuré, simulation contrôlée
      const isEmployer = roleHint === 'EMPLOYER';
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            sub: isEmployer ? 'google-sub-employer-demo-987654321012' : 'google-sub-candidate-demo-109283746501',
            email: isEmployer ? 'recruteur.benin.test@gmail.com' : 'artisan.benin.test@gmail.com',
            name: isEmployer ? 'Reine Houénou (Google)' : 'Kofi Mensah (Google)',
            email_verified: true,
            credential: `demo.eyJzdWIiOiJnb29nbGUtc3ViLWRlbW8iLCJlbWFpbCI6Ii4uLiJ9.signature`
          });
        }, 500);
      });
    }

    throw new Error(
      'Configuration Google absente : la variable VITE_GOOGLE_CLIENT_ID n’est pas configurée dans l’environnement.'
    );
  }

  await loadGoogleIdentityServicesScript();

  const google = (window as any).google;
  if (!google?.accounts?.id) {
    throw new Error('Le client Google Identity Services n’a pas pu être initialisé.');
  }

  return new Promise<GoogleIdPayload>((resolve, reject) => {
    let settled = false;

    try {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          if (settled) return;
          settled = true;
          if (!response || !response.credential) {
            reject(new Error('Aucun identifiant Google (credential) n’a été reçu.'));
            return;
          }
          try {
            const payload = decodeGoogleJwt(response.credential);
            resolve(payload);
          } catch (err: any) {
            reject(err);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true
      });

      google.accounts.id.prompt((notification: any) => {
        if (settled) return;
        if (notification.isNotDisplayed()) {
          const reason = notification.getNotDisplayedReason();
          settled = true;
          reject(new Error(`La fenêtre Google n’a pas pu s’afficher (${reason || 'popup bloquée'}).`));
        } else if (notification.isSkippedMoment()) {
          const reason = notification.getSkippedReason();
          settled = true;
          reject(new Error(`Authentification Google annulée (${reason || 'fermeture par l’utilisateur'}).`));
        } else if (notification.isDismissedMoment()) {
          const reason = notification.getDismissedReason();
          if (reason !== 'credential_returned') {
            settled = true;
            reject(new Error('La connexion Google a été interrompue ou fermée.'));
          }
        }
      });
    } catch (err: any) {
      if (!settled) {
        settled = true;
        reject(new Error(err.message || 'Erreur lors de l’initialisation de Google Identity.'));
      }
    }
  });
}
