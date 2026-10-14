/**
 * PRE-40 → PRE-44 — Remplacement : notification & droits, transition,
 * décision candidat, sortie, reprise (vue entrant).
 *
 * Données réelles : GET /my/replacements, GET /replacements/:replacementId.
 * Le workflow de remplacement existant est consommé tel quel : aucune
 * décision, contestation, acceptation, passation ou sortie n’est ouverte au
 * candidat dans l’API (BACKEND_GAP). Le chemin RÉEL du candidat entrant est la
 * chaîne normale offre → candidature → proposition → contrat.
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
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract, ReplacementDossier } from '../../types';
import type { PrestataireApi } from '../api';
import type { PrestataireUnitProps } from '../types';
import { PRODUCT_LABELS, REPLACEMENT_STATUS_LABELS, formatDate } from '../vocabulary';

function replacementTone(status: ReplacementDossier['status']): 'emerald' | 'amber' | 'slate' | 'gold' {
  if (status === 'CONTRACT_FINALIZED') return 'emerald';
  if (status === 'CANDIDATE_SELECTED') return 'gold';
  if (status === 'PENDING_OFFER') return 'slate';
  return 'amber';
}

function ReplacementCard({ dossier }: { dossier: ReplacementDossier }) {
  return (
    <RecordCard
      title={`${dossier.employerName} · contrat ${dossier.originalContractId}`}
      href={`/prestataire/remplacements/${dossier.id}/transition`}
      seal={{ tone: replacementTone(dossier.status), label: REPLACEMENT_STATUS_LABELS[dossier.status] }}
      facts={[
        { label: 'Ouvert le', value: formatDate(dossier.openedAt ?? dossier.createdAt) ?? '—' },
        { label: 'Candidat retenu', value: dossier.selectedCandidateName ?? '—' },
        { label: 'Offre de reprise', value: dossier.urgentOfferTitle ?? dossier.urgentOfferId ?? '—' },
      ]}
    />
  );
}

interface ReplacementContext {
  dossiers: ReplacementDossier[];
  contracts: Contract[];
}

async function loadContext(api: PrestataireApi, signal: AbortSignal): Promise<ReplacementContext> {
  const [dossiers, contracts] = await Promise.all([
    api.myReplacements({ limit: 50, signal }),
    api.myContracts({ limit: 100, signal }),
  ]);
  return { dossiers: dossiers.items, contracts: contracts.items };
}

/* ───────────────── PRE-40 · Notification & droits ───────────────── */

export function Prestataire40Replacement({ unitId, params, pathname }: PrestataireUnitProps) {
  const offerId = params.id;
  const resource = usePrestataireResource(loadContext, []);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des remplacements" rows={4} />;

  const { dossiers, contracts } = resource.data;
  const contract = contracts.find((entry) => entry.offerId === offerId) ?? null;
  const related = contract ? dossiers.filter((dossier) => dossier.originalContractId === contract.id) : [];
  const dossier = related[0] ?? dossiers.find((entry) => entry.urgentOfferId === offerId) ?? null;

  return (
    <>
      <PageHead
        title="Remplacement"
        lede={dossier
          ? `Dossier réel de remplacement pour le contrat ${dossier.originalContractId}. Les droits du candidat (contestation, acceptation) ne sont pas ouverts dans l’API : ils sont déclarés comme capacités absentes.`
          : `Aucun dossier de remplacement réel ne correspond à l’offre ${offerId}. Les dossiers réels du candidat sont listés ci-dessous.`}
        seal={{ tone: dossier ? replacementTone(dossier.status) : 'slate', label: dossier ? REPLACEMENT_STATUS_LABELS[dossier.status] : 'Aucun dossier' }}
      />

      {dossier ? (
        <Panel title="Dossier réel" zone="list">
          <KeyValues
            items={[
              { label: 'Dossier', value: dossier.id },
              { label: 'Contrat d’origine', value: dossier.originalContractId },
              { label: 'Employeur', value: dossier.employerName },
              { label: 'Statut', value: REPLACEMENT_STATUS_LABELS[dossier.status] },
              { label: 'Offre de reprise publiée', value: dossier.urgentOfferId ?? 'Non publiée' },
              { label: 'Candidat retenu', value: dossier.selectedCandidateName ?? '—' },
              { label: 'Contrat finalisé', value: dossier.newContractId ?? '—' },
            ]}
          />
        </Panel>
      ) : null}

      <Panel title={`Tous mes ${PRODUCT_LABELS.REPLACEMENT.plural.toLowerCase()}`} zone="list">
        <RecordList
          items={dossiers}
          empty={<EmptyNotice>Aucun dossier de remplacement vous concernant.</EmptyNotice>}
          render={(entry) => <ReplacementCard dossier={entry} />}
        />
      </Panel>

      <ActionRow>
        {dossier?.urgentOfferId ? (
          <Link href={`/prestataire/missions/${dossier.urgentOfferId}`} className="lbm-candidat__link">
            Voir l’offre de reprise
          </Link>
        ) : null}
        <Link href="/prestataire" className="lbm-candidat__link">
          Retour à l’accueil
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-40" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-41 / PRE-43 / PRE-44 · Transition, sortie, reprise ───────────────── */

export function Prestataire41ReplacementTransition({ unitId, params, pathname }: PrestataireUnitProps) {
  // Deux motifs réels : /prestataire/missions/:id/remplacement/conditions (PRE-41,
  // `:id` = offre) et /prestataire/remplacements/:id/{transition,reprise}
  // (PRE-43/44, `:id` = dossier).
  const byOffer = pathname.includes('/missions/');
  const replacementId = params.id;
  const reprise = pathname.endsWith('/reprise');
  const context = usePrestataireResource(loadContext, []);
  const direct = usePrestataireResource<ReplacementDossier | null>(
    async (api, signal) => (byOffer ? null : api.replacement(replacementId, signal)),
    [byOffer, replacementId],
  );
  const dossier = byOffer ? null : direct.data;
  const offer = usePrestataireResource(async (api, signal) => {
    if (byOffer || !dossier?.urgentOfferId) return null;
    return api.offer(dossier.urgentOfferId, signal);
  }, [byOffer, dossier?.urgentOfferId]);

  if (byOffer) {
    if (context.status === 'error') return <SystemFeedback {...context.error!} retry={context.reload} />;
    if (context.status === 'loading' || !context.data) return <LoadingBlock label="Chargement du dossier" rows={4} />;
    const contract = context.data.contracts.find((entry) => entry.offerId === replacementId) ?? null;
    const dossier = contract
      ? context.data.dossiers.find((entry) => entry.originalContractId === contract.id) ?? null
      : context.data.dossiers.find((entry) => entry.urgentOfferId === replacementId) ?? null;
    return (
      <>
        <PageHead
          title="Conditions de transition"
          lede={dossier
            ? `Dossier réel de remplacement pour l’offre ${replacementId}. Les conditions de passation ne sont pas opposables dans l’API : elles sont déclarées comme capacités absentes.`
            : `Aucun dossier de remplacement réel ne correspond à l’offre ${replacementId}.`}
          seal={{ tone: dossier ? replacementTone(dossier.status) : 'slate', label: dossier ? REPLACEMENT_STATUS_LABELS[dossier.status] : 'Aucun dossier' }}
        />
        {dossier ? (
          <Panel title="Dossier réel" zone="list">
            <KeyValues
              items={[
                { label: 'Dossier', value: dossier.id },
                { label: 'Contrat d’origine', value: dossier.originalContractId },
                { label: 'Statut', value: REPLACEMENT_STATUS_LABELS[dossier.status] },
                { label: 'Offre de reprise publiée', value: dossier.urgentOfferId ?? 'Non publiée' },
              ]}
            />
          </Panel>
        ) : null}
        <Panel title="Passation réelle" zone="notice" tone="notice">
          {`Aucune condition de reprise, accusé de passation ni checklist de sortie n’est exposé au candidat. Le dossier réel ci-dessus est la seule donnée lisible ; le candidat entrant passe par la candidature sur l’offre de reprise.`}
        </Panel>
        <ActionRow>
          <Link href={`/prestataire/missions/${replacementId}/remplacement`} className="lbm-candidat__link">
            Notification & droits
          </Link>
          {dossier ? (
            <Link href={`/prestataire/remplacements/${dossier.id}/transition`} className="lbm-candidat__link">
              Voir le dossier
            </Link>
          ) : null}
          <RetryButton onClick={context.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-41" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (direct.status === 'error') return <SystemFeedback {...direct.error!} retry={direct.reload} />;
  if (direct.status === 'loading') return <LoadingBlock label="Chargement du dossier" rows={4} />;

  if (!dossier) {
    return (
      <>
        <PageHead title="Dossier introuvable" lede={`Le dossier ${replacementId} n’est pas lisible (état réel du serveur).`} seal={{ tone: 'clay', label: 'Introuvable' }} />
        <ActionRow>
          <Link href="/prestataire" className="lbm-candidat__link">
            Retour à l’accueil
          </Link>
        </ActionRow>
      </>
    );
  }

  if (reprise) {
    return (
      <>
        <PageHead
          title="Reprendre un travail"
          lede="Vue du candidat entrant. Le produit n’ouvre aucune acceptation directe de reprise : le chemin réel est la candidature sur l’offre de reprise publiée par l’employeur, puis la proposition, puis le contrat."
          seal={{ tone: replacementTone(dossier.status), label: REPLACEMENT_STATUS_LABELS[dossier.status] }}
        />
        <Panel title="Dossier réel" zone="list">
          <KeyValues
            items={[
              { label: 'Dossier', value: dossier.id },
              { label: 'Contrat d’origine', value: dossier.originalContractId },
              { label: 'Employeur', value: dossier.employerName },
              { label: 'Statut', value: REPLACEMENT_STATUS_LABELS[dossier.status] },
            ]}
          />
        </Panel>
        {offer.data ? (
          <Panel title="Offre de reprise (réelle, publique)" zone="list">
            <KeyValues
              items={[
                { label: 'Offre', value: offer.data.title },
                { label: 'Rémunération', value: `${offer.data.remuneration} ${offer.data.currency}` },
                { label: 'Lieu', value: offer.data.locationLabel ?? offer.data.location },
              ]}
            />
          </Panel>
        ) : (
          <Panel title="Offre de reprise" zone="notice" tone="notice">
            {dossier.urgentOfferId
              ? `L’offre ${dossier.urgentOfferId} n’est pas lisible (état réel du serveur).`
              : 'Aucune offre de reprise n’est publiée pour ce dossier à ce stade.'}
          </Panel>
        )}
        <ActionRow>
          {offer.data?.status === 'ACTIVE' ? (
            <Link href={`/prestataire/missions/${offer.data.id}/postuler`} className="lbm-candidat__link">
              Postuler à l’offre de reprise
            </Link>
          ) : null}
          <Link href="/prestataire/missions" className="lbm-candidat__link">
            Marché des {PRODUCT_LABELS.OFFER.plural.toLowerCase()}
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-44" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Transition & sortie"
        lede="La passation et la sortie d’un remplacement ne sont pas ouvertes au candidat dans l’API (aucune route de handover, de checklist de sortie ni de décompte final). Le dossier réel est affiché ; le paiement du travail validé suit les règles normales de salaire."
        seal={{ tone: replacementTone(dossier.status), label: REPLACEMENT_STATUS_LABELS[dossier.status] }}
      />
      <Panel title="Dossier réel" zone="list">
        <KeyValues
          items={[
            { label: 'Dossier', value: dossier.id },
            { label: 'Contrat d’origine', value: dossier.originalContractId },
            { label: 'Employeur', value: dossier.employerName },
            { label: 'Statut', value: REPLACEMENT_STATUS_LABELS[dossier.status] },
            { label: 'Candidat retenu', value: dossier.selectedCandidateName ?? '—' },
            { label: 'Contrat finalisé', value: dossier.newContractId ?? '—' },
            { label: 'Mis à jour le', value: formatDate(dossier.updatedAt) ?? '—' },
          ]}
        />
      </Panel>
      <Panel title="Vos droits réels" zone="notice" tone="notice">
        {`Refuser une reprise n’a aucune conséquence de réputation (c’est la candidature sur l’offre qui décide). Le travail validé reste dû : en cas de désaccord, le canal réel est un claim. Aucune passation ni checklist de sortie n’est simulée.`}
      </Panel>
      <ActionRow>
        <Link href={`/prestataire/remplacements/${dossier.id}/reprise`} className="lbm-candidat__link">
          Vue reprise (entrant)
        </Link>
        <Link href={`/prestataire/remplacements/${dossier.id}/decision`} className="lbm-candidat__link">
          Ma décision
        </Link>
        <Link href="/prestataire/salaire" className="lbm-candidat__link">
          Mon {PRODUCT_LABELS.SALARY.singular.toLowerCase()}
        </Link>
        <RetryButton onClick={direct.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · PRE-43" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-42 · Décision candidat ───────────────── */

export function Prestataire42ReplacementDecision({ unitId, params, pathname }: PrestataireUnitProps) {
  const replacementId = params.id;
  const resource = usePrestataireResource<ReplacementDossier | null>(async (api, signal) => api.replacement(replacementId, signal), [replacementId]);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du dossier" rows={3} />;

  return (
    <>
      <PageHead
        title="Ma décision sur le remplacement"
        lede="Aucune décision candidat (accepter, contester, médiation) n’est ouverte dans l’API sur un dossier de remplacement. Aucune voie n’est simulée."
        seal={{ tone: 'clay', label: 'Indisponible' }}
      />
      {resource.data ? (
        <Panel title="Dossier réel" zone="list">
          <KeyValues
            items={[
              { label: 'Dossier', value: resource.data.id },
              { label: 'Statut', value: REPLACEMENT_STATUS_LABELS[resource.data.status] },
              { label: 'Employeur', value: resource.data.employerName },
            ]}
          />
        </Panel>
      ) : null}
      <Panel title="Mécanismes existants" zone="notice" tone="notice">
        {`Le candidat entrant passe par la candidature sur l’offre de reprise (chaîne normale). En cas de désaccord sur un contrat en cours, le canal réel est un claim (SALARY_NOT_RECEIVED, PAYMENT_DISPUTE, CONTRACT_INCIDENT). Le dossier de remplacement lui-même est arbitré par la modération.`}
      </Panel>
      <ActionRow>
        <Link href={`/prestataire/remplacements/${replacementId}/transition`} className="lbm-candidat__link">
          Retour au dossier
        </Link>
        <Link href="/prestataire/salaire/retard" className="lbm-candidat__link">
          Ouvrir un {PRODUCT_LABELS.CLAIM.singular.toLowerCase()}
        </Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · PRE-42" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
