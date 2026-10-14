/**
 * LE LABEUR — P0-E5 — tests purs du cycle PROPOSITION d'embauche.
 *
 * Aucune base, aucun réseau : ces tests verrouillent la matrice réellement
 * implémentée (statuts du code, transitions ouvertes et refusées, éligibilité
 * des candidatures, événements documentés) et constatent l'absence de champ
 * d'échéance dans le modèle réel — sans en inventer.
 */

import {
  DOCUMENTED_PROPOSAL_EVENTS,
  evaluateProposalTransition,
  isProposalPeriodicity,
  PROPOSAL_ELIGIBLE_APPLICATION_STATUSES,
  PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS,
  PROPOSAL_EXPIRATION_RULE,
  PROPOSAL_INITIAL_STATUS,
  PROPOSAL_LIFECYCLE_EVENT_TYPES,
  PROPOSAL_OUT_OF_SCOPE_ACTIONS,
  PROPOSAL_PERIODICITY_VALUES,
  PROPOSAL_RESPONDABLE_STATUSES,
  PROPOSAL_RESPONSE_ACTIONS,
  PROPOSAL_RESPONSE_RULES,
  PROPOSAL_TERMINAL_STATUSES,
  type ProposalResponseAction,
} from './proposalTransitions';
import {
  APPLICATION_STATUS_VALUES,
  PROPOSAL_STATUS_VALUES,
  CORE_DOMAIN_EXACTNESS,
} from '../backend/persistence/coreRecords';
import { APPLICATION_TERMINAL_STATUSES } from './applicationTransitions';
import type { ApplicationStatus, ProposalStatus } from '../types';

export interface ProposalTransitionTestCase {
  name: string;
  success: boolean;
  details: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runProposalTransitionTests(): ProposalTransitionTestCase[] {
  const results: ProposalTransitionTestCase[] = [];
  const check = (name: string, test: () => void): void => {
    try {
      test();
      results.push({ name, success: true, details: 'OK' });
    } catch (error) {
      results.push({ name, success: false, details: String((error as Error)?.message ?? error) });
    }
  };

  check('P0-E5 Matrice: statuts du code conservés (SENT, ACCEPTED, DECLINED, EXPIRED), aucun statut inventé', () => {
    assert(CORE_DOMAIN_EXACTNESS.every(Boolean), 'les garde-fous de compilation des domaines doivent être vrais');
    assert(PROPOSAL_STATUS_VALUES.length === 6, 'le domaine proposition conserve ses six statuts réels');
    assert(PROPOSAL_INITIAL_STATUS === 'SENT', 'l’émission produit SENT dans le modèle réel');
    for (const status of [...PROPOSAL_TERMINAL_STATUSES, ...PROPOSAL_RESPONDABLE_STATUSES]) {
      assert(
        (PROPOSAL_STATUS_VALUES as readonly ProposalStatus[]).includes(status),
        `statut « ${status} » absent du domaine proposition`,
      );
    }
    assert(PROPOSAL_RESPONSE_RULES.ACCEPT.to === 'ACCEPTED', 'ACCEPTED conservé');
    assert(PROPOSAL_RESPONSE_RULES.DECLINE.to === 'DECLINED', 'DECLINE → DECLINED (jamais REJECTED)');
    assert(PROPOSAL_EXPIRATION_RULE.to === 'EXPIRED', 'EXPIRED conservé');
  });

  check('P0-E5 Matrice: transitions ouvertes SENT → ACCEPTED / DECLINED / EXPIRED', () => {
    const cases: Array<[ProposalResponseAction | 'EXPIRE', ProposalStatus]> = [
      ['ACCEPT', 'SENT'],
      ['DECLINE', 'SENT'],
      ['EXPIRE', 'SENT'],
    ];
    for (const [action, from] of cases) {
      const rule = action === 'EXPIRE' ? PROPOSAL_EXPIRATION_RULE : PROPOSAL_RESPONSE_RULES[action];
      const outcome = evaluateProposalTransition(rule, from);
      assert(outcome.kind === 'APPLY', `${action} depuis ${from} doit être autorisée, reçu ${outcome.kind}`);
    }
  });

  check('P0-E5 Matrice: ACCEPTED, DECLINED et EXPIRED sont clos — aucune action, y compris celle qui les a produits', () => {
    const rules = [PROPOSAL_RESPONSE_RULES.ACCEPT, PROPOSAL_RESPONSE_RULES.DECLINE, PROPOSAL_EXPIRATION_RULE];
    for (const status of PROPOSAL_TERMINAL_STATUSES) {
      for (const rule of rules) {
        const outcome = evaluateProposalTransition(rule, status);
        assert(
          outcome.kind === 'TERMINAL',
          `${rule.action} depuis ${status} doit être refusé (état clos), reçu ${outcome.kind}`,
        );
      }
    }
  });

  check('P0-E5 Matrice: DRAFT et REVISION_REQUESTED ne sont produits par aucune action de cette tranche', () => {
    for (const status of ['DRAFT', 'REVISION_REQUESTED'] as const) {
      for (const rule of [PROPOSAL_RESPONSE_RULES.ACCEPT, PROPOSAL_RESPONSE_RULES.DECLINE, PROPOSAL_EXPIRATION_RULE]) {
        const outcome = evaluateProposalTransition(rule, status);
        assert(
          outcome.kind === 'FORBIDDEN',
          `${rule.action} depuis ${status} doit être refusée (statut non produit par P0-E5), reçu ${outcome.kind}`,
        );
      }
    }
    assert(
      PROPOSAL_RESPONDABLE_STATUSES.length === 1 && PROPOSAL_RESPONDABLE_STATUSES[0] === 'SENT',
      'seul SENT est ouvrable par cette tranche',
    );
  });

  check('P0-E5 Périmètre: REVISE (REVISION_REQUESTED) est déclaré hors tranche, jamais produit', () => {
    assert(
      PROPOSAL_OUT_OF_SCOPE_ACTIONS.length === 1 && PROPOSAL_OUT_OF_SCOPE_ACTIONS[0] === 'REVISE',
      'REVISE doit rester explicitement hors périmètre',
    );
    for (const action of PROPOSAL_RESPONSE_ACTIONS) {
      assert(!(PROPOSAL_OUT_OF_SCOPE_ACTIONS as readonly string[]).includes(action), `${action} ne doit pas être hors périmètre`);
      assert(
        PROPOSAL_STATUS_VALUES.includes(PROPOSAL_RESPONSE_RULES[action].to),
        `${action} doit viser un statut réel du domaine`,
      );
    }
    assert(PROPOSAL_RESPONSE_ACTIONS.length === 2, 'deux réponses ouvertes : ACCEPT et DECLINE');
  });

  check('P0-E5 Rôles: CANDIDATE pour répondre, EMPLOYER émetteur pour expirer', () => {
    assert(PROPOSAL_RESPONSE_RULES.ACCEPT.actorRole === 'CANDIDATE', 'ACCEPT réservé au candidat destinataire');
    assert(PROPOSAL_RESPONSE_RULES.DECLINE.actorRole === 'CANDIDATE', 'DECLINE réservé au candidat destinataire');
    assert(PROPOSAL_EXPIRATION_RULE.actorRole === 'EMPLOYER', 'EXPIRE réservé à l’employeur émetteur');
  });

  check('P0-E5 Éligibilité: une candidature terminale (P0-E4) n’est jamais admissible à une proposition', () => {
    const expectedEligible = (APPLICATION_STATUS_VALUES as readonly ApplicationStatus[])
      .filter(status => !(APPLICATION_TERMINAL_STATUSES as readonly string[]).includes(status));
    assert(
      JSON.stringify([...PROPOSAL_ELIGIBLE_APPLICATION_STATUSES]) === JSON.stringify(expectedEligible),
      `statuts admissibles désalignés: ${PROPOSAL_ELIGIBLE_APPLICATION_STATUSES.join(', ')} vs ${expectedEligible.join(', ')}`,
    );
    for (const status of APPLICATION_TERMINAL_STATUSES) {
      assert(
        !(PROPOSAL_ELIGIBLE_APPLICATION_STATUSES as readonly string[]).includes(status),
        `${status} ne doit pas être admissible`,
      );
    }
  });

  check('P0-E5 Périodicité: seules les trois valeurs du modèle réel sont acceptées', () => {
    assert(PROPOSAL_PERIODICITY_VALUES.length === 3, 'trois périodicités réelles');
    for (const value of PROPOSAL_PERIODICITY_VALUES) {
      assert(isProposalPeriodicity(value), `${value} doit être acceptée`);
    }
    assert(!isProposalPeriodicity('Trimestriel'), 'aucune périodicité inventée');
    assert(!isProposalPeriodicity(undefined), 'valeur absente refusée');
  });

  check('P0-E5 Expiration: aucun champ d’échéance n’est inventé, l’automatisation reste documentée', () => {
    assert(
      PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS.length >= 3,
      'les prérequis d’automatisation doivent être documentés',
    );
    assert(
      PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS.some(requirement => /échéance/i.test(requirement)),
      'le futur champ d’échéance doit être explicitement mentionné',
    );
    assert(
      PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS.some(requirement => /Cron|Queue/i.test(requirement)),
      'le futur moteur Cron/Queue doit être explicitement mentionné',
    );
    assert(
      PROPOSAL_EXPIRATION_RULE.from.length === 1 && PROPOSAL_EXPIRATION_RULE.from[0] === 'SENT',
      'l’expiration ne s’applique qu’à une proposition SENT',
    );
  });

  check('P0-E5 Événements: PROPOSAL_* documentés, sans moteur Outbox/Queue', () => {
    const types = DOCUMENTED_PROPOSAL_EVENTS.map(event => event.eventType);
    assert(
      PROPOSAL_LIFECYCLE_EVENT_TYPES.every(type => types.includes(type)),
      'chaque événement du cycle proposition est documenté',
    );
    for (const rule of [PROPOSAL_RESPONSE_RULES.ACCEPT, PROPOSAL_RESPONSE_RULES.DECLINE, PROPOSAL_EXPIRATION_RULE]) {
      assert(types.includes(rule.event), `événement documenté manquant pour ${rule.action}`);
    }
    for (const event of DOCUMENTED_PROPOSAL_EVENTS) {
      assert(event.aggregateType === 'proposal', 'agrégat proposition attendu');
      assert(event.dedupeKey.startsWith('proposalId'), 'clé de déduplication stable attendue');
      assert(event.payload.includes('proposalId'), 'payload minimal attendu');
    }
  });

  return results;
}
