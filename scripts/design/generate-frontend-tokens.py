#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LE LABEUR — Générateur des tokens et référentiels frontend (P0-DESIGN-FOUNDATION).

Source de vérité (lecture seule, jamais modifiée) :
  design/llab/tokens.py          tokens : couleurs, typographie, verre, mouvement,
                                  C-01→C-20, accessibilité, performance, invariants
  design/llab/model.py           chromes par famille (CHROME_APP, CHROME_ADM, …)
  design/llab/content/*.py       fiches d'écran (SYS-01→15 pour StateGuard, unités)
  design/llab/units.py           arbitrage 211 états → 177 canons → 120 unités

Sorties GÉNÉRÉES (ne pas éditer à la main) :
  src/design-system/generated/tokens.ts
  src/design-system/generated/tokens.css
  src/design-system/generated/stateGuardCatalog.ts
  src/design-system/generated/chrome.ts
  src/design-system/generated/productionUnits.ts

Règles de la génération :
  - aucune valeur n'est inventée : une valeur absente de la source est émise
    « NON_DEFINI » (texte exact : NON DÉFINIE) ;
  - une ligne de source non reconnue FAIT ÉCHOUER la génération (pas de devinette) ;
  - la sortie est déterministe (aucune date générée, aucun chemin absolu).

Usage :
  python3 scripts/design/generate-frontend-tokens.py           # écrit les fichiers
  python3 scripts/design/generate-frontend-tokens.py --check   # code 1 si dérive
"""

import re
import sys
import unicodedata
from pathlib import Path

sys.dont_write_bytecode = True  # ne jamais écrire de __pycache__ dans design/

ROOT = Path(__file__).resolve().parents[2]
DESIGN_DIR = ROOT / "design"
OUT_DIR = ROOT / "src" / "design-system" / "generated"

sys.path.insert(0, str(DESIGN_DIR))

from llab import tokens as T  # noqa: E402
from llab import model as M  # noqa: E402
from llab import units as U  # noqa: E402
from llab.content import load_all  # noqa: E402
from llab.content import pre_a as PRE_CONTENT  # noqa: E402
from llab.content import sys as SYS_CONTENT  # noqa: E402
from llab.content import fin as FIN_CONTENT  # noqa: E402

FAMILY_ORDER = ["PUB", "EMP", "PRE", "ADM", "RTC", "SYS", "FIN"]
MINUS = "\u2212"
NON_DEFINI_TEXT = "NON DÉFINIE"
TOTAL_STATES, TOTAL_CANONICAL, TOTAL_UNITS = 211, 177, 120

# Mots de couleur des fiches SYS → tons du sceau (C-04). Aucune autre correspondance.
SEAL_TONE_WORDS = [
    ("ardoise", "slate"),
    ("clay", "clay"),
    ("ambre", "amber"),
    ("violet", "violet"),
    ("émeraude", "emerald"),
    ("cyan", "cyan"),
    ("or", "gold"),
]

# Clés stables du catalogue StateGuard (route /etat/<segment> → clé d'état).
SYS_STATE_KEYS = {"chargement": "loading", "hors-ligne": "offline", "maintenance": "maintenance", "limites": "limites"}

# Style de bouton annoncé par la fiche (« or » = CTA plein, unique par écran).
EXIT_STYLE = {"or": "primary", "fantôme": "ghost", "texte": "text"}


class SourceError(Exception):
    """Format de source non reconnu : la génération s'arrête."""


def must(match, text, what):
    if match is None:
        raise SourceError(f"{what} : format non reconnu → {text!r}")
    return match


def norm_minus(text):
    return text.replace(MINUS, "-")


def ascii_fold(text):
    """'cinématique' -> 'cinematique' (identifiants TS stables, sans accent)."""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def camel(token):
    """'--surface-0' -> 'surface0' ; '--grad-gold' -> 'gradGold' ; 'cinématique' -> 'cinematique'."""
    parts = ascii_fold(token).lstrip("-").split("-")
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def ts_str(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def ts_inline(value):
    if isinstance(value, dict):
        return "{ " + ", ".join(
            (str(k) if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", str(k)) else ts_str(str(k))) + ": " + ts_inline(v)
            for k, v in value.items()) + " }"
    if isinstance(value, list):
        return "[" + ", ".join(ts_inline(v) for v in value) + "]"
    return ts_literal(value)


def ts_literal(value, indent=0):
    pad = "  " * indent
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return ts_str(value)
    if isinstance(value, list):
        if not value:
            return "[]"
        if all(isinstance(v, (int, float, str, bool)) or v is None for v in value):
            return "[" + ", ".join(ts_literal(v) for v in value) + "]"
        inner = ",\n".join(pad + "  " + ts_literal(v, indent + 1) for v in value)
        return "[\n" + inner + ",\n" + pad + "]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = []
        for k, v in value.items():
            key = str(k)
            if not re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*$", key) and not key.isdigit():
                key = ts_str(key)
            lines.append(pad + "  " + key + ": " + ts_literal(v, indent + 1))
        return "{\n" + ",\n".join(lines) + ",\n" + pad + "}"
    if isinstance(value, Symbol):
        return value.name
    raise SourceError(f"type non émissible : {type(value)!r}")


class Symbol:
    """Référence à une constante TS déjà déclarée dans le même fichier."""

    def __init__(self, name):
        self.name = name


NON_DEFINI = Symbol("NON_DEFINI")


def export_const(name, value, comment=None):
    head = f"/** {comment} */\n" if comment else ""
    return f"{head}export const {name} = {ts_literal(value)} as const;\n"


def header(source_lines, extra=""):
    lines = ["// GÉNÉRÉ PAR scripts/design/generate-frontend-tokens.py — NE PAS ÉDITER À LA MAIN.",
             "// Source : " + ", ".join(source_lines) + ".", "// Régénérer : npm run design:tokens"]
    if extra:
        lines.append("// " + extra)
    return "\n".join(lines) + "\n\n"


# ───────────────────────── Parseurs (formats connus uniquement) ─────────────────────────

def parse_glass(value):
    m = must(re.match(r"^rgba\(255,255,255,([0-9.]+)\)\s*\+\s*blur\s+(\d+)\s*\+\s*saturate\s+(\d+)%$", value), value, "verre")
    return {"tint": f"rgba(255,255,255,{m.group(1)})", "alpha": float(m.group(1)),
            "blurPx": int(m.group(2)), "saturatePct": int(m.group(3))}


def parse_type_spec(spec):
    m = must(re.match(r"^(\d+)\s*/\s*(\d+)\s*/\s*(\d+)\s*/\s*([+-]?\d+)(%?)$", norm_minus(spec).strip()), spec, "échelle typo")
    tracking = int(m.group(4))
    return {"sizePx": int(m.group(1)), "weight": int(m.group(2)), "lineHeightPx": int(m.group(3)),
            "trackingEm": round(tracking / 100, 4) if m.group(5) == "%" else 0}


def parse_family(role, spec):
    m = must(re.match(r"^(.+?)\s*\(([\d/]+)\)$", spec), spec, "famille typo")
    return {"role": role, "family": m.group(1), "weights": [int(w) for w in m.group(2).split("/")]}


def parse_spring(params, approx):
    m = must(re.search(r"stiffness\s+(\d+)\s*·\s*damping\s+(\d+)\s*·\s*mass\s+(\d+(?:\.\d+)?)", params), params, "ressort")
    a = must(re.search(r"≈\s*(\d+)\s*ms", approx), approx, "durée ressort")
    mass = float(m.group(3))
    return {"stiffness": int(m.group(1)), "damping": int(m.group(2)), "mass": mass, "approxMs": int(a.group(1))}


def parse_bezier(text):
    m = must(re.search(r"cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)", text), text, "courbe")
    return [float(m.group(i)) for i in range(1, 5)]


def parse_ms(text):
    m = must(re.search(r"(\d[\d\u00a0\u202f ]*)\s*ms", text), text, "durée")
    return int(re.sub(r"[\s\u00a0\u202f]", "", m.group(1)))


def parse_px(text):
    m = must(re.search(r"(\d+(?:\.\d+)?)\s*px", text), text, "dimension")
    return float(m.group(1)) if "." in m.group(1) else int(m.group(1))


def parse_shadow(text):
    """'0 1 2 rgba(0,0,0,0.40) + rim 0.06' → décalage, flou, alpha, rim."""
    m = re.match(r"^(-?\d+)\s+(-?\d+)\s+(\d+)\s+rgba\(0,0,0,(\d+(?:\.\d+)?)\)", text)
    rim = must(re.search(r"rim\s+(\d+(?:\.\d+)?)", text), text, "rim élévation")
    if m is None:
        raise SourceError(f"ombre non reconnue : {text!r}")
    return {"shadow": f"{m.group(1)}px {m.group(2)}px {m.group(3)}px rgba(0,0,0,{m.group(4)})",
            "offsetYPx": int(m.group(2)), "blurPx": int(m.group(3)), "alpha": float(m.group(4)),
            "rimAlpha": float(rim.group(1))}


def parse_quotes(text):
    return [q.strip() for q in re.findall(r"«\s*([^»]+?)\s*»", text)]


def first_zone(screen, kinds):
    for zone in screen.zones:
        if zone.kind in kinds:
            return zone
    return None


# ───────────────────────── Construction du modèle ─────────────────────────

def build_tokens_model():
    families = load_all()
    problems = M.validate(families)
    if problems:
        raise SourceError("fiches invalides : " + "; ".join(problems[:5]))
    all_screens = [s for fam in FAMILY_ORDER for s in families[fam]]
    codes = [s.code for s in all_screens]
    canons = {s.canon for s in all_screens}
    analysis = U.analyses(families)
    if (len(codes), len(canons), analysis["unites"]) != (TOTAL_STATES, TOTAL_CANONICAL, TOTAL_UNITS):
        raise SourceError(f"arbitrage inattendu : {len(codes)}/{len(canons)}/{analysis['unites']}")
    if analysis["cles_orphelines"]:
        raise SourceError(f"clés d'unités orphelines : {analysis['cles_orphelines']}")

    model = {}
    model["brand"] = {k: T.BRAND[k] for k in ("name", "tagline", "aesthetic", "voice", "signature", "version", "date")}
    model["arbitrage"] = {"etats": len(codes), "canons": len(canons), "unites": analysis["unites"],
                          "unitesParFamille": analysis["unites_par_famille"]}

    # Palette (lignes brutes + clés camelCase), verre à part (valeurs composées).
    palette_groups, glass_rows, color_values = [], {}, {}
    for group, rows in T.PALETTE.items():
        if group.startswith("Verre"):
            for name, value, usage in rows:
                level = int(name.split("-")[-1])
                glass_rows[level] = {"cssVar": name, "usage": usage, **parse_glass(value)}
            continue
        out_rows = []
        for name, value, usage in rows:
            if name.startswith("--text-"):
                claim = re.search(r"Contraste\s+(\d+(?:\.\d+)?):1", usage)
                row = {"cssVar": name, "key": camel(name), "value": value, "usage": usage,
                       "contrastClaim": float(claim.group(1)) if claim else None}
            else:
                row = {"cssVar": name, "key": camel(name), "value": value, "usage": usage}
            out_rows.append(row)
            color_values[camel(name)] = value
        palette_groups.append({"label": group, "rows": out_rows})
    model["palette"] = palette_groups
    model["colors"] = color_values
    model["glass"] = {lvl: glass_rows[lvl] for lvl in sorted(glass_rows)}

    # Matériaux (valeurs numériques extraites des phrases de la source).
    mat = T.MATERIALS
    rim = must(re.search(r"(\d+)\s*px inset top rgba\(255,255,255,(\d+(?:\.\d+)?)→(\d+(?:\.\d+)?)\)", mat["rim_light"]), mat["rim_light"], "rim-light")
    spec = must(re.search(r"\((-?\d+)°,\s*(-?\d+)°\)", mat["specular_light"]), mat["specular_light"], "lumière spéculaire")
    spec_mod = must(re.search(r"±(\d+)°", mat["specular_light"]), mat["specular_light"], "modulation spéculaire")
    noise = must(re.search(r"baseFrequency\s+(\d+(?:\.\d+)?).*?opacité\s+(\d+)%.*?blend\s+(\w+)", mat["noise_overlay"]), mat["noise_overlay"], "bruit")
    refr = must(re.search(r"n\s*=\s*(\d+(?:\.\d+)?)\s*\(", mat["indice_refraction"]), mat["indice_refraction"], "indice")
    thick = must(re.search(r"(\d+)\s*px", mat["epaisseur_optique"]), mat["epaisseur_optique"], "épaisseur optique")
    fringe = must(re.search(r"±\s*(\d+(?:\.\d+)?)\s*px", mat["refraction_spectrale"]), mat["refraction_spectrale"], "franges")
    sq_mat = must(re.search(r"n\s*=\s*(\d+(?:\.\d+)?)\s*\(rayon", mat["squircle"]), mat["squircle"], "squircle")
    sq_radii_doc = [int(x) for x in must(re.search(r"rayon\s+([\d/]+)", mat["squircle"]), mat["squircle"], "rayons squircle").group(1).split("/")]
    model["materials"] = {
        "refractionIndex": float(refr.group(1)),
        "opticalThicknessPx": int(thick.group(1)),
        "spectralFringePx": float(fringe.group(1)),
        "blurLevelsPx": {int(k.split("-")[-1]): int(parse_px(v)) for k, v in mat["blur_levels"].items()},
        "specular": {"azimuthDeg": int(spec.group(1)), "elevationDeg": int(spec.group(2)), "modulationDeg": int(spec_mod.group(1))},
        "rimLight": {"insetTopPx": int(rim.group(1)), "alphaMin": float(rim.group(2)), "alphaMax": float(rim.group(3))},
        "noise": {"baseFrequency": float(noise.group(1)), "opacity": int(noise.group(2)) / 100, "blend": noise.group(3)},
        "squircle": {"exponent": float(sq_mat.group(1)),
                      "radiiTokensPx": [int(parse_px(v)) for name, v in T.RADII if name.startswith("--squircle-")],
                      "radiiDocumentedPx": sq_radii_doc},
    }

    # Typographie
    model["typeFamilies"] = [parse_family(role, spec_) for role, spec_, _ in T.TYPO["familles"]]
    model["typeScale"] = [{"cssName": name, "key": camel(name), **parse_type_spec(spec_), "usage": usage}
                          for name, spec_, usage in T.TYPO["echelle"]]
    model["typeRules"] = list(T.TYPO["regles"])

    # Espacement, grille, rayons, élévation
    sp = T.SPACING
    grid = {}
    for label, text in sp["grille"].items():
        m = must(re.search(r"(\d+)\s*colonnes\s*·\s*gouttière\s*(\d+)\s*·\s*marge\s*(\d+)", text), text, f"grille {label}")
        grid[label] = {"columns": int(m.group(1)), "gutterPx": int(m.group(2)), "marginPx": int(m.group(3))}
        mx = re.search(r"conteneur max\s*(\d+)\s*px", text)
        if mx:
            grid[label]["maxWidthPx"] = int(mx.group(1))
    rhythm = must(re.search(r"Pas de (\d+) px entre blocs logiques, (\d+) px entre sections, (\d+) px avant un verdict", sp["rythme_vertical"]), sp["rythme_vertical"], "rythme")
    model["spacing"] = {"baseUnitPx": int(parse_px(sp["unite_base"])), "scalePx": [int(v) for v in sp["echelle"]],
                        "grid": {"mobile": grid["mobile"], "tablet": grid["tablette"], "desktop": grid["desktop"]},
                        "verticalRhythmPx": {"block": int(rhythm.group(1)), "section": int(rhythm.group(2)), "verdict": int(rhythm.group(3))}}

    radii = []
    for name, value in T.RADII:
        if name.startswith("--squircle-"):
            m = must(re.search(r"superellipse\s+(\d+)\s*px\s*\(n=(\d+(?:\.\d+)?)\)", value), value, "squircle")
            radii.append({"cssVar": name, "px": int(m.group(1)), "exponent": float(m.group(2)), "kind": "squircle"})
        elif name == "--r-full":
            radii.append({"cssVar": name, "px": 999, "exponent": None, "kind": "full"})
        else:
            radii.append({"cssVar": name, "px": int(parse_px(value)), "exponent": None, "kind": "radius"})
    model["radii"] = radii

    elevation = []
    for label, shadow, usage in T.ELEVATION:
        level = int(label[1])
        if label.startswith("E0"):
            elevation.append({"level": 0, "label": label, "shadow": None, "rimAlpha": None, "haloColor": None, "usage": usage})
            continue
        parts = [p.strip() for p in shadow.split("+")]
        parsed = parse_shadow(shadow)
        halo = None if len(parts) < 3 else parts[2]
        elevation.append({"level": level, "label": label, **parsed,
                          "halo": halo, "haloColor": NON_DEFINI, "usage": usage})
    model["elevation"] = elevation

    # Mouvement
    model["springs"] = []
    for name, params, approx, usage in T.MOTION["springs"]:
        model["springs"].append({"name": name, **parse_spring(params, approx), "usage": usage})
    model["easings"] = []
    for name, value, usage in T.MOTION["courbes"]:
        model["easings"].append({"cssVar": name, "bezier": parse_bezier(value), "usage": usage})
    durations = {}
    for name, value in T.MOTION["durees"]:
        if name == "stagger-liste":
            m = must(re.search(r"(\d+)\s*ms\s*×\s*index,\s*plafonné à\s*(\d+)", value), value, "stagger")
            durations["staggerMsPerIndex"] = int(m.group(1))
            durations["staggerCap"] = int(m.group(2))
        elif name == "halo-pulse":
            durations["haloPulseMs"] = parse_ms(value)
        else:
            durations[camel(name)] = parse_ms(value)
    model["durations"] = durations
    model["motionRules"] = list(T.MOTION["choregraphie"])
    model["haptics"] = [{"id": name, "usage": usage} for name, usage in T.MOTION["haptiques"]]

    # Composants C-01→C-20
    registry = []
    for label, definition in T.COMPONENTS:
        m = must(re.match(r"^(C-\d{2})\s+(\S+)$", label), label, "composant")
        registry.append({"id": m.group(1), "name": m.group(2), "definition": definition})
    if len(registry) != 20:
        raise SourceError(f"registre composants : {len(registry)} au lieu de 20")
    model["components"] = registry
    model["icons"] = list(T.ICONO)
    model["sound"] = list(T.SOUND)
    model["dataviz"] = list(T.DATAVIZ)

    # Accessibilité
    a11y_text = T.A11Y
    contrast = must(re.search(r"≥\s*(\d+(?:\.\d+)?):1 pour tout texte\s*<\s*(\d+)\s*px", a11y_text[0]), a11y_text[0], "contraste texte")
    ui = must(re.search(r"≥\s*(\d+(?:\.\d+)?):1 pour les composants", a11y_text[0]), a11y_text[0], "contraste UI")
    touch = must(re.search(r"≥\s*(\d+)\s*×\s*(\d+)\s*px \(mobile\), ≥\s*(\d+)\s*px \(desktop\)", a11y_text[1]), a11y_text[1], "cibles tactiles")
    focus = must(re.search(r"(\d+)\s*px --gold-500 \+ halo\s*(\d+)\s*px α\s*(\d+(?:\.\d+)?)", a11y_text[2]), a11y_text[2], "focus")
    model["a11y"] = {
        "textContrastMin": float(contrast.group(1)), "textContrastBelowPx": int(contrast.group(2)),
        "uiContrastMin": float(ui.group(1)),
        "touchTargetMobilePx": int(touch.group(1)), "touchTargetDesktopPx": int(touch.group(3)),
        "focusRingPx": int(focus.group(1)), "focusHaloPx": int(focus.group(2)), "focusHaloAlpha": float(focus.group(3)),
        "rules": list(a11y_text),
    }

    # Performance
    p = T.PERF
    lcp = must(re.search(r"1er rendu utile\s*<\s*(\d+)\s*ms", p[0]), p[0], "LCP")
    inter = must(re.search(r"interaction\s*<\s*(\d+)\s*ms", p[0]), p[0], "interaction")
    frame = must(re.search(r"frame\s*(\d+(?:\.\d+)?)\s*ms\s*\((\d+)\s*Hz\)", p[0]), p[0], "frame")
    deep = must(re.search(r"Blur\s*>\s*(\d+)\s*px\s*limité à\s*(\d+)\s*surfaces", p[2]), p[2], "blur profond")
    ram = must(re.search(r"<\s*(\d+)\s*Go RAM", p[4]), p[4], "RAM")
    virt = must(re.search(r"Les listes\s*>\s*(\d+)\s*items", p[3]), p[3], "virtualisation")
    model["perf"] = {
        "lcpBudgetMs": int(lcp.group(1)), "interactionBudgetMs": int(inter.group(1)),
        "frameBudgetMs": float(frame.group(1)), "frameRateHz": int(frame.group(2)),
        "deepBlurThresholdPx": int(deep.group(1)), "deepSurfacesMax": int(deep.group(2)),
        "lowMemoryRamGb": int(ram.group(1)), "virtualizeListsAbove": int(virt.group(1)),
        "rules": list(p),
    }

    model["invariants"] = list(T.INVARIANTS)
    model["undefinedReferences"] = undefined_token_references(all_screens)
    return model


def undefined_token_references(all_screens):
    """Jetons cités par les fiches et absents de tokens.py (signalés, jamais inventés)."""
    defined = set()
    for _, rows in T.PALETTE.items():
        defined.update(name for name, _, _ in rows)
    defined.update(name for name, _ in T.RADII)
    defined.update(name for name, _, _ in T.TYPO["echelle"])
    defined.update(name for name, _, _ in T.MOTION["courbes"])
    defined.update("--spring-" + name for name, _, _, _ in T.MOTION["springs"])
    cited = {}
    for s in all_screens:
        text_parts = list(s.tokens)
        for token in text_parts:
            if token.startswith("--") and token not in defined:
                cited.setdefault(token, set()).add(s.code)
    result = []
    for token in sorted(cited):
        note = {
            "--mono": "Alias de la famille Mono (JetBrains Mono, TYPO.familles) — pas de jeton --mono explicite dans tokens.py.",
            "--table": "NON DÉFINIE dans tokens.py — aucune valeur créée.",
        }.get(token, NON_DEFINI_TEXT)
        result.append({"token": token, "note": note, "citedBy": len(cited[token])})
    return result


def build_sys_catalog():
    entries = []
    for screen in SYS_CONTENT.SCREENS:
        seg = screen.route.rsplit("/", 1)[-1]
        key = SYS_STATE_KEYS.get(seg, seg)
        hero = first_zone(screen, ("hero",))
        glyph_note, tone = None, None
        if hero is not None:
            gm = re.match(r"^Glyphe (.+?)\s*(?:\+|$)", hero.note)
            if gm:
                glyph_note = gm.group(1).strip()
                for word, mapped in SEAL_TONE_WORDS:
                    if re.search(r"(?<![\wéèàùâêîôûç])" + re.escape(word) + r"(?![\wéèàùâêîôûç])", glyph_note):
                        tone = mapped
                        break
        explanation_zone = hero or first_zone(screen, ("media",))
        explanation, placeholders = None, []
        if explanation_zone is not None:
            quotes = parse_quotes(explanation_zone.note)
            if quotes:
                # Majuscule initiale uniquement (typographie) : le texte reste celui de la fiche.
                explanation = quotes[0][:1].upper() + quotes[0][1:]
                if re.search(r"\d{1,2}:\d{2}", explanation):
                    explanation = re.sub(r"\d{1,2}:\d{2}", "{heure}", explanation)
                    placeholders = ["heure"]
        cta = first_zone(screen, ("cta",))
        actions = []
        if cta is not None:
            for label, style in re.findall(r"«\s*([^»]+?)\s*»\s*(or|fantôme|texte)\b", cta.note):
                actions.append({"label": label, "variant": EXIT_STYLE[style], "styleSource": style})
        listing = first_zone(screen, ("list",))
        entries.append({
            "key": key, "code": screen.code, "title": screen.title, "route": screen.route,
            "criticality": screen.criticality, "archetype": screen.archetype, "intent": screen.intent,
            "glyph": {"note": glyph_note, "tone": tone},
            "explanation": explanation, "explanationPlaceholders": placeholders,
            "exitActions": actions, "guaranteesLabel": listing.label if listing is not None else None,
            "rules": list(screen.rules),
        })
    if len(entries) != 15:
        raise SourceError(f"catalogue SYS : {len(entries)} au lieu de 15")
    return entries


def build_chrome():
    chrome = {
        "PUB": M.CHROME_PUB, "EMP": M.CHROME_APP, "PRE": PRE_CONTENT.CHROME_PRE, "ADM": M.CHROME_ADM,
        "RTC": M.CHROME_RTC, "SYS": SYS_CONTENT.CHROME_SYS, "FIN": FIN_CONTENT.CHROME_FIN,
    }
    out = {}
    for fam in FAMILY_ORDER:
        c = chrome[fam]
        out[fam] = {"appbar": c.get("appbar"), "dock": list(c.get("dock", [])) or None, "glyph": c["glyph"]}
    labels = {fam: {"label": M.FAMILIES[fam][0], "intent": M.FAMILIES[fam][1]} for fam in FAMILY_ORDER}
    return out, labels


def build_units():
    families = load_all()
    groups = {}
    for fam in FAMILY_ORDER:
        for screen in families[fam]:
            label = U.unit_of(screen.canon)
            groups.setdefault((fam, label), []).append(screen)
    units = []
    for (fam, label), screens in groups.items():
        screens = sorted(screens, key=lambda s: s.code)
        routes = []
        for s in screens:
            if s.route.startswith("/") and s.route not in routes:
                routes.append(s.route)
        units.append({"id": screens[0].code, "family": fam, "label": label,
                      "screenCodes": [s.code for s in screens],
                      "canons": sorted({s.canon for s in screens}), "routes": routes})
    units.sort(key=lambda u: (FAMILY_ORDER.index(u["family"]), int(u["id"].split("-")[1])))
    if len(units) != TOTAL_UNITS:
        raise SourceError(f"unités : {len(units)} au lieu de {TOTAL_UNITS}")
    counts = {fam: sum(1 for u in units if u["family"] == fam) for fam in FAMILY_ORDER}
    return units, counts


# ───────────────────────── Émetteurs ─────────────────────────

def emit_tokens_ts(model):
    src = ["design/llab/tokens.py", "design/llab/units.py"]
    out = [header(src)]
    out.append("export const NON_DEFINI = 'NON DÉFINIE' as const;\n")
    out.append("export type NonDefini = typeof NON_DEFINI;\n\n")
    out.append(export_const("TOKEN_SOURCE", {**model["brand"], "file": "design/llab/tokens.py"}, "Identité de la source (BRAND)."))
    out.append("\n")
    out.append(export_const("ARBITRAGE", {"etats": model["arbitrage"]["etats"], "canons": model["arbitrage"]["canons"],
                                          "unites": model["arbitrage"]["unites"]},
                            "211 états → 177 canons → 120 unités (design/llab/units.py)."))
    out.append("\n")
    out.append(export_const("PALETTE", model["palette"], "Palette « Basalte & Dorure » : lignes brutes de tokens.py."))
    out.append("\n")
    colors = {k: v for k, v in model["colors"].items()}
    out.append(export_const("COLOR", colors, "Valeurs de couleur par clé camelCase (ex. COLOR.gold500)."))
    out.append("\n")
    out.append(export_const("GLASS_LEVELS", model["glass"], "Verre 1→4 : teinte, flou (px) et saturation (%)."))
    out.append("\n")
    out.append(export_const("MATERIALS", model["materials"], "Matériaux : réfraction, rim-light, bruit, squircle."))
    out.append("\n")
    out.append(export_const("TYPE_FAMILIES", model["typeFamilies"], "Triade typographique (Display, Texte, Mono)."))
    out.append("\n")
    out.append(export_const("TYPE_SCALE", model["typeScale"], "Échelle typographique (taille, graisse, interligne, tracking em)."))
    out.append("\n")
    out.append(export_const("TYPE_RULES", model["typeRules"]))
    out.append("\n")
    out.append(export_const("SPACING", model["spacing"], "Unité 4 px, échelle, grilles mobile/tablette/desktop, rythme vertical."))
    out.append("\n")
    out.append(export_const("RADII", model["radii"], "Rayons et squircles (superellipse n = 4.2)."))
    out.append("\n")
    out.append(export_const("ELEVATION", model["elevation"], "Élévations E0→E4. haloColor = NON_DEFINI quand la source ne donne pas de valeur."))
    out.append("\n")
    out.append(export_const("SPRINGS", model["springs"], "Quatre ressorts officiels : snap, soft, heavy, pop."))
    out.append("\n")
    out.append(export_const("EASINGS", model["easings"], "Courbes cubic-bezier officielles."))
    out.append("\n")
    out.append(export_const("DURATIONS_MS", model["durations"], "Durées officielles (ms) et stagger plafonné."))
    out.append("\n")
    out.append(export_const("MOTION_RULES", model["motionRules"]))
    out.append("\n")
    out.append(export_const("HAPTICS", model["haptics"], "Intentions haptiques (non actionnées sur le Web : aucune valeur définie)."))
    out.append("\n")
    out.append(export_const("COMPONENT_REGISTRY", model["components"], "Registre C-01 → C-20."))
    out.append("\n")
    out.append(export_const("ICONOGRAPHY", model["icons"]))
    out.append("\n")
    out.append(export_const("SOUND_RULES", model["sound"]))
    out.append("\n")
    out.append(export_const("DATAVIZ_RULES", model["dataviz"]))
    out.append("\n")
    out.append(export_const("A11Y", model["a11y"], "Accessibilité : contrastes, cibles tactiles, focus."))
    out.append("\n")
    out.append(export_const("PERF", model["perf"], "Budgets de performance (non mesurés dans cette fondation)."))
    out.append("\n")
    out.append(export_const("INVARIANTS", model["invariants"], "Invariants produit INV-1 → INV-6."))
    out.append("\n")
    out.append(export_const("UNDEFINED_TOKEN_REFERENCES", model["undefinedReferences"],
                            "Jetons cités par les fiches et absents de tokens.py : signalés, jamais créés."))
    return "".join(out)


def emit_tokens_css(model):
    lines = ["/* GÉNÉRÉ PAR scripts/design/generate-frontend-tokens.py — NE PAS ÉDITER À LA MAIN.",
             "   Source : design/llab/tokens.py. Régénérer : npm run design:tokens. */", ":root {"]

    def group(title):
        lines.append(f"  /* {title} */")

    for g in model["palette"]:
        group(g["label"])
        for row in g["rows"]:
            lines.append(f"  {row['cssVar']}: {row['value']};")
    group("Verre (niveaux 1→4) : teinte, flou, saturation")
    for lvl, row in model["glass"].items():
        lines.append(f"  --glass-{lvl}-tint: {row['tint']};")
        lines.append(f"  --glass-{lvl}-blur: {row['blurPx']}px;")
        lines.append(f"  --glass-{lvl}-saturate: {row['saturatePct']}%;")
    group("Matériaux")
    mat = model["materials"]
    lines.append(f"  --rim-alpha-min: {mat['rimLight']['alphaMin']};")
    lines.append(f"  --rim-alpha-max: {mat['rimLight']['alphaMax']};")
    lines.append(f"  --grain-opacity: {mat['noise']['opacity']};")
    lines.append(f"  --grain-base-frequency: {mat['noise']['baseFrequency']};")
    group("Typographie : familles")
    fam_names = {"Display": "--family-display", "Texte": "--family-text", "Mono": "--family-mono"}
    for fam in model["typeFamilies"]:
        lines.append(f"  {fam_names[fam['role']]}: '{fam['family']}';")
    group("Typographie : échelle")
    for row in model["typeScale"]:
        base = row["cssName"]
        lines.append(f"  {base}-size: {row['sizePx']}px;")
        lines.append(f"  {base}-weight: {row['weight']};")
        lines.append(f"  {base}-line-height: {row['lineHeightPx']}px;")
        lines.append(f"  {base}-tracking: {row['trackingEm']}em;")
    group("Espacement (unité 4 px)")
    lines.append(f"  --space-unit: {model['spacing']['baseUnitPx']}px;")
    for n in model["spacing"]["scalePx"]:
        lines.append(f"  --space-{n}: {n}px;")
    group("Grille (mobile / tablette / desktop)")
    for name, key in (("mobile", "mobile"), ("tablet", "tablet"), ("desktop", "desktop")):
        g = model["spacing"]["grid"][key]
        lines.append(f"  --grid-{name}-columns: {g['columns']};")
        lines.append(f"  --grid-{name}-gutter: {g['gutterPx']}px;")
        lines.append(f"  --grid-{name}-margin: {g['marginPx']}px;")
    lines.append(f"  --grid-max-width: {model['spacing']['grid']['desktop']['maxWidthPx']}px;")
    group("Rayons et squircles")
    for r in model["radii"]:
        lines.append(f"  {r['cssVar']}: {r['px']}px;")
    sq_exp = next(r["exponent"] for r in model["radii"] if r["kind"] == "squircle")
    lines.append(f"  --squircle-exponent: {sq_exp};")
    group("Élévation (ombres) et rim")
    for e in model["elevation"]:
        if e["level"] == 0:
            continue
        lines.append(f"  --elevation-{e['level']}: {e['shadow']};")
        lines.append(f"  --rim-alpha-{e['level']}: {e['rimAlpha']};")
    group("Mouvement : courbes et durées")
    for ease in model["easings"]:
        b = ease["bezier"]
        lines.append(f"  {ease['cssVar']}: cubic-bezier({b[0]}, {b[1]}, {b[2]}, {b[3]});")
    d = model["durations"]
    lines.append(f"  --duration-micro: {d['micro']}ms;")
    lines.append(f"  --duration-base: {d['base']}ms;")
    lines.append(f"  --duration-page: {d['page']}ms;")
    lines.append(f"  --duration-cinematique: {d['cinematique']}ms;")
    lines.append(f"  --duration-halo-pulse: {d['haloPulseMs']}ms;")
    group("Accessibilité : focus et cibles tactiles")
    a = model["a11y"]
    lines.append(f"  --focus-ring-width: {a['focusRingPx']}px;")
    lines.append(f"  --focus-halo-width: {a['focusHaloPx']}px;")
    lines.append(f"  --focus-halo-alpha: {a['focusHaloAlpha']};")
    lines.append(f"  --touch-target-mobile: {a['touchTargetMobilePx']}px;")
    lines.append(f"  --touch-target-desktop: {a['touchTargetDesktopPx']}px;")
    lines.append("}")
    return "\n".join(lines) + "\n"


def emit_state_catalog_ts(entries):
    out = [header(["design/llab/content/sys.py (SYS-01 → SYS-15)"],
                  "Libellés, explications et actions de sortie : copiés de la fiche par le générateur, jamais saisis à la main.")]
    out.append("/** Clés d'état StateGuard (C-19). */\n")
    out.append("export const STATE_GUARD_KEYS = " + ts_literal([e["key"] for e in entries]) + " as const;\n")
    out.append("export type StateGuardKey = (typeof STATE_GUARD_KEYS)[number];\n\n")
    out.append(export_const("STATE_GUARD_CATALOG", entries, "Catalogue SYS-01→15 (une entrée par fiche)."))
    return "".join(out)


def emit_chrome_ts(chrome, labels):
    out = [header(["design/llab/model.py", "design/llab/content/*.py (CHROME_*)"])]
    out.append(export_const("FAMILY_ORDER", FAMILY_ORDER, "Ordre canonique des familles."))
    out.append("\n")
    out.append(export_const("FAMILY_LABELS", labels, "Libellés et intentions des familles (model.FAMILIES)."))
    out.append("\n")
    out.append(export_const("CHROME_BY_FAMILY", chrome, "Chrome par défaut de chaque famille (appbar, dock, glyphe)."))
    return "".join(out)


def emit_units_ts(units, counts):
    out = [header(["design/llab/units.py", "design/llab/content/*.py"],
                  "Les 120 unités de production. Statut d'intégration : voir src/routing/integration.ts (NON_INTEGRE par défaut).")]
    out.append(export_const("TOTAL_UNITS", TOTAL_UNITS))
    out.append(export_const("UNIT_COUNTS_BY_FAMILY", counts))
    out.append("\nexport interface ProductionUnit {\n"
               "  readonly id: string;\n"
               "  readonly family: 'PUB' | 'EMP' | 'PRE' | 'ADM' | 'RTC' | 'SYS' | 'FIN';\n"
               "  readonly label: string;\n"
               "  readonly screenCodes: readonly string[];\n"
               "  readonly canons: readonly string[];\n"
               "  readonly routes: readonly string[];\n"
               "}\n\n")
    out.append("/** Une unité par ligne : id = plus petit code de fiche de l'unité. */\n")
    out.append("export const PRODUCTION_UNITS: readonly ProductionUnit[] = [\n")
    for u in units:
        out.append("  " + ts_inline(u) + ",\n")
    out.append("] as const;\n")
    return "".join(out)


def generate_all():
    model = build_tokens_model()
    sys_entries = build_sys_catalog()
    chrome, labels = build_chrome()
    units, counts = build_units()
    return {
        OUT_DIR / "tokens.ts": emit_tokens_ts(model),
        OUT_DIR / "tokens.css": emit_tokens_css(model),
        OUT_DIR / "stateGuardCatalog.ts": emit_state_catalog_ts(sys_entries),
        OUT_DIR / "chrome.ts": emit_chrome_ts(chrome, labels),
        OUT_DIR / "productionUnits.ts": emit_units_ts(units, counts),
    }, model, sys_entries, units, counts


def main(argv):
    check = "--check" in argv
    outputs, model, sys_entries, units, counts = generate_all()
    if check:
        drift = []
        for path, content in outputs.items():
            current = path.read_text(encoding="utf-8") if path.exists() else None
            if current != content:
                drift.append(str(path.relative_to(ROOT)))
        if drift:
            print("DÉRIVE : fichiers générés non à jour → " + ", ".join(drift))
            print("Régénérer : npm run design:tokens")
            return 1
        print(f"OK : {len(outputs)} fichiers générés à jour.")
        return 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, content in outputs.items():
        path.write_text(content, encoding="utf-8", newline="\n")
        print("écrit :", path.relative_to(ROOT))
    print(f"arbitrage : {model['arbitrage']['etats']} états → {model['arbitrage']['canons']} canons → {model['arbitrage']['unites']} unités")
    print("unités par famille :", counts)
    print("catalogue SYS :", len(sys_entries), "états ; jetons non définis signalés :",
          [r["token"] for r in model["undefinedReferences"]])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except SourceError as exc:
        print("ERREUR DE SOURCE :", exc, file=sys.stderr)
        sys.exit(2)
