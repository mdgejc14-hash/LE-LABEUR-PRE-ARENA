/**
 * C-15 ParticleCanvas (Web) — champ particulaire décoratif des écrans PUB.
 *
 * Fiches PUB-01 (« poussière d'or en dérive brownienne, densité 120, alpha 0.10,
 * mix-mode screen ») et PUB-02 (« champ montant lent, 90 particules ») : le champ
 * est ici un canvas 2D déterministe, sans WebGL et sans capteur.
 *
 * Invariants :
 *  - DÉCORATIF : `aria-hidden`, hors flux, jamais cliquable — aucune information
 *    de l'écran ne dépend de lui ;
 *  - prefers-reduced-motion : une SEULE image fixe est peinte (aucune boucle de
 *    rendu), à la densité et à l'alpha réduits demandés par la fiche PUB-01 ;
 *  - l'animation s'arrête au démontage ET quand l'onglet passe en arrière-plan
 *    (aucune boucle qui tourne dans le vide) ;
 *  - dispositif sans canvas 2D (rendu serveur, tests) : rien n'est dessiné et
 *    l'écran reste complet ;
 *  - les couleurs viennent des tokens (or 500), jamais d'une valeur brute.
 */

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../motion';
import { cx } from './cx';

export interface ParticleCanvasProps {
  /** Nombre de particules (fiches : 120 pour PUB-01, 90 pour PUB-02). */
  density: number;
  /** Opacité de base (fiche PUB-01 : 0.10) ; jamais au-delà de 0.20 (Master). */
  alpha?: number;
  /** Dérive lente (splash) ou montée lente (accueil). */
  direction?: 'drift' | 'rise';
  className?: string;
}

/** Générateur déterministe : deux rendus de la même page montrent le même champ. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const MAX_ALPHA = 0.2;
const STATIC_ALPHA_FACTOR = 0.6;
const MAX_DEVICE_PIXEL_RATIO = 2;

export function ParticleCanvas({ density, alpha = 0.1, direction = 'drift', className }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    // Sans token disponible (canvas détaché), rien n'est peint : jamais une couleur inventée.
    const gold = window.getComputedStyle(canvas).getPropertyValue('--gold-500').trim();
    if (!gold) return;

    const fieldAlpha = Math.min(MAX_ALPHA, Math.max(0, alpha)) * (reduced ? STATIC_ALPHA_FACTOR : 1);
    const random = seededRandom(direction === 'rise' ? 0x5eed : 0x9e11);
    const count = Math.max(1, Math.min(240, Math.round(density)));
    const particles = Array.from({ length: count }, () => ({
      x: random(),
      y: random(),
      radius: 0.6 + random() * 1.6,
      speed: 0.02 + random() * 0.06,
      phase: random() * Math.PI * 2,
    }));

    const resize = () => {
      const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, Math.max(1, window.devicePixelRatio || 1));
      const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
      const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 0;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const paint = (elapsedMs: number) => {
      const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
      const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 0;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'screen';
      context.fillStyle = gold;
      for (const particle of particles) {
        const travel = direction === 'rise'
          ? ((particle.y - particle.speed * elapsedMs * 0.001) % 1 + 1) % 1
          : particle.y;
        const x = direction === 'drift'
          ? (particle.x + 0.01 * Math.sin(particle.phase + elapsedMs * 0.00012)) % 1
          : particle.x;
        context.globalAlpha = fieldAlpha * (0.5 + 0.5 * Math.sin(particle.phase + elapsedMs * 0.0006));
        context.beginPath();
        context.arc(x * width, travel * height, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    };

    resize();
    if (reduced || typeof window.requestAnimationFrame !== 'function') {
      paint(0);
      return;
    }

    let frame = 0;
    let start = 0;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      paint(timestamp - start);
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);

    const onVisibility = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      if (!frame) {
        start = 0;
        frame = window.requestAnimationFrame(step);
      }
    };

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [density, alpha, direction, reduced]);

  return <canvas ref={canvasRef} className={cx('lbm-particle', className)} aria-hidden="true" data-direction={direction} />;
}
