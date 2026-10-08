/**
 * LE LABEUR — Politique du verre Web (P0-DESIGN-FOUNDATION).
 *
 * Règles du Master (tokens.py, PERF) :
 *  - blur > 24 px limité à 2 surfaces simultanées par écran (coût raster) ;
 *  - backdrop-filter désactivé sur appareils < 4 Go de RAM : repli sur verre opaque
 *    --surface-2 + grain ;
 *  - jamais de flou animé.
 *
 * Ce module ne fait que décider du mode de rendu ; le rendu est dans components/GlassSurface.tsx.
 */

import { PERF } from './generated/tokens';
import { isDeepGlass, type GlassLevel } from './tokens';

export type GlassMode = 'native' | 'opaque-budget' | 'opaque-lowmem';

export interface DeepGlassBudget {
  readonly max: number;
  readonly held: number;
  /** Réserve un emplacement pour `id`. Idempotent : vrai si `id` détient déjà un emplacement. */
  acquire(id: string): boolean;
  release(id: string): void;
  has(id: string): boolean;
}

export function createDeepGlassBudget(max: number): DeepGlassBudget {
  const held = new Set<string>();
  return {
    max,
    get held() {
      return held.size;
    },
    acquire(id: string) {
      if (held.has(id)) return true;
      if (held.size >= max) return false;
      held.add(id);
      return true;
    },
    release(id: string) {
      held.delete(id);
    },
    has(id: string) {
      return held.has(id);
    },
  };
}

/** Budget global de l'application : au plus `PERF.deepSurfacesMax` surfaces profondes simultanées. */
export const deepGlassBudget: DeepGlassBudget = createDeepGlassBudget(PERF.deepSurfacesMax);

/** Sous-ensemble de Navigator utilisé : deviceMemory n'est pas typé dans la lib DOM. */
export interface NavigatorMemoryLike {
  readonly deviceMemory?: number;
}

/** Appareil à faible mémoire : navigator.deviceMemory < 4 Go (API non disponible → faux). */
export function isLowMemoryDevice(
  nav: NavigatorMemoryLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as NavigatorMemoryLike),
): boolean {
  const memory = nav?.deviceMemory;
  return typeof memory === 'number' && memory < PERF.lowMemoryRamGb;
}

export function resolveGlassMode(input: { level: GlassLevel; deepGranted: boolean; lowMemory: boolean }): GlassMode {
  if (input.lowMemory) return 'opaque-lowmem';
  if (isDeepGlass(input.level) && !input.deepGranted) return 'opaque-budget';
  return 'native';
}
