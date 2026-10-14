/**
 * EMP-29 → EMP-36 et EMP-60 — Contrats : folio et états, versions/historique,
 * signature, exécution contractuelle, clôture, résiliation, succession.
 *
 * Toutes les valeurs affichées viennent du contrat réellement stocké
 * (`GET /contracts/:contractId`) et de son échéancier persisté. Aucun montant
 * n'est recalculé, aucune version de contrat n'est inventée, aucune empreinte
 * n'est affichée : le produit ne stocke pas de révision de contrat.
 */

import { useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
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
  StatusSeal,
  Zone,
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerAction, useEmployerApi, useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { EmployerApi, PaymentView } from '../api';
import type { EmployerUnitProps } from '../types';
import { CONTRACT_STATUS_LABELS, PAYMENT_STATUS_LABELS, PRODUCT_LABELS, formatAmount, formatDate, formatDateTime } from '../vocabulary';

export function contractTone(status: Contract['status']): 'emerald' | 'gold' | 'slate' | 'clay' | 'amber' {
  switch (status) {
    case 'ACTIVE':
    case 'COMPLETED':
      return 'emerald';
    case 'PENDING_EMPLOYER':
    case 'PENDING_EMPLOYEE':
    case 'SIGNATURE':
      return 'gold';
    case 'INCIDENT':
      return 'amber';
    case 'TERMINATED':
      return 'clay';
    default:
      return 'slate';
  }
}

interface ContractContext {
  contract: Contract;
  payments: PaymentView[];
}

function loadContract(id: string) {
  return async (api: EmployerApi, signal: AbortSignal): Promise<ContractContext> => {
    const contract = await api.contract(id, signal);
    const payments = contract ? (await api.contractPayments(id, { limit: 50, signal })).items : [];
    return { contract, payments };
  };
}

function ContractParties({ contract }: { contract: Contract }) {
  return (
    <KeyValues
      items={[
        { label: 'Référence', value: contract.id },
        { label: 'Statut', value: CONTRACT_STATUS_LABELS[contract.status] },
        { label: 'Employeur', value: contract.employerName },
        { label: 'Candidat', value: contract.employeeName },
        { label: 'Offre', value: contract.offerTitle },
        { label: 'Début', value: formatDate(contract.startDate) },
        { label: 'Fin', value: formatDate(contract.endDate) },
        { label: 'Durée (mois)', value: String(contract.durationMonths) },
        { label: 'Périodicité', value: contract.periodicity },
        { label: 'Mois courant', value: String(contract.currentMonth) },
      ]}
    />
  );
}

function ContractMoney({ contract }: { contract: Contract }) {
  return (
    <KeyValues
      items={[
        { label: 'Salaire mensuel enregistré', value: formatAmount(contract.monthlySalary, contract.currency) },
        { label: 'Taux de commission enregistré', value: `${contract.commissionPercentage} %` },
        { label: 'Montant de commission enregistré', value: formatAmount(contract.commissionAmountDue, contract.currency) },
        { label: 'Statut du registre de commission', value: contract.commissionStatus },
      ]}
    />
  );
}

function ContractSignatures({ contract }: { contract: Contract }) {
  return (
    <RecordList
      items={[
        { party: contract.employerName, signedAt: contract.employerSignedAt ?? null, done: Boolean(contract.employerSigned || contract.signedByEmployer) },
        { party: contract.employeeName, signedAt: contract.employeeSignedAt ?? null, done: Boolean(contract.employeeSigned || contract.signedByEmployee) },
      ]}
      render={(entry) => (
        <RecordCard
          title={entry.party}
          seal={{ tone: entry.done ? 'emerald' : 'slate', label: entry.done ? 'Signé' : 'En attente' }}
          facts={[{ label: 'Horodatage serveur', value: entry.signedAt ? (formatDateTime(entry.signedAt) ?? '—') : '—' }]}
        />
      )}
    />
  );
}

function ContractSchedule({ payments }: { payments: PaymentView[] }) {
  return (
    <RecordList
      items={payments}
      empty={<EmptyNotice>Aucune échéance persistée sur ce contrat.</EmptyNotice>}
      render={(payment) => (
        <RecordCard
          title={`${payment.paymentType === 'SALARY' ? PRODUCT_LABELS.SALARY.singular : 'Commission'} · mois ${payment.monthNumber} · ${payment.periodKey}`}
          href={`/client/paiements/${payment.paymentId}`}
          seal={{ tone: payment.status === 'PAID' ? 'emerald' : payment.status === 'DUE' ? 'amber' : 'slate', label: PAYMENT_STATUS_LABELS[payment.status] }}
          facts={[
            { label: 'Montant enregistré', value: formatAmount(payment.amount, payment.currency) },
            { label: 'Échéance', value: formatDate(payment.dueAt) ?? '—' },
          ]}
        />
      )}
    />
  );
}

type FolioVariant = 'folio' | 'active' | 'completed' | 'terminated' | 'replaced';

function ContractFolio({ unitId, pathname, params, variant }: EmployerUnitProps & { variant: FolioVariant }) {
  const api = useEmployerApi();
  const id = params.id ?? '';
  const resource = useEmployerResource<ContractContext>(loadContract(id), [id]);
  const action = useEmployerAction<Contract>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du contrat" rows={5} />;

  const { contract, payments } = resource.data;
  const next = payments.filter((payment) => payment.status !== 'PAID').sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0] ?? null;

  return (
    <>
      <PageHead
        title={`Contrat · ${contract.offerTitle}`}
        lede={`${contract.employeeName} · référence ${contract.id}`}
        seal={{ tone: contractTone(contract.status), label: CONTRACT_STATUS_LABELS[contract.status] }}
      />

      {variant === 'folio' ? (
        <Panel title="Parties et engagements" zone="hero">
          <ContractParties contract={contract} />
        </Panel>
      ) : null}

      {variant === 'active' ? (
        <>
          <Panel title="Obligations en cours" zone="timeline">
            <Zone kind="timeline" label="Prochaine échéance">
              <p className="lbm-body">
                {next
                  ? `Prochaine échéance : ${formatDate(next.dueAt) ?? '—'} · ${formatAmount(next.amount, next.currency)} (${PAYMENT_STATUS_LABELS[next.status]})`
                  : 'Aucune échéance restante persistée sur ce contrat.'}
              </p>
            </Zone>
          </Panel>
          <Panel title="Échéancier vivant" zone="price">
            <ContractSchedule payments={payments} />
          </Panel>
        </>
      ) : null}

      {variant === 'completed' ? (
        <Panel title="Bilan chiffré (valeurs enregistrées)" zone="kpi">
          <ContractMoney contract={contract} />
          <p className="lbm-caption lbm-muted">Aucun total n’est recalculé et aucun frais n’est estimé : seules les valeurs persistées sont affichées.</p>
        </Panel>
      ) : null}

      {variant === 'terminated' ? (
        <Panel title="Motif et déroulé" zone="hero">
          <EmptyNotice>
            Le motif de résiliation est transmis par l’appel POST /contracts/:contractId/terminate ; le produit ne le restitue pas dans le contrat relu. Aucun motif n’est donc
            affiché, et aucun décompte au prorata n’est calculé (modèle financier non modifié par cette tranche).
          </EmptyNotice>
        </Panel>
      ) : null}

      {variant === 'replaced' ? (
        <Panel title="Chaîne de succession" zone="chain">
          <KeyValues
            items={[
              { label: 'Contrat remplacé', value: contract.replacedContractId ?? null },
              { label: 'Dossier de remplacement', value: contract.replacementId ?? null },
              { label: 'Claim à l’origine', value: contract.incidentId ?? null },
            ]}
          />
        </Panel>
      ) : null}

      {variant !== 'completed' ? (
        <Panel title="Conditions financières enregistrées" zone="price">
          <ContractMoney contract={contract} />
        </Panel>
      ) : null}

      <Panel title="Signatures réelles" zone="sign">
        <ContractSignatures contract={contract} />
        <p className="lbm-caption lbm-muted">
          POST /contracts/:contractId/sign ne prend aucun corps : l’identité et l’horodatage sont dérivés côté serveur. Aucun pad de signature et aucune empreinte ne sont affichés.
        </p>
      </Panel>

      {variant === 'folio' ? (
        <Panel title="Corps du contrat" zone="doc">
          <KeyValues
            items={[
              { label: 'Description enregistrée', value: contract.missionDescription },
              { label: 'Lieu', value: contract.location },
              { label: 'Conditions', value: contract.conditions.join(', ') || null },
              { label: 'Notes complémentaires', value: contract.additionalNotes ?? null },
            ]}
          />
          <p className="lbm-caption lbm-muted">Aucun sommaire ancré, aucune pièce annexée et aucune révision R2 : le produit ne stocke pas de version de contrat.</p>
        </Panel>
      ) : null}

      <ActionRow>
        {api && contract.status === 'DRAFT' ? (
          <NeoPressButton variant="primary" loading={action.busy} onClick={() => action.run((signal) => api.sendContract(contract.id, signal)).then(() => resource.reload())}>
            Envoyer pour signature
          </NeoPressButton>
        ) : null}
        {api && (contract.status === 'PENDING_EMPLOYER' || contract.status === 'SIGNATURE') ? (
          <NeoPressButton variant="primary" loading={action.busy} onClick={() => action.run((signal) => api.signContract(contract.id, signal)).then(() => resource.reload())}>
            Signer le contrat
          </NeoPressButton>
        ) : null}
        {api && contract.status === 'ACTIVE' ? (
          <>
            <Link href={`/client/missions/${contract.offerId}/execution`} className="lbm-employer__link">
              Voir l’exécution
            </Link>
            <NeoPressButton variant="ghost" loading={action.busy} onClick={() => action.run((signal) => api.confirmContractExecution(contract.id, signal)).then(() => resource.reload())}>
              Confirmer l’exécution
            </NeoPressButton>
          </>
        ) : null}
        {api && ['PENDING_EMPLOYER', 'PENDING_EMPLOYEE', 'SIGNATURE', 'ACTIVE', 'INCIDENT', 'SUSPENDED'].includes(contract.status) ? (
          <NeoPressButton
            variant="text"
            loading={action.busy}
            onClick={() => action.run((signal) => api.terminateContract(contract.id, 'Résiliation demandée depuis l’espace employeur.', signal)).then(() => resource.reload())}
          >
            Résilier le contrat
          </NeoPressButton>
        ) : null}
        <Link href={`/client/contrats/${contract.id}/historique`} className="lbm-employer__link">
          Historique
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}

      <Panel title="Historique réel du contrat" zone="timeline">
        <RecordList
          items={contract.history}
          empty={<EmptyNotice>Aucun évènement enregistré sur ce contrat.</EmptyNotice>}
          render={(entry) => (
            <RecordCard
              title={entry.event}
              facts={[
                { label: 'Horodaté', value: formatDateTime(entry.timestamp) ?? '—' },
                { label: 'Acteur', value: entry.actor },
              ]}
            >
              <p className="lbm-body">{entry.description}</p>
            </RecordCard>
          )}
        />
      </Panel>

      <GapNotice title={`BACKEND_GAP · ${unitId}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

export function Employer29ContractFolio(props: EmployerUnitProps) {
  return <ContractFolio {...props} variant="folio" />;
}

export function Employer32ContractActive(props: EmployerUnitProps) {
  return <ContractFolio {...props} variant="active" />;
}

export function Employer33ContractCompleted(props: EmployerUnitProps) {
  return <ContractFolio {...props} variant="completed" />;
}

export function Employer34ContractTerminated(props: EmployerUnitProps) {
  return <ContractFolio {...props} variant="terminated" />;
}

export function Employer35ContractReplaced(props: EmployerUnitProps) {
  return <ContractFolio {...props} variant="replaced" />;
}

/* ───────────────── EMP-30 / EMP-36 · Versions et historique ───────────────── */

export function Employer30ContractVersions({ unitId, params, pathname }: EmployerUnitProps) {
  const id = params.id ?? '';
  const version = params.v ?? '1';
  const resource = useEmployerResource<Contract>(async (api, signal) => api.contract(id, signal), [id]);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de l’historique du contrat" rows={4} />;

  return (
    <>
      <PageHead
        title="Versions et révisions du contrat"
        lede={`Version demandée : ${version} · le produit ne stocke aucune révision de contrat.`}
        seal={{ tone: 'slate', label: 'Aucune version' }}
      />
      <Panel title="Ce que le contrat contient réellement" zone="list">
        <EmptyNotice>
          Aucun diff clause par clause, aucun motif de révision et aucune empreinte ne sont stockés : ils ne sont donc pas affichés. L’historique réel du contrat (journal
          d’évènements) est disponible ci-dessous.
        </EmptyNotice>
        <RecordList
          items={resource.data.history}
          empty={<EmptyNotice>Aucun évènement enregistré.</EmptyNotice>}
          render={(entry) => (
            <RecordCard
              title={entry.event}
              facts={[
                { label: 'Horodaté', value: formatDateTime(entry.timestamp) ?? '—' },
                { label: 'Acteur', value: entry.actor },
              ]}
            >
              <p className="lbm-body">{entry.description}</p>
            </RecordCard>
          )}
        />
      </Panel>
      <ActionRow>
        <Link href={`/client/contrats/${id}`} className="lbm-employer__link">
          Fiche du contrat
        </Link>
        <Link href={`/client/contrats/${id}/historique`} className="lbm-employer__link">
          Historique
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title={`BACKEND_GAP · ${unitId}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-31 · Signature employeur ───────────────── */

export function Employer31ContractSignature({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const id = params.id ?? '';
  const [consent, setConsent] = useState(false);
  const resource = useEmployerResource<ContractContext>(loadContract(id), [id]);
  const action = useEmployerAction<Contract>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du contrat à signer" rows={4} />;

  const { contract } = resource.data;
  const alreadySigned = Boolean(contract.employerSigned || contract.signedByEmployer);
  const signable = contract.status === 'PENDING_EMPLOYER' || contract.status === 'SIGNATURE' || contract.status === 'PENDING_EMPLOYEE';

  return (
    <>
      <PageHead
        title="Signature du contrat"
        lede="Aucun pad de signature ni OTP : le serveur dérive l’identité et l’horodatage de la session."
        seal={{ tone: alreadySigned ? 'gold' : 'slate', label: alreadySigned ? 'Signature enregistrée' : 'À signer' }}
      />

      <Panel title="Clauses critiques (valeurs réelles)" zone="doc">
        <KeyValues
          items={[
            { label: 'Périmètre', value: contract.missionDescription },
            { label: 'Candidat', value: contract.employeeName },
            { label: 'Lieu', value: contract.location },
            { label: 'Salaire mensuel enregistré', value: formatAmount(contract.monthlySalary, contract.currency) },
            { label: 'Début', value: formatDate(contract.startDate) },
            { label: 'Durée (mois)', value: String(contract.durationMonths) },
            { label: 'Conditions', value: contract.conditions.join(', ') || null },
          ]}
        />
      </Panel>

      <Panel title="Ce que la signature déclenche" zone="kpi">
        <ul className="lbm-employer__list">
          <li className="lbm-body">Engagement ferme : le contrat passe de {CONTRACT_STATUS_LABELS.PENDING_EMPLOYER} à {CONTRACT_STATUS_LABELS.SIGNATURE}.</li>
          <li className="lbm-body">Le travail n’est autorisé qu’après la signature des deux parties ({CONTRACT_STATUS_LABELS.ACTIVE}).</li>
          <li className="lbm-body">L’échéancier persisté du contrat reste la seule référence des échéances.</li>
        </ul>
      </Panel>

      <Panel title="Zone de signature" zone="sign">
        <label className="lbm-employer__check">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>Je signe en connaissance de cause et j’accepte les conditions enregistrées de ce contrat.</span>
        </label>
        <StatusSeal tone={alreadySigned ? 'emerald' : 'slate'} label={alreadySigned ? 'Déjà signé' : 'Non signé'} />
      </Panel>

      <ActionRow>
        {api && signable && !alreadySigned ? (
          <NeoPressButton
            variant="primary"
            disabled={!consent}
            loading={action.busy}
            onClick={() => action.run((signal) => api.signContract(contract.id, signal)).then(() => resource.reload())}
          >
            Signer le contrat
          </NeoPressButton>
        ) : null}
        <Link href={`/client/contrats/${contract.id}`} className="lbm-employer__link">
          Relire le folio
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title="BACKEND_GAP · EMP-31" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-60 · Contrat successeur ───────────────── */

export function Employer60ContractSuccessor({ unitId, params, pathname }: EmployerUnitProps) {
  const id = params.id ?? '';
  const resource = useEmployerResource<ContractContext>(loadContract(id), [id]);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du contrat successeur" rows={4} />;

  const { contract, payments } = resource.data;

  return (
    <>
      <PageHead
        title="Contrat successeur"
        lede={`Référence ${contract.id} · ${CONTRACT_STATUS_LABELS[contract.status]}`}
        seal={{ tone: contractTone(contract.status), label: CONTRACT_STATUS_LABELS[contract.status] }}
      />

      <Panel title="En-tête successeur" zone="hero">
        <ContractParties contract={contract} />
      </Panel>

      <Panel title="Clauses spécifiques à la reprise (références réelles)" zone="chain">
        <KeyValues
          items={[
            { label: 'Contrat remplacé', value: contract.replacedContractId ?? null },
            { label: 'Dossier de remplacement', value: contract.replacementId ?? null },
            { label: 'Claim à l’origine', value: contract.incidentId ?? null },
          ]}
        />
        {contract.replacedContractId ? (
          <Link href={`/client/contrats/${contract.replacedContractId}`} className="lbm-employer__link">
            Ouvrir le contrat remplacé
          </Link>
        ) : null}
      </Panel>

      <Panel title="Conditions financières de reprise (valeurs enregistrées)" zone="price">
        <ContractMoney contract={contract} />
      </Panel>

      <Panel title="Échéancier du successeur" zone="table">
        <ContractSchedule payments={payments} />
      </Panel>

      <ActionRow>
        <Link href={`/client/contrats/${contract.id}/signer`} className="lbm-employer__link">
          Signer
        </Link>
        <Link href={`/client/missions/${contract.offerId}/execution`} className="lbm-employer__link">
          Suivi d’exécution
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-60" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}
