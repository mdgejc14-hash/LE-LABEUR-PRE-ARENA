/**
 * ADM-02 → ADM-05 — Registre des utilisateurs, fiche utilisateur, blocage
 * (geste) et journal des blocages.
 *
 * Données : uniquement les routes existantes (`admin.users.list` réel,
 * `admin.users.block` réel). La fiche est composée depuis la page réelle du
 * registre (aucune route de lecture individuelle n'existe). Le déblocage est
 * une route déclarée SANS handler : il est affiché comme indisponible, jamais
 * comme une action fonctionnelle.
 */

import { useState } from 'react';
import {
  ActionError,
  ActionRow,
  DataTable,
  EmptyNotice,
  Field,
  FilterChips,
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
import { useAdminAction, useAdminApi, useAdminResource } from '../hooks';
import { useAdminActor } from '../UnitBoundary';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { AdminApi, AdminUserDto } from '../api';
import type { AdminUnitProps } from '../types';
import { ACCOUNT_STATUS_LABELS, PRODUCT_LABELS, ROLE_LABELS, formatDate, maskEmail } from '../vocabulary';

const ACCOUNT_TONE: Record<string, 'emerald' | 'clay'> = {
  ACTIVE: 'emerald',
  BLOCKED: 'clay',
};

const ROLE_FILTERS = [
  { id: 'all', label: 'Tous les rôles' },
  { id: 'EMPLOYER', label: PRODUCT_LABELS.EMPLOYER.singular },
  { id: 'CANDIDATE', label: PRODUCT_LABELS.CANDIDATE.singular },
  { id: 'ADMIN', label: PRODUCT_LABELS.ADMIN.singular },
] as const;

const STATUS_FILTERS = [
  { id: 'all', label: 'Tous les statuts' },
  { id: 'ACTIVE', label: ACCOUNT_STATUS_LABELS.ACTIVE },
  { id: 'BLOCKED', label: ACCOUNT_STATUS_LABELS.BLOCKED },
] as const;

async function loadUsers(api: AdminApi, signal: AbortSignal): Promise<AdminUserDto[]> {
  return (await api.users({ limit: 100, signal })).items;
}

/** Recherche et filtres appliqués localement sur les données RÉELLES chargées. */
function filterUsers(users: readonly AdminUserDto[], query: string, role: string, status: string): AdminUserDto[] {
  const needle = query.trim().toLowerCase();
  return users.filter((user) => {
    if (role !== 'all' && user.role !== role) return false;
    if (status !== 'all' && user.status !== status) return false;
    if (!needle) return true;
    return [user.id, user.displayName, user.email, user.role].some((field) => field.toLowerCase().includes(needle));
  });
}

export function Admin02Users({ unitId, pathname }: AdminUnitProps) {
  const resource = useAdminResource<AdminUserDto[]>(loadUsers, []);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const gaps = adminGapsFor(unitId, pathname);
  // Filtre local calculé avant tout retour conditionnel (ordre des hooks stable).
  const visible = resource.data ? filterUsers(resource.data, query, role, status) : [];

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du registre des utilisateurs" rows={5} />;

  const blocked = resource.data!.filter((user) => user.status === 'BLOCKED').length;

  return (
    <>
      <PageHead
        title="Utilisateurs"
        lede={`${resource.data!.length} comptes chargés (page réelle) · ${blocked} bloqués · recherche et filtres appliqués sur les données réelles`}
        seal={{ tone: 'gold', label: 'Registre réel' }}
      />

      <KpiRow
        items={[
          { label: 'COMPTES', value: String(resource.data!.length) },
          { label: 'COMPTES BLOQUÉS', value: String(blocked) },
          { label: 'RÉSULTATS', value: String(visible.length) },
        ]}
      />

      <Panel title="Recherche" zone="form" tone="notice">
        La recherche serveur (index, multi-critères) n’existe pas : le champ ci-dessous filtre localement la page réelle chargée (100 comptes maximum). Aucun listing n’est inventé.
      </Panel>
      <Panel title="Recherche" zone="form">
        <Field label="Rechercher (identifiant, nom affiché, e-mail, rôle)" hint="Filtre local sur les données réelles chargées.">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Identifiant, nom, e-mail…"
            aria-label="Rechercher un utilisateur"
          />
        </Field>
      </Panel>
      <FilterChips label="Filtre de rôle" options={ROLE_FILTERS} value={role} onChange={setRole} />
      <FilterChips label="Filtre de statut" options={STATUS_FILTERS} value={status} onChange={setStatus} />

      <DataTable
        caption="Registre réel des utilisateurs"
        head={['Identifiant', 'Rôle', 'Statut', 'Nom affiché', 'E-mail (masqué)', 'Inscrit le', 'Fiche']}
        rows={visible.map((user) => [
          <span key="id" className="lbm-mono">{user.id}</span>,
          ROLE_LABELS[user.role] ?? user.role,
          <StatusSeal key="status" tone={ACCOUNT_TONE[user.status] ?? 'slate'} label={ACCOUNT_STATUS_LABELS[user.status] ?? user.status} size="sm" />,
          user.displayName || '—',
          maskEmail(user.email) ?? '—',
          formatDate(user.createdAt) ?? '—',
          <Link key="sheet" href={`/admin/utilisateurs/${encodeURIComponent(user.id)}`} className="lbm-admin__link">Ouvrir la fiche</Link>,
        ])}
        empty={<EmptyNotice>{query || role !== 'all' || status !== 'all' ? 'Aucun compte ne correspond aux critères.' : 'Aucun compte enregistré.'}</EmptyNotice>}
      />

      <ActionRow>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-02" items={gaps} />
    </>
  );
}

export function Admin03UserSheet({ unitId, pathname, params }: AdminUnitProps) {
  const actor = useAdminActor();
  const userId = params.id ?? '';
  const resource = useAdminResource<AdminUserDto[]>(loadUsers, []);
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la fiche utilisateur" rows={4} />;

  const user = resource.data!.find((candidate) => candidate.id === userId) ?? null;

  if (!user) {
    return (
      <>
        <PageHead title="Fiche utilisateur" lede={`Identifiant : ${userId}`} seal={{ tone: 'slate', label: 'Introuvable' }} />
        <EmptyNotice>
          Cet utilisateur n’est pas dans la page réelle chargée (100 comptes maximum). Aucune route de lecture individuelle n’existe (BACKEND_GAP) : la fiche est composée depuis le registre réel.
        </EmptyNotice>
        <ActionRow>
          <Link href="/admin/utilisateurs" className="lbm-admin__link">Retour au registre</Link>
          <RetryButton onClick={resource.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · ADM-03" items={gaps} />
      </>
    );
  }

  const canBlock = actor?.permissions.includes('users:block') ?? false;

  return (
    <>
      <PageHead
        title={user.displayName || user.id}
        lede={`Identifiant : ${user.id}`}
        seal={{ tone: ACCOUNT_TONE[user.status] ?? 'slate', label: ACCOUNT_STATUS_LABELS[user.status] ?? user.status }}
      />

      <Panel title="Compte" zone="hero">
        <KeyValues
          title="Compte"
          items={[
            { label: 'Identifiant', value: user.id },
            { label: 'Rôle', value: ROLE_LABELS[user.role] ?? user.role },
            { label: 'Statut', value: ACCOUNT_STATUS_LABELS[user.status] ?? user.status },
            { label: 'Inscrit le', value: formatDate(user.createdAt) ?? null },
            { label: 'E-mail (masqué)', value: maskEmail(user.email) },
          ]}
        />
        <p className="lbm-caption lbm-muted">
          Les accès sont contrôlés par le serveur : cette fiche n’est lisible qu’avec la permission users:read:any (dérivée serveur de la session).
        </p>
      </Panel>

      <Panel title="Indicateurs d’activité" zone="kpi" tone="notice">
        Contrats, candidatures, claims et taux de complétion : aucune donnée d’activité n’est exposée par un endpoint ADMIN (BACKEND_GAP). Aucune valeur n’est affichée à la place.
      </Panel>

      <Panel title="Historique et signalements" zone="list">
        <EmptyNotice>
          Aucun historique, signalement ou note interne n’est lisible : aucune route de lecture n’existe pour cette fiche (BACKEND_GAP).
        </EmptyNotice>
      </Panel>

      <ActionRow>
        {canBlock ? (
          <Link href={`/admin/utilisateurs/${encodeURIComponent(user.id)}/blocage`} className="lbm-admin__link">
            Ouvrir le blocage
          </Link>
        ) : (
          <p className="lbm-caption lbm-muted">L’action de blocage requiert la permission serveur users:block (absente de cette session).</p>
        )}
        <Link href="/admin/utilisateurs" className="lbm-admin__link">Retour au registre</Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <p className="lbm-caption lbm-muted">
        {`Permissions de la session (dérivées serveur) : ${actor?.permissions.join(', ') ?? '—'}`}
      </p>

      <GapNotice title="BACKEND_GAP · ADM-03" items={gaps} />
    </>
  );
}

export function Admin04Block({ unitId, pathname, params }: AdminUnitProps) {
  const actor = useAdminActor();
  const api = useAdminApi();
  const userId = params.id ?? '';
  const users = useAdminResource<AdminUserDto[]>(loadUsers, []);
  const action = useAdminAction<AdminUserDto>();
  const [reason, setReason] = useState('');
  const gaps = adminGapsFor(unitId, pathname);

  if (users.status === 'error') return <SystemFeedback {...users.error!} retry={users.reload} />;
  if (users.status === 'loading' || !users.data) return <LoadingBlock label="Chargement du compte" rows={4} />;

  const user = users.data!.find((candidate) => candidate.id === userId) ?? null;
  const session = actor;
  const canBlock = (session?.permissions.includes('users:block') ?? false) && user !== null && user.status !== 'BLOCKED' && user.id !== session?.actor.id;
  const motif = reason.trim();
  const motifValid = motif.length >= 3;

  const submit = () => {
    if (!api || !user || !motifValid) return;
    void action.run((signal) => api.blockUser(user.id, motif, signal)).then((result) => {
      if (result) users.reload();
    });
  };

  return (
    <>
      <PageHead
        title="Blocage de compte"
        lede={user ? `Compte : ${user.id} (${user.displayName || '—'})` : `Identifiant : ${userId}`}
        seal={{ tone: 'clay', label: 'Geste tracé' }}
      />

      {!user ? (
        <EmptyNotice>Ce compte n’est pas dans la page réelle chargée : aucune action n’est possible depuis cette fiche.</EmptyNotice>
      ) : (
        <>
          <Panel title="Compte concerné" zone="hero">
            <KeyValues
              title="Compte concerné"
              items={[
                { label: 'Identifiant', value: user.id },
                { label: 'Rôle', value: ROLE_LABELS[user.role] ?? user.role },
                { label: 'Statut actuel', value: ACCOUNT_STATUS_LABELS[user.status] ?? user.status },
              ]}
            />
          </Panel>

          {user.status === 'BLOCKED' ? (
            <Panel title="État réel" zone="verdict">
              <StatusSeal tone="clay" label={ACCOUNT_STATUS_LABELS.BLOCKED} />
              <p className="lbm-body">Ce compte est déjà bloqué. Le déblocage n’est pas disponible : la route déclarée n’a aucun handler opérationnel (réponse 501 réelle).</p>
            </Panel>
          ) : null}

          {user.id === session?.actor.id ? (
            <Panel title="Règle serveur" zone="verdict" tone="notice">
              Un administrateur ne peut pas bloquer son propre compte (règle serveur réelle, conflit 409).
            </Panel>
          ) : null}

          {!session?.permissions.includes('users:block') ? (
            <Panel title="Permission requise" zone="verdict" tone="notice">
              L’action de blocage requiert la permission serveur users:block, absente de cette session. Le serveur refuserait la commande (403).
            </Panel>
          ) : null}

          {action.result ? (
            <Panel title="Blocage appliqué" zone="verdict">
              <StatusSeal tone="clay" label={ACCOUNT_STATUS_LABELS.BLOCKED} />
              <KeyValues
                title="Résultat réel"
                items={[
                  { label: 'Identifiant', value: action.result.id },
                  { label: 'Statut', value: ACCOUNT_STATUS_LABELS[action.result.status] ?? action.result.status },
                  { label: 'Motif', value: motif },
                ]}
              />
              <p className="lbm-body">
                Effets réels côté serveur : statut BLOCKED, sessions actives révoquées, événement USER_BLOCKED journalisé dans le ledger d’audit.
              </p>
              <p className="lbm-caption lbm-muted">
                Le déblocage (route déclarée sans handler, 501 réelle) reste indisponible dans cette tranche.
              </p>
            </Panel>
          ) : (
            <Panel title="Paramètres du blocage" zone="form">
              <div className="lbm-admin__fields">
                <Field
                  label="Motif (obligatoire)"
                  hint="Le serveur exige un motif explicite d’au moins 3 caractères. Le blocage réel est total : statut BLOCKED, sessions révoquées, audit USER_BLOCKED. Aucune portée ni durée n’existe côté serveur (BACKEND_GAP)."
                >
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    aria-label="Motif du blocage"
                    placeholder="Motif factuel du blocage…"
                  />
                </Field>
              </div>
              <p className="lbm-caption lbm-muted" aria-live="polite">{motif.length} caractère(s) saisi(s) — minimum serveur : 3.</p>
            </Panel>
          )}

          {action.error ? <ActionError error={action.error} /> : null}

          <ActionRow>
            {!action.result && user.status !== 'BLOCKED' ? (
              <>
                <NeoPressButton variant="primary" onClick={submit} disabled={!canBlock || !motifValid} loading={action.busy}>
                  Confirmer le blocage
                </NeoPressButton>
                <NeoPressButton variant="ghost" disabled aria-disabled="true">
                  Débloquer (indisponible)
                </NeoPressButton>
              </>
            ) : null}
            <Link href={`/admin/utilisateurs/${encodeURIComponent(user.id)}`} className="lbm-admin__link">Retour à la fiche</Link>
            <RetryButton onClick={users.reload} />
          </ActionRow>
        </>
      )}

      <GapNotice title="BACKEND_GAP · ADM-04" items={gaps} />
    </>
  );
}

export function Admin05BlockJournal({ unitId, pathname }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title="Journal des blocages"
        lede="Mémoire des sanctions prononcées. Aucun registre des blocages n’est exposé par le produit."
        seal={{ tone: 'slate', label: 'Source absente' }}
      />

      <DataTable
        caption="Registre des blocages"
        head={['Date', 'Utilisateur', 'Type', 'Statut']}
        rows={[]}
        empty={<EmptyNotice>Aucun registre des blocages n’est lisible : les routes décrites par la fiche sont absentes du produit (BACKEND_GAP).</EmptyNotice>}
      />

      <Panel title="Ce qui existe réellement" zone="list">
        <EmptyNotice>
          Chaque blocage réel (POST admin.users.block) écrit un événement USER_BLOCKED dans le ledger d’audit serveur, avec l’acteur, le motif et l’état avant/après. Aucune route ADMIN ne relit ce journal : il n’est pas presented ici comme une liste.
        </EmptyNotice>
      </Panel>

      <ActionRow>
        <Link href="/admin/utilisateurs" className="lbm-admin__link">Registre des utilisateurs</Link>
        <Link href="/admin" className="lbm-admin__link">Retour au tableau de bord</Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-05" items={gaps} />
    </>
  );
}
