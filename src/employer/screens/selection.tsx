/**
 * EMP-16 → EMP-22 — Candidatures, dossier candidat, matching et sélection.
 *
 * Routes réelles utilisées : GET /offers/:offerId/applications,
 * POST /applications/:applicationId/examine|shortlist|reject,
 * POST /offers/:offerId/matching-runs, GET /matching-runs/:runId,
 * GET /offers/:offerId/qualification.
 * L'émission d'une proposition n'est pas câblée : aucune route de conversation
 * n'est installée, donc aucun identifiant de conversation n'est découvrable.
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
  Zone,
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerAction, useEmployerApi, useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Application } from '../../types';
import type { MatchingRunRecord } from '../api';
import type { EmployerUnitProps } from '../types';
import { APPLICATION_STATUS_LABELS, PRODUCT_LABELS, formatAmount, formatDate, formatDateTime } from '../vocabulary';

const APPLICATION_TONE: Record<Application['status'], 'gold' | 'emerald' | 'amber' | 'clay' | 'slate'> = {
  PENDING: 'amber',
  REVIEW: 'gold',
  SHORTLISTED: 'emerald',
  REJECTED: 'clay',
  WITHDRAWN: 'slate',
  HIRED: 'emerald',
  CONTRACTED: 'emerald',
  CLOSED_OFFER_FILLED: 'slate',
};

function applicationFacts(application: Application) {
  return [
    { label: 'Candidat', value: application.candidateName },
    { label: 'Reçue le', value: formatDate(application.appliedDate) ?? '—' },
    { label: 'Rémunération demandée', value: typeof application.remuneration === 'number' ? formatAmount(application.remuneration, 'FCFA') : null },
  ].filter((fact): fact is { label: string; value: string } => fact.value !== null);
}

/* ─────────────── EMP-16 / EMP-20 · File de candidatures et filtres ─────────────── */

export function Employer16Applications({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const offerId = params.id ?? '';
  const filtersOnly = pathname.endsWith('/filtres');
  const [segment, setSegment] = useState('ALL');
  const [minimum, setMinimum] = useState('');
  const [query, setQuery] = useState('');
  const resource = useEmployerResource<Application[]>(
    async (employerApi, signal) => (await employerApi.offerApplications(offerId, { limit: 100, signal })).items,
    [offerId],
  );
  const action = useEmployerAction<Application>();
  const gaps = employerGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label={`Chargement des ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}`} rows={5} />;

  const applications = resource.data;
  const threshold = minimum ? Number(minimum) : null;
  const visible = applications
    .filter((application) => segment === 'ALL' || application.status === segment)
    .filter((application) => (query ? application.candidateName.toLowerCase().includes(query.toLowerCase()) : true))
    .filter((application) =>
      threshold === null || typeof application.remuneration !== 'number' ? true : application.remuneration >= threshold,
    );

  return (
    <>
      <PageHead
        title={filtersOnly ? 'Filtres de candidatures' : PRODUCT_LABELS.APPLICATION.plural}
        lede={`${applications.length} candidatures chargées pour cette offre · tri et segments appliqués localement sur des valeurs réelles`}
        seal={{ tone: 'gold', label: 'File employeur' }}
      />
      <FilterChips
        label="Segments"
        options={[
          { id: 'ALL', label: 'Toutes' },
          { id: 'PENDING', label: APPLICATION_STATUS_LABELS.PENDING },
          { id: 'REVIEW', label: APPLICATION_STATUS_LABELS.REVIEW },
          { id: 'SHORTLISTED', label: APPLICATION_STATUS_LABELS.SHORTLISTED },
          { id: 'REJECTED', label: APPLICATION_STATUS_LABELS.REJECTED },
        ]}
        value={segment}
        onChange={setSegment}
      />
      <Zone kind="form" label="Filtres locaux">
        <label className="lbm-employer__field">
          <span>Nom du candidat</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="lbm-employer__field">
          <span>Rémunération minimale demandée</span>
          <input type="number" min={0} value={minimum} onChange={(event) => setMinimum(event.target.value)} />
        </label>
      </Zone>

      <Panel title="Candidatures">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Aucune candidature ne correspond à ces filtres.</EmptyNotice>}
          render={(application) => (
            <RecordCard
              title={application.candidateName}
              href={`/client/candidats/${application.candidateId}`}
              seal={{ tone: APPLICATION_TONE[application.status], label: APPLICATION_STATUS_LABELS[application.status] }}
              facts={applicationFacts(application)}
            >
              <p className="lbm-body">{application.candidateHeadline}</p>
              {application.note ? <p className="lbm-caption lbm-muted">{application.note}</p> : null}
              <div className="lbm-employer__inline-actions">
                {api
                  ? (
                      [
                        { action: 'examine' as const, label: 'Examiner', variant: 'ghost' as const },
                        { action: 'shortlist' as const, label: 'Présélectionner', variant: 'primary' as const },
                        { action: 'reject' as const, label: 'Écarter', variant: 'text' as const },
                      ]
                    ).map((entry) => (
                      <NeoPressButton
                        key={entry.action}
                        variant={entry.variant}
                        loading={action.busy}
                        onClick={() =>
                          action
                            .run((signal) => api.applicationAction(application.id, entry.action, entry.action === 'reject' ? 'Écartée depuis la file employeur.' : undefined, signal))
                            .then(() => resource.reload())
                        }
                      >
                        {entry.label}
                      </NeoPressButton>
                    ))
                  : null}
              </div>
            </RecordCard>
          )}
        />
      </Panel>

      <ActionRow>
        <Link href={`/client/missions/${offerId}`} className="lbm-employer__link">
          Fiche de l'offre
        </Link>
        <Link href={`/client/missions/${offerId}/filtres`} className="lbm-employer__link">
          Filtres
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}

      <GapNotice title="BACKEND_GAP · EMP-16 / EMP-20" items={gaps} />
    </>
  );
}

/* ───────────────── EMP-17 · Dossier candidat (vue employeur) ───────────────── */

export function Employer17Candidate({ unitId, params, pathname }: EmployerUnitProps) {
  const candidateId = params.id ?? '';
  const [selectedOffer, setSelectedOffer] = useState<string>('');
  const resource = useEmployerResource(
    async (api, signal) => {
      const offers = (await api.myOffers({ limit: 25, signal })).items;
      const searched = offers.slice(0, 5);
      const found: { offerTitle: string; offerId: string; application: Application }[] = [];
      for (const offer of searched) {
        const applications = (await api.offerApplications(offer.id, { limit: 100, signal })).items;
        const application = applications.find((item) => item.candidateId === candidateId);
        if (application) found.push({ offerTitle: offer.title, offerId: offer.id, application });
      }
      return { offers, searched, found };
    },
    [candidateId],
  );
  const gaps = employerGapsFor(unitId, pathname);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Recherche du dossier candidat" rows={4} />;

  const selected = resource.data.found.find((entry) => entry.offerId === selectedOffer) ?? resource.data.found[0] ?? null;

  return (
    <>
      <PageHead
        title={selected ? selected.application.candidateName : 'Dossier candidat'}
        lede={`Recherche réelle limitée aux ${resource.data.searched.length} offres les plus récentes de ce compte.`}
        seal={selected ? { tone: APPLICATION_TONE[selected.application.status], label: APPLICATION_STATUS_LABELS[selected.application.status] } : { tone: 'slate', label: 'Sans candidature' }}
      />

      {resource.data.found.length === 0 ? (
        <EmptyNotice>
          Aucune candidature de ce candidat n'est visible dans les offres chargées. Aucun profil n'est reconstitué à partir d'autre chose que ces candidatures réelles.
        </EmptyNotice>
      ) : (
        <>
          {resource.data.found.length > 1 ? (
            <FilterChips
              label="Offre concernée"
              options={resource.data.found.map((entry) => ({ id: entry.offerId, label: entry.offerTitle }))}
              value={selected?.offerId ?? ''}
              onChange={setSelectedOffer}
            />
          ) : null}
          {selected ? (
            <>
              <Panel title="Candidature réelle" zone="hero">
                <KeyValues
                  items={[
                    { label: 'Métier déclaré', value: selected.application.candidateHeadline },
                    { label: 'Reçue le', value: formatDate(selected.application.appliedDate) },
                    { label: 'Offre', value: selected.offerTitle },
                    { label: 'Note du candidat', value: selected.application.note ?? null },
                    { label: 'Contrat lié', value: selected.application.contractId ?? null },
                  ]}
                />
              </Panel>
              <Panel title="Historique réel de la candidature" zone="list">
                <RecordList
                  items={selected.application.history}
                  empty={<EmptyNotice>Aucun évènement enregistré.</EmptyNotice>}
                  render={(entry) => (
                    <RecordCard
                      title={entry.action}
                      facts={[
                        { label: 'Horodaté', value: formatDateTime(entry.timestamp) ?? '—' },
                        { label: 'Acteur', value: entry.actor },
                      ]}
                    />
                  )}
                />
              </Panel>
            </>
          ) : null}
        </>
      )}

      <ActionRow>
        <Link href={`/client/missions/${selected?.offerId ?? ''}/candidatures`} className="lbm-employer__link">
          Candidatures de l'offre
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · EMP-17" items={gaps} />
    </>
  );
}

/* ─────────── EMP-18 / EMP-19 · Matching (classement et explication) ─────────── */

export function Employer18Matching({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const offerId = params.id ?? '';
  const explanation = pathname.endsWith('/explication');
  const resource = useEmployerResource(
    async (employerApi, signal) => {
      const offers = (await employerApi.myOffers({ limit: 50, signal })).items;
      const qualification = await employerApi.qualification(offerId, signal).catch(() => null);
      const runId = sessionStorage.getItem(`lbm-employer-run-${offerId}`);
      const run = runId ? await employerApi.matchingRun(runId, signal).catch(() => null) : null;
      return { offers, offer: offers.find((offer) => offer.id === offerId) ?? null, qualification, run };
    },
    [offerId],
  );
  const action = useEmployerAction<MatchingRunRecord>();
  const gaps = employerGapsFor(unitId, pathname);
  const explanationGaps = employerGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du matching" rows={4} />;

  const run = action.result ?? resource.data.run;
  const criteria = run?.criteria;

  const launch = () => {
    if (!api) return;
    void action.run((signal) => api.createMatchingRun(offerId, {}, signal)).then((created) => {
      if (created) {
        sessionStorage.setItem(`lbm-employer-run-${offerId}`, created.runId);
        resource.reload();
      }
    });
  };

  return (
    <>
      <PageHead
        title={explanation ? 'Explication du classement' : 'Matching'}
        lede="Résultats réellement persistés par le moteur de matching : compétences, zone administrative, disponibilité déclarée."
        seal={{ tone: run ? 'emerald' : 'slate', label: run ? `Run ${run.rulesVersion}` : 'Aucun run' }}
      />

      {resource.data.qualification ? (
        <Panel title="Qualification de l'offre" zone="verdict">
          <KeyValues
            items={[
              { label: 'Décision', value: resource.data.qualification.decision },
              { label: 'Version des règles (qualification)', value: resource.data.qualification.ruleVersion },
              { label: 'Évaluée le', value: formatDateTime(resource.data.qualification.evaluatedAt) },
            ]}
          />
        </Panel>
      ) : (
        <EmptyNotice>La qualification est obligatoire avant tout classement : aucune offre non qualifiée ne produit de résultats.</EmptyNotice>
      )}

      {criteria ? (
        <Panel title="Critères réellement appliqués" zone="table">
          <RecordList
            items={criteria.factors}
            render={(factor) => (
              <RecordCard
                title={factor.code}
                facts={[
                  { label: 'Poids', value: String(factor.weight) },
                  { label: 'Source', value: factor.source },
                  { label: 'Utilisé', value: factor.used ? 'Oui' : 'Non' },
                ]}
              />
            )}
          />
          <p className="lbm-caption lbm-muted">{`Version ${criteria.version} · égalité tranchée par ${criteria.tieBreak} · décision finale : employeur`}</p>
        </Panel>
      ) : null}

      {run ? (
        <Panel title={explanation ? 'Décomposition par candidat' : 'Classement'}>
          <RecordList
            items={run.results}
            empty={<EmptyNotice>Aucun candidat évalué par ce run.</EmptyNotice>}
            render={(result) => (
              <RecordCard
                title={`${result.position}. ${result.displayName}`}
                seal={{ tone: result.position === 1 ? 'gold' : 'slate', label: `${result.score}/${result.scoreMaximum}` }}
                facts={[
                  { label: 'Compétences', value: `${result.breakdown.skills.points}/${result.breakdown.skills.maximum}` },
                  { label: 'Zone', value: `${result.breakdown.location.points}/${result.breakdown.location.maximum} (${result.breakdown.location.match})` },
                  { label: 'Disponibilité', value: `${result.breakdown.availability.points}/${result.breakdown.availability.maximum} (${result.breakdown.availability.declared})` },
                  ...(explanation ? result.breakdown.skills.matchedSkills.map((skill) => ({ label: 'Compétence en commun', value: skill })) : []),
                ]}
              />
            )}
          />
        </Panel>
      ) : (
        <EmptyNotice>Aucun run de matching chargé pour cette offre.</EmptyNotice>
      )}

      <ActionRow>
        {api ? (
          <NeoPressButton variant="primary" loading={action.busy} onClick={launch}>
            Lancer le matching
          </NeoPressButton>
        ) : null}
        <Link href={`/client/missions/${offerId}/matching/explication`} className="lbm-employer__link">
          Explication
        </Link>
        <Link href={`/client/missions/${offerId}/candidatures`} className="lbm-employer__link">
          Candidatures
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}

      <GapNotice title="BACKEND_GAP · EMP-18" items={gaps} />
      {explanation ? <GapNotice title="BACKEND_GAP · EMP-19" items={explanationGaps} /> : null}
    </>
  );
}

/* ─────────── EMP-21 / EMP-22 · Sélection et proposition ─────────── */

export function Employer21Selection({ unitId, params, pathname }: EmployerUnitProps) {
  const unitKey = pathname.endsWith('/confirmee') ? 'EMP-22' : unitId;
  const api = useEmployerApi();
  const offerId = params.id ?? '';
  const resource = useEmployerResource<Application[]>(
    async (employerApi, signal) => (await employerApi.offerApplications(offerId, { limit: 100, signal })).items.filter((application) => application.status === 'SHORTLISTED'),
    [offerId],
  );
  const action = useEmployerAction<Application>();
  const gaps = employerGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la sélection" rows={4} />;

  return (
    <>
      <PageHead
        title={pathname.endsWith('/confirmee') ? 'Sélection confirmée' : 'Sélection'}
        lede="Candidatures réellement présélectionnées pour cette offre."
        seal={{ tone: resource.data.length > 0 ? 'emerald' : 'slate', label: `${resource.data.length} présélectionnée(s)` }}
      />
      <Panel title="Présélection">
        <RecordList
          items={resource.data}
          empty={<EmptyNotice>Aucune candidature présélectionnée. La présélection est une action réelle de la file de candidatures.</EmptyNotice>}
          render={(application) => (
            <RecordCard
              title={application.candidateName}
              href={`/client/candidats/${application.candidateId}`}
              seal={{ tone: 'emerald', label: APPLICATION_STATUS_LABELS.SHORTLISTED }}
              facts={applicationFacts(application)}
            >
              <p className="lbm-body">{application.candidateHeadline}</p>
              <div className="lbm-employer__inline-actions">
                <Link href={`/client/missions/${offerId}/selection/confirmee`} className="lbm-employer__link">
                  Confirmer la sélection
                </Link>
                {api ? (
                  <NeoPressButton
                    variant="text"
                    loading={action.busy}
                    onClick={() => action.run((signal) => api.applicationAction(application.id, 'reject', 'Écartée après sélection.', signal)).then(() => resource.reload())}
                  >
                    Écarter
                  </NeoPressButton>
                ) : null}
              </div>
            </RecordCard>
          )}
        />
      </Panel>
      <ActionRow>
        <Link href={`/client/missions/${offerId}/candidatures`} className="lbm-employer__link">
          Toute la file
        </Link>
        <Link href={`/client/missions/${offerId}/matching`} className="lbm-employer__link">
          Matching
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title={`BACKEND_GAP · ${unitKey}`} items={gaps} />
    </>
  );
}
