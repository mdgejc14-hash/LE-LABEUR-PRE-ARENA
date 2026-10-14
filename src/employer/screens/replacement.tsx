/**
 * EMP-56 → EMP-59 — Remplacement : déclenchement, conditions, sélection du
 * remplaçant et confirmation de bascule.
 *
 * Un dossier de remplacement naît d'une décision de modération sur un claim :
 * l'employeur ne le crée pas. La seule commande employeur installée est la
 * publication de l'offre de reprise (`POST /replacements/:replacementId/offer`).
 * Le reste (vivier dédié, score de reprise, termes opposables) n'existe pas et
 * est déclaré absent — jamais simulé.
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
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerAction, useEmployerApi, useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract, ReplacementDossier } from '../../types';
import type { EmployerApi, EmployerOfferDraft } from '../api';
import type { EmployerUnitProps } from '../types';
import { PRODUCT_LABELS, REPLACEMENT_STATUS_LABELS, formatAmount, formatDate } from '../vocabulary';

interface ReplacementContext {
  contract: Contract | null;
  dossier: ReplacementDossier | null;
  all: ReplacementDossier[];
}

function loadReplacementForOffer(offerId: string) {
  return async (api: EmployerApi, signal: AbortSignal): Promise<ReplacementContext> => {
    const [contracts, replacements] = await Promise.all([
      api.myContracts({ limit: 50, signal }),
      api.myReplacements({ limit: 50, signal }),
    ]);
    const contract = contracts.items.find((entry) => entry.offerId === offerId) ?? null;
    const dossier = contract ? replacements.items.find((entry) => entry.originalContractId === contract.id) ?? null : null;
    return { contract, dossier, all: replacements.items };
  };
}

function dossierTone(status: ReplacementDossier['status']): 'emerald' | 'gold' | 'amber' | 'slate' {
  if (status === 'CONTRACT_FINALIZED') return 'emerald';
  if (status === 'CANDIDATE_SELECTED' || status === 'TRANSFERRED_TO_EMPLOYER') return 'gold';
  if (status === 'SOURCING_CANDIDATES') return 'amber';
  return 'slate';
}

function DossierFacts({ dossier }: { dossier: ReplacementDossier }) {
  return (
    <KeyValues
      items={[
        { label: 'Référence du dossier', value: dossier.id },
        { label: 'Contrat d’origine', value: dossier.originalContractId },
        { label: 'Claim à l’origine', value: dossier.claimId ?? dossier.incidentId },
        { label: 'Offre de reprise publiée', value: dossier.urgentOfferId ?? null },
        { label: 'Candidat retenu', value: dossier.selectedCandidateName ?? null },
        { label: 'Candidature retenue', value: dossier.selectedApplicationId ?? null },
        { label: 'Nouveau contrat', value: dossier.newContractId ?? null },
        { label: 'Ouvert le', value: formatDate(dossier.openedAt ?? dossier.createdAt) },
      ]}
    />
  );
}

/* ───────────────── EMP-56 / EMP-57 · Déclenchement et conditions ───────────────── */

export function Employer56Replacement({ unitId, params, pathname }: EmployerUnitProps) {
  const offerId = params.id ?? '';
  const resource = useEmployerResource<ReplacementContext>(loadReplacementForOffer(offerId), [offerId]);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du dossier de remplacement" rows={4} />;

  const { dossier, contract, all } = resource.data;
  const conditions = pathname.endsWith('/conditions');

  return (
    <>
      <PageHead
        title={conditions ? 'Conditions de reprise' : 'Remplacement'}
        lede={
          dossier
            ? `Dossier ${dossier.id} · ${REPLACEMENT_STATUS_LABELS[dossier.status]}`
            : 'Aucun dossier de remplacement pour cet engagement dans les données réellement lisibles.'
        }
        seal={dossier ? { tone: dossierTone(dossier.status), label: REPLACEMENT_STATUS_LABELS[dossier.status] } : { tone: 'slate', label: 'Aucun dossier' }}
      />

      {contract ? (
        <Panel title="Engagement concerné" zone="hero">
          <KeyValues
            items={[
              { label: 'Contrat', value: contract.id },
              { label: 'Offre', value: contract.offerTitle },
              { label: 'Candidat', value: contract.employeeName },
              { label: 'Statut du contrat', value: contract.status },
              { label: 'Salaire mensuel enregistré', value: formatAmount(contract.monthlySalary, contract.currency) },
            ]}
          />
        </Panel>
      ) : (
        <Panel title="Engagement concerné" zone="hero">
          <EmptyNotice>Aucun contrat lisible pour cette offre : un remplacement ne peut pas exister sans engagement réel.</EmptyNotice>
        </Panel>
      )}

      {dossier ? (
        <Panel title="État du remplacement" zone="list">
          <DossierFacts dossier={dossier} />
        </Panel>
      ) : (
        <Panel title="Déclenchement" zone="list">
          <EmptyNotice>
            Aucun dossier de remplacement n’est ouvert pour cet engagement. Le déclenchement est une décision de modération prise sur un claim (dossier {PRODUCT_LABELS.REPLACEMENT.singular.toLowerCase()}
            {' '}créé côté plateau), jamais une commande employeur : cet écran ne peut donc pas le créer.
          </EmptyNotice>
        </Panel>
      )}

      {conditions ? (
        <Panel title="Conditions opposables" zone="kpi">
          <EmptyNotice>
            Le produit ne stocke aucune « condition de reprise » à accepter ni d’acknowledgment employeur : aucune clause n’est présentée comme opposable. Les seuls états
            opposables sont ceux du dossier ci-dessus et du contrat successeur.
          </EmptyNotice>
        </Panel>
      ) : null}

      <Panel title={PRODUCT_LABELS.REPLACEMENT.plural + ' de ce compte'} zone="table">
        <RecordList
          items={all}
          empty={<EmptyNotice>Aucun dossier de remplacement sur ce compte.</EmptyNotice>}
          render={(entry) => (
            <RecordCard
              title={entry.id}
              seal={{ tone: dossierTone(entry.status), label: REPLACEMENT_STATUS_LABELS[entry.status] }}
              facts={[
                { label: 'Contrat d’origine', value: entry.originalContractId },
                { label: 'Offre de reprise', value: entry.urgentOfferId ?? '—' },
                { label: 'Nouveau contrat', value: entry.newContractId ?? '—' },
              ]}
            />
          )}
        />
      </Panel>

      <ActionRow>
        <Link href={`/client/missions/${offerId}/remplacement/selection`} className="lbm-employer__link">
          Sélection du remplaçant
        </Link>
        <Link href={`/client/contrats/${contract?.id ?? ''}`} className="lbm-employer__link">
          Contrat
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title={`BACKEND_GAP · ${conditions ? 'EMP-57' : 'EMP-56'}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-58 · Sélection du remplaçant ───────────────── */

export function Employer58ReplacementSelection({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const offerId = params.id ?? '';
  const resource = useEmployerResource<ReplacementContext>(loadReplacementForOffer(offerId), [offerId]);
  const action = useEmployerAction<ReplacementDossier>();
  const [draft, setDraft] = useState<Partial<EmployerOfferDraft>>({ contractType: 'Prestation', currency: 'FCFA', isUrgent: true });

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la sélection" rows={4} />;

  const dossier = resource.data.dossier;
  const canPublish = Boolean(dossier && dossier.status === 'PENDING_OFFER' && !dossier.urgentOfferId);
  const payload: EmployerOfferDraft | null =
    draft.title && draft.contractType && draft.location && typeof draft.remuneration === 'number' && draft.remuneration > 0
      ? {
          title: draft.title,
          contractType: draft.contractType,
          remuneration: draft.remuneration,
          currency: draft.currency ?? 'FCFA',
          location: draft.location,
          summary: draft.summary ?? '',
          skills: [],
          conditions: [],
          responsibilities: [],
          selectionProcess: [],
          isUrgent: true,
        }
      : null;

  return (
    <>
      <PageHead
        title="Sélection du remplaçant"
        lede="Le vivier dédié au remplacement n’existe pas : l’offre de reprise est publiée puis suit le parcours réel offre → candidature → proposition → contrat."
        seal={{ tone: dossier ? dossierTone(dossier.status) : 'slate', label: dossier ? REPLACEMENT_STATUS_LABELS[dossier.status] : 'Aucun dossier' }}
      />

      <Panel title="Cadre de la recherche (données réelles)" zone="kpi">
        {dossier ? (
          <DossierFacts dossier={dossier} />
        ) : (
          <EmptyNotice>Aucun dossier de remplacement à sélectionner pour cet engagement.</EmptyNotice>
        )}
      </Panel>

      <Panel title="Vivier & score de reprise" zone="ring">
        <EmptyNotice>
          Aucun score de reprise, aucun classement dédié et aucune liste de candidats prioritaires ne sont produits par le moteur existant. Cet écran n’affiche donc aucun
          candidat : il propose uniquement la publication réelle de l’offre de reprise.
        </EmptyNotice>
      </Panel>

      {canPublish ? (
        <Panel title="Publier l’offre de reprise" zone="form">
          <label className="lbm-employer__field">
            <span>Titre de l’offre de reprise</span>
            <input value={draft.title ?? ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="lbm-employer__field">
            <span>Type de contrat</span>
            <input value={draft.contractType ?? ''} onChange={(event) => setDraft({ ...draft, contractType: event.target.value })} />
          </label>
          <label className="lbm-employer__field">
            <span>Lieu</span>
            <input value={draft.location ?? ''} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
          </label>
          <label className="lbm-employer__field">
            <span>Rémunération</span>
            <input
              type="number"
              min={1}
              value={draft.remuneration ?? ''}
              onChange={(event) => setDraft({ ...draft, remuneration: event.target.value ? Number(event.target.value) : undefined })}
            />
          </label>
          <label className="lbm-employer__field">
            <span>Résumé</span>
            <textarea rows={3} value={draft.summary ?? ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
          </label>
          <p className="lbm-caption lbm-muted">
            La commande réelle est POST /replacements/:replacementId/offer. Le type de contrat et la rémunération sont saisis tels quels : aucun montant n’est calculé ici.
          </p>
        </Panel>
      ) : null}

      <ActionRow>
        {api && dossier && payload && canPublish ? (
          <NeoPressButton variant="primary" loading={action.busy} onClick={() => action.run((signal) => api.publishReplacementOffer(dossier.id, payload, signal)).then(() => resource.reload())}>
            Publier l’offre de reprise
          </NeoPressButton>
        ) : null}
        {dossier?.urgentOfferId ? (
          <Link href={`/client/missions/${dossier.urgentOfferId}/candidatures`} className="lbm-employer__link">
            Candidatures de l’offre de reprise
          </Link>
        ) : null}
        <Link href={`/client/missions/${offerId}/remplacement`} className="lbm-employer__link">
          Dossier de remplacement
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title="BACKEND_GAP · EMP-58" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-59 · Confirmation de bascule ───────────────── */

export function Employer59ReplacementConfirmation({ unitId, params, pathname }: EmployerUnitProps) {
  const offerId = params.id ?? '';
  const resource = useEmployerResource<ReplacementContext>(loadReplacementForOffer(offerId), [offerId]);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la bascule" rows={4} />;

  const { dossier, contract } = resource.data;

  return (
    <>
      <PageHead
        title="Confirmation de bascule"
        lede="La bascule est constatée sur les états réels du dossier et du contrat successeur : elle n’est pas déclenchée ici."
        seal={dossier ? { tone: dossierTone(dossier.status), label: REPLACEMENT_STATUS_LABELS[dossier.status] } : { tone: 'slate', label: 'Aucun dossier' }}
      />

      {dossier ? (
        <>
          <Panel title="Sceau d’état" zone="verdict">
            <StatusSeal tone={dossierTone(dossier.status)} label={REPLACEMENT_STATUS_LABELS[dossier.status]} />
            <DossierFacts dossier={dossier} />
          </Panel>

          <Panel title="Récapitulatif de transition" zone="table">
            <KeyValues
              items={[
                { label: 'Engagement d’origine', value: contract ? `${contract.id} · ${contract.offerTitle}` : dossier.originalContractId },
                { label: 'Offre de reprise', value: dossier.urgentOfferId ?? null },
                { label: 'Candidature retenue', value: dossier.selectedApplicationId ?? null },
                { label: 'Proposition retenue', value: dossier.selectedProposalId ?? null },
                { label: 'Contrat successeur', value: dossier.newContractId ?? null },
              ]}
            />
          </Panel>

          <Panel title="Étapes restantes" zone="timeline">
            <EmptyNotice>
              Aucun plan d’étapes n’est publié par le produit : la suite réelle est lisible dans le contrat successeur (signature des deux parties puis activation). Aucune
              échéance n’est promise ici.
            </EmptyNotice>
          </Panel>
        </>
      ) : (
        <Panel title="Aucune bascule" zone="list">
          <EmptyNotice>Aucun dossier de remplacement lisible pour cet engagement : il n’y a rien à confirmer.</EmptyNotice>
        </Panel>
      )}

      <ActionRow>
        {dossier?.newContractId ? (
          <Link href={`/client/contrats/${dossier.newContractId}/successeur`} className="lbm-employer__link">
            Contrat successeur
          </Link>
        ) : null}
        <Link href={`/client/missions/${offerId}/remplacement/selection`} className="lbm-employer__link">
          Sélection
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-59" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}
