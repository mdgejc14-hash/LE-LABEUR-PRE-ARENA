/**
 * RTC —— registre des écrans livrés (5 unités, 8 fiches).
 *
 * Chaque code de fiche RTC-01 → RTC-08 est associé à l'écran qui le rend.
 *
 * Ce module est le SEUL point d'entrée des routes `/appel/*` et `/appels` :
 * il résout la fiche depuis le chemin réel, applique la garde de session puis
 * rend l'écran.
 */

import type { ReactNode } from 'react';
import { UnitBoundary } from './UnitBoundary';
import { resolveRtcScreen } from './screenMap';
import type { RtcUnitProps } from './types';
import { Rtc01Preparation, Rtc07Diagnostic } from './screens/preCall';
import { Rtc02Invitation, Rtc03Connection } from './screens/invitation';
import { Rtc04Active } from './screens/active';
import { Rtc05Summary, Rtc06History } from './screens/history';
import { Rtc08Consent } from './screens/consent';

type RtcScreenComponent = (props: RtcUnitProps) => ReactNode;

/** Fiche → écran. */
export const RTC_SCREEN_COMPONENTS: Readonly<Record<string, RtcScreenComponent>> = {
  'RTC-01': Rtc01Preparation,
  'RTC-02': Rtc02Invitation,
  'RTC-03': Rtc03Connection,
  'RTC-04': Rtc04Active,
  'RTC-05': Rtc05Summary,
  'RTC-06': Rtc06History,
  'RTC-07': Rtc07Diagnostic,
  'RTC-08': Rtc08Consent,
};

export function rtcScreenCodes(): readonly string[] {
  return Object.keys(RTC_SCREEN_COMPONENTS);
}

/**
 * Rendu d'une route `/appel/*` ou `/appels` rattachée à une unité RTC. Le
 * chemin est résolu vers sa fiche ; sans fiche correspondante, l'appelant
 * garde la main (aucun écran n'est inventé pour une route non livrée).
 */
export function RtcScreen({
  unitId,
  pathname,
  segments,
}: {
  unitId: string;
  pathname: string;
  segments: readonly string[];
}): ReactNode {
  const screen = resolveRtcScreen(pathname);
  if (!screen) return null;
  const Component = RTC_SCREEN_COMPONENTS[screen.code];
  if (!Component) return null;
  const props: RtcUnitProps = { unitId, pathname, segments, params: screen.params };
  return (
    <UnitBoundary unitId={unitId} screenCode={screen.code}>
      <Component {...props} />
    </UnitBoundary>
  );
}
