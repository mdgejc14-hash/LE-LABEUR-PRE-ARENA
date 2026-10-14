/**
 * LE LABEUR — idempotence côté client (commandes API).
 *
 * - Une clé est générée par tentative utilisateur, puis réutilisée pour la même
 *   demande tant qu'elle n'a pas de réponse définitive : une reprise ne crée pas de doublon.
 * - Une issue inconnue (coupure réseau, réponse illisible, 5xx) conserve la clé.
 * - Un refus définitif (4xx, 501 non exposé) peut libérer la clé.
 */

import { ApiClientError } from './apiClient';

/** Clé unique par tentative (fonctionne même sans `crypto.randomUUID`). */
export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Vrai quand le serveur a pu traiter la commande sans que le client ne le sache. */
export function isUnknownOutcome(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    // 501 : route non exposée, aucune requête n'a créé quoi que ce soit.
    if (error.status === 501) return false;
    return error.status === 0 || error.status >= 500
      || error.code === 'NETWORK_ERROR' || error.code === 'INVALID_RESPONSE';
  }
  return true;
}

/** Clés stables par clé métier (ex. une candidature par offre). */
export interface KeyedAttempts<K> {
  keyFor(subject: K): string;
  /** Libère la clé après confirmation ou refus définitif. */
  settle(subject: K): void;
}

export function createKeyedAttempts<K>(newKey: () => string = newIdempotencyKey): KeyedAttempts<K> {
  const keys = new Map<K, string>();
  return {
    keyFor(subject) {
      let key = keys.get(subject);
      if (!key) {
        key = newKey();
        keys.set(subject, key);
      }
      return key;
    },
    settle(subject) {
      keys.delete(subject);
    },
  };
}
