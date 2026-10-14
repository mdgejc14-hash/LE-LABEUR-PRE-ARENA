/**
 * P4G-8 — ADM-25, unité exacte « ADM — salaire (litiges) » de
 * `design/llab/units.py`, route P0 `/admin/salaire/litiges` (domaine
 * « Paiements & Réconciliation », archétype « Corriger la vérité financière »).
 *
 * VÉRIFICATION DES SOURCES AVANT CODAGE (inspection de `routeContracts.ts`, de
 * la composition du worker `entry.ts`, de `paymentRepository.ts`, de
 * `salaryConfirmation.ts`, de `paymentReconciliationBatch.ts`, de
 * `disputes/records.ts` et `claimRepository.ts`, et requête réelle sur le
 * worker composé avec une session ADMIN) :
 *
 *  - les deux références de design de la fiche
 *    (`GET /admin/salary/disputes?cursor=` et
 *    `POST /admin/salary/disputes/:id/resolve {decision, entries, motive}`) ne
 *    figurent PAS dans `API_ROUTE_CONTRACTS` et aucun handler ne les sert :
 *    chacune répond 404 (`NOT_FOUND`) sur le worker composé. Aucune permission
 *    ADMIN dédiée aux contestations salariales ou aux écritures compensatoires
 *    n'existe dans `ADMIN_PERMISSIONS`.
 *  - distinction avec `Claim` (`admin.claims.list`, `admin.claims.read` avec
 *    `incidents:read:any` ; `admin.claims.review`,
 *    `admin.claims.evidence.request`, `admin.claims.decision` avec
 *    `incidents:arbitrate`, couverts par ADM-26 → ADM-30) : même lorsqu'un
 *    `Claim` porte le type `SALARY_NOT_RECEIVED` ou `PAYMENT_DISPUTE`,
 *    `ClaimView` est un dossier procédural entre Employeur et Candidat
 *    (`OPEN`, `EVIDENCE_REQUESTED`, `UNDER_REVIEW`, `ADMIN_REVIEW`,
 *    `RESOLVED`, `REJECTED`, `CLOSED`). Il n'expose ni montant du Salaire, ni
 *    montant contesté, ni motif salarial structuré (`non reçu`, `montant
 *    erroné`, `preuve refusée`), ni solde avant/après, ni table d'écritures
 *    compensatoires proposées, ni taux de fondement ; et la décision
 *    `admin.claims.decision` (`RESOLVE` / `REJECT`) ne modifie jamais un
 *    `Payment` ni une `salary_confirmations` et ne produit aucune écriture
 *    financière. Un `Claim` n'est donc pas traité comme une contestation
 *    salariale d'ADM-25.
 *  - distinction avec `Payment` (`admin.payments.list`, `payments.read` avec
 *    `payments:read:any` ; `admin.payments.approve`, `admin.payments.reject`,
 *    `admin.payments.confirm` avec `payments:approve` / `payments:reject`,
 *    couverts par ADM-18, ADM-21 et ADM-23) : `PaymentView` expose les
 *    échéances de nature `SALARY` et les tentatives de déclaration externe de
 *    l'Employeur (`PENDING`, `VERIFIED`, `REJECTED`). Un statut `REJECTED`
 *    signifie le rejet ADMIN d'une déclaration externe, jamais une
 *    contestation ouverte par une partie ni une proposition d'écriture
 *    compensatoire.
 *  - distinction avec `salary_confirmations` (`payments.salary.confirmation.request`
 *    réservée à `EMPLOYER`, `payments.salary.confirmation.confirm` réservée à
 *    `CANDIDATE`, 403 pour `ADMIN`) : aucune route ADMIN ne lit les
 *    confirmations OTP et l'enregistrement ne porte ni état contesté ni
 *    mécanisme de correction.
 *  - distinction avec `payment_reconciliation` (`admin.payment-reconciliation.reviews.correction-attempt`
 *    avec `payments:approve`, couvert par ADM-19) : une tentative de correction
 *    de rapprochement est une proposition append-only (`status: 'RECORDED'`) de
 *    champs normalisés sur un item de lot (`reviewId`), jamais appliquée à un
 *    `Payment` ou un Salaire et dépourvue de solde avant/après.
 *
 * Conséquences : aucune requête vers une API de substitution, aucun montant
 * contesté, aucun solde avant/après, aucune écriture compensatoire, aucun
 * remboursement, aucune retenue et aucun versement simulé. Les valeurs
 * absentes sont rendues « — » (indisponible), jamais 0 ; chaque action écrite
 * par la fiche est désactivée et identifiée par `data-unavailable-action` ;
 * chaque capacité absente est déclarée en BACKEND_GAP (unité ADM-25 de
 * `gaps.ts`).
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
} from '../components';
import { adminGapsFor } from '../screenMap';
import type { AdminUnitProps } from '../types';
import { ADMIN_UI_TERMS } from '../vocabulary';

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

function SalaryDisputesGaps({
  unitId,
  pathname,
}: Pick<AdminUnitProps, 'unitId' | 'pathname'>) {
  return <GapNotice title="BACKEND_GAP · ADM-25" items={adminGapsFor(unitId, pathname)} />;
}

/* ─────────── ADM-25 · Salaire — contestations & corrections ─────────── */

export function Admin25SalaryDisputes({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.SALARY_DISPUTES_CORRECTIONS}
        lede="Aucune route ADMIN ne publie de file de contestations salariales ni de table d’écritures compensatoires : ni GET /admin/salary/disputes?cursor= ni POST /admin/salary/disputes/:id/resolve ne sont déclarées dans le catalogue serveur ou servies par un handler (404 vérifié sur le worker composé). Le Salaire demeure un paiement externe entre l’Employeur et le Candidat ; ni les Claims (ADM-26 → ADM-30), ni les échéances Payment de nature SALARY (ADM-18, ADM-21, ADM-23), ni les tentatives de correction de rapprochement append-only (ADM-19) ne constituent un grand livre de correction salariale et aucun n’est utilisé comme substitut ici."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow
        items={[
          { label: 'CONTESTATIONS OUVERTES', value: '—' },
          { label: 'MONTANT TOTAL EN JEU', value: '—' },
          { label: 'DÉLAI MÉDIAN DE RÉSOLUTION', value: '—' },
          { label: 'TAUX DE CONTESTATIONS JUGÉES FONDÉES', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-salary-disputes="true">
        « — » indique qu’aucune source ADMIN ne fournit la valeur : ce n’est ni zéro, ni un montant nul, ni un délai nul, ni un taux de fondement à 0 % ou 100 %, ni l’attestation d’une absence de désaccord salarial. Aucun montant et aucun taux de calibrage ne sont calculés dans le navigateur.
      </p>
      <Panel title="File de contestations salariales" zone="list">
        <EmptyNotice>
          Aucune carte de contestation salariale n’est disponible : aucun objet serveur n’expose un montant contesté, la partie qui conteste, un motif salarial structuré (non reçu, montant erroné, preuve refusée), une ancienneté ou un niveau d’urgence, ni les états écrits par la fiche (Ouvert, Preuve demandée, Résolu — fondé, Résolu — non fondé).
        </EmptyNotice>
        <div data-salary-dispute-distinctions="true">
          <KeyValues
            title="Distinctions vérifiées avec les capacités serveur existantes"
            items={[
              {
                label: 'Claims (ADM-26 → ADM-30 · incidents:read:any, incidents:arbitrate)',
                value: 'Un Claim (même de type SALARY_NOT_RECEIVED ou PAYMENT_DISPUTE) est un dossier procédural entre Employeur et Candidat : ClaimView n’expose ni montant du Salaire, ni montant contesté, ni solde avant/après, ni écriture compensatoire, et admin.claims.decision (RESOLVE / REJECT) ne modifie jamais un Paiement ni une confirmation de Salaire. Aucune file de Claim n’est réutilisée comme substitut.',
              },
              {
                label: 'Paiements de nature SALARY (ADM-18, ADM-21, ADM-23 · payments:read:any)',
                value: 'admin.payments.list et payments.read exposent les échéances de Salaire et les tentatives de déclaration externe de l’Employeur (PENDING, VERIFIED, REJECTED). Un statut REJECTED correspond au rejet ADMIN d’une déclaration externe (admin.payments.reject, payments:reject), jamais à une contestation ouverte par une partie ni à une écriture compensatoire.',
              },
              {
                label: 'Confirmations OTP de Salaire (ADM-23/24 · routes réservées aux parties)',
                value: 'payments.salary.confirmation.request est réservée à l’Employeur (403 pour ADMIN) et payments.salary.confirmation.confirm au Candidat (403 pour ADMIN). Aucune route ADMIN ne lit salary_confirmations, qui ne comporte ni état contesté ni écriture de correction.',
              },
              {
                label: 'Tentatives de correction de rapprochement (ADM-19 · payments:approve)',
                value: 'admin.payment-reconciliation.reviews.correction-attempt consigne une proposition append-only (status RECORDED) de champs normalisés sur un item de lot de rapprochement identifié (reviewId) : elle n’est jamais appliquée à un Paiement ou un Salaire et ne produit aucune écriture compensatoire.',
              },
              {
                label: 'Règle produit sur le Salaire externe',
                value: 'Le Salaire est payé en dehors de la plateforme entre l’Employeur et le Candidat : LE LABEUR ne reçoit, ne détient, ne corrige, ne rembourse, ne retient et ne verse aucun Salaire.',
              },
            ]}
          />
        </div>
      </Panel>
      <DataTable
        caption="Écritures proposées"
        head={[
          'Référence d’écriture',
          'Versement de Salaire',
          'Écriture motivée',
          'Solde avant',
          'Impact (tnum)',
          'Solde après',
          'Référence au journal',
        ]}
        rows={[]}
        empty={
          <EmptyNotice>
            Aucune écriture compensatoire proposée par le système n’est disponible : le modèle serveur ne comporte ni grand livre de solde salarial (solde avant / solde après), ni génération d’écritures compensatoires motivées, ni mécanisme de correction de Salaire, de remboursement, de retenue ou de versement. Aucune écriture n’est fabriquée dans le navigateur.
          </EmptyNotice>
        }
      />
      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions de contestation salariale indisponibles"
          items={[
            {
              label: 'Charger la file de contestations salariales',
              reference: 'GET /admin/salary/disputes?cursor=',
              reason: 'Aucune route ADMIN de file de contestations salariales n’est déclarée dans routeContracts.ts ni servie par un handler composé (404 vérifié).',
            },
            {
              label: 'Résoudre',
              reference: 'POST /admin/salary/disputes/:id/resolve {decision, entries, motive}',
              reason: 'Aucune commande serveur de résolution de contestation salariale ni d’application d’écritures compensatoires n’existe (404 vérifié) : aucune correction de Salaire, remboursement, retenue ou versement ne peut être exécuté.',
            },
            {
              label: 'Demander une pièce',
              reference: 'ADM-25 · demande de pièce sur contestation salariale',
              reason: 'Aucune route ADMIN ne demande de pièce sur une contestation salariale ; les demandes de justificatif d’un Claim relèvent exclusivement du dossier Claim (ADM-27/28, permission incidents:arbitrate).',
            },
          ]}
        />
      </Panel>
      <ActionRow>
        <Link href="/admin/salaire/confirmations" className="lbm-admin__link">Confirmations de Salaire · ADM-23</Link>
        <Link href="/admin/paiements" className="lbm-admin__link">Vue globale des Paiements · ADM-18</Link>
        <Link href="/admin/paiements/reconciliation" className="lbm-admin__link">Rapprochement des Paiements · ADM-19</Link>
        <Link href="/admin/litiges" className="lbm-admin__link">Registre des Claims · ADM-26</Link>
      </ActionRow>
      <SalaryDisputesGaps unitId={unitId} pathname={pathname} />
    </>
  );
}
