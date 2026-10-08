/**
 * Les six shells du Master (P0-DESIGN-FOUNDATION) : PUBLIC, CLIENT, PRESTATAIRE, ADMIN, RTC, SYSTEM.
 * Chaque shell ne porte que le chrome et la coque de page : aucun contenu métier.
 */

import type { ReactNode } from 'react';
import { ShellFrame, appbarTitleFor, verifiedDockItems, type ShellId } from './ShellFrame';

export interface ShellProps {
  currentPath: string;
  children: ReactNode;
}

/** PUB — chrome minimal (glyphe seul), pas de dock. */
export function PublicShell({ currentPath, children }: ShellProps) {
  return (
    <ShellFrame shell="PUBLIC" family="PUB" currentPath={currentPath} appbarTitle={appbarTitleFor('PUB')} dock={null}>
      {children}
    </ShellFrame>
  );
}

/** EMP — appbar LE LABEUR + dock client (verre 3). */
export function ClientShell({ currentPath, children }: ShellProps) {
  return (
    <ShellFrame
      shell="CLIENT"
      family="EMP"
      currentPath={currentPath}
      appbarTitle={appbarTitleFor('EMP')}
      dock={{ ariaLabel: 'Navigation client', items: verifiedDockItems('EMP'), variant: 'glass' }}
    >
      {children}
    </ShellFrame>
  );
}

/** PRE — appbar LE LABEUR + dock prestataire (verre 3). */
export function PrestataireShell({ currentPath, children }: ShellProps) {
  return (
    <ShellFrame
      shell="PRESTATAIRE"
      family="PRE"
      currentPath={currentPath}
      appbarTitle={appbarTitleFor('PRE')}
      dock={{ ariaLabel: 'Navigation prestataire', items: verifiedDockItems('PRE'), variant: 'glass' }}
    >
      {children}
    </ShellFrame>
  );
}

/** ADM — appbar SUPERVISION + dock dédié en surface solide (pas de verre décoratif). */
export function AdminShell({ currentPath, children }: ShellProps) {
  return (
    <ShellFrame
      shell="ADMIN"
      family="ADM"
      currentPath={currentPath}
      appbarTitle={appbarTitleFor('ADM')}
      dock={{ ariaLabel: 'Navigation supervision', items: verifiedDockItems('ADM'), variant: 'solid' }}
    >
      {children}
    </ShellFrame>
  );
}

/** RTC — appbar SESSION, sans dock (la surface d'appel C-16 n'est pas implémentée ici). */
export function RtcShell({ currentPath, children }: ShellProps) {
  return (
    <ShellFrame shell="RTC" family="RTC" currentPath={currentPath} appbarTitle={appbarTitleFor('RTC')} dock={null}>
      {children}
    </ShellFrame>
  );
}

/** SYS — chrome minimal ; le contenu est un StateGuard (C-19). */
export function SystemShell({ currentPath, children }: ShellProps) {
  return (
    <ShellFrame shell="SYSTEM" family="SYS" currentPath={currentPath} appbarTitle={appbarTitleFor('SYS')} dock={null}>
      {children}
    </ShellFrame>
  );
}

export const SHELL_COMPONENTS: Record<ShellId, (props: ShellProps) => ReactNode> = {
  PUBLIC: PublicShell,
  CLIENT: ClientShell,
  PRESTATAIRE: PrestataireShell,
  ADMIN: AdminShell,
  RTC: RtcShell,
  SYSTEM: SystemShell,
};
