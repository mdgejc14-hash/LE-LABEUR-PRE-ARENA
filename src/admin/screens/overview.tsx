/**
 * ADM-01 — Tableau de bord de supervision.
 *
 * Données : UNIQUEMENT les routes existantes (`admin.users.list`,
 * `admin.qualifications/review`, `admin.stats.read`, `admin.audit.list`,
 * `admin.incidents.list`). Une source indisponible affiche « — » (valeur
 * absente) : jamais un zéro présenté comme réel, jamais un chiffre inventé.
 */

import {
  ActionRow,
  DataTable,
  EmptyNotice,
  GapNotice,
  KpiRow,
  Link,
  LoadingBlock,
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  RetryButton,
  Timeline,
  Zone,
} from '../components';
import { adminGapsFor } from '../screenMap';
import { useAdminActor, } from '../UnitBoundary';
import { useAdminResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { AdminApi, AdminUserDto, QualificationReviewQueueItem } from '../api';
import type { AdminUnitProps } from '../types';
import { PRODUCT_LABELS, formatDate } from '../vocabulary';

interface SourceState<T> {
  readonly status: 'ready' | 'error' | 'unavailable';
  readonly data: T | null;
}

interface DashboardData {
  users: SourceState<AdminUserDto[]>;
  reviewQueue: SourceState<QualificationReviewQueueItem[]>;
  stats: SourceState<{ metrics: Record<string, unknown>; persistence: string }>;
  audit: SourceState<{ items: unknown[]; persistence: string }>;
  incidents: SourceState<{ items: unknown[]; persistence: string }>;
}

async function loadDashboard(api: AdminApi, signal: AbortSignal): Promise<DashboardData> {
  const settle = async <T,>(task: Promise<T>): Promise<SourceState<T>> => {
    try {
      return { status: 'ready', data: await task };
    } catch {
      return { status: 'error', data: null };
    }
  };
  const [users, reviewQueue, stats, audit, incidents] = await Promise.all([
    settle(api.users({ limit: 100, signal }).then((page) => page.items)),
    settle(api.reviewQueue({ limit: 100, signal }).then((page) => page.items)),
    settle(api.stats(signal)),
    settle(api.auditLog({ limit: 25, signal })),
    settle(api.incidents({ limit: 25, signal })),
  ]);
  return { users, reviewQueue, stats, audit, incidents };
}

/** Valeur affichable : « — » quand la source est absente (jamais un zéro inventé). */
function valueOf<T>(source: SourceState<T>, render: (data: T) => string): string {
  return source.status === 'ready' && source.data !== null ? render(source.data) : '—';
}

export function Admin01Dashboard({ unitId, pathname }: AdminUnitProps) {
  const actor = useAdminActor();
  const resource = useAdminResource<DashboardData>(loadDashboard, []);
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du tableau de bord" rows={5} />;

  const { users, reviewQueue, stats, audit, incidents } = resource.data;
  const blocked = users.status === 'ready' && users.data ? users.data.filter((user) => user.status === 'BLOCKED').length : null;

  const files: readonly {
    title: string;
    href: string | null;
    seal: { tone: 'emerald' | 'amber' | 'clay' | 'slate' | 'gold'; label: string };
    facts: readonly { label: string; value: string }[];
    note?: string;
  }[] = [
    {
      title: `${PRODUCT_LABELS.QUALIFICATION.plural} en revue`,
      href: '/admin/qualification',
      seal: { tone: 'amber', label: 'File active' },
      facts: [{ label: 'En attente', value: valueOf(reviewQueue, (items) => String(items.length)) }],
    },
    {
      title: 'Utilisateurs',
      href: '/admin/utilisateurs',
      seal: { tone: 'gold', label: 'Registre réel' },
      facts: [{ label: 'Comptes chargés', value: valueOf(users, (items) => String(items.length)) }],
    },
    {
      title: `${PRODUCT_LABELS.CLAIM.plural} (file)`,
      href: null,
      seal: { tone: 'slate', label: 'Non livré' },
      facts: [{ label: 'État', value: 'Tranche ultérieure (hors P4A)' }],
      note: 'La file des Claims relève d’une tranche suivante : aucun lien fonctionnel n’est présenté.',
    },
    {
      title: `${PRODUCT_LABELS.REPLACEMENT.plural} (file)`,
      href: null,
      seal: { tone: 'slate', label: 'Non livré' },
      facts: [{ label: 'État', value: 'Tranche ultérieure (hors P4A)' }],
      note: 'La file des Remplacements relève d’une tranche suivante : aucun lien fonctionnel n’est présenté.',
    },
    {
      title: `${PRODUCT_LABELS.DOCUMENT.plural} en vérification (file)`,
      href: null,
      seal: { tone: 'slate', label: 'Non livré' },
      facts: [{ label: 'État', value: 'Tranche ultérieure (hors P4A)' }],
      note: 'La file des Documents relève d’une tranche suivante : aucun lien fonctionnel n’est présenté.',
    },
  ];

  return (
    <>
      <PageHead
        title="Supervision"
        lede="État réel de la plateforme : compteurs issus des routes existantes, « — » quand une source est absente."
        seal={{ tone: 'gold', label: PRODUCT_LABELS.ADMIN.singular }}
      />

      <KpiRow
        items={[
          { label: 'UTILISATEURS', value: valueOf(users, (items) => String(items.length)) },
          { label: 'COMPTES BLOQUÉS', value: blocked === null ? '—' : String(blocked) },
          { label: 'QUALIFICATIONS EN REVUE', value: valueOf(reviewQueue, (items) => String(items.length)) },
          { label: 'INDICATEURS PLATEFORME', value: valueOf(stats, (payload) => (Object.keys(payload.metrics).length > 0 ? String(Object.keys(payload.metrics).length) : '—')) },
        ]}
      />
      <p className="lbm-caption lbm-muted">« — » signifie « source indisponible » : une valeur absente n’est jamais présentée comme un zéro réel.</p>

      <Panel title="Files prioritaires" zone="list">
        <RecordList
          items={files}
          render={(file) => (
            <RecordCard
              title={file.title}
              href={file.href ?? undefined}
              seal={file.seal}
              facts={file.facts}
            >
              {file.note ? <p className="lbm-caption lbm-muted">{file.note}</p> : null}
            </RecordCard>
          )}
        />
      </Panel>

      <DataTable
        caption="Activité récente (journal réel)"
        head={['Horodatage', 'Acteur', 'Action', 'Objet']}
        rows={[]}
        empty={
          <EmptyNotice>
            {audit.status === 'ready'
              ? 'Le journal d’activité répond sans donnée métier (frontière de contrôle). Aucun événement récent n’est lisible.'
              : 'Le journal d’activité est indisponible : la source a répondu en erreur.'}
          </EmptyNotice>
        }
      />

      <Zone kind="timeline" label="Santé plateforme">
        <h2 className="lbm-title-2">Santé plateforme (24 h)</h2>
        {incidents.status === 'ready' ? (
          <EmptyNotice>Aucune série de santé n’est exposée par le produit : les incidents répondent une frontière de contrôle sans donnée (BACKEND_GAP).</EmptyNotice>
        ) : (
          <EmptyNotice>La santé plateforme est indisponible : la source a répondu en erreur.</EmptyNotice>
        )}
        <Timeline steps={[]} />
      </Zone>

      <ActionRow>
        <Link href="/admin/utilisateurs" className="lbm-admin__link">
          Registre des utilisateurs
        </Link>
        <Link href="/admin/qualification" className="lbm-admin__link">
          File de qualification
        </Link>
        <Link href="/admin/matching" className="lbm-admin__link">
          Runs de matching
        </Link>
        <Link href="/admin/matching/rulesets" className="lbm-admin__link">
          Règles existantes
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <p className="lbm-caption lbm-muted">
        {`Session : ${actor?.actor.displayName || actor?.actor.id || '—'} · rôle ${actor?.actor.role || '—'} · permissions serveur : ${actor?.permissions.length ? actor.permissions.join(', ') : '—'}`}
      </p>
      <p className="lbm-caption lbm-muted">
        {`Inscriptions les plus récentes : ${valueOf(users, (items) => items.slice(0, 3).map((user) => `${user.displayName || user.id} (${formatDate(user.createdAt) ?? '—'})`).join(' · ') || '—')}`}
      </p>

      <GapNotice title="BACKEND_GAP · ADM-01" items={gaps} />
    </>
  );
}
