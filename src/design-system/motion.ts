/**
 * LE LABEUR — Mouvement Web (P0-DESIGN-FOUNDATION).
 *
 * Les quatre ressorts officiels (snap, soft, heavy, pop) sont lus dans les tokens
 * générés et appliqués via motion@12 (déjà présent dans le projet). Aucune
 * bibliothèque d'animation n'est recréée ici.
 *
 * Règle du Master : prefers-reduced-motion → springs remplacés par un fondu de
 * 120 ms (durée « micro »), halos figés à 40 % d'opacité (voir master.css).
 */

import { useSyncExternalStore } from 'react';
import type { Transition } from 'motion/react';
import { DURATIONS_MS, EASINGS, SPRINGS } from './generated/tokens';

export type SpringName = 'snap' | 'soft' | 'heavy' | 'pop';
export const SPRING_NAMES: readonly SpringName[] = ['snap', 'soft', 'heavy', 'pop'];

type Bezier = [number, number, number, number];

function springToken(name: SpringName) {
  const token = SPRINGS.find((s) => s.name === name);
  if (!token) throw new Error(`ressort absent des tokens : ${name}`);
  return token;
}

function easingToken(cssVar: string): Bezier {
  const token = EASINGS.find((e) => e.cssVar === cssVar);
  if (!token) throw new Error(`courbe absente des tokens : ${cssVar}`);
  const [a, b, c, d] = token.bezier;
  return [a, b, c, d];
}

/** Transition ressort (physique stiffness / damping / mass du Master). */
export function springTransition(name: SpringName): Transition {
  const s = springToken(name);
  return { type: 'spring', stiffness: s.stiffness, damping: s.damping, mass: s.mass };
}

/** Remplacement reduced-motion : fondu 120 ms (durée « micro », courbe labeur-out). */
export function reducedFadeTransition(): Transition {
  return { duration: DURATIONS_MS.micro / 1000, ease: easingToken('--ease-labeur-out') };
}

/** Transition selon la préférence utilisateur : ressort, ou fondu 120 ms si réduction demandée. */
export function transitionFor(name: SpringName, reduced: boolean): Transition {
  return reduced ? reducedFadeTransition() : springTransition(name);
}

/** Morphing du dock (indicateur actif) : durée « page » 420 ms, courbe labeur-inout. */
export function dockMorphTransition(reduced: boolean): Transition {
  if (reduced) return reducedFadeTransition();
  return { duration: DURATIONS_MS.page / 1000, ease: easingToken('--ease-labeur-inout') };
}

/* ───────────────────────── Préférence de réduction de mouvement ───────────────────────── */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

export function prefersReducedMotionNow(): boolean {
  return hasMatchMedia() && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Hook React : vrai si l'utilisateur demande une réduction de mouvement. Faux côté serveur. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotionNow, () => false);
}
