/**
 * LE LABEUR — P0-NOTIFICATIONS — tests d'intégration réels.
 *
 * Chaîne vérifiée de bout en bout :
 *
 *   ÉVÉNEMENT MÉTIER → Outbox (`automation_outbox`) → claim verrouillé du
 *   worker → `AutomationEngine` (inchangé) + processeurs supplémentaires
 *   → `NotificationService` → notification IN-APP persistée
 *   → PUSH → EMAIL (abstractions, providers injectés uniquement en test).
 *
 * Garanties vérifiées : rattachement au bon destinataire, refus de tout
 * destinataire non autorisé, état lu/non lu, idempotence (premier événement,
 * rejeu exact, concurrence, alias d'événement), retry de worker après échec
 * infrastructurel, absence de doublon, abstraction Push, abstraction Email,
 * aucun fournisseur réel composé, et cohérence entre l'audit de couverture et
 * les règles réellement exécutables.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  authRequest,
  authenticateActor,
  createOffersTestHarness,
  type OfferTestResult,
} from '../api/offers.test';
import type { ApplicationRecord, OfferRecord, ProposalRecord } from '../persistence/coreRecords';
import {
  createSqlApplicationStore,
  createSqlContractStore,
  createSqlOfferStore,
  createSqlProposalStore,
} from '../persistence/sqlCoreStores';
import { createSqlAutomationStores } from '../persistence/sqlAutomationStores';
import { createSqlIdentityStores } from '../identity/sqlStores';
import { newEntityId, newOpaqueSessionToken } from '../identity/ids';
import { createDomainEvent } from '../automation/foundation';
import { contractActivatedEventId } from '../../domain/contractScheduleAutomation';
import { contractIdempotencyCache } from '../repositories/contractRepository';
import {
  NOTIFICATION_COVERED_EVENT_TYPES,
  NOTIFICATION_EVENT_COVERAGE,
  resolveNotificationIntents,
} from '../../domain/notificationCatalog';
import { NOTIFICATION_AUTOMATION_EVENT_TYPES } from './notificationAutomation';
import {
  createNotificationChannelRegistry,
  type NotificationChannelProviders,
  type NotificationDeliveryOutcome,
  type NotificationDeliveryTarget,
} from './channels';
import type { NotificationRecord } from './records';
import type { ProposalStatus } from '../../types';
import { composeWorker } from '../api/entry';

type Harness = Awaited<ReturnType<typeof createOffersTestHarness>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SEED_TIMESTAMP = '2026-10-05T15:00:00.000Z';
const HERE = dirname(fileURLToPath(import.meta.url));
const NOTIFICATIONS_MIGRATION = resolve(HERE, '../../../migrations/0012_notifications.sql');

/* ------------------------------------------------------------------ */
/* Seed (mêmes conventions que les tranches précédentes)               */
/* ------------------------------------------------------------------ */

function makeOffer(id: string, employerId: string): OfferRecord {
  return {
    id,
    employerId,
    title: `Offre ${id}`,
    contractType: 'CDI',
    remuneration: 175_000,
    currency: 'FCFA',
    location: 'Cotonou',
    postedDate: SEED_TIMESTAMP,
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Organisation'],
    summary: 'Offre de test P0-NOTIFICATIONS.',
    responsibilities: [],
    conditions: [],
    selectionProcess: [],
    status: 'ACTIVE',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

async function seedAcceptedChain(
  harness: Harness,
  input: { employerId: string; employeeId: string },
): Promise<{ offerId: string; applicationId: string; proposalId: string }> {
  const offerId = newEntityId('ofr');
  await createSqlOfferStore(harness.database).create(makeOffer(offerId, input.employerId));

  const applicationId = newEntityId('app');
  const application: ApplicationRecord = {
    id: applicationId,
    offerId,
    candidateId: input.employeeId,
    status: 'SHORTLISTED',
    appliedDate: SEED_TIMESTAMP,
    history: [{ action: 'Candidature transmise', timestamp: SEED_TIMESTAMP, actor: 'Candidat P0-NOTIFICATIONS' }],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
  await createSqlApplicationStore(harness.database).create(application);

  const proposalId = newEntityId('prp');
  const proposal: ProposalRecord = {
    id: proposalId,
    conversationId: `cnv_${proposalId}`,
    offerId,
    applicationId,
    employerId: input.employerId,
    employeeId: input.employeeId,
    missionTitle: `Mission ${proposalId}`,
    amount: 175_000,
    currency: 'FCFA',
    periodicity: 'Mensuel',
    startDate: '01 Novembre 2026',
    durationMonths: 6,
    location: 'Cotonou',
    conditions: ['Temps plein'],
    status: 'ACCEPTED' as ProposalStatus,
    sentAt: SEED_TIMESTAMP,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
  await createSqlProposalStore(harness.database).create(proposal);

  return { offerId, applicationId, proposalId };
}

function contractActionRequest(
  contractId: string,
  action: 'send' | 'sign' | 'activate',
  token: string,
  key: string,
): Request {
  return authRequest(`/api/v1/contracts/${encodeURIComponent(contractId)}/${action}`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: '{}',
  });
}

/** Parcours API réel : DRAFT → SIGNATURE → (employeur) ACTIVE. */
async function activateContractThroughApi(
  harness: Harness,
  input: { employerToken: string; candidateToken: string; proposalId: string; keyPrefix: string },
): Promise<string> {
  const created = await harness.worker.fetch(authRequest('/api/v1/contracts', input.employerToken, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `${input.keyPrefix}-create` },
    body: JSON.stringify({ proposalId: input.proposalId }),
  }));
  assert(created.status === 201, `création contrat 201 attendue, reçue ${created.status}`);
  const contract = await created.json() as { id: string };

  const sent = await harness.worker.fetch(contractActionRequest(contract.id, 'send', input.employerToken, `${input.keyPrefix}-send`));
  assert(sent.status === 200, `envoi 200 attendu, reçu ${sent.status}`);
  const signed = await harness.worker.fetch(contractActionRequest(contract.id, 'sign', input.candidateToken, `${input.keyPrefix}-sign`));
  assert(signed.status === 200, `signature 200 attendue, reçue ${signed.status}`);
  const activated = await harness.worker.fetch(contractActionRequest(contract.id, 'activate', input.employerToken, `${input.keyPrefix}-activate`));
  assert(activated.status === 200, `activation 200 attendue, reçue ${activated.status}`);
  return contract.id;
}

/** ADMIN provisionné côté serveur : ligne `users` + session, comme P0-DISPUTE-1. */
async function provisionAdmin(harness: Harness): Promise<{ userId: string; token: string }> {
  const userId = newEntityId('usr');
  const token = newOpaqueSessionToken();
  const createdAt = harness.clock.value.toISOString();
  const expiresAt = new Date(harness.clock.value.getTime() + 3_600_000).toISOString();
  const stores = createSqlIdentityStores(harness.database);
  await stores.transaction(async transaction => {
    await transaction.users.create({
      id: userId,
      role: 'ADMIN',
      status: 'ACTIVE',
      email: `admin.notifications.${userId}@example.com`,
      displayName: 'Admin P0-NOTIFICATIONS',
    });
    await transaction.sessions.create({ userId, token, createdAt, expiresAt });
  });
  return { userId, token };
}

/* ------------------------------------------------------------------ */
/* Lectures                                                            */
/* ------------------------------------------------------------------ */

interface NotificationRowShape {
  id: string;
  recipient_id: string;
  recipient_role: string;
  type: string;
  title: string;
  message: string;
  dedupe_key: string;
  is_read: boolean;
  read_at: unknown;
  push_status: string;
  email_status: string;
  created_at: unknown;
  source_event_id: string | null;
  source_event_type: string | null;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload: unknown;
}

function toRecord(row: NotificationRowShape): NotificationRecord {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    recipientRole: row.recipient_role as NotificationRecord['recipientRole'],
    type: row.type as NotificationRecord['type'],
    title: row.title,
    message: row.message,
    dedupeKey: row.dedupe_key,
    isRead: row.is_read,
    ...(row.read_at === null ? {} : { readAt: String(row.read_at) }),
    pushStatus: row.push_status as NotificationRecord['pushStatus'],
    emailStatus: row.email_status as NotificationRecord['emailStatus'],
    createdAt: String(row.created_at),
    updatedAt: String(row.created_at),
    ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    ...(row.source_event_type ? { sourceEventType: row.source_event_type } : {}),
    ...(row.aggregate_type ? { aggregateType: row.aggregate_type } : {}),
    ...(row.aggregate_id ? { aggregateId: row.aggregate_id } : {}),
    payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>,
  };
}

async function readNotifications(harness: Harness, recipientId?: string): Promise<NotificationRecord[]> {
  const result = recipientId
    ? await harness.database.query<NotificationRowShape>(
        'SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at ASC, id ASC',
        [recipientId],
      )
    : await harness.database.query<NotificationRowShape>(
        'SELECT * FROM notifications ORDER BY created_at ASC, id ASC',
      );
  return result.rows.map(toRecord);
}

async function countNotifications(harness: Harness): Promise<number> {
  const result = await harness.database.query<{ count: string }>('SELECT count(*)::text AS count FROM notifications');
  return Number(result.rows[0]?.count ?? 0);
}

interface OutboxRow {
  id: string;
  event_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  payload: unknown;
}

async function readOutboxRow(harness: Harness, eventId: string): Promise<OutboxRow | null> {
  const result = await harness.database.query<OutboxRow>(
    'SELECT id, event_type, status, attempts, last_error, payload FROM automation_outbox WHERE id = $1',
    [eventId],
  );
  return result.rows[0] ?? null;
}

/** Ajoute un événement métier RÉEL dans l'Outbox transactionnelle existante. */
async function appendEvent(
  harness: Harness,
  input: {
    eventId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await createSqlAutomationStores(harness.database).outbox.append(createDomainEvent({
    eventId: input.eventId,
    eventType: input.eventType as never,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    actorId: 'SYSTEM',
    timestamp: harness.clock.value.toISOString(),
    payload: input.payload,
    source: 'test:P0-NOTIFICATIONS',
  }));
}

/**
 * Vide l'Outbox jusqu'à épuisement BORNÉ. Un événement métier peut produire un
 * événement dérivé (ex. `CLAIM_CREATED` → `CLAIM_EVIDENCE_REQUESTED`) qui n'est
 * réclamable qu'à la passe suivante : les baselines de comptage sont donc
 * toujours prises sur une Outbox stabilisée.
 */
async function drainUntilIdle(harness: Harness, maxPasses = 6): Promise<number> {
  let total = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const report = await harness.automationWorker!.drainEvents(50);
    total += report.claimed;
    if (report.claimed === 0) break;
  }
  return total;
}

function notificationTypesFor(records: NotificationRecord[], recipientId: string): string[] {
  return records.filter(record => record.recipientId === recipientId).map(record => record.type);
}

/* ------------------------------------------------------------------ */
/* Providers de test (abstractions Push / Email)                       */
/* ------------------------------------------------------------------ */

interface RecordingProvider {
  providerId: string;
  deliveries: NotificationDeliveryTarget[];
  isConfigured(): boolean;
  deliver(target: NotificationDeliveryTarget): Promise<NotificationDeliveryOutcome>;
}

function createRecordingProvider(providerId: string): RecordingProvider {
  return {
    providerId,
    deliveries: [],
    isConfigured: () => true,
    async deliver(target) {
      this.deliveries.push(target);
      return { status: 'DELIVERED' };
    },
  };
}

function createFailingProvider(providerId: string, failure: 'THROW' | 'FAILED'): RecordingProvider {
  return {
    providerId,
    deliveries: [],
    isConfigured: () => true,
    async deliver(target) {
      this.deliveries.push(target);
      if (failure === 'THROW') throw new Error('provider transient failure');
      return { status: 'FAILED', detail: 'refus temporaire du fournisseur' };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

export async function runNotificationTests(): Promise<OfferTestResult[]> {
  contractIdempotencyCache.clear();
  const results: OfferTestResult[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  /* ---------------- 1. Setup ---------------- */

  const harness = await createOffersTestHarness();

  let employer = { token: '', userId: '' };
  let candidate = { token: '', userId: '' };
  let outsiderEmployer = { token: '', userId: '' };
  let outsiderCandidate = { token: '', userId: '' };
  let admin = { token: '', userId: '' };
  let mainContractId = '';

  try {
    await check('P0-NOTIFICATIONS Setup: parties authentifiées (employeur, travailleur, ADMIN) et tiers hors parties', async () => {
      employer = await authenticateActor(harness, 'employer-1', 'EMPLOYER');
      candidate = await authenticateActor(harness, 'candidate-1', 'CANDIDATE');
      outsiderEmployer = await authenticateActor(harness, 'employer-2', 'EMPLOYER');
      outsiderCandidate = await authenticateActor(harness, 'candidate-2', 'CANDIDATE');
      admin = await provisionAdmin(harness);
      assert(harness.notifications !== undefined, 'le service de notification est composé en PostgreSQL durable');
      assert(employer.userId !== candidate.userId, 'sessions distinctes');
    });

    /* ------------- 2. Chaîne réelle : Outbox → Worker → In-App ------------- */

    let activatedEventId = '';

    await check('P0-NOTIFICATIONS Chaîne réelle: CONTRACT_ACTIVATED → Outbox → Worker → 2 notifications In-App (employeur + travailleur)', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      mainContractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0notif-chain',
      });
      activatedEventId = contractActivatedEventId(mainContractId);

      const beforeDrain = await countNotifications(harness);
      assert(beforeDrain === 0, `aucune notification avant le worker, reçues ${beforeDrain}`);

      // Le worker EXISTANT : l'Automatisation ET la notification partagent le
      // même claim d'Outbox, sans second moteur ni second ordonnanceur.
      const report = await harness.automationWorker!.drainEvents(20);
      assert(report.claimed >= 1, 'l’événement d’activation est réclamé');
      assert(
        report.entries.some(entry => entry.eventId === activatedEventId && entry.result === 'completed'),
        `événement CONTRACT_ACTIVATED traité, reçu ${JSON.stringify(report.entries)}`,
      );

      const records = await readNotifications(harness);
      const employerRecords = records.filter(record => record.recipientId === employer.userId);
      const workerRecords = records.filter(record => record.recipientId === candidate.userId);
      assert(employerRecords.length === 1, `1 notification employeur, reçues ${employerRecords.length}`);
      assert(workerRecords.length === 1, `1 notification travailleur, reçues ${workerRecords.length}`);
      for (const record of records) {
        assert(record.type === 'CONTRACT_ACTIVE', `type réel du modèle, reçu ${record.type}`);
        assert(record.sourceEventId === activatedEventId, 'événement source conservé');
        assert(record.sourceEventType === 'CONTRACT_ACTIVATED', 'type d’événement source conservé');
        assert(record.aggregateType === 'contract' && record.aggregateId === mainContractId, 'agrégat conservé');
        assert(record.isRead === false && record.readAt === undefined, 'non lue à la création');
        assert(record.pushStatus === 'NOT_AVAILABLE' && record.emailStatus === 'NOT_AVAILABLE',
          'aucun canal externe composé : jamais un faux « envoyé »');
      }
      // Non-régression : le travail du moteur d'automatisation EXISTANT a bien
      // eu lieu dans la même passe.
      const contract = await harness.database.query<{ payment_schedule: unknown; status: string }>(
        'SELECT payment_schedule, status FROM contracts WHERE id = $1',
        [mainContractId],
      );
      const schedule = contract.rows[0]?.payment_schedule;
      const scheduleLength = Array.isArray(schedule) ? schedule.length : typeof schedule === 'string' ? (JSON.parse(schedule) as unknown[]).length : 0;
      assert(scheduleLength === 6, `échéancier P0-AUTO-2 intact (6 périodes), reçu ${scheduleLength}`);
      const row = await readOutboxRow(harness, activatedEventId);
      assert(row?.status === 'PROCESSED', `événement PROCESSED, reçu ${row?.status}`);
    });

    /* ------------- 3. Destinataires -------------- */

    await check('P0-NOTIFICATIONS Destinataire: un tiers (hors parties du contrat) ne reçoit jamais la notification', async () => {
      const records = await readNotifications(harness);
      assert(
        records.every(record => record.recipientId === employer.userId || record.recipientId === candidate.userId),
        `destinataires strictement limités aux parties, reçus ${records.map(record => record.recipientId).join(', ')}`,
      );
      assert(
        !records.some(record => record.recipientId === outsiderEmployer.userId || record.recipientId === outsiderCandidate.userId),
        'aucune notification aux tiers',
      );
      // Et un payload usurpé ne détourne pas la résolution : le contrat est la source.
      await appendEvent(harness, {
        eventId: 'p0notif-claim-created-foreign-payload',
        eventType: 'CLAIM_CREATED',
        aggregateType: 'CLAIM',
        aggregateId: 'clm_p0notif_absent',
        payload: { claimId: 'clm_p0notif_absent', contractId: mainContractId, employerId: outsiderEmployer.userId, type: 'CONTRACT_INCIDENT' },
      });
      const report = await harness.automationWorker!.drainEvents(20);
      assert(report.entries.some(entry => entry.eventId === 'p0notif-claim-created-foreign-payload'), 'événement réclamé');
      const after = await readNotifications(harness);
      assert(
        !after.some(record => record.recipientId === outsiderEmployer.userId),
        'un employerId usurpé dans la charge utile n’ouvre AUCUN destinataire',
      );
    });

    /* ------------- 4. In-App : lecture, filtre, pagination -------------- */

    await check('P0-NOTIFICATIONS In-App: liste du propriétaire, filtre UNREAD, pagination par curseur et compteur', async () => {
      const expected = (await readNotifications(harness, employer.userId)).length;
      assert(expected >= 1, 'l’employeur possède au moins la notification d’activation');

      const listed = await harness.worker.fetch(authRequest('/api/v1/my/notifications?limit=10', employer.token));
      assert(listed.status === 200, `200 attendu, reçu ${listed.status}`);
      const page = await listed.json() as { items: Array<{ id: string; recipientId: string; readState: string }>; limit: number; hasMore: boolean; cursor: string | null };
      assert(page.items.length === expected, `${expected} notification(s) employeur, reçues ${page.items.length}`);
      assert(page.items.every(item => item.recipientId === employer.userId), 'aucune notification étrangère dans la liste');
      assert(page.items.every(item => item.readState === 'UNREAD'), 'toutes non lues à ce stade');

      // Pagination réelle : la page suivante est demandée par CURSEUR opaque.
      const firstPage = await harness.worker.fetch(authRequest('/api/v1/my/notifications?limit=1', employer.token));
      const firstBody = await firstPage.json() as { items: Array<{ id: string }>; hasMore: boolean; cursor: string | null };
      assert(firstBody.items.length === 1, 'une seule ligne par page');
      if (expected > 1) {
        assert(firstBody.hasMore === true && firstBody.cursor !== null, 'page suivante annoncée avec un curseur');
        const nextPage = await harness.worker.fetch(
          authRequest(`/api/v1/my/notifications?limit=1&cursor=${encodeURIComponent(firstBody.cursor!)}`, employer.token),
        );
        const nextBody = await nextPage.json() as { items: Array<{ id: string }> };
        assert(nextBody.items.length === 1 && nextBody.items[0].id !== firstBody.items[0].id, 'curseur réellement discriminant');
      } else {
        assert(firstBody.hasMore === false && firstBody.cursor === null, 'pas de page suivante');
      }

      const unread = await harness.worker.fetch(authRequest('/api/v1/my/notifications?state=UNREAD&limit=50', employer.token));
      assert(unread.status === 200, `filtre UNREAD accepté, reçu ${unread.status}`);
      const unreadPage = await unread.json() as { items: unknown[] };
      assert(unreadPage.items.length === expected, 'toutes les notifications non lues sont retournées');

      const invalid = await harness.worker.fetch(authRequest('/api/v1/my/notifications?state=ARCHIVED', employer.token));
      assert(invalid.status === 400, `filtre inconnu refusé (400), reçu ${invalid.status}`);

      // Un tiers ne voit RIEN : la route est strictement propriétaire.
      const outsider = await harness.worker.fetch(authRequest('/api/v1/my/notifications', outsiderEmployer.token));
      assert(outsider.status === 200, `200 attendu pour un compte valide, reçu ${outsider.status}`);
      const outsiderPage = await outsider.json() as { items: unknown[] };
      assert(outsiderPage.items.length === 0, 'aucune notification d’autrui visible');

      // L'ADMIN dispose de sa propre file, sous permission `notifications:read:any`.
      const adminList = await harness.worker.fetch(authRequest('/api/v1/admin/notifications?limit=10', admin.token));
      assert(adminList.status === 200, `file ADMIN attendue (200), reçue ${adminList.status}`);
      const adminAsEmployer = await harness.worker.fetch(authRequest('/api/v1/admin/notifications', employer.token));
      assert(adminAsEmployer.status === 403, `403 attendu pour un employeur, reçu ${adminAsEmployer.status}`);
    });

    /* ------------- 5. État lu / non lu -------------- */

    await check('P0-NOTIFICATIONS Lu/non lu: marquage idempotent d’une notification, rejeu sans second effet, read-all', async () => {
      const records = await readNotifications(harness, employer.userId);
      const target = records[0];
      const command = {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0notif-mark-read-001' },
        body: '{}',
      } as const;

      const first = await harness.worker.fetch(authRequest(`/api/v1/notifications/${target.id}/read`, employer.token, command));
      assert(first.status === 200, `200 attendu, reçu ${first.status}`);
      const marked = await first.json() as { readState: string; readAt?: string };
      assert(marked.readState === 'READ' && marked.readAt !== undefined, 'état lu persisté avec horodatage');

      // Rejeu EXACT de la même commande : même réponse, aucun second effet.
      const replay = await harness.worker.fetch(authRequest(`/api/v1/notifications/${target.id}/read`, employer.token, command));
      assert(replay.status === 200, `rejeu idempotent (200), reçu ${replay.status}`);
      assert(replay.headers.get('content-type') !== null, 'réponse JSON du rejeu');

      const audits = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM automation_audit_ledger WHERE action = 'NOTIFICATION_READ' AND entity_id = $1",
        [target.id],
      );
      assert(Number(audits.rows[0].count) === 1, `une seule entrée d’audit pour la commande, reçue ${audits.rows[0].count}`);

      // Une SECONDE commande (clé différente) reste idempotente sur l'état.
      const second = await harness.worker.fetch(authRequest(`/api/v1/notifications/${target.id}/read`, employer.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0notif-mark-read-002' },
        body: '{}',
      }));
      assert(second.status === 200, `200 attendu, reçu ${second.status}`);
      const stored = await harness.database.query<{ is_read: boolean; read_at: unknown }>(
        'SELECT is_read, read_at FROM notifications WHERE id = $1',
        [target.id],
      );
      assert(stored.rows[0].is_read === true && stored.rows[0].read_at !== null, 'la notification reste lue, sans régression');

      const readAll = await harness.worker.fetch(authRequest('/api/v1/my/notifications/read-all', employer.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0notif-read-all-001' },
        body: '{}',
      }));
      assert(readAll.status === 200, `200 attendu, reçu ${readAll.status}`);
      const unreadAfter = await harness.worker.fetch(authRequest('/api/v1/my/notifications?state=UNREAD', employer.token));
      const unreadPage = await unreadAfter.json() as { items: unknown[] };
      assert(unreadPage.items.length === 0, 'plus aucune notification non lue pour ce propriétaire');
      // Aucune autre boîte n'a été touchée.
      const workerBox = await readNotifications(harness, candidate.userId);
      assert(workerBox.every(record => record.isRead === false), 'la boîte du travailleur est intacte');
    });

    /* ------------- 6. Autorisation -------------- */

    await check('P0-NOTIFICATIONS Autorisation: marquer la notification d’autrui est refusé (404), sans aucun effet', async () => {
      const workerRecords = await readNotifications(harness, candidate.userId);
      const victim = workerRecords[0];
      const response = await harness.worker.fetch(authRequest(`/api/v1/notifications/${victim.id}/read`, outsiderCandidate.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0notif-foreign-read-001' },
        body: '{}',
      }));
      assert(response.status === 404, `404 attendu (aucune fuite d’existence), reçu ${response.status}`);
      const stored = await harness.database.query<{ is_read: boolean }>('SELECT is_read FROM notifications WHERE id = $1', [victim.id]);
      assert(stored.rows[0].is_read === false, 'la notification d’autrui n’a pas été modifiée');

      const missing = await harness.worker.fetch(authRequest('/api/v1/notifications/ntf_absent/read', employer.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'p0notif-missing-read-001' },
        body: '{}',
      }));
      assert(missing.status === 404, `404 attendu pour un identifiant inexistant, reçu ${missing.status}`);

      const anonymous = await harness.worker.fetch(authRequest('/api/v1/my/notifications', null));
      assert(anonymous.status === 401, `401 attendu sans session, reçu ${anonymous.status}`);
    });

    /* ------------- 7. Idempotence et rejeu exact -------------- */

    await check('P0-NOTIFICATIONS Idempotence: un rejeu exact de l’événement ne produit aucune seconde notification', async () => {
      const before = await countNotifications(harness);
      const event = {
        eventId: activatedEventId,
        eventType: 'CONTRACT_ACTIVATED',
        aggregateType: 'contract',
        aggregateId: mainContractId,
        payload: { contractId: mainContractId, employerId: employer.userId, employeeId: candidate.userId },
      };
      const first = await harness.notifications!.deliverForEvent(event);
      assert(first.created === 0 && first.duplicates === 2, `rejeu absorbé, reçu created=${first.created} duplicates=${first.duplicates}`);
      const second = await harness.notifications!.deliverForEvent(event);
      assert(second.created === 0 && second.duplicates === 2, 'second rejeu également absorbé');
      assert(await countNotifications(harness) === before, 'aucune ligne ajoutée par le rejeu');

      // Le rejeu par l'OUTBOX est lui aussi inoffensif : un événement déjà
      // PROCESSED n'est plus réclamé, et un événement rejoué à la main
      // (identifiant neuf, même fait métier) reste dédupliqué.
      await appendEvent(harness, {
        eventId: 'p0notif-replay-new-event-id',
        eventType: 'CONTRACT_ACTIVATED',
        aggregateType: 'contract',
        aggregateId: mainContractId,
        payload: { contractId: mainContractId, employerId: employer.userId, employeeId: candidate.userId },
      });
      const drain = await harness.automationWorker!.drainEvents(20);
      const entry = drain.entries.find(item => item.eventId === 'p0notif-replay-new-event-id');
      assert(entry?.result === 'duplicate', `doublon métier reconnu par la clé de déduplication, reçu ${entry?.result}`);
      assert(await countNotifications(harness) === before, 'aucune seconde notification malgré un identifiant d’événement neuf');
    });

    /* ------------- 8. Concurrence -------------- */

    await check('P0-NOTIFICATIONS Concurrence: deux traitements simultanés du même événement → une seule notification par partie', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0notif-concurrent',
      });
      const eventId = contractActivatedEventId(contractId);
      const event = {
        eventId,
        eventType: 'CONTRACT_ACTIVATED',
        aggregateType: 'contract',
        aggregateId: contractId,
        payload: { contractId, employerId: employer.userId, employeeId: candidate.userId },
      };

      // (a) Deux appels SIMULTANÉS au service : l'index unique PostgreSQL tranche.
      const [left, right] = await Promise.all([
        harness.notifications!.deliverForEvent(event),
        harness.notifications!.deliverForEvent(event),
      ]);
      assert(left.created + right.created === 2, `exactement 2 créations au total, reçu ${left.created + right.created}`);
      assert(left.duplicates + right.duplicates === 2, `2 doublons absorbés, reçu ${left.duplicates + right.duplicates}`);
      const rows = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM notifications WHERE aggregate_id = $1',
        [contractId],
      );
      assert(Number(rows.rows[0].count) === 2, `2 lignes pour ce contrat, reçues ${rows.rows[0].count}`);

      // (b) Deux workers simultanés : le claim verrouillé distribue le message
      //     à UN SEUL ; l'autre ne réclame rien.
      const reports = await Promise.all([
        harness.automationWorker!.drainEvents(20),
        harness.automationWorker!.drainEvents(20),
      ]);
      const claimedIds = reports.flatMap(report => report.entries.map(entry => entry.eventId));
      assert(claimedIds.includes(eventId), 'l’événement est bien traité par une passe');
      assert(reports.reduce((total, report) => total + report.claimed, 0) === 1, 'un seul claim pour deux workers');
      const after = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM notifications WHERE aggregate_id = $1',
        [contractId],
      );
      assert(Number(after.rows[0].count) === 2, 'toujours 2 notifications : aucun doublon concurrent');
      const outbox = await readOutboxRow(harness, eventId);
      assert(outbox?.attempts === 1, `une seule tentative, reçue ${outbox?.attempts}`);
    });

    /* ------------- 9. Retry de worker après échec -------------- */

    await check('P0-NOTIFICATIONS Retry: un échec réel du worker laisse l’événement RETRYABLE puis aboutit sans doublon', async () => {
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const contractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: chain.proposalId,
        keyPrefix: 'p0notif-retry',
      });
      const eventId = contractActivatedEventId(contractId);

      // Panne réaliste et transitoire : la boîte In-App n'existe plus.
      await harness.pg.exec('DROP TABLE notifications');
      const failed = await harness.automationWorker!.drainEvents(20);
      const failedEntry = failed.entries.find(entry => entry.eventId === eventId);
      assert(failedEntry?.result === 'retryable', `RETRYABLE attendu, reçu ${failedEntry?.result}`);
      const retryableRow = await readOutboxRow(harness, eventId);
      assert(retryableRow?.status === 'RETRYABLE' && retryableRow.attempts === 1, 'statut RETRYABLE persisté');
      assert(Boolean(retryableRow.last_error), 'l’erreur réelle est conservée sans secret');

      // Rétablissement de l'infrastructure, puis reprise après le délai de rejeu.
      await harness.pg.exec(readFileSync(NOTIFICATIONS_MIGRATION, 'utf8'));
      const available = await harness.database.query<{ available_at: unknown }>(
        'SELECT available_at FROM automation_outbox WHERE id = $1',
        [eventId],
      );
      harness.clock.value = new Date(new Date(String(available.rows[0].available_at)).getTime() + 1_000);

      const recovered = await harness.automationWorker!.drainEvents(20);
      const recoveredEntry = recovered.entries.find(entry => entry.eventId === eventId);
      // La reprise aboutit : l'événement n'est plus RETRYABLE. Le moteur
      // d'automatisation EXISTANT peut légitimement répondre `duplicate` pour
      // son propre effet d'agrégat (échéancier déjà écrit à la première
      // tentative) — c'est précisément pourquoi la notification ne dépend PAS
      // de son verdict et porte sa propre idempotence.
      assert(
        recoveredEntry !== undefined && recoveredEntry.result !== 'retryable',
        `reprise attendue sans nouveau retry, reçue ${recoveredEntry?.result}`,
      );
      const rows = await harness.database.query<{ recipient_id: string; count: string }>(
        'SELECT recipient_id, count(*)::text AS count FROM notifications WHERE aggregate_id = $1 GROUP BY recipient_id ORDER BY recipient_id',
        [contractId],
      );
      assert(rows.rows.length === 2, `2 destinataires distincts, reçus ${rows.rows.length}`);
      assert(rows.rows.every(row => Number(row.count) === 1), 'exactement une notification par partie après reprise');
      const processed = await readOutboxRow(harness, eventId);
      assert(processed?.status === 'PROCESSED' && processed.attempts === 2, `PROCESSED après 2 tentatives, reçu ${processed?.status}/${processed?.attempts}`);

      // Une troisième passe ne réclame plus rien.
      harness.clock.value = new Date(harness.clock.value.getTime() + 60_000);
      const idle = await harness.automationWorker!.drainEvents(20);
      assert(idle.claimed === 0, 'un événement PROCESSED n’est jamais rejoué');
      const stable = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM notifications WHERE aggregate_id = $1',
        [contractId],
      );
      assert(Number(stable.rows[0].count) === 2, 'aucune notification supplémentaire après stabilisation');
    });

    /* ------------- 10/11. Couverture des événements -------------- */

    await check('P0-NOTIFICATIONS Paiement: échéance, déclaration, vérification, rejet et salaire produisent les notifications du modèle', async () => {
      // Dans le cycle réel, le salaire et la commission d'une même période sont
      // DEUX lignes `payments` distinctes : les identifiants le reflètent, et la
      // clé d'idempotence documentée (`paymentId + DUE`) reste donc exacte.
      await drainUntilIdle(harness);
      const salaryPaymentId = 'pay_p0notif_salary';
      const commissionPaymentId = 'pay_p0notif_commission';
      const base = { contractId: mainContractId, employerId: employer.userId, candidateId: candidate.userId, currency: 'FCFA' };

      // PAYMENT_DUE (salaire) → employeur, MONTHLY_CHECKPOINT (convention DEMO).
      await appendEvent(harness, {
        eventId: 'p0notif-payment-due-salary', eventType: 'PAYMENT_DUE', aggregateType: 'payment', aggregateId: salaryPaymentId,
        payload: { ...base, paymentId: salaryPaymentId, paymentType: 'SALARY', monthNumber: 1, periodKey: 'M1', amount: 175_000, dueDate: '2026-11-01' },
      });
      await harness.automationWorker!.drainEvents(20);
      let records = await readNotifications(harness, employer.userId);
      assert(notificationTypesFor(records, employer.userId).includes('MONTHLY_CHECKPOINT'), 'MONTHLY_CHECKPOINT pour l’échéance de salaire');

      // PAYMENT_DUE (commission) → employeur, COMMISSION_DUE.
      await appendEvent(harness, {
        eventId: 'p0notif-payment-due-commission', eventType: 'PAYMENT_DUE', aggregateType: 'payment', aggregateId: commissionPaymentId,
        payload: { ...base, paymentId: commissionPaymentId, paymentType: 'COMMISSION', monthNumber: 1, periodKey: 'M1', amount: 43_750, dueDate: '2026-11-01' },
      });
      await harness.automationWorker!.drainEvents(20);
      records = await readNotifications(harness, employer.userId);
      assert(records.filter(record => record.type === 'COMMISSION_DUE').length === 1, 'COMMISSION_DUE pour l’échéance de commission');

      // PAYMENT_DECLARED (salaire) → travailleur, SALARY_DECLARED.
      await appendEvent(harness, {
        eventId: 'p0notif-payment-declared-salary', eventType: 'PAYMENT_DECLARED', aggregateType: 'payment', aggregateId: salaryPaymentId,
        payload: { ...base, paymentId: salaryPaymentId, paymentType: 'SALARY', periodKey: 'M1', amount: 175_000, declarationId: 'dec-1' },
      });
      await harness.automationWorker!.drainEvents(20);
      let workerRecords = await readNotifications(harness, candidate.userId);
      assert(workerRecords.filter(record => record.type === 'SALARY_DECLARED').length === 1, 'SALARY_DECLARED pour le travailleur');
      const workerCountAfterDeclared = workerRecords.length;

      // PAYMENT_PENDING_VERIFICATION est un ALIAS durable : même clé, zéro doublon.
      await appendEvent(harness, {
        eventId: 'p0notif-payment-pending-salary', eventType: 'PAYMENT_PENDING_VERIFICATION', aggregateType: 'payment', aggregateId: salaryPaymentId,
        payload: { ...base, paymentId: salaryPaymentId, paymentType: 'SALARY', periodKey: 'M1', amount: 175_000 },
      });
      const aliasDrain = await harness.automationWorker!.drainEvents(20);
      const aliasEntry = aliasDrain.entries.find(entry => entry.eventId === 'p0notif-payment-pending-salary');
      assert(aliasEntry?.result === 'duplicate', `alias reconnu comme doublon, reçu ${aliasEntry?.result}`);
      workerRecords = await readNotifications(harness, candidate.userId);
      assert(workerRecords.length === workerCountAfterDeclared, 'aucune seconde notification pour un alias d’événement');

      // PAYMENT_APPROVED puis PAYMENT_VERIFIED (alias) sur une COMMISSION → employeur.
      await appendEvent(harness, {
        eventId: 'p0notif-payment-approved-commission', eventType: 'PAYMENT_APPROVED', aggregateType: 'payment', aggregateId: commissionPaymentId,
        payload: { ...base, paymentId: commissionPaymentId, paymentType: 'COMMISSION', periodKey: 'M1', amount: 43_750 },
      });
      await appendEvent(harness, {
        eventId: 'p0notif-payment-verified-commission', eventType: 'PAYMENT_VERIFIED', aggregateType: 'payment', aggregateId: commissionPaymentId,
        payload: { ...base, paymentId: commissionPaymentId, paymentType: 'COMMISSION', periodKey: 'M1', amount: 43_750 },
      });
      await harness.automationWorker!.drainEvents(20);
      records = await readNotifications(harness, employer.userId);
      assert(records.filter(record => record.type === 'COMMISSION_VERIFIED').length === 1, 'COMMISSION_VERIFIED une seule fois malgré l’alias');

      // PAYMENT_REJECTED (commission) → employeur, COMMISSION_REJECTED.
      await appendEvent(harness, {
        eventId: 'p0notif-payment-rejected-commission', eventType: 'PAYMENT_REJECTED', aggregateType: 'payment', aggregateId: commissionPaymentId,
        payload: { ...base, paymentId: commissionPaymentId, paymentType: 'COMMISSION', periodKey: 'M1', amount: 43_750, reason: 'Référence illisible.' },
      });
      // PAYMENT_PAID (salaire) → travailleur (confirmation attendue), puis
      // SALARY_CONFIRMATION_REQUESTED, qui porte LA MÊME clé logique.
      //
      // Ces deux événements sont livrés DIRECTEMENT au service, sans passer par
      // l'Outbox : le consommateur P0-SALARY-1 EXISTANT de l'automatisation
      // exige une ligne `payments` réelle, hors périmètre de cette tranche, et
      // échouerait sur un identifiant synthétique. Les autres événements de
      // paiement ci-dessus passent bien par la chaîne Outbox → worker réelle.
      const paidReport = await harness.notifications!.deliverForEvent({
        eventId: 'p0notif-payment-paid-salary', eventType: 'PAYMENT_PAID', aggregateType: 'payment', aggregateId: salaryPaymentId,
        payload: { ...base, paymentId: salaryPaymentId, paymentType: 'SALARY', periodKey: 'M1', amount: 175_000 },
      });
      assert(paidReport.created === 1, `PAYMENT_PAID notifie le travailleur, reçu ${paidReport.created}`);
      const confirmationReport = await harness.notifications!.deliverForEvent({
        eventId: 'p0notif-salary-confirmation-requested', eventType: 'SALARY_CONFIRMATION_REQUESTED',
        aggregateType: 'payment', aggregateId: salaryPaymentId,
        payload: { paymentId: salaryPaymentId, contractId: mainContractId },
      });
      assert(
        confirmationReport.created === 0 && confirmationReport.duplicates === 1,
        `SALARY_CONFIRMATION_REQUESTED porte la même clé que PAYMENT_PAID, reçu created=${confirmationReport.created}`,
      );
      // SALARY_CONFIRMED → employeur.
      await appendEvent(harness, {
        eventId: 'p0notif-salary-confirmed', eventType: 'SALARY_CONFIRMED', aggregateType: 'payment', aggregateId: salaryPaymentId,
        payload: { paymentId: salaryPaymentId, contractId: mainContractId, periodKey: 'M1', amount: '175000' },
      });
      await harness.automationWorker!.drainEvents(20);

      records = await readNotifications(harness, employer.userId);
      workerRecords = await readNotifications(harness, candidate.userId);
      assert(records.filter(record => record.type === 'COMMISSION_REJECTED').length === 1, 'COMMISSION_REJECTED pour l’employeur');
      assert(records.filter(record => record.type === 'SALARY_CONFIRMED').length === 1, 'SALARY_CONFIRMED pour l’employeur (déclaration du salarié)');
      assert(workerRecords.filter(record => record.type === 'SALARY_DECLARED').length === 2,
        `la demande de confirmation de salaire reste UNE seule notification, reçue ${workerRecords.filter(record => record.type === 'SALARY_DECLARED').length}`);
    });

    await check('P0-NOTIFICATIONS Rappels: NOTIFICATION_REQUIRED et PAYMENT_OVERDUE_J3 utilisent le PAYLOAD (type et destinataires) sans rien inventer', async () => {
      await drainUntilIdle(harness);
      const employerBefore = (await readNotifications(harness, employer.userId)).length;
      const adminBefore = (await readNotifications(harness, admin.userId)).length;
      const commissionDueBefore = (await readNotifications(harness, employer.userId))
        .filter(record => record.type === 'COMMISSION_DUE').length;

      await appendEvent(harness, {
        eventId: 'p0notif-reminder-due-commission',
        eventType: 'NOTIFICATION_REQUIRED',
        aggregateType: 'contract',
        aggregateId: mainContractId,
        payload: {
          contractId: mainContractId, employerId: employer.userId, employeeId: candidate.userId,
          scheduleEntryId: `PSE-${mainContractId}-M1`, monthNumber: 1, periodKey: 'M1', paymentKind: 'COMMISSION',
          stage: 'DUE', dueDate: '2026-11-05', daysLate: 0, amount: 43_750, currency: 'FCFA',
          notificationType: 'COMMISSION_DUE', recipientKinds: ['EMPLOYER'],
          dedupeKey: `${mainContractId}:1:COMMISSION:DUE`,
        },
      });
      // Un type de notification INEXISTANT dans le modèle ne produit rien.
      await appendEvent(harness, {
        eventId: 'p0notif-reminder-invented-type',
        eventType: 'NOTIFICATION_REQUIRED',
        aggregateType: 'contract',
        aggregateId: mainContractId,
        payload: { contractId: mainContractId, employerId: employer.userId, notificationType: 'INVENTED_TYPE', dedupeKey: 'invented' },
      });
      // J+3 : le producteur déclare `['EMPLOYER','ADMIN']`.
      await appendEvent(harness, {
        eventId: 'p0notif-reminder-j3',
        eventType: 'PAYMENT_OVERDUE_J3',
        aggregateType: 'contract',
        aggregateId: mainContractId,
        payload: {
          contractId: mainContractId, employerId: employer.userId, employeeId: candidate.userId,
          scheduleEntryId: `PSE-${mainContractId}-M1`, paymentKind: 'SALARY', stage: 'J3', dueDate: '2026-11-01',
          daysLate: 4, amount: 175_000, currency: 'FCFA', recipientKinds: ['EMPLOYER', 'ADMIN'],
          dedupeKey: `${mainContractId}:1:SALARY:J3`,
        },
      });
      const reminderEventIds = ['p0notif-reminder-due-commission', 'p0notif-reminder-invented-type', 'p0notif-reminder-j3'];
      const drain = await harness.automationWorker!.drainEvents(50);
      const reminderEntries = drain.entries.filter(entry => reminderEventIds.includes(entry.eventId));
      assert(reminderEntries.length === 3, `3 événements de rappel traités, reçus ${reminderEntries.length}`);
      assert(
        reminderEntries.every(entry => entry.result === 'completed'),
        `aucun échec sur les rappels, reçu ${JSON.stringify(reminderEntries)}`,
      );

      const employerAfter = await readNotifications(harness, employer.userId);
      const adminAfter = await readNotifications(harness, admin.userId);
      assert(employerAfter.length === employerBefore + 2, `2 notifications employeur ajoutées, reçues ${employerAfter.length - employerBefore}`);
      assert(
        employerAfter.filter(record => record.type === 'COMMISSION_DUE').length === commissionDueBefore + 1,
        'le type de notification vient du payload (`COMMISSION_DUE`), jamais d’une hypothèse',
      );
      assert(adminAfter.length === adminBefore + 1, '1 seule notification ADMIN (J+3), jamais un élargissement');
      assert(adminAfter.some(record => record.type === 'PAYMENT_OVERDUE_J3'), 'J+3 au type réel du modèle');
      const invented = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM notifications WHERE source_event_id = $1',
        ['p0notif-reminder-invented-type'],
      );
      assert(Number(invented.rows[0].count) === 0, 'aucun type de notification inventé n’est jamais écrit');
    });

    await check('P0-NOTIFICATIONS Litige: CLAIM_CREATED est traité par le Claim ET notifié, l’escalade atteint les ADMIN autorisés uniquement', async () => {
      const claimId = newEntityId('clm');
      await harness.database.query(
        `INSERT INTO claims (
           claim_id, contract_id, claimant_id, respondent_id, type, reason, status,
           created_at, idempotency_key, updated_at, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}'::jsonb)`,
        [claimId, mainContractId, candidate.userId, employer.userId, 'CONTRACT_INCIDENT',
          'Litige de test P0-NOTIFICATIONS.', 'OPEN', SEED_TIMESTAMP, `key:${claimId}`, SEED_TIMESTAMP],
      );
      const eventsBefore = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM automation_outbox WHERE event_type = 'CLAIM_EVIDENCE_REQUESTED' AND aggregate_id = $1",
        [claimId],
      );

      await appendEvent(harness, {
        eventId: `p0notif-claim-created:${claimId}`,
        eventType: 'CLAIM_CREATED',
        aggregateType: 'CLAIM',
        aggregateId: claimId,
        payload: { claimId, contractId: mainContractId, type: 'CONTRACT_INCIDENT' },
      });
      const drain = await harness.automationWorker!.drainEvents(20);
      const entry = drain.entries.find(item => item.eventId === `p0notif-claim-created:${claimId}`);
      assert(entry?.result === 'completed', `événement traité, reçu ${entry?.result}`);

      // Le consommateur Claim EXISTANT a bien fait son travail dans la même passe.
      const eventsAfter = await harness.database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM automation_outbox WHERE event_type = 'CLAIM_EVIDENCE_REQUESTED' AND aggregate_id = $1",
        [claimId],
      );
      assert(Number(eventsAfter.rows[0].count) > Number(eventsBefore.rows[0].count) || Number(eventsAfter.rows[0].count) > 0,
        'le processeur Claim conserve son effet : l’événement n’est pas « volé » par la notification');

      const claimNotifications = await harness.database.query<{ recipient_id: string; type: string }>(
        'SELECT recipient_id, type FROM notifications WHERE source_event_id = $1 ORDER BY recipient_id',
        [`p0notif-claim-created:${claimId}`],
      );
      const recipients = claimNotifications.rows.map(row => row.recipient_id);
      assert(recipients.includes(employer.userId) && recipients.includes(candidate.userId), 'les deux parties sont notifiées');
      assert(recipients.includes(admin.userId), 'l’ADMIN autorisé est notifié');
      assert(!recipients.includes(outsiderEmployer.userId) && !recipients.includes(outsiderCandidate.userId), 'aucun tiers notifié');
      assert(claimNotifications.rows.every(row => row.type === 'INCIDENT_REPORTED'), 'type réel du modèle pour un litige ouvert');

      // Un ADMIN désactivé n'est JAMAIS destinataire. Le second litige porte
      // sur un AUTRE contrat : la contrainte PostgreSQL interdit deux dossiers
      // ouverts sur la même cible (elle n'est pas contournée par les tests).
      const secondChain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const secondContractId = await activateContractThroughApi(harness, {
        employerToken: employer.token,
        candidateToken: candidate.token,
        proposalId: secondChain.proposalId,
        keyPrefix: 'p0notif-claim-second',
      });
      const inactive = newEntityId('usr');
      await harness.database.query(
        "INSERT INTO users (id, role, status, email, display_name) VALUES ($1,'ADMIN','BLOCKED',$2,$3)",
        [inactive, `admin.blocked.${inactive}@example.com`, 'Admin bloqué'],
      );
      const newClaimId = newEntityId('clm');
      await harness.database.query(
        `INSERT INTO claims (
           claim_id, contract_id, claimant_id, respondent_id, type, reason, status,
           created_at, idempotency_key, updated_at, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}'::jsonb)`,
        [newClaimId, secondContractId, candidate.userId, employer.userId, 'CONTRACT_INCIDENT',
          'Second litige de test.', 'OPEN', SEED_TIMESTAMP, `key:${newClaimId}`, SEED_TIMESTAMP],
      );
      await appendEvent(harness, {
        eventId: `p0notif-claim-created-2:${newClaimId}`,
        eventType: 'CLAIM_CREATED',
        aggregateType: 'CLAIM',
        aggregateId: newClaimId,
        payload: { claimId: newClaimId, contractId: secondContractId, type: 'CONTRACT_INCIDENT' },
      });
      await harness.automationWorker!.drainEvents(20);
      const inactiveRows = await harness.database.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM notifications WHERE recipient_id = $1',
        [inactive],
      );
      assert(Number(inactiveRows.rows[0].count) === 0, 'un compte ADMIN inactif ne reçoit rien');
    });

    await check('P0-NOTIFICATIONS Candidature/Proposition: les règles existent pour des producteurs futurs et restent rattachées aux bonnes parties', async () => {
      await drainUntilIdle(harness);
      const chain = await seedAcceptedChain(harness, { employerId: employer.userId, employeeId: candidate.userId });
      const employerBefore = (await readNotifications(harness, employer.userId)).length;
      const workerBefore = (await readNotifications(harness, candidate.userId)).length;

      await appendEvent(harness, {
        eventId: `p0notif-application-submitted:${chain.applicationId}`,
        eventType: 'APPLICATION_SUBMITTED',
        aggregateType: 'application',
        aggregateId: chain.applicationId,
        payload: { applicationId: chain.applicationId, offerId: chain.offerId, candidateId: candidate.userId, employerId: employer.userId },
      });
      await appendEvent(harness, {
        eventId: `p0notif-application-shortlisted:${chain.applicationId}`,
        eventType: 'APPLICATION_SHORTLISTED',
        aggregateType: 'application',
        aggregateId: chain.applicationId,
        payload: { applicationId: chain.applicationId, offerId: chain.offerId, candidateId: candidate.userId, actorId: employer.userId },
      });
      await appendEvent(harness, {
        eventId: `p0notif-proposal-sent:${chain.proposalId}`,
        eventType: 'PROPOSAL_SENT',
        aggregateType: 'proposal',
        aggregateId: chain.proposalId,
        payload: { proposalId: chain.proposalId, conversationId: `cnv_${chain.proposalId}`, employerId: employer.userId, employeeId: candidate.userId },
      });
      const drain = await harness.automationWorker!.drainEvents(20);

      const employerAfter = await readNotifications(harness, employer.userId);
      const workerAfter = await readNotifications(harness, candidate.userId);
      assert(
        employerAfter.length === employerBefore + 1,
        `la candidature notifie l’employeur propriétaire (avant ${employerBefore}, après ${employerAfter.length}, `
          + `traitements ${JSON.stringify(drain.entries.map(entry => [entry.eventType, entry.result]))})`,
      );
      assert(employerAfter.some(record => record.type === 'NEW_APPLICATION'), 'type NEW_APPLICATION du modèle');
      assert(workerAfter.length === workerBefore + 2, 'la shortlist et la proposition notifient le travailleur');
      assert(workerAfter.some(record => record.type === 'APPLICATION_SHORTLISTED') && workerAfter.some(record => record.type === 'PROPOSAL_RECEIVED'),
        'types du modèle respectés');
    });

    /* ------------- 12. Événements non couverts -------------- */

    await check('P0-NOTIFICATIONS Non couvert: aucun événement UNMAPPED n’est réclamé ni transformé en notification', async () => {
      const before = await countNotifications(harness);
      const unmapped = ['PROPOSAL_EXPIRED', 'CONTRACT_ENDED', 'APPLICATION_EXAMINED'] as const;
      for (const eventType of unmapped) {
        await appendEvent(harness, {
          eventId: `p0notif-unmapped:${eventType}`,
          eventType,
          aggregateType: 'contract',
          aggregateId: mainContractId,
          payload: { contractId: mainContractId, employerId: employer.userId, employeeId: candidate.userId },
        });
      }
      const drain = await harness.automationWorker!.drainEvents(50);
      assert(
        drain.entries.every(entry => !unmapped.includes(entry.eventType as never)),
        `aucun événement UNMAPPED réclamé, reçu ${drain.entries.map(entry => entry.eventType).join(', ')}`,
      );
      for (const eventType of unmapped) {
        const row = await readOutboxRow(harness, `p0notif-unmapped:${eventType}`);
        assert(row?.status === 'PENDING' && row.attempts === 0, `${eventType} reste PENDING sans consumer`);
        assert(resolveNotificationIntents({
          eventId: row.id, eventType, aggregateType: 'contract', aggregateId: mainContractId, payload: {},
        }).length === 0, `${eventType} ne produit aucune intention`);
      }
      assert(await countNotifications(harness) === before, 'aucune notification produite pour un événement non couvert');
    });

    await check('P0-NOTIFICATIONS Audit de couverture: la liste typée des événements consommés est EXACTEMENT la couverture MAPPED', async () => {
      const declared = NOTIFICATION_EVENT_COVERAGE.filter(entry => entry.status === 'MAPPED').map(entry => entry.eventType).sort();
      const typed = [...NOTIFICATION_AUTOMATION_EVENT_TYPES].sort();
      assert(
        JSON.stringify(declared) === JSON.stringify(typed),
        `couverture déclarée et liste exécutable identiques, reçu ${JSON.stringify({ declared, typed })}`,
      );
      assert(
        JSON.stringify([...NOTIFICATION_COVERED_EVENT_TYPES].sort()) === JSON.stringify(declared),
        'l’exposition `NOTIFICATION_COVERED_EVENT_TYPES` reste alignée',
      );
      for (const entry of NOTIFICATION_EVENT_COVERAGE) {
        if (entry.status === 'UNMAPPED') {
          assert(Boolean(entry.reason && entry.reason.length > 20), `raison d’exclusion documentée pour ${entry.eventType}`);
        }
      }
      // Les événements exigés par la commande sont audités, sous leur nom RÉEL.
      const audited = NOTIFICATION_EVENT_COVERAGE.map(entry => entry.eventType);
      for (const required of [
        'APPLICATION_SUBMITTED', 'APPLICATION_SHORTLISTED', 'APPLICATION_REJECTED', 'PROPOSAL_SENT',
        'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED', 'CONTRACT_ACTIVATED', 'CONTRACT_TERMINATED',
        'PAYMENT_DUE', 'PAYMENT_VERIFIED', 'PAYMENT_PAID', 'SALARY_CONFIRMATION_REQUESTED',
        'CLAIM_CREATED', 'CLAIM_RESOLVED', 'EXECUTION_CONFIRMED', 'CONTRACT_ENDED', 'REPLACEMENT_CREATED',
      ]) {
        assert(audited.includes(required), `événement audité: ${required}`);
      }
    });

    /* ------------- 13. Périmètre -------------- */

    await check('P0-NOTIFICATIONS Périmètre: séparation DEMO/API, aucun canal externe composé, aucune table de fournisseur', async () => {
      const tables = await harness.database.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND (table_name ILIKE '%email%' OR table_name ILIKE '%sms%' OR table_name ILIKE '%whatsapp%'
                 OR table_name ILIKE '%push%' OR table_name ILIKE '%device%' OR table_name ILIKE '%provider%'
                 OR table_name ILIKE '%webhook%' OR table_name ILIKE '%otp%' OR table_name ILIKE '%aggregator%'
                 OR table_name ILIKE '%mobile_money%')`,
      );
      assert(tables.rows.length === 0, `aucune table de canal externe, trouvées ${tables.rows.map(row => row.table_name).join(', ')}`);

      const inApp = await harness.database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'notifications'`,
      );
      assert(Number(inApp.rows[0].count) === 1, 'la boîte In-App est la SEULE table de la tranche');

      const uniques = await harness.database.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
           AND indexname = 'notifications_recipient_dedupe_unique_idx'`,
      );
      assert(uniques.rows.length === 1, 'l’unicité (destinataire, clé de déduplication) est portée par PostgreSQL');

      // Composition de PRODUCTION (aucun provider injecté) : push et email
      // restent indisponibles et le sont de façon observable, sans secret.
      const plain = composeWorker(
        { GOOGLE_CLIENT_ID: 'p0notif-audience', PERSISTENCE: 'postgres' },
        harness.database,
      );
      assert(plain.notificationChannels.push === null && plain.notificationChannels.email === null,
        'aucun fournisseur Push/Email n’est composé');
      assert(plain.notifications !== undefined, 'le service In-App est composé avec la base durable');

      const memory = composeWorker({ GOOGLE_CLIENT_ID: 'p0notif-audience', PERSISTENCE: 'memory' });
      assert(memory.notifications === undefined, 'aucune notification sans base durable');
      assert(memory.automationWorker === undefined, 'aucun worker sans base durable');

      const closed = composeWorker({ GOOGLE_CLIENT_ID: '' });
      assert(closed.notifications === undefined, 'aucune notification en frontière fermée');

      // Sans base durable, la route reste FERMÉE (501), jamais 200 sur des données inventées.
      const closedHandlers = composeWorker({ GOOGLE_CLIENT_ID: 'p0notif-audience', PERSISTENCE: 'memory' });
      const closedResponse = await closedHandlers.worker.fetch(authRequest('/api/v1/my/notifications', 'session-inexistante'));
      assert(
        closedResponse.status === 401 || closedResponse.status === 501,
        `route fermée sans base durable (401/501), reçu ${closedResponse.status}`,
      );
    });

    /* ------------- 14/15. Push et Email (abstractions) -------------- */

    const pushProvider = createRecordingProvider('fake-push-local');
    const emailProvider = createRecordingProvider('fake-email-local');
    const providers: NotificationChannelProviders = { push: pushProvider, email: emailProvider };
    const withChannels = await createOffersTestHarness(undefined, {
      notificationChannels: createNotificationChannelRegistry(providers),
    });

    try {
      const channelEmployer = await authenticateActor(withChannels, 'employer-1', 'EMPLOYER');
      const channelCandidate = await authenticateActor(withChannels, 'candidate-1', 'CANDIDATE');

      await check('P0-NOTIFICATIONS Push: l’abstraction livre réellement quand un provider est injecté, dans l’ordre In-App → Push → Email', async () => {
        const chain = await seedAcceptedChain(withChannels, { employerId: channelEmployer.userId, employeeId: channelCandidate.userId });
        const contractId = await activateContractThroughApi(withChannels, {
          employerToken: channelEmployer.token,
          candidateToken: channelCandidate.token,
          proposalId: chain.proposalId,
          keyPrefix: 'p0notif-push',
        });
        await withChannels.automationWorker!.drainEvents(20);

        const rows = await withChannels.database.query<{ id: string; push_status: string; email_status: string; is_read: boolean; created_at: unknown }>(
          'SELECT id, push_status, email_status, is_read, created_at FROM notifications WHERE aggregate_id = $1 ORDER BY id',
          [contractId],
        );
        assert(rows.rows.length === 2, `2 notifications, reçues ${rows.rows.length}`);
        assert(rows.rows.every(row => row.push_status === 'DELIVERED'), 'push livré par le provider injecté');
        assert(rows.rows.every(row => row.email_status === 'DELIVERED'), 'email livré par le provider injecté');
        assert(pushProvider.deliveries.length === 2, `2 livraisons Push, reçues ${pushProvider.deliveries.length}`);
        assert(emailProvider.deliveries.length === 2, `2 livraisons Email, reçues ${emailProvider.deliveries.length}`);
        // L'In-App précède : la notification existe AVANT tout appel externe.
        const pushIds = pushProvider.deliveries.map(delivery => delivery.notificationId).sort();
        assert(
          JSON.stringify(pushIds) === JSON.stringify(rows.rows.map(row => row.id).sort()),
          'le canal Push ne reçoit que des notifications déjà persistées en In-App',
        );
        for (const delivery of pushProvider.deliveries) {
          assert(delivery.recipientId === channelEmployer.userId || delivery.recipientId === channelCandidate.userId, 'destinataires réels');
          assert(delivery.recipientRole === 'EMPLOYER' || delivery.recipientRole === 'CANDIDATE', 'rôle réel du compte');
        }
        assert(withChannels.notifications !== undefined, 'service composé');
      });

      await check('P0-NOTIFICATIONS Email/Push: un échec de fournisseur est enregistré sans détruire la notification In-App', async () => {
        const failingPush = createFailingProvider('fake-push-failing', 'THROW');
        const failingEmail = createFailingProvider('fake-email-failing', 'FAILED');
        const extra = await createOffersTestHarness(undefined, {
          notificationChannels: createNotificationChannelRegistry({ push: failingPush, email: failingEmail }),
        });
        try {
          const extraEmployer = await authenticateActor(extra, 'employer-1', 'EMPLOYER');
          const extraCandidate = await authenticateActor(extra, 'candidate-1', 'CANDIDATE');
          const chain = await seedAcceptedChain(extra, { employerId: extraEmployer.userId, employeeId: extraCandidate.userId });
          const contractId = await activateContractThroughApi(extra, {
            employerToken: extraEmployer.token,
            candidateToken: extraCandidate.token,
            proposalId: chain.proposalId,
            keyPrefix: 'p0notif-failing-channel',
          });
          const drain = await extra.automationWorker!.drainEvents(20);
          const entry = drain.entries.find(item => item.aggregateId === contractId);
          assert(entry?.result === 'completed', `l’échec de canal n’échoue PAS la notification In-App, reçu ${entry?.result}`);
          const rows = await extra.database.query<{ push_status: string; email_status: string }>(
            'SELECT push_status, email_status FROM notifications WHERE aggregate_id = $1',
            [contractId],
          );
          assert(rows.rows.length === 2, 'les 2 notifications In-App existent malgré les échecs de canal');
          assert(rows.rows.every(row => row.push_status === 'FAILED'), 'l’exception du provider est enregistrée FAILED, jamais DELIVERED');
          assert(rows.rows.every(row => row.email_status === 'FAILED'), 'le refus du provider est enregistré FAILED');
        } finally {
          await extra.close();
        }
      });
    } finally {
      await withChannels.close();
    }
  } finally {
    await harness.close();
    contractIdempotencyCache.clear();
  }

  return results;
}
