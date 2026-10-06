/**
 * P0-DISPUTE-1 — deterministic Claim automation on the existing Outbox/jobs/deadlines.
 *
 * Only a server-persisted PAID SALARY plus a matching candidate-confirmed
 * salary_confirmation can resolve automatically. Missing evidence, silence,
 * payment disputes and incidents are escalated to ADMIN_REVIEW without blame.
 */

import type { AutomationJob, AutomationSqlFactory, AutomationStores } from '../automation/records';
import { createDomainEvent } from '../automation/foundation';
import type { DomainEventType, PersistedOutboxEvent } from '../automation/foundation';
import type { PostgreSqlDatabase, SqlQueryExecutor, SqlTransaction } from '../services/database';
import { newEntityId } from '../identity/ids';
import { sha256Fingerprint } from '../payments/paymentErrors';
import type { ClaimRecord, ClaimStatus, ClaimStore } from './records';
import { CLAIM_SYSTEM_SOURCE, type CLAIM_EVENT_TYPES } from './claimRepository';
import type { SupplementalAutomationProcessor } from '../automation/worker';

export const CLAIM_EVIDENCE_DEADLINE_JOB_TYPE = 'CLAIM_EVIDENCE_DEADLINE';
export const CLAIM_AUTOMATION_EVENT_TYPES: readonly DomainEventType[] = [
  'CLAIM_CREATED',
  'CLAIM_EVIDENCE_REQUESTED',
  'CLAIM_EVIDENCE_SUBMITTED',
];

const SYSTEM = 'SYSTEM';
const CLAIM_EVENT_COMMAND = 'automation.claim.event';
const CLAIM_DEADLINE_COMMAND = 'automation.claim.evidence-deadline';

interface ClaimAutomationDependencies {
  database: PostgreSqlDatabase;
  createStores: AutomationSqlFactory;
  createClaimStore: (executor: SqlQueryExecutor) => ClaimStore;
  evidenceDeadlineMs: number | null;
  deadlineConfigurationValid?: boolean;
  now?: () => Date;
}

interface SalaryFactsRow {
  id: string;
  contract_id: string;
  candidate_id: string;
  employer_id: string;
  payment_type: string;
  status: string;
  amount: string | number;
  currency: string;
}

interface SalaryConfirmationFactsRow {
  payment_id: string;
  contract_id: string;
  candidate_id: string;
  employer_id: string;
  amount: string | number;
  currency: string;
  confirmed_at: unknown;
  confirmed_by: string | null;
}

function eventPayload(event: PersistedOutboxEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
}

function valueText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function statusIsOpen(status: ClaimStatus): boolean {
  return status === 'OPEN' || status === 'EVIDENCE_REQUESTED' || status === 'UNDER_REVIEW' || status === 'ADMIN_REVIEW';
}

function evidenceTypeForClaim(claim: ClaimRecord): 'PAYMENT_PROOF' | 'CONTRACT_EVIDENCE' | 'SUPPORTING_EVIDENCE' {
  if (claim.type === 'SALARY_NOT_RECEIVED' || claim.type === 'PAYMENT_DISPUTE') return 'PAYMENT_PROOF';
  if (claim.type === 'CONTRACT_INCIDENT') return 'CONTRACT_EVIDENCE';
  return 'SUPPORTING_EVIDENCE';
}

export function createClaimAutomation(dependencies: ClaimAutomationDependencies): SupplementalAutomationProcessor {
  const { database, createStores, createClaimStore } = dependencies;
  const clock = dependencies.now ?? (() => new Date());
  const deadlineMs = dependencies.evidenceDeadlineMs;
  const deadlineConfigurationValid = dependencies.deadlineConfigurationValid ?? true;

  const appendAudit = async (
    stores: AutomationStores,
    claimId: string,
    at: string,
    action: string,
    afterState: Record<string, unknown>,
    eventId?: string,
  ): Promise<void> => {
    await stores.audit.append({
      id: newEntityId('rev'),
      ...(eventId ? { eventId } : {}),
      actorId: SYSTEM,
      timestamp: at,
      entityId: claimId,
      action,
      source: CLAIM_SYSTEM_SOURCE,
      afterState,
    });
  };

  const appendEvent = async (
    stores: AutomationStores,
    input: {
      eventId: string;
      eventType: (typeof CLAIM_EVENT_TYPES)[number];
      claimId: string;
      at: string;
      payload: Record<string, unknown>;
      sourceEventId?: string;
    },
  ): Promise<void> => {
    await stores.outbox.append(createDomainEvent({
      eventId: input.eventId,
      eventType: input.eventType,
      aggregateType: 'CLAIM',
      aggregateId: input.claimId,
      actorId: SYSTEM,
      timestamp: input.at,
      payload: input.payload,
      source: CLAIM_SYSTEM_SOURCE,
      causationId: input.sourceEventId,
    }));
  };

  const reserve = async (
    stores: AutomationStores,
    command: string,
    key: string,
    payload: unknown,
  ): Promise<'reserved' | 'replay'> => {
    const result = await stores.idempotency.reserve({
      actorId: SYSTEM,
      command,
      key,
      payloadHash: await sha256Fingerprint(JSON.stringify(payload)),
    });
    if (result.kind === 'replay') return 'replay';
    if (result.kind === 'conflict') throw new Error('Claim automation idempotency conflict.');
    if (result.kind === 'in-progress') throw new Error('Claim automation already in progress.');
    return 'reserved';
  };

  const deterministicSalaryResolution = async (
    transaction: SqlTransaction,
    claim: ClaimRecord,
  ): Promise<string | null> => {
    if (claim.type !== 'SALARY_NOT_RECEIVED' || !claim.paymentId) return null;
    const payment = (await transaction.query<SalaryFactsRow>(
      `SELECT id, contract_id, candidate_id, employer_id, payment_type, status, amount, currency
         FROM payments WHERE id = $1`,
      [claim.paymentId],
    )).rows[0];
    if (!payment || payment.contract_id !== claim.contractId || payment.payment_type !== 'SALARY' || payment.status !== 'PAID') return null;
    if (payment.candidate_id !== claim.claimantId && payment.candidate_id !== claim.respondentId) return null;
    const confirmation = (await transaction.query<SalaryConfirmationFactsRow>(
      `SELECT payment_id, contract_id, candidate_id, employer_id, amount, currency, confirmed_at, confirmed_by
         FROM salary_confirmations WHERE payment_id = $1`,
      [payment.id],
    )).rows[0];
    if (!confirmation
      || !confirmation.confirmed_at
      || confirmation.confirmed_by !== payment.candidate_id
      || confirmation.contract_id !== payment.contract_id
      || confirmation.candidate_id !== payment.candidate_id
      || confirmation.employer_id !== payment.employer_id
      || Number(confirmation.amount) !== Number(payment.amount)
      || confirmation.currency !== payment.currency) return null;

    // Constat mécanique, jamais un constat de faute : aucune sanction ni opération financière.
    return 'Le paiement salarial est enregistré PAID et la confirmation du salarié correspondante est persistée. Aucun mouvement de fonds n’a été exécuté.';
  };

  const resolveDeterministically = async (
    input: {
      claim: ClaimRecord;
      stores: AutomationStores;
      transaction: SqlTransaction;
      at: string;
      sourceEventId: string;
      from: readonly ClaimStatus[];
    },
  ): Promise<boolean> => {
    const resolution = await deterministicSalaryResolution(input.transaction, input.claim);
    if (!resolution) return false;
    const claims = createClaimStore(input.transaction);
    const updated = await claims.transitionClaim({
      claimId: input.claim.claimId,
      expected: input.from,
      status: 'RESOLVED',
      at: input.at,
      dueAt: null,
      resolvedAt: input.at,
      resolvedBy: SYSTEM,
      resolution,
    });
    if (!updated) return false;
    await claims.releaseActiveRestrictionsForClaim({
      claimId: input.claim.claimId,
      actorId: SYSTEM,
      reason: 'Restriction provisoire révoquée après résolution déterministe.',
      at: input.at,
    });
    await appendEvent(input.stores, {
      eventId: `claim-auto-resolved:${input.claim.claimId}`,
      eventType: 'CLAIM_RESOLVED',
      claimId: input.claim.claimId,
      at: input.at,
      payload: { claimId: input.claim.claimId, resolutionCode: 'SALARY_CONFIRMATION_MATCHED', actorType: 'SYSTEM', fundsMoved: false },
      sourceEventId: input.sourceEventId,
    });
    await appendAudit(input.stores, input.claim.claimId, input.at, 'CLAIM_AUTO_RESOLVED_SALARY_CONFIRMED', {
      fromStatus: input.claim.status,
      toStatus: updated.status,
      resolutionCode: 'SALARY_CONFIRMATION_MATCHED',
      fundsMoved: false,
      faultAttributed: false,
    }, input.sourceEventId);
    return true;
  };

  const scheduleEvidenceDeadline = async (
    stores: AutomationStores,
    transaction: SqlTransaction,
    event: PersistedOutboxEvent,
    at: string,
  ): Promise<void> => {
    const payload = eventPayload(event);
    const claimId = valueText(payload.claimId) ?? event.aggregateId;
    const evidenceRequestId = valueText(payload.evidenceRequestId);
    if (!evidenceRequestId) return;
    const claims = createClaimStore(transaction);
    const claim = await claims.findClaimForUpdate(claimId);
    const evidence = await claims.findEvidenceRequestForUpdate(evidenceRequestId);
    if (!claim || !evidence || evidence.claimId !== claimId || evidence.status !== 'PENDING' || !statusIsOpen(claim.status)) {
      return;
    }
    if (!evidence.dueAt) {
      await appendAudit(stores, claimId, at, 'CLAIM_EVIDENCE_DEADLINE_NOT_CONFIGURED', {
        evidenceRequestId,
        configured: false,
        note: 'Aucune durée par défaut n’est appliquée; le Claim reste ouvert à la revue ADMIN.',
      }, event.eventId);
      return;
    }
    const dueAt = evidence.dueAt;
    const deadlineId = `claim-evidence-deadline:${evidenceRequestId}`;
    await stores.deadlines.createIfAbsent({
      id: deadlineId,
      aggregateType: 'CLAIM',
      aggregateId: claimId,
      kind: 'CLAIM_EVIDENCE',
      dueAt,
      sla: 'Échéance explicitement persistée sur la demande de preuve par la configuration opérateur',
      escalation: 'ADMIN_REVIEW',
      reference: evidenceRequestId,
      idempotencyKey: deadlineId,
      sourceEventId: event.eventId,
      createdAt: at,
    });
    const jobIdempotencyKey = `claim-evidence-job:${evidenceRequestId}`;
    await stores.jobs.createIfAbsent({
      jobId: jobIdempotencyKey,
      jobType: CLAIM_EVIDENCE_DEADLINE_JOB_TYPE,
      aggregateType: 'CLAIM',
      aggregateId: claimId,
      dueAt,
      idempotencyKey: jobIdempotencyKey,
      reference: evidenceRequestId,
      createdAt: at,
    });
    await appendAudit(stores, claimId, at, 'CLAIM_EVIDENCE_DEADLINE_SCHEDULED', {
      evidenceRequestId,
      deadlineId,
      jobId: jobIdempotencyKey,
      dueAt,
      deadlineBasis: 'PERSISTED_EVIDENCE_REQUEST_DUE_AT',
      gracePeriodMs: null,
      escalation: 'ADMIN_REVIEW',
    }, event.eventId);
  };

  const processEvent = async (event: PersistedOutboxEvent): Promise<'completed' | 'duplicate'> => {
    return database.run(async transaction => {
      const stores = createStores(transaction);
      const idempotencyKey = `claim-event:${event.eventId}`;
      const reservation = await reserve(stores, CLAIM_EVENT_COMMAND, idempotencyKey, {
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
      });
      if (reservation === 'replay') return 'duplicate';
      const at = clock().toISOString();
      const claims = createClaimStore(transaction);
      const payload = eventPayload(event);
      const claimId = valueText(payload.claimId) ?? event.aggregateId;
      const claim = await claims.findClaimForUpdate(claimId);

      if (event.eventType === 'CLAIM_CREATED') {
        if (claim && claim.status === 'OPEN') {
          const autoResolved = await resolveDeterministically({
            claim,
            stores,
            transaction,
            at,
            sourceEventId: event.eventId,
            from: ['OPEN'],
          });
          if (!autoResolved && !deadlineConfigurationValid) {
            const updated = await claims.transitionClaim({
              claimId: claim.claimId,
              expected: ['OPEN'],
              status: 'ADMIN_REVIEW',
              at,
              dueAt: null,
            });
            if (!updated) throw new Error('Claim concurrent update during invalid deadline configuration.');
            await appendEvent(stores, {
              eventId: `claim-deadline-config-invalid:${claim.claimId}:${event.eventId}`,
              eventType: 'CLAIM_ESCALATED',
              claimId: claim.claimId,
              at,
              payload: { claimId: claim.claimId, fromStatus: 'OPEN', toStatus: 'ADMIN_REVIEW', reason: 'INVALID_EVIDENCE_DEADLINE_CONFIGURATION', faultAttributed: false },
              sourceEventId: event.eventId,
            });
            await appendAudit(stores, claim.claimId, at, 'CLAIM_DEADLINE_CONFIGURATION_INVALID', {
              fromStatus: 'OPEN',
              toStatus: updated.status,
              evidenceRequestCreated: false,
              faultAttributed: false,
              sanctionApplied: false,
            }, event.eventId);
          } else if (!autoResolved) {
            const evidenceRequestId = newEntityId('evr');
            const dueAt = deadlineMs === null ? undefined : new Date(Date.parse(at) + deadlineMs).toISOString();
            const requested = await claims.createEvidenceRequest({
              evidenceRequestId,
              claimId: claim.claimId,
              requestedFrom: claim.respondentId,
              requestedBy: claim.claimantId,
              requestedType: evidenceTypeForClaim(claim),
              status: 'PENDING',
              createdAt: at,
              ...(dueAt ? { dueAt } : {}),
            });
            const updated = await claims.transitionClaim({
              claimId: claim.claimId,
              expected: ['OPEN'],
              status: 'EVIDENCE_REQUESTED',
              at,
              dueAt: requested.dueAt ?? null,
            });
            if (!updated) throw new Error('Claim concurrent update before evidence request.');
            await appendEvent(stores, {
              eventId: `claim-evidence-requested:${evidenceRequestId}`,
              eventType: 'CLAIM_EVIDENCE_REQUESTED',
              claimId: claim.claimId,
              at,
              payload: {
                claimId: claim.claimId,
                evidenceRequestId,
                requestedFrom: claim.respondentId,
                requestedType: requested.requestedType,
                ...(requested.dueAt ? { dueAt: requested.dueAt } : {}),
              },
              sourceEventId: event.eventId,
            });
            await appendAudit(stores, claim.claimId, at, 'CLAIM_EVIDENCE_REQUESTED', {
              fromStatus: 'OPEN',
              toStatus: 'EVIDENCE_REQUESTED',
              evidenceRequestId,
              requestedFrom: claim.respondentId,
              dueAt: requested.dueAt ?? null,
            }, event.eventId);
          }
        }
      } else if (event.eventType === 'CLAIM_EVIDENCE_REQUESTED') {
        await scheduleEvidenceDeadline(stores, transaction, event, at);
      } else if (event.eventType === 'CLAIM_EVIDENCE_SUBMITTED' && claim && claim.status === 'UNDER_REVIEW') {
        const autoResolved = await resolveDeterministically({
          claim,
          stores,
          transaction,
          at,
          sourceEventId: event.eventId,
          from: ['UNDER_REVIEW'],
        });
        if (!autoResolved) {
          const updated = await claims.transitionClaim({
            claimId: claim.claimId,
            expected: ['UNDER_REVIEW'],
            status: 'ADMIN_REVIEW',
            at,
            dueAt: null,
          });
          if (!updated) throw new Error('Claim concurrent update before ADMIN_REVIEW.');
          await appendEvent(stores, {
            eventId: `claim-evidence-review-required:${claim.claimId}:${valueText(payload.evidenceRequestId) ?? event.eventId}`,
            eventType: 'CLAIM_ESCALATED',
            claimId: claim.claimId,
            at,
            payload: { claimId: claim.claimId, fromStatus: 'UNDER_REVIEW', toStatus: 'ADMIN_REVIEW', reason: 'EVIDENCE_NOT_DETERMINATIVE', faultAttributed: false },
            sourceEventId: event.eventId,
          });
          await appendAudit(stores, claim.claimId, at, 'CLAIM_EVIDENCE_ROUTED_TO_ADMIN', {
            fromStatus: 'UNDER_REVIEW',
            toStatus: 'ADMIN_REVIEW',
            faultAttributed: false,
            automatedSanction: false,
          }, event.eventId);
        }
      }
      await stores.idempotency.complete(SYSTEM, CLAIM_EVENT_COMMAND, idempotencyKey, { handled: event.eventType, claimId });
      return 'completed';
    });
  };

  const processDeadlineJob = async (
    job: AutomationJob,
    now: Date,
    stores: AutomationStores,
    transaction: SqlTransaction,
  ): Promise<void> => {
    const at = now.toISOString();
    const evidenceRequestId = job.reference;
    if (!evidenceRequestId) throw new Error('Claim evidence deadline job missing reference.');
    const reservation = await reserve(stores, CLAIM_DEADLINE_COMMAND, job.idempotencyKey, {
      jobId: job.jobId,
      claimId: job.target.aggregateId,
      evidenceRequestId,
    });
    if (reservation === 'replay') return;
    const claims = createClaimStore(transaction);
    const claim = await claims.findClaimForUpdate(job.target.aggregateId);
    if (!claim) {
      await stores.idempotency.complete(SYSTEM, CLAIM_DEADLINE_COMMAND, job.idempotencyKey, { missingClaim: true });
      return;
    }
    const evidence = await claims.findEvidenceRequestForUpdate(evidenceRequestId);

    const deadlineId = `claim-evidence-deadline:${evidenceRequestId}`;
    if (!evidence || evidence.claimId !== claim.claimId || evidence.status !== 'PENDING') {
      await stores.deadlines.compareAndSetStatus(deadlineId, ['OPEN', 'OVERDUE'], { status: 'MET', at });
      await stores.idempotency.complete(SYSTEM, CLAIM_DEADLINE_COMMAND, job.idempotencyKey, { obsolete: true });
      return;
    }
    if (!evidence.dueAt || Date.parse(evidence.dueAt) > now.getTime()) {
      throw new Error('Claim evidence deadline job ran before its configured deadline.');
    }

    const expired = await claims.transitionEvidenceRequest({
      evidenceRequestId,
      expected: ['PENDING'],
      status: 'EXPIRED',
      at,
      submittedAt: null,
      evidenceReference: null,
    });
    if (!expired) throw new Error('Claim evidence request changed concurrently.');
    await stores.deadlines.compareAndSetStatus(deadlineId, ['OPEN', 'OVERDUE'], { status: 'ESCALATED', at });

    const autoResolved = await resolveDeterministically({
      claim,
      stores,
      transaction,
      at,
      sourceEventId: job.jobId,
      from: [claim.status],
    });
    if (!autoResolved && claim.status === 'EVIDENCE_REQUESTED') {
      const updated = await claims.transitionClaim({
        claimId: claim.claimId,
        expected: ['EVIDENCE_REQUESTED'],
        status: 'ADMIN_REVIEW',
        at,
        dueAt: null,
      });
      if (!updated) throw new Error('Claim concurrent update during deadline escalation.');
      await claims.releaseActiveRestrictionsForClaim({
        claimId: claim.claimId,
        actorId: SYSTEM,
        reason: 'Restriction provisoire révoquée avant revue ADMIN.',
        at,
      });
    }

    await appendEvent(stores, {
      eventId: `claim-deadline-reached:${evidenceRequestId}`,
      eventType: 'CLAIM_DEADLINE_REACHED',
      claimId: claim.claimId,
      at,
      payload: { claimId: claim.claimId, evidenceRequestId, outcome: autoResolved ? 'DETERMINISTIC_RESOLUTION' : 'ADMIN_REVIEW', faultAttributed: false },
      sourceEventId: job.jobId,
    });
    if (!autoResolved) {
      await appendEvent(stores, {
        eventId: `claim-deadline-escalated:${evidenceRequestId}`,
        eventType: 'CLAIM_ESCALATED',
        claimId: claim.claimId,
        at,
        payload: { claimId: claim.claimId, evidenceRequestId, toStatus: 'ADMIN_REVIEW', reason: 'EVIDENCE_DEADLINE_EXPIRED', faultAttributed: false },
        sourceEventId: job.jobId,
      });
    }
    await appendAudit(stores, claim.claimId, at, 'CLAIM_EVIDENCE_DEADLINE_REACHED', {
      evidenceRequestId,
      deadlineStatus: 'ESCALATED',
      claimStatus: autoResolved ? 'RESOLVED' : claim.status === 'EVIDENCE_REQUESTED' ? 'ADMIN_REVIEW' : claim.status,
      silenceAttributedAsFault: false,
      sanctionApplied: false,
      automatedResolution: autoResolved,
    }, job.jobId);
    await stores.idempotency.complete(SYSTEM, CLAIM_DEADLINE_COMMAND, job.idempotencyKey, {
      outcome: autoResolved ? 'RESOLVED' : 'ADMIN_REVIEW',
      faultAttributed: false,
    });
  };

  return {
    handledEventTypes: CLAIM_AUTOMATION_EVENT_TYPES,
    handledJobTypes: [CLAIM_EVIDENCE_DEADLINE_JOB_TYPE],
    handleEvent: processEvent,
    handleJob: processDeadlineJob,
  };
}
