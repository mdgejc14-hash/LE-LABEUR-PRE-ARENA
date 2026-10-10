/**
 * P4G-4 — ADM-57/58, unité « infra (topologie & bord) ».
 *
 * Le dépôt expose des fonctions internes de Worker, une route publique /healthz
 * limitée à la frontière API/persistance et des composants d'infrastructure,
 * mais aucun contrat/handler ADMIN pour la topologie, les métriques Edge, les
 * déploiements ou leurs commandes. Ces sources internes ne sont pas une API de
 * supervision. Les vues restent diagnostiques : aucune requête métier n'est
 * envoyée, aucune mesure ni aucun état de production n'est inventé.
 * UnitBoundary conserve la garde ADMIN et les états de chargement, refus,
 * erreur de session et source non configurée.
 */

import { useId } from 'react';
import {
  ActionRow,
  DataTable,
  EmptyNotice,
  GapNotice,
  KpiRow,
  Link,
  NeoPressButton,
  PageHead,
  Panel,
  StatusSeal,
} from '../components';
import { adminGapsFor } from '../screenMap';
import type { AdminUnitProps } from '../types';

interface UnavailableControl {
  readonly label: string;
  /** Référence de design uniquement ; jamais appelée depuis le navigateur. */
  readonly reference: string;
  readonly reason: string;
}

function UnavailableControls({ items }: { items: readonly UnavailableControl[] }) {
  const reasonPrefix = useId();
  return (
    <ul className="lbm-admin__unavailable-list" aria-label="Actions d’infrastructure indisponibles">
      {items.map((item, index) => {
        const reasonId = `${reasonPrefix}-${index}`;
        return (
          <li key={item.reference} className="lbm-admin__unavailable">
            <NeoPressButton
              type="button"
              variant="ghost"
              disabled
              aria-disabled="true"
              aria-describedby={reasonId}
              data-unavailable-action={item.reference}
            >
              {item.label}
            </NeoPressButton>
            <StatusSeal tone="slate" label="Indisponible" size="sm" />
            <code className="lbm-mono lbm-caption">{item.reference} · référence de design</code>
            <span id={reasonId} className="lbm-caption lbm-muted">{item.reason}</span>
          </li>
        );
      })}
    </ul>
  );
}

function InfrastructureGaps({ unitId, pathname, screenCode }: Pick<AdminUnitProps, 'unitId' | 'pathname'> & { screenCode: string }) {
  return <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={adminGapsFor(unitId, pathname)} />;
}

export function Admin57InfrastructureTopology({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Infrastructure · topologie"
        lede="Aucune API ADMIN ne publie la topologie déployée ni l’état observé des services. Aucun schéma opérationnel n’est dessiné à partir des seules fiches de conception."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'NŒUDS TÉLÉMÉTRÉS', value: '—' },
        { label: 'ÉTATS DE SERVICE CONFIRMÉS', value: '—' },
        { label: 'MESURES DU BORD', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-infrastructure="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur. Cela ne signifie ni zéro nœud, ni état nominal, ni absence d’incident.
      </p>
      <Panel title="Topologie déployée" zone="node">
        <EmptyNotice>Aucun graphe ni nœud n’est présenté : aucun contrat serveur ne confirme la topologie réellement déployée.</EmptyNotice>
      </Panel>
      <Panel title="Télémétrie du bord" zone="list">
        <EmptyNotice>Les taux de cache, règles WAF, requêtes bloquées, latences et répartitions régionales ne sont pas exposés à l’ADMIN. Aucune configuration statique n’est assimilée à une mesure d’exécution.</EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          {
            label: 'Ouvrir un nœud',
            reference: 'GET /admin/infra/nodes/:id/health',
            reason: 'Aucun identifiant de nœud ni endpoint de lecture ADMIN n’est disponible.',
          },
          {
            label: 'Voir le statut public',
            reference: 'ADM-63 · /admin/infra/statut',
            reason: 'Le statut de service et sa publication sont hors de cette tranche ; aucune donnée ni URL publique n’est fournie.',
          },
        ]} />
      </Panel>
      <ActionRow>
        <Link href="/admin/infra/worker" className="lbm-admin__link">Diagnostic Worker edge · source absente</Link>
      </ActionRow>
      <InfrastructureGaps unitId={unitId} pathname={pathname} screenCode="ADM-57" />
    </>
  );
}

export function Admin58WorkerEdge({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Worker edge · supervision"
        lede="Aucune route ADMIN ne fournit les invocations, latences, erreurs, règles effectives ou déploiements du Worker. Le code présent dans le dépôt ne confirme pas un déploiement Cloudflare en production."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'INVOCATIONS · 24 H', value: '—' },
        { label: 'LATENCE P50 / P95', value: '—' },
        { label: 'ERREURS 5XX', value: '—' },
        { label: 'TAUX DE CACHE', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-infrastructure="true">
        « — » indique une mesure indisponible, jamais une valeur nulle. Le point d’entrée /healthz existant décrit la frontière API/persistance ; il ne fournit ni métriques Edge ni état de déploiement et n’est pas utilisé comme substitut.
      </p>
      <DataTable
        caption="Déploiements du Worker"
        head={['Référence', 'Date', 'Environnement', 'État', 'Trafic', 'Incidents associés', 'Retour arrière']}
        rows={[]}
        empty={<EmptyNotice>Aucune liste de déploiements n’est exposée. L’absence de lignes ne signifie ni qu’il n’existe aucun déploiement ni qu’un déploiement est opérationnel.</EmptyNotice>}
      />
      <Panel title="Règles edge consultables" zone="list">
        <EmptyNotice>Le routage, les règles de cache, les règles WAF et les redirections effectives ne sont pas fournis par une lecture ADMIN. Aucune règle n’est déduite des fichiers source.</EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          {
            label: 'Ouvrir un déploiement',
            reference: 'GET /admin/infra/worker/deployments',
            reason: 'Aucun registre de déploiements ADMIN ni identifiant vérifié n’est disponible.',
          },
          {
            label: 'Retour arrière',
            reference: 'POST /admin/infra/worker/rollback',
            reason: 'Aucune commande de retour arrière ou validation secondaire n’est installée.',
          },
          {
            label: 'Contresigner un déploiement',
            reference: 'POST /admin/infra/worker/deployments/:id/countersign',
            reason: 'Aucun déploiement ni handler de contre-signature n’est exposé.',
          },
        ]} />
      </Panel>
      <ActionRow>
        <Link href="/admin/infra" className="lbm-admin__link">Retour à la topologie · source absente</Link>
      </ActionRow>
      <InfrastructureGaps unitId={unitId} pathname={pathname} screenCode="ADM-58" />
    </>
  );
}
