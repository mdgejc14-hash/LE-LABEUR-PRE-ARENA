# -*- coding: utf-8 -*-
"""
LE LABEUR — Moteur de rendu documentaire
========================================
Un seul modèle de blocs → trois sorties : Markdown, HTML (autonome, fonts
embarquées), PDF (WeasyPrint, thème Cyber-Luxe Organique).
"""
from __future__ import annotations
from ..archetypes import build_wireframe
from ..tokens import (PALETTE, MATERIALS, TYPO, SPACING, RADII, ELEVATION,
                      MOTION, COMPONENTS, ICONO, SOUND, DATAVIZ, A11Y, PERF,
                      INVARIANTS, BRAND)
from ..model import FAMILIES

# ── Blocs ────────────────────────────────────────────────────────────────────
def h(level, text): return ("h", level, text)
def p(text): return ("p", text)
def ul(items): return ("ul", items)
def ol(items): return ("ol", items)
def table(head, rows): return ("table", head, rows)
def wire(text): return ("wire", text)
def code(lang, text): return ("code", lang, text)
def callout(variant, title, text): return ("callout", variant, title, text)
def pagebreak(): return ("pagebreak",)
def kv(pairs): return ("kv", pairs)


def esc(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


# ── Sérialisation Markdown ───────────────────────────────────────────────────
def blocks_to_md(blocks):
    out = []
    for b in blocks:
        k = b[0]
        if k == "h":
            out.append("#" * b[1] + " " + b[2] + "\n")
        elif k == "p":
            out.append(b[1] + "\n")
        elif k == "ul":
            out.append("\n".join("- " + i for i in b[1]) + "\n")
        elif k == "ol":
            out.append("\n".join(f"{i+1}. {v}" for i, v in enumerate(b[1])) + "\n")
        elif k == "table":
            head, rows = b[1], b[2]
            out.append("| " + " | ".join(head) + " |")
            out.append("|" + "|".join(["---"] * len(head)) + "|")
            for r in rows:
                out.append("| " + " | ".join(str(c) for c in r) + " |")
            out.append("")
        elif k == "wire":
            out.append("```text\n" + b[1] + "\n```\n")
        elif k == "code":
            out.append("```" + b[1] + "\n" + b[2] + "\n```\n")
        elif k == "callout":
            out.append(f"> **{b[2]}** — {b[3]}\n")
        elif k == "kv":
            out.append("\n".join(f"- **{a}** : {v2}" for a, v2 in b[1]) + "\n")
        elif k == "pagebreak":
            out.append("\n<div style=\"page-break-after: always\"></div>\n")
    return "\n".join(out)


# ── Markdown inline → HTML (p, listes, tableaux, callouts, kv) ───────────────
_INLINE_BOLD = __import__("re").compile(r"\*\*(.+?)\*\*", __import__("re").S)
_INLINE_CODE = __import__("re").compile(r"`([^`]+?)`")
_INLINE_EM = __import__("re").compile(r"(?<![\w*])\*([^*\n]+?)\*(?![\w*])")


def md_inline(text):
    """Convertit **gras**, `code` et *italique* en HTML (échappement d'abord)."""
    t = esc(str(text))
    t = _INLINE_CODE.sub(r"<code>\1</code>", t)
    t = _INLINE_BOLD.sub(r"<strong>\1</strong>", t)
    t = _INLINE_EM.sub(r"<em>\1</em>", t)
    return t


# ── Sérialisation HTML ───────────────────────────────────────────────────────
def blocks_to_html(blocks, id_counter=None):
    out = []
    for b in blocks:
        k = b[0]
        if k == "h":
            lvl = b[1]
            slug = "".join(ch if ch.isalnum() else "-" for ch in b[2].lower())[:64]
            out.append(f'<h{lvl} id="{slug}">{esc(b[2])}</h{lvl}>')
        elif k == "p":
            out.append(f"<p>{md_inline(b[1])}</p>")
        elif k == "ul":
            out.append("<ul>" + "".join(f"<li>{md_inline(i)}</li>" for i in b[1]) + "</ul>")
        elif k == "ol":
            out.append("<ol>" + "".join(f"<li>{md_inline(i)}</li>" for i in b[1]) + "</ol>")
        elif k == "table":
            head, rows = b[1], b[2]
            th = "".join(f"<th>{md_inline(c)}</th>" for c in head)
            tr = "".join("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in r) + "</tr>" for r in rows)
            out.append(f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>")
        elif k == "wire":
            out.append(f'<pre class="wire">{esc(b[1])}</pre>')
        elif k == "code":
            out.append(f'<pre class="code" data-lang="{esc(b[1])}">{esc(b[2])}</pre>')
        elif k == "callout":
            out.append(f'<div class="callout {b[1]}"><strong>{esc(b[2])}</strong><span>{md_inline(b[3])}</span></div>')
        elif k == "kv":
            out.append('<dl class="kv">' + "".join(
                f"<dt>{esc(a)}</dt><dd>{md_inline(v2)}</dd>" for a, v2 in b[1]) + "</dl>")
        elif k == "pagebreak":
            out.append('<div class="pagebreak"></div>')
    return "\n".join(out)


# ── Fiches écran (construction de blocs) ─────────────────────────────────────
def screen_blocks(s, wire_rows=26):
    b = []
    b.append(h(4, f"{s.code} · {s.title}"))
    b.append(kv([
        ("Famille", f"{s.family} — {FAMILIES[s.family][0]}"),
        ("Grappe", s.cluster),
        ("Route", f"`{s.route}`"),
        ("Rôle", s.role),
        ("Criticité", s.criticality),
        ("Archétype", s.archetype),
        ("Canon", s.canon + (f" _(variante de {s.variant_of})_" if s.variant_of else "")),
    ]))
    b.append(p("**Intention :** " + s.intent))

    b.append(h(5, "Maquette textuelle de composition"))
    b.append(wire(build_wireframe(s, wire_rows)))

    b.append(h(5, "Composition — zones (Z1→Zn)"))
    rows = []
    for z in s.zones:
        rows.append([z.idx, z.label, f"`{z.kind}`", z.weight, z.note])
    b.append(table(["Z", "Zone", "Nature", "Poids", "Traitement visuel & hiérarchie"], rows))

    b.append(h(5, "Composants mobilisés"))
    b.append(ul([f"**{c[0]}** — {c[1]}" for c in s.comps]))

    b.append(h(5, "États d'interface et bascules"))
    b.append(ul([f"**{a}** → {c}" for a, c in s.states]))

    b.append(h(5, "Mouvement & physique"))
    b.append(ul([f"**{a}** — {c}" for a, c in s.motion]))

    b.append(h(5, "Règles métier contraignantes"))
    b.append(ul(s.rules))

    if s.tokens:
        b.append(h(5, "Tokens liés"))
        b.append(p(" · ".join(f"`{t}`" for t in s.tokens)))

    if s.api:
        b.append(h(5, "Contrats d'API & données"))
        b.append(ul([f"`{a}`" for a in s.api]))

    if s.tech:
        b.append(h(5, "Exécution technique"))
        b.append(p(s.tech))

    if s.a11y:
        b.append(h(5, "Accessibilité"))
        b.append(ul(s.a11y))

    b.append(("hr",))
    return b


def blocks_to_md_hr(b):
    return b


# patch: handle "hr" in serializers
_old_md = blocks_to_md
def blocks_to_md(blocks):  # noqa: F811
    parts = []
    buf = []
    for b in blocks:
        if b[0] == "hr":
            parts.append(_old_md(buf)); buf = []; parts.append("\n---\n")
        else:
            buf.append(b)
    parts.append(_old_md(buf))
    return "\n".join(parts)


_old_html = blocks_to_html
def blocks_to_html(blocks):  # noqa: F811
    parts = []
    buf = []
    for b in blocks:
        if b[0] == "hr":
            parts.append(_old_html(buf)); buf = []; parts.append("<hr/>")
        else:
            buf.append(b)
    parts.append(_old_html(buf))
    return "\n".join(parts)
