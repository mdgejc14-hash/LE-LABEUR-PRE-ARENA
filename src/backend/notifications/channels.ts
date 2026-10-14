/**
 * LE LABEUR — P0-NOTIFICATIONS — abstraction des canaux PUSH et EMAIL.
 *
 * ORDRE DE CANAL À PRÉSERVER : In-App → Push → Email. L'In-App est le canal
 * PRIORITAIRE et il est réellement persisté (`notifications`). Ce module ne
 * décrit QUE les deux canaux externes, sous forme de PORTS.
 *
 * Ce que ce module fait :
 *  - définit les ports `NotificationPushProvider` / `NotificationEmailProvider` ;
 *  - permet une implémentation future par simple injection ;
 *  - retourne `NOT_AVAILABLE` quand aucun provider n'est injecté.
 *
 * Ce que ce module ne fait PAS, volontairement :
 *  - aucun fournisseur réel (pas de FCM/APNs, pas de SMTP/API d'emailing) ;
 *  - aucun secret, aucune clé, aucune configuration de production ;
 *  - aucun jeton d'appareil, aucune table de livraison externe ;
 *  - aucun « envoi simulé » : `NOT_AVAILABLE` n'est jamais présenté comme un
 *    envoi réussi, et `DELIVERED` n'est écrit que si un provider injecté a
 *    réellement accusé réception de la livraison.
 */

import type { NotificationType, UserRole } from '../../types';
import type { NotificationChannelStatus } from './records';

/** Cible de livraison : uniquement des données non secrètes du modèle. */
export interface NotificationDeliveryTarget {
  notificationId: string;
  recipientId: string;
  recipientRole: UserRole;
  type: NotificationType;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationDeliveryOutcome {
  status: Extract<NotificationChannelStatus, 'DELIVERED' | 'FAILED'>;
  /** Motif technique, sans donnée personnelle ni secret. */
  detail?: string;
}

/**
 * Port PUSH. Une implémentation future reçoit ici le `recipientId` et résout
 * elle-même le jeton d'appareil persisté : aucun jeton ne transite par ce
 * contrat, donc aucune collecte de donnée n'est introduite par cette tranche.
 */
export interface NotificationPushProvider {
  readonly providerId: string;
  isConfigured(): boolean;
  deliver(target: NotificationDeliveryTarget): Promise<NotificationDeliveryOutcome>;
}

/** Port EMAIL. Mêmes règles : aucun secret, aucune adresse exposée au contrat. */
export interface NotificationEmailProvider {
  readonly providerId: string;
  isConfigured(): boolean;
  deliver(target: NotificationDeliveryTarget): Promise<NotificationDeliveryOutcome>;
}

export interface NotificationChannelRegistry {
  /** Un provider injecté ET configuré est-il disponible pour ce canal ? */
  isAvailable(kind: 'PUSH' | 'EMAIL'): boolean;
  /**
   * Tente la livraison et retourne l'état RÉEL. Sans provider, aucun appel
   * réseau n'a lieu et l'état est `NOT_AVAILABLE`.
   */
  deliver(kind: 'PUSH' | 'EMAIL', target: NotificationDeliveryTarget): Promise<NotificationChannelStatus>;
  /** Identifiants des providers réellement présents (observabilité, sans secret). */
  describe(): { push: string | null; email: string | null };
}

export interface NotificationChannelProviders {
  push?: NotificationPushProvider;
  email?: NotificationEmailProvider;
}

function errorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'erreur inconnue');
  return message.slice(0, 200);
}

/**
 * Composition SANS provider. C'est la composition utilisée par le Worker :
 * l'infrastructure de production (fournisseur réel, secrets, workers) est
 * explicitement hors de cette tranche.
 */
export function createNotificationChannelRegistry(
  providers: NotificationChannelProviders = {},
): NotificationChannelRegistry {
  const available = (provider: { isConfigured(): boolean } | undefined): boolean =>
    Boolean(provider && provider.isConfigured());

  return {
    isAvailable(kind) {
      return kind === 'PUSH' ? available(providers.push) : available(providers.email);
    },

    async deliver(kind, target) {
      const provider = kind === 'PUSH' ? providers.push : providers.email;
      if (!provider || !provider.isConfigured()) return 'NOT_AVAILABLE';
      try {
        const outcome = await provider.deliver(target);
        return outcome.status;
      } catch (error) {
        void errorDetail(error);
        return 'FAILED';
      }
    },

    describe() {
      return {
        push: providers.push && providers.push.isConfigured() ? providers.push.providerId : null,
        email: providers.email && providers.email.isConfigured() ? providers.email.providerId : null,
      };
    },
  };
}
