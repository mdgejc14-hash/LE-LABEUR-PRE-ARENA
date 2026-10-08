// TELEMETRY — LE LABEUR · budgets d'images, isolation GPU, preuve de 120 fps
// Aucun écran n'est validé sans ses mesures : la performance est un critère
// d'acceptation, pas une intention (Section 3.5 · Optimisation GPU).
// ────────────────────────────────────────────────────────────────────────────

export type Budget = {
  /** Budget en millisecondes de temps de frame (8,3 ms = 120 fps). */
  frameMs: number;
  /** Part maximale du temps de frame allouée au flou/verre. */
  glassMs: number;
  /** Nombre maximal de couches de flou simultanées à l'écran. */
  maxBlurLayers: number;
  /** Débit minimal des particules sur les appareils d'entrée de gamme. */
  particlesMinFps: number;
  /** Poids maximal du bundle pour un écran donné (Ko, gzip). */
  bundleKb: number;
};

export const BUDGETS: Record<string, Budget> = {
  // Écrans d'ouverture : le plus exigeant (particules 120 fps + sceau + verre).
  splash:        { frameMs: 8.3, glassMs: 1.4, maxBlurLayers: 2, particlesMinFps: 60, bundleKb: 140 },
  // Tableaux de bord : densité d'information, verre limité aux cartes visibles.
  dashboard:     { frameMs: 8.3, glassMs: 1.8, maxBlurLayers: 3, particlesMinFps: 40, bundleKb: 180 },
  // Registres et tables : pas de particules, virtualisation obligatoire.
  list:          { frameMs: 8.3, glassMs: 1.0, maxBlurLayers: 2, particlesMinFps: 0,  bundleKb: 160 },
  // Folios (contrats) : lecture longue, verre statique, pas d'animation continue.
  document:      { frameMs: 16.6, glassMs: 1.2, maxBlurLayers: 2, particlesMinFps: 0, bundleKb: 150 },
  // Appel WebRTC : la vidéo prime, le décor se retire.
  call:          { frameMs: 8.3, glassMs: 0.8, maxBlurLayers: 1, particlesMinFps: 0,  bundleKb: 200 },
  // Supervision (bureau) : le budget est plus large, la densité plus forte.
  admin:         { frameMs: 16.6, glassMs: 1.0, maxBlurLayers: 4, particlesMinFps: 0, bundleKb: 220 },
  // États système : sobriété radiographique — aucune animation continue.
  system:        { frameMs: 33.0, glassMs: 0.6, maxBlurLayers: 1, particlesMinFps: 0, bundleKb: 60 },
};

// ── Règles d'isolation matérielle (à appliquer sans exception) ─────────────
export const GPU_RULES = [
  "Isolation : tout élément animé (translate/scale/opacity) reste dans sa propre couche — jamais au-dessus d'un flou animé qui se recalcule.",
  "Le flou n'est jamais animé en continu : il est calculé une fois par changement d'état, puis composité. Un backdrop-filter animé toutes les frames est un interdit (INV-6).",
  "Rastérisation déportée : les surfaces de verre très composées (folio, sceau) sont rastérisées hors du thread UI (RasterIO iOS, RenderEffect Android) puis réutilisées tant que l'état ne change pas.",
  "Les particules tournent sur le GPU exclusivement, sans allocation par frame ; leur densité baisse sur batterie faible (< 20 %) et s'arrêtent en arrière-plan.",
  "Les longues listes sont virtualisées (FlashList / FlatList windowing) : jamais plus de 12 cartes montées simultanément, quelle que soit la longueur du registre.",
  "L'éclairage dynamique (accéléromètre) échantillonne à 30 Hz et n'anime qu'une transformation de gradient — jamais une re-rastérisation.",
  "Aucun blur de plus de 48 px de rayon (glass-4) hors écrans de célébration (acceptation, sceau final).",
  "Le mode « réduire les animations » (accessibilité) remplace tous les ressorts par des poses immédiates et gèle les particules : le budget doit rester ≤ 4 ms.",
];

// ── Sonde de mesure : mesurer en continu, alerter automatiquement ──────────
export type FrameSample = { t: number; ms: number };

export function createFrameProbe(screen: string, onViolation?: (info: { screen: string; p95: number; budget: number }) => void) {
  const budget = (BUDGETS[screen] ?? BUDGETS.dashboard).frameMs;
  const samples: FrameSample[] = [];
  let raf = 0;
  let last = performance.now();

  const tick = (now: number) => {
    const ms = now - last;
    last = now;
    samples.push({ t: now, ms });
    if (samples.length > 600) samples.shift();     // ~5 s à 120 fps

    // Alerte sur le p95 : plus robuste qu'une moyenne, insensible aux pics isolés.
    if (samples.length === 600) {
      const sorted = samples.map(s => s.ms).sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      if (p95 > budget) {
        onViolation?.({ screen, p95: +p95.toFixed(2), budget });
        // Un dépassement de budget est un DÉFAUT, pas une observation :
        // il ouvre une tâche de performance dans le même cycle de livraison.
        report("perf.budget.violation", { screen, p95, budget });
      }
      samples.length = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Report télémétrique : jamais de donnée personnelle, jamais de contenu. */
export function report(event: string, payload: Record<string, unknown> = {}) {
  const body = JSON.stringify({
    event,
    payload,
    screen: typeof payload.screen === "string" ? payload.screen : undefined,
    app: "le-labeur",
    at: new Date().toISOString(),
  });
  // sendBeacon : ne bloque jamais le thread, survit à la fermeture d'onglet.
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    navigator.sendBeacon("/v1/telemetry", body);
  }
}

// ── Garde-fou de développement : interdire les régressions visuelles ───────
export const DEV_ASSERTS = [
  "Une couche de flou supplémentaire sans retirer une autre → erreur de build.",
  "Un ressort non déclaré dans SPRINGS (stiffness/damping/mass hors barème) → erreur de lint.",
  "Une animation d'opacité dépassant 640 ms → avertissement, sauf célébration (1 200 ms max).",
  "Un écran sans mesure de frame en environnement de test → écran réputé non livrable.",
];
