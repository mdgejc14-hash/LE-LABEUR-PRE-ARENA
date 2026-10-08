/**
 * EMP —— chemin employeur sans fiche livrée.
 *
 * Certains chemins réels de l'espace employeur n'ont AUCUNE fiche dans le Master
 * Design (ex. `/client/contrats`, `/client/litiges` : le design n'a pas de liste
 * mais une fiche par identifiant). Ce module le dit et affiche ce qui existe :
 * les routes réellement livrées pour cette unité et les capacités absentes
 * déclarées. Aucun écran, aucun libellé et aucune donnée ne sont inventés ; le
 * libellé de l'unité (« Contrat — folio & états ») vient du design et n'est donc
 * jamais rendu ici.
 */

import { ActionRow, EmployerPage, GapNotice, Link, PageHead, Panel } from './components';
import { employerGapsFor, deliveredScreensForUnit } from './screenMap';
import type { EmployerUnitProps } from './types';

export function EmployerRouteFallback({ unitId, pathname }: Pick<EmployerUnitProps, 'unitId' | 'pathname'>) {
  const screens = deliveredScreensForUnit(unitId);
  return (
    <EmployerPage unitId={unitId}>
      <div data-route-fallback="true">
        <PageHead
          title="Aucun écran livré pour ce chemin"
          lede={`Le chemin ${pathname} est rattaché à l’unité ${unitId} de l’espace employeur, mais le Master Design ne décrit aucune fiche pour ce chemin : aucun écran n’est inventé pour le combler.`}
          seal={{ tone: 'slate', label: 'Hors fiche' }}
        />
        <Panel title="Routes réellement livrées pour cette unité" zone="list">
          <ul className="lbm-employer__list">
            {screens.map((screen) => (
              <li key={screen.code} className="lbm-employer__row">
                <span className="lbm-mono">{screen.code}</span>{' '}
                <span className="lbm-mono lbm-muted">{screen.route}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <GapNotice title="Capacités absentes (BACKEND_GAP)" items={employerGapsFor(unitId, pathname)} />
        <ActionRow>
          <Link href="/client" className="lbm-employer__link">
            Retour à l’accueil employeur
          </Link>
        </ActionRow>
      </div>
    </EmployerPage>
  );
}
