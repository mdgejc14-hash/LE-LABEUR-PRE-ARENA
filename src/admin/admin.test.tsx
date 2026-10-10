/**
 * P4A-DESIGN-ADMIN-CORE + P4B-1-DESIGN-ADMIN-CONTRACTS +
 * P4B-2-DESIGN-ADMIN-PAYMENTS + P4C-DESIGN-ADMIN-SALARY-PROOFS + P4D-DESIGN-ADMIN-CLAIMS +
 * P4E-1-DESIGN-ADMIN-REPLACEMENTS — tests de l'espace supervision livré.
 *
 * Couverture :
 *  1. parité du catalogue généré avec la source de design (Python) ;
 *  2. résolution de route : chaque fiche ADM des tranches est atteignable et
 *     rattachée à son unité (regroupement `units.py`, pas une plage numérique) ;
 *  3. registre complet (17 unités / 32 fiches), selon les regroupements canoniques exacts ;
 *  4. API : chaque chemin appelé existe déjà dans `routeContracts.ts` ;
 *  5. GARDE-FOU DE VOCABULAIRE : aucun libellé métier du Master Design
 *     (Mission, Client, Prestataire, Litige) ne peut entrer dans l'interface,
 *     y compris dans les lignes BACKEND_GAP réellement affichées ;
 *  6. DÉCISION FINANCE : aucun libellé du triplet financier interdit ;
 *  7. états d'interface réels (chargement, indisponible, gap, vide) et
 *     attributs d'inspection (`data-unit`, `data-screen`, `data-zone`,
 *     `data-backend-gap`) ;
 *  8. décisions de qualification : parité exacte avec le code serveur
 *     (QUALIFICATION_DECISIONS) et options de revue réelles ;
 *  9. garde de session : seul un compte ADMIN actif ouvre l'espace ;
 * 10. intégration : unités ADMIN livrées = PARTIEL, EMP/PRE/PUB/SYS inchangés,
 *     ADM-26 → ADM-30 Claims, ADM-31 → ADM-33 Remplacements seulement,
 *     autres ADM/FIN/RTC non intégrées ;
 * 11. responsive, accessibilité (table sémantique) et reduced-motion (CSS) ;
 * 12. P4B-1 contrats : routes ADM réelles du registre et des Claims, statuts
 *     et types de Claim en parité exacte avec le serveur, segments du registre
 *     en statuts réels uniquement, aucune donnée simulée, capacités absentes
 *     vérifiées contre le catalogue de routes (aucune route ADMIN individuelle
 *     de contrat n'existe : la fiche est composée depuis la page réelle) ;
 * 13. P4B-2 paiements : états/natures serveur exacts, séparation Salaire/frais,
 *     déclarations vs vérification vs PAID, permissions, rapprochement/revue,
 *     BACKEND_GAPs, idempotence, accessibilité et aucun calcul monétaire.
 * 14. P4C salaire : routes ADM-23/ADM-24 de l'unité exacte du Master,
 *     réservation serveur de la confirmation OTP (Employeur / Candidat),
 *     aucune route ADMIN de confirmation ni de preuve, distinction
 *     déclaration / vérification / PAID / confirmation du Candidat, aucun
 *     secret OTP ni donnée simulée dans les écrans.
 * 15. P4D Claims : parité exacte des 5 routes, unités Master, permissions,
 *     enums serveur, commande idempotente, seuls RESOLVE/REJECT, aucun champ
 *     probatoire opaque ni restriction hors scope dans l’interface.
 * 16. P4E-1 Remplacements : unité exacte du Master (ADM-31/32/33), routes et
 *     handlers ADMIN réels en lecture seule (list/read), parité des statuts
 *     de Remplacement et de Proposition avec le serveur, aucune commande
 *     assign/transfer/finalize/décision/Offre, Proposition envoyée ≠ acceptée,
 *     Contrat successeur DRAFT ≠ actif, aucun transfert ni total de Paiement,
 *     permissions par bloc, vocabulaire officiel et BACKEND_GAP explicites.
 */

import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { ADMIN_DESIGN_SCREENS, ADMIN_DESIGN_UNITS } from './catalog';
import { ADMIN_UNIT_GAPS } from './gaps';
import { adminGapsFor, resolveAdminScreen, unitForScreen } from './screenMap';
import { ADMIN_SCREEN_COMPONENTS, AdminScreen } from './registry';
import { replacementWorkflowSteps, REPLACEMENT_READ_PERMISSION } from './screens/replacements';
import { AdminRouteFallback } from './RouteFallback';
import { DataTable } from './components';
import { DOCK_DEFINITIONS } from '../design-system/shells/shellNavigation';
import { deliveredScreensForUnit } from './screenMap';
import { AdminApi, ADMIN_API_PATHS, REVIEW_DECISION_OPTIONS, type PaymentDeclarationRecord } from './api';
import {
  CLAIM_STATUS_LABELS,
  CLAIM_EVIDENCE_STATUS_LABELS,
  CLAIM_EVIDENCE_TYPE_LABELS,
  ADMIN_CLAIM_DECISION_OPTIONS,
  CLAIM_DECISION_LABELS,
  CLAIM_TYPE_LABELS,
  CONTRACT_REGISTRY_SEGMENTS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  DESIGN_ONLY_TERMS_NOT_RENDERED,
  PRODUCT_LABELS,
  QUALIFICATION_DECISION_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  PAYMENT_TYPE_LABELS,
  PAYMENT_DECLARATION_OUTCOME_LABELS,
  PAYMENT_RECONCILIATION_VERDICT_LABELS,
  PAYMENT_RECONCILIATION_BATCH_STATUS_LABELS,
  PAYMENT_RECONCILIATION_ITEM_STATUS_LABELS,
  PAYMENT_RECONCILIATION_REVIEW_DECISION_LABELS,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_TONES,
  REPLACEMENT_NEXT_STEP,
  REPLACEMENT_STATUS_LABELS,
  REPLACEMENT_STATUS_TONES,
  ADMIN_UI_TERMS,
  formatContractAmount,
  formatPaymentAmount,
  maskEmail,
} from './vocabulary';
import { CLAIM_EVIDENCE_STATUS_VALUES, CLAIM_EVIDENCE_TYPE_VALUES, CLAIM_STATUS_VALUES, CLAIM_TYPE_VALUES } from '../backend/disputes/records';
import { REPLACEMENT_STATUS_VALUES } from '../backend/replacements/records';
import { ADMIN_PERMISSIONS } from '../backend/identity/permissions';
import type { Contract, ReplacementDossier } from '../types';
import { adminError } from './errors';
import { adminGuard, type AdminSessionState } from './hooks';
import { API_ROUTE_CONTRACTS } from '../backend/api/routeContracts';
import { QUALIFICATION_DECISIONS } from '../backend/matching/records';
import { PAYMENT_LIFECYCLE_STATUS_VALUES, PAYMENT_TYPE_VALUES } from '../domain/paymentLifecycle';
import type {
  PaymentReconciliationBatchStatus,
  PaymentReconciliationItemStatus,
  PaymentReconciliationReviewDecision,
  PaymentReconciliationVerdict,
} from '../backend/persistence/paymentReconciliationRecords';
import { resolveRoute } from '../routing/resolveRoute';
import { ADMIN_UNIT_IDS, integrationStatus, isAdminUnit, PARTIAL_UNIT_IDS } from '../routing/integration';
import { PRODUCTION_UNITS } from '../design-system/generated/productionUnits';
import { ApiClientError } from '../repositories/apiClient';

const ADMIN_SCREEN_DIR = new URL('./screens/', import.meta.url);

/* ── Utilitaires d'inspection ── */

/** Chemin concret d'un motif de fiche (`:id` → valeur d'exemple). */
function samplePath(pattern: string): string {
  return pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? 'ref-1' : segment))
    .join('/');
}

/**
 * Termes du Master Design qui ne doivent JAMAIS désigner un concept produit dans
 * l'interface (la documentation et les chemins techniques restent autorisés).
 */
const FORBIDDEN_UI_TERMS = ['Mission', 'Missions', 'Client', 'Clients', 'Prestataire', 'Prestataires', 'Prestation', 'Litige', 'Litiges'];

/** Libellés financiers interdits par la décision FINANCE de cette tranche. */
const FORBIDDEN_FINANCE_LABELS = ['Prix Prestataire', 'Frais SaaS', 'Total Client', 'barème', 'Barème', 'séquestre', 'escrow'];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Retire chemins, URL, sélecteurs et identifiants techniques d'un texte :
 * chemins (`/admin/users/:id`), URL et identifiants SCREAMING_SNAKE du serveur
 * (`USER_BLOCKED`, `MISSION_QUALIFICATION_REVIEWED` — valeurs réelles du code,
 * jamais des libellés métier).
 */
function stripTechnicalTokens(text: string): string {
  return text
    .replace(/[A-Za-z0-9_@?&=%./:[\]{}#-]*\/[A-Za-z0-9_@?&=%./:[\]{}#-]*/g, ' ')
    .replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, ' ');
}

/**
 * Chaînes réellement affichables d'un fichier : le texte JSX (`>texte<`) et les
 * littéraux des propriétés d'affichage (title, lede, label, placeholder…).
 */
const DISPLAY_PROP_NAMES = ['title', 'lede', 'label', 'placeholder', 'aria-label', 'alt', 'empty', 'hint', 'description', 'summary', 'note', 'heading'];

function displayStringsIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/>([^<>{}]+)</g)) found.push(match[1]);
  const props = new RegExp(`(?:${DISPLAY_PROP_NAMES.join('|')})\\s*[:=]\\s*(['\"\`])([^'\"\`]{1,200})\\1`, 'g');
  for (const match of source.matchAll(props)) found.push(match[2]);
  return found;
}

function forbiddenTermsIn(text: string): string[] {
  const cleaned = stripTechnicalTokens(text);
  const found: string[] = [];
  for (const term of FORBIDDEN_UI_TERMS) {
    const pattern = new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, 'iu');
    if (pattern.test(cleaned)) found.push(term);
  }
  return found;
}

export async function runAdminTests(): Promise<{ name: string; success: boolean; detail?: string }[]> {
  const results: { name: string; success: boolean; detail?: string }[] = [];
  const check = (name: string, run: () => unknown) => {
    try {
      run();
      results.push({ name, success: true });
    } catch (error) {
      results.push({ name, success: false, detail: String(error) });
    }
  };
  const checkAsync = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
      results.push({ name, success: true });
    } catch (error) {
      results.push({ name, success: false, detail: String(error) });
    }
  };

  check('ADM — catalogue généré identique à la source de design (python --check)', () => {
    execFileSync('python3', ['scripts/design/generate-admin-catalog.py', '--check']);
  });

  check('ADM — 17 unités / 32 fiches, chaque fiche rattachée à une seule unité', () => {
    assert.equal(ADMIN_DESIGN_UNITS.length, 17);
    assert.equal(ADMIN_DESIGN_SCREENS.length, 32);
    const codes = ADMIN_DESIGN_SCREENS.map((screen) => screen.code);
    assert.equal(new Set(codes).size, 32);
    for (const screen of ADMIN_DESIGN_SCREENS) {
      const unit = unitForScreen(screen.code);
      assert.ok(unit, `fiche sans unité : ${screen.code}`);
      const parent = ADMIN_DESIGN_UNITS.find((candidate) => candidate.id === unit);
      assert.ok((parent?.screenCodes as readonly string[] | undefined)?.includes(screen.code), `fiche ${screen.code} absente des fiches de ${unit}`);
    }
    // Regroupement réel du Master (units.py) : pas une plage numérique. P4B-1
    // ajoute ADM-13 (registre, unité propre), ADM-14 = {fiche, incidents,
    // journal} (une seule unité de production) et ADM-16 (révision forcée,
    // unité propre) — exactement les regroupements de `design/llab/units.py`.
    // P4C ajoute ADM-23 = {confirmations, preuves OTP}, unité unique salaire.
    // P4D conserve les groupements du Master : ADM-27 = {fiche, pièces},
    // ADM-29 = {décision, historique}; ADM-26 reste une unité distincte.
    assert.deepEqual(ADMIN_DESIGN_UNITS.map((unit) => unit.id), ['ADM-01', 'ADM-02', 'ADM-04', 'ADM-06', 'ADM-08', 'ADM-10', 'ADM-11', 'ADM-13', 'ADM-14', 'ADM-16', 'ADM-18', 'ADM-20', 'ADM-23', 'ADM-26', 'ADM-27', 'ADM-29', 'ADM-31']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-02')?.screenCodes, ['ADM-02', 'ADM-03']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-04')?.screenCodes, ['ADM-04', 'ADM-05']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-06')?.screenCodes, ['ADM-06', 'ADM-07']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-08')?.screenCodes, ['ADM-08', 'ADM-09']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-10')?.screenCodes, ['ADM-10', 'ADM-12']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-13')?.screenCodes, ['ADM-13']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-14')?.screenCodes, ['ADM-14', 'ADM-15', 'ADM-17']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-16')?.screenCodes, ['ADM-16']);
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-14')?.canon, 'ADM — contrat (fiche, incidents & journal)');
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-13')?.canon, 'ADM — contrats (registre)');
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-16')?.canon, 'ADM — contrat (révision forcée)');
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-18')?.screenCodes, ['ADM-18', 'ADM-19']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-18')?.routes, ['/admin/paiements', '/admin/paiements/reconciliation']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-20')?.screenCodes, ['ADM-20', 'ADM-21', 'ADM-22']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-20')?.routes, [
      '/admin/paiements/anomalies',
      '/admin/paiements/declarations-externes',
      '/admin/paiements/incidents/:id',
    ]);
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-18')?.canon, 'ADM — paiements (vue globale & réconciliation)');
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-20')?.canon, 'ADM — paiements (anomalies, déclarations & incidents)');
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-23')?.screenCodes, ['ADM-23', 'ADM-24']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-23')?.routes, [
      '/admin/salaire/confirmations',
      '/admin/salaire/preuves/:id',
    ]);
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-23')?.canon, 'ADM — salaire (confirmations & preuves OTP)');
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-23')?.criticality, 'P0');
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-26')?.screenCodes, ['ADM-26']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-26')?.routes, ['/admin/litiges']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-27')?.screenCodes, ['ADM-27', 'ADM-28']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-27')?.routes, ['/admin/litiges/:id', '/admin/litiges/:id/pieces']);
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-27')?.canon, 'ADM — litige (fiche & pièces)');
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-29')?.screenCodes, ['ADM-29', 'ADM-30']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-29')?.routes, ['/admin/litiges/:id/decision', '/admin/litiges/decisions']);
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-29')?.canon, 'ADM — litige (décision)');
    // P4E-1 : unité exacte « ADM — remplacements (file & arbitrage) » de units.py.
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-31')?.screenCodes, ['ADM-31', 'ADM-32', 'ADM-33']);
    assert.deepEqual(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-31')?.routes, [
      '/admin/remplacements',
      '/admin/remplacements/:id',
      '/admin/remplacements/:id/arbitrage',
    ]);
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-31')?.canon, 'ADM — remplacements (file & arbitrage)');
  });

  check('ADM — chaque route de fiche est résolue par le routeur P0 vers son unité', () => {
    for (const screen of ADMIN_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell', `route non shell : ${path}`);
      if (resolved.kind !== 'shell') continue;
      assert.equal(resolved.notFound, false, `route non résolue : ${path}`);
      assert.equal(resolved.shell, 'ADMIN', `shell attendu ADMIN : ${path}`);
      assert.equal(resolved.unitId, unitForScreen(screen.code), `unité inattendue pour ${path}`);
    }
    const index = resolveRoute('/admin');
    assert.equal(index.kind === 'shell' && index.unitId, 'ADM-01', 'l’index /admin doit être le tableau de bord ADM-01');
  });

  check('ADM — registre complet : les 29 fiches livrées ont un écran, aucun code inconnu', () => {
    const registered = Object.keys(ADMIN_SCREEN_COMPONENTS).sort();
    const expected = ADMIN_DESIGN_SCREENS.map((screen) => screen.code).sort();
    assert.deepEqual(registered, expected);
  });

  check('ADM — chaque fiche déclare ses capacités absentes (BACKEND_GAP) et la résolution les renvoie', () => {
    for (const screen of ADMIN_DESIGN_SCREENS) {
      assert.ok((ADMIN_UNIT_GAPS[screen.code] ?? []).length > 0, `aucun BACKEND_GAP déclaré pour ${screen.code}`);
    }
    const gaps = adminGapsFor('ADM-10', '/admin/matching/rulesets');
    assert.ok(gaps.some((line) => line.includes('ADM-10')), 'les gaps de l’unité doivent être inclus');
    assert.ok(gaps.some((line) => line.includes('ADM-12')), 'les gaps de la fiche réellement atteinte doivent être inclus');
  });

  check('ADM — API : tout chemin appelé existe déjà dans routeContracts.ts (aucune route créée)', () => {
    const normalize = (path: string) => path.replace(/:[A-Za-z]+/g, ':param');
    const declared = new Set(API_ROUTE_CONTRACTS.map((route) => normalize(route.path)));
    assert.ok(ADMIN_API_PATHS.length >= 8, `trop peu de chemins vérifiés : ${ADMIN_API_PATHS.length}`);
    assert.equal(new Set(ADMIN_API_PATHS).size, ADMIN_API_PATHS.length, 'chemins dupliqués');
    for (const path of ADMIN_API_PATHS) {
      assert.ok(path.startsWith('/api/v1/'), `chemin hors namespace API : ${path}`);
      assert.ok(declared.has(normalize(path)), `route inconnue du produit : ${path}`);
    }
  });

  check('ADM — GARDE-FOU vocabulaire : aucun terme du Master Design ne désigne un concept produit dans l’interface', () => {
    const files = [
      ...readdirSync(ADMIN_SCREEN_DIR).map((name) => new URL(name, ADMIN_SCREEN_DIR)),
      new URL('./components.tsx', import.meta.url),
      new URL('./gaps.ts', import.meta.url),
      new URL('./registry.tsx', import.meta.url),
      new URL('./UnitBoundary.tsx', import.meta.url),
      new URL('./RouteFallback.tsx', import.meta.url),
      new URL('./vocabulary.ts', import.meta.url),
    ];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const found = forbiddenTermsIn(displayStringsIn(source).join(' | '));
      assert.deepEqual(found, [], `${file.pathname} affiche des termes interdits : ${found.join(', ')}`);
    }
    // Les lignes BACKEND_GAP sont affichées telles quelles : elles sont scannées en brut.
    const gapLines = Object.values(ADMIN_UNIT_GAPS).flat();
    assert.ok(gapLines.length >= 12, 'au moins une ligne de gap par fiche');
    assert.deepEqual(forbiddenTermsIn(stripTechnicalTokens(gapLines.join(' | '))), [], 'gaps.ts : termes interdits dans les lignes affichées');
    // vocabulary.ts : les termes n'existent que dans le tableau des termes interdits.
    const vocabulary = readFileSync(new URL('./vocabulary.ts', import.meta.url), 'utf8');
    const body = stripComments(vocabulary);
    const listStart = body.indexOf('DESIGN_ONLY_TERMS_NOT_RENDERED');
    const listEnd = body.indexOf('] as const;', listStart);
    const outsideList = stripTechnicalTokens(body.slice(0, listStart) + body.slice(listEnd));
    assert.deepEqual(forbiddenTermsIn(outsideList), [], 'vocabulary.ts : termes interdits hors du tableau de référence');
    assert.ok(DESIGN_ONLY_TERMS_NOT_RENDERED.includes('Mission' as never) && DESIGN_ONLY_TERMS_NOT_RENDERED.includes('Prestataire' as never), 'le tableau de référence doit lister les termes');
  });

  check('ADM — décision FINANCE : aucun libellé du triplet financier interdit n’entre dans le code de la tranche', () => {
    const files = [
      ...readdirSync(ADMIN_SCREEN_DIR).map((name) => new URL(name, ADMIN_SCREEN_DIR)),
      new URL('./components.tsx', import.meta.url),
      new URL('./gaps.ts', import.meta.url),
      new URL('./vocabulary.ts', import.meta.url),
    ];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const label of FORBIDDEN_FINANCE_LABELS) {
        assert.ok(!source.includes(label), `${file.pathname} contient « ${label} »`);
      }
    }
  });

  check('ADM — rendu réel : chaque fiche rend son conteneur, son état « source non configurée » et sa structure inspectable', () => {
    for (const screen of ADMIN_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell');
      if (resolved.kind !== 'shell' || !resolved.unitId) continue;
      const html = renderToStaticMarkup(
        <>{AdminScreen({ unitId: resolved.unitId, pathname: resolved.pathname, segments: resolved.segments })}</>,
      );
      assert.ok(html.includes(`data-unit="${resolved.unitId}"`), `${screen.code} : data-unit absent`);
      assert.ok(html.includes(`data-screen="${screen.code}"`), `${screen.code} : data-screen absent`);
      assert.ok(html.includes('data-backend-gap="true"'), `${screen.code} : BACKEND_GAP absent`);
      assert.ok(html.includes('Source de données non configurée'), `${screen.code} : aucun état honnête sans source de données`);
      assert.ok(html.includes(`data-sheet-frame="${screen.code}"`), `${screen.code} : structure de fiche non inspectable`);
      const text = html.replace(/<[^>]*>/g, ' ');
      assert.deepEqual(forbiddenTermsIn(text), [], `${screen.code} : terme interdit rendu à l’écran`);
      for (const label of FORBIDDEN_FINANCE_LABELS) {
        assert.ok(!text.includes(label), `${screen.code} : libellé financier interdit rendu`);
      }
    }
  });

  check('ADM — unités d’inspection : data-zone par genre de zone, aucun genre inventé', () => {
    const allowedKinds = new Set(ADMIN_DESIGN_SCREENS.flatMap((screen) => screen.zoneKinds as readonly string[]));
    assert.ok(allowedKinds.has('hero') && allowedKinds.has('table') && allowedKinds.has('verdict'), 'le catalogue doit déclarer les zones de la tranche');
    for (const screen of ADMIN_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell', `route non shell : ${path}`);
      if (resolved.kind !== 'shell' || !resolved.unitId) continue;
      const html = renderToStaticMarkup(
        <>{AdminScreen({ unitId: resolved.unitId, pathname: resolved.pathname, segments: resolved.segments })}</>,
      );
      const rendered = [...html.matchAll(/data-zone="([^"]+)"/g)].map((match) => match[1]);
      for (const kind of rendered) {
        assert.ok(allowedKinds.has(kind), `${screen.code} : genre de zone inventé « ${kind} »`);
      }
      for (const kind of screen.zoneKinds as readonly string[]) {
        assert.ok(rendered.includes(kind), `${screen.code} : zone déclarée « ${kind} » absente du rendu`);
      }
    }
  });

  check('ADM — dock supervision : chaque onglet mène à une fiche livrée ou à une unité rattachée (état honnête)', () => {
    const dockItems = DOCK_DEFINITIONS.ADM;
    assert.equal(dockItems.length, 5, 'le dock ADM compte cinq onglets');
    for (const item of dockItems) {
      const resolved = resolveRoute(item.href);
      assert.equal(resolved.kind, 'shell', `onglet non résolu : ${item.href}`);
      if (resolved.kind !== 'shell') continue;
      assert.equal(resolved.namespace, 'admin', `onglet hors espace supervision : ${item.href}`);
      assert.equal(resolved.notFound, false, `onglet 404 : ${item.href}`);
      const screen = resolveAdminScreen(resolved.pathname);
      if (screen) {
        assert.ok(ADMIN_SCREEN_COMPONENTS[screen.code], `onglet sans écran : ${item.href}`);
        continue;
      }
      // Onglet vers une fonction non livrée : l'unité est rattachée, la fondation
      // affiche l'état « non intégré » (état honnête, jamais une fausse page).
      assert.ok(resolved.unitId, `onglet sans unité ni fiche : ${item.href}`);
      assert.equal(integrationStatus(resolved.unitId), 'NON_INTEGRE', `onglet vers une unité livrée sans fiche : ${item.href}`);
    }
  });

  check('ADM — chemin sans fiche : page de repli honnête, routes livrées listées, libellé du design jamais rendu', () => {
    const cases: readonly { unitId: string; pathname: string }[] = [
      { unitId: 'ADM-11', pathname: '/admin/matching/runs' },
    ];
    for (const item of cases) {
      assert.equal(resolveAdminScreen(item.pathname), null, `${item.pathname} ne doit correspondre à aucune fiche`);
      const resolved = resolveRoute(item.pathname);
      assert.equal(resolved.kind === 'shell' ? resolved.unitId : null, item.unitId, `unité inattendue pour ${item.pathname}`);
      const html = renderToStaticMarkup(<>{AdminRouteFallback({ unitId: item.unitId, pathname: item.pathname })}</>);
      assert.ok(html.includes('data-route-fallback="true"'), `${item.pathname} : page de repli absente`);
      assert.ok(html.includes('Aucun écran livré'), `${item.pathname} : absence de fiche non dite`);
      assert.ok(html.includes(item.unitId), `${item.pathname} : unité non nommée`);
      assert.ok(html.includes('data-backend-gap="true"'), `${item.pathname} : BACKEND_GAP absent`);
      const delivered = deliveredScreensForUnit(item.unitId);
      assert.ok(delivered.length > 0, `${item.unitId} : aucune route livrée`);
      for (const screen of delivered) {
        assert.ok(html.includes(screen.route), `${item.pathname} : route livrée absente (${screen.route})`);
      }
      const unitLabel = PRODUCTION_UNITS.find((unit) => unit.id === item.unitId)?.label ?? '';
      assert.ok(unitLabel.length > 0, `${item.unitId} : libellé introuvable`);
      assert.ok(!html.includes(unitLabel), `${item.pathname} : libellé du Master Design rendu à l’écran`);
      const text = html.replace(/<[^>]*>/g, ' ');
      assert.deepEqual(forbiddenTermsIn(text), [], `${item.pathname} : terme interdit rendu`);
    }
  });

  check('ADM — intégration : 17 unités ADM PARTIEL (P4A + P4B-1 + P4B-2 + P4C + P4D + P4E-1), EMP/PRE/PUB/SYS inchangés, autres ADM/FIN/RTC non intégrées', () => {
    assert.equal(ADMIN_UNIT_IDS.length, 17);
    for (const unitId of ADMIN_UNIT_IDS) {
      assert.equal(integrationStatus(unitId), 'PARTIEL', `${unitId} doit être PARTIEL`);
      assert.ok(isAdminUnit(unitId), `${unitId} doit être reconnue comme unité ADM`);
      assert.ok(PARTIAL_UNIT_IDS.includes(unitId), `${unitId} doit être dans PARTIAL_UNIT_IDS`);
    }
    for (const unit of PRODUCTION_UNITS) {
      if (unit.family === 'EMP' || unit.family === 'PUB' || unit.family === 'SYS' || unit.family === 'PRE') continue;
      if (ADMIN_UNIT_IDS.includes(unit.id)) continue;
      assert.equal(integrationStatus(unit.id), 'NON_INTEGRE', `${unit.id} ne doit pas être touchée par cette tranche`);
    }
    assert.equal(isAdminUnit('EMP-01'), false);
    assert.equal(integrationStatus('EMP-01'), 'PARTIEL', 'EMP-01 est livrée par P2-DESIGN-EMPLOYER');
    // P4B-1 : unités contrats ; P4B-2 : unités paiements exactes de units.py.
    assert.equal(integrationStatus('ADM-13'), 'PARTIEL', 'ADM-13 (registre des contrats) est livrée par P4B-1');
    assert.equal(integrationStatus('ADM-14'), 'PARTIEL', 'ADM-14 (fiche, incidents & journal) est livrée par P4B-1');
    assert.equal(integrationStatus('ADM-16'), 'PARTIEL', 'ADM-16 (révision forcée — capacité absente déclarée) est livrée par P4B-1');
    assert.equal(integrationStatus('ADM-18'), 'PARTIEL', 'ADM-18 (Paiements et rapprochement) est livrée par P4B-2');
    assert.equal(integrationStatus('ADM-20'), 'PARTIEL', 'ADM-20 (anomalies, déclarations et incidents) est livrée par P4B-2');
    assert.equal(integrationStatus('ADM-23'), 'PARTIEL', 'ADM-23 (confirmations de Salaire et preuves) est livrée par P4C');
    assert.equal(integrationStatus('ADM-25'), 'NON_INTEGRE', 'ADM-25 (salaire — autre fiche) reste hors tranches livrées');
    assert.equal(integrationStatus('ADM-26'), 'PARTIEL', 'ADM-26 (file Claim) est livrée par P4D');
    assert.equal(integrationStatus('ADM-27'), 'PARTIEL', 'ADM-27/28 (dossier et justificatifs Claim) sont livrées par P4D');
    assert.equal(integrationStatus('ADM-29'), 'PARTIEL', 'ADM-29/30 (décision et Claims terminés) sont livrées par P4D');
    assert.equal(integrationStatus('ADM-31'), 'PARTIEL', 'ADM-31/32/33 (file, suivi et arbitrage des Remplacements) sont livrées par P4E-1');
  });

  check('ADM — erreurs : projection en états StateGuard, corrélation sûre uniquement', () => {
    assert.equal(adminError(new ApiClientError('refus', 403, 'FORBIDDEN')).state, '403');
    assert.equal(adminError(new ApiClientError('réseau', 0, 'NETWORK_ERROR')).state, 'offline');
    assert.equal(adminError(new ApiClientError('inconnu', 1000, 'INVALID_RESPONSE')).state, '500');
    assert.equal(adminError(new Error('secret')).state, '500');
    assert.equal(adminError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'req-abc123-xyz789')).correlationId, 'req-abc123-xyz789');
    assert.equal(adminError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'token=secret')).correlationId, undefined);
  });

  check('ADM — décisions de qualification : parité exacte avec le code serveur réel', () => {
    // Noms réels vérifiés dans src/backend/matching/records.ts (QUALIFICATION_DECISIONS).
    assert.deepEqual(QUALIFICATION_DECISIONS, ['ELIGIBLE_FOR_INDEPENDENT', 'HUMAN_REVIEW_REQUIRED', 'BLOCKED']);
    assert.deepEqual(Object.keys(QUALIFICATION_DECISION_LABELS).sort(), [...QUALIFICATION_DECISIONS].sort(), 'libellés des décisions réelles');
    // La revue humaine réelle n'accepte que deux conclusions (parseReviewInput serveur).
    assert.deepEqual([...REVIEW_DECISION_OPTIONS].sort(), ['BLOCKED', 'ELIGIBLE_FOR_INDEPENDENT']);
    for (const option of REVIEW_DECISION_OPTIONS) {
      assert.ok((QUALIFICATION_DECISIONS as readonly string[]).includes(option), `décision de revue non réelle : ${option}`);
    }
  });

  check('ADM — garde de session : seul un compte ADMIN actif ouvre l’espace supervision', () => {
    const base: AdminSessionState = { status: 'ready', session: { actor: { id: 'u-1', role: 'ADMIN', status: 'ACTIVE', displayName: 'Admin' }, permissions: ['users:read:any'] }, error: null, reload: () => undefined };
    assert.equal(adminGuard(base), 'ok');
    assert.equal(adminGuard({ ...base, session: { ...base.session!, actor: { ...base.session!.actor, role: 'EMPLOYER' } } }), 'forbidden');
    assert.equal(adminGuard({ ...base, session: { ...base.session!, actor: { ...base.session!.actor, role: 'CANDIDATE' } } }), 'forbidden');
    assert.equal(adminGuard({ ...base, session: { ...base.session!, actor: { ...base.session!.actor, status: 'BLOCKED' } } }), 'forbidden');
    assert.equal(adminGuard({ ...base, session: null }), 'forbidden');
    assert.equal(adminGuard({ ...base, status: 'loading' }), 'loading');
    assert.equal(adminGuard({ ...base, status: 'unavailable' }), 'unavailable');
    assert.equal(adminGuard({ ...base, status: 'anonymous' }), 'anonymous');
    assert.equal(adminGuard({ ...base, status: 'error', error: { state: '500' } }), 'error');
  });

  check('ADM — e-mail masqué : la donnée réelle est masquée à l’affichage', () => {
    assert.equal(maskEmail('marie.dupont@example.com'), 'ma***@example.com');
    assert.equal(maskEmail('a@example.com'), 'a***@example.com');
    assert.equal(maskEmail(''), null);
    assert.equal(maskEmail(undefined), null);
    assert.equal(maskEmail('sans-arobase'), null);
  });

  check('ADM — vocabulaire produit affiché : Offre, Employeur, Candidat, Claim, Qualification (jamais les mots du Master)', () => {
    assert.equal(PRODUCT_LABELS.OFFER.singular, 'Offre');
    assert.equal(PRODUCT_LABELS.EMPLOYER.singular, 'Employeur');
    assert.equal(PRODUCT_LABELS.CANDIDATE.singular, 'Candidat');
    assert.equal(PRODUCT_LABELS.CLAIM.singular, 'Claim');
    assert.equal(PRODUCT_LABELS.ADMIN.singular, 'Admin');
    assert.equal(PRODUCT_LABELS.QUALIFICATION.singular, 'Qualification');
    assert.equal(PRODUCT_LABELS.MATCHING.singular, 'Matching');
  });

  check('ADM — résolution d’écran : motif exact prioritaire, paramètres extraits, variantes regroupées', () => {
    const sheet = resolveAdminScreen('/admin/utilisateurs/usr-1');
    assert.equal(sheet?.code, 'ADM-03');
    assert.equal(sheet?.unitId, 'ADM-02');
    assert.deepEqual(sheet?.params, { id: 'usr-1' });
    const block = resolveAdminScreen('/admin/utilisateurs/usr-1/blocage');
    assert.equal(block?.code, 'ADM-04');
    assert.equal(block?.unitId, 'ADM-04');
    assert.deepEqual(block?.params, { id: 'usr-1' });
    const journal = resolveAdminScreen('/admin/blocages');
    assert.equal(journal?.code, 'ADM-05');
    const review = resolveAdminScreen('/admin/qualification/qual-9');
    assert.equal(review?.code, 'ADM-07');
    assert.equal(review?.unitId, 'ADM-06');
    const decision = resolveAdminScreen('/admin/qualification/qual-9/decision');
    assert.equal(decision?.code, 'ADM-08');
    assert.equal(decision?.unitId, 'ADM-08');
    const history = resolveAdminScreen('/admin/qualification/historique');
    assert.equal(history?.code, 'ADM-09');
    assert.equal(history?.unitId, 'ADM-08');
    const runs = resolveAdminScreen('/admin/matching');
    assert.equal(runs?.code, 'ADM-10');
    const runDetail = resolveAdminScreen('/admin/matching/runs/mtr-1');
    assert.equal(runDetail?.code, 'ADM-11');
    assert.deepEqual(runDetail?.params, { id: 'mtr-1' });
    const rulesets = resolveAdminScreen('/admin/matching/rulesets');
    assert.equal(rulesets?.code, 'ADM-12');
    assert.equal(rulesets?.unitId, 'ADM-10');
    assert.equal(resolveAdminScreen('/admin/inconnu'), null);
    assert.equal(resolveAdminScreen('/admin/matching/runs'), null, 'chemin sans fiche : repli honnête attendu');
  });

  check('ADM — accessibilité & responsive : table sémantique, cibles tactiles, réduction de mouvement', () => {
    const html = renderToStaticMarkup(
      <DataTable caption="Registre réel" head={['Identifiant', 'Statut']} rows={[['u-1', 'Actif']]} empty={<p>Aucun</p>} />,
    );
    assert.ok(html.includes('<table'), 'table absente');
    assert.ok(html.includes('<caption'), 'caption absente (libellé du tableau)');
    assert.ok(html.includes('scope="col"'), 'en-têtes sans scope="col"');
    assert.ok(html.includes('data-zone="table"'), 'zone table absente');
    const css = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
    assert.ok(css.includes('@media (max-width: 600px)'), 'point de rupture mobile (360 px) absent');
    assert.ok(css.includes('prefers-reduced-motion'), 'réduction de mouvement absente');
    assert.ok(css.includes('overflow-x: auto'), 'défilement horizontal de la table non maîtrisé');
    assert.ok(css.includes('--touch-target-mobile'), 'cible tactile non référencée');
  });

  /* ── P4B-1-DESIGN-ADMIN-CONTRACTS — supervision des contrats ── */

  check('ADM — P4B-1 : routes des écrans contrats résolues (fiche propre à chaque chemin, params extraits)', () => {
    const registre = resolveAdminScreen('/admin/contrats');
    assert.equal(registre?.code, 'ADM-13');
    assert.equal(registre?.unitId, 'ADM-13');
    const fiche = resolveAdminScreen('/admin/contrats/ctr-42');
    assert.equal(fiche?.code, 'ADM-14');
    assert.equal(fiche?.unitId, 'ADM-14', 'ADM-14, ADM-15 et ADM-17 forment UNE unité (units.py)');
    assert.deepEqual(fiche?.params, { id: 'ctr-42' });
    const incidents = resolveAdminScreen('/admin/contrats/ctr-42/incidents');
    assert.equal(incidents?.code, 'ADM-15');
    assert.equal(incidents?.unitId, 'ADM-14');
    const journal = resolveAdminScreen('/admin/contrats/ctr-42/journal');
    assert.equal(journal?.code, 'ADM-17');
    assert.equal(journal?.unitId, 'ADM-14');
    const revision = resolveAdminScreen('/admin/contrats/ctr-42/revision-forcee');
    assert.equal(revision?.code, 'ADM-16');
    assert.equal(revision?.unitId, 'ADM-16');
    // Chemins non décrits par les fiches de la tranche : aucun écran inventé.
    assert.equal(resolveAdminScreen('/admin/contrats/ctr-42/versions'), null, 'aucune fiche ADMIN « versions » : pas d’invention');
    assert.equal(resolveAdminScreen('/admin/contrats/ctr-42/paiements'), null, 'paiements = P4B-2 : aucun écran');
    // Les gaps de l’unité et de la fiche atteinte sont fusionnés (résolution réelle).
    const gapsIncidents = adminGapsFor('ADM-14', '/admin/contrats/ctr-42/incidents');
    assert.ok(gapsIncidents.some((line) => line.includes('ADM-14')), 'gaps de l’unité ADM-14 absents');
    assert.ok(gapsIncidents.some((line) => line.includes('ADM-15')), 'gaps de la fiche ADM-15 absents');
  });

  check('ADM — P4B-1 : routes du catalogue contrats = routes du routeur P0 (aucune route créée)', () => {
    for (const unitId of ['ADM-13', 'ADM-14', 'ADM-16']) {
      const catalogUnit = ADMIN_DESIGN_UNITS.find((unit) => unit.id === unitId);
      const productionUnit = PRODUCTION_UNITS.find((unit) => unit.id === unitId);
      assert.ok(catalogUnit && productionUnit, `unité introuvable : ${unitId}`);
      assert.deepEqual(
        [...catalogUnit.routes].sort(),
        [...productionUnit.routes].sort(),
        `${unitId} : les routes livrées doivent être exactement celles du routeur P0`,
      );
    }
  });

  check('ADM — P4B-1 : chemins et permissions ADMIN contrats — routes réelles du catalogue serveur, rien de plus', () => {
    const contractsRoute = API_ROUTE_CONTRACTS.find((route) => route.key === 'admin.contracts.list');
    assert.ok(contractsRoute, 'admin.contracts.list absente du catalogue serveur');
    assert.equal(contractsRoute.path, '/api/v1/admin/contracts');
    assert.equal(contractsRoute.permission, 'contracts:read:any', 'permission serveur réelle du registre');
    assert.equal(contractsRoute.scope, 'admin');
    const claimsRoute = API_ROUTE_CONTRACTS.find((route) => route.key === 'admin.claims.list');
    assert.ok(claimsRoute, 'admin.claims.list absente du catalogue serveur');
    assert.equal(claimsRoute.permission, 'incidents:read:any', 'permission serveur réelle des Claims');
    assert.ok(ADMIN_API_PATHS.includes('/api/v1/admin/contracts'), 'chemin des contrats non vérifié');
    assert.ok(ADMIN_API_PATHS.includes('/api/v1/admin/claims'), 'chemin des Claims non vérifié');
    // Les capacités déclarées BACKEND_GAP sont réellement absentes : aucune route
    // ADMIN individuelle de contrat (lecture, versions, journal, incidents, notes,
    // export, synthèse, révision forcée) n’existe dans le catalogue.
    for (const forbidden of ['/api/v1/admin/contracts/']) {
      assert.equal(
        API_ROUTE_CONTRACTS.some((route) => route.path.startsWith(forbidden)),
        false,
        `une route individuelle ${forbidden}* existerait : les BACKEND_GAP de la tranche seraient faux`,
      );
    }
  });

  check('ADM — P4B-1 : handlers opérationnels — registre ADMIN branché sur la persistance, frontière de contrôle sinon (états réels)', () => {
    // Handler métier réel installé par la composition P0-F (couvert par le test
    // backend `contracts.test.ts` : ADMIN lit, tiers et ADMIN non-partie obtiennent 403
    // sur la route partie) et frontière de contrôle sécurisée sinon : les deux
    // comportements affichés par la tranche viennent de ces faits-là.
    const repositorySource = readFileSync(new URL('../backend/repositories/contractRepository.ts', import.meta.url), 'utf8');
    assert.ok(repositorySource.includes("'admin.contracts.list': async context => repository.getAdminContracts("), 'handler admin.contracts.list non branché sur getAdminContracts : vérifier l’audit');
    assert.ok(repositorySource.includes('requireAdmin(actor)'), 'garde ADMIN serveur absente du handler de lecture');
    const identitySource = readFileSync(new URL('../backend/api/identityWorker.ts', import.meta.url), 'utf8');
    assert.ok(identitySource.includes("'admin.contracts.list': adminControl('contracts')"), 'frontière de contrôle sans persistance absente : l’état affiché serait faux');
    const entrySource = readFileSync(new URL('../backend/api/entry.ts', import.meta.url), 'utf8');
    assert.ok(entrySource.includes('...contractHandlers,'), 'composition n’installe pas les handlers contrat : l’écran devrait annoncer 501');
  });

  check('ADM — P4B-1 : statuts de contrat affichés = statuts RÉELS du produit (aucun renommé)', () => {
    // Source de vérité : l'union `ContractStatus` de src/types/index.ts.
    const typesSource = readFileSync(new URL('../types/index.ts', import.meta.url), 'utf8');
    const match = /export type ContractStatus =\s*\n([^;]+);/.exec(typesSource);
    assert.ok(match, 'union ContractStatus introuvable dans src/types/index.ts');
    const statuses = [...match[1].matchAll(/'([A-Z_]+)'/g)].map((found) => found[1]);
    assert.ok(statuses.length >= 8, 'statuts inattendus dans l’union ContractStatus');
    assert.deepEqual(Object.keys(CONTRACT_STATUS_LABELS).sort(), [...statuses].sort(), 'libellés ADMIN doivent couvrir exactement les statuts réels');
    assert.deepEqual(Object.keys(CONTRACT_STATUS_TONES).sort(), [...statuses].sort(), 'teintes doivent couvrir exactement les statuts réels');
    // Les libellés ADMIN sont les libellés officiels du produit, identiques à
    // ceux déjà en usage côté EMPLOYER et CANDIDATE : aucune divergence terminologique.
    // Comparaison dans le bloc CONTRACT_STATUS_LABELS seul (les mêmes codes de
    // statut existent aussi pour les comptes : « ACTIVE : Actif » vs « Active »).
    const extractBlock = (source: string) => {
      const start = source.indexOf('CONTRACT_STATUS_LABELS');
      const end = source.indexOf('};', start);
      return source.slice(start, end);
    };
    const employerBlock = extractBlock(readFileSync(new URL('../employer/vocabulary.ts', import.meta.url), 'utf8'));
    const prestataireBlock = extractBlock(readFileSync(new URL('../prestataire/vocabulary.ts', import.meta.url), 'utf8'));
    assert.ok(employerBlock.length > 0 && prestataireBlock.length > 0, 'blocs CONTRACT_STATUS_LABELS introuvables');
    for (const status of statuses) {
      const adminLabel = CONTRACT_STATUS_LABELS[status as keyof typeof CONTRACT_STATUS_LABELS];
      for (const [block, family] of [[employerBlock, 'EMPLOYER'], [prestataireBlock, 'CANDIDATE']] as const) {
        const found = new RegExp(`\\b${status}: '([^']+)'`).exec(block);
        assert.ok(found, `statut ${status} introuvable dans le vocabulaire ${family}`);
        assert.equal(adminLabel, found[1], `libellé ADMIN « ${adminLabel} » diverge du libellé officiel ${family} ${status} = « ${found[1]} »`);
      }
    }
    // Segments du registre : uniquement des statuts réels, jamais un statut inventé.
    const all = CONTRACT_REGISTRY_SEGMENTS.find((segment) => segment.id === 'all');
    assert.ok(all && all.statuses.length === 0, 'le segment « Tous » ne doit filtrer aucun statut');
    for (const segment of CONTRACT_REGISTRY_SEGMENTS) {
      for (const status of segment.statuses) {
        assert.ok(statuses.includes(status), `segment ${segment.id} : statut inventé ${status}`);
      }
    }
    assert.deepEqual(
      CONTRACT_REGISTRY_SEGMENTS.map((segment) => segment.id),
      ['all', 'signature', 'active', 'incident', 'completed', 'terminated', 'replaced'],
      'segments de la fiche ADM-13 : Tous · En signature · Actifs · En incident · Terminés · Résiliés · Remplacés',
    );
  });

  check('ADM — P4B-1 : Claim — parité exacte avec les enums serveur (le produit dit Claim)', () => {
    assert.deepEqual(Object.keys(CLAIM_TYPE_LABELS).sort(), [...CLAIM_TYPE_VALUES].sort(), 'types de Claim affichés != CLAIM_TYPE_VALUES serveur');
    assert.deepEqual(Object.keys(CLAIM_STATUS_LABELS).sort(), [...CLAIM_STATUS_VALUES].sort(), 'statuts de Claim affichés != CLAIM_STATUS_VALUES serveur');
    for (const status of CLAIM_STATUS_VALUES) {
      assert.ok(status in CLAIM_STATUS_LABELS, `statut de Claim sans libellé : ${status}`);
    }
    // Le libellé du statut INCIDENT du contrat nomme l'objet réel : « Claim en cours ».
    assert.equal(CONTRACT_STATUS_LABELS.INCIDENT, 'Claim en cours');
    assert.equal(PRODUCT_LABELS.CLAIM.singular, 'Claim');
  });

  check('ADM — P4B-1 : aucune donnée simulée dans les écrans contrats (audit d’honnêteté)', () => {
    const source = stripComments(readFileSync(new URL('./screens/contracts.tsx', import.meta.url), 'utf8'));
    assert.ok(!/mock/i.test(source), 'référence mock interdite dans un écran livré');
    assert.ok(!/Math\.random/.test(source), 'aléatoire interdit : aucune valeur inventée');
    assert.ok(!/\bfetch\s*\(/.test(source), 'aucun appel réseau direct : passer par AdminApi (chemins vérifiés)');
    assert.ok(!/\/api\/v1/.test(source), 'aucun chemin d’API écrit dans l’écran : les chemins vivent dans api.ts (gardés par test)');
    assert.ok(!/VITE_/.test(source), 'aucune lecture d’environnement dans l’écran');
    // Valeurs manquantes : « — » littéral, jamais un 0 ou une date de remplissage.
    assert.ok(source.includes("?? '—'"), 'le témoin d’absence « — » doit être utilisé');
    assert.ok(!/new Date\(\)/.test(source), 'aucune horloge locale injectée comme donnée métier');
    // Les écrans ne parlent qu’à AdminApi (chemins gardés par test contre le
    // catalogue serveur) : aucune source de données alternative n’est branchée.
    assert.ok(source.includes("from '../api'"), 'les écrans doivent importer AdminApi depuis api.ts');
    assert.ok(!/from '\.\.\/\.\.\/backend/.test(source), 'aucun import direct du backend par les écrans contrats');
  });

  check('ADM — P4B-1 : formatContractAmount — affichage seul, aucune valeur inventée', () => {
    assert.equal(formatContractAmount(Number.NaN, 'EUR'), '—', 'montant absent : « — », jamais un zéro');
    const euro = formatContractAmount(1200, 'EUR');
    assert.ok(/1/.test(euro) && /200/.test(euro), `montant réel absent de l’affichage : ${euro}`);
    const noCurrency = formatContractAmount(1200, '');
    assert.ok(!noCurrency.includes('€'), 'devise absente : aucun symbole inventé');
    assert.ok(formatContractAmount(1200, 'XX-BOGUS').includes('XX-BOGUS'), 'devise inconnue : la valeur serveur est rendue telle quelle, sans conversion');
  });

  /* ── P4B-2-DESIGN-ADMIN-PAYMENTS — Paiements, déclarations et rapprochement ── */

  check('ADM — P4B-2 : routes canoniques des cinq fiches et deux unités exactes (units.py)', () => {
    const cases = [
      ['/admin/paiements', 'ADM-18', 'ADM-18', {}],
      ['/admin/paiements/reconciliation', 'ADM-19', 'ADM-18', {}],
      ['/admin/paiements/anomalies', 'ADM-20', 'ADM-20', {}],
      ['/admin/paiements/declarations-externes', 'ADM-21', 'ADM-20', {}],
      ['/admin/paiements/incidents/pay-e2e-1', 'ADM-22', 'ADM-20', { id: 'pay-e2e-1' }],
    ] as const;
    for (const [path, code, unitId, params] of cases) {
      const resolved = resolveAdminScreen(path);
      assert.equal(resolved?.code, code, `fiche P4B-2 de ${path}`);
      assert.equal(resolved?.unitId, unitId, `unité canonique de ${path}`);
      assert.deepEqual(resolved?.params, params, `paramètres réels de ${path}`);
      const production = resolveRoute(path);
      assert.equal(production.kind, 'shell');
      if (production.kind === 'shell') {
        assert.equal(production.shell, 'ADMIN');
        assert.equal(production.notFound, false);
        assert.equal(production.unitId, unitId);
      }
    }
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-18')?.criticality, 'P0');
    assert.equal(ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-20')?.criticality, 'P0');
  });

  check('ADM — P4B-2 : statuts, natures, déclarations, verdicts et revue en parité avec les types serveur', () => {
    assert.deepEqual(Object.keys(PAYMENT_STATUS_LABELS), PAYMENT_LIFECYCLE_STATUS_VALUES, 'statuts Payment affichés != PAYMENT_LIFECYCLE_STATUS_VALUES');
    assert.deepEqual(Object.keys(PAYMENT_STATUS_TONES), PAYMENT_LIFECYCLE_STATUS_VALUES, 'teintes != statuts Payment réels');
    assert.deepEqual(Object.keys(PAYMENT_TYPE_LABELS), PAYMENT_TYPE_VALUES, 'natures de Payment affichées != PAYMENT_TYPE_VALUES');
    const declarationOutcomes: readonly PaymentDeclarationRecord['outcome'][] = ['PENDING', 'VERIFIED', 'REJECTED'];
    assert.deepEqual(Object.keys(PAYMENT_DECLARATION_OUTCOME_LABELS), declarationOutcomes, 'outcomes != type réel d’une tentative de déclaration');
    const reconciliationVerdicts: readonly PaymentReconciliationVerdict[] = ['MATCH', 'MISMATCH', 'NOT_FOUND', 'DUPLICATE', 'REVIEW_REQUIRED'];
    assert.deepEqual(Object.keys(PAYMENT_RECONCILIATION_VERDICT_LABELS), reconciliationVerdicts, 'verdicts != les états de rapprochement serveur');
    const batchStatuses: readonly PaymentReconciliationBatchStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED'];
    const itemStatuses: readonly PaymentReconciliationItemStatus[] = ['PENDING', 'PROCESSING', 'RETRYABLE', 'MATCH', 'MISMATCH', 'NOT_FOUND', 'DUPLICATE', 'REVIEW_REQUIRED', 'FAILED'];
    const reviewDecisions: readonly PaymentReconciliationReviewDecision[] = ['OPEN', 'CONFIRMED', 'REJECTED'];
    assert.deepEqual(Object.keys(PAYMENT_RECONCILIATION_BATCH_STATUS_LABELS).sort(), [...batchStatuses].sort());
    assert.deepEqual(Object.keys(PAYMENT_RECONCILIATION_ITEM_STATUS_LABELS).sort(), [...itemStatuses].sort());
    assert.deepEqual(Object.keys(PAYMENT_RECONCILIATION_REVIEW_DECISION_LABELS).sort(), [...reviewDecisions].sort());
    assert.equal(PAYMENT_STATUS_LABELS.VERIFIED, 'Vérifié — non payé', 'VERIFIED doit rester distinct de PAID');
    assert.equal(PAYMENT_STATUS_LABELS.PAID, 'Payé (état du cycle)');
    assert.equal(PAYMENT_TYPE_LABELS.SALARY.label, 'Salaire');
    assert.equal(PAYMENT_TYPE_LABELS.PLATFORM_FEE.label, 'Frais dus à LE LABEUR');
    assert.notEqual(PAYMENT_TYPE_LABELS.SALARY.label, PAYMENT_TYPE_LABELS.PLATFORM_FEE.label, 'Salaire et frais doivent rester séparés');
    assert.ok(PAYMENT_TYPE_LABELS.SALARY.detail.includes('ne reçoit ni ne détient'), 'le Salaire doit rester un paiement externe');
  });

  check('ADM — P4B-2 : handlers/permissions réels seulement ; aucune route inventée ni accès partie contourné', () => {
    const route = (key: string) => API_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
    const adminRoutes = [
      ['admin.payments.list', 'GET', '/api/v1/admin/payments', 'payments:read:any', false],
      ['admin.payments.approve', 'POST', '/api/v1/admin/payments/:paymentId/approve', 'payments:approve', true],
      ['admin.payments.reject', 'POST', '/api/v1/admin/payments/:paymentId/reject', 'payments:reject', true],
      ['admin.payments.confirm', 'POST', '/api/v1/admin/payments/:paymentId/confirm', 'payments:approve', true],
      ['admin.payment-reconciliation.batches.read', 'GET', '/api/v1/admin/payment-reconciliation/batches/:batchId', 'payments:read:any', false],
      ['admin.payment-reconciliation.batches.retry', 'POST', '/api/v1/admin/payment-reconciliation/batches/:batchId/retry', 'payments:read:any', true],
      ['admin.payment-reconciliation.reviews.decide', 'POST', '/api/v1/admin/payment-reconciliation/reviews/:reviewId/decision', 'payments:approve', true],
      ['admin.payment-reconciliation.reviews.correction-attempt', 'POST', '/api/v1/admin/payment-reconciliation/reviews/:reviewId/correction-attempts', 'payments:approve', true],
    ] as const;
    for (const [key, method, path, permission, idempotent] of adminRoutes) {
      const contract = route(key);
      assert.ok(contract, `contrat serveur absent : ${key}`);
      assert.equal(contract.method, method, `${key} méthode`);
      assert.equal(contract.path, path, `${key} chemin`);
      assert.equal(contract.scope, 'admin', `${key} scope ADMIN`);
      assert.equal(contract.permission, permission, `${key} permission dérivée serveur`);
      assert.equal(Boolean('idempotency' in contract && contract.idempotency), idempotent, `${key} idempotence`);
      if (idempotent) assert.equal('auditOnMutation' in contract && contract.auditOnMutation, true, `${key} audit serveur`);
      assert.ok(ADMIN_API_PATHS.includes(path), `${key} non gardée par AdminApi`);
    }
    const partRoute = route('payments.read');
    assert.ok(partRoute);
    assert.equal(partRoute.path, '/api/v1/payments/:paymentId');
    assert.equal(partRoute.scope, 'owner', 'la route de lecture reste portée par son scope produit');
    assert.ok(ADMIN_API_PATHS.includes(partRoute.path), 'consultation réelle non gardée');
    const paymentsSource = readFileSync(new URL('../backend/repositories/paymentRepository.ts', import.meta.url), 'utf8');
    assert.ok(paymentsSource.includes("trusted.role !== 'ADMIN' && !trusted.permissions.includes('payments:read:any')"), 'le handler de lecture n’autorise pas explicitement ADMIN avec payments:read:any');
    const entrySource = readFileSync(new URL('../backend/api/entry.ts', import.meta.url), 'utf8');
    assert.ok(entrySource.includes('...paymentHandlers,'), 'handlers Payment non branchés dans le Worker réel');
    assert.ok(entrySource.includes('...paymentReconciliationHandlers,'), 'handlers de batch non branchés dans le Worker réel');

    const absent = [
      '/api/v1/admin/payments/overview',
      '/api/v1/admin/payments/events',
      '/api/v1/admin/psp/health',
      '/api/v1/admin/reconciliation',
      '/api/v1/admin/reconciliation/summary',
      '/api/v1/admin/payments/anomalies',
      '/api/v1/admin/payments/external-declarations',
      '/api/v1/admin/payments/incidents/:id',
    ];
    for (const path of absent) {
      assert.equal(API_ROUTE_CONTRACTS.some((candidate) => candidate.path === path), false, `capacité présentée absente mais trouvée : ${path}`);
    }
    assert.equal(API_ROUTE_CONTRACTS.some((candidate) => candidate.method === 'GET' && String(candidate.path) === '/api/v1/admin/payment-reconciliation/batches'), false, 'le registre global des lots ne doit pas être confondu avec la route POST de création');
    assert.ok(!ADMIN_API_PATHS.some((path) => /admin\/(?:payments\/(?:overview|events|anomalies|external-declarations|incidents)|psp\/health|reconciliation(?:\/summary)?)/.test(path)), 'AdminApi appelle une route déclarée BACKEND_GAP');
  });

  check('ADM — P4B-2 : actions idempotentes, états distincts, écran sans source métier alternative ni calcul monétaire', () => {
    const source = stripComments(readFileSync(new URL('./screens/payments.tsx', import.meta.url), 'utf8'));
    assert.ok(source.includes('useSingleFlightAction'), 'garde contre les doubles soumissions UI absente');
    assert.ok(source.includes('current.status === \'PENDING_VERIFICATION\''), 'actions de déclaration non bornées au statut réel');
    assert.ok(source.includes('current.status === \'VERIFIED\''), 'transition vers PAID non bornée à VERIFIED');
    assert.ok(source.includes('api.verifyPayment'), 'route réelle payments.approve absente');
    assert.ok(source.includes('api.rejectPayment'), 'route réelle payments.reject absente');
    assert.ok(source.includes('api.markPaymentPaid'), 'route réelle payments.confirm absente');
    assert.ok(source.includes('api.decidePaymentReconciliationReview'), 'route de revue absente');
    assert.ok(source.includes('api.recordPaymentReconciliationCorrectionAttempt'), 'tentative append-only absente');
    assert.ok(source.includes('Non exposée par le DTO Payment'), 'confirmation du Candidat ne doit pas être déduite');
    assert.ok(source.includes('VERIFIED ne vaut pas PAID'), 'distinction VERIFIED/PAID non affichée');
    assert.ok(!/\bfetch\s*\(/.test(source), 'aucun appel réseau direct');
    assert.ok(!/\/api\/v1/.test(source), 'aucun chemin API dupliqué dans l’écran');
    assert.ok(!/Math\.(?:round|ceil|floor)|toFixed\s*\(|\b(?:payment\.)?amount\s*(?:\+|-|\*|\/)|(?:\+|-|\*|\/)\s*\b(?:payment\.)?amount\b/i.test(source), 'calcul, arrondi ou agrégat monétaire client détecté');
    assert.ok(!/new Date\(\)/.test(source), 'aucun horodatage métier inventé depuis l’horloge locale');
    assert.ok(!/localStorage|sessionStorage/.test(source), 'aucune source de vérité de navigateur');
  });

  check('ADM — P4B-2 : montant unitaire affiché sans conversion ni arrondi monétaire', () => {
    assert.equal(formatPaymentAmount(Number.NaN, 'XOF'), '—');
    assert.equal(formatPaymentAmount(120000.5, 'XOF'), '120000.5 XOF', 'montant de Salaire non arrondi selon les décimales de la devise');
    assert.equal(formatPaymentAmount(30000, 'XOF'), '30000 XOF', 'montant de frais distinct, jamais additionné');
    assert.equal(formatPaymentAmount(120000, ''), '120000', 'devise absente : aucune devise ajoutée');
    assert.equal(formatPaymentAmount(12.75, 'XX-BOGUS'), '12.75 XX-BOGUS', 'devise inconnue affichée sans conversion');
  });

  /* ── P4C-DESIGN-ADMIN-SALARY-PROOFS — confirmations de Salaire et preuves ── */

  check('ADM — P4C : routes canoniques des deux fiches, unité exacte (units.py), aucune route créée', () => {
    const cases = [
      ['/admin/salaire/confirmations', 'ADM-23', 'ADM-23', {}],
      ['/admin/salaire/preuves/pay-1', 'ADM-24', 'ADM-23', { id: 'pay-1' }],
    ] as const;
    for (const [path, code, unitId, params] of cases) {
      const resolved = resolveAdminScreen(path);
      assert.equal(resolved?.code, code, `fiche P4C de ${path}`);
      assert.equal(resolved?.unitId, unitId, `unité canonique de ${path}`);
      assert.deepEqual(resolved?.params, params, `paramètres réels de ${path}`);
      const production = resolveRoute(path);
      assert.equal(production.kind, 'shell');
      if (production.kind === 'shell') {
        assert.equal(production.shell, 'ADMIN');
        assert.equal(production.notFound, false);
        assert.equal(production.unitId, unitId);
      }
    }
    // Les routes du catalogue sont exactement celles du routeur P0.
    const catalogUnit = ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-23');
    const productionUnit = PRODUCTION_UNITS.find((unit) => unit.id === 'ADM-23');
    assert.ok(catalogUnit && productionUnit, 'unité ADM-23 introuvable');
    assert.deepEqual([...catalogUnit.routes].sort(), [...productionUnit.routes].sort(), 'ADM-23 : routes du catalogue = routes du routeur P0');
    // Hors tranche : aucune fiche n'est inventée pour les autres écrans salaire.
    assert.equal(resolveAdminScreen('/admin/salaire/litiges'), null, 'ADM-25 hors tranche : aucune fiche inventée');
    assert.equal(resolveAdminScreen('/admin/salaire'), null, 'aucune fiche index salaire : aucune invention');
  });

  check('ADM — P4C : confirmation OTP strictement réservée (Employeur / Candidat), aucune route ADMIN de confirmation ni de preuve', () => {
    const route = (key: string) => API_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
    const request = route('payments.salary.confirmation.request');
    assert.ok(request, 'payments.salary.confirmation.request absente du catalogue serveur');
    assert.equal(request.path, '/api/v1/payments/:paymentId/salary-confirmation-request');
    assert.equal(request.scope, 'owner', 'demande portée par son scope produit');
    assert.deepEqual([...(request.roles ?? [])], ['EMPLOYER'], 'la demande de confirmation reste réservée à l’Employeur');
    assert.equal(request.method, 'POST');
    const confirm = route('payments.salary.confirmation.confirm');
    assert.ok(confirm, 'payments.salary.confirmation.confirm absente du catalogue serveur');
    assert.equal(confirm.path, '/api/v1/payments/:paymentId/salary-confirmation');
    assert.equal(confirm.scope, 'owner');
    assert.deepEqual([...(confirm.roles ?? [])], ['CANDIDATE'], 'la confirmation OTP reste réservée au Candidat');
    assert.equal(confirm.method, 'POST');
    // Aucune route ADMIN de confirmation, de statistique, de relance ou de preuve.
    for (const forbidden of ['/api/v1/admin/salary', '/api/v1/admin/salaire']) {
      assert.equal(
        API_ROUTE_CONTRACTS.some((candidate) => candidate.path.startsWith(forbidden)),
        false,
        `une route ${forbidden}* existerait : le BACKEND_GAP ADM-23/24 serait faux`,
      );
    }
    // L'interface ADMIN n'appelle aucune route réservée à l'Employeur ou au Candidat.
    for (const path of ADMIN_API_PATHS) {
      assert.ok(!path.includes('salary-confirmation'), `AdminApi appelle une route réservée d’une partie : ${path}`);
      assert.ok(!path.startsWith('/api/v1/admin/salary'), `AdminApi appelle une route créée : ${path}`);
    }
    // Les mécanismes serveur réellement réutilisés existent et sont branchés.
    const salarySource = readFileSync(new URL('../backend/payments/salaryConfirmation.ts', import.meta.url), 'utf8');
    assert.ok(salarySource.includes('OTP is never returned by production endpoints'), 'règle serveur de non-retour de l’OTP absente : vérifier l’audit');
    assert.ok(salarySource.includes('seul le travailleur bénéficiaire peut confirmer'), 'garde serveur Candidat absente sur la confirmation');
    assert.ok(salarySource.includes('seul l’employeur du paiement peut demander'), 'garde serveur Employeur absente sur la demande');
    const paymentsSource = readFileSync(new URL('../backend/repositories/paymentRepository.ts', import.meta.url), 'utf8');
    assert.ok(paymentsSource.includes("'admin.payments.list': async context => repository.getAdminPayments("), 'handler admin.payments.list non branché');
    assert.ok(paymentsSource.includes("'payments.read': async context =>"), 'handler payments.read non branché : la consultation ADM-23 n’aurait aucune source');
    const identitySource = readFileSync(new URL('../backend/api/identityWorker.ts', import.meta.url), 'utf8');
    assert.ok(identitySource.includes("'admin.payments.list': adminControl('payments')"), 'frontière de contrôle sans persistance absente : l’état affiché serait faux');
    const entrySource = readFileSync(new URL('../backend/api/entry.ts', import.meta.url), 'utf8');
    assert.ok(entrySource.includes('...paymentHandlers,'), 'composition n’installe pas les handlers paiement');
    assert.ok(entrySource.includes('createSalaryConfirmationHandlers'), 'mécanisme OTP existant non retrouvé dans la composition');
  });

  check('ADM — P4C : écrans salaire — OTP non exposé, états distincts, aucune donnée simulée ni calcul monétaire', () => {
    const source = stripComments(readFileSync(new URL('./screens/salary.tsx', import.meta.url), 'utf8'));
    // Aucune donnée simulée, aucun appel réseau direct, aucune écriture navigateur.
    assert.ok(!/mock/i.test(source), 'référence mock interdite dans un écran livré');
    assert.ok(!/Math\.random/.test(source), 'aléatoire interdit : aucune valeur inventée');
    assert.ok(!/\bfetch\s*\(/.test(source), 'aucun appel réseau direct : passer par AdminApi');
    assert.ok(!/\/api\/v1/.test(source), 'aucun chemin d’API écrit dans l’écran');
    assert.ok(!/VITE_/.test(source), 'aucune lecture d’environnement dans l’écran');
    assert.ok(!/new Date\(\)/.test(source), 'aucune horloge locale injectée comme donnée métier');
    assert.ok(!/localStorage|sessionStorage/.test(source), 'aucune source de vérité de navigateur');
    assert.ok(source.includes("?? '—'"), 'le témoin d’absence « — » doit être utilisé');
    assert.ok(source.includes("from '../api'"), 'les écrans doivent importer AdminApi depuis api.ts');
    assert.ok(!/from '\.\.\/\.\.\/backend/.test(source), 'aucun import direct du backend par les écrans salaire');
    // Aucun secret ni mécanisme OTP n'est manipulé côté interface.
    assert.ok(!/otp_digest|confirm_key|request_key|body\.otp|padStart\(|nonce\s*:/.test(source), 'secret ou mécanisme OTP manipulé dans l’écran');
    assert.ok(!/verifyPayment|markPaymentPaid|rejectPayment|blockUser|decideReview/.test(source), 'aucune mutation n’appartient à cette tranche');
    // Distinctions obligatoires affichées (déclaration / vérification / PAID / confirmation).
    assert.ok(source.includes('ne vaut jamais vérification'), 'distinction déclaration/vérification non affichée');
    assert.ok(source.includes('VERIFIED ne vaut pas PAID'), 'distinction VERIFIED/PAID non affichée');
    assert.ok(source.includes('Non exposée par le DTO Payment'), 'confirmation du Candidat non dite');
    assert.ok(source.includes('n’est jamais assimilée à un paiement non effectué'), 'règle d’absence de confirmation non affichée');
    assert.ok(source.includes('BACKEND_GAP'), 'aucun repère BACKEND_GAP dans les écrans');
    // La fiche de preuve ne rend aucun formulaire (aucune commande serveur).
    const proofStart = source.indexOf('function SalaryProofReview');
    const proofSource = source.slice(proofStart);
    assert.ok(!/<form/.test(proofSource), 'ADM-24 ne rend aucun formulaire sans handler');
    assert.ok(!/NeoPressButton/.test(proofSource), 'ADM-24 ne propose aucune commande sans handler');
  });

  check('ADM — P4C : vocabulaire de la tranche et zones déclarées des deux fiches', () => {
    assert.equal(ADMIN_UI_TERMS.SALARY_CONFIRMATION_QUEUE, 'Confirmations de Salaire');
    assert.equal(ADMIN_UI_TERMS.SALARY_PROOF_REVIEW, 'Preuve de réception du Salaire');
    const adm23 = ADMIN_DESIGN_SCREENS.find((screen) => screen.code === 'ADM-23');
    const adm24 = ADMIN_DESIGN_SCREENS.find((screen) => screen.code === 'ADM-24');
    assert.deepEqual([...(adm23?.zoneKinds ?? [])].sort(), ['cta', 'kpi', 'list', 'table']);
    assert.deepEqual([...(adm24?.zoneKinds ?? [])].sort(), ['cta', 'hero', 'kpi', 'table']);
    assert.equal(adm23?.route, '/admin/salaire/confirmations');
    assert.equal(adm24?.route, '/admin/salaire/preuves/:id');
    // Les gaps déclarés couvrent les capacités réellement absentes.
    const gaps23 = ADMIN_UNIT_GAPS['ADM-23'] ?? [];
    const gaps24 = ADMIN_UNIT_GAPS['ADM-24'] ?? [];
    assert.ok(gaps23.length >= 4 && gaps24.length >= 4, 'au moins quatre lignes de gap par fiche');
    assert.ok(gaps23.some((line) => line.includes('/admin/salary/confirmations')), 'la route fiche ADM-23 déclarée absente doit être nommée');
    assert.ok(gaps24.some((line) => line.includes('/admin/salary/proofs/:id')), 'la route fiche ADM-24 déclarée absente doit être nommée');
    assert.deepEqual(forbiddenTermsIn(stripTechnicalTokens([...gaps23, ...gaps24].join(' | '))), [], 'gaps P4C : termes interdits dans les lignes affichées');
  });

  check('ADM — P4D : les cinq routes P0 sont résolues vers les unités exactes du Master', () => {
    const cases: readonly [string, string, string, Record<string, string>][] = [
      ['/admin/litiges', 'ADM-26', 'ADM-26', {}],
      ['/admin/litiges/clm-42', 'ADM-27', 'ADM-27', { id: 'clm-42' }],
      ['/admin/litiges/clm-42/pieces', 'ADM-28', 'ADM-27', { id: 'clm-42' }],
      ['/admin/litiges/clm-42/decision', 'ADM-29', 'ADM-29', { id: 'clm-42' }],
      ['/admin/litiges/decisions', 'ADM-30', 'ADM-29', {}],
    ];
    for (const [path, code, unitId, params] of cases) {
      const resolved = resolveAdminScreen(path);
      assert.equal(resolved?.code, code, `${path} → fiche`);
      assert.equal(resolved?.unitId, unitId, `${path} → unité Master`);
      assert.deepEqual(resolved?.params, params, `${path} → paramètres`);
      const route = resolveRoute(path);
      assert.equal(route.kind, 'shell', `${path} : shell`);
      if (route.kind === 'shell') {
        assert.equal(route.shell, 'ADMIN', `${path} : espace ADMIN`);
        assert.equal(route.unitId, unitId, `${path} : unité P0`);
      }
    }
    for (const path of [
      '/admin/litiges/clm-42/recuse',
      '/admin/litiges/clm-42/evidence',
      '/admin/litiges/clm-42/restrictions',
      '/admin/litiges/decisions/analytics',
      // `/admin/remplacements` n'est plus listé ici : la route est désormais
      // livrée par P4E-1 (unité ADM-31) et vérifiée dans le bloc P4E-1.
    ]) {
      assert.equal(resolveAdminScreen(path), null, `${path} : aucun écran non livré ne doit être créé`);
    }
    for (const unitId of ['ADM-26', 'ADM-27', 'ADM-29']) {
      const catalogUnit = ADMIN_DESIGN_UNITS.find((unit) => unit.id === unitId);
      const productionUnit = PRODUCTION_UNITS.find((unit) => unit.id === unitId);
      assert.ok(catalogUnit && productionUnit, `${unitId} : unité absente`);
      assert.deepEqual([...catalogUnit.routes].sort(), [...productionUnit.routes].sort(), `${unitId} : route identique au routeur P0`);
    }
  });

  check('ADM — P4D : types, statuts de Claim/justificatif et décisions sont ceux du serveur', () => {
    assert.deepEqual(Object.keys(CLAIM_TYPE_LABELS).sort(), [...CLAIM_TYPE_VALUES].sort());
    assert.deepEqual(Object.keys(CLAIM_STATUS_LABELS).sort(), [...CLAIM_STATUS_VALUES].sort());
    assert.deepEqual(Object.keys(CLAIM_EVIDENCE_TYPE_LABELS).sort(), [...CLAIM_EVIDENCE_TYPE_VALUES].sort());
    assert.deepEqual(Object.keys(CLAIM_EVIDENCE_STATUS_LABELS).sort(), [...CLAIM_EVIDENCE_STATUS_VALUES].sort());
    assert.deepEqual(ADMIN_CLAIM_DECISION_OPTIONS, ['RESOLVE', 'REJECT']);
    assert.deepEqual(Object.keys(CLAIM_DECISION_LABELS).sort(), ['REJECT', 'RESOLVE']);
    assert.ok(!('REPLACE' in CLAIM_DECISION_LABELS), 'REPLACE ne doit pas être proposé dans cette tranche');
    assert.equal(PRODUCT_LABELS.CLAIM.singular, 'Claim');
    assert.equal(ADMIN_UI_TERMS.CLAIM_REGISTRY, 'Claims');
  });

  check('ADM — P4D : handlers réels, permissions ADMIN, idempotence et audit vérifiés', () => {
    const route = (key: string) => API_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
    const routes = [
      ['admin.claims.list', 'GET', '/api/v1/admin/claims', 'incidents:read:any', false],
      ['admin.claims.read', 'GET', '/api/v1/admin/claims/:claimId', 'incidents:read:any', false],
      ['admin.claims.review', 'POST', '/api/v1/admin/claims/:claimId/review', 'incidents:arbitrate', true],
      ['admin.claims.evidence.request', 'POST', '/api/v1/admin/claims/:claimId/evidence-requests', 'incidents:arbitrate', true],
      ['admin.claims.decision', 'POST', '/api/v1/admin/claims/:claimId/decision', 'incidents:arbitrate', true],
    ] as const;
    for (const [key, method, path, permission, idempotent] of routes) {
      const contract = route(key);
      assert.ok(contract, `${key} absente du catalogue serveur`);
      assert.equal(contract.method, method, `${key} méthode réelle`);
      assert.equal(contract.path, path, `${key} chemin réel`);
      assert.equal(contract.scope, 'admin', `${key} portée ADMIN serveur`);
      assert.equal(contract.permission, permission, `${key} permission existante`);
      assert.equal(Boolean('idempotency' in contract && contract.idempotency), idempotent, `${key} idempotence`);
      if (idempotent) assert.equal('auditOnMutation' in contract && contract.auditOnMutation, true, `${key} audit serveur`);
      assert.ok(ADMIN_API_PATHS.includes(path), `${key} non utilisé par AdminApi`);
    }
    const apiSource = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
    const claimSource = readFileSync(new URL('./screens/claims.tsx', import.meta.url), 'utf8');
    const claimGaps = ['ADM-26', 'ADM-27', 'ADM-28', 'ADM-29', 'ADM-30'].flatMap((code) => ADMIN_UNIT_GAPS[code] ?? []).join(' ');
    assert.ok(!ADMIN_API_PATHS.some((path) => /admin\/claims\/:claimId\/restrictions/.test(path)), 'les handlers de restriction ne sont pas exposés par AdminApi');
    assert.ok(!apiSource.includes('applyClaimRestriction') && !apiSource.includes('releaseClaimRestriction'), 'les wrappers apply/release sont hors scope');
    assert.ok(!claimSource.includes('RestrictionControls') && !/CONTRACT_TERMINATE|restriction/i.test(claimSource), 'aucun contrôle de restriction ne doit apparaître dans l’écran');
    assert.ok(!/apply\/release des restrictions|restrictions? sont des commandes/i.test(claimGaps), 'les gaps P4D ne doivent pas présenter ces contrôles');
    assert.ok(apiSource.includes("'/api/v1/admin/claims/:claimId/decision'"), 'la commande de décision réelle doit rester exposée');
    const entrySource = readFileSync(new URL('../backend/api/entry.ts', import.meta.url), 'utf8');
    const repositorySource = readFileSync(new URL('../backend/disputes/claimRepository.ts', import.meta.url), 'utf8');
    assert.ok(entrySource.includes('...claimHandlers,'), 'les handlers Claim doivent être branchés dans le Worker réel');
    assert.ok(repositorySource.includes("'admin.claims.list': async context => repository.listAdmin"), 'la file doit appeler listAdmin réel');
    assert.ok(repositorySource.includes("'admin.claims.read': async context => repository.getAdmin"), 'la fiche doit appeler getAdmin réel');
    for (const key of ['admin.claims.review', 'admin.claims.evidence.request', 'admin.claims.decision']) {
      assert.ok(repositorySource.includes(`'${key}': async context =>`), `${key} handler réel absent`);
    }
    assert.ok(!ADMIN_API_PATHS.some((path) => path.startsWith('/api/v1/claims/')), 'aucune route réservée aux parties n’est détournée');
  });

  await checkAsync('ADM — P4D : appels AdminApi utilisent les routes exactes et des clés d’idempotence', async () => {
    const calls: { path: string; options?: Record<string, unknown> }[] = [];
    const client = {
      request: async (path: string, options?: Record<string, unknown>) => {
        calls.push({ path, options });
        return path === '/admin/claims'
          ? { items: [], hasMore: false, cursor: null }
          : { claimId: 'clm-42', evidenceRequests: [], status: 'ADMIN_REVIEW' };
      },
    };
    const api = new AdminApi(client as never);
    await api.claims({ limit: 100 });
    await api.claim('clm/a');
    await api.reviewClaim('clm/a', 'note', undefined, 'review-key');
    await api.requestClaimEvidence('clm/a', { requestedType: 'PAYMENT_PROOF', requestedFrom: 'usr-1' }, undefined, 'evidence-key');
    await api.decideClaim('clm/a', { decision: 'RESOLVE', resolution: 'Motif serveur' }, undefined, 'decision-key');
    assert.deepEqual(calls.map(({ path }) => path), [
      '/admin/claims',
      '/admin/claims/clm%2Fa',
      '/admin/claims/clm%2Fa/review',
      '/admin/claims/clm%2Fa/evidence-requests',
      '/admin/claims/clm%2Fa/decision',
    ]);
    assert.deepEqual(calls[0].options?.query, { limit: 100, cursor: null });
    assert.equal(calls[2].options?.method, 'POST');
    assert.deepEqual(calls[2].options?.body, { note: 'note' });
    assert.equal(calls[2].options?.idempotencyKey, 'review-key');
    assert.deepEqual(calls[3].options?.body, { requestedType: 'PAYMENT_PROOF', requestedFrom: 'usr-1' });
    assert.equal(calls[3].options?.idempotencyKey, 'evidence-key');
    assert.deepEqual(calls[4].options?.body, { decision: 'RESOLVE', resolution: 'Motif serveur' });
    assert.equal(calls[4].options?.idempotencyKey, 'decision-key');
  });

  check('ADM — P4D : aucun champ sensible/référence de preuve n’est rendu et les gaps restent explicites', () => {
    const source = readFileSync(new URL('./screens/claims.tsx', import.meta.url), 'utf8');
    const claimGaps = ['ADM-26', 'ADM-27', 'ADM-28', 'ADM-29', 'ADM-30'].flatMap((code) => ADMIN_UNIT_GAPS[code] ?? []).join(' ');
    assert.ok(source.includes('claim.evidenceReference ?'), 'présence de référence initiale rendue uniquement comme booléen');
    assert.ok(source.includes('request.evidenceReference ?'), 'présence de référence soumise rendue uniquement comme booléen');
    for (const secretField of ['claim.metadata', 'claim.salaryConfirmationId', 'claim.idempotencyKey', 'claim.evidenceReference}', 'request.evidenceReference}']) {
      assert.ok(!source.includes(secretField), `${secretField} ne doit pas être affiché brut`);
    }
    assert.ok(source.includes('Les champs techniques `metadata`, `idempotencyKey`, `salaryConfirmationId`'), 'les champs omis doivent être explicités');
    assert.ok(source.includes('aucun contenu de Document n’est consulté'), 'aucun accès Document ne doit être affiché');
    for (const code of ['ADM-26', 'ADM-27', 'ADM-28', 'ADM-29', 'ADM-30']) {
      assert.ok((ADMIN_UNIT_GAPS[code] ?? []).length > 0, `${code} doit conserver son BACKEND_GAP exact`);
    }
    assert.deepEqual(forbiddenTermsIn(stripTechnicalTokens(claimGaps)), [], 'vocabulaire de gap P4D');
  });


  /* ── P4E-1-DESIGN-ADMIN-REPLACEMENTS ── */

  const REPLACEMENT_CODES = ['ADM-31', 'ADM-32', 'ADM-33'] as const;

  check('ADM — P4E-1 : les trois routes P0 sont résolues vers l’unité exacte du Master et rendues par leur écran', () => {
    const cases: readonly [string, string, Record<string, string>][] = [
      ['/admin/remplacements', 'ADM-31', {}],
      ['/admin/remplacements/rpl-42', 'ADM-32', { id: 'rpl-42' }],
      ['/admin/remplacements/rpl-42/arbitrage', 'ADM-33', { id: 'rpl-42' }],
    ];
    for (const [path, code, params] of cases) {
      const resolved = resolveAdminScreen(path);
      assert.equal(resolved?.code, code, `${path} → fiche`);
      assert.equal(resolved?.unitId, 'ADM-31', `${path} → unité Master`);
      assert.deepEqual(resolved?.params, params, `${path} → paramètres`);
      const route = resolveRoute(path);
      assert.equal(route.kind, 'shell', `${path} : shell`);
      if (route.kind === 'shell') {
        assert.equal(route.shell, 'ADMIN', `${path} : espace ADMIN`);
        assert.equal(route.unitId, 'ADM-31', `${path} : unité P0`);
      }
      assert.ok(ADMIN_SCREEN_COMPONENTS[code], `${code} : écran absent du registre`);
    }
    // Capacités du design absentes du produit : aucune route de fiche n'est inventée.
    const replacementRoutes = ADMIN_DESIGN_SCREENS.filter((screen) => screen.route.startsWith('/admin/remplacements')).map((screen) => screen.route);
    assert.deepEqual(replacementRoutes, ['/admin/remplacements', '/admin/remplacements/:id', '/admin/remplacements/:id/arbitrage']);
    assert.ok(!replacementRoutes.some((route) => /reassign|stats|intervene|full|preview/.test(route)), 'aucune route inventée');
    const catalogUnit = ADMIN_DESIGN_UNITS.find((unit) => unit.id === 'ADM-31');
    const productionUnit = PRODUCTION_UNITS.find((unit) => unit.id === 'ADM-31');
    assert.ok(catalogUnit && productionUnit, 'ADM-31 : unité absente');
    assert.deepEqual([...catalogUnit.routes].sort(), [...productionUnit.routes].sort(), 'ADM-31 : routes identiques au routeur P0');
    assert.deepEqual(ADMIN_DESIGN_SCREENS.find((screen) => screen.code === 'ADM-32')?.variantOf, 'ADM-31');
    const dock = DOCK_DEFINITIONS.ADM.map((item) => item.href);
    assert.ok(!dock.some((href) => href.startsWith('/admin/remplacements')), 'le dock ADM n’est pas modifié par P4E-1');
  });

  check('ADM — P4E-1 : handlers ADMIN réels en lecture seule, permissions serveur, aucune commande appelée', () => {
    const route = (key: string) => API_ROUTE_CONTRACTS.find((candidate) => candidate.key === key);
    const reads = [
      ['admin.replacements.list', '/api/v1/admin/replacements', 'replacements:read:any'],
      ['admin.replacements.read', '/api/v1/admin/replacements/:replacementId', 'replacements:read:any'],
      ['admin.proposals.list', '/api/v1/admin/proposals', 'applications:read:any'],
    ] as const;
    for (const [key, path, permission] of reads) {
      const contract = route(key);
      assert.ok(contract, `${key} absente du catalogue serveur`);
      assert.equal(contract.method, 'GET', `${key} lecture`);
      assert.equal(contract.path, path, `${key} chemin réel`);
      assert.equal(contract.scope, 'admin', `${key} portée ADMIN`);
      assert.equal(contract.permission, permission, `${key} permission existante`);
      assert.ok(ADMIN_PERMISSIONS.includes(permission as never), `${permission} doit appartenir au rôle ADMIN`);
      assert.ok(ADMIN_API_PATHS.includes(path), `${key} non utilisé par AdminApi`);
    }
    const repositorySource = readFileSync(new URL('../backend/replacements/replacementRepository.ts', import.meta.url), 'utf8');
    const proposalSource = readFileSync(new URL('../backend/repositories/proposalRepository.ts', import.meta.url), 'utf8');
    assert.ok(repositorySource.includes("'admin.replacements.list': async context => repository.listAdmin"), 'la file appelle listAdmin réel');
    assert.ok(repositorySource.includes("'admin.replacements.read': async context => repository.get"), 'le dossier appelle get réel');
    assert.ok(repositorySource.includes("Permission replacements:read:any requise."), 'la permission est revérifiée par le repository');
    assert.ok(proposalSource.includes("'admin.proposals.list': async context => repository.getAdminProposals"), 'Propositions ADMIN : handler réel');
    // Les commandes historiques restent sans handler et ne sont jamais appelées.
    for (const key of ['admin.replacements.assign', 'admin.replacements.transfer', 'admin.replacements.finalize']) {
      assert.ok(route(key), `${key} reste déclarée au catalogue (inchangé)`);
      assert.ok(!repositorySource.includes(`'${key}'`), `${key} ne doit pas avoir de handler`);
      assert.ok(!ADMIN_API_PATHS.includes(route(key)!.path), `${key} ne doit pas être exposée par AdminApi`);
    }
    const apiSource = stripComments(readFileSync(new URL('./api.ts', import.meta.url), 'utf8'));
    const screenSource = stripComments(readFileSync(new URL('./screens/replacements.tsx', import.meta.url), 'utf8'));
    for (const forbidden of [/\/assign\b/, /\/transfer\b/, /\/finalize\b/, /\/reassign\b/, /\/intervene\b/, /\/arbitrate\b/]) {
      assert.ok(!forbidden.test(apiSource), `AdminApi ne doit pas appeler ${forbidden}`);
      assert.ok(!forbidden.test(screenSource), `l’écran ne doit pas appeler ${forbidden}`);
    }
    for (const call of ['decideClaim', 'reviewClaim', 'requestClaimEvidence', 'newIdempotencyKey', 'idempotencyKey', 'method:', "'POST'", 'createOffer', 'offer.create', '/replacements/:replacementId/offer']) {
      assert.ok(!screenSource.includes(call), `aucune commande dans replacements.tsx (${call})`);
    }
    assert.ok(!/<form\b|onSubmit/.test(screenSource), 'aucun formulaire de commande dans les écrans Remplacement');
    assert.ok(!ADMIN_API_PATHS.some((path) => path.startsWith('/api/v1/replacements')), 'aucune route Employeur/Candidat de Remplacement n’est détournée');
    assert.equal(REPLACEMENT_READ_PERMISSION, 'replacements:read:any');
  });

  await checkAsync('ADM — P4E-1 : appels AdminApi exacts (curseur, encodage), aucune clé d’idempotence', async () => {
    const calls: { path: string; options?: Record<string, unknown> }[] = [];
    const client = {
      request: async (path: string, options?: Record<string, unknown>) => {
        calls.push({ path, options });
        return path.startsWith('/admin/replacements/') ? { id: 'rpl/a', status: 'PENDING_OFFER' } : { items: [], hasMore: false, cursor: null };
      },
    };
    const api = new AdminApi(client as never);
    await api.replacements({ limit: 100 });
    await api.replacements({ limit: 100, cursor: 'rpl-9' });
    await api.replacement('rpl/a');
    await api.proposals({ limit: 100 });
    assert.deepEqual(calls.map(({ path }) => path), ['/admin/replacements', '/admin/replacements', '/admin/replacements/rpl%2Fa', '/admin/proposals']);
    assert.deepEqual(calls[0].options?.query, { limit: 100, cursor: null });
    assert.deepEqual(calls[1].options?.query, { limit: 100, cursor: 'rpl-9' });
    for (const call of calls) {
      assert.equal(call.options?.method ?? 'GET', 'GET', `${call.path} : lecture uniquement`);
      assert.equal(call.options?.idempotencyKey, undefined, `${call.path} : aucune commande`);
      assert.equal(call.options?.body, undefined, `${call.path} : aucun corps`);
    }
  });

  check('ADM — P4E-1 : statuts de Remplacement et de Proposition en parité exacte avec le serveur', () => {
    assert.deepEqual(Object.keys(REPLACEMENT_STATUS_LABELS).sort(), [...REPLACEMENT_STATUS_VALUES].sort());
    assert.deepEqual(Object.keys(REPLACEMENT_STATUS_TONES).sort(), [...REPLACEMENT_STATUS_VALUES].sort());
    assert.deepEqual(Object.keys(REPLACEMENT_NEXT_STEP).sort(), [...REPLACEMENT_STATUS_VALUES].sort());
    // Parité lue dans la source serveur (aucun import d'exécution de la persistance hors Worker).
    const coreRecordsSource = readFileSync(new URL('../backend/persistence/coreRecords.ts', import.meta.url), 'utf8');
    const proposalBlock = coreRecordsSource.match(/export const PROPOSAL_STATUS_VALUES = \[([\s\S]*?)\]/);
    assert.ok(proposalBlock, 'PROPOSAL_STATUS_VALUES introuvable côté serveur');
    const PROPOSAL_STATUS_VALUES = [...proposalBlock[1].matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
    assert.equal(PROPOSAL_STATUS_VALUES.length, 6, 'six statuts réels de Proposition');
    assert.deepEqual(Object.keys(PROPOSAL_STATUS_LABELS).sort(), [...PROPOSAL_STATUS_VALUES].sort());
    assert.deepEqual(Object.keys(PROPOSAL_STATUS_TONES).sort(), [...PROPOSAL_STATUS_VALUES].sort());
    assert.notEqual(PROPOSAL_STATUS_LABELS.SENT, PROPOSAL_STATUS_LABELS.ACCEPTED, 'Proposition envoyée ≠ acceptée');
    assert.ok(!/accept/i.test(PROPOSAL_STATUS_LABELS.SENT), 'SENT ne doit pas évoquer une acceptation');
    assert.ok(/Candidat/.test(PROPOSAL_STATUS_LABELS.ACCEPTED), 'ACCEPTED = réponse explicite du Candidat');
    assert.ok(!/actif/i.test(REPLACEMENT_STATUS_LABELS.CONTRACT_FINALIZED), 'CONTRACT_FINALIZED ≠ Contrat actif');
    assert.equal(CONTRACT_STATUS_LABELS.REPLACED, 'Remplacé');
    assert.equal(PRODUCT_LABELS.REPLACEMENT.singular, 'Remplacement');
    assert.equal(ADMIN_UI_TERMS.REPLACEMENT_REGISTRY, 'Remplacements');
    for (const status of REPLACEMENT_STATUS_VALUES) {
      assert.deepEqual(forbiddenTermsIn(`${REPLACEMENT_STATUS_LABELS[status]} ${REPLACEMENT_NEXT_STEP[status]}`), [], `${status} : vocabulaire officiel`);
      assert.ok(!/ADMIN/.test(REPLACEMENT_NEXT_STEP[status]), `${status} : aucune étape suivante attribuée à l’ADMIN`);
    }
  });

  check('ADM — P4E-1 : déroulé construit depuis le dossier réel (envoyée ≠ acceptée, DRAFT ≠ actif, aucune date inventée)', () => {
    const base: ReplacementDossier = {
      id: 'rpl-1', incidentId: 'clm-1', claimId: 'clm-1', originalContractId: 'ctr-1', employerId: 'usr-e', employerName: 'Employeur',
      status: 'PENDING_OFFER', openedAt: '2026-10-01T10:00:00.000Z', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
    };
    const done = (dossier: ReplacementDossier, successor: Contract | null = null) => replacementWorkflowSteps(dossier, successor).map((step) => step.done);
    assert.deepEqual(done(base), [true, true, false, false, false, false, false, false], 'PENDING_OFFER : seules ouverture et REPLACED');
    const sourcing = { ...base, status: 'SOURCING_CANDIDATES' as const, urgentOfferId: 'off-1', urgentOfferTitle: 'Offre' };
    assert.deepEqual(done(sourcing), [true, true, true, false, false, false, false, false]);
    const sent = { ...sourcing, status: 'CANDIDATE_SELECTED' as const, selectedApplicationId: 'app-1', selectedCandidateId: 'usr-c', selectedProposalId: 'prop-1' };
    assert.deepEqual(done(sent), [true, true, true, true, true, false, false, false], 'Proposition envoyée : pas d’acceptation déduite');
    const accepted = { ...sent, status: 'TRANSFERRED_TO_EMPLOYER' as const };
    assert.deepEqual(done(accepted), [true, true, true, true, true, true, false, false]);
    const finalized = { ...accepted, status: 'CONTRACT_FINALIZED' as const, newContractId: 'ctr-2' };
    const draft = { id: 'ctr-2', status: 'DRAFT' } as Contract;
    const active = { id: 'ctr-2', status: 'ACTIVE' } as Contract;
    assert.deepEqual(done(finalized, draft), [true, true, true, true, true, true, true, false], 'Contrat successeur DRAFT ≠ actif');
    assert.deepEqual(done(finalized, null), [true, true, true, true, true, true, true, false], 'statut du successeur non lu : jamais actif');
    assert.deepEqual(done(finalized, active), [true, true, true, true, true, true, true, true]);
    const steps = replacementWorkflowSteps(finalized, draft);
    const datedSteps = steps.filter((step) => /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(step.detail ?? ''));
    assert.equal(datedSteps.length, 1, 'seule l’ouverture du dossier porte une date (renvoyée par le serveur)');
    assert.deepEqual(forbiddenTermsIn(steps.map((step) => `${step.label} ${step.detail ?? ''}`).join(' ')), []);
  });

  check('ADM — P4E-1 : aucun transfert, total ou calcul de Paiement ; aucune donnée simulée ; champs techniques non affichés', () => {
    const source = stripComments(readFileSync(new URL('./screens/replacements.tsx', import.meta.url), 'utf8'));
    assert.ok(!/\.reduce\(|(?<!\p{L})sum(?!\p{L})|total\s*[:=+]|\+=/u.test(source), 'aucun total ni cumul de Paiement');
    assert.ok(!/payment\.amount\s*[-+*/]/.test(source), 'aucun calcul monétaire');
    assert.ok(source.includes('payment.contractId === contractId'), 'les Paiements sont filtrés par Contrat, jamais fusionnés');
    assert.ok(source.includes('data-no-payment-transfer="true"'), 'l’absence de transfert de Paiement est affichée');
    for (const field of ['idempotencyKey', 'metadata', 'payload', 'objectKey', 'secret', 'token', 'password']) {
      assert.ok(!source.includes(field), `${field} ne doit pas être lu par l’écran`);
    }
    for (const fake of ['Math.random', 'faker', 'mock', 'demo', 'sample', 'lorem']) {
      assert.ok(!source.toLowerCase().includes(fake.toLowerCase()), `aucune donnée simulée (${fake})`);
    }
    assert.ok(!/Date\.now\(|new Date\(\)/.test(source), 'aucune ancienneté ni échéance calculée dans le navigateur');
    for (const permission of ['replacements:read:any', 'incidents:read:any', 'contracts:read:any', 'applications:read:any', 'payments:read:any']) {
      assert.ok(source.includes(`'${permission}'`), `permission ${permission} vérifiée côté interface`);
    }
    assert.ok(source.includes('<SystemFeedback state="403" />'), 'accès refusé : état SYS 403');
    assert.ok(source.includes("'not-configured'"), 'frontière de contrôle sans persistance affichée honnêtement');
    assert.ok(source.includes('Hors page chargée'), 'un Contrat hors page n’est jamais relu par une route de partie');
    assert.ok(!/api\.contract\(|contracts\.read|\/api\/v1\/contracts\//.test(source), 'aucune route de partie Contrat détournée');
  });

  check('ADM — P4E-1 : vocabulaire officiel et BACKEND_GAP explicites pour chaque fiche', () => {
    const source = readFileSync(new URL('./screens/replacements.tsx', import.meta.url), 'utf8');
    const displayed = displayStringsIn(stripComments(source)).join(' ');
    assert.deepEqual(forbiddenTermsIn(displayed), [], 'aucun terme du Master non officiel affiché');
    for (const label of FORBIDDEN_FINANCE_LABELS) assert.ok(!displayed.includes(label), `libellé financier interdit : ${label}`);
    for (const code of REPLACEMENT_CODES) {
      const gaps = ADMIN_UNIT_GAPS[code] ?? [];
      assert.ok(gaps.length > 0, `${code} doit déclarer son BACKEND_GAP`);
      assert.deepEqual(forbiddenTermsIn(stripTechnicalTokens(gaps.join(' '))), [], `${code} : vocabulaire de gap`);
      for (const label of FORBIDDEN_FINANCE_LABELS) assert.ok(!gaps.join(' ').includes(label), `${code} : libellé financier interdit`);
    }
    const allGaps = REPLACEMENT_CODES.flatMap((code) => ADMIN_UNIT_GAPS[code] ?? []).join(' ');
    for (const capability of ['/admin/replacements/stats', '/admin/replacements/:id/reassign', '/admin/replacements/:id/full', '/admin/replacements/:id/intervene', '/admin/replacements/:id/arbitrate']) {
      assert.ok(allGaps.includes(capability), `capacité absente non déclarée : ${capability}`);
      const declared = API_ROUTE_CONTRACTS.some((contract) => contract.path === `/api/v1${capability.replace(':id', ':replacementId')}`);
      assert.equal(declared, false, `${capability} ne doit pas exister au catalogue serveur`);
    }
    assert.ok(/assign[\s\S]*transfer[\s\S]*finalize/.test(allGaps), 'commandes sans handler déclarées');
    assert.ok(adminGapsFor('ADM-31', '/admin/remplacements/rpl-1/arbitrage').some((line) => line.startsWith('ADM-33')), 'les gaps ADM-33 sont servis sur sa route');
  });

  return results;
}
