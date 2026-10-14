/**
 * PRE-45 → PRE-47 — Réputation : synthèse, ledger, contestation.
 *
 * Utilise UNIQUEMENT le ledger de réputation existant (P0-REPUTATION) :
 *  - GET /my/reputation : vue DÉRIVÉE réelle (impact net, répartition par
 *    catégorie, compteurs, explication, versions des règles) ;
 *  - GET /my/reputation/entries : entrées réelles du ledger (append-only).
 *
 * Aucune logique de scoring n’est créée : le produit n’expose pas de score
 * 0-100 pondéré, et aucun n’est recalculé localement. La contestation n’a
 * aucune route candidat dédiée : le mécanisme existant proposé est le claim
 * (OTHER_REVIEW_REQUIRED), examiné par la modération. Aucune écriture de
 * ledger n’est modifiée par cette tranche.
 */

import { useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
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
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireAction, usePrestataireApi, usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { ClaimView, PrestataireApi, ReputationEntryView, ReputationView } from '../api';
import type { PrestataireUnitProps } from '../types';
import { CLAIM_STATUS_LABELS, CLAIM_TYPE_LABELS, PRODUCT_LABELS, formatDate } from '../vocabulary';

const DIRECTION_LABELS: Record<string, string> = {
  POSITIVE: '+',
  NEGATIVE: '−',
  NEUTRAL: '·',
};

/* ───────────────── PRE-45 / PRE-46 · Synthèse & ledger ───────────────── */

export function Prestataire45Reputation({ unitId, pathname }: PrestataireUnitProps) {
  const ledger = pathname.endsWith('/ledger');
  const reputation = usePrestataireResource<ReputationView>(async (api, signal) => api.myReputation(signal), []);
  const entries = usePrestataireResource<ReputationEntryView[]>(
    async (api, signal) => (await api.myReputationEntries({ limit: 100, signal })).items,
    [],
  );

  if (reputation.status === 'error') return <SystemFeedback {...reputation.error!} retry={reputation.reload} />;
  if (reputation.status === 'loading' || !reputation.data) return <LoadingBlock label="Chargement de la réputation" rows={4} />;

  const view = reputation.data;
  const derived = view.derived;

  if (ledger) {
    if (entries.status === 'error') return <SystemFeedback {...entries.error!} retry={entries.reload} />;
    if (entries.status === 'loading' || !entries.data) return <LoadingBlock label="Chargement du ledger" rows={5} />;
    return (
      <>
        <PageHead
          title={`Ledger de ${PRODUCT_LABELS.REPUTATION.singular.toLowerCase()}`}
          lede="Chaque écriture est traçable, datée, motivée. Le ledger est append-only : aucune écriture n’est modifiée ou supprimée, les corrections sont des écritures compensatoires (visibles ici)."
          seal={{ tone: 'slate', label: 'Append-only' }}
        />
        <KpiRow
          items={[
            { label: 'IMPACT NET', value: String(derived.netImpact) },
            { label: 'ÉCRITURES ACTIVES', value: String(derived.activeEntryCount) },
            { label: 'RÉVOQUÉES', value: String(derived.reversedEntryCount) },
          ]}
        />
        <Panel title="Écritures réelles" zone="table">
          <RecordList
            items={entries.data}
            empty={<EmptyNotice>Aucune écriture pour l’instant. Les écritures apparaissent avec les faits documentés (contrats, validations, décisions).</EmptyNotice>}
            render={(entry) => (
              <RecordCard
                title={`${DIRECTION_LABELS[entry.direction] ?? '·'} ${entry.impact} · ${entry.category}`}
                href="/prestataire/reputation/contestation"
                seal={{ tone: entry.status === 'ACTIVE' ? (entry.direction === 'NEGATIVE' ? 'clay' : 'emerald') : 'slate', label: entry.status === 'ACTIVE' ? 'Active' : 'Révoquée' }}
                facts={[
                  { label: 'Date du fait', value: formatDate(entry.occurredAt) ?? '—' },
                  { label: 'Règle', value: `${entry.ruleCode} (v${entry.ruleVersion})` },
                  { label: 'Motif', value: entry.explanation },
                  { label: 'Référence', value: `${entry.sourceEntityType} · ${entry.sourceEntityId}` },
                ]}
              />
            )}
          />
        </Panel>
        <ActionRow>
          <Link href="/prestataire/reputation" className="lbm-candidat__link">
            Synthèse
          </Link>
          <Link href="/prestataire/reputation/contestation" className="lbm-candidat__link">
            Contester une écriture
          </Link>
          <RetryButton onClick={entries.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-46" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title={`Ma ${PRODUCT_LABELS.REPUTATION.singular.toLowerCase()}`}
        lede="Vue dérivée réelle du ledger de réputation. La réputation n’est jamais une décision juridique ni une sanction automatique ; un candidat sans historique n’a pas de note négative."
        seal={{ tone: 'gold', label: PRODUCT_LABELS.REPUTATION.singular }}
      />

      <KpiRow
        items={[
          { label: 'IMPACT NET', value: String(derived.netImpact) },
          { label: 'IMPACT POSITIF', value: String(derived.positiveImpact) },
          { label: 'IMPACT NÉGATIF', value: String(derived.negativeImpact) },
        ]}
      />

      <Panel title="Répartition réelle par catégorie" zone="list">
        <RecordList
          items={derived.categories}
          empty={<EmptyNotice>Aucune écriture active : la répartition est vide, sans note pénalisante.</EmptyNotice>}
          render={(category) => (
            <RecordCard
              title={category.category}
              seal={{ tone: category.impact < 0 ? 'clay' : 'emerald', label: `${category.impact > 0 ? '+' : ''}${category.impact}` }}
              facts={[{ label: 'Écritures', value: String(category.entryCount) }]}
            />
          )}
        />
      </Panel>

      <Panel title="Méthode (explication réelle du serveur)" zone="notice" tone="notice">
        <RecordList items={view.explanation} render={(line) => <p className="lbm-caption lbm-muted">{line}</p>} />
        <p className="lbm-caption lbm-muted">
          {`Versions réellement observées : score ${view.scoreVersion}, règles ${view.rulesVersion}. Le ledger est la source de vérité ; cette vue n’en est qu’une dérivation.`}
        </p>
      </Panel>

      <ActionRow>
        <Link href="/prestataire/reputation/ledger" className="lbm-candidat__link">
          Voir le ledger complet
        </Link>
        <Link href="/prestataire/reputation/contestation" className="lbm-candidat__link">
          Contester une écriture
        </Link>
        <RetryButton onClick={reputation.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-45" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-47 · Contestation ───────────────── */

export function Prestataire47ReputationContest({ unitId, params, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const entries = usePrestataireResource<ReputationEntryView[]>(
    async (client, signal) => (await client.myReputationEntries({ limit: 100, signal })).items,
    [],
  );
  const contracts = usePrestataireResource<Contract[]>(async (client, signal) => (await client.myContracts({ limit: 100, signal })).items, []);
  const claim = usePrestataireAction<ClaimView>();
  const [entryId, setEntryId] = useState('');
  const [contractId, setContractId] = useState('');
  const [grounds, setGrounds] = useState('');

  if (entries.status === 'error') return <SystemFeedback {...entries.error!} retry={entries.reload} />;
  if (entries.status === 'loading' || !entries.data || contracts.status === 'loading' || !contracts.data) {
    return <LoadingBlock label="Chargement de la contestation" rows={4} />;
  }

  const entriesList = entries.data;
  const contractsList = contracts.data;
  const entry = entriesList.find((candidate) => candidate.reputationId === entryId) ?? null;

  return (
    <>
      <PageHead
        title="Contester une écriture"
        lede="Aucune route de contestation de réputation n’est ouverte au candidat : la correction d’une écriture est un acte de modération (ADMIN). Le mécanisme existant proposé ici est le claim, examiné par la modération — aucune écriture de ledger n’est modifiée."
        seal={{ tone: 'amber', label: 'Via claim' }}
      />

      <Panel title="Écriture contestée (sélection réelle)" zone="form">
        <label className="lbm-candidat__field">
          Écriture du ledger
          <select id="contest-entry" value={entryId} onChange={(event) => setEntryId(event.target.value)}>
            <option value="" disabled>
              Choisir une écriture
            </option>
            {entriesList.map((candidate) => (
              <option key={candidate.reputationId} value={candidate.reputationId}>
                {`${formatDate(candidate.occurredAt) ?? '—'} · ${DIRECTION_LABELS[candidate.direction] ?? '·'} ${candidate.impact} · ${candidate.category} · ${candidate.explanation}`}
              </option>
            ))}
          </select>
        </label>
        {entry ? (
          <KeyValues
            items={[
              { label: 'Date du fait', value: formatDate(entry.occurredAt) ?? null },
              { label: 'Impact', value: `${DIRECTION_LABELS[entry.direction] ?? '·'} ${entry.impact}` },
              { label: 'Règle', value: `${entry.ruleCode} (v${entry.ruleVersion})` },
              { label: 'Motif', value: entry.explanation },
              { label: 'Référence', value: `${entry.sourceEntityType} · ${entry.sourceEntityId}` },
            ]}
          />
        ) : null}
      </Panel>

      <Panel title={`Fondement (claim « ${CLAIM_TYPE_LABELS.OTHER_REVIEW_REQUIRED} » — mécanisme existant)`} zone="form">
        <div className="lbm-candidat__fields">
          <label className="lbm-candidat__field">
            Contrat de contexte (obligatoire)
            <select id="contest-contract" value={contractId} onChange={(event) => setContractId(event.target.value)}>
              <option value="" disabled>
                Choisir un contrat
              </option>
              {contractsList.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.offerTitle} · {contract.employerName}
                </option>
              ))}
            </select>
          </label>
          <label className="lbm-candidat__field">
            Faits et fondement
            <textarea
              value={grounds}
              onChange={(event) => setGrounds(event.target.value)}
              placeholder="Faits erronés, contexte non pris en compte, preuve non examinée… (2000 caractères max)"
              maxLength={2000}
            />
          </label>
        </div>
        <p className="lbm-caption lbm-muted">
          {`Pendant l’examen, le score dérivé reste calculé sur les entrées actives réelles. L’issue (maintien ou écriture compensatoire) est décidée par la modération et tracée.`}
        </p>
        <NeoPressButton
          variant="primary"
          loading={claim.busy}
          disabled={!entryId || !contractId || grounds.trim().length === 0}
          onClick={() => {
            const selected = entriesList.find((candidate) => candidate.reputationId === entryId);
            if (!selected) return;
            void claim
              .run((signal) =>
                api!.createClaim(
                  {
                    contractId,
                    type: 'OTHER_REVIEW_REQUIRED',
                    reason: grounds.trim(),
                    evidenceReference: `reputation-entry:${selected.reputationId}`,
                  },
                  signal,
                ),
              )
              .then((result) => {
                if (result) entries.reload();
              });
          }}
        >
          Soumettre la contestation
        </NeoPressButton>
      </Panel>

      {claim.error ? <SystemFeedback {...claim.error} retry={claim.reset} /> : null}
      {claim.result ? (
        <Panel title="Contestation reçue (réponse serveur)" zone="notice" tone="notice">
          {`Dossier ${claim.result.claimId} ouvert (statut réel : ${CLAIM_STATUS_LABELS[claim.result.status]}). L’écriture de ledger reste visible et inchangée pendant l’examen.`}
        </Panel>
      ) : null}

      <ActionRow>
        <Link href="/prestataire/reputation/ledger" className="lbm-candidat__link">
          Retour au ledger
        </Link>
        <Link href="/prestataire/reputation" className="lbm-candidat__link">
          Synthèse
        </Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-47" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
