/**
 * LE LABEUR — P0-REPUTATION — RÉSOLUTION DES FAITS DOCUMENTÉS.
 *
 * Ce module ne crée aucune donnée métier : il LIT ce qui existe déjà et le
 * réduit à un fait de réputation — type de fait RÉEL, entité source, preuve
 * source, date du fait, acteur, sujets et leur rôle documenté.
 *
 * Deux chemins, aucune duplication :
 *  1. ÉVÉNEMENT (push) : un événement de l'Outbox existante est observé
 *     (`SALARY_CONFIRMED`, `CLAIM_RESOLVED`) et résolu contre l'entité source.
 *  2. FAITS PERSISTÉS (réconciliation) : les faits déjà écrits par les cycles
 *     existants (`contracts.history`, `contracts.status`, `salary_confirmations`,
 *     `claims`) sont relus pour un sujet donné — c'est le caractère RECALCULABLE
 *     du ledger, sans producteur d'événement supplémentaire.
 *
 * Aucune écriture ici. Aucune notification. Aucun accès réseau.
 */

import type { PersistedOutboxEvent } from '../automation/foundation';
import type { ClaimRecord, ClaimStore } from '../disputes/records';
import type { ContractStore } from '../persistence/coreRecords';
import type { PaymentStore } from '../persistence/paymentRecords';
import type { ReputationFact } from '../../domain/reputationRules';
import type { ReputationFactSubject } from './reputationLedger';

/** Borne toute lecture de faits : aucune réconciliation non bornée. */
export const MAX_REPUTATION_FACTS_PER_SUBJECT = 200;

/** Acteur système de la fondation d'automatisation (`actorId` absent). */
export const REPUTATION_SYSTEM_ACTOR = 'SYSTEM';

/** Confirmation salariale persistée, réduite à ses seules clés. */
export interface ConfirmedSalaryFact {
  paymentId: string;
  contractId: string;
  employerId: string;
  candidateId: string;
  confirmedAt: string;
}

/**
 * Lecteurs des sources EXISTANTES. L'adaptateur PostgreSQL
 * (`sqlReputationStores.ts`) les implémente au-dessus des tables du dépôt ; les
 * tests peuvent fournir des lecteurs en mémoire.
 */
export interface ReputationFactReader {
  payments: Pick<PaymentStore, 'findById'>;
  contracts: Pick<ContractStore, 'listByEmployer' | 'listByEmployee'>;
  claims: Pick<ClaimStore, 'findClaim' | 'listForParty'>;
  /** `salary_confirmations` où l'utilisateur est l'employeur, confirmations seules. */
  listConfirmedSalariesForEmployer(employerId: string, limit: number): Promise<ConfirmedSalaryFact[]>;
}

export interface ResolvedFact {
  fact: ReputationFact;
  subjects: readonly ReputationFactSubject[];
}

/** Raison, traçable, d'un fait d'événement NON résolu en entrée. */
export type FactSkipReason =
  | 'SYSTEM_AUTO_RESOLUTION_NO_FAULT'
  | 'SOURCE_NOT_FOUND'
  | 'PROOF_LEVEL_INSUFFICIENT';

export interface EventFactResolution {
  resolved: ResolvedFact | null;
  skipReason?: FactSkipReason;
}

function eventOccurredAt(event: PersistedOutboxEvent): string {
  return typeof event.timestamp === 'string' ? event.timestamp : new Date(0).toISOString();
}

function eventActor(event: PersistedOutboxEvent): string {
  return typeof event.actorId === 'string' && event.actorId.trim() ? event.actorId : REPUTATION_SYSTEM_ACTOR;
}

function payloadText(event: PersistedOutboxEvent, key: string): string | undefined {
  const value = event.payload?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Résout un événement de l'Outbox en fait documenté.
 *
 * `SALARY_CONFIRMED` : le niveau de preuve retenu est la CONFIRMATION du salarié
 * (ligne `salary_confirmations` persistée dans la même transaction que
 * l'événement). Le sujet est l'EMPLOYEUR du paiement.
 *
 * `CLAIM_RESOLVED` : SEULE une décision ADMIN (`actorType: 'ADMIN'`) est un fait
 * définitif. L'auto-résolution déterministe (`actorType: 'SYSTEM'`, audit
 * `faultAttributed: false`) constate mécaniquement un paiement confirmé et
 * n'attribue aucune faute : elle est explicitement IGNORÉE.
 */
export async function resolveEventFact(
  reader: ReputationFactReader,
  event: PersistedOutboxEvent,
): Promise<EventFactResolution> {
  if (event.eventType === 'SALARY_CONFIRMED') {
    const paymentId = payloadText(event, 'paymentId') ?? event.aggregateId;
    const payment = await reader.payments.findById(paymentId);
    if (!payment || payment.paymentType !== 'SALARY') {
      return { resolved: null, skipReason: 'SOURCE_NOT_FOUND' };
    }
    // Le statut `PAID` est la condition réelle de la confirmation P0-SALARY-1.
    if (payment.status !== 'PAID') {
      return { resolved: null, skipReason: 'PROOF_LEVEL_INSUFFICIENT' };
    }
    return {
      resolved: {
        fact: {
          factType: 'SALARY_CONFIRMED',
          sourceEntityType: 'PAYMENT',
          sourceEntityId: payment.paymentId,
          sourceEventId: event.eventId,
          occurredAt: eventOccurredAt(event),
          actorId: eventActor(event),
        },
        subjects: [{ userId: payment.employerId, party: 'EMPLOYER' }],
      },
    };
  }

  if (event.eventType === 'CLAIM_RESOLVED') {
    const claimId = payloadText(event, 'claimId') ?? event.aggregateId;
    // Neutralité : une auto-résolution système n'est PAS une faute établie.
    if (payloadText(event, 'actorType') === 'SYSTEM') {
      return { resolved: null, skipReason: 'SYSTEM_AUTO_RESOLUTION_NO_FAULT' };
    }
    const claim = await reader.claims.findClaim(claimId).catch(() => null);
    if (!claim) return { resolved: null, skipReason: 'SOURCE_NOT_FOUND' };
    return resolveClaimDecisionFact(event, claim);
  }

  return { resolved: null, skipReason: 'SOURCE_NOT_FOUND' };
}

/**
 * Décision ADMIN sur un litige. Garde-fous cumulés :
 *  - le litige doit être RÉSOLU (et non rejeté, et non clos sans décision) ;
 *  - le décideur doit être un compte réel : `resolvedBy` renseigné et différent
 *    de `SYSTEM` (l'auto-résolution ne produit aucune entrée) ;
 *  - les deux parties doivent être distinctes.
 */
function resolveClaimDecisionFact(
  event: PersistedOutboxEvent | null,
  claim: ClaimRecord,
): EventFactResolution {
  if (claim.status !== 'RESOLVED') return { resolved: null, skipReason: 'PROOF_LEVEL_INSUFFICIENT' };
  const decidedBy = claim.resolvedBy?.trim();
  if (!decidedBy || decidedBy === REPUTATION_SYSTEM_ACTOR) {
    return { resolved: null, skipReason: 'SYSTEM_AUTO_RESOLUTION_NO_FAULT' };
  }
  if (!claim.resolvedAt || claim.claimantId === claim.respondentId) {
    return { resolved: null, skipReason: 'SOURCE_NOT_FOUND' };
  }
  return {
    resolved: {
      fact: {
        factType: 'CLAIM_RESOLVED',
        sourceEntityType: 'CLAIM',
        sourceEntityId: claim.claimId,
        ...(event ? { sourceEventId: event.eventId } : {}),
        occurredAt: claim.resolvedAt,
        actorId: decidedBy,
        adminDecision: true,
      },
      subjects: [
        { userId: claim.claimantId, party: 'CLAIMANT' },
        { userId: claim.respondentId, party: 'RESPONDENT' },
      ],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Faits PERSISTÉS (réconciliation)                                     */
/* ------------------------------------------------------------------ */

export interface SubjectFactsReport {
  facts: ResolvedFact[];
  /** Nombre de lignes sources examinées (borné). */
  scanned: number;
}

/**
 * Rassemble les faits DÉJÀ PERSISTÉS concernant un sujet :
 *  - contrats terminés (`status = 'COMPLETED'`, entrée d'historique
 *    `CONTRACT_COMPLETED`) ;
 *  - confirmations de fin d'exécution (entrées d'historique `EXECUTION_CONFIRMED`) ;
 *  - salaires confirmés reçus (lignes `salary_confirmations` où le sujet est
 *    l'employeur) ;
 *  - décisions ADMIN rendues sur ses litiges (`claims.status = 'RESOLVED'` avec un
 *    décideur réel).
 *
 * Seuls les faits du SUJET demandé produisent des entrées : la réconciliation
 * d'un utilisateur n'écrit jamais dans le ledger d'un autre.
 */
export async function listDocumentedFactsForSubject(
  reader: ReputationFactReader,
  subjectUserId: string,
): Promise<SubjectFactsReport> {
  const facts: ResolvedFact[] = [];
  let scanned = 0;

  const contracts = [
    ...await reader.contracts.listByEmployer(subjectUserId, MAX_REPUTATION_FACTS_PER_SUBJECT),
    ...await reader.contracts.listByEmployee(subjectUserId, MAX_REPUTATION_FACTS_PER_SUBJECT),
  ];
  scanned += contracts.length;

  for (const contract of contracts) {
    const isEmployer = contract.employerId === subjectUserId;
    const isEmployee = contract.employeeId === subjectUserId;
    if (!isEmployer && !isEmployee) continue;
    const parties: ReputationFactSubject[] = [
      { userId: contract.employerId, party: 'EMPLOYER' },
      { userId: contract.employeeId, party: 'WORKER' },
    ];
    const completionEntry = contract.history.find(entry => entry.event === 'CONTRACT_COMPLETED');
    if (contract.status === 'COMPLETED') {
      facts.push({
        fact: {
          factType: 'CONTRACT_COMPLETED',
          sourceEntityType: 'CONTRACT',
          sourceEntityId: contract.id,
          ...(completionEntry ? { sourceEventId: completionEntry.id } : {}),
          occurredAt: completionEntry?.timestamp ?? contract.updatedAt,
          actorId: completionEntry?.actor ?? REPUTATION_SYSTEM_ACTOR,
        },
        subjects: parties,
      });
    }
    for (const entry of contract.history) {
      if (entry.event !== 'EXECUTION_CONFIRMED') continue;
      facts.push({
        fact: {
          factType: 'EXECUTION_CONFIRMED',
          sourceEntityType: 'CONTRACT',
          sourceEntityId: contract.id,
          sourceEventId: entry.id,
          occurredAt: entry.timestamp,
          actorId: entry.actor ?? REPUTATION_SYSTEM_ACTOR,
        },
        subjects: parties,
      });
    }
  }

  const salaries = await reader.listConfirmedSalariesForEmployer(subjectUserId, MAX_REPUTATION_FACTS_PER_SUBJECT);
  scanned += salaries.length;
  for (const salary of salaries) {
    if (salary.employerId !== subjectUserId) continue;
    facts.push({
      fact: {
        factType: 'SALARY_CONFIRMED',
        sourceEntityType: 'PAYMENT',
        sourceEntityId: salary.paymentId,
        sourceEventId: `salary-confirmed:${salary.paymentId}`,
        occurredAt: salary.confirmedAt,
        actorId: salary.candidateId,
      },
      subjects: [{ userId: salary.employerId, party: 'EMPLOYER' }],
    });
  }

  const claims = await reader.claims.listForParty(subjectUserId, MAX_REPUTATION_FACTS_PER_SUBJECT);
  scanned += claims.length;
  for (const claim of claims) {
    const resolution = resolveClaimDecisionFact(null, claim);
    if (!resolution.resolved) continue;
    const concernsSubject = resolution.resolved.subjects.some(subject => subject.userId === subjectUserId);
    if (!concernsSubject) continue;
    facts.push(resolution.resolved);
  }

  return { facts, scanned };
}
