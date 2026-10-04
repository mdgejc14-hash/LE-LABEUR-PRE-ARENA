import type { GoogleIdPayload, UserProfile, UserRole } from '../types';
import type {
  ApplicationRepository,
  AuditLogRepository,
  AuthRepository,
  CallRepository,
  CommunicationTrackingRepository,
  ContractRepository,
  IncidentRepository,
  MessageRepository,
  NotificationRepository,
  OfferRepository,
  PaymentRepository,
  ReplacementRepository,
  ResourceRepository,
  UserRepository,
} from './interfaces';
import { mockService } from './mockRepository';

/** Stable UI/AppContext-facing ports implemented by the mock and API adapters. */
export type RepositoryBundle =
  & AuthRepository
  & UserRepository
  & OfferRepository
  & ApplicationRepository
  & ContractRepository
  & IncidentRepository
  & MessageRepository
  & PaymentRepository
  & NotificationRepository
  & ReplacementRepository
  & AuditLogRepository
  & CallRepository
  & CommunicationTrackingRepository
  & ResourceRepository;

export interface AppRepositoryBundle extends RepositoryBundle {
  /** Async session boundary; production resolves it from the server cookie. */
  getCurrentSession(): Promise<UserProfile | null>;
  /** Mock keeps its existing behavior; production sends credential to the Worker. */
  authenticateGoogleCredential(payload: GoogleIdPayload, requestedRole: UserRole): Promise<UserProfile>;
  registerGoogleCredential(payload: GoogleIdPayload, requestedRole: UserRole): Promise<UserProfile>;
}

export type RepositoryMode = 'mock' | 'api';

export interface RepositoryAdapters<T> {
  mock: T;
  /** API bundle is opt-in; missing API must not silently fall back to mock data. */
  api?: T;
}

export function selectRepositoryAdapter<T>(mode: RepositoryMode, adapters: RepositoryAdapters<T>): T {
  if (mode === 'mock') return adapters.mock;
  if (!adapters.api) throw new Error('API repository is not configured; refusing to fall back to mock data.');
  return adapters.api;
}

function createMockAppAdapter(): AppRepositoryBundle {
  return new Proxy(mockService as unknown as AppRepositoryBundle, {
    get(target, property, receiver) {
      if (property === 'getCurrentSession') return async () => mockService.getCurrentUser();
      if (property === 'authenticateGoogleCredential') {
        return async (payload: GoogleIdPayload, requestedRole: UserRole) => mockService.loginWithGoogle(payload.sub, requestedRole);
      }
      if (property === 'registerGoogleCredential') {
        return async (payload: GoogleIdPayload, requestedRole: UserRole) => mockService.registerWithGoogle({
          googleSub: payload.sub,
          email: payload.email,
          fullName: payload.name,
          role: requestedRole,
          avatarUrl: payload.picture,
        });
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(mockService) : Reflect.get(target, property, receiver);
    },
  });
}

let activeMode: RepositoryMode = 'mock';
let activeAdapter: AppRepositoryBundle = createMockAppAdapter();

/** Switch only at the composition root; production adapter remains opt-in. */
export function configureRepositoryAdapter(adapter: AppRepositoryBundle, mode: RepositoryMode): void {
  activeAdapter = adapter;
  activeMode = mode;
}

export function getRepositoryMode(): RepositoryMode {
  return activeMode;
}

export const appRepositories: AppRepositoryBundle = new Proxy({} as AppRepositoryBundle, {
  get(_target, property) {
    const value = Reflect.get(activeAdapter as object, property, activeAdapter);
    return typeof value === 'function' ? value.bind(activeAdapter) : value;
  },
  set(_target, property, value) {
    return Reflect.set(activeAdapter as object, property, value, activeAdapter);
  },
});

/** Testable composition helper; it never automatically enables the API adapter. */
export function createRepositoryComposition<T>(mode: RepositoryMode, adapters: RepositoryAdapters<T>): T {
  return selectRepositoryAdapter(mode, adapters);
}
