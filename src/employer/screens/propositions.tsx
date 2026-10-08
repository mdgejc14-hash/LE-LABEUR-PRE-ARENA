/**
 * EMP-23 → EMP-28 — Propositions : registre, négociation, attente, expirations,
 * acceptations et retrait.
 *
 * Le produit n'expose AUCUNE lecture employeur des propositions : la seule vue
 * réelle disponible est le contrat qui en découle (`contract.proposalId`).
 * Aucune liste n'est reconstituée, aucun identifiant n'est inventé : les
 * capacités absentes sont déclarées (BACKEND_GAP) et les écrans affichent les
 * données réellement lisibles.
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
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerApi, useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { EmployerApi } from '../api';
import type { EmployerUnitProps } from '../types';
import { CONTRACT_STATUS_LABELS, PRODUCT_LABELS, formatAmount, formatDate } from '../vocabulary';

interface ProposalContext {
  contracts: Contract[];
  fromProposal: Contract[];
}

function loadProposalContext(api: EmployerApi, signal: AbortSignal): Promise<ProposalContext> {
  return api.myContracts({ limit: 50, signal }).then((page) => ({
    contracts: page.items,
    fromProposal: page.items.filter((contract) => Boolean(contract.proposalId)),
  }));
}

function contractTone(status: Contract['status']): 'emerald' | 'gold' | 'slate' | 'clay' {
  if (status === 'ACTIVE') return 'emerald';
  if (status === 'DRAFT' || status === 'SIGNATURE') return 'slate';
  if (status === 'TERMINATED') return 'clay';
  return 'gold';
}

function ProposalContractCard({ contract }: { contract: Contract }) {
  return (
    <RecordCard
      title={`${contract.employeeName} · ${contract.offerTitle}`}
      href={`/client/contrats/${contract.id}`}
      seal={{ tone: contractTone(contract.status), label: CONTRACT_STATUS_LABELS[contract.status] }}
      facts={[
        { label: 'Proposition d’origine', value: contract.proposalId ?? '—' },
        { label: 'Salaire mensuel', value: formatAmount(contract.monthlySalary, contract.currency) },
        { label: 'Début', value: formatDate(contract.startDate) ?? '—' },
      ]}
    />
  );
}

/* ───────────────── EMP-23 · Registre des propositions ───────────────── */

const PROPOSAL_SEGMENTS = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'SENT', label: 'Envoyées' },
  { id: 'COUNTERED', label: 'Contre-proposées' },
  { id: 'ACCEPTED', label: 'Acceptées' },
  { id: 'EXPIRED', label: 'Expirées' },
] as const;

export function Employer23Proposals({ unitId, pathname }: EmployerUnitProps) {
  const [segment, setSegment] = useState('ALL');
  const resource = useEmployerResource<ProposalContext>(loadProposalContext, []);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des propositions lisibles" rows={4} />;

  return (
    <>
      <PageHead
        title={PRODUCT_LABELS.PROPOSAL.plural}
        lede="Registre employeur : le produit ne renvoie aucune proposition émise, vue, contre-proposée ou expirée."
        seal={{ tone: 'slate', label: 'Lecture partielle' }}
      />

      <FilterChips
        label="Segments"
        options={PROPOSAL_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={segment}
        onChange={setSegment}
      />
      <Panel title="Segments déclarés, aucune ligne serveur" zone="notice">
        <p className="lbm-caption lbm-muted">
          Les segments des fiches restent affichés comme structure. Ils ne filtrent rien : aucune route employeur ne liste les propositions. Rien n’est simulé à la place.
        </p>
      </Panel>

      <Panel title="Propositions lisibles (via le contrat)" zone="list">
        <RecordList
          items={resource.data.fromProposal}
          empty={<EmptyNotice>Aucune proposition aboutie lisible. Les propositions en cours ne sont pas exposées à l’employeur.</EmptyNotice>}
          render={(contract) => <ProposalContractCard contract={contract} />}
        />
      </Panel>

      <ActionRow>
        <Link href="/client/propositions/acceptees" className="lbm-employer__link">
          Acceptées
        </Link>
        <Link href="/client/propositions/expirees" className="lbm-employer__link">
          Expirées
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-23" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-24 · Détail et négociation ───────────────── */

export function Employer24ProposalDetail({ unitId, params, pathname }: EmployerUnitProps) {
  const proposalId = params.id ?? '';
  const resource = useEmployerResource<Contract | null>(
    async (api, signal) => (await api.myContracts({ limit: 50, signal })).items.find((contract) => contract.proposalId === proposalId) ?? null,
    [proposalId],
  );
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Recherche de la proposition" rows={4} />;

  const contract = resource.data;

  return (
    <>
      <PageHead
        title="Proposition"
        lede="Ni fil de négociation, ni contre-proposition, ni acceptation employeur : ces capacités n’existent pas dans le produit."
        seal={{ tone: 'slate', label: 'Lecture absente' }}
      />

      <Panel title="Ce qui est réellement lisible" zone="hero">
        {contract ? (
          <KeyValues
            items={[
              { label: 'Proposition d’origine', value: proposalId },
              { label: 'Contrat issu', value: contract.id },
              { label: 'Candidat', value: contract.employeeName },
              { label: 'Montant enregistré', value: formatAmount(contract.monthlySalary, contract.currency) },
              { label: 'Statut du contrat', value: CONTRACT_STATUS_LABELS[contract.status] },
            ]}
          />
        ) : (
          <EmptyNotice>
            Aucune proposition ne correspond à cet identifiant dans les données réellement lisibles. Montant, tours de négociation et échéance ne sont pas affichés :
            aucune lecture ne les fournit.
          </EmptyNotice>
        )}
      </Panel>

      <Panel title="Règles opposables" zone="notice">
        <EmptyNotice>
          L’acceptation d’une proposition est un acte côté candidat (POST /proposals/:proposalId/respond). Côté employeur, aucune route de lecture, de
          contre-proposition, d’acceptation ou de refus n’est installée : ces actions ne sont pas proposées ici.
        </EmptyNotice>
      </Panel>

      <ActionRow>
        {contract ? (
          <Link href={`/client/contrats/${contract.id}`} className="lbm-employer__link">
            Ouvrir le contrat
          </Link>
        ) : null}
        <Link href="/client/propositions" className="lbm-employer__link">
          Registre des propositions
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-24" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-25 · Contre-proposition : état & attente ───────────────── */

export function Employer25ProposalWaiting({ unitId, params, pathname }: EmployerUnitProps) {
  const proposalId = params.id ?? '';
  const resource = useEmployerResource<Contract | null>(
    async (api, signal) => (await api.myContracts({ limit: 50, signal })).items.find((contract) => contract.proposalId === proposalId) ?? null,
    [proposalId, pathname],
  );
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Recherche de la proposition" rows={3} />;

  return (
    <>
      <PageHead
        title="Contre-proposition"
        lede="Aucune contre-proposition n’est lisible ni modifiable depuis l’espace employeur."
        seal={{ tone: 'slate', label: 'État & attente' }}
      />
      <Panel title="Attente réelle" zone="verdict">
        <EmptyNotice>
          Le produit ne stocke aucune contre-proposition employeur et n’expose aucune lecture de son état (non lue, lue, expirée). Délai, compteur de tours et règle de
          gel après lecture ne sont donc pas affichés : ils ne seraient pas vérifiables.
        </EmptyNotice>
        {resource.data ? (
          <KeyValues
            items={[
              { label: 'Proposition', value: proposalId },
              { label: 'Contrat réellement lié', value: resource.data.id },
              { label: 'Statut du contrat', value: CONTRACT_STATUS_LABELS[resource.data.status] },
            ]}
          />
        ) : null}
      </Panel>
      <ActionRow>
        <Link href="/client/propositions" className="lbm-employer__link">
          Retour aux propositions
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · EMP-25" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-26 · Propositions expirées ───────────────── */

export function Employer26ProposalExpired({ unitId, pathname }: EmployerUnitProps) {
  const resource = useEmployerResource<Contract[]>(async () => [], []);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des expirations" rows={3} />;

  return (
    <>
      <PageHead
        title="Propositions expirées"
        lede="Aucune expiration n’est exposée côté employeur : le registre des propositions n’est pas lisible."
        seal={{ tone: 'slate', label: 'Aucune donnée' }}
      />
      <Panel title="Expirations" zone="list">
        <EmptyNotice>
          Le produit ne conserve aucune expiration lisible par l’employeur (ni délai, ni motif, ni relance). Aucune ligne n’est fabriquée, aucun taux statistique n’est affiché.
        </EmptyNotice>
      </Panel>
      <ActionRow>
        <Link href="/client/propositions" className="lbm-employer__link">
          Registre des propositions
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · EMP-26" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-27 · Propositions acceptées & plan de suite ───────────────── */

export function Employer27ProposalAccepted({ unitId, pathname }: EmployerUnitProps) {
  const resource = useEmployerResource<Contract[]>(
    async (api, signal) => (await api.myContracts({ limit: 50, signal })).items.filter((contract) => Boolean(contract.proposalId)),
    [],
  );
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des acceptations" rows={4} />;

  const contracts = resource.data;

  return (
    <>
      <PageHead
        title="Propositions acceptées"
        lede={`${contracts.length} proposition(s) acceptée(s), lisibles à travers le contrat qui en découle.`}
        seal={{ tone: contracts.length > 0 ? 'emerald' : 'slate', label: 'Acceptations' }}
      />

      <Panel title="File de contractualisation" zone="list">
        <RecordList
          items={contracts}
          empty={<EmptyNotice>Aucune proposition acceptée lisible : aucune contractualisation en attente sur ce compte.</EmptyNotice>}
          render={(contract) => <ProposalContractCard contract={contract} />}
        />
      </Panel>

      <Panel title="Rappel de règle" zone="notice">
        <p className="lbm-body">Aucun travail ne commence avant la signature des deux parties (statut réel du contrat : {CONTRACT_STATUS_LABELS.DRAFT} → {CONTRACT_STATUS_LABELS.SIGNATURE} → {CONTRACT_STATUS_LABELS.ACTIVE}).</p>
        <p className="lbm-caption lbm-muted">
          Le produit ne produit aucun « triplet » de prix côté employeur : les montants affichés sont ceux réellement enregistrés sur le contrat.
        </p>
      </Panel>

      <ActionRow>
        {contracts[0] ? (
          <Link href={`/client/contrats/${contracts[0].id}`} className="lbm-employer__link">
            Ouvrir le contrat
          </Link>
        ) : null}
        <Link href="/client/propositions" className="lbm-employer__link">
          Registre des propositions
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-27" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-28 · Retrait d'une proposition ───────────────── */

const WITHDRAWAL_REASONS = ['Offre annulée', 'Autre candidat retenu', 'Budget modifié', 'Conditions non remplies', 'Autre'] as const;

export function Employer28ProposalWithdraw({ unitId, params, pathname }: EmployerUnitProps) {
  const proposalId = params.id ?? '';
  const [reason, setReason] = useState<string>(WITHDRAWAL_REASONS[0]);
  const [note, setNote] = useState('');
  const resource = useEmployerResource<Contract | null>(
    async (api, signal) => (await api.myContracts({ limit: 50, signal })).items.find((contract) => contract.proposalId === proposalId) ?? null,
    [proposalId],
  );
  const api = useEmployerApi();
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Vérification de la proposition" rows={3} />;

  const contract = resource.data;

  return (
    <>
      <PageHead
        title="Retirer une proposition"
        lede="Retirer une proposition n’est pas une capacité employeur du produit : aucune route ne l’exécute."
        seal={{ tone: 'slate', label: 'Indisponible' }}
      />

      <Panel title="Motif de retrait (structure de la fiche)" zone="form">
        <fieldset className="lbm-employer__tristate">
          <legend>Motifs normalisés</legend>
          {WITHDRAWAL_REASONS.map((entry) => (
            <label key={entry}>
              <input type="radio" name="withdrawal-reason" checked={reason === entry} onChange={() => setReason(entry)} />
              <span>{entry}</span>
            </label>
          ))}
        </fieldset>
        <label className="lbm-employer__field">
          <span>Note libre (240 caractères)</span>
          <textarea rows={3} maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <p className="lbm-caption lbm-muted">
          Ces champs ne sont envoyés nulle part : aucune route de retrait n’existe côté employeur. Aucun enregistrement silencieux.
        </p>
      </Panel>

      <Panel title="Conséquences réelles" zone="kpi">
        {contract ? (
          <KeyValues
            items={[
              { label: 'Un contrat existe déjà pour cette proposition', value: contract.id },
              { label: 'Sortie', value: 'Résiliation du contrat (POST /contracts/:contractId/terminate)' },
            ]}
          />
        ) : (
          <EmptyNotice>Aucun contrat lié : rien n’est engagé, donc rien à retirer par une route de contrat.</EmptyNotice>
        )}
      </Panel>

      <ActionRow>
        <NeoPressButton variant="ghost" disabled>
          Retirer la proposition (route absente)
        </NeoPressButton>
        {api && contract ? (
          <Link href={`/client/contrats/${contract.id}/resilie`} className="lbm-employer__link">
            Passer par la résiliation du contrat
          </Link>
        ) : null}
        <Link href="/client/propositions" className="lbm-employer__link">
          Garder la proposition
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-28" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}
