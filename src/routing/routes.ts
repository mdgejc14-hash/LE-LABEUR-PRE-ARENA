import { PUBLIC_SCREENS } from '../public/catalog';

/**
 * LE LABEUR — Namespaces de routes (P0-DESIGN-FOUNDATION).
 *
 * Architecture progressive :
 *  - « / » et tout chemin hors namespaces → application LEGACY (AppContext / AppScreen), inchangée ;
 *  - /client/*, /prestataire/*, /admin/*, /appel/* (+ /appels), /etat/* → shells du Master ;
 *  - /fondation/* → démonstration de la fondation (hors périmètre produit, retirable).
 *
 * Ce module ne dépend d'AUCUNE donnée générée : le chemin legacy ne charge que cette table.
 * La résolution détaillée (unité, état) est dans resolveRoute.ts, chargée à la demande.
 */

export type ShellId = 'PUBLIC' | 'CLIENT' | 'PRESTATAIRE' | 'ADMIN' | 'RTC' | 'SYSTEM';

export type NamespaceId = 'public' | 'client' | 'prestataire' | 'admin' | 'appel' | 'etat' | 'fondation';

export interface NamespaceDefinition {
  readonly id: NamespaceId;
  /** Préfixes reconnus (le premier est canonique). `/appels` est la route RTC-06 de la fiche. */
  readonly prefixes: readonly string[];
  readonly shell: ShellId;
  /** Page d'accueil du namespace (fiche de référence quand elle existe). */
  readonly index: string;
  readonly demo: boolean;
}

export const ROUTE_NAMESPACES: readonly NamespaceDefinition[] = [
  { id: 'client', prefixes: ['/client'], shell: 'CLIENT', index: '/client', demo: false },
  { id: 'prestataire', prefixes: ['/prestataire'], shell: 'PRESTATAIRE', index: '/prestataire', demo: false },
  { id: 'admin', prefixes: ['/admin'], shell: 'ADMIN', index: '/admin', demo: false },
  { id: 'appel', prefixes: ['/appel', '/appels'], shell: 'RTC', index: '/appels', demo: false },
  { id: 'etat', prefixes: ['/etat'], shell: 'SYSTEM', index: '/etat', demo: false },
  { id: 'fondation', prefixes: ['/fondation'], shell: 'PUBLIC', index: '/fondation', demo: true },
];

/** Pages de démonstration sous /fondation/* (hors périmètre produit). */
export const FOUNDATION_DEMO_PAGES: readonly string[] = ['public'];

/** Forme canonique d'un chemin : sans query ni fragment, sans barre finale ni doublon. */
export function normalizePathname(input: string): string {
  let path = input.split('?')[0].split('#')[0];
  if (!path) path = '/';
  if (!path.startsWith('/')) path = '/' + path;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

export interface NamespaceMatch {
  readonly definition: NamespaceDefinition;
  readonly pathname: string;
  /** Segments après le préfixe du namespace. */
  readonly segments: readonly string[];
  readonly isIndex: boolean;
}

/** Namespace du chemin, ou `null` pour le legacy (« / » inclus). Aucune donnée requise. */
export function namespaceFor(pathname: string): NamespaceMatch | null {
  const path = normalizePathname(pathname);
  // Exact opt-in routes only: '/' and unrelated legacy URLs are not captured.
  if (PUBLIC_SCREENS.some((screen) => screen.route === path)) {
    return { definition: { id: 'public', prefixes: [], shell: 'PUBLIC', index: '/accueil', demo: false },
      pathname: path, segments: path.slice(1).split('/'), isIndex: path === '/accueil' };
  }
  for (const definition of ROUTE_NAMESPACES) {
    for (const prefix of definition.prefixes) {
      if (path === prefix || path.startsWith(prefix + '/')) {
        const rest = path.slice(prefix.length);
        return {
          definition,
          pathname: path,
          segments: rest.split('/').filter(Boolean),
          isIndex: path === definition.index,
        };
      }
    }
  }
  return null;
}
