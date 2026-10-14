/**
 * LE LABEUR — P0-NOTIFICATIONS — handlers API des routes DÉJÀ déclarées par le
 * catalogue (`src/backend/api/routeContracts.ts`) :
 *
 *   GET  /api/v1/my/notifications                 → notifications.mine.list
 *   POST /api/v1/notifications/:notificationId/read → notifications.read
 *   POST /api/v1/my/notifications/read-all        → notifications.read-all
 *   GET  /api/v1/admin/notifications              → admin.notifications.list
 *
 * Aucune route n'est créée ici : les quatre chemins, leurs portées
 * (`self` / `admin`), leur permission (`notifications:read:any`) et leur
 * exigence de clé d'idempotence étaient DÉJÀ déclarés. Seuls les handlers
 * manquants sont installés — les autres opérations restent `501`.
 */

import type { ApiRouteContext, ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { OpenNotificationService } from './notificationService';

function requireActorAndCommand(context: ApiRouteContext): { actor: NonNullable<ApiRouteContext['actor']>; command: NonNullable<ApiRouteContext['command']> } {
  if (!context.actor) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  if (!context.command) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
  return { actor: context.actor, command: context.command };
}

/**
 * Filtre de lecture STRICT : seules les valeurs du modèle sont acceptées.
 * Aucun paramètre client ne peut élargir la requête au-delà du propriétaire.
 */
function readStateFilter(searchParams: URLSearchParams): 'READ' | 'UNREAD' | null {
  const values = searchParams.getAll('state');
  if (values.length === 0) return null;
  if (values.length > 1) throw new ApiError('VALIDATION_ERROR', 'Le filtre d’état est invalide.');
  const value = values[0];
  if (value === 'UNREAD' || value === 'READ') return value;
  throw new ApiError('VALIDATION_ERROR', 'Le filtre d’état doit valoir READ ou UNREAD.');
}

async function rejectForgedBodyFields(request: Request): Promise<void> {
  const raw = await request.text();
  if (!raw.trim()) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps JSON invalide.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError('VALIDATION_ERROR', 'Corps JSON attendu sous forme d’objet.');
  }
  const extra = Object.keys(parsed as Record<string, unknown>);
  if (extra.length > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Champ non autorisé : ${extra.join(', ')}.`,
      { fields: ['PARAMETER_FORGERY_REJECTED', ...extra] },
    );
  }
}

export function createNotificationApiHandlers(
  service: OpenNotificationService,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'notifications.mine.list': async context => {
      if (!context.actor) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
      return service.listMine(
        context.actor,
        context.page ?? { cursor: null, limit: 25 },
        readStateFilter(context.url.searchParams),
      );
    },

    'notifications.read': async context => {
      const { actor, command } = requireActorAndCommand(context);
      await rejectForgedBodyFields(context.request);
      const result = await service.markRead(actor, context.params.notificationId, command);
      return apiJsonResponse(result, 200, context.requestId);
    },

    'notifications.read-all': async context => {
      const { actor, command } = requireActorAndCommand(context);
      await rejectForgedBodyFields(context.request);
      const result = await service.markAllRead(actor, command);
      return apiJsonResponse(result, 200, context.requestId);
    },

    'admin.notifications.list': async context => {
      if (!context.actor) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
      return service.listAdmin(context.actor, context.page ?? { cursor: null, limit: 25 });
    },
  };
}
