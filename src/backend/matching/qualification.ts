/** P0-MATCHING — deterministic product screening, not a legal qualification. */

import { ApiError } from '../api/errors';
import {
  QUALIFICATION_RULES_VERSION,
  type MissionQualificationAnswers,
  type QualificationDecision,
  type QualificationReason,
} from './records';

const ANSWER_FIELDS = [
  'serviceNature',
  'deliverableDescription',
  'acceptanceCriteria',
  'acceptanceCriteriaObjective',
  'compensationBasis',
  'providerChoosesMethods',
  'providerOrganizesTime',
  'mayServeOtherClients',
  'mayDeclineWithoutPenalty',
  'professionalRisk',
  'disciplinaryPower',
  'continuousShift',
  'dailyHierarchicalOrders',
  'permanentIntegratedPosition',
  'exclusivityRequired',
  'exclusivityJustified',
  'timePlaceConstraint',
  'candidateFacingConstraintSummary',
  'formalities',
] as const;
const FORMALITY_FIELDS = [
  'majorityCheckPlanned',
  'professionalStatusRequirementsIdentified',
  'professionalAuthorizationRequired',
  'professionalAuthorizationCheckPlanned',
  'taxInvoicingRequirementsIdentified',
  'insuranceRequired',
  'insuranceRequirementsIdentified',
] as const;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', `${label} doit être un objet JSON.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ApiError('VALIDATION_ERROR', `Champ non autorisé dans ${label} : ${unknown.join(', ')}.`);
  }
}

function enumValue<Value extends string>(value: unknown, allowed: readonly Value[], fallback: Value, label: string): Value {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as Value)) {
    throw new ApiError('VALIDATION_ERROR', `${label} a une valeur invalide.`);
  }
  return value as Value;
}

function nullableBoolean(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'boolean') throw new ApiError('VALIDATION_ERROR', `${label} doit être un booléen ou rester sans réponse.`);
  return value;
}

function shortText(value: unknown, label: string, maxLength: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ApiError('VALIDATION_ERROR', `${label} doit être un texte.`);
  const text = value.trim();
  if (text.length > maxLength) throw new ApiError('VALIDATION_ERROR', `${label} dépasse ${maxLength} caractères.`);
  return text;
}

/**
 * Strict allow-list is also the sensitive-data boundary: demographic, health,
 * biometric, political, religious and other unmodeled fields cannot be stored.
 * Missing answers are normalized to UNKNOWN/null and route to human review.
 */
export function parseMissionQualificationAnswers(value: unknown): MissionQualificationAnswers {
  const input = objectValue(value, 'answers');
  rejectUnknownKeys(input, ANSWER_FIELDS, 'answers');
  const formalitiesInput = input.formalities === undefined || input.formalities === null
    ? {}
    : objectValue(input.formalities, 'answers.formalities');
  rejectUnknownKeys(formalitiesInput, FORMALITY_FIELDS, 'answers.formalities');

  return {
    serviceNature: enumValue(input.serviceNature, ['AUTONOMOUS_DELIVERABLE', 'PRESENCE_BASED', 'UNCLEAR'] as const, 'UNCLEAR', 'serviceNature'),
    deliverableDescription: shortText(input.deliverableDescription, 'deliverableDescription', 2000),
    acceptanceCriteria: shortText(input.acceptanceCriteria, 'acceptanceCriteria', 2000),
    acceptanceCriteriaObjective: nullableBoolean(input.acceptanceCriteriaObjective, 'acceptanceCriteriaObjective'),
    compensationBasis: enumValue(input.compensationBasis, ['RESULT_OR_SERVICE', 'TIME_OR_PRESENCE', 'MIXED', 'UNKNOWN'] as const, 'UNKNOWN', 'compensationBasis'),
    providerChoosesMethods: nullableBoolean(input.providerChoosesMethods, 'providerChoosesMethods'),
    providerOrganizesTime: nullableBoolean(input.providerOrganizesTime, 'providerOrganizesTime'),
    mayServeOtherClients: nullableBoolean(input.mayServeOtherClients, 'mayServeOtherClients'),
    mayDeclineWithoutPenalty: nullableBoolean(input.mayDeclineWithoutPenalty, 'mayDeclineWithoutPenalty'),
    professionalRisk: nullableBoolean(input.professionalRisk, 'professionalRisk'),
    disciplinaryPower: nullableBoolean(input.disciplinaryPower, 'disciplinaryPower'),
    continuousShift: nullableBoolean(input.continuousShift, 'continuousShift'),
    dailyHierarchicalOrders: nullableBoolean(input.dailyHierarchicalOrders, 'dailyHierarchicalOrders'),
    permanentIntegratedPosition: nullableBoolean(input.permanentIntegratedPosition, 'permanentIntegratedPosition'),
    exclusivityRequired: nullableBoolean(input.exclusivityRequired, 'exclusivityRequired'),
    exclusivityJustified: nullableBoolean(input.exclusivityJustified, 'exclusivityJustified'),
    timePlaceConstraint: enumValue(input.timePlaceConstraint, ['NONE', 'OPERATIONAL', 'STRONG', 'UNKNOWN'] as const, 'UNKNOWN', 'timePlaceConstraint'),
    candidateFacingConstraintSummary: shortText(input.candidateFacingConstraintSummary, 'candidateFacingConstraintSummary', 500),
    formalities: {
      majorityCheckPlanned: nullableBoolean(formalitiesInput.majorityCheckPlanned, 'formalities.majorityCheckPlanned'),
      professionalStatusRequirementsIdentified: nullableBoolean(formalitiesInput.professionalStatusRequirementsIdentified, 'formalities.professionalStatusRequirementsIdentified'),
      professionalAuthorizationRequired: nullableBoolean(formalitiesInput.professionalAuthorizationRequired, 'formalities.professionalAuthorizationRequired'),
      professionalAuthorizationCheckPlanned: nullableBoolean(formalitiesInput.professionalAuthorizationCheckPlanned, 'formalities.professionalAuthorizationCheckPlanned'),
      taxInvoicingRequirementsIdentified: nullableBoolean(formalitiesInput.taxInvoicingRequirementsIdentified, 'formalities.taxInvoicingRequirementsIdentified'),
      insuranceRequired: nullableBoolean(formalitiesInput.insuranceRequired, 'formalities.insuranceRequired'),
      insuranceRequirementsIdentified: nullableBoolean(formalitiesInput.insuranceRequirementsIdentified, 'formalities.insuranceRequirementsIdentified'),
    },
  };
}

function reason(
  code: string,
  category: QualificationReason['category'],
  severity: QualificationReason['severity'],
  explanation: string,
): QualificationReason {
  return { code, category, severity, explanation };
}

/**
 * Apply explicit P0 product rules in a fixed order. A single blocking signal
 * wins over any review signal, ensuring a deterministic refusal; ambiguous or
 * incomplete answers route to a human. A green result is only product
 * eligibility for this workflow and never a legal opinion.
 */
export function evaluateMissionQualification(
  answers: MissionQualificationAnswers,
): { decision: QualificationDecision; reasons: QualificationReason[]; ruleVersion: string } {
  const reasons: QualificationReason[] = [];
  const addReview = (code: string, category: QualificationReason['category'], explanation: string) => {
    reasons.push(reason(code, category, 'REVIEW', explanation));
  };
  const addBlock = (code: string, category: QualificationReason['category'], explanation: string) => {
    reasons.push(reason(code, category, 'BLOCK', explanation));
  };

  if (answers.serviceNature === 'PRESENCE_BASED') {
    addBlock('PRESENCE_BASED_SERVICE', 'SERVICE_NATURE', 'Le modèle décrit repose sur la présence plutôt que sur un livrable ou un service autonome.');
  } else if (answers.serviceNature === 'UNCLEAR') {
    addReview('SERVICE_NATURE_UNCLEAR', 'SERVICE_NATURE', 'La nature autonome du service n’est pas suffisamment documentée.');
  }
  if (!answers.deliverableDescription) {
    addReview('DELIVERABLE_NOT_DESCRIBED', 'SERVICE_NATURE', 'Le résultat ou livrable attendu doit être précisé.');
  }
  if (!answers.acceptanceCriteria) {
    addReview('ACCEPTANCE_CRITERIA_MISSING', 'SERVICE_NATURE', 'Les critères de réception du résultat ne sont pas documentés.');
  }
  if (answers.acceptanceCriteriaObjective === false) {
    addReview('ACCEPTANCE_CRITERIA_NOT_OBJECTIVE', 'SERVICE_NATURE', 'Les critères de réception ne sont pas déclarés objectifs.');
  } else if (answers.acceptanceCriteriaObjective === null) {
    addReview('ACCEPTANCE_CRITERIA_OBJECTIVITY_UNKNOWN', 'SERVICE_NATURE', 'Le caractère objectif des critères de réception reste à examiner.');
  }

  if (answers.compensationBasis === 'TIME_OR_PRESENCE') {
    addBlock('COMPENSATION_FOR_PRESENCE', 'SERVICE_NATURE', 'La rémunération est déclarée liée uniquement au temps ou à la présence.');
  } else if (answers.compensationBasis === 'MIXED') {
    addReview('MIXED_COMPENSATION_BASIS', 'SERVICE_NATURE', 'La part liée au résultat et celle liée au temps doivent être examinées.');
  } else if (answers.compensationBasis === 'UNKNOWN') {
    addReview('COMPENSATION_BASIS_UNKNOWN', 'INFORMATION', 'Le mode de rémunération n’est pas renseigné.');
  }

  if (answers.providerChoosesMethods === false) {
    addBlock('NO_METHOD_AUTONOMY', 'AUTONOMY', 'Le Prestataire ne choisit pas ses méthodes d’exécution.');
  } else if (answers.providerChoosesMethods === null) {
    addReview('METHOD_AUTONOMY_UNKNOWN', 'AUTONOMY', 'L’autonomie dans le choix des méthodes n’est pas renseignée.');
  }
  if (answers.providerOrganizesTime === false) {
    addBlock('NO_TIME_AUTONOMY', 'AUTONOMY', 'Le Prestataire ne dispose pas d’autonomie dans l’organisation de son temps.');
  } else if (answers.providerOrganizesTime === null) {
    addReview('TIME_AUTONOMY_UNKNOWN', 'AUTONOMY', 'L’organisation du temps reste à clarifier.');
  }
  if (answers.mayServeOtherClients === false) {
    addReview('OTHER_CLIENTS_RESTRICTION', 'AUTONOMY', 'La possibilité réelle de servir d’autres clients est restreinte et doit être examinée.');
  } else if (answers.mayServeOtherClients === null) {
    addReview('OTHER_CLIENTS_UNKNOWN', 'AUTONOMY', 'La liberté de servir d’autres clients n’est pas renseignée.');
  }
  if (answers.mayDeclineWithoutPenalty === false) {
    addBlock('CANNOT_DECLINE_WITHOUT_PENALTY', 'AUTONOMY', 'Le Prestataire ne peut pas refuser la mission sans sanction ou pénalité.');
  } else if (answers.mayDeclineWithoutPenalty === null) {
    addReview('RIGHT_TO_DECLINE_UNKNOWN', 'AUTONOMY', 'La possibilité réelle de refuser sans sanction n’est pas renseignée.');
  }
  if (answers.professionalRisk === false) {
    addReview('PROFESSIONAL_RISK_NOT_ESTABLISHED', 'AUTONOMY', 'L’existence d’un risque professionnel réel n’est pas établie par les réponses.');
  } else if (answers.professionalRisk === null) {
    addReview('PROFESSIONAL_RISK_UNKNOWN', 'AUTONOMY', 'Le risque professionnel reste à clarifier.');
  }

  if (answers.disciplinaryPower === true) {
    addBlock('DISCIPLINARY_POWER_PRESENT', 'SUBORDINATION', 'Un pouvoir disciplinaire est déclaré.');
  } else if (answers.disciplinaryPower === null) {
    addReview('DISCIPLINARY_POWER_UNKNOWN', 'SUBORDINATION', 'L’absence de pouvoir disciplinaire doit être confirmée.');
  }
  if (answers.continuousShift === true) {
    addBlock('CONTINUOUS_SHIFT', 'SUBORDINATION', 'Un horaire continu assimilable à un shift est déclaré.');
  } else if (answers.continuousShift === null) {
    addReview('CONTINUOUS_SHIFT_UNKNOWN', 'SUBORDINATION', 'L’organisation des horaires continus doit être clarifiée.');
  }
  if (answers.dailyHierarchicalOrders === true) {
    addBlock('DAILY_HIERARCHICAL_ORDERS', 'SUBORDINATION', 'Des ordres hiérarchiques quotidiens sont déclarés.');
  } else if (answers.dailyHierarchicalOrders === null) {
    addReview('DAILY_ORDERS_UNKNOWN', 'SUBORDINATION', 'La présence d’ordres hiérarchiques quotidiens doit être clarifiée.');
  }
  if (answers.permanentIntegratedPosition === true) {
    addBlock('PERMANENT_INTEGRATED_POSITION', 'SUBORDINATION', 'La mission correspond à un poste permanent intégré à l’organisation.');
  } else if (answers.permanentIntegratedPosition === null) {
    addReview('PERMANENT_POSITION_UNKNOWN', 'SUBORDINATION', 'L’intégration éventuelle à un poste permanent doit être clarifiée.');
  }

  if (answers.exclusivityRequired === true) {
    if (answers.exclusivityJustified === false) {
      addBlock('UNJUSTIFIED_EXCLUSIVITY', 'SUBORDINATION', 'Une exclusivité est déclarée sans justification.');
    } else {
      addReview('EXCLUSIVITY_REQUIRES_HUMAN_REVIEW', 'SUBORDINATION', 'Toute exclusivité déclarée est soumise à une revue humaine; le système n’en valide pas la justification.');
    }
  } else if (answers.exclusivityRequired === null) {
    addReview('EXCLUSIVITY_UNKNOWN', 'SUBORDINATION', 'L’existence d’une exclusivité n’est pas renseignée.');
  }

  if (answers.timePlaceConstraint === 'STRONG') {
    addReview('STRONG_TIME_OR_PLACE_CONSTRAINT', 'TIME_AND_PLACE', 'Une contrainte forte de temps ou de lieu est déclarée et requiert une revue humaine.');
  } else if (answers.timePlaceConstraint === 'UNKNOWN') {
    addReview('TIME_OR_PLACE_CONSTRAINT_UNKNOWN', 'TIME_AND_PLACE', 'Les contraintes nécessaires de temps et de lieu ne sont pas renseignées.');
  }
  if (answers.timePlaceConstraint !== 'NONE' && !answers.candidateFacingConstraintSummary) {
    addReview('CANDIDATE_CONSTRAINT_SUMMARY_MISSING', 'TIME_AND_PLACE', 'Un résumé clair des contraintes visibles par le candidat est requis.');
  }

  const formalities = answers.formalities;
  if (formalities.majorityCheckPlanned === false) {
    addReview('MAJORITY_CHECK_NOT_PLANNED', 'FORMALITIES', 'La vérification de la majorité/capacité requise avant engagement n’est pas prévue.');
  } else if (formalities.majorityCheckPlanned === null) {
    addReview('MAJORITY_CHECK_UNKNOWN', 'FORMALITIES', 'La vérification de la majorité/capacité requise reste à confirmer.');
  }
  if (formalities.professionalStatusRequirementsIdentified === false) {
    addReview('PROFESSIONAL_STATUS_NOT_ASSESSED', 'FORMALITIES', 'Les exigences de statut professionnel ne sont pas identifiées.');
  } else if (formalities.professionalStatusRequirementsIdentified === null) {
    addReview('PROFESSIONAL_STATUS_REQUIREMENTS_UNKNOWN', 'FORMALITIES', 'Les exigences de statut professionnel restent à identifier.');
  }
  if (formalities.professionalAuthorizationRequired === null) {
    addReview('PROFESSIONAL_AUTHORIZATION_REQUIREMENT_UNKNOWN', 'FORMALITIES', 'La nécessité éventuelle d’une autorisation professionnelle reste à vérifier.');
  } else if (formalities.professionalAuthorizationRequired && formalities.professionalAuthorizationCheckPlanned !== true) {
    addReview('PROFESSIONAL_AUTHORIZATION_CHECK_NOT_PLANNED', 'FORMALITIES', 'L’autorisation professionnelle requise ne fait pas l’objet d’une vérification planifiée.');
  }
  if (formalities.taxInvoicingRequirementsIdentified === false) {
    addReview('TAX_INVOICING_NOT_ASSESSED', 'FORMALITIES', 'Les exigences fiscales et de facturation ne sont pas identifiées.');
  } else if (formalities.taxInvoicingRequirementsIdentified === null) {
    addReview('TAX_INVOICING_REQUIREMENTS_UNKNOWN', 'FORMALITIES', 'Les exigences fiscales et de facturation restent à identifier.');
  }
  if (formalities.insuranceRequired === null) {
    addReview('INSURANCE_REQUIREMENT_UNKNOWN', 'FORMALITIES', 'La nécessité d’une assurance selon le risque doit être examinée.');
  } else if (formalities.insuranceRequired && formalities.insuranceRequirementsIdentified !== true) {
    addReview('INSURANCE_REQUIREMENTS_NOT_IDENTIFIED', 'FORMALITIES', 'Les exigences d’assurance applicables ne sont pas identifiées.');
  }

  const hasBlock = reasons.some(item => item.severity === 'BLOCK');
  const hasReview = reasons.some(item => item.severity === 'REVIEW');
  const decision: QualificationDecision = hasBlock
    ? 'BLOCKED'
    : hasReview
      ? 'HUMAN_REVIEW_REQUIRED'
      : 'ELIGIBLE_FOR_INDEPENDENT';

  if (decision === 'ELIGIBLE_FOR_INDEPENDENT') {
    reasons.push(reason(
      'PRODUCT_SCREENING_PASSED',
      'INFORMATION',
      'INFO',
      'Les réponses satisfont les contrôles produit versionnés; ceci ne constitue pas une qualification juridique définitive ni un avis juridique.',
    ));
  }

  return { decision, reasons, ruleVersion: QUALIFICATION_RULES_VERSION };
}
