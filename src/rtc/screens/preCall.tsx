/**
 * RTC-01 — unité exacte « RTC — pré-appel & diagnostic réseau »
 * (`design/llab/units.py`) : RTC-01 (préparation) et RTC-07 (diagnostic).
 *
 * Données : uniquement les routes serveur EXISTANTES
 * (`GET /api/v1/webrtc-sessions/:sessionId` pour le contexte,
 * `POST …/join` pour l'entrée, `POST …/ice-configuration` pour l'état du
 * relais — état et motif seuls, jamais d'adresse ni de secret). Aucune
 * mesure réseau, aucun état matériau, aucun consentement et aucune jauge ne
 * sont simulés : les repères absents affichent « — ».
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
import type { RtcApi, WebRtcIceConfiguration, WebRtcSessionView } from '../api';
import type { RtcUnitProps } from '../types';
import {
  PRODUCT_LABELS,
  RTC_UI_TERMS,
  formatDateTime,
  iceStateLabel,
  sessionStatusLabel,
} from '../vocabulary';
import {
  initiatorRole,
  isLiveSession,
  isRtcUnavailable,
  joinedParticipants,
  sessionFacts,
  sessionMilestones,
  sessionStatusTone,
  unavailableWhenNotInstalled,
  type RtcUnavailable,
} from './shared';

/* ─────────── RTC-01 · Préparation de la Session ─────────── */

async function loadPreparation(
  api: RtcApi,
  sessionId: string,
  signal: AbortSignal,
): Promise<WebRtcSessionView | RtcUnavailable> {
  return unavailableWhenNotInstalled(() => api.readSession(sessionId, signal));
}

export function Rtc01Preparation({ unitId, pathname, params }: RtcUnitProps) {
  const api = useRtcApi();
  const sessionId = params.id ?? '';
  const resource = useRtcResource<WebRtcSessionView | RtcUnavailable>(
    (rtcApi, signal) => loadPreparation(rtcApi, sessionId, signal),
    [sessionId],
  );
  const join = useRtcAction<WebRtcSessionView>();
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la Session" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.PREPARATION}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucune préparation n’est affichée à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-01" items={gaps} />
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
        title={RTC_UI_TERMS.PREPARATION}
        lede={`Session ${session.sessionId} · ${PRODUCT_LABELS.CONTRACT.singular} ${session.entityId} · ${joinedParticipants(session)} entrée(s) sur ${session.participants.length}. Aucun flux n’est transmis avant l’entrée en Session.`}
        seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
      />

      <Panel title="Objet de la Session" zone="hero">
        <KeyValues
          title="Contexte réel de la Session"
          items={[
            { label: 'Session', value: session.sessionId },
            { label: PRODUCT_LABELS.CONTRACT.singular, value: `${session.entityType} · ${session.entityId}` },
            { label: 'Initiateur', value: initiatorRole(session) ?? '—' },
            { label: 'Créée le', value: formatDateTime(session.createdAt) ?? '—' },
            { label: 'Expire le', value: formatDateTime(session.expiresAt) ?? '—' },
          ]}
        />
      </Panel>

      <Panel title="Vérification locale" zone="media">
        <EmptyNotice>
          Aucun aperçu matériau n’est affiché : aucune mesure de caméra, de micro ou de haut-parleur n’existe côté serveur, et cet écran ne simule ni aperçu, ni jauge, ni test audio.
        </EmptyNotice>
        <KeyValues
          title="États matériau (aucune mesure)"
          items={[
            { label: 'Caméra', value: '—' },
            { label: 'Micro', value: '—' },
            { label: 'Haut-parleur', value: '—' },
          ]}
        />
      </Panel>

      <KpiRow
        items={[
          { label: 'LATENCE ESTIMÉE', value: '—' },
          { label: 'PERTE', value: '—' },
          { label: 'RELAIS', value: '—' },
          { label: 'CONSENTEMENT CROISÉ', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-precheck="true">
        « — » indique qu’aucune source serveur ne fournit la valeur : ce n’est ni un réseau sain, ni un consentement accordé, ni un refus. Aucune mesure n’est calculée dans le navigateur.
      </p>

      <ActionRow>
        {api && live ? (
          <NeoPressButton variant="primary" loading={join.busy} onClick={submitJoin}>
            Rejoindre la Session
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
        <UnavailableControls
          ariaLabel="Actions de préparation indisponibles"
          items={[
            {
              label: 'Rejoindre sans caméra',
              reference: 'POST /v1/calls/:id/join {audioOnly}',
              reason: 'Aucune entrée « audio seul » n’existe côté serveur : POST /api/v1/webrtc-sessions/:sessionId/join ne prend aucun paramètre.',
            },
            {
              label: 'Reporter',
              reference: 'RTC-01 · report de Session',
              reason: 'Aucun report, aucun créneau et aucune replanification n’existent côté serveur.',
            },
          ]}
        />
      </Panel>

      {join.error ? <SystemFeedback {...join.error} /> : null}

      <ActionRow>
        <Link href={`/appel/${session.sessionId}/diagnostic`} className="lbm-rtc__link">Diagnostic réseau · RTC-07</Link>
        <Link href={`/appel/${session.sessionId}`} className="lbm-rtc__link">Session en cours · RTC-04</Link>
        <Link href={`/appel/${session.sessionId}/consentement`} className="lbm-rtc__link">Consentement · RTC-08</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · RTC-01" items={gaps} />
    </>
  );
}

/* ─────────── RTC-07 · Diagnostic réseau de la Session ─────────── */

interface DiagnosticData {
  session: WebRtcSessionView;
  ice: WebRtcIceConfiguration;
}

async function loadDiagnostic(
  api: RtcApi,
  sessionId: string,
  signal: AbortSignal,
): Promise<DiagnosticData | RtcUnavailable> {
  return unavailableWhenNotInstalled(async () => ({
    session: await api.readSession(sessionId, signal),
    ice: await api.iceConfiguration(sessionId, signal),
  }));
}

export function Rtc07Diagnostic({ unitId, pathname, params }: RtcUnitProps) {
  const sessionId = params.id ?? '';
  const resource = useRtcResource<DiagnosticData | RtcUnavailable>(
    (rtcApi, signal) => loadDiagnostic(rtcApi, sessionId, signal),
    [sessionId],
  );
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du diagnostic" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.DIAGNOSTIC}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucun diagnostic n’est affiché à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-07" items={gaps} />
      </>
    );
  }

  const { session, ice } = resource.data;

  return (
    <>
      <PageHead
        title={RTC_UI_TERMS.DIAGNOSTIC}
        lede={`Session ${session.sessionId} · ${PRODUCT_LABELS.CONTRACT.singular} ${session.entityId}. Seul l’état de la configuration ICE est réel ; aucune mesure média n’existe.`}
        seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
      />

      <KpiRow
        items={[
          { label: 'ÉTAT DU RELAIS', value: iceStateLabel(ice.state) },
          { label: 'LATENCE', value: '—' },
          { label: 'PERTE DE PAQUETS', value: '—' },
          { label: 'GIGUE', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-diagnostics="true">
        « — » indique qu’aucune source serveur ne fournit la mesure : aucune courbe, aucun conseil et aucune bande de qualité ne sont calculés dans le navigateur.
      </p>

      <Panel title="Configuration ICE réelle" zone="kpi">
        <KeyValues
          title="État du relais (jamais d’adresse ni de secret)"
          items={[
            { label: 'État', value: `${iceStateLabel(ice.state)} (${ice.state})` },
            { label: 'Motif', value: ice.reason ?? '—' },
            { label: 'Expiration', value: ice.expiresAt ? (formatDateTime(ice.expiresAt) ?? '—') : '—' },
          ]}
        />
        <p className="lbm-caption lbm-muted" data-no-ice-secrets="true">
          Les adresses de serveurs, identifiants et secrets de signalisation ne sont jamais affichés (§3.6) : seul l’état de configuration est rendu.
        </p>
      </Panel>

      <Panel title="Conseils" zone="list">
        <EmptyNotice>
          Aucun conseil n’est affiché : les conseils de la fiche sont fondés sur des mesures réelles, et aucune mesure n’existe côté serveur.
        </EmptyNotice>
      </Panel>

      <Panel title="Qualité pendant la Session" zone="timeline">
        <Timeline steps={sessionMilestones(session)} />
        <p className="lbm-caption lbm-muted">
          Jalons réels de la Session (création, entrées, clôture) : aucune courbe de qualité, aucun événement réseau annoté.
        </p>
      </Panel>

      <Panel title="Session" zone="list">
        <KeyValues title="Faits réels de la Session" items={[...sessionFacts(session)]} />
      </Panel>

      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions de diagnostic indisponibles"
          items={[
            {
              label: 'Passer en 360p',
              reference: 'POST /v1/calls/:id/quality/profile {preset: 360p}',
              reason: 'Aucun profil qualité ni changement de définition n’existe côté serveur.',
            },
            {
              label: 'Continuer en audio seul',
              reference: 'POST /v1/calls/:id/quality/profile {preset: audio}',
              reason: 'Aucun repli audio serveur n’existe.',
            },
            {
              label: 'Envoyer le diagnostic au support',
              reference: 'POST /v1/calls/:id/diagnostics/send',
              reason: 'Aucun envoi de diagnostic, expurgé ou non, n’existe côté serveur.',
            },
          ]}
        />
      </Panel>

      <ActionRow>
        <RetryButton onClick={resource.reload} />
        <Link href={`/appel/${session.sessionId}/preparation`} className="lbm-rtc__link">Préparation · RTC-01</Link>
        <Link href={`/appel/${session.sessionId}`} className="lbm-rtc__link">Session en cours · RTC-04</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · RTC-07" items={gaps} />
    </>
  );
}
