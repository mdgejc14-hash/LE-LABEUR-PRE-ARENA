/**
 * Tests de la fondation Design (P0-DESIGN-FOUNDATION) : tokens, composants, shells, StateGuard,
 * responsive 360 / 1440 px, réduction de mouvement, accessibilité statique.
 *
 * Exécutés par scripts/run-tests.ts (convention du dépôt : runXTests → {name, success, detail}).
 * Les valeurs sont comparées à la SOURCE (design/llab/*.py) via un dump Python indépendant du générateur.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

import { A11Y, ELEVATION, GLASS_LEVELS, MATERIALS, PALETTE, PERF, RADII, SPRINGS, SPACING, TYPE_SCALE } from './generated/tokens';
import { STATE_GUARD_CATALOG, STATE_GUARD_KEYS } from './generated/stateGuardCatalog';
import { CHROME_BY_FAMILY } from './generated/chrome';
import { PRODUCTION_UNITS, TOTAL_UNITS, UNIT_COUNTS_BY_FAMILY } from './generated/productionUnits';
import { contrastRatio, gridForViewport, isDeepGlass, touchTargetMinPx } from './tokens';
import { createDeepGlassBudget, isLowMemoryDevice, resolveGlassMode } from './glass';
import { sanitizeCorrelationId } from './correlation';
import { squircleRectPath } from './squircle';
import { dockMorphTransition, springTransition, transitionFor } from './motion';
import { BottomDock, resolveActiveDockItem } from './components/BottomDock';
import { GlassSurface } from './components/GlassSurface';
import { NeoPressButton } from './components/NeoPressButton';
import { SquircleCard } from './components/SquircleCard';
import { StateGuard } from './components/StateGuard';
import { StatusSeal } from './components/StatusSeal';
import { ClientShell, AdminShell, PrestataireShell, PublicShell, RtcShell, SystemShell } from './shells/shells';
import { dockItemsFor } from './shells/shellNavigation';
import { FoundationIndexPage, FoundationPublicPage } from './demo/FoundationPages';

export interface DesignFoundationTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} : attendu ${e}, obtenu ${a}`);
}

/** Dump Python INDÉPENDANT du générateur : valeurs brutes de tokens.py et sys.py. */
interface RawSource {
  palette: Record<string, string>;
  springs: Record<string, string>;
  sysTitles: Record<string, string>;
  sysCtaNotes: Record<string, string>;
  sysHeroNotes: Record<string, string>;
  sysMediaNotes: Record<string, string>;
  familyCounts: Record<string, number>;
}

function dumpRawSource(): RawSource {
  const code = [
    'import json, sys',
    'sys.dont_write_bytecode = True',
    'sys.path.insert(0, "design")',
    'from llab import tokens as T',
    'from llab.content import sys as S',
    'from llab.content import load_all',
    'palette = {}',
    'for group, rows in T.PALETTE.items():',
    '    for name, value, _ in rows:',
    '        palette[name] = value',
    'springs = {name: params for (name, params, _, _) in T.MOTION["springs"]}',
    'titles = {s.route: s.title for s in S.SCREENS}',
    'cta = {s.route: next((z.note for z in s.zones if z.kind == "cta"), "") for s in S.SCREENS}',
    'hero = {s.route: next((z.note for z in s.zones if z.kind == "hero"), "") for s in S.SCREENS}',
    'media = {s.route: next((z.note for z in s.zones if z.kind == "media"), "") for s in S.SCREENS}',
    'fams = {k: len(v) for k, v in load_all().items()}',
    'print(json.dumps({"palette": palette, "springs": springs, "sysTitles": titles, "sysCtaNotes": cta,',
    '  "sysHeroNotes": hero, "sysMediaNotes": media, "familyCounts": fams}, ensure_ascii=False))',
  ].join('\n');
  const output = execFileSync('python3', ['-B', '-c', code], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  return JSON.parse(output) as RawSource;
}

function parseSpring(params: string): { stiffness: number; damping: number; mass: number } {
  const m = /stiffness\s+(\d+)\s*·\s*damping\s+(\d+)\s*·\s*mass\s+(\d+(?:\.\d+)?)/.exec(params);
  assert(m, `ressort non reconnu : ${params}`);
  return { stiffness: Number(m[1]), damping: Number(m[2]), mass: Number(m[3]) };
}

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

/** Échappement HTML identique à React (texte rendu). */
function htmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

export function runDesignFoundationTests(): DesignFoundationTestResult[] {
  const results: DesignFoundationTestResult[] = [];
  const check = (name: string, test: () => string | void) => {
    try {
      const detail = test();
      results.push({ name, success: true, detail: typeof detail === 'string' ? detail : 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  let raw: RawSource | null = null;
  const source = () => {
    raw ??= dumpRawSource();
    return raw;
  };

  /* ───────────── 1. Génération et parité avec la source ───────────── */

  check('tokens : fichiers générés à jour (scripts/design/generate-frontend-tokens.py --check)', () => {
    const out = execFileSync('python3', ['-B', 'scripts/design/generate-frontend-tokens.py', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert(out.startsWith('OK'), out.trim());
    return out.trim();
  });

  check('tokens : chaque couleur de la palette = valeur brute de tokens.py', () => {
    const { palette } = source();
    let count = 0;
    for (const group of PALETTE) {
      for (const row of group.rows) {
        assertEqual(row.value, palette[row.cssVar], `valeur ${row.cssVar}`);
        count += 1;
      }
    }
    assertEqual(count, 32, 'lignes de palette hors verre');
    return `${count} couleurs / dégradés comparés (verre exclu)`;
  });

  check('tokens : quatre ressorts (snap, soft, heavy, pop) = paramètres de tokens.py', () => {
    const { springs } = source();
    const names = SPRINGS.map((s) => s.name);
    assertEqual(names, ['snap', 'soft', 'heavy', 'pop'], 'noms des ressorts');
    for (const spring of SPRINGS) {
      const expected = parseSpring(springs[spring.name]);
      assertEqual({ stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass }, expected, `ressort ${spring.name}`);
    }
    return 'snap 300/20/1.0 · soft 240/26/1.0 · heavy 180/28/1.2 · pop 420/16/0.9';
  });

  check('tokens : verre 1→4 (teinte, flou, saturation) = tokens.py', () => {
    const expected = [
      [1, 0.04, 12, 140],
      [2, 0.07, 20, 160],
      [3, 0.1, 32, 180],
      [4, 0.16, 48, 200],
    ] as const;
    for (const [level, alpha, blur, saturate] of expected) {
      const g = GLASS_LEVELS[level];
      assertEqual([g.alpha, g.blurPx, g.saturatePct], [alpha, blur, saturate], `verre ${level}`);
    }
    return 'verre 1 (12 px, 140 %) → verre 4 (48 px, 200 %)';
  });

  check('tokens : échelle typographique (taille / graisse / interligne) = tokens.py', () => {
    const expected: Record<string, [number, number, number]> = {
      display1: [48, 700, 52], display2: [40, 700, 46], title1: [28, 600, 34], title2: [22, 600, 28],
      title3: [18, 600, 24], headline: [18, 500, 26], body: [16, 400, 24], callout: [15, 500, 22],
      caption: [13, 500, 18], micro: [11, 600, 14], caps: [11, 700, 14], price: [34, 700, 38],
    };
    for (const row of TYPE_SCALE) {
      assertEqual([row.sizePx, row.weight, row.lineHeightPx], expected[row.key], `échelle ${row.key}`);
    }
    assertEqual(TYPE_SCALE.length, 12, 'nombre de niveaux typographiques');
    return '12 niveaux';
  });

  check('tokens : grille, rayons, squircles, élévations, durées = tokens.py', () => {
    assertEqual(SPACING.grid.mobile, { columns: 4, gutterPx: 16, marginPx: 20 }, 'grille mobile');
    assertEqual(SPACING.grid.tablet, { columns: 8, gutterPx: 20, marginPx: 32 }, 'grille tablette');
    assertEqual(SPACING.grid.desktop, { columns: 12, gutterPx: 24, marginPx: 40, maxWidthPx: 1180 }, 'grille desktop');
    assertEqual(RADII.filter((r) => r.kind === 'squircle').map((r) => r.px), [14, 22, 28, 34], 'squircles');
    assertEqual(ELEVATION.filter((e) => e.shadow).map((e) => e.rimAlpha), [0.06, 0.1, 0.14, 0.18], 'rim par élévation');
    assertEqual(MATERIALS.squircle.exponent, 4.2, 'exposant squircle');
    return 'grille 4/8/12 colonnes · squircle n = 4.2';
  });

  check('polices : sept fichiers du Master présents et chargés localement (design/assets/fonts)', () => {
    const files = ['SpaceGrotesk-var.ttf', 'Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf', 'Inter-Bold.ttf', 'JetBrainsMono-Regular.ttf', 'JetBrainsMono-Bold.ttf'];
    for (const file of files) assert(existsSync(resolve(ROOT, 'design/assets/fonts', file)), `police absente : ${file}`);
    const fontCss = read('src/design-system/theme/fonts.css');
    for (const file of files) assert(fontCss.includes(file), `fonts.css ne référence pas ${file}`);
    assert(!/https?:\/\/[^)'"]*\.(woff2?|ttf)/i.test(fontCss), 'téléchargement externe de police détecté');
    return `${files.length} fichiers locaux, aucun téléchargement externe`;
  });

  /* ───────────── 2. Contraste : affirmations de tokens.py vérifiées ───────────── */

  check('contraste : texte principal et secondaire ≥ 4.5:1 sur --surface-0 (AA)', () => {
    const s0 = '#050507';
    const pairs: Array<[string, string]> = [['#F5F5F7', 'hi'], ['#A9A9B8', 'mid'], ['#FFD47A', 'gold'], ['#B8FFE4', 'sign']];
    const values = pairs.map(([fg, name]) => `${name} ${contrastRatio(fg, s0).toFixed(2)}`);
    for (const [fg] of pairs) assert(contrastRatio(fg, s0) >= 4.5, `contraste insuffisant ${fg}`);
    return values.join(' · ');
  });

  check('contraste : --text-lo mesuré 4.07:1 sur --surface-0 (tokens.py annonce 4.6:1) — écart documenté', () => {
    const measured = contrastRatio('#6E6E7E', '#050507');
    assert(measured < 4.5, `--text-lo atteint ${measured.toFixed(2)}:1 : mettre à jour l'écart documenté`);
    assert(Math.abs(measured - 4.07) < 0.02, `mesure inattendue ${measured.toFixed(2)}`);
    return `mesuré ${measured.toFixed(2)}:1 < 4.5 → usage essentiel interdit`;
  });

  check('contraste : texte sur CTA or = --surface-0 (11.7:1) ; gold-200 sur gold-500 est refusé (1.46:1)', () => {
    const onGold = contrastRatio('#050507', '#FFB800');
    const goldOnGold = contrastRatio('#FFE9BD', '#FFB800');
    assert(onGold >= 4.5, 'texte noir sur or insuffisant');
    assert(goldOnGold < 4.5, 'gold-200 sur gold-500 devrait être refusé');
    return `noir/or ${onGold.toFixed(2)}:1 · gold-200/or ${goldOnGold.toFixed(2)}:1`;
  });

  check('accessibilité : focus = 2 px --gold-500 + halo 4 px α 0.24 (tokens.py)', () => {
    assertEqual([A11Y.focusRingPx, A11Y.focusHaloPx, A11Y.focusHaloAlpha], [2, 4, 0.24], 'focus');
    const css = read('src/design-system/theme/master.css');
    assert(/outline:\s*var\(--focus-ring-width\)\s*solid\s*var\(--gold-500\)/.test(css), 'anneau de focus absent du thème');
    assert(/rgba\(255,\s*184,\s*0,\s*var\(--focus-halo-alpha\)\)/.test(css), 'halo de focus non dérivé de --gold-500');
    return 'outline + halo présents';
  });

  /* ───────────── 3. Responsive 360 / 1440 px ───────────── */

  check('responsive 360 px : grille mobile (4 colonnes, marge 20 px)', () => {
    const grid = gridForViewport(360);
    assertEqual([grid.breakpoint, grid.columns, grid.marginPx, grid.maxWidthPx], ['mobile', 4, 20, null], '360 px');
    assertEqual(touchTargetMinPx(grid.breakpoint), 44, 'cible tactile mobile');
    return 'mobile · 4 col · marge 20 · cible ≥ 44 px';
  });

  check('responsive 1440 px : grille desktop (12 colonnes, marge 40 px, conteneur 1180 px)', () => {
    const grid = gridForViewport(1440);
    assertEqual([grid.breakpoint, grid.columns, grid.marginPx, grid.maxWidthPx], ['desktop', 12, 40, 1180], '1440 px');
    assertEqual(touchTargetMinPx(grid.breakpoint), 40, 'cible tactile desktop');
    const css = read('src/design-system/theme/master.css');
    assert(css.includes('@media (min-width: 768px)') && css.includes('@media (min-width: 1024px)'), 'seuils de grille absents du CSS');
    assert(css.includes('max-width: var(--grid-max-width)'), 'conteneur max non appliqué au shell');
    return 'desktop · 12 col · marge 40 · max 1180 px · seuils 768/1024 (provisoires)';
  });

  /* ───────────── 4. Verre (C-01) : budget, repli, mémoire ───────────── */

  check('verre : niveaux 3 et 4 profonds (> 24 px), 1 et 2 non profonds', () => {
    assertEqual([1, 2, 3, 4].map((l) => isDeepGlass(l as 1 | 2 | 3 | 4)), [false, false, true, true], 'profondeur');
    assertEqual(PERF.deepSurfacesMax, 2, 'surfaces profondes max');
    return 'profonds : 3 et 4';
  });

  check('verre : budget de surfaces profondes plafonné à 2, idempotent, libéré au démontage', () => {
    const budget = createDeepGlassBudget(2);
    assert(budget.acquire('a') && budget.acquire('b'), 'deux emplacements attendus');
    assert(!budget.acquire('c'), 'troisième surface profonde refusée');
    assert(budget.acquire('b'), 'réacquisition idempotente');
    budget.release('a');
    assert(budget.acquire('d'), 'emplacement libéré réutilisable');
    assertEqual(budget.held, 2, 'surfaces tenues');
    return 'max 2 · refus du 3e · idempotence';
  });

  check('verre : mode de rendu (natif, repli budget, repli < 4 Go)', () => {
    assertEqual(resolveGlassMode({ level: 2, deepGranted: false, lowMemory: false }), 'native', 'niveau 2');
    assertEqual(resolveGlassMode({ level: 3, deepGranted: false, lowMemory: false }), 'opaque-budget', 'profond sans budget');
    assertEqual(resolveGlassMode({ level: 3, deepGranted: true, lowMemory: false }), 'native', 'profond avec budget');
    assertEqual(resolveGlassMode({ level: 1, deepGranted: true, lowMemory: true }), 'opaque-lowmem', 'appareil < 4 Go');
    assertEqual(isLowMemoryDevice({ deviceMemory: 2 }), true, '2 Go');
    assertEqual(isLowMemoryDevice({ deviceMemory: 8 }), false, '8 Go');
    assertEqual(isLowMemoryDevice({}), false, 'API absente');
    return 'natif · opaque-budget · opaque-lowmem';
  });

  check('verre : rendu GlassSurface avec rim et grain décoratifs (aria-hidden)', () => {
    const html = render(<GlassSurface level={3} elevation={3}>contenu</GlassSurface>);
    assert(html.includes('data-glass-level="3"') && html.includes('data-glass-mode="native"'), 'mode natif attendu hors navigateur');
    assert((html.match(/class="lbm-grain" aria-hidden="true"/g) ?? []).length === 1, 'grain non décoratif');
    assert((html.match(/class="lbm-rim" aria-hidden="true"/g) ?? []).length === 1, 'rim non décoratif');
    assert(html.includes('contenu'), 'contenu absent');
    return 'grain et rim aria-hidden';
  });

  /* ───────────── 5. Squircle (C-02) : géométrie exacte ───────────── */

  check('squircle : tracé fermé, borné, coins conformes à |X|^n+|Y|^n = 1 (n = 4.2)', () => {
    const w = 200;
    const h = 120;
    const r = 22;
    const n = 4.2;
    const d = squircleRectPath(w, h, r, n, 16);
    assert(d.startsWith('M') && d.endsWith('Z'), 'chemin non fermé');
    const coords = [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert(coords.every(([x, y]) => x >= -0.01 && x <= w + 0.01 && y >= -0.01 && y <= h + 0.01), 'point hors du rectangle');
    // Point à t = π/4 du coin haut-droit : X = sin^(2/n), Y = cos^(2/n).
    const t = Math.PI / 4;
    const px = w - r + r * Math.pow(Math.sin(t), 2 / n);
    const py = r - r * Math.pow(Math.cos(t), 2 / n);
    const onCurve = ((px - (w - r)) / r) ** n + ((r - py) / r) ** n;
    assert(Math.abs(onCurve - 1) < 1e-9, 'équation superellipse non respectée');
    assert(coords.some(([x, y]) => Math.abs(x - px) < 0.011 && Math.abs(y - py) < 0.011), 'point du coin absent du tracé');
    return `${coords.length} sommets · équation vérifiée`;
  });

  check('squircle : SquircleCard hors mesure = repli border-radius (aucun SVG côté serveur)', () => {
    const html = render(<SquircleCard radius={28} elevation={2}>x</SquircleCard>);
    assert(html.includes('data-shape="squircle"') && html.includes('data-radius="28"'), 'attributs de forme absents');
    assert(html.includes('border-radius:28px'), 'repli border-radius absent');
    assert(!html.includes('<svg'), 'SVG rendu avant mesure');
    return 'repli 28 px avant mesure';
  });

  /* ───────────── 6. Mouvement : ressorts et réduction de mouvement ───────────── */

  check('mouvement : transition ressort = paramètres des tokens ; réduction → fondu 120 ms', () => {
    const snap = springTransition('snap') as { type: string; stiffness: number; damping: number; mass: number };
    assertEqual([snap.type, snap.stiffness, snap.damping, snap.mass], ['spring', 300, 20, 1], 'ressort snap');
    const reduced = transitionFor('snap', true) as { duration: number; type?: string };
    assertEqual([reduced.duration, reduced.type], [0.12, undefined], 'fondu reduced-motion');
    assertEqual((dockMorphTransition(false) as { duration: number }).duration, 0.42, 'morphing dock 420 ms');
    return 'snap 300/20/1 · reduced → 120 ms';
  });

  check('réduction de mouvement : CSS annule animations et déplacements, halo figé à 40 %', () => {
    const css = read('src/design-system/theme/master.css');
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(css);
    assert(block, 'bloc prefers-reduced-motion absent');
    assert(block[1].includes('animation: none !important'), 'animations non annulées');
    assert(block[1].includes('transition-duration: var(--duration-micro) !important'), 'fondu 120 ms absent');
    assert(/\.lbm-seal__halo\s*\{\s*opacity:\s*0\.4;/.test(block[1]), 'halo non figé à 40 %');
    return 'animation none · fondu 120 ms · halo 40 %';
  });

  check('mouvement : halo et grain bornés (aura ≤ 0.20, grain 3 %)', () => {
    const gold = 0.16;
    const emerald = 0.14;
    assert(gold <= 0.2 && emerald <= 0.2, 'aura au-delà de 0.20');
    assertEqual(MATERIALS.noise.opacity, 0.03, 'opacité du grain');
    assertEqual(MATERIALS.noise.baseFrequency, 0.8, 'fréquence du grain');
    return 'or 0.16 · émeraude 0.14 · grain 3 %';
  });

  /* ───────────── 7. Sécurité d'affichage : corrélation ───────────── */

  check('corrélation : seuls les formats de requête serveur sont affichés ; secrets et entités refusés', () => {
    const accepted = [
      '3f9a0c1e-7b2d-4e6f-8a1b-0c2d3e4f5a6b', // crypto.randomUUID() : error.requestId / x-request-id
      'req-m4x1k9z-a8f3kd9s',                  // repli du Worker sans randomUUID
      '4bf92f3577b34da6a3ce929d0e0e4736',      // trace-id W3C (SYS-09)
    ];
    for (const value of accepted) assertEqual(sanitizeCorrelationId(value), value, `format serveur accepté ${value}`);
    const refused = [
      'sk_live_abcdef123456',
      'AKIAIOSFODNN7EXAMPLE',                  // identifiant de clé cloud (format alphanumérique plausible)
      'usr_0123456789ABCDEFGHJKMNPQRS',        // identifiant d'entité, pas de requête
      'postgres://user:pw@db/app',
      'eyJhbGciOiJIUzI1NiJ9.payload',
      'token=abcdef123',
      'https://example.test/x',
      'user@example.test',
      '3f9a0c1e-7b2d-4e6f-8a1b-0c2d3e4f5a6G',  // hors hexadécimal
      'abc',
      '',
      '   ',
      'whsec_123456',
      'DSN-secret-99',
    ];
    for (const value of refused) assertEqual(sanitizeCorrelationId(value), null, `valeur refusée ${value}`);
    assertEqual(sanitizeCorrelationId(undefined), null, 'absent');
    return `${accepted.length} formats serveur acceptés · ${refused.length} valeurs refusées`;
  });

  /* ───────────── 8. StateGuard (C-19) : catalogue issu de sys.py ───────────── */

  check('StateGuard : 15 états exacts (loading … limites)', () => {
    const expected = ['loading', 'offline', '401', '403', '404', '409', '422', '425', '429', '500', '502', '503', '504', 'maintenance', 'limites'];
    assertEqual([...STATE_GUARD_KEYS].sort(), [...expected].sort(), 'clés StateGuard');
    return '15 clés';
  });

  check('StateGuard : titres = titres des fiches SYS (sys.py), routes identiques', () => {
    const { sysTitles } = source();
    assertEqual(STATE_GUARD_CATALOG.length, 15, 'entrées');
    for (const entry of STATE_GUARD_CATALOG) {
      assertEqual(entry.title, sysTitles[entry.route], `titre ${entry.code}`);
    }
    return '15 titres comparés à sys.py';
  });

  check('StateGuard : chaque action de sortie et chaque explication est une phrase de sys.py', () => {
    const { sysCtaNotes, sysHeroNotes, sysMediaNotes } = source();
    for (const entry of STATE_GUARD_CATALOG) {
      for (const action of entry.exitActions) {
        assert(sysCtaNotes[entry.route].includes(`« ${action.label} »`), `action absente de sys.py : ${action.label}`);
      }
      if (entry.explanation) {
        const notes = `${sysHeroNotes[entry.route]} ${sysMediaNotes[entry.route]}`;
        const sentence = entry.explanation.replace('{heure}', '14:30');
        const normalized = sentence.charAt(0).toLowerCase() + sentence.slice(1);
        assert(notes.includes(normalized) || notes.includes(sentence), `explication absente de sys.py : ${entry.code}`);
      }
    }
    return 'actions et explications vérifiées';
  });

  check('StateGuard : SYS-01 sans explication ni action (NON DÉFINIE), maintenance avec {heure}', () => {
    const loading = STATE_GUARD_CATALOG.find((e) => e.key === 'loading');
    const maintenance = STATE_GUARD_CATALOG.find((e) => e.key === 'maintenance');
    assert(loading && loading.explanation === null && loading.exitActions.length === 0, 'chargement : rien d\u2019inventé attendu');
    assert(maintenance && maintenance.explanation === 'LE LABEUR revient à {heure}.', 'maintenance : gabarit attendu');
    return 'chargement sans texte inventé · maintenance = gabarit {heure}';
  });

  check('StateGuard : rendu complet de chaque état (titre, sortie, aucun secret)', () => {
    for (const entry of STATE_GUARD_CATALOG) {
      const html = render(<StateGuard state={entry.key} correlationId="sk_live_0000000000" exitHref="/fondation" />);
      assert(html.includes(`data-state="${entry.key}"`), `attribut d'état absent : ${entry.key}`);
      assert(html.includes(htmlText(entry.title)), `titre absent : ${entry.code}`);
      assert(!html.includes('sk_live'), `secret rendu : ${entry.code}`);
      assert(!html.includes('Code de corrélation'), `corrélation non filtrée : ${entry.code}`);
      const primary = entry.exitActions[0]?.label ?? 'Revenir';
      assert(html.includes(htmlText(primary)), `sortie absente : ${entry.code}`);
    }
    return '15 états rendus, aucun secret';
  });

  check('StateGuard : corrélation sûre affichée en Mono copiable ; loading annoncé en status', () => {
    const html = render(<StateGuard state="500" correlationId="3f9a0c1e-7b2d-4e6f-8a1b-0c2d3e4f5a6b" exitHref="/" />);
    assert(html.includes('Code de corrélation') && html.includes('3f9a0c1e-7b2d-4e6f-8a1b-0c2d3e4f5a6b'), 'corrélation sûre absente');
    assert(html.includes('aria-label="Copier le code de corrélation"'), 'bouton de copie non étiqueté');
    const loading = render(<StateGuard state="loading" />);
    assert(loading.includes('role="status"') && loading.includes('aria-busy="true"'), 'chargement non annoncé');
    assert(!loading.includes('lbm-state__explanation'), 'texte de chargement inventé');
    assert(loading.includes('Revenir'), 'sortie de repli absente');
    return 'corrélation Mono · status · sans texte inventé';
  });

  check('StateGuard : garanties affichées seulement quand elles sont fournies (vérifiées serveur)', () => {
    const without = render(<StateGuard state="500" />);
    assert(!without.includes('lbm-state__guarantees'), 'garanties affichées sans source serveur');
    const withGuarantee = render(<StateGuard state="500" guarantees={["Aucune de vos données n'a été perdue."]} />);
    assert(withGuarantee.includes('Sécurités') && withGuarantee.includes('perdue'), 'garantie fournie non affichée');
    return 'garanties conditionnées au serveur';
  });

  /* ───────────── 9. Composants : rôles, états, cibles ───────────── */

  check('C-03 NeoPressButton : bouton natif, états busy/disabled, variante or = CTA unique', () => {
    const primary = render(<NeoPressButton variant="primary">Confirmer</NeoPressButton>);
    assert(primary.startsWith('<button') && primary.includes('type="button"') && primary.includes('lbm-neo--primary'), 'bouton natif attendu');
    const busy = render(<NeoPressButton loading>Envoi</NeoPressButton>);
    assert(busy.includes('aria-busy="true"') && busy.includes('aria-disabled="true"') && busy.includes('Traitement en cours'), 'état chargement incomplet');
    const disabled = render(<NeoPressButton disabled>Non</NeoPressButton>);
    assert(disabled.includes(' disabled=""'), 'désactivation absente');
    const css = read('src/design-system/theme/master.css');
    assert(/\.lbm-neo\s*\{[\s\S]*?min-height:\s*var\(--touch-target-mobile\)/.test(css), 'cible tactile minimale absente');
    return 'natif · busy · disabled · cible 44 px';
  });

  check('C-04 StatusSeal : libellé visible, glyphe décoratif, pas de halo sans demande', () => {
    const html = render(<StatusSeal tone="emerald" label="Éligible" />);
    assert(html.includes('Éligible') && html.includes('data-tone="emerald"'), 'libellé ou ton absent');
    assert(!html.includes('lbm-seal__halo'), 'halo sans demande');
    const pulsing = render(<StatusSeal tone="gold" label="Or" pulse />);
    assert(pulsing.includes('lbm-seal__halo'), 'halo demandé absent');
    return 'libellé + ton · halo optionnel';
  });

  check('C-20 BottomDock : libellés EMP exacts, page active en aria-current, contrôle solide ADM', () => {
    const emp = render(<BottomDock ariaLabel="Navigation client" items={dockItemsFor('EMP')} currentPath="/client/missions/42" variant="glass" />);
    assertEqual(['Accueil', 'Missions', 'Contrats', 'Argent', 'Profil'].every((label) => emp.includes(`>${label}<`)), true, 'libellés EMP');
    assert(/aria-current="page"[^>]*>[\s\S]*?Missions/.test(emp), 'page active incorrecte');
    assert(emp.includes('lbm-glass') && emp.includes('aria-label="Navigation client"'), 'verre ou repère absent');
    const adm = render(<BottomDock ariaLabel="Navigation supervision" items={dockItemsFor('ADM')} currentPath="/admin" variant="solid" />);
    assert(adm.includes('lbm-dock--solid') && !adm.includes('lbm-glass'), 'dock ADM en verre (interdit)');
    return 'EMP 5 entrées · ADM solide';
  });

  check('C-20 resolveActiveDockItem : plus longue route couvrante', () => {
    const items = [{ href: '/client' }, { href: '/client/missions' }, { href: '/client/paiements' }];
    assertEqual(resolveActiveDockItem(items, '/client/missions/9')?.href ?? null, '/client/missions', 'missions');
    assertEqual(resolveActiveDockItem(items, '/client')?.href ?? null, '/client', 'accueil');
    assertEqual(resolveActiveDockItem(items, '/client/notifications')?.href ?? null, '/client', 'repli accueil');
    assertEqual(resolveActiveDockItem(items, '/clientele')?.href ?? null, null, 'faux préfixe');
    return 'plus longue correspondance';
  });

  /* ───────────── 10. Shells : chrome du Master ───────────── */

  check('shells : PUB sans dock ni appbar (chrome minimal), SYS et RTC sans dock', () => {
    const pub = render(<PublicShell currentPath="/fondation/public">x</PublicShell>);
    assert(pub.includes('data-shell="PUBLIC"') && !pub.includes('<nav') && pub.includes('lbm-chrome-minimal'), 'PUB non minimal');
    const sys = render(<SystemShell currentPath="/etat/401">x</SystemShell>);
    assert(!sys.includes('<nav') && sys.includes('▤'), 'SYS : glyphe ou dock inattendu');
    const rtc = render(<RtcShell currentPath="/appels">x</RtcShell>);
    assert(!rtc.includes('<nav') && rtc.includes('SESSION'), 'RTC : appbar ou dock inattendu');
    return 'PUB · SYS · RTC conformes';
  });

  check('shells : EMP et PRE = appbar LE LABEUR + dock 5 entrées de leur famille', () => {
    const client = render(<ClientShell currentPath="/client">x</ClientShell>);
    assert(client.includes('LE LABEUR') && client.includes('Contrats') && client.includes('Argent'), 'dock client incorrect');
    const pre = render(<PrestataireShell currentPath="/prestataire">x</PrestataireShell>);
    assert(pre.includes('Candidatures') && pre.includes('Salaire') && !pre.includes('>Contrats<'), 'dock prestataire incorrect');
    assertEqual(CHROME_BY_FAMILY.EMP.dock?.length, 5, 'dock EMP à 5 entrées');
    assertEqual(CHROME_BY_FAMILY.PRE.dock?.length, 5, 'dock PRE à 5 entrées');
    return 'EMP et PRE à 5 entrées, libellés distincts';
  });

  check('shells : ADM = appbar SUPERVISION + dock dédié (Flux, Files, Litiges, Sécu, Infra)', () => {
    const adm = render(<AdminShell currentPath="/admin/litiges">x</AdminShell>);
    assert(adm.includes('SUPERVISION') && adm.includes('Litiges') && adm.includes('lbm-dock--solid'), 'shell ADM incorrect');
    assert(adm.includes('aria-current="page"'), 'entrée active absente');
    return 'SUPERVISION + dock solide';
  });

  check('shells : lien d’évitement, repère main, cible de focus', () => {
    for (const element of [
      <ClientShell key="c" currentPath="/client">x</ClientShell>,
      <AdminShell key="a" currentPath="/admin">x</AdminShell>,
    ]) {
      const html = render(element);
      assert(html.includes('href="#lbm-main"') && html.includes('id="lbm-main"') && html.includes('tabindex="-1"'), 'évitement ou repère absent');
    }
    return 'skip link + main focusable';
  });

  check('shells : nomenclature du dock = libellés générés (aucune dérive)', () => {
    assertEqual(dockItemsFor('EMP').map((i) => i.label), CHROME_BY_FAMILY.EMP.dock, 'dock EMP');
    assertEqual(dockItemsFor('PRE').map((i) => i.label), CHROME_BY_FAMILY.PRE.dock, 'dock PRE');
    assertEqual(dockItemsFor('ADM').map((i) => i.label), CHROME_BY_FAMILY.ADM.dock, 'dock ADM');
    return 'EMP / PRE / ADM identiques à la source';
  });

  check('pages de démonstration : index (tokens, composants, budgets) et shell PUB', () => {
    const index = render(<FoundationIndexPage />);
    for (const marker of ['Fondation du Design Final', 'C-01 GlassSurface', 'C-19 StateGuard', 'Unités de production']) {
      assert(index.includes(marker), `section absente : ${marker}`);
    }
    const pub = render(<FoundationPublicPage />);
    assert(pub.includes('Accueil public'), 'page PUB absente');
    return 'index et page PUB rendus';
  });

  /* ───────────── 11. Inventaire : aucune unité intégrée par la fondation ───────────── */

  check('unités : 120 unités, répartition par famille = arbitrage 211 → 177 → 120', () => {
    const { familyCounts } = source();
    assertEqual(TOTAL_UNITS, 120, 'total unités');
    assertEqual(PRODUCTION_UNITS.length, 120, 'longueur du registre');
    assertEqual(UNIT_COUNTS_BY_FAMILY, { PUB: 10, EMP: 32, PRE: 26, ADM: 34, RTC: 5, SYS: 10, FIN: 3 }, 'répartition');
    assertEqual(familyCounts.EMP, 60, 'fiches EMP (états)');
    return '10 + 32 + 26 + 34 + 5 + 10 + 3 = 120';
  });

  check('garde-fou : aucun écran de production métier importé par la fondation', () => {
    const forbidden = ['src/screens/', 'src/backend/', 'design/code/'];
    const files = [
      'src/design-system/shells/ShellRoute.tsx',
      'src/design-system/shells/shells.tsx',
      'src/design-system/shells/shellNavigation.ts',
      'src/design-system/components/StateGuard.tsx',
      'src/design-system/demo/FoundationPages.tsx',
      'src/routing/AppRouter.tsx',
      'src/routing/resolveRoute.ts',
    ];
    for (const file of files) {
      const text = read(file);
      for (const marker of forbidden) assert(!text.includes(`'${marker}`) && !text.includes(`"${marker}`), `import interdit dans ${file} : ${marker}`);
    }
    return 'aucun import métier ni de références design/code';
  });

  return results;
}
