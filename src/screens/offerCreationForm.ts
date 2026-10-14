/**
 * LE LABEUR — création d'offre depuis les écrans employeur legacy (route « / »).
 *
 * Contrat : `POST /offers` (DTO `ServerCreateOfferInput`, backend P0-E1).
 *  - obligatoires : title, contractType, remuneration (nombre ≥ 0), location ;
 *  - optionnels : skills, summary, durationMonths (entier > 0), startDate ;
 *  - refusés (falsification) : id, status, role, permissions, source, employerId différent ;
 *  - le statut créé est fixé par le serveur (ACTIVE) : l'interface ne le choisit jamais.
 *
 * Rien n'est inventé : pas de conditions, responsabilités, durée ou employeur
 * par défaut. Un champ vide reste absent du payload.
 */

import type { Offer } from '../types';
import type { CreateOfferInput } from '../repositories/apiRepository';
import { ApiClientError } from '../repositories/apiClient';

export interface OfferFormValues {
  title: string;
  contractType: string;
  location: string;
  remuneration: string;
  skills: string;
  summary: string;
}

export type OfferFormField = keyof OfferFormValues;

export type OfferFormResult =
  | { ok: true; payload: CreateOfferInput }
  | { ok: false; errors: Partial<Record<OfferFormField, string>> };

const parseList = (raw: string): string[] =>
  raw.split(',').map(item => item.trim()).filter(Boolean);

/** Valide le formulaire et produit exactement le DTO attendu par `POST /offers`. */
export function buildOfferPayload(values: OfferFormValues): OfferFormResult {
  const errors: Partial<Record<OfferFormField, string>> = {};

  const title = values.title.trim();
  if (!title) errors.title = 'Le titre du poste est obligatoire.';

  const contractType = values.contractType.trim();
  if (!contractType) errors.contractType = 'Le type de contrat est obligatoire.';

  const location = values.location.trim();
  if (!location) errors.location = 'Le lieu de la mission est obligatoire.';

  const rawRemuneration = values.remuneration.trim();
  const remuneration = rawRemuneration === '' ? Number.NaN : Number(rawRemuneration);
  if (!Number.isFinite(remuneration) || remuneration < 0) {
    errors.remuneration = 'La rémunération doit être un nombre supérieur ou égal à zéro.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const summary = values.summary.trim();
  const payload: CreateOfferInput = {
    title,
    contractType,
    location,
    remuneration,
    currency: 'FCFA',
    isUrgent: false,
    skills: parseList(values.skills),
    summary,
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
  } as CreateOfferInput;
  return { ok: true, payload };
}

/**
 * Clé d'idempotence stable pour une même demande : une reprise après échec
 * réutilise la clé, une demande modifiée reçoit une nouvelle clé.
 */
export interface OfferAttemptTracker {
  keyFor(payload: CreateOfferInput): string;
  settle(): void;
}

export function createOfferAttemptTracker(newKey: () => string): OfferAttemptTracker {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(payload) {
      const fingerprint = JSON.stringify(payload);
      if (!current || current.fingerprint !== fingerprint) {
        current = { fingerprint, key: newKey() };
      }
      return current.key;
    },
    settle() {
      current = null;
    },
  };
}

/** Clé d'idempotence unique par tentative (fonctionne même sans `crypto.randomUUID`). */
export function newOfferIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `offer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Issue non connue (réseau coupé, 5xx) : le serveur a peut-être créé l'offre ;
 * la clé est conservée pour qu'une reprise ne crée pas de doublon.
 */
export function isUnknownOutcome(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    // 501 : route non exposée, aucune requête n'a créé quoi que ce soit.
    if (error.status === 501) return false;
    // Coupure réseau (status 0, NETWORK_ERROR), réponse illisible, ou 5xx.
    return error.status === 0 || error.status >= 500
      || error.code === 'NETWORK_ERROR' || error.code === 'INVALID_RESPONSE';
  }
  return true;
}

export function offerCreationErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 501) {
      return 'La création d’offre n’est pas encore disponible sur le serveur. Aucune offre n’a été créée.';
    }
    if (error.status === 400 || error.code === 'VALIDATION_ERROR') {
      return error.message || 'Certaines informations sont invalides. Corrigez-les puis réessayez.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'Votre session ne permet pas de publier cette offre. Reconnectez-vous puis réessayez.';
    }
    if (error.status === 409) {
      return 'Une demande identique est déjà en cours de traitement. Vérifiez vos offres avant de réessayer.';
    }
    if (error.status >= 500) {
      return 'Le serveur n’a pas confirmé la création. Réessayez : la même demande ne créera pas de doublon.';
    }
    return error.message || 'La création de l’offre a échoué.';
  }
  return 'Connexion impossible : la création n’a pas été confirmée. Réessayez : la même demande ne créera pas de doublon.';
}

export type OfferSubmissionOutcome =
  | { kind: 'invalid'; errors: Partial<Record<OfferFormField, string>> }
  | { kind: 'created'; offer: Offer }
  | { kind: 'failed'; message: string };

/**
 * Soumission complète : une création n'est confirmée que si le serveur renvoie
 * une offre identifiée. Toute autre issue reste un échec affiché à l'utilisateur.
 */
export async function submitOfferForm(
  values: OfferFormValues,
  tracker: OfferAttemptTracker,
  createOffer: (payload: CreateOfferInput, idempotencyKey: string) => Promise<Offer>,
): Promise<OfferSubmissionOutcome> {
  const result = buildOfferPayload(values);
  if (!result.ok) return { kind: 'invalid', errors: result.errors };
  try {
    const offer = await createOffer(result.payload, tracker.keyFor(result.payload));
    if (!offer || typeof offer.id !== 'string' || !offer.id) {
      return { kind: 'failed', message: 'Réponse du serveur incomplète : la création n’est pas confirmée.' };
    }
    tracker.settle();
    return { kind: 'created', offer };
  } catch (error) {
    if (!isUnknownOutcome(error)) tracker.settle();
    return { kind: 'failed', message: offerCreationErrorMessage(error) };
  }
}
