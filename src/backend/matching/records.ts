/**
 * LE LABEUR — P0-MATCHING — persistence contracts.
 *
 * The qualification and ranking versions are persisted with every decision/run.
 * Candidate matching profiles contain only fields already represented in the
 * product profile (skills, broad administrative area and simple declared
 * availability). They deliberately contain no protected/sensitive attributes,
 * precise location, contact details, disputes or payment data.
 */

export const QUALIFICATION_RULES_VERSION = 'P0-MATCHING-QUALIFICATION-1';
export const RANKING_RULES_VERSION = 'P0-MATCHING-RANKING-1';

export const QUALIFICATION_DECISIONS = [
  'ELIGIBLE_FOR_INDEPENDENT',
  'HUMAN_REVIEW_REQUIRED',
  'BLOCKED',
] as const;
export type QualificationDecision = (typeof QUALIFICATION_DECISIONS)[number];

export type QualificationReasonSeverity = 'BLOCK' | 'REVIEW' | 'INFO';
export type QualificationReasonCategory =
  | 'SERVICE_NATURE'
  | 'AUTONOMY'
  | 'SUBORDINATION'
  | 'TIME_AND_PLACE'
  | 'FORMALITIES'
  | 'INFORMATION';

export interface QualificationReason {
  code: string;
  category: QualificationReasonCategory;
  severity: QualificationReasonSeverity;
  explanation: string;
}

export type MissionServiceNature = 'AUTONOMOUS_DELIVERABLE' | 'PRESENCE_BASED' | 'UNCLEAR';
export type CompensationBasis = 'RESULT_OR_SERVICE' | 'TIME_OR_PRESENCE' | 'MIXED' | 'UNKNOWN';
export type TimePlaceConstraint = 'NONE' | 'OPERATIONAL' | 'STRONG' | 'UNKNOWN';

/**
 * Employer-submitted screening facts, not a legal opinion or a determination
 * about any individual candidate. `null` means unanswered/unknown and can
 * never silently pass qualification.
 */
export interface MissionQualificationAnswers {
  serviceNature: MissionServiceNature;
  deliverableDescription: string;
  acceptanceCriteria: string;
  acceptanceCriteriaObjective: boolean | null;
  compensationBasis: CompensationBasis;
  providerChoosesMethods: boolean | null;
  providerOrganizesTime: boolean | null;
  mayServeOtherClients: boolean | null;
  mayDeclineWithoutPenalty: boolean | null;
  professionalRisk: boolean | null;
  disciplinaryPower: boolean | null;
  continuousShift: boolean | null;
  dailyHierarchicalOrders: boolean | null;
  permanentIntegratedPosition: boolean | null;
  exclusivityRequired: boolean | null;
  exclusivityJustified: boolean | null;
  timePlaceConstraint: TimePlaceConstraint;
  candidateFacingConstraintSummary: string;
  formalities: {
    majorityCheckPlanned: boolean | null;
    professionalStatusRequirementsIdentified: boolean | null;
    professionalAuthorizationRequired: boolean | null;
    professionalAuthorizationCheckPlanned: boolean | null;
    taxInvoicingRequirementsIdentified: boolean | null;
    insuranceRequired: boolean | null;
    insuranceRequirementsIdentified: boolean | null;
  };
}

export interface MissionQualificationRecord {
  qualificationId: string;
  offerId: string;
  employerId: string;
  answers: MissionQualificationAnswers;
  initialDecision: QualificationDecision;
  decision: QualificationDecision;
  reasons: QualificationReason[];
  ruleVersion: string;
  evaluatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

export type MatchingSortBy = 'score' | 'skills' | 'location' | 'availability';
export type MatchingSortDirection = 'ASC' | 'DESC';
export type CandidateDeclaredAvailability = 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' | 'UNDECLARED';

/**
 * Minimal self-managed matching profile. Zone fields are broad administrative
 * identifiers only; no coordinates, address, demographic or contact fields.
 */
export interface CandidateMatchingProfileRecord {
  candidateId: string;
  skills: string[];
  departmentId?: string;
  municipalityId?: string;
  arrondissementId?: string;
  localityId?: string;
  availability: CandidateDeclaredAvailability;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateMatchingCandidate extends CandidateMatchingProfileRecord {
  displayName: string;
}

export interface MatchingScoreBreakdown {
  skills: { points: number; maximum: number; matchedSkills: string[]; used: boolean };
  location: { points: number; maximum: number; match: 'LOCALITY' | 'ARRONDISSEMENT' | 'MUNICIPALITY' | 'DEPARTMENT' | 'NONE' | 'NOT_SCORED'; used: boolean };
  availability: { points: number; maximum: number; declared: CandidateDeclaredAvailability; used: boolean };
}

/** Saved result snapshot; no application, proposal or contract is created. */
export interface MatchingResultSnapshot {
  candidateId: string;
  displayName: string;
  position: number;
  score: number;
  scoreMaximum: number;
  breakdown: MatchingScoreBreakdown;
}

export interface MatchingCriteriaSnapshot {
  version: string;
  factors: readonly [
    { code: 'SKILLS_OVERLAP'; weight: 60; source: 'offer.skills + self-declared candidate skills'; used: boolean },
    { code: 'ADMINISTRATIVE_ZONE'; weight: 30; source: 'offer/candidate administrative area identifiers'; used: boolean },
    { code: 'DECLARED_AVAILABILITY'; weight: 10; source: 'candidate self-declaration'; used: true },
  ];
  tieBreak: 'candidateId_ASC';
  clientMakesFinalChoice: true;
  automaticAssignment: false;
}

export interface MatchingRunRecord {
  runId: string;
  offerId: string;
  qualificationId: string;
  employerId: string;
  sortBy: MatchingSortBy;
  sortDirection: MatchingSortDirection;
  rulesVersion: string;
  criteria: MatchingCriteriaSnapshot;
  results: MatchingResultSnapshot[];
  createdAt: string;
}

export interface MissionQualificationStore {
  create(record: MissionQualificationRecord): Promise<MissionQualificationRecord>;
  findByOfferId(offerId: string): Promise<MissionQualificationRecord | null>;
  findByQualificationId(qualificationId: string): Promise<MissionQualificationRecord | null>;
  listPendingReview(limit: number, afterId?: string | null): Promise<MissionQualificationRecord[]>;
  resolveHumanReview(input: {
    qualificationId: string;
    expectedDecision: 'HUMAN_REVIEW_REQUIRED';
    decision: 'ELIGIBLE_FOR_INDEPENDENT' | 'BLOCKED';
    reviewedBy: string;
    reviewedAt: string;
    reviewReason: string;
  }): Promise<MissionQualificationRecord | null>;
}

export interface CandidateMatchingProfileStore {
  upsert(record: CandidateMatchingProfileRecord): Promise<CandidateMatchingProfileRecord>;
  findByCandidateId(candidateId: string): Promise<CandidateMatchingProfileRecord | null>;
  /** Active candidate accounts only; result size is always explicitly bounded. */
  listActiveCandidates(limit: number): Promise<CandidateMatchingCandidate[]>;
}

export interface MatchingRunStore {
  create(record: MatchingRunRecord): Promise<MatchingRunRecord>;
  findById(runId: string): Promise<MatchingRunRecord | null>;
}

export interface MatchingStores {
  qualifications: MissionQualificationStore;
  candidateProfiles: CandidateMatchingProfileStore;
  runs: MatchingRunStore;
}
