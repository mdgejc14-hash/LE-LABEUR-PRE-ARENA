/**
 * EMP-06 → EMP-09 — brouillon du parcours « nouvelle offre ».
 *
 * Aucun brouillon serveur n'existe (`POST /v1/missions/draft` absent) : le
 * brouillon vit uniquement en mémoire dans l'onglet. Il n'est jamais présenté
 * comme enregistré, et le parcours ne crée rien tant que l'employeur n'a pas
 * appelé la commande réelle `POST /offers`.
 */

import type { EmployerOfferDraft } from './api';

/** État de formulaire (valeurs de saisie, jamais un objet métier). */
export interface OfferDraft {
  title: string;
  contractType: string;
  summary: string;
  location: string;
  startDate: string;
  durationMonths: string;
  skills: string;
  conditions: string;
  responsibilities: string;
  remuneration: string;
  currency: string;
  isUrgent: boolean;
}

export const EMPTY_OFFER_DRAFT: OfferDraft = {
  title: '',
  contractType: '',
  summary: '',
  location: '',
  startDate: '',
  durationMonths: '',
  skills: '',
  conditions: '',
  responsibilities: '',
  remuneration: '',
  currency: 'FCFA',
  isUrgent: false,
};

let draft: OfferDraft = { ...EMPTY_OFFER_DRAFT };
const listeners = new Set<() => void>();

export function readOfferDraft(): OfferDraft {
  return draft;
}

export function updateOfferDraft(patch: Partial<OfferDraft>): OfferDraft {
  draft = { ...draft, ...patch };
  for (const listener of listeners) listener();
  return draft;
}

export function clearOfferDraft(): OfferDraft {
  draft = { ...EMPTY_OFFER_DRAFT };
  for (const listener of listeners) listener();
  return draft;
}

export function subscribeOfferDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Charge utile réelle de `POST /offers` : uniquement les champs acceptés par le
 * serveur (aucun champ possédé par le serveur). `null` si la saisie est
 * incomplète : l'écran le dit, il n'envoie pas une offre partielle.
 */
export function toOfferDraft(form: OfferDraft): EmployerOfferDraft | null {
  const remuneration = Number(form.remuneration);
  const durationMonths = Number(form.durationMonths);
  if (
    form.title.trim().length === 0 ||
    form.contractType.trim().length === 0 ||
    form.location.trim().length === 0 ||
    !Number.isFinite(remuneration) ||
    remuneration <= 0
  ) {
    return null;
  }
  return {
    title: form.title.trim(),
    contractType: form.contractType.trim(),
    remuneration,
    currency: form.currency.trim() || 'FCFA',
    location: form.location.trim(),
    summary: form.summary.trim(),
    skills: parseList(form.skills),
    conditions: parseList(form.conditions),
    responsibilities: parseList(form.responsibilities),
    selectionProcess: [],
    isUrgent: form.isUrgent,
    ...(form.startDate ? { startDate: form.startDate } : {}),
    ...(Number.isFinite(durationMonths) && durationMonths > 0 ? { durationMonths } : {}),
  };
}

/** Champs minimaux exigés par le serveur pour créer une offre réelle. */
export function offerDraftComplete(form: OfferDraft): boolean {
  return toOfferDraft(form) !== null;
}
