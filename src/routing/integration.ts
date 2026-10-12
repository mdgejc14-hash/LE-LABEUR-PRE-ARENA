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
 * P4F-2-DESIGN-ADMIN-NOTIFICATIONS : ADM-41 (orchestration, gabarits &
 * délivrabilité — ADM-41/42/43) est livrée sur la seule lecture ADMIN réelle
 * admin.notifications.list (notifications:read:any) ; les agrégats, gabarits,
 * fournisseurs, métriques, test d'envoi et bascule restent BACKEND_GAP →
 * statut PARTIEL.
 *
 * P4G-5A-DESIGN-ADMIN-SECURITY-CONTROLS : ADM-52 (rejeux et signatures,
 * limitation de débit et webhooks — 3 fiches ADM-52 → ADM-54 dans l’unité
 * exacte « ADM — sécurité (replay, signatures, rate limits & webhooks) ») est
 * diagnostique : aucune route `/api/v1/admin/security/*` ni permission de
 * sécurité n’existe ; les protections serveur réelles (classification
 * forensique, limiteur de débit, vérification de signature du webhook de
 * paiement) ne sont ni appelées ni converties en mesure → statut PARTIEL.
 *
 * P4G-5B-DESIGN-ADMIN-SECURITY-INCIDENTS-AUDIT : ADM-55 (incidents et
 * procédures, journal d’audit — 2 fiches ADM-55/56 dans l’unité exacte
 * « ADM — sécurité (incidents & audit) ») est diagnostique : les deux contrats
 * existants (admin.audit.list avec audit:read, admin.incidents.list avec
 * incidents:read:any) répondent une frontière de contrôle à items vides et ne
 * conviennent ni à un journal d’audit ni à un registre d’incidents de
 * sécurité ; le ledger d’audit réel n’a aucune route ADMIN et aucune empreinte
 * de chaînage. Aucune donnée n’est appelée ni convertie en mesure → statut
 * PARTIEL.
 *
 * P4G-6-DESIGN-ADMIN-DATA-INFRASTRUCTURE : ADM-59 (base de données et
 * regroupement de connexions, stockage objet — 2 fiches ADM-59/60 dans
 * l’unité exacte « ADM — infra (données : PostgreSQL & stockage objet) ») est
 * diagnostique : aucune des huit références de design des deux fiches n’est
 * déclarée ni servie (404 sur le worker composé), aucune permission ADMIN de
 * base de données ou de stockage n’existe, et le rapport public /healthz ne
 * fournit aucune des mesures des fiches. Aucune donnée n’est appelée ni
 * convertie en mesure → statut PARTIEL.
 *
 * P4G-7-DESIGN-ADMIN-MEDIA-OBSERVABILITY-STATUS : ADM-61 (WebRTC & TURN),
 * ADM-62 (observabilité) et ADM-63 (statut global & page publique) — une fiche
 * par unité de production selon « ADM — infra (webrtc/turn) », « ADM — infra
 * (observabilité) » et « ADM — infra (statut) » de `units.py`. Les onze
 * références de design des trois fiches ne sont déclarées dans aucun contrat
 * ni servies par un handler (404 sur le worker composé avec une session ADMIN
 * réelle) ; les sessions média réelles sont réservées aux participants (403
 * pour un ADMIN), admin.calls.list reste sans handler (501) et la frontière de
 * contrôle admin.stats.read répond {metrics: {}}. Aucune donnée n’est appelée
 * ni convertie en mesure → statut PARTIEL.
 *
 * Les 33 unités ADM du catalogue livré (62 fiches) sont couvertes. L’unité
 * ADM-25 « ADM — salaire (litiges) » est déclarée par le routeur P0 mais reste
 * hors catalogue — aucune tranche ne la livre, donc NON_INTEGRE — et FIN comme
 * RTC restent non intégrées.
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
 * P4D-DESIGN-ADMIN-CLAIMS, P4E-1-DESIGN-ADMIN-REPLACEMENTS,
 * P4E-2-DESIGN-ADMIN-REPUTATION, P4F-DESIGN-ADMIN-DOCUMENTS,
 * P4F-2-DESIGN-ADMIN-NOTIFICATIONS, P4G-1-DESIGN-ADMIN-OPERATIONS et
 * P4G-2-DESIGN-ADMIN-SUPERVISION, P4G-3-DESIGN-ADMIN-SECURITY,
 * P4G-4-DESIGN-ADMIN-INFRASTRUCTURE, P4G-5A-DESIGN-ADMIN-SECURITY-CONTROLS,
 * P4G-5B-DESIGN-ADMIN-SECURITY-INCIDENTS-AUDIT,
 * P4G-6-DESIGN-ADMIN-DATA-INFRASTRUCTURE et
 * P4G-7-DESIGN-ADMIN-MEDIA-OBSERVABILITY-STATUS
 * (33 unités, 62 fiches, dérivées du catalogue généré). P4G-2 rend ADM-47/48/49
 * diagnostiques : les capacités SLO, dead-letter et incidents d’exploitation
 * sont absentes du backend.
 * P4G-3 rend ADM-50/51 diagnostiques : aucune API ADMIN de détection IDOR.
 * P4G-4 rend ADM-57/58 diagnostiques : aucune API ADMIN de topologie, métriques
 * Edge, déploiements ou actions n’est installée. P4G-5A rend ADM-52/53/54
 * diagnostiques : aucune API ADMIN de rejeu, de limitation de débit ni de
 * webhook n’est installée. P4G-5B rend ADM-55/56 diagnostiques : les contrats
 * admin.audit.list et admin.incidents.list sont des frontières de contrôle à
 * items vides, et le ledger d’audit réel n’est exposé par aucune route ADMIN.
 * P4G-6 rend ADM-59/60 diagnostiques : aucune route ADMIN de supervision de
 * PostgreSQL/Hyperdrive ni du stockage objet n’est installée, et le rapport
 * public /healthz ne remplace ni les mesures ni les états des fiches.
 * P4G-7 rend ADM-61/62/63 diagnostiques : aucune API ADMIN de média, de
 * qualité d’appel, d’observabilité ni de statut public n’est installée ; les
 * sessions média réelles sont réservées aux participants et le rapport public
 * /healthz n’est pas une page de statut. Même règle : PARTIEL dès qu'une fiche
 * déclare une capacité absente.
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
