/**
 * ADM-10 → ADM-12 — Runs de matching, audit de run et règles existantes.
 *
 * Données : AUCUNE route ADMIN ne liste, ne lit ni n’édite les runs ou les
 * règles de matching. Les lectures réelles (`matching.runs.create`,
 * `matching.runs.read`) sont strictement réservées à l’employeur propriétaire
 * (contrôle serveur). Les écrans affichent cet état réel et les règles
 * existantes réellement observées dans les données lues (file de
 * qualification) : aucun run, aucun score et aucune règle n’est inventé.
 */

import {
  ActionRow,
  DataTable,
  EmptyNotice,
  GapNotice,
  KpiRow,
  Link,
  PageHead,
  Panel,
  RecordCard,
  RecordList,
  StatusSeal,
} from '../components';
import { adminGapsFor } from '../screenMap';
import { useAdminResource } from '../hooks';
import { SystemFeedback } from '../../public/SystemFeedback';
import type { AdminApi } from '../api';
import type { AdminUnitProps } from '../types';
import { PRODUCT_LABELS, QUALIFICATION_DECISION_LABELS } from '../vocabulary';

const DECISION_TONE: Record<string, 'emerald' | 'amber' | 'clay'> = {
  ELIGIBLE_FOR_INDEPENDENT: 'emerald',
  HUMAN_REVIEW_REQUIRED: 'amber',
  BLOCKED: 'clay',
};

const DECISION_EFFECTS: Record<string, string> = {
  ELIGIBLE_FOR_INDEPENDENT: 'Le parcours indépendant est débloqué : l’employeur peut lancer un run de matching pour cette offre.',
  HUMAN_REVIEW_REQUIRED: 'La revue humaine doit être terminée avant tout résultat de matching pour cette offre.',
  BLOCKED: 'Aucun résultat de matching n’est produit pour cette offre.',
};

async function loadObservedRuleVersions(api: AdminApi, signal: AbortSignal): Promise<string[]> {
  const page = await api.reviewQueue({ limit: 100, signal });
  const versions = new Set<string>();
  for (const item of page.items) versions.add(item.qualification.ruleVersion);
  return [...versions].sort();
}

export function Admin10MatchingRuns({ unitId, pathname }: AdminUnitProps) {
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title={`Runs de ${PRODUCT_LABELS.MATCHING.singular.toLowerCase()}`}
        lede="Supervision du moteur de matching. Aucune route ADMIN ne liste les runs : l’état réel est affiché."
        seal={{ tone: 'slate', label: 'Source absente' }}
      />

      <KpiRow
        items={[
          { label: 'RUNS 24 H', value: '—' },
          { label: 'DURÉE MÉDIANE', value: '—' },
          { label: 'TAUX D’ÉCHEC', value: '—' },
          { label: 'FILES EN ATTENTE', value: '—' },
        ]}
      />
      <p className="lbm-caption lbm-muted">« — » : aucune métrique de santé du service de matching n’est exposée par le produit (BACKEND_GAP).</p>

      <DataTable
        caption="Runs de matching réellement listables côté administration"
        head={['Run', 'Offre', 'Déclencheur', 'Candidats évalués', 'Durée', 'Statut', 'Version des règles']}
        rows={[]}
        empty={<EmptyNotice>Aucun run n’est listable côté administration : les routes décrites par la fiche sont absentes, et la lecture réelle d’un run est réservée à l’employeur propriétaire (contrôle serveur).</EmptyNotice>}
      />

      <Panel title="Ce qui existe réellement" zone="list">
        <RecordList
          items={[
            {
              title: 'Création et lecture réservées à l’employeur propriétaire',
              facts: [
                { label: 'Route réelle', value: 'matching.runs.create / matching.runs.read' },
                { label: 'Autorité', value: 'Contrôle serveur (rôle EMPLOYER + propriétaire de l’offre)' },
              ],
            },
            {
              title: 'La qualification précède le matching',
              facts: [
                { label: 'Règle réelle', value: 'Aucune qualification, aucun run ; HUMAN_REVIEW_REQUIRED bloque tout résultat' },
                { label: 'File réelle', value: 'admin.qualifications/review (permission offers:moderate)' },
              ],
            },
          ]}
          render={(entry) => <RecordCard title={entry.title} facts={entry.facts} />}
        />
      </Panel>

      <ActionRow>
        <Link href="/admin/qualification" className="lbm-admin__link">File de qualification</Link>
        <Link href="/admin/matching/rulesets" className="lbm-admin__link">Règles existantes</Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-10" items={gaps} />
    </>
  );
}

export function Admin11MatchingAudit({ unitId, pathname, params }: AdminUnitProps) {
  const runId = params.id ?? '';
  const gaps = adminGapsFor(unitId, pathname);
  return (
    <>
      <PageHead
        title="Audit de run"
        lede={`Run : ${runId} · aucun détail de run n’est lisible côté administration`}
        seal={{ tone: 'slate', label: 'Source absente' }}
      />

      <Panel title="Résumé du run" zone="ring">
        <EmptyNotice>
          Aucun résumé n’est lisible : la route réelle de lecture d’un run (`matching.runs.read`) vérifie serveur que l’acteur est l’employeur propriétaire — un compte ADMIN reçoit un refus 403 réel.
        </EmptyNotice>
      </Panel>

      <DataTable
        caption="Candidats et contributions réellement lisibles côté administration"
        head={['Candidat', 'Score', 'Facteurs', 'Drapeaux']}
        rows={[]}
        empty={<EmptyNotice>Aucune matrice de contributions n’est lisible côté administration (BACKEND_GAP).</EmptyNotice>}
      />

      <Panel title="Audit de biais" zone="list">
        <EmptyNotice>Aucun test de biais n’est exposé : ni corrélation, ni seuils, ni kill switch par facteur (BACKEND_GAP).</EmptyNotice>
      </Panel>

      <ActionRow>
        <Link href="/admin/matching" className="lbm-admin__link">Runs de matching</Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-11" items={gaps} />
    </>
  );
}

export function Admin12MatchingRules({ unitId, pathname }: AdminUnitProps) {
  const resource = useAdminResource<string[]>(loadObservedRuleVersions, []);
  const gaps = adminGapsFor(unitId, pathname);

  if (resource.status === 'error') return <SystemFeedback {...resource.error!} retry={resource.reload} />;

  const observedVersions = resource.data ?? null;

  return (
    <>
      <PageHead
        title="Règles existantes"
        lede="Les règles réellement en vigueur, telles qu’observées dans les données lues. Aucune règle n’est modifiée, simulée ni activée depuis cette interface."
        seal={{ tone: 'gold', label: 'Lecture seule' }}
      />

      <DataTable
        caption="Versions de règles réellement observées"
        head={['Moteur', 'Version observée', 'Source réelle']}
        rows={[
          [
            <span key="engine">Qualification (décisions du moteur)</span>,
            observedVersions === null ? '—' : observedVersions.length > 0 ? <span key="version" className="lbm-mono">{observedVersions.join(', ')}</span> : '—',
            'File de revue réelle (admin.qualifications/review)',
          ],
          [
            <span key="engine">Classement (runs de matching)</span>,
            '—',
            'Aucune lecture ADMIN des runs (BACKEND_GAP)',
          ],
        ]}
        empty={null}
      />
      {resource.status === 'loading' ? (
        <p className="lbm-caption lbm-muted" role="status" aria-live="polite">Observation des versions en cours…</p>
      ) : null}

      <Panel title="Décisions possibles (réelles)" zone="kpi">
        <RecordList
          items={(['ELIGIBLE_FOR_INDEPENDENT', 'HUMAN_REVIEW_REQUIRED', 'BLOCKED'] as const)}
          render={(decision) => (
            <RecordCard
              title={QUALIFICATION_DECISION_LABELS[decision]}
              seal={{ tone: DECISION_TONE[decision], label: decision }}
              facts={[{ label: 'Effet réel', value: DECISION_EFFECTS[decision] }]}
            />
          )}
        />
        <p className="lbm-caption lbm-muted">
          Statuts réels du moteur de qualification (vérifiés dans le code produit) : aucune catégorie n’est inventée, aucune pondération n’est affichée à la place d’une règle.
        </p>
      </Panel>

      <Panel title="Édition des règles" zone="form">
        <EmptyNotice>
          Aucune édition n’est possible : aucune route de lecture, simulation, activation ou archivage de règles n’existe (BACKEND_GAP). Le bouton d’activation de la fiche reste désarmé — et dit pourquoi.
        </EmptyNotice>
      </Panel>

      <ActionRow>
        <Link href="/admin/matching" className="lbm-admin__link">Runs de matching</Link>
        <Link href="/admin/qualification" className="lbm-admin__link">File de qualification</Link>
      </ActionRow>

      <GapNotice title="BACKEND_GAP · ADM-12" items={gaps} />
    </>
  );
}
