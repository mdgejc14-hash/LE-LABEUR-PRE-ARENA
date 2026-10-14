/**
 * PRE-28 → PRE-31 — Exécution : suivi, preuves, validation reçue.
 *
 * Le produit n’a AUCUNE route d’exécution mission (ni jalons de preuves, ni
 * dépôt de preuve, ni validation, ni obstacles, ni montant acquis). Les seules
 * données réelles d’exécution sont le contrat (statut, échéancier persisté,
 * points de contrôle mensuels) et le constat d’exécution bilatéral.
 *
 * Rien n’est simulé : les écrans affichent les données réelles du contrat et
 * déclarent les capacités absentes (BACKEND_GAP). Le système de documents R2
 * couvre les pièces professionnelles, pas les preuves d’exécution.
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
  RecordList,
  Timeline,
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { PrestataireUnitProps } from '../types';
import { CONTRACT_STATUS_LABELS, PRODUCT_LABELS, formatAmount, formatDate } from '../vocabulary';

function useContractByOffer(offerId: string) {
  return usePrestataireResource<Contract | null>(async (api, signal) => {
    const page = await api.myContracts({ limit: 100, signal });
    return page.items.find((contract) => contract.offerId === offerId) ?? null;
  }, [offerId]);
}

/* ───────────────── PRE-28 · Suivi d'exécution ───────────────── */

export function Prestataire28Execution({ unitId, params, pathname }: PrestataireUnitProps) {
  const offerId = params.id;
  const validations = pathname.endsWith('/validations');
  const resource = useContractByOffer(offerId);

  if (validations) {
    return (
      <>
        <PageHead
          title="Validations reçues"
          lede="Aucune route de validation de preuve n’existe dans le produit : les validations, refus et validations tacites ne sont pas exposés. Rien n’est simulé."
          seal={{ tone: 'clay', label: 'Indisponible' }}
        />
        <Panel title="Ce qui existe réellement" zone="notice" tone="notice">
          {`Le constat d’exécution bilatéral (POST /contracts/:contractId/confirm-execution) et l’échéancier de salaire persisté dans le contrat sont les seuls suivis réels. Les montants affichés sont les montants du contrat, jamais un « montant acquis » calculé localement.`}
        </Panel>
        {resource.data ? (
          <Panel title="Contrat concerné (réel)" zone="list">
            <KeyValues
              items={[
                { label: 'Contrat', value: resource.data.id },
                { label: 'Statut', value: CONTRACT_STATUS_LABELS[resource.data.status] },
                { label: 'Salaire mensuel', value: formatAmount(resource.data.monthlySalary, resource.data.currency) },
              ]}
            />
          </Panel>
        ) : null}
        <ActionRow>
          <Link href={`/prestataire/missions/${offerId}/execution`} className="lbm-candidat__link">
            Retour au suivi
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-31" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du suivi d’exécution" rows={4} />;

  if (!resource.data) {
    return (
      <>
        <PageHead
          title="Suivi d’exécution"
          lede={`Aucun contrat réel ne correspond à l’offre ${offerId}. Le suivi d’exécution existe pour les contrats signés.`}
          seal={{ tone: 'slate', label: 'Sans contrat' }}
        />
        <Panel title="Chemin réel" zone="notice" tone="notice">
          {`Une candidature retenue mène à une proposition, acceptée elle génère un contrat : c’est le contrat qui porte l’exécution. Les jalons de preuves, le dépôt de preuve et le signalement d’obstacle n’existent pas dans le produit (BACKEND_GAP).`}
        </Panel>
        <ActionRow>
          <Link href="/prestataire/missions" className="lbm-candidat__link">
            Marché des {PRODUCT_LABELS.OFFER.plural.toLowerCase()}
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-28" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  const contract = resource.data;

  return (
    <>
      <PageHead
        title={`Exécution · ${contract.offerTitle}`}
        lede={`Contrat ${contract.id} avec ${contract.employerName}. Les points de contrôle mensuels ci-dessous sont les données réelles persistées dans le contrat.`}
        seal={{ tone: 'emerald', label: CONTRACT_STATUS_LABELS[contract.status] }}
      />

      <Panel title="Points de contrôle mensuels (réels)" zone="timeline">
        <Timeline
          steps={contract.monthlyCheckpoints.map((checkpoint) => ({
            label: `Mois ${checkpoint.monthNumber} · ${checkpoint.periodKey}`,
            detail: `${formatAmount(checkpoint.salaryAmount, checkpoint.currency)} · démarré : ${checkpoint.isStarted ? 'oui' : 'non'}`,
            done: checkpoint.startConfirmed === true,
          }))}
        />
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

      <Panel title="Constat d’exécution" zone="cta">
        <p className="lbm-caption lbm-muted">
          Le constat d’exécution se fait depuis le folio du contrat (commande réelle, rôle candidat autorisé). Aucun suivi de jalons, dépôt de preuve ni signalement d’obstacle n’est disponible.
        </p>
      </Panel>

      <ActionRow>
        <Link href={`/prestataire/contrats/${contract.id}`} className="lbm-candidat__link">
          Folio du {PRODUCT_LABELS.CONTRACT.singular.toLowerCase()}
        </Link>
        <Link href={`/prestataire/missions/${offerId}/jalons`} className="lbm-candidat__link">
          Jalons & preuves
        </Link>
        <Link href={`/prestataire/missions/${offerId}/validations`} className="lbm-candidat__link">
          Validations reçues
        </Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-28" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-29 / PRE-30 · Jalons & dépôt de preuve ───────────────── */

export function Prestataire29Evidence({ unitId, params, pathname }: PrestataireUnitProps) {
  const offerId = params.id;
  const depot = pathname.endsWith('/evidence/nouvelle') || pathname === '/prestataire/evidence/nouvelle';
  const resource = useContractByOffer(offerId);

  if (depot) {
    return (
      <>
        <PageHead
          title="Déposer une preuve"
          lede="Aucun dépôt de preuve d’exécution n’existe dans le produit : la route POST /v1/evidence décrite par la fiche est absente. Le système de documents R2 accepte les pièces professionnelles (identité, habilitations), pas les preuves de chantier."
          seal={{ tone: 'clay', label: 'Indisponible' }}
        />
        <Panel title="Ce qui existe réellement" zone="notice" tone="notice">
          {`Le candidat dépose ses pièces professionnelles dans l’espace ${PRODUCT_LABELS.DOCUMENT.plural.toLowerCase()} (upload R2 réel, versionné, hashé). Une preuve d’exécution (photo horodatée, géoloc, conformité) n’a aucune route : aucune capture, aucune file d’attente, aucun envoi n’est simulé.`}
        </Panel>
        <ActionRow>
          <Link href="/prestataire/documents" className="lbm-candidat__link">
            Mes {PRODUCT_LABELS.DOCUMENT.plural.toLowerCase()}
          </Link>
          <Link href={`/prestataire/missions/${offerId}/jalons`} className="lbm-candidat__link">
            Retour aux jalons
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-30" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement des jalons" rows={4} />;

  return (
    <>
      <PageHead
        title="Jalons & preuves attendues"
        lede="Aucune exigence de preuve n’est définie dans le produit : les preuves attendues, formats et délais de la fiche n’existent pas côté serveur. Les seules exigences réelles sont les points de contrôle mensuels du contrat."
        seal={{ tone: 'slate', label: 'Sans exigence produit' }}
      />

      {resource.data ? (
        <Panel title="Points de contrôle réels du contrat" zone="list">
          <RecordList
            items={resource.data.monthlyCheckpoints}
            empty={<EmptyNotice>Aucun point de contrôle enregistré.</EmptyNotice>}
            render={(checkpoint) => (
              <KeyValues
                items={[
                  { label: `Mois ${checkpoint.monthNumber}`, value: checkpoint.periodKey },
                  { label: 'Salaire du mois', value: formatAmount(checkpoint.salaryAmount, checkpoint.currency) },
                  { label: 'Démarrage confirmé', value: checkpoint.startConfirmed ? 'Oui' : 'Non' },
                ]}
              />
            )}
          />
        </Panel>
      ) : (
        <Panel title="Sans contrat" zone="notice" tone="notice">
          {`Aucun contrat réel ne correspond à l’offre ${offerId} : aucune exigence de preuve ne peut être affichée.`}
        </Panel>
      )}

      <ActionRow>
        <Link href={`/prestataire/evidence/nouvelle`} className="lbm-candidat__link">
          Déposer une preuve
        </Link>
        {resource.data ? (
          <Link href={`/prestataire/missions/${offerId}/execution`} className="lbm-candidat__link">
            Suivi d’exécution
          </Link>
        ) : null}
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-29" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
