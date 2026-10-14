/**
 * PRE —— chemin candidat sans fiche livrée.
 *
 * Certains chemins réels de l'espace candidat n'ont AUCUNE fiche dans le Master
 * Design (ex. `/prestataire/contrats`, `/prestataire/remplacements` : le design
 * n'a pas de liste mais une fiche par identifiant). Ce module le dit et
 * affiche ce qui existe : les routes réellement livrées pour cette unité et les
 * capacités absentes déclarées. Aucun écran, aucun libellé et aucune donnée ne
 * sont inventés ; le libellé de l'unité vient du design et n'est donc jamais
 * rendu ici.
 */

import { ActionRow, PrestatairePage, GapNotice, Link, PageHead, Panel } from './components';
import { prestataireGapsFor, deliveredScreensForUnit } from './screenMap';
import type { PrestataireUnitProps } from './types';

export function PrestataireRouteFallback({ unitId, pathname }: Pick<PrestataireUnitProps, 'unitId' | 'pathname'>) {
  const screens = deliveredScreensForUnit(unitId);
  return (
    <PrestatairePage unitId={unitId}>
      <div data-route-fallback="true">
        <PageHead
          title="Aucun écran livré pour ce chemin"
          lede={`Le chemin ${pathname} est rattaché à l’unité ${unitId} de l’espace candidat, mais le Master Design ne décrit aucune fiche pour ce chemin : aucun écran n’est inventé pour le combler.`}
          seal={{ tone: 'slate', label: 'Hors fiche' }}
        />
        <Panel title="Routes réellement livrées pour cette unité" zone="list">
          <ul className="lbm-candidat__list">
            {screens.map((screen) => (
              <li key={screen.code} className="lbm-candidat__row">
                <span className="lbm-mono">{screen.code}</span>{' '}
                <span className="lbm-mono lbm-muted">{screen.route}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <GapNotice title="Capacités absentes (BACKEND_GAP)" items={prestataireGapsFor(unitId, pathname)} />
        <ActionRow>
          <Link href="/prestataire" className="lbm-candidat__link">
            Retour à l’accueil candidat
          </Link>
        </ActionRow>
      </div>
    </PrestatairePage>
  );
}
