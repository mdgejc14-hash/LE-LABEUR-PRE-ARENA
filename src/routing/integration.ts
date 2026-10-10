/**
 * Statut d'intégration des 120 unités de production.
 *
 * P2-DESIGN-EMPLOYER : les 32 unités EMP sont livrées (écran réel, routes du
 * routeur P0, API existantes) et portent chacune au moins une capacité absente
 * déclarée (`src/employer/gaps.ts`) → statut PARTIEL, jamais INTEGRE tant qu'une
 * donnée de la fiche reste indisponible.
 *
 * P3-DESIGN-PRESTATAIRE : les 26 unités PRE sont livrées (écran réel, routes du
 * routeur P0, API existantes) et portent chacune au moins une capacité absente
 * déclarée (`src/prestataire/gaps.ts`) → statut PARTIEL. Aucune unité ADM/FIN/RTC
 * n'est touchée par cette sous-tranche.
 *
 * P4A-DESIGN-ADMIN-CORE : les 7 unités ADM de la première tranche de
 * supervision (ADM-01, ADM-02, ADM-04, ADM-06, ADM-08, ADM-10, ADM-11 — 12
 * fiches) sont livrées (écran réel, routes du routeur P0, API existantes) et
 * portent chacune au moins une capacité absente déclarée
 * (`src/admin/gaps.ts`) → statut PARTIEL.
 *
 * P4B-1-DESIGN-ADMIN-CONTRACTS : les 3 unités ADM de la supervision des
 * contrats (ADM-13 registre ; ADM-14 fiche — incidents — journal ; ADM-16
 * révision forcée — 5 fiches, ADM-13 → ADM-17) sont livrées dans les mêmes
 * conditions (écran réel, routes du routeur P0, API existantes uniquement :
 * admin.contracts.list et admin.claims.list) et portent chacune au moins une
 * capacité absente déclarée → statut PARTIEL.
 *
 * P4B-2-DESIGN-ADMIN-PAYMENTS : ADM-18 (vue globale + rapprochement) et ADM-20
 * (anomalies + déclarations + incidents — 5 fiches ADM-18 → ADM-22) sont
 * livrées sur les routes du routeur P0 et les API de paiement/rapprochement
 * existantes ; leurs lacunes sont déclarées → statut PARTIEL.
 *
 * P4C-DESIGN-ADMIN-SALARY-PROOFS : ADM-23 (confirmations de Salaire + preuve
 * de réception — 2 fiches ADM-23 → ADM-24) est livrée sur les routes du
 * routeur P0 et les lectures de paiement existantes (admin.payments.list,
 * payments.read) ; la confirmation OTP reste réservée au Candidat et toutes
 * les capacités de confirmation/preuve non exposées sont déclarées
 * BACKEND_GAP → statut PARTIEL.
 *
 * P4D-DESIGN-ADMIN-CLAIMS : trois unités ADM-26 (file), ADM-27 (fiche +
 * justificatifs) et ADM-29 (décision + historique — 5 fiches ADM-26 → ADM-30)
 * utilisent uniquement les routes admin.claims.* existantes ; les lacunes
 * de file, contenu probatoire et audit restent BACKEND_GAP → statut PARTIEL.
 *
 * P4E-1-DESIGN-ADMIN-REPLACEMENTS : unité ADM-31 (file, suivi détaillé et
 * arbitrage — 3 fiches ADM-31 → ADM-33) en lecture seule des routes
 * admin.replacements.list/read existantes ; les commandes assign/transfer/
 * finalize (sans handler), les statistiques, l'intervention et l'arbitrage
 * restent BACKEND_GAP → statut PARTIEL.
 *
 * P4E-2-DESIGN-ADMIN-REPUTATION : unités ADM-34 (ledger & audit — ADM-34/36)
 * et ADM-35 (recours) ; lectures admin.reputation.entries.* et commandes
 * correct/reconcile existantes ; contestations et intégrité de chaîne
 * restent BACKEND_GAP → statut PARTIEL.
 *
 * P4F-DESIGN-ADMIN-DOCUMENTS : ADM-37 (registre R2 & audit — ADM-37/40) et
 * ADM-38 (vérification & quarantaine — ADM-38/39) sont livrées sur
 * admin.documents.list / read, les révocations ADMIN existantes et le contrôle
 * d'intégrité technique ; la décision de vérification, la quarantaine, le
 * journal d'accès, les politiques et la purge sont BACKEND_GAP → statut PARTIEL.
 *
 * Les autres unités ADM (notifications, ops, sécurité
 * avancée, infra), FIN et RTC restent non intégrées.
 */

import { PRODUCTION_UNITS, TOTAL_UNITS, UNIT_COUNTS_BY_FAMILY, type ProductionUnit } from '../design-system/generated/productionUnits';
import { EMPLOYER_DESIGN_UNITS } from '../employer/catalog';
import { EMPLOYER_UNIT_GAPS } from '../employer/gaps';
import { PRESTATAIRE_DESIGN_UNITS } from '../prestataire/catalog';
import { PRESTATAIRE_UNIT_GAPS } from '../prestataire/gaps';
import { ADMIN_DESIGN_UNITS } from '../admin/catalog';
import { ADMIN_UNIT_GAPS } from '../admin/gaps';

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

/**
 * Unités PRE livrées par P3-DESIGN-PRESTATAIRE (26 unités, 52 fiches). Même
 * règle : PARTIEL dès qu'une fiche déclare une capacité absente.
 */
export const PRESTATAIRE_UNIT_IDS: readonly string[] = PRESTATAIRE_DESIGN_UNITS.map((unit) => unit.id);

/**
 * Unités ADM livrées par P4A-DESIGN-ADMIN-CORE, P4B-1-DESIGN-ADMIN-CONTRACTS,
 * P4B-2-DESIGN-ADMIN-PAYMENTS, P4C-DESIGN-ADMIN-SALARY-PROOFS,
 * P4D-DESIGN-ADMIN-CLAIMS, P4E-1-DESIGN-ADMIN-REPLACEMENTS et
 * P4E-2-DESIGN-ADMIN-REPUTATION et P4F-DESIGN-ADMIN-DOCUMENTS (21 unités,
 * 39 fiches, dérivées du catalogue généré). Même règle : PARTIEL dès qu'une
 * fiche déclare une capacité absente.
 */
export const ADMIN_UNIT_IDS: readonly string[] = ADMIN_DESIGN_UNITS.map((unit) => unit.id);

export const PARTIAL_UNIT_IDS: readonly string[] = [
  ...PARTIAL_PUBLIC_AND_SYSTEM,
  ...EMPLOYER_UNIT_IDS.filter((unitId) =>
    (EMPLOYER_DESIGN_UNITS.find((unit) => unit.id === unitId)?.screenCodes ?? []).some(
      (screenCode) => (EMPLOYER_UNIT_GAPS[screenCode] ?? []).length > 0,
    ),
  ),
  ...PRESTATAIRE_UNIT_IDS.filter((unitId) =>
    (PRESTATAIRE_DESIGN_UNITS.find((unit) => unit.id === unitId)?.screenCodes ?? []).some(
      (screenCode) => (PRESTATAIRE_UNIT_GAPS[screenCode] ?? []).length > 0,
    ),
  ),
  ...ADMIN_UNIT_IDS.filter((unitId) =>
    (ADMIN_DESIGN_UNITS.find((unit) => unit.id === unitId)?.screenCodes ?? []).some(
      (screenCode) => (ADMIN_UNIT_GAPS[screenCode] ?? []).length > 0,
    ),
  ),
];

export function isEmployerUnit(unitId: string | null): boolean {
  return unitId !== null && EMPLOYER_UNIT_IDS.includes(unitId);
}

export function isPrestataireUnit(unitId: string | null): boolean {
  return unitId !== null && PRESTATAIRE_UNIT_IDS.includes(unitId);
}

export function isAdminUnit(unitId: string | null): boolean {
  return unitId !== null && ADMIN_UNIT_IDS.includes(unitId);
}

export function integrationStatus(unitId: string): IntegrationStatus {
  return INTEGRATED_UNIT_IDS.includes(unitId) ? 'INTEGRE' : PARTIAL_UNIT_IDS.includes(unitId) ? 'PARTIEL' : 'NON_INTEGRE';
}

export function integrationSummary(): { integrees: number; total: number; parFamille: Record<string, number> } {
  const integrees = PRODUCTION_UNITS.filter((unit: ProductionUnit) => integrationStatus(unit.id) === 'INTEGRE').length;
  return { integrees, total: TOTAL_UNITS, parFamille: { ...UNIT_COUNTS_BY_FAMILY } };
}
