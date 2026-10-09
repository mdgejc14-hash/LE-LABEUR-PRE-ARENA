/**
 * ADM — accès aux données réelles (session, ressources, actions).
 *
 * Trois règles :
 *  - la session vient du serveur (`GET /auth/session`), jamais d'un rôle stocké
 *    dans l'URL ou dans un stockage local ;
 *  - aucune donnée n'est simulée : sans source configurée (mode démo), l'écran
 *    dit que la source est absente au lieu d'afficher des valeurs inventées ;
 *  - toute requête est annulable (AbortController) et rejouable (`reload`).
 *
 * Les permissions affichées sont celles dérivées par le SERVEUR pour la
 * session : le frontend ne décide jamais d'une autorisation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBootstrapDecision } from '../bootstrap/appBootstrap';
import { HttpApiClient } from '../repositories/apiClient';
import { AdminApi, type AdminSession } from './api';
import { adminError, type AdminError } from './errors';

let cachedApi: AdminApi | null | undefined;

/** API same-origin configurée (mode API explicite), sinon `null`. */
export function configuredAdminApi(): AdminApi | null {
  if (cachedApi !== undefined) return cachedApi;
  const decision = getBootstrapDecision();
  cachedApi = decision.mode === 'api' && decision.basePath ? new AdminApi(new HttpApiClient({ basePath: decision.basePath })) : null;
  return cachedApi;
}

export function useAdminApi(): AdminApi | null {
  return useMemo(() => configuredAdminApi(), []);
}

export type ResourceStatus = 'loading' | 'ready' | 'error' | 'unavailable';

export interface AdminResource<T> {
  readonly status: ResourceStatus;
  readonly data: T | null;
  readonly error: AdminError | null;
  readonly reload: () => void;
}

/**
 * L'API n'existe qu'en mode API explicite. Sans elle, l'écran affiche
 * l'absence de source : jamais un jeu de démonstration.
 */
export function useAdminResource<T>(
  load: (api: AdminApi, signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AdminResource<T> {
  const api = useAdminApi();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ status: ResourceStatus; data: T | null; error: AdminError | null }>({
    status: api ? 'loading' : 'unavailable',
    data: null,
    error: null,
  });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!api) {
      setState({ status: 'unavailable', data: null, error: null });
      return undefined;
    }
    const controller = new AbortController();
    let live = true;
    setState((previous) => ({ status: 'loading', data: previous.data, error: null }));
    loadRef.current(api, controller.signal).then(
      (data) => {
        if (live) setState({ status: 'ready', data, error: null });
      },
      (cause) => {
        if (!live || controller.signal.aborted) return;
        setState({ status: 'error', data: null, error: adminError(cause) });
      },
    );
    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, version, ...deps]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}

export type SessionStatus = 'loading' | 'ready' | 'anonymous' | 'error' | 'unavailable';

export interface AdminSessionState {
  readonly status: SessionStatus;
  readonly session: AdminSession | null;
  readonly error: AdminError | null;
  readonly reload: () => void;
}

/** Session serveur : rôle et statut de compte autoritaires. */
export function useAdminSession(): AdminSessionState {
  const resource = useAdminResource<AdminSession>((api, signal) => api.session(signal), []);
  const status: SessionStatus =
    resource.status === 'ready'
      ? 'ready'
      : resource.status === 'unavailable'
        ? 'unavailable'
        : resource.status === 'error'
          ? resource.error?.state === '401'
            ? 'anonymous'
            : 'error'
          : 'loading';
  return { status, session: resource.data, error: resource.error, reload: resource.reload };
}

/**
 * Garde d'écran : un compte ADMIN ACTIF voit l'espace supervision. Le serveur
 * reste l'autorité (chaque appel est contrôlé côté Worker) ; cette garde n'est
 * qu'un affichage honnête des états 401/403 réels.
 */
export type AdminGuard = 'ok' | 'loading' | 'anonymous' | 'forbidden' | 'unavailable' | 'error';

export function adminGuard(state: AdminSessionState): AdminGuard {
  if (state.status === 'loading') return 'loading';
  if (state.status === 'unavailable') return 'unavailable';
  if (state.status === 'anonymous') return 'anonymous';
  if (state.status === 'error') return 'error';
  const actor = state.session?.actor;
  if (!actor || actor.role !== 'ADMIN' || actor.status === 'BLOCKED') return 'forbidden';
  return 'ok';
}

/** État d'une commande (bouton) : en cours, erreur, résultat. */
export interface AdminActionState<T> {
  readonly busy: boolean;
  readonly error: AdminError | null;
  readonly result: T | null;
  readonly run: (task: (signal: AbortSignal) => Promise<T>) => Promise<T | null>;
  readonly reset: () => void;
}

export function useAdminAction<T>(): AdminActionState<T> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (task: (signal: AbortSignal) => Promise<T>) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(null);
    try {
      const value = await task(current.signal);
      if (!current.signal.aborted) {
        setResult(value);
        setBusy(false);
      }
      return value;
    } catch (cause) {
      if (!current.signal.aborted) {
        setError(adminError(cause));
        setBusy(false);
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    setBusy(false);
  }, []);

  return { busy, error, result, run, reset };
}
