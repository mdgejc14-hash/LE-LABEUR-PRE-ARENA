/**
 * LE LABEUR — Squircle Web (C-02 SquircleCard), P0-DESIGN-FOUNDATION.
 *
 * Forme : pour chaque coin de rayon r, la superellipse |x/a|^n + |y/b|^n = 1 avec
 * n = 4.2 (exposant du Master, tokens.py MATERIALS.squircle). Chaque coin est
 * centré sur (r, r) ; le paramétrage est exact :
 *   X = sin(t)^(2/n), Y = cos(t)^(2/n), t ∈ [0, π/2]  ⇒  X^n + Y^n = sin²t + cos²t = 1.
 *
 * Ce module ne dépend d'aucune bibliothèque. Il ne réutilise pas design/code/squircle.ts,
 * qui trace une superellipse PLEINE (non un rectangle à coins superelliptiques).
 */

import { MATERIALS } from './generated/tokens';

export const SQUIRCLE_EXPONENT: number = MATERIALS.squircle.exponent;

/**
 * Chemin SVG (d) d'un rectangle `width` × `height` aux coins superelliptiques de rayon
 * `radius` (borné à la moitié du plus petit côté). Sens horaire, fermé.
 */
export function squircleRectPath(
  width: number,
  height: number,
  radius: number,
  exponent: number = SQUIRCLE_EXPONENT,
  segments = 16,
): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const p = 2 / exponent;
  const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
  const point = (x: number, y: number) => `L${fmt(x)} ${fmt(y)}`;
  const parts: string[] = [`M${fmt(r)} 0`, point(w - r, 0)];

  // Coin haut-droit : de (w-r, 0) à (w, r)
  for (let i = 1; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    parts.push(point(w - r + r * Math.pow(Math.sin(t), p), r - r * Math.pow(Math.cos(t), p)));
  }
  parts.push(point(w, h - r));
  // Coin bas-droit : de (w, h-r) à (w-r, h)
  for (let i = 1; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    parts.push(point(w - r + r * Math.pow(Math.cos(t), p), h - r + r * Math.pow(Math.sin(t), p)));
  }
  parts.push(point(r, h));
  // Coin bas-gauche : de (r, h) à (0, h-r)
  for (let i = 1; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    parts.push(point(r - r * Math.pow(Math.sin(t), p), h - r + r * Math.pow(Math.cos(t), p)));
  }
  parts.push(point(0, r));
  // Coin haut-gauche : de (0, r) à (r, 0)
  for (let i = 1; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    parts.push(point(r - r * Math.pow(Math.cos(t), p), r - r * Math.pow(Math.sin(t), p)));
  }
  return parts.join(' ') + ' Z';
}
