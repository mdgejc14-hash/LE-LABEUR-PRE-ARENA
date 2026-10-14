/**
 * RTC-04 — unité exacte « RTC — session active » (`design/llab/units.py`).
 *
 * Données : uniquement les routes serveur EXISTANTES
 * (`GET /api/v1/webrtc-sessions/:sessionId` pour le contexte,
 * `POST …/close` pour « Raccrocher », clé d'idempotence explicite). Aucun
 * flux média n'est rendu ni simulé (surface C-16 non implémentée) : ni
 * micro, ni caméra, ni partage, ni note, ni enregistrement. L'indicateur
 * d'enregistrement affiche « aucun enregistrement », jamais un état actif.
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
  isLiveSession,
  isRtcUnavailable,
  sessionStatusTone,
  unavailableWhenNotInstalled,
  type RtcUnavailable,
} from './shared';

/* ─────────── RTC-04 · Session en cours ─────────── */

async function loadActive(
  api: RtcApi,
  sessionId: string,
  signal: AbortSignal,
): Promise<WebRtcSessionView | RtcUnavailable> {
  return unavailableWhenNotInstalled(() => api.readSession(sessionId, signal));
}

export function Rtc04Active({ unitId, pathname, params }: RtcUnitProps) {
  const api = useRtcApi();
  const sessionId = params.id ?? '';
  const resource = useRtcResource<WebRtcSessionView | RtcUnavailable>(
    (rtcApi, signal) => loadActive(rtcApi, sessionId, signal),
    [sessionId],
  );
  const hangup = useRtcAction<WebRtcSessionView>();
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la Session" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.ACTIVE}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucune Session n’est affichée à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-04" items={gaps} />
      </>
    );
  }

  const session = hangup.result ?? resource.data;
  const live = isLiveSession(session.status);

  const submitHangup = () => {
    if (!api) return;
    void hangup.run((signal) => api.closeSession(session.sessionId, signal));
  };

  return (
    <>
      <PageHead
        title={RTC_UI_TERMS.ACTIVE}
        lede={`Session ${session.sessionId} · ${PRODUCT_LABELS.CONTRACT.singular} ${session.entityId}. Aucun flux média n’est rendu : seule la Session réelle est affichée.`}
        seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
      />

      <Panel title="Flux" zone="media">
        <EmptyNotice>
          Aucune vidéo, aucun aperçu local et aucun partage d’écran ne sont affichés : la surface d’appel (C-16) n’est pas implémentée et aucun média n’est simulé.
        </EmptyNotice>
        <KeyValues
          title="Participants réels de la Session"
          items={session.participants.map((participant) => ({
            label: participantRoleLabel(participant.role),
            value: participant.joinedAt ? `entré le ${formatDateTime(participant.joinedAt) ?? '—'}` : 'non entré',
          }))}
        />
      </Panel>

      <KpiRow
        items={[
          { label: 'STATUT', value: sessionStatusLabel(session.status) },
          { label: 'ENREGISTREMENT', value: 'Aucun' },
          { label: 'RÉSEAU', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-recording="true">
        « Aucun » indique qu’aucun enregistrement n’existe côté serveur (voir RTC-08) : l’indicateur n’est jamais actif. « — » indique qu’aucune mesure réseau n’existe.
      </p>

      <Panel title="Session" zone="kpi">
        <KeyValues
          title="Faits réels de la Session"
          items={[
            { label: 'Session', value: session.sessionId },
            { label: PRODUCT_LABELS.CONTRACT.singular, value: `${session.entityType} · ${session.entityId}` },
            { label: 'Créée le', value: formatDateTime(session.createdAt) ?? '—' },
            { label: 'Expire le', value: formatDateTime(session.expiresAt) ?? '—' },
            { label: 'Clôturée le', value: session.closedAt ? (formatDateTime(session.closedAt) ?? '—') : '—' },
          ]}
        />
      </Panel>

      <Panel title="Contrôles indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Contrôles de Session indisponibles"
          items={[
            {
              label: 'Couper le micro',
              reference: 'POST /v1/calls/:id/tracks {audio}',
              reason: 'Aucun contrôle serveur de micro, de caméra ni de partage d’écran n’existe.',
            },
            {
              label: 'Couper la caméra',
              reference: 'POST /v1/calls/:id/tracks {video}',
              reason: 'Aucun contrôle serveur de micro, de caméra ni de partage d’écran n’existe.',
            },
            {
              label: 'Note rapide',
              reference: 'POST /v1/calls/:id/notes',
              reason: 'Aucune note horodatée de Session n’existe côté serveur.',
            },
            {
              label: 'Partager une pièce',
              reference: 'POST /v1/calls/:id/share {documentId}',
              reason: 'Aucun partage de pièce pendant la Session n’existe côté serveur.',
            },
          ]}
        />
      </Panel>

      <ActionRow>
        {api && live ? (
          <NeoPressButton variant="primary" loading={hangup.busy} onClick={submitHangup}>
            Raccrocher
          </NeoPressButton>
        ) : null}
        {!live ? (
          <p className="lbm-body lbm-muted" data-session-closed="true">
            La Session est {sessionStatusLabel(session.status).toLowerCase()} ({session.status}).
          </p>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {hangup.error ? <SystemFeedback {...hangup.error} /> : null}

      <ActionRow>
        <Link href={`/appel/${session.sessionId}/fin`} className="lbm-rtc__link">Fin de Session · RTC-05</Link>
        <Link href={`/appel/${session.sessionId}/diagnostic`} className="lbm-rtc__link">Diagnostic réseau · RTC-07</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · RTC-04" items={gaps} />
    </>
  );
}
