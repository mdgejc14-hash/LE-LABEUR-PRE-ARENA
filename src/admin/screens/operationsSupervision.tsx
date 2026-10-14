/**
 * P4G-2 — ADM-47/48/49 : SLO, dead-letter et incidents d’exploitation.
 *
 * Audit des contrats serveur : aucune route ADMIN ops pour ces ressources ne
 * figure dans routeContracts.ts et aucun handler ne fournit leurs données.
 * Cette tranche ne requête donc pas une autre ressource à leur place : les
 * vues sont diagnostiques, sans série, compteurs, objets ni workflow simulés.
 * L’état de session (chargement, 401/403, erreur et source non configurée) est
 * déjà traité par UnitBoundary avant le rendu de ces écrans.
 */

import { useId } from 'react';
import {
  ActionRow,
  DataTable,
  EmptyNotice,
  GapNotice,
  KpiRow,
  KeyValues,
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
  /** Route du référentiel de design, jamais appelée par cette interface. */
  readonly reference: string;
  readonly reason: string;
}

/** Contrôle visible pour expliquer l'action prévue, mais réellement désactivé. */
function UnavailableControls({ items }: { items: readonly UnavailableControl[] }) {
  const reasonPrefix = useId();
  return (
    <ul className="lbm-admin__unavailable-list" aria-label="Actions indisponibles">
      {items.map((item, index) => {
        const reasonId = `${reasonPrefix}-${index}`;
        return (
          <li key={item.reference} className="lbm-admin__unavailable">
            <NeoPressButton
              variant="ghost"
              type="button"
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

function Gap({ unitId, pathname, screenCode }: Pick<AdminUnitProps, 'unitId' | 'pathname'> & { screenCode: string }) {
  return <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={adminGapsFor(unitId, pathname)} />;
}

function RouteLinks() {
  return (
    <ActionRow>
      <Link href="/admin/ops/queues" className="lbm-admin__link">Files de traitement</Link>
      <Link href="/admin/ops/slo" className="lbm-admin__link">Engagements de service</Link>
      <Link href="/admin/ops/dead-letter" className="lbm-admin__link">Dead-letter</Link>
    </ActionRow>
  );
}

/* ───────────────────────── ADM-47 · SLO ───────────────────────── */

export function Admin47ServiceLevels({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Engagements de service (SLO)"
        lede="Aucun contrat serveur de supervision ne fournit les objectifs, les mesures ou les budgets d’erreur. Aucune courbe ni aucun taux n’est estimé dans cette vue."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'OBJECTIFS DISPONIBLES', value: '—' },
        { label: 'MESURE · 7 JOURS', value: '—' },
        { label: 'MESURE · 30 JOURS', value: '—' },
        { label: 'BUDGET RESTANT', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-metrics="true">
        « — » signifie donnée non disponible. L’absence de mesure ne signifie ni une disponibilité parfaite ni un budget intact.
      </p>
      <DataTable
        caption="Mesures des engagements de service"
        head={['Engagement', 'Cible', 'Mesure · 7 jours', 'Mesure · 30 jours', 'Budget restant', 'Incidents imputés', 'Propriétaire', 'Actions si épuisement']}
        rows={[]}
        empty={<EmptyNotice>Aucune mesure SLO n’est exposée par le serveur. Cette absence de ligne ne signifie pas qu’aucun engagement ou incident n’existe.</EmptyNotice>}
      />
      <Panel title="Règles liées aux budgets" zone="list">
        <EmptyNotice>Aucune politique d’épuisement ou conséquence automatique n’est consultable. Aucun gel de déploiement ni plan de rétablissement n’est affirmé.</EmptyNotice>
      </Panel>
      <Panel title="Actions" zone="cta">
        <UnavailableControls items={[
          { label: 'Voir un incident imputé', reference: 'ADM-47 · incident associé', reason: 'Aucun identifiant d’incident n’est fourni par une source de mesure.' },
          { label: 'Exporter le rapport', reference: 'GET /admin/ops/slo/report.pdf', reason: 'Aucun rapport signé ni endpoint d’export n’est disponible.' },
        ]} />
      </Panel>
      <RouteLinks />
      <Gap unitId={unitId} pathname={pathname} screenCode="ADM-47" />
    </>
  );
}

/* ─────────────────────── ADM-48 · dead-letter ─────────────────────── */

export function Admin48DeadLetter({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Messages en échec définitif"
        lede="Aucune lecture ADMIN de la dead-letter n’est exposée. Les mécanismes internes du worker ne constituent pas une vue de supervision interrogeable depuis cette page."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'MESSAGES CONSULTABLES', value: '—' },
        { label: 'ÂGE DU PLUS ANCIEN', value: '—' },
        { label: 'MOTIFS DISPONIBLES', value: '—' },
        { label: 'ABANDONS CONSULTABLES', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-dead-letter="true">
        « — » signifie donnée non disponible. Une table sans lignes ne permet pas de conclure que la file est vide.
      </p>
      <DataTable
        caption="Messages de la dead-letter"
        head={['Référence', 'File d’origine', 'Type', 'Création', 'Tentatives', 'Dernier échec', 'Impact utilisateur estimé', 'Action proposée']}
        rows={[]}
        empty={<EmptyNotice>Aucune liste serveur n’est disponible : aucun message réel n’est présenté et l’état de la file reste inconnu.</EmptyNotice>}
      />
      <Panel title="Analyse d’un message" zone="doc">
        <EmptyNotice>Aucun détail, payload expurgé, historique de tentative ou diagnostic n’est lisible par une route ADMIN.</EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          { label: 'Rejouer', reference: 'POST /admin/ops/dlq/:id/retry', reason: 'Aucune commande ADMIN de rejeu n’est installée.' },
          { label: 'Abandonner avec compensation', reference: 'POST /admin/ops/dlq/:id/abandon', reason: 'Ni abandon ni compensation ne sont disponibles depuis la console.' },
          { label: 'Créer un incident', reference: 'ADM-48 · création d’incident', reason: 'Aucune action de création d’incident ops n’est exposée.' },
        ]} />
      </Panel>
      <RouteLinks />
      <Gap unitId={unitId} pathname={pathname} screenCode="ADM-48" />
    </>
  );
}

/* ─────────────────────── ADM-49 · incident ─────────────────────── */

export function Admin49OpsIncident({ unitId, pathname, params }: AdminUnitProps) {
  const incidentId = params.id ?? '';
  return (
    <>
      <PageHead
        title="Détail d’incident d’exploitation"
        lede="La route de détail ne dispose d’aucun service de lecture correspondant. La référence du chemin n’est pas vérifiée et ne confirme pas l’existence d’un incident."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <Panel title="Résumé d’incident" zone="hero">
        <p className="lbm-caption lbm-muted">Référence demandée ; valeur issue du chemin uniquement, non vérifiée par le serveur.</p>
        <code className="lbm-mono" data-unverified-reference="true">{incidentId || '—'}</code>
        <KeyValues
          title="Champs d’incident non disponibles"
          items={[
            { label: 'Sévérité', value: '—' },
            { label: 'Portée', value: '—' },
            { label: 'Statut', value: '—' },
            { label: 'Propriétaire', value: '—' },
            { label: 'Durée écoulée', value: '—' },
          ]}
        />
        <p className="lbm-caption lbm-muted">Aucun incident, identifiant ou état n’a été confirmé par une source serveur.</p>
      </Panel>
      <Panel title="Chronologie" zone="timeline">
        <EmptyNotice>Aucun événement, auteur, horodatage, statut ou propriétaire d’incident n’est lisible par une API ops.</EmptyNotice>
      </Panel>
      <Panel title="Communications" zone="list">
        <EmptyNotice>Aucun journal de communication ou d’état public n’est disponible. Aucun message n’est envoyé ni reconstitué ici.</EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          { label: 'Ajouter une entrée', reference: 'POST /admin/ops/incidents/:id/entries', reason: 'Aucune écriture de chronologie ou commande d’incident ops n’est installée.' },
          { label: 'Publier une mise à jour', reference: 'POST /admin/ops/incidents/:id/broadcast', reason: 'Aucun canal de publication ni gabarit d’incident n’est exposé.' },
          { label: 'Clore et ouvrir un post-mortem', reference: 'ADM-49 · clôture et post-mortem', reason: 'Aucune clôture, aucun acquittement ni post-mortem ne peut être enregistré.' },
        ]} />
      </Panel>
      <RouteLinks />
      <Gap unitId={unitId} pathname={pathname} screenCode="ADM-49" />
    </>
  );
}
