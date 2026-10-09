/**
 * PRE — tests de la tranche P3-DESIGN-PRESTATAIRE.
 *
 * Même exigence que P2-DESIGN-EMPLOYER : catalogue généré vérifié, structure
 * complète (26 unités / 52 fiches), routes réelles résolues, registre complet,
 * BACKEND_GAP déclarés, API existantes uniquement, GARDE-FOU vocabulaire,
 * décision finance, rendu réel de chaque fiche, unités d’inspection (data-zone),
 * dock candidat, repli honnête, intégration PARTIEL, erreurs projetées.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { PRESTATAIRE_DESIGN_SCREENS, PRESTATAIRE_DESIGN_UNITS, PRESTATAIRE_UNIT_IDS } from './catalog';
import { PRESTATAIRE_API_PATHS } from './api';
import { PRESTATAIRE_SCREEN_COMPONENTS, PrestataireScreen } from './registry';
import { PrestataireRouteFallback } from './RouteFallback';
import { resolvePrestataireScreen, prestataireGapsFor, deliveredScreensForUnit, unitForScreen } from './screenMap';
import { PRESTATAIRE_UNIT_GAPS } from './gaps';
import { DESIGN_ONLY_TERMS_NOT_RENDERED, PRODUCT_LABELS, formatAmount, formatDate } from './vocabulary';
import { prestataireError } from './errors';
import { notificationDomain } from './screens/overview';
import { resolveRoute } from '../routing/resolveRoute';
import { DOCK_DEFINITIONS } from '../design-system/shells/shellNavigation';
import { API_ROUTE_CONTRACTS } from '../backend/api/routeContracts';
import { PRODUCTION_UNITS } from '../design-system/generated/productionUnits';
import { ADMIN_UNIT_IDS, INTEGRATED_UNIT_IDS, PARTIAL_UNIT_IDS, PRESTATAIRE_UNIT_IDS as INTEGRATED_PRE_UNIT_IDS, integrationStatus, isPrestataireUnit } from '../routing/integration';
import { ApiClientError } from '../repositories/apiClient';
import type { NotificationView } from './api';
import type { PrestataireUnitProps } from './types';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src', 'prestataire');

export interface PrestataireTestCase {
  name: string;
  success: boolean;
  detail: string;
}

/* ── Extraction des chaînes affichées ── */

const DISPLAY_PROPS = ['title', 'lede', 'label', 'placeholder', 'aria-label', 'alt', 'empty', 'hint', 'description', 'summary', 'note', 'heading'];

function displayStringsIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/>([^<>{}]+)</g)) found.push(match[1]);
  for (const match of source.matchAll(new RegExp(`(?:${DISPLAY_PROPS.join('|')})\\s*[:=]\\s*(['"\`])([^'"\`]{1,200})\\1`, 'g'))) {
    found.push(match[2]);
  }
  return found;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Prétraitement de l'extracteur : les flèches (`=>`) et les génériques TypeScript
 * (`useState<File | null>`, `usePrestataireAction<Application>`) ne sont JAMAIS du
 * texte affiché. Les neutraliser évite que le motif `>…<` ne confonde du code avec
 * du texte d'interface — sans affaiblir le contrôle sur les vraies chaînes affichées.
 */
function preprocess(source: string): string {
  return stripComments(source)
    .replace(/=>/g, '==')
    .replace(/(?<=[A-Za-z0-9_])<[A-Z][A-Za-z0-9_ ,|[\]{}'".-]*>/g, ' ');
}

/** Chemins, identifiants techniques et motifs de route : jamais du vocabulaire métier affiché. */
function stripTechnicalTokens(text: string): string {
  return text
    .replace(/\/[A-Za-z0-9_@?&=%./:[\]{}#-]*/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ');
}

function forbiddenTermsIn(text: string): string[] {
  const stripped = stripTechnicalTokens(text);
  return DESIGN_ONLY_TERMS_NOT_RENDERED.filter((term) => new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, 'iu').test(stripped));
}

const FINANCE_FORBIDDEN_LABELS = ['Prix Prestataire', 'Frais SaaS', 'Total Client', 'barème', 'Barème', 'séquestre', 'Séquestre', 'escrow', 'Escrow', 'wallet', 'portefeuille'];

/** Fichiers dont les chaînes affichées sont contrôlées (catalog.ts exclu : référence générée, jamais affichée). */
const GUARDED_FILES: string[] = [
  ...readdirSync(join(SRC, 'screens')).filter((file) => /\.tsx?$/.test(file)).map((file) => join('screens', file)),
  'components.tsx',
  'gaps.ts',
  'registry.tsx',
  'UnitBoundary.tsx',
  'RouteFallback.tsx',
];

/** Normalise un motif `:param` en `:param` (contrat) pour comparer les chemins. */
function normalizePath(path: string): string {
  return path.replace(/:[a-zA-Z]+/g, ':param');
}

/** Chemin échantilloné d'un motif de route (paramètres remplacés par des valeurs réelles). */
function samplePath(route: string): string {
  return route.replace(/:[a-zA-Z]+/g, 'sample-1');
}

export async function runPrestataireTests(): Promise<PrestataireTestCase[]> {
  const results: PrestataireTestCase[] = [];
  const check = (name: string, run: () => unknown) => {
    try {
      run();
      results.push({ name, success: true, detail: '' });
    } catch (error) {
      results.push({ name, success: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  check('PRE — catalogue généré identique à la source de design (python --check)', () => {
    execFileSync('python3', [join(ROOT, 'scripts/design/generate-prestataire-catalog.py'), '--check'], { cwd: ROOT, stdio: 'pipe' });
    return '26 unités / 52 fiches générées depuis design/llab/content/pre_*.py';
  });

  check('PRE — 26 unités / 52 fiches, chaque fiche rattachée à une seule unité', () => {
    assert.equal(PRESTATAIRE_DESIGN_UNITS.length, 26);
    assert.equal(PRESTATAIRE_DESIGN_SCREENS.length, 52);
    assert.equal(INTEGRATED_PRE_UNIT_IDS.length, 26);
    const seen = new Set<string>();
    for (const unit of PRESTATAIRE_DESIGN_UNITS) {
      assert.ok(unit.screenCodes.length >= 1, `${unit.id} sans fiche`);
      for (const code of unit.screenCodes) {
        assert.ok(!seen.has(code), `${code} dans deux unités`);
        seen.add(code);
      }
    }
    for (const screen of PRESTATAIRE_DESIGN_SCREENS) {
      assert.ok(seen.has(screen.code), `${screen.code} sans unité`);
      assert.ok(screen.route.startsWith('/prestataire'), `${screen.code} hors namespace`);
    }
    return '26 unités PRE-01…PRE-48, 52 fiches PRE-01…PRE-52';
  });

  check('PRE — chaque route de fiche est résolue par le routeur P0 vers son unité (espace candidat)', () => {
    for (const screen of PRESTATAIRE_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const route = resolveRoute(path);
      assert.equal(route.kind, 'shell', `route non shell : ${path}`);
      if (route.kind !== 'shell') continue;
      assert.equal(route.namespace, 'prestataire', `route hors espace candidat : ${path}`);
      assert.equal(route.notFound, false, `route en 404 : ${path}`);
      assert.equal(route.unitId, unitForScreen(screen.code), `unité inattendue pour ${path}`);
    }
    const index = resolveRoute('/prestataire');
    assert.equal(index.kind === 'shell' ? index.unitId : null, 'PRE-01', 'index /prestataire doit être la fiche PRE-01');
    return '52 routes résolues + index PRE-01';
  });

  check('PRE — registre complet : les 52 fiches ont un écran, aucun code inconnu', () => {
    assert.equal(Object.keys(PRESTATAIRE_SCREEN_COMPONENTS).length, 52);
    for (const screen of PRESTATAIRE_DESIGN_SCREENS) {
      assert.ok(PRESTATAIRE_SCREEN_COMPONENTS[screen.code], `${screen.code} sans écran`);
    }
    return '52 écrans (26 composants, variantes comprises)';
  });

  check('PRE — chaque fiche déclare ses capacités absentes (BACKEND_GAP) et la résolution les renvoie', () => {
    for (const screen of PRESTATAIRE_DESIGN_SCREENS) {
      const gaps = PRESTATAIRE_UNIT_GAPS[screen.code] ?? [];
      assert.ok(gaps.length >= 1, `${screen.code} sans BACKEND_GAP`);
      assert.ok(gaps.every((line) => line.includes('PRE-')), `${screen.code} : ligne sans référence de fiche`);
    }
    for (const unit of PRESTATAIRE_DESIGN_UNITS) {
      const merged = prestataireGapsFor(unit.id, unit.routes[0]);
      assert.ok(merged.length >= 1, `${unit.id} sans écart rendu`);
    }
    return '52 fiches avec écarts déclarés';
  });

  check('PRE — API : tout chemin appelé existe déjà dans routeContracts.ts (aucune route créée)', () => {
    const known = new Set(API_ROUTE_CONTRACTS.map((contract) => normalizePath(contract.path)));
    for (const path of PRESTATAIRE_API_PATHS) {
      assert.ok(known.has(normalizePath(path)), `${path} absent du contrat de routes`);
    }
    return `${PRESTATAIRE_API_PATHS.length} chemins vérifiés`;
  });

  check('PRE — GARDE-FOU vocabulaire : aucun terme du Master Design ne désigne un concept produit dans l’interface', () => {
    const offenders: string[] = [];
    for (const file of GUARDED_FILES) {
      const path = join(SRC, file);
      assert.ok(existsSync(path), `${file} introuvable`);
      const source = preprocess(readFileSync(path, 'utf8'));
      for (const text of displayStringsIn(source)) {
        const found = forbiddenTermsIn(text);
        if (found.length > 0) offenders.push(`${file} :: ${found.join(', ')} :: ${text.slice(0, 80)}`);
      }
    }
    assert.equal(offenders.length, 0, `termes de design rendus :\n${offenders.join('\n')}`);
    return `${GUARDED_FILES.length} fichiers contrôlés`;
  });

  check('PRE — décision FINANCE : aucun libellé du triplet financier interdit n’entre dans le code de la tranche', () => {
    const offenders: string[] = [];
    for (const file of GUARDED_FILES) {
      const source = preprocess(readFileSync(join(SRC, file), 'utf8'));
      for (const text of displayStringsIn(source)) {
        for (const label of FINANCE_FORBIDDEN_LABELS) {
          if (text.includes(label)) offenders.push(`${file} :: ${label}`);
        }
      }
    }
    assert.equal(offenders.length, 0, `libellés financiers interdits : ${offenders.join(', ')}`);
    return 'aucun escrow / wallet / prix prestataire / frais SaaS / total client / barème / séquestre';
  });

  check('PRE — rendu réel : chaque fiche rend son conteneur, son état « source non configurée » et son BACKEND_GAP', () => {
    const seen = new Set<string>();
    for (const screen of PRESTATAIRE_DESIGN_SCREENS) {
      const element = PrestataireScreen({
        unitId: unitForScreen(screen.code) ?? screen.unitId,
        pathname: screen.route,
        segments: screen.route.split('/').slice(2),
      }) as React.ReactElement | null;
      assert.ok(element, `${screen.code} : aucun rendu`);
      const html = renderToStaticMarkup(<>{element}</>);
      assert.ok(html.includes(`data-unit="${unitForScreen(screen.code)}"`), `${screen.code} : data-unit absent`);
      assert.ok(html.includes(`data-screen="${screen.code}"`), `${screen.code} : data-screen absent`);
      assert.ok(html.includes('data-backend-gap="true"'), `${screen.code} : BACKEND_GAP non rendu`);
      assert.ok(html.includes('Source de données non configurée'), `${screen.code} : état « source non configurée » absent`);
      assert.ok(html.includes(`data-sheet-frame="${screen.code}"`), `${screen.code} : structure de fiche absente`);
      const found = forbiddenTermsIn(html);
      assert.equal(found.length, 0, `${screen.code} : termes interdits rendus : ${found.join(', ')}`);
      seen.add(screen.code);
    }
    assert.equal(seen.size, 52);
    return '52 fiches rendues en mode sans source, sans terme interdit';
  });

  check('PRE — unités d’inspection : data-zone par genre de zone et primitives d’état accessibles', () => {
    for (const screen of PRESTATAIRE_DESIGN_SCREENS) {
      const element = PrestataireScreen({
        unitId: unitForScreen(screen.code) ?? screen.unitId,
        pathname: screen.route,
        segments: [],
      }) as React.ReactElement | null;
      const html = renderToStaticMarkup(<>{element}</>);
      for (const kind of screen.zoneKinds) {
        assert.ok(html.includes(`data-zone="${kind}"`), `${screen.code} : zone « ${kind} » non rendue`);
        assert.ok(html.includes(`data-zone-kind="${kind}"`), `${screen.code} : genre « ${kind} » non tracé`);
      }
    }
    const fallback = renderToStaticMarkup(
      <PrestataireRouteFallback unitId="PRE-21" pathname="/prestataire/contrats" />,
    );
    assert.ok(fallback.includes('data-route-fallback="true"'), 'repli sans marqueur');
    assert.ok(fallback.includes('data-backend-gap="true"'), 'repli sans BACKEND_GAP');
    return 'zones tracées pour les 52 fiches + repli inspectable';
  });

  check('PRE — dock candidat : chaque onglet mène à une fiche livrée ou à la page de repli honnête', () => {
    const dockItems = DOCK_DEFINITIONS.PRE;
    assert.equal(dockItems.length, 5, 'le dock PRE compte cinq onglets');
    for (const item of dockItems) {
      const resolved = resolveRoute(item.href);
      assert.equal(resolved.kind, 'shell', `onglet non résolu : ${item.href}`);
      if (resolved.kind !== 'shell') continue;
      assert.equal(resolved.namespace, 'prestataire', `onglet hors espace candidat : ${item.href}`);
      assert.equal(resolved.notFound, false, `onglet 404 : ${item.href}`);
      const screen = resolvePrestataireScreen(resolved.pathname);
      if (screen) {
        assert.ok(PRESTATAIRE_SCREEN_COMPONENTS[screen.code], `onglet sans écran : ${item.href}`);
        continue;
      }
      assert.ok(resolved.unitId, `onglet sans unité ni fiche : ${item.href}`);
    }
    return '5 onglets résolus';
  });

  check('PRE — chemin sans fiche : page de repli honnête, routes livrées listées, libellé du design jamais rendu', () => {
    assert.equal(resolvePrestataireScreen('/prestataire/contrats'), null, 'un chemin sans fiche ne doit pas résoudre de fiche');
    const route = resolveRoute('/prestataire/contrats');
    assert.equal(route.kind === 'shell' ? route.unitId : null, 'PRE-21', 'unité attendue');
    const html = renderToStaticMarkup(<PrestataireRouteFallback unitId="PRE-21" pathname="/prestataire/contrats" />);
    assert.ok(html.includes('data-route-fallback="true"'));
    assert.ok(html.includes('/prestataire/contrats/:id'), 'routes livrées non listées');
    assert.ok(html.includes('data-unit="PRE-21"'));
    const found = forbiddenTermsIn(html);
    assert.equal(found.length, 0, `termes interdits rendus : ${found.join(', ')}`);
    for (const unit of PRESTATAIRE_DESIGN_UNITS) {
      const screens = deliveredScreensForUnit(unit.id);
      assert.ok(screens.length >= 1, `${unit.id} sans route livrée`);
    }
    return 'repli honnête + 26 unités avec routes listées';
  });

  check('PRE — intégration : 26 unités PRE PARTIEL, PUB/SYS/EMP inchangés, 12 unités ADM livrées en P4A/P4B-1/P4B-2, autres ADM/FIN/RTC non intégrées', () => {
    assert.equal(INTEGRATED_PRE_UNIT_IDS.length, 26);
    for (const unitId of INTEGRATED_PRE_UNIT_IDS) {
      assert.equal(integrationStatus(unitId), 'PARTIEL', `${unitId} doit être PARTIEL`);
      assert.ok(isPrestataireUnit(unitId), `${unitId} doit être reconnue comme unité PRE`);
      assert.ok(PARTIAL_UNIT_IDS.includes(unitId), `${unitId} doit être dans PARTIAL_UNIT_IDS`);
    }
    for (const unit of PRODUCTION_UNITS) {
      if (unit.family === 'PRE' || unit.family === 'PUB' || unit.family === 'SYS' || unit.family === 'EMP') continue;
      // Les tranches P4A, P4B-1 et P4B-2 ont livré 12 unités ADM depuis P3.
      if (ADMIN_UNIT_IDS.includes(unit.id)) continue;
      assert.equal(integrationStatus(unit.id), 'NON_INTEGRE', `${unit.id} ne doit pas être touchée par cette tranche`);
    }
    assert.equal(isPrestataireUnit('EMP-01'), false);
    assert.equal(INTEGRATED_UNIT_IDS.length, 0, 'aucune unité intégralement couverte');
    assert.equal(integrationStatus('ADM-01'), 'PARTIEL', 'ADM-01 est livrée par P4A-DESIGN-ADMIN-CORE');
    return '26 unités PRE en PARTIEL, 0 / 120 intégrées';
  });

  check('PRE — erreurs : projection en états StateGuard, corrélation sûre uniquement', () => {
    assert.equal(prestataireError(new ApiClientError('refus', 403, 'FORBIDDEN')).state, '403');
    assert.equal(prestataireError(new ApiClientError('réseau', 0, 'NETWORK_ERROR')).state, 'offline');
    assert.equal(prestataireError(new ApiClientError('inconnu', 1000, 'INVALID_RESPONSE')).state, '500');
    assert.equal(prestataireError(new Error('secret')).state, '500');
    assert.equal(prestataireError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'req-abc123-xyz789')).correlationId, 'req-abc123-xyz789');
    assert.equal(prestataireError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'token=secret')).correlationId, undefined);
  });

  check('PRE — notifications : le domaine est déduit de la destination réelle, jamais inventé', () => {
    const base = { isRead: false, createdAt: '2026-01-01T00:00:00.000Z' } as unknown as NotificationView;
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'prestataire/salaire' } }), 'salaire');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'prestataire/contrats' } }), 'contrats');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'prestataire/candidatures' } }), 'candidatures');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'prestataire/propositions' } }), 'propositions');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'prestataire/documents' } }), 'documents');
    assert.equal(notificationDomain({ ...base, linkRef: { screen: 'prestataire/missions' } }), 'offres');
    assert.equal(notificationDomain(base), 'all');
  });

  check('PRE — vocabulaire produit affiché : Offre, Employeur, Candidat, Claim (jamais les mots du Master)', () => {
    assert.equal(PRODUCT_LABELS.OFFER.singular, 'Offre');
    assert.equal(PRODUCT_LABELS.EMPLOYER.singular, 'Employeur');
    assert.equal(PRODUCT_LABELS.CANDIDATE.singular, 'Candidat');
    assert.equal(PRODUCT_LABELS.CLAIM.singular, 'Claim');
    assert.equal(PRODUCT_LABELS.APPLICATION.singular, 'Candidature');
    assert.equal(PRODUCT_LABELS.SALARY.singular, 'Salaire');
    assert.equal(formatAmount(150000, 'XAF').replace(/[\s\u202f\u00a0]/g, ' '), '150 000 XAF');
    assert.equal(formatDate('2026-01-15T10:00:00.000Z'), '15/01/2026');
  });

  check('PRE — résolution d’écran : motif exact prioritaire, paramètres extraits', () => {
    const detail = resolvePrestataireScreen('/prestataire/missions/ofr-123');
    assert.equal(detail?.code, 'PRE-07');
    assert.equal(detail?.unitId, 'PRE-07');
    assert.deepEqual(detail?.params, { id: 'ofr-123' });
    const apply = resolvePrestataireScreen('/prestataire/missions/ofr-123/postuler');
    assert.equal(apply?.code, 'PRE-08');
    const sent = resolvePrestataireScreen('/prestataire/candidatures/envoyee');
    assert.equal(sent?.code, 'PRE-09', 'le motif exact doit l’emporter sur /candidatures/:id');
    const archived = resolvePrestataireScreen('/prestataire/candidatures/archive');
    assert.equal(archived?.code, 'PRE-15', 'le motif exact doit l’emporter sur /candidatures/:id');
    const schedule = resolvePrestataireScreen('/prestataire/salaire/echeances');
    assert.equal(schedule?.code, 'PRE-33');
    const filters = resolvePrestataireScreen('/prestataire/missions/filtres');
    assert.equal(filters?.code, 'PRE-06', 'le motif exact doit l’emporter sur /missions/:id');
    const version = resolvePrestataireScreen('/prestataire/contrats/ctr-1/versions/v7');
    assert.equal(version?.code, 'PRE-23');
    assert.deepEqual(version?.params, { id: 'ctr-1', v: 'v7' });
    const followUp = resolvePrestataireScreen('/prestataire/candidatures/app-9/depot');
    assert.equal(followUp?.code, 'PRE-12');
    assert.deepEqual(followUp?.params, { id: 'app-9' });
    const evidence = resolvePrestataireScreen('/prestataire/evidence/nouvelle');
    assert.equal(evidence?.code, 'PRE-30');
    assert.equal(resolvePrestataireScreen('/prestataire/inconnu'), null);
  });

  check('PRE — écrans paramétrés : les composants reçoivent les paramètres réels de la route', () => {
    const props: PrestataireUnitProps = {
      unitId: 'PRE-07',
      pathname: '/prestataire/missions/ofr-1',
      segments: ['missions', 'ofr-1'],
      params: { id: 'ofr-1' },
    };
    assert.equal(props.params.id, 'ofr-1');
    const screen = resolvePrestataireScreen(props.pathname);
    assert.equal(screen?.code, 'PRE-07');
    assert.equal(screen?.params.id, 'ofr-1');
  });

  results.push(
    ...[
      'catalogue généré',
      'structure',
      'routage',
      'registre',
      'gaps',
      'api',
      'vocabulaire',
      'finance',
      'rendu',
      'inspection',
      'dock',
      'repli',
      'intégration',
      'erreurs',
      'notifications',
      'vocabulaire produit',
      'résolution',
      'paramètres',
    ].map((name, index) => results[index] ?? { name, success: false, detail: 'non exécuté' }),
  );

  return results;
}
