/**
 * ADM-23 → ADM-24 — supervision ADMIN des confirmations de Salaire et des
 * preuves de réception, selon l'unité exacte du Master Design
 * « ADM — salaire (confirmations & preuves OTP) ».
 *
 * Audit backend de cette tranche (aucune route n'est créée ni contournée) :
 *  - admin.payments.list (GET /api/v1/admin/payments, permission serveur
 *    payments:read:any) fournit la file réelle : les Paiements de nature
 *    SALARY de la page chargée, avec les états du cycle servis par le
 *    serveur (SCHEDULED → DUE → PENDING_VERIFICATION → VERIFIED → PAID,
 *    REJECTED) ;
 *  - payments.read (GET /api/v1/payments/:paymentId) autorise explicitement
 *    l'ADMIN avec payments:read:any pour la consultation unitaire ;
 *  - la demande de confirmation OTP est réservée à l'Employeur et la
 *    confirmation elle-même au Candidat (routes owner, contrôlées serveur) :
 *    l'ADMIN ne la demande ni ne la confirme à leur place ;
 *  - aucune route ADMIN ne lit l'état de confirmation, la file de
 *    confirmations, les statistiques, les relances ni le dossier d'une
 *    preuve : tout cela est déclaré BACKEND_GAP dans `gaps.ts`, sans valeur
 *    de remplacement.
 *
 * Règles absolues : aucun secret OTP n'est affiché ni déduit ; déclaration,
 * vérification, état PAID et confirmation du Candidat restent quatre états
 * distincts ; aucun montant n'est agrégé dans le navigateur ; aucune donnée
 * n'est simulée.
 */

import { useCallback, useState } from 'react';
import {
  ActionError,
  ActionRow,
  DataTable,
  EmptyNotice,
  Field,
  GapNotice,
  KeyValues,
  KpiRow,
  Link,
  LoadingBlock,
  NeoPressButton,
  PageHead,
  Panel,
  RetryButton,
  StatusSeal,
} from '../components';
import { adminGapsFor } from '../screenMap';
import { adminError, type AdminError } from '../errors';
import { useAdminApi, useAdminResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { AdminApi, PaymentView } from '../api';
import type { AdminUnitProps } from '../types';
import type { PaymentLifecycleStatus } from '../../domain/paymentLifecycle';
import {
  ADMIN_UI_TERMS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  formatDateTime,
  formatPaymentAmount,
} from '../vocabulary';

const PAGE_LIMIT = 100;

/* ── Lecture réelle de admin.payments.list (curseur serveur conservé). ── */

interface PaymentPageState {
  readonly items: readonly PaymentView[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
  readonly persistence?: string;
}

async function loadPayments(api: AdminApi, signal: AbortSignal): Promise<PaymentPageState> {
  const page = await api.payments({ limit: PAGE_LIMIT, signal });
  return {
    items: page.items,
    cursor: page.cursor,
    hasMore: page.hasMore,
    ...(page.persistence ? { persistence: page.persistence } : {}),
  };
}

function usePaymentsPage() {
  const api = useAdminApi();
  const resource = useAdminResource<PaymentPageState>(loadPayments, []);
  const [additional, setAdditional] = useState<{
    readonly items: readonly PaymentView[];
    readonly cursor: string | null;
    readonly hasMore: boolean;
  } | null>(null);
  const [nextPage, setNextPage] = useState<{ readonly busy: boolean; readonly error: AdminError | null }>({
    busy: false,
    error: null,
  });

  const base = resource.data;
  const items = base ? [...base.items, ...(additional?.items ?? [])] : null;
  const cursor = additional ? additional.cursor : base?.cursor ?? null;
  const hasMore = additional ? additional.hasMore : base?.hasMore ?? false;

  // Un seul envoi à la fois ; l'échec de la page suivante ne masque jamais la
  // page déjà chargée (état d'erreur affiché séparément).
  const loadMore = useCallback(() => {
    if (!api || !cursor || nextPage.busy) return;
    setNextPage({ busy: true, error: null });
    api
      .payments({ limit: PAGE_LIMIT, cursor })
      .then((page) => {
        setAdditional((previous) => ({
          items: [...(previous?.items ?? []), ...page.items],
          cursor: page.cursor,
          hasMore: page.hasMore,
        }));
        setNextPage({ busy: false, error: null });
      })
      .catch((cause: unknown) => setNextPage({ busy: false, error: adminError(cause) }));
  }, [api, cursor, nextPage.busy]);

  const reload = useCallback(() => {
    setAdditional(null);
    setNextPage({ busy: false, error: null });
    resource.reload();
  }, [resource.reload]);

  return {
    ...resource,
    items,
    cursor,
    hasMore,
    persistence: base?.persistence,
    loadMore,
    loadMoreBusy: nextPage.busy,
    loadMoreError: nextPage.error,
    reload,
  };
}

/* ── Présentation des valeurs de domaine sans renommer les codes serveur. ── */

function isPaymentStatus(value: unknown): value is PaymentLifecycleStatus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAYMENT_STATUS_LABELS, value);
}

function statusSeal(value: unknown): { tone: 'slate' | 'amber' | 'violet' | 'emerald' | 'clay' | 'gold'; label: string } {
  if (!isPaymentStatus(value)) return { tone: 'slate', label: `Statut non reconnu · ${String(value ?? '—')}` };
  return { tone: PAYMENT_STATUS_TONES[value], label: `${PAYMENT_STATUS_LABELS[value]} · ${value}` };
}

function statusCount(items: readonly PaymentView[], status: PaymentLifecycleStatus): number {
  return items.filter((payment) => payment.status === status).length;
}

/** Repère d'absence : BACKEND_GAP assumé, jamais un zéro présenté comme réel. */
function gapKpi(label: string): { label: string; value: string } {
  return { label: `${label} · BACKEND_GAP`, value: '—' };
}

function filterSalaryPayments(items: readonly PaymentView[], query: string): PaymentView[] {
  const needle = query.trim().toLocaleLowerCase('fr-FR');
  return items.filter((payment) => {
    if (payment.paymentType !== 'SALARY') return false;
    if (!needle) return true;
    return [
      payment.paymentId,
      payment.contractId,
      payment.employerId,
      payment.candidateId,
      payment.periodKey,
      payment.status,
    ].some((value) => value.toLocaleLowerCase('fr-FR').includes(needle));
  });
}

/* ── ADM-23 : file réelle des Paiements Salaire, confirmations non exposées. ── */

function SalaryConfirmations({ unitId, pathname }: AdminUnitProps) {
  const resource = usePaymentsPage();
  const [query, setQuery] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const gaps = adminGapsFor(unitId, pathname);
  const all = resource.items ?? [];
  const salary = all.filter((payment) => payment.paymentType === 'SALARY');
  const visible = filterSalaryPayments(all, query);

  if (resource.status === 'error' && !resource.items) {
    return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  }
  if (!resource.items) return <LoadingBlock label={ADMIN_UI_TERMS.SALARY_CONFIRMATION_QUEUE} rows={5} />;

  return (
    <>
      {resource.status === 'loading' ? <LoadingBlock label="Actualisation des Paiements Salaire" rows={1} /> : null}
      <PageHead
        title={ADMIN_UI_TERMS.SALARY_CONFIRMATION_QUEUE}
        lede="États serveur des Paiements de nature Salaire de la page chargée. La confirmation du Candidat n’est exposée par aucune route ADMIN : elle n’est jamais déduite, jamais simulée."
        seal={{ tone: 'gold', label: 'Salaire · états serveur' }}
      />

      <KpiRow
        items={[
          { label: 'SALAIRES — PAGE CHARGÉE', value: String(salary.length) },
          { label: 'EN ATTENTE DE VÉRIFICATION', value: String(statusCount(salary, 'PENDING_VERIFICATION')) },
          { label: 'VÉRIFIÉS — NON PAYÉS', value: String(statusCount(salary, 'VERIFIED')) },
          { label: 'PAYÉS (ÉTAT DU CYCLE)', value: String(statusCount(salary, 'PAID')) },
          { label: 'DÉCLARATIONS REJETÉES', value: String(statusCount(salary, 'REJECTED')) },
          gapKpi('EN ATTENTE D’OTP'),
          gapKpi('OTP EXPIRÉS'),
          gapKpi('CONFIRMÉS PAR LE CANDIDAT'),
        ]}
      />

      <Panel title="Déclaration, vérification, état PAID et confirmation du Candidat" zone="list" tone="notice">
        Quatre états distincts, jamais confondus : une déclaration employeur ne vaut jamais vérification ; VERIFIED ne vaut pas PAID ; PAID n’est ni un transfert de fonds par LE LABEUR ni la confirmation de réception par le Candidat ; l’absence de confirmation n’est jamais assimilée à un paiement non effectué.
      </Panel>

      <Panel title="Recherche dans la page chargée" zone="list">
        <Field label="Identifiant de Paiement, Contrat, Employeur, Candidat ou période">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Rechercher un Paiement Salaire"
            placeholder="Identifiant exact"
          />
        </Field>
        <p className="lbm-caption lbm-muted">
          Filtre local appliqué à la page réellement chargée : aucun filtre serveur ni agrégat de montants n’est produit dans le navigateur.
        </p>
      </Panel>

      {resource.persistence === 'not-configured' ? (
        <EmptyNotice>
          Le serveur répond une frontière de contrôle sans persistance métier (`not-configured`). Aucun Paiement réel n’est chargé ; cet état n’est pas présenté comme une file de confirmations vide.
        </EmptyNotice>
      ) : (
        <DataTable
          caption="Paiements de nature Salaire de la page réellement chargée"
          head={['Paiement', 'Contrat', 'Employeur', 'Candidat', 'Montant serveur', 'Période', 'Déclaré le', 'État du Paiement', 'Confirmation du Candidat', 'Consultation']}
          rows={visible.map((payment) => [
            <span key="payment" className="lbm-mono">{payment.paymentId}</span>,
            <span key="contract" className="lbm-mono">{payment.contractId}</span>,
            <span key="employer" className="lbm-mono">{payment.employerId}</span>,
            <span key="candidate" className="lbm-mono">{payment.candidateId}</span>,
            <span key="amount" className="lbm-mono">{formatPaymentAmount(payment.amount, payment.currency)}</span>,
            <span key="period" className="lbm-mono">{payment.periodKey}</span>,
            <span key="declared">{formatDateTime(payment.submittedAt) ?? '—'}</span>,
            <StatusSeal key="status" {...statusSeal(payment.status)} size="sm" />,
            <span key="confirmation" className="lbm-caption lbm-muted">Non exposée · BACKEND_GAP</span>,
            <button
              key="open"
              type="button"
              className="lbm-admin__link"
              onClick={() => setSelectedPaymentId(payment.paymentId)}
              aria-label={`Consulter le Paiement ${payment.paymentId}`}
            >
              Consulter
            </button>,
          ])}
          empty={(
            <EmptyNotice>
              {resource.persistence === 'not-configured'
                ? 'Frontière de contrôle serveur : aucune donnée métier à afficher.'
                : query
                  ? 'Aucun Paiement Salaire sur le filtre appliqué localement à la page chargée.'
                  : 'Aucun Paiement de nature Salaire n’est renvoyé par la page réellement chargée.'}
            </EmptyNotice>
          )}
        />
      )}

      {resource.persistence !== 'not-configured' && visible.length > 0 && selectedPaymentId ? (
        <SalaryPaymentConsultation
          paymentId={selectedPaymentId}
          onClose={() => setSelectedPaymentId(null)}
        />
      ) : null}

      <ActionRow>
        {resource.hasMore ? (
          <NeoPressButton variant="ghost" onClick={resource.loadMore} loading={resource.loadMoreBusy}>
            Charger la page suivante
          </NeoPressButton>
        ) : null}
        <RetryButton onClick={resource.reload} />
        <Link href="/admin/paiements" className="lbm-admin__link">Registre des paiements</Link>
      </ActionRow>
      {resource.loadMoreError ? <ActionError error={resource.loadMoreError} /> : null}
      {resource.hasMore ? (
        <p className="lbm-caption lbm-muted">
          La page suivante utilise le curseur opaque retourné par le serveur ; les repères restent limités aux paiements chargés.
        </p>
      ) : null}
      <GapNotice title="BACKEND_GAP · ADM-23" items={gaps} />
    </>
  );
}

/* ── Consultation unitaire : payments.read réel, permission ADMIN vérifiée serveur. ── */

function SalaryPaymentConsultation({
  paymentId,
  onClose,
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const resource = useAdminResource<PaymentView>((api, signal) => api.payment(paymentId, signal), [paymentId]);
  const payment = resource.data;

  return (
    <section className="lbm-admin__zone" role="region" aria-label="Consultation du Paiement Salaire" data-payment-detail={paymentId}>
      <div className="lbm-admin__actions">
        <h2 className="lbm-title-2">Consultation · Paiement {paymentId}</h2>
        <button type="button" className="lbm-admin__link" onClick={onClose} aria-label="Fermer la consultation">Fermer</button>
      </div>
      {resource.status === 'error' ? <SystemFeedback {...resource.error!} retry={resource.reload} />
        : resource.status === 'loading' || !payment ? <LoadingBlock label="Chargement du Paiement" rows={3} />
          : (
            <>
              <Panel title="États réellement renvoyés par le serveur" zone="list">
                <KeyValues title="Cycle du Paiement" items={[
                  { label: 'Référence du Paiement', value: payment.paymentId },
                  { label: 'Référence du Contrat', value: payment.contractId },
                  { label: 'Employeur (identifiant serveur)', value: payment.employerId },
                  { label: 'Candidat (identifiant serveur)', value: payment.candidateId },
                  { label: 'Montant unitaire serveur', value: formatPaymentAmount(payment.amount, payment.currency) },
                  { label: 'Statut serveur (code intact)', value: isPaymentStatus(payment.status) ? `${PAYMENT_STATUS_LABELS[payment.status]} · ${payment.status}` : String(payment.status) },
                  { label: 'Déclaration reçue', value: payment.declared ? 'Oui' : 'Non' },
                  { label: 'Vérification LE LABEUR', value: payment.verified ? 'Vérifié par le cycle' : 'Non vérifié' },
                  { label: 'Statut PAID du cycle', value: payment.paid ? 'Oui · état serveur PAID' : 'Non' },
                  { label: 'Confirmation du Candidat (OTP)', value: 'Non exposée par le DTO Payment ; aucune confirmation n’est déduite.' },
                ]} />
                {payment.status === 'PAID' ? (
                  <EmptyNotice>
                    PAID est le statut réel du cycle : ce n’est ni un transfert de fonds par LE LABEUR ni une confirmation de réception par le Candidat.
                  </EmptyNotice>
                ) : null}
                {payment.status === 'VERIFIED' ? (
                  <EmptyNotice>
                    VERIFIED signale une déclaration vérifiée : elle ne vaut pas PAID et ne confirme pas la réception du Salaire par le Candidat.
                  </EmptyNotice>
                ) : null}
              </Panel>
              <GapNotice title="BACKEND_GAP · consultation" items={[
                'Le DTO Payment ne fournit ni état de confirmation OTP, ni dossier de preuve, ni tentative de saisie : ces valeurs restent indisponibles à l’ADMIN (ADM-23 / ADM-24).',
              ]} />
            </>
          )}
    </section>
  );
}

/* ── ADM-24 : dossier de preuve absent, aucun secret, aucun formulaire. ── */

function SalaryProofReview({ unitId, pathname, params }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  const reference = params.id ?? '—';

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.SALARY_PROOF_REVIEW}
        lede={`Référence transmise par le chemin : ${reference}. Aucun dossier de preuve n’est lisible côté ADMIN : aucune trace, aucun versement et aucune décision ne sont chargés faute de handler.`}
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow
        items={[
          gapKpi('EMPREINTE DE LA PREUVE'),
          gapKpi('HORODATAGE ET VOIE DU CODE'),
          gapKpi('STATUT DE VALIDITÉ'),
          gapKpi('SIGNAUX DE FRAUDE'),
        ]}
      />
      <DataTable
        caption="Traces techniques de la preuve — aucune ligne exposée à l’ADMIN"
        head={['Événement', 'Horodatage', 'Acteur', 'Résultat']}
        rows={[]}
        empty={(
          <EmptyNotice>
            Aucun événement d’envoi, de saisie ou de tentative n’est exposé par le produit à l’ADMIN : la table reste vide plutôt que remplie d’une valeur inventée.
          </EmptyNotice>
        )}
      />
      <EmptyNotice>
        Aucun code, ni empreinte de code, ni graine, ni nonce n’est affiché — même en supervision. La confirmation OTP appartient au Candidat et reste hors de portée de cet écran.
      </EmptyNotice>
      <EmptyNotice>
        La demande de confirmation appartient à l’Employeur ; la validation ou l’invalidation motivée d’une preuve n’a aucune route ADMIN dans le produit : aucun geste n’est proposé ici (BACKEND_GAP).
      </EmptyNotice>
      <ActionRow>
        <Link href="/admin/salaire/confirmations" className="lbm-admin__link">Retour aux confirmations de Salaire</Link>
        <Link href="/admin/paiements" className="lbm-admin__link">Registre des paiements</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-24" items={gaps} />
    </>
  );
}

export function Admin23SalaryConfirmations(props: AdminUnitProps) {
  return <SalaryConfirmations {...props} />;
}

export function Admin24SalaryProofReview(props: AdminUnitProps) {
  return <SalaryProofReview {...props} />;
}
