# -*- coding: utf-8 -*-
"""
LE LABEUR — Moteur de maquettes textuelles (wireframes ASCII)
=============================================================
Chaque écran de la nomenclature est rendu sous forme de maquette textuelle de
composition : cadre d'appareil 390×844 (échelle 1 ligne ≈ 26 px), barre d'état,
chrome de navigation (appbar / dock / aucun), puis zones de composition Z1..Zn.
"""

W = 64  # largeur interne du cadre
IN = W - 2


def _center(text, width=IN):
    text = text[:width]
    pad = width - len(text)
    left = pad // 2
    return " " * left + text + " " * (pad - left)


def _fit(text, width=IN):
    if len(text) > width:
        return text[: width - 1] + "…"
    return text + " " * (width - len(text))


# ── Générateurs de remplissage par nature de zone ────────────────────────────
def _tag(label, n=22):
    """Étiquette courte dérivée du label de zone, pour annoter le croquis."""
    t = label.upper()
    t = t.replace("É","E").replace("È","E").replace("À","A").replace("Ç","C").replace("Ô","O").replace("Î","I").replace("Û","U").replace("Ê","E")
    if len(t) <= n:
        return t
    cut = t[:n]
    if " " in cut and cut.rfind(" ") >= n * 0.55:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" -—–·:,").rstrip()



def _hdr(title, inner=40, left="┌", right="┐", ch="─"):
    t = ("─ " + title + " ")
    return left + t.ljust(inner, ch) + right


def _boxline(text, inner=42):
    t = " " + text
    return "║" + t.ljust(inner) + "║"


def _midline(text, inner=42):
    t = " " + text
    return "│" + t.ljust(inner) + "│"


def filler(kind, rows, label=""):
    """Croquis textuel d'une zone. Varie selon `kind` et s'annote du `label`."""
    rows = max(2, rows)
    T = _tag(label)
    out = []

    def take(lst, n):
        out_l = (lst * (n // len(lst) + 1))[:n]
        return out_l

    if kind == "hero":
        pool = [
            "╭─────╮     " + T.ljust(30),
            "│ ◈   │     ██████████  ████████  ██",
            "╰─────╯     ····· sous-ligne contextuelle ············",
            "            [ chip or ]  [ chip émeraude ]",
        ]
        out = take(pool, rows)
    elif kind == "kpi":
        pool = [
            "┌───────────┐ ┌───────────┐ ┌───────────┐",
            "│  ██████   │ │  ██████   │ │  ██████   │",
            "│ " + T[:10].ljust(10) + "│ │ " + "indicateur".ljust(10) + "│ │ " + "indicateur".ljust(10) + "│",
            "└───────────┘ └───────────┘ └───────────┘",
        ]
        out = take(pool, rows)
    elif kind == "list":
        pool = [
            "▣ ██████████████████████████████████  ▓▓▓ ▸",
            "  · " + T[:24].ljust(24) + " ⌾ meta ⌾",
            "▣ ██████████████████████████████████  ▓▓▓ ▸",
            "  · métadonnée · ref · statut           ⌾",
            "▣ ██████████████████████████████████  ▓▓▓ ▸",
            "  · métadonnée · ref · statut           ⌾",
        ]
        out = take(pool, rows)
    elif kind == "form":
        pool = [
            _hdr(T[:34], 40),
            _midline("saisie…  ▏", 40) if False else "│ saisie…" + " " * 32 + "│",
            "└" + "─" * 40 + "┘",
            _hdr("champ suivant", 40),
            "│ saisie…" + " " * 24 + "✓/✎" + " " * 4 + "│",
            "└" + "─" * 40 + "┘",
        ]
        out = take(pool, rows)
    elif kind == "price":
        pool = [
            "  PRIX PRESTATAIRE ................. 000 000 F",
            "  + FRAIS SAAS LE LABEUR ........... 00 000 F",
            "  ─────────────────────────────────────────────",
            "  = TOTAL CLIENT .................. 000 000 F",
            "  " + ("· " + T)[:44].ljust(44) + " ",
        ]
        out = take(pool, rows)
    elif kind == "verdict":
        pool = [
            "       ╭─────────────╮            ",
            "       │    ◈  " + T[:7].ljust(7) + " │   décision",
            "       ╰─────────────╯   motif · article · horodatage",
            "       motifs détaillés ··············· ▾ voir détail",
        ]
        out = take(pool, rows)
    elif kind == "timeline":
        pool = [
            " ●───────●───────◉───────○───────○      ",
            " J1      J2     ACTIF    J4      J5     ",
            " preuve  preuve  ◔ " + T[:8].ljust(8) + "  attente attente",
        ]
        out = take(pool, rows)
    elif kind == "table":
        pool = [
            "┌────────────┬───────────┬───────────────┐",
            "│ " + T[:10].ljust(10) + " │ colonne B │ colonne C     │",
            "├────────────┼───────────┼───────────────┤",
            "│ valeur     │ ██████    │ ▓▓▓▓▓         │",
            "│ valeur     │ ██████    │ ▓▓▓▓▓         │",
            "└────────────┴───────────┴───────────────┘",
        ]
        out = take(pool, rows)
    elif kind == "chat":
        pool = [
            "┌──────────────────────────────┐          ",
            "│ " + T[:22].ljust(22) + "     │   acteur A",
            "└──────────────────────────────┘          ",
            "          ┌──────────────────────────────┐",
            "   acteur B │ message · horodatage        │",
            "          └──────────────────────────────┘",
        ]
        out = take(pool, rows)
    elif kind == "media":
        pool = [
            "┌" + "─" * 42 + "┐",
            "│" + ("▓▓▓  " + T[:14] + "  ▓▓▓").center(42) + "│",
            "│  ⌾ PIP local" + " " * 14 + "▮▮▮ réseau   ⌁ durée │",
            "└" + "─" * 42 + "┘",
        ]
        out = take(pool, rows)
    elif kind == "cta":
        pool = [
            "╔" + "═" * 42 + "╗",
            _boxline(T[:24] + " " * max(0, 34 - len(T[:24])) + "▸", 42),
            "╚" + "═" * 42 + "╝",
            "  action secondaire (ghost) · lien tertiaire",
        ]
        out = take(pool, rows)
    elif kind == "canvas":
        pool = [
            "  · ˚ ·   ˙ ·˚    ·  ˚ ·   ˙  · ˚  ·  ˙  ",
            "˚  ·  ˙  ·  ˚  ·  ˙   · ˚  ·   ˙ ·   ˚ ·",
            " · ˙ · ˚   ·  ˙ ·  ˚ ·  ˙  · ˚   · ˙ ·  ",
        ]
        out = take(pool, rows)
    elif kind == "sign":
        pool = [
            " ✎ SIGNATURE A ──────────────  ───────────── ✎ SIGNATURE B",
            " horodatage T1 · empreinte     horodatage T2 · empreinte",
            " " + T[:24].ljust(24) + "  R2 · SHA-256 · a91f…c3",
        ]
        out = take(pool, rows)
    elif kind == "doc":
        pool = [
            "   ╔════════════╗╔════════════╗   ",
            "   ║ ▤  PAGE 1  ║║ ▤  PAGE 2  ║  " + T[:6],
            "   ║  R2 · hash ║║  R2 · hash ║   ",
            "   ╚════════════╝╚════════════╝   ",
        ]
        out = take(pool, rows)
    elif kind == "chips":
        pool = [
            ("( " + T[:10] + " ) ( ◈ Or ) ( ✓ Émeraude ) ( ▣ Basalte )")[:46],
            " ┌───────────────────────────────────────────┐",
            " │ filtre actif ····· ⌄ ·····  réinitialiser │",
            " └───────────────────────────────────────────┘",
        ]
        out = take(pool, rows)
    elif kind == "ring":
        pool = [
            "        ╭─────────╮               ",
            "        │  ○ " + T[:4].ljust(4) + " │   SCORE / ANNEAU   ",
            "        ╰─────────╯   décomposition ▾  ",
        ]
        out = take(pool, rows)
    elif kind == "sec":
        pool = [
            " ▲ " + T[:10].ljust(10) + " sévérité HAUTE  · 00:14  ▸",
            " ▲ événement           sévérité MOY.   · 00:31  ▸",
            " ▲ événement           sévérité BASSE  · 02:10  ▸",
        ]
        out = take(pool, rows)
    elif kind == "node":
        pool = [
            (" [CDN CF] ─▶ [WORKER EDGE] ─▶ [API " + T[:6] + "]")[:44],
            "      │             │              │",
            " [R2 BUCKET] ─ [HYPERDRIVE] ─ [POSTGRES]",
        ]
        out = take(pool, rows)
    elif kind == "queue":
        pool = [
            " #a91f  job.payout.sync     tent.3/5  ◕ 00:42  ⇡",
            " #a920  " + T[:18].ljust(18) + "  tent.1/5  ◕ 00:07  ⇡",
            " #a921  job.dead.letter     tent.5/5  ✕ DLQ    ↺",
        ]
        out = take(pool, rows)
    elif kind == "empty":
        pool = [
            "              ╭─────────────╮            ",
            "              │   ◌  vide    │   " + T[:8],
            "              ╰─────────────╯            ",
            "        état vide explicatif + sortie    ",
        ]
        out = take(pool, rows)
    elif kind == "streak":
        pool = [
            " ███▏ ███▏ ███▏ ███▏ ███▏ ███▏ ███▏  7 j",
            " l   m   m   j   v   s   d   · série " + T[:8],
            " ─────────────────────────────────────────",
        ]
        out = take(pool, rows)
    elif kind == "gauge":
        pool = [
            " ╭─────────────────────────────────────────╮",
            " │ " + T[:16].ljust(16) + "  ▰▰▰▰▰▰▱▱▱▱  62 % │",
            " ╰─────────────────────────────────────────╯",
        ]
        out = take(pool, rows)
    else:
        pool = [
            "┌───────────────────────────────────────────┐",
            "│ " + T[:41].ljust(41) + " │",
            "└───────────────────────────────────────────┘",
        ]
        out = take(pool, rows)

    return [ _fit(l) for l in out ]


# ── Chrome de l'appareil ─────────────────────────────────────────────────────
def _status_bar(family_glyph="◈"):
    return _fit(" 9:41        ●●●  ▮▮▮▮▮  ⌁        " + family_glyph + " LE LABEUR       100% ⌁")


def _appbar(title, actions="⌕   ⌾³"):
    l = " " + title
    r = actions + " "
    return _fit(l.ljust(IN - len(r)) + r)


def _dock(items, active=0):
    seg = []
    for i, it in enumerate(items):
        seg.append(("❰" + it + "❱") if i == active else (" " + it + " "))
    line = "  ".join(seg)
    return _center(line)


# ── Générateur principal ─────────────────────────────────────────────────────
def build_wireframe(screen, total_rows=30):
    """
    screen : objet avec .wire_chrome (dict) et .zones (liste de Zone).
    Zone : (kind, label, weight, note)
    """
    chrome = screen.wire_chrome or {}
    dock_items = chrome.get("dock")
    appbar = chrome.get("appbar")
    zones = screen.zones

    # Répartition des lignes de contenu selon le poids des zones
    weights = [max(1, z.weight) for z in zones]
    room = total_rows - (2 if dock_items else 0) - (2 if appbar else 0)
    zone_rows = []
    acc = 0.0
    for w in weights:
        share = w / sum(weights) * room
        rows = max(2, int(round(share)))
        zone_rows.append(rows)
    # ajustement pour tenir exactement `room`
    while sum(zone_rows) > room:
        i = zone_rows.index(max(zone_rows))
        if zone_rows[i] > 2:
            zone_rows[i] -= 1
        else:
            break
    while sum(zone_rows) < room:
        i = zone_rows.index(min(zone_rows))
        zone_rows[i] += 1

    out = []
    out.append("╔" + "═" * IN + "╗")
    out.append("║" + _fit(_status_bar(chrome.get("glyph", "◈"))) + "║")
    out.append("╟" + "─" * IN + "╢")
    if appbar:
        out.append("║" + _appbar(appbar) + "║")
    for z, n in zip(zones, zone_rows):
        head = f"▐ Z{z.idx} · {z.label} "
        out.append("║" + _fit(head[:IN].ljust(IN, "─")) + "║")
        for line in filler(z.kind, n, z.label):
            out.append("║" + line + "║")
    if dock_items:
        out.append("╟" + "─" * IN + "╢")
        out.append("║" + _dock(dock_items, chrome.get("dock_active", 0)) + "║")
    out.append("╚" + "═" * IN + "╝")
    return "\n".join(out)
