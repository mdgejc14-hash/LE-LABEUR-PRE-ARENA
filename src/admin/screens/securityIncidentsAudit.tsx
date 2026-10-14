/**
 * P4G-5B — ADM-55/56, unité exacte « ADM — sécurité (incidents & audit) » de
 * `design/llab/units.py` (canons « ADM — sécurité (incidents) » et
 * « ADM — sécurité (audit) »), routes P0 `/admin/securite/incidents` et
 * `/admin/securite/audit`.
 *
 * VÉRIFICATION DES SOURCES AVANT CODAGE (rapport P4G-5A réexaminé, puis
 * inspection de `routeContracts.ts`, de la composition du worker `entry.ts` et
 * requête réelle sur le worker composé avec une session ADMIN) :
 *
 *  - `admin.audit.list` (GET /api/v1/admin/audit, permission `audit:read`) est
 *    déclaré ET composé : un ADMIN reçoit 200 avec
 *    `{resource:'audit', scope:'admin', items: [], cursor: null, limit,
 *    hasMore: false, persistence: 'not-configured'}`. C'est une FRONTIÈRE DE
 *    CONTRÔLE : elle ne lit pas le ledger d'audit et ne contient aucune entrée.
 *    Le seul ledger réel (`automation_audit_ledger`, alimenté par
 *    `USER_BLOCKED`, `SECURITY_ACCESS_DENIED`…) n'a AUCUNE route de lecture
 *    ADMIN, aucune empreinte de chaînage, aucun lien vers l'entrée précédente
 *    et aucune contrainte d'immuabilité en base. → Ne convient pas à ADM-56 et
 *    n'est pas appelé ici.
 *  - `admin.incidents.list` (GET /api/v1/admin/incidents, permission
 *    `incidents:read:any`) répond la même frontière (`items: []`,
 *    `persistence: 'not-configured'`). La ressource « incidents » du produit est
 *    un incident CONTRACTUEL arbitré (poursuite, annulation ou remplacement),
 *    pas un incident de sécurité classifié avec sévérité, confinement et
 *    preuves. → Ne convient pas à ADM-55 et n'est pas appelé ici.
 *  - `admin.incidents.arbitrate` (POST /api/v1/admin/incidents/:incidentId/
 *    arbitrate) est déclaré mais AUCUN handler n'est installé : la commande
 *    répond 501. Ce n'est pas une étape de procédure d'incident de sécurité.
 *  - les références de design `/api/v1/admin/security/incidents`,
 *    `/api/v1/admin/security/incidents/:id` et `/api/v1/admin/security/audit*`
 *    ne sont pas déclarées : elles répondent 404. Aucune permission ADMIN
 *    d'incident de sécurité ni de journal d'audit n'existe — `incidents:*` sert
 *    les Claims, la Réputation et les Documents.
 *
 * Conséquences : aucune requête métier, aucun compteur calculé dans le
 * navigateur, aucune chronologie d'incident, aucune classification, aucune
 * sévérité, aucune conclusion juridique. Les valeurs absentes sont rendues
 * « — » (indisponible) et jamais 0 ; chaque action prévue par les fiches est
 * désactivée et identifiée par `data-unavailable-action`. Un signal technique
 * classé par le serveur (refus d'accès, limitation de débit, rejet
 * d'idempotence) n'est ni un incident ni une vulnérabilité confirmée : il n'est
 * pas converti ici.
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
  KeyValues,
  KpiRow,
  Link,
  NeoPressButton,
  PageHead,
  Panel,
  StatusSeal,
  Timeline,
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

function IncidentsAuditGaps({
  unitId,
  pathname,
  screenCode,
}: Pick<AdminUnitProps, 'unitId' | 'pathname'> & { screenCode: string }) {
  return <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={adminGapsFor(unitId, pathname)} />;
}

/** Étapes de procédure ÉCRITES par la fiche ADM-55 — aucune instance exécutée. */
const DECLARED_INCIDENT_STEPS: readonly string[] = [
  'Détection',
  'Qualification',
  'Confinement',
  'Éradication',
  'Rétablissement',
  'Notification',
  'Post-mortem',
];

/* ────────────────── ADM-55 · incidents et procédures ────────────────── */

export function Admin55SecurityIncidents({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Sécurité · incidents et procédures"
        lede="Aucune route ADMIN ne publie d’incident de sécurité : ni classification, ni sévérité, ni périmètre, ni étape de procédure, ni preuve ne sont lisibles. Un signal technique classé par le serveur n’est pas un incident confirmé et ne le devient pas ici."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <Panel title="Incident" zone="hero">
        <p className="lbm-caption lbm-muted" data-no-invented-security="true">
          « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni zéro, ni un incident inexistant, ni une procédure engagée. Aucune référence de dossier n’est affichée, car aucun dossier n’est lu par cette route.
        </p>
        <KeyValues
          title="Champs d’incident non disponibles"
          items={[
            { label: 'Référence de dossier', value: '—' },
            { label: 'Classification', value: '—' },
            { label: 'Sévérité', value: '—' },
            { label: 'Périmètre estimé', value: '—' },
            { label: 'Statut', value: '—' },
            { label: 'Responsable', value: '—' },
          ]}
        />
      </Panel>
      <Panel title="Procédure écrite par la fiche — aucune instance d’incident chargée" zone="timeline">
        <p className="lbm-caption lbm-muted">
          La frise ci-dessous décrit la procédure ÉCRITE de la fiche, pas un déroulé observé : aucune étape n’est datée, signée, horodatée ni accompagnée d’une preuve, et aucune n’est marquée accomplie.
        </p>
        <div data-declared-procedure="true">
          <Timeline steps={DECLARED_INCIDENT_STEPS.map((label) => ({ label, done: false }))} />
        </div>
        <EmptyNotice>
          Aucune machine d’étapes n’est exposée : ni étape courante, ni responsable, ni preuve conservée. L’absence d’étape franchie n’atteste ni l’absence d’incident, ni l’absence de signal.
        </EmptyNotice>
      </Panel>
      <Panel title="Obligations de notification" zone="list">
        <EmptyNotice>
          Aucune obligation de notification n’est évaluée : ni personnes concernées, ni autorités, ni partenaires, ni presse. Aucune juridiction n’est présumée, aucune échéance légale n’est calculée et aucune conclusion juridique n’est produite faute de source serveur.
        </EmptyNotice>
        <p className="lbm-caption lbm-muted" data-no-invented-legal-conclusion="true">
          Ce registre ne remplace pas une procédure interne : aucune décision de notifier ou de ne pas notifier n’est enregistrée, motivée ni tracée dans cette vue.
        </p>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          {
            label: 'Lire un incident',
            reference: 'GET /admin/security/incidents/:id',
            reason: 'Aucune route ADMIN d’incident de sécurité n’est déclarée : cette référence ne répond aucune donnée.',
          },
          {
            label: 'Avancer l’étape',
            reference: 'POST /admin/security/incidents/:id/step {step, evidence}',
            reason: 'Aucune commande d’étape n’est installée ; une étape ne peut être ni datée, ni signée depuis cette interface.',
          },
          {
            label: 'Consigner une preuve',
            reference: 'ADM-55 · coffre de preuves déclaré par la fiche',
            reason: 'Aucune route ADMIN ne dépose ni ne lit une preuve d’incident ; aucun contenu probatoire n’est affiché.',
          },
          {
            label: 'Clore avec post-mortem',
            reference: 'POST /admin/security/incidents/:id/close {postmortem}',
            reason: 'Aucune clôture ni post-mortem ne peut être enregistré : la clôture d’un incident n’a aucun support serveur.',
          },
        ]} />
      </Panel>
      <ActionRow>
        <Link href="/admin/securite/audit" className="lbm-admin__link">Journal d’audit · source absente</Link>
        <Link href="/admin/securite" className="lbm-admin__link">Vue d’ensemble sécurité · source absente</Link>
      </ActionRow>
      <IncidentsAuditGaps unitId={unitId} pathname={pathname} screenCode="ADM-55" />
    </>
  );
}

/* ──────────────────── ADM-56 · journal d’audit ──────────────────── */

export function Admin56SecurityAudit({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title="Sécurité · journal d’audit"
        lede="Le ledger d’audit du produit existe côté serveur, mais aucune route ADMIN ne le lit : ni entrée, ni filtre, ni vérification de chaîne, ni export signé. La frontière de contrôle existante ne contient aucune donnée et n’est pas présentée comme ce journal."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow items={[
        { label: 'ENTRÉES · 24 H', value: '—' },
        { label: 'CHAÎNE VÉRIFIÉE', value: '—' },
        { label: 'DERNIER AUDIT D’INTÉGRITÉ', value: '—' },
        { label: 'RECHERCHE EN COURS', value: '—' },
      ]} />
      <p className="lbm-caption lbm-muted" data-no-invented-security="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni zéro, ni un journal vide, ni une chaîne intègre. Aucun nombre d’entrées n’est calculé dans le navigateur.
      </p>
      <DataTable
        caption="Journal d’audit consultable"
        head={['Horodatage', 'Acteur', 'Action', 'Ressource', 'Résultat', 'Empreinte d’événement', 'Lien de chaîne']}
        rows={[]}
        empty={<EmptyNotice>BACKEND_GAP : aucune entrée n’est exposée par une route ADMIN. L’absence de lignes ici n’atteste pas l’absence d’événements audités, et ne prouve aucune intégrité.</EmptyNotice>}
      />
      <Panel title="Recherche avancée" zone="form">
        <EmptyNotice>
          Les filtres écrits par la fiche (acteur, action, ressource, période, résultat) ne peuvent pas être exécutés : aucune commande de recherche serveur n’existe, y compris l’exécution détachée avec notification. Aucun champ n’est affiché — une saisie sans traitement serait une fausse commande.
        </EmptyNotice>
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls items={[
          {
            label: 'Vérifier l’intégrité de la chaîne',
            reference: 'POST /admin/security/audit/verify',
            reason: 'Aucune commande de vérification n’est installée et le ledger d’audit ne porte aucune empreinte de chaînage : aucun verdict d’intégrité ne peut être affiché.',
          },
          {
            label: 'Exporter (JSON signé)',
            reference: 'GET /admin/security/audit/export',
            reason: 'Aucun export ni manifeste d’empreintes n’est produit par le serveur ; aucun document signé n’est généré côté navigateur.',
          },
          {
            label: 'Lancer une recherche',
            reference: 'POST /admin/security/audit/search {query}',
            reason: 'Aucune recherche serveur n’est exposée : aucun filtre n’est envoyé et aucune requête n’est conservée.',
          },
          {
            label: 'Ouvrir une ressource',
            reference: 'GET /admin/security/audit?cursor=&filters=',
            reason: 'Aucune entrée de journal n’étant lisible, aucune ressource citée par une entrée ne peut être ouverte depuis cette vue.',
          },
        ]} />
      </Panel>
      <ActionRow>
        <Link href="/admin/securite/incidents" className="lbm-admin__link">Incidents et procédures · source absente</Link>
        <Link href="/admin/securite" className="lbm-admin__link">Vue d’ensemble sécurité · source absente</Link>
      </ActionRow>
      <IncidentsAuditGaps unitId={unitId} pathname={pathname} screenCode="ADM-56" />
    </>
  );
}
