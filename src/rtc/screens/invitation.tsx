/**
 * RTC-02 — unité exacte « RTC — invitation & connexion »
 * (`design/llab/units.py`) : RTC-02 (invitation) et RTC-03 (connexion).
 *
 * Données : uniquement les routes serveur EXISTANTES
 * (`GET /api/v1/webrtc-sessions/:sessionId` pour le contexte,
 * `POST …/join` pour l'acceptation réelle). Aucune invitation, aucun refus,
 * aucun motif, aucune sonnerie et aucun état de connexion mesuré n'existent :
 * le refus et le repli audio restent désactivés, sans pénalité affichée.
 */

import {
  ActionRow,
  EmptyNotice,
  GapNotice,
  KeyValues,
  KpiRow,
  Link,
  LoadingBlock,
  NeoPressButton,
  PageHead,
  Panel,
  RetryButton,
  Timeline,
  UnavailableControls,
} from '../components';
import { SystemFeedback } from '../../public/SystemFeedback';
import { rtcGapsFor } from '../screenMap';
import { useRtcAction, useRtcApi, useRtcResource } from '../hooks';
import type { RtcApi, WebRtcSessionView } from '../api';
import type { RtcUnitProps } from '../types';
import {
  PRODUCT_LABELS,
  RTC_UI_TERMS,
  formatDateTime,
  participantRoleLabel,
  sessionStatusLabel,
} from '../vocabulary';
import {
  initiatorRole,
  isLiveSession,
  isRtcUnavailable,
  joinedParticipants,
  sessionMilestones,
  sessionStatusTone,
  unavailableWhenNotInstalled,
  type RtcUnavailable,
} from './shared';

/* ─────────── RTC-02 · Invitation à la Session ─────────── */

async function loadInvitation(
  api: RtcApi,
  sessionId: string,
  signal: AbortSignal,
): Promise<WebRtcSessionView | RtcUnavailable> {
  return unavailableWhenNotInstalled(() => api.readSession(sessionId, signal));
}

export function Rtc02Invitation({ unitId, pathname, params }: RtcUnitProps) {
  const api = useRtcApi();
  const sessionId = params.id ?? '';
  const resource = useRtcResource<WebRtcSessionView | RtcUnavailable>(
    (rtcApi, signal) => loadInvitation(rtcApi, sessionId, signal),
    [sessionId],
  );
  const join = useRtcAction<WebRtcSessionView>();
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de l’invitation" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.INVITATION}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucune invitation n’est affichée à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-02" items={gaps} />
      </>
    );
  }

  const session = join.result ?? resource.data;
  const live = isLiveSession(session.status);

  const submitJoin = () => {
    if (!api) return;
    void join.run((signal) => api.joinSession(session.sessionId, signal));
  };

  return (
    <>
      <PageHead
        title={RTC_UI_TERMS.INVITATION}
        lede={`Session ${session.sessionId} · ${PRODUCT_LABELS.CONTRACT.singular} ${session.entityId} · invitée par ${initiatorRole(session) ?? '—'}. Refuser n’entraîne aucune pénalité affichée ; aucun motif n’est demandé.`}
        seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
      />

      <Panel title="Contexte de l’invitation" zone="hero">
        <KeyValues
          title="Contexte réel de la Session"
          items={[
            { label: 'Session', value: session.sessionId },
            { label: PRODUCT_LABELS.CONTRACT.singular, value: `${session.entityType} · ${session.entityId}` },
            { label: 'Invitée par', value: initiatorRole(session) ?? '—' },
            ...session.participants.map((participant) => ({
              label: `Invité le · ${participantRoleLabel(participant.role)}`,
              value: formatDateTime(participant.invitedAt) ?? '—',
            })),
          ]}
        />
        <p className="lbm-caption lbm-muted" data-no-invented-invitation="true">
          La Session expose uniquement les rôles (Employeur, Candidat) et le Contrat : aucun nom, aucune photo, aucun score de fiabilité, aucun objet résumé, aucun créneau et aucune durée prévue n’existent côté serveur.
        </p>
      </Panel>

      <KpiRow
        items={[
          { label: 'ENTRÉES', value: `${joinedParticipants(session)} / ${session.participants.length}` },
          { label: 'CONSENTEMENT DEMANDÉ', value: '—' },
          { label: 'DURÉE PRÉVUE', value: '—' },
        ]}
      />

      <ActionRow>
        {api && live ? (
          <NeoPressButton variant="primary" loading={join.busy} onClick={submitJoin}>
            Rejoindre
          </NeoPressButton>
        ) : null}
        {!live ? (
          <p className="lbm-body lbm-muted" data-session-closed="true">
            La Session est {sessionStatusLabel(session.status).toLowerCase()} ({session.status}) : l’entrée n’est plus possible.
          </p>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <Panel title="Actions indisponibles" zone="cta">
        <EmptyNotice>
          Aucune sonnerie, aucun refus et aucun report n’existent côté serveur : ces actions restent désactivées et ne produisent aucun effet.
        </EmptyNotice>
        <UnavailableControls
          ariaLabel="Actions d’invitation indisponibles"
          items={[
            {
              label: 'Rejoindre en audio seul',
              reference: 'POST /v1/calls/:id/accept {audioOnly}',
              reason: 'Aucune acceptation « audio seul » n’existe côté serveur : POST /api/v1/webrtc-sessions/:sessionId/join ne prend aucun paramètre.',
            },
            {
              label: 'Refuser',
              reference: 'POST /v1/calls/:id/decline {reason?}',
              reason: 'Aucun refus ni motif de refus n’existe côté serveur (POST /api/v1/calls/:callId/reject est déclaré sans handler : 501, jamais appelé).',
            },
          ]}
        />
      </Panel>

      {join.error ? <SystemFeedback {...join.error} /> : null}

      <ActionRow>
        <Link href={`/appel/${session.sessionId}/connexion`} className="lbm-rtc__link">Connexion · RTC-03</Link>
        <Link href={`/appel/${session.sessionId}`} className="lbm-rtc__link">Session en cours · RTC-04</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · RTC-02" items={gaps} />
    </>
  );
}

/* ─────────── RTC-03 · Connexion à la Session ─────────── */

async function loadConnection(
  api: RtcApi,
  sessionId: string,
  signal: AbortSignal,
): Promise<WebRtcSessionView | RtcUnavailable> {
  return unavailableWhenNotInstalled(() => api.readSession(sessionId, signal));
}

export function Rtc03Connection({ unitId, pathname, params }: RtcUnitProps) {
  const sessionId = params.id ?? '';
  const resource = useRtcResource<WebRtcSessionView | RtcUnavailable>(
    (rtcApi, signal) => loadConnection(rtcApi, sessionId, signal),
    [sessionId],
  );
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la connexion" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.CONNECTION}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucun état de connexion n’est affiché à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-03" items={gaps} />
      </>
    );
  }

  const session = resource.data;

  return (
    <>
      <PageHead
        title={RTC_UI_TERMS.CONNECTION}
        lede={`Session ${session.sessionId} · ${PRODUCT_LABELS.CONTRACT.singular} ${session.entityId}. Seul le statut réel de la Session est affiché, sans compte à rebours factice.`}
        seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
      />

      <Panel title="Établissement" zone="media">
        <Timeline steps={sessionMilestones(session)} />
        <p className="lbm-caption lbm-muted" data-no-fake-countdown="true">
          Étapes réelles (création, entrées, activité) lues sur la Session : aucune attente simulée, aucun compte à rebours factice.
        </p>
      </Panel>

      <KpiRow
        items={[
          { label: 'STATUT', value: sessionStatusLabel(session.status) },
          { label: 'TYPE DE CONNEXION', value: '—' },
          { label: 'LATENCE MESURÉE', value: '—' },
        ]}
      />

      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions de connexion indisponibles"
          items={[
            {
              label: 'Annuler',
              reference: 'POST /v1/calls/:id/cancel',
              reason: 'Aucune annulation d’établissement n’existe côté serveur ; la clôture termine la Session entière et n’est câblée qu’au « Raccrocher » de RTC-04.',
            },
            {
              label: 'Rejoindre en audio seul',
              reference: 'POST /v1/calls/:id/downgrade {audioOnly: true}',
              reason: 'Aucun repli audio serveur n’existe.',
            },
          ]}
        />
      </Panel>

      <ActionRow>
        <RetryButton onClick={resource.reload} />
        <Link href={`/appel/${session.sessionId}/diagnostic`} className="lbm-rtc__link">Diagnostic réseau · RTC-07</Link>
        <Link href={`/appel/${session.sessionId}`} className="lbm-rtc__link">Session en cours · RTC-04</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · RTC-03" items={gaps} />
    </>
  );
}
