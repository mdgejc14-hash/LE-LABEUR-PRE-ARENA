/**
 * P4E-1-DESIGN-ADMIN-REPLACEMENTS — unité exacte du Master
 * « ADM — remplacements (file & arbitrage) » : ADM-31 (file & suivi),
 * ADM-32 (suivi détaillé, variante d'ADM-31) et ADM-33 (arbitrage).
 *
 * LECTURE SEULE du workflow existant :
 *  - dossier : admin.replacements.list / admin.replacements.read
 *    (replacements:read:any, revérifiée par `replacementRepository`) ;
 *  - Claim d'origine : admin.claims.read (incidents:read:any) ;
 *  - Contrats source et successeur : page chargée de admin.contracts.list
 *    (contracts:read:any) — aucune lecture unitaire ADMIN de Contrat n'existe ;
 *  - Proposition sélectionnée : page chargée de admin.proposals.list
 *    (applications:read:any) ;
 *  - Paiements : page chargée de admin.payments.list (payments:read:any),
 *    filtrée par Contrat, sans total, sans fusion, sans transfert.
 *
 * Aucune commande n'est envoyée par cette tranche : les routes déclarées
 * admin.replacements.assign / transfer / finalize n'ont volontairement aucun
 * handler (le consentement du Candidat passe par la Proposition) et ne sont
 * jamais appelées ; l'arbitrage (ADM-33) n'a aucune route serveur. La décision
 * REPLACE d'un Claim (qui ouvre le dossier) n'est pas rendue ici. Aucune
 * transition n'est déduite dans le navigateur : statut serveur affiché tel quel,
 * Proposition envoyée ≠ acceptée, Contrat successeur DRAFT ≠ actif.
 */

import { useCallback, useState } from 'react';
import type { ClaimStatus } from '../../backend/disputes/records';
import { REPLACEMENT_STATUS_VALUES } from '../../backend/replacements/records';
import type { ContractStatus } from '../../types';
import type {
  AdminApi,
  AdminPage,
  ClaimView,
  Contract,
  MissionProposal,
  PaymentView,
  ReplacementDossier,
} from '../api';
import {
  ActionError,
  ActionRow,
  DataTable,
  EmptyNotice,
  Field,
  GapNotice,
  KeyValues,
  KpiRow,
  Link,
  LoadingBlock,
  NeoPressButton,
  PageHead,
  Panel,
  RetryButton,
  StatusSeal,
  Timeline,
} from '../components';
import { useAdminAction, useAdminApi, useAdminResource } from '../hooks';
import { adminGapsFor } from '../screenMap';
import { useAdminActor } from '../UnitBoundary';
import type { AdminUnitProps } from '../types';
import {
  ADMIN_UI_TERMS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_TONES,
  CLAIM_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  PRODUCT_LABELS,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_TONES,
  REPLACEMENT_NEXT_STEP,
  REPLACEMENT_STATUS_LABELS,
  REPLACEMENT_STATUS_TONES,
  formatDateTime,
  formatPaymentAmount,
  type ReplacementStatus,
} from '../vocabulary';
import { SystemFeedback } from '../../public/SystemFeedback';

const PAGE_LIMIT = 100;
export const REPLACEMENT_READ_PERMISSION = 'replacements:read:any';
const CLAIM_READ_PERMISSION = 'incidents:read:any';
const CONTRACT_READ_PERMISSION = 'contracts:read:any';
const PROPOSAL_READ_PERMISSION = 'applications:read:any';
const PAYMENT_READ_PERMISSION = 'payments:read:any';

/** Statuts du dossier où une Proposition a été acceptée par le Candidat (posés par `acceptProposal`). */
const PROPOSAL_ACCEPTED_STATUSES: readonly ReplacementStatus[] = ['TRANSFERRED_TO_EMPLOYER', 'CONTRACT_FINALIZED'];

function has(permissions: readonly string[] | undefined, permission: string): boolean {
  return Boolean(permissions?.includes(permission));
}

function formatWhen(value: string | undefined): string {
  return formatDateTime(value) ?? '—';
}

function AccessDenied() {
  return <SystemFeedback state="403" />;
}

function replacementSeal(status: ReplacementStatus) {
  return (
    <span className="lbm-admin__replacement-status" aria-label={`Statut ${REPLACEMENT_STATUS_LABELS[status]} (${status})`}>
      <StatusSeal tone={REPLACEMENT_STATUS_TONES[status]} label={REPLACEMENT_STATUS_LABELS[status]} size="sm" />
      <code className="lbm-mono lbm-caption">{status}</code>
    </span>
  );
}

function contractSeal(status: ContractStatus) {
  return (
    <span className="lbm-admin__replacement-status" aria-label={`Statut ${CONTRACT_STATUS_LABELS[status]} (${status})`}>
      <StatusSeal tone={CONTRACT_STATUS_TONES[status]} label={CONTRACT_STATUS_LABELS[status]} size="sm" />
      <code className="lbm-mono lbm-caption">{status}</code>
    </span>
  );
}

function claimSeal(status: ClaimStatus) {
  return (
    <span className="lbm-admin__replacement-status" aria-label={`Statut ${CLAIM_STATUS_LABELS[status]} (${status})`}>
      <StatusSeal tone={CLAIM_STATUS_TONES[status]} label={CLAIM_STATUS_LABELS[status]} size="sm" />
      <code className="lbm-mono lbm-caption">{status}</code>
    </span>
  );
}

function isKnownStatus(value: string): value is ReplacementStatus {
  return (REPLACEMENT_STATUS_VALUES as readonly string[]).includes(value);
}

/* ───────────────────────────── ADM-31 · file & suivi ───────────────────────────── */

interface ReplacementPageState {
  readonly items: readonly ReplacementDossier[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
  readonly persistence?: string;
}

async function loadReplacements(api: AdminApi, signal: AbortSignal): Promise<ReplacementPageState> {
  const page = await api.replacements({ limit: PAGE_LIMIT, signal });
  return { items: page.items, cursor: page.cursor, hasMore: page.hasMore, persistence: page.persistence };
}

function useReplacementPages() {
  const api = useAdminApi();
  const resource = useAdminResource<ReplacementPageState>(loadReplacements, []);
  const nextPage = useAdminAction<AdminPage<ReplacementDossier>>();
  const [additional, setAdditional] = useState<readonly ReplacementDossier[]>([]);
  const [pageState, setPageState] = useState<{ cursor: string | null; hasMore: boolean } | null>(null);

  const items = resource.data ? [...resource.data.items, ...additional] : null;
  const cursor = pageState ? pageState.cursor : resource.data?.cursor ?? null;
  const hasMore = pageState ? pageState.hasMore : resource.data?.hasMore ?? false;

  const loadMore = useCallback(() => {
    // Single-flight : aucun second appel tant que la page suivante est en cours.
    if (!api || !cursor || !hasMore || nextPage.busy) return;
    void nextPage.run((signal) => api.replacements({ limit: PAGE_LIMIT, cursor, signal })).then((page) => {
      if (!page) return;
      setAdditional((previous) => [...previous, ...page.items]);
      setPageState({ cursor: page.cursor, hasMore: page.hasMore });
    });
  }, [api, cursor, hasMore, nextPage.busy, nextPage.run]);

  const reload = useCallback(() => {
    setAdditional([]);
    setPageState(null);
    nextPage.reset();
    resource.reload();
  }, [nextPage.reset, resource.reload]);

  return {
    status: resource.status,
    error: resource.error,
    persistence: resource.data?.persistence,
    items,
    hasMore,
    loadMore,
    loadMoreBusy: nextPage.busy,
    loadMoreError: nextPage.error,
    reload,
  };
}

function filterReplacements(items: readonly ReplacementDossier[], query: string, status: string): ReplacementDossier[] {
  const needle = query.trim().toLocaleLowerCase('fr-FR');
  return items.filter((dossier) => {
    if (status !== 'all' && dossier.status !== status) return false;
    if (!needle) return true;
    return [
      dossier.id,
      dossier.claimId ?? dossier.incidentId,
      dossier.originalContractId,
      dossier.newContractId ?? '',
      dossier.employerId,
      dossier.employerName,
      dossier.urgentOfferTitle ?? '',
      dossier.selectedCandidateId ?? '',
      dossier.selectedCandidateName ?? '',
    ].some((value) => value.toLocaleLowerCase('fr-FR').includes(needle));
  });
}

/** Claim d'origine : champ canonique `claimId`, alias historique `incidentId` (même valeur côté serveur). */
function sourceClaimId(dossier: ReplacementDossier): string {
  return dossier.claimId ?? dossier.incidentId;
}

export function Admin31ReplacementRegistry(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, REPLACEMENT_READ_PERMISSION)) return <AccessDenied />;
  return <Admin31ReplacementRegistryContent {...props} />;
}

function Admin31ReplacementRegistryContent({ unitId, pathname }: AdminUnitProps) {
  const resource = useReplacementPages();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('all');
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.items) return <LoadingBlock label="Chargement des Remplacements" rows={5} />;

  const loaded = resource.items;
  const visible = filterReplacements(loaded, query, status);
  const count = (statuses: readonly ReplacementStatus[]) => String(loaded.filter((dossier) => statuses.includes(dossier.status)).length);
  const notConfigured = resource.persistence === 'not-configured';

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.REPLACEMENT_REGISTRY}
        lede={`${loaded.length} dossier(s) de Remplacement renvoyé(s) sur les pages réellement chargées · recherche et filtre locaux`}
        seal={{ tone: 'gold', label: 'File ADMIN réelle' }}
      />

      <KpiRow items={[
        { label: 'DOSSIERS CHARGÉS', value: notConfigured ? '—' : String(loaded.length) },
        { label: 'SANS CANDIDAT SÉLECTIONNÉ (PAGE)', value: notConfigured ? '—' : count(['PENDING_OFFER', 'SOURCING_CANDIDATES']) },
        { label: 'PROPOSITION EN COURS (PAGE)', value: notConfigured ? '—' : count(['CANDIDATE_SELECTED']) },
        { label: 'CONTRAT SUCCESSEUR CRÉÉ (PAGE)', value: notConfigured ? '—' : count(['CONTRACT_FINALIZED']) },
      ]} />

      <Panel title="Portée des repères" zone="kpi" tone="notice">
        Les comptes portent uniquement sur les dossiers réellement reçus avec le curseur courant, regroupés par statut serveur. Aucun total global, aucune ancienneté calculée, aucun dossier « contesté » ni taux de réussite ne sont fournis par le serveur.
      </Panel>

      <Panel title="Recherche et filtre locaux" zone="list">
        <div className="lbm-admin__replacement-filters">
          <Field label="Statut du Remplacement">
            <select aria-label="Filtrer par statut de Remplacement" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Tous les statuts</option>
              {REPLACEMENT_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>{REPLACEMENT_STATUS_LABELS[value]} · {value}</option>
              ))}
            </select>
          </Field>
          <Field label="Rechercher dans la page chargée">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Référence, Claim, Contrat, Employeur, Candidat…"
              aria-label="Rechercher un Remplacement dans les pages chargées"
            />
          </Field>
        </div>
        <p className="lbm-caption lbm-muted">Le serveur fournit l’ordre et le curseur officiels ; cette recherche ne couvre pas les dossiers hors page.</p>
      </Panel>

      {notConfigured ? (
        <EmptyNotice>Le serveur répond une frontière de contrôle sans persistance métier (`not-configured`). Aucun dossier de Remplacement réel n’est chargé ; cet état n’est pas présenté comme une file vide.</EmptyNotice>
      ) : (
        <DataTable
          caption="File ADMIN réelle des Remplacements (pages chargées)"
          head={['Référence', 'Claim d’origine', 'Contrat source', 'Offre de remplacement', 'Statut serveur', 'Candidat sélectionné', 'Ouvert le', 'Dossier']}
          rows={visible.map((dossier) => [
            <span key="id" className="lbm-mono">{dossier.id}</span>,
            <Link key="claim" href={`/admin/litiges/${encodeURIComponent(sourceClaimId(dossier))}`} className="lbm-admin__link lbm-mono">{sourceClaimId(dossier)}</Link>,
            <span key="contract" className="lbm-mono">{dossier.originalContractId}</span>,
            <span key="offer">{dossier.urgentOfferId ? (dossier.urgentOfferTitle ?? dossier.urgentOfferId) : 'Non publiée'}</span>,
            <span key="status">{isKnownStatus(dossier.status) ? replacementSeal(dossier.status) : <code className="lbm-mono">{String(dossier.status)}</code>}</span>,
            <span key="candidate">{dossier.selectedCandidateId ? (dossier.selectedCandidateName || dossier.selectedCandidateId) : '—'}</span>,
            <span key="opened" className="lbm-mono">{formatWhen(dossier.openedAt ?? dossier.createdAt)}</span>,
            <Link key="open" href={`/admin/remplacements/${encodeURIComponent(dossier.id)}`} className="lbm-admin__link" aria-label={`Ouvrir le dossier de Remplacement ${dossier.id}`}>Ouvrir</Link>,
          ])}
          empty={(
            <EmptyNotice>
              {loaded.length === 0
                ? 'La route ADMIN a renvoyé une collection vide pour les pages demandées.'
                : 'Aucun dossier de la page réelle ne correspond aux filtres locaux.'}
            </EmptyNotice>
          )}
        />
      )}

      <ActionRow>
        {resource.hasMore && !notConfigured ? (
          <NeoPressButton variant="ghost" onClick={resource.loadMore} loading={resource.loadMoreBusy} disabled={resource.loadMoreBusy}>
            Charger la page suivante
          </NeoPressButton>
        ) : null}
        <RetryButton onClick={resource.reload} />
        <Link href="/admin" className="lbm-admin__link">Retour à la supervision</Link>
      </ActionRow>
      {resource.loadMoreError ? <ActionError error={resource.loadMoreError} /> : null}
      <GapNotice title="BACKEND_GAP · ADM-31" items={gaps} />
    </>
  );
}

/* ───────────────────────────── ADM-32 · suivi détaillé ───────────────────────────── */

function useReplacementRecord(replacementId: string) {
  return useAdminResource<ReplacementDossier>((api, signal) => api.replacement(replacementId, signal), [replacementId]);
}

export function Admin32ReplacementSheet(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, REPLACEMENT_READ_PERMISSION)) return <AccessDenied />;
  return <ReplacementSheetContent {...props} permissions={actor?.permissions ?? []} />;
}

/** Déroulé : états réellement atteints selon les champs du dossier, sans date reconstituée. */
export function replacementWorkflowSteps(
  dossier: ReplacementDossier,
  successor: Contract | null,
): readonly { label: string; detail?: string; done: boolean }[] {
  const accepted = PROPOSAL_ACCEPTED_STATUSES.includes(dossier.status);
  return [
    {
      label: 'Dossier ouvert par la décision ADMIN REPLACE du Claim d’origine',
      detail: `${sourceClaimId(dossier)} · ouvert le ${formatWhen(dossier.openedAt ?? dossier.createdAt)}`,
      done: true,
    },
    {
      label: 'Contrat source passé à REPLACED',
      detail: dossier.originalContractId,
      done: true,
    },
    {
      label: 'Offre de remplacement publiée par l’Employeur',
      detail: dossier.urgentOfferId ?? 'Non publiée',
      done: Boolean(dossier.urgentOfferId),
    },
    {
      label: 'Candidature sélectionnée par l’Employeur',
      detail: dossier.selectedApplicationId ?? (accepted ? 'Référence non renvoyée' : 'Aucune sélection'),
      done: Boolean(dossier.selectedApplicationId) || accepted,
    },
    {
      label: 'Proposition émise au Candidat sélectionné',
      detail: dossier.selectedProposalId ?? 'Aucune Proposition liée',
      done: Boolean(dossier.selectedProposalId) || accepted,
    },
    {
      label: 'Proposition acceptée explicitement par le Candidat',
      detail: accepted ? 'Statut serveur postérieur à l’acceptation' : 'Réponse non reçue',
      done: accepted,
    },
    {
      label: 'Contrat successeur distinct créé',
      detail: dossier.newContractId ?? 'Non créé',
      done: Boolean(dossier.newContractId),
    },
    {
      label: 'Contrat successeur actif (cycle normal de signature)',
      detail: successor ? `${successor.status} · ${CONTRACT_STATUS_LABELS[successor.status]}` : dossier.newContractId ? 'Statut non lu' : 'Non applicable',
      done: successor?.status === 'ACTIVE',
    },
  ];
}

function ReplacementSheetContent({ unitId, pathname, params, permissions }: AdminUnitProps & { permissions: readonly string[] }) {
  const replacementId = params.id ?? '';
  const resource = useReplacementRecord(replacementId);
  const gaps = adminGapsFor(unitId, pathname);
  const [successor, setSuccessor] = useState<Contract | null>(null);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du dossier de Remplacement" rows={5} />;
  const dossier = resource.data;
  if (!dossier) {
    return <EmptyNotice>{`Aucun dossier de Remplacement ne correspond à ${replacementId} dans la réponse réelle de la route ADMIN.`}</EmptyNotice>;
  }
  const status = isKnownStatus(dossier.status) ? dossier.status : null;
  const claimId = sourceClaimId(dossier);

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.REPLACEMENT_SHEET} · ${dossier.id}`}
        lede="Dossier constitué exclusivement des champs renvoyés à l’ADMIN par le service de Remplacement, puis des lectures ADMIN existantes bloc par bloc."
        seal={status ? { tone: REPLACEMENT_STATUS_TONES[status], label: REPLACEMENT_STATUS_LABELS[status] } : undefined}
      />

      <Panel title="Dossier renvoyé par le serveur" zone="hero">
        <KeyValues
          title="Résumé du dossier de Remplacement"
          items={[
            { label: 'Référence du Remplacement', value: dossier.id },
            { label: 'Statut (code serveur)', value: String(dossier.status) },
            { label: 'Employeur', value: dossier.employerName ? `${dossier.employerName} · ${dossier.employerId}` : dossier.employerId },
            { label: 'Claim d’origine', value: claimId },
            { label: 'Contrat source', value: dossier.originalContractId },
            { label: 'Offre de remplacement', value: dossier.urgentOfferId ? `${dossier.urgentOfferTitle ?? '—'} · ${dossier.urgentOfferId}` : 'Non publiée' },
            { label: 'Candidature sélectionnée', value: dossier.selectedApplicationId ?? null },
            { label: 'Candidat sélectionné', value: dossier.selectedCandidateId ? `${dossier.selectedCandidateName || '—'} · ${dossier.selectedCandidateId}` : null },
            { label: 'Proposition liée', value: dossier.selectedProposalId ?? null },
            { label: 'Contrat successeur', value: dossier.newContractId ?? 'Non créé' },
            { label: 'Ouvert le', value: formatWhen(dossier.openedAt ?? dossier.createdAt) },
            { label: 'Dernière mise à jour', value: formatWhen(dossier.updatedAt) },
          ]}
        />
        <p className="lbm-caption lbm-muted">Aucun Paiement n’est porté par le dossier : chaque Paiement reste rattaché à son propre Contrat.</p>
      </Panel>

      <Panel title="Déroulé du workflow (états atteints)" zone="timeline">
        <Timeline steps={replacementWorkflowSteps(dossier, successor)} />
        {status ? (
          <p className="lbm-body" data-next-step={status}>{`Étape suivante (acteur fixé par le serveur) : ${REPLACEMENT_NEXT_STEP[status]}`}</p>
        ) : null}
        <p className="lbm-caption lbm-muted">Aucune commande ADMIN n’existe à ces étapes : pas d’assignation directe, pas de transfert direct de Candidat, pas de finalisation ADMIN. Les étapes ne sont pas horodatées par l’API.</p>
      </Panel>

      {has(permissions, CLAIM_READ_PERMISSION)
        ? <SourceClaimBlock claimId={claimId} dossier={dossier} />
        : <PermissionBlock title={`${PRODUCT_LABELS.CLAIM.singular} d’origine`} permission={CLAIM_READ_PERMISSION} />}

      {has(permissions, CONTRACT_READ_PERMISSION)
        ? <ContractsBlock dossier={dossier} onSuccessor={setSuccessor} />
        : <PermissionBlock title="Contrat source et Contrat successeur" permission={CONTRACT_READ_PERMISSION} />}

      {has(permissions, PROPOSAL_READ_PERMISSION)
        ? <ProposalBlock dossier={dossier} />
        : <PermissionBlock title="Proposition liée" permission={PROPOSAL_READ_PERMISSION} />}

      {has(permissions, PAYMENT_READ_PERMISSION)
        ? <PaymentsBlock dossier={dossier} />
        : <PermissionBlock title="Paiements par Contrat" permission={PAYMENT_READ_PERMISSION} />}

      <ActionRow>
        <Link href="/admin/remplacements" className="lbm-admin__link">Retour aux Remplacements</Link>
        <Link href={`/admin/litiges/${encodeURIComponent(claimId)}`} className="lbm-admin__link">Ouvrir le Claim d’origine</Link>
        <Link href={`/admin/contrats/${encodeURIComponent(dossier.originalContractId)}`} className="lbm-admin__link">Fiche du Contrat source</Link>
        {dossier.newContractId ? (
          <Link href={`/admin/contrats/${encodeURIComponent(dossier.newContractId)}`} className="lbm-admin__link">Fiche du Contrat successeur</Link>
        ) : null}
        <Link href={`/admin/remplacements/${encodeURIComponent(dossier.id)}/arbitrage`} className="lbm-admin__link">Arbitrage (indisponible)</Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-32" items={gaps} />
    </>
  );
}

function PermissionBlock({ title, permission }: { title: string; permission: string }) {
  return (
    <Panel title={title} zone="table">
      <p className="lbm-body" data-permission-missing={permission}>{`La permission serveur ${permission} est absente de cette session : ce bloc n’est pas chargé.`}</p>
    </Panel>
  );
}

function BlockState({ status, error, reload, label }: { status: string; error: { state: string; correlationId?: string } | null; reload: () => void; label: string }) {
  if (status === 'loading') return <LoadingBlock label={label} rows={3} />;
  if (status === 'error' && error) {
    return (
      <>
        <ActionError error={error} />
        <RetryButton onClick={reload} />
      </>
    );
  }
  return null;
}

function SourceClaimBlock({ claimId, dossier }: { claimId: string; dossier: ReplacementDossier }) {
  const resource = useAdminResource<ClaimView>((api, signal) => api.claim(claimId, signal), [claimId]);
  const claim = resource.data;
  return (
    <Panel title={`${PRODUCT_LABELS.CLAIM.singular} d’origine`} zone="table">
      <div data-block="claim" data-block-state={resource.status}>
        <BlockState status={resource.status} error={resource.error} reload={resource.reload} label="Chargement du Claim d’origine" />
        {resource.status === 'ready' && claim ? (
          <>
            <KeyValues
              title="Claim d’origine (admin.claims.read)"
              items={[
                { label: 'Référence Claim', value: claim.claimId },
                { label: 'Type (code produit)', value: `${CLAIM_TYPE_LABELS[claim.type]} · ${claim.type}` },
                { label: 'Contrat du Claim', value: claim.contractId },
                { label: 'Contrat du Claim = Contrat source', value: claim.contractId === dossier.originalContractId ? 'Oui' : 'Non — écart renvoyé par le serveur' },
                { label: 'Remplacement lié au Claim', value: claim.replacementId ?? 'Non renvoyé' },
                { label: 'Résolu le', value: claim.resolvedAt ? formatWhen(claim.resolvedAt) : null },
              ]}
            />
            <p className="lbm-body">{claimSeal(claim.status)}</p>
            <p className="lbm-caption lbm-muted">Le motif, les justificatifs et la décision se consultent sur la fiche du Claim ; aucune référence opaque n’est affichée ici.</p>
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function ContractsBlock({ dossier, onSuccessor }: { dossier: ReplacementDossier; onSuccessor: (contract: Contract | null) => void }) {
  const resource = useAdminResource<AdminPage<Contract>>(async (api, signal) => {
    const page = await api.contracts({ limit: PAGE_LIMIT, signal });
    const successor = dossier.newContractId ? page.items.find((item) => item.id === dossier.newContractId) ?? null : null;
    onSuccessor(successor);
    return page;
  }, [dossier.id, dossier.originalContractId, dossier.newContractId]);
  const page = resource.data;
  const source = page?.items.find((item) => item.id === dossier.originalContractId) ?? null;
  const successor = dossier.newContractId ? page?.items.find((item) => item.id === dossier.newContractId) ?? null : null;
  const notConfigured = page?.persistence === 'not-configured';

  const row = (role: string, reference: string | undefined, contract: Contract | null) => [
    <span key="role">{role}</span>,
    <span key="ref" className="lbm-mono">{reference ?? '—'}</span>,
    <span key="status">{contract ? contractSeal(contract.status) : reference ? 'Hors page chargée' : 'Non créé'}</span>,
    <span key="candidate">{contract ? contract.employeeName || contract.employeeId : '—'}</span>,
    <span key="link" className="lbm-mono">{contract?.replacementId ?? '—'}</span>,
  ];

  return (
    <Panel title="Contrat source et Contrat successeur" zone="table">
      <div data-block="contracts" data-block-state={resource.status}>
        <BlockState status={resource.status} error={resource.error} reload={resource.reload} label="Chargement des Contrats" />
        {resource.status === 'ready' && page ? (
          notConfigured ? (
            <EmptyNotice>admin.contracts.list répond une frontière de contrôle (`not-configured`) : aucun Contrat n’est lisible.</EmptyNotice>
          ) : (
            <>
              <DataTable
                caption="Contrats liés au Remplacement (page chargée de admin.contracts.list)"
                head={['Rôle', 'Référence', 'Statut serveur', 'Candidat', 'Remplacement lié']}
                rows={[
                  row('Contrat source', dossier.originalContractId, source),
                  row('Contrat successeur', dossier.newContractId, successor),
                ]}
              />
              <p className="lbm-caption lbm-muted">
                Deux Contrats distincts : le Contrat source garde son statut REPLACED ; le Contrat successeur naît en brouillon (DRAFT) et ne devient actif qu’après son cycle normal de signature. Un Contrat absent de la page chargée n’est jamais relu par une route réservée aux parties.
              </p>
              {successor && successor.status !== 'ACTIVE' ? (
                <p className="lbm-body" data-successor-inactive={successor.status}>{`Contrat successeur non actif : statut serveur ${successor.status} (${CONTRACT_STATUS_LABELS[successor.status]}).`}</p>
              ) : null}
              <ContractHistory title="Historique émis sur le Contrat source (événements de Remplacement)" contract={source} filter={(event) => event.includes('REPLAC')} />
              <ContractHistory title="Historique émis sur le Contrat successeur" contract={successor} filter={() => true} />
            </>
          )
        ) : null}
      </div>
    </Panel>
  );
}

function ContractHistory({ title, contract, filter }: { title: string; contract: Contract | null; filter: (event: string) => boolean }) {
  if (!contract) return null;
  const entries = (contract.history ?? []).filter((entry) => filter(entry.event));
  return (
    <DataTable
      caption={title}
      head={['Horodatage', 'Événement', 'Description', 'Acteur']}
      rows={entries.map((entry) => [
        <span key="at" className="lbm-mono">{formatWhen(entry.timestamp)}</span>,
        <code key="event" className="lbm-mono lbm-caption">{entry.event}</code>,
        <span key="description">{entry.description}</span>,
        <span key="actor">{entry.actor}</span>,
      ])}
      empty={<EmptyNotice>Aucune entrée correspondante dans l’historique renvoyé pour ce Contrat.</EmptyNotice>}
    />
  );
}

function ProposalBlock({ dossier }: { dossier: ReplacementDossier }) {
  if (!dossier.selectedProposalId) {
    const accepted = PROPOSAL_ACCEPTED_STATUSES.includes(dossier.status);
    return (
      <Panel title="Proposition liée" zone="table">
        <p className="lbm-body" data-block="proposal" data-block-state="none">
          {accepted
            ? 'Le dossier indique une Proposition acceptée, mais aucune référence de Proposition n’est renvoyée.'
            : 'Aucune Proposition n’est liée au dossier : aucune réponse du Candidat n’est attendue ni déduite.'}
        </p>
      </Panel>
    );
  }
  return <SelectedProposalBlock proposalId={dossier.selectedProposalId} />;
}

function SelectedProposalBlock({ proposalId }: { proposalId: string }) {
  const resource = useAdminResource<AdminPage<MissionProposal>>((api, signal) => api.proposals({ limit: PAGE_LIMIT, signal }), [proposalId]);
  const proposal = resource.data?.items.find((item) => item.id === proposalId) ?? null;
  return (
    <Panel title="Proposition liée" zone="table">
      <div data-block="proposal" data-block-state={resource.status}>
        <BlockState status={resource.status} error={resource.error} reload={resource.reload} label="Chargement de la Proposition" />
        {resource.status === 'ready' ? (
          proposal ? (
            <>
              <KeyValues
                title="Proposition (admin.proposals.list)"
                items={[
                  { label: 'Référence Proposition', value: proposal.id },
                  { label: 'Statut (code serveur)', value: proposal.status },
                  { label: 'Candidat destinataire', value: `${proposal.employeeName || '—'} · ${proposal.employeeId}` },
                  { label: 'Candidature', value: proposal.applicationId ?? null },
                  { label: 'Envoyée le', value: formatWhen(proposal.sentAt) },
                  { label: 'Dernière mise à jour', value: formatWhen(proposal.updatedAt) },
                  { label: 'Contrat issu de la Proposition', value: proposal.contractId ?? 'Aucun' },
                ]}
              />
              <p className="lbm-body">
                <StatusSeal tone={PROPOSAL_STATUS_TONES[proposal.status]} label={PROPOSAL_STATUS_LABELS[proposal.status]} size="sm" />{' '}
                <code className="lbm-mono lbm-caption">{proposal.status}</code>
              </p>
              <p className="lbm-caption lbm-muted">Une Proposition envoyée n’est pas une acceptation : seule la réponse explicite du Candidat, enregistrée par le serveur, fait évoluer le dossier.</p>
            </>
          ) : (
            <EmptyNotice>{`La Proposition ${proposalId} est hors de la page chargée de admin.proposals.list : son statut n’est pas affiché.`}</EmptyNotice>
          )
        ) : null}
      </div>
    </Panel>
  );
}

function PaymentsBlock({ dossier }: { dossier: ReplacementDossier }) {
  const resource = useAdminResource<AdminPage<PaymentView>>((api, signal) => api.payments({ limit: PAGE_LIMIT, signal }), [dossier.id]);
  const page = resource.data;
  const notConfigured = page?.persistence === 'not-configured';
  const forContract = (contractId: string | undefined) => (contractId && page ? page.items.filter((payment) => payment.contractId === contractId) : []);
  const table = (caption: string, payments: readonly PaymentView[], emptyText: string) => (
    <DataTable
      caption={caption}
      head={['Référence Paiement', 'Contrat', 'Nature', 'Période', 'Montant unitaire serveur', 'État du Paiement']}
      rows={payments.map((payment) => [
        <span key="id" className="lbm-mono">{payment.paymentId}</span>,
        <span key="contract" className="lbm-mono">{payment.contractId}</span>,
        <span key="type">{PAYMENT_TYPE_LABELS[payment.paymentType]?.label ?? payment.paymentType} <code className="lbm-mono lbm-caption">{payment.paymentType}</code></span>,
        <span key="period" className="lbm-mono">{payment.periodKey}</span>,
        <span key="amount" className="lbm-mono">{formatPaymentAmount(payment.amount, payment.currency)}</span>,
        <span key="status">{PAYMENT_STATUS_LABELS[payment.status] ?? payment.status} <code className="lbm-mono lbm-caption">{payment.status}</code></span>,
      ])}
      empty={<EmptyNotice>{emptyText}</EmptyNotice>}
    />
  );
  return (
    <Panel title="Paiements par Contrat (lecture seule)" zone="table">
      <div data-block="payments" data-block-state={resource.status}>
        <BlockState status={resource.status} error={resource.error} reload={resource.reload} label="Chargement des Paiements" />
        {resource.status === 'ready' && page ? (
          notConfigured ? (
            <EmptyNotice>admin.payments.list répond une frontière de contrôle (`not-configured`) : aucun Paiement n’est lisible.</EmptyNotice>
          ) : (
            <>
              {table('Paiements du Contrat source (page chargée)', forContract(dossier.originalContractId), 'Aucun Paiement du Contrat source dans la page chargée.')}
              {table(
                'Paiements du Contrat successeur (page chargée)',
                forContract(dossier.newContractId),
                dossier.newContractId ? 'Aucun Paiement du Contrat successeur dans la page chargée.' : 'Aucun Contrat successeur : aucun Paiement ne peut lui être rattaché.',
              )}
              <p className="lbm-caption lbm-muted" data-no-payment-transfer="true">
                Aucun Paiement n’est transféré d’un Contrat à l’autre : chaque Paiement reste rattaché à son Contrat d’origine. Aucun total, aucune fusion et aucun solde ne sont calculés.
              </p>
            </>
          )
        ) : null}
      </div>
    </Panel>
  );
}

/* ───────────────────────────── ADM-33 · arbitrage ───────────────────────────── */

export function Admin33ReplacementArbitration(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, REPLACEMENT_READ_PERMISSION)) return <AccessDenied />;
  return <ReplacementArbitrationContent {...props} />;
}

function ReplacementArbitrationContent({ unitId, pathname, params }: AdminUnitProps) {
  const replacementId = params.id ?? '';
  const resource = useReplacementRecord(replacementId);
  const gaps = adminGapsFor(unitId, pathname);
  const dossier = resource.data;

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du dossier de Remplacement" rows={3} />;
  const status = dossier && isKnownStatus(dossier.status) ? dossier.status : null;

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.REPLACEMENT_ARBITRATION} — indisponible`}
        lede="Aucune route serveur d’arbitrage n’existe pour un Remplacement : aucune saisie n’est proposée et aucune décision n’est simulée."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <Panel title="Objet de l’arbitrage" zone="verdict">
        <KeyValues
          title="Dossier concerné"
          items={[
            { label: 'Référence du Remplacement', value: dossier?.id ?? replacementId },
            { label: 'Statut (code serveur)', value: dossier ? String(dossier.status) : null },
          ]}
        />
        {status ? <p className="lbm-body">{replacementSeal(status)}</p> : null}
        <p className="lbm-body">Le produit ne connaît aucun état « contesté » pour un Remplacement. Fondement de la cause, décompte du Candidat sortant et périmètre repris ne peuvent pas être tranchés ici.</p>
      </Panel>
      <Panel title="Motivation" zone="doc">
        <p className="lbm-body">Aucune motivation ne peut être enregistrée : aucune commande serveur ne la recevrait.</p>
      </Panel>
      <Panel title="Effets chiffrés" zone="price">
        <p className="lbm-body" data-no-payment-transfer="true">Aucune écriture n’est calculée ni simulée. Chaque Paiement reste rattaché à son propre Contrat ; le Paiement du travail validé n’est jamais déplacé vers le Contrat successeur.</p>
      </Panel>
      <ActionRow>
        <Link href={`/admin/remplacements/${encodeURIComponent(replacementId)}`} className="lbm-admin__link">Retour au dossier</Link>
        {dossier ? (
          <Link href={`/admin/litiges/${encodeURIComponent(sourceClaimId(dossier))}`} className="lbm-admin__link">Ouvrir le Claim d’origine</Link>
        ) : null}
        <Link href="/admin/remplacements" className="lbm-admin__link">Retour aux Remplacements</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-33" items={gaps} />
    </>
  );
}
