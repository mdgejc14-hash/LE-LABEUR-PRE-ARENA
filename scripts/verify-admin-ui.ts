/**
 * P4B-1-DESIGN-ADMIN-CONTRACTS — vérification UI réelle (Chromium) de l'espace
 * supervision livré (P4A + P4B-1 contrats).
 *
 * Comme le script P2, ce script n'affirme rien sur des données simulées dans
 * l'application : les fixtures HTTP vivent ICI et ne sont jamais activées dans
 * le produit. Ce qui est vérifié dans un navigateur réel :
 *
 *  1. AUCUNE source de données configurée : les 17 fiches ADM rendent leur
 *     conteneur (`data-unit`, `data-screen`), la structure déclarée par le
 *     design (`data-sheet-frame`) et le BACKEND_GAP, sans débordement
 *     horizontal à 360 px comme à 1440 px ; aucun terme du Master Design ni
 *     libellé financier interdit n'est rendu ;
 *  2. session ADMIN + réponses serveur (fixtures) : le registre des contrats
 *     affiche les valeurs réellement reçues (référence, statut, parties,
 *     montant du contrat), la fiche compose ses zones depuis ces mêmes données,
 *     les incidents affichent le Claim rattaché, le journal rend
 *     l'historique émis — et l'état « hors page chargée » reste honnête pour
 *     une référence absente ;
 *  3. la fiche de révision forcée (ADM-16) ne rend AUCUN formulaire : aucune
 *     saisie là où aucune commande serveur n'existe ;
 *  4. refus réels : compte non-ADMIN → StateGuard 403, session absente → 401,
 *     erreur serveur → 500 avec la seule corrélation du serveur, jamais un
 *     secret ni un message brut ;
 *  5. clavier et focus : navigation au dock avec focus rendu au contenu,
 *     segment du registre activable au clavier (aria-pressed), tables sémantiques ;
 *  6. reduced-motion : les transitions de l'espace supervision sont neutralisées.
 *
 * Exécution : `npm run verify:admin-ui`.
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import bundledChromium from '@sparticuz/chromium';
import { createServer, type ViteDevServer } from 'vite';
import { ADMIN_DESIGN_SCREENS } from '../src/admin/catalog';
import { unitForScreen, resolveAdminScreen } from '../src/admin/screenMap';
import { deliveredScreensForUnit } from '../src/admin/screenMap';
import { DOCK_DEFINITIONS } from '../src/design-system/shells/shellNavigation';

const FORBIDDEN = ['Mission', 'Missions', 'Client', 'Clients', 'Prestataire', 'Prestataires', 'Prestation', 'Litige', 'Litiges'];
const FORBIDDEN_FINANCE = ['Prix Prestataire', 'Frais SaaS', 'Total Client', 'barème', 'Barème', 'séquestre', 'escrow'];
const SERVER_SECRET = 'SECRET_MUST_NOT_RENDER';
const SERVER_REQUEST_ID = 'req-adm-456';

/** Chemin concret d'un motif de fiche (`:id` → référence présente dans les fixtures). */
function concretePath(pattern: string): string {
  return pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? 'ctr-e2e-1' : segment))
    .join('/');
}

// Bibliothèques du runtime Chromium empaqueté (aucun téléchargement, installation système minimale).
const require = createRequire(import.meta.url);
const libraryDirectory = resolve('.tmp/p4b1-chromium');
if (!process.env.CHROMIUM_PATH && process.platform === 'linux') {
  mkdirSync(libraryDirectory, { recursive: true });
  const archive = resolve(require.resolve('@sparticuz/chromium'), '../../bin/al2023.tar.br');
  writeFileSync(resolve(libraryDirectory, 'al2023.tar'), brotliDecompressSync(readFileSync(archive)));
  execFileSync('tar', ['-xf', resolve(libraryDirectory, 'al2023.tar'), '-C', libraryDirectory]);
}

/* ── Fixtures de réponse serveur (test-only) : DTOs réels du produit ── */

const FIXTURE_CONTRACT = {
  id: 'ctr-e2e-1',
  offerId: 'off-e2e-1',
  offerTitle: 'Entretien ménager hebdomadaire',
  proposalId: 'prp-e2e-1',
  applicationId: 'app-e2e-1',
  employerId: 'usr-emp-e2e',
  employerName: 'A. Gbian',
  employeeId: 'usr-can-e2e',
  employeeName: 'R. Sika',
  monthlySalary: 120000,
  currency: 'XOF',
  startDate: '2026-09-01T00:00:00.000Z',
  currentMonth: 2,
  status: 'ACTIVE',
  employerSigned: true,
  employerSignedAt: '2026-08-28T09:00:00.000Z',
  employeeSigned: true,
  employeeSignedAt: '2026-08-30T10:30:00.000Z',
  missionDescription: 'Entretien des communs chaque lundi et jeudi.',
  location: 'Abomey-Calavi',
  durationMonths: 6,
  periodicity: 'MENSUELLE',
  conditions: ['Période d’essai de 15 jours', 'Reprise en cas d’absence'],
  monthlyCheckpoints: [
    { monthNumber: 1, periodKey: '2026-09', salaryAmount: 120000, employeeShareAmount: 120000, leLabeurShareAmount: 30000, currency: 'XOF', isStarted: true, employerStartAnswer: 'YES', employeeStartAnswer: 'YES', startConfirmed: true },
  ],
  commissionLedger: [],
  paymentSchedule: [],
  commissionPercentage: 25,
  commissionAmountDue: 30000,
  commissionStatus: 'SCHEDULED',
  history: [
    { id: 'log-e2e-1', timestamp: '2026-08-25T10:00:00.000Z', event: 'CONTRACT_CREATED', description: 'Contrat préparé en brouillon depuis la proposition acceptée prp-e2e-1.', actor: 'A. Gbian' },
    { id: 'log-e2e-2', timestamp: '2026-09-02T08:00:00.000Z', event: 'CONTRACT_ACTIVATED', description: 'Double signature bilatérale complétée : contrat actif.', actor: 'Système' },
  ],
};

const FIXTURE_CLAIM = {
  claimId: 'clm-e2e-1',
  contractId: 'ctr-e2e-1',
  claimantId: 'usr-can-e2e',
  respondentId: 'usr-emp-e2e',
  type: 'CONTRACT_INCIDENT',
  reason: 'Retard de reprise signalé',
  status: 'OPEN',
  createdAt: '2026-09-20T00:00:00.000Z',
  metadata: {},
  idempotencyKey: 'seed-e2e-1',
  evidenceRequests: [],
  restrictions: [],
};

type SessionMode = 'admin' | 'employer' | 'anonymous' | 'error';

async function startApp(environment: 'demo' | 'api'): Promise<{ origin: string; server: ViteDevServer }> {
  const server = await createServer({
    server: { host: '0.0.0.0', port: 0 },
    define:
      environment === 'api'
        ? {
            'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
            'import.meta.env.VITE_API_BASE_PATH': JSON.stringify('/api/v1'),
          }
        : { 'import.meta.env.VITE_DEMO_MODE': JSON.stringify('true') },
  });
  await server.listen();
  const address = server.httpServer!.address();
  assert.ok(address && typeof address !== 'string');
  return { origin: `http://127.0.0.1:${address.port}`, server };
}

let browser;
let passed = 0;
let demoServer: ViteDevServer | undefined;
let apiServer: ViteDevServer | undefined;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (await bundledChromium.executablePath()),
    args: bundledChromium.args.filter((arg) => !arg.includes('disable-web-security') && !arg.includes('allow-running-insecure-content')),
    headless: true,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: [resolve(libraryDirectory, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
    },
  });
  const context = await browser.newContext();
  await context.addInitScript('window.__name = (value) => value;');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  /** Fixtures HTTP : session réelle et pages ADMIN réelles (jamais dans l'application). */
  let sessionMode: SessionMode = 'admin';
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/session')) {
      if (sessionMode === 'anonymous') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (sessionMode === 'error') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: 'usr-admin-e2e',
            role: sessionMode === 'admin' ? 'ADMIN' : 'EMPLOYER',
            status: 'ACTIVE',
            displayName: sessionMode === 'admin' ? 'Superviseur de test' : 'Employeur de test',
          },
          permissions: sessionMode === 'admin' ? ['users:read:any', 'contracts:read:any', 'incidents:read:any'] : [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/contracts') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [FIXTURE_CONTRACT], cursor: null, limit: 100, hasMore: false }) });
      return;
    }
    if (url.pathname === '/api/v1/admin/claims') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [FIXTURE_CLAIM], cursor: null, limit: 100, hasMore: false }) });
      return;
    }
    if (url.pathname === '/api/v1/admin/users') {
      // Non-régression P4A : page vide réelle (aucun compte inventé).
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], cursor: null, limit: 100, hasMore: false }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ressource non attendue par la vérification.', requestId: SERVER_REQUEST_ID } }) });
  });

  const check = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      console.error('URL', page.url(), 'ERREURS', errors);
      throw error;
    }
    passed += 1;
    console.log(`PASS ${name}`);
  };

  const screenText = () => page.locator('[data-unit]').first().innerText();
  const says = (text: string, needle: string) => text.toLowerCase().includes(needle.toLowerCase());
  const stripTechnicalTokens = (text: string) =>
    text.replace(/[A-Za-z0-9_@?&=%./:[\]{}#-]*\/[A-Za-z0-9_@?&=%./:[\]{}#-]*/g, ' ');
  const assertNoForbiddenText = async (label: string, rawText: string) => {
    const text = stripTechnicalTokens(rawText);
    for (const term of FORBIDDEN) {
      assert.ok(!new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, 'iu').test(text), `${label} : terme interdit « ${term} » rendu`);
    }
    for (const finance of FORBIDDEN_FINANCE) assert.ok(!text.includes(finance), `${label} : libellé financier interdit « ${finance} » rendu`);
    assert.ok(!text.includes(SERVER_SECRET), `${label} : message serveur brut rendu`);
  };

  /* ── 1. Aucune source de données configurée : 17 fiches, deux largeurs ── */
  const demo = await startApp('demo');
  demoServer = demo.server;
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`ADM fiches — ${ADMIN_DESIGN_SCREENS.length} fiches rendues, structure déclarée inspectable, source absente dite (${width}px)`, async () => {
      for (const screen of ADMIN_DESIGN_SCREENS) {
        const path = concretePath(screen.route);
        const unitId = unitForScreen(screen.code);
        await page.goto(demo.origin + path);
        await page.locator(`[data-screen="${screen.code}"]`).waitFor();
        await page.locator(`[data-unit="${unitId}"]`).waitFor();
        await page.locator(`[data-sheet-frame="${screen.code}"]`).waitFor();
        await page.locator('[data-backend-gap="true"]').first().waitFor();
        const text = await screenText();
        assert.ok(says(text, 'Source de données non configurée'), `${path} : absence de source non dite`);
        await assertNoForbiddenText(path, text);
        assert.equal(await page.locator('main').count(), 1, `${path} : un seul main attendu`);
        const zones = await page.locator('[data-zone]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-zone')));
        for (const kind of screen.zoneKinds as readonly string[]) {
          assert.ok(zones.includes(kind), `${path} : zone déclarée « ${kind} » absente`);
        }
        for (const zone of zones) {
          assert.ok((screen.zoneKinds as readonly string[]).includes(zone!), `${path} : genre de zone inventé « ${zone} »`);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} : débordement horizontal`);
      }
    });
  }

  await check('ADM dock + clavier — onglets réels, focus rendu au contenu, segments du registre activables au clavier', async () => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(demo.origin + '/admin');
    await page.locator('[data-screen="ADM-01"]').waitFor();
    for (const item of DOCK_DEFINITIONS.ADM) {
      assert.equal(await page.locator(`.lbm-dock a[href="${item.href}"]`).count(), 1, `onglet absent : ${item.href}`);
    }
    // Navigation réelle depuis une fiche livrée vers l'onglet « Flux » : le focus
    // doit être rendu au contenu principal (accessibilité clavier du shell P0).
    await page.goto(demo.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    await page.locator('.lbm-dock a[href="/admin"]').click();
    await page.waitForURL(`${demo.origin}/admin`);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'lbm-main', 'focus non rendu au contenu après navigation');
    // Repli honnête : un chemin ADM sans fiche de la tranche reste traité par la
    // fondation (unité rattachée non intégrée ou 404 de shell), jamais une fausse page.
    await page.goto(demo.origin + '/admin/matching/runs');
    await page.locator('[data-route-fallback="true"], [data-state], [data-unit]').first().waitFor();
    const fallback = await page.locator('[data-route-fallback="true"]').count();
    if (fallback > 0) {
      const text = await screenText();
      assert.ok(says(text, 'Aucun écran livré'), 'repli sans libellé de désignation');
    } else {
      assert.ok(await page.locator('[data-state], [data-unit]').first().isVisible(), 'état honnête attendu');
    }
  });

  await check('ADM chemin sans fiche — aucune invention : repli ou unité rattachée, libellé du design jamais rendu', async () => {
    assert.equal(resolveAdminScreen('/admin/contrats/ctr-9/versions'), null, 'aucune fiche ADMIN « versions » ne doit exister');
    await page.goto(demo.origin + '/admin/contrats/ctr-9/versions');
    const bodyText = await page.locator('body').innerText();
    assert.ok(!says(bodyText, 'ADM — contrat (fiche'), 'libellé du Master Design rendu');
    // La route est hors fiches livrées : soit 404 de shell, soit repli — jamais une fausse page contrats.
    assert.equal(await page.locator('[data-screen="ADM-14"]').count(), 0, 'aucune fiche ne doit être rendue sur un chemin non décrit');
  });

  /* ── 2. Session ADMIN + données serveur réelles (fixtures) ── */
  const api = await startApp('api');
  apiServer = api.server;

  await check('ADM registre (ADM-13) — les valeurs affichées viennent de la réponse serveur, aucune donnée de démonstration', async () => {
    sessionMode = 'admin';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    await page.locator('text=ctr-e2e-1').first().waitFor();
    const text = await screenText();
    assert.ok(text.includes('ctr-e2e-1'), 'référence réelle absente du registre');
    assert.ok(says(text, 'A. Gbian') && says(text, 'R. Sika'), 'parties réelles absentes');
    assert.ok(/120[\s\u00a0\u202f]?000/.test(text), 'salaire mensuel réel absent');
    assert.ok(says(text, 'Actif'), 'statut réel absent');
    assert.ok(!says(text, 'Source de données non configurée'), 'la mention « source absente » ne doit plus apparaître avec une source réelle');
    await assertNoForbiddenText('/admin/contrats', text);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal 1440');
    await page.setViewportSize({ width: 360, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal 360');
  });

  await check('ADM registre — segment clavier : le filtre local sélectionne sur la donnée réelle (aria-pressed)', async () => {
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    const chip = page.locator('button:has-text("En incident")').first();
    await chip.focus();
    await chip.press('Enter');
    assert.equal(await chip.getAttribute('aria-pressed'), 'true', 'segment non activé au clavier');
    const text = await screenText();
    assert.ok(says(text, 'Aucun contrat sur les filtres'), 'le filtre doit vider honnêtement la table (aucun contrat INCIDENT dans la page)');
    assert.equal(await page.locator('td:has-text("ctr-e2e-1")').count(), 0, 'le contrat ACTIF ne doit pas rester sous le segment incident');
  });

  await check('ADM fiche (ADM-14) — parties, conditions, signatures, frise et jalons composés depuis la page réelle', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1');
    await page.locator('[data-screen="ADM-14"]').waitFor();
    const text = await screenText();
    assert.ok(text.includes('ctr-e2e-1'), 'référence absente');
    assert.ok(says(text, 'Période d’essai de 15 jours'), 'condition réelle absente');
    assert.ok(says(text, 'Signé'), 'état de signature réel absent');
    assert.ok(says(text, 'Contrat préparé en brouillon'), 'frise d’historique réelle absente');
    assert.ok(says(text, '2026-09'), 'jalon d’exécution réel absent');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1', text);
  });

  await check('ADM incidents (ADM-15) — le Claim rattaché vient de la réponse serveur ; score et actions préventives déclarés indisponibles', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1/incidents');
    await page.locator('[data-screen="ADM-15"]').waitFor();
    const text = await screenText();
    assert.ok(text.includes('clm-e2e-1'), 'Claim rattaché absent');
    assert.ok(says(text, 'Incident de contrat'), 'type de Claim réel absent');
    assert.ok(says(text, 'Ouvert'), 'statut de Claim réel absent');
    assert.ok(says(text, 'Aucun endpoint de score'), 'capacité absente non déclarée');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1/incidents', text);
  });

  await check('ADM journal (ADM-17) — l’historique émis est rendu ; vérification et export déclarés indisponibles', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1/journal');
    await page.locator('[data-screen="ADM-17"]').waitFor();
    const text = await screenText();
    assert.ok(says(text, 'CONTRACT_CREATED'), 'événement réel absent du journal');
    assert.ok(text.includes('A. Gbian'), 'acteur réel absent du journal');
    assert.ok(says(text, 'aucun export'), 'capacité absente non déclarée');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1/journal', text);
  });

  await check('ADM révision forcée (ADM-16) — capacité absente, AUCUN formulaire rendu, aucune commande simulée', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1/revision-forcee');
    await page.locator('[data-screen="ADM-16"]').waitFor();
    const text = await screenText();
    assert.ok(says(text, 'indisponible'), 'capacité absente non dite');
    assert.equal(await page.locator('[data-screen="ADM-16"] form').count(), 0, 'aucun formulaire possible : aucune route serveur');
    assert.equal(await page.locator('[data-screen="ADM-16"] textarea, [data-screen="ADM-16"] select').count(), 0, 'aucune saisie sur une capacité absente');
    assert.ok(says(text, 'flux métier'), 'règle de tracabilité non rappelée');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1/revision-forcee', text);
  });

  await check('ADM fiche — référence hors page chargée : état honnête, rien de rechargé à part', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-inexistant');
    await page.locator('[data-screen="ADM-14"]').waitFor();
    const text = await screenText();
    assert.ok(says(text, 'n’est pas dans la page réellement chargée'), 'état introuvable non dit');
    assert.ok(says(text, 'BACKEND_GAP'), 'capacité absente non déclarée');
  });

  await check('ADM refus — non-ADMIN 403, session absente 401, erreur serveur 500 avec seule la corrélation du serveur', async () => {
    sessionMode = 'employer';
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(await page.locator('[data-unit]').count(), 0, 'aucun écran ADMIN sur un refus');
    sessionMode = 'anonymous';
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1');
    await page.locator('[data-state="401"]').waitFor();
    await assertNoForbiddenText('401', await page.locator('[data-state="401"]').innerText());
    sessionMode = 'error';
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-state="500"]').waitFor();
    const errorText = await page.locator('[data-state="500"]').innerText();
    assert.ok(errorText.includes(SERVER_REQUEST_ID), 'corrélation serveur non affichée');
    assert.ok(!errorText.includes(SERVER_SECRET), 'message brut rendu');
  });

  await check('ADM accessibilité & reduced-motion — table sémantique, légende SR, transitions neutralisées en mouvement réduit', async () => {
    sessionMode = 'admin';
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    assert.equal(await page.locator('[data-screen="ADM-13"] table caption.sr-only, [data-screen="ADM-13"] table caption').count(), 1, 'table sans caption');
    assert.ok(await page.locator('[data-screen="ADM-13"] table thead th').first().getAttribute('scope') === 'col', 'en-tête sans scope');
    const inputs = await page.locator('[data-screen="ADM-13"] input[type="search"]').count();
    assert.ok(inputs === 1, 'recherche sans champ accessible unique');
    assert.ok(await page.locator('[data-screen="ADM-13"] input[type="search"]').getAttribute('aria-label'), 'champ de recherche sans libellé accessible');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await page.evaluate(() => {
      const chip = document.querySelector('.lbm-admin__chip') as HTMLElement | null;
      return chip ? getComputedStyle(chip).transitionDuration : '0s';
    });
    const seconds = duration.split(',').map((value) => {
      const numeric = parseFloat(value) || 0;
      return value.includes('ms') ? numeric / 1000 : numeric;
    });
    assert.ok(Math.max(...seconds) <= 0.001, `transition non neutralisée en mouvement réduit : ${duration}`);
    await page.emulateMedia({ reducedMotion: null });
  });

  await check('ADM non-régression P4A — tableau de bord et utilisateurs toujours rendus (données réelles de la fixture)', async () => {
    sessionMode = 'admin';
    await page.goto(api.origin + '/admin');
    await page.locator('[data-screen="ADM-01"]').waitFor();
    await page.goto(api.origin + '/admin/utilisateurs');
    await page.locator('[data-screen="ADM-02"]').waitFor();
    // Le registre ADMIN des utilisateurs n'est pas servi par la fixture : l'écran
    // doit rester honnête (état d'erreur ou vide), jamais de données inventées.
    const text = await screenText();
    assert.ok(says(text, 'Utilisateurs'), 'fiche ADM-02 non rendue');
    await assertNoForbiddenText('/admin/utilisateurs (non-régression)', text);
    assert.ok(await page.locator('[data-backend-gap="true"]').first().isVisible(), 'BACKEND_GAP de la fiche utilisateur perdu');
  });

  assert.deepEqual(errors, [], `erreurs de page : ${errors.join(' · ')}`);
  console.log(`Total: ${passed}/${passed} vérifications navigateur PASS (fixtures HTTP locales ; aucune donnée de démonstration dans l’application).`);
} finally {
  await browser?.close();
  await demoServer?.close();
  await apiServer?.close();
}
