# -*- coding: utf-8 -*-
"""Export multi-format : MD, HTML autonome, PDF, CSV, JSON, tokens."""
import base64, csv, json, os, pathlib
from .blocks import blocks_to_md, blocks_to_html, screen_blocks
from .document import FAMILY_INTROS, sec_family
from ..tokens import (PALETTE, MATERIALS, TYPO, SPACING, RADII, ELEVATION,
                      MOTION, COMPONENTS, BRAND, INVARIANTS)

HERE = pathlib.Path(__file__).resolve().parent.parent.parent    # /home/user/le-labeur
OUT = HERE / "out"
FONTS = HERE / "assets" / "fonts"

FONT_FACES = [
    ("Space Grotesk", "300 700", "SpaceGrotesk-var.ttf"),
    ("Inter", "400", "Inter-Regular.ttf"),
    ("Inter", "500", "Inter-Medium.ttf"),
    ("Inter", "600", "Inter-SemiBold.ttf"),
    ("Inter", "700", "Inter-Bold.ttf"),
    ("JetBrains Mono", "400", "JetBrainsMono-Regular.ttf"),
    ("JetBrains Mono", "700", "JetBrainsMono-Bold.ttf"),
]

# Police de secours explicite : couvre les glyphes décoratifs absents d'Inter / JetBrains Mono.
FALLBACK_STACK = "'Inter','DejaVu Sans','Noto Sans','Liberation Sans',system-ui,sans-serif"


def font_face_css(embed=True):
    css = []
    for fam, weight, fname in FONT_FACES:
        path = FONTS / fname
        if not path.exists():
            continue
        if embed:
            data = base64.b64encode(path.read_bytes()).decode()
            src = f"url(data:font/ttf;base64,{data}) format('truetype')"
        else:
            src = f"url('file://{path}') format('truetype')"
        css.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{weight};src:{src};font-display:swap;}}")
    return "\n".join(css)


def theme_css(embed_fonts=True, print_mode=False):
    f = font_face_css(embed_fonts)
    page = """
@page { size: A4; margin: 14mm 12mm 16mm 12mm; background: #050507;
        @bottom-center { content: "Master Design Document — LE LABEUR · " counter(page) " / " counter(pages);
                         font-family: 'Inter'; font-size: 7pt; color: #6E6E7E; } }
""" if print_mode else ""
    return f + page + """
:root{
  --surface-0:#050507; --surface-1:#0A0A0F; --surface-2:#101018; --surface-3:#17171F; --surface-4:#1E1E28;
  --gold-200:#FFE9BD; --gold-300:#FFD47A; --gold-400:#E5A93C; --gold-500:#FFB800; --gold-600:#C98F1F;
  --emerald-200:#B8FFE4; --emerald-400:#3BFFB8; --emerald-500:#00F5A0; --emerald-600:#00C97F;
  --amber-500:#FFB020; --clay-500:#FF5C7A; --violet-500:#7A5CFF; --cyan-500:#5CC8FF; --slate-500:#6E6E7E;
  --text-hi:#F5F5F7; --text-mid:#A9A9B8; --text-lo:#6E6E7E;
  --stroke-sub:rgba(255,255,255,.08); --stroke-mid:rgba(255,255,255,.14);
}
*{box-sizing:border-box}
html{background:var(--surface-0)}
body{margin:0;background:
  radial-gradient(1100px 520px at 12% -6%, rgba(255,184,0,.055), transparent 62%),
  radial-gradient(900px 460px at 92% 4%, rgba(0,245,160,.05), transparent 60%),
  var(--surface-0);
  color:var(--text-hi); font-family:'Inter','DejaVu Sans',system-ui,sans-serif; font-size:15px; line-height:1.58;
  -webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px;margin:0 auto;padding:56px 28px 120px}
h1{font-family:'Space Grotesk';font-size:44px;line-height:1.06;letter-spacing:-.02em;margin:.2em 0 .35em;
   color:#FFD47A;text-shadow:0 0 26px rgba(255,184,0,.22)}
h1::after{content:"";display:block;width:148px;height:4px;margin-top:12px;border-radius:2px;
   background:linear-gradient(90deg,#FFE9BD,#FFB800 46%,#C98F1F)}
h2{font-family:'Space Grotesk';font-size:30px;letter-spacing:-.01em;margin:2.1em 0 .5em;color:var(--gold-300);
   border-bottom:1px solid var(--stroke-sub);padding-bottom:.28em}
h3{font-family:'Space Grotesk';font-size:21px;margin:1.7em 0 .45em;color:var(--text-hi)}
h4{font-family:'Space Grotesk';font-size:18px;margin:1.5em 0 .4em;color:var(--emerald-200)}
h5{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--text-lo);margin:1.15em 0 .3em;font-weight:700}
p{margin:.55em 0;color:var(--text-mid)}
strong{color:var(--text-hi)}
a{color:var(--cyan-500)}
hr{border:0;border-top:1px solid var(--stroke-sub);margin:2em 0}
ul,ol{color:var(--text-mid);padding-left:1.25em;margin:.5em 0}
li{margin:.26em 0}
li::marker{color:var(--gold-500)}
table{width:100%;border-collapse:collapse;margin:1em 0;font-size:13px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold-300);
   border-bottom:1px solid rgba(255,184,0,.3);padding:8px 10px;background:rgba(255,255,255,.02)}
td{padding:7px 10px;border-bottom:1px solid var(--stroke-sub);color:var(--text-mid);vertical-align:top}
tr:hover td{background:rgba(255,255,255,.022)}
pre.wire{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;line-height:1.24;color:#CFCFDD;
  background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012));
  border:1px solid var(--stroke-sub);border-radius:14px;padding:16px 18px;overflow-x:auto;white-space:pre;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
pre.code{font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5;color:#E8E8F0;
  background:#0A0A0F;border:1px solid var(--stroke-sub);border-left:2px solid var(--gold-500);
  border-radius:12px;padding:16px 18px;overflow-x:auto;white-space:pre}
code{font-family:'JetBrains Mono',monospace;font-size:.88em;color:var(--emerald-200);background:rgba(0,245,160,.07);
  border:1px solid rgba(0,245,160,.16);border-radius:6px;padding:1px 5px}
pre code{background:none;border:0;padding:0;color:inherit}
.callout{border-radius:14px;padding:14px 16px;margin:1em 0;border:1px solid var(--stroke-mid);
  background:rgba(255,255,255,.03);display:block}
.callout strong{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px}
.callout.gold{border-left:3px solid var(--gold-500);background:linear-gradient(90deg,rgba(255,184,0,.09),rgba(255,184,0,.02))}
.callout.gold strong{color:var(--gold-300)}
.callout.emerald{border-left:3px solid var(--emerald-500);background:linear-gradient(90deg,rgba(0,245,160,.09),rgba(0,245,160,.02))}
.callout.emerald strong{color:var(--emerald-200)}
.callout.clay{border-left:3px solid var(--clay-500);background:linear-gradient(90deg,rgba(255,92,122,.1),rgba(255,92,122,.02))}
.callout.clay strong{color:#FFB3C2}
.callout span{color:var(--text-mid)}
dl.kv{display:grid;grid-template-columns:190px 1fr;gap:2px 14px;margin:.8em 0 1.2em;font-size:13px}
dl.kv dt{color:var(--text-lo);text-transform:uppercase;font-size:10.5px;letter-spacing:.1em;padding-top:3px}
dl.kv dd{margin:0;color:var(--text-hi);font-family:'JetBrains Mono',monospace;font-size:12px}
dl.kv dd:first-of-type{font-family:'Inter'}
.pagebreak{height:1px}
@media print{.pagebreak{height:0;page-break-after:always}}
.screen-card{border:1px solid var(--stroke-sub);border-radius:20px;padding:22px 24px;margin:26px 0;
  background:linear-gradient(180deg,rgba(255,255,255,.028),rgba(255,255,255,.008))}
.toc a{color:var(--text-mid);text-decoration:none}
.toc a:hover{color:var(--gold-300)}
.badge{display:inline-block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-300);
  border:1px solid rgba(255,184,0,.35);border-radius:999px;padding:2px 10px;margin-right:6px}
@media print{
  body{background:#050507;font-size:8.6pt}
  .wrap{max-width:none;padding:0}
  h1{font-size:24pt;color:#FFD47A} h1::after{height:3px;width:110px;margin-top:9px}
  h2{font-size:15pt;page-break-after:avoid} h3{font-size:11.5pt;page-break-after:avoid}
  h4{font-size:11pt;page-break-after:avoid;page-break-before:always;margin-top:0}
  h5{font-size:7.6pt;page-break-after:avoid}
  p,li,td{color:#C7C7D4}
  table{font-size:7.4pt} th{font-size:6.6pt} td{padding:3px 5px}
  pre.wire{font-size:9pt;line-height:1.18;padding:3mm 3.4mm;border-radius:7px;page-break-inside:avoid;
           display:table;margin:1mm auto 3mm;max-width:100%}
  pre.code{font-size:7pt;line-height:1.34;padding:8px 10px;page-break-inside:avoid}
  .screen-card{border:0;padding:0;margin:0}
  dl.kv{grid-template-columns:34mm 1fr;font-size:7.2pt;gap:1px 8px}
  dl.kv dt{font-size:6.4pt} dl.kv dd{font-size:6.8pt}
  h4,h5{page-break-before:auto}
  .callout{page-break-inside:avoid;padding:7px 9px}
  hr{display:none}
}
"""


def wrap_html(body_html, title="Master Design Document — LE LABEUR"):
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>{theme_css(embed_fonts=True)}</style>
</head>
<body>
<div class="wrap">
{body_html}
</div>
</body>
</html>"""


def write_markdown(md, path):
    pathlib.Path(path).write_text(md, encoding="utf-8")
    return path


def write_html(body_html, path):
    pathlib.Path(path).write_text(wrap_html(body_html), encoding="utf-8")
    return path


def write_pdf(body_html, path):
    from weasyprint import HTML
    css = theme_css(embed_fonts=False, print_mode=True)
    html = f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Master Design Document — LE LABEUR</title>
<style>{css}</style></head><body><div class="wrap">{body_html}</div></body></html>"""
    HTML(string=html, base_url=str(HERE)).write_pdf(path)
    return path


def tokens_css():
    lines = ["/* LE LABEUR — tokens générés — ne pas éditer à la main */", ":root{"]
    for group, rows in PALETTE.items():
        lines.append(f"  /* {group} */")
        for name, val, _ in rows:
            v = val.split(" + ")[0].strip()
            if v.startswith("linear-gradient") or "blur" in val:
                lines.append(f"  /* {name}: {val} */")
            else:
                lines.append(f"  {name}: {v};")
    for a, b in RADII:
        lines.append(f"  {a}: {b.split(' ')[0]};")
    for name, val, _ in TYPO["echelle"]:
        parts = [x.strip() for x in val.split("/")]
        lines.append(f"  {name}: {parts[0]}px;")
    for name, params, _, _ in MOTION["springs"]:
        lines.append(f"  --spring-{name}: {params.replace('stiffness ','').replace('damping ','').replace('mass ','').replace('·',' ')};")
    lines.append(f"  --unit: {SPACING['unite_base']};")
    lines.append("}")
    return "\n".join(lines)


def tokens_json():
    return {
        "brand": BRAND,
        "palette": {g: [{"token": t, "value": v, "usage": u} for t, v, u in rows] for g, rows in PALETTE.items()},
        "materials": MATERIALS,
        "typography": {"families": [{"name": a, "stack": b, "role": c} for a, b, c in TYPO["familles"]],
                       "scale": [{"token": a, "spec": b, "usage": c} for a, b, c in TYPO["echelle"]],
                       "rules": TYPO["regles"]},
        "spacing": SPACING, "radii": [{"token": a, "value": b} for a, b in RADII],
        "elevation": [{"name": a, "shadow": b, "usage": c} for a, b, c in ELEVATION],
        "motion": {"springs": [{"name": a, "params": b, "duration": c, "usage": d} for a, b, c, d in MOTION["springs"]],
                   "easings": MOTION["courbes"], "durations": MOTION["durees"], "haptics": MOTION["haptiques"]},
        "components": [{"id": a, "definition": b} for a, b in COMPONENTS],
        "invariants": INVARIANTS,
    }


def write_screens_csv(all_screens, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code", "ecran", "famille", "grappe", "route", "role", "criticite", "archetype",
                    "nb_zones", "zones", "composants", "etats", "tokens"])
        for s in all_screens:
            w.writerow([s.code, s.title, s.family, s.cluster, s.route, s.role, s.criticality, s.archetype,
                        len(s.zones), " | ".join(z.label for z in s.zones),
                        " | ".join(c[0] for c in s.comps),
                        " | ".join(a for a, _ in s.states), " ".join(s.tokens)])
    return path


def write_screens_json(all_screens, path):
    data = []
    for s in all_screens:
        data.append({
            "code": s.code, "title": s.title, "family": s.family, "cluster": s.cluster,
            "route": s.route, "role": s.role, "criticality": s.criticality, "archetype": s.archetype,
            "canon": s.canon, "variant_of": s.variant_of, "intent": s.intent,
            "zones": [{"idx": z.idx, "label": z.label, "kind": z.kind, "weight": z.weight, "note": z.note} for z in s.zones],
            "components": [{"id": c[0], "spec": c[1]} for c in s.comps],
            "states": [{"name": a, "behavior": b} for a, b in s.states],
            "motion": [{"name": a, "detail": b} for a, b in s.motion],
            "rules": s.rules, "tokens": s.tokens, "api": s.api, "tech": s.tech, "a11y": s.a11y,
        })
    pathlib.Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


SECTION_OF = {"PUB": "5", "EMP": "6", "PRE": "7", "ADM": "8", "RTC": "9.1", "SYS": "9.2", "FIN": "9.3"}


def family_markdown(fam, screens):
    blocks = sec_family(fam, screens, SECTION_OF.get(fam, "9"))
    return blocks_to_md(blocks)


def screen_card_html(s, rows=24):
    inner = blocks_to_html(screen_blocks(s, rows))
    return f'<div class="screen-card" id="{s.code}">{inner}</div>'
