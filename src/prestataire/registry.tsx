/**
 * PRE —— registre des écrans livrés (26 unités, 52 fiches).
 *
 * Chaque code de fiche PRE-01 → PRE-52 est associé à l'écran qui le rend. Les
 * variantes des fiches (mêmes zones, état imposé par la route) réutilisent
 * l'écran canonique : c'est la structure décrite par le Master Design.
 *
 * Ce module est le SEUL point d'entrée des routes `/prestataire/*` : il résout
 * la fiche depuis le chemin réel, applique la garde de session puis rend l'écran.
 */

import type { ReactNode } from 'react';
import { UnitBoundary } from './UnitBoundary';
import { resolvePrestataireScreen } from './screenMap';
import type { PrestataireUnitProps } from './types';
import {
  Prestataire01Dashboard,
  Prestataire02Notifications,
  Prestataire03Profile,
  Prestataire04Settings,
} from './screens/overview';
import { Prestataire05Market, Prestataire06Filters, Prestataire07OfferDetail } from './screens/market';
import {
  Prestataire08Apply,
  Prestataire10ApplicationFollowUp,
  Prestataire11Applications,
  Prestataire14Withdraw,
} from './screens/applications';
import { Prestataire16Proposals, Prestataire17ProposalDetail } from './screens/proposals';
import { Prestataire21ContractFolio, Prestataire24ContractSignature } from './screens/contracts';
import { Prestataire28Execution, Prestataire29Evidence } from './screens/execution';
import {
  Prestataire32Salary,
  Prestataire34SalaryDeclared,
  Prestataire36SalaryOverdue,
  Prestataire38SalaryOtp,
} from './screens/salary';
import {
  Prestataire40Replacement,
  Prestataire41ReplacementTransition,
  Prestataire42ReplacementDecision,
} from './screens/replacement';
import { Prestataire45Reputation, Prestataire47ReputationContest } from './screens/reputation';
import { Prestataire48Documents, Prestataire49DocumentVersions } from './screens/documents';

type PrestataireScreenComponent = (props: PrestataireUnitProps) => ReactNode;

/** Fiche → écran. Les variantes partagent l'écran canonique (design). */
export const PRESTATAIRE_SCREEN_COMPONENTS: Readonly<Record<string, PrestataireScreenComponent>> = {
  'PRE-01': Prestataire01Dashboard,
  'PRE-02': Prestataire02Notifications,
  'PRE-03': Prestataire03Profile,
  'PRE-04': Prestataire04Settings,
  'PRE-05': Prestataire05Market,
  'PRE-06': Prestataire06Filters,
  'PRE-07': Prestataire07OfferDetail,
  'PRE-08': Prestataire08Apply,
  'PRE-09': Prestataire08Apply,
  'PRE-10': Prestataire10ApplicationFollowUp,
  'PRE-11': Prestataire11Applications,
  'PRE-12': Prestataire10ApplicationFollowUp,
  'PRE-13': Prestataire10ApplicationFollowUp,
  'PRE-14': Prestataire14Withdraw,
  'PRE-15': Prestataire11Applications,
  'PRE-16': Prestataire16Proposals,
  'PRE-17': Prestataire17ProposalDetail,
  'PRE-18': Prestataire17ProposalDetail,
  'PRE-19': Prestataire17ProposalDetail,
  'PRE-20': Prestataire16Proposals,
  'PRE-21': Prestataire21ContractFolio,
  'PRE-22': Prestataire21ContractFolio,
  'PRE-23': Prestataire21ContractFolio,
  'PRE-24': Prestataire24ContractSignature,
  'PRE-25': Prestataire21ContractFolio,
  'PRE-26': Prestataire21ContractFolio,
  'PRE-27': Prestataire21ContractFolio,
  'PRE-28': Prestataire28Execution,
  'PRE-29': Prestataire29Evidence,
  'PRE-30': Prestataire29Evidence,
  'PRE-31': Prestataire28Execution,
  'PRE-32': Prestataire32Salary,
  'PRE-33': Prestataire32Salary,
  'PRE-34': Prestataire34SalaryDeclared,
  'PRE-35': Prestataire34SalaryDeclared,
  'PRE-36': Prestataire36SalaryOverdue,
  'PRE-37': Prestataire36SalaryOverdue,
  'PRE-38': Prestataire38SalaryOtp,
  'PRE-39': Prestataire38SalaryOtp,
  'PRE-40': Prestataire40Replacement,
  'PRE-41': Prestataire41ReplacementTransition,
  'PRE-42': Prestataire42ReplacementDecision,
  'PRE-43': Prestataire41ReplacementTransition,
  'PRE-44': Prestataire41ReplacementTransition,
  'PRE-45': Prestataire45Reputation,
  'PRE-46': Prestataire45Reputation,
  'PRE-47': Prestataire47ReputationContest,
  'PRE-48': Prestataire48Documents,
  'PRE-49': Prestataire49DocumentVersions,
  'PRE-50': Prestataire49DocumentVersions,
  'PRE-51': Prestataire49DocumentVersions,
  'PRE-52': Prestataire49DocumentVersions,
};

export function prestataireScreenCodes(): readonly string[] {
  return Object.keys(PRESTATAIRE_SCREEN_COMPONENTS);
}

/**
 * Rendu d'une route `/prestataire/*` rattachée à une unité PRE. Le chemin est
 * résolu vers sa fiche ; sans fiche correspondante, l'appelant garde la main
 * (aucun écran n'est inventé pour une route non livrée).
 */
export function PrestataireScreen({
  unitId,
  pathname,
  segments,
}: {
  unitId: string;
  pathname: string;
  segments: readonly string[];
}): ReactNode {
  const screen = resolvePrestataireScreen(pathname);
  if (!screen) return null;
  const Component = PRESTATAIRE_SCREEN_COMPONENTS[screen.code];
  if (!Component) return null;
  const props: PrestataireUnitProps = { unitId, pathname, segments, params: screen.params };
  return (
    <UnitBoundary unitId={unitId} screenCode={screen.code}>
      <Component {...props} />
    </UnitBoundary>
  );
}
