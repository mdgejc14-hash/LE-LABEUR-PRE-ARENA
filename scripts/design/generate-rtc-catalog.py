"""
RTC-1 — structure des 5 unités RTC, lue dans la source canonique.

Ce générateur ne produit AUCUN libellé métier : les textes affichés par
l'interface viennent de `src/rtc/vocabulary.ts` (vocabulaire LE LABEUR).
Il exporte uniquement la STRUCTURE des fiches RTC :
  - codes d'écran, routes techniques (celles du routeur P0, jamais renommées) ;
  - genres de zones et composants cités par la fiche ;
  - noms d'états d'interface de la fiche (référence de design) ;
  - API **décrites par le design** (référence de comparaison, jamais un
    catalogue de capacités serveur : le mapping réel est dans la tranche).
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'design'))

from llab.content.rtc import SCREENS as RTC_SCREENS  # noqa: E402
from llab.units import unit_of  # noqa: E402

SCREENS = list(RTC_SCREENS)

# Unité de production = regroupement `units.unit_of(canon)` de la source canonique.
# Ordre d'unité = ordre des fiches RTC (RTC-01 → RTC-08) ; l'id est le plus petit code.
UNITS = []
BY_LABEL = {}
for screen in SCREENS:
    label = unit_of(screen.canon)
    unit = BY_LABEL.get(label)
    if unit is None:
        unit = {
            'id': screen.code,
            'canon': label,
            'criticality': screen.criticality,
            'archetype': screen.archetype,
            'screenCodes': [],
            'routes': [],
        }
        BY_LABEL[label] = unit
        UNITS.append(unit)
    unit['screenCodes'].append(screen.code)
    unit['routes'].append(screen.route)


def product_role(role: str) -> str:
    if role == 'Client/Prestataire':
        return 'EMPLOYER/CANDIDATE'
    return role


rows = []
for unit in UNITS:
    members = [s for s in SCREENS if s.code in unit['screenCodes']]
    rows.append({
        'id': unit['id'],
        'canon': unit['canon'],
        'criticality': unit['criticality'],
        'archetype': unit['archetype'],
        'screenCodes': unit['screenCodes'],
        'routes': unit['routes'],
        'zoneKinds': sorted({z.kind for s in members for z in s.zones}),
        'componentRefs': sorted({name.split(' ')[0] for s in members for name, _ in s.comps}),
        'stateNames': [name for s in members for name, _ in s.states],
        'tokens': sorted({t for s in members for t in s.tokens}),
        # API décrites par la fiche : références de comparaison, pas des capacités.
        'designApi': [a for s in members for a in s.api],
    })

screens = [{
    'code': s.code,
    'unitId': unit_of(s.canon),
    'route': s.route,
    'canonicalRoute': s.route,
    'role': product_role(s.role),
    'criticality': s.criticality,
    'zoneKinds': [z.kind for z in s.zones],
    'variantOf': s.variant_of,
    'designApi': s.api,
    'tokens': s.tokens,
} for s in SCREENS]

payload = (
    '// GÉNÉRÉ PAR scripts/design/generate-rtc-catalog.py — NE PAS ÉDITER À LA MAIN.\n'
    '// Source : design/llab/content/rtc.py, design/llab/units.py.\n'
    '// Régénérer : npm run design:rtc\n'
    '//\n'
    '// Référence de design UNIQUEMENT : aucun libellé de ce fichier n\'est affiché par\n'
    '// l\'interface. Les textes visibles viennent de src/rtc/vocabulary.ts (vocabulaire\n'
    '// LE LABEUR : SESSION, CONTRAT, EMPLOYEUR, CANDIDAT).\n'
    '// Les routes sont celles du routeur P0 : elles ne sont ni renommées ni réécrites.\n\n'
    'export interface RtcDesignScreen {\n'
    '  readonly code: string;\n'
    '  readonly unitId: string;\n'
    '  readonly route: string;\n'
    '  readonly canonicalRoute: string;\n'
    '  readonly role: string;\n'
    '  readonly criticality: string;\n'
    '  readonly zoneKinds: readonly string[];\n'
    '  readonly variantOf: string | null;\n'
    '  readonly designApi: readonly string[];\n'
    '  readonly tokens: readonly string[];\n'
    '}\n\n'
    'export interface RtcDesignUnit {\n'
    '  readonly id: string;\n'
    '  readonly canon: string;\n'
    '  readonly criticality: string;\n'
    '  readonly archetype: string;\n'
    '  readonly screenCodes: readonly string[];\n'
    '  readonly routes: readonly string[];\n'
    '  readonly zoneKinds: readonly string[];\n'
    '  readonly componentRefs: readonly string[];\n'
    '  readonly stateNames: readonly string[];\n'
    '  readonly tokens: readonly string[];\n'
    '  readonly designApi: readonly string[];\n'
    '}\n\n'
    f'export const RTC_DESIGN_UNITS = {json.dumps(rows, ensure_ascii=False, indent=2)} as const;\n\n'
    f'export const RTC_DESIGN_SCREENS = {json.dumps(screens, ensure_ascii=False, indent=2)} as const;\n\n'
    'export const RTC_UNIT_IDS: readonly string[] = RTC_DESIGN_UNITS.map((unit) => unit.id);\n'
)

target = ROOT / 'src/rtc/catalog.ts'
if '--check' in sys.argv:
    if not target.exists() or target.read_text(encoding='utf-8') != payload:
        sys.exit('RTC catalog is out of date')
else:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(payload, encoding='utf-8')
