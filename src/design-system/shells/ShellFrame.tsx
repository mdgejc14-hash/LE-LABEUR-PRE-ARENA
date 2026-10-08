/**
 * Cadre commun des shells (P0-DESIGN-FOUNDATION).
 *
 * Chrome du Master :
 *  - EMP / PRE : appbar + dock 5 entrées ;
 *  - ADM       : appbar SUPERVISION + dock dédié (surface solide) ;
 *  - PUB       : chrome minimal (glyphe seul, pas de dock) ;
 *  - RTC       : appbar SESSION, pas de dock ;
 *  - SYS       : glyphe seul ; le contenu est un StateGuard.
 *
 * Accessibilité : lien d'évitement vers le contenu, repères <header> / <main> / <nav>,
 * focus déplacé sur <main> à chaque changement de page (géré par ShellRoute).
 */

import type { ReactNode } from 'react';
import { BottomDock, type DockItem } from '../components/BottomDock';
import { cx } from '../components/cx';
import { chromeFor, dockItemsFor, type FamilyCode } from './shellNavigation';

export type ShellId = 'PUBLIC' | 'CLIENT' | 'PRESTATAIRE' | 'ADMIN' | 'RTC' | 'SYSTEM';

export interface ShellFrameProps {
  shell: ShellId;
  family: FamilyCode;
  currentPath: string;
  /** Appbar (EMP, PRE, ADM, RTC) ou chrome minimal (PUB, SYS) si `null`. */
  appbarTitle: string | null;
  dock?: { ariaLabel: string; items: readonly DockItem[]; variant: 'glass' | 'solid' } | null;
  children: ReactNode;
}

export function ShellFrame({ shell, family, currentPath, appbarTitle, dock, children }: ShellFrameProps) {
  const glyph = chromeFor(family).glyph;
  return (
    <div
      className={cx('lbm-theme', 'lbm-shell', `lbm-shell--${shell.toLowerCase()}`)}
      data-shell={shell}
      data-family={family}
    >
      <a className="lbm-skip-link" href="#lbm-main">
        Aller au contenu
      </a>
      {appbarTitle !== null ? (
        <header className="lbm-appbar">
          <span className="lbm-appbar__glyph" aria-hidden="true">
            {glyph}
          </span>
          <span className="lbm-appbar__title">{appbarTitle}</span>
        </header>
      ) : (
        <header className="lbm-chrome-minimal">
          <span className="lbm-chrome-minimal__glyph" aria-hidden="true">
            {glyph}
          </span>
          <span className="lbm-sr-only">LE LABEUR</span>
        </header>
      )}
      <main id="lbm-main" tabIndex={-1} className="lbm-main">
        {children}
      </main>
      {dock && <BottomDock ariaLabel={dock.ariaLabel} items={dock.items} currentPath={currentPath} variant={dock.variant} />}
    </div>
  );
}

/** Dock d'une famille, vérifié contre le chrome généré (les libellés doivent être ceux de la source). */
export function verifiedDockItems(family: 'EMP' | 'PRE' | 'ADM'): readonly DockItem[] {
  const items = dockItemsFor(family);
  const expected = chromeFor(family).dock ?? [];
  const labels = items.map((item) => item.label);
  if (labels.length !== expected.length || labels.some((label, index) => label !== expected[index])) {
    throw new Error(`dock ${family} désynchronisé du chrome généré : ${labels.join(' / ')} ≠ ${expected.join(' / ')}`);
  }
  return items;
}

export function appbarTitleFor(family: FamilyCode): string | null {
  return chromeFor(family).appbar ?? null;
}
