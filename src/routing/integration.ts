/**
 * Statut d'intégration des 120 unités de production.
 *
 * P2-DESIGN-EMPLOYER : les 32 unités EMP sont livrées (écran réel, routes du
 * routeur P0, API existantes) et portent chacune au moins une capacité absente
 * déclarée (`src/employer/gaps.ts`) → statut PARTIEL, jamais INTEGRE tant qu'une
 * donnée de la fiche reste indisponible. Aucune unité PRE/ADM/FIN n'est touchée.
 */

import { PRODUCTION_UNITS, TOTAL_UNITS, UNIT_COUNTS_BY_FAMILY, type ProductionUnit } from '../design-system/generated/productionUnits';
import { EMPLOYER_DESIGN_UNITS } from '../employer/catalog';
import { EMPLOYER_UNIT_GAPS } from '../employer/gaps';

export type IntegrationStatus = 'NON_INTEGRE' | 'PARTIEL' | 'INTEGRE';

/** Unités intégrées : vide — aucun écran n'est intégralement couvert par le backend. */
export const INTEGRATED_UNIT_IDS: readonly string[] = [];

/** Unités PUB/SYS livrées en P1 avec capacités déclarées absentes. */
const PARTIAL_PUBLIC_AND_SYSTEM: readonly string[] = PRODUCTION_UNITS.filter((unit) => unit.family === 'PUB' || unit.family === 'SYS').map(
  (unit) => unit.id,
);

/**
 * Unités EMP livrées par P2-DESIGN-EMPLOYER. Une unité est PARTIEL dès qu'une
 * de ses fiches déclare une capacité backend absente — c'est le cas de toutes
 * les unités livrées ici, et le rester est une information honnête, pas un défaut.
 */
export const EMPLOYER_UNIT_IDS: readonly string[] = EMPLOYER_DESIGN_UNITS.map((unit) => unit.id);

export const PARTIAL_UNIT_IDS: readonly string[] = [
  ...PARTIAL_PUBLIC_AND_SYSTEM,
  ...EMPLOYER_UNIT_IDS.filter((unitId) =>
    (EMPLOYER_DESIGN_UNITS.find((unit) => unit.id === unitId)?.screenCodes ?? []).some(
      (screenCode) => (EMPLOYER_UNIT_GAPS[screenCode] ?? []).length > 0,
    ),
  ),
];

export function isEmployerUnit(unitId: string | null): boolean {
  return unitId !== null && EMPLOYER_UNIT_IDS.includes(unitId);
}

export function integrationStatus(unitId: string): IntegrationStatus {
  return INTEGRATED_UNIT_IDS.includes(unitId) ? 'INTEGRE' : PARTIAL_UNIT_IDS.includes(unitId) ? 'PARTIEL' : 'NON_INTEGRE';
}

export function integrationSummary(): { integrees: number; total: number; parFamille: Record<string, number> } {
  const integrees = PRODUCTION_UNITS.filter((unit: ProductionUnit) => integrationStatus(unit.id) === 'INTEGRE').length;
  return { integrees, total: TOTAL_UNITS, parFamille: { ...UNIT_COUNTS_BY_FAMILY } };
}
