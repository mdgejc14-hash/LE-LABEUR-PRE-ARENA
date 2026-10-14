/**
 * PRE-32 → PRE-39 — Salaire : attendu, échéances, déclaration employeur,
 * réconciliation, retard & relance, OTP de réception, reçu.
 *
 * RÈGLES FINANCIÈRES (non négociables, non modifiées par cette tranche) :
 *  - LE LABEUR ne détient pas l’argent du travailleur : aucun escrow, aucun
 *    wallet, aucun transfert interne, aucun paiement simulé ;
 *  - le candidat ne voit QUE ses salaires : /my/payments filtre `SALARY` côté
 *    serveur, la commission employeur n’est jamais demandée ni affichée ;
 *  - un paiement DÉCLARÉ n’est pas un paiement VÉRIFIÉ ;
 *  - un paiement VÉRIFIÉ/PAYÉ n’est pas une CONFIRMATION du travailleur :
 *    la confirmation est l’OTP P0-SALARY (POST /payments/:id/salary-confirmation) ;
 *  - aucun montant, échéancier, intérêt ou pénalité n’est calculé ici.
 */

import { useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
  FilterChips,
  GapNotice,
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
  Timeline,
  Zone,
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireAction, usePrestataireApi, usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { ClaimView, PaymentView, PrestataireApi, SalaryConfirmationResult } from '../api';
import type { PrestataireUnitProps } from '../types';
import { CLAIM_STATUS_LABELS, CLAIM_TYPE_LABELS, PAYMENT_STATUS_LABELS, PRODUCT_LABELS, SALARY_STATUS_LABELS, formatAmount, formatDate, formatDateTime } from '../vocabulary';

function paymentTone(status: PaymentView['status']): 'emerald' | 'gold' | 'amber' | 'slate' | 'clay' {
  if (status === 'PAID' || status === 'VERIFIED') return 'emerald';
  if (status === 'DUE') return 'amber';
  if (status === 'REJECTED') return 'clay';
  if (status === 'PENDING_VERIFICATION') return 'gold';
  return 'slate';
}

/** Vérité d'affichage : les quatre drapeaux réels du paiement, jamais confondus. */
function paymentFacts(payment: PaymentView) {
  return [
    { label: 'Période', value: payment.periodKey },
    { label: 'Montant', value: formatAmount(payment.amount, payment.currency) },
    { label: 'Échéance', value: formatDate(payment.dueAt) ?? '—' },
    { label: 'Déclaré', value: payment.declared ? 'Oui' : 'Non' },
    { label: 'Vérifié', value: payment.verified ? 'Oui' : 'Non' },
    { label: 'Payé', value: payment.paid ? 'Oui' : 'Non' },
  ];
}

function PaymentCard({ payment }: { payment: PaymentView }) {
  return (
    <RecordCard
      title={`${PRODUCT_LABELS.SALARY.singular} · mois ${payment.monthNumber}`}
      href={`/prestataire/salaire/${payment.paymentId}/otp`}
      seal={{ tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] }}
      facts={paymentFacts(payment)}
    />
  );
}

async function loadSalary(api: PrestataireApi, signal: AbortSignal) {
  const [payments, contracts, claims] = await Promise.all([
    api.myPayments({ limit: 100, signal }),
    api.myContracts({ limit: 100, signal }),
    api.myClaims({ limit: 50, signal }),
  ]);
  return { payments: payments.items, contracts: contracts.items, claims: claims.items };
}

/* ───────────────── PRE-32 / PRE-33 · Salaire attendu & échéances ───────────────── */

const SALARY_SEGMENTS = [
  { id: 'ALL', label: 'Tous' },
  { id: 'SCHEDULED', label: 'Programmés' },
  { id: 'DUE', label: 'Échus' },
  { id: 'PENDING_VERIFICATION', label: 'En vérification' },
  { id: 'PAID', label: 'Payés' },
] as const;

export function Prestataire32Salary({ unitId, pathname }: PrestataireUnitProps) {
  const [segment, setSegment] = useState('ALL');
  const echeances = pathname.endsWith('/echeances');
  const resource = usePrestataireResource(loadSalary, []);
  const schedules = usePrestataireResource<unknown>(async (api, signal) => api.listSchedulesProbe(signal), []);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label={`Chargement du ${PRODUCT_LABELS.SALARY.singular.toLowerCase()}`} rows={5} />;

  const { payments, contracts } = resource.data;
  const visible = payments.filter((payment) => segment === 'ALL' || payment.status === segment);
  const overdue = payments.filter((payment) => payment.status !== 'PAID' && payment.dueAt < new Date().toISOString());
  const scheduleEntries = contracts.flatMap((contract) =>
    contract.paymentSchedule.map((entry) => ({ contract, entry })),
  );

  return (
    <>
      <PageHead
        title={echeances ? `Échéances de ${PRODUCT_LABELS.SALARY.singular.toLowerCase()}` : `Mon ${PRODUCT_LABELS.SALARY.singular.toLowerCase()}`}
        lede={echeances
          ? 'Calendrier réel des salaires attendus, issu de l’échéancier persisté dans vos contrats. La route /my/schedules est déclarée sans handler (501) : le calendrier serveur dédié n’est pas disponible.'
          : 'Ce qu’on vous doit, paiement par paiement, avec l’état réel de chacun. Un paiement déclaré n’est pas vérifié ; un paiement payé n’est confirmé que par votre OTP.'}
        seal={{ tone: overdue.length > 0 ? 'clay' : 'emerald', label: overdue.length > 0 ? `${overdue.length} en retard` : 'À jour' }}
      />

      <KpiRow
        items={[
          { label: 'EN ATTENTE', value: String(payments.filter((payment) => payment.status !== 'PAID').length) },
          { label: 'EN RETARD', value: String(overdue.length) },
          { label: 'PAYÉS', value: String(payments.filter((payment) => payment.status === 'PAID').length) },
        ]}
      />

      {!echeances ? (
        <FilterChips
          label="Segments"
          options={SALARY_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))}
          value={segment}
          onChange={setSegment}
        />
      ) : null}

      {echeances ? (
        <Panel title="Échéancier réel (persisté dans les contrats)" zone="timeline">
          <Timeline
            steps={scheduleEntries.map(({ contract, entry }) => ({
              label: `Mois ${entry.monthNumber} · ${entry.periodKey} · ${contract.offerTitle}`,
              detail: `${formatAmount(entry.salaryAmount, entry.currency)} · échéance ${formatDate(entry.salaryDueDate) ?? '—'} · ${SALARY_STATUS_LABELS[entry.salaryStatus]}`,
              done: entry.salaryStatus === 'PAID',
            }))}
          />
        </Panel>
      ) : (
        <Panel title={`Salaires (${PRODUCT_LABELS.PAYMENT.plural})`} zone="list">
          <RecordList
            items={visible}
            empty={<EmptyNotice>Aucun salaire enregistré. Les salaires apparaissent ici quand un contrat est signé.</EmptyNotice>}
            render={(payment) => <PaymentCard payment={payment} />}
          />
        </Panel>
      )}

      <Panel title="Mécanismes expliqués (règles réelles)" zone="list">
        <RecordList
          items={[
            `Le ${PRODUCT_LABELS.SALARY.singular.toLowerCase()} est déclaré par l’employeur hors plateforme, puis vérifié par la modération : « déclaré » et « vérifié » sont deux états distincts.`,
            'Quand le paiement est payé, l’employeur demande une confirmation OTP : vous confirmez la réception avec un code à 6 chiffres. Tant que vous n’avez pas confirmé, l’échéance reste ouverte.',
            'En cas de retard, une relance est déclenchée côté plateforme ; vous pouvez ouvrir un claim « Salaire non reçu » sans attendre.',
          ]}
          render={(item) => <p className="lbm-body">{item}</p>}
        />
      </Panel>

      <ActionRow>
        <Link href={echeances ? '/prestataire/salaire' : '/prestataire/salaire/echeances'} className="lbm-candidat__link">
          {echeances ? 'Voir les paiements' : 'Voir les échéances'}
        </Link>
        <Link href="/prestataire/salaire/retard" className="lbm-candidat__link">
          Retards & relances
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {schedules.status === 'error' ? (
        <Panel title="Calendrier serveur dédié (route déclarée, sans handler)" zone="notice" tone="notice">
          {`La route /my/schedules répond 501 NOT_IMPLEMENTED : l’échéancier affiché est celui réellement persisté dans vos contrats. État réel du serveur, aucune donnée simulée.`}
        </Panel>
      ) : null}

      <GapNotice title={echeances ? 'BACKEND_GAP · PRE-33' : 'BACKEND_GAP · PRE-32'} items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-34 / PRE-35 · Déclaré par l'employeur & réconciliation ───────────────── */

function usePaymentResource(paymentId: string) {
  return usePrestataireResource<PaymentView>(async (api, signal) => api.payment(paymentId, signal), [paymentId]);
}

export function Prestataire34SalaryDeclared({ unitId, params, pathname }: PrestataireUnitProps) {
  const paymentId = params.id;
  const verification = pathname.endsWith('/verification');
  const resource = usePaymentResource(paymentId);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du paiement" rows={4} />;

  const payment = resource.data;

  if (verification) {
    return (
      <>
        <PageHead
          title={`Vérification · ${PRODUCT_LABELS.SALARY.singular.toLowerCase()} mois ${payment.monthNumber}`}
          lede="La vérification d’une déclaration est un acte de modération : aucune réconciliation n’est exposée au candidat, et le candidat ne soumet aucune pièce de réconciliation (les pièces d’un claim se soumettent via le dossier claim)."
          seal={{ tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] }}
        />
        <Panel title="État réel de la vérification" zone="list">
          <KeyValues
            items={[
              { label: 'Statut', value: PAYMENT_STATUS_LABELS[payment.status] },
              { label: 'Déclaré', value: payment.declared ? 'Oui' : 'Non' },
              { label: 'Vérifié', value: payment.verified ? `Oui · ${formatDateTime(payment.verifiedAt) ?? '—'}` : 'Non' },
              { label: 'Payé', value: payment.paid ? 'Oui' : 'Non' },
            ]}
          />
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/salaire/${paymentId}/declare`} className="lbm-candidat__link">
            Voir la déclaration
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-35" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title={`Déclaration · ${PRODUCT_LABELS.SALARY.singular.toLowerCase()} mois ${payment.monthNumber}`}
        lede="Déclaration réelle de l’employeur, telle que persistée. Le candidat ne confirme ni ne conteste une déclaration depuis l’API : la confirmation de réception est l’OTP, sur un paiement payé."
        seal={{ tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] }}
      />

      <Panel title="Paiement réel" zone="list">
        <KeyValues
          items={[
            { label: 'Montant', value: formatAmount(payment.amount, payment.currency) },
            { label: 'Période', value: payment.periodKey },
            { label: 'Échéance', value: formatDate(payment.dueAt) ?? '—' },
            { label: 'Statut', value: PAYMENT_STATUS_LABELS[payment.status] },
            { label: 'Déclaré', value: payment.declared ? 'Oui' : 'Non' },
            { label: 'Vérifié', value: payment.verified ? 'Oui' : 'Non' },
            { label: 'Payé', value: payment.paid ? 'Oui' : 'Non' },
          ]}
        />
      </Panel>

      <Panel title="Déclarations enregistrées (append-only)" zone="list">
        <RecordList
          items={payment.declarations}
          empty={<EmptyNotice>Aucune déclaration enregistrée pour ce paiement.</EmptyNotice>}
          render={(declaration) => (
            <RecordCard
              title={`Tentative ${declaration.attemptNumber} · ${formatAmount(Number(declaration.amount), declaration.currency)}`}
              seal={{ tone: 'slate', label: declaration.provider ?? '—' }}
              facts={[
                { label: 'Référence', value: declaration.reference ?? '—' },
                { label: 'Transaction externe', value: declaration.externalTransactionId ?? '—' },
                { label: 'Soumise le', value: formatDateTime(declaration.submittedAt) ?? '—' },
                { label: 'Issue', value: declaration.outcome ?? '—' },
              ]}
            />
          )}
        />
      </Panel>

      <Panel title="Ce que vous pouvez faire (réel)" zone="cta">
        <RecordList
          items={[
            payment.paid ? `Confirmer la réception par OTP (paiement payé) → /prestataire/salaire/${paymentId}/otp` : null,
            payment.status !== 'PAID' ? `Signaler un salaire non reçu (claim « ${CLAIM_TYPE_LABELS.SALARY_NOT_RECEIVED} ») → /prestataire/salaire/retard` : null,
          ].filter((item): item is string => item !== null)}
          render={(item) => <p className="lbm-body">{item}</p>}
        />
      </Panel>

      <ActionRow>
        <Link href={`/prestataire/salaire/${paymentId}/verification`} className="lbm-candidat__link">
          Voir la vérification
        </Link>
        {payment.paid ? (
          <Link href={`/prestataire/salaire/${paymentId}/otp`} className="lbm-candidat__link">
            Confirmer la réception (OTP)
          </Link>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-34" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-36 / PRE-37 · Retard & relance ───────────────── */

export function Prestataire36SalaryOverdue({ unitId, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const relance = pathname.endsWith('/relance');
  const resource = usePrestataireResource(loadSalary, []);
  const claim = usePrestataireAction<ClaimView>();
  const [claimContractId, setClaimContractId] = useState('');
  const [claimReason, setClaimReason] = useState('Salaire non reçu à l’échéance prévue.');

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des retards" rows={4} />;

  const { payments, contracts, claims } = resource.data;
  const now = new Date().toISOString();
  const overdue = payments.filter((payment) => payment.status !== 'PAID' && payment.dueAt < now);
  const openClaims = claims.filter((entry) => !['RESOLVED', 'REJECTED', 'CLOSED'].includes(entry.status));

  if (relance) {
    return (
      <>
        <PageHead
          title="Relance"
          lede="Aucune relance tracée n’est exposée au candidat : les rappels sont un mécanisme interne du cycle de paiement. Le canal réel est le claim."
          seal={{ tone: 'slate', label: 'Interne' }}
        />
        <Panel title="Ce qui existe réellement" zone="notice" tone="notice">
          {`Les relances de retard sont déclenchées côté plateforme (aucun compteur exposé). Pour un salaire non reçu, ouvrez un claim « ${CLAIM_TYPE_LABELS.SALARY_NOT_RECEIVED} » : c’est la route réelle, traçable et examinée par la modération.`}
        </Panel>
        <ActionRow>
          <Link href="/prestataire/salaire/retard" className="lbm-candidat__link">
            Retards & relances
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-37" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Retards & relances"
        lede={`${overdue.length} salaire(s) en retard (échéance réelle dépassée, paiement non payé). La relance est automatique côté plateforme ; vous n’avez rien à faire pour être relancé.`}
        seal={{ tone: overdue.length > 0 ? 'clay' : 'emerald', label: overdue.length > 0 ? 'Retard' : 'À jour' }}
      />

      <Panel title="Salaires en retard (dérivés de l’échéance réelle)" zone="list">
        <RecordList
          items={overdue}
          empty={<EmptyNotice>Aucun salaire en retard. Tout est à jour.</EmptyNotice>}
          render={(payment) => <PaymentCard payment={payment} />}
        />
      </Panel>

      <Panel title={`Vos ${PRODUCT_LABELS.CLAIM.plural.toLowerCase()} ouverts`} zone="list">
        <RecordList
          items={openClaims}
          empty={<EmptyNotice>Aucun claim ouvert.</EmptyNotice>}
          render={(entry) => (
            <RecordCard
              title={`${CLAIM_TYPE_LABELS[entry.type]} · ${entry.claimId}`}
              seal={{ tone: 'amber', label: CLAIM_STATUS_LABELS[entry.status] }}
              facts={[
                { label: 'Ouvert le', value: formatDate(entry.createdAt) ?? '—' },
                { label: 'Motif', value: entry.reason },
              ]}
            />
          )}
        />
      </Panel>

      <Panel title="Ouvrir un claim « Salaire non reçu » (route réelle)" zone="form">
        <p className="lbm-caption lbm-muted">
          Le claim est créé contre un de vos contrats réels. Le travail validé reste dû, quelle que soit la suite du dossier.
        </p>
        <label className="lbm-candidat__field">
          Contrat concerné
          <select
            id="claim-contract"
            onChange={(event) => {
              const contractId = event.target.value;
              const reason = window.prompt('Motif du claim (obligatoire) :', 'Salaire non reçu à l’échéance prévue.');
              if (!contractId || !reason) return;
              void claim.run((signal) =>
                api!.createClaim({ contractId, type: 'SALARY_NOT_RECEIVED', reason }, signal),
              );
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Choisir un contrat
            </option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.offerTitle} · {contract.employerName}
              </option>
            ))}
          </select>
        </label>
      </Panel>

      {claim.error ? <SystemFeedback {...claim.error} retry={claim.reset} /> : null}
      {claim.result ? (
        <Panel title="Claim ouvert (réponse serveur)" zone="notice" tone="notice">
          {`Dossier ${claim.result.claimId} ouvert (statut réel : ${CLAIM_STATUS_LABELS[claim.result.status]}). La modération examine le dossier ; les pièces vous seront demandées via le dossier si nécessaire.`}
        </Panel>
      ) : null}

      <ActionRow>
        <Link href="/prestataire/salaire" className="lbm-candidat__link">
          Mon {PRODUCT_LABELS.SALARY.singular.toLowerCase()}
        </Link>
        <Link href="/prestataire/salaire/echeances" className="lbm-candidat__link">
          Échéances
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-36" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-38 / PRE-39 · OTP de réception & reçu ───────────────── */

export function Prestataire38SalaryOtp({ unitId, params, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const paymentId = params.id;
  const receipt = pathname.endsWith('/recu');
  const resource = usePaymentResource(paymentId);
  const [otp, setOtp] = useState('');
  const [nonce, setNonce] = useState('');
  const confirm = usePrestataireAction<SalaryConfirmationResult>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du paiement" rows={4} />;

  const payment = resource.data;

  if (receipt) {
    return (
      <>
        <PageHead
          title={`Reçu · ${PRODUCT_LABELS.SALARY.singular.toLowerCase()} mois ${payment.monthNumber}`}
          lede="Aucun reçu téléchargeable n’est produit par le produit (ni reçu PDF, ni relevé annuel). Les données réelles du paiement sont affichées ci-dessous."
          seal={{ tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] }}
        />
        <Panel title="Paiement réel" zone="list">
          <KeyValues
            items={[
              { label: 'Montant', value: formatAmount(payment.amount, payment.currency) },
              { label: 'Période', value: payment.periodKey },
              { label: 'Statut', value: PAYMENT_STATUS_LABELS[payment.status] },
              { label: 'Vérifié le', value: formatDateTime(payment.verifiedAt) ?? 'Non vérifié' },
              { label: 'Référence', value: payment.reference ?? null },
              { label: 'Transaction externe', value: payment.externalTransactionId ?? null },
            ]}
          />
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/salaire/${paymentId}/otp`} className="lbm-candidat__link">
            Confirmation OTP
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-39" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title={`Confirmation de réception · mois ${payment.monthNumber}`}
        lede={payment.paid
          ? 'Le paiement est marqué payé. Confirmez la réception avec le code à 6 chiffres reçu par le canal prévu et le nonce de la demande. Votre confirmation clôt l’échéance ; sans elle, l’échéance reste ouverte.'
          : `Le paiement est en statut « ${PAYMENT_STATUS_LABELS[payment.status]} » : la confirmation OTP n’est possible que sur un paiement payé. Un paiement déclaré n’est pas un paiement vérifié ; un paiement vérifié n’est pas une confirmation de votre part.`}
        seal={{ tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] }}
      />

      <Panel title="Paiement réel" zone="price">
        <p className="lbm-candidat__kpi-value lbm-mono">{formatAmount(payment.amount, payment.currency)}</p>
        <KeyValues
          items={[
            { label: 'Période', value: payment.periodKey },
            { label: 'Échéance', value: formatDate(payment.dueAt) ?? '—' },
            { label: 'Déclaré', value: payment.declared ? 'Oui' : 'Non' },
            { label: 'Vérifié', value: payment.verified ? 'Oui' : 'Non' },
            { label: 'Payé', value: payment.paid ? 'Oui' : 'Non' },
          ]}
        />
      </Panel>

      {payment.paid ? (
        <Panel title="Confirmer la réception (route réelle P0-SALARY)" zone="form">
          <div className="lbm-candidat__fields">
            <label className="lbm-candidat__field">
              Code à 6 chiffres (OTP)
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            <label className="lbm-candidat__field">
              Nonce de la demande
              <input value={nonce} onChange={(event) => setNonce(event.target.value)} placeholder="Nonce reçu avec la demande" />
            </label>
          </div>
          <p className="lbm-caption lbm-muted">
            La confirmation vaut preuve horodatée : « J’ai bien reçu ce salaire ». Ne confirmez jamais sans avoir vérifié votre compte réel.
          </p>
          <NeoPressButton
            variant="primary"
            loading={confirm.busy}
            disabled={otp.length !== 6 || nonce.trim().length === 0}
            onClick={() => {
              void confirm.run((signal) => api!.confirmSalary(paymentId, otp, nonce.trim(), signal)).then((result) => {
                if (result) resource.reload();
              });
            }}
          >
            J’ai bien reçu ce {PRODUCT_LABELS.SALARY.singular.toLowerCase()}
          </NeoPressButton>
        </Panel>
      ) : (
        <Panel title="Confirmation non requise" zone="notice" tone="notice">
          {`Tant que le paiement n’est pas payé, aucune confirmation n’est attendue. Surveillez l’état réel ci-dessus : déclaré → en vérification → payé → à confirmer.`}
        </Panel>
      )}

      {confirm.error ? <SystemFeedback {...confirm.error} retry={confirm.reset} /> : null}
      {confirm.result ? (
        <Panel title="Réception confirmée (réponse serveur)" zone="notice" tone="notice">
          {`Statut serveur : ${confirm.result.status}. La confirmation est horodatée et tracée ; l’échéance est clôturée côté serveur.`}
        </Panel>
      ) : null}

      <ActionRow>
        <Link href={`/prestataire/salaire/${paymentId}/recu`} className="lbm-candidat__link">
          Voir le reçu
        </Link>
        <Link href="/prestataire/salaire" className="lbm-candidat__link">
          Mon {PRODUCT_LABELS.SALARY.singular.toLowerCase()}
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-38" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
