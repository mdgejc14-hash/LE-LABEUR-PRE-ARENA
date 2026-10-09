/**
 * ADM —— registre des écrans livrés (10 unités, 17 fiches — tranches P4A et P4B-1).
 *
 * Chaque code de fiche ADM-01 → ADM-17 est associé à l'écran qui le rend. Les
 * variantes des fiches (mêmes zones, état imposé par la route) réutilisent
 * l'écran canonique : c'est la structure décrite par le Master Design.
 * P4B-1 ajoute la supervision des contrats : ADM-13 (registre), ADM-14
 * (fiche), ADM-15 (incidents), ADM-16 (révision forcée — capacité absente)
 * et ADM-17 (journal). Les fiches ADM-18 et suivantes (paiements, salaire,
 * litiges, remplacements, réputation, documents, ops, sécurité, infra) restent
 * hors tranches : aucune entrée n'est ajoutée pour elles.
 *
 * Ce module est le SEUL point d'entrée des routes `/admin/*` des tranches :
 * il résout la fiche depuis le chemin réel, applique la garde de session puis
 * rend l'écran.
 */

import type { ReactNode } from 'react';
import { UnitBoundary } from './UnitBoundary';
import { resolveAdminScreen } from './screenMap';
import type { AdminUnitProps } from './types';
import { Admin01Dashboard } from './screens/overview';
import { Admin02Users, Admin03UserSheet, Admin04Block, Admin05BlockJournal } from './screens/users';
import {
  Admin06QualificationQueue,
  Admin07QualificationReview,
  Admin08QualificationDecision,
  Admin09QualificationHistory,
} from './screens/qualification';
import { Admin10MatchingRuns, Admin11MatchingAudit, Admin12MatchingRules } from './screens/matching';
import {
  Admin13ContractsRegistry,
  Admin14ContractSheet,
  Admin15ContractIncidents,
  Admin16ContractForcedRevision,
  Admin17ContractJournal,
} from './screens/contracts';

type AdminScreenComponent = (props: AdminUnitProps) => ReactNode;

/** Fiche → écran. Les variantes partagent l'écran canonique (design). */
export const ADMIN_SCREEN_COMPONENTS: Readonly<Record<string, AdminScreenComponent>> = {
  'ADM-01': Admin01Dashboard,
  'ADM-02': Admin02Users,
  'ADM-03': Admin03UserSheet,
  'ADM-04': Admin04Block,
  'ADM-05': Admin05BlockJournal,
  'ADM-06': Admin06QualificationQueue,
  'ADM-07': Admin07QualificationReview,
  'ADM-08': Admin08QualificationDecision,
  'ADM-09': Admin09QualificationHistory,
  'ADM-10': Admin10MatchingRuns,
  'ADM-11': Admin11MatchingAudit,
  'ADM-12': Admin12MatchingRules,
  'ADM-13': Admin13ContractsRegistry,
  'ADM-14': Admin14ContractSheet,
  'ADM-15': Admin15ContractIncidents,
  'ADM-16': Admin16ContractForcedRevision,
  'ADM-17': Admin17ContractJournal,
};

export function adminScreenCodes(): readonly string[] {
  return Object.keys(ADMIN_SCREEN_COMPONENTS);
}

/**
 * Rendu d'une route `/admin/*` rattachée à une unité ADM de la tranche. Le
 * chemin est résolu vers sa fiche ; sans fiche correspondante, l'appelant
 * garde la main (aucun écran n'est inventé pour une route non livrée).
 */
export function AdminScreen({
  unitId,
  pathname,
  segments,
}: {
  unitId: string;
  pathname: string;
  segments: readonly string[];
}): ReactNode {
  const screen = resolveAdminScreen(pathname);
  if (!screen) return null;
  const Component = ADMIN_SCREEN_COMPONENTS[screen.code];
  if (!Component) return null;
  const props: AdminUnitProps = { unitId, pathname, segments, params: screen.params };
  return (
    <UnitBoundary unitId={unitId} screenCode={screen.code}>
      <Component {...props} />
    </UnitBoundary>
  );
}
