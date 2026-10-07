/** P0-WEBRTC REST handlers. Credentials are accepted only in a dedicated header. */

import type { ApiRouteContext, ApiRouteHandler } from '../api/worker';
import type { ApiRouteKey } from '../api/routeContracts';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { WebRtcSessionRepository } from './webrtcRepository';
import type { WebRtcEntityType } from '../productionContracts';

const MAX_CREATE_BODY_BYTES = 4096;
const MAX_SIGNAL_BODY_BYTES = 52 * 1024;

function requireActor(context: ApiRouteContext): NonNullable<ApiRouteContext['actor']> {
  if (!context.actor) throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  return context.actor;
}
function requireCommand(context: ApiRouteContext): NonNullable<ApiRouteContext['command']> {
  if (!context.command) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est requise.');
  return context.command;
}

async function readJsonBody(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) {
    throw new ApiError('VALIDATION_ERROR', 'Le corps de la requête dépasse la taille autorisée.');
  }
  if (!request.body) throw new ApiError('VALIDATION_ERROR', 'Le corps JSON est obligatoire.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new ApiError('VALIDATION_ERROR', 'Le corps de la requête dépasse la taille autorisée.');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('VALIDATION_ERROR', 'Le corps JSON est invalide.');
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Le corps JSON est invalide.');
  }
}

function requireObject(value: unknown, allowed: readonly string[], errorMessage: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('VALIDATION_ERROR', errorMessage);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !allowed.includes(key))) throw new ApiError('VALIDATION_ERROR', errorMessage);
  return record;
}

function numberQuery(context: ApiRouteContext, key: string, fallback: number, maximum: number): number {
  const values = context.url.searchParams.getAll(key);
  if (values.length === 0) return fallback;
  if (values.length !== 1 || !/^\d+$/.test(values[0])) throw new ApiError('VALIDATION_ERROR', `Le paramètre ${key} est invalide.`);
  const value = Number(values[0]);
  if (!Number.isSafeInteger(value) || value > maximum) throw new ApiError('VALIDATION_ERROR', `Le paramètre ${key} est hors limite.`);
  return value;
}

function credentialHeader(context: ApiRouteContext): string | null {
  // Multiple occurrences are combined by Fetch with a comma; the repository's
  // opaque-token grammar rejects that combined value rather than guessing.
  return context.request.headers.get('X-WebRTC-Credential');
}

export function createWebRtcApiHandlers(
  repository: WebRtcSessionRepository,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'webrtc.sessions.mine.list': async context => {
      const page = context.page ?? { cursor: null, limit: 25 };
      return apiJsonResponse(await repository.listMine(requireActor(context), page.limit, page.cursor), 200, context.requestId);
    },

    'webrtc.sessions.create': async context => {
      const body = requireObject(await readJsonBody(context.request, MAX_CREATE_BODY_BYTES), ['entityType', 'entityId'], 'La création de session ne peut contenir que le contrat métier.');
      if (body.entityType !== 'CONTRACT' || typeof body.entityId !== 'string') {
        throw new ApiError('VALIDATION_ERROR', 'Type ou identifiant de contrat invalide.');
      }
      const result = await repository.create(
        requireActor(context),
        { entityType: body.entityType as WebRtcEntityType, entityId: body.entityId },
        requireCommand(context),
      );
      return apiJsonResponse(result, 201, context.requestId);
    },

    'webrtc.sessions.read': async context => {
      const result = await repository.get(requireActor(context), context.params.sessionId);
      return apiJsonResponse(result, 200, context.requestId);
    },

    'webrtc.sessions.join': async context => {
      const result = await repository.join(requireActor(context), context.params.sessionId);
      return apiJsonResponse(result, 200, context.requestId);
    },

    'webrtc.sessions.credentials.create': async context => {
      const result = await repository.issueCredential(requireActor(context), context.params.sessionId);
      return apiJsonResponse(result, 201, context.requestId);
    },

    'webrtc.sessions.ice-configuration': async context => {
      const result = await repository.getIceConfiguration(requireActor(context), context.params.sessionId);
      return apiJsonResponse(result, 200, context.requestId);
    },

    'webrtc.sessions.signaling.send': async context => {
      const result = await repository.sendSignal(
        requireActor(context),
        context.params.sessionId,
        await readJsonBody(context.request, MAX_SIGNAL_BODY_BYTES),
        requireCommand(context),
        credentialHeader(context),
      );
      return apiJsonResponse(result, 201, context.requestId);
    },

    'webrtc.sessions.signaling.poll': async context => {
      const allowed = new Set(['afterSequence', 'limit']);
      for (const key of context.url.searchParams.keys()) {
        if (!allowed.has(key)) throw new ApiError('VALIDATION_ERROR', 'Paramètre de lecture non autorisé.');
      }
      const afterSequence = numberQuery(context, 'afterSequence', 0, Number.MAX_SAFE_INTEGER);
      const limit = numberQuery(context, 'limit', 25, 50);
      const result = await repository.poll(
        requireActor(context),
        context.params.sessionId,
        afterSequence,
        limit,
        credentialHeader(context),
      );
      return apiJsonResponse(result, 200, context.requestId);
    },

    'webrtc.sessions.transport-connected': async context => {
      const body = requireObject(await readJsonBody(context.request, 1024), [], 'La confirmation de connexion ne prend aucun champ client.');
      if (Object.keys(body).length) throw new ApiError('VALIDATION_ERROR', 'La confirmation de connexion ne prend aucun champ client.');
      const result = await repository.reportTransportConnected(
        requireActor(context),
        context.params.sessionId,
        requireCommand(context),
        credentialHeader(context),
      );
      return apiJsonResponse(result, 200, context.requestId);
    },

    'webrtc.sessions.close': async context => {
      const result = await repository.close(requireActor(context), context.params.sessionId, requireCommand(context));
      return apiJsonResponse(result, 200, context.requestId);
    },
  };
}
