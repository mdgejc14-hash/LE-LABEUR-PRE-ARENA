/**
 * EMP —— garde commune d'un écran d'unité.
 *
 *  - session serveur autoritaire (401 / 403 réels, jamais un rôle d'URL) ;
 *  - sans source de données configurée (mode démo), l'écran le dit : aucune
 *    donnée simulée n'est injectée dans l'espace de production ;
 *  - sinon, l'unité est rendue dans un conteneur `data-unit` commun.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { SystemFeedback } from '../public/SystemFeedback';
import { EmployerPage, GapNotice, LoadingBlock, SheetFrame } from './components';
import { canonScreenCodeForUnit } from './screenMap';
import { employerGuard, useEmployerSession } from './hooks';
import type { EmployerSession } from './api';

const SessionContext = createContext<EmployerSession | null>(null);

/** Session serveur déjà validée pour un écran d'unité. */
export function useEmployerActor(): EmployerSession | null {
  return useContext(SessionContext);
}

export function UnitBoundary({ unitId, screenCode, children }: { unitId: string; screenCode?: string; children: ReactNode }) {
  const session = useEmployerSession();
  const guard = employerGuard(session);

  if (guard === 'loading') {
    return (
      <EmployerPage unitId={unitId} screenCode={screenCode}>
        <LoadingBlock label="Chargement de la session" rows={3} />
      </EmployerPage>
    );
  }
  if (guard === 'anonymous') return <SystemFeedback state="401" />;
  if (guard === 'forbidden') return <SystemFeedback state="403" />;
  if (guard === 'error') {
    return <SystemFeedback state={session.error?.state ?? '500'} correlationId={session.error?.correlationId} />;
  }
  if (guard === 'unavailable' || !session.session) {
    const code = screenCode ?? canonScreenCodeForUnit(unitId) ?? undefined;
    return (
      <EmployerPage unitId={unitId} screenCode={code}>
        <GapNotice
          title="Source de données non configurée"
          items={[
            'Aucune API same-origin n\u2019est configurée (VITE_DEMO_MODE / VITE_API_BASE_PATH). L\u2019espace employeur n\u2019affiche aucune donnée de démonstration.',
            'Les écrans employeur ne fonctionnent qu\u2019avec la session serveur réelle et les routes existantes de /api/v1.',
          ]}
        />
        {code ? <SheetFrame screenCode={code} /> : null}
      </EmployerPage>
    );
  }

  return (
    <EmployerPage unitId={unitId} screenCode={screenCode}>
      <SessionContext.Provider value={session.session}>{children}</SessionContext.Provider>
    </EmployerPage>
  );
}
