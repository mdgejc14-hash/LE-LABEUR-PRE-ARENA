#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Outil d'extraction de la cartographie globale LE LABEUR (lecture seule).

Usage (depuis la racine du dépôt, dépendances npm installées) :

    python3 docs/architecture/cartographie-globale/outils/cartographie.py

Ce script ne modifie AUCUN fichier applicatif. Il :
  1. charge les modules TypeScript réels (catalogues générés, registres
     d'écrans, contrats de routes, statut d'intégration, résolution de route)
     via `npx tsx` et un script temporaire écrit HORS du dépôt ;
  2. compose réellement le Worker (`composeWorker`) dans quatre configurations
     (fermée, mémoire, PostgreSQL PGlite + migrations, PostgreSQL + stockage
     objet injecté) et appelle chacun des contrats de route avec un acteur qui
     satisfait la garde, pour observer « handler atteint » ou « 501 » ;
  3. analyse statiquement le code source (handlers, clients API frontend,
     composants, liens de navigation, tests) ;
  4. écrit les inventaires dans `donnees/` et les matrices générées
     (`D-matrice-ecrans-api.md`, `C2-contrats-api.md`).

Limites : l'analyse statique repose sur des expressions régulières et une
mise en correspondance d'accolades ; elle repère les appels présents dans le
code d'un composant (y compris via les fonctions locales du même fichier et
les hooks), pas leur exécution effective. Les liaisons dynamiques sont
vérifiées séparément par la sonde (étape 2) et par les tests existants.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1]
DATA = OUT / 'donnees'
SRC = ROOT / 'src'

# ─────────────────────────────────────────────────────────────────────────────
# 1. Chargement des modules TypeScript réels (script temporaire hors dépôt)
# ─────────────────────────────────────────────────────────────────────────────
DUMP_TS = r"""
const R = %(src)s;
const out: Record<string, unknown> = {};
const rc = await import(R + '/backend/api/routeContracts.ts');
out.contracts = rc.API_ROUTE_CONTRACTS;
const pu = await import(R + '/design-system/generated/productionUnits.ts');
out.units = pu.PRODUCTION_UNITS;
const sg = await import(R + '/design-system/generated/stateGuardCatalog.ts');
out.stateGuard = sg.STATE_GUARD_CATALOG.map((s: any) => ({ key: s.key, code: s.code, route: s.route, title: s.title }));
const pc = await import(R + '/public/catalog.ts');
out.publicScreens = pc.PUBLIC_SCREENS;
out.publicGaps = await import(R + '/public/gaps.ts');
for (const [fam, dir, prefix] of [['EMP','employer','EMPLOYER'],['PRE','prestataire','PRESTATAIRE'],['ADM','admin','ADMIN'],['RTC','rtc','RTC']] as const) {
  const cat = await import(`${R}/${dir}/catalog.ts`);
  const gaps = await import(`${R}/${dir}/gaps.ts`);
  const api = await import(`${R}/${dir}/api.ts`);
  const reg = await import(`${R}/${dir}/registry.tsx`);
  const regKey = Object.keys(reg).find(k => k.endsWith('_SCREEN_COMPONENTS'))!;
  out[fam] = {
    units: cat[`${prefix}_DESIGN_UNITS`], screens: cat[`${prefix}_DESIGN_SCREENS`],
    gaps: gaps[`${prefix}_UNIT_GAPS`], apiPaths: api[`${prefix}_API_PATHS`] ?? null, registryKey: regKey,
    registry: Object.fromEntries(Object.entries(reg[regKey]).map(([k, v]: any) => [k, v?.name ?? String(v)])),
  };
}
const integ = await import(R + '/routing/integration.ts');
out.integration = Object.fromEntries((pu.PRODUCTION_UNITS as any[]).map(u => [u.id, integ.integrationStatus(u.id)]));
const rr = await import(R + '/routing/resolveRoute.ts');
const maps = [await import(R + '/employer/screenMap.ts'), await import(R + '/prestataire/screenMap.ts'), await import(R + '/admin/screenMap.ts'), await import(R + '/rtc/screenMap.ts')];
const fns = [maps[0].resolveEmployerScreen, maps[1].resolvePrestataireScreen, maps[2].resolveAdminScreen, maps[3].resolveRtcScreen];
const resolved: any[] = [];
const allRoutes = new Set<string>();
for (const u of pu.PRODUCTION_UNITS as any[]) for (const r of u.routes) allRoutes.add(r);
for (const s of pc.PUBLIC_SCREENS as any[]) allRoutes.add(s.route);
for (const route of allRoutes) {
  const concrete = route.replace(/:[A-Za-z]+/g, 'x1');
  const r: any = rr.resolveRoute(concrete);
  let sm: any = null; for (const f of fns) { sm = sm ?? f(concrete); }
  resolved.push({ route, concrete, kind: r.kind, namespace: r.namespace ?? null, resolvedUnit: r.unitId ?? null, state: r.state ?? null, notFound: r.notFound ?? null, screenCode: sm?.code ?? null });
}
out.resolved = resolved;
out.namespaces = (await import(R + '/routing/routes.ts')).ROUTE_NAMESPACES;
console.log(JSON.stringify(out));
"""

PROBE_TS = r"""
const R = %(src)s;
const { API_ROUTE_CONTRACTS } = await import(R + '/backend/api/routeContracts.ts');
const { composeWorker } = await import(R + '/backend/api/entry.ts');
const { createOffersTestHarness } = await import(R + '/backend/api/offers.test.ts');
const { createSqlIdentityStores } = await import(R + '/backend/identity/sqlStores.ts');
const { newEntityId, newOpaqueSessionToken } = await import(R + '/backend/identity/ids.ts');
const { createInMemoryObjectStorage } = await import(R + '/backend/documents/storage.ts');
const { SESSION_COOKIE_NAME } = await import(R + '/backend/identity/cookies.ts');
type Tok = Record<string, string | null>;
const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, 'probe_x1');
function actorFor(c: any): string | null {
  if (c.authentication === 'public') return null;
  if (c.roles && c.roles.length) return c.roles[0];
  if (c.scope === 'admin') return 'ADMIN';
  return 'EMPLOYER';
}
async function probe(worker: any, tokens: Tok) {
  const res: Record<string, any> = {};
  // auth.logout en dernier : il révoque la session de l'acteur utilisé.
  const ordered = [...(API_ROUTE_CONTRACTS as any[])].sort((a, b) => (a.key === 'auth.logout' ? 1 : 0) - (b.key === 'auth.logout' ? 1 : 0));
  for (const c of ordered) {
    const role = actorFor(c);
    const token = role ? tokens[role] ?? null : null;
    const headers: Record<string, string> = { 'content-type': 'application/json', 'Idempotency-Key': 'probe-' + c.key };
    if (token) headers['cookie'] = `${SESSION_COOKIE_NAME}=${token}`;
    const init: RequestInit = { method: c.method, headers };
    if (c.method !== 'GET') init.body = '{}';
    let status = 0, code = '';
    try {
      const r = await worker.fetch(new Request('https://api.test' + concrete(c.path), init));
      status = r.status;
      try { const b = await r.clone().json(); code = b?.error?.code ?? 'OK'; } catch { code = 'NON_JSON'; }
    } catch (e) { status = -1; code = 'THROW'; }
    let handler: string;
    if (role && !token) handler = 'NON_SONDÉ';
    else if (status === 501 && code === 'NOT_IMPLEMENTED') handler = 'ABSENT';
    else handler = 'ATTEINT';
    res[c.key] = { status, code, role, handler };
  }
  return res;
}
async function provision(h: any) {
  const t: Tok = {};
  for (const role of ['ADMIN', 'EMPLOYER', 'CANDIDATE']) {
    const userId = newEntityId('usr'); const token = newOpaqueSessionToken();
    const createdAt = new Date(h.clock.value.getTime() - 120_000).toISOString();
    const expiresAt = new Date(h.clock.value.getTime() + 3_600_000).toISOString();
    await createSqlIdentityStores(h.database).transaction(async (tx: any) => {
      await tx.users.create({ id: userId, role, status: 'ACTIVE', email: `${role}.${userId}@example.com`, displayName: role });
      await tx.sessions.create({ userId, token, createdAt, expiresAt });
    });
    t[role] = token;
  }
  return t;
}
const out: Record<string, any> = {};
out.closed = await probe(composeWorker({}).worker, {});
{
  const comp = composeWorker({ GOOGLE_CLIENT_ID: 'probe', PERSISTENCE: 'memory' }, undefined, {
    googleVerifier: { verifyCredential: async (c: string) => ({ subject: 'sub-' + c, email: c + '@example.com', emailVerified: true, displayName: c }) },
  });
  const t: Tok = {};
  for (const role of ['EMPLOYER', 'CANDIDATE']) {
    const r = await comp.worker.fetch(new Request('https://api.test/api/v1/auth/google/credential', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: 'probe' + role, requestedRole: role, intent: 'register' }) }));
    const m = (r.headers.get('set-cookie') ?? '').match(new RegExp(SESSION_COOKIE_NAME + '=([^;]+)'));
    t[role] = m ? m[1] : null;
  }
  out.memory = await probe(comp.worker, t);
}
{ const h = await createOffersTestHarness(); out.postgres = await probe(h.worker, await provision(h)); await h.close(); }
{
  const h = await createOffersTestHarness(undefined, { documentStorage: createInMemoryObjectStorage(), documentUrlSigningSecret: 'probe-secret-0123456789-0123456789' });
  out.postgresR2 = await probe(h.worker, await provision(h)); await h.close();
}
console.log(JSON.stringify(out));
"""


def run_ts(source: str, name: str) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f'{name}.mts'
        path.write_text(source % {'src': json.dumps(str(SRC))})
        proc = subprocess.run(['npx', 'tsx', str(path)], cwd=ROOT, capture_output=True, text=True, timeout=900)
        if proc.returncode != 0:
            sys.exit(f'{name} a échoué :\n{proc.stderr[-3000:]}')
        return json.loads(proc.stdout.strip().splitlines()[-1])


# ─────────────────────────────────────────────────────────────────────────────
# Outils d'analyse statique
# ─────────────────────────────────────────────────────────────────────────────
def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def line_of(text: str, index: int) -> int:
    return text.count('\n', 0, index) + 1


def match_brace(text: str, start: int) -> int:
    """Index de l'accolade fermante correspondant à text[start] == '{'."""
    depth, i, n = 0, start, len(text)
    while i < n:
        c = text[i]
        if c in '\'"':
            q = c; i += 1
            while i < n and text[i] != q and text[i] != '\n':
                i += 2 if text[i] == '\\' else 1
        elif c == '/' and i + 1 < n and text[i + 1] == '/':
            i = text.find('\n', i)
            if i < 0:
                return n
        elif c == '/' and i + 1 < n and text[i + 1] == '*':
            i = text.find('*/', i) + 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return n


def body_after(text: str, pos: int) -> tuple:
    """Corps `{...}` de la fonction dont la signature commence à `pos`."""
    i = text.find('(', pos)
    depth = 0
    while i < len(text):
        if text[i] == '(':
            depth += 1
        elif text[i] == ')':
            depth -= 1
            if depth == 0:
                break
        i += 1
    j = i + 1
    # saute une annotation de type de retour (« : { ... } », « : Promise<{...}> »)
    k = j
    while k < len(text) and text[k] in ' \t\n':
        k += 1
    if k < len(text) and text[k] == ':':
        k += 1
        while k < len(text) and text[k] in ' \t\n':
            k += 1
        if text[k] == '{':
            k = match_brace(text, k) + 1
        j = k
    angle = 0
    while j < len(text):
        c = text[j]
        if c == '<':
            angle += 1
        elif c == '>' and text[j - 1] != '=':
            angle = max(0, angle - 1)
        elif c == '{' and angle == 0:
            break
        j += 1
    end = match_brace(text, j)
    return j, end


FUNC_RE = re.compile(r'^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^>\n]*>)?\s*\(', re.M)
CONST_FN_RE = re.compile(r'^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*(?::[^=\n]+)?=\s*(?:async\s*)?\(', re.M)


def top_functions(text: str) -> dict:
    out = {}
    for rx in (FUNC_RE, CONST_FN_RE):
        for m in rx.finditer(text):
            b, e = body_after(text, m.start())
            out[m.group(1)] = (m.start(), b, e)
    return out


def norm_path(p: str) -> str:
    p = re.sub(r'\$\{[^}]*\}', ':p', p)
    return p.split('?')[0]


def path_regex(contract_path: str) -> re.Pattern:
    parts = []
    for seg in contract_path.strip('/').split('/'):
        parts.append(r'(?::[A-Za-z_]+|[^/]+)' if seg.startswith(':') else re.escape(seg))
    return re.compile('^/' + '/'.join(parts) + '$')


def match_contracts(method: str, client_path: str, contracts: list) -> list:
    """Contrats compatibles avec un chemin client (`:p` = segment dynamique)."""
    full = '/api/v1' + client_path if not client_path.startswith('/api/') else client_path
    segs = full.strip('/').split('/')
    found = []
    for c in contracts:
        if c['method'] != method:
            continue
        cs = c['path'].strip('/').split('/')
        if len(cs) != len(segs):
            continue
        ok = True
        for a, b in zip(segs, cs):
            if a == ':p' or b.startswith(':'):
                continue
            if a != b:
                ok = False
                break
        if ok:
            found.append(c['key'])
    return found


# ─────────────────────────────────────────────────────────────────────────────
# 2. Handlers backend (définition statique)
# ─────────────────────────────────────────────────────────────────────────────
HANDLER_FACTORIES = [
    ('src/backend/api/identityWorker.ts', 'createIdentityApiWorker', 'GOOGLE_CLIENT_ID + persistance mémoire ou PostgreSQL'),
    ('src/backend/repositories/offerRepository.ts', 'createOfferApiHandlers', 'persistance mémoire ou PostgreSQL (persistence.core)'),
    ('src/backend/repositories/applicationRepository.ts', 'createApplicationApiHandlers', 'persistance mémoire ou PostgreSQL (persistence.core)'),
    ('src/backend/repositories/proposalRepository.ts', 'createProposalApiHandlers', 'persistance mémoire ou PostgreSQL (persistence.core)'),
    ('src/backend/repositories/contractRepository.ts', 'createContractApiHandlers', 'persistance mémoire ou PostgreSQL (persistence.core)'),
    ('src/backend/disputes/claimRepository.ts', 'createClaimApiHandlers', 'PostgreSQL uniquement'),
    ('src/backend/replacements/replacementRepository.ts', 'createReplacementApiHandlers', 'PostgreSQL uniquement'),
    ('src/backend/matching/matchingRepository.ts', 'createMatchingApiHandlers', 'PostgreSQL uniquement'),
    ('src/backend/reputation/reputationRepository.ts', 'createReputationApiHandlers', 'PostgreSQL uniquement'),
    ('src/backend/documents/documentRepository.ts', 'createDocumentApiHandlers', 'PostgreSQL + stockage objet (DOCUMENTS_BUCKET ou injection)'),
    ('src/backend/webrtc/webrtcApi.ts', 'createWebRtcApiHandlers', 'PostgreSQL uniquement (mode postgres)'),
    ('src/backend/repositories/paymentRepository.ts', 'createPaymentApiHandlers', 'PostgreSQL uniquement'),
    ('src/backend/payments/salaryConfirmation.ts', 'createSalaryConfirmationHandlers', 'PostgreSQL uniquement (mode postgres)'),
    ('src/backend/payments/paymentReconciliationApi.ts', 'createPaymentReconciliationApiHandlers', 'PostgreSQL uniquement'),
    ('src/backend/notifications/notificationApi.ts', 'createNotificationApiHandlers', 'PostgreSQL uniquement'),
    ('src/backend/api/entry.ts', 'composeWorker', 'PostgreSQL uniquement (adminSecurityHandlers)'),
]


def extract_handlers(contract_keys: set) -> dict:
    handlers = {}
    for file, factory, condition in HANDLER_FACTORIES:
        text = (ROOT / file).read_text()
        funcs = top_functions(text)
        if factory not in funcs:
            continue
        _, b, e = funcs[factory]
        body = text[b:e]
        for m in re.finditer(r"'([a-z][a-z0-9.\-]+)'\s*:\s*(async\b|[A-Za-z_][A-Za-z0-9_]*)", body):
            key = m.group(1)
            if key not in contract_keys:
                continue
            if file.endswith('entry.ts') and 'adminSecurityHandlers' not in text[max(0, b + m.start() - 400):b + m.start()]:
                continue
            idx = b + m.start()
            # appels de service/repository dans le corps du handler
            calls = []
            if m.group(2) == 'async':
                hb = text.find('{', idx)
                arrow = text.find('=>', idx)
                if arrow != -1 and (hb == -1 or arrow < hb):
                    after = text[arrow + 2:arrow + 3000]
                    if after.lstrip().startswith('{'):
                        hb = arrow + 2 + after.index('{')
                        he = match_brace(text, hb)
                        seg = text[hb:he]
                    else:
                        seg = after[:600]
                else:
                    seg = text[idx:idx + 800]
                calls = sorted(set(re.findall(r'\b(repository|service|repo|sessions|stores\.users|persistence\.database|automation\.idempotency)\.([A-Za-z]+)\(', seg)))
            else:
                calls = [('fonction', m.group(2))]
            handlers[key] = {
                'file': file, 'line': line_of(text, idx), 'factory': factory, 'condition': condition,
                'calls': ['.'.join(c) for c in calls],
            }
    return handlers


# ─────────────────────────────────────────────────────────────────────────────
# 3. Frontend : clients API, hooks, composants, transitions
# ─────────────────────────────────────────────────────────────────────────────
FAMILY_DIRS = {'EMP': 'employer', 'PRE': 'prestataire', 'ADM': 'admin', 'RTC': 'rtc'}
METHOD_RE = re.compile(r"^  (?:async\s+)?([a-zA-Z][A-Za-z0-9_]*)\s*(?:<[^>\n]*>)?\s*\(", re.M)
SKIP = {'if', 'for', 'while', 'switch', 'return', 'constructor', 'catch', 'function'}


# Appels dont l'URL est fournie par le serveur (pas de littéral) : relevés manuellement.
# prestataire/api.ts:392 uploadDocumentContent → URL du grant d'upload (documents.versions.content.upload).
DYNAMIC_CALLS = {('prestataire', 'uploadDocumentContent'): ('POST', '/documents/:p/versions/:p/content')}


def api_methods(file: Path, contracts: list) -> dict:
    text = file.read_text()
    out = {}
    for m in METHOD_RE.finditer(text):
        name = m.group(1)
        if name in SKIP:
            continue
        b, e = body_after(text, m.start())
        body = text[b:e]
        paths = [norm_path(p) for _, p in re.findall(r"(['\"`])(/[A-Za-z][^'\"`]*)\1", body)]
        paths = [p for p in paths if not p.startswith('//')]
        dynamic = DYNAMIC_CALLS.get((file.parent.name, name))
        if dynamic and not paths:
            http, p = dynamic
            out[name] = {'line': line_of(text, m.start()), 'calls': [{'http': http, 'path': p, 'dynamic': True,
                                                                     'contracts': match_contracts(http, p, contracts)}]}
            continue
        if not paths:
            continue
        mm = re.search(r"method:\s*'(GET|POST|PATCH|DELETE)'", body)
        http = mm.group(1) if mm else 'GET'
        calls = []
        for p in paths:
            calls.append({'http': http, 'path': p, 'contracts': match_contracts(http, p, contracts)})
        out[name] = {'line': line_of(text, m.start()), 'calls': calls}
    return out


def analyse_family(fam: str, contracts: list) -> dict:
    d = SRC / FAMILY_DIRS[fam]
    methods = api_methods(d / 'api.ts', contracts)
    files = sorted((d / 'screens').glob('*.tsx')) + [d / 'components.tsx', d / 'hooks.ts', d / 'UnitBoundary.tsx']
    funcs = {}
    for f in files:
        if not f.exists():
            continue
        text = f.read_text()
        for name, (start, b, e) in top_functions(text).items():
            body = text[b:e]
            funcs[name] = {
                'file': rel(f), 'line': line_of(text, start),
                'api': sorted(set(re.findall(r'\b(?:[A-Za-z]*[aA]pi|client)[!?]?\.([a-zA-Z][A-Za-z0-9_]*)\(', body)) & set(methods)),
                'refs': sorted(set(re.findall(r'\b([A-Za-z_][A-Za-z0-9_]*)\b', body))),
                'hrefs': sorted(set(norm_path(h) for h in re.findall(r"(?:href|to)=\{?\s*[`'\"](/[^`'\"]*)[`'\"]", body)
                                    + re.findall(r"navigate\(\s*[`'\"](/[^`'\"]*)[`'\"]", body))),
                'systemStates': sorted(set(re.findall(r'state=\"([a-z0-9]+)\"', body))),
                'gapNotice': 'GapNotice' in body or 'Gaps' in body,
            }
    names = set(funcs)
    for v in funcs.values():
        v['refs'] = sorted((set(v['refs']) & names))

    def closure(name, seen=None):
        seen = seen or set()
        if name in seen or name not in funcs:
            return seen
        seen.add(name)
        for r in funcs[name]['refs']:
            closure(r, seen)
        return seen
    return {'methods': methods, 'funcs': funcs, 'closure': closure}


def screen_links(fam_data: dict, component: str) -> dict:
    reach = fam_data['closure'](component)
    api, hrefs, states = set(), set(), set()
    # les hooks de session (useXxxSession) sont communs à tous les écrans
    for n in reach:
        f = fam_data['funcs'][n]
        api |= set(f['api'])
        hrefs |= set(f['hrefs'])
        states |= set(f['systemStates'])
    calls = []
    for m in sorted(api):
        for c in fam_data['methods'][m]['calls']:
            calls.append({'method': m, **c})
    return {'apiMethods': sorted(api), 'calls': calls, 'hrefs': sorted(hrefs), 'states': sorted(states),
            'component': fam_data['funcs'].get(component, {})}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Tests qui citent un contrat ou une fiche
# ─────────────────────────────────────────────────────────────────────────────
def test_files() -> list:
    out = []
    for p in list(SRC.rglob('*.test.ts')) + list(SRC.rglob('*.test.tsx')) + list((ROOT / 'scripts').glob('verify-*.ts')):
        out.append((rel(p), p.read_text()))
    return sorted(out)


def tests_for_contract(c: dict, tests: list) -> list:
    rx_path = re.compile(re.escape(c['path']).replace(r'\:', ':').replace(':', ':') )
    concrete = re.compile(
        "/".join(r"(?:\$\{[^}]*\}|[A-Za-z0-9_\-]+|:[A-Za-z]+)" if s.startswith(':') else re.escape(s)
                 for s in c['path'].split('/')) + r"(?![A-Za-z0-9/_-])")
    key = c['key']
    hits = []
    for name, text in tests:
        if f"'{key}'" in text or concrete.search(text):
            hits.append(name)
    return hits


def tests_for_code(code: str, tests: list) -> list:
    rx = re.compile(r"['\"`]" + re.escape(code) + r"['\"`]")
    return [n for n, t in tests if rx.search(t)]



# ─────────────────────────────────────────────────────────────────────────────
# 4bis. Master Design (titres/canons), client legacy, statuts, transitions
# ─────────────────────────────────────────────────────────────────────────────
def design_screens() -> dict:
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(ROOT / 'design'))
    from llab.content import load_all  # noqa: E402
    out = {}
    for fam, screens in load_all().items():
        for sc in screens:
            out[sc.code] = {'title': sc.title, 'canon': sc.canon or sc.title, 'criticality': sc.criticality,
                            'designRoute': sc.route, 'variantOf': sc.variant_of}
    return out


def legacy_api_calls(contracts: list) -> list:
    """Appels du client legacy (`src/repositories/apiRepository.ts`, MODE API de l'application `/`)."""
    file = SRC / 'repositories/apiRepository.ts'
    text = file.read_text()
    out = []
    for m in re.finditer(r"request<[^>]*>\(\s*", text):
        window = text[m.end():m.end() + 400]
        stop = re.search(r"request<|this\.page<|\n\s{4,}[A-Za-z]+:\s*(?:async\s*)?\(|\n\s*\}", window)
        if stop:
            window = window[:stop.start()]
        paths = [norm_path(p) for _, p in re.findall(r"(['`])(/[A-Za-z][^'`]*)\1", window)]
        if not paths:
            continue
        mm = re.search(r"method:\s*'(GET|POST|PATCH|DELETE)'", window)
        http = mm.group(1) if mm else 'GET'
        for p in paths:
            out.append({'line': line_of(text, m.start()), 'http': http, 'path': p, 'contracts': match_contracts(http, p, contracts)})
    for m in re.finditer(r"this\.page<[^>]*>\(\s*(['`])(/[^'`]*)\1", text):
        p = norm_path(m.group(2))
        out.append({'line': line_of(text, m.start()), 'http': 'GET', 'path': p, 'contracts': match_contracts('GET', p, contracts)})
    return out


def route_patterns(dump: dict) -> list:
    pats = []
    for u in dump['units']:
        for r in u['routes']:
            pats.append(r)
    for sc in dump['publicScreens']:
        pats.append(sc['route'])
    for st in dump['stateGuard']:
        pats.append(st['route'])
    for ns in dump['namespaces']:
        pats.append(ns['index'])
    return sorted(set(pats))


def href_target(href: str, patterns: list):
    segs = href.strip('/').split('/')
    for pat in patterns:
        ps = pat.strip('/').split('/')
        if len(ps) != len(segs):
            continue
        if all(a == b or a == ':p' or b.startswith(':') for a, b in zip(segs, ps)):
            return pat
    return None


def screen_status(screen: dict, contract_index: dict) -> tuple:
    """Statut réel d'une fiche : jamais « COMPLET » (voir 00-INDEX, légende)."""
    if screen['family'] == 'FIN':
        return 'BLOQUÉ_EN_ATTENTE_DÉCISION', 'Unité FIN : aucune route, aucun composant ; décision propriétaire requise.'
    if screen['family'] in ('PUB', 'SYS'):
        return screen.get('status', 'NON_VÉRIFIÉ'), screen.get('statusNote', '')
    if not screen['component']:
        return 'NON_IMPLÉMENTÉ', 'Aucun composant enregistré pour la fiche.'
    keys = sorted({k for c in screen['calls'] for k in c['contracts']})
    if not keys:
        return 'FRONTEND_PARTIEL', 'Composant diagnostique : aucun appel API dans le composant (BACKEND_GAP affiché).'
    absent = [k for k in keys if contract_index[k]['probe']['postgresR2']['handler'] == 'ABSENT']
    if len(absent) == len(keys):
        return 'FRONTEND_PARTIEL', 'Tous les contrats appelés répondent 501 (handler absent) : ' + ', '.join(absent)
    needs_r2 = [k for k in keys if contract_index[k]['probe']['postgres']['handler'] == 'ABSENT' and k not in absent]
    pg_only = [k for k in keys if contract_index[k]['probe']['memory']['handler'] != 'ATTEINT' and k not in absent]
    note = []
    if absent:
        note.append('contrats sans handler (501) : ' + ', '.join(absent))
    if needs_r2:
        note.append('exige stockage objet (DOCUMENTS_BUCKET) : ' + ', '.join(needs_r2))
    if pg_only and not needs_r2:
        note.append('exige PERSISTENCE=postgres')
    return 'RACCORDÉ_PARTIEL', '; '.join(note) or 'Handlers atteints ; BACKEND_GAP déclarés pour la partie fiche non couverte.'

# ─────────────────────────────────────────────────────────────────────────────
# 5. Assemblage
# ─────────────────────────────────────────────────────────────────────────────
PUB_STATUS = {
    'PUB-01': ('RACCORDÉ_PARTIEL', 'Sonde GET /auth/session (si MODE API) puis redirection ; route canonique « / » occupée par le legacy.'),
    'PUB-02': ('FRONTEND_PARTIEL', 'Page d’accueil sans appel API.'),
    'PUB-03': ('FRONTEND_PARTIEL', 'Choix du profil mémorisé côté navigateur ; aucun appel API.'),
    'PUB-04': ('RACCORDÉ_PARTIEL', 'POST /auth/google/credential (intent login) ; exige GOOGLE_CLIENT_ID (vide dans wrangler.toml).'),
    'PUB-05': ('FRONTEND_PARTIEL', 'Bouton « Créer mon compte » désactivé ; le contrat serveur existe (intent register) mais n’est pas appelé.'),
    'PUB-06': ('NON_IMPLÉMENTÉ', 'OTP téléphone : aucun contrat serveur ; bouton désactivé.'),
    'PUB-07': ('NON_IMPLÉMENTÉ', 'Récupération : aucun contrat serveur ; bouton désactivé.'),
    'PUB-08': ('NON_IMPLÉMENTÉ', 'Acceptation CGU : aucun contrat serveur ; boutons désactivés.'),
    'PUB-09': ('RACCORDÉ_PARTIEL', 'GET /auth/session + POST /auth/logout ; contestation/export désactivés.'),
    'PUB-10': ('FRONTEND_PARTIEL', 'Aucune source d’état de maintenance ; boutons désactivés.'),
}


# Liens PUB relevés manuellement dans src/public/PublicPage.tsx (lignes citées) et src/public/auth.ts.
PUB_LINKS = {
    'PUB-01': ([('session', 'GET', '/auth/session', 'PublicPage.tsx:108 → auth.ts:10')], ['/accueil (PublicPage.tsx:102,116,130)', '/ (si session confirmée, PublicPage.tsx:108)']),
    'PUB-02': ([], ['/onboarding/profil (l.157)', '/connexion (l.158,161)', '/legal (l.161)']),
    'PUB-03': ([], ['/inscription (l.195)']),
    'PUB-04': ([('google', 'POST', '/auth/google/credential', 'PublicPage.tsx:226 → auth.ts:16 (intent login)'), ('session', 'GET', '/auth/session', 'auth.ts:21')],
               ['/ legacy après connexion (l.227)', '/recuperation (l.244)', '/onboarding/profil (l.244)', '/compte-bloque sur 403 (l.262)']),
    'PUB-05': ([], ['/onboarding/profil (l.275)', '/connexion (l.275)']),
    'PUB-06': ([], ['/inscription (l.282)']),
    'PUB-07': ([], ['/connexion (l.288)']),
    'PUB-08': ([], []),
    'PUB-09': ([('session', 'GET', '/auth/session', 'useSessionProbe l.96'), ('logout', 'POST', '/auth/logout', 'PublicPage.tsx:327 → auth.ts:23')], ['/accueil après déconnexion (l.327)']),
    'PUB-10': ([], []),
}
PUB_EXIT = 'liens de sortie communs (sauf PUB-01) : /accueil, /connexion, /legal, / (PublicPage.tsx:54-57)'


def md_escape(v) -> str:
    return str(v).replace('|', '\\|').replace('\n', ' ')


def short_tests(tests: list, limit: int = 3) -> str:
    if not tests:
        return '—'
    names = [t.split('/')[-1] for t in tests]
    more = f' (+{len(names) - limit})' if len(names) > limit else ''
    return ', '.join(names[:limit]) + more


def write_contracts_md(rows: list, counts: dict) -> None:
    lines = [
        '# C2 — Contrats d’API, handlers et sonde dynamique (fichier généré)',
        '',
        '> Généré par `outils/cartographie.py` — ne pas éditer à la main. Source : `src/backend/api/routeContracts.ts` (`API_ROUTE_CONTRACTS`),',
        '> fabriques de handlers (fichier:ligne de la clé), `ROUTE_BUCKET_MAP` (`src/backend/api/security.ts`), sonde `composeWorker`.',
        '',
        'Colonnes de sonde : **mém.** = `PERSISTENCE=memory` + vérificateur Google injecté ; **pg** = PostgreSQL (PGlite + migrations 0001–0018) ;',
        '**pg+obj** = PostgreSQL + stockage objet en mémoire + secret de signature. `✔` handler atteint (toute réponse autre que 501 NOT_IMPLEMENTED),',
        '`501` handler absent, `·` non sondé (acteur ADMIN non provisionnable en mode mémoire). En composition fermée (`GOOGLE_CLIENT_ID` vide, cas de `wrangler.toml`),',
        f"les {counts['probe']['closed']['NON_SONDÉ']} routes authentifiées répondent 401 et les {counts['probe']['closed']['ABSENT']} routes publiques 501.",
        '',
        '| # | Clé | Méthode & chemin | Accès (auth · portée · rôles · permission) | Idem. | Seau rate-limit | Handler (fichier:ligne → appels) | Condition de composition | mém. | pg | pg+obj | Écrans appelants | Tests citant la route |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ]
    sym = {'ATTEINT': '✔', 'ABSENT': '501', 'NON_SONDÉ': '·'}
    for n, r in enumerate(rows, 1):
        access = ' · '.join(x for x in [r['authentication'], r.get('scope') or '', ','.join(r.get('roles') or []), r.get('permission') or ''] if x)
        h = r['handler']
        hs = f"`{h['file']}:{h['line']}` → {', '.join(h['calls']) or '—'}" if h else '**AUCUN** (501 NOT_IMPLEMENTED)'
        cond = h['condition'] if h else '—'
        screens = ', '.join(r['usedByScreens'][:6]) + (f" (+{len(r['usedByScreens']) - 6})" if len(r['usedByScreens']) > 6 else '') or '—'
        lines.append('| ' + ' | '.join(md_escape(x) for x in [
            n, f"`{r['key']}`", f"{r['method']} `{r['path']}`", access, 'oui' if r.get('idempotency') else '—',
            r['rateLimitBucket'] or '—', hs, cond, sym[r['probe']['memory']['handler']], sym[r['probe']['postgres']['handler']],
            sym[r['probe']['postgresR2']['handler']], screens or '—', short_tests(r['tests'])]) + ' |')
    (OUT / 'C2-contrats-api.md').write_text('\n'.join(lines) + '\n')


FAMILY_TITLES = {'PUB': 'Public / Auth', 'EMP': 'Employeur (Client)', 'PRE': 'Candidat / Prestataire', 'ADM': 'ADMIN (supervision)',
                 'RTC': 'Temps réel (RTC)', 'SYS': 'États système (SYS)', 'FIN': 'Finance transversale (FIN)'}


def write_matrix_md(screens: list, contract_index: dict) -> None:
    lines = [
        '# D — Matrice exhaustive écrans ↔ API (fichier généré)',
        '',
        '> Généré par `outils/cartographie.py` — ne pas éditer à la main. 211 fiches (états) du Master Design, groupées par famille.',
        '> Légende des statuts et méthode : voir `D0-methode-matrice.md`. Aucune fiche n’est déclarée « COMPLET ».',
        '',
    ]
    for fam in ['PUB', 'EMP', 'PRE', 'ADM', 'RTC', 'SYS', 'FIN']:
        rows = [x for x in screens if x['family'] == fam]
        lines += [f'## {fam} — {FAMILY_TITLES[fam]} ({len(rows)} fiches)', '',
                  '| Fiche | Unité | Titre canonique (Master) | Route frontend | Composant enregistré | Transitions sortantes (cible résolue) | API appelée (méthode client → HTTP) | Contrat | Handler | Accès | Service & données | Tests | Statut réel | BACKEND_GAP & cause |',
                  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
        for x in rows:
            comp = f"`{x['component']}` ({x['componentFile']}:{x.get('componentLine') or '—'})" if x.get('component') and x.get('componentLine') else (f"`{x['component']}` ({x['componentFile']})" if x.get('component') else '—')
            trans = '<br>'.join(f"{h}{'' if t else ' **HORS DESIGN → écran de repli**'}" for h, t in x.get('hrefTargets', [])) or '—'
            api = '<br>'.join(f"{c['method']} → {c['http']} {c['path']}" for c in x['calls']) or '—'
            keys = sorted({k for c in x['calls'] for k in c['contracts']})
            cons = '<br>'.join(f"`{k}`" for k in keys) or '—'
            hand = '<br>'.join((f"{contract_index[k]['handler']['file'].split('/')[-1]}:{contract_index[k]['handler']['line']}" if contract_index[k]['handler'] else '**501**') for k in keys) or '—'
            acc = '<br>'.join(' · '.join(v for v in [contract_index[k].get('scope') or contract_index[k]['authentication'], ','.join(contract_index[k].get('roles') or []), contract_index[k].get('permission') or ''] if v) for k in keys) or '—'
            svc = '<br>'.join(', '.join(contract_index[k]['handler']['calls'][:2]) if contract_index[k]['handler'] else '—' for k in keys) or '—'
            gaps = '<br>'.join(md_escape(g) for g in x.get('gaps', [])) or '—'
            title = x.get('designTitle') or x.get('unitLabel') or ''
            lines.append('| ' + ' | '.join(md_escape(v) if i not in (5, 6, 7, 8, 9, 10, 13) else v for i, v in enumerate([
                x['code'], x.get('unit') or '—', title, f"`{x['route']}`" if x.get('route') else '—', comp, trans, api, cons, hand, acc, svc,
                short_tests(x.get('tests', [])), f"**{x['status']}** — {md_escape(x['statusNote'])}", gaps])) + ' |')
        lines.append('')
    (OUT / 'D-matrice-ecrans-api.md').write_text('\n'.join(lines) + '\n')


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    dump = run_ts(DUMP_TS, 'dump')
    probe = run_ts(PROBE_TS, 'probe')
    contracts = dump['contracts']
    keys = {c['key'] for c in contracts}
    handlers = extract_handlers(keys)
    tests = test_files()
    design = design_screens()
    patterns = route_patterns(dump)

    sec = (SRC / 'backend/api/security.ts').read_text()
    bucket_map = dict(re.findall(r"^\s*'([a-z][a-z0-9.\-]+)':\s*'([a-z\-]+)',", sec[sec.index('ROUTE_BUCKET_MAP'):], re.M))

    contract_rows = []
    for c in contracts:
        contract_rows.append({
            **c, 'handler': handlers.get(c['key']),
            'probe': {m: probe[m][c['key']] for m in ('closed', 'memory', 'postgres', 'postgresR2')},
            'rateLimitBucket': bucket_map.get(c['key']), 'tests': tests_for_contract(c, tests),
        })
    contract_index = {r['key']: r for r in contract_rows}

    fams = {f: analyse_family(f, contracts) for f in FAMILY_DIRS}
    used_by = defaultdict(set)
    screens = []
    unit_of_code = {code: u for u in dump['units'] for code in u['screenCodes']}
    resolved = {r['route']: r for r in dump['resolved']}
    for fam in FAMILY_DIRS:
        data = dump[fam]
        for s in data['screens']:
            comp = data['registry'].get(s['code'])
            links = screen_links(fams[fam], comp) if comp else {'calls': [], 'hrefs': [], 'states': [], 'apiMethods': [], 'component': {}}
            for call in links['calls']:
                for k in call['contracts']:
                    used_by[k].add(s['code'])
            u = unit_of_code[s['code']]
            screens.append({
                'family': fam, 'code': s['code'], 'unit': u['id'], 'unitLabel': u['label'],
                'route': s['route'], 'resolvedScreen': resolved.get(s['route'], {}).get('screenCode'),
                'resolvedUnit': resolved.get(s['route'], {}).get('resolvedUnit'),
                'component': comp, 'componentFile': links['component'].get('file'), 'componentLine': links['component'].get('line'),
                'apiMethods': links['apiMethods'], 'calls': links['calls'], 'hrefs': links['hrefs'],
                'designApi': s['designApi'], 'gaps': data['gaps'].get(s['code'], []),
                'integration': dump['integration'].get(u['id']), 'tests': tests_for_code(s['code'], tests),
            })
    pub_gaps = dump['publicGaps'].get('PUBLIC_GAPS', {})
    for s in dump['publicScreens']:
        u = unit_of_code[s['code']]
        st, note = PUB_STATUS[s['code']]
        screens.append({'family': 'PUB', 'code': s['code'], 'unit': u['id'], 'unitLabel': u['label'], 'route': s['route'],
                        'canonicalRoute': s['canonicalRoute'], 'component': 'PublicPage', 'componentFile': 'src/public/PublicPage.tsx',
                        'designApi': s['api'], 'gaps': ([pub_gaps[s['code']]['explanation']] if s['code'] in pub_gaps else []), 'integration': dump['integration'].get(u['id']),
                        'tests': tests_for_code(s['code'], tests),
                        'calls': [{'method': f"PublicAuth.{m} ({ref})", 'http': h, 'path': pth, 'contracts': match_contracts(h, pth, contracts)} for m, h, pth, ref in PUB_LINKS[s['code']][0]],
                        'hrefs': [], 'manualHrefs': PUB_LINKS[s['code']][1] + ([PUB_EXIT] if s['code'] != 'PUB-01' else []),
                        'apiMethods': [], 'status': st, 'statusNote': note,
                        'resolvedUnit': resolved.get(s['route'], {}).get('resolvedUnit')})
    for stt in dump['stateGuard']:
        u = unit_of_code.get(stt['code'])
        screens.append({'family': 'SYS', 'code': stt['code'], 'unit': u['id'] if u else None, 'unitLabel': u['label'] if u else None,
                        'route': stt['route'], 'stateKey': stt['key'], 'component': 'StateGuard',
                        'componentFile': 'src/design-system/shells/ShellRoute.tsx', 'designApi': [], 'gaps': [],
                        'integration': dump['integration'].get(u['id']) if u else None, 'tests': tests_for_code(stt['code'], tests),
                        'calls': [], 'hrefs': [], 'apiMethods': [], 'status': 'ÉTAT_FRONTEND',
                        'statusNote': f"État « {stt['key']} » rendu par le shell SYSTEM sous /etat ; aucun appel API attendu.",
                        'resolvedUnit': resolved.get(stt['route'], {}).get('resolvedUnit')})
    for u in dump['units']:
        if u['family'] == 'FIN':
            screens.append({'family': 'FIN', 'code': u['screenCodes'][0], 'unit': u['id'], 'unitLabel': u['label'], 'route': None,
                            'component': None, 'designApi': [], 'gaps': [], 'integration': dump['integration'].get(u['id']),
                            'tests': tests_for_code(u['screenCodes'][0], tests), 'calls': [], 'hrefs': [], 'apiMethods': []})
    for x in screens:
        d = design.get(x['code'], {})
        x['designTitle'] = d.get('title')
        x['designCanon'] = d.get('canon')
        x['criticality'] = d.get('criticality')
        x['designRoute'] = d.get('designRoute')
        x['hrefTargets'] = [(h, href_target(h, patterns)) for h in x['hrefs']] + [(h, 'manuel') for h in x.get('manualHrefs', [])]
        x['status'], x['statusNote'] = screen_status(x, contract_index)
    for row in contract_rows:
        row['usedByScreens'] = sorted(used_by.get(row['key'], []))

    unmatched = []
    for fam, data in fams.items():
        for m, info in data['methods'].items():
            for c in info['calls']:
                if not c['contracts']:
                    unmatched.append({'family': fam, 'method': m, **c})
    legacy = legacy_api_calls(contracts)

    from collections import Counter
    inventory = {
        'source': {'head': subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()},
        'counts': {
            'designStates': len(design), 'designCanons': len({(d['canon']) for d in design.values()}),
            'contracts': len(contracts), 'units': len(dump['units']), 'publicScreens': len(dump['publicScreens']),
            'stateGuard': len(dump['stateGuard']),
            'familyScreens': {f: len(dump[f]['screens']) for f in FAMILY_DIRS},
            'registry': {f: len(dump[f]['registry']) for f in FAMILY_DIRS},
            'handlersStatic': len(handlers),
            'probe': {m: {k: sum(1 for v in probe[m].values() if v['handler'] == k) for k in ('ATTEINT', 'ABSENT', 'NON_SONDÉ')} for m in probe},
            'screenStatus': {f: dict(Counter(x['status'] for x in screens if x['family'] == f)) for f in FAMILY_TITLES},
            'contractsWithoutScreen': sum(1 for r in contract_rows if not r['usedByScreens']),
            'unknownTransitions': sum(1 for x in screens for _, t in x['hrefTargets'] if not t),
        },
        'staticVsDynamicHandlerMismatch': [r['key'] for r in contract_rows if bool(r['handler']) != (r['probe']['postgresR2']['handler'] == 'ATTEINT')],
        'rateLimitOrphans': sorted(k for k in bucket_map if k not in keys),
        'frontendUnmatchedPaths': unmatched,
        'legacyApiCalls': legacy,
        'integration': dump['integration'],
        'resolved': dump['resolved'],
        'routeResolutionMismatch': [{'code': x['code'], 'route': x['route'], 'resolvedScreen': x.get('resolvedScreen')}
                                    for x in screens if x['family'] in FAMILY_DIRS and x.get('resolvedScreen') != x['code']],
    }
    (DATA / 'inventaire.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=1))
    (DATA / 'contrats-api.json').write_text(json.dumps(contract_rows, ensure_ascii=False, indent=1))
    (DATA / 'ecrans.json').write_text(json.dumps(screens, ensure_ascii=False, indent=1))
    (DATA / 'api-frontend.json').write_text(json.dumps({f: fams[f]['methods'] for f in fams}, ensure_ascii=False, indent=1))
    write_contracts_md(contract_rows, inventory['counts'])
    write_matrix_md(screens, contract_index)
    print(json.dumps(inventory['counts'], ensure_ascii=False, indent=1))
    print('mismatch statique/dynamique :', inventory['staticVsDynamicHandlerMismatch'])
    print('rateLimitOrphans :', inventory['rateLimitOrphans'])
    print('chemins frontend sans contrat :', len(unmatched))
    print('appels legacy sans contrat :', [c['path'] for c in legacy if not c['contracts']])
    print('résolution de route ≠ fiche :', len(inventory['routeResolutionMismatch']))


def sync_diagrams() -> None:
    """Recopie chaque `diagrammes/NN-*.mmd` dans les blocs `<!-- DIAGRAMME:NN-* -->` des documents (source unique : le .mmd)."""
    pattern = re.compile(r'<!-- DIAGRAMME:([\w-]+) -->.*?<!-- /DIAGRAMME -->', re.S)
    for doc in sorted(OUT.glob('*.md')):
        text = doc.read_text()
        def repl(m):
            src = OUT / 'diagrammes' / (m.group(1) + '.mmd')
            body = src.read_text().rstrip() if src.exists() else '%% DIAGRAMME INTROUVABLE : ' + m.group(1)
            return (f'<!-- DIAGRAMME:{m.group(1)} -->\n_Source : [`diagrammes/{m.group(1)}.mmd`](diagrammes/{m.group(1)}.mmd)_\n\n'
                    f'```mermaid\n{body}\n```\n<!-- /DIAGRAMME -->')
        new = pattern.sub(repl, text)
        if new != text:
            doc.write_text(new)


if __name__ == '__main__':
    if '--diagrammes' in sys.argv:
        sync_diagrams()
    else:
        main()
        sync_diagrams()
