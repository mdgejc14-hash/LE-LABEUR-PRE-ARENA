/**
 * ADM-06 → ADM-09 — File de qualification, revue humaine, décision de revue
 * et historique.
 *
 * Données : uniquement les routes existantes (`matching.qualification.review.list`
 * et `matching.qualification.review`, permission offers:moderate). Les décisions
 * réellement supportées sont ELIGIBLE_FOR_INDEPENDENT, HUMAN_REVIEW_REQUIRED et
 * BLOCKED (vérifiées dans `src/backend/matching/records.ts`) ; la revue humaine
 * n'accepte que les deux premières conclusions (ELIGIBLE_FOR_INDEPENDENT ou
 * BLOCKED), avec un motif de 10 à 1000 caractères.
 */

import { useState } from 'react';
import {
  ActionError,
  ActionRow,
  DataTable,
  EmptyNotice,
  Field,
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
  StatusSeal,
} from '../components';
import { adminGapsFor } from '../screenMap';
import { useAdminAction, useAdminApi, useAdminResource } from '../hooks';
import { useAdminActor } from '../UnitBoundary';
import { SystemFeedback } from '../../public/SystemFeedback';
import { REVIEW_DECISION_OPTIONS } from '../api';
import type { AdminApi, AdminPage, MissionQualificationRecord, QualificationReviewQueueItem } from '../api';
import type { AdminUnitProps } from '../types';
import {
  PRODUCT_LABELS,
  QUALIFICATION_CATEGORY_LABELS,
  QUALIFICATION_DECISION_LABELS,
  QUALIFICATION_SEVERITY_LABELS,
  formatDateTime,
} from '../vocabulary';

const DECISION_TONE: Record<string, 'emerald' | 'amber' | 'clay' | 'slate'> = {
  ELIGIBLE_FOR_INDEPENDENT: 'emerald',
  HUMAN_REVIEW_REQUIRED: 'amber',
  BLOCKED: 'clay',
};

const SEVERITY_TONE: Record<string, 'clay' | 'amber' | 'slate'> = {
  BLOCK: 'clay',
  REVIEW: 'amber',
  INFO: 'slate',
};

async function loadQueue(api: AdminApi, signal: AbortSignal, cursor: string | null): Promise<AdminPage<QualificationReviewQueueItem>> {
  return api.reviewQueue({ limit: 25, cursor, signal });
}

function reasonCodes(item: QualificationReviewQueueItem): string {
  return item.qualification.reasons.map((reason) => reason.code).join(', ') || '—';
}

export function Admin06QualificationQueue({ unitId, pathname }: AdminUnitProps) {
  const actor = useAdminActor();
  const [cursor, setCursor] = useState<string | null>(null);
  const resource = useAdminResource<AdminPage<QualificationReviewQueueItem>>((api, signal) => loadQueue(api, signal, cursor), [cursor]);
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement de la file de qualification" rows={5} />;

  const page = resource.data!;

  return (
    <>
      <PageHead
        title={`${PRODUCT_LABELS.QUALIFICATION.plural} en revue`}
        lede={`${page.items.length} qualifications en attente de revue humaine (page réelle) · tri réel : ancienneté (FIFO serveur)`}
        seal={{ tone: page.items.length > 0 ? 'amber' : 'emerald', label: page.items.length > 0 ? 'File active' : 'File vide' }}
      />

      <KpiRow
        items={[
          { label: 'EN ATTENTE', value: String(page.items.length) },
          { label: 'SLA À RISQUE', value: '—' },
          { label: 'TRAITÉES AUJOURD’HUI', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted">« — » : aucun compteur SLA ni délai médian n’est exposé par le produit (BACKEND_GAP).</p>

      <DataTable
        caption="File réelle des qualifications en attente de revue"
        head={['Qualification', 'Offre', 'Employeur', 'Motifs déclenchés', 'Version des règles', 'Évaluée le', 'Revue']}
        rows={page.items.map((item) => [
          <span key="id" className="lbm-mono">{item.qualification.qualificationId}</span>,
          item.offerTitle,
          item.employerDisplayName,
          <span key="reasons" className="lbm-mono">{reasonCodes(item)}</span>,
          <span key="rule" className="lbm-mono">{item.qualification.ruleVersion}</span>,
          formatDateTime(item.qualification.evaluatedAt) ?? '—',
          <Link key="review" href={`/admin/qualification/${encodeURIComponent(item.qualification.qualificationId)}`} className="lbm-admin__link">Ouvrir la revue</Link>,
        ])}
        empty={<EmptyNotice>Aucune qualification en attente de revue. C’est un état satisfaisant, pas un échec.</EmptyNotice>}
      />

      <ActionRow>
        {page.hasMore && page.cursor ? (
          <NeoPressButton variant="ghost" onClick={() => setCursor(page.cursor)}>Page suivante</NeoPressButton>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <p className="lbm-caption lbm-muted">
        {`Permissions de la session (dérivées serveur) : ${actor?.permissions.join(', ') ?? '—'} · la revue requiert offers:moderate.`}
      </p>

      <GapNotice title="BACKEND_GAP · ADM-06" items={gaps} />
    </>
  );
}

async function loadItem(api: AdminApi, signal: AbortSignal, qualificationId: string): Promise<QualificationReviewQueueItem | null> {
  const page = await api.reviewQueue({ limit: 100, signal });
  return page.items.find((item) => item.qualification.qualificationId === qualificationId) ?? null;
}

export function Admin07QualificationReview({ unitId, pathname, params }: AdminUnitProps) {
  const qualificationId = params.id ?? '';
  const resource = useAdminResource<QualificationReviewQueueItem | null>((api, signal) => loadItem(api, signal, qualificationId), [qualificationId]);
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || resource.data === undefined) return <LoadingBlock label="Chargement de la revue" rows={5} />;

  const item = resource.data;

  if (!item) {
    return (
      <>
        <PageHead title="Revue humaine" lede={`Qualification : ${qualificationId}`} seal={{ tone: 'slate', label: 'Hors file' }} />
        <EmptyNotice>
          Cette qualification n’est pas dans la file en attente : elle a déjà été revue, ou l’identifiant est inconnu. Aucune route de lecture individuelle n’existe (BACKEND_GAP) : la revue est composée depuis la file réelle.
        </EmptyNotice>
        <ActionRow>
          <Link href="/admin/qualification" className="lbm-admin__link">Retour à la file</Link>
          <RetryButton onClick={resource.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · ADM-07" items={gaps} />
      </>
    );
  }

  const { qualification } = item;
  const answers = qualification.answers;

  return (
    <>
      <PageHead
        title={item.offerTitle}
        lede={`Qualification ${qualification.qualificationId} · offre ${qualification.offerId} · employeur ${qualification.employerId}`}
        seal={{ tone: DECISION_TONE[qualification.decision] ?? 'amber', label: QUALIFICATION_DECISION_LABELS[qualification.decision] ?? qualification.decision }}
      />

      <Panel title="Déclenchement de la revue" zone="verdict">
        <KeyValues
          title="Déclenchement"
          items={[
            { label: 'Décision du moteur', value: QUALIFICATION_DECISION_LABELS[qualification.initialDecision] ?? qualification.initialDecision },
            { label: 'Version des règles', value: qualification.ruleVersion },
            { label: 'Évaluée le', value: formatDateTime(qualification.evaluatedAt) },
            { label: 'Revue humaine', value: qualification.reviewedAt ? `faite le ${formatDateTime(qualification.reviewedAt)}` : 'en attente' },
          ]}
        />
        <RecordList
          items={qualification.reasons}
          empty={<EmptyNotice>Aucun motif enregistré.</EmptyNotice>}
          render={(reason) => (
            <RecordCard
              title={reason.explanation}
              seal={{ tone: SEVERITY_TONE[reason.severity] ?? 'slate', label: QUALIFICATION_SEVERITY_LABELS[reason.severity] ?? reason.severity }}
              facts={[
                { label: 'Code', value: reason.code },
                { label: 'Catégorie', value: QUALIFICATION_CATEGORY_LABELS[reason.category] ?? reason.category },
              ]}
            />
          )}
        />
      </Panel>

      <Panel title="Réponses sources (inchangées)" zone="list">
        <KeyValues
          title="Réponses sources"
          items={[
            { label: 'Nature du service', value: answers.serviceNature },
            { label: 'Base de rémunération', value: answers.compensationBasis },
            { label: 'Contrainte de temps et de lieu', value: answers.timePlaceConstraint },
            { label: 'Livrable attendu', value: answers.deliverableDescription || null },
            { label: 'Critères d’acceptation', value: answers.acceptanceCriteria || null },
            { label: 'Contrainte affichée au candidat', value: answers.candidateFacingConstraintSummary || null },
          ]}
        />
        <p className="lbm-caption lbm-muted">Réponses telles que soumises par l’employeur : elles ne sont jamais modifiées par la revue (règle produit réelle).</p>
      </Panel>

      <Panel title="Demande d’information" zone="chat">
        <EmptyNotice>Aucune demande de complément n’est possible : l’endpoint décrit par la fiche est absent du produit (BACKEND_GAP).</EmptyNotice>
      </Panel>

      <ActionRow>
        <Link href={`/admin/qualification/${encodeURIComponent(qualification.qualificationId)}/decision`} className="lbm-admin__link">
          Rendre une décision
        </Link>
        <Link href="/admin/qualification" className="lbm-admin__link">Retour à la file</Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-07" items={gaps} />
    </>
  );
}

export function Admin08QualificationDecision({ unitId, pathname, params }: AdminUnitProps) {
  const actor = useAdminActor();
  const api = useAdminApi();
  const qualificationId = params.id ?? '';
  const resource = useAdminResource<QualificationReviewQueueItem | null>((adminApi, signal) => loadItem(adminApi, signal, qualificationId), [qualificationId]);
  const action = useAdminAction<MissionQualificationRecord>();
  const [decision, setDecision] = useState<(typeof REVIEW_DECISION_OPTIONS)[number] | ''>('');
  const [reason, setReason] = useState('');
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || resource.data === undefined) return <LoadingBlock label="Chargement de la décision" rows={4} />;

  const item = resource.data;
  const motif = reason.trim();
  const motifValid = motif.length >= 10 && motif.length <= 1000;
  const canSubmit = Boolean(api && item && decision && motifValid && (actor?.permissions.includes('offers:moderate') ?? false));

  const submit = () => {
    if (!api || !item || !decision || !motifValid) return;
    void action.run((signal) => api.decideReview(qualificationId, decision, motif, signal));
  };

  if (!item) {
    return (
      <>
        <PageHead title="Décision de revue" lede={`Qualification : ${qualificationId}`} seal={{ tone: 'slate', label: 'Hors file' }} />
        <EmptyNotice>
          Cette qualification ne peut plus être revue : elle a déjà été revue (la décision est à usage unique côté serveur, conflit 409 réel) ou l’identifiant est inconnu.
        </EmptyNotice>
        <ActionRow>
          <Link href="/admin/qualification" className="lbm-admin__link">Retour à la file</Link>
          <RetryButton onClick={resource.reload} />
        </ActionRow>
        <GapNotice title="BACKEND_GAP · ADM-08" items={gaps} />
      </>
    );
  }

  const { qualification } = item;
  const decided = action.result ?? null;

  return (
    <>
      <PageHead
        title="Décision de revue"
        lede={`Qualification ${qualification.qualificationId} · offre « ${item.offerTitle} » · employeur ${item.employerDisplayName}`}
        seal={{ tone: 'gold', label: 'Verdict humain' }}
      />

      {decided ? (
        <Panel title="Décision enregistrée" zone="verdict">
          <StatusSeal tone={DECISION_TONE[decided.decision] ?? 'slate'} label={QUALIFICATION_DECISION_LABELS[decided.decision] ?? decided.decision} />
          <KeyValues
            title="Décision réelle"
            items={[
              { label: 'Décision', value: QUALIFICATION_DECISION_LABELS[decided.decision] ?? decided.decision },
              { label: 'Revue par', value: decided.reviewedBy ?? null },
              { label: 'Revue le', value: formatDateTime(decided.reviewedAt) },
              { label: 'Motif', value: decided.reviewReason ?? null },
              { label: 'Version des règles', value: decided.ruleVersion },
            ]}
          />
          <p className="lbm-body">
            {decided.decision === 'ELIGIBLE_FOR_INDEPENDENT'
              ? 'Effet réel : le parcours indépendant est débloqué, l’employeur peut lancer un run de matching pour cette offre.'
              : 'Effet réel : le parcours indépendant est bloqué, aucun résultat de matching ne sera produit pour cette offre.'}
          </p>
          <p className="lbm-caption lbm-muted">La décision est idempotente, à usage unique et auditée côté serveur (MISSION_QUALIFICATION_REVIEWED).</p>
        </Panel>
      ) : (
        <Panel title="Choix de verdict" zone="verdict">
          <div className="lbm-admin__fields" role="radiogroup" aria-label="Décision de revue">
            {REVIEW_DECISION_OPTIONS.map((option) => (
              <label key={option} className="lbm-admin__check">
                <input
                  type="radio"
                  name="review-decision"
                  checked={decision === option}
                  onChange={() => setDecision(option)}
                />
                <span>
                  <StatusSeal tone={DECISION_TONE[option] ?? 'slate'} label={QUALIFICATION_DECISION_LABELS[option] ?? option} size="sm" />
                  {' '}
                  {option === 'ELIGIBLE_FOR_INDEPENDENT'
                    ? '— débloque le parcours indépendant (l’employeur peut lancer un run de matching).'
                    : '— bloque l’offre : aucun résultat de matching ne sera produit.'}
                </span>
              </label>
            ))}
          </div>
          <p className="lbm-caption lbm-muted">
            Seules ces deux décisions sont acceptées par le serveur. La troisième carte de la fiche (« complément requis ») n’existe pas côté produit (BACKEND_GAP).
          </p>
        </Panel>
      )}

      {!decided ? (
        <Panel title="Motivation (obligatoire)" zone="form">
          <Field
            label="Motif de la décision"
            hint="Le serveur exige un motif de 10 à 1000 caractères. La décision est signée (agent + horodatage serveur) et journalisée."
          >
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              aria-label="Motif de la décision de revue"
              placeholder="Faits constatés, règle appliquée, décision…"
            />
          </Field>
          <p className="lbm-caption lbm-muted" aria-live="polite">{motif.length} / 1000 caractères — minimum serveur : 10.</p>
        </Panel>
      ) : null}

      {action.error ? <ActionError error={action.error} /> : null}

      <ActionRow>
        {!decided ? (
          <NeoPressButton variant="primary" onClick={submit} disabled={!canSubmit} loading={action.busy}>
            Confirmer la décision
          </NeoPressButton>
        ) : null}
        <Link href="/admin/qualification" className="lbm-admin__link">Retour à la file</Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <p className="lbm-caption lbm-muted">
        {`Permissions de la session (dérivées serveur) : ${actor?.permissions.join(', ') ?? '—'} · la décision requiert offers:moderate.`}
      </p>

      <GapNotice title="BACKEND_GAP · ADM-08" items={gaps} />
    </>
  );
}

export function Admin09QualificationHistory({ unitId, pathname }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title="Historique des qualifications"
        lede="Traçabilité des verdicts rendus. Aucun historique n’est exposé par le produit."
        seal={{ tone: 'slate', label: 'Source absente' }}
      />

      <DataTable
        caption="Historique réel des verdicts de qualification"
        head={['Date', 'Qualification', 'Verdict', 'Règle', 'Agent', 'Issue']}
        rows={[]}
        empty={<EmptyNotice>Aucun historique de verdicts n’est lisible : les routes décrites par la fiche sont absentes du produit (BACKEND_GAP).</EmptyNotice>}
      />

      <Panel title="Ce qui existe réellement" zone="list">
        <EmptyNotice>
          Chaque revue humaine réelle écrit un événement MISSION_QUALIFICATION_REVIEWED dans le ledger d’audit serveur (avant/après, agent, motif). Aucune route ADMIN ne relit ce journal pour les qualifications : il n’est pas présenté ici comme une liste.
        </EmptyNotice>
      </Panel>

      <ActionRow>
        <Link href="/admin/qualification" className="lbm-admin__link">File de qualification</Link>
        <Link href="/admin" className="lbm-admin__link">Retour au tableau de bord</Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-09" items={gaps} />
    </>
  );
}
