/**
 * P4G-6 — ADM-59/60, unité exacte « ADM — infra (données : PostgreSQL &
 * stockage objet) » de `design/llab/units.py` (canons « ADM — infra
 * (postgres) » et « ADM — infra (R2) »), routes P0 `/admin/infra/postgres` et
 * `/admin/infra/r2`.
 *
 * VÉRIFICATION DES SOURCES AVANT CODAGE (inspection de `routeContracts.ts`, de
 * la composition du worker `entry.ts`/`worker.ts`, du manifeste de migrations,
 * de la configuration de persistance `persistence/config.ts` et requête réelle
 * sur le worker composé — en mémoire, sans persistance — avec un acteur
 * ADMIN) :
 *
 *  - les huit références de design des deux fiches
 *    (GET /admin/infra/postgres, GET /admin/infra/postgres/slow-queries,
 *    GET /admin/infra/postgres/migrations,
 *    POST /admin/infra/postgres/index-proposals, GET /admin/infra/r2,
 *    GET /admin/infra/r2/prefixes, GET /admin/infra/r2/retention,
 *    POST /admin/infra/r2/verify {prefix}) ne figurent PAS dans
 *    `ApiRouteContracts` et aucun handler ne les sert : chacune répond 404
 *    (`NOT_FOUND`) sur le worker composé. Aucune permission ADMIN de base de
 *    données ni de stockage n'est déclarée dans la matrice serveur
 *    (`Permission` ne contient aucun droit d'infrastructure).
 *  - `GET /healthz` est le SEUL point d'entrée lié à la persistance. Sans
 *    rapporteur il conserve la forme de frontière
 *    `{status:'boundary-only', persistence:'not-configured'}` ; avec un
 *    rapporteur il décrit la frontière RÉELLEMENT observée par l'API
 *    (`mode`, `reason`, `configured`, `durable`, `reachable`, `checkedAt`,
 *    `latencyMs`, descripteur sûr de cible, migrations appliquées/en attente)
 *    et `runtime.hyperdriveBinding` (booléen : le Worker a-t-il reçu un
 *    binding). Ce rapport public n'est PAS un contrat ADMIN : il ne porte
 *    aucune permission, ne décrit ni latence p95, ni connexions/pool, ni
 *    requête lente, ni retard de réplication, ni volume ou classe de
 *    stockage. Il n'est donc pas appelé ici — même règle que l'unité
 *    « ADM — infra (topologie & bord) » — et son absence d'appel ne dit rien
 *    de l'état de la base : c'est un écran de supervision attendu, pas une
 *    sonde.
 *  - côté stockage, le produit n'expose au navigateur AUCUN binding : la
 *    configuration ne déclare qu'un compartiment du simulateur local et la
 *    production est volontairement absente (aucune ressource réelle dans
 *    cette session). La seule lecture ADMIN voisine est le registre des
 *    Documents (`admin.documents.list`, `documents:read:any`), qui rend des
 *    métadonnées de Document (type, statut, version, classe de conservation)
 *    et, dans la fiche, des tailles déclarée/reçue par version — jamais une
 *    occupation de stockage, un volume agrégé, une classe de stockage ni une
 *    disponibilité de compartiment. Il n'est pas appelé ici : ce n'est pas
 *    une source de supervision de stockage.
 *  - le contrôle d'intégrité technique du produit
 *    (POST /api/v1/documents/:documentId/versions/:versionId/verify) vérifie
 *    UNE version de Document (checksum) et rend un verdict technique ; il ne
 *    réalise ni échantillonnage ni vérification de préfixe et ne produit
 *    aucun rapport signé. Il n'est pas appelé par ces écrans.
 *
 * Conséquences : aucune requête métier, aucun agrégat calculé dans le
 * navigateur, aucune mesure, aucun état de base ni de compartiment, aucun nom
 * de compartiment, de préfixe physique ou d'URL présignée. Les valeurs
 * absentes sont rendues « — » (indisponibilité), jamais 0 ; chaque action
 * écrite par les fiches est désactivée et identifiée par
 * `data-unavailable-action` ; chaque capacité absente est déclarée en
 * BACKEND_GAP (unités ADM-59 et ADM-60 de `gaps.ts`).
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

function DataInfrastructureGaps({
  unitId,
  pathname,
  screenCode,
}: Pick<AdminUnitProps, 'unitId' | 'pathname'> & { screenCode: string }) {
  return <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={adminGapsFor(unitId, pathname)} />;
}

/* ────────────── ADM-59 · PostgreSQL & Hyperdrive ────────────── */

export function Admin59PostgresHyperdrive({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Infra · PostgreSQL & Hyperdrive"
        lede="Aucune route ADMIN ne publie l’état de la base ni du regroupement de connexions : ni latence de requête, ni connexions actives, ni requête lente, ni retard de réplication, ni historique de migration ne sont lisibles. Le rapport public /healthz décrit la seule frontière de persistance observée par l’API et ne fournit aucune de ces mesures ; il n’est pas utilisé comme substitut ici."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'LATENCE REQUÊTE P95', value: '—' },
        { label: 'CONNEXIONS ACTIVES / POOL', value: '—' },
        { label: 'REQUÊTES LENTES (N, SEUIL)', value: '—' },
        { label: 'RETARD DE RÉPLICATION', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-infrastructure="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni zéro, ni un état nominal, ni l’absence d’incident ou de saturation. La configuration du dépôt (dimension du pool local du Worker, délai d’instruction, binding de persistance résolu à la composition) est un paramètre, pas une mesure d’exécution : elle n’est pas affichée comme un relevé.
      </p>
      <Panel title="Charge & latence · 24 h" zone="timeline">
        <EmptyNotice>
          Aucune série n’est disponible : ni requêtes par seconde, ni latence p50/p95, ni connexions. Aucune courbe n’est tracée à partir d’un seuil, d’un exemple ou d’une capture antérieure. Les seuils de saturation ne sont pas affichés faute de mesure à comparer.
        </EmptyNotice>
      </Panel>
      <Panel title="Migrations & réversibilité" zone="list">
        <EmptyNotice>
          Aucun historique versionné n’est exposé à l’ADMIN : ni version appliquée, ni version en attente, ni date, ni fenêtre annoncée, ni caractère irréversible. Le manifeste de migrations du produit est vérifié côté serveur, mais ce contrôle n’est pas une lecture ADMIN d’historique et n’est pas appelé ici. L’absence de version affichée ne prouve ni une base à jour, ni une base en retard.
        </EmptyNotice>
      </Panel>
      <DataTable
        caption="Requêtes lentes (forme normalisée)"
        head={['Requête (forme normalisée)', 'Appels', 'Latence médiane', 'Index utilisé', 'Origine', 'Impact estimé']}
        rows={[]}
        empty={<EmptyNotice>Aucune requête lente n’est exposée : ni forme normalisée, ni nombre d’appels, ni latence médiane, ni usage d’index, ni origine. L’absence de lignes ne prouve ni l’absence de requête lente, ni la santé des plans d’exécution. Aucune valeur de donnée n’est affichée, même masquée.</EmptyNotice>}
      />
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions de base de données indisponibles"
          items={[
            {
              label: 'Lire l’état de la base',
              reference: 'GET /admin/infra/postgres',
              reason: 'Aucune route ADMIN d’état de la base ou du regroupement de connexions n’est déclarée ni servie par un handler : cette référence ne répond aucune donnée.',
            },
            {
              label: 'Ouvrir une requête',
              reference: 'GET /admin/infra/postgres/slow-queries',
              reason: 'Aucune lecture ADMIN des requêtes lentes n’existe ; aucune forme normalisée n’est fournie côté serveur et rien n’est reconstruit dans le navigateur.',
            },
            {
              label: 'Voir les migrations',
              reference: 'GET /admin/infra/postgres/migrations',
              reason: 'Aucun historique de migration n’est exposé à l’ADMIN : ni version, ni état, ni date de fenêtre.',
            },
            {
              label: 'Proposer un index',
              reference: 'POST /admin/infra/postgres/index-proposals',
              reason: 'Aucune revue d’index n’existe côté serveur et aucune console SQL n’est ouverte depuis le navigateur : une proposition ne pourrait être ni déposée, ni relue.',
            },
          ]}
        />
      </Panel>
      <ActionRow>
        <Link href="/admin/infra/r2" className="lbm-admin__link">Stockage objet · source absente</Link>
        <Link href="/admin/infra" className="lbm-admin__link">Topologie · source absente</Link>
      </ActionRow>
      <DataInfrastructureGaps unitId={unitId} pathname={pathname} screenCode="ADM-59" />
    </>
  );
}

/* ─────────── ADM-60 · stockage objet & médias ─────────── */

export function Admin60ObjectStorage({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Infra · stockage objet & médias"
        lede="Aucune route ADMIN ne publie le stockage objet : ni volume, ni nombre d’objets, ni coût, ni latence de distribution, ni erreur d’accès, ni répartition par classe. Aucun nom de compartiment, de préfixe physique ou d’URL présignée n’est affiché, et aucune occupation n’est calculée dans le navigateur."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'VOLUME TOTAL', value: '—' },
        { label: 'OBJETS', value: '—' },
        { label: 'COÛT ESTIMÉ DU MOIS', value: '—' },
        { label: 'LATENCE DE DISTRIBUTION P95', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-infrastructure="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni zéro octet, ni un stockage sain, ni une facturation nulle. Aucun total n’est additionné à partir des fiches de Documents et aucun tarif n’est appliqué : le modèle financier et les coûts ne sont pas calculés ici.
      </p>
      <Panel title="Volume par classe & croissance · 30 j" zone="timeline">
        <EmptyNotice>
          Aucune répartition chaud / froid / archive, aucune courbe de croissance et aucune politique de transition automatique ne sont exposées. Aucun octet n’est agrégé dans le navigateur et la rétention légale n’est jamais arbitrée par un affichage.
        </EmptyNotice>
      </Panel>
      <Panel title="Domaines fonctionnels déclarés par la fiche" zone="list">
        <p className="lbm-caption lbm-muted" data-declared-domains="true">
          Documents, preuves, médias de session et exports : ces quatre domaines sont la structure ÉCRITE par la fiche, pas un relevé. Ils ne portent ici ni nombre d’objets, ni volume, ni date de dernière écriture, ni état de checksum — faute de source ADMIN qui les fournisse.
        </p>
      </Panel>
      <DataTable
        caption="Préfixes logiques"
        head={['Domaine', 'Objets', 'Volume', 'Dernière écriture', 'Intégrité des checksums', 'Préfixe logique']}
        rows={[]}
        empty={<EmptyNotice>Aucune ligne n’est exposée : ni objet, ni volume, ni dernière écriture, ni verdict de checksum. L’absence de lignes ne prouve ni un stockage vide, ni une intégrité vérifiée, ni une disponibilité. Aucun nom de compartiment ni préfixe physique n’est affiché.</EmptyNotice>}
      />
      <Panel title="Erreurs d’accès & distribution" zone="list">
        <EmptyNotice>
          Aucun taux d’erreur, aucune cause (signature expirée, permission refusée) et aucun correctif ne sont fournis par une source ADMIN. Aucune erreur n’est déduite d’un fichier de configuration ni d’un échec de navigation.
        </EmptyNotice>
      </Panel>
      <Panel title="Intégrité & rétention" zone="list">
        <EmptyNotice>
          Aucune vérification par échantillonnage d’un préfixe n’existe côté serveur : ni empreinte prélevée, ni sceau, ni rapport signé, ni restauration depuis une réplique. Le contrôle d’intégrité technique du produit porte sur UNE version de Document et rend un verdict technique ; il ne réalise pas d’échantillonnage de préfixe et n’est pas appelé ici. Aucune politique de rétention, aucune durée de conservation et aucun nettoyage de fichier orphelin ne sont exposés : rien n’est purgé, proposé ni programmé depuis cette vue.
        </EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions de stockage indisponibles"
          items={[
            {
              label: 'Lire l’état du stockage',
              reference: 'GET /admin/infra/r2',
              reason: 'Aucune route ADMIN de lecture du stockage (volume, occupation, disponibilité) n’est déclarée ni servie : cette référence ne répond aucune donnée.',
            },
            {
              label: 'Ouvrir les préfixes logiques',
              reference: 'GET /admin/infra/r2/prefixes',
              reason: 'Aucun agrégat par domaine n’est exposé côté serveur ; aucun volume n’est calculé localement à partir des fiches de Documents.',
            },
            {
              label: 'Vérifier l’intégrité d’un préfixe',
              reference: 'POST /admin/infra/r2/verify {prefix}',
              reason: 'Aucune commande de vérification n’est installée : aucun échantillon ne peut être prélevé, signé ni conservé comme preuve.',
            },
            {
              label: 'Voir la politique de rétention',
              reference: 'GET /admin/infra/r2/retention',
              reason: 'Aucune politique de rétention n’est publiée par le serveur : aucune durée, aucune classe ni priorité légale n’est affichée.',
            },
          ]}
        />
      </Panel>
      <ActionRow>
        <Link href="/admin/infra/postgres" className="lbm-admin__link">Base & regroupement de connexions · source absente</Link>
        <Link href="/admin/infra" className="lbm-admin__link">Topologie · source absente</Link>
      </ActionRow>
      <DataInfrastructureGaps unitId={unitId} pathname={pathname} screenCode="ADM-60" />
    </>
  );
}
