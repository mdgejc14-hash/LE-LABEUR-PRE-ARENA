/**
 * LE LABEUR — hydratation d'une session serveur déjà authentifiée.
 *
 * Règle : l'identité vient de la session serveur et n'est jamais annulée par
 * une lecture secondaire. Chaque lecture secondaire produit un statut explicite :
 *  - `ready`       : la lecture a réussi, les données sont celles du serveur ;
 *  - `unavailable` : le serveur répond 501 NOT_IMPLEMENTED (capacité non exposée) ;
 *  - `error`       : toute autre erreur technique (réseau, 5xx, 403…).
 *
 * Une liste vide n'est donc jamais présentée comme une donnée sûre quand la
 * lecture a échoué : le statut reste visible via `resourceStatuses`.
 * Aucune donnée fictive n'est produite ici.
 */

import type { AppRepositoryBundle } from '../repositories/provider';
import { ApiClientError } from '../repositories/apiClient';
import type { Application, Contract, Conversation, Offer, PaymentDeclaration, ResourceDocument, UserProfile } from '../types';

export type ResourceStatus =
  | { state: 'ready' }
  | { state: 'unavailable'; reason: string }
  | { state: 'error'; reason: string };

export type SessionResourceKey =
  | 'offers'
  | 'applications'
  | 'contracts'
  | 'conversations'
  | 'favorites'
  | 'candidates'
  | 'resources'
  | 'paymentDeclarations';

export interface SecondaryReadResult<T> {
  /** Données réelles uniquement quand `status.state === 'ready'`, sinon `null`. */
  data: T | null;
  status: ResourceStatus;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Erreur technique inconnue.';
}

/** Exécute une lecture secondaire sans jamais laisser son échec annuler la session. */
export async function readSecondaryResource<T>(load: () => Promise<T>): Promise<SecondaryReadResult<T>> {
  try {
    const data = await load();
    return { data, status: { state: 'ready' } };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 501) {
      return { data: null, status: { state: 'unavailable', reason: messageOf(error) } };
    }
    return { data: null, status: { state: 'error', reason: messageOf(error) } };
  }
}

/** Sous-ensemble des ports nécessaires à l'hydratation. */
export type SessionReadRepositories = Pick<
  AppRepositoryBundle,
  | 'getConversations'
  | 'getFavorites'
  | 'getAllOffers'
  | 'getApplicationsByCandidate'
  | 'getApplicationsByEmployer'
  | 'getAllApplications'
  | 'getContractsByUser'
  | 'getAllCandidates'
  | 'getResourceDocuments'
  | 'listEmployerPayments'
>;

export interface SessionHydrationResult {
  offers: Offer[];
  applications: Application[];
  contracts: Contract[];
  conversations: Conversation[];
  favorites: string[];
  candidates: UserProfile[];
  resources: ResourceDocument[];
  paymentDeclarations: PaymentDeclaration[];
  /** Statut de chaque ressource ; `data` absent d'une ressource non `ready`. */
  resourceStatuses: Record<SessionResourceKey, ResourceStatus>;
}

/**
 * Charge les ressources secondaires d'une session authentifiée.
 * Ne lève jamais pour une lecture secondaire : chaque échec est reporté dans `resourceStatuses`.
 */
export async function hydrateSessionResources(
  user: UserProfile,
  repos: SessionReadRepositories,
): Promise<SessionHydrationResult> {
  const applicationsRead = (): Promise<Application[]> => {
    if (user.role === 'ADMIN') return repos.getAllApplications(user.id);
    if (user.role === 'EMPLOYER') return repos.getApplicationsByEmployer(user.id);
    return repos.getApplicationsByCandidate(user.id);
  };
  const candidatesRead = (): Promise<UserProfile[]> =>
    ['EMPLOYER', 'ADMIN'].includes(user.role) ? repos.getAllCandidates() : Promise.resolve([]);
  const paymentsRead = (): Promise<PaymentDeclaration[]> =>
    user.role === 'EMPLOYER' ? repos.listEmployerPayments(user.id, user.id) : Promise.resolve([]);

  const [offers, applications, contracts, conversations, favorites, candidates, resources, payments] = await Promise.all([
    readSecondaryResource(() => repos.getAllOffers()),
    readSecondaryResource(applicationsRead),
    readSecondaryResource(() => repos.getContractsByUser(user.id, user.role)),
    readSecondaryResource(() => repos.getConversations(user.id)),
    readSecondaryResource(() => repos.getFavorites(user.id)),
    readSecondaryResource(candidatesRead),
    readSecondaryResource(() => repos.getResourceDocuments()),
    readSecondaryResource(paymentsRead),
  ]);

  return {
    offers: offers.data ?? [],
    applications: applications.data ?? [],
    contracts: contracts.data ?? [],
    conversations: conversations.data ?? [],
    favorites: favorites.data ?? [],
    candidates: candidates.data ?? [],
    resources: resources.data ?? [],
    paymentDeclarations: payments.data ?? [],
    resourceStatuses: {
      offers: offers.status,
      applications: applications.status,
      contracts: contracts.status,
      conversations: conversations.status,
      favorites: favorites.status,
      candidates: candidates.status,
      resources: resources.status,
      paymentDeclarations: payments.status,
    },
  };
}
