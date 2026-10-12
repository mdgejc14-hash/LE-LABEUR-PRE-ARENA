/**
 * P4G-5A — ADM-52/53/54, unité « sécurité (replay, signatures, rate limits &
 * webhooks) » de `design/llab/units.py`.
 *
 * VÉRIFICATION DES SOURCES (aucune capacité déduite du nom d'une fiche) :
 *  - `src/backend/api/routeContracts.ts` ne déclare AUCUNE route
 *    `/api/v1/admin/security/*` : les GET/POST de rejeu, de limitation de débit
 *    et de webhooks cités par les fiches sont des références de design ;
 *  - la matrice RBAC serveur (`src/backend/identity/permissions.ts`) ne déclare
 *    aucune permission de sécurité : rien n'est autorisé côté produit ;
 *  - ce qui existe réellement est une PROTECTION, pas une supervision :
 *    classification forensique des erreurs (SECURITY_REPLAY_REJECTED déclenché
 *    par IDEMPOTENCY_CONFLICT, SECURITY_RATE_LIMITED par un 429), limiteur de
 *    débit à fenêtres glissantes conservées en mémoire, vérification de
 *    signature du webhook de paiement par l'adaptateur fournisseur. Aucun de
 *    ces mécanismes n'est appelé ici et aucune de leurs mesures n'est recopiée :
 *    les compteurs internes ne sont ni persistés ni exposés ;
 *  - les traces forensiques et les rejets de signature sont écrits dans le
 *    ledger d'audit existant, qu'aucune route ADMIN ne lit pour cet usage ;
 *    `admin.audit.list` ne renvoie qu'une frontière de contrôle à items vides.
 *
 * En conséquence : aucune requête métier n'est envoyée, aucune mesure n'est
 * calculée dans le navigateur et aucune action de sécurité n'est simulée. Les
 * valeurs absentes sont rendues « — » (indisponible), jamais 0.
 *
 * États d'interface : `UnitBoundary` conserve la garde de session serveur —
 * chargement, 401 (session absente), 403 (compte non ADMIN ou bloqué), 500
 * (erreur de session, corrélation seule) et « Source de données non
 * configurée » avec la structure déclarée de la fiche.
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
    <ul className="lbm-admin__unavailable-list" aria-label="Actions de sécurité indisponibles">
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

function SecurityControlGaps({ unitId, pathname, screenCode }: Pick<AdminUnitProps, 'unitId' | 'pathname'> & { screenCode: string }) {
  return <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={adminGapsFor(unitId, pathname)} />;
}

export function Admin52ReplaySignatures({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Sécurité · rejeux et signatures"
        lede="Aucune API ADMIN ne publie les rejeux détectés ni les signatures invalides. Les protections de rejeu et de signature du produit existent côté serveur, mais aucune ne fournit de liste consultable par l’administration."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'REJEUX BLOQUÉS · 24 H', value: '—' },
        { label: 'SIGNATURES INVALIDES', value: '—' },
        { label: 'SOURCES EN ANOMALIE', value: '—' },
        { label: 'DERNIÈRE ROTATION DE SECRET', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-security="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni zéro, ni un état sain. Aucune rotation de secret n’est datée faute de source, et aucun secret n’est affiché, même partiellement.
      </p>
      <DataTable
        caption="Détections de rejeu consultables"
        head={['Horodatage', 'Type', 'Source', 'Ressource (type)', 'Résultat', 'Récurrence', 'Statut']}
        rows={[]}
        empty={<EmptyNotice>BACKEND_GAP : aucun rejeu ni signature invalide n’est exposé par une route ADMIN. L’absence de lignes n’atteste pas l’absence de rejeu.</EmptyNotice>}
      />
      <Panel title="Analyse comparative" zone="doc">
        <EmptyNotice>Aucun en-tête de signature, aucune fenêtre temporelle, aucune comparaison avec l’original et aucun verdict de blocage n’est accessible. Un rejet de clé d’idempotence n’est pas interprété comme une attaque par rejeu.</EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          {
            label: 'Qualifier une détection',
            reference: 'POST /admin/security/replay/:id/qualify',
            reason: 'Aucune détection lisible et aucune commande de qualification ADMIN n’est installée.',
          },
          {
            label: 'Faire tourner un secret',
            reference: 'POST /admin/security/secrets/:id/rotate',
            reason: 'Aucune procédure de rotation ADMIN n’existe ; aucune valeur de secret ne serait affichée.',
          },
          {
            label: 'Consulter le journal d’audit',
            reference: 'ADM-56 · /admin/securite/audit',
            reason: 'Le journal d’audit de sécurité est hors de cette tranche ; aucune trace forensique n’est rendue ici.',
          },
        ]} />
      </Panel>
      <ActionRow>
        <Link href="/admin/securite/rate-limits" className="lbm-admin__link">Limitation de débit · source absente</Link>
        <Link href="/admin/securite" className="lbm-admin__link">Vue d’ensemble sécurité · source absente</Link>
      </ActionRow>
      <SecurityControlGaps unitId={unitId} pathname={pathname} screenCode="ADM-52" />
    </>
  );
}

export function Admin53RateLimits({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Sécurité · limitation de débit"
        lede="Aucune API ADMIN ne publie les règles de limitation de débit ni leurs effets. Le limiteur du produit compte en mémoire par compartiment et ne publie ni volume, ni blocage, ni contestation."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'BLOCAGES · 24 H', value: '—' },
        { label: 'ADRESSES BLOQUÉES (TRONQUÉES)', value: '—' },
        { label: 'COMPTES AUTHENTIFIÉS TOUCHÉS', value: '—' },
        { label: 'CONTESTATIONS OUVERTES', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-security="true">
        « — » indique une mesure indisponible, jamais un zéro. Aucun compteur interne du limiteur n’est lu, agrégé ni estimé : les fenêtres glissantes du serveur ne sont ni persistées ni exposées.
      </p>
      <DataTable
        caption="Règles de limitation et effet observé"
        head={['Règle', 'Appliquée à', 'Seuil et fenêtre', 'Volume · 24 H', 'Blocages', 'Contestations', 'Faux positifs']}
        rows={[]}
        empty={<EmptyNotice>BACKEND_GAP : aucune règle de limitation de débit n’est exposée par une route ADMIN. Les compartiments internes du limiteur ne sont pas rendus comme des règles consultables.</EmptyNotice>}
      />
      <Panel title="Contestations d’utilisateurs" zone="list">
        <EmptyNotice>Aucune file de contestations n’existe côté serveur : aucun utilisateur bloqué à tort n’est lisible ici et aucune décision de déblocage n’est proposée. Aucun déblocage n’est simulé.</EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          {
            label: 'Ajuster une règle',
            reference: 'POST /admin/security/rate-limits/:rule/apply',
            reason: 'Aucune règle consultable et aucune commande d’ajustement ADMIN n’est installée.',
          },
          {
            label: 'Simuler une règle',
            reference: 'POST /admin/security/rate-limits/:rule/simulate',
            reason: 'Aucun historique de trafic ADMIN n’est exposé : aucune simulation n’est calculée ni estimée.',
          },
          {
            label: 'Débloquer un utilisateur',
            reference: 'POST /admin/security/unblock',
            reason: 'Aucune commande de déblocage de débit ADMIN n’existe ; aucun blocage vérifié n’est présenté.',
          },
        ]} />
      </Panel>
      <ActionRow>
        <Link href="/admin/securite/webhooks" className="lbm-admin__link">Webhooks · source absente</Link>
        <Link href="/admin/securite/replay" className="lbm-admin__link">Rejeux et signatures · source absente</Link>
      </ActionRow>
      <SecurityControlGaps unitId={unitId} pathname={pathname} screenCode="ADM-53" />
    </>
  );
}

export function Admin54Webhooks({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Sécurité · webhooks"
        lede="Aucune API ADMIN ne publie les webhooks reçus ni leur état. Le produit reçoit et vérifie les webhooks de paiement, mais n’expose ni partenaire, ni latence, ni file de rejeu à l’administration."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-security="true">
        Aucune mesure n’est affichée : ni volume, ni latence médiane, ni taux d’échec, ni état de signature. Les seuls contrats webhook du produit sont des points de réception publics ; ils ne sont pas appelés et ne fournissent aucune statistique.
      </p>
      <DataTable
        caption="Webhooks supervisés"
        head={['Source / destination', 'Type d’événement', 'Volume · 24 H', 'Latence médiane', 'Échecs', 'Signature', 'Statut']}
        rows={[]}
        empty={<EmptyNotice>BACKEND_GAP : aucun webhook n’est exposé par une route ADMIN. L’absence de lignes n’atteste ni l’absence d’événement, ni une signature valide, ni une panne partenaire.</EmptyNotice>}
      />
      <Panel title="Latence et échecs" zone="timeline">
        <EmptyNotice>Aucune courbe ni seuil n’est tracé : aucune série temporelle de webhooks n’est exposée. Aucun point n’est dessiné à partir des seuls fichiers de configuration.</EmptyNotice>
      </Panel>
      <Panel title="File de rejeu" zone="list">
        <EmptyNotice>Aucun événement échoué en attente de rejeu n’est lisible : ni cause, ni tentative, ni prochain essai, ni impact sur un Paiement. Aucune priorité métier n’est attribuée à partir d’une donnée absente.</EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          {
            label: 'Rejouer un événement',
            reference: 'POST /admin/security/webhooks/events/:id/retry',
            reason: 'Aucune file de rejeu lisible et aucune commande de rejeu ADMIN n’est installée.',
          },
          {
            label: 'Voir un événement',
            reference: 'GET /admin/security/webhooks/:partner/events',
            reason: 'Aucun événement ni charge utile expurgée n’est exposé à l’administration.',
          },
          {
            label: 'Ouvrir un incident',
            reference: 'ADM-55 · /admin/securite/incidents',
            reason: 'Les incidents de sécurité sont hors de cette tranche ; aucun incident n’est ouvert depuis cet écran.',
          },
        ]} />
      </Panel>
      <ActionRow>
        <Link href="/admin/securite/replay" className="lbm-admin__link">Rejeux et signatures · source absente</Link>
        <Link href="/admin/securite/rate-limits" className="lbm-admin__link">Limitation de débit · source absente</Link>
      </ActionRow>
      <SecurityControlGaps unitId={unitId} pathname={pathname} screenCode="ADM-54" />
    </>
  );
}
