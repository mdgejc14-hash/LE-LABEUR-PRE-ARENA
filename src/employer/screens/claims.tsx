/**
 * EMP-39 / EMP-40 / EMP-49 → EMP-55 — Claims : ouverture, suivi, pièces,
 * résolution, escalade, attente, décision et clôture.
 *
 * Réutilise la couche Claim EXISTANTE : POST /claims, GET /my/claims,
 * GET /claims/:claimId, POST /claims/:claimId/evidence-requests/:requestId/submit.
 * L'instruction, la résolution et l'escalade sont des actes de modération : elles
 * ne sont pas simulées ici (BACKEND_GAP déclarés par écran).
 */

import { useState } from 'react';
import {
  ActionRow,
  EmptyNotice,
  FilterChips,
  GapNotice,
  KeyValues,
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
import { employerGapsFor } from '../screenMap';
import { useEmployerAction, useEmployerApi, useEmployerResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { Contract } from '../../types';
import type { ClaimView, ClaimType } from '../api';
import type { EmployerUnitProps } from '../types';
import { CLAIM_STATUS_LABELS, CLAIM_TYPE_LABELS, PRODUCT_LABELS, formatDate, formatDateTime } from '../vocabulary';

function claimTone(status: ClaimView['status']): 'emerald' | 'gold' | 'amber' | 'slate' | 'clay' {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'emerald';
  if (status === 'REJECTED') return 'clay';
  if (status === 'ADMIN_REVIEW' || status === 'UNDER_REVIEW') return 'gold';
  if (status === 'EVIDENCE_REQUESTED') return 'amber';
  return 'slate';
}

const CLAIM_TYPES: ClaimType[] = ['SALARY_NOT_RECEIVED', 'PAYMENT_DISPUTE', 'CONTRACT_INCIDENT', 'OTHER_REVIEW_REQUIRED'];

function ClaimCard({ claim }: { claim: ClaimView }) {
  return (
    <RecordCard
      title={`${CLAIM_TYPE_LABELS[claim.type]} · ${claim.claimId}`}
      href={`/client/litiges/${claim.claimId}`}
      seal={{ tone: claimTone(claim.status), label: CLAIM_STATUS_LABELS[claim.status] }}
      facts={[
        { label: 'Contrat', value: claim.contractId },
        { label: 'Ouvert le', value: formatDate(claim.createdAt) ?? '—' },
        { label: 'Échéance', value: formatDate(claim.dueAt) ?? '—' },
      ]}
    />
  );
}

/* ───────────────── EMP-39 · Ouverture d'un claim ───────────────── */

export function Employer39ClaimOpen({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const contractId = params.id ?? '';
  const [type, setType] = useState<ClaimType>('CONTRACT_INCIDENT');
  const [reason, setReason] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [created, setCreated] = useState<ClaimView | null>(null);
  const action = useEmployerAction<ClaimView>();
  const resource = useEmployerResource<Contract | null>(async (employerApi, signal) => employerApi.contract(contractId, signal).catch(() => null), [contractId]);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du contrat concerné" rows={3} />;

  const contract = resource.data;

  return (
    <>
      <PageHead
        title="Ouvrir un dossier de claim"
        lede="Le dossier est ouvert sur un contrat réel ; la modération en assure l’instruction."
        seal={{ tone: 'clay', label: 'Claim' }}
      />

      <Panel title="Motif & catégorie" zone="form">
        <label className="lbm-employer__field">
          <span>Catégorie réelle du modèle</span>
          <select value={type} onChange={(event) => setType(event.target.value as ClaimType)}>
            {CLAIM_TYPES.map((entry) => (
              <option key={entry} value={entry}>
                {CLAIM_TYPE_LABELS[entry]}
              </option>
            ))}
          </select>
        </label>
        <label className="lbm-employer__field">
          <span>Faits (obligatoire, 20 caractères minimum)</span>
          <textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className="lbm-employer__field">
          <span>Référence de pièce (facultatif)</span>
          <input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} />
        </label>
      </Panel>

      <Panel title="Contrat concerné" zone="hero">
        {contract ? (
          <KeyValues
            items={[
              { label: 'Contrat', value: contract.id },
              { label: 'Offre', value: contract.offerTitle },
              { label: 'Candidat', value: contract.employeeName },
              { label: 'Statut', value: contract.status },
            ]}
          />
        ) : (
          <EmptyNotice>Aucun contrat lisible pour cet identifiant : un dossier de claim ne peut pas être ouvert sans contrat réel.</EmptyNotice>
        )}
      </Panel>

      <Panel title="Conséquences immédiates" zone="kpi">
        <ul className="lbm-employer__list">
          <li className="lbm-body">Le dossier apparaît immédiatement dans vos claims et dans la file de modération.</li>
          <li className="lbm-body">Une restriction de contrat peut être appliquée par la modération (jamais automatiquement par cette interface).</li>
          <li className="lbm-body">Aucun montant, aucune pénalité et aucun remplacement ne sont décidés à l’ouverture.</li>
        </ul>
      </Panel>

      <ActionRow>
        {api && contract ? (
          <NeoPressButton
            variant="primary"
            disabled={reason.trim().length < 20}
            loading={action.busy}
            onClick={() =>
              action
                .run((signal) =>
                  api.createClaim(
                    {
                      contractId: contract.id,
                      type,
                      reason: reason.trim(),
                      ...(evidenceReference.trim() ? { evidenceReference: evidenceReference.trim() } : {}),
                    },
                    signal,
                  ),
                )
                .then((claim) => {
                  if (claim) setCreated(claim);
                })
            }
          >
            Ouvrir le dossier
          </NeoPressButton>
        ) : null}
        <Link href="/client/litiges" className="lbm-employer__link">
          Dossiers existants
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {created ? (
        <Panel title="Dossier ouvert" zone="verdict">
          <KeyValues items={[{ label: 'Référence', value: created.claimId }, { label: 'État', value: CLAIM_STATUS_LABELS[created.status] }]} />
          <Link href={`/client/litiges/${created.claimId}`} className="lbm-employer__link">
            Suivre le dossier
          </Link>
        </Panel>
      ) : null}

      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title="BACKEND_GAP · EMP-39" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

/* ───────────────── EMP-40 / EMP-49 → EMP-55 · Suivi d'un claim ───────────────── */

const CLAIM_SEGMENTS = [
  { id: 'ALL', label: 'Tous' },
  { id: 'OPEN', label: CLAIM_STATUS_LABELS.OPEN },
  { id: 'EVIDENCE_REQUESTED', label: CLAIM_STATUS_LABELS.EVIDENCE_REQUESTED },
  { id: 'UNDER_REVIEW', label: CLAIM_STATUS_LABELS.UNDER_REVIEW },
  { id: 'RESOLVED', label: CLAIM_STATUS_LABELS.RESOLVED },
  { id: 'CLOSED', label: CLAIM_STATUS_LABELS.CLOSED },
] as const;

export function Employer40ClaimFollowUp({ unitId, pathname }: EmployerUnitProps) {
  const [segment, setSegment] = useState('ALL');
  const resource = useEmployerResource<ClaimView[]>(async (api, signal) => (await api.myClaims({ limit: 100, signal })).items, []);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading' || !resource.data) return <LoadingBlock label="Chargement des dossiers de claim" rows={4} />;

  const claims = resource.data;
  const visible = claims.filter((claim) => segment === 'ALL' || claim.status === segment);
  const open = claims.filter((claim) => !['RESOLVED', 'REJECTED', 'CLOSED'].includes(claim.status)).length;

  return (
    <>
      <PageHead
        title={PRODUCT_LABELS.CLAIM.plural}
        lede={`${claims.length} dossier(s) réellement lisibles · ${open} en cours`}
        seal={{ tone: open > 0 ? 'amber' : 'slate', label: open > 0 ? `${open} en cours` : 'Aucun en cours' }}
      />

      <FilterChips label="États" options={CLAIM_SEGMENTS.map((entry) => ({ id: entry.id, label: entry.label }))} value={segment} onChange={setSegment} />

      <Panel title="Dossiers" zone="list">
        <RecordList
          items={visible}
          empty={<EmptyNotice>Aucun dossier de claim dans ce segment. Il n’y a rien à contester.</EmptyNotice>}
          render={(claim) => <ClaimCard claim={claim} />}
        />
      </Panel>

      <ActionRow>
        <Link href="/client/missions" className="lbm-employer__link">
          Offres
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title="BACKEND_GAP · EMP-40" items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

const CLAIM_DETAIL_TITLES: Record<string, string> = {
  'EMP-49': 'Dossier de claim',
  'EMP-50': 'Pièces et preuves',
  'EMP-51': 'Proposition de résolution',
  'EMP-52': 'Escalade & revue',
  'EMP-53': 'Attente de décision',
  'EMP-54': 'Décision de modération',
  'EMP-55': 'Claim clôturé',
};

export function Employer49ClaimDossier({ unitId, params, pathname }: EmployerUnitProps) {
  const api = useEmployerApi();
  const claimId = params.id ?? '';
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({});
  const resource = useEmployerResource<ClaimView | null>(async (employerApi, signal) => employerApi.claim(claimId, signal).catch(() => null), [claimId]);
  const action = useEmployerAction<ClaimView>();

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement du dossier de claim" rows={4} />;

  const claim = resource.data;
  const screenCode = pathname.endsWith('/preuves') ? 'EMP-50' : pathname.endsWith('/resolution') ? 'EMP-51' : 'EMP-49';
  const title = CLAIM_DETAIL_TITLES[screenCode] ?? 'Dossier de claim';

  return (
    <>
      <PageHead
        title={claim ? title : 'Dossier de claim introuvable'}
        lede={claim ? `${CLAIM_TYPE_LABELS[claim.type]} · ouvert le ${formatDate(claim.createdAt) ?? '—'}` : 'Aucun dossier réellement lisible pour cet identifiant.'}
        seal={claim ? { tone: claimTone(claim.status), label: CLAIM_STATUS_LABELS[claim.status] } : { tone: 'slate', label: 'Introuvable' }}
      />

      {claim ? (
        <>
          <Panel title="En-tête de dossier" zone="hero">
            <KeyValues
              items={[
                { label: 'Référence', value: claim.claimId },
                { label: 'Contrat', value: claim.contractId },
                { label: 'Échéance de réponse', value: formatDate(claim.dueAt) },
                { label: 'Motif déclaré', value: claim.reason },
                { label: 'Référence de pièce', value: claim.evidenceReference ?? null },
                { label: 'Résolu le', value: formatDateTime(claim.resolvedAt) },
                { label: 'Résolution', value: claim.resolution ?? null },
                { label: 'Dossier de remplacement', value: claim.replacementId ?? null },
              ]}
            />
          </Panel>

          <Panel title="Demandes de pièces (éléments réels)" zone="doc">
            <RecordList
              items={claim.evidenceRequests}
              empty={<EmptyNotice>Aucune pièce n’a été demandée sur ce dossier.</EmptyNotice>}
              render={(request) => (
                <RecordCard
                  title={`${request.requestedType} · ${request.status}`}
                  seal={{ tone: request.status === 'SUBMITTED' ? 'emerald' : request.status === 'EXPIRED' || request.status === 'CANCELLED' ? 'clay' : 'amber', label: request.status }}
                  facts={[
                    { label: 'Demandée le', value: formatDate(request.createdAt) ?? '—' },
                    { label: 'Échéance', value: formatDate(request.dueAt) ?? '—' },
                    { label: 'Déposée le', value: formatDateTime(request.submittedAt) ?? '—' },
                  ]}
                >
                  {request.status !== 'SUBMITTED' ? (
                    <div className="lbm-employer__inline-actions">
                      <label className="lbm-employer__field">
                        <span>Référence de la pièce déposée</span>
                        <input
                          value={evidenceDrafts[request.evidenceRequestId] ?? ''}
                          onChange={(event) => setEvidenceDrafts({ ...evidenceDrafts, [request.evidenceRequestId]: event.target.value })}
                        />
                      </label>
                      {api ? (
                        <NeoPressButton
                          variant="ghost"
                          disabled={(evidenceDrafts[request.evidenceRequestId] ?? '').trim().length === 0}
                          loading={action.busy}
                          onClick={() =>
                            action
                              .run((signal) => api.submitClaimEvidence(claim.claimId, request.evidenceRequestId, evidenceDrafts[request.evidenceRequestId].trim(), signal))
                              .then(() => resource.reload())
                          }
                        >
                          Déposer la pièce
                        </NeoPressButton>
                      ) : null}
                    </div>
                  ) : null}
                </RecordCard>
              )}
            />
          </Panel>

          <Panel title="Restrictions appliquées (réelles)" zone="table">
            <RecordList
              items={claim.restrictions}
              empty={<EmptyNotice>Aucune restriction appliquée au contrat pour ce dossier.</EmptyNotice>}
              render={(restriction) => (
                <RecordCard
                  title={restriction.scope}
                  seal={{ tone: restriction.status === 'RELEASED' ? 'slate' : 'clay', label: restriction.status === 'RELEASED' ? 'Levée' : 'Active' }}
                  facts={[
                    { label: 'Appliquée le', value: formatDateTime(restriction.appliedAt) ?? '—' },
                    { label: 'Motif', value: restriction.reason },
                    { label: 'Levée le', value: formatDateTime(restriction.releasedAt) ?? '—' },
                  ]}
                />
              )}
            />
          </Panel>

          <Zone kind="notice" label="Instruction">
            <EmptyNotice>
              Fil contradictoire, médiation assistée, escalade et décision sont des actes de modération : le produit ne les expose pas à l’employeur. Rien n’est simulé, aucun
              délai de la fiche n’est affiché comme s’il était contractuel.
            </EmptyNotice>
          </Zone>
        </>
      ) : (
        <EmptyNotice>Aucune donnée : le serveur n’a renvoyé aucun dossier pour cet identifiant.</EmptyNotice>
      )}

      <ActionRow>
        <Link href="/client/litiges" className="lbm-employer__link">
          Tous les dossiers
        </Link>
        {claim ? (
          <Link href={`/client/contrats/${claim.contractId}`} className="lbm-employer__link">
            Contrat
          </Link>
        ) : null}
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      {action.error ? <SystemFeedback {...action.error} /> : null}
      <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}

const CLAIM_STATE_TITLES: Record<string, string> = {
  'EMP-52': 'Escalade & revue',
  'EMP-53': 'Attente de décision',
  'EMP-54': 'Décision de modération',
  'EMP-55': 'Claim clôturé',
};

export function Employer52ClaimState({ unitId, params, pathname }: EmployerUnitProps) {
  const claimId = params.id ?? '';
  const screenCode = pathname.endsWith('/escalade') ? 'EMP-52' : pathname.endsWith('/attente') ? 'EMP-53' : pathname.endsWith('/decision') ? 'EMP-54' : 'EMP-55';
  const resource = useEmployerResource<ClaimView | null>(async (employerApi, signal) => employerApi.claim(claimId, signal).catch(() => null), [claimId]);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;
  if (resource.status === 'loading') return <LoadingBlock label="Chargement de l’état du dossier" rows={4} />;

  const claim = resource.data;

  return (
    <>
      <PageHead
        title={CLAIM_STATE_TITLES[screenCode] ?? 'État du dossier'}
        lede={claim ? `Dossier ${claim.claimId}` : 'Aucun dossier réellement lisible pour cet identifiant.'}
        seal={claim ? { tone: claimTone(claim.status), label: CLAIM_STATUS_LABELS[claim.status] } : { tone: 'slate', label: 'Introuvable' }}
      />

      {claim ? (
        <>
          <Panel title="État réel du dossier" zone="verdict">
            <KeyValues
              items={[
                { label: 'État', value: CLAIM_STATUS_LABELS[claim.status] },
                { label: 'Échéance', value: formatDate(claim.dueAt) },
                { label: 'Résolu le', value: formatDateTime(claim.resolvedAt) },
                { label: 'Résolution', value: claim.resolution ?? null },
                { label: 'Décidé par', value: claim.resolvedBy ?? null },
              ]}
            />
          </Panel>

          <Panel title={screenCode === 'EMP-54' || screenCode === 'EMP-55' ? 'Effets réels' : 'Ce que la modération examinera'} zone="list">
            <ul className="lbm-employer__list">
              <li className="lbm-body">Motif déclaré à l’ouverture : {claim.reason}</li>
              <li className="lbm-body">Pièces demandées : {claim.evidenceRequests.length} (statuts réels ci-dessus)</li>
              <li className="lbm-body">Restrictions : {claim.restrictions.length}</li>
              <li className="lbm-body">Référence de remplacement éventuelle : {claim.replacementId ?? 'aucune'}</li>
            </ul>
            <p className="lbm-caption lbm-muted">
              Aucune position de file, aucun SLA et aucune voie de recours ne sont publiés à l’employeur : ils ne sont pas affichés.
            </p>
          </Panel>
        </>
      ) : (
        <EmptyNotice>Aucune donnée : le serveur n’a renvoyé aucun dossier pour cet identifiant.</EmptyNotice>
      )}

      <ActionRow>
        <Link href={`/client/litiges/${claimId}`} className="lbm-employer__link">
          Dossier complet
        </Link>
        <Link href="/client/litiges" className="lbm-employer__link">
          Tous les dossiers
        </Link>
        <RetryButton onClick={resource.reload} />
      </ActionRow>

      <GapNotice title={`BACKEND_GAP · ${screenCode}`} items={employerGapsFor(unitId, pathname)} />
    </>
  );
}
