"""
P4A-DESIGN-ADMIN-CORE — structure des unités ADM de la tranche, lue dans la source canonique.

Ce générateur ne produit AUCUN libellé métier : les textes affichés par
l'interface viennent de `src/admin/vocabulary.ts` (vocabulaire LE LABEUR).
Il exporte uniquement la STRUCTURE des fiches ADM de la tranche P4A :
  - codes d'écran, routes techniques (celles du routeur P0, jamais renommées) ;
  - genres de zones et composants cités par la fiche ;
  - noms d'états d'interface de la fiche (référence de design) ;
  - API **décrites par le design** (référence de comparaison, jamais un
    catalogue de capacités serveur : le mapping réel est dans la tranche).

Périmètre de la tranche P4A (première partie de la famille ADM) :
  ADM-01 tableau de bord général ;
  ADM-02 / ADM-03 registre des utilisateurs et fiche utilisateur ;
  ADM-04 / ADM-05 blocage (geste) et journal des blocages ;
  ADM-06 / ADM-07 qualification (file de revue et revue humaine) ;
  ADM-08 / ADM-09 qualification (décision de revue et historique) ;
  ADM-10 / ADM-11 / ADM-12 matching (runs, audit et règles existantes).

Les écrans ADM suivants (contrats, paiements, salaires, litiges, remplacements,
réputation, documents, notifications, ops, sécurité avancée, infra, FIN) sont
hors tranche et ne figurent PAS dans ce catalogue.
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'design'))

from llab.content import load_all  # noqa: E402
from llab.units import unit_of  # noqa: E402

# Tranche P4A-DESIGN-ADMIN-CORE : fiches ADM livrées par cette tranche.
TRANCHE_P4A = {
    'ADM-01', 'ADM-02', 'ADM-03', 'ADM-04', 'ADM-05',
    'ADM-06', 'ADM-07', 'ADM-08', 'ADM-09',
    'ADM-10', 'ADM-11', 'ADM-12',
}

families = load_all()
SCREENS = [s for s in families['ADM'] if s.code in TRANCHE_P4A]

# Unité de production = regroupement `units.unit_of(canon)` de la source canonique.
# Ordre d'unité = ordre des fiches ADM de la tranche ; l'id est le plus petit code.
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
    'role': 'ADMIN' if s.role == 'Admin' else s.role,
    'criticality': s.criticality,
    'zoneKinds': [z.kind for z in s.zones],
    'variantOf': s.variant_of,
    'designApi': s.api,
    'tokens': s.tokens,
} for s in SCREENS]

payload = (
    '// GÉNÉRÉ PAR scripts/design/generate-admin-catalog.py — NE PAS ÉDITER À LA MAIN.\n'
    '// Source : design/llab/content/adm_*.py, design/llab/units.py (tranche P4A : ADM-01 → ADM-12).\n'
    '// Régénérer : npm run design:admin\n'
    '//\n'
    '// Référence de design UNIQUEMENT : aucun libellé de ce fichier n\'est affiché par\n'
    '// l\'interface. Les textes visibles viennent de src/admin/vocabulary.ts (vocabulaire\n'
    '// LE LABEUR : ADMIN, EMPLOYER, CANDIDATE, OFFER, APPLICATION, PROPOSAL, CONTRACT, CLAIM,\n'
    '// PAYMENT, SALARY, REPLACEMENT, MATCHING, DOCUMENT, QUALIFICATION).\n'
    '// Les routes sont celles du routeur P0 : elles ne sont ni renommées ni réécrites.\n\n'
    'export interface AdminDesignScreen {\n'
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
    'export interface AdminDesignUnit {\n'
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
    f'export const ADMIN_DESIGN_UNITS = {json.dumps(rows, ensure_ascii=False, indent=2)} as const;\n\n'
    f'export const ADMIN_DESIGN_SCREENS = {json.dumps(screens, ensure_ascii=False, indent=2)} as const;\n\n'
    'export const ADMIN_UNIT_IDS: readonly string[] = ADMIN_DESIGN_UNITS.map((unit) => unit.id);\n'
)

target = ROOT / 'src/admin/catalog.ts'
if '--check' in sys.argv:
    if not target.exists() or target.read_text(encoding='utf-8') != payload:
        sys.exit('Admin catalog is out of date')
else:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(payload, encoding='utf-8')
