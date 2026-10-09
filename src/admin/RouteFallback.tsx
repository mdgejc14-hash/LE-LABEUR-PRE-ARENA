/**
 * ADM —— chemin de supervision sans fiche livrée.
 *
 * Certains chemins réels de l'espace supervision n'ont AUCUNE fiche dans le
 * périmètre de cette tranche (ex. `/admin/matching/runs` : revendiqué par
 * l'unité ADM-11 par préfixe, mais seule la fiche `/admin/matching/runs/:id`
 * est décrite). Ce module le dit et affiche ce qui existe : les routes
 * réellement livrées pour cette unité et les capacités absentes déclarées.
 * Aucun écran, aucun libellé et aucune donnée ne sont inventés ; le libellé de
 * l'unité vient du design et n'est donc jamais rendu ici.
 */

import { ActionRow, AdminPage, GapNotice, Link, PageHead, Panel } from './components';
import { adminGapsFor, deliveredScreensForUnit } from './screenMap';
import type { AdminUnitProps } from './types';

export function AdminRouteFallback({ unitId, pathname }: Pick<AdminUnitProps, 'unitId' | 'pathname'>) {
  const screens = deliveredScreensForUnit(unitId);
  return (
    <AdminPage unitId={unitId}>
      <div data-route-fallback="true">
        <PageHead
          title="Aucun écran livré pour ce chemin"
          lede={`Le chemin ${pathname} est rattaché à l’unité ${unitId} de l’espace supervision, mais le périmètre de cette tranche ne décrit aucune fiche pour ce chemin : aucun écran n’est inventé pour le combler.`}
          seal={{ tone: 'slate', label: 'Hors fiche' }}
        />
        <Panel title="Routes réellement livrées pour cette unité" zone="list">
          <ul className="lbm-admin__list">
            {screens.map((screen) => (
              <li key={screen.code} className="lbm-admin__row">
                <span className="lbm-mono">{screen.code}</span>{' '}
                <span className="lbm-mono lbm-muted">{screen.route}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <GapNotice title="Capacités absentes (BACKEND_GAP)" items={adminGapsFor(unitId, pathname)} />
        <ActionRow>
          <Link href="/admin" className="lbm-admin__link">
            Retour au tableau de bord
          </Link>
        </ActionRow>
      </div>
    </AdminPage>
  );
}
