/** P0-MATCHING — deterministic, transparent ranker. No legal or hiring decision. */

import { ApiError } from '../api/errors';
import type { OfferRecord } from '../persistence/coreRecords';
import {
  RANKING_RULES_VERSION,
  type CandidateDeclaredAvailability,
  type CandidateMatchingCandidate,
  type CandidateMatchingProfileRecord,
  type MatchingCriteriaSnapshot,
  type MatchingResultSnapshot,
  type MatchingScoreBreakdown,
  type MatchingSortBy,
  type MatchingSortDirection,
} from './records';

const PROFILE_FIELDS = [
  'skills',
  'departmentId',
  'municipalityId',
  'arrondissementId',
  'localityId',
  'availability',
] as const;
const AVAILABILITIES = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'UNDECLARED'] as const;
const SORT_FIELDS = ['score', 'skills', 'location', 'availability'] as const;
const ZONE_ID = /^[\p{L}\p{N}_.:-]{1,128}$/u;

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('VALIDATION_ERROR', `${label} doit être un objet JSON.`);
  }
  return value as Record<string, unknown>;
}

function readZoneId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !ZONE_ID.test(value.trim())) {
    throw new ApiError('VALIDATION_ERROR', `${label} doit être un identifiant de zone administrative valide.`);
  }
  return value.trim();
}

/** Strict allow-list: protected and other nonmatching attributes are rejected. */
export function parseCandidateMatchingProfile(value: unknown): Omit<CandidateMatchingProfileRecord, 'candidateId' | 'createdAt' | 'updatedAt'> {
  const input = plainObject(value, 'matchingProfile');
  const unknown = Object.keys(input).filter(key => !(PROFILE_FIELDS as readonly string[]).includes(key));
  if (unknown.length > 0) {
    throw new ApiError('VALIDATION_ERROR', `Champ non autorisé dans matchingProfile : ${unknown.join(', ')}.`);
  }

  const rawSkills = input.skills ?? [];
  if (!Array.isArray(rawSkills) || rawSkills.length > 50) {
    throw new ApiError('VALIDATION_ERROR', 'skills doit contenir au plus 50 compétences.');
  }
  const skills = rawSkills.map((value, index) => {
    if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 80) {
      throw new ApiError('VALIDATION_ERROR', `skills[${index}] est invalide.`);
    }
    return value.trim().replace(/\s+/g, ' ');
  });
  const uniqueSkills = [...new Map(skills.map(skill => [normalizeSkill(skill), skill])).values()]
    .sort((left, right) => compareText(normalizeSkill(left), normalizeSkill(right)));

  const availability = input.availability === undefined || input.availability === null
    ? 'UNDECLARED'
    : input.availability;
  if (typeof availability !== 'string' || !AVAILABILITIES.includes(availability as CandidateDeclaredAvailability)) {
    throw new ApiError('VALIDATION_ERROR', 'availability a une valeur invalide.');
  }

  return {
    skills: uniqueSkills,
    ...(readZoneId(input.departmentId, 'departmentId') ? { departmentId: readZoneId(input.departmentId, 'departmentId') } : {}),
    ...(readZoneId(input.municipalityId, 'municipalityId') ? { municipalityId: readZoneId(input.municipalityId, 'municipalityId') } : {}),
    ...(readZoneId(input.arrondissementId, 'arrondissementId') ? { arrondissementId: readZoneId(input.arrondissementId, 'arrondissementId') } : {}),
    ...(readZoneId(input.localityId, 'localityId') ? { localityId: readZoneId(input.localityId, 'localityId') } : {}),
    availability: availability as CandidateDeclaredAvailability,
  };
}

export interface MatchingSortInput {
  sortBy: MatchingSortBy;
  sortDirection: MatchingSortDirection;
}

export function parseMatchingSort(value: unknown): MatchingSortInput {
  if (value === undefined || value === null) return { sortBy: 'score', sortDirection: 'DESC' };
  const input = plainObject(value, 'sorting');
  const unknown = Object.keys(input).filter(key => !['sortBy', 'sortDirection'].includes(key));
  if (unknown.length > 0) throw new ApiError('VALIDATION_ERROR', `Champ de tri non autorisé : ${unknown.join(', ')}.`);
  const sortBy = input.sortBy === undefined ? 'score' : input.sortBy;
  const sortDirection = input.sortDirection === undefined ? 'DESC' : input.sortDirection;
  if (typeof sortBy !== 'string' || !SORT_FIELDS.includes(sortBy as MatchingSortBy)) {
    throw new ApiError('VALIDATION_ERROR', 'sortBy doit être score, skills, location ou availability.');
  }
  if (sortDirection !== 'ASC' && sortDirection !== 'DESC') {
    throw new ApiError('VALIDATION_ERROR', 'sortDirection doit être ASC ou DESC.');
  }
  return { sortBy: sortBy as MatchingSortBy, sortDirection };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeSkill(skill: string): string {
  return skill.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

const ZONE_LEVELS = [
  ['localityId', 'LOCALITY', 30],
  ['arrondissementId', 'ARRONDISSEMENT', 25],
  ['municipalityId', 'MUNICIPALITY', 20],
  ['departmentId', 'DEPARTMENT', 10],
] as const;

function scoreLocation(offer: OfferRecord, candidate: CandidateMatchingProfileRecord): MatchingScoreBreakdown['location'] {
  const used = Boolean(offer.localityId || offer.arrondissementId || offer.municipalityId || offer.departmentId);
  if (!used) return { points: 0, maximum: 0, match: 'NOT_SCORED', used: false };
  for (const [field, match, points] of ZONE_LEVELS) {
    if (offer[field] && candidate[field] && offer[field] === candidate[field]) {
      return { points, maximum: 30, match, used: true };
    }
  }
  return { points: 0, maximum: 30, match: 'NONE', used: true };
}

function scoreCandidate(offer: OfferRecord, candidate: CandidateMatchingCandidate): MatchingResultSnapshot {
  const requiredSkills = [...new Set((offer.skills ?? []).map(normalizeSkill).filter(Boolean))].sort();
  const candidateSkillMap = new Map(candidate.skills.map(skill => [normalizeSkill(skill), skill]));
  const matchedKeys = requiredSkills.filter(skill => candidateSkillMap.has(skill));
  const matchedSkills = matchedKeys.map(key => candidateSkillMap.get(key)!).sort((left, right) => compareText(normalizeSkill(left), normalizeSkill(right)));
  const skillsUsed = requiredSkills.length > 0;
  const skillsMaximum = skillsUsed ? 60 : 0;
  const skillsPoints = skillsUsed ? Math.round(skillsMaximum * matchedKeys.length / requiredSkills.length) : 0;
  const location = scoreLocation(offer, candidate);
  const availabilityPoints = candidate.availability === 'AVAILABLE' ? 10
    : candidate.availability === 'LIMITED' ? 5
      : 0;
  const breakdown: MatchingScoreBreakdown = {
    skills: { points: skillsPoints, maximum: skillsMaximum, matchedSkills, used: skillsUsed },
    location,
    availability: { points: availabilityPoints, maximum: 10, declared: candidate.availability, used: true },
  };
  const scoreMaximum = skillsMaximum + location.maximum + 10;
  return {
    candidateId: candidate.candidateId,
    displayName: candidate.displayName,
    position: 0,
    score: skillsPoints + location.points + availabilityPoints,
    scoreMaximum,
    breakdown,
  };
}

function comparisonValue(result: MatchingResultSnapshot, sortBy: MatchingSortBy): number {
  switch (sortBy) {
    case 'score': return result.score;
    case 'skills': return result.breakdown.skills.points;
    case 'location': return result.breakdown.location.points;
    case 'availability': return result.breakdown.availability.points;
  }
}

export function buildMatchingCriteria(offer: OfferRecord): MatchingCriteriaSnapshot {
  return {
    version: RANKING_RULES_VERSION,
    factors: [
      { code: 'SKILLS_OVERLAP', weight: 60, source: 'offer.skills + self-declared candidate skills', used: (offer.skills ?? []).length > 0 },
      { code: 'ADMINISTRATIVE_ZONE', weight: 30, source: 'offer/candidate administrative area identifiers', used: Boolean(offer.departmentId || offer.municipalityId || offer.arrondissementId || offer.localityId) },
      { code: 'DECLARED_AVAILABILITY', weight: 10, source: 'candidate self-declaration', used: true },
    ],
    tieBreak: 'candidateId_ASC',
    clientMakesFinalChoice: true,
    automaticAssignment: false,
  };
}

/**
 * Ranks a bounded set of active candidate profiles. `UNAVAILABLE` is an
 * explicit candidate declaration and is not suggested; no application,
 * selection, acceptance, rejection or replacement state is changed here.
 */
export function rankMatchingCandidates(
  offer: OfferRecord,
  candidates: readonly CandidateMatchingCandidate[],
  sorting: MatchingSortInput,
): { criteria: MatchingCriteriaSnapshot; results: MatchingResultSnapshot[] } {
  const criteria = buildMatchingCriteria(offer);
  const results = candidates
    .filter(candidate => candidate.availability !== 'UNAVAILABLE')
    .map(candidate => scoreCandidate(offer, candidate))
    .sort((left, right) => {
      const scoreOrder = comparisonValue(left, sorting.sortBy) - comparisonValue(right, sorting.sortBy);
      if (scoreOrder !== 0) return sorting.sortDirection === 'DESC' ? -scoreOrder : scoreOrder;
      // Stable, direction-independent tie break prevents request ordering from
      // changing equal scores or exposing a hidden secondary criterion.
      return compareText(left.candidateId, right.candidateId);
    })
    .map((result, index) => ({ ...result, position: index + 1 }));
  return { criteria, results };
}
