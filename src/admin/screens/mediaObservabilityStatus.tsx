/**
 * P4G-7 — ADM-61, ADM-62 et ADM-63, trois unités exactes de
 * `design/llab/units.py` (une fiche par unité) : « ADM — infra
 * (webrtc/turn) » (canon « ADM — infra (webrtc/turn) »), « ADM — infra
 * (observabilité) » et « ADM — infra (statut) », routes P0
 * `/admin/infra/webrtc`, `/admin/infra/observabilite` et `/admin/infra/statut`.
 *
 * VÉRIFICATION DES SOURCES AVANT CODAGE (inspection de `routeContracts.ts`, de
 * la composition du worker `entry.ts` et requête RÉELLE sur le worker composé
 * — PGlite + migrations réelles, session ADMIN réelle obtenue après promotion
 * serveur, jamais auto-attribuable) :
 *
 *  - les onze références de design des trois fiches
 *    (GET /admin/infra/webrtc, GET /admin/infra/webrtc/sessions?cursor=,
 *    GET /admin/infra/webrtc/quality, GET /admin/infra/webrtc/costs,
 *    GET /admin/infra/observability,
 *    GET /admin/infra/observability/alerts,
 *    POST /admin/infra/observability/alerts/:id/simulate,
 *    GET /admin/status/components, POST /admin/status/updates,
 *    POST /admin/status/maintenance, GET /admin/status/public-preview) ne
 *    figurent dans AUCUN contrat serveur et ne sont servies par aucun handler :
 *    chacune répond 404 (`NOT_FOUND`) sur le worker composé avec une session
 *    ADMIN. Aucune permission ADMIN de média, d'observabilité ni de statut
 *    public n'est déclarée (`Permission` ne contient aucun droit de ce type).
 *  - les sessions WebRTC RÉELLES du produit (`webrtc.sessions.*`) sont des
 *    routes de PARTICIPANT : scope `self`/`participant`, rôles EMPLOYER /
 *    CANDIDATE. Une session ADMIN reçoit 403 sur
 *    `GET /api/v1/my/webrtc-sessions` (vérifié). Ces réponses ne portent ni
 *    qualité média (latence, gigue, perte, MOS), ni relais TURN utilisé, ni
 *    coût : ce ne sont pas des sources de supervision et elles ne sont pas
 *    appelées ici. Aucune URL de serveur STUN/TURN ni aucun secret de
 *    signalisation n'est jamais affiché (§3.6).
 *  - l'observabilité interne du produit existe — journalisation structurée,
 *    règles de rédaction (`OBSERVABILITY_REDACTION_RULES`), identifiant de
 *    corrélation, ligne d'observabilité par déclenchement planifié — mais
 *    aucune de ces briques n'est exposée à l'ADMIN : ce sont des mécanismes
 *    internes, pas une API. La seule route voisine déclarée,
 *    `admin.stats.read` (GET /api/v1/admin/stats, `stats:read`), répond une
 *    frontière de contrôle `{resource:'stats', scope:'admin',
 *    persistence:'not-configured', metrics:{}}` (vérifié) : elle ne contient
 *    ni couverture de traces, ni alerte, ni seuil, ni coût. Elle n'est pas
 *    appelée ici.
 *  - pour le statut public, `GET /healthz` est un RAPPORT PUBLIC de la
 *    frontière API/persistance (`status`, `persistence.mode/reachable/
 *    latencyMs/migrations`, `runtime.hyperdriveBinding`) : il ne publie aucun
 *    composant de service, aucun état dérivé de télémétrie, aucune
 *    maintenance planifiée et aucune mise à jour d'incident. Ce n'est pas une
 *    page de statut et il n'est pas utilisé comme substitut. L'écran de
 *    maintenance public (PUB-10) appartient à l'espace public : aucune route
 *    ADMIN ne permet de le préparer, de le planifier ni de le publier, et rien
 *    n'est publié depuis cette vue.
 *  - côté routes voisines réellement déclarées mais sans handler :
 *    `admin.calls.list` (GET /api/v1/admin/calls, `calls:read:any`) répond 501
 *    (vérifié) — ce n'est pas un registre d'appels média et il n'est pas
 *    appelé.
 *
 * Conséquences : aucune requête métier, aucun agrégat calculé dans le
 * navigateur, aucune mesure média, aucune alerte, aucune trace, aucun état de
 * composant, aucun incident de statut, aucune opération de réparation, de
 * redémarrage, de reconfiguration ou de publication. Les valeurs absentes sont
 * rendues « — » (indisponibilité), jamais 0 ; chaque action écrite par les
 * fiches est désactivée et identifiée par `data-unavailable-action` ; les
 * composants déclarés par ADM-63 sont rendus comme STRUCTURE (jamais comme
 * relevé) et chaque capacité absente est déclarée en BACKEND_GAP (unités
 * ADM-61, ADM-62 et ADM-63 de `gaps.ts`).
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

function UnavailableControls({ items, ariaLabel }: { items: readonly UnavailableControl[]; ariaLabel: string }) {
  const reasonPrefix = useId();
  return (
    <ul className="lbm-admin__unavailable-list" aria-label={ariaLabel}>
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

function MediaStatusGaps({
  unitId,
  pathname,
  screenCode,
}: Pick<AdminUnitProps, 'unitId' | 'pathname'> & { screenCode: string }) {
  return <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={adminGapsFor(unitId, pathname)} />;
}

/** Composants publics ÉCRITS par la fiche ADM-63 — structure, jamais un relevé. */
const DECLARED_PUBLIC_COMPONENTS: readonly string[] = [
  'API',
  'Applications',
  'Paiements',
  'Documents',
  'Appels',
  'Notifications',
];

/* ────────────── ADM-61 · WebRTC & TURN ────────────── */

export function Admin61WebRtcTurn({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Infra · WebRTC & TURN"
        lede="Aucune route ADMIN ne publie l’infrastructure d’appel : ni session active, ni qualité média, ni relais utilisé, ni coût. Les sessions WebRTC réellement exposées par le produit sont réservées aux participants et ne portent aucun de ces relevés. Aucune URL de serveur de relais ni aucun secret de signalisation n’est affiché."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'SESSIONS ACTIVES', value: '—' },
        { label: 'TAUX D’ÉTABLISSEMENT', value: '—' },
        { label: 'LATENCE MÉDIANE', value: '—' },
        { label: 'PERTE DE PAQUETS MÉDIANE', value: '—' },
        { label: 'RECOURS AU TURN', value: '—' },
        { label: 'COÛT ESTIMÉ DU JOUR', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-media="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni zéro session, ni une bonne qualité, ni un relais inutilisé, ni un coût nul, et cela ne dit rien d’une panne en cours. Aucun indicateur Média n’est déduit d’un statut de session, d’un message de signalisation ou d’un journal d’API.
      </p>
      <Panel title="Qualité média · 24 h" zone="timeline">
        <EmptyNotice>
          Aucune série n’est disponible : ni MOS estimé, ni gigue, ni perte. Les bandes de qualité ne sont pas dessinées faute de mesure à représenter, et aucune courbe n’est tracée à partir d’un seuil, d’un exemple ou d’une capture antérieure.
        </EmptyNotice>
      </Panel>
      <DataTable
        caption="Sessions d’appel en cours"
        head={['Session', 'Type', 'Participants', 'Durée', 'Qualité actuelle', 'Relais utilisé', 'Pays']}
        rows={[]}
        empty={<EmptyNotice>Aucune session n’est exposée à l’ADMIN : ni identifiant, ni rôle de participant, ni durée, ni qualité, ni relais. L’absence de lignes ne prouve ni l’absence d’appel en cours, ni la santé des relais. Aucune identité, aucune adresse d’accès et aucune donnée de média ne sont affichées.</EmptyNotice>}
      />
      <Panel title="Consentement d’enregistrement" zone="list">
        <EmptyNotice>
          Aucun état de consentement n’est exposé à l’ADMIN et aucun contenu de session n’est consultable : sans les deux consentements, un enregistrement n’existe pas — et il ne devient pas visible ici faute de source serveur. Rien n’est déduit d’un statut de session.
        </EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions média indisponibles"
          items={[
            {
              label: 'Lire l’état média',
              reference: 'GET /admin/infra/webrtc',
              reason: 'Aucune route ADMIN d’état de l’infrastructure d’appel n’est déclarée ni servie : cette référence ne répond aucune donnée (404 vérifié).',
            },
            {
              label: 'Ouvrir une session',
              reference: 'GET /admin/infra/webrtc/sessions?cursor=',
              reason: 'Aucune lecture ADMIN des sessions en cours n’existe : les sessions réelles sont réservées aux participants (rôles Employeur / Candidat) et aucune vue d’ensemble n’est fournie.',
            },
            {
              label: 'Voir la qualité média',
              reference: 'GET /admin/infra/webrtc/quality',
              reason: 'Aucune série de qualité n’est collectée ni exposée : ni MOS, ni gigue, ni perte. Aucune mesure n’est reconstruite dans le navigateur.',
            },
            {
              label: 'Voir les coûts média',
              reference: 'GET /admin/infra/webrtc/costs',
              reason: 'Aucun coût média n’est publié par le serveur ni calculé à partir d’un tarif : le modèle financier n’est pas appliqué ici.',
            },
          ]}
        />
      </Panel>
      <ActionRow>
        <Link href="/admin/infra" className="lbm-admin__link">Topologie & bord · source absente</Link>
        <Link href="/admin/infra/statut" className="lbm-admin__link">Statut public · source absente</Link>
      </ActionRow>
      <MediaStatusGaps unitId={unitId} pathname={pathname} screenCode="ADM-61" />
    </>
  );
}

/* ────────────── ADM-62 · observabilité ────────────── */

export function Admin62Observability({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Infra · observabilité"
        lede="Aucune route ADMIN ne publie l’observabilité de la plateforme : ni couverture des traces, ni alerte, ni seuil, ni coût. Les mécanismes internes de journalisation du produit ne sont pas une API de supervision et ne sont pas convertis en mesure ici."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'COUVERTURE DES TRACES', value: '—' },
        { label: 'ALERTES ACTIVES', value: '—' },
        { label: 'BRUIT D’ALERTE · ALERTES/JOUR', value: '—' },
        { label: 'COÛT OBSERVABILITÉ DU MOIS', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-observability="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni une couverture nulle, ni l’absence d’alerte, ni un bruit maîtrisé, ni une dépense nulle. Aucun compteur n’est calculé dans le navigateur et aucune cible de bruit (moins de 5 alertes par jour) n’est présentée comme atteinte ou manquée.
      </p>
      <DataTable
        caption="Alertes d’exploitation"
        head={['Alerte', 'Condition', 'Sévérité', 'Déclenchements 7 j', 'Taux d’action', 'Dernier déclenchement', 'Propriétaire']}
        rows={[]}
        empty={<EmptyNotice>Aucune alerte n’est exposée : ni condition, ni seuil, ni sévérité, ni déclenchement, ni propriétaire. L’absence de lignes ne prouve ni qu’aucune alerte n’existe, ni que le bruit est faible, ni que les alertes actives mènent à une action.</EmptyNotice>}
      />
      <Panel title="Qualité des signaux" zone="list">
        <EmptyNotice>
          Aucun contrôle de qualité des signaux n’est exposé ni recalculé localement : ni trace orpheline, ni span manquant sur un chemin critique, ni journal sans corrélation, ni métrique sans seuil. Les chemins critiques des fiches (paiement, OTP) ne sont ni listés comme tracés, ni listés comme aveugles — aucun état de traçage ne serait vérifiable.
        </EmptyNotice>
      </Panel>
      <Panel title="Coût & rétention" zone="list">
        <EmptyNotice>
          Aucun coût d’observabilité, aucune comparaison avec le mois précédent, aucune politique d’échantillonnage ni aucune durée de rétention ne sont publiés. Aucun ajustement d’échantillonnage n’est proposé — et rien ne permettrait de réduire la couverture d’un chemin critique.
        </EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions d’observabilité indisponibles"
          items={[
            {
              label: 'Lire l’état d’observabilité',
              reference: 'GET /admin/infra/observability',
              reason: 'Aucune route ADMIN d’observabilité n’est déclarée ni servie : cette référence ne répond aucune donnée (404 vérifié).',
            },
            {
              label: 'Ouvrir une alerte',
              reference: 'GET /admin/infra/observability/alerts',
              reason: 'Aucun inventaire d’alertes n’existe côté serveur : ni alerte, ni seuil, ni propriétaire ne peuvent être lus.',
            },
            {
              label: 'Simuler un déclenchement',
              reference: 'POST /admin/infra/observability/alerts/:id/simulate',
              reason: 'Aucune simulation n’est installée et aucun bac à sable isolé n’existe : un déclenchement simulé ne pourrait être ni exécuté, ni contenu, ni affiché comme test.',
            },
          ]}
        />
      </Panel>
      <ActionRow>
        <Link href="/admin/infra" className="lbm-admin__link">Topologie & bord · source absente</Link>
        <Link href="/admin/infra/webrtc" className="lbm-admin__link">WebRTC & TURN · source absente</Link>
      </ActionRow>
      <MediaStatusGaps unitId={unitId} pathname={pathname} screenCode="ADM-62" />
    </>
  );
}

/* ────────────── ADM-63 · statut global & page publique ────────────── */

export function Admin63GlobalStatus({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Infra · statut global & page publique"
        lede="Aucune route ADMIN ne publie la page de statut : ni état de composant dérivé de la télémétrie, ni incident public, ni maintenance planifiée, ni aperçu. L’état des composants n’est jamais saisi à la main — ici il n’est ni saisi, ni affiché, faute de source télémétrique publiée."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <Panel title="Composants publics déclarés par la fiche" zone="list">
        <p className="lbm-caption lbm-muted" data-declared-components="true">
          La liste ci-dessous est la STRUCTURE ÉCRITE par la fiche, pas un relevé : aucun composant ne porte ici d’état, et aucun état n’est saisi manuellement. L’absence d’état ne signifie ni « opérationnel », ni « dégradé », ni « en panne ».
        </p>
        <ul className="lbm-admin__list" aria-label="Composants publics déclarés par la fiche">
          {DECLARED_PUBLIC_COMPONENTS.map((component) => (
            <li key={component} className="lbm-admin__row">
              <span className="lbm-admin__unavailable-label">{component}</span>
              <StatusSeal tone="slate" label="État indisponible" size="sm" />
            </li>
          ))}
        </ul>
      </Panel>
      <KpiRow items={[
        { label: 'ÉCARTS TÉLÉMÉTRIE / PAGE PUBLIQUE', value: '—' },
        { label: 'DÉLAI MÉDIAN DE PUBLICATION', value: '—' },
        { label: 'MISES À JOUR DANS LES DÉLAIS ANNONCÉS', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-status="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni un écart nul, ni une page synchronisée, ni un délai de publication tenu. Aucun écart n’est calculé dans le navigateur, et le rapport public /healthz — qui décrit la seule frontière API/persistance observée — n’est pas utilisé comme substitut d’état de composant.
      </p>
      <Panel title="Incidents & maintenances publiés" zone="timeline">
        <EmptyNotice>
          Aucun historique public n’est exposé : ni incident, ni post-mortem lié, ni fenêtre de maintenance, ni politique de report. Aucune publication n’est préparée depuis cette vue et rien n’est annoncé aux utilisateurs. Une maintenance planifiée n’existe pas parce qu’elle est décrite dans la fiche : elle n’existe que si le serveur la publie.
        </EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions de statut public indisponibles"
          items={[
            {
              label: 'Lire les composants publics',
              reference: 'GET /admin/status/components',
              reason: 'Aucune route ADMIN de statut n’est déclarée ni servie : cette référence ne répond aucune donnée (404 vérifié) et aucun état de composant ne peut être lu.',
            },
            {
              label: 'Publier une mise à jour',
              reference: 'POST /admin/status/updates {template, body}',
              reason: 'Aucun gabarit contrôlé, aucune publication et aucune horodatation obligatoire ne sont installés : publier depuis cette interface serait une publication sans support.',
            },
            {
              label: 'Planifier une maintenance',
              reference: 'POST /admin/status/maintenance {window, impact}',
              reason: 'Aucune planification n’existe côté serveur : ni fenêtre, ni impact, ni report des échéances concernées ne peuvent être enregistrés depuis cette vue.',
            },
            {
              label: 'Prévisualiser la page publique',
              reference: 'GET /admin/status/public-preview',
              reason: 'Aucun aperçu public n’existe : la page de statut n’est pas servie et il n’y a donc rien à prévisualiser sans inventer un contenu.',
            },
          ]}
        />
      </Panel>
      <ActionRow>
        <Link href="/admin/infra" className="lbm-admin__link">Topologie & bord · source absente</Link>
        <Link href="/admin/infra/webrtc" className="lbm-admin__link">WebRTC & TURN · source absente</Link>
      </ActionRow>
      <MediaStatusGaps unitId={unitId} pathname={pathname} screenCode="ADM-63" />
    </>
  );
}
