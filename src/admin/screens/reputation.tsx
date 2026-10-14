/**
 * P4E-2-DESIGN-ADMIN-REPUTATION — unités exactes du Master
 * « ADM — réputation (ledger, corrections & audit) » (ADM-34 / ADM-36)
 * et « ADM — réputation (contestations) » (ADM-35).
 *
 * Capacités serveur réellement utilisées :
 *  - ledger : admin.reputation.entries.list / read (audit:read) ;
 *  - correction : admin.reputation.entries.correct {action: REVERSE|RESTORE,
 *    reason} (incidents:arbitrate, Idempotency-Key) ;
 *  - réconciliation d'un sujet : admin.reputation.reconcile {subjectUserId}
 *    (incidents:arbitrate) — relit les faits déjà persistés, n'invente rien.
 *
 * Jamais appelées : reputation.mine.read / entries / reconcile (scope self),
 * aucune route de contestation, aucune route d'intégrité de chaîne.
 * Aucun score 0-100, aucune pondération, aucun delta compensatoire, aucune
 * mutation simulée dans le navigateur.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  REPUTATION_SOURCE_ENTITY_TYPES,
  REPUTATION_STATUS_VALUES,
  type ReputationSourceEntityType,
  type ReputationStatus,
} from '../../domain/reputationRules';
import type {
  AdminPage,
  ReputationCorrectionInput,
  ReputationEntryDetail,
  ReputationEntryView,
  ReputationListOptions,
  ReputationReconciliationReport,
} from '../api';
import { newIdempotencyKey } from '../api';
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
  PRODUCT_LABELS,
  REPUTATION_CATEGORY_LABELS,
  REPUTATION_CORRECTION_ACTION_LABELS,
  REPUTATION_DIRECTION_LABELS,
  REPUTATION_DIRECTION_TONES,
  REPUTATION_PROVENANCE_LABELS,
  REPUTATION_SOURCE_ENTITY_LABELS,
  REPUTATION_STATUS_LABELS,
  REPUTATION_STATUS_TONES,
  formatBoolean,
  formatDateTime,
} from '../vocabulary';
import { SystemFeedback } from '../../public/SystemFeedback';

const PAGE_LIMIT = 100;
export const REPUTATION_READ_PERMISSION = 'audit:read';
export const REPUTATION_DECIDE_PERMISSION = 'incidents:arbitrate';

function has(permissions: readonly string[] | undefined, permission: string): boolean {
  return Boolean(permissions?.includes(permission));
}

function formatWhen(value: string | undefined): string {
  return formatDateTime(value) ?? '—';
}

function AccessDenied() {
  return <SystemFeedback state="403" />;
}

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

function sourceHref(type: ReputationSourceEntityType, id: string): string | null {
  switch (type) {
    case 'CONTRACT':
      return `/admin/contrats/${encodeURIComponent(id)}`;
    case 'CLAIM':
      return `/admin/litiges/${encodeURIComponent(id)}`;
    case 'REPLACEMENT':
      return `/admin/remplacements/${encodeURIComponent(id)}`;
    case 'ACCOUNT':
      return `/admin/utilisateurs/${encodeURIComponent(id)}`;
    case 'PAYMENT':
      return null;
    default:
      return null;
  }
}

function statusSeal(status: ReputationStatus) {
  return (
    <span className="lbm-admin__reputation-status" aria-label={`Statut ${REPUTATION_STATUS_LABELS[status]} (${status})`}>
      <StatusSeal tone={REPUTATION_STATUS_TONES[status]} label={REPUTATION_STATUS_LABELS[status]} size="sm" />
      <code className="lbm-mono lbm-caption">{status}</code>
    </span>
  );
}

function directionSeal(direction: ReputationEntryView['direction']) {
  return (
    <span className="lbm-admin__reputation-status" aria-label={`Direction ${REPUTATION_DIRECTION_LABELS[direction]} (${direction})`}>
      <StatusSeal tone={REPUTATION_DIRECTION_TONES[direction]} label={REPUTATION_DIRECTION_LABELS[direction]} size="sm" />
      <code className="lbm-mono lbm-caption">{direction}</code>
    </span>
  );
}

function impactLabel(impact: number): string {
  if (!Number.isFinite(impact)) return '—';
  return impact > 0 ? `+${impact}` : String(impact);
}

function toIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

interface AppliedFilters {
  readonly subjectUserId: string;
  readonly status: '' | ReputationStatus;
  readonly sourceEntityType: '' | ReputationSourceEntityType;
  readonly from: string;
  readonly to: string;
}

const EMPTY_FILTERS: AppliedFilters = {
  subjectUserId: '',
  status: '',
  sourceEntityType: '',
  from: '',
  to: '',
};

function listQuery(filters: AppliedFilters, cursor?: string | null): ReputationListOptions {
  return {
    limit: PAGE_LIMIT,
    cursor: cursor ?? null,
    ...(filters.subjectUserId.trim() ? { subjectUserId: filters.subjectUserId.trim() } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.sourceEntityType ? { sourceEntityType: filters.sourceEntityType } : {}),
    ...(toIso(filters.from) ? { from: toIso(filters.from) } : {}),
    ...(toIso(filters.to) ? { to: toIso(filters.to) } : {}),
  };
}

interface LedgerPageState {
  readonly items: readonly ReputationEntryView[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
}

function useReputationPages(filters: AppliedFilters) {
  const api = useAdminApi();
  const filterKey = JSON.stringify(filters);
  const resource = useAdminResource<LedgerPageState>(
    async (currentApi, signal) => {
      const page = await currentApi.reputationEntries({ ...listQuery(filters), signal });
      return { items: page.items, cursor: page.cursor, hasMore: page.hasMore };
    },
    [filterKey],
  );
  const nextPage = useSingleFlightAction<AdminPage<ReputationEntryView>>();
  const [additional, setAdditional] = useState<readonly ReputationEntryView[]>([]);
  const [pageState, setPageState] = useState<{ cursor: string | null; hasMore: boolean } | null>(null);

  useEffect(() => {
    setAdditional([]);
    setPageState(null);
    nextPage.reset();
  }, [filterKey, nextPage.reset]);

  const items = resource.data ? [...resource.data.items, ...additional] : null;
  const cursor = pageState ? pageState.cursor : resource.data?.cursor ?? null;
  const hasMore = pageState ? pageState.hasMore : resource.data?.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (!api || !cursor || !hasMore || nextPage.busy) return;
    void nextPage.run((signal) => api.reputationEntries({ ...listQuery(filters), cursor, signal })).then((page) => {
      if (!page) return;
      setAdditional((previous) => [...previous, ...page.items]);
      setPageState({ cursor: page.cursor, hasMore: page.hasMore });
    });
  }, [api, cursor, filters, hasMore, nextPage.busy, nextPage.run]);

  const reload = useCallback(() => {
    setAdditional([]);
    setPageState(null);
    nextPage.reset();
    resource.reload();
  }, [nextPage.reset, resource.reload]);

  return {
    status: resource.status,
    error: resource.error,
    items,
    hasMore,
    loadMore,
    loadMoreBusy: nextPage.busy,
    loadMoreError: nextPage.error,
    reload,
  };
}

function filterLocal(items: readonly ReputationEntryView[], query: string): ReputationEntryView[] {
  const needle = query.trim().toLocaleLowerCase('fr-FR');
  if (!needle) return [...items];
  return items.filter((entry) =>
    [
      entry.reputationId,
      entry.subjectUserId,
      entry.sourceEntityId,
      entry.sourceEvent,
      entry.ruleCode,
      entry.actorId,
    ].some((value) => value.toLocaleLowerCase('fr-FR').includes(needle)),
  );
}

/* ───────────────────────────── ADM-34 · ledger & corrections ───────────────────────────── */

export function Admin34ReputationLedger(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, REPUTATION_READ_PERMISSION)) return <AccessDenied />;
  return <ReputationLedgerContent {...props} />;
}

function ReputationLedgerContent({ unitId, pathname }: AdminUnitProps) {
  const api = useAdminApi();
  const [draft, setDraft] = useState<AppliedFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_FILTERS);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pages = useReputationPages(applied);
  const gaps = adminGapsFor(unitId, pathname);
  const visible = pages.items ? filterLocal(pages.items, query) : [];

  if (pages.status === 'error') return <SystemFeedback {...pages.error!} retry={pages.reload} />;
  if (pages.status === 'loading' && !pages.items) return <LoadingBlock label="Chargement du ledger de réputation" rows={6} />;

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedId(null);
    setApplied({ ...draft });
  };

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.REPUTATION_LEDGER}
        lede="Écritures réellement persistées. L’impact affiché est l’entier stocké sur l’entrée ; aucun score 0-100 n’est calculé. Une correction ADMIN révoque ou rétablit une entrée existante, sans supprimer l’histoire."
      />
      <KpiRow
        items={[
          { label: 'Entrées de la page chargée', value: pages.items ? String(pages.items.length) : '—' },
          { label: 'ACTIVE sur la page', value: pages.items ? String(pages.items.filter((entry) => entry.status === 'ACTIVE').length) : '—' },
          { label: 'REVERSED sur la page', value: pages.items ? String(pages.items.filter((entry) => entry.status === 'REVERSED').length) : '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-score="true">
        Ces comptes portent uniquement sur les pages réellement chargées. Aucun impact n’est additionné, aucune note n’est dérivée.
      </p>

      <Panel title="Filtres serveur (admin.reputation.entries.list)" zone="form">
        <form onSubmit={applyFilters} className="lbm-admin__reputation-filters">
          <Field label="Sujet (identifiant de compte)" hint="Filtre serveur subjectUserId.">
            <input
              value={draft.subjectUserId}
              onChange={(event) => setDraft((current) => ({ ...current, subjectUserId: event.target.value }))}
              aria-label="Identifiant du sujet"
              autoComplete="off"
            />
          </Field>
          <Field label="Statut">
            <select
              value={draft.status}
              aria-label="Filtre de statut du ledger"
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as AppliedFilters['status'] }))}
            >
              <option value="">Tous les statuts de la page demandée</option>
              {REPUTATION_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>{REPUTATION_STATUS_LABELS[status]} · {status}</option>
              ))}
            </select>
          </Field>
          <Field label="Type d’entité source">
            <select
              value={draft.sourceEntityType}
              aria-label="Filtre de type d’entité source"
              onChange={(event) => setDraft((current) => ({ ...current, sourceEntityType: event.target.value as AppliedFilters['sourceEntityType'] }))}
            >
              <option value="">Tous les types</option>
              {REPUTATION_SOURCE_ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{REPUTATION_SOURCE_ENTITY_LABELS[type]} · {type}</option>
              ))}
            </select>
          </Field>
          <Field label="Fait depuis" hint="Date du fait (occurredAt), jamais celle d’écriture.">
            <input
              type="datetime-local"
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              aria-label="Période from"
            />
          </Field>
          <Field label="Fait jusqu’à">
            <input
              type="datetime-local"
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              aria-label="Période to"
            />
          </Field>
          <ActionRow>
            <NeoPressButton type="submit" variant="primary">Appliquer les filtres</NeoPressButton>
            <RetryButton onClick={pages.reload} />
          </ActionRow>
        </form>
      </Panel>

      <Panel title="Recherche locale (page chargée)" zone="form">
        <Field label="Recherche" hint="Filtre local sur les identifiants réellement chargés.">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Recherche locale dans le ledger"
          />
        </Field>
      </Panel>

      <DataTable
        caption="Écritures de réputation de la page chargée"
        head={['Entrée', 'Sujet', 'Fait', 'Entité source', 'Règle', 'Impact stocké', 'Statut', 'Fait le']}
        rows={visible.map((entry) => [
          <button
            key="open"
            type="button"
            className="lbm-admin__link"
            onClick={() => setSelectedId(entry.reputationId)}
          >
            <span className="lbm-mono">{entry.reputationId}</span>
          </button>,
          <span key="subject" className="lbm-mono">{entry.subjectUserId}</span>,
          <span key="event"><code className="lbm-mono lbm-caption">{entry.sourceEvent}</code></span>,
          <span key="entity">
            {REPUTATION_SOURCE_ENTITY_LABELS[entry.sourceEntityType]}{' '}
            <code className="lbm-mono lbm-caption">{entry.sourceEntityType}</code>
            {' · '}
            <span className="lbm-mono">{entry.sourceEntityId}</span>
          </span>,
          <span key="rule" className="lbm-mono">{entry.ruleCode}</span>,
          <span key="impact">
            <span className="lbm-mono">{impactLabel(entry.impact)}</span> {directionSeal(entry.direction)}
          </span>,
          <span key="status">{statusSeal(entry.status)}</span>,
          <span key="when" className="lbm-mono">{formatWhen(entry.occurredAt)}</span>,
        ])}
        empty={<EmptyNotice>{pages.items && pages.items.length === 0 ? 'Aucune entrée renvoyée par admin.reputation.entries.list pour ces filtres.' : 'Aucune entrée de la page chargée ne correspond à la recherche locale.'}</EmptyNotice>}
      />

      {pages.hasMore ? (
        <ActionRow>
          <NeoPressButton type="button" variant="ghost" loading={pages.loadMoreBusy} disabled={pages.loadMoreBusy} onClick={pages.loadMore}>
            Charger la page suivante
          </NeoPressButton>
        </ActionRow>
      ) : null}
      {pages.loadMoreError ? <ActionError error={pages.loadMoreError} /> : null}

      {selectedId ? (
        <ReputationEntryPanel
          reputationId={selectedId}
          canDecide={Boolean(api)}
          onClose={() => setSelectedId(null)}
          onChanged={pages.reload}
        />
      ) : (
        <Panel title="Détail d’une entrée" zone="doc">
          <p className="lbm-body">Ouvrez une entrée du tableau pour lire l’explication stockée, l’historique append-only et, si la permission incidents:arbitrate est présente, proposer REVERSE ou RESTORE.</p>
        </Panel>
      )}

      <ReputationReconcilePanel enabled={Boolean(api)} />

      <ActionRow>
        <Link href="/admin/reputation/contestations" className="lbm-admin__link">Recours (capacité absente)</Link>
        <Link href="/admin/reputation/audit" className="lbm-admin__link">Audit d’intégrité (capacité absente)</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-34" items={gaps} />
    </>
  );
}

function ReputationEntryPanel({
  reputationId,
  canDecide,
  onClose,
  onChanged,
}: {
  reputationId: string;
  canDecide: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const api = useAdminApi();
  const actor = useAdminActor();
  const allowed = has(actor?.permissions, REPUTATION_DECIDE_PERMISSION);
  const resource = useAdminResource((currentApi, signal) => currentApi.reputationEntry(reputationId, signal), [reputationId]);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de l’entrée de réputation" rows={4} />;

  const entry = resource.data;
  const href = sourceHref(entry.sourceEntityType, entry.sourceEntityId);

  return (
    <Panel title={`Entrée ${entry.reputationId}`} zone="doc">
      <div data-block="reputation-entry" data-no-invented-score="true">
        <KeyValues
          title="Entrée de réputation"
          items={[
            { label: 'Référence', value: entry.reputationId },
            { label: 'Sujet', value: entry.subjectUserId },
            { label: 'Fait source', value: entry.sourceEvent },
            { label: 'Preuve source', value: entry.sourceEventId ?? null },
            { label: 'Entité source', value: `${entry.sourceEntityType} · ${entry.sourceEntityId}` },
            { label: 'Règle', value: `${entry.ruleCode} · ${entry.ruleVersion}` },
            { label: 'Catégorie', value: REPUTATION_CATEGORY_LABELS[entry.category] },
            { label: 'Provenance', value: `${REPUTATION_PROVENANCE_LABELS[entry.provenance]} · ${entry.provenance}` },
            { label: 'Impact stocké', value: impactLabel(entry.impact) },
            { label: 'Acteur du fait', value: entry.actorId },
            { label: 'Fait le', value: formatWhen(entry.occurredAt) },
            { label: 'Écrite le', value: formatWhen(entry.createdAt) },
            { label: 'Règle encore au catalogue', value: formatBoolean(entry.ruleStillInCatalog) },
            { label: 'Révoquée le', value: entry.reversedAt ? formatWhen(entry.reversedAt) : null },
            { label: 'Révoquée par', value: entry.reversedBy ?? null },
            { label: 'Motif de révocation', value: entry.reversalReason ?? null },
          ]}
        />
        <p className="lbm-body">{statusSeal(entry.status)} {directionSeal(entry.direction)}</p>
        <p className="lbm-body">{entry.explanation}</p>
        {href ? (
          <p className="lbm-body">
            <Link href={href} className="lbm-admin__link">
              Ouvrir {REPUTATION_SOURCE_ENTITY_LABELS[entry.sourceEntityType]} {entry.sourceEntityId}
            </Link>
          </p>
        ) : (
          <p className="lbm-caption lbm-muted">Aucune fiche ADMIN unitaire n’existe pour ce type d’entité source.</p>
        )}
        <h3 className="lbm-title-2">Historique append-only</h3>
        {entry.history.length === 0 ? (
          <EmptyNotice>Aucune correction ADMIN n’est enregistrée sur cette entrée.</EmptyNotice>
        ) : (
          <DataTable
            caption="Historique des corrections de l’entrée"
            head={['Quand', 'Acteur', 'Action', 'De', 'Vers', 'Motif']}
            rows={entry.history.map((item) => [
              <span key="at" className="lbm-mono">{formatWhen(item.at)}</span>,
              <span key="actor" className="lbm-mono">{item.actorId}</span>,
              <span key="action" className="lbm-mono">{item.action}</span>,
              <span key="from" className="lbm-mono">{item.fromStatus}</span>,
              <span key="to" className="lbm-mono">{item.toStatus}</span>,
              <span key="reason">{item.reason}</span>,
            ])}
          />
        )}
        {canDecide && allowed ? (
          <ReputationCorrectionForm entry={entry} onChanged={() => { resource.reload(); onChanged(); }} />
        ) : (
          <p className="lbm-body">
            {allowed
              ? 'La correction n’est pas disponible dans cet environnement.'
              : 'La permission serveur incidents:arbitrate est absente ; aucun formulaire de correction n’est rendu.'}
          </p>
        )}
        <ActionRow>
          <NeoPressButton type="button" variant="ghost" onClick={onClose}>Fermer le détail</NeoPressButton>
          <RetryButton onClick={resource.reload} />
        </ActionRow>
      </div>
    </Panel>
  );
}

function ReputationCorrectionForm({
  entry,
  onChanged,
}: {
  entry: ReputationEntryDetail;
  onChanged: () => void;
}) {
  const api = useAdminApi();
  const action = useSingleFlightAction<ReputationEntryDetail>();
  const actionKey = useCommandKey();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const command: ReputationCorrectionInput['action'] | null =
    entry.status === 'ACTIVE' ? 'REVERSE' : entry.status === 'REVERSED' ? 'RESTORE' : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !command || !confirmed || reason.trim().length < 3) return;
    void action.run((signal) => api.correctReputationEntry(entry.reputationId, { action: command, reason: reason.trim() }, signal, actionKey.get())).then((updated) => {
      if (updated) {
        actionKey.reset();
        setReason('');
        setConfirmed(false);
        onChanged();
      }
    });
  };

  if (!command) {
    return <p className="lbm-body">Le statut serveur de cette entrée n’accepte ni REVERSE ni RESTORE.</p>;
  }

  return (
    <form onSubmit={submit} data-correction-form="true">
      <p className="lbm-body">
        Commande réelle : <code className="lbm-mono">{command}</code> — {REPUTATION_CORRECTION_ACTION_LABELS[command]}.
        L’histoire n’est pas réécrite : une ligne est ajoutée à l’historique.
      </p>
      <Field label="Motif" hint="Obligatoire · 3 à 1000 caractères ; le serveur refuse un motif vide.">
        <textarea
          required
          minLength={3}
          maxLength={1000}
          value={reason}
          onChange={(event) => {
            actionKey.reset();
            setReason(event.target.value);
          }}
          aria-label="Motif de correction de réputation"
        />
      </Field>
      <label className="lbm-admin__claim-confirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>Je confirme l’envoi de {command} au serveur ; celui-ci revalide l’état courant et l’idempotence.</span>
      </label>
      <ActionRow>
        <NeoPressButton type="submit" variant="primary" loading={action.busy} disabled={action.busy || !confirmed || reason.trim().length < 3}>
          Envoyer {command}
        </NeoPressButton>
      </ActionRow>
      {action.error ? <ActionError error={action.error} /> : null}
      {action.result ? <p role="status" className="lbm-caption">Réponse serveur : {action.result.status}</p> : null}
    </form>
  );
}

function ReputationReconcilePanel({ enabled }: { enabled: boolean }) {
  const api = useAdminApi();
  const actor = useAdminActor();
  const allowed = has(actor?.permissions, REPUTATION_DECIDE_PERMISSION);
  const action = useSingleFlightAction<ReputationReconciliationReport>();
  const actionKey = useCommandKey();
  const [subjectUserId, setSubjectUserId] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!enabled || !allowed) {
    return (
      <Panel title="Réconciliation d’un sujet" zone="form">
        <p className="lbm-body">
          {allowed
            ? 'La réconciliation n’est pas disponible dans cet environnement.'
            : 'La permission serveur incidents:arbitrate est absente ; aucun formulaire de réconciliation n’est rendu.'}
        </p>
      </Panel>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || !confirmed || !subjectUserId.trim()) return;
    void action.run((signal) => api.reconcileReputation(subjectUserId.trim(), signal, actionKey.get())).then((report) => {
      if (report) {
        actionKey.reset();
        setConfirmed(false);
      }
    });
  };

  return (
    <Panel title="Réconciliation d’un sujet" zone="form">
      <p className="lbm-body">
        Relit les faits déjà persistés de ce compte et n’ajoute que les entrées manquantes. Ce n’est pas une vérification de chaîne, ni un nouveau calcul de note.
      </p>
      <form onSubmit={submit} data-reconcile-form="true">
        <Field label="Identifiant du sujet" hint="subjectUserId obligatoire côté serveur.">
          <input
            required
            value={subjectUserId}
            onChange={(event) => {
              actionKey.reset();
              setSubjectUserId(event.target.value);
            }}
            aria-label="Identifiant du sujet à réconcilier"
            autoComplete="off"
          />
        </Field>
        <label className="lbm-admin__claim-confirm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Je confirme l’envoi de la réconciliation ; la commande est idempotente côté serveur.</span>
        </label>
        <ActionRow>
          <NeoPressButton type="submit" variant="ghost" loading={action.busy} disabled={action.busy || !confirmed || !subjectUserId.trim()}>
            Réconcilier le sujet
          </NeoPressButton>
        </ActionRow>
      </form>
      {action.error ? <ActionError error={action.error} /> : null}
      {action.result ? (
        <KeyValues
          title="Rapport de réconciliation"
          items={[
            { label: 'Sujet', value: action.result.subjectUserId },
            { label: 'Faits parcourus', value: String(action.result.scanned) },
            { label: 'Entrées ajoutées', value: String(action.result.appended) },
            { label: 'Doublons', value: String(action.result.duplicates) },
            { label: 'Version des règles', value: action.result.rulesVersion },
            { label: 'Réconcilié le', value: formatWhen(action.result.reconciledAt) },
            { label: 'Finalité', value: action.result.purpose },
          ]}
        />
      ) : null}
    </Panel>
  );
}

/* ───────────────────────────── ADM-35 · contestations ───────────────────────────── */

export function Admin35ReputationContests(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, REPUTATION_READ_PERMISSION)) return <AccessDenied />;
  return <ReputationContestsContent {...props} />;
}

function ReputationContestsContent({ unitId, pathname }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.REPUTATION_CONTESTS} — indisponible`}
        lede="Aucune route serveur de recours sur une entrée de réputation n’existe. Aucune file n’est fabriquée et aucune décision n’est simulée."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow
        items={[
          { label: 'Recours en attente', value: '—' },
          { label: 'Taux d’acceptation', value: '—' },
          { label: 'SLA', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-score="true">Les métriques de recours ne sont pas exposées : « — » n’est pas un zéro réel.</p>
      <DataTable
        caption="File de recours sur le ledger"
        head={['Date', 'Sujet', 'Entrée', 'Motif', 'SLA']}
        rows={[]}
        empty={<EmptyNotice>Aucune ressource de recours n’est lisible : la table reste vide.</EmptyNotice>}
      />
      <Panel title="Dossier comparatif" zone="doc">
        <p className="lbm-body">Le produit ne connaît aucun objet de recours sur une entrée de réputation. Ouvrir un Claim n’est pas une décision sur le ledger. Aucun formulaire n’est rendu.</p>
      </Panel>
      <ActionRow>
        <Link href="/admin/reputation" className="lbm-admin__link">Retour au ledger</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-35" items={gaps} />
    </>
  );
}

/* ───────────────────────────── ADM-36 · audit ───────────────────────────── */

export function Admin36ReputationAudit(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, REPUTATION_READ_PERMISSION)) return <AccessDenied />;
  return <ReputationAuditContent {...props} />;
}

function ReputationAuditContent({ unitId, pathname }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title={`${ADMIN_UI_TERMS.REPUTATION_AUDIT} — indisponible`}
        lede="Aucune route serveur de vérification de chaîne n’existe. Aucun rapport n’est lancé ni simulé. La réconciliation d’un sujet (ADM-34) n’est pas une preuve d’intégrité."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow
        items={[
          { label: 'Dernière vérification', value: '—' },
          { label: 'Entrées vérifiées', value: '—' },
          { label: 'Chaîne', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-score="true">Aucun résultat intègre ou rompu n’est affiché : la capacité est absente.</p>
      <DataTable
        caption="Vérifications d’intégrité"
        head={['Horodatage', 'Périmètre', 'Résultat', 'Anomalies']}
        rows={[]}
        empty={<EmptyNotice>Aucune vérification d’intégrité n’est lisible.</EmptyNotice>}
      />
      <Panel title="Contrôles non exposés" zone="list">
        <ul className="lbm-admin__list">
          <li className="lbm-admin__row">Chaîne de hash — non exposée</li>
          <li className="lbm-admin__row">Cohérence des soldes — aucun solde n’est stocké</li>
          <li className="lbm-admin__row">Correspondance écritures / faits — non exposée ici</li>
          <li className="lbm-admin__row">Écritures orphelines — non exposées</li>
        </ul>
      </Panel>
      <ActionRow>
        <Link href="/admin/reputation" className="lbm-admin__link">Retour au ledger</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-36" items={gaps} />
    </>
  );
}
