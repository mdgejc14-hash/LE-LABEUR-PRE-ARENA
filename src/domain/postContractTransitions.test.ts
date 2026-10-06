/**
 * LE LABEUR — P0-CONTRACT-POST — tests purs de la tranche POST-CONTRAT.
 *
 * Aucune base, aucun réseau : ces tests verrouillent la cascade d'embauche
 * réellement implémentée (RÈGLE 21 du modèle, statuts du code, transitions
 * refusées), la correspondance WORK EXECUTION (aucun statut inventé) et les
 * événements documentés pour l'étape Outbox/Queue future.
 */

import {
  APPLICATION_STATUS_VALUES,
  CONTRACT_STATUS_VALUES,
  OFFER_STATUS_VALUES,
} from '../backend/persistence/coreRecords';
import type { ApplicationStatus, ContractStatus, Offer } from '../types';
import {
  DOCUMENTED_POST_CONTRACT_EVENTS,
  POST_CONTRACT_LIFECYCLE_EVENT_TYPES,
  POST_CONTRACT_OFFER_FROM,
  POST_CONTRACT_OFFER_TO,
  POST_CONTRACT_OPEN_APPLICATION_STATUSES,
  POST_CONTRACT_OTHER_APPLICATION_TARGET,
  POST_CONTRACT_OTHER_CLOSED_HISTORY,
  POST_CONTRACT_REFUSED_TRANSITIONS,
  POST_CONTRACT_REMAINING_REQUIREMENTS,
  POST_CONTRACT_REQUIRED_CONTRACT_STATUS,
  POST_CONTRACT_WINNING_APPLICATION_CONFIRMED,
  POST_CONTRACT_WINNING_APPLICATION_TARGET,
  POST_CONTRACT_WINNING_CONTRACTED_HISTORY,
  POST_CONTRACT_WINNING_HIRED_HISTORY,
  WORK_EXECUTION_STATUS_MAPPING,
  WORK_SCHEDULE_SIMPLICITY_RULES,
  evaluatePostContractOffer,
  evaluatePostContractOtherApplication,
  evaluatePostContractWinningApplication,
} from './postContractTransitions';

export interface TransitionTestCase {
  name: string;
  success: boolean;
  details: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runPostContractTransitionTests(): TransitionTestCase[] {
  const results: TransitionTestCase[] = [];
  const check = (name: string, test: () => void): void => {
    try {
      test();
      results.push({ name, success: true, details: 'OK' });
    } catch (error) {
      results.push({ name, success: false, details: String((error as Error)?.message ?? error) });
    }
  };

  check('P0-CONTRACT-POST Matrice: toutes les cibles appartiennent aux domaines du code, sans statut inventé', () => {
    assert(
      (OFFER_STATUS_VALUES as readonly Offer['status'][]).includes(POST_CONTRACT_OFFER_TO),
      `cible offre « ${POST_CONTRACT_OFFER_TO} » absente du domaine`,
    );
    for (const status of POST_CONTRACT_OFFER_FROM) {
      assert(
        (OFFER_STATUS_VALUES as readonly Offer['status'][]).includes(status),
        `source offre « ${status} » absente du domaine`,
      );
    }
    for (const target of [
      POST_CONTRACT_WINNING_APPLICATION_TARGET,
      POST_CONTRACT_WINNING_APPLICATION_CONFIRMED,
      POST_CONTRACT_OTHER_APPLICATION_TARGET,
    ]) {
      assert(
        (APPLICATION_STATUS_VALUES as readonly ApplicationStatus[]).includes(target),
        `cible candidature « ${target} » absente du domaine`,
      );
    }
    for (const status of POST_CONTRACT_OPEN_APPLICATION_STATUSES) {
      assert(
        (APPLICATION_STATUS_VALUES as readonly ApplicationStatus[]).includes(status),
        `source candidature « ${status} » absente du domaine`,
      );
    }
    assert(
      (CONTRACT_STATUS_VALUES as readonly ContractStatus[]).includes(POST_CONTRACT_REQUIRED_CONTRACT_STATUS),
      `statut contrat requis « ${POST_CONTRACT_REQUIRED_CONTRACT_STATUS} » absent du domaine`,
    );
    assert(POST_CONTRACT_OFFER_TO === 'FILLED', 'FILLED conservé (RÈGLE 21)');
    assert(POST_CONTRACT_WINNING_APPLICATION_TARGET === 'HIRED', 'HIRED conservé (RÈGLE 21)');
    assert(POST_CONTRACT_WINNING_APPLICATION_CONFIRMED === 'CONTRACTED', 'CONTRACTED = statut existant, sortie documentée');
    assert(POST_CONTRACT_OTHER_APPLICATION_TARGET === 'CLOSED_OFFER_FILLED', 'CLOSED_OFFER_FILLED conservé (RÈGLE 21)');
    assert(POST_CONTRACT_REQUIRED_CONTRACT_STATUS === 'ACTIVE', 'la cascade exige un contrat actif');
  });

  check('P0-CONTRACT-POST Matrice: offre ACTIVE → FILLED, FILLED converge, PAUSED/CANCELLED refusés', () => {
    const apply = evaluatePostContractOffer('ACTIVE');
    assert(apply.kind === 'APPLY' && apply.to === 'FILLED', 'ACTIVE → FILLED appliqué');
    const converged = evaluatePostContractOffer('FILLED');
    assert(converged.kind === 'ALREADY_APPLIED', 'FILLED rejoué converge sans écriture');
    for (const current of ['PAUSED', 'CANCELLED'] as const) {
      const refused = evaluatePostContractOffer(current);
      assert(
        refused.kind === 'REFUSED' && refused.current === current,
        `${current} → FILLED doit être refusé`,
      );
    }
  });

  check('P0-CONTRACT-POST Matrice: candidature retenue ouverte → HIRED, HIRED → CONTRACTED, CONTRACTED converge', () => {
    for (const current of POST_CONTRACT_OPEN_APPLICATION_STATUSES) {
      const outcome = evaluatePostContractWinningApplication(current);
      assert(
        outcome.kind === 'APPLY_HIRED' && outcome.to === 'HIRED',
        `${current} → HIRED attendu`,
      );
    }
    const toContracted = evaluatePostContractWinningApplication('HIRED');
    assert(
      toContracted.kind === 'APPLY_CONTRACTED' && toContracted.to === 'CONTRACTED',
      'HIRED → CONTRACTED attendu (sortie documentée du MANQUE)',
    );
    const converged = evaluatePostContractWinningApplication('CONTRACTED');
    assert(converged.kind === 'ALREADY_APPLIED', 'CONTRACTED rejoué converge sans écriture');
  });

  check('P0-CONTRACT-POST Matrice: candidature retenue REJECTED/WITHDRAWN/CLOSED refusée (409, sans écriture)', () => {
    for (const current of ['REJECTED', 'WITHDRAWN', 'CLOSED_OFFER_FILLED'] as const) {
      const outcome = evaluatePostContractWinningApplication(current);
      assert(
        outcome.kind === 'REFUSED' && outcome.current === current,
        `${current} doit refuser la cascade`,
      );
    }
  });

  check('P0-CONTRACT-POST Matrice: autres candidatures ouvertes → CLOSED_OFFER_FILLED, toutes les autres ignorées', () => {
    for (const current of POST_CONTRACT_OPEN_APPLICATION_STATUSES) {
      const outcome = evaluatePostContractOtherApplication(current);
      assert(
        outcome.kind === 'APPLY' && outcome.to === 'CLOSED_OFFER_FILLED',
        `${current} → CLOSED_OFFER_FILLED attendu`,
      );
    }
    const skipped: ApplicationStatus[] = ['REJECTED', 'WITHDRAWN', 'HIRED', 'CONTRACTED', 'CLOSED_OFFER_FILLED'];
    for (const current of skipped) {
      const outcome = evaluatePostContractOtherApplication(current);
      assert(outcome.kind === 'SKIP', `${current} doit être ignoré, jamais réécrit`);
    }
  });

  check('P0-CONTRACT-POST Matrice: libellés d’historique RÈGLE 21 repris à l’identique', () => {
    assert(
      POST_CONTRACT_WINNING_HIRED_HISTORY === 'Candidature retenue — contrat actif',
      'libellé HIRED du modèle réel',
    );
    assert(
      POST_CONTRACT_OTHER_CLOSED_HISTORY === 'Candidature clôturée — offre pourvue',
      'libellé CLOSED_OFFER_FILLED du modèle réel',
    );
    assert(
      typeof POST_CONTRACT_WINNING_CONTRACTED_HISTORY === 'string'
        && POST_CONTRACT_WINNING_CONTRACTED_HISTORY.length > 0,
      'libellé CONTRACTED documenté',
    );
  });

  check('P0-CONTRACT-POST Matrice: transitions refusées documentées, sans état impossible', () => {
    assert(POST_CONTRACT_REFUSED_TRANSITIONS.length >= 7, 'table de refus documentée');
    for (const refused of POST_CONTRACT_REFUSED_TRANSITIONS) {
      assert(typeof refused.reason === 'string' && refused.reason.length > 10, `motif explicite pour ${refused.scope} ${refused.from} → ${refused.to}`);
    }
    const scopes = new Set(POST_CONTRACT_REFUSED_TRANSITIONS.map(entry => entry.scope));
    assert(scopes.has('OFFER') && scopes.has('WINNING_APPLICATION'), 'refus couverts pour l’offre et la candidature retenue');
  });

  check('P0-CONTRACT-POST Work execution: correspondance réelle, AUCUN statut inventé (ni WORK, ni WORK_SUBMITTED, ni ABANDONED)', () => {
    const plans = WORK_EXECUTION_STATUS_MAPPING.map(entry => entry.plan);
    assert(plans.some(plan => plan.includes('WORK / EXECUTION')), 'travail en cours documenté');
    assert(plans.some(plan => plan.includes('WORK_SUBMITTED')), 'soumission documentée sans statut inventé');
    assert(plans.some(plan => plan === 'COMPLETED'), 'COMPLETED conservé');
    assert(plans.some(plan => plan === 'ABANDONED'), 'abandon mappé sur TERMINATED, sans doublon');
    assert(plans.some(plan => plan === 'REPLACED'), 'REPLACED conservé, non ouvert');
    const codes = WORK_EXECUTION_STATUS_MAPPING.map(entry => entry.code);
    for (const invented of ['WORK', 'EXECUTION', 'WORK_SUBMITTED', 'ABANDONED']) {
      assert(!codes.includes(invented as (typeof codes)[number]), `aucun statut « ${invented} » créé`);
    }
    for (const entry of WORK_EXECUTION_STATUS_MAPPING) {
      assert(typeof entry.detail === 'string' && entry.detail.length > 20, `détail explicite pour ${entry.plan}`);
    }
  });

  check('P0-CONTRACT-POST Horaires: simplicité imposée — aucun moteur de disponibilité, calendrier, refus auto, négociation ou matching', () => {
    assert(WORK_SCHEDULE_SIMPLICITY_RULES.length === 5, 'cinq interdictions exhaustives');
    const joined = WORK_SCHEDULE_SIMPLICITY_RULES.join(' ').toLowerCase();
    assert(joined.includes('disponibilité'), 'pas de moteur de disponibilité');
    assert(joined.includes('calendrier'), 'pas de calendrier complexe');
    assert(joined.includes('refus automatique'), 'pas de refus automatique');
    assert(joined.includes('négociation'), 'pas de négociation d’horaires');
    assert(joined.includes('matching'), 'pas de matching horaire avancé');
  });

  check('P0-CONTRACT-POST Événements: quatre contrats documentés (OFFER_FILLED, HIRED, CONTRACTED, CLOSED), non émis', () => {
    assert(POST_CONTRACT_LIFECYCLE_EVENT_TYPES.length === 4, 'quatre types documentés');
    assert(DOCUMENTED_POST_CONTRACT_EVENTS.length === 4, 'quatre contrats documentés');
    for (const event of DOCUMENTED_POST_CONTRACT_EVENTS) {
      assert(event.emittedBy === 'FINALIZE_HIRING', `${event.eventType} émis par FINALIZE_HIRING (documentation)`);
      assert(typeof event.dedupeKey === 'string' && event.dedupeKey.length > 0, `clé de déduplication pour ${event.eventType}`);
      assert(event.payload.includes('occurredAt'), `horodatage pour ${event.eventType}`);
    }
    const types = DOCUMENTED_POST_CONTRACT_EVENTS.map(event => event.eventType);
    assert(types.includes('OFFER_FILLED'), 'OFFER_FILLED documenté');
    assert(types.includes('APPLICATION_HIRED'), 'APPLICATION_HIRED documenté');
    assert(types.includes('APPLICATION_CONTRACTED'), 'APPLICATION_CONTRACTED documenté');
    assert(types.includes('APPLICATION_CLOSED_OFFER_FILLED'), 'APPLICATION_CLOSED_OFFER_FILLED documenté');
  });

  check('P0-CONTRACT-POST Périmètre: notifications, anti-doublon inter-contrats, incidents et mensuel restent à venir', () => {
    assert(POST_CONTRACT_REMAINING_REQUIREMENTS.length === 4, 'quatre exigences restantes documentées');
    const joined = POST_CONTRACT_REMAINING_REQUIREMENTS.join(' ').toLowerCase();
    assert(joined.includes('notification'), 'notifications à venir');
    assert(joined.includes('concurrent'), 'anti-doublon inter-contrats à venir');
    assert(joined.includes('incident'), 'incidents hors périmètre');
    assert(joined.includes('mensuel'), 'mensuel conservé aux tranches dédiées');
  });

  return results;
}
