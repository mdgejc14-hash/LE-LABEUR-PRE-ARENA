/**
 * P2-DESIGN-EMPLOYER — vérification UI réelle (Chromium).
 *
 * Ce script n'affirme rien sur des données simulées : il vérifie l'état honnête
 * livré par la tranche dans un navigateur réel, à deux largeurs et dans deux
 * configurations réelles de l'application.
 *
 *  1. AUCUNE source de données configurée : les 60 fiches EMP rendent leur
 *     conteneur (`data-unit`, `data-screen`), la structure de fiche déclarée par
 *     le design (`data-sheet-frame`, une zone par genre déclaré) et le
 *     BACKEND_GAP de l'unité — et l'écran dit que la source est absente ;
 *  2. aucun terme du Master Design (Mission, Client, Prestataire, Litige) ni
 *     libellé financier interdit n'est rendu, à aucune largeur, et aucun
 *     débordement horizontal n'apparaît ;
 *  3. dock employeur : cinq onglets réels, aucun onglet mort, focus rendu au
 *     contenu après navigation ;
 *  4. chemin employeur sans fiche (ex. /client/contrats) : page de repli qui
 *     liste les routes réellement livrées — jamais le libellé du design ;
 *  5. source configurée mais refus serveur : l'erreur est projetée sur l'état
 *     StateGuard correspondant (401, 500) et seule la corrélation émise par le
 *     serveur est affichée — jamais le message brut ni un secret.
 *
 * Test-only : les fixtures HTTP vivent ici et ne sont jamais activées dans
 * l'application. Exécution : `npm run verify:employer-ui` (cf. docs/P2-DESIGN-EMPLOYER.md).
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
import { EMPLOYER_DESIGN_SCREENS } from '../src/employer/catalog';
import { deliveredScreensForUnit, resolveEmployerScreen, unitForScreen } from '../src/employer/screenMap';
import { DOCK_DEFINITIONS } from '../src/design-system/shells/shellNavigation';

const FORBIDDEN = ['Mission', 'Missions', 'Client', 'Clients', 'Prestataire', 'Prestataires', 'Prestation', 'Litige', 'Litiges'];
const FORBIDDEN_FINANCE = ['Prix Prestataire', 'Frais SaaS', 'Total Client', 'barème', 'Barème', 'séquestre', 'escrow'];
const SERVER_SECRET = 'SECRET_MUST_NOT_RENDER';
const SERVER_REQUEST_ID = 'req-test-123';

/** Chemin concret d'un motif de fiche (`:id` → valeur d'exemple). */
function concretePath(pattern: string): string {
  return pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? (segment === ':v' ? 'v2' : 'ref-1') : segment))
    .join('/');
}

// Bibliothèques du runtime Chromium empaqueté (aucun téléchargement, installation système minimale).
const require = createRequire(import.meta.url);
const libraryDirectory = resolve('.tmp/p2-chromium');
if (!process.env.CHROMIUM_PATH && process.platform === 'linux') {
  mkdirSync(libraryDirectory, { recursive: true });
  const archive = resolve(require.resolve('@sparticuz/chromium'), '../../bin/al2023.tar.br');
  writeFileSync(resolve(libraryDirectory, 'al2023.tar'), brotliDecompressSync(readFileSync(archive)));
  execFileSync('tar', ['-xf', resolve(libraryDirectory, 'al2023.tar'), '-C', libraryDirectory]);
}

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

  /** Fixture HTTP : session employeur (200) ou refus serveur (401/500) — jamais dans l'application. */
  let sessionMode: 'anonymous' | 'refused' | 'employer' = 'anonymous';
  await page.route('**/api/v1/**', async (route) => {
    const requestId = SERVER_REQUEST_ID;
    if (sessionMode === 'employer') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, user: { id: 'test-user', role: 'EMPLOYER', status: 'ACTIVE', displayName: 'Employeur de test' }, permissions: [] }),
      });
      return;
    }
    const status = sessionMode === 'anonymous' ? 401 : 500;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: SERVER_SECRET, requestId } }),
    });
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

  /**
   * Texte du CONTENU employeur ([data-unit]) — jamais le chrome P0 (dock, appbar),
   * dont les libellés viennent du Master Design et ne sont pas livrés par cette tranche.
   */
  const screenText = () => page.locator('[data-unit]').first().innerText();
  /** Le chrome met certaines lignes en capitales (text-transform) : la comparaison ignore la casse. */
  const says = (text: string, needle: string) => text.toLowerCase().includes(needle.toLowerCase());
  /** Retire les chemins et identifiants techniques : un terme du design dans une route n'est pas un libellé. */
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

  /* ── 1. Aucune source de données configurée ── */
  const demo = await startApp('demo');
  demoServer = demo.server;
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`EMP fiches — ${EMPLOYER_DESIGN_SCREENS.length} fiches rendues, structure déclarée inspectable, source absente dite (${width}px)`, async () => {
      for (const screen of EMPLOYER_DESIGN_SCREENS) {
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

  await check('EMP dock — cinq onglets ancrés dans des fiches réelles, focus rendu au contenu', async () => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(demo.origin + '/client');
    await page.locator('[data-screen="EMP-01"]').waitFor();
    for (const item of DOCK_DEFINITIONS.EMP) {
      assert.equal(await page.locator(`.lbm-dock a[href="${item.href}"]`).count(), 1, `onglet absent : ${item.href}`);
    }
    await page.locator('.lbm-dock a[href="/client/paiements"]').click();
    await page.waitForURL('**/client/paiements');
    await page.locator('[data-screen="EMP-41"]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'lbm-main', 'focus non rendu au contenu après navigation');
  });

  await check('EMP chemin sans fiche — page de repli honnête, libellé du design jamais rendu', async () => {
    assert.equal(resolveEmployerScreen('/client/contrats'), null, 'ce chemin ne doit correspondre à aucune fiche');
    await page.goto(demo.origin + '/client/contrats');
    await page.locator('[data-route-fallback="true"]').waitFor();
    const text = await screenText();
    assert.ok(says(text, 'Aucun écran livré'), 'absence de fiche non dite');
    for (const screen of deliveredScreensForUnit('EMP-29')) assert.ok(text.includes(screen.route), `route livrée absente : ${screen.route}`);
    assert.ok(!says(text, 'Contrat — folio'), 'libellé du Master Design rendu');
    await assertNoForbiddenText('/client/contrats', text);
  });

  /* ── 2. Source configurée, refus serveur ── */
  const api = await startApp('api');
  apiServer = api.server;

  await check('EMP erreur serveur 401 — état StateGuard 401, aucun secret, aucun contenu métier', async () => {
    sessionMode = 'anonymous';
    await page.goto(api.origin + '/client');
    await page.locator('[data-state="401"]').waitFor();
    await assertNoForbiddenText('/client (401)', await page.locator('[data-state="401"]').innerText());
    assert.equal(await page.locator('[data-unit]').count(), 0, 'aucun écran employeur ne doit être rendu sur un refus');
  });

  await check('EMP erreur serveur 500 — état StateGuard 500 et corrélation émise par le serveur seule', async () => {
    sessionMode = 'refused';
    await page.goto(api.origin + '/client/missions');
    await page.locator('[data-state="500"]').waitFor();
    const text = await page.locator('[data-state="500"]').innerText();
    assert.ok(text.includes(SERVER_REQUEST_ID), 'corrélation serveur non affichée');
    await assertNoForbiddenText('/client/missions (500)', text);
    assert.ok(!text.includes('req-inventé'), 'corrélation non serveur rendue');
  });

  await check('EMP session employeur réelle — les données affichées viennent du serveur, la source absente disparaît', async () => {
    sessionMode = 'employer';
    await page.goto(api.origin + '/client');
    await page.locator('[data-unit="EMP-01"]').waitFor();
    const text = await screenText();
    assert.ok(!says(text, 'Source de données non configurée'), 'la mention « source absente » ne doit plus apparaître avec une session réelle');
    await assertNoForbiddenText('/client (session employeur)', text);
  });

  assert.deepEqual(errors, [], `erreurs de page : ${errors.join(' · ')}`);
  console.log(`Total: ${passed}/${passed} vérifications navigateur PASS (fixtures HTTP locales ; aucune donnée de démonstration dans l’application).`);
} finally {
  await browser?.close();
  await demoServer?.close();
  await apiServer?.close();
}
