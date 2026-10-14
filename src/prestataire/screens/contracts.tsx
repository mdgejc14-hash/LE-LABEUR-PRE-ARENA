/**
 * PRE-21 → PRE-27 — Contrat candidat : folio & états, lecture, révision,
 * signature, contrat actif, avenant, résiliation.
 *
 * Données réelles : GET /my/contracts, GET /contracts/:contractId, signature
 * POST /contracts/:contractId/sign (aucun corps : identité et horodatage
 * serveur), constat d’exécution POST /contracts/:contractId/confirm-execution
 * (rôle CANDIDATE autorisé par le contrat de route).
 *
 * Le produit ne versionne pas les contrats (aucun avenant persisté) et la
 * résiliation est réservée au rôle EMPLOYER : les capacités absentes sont
 * déclarées (BACKEND_GAP), jamais simulées.
 */

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
  Timeline,
  Zone,
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireAction, usePrestataireApi, usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { PrestataireUnitProps } from '../types';
import { CONTRACT_STATUS_LABELS, PRODUCT_LABELS, formatAmount, formatDate, formatDateTime } from '../vocabulary';

export function contractTone(status: Contract['status']): 'emerald' | 'gold' | 'slate' | 'clay' | 'amber' {
  if (status === 'ACTIVE') return 'emerald';
  if (status === 'DRAFT') return 'slate';
  if (status === 'TERMINATED' || status === 'INCIDENT') return 'clay';
  if (status === 'COMPLETED') return 'gold';
  return 'amber';
}

function useContractResource(contractId: string) {
  return usePrestataireResource<Contract>(async (api, signal) => api.contract(contractId, signal), [contractId]);
}

function ContractHead({ contract }: { contract: Contract }) {
  return (
    <PageHead
      title={contract.offerTitle}
      lede={`${contract.employerName} · ${contract.location}`}
      seal={{ tone: contractTone(contract.status), label: CONTRACT_STATUS_LABELS[contract.status] }}
    />
  );
}

/* ───────────────── PRE-21 / PRE-22 / PRE-23 / PRE-25 / PRE-26 / PRE-27 · Folio & états ───────────────── */

export function Prestataire21ContractFolio({ unitId, params, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const contractId = params.id;
  const reading = pathname.endsWith('/lecture');
  const version = pathname.endsWith('/versions/v') || pathname.includes('/versions/');
  const active = pathname.endsWith('/actif');
  const amendment = pathname.includes('/avenants/');
  const termination = pathname.endsWith('/resiliation');
  const resource = useContractResource(contractId);
  const sign = usePrestataireAction<Contract>();
  const confirmExecution = usePrestataireAction<Contract>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du contrat" rows={5} />;

  const contract = resource.data;

  if (reading) {
    return (
      <>
        <ContractHead contract={contract} />
        <Panel title="Lecture du contrat (contenu réel)" zone="doc">
          <KeyValues
            items={[
              { label: 'Description', value: contract.missionDescription || null },
              { label: 'Lieu', value: contract.location },
              { label: 'Début', value: formatDate(contract.startDate) ?? null },
              { label: 'Fin', value: formatDate(contract.endDate) ?? null },
              { label: 'Périodicité', value: contract.periodicity },
              { label: 'Durée', value: `${contract.durationMonths} mois` },
              { label: 'Notes', value: contract.additionalNotes ?? null },
            ]}
          />
          {contract.conditions.length > 0 ? (
            <RecordList items={contract.conditions} render={(item) => <p className="lbm-body">{item}</p>} />
          ) : null}
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/contrats/${contract.id}`} className="lbm-candidat__link">
            Retour au folio
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-22" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (version || amendment) {
    return (
      <>
        <ContractHead contract={contract} />
        <Panel title="Révision du contrat" zone="notice" tone="notice">
          {`Le produit ne versionne pas les contrats : aucune révision ni avenant n’est persisté. Le folio ci-dessous est l’état réel courant du contrat ${contract.id}.`}
        </Panel>
        <Panel title="État réel courant" zone="list">
          <KeyValues
            items={[
              { label: 'Statut', value: CONTRACT_STATUS_LABELS[contract.status] },
              { label: 'Salaire mensuel', value: formatAmount(contract.monthlySalary, contract.currency) },
              { label: 'Signé employeur', value: contract.employerSigned ? `Oui (${formatDateTime(contract.employerSignedAt) ?? '—'})` : 'Non' },
              { label: 'Signé candidat', value: contract.employeeSigned ? `Oui (${formatDateTime(contract.employeeSignedAt) ?? '—'})` : 'Non' },
            ]}
          />
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/contrats/${contract.id}`} className="lbm-candidat__link">
            Retour au folio
          </Link>
        </ActionRow>
        <GapNotice title={amendment ? 'BACKEND_GAP · PRE-26' : 'BACKEND_GAP · PRE-23'} items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (termination) {
    return (
      <>
        <ContractHead contract={contract} />
        <Panel title="Résiliation" zone="notice" tone="notice">
          {`La résiliation POST /contracts/:contractId/terminate est réservée au rôle EMPLOYER : le candidat ne peut pas résilier un contrat depuis l’API. En cas de difficulté, le canal réel est un claim (SALARY_NOT_RECEIVED, PAYMENT_DISPUTE, CONTRACT_INCIDENT). Le travail validé reste dû, quelle que soit la raison de la résiliation.`}
        </Panel>
        <Panel title="État réel" zone="list">
          <KeyValues
            items={[
              { label: 'Statut', value: CONTRACT_STATUS_LABELS[contract.status] },
              { label: 'Salaire mensuel', value: formatAmount(contract.monthlySalary, contract.currency) },
            ]}
          />
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/salaire`} className="lbm-candidat__link">
            Voir mon {PRODUCT_LABELS.SALARY.singular.toLowerCase()}
          </Link>
          <Link href="/prestataire/salaire/retard" className="lbm-candidat__link">
            Signaler un problème
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-27" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (active) {
    return (
      <>
        <ContractHead contract={contract} />
        <Panel title="Échéancier de salaire (persisté dans le contrat)" zone="timeline">
          <Timeline
            steps={contract.paymentSchedule.map((entry) => ({
              label: `Mois ${entry.monthNumber} · ${entry.periodKey}`,
              detail: `${formatAmount(entry.salaryAmount, entry.currency)} · échéance ${formatDate(entry.salaryDueDate) ?? '—'} · ${entry.salaryStatus}`,
              done: entry.salaryStatus === 'PAID',
            }))}
          />
        </Panel>
        <Panel title="Constat d’exécution (commande réelle, rôle candidat autorisé)" zone="cta">
          <p className="lbm-caption lbm-muted">
            Confirmer l’exécution atteste que le travail a été réalisé. C’est un acte réel, horodaté côté serveur : il déclenche la suite du cycle de paiement selon les règles existantes.
          </p>
          <NeoPressButton
            variant="primary"
            loading={confirmExecution.busy}
            onClick={() => {
              void confirmExecution.run((signal) => api!.confirmContractExecution(contractId, signal)).then((result) => {
                if (result) resource.reload();
              });
            }}
          >
            Confirmer l’exécution
          </NeoPressButton>
        </Panel>
        {confirmExecution.error ? <SystemFeedback {...confirmExecution.error} retry={confirmExecution.reset} /> : null}
        {confirmExecution.result ? (
          <Panel title="Constat enregistré (réponse serveur)" zone="notice" tone="notice">
            {`Statut réel du contrat après constat : ${CONTRACT_STATUS_LABELS[confirmExecution.result.status]}.`}
          </Panel>
        ) : null}
        <ActionRow>
          <Link href={`/prestataire/missions/${contract.offerId}/execution`} className="lbm-candidat__link">
            Suivi d’exécution
          </Link>
          <Link href={`/prestataire/salaire`} className="lbm-candidat__link">
            Mon {PRODUCT_LABELS.SALARY.singular.toLowerCase()}
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-25" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  return (
    <>
      <ContractHead contract={contract} />

      <Panel title="Termes réels du contrat" zone="list">
        <KeyValues
          items={[
            { label: 'Offre', value: contract.offerTitle },
            { label: 'Employeur', value: contract.employerName },
            { label: 'Salaire mensuel', value: formatAmount(contract.monthlySalary, contract.currency) },
            { label: 'Début', value: formatDate(contract.startDate) ?? null },
            { label: 'Fin', value: formatDate(contract.endDate) ?? null },
            { label: 'Périodicité', value: contract.periodicity },
            { label: 'Lieu', value: contract.location },
            { label: 'Proposition d’origine', value: contract.proposalId ?? null },
          ]}
        />
      </Panel>

      <Panel title="Signatures (état réel)" zone="sign">
        <KeyValues
          items={[
            { label: 'Signé employeur', value: contract.employerSigned ? `Oui · ${formatDateTime(contract.employerSignedAt) ?? '—'}` : 'Non' },
            { label: 'Signé candidat', value: contract.employeeSigned ? `Oui · ${formatDateTime(contract.employeeSignedAt) ?? '—'}` : 'Non' },
          ]}
        />
        {contract.status === 'SIGNATURE' || contract.status === 'PENDING_EMPLOYEE' ? (
          <>
            <p className="lbm-caption lbm-muted">
              La signature réelle ne prend aucun corps : l’identité et l’horodatage sont dérivés côté serveur. Aucun pad de signature ni empreinte affichée (capacité absente, déclarée ci-dessous).
            </p>
            <NeoPressButton
              variant="primary"
              loading={sign.busy}
              onClick={() => {
                void sign.run((signal) => api!.signContract(contractId, signal)).then((result) => {
                  if (result) resource.reload();
                });
              }}
            >
              Signer le {PRODUCT_LABELS.CONTRACT.singular.toLowerCase()}
            </NeoPressButton>
          </>
        ) : null}
        {sign.error ? <SystemFeedback {...sign.error} retry={sign.reset} /> : null}
        {sign.result ? (
          <Panel title="Signature enregistrée (réponse serveur)" zone="notice" tone="notice">
            {`Statut réel après signature : ${CONTRACT_STATUS_LABELS[sign.result.status]}.`}
          </Panel>
        ) : null}
      </Panel>

      <Panel title="Échéancier de salaire (persisté)" zone="timeline">
        <Timeline
          steps={contract.paymentSchedule.map((entry) => ({
            label: `Mois ${entry.monthNumber} · ${entry.periodKey}`,
            detail: `${formatAmount(entry.salaryAmount, entry.currency)} · échéance ${formatDate(entry.salaryDueDate) ?? '—'} · ${entry.salaryStatus}`,
            done: entry.salaryStatus === 'PAID',
          }))}
        />
      </Panel>

      <Panel title="Historique réel du contrat" zone="timeline">
        <RecordList
          items={contract.history}
          empty={<EmptyNotice>Aucun événement enregistré.</EmptyNotice>}
          render={(entry) => (
            <p className="lbm-body">
              {entry.event} · {entry.description} · {formatDateTime(entry.timestamp) ?? '—'}
            </p>
          )}
        />
      </Panel>

      <ActionRow>
        <Link href={`/prestataire/contrats/${contract.id}/lecture`} className="lbm-candidat__link">
          Lecture
        </Link>
        <Link href={`/prestataire/contrats/${contract.id}/actif`} className="lbm-candidat__link">
          État actif
        </Link>
        <Link href={`/prestataire/contrats/${contract.id}/resiliation`} className="lbm-candidat__link">
          Résiliation
        </Link>
        <Link href={`/prestataire/missions/${contract.offerId}/execution`} className="lbm-candidat__link">
          Exécution
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-21" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-24 · Signature ───────────────── */

export function Prestataire24ContractSignature({ unitId, params, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const contractId = params.id;
  const resource = useContractResource(contractId);
  const sign = usePrestataireAction<Contract>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du contrat" rows={4} />;

  const contract = resource.data;
  const canSign = contract.status === 'SIGNATURE' || contract.status === 'PENDING_EMPLOYEE';

  return (
    <>
      <PageHead
        title={`Signer · ${contract.offerTitle}`}
        lede={`Signature du ${PRODUCT_LABELS.CONTRACT.singular.toLowerCase()} avec ${contract.employerName}. L’acte est horodaté côté serveur ; l’identité vient de la session, jamais d’un champ soumis.`}
        seal={{ tone: contractTone(contract.status), label: CONTRACT_STATUS_LABELS[contract.status] }}
      />

      <Zone kind="sign">
        <Panel title="Termes signés (résumé réel)" zone="sign">
          <KeyValues
            items={[
              { label: 'Salaire mensuel', value: formatAmount(contract.monthlySalary, contract.currency) },
              { label: 'Début', value: formatDate(contract.startDate) ?? null },
              { label: 'Périodicité', value: contract.periodicity },
              { label: 'Lieu', value: contract.location },
              { label: 'Signé employeur', value: contract.employerSigned ? 'Oui' : 'Non' },
            ]}
          />
        </Panel>
      </Zone>

      {canSign ? (
        <ActionRow>
          <NeoPressButton
            variant="primary"
            loading={sign.busy}
            onClick={() => {
              void sign.run((signal) => api!.signContract(contractId, signal)).then((result) => {
                if (result) resource.reload();
              });
            }}
          >
            Signer le {PRODUCT_LABELS.CONTRACT.singular.toLowerCase()}
          </NeoPressButton>
          <Link href={`/prestataire/contrats/${contract.id}`} className="lbm-candidat__link">
            Annuler
          </Link>
        </ActionRow>
      ) : (
        <Panel title="Signature non requise" zone="notice" tone="notice">
          {`Le contrat est en statut « ${CONTRACT_STATUS_LABELS[contract.status]} » : la signature candidat n’est pas attendue à ce stade. L’état réel vient du serveur.`}
        </Panel>
      )}

      {sign.error ? <SystemFeedback {...sign.error} retry={sign.reset} /> : null}
      {sign.result ? (
        <Panel title="Signature enregistrée (réponse serveur)" zone="notice" tone="notice">
          {`Statut réel après signature : ${CONTRACT_STATUS_LABELS[sign.result.status]}.`}
        </Panel>
      ) : null}

      <GapNotice title="BACKEND_GAP · PRE-24" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
