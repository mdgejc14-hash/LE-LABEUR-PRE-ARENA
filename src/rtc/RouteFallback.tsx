/**
 * RTC —— chemin des Sessions sans fiche livrée.
 *
 * Certains chemins réels de l'espace des Sessions n'ont AUCUNE fiche dans le
 * Master Design. Ce module le dit et affiche ce qui existe : les routes
 * réellement livrées pour cette unité et les capacités absentes déclarées.
 * Aucun écran, aucun libellé et aucune donnée ne sont inventés ; le libellé
 * de l'unité vient du design et n'est donc jamais rendu ici.
 */

import { ActionRow, RtcPage, GapNotice, Link, PageHead, Panel } from './components';
import { rtcGapsFor, deliveredScreensForUnit } from './screenMap';
import type { RtcUnitProps } from './types';

export function RtcRouteFallback({ unitId, pathname }: Pick<RtcUnitProps, 'unitId' | 'pathname'>) {
  const screens = deliveredScreensForUnit(unitId);
  return (
    <RtcPage unitId={unitId}>
      <div data-route-fallback="true">
        <PageHead
          title="Aucun écran livré pour ce chemin"
          lede={`Le chemin ${pathname} est rattaché à l’unité ${unitId} de l’espace des Sessions temps réel, mais le Master Design ne décrit aucune fiche pour ce chemin : aucun écran n’est inventé pour le combler.`}
          seal={{ tone: 'slate', label: 'Hors fiche' }}
        />
        <Panel title="Routes réellement livrées pour cette unité" zone="list">
          <ul className="lbm-rtc__list">
            {screens.map((screen) => (
              <li key={screen.code} className="lbm-rtc__row">
                <span className="lbm-mono">{screen.code}</span>{' '}
                <span className="lbm-mono lbm-muted">{screen.route}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <GapNotice title="Capacités absentes (BACKEND_GAP)" items={rtcGapsFor(unitId, pathname)} />
        <ActionRow>
          <Link href="/appels" className="lbm-rtc__link">
            Retour aux Sessions
          </Link>
        </ActionRow>
      </div>
    </RtcPage>
  );
}
