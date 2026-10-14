/**
 * P4F-DESIGN-ADMIN-DOCUMENTS — unités exactes du Master
 * « ADM — documents (registre & audit) » (ADM-37 registre R2 ; ADM-40 audit &
 * rétention) et « ADM — documents (vérification & quarantaine) » (ADM-38
 * vérification d'un Document ; ADM-39 quarantaine).
 *
 * Capacités serveur réellement utilisées (routeur P0, handlers présents) :
 *  - registre : admin.documents.list (GET /api/v1/admin/documents, filtres
 *    ownerUserId / documentType / status, curseur) — documents:read:any ;
 *  - fiche : admin.documents.read (versions, empreintes SHA-256 enregistrées,
 *    liens) — documents:read:any ;
 *  - révocation : admin.documents.revoke et admin.documents.versions.revoke
 *    (POST, motif 3–1000, Idempotency-Key) — incidents:arbitrate ;
 *  - contrôle d'intégrité technique : documents.versions.integrity.verify
 *    (POST, idempotent, audité) — recalcul de l'empreinte, sans décision.
 *
 * Jamais appelées (absentes, BACKEND_GAP) : toute décision de vérification
 * (review / decide), la visionneuse et le contenu, la file de quarantaine
 * (lift / confirm-fraud), le journal d'accès, les politiques et la purge, le
 * stockage, et tout téléversement ADMIN. Aucun object_key, aucun jeton signé,
 * aucun binaire, aucune donnée simulée : une route absente est affichée
 * indisponible avec son explication, jamais comme un bouton actif.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  DocumentDetailView,
  DocumentIntegrityReport,
  DocumentLinkView,
  DocumentSummaryView,
  DocumentVersionView,
} from '../../backend/documents/documentRepository';
import {
  DOCUMENT_TYPES,
  retentionClassForDocumentType,
  type DocumentType,
} from '../../domain/documentRules';
import { ApiClientError, newIdempotencyKey, type AdminApi, type AdminPage } from '../api';
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
import { useAdminAction, useAdminApi, useAdminResource } from '../hooks';
import { adminGapsFor } from '../screenMap';
import { useAdminActor } from '../UnitBoundary';
import type { AdminUnitProps } from '../types';
import {
  ADMIN_UI_TERMS,
  DOCUMENT_ENTITY_LABELS,
  DOCUMENT_LINK_PURPOSE_LABELS,
  DOCUMENT_RETENTION_CLASS_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_VERSION_STATUS_LABELS,
  DOCUMENT_VERSION_STATUS_TONES,
  formatBoolean,
  formatDateTime,
} from '../vocabulary';
import {
  EMPTY_DOCUMENT_FILTERS,
  canCorrectDocuments,
  canReadDocuments,
  canRevokeDocument,
  canRevokeVersion,
  canVerifyVersionIntegrity,
  entityHref,
  integrityVerdict,
  registryQuery,
  retentionSummary,
  revocationReasonProblem,
  summarizeStatuses,
  type CapabilityCheck,
  type DocumentRegistryFilters,
  type DocumentStatusValue,
  type DocumentVersionStatusValue,
} from '../documentRules';
import { SystemFeedback } from '../../public/SystemFeedback';

/* ───────────────────────── utilitaires partagés ───────────────────────── */

function AccessDenied() {
  return <SystemFeedback state="403" />;
}

function formatWhen(value: string | undefined | null): string {
  return formatDateTime(value ?? undefined) ?? '—';
}

/** Libellé de statut de version tolérant (une valeur inconnue reste affichée telle quelle). */
function versionStatusLabel(status: string): string {
  return DOCUMENT_VERSION_STATUS_LABELS[status as DocumentVersionStatusValue] ?? status;
}

function versionStatusTone(status: string) {
  return DOCUMENT_VERSION_STATUS_TONES[status as DocumentVersionStatusValue] ?? 'slate';
}

function documentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatusValue] ?? status;
}

function documentStatusTone(status: string) {
  return DOCUMENT_STATUS_TONES[status as DocumentStatusValue] ?? 'slate';
}

function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;
}

function documentStatusSeal(status: string) {
  return (
    <span className="lbm-admin__document-status" aria-label={`Statut ${documentStatusLabel(status)} (${status})`}>
      <StatusSeal tone={documentStatusTone(status)} label={documentStatusLabel(status)} size="sm" />
      <code className="lbm-mono lbm-caption">{status}</code>
    </span>
  );
}

function versionStatusSeal(status: string) {
  return (
    <span className="lbm-admin__document-status" aria-label={`Statut ${versionStatusLabel(status)} (${status})`}>
      <StatusSeal tone={versionStatusTone(status)} label={versionStatusLabel(status)} size="sm" />
      <code className="lbm-mono lbm-caption">{status}</code>
    </span>
  );
}

/**
 * Sentinelle « non installé » : le serveur répond 501 quand la persistance
 * durable ou le stockage objet n'est pas ouvert (handler absent). L'écran
 * l'affiche comme indisponible, jamais comme liste vide ni donnée simulée.
 */
export interface DocumentsUnavailable {
  readonly unavailable: true;
}

const UNAVAILABLE: DocumentsUnavailable = { unavailable: true };

export function isDocumentsUnavailable(value: unknown): value is DocumentsUnavailable {
  return typeof value === 'object' && value !== null && (value as { unavailable?: unknown }).unavailable === true;
}

export async function unavailableWhenNotInstalled<T>(task: () => Promise<T>): Promise<T | DocumentsUnavailable> {
  try {
    return await task();
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.status === 501) return UNAVAILABLE;
    throw cause;
  }
}

/** Chargement d'une page du registre (filtres réellement acceptés par le serveur). */
export function loadDocumentRegistryPage(
  api: AdminApi,
  filters: DocumentRegistryFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<AdminPage<DocumentSummaryView> | DocumentsUnavailable> {
  return unavailableWhenNotInstalled(() => api.documents({ ...registryQuery(filters, cursor), signal }));
}

function useSingleFlightAction<T>() {
  const action = useAdminAction<T>();
  const inFlight = useRef(false);
  const run = useCallback(
    async (task: (signal: AbortSignal) => Promise<T>) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      try {
        return await action.run(task);
      } finally {
        inFlight.current = false;
      }
    },
    [action.run],
  );
  return { ...action, run };
}

/** Clé d'idempotence stable entre deux rejeux d'une même commande ; réinitialisée après succès ou édition. */
function useCommandKey() {
  const current = useRef<string | null>(null);
  const get = useCallback(() => {
    if (!current.current) current.current = newIdempotencyKey();
    return current.current;
  }, []);
  const reset = useCallback(() => {
    current.current = null;
  }, []);
  return { get, reset };
}

function UnavailableActions({
  items,
}: {
  items: readonly { readonly label: string; readonly capability: string; readonly reason: string }[];
}) {
  return (
    <ul className="lbm-admin__unavailable-list" aria-label="Actions indisponibles">
      {items.map((item) => (
        <li key={item.label} className="lbm-admin__unavailable" data-unavailable-action={item.capability}>
          <span className="lbm-admin__unavailable-label">{item.label}</span>
          <StatusSeal tone="slate" label="Indisponible" size="sm" />
          <code className="lbm-mono lbm-caption">{item.capability}</code>
          <span className="lbm-caption lbm-muted">{item.reason}</span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────── ADM-37 · registre R2 des Documents ───────────────────── */

export function Admin37DocumentRegistry(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!canReadDocuments(actor?.permissions)) return <AccessDenied />;
  return <DocumentRegistryContent {...props} />;
}

function useDocumentRegistry(filters: DocumentRegistryFilters) {
  const api = useAdminApi();
  const filterKey = JSON.stringify(filters);
  const first = useAdminResource<AdminPage<DocumentSummaryView> | DocumentsUnavailable>(
    (currentApi, signal) => loadDocumentRegistryPage(currentApi, filters, null, signal),
    [filterKey],
  );
  const nextPage = useSingleFlightAction<AdminPage<DocumentSummaryView> | DocumentsUnavailable>();
  const [additional, setAdditional] = useState<readonly DocumentSummaryView[]>([]);
  const [pageState, setPageState] = useState<{ cursor: string | null; hasMore: boolean } | null>(null);

  useEffect(() => {
    setAdditional([]);
    setPageState(null);
    nextPage.reset();
  }, [filterKey, nextPage.reset]);

  const firstPage = first.data && !isDocumentsUnavailable(first.data) ? first.data : null;
  const unavailable = first.data !== null && isDocumentsUnavailable(first.data);
  const items = firstPage ? [...firstPage.items, ...additional] : null;
  const cursor = pageState ? pageState.cursor : firstPage?.cursor ?? null;
  const hasMore = pageState ? pageState.hasMore : firstPage?.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (!api || !cursor || !hasMore || nextPage.busy) return;
    void nextPage.run((signal) => loadDocumentRegistryPage(api, filters, cursor, signal)).then((page) => {
      if (!page || isDocumentsUnavailable(page)) return;
      setAdditional((previous) => [...previous, ...page.items]);
      setPageState({ cursor: page.cursor, hasMore: page.hasMore });
    });
  }, [api, cursor, filters, hasMore, nextPage.busy, nextPage.run]);

  const reload = useCallback(() => {
    setAdditional([]);
    setPageState(null);
    nextPage.reset();
    first.reload();
  }, [nextPage.reset, first.reload]);

  return {
    status: first.status,
    error: first.error,
    items,
    unavailable,
    hasMore,
    loadMore,
    loadMoreBusy: nextPage.busy,
    loadMoreError: nextPage.error,
    reload,
  };
}

function DocumentRegistryContent({ unitId, pathname }: AdminUnitProps) {
  const [draft, setDraft] = useState<DocumentRegistryFilters>(EMPTY_DOCUMENT_FILTERS);
  const [applied, setApplied] = useState<DocumentRegistryFilters>(EMPTY_DOCUMENT_FILTERS);
  const registry = useDocumentRegistry(applied);
  const gaps = adminGapsFor(unitId, pathname);
  const filtersActive = JSON.stringify(applied) !== JSON.stringify(EMPTY_DOCUMENT_FILTERS);

  if (registry.status === 'error') return <SystemFeedback {...registry.error!} retry={registry.reload} />;
  if (registry.status === 'loading' && !registry.items && !registry.unavailable) {
    return <LoadingBlock label="Chargement du registre des Documents" rows={6} />;
  }

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied({ ...draft });
  };

  const summary = registry.items ? summarizeStatuses(registry.items) : null;

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.DOCUMENT_REGISTRY}
        lede="Métadonnées réellement enregistrées (admin.documents.list). Aucun contenu n’est affiché, téléchargé ni téléversé depuis cet écran ; la clé de stockage n’est jamais exposée."
      />

      {registry.unavailable ? (
        <GapNotice
          title="Source de données non configurée · admin.documents.list"
          items={['Le registre des Documents n’est pas installé dans cet environnement : la route répond 501. Aucune liste n’est affichée à la place.']}
        />
      ) : null}

      <KpiRow
        items={[
          { label: 'Documents de la page chargée', value: summary ? String(summary.total) : '—' },
          { label: 'ACTIVE sur la page', value: summary ? String(summary.active) : '—' },
          { label: 'REVOKED sur la page', value: summary ? String(summary.revoked) : '—' },
          { label: 'En quarantaine', value: '—' },
          { label: 'Volume stocké', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-count="true">
        Les comptes portent uniquement sur la page réellement chargée. Les deux repères « — » sont des capacités absentes, jamais des zéros.
      </p>

      <Panel title="Filtres serveur (admin.documents.list)" zone="form">
        <form onSubmit={applyFilters} className="lbm-admin__document-filters">
          <Field label="Propriétaire (identifiant de compte)" hint="Filtre serveur ownerUserId.">
            <input
              value={draft.ownerUserId}
              onChange={(event) => setDraft((current) => ({ ...current, ownerUserId: event.target.value }))}
              aria-label="Identifiant du propriétaire du Document"
              autoComplete="off"
            />
          </Field>
          <Field label="Type de Document">
            <select
              value={draft.documentType}
              aria-label="Filtre de type de Document"
              onChange={(event) => setDraft((current) => ({ ...current, documentType: event.target.value as DocumentRegistryFilters['documentType'] }))}
            >
              <option value="">Tous les types</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select
              value={draft.status}
              aria-label="Filtre de statut du registre"
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as DocumentRegistryFilters['status'] }))}
            >
              <option value="">Tous les statuts</option>
              <option value="ACTIVE">{DOCUMENT_STATUS_LABELS.ACTIVE} · ACTIVE</option>
              <option value="REVOKED">{DOCUMENT_STATUS_LABELS.REVOKED} · REVOKED</option>
            </select>
          </Field>
          <ActionRow>
            <NeoPressButton type="submit" variant="primary">Appliquer les filtres</NeoPressButton>
            <RetryButton onClick={registry.reload} />
          </ActionRow>
        </form>
      </Panel>

      {registry.items ? (
        <DataTable
          caption="Documents de la page chargée"
          head={['Document', 'Type', 'Propriétaire', 'Statut', 'Version courante', 'Déposé le', 'Conservation']}
          rows={registry.items.map((document) => [
            <Link key="open" href={`/admin/documents/${encodeURIComponent(document.documentId)}/verification`} className="lbm-admin__link">
              <span className="lbm-mono">{document.documentId}</span>
            </Link>,
            <span key="type">{documentTypeLabel(document.documentType)}</span>,
            <Link key="owner" href={`/admin/utilisateurs/${encodeURIComponent(document.ownerUserId)}`} className="lbm-admin__link">
              <span className="lbm-mono">{document.ownerUserId}</span>
            </Link>,
            <span key="status">{documentStatusSeal(document.status)}</span>,
            <span key="version" className="lbm-mono">v{document.currentVersionNumber}</span>,
            <span key="when" className="lbm-mono">{formatWhen(document.createdAt)}</span>,
            <span key="retention">{retentionSummary(document.retention)}</span>,
          ])}
          empty={
            <EmptyNotice>
              {filtersActive
                ? 'Aucun Document ne correspond à ces filtres serveur.'
                : 'Aucun Document n’est enregistré dans le registre.'}
            </EmptyNotice>
          }
        />
      ) : null}

      {registry.hasMore ? (
        <ActionRow>
          <NeoPressButton type="button" variant="ghost" loading={registry.loadMoreBusy} disabled={registry.loadMoreBusy} onClick={registry.loadMore}>
            Charger la page suivante
          </NeoPressButton>
        </ActionRow>
      ) : null}
      {registry.loadMoreError ? <ActionError error={registry.loadMoreError} /> : null}

      <ActionRow>
        <Link href="/admin/documents/audit" className="lbm-admin__link">Audit et rétention (capacité absente)</Link>
        <Link href="/admin/documents/quarantaine" className="lbm-admin__link">Quarantaine (capacité absente)</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-37" items={gaps} />
    </>
  );
}

/* ─────────────── ADM-38 · vérification d'un Document (fiche & commandes) ─────────────── */

export function Admin38DocumentVerification(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!canReadDocuments(actor?.permissions)) return <AccessDenied />;
  return <DocumentVerificationContent {...props} />;
}

function DocumentVerificationContent({ unitId, pathname, params }: AdminUnitProps) {
  const documentId = params.id ?? '';
  const resource = useAdminResource<DocumentDetailView | DocumentsUnavailable>(
    (api, signal) => unavailableWhenNotInstalled(() => api.document(documentId, signal)),
    [documentId],
  );
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du Document" rows={5} />;

  if (isDocumentsUnavailable(resource.data)) {
    return (
      <>
        <PageHead title={ADMIN_UI_TERMS.DOCUMENT_VERIFICATION} lede="Fiche indisponible dans cet environnement." />
        <GapNotice
          title="Source de données non configurée · admin.documents.read"
          items={['La fiche du Document n’est pas installée dans cet environnement : la route répond 501. Aucune métadonnée ni empreinte n’est simulée.']}
        />
        <ActionRow>
          <Link href="/admin/documents" className="lbm-admin__link">Retour au registre</Link>
        </ActionRow>
        <GapNotice title="BACKEND_GAP · ADM-38" items={gaps} />
      </>
    );
  }

  const detail = resource.data;
  const activeVersions = detail.versions.filter((version) => version.status === 'ACTIVE').length;
  const revokedVersions = detail.versions.filter((version) => version.status === 'REVOKED').length;

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.DOCUMENT_VERIFICATION}
        lede="Lecture réelle des métadonnées, des versions et des empreintes SHA-256 enregistrées. Aucune décision de validation, de rejet ni de demande de complément n’existe côté serveur : cet écran ne fabrique aucun verdict."
        seal={{ tone: documentStatusTone(detail.status), label: documentStatusLabel(detail.status) }}
      />

      <KpiRow
        items={[
          { label: 'Versions', value: String(detail.versions.length) },
          { label: 'Versions actives', value: String(activeVersions) },
          { label: 'Versions révoquées', value: String(revokedVersions) },
          { label: 'Liens', value: String(detail.links.length) },
        ]}
      />

      <Panel title="Document (admin.documents.read)" zone="doc">
        <KeyValues
          title="Métadonnées du Document"
          items={[
            { label: 'Référence', value: detail.documentId },
            { label: 'Titre', value: detail.title },
            { label: 'Nom de fichier déclaré', value: detail.fileName },
            { label: 'Type', value: documentTypeLabel(detail.documentType) },
            { label: 'Classe de conservation', value: DOCUMENT_RETENTION_CLASS_LABELS[retentionClassForDocumentType(detail.documentType)] },
            { label: 'Conservation', value: retentionSummary(detail.retention) },
            { label: 'Note d’objet', value: detail.purposeNote ?? null },
            { label: 'Propriétaire', value: detail.ownerUserId },
            { label: 'Statut', value: `${documentStatusLabel(detail.status)} · ${detail.status}` },
            { label: 'Version courante', value: `v${detail.currentVersionNumber}` },
            { label: 'Créé le', value: formatWhen(detail.createdAt) },
            { label: 'Révoqué le', value: detail.revokedAt ? formatWhen(detail.revokedAt) : null },
            { label: 'Révoqué par', value: detail.revokedBy ?? null },
            { label: 'Motif de révocation', value: detail.revocationReason ?? null },
          ]}
        />
      </Panel>

      <DataTable
        caption="Versions et empreintes SHA-256 enregistrées"
        head={['Version', 'Statut', 'Contenu', 'Taille déclarée', 'Taille reçue', 'Empreinte SHA-256 enregistrée', 'Origine', 'Enregistrée le']}
        rows={detail.versions.map((version) => [
          <span key="number" className="lbm-mono">v{version.versionNumber}</span>,
          <span key="status">{versionStatusSeal(version.status)}</span>,
          <span key="content" className="lbm-mono lbm-caption">{version.contentType}</span>,
          <span key="declared" className="lbm-mono">{version.declaredSizeBytes} o</span>,
          <span key="received" className="lbm-mono">{version.sizeBytes !== undefined ? `${version.sizeBytes} o` : '—'}</span>,
          version.cryptographicHash ? (
            <code key="hash" className="lbm-mono lbm-caption lbm-admin__hash" aria-label={`Empreinte ${version.hashAlgorithm} enregistrée`}>
              {version.cryptographicHash}
            </code>
          ) : (
            <span key="hash" className="lbm-caption lbm-muted">Aucune empreinte : contenu non enregistré</span>
          ),
          <span key="origin" className="lbm-mono lbm-caption">{version.provenance}</span>,
          <span key="at" className="lbm-mono">{formatWhen(version.registeredAt ?? version.createdAt)}</span>,
        ])}
        empty={<EmptyNotice>Ce Document ne porte aucune version enregistrée.</EmptyNotice>}
      />

      {detail.versions.map((version) => (
        <VersionCommands
          key={version.versionId}
          documentId={detail.documentId}
          version={version}
          onChanged={resource.reload}
        />
      ))}

      <Panel title="Révocation du Document (incidents:arbitrate)" zone="form">
        <DocumentRevocation documentId={detail.documentId} detail={detail} onChanged={resource.reload} />
      </Panel>

      <Panel title="Liens vers les entités (lecture réelle)" zone="table">
        <DocumentLinksTable links={detail.links} />
      </Panel>

      <Panel title="Décision de vérification (indisponible)" zone="cta">
        <p className="lbm-body">
          Aucune décision de validation, de rejet ou de demande de complément n’est proposée : aucune route serveur ne la reçoit.
          Le contrôle d’intégrité ci-dessus est technique et ne tranche rien.
        </p>
        <UnavailableActions
          items={[
            { label: 'Valider le Document', capability: 'POST /admin/documents/:id/review/decide', reason: 'Capacité absente : aucune décision de validation n’existe côté serveur.' },
            { label: 'Rejeter le Document (motif gabarité)', capability: 'POST /admin/documents/:id/review/decide', reason: 'Capacité absente : aucun rejet ni motif standardisé n’est enregistré par le serveur.' },
            { label: 'Demander un complément', capability: 'POST /admin/documents/:id/review/decide', reason: 'Capacité absente : aucun statut « complément demandé » n’existe pour un Document.' },
          ]}
        />
      </Panel>

      <Panel title="Visionneuse et grille de contrôle (indisponibles)" zone="list">
        <UnavailableActions
          items={[
            { label: 'Ouvrir le contenu', capability: 'GET /admin/documents/:id/review', reason: 'Aucune route ADMIN ne livre le contenu : aucun binaire n’est affiché ni téléchargé depuis cet écran.' },
            { label: 'Grille de contrôle standardisée', capability: 'GET /admin/documents/:id/review', reason: 'Aucun critère n’est versionné côté serveur : aucune case n’est rendue.' },
          ]}
        />
      </Panel>

      <ActionRow>
        <Link href="/admin/documents" className="lbm-admin__link">Retour au registre</Link>
        <Link href="/admin/documents/quarantaine" className="lbm-admin__link">Quarantaine (capacité absente)</Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-38" items={gaps} />
    </>
  );
}

function DocumentLinksTable({ links }: { links: readonly DocumentLinkView[] }) {
  return (
    <DataTable
      caption="Liens du Document vers des entités"
      head={['Entité liée', 'Identifiant', 'Finalité', 'Version liée', 'Lié le', 'Acceptation']}
      rows={links.map((link) => {
        const href = entityHref(link.entityType, link.entityId);
        return [
          <span key="entity">
            {DOCUMENT_ENTITY_LABELS[link.entityType as keyof typeof DOCUMENT_ENTITY_LABELS] ?? link.entityType}{' '}
            <code className="lbm-mono lbm-caption">{link.entityType}</code>
          </span>,
          href ? (
            <Link key="id" href={href} className="lbm-admin__link">
              <span className="lbm-mono">{link.entityId}</span>
            </Link>
          ) : (
            <span key="id" className="lbm-mono">{link.entityId}</span>
          ),
          <span key="purpose">
            {DOCUMENT_LINK_PURPOSE_LABELS[link.linkPurpose as keyof typeof DOCUMENT_LINK_PURPOSE_LABELS] ?? link.linkPurpose}
          </span>,
          <span key="version" className="lbm-mono lbm-caption">{link.documentVersionId}</span>,
          <span key="at" className="lbm-mono">{formatWhen(link.createdAt)}</span>,
          <span key="accepted" className="lbm-mono">{link.acceptedAt ? formatWhen(link.acceptedAt) : '—'}</span>,
        ];
      })}
      empty={<EmptyNotice>Aucun lien n’est enregistré pour ce Document.</EmptyNotice>}
    />
  );
}

/** Motif + confirmation + envoi : seul canal d'une commande de révocation. */
function ReasonCommandForm({
  label,
  description,
  submitLabel,
  busy,
  error,
  onEdit,
  onSubmit,
}: {
  label: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  error: { state: string; correlationId?: string } | null;
  onEdit: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const problem = revocationReasonProblem(reason);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !confirmed || problem !== null) return;
    onSubmit(reason.trim());
  };

  return (
    <form onSubmit={submit} data-command-form={label}>
      <p className="lbm-body">{description}</p>
      <Field label="Motif" hint="Obligatoire · 3 à 1000 caractères ; le serveur revalide le motif.">
        <textarea
          required
          minLength={3}
          maxLength={1000}
          value={reason}
          onChange={(event) => {
            onEdit();
            setReason(event.target.value);
          }}
          aria-label={`Motif : ${label}`}
        />
      </Field>
      <label className="lbm-admin__claim-confirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>Je confirme l’envoi de « {label} » au serveur ; celui-ci revalide l’état courant, la permission et l’idempotence.</span>
      </label>
      <ActionRow>
        <NeoPressButton type="submit" variant="primary" loading={busy} disabled={busy || !confirmed || problem !== null}>
          {submitLabel}
        </NeoPressButton>
      </ActionRow>
      {reason.length > 0 && problem ? <p className="lbm-caption lbm-muted" role="note">{problem}</p> : null}
      {error ? <ActionError error={error} /> : null}
    </form>
  );
}

function DocumentRevocation({
  documentId,
  detail,
  onChanged,
}: {
  documentId: string;
  detail: DocumentSummaryView;
  onChanged: () => void;
}) {
  const api = useAdminApi();
  const actor = useAdminActor();
  const action = useSingleFlightAction<DocumentDetailView>();
  const commandKey = useCommandKey();
  const check: CapabilityCheck = canRevokeDocument(actor?.permissions, detail);

  if (detail.status === 'REVOKED') {
    return (
      <p className="lbm-body">
        Ce Document est révoqué depuis le {formatWhen(detail.revokedAt)}. Le motif enregistré est conservé ; l’historique reste append-only et aucune suppression physique n’est effectuée.
      </p>
    );
  }
  if (!check.allowed) return <p className="lbm-body" data-command-unavailable="true">{check.reason}</p>;
  if (!api || !canCorrectDocuments(actor?.permissions)) {
    return <p className="lbm-body" data-command-unavailable="true">La révocation n’est pas disponible dans cet environnement.</p>;
  }

  return (
    <ReasonCommandForm
      label="Révoquer le Document"
      description="Commande réelle : POST /admin/documents/:id/revoke. Le Document passe à REVOKED ; ses versions et liens restent consultables pour l’historique. Aucune pièce n’est supprimée."
      submitLabel="Révoquer le Document"
      busy={action.busy}
      error={action.error}
      onEdit={commandKey.reset}
      onSubmit={(reason) => {
        void action.run((signal) => api.revokeDocument(documentId, reason, signal, commandKey.get())).then((updated) => {
          if (updated) {
            commandKey.reset();
            onChanged();
          }
        });
      }}
    />
  );
}

function VersionCommands({
  documentId,
  version,
  onChanged,
}: {
  documentId: string;
  version: DocumentVersionView;
  onChanged: () => void;
}) {
  const actor = useAdminActor();
  const integrity = canVerifyVersionIntegrity(actor?.permissions, version);
  const revoke = canRevokeVersion(actor?.permissions, version);

  return (
    <Panel title={`Version ${version.versionNumber} · ${versionStatusLabel(version.status)}`} zone="cta">
      <div className="lbm-admin__integrity">
        <IntegrityControl documentId={documentId} versionId={version.versionId} check={integrity} />
        {version.status === 'REVOKED' ? (
          <p className="lbm-body">
            Révoquée le {formatWhen(version.revokedAt)} · motif enregistré : {version.revocationReason ?? '—'}. La version reste référençable : les acceptations existantes ne sont pas rompues.
          </p>
        ) : null}
        {revoke.allowed ? (
          <RevokeVersionForm documentId={documentId} versionId={version.versionId} versionNumber={version.versionNumber} onChanged={onChanged} />
        ) : (
          <p className="lbm-body" data-command-unavailable="true">{revoke.reason}</p>
        )}
      </div>
    </Panel>
  );
}

function IntegrityControl({
  documentId,
  versionId,
  check,
}: {
  documentId: string;
  versionId: string;
  check: CapabilityCheck;
}) {
  const api = useAdminApi();
  const action = useSingleFlightAction<DocumentIntegrityReport>();
  const commandKey = useCommandKey();

  if (!check.allowed) {
    return (
      <p className="lbm-body" data-integrity-unavailable="true">
        Contrôle d’intégrité indisponible : {check.reason}
      </p>
    );
  }

  const run = () => {
    if (!api) return;
    void action.run((signal) => api.verifyDocumentVersionIntegrity(documentId, versionId, signal, commandKey.get())).then((report) => {
      if (report) commandKey.reset();
    });
  };

  return (
    <div data-integrity-control="true">
      <p className="lbm-body">
        Contrôle technique : le serveur recalcule l’empreinte SHA-256 du contenu stocké et la compare à celle enregistrée. Ce contrôle ne valide ni ne rejette la pièce.
      </p>
      <ActionRow>
        <NeoPressButton type="button" variant="ghost" loading={action.busy} disabled={action.busy || !api} onClick={run}>
          Recalculer l’empreinte (contrôle technique)
        </NeoPressButton>
      </ActionRow>
      {action.error ? <ActionError error={action.error} /> : null}
      {action.result ? <IntegrityResult report={action.result} /> : null}
    </div>
  );
}

function IntegrityResult({ report }: { report: DocumentIntegrityReport }) {
  const verdict = integrityVerdict(report);
  return (
    <div role="status" data-integrity-result={verdict.tone}>
      <StatusSeal tone={verdict.tone} label={verdict.label} size="sm" />
      <p className="lbm-body">{verdict.detail}</p>
      <KeyValues
        title="Résultat du contrôle technique"
        items={[
          { label: 'Empreinte enregistrée', value: report.expectedHash },
          { label: 'Empreinte recalculée', value: report.actualHash },
          { label: 'Contenu présent', value: formatBoolean(report.objectPresent) },
          { label: 'Concordance', value: formatBoolean(report.match) },
          { label: 'Contrôlé le', value: formatWhen(report.verifiedAt) },
          { label: 'Portée', value: 'Contrôle technique d’intégrité — pas une certification juridique ni un horodatage qualifié' },
        ]}
      />
    </div>
  );
}

function RevokeVersionForm({
  documentId,
  versionId,
  versionNumber,
  onChanged,
}: {
  documentId: string;
  versionId: string;
  versionNumber: number;
  onChanged: () => void;
}) {
  const api = useAdminApi();
  const action = useSingleFlightAction<DocumentVersionView>();
  const commandKey = useCommandKey();
  if (!api) return <p className="lbm-body">La révocation n’est pas disponible dans cet environnement.</p>;

  return (
    <ReasonCommandForm
      label={`Révoquer la version ${versionNumber}`}
      description="Commande réelle : POST /admin/documents/:id/versions/:versionId/revoke. La version passe à REVOKED ; l’historique est ajouté, jamais réécrit."
      submitLabel={`Révoquer la version ${versionNumber}`}
      busy={action.busy}
      error={action.error}
      onEdit={commandKey.reset}
      onSubmit={(reason) => {
        void action.run((signal) => api.revokeDocumentVersion(documentId, versionId, reason, signal, commandKey.get())).then((updated) => {
          if (updated) {
            commandKey.reset();
            onChanged();
          }
        });
      }}
    />
  );
}

/* ───────────────────── ADM-39 · quarantaine des Documents (BACKEND_GAP) ───────────────────── */

export function Admin39DocumentQuarantine(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!canReadDocuments(actor?.permissions)) return <AccessDenied />;
  return <DocumentQuarantineContent {...props} />;
}

function DocumentQuarantineContent({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.DOCUMENT_QUARANTINE}
        lede="Aucune file de quarantaine n’est lisible depuis l’ADMIN : le serveur ne connaît ni statut ni route d’isolement pour un Document. Cet écran n’isole, ne lève et ne confirme rien."
        seal={{ tone: 'slate', label: 'Capacité absente' }}
      />
      <KpiRow
        items={[
          { label: 'Documents isolés', value: '—' },
          { label: 'En examen', value: '—' },
          { label: 'Fraudes confirmées', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-count="true">
        « — » signifie que la capacité est absente : ce n’est ni zéro ni une liste vide.
      </p>
      <Panel title="File de quarantaine" zone="list">
        <p className="lbm-body" data-backend-gap="true">
          Liste indisponible : GET /admin/documents/quarantine n’existe pas. Aucun Document n’est présenté comme isolé.
        </p>
      </Panel>
      <Panel title="Décisions d’isolement (indisponibles)" zone="cta">
        <UnavailableActions
          items={[
            { label: 'Lever l’isolement', capability: 'POST /admin/documents/:id/quarantine/lift', reason: 'Capacité absente : aucune levée d’isolement n’est exécutable depuis l’ADMIN.' },
            { label: 'Confirmer la fraude', capability: 'POST /admin/documents/:id/quarantine/confirm-fraud', reason: 'Capacité absente : aucune confirmation de fraude n’est exécutable, et aucun renvoi vers un compte n’est déduit.' },
            { label: 'Demander une pièce alternative', capability: 'POST /admin/documents/:id/quarantine/request-replacement', reason: 'Capacité absente : aucun statut « complément demandé » n’existe pour un Document.' },
          ]}
        />
      </Panel>
      <Panel title="Examen sécurisé (indisponible)" zone="doc">
        <UnavailableActions
          items={[
            { label: 'Analyse technique et comparaison de doublons', capability: 'GET /admin/documents/quarantine', reason: 'Capacité absente : aucun pipeline de détection n’est branché à l’ADMIN. Aucun doublon n’est déduit.' },
          ]}
        />
      </Panel>
      <ActionRow>
        <Link href="/admin/documents" className="lbm-admin__link">Registre des Documents</Link>
        <Link href="/admin/documents/audit" className="lbm-admin__link">Audit et rétention (capacité absente)</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-39" items={adminGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────────── ADM-40 · audit & rétention des Documents (BACKEND_GAP) ───────────────────── */

export function Admin40DocumentAudit(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!canReadDocuments(actor?.permissions)) return <AccessDenied />;
  return <DocumentAuditContent {...props} />;
}

function DocumentAuditContent({ unitId, pathname }: AdminUnitProps) {
  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.DOCUMENT_AUDIT}
        lede="Journal d’accès et politiques de rétention : aucune route ADMIN ne les lit dans cet environnement. Aucune purge, aucun export et aucune durée ne sont proposés."
        seal={{ tone: 'slate', label: 'Capacité absente' }}
      />
      <KpiRow
        items={[
          { label: 'Accès journalisés', value: '—' },
          { label: 'Purges ce mois', value: '—' },
          { label: 'Conservation légale prolongée', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-count="true">
        Les compteurs « — » sont des capacités absentes : aucun total n’est calculé dans le navigateur.
      </p>

      <Panel title="Journal d’accès aux Documents" zone="table">
        <p className="lbm-body" data-backend-gap="true">
          Journal indisponible : GET /admin/documents/access-log n’existe pas. admin.audit.list n’est pas utilisé comme journal documentaire et aucun accès n’est présenté.
        </p>
      </Panel>

      <DataTable
        caption="Classes de conservation par type de Document (règles de domaine)"
        head={['Type de Document', 'Classe de conservation', 'Durée']}
        rows={DOCUMENT_TYPES.map((type) => [
          <span key="label">{DOCUMENT_TYPE_LABELS[type]}</span>,
          <span key="class">{DOCUMENT_RETENTION_CLASS_LABELS[retentionClassForDocumentType(type)]}</span>,
          <span key="duration" className="lbm-caption">
            Non lue ici (aucune route ADMIN des politiques). Voir la fiche de chaque Document.
          </span>,
        ])}
      />

      <Panel title="Purge et export (indisponibles)" zone="cta">
        <UnavailableActions
          items={[
            { label: 'Lancer une purge', capability: 'POST /admin/documents/retention/purge', reason: 'Capacité absente. La purge reste subordonnée à la validation juridique des durées : rien n’est proposé et la rétention n’est pas modifiée.' },
            { label: 'Exporter le journal d’accès', capability: 'GET /admin/documents/access-log', reason: 'Capacité absente : aucune route d’export journalisé n’existe.' },
          ]}
        />
      </Panel>

      <ActionRow>
        <Link href="/admin/documents" className="lbm-admin__link">Registre des Documents</Link>
        <Link href="/admin/documents/quarantaine" className="lbm-admin__link">Quarantaine (capacité absente)</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-40" items={adminGapsFor(unitId, pathname)} />
    </>
  );
}

