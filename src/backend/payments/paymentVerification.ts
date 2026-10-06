/**
 * LE LABEUR — P0-PAY-1 — couche de VÉRIFICATION / RAPPROCHEMENT.
 *
 * Cette tranche sépare strictement trois choses :
 *  1. la DÉCLARATION employeur (ÉTAPE 6) — un fait saisi, jamais une validation ;
 *  2. la VÉRIFICATION (ÉTAPE 8) — un rapprochement de la déclaration contre
 *     l'assiette connue (montant dû, devise, période, preuve) ;
 *  3. la CONSIDÉRATION « payé » (VERIFIED → PAID) — une décision de
 *     rapprochement, jamais un mouvement de fonds.
 *
 * AUCUN fournisseur n'est branché : ni MTN, ni Orange, ni Moov, ni Wave, ni
 * agrégateur, ni SMS Gateway, ni webhook. `PaymentProviderAdapter` est une
 * FRONTIÈRE déclarée dont la seule implémentation disponible est
 * `createUnconfiguredPaymentProviderAdapter()`, dont chaque méthode lève
 * `NOT_IMPLEMENTED`. Le service réellement injecté en P0-PAY-1 est la
 * vérification locale déterministe (`src/domain/paymentLifecycle.ts`
 * `verifyPaymentDeclarationLocally`), sans le moindre appel réseau.
 */

import { PaymentLifecycleError } from './paymentErrors';
import {
  verifyPaymentDeclarationLocally,
  type PaymentVerificationEvidence,
  type PaymentVerificationRequest,
  type PaymentVerificationResult,
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

/** Abstraction de la vérification (implémentation locale en P0-PAY-1). */
export interface PaymentVerificationService {
  readonly implementation: 'local-deterministic' | 'provider';
  verify(input: PaymentVerificationInput): Promise<PaymentVerificationResult>;
}

export type ReconciliationDecision =
  | { readonly kind: 'CONFIRMED'; readonly note: string }
  | { readonly kind: 'NOT_CONFIRMED'; readonly reasons: readonly string[] };

/** Rapprochement final (VERIFIED → PAID) : état métier, aucun débit. */
export interface PaymentReconciliationService {
  reconcile(input: {
    payment: PaymentRecord;
    declaration?: PaymentDeclarationRecord;
    reconciledAt: string;
  }): Promise<ReconciliationDecision>;
}

/**
 * Frontière du FUTUR paiement réel. Aucun adaptateur n'est enregistré ici :
 * `verifyTransaction`, `handleWebhook` et `reconcile` restent à implémenter,
 * derrière un secret et une vérification de signature.
 */
export interface PaymentProviderAdapter {
  readonly providerId: string;
  verifyTransaction(input: {
    externalTransactionId: string;
    reference: string;
    amount: number;
    currency: string;
    payer: string;
    recipient: string;
    timestamp: string;
  }): Promise<{ verified: boolean; providerStatus: string; raw?: unknown }>;
  handleWebhook(input: { signature: string; payload: unknown }): Promise<{ accepted: boolean; eventId?: string }>;
  reconcile(input: { paymentId: string; asOf: string }): Promise<ReconciliationDecision>;
}

/** Injectrice de la frontière : chaque méthode refuse, explicitement et sans appel. */
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

/** Vérification locale déterministe : la seule réellement branchée en P0-PAY-1. */
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
 * Rapprochement local : exige un paiement `VERIFIED` dont la tentative courante
 * est `VERIFIED` et porte une référence. Il ne consulte aucun fournisseur : la
 * décision est donc un état métier traçable, jamais une preuve d'encaissement.
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
