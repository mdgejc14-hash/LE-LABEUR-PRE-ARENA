/**
 * Rendu des routes de namespace (P0-DESIGN-FOUNDATION). Chargé à la demande (lazy) :
 * le chemin legacy « / » n'embarque ni motion ni les shells.
 *
 * Pour chaque chemin résolu :
 *  - page d'accueil du namespace → index de la famille (état d'intégration des unités) ;
 *  - chemin rattaché à une unité → écran NON INTÉGRÉ (aucune fausse page métier) ;
 *  - /etat/* → StateGuard de l'état correspondant (SYS-01 → SYS-15) ;
 *  - autre chemin de namespace → 404 de shell (StateGuard, SYS-05).
 */

import '../theme/theme.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { PRODUCTION_UNITS, UNIT_COUNTS_BY_FAMILY, type ProductionUnit } from '../generated/productionUnits';
import { FAMILY_LABELS } from '../generated/chrome';
import { STATE_GUARD_CATALOG, type StateGuardKey } from '../generated/stateGuardCatalog';
import { ROUTE_NAMESPACES, type NamespaceId } from '../../routing/routes';
import { resolveRoute, type ShellRouteResolution } from '../../routing/resolveRoute';
import { Link, navigate } from '../../routing/navigation';
import { integrationStatus } from '../../routing/integration';
import { SquircleCard } from '../components/SquircleCard';
import { StateGuard } from '../components/StateGuard';
import { StatusSeal } from '../components/StatusSeal';
import { SHELL_COMPONENTS } from './shells';
import { FoundationPublicPage, FoundationIndexPage } from '../demo/FoundationPages';
import type { FamilyCode } from './shellNavigation';

const NAMESPACE_FAMILY: Record<NamespaceId, FamilyCode> = {
  client: 'EMP',
  prestataire: 'PRE',
  admin: 'ADM',
  appel: 'RTC',
  etat: 'SYS',
  fondation: 'PUB',
};

function namespaceIndex(namespace: NamespaceId): string {
  return ROUTE_NAMESPACES.find((ns) => ns.id === namespace)?.index ?? '/';
}

function unitById(id: string): ProductionUnit | undefined {
  return PRODUCTION_UNITS.find((unit) => unit.id === id);
}

function FamilyIndex({ family, index }: { family: FamilyCode; index: string }) {
  const units = PRODUCTION_UNITS.filter((unit) => unit.family === family);
  const total = UNIT_COUNTS_BY_FAMILY[family];
  const integrated = units.filter((unit) => integrationStatus(unit.id) === 'INTEGRE').length;
  const label = FAMILY_LABELS[family].label;
  return (
    <div className="lbm-page">
      <p className="lbm-kicker">{label}</p>
      <h1 className="lbm-title">{label}</h1>
      <p className="lbm-lede">{FAMILY_LABELS[family].intent}</p>
      <SquircleCard radius={22} elevation={1} className="lbm-panel">
        <p className="lbm-body">
          Écrans de production intégrés : <strong>{integrated} / {total}</strong>
        </p>
        <p className="lbm-body lbm-muted">
          Cette fondation ne livre aucun écran métier. Chaque unité sera introduite dans cette structure, une à une.
        </p>
        <p className="lbm-caption">
          <Link href={index}>Accueil de l’espace</Link>
        </p>
      </SquircleCard>
      <ol className="lbm-unit-list">
        {units.map((unit) => (
          <li key={unit.id} className="lbm-unit-list__item">
            <span className="lbm-unit-list__id lbm-mono">{unit.id}</span>
            <span className="lbm-unit-list__label">{unit.label}</span>
            <StatusSeal tone="slate" label={integrationStatus(unit.id) === 'INTEGRE' ? 'Intégré' : 'Non intégré'} size="sm" />
          </li>
        ))}
      </ol>
    </div>
  );
}

function UnitNotIntegrated({ unit }: { unit: ProductionUnit }) {
  return (
    <div className="lbm-page">
      <p className="lbm-kicker lbm-mono">
        {unit.id} · {FAMILY_LABELS[unit.family].label}
      </p>
      <h1 className="lbm-title">{unit.label}</h1>
      <SquircleCard radius={22} elevation={1} className="lbm-panel">
        <p className="lbm-body">Écran de production non intégré à cette fondation.</p>
        <p className="lbm-caption lbm-muted">Fiches couvertes : {unit.screenCodes.join(', ')}</p>
        <p className="lbm-caption lbm-muted">Routes de fiche : {unit.routes.join(' · ')}</p>
      </SquircleCard>
    </div>
  );
}

function StateIndex() {
  return (
    <div className="lbm-page">
      <p className="lbm-kicker">Famille 05b · États système</p>
      <h1 className="lbm-title">États système</h1>
      <p className="lbm-lede">Chaque panne a un visage ; chaque sortie a une porte.</p>
      <ul className="lbm-state-index">
        {STATE_GUARD_CATALOG.map((state) => (
          <li key={state.key}>
            <Link href={state.route} className="lbm-state-index__link">
              <span className="lbm-mono">{state.code}</span>
              <span>{state.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Pas de code de corrélation ici : il ne vient que du serveur (error.requestId), jamais de l'URL.
 * Aucune donnée n'est simulée dans la fondation : la corrélation est donc absente sur ces pages.
 */
function SystemState({ state, exitHref }: { state: StateGuardKey; exitHref: string }) {
  return <StateGuard state={state} exitHref={exitHref} onExitAction={() => navigate(exitHref)} />;
}

function Content({ route }: { route: ShellRouteResolution }) {
  const family = NAMESPACE_FAMILY[route.namespace];
  const index = namespaceIndex(route.namespace);

  if (route.namespace === 'fondation') {
    if (route.isIndex) return <FoundationIndexPage />;
    if (route.segments[0] === 'public' && route.segments.length === 1) return <FoundationPublicPage />;
    return <SystemState state="404" exitHref="/fondation" />;
  }

  if (route.namespace === 'etat') {
    if (route.isIndex) return <StateIndex />;
    return <SystemState state={route.state ?? '404'} exitHref="/fondation" />;
  }

  if (route.isIndex) return <FamilyIndex family={family} index={index} />;
  if (route.unitId) {
    const unit = unitById(route.unitId);
    if (unit) return <UnitNotIntegrated unit={unit} />;
  }
  return <SystemState state="404" exitHref={index} />;
}

function ShellView({ route }: { route: ShellRouteResolution }): ReactNode {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    // Focus sur le contenu lors d'un changement de page (jamais au premier affichage).
    if (previous.current !== null && previous.current !== route.pathname) {
      document.getElementById('lbm-main')?.focus();
    }
    previous.current = route.pathname;
  }, [route.pathname]);

  const Shell = SHELL_COMPONENTS[route.shell];
  return (
    <Shell currentPath={route.pathname}>
      <Content route={route} />
    </Shell>
  );
}

/** Point d'entrée chargé à la demande : résout le chemin (avec données) puis rend le shell. */
export function ShellRoute({ pathname }: { pathname: string }): ReactNode {
  const route = resolveRoute(pathname);
  if (route.kind === 'legacy') return null;
  return <ShellView route={route} />;
}
