/**
 * RTC-05 — unité exacte « RTC — fin de session & historique »
 * (`design/llab/units.py`) : RTC-05 (fin & résumé) et RTC-06 (journal).
 *
 * Données : uniquement les routes serveur EXISTANTES
 * (`GET /api/v1/webrtc-sessions/:sessionId` pour le bilan,
 * `GET /api/v1/my/webrtc-sessions` paginé curseur pour le journal,
 * `POST /api/v1/webrtc-sessions {entityType: CONTRACT, entityId}` pour
 * « Ouvrir une Session »). Aucun résumé, aucune décision, aucune suite,
 * aucun enregistrement et aucun signalement n'existent : ces actions restent
 * désactivées, les durées sont calculées entre horodatages réels seuls.
 */

import { useState } from 'react';
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
  RecordCard,
  RecordList,
  RetryButton,
  UnavailableControls,
} from '../components';
import { SystemFeedback } from '../../public/SystemFeedback';
import { navigate } from '../../routing/navigation';
import { rtcGapsFor } from '../screenMap';
import { useRtcAction, useRtcApi, useRtcResource } from '../hooks';
import type { RtcApi, RtcPage, WebRtcSessionView } from '../api';
import type { RtcUnitProps } from '../types';
import {
  PRODUCT_LABELS,
  RTC_UI_TERMS,
  formatDateTime,
  formatDuration,
  sessionStatusLabel,
} from '../vocabulary';
import {
  isLiveSession,
  isRtcUnavailable,
  sessionStatusTone,
  unavailableWhenNotInstalled,
  type RtcUnavailable,
} from './shared';

/* ─────────── RTC-05 · Fin de Session & résumé ─────────── */

async function loadSummary(
  api: RtcApi,
  sessionId: string,
  signal: AbortSignal,
): Promise<WebRtcSessionView | RtcUnavailable> {
  return unavailableWhenNotInstalled(() => api.readSession(sessionId, signal));
}

export function Rtc05Summary({ unitId, pathname, params }: RtcUnitProps) {
  const sessionId = params.id ?? '';
  const resource = useRtcResource<WebRtcSessionView | RtcUnavailable>(
    (rtcApi, signal) => loadSummary(rtcApi, sessionId, signal),
    [sessionId],
  );
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement du résumé" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.SUMMARY}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucun résumé n’est affiché à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-05" items={gaps} />
      </>
    );
  }

  const session = resource.data;

  return (
    <>
      <PageHead
        title={RTC_UI_TERMS.SUMMARY}
        lede={`Session ${session.sessionId} · ${PRODUCT_LABELS.CONTRACT.singular} ${session.entityId}. Seul le bilan réel de la Session est affiché : aucun résumé unilatéral, aucun enregistrement.`}
        seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
      />

      <KpiRow
        items={[
          { label: 'DURÉE', value: formatDuration(session.createdAt, session.closedAt) ?? '—' },
          { label: 'STATUT', value: sessionStatusLabel(session.status) },
          { label: 'PARTICIPANTS', value: String(session.participants.length) },
          { label: 'ENREGISTREMENT', value: 'Aucun' },
        ]}
      />

      <Panel title="Bilan de Session" zone="verdict">
        <KeyValues
          title="Faits réels de la Session"
          items={[
            { label: 'Session', value: session.sessionId },
            { label: PRODUCT_LABELS.CONTRACT.singular, value: `${session.entityType} · ${session.entityId}` },
            { label: 'Créée le', value: formatDateTime(session.createdAt) ?? '—' },
            { label: 'Clôturée le', value: session.closedAt ? (formatDateTime(session.closedAt) ?? '—') : '—' },
            { label: 'Qualité moyenne', value: '—' },
          ]}
        />
        <p className="lbm-caption lbm-muted" data-no-invented-summary="true">
          La durée est calculée entre les horodatages réels de la Session ; « — » indique qu’aucune source serveur ne fournit la valeur.
        </p>
      </Panel>

      <Panel title="Décisions & suites" zone="list">
        <EmptyNotice>
          Aucune décision ni suite n’est disponible : aucune note, aucune action et aucun résumé n’existent côté serveur.
        </EmptyNotice>
      </Panel>

      <Panel title="Enregistrement & pièces" zone="doc">
        <EmptyNotice>
          Aucun enregistrement n’est disponible : aucun enregistrement, aucune empreinte et aucune durée de conservation n’existent côté serveur (voir RTC-08).
        </EmptyNotice>
      </Panel>

      <Panel title="Actions indisponibles" zone="cta">
        <UnavailableControls
          ariaLabel="Actions de fin de Session indisponibles"
          items={[
            {
              label: 'Rattacher au dossier',
              reference: 'POST /v1/calls/:id/actions',
              reason: 'Aucune note de synthèse, aucune action et aucun rattachement n’existent côté serveur.',
            },
            {
              label: 'Partager un résumé',
              reference: 'POST /v1/calls/:id/actions {share}',
              reason: 'Aucun résumé ni partage de résumé n’existe côté serveur.',
            },
            {
              label: 'Signaler un problème',
              reference: 'POST /v1/calls/:id/report',
              reason: 'Aucun signalement de Session n’existe côté serveur.',
            },
          ]}
        />
      </Panel>

      <ActionRow>
        <RetryButton onClick={resource.reload} />
        <Link href="/appels" className="lbm-rtc__link">Journal des Sessions · RTC-06</Link>
      </ActionRow>
      <GapNotice title="BACKEND_GAP · RTC-05" items={gaps} />
    </>
  );
}

/* ─────────── RTC-06 · Journal des Sessions ─────────── */

async function loadHistoryPage(
  api: RtcApi,
  cursor: string | null,
  signal: AbortSignal,
): Promise<RtcPage<WebRtcSessionView> | RtcUnavailable> {
  return unavailableWhenNotInstalled(() => api.mySessions({ limit: 25, cursor, signal }));
}

export function Rtc06History({ unitId, pathname }: RtcUnitProps) {
  const api = useRtcApi();
  const [extra, setExtra] = useState<readonly WebRtcSessionView[]>([]);
  const [next, setNext] = useState<{ cursor: string | null; hasMore: boolean } | null>(null);
  const [contractRef, setContractRef] = useState('');
  const create = useRtcAction<WebRtcSessionView>();
  const pageAction = useRtcAction<RtcPage<WebRtcSessionView> | RtcUnavailable>();
  const resource = useRtcResource<RtcPage<WebRtcSessionView> | RtcUnavailable>(
    (rtcApi, signal) => loadHistoryPage(rtcApi, null, signal),
    [],
  );
  const gaps = rtcGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des Sessions" rows={5} />;

  if (isRtcUnavailable(resource.data)) {
    return (
      <>
        <PageHead
          title={RTC_UI_TERMS.HISTORY}
          lede="Les Sessions temps réel ne sont pas installées dans cet environnement : la route répond 501. Aucun journal n’est affiché à la place."
          seal={{ tone: 'slate', label: 'Non installé' }}
        />
        <GapNotice title="BACKEND_GAP · RTC-06" items={gaps} />
      </>
    );
  }

  const first = resource.data;
  const visible = [...first.items, ...extra];
  const paging = next ?? { cursor: first.cursor, hasMore: first.hasMore };
  const live = visible.filter((session) => isLiveSession(session.status)).length;
  const done = visible.length - live;

  const loadMore = () => {
    if (!api || !paging.hasMore || !paging.cursor || pageAction.busy) return;
    const cursor = paging.cursor;
    void pageAction.run((signal) => loadHistoryPage(api, cursor, signal)).then((page) => {
      if (page && !isRtcUnavailable(page)) {
        setExtra((previous) => [...previous, ...page.items]);
        setNext({ cursor: page.cursor, hasMore: page.hasMore });
      } else if (page) {
        setNext({ cursor: null, hasMore: false });
      }
    });
  };

  const resetPaging = () => {
    setExtra([]);
    setNext(null);
    pageAction.reset();
    resource.reload();
  };

  const submitCreate = () => {
    if (!api || contractRef.trim().length === 0) return;
    void create.run((signal) => api.createSession(contractRef.trim(), signal)).then((session) => {
      if (session) navigate(`/appel/${session.sessionId}/preparation`);
    });
  };

  return (
    <>
      <PageHead
        title={RTC_UI_TERMS.HISTORY}
        lede={`${visible.length} Session(s) chargée(s) · ${live} en cours · ${done} terminée(s). Chaque Session est rattachée à un ${PRODUCT_LABELS.CONTRACT.singular} : aucune Session orpheline.`}
        seal={{ tone: 'cyan', label: PRODUCT_LABELS.WEBRTC_SESSION.plural }}
      />

      <KpiRow
        items={[
          { label: 'SESSIONS CHARGÉES', value: String(visible.length) },
          { label: 'EN COURS', value: String(live) },
          { label: 'TERMINÉES', value: String(done) },
        ]}
      />
      <p className="lbm-caption lbm-muted" data-page-counts="true">
        Compteurs calculés sur la page chargée uniquement : ni durée totale, ni qualité moyenne, ni enregistrements conservés (aucun agrégat serveur).
      </p>

      <Panel title="Ouvrir une Session" zone="list">
        <p className="lbm-body">
          Une Session est ouverte entre les parties réelles d’un {PRODUCT_LABELS.CONTRACT.singular} actif. Saisir la référence du {PRODUCT_LABELS.CONTRACT.singular} lue dans l’espace du {PRODUCT_LABELS.CONTRACT.singular.toLowerCase()} : le serveur refuse honnêtement toute autre référence.
        </p>
        <label className="lbm-rtc__field">
          <span>Référence du {PRODUCT_LABELS.CONTRACT.singular}</span>
          <input value={contractRef} onChange={(event) => setContractRef(event.target.value)} placeholder="Contrat actif dont vous êtes partie" />
        </label>
        <div className="lbm-rtc__actions">
          {api ? (
            <NeoPressButton variant="primary" disabled={contractRef.trim().length === 0} loading={create.busy} onClick={submitCreate}>
              Ouvrir une Session
            </NeoPressButton>
          ) : null}
        </div>
      </Panel>

      {create.error ? <SystemFeedback {...create.error} /> : null}

      <Panel title="Sessions">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Aucune Session pour l’instant. Les Sessions existent entre les parties réelles d’un Contrat actif, pour une entrevue, un point d’exécution ou une médiation.</EmptyNotice>}
          render={(session) => (
            <RecordCard
              title={`Session ${session.sessionId}`}
              href={`/appel/${session.sessionId}`}
              seal={{ tone: sessionStatusTone(session.status), label: sessionStatusLabel(session.status) }}
              facts={[
                { label: PRODUCT_LABELS.CONTRACT.singular, value: session.entityId },
                { label: 'Créée le', value: formatDateTime(session.createdAt) ?? '—' },
                { label: 'Clôturée le', value: session.closedAt ? (formatDateTime(session.closedAt) ?? '—') : '—' },
                { label: 'Durée', value: formatDuration(session.createdAt, session.closedAt) ?? '—' },
              ]}
            />
          )}
        />
      </Panel>

      <ActionRow>
        {paging.hasMore && paging.cursor ? (
          <NeoPressButton variant="ghost" loading={pageAction.busy} onClick={loadMore}>
            Charger plus
          </NeoPressButton>
        ) : null}
        <RetryButton onClick={resetPaging} />
      </ActionRow>

      {pageAction.result && isRtcUnavailable(pageAction.result) ? (
        <Panel title="Page suivante indisponible" zone="list">
          <EmptyNotice>La page suivante n’est pas installée dans cet environnement : la route répond 501. Les Sessions déjà chargées restent affichées.</EmptyNotice>
        </Panel>
      ) : null}
      {pageAction.error ? <SystemFeedback {...pageAction.error} /> : null}
      <GapNotice title="BACKEND_GAP · RTC-06" items={gaps} />
    </>
  );
}
