/**
 * PRE-05 → PRE-07 — Marché des offres : liste, filtres, fiche offre.
 *
 * La route réelle du marché est GET /offers (publique) : les offres réellement
 * actives sont filtrées et triées localement. Aucun compteur serveur, aucune
 * recherche indexée : les capacités absentes sont déclarées (BACKEND_GAP).
 * Le vocabulaire affiché est celui du produit : une « mission » du design est
 * une OFFRE.
 */

import { useMemo, useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
  FilterChips,
  GapNotice,
  KeyValues,
  Link,
  LoadingBlock,
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  RetryButton,
  Zone,
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Offer } from '../../types';
import type { PrestataireApi } from '../api';
import type { PrestataireUnitProps } from '../types';
import { PRODUCT_LABELS, formatAmount, formatDate, offerStatusLabel } from '../vocabulary';

const OFFER_TONE: Record<Offer['status'], 'emerald' | 'amber' | 'slate' | 'gold'> = {
  ACTIVE: 'emerald',
  PAUSED: 'amber',
  FILLED: 'gold',
  CANCELLED: 'slate',
};

async function loadOffers(api: PrestataireApi, signal: AbortSignal): Promise<Offer[]> {
  return (await api.offers({ limit: 100, signal })).items;
}

function OfferCard({ offer }: { offer: Offer }) {
  return (
    <RecordCard
      title={offer.title}
      href={`/prestataire/missions/${offer.id}`}
      seal={{ tone: OFFER_TONE[offer.status], label: offerStatusLabel(offer.status) }}
      facts={[
        { label: 'Employeur', value: offer.employerName },
        { label: 'Rémunération', value: formatAmount(offer.remuneration, offer.currency) },
        { label: 'Lieu', value: offer.locationLabel ?? offer.location },
        { label: 'Publiée le', value: formatDate(offer.postedDate) ?? '—' },
      ]}
    >
      {offer.isUrgent ? <p className="lbm-caption">Offre urgente</p> : null}
    </RecordCard>
  );
}

/* ───────────────── PRE-05 · Marché des offres ───────────────── */

const MARKET_SEGMENTS = [
  { id: 'ACTIVE', label: 'Actives' },
  { id: 'ALL', label: 'Toutes' },
] as const;

const MARKET_SORTS = [
  { id: 'recent', label: 'Plus récentes' },
  { id: 'amount', label: 'Mieux rémunérées' },
] as const;

export function Prestataire05Market({ unitId, pathname }: PrestataireUnitProps) {
  const [segment, setSegment] = useState('ACTIVE');
  const [sort, setSort] = useState('recent');
  const resource = usePrestataireResource<Offer[]>(loadOffers, []);

  const visible = useMemo(() => {
    if (!resource.data) return [];
    const filtered = resource.data.filter((offer) => segment === 'ALL' || offer.status === segment);
    const sorted = [...filtered];
    if (sort === 'amount') sorted.sort((left, right) => right.remuneration - left.remuneration);
    else sorted.sort((left, right) => right.postedDate.localeCompare(left.postedDate));
    return sorted;
  }, [resource.data, segment, sort]);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label={`Chargement du marché des ${PRODUCT_LABELS.OFFER.plural.toLowerCase()}`} rows={5} />;

  const activeCount = resource.data.filter((offer) => offer.status === 'ACTIVE').length;

  return (
    <>
      <PageHead
        title={`Marché des ${PRODUCT_LABELS.OFFER.plural.toLowerCase()}`}
        lede={`${activeCount} ${PRODUCT_LABELS.OFFER.plural.toLowerCase()} actives réellement publiées. Les filtres et tris sont appliqués localement sur les offres réelles.`}
        seal={{ tone: 'emerald', label: `${activeCount} actives` }}
      />

      <FilterChips
        label="Segment"
        options={MARKET_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={segment}
        onChange={setSegment}
      />
      <FilterChips
        label="Tri"
        options={MARKET_SORTS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={sort}
        onChange={setSort}
      />

      <Panel title={PRODUCT_LABELS.OFFER.plural} zone="list">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Aucune offre ne correspond. Revenez plus tard : de nouvelles offres sont publiées chaque jour.</EmptyNotice>}
          render={(offer) => <OfferCard offer={offer} />}
        />
      </Panel>

      <ActionRow>
        <Link href="/prestataire/missions/filtres" className="lbm-candidat__link">
          Filtres
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-05" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-06 · Filtres ───────────────── */

export function Prestataire06Filters({ unitId, pathname }: PrestataireUnitProps) {
  const [location, setLocation] = useState('');
  const [skill, setSkill] = useState('');
  const [applied, setApplied] = useState<{ location: string; skill: string } | null>(null);
  const resource = usePrestataireResource<Offer[]>(loadOffers, []);

  const results = useMemo(() => {
    if (!resource.data || !applied) return [];
    const locationNeedle = applied.location.trim().toLowerCase();
    const skillNeedle = applied.skill.trim().toLowerCase();
    return resource.data.filter((offer) => {
      if (offer.status !== 'ACTIVE') return false;
      if (locationNeedle && !(offer.locationLabel ?? offer.location).toLowerCase().includes(locationNeedle)) return false;
      if (skillNeedle && !offer.skills.some((entry) => entry.toLowerCase().includes(skillNeedle))) return false;
      return true;
    });
  }, [resource.data, applied]);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des filtres" rows={3} />;

  return (
    <>
      <PageHead
        title="Filtres"
        lede="Filtres appliqués localement sur les offres réelles : aucun filtre serveur ni preset enregistré n’existe."
        seal={{ tone: 'slate', label: 'Local' }}
      />

      <Panel title="Critères" zone="form">
        <div className="lbm-candidat__fields">
          <label className="lbm-candidat__field">
            Lieu (texte)
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Ex. Douala" />
          </label>
          <label className="lbm-candidat__field">
            Compétence (texte)
            <input value={skill} onChange={(event) => setSkill(event.target.value)} placeholder="Ex. peinture" />
          </label>
        </div>
      </Panel>

      <ActionRow>
        <Link href="/prestataire/missions" className="lbm-candidat__link">
          Voir le marché
        </Link>
        <button
          type="button"
          className="lbm-candidat__chip"
          onClick={() => setApplied({ location, skill })}
        >
          Appliquer les filtres ({results.length} offre(s) correspondante(s))
        </button>
      </ActionRow>

      <Panel title="Résultats réels" zone="list">
        <RecordList
          items={applied ? results : resource.data.filter((offer) => offer.status === 'ACTIVE')}
          empty={<EmptyNotice>Aucune offre active. Ajustez les critères ou consultez le marché complet.</EmptyNotice>}
          render={(offer) => <OfferCard offer={offer} />}
        />
      </Panel>

      <GapNotice title="BACKEND_GAP · PRE-06" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-07 · Fiche offre ───────────────── */

export function Prestataire07OfferDetail({ unitId, params, pathname }: PrestataireUnitProps) {
  const offerId = params.id;
  const resource = usePrestataireResource(async (api, signal) => api.offer(offerId, signal), [offerId]);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de l’offre" rows={5} />;

  const offer = resource.data;

  return (
    <>
      <PageHead
        title={offer.title}
        lede={`${offer.employerName} · ${offer.locationLabel ?? offer.location}`}
        seal={{ tone: OFFER_TONE[offer.status], label: offerStatusLabel(offer.status) }}
      />

      <Zone kind="price">
        <Panel title="Rémunération" zone="price">
          <p className="lbm-candidat__kpi-value lbm-mono">{formatAmount(offer.remuneration, offer.currency)}</p>
          <p className="lbm-caption lbm-muted">Montant de l’offre, tel que publié par l’employeur. Aucune déduction n’est appliquée au candidat.</p>
        </Panel>
      </Zone>

      <Panel title="Détail de l’offre" zone="list">
        <KeyValues
          items={[
            { label: 'Type de contrat', value: offer.contractType },
            { label: 'Lieu', value: offer.locationLabel ?? offer.location },
            { label: 'Employeur', value: offer.employerName },
            { label: 'Début prévu', value: formatDate(offer.startDate) ?? null },
            { label: 'Durée', value: offer.durationMonths ? `${offer.durationMonths} mois` : null },
            { label: 'Compétences requises', value: offer.skills.join(', ') || null },
            { label: 'Publication', value: formatDate(offer.postedDate) ?? null },
          ]}
        />
      </Panel>

      <Panel title="Résumé" zone="doc">
        <p className="lbm-body">{offer.summary}</p>
      </Panel>

      {offer.responsibilities.length > 0 ? (
        <Panel title="Responsabilités" zone="list">
          <RecordList items={offer.responsibilities} render={(item) => <p className="lbm-body">{item}</p>} />
        </Panel>
      ) : null}

      {offer.conditions.length > 0 ? (
        <Panel title="Conditions" zone="list">
          <RecordList items={offer.conditions} render={(item) => <p className="lbm-body">{item}</p>} />
        </Panel>
      ) : null}

      <ActionRow>
        {offer.status === 'ACTIVE' ? (
          <Link href={`/prestataire/missions/${offer.id}/postuler`} className="lbm-candidat__link">
            Postuler à cette {PRODUCT_LABELS.OFFER.singular.toLowerCase()}
          </Link>
        ) : (
          <p className="lbm-caption lbm-muted">Cette {PRODUCT_LABELS.OFFER.singular.toLowerCase()} n’est plus active : la candidature n’est plus ouverte.</p>
        )}
        <Link href="/prestataire/missions" className="lbm-candidat__link">
          Retour au marché
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-07" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
