/**
 * LE LABEUR — P0-NOTIFICATIONS — catalogue PUR des règles de notification.
 *
 * Ce module ne touche à aucune base, à aucun réseau et à aucun canal : il
 * transforme un ÉVÉNEMENT MÉTIER existant en INTENTIONS de notification
 * (destinataires visés, type, titre, message, clé de déduplication).
 *
 * RÈGLE ABSOLUE DE CETTE TRANCHE : aucun événement et aucun type de
 * notification n'est inventé.
 *  - les événements sont ceux DÉJÀ déclarés par le dépôt
 *    (`OutboxEventType` + les événements de la fondation P0-AUTO-1) ;
 *  - les types de notification sont ceux DÉJÀ déclarés par le modèle
 *    (`NotificationType`, `src/types/index.ts`) ;
 *  - les destinataires suivent la convention DÉJÀ appliquée par le moteur DEMO
 *    (`src/repositories/mockRepository.ts`), qui est la référence de
 *    comportement du produit.
 *
 * Les événements pour lesquels le modèle n'offre AUCUN type de notification
 * honnête sont déclarés `UNMAPPED` dans `NOTIFICATION_EVENT_COVERAGE` avec la
 * raison exacte : c'est le résultat d'audit de couverture exigé par la tranche,
 * et il n'est jamais remplacé par un type approximatif.
 */

import type { NotificationType } from '../types';

/* ------------------------------------------------------------------ */
/* Audit de couverture (résultat de l'audit obligatoire)               */
/* ------------------------------------------------------------------ */

export type NotificationCoverageStatus = 'MAPPED' | 'UNMAPPED';

export interface NotificationEventCoverage {
  /** Nom RÉEL de l'événement dans le dépôt. */
  readonly eventType: string;
  /** Nom(s) cité(s) par la commande, quand la nomenclature diffère. */
  readonly requestedAs?: string;
  readonly status: NotificationCoverageStatus;
  /** Producteur réel de l'événement (fichier), ou `null` s'il n'existe pas. */
  readonly producer: string | null;
  /** Consommateur réel de l'événement dans cette tranche. */
  readonly consumer: string;
  /** Raison, obligatoire pour un `UNMAPPED`. */
  readonly reason?: string;
}

/**
 * Couverture complète, événement par événement. `producer: null` signifie que
 * l'événement est DÉCLARÉ mais pas encore ÉMIS par le dépôt (contrat documenté
 * d'une tranche antérieure) : la règle de notification existe et s'appliquera
 * dès qu'un producteur l'émettra, sans qu'aucun code ne soit à réécrire.
 */
export const NOTIFICATION_EVENT_COVERAGE: readonly NotificationEventCoverage[] = [
  /* ---- CANDIDATURE ---- */
  { eventType: 'APPLICATION_SUBMITTED', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'APPLICATION_EXAMINED', status: 'UNMAPPED', producer: null, consumer: 'NotificationAutomation', reason: 'Aucun effet documenté côté candidat (rafraîchissement de la vue employeur) et aucun `NotificationType` correspondant dans le modèle.' },
  { eventType: 'APPLICATION_SHORTLISTED', requestedAs: 'APPLICATION_DECISION', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'APPLICATION_REJECTED', requestedAs: 'APPLICATION_DECISION', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'APPLICATION_WITHDRAWN', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },

  /* ---- PROPOSITION ---- */
  { eventType: 'PROPOSAL_SENT', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'PROPOSAL_ACCEPTED', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'PROPOSAL_DECLINED', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'PROPOSAL_EXPIRED', status: 'UNMAPPED', producer: null, consumer: 'NotificationAutomation', reason: 'Le modèle ne déclare aucun `NotificationType` d’expiration de proposition ; en inventer un serait une nomenclature nouvelle.' },

  /* ---- CONTRAT ---- */
  { eventType: 'CONTRACT_CREATED', status: 'UNMAPPED', producer: null, consumer: 'NotificationAutomation', reason: 'Le contrat d’événement documenté déclare explicitement « aucune notification » pour la création.' },
  { eventType: 'CONTRACT_SENT', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'CONTRACT_SIGNED', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'CONTRACT_ACTIVATED', status: 'MAPPED', producer: 'src/backend/repositories/contractRepository.ts', consumer: 'NotificationAutomation (en plus du handler CONTRACT_ACTIVATED existant)' },
  { eventType: 'WEBRTC_SESSION_INVITED', status: 'MAPPED', producer: 'src/backend/webrtc/webrtcRepository.ts', consumer: 'NotificationAutomation (Outbox existante; invitation In-App uniquement)' },
  { eventType: 'CONTRACT_ENDED', requestedAs: 'CONTRACT_COMPLETED', status: 'UNMAPPED', producer: null, consumer: 'NotificationAutomation', reason: 'Le modèle ne déclare aucun `NotificationType` de fin de mission et le moteur DEMO n’en produit aucun sur la fin normale.' },
  { eventType: 'CONTRACT_TERMINATED', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation' },
  { eventType: 'EXECUTION_CONFIRMED', requestedAs: 'EXECUTION_CONFIRMED', status: 'UNMAPPED', producer: 'src/backend/repositories/contractRepository.ts (entrée d’HISTORIQUE, aucun événement d’Outbox)', consumer: 'NotificationAutomation', reason: 'Nom réel du dépôt, mais il n’existe QUE comme entrée d’historique de contrat : aucun événement d’Outbox n’est émis, donc aucun déclencheur ne peut le porter sans créer un producteur hors périmètre.' },

  /* ---- PAIEMENT / SALAIRE ---- */
  { eventType: 'PAYMENT_DUE', status: 'MAPPED', producer: 'src/backend/repositories/paymentRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'PAYMENT_DECLARED', status: 'MAPPED', producer: 'src/backend/repositories/paymentRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'PAYMENT_PENDING_VERIFICATION', status: 'MAPPED', producer: 'src/backend/repositories/paymentRepository.ts', consumer: 'NotificationAutomation (alias durable de PAYMENT_DECLARED : même clé de déduplication, donc jamais deux notifications)' },
  { eventType: 'PAYMENT_APPROVED', requestedAs: 'PAYMENT_VERIFIED', status: 'MAPPED', producer: 'src/backend/repositories/paymentRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'PAYMENT_VERIFIED', requestedAs: 'PAYMENT_VERIFIED', status: 'MAPPED', producer: null, consumer: 'NotificationAutomation (alias documenté de PAYMENT_APPROVED : même règle, même clé)' },
  { eventType: 'PAYMENT_PAID', status: 'MAPPED', producer: 'src/backend/repositories/paymentRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'PAYMENT_REJECTED', status: 'MAPPED', producer: 'src/backend/repositories/paymentRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'PAYMENT_OVERDUE_J3', status: 'MAPPED', producer: 'src/backend/automation/contractActivation.ts', consumer: 'NotificationAutomation' },
  { eventType: 'NOTIFICATION_REQUIRED', requestedAs: 'PAYMENT_DUE / rappels d’échéance', status: 'MAPPED', producer: 'src/backend/automation/contractActivation.ts', consumer: 'NotificationAutomation (le type de notification vient du PAYLOAD, jamais d’une hypothèse)' },
  { eventType: 'SALARY_CONFIRMATION_REQUESTED', requestedAs: 'SALARY_CONFIRMATION', status: 'MAPPED', producer: 'src/backend/payments/salaryConfirmation.ts', consumer: 'NotificationAutomation' },
  { eventType: 'SALARY_CONFIRMED', requestedAs: 'SALARY_CONFIRMATION', status: 'MAPPED', producer: 'src/backend/payments/salaryConfirmation.ts', consumer: 'NotificationAutomation' },

  /* ---- LITIGE ---- */
  { eventType: 'CLAIM_CREATED', requestedAs: 'CLAIM_OPENED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts', consumer: 'ClaimAutomation (consommateur historique) ET NotificationAutomation : le claim est traité par les deux processeurs, l’événement n’est jamais « volé ».' },
  { eventType: 'CLAIM_EVIDENCE_REQUESTED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts + claimAutomation.ts', consumer: 'ClaimAutomation ET NotificationAutomation' },
  { eventType: 'CLAIM_EVIDENCE_SUBMITTED', requestedAs: 'CLAIM_UPDATED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts', consumer: 'ClaimAutomation ET NotificationAutomation' },
  { eventType: 'CLAIM_DEADLINE_REACHED', requestedAs: 'CLAIM_UPDATED', status: 'MAPPED', producer: 'src/backend/disputes/claimAutomation.ts', consumer: 'NotificationAutomation' },
  { eventType: 'CLAIM_ESCALATED', requestedAs: 'CLAIM_UPDATED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts + claimAutomation.ts', consumer: 'NotificationAutomation' },
  { eventType: 'CLAIM_RESTRICTION_APPLIED', requestedAs: 'CLAIM_UPDATED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'CLAIM_RESTRICTION_RELEASED', requestedAs: 'CLAIM_UPDATED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'CLAIM_RESOLVED', requestedAs: 'CLAIM_RESOLVED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts + claimAutomation.ts', consumer: 'NotificationAutomation' },
  { eventType: 'CLAIM_REJECTED', requestedAs: 'CLAIM_RESOLVED', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts', consumer: 'NotificationAutomation' },

  /* ---- REMPLACEMENT ---- */
  { eventType: 'REPLACEMENT_CREATED', requestedAs: 'REPLACEMENT', status: 'MAPPED', producer: 'src/backend/disputes/claimRepository.ts', consumer: 'NotificationAutomation' },
  { eventType: 'CANDIDATE_TRANSFERRED', requestedAs: 'REPLACEMENT', status: 'UNMAPPED', producer: null, consumer: 'Aucun', reason: 'Le transfert direct est volontairement fermé : le candidat ne rejoint jamais un engagement sans candidature, proposition et consentement. Aucun producteur parallèle n’est installé.' },

  /* ---- COMPTE / INCIDENT (hors commande, conservés pour l’audit) ---- */
  { eventType: 'INCIDENT_OPENED', requestedAs: 'CLAIM_OPENED (équivalent historique)', status: 'UNMAPPED', producer: null, consumer: 'Aucun', reason: 'Le dépôt produit `CLAIM_*` pour les incidents contractuels (`claimRepository`) : `INCIDENT_*` n’a plus de producteur et serait un doublon.' },
  { eventType: 'INCIDENT_DECIDED', requestedAs: 'CLAIM_RESOLVED (équivalent historique)', status: 'UNMAPPED', producer: null, consumer: 'Aucun', reason: 'Idem : la décision administrateur est produite sous `CLAIM_RESOLVED` / `CLAIM_REJECTED`.' },
  { eventType: 'ACCOUNT_BLOCKED', status: 'UNMAPPED', producer: null, consumer: 'Aucun', reason: 'Aucun producteur d’Outbox dans le backend (le blocage de compte est un domaine non ouvert) ; la convention de notification existe côté DEMO et sera réutilisée par la tranche qui produira l’événement.' },
  { eventType: 'ACCOUNT_UNBLOCKED', status: 'UNMAPPED', producer: null, consumer: 'Aucun', reason: 'Même raison que `ACCOUNT_BLOCKED`.' },

  /* ---- Hors périmètre explicite ---- */
  { eventType: 'PAYMENT_RECONCILIATION_BATCH_REQUESTED', status: 'UNMAPPED', producer: 'src/backend/payments/paymentReconciliationBatch.ts', consumer: 'Aucun', reason: 'Événement d’exploitation interne (batch de rapprochement) : il n’est destiné à aucune partie métier, donc aucune notification n’est produite.' },
  { eventType: 'PAYMENT_DECLARED_ALIAS_PAYMENT_SUBMITTED', requestedAs: 'PAYMENT_SUBMITTED', status: 'UNMAPPED', producer: null, consumer: 'Aucun', reason: '`PAYMENT_SUBMITTED` est documenté comme ALIAS de `PAYMENT_DECLARED`, qui est déjà couvert : une règle dédiée créerait un doublon.' },
] as const;

/** Événements pour lesquels une règle de notification existe réellement. */
export const NOTIFICATION_COVERED_EVENT_TYPES: readonly string[] = NOTIFICATION_EVENT_COVERAGE
  .filter(entry => entry.status === 'MAPPED')
  .map(entry => entry.eventType);

/* ------------------------------------------------------------------ */
/* Intentions de notification                                          */
/* ------------------------------------------------------------------ */

/**
 * Sélecteur de destinataire. `EMPLOYER` = employeur de l'événement,
 * `WORKER` = travailleur/candidat de l'événement, `ADMIN` = administrateurs
 * ACTIFS autorisés (`notifications:read:any`), `OTHER_PARTY` = la partie qui
 * n'est PAS l'auteur de l'action (`payload.party`).
 *
 * Aucun sélecteur « tous les utilisateurs » n'existe : la diffusion globale est
 * structurellement impossible.
 */
export type NotificationAudienceSelector = 'EMPLOYER' | 'WORKER' | 'ADMIN' | 'OTHER_PARTY';

export interface NotificationEventLike {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface NotificationIntent {
  /** `NotificationType` réel du modèle. */
  notificationType: NotificationType;
  title: string;
  message: string;
  audiences: readonly NotificationAudienceSelector[];
  link?: { screen: string; id?: string };
  /**
   * Clé de déduplication LOGIQUE (indépendante du destinataire) : la clé
   * persistée est `(recipientId, dedupeKey)`, donc un rejeu de l'événement, un
   * retry de worker ou un doublon d'alias ne créent jamais deux notifications
   * pour la même partie.
   */
  dedupeKey: string;
  /** Payload structuré conservé sur la notification (identifiants métier). */
  payload: Record<string, unknown>;
}

function text(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function amount(payload: Record<string, unknown>): string | undefined {
  const value = payload.amount ?? payload.monthlySalary;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('fr-FR');
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

function money(payload: Record<string, unknown>): string {
  const value = amount(payload);
  const currency = text(payload, 'currency');
  if (!value) return '';
  return ` ${value}${currency ? ` ${currency}` : ''}`;
}

function period(payload: Record<string, unknown>): string {
  const key = text(payload, 'periodKey') ?? text(payload, 'monthNumber');
  return key ? ` (${key})` : '';
}

/** Types de notification RÉELS du modèle, utilisés pour valider un payload. */
const KNOWN_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'NEW_APPLICATION', 'APPLICATION_SHORTLISTED', 'APPLICATION_REJECTED', 'APPLICATION_WITHDRAWN',
  'NEW_MESSAGE', 'VOICE_MESSAGE', 'INCOMING_CALL', 'MISSED_CALL',
  'PROPOSAL_RECEIVED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_DECLINED', 'PROPOSAL_REVISION_REQUESTED',
  'CONTRACT_PENDING_SIGNATURE', 'CONTRACT_SIGNED', 'CONTRACT_ACTIVE',
  'MISSION_START_REQUIRED', 'MISSION_CONFIRMED', 'MISSION_DIVERGENCE',
  'MONTHLY_CHECKPOINT', 'SALARY_DECLARED', 'SALARY_CONFIRMED', 'SALARY_CONTESTED',
  'COMMISSION_DUE', 'COMMISSION_DECLARED', 'COMMISSION_VERIFIED', 'COMMISSION_REJECTED',
  'PAYMENT_OVERDUE_J3', 'ACCOUNT_BLOCKED', 'ACCOUNT_UNBLOCKED',
  'INCIDENT_REPORTED', 'INCIDENT_DECIDED', 'REPLACEMENT_INITIATED',
  'URGENT_JOB_PUBLISHED', 'CANDIDATE_TRANSFERRED',
];

export function isKnownNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (KNOWN_NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/**
 * Résout les intentions d'un événement. Retourne un tableau VIDE quand
 * l'événement est `UNMAPPED` : c'est une décision d'audit explicite, jamais un
 * oubli silencieux.
 */
export function resolveNotificationIntents(event: NotificationEventLike): NotificationIntent[] {
  const payload = event.payload ?? {};
  const aggregateId = event.aggregateId;

  switch (event.eventType) {
    /* ---------------- CANDIDATURE ---------------- */
    case 'APPLICATION_SUBMITTED':
      return [{
        notificationType: 'NEW_APPLICATION',
        title: 'Nouvelle candidature reçue',
        message: 'Un candidat a postulé à votre offre. Consultez la candidature pour la traiter.',
        audiences: ['EMPLOYER'],
        link: { screen: 'APPLICATIONS', id: text(payload, 'applicationId') ?? aggregateId },
        dedupeKey: `application:${aggregateId}:SUBMITTED`,
        payload: { applicationId: text(payload, 'applicationId') ?? aggregateId, offerId: text(payload, 'offerId') },
      }];
    case 'APPLICATION_SHORTLISTED':
      return [{
        notificationType: 'APPLICATION_SHORTLISTED',
        title: 'Dossier sélectionné',
        message: 'Votre dossier a été retenu par l’employeur. Une conversation peut s’ouvrir pour la suite du processus.',
        audiences: ['WORKER'],
        link: { screen: 'MESSAGES', id: text(payload, 'applicationId') ?? aggregateId },
        dedupeKey: `application:${aggregateId}:SHORTLISTED`,
        payload: { applicationId: text(payload, 'applicationId') ?? aggregateId, offerId: text(payload, 'offerId') },
      }];
    case 'APPLICATION_REJECTED': {
      const reason = text(payload, 'reason');
      return [{
        notificationType: 'APPLICATION_REJECTED',
        title: 'Mise à jour de votre candidature',
        message: reason
          ? `Votre candidature n’a pas été retenue. Motif enregistré : ${reason}.`
          : 'Votre candidature n’a pas été retenue.',
        audiences: ['WORKER'],
        link: { screen: 'DISCOVER', id: text(payload, 'offerId') },
        dedupeKey: `application:${aggregateId}:REJECTED`,
        payload: { applicationId: text(payload, 'applicationId') ?? aggregateId, offerId: text(payload, 'offerId') },
      }];
    }
    case 'APPLICATION_WITHDRAWN':
      return [{
        notificationType: 'APPLICATION_WITHDRAWN',
        title: 'Candidature retirée',
        message: 'Le candidat a retiré sa candidature pour cette offre.',
        audiences: ['EMPLOYER'],
        link: { screen: 'APPLICATIONS', id: text(payload, 'applicationId') ?? aggregateId },
        dedupeKey: `application:${aggregateId}:WITHDRAWN`,
        payload: { applicationId: text(payload, 'applicationId') ?? aggregateId, offerId: text(payload, 'offerId') },
      }];

    /* ---------------- PROPOSITION ---------------- */
    case 'PROPOSAL_SENT':
      return [{
        notificationType: 'PROPOSAL_RECEIVED',
        title: 'Nouvelle proposition de mission',
        message: text(payload, 'missionTitle')
          ? `Une proposition vous a été adressée : « ${text(payload, 'missionTitle')} ».`
          : 'Un employeur vous a adressé une proposition de mission.',
        audiences: ['WORKER'],
        link: { screen: 'CHAT_DETAIL', id: text(payload, 'conversationId') },
        dedupeKey: `proposal:${aggregateId}:SENT`,
        payload: { proposalId: text(payload, 'proposalId') ?? aggregateId },
      }];
    case 'PROPOSAL_ACCEPTED':
      return [{
        notificationType: 'PROPOSAL_ACCEPTED',
        title: 'Proposition acceptée',
        message: 'Le candidat a accepté votre proposition. Vous pouvez préparer le contrat.',
        audiences: ['EMPLOYER'],
        link: { screen: 'CHAT_DETAIL', id: text(payload, 'conversationId') },
        dedupeKey: `proposal:${aggregateId}:ACCEPTED`,
        payload: { proposalId: text(payload, 'proposalId') ?? aggregateId },
      }];
    case 'PROPOSAL_DECLINED':
      return [{
        notificationType: 'PROPOSAL_DECLINED',
        title: 'Proposition déclinée',
        message: 'Le candidat a décliné votre proposition.',
        audiences: ['EMPLOYER'],
        link: { screen: 'CHAT_DETAIL', id: text(payload, 'conversationId') },
        dedupeKey: `proposal:${aggregateId}:DECLINED`,
        payload: { proposalId: text(payload, 'proposalId') ?? aggregateId },
      }];

    /* ---------------- CONTRAT / APPEL WEBRTC ---------------- */
    case 'WEBRTC_SESSION_INVITED':
      return [{
        notificationType: 'INCOMING_CALL',
        title: 'Invitation à un appel temporaire',
        message: 'Votre interlocuteur vous propose un appel temporaire lié à votre contrat actif. Rejoignez-le depuis votre espace contrat.',
        audiences: ['OTHER_PARTY'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') ?? aggregateId },
        dedupeKey: `webrtc:${text(payload, 'sessionId') ?? event.eventId}:INVITED`,
        payload: { contractId: text(payload, 'contractId') ?? aggregateId, sessionId: text(payload, 'sessionId') ?? '' },
      }];

    /* ---------------- CONTRAT ---------------- */
    case 'CONTRACT_SENT':
      return [{
        notificationType: 'CONTRACT_PENDING_SIGNATURE',
        title: 'Nouveau contrat à signer',
        message: 'Un contrat a été préparé pour votre mission. Consultez-le et signez-le pour l’activer.',
        audiences: ['WORKER'],
        link: { screen: 'CONTRACTS', id: aggregateId },
        dedupeKey: `contract:${aggregateId}:SENT`,
        payload: { contractId: aggregateId },
      }];
    case 'CONTRACT_SIGNED':
      // Convention documentée : « notifier l'AUTRE partie ». L'auteur est
      // `payload.party` (`ContractParty`) ; il est exclu, jamais deviné.
      return [{
        notificationType: 'CONTRACT_SIGNED',
        title: 'Contrat signé',
        message: 'L’autre partie a signé le contrat. Il reste une signature pour l’activer.',
        audiences: ['OTHER_PARTY'],
        link: { screen: 'CONTRACTS', id: aggregateId },
        dedupeKey: `contract:${aggregateId}:SIGNED:${text(payload, 'party') ?? 'UNKNOWN'}`,
        payload: { contractId: aggregateId, party: text(payload, 'party') },
      }];
    case 'CONTRACT_ACTIVATED':
      return [{
        notificationType: 'CONTRACT_ACTIVE',
        title: 'Contrat actif',
        // Convention DEMO conservée : l'employeur et le travailleur reçoivent
        // chacun une notification de même type, avec leur propre message.
        message: 'Le contrat est actif. Votre mission démarre : suivez les échéances de paiement dans LE LABEUR.',
        audiences: ['EMPLOYER', 'WORKER'],
        link: { screen: 'CONTRACTS', id: aggregateId },
        dedupeKey: `contract:${aggregateId}:ACTIVATED`,
        payload: { contractId: aggregateId, offerId: text(payload, 'offerId') },
      }];
    case 'CONTRACT_TERMINATED':
      // Convention DEMO `dissociateMonth2` : l'AUTRE partie est notifiée, sous
      // le type `CONTRACT_ACTIVE` — le modèle n'a pas d'autre type dédié.
      return [{
        notificationType: 'CONTRACT_ACTIVE',
        title: 'Fin de mission notifiée',
        message: text(payload, 'reason')
          ? `La mission a été rompue. Motif enregistré : ${text(payload, 'reason')}.`
          : 'La mission a été rompue.',
        audiences: ['OTHER_PARTY'],
        link: { screen: 'CONTRACTS', id: aggregateId },
        dedupeKey: `contract:${aggregateId}:TERMINATED`,
        payload: { contractId: aggregateId },
      }];

    /* ---------------- REMPLACEMENT ---------------- */
    case 'REPLACEMENT_CREATED':
      return [{
        notificationType: 'REPLACEMENT_INITIATED',
        title: 'Remplacement autorisé',
        message: 'Le contrat initial est marqué REPLACED. L’employeur doit publier l’offre; le candidat postule et accepte ensuite une proposition avant tout nouveau contrat.',
        audiences: ['EMPLOYER', 'WORKER', 'ADMIN'],
        link: { screen: 'CONTRACTS', id: text(payload, 'originalContractId') },
        dedupeKey: `replacement:${text(payload, 'replacementId') ?? aggregateId}:CREATED`,
        payload: {
          replacementId: text(payload, 'replacementId') ?? aggregateId,
          claimId: text(payload, 'claimId'),
          originalContractId: text(payload, 'originalContractId'),
        },
      }];

    /* ---------------- LITIGE ---------------- */
    case 'CLAIM_CREATED':
      return [{
        notificationType: 'INCIDENT_REPORTED',
        title: 'Litige ouvert sur un contrat',
        message: 'Un litige a été ouvert. Les parties concernées et l’administration en sont informées.',
        audiences: ['EMPLOYER', 'WORKER', 'ADMIN'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `claim:${aggregateId}:CREATED`,
        payload: { claimId: aggregateId, contractId: text(payload, 'contractId'), claimType: text(payload, 'type') },
      }];
    case 'CLAIM_EVIDENCE_REQUESTED': {
      const requestedFrom = text(payload, 'requestedFrom');
      const dueAt = text(payload, 'dueAt');
      return [{
        notificationType: 'INCIDENT_REPORTED',
        title: 'Pièce demandée dans le cadre d’un litige',
        message: dueAt
          ? `Une pièce est demandée dans le cadre du litige. Échéance enregistrée : ${dueAt}.`
          : 'Une pièce est demandée dans le cadre du litige. Aucune échéance n’a été configurée.',
        // Le demandeur est ciblé explicitement quand il est persisté ; les deux
        // parties sont couvertes dans tous les cas (aucune partie écartée).
        audiences: ['EMPLOYER', 'WORKER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'claimId') ?? aggregateId },
        dedupeKey: `claim:${aggregateId}:EVIDENCE_REQUESTED:${text(payload, 'evidenceRequestId') ?? aggregateId}`,
        payload: { claimId: aggregateId, evidenceRequestId: text(payload, 'evidenceRequestId') ?? '', requestedFrom: requestedFrom ?? '' },
      }];
    }
    case 'CLAIM_EVIDENCE_SUBMITTED':
      return [{
        notificationType: 'INCIDENT_REPORTED',
        title: 'Pièce reçue pour un litige',
        message: 'La pièce demandée a été déposée. Le dossier poursuit son instruction.',
        audiences: ['EMPLOYER', 'WORKER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `claim:${aggregateId}:EVIDENCE_SUBMITTED:${text(payload, 'evidenceRequestId') ?? event.eventId}`,
        payload: { claimId: aggregateId, evidenceRequestId: text(payload, 'evidenceRequestId') ?? '' },
      }];
    case 'CLAIM_DEADLINE_REACHED':
      return [{
        notificationType: 'INCIDENT_REPORTED',
        title: 'Échéance de pièce atteinte',
        message: 'L’échéance de la pièce demandée est atteinte. Le dossier est transmis à l’administration ; aucun manquement n’est présumé.',
        audiences: ['EMPLOYER', 'WORKER', 'ADMIN'],
        link: { screen: 'CONTRACTS', id: text(payload, 'claimId') ?? aggregateId },
        dedupeKey: `claim:${aggregateId}:DEADLINE_REACHED:${text(payload, 'evidenceRequestId') ?? aggregateId}`,
        payload: { claimId: aggregateId, evidenceRequestId: text(payload, 'evidenceRequestId') ?? '' },
      }];
    case 'CLAIM_ESCALATED':
      return [{
        notificationType: 'INCIDENT_REPORTED',
        title: 'Litige transmis à l’administration',
        message: 'Le litige a été transmis à l’administration pour examen. Aucune sanction n’est prise automatiquement.',
        audiences: ['EMPLOYER', 'WORKER', 'ADMIN'],
        link: { screen: 'CONTRACTS', id: text(payload, 'claimId') ?? aggregateId },
        dedupeKey: `claim:${aggregateId}:ESCALATED:${text(payload, 'evidenceRequestId') ?? event.eventId}`,
        payload: { claimId: aggregateId, reason: text(payload, 'reason') ?? '' },
      }];
    case 'CLAIM_RESTRICTION_APPLIED':
      return [{
        notificationType: 'INCIDENT_REPORTED',
        title: 'Restriction provisoire appliquée',
        message: 'Une restriction provisoire et réversible a été appliquée dans le cadre du litige.',
        audiences: ['WORKER', 'EMPLOYER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'claimId') ?? aggregateId },
        dedupeKey: `claim:${aggregateId}:RESTRICTION_APPLIED:${text(payload, 'restrictionId') ?? aggregateId}`,
        payload: { claimId: aggregateId, restrictionId: text(payload, 'restrictionId') ?? '' },
      }];
    case 'CLAIM_RESTRICTION_RELEASED':
      return [{
        notificationType: 'INCIDENT_REPORTED',
        title: 'Restriction provisoire levée',
        message: 'La restriction provisoire a été levée.',
        audiences: ['WORKER', 'EMPLOYER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'claimId') ?? aggregateId },
        dedupeKey: `claim:${aggregateId}:RESTRICTION_RELEASED:${text(payload, 'restrictionId') ?? aggregateId}`,
        payload: { claimId: aggregateId, restrictionId: text(payload, 'restrictionId') ?? '' },
      }];
    case 'CLAIM_RESOLVED':
    case 'CLAIM_REJECTED': {
      const resolved = event.eventType === 'CLAIM_RESOLVED';
      const resolution = text(payload, 'resolution');
      return [{
        notificationType: 'INCIDENT_DECIDED',
        title: resolved ? 'Litige résolu' : 'Litige rejeté',
        message: resolution
          ? `Décision enregistrée : ${resolution}`
          : (resolved ? 'Le litige a été résolu.' : 'Le litige a été rejeté.'),
        audiences: ['EMPLOYER', 'WORKER', 'ADMIN'],
        link: { screen: 'CONTRACTS', id: text(payload, 'claimId') ?? aggregateId },
        dedupeKey: `claim:${aggregateId}:${resolved ? 'RESOLVED' : 'REJECTED'}`,
        payload: { claimId: aggregateId, decision: text(payload, 'decision') ?? (resolved ? 'RESOLVE' : 'REJECT') },
      }];
    }

    /* ---------------- PAIEMENT / SALAIRE ---------------- */
    case 'PAYMENT_DUE': {
      const isCommission = text(payload, 'paymentType') === 'COMMISSION';
      const dueDate = text(payload, 'dueDate') ?? text(payload, 'salaryDueDate') ?? text(payload, 'commissionDueDate');
      return [{
        notificationType: isCommission ? 'COMMISSION_DUE' : 'MONTHLY_CHECKPOINT',
        title: isCommission ? 'Commission LE LABEUR à régulariser' : 'Paiement de salaire à régulariser',
        message: `${isCommission ? 'Commission' : 'Salaire'}${period(payload)}${money(payload)} : échéance atteinte${dueDate ? ` (${dueDate})` : ''}. Le paiement se fait HORS LE LABEUR, puis se déclare dans l’application.`,
        // Convention DEMO `syncPaymentSchedule` : l'employeur est le débiteur.
        audiences: ['EMPLOYER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `payment:${aggregateId}:DUE`,
        payload: { paymentId: aggregateId, contractId: text(payload, 'contractId') ?? '', paymentType: text(payload, 'paymentType') ?? '' },
      }];
    }
    case 'PAYMENT_DECLARED':
    case 'PAYMENT_PENDING_VERIFICATION': {
      // Deux événements DURABLES pour un seul fait logique : la MÊME clé de
      // déduplication garantit une seule notification par partie.
      const isCommission = text(payload, 'paymentType') === 'COMMISSION';
      return [{
        notificationType: isCommission ? 'COMMISSION_DECLARED' : 'SALARY_DECLARED',
        title: isCommission ? 'Nouvelle déclaration de commission' : 'Déclaration de versement de salaire',
        message: isCommission
          ? `Une déclaration de commission${period(payload)}${money(payload)} attend la vérification de l’administration.`
          : `Votre employeur a déclaré le versement de votre salaire${period(payload)}${money(payload)}. Vérifiez la réception : elle est confirmée dans l’application, jamais automatiquement.`,
        // Convention DEMO : déclaration de commission → administration ;
        // déclaration de salaire → travailleur (il doit confirmer la réception).
        audiences: isCommission ? ['ADMIN'] : ['WORKER'],
        link: { screen: isCommission ? 'ADMIN' : 'CONTRACTS', id: isCommission ? aggregateId : (text(payload, 'contractId') ?? aggregateId) },
        dedupeKey: `payment:${aggregateId}:DECLARED`,
        payload: { paymentId: aggregateId, contractId: text(payload, 'contractId') ?? '', declarationId: text(payload, 'declarationId') ?? '' },
      }];
    }
    case 'PAYMENT_APPROVED':
    case 'PAYMENT_VERIFIED': {
      // Alias du même fait logique : une seule clé de déduplication.
      if (text(payload, 'paymentType') !== 'COMMISSION') {
        // Le modèle ne déclare aucun `NotificationType` de vérification d'un
        // SALAIRE : le travailleur est notifié à la déclaration puis à la
        // demande de confirmation de salaire (P0-SALARY-1). Aucun type n'est
        // détourné pour combler ce trou.
        return [];
      }
      return [{
        notificationType: 'COMMISSION_VERIFIED',
        title: 'Commission LE LABEUR vérifiée',
        message: `La déclaration de commission${period(payload)}${money(payload)} a été vérifiée par l’administration.`,
        audiences: ['EMPLOYER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `payment:${aggregateId}:VERIFIED`,
        payload: { paymentId: aggregateId, contractId: text(payload, 'contractId') ?? '' },
      }];
    }
    case 'PAYMENT_PAID': {
      if (text(payload, 'paymentType') !== 'SALARY') return [];
      return [{
        notificationType: 'SALARY_DECLARED',
        title: 'Salaire enregistré — confirmation attendue',
        message: `Le paiement salarial${period(payload)}${money(payload)} est enregistré. Confirmez la réception dans l’application : cette confirmation est la vôtre, jamais automatique.`,
        audiences: ['WORKER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `payment:${aggregateId}:SALARY_PAID`,
        payload: { paymentId: aggregateId, contractId: text(payload, 'contractId') ?? '' },
      }];
    }
    case 'PAYMENT_REJECTED': {
      const isCommission = text(payload, 'paymentType') === 'COMMISSION';
      if (!isCommission) return [];
      const reason = text(payload, 'reason');
      return [{
        notificationType: 'COMMISSION_REJECTED',
        title: 'Commission LE LABEUR à régulariser',
        message: reason
          ? `Votre déclaration de commission a été rejetée. Motif : ${reason}. L’échéance reste régularisable.`
          : 'Votre déclaration de commission a été rejetée. L’échéance reste régularisable.',
        audiences: ['EMPLOYER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `payment:${aggregateId}:REJECTED`,
        payload: { paymentId: aggregateId, contractId: text(payload, 'contractId') ?? '' },
      }];
    }
    case 'SALARY_CONFIRMATION_REQUESTED':
      return [{
        notificationType: 'SALARY_DECLARED',
        title: 'Confirmation de salaire attendue',
        message: 'Le salaire est enregistré. Confirmez la réception dans l’application : vous seul pouvez le faire.',
        audiences: ['WORKER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `payment:${aggregateId}:SALARY_PAID`,
        payload: { paymentId: aggregateId, contractId: text(payload, 'contractId') ?? '' },
      }];
    case 'SALARY_CONFIRMED':
      return [{
        notificationType: 'SALARY_CONFIRMED',
        title: 'Salaire confirmé',
        message: 'Le salarié a confirmé la réception du salaire.',
        audiences: ['EMPLOYER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') },
        dedupeKey: `payment:${aggregateId}:SALARY_CONFIRMED`,
        payload: { paymentId: aggregateId, contractId: text(payload, 'contractId') ?? '' },
      }];

    /* ---------------- RAPPELS D'AUTOMATISATION (payload d'origine) ---------------- */
    case 'NOTIFICATION_REQUIRED': {
      // Le type de notification et les destinataires viennent du PAYLOAD de
      // l'événement EXISTANT (produit par P0-AUTO-2) : rien n'est deviné ici.
      if (!isKnownNotificationType(payload.notificationType)) return [];
      const paymentKind = text(payload, 'paymentKind') ?? 'SALARY';
      const stage = text(payload, 'stage') ?? 'DUE';
      const payloadDedupe = text(payload, 'dedupeKey') ?? `${aggregateId}:${text(payload, 'scheduleEntryId') ?? aggregateId}:${paymentKind}:${stage}`;
      return [{
        notificationType: payload.notificationType,
        title: paymentKind === 'COMMISSION' ? 'Commission LE LABEUR à régulariser' : 'Paiement de salaire à régulariser',
        message: `${paymentKind === 'COMMISSION' ? 'Commission' : 'Salaire'}${text(payload, 'periodKey') ? ` (${text(payload, 'periodKey')})` : ''}${money(payload)} : échéance du ${text(payload, 'dueDate') ?? 'jour enregistré'}. Le paiement se fait HORS LE LABEUR, puis se déclare dans l’application.`,
        audiences: ['EMPLOYER'],
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') ?? aggregateId },
        dedupeKey: `reminder:${payloadDedupe}`,
        payload: { contractId: text(payload, 'contractId') ?? aggregateId, scheduleEntryId: text(payload, 'scheduleEntryId') ?? '', paymentKind },
      }];
    }
    case 'PAYMENT_OVERDUE_J3': {
      const paymentKind = text(payload, 'paymentKind') ?? 'SALARY';
      const payloadDedupe = text(payload, 'dedupeKey') ?? `${aggregateId}:${text(payload, 'scheduleEntryId') ?? aggregateId}:${paymentKind}:J3`;
      // `recipientKinds` est déclaré par le producteur de l'événement
      // (`['EMPLOYER','ADMIN']`) : il est respecté tel quel, jamais élargi.
      const declared = Array.isArray(payload.recipientKinds)
        ? (payload.recipientKinds as unknown[]).filter((value): value is string => typeof value === 'string')
        : ['EMPLOYER', 'ADMIN'];
      const audiences: NotificationAudienceSelector[] = [];
      if (declared.includes('EMPLOYER')) audiences.push('EMPLOYER');
      if (declared.includes('ADMIN')) audiences.push('ADMIN');
      if (audiences.length === 0) return [];
      return [{
        notificationType: 'PAYMENT_OVERDUE_J3',
        title: 'J+3 — régularisation requise',
        message: `${paymentKind === 'COMMISSION' ? 'Commission' : 'Salaire'}${text(payload, 'periodKey') ? ` (${text(payload, 'periodKey')})` : ''}${money(payload)} non régularisé${text(payload, 'daysLate') ? ` depuis ${text(payload, 'daysLate')} jour(s)` : ''}. Échéance : ${text(payload, 'dueDate') ?? 'enregistrée'}.`,
        audiences,
        link: { screen: 'CONTRACTS', id: text(payload, 'contractId') ?? aggregateId },
        dedupeKey: `overdue-j3:${payloadDedupe}`,
        payload: { contractId: text(payload, 'contractId') ?? aggregateId, scheduleEntryId: text(payload, 'scheduleEntryId') ?? '', paymentKind },
      }];
    }

    default:
      return [];
  }
}
