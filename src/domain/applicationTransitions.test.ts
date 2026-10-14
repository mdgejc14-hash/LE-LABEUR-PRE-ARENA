/**
 * LE LABEUR — P0-E4 — tests purs de la matrice de décision CANDIDATURE.
 *
 * Aucune base, aucun réseau : ces tests verrouillent la matrice réellement
 * implémentée (statuts du code, gardes du modèle réel) et les événements
 * documentés pour l'étape Outbox/Queue future.
 */

import {
  APPLICATION_DECISION_RULES,
  APPLICATION_DECISION_VALUES,
  APPLICATION_LIFECYCLE_EVENT_TYPES,
  APPLICATION_TERMINAL_STATUSES,
  DEFAULT_REJECTION_NOTE,
  DOCUMENTED_APPLICATION_EVENTS,
  evaluateApplicationDecision,
  normalizeRejectionNote,
  type ApplicationDecision,
} from './applicationTransitions';
import { APPLICATION_STATUS_VALUES } from '../backend/persistence/coreRecords';
import type { ApplicationStatus } from '../types';

export interface TransitionTestCase {
  name: string;
  success: boolean;
  details: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runApplicationTransitionTests(): TransitionTestCase[] {
  const results: TransitionTestCase[] = [];
  const check = (name: string, test: () => void): void => {
    try {
      test();
      results.push({ name, success: true, details: 'OK' });
    } catch (error) {
      results.push({ name, success: false, details: String((error as Error)?.message ?? error) });
    }
  };

  check('P0-E4 Matrice: les quatre décisions visent les statuts du code, sans statut inventé', () => {
    for (const decision of APPLICATION_DECISION_VALUES) {
      const rule = APPLICATION_DECISION_RULES[decision];
      assert(
        (APPLICATION_STATUS_VALUES as readonly ApplicationStatus[]).includes(rule.to),
        `${decision}: statut cible « ${rule.to} » absent du domaine candidature`,
      );
      for (const status of rule.from) {
        assert(
          (APPLICATION_STATUS_VALUES as readonly ApplicationStatus[]).includes(status),
          `${decision}: statut source « ${status} » absent du domaine candidature`,
        );
      }
    }
    assert(APPLICATION_DECISION_RULES.EXAMINE.to === 'REVIEW', 'EXAMINED = REVIEW dans le modèle réel');
    assert(APPLICATION_DECISION_RULES.SHORTLIST.to === 'SHORTLISTED', 'SHORTLISTED conservé');
    assert(APPLICATION_DECISION_RULES.REJECT.to === 'REJECTED', 'REJECTED conservé');
    assert(APPLICATION_DECISION_RULES.WITHDRAW.to === 'WITHDRAWN', 'WITHDRAWN conservé');
  });

  check('P0-E4 Matrice: transitions autorisées par le modèle réel', () => {
    const allowed: Array<[ApplicationDecision, ApplicationStatus]> = [
      ['EXAMINE', 'PENDING'],
      ['SHORTLIST', 'PENDING'],
      ['SHORTLIST', 'REVIEW'],
      ['REJECT', 'PENDING'],
      ['REJECT', 'REVIEW'],
      ['REJECT', 'SHORTLISTED'],
      ['WITHDRAW', 'PENDING'],
      ['WITHDRAW', 'REVIEW'],
      ['WITHDRAW', 'SHORTLISTED'],
    ];
    for (const [decision, from] of allowed) {
      const outcome = evaluateApplicationDecision(decision, from);
      assert(
        outcome.kind === 'APPLY',
        `${decision} depuis ${from} doit être autorisée, reçu ${outcome.kind}`,
      );
    }
  });

  check('P0-E4 Matrice: EXAMINE et SHORTLIST refusent les candidatures déjà décidées', () => {
    for (const from of ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'] as const) {
      const outcome = evaluateApplicationDecision('EXAMINE', from);
      assert(outcome.kind !== 'APPLY', `EXAMINE depuis ${from} doit être refusée`);
    }
    for (const from of ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'] as const) {
      const outcome = evaluateApplicationDecision('SHORTLIST', from);
      assert(outcome.kind !== 'APPLY', `SHORTLIST depuis ${from} doit être refusée`);
    }
  });

  check('P0-E4 Matrice: REJECTED et WITHDRAWN ne sont plus modifiables par aucune décision', () => {
    for (const status of APPLICATION_TERMINAL_STATUSES) {
      for (const decision of APPLICATION_DECISION_VALUES) {
        const outcome = evaluateApplicationDecision(decision, status);
        assert(
          outcome.kind === 'TERMINAL' || outcome.kind === 'ALREADY_APPLIED',
          `${decision} depuis ${status} ne doit rien appliquer, reçu ${outcome.kind}`,
        );
      }
    }
  });

  check('P0-E4 Matrice: répéter une décision sur un statut encore ouvert est sans effet', () => {
    // REVIEW et SHORTLISTED restent ouverts à d'autres décisions : répéter la
    // même est un rejeu sans effet (aucune écriture, aucun doublon d'historique).
    const cases: Array<[ApplicationDecision, ApplicationStatus]> = [
      ['EXAMINE', 'REVIEW'],
      ['SHORTLIST', 'SHORTLISTED'],
    ];
    for (const [decision, status] of cases) {
      const outcome = evaluateApplicationDecision(decision, status);
      assert(outcome.kind === 'ALREADY_APPLIED', `${decision} sur ${status} doit être un rejeu sans effet`);
    }
  });

  check('P0-E4 Matrice: REJECTED et WITHDRAWN refusent même la décision qui les a produits', () => {
    const cases: Array<[ApplicationDecision, ApplicationStatus]> = [
      ['REJECT', 'REJECTED'],
      ['WITHDRAW', 'WITHDRAWN'],
    ];
    for (const [decision, status] of cases) {
      const outcome = evaluateApplicationDecision(decision, status);
      assert(
        outcome.kind === 'TERMINAL',
        `${decision} sur ${status} doit être refusé (état terminal), reçu ${outcome.kind}`,
      );
    }
  });

  check('P0-E4 Matrice: SHORTLISTED ne sort que par REJECT ou WITHDRAW (aucune autre opération)', () => {
    const exits = APPLICATION_DECISION_VALUES.filter(
      decision => evaluateApplicationDecision(decision, 'SHORTLISTED').kind === 'APPLY',
    );
    assert(
      exits.length === 2 && exits.includes('REJECT') && exits.includes('WITHDRAW'),
      `sorties de SHORTLISTED attendues: REJECT, WITHDRAW — reçues ${exits.join(', ')}`,
    );
    assert(
      APPLICATION_DECISION_RULES.SHORTLIST.requiresActiveOffer === true,
      'SHORTLIST exige une offre ACTIVE dans le modèle réel',
    );
  });

  check('P0-E4 Rôles: EMPLOYER pour examiner/shortlister/rejeter, CANDIDATE pour retirer', () => {
    assert(APPLICATION_DECISION_RULES.EXAMINE.actorRole === 'EMPLOYER', 'EXAMINE réservé à l’employeur');
    assert(APPLICATION_DECISION_RULES.SHORTLIST.actorRole === 'EMPLOYER', 'SHORTLIST réservé à l’employeur');
    assert(APPLICATION_DECISION_RULES.REJECT.actorRole === 'EMPLOYER', 'REJECT réservé à l’employeur');
    assert(APPLICATION_DECISION_RULES.WITHDRAW.actorRole === 'CANDIDATE', 'WITHDRAW réservé au candidat');
  });

  check('P0-E4 Motif: le rejet applique le motif fourni, sinon le défaut du modèle réel', () => {
    assert(normalizeRejectionNote('  Profil non retenu  ') === 'Profil non retenu', 'motif nettoyé');
    assert(normalizeRejectionNote('   ') === undefined, 'motif vide traité comme absent');
    assert(normalizeRejectionNote(undefined) === undefined, 'motif absent toléré par le modèle réel');
    assert(DEFAULT_REJECTION_NOTE === 'Dossier non retenu pour cette mission.', 'défaut du modèle réel conservé');
    assert(
      APPLICATION_DECISION_RULES.REJECT.historyAction('Trop de candidats') === 'Candidature non retenue (Trop de candidats)',
      'le motif est repris dans l’historique',
    );
    assert(
      APPLICATION_DECISION_RULES.REJECT.historyAction() === 'Candidature non retenue',
      'aucun motif inventé dans l’historique',
    );
  });

  check('P0-E4 Événements: APPLICATION_* documentés, sans moteur Outbox/Queue', () => {
    const types = DOCUMENTED_APPLICATION_EVENTS.map(event => event.eventType);
    assert(
      APPLICATION_LIFECYCLE_EVENT_TYPES.every(type => types.includes(type)),
      'chaque événement du cycle candidature est documenté',
    );
    for (const decision of APPLICATION_DECISION_VALUES) {
      const event = APPLICATION_DECISION_RULES[decision].event;
      assert(types.includes(event), `événement documenté manquant pour ${decision}`);
    }
    for (const event of DOCUMENTED_APPLICATION_EVENTS) {
      assert(event.aggregateType === 'application', 'agrégat candidature attendu');
      assert(event.dedupeKey.startsWith('applicationId'), 'clé de déduplication stable attendue');
      assert(event.payload.includes('applicationId'), 'payload minimal attendu');
    }
  });

  return results;
}
