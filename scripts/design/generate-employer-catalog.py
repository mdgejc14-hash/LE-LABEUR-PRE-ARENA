"""
P2-DESIGN-EMPLOYER — structure des 32 unités EMP, lue dans la source canonique.

Ce générateur ne produit AUCUN libellé métier : les textes affichés par
l'interface viennent de `src/employer/vocabulary.ts` (vocabulaire LE LABEUR).
Il exporte uniquement la STRUCTURE des fiches EMP :
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

from llab.content.emp_a import SCREENS as EMP_A  # noqa: E402
from llab.content.emp_b import SCREENS as EMP_B  # noqa: E402
from llab.content.emp_c import SCREENS as EMP_C  # noqa: E402
from llab.content.emp_d import SCREENS as EMP_D  # noqa: E402
from llab.units import unit_of  # noqa: E402

SCREENS = list(EMP_A) + list(EMP_B) + list(EMP_C) + list(EMP_D)

# Unité de production = regroupement `units.unit_of(canon)` de la source canonique.
# Ordre d'unité = ordre des fiches EMP (EMP-01 → EMP-60) ; l'id est le plus petit code.
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
    'role': 'EMPLOYER' if s.role == 'Client' else s.role,
    'criticality': s.criticality,
    'zoneKinds': [z.kind for z in s.zones],
    'variantOf': s.variant_of,
    'designApi': s.api,
    'tokens': s.tokens,
} for s in SCREENS]

payload = (
    '// GÉNÉRÉ PAR scripts/design/generate-employer-catalog.py — NE PAS ÉDITER À LA MAIN.\n'
    '// Source : design/llab/content/emp_*.py, design/llab/units.py.\n'
    '// Régénérer : npm run design:employer\n'
    '//\n'
    '// Référence de design UNIQUEMENT : aucun libellé de ce fichier n\'est affiché par\n'
    '// l\'interface. Les textes visibles viennent de src/employer/vocabulary.ts (vocabulaire\n'
    '// LE LABEUR : EMPLOYER, OFFRE, CANDIDAT, CANDIDATURE, PROPOSITION, CONTRAT, CLAIM,\n'
    '// PAIEMENT, REMPLACEMENT, MATCHING, DOCUMENT).\n'
    '// Les routes sont celles du routeur P0 : elles ne sont ni renommées ni réécrites.\n\n'
    'export interface EmployerDesignScreen {\n'
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
    'export interface EmployerDesignUnit {\n'
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
    f'export const EMPLOYER_DESIGN_UNITS = {json.dumps(rows, ensure_ascii=False, indent=2)} as const;\n\n'
    f'export const EMPLOYER_DESIGN_SCREENS = {json.dumps(screens, ensure_ascii=False, indent=2)} as const;\n\n'
    'export const EMPLOYER_UNIT_IDS: readonly string[] = EMPLOYER_DESIGN_UNITS.map((unit) => unit.id);\n'
)

target = ROOT / 'src/employer/catalog.ts'
if '--check' in sys.argv:
    if not target.exists() or target.read_text(encoding='utf-8') != payload:
        sys.exit('Employer catalog is out of date')
else:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(payload, encoding='utf-8')
