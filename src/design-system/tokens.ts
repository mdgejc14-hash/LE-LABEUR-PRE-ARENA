/**
 * LE LABEUR — Accès typé aux tokens Master (P0-DESIGN-FOUNDATION).
 *
 * Source : design/llab/tokens.py, via les modules GÉNÉRÉS de ./generated/.
 * Ce module ne contient AUCUNE valeur de design : il expose des règles dérivées
 * (grille par viewport, verre profond, contraste WCAG) et les seuils provisoires
 * explicitement signalés comme NON DÉFINIS dans la source.
 */

import { A11Y, GLASS_LEVELS, PERF, SPACING } from './generated/tokens';

export type GlassLevel = 1 | 2 | 3 | 4;
export type ElevationLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Seuils de bascule de grille.
 * NON DÉFINIS dans design/llab/tokens.py (la source donne trois grilles, sans seuil).
 * Valeurs PROVISOIRES de la fondation, alignées sur les seuils par défaut de Tailwind
 * (md = 768 px, lg = 1024 px) déjà présents dans le projet. À arbitrer par le design.
 */
export const BREAKPOINTS_STATUS = 'PROVISOIRE — NON DÉFINI dans tokens.py' as const;
export const PROVISIONAL_BREAKPOINTS_PX = { tablet: 768, desktop: 1024 } as const;

export type GridBreakpoint = 'mobile' | 'tablet' | 'desktop';

export interface GridSpec {
  readonly breakpoint: GridBreakpoint;
  readonly columns: number;
  readonly gutterPx: number;
  readonly marginPx: number;
  /** Largeur max du conteneur : définie seulement pour le desktop (1180 px). */
  readonly maxWidthPx: number | null;
}

/** Grille applicable à une largeur de viewport, selon les trois grilles du Master. */
export function gridForViewport(widthPx: number): GridSpec {
  const grid = SPACING.grid;
  if (widthPx >= PROVISIONAL_BREAKPOINTS_PX.desktop) {
    return {
      breakpoint: 'desktop',
      columns: grid.desktop.columns,
      gutterPx: grid.desktop.gutterPx,
      marginPx: grid.desktop.marginPx,
      maxWidthPx: grid.desktop.maxWidthPx,
    };
  }
  if (widthPx >= PROVISIONAL_BREAKPOINTS_PX.tablet) {
    return {
      breakpoint: 'tablet',
      columns: grid.tablet.columns,
      gutterPx: grid.tablet.gutterPx,
      marginPx: grid.tablet.marginPx,
      maxWidthPx: null,
    };
  }
  return {
    breakpoint: 'mobile',
    columns: grid.mobile.columns,
    gutterPx: grid.mobile.gutterPx,
    marginPx: grid.mobile.marginPx,
    maxWidthPx: null,
  };
}

/** Taille minimale d'une cible tactile selon la grille (≥ 44 px mobile, ≥ 40 px desktop). */
export function touchTargetMinPx(breakpoint: GridBreakpoint): number {
  return breakpoint === 'desktop' ? A11Y.touchTargetDesktopPx : A11Y.touchTargetMobilePx;
}

/** Un niveau de verre est « profond » s'il dépasse le seuil de flou (> 24 px). */
export function isDeepGlass(level: GlassLevel): boolean {
  return GLASS_LEVELS[level].blurPx > PERF.deepBlurThresholdPx;
}

/* ───────────────────────── Contraste WCAG 2.x (vérification des affirmations de tokens.py) ───────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`couleur hexadécimale attendue : ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Luminance relative (WCAG 2.x) d'une couleur #RRGGBB. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs #RRGGBB (1 → 21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
