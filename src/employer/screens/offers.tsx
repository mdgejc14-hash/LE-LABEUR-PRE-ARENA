/**
 * EMP-05 → EMP-15 — Registre des offres, création, qualification, prix,
 * aperçu/publication, fiche et édition.
 *
 * Le registre, la création et le changement de statut sont des routes RÉELLES
 * (`GET /my/offers`, `POST /offers`, `PATCH /offers/:offerId/status`). La
 * qualification et le matching utilisent les routes installées. Tout le reste
 * est déclaré absent (BACKEND_GAP) : aucune donnée n'est inventée.
 */

import { useEffect, useState } from 'react';
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
  StatusSeal,
  Zone,
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerAction, useEmployerApi, useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Offer } from '../../types';
import type { EmployerApi, MissionQualificationAnswers, MissionQualificationRecord } from '../api';
import type { EmployerUnitProps } from '../types';
import { PRODUCT_LABELS, formatAmount, formatDate, formatDateTime, offerStatusLabel } from '../vocabulary';
import { navigate } from '../../routing/navigation';
import {
  EMPTY_OFFER_DRAFT,
  clearOfferDraft,
  offerDraftComplete,
  parseList,
  readOfferDraft,
  subscribeOfferDraft,
  toOfferDraft,
  updateOfferDraft,
  type OfferDraft,
} from '../draft';

const OFFER_TONE: Record<Offer['status'], 'emerald' | 'amber' | 'slate' | 'gold'> = {
  ACTIVE: 'emerald',
  PAUSED: 'amber',
  FILLED: 'gold',
  CANCELLED: 'slate',
};

const DECISION_LABEL: Record<string, string> = {
  ELIGIBLE_FOR_INDEPENDENT: 'Éligible',
  HUMAN_REVIEW_REQUIRED: 'Revue humaine requise',
  BLOCKED: 'Bloqué',
};

const DECISION_TONE: Record<string, 'emerald' | 'amber' | 'clay' | 'slate'> = {
  ELIGIBLE_FOR_INDEPENDENT: 'emerald',
  HUMAN_REVIEW_REQUIRED: 'amber',
  BLOCKED: 'clay',
};

/** Charge le registre employeur (route réelle) — utilisé par plusieurs fiches. */
function useOffers(limit = 50) {
  return useEmployerResource<Offer[]>(async (api, signal) => (await api.myOffers({ limit, signal })).items, [limit]);
}

/* ─────────────────────────── EMP-05 · Registre ─────────────────────────── */

export function Employer05Offers({ unitId, pathname }: EmployerUnitProps) {
  const [segment, setSegment] = useState('ALL');
  const [query, setQuery] = useState('');
  const resource = useOffers();
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label={`Chargement des ${PRODUCT_LABELS.OFFER.plural.toLowerCase()}`} rows={5} />;

  const offers = resource.data;
  const visible = offers
    .filter((offer) => segment === 'ALL' || offer.status === segment)
    .filter((offer) => (query ? offer.title.toLowerCase().includes(query.toLowerCase()) : true));

  return (
    <>
      <PageHead
        title={PRODUCT_LABELS.OFFER.plural}
        lede={`${offers.length} offres chargées · ${offers.filter((offer) => offer.status === 'ACTIVE').length} actives`}
        seal={{ tone: 'gold', label: 'Registre' }}
      />
      <FilterChips
        label="Segments"
        options={[
          { id: 'ALL', label: 'Toutes' },
          { id: 'ACTIVE', label: 'Actives' },
          { id: 'PAUSED', label: 'En pause' },
          { id: 'FILLED', label: 'Pourvues' },
          { id: 'CANCELLED', label: 'Annulées' },
        ]}
        value={segment}
        onChange={setSegment}
      />
      <Panel title="Recherche locale" zone="form">
        <label className="lbm-employer__field">
          <span>Rechercher dans les offres chargées</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </Panel>
      <Panel title="Registre" zone="list">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Aucune offre dans ce segment.</EmptyNotice>}
          render={(offer) => (
            <RecordCard
              title={offer.title}
              href={`/client/missions/${offer.id}`}
              seal={{ tone: OFFER_TONE[offer.status], label: offerStatusLabel(offer.status) }}
              facts={[
                { label: 'Référence', value: offer.id },
                { label: 'Publiée le', value: formatDate(offer.postedDate) ?? '—' },
                { label: 'Rémunération', value: formatAmount(offer.remuneration, offer.currency) },
              ]}
            />
          )}
        />
      </Panel>
      <ActionRow>
        <Link href="/client/missions/nouvelle/1" className="lbm-employer__link">
          Publier une offre
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · EMP-05" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-06 → EMP-09 · Création en quatre étapes ───────────────── */

const WIZARD_STEPS = [
  { step: 1, title: 'Objet de l’offre', hint: 'Titre, type de contrat et résumé : ce que le candidat lira en premier.' },
  { step: 2, title: 'Lieu et durée', hint: 'Lieu réel, date de début, durée et urgence.' },
  { step: 3, title: 'Compétences et conditions', hint: 'Compétences attendues, responsabilités et conditions d’exécution.' },
  { step: 4, title: 'Rémunération et publication', hint: 'Montant réellement saisi, puis création de l’offre (POST /offers).' },
] as const;

function canContinue(step: number, draft: OfferDraft): boolean {
  if (step === 1) return draft.title.trim().length > 0 && draft.contractType.trim().length > 0;
  if (step === 2) return draft.location.trim().length > 0;
  if (step === 3) return parseList(draft.skills).length > 0;
  return offerDraftComplete(draft);
}

export function Employer06OfferWizard({ unitId, pathname, segments }: EmployerUnitProps) {
  const api = useEmployerApi();
  const [draft, setDraft] = useState<OfferDraft>(() => readOfferDraft());
  const action = useEmployerAction<Offer>();
  const step = Math.min(4, Math.max(1, Number(segments[segments.length - 1] ?? '1') || 1));
  const current = WIZARD_STEPS[step - 1];

  useEffect(() => subscribeOfferDraft(() => setDraft(readOfferDraft())), []);

  const patch = (values: Partial<OfferDraft>) => setDraft(updateOfferDraft(values));

  const publish = () => {
    const payload = toOfferDraft(draft);
    if (!api || !payload) return;
    void action.run((signal) => api.createOffer(payload, signal)).then((offer) => {
      if (offer) {
        clearOfferDraft();
        navigate(`/client/missions/${offer.id}/publiee`);
      }
    });
  };

  return (
    <>
      <PageHead
        title="Nouvelle offre"
        lede={`Étape ${step} sur 4 · ${current.title}`}
        seal={{ tone: 'gold', label: `Étape ${step}/4` }}
      />
      <Zone kind="chips" label="Progression">
        <ol className="lbm-employer__steps">
          {WIZARD_STEPS.map((entry) => (
            <li key={entry.step} data-active={entry.step === step ? 'true' : undefined} data-done={entry.step < step ? 'true' : undefined}>
              <Link href={`/client/missions/nouvelle/${entry.step}`}>{`${entry.step}. ${entry.title}`}</Link>
            </li>
          ))}
        </ol>
      </Zone>

      <Panel title={current.title} zone="form">
        <p className="lbm-caption lbm-muted">{current.hint}</p>
        {step === 1 ? (
          <div className="lbm-employer__fields">
            <label className="lbm-employer__field">
              <span>Titre de l’offre</span>
              <input maxLength={60} value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
            </label>
            <label className="lbm-employer__field">
              <span>Type de contrat</span>
              <input value={draft.contractType} onChange={(event) => patch({ contractType: event.target.value })} />
            </label>
            <label className="lbm-employer__field">
              <span>Résumé du travail attendu</span>
              <textarea rows={4} value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} />
            </label>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="lbm-employer__fields">
            <label className="lbm-employer__field">
              <span>Lieu</span>
              <input value={draft.location} onChange={(event) => patch({ location: event.target.value })} />
            </label>
            <label className="lbm-employer__field">
              <span>Date de début</span>
              <input type="date" value={draft.startDate} onChange={(event) => patch({ startDate: event.target.value })} />
            </label>
            <label className="lbm-employer__field">
              <span>Durée (mois)</span>
              <input
                type="number"
                min={1}
                value={draft.durationMonths}
                onChange={(event) => patch({ durationMonths: event.target.value })}
              />
            </label>
            <label className="lbm-employer__check">
              <input type="checkbox" checked={draft.isUrgent} onChange={(event) => patch({ isUrgent: event.target.checked })} />
              <span>Besoin urgent</span>
            </label>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="lbm-employer__fields">
            <label className="lbm-employer__field">
              <span>Compétences attendues (séparées par des virgules)</span>
              <input value={draft.skills} onChange={(event) => patch({ skills: event.target.value })} />
            </label>
            <label className="lbm-employer__field">
              <span>Responsabilités (séparées par des virgules)</span>
              <input value={draft.responsibilities} onChange={(event) => patch({ responsibilities: event.target.value })} />
            </label>
            <label className="lbm-employer__field">
              <span>Conditions d’exécution (séparées par des virgules)</span>
              <input value={draft.conditions} onChange={(event) => patch({ conditions: event.target.value })} />
            </label>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="lbm-employer__fields">
            <label className="lbm-employer__field">
              <span>Rémunération</span>
              <input type="number" min={1} value={draft.remuneration} onChange={(event) => patch({ remuneration: event.target.value })} />
            </label>
            <label className="lbm-employer__field">
              <span>Devise</span>
              <input value={draft.currency} onChange={(event) => patch({ currency: event.target.value })} />
            </label>
            <KeyValues
              title="Relecture"
              items={[
                { label: 'Titre', value: draft.title.trim() || null },
                { label: 'Type de contrat', value: draft.contractType.trim() || null },
                { label: 'Lieu', value: draft.location.trim() || null },
                { label: 'Date de début', value: draft.startDate || null },
                { label: 'Durée (mois)', value: draft.durationMonths || null },
                { label: 'Rémunération saisie', value: draft.remuneration ? formatAmount(Number(draft.remuneration), draft.currency || 'FCFA') : null },
              ]}
            />
            <p className="lbm-caption lbm-muted">
              Le brouillon des étapes 1 à 3 reste en mémoire de l’onglet : aucun brouillon serveur n’existe, rien n’est créé avant « Publier l’offre ».
            </p>
          </div>
        ) : null}
      </Panel>

      <ActionRow>
        {step > 1 ? (
          <NeoPressButton variant="ghost" onClick={() => navigate(`/client/missions/nouvelle/${step - 1}`)}>
            Retour
          </NeoPressButton>
        ) : null}
        {step < 4 ? (
          <NeoPressButton variant="primary" disabled={!canContinue(step, draft)} onClick={() => navigate(`/client/missions/nouvelle/${step + 1}`)}>
            Continuer
          </NeoPressButton>
        ) : (
          <NeoPressButton variant="primary" disabled={!canContinue(step, draft) || !api} loading={action.busy} onClick={publish}>
            Publier l’offre
          </NeoPressButton>
        )}
        <NeoPressButton
          variant="text"
          onClick={() => {
            clearOfferDraft();
            setDraft(EMPTY_OFFER_DRAFT);
          }}
        >
          Vider le brouillon
        </NeoPressButton>
        <RetryButton onClick={() => setDraft(readOfferDraft())} busy={false} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}

      <GapNotice title={`BACKEND_GAP · EMP-0${step}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ─────────────────── EMP-10 · Qualification de l'offre ─────────────────── */

function TriState({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <fieldset className="lbm-employer__tristate">
      <legend>{label}</legend>
      {(
        [
          ['Oui', true],
          ['Non', false],
          ['Inconnu', null],
        ] as const
      ).map(([text, option]) => (
        <label key={text}>
          <input type="radio" name={label} checked={value === option} onChange={() => onChange(option)} />
          <span>{text}</span>
        </label>
      ))}
    </fieldset>
  );
}

const BOOLEAN_FIELDS: readonly { key: keyof MissionQualificationAnswers; label: string }[] = [
  { key: 'acceptanceCriteriaObjective', label: 'Critères d’acceptation objectifs et vérifiables' },
  { key: 'providerChoosesMethods', label: 'Le candidat choisit ses méthodes' },
  { key: 'providerOrganizesTime', label: 'Le candidat organise son temps' },
  { key: 'mayServeOtherClients', label: 'Le candidat peut servir d’autres employeurs' },
  { key: 'mayDeclineWithoutPenalty', label: 'Le candidat peut refuser sans pénalité' },
  { key: 'professionalRisk', label: 'Le candidat porte un risque professionnel' },
  { key: 'disciplinaryPower', label: 'Un pouvoir disciplinaire existe' },
  { key: 'continuousShift', label: 'Travail en postes continus' },
  { key: 'dailyHierarchicalOrders', label: 'Ordres hiérarchiques quotidiens' },
  { key: 'permanentIntegratedPosition', label: 'Poste intégré de façon permanente' },
  { key: 'exclusivityRequired', label: 'Exclusivité exigée' },
  { key: 'exclusivityJustified', label: 'Exclusivité justifiée' },
];

const FORMALITY_FIELDS = [
  { key: 'majorityCheckPlanned', label: 'Contrôle de majorité prévu' },
  { key: 'professionalStatusRequirementsIdentified', label: 'Exigences de statut professionnel identifiées' },
  { key: 'professionalAuthorizationRequired', label: 'Autorisation professionnelle requise' },
  { key: 'professionalAuthorizationCheckPlanned', label: 'Contrôle de cette autorisation prévu' },
  { key: 'taxInvoicingRequirementsIdentified', label: 'Exigences fiscales et de facturation identifiées' },
  { key: 'insuranceRequired', label: 'Assurance requise' },
  { key: 'insuranceRequirementsIdentified', label: 'Exigences d’assurance identifiées' },
] as const;

const EMPTY_ANSWERS: MissionQualificationAnswers = {
  serviceNature: 'UNCLEAR',
  deliverableDescription: '',
  acceptanceCriteria: '',
  acceptanceCriteriaObjective: null,
  compensationBasis: 'UNKNOWN',
  providerChoosesMethods: null,
  providerOrganizesTime: null,
  mayServeOtherClients: null,
  mayDeclineWithoutPenalty: null,
  professionalRisk: null,
  disciplinaryPower: null,
  continuousShift: null,
  dailyHierarchicalOrders: null,
  permanentIntegratedPosition: null,
  exclusivityRequired: null,
  exclusivityJustified: null,
  timePlaceConstraint: 'UNKNOWN',
  candidateFacingConstraintSummary: '',
  formalities: {
    majorityCheckPlanned: null,
    professionalStatusRequirementsIdentified: null,
    professionalAuthorizationRequired: null,
    professionalAuthorizationCheckPlanned: null,
    taxInvoicingRequirementsIdentified: null,
    insuranceRequired: null,
    insuranceRequirementsIdentified: null,
  },
};

export function Employer10Qualification({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const offerId = params.id ?? '';
  const [answers, setAnswers] = useState<MissionQualificationAnswers>(EMPTY_ANSWERS);
  const resource = useEmployerResource<MissionQualificationRecord | null>((employerApi, signal) => employerApi.qualification(offerId, signal), [offerId]);
  const action = useEmployerAction<MissionQualificationRecord>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de la qualification" rows={4} />;

  const record = action.result ?? resource.data;

  return (
    <>
      <PageHead
        title="Qualification de l’offre"
        lede="Verdict rendu par le moteur de qualification réel, motif par motif."
        seal={record ? { tone: DECISION_TONE[record.decision] ?? 'slate', label: DECISION_LABEL[record.decision] ?? record.decision } : { tone: 'slate', label: 'Non qualifiée' }}
      />

      {record ? (
        <Panel title="Verdict" zone="verdict">
          <StatusSeal tone={DECISION_TONE[record.decision] ?? 'slate'} label={DECISION_LABEL[record.decision] ?? record.decision} />
          <KeyValues
            items={[
              { label: 'Version des règles', value: record.ruleVersion },
              { label: 'Évaluée le', value: formatDateTime(record.evaluatedAt) },
              { label: 'Décision initiale', value: DECISION_LABEL[record.initialDecision] ?? record.initialDecision },
              { label: 'Revue humaine', value: record.reviewedAt ? formatDateTime(record.reviewedAt) : null },
              { label: 'Motif de revue', value: record.reviewReason ?? null },
            ]}
          />
          <RecordList
            items={record.reasons}
            empty={<EmptyNotice>Aucun motif enregistré.</EmptyNotice>}
            render={(reason) => (
              <RecordCard
                title={reason.explanation}
                seal={{ tone: reason.severity === 'BLOCK' ? 'clay' : reason.severity === 'REVIEW' ? 'amber' : 'slate', label: reason.severity }}
                facts={[
                  { label: 'Code', value: reason.code },
                  { label: 'Catégorie', value: reason.category },
                ]}
              />
            )}
          />
        </Panel>
      ) : (
        <EmptyNotice>Aucune qualification enregistrée pour cette offre. Le formulaire ci-dessous est le seul chemin réel.</EmptyNotice>
      )}

      <Panel title="Nouvelle évaluation" zone="form">
        <div className="lbm-employer__fields">
          <label className="lbm-employer__field">
            <span>Type de contrat</span>
            <select value={answers.serviceNature} onChange={(event) => setAnswers({ ...answers, serviceNature: event.target.value as MissionQualificationAnswers['serviceNature'] })}>
              <option value="AUTONOMOUS_DELIVERABLE">Livrable autonome</option>
              <option value="PRESENCE_BASED">Présence encadrée</option>
              <option value="UNCLEAR">À préciser</option>
            </select>
          </label>
          <label className="lbm-employer__field">
            <span>Livrable attendu</span>
            <input value={answers.deliverableDescription} onChange={(event) => setAnswers({ ...answers, deliverableDescription: event.target.value })} />
          </label>
          <label className="lbm-employer__field">
            <span>Critères d’acceptation</span>
            <input value={answers.acceptanceCriteria} onChange={(event) => setAnswers({ ...answers, acceptanceCriteria: event.target.value })} />
          </label>
          <label className="lbm-employer__field">
            <span>Base de rémunération</span>
            <select value={answers.compensationBasis} onChange={(event) => setAnswers({ ...answers, compensationBasis: event.target.value as MissionQualificationAnswers['compensationBasis'] })}>
              <option value="RESULT_OR_SERVICE">Résultat ou service</option>
              <option value="TIME_OR_PRESENCE">Temps ou présence</option>
              <option value="MIXED">Mixte</option>
              <option value="UNKNOWN">À préciser</option>
            </select>
          </label>
          <label className="lbm-employer__field">
            <span>Contrainte de temps et de lieu</span>
            <select value={answers.timePlaceConstraint} onChange={(event) => setAnswers({ ...answers, timePlaceConstraint: event.target.value as MissionQualificationAnswers['timePlaceConstraint'] })}>
              <option value="NONE">Aucune</option>
              <option value="OPERATIONAL">Opérationnelle</option>
              <option value="STRONG">Forte</option>
              <option value="UNKNOWN">À préciser</option>
            </select>
          </label>
          <label className="lbm-employer__field">
            <span>Résumé des contraintes montré au candidat</span>
            <textarea rows={3} value={answers.candidateFacingConstraintSummary} onChange={(event) => setAnswers({ ...answers, candidateFacingConstraintSummary: event.target.value })} />
          </label>

          {BOOLEAN_FIELDS.map((field) => (
            <TriState
              key={String(field.key)}
              label={field.label}
              value={answers[field.key] as boolean | null}
              onChange={(value) => setAnswers({ ...answers, [field.key]: value } as MissionQualificationAnswers)}
            />
          ))}

          <fieldset className="lbm-employer__tristate">
            <legend>Formalités</legend>
            {FORMALITY_FIELDS.map((field) => (
              <TriState
                key={field.key}
                label={field.label}
                value={answers.formalities[field.key]}
                onChange={(value) => setAnswers({ ...answers, formalities: { ...answers.formalities, [field.key]: value } })}
              />
            ))}
          </fieldset>
        </div>
      </Panel>

      <ActionRow>
        {api ? (
          <NeoPressButton
            variant="primary"
            loading={action.busy}
            onClick={() =>
              action.run((signal) => api.submitQualification(offerId, answers, signal)).then((created) => {
                if (created) resource.reload();
              })
            }
          >
            Évaluer l’offre
          </NeoPressButton>
        ) : null}
        <Link href={`/client/missions/${offerId}/matching`} className="lbm-employer__link">
          Matching
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}

      <GapNotice title="BACKEND_GAP · EMP-10" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-11 · Prix et frais de l'offre ───────────────── */

export function Employer11Pricing({ unitId, params, pathname }: EmployerUnitProps) {
  const offerId = params.id ?? '';
  const resource = useEmployerResource(
    async (api, signal) => ({
      offers: (await api.myOffers({ limit: 50, signal })).items,
      contracts: (await api.myContracts({ limit: 25, signal })).items,
    }),
    [],
  );
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des montants réels" rows={3} />;

  const offer = resource.data.offers.find((item) => item.id === offerId) ?? null;
  const contract = resource.data.contracts.find((item) => item.offerId === offerId) ?? null;

  return (
    <>
      <PageHead
        title="Prix de l’offre"
        lede="Seules les valeurs réellement stockées sont affichées. Aucun total et aucune part variable ne sont calculés ici."
        seal={{ tone: 'gold', label: 'Valeurs réelles' }}
      />
      <Panel title="Rémunération de l’offre" zone="price">
        {offer ? (
          <KeyValues
            items={[
              { label: 'Offre', value: offer.title },
              { label: 'Rémunération saisie', value: formatAmount(offer.remuneration, offer.currency) },
              { label: 'Devise', value: offer.currency },
              { label: 'Statut', value: offerStatusLabel(offer.status) },
            ]}
          />
        ) : (
          <EmptyNotice>Aucune offre chargée pour cet identifiant.</EmptyNotice>
        )}
      </Panel>
      <Panel title="Conditions financières du contrat lié" zone="table">
        {contract ? (
          <KeyValues
            items={[
              { label: 'Contrat', value: contract.id },
              { label: 'Salaire mensuel enregistré', value: formatAmount(contract.monthlySalary, contract.currency) },
              { label: 'Taux enregistré', value: `${contract.commissionPercentage} %` },
              { label: 'Montant de commission enregistré', value: formatAmount(contract.commissionAmountDue, contract.currency) },
              { label: 'Statut du contrat', value: contract.status },
              { label: 'Commission du premier mois', value: typeof contract.firstMonthCommission === 'number' ? formatAmount(contract.firstMonthCommission, contract.currency) : null },
            ]}
          />
        ) : (
          <EmptyNotice>Aucun contrat lié : les frais ne sont affichés que lorsqu’ils existent réellement.</EmptyNotice>
        )}
      </Panel>
      <GapNotice title="BACKEND_GAP · EMP-11" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ─────────── EMP-12 / EMP-13 · Aperçu et publication ─────────── */

export function Employer12Preview({ unitId, params, pathname }: EmployerUnitProps) {
  const offerId = params.id ?? '';
  const published = pathname.endsWith('/publiee');
  const resource = useEmployerResource<Offer | null>(
    async (api, signal) => (await api.myOffers({ limit: 50, signal })).items.find((offer) => offer.id === offerId) ?? null,
    [offerId],
  );
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de l’offre publiée" rows={4} />;

  const offer = resource.data;

  return (
    <>
      <PageHead
        title={published ? 'Offre publiée' : 'Aperçu de l’offre'}
        lede="Rendu des champs réellement enregistrés côté serveur."
        seal={published ? { tone: 'emerald', label: 'Publiée' } : { tone: 'gold', label: 'Aperçu' }}
      />
      <Panel title="Fiche publique (relecture)" zone="hero">
        {offer ? (
          <KeyValues
            items={[
              { label: 'Titre', value: offer.title },
              { label: 'Référence', value: offer.id },
              { label: 'Type de contrat', value: offer.contractType },
              { label: 'Lieu', value: offer.locationLabel || offer.location },
              { label: 'Compétences', value: offer.skills.join(', ') || null },
              { label: 'Résumé', value: offer.summary || null },
              { label: 'Rémunération', value: formatAmount(offer.remuneration, offer.currency) },
              { label: 'Publiée le', value: formatDate(offer.postedDate) },
              { label: 'Statut', value: offerStatusLabel(offer.status) },
            ]}
          />
        ) : (
          <EmptyNotice>Aucune offre ne porte cet identifiant dans les offres réellement chargées.</EmptyNotice>
        )}
      </Panel>
      <ActionRow>
        <Link href="/client/missions" className="lbm-employer__link">
          Retour au registre
        </Link>
        <Link href={`/client/missions/${offerId}/qualification`} className="lbm-employer__link">
          Qualification
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title={`BACKEND_GAP · ${published ? 'EMP-13' : 'EMP-12'}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-14 · Fiche de l'offre ───────────────── */

export function Employer14OfferDetail({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const offerId = params.id ?? '';
  const resource = useEmployerResource(
    async (employerApi, signal) => {
      const [offers, contracts, applications, qualification] = await Promise.all([
        employerApi.myOffers({ limit: 50, signal }),
        employerApi.myContracts({ limit: 50, signal }),
        employerApi.offerApplications(offerId, { limit: 100, signal }),
        employerApi.qualification(offerId, signal).catch(() => null),
      ]);
      return {
        offer: offers.items.find((offer) => offer.id === offerId) ?? null,
        contracts: contracts.items.filter((contract) => contract.offerId === offerId),
        applications: applications.items,
        qualification,
      };
    },
    [offerId],
  );
  const action = useEmployerAction<Offer>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de l’offre" rows={5} />;

  const { offer, contracts, applications, qualification } = resource.data;
  const toReview = applications.filter((application) => application.status === 'PENDING' || application.status === 'REVIEW').length;

  return (
    <>
      <PageHead
        title={offer?.title ?? 'Offre introuvable'}
        lede={offer ? `Référence ${offer.id}` : 'Aucune offre réellement chargée ne porte cet identifiant.'}
        seal={offer ? { tone: OFFER_TONE[offer.status], label: offerStatusLabel(offer.status) } : { tone: 'slate', label: 'Introuvable' }}
      />

      {offer ? (
        <Panel title="Dossier de l’offre" zone="hero">
          <KeyValues
            items={[
              { label: 'Type de contrat', value: offer.contractType },
              { label: 'Lieu', value: offer.locationLabel || offer.location },
              { label: 'Rémunération', value: formatAmount(offer.remuneration, offer.currency) },
              { label: 'Compétences', value: offer.skills.join(', ') || null },
              { label: 'Conditions', value: offer.conditions.join(', ') || null },
              { label: 'Date de début', value: formatDate(offer.startDate) },
              { label: 'Durée (mois)', value: offer.durationMonths ? String(offer.durationMonths) : null },
              { label: 'Qualification', value: qualification ? (DECISION_LABEL[qualification.decision] ?? qualification.decision) : 'Non qualifiée' },
            ]}
          />
        </Panel>
      ) : null}

      <Zone kind="timeline" label="Frise réelle">
        <h2 className="lbm-title-2">Frise des engagements réels</h2>
        <ol className="lbm-employer__timeline">
          <li data-done={offer ? 'true' : 'false'}>
            <span aria-hidden="true" className="lbm-employer__timeline-dot" />
            <span className="lbm-employer__timeline-label">Offre publiée</span>
            <span className="lbm-mono lbm-caption">{formatDateTime(offer?.postedDate) ?? '—'}</span>
          </li>
          <li data-done={applications.length > 0 ? 'true' : 'false'}>
            <span aria-hidden="true" className="lbm-employer__timeline-dot" />
            <span className="lbm-employer__timeline-label">Candidatures reçues</span>
            <span className="lbm-mono lbm-caption">{`${applications.length} · ${toReview} à examiner`}</span>
          </li>
          <li data-done={contracts.length > 0 ? 'true' : 'false'}>
            <span aria-hidden="true" className="lbm-employer__timeline-dot" />
            <span className="lbm-employer__timeline-label">Contrats liés</span>
            <span className="lbm-mono lbm-caption">{String(contracts.length)}</span>
          </li>
        </ol>
      </Zone>

      <Panel title="Contrats liés" zone="list">
        <RecordList
          items={contracts}
          empty={<EmptyNotice>Aucun contrat lié à cette offre.</EmptyNotice>}
          render={(contract) => (
            <RecordCard
              title={contract.id}
              href={`/client/contrats/${contract.id}`}
              seal={{ tone: contract.status === 'ACTIVE' ? 'emerald' : 'slate', label: contract.status }}
              facts={[
                { label: 'Candidat', value: contract.employeeName },
                { label: 'Début', value: formatDate(contract.startDate) ?? '—' },
              ]}
            />
          )}
        />
      </Panel>

      <ActionRow>
        {api && offer ? (
          <>
            <NeoPressButton
              variant="ghost"
              loading={action.busy}
              onClick={() => action.run((signal) => api.setOfferStatus(offer.id, offer.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', signal)).then(() => resource.reload())}
            >
              {offer.status === 'ACTIVE' ? 'Mettre en pause' : 'Reprendre'}
            </NeoPressButton>
            {offer.status !== 'CANCELLED' && offer.status !== 'FILLED' ? (
              <NeoPressButton
                variant="text"
                loading={action.busy}
                onClick={() => action.run((signal) => api.setOfferStatus(offer.id, 'CANCELLED', signal)).then(() => resource.reload())}
              >
                Annuler l’offre
              </NeoPressButton>
            ) : null}
          </>
        ) : null}
        <Link href={`/client/missions/${offerId}/candidatures`} className="lbm-employer__link">
          Candidatures
        </Link>
        <Link href={`/client/missions/${offerId}/modifier`} className="lbm-employer__link">
          Modifier
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}

      <GapNotice title="BACKEND_GAP · EMP-14" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-15 · Modification de l'offre ───────────────── */

export function Employer15OfferEdit({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const offerId = params.id ?? '';
  const resource = useEmployerResource<Offer | null>(
    async (employerApi, signal) => (await employerApi.myOffers({ limit: 50, signal })).items.find((offer) => offer.id === offerId) ?? null,
    [offerId],
  );
  const action = useEmployerAction<Offer>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de l’offre" rows={3} />;

  const offer = resource.data;
  const transitions: { label: string; status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' }[] = offer
    ? offer.status === 'ACTIVE'
      ? [
          { label: 'Mettre en pause', status: 'PAUSED' },
          { label: 'Annuler', status: 'CANCELLED' },
        ]
      : offer.status === 'PAUSED'
        ? [
            { label: 'Reprendre', status: 'ACTIVE' },
            { label: 'Annuler', status: 'CANCELLED' },
          ]
        : []
    : [];

  return (
    <>
      <PageHead
        title="Modifier l’offre"
        lede="Le produit n’expose que le changement de statut : les champs de l’offre ne sont pas modifiables par une route existante."
        seal={offer ? { tone: OFFER_TONE[offer.status], label: offerStatusLabel(offer.status) } : { tone: 'slate', label: 'Introuvable' }}
      />
      <Panel title="Champs" zone="form">
        {offer ? (
          <KeyValues
            items={[
              { label: 'Titre', value: offer.title },
              { label: 'Lieu', value: offer.locationLabel || offer.location },
              { label: 'Rémunération', value: formatAmount(offer.remuneration, offer.currency) },
            ]}
          />
        ) : (
          <EmptyNotice>Aucune offre chargée pour cet identifiant.</EmptyNotice>
        )}
        <p className="lbm-caption lbm-muted">
          Une modification de champ exigerait une route d’édition d’offre : elle n’existe pas. Aucun enregistrement silencieux n’est donc effectué.
        </p>
      </Panel>
      <ActionRow>
        {api && offer
          ? transitions.map((transition) => (
              <NeoPressButton
                key={transition.status}
                variant={transition.status === 'CANCELLED' ? 'text' : 'ghost'}
                loading={action.busy}
                onClick={() => action.run((signal) => api.setOfferStatus(offer.id, transition.status, signal)).then(() => resource.reload())}
              >
                {transition.label}
              </NeoPressButton>
            ))
          : null}
        <Link href={`/client/missions/${offerId}/qualification`} className="lbm-employer__link">
          Qualification
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title="BACKEND_GAP · EMP-15" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}
