/**
 * Point d'entrée de routage (P0-DESIGN-FOUNDATION).
 *
 * « / » et tout chemin hors namespaces rendent l'application LEGACY inchangée (AppContext / AppScreen).
 * Les namespaces du Master sont chargés à la demande : le chemin legacy ne charge ni les shells,
 * ni motion, ni les données générées.
 */

import { lazy, Suspense } from 'react';
import App from '../App';
import { namespaceFor } from './routes';
import { useCurrentPathname } from './navigation';

const ShellRoute = lazy(() => import('../design-system/shells/ShellRoute').then((m) => ({ default: m.ShellRoute })));

function RouteFallback() {
  return (
    <div className="lbm-theme lbm-route-fallback" role="status" aria-live="polite">
      <span className="lbm-sr-only">Chargement</span>
      <span className="lbm-skeleton lbm-skeleton--wide" aria-hidden="true" />
      <span className="lbm-skeleton" aria-hidden="true" />
    </div>
  );
}

export function AppRouter() {
  const pathname = useCurrentPathname();
  if (namespaceFor(pathname) === null) return <App />;
  return (
    <Suspense fallback={<RouteFallback />}>
      <ShellRoute pathname={pathname} />
    </Suspense>
  );
}
