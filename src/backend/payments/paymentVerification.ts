/**
 * LE LABEUR — P0-PAY-2 — couche de VÉRIFICATION, FOURNISSEUR EXTERNE & RAPPROCHEMENT.
 *
 * Cette tranche prépare et implémente l'intégration d'un fournisseur de
 * paiement EXTERNE :
 *   PAIEMENT EXTERNE → WEBHOOK SÉCURISÉ → PENDING_VERIFICATION
 *                    → VÉRIFICATION / RÉCONCILIATION → VERIFIED → PAID
 *
 * Le paiement reste STRICTEMENT externe à LE LABEUR :
 *  - aucun système de paiement interne ;
 *  - aucun opérateur réel inventé (MTN/Orange/Moov/Wave restent NON IMPLÉMENTÉS
 *    tant qu'aucun credential/contrat officiel n'est fourni) ;
 *  - un adaptateur de test déterministe (`TEST_GATEWAY`) permet de tester
 *    l'intégralité du flux sans argent réel.
 */

import { PaymentLifecycleError } from './paymentErrors';
import {
  evaluateReconciliation,
  verifyPaymentDeclarationLocally,
  type NormalizedPaymentTransaction,
  type NormalizedReconciliationResult,
  type NormalizedVerificationResult,
  type NormalizedWebhookResult,
  type PaymentVerificationEvidence,
  type PaymentVerificationRequest,
  type PaymentVerificationResult,
  type ReconciliationVerdict,
} from '../../domain/paymentLifecycle';
import type { PaymentDeclarationRecord, PaymentRecord } from '../persistence/paymentRecords';

/** Ce qu'un service de vérification reçoit — exactement le contrat de l'ÉTAPE 8. */
export interface PaymentVerificationInput {
  payment: PaymentRecord;
  declaration: PaymentDeclarationRecord;
  /** Résolus depuis le contrat, jamais depuis la requête. */
  payer: string;
  recipient: string;
  checkedAt: string;
  /** Références déjà rejetées : la régularisation doit être une déclaration nouvelle. */
  previousReferences?: readonly string[];
}

/** Abstraction de la vérification (locale déterministe ou déléguée à un fournisseur). */
export interface PaymentVerificationService {
  readonly implementation: 'local-deterministic' | 'provider';
  verify(input: PaymentVerificationInput): Promise<PaymentVerificationResult>;
}

export type ReconciliationDecision =
  | { readonly kind: 'CONFIRMED'; readonly note: string; readonly reconciliation?: NormalizedReconciliationResult }
  | { readonly kind: 'NOT_CONFIRMED'; readonly reasons: readonly string[]; readonly reconciliation?: NormalizedReconciliationResult };

/** Rapprochement final (VERIFIED → PAID) : état métier, aucun débit. */
export interface PaymentReconciliationService {
  reconcile(input: {
    payment: PaymentRecord;
    declaration?: PaymentDeclarationRecord;
    reconciledAt: string;
  }): Promise<ReconciliationDecision>;
}

/** Entrée pour reconcile sur l'adaptateur de fournisseur. */
export type ProviderReconcileInput =
  | {
      payment: PaymentRecord;
      declaration?: PaymentDeclarationRecord;
      externalTransactionId?: string;
      asOf: string;
      isDuplicate?: boolean;
    }
  | {
      paymentId: string;
      asOf: string;
    };

/**
 * Stabilisation de l'abstraction `PaymentProviderAdapter` (ÉTAPE 2).
 * Modèle normalisé interne indépendant de tout format MTN/Orange/Moov/Wave.
 */
export interface PaymentProviderAdapter {
  readonly providerId: string;
  verifyTransaction(input: {
    externalTransactionId: string;
    reference?: string;
    amount?: number;
    currency?: string;
    payer?: string;
    recipient?: string;
    timestamp?: string;
  }): Promise<NormalizedVerificationResult>;

  handleWebhook(input: {
    signature: string;
    timestamp?: string | number;
    rawBody?: string;
    headers?: Record<string, string | undefined>;
    payload?: unknown;
  }): Promise<NormalizedWebhookResult>;

  reconcile(input: ProviderReconcileInput): Promise<NormalizedReconciliationResult>;
}

/** Injectrice de la frontière : chaque méthode refuse explicitement sans credentials. */
export function createUnconfiguredPaymentProviderAdapter(providerId: string): PaymentProviderAdapter {
  const refuse = (capability: string): never => {
    throw new PaymentLifecycleError(
      'NOT_IMPLEMENTED',
      `Aucun adaptateur de fournisseur n'est branché (« ${capability} » de ${providerId}) : `
      + 'le paiement réel appartient à l’étape suivante.',
    );
  };
  return {
    providerId,
    verifyTransaction: () => refuse('verifyTransaction'),
    handleWebhook: () => refuse('handleWebhook'),
    reconcile: () => refuse('reconcile'),
  };
}

/**
 * Comparaison de chaînes en temps constant pour éviter les attaques temporelles
 * sur les signatures de webhook.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Calcul HMAC-SHA256 déterministe via la Web Crypto API standard.
 */
export async function computeWebhookHmacSignature(
  rawBody: string,
  timestamp: number | string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = encoder.encode(`${timestamp}.${rawBody}`);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface TestPaymentProviderOptions {
  providerId?: string;
  secret?: string;
  toleranceMs?: number;
}

export interface TestPaymentProviderAdapter extends PaymentProviderAdapter {
  registerTransaction(transaction: NormalizedPaymentTransaction): void;
  clearTransactions(): void;
  getTransaction(externalTransactionId: string): NormalizedPaymentTransaction | undefined;
  createSignedWebhook(
    payload: Record<string, unknown>,
    timestamp?: number,
    secretOverride?: string,
  ): Promise<{
    signature: string;
    timestamp: string;
    rawBody: string;
    headers: Record<string, string>;
  }>;
}

export const DEFAULT_TEST_PROVIDER_SECRET = 'test_webhook_secret_key_le_labeur';
export const DEFAULT_WEBHOOK_TOLERANCE_MS = 300_000; // 5 minutes

/**
 * Fournisseur de test local/déterministe (ÉTAPE 3).
 * Permet de valider verifyTransaction, handleWebhook et reconcile sans
 * aucun mouvement de fonds réel ni credential de production.
 */
export function createTestPaymentProviderAdapter(
  options: TestPaymentProviderOptions = {},
): TestPaymentProviderAdapter {
  const providerId = options.providerId ?? 'TEST_GATEWAY';
  const secret = options.secret ?? DEFAULT_TEST_PROVIDER_SECRET;
  const toleranceMs = options.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS;

  const transactions = new Map<string, NormalizedPaymentTransaction>();

  const registerTransaction = (transaction: NormalizedPaymentTransaction): void => {
    transactions.set(transaction.externalTransactionId, transaction);
  };

  const clearTransactions = (): void => {
    transactions.clear();
  };

  const getTransaction = (externalTransactionId: string): NormalizedPaymentTransaction | undefined => {
    return transactions.get(externalTransactionId);
  };

  const createSignedWebhook = async (
    payload: Record<string, unknown>,
    timestamp: number = Date.now(),
    secretOverride?: string,
  ) => {
    const rawBody = JSON.stringify(payload);
    const tsStr = String(timestamp);
    const signature = await computeWebhookHmacSignature(rawBody, tsStr, secretOverride ?? secret);
    return {
      signature,
      timestamp: tsStr,
      rawBody,
      headers: {
        'content-type': 'application/json',
        'x-provider': providerId,
        'x-webhook-signature': signature,
        'x-webhook-timestamp': tsStr,
      },
    };
  };

  const verifyTransaction = async (input: {
    externalTransactionId: string;
    reference?: string;
    amount?: number;
    currency?: string;
    payer?: string;
    recipient?: string;
    timestamp?: string;
  }): Promise<NormalizedVerificationResult> => {
    const tx = transactions.get(input.externalTransactionId);
    if (!tx) {
      return {
        verified: false,
        provider: providerId,
        externalTransactionId: input.externalTransactionId,
        providerStatus: 'NOT_FOUND',
        reasons: [`Transaction « ${input.externalTransactionId} » introuvable chez le fournisseur ${providerId}.`],
      };
    }

    const reasons: string[] = [];
    if (input.reference && tx.reference !== input.reference) {
      reasons.push(`Référence discordante : attendue « ${input.reference} », trouvée « ${tx.reference} ».`);
    }
    if (input.amount !== undefined && tx.amount !== input.amount) {
      reasons.push(`Montant discordant : attendu ${input.amount}, trouvé ${tx.amount}.`);
    }
    if (input.currency && tx.currency.toUpperCase() !== input.currency.toUpperCase()) {
      reasons.push(`Devise discordante : attendue ${input.currency}, trouvée ${tx.currency}.`);
    }
    if (input.payer && tx.payer !== input.payer) {
      reasons.push(`Payeur discordant : attendu « ${input.payer} », trouvé « ${tx.payer} ».`);
    }
    if (input.recipient && tx.recipient !== input.recipient) {
      reasons.push(`Destinataire discordant : attendu « ${input.recipient} », trouvé « ${tx.recipient} ».`);
    }

    const verified = reasons.length === 0 && tx.status === 'SUCCESS';
    if (tx.status !== 'SUCCESS') {
      reasons.push(`Statut externe non concluant : « ${tx.status} ».`);
    }

    return {
      verified,
      provider: providerId,
      externalTransactionId: input.externalTransactionId,
      providerStatus: tx.status,
      transaction: tx,
      reasons,
      rawPayload: tx.rawPayload,
    };
  };

  const handleWebhook = async (input: {
    signature: string;
    timestamp?: string | number;
    rawBody?: string;
    headers?: Record<string, string | undefined>;
    payload?: unknown;
  }): Promise<NormalizedWebhookResult> => {
    const headers = input.headers ?? {};
    const signature = input.signature
      || headers['x-webhook-signature']
      || headers['x-signature']
      || '';
    const rawTimestamp = input.timestamp
      ?? headers['x-webhook-timestamp']
      ?? headers['x-timestamp']
      ?? '';
    const rawBody = input.rawBody ?? JSON.stringify(input.payload ?? {});

    // 1. Validation de la signature (présence)
    if (!signature) {
      throw new PaymentLifecycleError('UNAUTHENTICATED', 'Signature de webhook manquante.');
    }

    // 2. Validation de l'horodatage et protection anti-replay
    const timestampNumber = Number(rawTimestamp);
    if (!rawTimestamp || Number.isNaN(timestampNumber)) {
      throw new PaymentLifecycleError('VALIDATION', 'Horodatage du webhook manquant ou invalide.');
    }
    const now = Date.now();
    const drift = Math.abs(now - timestampNumber);
    if (drift > toleranceMs) {
      throw new PaymentLifecycleError(
        'VALIDATION',
        `Horodatage du webhook expiré ou hors fenêtre anti-replay (écart ${drift} ms > tolérance ${toleranceMs} ms).`,
      );
    }

    // 3. Validation cryptographique de la signature (timing-safe)
    const expectedSignature = await computeWebhookHmacSignature(rawBody, rawTimestamp, secret);
    if (!timingSafeEqualStrings(signature, expectedSignature)) {
      throw new PaymentLifecycleError('UNAUTHENTICATED', 'Signature de webhook invalide.');
    }

    // 3. Validation de la charge utile (payload)
    let payload = input.payload;
    if (!payload && input.rawBody) {
      try {
        payload = JSON.parse(input.rawBody);
      } catch {
        throw new PaymentLifecycleError('VALIDATION', 'Corps JSON du webhook illisible.');
      }
    }
    const body = (payload ?? {}) as Record<string, unknown>;

    const externalTransactionId = String(body.externalTransactionId ?? body.transactionId ?? '').trim();
    const reference = String(body.reference ?? '').trim();
    const amount = Number(body.amount);
    const currency = String(body.currency ?? '').trim();
    const payer = String(body.payer ?? '').trim();
    const recipient = String(body.recipient ?? '').trim();
    const eventType = String(body.eventType ?? body.event ?? 'PAYMENT_COMPLETED').trim();
    const declaredProvider = String(body.provider ?? providerId).trim();

    const missingFields: string[] = [];
    if (!externalTransactionId) missingFields.push('externalTransactionId');
    if (!reference) missingFields.push('reference');
    if (Number.isNaN(amount) || amount <= 0) missingFields.push('amount (doit être > 0)');
    if (!currency) missingFields.push('currency');
    if (!payer) missingFields.push('payer');
    if (!recipient) missingFields.push('recipient');
    if (!eventType) missingFields.push('eventType');

    if (missingFields.length > 0) {
      throw new PaymentLifecycleError(
        'VALIDATION',
        `Champs obligatoires manquants dans le webhook : ${missingFields.join(', ')}.`,
      );
    }

    const txStatus = (String(body.status ?? 'SUCCESS').toUpperCase() as NormalizedPaymentTransaction['status']);
    const occurredAt = typeof body.occurredAt === 'string' ? body.occurredAt : new Date(timestampNumber).toISOString();

    const normalizedTx: NormalizedPaymentTransaction = {
      provider: declaredProvider,
      externalTransactionId,
      reference,
      amount,
      currency,
      payer,
      recipient,
      occurredAt,
      rawPayload: body,
      status: txStatus,
    };

    // Auto-enregistrement déterministe dans le magasin de test
    transactions.set(externalTransactionId, normalizedTx);

    return {
      accepted: true,
      provider: declaredProvider,
      eventType,
      externalTransactionId,
      reference,
      amount,
      currency,
      payer,
      recipient,
      occurredAt,
      status: txStatus,
      transaction: normalizedTx,
      rawPayload: body,
      idempotencyKey: `${declaredProvider}:${externalTransactionId}:${eventType}`,
    };
  };

  const reconcile = async (input: ProviderReconcileInput): Promise<NormalizedReconciliationResult> => {
    const asOf = input.asOf;
    if ('payment' in input) {
      const { payment, declaration, externalTransactionId, isDuplicate } = input;
      const targetExtId = externalTransactionId
        ?? declaration?.externalTransactionId
        ?? payment.externalTransactionId;
      const targetRef = declaration?.reference ?? payment.reference;

      const externalTx = targetExtId
        ? transactions.get(targetExtId)
        : targetRef
          ? [...transactions.values()].find(t => t.reference === targetRef)
          : undefined;

      return evaluateReconciliation({
        expected: {
          paymentId: payment.paymentId,
          contractId: payment.contractId,
          paymentType: payment.paymentType,
          provider: payment.provider ?? declaration?.provider ?? providerId,
          externalTransactionId: targetExtId,
          reference: targetRef,
          amount: payment.amount,
          currency: payment.currency,
          payer: payment.employerId,
          recipient: payment.paymentType === 'PLATFORM_FEE' ? 'LE_LABEUR' : payment.candidateId,
          scheduledAt: payment.scheduledAt,
          dueAt: payment.dueAt,
          isDuplicate: isDuplicate ?? false,
        },
        actual: externalTx ?? null,
        reconciledAt: asOf,
      });
    }

    // Si seulement paymentId est fourni
    return evaluateReconciliation({
      expected: {
        paymentId: input.paymentId,
        amount: 0,
        currency: 'FCFA',
        payer: '',
        recipient: '',
      },
      actual: null,
      reconciledAt: asOf,
    });
  };

  return {
    providerId,
    registerTransaction,
    clearTransactions,
    getTransaction,
    createSignedWebhook,
    verifyTransaction,
    handleWebhook,
    reconcile,
  };
}

/** Vérification locale déterministe : la seule réellement branchée par défaut. */
export function createLocalPaymentVerificationService(): PaymentVerificationService {
  return {
    implementation: 'local-deterministic',
    async verify(input) {
      const evidence: PaymentVerificationEvidence = {
        reference: input.declaration.reference,
        amount: input.declaration.amount,
        currency: input.declaration.currency,
        payer: input.payer,
        recipient: input.recipient,
        timestamp: input.declaration.submittedAt,
        ...(input.declaration.provider !== undefined ? { provider: input.declaration.provider } : {}),
        ...(input.declaration.externalTransactionId !== undefined
          ? { externalTransactionId: input.declaration.externalTransactionId }
          : {}),
      };
      const request: PaymentVerificationRequest = {
        paymentId: input.payment.paymentId,
        contractId: input.payment.contractId,
        paymentType: input.payment.paymentType,
        expectedAmount: input.payment.amount,
        expectedCurrency: input.payment.currency,
        status: input.payment.status,
        evidence,
        previousReferences: input.previousReferences ?? [],
      };
      return verifyPaymentDeclarationLocally(request, input.checkedAt);
    },
  };
}

/**
 * Service de vérification branché sur un PaymentProviderAdapter (fournisseur de test).
 */
export function createProviderPaymentVerificationService(
  adapter: PaymentProviderAdapter,
): PaymentVerificationService {
  return {
    implementation: 'provider',
    async verify(input) {
      const extId = input.declaration.externalTransactionId ?? input.payment.externalTransactionId ?? '';
      const outcome = await adapter.verifyTransaction({
        externalTransactionId: extId,
        reference: input.declaration.reference,
        amount: input.declaration.amount,
        currency: input.declaration.currency,
        payer: input.payer,
        recipient: input.recipient,
        timestamp: input.declaration.submittedAt,
      });

      if (!outcome.verified) {
        return {
          verdict: 'MISMATCHED',
          reasons: outcome.reasons ?? [`Vérification fournisseur ${adapter.providerId} négative.`],
          checkedAt: input.checkedAt,
          source: `provider:${adapter.providerId}`,
        };
      }

      return {
        verdict: 'MATCHED',
        reasons: [],
        checkedAt: input.checkedAt,
        source: `provider:${adapter.providerId}`,
      };
    },
  };
}

/**
 * Rapprochement local déterministe.
 */
export function createLocalPaymentReconciliationService(): PaymentReconciliationService {
  return {
    async reconcile({ payment, declaration, reconciledAt }) {
      void reconciledAt;
      const reasons: string[] = [];
      if (payment.status !== 'VERIFIED') {
        reasons.push(`Le rapprochement exige un paiement vérifié : statut courant « ${payment.status} ».`);
      }
      if (!payment.verifiedAt) reasons.push('Aucune date de vérification persistée.');
      if (!declaration) reasons.push('Aucune tentative de déclaration à rapprocher.');
      if (declaration && declaration.outcome !== 'VERIFIED') {
        reasons.push(`La déclaration courante est « ${declaration.outcome} », non vérifiée.`);
      }
      if (declaration && !declaration.reference.trim()) {
        reasons.push('La déclaration rapprochée ne porte aucune référence de paiement.');
      }
      if (reasons.length > 0) return { kind: 'NOT_CONFIRMED', reasons };
      return {
        kind: 'CONFIRMED',
        note:
          `Rapprochement local déterministe : déclaration ${declaration?.declarationId ?? '—'} cohérente `
          + `avec l’échéance (${payment.amount} ${payment.currency}). Aucun mouvement de fonds réel.`,
      };
    },
  };
}

/**
 * Service de rapprochement délégué à un adaptateur de fournisseur (ÉTAPE 5).
 */
export function createProviderPaymentReconciliationService(
  adapter: PaymentProviderAdapter,
): PaymentReconciliationService {
  return {
    async reconcile({ payment, declaration, reconciledAt }) {
      const rec = await adapter.reconcile({
        payment,
        declaration,
        asOf: reconciledAt,
      });

      if (rec.verdict !== 'MATCH') {
        return {
          kind: 'NOT_CONFIRMED',
          reasons: rec.reasons.length > 0
            ? rec.reasons
            : [`Rapprochement ${adapter.providerId} non concluant (verdict : ${rec.verdict}).`],
          reconciliation: rec,
        };
      }

      return {
        kind: 'CONFIRMED',
        note:
          `Rapprochement externe ${adapter.providerId} confirmé (MATCH) pour le paiement ${payment.paymentId} `
          + `(${payment.amount} ${payment.currency}). Aucun mouvement de fonds réel.`,
        reconciliation: rec,
      };
    },
  };
}
