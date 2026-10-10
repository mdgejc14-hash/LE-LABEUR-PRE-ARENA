/**
 * ADM —— registre des écrans livrés (23 unités, 45 fiches — tranches P4A,
 * P4B-1, P4B-2, P4C, P4D, P4E-1, P4E-2, P4F, P4F-2 et P4G-1).
 *
 * Chaque code de fiche ADM-01 → ADM-24 et ADM-26 → ADM-33 livré par ces
 * tranches est associé à l'écran qui le rend. Les variantes des fiches (mêmes
 * zones, état imposé par la route) réutilisent l'écran canonique, comme le
 * décrit le Master Design.
 * P4B-1 ajoute la supervision des contrats (ADM-13 → ADM-17). P4B-2 ajoute
 * ADM-18/19 Paiements et rapprochement, ADM-20 anomalies (BACKEND_GAP), ADM-21
 * déclarations externes depuis le DTO Payment et ADM-22 incident financier
 * (BACKEND_GAP), sur les routes canoniques déjà définies. P4C ajoute
 * ADM-23/24 confirmations de Salaire et preuve de réception (unité unique
 * « ADM — salaire (confirmations & preuves OTP) ») : la confirmation OTP
 * reste réservée au Candidat et l'ADMIN n'y accède pas (BACKEND_GAP).
 * P4D ajoute ADM-26 (file), ADM-27/28 (fiche & justificatifs) et ADM-29/30
 * (décision & consultation des Claims terminés), sans créer de route serveur.
 * P4E-1 ajoute l'unité « ADM — remplacements (file & arbitrage) » : ADM-31
 * (file), ADM-32 (suivi détaillé) et ADM-33 (arbitrage, BACKEND_GAP), en
 * lecture seule des routes admin.replacements.list/read existantes.
 * P4E-2 ajoute les unités de réputation : ADM-34/36 (ledger, corrections
 * REVERSE/RESTORE, réconciliation d'un sujet) et ADM-35 (recours,
 * BACKEND_GAP). P4F ajoute les unités documents : ADM-37/40 (registre R2 et
 * audit & rétention) et ADM-38/39 (vérification et quarantaine, BACKEND_GAP),
 * sur admin.documents.list / read et les commandes de révocation existantes.
 * P4F-2 ajoute ADM-41/42/43 : lecture de la boîte In-App par
 * admin.notifications.list ; agrégats, gabarits et délivrabilité restent
 * BACKEND_GAP.
 * P4G-1 ajoute l’unité ADM-44/45/46 : files, jobs et planifications
 * sans API ADMIN ops (BACKEND_GAP). SLO, dead-letter, sécurité et infra restent hors tranche.
 *
 * Ce module est le SEUL point d'entrée des routes `/admin/*` des tranches :
 * il résout la fiche depuis le chemin réel, applique la garde de session puis
 * rend l'écran.
 */

import type { ReactNode } from 'react';
import { UnitBoundary } from './UnitBoundary';
import { resolveAdminScreen } from './screenMap';
import type { AdminUnitProps } from './types';
import { Admin44Queues, Admin45QueueJobs, Admin46Cron } from './screens/operations';
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
import {
  Admin18PaymentRegistry,
  Admin19PaymentReconciliation,
  Admin20PaymentAnomaliesScreen,
  Admin21ExternalDeclarationsScreen,
  Admin22PaymentIncidentScreen,
} from './screens/payments';
import { Admin23SalaryConfirmations, Admin24SalaryProofReview } from './screens/salary';
import {
  Admin26ClaimRegistry,
  Admin27ClaimSheet,
  Admin28ClaimEvidence,
  Admin29ClaimDecision,
  Admin30ClaimDecisionHistory,
} from './screens/claims';
import {
  Admin31ReplacementRegistry,
  Admin32ReplacementSheet,
  Admin33ReplacementArbitration,
} from './screens/replacements';
import {
  Admin34ReputationLedger,
  Admin35ReputationContests,
  Admin36ReputationAudit,
} from './screens/reputation';
import {
  Admin37DocumentRegistry,
  Admin38DocumentVerification,
  Admin39DocumentQuarantine,
  Admin40DocumentAudit,
} from './screens/documents';
import {
  Admin41NotificationOrchestration,
  Admin42NotificationTemplates,
  Admin43NotificationDeliverability,
} from './screens/notifications';

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
  'ADM-18': Admin18PaymentRegistry,
  'ADM-19': Admin19PaymentReconciliation,
  'ADM-20': Admin20PaymentAnomaliesScreen,
  'ADM-21': Admin21ExternalDeclarationsScreen,
  'ADM-22': Admin22PaymentIncidentScreen,
  'ADM-23': Admin23SalaryConfirmations,
  'ADM-24': Admin24SalaryProofReview,
  'ADM-26': Admin26ClaimRegistry,
  'ADM-27': Admin27ClaimSheet,
  'ADM-28': Admin28ClaimEvidence,
  'ADM-29': Admin29ClaimDecision,
  'ADM-30': Admin30ClaimDecisionHistory,
  'ADM-31': Admin31ReplacementRegistry,
  'ADM-32': Admin32ReplacementSheet,
  'ADM-33': Admin33ReplacementArbitration,
  'ADM-34': Admin34ReputationLedger,
  'ADM-35': Admin35ReputationContests,
  'ADM-36': Admin36ReputationAudit,
  'ADM-37': Admin37DocumentRegistry,
  'ADM-38': Admin38DocumentVerification,
  'ADM-39': Admin39DocumentQuarantine,
  'ADM-40': Admin40DocumentAudit,
  'ADM-41': Admin41NotificationOrchestration,
  'ADM-42': Admin42NotificationTemplates,
  'ADM-43': Admin43NotificationDeliverability,
  'ADM-44': Admin44Queues,
  'ADM-45': Admin45QueueJobs,
  'ADM-46': Admin46Cron,
};

export function adminScreenCodes(): readonly string[] {
  return Object.keys(ADMIN_SCREEN_COMPONENTS);
}

/**
 * Rendu d'une route `/admin/*` rattachée à une unité ADM de la tranche. Le
 * chemin est résolu vers sa fiche ; sans fiche correspondante, l'appelant
 * garde la main (aucun écran n'est inventé pour une route non livrée). P4D
 * enregistre uniquement les routes ADM-26 à ADM-30 du Master exact ; P4E-1
 * uniquement ADM-31 à ADM-33 ; P4E-2 uniquement ADM-34 à ADM-36.
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
