/**
 * EMP-41 → EMP-48 — Paiements : échéances, détail, plan, déclarations,
 * vérification, historique, reçu et contestation.
 *
 * Toutes les valeurs viennent de `GET /my/payments`, `GET /payments/:paymentId`
 * et de l'échéancier persisté du contrat. La tranche ne modifie AUCUN montant,
 * AUCUN barème et AUCUNE commission : elle n'affiche que l'existant et déclare
 * les capacités absentes (BACKEND_GAP).
 */

import { useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
  FilterChips,
  GapNotice,
  KeyValues,
  Link,
  LoadingBlock,
  NeoPressButton,
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  RetryButton,
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerAction, useEmployerApi, useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { EmployerPaymentDeclarationDraft, PaymentView } from '../api';
import type { EmployerUnitProps } from '../types';
import { PAYMENT_STATUS_LABELS, PRODUCT_LABELS, formatAmount, formatDate, formatDateTime } from '../vocabulary';

function paymentTone(status: PaymentView['status']): 'emerald' | 'gold' | 'amber' | 'slate' | 'clay' {
  if (status === 'PAID' || status === 'VERIFIED') return 'emerald';
  if (status === 'DUE') return 'amber';
  if (status === 'REJECTED') return 'clay';
  if (status === 'PENDING_VERIFICATION') return 'gold';
  return 'slate';
}

function typeLabel(payment: PaymentView): string {
  return payment.paymentType === 'SALARY' ? PRODUCT_LABELS.SALARY.singular : 'Commission';
}

function paymentFacts(payment: PaymentView) {
  return [
    { label: 'Type', value: typeLabel(payment) },
    { label: 'Période', value: payment.periodKey },
    { label: 'Montant enregistré', value: formatAmount(payment.amount, payment.currency) },
    { label: 'Échéance', value: formatDate(payment.dueAt) ?? '—' },
  ];
}

function PaymentCard({ payment }: { payment: PaymentView }) {
  return (
    <RecordCard
      title={`${typeLabel(payment)} · mois ${payment.monthNumber}`}
      href={`/client/paiements/${payment.paymentId}`}
      seal={{ tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] }}
      facts={paymentFacts(payment)}
    />
  );
}

function usePaymentResource(paymentId: string) {
  return useEmployerResource<PaymentView | null>(async (api, signal) => api.payment(paymentId, signal), [paymentId]);
}

/* ───────────────── EMP-41 / EMP-45 / EMP-47 · Échéances, historique, plan ───────────────── */

const PAYMENT_SEGMENTS = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'DUE', label: 'Échues' },
  { id: 'PENDING_VERIFICATION', label: 'En vérification' },
  { id: 'PAID', label: 'Payées' },
  { id: 'REJECTED', label: 'Rejetées' },
] as const;

export function Employer41Payments({ unitId, pathname }: EmployerUnitProps) {
  const [segment, setSegment] = useState('ALL');
  const history = pathname.endsWith('/historique');
  const plan = pathname.endsWith('/plan');
  const screenCode = history ? 'EMP-45' : plan ? 'EMP-47' : 'EMP-41';
  const resource = useEmployerResource<PaymentView[]>(async (api, signal) => (await api.myPayments({ limit: 100, signal })).items, []);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label={`Chargement des ${PRODUCT_LABELS.PAYMENT.plural.toLowerCase()}`} rows={5} />;

  const payments = resource.data;
  const visible = payments.filter((payment) => segment === 'ALL' || payment.status === segment);
  const next = [...payments].filter((payment) => payment.status !== 'PAID').sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0] ?? null;
  const due = payments.filter((payment) => payment.status === 'DUE').length;

  if (plan) {
    return <Employer47PaymentPlan unitId={unitId} pathname={pathname} payments={payments} reload={resource.reload} />;
  }

  return (
    <>
      <PageHead
        title={history ? `Historique des ${PRODUCT_LABELS.PAYMENT.plural.toLowerCase()}` : PRODUCT_LABELS.PAYMENT.plural}
        lede={
          history
            ? `${payments.length} échéance(s) persistée(s) · pagination par curseur côté serveur`
            : next
            ? `Prochaine échéance : ${formatDate(next.dueAt) ?? '—'} · ${formatAmount(next.amount, next.currency)}`
            : 'Aucune échéance persistée sur ce compte.'
        }
        seal={{ tone: due > 0 ? 'amber' : 'slate', label: due > 0 ? `${due} échue(s)` : 'À jour' }}
      />

      <FilterChips
        label="Segments d’état"
        options={PAYMENT_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={segment}
        onChange={setSegment}
      />

      {!history ? (
        <Panel title="Encours & prochaine échéance (valeurs persistées)" zone="kpi">
          <KeyValues
            items={[
              { label: 'Échéances non payées', value: String(payments.filter((payment) => payment.status !== 'PAID').length) },
              { label: 'Échues', value: String(due) },
              { label: 'Prochaine échéance', value: next ? `${formatDate(next.dueAt) ?? '—'} · ${formatAmount(next.amount, next.currency)}` : null },
            ]}
          />
          <p className="lbm-caption lbm-muted">Aucun total, aucun intérêt et aucun frais ne sont calculés : le modèle financier n’est pas touché par cette tranche.</p>
        </Panel>
      ) : null}

      <Panel title={history ? 'Historique réel' : 'Calendrier des échéances'} zone="table">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Aucune échéance dans ce segment.</EmptyNotice>}
          render={(payment) => <PaymentCard payment={payment} />}
        />
      </Panel>

      <ActionRow>
        <Link href="/client/paiements/historique" className="lbm-employer__link">
          Historique
        </Link>
        <Link href="/client/paiements/plan" className="lbm-employer__link">
          Échéancier
        </Link>
        <Link href="/client/paiements/declaration" className="lbm-employer__link">
          Déclarer un règlement
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

function Employer47PaymentPlan({ unitId, pathname, payments, reload }: { unitId: string; pathname: string; payments: PaymentView[]; reload: () => void }) {
  const resource = useEmployerResource<{ contracts: Contract[]; byContract: Record<string, PaymentView[]> }>(
    async (api, signal) => {
      const contracts = (await api.myContracts({ limit: 25, signal })).items;
      const byContract: Record<string, PaymentView[]> = {};
      for (const contract of contracts) {
        byContract[contract.id] = payments.filter((payment) => payment.contractId === contract.id);
      }
      return { contracts, byContract };
    },
    [payments],
  );

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de l’échéancier" rows={4} />;
  const plan = resource.data;

  return (
    <>
      <PageHead
        title="Échéancier"
        lede="Échéancier réellement persisté par contrat. Aucune modification n’est proposée : elle exigerait une route d’avenant inexistante."
        seal={{ tone: 'gold', label: 'Lecture seule' }}
      />

      {plan.contracts.length === 0 ? (
        <EmptyNotice>Aucun contrat lisible : aucun échéancier à afficher.</EmptyNotice>
      ) : (
        plan.contracts.map((contract) => (
          <Panel key={contract.id} title={`Contrat ${contract.id} · ${contract.offerTitle}`} zone="table">
            <RecordList
              items={plan.byContract[contract.id] ?? []}
              empty={<EmptyNotice>Aucune échéance persistée sur ce contrat.</EmptyNotice>}
              render={(payment) => <PaymentCard payment={payment} />}
            />
          </Panel>
        ))
      )}

      <Panel title="Contrôle de somme" zone="notice">
        <EmptyNotice>
          Le contrôle « somme = total » de la fiche exigerait un modèle de plan de paiement modifiable : il n’existe pas. Aucun écart n’est calculé, aucune jauge n’est affichée.
        </EmptyNotice>
      </Panel>

      <ActionRow>
        <Link href="/client/paiements" className="lbm-employer__link">
          Retour aux échéances
        </Link>
        <RetryButton onClick={reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-47" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-42 · Détail d'une échéance ───────────────── */

export function Employer42PaymentDetail({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const paymentId = params.id ?? '';
  const resource = usePaymentResource(paymentId);
  const action = useEmployerAction<unknown>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de l’échéance" rows={4} />;

  const payment = resource.data;

  return (
    <>
      <PageHead
        title="Échéance"
        lede={payment ? `${typeLabel(payment)} · ${payment.periodKey}` : 'Aucune échéance ne porte cet identifiant.'}
        seal={payment ? { tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] } : { tone: 'slate', label: 'Introuvable' }}
      />

      {payment ? (
        <>
          <Panel title="Détail persisté" zone="price">
            <KeyValues
              items={[
                { label: 'Montant enregistré', value: formatAmount(payment.amount, payment.currency) },
                { label: 'Type', value: typeLabel(payment) },
                { label: 'Mois', value: String(payment.monthNumber) },
                { label: 'Programmée le', value: formatDate(payment.scheduledAt) },
                { label: 'Échéance', value: formatDate(payment.dueAt) },
                { label: 'Déclarée', value: payment.declared ? 'Oui' : 'Non' },
                { label: 'Vérifiée', value: payment.verified ? 'Oui' : 'Non' },
                { label: 'Payée', value: payment.paid ? 'Oui' : 'Non' },
                { label: 'Référence', value: payment.reference ?? null },
                { label: 'Fournisseur', value: payment.provider ?? null },
                { label: 'Transaction externe', value: payment.externalTransactionId ?? null },
                { label: 'Motif de rejet', value: payment.rejectionReason ?? null },
              ]}
            />
          </Panel>

          <Panel title="Tentatives de déclaration (append-only)" zone="list">
            <RecordList
              items={payment.declarations}
              empty={<EmptyNotice>Aucune déclaration enregistrée sur cette échéance.</EmptyNotice>}
              render={(declaration) => (
                <RecordCard
                  title={`Tentative ${declaration.attemptNumber} · ${declaration.outcome}`}
                  facts={[
                    { label: 'Montant déclaré', value: formatAmount(declaration.amount, declaration.currency) },
                    { label: 'Référence', value: declaration.reference },
                    { label: 'Soumise le', value: formatDateTime(declaration.submittedAt) ?? '—' },
                  ]}
                />
              )}
            />
          </Panel>
        </>
      ) : (
        <EmptyNotice>Aucune donnée n’est affichée pour cet identifiant : aucune échéance n’a été renvoyée par le serveur.</EmptyNotice>
      )}

      <ActionRow>
        {api && payment ? (
          <>
            {payment.paymentType === 'SALARY' ? (
              <NeoPressButton
                variant="ghost"
                loading={action.busy}
                onClick={() => action.run((signal) => api.requestSalaryConfirmation(payment.paymentId, signal)).then(() => resource.reload())}
              >
                Demander la confirmation du salaire
              </NeoPressButton>
            ) : null}
            <NeoPressButton
              variant="ghost"
              loading={action.busy}
              onClick={() => action.run((signal) => api.closeMissionPayments(payment.contractId, signal)).then(() => resource.reload())}
            >
              Constater les échéances du contrat
            </NeoPressButton>
          </>
        ) : null}
        <Link href={`/client/paiements/${paymentId}/recu`} className="lbm-employer__link">
          Reçu
        </Link>
        <Link href={`/client/contrats/${payment?.contractId ?? ''}`} className="lbm-employer__link">
          Contrat
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title="BACKEND_GAP · EMP-42" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-43 / EMP-44 · Déclaration et vérification ───────────────── */

export function Employer43Declaration({ unitId, pathname, params }: EmployerUnitProps) {
  const api = useEmployerApi();
  const verification = pathname.includes('/verification');
  const screenCode = verification ? 'EMP-44' : 'EMP-43';
  const [contractId, setContractId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [reference, setReference] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [provider, setProvider] = useState('');
  const [outcome, setOutcome] = useState<PaymentView | null>(null);
  const action = useEmployerAction<PaymentView>();

  const resource = useEmployerResource<{ contracts: Contract[]; payments: PaymentView[] }>(
    async (api2, signal) => ({
      contracts: (await api2.myContracts({ limit: 25, signal })).items,
      payments: (await api2.myPayments({ limit: 100, signal })).items,
    }),
    [],
  );

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des échéances déclarables" rows={4} />;

  const selected = resource.data.payments.find((payment) => payment.paymentId === paymentId) ?? null;
  const visibleTargets = resource.data.payments.filter((payment) => !contractId || payment.contractId === contractId);

  const submit = () => {
    if (!api || !selected) return;
    const draft: EmployerPaymentDeclarationDraft = {
      paymentId: selected.paymentId,
      contractId: selected.contractId,
      periodKey: selected.periodKey,
      reference,
      ...(transactionId ? { externalTransactionId: transactionId } : {}),
      ...(provider ? { provider } : {}),
    };
    const call = selected.paymentType === 'SALARY' ? api.declareSalary(draft) : api.declareCommission(draft);
    void action.run(() => call).then((payment) => {
      if (payment) {
        setOutcome(payment);
        resource.reload();
      }
    });
  };

  if (verification) {
    return <Employer44Verification unitId={unitId} pathname={pathname} paymentId={params.id ?? ''} />;
  }

  return (
    <>
      <PageHead
        title="Déclarer un règlement hors plateforme"
        lede="Employeur déclare, modération vérifie : DECLARED n’est jamais PAID (règle du produit, rappelée ici)."
        seal={{ tone: 'gold', label: 'Déclaration' }}
      />

      <Panel title="Objet de la déclaration" zone="form">
        <label className="lbm-employer__field">
          <span>Contrat</span>
          <select value={contractId} onChange={(event) => { setContractId(event.target.value); setPaymentId(''); }}>
            <option value="">Tous les contrats lisibles</option>
            {resource.data.contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.offerTitle} · {contract.employeeName}
              </option>
            ))}
          </select>
        </label>
        <label className="lbm-employer__field">
          <span>Échéance concernée</span>
          <select value={paymentId} onChange={(event) => setPaymentId(event.target.value)}>
            <option value="">Choisir une échéance</option>
            {visibleTargets.map((payment) => (
              <option key={payment.paymentId} value={payment.paymentId}>
                {typeLabel(payment)} · {payment.periodKey} · {formatAmount(payment.amount, payment.currency)} · {PAYMENT_STATUS_LABELS[payment.status]}
              </option>
            ))}
          </select>
        </label>
        <label className="lbm-employer__field">
          <span>Référence du règlement</span>
          <input value={reference} onChange={(event) => setReference(event.target.value)} />
        </label>
        <label className="lbm-employer__field">
          <span>Identifiant de transaction externe (facultatif)</span>
          <input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} />
        </label>
        <label className="lbm-employer__field">
          <span>Fournisseur (facultatif)</span>
          <input value={provider} onChange={(event) => setProvider(event.target.value)} />
        </label>
      </Panel>

      <Panel title="Conséquences & transparence" zone="kpi">
        <ul className="lbm-employer__list">
          <li className="lbm-body">La déclaration est append-only : chaque tentative est conservée avec son numéro.</li>
          <li className="lbm-body">La vérification est un acte de modération : l’employeur ne peut pas s’auto-vérifier.</li>
          <li className="lbm-body">Le montant déclaré est repris de l’échéance persistée ; aucun montant n’est saisi ici.</li>
        </ul>
        {selected ? (
          <KeyValues
            items={[
              { label: 'Échéance choisie', value: `${typeLabel(selected)} · ${selected.periodKey}` },
              { label: 'Montant enregistré', value: formatAmount(selected.amount, selected.currency) },
              { label: 'État', value: PAYMENT_STATUS_LABELS[selected.status] },
              { label: 'Déclarations existantes', value: String(selected.declarationCount) },
            ]}
          />
        ) : null}
      </Panel>

      <ActionRow>
        {api ? (
          <NeoPressButton variant="primary" disabled={!selected || reference.trim().length === 0} loading={action.busy} onClick={submit}>
            Déclarer le règlement
          </NeoPressButton>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {outcome ? (
        <Panel title="Déclaration enregistrée" zone="verdict">
          <KeyValues items={[{ label: 'Échéance', value: outcome.paymentId }, { label: 'Nouvel état', value: PAYMENT_STATUS_LABELS[outcome.status] }]} />
        </Panel>
      ) : null}

      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title="BACKEND_GAP · EMP-43" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

function Employer44Verification({ unitId, pathname, paymentId }: { unitId: string; pathname: string; paymentId: string }) {
  const resource = usePaymentResource(paymentId);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de la vérification" rows={4} />;

  const payment = resource.data;

  return (
    <>
      <PageHead
        title="Vérification d’une déclaration"
        lede="La vérification est un acte de modération : aucun bouton de vérification n’existe côté employeur."
        seal={payment ? { tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] } : { tone: 'slate', label: 'Introuvable' }}
      />

      <Panel title="Étapes réelles de la déclaration" zone="timeline">
        <RecordList
          items={payment?.declarations ?? []}
          empty={<EmptyNotice>Aucune déclaration enregistrée pour cette échéance.</EmptyNotice>}
          render={(declaration) => (
            <RecordCard
              title={`Tentative ${declaration.attemptNumber} · ${declaration.outcome}`}
              seal={{ tone: declaration.outcome === 'VERIFIED' ? 'emerald' : declaration.outcome === 'REJECTED' ? 'clay' : 'gold', label: declaration.outcome }}
              facts={[
                { label: 'Soumise le', value: formatDateTime(declaration.submittedAt) ?? '—' },
                { label: 'Référence', value: declaration.reference },
                { label: 'Motif de rejet', value: declaration.rejectionReason ?? '—' },
              ]}
            />
          )}
        />
      </Panel>

      <Panel title="Contrôles automatiques" zone="table">
        <EmptyNotice>
          Aucun contrôle automatique n’est exposé à l’employeur (le produit ne publie ni relevé PSP, ni score de rapprochement). Aucun résultat n’est simulé.
        </EmptyNotice>
      </Panel>

      <ActionRow>
        <Link href={`/client/paiements/${paymentId}`} className="lbm-employer__link">
          Fiche de l’échéance
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-44" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-46 · Reçu & preuve de paiement ───────────────── */

export function Employer46Receipt({ unitId, params, pathname }: EmployerUnitProps) {
  const resource = usePaymentResource(params.id ?? '');
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du reçu" rows={3} />;

  const payment = resource.data;

  return (
    <>
      <PageHead
        title="Reçu de paiement"
        lede="Aucun reçu téléchargeable n’est produit : seules les preuves réellement enregistrées sont affichées."
        seal={payment ? { tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] } : { tone: 'slate', label: 'Introuvable' }}
      />

      <Panel title="Preuve enregistrée" zone="doc">
        {payment ? (
          <KeyValues
            items={[
              { label: 'Échéance', value: payment.paymentId },
              { label: 'Montant enregistré', value: formatAmount(payment.amount, payment.currency) },
              { label: 'Référence', value: payment.reference ?? null },
              { label: 'Fournisseur', value: payment.provider ?? null },
              { label: 'Transaction externe', value: payment.externalTransactionId ?? null },
              { label: 'Vérifiée le', value: formatDateTime(payment.verifiedAt) },
              { label: 'Payée le', value: formatDateTime(payment.updatedAt) },
              { label: 'Motif de rejet', value: payment.rejectionReason ?? null },
            ]}
          />
        ) : (
          <EmptyNotice>Aucune échéance renvoyée par le serveur pour cet identifiant.</EmptyNotice>
        )}
      </Panel>

      <ActionRow>
        <Link href={`/client/paiements/${params.id ?? ''}`} className="lbm-employer__link">
          Retour à l’échéance
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-46" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-48 · Contestation d'un paiement ───────────────── */

export function Employer48PaymentDispute({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const paymentId = params.id ?? '';
  const [reason, setReason] = useState('');
  const [created, setCreated] = useState(false);
  const resource = usePaymentResource(paymentId);
  const action = useEmployerAction<{ claimId: string }>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de l’échéance contestée" rows={4} />;

  const payment = resource.data;

  return (
    <>
      <PageHead
        title="Contester un paiement"
        lede="La contestation réelle est un claim de type PAYMENT_DISPUTE (POST /claims) : aucune route de recalcul de paiement n’existe."
        seal={{ tone: 'clay', label: 'Claim' }}
      />

      <Panel title="Ligne contestée" zone="price">
        {payment ? (
          <KeyValues
            items={[
              { label: 'Échéance', value: payment.paymentId },
              { label: 'Contrat', value: payment.contractId },
              { label: 'Montant enregistré', value: formatAmount(payment.amount, payment.currency) },
              { label: 'État', value: PAYMENT_STATUS_LABELS[payment.status] },
            ]}
          />
        ) : (
          <EmptyNotice>Aucune échéance renvoyée par le serveur pour cet identifiant.</EmptyNotice>
        )}
      </Panel>

      <Panel title="Nature de la contestation" zone="form">
        <label className="lbm-employer__field">
          <span>Faits constatés (obligatoire)</span>
          <textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <p className="lbm-caption lbm-muted">
          Le motif est transmis tel quel au dossier de claim. Le montant contesté n’est pas recalculé ici : le modèle de paiement n’est pas modifié par cette tranche.
        </p>
      </Panel>

      <Panel title="Traitement attendu" zone="kpi">
        <ul className="lbm-employer__list">
          <li className="lbm-body">Instruction contradictoire avec demandes de pièces (statuts réels du claim).</li>
          <li className="lbm-body">Décision de modération : l’employeur ne décide pas du sort de sa propre contestation.</li>
          <li className="lbm-body">Aucun remboursement automatique n’est promis : l’exécution suit la décision.</li>
        </ul>
      </Panel>

      <ActionRow>
        {api && payment ? (
          <NeoPressButton
            variant="primary"
            disabled={reason.trim().length < 20}
            loading={action.busy}
            onClick={() =>
              action
                .run((signal) =>
                  api.createClaim({ contractId: payment.contractId, paymentId: payment.paymentId, type: 'PAYMENT_DISPUTE', reason: reason.trim() }, signal),
                )
                .then((claim) => {
                  if (claim) setCreated(true);
                })
            }
          >
            Envoyer la contestation
          </NeoPressButton>
        ) : null}
        <Link href="/client/litiges" className="lbm-employer__link">
          Dossiers de claim
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {created ? <Panel title="Dossier ouvert" zone="verdict"><p className="lbm-body">La contestation a été enregistrée : elle est visible dans vos dossiers de claim.</p></Panel> : null}
      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title="BACKEND_GAP · EMP-48" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}
