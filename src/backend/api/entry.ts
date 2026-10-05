/**
 * Composition root du Worker LE LABEUR (Phase 2).
 *
 * Trois états possibles, explicites et sans retombée silencieuse :
 *  - `closed`  : aucun `GOOGLE_CLIENT_ID` → frontière Phase 1 (401/501) ;
 *  - `memory`  : identité serveur en mémoire, réservée aux tests/démo serveur ;
 *  - `postgres`: stores SQL via Hyperdrive — PRÉPARÉ, non branché tant qu'aucune
 *    implémentation `PostgreSqlDatabase` n'est injectée.
 */

import type { PostgreSqlDatabase } from '../services/database';
import { createGoogleCredentialVerifier } from '../identity/googleVerifier';
import { createSessionService } from '../identity/sessionService';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { createInMemoryIdentityStores, type IdentityStores } from '../identity/stores';
import { createApiWorker } from './worker';
import { createIdentityApiWorker } from './identityWorker';

export interface WorkerEnvironment {
  GOOGLE_CLIENT_ID?: string;
  SESSION_TTL_SECONDS?: string;
  /** 'memory' uniquement pour un environnement de test explicite. */
  IDENTITY_STORE?: 'memory' | 'postgres';
  COOKIE_SECURE?: string;
}

export type WorkerIdentityMode = 'closed' | 'memory' | 'postgres';

export interface WorkerComposition {
  mode: WorkerIdentityMode;
  worker: { fetch(request: Request): Promise<Response> };
}

export function composeWorker(env: WorkerEnvironment, database?: PostgreSqlDatabase): WorkerComposition {
  const audience = env.GOOGLE_CLIENT_ID?.trim();
  if (!audience) {
    // Aucun vérificateur Google : la frontière reste fermée par défaut.
    return { mode: 'closed', worker: createApiWorker({ authenticate: async () => null }) };
  }

  let stores: IdentityStores;
  let mode: WorkerIdentityMode;
  if (database) {
    stores = createSqlIdentityStores(database);
    mode = 'postgres';
  } else if (env.IDENTITY_STORE === 'memory') {
    stores = createInMemoryIdentityStores();
    mode = 'memory';
  } else {
    return { mode: 'closed', worker: createApiWorker({ authenticate: async () => null }) };
  }

  const sessions = createSessionService({
    stores,
    googleVerifier: createGoogleCredentialVerifier({ audience }),
    sessionTtlSeconds: env.SESSION_TTL_SECONDS ? Number(env.SESSION_TTL_SECONDS) : undefined,
  });

  return {
    mode,
    worker: createIdentityApiWorker({
      sessions,
      stores,
      cookie: { secure: env.COOKIE_SECURE !== 'false' },
    }),
  };
}

let cachedComposition: WorkerComposition | null = null;

export default {
  fetch(request: Request, env: WorkerEnvironment = {}): Promise<Response> {
    // La composition (et son store mémoire éventuel) est conservée entre requêtes.
    cachedComposition ??= composeWorker(env);
    return cachedComposition.worker.fetch(request);
  },
};
