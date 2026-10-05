/**
 * LE LABEUR — P0-E5 — cycle restreint des PROPOSITIONS D'EMBAUCHE.
 *
 * Chaîne : Worker/API → repository métier → stores noyau → PostgreSQL.
 *
 * Périmètre ouvert, dérivé du modèle réel (`MockRepository.sendProposal` /
 * `respondToProposal`, `src/types/index.ts`) :
 *   EMPLOYER propriétaire de l'offre : SEND     (∅ → SENT, statut initial),
 *                                     EXPIRE   (SENT → EXPIRED) ;
 *   CANDIDATE destinataire de la proposition :
 *                                     ACCEPT   (SENT → ACCEPTED),
 *                                     DECLINE  (SENT → DECLINED).
 *
 * Restent FERMÉS : la révision (`REVISE` → `REVISION_REQUESTED`, seconde
 * tranche), les contrats, la signature, les paiements, les commissions, les
 * plaintes, les remplacements, les notifications générales, le passage de
 * l'offre à `FILLED`, la fermeture des autres candidatures et toute
 * automatisation (Cron/Queue/Outbox) — cf. `docs/P0-E5_PROPOSITIONS_EMBAUCHE.md`.
 *
 * Aucun statut nouveau n'est introduit : la nomenclature du code est conservée
 * (`SENT`, `ACCEPTED`, `DECLINED`, `EXPIRED`) et la matrice est portée par
 * `src/domain/proposalTransitions.ts`.
 */

import type { MissionProposal } from '../../types';
import {
  evaluateProposalTransition,
  isProposalPeriodicity,
  PROPOSAL_ELIGIBLE_APPLICATION_STATUSES,
  PROPOSAL_EXPIRATION_RULE,
  PROPOSAL_INITIAL_STATUS,
  PROPOSAL_OUT_OF_SCOPE_ACTIONS,
  PROPOSAL_RESPONSE_RULES,
  type ProposalResponseAction,
  type ProposalTransitionRule,
} from '../../domain/proposalTransitions';
import { ApiError, apiJsonResponse } from '../api/errors';
import type { ApiRouteKey } from '../api/routeContracts';
import type { ApiRouteHandler, ApiRouteContext } from '../api/worker';
import { newEntityId } from '../identity/ids';
import type { ServerUserRecord, UserStore } from '../identity/stores';
import type { ApplicationRecord, ApplicationStore, OfferStore, ProposalRecord, ProposalStore } from '../persistence/coreRecords';
import type {
  AuthenticatedActor,
  CursorPage,
  PageRequest,
  ProductionCommandContext,
} from '../productionContracts';
import type {
  ServerCreateProposalInput,
  ServerProposalRepository,
} from './contracts';

export interface ProposalRepositoryStores {
  proposals: ProposalStore;
  applications: ApplicationStore;
  offers: OfferStore;
  users: UserStore;
}

export interface ProposalRepositoryDependencies {
  stores: ProposalRepositoryStores;
  /** SQL callers bind every store in the callback to the same PostgreSQL transaction. */
  runInTransaction?: <T>(operation: (stores: ProposalRepositoryStores) => Promise<T>) => Promise<T>;
  now?: () => Date;
}

interface IdempotencyEntry {
  fingerprint: string;
  result?: MissionProposal;
  pending?: Promise<MissionProposal>;
}

/**
 * Cache de rejeu process-local, aligné sur la frontière d'idempotence existante
 * (P0-E1 offres, P0-E3/E4 candidatures). Aucun framework global n'est créé :
 * la clé reste `(commande, acteur, Idempotency-Key)` avec empreinte de charge
 * utile, et la réservation est synchrone pour que deux requêtes concurrentes
 * portant la même clé ne lancent jamais deux transactions métier.
 */
class InMemoryProposalIdempotencyCache {
  private readonly records = new Map<string, IdempotencyEntry>();

  execute(
    actorId: string,
    command: string,
    key: string,
    fingerprint: string,
    operation: () => Promise<MissionProposal>,
  ): Promise<MissionProposal> {
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

/** Cache de rejeu du domaine PROPOSITION (P0-E5). */
export const proposalIdempotencyCache = new InMemoryProposalIdempotencyCache();

function requireTrustedActor(actor: AuthenticatedActor | null | undefined): AuthenticatedActor {
  if (!actor?.id || !actor.sessionId) {
    throw new ApiError('UNAUTHENTICATED', 'Authentification requise.');
  }
  return actor;
}

function requireEmployer(actor: AuthenticatedActor): void {
  if (actor.role !== 'EMPLOYER') {
    throw new ApiError('FORBIDDEN', 'Seul l’employeur émetteur peut envoyer ou expirer une proposition.');
  }
}

function requireCandidate(actor: AuthenticatedActor): void {
  if (actor.role !== 'CANDIDATE') {
    throw new ApiError('FORBIDDEN', 'Seul le candidat destinataire peut répondre à cette proposition.');
  }
}

function requireAdmin(actor: AuthenticatedActor): void {
  if (actor.role !== 'ADMIN') {
    throw new ApiError('FORBIDDEN', 'Accès réservé à l’administration.');
  }
}

async function requireActiveAccount(
  currentStores: ProposalRepositoryStores,
  actor: AuthenticatedActor,
  role: AuthenticatedActor['role'],
  message: string,
): Promise<ServerUserRecord> {
  const account = await currentStores.users.findByIdForShare(actor.id);
  if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
  if (account.role !== role) {
    throw new ApiError('FORBIDDEN', 'Le rôle du compte ne permet pas cette opération sur proposition.');
  }
  if (account.status !== 'ACTIVE') {
    throw new ApiError('FORBIDDEN', message);
  }
  return account;
}

/* ------------------------------------------------------------------ */
/* Validation de la charge utile d'émission                            */
/* ------------------------------------------------------------------ */

const PROPOSAL_PAYLOAD_FIELDS = [
  'offerId',
  'applicationId',
  'missionTitle',
  'amount',
  'currency',
  'periodicity',
  'startDate',
  'endDate',
  'durationMonths',
  'location',
  'conditions',
] as const;

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError('VALIDATION_ERROR', `${label} est requis.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', `${label} doit être du texte.`);
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Normalise et valide l'émission. Aucune identité n'est lue ici : `employerId`
 * et `employeeId` sont dérivés côté serveur (session + candidature), jamais du
 * corps de requête — comme `ServerCreateProposalInput` les exclut déjà.
 */
function normalizeProposalPayload(
  value: ServerCreateProposalInput | undefined,
): {
  offerId?: string;
  applicationId: string;
  missionTitle: string;
  amount: number;
  currency: string;
  periodicity: ProposalRecord['periodicity'];
  startDate: string;
  endDate?: string;
  durationMonths: number;
  location: string;
  conditions: string[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', 'La charge utile de proposition est invalide.');
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!(PROPOSAL_PAYLOAD_FIELDS as readonly string[]).includes(key)) {
      throw new ApiError('VALIDATION_ERROR', `Champ de proposition inconnu : ${key}.`);
    }
  }

  const applicationId = requireText(input.applicationId, 'L’identifiant de candidature');
  const missionTitle = requireText(input.missionTitle, 'L’intitulé de mission');
  const location = requireText(input.location, 'Le lieu de mission');
  const startDate = requireText(input.startDate, 'La date de début');
  const currency = requireText(input.currency, 'La devise');

  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Le montant de la rémunération doit être supérieur à zéro.');
  }

  const durationMonths = input.durationMonths;
  if (typeof durationMonths !== 'number' || !Number.isInteger(durationMonths) || durationMonths <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'La durée (en mois) doit être un entier supérieur à zéro.');
  }

  if (!isProposalPeriodicity(input.periodicity)) {
    throw new ApiError('VALIDATION_ERROR', 'La périodicité de la proposition est invalide.');
  }

  const conditionsValue = input.conditions;
  if (conditionsValue !== undefined && !Array.isArray(conditionsValue)) {
    throw new ApiError('VALIDATION_ERROR', 'Les conditions doivent être une liste de texte.');
  }
  const conditions = (conditionsValue ?? []).map(condition => requireText(condition, 'Chaque condition'));

  const offerId = optionalText(input.offerId, 'L’identifiant d’offre');
  const endDate = optionalText(input.endDate, 'La date de fin');

  return {
    applicationId,
    missionTitle,
    amount,
    currency,
    periodicity: input.periodicity,
    startDate,
    durationMonths,
    location,
    conditions,
    ...(offerId !== undefined ? { offerId } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
  };
}

function toProposalProjection(
  record: ProposalRecord,
  employer: ServerUserRecord | null,
  employee: ServerUserRecord | null,
): MissionProposal {
  return {
    id: record.id,
    conversationId: record.conversationId,
    offerId: record.offerId,
    employerId: record.employerId,
    employerName: employer?.displayName ?? '',
    employeeId: record.employeeId,
    employeeName: employee?.displayName ?? '',
    missionTitle: record.missionTitle,
    amount: record.amount,
    currency: record.currency,
    periodicity: record.periodicity,
    startDate: record.startDate,
    durationMonths: record.durationMonths,
    location: record.location,
    conditions: [...record.conditions],
    status: record.status,
    sentAt: record.sentAt,
    updatedAt: record.updatedAt,
    ...(record.contractId ? { contractId: record.contractId } : {}),
    ...(record.applicationId ? { applicationId: record.applicationId } : {}),
    ...(record.endDate ? { endDate: record.endDate } : {}),
    ...(record.revisionNotes ? { revisionNotes: record.revisionNotes } : {}),
  };
}

/** Sous-ensemble PROPOSITIONS réellement ouvert par P0-E5. */
export type OpenProposalRepository = Pick<ServerProposalRepository,
  | 'createProposal'
  | 'respondToProposal'
  | 'expireProposal'
  | 'getAdminProposals'
>;

export function createProposalRepository(
  dependencies: ProposalRepositoryDependencies,
): OpenProposalRepository {
  const { stores, runInTransaction } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  const toProjectionFromStores = async (
    record: ProposalRecord,
    currentStores: ProposalRepositoryStores,
  ): Promise<MissionProposal> => {
    const [employer, employee] = await Promise.all([
      currentStores.users.findById(record.employerId),
      currentStores.users.findById(record.employeeId),
    ]);
    return toProposalProjection(record, employer, employee);
  };

  /**
   * P0-E5 — moteur de transition unique pour ACCEPT / DECLINE / EXPIRE.
   *
   * Garanties, dans cet ordre :
   *  1. l'acteur vient de la session serveur (jamais du corps de requête) ;
   *  2. le compte doit exister, porter le rôle de la règle et être ACTIVE ;
   *  3. l'autorisation est résolue depuis la ligne relue (destinataire de la
   *     proposition pour le candidat, émetteur pour l'expiration) ;
   *  4. la transition est évaluée contre le statut courant verrouillé ;
   *  5. l'écriture est un compare-and-set SQL : une transition concurrente qui a
   *     gagné n'est jamais écrasée.
   *
   * Aucune conséquence hors domaine n'est produite : ni offre `FILLED`, ni
   * fermeture d'autres candidatures, ni contrat, ni paiement, ni notification.
   */
  const transition = async (input: {
    rule: ProposalTransitionRule;
    actor: AuthenticatedActor;
    proposalId: string;
    command: ProductionCommandContext;
    /**
     * Charge utile de la commande, utilisée UNIQUEMENT pour l'empreinte
     * d'idempotence : deux payloads différents sous la même clé produisent un
     * `409 IDEMPOTENCY_CONFLICT` même si la transition est identique.
     */
    fingerprintPayload?: Record<string, unknown>;
  }): Promise<MissionProposal> => {
    const rule = input.rule;
    const actor = requireTrustedActor(input.actor);
    if (actor.role !== rule.actorRole) {
      throw new ApiError(
        'FORBIDDEN',
        rule.actorRole === 'CANDIDATE'
          ? 'Action non autorisée : seul le candidat destinataire peut répondre à cette proposition.'
          : 'Action non autorisée : seul l’employeur émetteur de la proposition peut la clore.',
      );
    }

    const proposalId = input.proposalId?.trim();
    if (!proposalId) throw new ApiError('NOT_FOUND', 'Proposition introuvable.');
    const idempotencyKey = input.command?.idempotencyKey?.trim();
    const fingerprint = JSON.stringify({ proposalId, action: rule.action, ...input.fingerprintPayload });

    const execute = async (): Promise<MissionProposal> => {
      const mutate = async (currentStores: ProposalRepositoryStores): Promise<MissionProposal> => {
        await requireActiveAccount(
          currentStores,
          actor,
          rule.actorRole,
          rule.actorRole === 'CANDIDATE'
            ? 'COMPTE NON ACTIF : la réponse à une proposition est indisponible.'
            : 'COMPTE NON ACTIF : l’expiration d’une proposition est indisponible.',
        );

        // Verrou de ligne : sérialise deux transitions concurrentes.
        const proposal = await currentStores.proposals.findByIdForUpdate(proposalId);
        if (!proposal) throw new ApiError('NOT_FOUND', 'Proposition introuvable.');

        if (rule.actorRole === 'CANDIDATE') {
          if (proposal.employeeId !== actor.id) {
            throw new ApiError('FORBIDDEN', 'Action non autorisée : seul le candidat destinataire peut répondre à cette proposition.');
          }
        } else if (proposal.employerId !== actor.id) {
          throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas l’émetteur de cette proposition.');
        }

        // Une proposition déjà liée à un contrat sort du périmètre P0-E5 : elle
        // appartient à l'étape CONTRAT (aucun état impossible n'est produit ici).
        if (proposal.contractId) {
          throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette proposition est déjà associée à un contrat.', undefined, 409);
        }

        const outcome = evaluateProposalTransition(rule, proposal.status);
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
            `Transition de proposition invalide : « ${rule.action} » depuis « ${outcome.current} ».`,
            undefined,
            409,
          );
        }

        const timestamp = now().toISOString();
        const updated = await currentStores.proposals.compareAndSetStatus(proposalId, proposal.status, {
          status: outcome.to,
          updatedAt: timestamp,
        });

        if (!updated) {
          // Le compare-and-set a perdu : une transition concurrente a gagné.
          const fresh = await currentStores.proposals.findByIdForUpdate(proposalId);
          if (!fresh) throw new ApiError('NOT_FOUND', 'Proposition introuvable.');
          if (fresh.status === rule.to) return toProjectionFromStores(fresh, currentStores);
          throw new ApiError(
            'BUSINESS_RULE_VIOLATION',
            'Une transition concurrente a modifié cette proposition : l’action n’a pas été appliquée.',
            undefined,
            409,
          );
        }

        // Événement métier futur à produire : `rule.event` (PROPOSAL_ACCEPTED,
        // PROPOSAL_DECLINED, PROPOSAL_EXPIRED), documenté dans
        // `DOCUMENTED_PROPOSAL_EVENTS`. P0-E5 ne crée ni moteur Outbox, ni file,
        // ni consumer, ni notification : seule la transition est persistée, dans
        // la même transaction PostgreSQL.
        return toProjectionFromStores(updated, currentStores);
      };

      return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
    };

    if (!idempotencyKey) return execute();
    return proposalIdempotencyCache.execute(
      actor.id,
      input.command?.command || `proposals.${rule.action.toLowerCase()}`,
      idempotencyKey,
      fingerprint,
      execute,
    );
  };

  return {
    /**
     * Émission d'une proposition (`sendProposal`) : EMPLOYER propriétaire de
     * l'offre, vers une candidature ADMISSIBLE de cette offre.
     *
     * La conversation n'est qu'un conteneur de transport : faute de registre
     * serveur des conversations (aucune table `conversations`), l'autorité vient
     * exclusivement des lignes `applications` / `offers` / `users` relues, et
     * l'identité du destinataire est dérivée de la candidature — jamais du corps.
     */
    async createProposal(
      suppliedActor: AuthenticatedActor,
      suppliedConversationId: string,
      suppliedPayload: ServerCreateProposalInput,
      command: ProductionCommandContext,
    ): Promise<MissionProposal> {
      const actor = requireTrustedActor(suppliedActor);
      requireEmployer(actor);
      const conversationId = suppliedConversationId?.trim();
      if (!conversationId) throw new ApiError('VALIDATION_ERROR', 'La conversation est requise.');
      const payload = normalizeProposalPayload(suppliedPayload);
      const idempotencyKey = command?.idempotencyKey?.trim();
      const fingerprint = JSON.stringify({ conversationId, payload });

      const submit = async (): Promise<MissionProposal> => {
        const mutate = async (currentStores: ProposalRepositoryStores): Promise<MissionProposal> => {
          const employer = await requireActiveAccount(
            currentStores,
            actor,
            'EMPLOYER',
            'COMPTE NON ACTIF : l’émission de proposition est indisponible.',
          );

          // Verrou de ligne : l'éligibilité de la candidature et la propriété de
          // l'offre sont lues dans la transaction d'écriture.
          const application: ApplicationRecord | null = await currentStores.applications.findByIdForUpdate(payload.applicationId);
          if (!application) throw new ApiError('NOT_FOUND', 'Candidature introuvable.');

          const offer = await currentStores.offers.findByIdForShare(application.offerId);
          if (!offer) throw new ApiError('NOT_FOUND', 'Offre introuvable.');
          if (offer.employerId !== actor.id) {
            throw new ApiError('FORBIDDEN', 'Action non autorisée : vous n’êtes pas le propriétaire de cette offre.');
          }
          if (payload.offerId !== undefined && payload.offerId !== offer.id) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              'La proposition ne correspond pas à l’offre de la candidature.',
              undefined,
              409,
            );
          }
          if (offer.status !== 'ACTIVE') {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Cette offre n’accepte plus de proposition (statut : ${offer.status}).`,
              undefined,
              409,
            );
          }
          if (application.contractId) {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette candidature est déjà associée à un contrat.', undefined, 409);
          }
          if (!(PROPOSAL_ELIGIBLE_APPLICATION_STATUSES as readonly string[]).includes(application.status)) {
            throw new ApiError(
              'BUSINESS_RULE_VIOLATION',
              `Cette candidature n’est pas admissible à une proposition (statut : ${application.status}).`,
              undefined,
              409,
            );
          }

          const employee = await currentStores.users.findByIdForShare(application.candidateId);
          if (!employee || employee.role !== 'CANDIDATE' || employee.status !== 'ACTIVE') {
            throw new ApiError('BUSINESS_RULE_VIOLATION', 'Cette candidature n’est pas admissible à une proposition.', undefined, 409);
          }

          const timestamp = now().toISOString();
          const record: ProposalRecord = {
            id: newEntityId('prp'),
            conversationId,
            offerId: offer.id,
            applicationId: application.id,
            employerId: actor.id,
            employeeId: employee.id,
            missionTitle: payload.missionTitle,
            amount: payload.amount,
            currency: payload.currency,
            periodicity: payload.periodicity,
            startDate: payload.startDate,
            durationMonths: payload.durationMonths,
            location: payload.location,
            conditions: payload.conditions,
            status: PROPOSAL_INITIAL_STATUS,
            sentAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
            ...(payload.endDate ? { endDate: payload.endDate } : {}),
          };
          const saved = await currentStores.proposals.create(record);
          // Événement métier futur à produire : PROPOSAL_SENT (documenté, non
          // émis : aucun moteur Outbox/Queue en P0-E5).
          return toProposalProjection(saved, employer, employee);
        };

        return runInTransaction ? await runInTransaction(mutate) : await mutate(stores);
      };

      if (!idempotencyKey) return submit();
      return proposalIdempotencyCache.execute(
        actor.id,
        command.command || 'proposals.create',
        idempotencyKey,
        fingerprint,
        submit,
      );
    },

    /** Réponse du CANDIDATE destinataire : ACCEPT ou DECLINE (REVISE reste fermé). */
    async respondToProposal(
      suppliedActor: AuthenticatedActor,
      proposalId: string,
      action: 'ACCEPT' | 'REVISE' | 'DECLINE',
      notes: string | undefined,
      command: ProductionCommandContext,
    ): Promise<MissionProposal> {
      const actor = requireTrustedActor(suppliedActor);
      requireCandidate(actor);
      if ((PROPOSAL_OUT_OF_SCOPE_ACTIONS as readonly string[]).includes(action)) {
        // Action existante dans le modèle réel, tranche suivante : aucune règle
        // métier n'est inventée ici, l'opération n'est pas ouverte.
        throw new ApiError(
          'NOT_IMPLEMENTED',
          'La demande de révision d’une proposition n’est pas ouverte à cette étape.',
          undefined,
          501,
        );
      }
      if (action !== 'ACCEPT' && action !== 'DECLINE') {
        throw new ApiError('VALIDATION_ERROR', 'Réponse de proposition invalide.');
      }
      // Le modèle réel ne stocke de texte que pour une révision (`revisionNotes`) :
      // une note de déclinaison n'a pas de champ réel, elle n'est donc jamais
      // persistée — mais elle fait partie de la charge utile idempotente.
      const normalizedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
      return transition({
        rule: PROPOSAL_RESPONSE_RULES[action as ProposalResponseAction],
        actor,
        proposalId,
        command,
        fingerprintPayload: { notes: normalizedNotes },
      });
    },

    /** Expiration explicite (`SENT → EXPIRED`) par l'EMPLOYER émetteur. */
    async expireProposal(
      suppliedActor: AuthenticatedActor,
      proposalId: string,
      command: ProductionCommandContext,
    ): Promise<MissionProposal> {
      const actor = requireTrustedActor(suppliedActor);
      requireEmployer(actor);
      return transition({ rule: PROPOSAL_EXPIRATION_RULE, actor, proposalId, command });
    },

    /** Lecture ADMIN de la route existante `admin.proposals.list`. */
    async getAdminProposals(
      suppliedActor: AuthenticatedActor,
      page: PageRequest,
    ): Promise<CursorPage<MissionProposal>> {
      const actor = requireTrustedActor(suppliedActor);
      requireAdmin(actor);
      const account = await stores.users.findById(actor.id);
      if (!account) throw new ApiError('UNAUTHENTICATED', 'Acteur introuvable.');
      if (account.role !== 'ADMIN') throw new ApiError('FORBIDDEN', 'Accès interdit.');
      if (account.status !== 'ACTIVE') throw new ApiError('FORBIDDEN', 'COMPTE NON ACTIF : accès indisponible.');

      if (page.cursor) {
        const cursorRecord = await stores.proposals.findById(page.cursor);
        if (!cursorRecord) throw new ApiError('VALIDATION_ERROR', 'Le curseur de propositions est invalide.');
      }

      const records = await stores.proposals.listAll(page.limit + 1, page.cursor);
      const hasMore = records.length > page.limit;
      const visible = records.slice(0, page.limit);
      const items = await Promise.all(visible.map(async record => {
        const [employer, employee] = await Promise.all([
          stores.users.findById(record.employerId),
          stores.users.findById(record.employeeId),
        ]);
        return toProposalProjection(record, employer, employee);
      }));
      return {
        items,
        cursor: hasMore && visible.length > 0 ? visible[visible.length - 1].id : null,
        limit: page.limit,
        hasMore,
      };
    },
  };
}

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
 * Handlers P0-E5 — et uniquement ceux-là.
 * Contrats, signatures, paiements, commissions, plaintes, remplacements,
 * notifications générales et messages demeurent sans handler (501).
 */
export function createProposalApiHandlers(
  repository: OpenProposalRepository,
): Partial<Record<ApiRouteKey, ApiRouteHandler>> {
  return {
    'proposals.create': async context => {
      const body = await readJsonBody(context);
      // employerId, employeeId, status et conversationId ne sont jamais lus du
      // corps : ils viennent de la session et du chemin.
      const proposal = await repository.createProposal(
        context.actor!,
        context.params.conversationId,
        body as ServerCreateProposalInput,
        context.command!,
      );
      return apiJsonResponse(proposal, 201, context.requestId);
    },

    'proposals.respond': async context => {
      const body = await readJsonBody(context);
      const action = typeof body.action === 'string' ? body.action.trim().toUpperCase() : '';
      const notes = typeof body.notes === 'string' ? body.notes : undefined;
      const proposal = await repository.respondToProposal(
        context.actor!,
        context.params.proposalId,
        action as 'ACCEPT' | 'REVISE' | 'DECLINE',
        notes,
        context.command!,
      );
      return apiJsonResponse(proposal, 200, context.requestId);
    },

    'proposals.expire': async context => apiJsonResponse(
      await repository.expireProposal(context.actor!, context.params.proposalId, context.command!),
      200,
      context.requestId,
    ),

    'admin.proposals.list': async context => repository.getAdminProposals(
      context.actor!,
      context.page ?? { cursor: null, limit: 25 },
    ),
  };
}
