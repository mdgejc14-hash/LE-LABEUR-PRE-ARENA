/**
 * ADM-18 → ADM-22 — registre des paiements, déclarations externes et résultats
 * de rapprochement, selon les deux unités exactes du Master Design.
 *
 * Les seules sources sont les handlers réellement branchés du cycle Payment et
 * du batch P0-PAY-3. Aucun agrégat, échéance, historique, anomalie, état de
 * vérification ou mouvement financier n'est fabriqué côté navigateur.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ActionError,
  ActionRow,
  DataTable,
  EmptyNotice,
  Field,
  FilterChips,
  GapNotice,
  GlassSurface,
  KeyValues,
  KpiRow,
  Link,
  LoadingBlock,
  NeoPressButton,
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  RetryButton,
  StatusSeal,
} from '../components';
import { adminGapsFor } from '../screenMap';
import { useAdminAction, useAdminApi, useAdminResource } from '../hooks';
import { useAdminActor } from '../UnitBoundary';
import { SystemFeedback } from '../../public/SystemFeedback';
import { newIdempotencyKey } from '../api';
import type {
  AdminApi,
  AdminPage,
  PaymentDeclarationRecord,
  PaymentReconciliationBatchReport,
  PaymentReconciliationCorrectionAttemptRecord,
  PaymentReconciliationReviewRecord,
  PaymentView,
} from '../api';
import type { AdminUnitProps } from '../types';
import type { PaymentLifecycleStatus, PaymentType } from '../../domain/paymentLifecycle';
import {
  ADMIN_UI_TERMS,
  PAYMENT_DECLARATION_OUTCOME_LABELS,
  PAYMENT_RECONCILIATION_BATCH_STATUS_LABELS,
  PAYMENT_RECONCILIATION_FIELD_LABELS,
  PAYMENT_RECONCILIATION_ITEM_STATUS_LABELS,
  PAYMENT_RECONCILIATION_REVIEW_DECISION_LABELS,
  PAYMENT_RECONCILIATION_VERDICT_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  PAYMENT_TYPE_LABELS,
  formatDateTime,
  formatPaymentAmount,
  paymentDueLabel,
} from '../vocabulary';

const PAGE_LIMIT = 100;
type PaymentReconciliationBatchItem = PaymentReconciliationBatchReport['items'][number];

/* ── Un seul envoi UI à la fois : les routes mutables gardent aussi leurs clés idempotentes serveur. ── */

function useSingleFlightAction<T>() {
  const action = useAdminAction<T>();
  const inFlight = useRef(false);
  const run = useCallback(async (task: (signal: AbortSignal) => Promise<T>) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    try {
      return await action.run(task);
    } finally {
      inFlight.current = false;
    }
  }, [action.run]);
  return { ...action, run };
}

/** Même commande et même payload = même clé en cas de rejeu après erreur réseau. */
function useCommandIdempotencyKey() {
  const current = useRef<string | null>(null);
  const get = useCallback(() => {
    if (!current.current) current.current = newIdempotencyKey();
    return current.current;
  }, []);
  const reset = useCallback(() => { current.current = null; }, []);
  return { get, reset };
}

/* ── Lecture réelle de `admin.payments.list` (curseur serveur conservé). ── */

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
  const nextPage = useSingleFlightAction<AdminPage<PaymentView>>();
  const [additional, setAdditional] = useState<{
    readonly items: readonly PaymentView[];
    readonly cursor: string | null;
    readonly hasMore: boolean;
  } | null>(null);

  const base = resource.data;
  const items = base ? [...base.items, ...(additional?.items ?? [])] : null;
  const cursor = additional ? additional.cursor : base?.cursor ?? null;
  const hasMore = additional ? additional.hasMore : base?.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (!api || !cursor || nextPage.busy) return;
    void nextPage.run((signal) => api.payments({ limit: PAGE_LIMIT, cursor, signal })).then((page) => {
      if (!page) return;
      setAdditional((previous) => ({
        items: [...(previous?.items ?? []), ...page.items],
        cursor: page.cursor,
        hasMore: page.hasMore,
      }));
    });
  }, [api, cursor, nextPage.busy, nextPage.run]);

  const reload = useCallback(() => {
    setAdditional(null);
    nextPage.reset();
    resource.reload();
  }, [nextPage.reset, resource.reload]);

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

function isPaymentType(value: unknown): value is PaymentType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAYMENT_TYPE_LABELS, value);
}

function statusSeal(value: unknown): { tone: 'slate' | 'amber' | 'violet' | 'emerald' | 'clay' | 'gold'; label: string } {
  if (!isPaymentStatus(value)) return { tone: 'slate', label: `Statut non reconnu · ${String(value ?? '—')}` };
  return { tone: PAYMENT_STATUS_TONES[value], label: `${PAYMENT_STATUS_LABELS[value]} · ${value}` };
}

function declarationSeal(value: PaymentDeclarationRecord['outcome']) {
  const tone = value === 'VERIFIED' ? 'emerald' : value === 'REJECTED' ? 'clay' : 'amber';
  return { tone, label: `${PAYMENT_DECLARATION_OUTCOME_LABELS[value]} · ${value}` } as const;
}

function paymentTypeText(value: unknown): string {
  if (!isPaymentType(value)) return `Nature inconnue · ${String(value ?? '—')}`;
  return `${PAYMENT_TYPE_LABELS[value].label} · ${value}`;
}

function paymentAmountText(payment: Pick<PaymentView, 'paymentType' | 'amount' | 'currency'>): string {
  if (!isPaymentType(payment.paymentType)) return 'Non interprété · BACKEND_GAP';
  if (typeof payment.amount !== 'number' || !Number.isFinite(payment.amount)) return '—';
  return formatPaymentAmount(payment.amount, payment.currency);
}

function statusCount(items: readonly PaymentView[], status: PaymentLifecycleStatus): number {
  return items.filter((payment) => payment.status === status).length;
}

const PAYMENT_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'SALARY', label: 'Salaire' },
  { id: 'PLATFORM_FEE', label: 'Frais LE LABEUR' },
] as const;

function filterPayments(items: readonly PaymentView[], query: string, type: string): PaymentView[] {
  const needle = query.trim().toLocaleLowerCase('fr-FR');
  return items.filter((payment) => {
    if (type !== 'all' && payment.paymentType !== type) return false;
    if (!needle) return true;
    const declarationSearch = payment.declarations.flatMap((entry) => [
      entry.declarationId,
      entry.reference,
      entry.externalTransactionId ?? '',
      entry.provider ?? '',
    ]);
    return [
      payment.paymentId,
      payment.contractId,
      payment.employerId,
      payment.candidateId,
      payment.periodKey,
      payment.status,
      payment.paymentType,
      ...declarationSearch,
    ].some((value) => value.toLocaleLowerCase('fr-FR').includes(needle));
  });
}

function PaymentRegistry({ unitId, pathname }: AdminUnitProps) {
  const resource = usePaymentsPage();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('all');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const gaps = adminGapsFor(unitId, pathname);
  const visible = resource.items ? filterPayments(resource.items, query, type) : [];

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (!resource.items) return <LoadingBlock label={ADMIN_UI_TERMS.PAYMENT_REGISTRY} rows={5} />;

  const loaded = resource.items;
  return (
    <>
      {resource.status === 'loading' ? <LoadingBlock label="Actualisation du registre des paiements" rows={1} /> : null}
      <PageHead
        title={ADMIN_UI_TERMS.PAYMENT_REGISTRY}
        lede={`${loaded.length} paiements chargés · recherche et filtre de nature appliqués localement à la page réelle`}
        seal={{ tone: 'gold', label: 'Registre ADMIN' }}
      />

      <KpiRow items={[
        { label: 'PAIEMENTS DE LA PAGE', value: String(loaded.length) },
        { label: 'ÉCHÉANCES PRÉVUES', value: String(statusCount(loaded, 'SCHEDULED')) },
        { label: 'ÉCHÉANCES DUES', value: String(statusCount(loaded, 'DUE')) },
        { label: 'EN ATTENTE DE VÉRIFICATION', value: String(statusCount(loaded, 'PENDING_VERIFICATION')) },
        { label: 'VÉRIFIÉS', value: String(statusCount(loaded, 'VERIFIED')) },
        { label: 'PAYÉS (ÉTAT DU CYCLE)', value: String(statusCount(loaded, 'PAID')) },
      ]} />
      <Panel title="Lecture des montants" zone="list" tone="notice">
        Les seuls montants visibles sont ceux de chaque Paiement, avec sa nature et sa devise telles que renvoyées par le serveur. Aucun total, différence, taux ou montant par période n’est calculé dans le navigateur.
      </Panel>

      <FilterChips label="Nature du Paiement" options={PAYMENT_FILTERS} value={type} onChange={setType} />
      <Panel title="Recherche dans la page chargée" zone="form">
        <Field label="Référence, Contrat, Employeur, Candidat ou déclaration">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Rechercher un Paiement ou une déclaration"
            placeholder="Identifiant ou référence exacte"
          />
        </Field>
        <p className="lbm-caption lbm-muted">La recherche est locale : aucun filtre serveur multi-critères n’est exposé.</p>
      </Panel>

      {resource.persistence === 'not-configured' ? (
        <EmptyNotice>Le serveur répond une frontière de contrôle sans persistance métier (`not-configured`). Aucun Paiement réel n’est chargé ; cet état n’est pas présenté comme un registre vide.</EmptyNotice>
      ) : (
        <DataTable
          caption="Registre ADMIN réel des paiements"
          head={['Référence', 'Contrat', 'Nature', 'Période', 'Montant serveur', 'Échéance', 'État du Paiement', 'Déclarations', 'Consultation']}
          rows={visible.map((payment) => [
            <span key="payment" className="lbm-mono">{payment.paymentId}</span>,
            <span key="contract" className="lbm-mono">{payment.contractId}</span>,
            <span key="type">{paymentTypeText(payment.paymentType)}</span>,
            <span key="period" className="lbm-mono">{payment.periodKey}</span>,
            <span key="amount" className="lbm-mono">{paymentAmountText(payment)}</span>,
            <span key="due">{formatDateTime(payment.dueAt) ?? '—'}<br /><span className="lbm-caption lbm-muted">{paymentDueLabel(payment.due)}</span></span>,
            <StatusSeal key="status" {...statusSeal(payment.status)} size="sm" />,
            <span key="declarations" className="lbm-mono">{String(payment.declarationCount)}</span>,
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
              {query || type !== 'all'
                ? 'Aucun Paiement sur les filtres de la page réellement chargée.'
                : 'Aucun Paiement n’est renvoyé par le registre ADMIN réel.'}
            </EmptyNotice>
          )}
        />
      )}

      {resource.persistence !== 'not-configured' && visible.length > 0 && selectedPaymentId ? (
        <PaymentConsultation
          paymentId={selectedPaymentId}
          onClose={() => setSelectedPaymentId(null)}
          onUpdated={() => resource.reload()}
        />
      ) : null}

      <ActionRow>
        {resource.hasMore ? (
          <NeoPressButton variant="ghost" onClick={resource.loadMore} loading={resource.loadMoreBusy}>
            Charger la page suivante
          </NeoPressButton>
        ) : null}
        <RetryButton onClick={resource.reload} />
        <Link href="/admin/paiements/reconciliation" className="lbm-admin__link">Rapprochement</Link>
        <Link href="/admin/paiements/declarations-externes" className="lbm-admin__link">Déclarations externes</Link>
        <Link href="/admin/paiements/anomalies" className="lbm-admin__link">Anomalies de paiement</Link>
      </ActionRow>
      {resource.loadMoreError ? <ActionError error={resource.loadMoreError} /> : null}
      {resource.hasMore ? (
        <p className="lbm-caption lbm-muted">La page suivante utilise le curseur opaque retourné par le serveur ; les repères restent limités aux paiements chargés.</p>
      ) : null}
      <GapNotice title="BACKEND_GAP · ADM-18" items={gaps} />
    </>
  );
}

/* ── Consultation unitaire : même handler réel, permission ADMIN vérifiée serveur. ── */

function PaymentConsultation({
  paymentId,
  onClose,
  onUpdated,
}: {
  paymentId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const resource = useAdminResource<PaymentView>((api, signal) => api.payment(paymentId, signal), [paymentId]);
  const [updated, setUpdated] = useState<PaymentView | null>(null);
  useEffect(() => setUpdated(null), [paymentId]);
  const payment = updated ?? resource.data;

  return (
    <section className="lbm-admin__zone" role="region" aria-label="Consultation du Paiement" data-payment-detail={paymentId}>
      <div className="lbm-admin__actions">
        <h2 className="lbm-title-2">Consultation · Paiement {paymentId}</h2>
        <button type="button" className="lbm-admin__link" onClick={onClose} aria-label="Fermer la consultation">Fermer</button>
      </div>
      {resource.status === 'error' ? <SystemFeedback {...resource.error!} retry={resource.reload} />
        : resource.status === 'loading' || !payment ? <LoadingBlock label="Chargement du Paiement" rows={3} />
          : (
            <>
              <Panel title="Échéance et nature réelle" zone="hero">
                <KeyValues title="Données du Paiement" items={[
                  { label: 'Référence du Paiement', value: payment.paymentId },
                  { label: 'Référence du Contrat', value: payment.contractId },
                  { label: 'Employeur (identifiant serveur)', value: payment.employerId },
                  { label: 'Candidat (identifiant serveur)', value: payment.candidateId },
                  { label: 'Nature serveur', value: paymentTypeText(payment.paymentType) },
                  { label: 'Montant unitaire serveur', value: paymentAmountText(payment) },
                  { label: 'Devise serveur', value: payment.currency || null },
                  { label: 'Échéance', value: formatDateTime(payment.dueAt) },
                  { label: 'État d’échéance', value: paymentDueLabel(payment.due) },
                  { label: 'Statut serveur (code intact)', value: isPaymentStatus(payment.status) ? `${PAYMENT_STATUS_LABELS[payment.status]} · ${payment.status}` : String(payment.status) },
                  { label: 'Entrée d’échéancier', value: payment.scheduleEntryId },
                  { label: 'Période', value: payment.periodKey },
                  { label: 'Mois de l’échéancier', value: String(payment.monthNumber) },
                  { label: 'Programmée le', value: formatDateTime(payment.scheduledAt) },
                ]} />
                {isPaymentType(payment.paymentType) ? (
                  <p className="lbm-body">{PAYMENT_TYPE_LABELS[payment.paymentType].detail}</p>
                ) : (
                  <EmptyNotice>Nature de Paiement inconnue dans la réponse serveur : montant non interprété (BACKEND_GAP).</EmptyNotice>
                )}
              </Panel>

              <Panel title="Déclaration, vérification et état payé" zone="list">
                <KeyValues title="États indépendants renvoyés par le serveur" items={[
                  { label: 'Déclaration reçue', value: payment.declared ? 'Oui' : 'Non' },
                  { label: 'Déclarations conservées', value: String(payment.declarationCount) },
                  { label: 'Vérification LE LABEUR', value: payment.verified ? 'Vérifié par le cycle' : 'Non vérifié' },
                  { label: 'Statut PAID du cycle', value: payment.paid ? 'Oui · état serveur PAID' : 'Non' },
                  { label: 'Confirmation du Candidat (OTP)', value: 'Non exposée par le DTO Payment ; aucune confirmation n’est déduite.' },
                ]} />
                {payment.status === 'PAID' ? (
                  <EmptyNotice>PAID est le statut réel du cycle : ce n’est ni un transfert de fonds par LE LABEUR ni une confirmation de réception par le Candidat.</EmptyNotice>
                ) : null}
              </Panel>

              <PaymentWorkflowActions
                payment={payment}
                onUpdated={(next) => {
                  setUpdated(next);
                  onUpdated();
                }}
              />

              <Panel title="Tentatives de déclaration réellement exposées" zone="timeline">
                <RecordList
                  items={payment.declarations}
                  label="Tentatives de déclaration"
                  empty={<EmptyNotice>Aucune tentative de déclaration n’est renvoyée avec ce Paiement.</EmptyNotice>}
                  render={(declaration) => (
                    <RecordCard
                      title={`Tentative ${declaration.attemptNumber} · ${declaration.declarationId}`}
                      seal={declarationSeal(declaration.outcome)}
                      facts={[
                        { label: 'Référence externe', value: declaration.reference || '—' },
                        { label: 'Fournisseur déclaré', value: declaration.provider || '—' },
                        { label: 'Identifiant externe', value: declaration.externalTransactionId || '—' },
                        { label: 'Soumise le', value: formatDateTime(declaration.submittedAt) ?? '—' },
                        { label: 'Examinée le', value: formatDateTime(declaration.reviewedAt) ?? '—' },
                      ]}
                    >
                      {declaration.rejectionReason ? <p className="lbm-caption">Motif serveur : {declaration.rejectionReason}</p> : null}
                      {declaration.proof?.fileName ? <p className="lbm-caption">Nom de pièce déclaré : {declaration.proof.fileName} · aucune ouverture de document n’est exposée ici.</p> : null}
                    </RecordCard>
                  )}
                />
              </Panel>
              <GapNotice title="BACKEND_GAP · consultation du Paiement" items={[
                'Le DTO Payment ne fournit pas de confirmation OTP du Candidat, de dossier de révision séparé ni de journal d’audit paginé par Paiement ; aucune de ces valeurs n’est déduite.',
              ]} />
            </>
          )}
    </section>
  );
}

/* ── Actions ADMIN réellement ouvertes par payments.approve/reject/confirm. ── */

function PaymentWorkflowActions({ payment, onUpdated }: { payment: PaymentView; onUpdated?: (payment: PaymentView) => void }) {
  const api = useAdminApi();
  const actor = useAdminActor();
  const action = useSingleFlightAction<PaymentView>();
  const verificationKey = useCommandIdempotencyKey();
  const rejectionKey = useCommandIdempotencyKey();
  const paidKey = useCommandIdempotencyKey();
  const [intent, setIntent] = useState<'verify' | 'reject' | 'paid' | null>(null);
  const [reason, setReason] = useState('');
  const [latest, setLatest] = useState<PaymentView | null>(null);
  const current = latest ?? payment;
  const canApprove = Boolean(actor?.permissions.includes('payments:approve'));
  const canReject = Boolean(actor?.permissions.includes('payments:reject'));
  const currentDeclarationAvailable = Boolean(current.currentDeclarationId);

  useEffect(() => setLatest(null), [payment.paymentId, payment.updatedAt]);

  const apply = (task: (signal: AbortSignal) => Promise<PaymentView>, resetKey: () => void) => {
    if (action.busy) return;
    void action.run(task).then((result) => {
      if (!result) return;
      resetKey();
      setLatest(result);
      setIntent(null);
      setReason('');
      onUpdated?.(result);
    });
  };

  const submitReject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !reason.trim() || !canReject) return;
    apply((signal) => api.rejectPayment(current.paymentId, reason, signal, rejectionKey.get()), rejectionKey.reset);
  };

  const showVerification = current.status === 'PENDING_VERIFICATION';
  const showPaidAction = current.status === 'VERIFIED';
  const anyAction = (showVerification && (canApprove || canReject)) || (showPaidAction && canApprove);

  return (
    <Panel title="Actions ADMIN réellement disponibles" zone="cta">
      <p className="lbm-caption lbm-muted">Le serveur revérifie rôle, permission, statut et idempotence à chaque commande. Une déclaration ne vaut jamais vérification ; VERIFIED ne vaut pas PAID ; PAID ne confirme pas le Salaire au Candidat.</p>
      {showVerification && !currentDeclarationAvailable ? (
        <EmptyNotice>Le Paiement est PENDING_VERIFICATION, mais aucune déclaration courante n’est identifiée dans le DTO : aucune action de vérification n’est proposée.</EmptyNotice>
      ) : null}
      {showVerification && !canApprove && !canReject ? (
        <EmptyNotice>La session ADMIN ne porte pas payments:approve ni payments:reject : les commandes ne sont pas proposées.</EmptyNotice>
      ) : null}
      {showPaidAction && !canApprove ? (
        <EmptyNotice>La session ADMIN ne porte pas payments:approve : le passage à PAID n’est pas proposé.</EmptyNotice>
      ) : null}
      {!anyAction && current.status !== 'PENDING_VERIFICATION' && current.status !== 'VERIFIED' ? (
        <p className="lbm-caption lbm-muted">Aucune transition ADMIN de ce cycle n’est applicable au statut courant.</p>
      ) : null}
      {showVerification && currentDeclarationAvailable && canApprove ? (
        <NeoPressButton variant="primary" onClick={() => setIntent('verify')} disabled={action.busy}>
          Préparer la vérification
        </NeoPressButton>
      ) : null}
      {showVerification && currentDeclarationAvailable && canReject ? (
        <NeoPressButton variant="ghost" onClick={() => setIntent('reject')} disabled={action.busy}>
          Préparer le rejet motivé
        </NeoPressButton>
      ) : null}
      {showPaidAction && canApprove ? (
        <NeoPressButton variant="primary" onClick={() => setIntent('paid')} disabled={action.busy}>
          Préparer le passage à PAID
        </NeoPressButton>
      ) : null}

      {intent === 'verify' && api ? (
        <div className="lbm-admin__notice" role="group" aria-label="Confirmation de vérification">
          <p className="lbm-body">Confirmer que l’ADMIN demande au serveur de vérifier la déclaration courante. Le résultat réel peut être VERIFIED ou REJECTED ; aucun fonds n’est déplacé.</p>
          <div className="lbm-admin__actions">
            <NeoPressButton
              variant="primary"
              loading={action.busy}
              onClick={() => apply((signal) => api.verifyPayment(current.paymentId, signal, verificationKey.get()), verificationKey.reset)}
            >Confirmer la vérification</NeoPressButton>
            <NeoPressButton variant="ghost" onClick={() => { verificationKey.reset(); setIntent(null); }} disabled={action.busy}>Annuler</NeoPressButton>
          </div>
        </div>
      ) : null}
      {intent === 'reject' && api ? (
        <form className="lbm-admin__notice" onSubmit={submitReject} aria-label="Motif de rejet de la déclaration">
          <Field label="Motif obligatoire du rejet">
            <textarea required value={reason} onChange={(event) => { rejectionKey.reset(); setReason(event.target.value); }} />
          </Field>
          <p className="lbm-caption lbm-muted">Le serveur conserve la déclaration antérieure et son motif ; une régularisation éventuelle relève d’une nouvelle déclaration par l’Employeur.</p>
          <div className="lbm-admin__actions">
            <NeoPressButton type="submit" variant="primary" loading={action.busy} disabled={!reason.trim()}>
              Confirmer le rejet motivé
            </NeoPressButton>
            <NeoPressButton type="button" variant="ghost" onClick={() => { rejectionKey.reset(); setIntent(null); setReason(''); }} disabled={action.busy}>Annuler</NeoPressButton>
          </div>
        </form>
      ) : null}
      {intent === 'paid' && api ? (
        <div className="lbm-admin__notice" role="group" aria-label="Confirmation du statut PAID">
          <p className="lbm-body">Le serveur tentera le rapprochement final avant la transition VERIFIED → PAID. Cette commande n’effectue aucun transfert et ne vaut pas confirmation OTP du Candidat.</p>
          <div className="lbm-admin__actions">
            <NeoPressButton
              variant="primary"
              loading={action.busy}
              onClick={() => apply((signal) => api.markPaymentPaid(current.paymentId, signal, paidKey.get()), paidKey.reset)}
            >Confirmer la transition serveur</NeoPressButton>
            <NeoPressButton variant="ghost" onClick={() => { paidKey.reset(); setIntent(null); }} disabled={action.busy}>Annuler</NeoPressButton>
          </div>
        </div>
      ) : null}
      {action.error ? <ActionError error={action.error} /> : null}
      {action.result ? <p className="lbm-caption" role="status">Réponse serveur : {String(action.result.status)} · {statusSeal(action.result.status).label}</p> : null}
    </Panel>
  );
}

/* ── ADM-19 : lecture d'un lot par identifiant (pas de liste globale exposée). ── */

function Admin19Reconciliation({ unitId, pathname }: AdminUnitProps) {
  const api = useAdminApi();
  const [batchInput, setBatchInput] = useState('');
  const [batchId, setBatchId] = useState('');
  const resource = useAdminResource<PaymentReconciliationBatchReport | null>(
    (currentApi, signal) => batchId
      ? currentApi.paymentReconciliationBatch(batchId, { limit: PAGE_LIMIT, signal })
      : Promise.resolve(null),
    [batchId],
  );
  const retry = useSingleFlightAction<PaymentReconciliationBatchReport>();
  const retryKey = useCommandIdempotencyKey();
  const nextPage = useSingleFlightAction<PaymentReconciliationBatchReport>();
  const [reportOverride, setReportOverride] = useState<PaymentReconciliationBatchReport | null>(null);
  const [additional, setAdditional] = useState<{
    readonly items: readonly PaymentReconciliationBatchItem[];
    readonly cursor: string | null;
    readonly hasMore: boolean;
    readonly batchId: string;
  } | null>(null);
  const gaps = adminGapsFor(unitId, pathname);

  const report = reportOverride ?? resource.data;
  const pageMatches = Boolean(report && additional?.batchId === report.batch.batchId);
  const items = report ? [...report.items, ...(pageMatches ? additional?.items ?? [] : [])] : [];
  const cursor = pageMatches ? additional?.cursor ?? null : report?.cursor ?? null;
  const hasMore = pageMatches ? additional?.hasMore ?? false : report?.hasMore ?? false;

  useEffect(() => {
    setReportOverride(null);
    setAdditional(null);
    retryKey.reset();
  }, [batchId, retryKey.reset]);

  const chooseBatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = batchInput.trim();
    if (!normalized) return;
    setReportOverride(null);
    setAdditional(null);
    if (normalized === batchId) resource.reload();
    else setBatchId(normalized);
  };

  const loadMore = () => {
    if (!api || !report || !cursor || nextPage.busy) return;
    void nextPage.run((signal) => api.paymentReconciliationBatch(report.batch.batchId, { limit: PAGE_LIMIT, cursor, signal })).then((page) => {
      if (!page) return;
      setAdditional((previous) => ({
        items: [...(previous?.batchId === page.batch.batchId ? previous.items : []), ...page.items],
        cursor: page.cursor,
        hasMore: page.hasMore,
        batchId: page.batch.batchId,
      }));
    });
  };

  const requestRetry = () => {
    if (!api || !report || retry.busy) return;
    void retry.run((signal) => api.retryPaymentReconciliationBatch(report.batch.batchId, signal, retryKey.get())).then((result) => {
      if (!result) return;
      retryKey.reset();
      setReportOverride(result);
      setAdditional(null);
    });
  };

  if (batchId && resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (batchId && resource.status === 'loading' && !reportOverride) {
    return <LoadingBlock label="Chargement du lot de rapprochement" rows={5} />;
  }

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.PAYMENT_RECONCILIATION}
        lede="Consultation du résultat d’un lot déjà identifié ; les verdicts rapprochent des données et ne font pas évoluer le statut du Paiement."
        seal={{ tone: 'gold', label: 'Résultats serveur' }}
      />
      <Panel title="Consulter un lot connu" zone="form">
        <form onSubmit={chooseBatch}>
          <div className="lbm-admin__fields">
            <Field label="Identifiant du lot de rapprochement">
              <input
                type="text"
                value={batchInput}
                onChange={(event) => setBatchInput(event.target.value)}
                required
                aria-label="Identifiant du lot de rapprochement"
                autoComplete="off"
              />
            </Field>
            <NeoPressButton type="submit" variant="primary">Consulter le lot</NeoPressButton>
          </div>
        </form>
        <p className="lbm-caption lbm-muted">Le serveur ne fournit pas de liste globale de lots. Aucun historique n’est fabriqué depuis les paiements chargés.</p>
      </Panel>

      {!batchId ? (
        <EmptyNotice>Aucun lot sélectionné. Les résultats et l’historique d’un lot ne sont consultables qu’avec un identifiant réel connu.</EmptyNotice>
      ) : null}

      {report && batchId ? (
        <>
          <PageHead
            headingLevel={2}
            title={`Lot ${report.batch.batchId}`}
            lede={`Fournisseur ${report.batch.provider} · créé ${formatDateTime(report.batch.createdAt) ?? 'horodatage absent'}`}
            seal={{ tone: report.batch.status === 'COMPLETED' ? 'emerald' : report.batch.status === 'FAILED' ? 'clay' : 'amber', label: `${PAYMENT_RECONCILIATION_BATCH_STATUS_LABELS[report.batch.status]} · ${report.batch.status}` }}
          />
          <KpiRow items={[
            { label: 'ÉLÉMENTS (TOTAL SERVEUR)', value: String(report.batch.totalItems) },
            { label: 'TRAITÉS', value: String(report.batch.processedItems) },
            { label: 'CORRESPONDANCES', value: String(report.batch.matchedItems) },
            { label: 'DISCORDANCES', value: String(report.batch.mismatchedItems) },
            { label: 'ABSENTS', value: String(report.batch.notFoundItems) },
            { label: 'DOUBLONS', value: String(report.batch.duplicateItems) },
            { label: 'EXAMEN REQUIS', value: String(report.batch.reviewItems) },
            { label: 'ÉCHECS', value: String(report.batch.failedItems) },
            { label: 'REPRISES POSSIBLES', value: String(report.batch.retryableItems) },
          ]} />
          <Panel title="Portée du résultat" zone="list" tone="notice">
            Les compteurs viennent du serveur. Les verdicts décrivent une comparaison de données externes ; même MATCH ne vérifie pas une déclaration Payment, ne marque pas PAID et ne déplace pas de fonds.
          </Panel>
          <DataTable
            caption={`Éléments réels du lot ${report.batch.batchId}`}
            head={['Élément', 'État serveur', 'Transaction externe', 'Référence', 'Montant externe transmis', 'Paiement rapproché', 'Revue', 'Horodatage']}
            rows={items.map((item) => {
              const metadata = item.normalizedMetadata;
              const rawAmount = metadata.amount;
              const rawCurrency = metadata.currency;
              const amount = typeof rawAmount === 'number' && Number.isFinite(rawAmount) && typeof rawCurrency === 'string'
                ? formatPaymentAmount(rawAmount, rawCurrency)
                : '—';
              const itemTone = item.status === 'MATCH' ? 'emerald'
                : item.status === 'MISMATCH' || item.status === 'DUPLICATE' || item.status === 'FAILED' ? 'clay'
                  : item.status === 'REVIEW_REQUIRED' || item.status === 'RETRYABLE' ? 'amber' : 'slate';
              return [
                <span key="index" className="lbm-mono">{String(item.itemIndex + 1)}</span>,
                <StatusSeal key="status" tone={itemTone} label={`${PAYMENT_RECONCILIATION_ITEM_STATUS_LABELS[item.status]} · ${item.status}`} size="sm" />,
                <span key="external" className="lbm-mono">{item.externalTransactionId ?? '—'}</span>,
                <span key="reference" className="lbm-mono">{item.reference ?? '—'}</span>,
                <span key="amount" className="lbm-mono">{amount}</span>,
                <span key="payment" className="lbm-mono">{(item.matchedPaymentId ?? item.result?.paymentId) || '—'}</span>,
                item.reviewId ? <span key="review" className="lbm-mono">{item.reviewId}</span> : '—',
                formatDateTime(item.updatedAt) ?? '—',
              ];
            })}
            empty={<EmptyNotice>Le lot réel ne contient aucun élément dans la page consultée.</EmptyNotice>}
          />
          <RecordList
            items={items}
            label="Détails réels de rapprochement"
            render={(item) => (
              <ReconciliationItemCard item={item} />
            )}
          />
          <ActionRow>
            {hasMore ? <NeoPressButton variant="ghost" onClick={loadMore} loading={nextPage.busy}>Charger la page suivante</NeoPressButton> : null}
            {report.batch.failedItems > 0 || report.batch.retryableItems > 0 ? (
              <NeoPressButton variant="primary" onClick={requestRetry} loading={retry.busy}>Reprendre les éléments échoués ou réessayables</NeoPressButton>
            ) : null}
            <RetryButton onClick={() => { setReportOverride(null); setAdditional(null); resource.reload(); }} />
            <Link href="/admin/paiements" className="lbm-admin__link">Registre des paiements</Link>
          </ActionRow>
          {retry.error ? <ActionError error={retry.error} /> : null}
          {nextPage.error ? <ActionError error={nextPage.error} /> : null}
          {report.replayed ? <p className="lbm-caption" role="status">Le serveur indique que cette commande a été rejouée.</p> : null}
        </>
      ) : null}
      <GapNotice title="BACKEND_GAP · ADM-19" items={gaps} />
    </>
  );
}

function ReconciliationItemCard({ item }: { item: PaymentReconciliationBatchItem }) {
  const metadata = item.normalizedMetadata;
  const comparisons = item.result?.comparisons ?? [];
  const reasons = [...item.validationReasons, ...(item.result?.reasons ?? [])];
  const verdict = item.result?.verdict;
  return (
    <RecordCard
      title={`Élément ${item.itemIndex + 1} · ${item.itemId}`}
      seal={verdict ? {
        tone: verdict === 'MATCH' ? 'emerald' : verdict === 'MISMATCH' || verdict === 'DUPLICATE' ? 'clay' : 'amber',
        label: `${PAYMENT_RECONCILIATION_VERDICT_LABELS[verdict]} · ${verdict}`,
      } : undefined}
      facts={[
        { label: 'Fournisseur', value: item.provider },
        { label: 'Identifiant de transaction externe', value: item.externalTransactionId ?? '—' },
        { label: 'Référence transmise', value: item.reference ?? '—' },
        { label: 'Statut de transaction externe', value: typeof metadata.status === 'string' ? metadata.status : '—' },
        { label: 'Tentatives de traitement', value: String(item.attempts) },
        { label: 'Créé le', value: formatDateTime(item.createdAt) ?? '—' },
        { label: 'Mis à jour le', value: formatDateTime(item.updatedAt) ?? '—' },
      ]}
    >
      {comparisons.length > 0 ? (
        <details>
          <summary className="lbm-admin__link">Comparaisons renvoyées par le serveur ({comparisons.length})</summary>
          <ul className="lbm-admin__list">
            {comparisons.map((comparison, index) => (
              <li key={`${comparison.field}-${index}`} className="lbm-admin__row">
                <GlassSurface level={1} className="lbm-admin__notice">
                  <KeyValues items={[
                    { label: 'Champ', value: PAYMENT_RECONCILIATION_FIELD_LABELS[comparison.field] ?? comparison.field },
                    { label: 'Valeur attendue (serveur)', value: scalarValue(comparison.expected) },
                    { label: 'Valeur externe reçue', value: scalarValue(comparison.actual) },
                    { label: 'Égalité indiquée par le serveur', value: comparison.matched ? 'Oui' : 'Non' },
                    { label: 'Détail serveur', value: comparison.detail ?? null },
                  ]} />
                </GlassSurface>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {reasons.length > 0 ? (
        <div>
          <p className="lbm-kicker">Raisons renvoyées par le serveur</p>
          <ul className="lbm-admin__list">
            {reasons.map((reason, index) => <li key={`${index}-${reason}`} className="lbm-body">{reason}</li>)}
          </ul>
        </div>
      ) : null}
      {item.reviewId ? <ReconciliationReviewActions reviewId={item.reviewId} /> : null}
    </RecordCard>
  );
}

function scalarValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'Valeur structurée renvoyée par le serveur';
}

/* ── Revue ADMIN existante : décision + tentative de correction non appliquée. ── */

function ReconciliationReviewActions({ reviewId }: { reviewId: string }) {
  const api = useAdminApi();
  const actor = useAdminActor();
  const decisionAction = useSingleFlightAction<{
    review: PaymentReconciliationReviewRecord;
    replayed?: boolean;
  }>();
  const correctionAction = useSingleFlightAction<{
    correctionAttempt: PaymentReconciliationCorrectionAttemptRecord;
    replayed?: boolean;
  }>();
  const decisionKey = useCommandIdempotencyKey();
  const correctionKey = useCommandIdempotencyKey();
  const [decision, setDecision] = useState<'' | 'CONFIRMED' | 'REJECTED'>('');
  const [evidence, setEvidence] = useState('');
  const [note, setNote] = useState('');
  const [proposedChanges, setProposedChanges] = useState('');
  const [correctionEvidence, setCorrectionEvidence] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const canReview = Boolean(actor?.permissions.includes('payments:approve'));
  const reviewClosed = Boolean(decisionAction.result && decisionAction.result.review.decision !== 'OPEN');

  const submitDecision = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !canReview || !decision) return;
    void decisionAction.run((signal) => api.decidePaymentReconciliationReview(reviewId, {
      decision,
      ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }, signal, decisionKey.get())).then((result) => {
      if (result) decisionKey.reset();
    });
  };

  const submitCorrection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !canReview) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(proposedChanges);
    } catch {
      setLocalError('La proposition doit être un objet JSON valide.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setLocalError('La proposition doit être un objet JSON.');
      return;
    }
    setLocalError(null);
    void correctionAction.run((signal) => api.recordPaymentReconciliationCorrectionAttempt(reviewId, {
      proposedChanges: parsed as Record<string, unknown>,
      ...(correctionEvidence.trim() ? { evidenceReference: correctionEvidence.trim() } : {}),
      ...(correctionNote.trim() ? { note: correctionNote.trim() } : {}),
    }, signal, correctionKey.get())).then((result) => {
      if (result) correctionKey.reset();
    });
  };

  return (
    <Panel title={`Revue associée · ${reviewId}`} zone="cta">
      <p className="lbm-caption lbm-muted">Le DTO d’item n’expose pas l’état courant OPEN/CONFIRMED/REJECTED de la revue. Le serveur contrôle l’ouverture, la permission et les décisions concurrentes.</p>
      {!canReview ? <EmptyNotice>Permission payments:approve absente de la session ADMIN : aucune décision de revue n’est proposée.</EmptyNotice> : null}
      {reviewClosed ? <EmptyNotice>Le serveur a renvoyé la revue {decisionAction.result?.review.decision} : ses commandes de décision et de correction ne sont plus proposées.</EmptyNotice> : null}
      {canReview && api && !reviewClosed ? (
        <>
          <details>
            <summary className="lbm-admin__link">Consigner une décision de revue</summary>
            <form className="lbm-admin__notice" onSubmit={submitDecision}>
              <Field label="Décision réelle acceptée par le serveur">
                <select value={decision} onChange={(event) => { decisionKey.reset(); setDecision(event.target.value as typeof decision); }} required>
                  <option value="">Choisir une décision</option>
                  <option value="CONFIRMED">{PAYMENT_RECONCILIATION_REVIEW_DECISION_LABELS.CONFIRMED}</option>
                  <option value="REJECTED">{PAYMENT_RECONCILIATION_REVIEW_DECISION_LABELS.REJECTED}</option>
                </select>
              </Field>
              <Field label="Référence de preuve (facultative)">
                <input value={evidence} onChange={(event) => { decisionKey.reset(); setEvidence(event.target.value); }} />
              </Field>
              <Field label="Note de revue (facultative)">
                <textarea value={note} onChange={(event) => { decisionKey.reset(); setNote(event.target.value); }} />
              </Field>
              <p className="lbm-caption lbm-muted">La décision clôt la revue ; elle ne modifie ni le statut Payment ni le règlement externe.</p>
              <NeoPressButton type="submit" variant="primary" loading={decisionAction.busy} disabled={!decision}>Consigner la décision</NeoPressButton>
            </form>
          </details>
          <details>
            <summary className="lbm-admin__link">Consigner une tentative de correction (non appliquée)</summary>
            <form className="lbm-admin__notice" onSubmit={submitCorrection}>
              <Field label="Changements normalisés proposés (objet JSON ; aucune application automatique)">
                <textarea value={proposedChanges} onChange={(event) => { correctionKey.reset(); setProposedChanges(event.target.value); }} required />
              </Field>
              <Field label="Référence de preuve (facultative)">
                <input value={correctionEvidence} onChange={(event) => { correctionKey.reset(); setCorrectionEvidence(event.target.value); }} />
              </Field>
              <Field label="Note (facultative)">
                <textarea value={correctionNote} onChange={(event) => { correctionKey.reset(); setCorrectionNote(event.target.value); }} />
              </Field>
              <p className="lbm-caption lbm-muted">L’API n’accepte que les champs normalisés autorisés et conserve la proposition à l’audit. Elle ne corrige pas la source ni le Paiement.</p>
              <NeoPressButton type="submit" variant="ghost" loading={correctionAction.busy}>Enregistrer la tentative</NeoPressButton>
            </form>
          </details>
        </>
      ) : null}
      {localError ? <p className="lbm-caption" role="alert">{localError}</p> : null}
      {decisionAction.error ? <ActionError error={decisionAction.error} /> : null}
      {correctionAction.error ? <ActionError error={correctionAction.error} /> : null}
      {decisionAction.result ? (
        <p className="lbm-caption" role="status">Réponse serveur : revue {decisionAction.result.review.decision} · le statut du Paiement n’est pas modifié.</p>
      ) : null}
      {correctionAction.result ? (
        <p className="lbm-caption" role="status">Tentative {correctionAction.result.correctionAttempt.status} enregistrée · non appliquée au Paiement ou au règlement externe.</p>
      ) : null}
    </Panel>
  );
}

/* ── ADM-20/22 : capacités absentes, aucune file financière n'est simulée. ── */

function Admin20PaymentAnomalies({ unitId, pathname }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.PAYMENT_ANOMALIES}
        lede="Le produit ne fournit pas de détecteur ni de file globale d’anomalies de paiement."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <EmptyNotice>Aucune anomalie n’est présentée sans résultat réel de rapprochement ni source serveur dédiée.</EmptyNotice>
      <ActionRow><Link href="/admin/paiements/reconciliation" className="lbm-admin__link">Consulter un lot de rapprochement connu</Link></ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-20" items={gaps} />
    </>
  );
}

function Admin22PaymentIncident({ unitId, pathname, params }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.PAYMENT_INCIDENT} · ${params.id ?? '—'}`}
        lede="Cette référence est affichée depuis le chemin. Aucune fiche d’incident financier n’est chargée faute de handler ADMIN."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <EmptyNotice>Aucun détail financier ni aucune action de résolution n’est disponible pour cette référence.</EmptyNotice>
      <ActionRow><Link href="/admin/paiements" className="lbm-admin__link">Retour au registre des paiements</Link></ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-22" items={gaps} />
    </>
  );
}

/* ── ADM-21 : la déclaration reste distincte du résultat de vérification. ── */

function Admin21ExternalDeclarations({ unitId, pathname }: AdminUnitProps) {
  const resource = usePaymentsPage();
  const [query, setQuery] = useState('');
  const gaps = adminGapsFor(unitId, pathname);
  const paymentsWithDeclarations = (resource.items ?? []).filter((payment) => payment.declarations.length > 0);
  const visible = paymentsWithDeclarations.filter((payment) => {
    const needle = query.trim().toLocaleLowerCase('fr-FR');
    if (!needle) return true;
    return [payment.paymentId, payment.contractId, payment.paymentType, payment.status, ...payment.declarations.flatMap((declaration) => [
      declaration.declarationId,
      declaration.reference,
      declaration.externalTransactionId ?? '',
      declaration.provider ?? '',
    ])].some((value) => value.toLocaleLowerCase('fr-FR').includes(needle));
  });
  const declarations = paymentsWithDeclarations.flatMap((payment) => payment.declarations);
  const countOutcome = (outcome: PaymentDeclarationRecord['outcome']) => declarations.filter((declaration) => declaration.outcome === outcome).length;

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (!resource.items) return <LoadingBlock label={ADMIN_UI_TERMS.EXTERNAL_PAYMENT_DECLARATIONS} rows={5} />;

  return (
    <>
      {resource.status === 'loading' ? <LoadingBlock label="Actualisation des déclarations externes" rows={1} /> : null}
      <PageHead
        title={ADMIN_UI_TERMS.EXTERNAL_PAYMENT_DECLARATIONS}
        lede="Les déclarations visibles sont les tentatives réelles incluses dans les Paiements de la page chargée."
        seal={{ tone: 'gold', label: 'Déclarations réelles' }}
      />
      <KpiRow items={[
        { label: 'TENTATIVES DE LA PAGE', value: String(declarations.length) },
        { label: 'EN ATTENTE DE VÉRIFICATION', value: String(countOutcome('PENDING')) },
        { label: 'VÉRIFIÉES (DÉCLARATION)', value: String(countOutcome('VERIFIED')) },
        { label: 'REJETÉES (DÉCLARATION)', value: String(countOutcome('REJECTED')) },
      ]} />
      <Panel title="Déclaration externe ≠ vérification ≠ paiement" zone="list" tone="notice">
        Une déclaration est une tentative transmise par l’Employeur. Seul le résultat serveur change son outcome ; VERIFIED ne signifie pas PAID et ne confirme pas la réception du Salaire par le Candidat.
      </Panel>
      <Panel title="Recherche locale dans les déclarations chargées" zone="form">
        <Field label="Référence ou identifiant de paiement">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Rechercher une déclaration externe"
          />
        </Field>
      </Panel>
      <RecordList
        items={visible}
        label="Paiements comportant des déclarations externes réelles"
        empty={(
          <EmptyNotice>
            {resource.persistence === 'not-configured'
              ? 'Le serveur répond une frontière de contrôle not-configured : aucune déclaration métier n’est chargée.'
              : query
                ? 'Aucune déclaration sur les filtres appliqués localement à la page chargée.'
                : 'Aucune déclaration n’est incluse dans les Paiements réellement chargés.'}
          </EmptyNotice>
        )}
        render={(payment) => (
          <RecordCard
            title={`Paiement ${payment.paymentId}`}
            seal={statusSeal(payment.status)}
            facts={[
              { label: 'Contrat', value: payment.contractId },
              { label: 'Nature serveur', value: paymentTypeText(payment.paymentType) },
              { label: 'Période', value: payment.periodKey },
              { label: 'Montant unitaire serveur', value: paymentAmountText(payment) },
              { label: 'Statut serveur du Paiement', value: isPaymentStatus(payment.status) ? `${PAYMENT_STATUS_LABELS[payment.status]} · ${payment.status}` : String(payment.status) },
            ]}
          >
            <RecordList
              items={payment.declarations}
              label={`Tentatives du Paiement ${payment.paymentId}`}
              render={(declaration) => (
                <GlassSurface level={1} className="lbm-admin__notice">
                  <div className="lbm-admin__card-head">
                    <span className="lbm-admin__card-title">Tentative {declaration.attemptNumber} · {declaration.declarationId}</span>
                    <StatusSeal {...declarationSeal(declaration.outcome)} size="sm" />
                  </div>
                  <KeyValues title="Champs réellement exposés de la déclaration" items={[
                    { label: 'Référence déclarée', value: declaration.reference || null },
                    { label: 'Fournisseur déclaré', value: declaration.provider ?? null },
                    { label: 'Identifiant externe', value: declaration.externalTransactionId ?? null },
                    { label: 'Montant déclaré', value: isPaymentType(declaration.paymentType) && declaration.paymentType === payment.paymentType && Number.isFinite(declaration.amount)
                      ? formatPaymentAmount(declaration.amount, declaration.currency)
                      : null },
                    { label: 'Devise déclarée', value: declaration.currency || null },
                    { label: 'Envoyée le', value: formatDateTime(declaration.submittedAt) },
                    { label: 'Examinée le', value: formatDateTime(declaration.reviewedAt) },
                    { label: 'Acteur de soumission (identifiant)', value: declaration.submittedBy },
                    { label: 'Acteur de vérification (identifiant)', value: declaration.reviewedBy ?? null },
                    { label: 'Motif de rejet serveur', value: declaration.rejectionReason ?? null },
                  ]} />
                  {declaration.proof?.fileName ? <p className="lbm-caption">Nom de pièce déclaré : {declaration.proof.fileName}. Aucun document n’est ouvert ou présenté comme vérifié.</p> : null}
                </GlassSurface>
              )}
            />
            <PaymentWorkflowActions payment={payment} onUpdated={() => resource.reload()} />
          </RecordCard>
        )}
      />
      <ActionRow>
        {resource.hasMore ? <NeoPressButton variant="ghost" onClick={resource.loadMore} loading={resource.loadMoreBusy}>Charger la page suivante</NeoPressButton> : null}
        <RetryButton onClick={resource.reload} />
        <Link href="/admin/paiements" className="lbm-admin__link">Registre des paiements</Link>
      </ActionRow>
      {resource.loadMoreError ? <ActionError error={resource.loadMoreError} /> : null}
      <GapNotice title="BACKEND_GAP · ADM-21" items={gaps} />
    </>
  );
}

export function Admin18PaymentRegistry(props: AdminUnitProps) {
  return <PaymentRegistry {...props} />;
}

export function Admin19PaymentReconciliation(props: AdminUnitProps) {
  return <Admin19Reconciliation {...props} />;
}

export function Admin20PaymentAnomaliesScreen(props: AdminUnitProps) {
  return <Admin20PaymentAnomalies {...props} />;
}

export function Admin21ExternalDeclarationsScreen(props: AdminUnitProps) {
  return <Admin21ExternalDeclarations {...props} />;
}

export function Admin22PaymentIncidentScreen(props: AdminUnitProps) {
  return <Admin22PaymentIncident {...props} />;
}
