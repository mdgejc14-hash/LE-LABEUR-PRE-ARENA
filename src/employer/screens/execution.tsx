/**
 * EMP-37 / EMP-38 — Exécution : suivi employeur et validation de preuve.
 *
 * Le suivi s'appuie sur l'état RÉEL du contrat, ses jalons mensuels persistés
 * (`monthlyCheckpoints`) et son échéancier. La validation de preuve côté
 * employeur n'existe pas dans le produit : aucune preuve n'est présentée comme
 * validée ou refusée, et aucun verdict n'est simulé.
 */

import {
  ActionRow,
  EmptyNotice,
  GapNotice,
  KeyValues,
  Link,
  LoadingBlock,
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  RetryButton,
  StatusSeal,
  Timeline,
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { EmployerUnitProps } from '../types';
import { CONTRACT_STATUS_LABELS, formatAmount, formatDate } from '../vocabulary';
import { contractTone } from './contracts';

export function Employer37Execution({ unitId, params, pathname }: EmployerUnitProps) {
  const offerId = params.id ?? '';
  const resource = useEmployerResource<Contract | null>(
    async (api, signal) => (await api.myContracts({ limit: 100, signal })).items.find((contract) => contract.offerId === offerId) ?? null,
    [offerId],
  );
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de l’exécution" rows={4} />;

  const contract = resource.data;

  return (
    <>
      <PageHead
        title="Suivi d’exécution"
        lede={contract ? `Contrat ${contract.id} · ${CONTRACT_STATUS_LABELS[contract.status]}` : 'Aucun contrat lié à cette offre dans les données réellement lisibles.'}
        seal={contract ? { tone: contractTone(contract.status), label: CONTRACT_STATUS_LABELS[contract.status] } : { tone: 'slate', label: 'Sans contrat' }}
      />

      {contract ? (
        <>
          <Panel title="Santé d’exécution (faits enregistrés)" zone="kpi">
            <KeyValues
              items={[
                { label: 'Mois courant', value: String(contract.currentMonth) },
                { label: 'Durée prévue (mois)', value: String(contract.durationMonths) },
                { label: 'Fin prévue', value: formatDate(contract.endDate) },
                { label: 'Salaire mensuel enregistré', value: formatAmount(contract.monthlySalary, contract.currency) },
              ]}
            />
          </Panel>

          <Panel title="Jalons mensuels persistés" zone="timeline">
            <Timeline
              steps={contract.monthlyCheckpoints.map((checkpoint) => ({
                label: `Mois ${checkpoint.monthNumber} · ${checkpoint.periodKey}`,
                detail: `Démarrage ${checkpoint.startConfirmed ? 'confirmé' : 'non confirmé'} · salaire ${checkpoint.isSalaryPaidToEmployee ? 'déclaré payé' : 'non payé'} · employeur ${checkpoint.employerConfirmed ? 'confirmé' : 'en attente'}`,
                done: checkpoint.employerConfirmed && checkpoint.isSalaryPaidToEmployee,
              }))}
            />
            {contract.monthlyCheckpoints.length === 0 ? <EmptyNotice>Aucun jalon mensuel n’est encore persisté sur ce contrat.</EmptyNotice> : null}
          </Panel>

          <Panel title="Échéancier persisté" zone="list">
            <RecordList
              items={contract.paymentSchedule}
              empty={<EmptyNotice>Aucune échéance persistée.</EmptyNotice>}
              render={(entry) => (
                <RecordCard
                  title={`Mois ${entry.monthNumber} · ${entry.periodKey}`}
                  facts={[
                    { label: 'Salaire', value: `${formatAmount(entry.salaryAmount, entry.currency)} · ${entry.salaryStatus}` },
                    { label: 'Commission', value: `${formatAmount(entry.commissionAmount, entry.currency)} · ${entry.commissionStatus}` },
                    { label: 'Date de salaire', value: formatDate(entry.salaryDueDate) ?? '—' },
                  ]}
                />
              )}
            />
          </Panel>
        </>
      ) : (
        <Panel title="Aucun contrat à suivre" zone="list">
          <EmptyNotice>
            Le suivi d’exécution suppose un contrat réellement créé. Aucune exécution n’est affichée sans contrat : aucune donnée n’est simulée.
          </EmptyNotice>
        </Panel>
      )}

      <Panel title="Preuves en attente d’action" zone="doc">
        <EmptyNotice>
          Le produit n’expose aucune validation de preuve côté employeur (POST /v1/evidence/:id/approve|reject absent). Aucune preuve n’est donc listée ici comme « à valider »,
          et aucun verdict n’est présenté.
        </EmptyNotice>
      </Panel>

      <ActionRow>
        {contract ? (
          <Link href={`/client/contrats/${contract.id}`} className="lbm-employer__link">
            Contrat
          </Link>
        ) : null}
        <Link href={`/client/missions/${offerId}`} className="lbm-employer__link">
          Fiche de l’offre
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-37" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

export function Employer38Evidence({ unitId, params, pathname }: EmployerUnitProps) {
  const evidenceId = params.id ?? '';
  const resource = useEmployerResource<Contract[]>(async (api, signal) => (await api.myContracts({ limit: 50, signal })).items, []);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la preuve" rows={3} />;

  return (
    <>
      <PageHead
        title="Validation de preuve"
        lede={`Pièce ${evidenceId}`}
        seal={{ tone: 'slate', label: 'Lecture absente' }}
      />

      <Panel title="Pièce présentée" zone="doc">
        <EmptyNotice>
          Aucune route du produit ne restitue une preuve à l’employeur (lecture des pièces et versions absente). La pièce {evidenceId} n’est donc ni affichée, ni jugée : sa
          conformité aux exigences ne peut pas être établie ici.
        </EmptyNotice>
      </Panel>

      <Panel title="Conformité aux exigences" zone="list">
        <EmptyNotice>
          Aucune checklist de conformité n’existe dans le produit. Un verdict « conforme / non conforme » serait une invention : il n’est pas affiché.
        </EmptyNotice>
      </Panel>

      <Panel title="Conséquence du verdict" zone="kpi">
        <StatusSeal tone="slate" label="Aucun verdict" />
        <p className="lbm-caption lbm-muted">
          Les {resource.data.length} contrat(s) lisibles sur ce compte ne portent aucun état de preuve validée ou refusée : rien n’est déduit du nombre de contrats.
        </p>
      </Panel>

      <ActionRow>
        <Link href="/client/missions" className="lbm-employer__link">
          Registre des offres
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-38" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}
