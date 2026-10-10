/**
 * Tests du routage progressif (P0-DESIGN-FOUNDATION) : namespaces, legacy, unités, états système.
 * Exécutés par scripts/run-tests.ts (convention du dépôt : runXTests → {name, success, detail}).
 */

import { PRODUCTION_UNITS, UNIT_COUNTS_BY_FAMILY } from '../design-system/generated/productionUnits';
import { STATE_GUARD_CATALOG } from '../design-system/generated/stateGuardCatalog';
import { DOCK_DEFINITIONS } from '../design-system/shells/shellNavigation';
import { ADMIN_UNIT_IDS, INTEGRATED_UNIT_IDS, integrationStatus, integrationSummary } from './integration';
import { namespaceFor, normalizePathname, ROUTE_NAMESPACES } from './routes';
import { matchProductionUnit, resolveRoute, type ShellRouteResolution } from './resolveRoute';

export interface RoutingTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} : attendu ${e}, obtenu ${a}`);
}

function shellOf(path: string): ShellRouteResolution {
  const route = resolveRoute(path);
  assert(route.kind === 'shell', `${path} devrait être un shell, obtenu legacy`);
  return route;
}

/** Remplace chaque paramètre `:nom` d'une route de fiche par une valeur concrète. */
function concretePath(route: string): string {
  return route
    .split('/')
    .map((segment) => (segment.startsWith(':') ? 'v42' : segment))
    .join('/');
}

export function runRoutingTests(): RoutingTestResult[] {
  const results: RoutingTestResult[] = [];
  const check = (name: string, test: () => string | void) => {
    try {
      const detail = test();
      results.push({ name, success: true, detail: typeof detail === 'string' ? detail : 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  check('legacy : « / » et les chemins hors migration restent inchangés', () => {
    for (const path of ['/', '/chemin/inconnu', '/connexion/legacy', '/accueil/inconnu']) {
      assertEqual(namespaceFor(path), null, `namespace de ${path}`);
      assertEqual(resolveRoute(path).kind, 'legacy', `résolution de ${path}`);
    }
    return '« / » + chemins non migrés → legacy';
  });

  check('namespaces : les six espaces du Master sont déclarés avec leur shell', () => {
    const shells = Object.fromEntries(ROUTE_NAMESPACES.map((ns) => [ns.id, ns.shell]));
    assertEqual(shells, { client: 'CLIENT', prestataire: 'PRESTATAIRE', admin: 'ADMIN', appel: 'RTC', etat: 'SYSTEM', fondation: 'PUBLIC' }, 'shells');
    return '/client · /prestataire · /admin · /appel · /etat · /fondation';
  });

  check('bornes de préfixe : /clientele n’est pas /client ; /appels n’est pas /appel', () => {
    assertEqual(namespaceFor('/clientele'), null, '/clientele');
    assertEqual(namespaceFor('/appelsx'), null, '/appelsx');
    assertEqual(namespaceFor('/appels')?.definition.id, 'appel', '/appels');
    return 'frontières de segment respectées';
  });

  check('normalisation : barre finale, doublons, query et fragment', () => {
    assertEqual(normalizePathname('/client/'), '/client', 'barre finale');
    assertEqual(normalizePathname('//client//missions/'), '/client/missions', 'doublons');
    assertEqual(normalizePathname('/client?x=1#y'), '/client', 'query et fragment');
    assertEqual(normalizePathname('client'), '/client', 'sans barre initiale');
    return '4 cas';
  });

  check('index : /client (EMP-01, P2), /prestataire (PRE-01, P3) et /admin (ADM-01, P4A) sont des tableaux de bord réels ; /appels, /etat, /fondation = index de fondation', () => {
    // P2-DESIGN-EMPLOYER : la fiche EMP-01 du Master Design a pour route « /client » ;
    // l'index employeur est donc le tableau de bord réel, plus la page de fondation.
    const emp = shellOf('/client');
    assert(emp.isIndex && !emp.notFound && emp.unitId === 'EMP-01', `fiche EMP-01 attendue sur /client, obtenu ${emp.unitId}`);
    // P3-DESIGN-PRESTATAIRE : idem côté candidat, la fiche PRE-01 a pour route « /prestataire ».
    const pre = shellOf('/prestataire');
    assert(pre.isIndex && !pre.notFound && pre.unitId === 'PRE-01', `fiche PRE-01 attendue sur /prestataire, obtenu ${pre.unitId}`);
    // P4A-DESIGN-ADMIN-CORE : idem côté supervision, la fiche ADM-01 a pour route « /admin ».
    const adm = shellOf('/admin');
    assert(adm.isIndex && !adm.notFound && adm.unitId === 'ADM-01', `fiche ADM-01 attendue sur /admin, obtenu ${adm.unitId}`);
    for (const path of ['/appels', '/etat', '/fondation']) {
      const route = shellOf(path);
      assert(route.isIndex && !route.notFound && route.unitId === null, `index attendu pour ${path}`);
    }
    return '3 fiches livrées (EMP-01, PRE-01, ADM-01) + 3 index de fondation';
  });

  check('unités : toute route de fiche des namespaces est résolue vers une unité (ou un état)', () => {
    let resolved = 0;
    for (const unit of PRODUCTION_UNITS) {
      if (unit.family === 'SYS' || unit.family === 'PUB' || unit.family === 'FIN') continue;
      for (const route of unit.routes) {
        const path = concretePath(route);
        const shell = shellOf(path);
        assert(shell.notFound === false, `route de fiche non résolue : ${route}`);
        assert(shell.isIndex || shell.unitId !== null, `route de fiche sans unité : ${route}`);
        resolved += 1;
      }
    }
    assert(resolved > 150, `trop peu de routes de fiche vérifiées : ${resolved}`);
    return `${resolved} routes de fiches résolues`;
  });

  check('unités : /client/missions/42/qualification est revendiquée par une unité EMP', () => {
    const route = shellOf('/client/missions/42/qualification');
    const unit = PRODUCTION_UNITS.find((u) => u.id === route.unitId);
    assert(unit && unit.family === 'EMP', `unité inattendue : ${route.unitId}`);
    assertEqual(route.shell, 'CLIENT', 'shell');
    return `${unit.id} · ${unit.label}`;
  });

  check('unités : routes statiques préférées aux routes paramétrées', () => {
    const exact = matchProductionUnit('/client/missions/nouvelle/1');
    const param = matchProductionUnit('/client/missions/77/apercu');
    assert(exact !== null && param !== null, 'correspondances absentes');
    const exactUnit = PRODUCTION_UNITS.find((u) => u.id === exact);
    assert(exactUnit?.routes.some((route) => route === '/client/missions/nouvelle/1'), 'route statique non préférée');
    return 'statique avant paramétrée';
  });

  check('inconnu : /client/inconnu et /admin/xyz/… → 404 de shell (SYS-05), pas une fausse unité', () => {
    for (const path of ['/client/inconnu', '/prestataire/rien', '/admin/zzz/yyy', '/appel', '/fondation/nope']) {
      const route = shellOf(path);
      assert(route.notFound && route.state === '404' && route.unitId === null, `404 attendu pour ${path}`);
    }
    return '5 chemins inconnus → 404';
  });

  check('états : /etat/* → StateGuard de la fiche SYS correspondante (15 routes)', () => {
    for (const entry of STATE_GUARD_CATALOG) {
      const route = shellOf(entry.route);
      assertEqual(route.state, entry.key, `état de ${entry.route}`);
      assertEqual(route.shell, 'SYSTEM', `shell de ${entry.route}`);
      assert(!route.notFound, `${entry.route} marqué introuvable`);
    }
    return '15 routes SYS résolues';
  });

  check('états : /etat/999 → 404 ; /etat → index des états', () => {
    const unknown = shellOf('/etat/999');
    assert(unknown.state === '404' && unknown.notFound, '/etat/999 non traité en 404');
    assert(shellOf('/etat').isIndex, '/etat non indexé');
    return '404 et index';
  });

  check('fondation : /fondation/public est une page de démonstration, /fondation/x une 404', () => {
    const demo = shellOf('/fondation/public');
    assert(!demo.notFound && demo.state === null, 'démonstration public refusée');
    assert(shellOf('/fondation/x').notFound, '/fondation/x non refusée');
    return 'démonstration retirable';
  });

  check('dock : chaque entrée EMP / PRE / ADM pointe vers une route de fiche existante', () => {
    for (const family of ['EMP', 'PRE', 'ADM'] as const) {
      for (const definition of DOCK_DEFINITIONS[family]) {
        const unitId = matchProductionUnit(definition.ficheRoute);
        assert(unitId !== null, `entrée ${family} « ${definition.label} » sans fiche : ${definition.ficheRoute}`);
      }
    }
    return '15 entrées de dock ancrées dans les fiches';
  });

  check('intégration : 0 / 120 intégrée ; PARTIEL = PUB + SYS + les 32 unités EMP (P2) + les 26 unités PRE (P3) + les 17 unités ADM des tranches P4A, P4B-1, P4B-2, P4C, P4D et P4E-1 ; autres ADM/FIN/RTC non intégrées', () => {
    assertEqual(INTEGRATED_UNIT_IDS.length, 0, 'unités intégrées');
    const partialFamilies = ['PUB', 'SYS', 'EMP', 'PRE'];
    assert(
      PRODUCTION_UNITS.every((unit) =>
        integrationStatus(unit.id) === (partialFamilies.includes(unit.family) || ADMIN_UNIT_IDS.includes(unit.id) ? 'PARTIEL' : 'NON_INTEGRE'),
      ),
      'statut inattendu',
    );
    const summary = integrationSummary();
    assertEqual([summary.integrees, summary.total], [0, 120], 'synthèse');
    assertEqual(summary.parFamille, UNIT_COUNTS_BY_FAMILY, 'répartition');
    return '0 / 120 intégrées ; PARTIEL = PUB (10) + SYS (10) + EMP (32) + PRE (26) + ADM tranches P4A, P4B-1, P4B-2, P4C, P4D et P4E-1 (17)';
  });

  return results;
}
