import { PUBLIC_SCREENS } from '../public/catalog';
/**
 * LE LABEUR — Résolution détaillée des routes de namespace (P0-DESIGN-FOUNDATION).
 *
 * Ajoute aux namespaces : l'unité de production qui revendique le chemin, la clé StateGuard
 * (/etat/*, 404 de shell). Dépend des données générées ; chargé à la demande (ShellRoute).
 */

import { PRODUCTION_UNITS } from '../design-system/generated/productionUnits';
import { resolveEmployerScreen } from '../employer/screenMap';
import { resolvePrestataireScreen } from '../prestataire/screenMap';
import { resolveAdminScreen } from '../admin/screenMap';
import { STATE_GUARD_CATALOG, type StateGuardKey } from '../design-system/generated/stateGuardCatalog';
import { FOUNDATION_DEMO_PAGES, namespaceFor, type NamespaceId, type ShellId } from './routes';

export type ResolvedRoute =
  | { readonly kind: 'legacy'; readonly pathname: string }
  | {
      readonly kind: 'shell';
      readonly pathname: string;
      readonly namespace: NamespaceId;
      readonly shell: ShellId;
      readonly segments: readonly string[];
      /** Vrai sur la page d'accueil du namespace. */
      readonly isIndex: boolean;
      /** Identifiant de l'unité de production qui revendique ce chemin (écran non intégré). */
      readonly unitId: string | null;
      /** Clé StateGuard à afficher (namespace /etat/* et 404 de shell). */
      readonly state: StateGuardKey | null;
      readonly notFound: boolean;
    };

export type ShellRouteResolution = Extract<ResolvedRoute, { kind: 'shell' }>;

/** Clé StateGuard associée à une route /etat/* (route de la fiche SYS). */
export function stateKeyForPath(path: string): StateGuardKey | null {
  const entry = STATE_GUARD_CATALOG.find((state) => state.route === path);
  return entry ? entry.key : null;
}

function patternMatches(pattern: string, path: string): boolean {
  const pieces = pattern.split('/').map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeRegExp(seg)));
  return new RegExp('^' + pieces.join('/') + '$').test(path);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unité de production qui revendique le chemin : route exacte, puis route paramétrée (`:id`),
 * puis préfixe d'une route de fiche (ex. « /client/contrats » pour « /client/contrats/:id »).
 * Une route statique exacte est toujours préférée.
 */
export function matchProductionUnit(path: string): string | null {
  let parametric: string | null = null;
  let prefixed: string | null = null;
  for (const unit of PRODUCTION_UNITS) {
    for (const route of unit.routes) {
      if (route === path) return unit.id;
      if (parametric === null && route.includes(':') && patternMatches(route, path)) parametric = unit.id;
      if (prefixed === null && route.startsWith(path + '/')) prefixed = unit.id;
    }
  }
  return parametric ?? prefixed;
}

export function resolveRoute(pathname: string): ResolvedRoute {
  const match = namespaceFor(pathname);
  if (match === null) return { kind: 'legacy', pathname: pathname.split('?')[0] };
  const { definition, segments, isIndex } = match;
  const base = {
    kind: 'shell' as const,
    pathname: match.pathname,
    namespace: definition.id,
    shell: definition.shell,
    segments,
    isIndex,
  };

  if (definition.id === 'public') {
    const screen = PUBLIC_SCREENS.find((item) => item.route === match.pathname)!;
    return { ...base, unitId: screen.code, state: null, notFound: false };
  }

  if (definition.id === 'etat') {
    if (isIndex) return { ...base, unitId: null, state: null, notFound: false };
    const state = stateKeyForPath(match.pathname);
    return { ...base, unitId: null, state: state ?? '404', notFound: state === null };
  }

  /**
   * Espace employeur (P2-DESIGN-EMPLOYER) : les fiches EMP livrées portent leur unité
   * (`EMP-xx`) et l'index `/client` est le tableau de bord EMP-01. Aucune autre
   * famille n'est résolue ici.
   */
  if (definition.id === 'client') {
    const screen = resolveEmployerScreen(match.pathname);
    const unitId = screen ? screen.unitId : matchProductionUnit(match.pathname);
    if (unitId !== null) return { ...base, unitId, state: null, notFound: false };
  }

  /**
   * Espace candidat livré (P3-DESIGN-PRESTATAIRE) : les fiches PRE livrées
   * portent leur unité (`PRE-xx`) et l'index `/prestataire` est le tableau de
   * bord PRE-01. Aucune autre famille n'est résolue ici.
   */
  if (definition.id === 'prestataire') {
    const screen = resolvePrestataireScreen(match.pathname);
    const unitId = screen ? screen.unitId : matchProductionUnit(match.pathname);
    if (unitId !== null) return { ...base, unitId, state: null, notFound: false };
  }

  /**
   * Espace supervision livré (P4A → P4F-2) : les fiches ADM de la tranche
   * portent leur unité (`ADM-xx`) et l'index `/admin` est le tableau de bord
   * ADM-01. Les autres unités ADM (tranches suivantes) gardent la réponse de
   * la fondation (écran non intégré).
   */
  if (definition.id === 'admin') {
    const screen = resolveAdminScreen(match.pathname);
    const unitId = screen ? screen.unitId : matchProductionUnit(match.pathname);
    if (unitId !== null) return { ...base, unitId, state: null, notFound: false };
  }

  if (definition.demo) {
    if (isIndex) return { ...base, unitId: null, state: null, notFound: false };
    const known = segments.length === 1 && FOUNDATION_DEMO_PAGES.includes(segments[0]);
    return { ...base, unitId: null, state: known ? null : '404', notFound: !known };
  }

  if (isIndex) return { ...base, unitId: null, state: null, notFound: false };

  // La racine d'un namespace (ex. « /appel ») n'est pas un écran : seul l'index l'est.
  if (segments.length === 0) return { ...base, unitId: null, state: '404', notFound: true };

  const unitId = matchProductionUnit(match.pathname);
  if (unitId !== null) return { ...base, unitId, state: null, notFound: false };

  // Chemin de namespace absent des fiches : 404 de shell (aucune unité ne le revendique).
  return { ...base, unitId: null, state: '404', notFound: true };
}
