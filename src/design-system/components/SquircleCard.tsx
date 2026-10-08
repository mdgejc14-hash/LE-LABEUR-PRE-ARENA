/**
 * C-02 SquircleCard (Web) — carte à coins superelliptiques (n = 4.2), élévation E1/E2.
 *
 * La forme exacte est tracée en SVG à partir de la taille mesurée (ResizeObserver).
 * Avant la mesure (premier rendu, rendu serveur), un border-radius de même rayon est
 * utilisé comme repli. Le rim-light suit le niveau d'élévation (tokens.py ELEVATION).
 * Le tracé SVG est décoratif (aria-hidden) ; le contenu reste dans le flux normal.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { ELEVATION, RADII } from '../generated/tokens';
import { SQUIRCLE_EXPONENT, squircleRectPath } from '../squircle';
import { cx } from './cx';

export type SquircleRadius = 14 | 22 | 28 | 34;
export type SquircleTone = 'rest' | 'active';

export interface SquircleCardProps extends HTMLAttributes<HTMLElement> {
  radius?: SquircleRadius;
  elevation?: 1 | 2 | 3 | 4;
  tone?: SquircleTone;
  as?: 'div' | 'section' | 'article';
  children?: ReactNode;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

function useElementSize(ref: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) =>
        previous && previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Rayon CSS (px) du token squircle correspondant, ou le rayon demandé si absent. */
function radiusPx(radius: SquircleRadius): number {
  const token = RADII.find((r) => r.kind === 'squircle' && r.px === radius);
  return token ? token.px : radius;
}

export function SquircleCard({
  radius = 22,
  elevation = 1,
  tone = 'rest',
  as: Tag = 'div',
  className,
  style,
  children,
  ...rest
}: SquircleCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const size = useElementSize(ref);
  const elevationToken = ELEVATION[elevation];
  const rimAlpha = elevationToken.rimAlpha ?? 0;
  const shape = size && size.width > 0 && size.height > 0 ? squircleRectPath(size.width, size.height, radiusPx(radius)) : null;
  const css = {
    borderRadius: radiusPx(radius),
    '--rim-alpha': rimAlpha,
    ...(elevationToken.shadow ? { '--sq-shadow': elevationToken.shadow } : {}),
    ...style,
  } as CSSProperties;

  return (
    <Tag
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      className={cx('lbm-squircle', shape && 'lbm-squircle--shaped', `lbm-squircle--${tone}`, className)}
      data-shape="squircle"
      data-radius={radius}
      data-exponent={SQUIRCLE_EXPONENT}
      data-elevation={elevation}
      style={css}
    >
      {shape && size && (
        <svg
          className="lbm-squircle__shape"
          aria-hidden="true"
          focusable="false"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          <path d={shape} className="lbm-squircle__fill" />
        </svg>
      )}
      <div className="lbm-squircle__content">{children}</div>
    </Tag>
  );
}
