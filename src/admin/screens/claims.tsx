/**
 * P4D-DESIGN-ADMIN-CLAIMS — unités ADM-26 → ADM-30.
 *
 * Le Master emploie « Litige » comme référence de présentation ; le produit
 * affiche exclusivement Claim(s), types et statuts canoniques LE LABEUR.
 * Routes et commandes viennent uniquement des handlers admin.claims.* déjà
 * composés par le Worker : incidents:read:any pour lire, incidents:arbitrate
 * pour les mutations. Les mutations sont idempotentes côté serveur et les
 * états de concurrence / terminalité restent décidés par le repository.
 *
 * ClaimView inclut des références opaques, metadata, salaryConfirmationId et
 * idempotencyKey : aucun de ces champs ne doit être rendu. Une référence de
 * justificatif n'est pas un Document lisible ni une clé de stockage. Cette
 * tranche n'appelle ni route réservée aux parties, ni endpoint Document, ni
 * endpoint de Paiement ou de confirmation du Salaire.
 */

import { useCallback, useRef, useState, type FormEvent } from 'react';
import {
  CLAIM_EVIDENCE_STATUS_LABELS,
  CLAIM_EVIDENCE_STATUS_TONES,
  CLAIM_EVIDENCE_TYPE_LABELS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_TONES,
  CLAIM_TYPE_LABELS,
  ADMIN_CLAIM_DECISION_OPTIONS,
  CLAIM_DECISION_LABELS,
  ADMIN_UI_TERMS,
  PRODUCT_LABELS,
  formatDateTime,
} from '../vocabulary';
import {
  CLAIM_EVIDENCE_TYPE_VALUES,
  CLAIM_OPEN_STATUSES,
  CLAIM_TERMINAL_STATUSES,
  CLAIM_TYPE_VALUES,
  type ClaimEvidenceType,
  type ClaimStatus,
} from '../../backend/disputes/records';
import type {
  AdminApi,
  AdminPage,
  ClaimView,
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
} from '../components';
import { adminGapsFor } from '../screenMap';
import { newIdempotencyKey } from '../api';
import { useAdminAction, useAdminApi, useAdminResource } from '../hooks';
import { useAdminActor } from '../UnitBoundary';
import type { AdminUnitProps } from '../types';
import { SystemFeedback } from '../../public/SystemFeedback';

const PAGE_LIMIT = 100;
const CLAIM_READ_PERMISSION = 'incidents:read:any';
const CLAIM_ARBITRATE_PERMISSION = 'incidents:arbitrate';
type SupportedClaimDecision = (typeof ADMIN_CLAIM_DECISION_OPTIONS)[number];

function useSingleFlightAction<T>() {
  const action = useAdminAction<T>();
  const inFlight = useRef(false);
  const run = useCallback(async (task: (signal: AbortSignal) => Promise<T>) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    try {
      return await action.run(task);
    } finally {
      inFlight.current = false;
    }
  }, [action.run]);
  return { ...action, run };
}

/** Même payload rejoué après une erreur réseau = même clé d'idempotence. */
function useCommandKey() {
  const current = useRef<string | null>(null);
  const get = useCallback(() => {
    if (!current.current) current.current = newIdempotencyKey();
    return current.current;
  }, []);
  const reset = useCallback(() => { current.current = null; }, []);
  return { get, reset };
}

interface ClaimPageState {
  readonly items: readonly ClaimView[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
}

async function loadClaims(api: AdminApi, signal: AbortSignal): Promise<ClaimPageState> {
  const page = await api.claims({ limit: PAGE_LIMIT, signal });
  return { items: page.items, cursor: page.cursor, hasMore: page.hasMore };
}

function useClaimPages() {
  const api = useAdminApi();
  const resource = useAdminResource<ClaimPageState>(loadClaims, []);
  const nextPageAction = useSingleFlightAction<AdminPage<ClaimView>>();
  const [additional, setAdditional] = useState<readonly ClaimView[]>([]);
  const [pageState, setPageState] = useState<{ cursor: string | null; hasMore: boolean } | null>(null);

  const items = resource.data ? [...resource.data.items, ...additional] : null;
  const cursor = pageState ? pageState.cursor : resource.data?.cursor ?? null;
  const hasMore = pageState ? pageState.hasMore : resource.data?.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (!api || !cursor || !hasMore) return;
    void nextPageAction.run((signal) => api.claims({ limit: PAGE_LIMIT, cursor, signal })).then((page) => {
      if (!page) return;
      setAdditional((previous) => [...previous, ...page.items]);
      setPageState({ cursor: page.cursor, hasMore: page.hasMore });
    });
  }, [api, cursor, hasMore, nextPageAction.run]);

  const reload = useCallback(() => {
    setAdditional([]);
    setPageState(null);
    nextPageAction.reset();
    resource.reload();
  }, [nextPageAction.reset, resource.reload]);

  return {
    ...resource,
    items,
    cursor,
    hasMore,
    loadMore,
    loadMoreBusy: nextPageAction.busy,
    loadMoreError: nextPageAction.error,
    reload,
  };
}

function useClaimRecord(claimId: string) {
  return useAdminResource<ClaimView>((api, signal) => api.claim(claimId, signal), [claimId]);
}

function hasReadPermission(permissions: readonly string[] | undefined): boolean {
  return Boolean(permissions?.includes(CLAIM_READ_PERMISSION));
}

function hasArbitratePermission(permissions: readonly string[] | undefined): boolean {
  return Boolean(permissions?.includes(CLAIM_ARBITRATE_PERMISSION));
}

function statusSeal(status: ClaimStatus) {
  return (
    <span className="lbm-admin__claim-status" aria-label={`Statut ${CLAIM_STATUS_LABELS[status]} (${status})`}>
      <StatusSeal tone={CLAIM_STATUS_TONES[status]} label={CLAIM_STATUS_LABELS[status]} size="sm" />
      <code className="lbm-mono lbm-caption">{status}</code>
    </span>
  );
}

function formatWhen(value: string | undefined): string {
  return formatDateTime(value) ?? '—';
}

function isTerminal(status: ClaimStatus): boolean {
  return (CLAIM_TERMINAL_STATUSES as readonly ClaimStatus[]).includes(status);
}

function hasPendingEvidence(claim: ClaimView): boolean {
  return claim.evidenceRequests.some((request) => request.status === 'PENDING');
}

function AccessDenied() {
  return <SystemFeedback state="403" />;
}

function PermissionNotice({ permission }: { permission: string }) {
  return (
    <Panel title="Action ADMIN indisponible" zone="cta">
      <p className="lbm-body">{`La permission serveur ${permission} est absente de cette session. Aucune commande n’est envoyée.`}</p>
    </Panel>
  );
}

function ClaimSummary({ claim }: { claim: ClaimView }) {
  const source = claim.resolvedBy === 'SYSTEM' ? 'SYSTEM' : claim.resolvedBy ?? null;
  return (
    <>
      <Panel title="Données Claim renvoyées par le serveur" zone="hero">
        <KeyValues
          title="Résumé du Claim"
          items={[
            { label: 'Référence Claim', value: claim.claimId },
            { label: 'Type (code produit)', value: `${CLAIM_TYPE_LABELS[claim.type]} · ${claim.type}` },
            { label: 'Statut (code serveur)', value: claim.status },
            { label: 'Créé le', value: formatWhen(claim.createdAt) },
            { label: 'Échéance renvoyée par le serveur', value: claim.dueAt ? formatWhen(claim.dueAt) : null },
            { label: 'Contrat associé', value: claim.contractId },
            { label: 'Paiement associé (référence seulement)', value: claim.paymentId ?? null },
            { label: 'Compte auteur', value: claim.claimantId },
            { label: 'Compte répondant', value: claim.respondentId },
            { label: 'Résolu le', value: claim.resolvedAt ? formatWhen(claim.resolvedAt) : null },
            { label: 'Résolu par (valeur serveur)', value: source },
          ]}
        />
        <p className="lbm-caption lbm-muted">
          Les champs techniques `metadata`, `idempotencyKey`, `salaryConfirmationId` et les références de justificatifs ne sont pas affichés. La fiche ne lit ni le Paiement ni la confirmation de Salaire.
        </p>
      </Panel>

      <Panel title="Motif transmis pour le Claim" zone="chat">
        <p className="lbm-body">{claim.reason}</p>
      </Panel>

      {claim.resolution ? (
        <Panel title="Résolution renvoyée par le serveur" zone="verdict">
          <p className="lbm-body">{claim.resolution}</p>
        </Panel>
      ) : null}
    </>
  );
}

function MissingClaim({ claimId }: { claimId: string }) {
  return (
    <EmptyNotice>
      {`Aucun Claim ne correspond à ${claimId} dans la réponse réelle de la route ADMIN.`}
    </EmptyNotice>
  );
}

/* ───────────────────────────── ADM-26 · registre/file ───────────────────────────── */

const QUEUE_SEGMENTS = [
  { id: 'all', label: 'Tous' },
  { id: 'open', label: 'En cours' },
  { id: 'admin', label: 'Revue ADMIN' },
  { id: 'terminal', label: 'Terminés' },
] as const;

type QueueSegment = (typeof QUEUE_SEGMENTS)[number]['id'];

function filterClaims(items: readonly ClaimView[], query: string, segment: QueueSegment, type: string): ClaimView[] {
  const needle = query.trim().toLocaleLowerCase('fr-FR');
  return items.filter((claim) => {
    if (segment === 'open' && !(CLAIM_OPEN_STATUSES as readonly ClaimStatus[]).includes(claim.status)) return false;
    if (segment === 'admin' && claim.status !== 'ADMIN_REVIEW') return false;
    if (segment === 'terminal' && !isTerminal(claim.status)) return false;
    if (type !== 'all' && claim.type !== type) return false;
    if (!needle) return true;
    return [claim.claimId, claim.contractId, claim.claimantId, claim.respondentId, claim.reason]
      .some((value) => value.toLocaleLowerCase('fr-FR').includes(needle));
  });
}

export function Admin26ClaimRegistry(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!hasReadPermission(actor?.permissions)) return <AccessDenied />;
  return <Admin26ClaimRegistryContent {...props} />;
}

function Admin26ClaimRegistryContent({ unitId, pathname }: AdminUnitProps) {
  const resource = useClaimPages();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<QueueSegment>('all');
  const [type, setType] = useState<string>('all');
  const gaps = adminGapsFor(unitId, pathname);
  const visible = resource.items ? filterClaims(resource.items, query, segment, type) : [];

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.items) return <LoadingBlock label="Chargement des Claims" rows={5} />;

  const loaded = resource.items;
  const openCount = loaded.filter((claim) => (CLAIM_OPEN_STATUSES as readonly ClaimStatus[]).includes(claim.status)).length;
  const adminCount = loaded.filter((claim) => claim.status === 'ADMIN_REVIEW').length;

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.CLAIM_REGISTRY}
        lede={`${loaded.length} Claim(s) renvoyé(s) sur les pages réellement chargées · recherche et filtres locaux`}
        seal={{ tone: 'gold', label: 'Registre ADMIN réel' }}
      />

      <KpiRow items={[
        { label: 'CLAIMS CHARGÉS', value: String(loaded.length) },
        { label: 'EN COURS (PAGE)', value: String(openCount) },
        { label: 'REVUE ADMIN (PAGE)', value: String(adminCount) },
        { label: 'RÉSULTATS DU FILTRE', value: String(visible.length) },
      ]} />

      <Panel title="Portée des repères" zone="kpi" tone="notice">
        Les comptes concernent uniquement les Claims effectivement reçus avec le curseur courant. La route ADMIN ne fournit ni total global, ni montant en jeu, ni indicateur d’échéance ou de SLA.
      </Panel>

      <Panel title="Recherche et filtres locaux" zone="list">
        <div className="lbm-admin__claim-filters">
          <Field label="Filtrer par état Claim">
            <select aria-label="Filtre d’état Claim" value={segment} onChange={(event) => setSegment(event.target.value as QueueSegment)}>
              {QUEUE_SEGMENTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Rechercher dans la page chargée">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Référence, contrat, compte, motif…"
              aria-label="Rechercher un Claim dans les pages chargées"
            />
          </Field>
          <Field label="Type de Claim">
            <select aria-label="Filtrer par type de Claim" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">Tous les types</option>
              {CLAIM_TYPE_VALUES.map((claimType) => (
                <option key={claimType} value={claimType}>{CLAIM_TYPE_LABELS[claimType]} · {claimType}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="lbm-caption lbm-muted">Le serveur renvoie l’ordre et le curseur officiels ; cette recherche ne prétend pas couvrir les Claims hors page.</p>
      </Panel>

      <DataTable
        caption="Registre ADMIN réel des Claims (pages chargées)"
        head={['Référence Claim', 'Type', 'Statut serveur', 'Créé le', 'Dossier']}
        rows={visible.map((claim) => [
          <span key="id" className="lbm-mono">{claim.claimId}</span>,
          <span key="type">{CLAIM_TYPE_LABELS[claim.type]} <code className="lbm-mono lbm-caption">{claim.type}</code></span>,
          <span key="status">{statusSeal(claim.status)}</span>,
          <span key="created" className="lbm-mono">{formatWhen(claim.createdAt)}</span>,
          <Link key="open" href={`/admin/litiges/${encodeURIComponent(claim.claimId)}`} className="lbm-admin__link">Ouvrir</Link>,
        ])}
        empty={(
          <EmptyNotice>
            {loaded.length === 0
              ? 'La route ADMIN a renvoyé une collection vide pour les pages demandées.'
              : 'Aucun Claim de la page réelle ne correspond aux filtres locaux.'}
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
        <Link href="/admin" className="lbm-admin__link">Retour à la supervision</Link>
      </ActionRow>
      {resource.loadMoreError ? <ActionError error={resource.loadMoreError} /> : null}
      <GapNotice title="BACKEND_GAP · ADM-26" items={gaps} />
    </>
  );
}

/* ───────────────────────────── ADM-27/28 · dossier ───────────────────────────── */

export function Admin27ClaimSheet(props: AdminUnitProps) {
  return <ClaimReadScreen {...props} mode="sheet" />;
}

export function Admin28ClaimEvidence(props: AdminUnitProps) {
  return <ClaimReadScreen {...props} mode="evidence" />;
}

function ClaimReadScreen({
  unitId,
  pathname,
  params,
  mode,
}: AdminUnitProps & { mode: 'sheet' | 'evidence' }) {
  const actor = useAdminActor();
  if (!hasReadPermission(actor?.permissions)) return <AccessDenied />;
  return <ClaimReadContent unitId={unitId} pathname={pathname} claimId={params.id ?? ''} mode={mode} canArbitrate={hasArbitratePermission(actor?.permissions)} />;
}

function ClaimReadContent({
  unitId,
  pathname,
  claimId,
  mode,
  canArbitrate,
}: {
  unitId: string;
  pathname: string;
  claimId: string;
  mode: 'sheet' | 'evidence';
  canArbitrate: boolean;
}) {
  const api = useAdminApi();
  const resource = useClaimRecord(claimId);
  const gaps = adminGapsFor(unitId, pathname);
  const claim = resource.data;

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du Claim" rows={5} />;
  if (!claim) return <MissingClaim claimId={claimId} />;

  return mode === 'sheet' ? (
    <ClaimSheetContent key={claim.claimId} claim={claim} gaps={gaps} canArbitrate={canArbitrate} api={api} reload={resource.reload} />
  ) : (
    <ClaimEvidenceContent key={claim.claimId} claim={claim} gaps={gaps} canArbitrate={canArbitrate} api={api} reload={resource.reload} />
  );
}

function ClaimSheetContent({
  claim,
  gaps,
  canArbitrate,
  api,
  reload,
}: {
  claim: ClaimView;
  gaps: readonly string[];
  canArbitrate: boolean;
  api: AdminApi | null;
  reload: () => void;
}) {
  const review = useSingleFlightAction<ClaimView>();
  const reviewKey = useCommandKey();
  const [note, setNote] = useState('');
  const openForReview = (CLAIM_OPEN_STATUSES as readonly ClaimStatus[]).includes(claim.status)
    && claim.status !== 'ADMIN_REVIEW';

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !canArbitrate || !openForReview) return;
    void review.run((signal) => api.reviewClaim(claim.claimId, note.trim() || undefined, signal, reviewKey.get())).then((updated) => {
      if (updated) {
        reviewKey.reset();
        setNote('');
        reload();
      }
    });
  };

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.CLAIM_SHEET} · ${claim.claimId}`}
        lede="Dossier constitué exclusivement des champs réels renvoyés à l’ADMIN par le service Claim."
        seal={{ tone: CLAIM_STATUS_TONES[claim.status], label: CLAIM_STATUS_LABELS[claim.status] }}
      />
      <ClaimSummary claim={claim} />

      <Panel title="Demandes de justificatif (métadonnées serveur)" zone="list">
        <p className="lbm-caption lbm-muted">Le contenu de justificatif n’est pas servi par ClaimView ; aucune clé d’objet ni référence brute n’est affichée.</p>
        <DataTable
          caption="Demandes de justificatif associées au Claim"
          head={['Type', 'Demandé à (compte)', 'Statut', 'Créé le', 'Échéance serveur', 'Transmis le']}
          rows={claim.evidenceRequests.map((request) => [
            <span key="type">{CLAIM_EVIDENCE_TYPE_LABELS[request.requestedType]} <code className="lbm-mono lbm-caption">{request.requestedType}</code></span>,
            <span key="recipient" className="lbm-mono">{request.requestedFrom}</span>,
            <span key="status">
              <StatusSeal tone={CLAIM_EVIDENCE_STATUS_TONES[request.status]} label={CLAIM_EVIDENCE_STATUS_LABELS[request.status]} size="sm" />{' '}
              <code className="lbm-mono lbm-caption">{request.status}</code>
            </span>,
            formatWhen(request.createdAt),
            request.dueAt ? formatWhen(request.dueAt) : 'Non fournie par le serveur',
            formatWhen(request.submittedAt),
          ])}
          empty={<EmptyNotice>Aucune demande de justificatif n’est renvoyée pour ce Claim.</EmptyNotice>}
        />
      </Panel>

      <Panel title="Revue ADMIN" zone="cta">
        {claim.status === 'ADMIN_REVIEW' ? (
          <p className="lbm-body">Le statut serveur de ce Claim est ADMIN_REVIEW.</p>
        ) : isTerminal(claim.status) ? (
          <p className="lbm-body">Ce Claim est terminal selon le statut réel ; aucune escalade n’est proposée.</p>
        ) : (
          <p className="lbm-body">La commande serveur de revue peut passer ce Claim en ADMIN_REVIEW. Cette interface ne déduit aucune faute du silence d’une partie.</p>
        )}
        {openForReview && canArbitrate ? (
          <form onSubmit={submitReview}>
            <Field label="Note facultative de mise en revue (auditée par le serveur)" hint="0 à 500 caractères ; elle n’est pas renvoyée dans ClaimView.">
              <textarea
                value={note}
                maxLength={500}
                onChange={(event) => { reviewKey.reset(); setNote(event.target.value); }}
                aria-label="Note facultative de mise en revue ADMIN"
              />
            </Field>
            <ActionRow>
              <NeoPressButton type="submit" variant="primary" loading={review.busy} disabled={review.busy}>
                Transmettre à la revue ADMIN
              </NeoPressButton>
            </ActionRow>
          </form>
        ) : null}
        {!canArbitrate ? <p className="lbm-caption lbm-muted">La permission incidents:arbitrate est absente ; aucune commande n’est envoyée.</p> : null}
        {review.error ? <ActionError error={review.error} /> : null}
        {review.result ? <p role="status" className="lbm-caption">Réponse serveur : {review.result.status}</p> : null}
      </Panel>

      <ActionRow>
        <Link href="/admin/litiges" className="lbm-admin__link">Retour aux Claims</Link>
        <Link href={`/admin/litiges/${encodeURIComponent(claim.claimId)}/pieces`} className="lbm-admin__link">Justificatifs</Link>
        <Link href={`/admin/litiges/${encodeURIComponent(claim.claimId)}/decision`} className="lbm-admin__link">Décision ADMIN</Link>
        <RetryButton onClick={reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-27" items={gaps} />
    </>
  );
}

function ClaimEvidenceContent({
  claim,
  gaps,
  canArbitrate,
  api,
  reload,
}: {
  claim: ClaimView;
  gaps: readonly string[];
  canArbitrate: boolean;
  api: AdminApi | null;
  reload: () => void;
}) {
  const action = useSingleFlightAction<ClaimView>();
  const actionKey = useCommandKey();
  const defaultType: ClaimEvidenceType = claim.type === 'SALARY_NOT_RECEIVED' || claim.type === 'PAYMENT_DISPUTE'
    ? 'PAYMENT_PROOF'
    : claim.type === 'CONTRACT_INCIDENT'
      ? 'CONTRACT_EVIDENCE'
      : 'SUPPORTING_EVIDENCE';
  const [requestedType, setRequestedType] = useState<ClaimEvidenceType>(defaultType);
  const [requestedFrom, setRequestedFrom] = useState(claim.respondentId);
  const pending = hasPendingEvidence(claim);
  const requestable = (claim.status === 'ADMIN_REVIEW' || claim.status === 'UNDER_REVIEW') && !pending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !canArbitrate || !requestable) return;
    void action.run((signal) => api.requestClaimEvidence(claim.claimId, { requestedType, requestedFrom }, signal, actionKey.get())).then((updated) => {
      if (updated) {
        actionKey.reset();
        reload();
      }
    });
  };

  const parties = [...new Set([claim.claimantId, claim.respondentId])];
  const gap = gaps;

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.CLAIM_EVIDENCE} · ${claim.claimId}`}
        lede="Consultation limitée aux métadonnées de demandes renvoyées par ClaimView ; aucun contenu de Document n’est consulté."
        seal={{ tone: CLAIM_STATUS_TONES[claim.status], label: CLAIM_STATUS_LABELS[claim.status] }}
      />
      <ClaimSummary claim={claim} />
      <KpiRow items={[
        { label: 'DEMANDES RENVOYÉES', value: String(claim.evidenceRequests.length) },
        { label: 'PENDING RENVOYÉES', value: String(claim.evidenceRequests.filter((request) => request.status === 'PENDING').length) },
        { label: 'SOUMISES RENVOYÉES', value: String(claim.evidenceRequests.filter((request) => request.status === 'SUBMITTED').length) },
      ]} />

      <Panel title="Référence de justificatif" zone="list">
        {claim.evidenceReference ? (
          <p className="lbm-body">Une référence initiale est présente dans le DTO. Sa valeur reste masquée et aucun contenu n’est accessible par cette route.</p>
        ) : (
          <p className="lbm-body">Aucune référence initiale de justificatif n’est renvoyée par ClaimView.</p>
        )}
        <p className="lbm-caption lbm-muted">Les valeurs evidenceReference des demandes sont aussi omises. Aucun appel Document, accès R2 ou lien téléchargeable n’est créé.</p>
      </Panel>

      <Panel title="État des demandes" zone="table">
        <DataTable
          caption="État réel des demandes de justificatif du Claim"
          head={['Type', 'Compte destinataire', 'Statut', 'Émise le', 'Échéance serveur', 'Référence reçue']}
          rows={claim.evidenceRequests.map((request) => [
            <span key="type">{CLAIM_EVIDENCE_TYPE_LABELS[request.requestedType]} <code className="lbm-mono lbm-caption">{request.requestedType}</code></span>,
            <span key="party" className="lbm-mono">{request.requestedFrom}</span>,
            <span key="status">
              <StatusSeal tone={CLAIM_EVIDENCE_STATUS_TONES[request.status]} label={CLAIM_EVIDENCE_STATUS_LABELS[request.status]} size="sm" />{' '}
              <code className="lbm-mono lbm-caption">{request.status}</code>
            </span>,
            formatWhen(request.createdAt),
            request.dueAt ? formatWhen(request.dueAt) : 'Non fournie par le serveur',
            request.evidenceReference ? 'Présente · valeur masquée' : 'Non fournie',
          ])}
          empty={<EmptyNotice>Aucune demande de justificatif n’est renvoyée pour ce Claim.</EmptyNotice>}
        />
      </Panel>

      <Panel title="Demander un justificatif" zone="cta">
        {requestable && canArbitrate ? (
          <form onSubmit={submit}>
            <div className="lbm-admin__claim-filters">
              <Field label="Type de justificatif">
                <select
                  value={requestedType}
                  aria-label="Type de justificatif demandé"
                  onChange={(event) => { actionKey.reset(); setRequestedType(event.target.value as ClaimEvidenceType); }}
                >
                  {CLAIM_EVIDENCE_TYPE_VALUES.map((evidenceType) => (
                    <option key={evidenceType} value={evidenceType}>
                      {CLAIM_EVIDENCE_TYPE_LABELS[evidenceType]} · {evidenceType}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Compte destinataire" hint="Sélection parmi les identifiants des deux comptes du Claim.">
                <select
                  value={requestedFrom}
                  aria-label="Compte destinataire de la demande"
                  onChange={(event) => { actionKey.reset(); setRequestedFrom(event.target.value); }}
                >
                  {parties.map((party, index) => (
                    <option key={party} value={party}>{index === 0 ? 'Compte auteur' : 'Compte répondant'} · {party}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="lbm-caption lbm-muted">Le serveur vérifie l’état, la partie persistée, les demandes concurrentes et l’échéance opérateur ; aucune échéance n’est calculée par l’interface.</p>
            <ActionRow>
              <NeoPressButton type="submit" variant="primary" loading={action.busy} disabled={action.busy}>
                Envoyer la demande au serveur
              </NeoPressButton>
            </ActionRow>
          </form>
        ) : (
          <p className="lbm-body">
            {!canArbitrate
              ? `La permission serveur ${CLAIM_ARBITRATE_PERMISSION} est absente ; aucune commande n’est envoyée.`
              : pending
                ? 'Une demande PENDING existe déjà ; le serveur interdit une demande concurrente.'
                : 'Le serveur n’autorise cette demande qu’en UNDER_REVIEW ou ADMIN_REVIEW.'}
          </p>
        )}
        {action.error ? <ActionError error={action.error} /> : null}
        {action.result ? <p role="status" className="lbm-caption">Réponse serveur : {action.result.status}</p> : null}
      </Panel>

      <ActionRow>
        <Link href={`/admin/litiges/${encodeURIComponent(claim.claimId)}`} className="lbm-admin__link">Retour au dossier Claim</Link>
        <Link href={`/admin/litiges/${encodeURIComponent(claim.claimId)}/decision`} className="lbm-admin__link">Décision ADMIN</Link>
        <RetryButton onClick={reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-28" items={gap} />
    </>
  );
}

/* ───────────────────────────── ADM-29 · décision ───────────────────────────── */

export function Admin29ClaimDecision(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!hasReadPermission(actor?.permissions)) return <AccessDenied />;
  return <Admin29ClaimDecisionContent key={props.params.id ?? ''} {...props} canArbitrate={hasArbitratePermission(actor?.permissions)} />;
}

function Admin29ClaimDecisionContent({
  unitId,
  pathname,
  params,
  canArbitrate,
}: AdminUnitProps & { canArbitrate: boolean }) {
  const api = useAdminApi();
  const resource = useClaimRecord(params.id ?? '');
  const gaps = adminGapsFor(unitId, pathname);
  const [decision, setDecision] = useState<SupportedClaimDecision>('RESOLVE');
  const [resolution, setResolution] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const action = useSingleFlightAction<ClaimView>();
  const actionKey = useCommandKey();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du Claim avant décision" rows={4} />;
  if (!resource.data) return <MissingClaim claimId={params.id ?? ''} />;
  const claim = resource.data;
  const canDecide = canArbitrate && claim.status === 'ADMIN_REVIEW';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !canDecide || !confirmed || resolution.trim().length < 3) return;
    void action.run((signal) => api.decideClaim(
      claim.claimId,
      { decision, resolution: resolution.trim() },
      signal,
      actionKey.get(),
    )).then((updated) => {
      if (updated) {
        actionKey.reset();
        setResolution('');
        setConfirmed(false);
        resource.reload();
      }
    });
  };

  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.CLAIM_DECISION} · ${claim.claimId}`}
        lede="Décision déclenchée uniquement sur le statut serveur ADMIN_REVIEW, avec une motivation écrite."
        seal={{ tone: CLAIM_STATUS_TONES[claim.status], label: CLAIM_STATUS_LABELS[claim.status] }}
      />
      <ClaimSummary claim={claim} />

      <Panel title="Justificatifs liés" zone="doc">
        <p className="lbm-body">Les références de justificatif éventuellement présentes dans ClaimView restent masquées ; aucun contenu de preuve n’est consultable depuis cette route.</p>
      </Panel>
      <Panel title="Effets renvoyés par la route Claim" zone="price">
        <p className="lbm-body">La route de décision ne fournit pas d’aperçu d’effets ni de montant. L’interface ne calcule aucun mouvement financier.</p>
      </Panel>

      <Panel title="Décision ADMIN supportée" zone="verdict">
        {claim.status === 'ADMIN_REVIEW' && canArbitrate ? (
          <form onSubmit={submit}>
            <Field label="Décision">
              <select
                value={decision}
                aria-label="Décision ADMIN du Claim"
                onChange={(event) => { actionKey.reset(); setDecision(event.target.value as SupportedClaimDecision); }}
              >
                {ADMIN_CLAIM_DECISION_OPTIONS.map((value) => (
                  <option key={value} value={value}>{CLAIM_DECISION_LABELS[value]} · {value}</option>
                ))}
              </select>
            </Field>
            <Field label="Résolution motivée" hint="Obligatoire · 3 à 1000 caractères ; le serveur enregistre la chaîne de résolution.">
              <textarea
                required
                minLength={3}
                maxLength={1000}
                value={resolution}
                onChange={(event) => { actionKey.reset(); setResolution(event.target.value); }}
                aria-label="Résolution motivée du Claim"
              />
            </Field>
            <label className="lbm-admin__claim-confirm">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>Je confirme l’envoi d’une décision terminale au serveur ; celui-ci revalide l’état courant et l’idempotence.</span>
            </label>
            <p className="lbm-caption lbm-muted">Le workflow Claim n’exécute aucun mouvement de fonds par cette commande. Une décision ne peut être envoyée qu’avec la permission incidents:arbitrate.</p>
            <ActionRow>
              <NeoPressButton type="submit" variant="primary" loading={action.busy} disabled={action.busy || !confirmed || resolution.trim().length < 3}>
                Envoyer la décision ADMIN
              </NeoPressButton>
            </ActionRow>
          </form>
        ) : (
          <div>
            {!canArbitrate
              ? <p className="lbm-body">La permission serveur incidents:arbitrate est absente ; aucun formulaire de décision n’est rendu.</p>
              : claim.status === 'ADMIN_REVIEW'
                ? <p className="lbm-body">La décision n’est pas disponible dans l’état courant.</p>
                : isTerminal(claim.status)
                  ? <p className="lbm-body">Le statut serveur est terminal ; le backend ne permet pas une seconde décision.</p>
                  : <p className="lbm-body">Le backend n’accepte une décision que depuis ADMIN_REVIEW. Ouvrez le dossier Claim pour demander la revue ADMIN, si le statut courant le permet.</p>}
          </div>
        )}
        {action.error ? <ActionError error={action.error} /> : null}
        {action.result ? <p role="status" className="lbm-caption">Réponse serveur : {action.result.status}</p> : null}
      </Panel>

      <ActionRow>
        <Link href={`/admin/litiges/${encodeURIComponent(claim.claimId)}`} className="lbm-admin__link">Retour au dossier Claim</Link>
        <Link href="/admin/litiges/decisions" className="lbm-admin__link">Historique des décisions</Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-29" items={gaps} />
    </>
  );
}

/* ───────────────────────────── ADM-30 · historique ───────────────────────────── */

export function Admin30ClaimDecisionHistory(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!hasReadPermission(actor?.permissions)) return <AccessDenied />;
  return <Admin30ClaimDecisionHistoryContent {...props} />;
}

function Admin30ClaimDecisionHistoryContent({ unitId, pathname }: AdminUnitProps) {
  const resource = useClaimPages();
  const [query, setQuery] = useState('');
  const gaps = adminGapsFor(unitId, pathname);
  const terminal = (resource.items ?? []).filter((claim) => isTerminal(claim.status));
  const needle = query.trim().toLocaleLowerCase('fr-FR');
  const visible = terminal.filter((claim) => [claim.claimId, claim.type, claim.status, claim.resolvedBy ?? '', claim.resolution ?? '']
    .some((value) => value.toLocaleLowerCase('fr-FR').includes(needle)));

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.items) return <LoadingBlock label="Chargement des Claims terminés" rows={4} />;

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.CLAIM_DECISION_HISTORY}
        lede={`${terminal.length} Claim(s) terminés sur les pages réelles chargées ; ceci n’est pas un journal d’événements exhaustif.`}
        seal={{ tone: 'slate', label: 'Projection ClaimView' }}
      />
      <KpiRow items={[
        { label: 'TERMINÉS (PAGE)', value: String(terminal.length) },
        { label: 'ISSUS DU FILTRE', value: String(visible.length) },
      ]} />
      <Panel title="Recherche locale" zone="list">
        <Field label="Rechercher parmi les Claims terminés chargés">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Rechercher dans l’historique des Claims terminés"
            placeholder="Référence, statut, résolution…"
          />
        </Field>
        <p className="lbm-caption lbm-muted">Aucune pagination ou analyse dédiée aux décisions n’existe ; charger une page suivante suit le curseur réel de admin.claims.list.</p>
      </Panel>
      <DataTable
        caption="Claims terminés — champs réellement renvoyés par ClaimView"
        head={['Référence Claim', 'Type', 'Statut', 'Résolu le', 'Résolu par', 'Résolution renvoyée', 'Dossier']}
        rows={visible.map((claim) => [
          <span key="id" className="lbm-mono">{claim.claimId}</span>,
          <span key="type">{CLAIM_TYPE_LABELS[claim.type]} <code className="lbm-mono lbm-caption">{claim.type}</code></span>,
          <span key="status">{statusSeal(claim.status)}</span>,
          formatWhen(claim.resolvedAt),
          <span key="actor" className="lbm-mono">{claim.resolvedBy ?? '—'}</span>,
          claim.resolution ?? 'Non fournie par ClaimView',
          <Link key="open" href={`/admin/litiges/${encodeURIComponent(claim.claimId)}`} className="lbm-admin__link">Ouvrir</Link>,
        ])}
        empty={(
          <EmptyNotice>
            {resource.items.length === 0
              ? 'La route ADMIN a renvoyé une collection vide sur les pages demandées.'
              : 'Aucun Claim terminal ne correspond aux critères dans les pages réellement chargées.'}
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
        <Link href="/admin/litiges" className="lbm-admin__link">Retour au registre des Claims</Link>
      </ActionRow>
      {resource.loadMoreError ? <ActionError error={resource.loadMoreError} /> : null}
      <GapNotice title="BACKEND_GAP · ADM-30" items={gaps} />
    </>
  );
}
