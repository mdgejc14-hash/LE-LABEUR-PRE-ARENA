/**
 * LE LABEUR — contrats de frontière backend production.
 *
 * Ces types ne remplacent pas le MockRepository et n'activent aucun backend.
 * Ils fixent uniquement les contrats attendus lorsque les repositories seront
 * branchés sur Cloudflare/API + base de données réelle.
 */

import type { UserRole } from '../types';

export interface ServerActor {
  /** Identité issue de la session authentifiée côté serveur. */
  id: string;
  role: UserRole;
}

export interface CursorPage<T> {
  items: T[];
  cursor: string | null;
  limit: number;
  hasMore: boolean;
}

export interface ProductionCommandContext {
  actor: ServerActor;
  /** Clé générée côté client pour rendre la commande rejouable sans double effet. */
  idempotencyKey: string;
}

export interface IdempotencyRecord<TResult = unknown> {
  key: string;
  actorId: string;
  command: string;
  status: 'PROCESSING' | 'COMPLETED';
  result?: TResult;
  createdAt: string;
  completedAt?: string;
}

export interface TransactionBoundary {
  /** Exécute une mutation multi-entités atomiquement côté base de données. */
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export interface OutboxEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface DueScheduleJob {
  scheduleId: string;
  contractId: string;
  monthNumber: number;
  dueAt: string;
}

/**
 * Point d'intégration J+3 : le worker backend consomme les échéances dues,
 * produit un événement idempotent, puis déclenche notification/audit et
 * l'éligibilité au blocage. Aucun scheduler frontend n'est défini ici.
 */
export interface ScheduleWorkerBoundary {
  processDueSchedule(job: DueScheduleJob): Promise<void>;
}
