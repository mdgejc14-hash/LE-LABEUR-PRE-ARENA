"""P1: routing metadata from the canonical PUB sheets; / stays legacy."""
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'design'))
from llab.content.pub import SCREENS
rows = [dict(code=s.code, title=s.title, route='/ouverture' if s.route == '/' else s.route,
             canonicalRoute=s.route, zones=[z.kind for z in s.zones], tokens=s.tokens,
             api=s.api) for s in SCREENS]
text = '// Generated from design/llab/content/pub.py. Do not edit.\nexport const PUBLIC_SCREENS = ' + json.dumps(rows, ensure_ascii=False, indent=2) + ' as const;\n'
target = ROOT / 'src/public/catalog.ts'
if '--check' in sys.argv:
    if not target.exists() or target.read_text() != text:
        sys.exit('Public catalog is out of date')
else:
    target.write_text(text)
