/**
 * LE LABEUR — P0-PAY-1 — erreur métier stable du cycle paiement.
 *
 * Comme `CoreStoreError` et `ContractAutomationError`, l'erreur ne porte aucun
 * secret : seul un code stable et un message lisible sortent du domaine. La
 * traduction HTTP est faite par le repository (`mapPaymentError`), jamais ici,
 * afin que le domaine reste indépendant du transport.
 */

export type PaymentLifecycleErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'BUSINESS_RULE'
  | 'CONFLICT'
  | 'IN_PROGRESS'
  | 'NOT_IMPLEMENTED'
  | 'UNAUTHENTICATED';

export class PaymentLifecycleError extends Error {
  constructor(
    readonly code: PaymentLifecycleErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'PaymentLifecycleError';
  }
}

/** Empreinte SHA-256 déterministe d'une charge utile (colonne `payload_hash`). */
export async function sha256Fingerprint(value: unknown): Promise<string> {
  const payload = JSON.stringify(value ?? null);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
