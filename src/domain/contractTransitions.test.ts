/**
 * LE LABEUR — P0-F — tests purs du cycle CONTRAT.
 *
 * Aucune base, aucun réseau : ces tests verrouillent la matrice réellement
 * implémentée (statuts réels du code, transitions ouvertes et refusées,
 * signature, protection M1, événements documentés) et constatent que le
 * vocabulaire du plan est projeté sur les noms réels SANS en inventer.
 */

import {
  CONTRACT_ACTION_VALUES,
  CONTRACT_ELIGIBLE_APPLICATION_STATUSES,
  CONTRACT_FIRST_MONTH_PROTECTION_REQUIREMENTS,
  CONTRACT_INITIAL_STATUS,
  CONTRACT_LIFECYCLE_EVENT_TYPES,
  CONTRACT_LIFECYCLE_STATUSES,
  CONTRACT_OUT_OF_SCOPE_STATUSES,
  CONTRACT_REFUSED_TRANSITIONS,
  CONTRACT_SIGNATURE_PARTIES,
  CONTRACT_SIGNATURE_STRENGTHENING_REQUIREMENTS,
  CONTRACT_STATUS_MAPPING,
  CONTRACT_TERMINAL_STATUSES,
  CONTRACT_TRANSITION_RULES,
  DOCUMENTED_CONTRACT_EVENTS,
  evaluateContractSignature,
  evaluateContractTransition,
  isContractFullySigned,
  POST_CONTRACT_AUTOMATION_REQUIREMENTS,
  type ContractAction,
} from './contractTransitions';
import {
  APPLICATION_STATUS_VALUES,
  CORE_DOMAIN_EXACTNESS,
  CONTRACT_STATUS_VALUES,
} from '../backend/persistence/coreRecords';
import { PROPOSAL_ELIGIBLE_APPLICATION_STATUSES } from './proposalTransitions';
import type { ContractStatus } from '../types';

export interface ContractTransitionTestCase {
  name: string;
  success: boolean;
  details: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runContractTransitionTests(): ContractTransitionTestCase[] {
  const results: ContractTransitionTestCase[] = [];
  const check = (name: string, test: () => void): void => {
    try {
      test();
      results.push({ name, success: true, details: 'OK' });
    } catch (error) {
      results.push({ name, success: false, details: String((error as Error)?.message ?? error) });
    }
  };

  check('P0-F Matrice: statuts réels du code conservés (DRAFT, SIGNATURE, ACTIVE, COMPLETED, TERMINATED), aucun statut inventé', () => {
    assert(CORE_DOMAIN_EXACTNESS.every(Boolean), 'les garde-fous de compilation des domaines doivent être vrais');
    assert(CONTRACT_STATUS_VALUES.length === 10, 'le domaine contrat conserve ses dix statuts réels');
    for (const status of CONTRACT_LIFECYCLE_STATUSES) {
      assert(
        (CONTRACT_STATUS_VALUES as readonly ContractStatus[]).includes(status),
        `statut « ${status} » absent du domaine contrat`,
      );
    }
    for (const status of CONTRACT_OUT_OF_SCOPE_STATUSES) {
      assert(
        (CONTRACT_STATUS_VALUES as readonly ContractStatus[]).includes(status),
        `statut réel « ${status} » attendu dans le domaine`,
      );
      assert(
        !(CONTRACT_LIFECYCLE_STATUSES as readonly ContractStatus[]).includes(status),
        `statut « ${status} » hors périmètre P0-F (incidents / remplacement / paiements)`,
      );
    }
    assert(CONTRACT_INITIAL_STATUS === 'DRAFT', 'la création P0-F produit le brouillon réel DRAFT');
  });

  check('P0-F Matrice: mapping documenté plan → code (SENT → SIGNATURE, SIGNED → drapeaux, ENDED → COMPLETED)', () => {
    const byPlan = new Map(CONTRACT_STATUS_MAPPING.map(entry => [entry.plan, entry.code]));
    assert(byPlan.get('DRAFT') === 'DRAFT', 'DRAFT conservé');
    assert(byPlan.get('SENT') === 'SIGNATURE', 'SENT projeté sur SIGNATURE (statut réel d’attente de signature)');
    assert((byPlan.get('SIGNED') ?? '').startsWith('SIGNATURE'), 'SIGNED est dérivé des drapeaux de signature, jamais un statut inventé');
    assert(byPlan.get('ACTIVE') === 'ACTIVE', 'ACTIVE conservé');
    assert(byPlan.get('ENDED') === 'COMPLETED', 'ENDED projeté sur COMPLETED (état terminal réel)');
    assert(byPlan.get('TERMINATED') === 'TERMINATED', 'TERMINATED conservé');
  });

  check('P0-F Transitions ouvertes: DRAFT → SIGNATURE → ACTIVE → COMPLETED / TERMINATED', () => {
    const send = evaluateContractTransition(CONTRACT_TRANSITION_RULES.SEND, 'DRAFT');
    assert(send.kind === 'APPLY' && send.to === 'SIGNATURE', `DRAFT → SIGNATURE attendu, reçu ${send.kind}`);
    const activate = evaluateContractTransition(CONTRACT_TRANSITION_RULES.ACTIVATE, 'SIGNATURE');
    assert(activate.kind === 'APPLY' && activate.to === 'ACTIVE', `SIGNATURE → ACTIVE attendu, reçu ${activate.kind}`);
    const end = evaluateContractTransition(CONTRACT_TRANSITION_RULES.END, 'ACTIVE');
    assert(end.kind === 'APPLY' && end.to === 'COMPLETED', `ACTIVE → COMPLETED attendu, reçu ${end.kind}`);
    const terminate = evaluateContractTransition(CONTRACT_TRANSITION_RULES.TERMINATE, 'ACTIVE');
    assert(terminate.kind === 'APPLY' && terminate.to === 'TERMINATED', `ACTIVE → TERMINATED attendu, reçu ${terminate.kind}`);
    assert(CONTRACT_ACTION_VALUES.length === 4, 'quatre actions de statut en P0-F (SIGN ne change pas de statut)');
  });

  check('P0-F Transitions refusées: aucun état impossible (DRAFT → ACTIVE, SENT → ENDED, ENDED/TERMINATED → ACTIVE)', () => {
    const refused: Array<[ContractAction, ContractStatus]> = [
      ['ACTIVATE', 'DRAFT'],
      ['END', 'DRAFT'],
      ['TERMINATE', 'DRAFT'],
      ['END', 'SIGNATURE'],
      ['TERMINATE', 'SIGNATURE'],
      ['ACTIVATE', 'ACTIVE'],
      ['END', 'COMPLETED'],
      ['TERMINATE', 'COMPLETED'],
      ['ACTIVATE', 'TERMINATED'],
      ['END', 'TERMINATED'],
      ['SEND', 'SIGNATURE'],
      ['SEND', 'ACTIVE'],
    ];
    for (const [action, from] of refused) {
      const outcome = evaluateContractTransition(CONTRACT_TRANSITION_RULES[action], from);
      assert(outcome.kind !== 'APPLY', `${action} depuis ${from} ne doit jamais s’appliquer`);
    }
    assert(CONTRACT_REFUSED_TRANSITIONS.length >= 10, 'les transitions refusées doivent être documentées');
    assert(
      CONTRACT_REFUSED_TRANSITIONS.some(entry => entry.from === 'DRAFT' && entry.to === 'ACTIVE'),
      'DRAFT → ACTIVE doit être explicitement refusée',
    );
    assert(
      CONTRACT_REFUSED_TRANSITIONS.some(entry => entry.from === 'SIGNATURE' && entry.to === 'COMPLETED'),
      'SENT → ENDED (SIGNATURE → COMPLETED) doit être explicitement refusée',
    );
    assert(
      CONTRACT_REFUSED_TRANSITIONS.some(entry => entry.from === 'TERMINATED' && entry.to === 'ACTIVE'),
      'TERMINATED → ACTIVE doit être explicitement refusée',
    );
  });

  check('P0-F États terminaux: COMPLETED / TERMINATED / REPLACED refusent toute transition', () => {
    for (const terminal of CONTRACT_TERMINAL_STATUSES) {
      for (const action of CONTRACT_ACTION_VALUES) {
        const outcome = evaluateContractTransition(CONTRACT_TRANSITION_RULES[action], terminal);
        assert(
          outcome.kind === 'TERMINAL',
          `${action} depuis ${terminal} doit être refusée comme état terminal, reçu ${outcome.kind}`,
        );
      }
    }
  });

  check('P0-F Signature: SIGNATURE uniquement, une fois par partie, jamais après activation', () => {
    const unsigned = { employerSigned: false, employeeSigned: false };
    const employerOnly = { employerSigned: true, employeeSigned: false };
    const both = { employerSigned: true, employeeSigned: true };

    assert(evaluateContractSignature('SIGNATURE', 'EMPLOYER', unsigned).kind === 'APPLY', 'signature employeur possible');
    assert(evaluateContractSignature('SIGNATURE', 'EMPLOYEE', employerOnly).kind === 'APPLY', 'signature salarié après envoi');
    assert(
      evaluateContractSignature('SIGNATURE', 'EMPLOYER', employerOnly).kind === 'ALREADY_SIGNED',
      'deux signatures employeur refusées',
    );
    assert(
      evaluateContractSignature('SIGNATURE', 'EMPLOYEE', both).kind === 'ALREADY_SIGNED',
      'deux signatures salarié refusées',
    );
    assert(evaluateContractSignature('ACTIVE', 'EMPLOYEE', both).kind === 'FORBIDDEN', 'signature après activation refusée');
    assert(evaluateContractSignature('DRAFT', 'EMPLOYEE', unsigned).kind === 'FORBIDDEN', 'signature avant envoi refusée');
    assert(evaluateContractSignature('TERMINATED', 'EMPLOYEE', both).kind === 'TERMINAL', 'signature sur contrat clos refusée');
    assert(!isContractFullySigned(unsigned) && !isContractFullySigned(employerOnly), 'SIGNED exige les deux drapeaux');
    assert(isContractFullySigned(both), 'les deux drapeaux atteignent SIGNED sans changer de statut');
    assert(CONTRACT_SIGNATURE_PARTIES.length === 2, 'deux parties signataires réelles');
  });

  check('P0-F Signature portée par l’envoi: seul SEND pose une signature (employeur), aucune autre transition', () => {
    assert(
      CONTRACT_TRANSITION_RULES.SEND.signatureParty === 'EMPLOYER',
      'l’envoi DRAFT → SIGNATURE EST la signature employeur du modèle réel',
    );
    for (const [action, rule] of Object.entries(CONTRACT_TRANSITION_RULES)) {
      if (action === 'SEND') continue;
      assert(rule.signatureParty === undefined, `${action} ne doit poser aucune signature implicite`);
    }
    assert(
      CONTRACT_TRANSITION_RULES.SEND.historyEvent === 'EMPLOYER_SIGNED',
      'l’historique de l’envoi porte EMPLOYER_SIGNED',
    );
  });

  check('P0-F Activation: double signature obligatoire et explicitement contrôlée', () => {
    assert(CONTRACT_TRANSITION_RULES.ACTIVATE.requiresBothSignatures === true, 'l’activation exige la double signature');
    assert(CONTRACT_TRANSITION_RULES.ACTIVATE.to === 'ACTIVE', 'la cible d’activation est ACTIVE');
    assert(CONTRACT_TRANSITION_RULES.ACTIVATE.actorRole === 'EMPLOYER', 'seul l’employeur active');
  });

  check('P0-F Rupture: motif obligatoire et protection M1 conservée (incident hors P0-F)', () => {
    assert(CONTRACT_TRANSITION_RULES.TERMINATE.requiresReason === true, 'le motif est obligatoire');
    assert(CONTRACT_TRANSITION_RULES.TERMINATE.protectsFirstMonth === true, 'la protection M1 est conservée');
    assert(CONTRACT_TRANSITION_RULES.TERMINATE.to === 'TERMINATED', 'la cible de rupture est TERMINATED');
    assert(
      CONTRACT_FIRST_MONTH_PROTECTION_REQUIREMENTS.length >= 3,
      'les prérequis de la sortie M1 doivent être documentés',
    );
    assert(
      CONTRACT_FIRST_MONTH_PROTECTION_REQUIREMENTS.some(requirement => /incident/i.test(requirement)),
      'l’incident obligatoire en M1 doit être explicitement mentionné',
    );
  });

  check('P0-F Éligibilité: candidature non terminale (P0-E5 conservé), aucune règle concurrente', () => {
    assert(
      CONTRACT_ELIGIBLE_APPLICATION_STATUSES === PROPOSAL_ELIGIBLE_APPLICATION_STATUSES,
      'la même liste d’éligibilité que P0-E5 est réutilisée (aucune représentation concurrente)',
    );
    for (const status of CONTRACT_ELIGIBLE_APPLICATION_STATUSES) {
      assert(
        (APPLICATION_STATUS_VALUES as readonly string[]).includes(status),
        `statut de candidature réel attendu : ${status}`,
      );
    }
    assert(
      !(CONTRACT_ELIGIBLE_APPLICATION_STATUSES as readonly string[]).includes('HIRED'),
      'HIRED reste hors P0-F (automatisation post-contrat)',
    );
  });

  check('P0-F Post-contrat: FILLED, HIRED/CONTRACTED, fermeture des autres candidatures restent documentés à venir', () => {
    assert(POST_CONTRACT_AUTOMATION_REQUIREMENTS.length >= 4, 'les étapes post-contrat doivent être documentées');
    assert(
      POST_CONTRACT_AUTOMATION_REQUIREMENTS.some(requirement => /FILLED/.test(requirement)),
      'le passage FILLED doit être explicitement documenté comme à venir',
    );
    assert(
      POST_CONTRACT_AUTOMATION_REQUIREMENTS.some(requirement => /HIRED/.test(requirement)),
      'HIRED / CONTRACTED doivent être explicitement documentés comme à venir',
    );
    assert(
      POST_CONTRACT_AUTOMATION_REQUIREMENTS.some(requirement => /CLOSED_OFFER_FILLED/.test(requirement)),
      'la fermeture des autres candidatures doit être explicitement documentée comme à venir',
    );
  });

  check('P0-F Signature renforcée: ce qui manque est documenté, aucune infrastructure inventée', () => {
    assert(
      CONTRACT_SIGNATURE_STRENGTHENING_REQUIREMENTS.length >= 3,
      'les renforcements de signature doivent être documentés',
    );
    assert(
      CONTRACT_SIGNATURE_STRENGTHENING_REQUIREMENTS.some(requirement => /cryptographique|PDF|preuves/i.test(requirement)),
      'l’absence de signature cryptographique/PDF doit être documentée',
    );
  });

  check('P0-F Événements: CONTRACT_* documentés, sans moteur Outbox/Queue', () => {
    const types = DOCUMENTED_CONTRACT_EVENTS.map(event => event.eventType);
    assert(
      CONTRACT_LIFECYCLE_EVENT_TYPES.every(type => types.includes(type)),
      'chaque événement du cycle contrat est documenté',
    );
    for (const rule of Object.values(CONTRACT_TRANSITION_RULES)) {
      assert(types.includes(rule.event), `événement documenté manquant pour ${rule.action}`);
    }
    for (const event of DOCUMENTED_CONTRACT_EVENTS) {
      assert(event.aggregateType === 'contract', 'agrégat contrat attendu');
      assert(event.dedupeKey.startsWith('contractId'), 'clé de déduplication stable attendue');
      assert(event.payload.includes('contractId'), 'payload minimal attendu');
    }
    assert(types.includes('CONTRACT_CREATED'), 'CONTRACT_CREATED documenté');
    assert(types.includes('CONTRACT_SIGNED'), 'CONTRACT_SIGNED documenté');
    assert(types.includes('CONTRACT_ACTIVATED'), 'CONTRACT_ACTIVATED documenté');
    assert(types.includes('CONTRACT_ENDED'), 'CONTRACT_ENDED documenté');
    assert(types.includes('CONTRACT_TERMINATED'), 'CONTRACT_TERMINATED documenté');
  });

  return results;
}
