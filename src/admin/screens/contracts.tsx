/**
 * ADM-13 → ADM-17 — supervision des contrats (tranche P4B-1).
 *
 * Registre des contrats, fiche d'un contrat, incidents (Claims) rattachés,
 * historique/journal et fiche de révision forcée.
 *
 * Données : uniquement les routes ADMIN existantes et réellement opérationnelles :
 *  - `admin.contracts.list` (GET /api/v1/admin/contracts, permission serveur
 *    `contracts:read:any`) : registre paginé (curseur réel) projetant le DTO
 *    `Contract` complet — parties, statut, signatures horodatées, conditions,
 *    jalons d'exécution, références remplacement/incident et historique émis.
 *  - `admin.claims.list` (GET /api/v1/admin/claims, permission serveur
 *    `incidents:read:any`) : Claims réels ; le rattachement à un contrat est un
 *    filtre local sur le champ `contractId` de la page réellement chargée.
 *
 * Garde-fous de la tranche : aucune lecture individuelle ADMIN des contrats
 * n'existe (contracts.read est réservée aux parties) — la fiche est composée
 * depuis la page réelle, comme ADM-03 pour les comptes ; l'ADMIN ne signe,
 * n'active, ne confirme, ne résilie ni ne révise rien depuis l'interface (les
 * routes de transition sont gouvernées par le serveur au profit des parties) ;
 * la révision forcée (ADM-16) n'a AUCUNE route : la fiche l'affiche en
 * capacité indisponible, sans formulaire simulé ; aucun agrégat financier n'est
 * calculé (paiements et rapprochement : tranche P4B-2, hors périmètre ici).
 * Aucune donnée n'est inventée : les capacités absentes sont déclarées
 * (`gaps.ts`) et les valeurs manquantes s'affichent « — ».
 */

import { useState } from 'react';
import {
  ActionError,
  ActionRow,
  DataTable,
  EmptyNotice,
  FilterChips,
  GapNotice,
  KeyValues,
  KpiRow,
  Link,
  LoadingBlock,
  NeoPressButton,
  PageHead,
  Panel,
  RecordList,
  RetryButton,
  StatusSeal,
  Timeline,
} from '../components';
import { adminGapsFor } from '../screenMap';
import { useAdminAction, useAdminApi, useAdminResource } from '../hooks';
import { useAdminActor } from '../UnitBoundary';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { AdminApi, AdminPage, ClaimView, Contract } from '../api';
import type { AdminUnitProps } from '../types';
import {
  ADMIN_UI_TERMS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_TONES,
  CLAIM_TYPE_LABELS,
  CONTRACT_REGISTRY_SEGMENTS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  PRODUCT_LABELS,
  formatBoolean,
  formatContractAmount,
  formatDate,
  formatDateTime,
  formatYesNo,
} from '../vocabulary';

/* ── Chargement : page réelle unique, curseur réel quand il existe ── */

interface ContractsPageState {
  readonly items: readonly Contract[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
}

async function loadContractsPage(api: AdminApi, signal: AbortSignal): Promise<ContractsPageState> {
  const page = await api.contracts({ limit: 100, signal });
  return { items: page.items, cursor: page.cursor, hasMore: page.hasMore };
}

async function loadClaimsPage(api: AdminApi, signal: AbortSignal): Promise<AdminPage<ClaimView>> {
  return api.claims({ limit: 100, signal });
}

function useContractsPage() {
  const api = useAdminApi();
  const resource = useAdminResource<ContractsPageState>(loadContractsPage, []);
  const next = useAdminAction<AdminPage<Contract>>();
  const [appended, setAppended] = useState<readonly Contract[]>([]);
  const [appendedCursor, setAppendedCursor] = useState<string | null>(null);

  const items: readonly Contract[] | null = resource.data ? [...resource.data.items, ...appended] : null;
  const cursor = appendedCursor ?? resource.data?.cursor ?? null;
  const hasMore = appended.length > 0 ? next.result?.hasMore ?? false : resource.data?.hasMore ?? false;

  const loadMore = () => {
    if (!api || !cursor) return;
    void next.run((signal) => api.contracts({ limit: 100, cursor, signal })).then((page) => {
      if (page) {
        setAppended((previous) => [...previous, ...page.items]);
        setAppendedCursor(page.cursor);
      }
    });
  };

  const reloadAll = () => {
    setAppended([]);
    setAppendedCursor(null);
    next.reset();
    resource.reload();
  };

  return { ...resource, items, cursor, hasMore, loadMore, loadMoreBusy: next.busy, loadMoreError: next.error, reload: reloadAll };
}

/** Fiche d'un contrat, composée depuis la page réelle chargée (aucune lecture individuelle ADMIN n'existe). */
function findContract(items: readonly Contract[] | null, id: string): Contract | null {
  if (!items) return null;
  return items.find((candidate) => candidate.id === id) ?? null;
}

function ContractMissingNotice({ contractId }: { contractId: string }) {
  return (
    <EmptyNotice>
      {`Le contrat ${contractId} n’est pas dans la page réellement chargée du registre ADMIN. Aucune route de lecture individuelle ADMIN n’existe (contrat hors page = ressource non atteignable, BACKEND_GAP) : rien n’est rechargé à part, rien n’est simulé.`}
    </EmptyNotice>
  );
}

/* ─────────────────────────────── ADM-13 · registre ─────────────────────────────── */

function matchesSegment(contract: Contract, statuses: readonly Contract['status'][]): boolean {
  return statuses.length === 0 || statuses.includes(contract.status);
}

function filterContracts(contracts: readonly Contract[], query: string, segmentId: string): Contract[] {
  const segment = CONTRACT_REGISTRY_SEGMENTS.find((candidate) => candidate.id === segmentId);
  const needle = query.trim().toLowerCase();
  return contracts.filter((contract) => {
    if (segment && !matchesSegment(contract, segment.statuses)) return false;
    if (!needle) return true;
    return [contract.id, contract.offerTitle, contract.employerName, contract.employeeId, contract.employerId, contract.employeeName]
      .some((field) => field.toLowerCase().includes(needle));
  });
}

export function Admin13ContractsRegistry({ unitId, pathname }: AdminUnitProps) {
  const resource = useContractsPage();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<string>('all');
  const gaps = adminGapsFor(unitId, pathname);
  // Filtre local calculé avant tout retour conditionnel (ordre des hooks stable).
  const visible = resource.items ? filterContracts(resource.items, query, segment) : [];

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.items) return <LoadingBlock label={ADMIN_UI_TERMS.CONTRACT_REGISTRY} rows={5} />;

  const loaded = resource.items;
  const countIn = (statuses: readonly Contract['status'][]) => loaded.filter((contract) => statuses.includes(contract.status)).length;
  const signatureCount = countIn(['SIGNATURE', 'PENDING_EMPLOYER', 'PENDING_EMPLOYEE']);
  const incidentCount = countIn(['INCIDENT']);

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.CONTRACT_REGISTRY}
        lede={`${loaded.length} contrats chargés (page réelle du registre ADMIN) · segments et recherche appliqués localement sur les données réelles`}
        seal={{ tone: 'gold', label: 'Registre réel' }}
      />

      <KpiRow
        items={[
          { label: 'CONTRATS (PAGE)', value: String(loaded.length) },
          { label: 'EN ATTENTE DE SIGNATURE', value: String(signatureCount) },
          { label: 'ACTIFS', value: String(countIn(['ACTIVE'])) },
          { label: 'CLAIM EN COURS', value: String(incidentCount) },
          { label: 'RÉSULTATS', value: String(visible.length) },
        ]}
      />

      <Panel title="Synthèse" zone="kpi" tone="notice">
        Aucun endpoint de synthèse serveur n’existe (BACKEND_GAP) : les repères ci-dessus sont des comptes sur la page réellement chargée, jamais sur la base entière. Les montants affichés sont les valeurs contractuelles réelles du DTO ; les agrégats financiers relèvent de la tranche P4B-2.
      </Panel>

      <FilterChips label="Segments du registre" options={CONTRACT_REGISTRY_SEGMENTS.map(({ id, label }) => ({ id, label }))} value={segment} onChange={setSegment} />

      <Panel title="Recherche" zone="form">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Référence, offre, partie…"
          aria-label="Rechercher un contrat"
        />
        <p className="lbm-caption lbm-muted">Filtre local sur les données réelles chargées (la recherche serveur multi-critères n’existe pas).</p>
      </Panel>

      <DataTable
        caption="Registre réel des contrats"
        head={['Référence', PRODUCT_LABELS.EMPLOYER.singular, PRODUCT_LABELS.CANDIDATE.singular, 'Salaire mensuel', 'Statut', 'Début', 'Mois', 'Fiche']}
        rows={visible.map((contract) => [
          <span key="id" className="lbm-mono">{contract.id}</span>,
          <span key="employer">{contract.employerName || '—'} <span className="lbm-mono lbm-caption">({contract.employerId})</span></span>,
          <span key="employee">{contract.employeeName || '—'} <span className="lbm-mono lbm-caption">({contract.employeeId})</span></span>,
          <span key="amount" className="lbm-mono">{formatContractAmount(contract.monthlySalary, contract.currency)}</span>,
          <StatusSeal key="status" tone={CONTRACT_STATUS_TONES[contract.status] ?? 'slate'} label={CONTRACT_STATUS_LABELS[contract.status] ?? contract.status} size="sm" />,
          formatDate(contract.startDate) ?? '—',
          <span key="month" className="lbm-mono">{`${contract.currentMonth} / ${contract.durationMonths}`}</span>,
          <Link key="sheet" href={`/admin/contrats/${encodeURIComponent(contract.id)}`} className="lbm-admin__link">Ouvrir</Link>,
        ])}
        empty={(
          <EmptyNotice>
            {query || segment !== 'all'
              ? 'Aucun contrat sur les filtres (page réellement chargée).'
              : 'Aucun contrat : le registre ADMIN répond une collection réelle vide (ou sa frontière de contrôle sans persistance durable).'}
          </EmptyNotice>
        )}
      />

      <ActionRow>
        {resource.hasMore ? (
          <NeoPressButton variant="ghost" onClick={resource.loadMore} loading={resource.loadMoreBusy}>
            Charger la page suivante
          </NeoPressButton>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      {resource.loadMoreError ? <ActionError error={resource.loadMoreError} /> : null}
      <p className="lbm-caption lbm-muted">
        {resource.hasMore ? 'Curseur réel du serveur (identifiant du dernier contrat chargé) : la page suivante est ajoutée, rien n’est déduit.' : 'Le serveur n’annonce pas de page suivante pour ce curseur.'}
      </p>

      <GapNotice title="BACKEND_GAP · ADM-13" items={gaps} />
    </>
  );
}

/* ─────────────────────────────── ADM-14 · fiche ─────────────────────────────── */

export function Admin14ContractSheet({ unitId, pathname, params }: AdminUnitProps) {
  const actor = useAdminActor();
  const resource = useContractsPage();
  const contractId = params.id ?? '';
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.items) return <LoadingBlock label={ADMIN_UI_TERMS.CONTRACT_SHEET} rows={4} />;

  const contract = findContract(resource.items, contractId);
  if (!contract) {
    return (
      <>
        <PageHead title={ADMIN_UI_TERMS.CONTRACT_SHEET} lede={`Référence : ${contractId}`} seal={{ tone: 'slate', label: 'Hors page chargée' }} />
        <ContractMissingNotice contractId={contractId} />
        <ActionRow>
          <Link href="/admin/contrats" className="lbm-admin__link">Retour au registre</Link>
          <RetryButton onClick={resource.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · ADM-14" items={gaps} />
      </>
    );
  }

  const history = contract.history;
  const conditions = contract.conditions;

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.CONTRACT_SHEET} · ${contract.id}`}
        lede={`${contract.offerTitle || 'Offre sans titre'} — ${PRODUCT_LABELS.OFFER.singular} ${contract.offerId}`}
        seal={{ tone: CONTRACT_STATUS_TONES[contract.status] ?? 'slate', label: CONTRACT_STATUS_LABELS[contract.status] ?? contract.status }}
      />

      <Panel title="Parties et conditions disponibles" zone="hero">
        <KeyValues
          title="Parties et conditions"
          items={[
            { label: 'Référence (Mono)', value: contract.id },
            { label: 'Statut (code serveur)', value: contract.status },
            { label: PRODUCT_LABELS.EMPLOYER.singular, value: `${contract.employerName || '—'} (${contract.employerId})` },
            { label: PRODUCT_LABELS.CANDIDATE.singular, value: `${contract.employeeName || '—'} (${contract.employeeId})` },
            { label: `Issue de la ${PRODUCT_LABELS.PROPOSAL.singular.toLowerCase()}`, value: contract.proposalId ?? null },
            { label: 'Issue de la candidature', value: contract.applicationId ?? null },
            { label: 'Début', value: formatDate(contract.startDate) },
            { label: 'Fin', value: formatDate(contract.endDate) },
            { label: 'Durée', value: `${contract.durationMonths} mois` },
            { label: 'Périodicité', value: contract.periodicity || null },
            { label: 'Lieu', value: contract.location || null },
            { label: 'Salaire mensuel (valeur réelle du contrat)', value: formatContractAmount(contract.monthlySalary, contract.currency) },
            { label: 'Mois courant', value: `${contract.currentMonth} / ${contract.durationMonths}` },
          ]}
        />
        {contract.missionDescription ? (
          <p className="lbm-body">{contract.missionDescription}</p>
        ) : (
          <p className="lbm-caption lbm-muted">Aucune description d’engagement n’est portée par le contrat.</p>
        )}
        <RecordList
          items={conditions}
          label="Conditions contractuelles réelles (DTO Contrat)"
          empty={<EmptyNotice>Aucune condition n’est listée par le DTO du contrat.</EmptyNotice>}
          render={(condition) => <p className="lbm-body">{condition}</p>}
        />
        {contract.additionalNotes ? (
          <p className="lbm-caption lbm-muted">{`Notes complémentaires du contrat : ${contract.additionalNotes}`}</p>
        ) : null}
      </Panel>

      <Panel title="Signature et activation (consultation)" zone="list">
        <KeyValues
          title="Signatures réelles"
          items={[
            {
              label: `${PRODUCT_LABELS.EMPLOYER.singular}`,
              value: contract.employerSigned ? `Signé — ${formatDateTime(contract.employerSignedAt) ?? 'horodatage non exposé'}` : 'Non signé',
            },
            {
              label: `${PRODUCT_LABELS.CANDIDATE.singular}`,
              value: contract.employeeSigned ? `Signé — ${formatDateTime(contract.employeeSignedAt) ?? 'horodatage non exposé'}` : 'Non signé',
            },
            { label: 'Activation', value: CONTRACT_STATUS_LABELS[contract.status] ?? contract.status },
          ]}
        />
        <p className="lbm-caption lbm-muted">
          Signature et activation sont des gestes des parties (routes serveur owner-scope) : l’ADMIN consulte l’état et les horodatages réels, il ne signe ni n’active rien depuis l’interface.
        </p>
      </Panel>

      <Panel title="États et historique du contrat" zone="timeline">
        <Timeline
          steps={history.map((entry) => ({
            label: entry.description,
            detail: `${entry.event} · ${formatDateTime(entry.timestamp) ?? '—'} · ${entry.actor}`,
            done: true,
          }))}
        />
        {history.length === 0 ? <EmptyNotice>Aucun événement émis pour ce contrat.</EmptyNotice> : null}
      </Panel>

      <Panel title="Versions et avenants" zone="table" tone="notice">
        Aucune table de versions ni de diff n’est exposée à l’ADMIN (GET /admin/contracts/:id/versions absent) : la référence de vie du contrat est l’historique réellement émis ci-dessus et le journal dédié. Aucune version n’est inventée.
      </Panel>

      <Panel title="Exécution — jalons mensuels" zone="table">
        <DataTable
          caption="Jalons mensuels réellement portés par le contrat"
          head={['Mois', 'Période', 'Démarré', `Réponse ${PRODUCT_LABELS.EMPLOYER.singular.toLowerCase()}`, `Réponse ${PRODUCT_LABELS.CANDIDATE.singular.toLowerCase()}`, 'Confirmé', 'Divergence', 'Arbitré']}
          rows={contract.monthlyCheckpoints.map((checkpoint) => [
            <span key="m" className="lbm-mono">{String(checkpoint.monthNumber)}</span>,
            <span key="p" className="lbm-mono">{checkpoint.periodKey}</span>,
            formatBoolean(checkpoint.isStarted),
            formatYesNo(checkpoint.employerStartAnswer),
            formatYesNo(checkpoint.employeeStartAnswer),
            formatBoolean(checkpoint.startConfirmed),
            formatBoolean(checkpoint.startDivergence),
            formatBoolean(checkpoint.resolvedByAdmin),
          ])}
          empty={<EmptyNotice>Aucun jalon mensuel n’est porté par ce contrat.</EmptyNotice>}
        />
        <p className="lbm-caption lbm-muted">
          Les montants des jalons (salaire, parts, commissions) ne sont pas rendus ici : le domaine paiement relance la tranche P4B-2. Les faits affichés sont les réponses réellement stockées sur le contrat.
        </p>
      </Panel>

      <Panel title="Pièces liées" zone="doc" tone="notice">
        La lecture ADMIN des documents n’offre aucun filtrage par contrat : la route existante (admin.documents.list, permission documents:read:any) ne rattache pas les pièces au contrat consulté. Aucune liste de pièces n’est présentée plutôt que de risquer un rattachement faux.
      </Panel>

      <Panel title="Références réelles du dossier" zone="list">
        <KeyValues
          title="Références"
          items={[
            { label: 'Claim rattaché (référence)', value: contract.incidentId ?? null },
            { label: `${PRODUCT_LABELS.REPLACEMENT.singular} lié`, value: contract.replacementId ?? null },
            { label: 'Contrat remplacé', value: contract.replacedContractId ?? null },
          ]}
        />
        <p className="lbm-caption lbm-muted">
          {actor
            ? `Permissions de la session (dérivées serveur) : ${actor.permissions.join(', ') || '—'}`
            : '—'}
        </p>
      </Panel>

      <ActionRow>
        <Link href="/admin/contrats" className="lbm-admin__link">Retour au registre</Link>
        <Link href={`/admin/contrats/${encodeURIComponent(contract.id)}/incidents`} className="lbm-admin__link">
          {ADMIN_UI_TERMS.CONTRACT_INCIDENTS}
        </Link>
        <Link href={`/admin/contrats/${encodeURIComponent(contract.id)}/journal`} className="lbm-admin__link">
          {ADMIN_UI_TERMS.CONTRACT_JOURNAL}
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-14" items={gaps} />
    </>
  );
}

/* ─────────────────────── ADM-15 · incidents (Claims du contrat) ─────────────────── */

function claimsForContract(claims: readonly ClaimView[], contractId: string): ClaimView[] {
  return claims.filter((claim) => claim.contractId === contractId);
}

export function Admin15ContractIncidents({ unitId, pathname, params }: AdminUnitProps) {
  const contracts = useContractsPage();
  const claims = useAdminResource<AdminPage<ClaimView>>(loadClaimsPage, []);
  const contractId = params.id ?? '';
  const gaps = adminGapsFor(unitId, pathname);

  if (contracts.status === 'error') return <SystemFeedback {...contracts.error!} retry={contracts.reload} />;
  if (contracts.status === 'loading' || !contracts.items) return <LoadingBlock label={ADMIN_UI_TERMS.CONTRACT_INCIDENTS} rows={4} />;
  if (claims.status === 'error') return <SystemFeedback {...claims.error!} retry={claims.reload} />;

  const contract = findContract(contracts.items, contractId);
  if (!contract) {
    return (
      <>
        <PageHead title={ADMIN_UI_TERMS.CONTRACT_INCIDENTS} lede={`Référence : ${contractId}`} seal={{ tone: 'slate', label: 'Hors page chargée' }} />
        <ContractMissingNotice contractId={contractId} />
        <ActionRow>
          <Link href="/admin/contrats" className="lbm-admin__link">Retour au registre</Link>
          <RetryButton onClick={contracts.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · ADM-15" items={gaps} />
      </>
    );
  }

  const openStatuses: readonly ClaimView['status'][] = ['OPEN', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'ADMIN_REVIEW'];
  const contractClaims = claims.data ? claimsForContract(claims.data.items, contractId) : null;
  const openCount = contractClaims?.filter((claim) => openStatuses.includes(claim.status)).length ?? 0;

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.CONTRACT_INCIDENTS} — ${contract.id}`}
        lede="Suivi des incidents du contrat : Claims réellement rattachés, lus via la route ADMIN existante, filtrés localement sur la page chargée."
        seal={{ tone: CONTRACT_STATUS_TONES[contract.status] ?? 'slate', label: CONTRACT_STATUS_LABELS[contract.status] ?? contract.status }}
      />

      <KpiRow
        items={[
          { label: 'CLAIMS DU CONTRAT (PAGE)', value: contractClaims === null ? '—' : String(contractClaims.length) },
          { label: 'OUVERTS', value: contractClaims === null ? '—' : String(openCount) },
        ]}
      />

      {claims.status === 'loading' || !claims.data ? (
        <LoadingBlock label="Chargement des Claims" rows={3} />
      ) : (
        <DataTable
          caption="Claims rattachés au contrat (page réellement chargée)"
          head={['Référence', 'Type', 'Statut', 'Créé le', 'Échéance justificatif', 'Résolu le']}
          rows={(contractClaims ?? []).map((claim) => [
            <span key="id" className="lbm-mono">{claim.claimId}</span>,
            <span key="type">{CLAIM_TYPE_LABELS[claim.type] ?? claim.type} <span className="lbm-mono lbm-caption">({claim.type})</span></span>,
            <span key="status">
              <StatusSeal tone={CLAIM_STATUS_TONES[claim.status] ?? 'slate'} label={CLAIM_STATUS_LABELS[claim.status] ?? claim.status} size="sm" />
              <span className="lbm-mono lbm-caption"> {claim.status}</span>
            </span>,
            formatDate(claim.createdAt) ?? '—',
            formatDate(claim.dueAt) ?? '—',
            formatDate(claim.resolvedAt) ?? '—',
          ])}
          empty={<EmptyNotice>Aucun Claim rattaché à ce contrat dans la page réellement chargée — et aucun incident ouvert : le statut du contrat ne porte aucun drapeau.</EmptyNotice>}
        />
      )}

      {contract.incidentId ? (
        <Panel title="Référence d’incident portée par le contrat" zone="list">
          <KeyValues
            title="Référence d’incident"
            items={[{ label: 'Référence serveur', value: contract.incidentId }]}
          />
        </Panel>
      ) : null}

      <Panel title="Actions préventives et score de risque" zone="kpi" tone="notice">
        Aucun endpoint de score de risque ni d’action préventive n’existe côté serveur : rien n’est calculé ni proposé ici. L’engagement d’une action sur un Claim (revue, arbitrage, restriction) est gouverné par le backend et relève d’une autre tranche.
      </Panel>

      <ActionRow>
        <Link href={`/admin/contrats/${encodeURIComponent(contract.id)}`} className="lbm-admin__link">Retour à la fiche</Link>
        <RetryButton onClick={() => { claims.reload(); contracts.reload(); }} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-15" items={gaps} />
    </>
  );
}

/* ───────────────────── ADM-16 · révision forcée (capacité absente) ─────────────────── */

export function Admin16ContractForcedRevision({ unitId, pathname, params }: AdminUnitProps) {
  const contracts = useContractsPage();
  const contractId = params.id ?? '';
  const gaps = adminGapsFor(unitId, pathname);

  if (contracts.status === 'error') return <SystemFeedback {...contracts.error!} retry={contracts.reload} />;
  if (contracts.status === 'loading' || !contracts.items) return <LoadingBlock label={ADMIN_UI_TERMS.CONTRACT_FORCED_REVISION} rows={3} />;

  const contract = findContract(contracts.items, contractId);

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.CONTRACT_FORCED_REVISION} — indisponible`}
        lede="Aucune révision ADMIN d’un contrat n’existe dans le produit : la fiche est rendue en capacité indisponible, sans formulaire simulé."
        seal={{ tone: 'clay', label: 'Capacité absente' }}
      />

      <Panel title="Contexte réel (lecture seule)" zone="hero">
        {contract ? (
          <KeyValues
            title="Contrat"
            items={[
              { label: 'Référence', value: contract.id },
              { label: 'Statut', value: CONTRACT_STATUS_LABELS[contract.status] ?? contract.status },
              { label: PRODUCT_LABELS.EMPLOYER.singular, value: contract.employerName || null },
              { label: PRODUCT_LABELS.CANDIDATE.singular, value: contract.employeeName || null },
            ]}
          />
        ) : (
          <ContractMissingNotice contractId={contractId} />
        )}
      </Panel>

      <Panel title="Ce que la fiche décrit — et ce qui manque" zone="form" tone="notice">
        La fiche de design prévoit une procédure encadrée (base légale référencée, motif détaillé, nouvelle version produite, double contre-signature, notification aux deux parties, voie de recours). Aucune de ces capacités n’a de route serveur : aucune saisie n’est ouverte, aucune version n’est produite, aucune notification n’est émise. Le registre est en lecture majoritaire : les modifications d’un contrat passent par les flux métier tracés des parties, jamais par une écriture ADMIN directe.
      </Panel>

      <ActionRow>
        <Link href={`/admin/contrats/${encodeURIComponent(contractId)}`} className="lbm-admin__link">Retour à la fiche</Link>
        <Link href="/admin/contrats" className="lbm-admin__link">Retour au registre</Link>
        <RetryButton onClick={contracts.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-16" items={gaps} />
    </>
  );
}

/* ─────────────────────── ADM-17 · journal (historique émis) ─────────────────────── */

export function Admin17ContractJournal({ unitId, pathname, params }: AdminUnitProps) {
  const resource = useContractsPage();
  const contractId = params.id ?? '';
  const gaps = adminGapsFor(unitId, pathname);
  const contract = resource.items ? findContract(resource.items, contractId) : null;
  const history = contract?.history ?? [];
  const actors = [...new Set(history.map((entry) => entry.actor))];
  const [actor, setActor] = useState<string>('all');
  const visible = actor === 'all' ? history : history.filter((entry) => entry.actor === actor);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.items) return <LoadingBlock label={ADMIN_UI_TERMS.CONTRACT_JOURNAL} rows={4} />;

  if (!contract) {
    return (
      <>
        <PageHead title={ADMIN_UI_TERMS.CONTRACT_JOURNAL} lede={`Référence : ${contractId}`} seal={{ tone: 'slate', label: 'Hors page chargée' }} />
        <ContractMissingNotice contractId={contractId} />
        <ActionRow>
          <Link href="/admin/contrats" className="lbm-admin__link">Retour au registre</Link>
          <RetryButton onClick={resource.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · ADM-17" items={gaps} />
      </>
    );
  }

  const first = history.length > 0 ? history[0].timestamp : null;
  const last = history.length > 0 ? history[history.length - 1].timestamp : null;

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.CONTRACT_JOURNAL} — ${contract.id}`}
        lede="Historique réellement émis par les services lors des transitions du contrat (DTO Contrat). Ce n’est pas un event store chaîné : la vérification d’intégrité décrite par la fiche n’existe pas côté serveur."
        seal={{ tone: 'slate', label: 'Écrit par les services' }}
      />

      <KpiRow
        items={[
          { label: 'ÉVÉNEMENTS', value: String(history.length) },
          { label: 'PREMIER', value: first ? formatDateTime(first) ?? '—' : '—' },
          { label: 'DERNIER', value: last ? formatDateTime(last) ?? '—' : '—' },
        ]}
      />

      {actors.length > 1 ? (
        <FilterChips
          label="Filtrer par acteur (valeurs réellement émises)"
          options={[{ id: 'all', label: 'Tous' }, ...actors.map((value) => ({ id: value, label: value }))]}
          value={actor}
          onChange={setActor}
        />
      ) : null}

      <DataTable
        caption="Journal — historique du contrat réellement émis"
        head={['Horodatage', 'Événement', 'Description', 'Acteur']}
        rows={visible.map((entry) => [
          <span key="ts" className="lbm-mono">{formatDateTime(entry.timestamp) ?? entry.timestamp}</span>,
          <span key="ev" className="lbm-mono">{entry.event}</span>,
          entry.description,
          <span key="actor" className="lbm-mono">{entry.actor}</span>,
        ])}
        empty={<EmptyNotice>Aucun événement : contrat tout juste créé ou historique non porté par la page chargée.</EmptyNotice>}
      />

      <Panel title="Vérification et export" zone="cta" tone="notice">
        Vérifier la chaîne d’empreintes et exporter un JSON signé sont des capacités décrites par la fiche, absentes du produit : aucun recalcul n’est simulé dans l’interface (la vérification est un fait serveur), aucun export n’est produit.
      </Panel>

      <ActionRow>
        <Link href={`/admin/contrats/${encodeURIComponent(contract.id)}`} className="lbm-admin__link">Retour à la fiche</Link>
        <Link href="/admin/contrats" className="lbm-admin__link">Retour au registre</Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-17" items={gaps} />
    </>
  );
}
