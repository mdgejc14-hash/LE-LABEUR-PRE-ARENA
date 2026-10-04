import type { ApiErrorBody, ApiErrorCode } from '../backend/api/errors';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE',
    readonly requestId?: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  /** Same-origin path prefix. Do not put credentials or secrets in a VITE URL. */
  basePath?: string;
  fetcher?: typeof fetch;
}

export class HttpApiClient {
  private readonly basePath: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    const basePath = options.basePath ?? '/api/v1';
    if (!basePath.startsWith('/') || basePath.startsWith('//') || /^[a-z]+:/i.test(basePath)) {
      throw new Error('API basePath must be a same-origin path.');
    }
    this.basePath = basePath.replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || /^[a-z]+:/i.test(path)) {
      throw new Error('API paths must be relative to the configured same-origin base path.');
    }
    const url = new URL(`${this.basePath}${path}`, this.getOrigin());
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const headers = new Headers({ accept: 'application/json' });
    if (options.body !== undefined) headers.set('content-type', 'application/json');
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);

    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        method: options.method ?? 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch {
      throw new ApiClientError('Le service est temporairement indisponible.', 0, 'NETWORK_ERROR');
    }

    if (response.status === 204) return undefined as T;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) throw new ApiClientError('Le service est temporairement indisponible.', response.status, 'INVALID_RESPONSE');
      throw new ApiClientError('Réponse API invalide.', response.status, 'INVALID_RESPONSE');
    }

    if (!response.ok) {
      const errorBody = payload as Partial<ApiErrorBody>;
      const error = errorBody?.error;
      const code = error?.code ?? 'INTERNAL_ERROR';
      const message = error?.message ?? 'Une erreur interne est survenue.';
      throw new ApiClientError(message, response.status, code, error?.requestId, error?.details);
    }
    return payload as T;
  }

  private getOrigin(): string {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
    // Tests inject a fetcher and can use this stable dummy origin; callers still
    // receive a same-origin URL, and no browser code calls localhost.
    return 'https://api.invalid';
  }
}
