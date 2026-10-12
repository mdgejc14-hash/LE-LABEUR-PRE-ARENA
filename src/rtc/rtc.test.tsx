/**
 * RTC-1 — tests de la tranche des Sessions temps réel.
 *
 * Couverture :
 *  1. parité du catalogue généré avec la source de design (Python) ;
 *  2. résolution de route : chaque fiche RTC est atteignable et rattachée à son unité ;
 *  3. registre complet (5 unités / 8 fiches) ;
 *  4. API : chaque chemin appelé existe déjà dans `routeContracts.ts` ;
 *  5. GARDE-FOU DE VOCABULAIRE : aucun libellé métier du Master Design
 *     (Mission, Client, Prestataire, Litige) ne peut entrer dans l'interface ;
 *  6. DÉCISION FINANCE : aucun libellé du triplet financier interdit ;
 *  7. états d'interface réels (chargement, indisponible, gap, vide) et attributs
 *     d'inspection (`data-unit`, `data-screen`, `data-zone`, `data-backend-gap`) ;
 *  8. sessions : statuts réels en parité avec le serveur, aucun statut legacy
 *     inventé, aucun secret ICE/signalisation rendu, références de design
 *     jamais appelées, transport legacy jamais utilisé ;
 *  9. intégration : RTC = PARTIEL, EMP/PRE/ADM/PUB/SYS inchangés, FIN non intégrée.
 */

import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { RTC_DESIGN_SCREENS, RTC_DESIGN_UNITS } from './catalog';
import { RTC_UNIT_GAPS } from './gaps';
import { rtcGapsFor, resolveRtcScreen, unitForScreen } from './screenMap';
import { deliveredScreensForUnit } from './screenMap';
import { RTC_SCREEN_COMPONENTS, RtcScreen } from './registry';
import { RtcRouteFallback } from './RouteFallback';
import { RTC_API_PATHS } from './api';
import { DESIGN_ONLY_TERMS_NOT_RENDERED, PRODUCT_LABELS, SESSION_STATUS_LABELS, sessionStatusLabel } from './vocabulary';
import { rtcError } from './errors';
import { rtcGuard } from './hooks';
import { isRtcUnavailable, unavailableWhenNotInstalled } from './screens/shared';
import { API_ROUTE_CONTRACTS } from '../backend/api/routeContracts';
import { resolveRoute } from '../routing/resolveRoute';
import { ADMIN_UNIT_IDS, EMPLOYER_UNIT_IDS, PARTIAL_UNIT_IDS, RTC_UNIT_IDS, integrationStatus, isRtcUnit } from '../routing/integration';
import { PRESTATAIRE_UNIT_IDS } from '../routing/integration';
import { PRODUCTION_UNITS } from '../design-system/generated/productionUnits';
import { ApiClientError } from '../repositories/apiClient';

const RTC_SCREEN_DIR = new URL('./screens/', import.meta.url);

/* ── Utilitaires d'inspection ── */

/** Chemin concret d'un motif de fiche (`:id` → valeur d'exemple). */
function samplePath(pattern: string): string {
  return pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? 'wbs-exemple' : segment))
    .join('/');
}

/**
 * Termes du Master Design qui ne doivent JAMAIS désigner un concept produit dans
 * l'interface (la documentation et les chemins techniques restent autorisés).
 */
const FORBIDDEN_UI_TERMS = ['Mission', 'Missions', 'Client', 'Clients', 'Prestataire', 'Prestataires', 'Prestation', 'Litige', 'Litiges'];

/** Libellés financiers interdits par la décision FINANCE de cette tranche. */
const FORBIDDEN_FINANCE_LABELS = ['Prix Prestataire', 'Frais SaaS', 'Total Client', 'barème', 'Barème', 'séquestre', 'escrow'];

/** Statuts legacy du transport historique : aucun handler ne les produit, jamais affichés. */
const FORBIDDEN_LEGACY_CALL_STATUS = ['IDLE', 'CALLING', 'RINGING', 'ACCEPTING', 'CONNECTED', 'REJECTED', 'MISSED', 'ENDED'];

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
 * Les comparaisons techniques, slugs serveur et chemins ne sont pas du texte
 * affiché : ils ne doivent pas être confondus avec un libellé métier.
 */
const DISPLAY_PROP_NAMES = ['title', 'lede', 'label', 'placeholder', 'aria-label', 'alt', 'empty', 'hint', 'description', 'summary', 'note', 'heading'];

function displayStringsIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/>([^<>{}]+)</g)) found.push(match[1]);
  const props = new RegExp(`(?:${DISPLAY_PROP_NAMES.join('|')})\\s*[:=]\\s*(['"\`])([^'"\`]{1,200})\\1`, 'g');
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

export async function runRtcTests(): Promise<{ name: string; success: boolean; detail?: string }[]> {
  const results: { name: string; success: boolean; detail?: string }[] = [];
  const check = (name: string, run: () => unknown | Promise<unknown>) => {
    const done = (error?: unknown) => {
      if (error === undefined) results.push({ name, success: true });
      else results.push({ name, success: false, detail: String(error) });
    };
    try {
      const value = run();
      if (value instanceof Promise) return value.then(() => done(), done);
      done();
      return undefined;
    } catch (error) {
      done(error);
      return undefined;
    }
  };
  const pending: unknown[] = [];
  const track = (task: unknown) => {
    if (task instanceof Promise) pending.push(task);
  };

  track(check('RTC — catalogue généré identique à la source de design (python --check)', () => {
    execFileSync('python3', ['scripts/design/generate-rtc-catalog.py', '--check']);
  }));

  track(check('RTC — 5 unités / 8 fiches, chaque fiche rattachée à une seule unité', () => {
    assert.equal(RTC_DESIGN_UNITS.length, 5);
    assert.equal(RTC_DESIGN_SCREENS.length, 8);
    assert.deepEqual(RTC_DESIGN_UNITS.map((unit) => unit.id), ['RTC-01', 'RTC-02', 'RTC-04', 'RTC-05', 'RTC-08']);
    const codes = RTC_DESIGN_SCREENS.map((screen) => screen.code);
    assert.equal(new Set(codes).size, 8);
    for (const screen of RTC_DESIGN_SCREENS) {
      const unit = unitForScreen(screen.code);
      assert.ok(unit, `fiche sans unité : ${screen.code}`);
      const parent = RTC_DESIGN_UNITS.find((candidate) => candidate.id === unit);
      assert.ok((parent?.screenCodes as readonly string[] | undefined)?.includes(screen.code), `fiche ${screen.code} absente des fiches de ${unit}`);
    }
  }));

  track(check('RTC — chaque route de fiche est résolue par le routeur P0 vers son unité', () => {
    for (const screen of RTC_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell', `route non shell : ${path}`);
      if (resolved.kind !== 'shell') continue;
      assert.equal(resolved.notFound, false, `route non résolue : ${path}`);
      assert.equal(resolved.shell, 'RTC', `shell attendu RTC : ${path}`);
      assert.equal(resolved.unitId, unitForScreen(screen.code), `unité inattendue pour ${path}`);
    }
    const index = resolveRoute('/appels');
    assert.equal(index.kind === 'shell' && index.unitId, 'RTC-05', 'l’index /appels doit être le journal RTC-06 (unité RTC-05)');
    const root = resolveRoute('/appel');
    assert.equal(root.kind === 'shell' && root.notFound, true, 'la racine /appel (ni index ni écran) doit garder la 404 de shell');
    assert.equal(root.kind === 'shell' && root.unitId, null, 'la racine /appel ne doit hériter d’aucune unité par préfixe');
  }));

  track(check('RTC — registre complet : les 8 fiches ont un écran, aucun code inconnu', () => {
    const registered = Object.keys(RTC_SCREEN_COMPONENTS).sort();
    const expected = RTC_DESIGN_SCREENS.map((screen) => screen.code).sort();
    assert.deepEqual(registered, expected);
  }));

  track(check('RTC — chaque fiche déclare ses capacités absentes (BACKEND_GAP) et la résolution les renvoie', () => {
    for (const screen of RTC_DESIGN_SCREENS) {
      assert.ok((RTC_UNIT_GAPS[screen.code] ?? []).length > 0, `aucun BACKEND_GAP déclaré pour ${screen.code}`);
    }
    const gaps = rtcGapsFor('RTC-01', '/appel/wbs-exemple/diagnostic');
    assert.ok(gaps.some((line) => line.includes('RTC-01')), 'les gaps de l’unité doivent être inclus');
    assert.ok(gaps.some((line) => line.includes('RTC-07')), 'les gaps de la fiche réellement atteinte doivent être inclus');
  }));

  track(check('RTC — API : tout chemin appelé existe déjà dans routeContracts.ts (aucune route créée)', () => {
    const normalize = (path: string) => path.replace(/:[A-Za-z]+/g, ':param');
    const declared = new Set(API_ROUTE_CONTRACTS.map((route) => normalize(route.path)));
    assert.ok(RTC_API_PATHS.length >= 5, `trop peu de chemins vérifiés : ${RTC_API_PATHS.length}`);
    for (const path of RTC_API_PATHS) {
      assert.ok(declared.has(normalize(path)), `route inconnue du produit : ${path}`);
    }
    // Aucune référence de design /v1/calls/* n'est appelée : les commentaires
    // documentent les écarts, le code n'appelle que /api/v1/webrtc-sessions*.
    const apiSource = stripComments(readFileSync(new URL('./api.ts', import.meta.url), 'utf8'));
    assert.ok(!apiSource.includes('/v1/calls'), 'api.ts appelle une référence de design /v1/calls/*');
    assert.ok(!apiSource.includes('/api/v1/calls'), 'api.ts appelle un contrat calls.* sans handler (501)');
  }));

  track(check('RTC — GARDE-FOU vocabulaire : aucun terme du Master Design ne désigne un concept produit dans l’interface', () => {
    const files = [
      ...readdirSync(RTC_SCREEN_DIR).map((name) => new URL(name, RTC_SCREEN_DIR)),
      new URL('./components.tsx', import.meta.url),
      new URL('./gaps.ts', import.meta.url),
      new URL('./registry.tsx', import.meta.url),
      new URL('./UnitBoundary.tsx', import.meta.url),
      new URL('./RouteFallback.tsx', import.meta.url),
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
  }));

  track(check('RTC — décision FINANCE : aucun libellé du triplet financier interdit n’entre dans le code de la tranche', () => {
    const files = [
      ...readdirSync(RTC_SCREEN_DIR).map((name) => new URL(name, RTC_SCREEN_DIR)),
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
  }));

  track(check('RTC — rendu réel : chaque fiche rend son conteneur, son état « source non configurée » et son BACKEND_GAP', () => {
    for (const screen of RTC_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell');
      if (resolved.kind !== 'shell' || !resolved.unitId) continue;
      const html = renderToStaticMarkup(
        <>{RtcScreen({ unitId: resolved.unitId, pathname: resolved.pathname, segments: resolved.segments })}</>,
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
  }));

  track(check('RTC — unités d’inspection : data-zone par genre de zone et primitives d’état accessibles', () => {
    const allowedKinds = new Set(RTC_DESIGN_SCREENS.flatMap((screen) => screen.zoneKinds as readonly string[]));
    assert.ok(allowedKinds.has('media'), 'le catalogue doit déclarer des zones média');
    for (const screen of RTC_DESIGN_SCREENS) {
      const path = samplePath(screen.route);
      const resolved = resolveRoute(path);
      assert.equal(resolved.kind, 'shell', `route non shell : ${path}`);
      if (resolved.kind !== 'shell' || !resolved.unitId) continue;
      const html = renderToStaticMarkup(
        <>{RtcScreen({ unitId: resolved.unitId, pathname: resolved.pathname, segments: resolved.segments })}</>,
      );
      const rendered = [...html.matchAll(/data-zone="([^"]+)"/g)].map((match) => match[1]);
      for (const kind of rendered) {
        assert.ok(allowedKinds.has(kind), `${screen.code} : genre de zone inventé « ${kind} »`);
      }
      for (const kind of screen.zoneKinds as readonly string[]) {
        assert.ok(rendered.includes(kind), `${screen.code} : zone déclarée « ${kind} » absente du rendu`);
      }
    }
  }));

  track(check('RTC — accessibilité & responsive : cibles tactiles, point de rupture 360 px, réduction de mouvement, portée du style', () => {
    const css = readFileSync(new URL('./rtc.css', import.meta.url), 'utf8');
    assert.ok(css.includes('@media (max-width: 600px)'), 'point de rupture mobile (360 px) absent');
    assert.ok(css.includes('prefers-reduced-motion'), 'réduction de mouvement absente');
    assert.ok(css.includes('--touch-target-mobile'), 'cible tactile non référencée');
    assert.ok(css.includes('.lbm-rtc'), 'portée lbm-rtc absente');
    // Aucun style global : chaque sélecteur de classe est sous la portée lbm-rtc.
    const globals = [...css.matchAll(/^\s*\.(?!lbm-rtc)[a-z][\w-]*/gm)].map((match) => match[0].trim());
    assert.deepEqual(globals, [], `sélecteurs hors portée : ${globals.join(', ')}`);
    const html = renderToStaticMarkup(
      <RtcScreen unitId="RTC-05" pathname="/appels" segments={['appels']} />,
    );
    assert.ok(html.includes('aria-label'), 'actions sans libellé accessible');
  }));

  track(check('RTC — chemin sans fiche : page de repli honnête, routes livrées listées, libellé du design jamais rendu', () => {
    const html = renderToStaticMarkup(<>{RtcRouteFallback({ unitId: 'RTC-01', pathname: '/appel/wbs-exemple/inconnu' })}</>);
    assert.ok(html.includes('data-route-fallback="true"'), 'repli non identifié');
    assert.ok(html.includes('/appel/:id/preparation'), 'routes livrées non listées');
    assert.ok(html.includes('/appel/:id/diagnostic'), 'routes livrées non listées');
    assert.ok(html.includes('data-backend-gap="true"'), 'BACKEND_GAP absent du repli');
    assert.ok(!html.includes('pré-appel & diagnostic réseau'), 'libellé du design rendu dans le repli');
    for (const unit of RTC_DESIGN_UNITS) {
      const screens = deliveredScreensForUnit(unit.id);
      assert.ok(screens.length >= 1, `${unit.id} sans route livrée`);
    }
  }));

  track(check('RTC — intégration : 5 unités RTC PARTIEL, EMP/PRE/ADM/PUB/SYS inchangés, FIN non intégrée', () => {
    assert.equal(RTC_UNIT_IDS.length, 5);
    for (const unitId of RTC_UNIT_IDS) {
      assert.equal(integrationStatus(unitId), 'PARTIEL', `${unitId} doit être PARTIEL`);
      assert.ok(isRtcUnit(unitId), `${unitId} doit être reconnue comme unité RTC`);
      assert.ok(PARTIAL_UNIT_IDS.includes(unitId), `${unitId} doit être dans PARTIAL_UNIT_IDS`);
    }
    for (const unit of PRODUCTION_UNITS) {
      if (unit.family === 'RTC' || unit.family === 'EMP' || unit.family === 'PUB' || unit.family === 'SYS' || unit.family === 'PRE') continue;
      if (ADMIN_UNIT_IDS.includes(unit.id)) continue;
      assert.equal(integrationStatus(unit.id), 'NON_INTEGRE', `${unit.id} ne doit pas être touchée par cette tranche`);
    }
    assert.equal(isRtcUnit('EMP-01'), false);
    assert.equal(EMPLOYER_UNIT_IDS.length, 32, 'les 32 unités EMP restent livrées');
    assert.equal(PRESTATAIRE_UNIT_IDS.length, 26, 'les 26 unités PRE restent livrées');
    assert.equal(ADMIN_UNIT_IDS.length, 34, 'les 34 unités ADM restent livrées');
    assert.equal(integrationStatus('EMP-01'), 'PARTIEL', 'EMP-01 reste livrée par P2');
    assert.equal(integrationStatus('PRE-01'), 'PARTIEL', 'PRE-01 reste livrée par P3');
    assert.equal(integrationStatus('ADM-01'), 'PARTIEL', 'ADM-01 reste livrée par P4A');
    assert.equal(integrationStatus('ADM-25'), 'PARTIEL', 'ADM-25 reste livrée par P4G-8');
    for (const finUnitId of ['FIN-01', 'FIN-02', 'FIN-03']) {
      assert.equal(integrationStatus(finUnitId), 'NON_INTEGRE', `${finUnitId} : RTC-1 ne débloque pas les unités FIN`);
    }
  }));

  track(check('RTC — erreurs : projection en états StateGuard, corrélation sûre uniquement', () => {
    assert.equal(rtcError(new ApiClientError('refus', 403, 'FORBIDDEN')).state, '403');
    assert.equal(rtcError(new ApiClientError('réseau', 0, 'NETWORK_ERROR')).state, 'offline');
    assert.equal(rtcError(new ApiClientError('inconnu', 1000, 'INVALID_RESPONSE')).state, '500');
    assert.equal(rtcError(new Error('secret')).state, '500');
    assert.equal(rtcError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'req-abc123-xyz789')).correlationId, 'req-abc123-xyz789');
    assert.equal(rtcError(new ApiClientError('x', 500, 'INVALID_RESPONSE', 'token=secret')).correlationId, undefined);
  }));

  track(check('RTC — garde de session : seuls les comptes Employeur / Candidat actifs ouvrent l’espace des Sessions', () => {
    const session = (role: string, status: string) => ({
      status: 'ready' as const,
      session: { actor: { id: 'u1', role, status, displayName: 'Test' }, permissions: [] },
      error: null,
      reload: () => undefined,
    });
    assert.equal(rtcGuard(session('EMPLOYER', 'ACTIVE')), 'ok');
    assert.equal(rtcGuard(session('CANDIDATE', 'ACTIVE')), 'ok');
    assert.equal(rtcGuard(session('ADMIN', 'ACTIVE')), 'forbidden', 'ADMIN sans override participant (403 serveur)');
    assert.equal(rtcGuard(session('EMPLOYER', 'BLOCKED')), 'forbidden');
    assert.equal(rtcGuard(session('CANDIDATE', 'BLOCKED')), 'forbidden');
    assert.equal(rtcGuard({ status: 'anonymous', session: null, error: null, reload: () => undefined }), 'anonymous');
    assert.equal(rtcGuard({ status: 'loading', session: null, error: null, reload: () => undefined }), 'loading');
  }));

  track(check('RTC — sessions : statuts réels en parité avec le serveur, aucun statut legacy, aucun secret rendu', () => {
    assert.deepEqual(
      Object.keys(SESSION_STATUS_LABELS).sort(),
      ['ACTIVE', 'CLOSED', 'CONNECTING', 'CREATED', 'EXPIRED', 'FAILED'],
      'les 6 statuts réels de WebRtcSessionStatus, jamais renommés',
    );
    assert.equal(sessionStatusLabel('CONNECTING'), 'Connexion en cours');
    assert.equal(PRODUCT_LABELS.WEBRTC_SESSION.singular, 'Session');
    assert.equal(PRODUCT_LABELS.CONTRACT.singular, 'Contrat');
    assert.equal(PRODUCT_LABELS.EMPLOYER.singular, 'Employeur');
    assert.equal(PRODUCT_LABELS.CANDIDATE.singular, 'Candidat');
    // Les écrans ne rendent ni secret ICE, ni credential, ni statut legacy.
    for (const name of readdirSync(RTC_SCREEN_DIR)) {
      const source = stripComments(readFileSync(new URL(name, RTC_SCREEN_DIR), 'utf8'));
      assert.ok(!source.includes('iceServers'), `${name} : iceServers ne doit jamais être rendu (§3.6)`);
      assert.ok(!source.includes('X-WebRTC-Credential'), `${name} : aucun credential de signalisation manipulé`);
      for (const legacy of FORBIDDEN_LEGACY_CALL_STATUS) {
        const pattern = new RegExp(`(^|[^\\p{L}])${legacy}([^\\p{L}]|$)`, 'u');
        assert.ok(!pattern.test(source), `${name} : statut legacy « ${legacy} » sans handler, jamais affiché`);
      }
      assert.ok(!source.includes('services/calls'), `${name} : transport legacy (mock/démo) interdit`);
      assert.ok(!source.includes('apiRepository'), `${name} : dépôt legacy interdit`);
    }
    const apiSource = stripComments(readFileSync(new URL('./api.ts', import.meta.url), 'utf8'));
    assert.ok(!apiSource.includes('services/calls'), 'api.ts : transport legacy (mock/démo) interdit');
  }));

  track(check('RTC — 501 : sentinelle « non installé », jamais une liste vide présentée comme saine', async () => {
    assert.equal(isRtcUnavailable({ unavailable: true }), true);
    assert.equal(isRtcUnavailable({ items: [] }), false);
    assert.equal(isRtcUnavailable(null), false);
    const sentinel = await unavailableWhenNotInstalled(() => {
      throw new ApiClientError('non configuré', 501, 'NOT_IMPLEMENTED');
    });
    assert.equal(isRtcUnavailable(sentinel), true, '501 → sentinelle non installé');
    const value = await unavailableWhenNotInstalled(async () => 'réel');
    assert.equal(value, 'réel');
    await assert.rejects(
      unavailableWhenNotInstalled(() => {
        throw new ApiClientError('refus', 403, 'FORBIDDEN');
      }),
      'les autres erreurs sont propagées, jamais converties en indisponible',
    );
  }));

  track(check('RTC — résolution d’écran : motif exact prioritaire, paramètres extraits', () => {
    const active = resolveRtcScreen('/appel/wbs-123');
    assert.equal(active?.code, 'RTC-04', 'la Session active capte /appel/:id');
    assert.equal(active?.unitId, 'RTC-04');
    assert.deepEqual(active?.params, { id: 'wbs-123' });
    const preparation = resolveRtcScreen('/appel/wbs-123/preparation');
    assert.equal(preparation?.code, 'RTC-01', 'le motif le plus spécifique gagne');
    assert.equal(preparation?.unitId, 'RTC-01');
    assert.equal(resolveRtcScreen('/appels')?.code, 'RTC-06');
    assert.equal(resolveRtcScreen('/appel')?.code ?? null, null, '/appel sans identifiant n’est aucune fiche');
    assert.equal(resolveRtcScreen('/appel/wbs-123/inconnu'), null);
  }));

  track(check('RTC — vocabulaire produit affiché : Session, Contrat, Employeur, Candidat (jamais les mots du Master)', () => {
    assert.equal(PRODUCT_LABELS.WEBRTC_SESSION.singular, 'Session');
    assert.equal(PRODUCT_LABELS.CONTRACT.plural, 'Contrats');
    assert.equal(PRODUCT_LABELS.EMPLOYER.singular, 'Employeur');
    assert.equal(PRODUCT_LABELS.CANDIDATE.singular, 'Candidat');
    assert.ok(DESIGN_ONLY_TERMS_NOT_RENDERED.includes('Client' as never), 'le tableau de référence doit lister les termes');
  }));

  await Promise.all(pending);
  return results;
}
