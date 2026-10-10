/**
 * P4G-1 — ADM-44/45/46, unité « ops (queues, jobs & cron) ».
 * Les chemins existent dans le routeur P0, mais AUCUNE API ADMIN ne lit les
 * files, les jobs ou les planifications. Le worker et ses tables internes ne
 * constituent pas une API de supervision : ne jamais inférer un état « vide ».
 * La session ADMIN est contrôlée par UnitBoundary ; aucune permission ops
 * n'existe dans routeContracts. Aucun appel réseau ni geste métier ici.
 */
import { ActionRow, DataTable, EmptyNotice, GapNotice, KpiRow, Link, PageHead, Panel } from '../components';
import { adminGapsFor } from '../screenMap';
import type { AdminUnitProps } from '../types';

const noSource = <EmptyNotice>Source de supervision indisponible (BACKEND_GAP) : aucune donnée de file, de job ou de planification n’est lisible côté ADMIN. Ce tableau ne signifie pas qu’il n’existe aucun traitement.</EmptyNotice>;

function Gaps({ unitId, pathname }: AdminUnitProps) {
  return <GapNotice title="BACKEND_GAP · supervision des traitements" items={adminGapsFor(unitId, pathname)} />;
}

export function Admin44Queues(props: AdminUnitProps) {
  return <>
    <PageHead title="Files de traitement" lede="Aucune lecture ADMIN des files n’est exposée. Les traitements internes ne sont pas une source de métriques consultable depuis cette interface." seal={{ tone: 'slate', label: 'Source absente' }} />
    <KpiRow items={[
      { label: 'JOBS EN ATTENTE', value: '—' },
      { label: 'DÉBIT', value: '—' },
      { label: 'ÉCHECS', value: '—' },
      { label: 'PLUS ANCIEN JOB', value: '—' },
    ]} />
    <p className="lbm-caption lbm-muted">« — » : valeur non disponible, pas zéro. Aucune série de profondeur ou de latence n’est servie (BACKEND_GAP).</p>
    <DataTable caption="Files lisibles côté ADMIN" head={['File', 'Profondeur', 'Débit', 'Latence', 'Échecs', 'État']} rows={[]} empty={noSource} />
    <Panel title="Profondeur dans le temps" zone="timeline">{noSource}</Panel>
    <Panel title="Interventions" zone="cta"><p>Augmenter les workers et consulter la dead-letter ne sont pas disponibles : aucune commande ADMIN ne les prend en charge (BACKEND_GAP).</p></Panel>
    <ActionRow>
      <Link href="/admin/ops/cron" className="lbm-admin__link">Planifications</Link>
      <Link href="/admin/ops/slo" className="lbm-admin__link">Engagements de service · BACKEND_GAP</Link>
      <Link href="/admin/ops/dead-letter" className="lbm-admin__link">Dead-letter · BACKEND_GAP</Link>
    </ActionRow>
    <Gaps {...props} />
  </>;
}

export function Admin45QueueJobs(props: AdminUnitProps) {
  const name = props.params.name ?? '';
  return <>
    <PageHead title="Détail d’une file & jobs" lede="La référence ci-dessous provient uniquement du chemin : aucun détail de file ou de job n’a été chargé." seal={{ tone: 'slate', label: 'Source absente' }} />
    <Panel title="Référence demandée" zone="doc"><code className="lbm-mono">{name || '—'}</code><p className="lbm-caption lbm-muted">Référence non vérifiée par le serveur ; ni existence ni état confirmés.</p></Panel>
    <KpiRow items={[
      { label: 'PROFONDEUR', value: '—' },
      { label: 'EN COURS', value: '—' },
      { label: 'ÉCHOUÉS', value: '—' },
    ]} />
    <DataTable caption="Jobs lisibles pour cette file" head={['Job', 'Type', 'Tentatives', 'Prochain essai', 'État', 'Dernière erreur']} rows={[]} empty={noSource} />
    <Panel title="Rejeu indisponible" zone="cta">Aucun détail expurgé ni tentative n’est exposé par une API ADMIN. Rejouer un job, rejouer un lot ou consulter la dead-letter ne sont pas disponibles (BACKEND_GAP).</Panel>
    <ActionRow><Link href="/admin/ops/queues" className="lbm-admin__link">Retour aux files</Link></ActionRow>
    <Gaps {...props} />
  </>;
}

export function Admin46Cron(props: AdminUnitProps) {
  return <>
    <PageHead title="Planifications" lede="Le déclencheur interne n’expose ni registre ADMIN des tâches planifiées, ni prochaine exécution, ni historique lisible." seal={{ tone: 'slate', label: 'Source absente' }} />
    <KpiRow items={[
      { label: 'TÂCHES ACTIVES', value: '—' },
      { label: 'EN RETARD', value: '—' },
      { label: 'EN ÉCHEC', value: '—' },
    ]} />
    <p className="lbm-caption lbm-muted">« — » : aucune mesure servie. Le déclencheur interne n’est pas un registre de tâches planifiées (BACKEND_GAP).</p>
    <DataTable caption="Tâches planifiées lisibles côté ADMIN" head={['Tâche', 'Cadence', 'Dernière exécution', 'Prochaine exécution', 'Échecs']} rows={[]} empty={noSource} />
    <Panel title="Alertes de dérive" zone="list">Aucune durée ni série d’exécutions n’est lisible : une dérive ne peut pas être détectée depuis cette interface (BACKEND_GAP).</Panel>
    <Panel title="Historique et exécution" zone="cta">L’historique, la détection de dérive et « Exécuter maintenant » ne sont pas disponibles via une API ADMIN (BACKEND_GAP).</Panel>
    <ActionRow><Link href="/admin/ops/queues" className="lbm-admin__link">Retour aux files</Link></ActionRow>
    <Gaps {...props} />
  </>;
}
