/**
 * C-01 GlassSurface (Web) — surface de verre des niveaux 1 à 4.
 *
 * Passes (dans l'ordre du Master) : flou saturé (backdrop-filter) → rim-light (arête haute)
 * → grain (bruit fractal, 3 %, décoratif) → contenu. Repli opaque (--surface-2 + grain)
 * si le verre profond dépasse le budget, si l'appareil a moins de 4 Go de RAM, ou si le
 * navigateur ignore backdrop-filter (@supports dans master.css).
 *
 * Les effets décoratifs (grain, rim) sont aria-hidden. Aucun flou n'est animé.
 */

import { useEffect, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { ELEVATION } from '../generated/tokens';
import { deepGlassBudget, isLowMemoryDevice, resolveGlassMode } from '../glass';
import { isDeepGlass, type ElevationLevel, type GlassLevel } from '../tokens';
import { cx } from './cx';

export type GlassTag = 'div' | 'section' | 'nav' | 'header' | 'footer' | 'aside';

export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  level?: GlassLevel;
  as?: GlassTag;
  elevation?: ElevationLevel;
  rim?: boolean;
  grain?: boolean;
  children?: ReactNode;
}

export function GlassSurface({
  level = 2,
  as: Tag = 'div',
  elevation = 1,
  rim = true,
  grain = true,
  className,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const id = useId();
  const deep = isDeepGlass(level);
  const lowMemory = isLowMemoryDevice();
  const needsSlot = deep && !lowMemory;

  // Un verre profond n'obtient un emplacement du budget (≤ 2 par écran) qu'à condition d'être monté
  // dans le navigateur : le rendu serveur ne réserve rien (aucun effet ne le libérerait).
  const [deepGranted, setDeepGranted] = useState<boolean>(() =>
    needsSlot && typeof window !== 'undefined' ? deepGlassBudget.acquire(id) : true,
  );
  useEffect(() => {
    if (!needsSlot) return undefined;
    setDeepGranted(deepGlassBudget.acquire(id));
    return () => deepGlassBudget.release(id);
  }, [needsSlot, id]);

  const mode = resolveGlassMode({ level, deepGranted, lowMemory });
  const elevationToken = ELEVATION[elevation];
  const rimAlpha = elevationToken.rimAlpha ?? 0;

  return (
    <Tag
      {...rest}
      className={cx('lbm-glass', `lbm-glass--l${level}`, mode !== 'native' && 'lbm-glass--opaque', `lbm-elev-${elevation}`, className)}
      data-glass-level={level}
      data-glass-mode={mode}
      data-elevation={elevation}
      style={{ '--rim-alpha': rimAlpha, ...style } as CSSProperties}
    >
      {grain && <span className="lbm-grain" aria-hidden="true" />}
      {rim && rimAlpha > 0 && <span className="lbm-rim" aria-hidden="true" />}
      {children}
    </Tag>
  );
}
