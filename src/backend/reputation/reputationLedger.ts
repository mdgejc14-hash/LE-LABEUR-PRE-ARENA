/**
 * LE LABEUR — P0-REPUTATION — dérivation PURE : du FAIT à l'ENTRÉE, des ENTRÉES
 * à la VUE.
 *
 * Deux fonctions, deux responsabilités, aucun accès base :
 *  - `buildReputationEntries` : applique le catalogue de règles à un fait
 *    documenté et à ses sujets. Déterministe : mêmes faits ⇒ mêmes entrées.
 *  - `computeReputationView` : calcule le score DÉRIVÉ à partir des entrées
 *    persistées, en utilisant l'impact STOCKÉ (jamais recalculé depuis une règle
 *    courante) : l'histoire ne se réinterprète pas.
 *
 * Le score n'est ni prédictif, ni opaque, ni un classement social : c'est une
 * somme entière, recalculable, versionnée, exposée avec son explication.
 */

import {
  REPUTATION_MAX_ABSOLUTE_IMPACT,
  REPUTATION_RULES_VERSION,
  REPUTATION_SCORE_VERSION,
  assertNoProtectedAttributeFields,
  findReputationRule,
  reputationDirectionFromImpact,
  type ReputationCategory,
  type ReputationDirection,
  type ReputationFact,
  type ReputationProvenance,
  type ReputationParty,
} from '../../domain/reputationRules';
import type { ReputationEntryDraft, ReputationEntryRecord } from './records';

/** Sujet d'un fait : un identifiant de compte et son rôle DOCUMENTÉ. */
export interface ReputationFactSubject {
  readonly userId: string;
  readonly party: ReputationParty;
}

export interface BuildReputationEntriesInput {
  readonly fact: ReputationFact;
  readonly subjects: readonly ReputationFactSubject[];
  readonly provenance: ReputationProvenance;
  /** Date d'écriture (le fait porte sa propre date d'occurrence). */
  readonly createdAt: string;
  /**
   * Restreint la construction à UN sujet : une réconciliation déclenchée par (ou
   * pour) un utilisateur n'écrit jamais dans le ledger d'un autre, même quand le
   * fait documenté concerne les deux parties.
   */
  readonly onlySubjectUserId?: string;
}

/**
 * Clé d'unicité d'un fait logique : règle + entité source + sujet. Un rejeu —
 * événement rejoué, réconciliation relancée, deux workers concurrents — produit
 * donc toujours la MÊME clé, et une seule ligne.
 */
export function reputationDedupeKey(input: {
  ruleCode: string;
  sourceEntityType: string;
  sourceEntityId: string;
  subjectUserId: string;
}): string {
  return `${input.ruleCode}:${input.sourceEntityType}:${input.sourceEntityId}:${input.subjectUserId}`;
}

/**
 * Construit les brouillons d'entrées d'un fait documenté. Un sujet sans règle
 * déclarée ne produit RIEN (jamais une entrée « par défaut »), et un impact hors
 * bornes est refusé plutôt que tronqué silencieusement.
 */
export function buildReputationEntries(input: BuildReputationEntriesInput): ReputationEntryDraft[] {
  const { fact, subjects, provenance, createdAt, onlySubjectUserId } = input;
  const drafts: ReputationEntryDraft[] = [];
  const seen = new Set<string>();

  for (const subject of subjects) {
    if (onlySubjectUserId && subject.userId !== onlySubjectUserId) continue;
    const rule = findReputationRule(fact.factType, subject.party);
    if (!rule) continue;
    assertNoProtectedAttributeFields(rule as unknown as Record<string, unknown>);
    if (!Number.isSafeInteger(rule.impact) || Math.abs(rule.impact) > REPUTATION_MAX_ABSOLUTE_IMPACT) {
      throw new Error(`Impact de règle hors bornes : ${rule.code}`);
    }
    const dedupeKey = reputationDedupeKey({
      ruleCode: rule.code,
      sourceEntityType: fact.sourceEntityType,
      sourceEntityId: fact.sourceEntityId,
      subjectUserId: subject.userId,
    });
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    drafts.push({
      reputationId: draftId(dedupeKey),
      subjectUserId: subject.userId,
      sourceEvent: fact.factType,
      ...(fact.sourceEventId ? { sourceEventId: fact.sourceEventId } : {}),
      sourceEntityType: fact.sourceEntityType,
      sourceEntityId: fact.sourceEntityId,
      ruleCode: rule.code,
      ruleVersion: rule.ruleVersion,
      category: rule.category,
      direction: reputationDirectionFromImpact(rule.impact),
      impact: rule.impact,
      explanation: rule.explanation,
      actorId: fact.actorId,
      provenance,
      occurredAt: fact.occurredAt,
      createdAt,
      dedupeKey,
    });
  }

  return drafts;
}

/**
 * Identifiant d'entrée dérivé du fait : un rejeu construit le même identifiant,
 * ce qui rend la collision de clé primaire IMPOSSIBLE à distinguer d'un doublon
 * logique — l'insertion idempotente ne peut donc jamais produire deux lignes.
 */
export function draftId(dedupeKey: string): string {
  // Double empreinte 32 bits (FNV-1a + polynomiale) : déterministe, sans horloge
  // ni aléa, et l'identifiant reste dérivé du FAIT (aucune collision pratique).
  let fnv = 0x811c9dc5;
  let polynomial = 0x9e3779b9;
  for (let index = 0; index < dedupeKey.length; index += 1) {
    const code = dedupeKey.charCodeAt(index);
    fnv ^= code;
    fnv = Math.imul(fnv, 0x01000193) >>> 0;
    polynomial = (Math.imul(polynomial ^ code, 0x85ebca6b) + index) >>> 0;
  }
  return `rpt_${fnv.toString(36)}${polynomial.toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* Vue dérivée                                                          */
/* ------------------------------------------------------------------ */

export interface ReputationViewInput {
  readonly subjectUserId: string;
  readonly entries: readonly ReputationEntryRecord[];
  readonly computedAt: string;
  readonly window?: { from?: string; to?: string };
}

export interface ReputationCategoryImpact {
  category: ReputationCategory;
  entryCount: number;
  impact: number;
}

/**
 * Vue dérivée. Elle n'ajoute AUCUNE donnée : elle agrège les entrées ACTIVE qui
 * lui sont fournies, avec :
 *  - l'impact net, la somme des impacts positifs et négatifs, et les compteurs ;
 *  - la répartition par catégorie ;
 *  - l'explication textuelle de la dérivation ;
 *  - les versions (règles + vue) réellement observées sur les entrées.
 *
 * Les entrées RÉVOQUÉES restent dans le ledger mais sont exclues du score : la
 * correction change la vue, jamais l'histoire.
 */
export function computeReputationView(input: ReputationViewInput) {
  const active = input.entries.filter(entry => entry.status === 'ACTIVE');
  const reversed = input.entries.filter(entry => entry.status !== 'ACTIVE');

  let positiveImpact = 0;
  let negativeImpact = 0;
  let neutralImpact = 0;
  const byCategory = new Map<ReputationCategory, { entryCount: number; impact: number }>();

  for (const entry of active) {
    if (entry.impact > 0) positiveImpact += entry.impact;
    else if (entry.impact < 0) negativeImpact += entry.impact;
    else neutralImpact += entry.impact;
    const current = byCategory.get(entry.category) ?? { entryCount: 0, impact: 0 };
    byCategory.set(entry.category, { entryCount: current.entryCount + 1, impact: current.impact + entry.impact });
  }

  const categories: ReputationCategoryImpact[] = [...byCategory.entries()]
    .map(([category, value]) => ({ category, entryCount: value.entryCount, impact: value.impact }))
    .sort((left, right) => left.category.localeCompare(right.category));

  const ruleVersions = [...new Set(input.entries.map(entry => entry.ruleVersion))].sort();
  const directions: Record<ReputationDirection, number> = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
  for (const entry of active) directions[entry.direction] += 1;

  const netImpact = positiveImpact + negativeImpact + neutralImpact;

  return {
    subjectUserId: input.subjectUserId,
    /** Le ledger est la source de vérité ; cette vue n'est qu'une dérivation. */
    sourceOfTruth: 'LEDGER' as const,
    /** La réputation n'est jamais une décision juridique ni une sanction automatique. */
    automaticSanction: false as const,
    scoreVersion: REPUTATION_SCORE_VERSION,
    rulesVersion: REPUTATION_RULES_VERSION,
    ruleVersions,
    computedAt: input.computedAt,
    ...(input.window ? { window: input.window } : {}),
    derived: {
      netImpact,
      positiveImpact,
      negativeImpact,
      neutralImpact,
      activeEntryCount: active.length,
      reversedEntryCount: reversed.length,
      directions,
      categories,
    },
    explanation: [
      `Score dérivé de ${active.length} entrée(s) active(s) du ledger de réputation.`,
      'Impact net = somme des impacts documentés des entrées actives ; les entrées révoquées en sont exclues.',
      'Chaque impact provient d’une règle versionnée appliquée à un fait documenté, jamais d’un modèle prédictif.',
      'Cette vue n’est ni une décision juridique, ni une sanction, ni un classement social.',
    ],
  };
}

export type ReputationView = ReturnType<typeof computeReputationView>;

/** Direction attendue par le domaine (exposée pour les tests de cohérence). */
export function expectedDirection(impact: number): ReputationDirection {
  return reputationDirectionFromImpact(impact);
}
