/**
 * C-04 StatusSeal (Web) — sceau de statut : anneau conique + glyphe + libellé.
 *
 * Invariant de vérité d'état (Master, A11Y) : le statut n'est JAMAIS porté par la couleur
 * seule. Le libellé est toujours rendu (texte visible) ; le glyphe et l'anneau sont décoratifs.
 * Tons : or, émeraude, ambre, clay (Master) ; violet, cyan, ardoise (fiches SYS).
 * Le halo n'est animé que si `pulse` est demandé (un seul halo animé par écran, Master) ;
 * il est figé à 40 % sous prefers-reduced-motion (master.css).
 */

import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';

export type SealTone = 'gold' | 'emerald' | 'amber' | 'clay' | 'violet' | 'cyan' | 'slate';

const TONE_TOKEN: Record<SealTone, string> = {
  gold: '--gold-500',
  emerald: '--emerald-500',
  amber: '--amber-500',
  clay: '--clay-500',
  violet: '--violet-500',
  cyan: '--cyan-500',
  slate: '--slate-500',
};

export interface StatusSealProps {
  tone: SealTone;
  label: string;
  /** Glyphe (icône) ; à défaut, un point géométrique. Toujours décoratif. */
  glyph?: ReactNode;
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

function DefaultGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function StatusSeal({ tone, label, glyph, size = 'md', pulse = false, className }: StatusSealProps) {
  const style = { '--seal-color': `var(${TONE_TOKEN[tone]})` } as CSSProperties;
  return (
    <span className={cx('lbm-seal', `lbm-seal--${size}`, pulse && 'lbm-seal--pulse', className)} data-tone={tone} style={style}>
      <span className="lbm-seal__mark" aria-hidden="true">
        <span className="lbm-seal__ring" />
        {pulse && <span className="lbm-seal__halo" />}
        <span className="lbm-seal__glyph">{glyph ?? <DefaultGlyph />}</span>
      </span>
      <span className="lbm-seal__label">{label}</span>
    </span>
  );
}
