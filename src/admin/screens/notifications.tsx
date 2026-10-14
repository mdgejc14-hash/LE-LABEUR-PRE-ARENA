/**
 * P4F-2-DESIGN-ADMIN-NOTIFICATIONS — unité exacte du Master
 * « ADM — notifications (orchestration, gabarits & délivrabilité) »
 * (ADM-41 / ADM-42 / ADM-43).
 *
 * Capacité serveur réellement utilisée :
 *  - admin.notifications.list (GET /api/v1/admin/notifications,
 *    permission notifications:read:any), lecture paginée de la boîte In-App.
 *
 * Capacités absentes et donc BACKEND_GAP : vue agrégée d'orchestration,
 * gabarits et versions, métriques de délivrabilité, santé OTP, fournisseurs,
 * bascule de canal et envoi de test. Les routes scope self permettant à un
 * compte de marquer ses propres notifications lues ne sont pas détournées par
 * l'ADMIN. Aucun contenu de payload n'est rendu et aucune notification n'est
 * créée depuis l'interface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationView } from '../../backend/notifications/notificationService';
import { ApiClientError, type AdminApi, type AdminPage } from '../api';
import {
  ActionError,
  ActionRow,
  DataTable,
  EmptyNotice,
  GapNotice,
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
  NOTIFICATION_CHANNEL_STATUS_LABELS,
  NOTIFICATION_CHANNEL_STATUS_TONES,
  NOTIFICATION_READ_STATE_LABELS,
  NOTIFICATION_READ_STATE_TONES,
  NOTIFICATION_TYPE_LABELS,
  ROLE_LABELS,
  formatDateTime,
} from '../vocabulary';
import { SystemFeedback } from '../../public/SystemFeedback';

export const NOTIFICATION_READ_PERMISSION = 'notifications:read:any';
const PAGE_LIMIT = 100;

function has(permissions: readonly string[] | undefined, permission: string): boolean {
  return Boolean(permissions?.includes(permission));
}

function AccessDenied() {
  return <SystemFeedback state="403" />;
}

/** Sentinelle honnête : le backend répond 501 lorsque la persistance n'est pas installée. */
export interface NotificationsUnavailable {
  readonly unavailable: true;
}

const UNAVAILABLE: NotificationsUnavailable = { unavailable: true };

export function isNotificationsUnavailable(value: unknown): value is NotificationsUnavailable {
  return typeof value === 'object' && value !== null && (value as { unavailable?: unknown }).unavailable === true;
}

export async function unavailableWhenNotificationsNotInstalled<T>(task: () => Promise<T>): Promise<T | NotificationsUnavailable> {
  try {
    return await task();
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.status === 501) return UNAVAILABLE;
    throw cause;
  }
}

/** Page réelle de notifications ADMIN ; aucun filtre non déclaré n'est ajouté. */
export function loadNotificationRegistryPage(
  api: AdminApi,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<AdminPage<NotificationView> | NotificationsUnavailable> {
  return unavailableWhenNotificationsNotInstalled(() => api.notifications({ limit: PAGE_LIMIT, cursor, signal }));
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

function useNotificationPages() {
  const api = useAdminApi();
  const first = useAdminResource<AdminPage<NotificationView> | NotificationsUnavailable>(
    (currentApi, signal) => loadNotificationRegistryPage(currentApi, null, signal),
    [],
  );
  const nextPage = useSingleFlightAction<AdminPage<NotificationView> | NotificationsUnavailable>();
  const [additional, setAdditional] = useState<readonly NotificationView[]>([]);
  const [pageState, setPageState] = useState<{ cursor: string | null; hasMore: boolean } | null>(null);

  useEffect(() => {
    setAdditional([]);
    setPageState(null);
    nextPage.reset();
  }, [nextPage.reset]);

  const firstPage = first.data && !isNotificationsUnavailable(first.data) ? first.data : null;
  const unavailable = first.data !== null && isNotificationsUnavailable(first.data);
  const items = firstPage ? [...firstPage.items, ...additional] : null;
  const cursor = pageState ? pageState.cursor : firstPage?.cursor ?? null;
  const hasMore = pageState ? pageState.hasMore : firstPage?.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (!api || !cursor || !hasMore || nextPage.busy) return;
    void nextPage.run((signal) => loadNotificationRegistryPage(api, cursor, signal)).then((page) => {
      if (!page) return;
      if (isNotificationsUnavailable(page)) {
        setPageState({ cursor: null, hasMore: false });
        return;
      }
      setAdditional((previous) => [...previous, ...page.items]);
      setPageState({ cursor: page.cursor, hasMore: page.hasMore });
    });
  }, [api, cursor, hasMore, nextPage.busy, nextPage.run]);

  const reload = useCallback(() => {
    setAdditional([]);
    setPageState(null);
    nextPage.reset();
    first.reload();
  }, [first.reload, nextPage.reset]);

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

function formatWhen(value: string | undefined): string {
  return formatDateTime(value) ?? '—';
}

function readSeal(state: string) {
  const key = state as keyof typeof NOTIFICATION_READ_STATE_LABELS;
  return (
    <StatusSeal
      tone={NOTIFICATION_READ_STATE_TONES[key] ?? 'slate'}
      label={NOTIFICATION_READ_STATE_LABELS[key] ?? 'État non documenté'}
      size="sm"
    />
  );
}

function channelSeal(status: string) {
  const key = status as keyof typeof NOTIFICATION_CHANNEL_STATUS_LABELS;
  return (
    <StatusSeal
      tone={NOTIFICATION_CHANNEL_STATUS_TONES[key] ?? 'slate'}
      label={NOTIFICATION_CHANNEL_STATUS_LABELS[key] ?? 'État non documenté'}
      size="sm"
    />
  );
}

function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABELS[type as keyof typeof NOTIFICATION_TYPE_LABELS] ?? 'Type non documenté';
}

function recipientRoleLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? 'Rôle non documenté';
}

function unavailableList(items: readonly { label: string; capability: string; reason: string }[]) {
  return (
    <ul className="lbm-admin__unavailable-list" aria-label="Capacités indisponibles">
      {items.map((item) => (
        <li key={item.capability} className="lbm-admin__unavailable" data-unavailable-action={item.capability}>
          <span className="lbm-admin__unavailable-label">{item.label}</span>
          <StatusSeal tone="slate" label="Indisponible" size="sm" />
          <code className="lbm-mono lbm-caption">{item.capability}</code>
          <span className="lbm-caption lbm-muted">{item.reason}</span>
        </li>
      ))}
    </ul>
  );
}

function NotificationTable({ items, unavailable }: { items: readonly NotificationView[] | null; unavailable: boolean }) {
  return (
    <DataTable
      caption="Notifications In-App de la page chargée"
      head={['Créée le', 'Destinataire', 'Notification', 'Lecture', 'Push', 'Email']}
      rows={items ? items.map((notification) => [
        <span key="created" className="lbm-mono">{formatWhen(notification.createdAt)}</span>,
        <span key="recipient">
          <span>{recipientRoleLabel(notification.recipientRole)}</span>{' '}
          <code className="lbm-mono lbm-caption">{notification.recipientId}</code>
        </span>,
        <span key="notification">
          <code className="lbm-mono lbm-caption">{notification.id}</code>
          <br />
          <strong>{notificationTypeLabel(notification.type)}</strong>
          <br />
          <span className="lbm-caption">{notification.title}</span>
          <br />
          <span className="lbm-caption lbm-muted">{notification.message}</span>
        </span>,
        <span key="read">{readSeal(notification.readState)}</span>,
        <span key="push">{channelSeal(notification.pushStatus)}</span>,
        <span key="email">{channelSeal(notification.emailStatus)}</span>,
      ]) : []}
      empty={unavailable
        ? <EmptyNotice>La boîte In-App n’est pas installée dans cet environnement : aucune ligne n’est affichée.</EmptyNotice>
        : <EmptyNotice>Aucune notification In-App n’est présente dans la page chargée.</EmptyNotice>}
    />
  );
}

function NotificationTimelineDetails({ unavailable }: { unavailable: boolean }) {
  return (
    <Panel title={unavailable ? 'Orchestration non installée' : 'Séries de l’orchestration'} zone="timeline">
      <p className="lbm-body">
        {unavailable
          ? 'La lecture ADMIN répond 501 dans cet environnement. Les volumes, files, ouvertures et séries horaires ne sont pas disponibles.'
          : 'La route de lecture expose une page de notifications, mais aucun volume, file, ouverture ou série horaire agrégée.'}
      </p>
    </Panel>
  );
}

/* ───────────────────── ADM-41 · orchestration ───────────────────── */

export function Admin41NotificationOrchestration(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, NOTIFICATION_READ_PERMISSION)) return <AccessDenied />;
  return <NotificationOrchestrationContent {...props} />;
}

function NotificationOrchestrationContent({ unitId, pathname }: AdminUnitProps) {
  const registry = useNotificationPages();
  const gaps = adminGapsFor(unitId, pathname);
  const items = registry.items;
  const unread = items?.filter((notification) => notification.readState === 'UNREAD').length;

  if (registry.status === 'error') return <SystemFeedback {...registry.error!} retry={registry.reload} />;
  if (registry.status === 'loading' && !items && !registry.unavailable) {
    return <LoadingBlock label="Chargement des notifications In-App" rows={6} />;
  }

  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.NOTIFICATION_ORCHESTRATION}
        lede="Lecture ADMIN des notifications In-App réellement persistées. Les repères et la table portent uniquement sur la page chargée ; aucun envoi, agrégat fournisseur ou contenu technique n’est fabriqué dans l’interface."
        seal={{ tone: 'violet', label: 'Lecture In-App' }}
      />
      {registry.unavailable ? (
        <GapNotice
          title="Source de données non configurée · admin.notifications.list"
          items={['La lecture ADMIN des notifications n’est pas installée dans cet environnement : la route répond 501. Aucune boîte vide n’est présentée comme un état plateforme.']}
        />
      ) : null}
      <KpiRow
        items={[
          { label: 'Notifications de la page', value: items ? String(items.length) : '—' },
          { label: 'Non lues de la page', value: unread === undefined ? '—' : String(unread) },
          { label: 'Page suivante', value: items ? (registry.hasMore ? 'Disponible' : 'Aucune') : '—' },
          { label: 'Ouverture par canal', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-count="true">
        Les deux premiers repères sont bornés à la page réellement chargée. Les ouvertures, files et volumes plateforme ne sont pas exposés par la route ADMIN.
      </p>
      <NotificationTable items={items} unavailable={registry.unavailable} />
      {registry.loadMoreError ? <ActionError error={registry.loadMoreError} /> : null}
      {items && registry.hasMore ? (
        <ActionRow>
          <NeoPressButton type="button" variant="ghost" loading={registry.loadMoreBusy} disabled={registry.loadMoreBusy} onClick={registry.loadMore}>
            Charger la page suivante
          </NeoPressButton>
          <RetryButton onClick={registry.reload} />
        </ActionRow>
      ) : null}
      <NotificationTimelineDetails unavailable={registry.unavailable} />
      <Panel title="Capacités de test et de pilotage" zone="cta">
        {unavailableList([
          { label: 'Tester un envoi', capability: 'POST /admin/notifications/test-send', reason: 'Capacité absente : aucune notification n’est créée depuis l’ADMIN.' },
          { label: 'Ouvrir la santé par gabarit', capability: 'GET /admin/notifications/templates/health', reason: 'Capacité absente : aucun indicateur agrégé de santé par gabarit n’est exposé.' },
        ])}
      </Panel>
      <ActionRow>
        <Link href="/admin/notifications/gabarits" className="lbm-admin__link">Gabarits de notifications</Link>
        <Link href="/admin/notifications/delivrabilite" className="lbm-admin__link">Délivrabilité des notifications</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · ADM-41" items={gaps} />
    </>
  );
}

/* ───────────────────── ADM-42 · gabarits ───────────────────── */

export function Admin42NotificationTemplates(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, NOTIFICATION_READ_PERMISSION)) return <AccessDenied />;
  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.NOTIFICATION_TEMPLATES}
        lede="Aucun registre de gabarits ni version administrable n’est exposé par le backend. L’écran rend la capacité absente sans formulaire ni aperçu simulé."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow
        items={[
          { label: 'Gabarits lisibles', value: '—' },
          { label: 'Versions actives', value: '—' },
          { label: 'Langues contrôlées', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-count="true">« — » signifie que la ressource n’est pas exposée ; ce n’est ni zéro ni un statut de gabarit.</p>
      <Panel title="Gabarits de notifications" zone="list">
        <EmptyNotice>Aucun gabarit n’est lisible : GET /admin/notifications/templates n’existe pas.</EmptyNotice>
      </Panel>
      <Panel title="Éditeur et contrôles" zone="form">
        {unavailableList([
          { label: 'Éditer une version', capability: 'PUT /admin/notifications/templates/:id', reason: 'Capacité absente : aucune version ne peut être enregistrée depuis l’ADMIN.' },
          { label: 'Valider les variables', capability: 'POST /admin/notifications/templates/:id/validate', reason: 'Capacité absente : aucun contrôle de gabarit n’est exécutable.' },
          { label: 'Prévisualiser les canaux', capability: 'Aucune route de prévisualisation', reason: 'Capacité absente : aucun rendu Push, Email ou autre canal n’est simulé.' },
        ])}
      </Panel>
      <Panel title="Actions indisponibles" zone="cta">
        <p className="lbm-body">Aucune commande active n’est rendue pour préserver la frontière serveur réelle.</p>
      </Panel>
      <GapNotice title="BACKEND_GAP · ADM-42" items={adminGapsFor(props.unitId, props.pathname)} />
    </>
  );
}

/* ───────────────────── ADM-43 · délivrabilité ───────────────────── */

export function Admin43NotificationDeliverability(props: AdminUnitProps) {
  const actor = useAdminActor();
  if (!has(actor?.permissions, NOTIFICATION_READ_PERMISSION)) return <AccessDenied />;
  return (
    <>
      <PageHead
        title={ADMIN_UI_TERMS.NOTIFICATION_DELIVERABILITY}
        lede="Aucune métrique fournisseur, santé OTP ou bascule de canal n’est exposée. Aucun taux, opérateur ou incident n’est déduit de notifications isolées."
        seal={{ tone: 'slate', label: 'BACKEND_GAP' }}
      />
      <KpiRow
        items={[
          { label: 'Livraisons par canal', value: '—' },
          { label: 'Santé OTP', value: '—' },
          { label: 'Latence médiane', value: '—' },
          { label: 'Incidents fournisseurs', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-count="true">Les états Push et Email d’une notification individuelle ne constituent pas une métrique de délivrabilité plateforme.</p>
      <Panel title="Par fournisseur et opérateur" zone="table">
        <EmptyNotice>Aucune donnée de fournisseur n’est lisible : GET /admin/notifications/deliverability n’existe pas.</EmptyNotice>
      </Panel>
      <Panel title="Latence par heure" zone="timeline">
        <EmptyNotice>Aucune série de latence n’est exposée : aucun graphique n’est simulé.</EmptyNotice>
      </Panel>
      <Panel title="Actions de canal" zone="cta">
        {unavailableList([
          { label: 'Forcer une bascule de canal', capability: 'POST /admin/notifications/failover', reason: 'Capacité absente : aucune bascule de canal n’est exécutable.' },
          { label: 'Lire la santé OTP', capability: 'GET /admin/notifications/otp-health', reason: 'Capacité absente : aucun indicateur OTP n’est exposé.' },
        ])}
      </Panel>
      <GapNotice title="BACKEND_GAP · ADM-43" items={adminGapsFor(props.unitId, props.pathname)} />
    </>
  );
}
