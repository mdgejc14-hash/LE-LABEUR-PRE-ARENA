/**
 * RTC-08 — unité exacte « RTC — consentement » (`design/llab/units.py`).
 *
 * VUE DIAGNOSTIQUE : aucun consentement d'enregistrement ni aucun
 * enregistrement n'existe côté serveur (les trois références de design
 * `GET /v1/calls/:id/consent`, `POST …/consent {recording}` et
 * `POST …/consent/revoke` sont absentes des contrats — 404 — et le produit
 * ne stocke aucun média : les charges de signalisation sont expurgées à la
 * clôture). Le seul contexte réel affiché est la Session lue par
 * `GET /api/v1/webrtc-sessions/:sessionId`. Les trois décisions écrites par
 * la fiche restent désactivées, à taille égale (aucun piège visuel).
 */

import {
  ActionRow,
  EmptyNotice,
  GapNotice,
  KeyValues,
  KpiRow,
  Link,
  LoadingBlock,
  PageHead,
  Panel,
  RetryButton,
  UnavailableControls,
} from '../components';
import { SystemFeedback } from '../../public/SystemFeedback';
import { rtcGapsFor } from '../screenMap';
import { useRtcResource } from '../hooks';
import type { RtcApi, WebRtcSessionView } from '../api';
import type { RtcUnitProps } from '../types';
import {
  PRODUCT_LABELS,
  RTC_UI_TERMS,
  participantRoleLabel,
  sessionStatusLabel,
} from '../vocabulary';
import {
  isRtcUnavailable,
  sessionStatusTone,
  unavailableWhenNotInstalled,
  type RtcUnavailable,
} from './shared';

/* ─────────── RTC-08 · Consentement d’enregistrement ─────────── */

async function loadConsent(
  api: RtcApi,
  sessionId: string,
  signal: AbortSignal,
): Promise<WebRtcSessionView | RtcUnavailable> {
  return unavailableWhenNotInstalled(() => api.readSession(sessionId, signal));
}

export function Rtc08Consent({ unitId, pathname, params }: RtcUnitProps) {
  const sessionId = params.id ?? '';
  const resource = useRtcResource<WebRtcSessionView | RtcUnavailable>(
    (rtcApi, signal) => loadConsent(rtcApi, sessionId, signal),
    [sessionId],
  );
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du consentement" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.CONSENT}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucun consentement n’est affiché à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-08" items={gaps} />
      </>
    );
  }

  const session = resource.data;

  return (
    <>
      <PageHead
        title={RTC_UI_TERMS.CONSENT}
        lede={`Session ${session.sessionId} · ${PRODUCT_LABELS.CONTRACT.singular} ${session.entityId}. Aucun consentement d’enregistrement n’existe côté serveur : aucun enregistrement ne peut être activé, et le refus n’a aucune conséquence affichée.`}
        seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
      />

      <Panel title="Demande de consentement" zone="hero">
        <EmptyNotice>
          Aucune demande de consentement n’est disponible : aucune demande, aucun motif et aucune durée de conservation proposée n’existent côté serveur.
        </EmptyNotice>
        <KeyValues
          title="Parties réelles de la Session"
          items={[
            { label: 'Session', value: session.sessionId },
            { label: PRODUCT_LABELS.CONTRACT.singular, value: `${session.entityType} · ${session.entityId}` },
            ...session.participants.map((participant) => ({
              label: `Partie · ${participantRoleLabel(participant.role)}`,
              value: participant.joinedAt ? 'entrée' : 'non entrée',
            })),
          ]}
        />
      </Panel>

      <Panel title="Ce que cela implique" zone="list">
        <EmptyNotice>
          Aucune implication ne peut être vérifiée : aucun enregistrement audio ou vidéo, aucun accès limité, aucune conservation et aucune révocation n’existent côté serveur. Le produit ne stocke aucun média.
        </EmptyNotice>
      </Panel>

      <KpiRow
        items={[
          { label: 'VOTRE CONSENTEMENT', value: '—' },
          { label: 'CONSENTEMENT DE L’AUTRE PARTIE', value: '—' },
          { label: 'ENREGISTREMENT', value: 'Aucun' },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-no-invented-consent="true">
        « — » indique qu’aucune source serveur ne fournit l’état ; « Aucun » indique qu’aucun enregistrement n’existe. Aucun état n’est déduit, aucun accord mutuel n’est présenté.
      </p>

      <Panel title="Décider" zone="cta">
        <UnavailableControls
          ariaLabel="Décisions de consentement indisponibles"
          items={[
            {
              label: 'J’accepte l’enregistrement',
              reference: 'POST /v1/calls/:id/consent {recording: true}',
              reason: 'Aucun consentement d’enregistrement n’existe côté serveur : aucun enregistrement ne peut être activé.',
            },
            {
              label: 'Je refuse',
              reference: 'POST /v1/calls/:id/consent {recording: false}',
              reason: 'Aucun consentement d’enregistrement n’existe côté serveur. Le refus n’a aucune conséquence affichée.',
            },
            {
              label: 'Révoquer mon consentement',
              reference: 'POST /v1/calls/:id/consent/revoke',
              reason: 'Aucune révocation n’existe côté serveur : aucun enregistrement à arrêter, aucun fichier partiel à détruire.',
            },
          ]}
        />
      </Panel>

      <ActionRow>
        <RetryButton onClick={resource.reload} />
        <Link href={`/appel/${session.sessionId}/preparation`} className="lbm-rtc__link">Préparation · RTC-01</Link>
        <Link href={`/appel/${session.sessionId}`} className="lbm-rtc__link">Session en cours · RTC-04</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · RTC-08" items={gaps} />
    </>
  );
}
