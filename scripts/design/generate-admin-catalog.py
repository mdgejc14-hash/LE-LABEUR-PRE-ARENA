"""
Catalogue ADM — structure des unités livrées, lue dans la source canonique.

Tranches livrées :
  P4A-DESIGN-ADMIN-CORE : supervision de base ;
  P4B-1-DESIGN-ADMIN-CONTRACTS : supervision des contrats ;
  P4B-2-DESIGN-ADMIN-PAYMENTS : paiements, déclarations et rapprochement ;
  P4C-DESIGN-ADMIN-SALARY-PROOFS : confirmations de Salaire et preuves de
  réception (unité exacte `ADM — salaire (confirmations & preuves OTP)`) ;
  P4D-DESIGN-ADMIN-CLAIMS : file, dossier, pièces et décisions des Claims
  (regroupements exacts `ADM-26`, `ADM-27/28`, `ADM-29/30`) ;
  P4E-1-DESIGN-ADMIN-REPLACEMENTS : file, suivi détaillé et arbitrage des
  Remplacements (unité exacte `ADM — remplacements (file & arbitrage)` =
  ADM-31 regroupant ADM-31/32/33) ;
  P4E-2-DESIGN-ADMIN-REPUTATION : ledger, corrections, contestations et
  audit de réputation (unités exactes `ADM — réputation (ledger, corrections
  & audit)` = ADM-34 regroupant ADM-34/36, et `ADM — réputation
  (contestations)` = ADM-35) ;
  P4F-DESIGN-ADMIN-DOCUMENTS : registre, audit, vérification et quarantaine
  des Documents (unités exactes `ADM — documents (registre & audit)` =
  ADM-37 regroupant ADM-37/40, et `ADM — documents (vérification &
  quarantaine)` = ADM-38 regroupant ADM-38/39) ;
  P4F-2-DESIGN-ADMIN-NOTIFICATIONS : orchestration, gabarits et délivrabilité
  (unité exacte `ADM — notifications (orchestration, gabarits & délivrabilité)`
  = ADM-41 regroupant ADM-41/42/43) ;
  P4G-1-DESIGN-ADMIN-OPERATIONS : files, jobs et planifications (unité exacte
  `ADM — ops (queues, jobs & cron)` = ADM-44 regroupant ADM-44/45/46) ;
  P4G-2-DESIGN-ADMIN-SUPERVISION : SLO, dead-letter et incidents ops
  (ADM-47 regroupant ADM-47/49 ; ADM-48 reste une unité distincte). Les routes
  du référentiel sont des références de design, pas des contrats actifs.

Ce générateur ne produit AUCUN libellé métier : les textes affichés par
l'interface viennent de `src/admin/vocabulary.ts` (vocabulaire LE LABEUR).
Il exporte uniquement la STRUCTURE des fiches ADM des tranches livrées :
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

Périmètre de la tranche P4B-1 (supervision des contrats uniquement) :
  ADM-13 registre des contrats ;
  ADM-14 / ADM-15 / ADM-17 contrat — fiche, incidents et journal (une seule
         unité de production selon `units.py`) ;
  ADM-16 contrat — révision forcée (unité propre ; capacité absente côté
         serveur, déclarée BACKEND_GAP par la tranche).

Périmètre de la tranche P4C (supervision du Salaire uniquement) :
  ADM-23 confirmations de Salaire (file) ;
  ADM-24 preuves de réception (examen) — unité unique `ADM-23` selon `units.py`.

Périmètre de la tranche P4E-1 (workflow de remplacement uniquement) :
  ADM-31 file & suivi des Remplacements ;
  ADM-32 suivi détaillé d'un Remplacement (variante d'ADM-31) ;
  ADM-33 arbitrage (canon propre, même unité selon `units.py` ; capacité
         absente côté serveur, déclarée BACKEND_GAP par la tranche).

Périmètre de la tranche P4E-2 (réputation uniquement) :
  ADM-34 ledger global et corrections (canon « ledger & corrections ») ;
  ADM-36 audit d'intégrité (même unité selon `units.py`) ;
  ADM-35 file de contestations (canon propre, unité distincte selon
         `units.py` ; aucune ressource serveur, BACKEND_GAP).

Périmètre de la tranche P4F (documents uniquement) :
  ADM-37 registre R2 des Documents (canon « ADM — documents (registre & audit) ») ;
  ADM-40 audit et rétention (même unité selon `units.py`) ;
  ADM-38 vérification d'un Document (canon « ADM — documents (vérification & quarantaine) ») ;
  ADM-39 quarantaine (même unité selon `units.py` ; aucune route, BACKEND_GAP).

Périmètre de la tranche P4G-1 : ADM-44 / ADM-45 / ADM-46 (files, jobs et
planifications).

Périmètre de la tranche P4G-2 : ADM-47 / ADM-49 (unité exacte `ADM — ops
(SLO & incident)`) et ADM-48 (`ADM — ops (dead-letter)`, unité distincte).
Seule la présentation diagnostique des capacités serveur absentes est intégrée :
aucune API de supervision n’est déduite des routes décrites dans les fiches.

Les autres écrans ADM (sécurité, infra), FIN et RTC restent hors tranche et
ne figurent PAS dans ce catalogue.
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'design'))

from llab.content import load_all  # noqa: E402
from llab.units import unit_of  # noqa: E402

# Fiches ADM livrées par les tranches P4A → P4G-2 (périmètre strict, sélection explicite).
TRANCHE_P4A = {
    'ADM-01', 'ADM-02', 'ADM-03', 'ADM-04', 'ADM-05',
    'ADM-06', 'ADM-07', 'ADM-08', 'ADM-09',
    'ADM-10', 'ADM-11', 'ADM-12',
}

# P4B-1-DESIGN-ADMIN-CONTRACTS : supervision des contrats uniquement.
TRANCHE_P4B1 = {
    'ADM-13', 'ADM-14', 'ADM-15', 'ADM-16', 'ADM-17',
}

# P4B-2-DESIGN-ADMIN-PAYMENTS : unités exactes de `design/llab/units.py`.
# ADM-18 regroupe ADM-18/19 ; ADM-20 regroupe ADM-20/21/22.
TRANCHE_P4B2 = {
    'ADM-18', 'ADM-19', 'ADM-20', 'ADM-21', 'ADM-22',
}

# P4C-DESIGN-ADMIN-SALARY-PROOFS : unité exacte de `design/llab/units.py`
# « ADM — salaire (confirmations & preuves OTP) » = ADM-23 regroupe ADM-23/24.
TRANCHE_P4C = {
    'ADM-23', 'ADM-24',
}

# P4D-DESIGN-ADMIN-CLAIMS : trois unités exactes de `design/llab/units.py` :
# ADM-26 seul (file), ADM-27 regroupe ADM-27/28 (fiche & pièces),
# ADM-29 regroupe ADM-29/30 (décision & journal des décisions).
TRANCHE_P4D = {
    'ADM-26', 'ADM-27', 'ADM-28', 'ADM-29', 'ADM-30',
}

# P4E-1-DESIGN-ADMIN-REPLACEMENTS : unité exacte de `design/llab/units.py`
# « ADM — remplacements (file & arbitrage) » = ADM-31 regroupe ADM-31/32/33
# (canons « ADM — remplacements (file) » et « ADM — remplacement (arbitrage) »).
TRANCHE_P4E1 = {
    'ADM-31', 'ADM-32', 'ADM-33',
}

# P4E-2-DESIGN-ADMIN-REPUTATION : unités exactes de `design/llab/units.py`
# « ADM — réputation (ledger, corrections & audit) » = ADM-34 regroupe
# ADM-34/36 ; « ADM — réputation (contestations) » = ADM-35 (canon orphelin
# du GROUPS, donc unité propre).
TRANCHE_P4E2 = {
    'ADM-34', 'ADM-35', 'ADM-36',
}

# P4F-DESIGN-ADMIN-DOCUMENTS : deux unités exactes de `design/llab/units.py`.
# « ADM — documents (registre & audit) » = ADM-37 regroupe ADM-37/40 ;
# « ADM — documents (vérification & quarantaine) » = ADM-38 regroupe ADM-38/39.
TRANCHE_P4F = {
    'ADM-37', 'ADM-38', 'ADM-39', 'ADM-40',
}

# P4F-2-DESIGN-ADMIN-NOTIFICATIONS : unité exacte de `design/llab/units.py`.
# « ADM — notifications (orchestration, gabarits & délivrabilité) » = ADM-41
# regroupe ADM-41/42/43. Les capacités serveur absentes restent BACKEND_GAP
# dans l’interface ; le générateur ne transforme pas les API de la fiche en
# contrats actifs.
TRANCHE_P4F2 = {
    'ADM-41', 'ADM-42', 'ADM-43',
}

# P4G-1 : unité exacte de design/llab/units.py, aucune API ops serveur.
TRANCHE_P4G1 = {'ADM-44', 'ADM-45', 'ADM-46'}

# P4G-2 : supervision des unités réellement définies par units.py. Le catalogue
# ne transforme pas les API décrites par les fiches en contrats serveur.
TRANCHE_P4G2 = {'ADM-47', 'ADM-48', 'ADM-49'}

TRANCHE_ADMIN = TRANCHE_P4G1 | TRANCHE_P4G2 | TRANCHE_P4A | TRANCHE_P4B1 | TRANCHE_P4B2 | TRANCHE_P4C | TRANCHE_P4D | TRANCHE_P4E1 | TRANCHE_P4E2 | TRANCHE_P4F | TRANCHE_P4F2

families = load_all()
SCREENS = [s for s in families['ADM'] if s.code in TRANCHE_ADMIN]

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
    '// Source : design/llab/content/adm_*.py, design/llab/units.py — tranches livrées :\n'
    '// P4A (ADM-01 → ADM-12), P4B-1 CONTRATS (ADM-13 → ADM-17), P4B-2 PAIEMENTS (ADM-18 → ADM-22)\n'
    '// P4C SALAIRE (ADM-23 → ADM-24), P4D CLAIMS (ADM-26 → ADM-30), P4E-1 REMPLACEMENTS (ADM-31 → ADM-33),\n'
    '// P4E-2 RÉPUTATION (ADM-34 → ADM-36), P4F DOCUMENTS (ADM-37 → ADM-40),\n'
    '// P4F-2 NOTIFICATIONS (ADM-41 → ADM-43), P4G-1 OPÉRATIONS (ADM-44 → ADM-46),\n'
    '// P4G-2 SUPERVISION (ADM-47 → ADM-49).\n'
    '// Régénérer : npm run design:admin\n'
    '//\n'
    '// Référence de design UNIQUEMENT : aucun libellé de ce fichier n\'est affiché par\n'
    '// l\'interface. Les textes visibles viennent de src/admin/vocabulary.ts (vocabulaire\n'
    '// LE LABEUR : ADMIN, EMPLOYER, CANDIDATE, OFFER, APPLICATION, PROPOSAL, CONTRACT, CLAIM,\n'
    '// PAYMENT, SALARY, REPLACEMENT, MATCHING, DOCUMENT, QUALIFICATION, REPUTATION).\n'
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
