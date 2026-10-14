/**
 * EMP —— registre des écrans livrés (32 unités, 60 fiches).
 *
 * Chaque code de fiche EMP-01 → EMP-60 est associé à l'écran qui le rend. Les
 * variantes des fiches (mêmes zones, état imposé par la route) réutilisent
 * l'écran canonique : c'est la structure décrite par le Master Design.
 *
 * Ce module est le SEUL point d'entrée des routes `/client/*` : il résout la
 * fiche depuis le chemin réel, applique la garde de session puis rend l'écran.
 */

import type { ReactNode } from 'react';
import { UnitBoundary } from './UnitBoundary';
import { resolveEmployerScreen } from './screenMap';
import type { EmployerUnitProps } from './types';
import { Employer01Dashboard, Employer02Notifications, Employer03Profile, Employer04Settings } from './screens/overview';
import {
  Employer05Offers,
  Employer06OfferWizard,
  Employer10Qualification,
  Employer11Pricing,
  Employer12Preview,
  Employer14OfferDetail,
  Employer15OfferEdit,
} from './screens/offers';
import { Employer16Applications, Employer17Candidate, Employer18Matching, Employer21Selection } from './screens/selection';
import {
  Employer23Proposals,
  Employer24ProposalDetail,
  Employer25ProposalWaiting,
  Employer26ProposalExpired,
  Employer27ProposalAccepted,
  Employer28ProposalWithdraw,
} from './screens/propositions';
import {
  Employer29ContractFolio,
  Employer30ContractVersions,
  Employer31ContractSignature,
  Employer32ContractActive,
  Employer33ContractCompleted,
  Employer34ContractTerminated,
  Employer35ContractReplaced,
  Employer60ContractSuccessor,
} from './screens/contracts';
import { Employer37Execution, Employer38Evidence } from './screens/execution';
import { Employer39ClaimOpen, Employer40ClaimFollowUp, Employer49ClaimDossier, Employer52ClaimState } from './screens/claims';
import {
  Employer41Payments,
  Employer42PaymentDetail,
  Employer43Declaration,
  Employer46Receipt,
  Employer48PaymentDispute,
} from './screens/payments';
import {
  Employer56Replacement,
  Employer58ReplacementSelection,
  Employer59ReplacementConfirmation,
} from './screens/replacement';

type EmployerScreenComponent = (props: EmployerUnitProps) => ReactNode;

/** Fiche → écran. Les variantes partagent l'écran canonique (design). */
export const EMPLOYER_SCREEN_COMPONENTS: Readonly<Record<string, EmployerScreenComponent>> = {
  'EMP-01': Employer01Dashboard,
  'EMP-02': Employer02Notifications,
  'EMP-03': Employer03Profile,
  'EMP-04': Employer04Settings,
  'EMP-05': Employer05Offers,
  'EMP-06': Employer06OfferWizard,
  'EMP-07': Employer06OfferWizard,
  'EMP-08': Employer06OfferWizard,
  'EMP-09': Employer06OfferWizard,
  'EMP-10': Employer10Qualification,
  'EMP-11': Employer11Pricing,
  'EMP-12': Employer12Preview,
  'EMP-13': Employer12Preview,
  'EMP-14': Employer14OfferDetail,
  'EMP-15': Employer15OfferEdit,
  'EMP-16': Employer16Applications,
  'EMP-17': Employer17Candidate,
  'EMP-18': Employer18Matching,
  'EMP-19': Employer18Matching,
  'EMP-20': Employer16Applications,
  'EMP-21': Employer21Selection,
  'EMP-22': Employer21Selection,
  'EMP-23': Employer23Proposals,
  'EMP-24': Employer24ProposalDetail,
  'EMP-25': Employer25ProposalWaiting,
  'EMP-26': Employer26ProposalExpired,
  'EMP-27': Employer27ProposalAccepted,
  'EMP-28': Employer28ProposalWithdraw,
  'EMP-29': Employer29ContractFolio,
  'EMP-30': Employer30ContractVersions,
  'EMP-31': Employer31ContractSignature,
  'EMP-32': Employer32ContractActive,
  'EMP-33': Employer33ContractCompleted,
  'EMP-34': Employer34ContractTerminated,
  'EMP-35': Employer35ContractReplaced,
  'EMP-36': Employer30ContractVersions,
  'EMP-37': Employer37Execution,
  'EMP-38': Employer38Evidence,
  'EMP-39': Employer39ClaimOpen,
  'EMP-40': Employer40ClaimFollowUp,
  'EMP-41': Employer41Payments,
  'EMP-42': Employer42PaymentDetail,
  'EMP-43': Employer43Declaration,
  'EMP-44': Employer43Declaration,
  'EMP-45': Employer41Payments,
  'EMP-46': Employer46Receipt,
  'EMP-47': Employer41Payments,
  'EMP-48': Employer48PaymentDispute,
  'EMP-49': Employer49ClaimDossier,
  'EMP-50': Employer49ClaimDossier,
  'EMP-51': Employer49ClaimDossier,
  'EMP-52': Employer52ClaimState,
  'EMP-53': Employer52ClaimState,
  'EMP-54': Employer52ClaimState,
  'EMP-55': Employer52ClaimState,
  'EMP-56': Employer56Replacement,
  'EMP-57': Employer56Replacement,
  'EMP-58': Employer58ReplacementSelection,
  'EMP-59': Employer59ReplacementConfirmation,
  'EMP-60': Employer60ContractSuccessor,
};

export function employerScreenCodes(): readonly string[] {
  return Object.keys(EMPLOYER_SCREEN_COMPONENTS);
}

/**
 * Rendu d'une route `/client/*` rattachée à une unité EMP. Le chemin est
 * résolu vers sa fiche ; sans fiche correspondante, l'appelant garde la main
 * (aucun écran n'est inventé pour une route non livrée).
 */
export function EmployerScreen({
  unitId,
  pathname,
  segments,
}: {
  unitId: string;
  pathname: string;
  segments: readonly string[];
}): ReactNode {
  const screen = resolveEmployerScreen(pathname);
  if (!screen) return null;
  const Component = EMPLOYER_SCREEN_COMPONENTS[screen.code];
  if (!Component) return null;
  const props: EmployerUnitProps = { unitId, pathname, segments, params: screen.params };
  return (
    <UnitBoundary unitId={unitId} screenCode={screen.code}>
      <Component {...props} />
    </UnitBoundary>
  );
}
