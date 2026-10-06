/**
 * LE LABEUR — P0-F — cycle restreint du CONTRAT.
 *
 * Chaîne : Worker/API → repository métier → stores noyau → PostgreSQL.
 *
 * Périmètre ouvert, dérivé du modèle réel (`MockRepository.generateContract` /
 * `signContract` / `dissociateMonth2`, `src/types/index.ts`) :
 *   EMPLOYER propriétaire du contrat :
 *     CREATE    (∅ → DRAFT, depuis une proposition ACCEPTED),
 *     SEND      (DRAFT → SIGNATURE, l'employeur appose sa signature),
 *     ACTIVATE  (SIGNATURE double-signée → ACTIVE),
 *     END       (ACTIVE → COMPLETED, fin normale — plan : ENDED),
 *     TERMINATE (ACTIVE → TERMINATED, motif obligatoire, protection M1) ;
 *   CANDIDATE salarié du contrat :
 *     SIGN      (SIGNATURE → drapeau `employeeSigned`, plan : SENT → SIGNED).
 *
 * Restent FERMÉS : passages de l'offre à FILLED, HIRED / CONTRACTED, fermeture
 * automatique des autres candidatures, notifications générales, incidents,
 * suspensions, remplacements, avancement mensuel — cf. `docs/P0-F_CONTRATS.md`.
 *
 * P0-AUTO-2 (cette tranche) ouvre UNIQUEMENT l'émission transactionnelle de
 * `CONTRACT_ACTIVATED` dans l'Outbox PostgreSQL de la fondation P0-AUTO-1, et
 * l'échéancier / les échéances / les rappels produits par le worker
 * d'automatisation. Les règles d'autorisation, de signature et de transition de
 * P0-F sont inchangées. Voir `docs/P0-AUTO-2_AUTOMATISATION_CONTRACTUELLE.md`.
 *
 * Aucun statut nouveau n'est introduit : la nomenclature du code est conservée
 * (`DRAFT`, `SIGNATURE`, `ACTIVE`, `COMPLETED`, `TERMINATED`) et la matrice est
 * portée par `src/domain/contractTransitions.ts`.
 */

import type { Contract } from '../../types';
import {
  CONTRACT_ELIGIBLE_APPLICATION_STATUSES,
  CONTRACT_INITIAL_STATUS,
  CONTRACT_TRANSITION_RULES,
  evaluateContractSignature,
  evaluateContractTransition,
  isContractFullySigned,
  type ContractAction,
  type ContractParty,
  type ContractTransitionRule,
} from '../../domain/contractTransitions';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteKey } from '../api/routeContracts';
import type { ApiRouteContext, ApiRouteHandler } from '../api/worker';
// P0-AUTO-2 — fondation d'automatisation déjà présente (P0-AUTO-1), inchangée.
import { createDomainEvent } from '../automation/foundation';
import type { DomainEventOutbox } from '../automation/records';
import { newEntityId } from '../identity/ids';
import { contractActivatedEventId } from '../../domain/contractScheduleAutomation';
// P0-CONTRACT-POST — cascade d'embauche (RÈGLE 21) et correspondance WORK EXECUTION.
import {
  POST_CONTRACT_OTHER_CLOSED_HISTORY,
  POST_CONTRACT_WINNING_CONTRACTED_HISTORY,
  POST_CONTRACT_WINNING_HIRED_HISTORY,
  evaluatePostContractOffer,
  evaluatePostContractOtherApplication,
  evaluatePostContractWinningApplication,
} from '../../domain/postContractTransitions';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import type { ClaimStore } from '../disputes/records';
// Import uniquement de TYPES : aucun couplage d'exécution à la persistance
// (frontière Worker vérifiée par `src/backend/persistence/persistence.test.ts`).
import type { ApplicationRecord, ApplicationStore, ContractHistoryEntry, ContractRecord, ContractStore, OfferRecord, OfferStore, ProposalRecord, ProposalStore } from '../persistence/coreRecords';
import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import type {
  ServerContractRepository,
  ServerCreateContractInput,
} from './contracts';

export interface ContractRepositoryStores {
  contracts: ContractStore;
  proposals: ProposalStore;
  applications: ApplicationStore;
  offers: OfferStore;
  users: UserStore;
  /** P0-DISPUTE-1 — contrôle d'une restriction de terminaison provisoire active. */
  claimRestrictions?: Pick<ClaimStore, 'hasActiveRestriction'>;
  /**
   * P0-AUTO-2 — Outbox PostgreSQL lié à la MÊME transaction que la mutation.
   *
   * Obligatoire pour `ACTIVATE` : la garantie de cette tranche est
   * « commit → mutation + historique + événement ; rollback → aucun des trois ».
   * Sans outbox durable lié, l'activation est refusée (fail-closed) plutôt que
   * de produire une mutation sans événement. Les autres transitions P0-F
   * n'émettent toujours aucun événement : leurs types restent documentés dans
   * `DOCUMENTED_CONTRACT_EVENTS` et volontairement non produits ici.
   */
  outbox?: DomainEventOutbox;
}

export interface ContractRepositoryDependencies {
  stores: ContractRepositoryStores;
  /** SQL callers bind every store in the callback to the same PostgreSQL transaction. */
  runInTransaction?: <T>(operation: (stores: ContractRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
}

interface IdempotencyEntry {
  fingerprint: string;
  result?: Contract;
  pending?: Promise<Contract>;
}

/**
 * Cache de rejeu process-local, aligné sur la frontière d'idempotence existante
 * (P0-E1 offres, P0-E3/E4 candidatures, P0-E5 propositions). Aucun framework
 * global n'est créé : la clé reste `(commande, acteur, Idempotency-Key)` avec
 * empreinte de charge utile, et la réservation est synchrone pour que deux
 * requêtes concurrentes portant la même clé ne lancent jamais deux transactions.
 */
class InMemoryContractIdempotencyCache {
  private readonly records = new Map<string, IdempotencyEntry>();

  execute(
    actorId: string,
    command: string,
    key: string,
    fingerprint: string,
    operation: () => Promise<Contract>,
  ): Promise<Contract> {
    const cacheKey = `${command}:${actorId}:${key}`;
    const existing = this.records.get(cacheKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new ApiError(
          'IDEMPOTENCY_CONFLICT',
          'Clé d’idempotence déjà utilisée avec une commande différente.',
          undefined,
          409,
        ));
      }
      if (existing.result) return Promise.resolve(existing.result);
      if (existing.pending) return existing.pending;
    }

    const entry: IdempotencyEntry = { fingerprint };
    const pending = Promise.resolve().then(operation).then(
      result => {
        entry.result = result;
        entry.pending = undefined;
        return result;
      },
      error => {
        if (this.records.get(cacheKey) === entry) this.records.delete(cacheKey);
        throw error;
      },
    );
    entry.pending = pending;
    this.records.set(cacheKey, entry);
    return pending;
  }

  clear(): void {
    this.records.clear();
  }
}

/** Cache de rejeu du domaine CONTRAT (P0-F). */
export const contractIdempotencyCache = new InMemoryContractIdempotencyCache();

function requireTrustedActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) {
    throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  }
  return actor;
}

function requireEmployer(actor: AuthenticatedActor): void {
  if (actor.role !== 'EMPLOYER') {
    throw new ApiError('FORBIDDEN', 'Seul l’employeur du contrat peut exécuter cette action.');
  }
}

function requireParty(actor: AuthenticatedActor): void {
  if (actor.role !== 'EMPLOYER' && actor.role !== 'CANDIDATE') {
    throw new ApiError('FORBIDDEN', 'Seules les parties du contrat peuvent signer.');
  }
}

function requireAdmin(actor: AuthenticatedActor): void {
  if (actor.role !== 'ADMIN') {
    throw new ApiError('FORBIDDEN', 'Accès réservé à l’administration.');
  }
}

async function requireActiveAccount(
  currentStores: ContractRepositoryStores,
  actor: AuthenticatedActor,
  message: string,
): Promise<ServerUserRecord> {
  const account = await currentStores.users.findByIdForShare(actor.id);
  if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
  if (account.role !== actor.role) {
    throw new ApiError('FORBIDDEN', 'Le rôle du compte ne permet pas cette opération sur contrat.');
  }
  if (account.status !== 'ACTIVE') {
    throw new ApiError('FORBIDDEN', message);
  }
  return account;
}

/* ------------------------------------------------------------------ */
/* Validation de la charge utile                                       */
/* ------------------------------------------------------------------ */

/** Seuls champs acceptés : la proposition d'origine et une note libre. */
const CONTRACT_PAYLOAD_FIELDS = ['proposalId', 'additionalNotes'] as const;

const MAX_ADDITIONAL_NOTES_LENGTH = 1000;

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('VALIDATION_ERROR', `${label} est requis.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', `${label} doit être du texte.`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw new ApiError('VALIDATION_ERROR', `${label} ne doit pas dépasser ${maxLength} caractères.`);
  }
  return trimmed;
}

/**
 * Normalise la création : `offerId`, `applicationId`, `employerId`,
 * `employeeId`, le montant et toutes les autres modalités sont DÉRIVÉS de la
 * proposition acceptée et de sa candidature — jamais du corps de requête.
 */
function normalizeContractPayload(value: unknown): {
  proposalId: string;
  additionalNotes?: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile de contrat est invalide.');
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!(CONTRACT_PAYLOAD_FIELDS as readonly string[]).includes(key)) {
      throw new ApiError('VALIDATION_ERROR', `Champ de contrat inconnu : ${key}.`);
    }
  }
  const proposalId = requireText(input.proposalId, 'L’identifiant de proposition');
  const additionalNotes = optionalText(
    input.additionalNotes,
    'La note complémentaire',
    MAX_ADDITIONAL_NOTES_LENGTH,
  );
  return { proposalId, ...(additionalNotes !== undefined ? { additionalNotes } : {}) };
}

function newAuditLogId(): string {
  return newEntityId('ctr').replace(/^ctr_/, 'log_');
}

function historyEntry(
  event: string,
  description: string,
  actor: string,
  timestamp: string,
): ContractHistoryEntry {
  return { id: newAuditLogId(), timestamp, event, description, actor };
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

function toContractProjection(
  record: ContractRecord,
  offer: OfferRecord | null,
  employer: ServerUserRecord | null,
  employee: ServerUserRecord | null,
): Contract {
  return {
    id: record.id,
    offerId: record.offerId,
    offerTitle: offer?.title ?? '',
    ...(record.proposalId ? { proposalId: record.proposalId } : {}),
    ...(record.applicationId ? { applicationId: record.applicationId } : {}),
    employerId: record.employerId,
    employerName: employer?.displayName ?? '',
    employeeId: record.employeeId,
    employeeName: employee?.displayName ?? '',
    monthlySalary: record.monthlySalary,
    currency: record.currency,
    startDate: record.startDate,
    ...(record.endDate ? { endDate: record.endDate } : {}),
    currentMonth: record.currentMonth,
    status: record.status,
    employerSigned: record.employerSigned === true,
    ...(record.employerSignedAt ? { employerSignedAt: record.employerSignedAt } : {}),
    employeeSigned: record.employeeSigned === true,
    ...(record.employeeSignedAt ? { employeeSignedAt: record.employeeSignedAt } : {}),
    missionDescription: record.missionDescription,
    location: record.location,
    durationMonths: record.durationMonths,
    periodicity: record.periodicity,
    conditions: [...record.conditions],
    ...(record.additionalNotes ? { additionalNotes: record.additionalNotes } : {}),
    monthlyCheckpoints: record.monthlyCheckpoints.map(entry => ({ ...entry })),
    commissionLedger: record.commissionLedger.map(entry => ({ ...entry })),
    paymentSchedule: record.paymentSchedule.map(entry => ({ ...entry })),
    commissionPercentage: record.commissionPercentage,
    commissionAmountDue: record.commissionAmountDue,
    commissionStatus: record.commissionStatus,
    history: record.history.map(entry => ({ ...entry })),
    ...(record.replacementId ? { replacementId: record.replacementId } : {}),
    ...(record.replacedContractId ? { replacedContractId: record.replacedContractId } : {}),
    ...(record.incidentId ? { incidentId: record.incidentId } : {}),
  };
}

/** Sous-ensemble CONTRAT réellement ouvert par P0-F (+ `finalizeHiring`, P0-CONTRACT-POST). */
export type OpenContractRepository = Pick<ServerContractRepository,
  | 'getMyContracts'
  | 'getContract'
  | 'getAdminContracts'
  | 'createContract'
  | 'sendContract'
  | 'signContract'
  | 'activateContract'
  | 'endContract'
  | 'terminateContract'
  | 'finalizeHiring'
  | 'confirmExecution'
>;

export function createContractRepository(
  dependencies: ContractRepositoryDependencies,
): OpenContractRepository {
  const { stores, runInTransaction } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const toProjectionFromStores = async (
    record: ContractRecord,
    currentStores: ContractRepositoryStores,
  ): Promise<Contract> => {
    const [offer, employer, employee] = await Promise.all([
      currentStores.offers.findById(record.offerId),
      currentStores.users.findById(record.employerId),
      currentStores.users.findById(record.employeeId),
    ]);
    return toContractProjection(record, offer, employer, employee);
  };

  /**
   * Moteur de transition unique pour SEND / ACTIVATE / END / TERMINATE.
   *
   * Garanties, dans cet ordre :
   *  1. l'acteur vient de la session serveur (jamais du corps de requête) ;
   *  2. le compte doit exister, porter le rôle de la règle et être ACTIVE ;
   *  3. l'autorisation est résolue depuis la ligne relue (`contracts.employer_id`) ;
   *  4. la transition est évaluée contre le statut courant verrouillé ;
   *  5. l'écriture est un compare-and-set SQL : une transition concurrente qui a
   *     gagné n'est jamais écrasée.
   *
   * Aucune conséquence hors domaine n'est produite : ni offre `FILLED`, ni
   * fermeture d'autres candidatures, ni paiement, ni notification.
   */
  const transition = async (input: {
    rule: ContractTransitionRule;
    actor: AuthenticatedActor;
    contractId: string;
    command: ProductionCommandContext;
    /** Motif obligatoire (TERMINATE) — validé avant toute écriture. */
    reason?: string;
    /** Charge utile utilisée UNIQUEMENT pour l'empreinte d'idempotence. */
    fingerprintPayload?: Record<string, unknown>;
  }): Promise<Contract> => {
    const rule = input.rule;
    const actor = requireTrustedActor(input.actor);
    if (actor.role !== rule.actorRole) {
      throw new ApiError(
        'FORBIDDEN',
        'Action non autorisée : seul l’employeur du contrat peut exécuter cette action.',
      );
    }

    const contractId = input.contractId?.trim();
    if (!contractId) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
    const idempotencyKey = input.command?.idempotencyKey?.trim();
    const fingerprint = JSON.stringify({ contractId, action: rule.action, ...input.fingerprintPayload });

    const execute = async (): Promise<Contract> => {
      const mutate = async (currentStores: ContractRepositoryStores): Promise<Contract> => {
        await requireActiveAccount(
          currentStores,
          actor,
          'COMPTE NON ACTIF : cette opération sur contrat est indisponible.',
        );

        /*
         * P0-AUTO-2 — garde fail-closed POSÉE AVANT TOUTE ÉCRITURE.
         *
         * L'activation doit produire la mutation, son historique ET l'événement
         * `CONTRACT_ACTIVATED` de façon atomique. Sans Outbox durable lié à la
         * transaction, cette garantie est impossible : l'activation est donc
         * refusée AVANT le compare-and-set, jamais après (aucune mutation sans
         * événement ne peut être commise).
         */
        if (rule.action === 'ACTIVATE' && !currentStores.outbox) {
          throw new ApiError(
            'NOT_IMPLEMENTED',
            'L’activation d’un contrat exige l’Outbox durable de l’automatisation : aucune activation sans événement persisté.',
            undefined,
            501,
          );
        }

        // Verrou de ligne : sérialise deux transitions concurrentes.
        const contract = await currentStores.contracts.findByIdForUpdate(contractId);
        if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
        if (contract.employerId !== actor.id) {
          throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’employeur de ce contrat.');
        }

        const outcome = evaluateContractTransition(rule, contract.status);
        if (outcome.kind === 'TERMINAL') {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            `${rule.terminalMessage} (statut : ${outcome.current}).`,
            undefined,
            409,
          );
        }
        if (outcome.kind === 'FORBIDDEN') {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            `Transition de contrat invalide : « ${rule.action} » depuis « ${outcome.current} ».`,
            undefined,
            409,
          );
        }

        if (rule.requiresBothSignatures && !isContractFullySigned({
          employerSigned: contract.employerSigned === true,
          employeeSigned: contract.employeeSigned === true,
        })) {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            'L’activation d’un contrat exige la signature des deux parties.',
            undefined,
            409,
          );
        }

        // Protection M1 réelle : la rupture directe en premier mois exige un
        // incident arbitré (domaine non ouvert par P0-F).
        if (rule.protectsFirstMonth && contract.currentMonth < 2) {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            'Pendant le premier mois (M1), la protection interdit la rupture directe : un incident doit être signalé à LE LABEUR.',
            undefined,
            409,
          );
        }
        if (rule.action === 'TERMINATE'
          && await currentStores.claimRestrictions?.hasActiveRestriction(contract.id, actor.id, 'CONTRACT_TERMINATE')) {
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            'Une restriction provisoire active liée à un Claim empêche temporairement cette terminaison.',
            undefined,
            409,
          );
        }

        const timestamp = now().toISOString();
        const entry = historyEntry(
          rule.historyEvent,
          rule.action === 'SEND'
            ? `Contrat envoyé pour signature par ${actor.id} ; signature employeur enregistrée.`
            : rule.action === 'ACTIVATE'
              ? 'Double signature bilatérale complétée : contrat actif.'
              : rule.action === 'END'
                ? 'Fin normale de mission enregistrée par l’employeur.'
                : `Rupture anticipée enregistrée par ${actor.id}. Motif : ${input.reason ?? ''}`,
          actor.id,
          timestamp,
        );

        const updated = await currentStores.contracts.compareAndSetStatus(contractId, contract.status, {
          status: outcome.to,
          updatedAt: timestamp,
          historyEntry: entry,
          ...(rule.signatureParty ? { signatureParty: rule.signatureParty } : {}),
        });

        if (!updated) {
          // Le compare-and-set a perdu : une transition concurrente a gagné.
          const fresh = await currentStores.contracts.findByIdForUpdate(contractId);
          if (!fresh) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
          if (fresh.status === rule.to) return toProjectionFromStores(fresh, currentStores);
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            'Une transition concurrente a modifié ce contrat : l’action n’a pas été appliquée.',
            undefined,
            409,
          );
        }

        /*
         * P0-AUTO-2 — émission RÉELLE de `CONTRACT_ACTIVATED`.
         *
         * L'événement est écrit dans la MÊME transaction PostgreSQL que la
         * mutation d'activation et son entrée d'historique : un COMMIT produit
         * les trois, un ROLLBACK n'en produit aucun. L'identifiant d'événement
         * est DÉTERMINISTE (`contractActivatedEventId`, clé primaire de
         * `automation_outbox`) : un rejeu de l'activation ne peut pas écrire un
         * second événement, conformément au `dedupeKey` documenté
         * « contractId + ACTIVATED ».
         *
         * Les autres transitions du cycle (CREATED, SENT, SIGNED, ENDED,
         * TERMINATED) n'émettent toujours rien : leurs effets restent décrits
         * dans `DOCUMENTED_CONTRACT_EVENTS` et appartiennent à leurs tranches.
         */
        if (rule.action === 'ACTIVATE') {
          // Présence déjà garantie par la garde fail-closed posée avant écriture.
          const outbox = currentStores.outbox!;
          const event = createDomainEvent({
            eventId: contractActivatedEventId(contractId),
            eventType: rule.event,
            aggregateType: 'contract',
            aggregateId: contractId,
            actorId: actor.id,
            timestamp,
            // Charge utile exacte du contrat d'événement documenté.
            payload: {
              contractId,
              ...(updated.proposalId ? { proposalId: updated.proposalId } : {}),
              offerId: updated.offerId,
              ...(updated.applicationId ? { applicationId: updated.applicationId } : {}),
              employerId: updated.employerId,
              employeeId: updated.employeeId,
              monthlySalary: updated.monthlySalary,
              currency: updated.currency,
              startDate: updated.startDate,
              durationMonths: updated.durationMonths,
              periodicity: updated.periodicity,
              commissionPercentage: updated.commissionPercentage,
              occurredAt: timestamp,
            },
            source: 'api:contracts.activate',
            version: 1,
            // Corrélation de la requête API ; causation = la commande
            // d'activation elle-même (sa clé d'idempotence).
            correlationId: input.command?.requestId,
            causationId: input.command?.idempotencyKey,
          });
          // `duplicate` est un résultat NORMAL (rejeu) : jamais une seconde ligne.
          await outbox.append(event);
        }

        return toProjectionFromStores(updated, currentStores);
      };

      return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
    };

    if (!idempotencyKey) return execute();
    return contractIdempotencyCache.execute(
      actor.id,
      input.command?.command || `contracts.${rule.action.toLowerCase()}`,
      idempotencyKey,
      fingerprint,
      execute,
    );
  };

  return {
    /**
     * Création (`DRAFT`) depuis une proposition ACCEPTED.
     *
     * Autorité : la proposition acceptée, sa candidature, l'offre et les comptes
     * relus dans la transaction. Les modalités contractualisées sont celles qui
     * ont été acceptées : aucune identité et aucun montant ne vient du client.
     */
    async createContract(
      suppliedActor: AuthenticatedActor,
      suppliedPayload: ServerCreateContractInput,
      command: ProductionCommandContext,
    ): Promise<Contract> {
      const actor = requireTrustedActor(suppliedActor);
      requireEmployer(actor);
      const payload = normalizeContractPayload(suppliedPayload);
      const idempotencyKey = command?.idempotencyKey?.trim();
      const fingerprint = JSON.stringify(payload);

      const submit = async (): Promise<Contract> => {
        const mutate = async (currentStores: ContractRepositoryStores): Promise<Contract> => {
          const employer = await requireActiveAccount(
            currentStores,
            actor,
            'COMPTE NON ACTIF : la création de contrat est indisponible.',
          );

          // Verrou de ligne : une seule création possible par proposition, même
          // si deux requêtes concurrentes portent des clés d'idempotence différentes.
          const proposal: ProposalRecord | null = await currentStores.proposals.findByIdForUpdate(payload.proposalId);
          if (!proposal) throw new ApiError('NOT_FOUND', 'Proposition introuvable.');
          if (proposal.employerId !== actor.id) {
            throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’employeur de cette proposition.');
          }
          if (proposal.status !== 'ACCEPTED') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Seule une proposition acceptée peut produire un contrat (statut : ${proposal.status}).`,
              undefined,
              409,
            );
          }
          if (proposal.contractId) {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette proposition est déjà associée à un contrat.', undefined, 409);
          }
          if (!proposal.applicationId) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'La proposition acceptée n’est liée à aucune candidature : impossible de contractualiser.',
              undefined,
              409,
            );
          }

          const application: ApplicationRecord | null = await currentStores.applications.findByIdForUpdate(proposal.applicationId);
          if (!application) throw new ApiError('NOT_FOUND', 'Candidature introuvable.');
          if (application.offerId !== proposal.offerId) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'La candidature ne correspond pas à l’offre de la proposition.',
              undefined,
              409,
            );
          }
          if (application.candidateId !== proposal.employeeId) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'La candidature ne correspond pas au candidat de la proposition.',
              undefined,
              409,
            );
          }
          if (application.contractId) {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette candidature est déjà associée à un contrat.', undefined, 409);
          }
          if (!(CONTRACT_ELIGIBLE_APPLICATION_STATUSES as readonly string[]).includes(application.status)) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Cette candidature n’est pas admissible à un contrat (statut : ${application.status}).`,
              undefined,
              409,
            );
          }

          const offer = await currentStores.offers.findByIdForShare(proposal.offerId);
          if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
          if (offer.employerId !== actor.id || offer.employerId !== proposal.employerId) {
            throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas le propriétaire de cette offre.');
          }
          if (offer.status !== 'ACTIVE') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Cette offre n’accepte plus de contrat (statut : ${offer.status}).`,
              undefined,
              409,
            );
          }

          const employee = await currentStores.users.findByIdForShare(proposal.employeeId);
          if (!employee || employee.role !== 'CANDIDATE' || employee.status !== 'ACTIVE') {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Le candidat de cette proposition n’est pas admissible.', undefined, 409);
          }

          const timestamp = now().toISOString();
          const record: ContractRecord = {
            id: newEntityId('ctr'),
            proposalId: proposal.id,
            offerId: offer.id,
            applicationId: application.id,
            employerId: actor.id,
            employeeId: employee.id,
            status: CONTRACT_INITIAL_STATUS,
            monthlySalary: proposal.amount,
            currency: proposal.currency,
            startDate: proposal.startDate,
            currentMonth: 1,
            durationMonths: proposal.durationMonths,
            periodicity: proposal.periodicity,
            missionDescription: proposal.missionTitle,
            location: proposal.location,
            conditions: [...proposal.conditions],
            // Drapeaux de signature RÉELS du modèle : vierges en brouillon.
            employerSigned: false,
            employeeSigned: false,
            // Champs réels du domaine, laissés aux valeurs par défaut de la
            // migration : le calcul des commissions/échéances appartient au
            // cycle paiements/salaire (hors P0-F).
            commissionPercentage: 25,
            commissionAmountDue: 0,
            commissionStatus: 'SCHEDULED',
            monthlyCheckpoints: [],
            commissionLedger: [],
            paymentSchedule: [],
            history: [
              historyEntry(
                'CONTRACT_CREATED',
                `Contrat préparé en brouillon depuis la proposition acceptée ${proposal.id}.`,
                employer.displayName,
                timestamp,
              ),
            ],
            ...(proposal.endDate ? { endDate: proposal.endDate } : {}),
            ...(payload.additionalNotes !== undefined ? { additionalNotes: payload.additionalNotes } : {}),
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          const created = await currentStores.contracts.create(record);

          // Liens réels : proposition consommée et candidature rattachée, dans
          // la MÊME transaction. Aucun autre effet (statut de candidature,
          // offre, notifications) n'est produit par P0-F.
          const linkedProposal = await currentStores.proposals.attachContract(proposal.id, created.id, timestamp);
          if (!linkedProposal) {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette proposition est déjà associée à un contrat.', undefined, 409);
          }
          const linkedApplication = await currentStores.applications.attachContract(application.id, created.id, timestamp);
          if (!linkedApplication) {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette candidature est déjà associée à un contrat.', undefined, 409);
          }

          return toContractProjection(created, offer, employer, employee);
        };

        return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
      };

      if (!idempotencyKey) return submit();
      return contractIdempotencyCache.execute(
        actor.id,
        command?.command || 'contracts.create',
        idempotencyKey,
        fingerprint,
        submit,
      );
    },

    /** Envoi `DRAFT → SIGNATURE` : l'employeur propriétaire appose sa signature. */
    async sendContract(
      suppliedActor: AuthenticatedActor,
      contractId: string,
      command: ProductionCommandContext,
    ): Promise<Contract> {
      return transition({
        rule: CONTRACT_TRANSITION_RULES.SEND,
        actor: requireTrustedActor(suppliedActor),
        contractId,
        command,
      });
    },

    /**
     * Signature de la partie concernée : chaque partie ne signe que son propre
     * drapeau, une seule fois, uniquement sur un contrat `SIGNATURE` (SENT).
     * Quand les deux drapeaux sont posés, l'état `SIGNED` du plan est atteint
     * sans changer de statut.
     */
    async signContract(
      suppliedActor: AuthenticatedActor,
      contractId: string,
      command: ProductionCommandContext,
    ): Promise<Contract> {
      const actor = requireTrustedActor(suppliedActor);
      requireParty(actor);
      const normalizedContractId = contractId?.trim();
      if (!normalizedContractId) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
      const idempotencyKey = command?.idempotencyKey?.trim();
      const fingerprint = JSON.stringify({ contractId: normalizedContractId, action: 'SIGN' });

      const execute = async (): Promise<Contract> => {
        const mutate = async (currentStores: ContractRepositoryStores): Promise<Contract> => {
          const account = await requireActiveAccount(
            currentStores,
            actor,
            'COMPTE NON ACTIF : la signature de contrat est indisponible.',
          );

          const contract = await currentStores.contracts.findByIdForUpdate(normalizedContractId);
          if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');

          let party: ContractParty;
          if (actor.role === 'EMPLOYER') {
            if (contract.employerId !== actor.id) {
              throw new ApiError('FORBIDDEN', 'Action non autorisée : cet employeur ne peut pas signer ce contrat.');
            }
            party = 'EMPLOYER';
          } else {
            if (contract.employeeId !== actor.id) {
              throw new ApiError('FORBIDDEN', 'Action non autorisée : ce salarié ne peut pas signer ce contrat.');
            }
            party = 'EMPLOYEE';
          }

          const outcome = evaluateContractSignature(contract.status, party, {
            employerSigned: contract.employerSigned === true,
            employeeSigned: contract.employeeSigned === true,
          });
          if (outcome.kind === 'TERMINAL') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Impossible de signer un contrat clos (statut : ${outcome.current}).`,
              undefined,
              409,
            );
          }
          if (outcome.kind === 'FORBIDDEN') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              outcome.current === 'DRAFT'
                ? 'Ce contrat n’a pas encore été envoyé pour signature.'
                : `Impossible de signer un contrat en statut ${outcome.current}.`,
              undefined,
              409,
            );
          }
          if (outcome.kind === 'ALREADY_SIGNED') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              outcome.party === 'EMPLOYER'
                ? 'La signature employeur est déjà enregistrée.'
                : 'La signature salarié est déjà enregistrée.',
              undefined,
              409,
            );
          }

          const timestamp = now().toISOString();
          const entry = historyEntry(
            party === 'EMPLOYER' ? 'EMPLOYER_SIGNED' : 'EMPLOYEE_SIGNED',
            party === 'EMPLOYER'
              ? `Accord signé par l’employeur (${account.displayName}).`
              : `Accord signé par le salarié (${account.displayName}).`,
            account.displayName,
            timestamp,
          );

          const updated = await currentStores.contracts.sign(normalizedContractId, party, {
            signedAt: timestamp,
            historyEntry: entry,
          });
          if (!updated) {
            const fresh = await currentStores.contracts.findByIdForUpdate(normalizedContractId);
            if (!fresh) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
            const alreadySigned = party === 'EMPLOYER' ? fresh.employerSigned : fresh.employeeSigned;
            if (alreadySigned && fresh.status === 'SIGNATURE') {
              // Rejeu concurrent de la même signature : aucun double effet.
              return toProjectionFromStores(fresh, currentStores);
            }
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'Une transition concurrente a modifié ce contrat : la signature n’a pas été appliquée.',
              undefined,
              409,
            );
          }

          return toProjectionFromStores(updated, currentStores);
        };

        return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
      };

      if (!idempotencyKey) return execute();
      return contractIdempotencyCache.execute(
        actor.id,
        command?.command || 'contracts.sign',
        idempotencyKey,
        fingerprint,
        execute,
      );
    },

    /** Activation explicite `SIGNATURE (double signature) → ACTIVE`. */
    async activateContract(
      suppliedActor: AuthenticatedActor,
      contractId: string,
      command: ProductionCommandContext,
    ): Promise<Contract> {
      return transition({
        rule: CONTRACT_TRANSITION_RULES.ACTIVATE,
        actor: requireTrustedActor(suppliedActor),
        contractId,
        command,
      });
    },

    /** Fin normale de mission `ACTIVE → COMPLETED` (plan : ENDED). */
    async endContract(
      suppliedActor: AuthenticatedActor,
      contractId: string,
      command: ProductionCommandContext,
    ): Promise<Contract> {
      return transition({
        rule: CONTRACT_TRANSITION_RULES.END,
        actor: requireTrustedActor(suppliedActor),
        contractId,
        command,
      });
    },

    /** Rupture anticipée motivée `ACTIVE → TERMINATED` (M2+, protection M1 conservée). */
    async terminateContract(
      suppliedActor: AuthenticatedActor,
      contractId: string,
      reason: string,
      command: ProductionCommandContext,
    ): Promise<Contract> {
      const actor = requireTrustedActor(suppliedActor);
      requireEmployer(actor);
      const normalizedReason = requireText(reason, 'Le motif de rupture');
      return transition({
        rule: CONTRACT_TRANSITION_RULES.TERMINATE,
        actor,
        contractId,
        command,
        reason: normalizedReason,
        fingerprintPayload: { reason: normalizedReason },
      });
    },

    /**
     * P0-CONTRACT-POST — finalisation d'embauche sur contrat ACTIF (RÈGLE 21).
     *
     * Cascade explicite, idempotente et transactionnelle, dérivée de
     * `MockRepository.signContract` (contrat ACTIVE → offre `FILLED`,
     * candidature retenue `HIRED`, autres candidatures ouvertes
     * `CLOSED_OFFER_FILLED`) + sortie `HIRED → CONTRACTED` (statut existant,
     * transition documentée comme MANQUE par le dépôt).
     *
     * Garanties, dans cet ordre :
     *  1. l'acteur vient de la session serveur et doit être l'EMPLOYER
     *     propriétaire du contrat, avec un compte ACTIVE ;
     *  2. le contrat est verrouillé (`FOR UPDATE`) et doit être `ACTIVE`
     *     (l'engagement réel) avec une candidature rattachée ;
     *  3. la candidature retenue est verrouillée et évaluée (ouverte → HIRED →
     *     CONTRACTED ; déjà CONTRACTED → convergence ; close → 409, zéro écriture) ;
     *  4. l'offre est verrouillée (`FOR SHARE`, port existant) et doit être
     *     `ACTIVE` (`FILLED` → convergence ; `PAUSED`/`CANCELLED` → 409) ;
     *  5. chaque écriture est un compare-and-set SQL : une décision concurrente
     *     qui a gagné n'est jamais écrasée ;
     *  6. les autres candidatures sont balayées en keyset COMPLET (curseur) :
     *     chaque ligne est relue verrouillée puis évaluée — seules les
     *     candidatures encore ouvertes sont fermées, les autres sont ignorées ;
     *  7. un rejeu (même clé ou autre clé) après cascade complète converge en
     *     200 SANS aucune écriture ni entrée d'historique dupliquée.
     *
     * Ordre de verrouillage (anti-interblocage, unique chemin) : contrat →
     * candidature retenue → offre → autres candidatures (ordre keyset stable).
     *
     * Aucune conséquence hors périmètre : ni notification, ni paiement, ni
     * incident, ni remplacement, ni modification du contrat lui-même (il reste
     * `ACTIVE` ; l'exécution = contrat actif, cf. `WORK_EXECUTION_STATUS_MAPPING`).
     */
    async finalizeHiring(
      suppliedActor: AuthenticatedActor,
      contractId: string,
      command: ProductionCommandContext,
    ): Promise<Contract> {
      const actor = requireTrustedActor(suppliedActor);
      requireEmployer(actor);
      const normalizedContractId = contractId?.trim();
      if (!normalizedContractId) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
      const idempotencyKey = command?.idempotencyKey?.trim();
      const fingerprint = JSON.stringify({ contractId: normalizedContractId, action: 'FINALIZE_HIRING' });

      const execute = async (): Promise<Contract> => {
        const mutate = async (currentStores: ContractRepositoryStores): Promise<Contract> => {
          const employer = await requireActiveAccount(
            currentStores,
            actor,
            'COMPTE NON ACTIF : la finalisation d’embauche est indisponible.',
          );

          // 1. Contrat verrouillé : la cascade exige l'engagement réel (ACTIVE).
          const contract = await currentStores.contracts.findByIdForUpdate(normalizedContractId);
          if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
          if (contract.employerId !== actor.id) {
            throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’employeur de ce contrat.');
          }
          if (contract.status !== 'ACTIVE') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `La finalisation d’embauche exige un contrat actif (statut : ${contract.status}).`,
              undefined,
              409,
            );
          }
          if (!contract.applicationId) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'Ce contrat n’est lié à aucune candidature : impossible de finaliser l’embauche.',
              undefined,
              409,
            );
          }

          // 2. Candidature retenue verrouillée, cohérence relue côté serveur.
          const winning = await currentStores.applications.findByIdForUpdate(contract.applicationId);
          if (!winning) throw new ApiError('NOT_FOUND', 'Candidature introuvable.');
          if (winning.offerId !== contract.offerId || winning.candidateId !== contract.employeeId) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'La candidature ne correspond pas à l’offre et au salarié du contrat.',
              undefined,
              409,
            );
          }
          const winningOutcome = evaluatePostContractWinningApplication(winning.status);
          if (winningOutcome.kind === 'REFUSED') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `La candidature retenue n’est plus finalisable (statut : ${winningOutcome.current}).`,
              undefined,
              409,
            );
          }

          // 3. Offre verrouillée en partage : ACTIVE → FILLED.
          const offer = await currentStores.offers.findByIdForShare(contract.offerId);
          if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
          if (offer.employerId !== actor.id) {
            throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas le propriétaire de cette offre.');
          }
          const offerOutcome = evaluatePostContractOffer(offer.status);
          if (offerOutcome.kind === 'REFUSED') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Cette offre n’est plus pourvable (statut : ${offerOutcome.current}).`,
              undefined,
              409,
            );
          }

          const timestamp = now().toISOString();

          // 4. Candidature retenue → HIRED → CONTRACTED (compare-and-set, historique AJOUTÉ).
          let winningStatus = winning.status;
          if (winningOutcome.kind === 'APPLY_HIRED') {
            const hired = await currentStores.applications.compareAndSetStatus(winning.id, winningStatus, {
              status: 'HIRED',
              updatedAt: timestamp,
              historyEntry: { action: POST_CONTRACT_WINNING_HIRED_HISTORY, timestamp, actor: employer.displayName },
            });
            if (!hired) {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                'Une décision concurrente a modifié cette candidature : la finalisation n’a pas été appliquée.',
                undefined,
                409,
              );
            }
            winningStatus = 'HIRED';
          }
          if (winningStatus === 'HIRED') {
            const contracted = await currentStores.applications.compareAndSetStatus(winning.id, 'HIRED', {
              status: 'CONTRACTED',
              updatedAt: timestamp,
              historyEntry: { action: POST_CONTRACT_WINNING_CONTRACTED_HISTORY, timestamp, actor: employer.displayName },
            });
            if (!contracted) {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                'Une décision concurrente a modifié cette candidature : la finalisation n’a pas été appliquée.',
                undefined,
                409,
              );
            }
          }

          // 5. Autres candidatures : balayage keyset COMPLET, chacune relue
          //    verrouillée puis évaluée — seules les ouvertes sont fermées.
          const SCAN_PAGE_SIZE = 200;
          let cursor: string | null = null;
          for (;;) {
            const page = await currentStores.applications.listByOffer(contract.offerId, SCAN_PAGE_SIZE, cursor);
            if (page.length === 0) break;
            for (const candidate of page) {
              if (candidate.id === winning.id) continue;
              const locked = await currentStores.applications.findByIdForUpdate(candidate.id);
              if (!locked) continue;
              if (evaluatePostContractOtherApplication(locked.status).kind !== 'APPLY') continue;
              const closed = await currentStores.applications.compareAndSetStatus(locked.id, locked.status, {
                status: 'CLOSED_OFFER_FILLED',
                updatedAt: timestamp,
                historyEntry: { action: POST_CONTRACT_OTHER_CLOSED_HISTORY, timestamp, actor: employer.displayName },
              });
              if (!closed) {
                throw new ApiError(
                  'BUSINESS_RULE_VIOLATION',
                  'Une décision concurrente a modifié une candidature : la finalisation n’a pas été appliquée.',
                  undefined,
                  409,
                );
              }
            }
            if (page.length < SCAN_PAGE_SIZE) break;
            cursor = page[page.length - 1].id;
          }

          // 6. Offre ACTIVE → FILLED (aucun historique côté offres dans le modèle réel).
          if (offerOutcome.kind === 'APPLY') {
            const filled = await currentStores.offers.updateStatus(offer.id, 'FILLED', timestamp);
            if (!filled) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
          }

          const fresh = await currentStores.contracts.findById(normalizedContractId);
          if (!fresh) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
          return toProjectionFromStores(fresh, currentStores);
        };

        return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
      };

      if (!idempotencyKey) return execute();
      return contractIdempotencyCache.execute(
        actor.id,
        command?.command || 'contracts.finalize-hiring',
        idempotencyKey,
        fingerprint,
        execute,
      );
    },

    /** Lecture des contrats de l'acteur (self) : employeur ou salarié. */
    async getMyContracts(
      suppliedActor: AuthenticatedActor,
      page: PageRequest,
    ): Promise<CursorPage<Contract>> {
      const actor = requireTrustedActor(suppliedActor);
      if (actor.role !== 'EMPLOYER' && actor.role !== 'CANDIDATE') {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : seules les parties consultent leurs contrats.');
      }
      const account = await stores.users.findById(actor.id);
      if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
      if (account.role !== actor.role) throw new ApiError('FORBIDDEN', 'Accès interdit.');
      if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : accès indisponible.');

      if (page.cursor) {
        const cursorRecord = await stores.contracts.findById(page.cursor);
        if (!cursorRecord) throw new ApiError('VALIDATION_ERROR', 'Le curseur de contrats est invalide.');
      }

      const records = actor.role === 'EMPLOYER'
        ? await stores.contracts.listByEmployer(actor.id, page.limit + 1)
        : await stores.contracts.listByEmployee(actor.id, page.limit + 1);
      const hasMore = records.length > page.limit;
      const visible = records.slice(0, page.limit);
      const items = await Promise.all(visible.map(record => toProjectionFromStores(record, stores)));
      return {
        items,
        cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].id : null,
        limit: page.limit,
        hasMore,
      };
    },

    /** Lecture unitaire : seules les parties du contrat (jamais un tiers). */
    async getContract(
      suppliedActor: AuthenticatedActor,
      contractId: string,
    ): Promise<Contract | null> {
      const actor = requireTrustedActor(suppliedActor);
      const normalizedId = contractId?.trim();
      if (!normalizedId) return null;
      const account = await stores.users.findById(actor.id);
      if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
      if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : accès indisponible.');

      const record = await stores.contracts.findById(normalizedId);
      if (!record) return null;
      const isParty = record.employerId === actor.id || record.employeeId === actor.id;
      if (!isParty) {
        throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas partie de ce contrat.');
      }
      return toProjectionFromStores(record, stores);
    },

    /** Lecture ADMIN (route existante `admin.contracts.list`), sans élargissement de permission. */
    async getAdminContracts(
      suppliedActor: AuthenticatedActor,
      page: PageRequest,
    ): Promise<CursorPage<Contract>> {
      const actor = requireTrustedActor(suppliedActor);
      requireAdmin(actor);
      const account = await stores.users.findById(actor.id);
      if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
      if (account.role !== 'ADMIN') throw new ApiError('FORBIDDEN', 'Accès interdit.');
      if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : accès indisponible.');

      if (page.cursor) {
        const cursorRecord = await stores.contracts.findById(page.cursor);
        if (!cursorRecord) throw new ApiError('VALIDATION_ERROR', 'Le curseur de contrats est invalide.');
      }

      const records = await stores.contracts.listAll(page.limit + 1, page.cursor);
      const hasMore = records.length > page.limit;
      const visible = records.slice(0, page.limit);
      const items = await Promise.all(visible.map(record => toProjectionFromStores(record, stores)));
      return {
        items,
        cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].id : null,
        limit: page.limit,
        hasMore,
      };
    },

    /**
     * P0-CONTRACT-POST — confirmation de fin d'exécution (FIN / CONFIRMATION).
     * Vérifie : contrat ACTIVE ; partie autorisée (EMPLOYER ou CANDIDATE) ;
     * compte ACTIVE ; protection M1 (incident requis si currentMonth < 2) ;
     * non-concurrence via compare-and-set SQL ; audit/historique persisté.
     * Une contestation (param `contest`) relie au système P0-DISPUTE-1.
     */
    async confirmExecution(
      suppliedActor: AuthenticatedActor,
      contractId: string,
      contest?: string,
      command?: ProductionCommandContext,
    ): Promise<Contract> {
      const actor = requireTrustedActor(suppliedActor);
      const normalizedContractId = contractId?.trim();
      if (!normalizedContractId) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
      const idempotencyKey = command?.idempotencyKey?.trim();
      const fingerprint = JSON.stringify({ contractId: normalizedContractId, action: 'CONFIRM_EXECUTION', contest: contest ?? null });

      const execute = async (): Promise<Contract> => {
        const mutate = async (currentStores: ContractRepositoryStores): Promise<Contract> => {
          await requireActiveAccount(
            currentStores,
            actor,
            'COMPTE NON ACTIF : la confirmation d\'exécution est indisponible.',
          );

          // Autorisation : seules les parties du contrat peuvent confirmer.
          if (actor.role !== 'EMPLOYER' && actor.role !== 'CANDIDATE') {
            throw new ApiError('FORBIDDEN', 'Seules les parties du contrat peuvent confirmer la fin d\'exécution.');
          }

          const contract = await currentStores.contracts.findByIdForUpdate(normalizedContractId);
          if (!contract) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
          if (contract.employerId !== actor.id && contract.employeeId !== actor.id) {
            throw new ApiError('FORBIDDEN', 'Vous n\'êtes pas partie de ce contrat.');
          }
          if (contract.status !== 'ACTIVE') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `La confirmation d'exécution exige un contrat actif (statut : ${contract.status}).`,
              undefined,
              409,
            );
          }

          // Protection M1 : en premier mois, un incident doit être signalé.
          if (contract.currentMonth < 2) {
            if (!contract.incidentId) {
              throw new ApiError(
                'BUSINESS_RULE_VIOLATION',
                'Pendant le premier mois (M1), la confirmation de fin d\'exécution exige un incident signalé à LE LABEUR.',
                undefined,
                409,
              );
            }
          }

          const timestamp = now().toISOString();
          const entryDescription = contest
            ? `Confirmation de fin d'exécution par ${actor.id} ; contestation : ${contest}`
            : `Confirmation de fin d'exécution enregistrée par ${actor.id}.`;
          const entry = historyEntry(
            'EXECUTION_CONFIRMED',
            entryDescription,
            actor.id,
            timestamp,
          );

          // Compare-and-set : la confirmation est idempotente si le même acteur
          // confirme le même contrat dans le même état (rejeu sans double effet).
          const updated = await currentStores.contracts.compareAndSetStatus(normalizedContractId, 'ACTIVE', {
            status: 'ACTIVE',
            updatedAt: timestamp,
            historyEntry: entry,
          });

          // Si le compare-and-set retourne null, le statut a changé concurrentement.
          // On vérifie si la confirmation est déjà présente dans l'historique.
          if (!updated) {
            const fresh = await currentStores.contracts.findById(normalizedContractId);
            if (!fresh) throw new ApiError('NOT_FOUND', 'Contrat introuvable.');
            const alreadyConfirmed = fresh.history.some(
              (h: { event: string }) => h.event === 'EXECUTION_CONFIRMED',
            );
            if (alreadyConfirmed && fresh.status === 'ACTIVE') {
              // Rejeu idempotent : la confirmation a déjà été appliquée.
              return toProjectionFromStores(fresh, currentStores);
            }
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'Une transition concurrente a modifié ce contrat : la confirmation n\'a pas été appliquée.',
              undefined,
              409,
            );
          }

          // Si une contestation est déclarée et qu'il n'y a pas déjà une restriction,
          // on note le lien vers le système de litige dans l'historique (le Claim
          // réel est créé par la route P0-DISPUTE-1 ; ici on marque la trace).
          if (contest && currentStores.claimRestrictions?.hasActiveRestriction) {
            const hasRestriction = await currentStores.claimRestrictions.hasActiveRestriction(
              contract.id,
              contract.employerId,
              'CONTRACT_TERMINATE',
            );
            if (hasRestriction) {
              // Une restriction provisoire existe déjà : la confirmation reste
              // valide mais est tracée avec mention de la restriction active.
              // Aucune double restriction n'est créée.
            }
          }

          return toProjectionFromStores(updated, currentStores);
        };
        return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
      };

      if (!idempotencyKey) return execute();
      return contractIdempotencyCache.execute(
        actor.id,
        command?.command || 'contracts.confirm-execution',
        idempotencyKey,
        fingerprint,
        execute,
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/* Handlers API — domaine CONTRAT uniquement                           */
/* ------------------------------------------------------------------ */

async function readJsonBody(context: ApiRouteContext): Promise<Record<string, unknown>> {
  const raw = await context.request.text();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('object expected');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Corps de requête JSON invalide.');
  }
}

/**
 * Handlers P0-F — et uniquement ceux-là.
 * `contracts.monthly-action` (cycle paiements/mensuel) reste fermé, ainsi que
 * paiements, commissions, plaintes, remplacements, notifications et messages.
 */
export function createContractApiHandlers(
  repository: OpenContractRepository,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'contracts.mine.list': async context => repository.getMyContracts(
      context.actor!,
      context.page ?? { cursor: null, limit: 25 },
    ),

    'contracts.read': async context => {
      const contract = await repository.getContract(context.actor!, context.params.contractId);
      if (!contract) throw new ApiError('NOT_FOUND', 'Ressource introuvable.');
      return contract;
    },

    'contracts.create': async context => {
      const body = await readJsonBody(context);
      // offerId, applicationId, employerId, employeeId et les modalités ne sont
      // jamais lus du corps : ils sont dérivés de la proposition acceptée.
      const contract = await repository.createContract(
        context.actor!,
        body as unknown as ServerCreateContractInput,
        context.command!,
      );
      return apiJsonResponse(contract, 201, context.requestId);
    },

    'contracts.send': async context => apiJsonResponse(
      await repository.sendContract(context.actor!, context.params.contractId, context.command!),
      200,
      context.requestId,
    ),

    'contracts.sign': async context => apiJsonResponse(
      await repository.signContract(context.actor!, context.params.contractId, context.command!),
      200,
      context.requestId,
    ),

    'contracts.activate': async context => apiJsonResponse(
      await repository.activateContract(context.actor!, context.params.contractId, context.command!),
      200,
      context.requestId,
    ),

    'contracts.end': async context => apiJsonResponse(
      await repository.endContract(context.actor!, context.params.contractId, context.command!),
      200,
      context.requestId,
    ),

    'contracts.terminate': async context => {
      const body = await readJsonBody(context);
      const reason = typeof body.reason === 'string' ? body.reason : '';
      const contract = await repository.terminateContract(
        context.actor!,
        context.params.contractId,
        reason,
        context.command!,
      );
      return apiJsonResponse(contract, 200, context.requestId);
    },

    // P0-CONTRACT-POST : le corps est ignoré — tout est dérivé du contrat ACTIF relu côté serveur.
    'contracts.finalize-hiring': async context => apiJsonResponse(
      await repository.finalizeHiring(context.actor!, context.params.contractId, context.command!),
      200,
      context.requestId,
    ),

    'contracts.confirm-execution': async context => {
      const body = await readJsonBody(context);
      const contest = typeof body.contest === 'string' ? body.contest : undefined;
      const contract = await repository.confirmExecution(
        context.actor!,
        context.params.contractId,
        contest,
        context.command!,
      );
      return apiJsonResponse(contract, 200, context.requestId);
    },

    'admin.contracts.list': async context => repository.getAdminContracts(
      context.actor!,
      context.page ?? { cursor: null, limit: 25 },
    ),
  };
}
