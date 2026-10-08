/**
 * Statut d'intégration des 120 unités de production (P0-DESIGN-FOUNDATION).
 *
 * Par défaut, toute unité est NON_INTEGRE. Ajouter ici l'identifiant d'une unité
 * (ex. « EMP-01 ») uniquement lorsque son écran de production est réellement livré,
 * testé et branché sur le shell de sa famille.
 */

import { PRODUCTION_UNITS, TOTAL_UNITS, UNIT_COUNTS_BY_FAMILY, type ProductionUnit } from '../design-system/generated/productionUnits';

export type IntegrationStatus = 'NON_INTEGRE' | 'INTEGRE';

/** Unités intégrées. Vide dans la fondation : aucun écran métier n'est livré par cette mission. */
export const INTEGRATED_UNIT_IDS: readonly string[] = [];

export function integrationStatus(unitId: string): IntegrationStatus {
  return INTEGRATED_UNIT_IDS.includes(unitId) ? 'INTEGRE' : 'NON_INTEGRE';
}

export function integrationSummary(): { integrees: number; total: number; parFamille: Record<string, number> } {
  const integrees = PRODUCTION_UNITS.filter((unit: ProductionUnit) => integrationStatus(unit.id) === 'INTEGRE').length;
  return { integrees, total: TOTAL_UNITS, parFamille: { ...UNIT_COUNTS_BY_FAMILY } };
}
