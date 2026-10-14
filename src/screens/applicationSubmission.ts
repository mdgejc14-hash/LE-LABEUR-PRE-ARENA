/**
 * LE LABEUR — candidature à une offre (applications.create).
 *
 * - Une candidature n'est confirmée que si le serveur renvoie une candidature identifiée.
 * - Une clé d'idempotence est conservée par offre tant que l'issue est inconnue ;
 *   une reprise réutilise la clé (le serveur ne crée jamais deux candidatures pour un couple candidat/offre).
 * - « Déjà postulé » ne se déduit que de la liste renvoyée par le serveur, jamais d'un état local.
 */

import type { Application } from '../types';
import { ApiClientError } from '../repositories/apiClient';
import { isUnknownOutcome, type KeyedAttempts } from '../repositories/idempotency';

export async function submitApplication(
  offerId: string,
  send: (offerId: string, idempotencyKey: string) => Promise<Application>,
  attempts: KeyedAttempts<string>,
): Promise<Application> {
  const key = attempts.keyFor(offerId);
  let application: Application;
  try {
    application = await send(offerId, key);
  } catch (error) {
    if (!isUnknownOutcome(error)) attempts.settle(offerId);
    throw error;
  }
  if (!application || typeof application.id !== 'string' || !application.id) {
    throw new Error('Réponse du serveur incomplète : la candidature n’est pas confirmée.');
  }
  attempts.settle(offerId);
  return application;
}

/** Vrai seulement si la liste serveur contient une candidature active pour cette offre. */
export function hasActiveApplication(applications: readonly Application[], offerId: string): boolean {
  return applications.some(application => application.offerId === offerId && application.status !== 'WITHDRAWN');
}

/**
 * Message utilisateur d'un échec de candidature. Un échec n'est jamais présenté
 * comme une réussite : le texte indique si la candidature a été enregistrée ou non.
 */
export function applicationErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 501) {
      return 'La candidature n’est pas disponible sur le serveur pour le moment. Aucune candidature n’a été enregistrée.';
    }
    if (isUnknownOutcome(error)) {
      return 'La candidature n’a pas pu être confirmée par le serveur. Réessayez : la même demande ne créera pas de doublon.';
    }
    // 4xx : le message serveur est explicite (compte non actif, offre non admissible…).
    return error.message || 'La candidature a été refusée.';
  }
  return 'La candidature n’a pas pu être confirmée. Réessayez.';
}
