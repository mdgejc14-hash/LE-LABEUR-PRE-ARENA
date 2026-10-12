/**
 * RTC —— résolution d'un écran réel depuis le chemin (données générées).
 *
 * Les routes sont celles du routeur P0 (`productionUnits.ts` /
 * `RTC_DESIGN_SCREENS`) : aucune route n'est créée, renommée ou réécrite
 * par cette tranche. Ce module ne contient AUCUN composant : il est importable
 * par la résolution de route sans embarquer l'interface.
 */

import { RTC_DESIGN_SCREENS, RTC_DESIGN_UNITS } from './catalog';
import { RTC_UNIT_GAPS } from './gaps';

export interface ResolvedRtcScreen {
  /** Code de fiche (RTC-01 … RTC-08). */
  readonly code: string;
  /** Unité de production qui contient cette fiche (RTC-01, RTC-02, RTC-04, RTC-05, RTC-08). */
  readonly unitId: string;
  /** Motif de route réel dont ce chemin descend. */
  readonly pattern: string;
  /** Paramètres extraits du motif (`:id`). */
  readonly params: Readonly<Record<string, string>>;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const names: string[] = [];
  const pieces = pattern.split('/').map((segment) => {
    if (segment.startsWith(':')) {
      names.push(segment.slice(1));
      return '([^/]+)';
    }
    return escapeRegExp(segment);
  });
  const found = new RegExp('^' + pieces.join('/') + '$').exec(path);
  if (!found) return null;
  const params: Record<string, string> = {};
  names.forEach((name, index) => {
    params[name] = decodeURIComponent(found[index + 1] ?? '');
  });
  return params;
}

/** Fiche déclarée par le design, retrouvée par son code (jamais une table écrite à la main). */
export function rtcScreenByCode(code: string): (typeof RTC_DESIGN_SCREENS)[number] | null {
  return RTC_DESIGN_SCREENS.find((screen) => screen.code === code) ?? null;
}

/** Routes réellement livrées pour une unité (fiche → motif de route), depuis les données générées. */
export function deliveredScreensForUnit(unitId: string): readonly { code: string; route: string }[] {
  const unit = RTC_DESIGN_UNITS.find((candidate) => candidate.id === unitId);
  if (!unit) return [];
  const delivered: { code: string; route: string }[] = [];
  for (const code of unit.screenCodes as readonly string[]) {
    const screen = RTC_DESIGN_SCREENS.find((candidate) => candidate.code === code);
    if (screen) delivered.push({ code, route: screen.route });
  }
  return delivered;
}

/** Fiche canonique d'une unité : la première fiche rattachée à cette unité. */
export function canonScreenCodeForUnit(unitId: string): string | null {
  const unit = RTC_DESIGN_UNITS.find((candidate) => candidate.id === unitId);
  const first = (unit?.screenCodes as readonly string[] | undefined)?.[0];
  return first ?? null;
}

/** Unité qui contient la fiche, d'après les données générées (jamais une table écrite à la main). */
export function unitForScreen(code: string): string | null {
  const unit = RTC_DESIGN_UNITS.find((candidate) => (candidate.screenCodes as readonly string[]).includes(code));
  return unit ? unit.id : null;
}

/**
 * Écran réel d'un chemin : motif exact d'abord, puis motifs paramétrés les plus
 * spécifiques (le plus long gagne : `/appel/:id/preparation` plutôt que
 * `/appel/:id`).
 */
export function resolveRtcScreen(pathname: string): ResolvedRtcScreen | null {
  const path = pathname.split('?')[0];
  const exact = RTC_DESIGN_SCREENS.find((screen) => screen.route === path);
  const candidates = exact
    ? [exact]
    : RTC_DESIGN_SCREENS
        .filter((screen) => screen.route.includes(':'))
        .slice()
        .sort((left, right) => right.route.length - left.route.length);
  for (const screen of candidates) {
    const params = matchPattern(screen.route, path);
    if (params === null) continue;
    const unitId = unitForScreen(screen.code) ?? screen.code;
    return { code: screen.code, unitId, pattern: screen.route, params };
  }
  return null;
}

/**
 * BACKEND_GAP à afficher sur un écran : ceux de la fiche réellement atteinte
 * et, quand elle diffère de l'unité (ex. RTC-07 dans l'unité RTC-01), ceux de
 * la fiche canonique de l'unité. Aucune ligne n'est inventée ici : elles sont
 * déclarées dans `gaps.ts` et affichées telles quelles.
 */
export function rtcGapsFor(unitId: string, pathname: string): readonly string[] {
  const screen = resolveRtcScreen(pathname);
  const canon = canonScreenCodeForUnit(unitId);
  const own = canon ? (RTC_UNIT_GAPS[canon] ?? []) : [];
  if (!screen || !canon || screen.code === canon) return own;
  const extra = RTC_UNIT_GAPS[screen.code] ?? [];
  return [...own, ...extra];
}
