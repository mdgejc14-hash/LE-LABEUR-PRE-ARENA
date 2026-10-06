/**
 * P0-PAY-3 — registre provider-neutral des adaptateurs Payment.
 *
 * Les noms des opérateurs sont des emplacements de configuration seulement.
 * En l'absence d'un adaptateur officiel injecté, leur résolution échoue en
 * NOT_IMPLEMENTED : aucun endpoint, credential ou mouvement de fonds n'est
 * fourni par ce registre.
 */

import {
  createTestPaymentProviderAdapter,
  createUnconfiguredPaymentProviderAdapter,
  type PaymentProviderAdapter,
} from './paymentVerification';

function normalizeProviderId(providerId: string): string {
  return providerId.trim().toUpperCase();
}

export class PaymentProviderRegistry {
  private readonly adapters = new Map<string, PaymentProviderAdapter>();

  constructor(adapters: readonly PaymentProviderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: PaymentProviderAdapter): void {
    const providerId = normalizeProviderId(adapter.providerId);
    if (!providerId) throw new TypeError('providerId ne peut pas être vide.');
    if (this.adapters.has(providerId)) {
      throw new TypeError(`Un adaptateur est déjà enregistré pour ${providerId}.`);
    }
    this.adapters.set(providerId, adapter);
  }

  /** Retourne un adaptateur explicite, y compris refusant s'il est absent. */
  resolve(providerId: string): PaymentProviderAdapter {
    const normalized = normalizeProviderId(providerId);
    if (!normalized) return createUnconfiguredPaymentProviderAdapter('UNKNOWN');
    return this.adapters.get(normalized) ?? createUnconfiguredPaymentProviderAdapter(normalized);
  }

  isConfigured(providerId: string): boolean {
    return this.adapters.has(normalizeProviderId(providerId));
  }

  /** État sûr, sans credentials ni configuration secrète. */
  describe(): Array<{ providerId: string; configured: true }> {
    return [...this.adapters.keys()].sort().map(providerId => ({ providerId, configured: true }));
  }
}

/**
 * Composition locale/par défaut : seul TEST_GATEWAY est effectivement branché.
 * Un futur adaptateur officiel sera injecté explicitement à cet endroit, après
 * validation de ses contrats et secrets par l'exploitant.
 */
export function createPaymentProviderRegistry(
  configuredAdapters: readonly PaymentProviderAdapter[] = [],
): PaymentProviderRegistry {
  const adapters = new Map<string, PaymentProviderAdapter>();
  adapters.set('TEST_GATEWAY', createTestPaymentProviderAdapter());
  for (const adapter of configuredAdapters) {
    const providerId = normalizeProviderId(adapter.providerId);
    // L'injection explicite peut remplacer le TEST_GATEWAY déterministe par un
    // adapter de test contrôlé; les doublons entre adapters injectés sont refusés.
    if (adapters.has(providerId) && providerId !== 'TEST_GATEWAY') {
      throw new TypeError(`Deux adaptateurs injectés déclarent le fournisseur ${providerId}.`);
    }
    adapters.set(providerId, adapter);
  }
  return new PaymentProviderRegistry([...adapters.values()]);
}
