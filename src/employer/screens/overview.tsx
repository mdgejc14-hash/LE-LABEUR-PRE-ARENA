/**
 * EMP-01 → EMP-04 — Accueil, notifications, profil et paramètres employeur.
 *
 * Données : uniquement les routes existantes (offres, contrats, paiements,
 * claims, notifications). Aucun indicateur de vanité, aucune donnée simulée,
 * aucun calcul financier nouveau.
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
  Timeline,
  Zone,
} from '../components';
import { employerGapsFor } from '../screenMap';
import { useEmployerAction, useEmployerApi, useEmployerResource } from '../hooks';
import { useEmployerActor } from '../UnitBoundary';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Application, Contract, Offer } from '../../types';
import type { ClaimView, NotificationView, PaymentView } from '../api';
import type { EmployerApi } from '../api';
import type { EmployerUnitProps } from '../types';
import { PRODUCT_LABELS, formatAmount, formatDate, formatDateTime, offerStatusLabel } from '../vocabulary';

const OFFER_TONE: Record<Offer['status'], 'emerald' | 'amber' | 'slate' | 'gold'> = {
  ACTIVE: 'emerald',
  PAUSED: 'amber',
  FILLED: 'gold',
  CANCELLED: 'slate',
};

interface DashboardData {
  offers: Offer[];
  contracts: Contract[];
  payments: PaymentView[];
  claims: ClaimView[];
  applicationsByOffer: { offer: Offer; applications: Application[] }[];
}

async function loadDashboard(api: EmployerApi, signal: AbortSignal): Promise<DashboardData> {
  const [offers, contracts, payments, claims] = await Promise.all([
    api.myOffers({ limit: 25, signal }),
    api.myContracts({ limit: 25, signal }),
    api.myPayments({ limit: 25, signal }),
    api.myClaims({ limit: 25, signal }),
  ]);
  const activeOffers = offers.items.filter((offer) => offer.status === 'ACTIVE').slice(0, 3);
  const applicationsByOffer = await Promise.all(
    activeOffers.map(async (offer) => ({
      offer,
      applications: (await api.offerApplications(offer.id, { limit: 100, signal })).items,
    })),
  );
  return {
    offers: offers.items,
    contracts: contracts.items,
    payments: payments.items,
    claims: claims.items,
    applicationsByOffer,
  };
}

export function Employer01Dashboard({ unitId, pathname }: EmployerUnitProps) {
  const actor = useEmployerActor();
  const resource = useEmployerResource<DashboardData>(loadDashboard, []);
  const gaps = employerGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du tableau de bord" rows={5} />;

  const { offers, contracts, payments, claims, applicationsByOffer } = resource.data;
  const activeOffers = offers.filter((offer) => offer.status === 'ACTIVE');
  const activeContracts = contracts.filter((contract) => contract.status === 'ACTIVE');
  const openClaims = claims.filter((claim) => !['RESOLVED', 'REJECTED', 'CLOSED'].includes(claim.status));
  const nextPayments = [...payments].sort((left, right) => left.dueAt.localeCompare(right.dueAt)).slice(0, 4);
  const toReview = applicationsByOffer.reduce(
    (total, entry) =>
      total + entry.applications.filter((application) => application.status === 'PENDING' || application.status === 'REVIEW').length,
    0,
  );

  return (
    <>
      <PageHead
        title={`Bonjour${actor?.actor.displayName ? `, ${actor.actor.displayName}` : ''}`}
        lede={`${activeOffers.length} ${PRODUCT_LABELS.OFFER.plural.toLowerCase()} actives · ${toReview} ${PRODUCT_LABELS.APPLICATION.plural.toLowerCase()} à examiner (3 offres les plus récentes)`}
        seal={{ tone: 'gold', label: PRODUCT_LABELS.EMPLOYER.singular }}
      />

      <KpiRow
        items={[
          { label: PRODUCT_LABELS.OFFER.plural.toUpperCase(), value: String(activeOffers.length) },
          { label: PRODUCT_LABELS.CONTRACT.plural.toUpperCase(), value: String(activeContracts.length) },
          { label: PRODUCT_LABELS.CLAIM.plural.toUpperCase(), value: String(openClaims.length) },
        ]}
      />

      <Panel title={`${PRODUCT_LABELS.OFFER.plural} actives`}>
        <RecordList
          items={activeOffers}
          empty={<EmptyNotice>Aucune offre active. Publier une offre est la seule action qui crée du travail.</EmptyNotice>}
          render={(offer) => (
            <RecordCard
              title={offer.title}
              href={`/client/missions/${offer.id}`}
              seal={{ tone: OFFER_TONE[offer.status], label: offerStatusLabel(offer.status) }}
              facts={[
                { label: 'Publiée le', value: formatDate(offer.postedDate) ?? '—' },
                { label: 'Rémunération', value: formatAmount(offer.remuneration, offer.currency) },
                { label: 'Lieu', value: offer.locationLabel || offer.location },
              ]}
            />
          )}
        />
      </Panel>

      <Zone kind="timeline" label={`Prochaines échéances de ${PRODUCT_LABELS.PAYMENT.plural.toLowerCase()}`}>
        <h2 className="lbm-title-2">Prochaines échéances</h2>
        <Timeline
          steps={nextPayments.map((payment) => ({
            label: `${payment.paymentType === 'SALARY' ? PRODUCT_LABELS.SALARY.singular : 'Frais de plateforme'} · ${payment.periodKey}`,
            detail: `${formatDateTime(payment.dueAt) ?? '—'} · ${formatAmount(payment.amount, payment.currency)}`,
            done: payment.status === 'PAID',
          }))}
        />
        {nextPayments.length === 0 ? <EmptyNotice>Aucune échéance enregistrée pour ce compte.</EmptyNotice> : null}
      </Zone>

      <ActionRow>
        <Link href="/client/missions/nouvelle/1" className="lbm-employer__link">
          Publier une offre
        </Link>
        <Link href="/client/paiements" className="lbm-employer__link">
          Voir les {PRODUCT_LABELS.PAYMENT.plural.toLowerCase()}
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-01" items={gaps} />
    </>
  );
}

const NOTIFICATION_DOMAINS = [
  { id: 'all', label: 'Toutes' },
  { id: 'offres', label: PRODUCT_LABELS.OFFER.plural },
  { id: 'contrats', label: PRODUCT_LABELS.CONTRACT.plural },
  { id: 'paiements', label: PRODUCT_LABELS.PAYMENT.plural },
  { id: 'claims', label: PRODUCT_LABELS.CLAIM.plural },
] as const;

/** Domaine d'une notification, déduit de sa destination réelle (aucune catégorie inventée). */
export function notificationDomain(notification: NotificationView): string {
  const screen = (notification.linkRef?.screen ?? '').toLowerCase();
  if (screen.includes('paiement') || screen.includes('payment')) return 'paiements';
  if (screen.includes('contrat') || screen.includes('contract')) return 'contrats';
  if (screen.includes('claim') || screen.includes('litige')) return 'claims';
  if (screen.includes('mission') || screen.includes('offre')) return 'offres';
  return 'all';
}

export function Employer02Notifications({ unitId, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const [domain, setDomain] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const resource = useEmployerResource<NotificationView[]>(
    async (employerApi, signal) => (await employerApi.myNotifications({ limit: 50, state: unreadOnly ? 'UNREAD' : undefined, signal })).items,
    [unreadOnly],
  );
  const action = useEmployerAction<unknown>();
  const gaps = employerGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des notifications" rows={4} />;

  const visible = resource.data.filter((notification) => domain === 'all' || notificationDomain(notification) === domain);
  const unread = resource.data.filter((notification) => !notification.isRead).length;

  return (
    <>
      <PageHead
        title="Notifications"
        lede={`${resource.data.length} éléments chargés · ${unread} non lus`}
        seal={{ tone: unread > 0 ? 'gold' : 'slate', label: unread > 0 ? 'À lire' : 'À jour' }}
      />

      <FilterChips
        label="Filtre de domaine"
        options={NOTIFICATION_DOMAINS.map((entry) => ({ id: entry.id, label: entry.label }))}
        value={domain}
        onChange={setDomain}
      />
      <Zone kind="chips" label="Filtre d'état">
        <NeoPressButton variant={unreadOnly ? 'primary' : 'ghost'} aria-pressed={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>
          Non lues seulement
        </NeoPressButton>
      </Zone>

      <Panel title="Flux">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Rien de nouveau. Le travail est en ordre.</EmptyNotice>}
          render={(notification) => (
            <RecordCard
              title={notification.title}
              seal={{ tone: notification.isRead ? 'slate' : 'gold', label: notification.isRead ? 'Lu' : 'Non lu' }}
              facts={[
                { label: 'Reçu le', value: formatDateTime(notification.createdAt) ?? '—' },
                { label: 'Type', value: notification.type },
              ]}
            >
              <p className="lbm-body">{notification.message}</p>
              <div className="lbm-employer__inline-actions">
                {notification.linkRef?.screen ? (
                  <Link
                    href={`/${notification.linkRef.screen.replace(/^\//, '')}${notification.linkRef.id ? `/${notification.linkRef.id}` : ''}`}
                    className="lbm-employer__link"
                  >
                    Ouvrir
                  </Link>
                ) : null}
                {!notification.isRead && api ? (
                  <NeoPressButton
                    variant="text"
                    loading={action.busy}
                    onClick={() =>
                      action
                        .run((signal) => api.markNotificationRead(notification.id, signal))
                        .then(() => resource.reload())
                    }
                  >
                    Marquer comme lu
                  </NeoPressButton>
                ) : null}
              </div>
            </RecordCard>
          )}
        />
      </Panel>

      <ActionRow>
        {api ? (
          <NeoPressButton
            variant="ghost"
            loading={action.busy}
            onClick={() => action.run((signal) => api.markAllNotificationsRead(signal)).then(() => resource.reload())}
          >
            Tout marquer comme lu
          </NeoPressButton>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}

      <GapNotice title="BACKEND_GAP · EMP-02" items={gaps} />
    </>
  );
}

export function Employer03Profile({ unitId, pathname }: EmployerUnitProps) {
  const actor = useEmployerActor();
  const resource = useEmployerResource(
    async (api, signal) => ({
      contracts: (await api.myContracts({ limit: 25, signal })).items,
      claims: (await api.myClaims({ limit: 25, signal })).items,
    }),
    [],
  );
  const gaps = employerGapsFor(unitId, pathname);
  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du profil" rows={4} />;

  const completed = resource.data.contracts.filter((contract) => contract.status === 'COMPLETED').length;
  const openClaims = resource.data.claims.filter((claim) => !['RESOLVED', 'REJECTED', 'CLOSED'].includes(claim.status)).length;

  return (
    <>
      <PageHead
        title={`Profil ${PRODUCT_LABELS.EMPLOYER.singular.toLowerCase()}`}
        lede="Identité de compte réellement fournie par la session serveur."
        seal={{ tone: 'gold', label: actor?.actor.role ?? 'EMPLOYER' }}
      />
      <Panel title="Identité" zone="hero">
        <KeyValues
          items={[
            { label: 'Nom affiché', value: actor?.actor.displayName ?? null },
            { label: 'E-mail', value: actor?.actor.email ?? null },
            { label: 'Rôle', value: actor?.actor.role ?? null },
            { label: 'Statut du compte', value: actor?.actor.status ?? null },
            { label: 'Identifiant', value: actor?.actor.id ?? null },
          ]}
        />
      </Panel>
      <KpiRow
        items={[
          { label: `${PRODUCT_LABELS.CONTRACT.plural} terminés`, value: String(completed) },
          { label: `${PRODUCT_LABELS.CLAIM.plural} ouverts`, value: String(openClaims) },
        ]}
      />
      <GapNotice title="BACKEND_GAP · EMP-03" items={gaps} />
    </>
  );
}

export function Employer04Settings({ unitId, pathname }: EmployerUnitProps) {
  const actor = useEmployerActor();
  const gaps = employerGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title={`Paramètres ${PRODUCT_LABELS.EMPLOYER.singular.toLowerCase()}`}
        lede="Aucun réglage serveur n'est disponible dans le produit aujourd'hui."
        seal={{ tone: 'slate', label: 'Lecture seule' }}
      />
      <Panel title="Compte connecté" zone="form">
        <KeyValues
          items={[
            { label: 'Nom affiché', value: actor?.actor.displayName ?? null },
            { label: 'E-mail', value: actor?.actor.email ?? null },
            { label: 'Statut', value: actor?.actor.status ?? null },
          ]}
        />
      </Panel>
      <Panel title="Réglages indisponibles" zone="list">
        <RecordList
          items={[
            'Notifications et heures calmes',
            'Sécurité, appareils et sessions',
            'Moyens de paiement et échéancier par défaut',
            'Mentions légales et CGU',
            'Apparence et accessibilité',
            'Suspension et suppression de compte',
          ]}
          render={(item) => <span className="lbm-body">{item}</span>}
        />
        <EmptyNotice>
          Ces rubriques restent affichées à titre de structure : aucun réglage n'est enregistré tant que les endpoints correspondants n'existent pas.
        </EmptyNotice>
      </Panel>
      <GapNotice title="BACKEND_GAP · EMP-04" items={gaps} />
    </>
  );
}
