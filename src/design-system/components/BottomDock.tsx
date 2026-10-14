/**
 * C-20 BottomDock (Web) — dock de navigation basse, adapté à la famille.
 *
 * - EMP / PRE : verre 3 (GlassSurface), 5 entrées ;
 * - ADM : dock dédié en surface SOLIDE (« ADM sans verre décoratif », Master A.3) ;
 * - PUB, RTC, SYS : pas de dock (décidé par le shell).
 *
 * Indicateur actif : morphing (motion, courbe labeur-inout, 420 ms). L'état actif est
 * porté par aria-current="page", par la couleur ET par l'indicateur de forme (jamais la
 * couleur seule). Chaque entrée fait au moins 44 px.
 */

import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '../../routing/navigation';
import { dockMorphTransition, usePrefersReducedMotion } from '../motion';
import { GlassSurface } from './GlassSurface';
import { cx } from './cx';

export interface DockItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

/**
 * Entrée active : la plus longue route qui couvre le chemin courant
 * (`/client/missions/42` → « Missions », `/client` → « Accueil » seulement si rien de plus précis).
 */
export function resolveActiveDockItem<T extends { href: string }>(items: readonly T[], pathname: string): T | null {
  let best: T | null = null;
  for (const item of items) {
    const covers = pathname === item.href || pathname.startsWith(item.href + '/');
    if (covers && (best === null || item.href.length > best.href.length)) best = item;
  }
  return best;
}

export interface BottomDockProps {
  ariaLabel: string;
  items: readonly DockItem[];
  currentPath: string;
  variant?: 'glass' | 'solid';
}

export function BottomDock({ ariaLabel, items, currentPath, variant = 'glass' }: BottomDockProps): ReactNode {
  const reduced = usePrefersReducedMotion();
  const uid = useId();
  const activeId = resolveActiveDockItem(items, currentPath)?.id ?? null;

  const list = (
    <ul className="lbm-dock__list">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <li key={item.id} className="lbm-dock__cell">
            <Link
              href={item.href}
              className={cx('lbm-dock__item', active && 'lbm-dock__item--active')}
              aria-current={active ? 'page' : undefined}
              data-active={active ? 'true' : undefined}
            >
              {active && (
                <motion.span
                  layoutId={`${uid}-indicator`}
                  aria-hidden="true"
                  className="lbm-dock__indicator"
                  transition={dockMorphTransition(reduced)}
                />
              )}
              <Icon aria-hidden="true" focusable="false" strokeWidth={1.5} size={22} className="lbm-dock__icon" />
              <span className="lbm-dock__label">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  if (variant === 'solid') {
    return (
      <nav aria-label={ariaLabel} className="lbm-dock lbm-dock--solid" data-variant="solid">
        {list}
      </nav>
    );
  }
  return (
    <GlassSurface as="nav" level={3} elevation={3} aria-label={ariaLabel} className="lbm-dock" data-variant="glass">
      {list}
    </GlassSurface>
  );
}
