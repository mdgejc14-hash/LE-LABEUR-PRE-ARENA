/**
 * P4G-3 — ADM-50/51, unité « sécurité (dashboard & IDOR) ».
 *
 * Les routes de design /admin/security/* ne sont pas des API installées.
 * Les traces de sécurité internes et les collections de contrôle ADMIN
 * (persistence=not-configured) ne sont pas des détections consultables.
 * Aucun fetch, aucun compteur calculé et aucune action de sécurité ici.
 * UnitBoundary gère session, chargement, refus, erreur et source non configurée.
 */
import {
  ActionRow, DataTable, EmptyNotice, GapNotice, KpiRow, Link,
  NeoPressButton, PageHead, Panel, StatusSeal,
} from '../components';
import { adminGapsFor } from '../screenMap';
import type { AdminUnitProps } from '../types';

function UnavailableAction({ label, reference, reason }: { label: string; reference: string; reason: string }) {
  return (
    <div className="lbm-admin__unavailable">
      <NeoPressButton type="button" variant="ghost" disabled aria-disabled="true" title={reason} data-unavailable-action={reference}>
        {label}
      </NeoPressButton>
      <StatusSeal tone="slate" label="Indisponible" size="sm" />
      <span className="lbm-caption lbm-muted">{reason}</span>
    </div>
  );
}

function Gaps({ unitId, pathname }: AdminUnitProps) {
  return <GapNotice title="BACKEND_GAP · sécurité" items={adminGapsFor(unitId, pathname)} />;
}

export function Admin50SecurityOverview(props: AdminUnitProps) {
  return <>
    <PageHead title="Sécurité · vue d’ensemble" lede="Aucune source ADMIN de détections ou de posture de sécurité n’est installée. Les mesures ci-dessous sont inconnues, pas nulles." seal={{ tone: 'slate', label: 'Source absente' }} />
    <KpiRow items={[
      { label: 'DÉTECTIONS · 24 H', value: '—' },
      { label: 'VERROUS DE SÉCURITÉ', value: '—' },
      { label: 'INCIDENTS OUVERTS', value: '—' },
      { label: 'DERNIER AUDIT D’INTÉGRITÉ', value: '—' },
    ]} />
    <p className="lbm-caption lbm-muted" data-no-invented-security="true">« — » : aucune mesure serveur disponible. Ni l’absence de détections, ni une posture saine ne peuvent être conclues.</p>
    <DataTable caption="Détections récentes" head={['Horodatage', 'Famille', 'Sévérité', 'Acteur expurgé', 'Ressource (type)', 'Action', 'Statut']} rows={[]} empty={<EmptyNotice>BACKEND_GAP : aucune détection lisible par une API ADMIN. Ce tableau ne représente pas un journal vide.</EmptyNotice>} />
    <Panel title="Posture par domaine" zone="list"><EmptyNotice>Authentification, autorisation, intégrité et disponibilité : aucune mesure agrégée n’est exposée. Aucun niveau de risque n’est attribué.</EmptyNotice></Panel>
    <Panel title="Actions indisponibles" zone="cta">
      <UnavailableAction label="Qualifier une détection" reference="POST /admin/security/detections/:id/qualify" reason="Aucune détection ni commande de qualification ADMIN n’est disponible." />
    </Panel>
    <ActionRow><Link href="/admin/securite/idor" className="lbm-admin__link">Contrôles d’accès · source absente</Link></ActionRow>
    <Gaps {...props} />
  </>;
}

export function Admin51AccessControls(props: AdminUnitProps) {
  return <>
    <PageHead title="Sécurité · contrôles d’accès" lede="Les contrôles d’autorisation côté serveur ne fournissent pas de liste ADMIN des anomalies IDOR. Aucun refus ou accès aux données n’est confirmé ici." seal={{ tone: 'slate', label: 'Source absente' }} />
    <KpiRow items={[
      { label: 'TENTATIVES UNIQUES', value: '—' },
      { label: 'RÉCURRENCES', value: '—' },
      { label: 'ACTEURS DISTINCTS', value: '—' },
    ]} />
    <p className="lbm-caption lbm-muted" data-no-invented-security="true">« — » : mesure indisponible, jamais zéro. Aucun résultat de contrôle ou état de fuite n’est déduit.</p>
    <DataTable caption="Anomalies d’accès consultables" head={['Horodatage', 'Acteur expurgé', 'Type de ressource', 'Politique', 'Résultat', 'Récurrence', 'Statut']} rows={[]} empty={<EmptyNotice>BACKEND_GAP : aucune anomalie IDOR n’est exposée par le serveur. L’absence de lignes n’atteste pas l’absence de tentatives.</EmptyNotice>} />
    <Panel title="Analyse et qualification" zone="doc"><EmptyNotice>Aucun événement structuré, politique appliquée ou contexte expurgé n’est accessible. Aucune donnée de session ou de ressource sensible n’est affichée.</EmptyNotice></Panel>
    <Panel title="Actions indisponibles" zone="cta">
      <UnavailableAction label="Qualifier" reference="POST /admin/security/idor/:id/qualify" reason="Aucun cas vérifié ni commande de qualification ADMIN." />
      <UnavailableAction label="Renforcer la règle" reference="POST /admin/security/idor/:id/reinforce" reason="Aucune commande de renforcement ADMIN n’est installée." />
    </Panel>
    <ActionRow><Link href="/admin/securite" className="lbm-admin__link">Vue d’ensemble · source absente</Link></ActionRow>
    <Gaps {...props} />
  </>;
}
