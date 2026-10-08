/**
 * P2-DESIGN-EMPLOYER — tests de la tranche employeur.
 *
 * Couverture :
 *  1. parité du catalogue généré avec la source de design (Python) ;
 *  2. résolution de route : chaque fiche EMP est atteignable et rattachée à son unité ;
 *  3. registre complet (32 unités / 60 fiches) ;
 *  4. API : chaque chemin appelé existe déjà dans `routeContracts.ts` ;
 *  5. GARDE-FOU DE VOCABULAIRE : aucun libellé métier du Master Design
 *     (Mission, Client, Prestataire, Litige) ne peut entrer dans l'interface ;
 *  6. DÉCISION FINANCE : aucun libellé du triplet financier interdit ;
 *  7. états d'interface réels (chargement, indisponible, gap, vide) et attributs
 *     d'inspection (`data-unit`, `data-screen`, `data-zone`, `data-backend-gap`) ;
 *  8. charge utile d'offre : uniquement des champs acceptés par le serveur ;
 *  9. intégration : EMP = PARTIEL, PRE/ADM/FIN inchangés.
 */

import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { EMPLOYER_DESIGN_SCREENS, EMPLOYER_DESIGN_UNITS } from './catalog';
import { EMPLOYER_UNIT_GAPS } from './gaps';
import { employerGapsFor, resolveEmployerScreen, unitForScreen } from './screenMap';
import { EMPLOYER_SCREEN_COMPONENTS, EmployerScreen } from './registry';
import { EmployerRouteFallback } from './RouteFallback';
import { DOCK_DEFINITIONS } from '../design-system/shells/shellNavigation';
import { deliveredScreensForUnit } from './screenMap';
import { EMPLOYER_API_PATHS } from './api';
import { DESIGN_ONLY_TERMS_NOT_RENDERED, PRODUCT_LABELS } from './vocabulary';
import { employerError } from './errors';
import { notificationDomain } from './screens/overview';
import { toOfferDraft, EMPTY_OFFER_DRAFT } from './draft';
import { API_ROUTE_CONTRACTS } from '../backend/api/routeContracts';
import { resolveRoute } from '../routing/resolveRoute';
import { EMPLOYER_UNIT_IDS, integrationStatus, isEmployerUnit } from '../routing/integration';
import { PRODUCTION_UNITS } from '../design-system/generated/productionUnits';
import { ApiClientError } from '../repositories/apiClient';
import type { NotificationView } from './api';

const EMPLOYER_SCREEN_DIR = new URL('./screens/', import.meta.url);

/* ── Utilitaires d'inspection ── */

/** Chemin concret d'un motif de fiche (`:id` → valeur d'exemple). */
function samplePath(pattern: string): string {
  return pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? (segment === ':v' ? 'v2' : 'ref-1') : segment))
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

/** Retire chemins, URL, sélecteurs et identifiants techniques d'un texte. */
function stripTechnicalTokens(text: string): string {
  return text.replace(/[A-Za-z0-9_@?&=%./:[\]{}#-]*\/[A-Za-z0-9_@?&=%./:[\]{}#-]*/g, ' ');
}

/**
 * Chaînes réellement affichables d'un fichier : le texte JSX (`>texte<`) et les
 * littéraux des propriétés d'affichage (title, lede, label, placeholder…).
 * Les comparaisons techniques (`screen.includes('litige')`, slugs serveur,
 * chemins) ne sont pas du texte affiché : elles ne doivent pas être confondues
 * avec un libellé métier.
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

/** Champs d'une offre que le serveur possède et que le client ne doit jamais envoyer. */
const SERVER_OWNED_OFFER_FIELDS = ['id', 'employerId', 'employerName', 'employerPublicId', 'employerLocation', 'postedDate', 'status', 'compatibilityScore', 'currency' /* autorisé */];

export async function runEmployerTests(): Promise<{ name: string; success: boolean; detail?: string }[]> {
  const results: { name: string; success: boolean; detail?: string }[] = [];
  const check = (name: string, run: () => unknown) => {
    try {
      run();
      results.push({ name, success: true });
    } catch (error) {
      results.push({ name, success: false, detail: String(error) });
    }
  };

  check('EMP — catalogue généré identique à la source de design (python --check)', () => {
    execFileSync('python3', ['scripts/design/generate-employer-catalog.py', '--check']);
  });

  check('EMP — 32 unités / 60 fiches, chaque fiche rattachée à une seule unité', () => {
    assert.equal(EMPLOYER_DESIGN_UNITS.length, 32);
    assert.equal(EMPLOYER_DESIGN_SCREENS.length, 60);
    const codes = EMPLOYER_DESIGN_SCREENS.map((screen) => screen.code);
    assert.equal(new Set(codes).size, 60);
    for (const screen of EMPLOYER_DESIGN_SCREENS) {
      const unit = unitForScreen(screen.code);
      assert.ok(unit, `fiche sans unité : ${screen.code}`);
      const parent = EMPLOYER_DESIGN_UNITS.find((candidate) => candidate.id === unit);
      assert.ok((parent?.screenCodes as readonly string[] | undefined)?.includes(screen.code), `fiche ${screen.code} absente des fiches de ${unit}`);
    }
  });

  check('EMP — chaque route de fiche est résolue par le routeur P0 vers son unité', () => {
    for (const screen of EMPLOYER_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell', `route non shell : ${path}`);
      if (resolved.kind !== 'shell') continue;
      assert.equal(resolved.notFound, false, `route non résolue : ${path}`);
      assert.equal(resolved.shell, 'CLIENT', `shell attendu CLIENT : ${path}`);
      assert.equal(resolved.unitId, unitForScreen(screen.code), `unité inattendue pour ${path}`);
    }
    const index = resolveRoute('/client');
    assert.equal(index.kind === 'shell' && index.unitId, 'EMP-01', 'l’index /client doit être le tableau de bord EMP-01');
  });

  check('EMP — registre complet : les 60 fiches ont un écran, aucun code inconnu', () => {
    const registered = Object.keys(EMPLOYER_SCREEN_COMPONENTS).sort();
    const expected = EMPLOYER_DESIGN_SCREENS.map((screen) => screen.code).sort();
    assert.deepEqual(registered, expected);
  });

  check('EMP — chaque fiche déclare ses capacités absentes (BACKEND_GAP) et la résolution les renvoie', () => {
    for (const screen of EMPLOYER_DESIGN_SCREENS) {
      assert.ok((EMPLOYER_UNIT_GAPS[screen.code] ?? []).length > 0, `aucun BACKEND_GAP déclaré pour ${screen.code}`);
    }
    const gaps = employerGapsFor('EMP-59', '/client/contrats/ref-1/successeur');
    assert.ok(gaps.some((line) => line.includes('EMP-59')), 'les gaps de l’unité doivent être inclus');
    assert.ok(gaps.some((line) => line.includes('EMP-60')), 'les gaps de la fiche réellement atteinte doivent être inclus');
  });

  check('EMP — API : tout chemin appelé existe déjà dans routeContracts.ts (aucune route créée)', () => {
    const normalize = (path: string) => path.replace(/:[A-Za-z]+/g, ':param');
    const declared = new Set(API_ROUTE_CONTRACTS.map((route) => normalize(route.path)));
    assert.ok(EMPLOYER_API_PATHS.length >= 30, `trop peu de chemins vérifiés : ${EMPLOYER_API_PATHS.length}`);
    for (const path of EMPLOYER_API_PATHS) {
      assert.ok(declared.has(normalize(path)), `route inconnue du produit : ${path}`);
    }
  });

  check('EMP — GARDE-FOU vocabulaire : aucun terme du Master Design ne désigne un concept produit dans l’interface', () => {
    const files = [
      ...readdirSync(EMPLOYER_SCREEN_DIR).map((name) => new URL(name, EMPLOYER_SCREEN_DIR)),
      new URL('./components.tsx', import.meta.url),
      new URL('./gaps.ts', import.meta.url),
      new URL('./registry.tsx', import.meta.url),
      new URL('./UnitBoundary.tsx', import.meta.url),
      new URL('./RouteFallback.tsx', import.meta.url),
      new URL('./draft.ts', import.meta.url),
    ];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      const found = forbiddenTermsIn(displayStringsIn(source).join(' | '));
      assert.deepEqual(found, [], `${file.pathname} affiche des termes interdits : ${found.join(', ')}`);
    }
    // vocabulary.ts : les termes n'existent que dans le tableau des termes interdits.
    const vocabulary = readFileSync(new URL('./vocabulary.ts', import.meta.url), 'utf8');
    const body = stripComments(vocabulary);
    const listStart = body.indexOf('DESIGN_ONLY_TERMS_NOT_RENDERED');
    const listEnd = body.indexOf('] as const;', listStart);
    const outsideList = stripTechnicalTokens(body.slice(0, listStart) + body.slice(listEnd));
    assert.deepEqual(forbiddenTermsIn(outsideList), [], 'vocabulary.ts : termes interdits hors du tableau de référence');
    assert.ok(DESIGN_ONLY_TERMS_NOT_RENDERED.includes('Mission' as never) && DESIGN_ONLY_TERMS_NOT_RENDERED.includes('Prestataire' as never), 'le tableau de référence doit lister les termes');
  });

  check('EMP — décision FINANCE : aucun libellé du triplet financier interdit n’entre dans le code de la tranche', () => {
    const files = [
      ...readdirSync(EMPLOYER_SCREEN_DIR).map((name) => new URL(name, EMPLOYER_SCREEN_DIR)),
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

  check('EMP — rendu réel : chaque fiche rend son conteneur, son état « source non configurée » et son BACKEND_GAP', () => {
    for (const screen of EMPLOYER_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell');
      if (resolved.kind !== 'shell' || !resolved.unitId) continue;
      const html = renderToStaticMarkup(
        <>{EmployerScreen({ unitId: resolved.unitId, pathname: resolved.pathname, segments: resolved.segments })}</>,
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

  check('EMP — unités d’inspection : data-zone par genre de zone et primitives d’état accessibles', () => {
    const allowedKinds = new Set(EMPLOYER_DESIGN_SCREENS.flatMap((screen) => screen.zoneKinds as readonly string[]));
    assert.ok(allowedKinds.has('hero'), 'le catalogue doit déclarer des zones héro');
    assert.ok(!allowedKinds.has('media'), 'aucune zone média ne doit exister dans le catalogue');
    for (const screen of EMPLOYER_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell', `route non shell : ${path}`);
      if (resolved.kind !== 'shell' || !resolved.unitId) continue;
      const html = renderToStaticMarkup(
        <>{EmployerScreen({ unitId: resolved.unitId, pathname: resolved.pathname, segments: resolved.segments })}</>,
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

  check('EMP — dock employeur : chaque onglet mène à une fiche livrée ou à la page de repli honnête', () => {
    const dockItems = DOCK_DEFINITIONS.EMP;
    assert.equal(dockItems.length, 5, 'le dock EMP compte cinq onglets');
    for (const item of dockItems) {
      const resolved = resolveRoute(item.href);
      assert.equal(resolved.kind, 'shell', `onglet non résolu : ${item.href}`);
      if (resolved.kind !== 'shell') continue;
      assert.equal(resolved.namespace, 'client', `onglet hors espace employeur : ${item.href}`);
      assert.equal(resolved.notFound, false, `onglet 404 : ${item.href}`);
      const screen = resolveEmployerScreen(resolved.pathname);
      if (screen) {
        assert.ok(EMPLOYER_SCREEN_COMPONENTS[screen.code], `onglet sans écran : ${item.href}`);
        continue;
      }
      assert.ok(resolved.unitId, `onglet sans unité ni fiche : ${item.href}`);
    }
  });

  check('EMP — chemin sans fiche : page de repli honnête, routes livrées listées, libellé du design jamais rendu', () => {
    const cases: readonly { unitId: string; pathname: string }[] = [
      { unitId: 'EMP-29', pathname: '/client/contrats' },
      { unitId: 'EMP-49', pathname: '/client/litiges' },
    ];
    for (const item of cases) {
      assert.equal(resolveEmployerScreen(item.pathname), null, `${item.pathname} ne doit correspondre à aucune fiche`);
      // Le chemin est bien rattaché à l'unité par le routeur réel.
      const resolved = resolveRoute(item.pathname);
      assert.equal(resolved.kind === 'shell' ? resolved.unitId : null, item.unitId, `unité inattendue pour ${item.pathname}`);
      const html = renderToStaticMarkup(<>{EmployerRouteFallback({ unitId: item.unitId, pathname: item.pathname })}</>);
      assert.ok(html.includes('data-route-fallback="true"'), `${item.pathname} : page de repli absente`);
      assert.ok(html.includes('Aucun écran livré'), `${item.pathname} : absence de fiche non dite`);
      assert.ok(html.includes(item.unitId), `${item.pathname} : unité non nommée`);
      assert.ok(html.includes('data-backend-gap="true"'), `${item.pathname} : BACKEND_GAP absent`);
      const delivered = deliveredScreensForUnit(item.unitId);
      assert.ok(delivered.length > 0, `${item.unitId} : aucune route livrée`);
      for (const screen of delivered) {
        assert.ok(html.includes(screen.route), `${item.pathname} : route livrée absente (${screen.route})`);
      }
      // Le libellé de l'unité vient du Master Design : il ne doit jamais être rendu.
      const unitLabel = PRODUCTION_UNITS.find((unit) => unit.id === item.unitId)?.label ?? '';
      assert.ok(unitLabel.length > 0, `${item.unitId} : libellé introuvable`);
      assert.ok(!html.includes(unitLabel), `${item.pathname} : libellé du Master Design rendu à l’écran`);
      const text = html.replace(/<[^>]*>/g, ' ');
      assert.deepEqual(forbiddenTermsIn(text), [], `${item.pathname} : terme interdit rendu`);
    }
  });

  check('EMP — intégration : 32 unités EMP PARTIEL, ADM/FIN/RTC inchangés (PRE livré en P3)', () => {
    assert.equal(EMPLOYER_UNIT_IDS.length, 32);
    for (const unitId of EMPLOYER_UNIT_IDS) {
      assert.equal(integrationStatus(unitId), 'PARTIEL', `${unitId} doit être PARTIEL`);
      assert.ok(isEmployerUnit(unitId), `${unitId} doit être reconnue comme unité EMP`);
    }
    for (const unit of PRODUCTION_UNITS) {
      // P3-DESIGN-PRESTATAIRE a livré les 26 unités PRE depuis cette tranche EMP :
      // elles sont PARTIEL, comme PUB/SYS/EMP. Seules ADM/FIN/RTC restent non intégrées.
      if (unit.family === 'EMP' || unit.family === 'PUB' || unit.family === 'SYS' || unit.family === 'PRE') continue;
      assert.equal(integrationStatus(unit.id), 'NON_INTEGRE', `${unit.id} ne doit pas être touchée par cette tranche`);
    }
    assert.equal(isEmployerUnit('PRE-01'), false);
    assert.equal(integrationStatus('PRE-01'), 'PARTIEL', 'PRE-01 est livrée par P3-DESIGN-PRESTATAIRE');
  });

  check('EMP — erreurs : projection en états StateGuard, corrélation sûre uniquement', () => {
    assert.equal(employerError(new ApiClientError('refus', 403, 'FORBIDDEN')).state, '403');
    assert.equal(employerError(new ApiClientError('réseau', 0, 'NETWORK_ERROR')).state, 'offline');
    assert.equal(employerError(new ApiClientError('inconnu', 1000, 'INVALID_RESPONSE')).state, '500');
    assert.equal(employerError(new Error('secret')).state, '500');
    assert.equal(employerError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'req-abc123-xyz789')).correlationId, 'req-abc123-xyz789');
    assert.equal(employerError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'token=secret')).correlationId, undefined);
  });

  check('EMP — notifications : le domaine est déduit de la destination réelle, jamais inventé', () => {
    const base = { isRead: false, createdAt: '2026-01-01T00:00:00.000Z' } as unknown as NotificationView;
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'client/paiements' } }), 'paiements');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'client/contrats' } }), 'contrats');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'client/litiges' } }), 'claims');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'client/missions' } }), 'offres');
    assert.equal(notificationDomain(base), 'all');
  });

  check('EMP — brouillon d’offre : seulement des champs acceptés par le serveur, rien d’inventé', () => {
    assert.equal(toOfferDraft(EMPTY_OFFER_DRAFT), null, 'un brouillon vide ne produit aucune offre');
    const payload = toOfferDraft({
      ...EMPTY_OFFER_DRAFT,
      title: '  Peinture façade  ',
      contractType: 'Prestation',
      location: 'Douala',
      remuneration: '150000',
      skills: 'peinture, échafaudage',
      conditions: 'matériel fourni',
      responsibilities: 'préparer, peindre',
    });
    assert.ok(payload, 'une saisie complète doit produire une charge utile');
    const allowed = ['title', 'contractType', 'remuneration', 'currency', 'location', 'summary', 'skills', 'conditions', 'responsibilities', 'selectionProcess', 'isUrgent', 'startDate', 'durationMonths'];
    for (const key of Object.keys(payload!)) assert.ok(allowed.includes(key), `champ non autorisé envoyé : ${key}`);
    for (const key of SERVER_OWNED_OFFER_FIELDS) {
      if (key === 'currency') continue;
      assert.ok(!(key in payload!), `champ possédé par le serveur envoyé : ${key}`);
    }
    assert.equal(payload!.title, 'Peinture façade');
    assert.deepEqual(payload!.skills, ['peinture', 'échafaudage']);
    assert.equal(payload!.remuneration, 150000);
  });

  check('EMP — vocabulaire produit affiché : Offre, Employeur, Candidat, Claim (jamais les mots du Master)', () => {
    assert.equal(PRODUCT_LABELS.OFFER.singular, 'Offre');
    assert.equal(PRODUCT_LABELS.EMPLOYER.singular, 'Employeur');
    assert.equal(PRODUCT_LABELS.CANDIDATE.singular, 'Candidat');
    assert.equal(PRODUCT_LABELS.CLAIM.singular, 'Claim');
  });

  check('EMP — résolution d’écran : motif exact prioritaire, paramètres extraits', () => {
    const detail = resolveEmployerScreen('/client/contrats/abc-123');
    assert.equal(detail?.code, 'EMP-29');
    assert.equal(detail?.unitId, 'EMP-29');
    assert.deepEqual(detail?.params, { id: 'abc-123' });
    const versions = resolveEmployerScreen('/client/contrats/abc-123/versions/v7');
    assert.equal(versions?.code, 'EMP-30');
    assert.deepEqual(versions?.params, { id: 'abc-123', v: 'v7' });
    const wizard = resolveEmployerScreen('/client/missions/nouvelle/3');
    assert.equal(wizard?.code, 'EMP-08');
    assert.equal(resolveEmployerScreen('/client/inconnu'), null);
  });

  return results;
}
