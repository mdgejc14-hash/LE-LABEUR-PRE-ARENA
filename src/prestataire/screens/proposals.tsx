/**
 * PRE-16 → PRE-20 — Propositions reçues : registre, historique, détail,
 * acceptation, contre-proposition.
 *
 * Le produit n’expose AUCUNE lecture candidat des propositions (aucune route
 * déclarée). La seule commande candidat réelle est POST
 * /proposals/:proposalId/respond, qui n’ouvre que ACCEPT et DECLINE
 * (REVISE renvoie 501 « demande de révision non ouverte »).
 *
 * Aucune liste n’est reconstituée, aucun identifiant n’est inventé : les
 * propositions abouties sont lisibles via le contrat qui en découle
 * (`contract.proposalId`), comme côté employeur. Les capacités absentes sont
 * déclarées (BACKEND_GAP). Aucun état de négociation n’est inventé.
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
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  RetryButton,
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { PrestataireApi } from '../api';
import type { PrestataireUnitProps } from '../types';
import { CONTRACT_STATUS_LABELS, PRODUCT_LABELS, formatAmount, formatDate } from '../vocabulary';

interface ProposalContext {
  contracts: Contract[];
  fromProposal: Contract[];
}

function loadProposalContext(api: PrestataireApi, signal: AbortSignal): Promise<ProposalContext> {
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
      title={`${contract.employerName} · ${contract.offerTitle}`}
      href={`/prestataire/contrats/${contract.id}`}
      seal={{ tone: contractTone(contract.status), label: CONTRACT_STATUS_LABELS[contract.status] }}
      facts={[
        { label: 'Proposition d’origine', value: contract.proposalId ?? '—' },
        { label: 'Salaire mensuel', value: formatAmount(contract.monthlySalary, contract.currency) },
        { label: 'Début', value: formatDate(contract.startDate) ?? '—' },
      ]}
    />
  );
}

/* ───────────────── PRE-16 / PRE-20 · Registre & historique ───────────────── */

const PROPOSAL_SEGMENTS = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'ACCEPTED', label: 'Acceptées' },
  { id: 'DECLINED', label: 'Déclinées' },
  { id: 'EXPIRED', label: 'Expirées' },
] as const;

export function Prestataire16Proposals({ unitId, pathname }: PrestataireUnitProps) {
  const [segment, setSegment] = useState('ALL');
  const history = pathname.endsWith('/historique');
  const resource = usePrestataireResource<ProposalContext>(loadProposalContext, []);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des propositions lisibles" rows={4} />;

  return (
    <>
      <PageHead
        title={`${PRODUCT_LABELS.PROPOSAL.plural} reçues`}
        lede={history
          ? 'Historique : le produit ne renvoie aucune proposition reçue, acceptée, déclinée ou expirée. Seules les propositions abouties sont lisibles via le contrat.'
          : 'Registre : le produit ne renvoie aucune proposition reçue. Seules les propositions abouties sont lisibles via le contrat qui en découle.'}
        seal={{ tone: 'slate', label: 'Lecture partielle' }}
      />

      <FilterChips
        label="Segments"
        options={PROPOSAL_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={segment}
        onChange={setSegment}
      />
      <Panel title="Segments déclarés, aucune ligne serveur" zone="notice" tone="notice">
        Les segments des fiches restent affichés comme structure. Ils ne filtrent rien : aucune route candidat ne liste les propositions. Rien n’est simulé à la place.
      </Panel>

      <Panel title="Propositions abouties (via le contrat réel)" zone="list">
        <RecordList
          items={resource.data.fromProposal}
          empty={<EmptyNotice>Aucune proposition aboutie lisible. Les propositions en cours ne sont pas exposées au candidat.</EmptyNotice>}
          render={(contract) => <ProposalContractCard contract={contract} />}
        />
      </Panel>

      <ActionRow>
        <Link href="/prestataire/notifications" className="lbm-candidat__link">
          Voir les notifications
        </Link>
        <Link href="/prestataire/contrats" className="lbm-candidat__link">
          Mes {PRODUCT_LABELS.CONTRACT.plural.toLowerCase()}
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title={history ? 'BACKEND_GAP · PRE-20' : 'BACKEND_GAP · PRE-16'} items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-17 / PRE-18 / PRE-19 · Détail & réponse ───────────────── */

export function Prestataire17ProposalDetail({ unitId, params, pathname }: PrestataireUnitProps) {
  const proposalId = params.id;
  const acceptance = pathname.endsWith('/acceptation');
  const counter = pathname.endsWith('/contre');
  const resource = usePrestataireResource<ProposalContext>(loadProposalContext, []);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du contexte" rows={3} />;

  const related = resource.data.fromProposal.find((contract) => contract.proposalId === proposalId) ?? null;

  if (acceptance) {
    return (
      <>
        <PageHead
          title="Accepter une proposition"
          lede="Accepter est un engagement. Le produit ne permet pas de lire la proposition avant de répondre : aucune acceptation n’est proposée sans lecture — le consentement ne doit jamais être un réflexe de tap."
          seal={{ tone: 'clay', label: 'Lecture indisponible' }}
        />
        <Panel title="Capacité réelle" zone="notice" tone="notice">
          {`La commande réelle POST /proposals/:proposalId/respond accepte { action: ACCEPT | DECLINE, notes? }, mais AUCUNE route ne permet au candidat de lire la proposition (montant, conditions, échéancier). Sans lecture, aucune case de consentement n’est présentée : rien n’est simulé.`}
        </Panel>
        {related ? (
          <Panel title="Contrat issu de cette proposition (réel)" zone="list">
            <ProposalContractCard contract={related} />
          </Panel>
        ) : null}
        <ActionRow>
          <Link href="/prestataire/propositions" className="lbm-candidat__link">
            Retour aux {PRODUCT_LABELS.PROPOSAL.plural.toLowerCase()}
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-18" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  if (counter) {
    return (
      <>
        <PageHead
          title="Contre-proposer"
          lede="Négocier ses conditions est un droit — mais le modèle réel n’ouvre pas la négociation : l’action REVISE de POST /proposals/:proposalId/respond renvoie 501 « demande de révision non ouverte »."
          seal={{ tone: 'clay', label: 'Non ouverte' }}
        />
        <Panel title="État réel du modèle" zone="notice" tone="notice">
          {`Les seules réponses ouvertes au candidat sont ACCEPT et DECLINE. Aucun compteur de tours, aucun ajustement de prix/délai/périmètre n’est persisté : aucune contre-proposition n’est simulée.`}
        </Panel>
        <ActionRow>
          <Link href="/prestataire/propositions" className="lbm-candidat__link">
            Retour aux {PRODUCT_LABELS.PROPOSAL.plural.toLowerCase()}
          </Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · PRE-19" items={prestataireGapsFor(unitId, pathname)} />
      </>
    );
  }

  return (
    <>
      <PageHead
        title={`Proposition ${proposalId}`}
        lede="Le produit n’expose aucune lecture candidat d’une proposition : le montant, l’employeur et les conditions ne sont pas lisibles depuis l’API. Aucune donnée n’est reconstituée."
        seal={{ tone: 'clay', label: 'Lecture indisponible' }}
      />
      {related ? (
        <Panel title="Contrat issu de cette proposition (réel)" zone="list">
          <KeyValues
            items={[
              { label: 'Contrat', value: related.id },
              { label: 'Offre', value: related.offerTitle },
              { label: 'Salaire mensuel', value: formatAmount(related.monthlySalary, related.currency) },
              { label: 'Statut', value: CONTRACT_STATUS_LABELS[related.status] },
            ]}
          />
        </Panel>
      ) : (
        <Panel title="Lecture indisponible" zone="notice" tone="notice">
          {`Aucune route candidat ne lit la proposition ${proposalId}. Si vous avez reçu une proposition, elle est visible via la notification qui l’accompagne et via le contrat lorsqu’elle aboutit.`}
        </Panel>
      )}
      <ActionRow>
        <Link href="/prestataire/propositions" className="lbm-candidat__link">
          Retour aux {PRODUCT_LABELS.PROPOSAL.plural.toLowerCase()}
        </Link>
        <Link href="/prestataire/notifications" className="lbm-candidat__link">
          Voir les notifications
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · PRE-17" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
