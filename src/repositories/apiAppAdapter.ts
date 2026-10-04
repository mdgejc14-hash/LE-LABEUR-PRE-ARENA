import { createApiRepository } from './apiRepository';
import type { ApiClientOptions } from './apiClient';
import { createLegacyApiRepositoryAdapter } from './legacyApiAdapter';
import type { AppRepositoryBundle } from './provider';

/**
 * Builds, but never activates, the HTTP-backed AppContext repository bundle.
 * Call configureRepositoryAdapter(bundle, 'api') only in a deployment that has
 * real session middleware and persistent handlers installed.
 */
export function createApiAppRepositoryAdapter(options?: ApiClientOptions): AppRepositoryBundle {
  return createLegacyApiRepositoryAdapter(createApiRepository(options));
}
