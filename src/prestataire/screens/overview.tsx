/**
 * PRE-01 → PRE-04 — Accueil, notifications, profil et paramètres candidat.
 *
 * Données : uniquement les routes existantes (contrats, paiements salaires,
 * claims, candidatures, notifications, profil de matching). Aucun indicateur
 * de vanité, aucune donnée simulée, aucun calcul financier nouveau.
 * Le candidat ne voit QUE ses salaires : /my/payments filtre `SALARY` côté
 * serveur, la commission employeur n'est jamais demandée ni affichée.
 */

import { useState } from 'react';
import {
  ActionRow,
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
  RecordCard,
  RecordList,
  RetryButton,
  Zone,
} from '../components';
import { prestataireGapsFor } from '../screenMap';
import { usePrestataireAction, usePrestataireApi, usePrestataireResource } from '../hooks';
import { usePrestataireActor } from '../UnitBoundary';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Application, Contract } from '../../types';
import type { ClaimView, NotificationView, PaymentView, PrestataireApi } from '../api';
import type { PrestataireUnitProps } from '../types';
import {
  APPLICATION_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRODUCT_LABELS,
  PRESTATAIRE_DOCK_LABELS,
  formatAmount,
  formatDate,
  formatDateTime,
} from '../vocabulary';

const CONTRACT_TONE: Record<Contract['status'], 'emerald' | 'amber' | 'slate' | 'gold' | 'clay'> = {
  ACTIVE: 'emerald',
  DRAFT: 'slate',
  PENDING_EMPLOYER: 'amber',
  PENDING_EMPLOYEE: 'amber',
  SIGNATURE: 'amber',
  SUSPENDED: 'amber',
  INCIDENT: 'clay',
  TERMINATED: 'clay',
  COMPLETED: 'gold',
  REPLACED: 'slate',
};

function paymentTone(status: PaymentView['status']): 'emerald' | 'gold' | 'amber' | 'slate' | 'clay' {
  if (status === 'PAID' || status === 'VERIFIED') return 'emerald';
  if (status === 'DUE') return 'amber';
  if (status === 'REJECTED') return 'clay';
  if (status === 'PENDING_VERIFICATION') return 'gold';
  return 'slate';
}

interface DashboardData {
  contracts: Contract[];
  payments: PaymentView[];
  claims: ClaimView[];
}

async function loadDashboard(api: PrestataireApi, signal: AbortSignal): Promise<DashboardData> {
  const [contracts, payments, claims] = await Promise.all([
    api.myContracts({ limit: 25, signal }),
    api.myPayments({ limit: 25, signal }),
    api.myClaims({ limit: 25, signal }),
  ]);
  return { contracts: contracts.items, payments: payments.items, claims: claims.items };
}

/* ───────────────── PRE-01 · Tableau de bord candidat ───────────────── */

const AVAILABILITY_OPTIONS = [
  { id: 'AVAILABLE', label: 'Disponible' },
  { id: 'LIMITED', label: 'Disponibilité limitée' },
  { id: 'UNAVAILABLE', label: 'Indisponible' },
] as const;

const AVAILABILITY_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  LIMITED: 'Disponibilité limitée',
  UNAVAILABLE: 'Indisponible',
  UNDECLARED: 'Non déclarée',
};

export function Prestataire01Dashboard({ unitId, pathname }: PrestataireUnitProps) {
  const actor = usePrestataireActor();
  const api = usePrestataireApi();
  const resource = usePrestataireResource<DashboardData>(loadDashboard, []);
  const applications = usePrestataireResource<Application[]>(
    async (api, signal) => (await api.myApplications({ limit: 25, signal })).items,
    [],
  );
  const profile = usePrestataireResource(async (api, signal) => api.matchingProfile(signal), []);
  const availability = usePrestataireAction<unknown>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du tableau de bord" rows={5} />;

  const { contracts, payments, claims } = resource.data;
  const activeContracts = contracts.filter((contract) => contract.status === 'ACTIVE');
  const openClaims = claims.filter((claim) => !['RESOLVED', 'REJECTED', 'CLOSED'].includes(claim.status));
  const openPayments = payments.filter((payment) => payment.status !== 'PAID');
  const nextPayment = [...payments].filter((payment) => payment.status !== 'PAID').sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0] ?? null;
  const currentAvailability = profile.data?.availability ?? 'UNDECLARED';

  return (
    <>
      <PageHead
        title={`Bonjour${actor?.actor.displayName ? `, ${actor.actor.displayName}` : ''}`}
        lede={`${activeContracts.length} ${PRODUCT_LABELS.CONTRACT.plural.toLowerCase()} en cours · ${openClaims.length} ${PRODUCT_LABELS.CLAIM.plural.toLowerCase()} ouverts`}
        seal={{ tone: 'gold', label: PRODUCT_LABELS.CANDIDATE.singular }}
      />

      <KpiRow
        items={[
          { label: PRODUCT_LABELS.CONTRACT.plural.toUpperCase(), value: String(activeContracts.length) },
          { label: 'SALAIRE EN ATTENTE', value: String(openPayments.length) },
          { label: PRODUCT_LABELS.CLAIM.plural.toUpperCase(), value: String(openClaims.length) },
        ]}
      />

      <Panel title="Disponibilité pour le matching" zone="form">
        <p className="lbm-caption lbm-muted">
          {`État réel du profil de matching : ${AVAILABILITY_LABELS[currentAvailability] ?? currentAvailability}. L’indisponibilité vous exclut temporairement du matching, sans aucune pénalité de réputation.`}
        </p>
        <FilterChips
          label="Disponibilité"
          options={AVAILABILITY_OPTIONS.map((entry) => ({ id: entry.id, label: entry.label }))}
          value={currentAvailability}
          onChange={(id) => {
            void availability.run((signal) =>
              api!.updateMatchingProfile({ availability: id as 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' }, signal),
            ).then((result) => {
              if (result) profile.reload();
            });
          }}
        />
        {availability.error ? <p className="lbm-caption" role="alert">La mise à jour de la disponibilité a échoué.</p> : null}
      </Panel>

      <Panel title="Prochains salaires (état réel)" zone="list">
        <RecordList
          items={openPayments.slice(0, 5)}
          empty={<EmptyNotice>Aucun salaire en attente. Les paiements clôturés sont dans l’espace salaire.</EmptyNotice>}
          render={(payment) => (
            <RecordCard
              title={`${PRODUCT_LABELS.SALARY.singular} · mois ${payment.monthNumber}`}
              href={`/prestataire/salaire/${payment.paymentId}/otp`}
              seal={{ tone: paymentTone(payment.status), label: PAYMENT_STATUS_LABELS[payment.status] }}
              facts={[
                { label: 'Montant', value: formatAmount(payment.amount, payment.currency) },
                { label: 'Échéance', value: formatDate(payment.dueAt) ?? '—' },
                { label: 'Déclaré', value: payment.declared ? 'Oui' : 'Non' },
                { label: 'Vérifié', value: payment.verified ? 'Oui' : 'Non' },
              ]}
            />
          )}
        />
        {nextPayment ? (
          <p className="lbm-caption lbm-muted">
            {`Prochain paiement attendu : ${formatAmount(nextPayment.amount, nextPayment.currency)} au ${formatDate(nextPayment.dueAt) ?? '—'}. Un paiement déclaré n’est pas un paiement vérifié ; un paiement vérifié n’est pas une confirmation de votre part.`}
          </p>
        ) : null}
      </Panel>

      <Panel title={PRODUCT_LABELS.APPLICATION.plural} zone="list">
        {applications.status === 'loading' ? <LoadingBlock label={`Chargement des ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()}`} rows={2} /> : null}
        {applications.status === 'error' ? (
          <Panel title="Lecture indisponible" zone="notice" tone="notice">
            {`La route /my/applications est déclarée sans handler installé (501) : vos ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()} ne sont pas relisibles ici. L’état réel est celui du serveur.`}
          </Panel>
        ) : null}
        {applications.data ? (
          <RecordList
            items={applications.data}
            empty={<EmptyNotice>Aucune candidature pour l’instant. Le marché des offres est dans l’onglet {PRESTATAIRE_DOCK_LABELS.OFFERS}.</EmptyNotice>}
            render={(application) => (
              <RecordCard
                title={application.offerTitle}
                href={`/prestataire/candidatures/${application.id}`}
                seal={{ tone: 'amber', label: APPLICATION_STATUS_LABELS[application.status] }}
                facts={[
                  { label: 'Employeur', value: application.employerName ?? '—' },
                  { label: 'Envoyée le', value: formatDate(application.appliedDate) ?? '—' },
                ]}
              />
            )}
          />
        ) : null}
      </Panel>

      <Panel title={PRODUCT_LABELS.CONTRACT.plural} zone="timeline">
        <RecordList
          items={activeContracts.slice(0, 5)}
          empty={<EmptyNotice>Aucun contrat en cours.</EmptyNotice>}
          render={(contract) => (
            <RecordCard
              title={contract.offerTitle}
              href={`/prestataire/contrats/${contract.id}`}
              seal={{ tone: CONTRACT_TONE[contract.status], label: CONTRACT_STATUS_LABELS[contract.status] }}
              facts={[
                { label: 'Employeur', value: contract.employerName },
                { label: 'Salaire mensuel', value: formatAmount(contract.monthlySalary, contract.currency) },
                { label: 'Début', value: formatDate(contract.startDate) ?? '—' },
              ]}
            />
          )}
        />
      </Panel>

      <ActionRow>
        <Link href="/prestataire/missions" className="lbm-candidat__link">
          {`Marché des ${PRODUCT_LABELS.OFFER.plural.toLowerCase()}`}
        </Link>
        <Link href="/prestataire/salaire" className="lbm-candidat__link">
          {PRESTATAIRE_DOCK_LABELS.SALARY}
        </Link>
        <Link href="/prestataire/candidatures" className="lbm-candidat__link">
          {PRODUCT_LABELS.APPLICATION.plural}
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-01" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-02 · Notifications ───────────────── */

/** Domaine déduit de la destination RÉELLE de la notification (jamais inventé). */
export function notificationDomain(notification: NotificationView): string {
  const screen = notification.linkRef?.screen ?? '';
  if (screen.includes('salaire') || screen.includes('payment')) return 'salaire';
  if (screen.includes('candidature') || screen.includes('application')) return 'candidatures';
  if (screen.includes('contrat') || screen.includes('contract')) return 'contrats';
  if (screen.includes('proposition')) return 'propositions';
  if (screen.includes('remplacement') || screen.includes('replacement')) return 'remplacements';
  if (screen.includes('document')) return 'documents';
  if (screen.includes('mission') || screen.includes('offre') || screen.includes('offer')) return 'offres';
  return 'all';
}

const NOTIFICATION_SEGMENTS = [
  { id: 'all', label: 'Toutes' },
  { id: 'candidatures', label: PRODUCT_LABELS.APPLICATION.plural },
  { id: 'contrats', label: PRODUCT_LABELS.CONTRACT.plural },
  { id: 'salaire', label: PRODUCT_LABELS.SALARY.singular },
  { id: 'propositions', label: PRODUCT_LABELS.PROPOSAL.plural },
  { id: 'documents', label: PRODUCT_LABELS.DOCUMENT.plural },
] as const;

export function Prestataire02Notifications({ unitId, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const [segment, setSegment] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const resource = usePrestataireResource<NotificationView[]>(
    async (api, signal) => (await api.myNotifications({ limit: 50, signal })).items,
    [],
  );
  const markAll = usePrestataireAction<{ marked: number }>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des notifications" rows={5} />;

  const notifications = resource.data;
  const visible = notifications.filter((notification) => {
    if (unreadOnly && notification.isRead) return false;
    return segment === 'all' || notificationDomain(notification) === segment;
  });
  const unread = notifications.filter((notification) => !notification.isRead).length;

  return (
    <>
      <PageHead
        title="Notifications"
        lede={`${unread} non lue(s). Chaque notification est un événement de travail : aucune notification marketing.`}
        seal={{ tone: unread > 0 ? 'gold' : 'emerald', label: unread > 0 ? `${unread} non lue(s)` : 'À jour' }}
      />

      <FilterChips
        label="Domaines"
        options={NOTIFICATION_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={segment}
        onChange={setSegment}
      />
      <FilterChips
        label="Lecture"
        options={[
          { id: 'all', label: 'Toutes' },
          { id: 'unread', label: 'Non lues' },
        ]}
        value={unreadOnly ? 'unread' : 'all'}
        onChange={(id) => setUnreadOnly(id === 'unread')}
      />

      <Panel title="Flux" zone="list">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Aucune nouvelle. Votre travail est à jour.</EmptyNotice>}
          render={(notification) => (
            <RecordCard
              title={notification.title}
              href={notification.linkRef?.screen ? `/${notification.linkRef.screen}${notification.linkRef.id ? `/${notification.linkRef.id}` : ''}` : undefined}
              seal={{ tone: notification.isRead ? 'slate' : 'emerald', label: notification.isRead ? 'Lue' : 'Non lue' }}
              facts={[
                { label: 'Reçue', value: formatDateTime(notification.createdAt) ?? '—' },
                { label: 'Message', value: notification.message },
              ]}
            />
          )}
        />
      </Panel>

      <ActionRow>
        <NeoPressButton
          variant="ghost"
          onClick={() => {
            void markAll.run((signal) => api!.markAllNotificationsRead(signal)).then((result) => {
              if (result) resource.reload();
            });
          }}
          loading={markAll.busy}
        >
          Tout marquer comme lu
        </NeoPressButton>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-02" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-03 · Profil candidat ───────────────── */

export function Prestataire03Profile({ unitId, pathname }: PrestataireUnitProps) {
  const actor = usePrestataireActor();
  const profile = usePrestataireResource(async (api, signal) => api.matchingProfile(signal), []);
  const documents = usePrestataireResource(async (api, signal) => (await api.myDocuments({ limit: 50, signal })).items, []);

  if (profile.status === 'error') return <SystemFeedback {...profile.error!} retry={profile.reload} />;
  if (profile.status === 'loading' || !profile.data) return <LoadingBlock label="Chargement du profil" rows={4} />;

  return (
    <>
      <PageHead
        title={actor?.actor.displayName || PRODUCT_LABELS.CANDIDATE.singular}
        lede="Profil professionnel : compétences déclarées, zone d’intervention et disponibilité réelle. Un niveau déclaré n’est jamais présenté comme vérifié."
        seal={{ tone: 'gold', label: PRODUCT_LABELS.CANDIDATE.singular }}
      />

      <Panel title="Identité de compte (session serveur)" zone="hero">
        <KeyValues
          items={[
            { label: 'Nom affiché', value: actor?.actor.displayName ?? null },
            { label: 'Statut du compte', value: actor?.actor.status === 'ACTIVE' ? 'Actif' : actor?.actor.status ?? null },
          ]}
        />
      </Panel>

      <Panel title="Profil de matching (données réelles)" zone="list">
        <KeyValues
          items={[
            { label: 'Compétences déclarées', value: profile.data.skills.length > 0 ? profile.data.skills.join(', ') : 'Aucune compétence déclarée' },
            { label: 'Disponibilité', value: AVAILABILITY_LABELS[profile.data.availability] ?? profile.data.availability },
            { label: 'Zone (département)', value: profile.data.departmentId ?? 'Non renseignée' },
            { label: 'Zone (commune)', value: profile.data.municipalityId ?? 'Non renseignée' },
            { label: 'Mis à jour le', value: formatDateTime(profile.data.updatedAt) ?? null },
          ]}
        />
      </Panel>

      <Panel title={PRODUCT_LABELS.DOCUMENT.plural} zone="list">
        {documents.status === 'loading' ? <LoadingBlock label="Chargement des documents" rows={2} /> : null}
        {documents.status === 'error' ? (
          <p className="lbm-caption" role="alert">Les documents n’ont pas pu être chargés.</p>
        ) : null}
        {documents.data ? (
          <RecordList
            items={documents.data}
            empty={<EmptyNotice>Aucun document déposé. Les pièces professionnelles se déposent dans l’espace documents.</EmptyNotice>}
            render={(document) => (
              <RecordCard
                title={document.title}
                href={`/prestataire/documents/${document.documentId}/historique`}
                seal={{ tone: document.status === 'ACTIVE' ? 'emerald' : 'slate', label: document.status === 'ACTIVE' ? 'Actif' : 'Révoqué' }}
                facts={[
                  { label: 'Type', value: document.documentType },
                  { label: 'Version courante', value: String(document.currentVersionNumber) },
                ]}
              />
            )}
          />
        ) : null}
      </Panel>

      <ActionRow>
        <Link href="/prestataire/documents" className="lbm-candidat__link">
            Gérer mes {PRODUCT_LABELS.DOCUMENT.plural.toLowerCase()}
        </Link>
        <RetryButton onClick={profile.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-03" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── PRE-04 · Paramètres candidat ───────────────── */

export function Prestataire04Settings({ unitId, pathname }: PrestataireUnitProps) {
  const api = usePrestataireApi();
  const profile = usePrestataireResource(async (api, signal) => api.matchingProfile(signal), []);
  const update = usePrestataireAction<unknown>();

  return (
    <>
      <PageHead
        title="Paramètres"
        lede="Régler sa vie professionnelle. Les réglages par défaut protègent le travailleur ; le seul réglage réellement disponible est la disponibilité pour le matching."
        seal={{ tone: 'slate', label: 'Partiel' }}
      />

      <Panel title="Disponibilité (réglage réel)" zone="form">
        {profile.status === 'loading' ? <LoadingBlock label="Chargement des réglages" rows={2} /> : null}
        {profile.data ? (
          <>
            <p className="lbm-caption lbm-muted">
              {`État actuel : ${AVAILABILITY_LABELS[profile.data.availability] ?? profile.data.availability}. Passer à « Indisponible » vous exclut temporairement du matching, sans pénalité de réputation.`}
            </p>
            <FilterChips
              label="Disponibilité"
              options={AVAILABILITY_OPTIONS.map((entry) => ({ id: entry.id, label: entry.label }))}
              value={profile.data.availability}
              onChange={(id) => {
                void update.run((signal) => api!.updateMatchingProfile({ availability: id as 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE' }, signal)).then((result) => {
                  if (result) profile.reload();
                });
              }}
            />
          </>
        ) : null}
        {update.error ? <p className="lbm-caption" role="alert">La mise à jour a échoué.</p> : null}
      </Panel>

      <Zone kind="notice">
        <Panel title="Rubriques déclarées par le design, sans route produit" zone="notice" tone="notice">
          {`Notifications (canaux, heures calmes), paiement, sécurité (2FA, appareils), confidentialité, accessibilité, données, pause professionnelle et suppression de compte : aucun réglage serveur n’est disponible. Aucune bascule fictive n’est affichée.`}
        </Panel>
      </Zone>

      <ActionRow>
        <Link href="/prestataire" className="lbm-candidat__link">
          Retour à l’accueil
        </Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · PRE-04" items={prestataireGapsFor(unitId, pathname)} />
    </>
  );
}
