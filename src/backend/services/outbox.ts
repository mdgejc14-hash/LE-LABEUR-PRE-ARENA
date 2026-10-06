import type { OutboxEvent, OutboxEventType, OutboxRepository } from '../productionContracts';

export interface OutboxEffectContract {
  eventType: OutboxEventType;
  sideEffects: readonly string[];
  idempotencyKey: string;
}

/**
 * Provider-neutral catalogue of event intents. This catalogue is not itself a
 * dispatcher: individual P0 modules own their producers and consumers. Payment
 * and salary events, for example, use the durable PostgreSQL outbox; the salary
 * confirmation consumer is not a notification channel or a fund transfer.
 *
 * P0-NOTIFICATIONS — the In-App notification layer now OBSERVES a documented
 * subset of these events through the EXISTING automation worker
 * (`SupplementalAutomationProcessor`): the event is still owned by its producer
 * consumer, and the notification projection runs in addition, idempotently, on
 * the same outbox claim. Push and Email remain code-level abstractions only:
 * no real provider, no secret and no production configuration is installed.
 * The exhaustive per-event audit lives in
 * `src/domain/notificationCatalog.ts` (`NOTIFICATION_EVENT_COVERAGE`).
 */
export const OUTBOX_EFFECT_CONTRACTS: readonly OutboxEffectContract[] = [
  { eventType: 'PAYMENT_DECLARED', sideEffects: ['notify the relevant reviewer', 'update payment activity feed'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_SUBMITTED', sideEffects: ['alias for PAYMENT_DECLARED', 'update payment activity feed'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_APPROVED', sideEffects: ['notify employer and employee', 'refresh schedule state'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_VERIFIED', sideEffects: ['alias for PAYMENT_APPROVED', 'refresh schedule state'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_REJECTED', sideEffects: ['notify employer with the recorded reason', 'refresh schedule state'], idempotencyKey: 'event.id' },
  /**
   * Cycle CONTRAT — porté par P0-F.
   *
   * `CONTRACT_SIGNED` était déjà déclaré ; les autres types du cycle sont
   * ajoutés ici comme contrats DÉCLARÉS pour le futur moteur Outbox/Queue :
   * aucun producteur, aucune table, aucun consumer n'existe à ce stade. Les
   * transitions (création, envoi, signature, activation, fin, rupture) sont
   * persistées dans la transaction métier sans effet secondaire asynchrone.
   * Charges utiles et clés de déduplication de référence :
   * `src/domain/contractTransitions.ts` (`DOCUMENTED_CONTRACT_EVENTS`).
   */
  { eventType: 'CONTRACT_SIGNED', sideEffects: ['notify both parties', 'refresh offer and application views'], idempotencyKey: 'contractId + SIGNED + party' },
  { eventType: 'CONTRACT_CREATED', sideEffects: ['no asynchronous effect in P0-F'], idempotencyKey: 'contractId + CREATED' },
  { eventType: 'CONTRACT_SENT', sideEffects: ['notify the target employee (rule ready; the producer belongs to a later tranche)'], idempotencyKey: 'contractId + SENT' },
  { eventType: 'CONTRACT_ACTIVATED', sideEffects: ['refresh offer and application views', 'notify employer AND worker (CONTRACT_ACTIVE, In-App)', 'FILLED / HIRED automation stays a later step'], idempotencyKey: 'contractId + ACTIVATED' },
  { eventType: 'CONTRACT_ENDED', sideEffects: ['close the mission for both parties'], idempotencyKey: 'contractId + ENDED' },
  { eventType: 'CONTRACT_TERMINATED', sideEffects: ['freeze the schedule and notify the OTHER party (rule ready; the producer belongs to a later tranche)'], idempotencyKey: 'contractId + TERMINATED' },
  { eventType: 'INCIDENT_OPENED', sideEffects: ['notify authorized participants and Admin queue'], idempotencyKey: 'event.id' },
  { eventType: 'INCIDENT_DECIDED', sideEffects: ['notify incident participants of the recorded decision'], idempotencyKey: 'event.id' },
  { eventType: 'REPLACEMENT_CREATED', sideEffects: ['notify the authorized replacement workflow'], idempotencyKey: 'event.id' },
  { eventType: 'CANDIDATE_TRANSFERRED', sideEffects: ['notify the candidate and employer', 'refresh replacement and contract views'], idempotencyKey: 'event.id' },
  { eventType: 'ACCOUNT_BLOCKED', sideEffects: ['notify the account owner and authorized Admins'], idempotencyKey: 'event.id' },
  { eventType: 'ACCOUNT_UNBLOCKED', sideEffects: ['notify the account owner'], idempotencyKey: 'event.id' },
  { eventType: 'PAYMENT_OVERDUE_J3', sideEffects: ['notify employer and authorized Admins', 'record scheduler audit event'], idempotencyKey: 'schedule-entry + payment-kind + due-date + J3' },
  /**
   * P0-PAY-1 — cycle PAIEMENT réellement produit dans l'Outbox transactionnelle
   * (`automation_outbox`). P0-SALARY-1 consomme `PAYMENT_PAID` pour les seuls
   * salaires et déclenche la demande de confirmation existante; aucun consumer
   * de notification ni aucun canal externe n'est branché. `PAYMENT_DECLARED`
   * porte la déclaration de l'employeur; `PAYMENT_APPROVED` la vérification
   * favorable; `PAYMENT_REJECTED` le rejet motivé. Les payloads de référence sont
   * décrits dans `src/domain/paymentLifecycle.ts` (`DOCUMENTED_PAYMENT_EVENTS`).
   */
  { eventType: 'PAYMENT_DUE', sideEffects: ['notify the employer (MONTHLY_CHECKPOINT / COMMISSION_DUE) through the notification layer'], idempotencyKey: 'paymentId + DUE' },
  { eventType: 'PAYMENT_PENDING_VERIFICATION', sideEffects: ['queue the declaration for Admin review', 'durable alias of PAYMENT_DECLARED for notifications: same dedupe key, never two notifications'], idempotencyKey: 'paymentId + PENDING_VERIFICATION + attemptNumber' },
  { eventType: 'PAYMENT_PAID', sideEffects: ['request P0-SALARY-1 worker confirmation for SALARY only', 'notify the worker that a confirmation is expected', 'no worker confirmation and no fund movement are implied'], idempotencyKey: 'paymentId + PAID' },
  /** P0-PAY-3 : l'Outbox ne fait qu'ordonner un job idempotent de batch; aucun mouvement ni canal. */
  { eventType: 'PAYMENT_RECONCILIATION_BATCH_REQUESTED', sideEffects: ['enqueue the bounded reconciliation job in automation_jobs; no payment transition or fund movement'], idempotencyKey: 'batchId + initial' },
  /**
   * P0-DISPUTE-1 — le Claim, sa demande de preuve et son escalade restent des
   * événements d'Outbox transactionnels. Aucun consumer de notification n'est
   * branché dans cette tranche; le silence n'est jamais une décision de fond.
   */
  { eventType: 'CLAIM_CREATED', sideEffects: ['start deterministic claim checks', 'notify the recorded parties and the authorised Admin queue (In-App)'], idempotencyKey: 'claimId + CREATED' },
  { eventType: 'CLAIM_EVIDENCE_REQUESTED', sideEffects: ['schedule the configured evidence deadline through automation_jobs', 'notify the recorded parties (In-App)'], idempotencyKey: 'evidenceRequestId + REQUESTED' },
  { eventType: 'CLAIM_EVIDENCE_SUBMITTED', sideEffects: ['evaluate only persisted deterministic facts; otherwise route to ADMIN_REVIEW', 'notify the recorded parties (In-App)'], idempotencyKey: 'evidenceRequestId + SUBMITTED' },
  { eventType: 'CLAIM_DEADLINE_REACHED', sideEffects: ['record expiry and prepare escalation; silence alone does not imply fault', 'notify the recorded parties and the Admin queue (In-App)'], idempotencyKey: 'evidenceRequestId + DEADLINE_REACHED' },
  { eventType: 'CLAIM_ESCALATED', sideEffects: ['route an ambiguous case to ADMIN_REVIEW; no automatic sanction', 'notify the recorded parties and the Admin queue (In-App)'], idempotencyKey: 'claimId + evidenceRequestId + ESCALATED' },
  { eventType: 'CLAIM_RESTRICTION_APPLIED', sideEffects: ['apply a temporary, reversible CONTRACT_TERMINATE restriction only'], idempotencyKey: 'restrictionId + APPLIED' },
  { eventType: 'CLAIM_RESTRICTION_RELEASED', sideEffects: ['release a temporary restriction; no other capability is changed'], idempotencyKey: 'restrictionId + RELEASED' },
  { eventType: 'CLAIM_RESOLVED', sideEffects: ['record a deterministic or ADMIN resolution; no refund or fund movement', 'notify the recorded parties and the Admin queue (In-App)'], idempotencyKey: 'claimId + RESOLVED' },
  { eventType: 'CLAIM_REJECTED', sideEffects: ['record an ADMIN rejection; no account sanction', 'notify the recorded parties and the Admin queue (In-App)'], idempotencyKey: 'claimId + REJECTED' },
  /**
   * P0-E3/P0-E4 — cycle CANDIDATURE.
   *
   * Contrats DÉCLARÉS pour le futur moteur Outbox/Queue : aucun producteur,
   * aucune table, aucun consumer n'existe à ce stade. Les transitions
   * (soumission, examen, shortlist, rejet, retrait) sont persistées dans la
   * transaction métier sans effet secondaire asynchrone. Les charges utiles et
   * clés de déduplication de référence sont décrites dans
   * `src/domain/applicationTransitions.ts` (`DOCUMENTED_APPLICATION_EVENTS`).
   */
  { eventType: 'APPLICATION_SUBMITTED', sideEffects: ['notify the offer owner (rule ready in the notification layer; the producer belongs to a later tranche)'], idempotencyKey: 'applicationId + SUBMITTED' },
  { eventType: 'APPLICATION_EXAMINED', sideEffects: ['refresh the employer application view'], idempotencyKey: 'applicationId + EXAMINED' },
  { eventType: 'APPLICATION_SHORTLISTED', sideEffects: ['notify the shortlisted candidate (rule ready in the notification layer; the producer belongs to a later tranche)'], idempotencyKey: 'applicationId + SHORTLISTED' },
  { eventType: 'APPLICATION_REJECTED', sideEffects: ['notify the candidate with the recorded reason (rule ready in the notification layer; the producer belongs to a later tranche)'], idempotencyKey: 'applicationId + REJECTED' },
  { eventType: 'APPLICATION_WITHDRAWN', sideEffects: ['notify the offer owner of the withdrawal (rule ready in the notification layer; the producer belongs to a later tranche)'], idempotencyKey: 'applicationId + WITHDRAWN' },
  /**
   * P0-E5 — cycle PROPOSITION d'embauche.
   *
   * Contrats DÉCLARÉS pour le futur moteur Outbox/Queue : aucun producteur,
   * aucune table Outbox, aucun consumer n'existe à ce stade. L'émission,
   * l'acceptation, la déclinaison et l'expiration sont persistées dans la
   * transaction métier sans effet secondaire asynchrone. Les charges utiles et
   * clés de déduplication de référence sont décrites dans
   * `src/domain/proposalTransitions.ts` (`DOCUMENTED_PROPOSAL_EVENTS`).
   * La nomenclature du code est conservée : `DECLINED`, jamais `REJECTED`.
   */
  { eventType: 'PROPOSAL_SENT', sideEffects: ['notify the target candidate (rule ready in the notification layer; the producer belongs to a later tranche)'], idempotencyKey: 'proposalId + SENT' },
  { eventType: 'PROPOSAL_ACCEPTED', sideEffects: ['notify the emitting employer (rule ready; the producer belongs to a later tranche)', 'prepare contract creation in the next step'], idempotencyKey: 'proposalId + ACCEPTED' },
  { eventType: 'PROPOSAL_DECLINED', sideEffects: ['notify the emitting employer (rule ready; the producer belongs to a later tranche)'], idempotencyKey: 'proposalId + DECLINED' },
  { eventType: 'PROPOSAL_EXPIRED', sideEffects: ['close the proposal for both parties'], idempotencyKey: 'proposalId + EXPIRED' },
] as const;

export interface OutboxConsumer {
  /** Consumer must be safe to replay the same event ID. */
  consume(event: OutboxEvent): Promise<void>;
}

export interface OutboxDispatcherBoundary {
  dispatchBatch(input: {
    repository: OutboxRepository;
    consumer: OutboxConsumer;
    consumerName: string;
    limit: number;
    now: string;
  }): Promise<{ claimed: number; delivered: number; retried: number }>;
}
