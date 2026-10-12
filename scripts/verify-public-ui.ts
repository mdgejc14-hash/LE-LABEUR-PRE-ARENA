/** Real Chromium checks. Test-only Google + HTTP fixtures, never enabled in the application. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import bundledChromium from '@sparticuz/chromium';
import { createServer } from 'vite';
import { PUBLIC_SCREENS } from '../src/public/catalog';
import { STATE_GUARD_CATALOG } from '../src/design-system/generated/stateGuardCatalog';
import { API_ROUTE_CONTRACTS, findApiRoute } from '../src/backend/api/routeContracts';
import { PUBLIC_GAP_ROUTES } from '../src/public/gaps';

// Use the packaged Linux runtime libraries; no browser download or system install.
const require = createRequire(import.meta.url);
const libraryDirectory = resolve('.tmp/p1-chromium');
if (!process.env.CHROMIUM_PATH && process.platform === 'linux') {
  mkdirSync(libraryDirectory, { recursive: true });
  const archive = resolve(require.resolve('@sparticuz/chromium'), '../../bin/al2023.tar.br');
  writeFileSync(resolve(libraryDirectory, 'al2023.tar'), brotliDecompressSync(readFileSync(archive)));
  execFileSync('tar', ['-xf', resolve(libraryDirectory, 'al2023.tar'), '-C', libraryDirectory]);
}
const server = await createServer({
  server: { host: '0.0.0.0', port: 0 },
  define: {
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
    'import.meta.env.VITE_API_BASE_PATH': JSON.stringify('/api/v1'),
    'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify('ui-test-only'),
  },
});
await server.listen();
const address = server.httpServer!.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
let browser;
let passed = 0;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || await bundledChromium.executablePath(), args: bundledChromium.args.filter((arg) => !arg.includes('disable-web-security') && !arg.includes('allow-running-insecure-content')), headless: true, env: { ...process.env, LD_LIBRARY_PATH: [resolve(libraryDirectory, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
  const context = await browser.newContext();
  // tsx preserves function names with this helper in serialized browser callbacks.
  await context.addInitScript('window.__name = (value) => value;');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.log('PAGEERROR', page.url(), error.message, error.stack?.split('\n').slice(0, 4).join(' | ')); });
  let responseStatus = 401;
  let exchangeCount = 0;
  let session = false;
  /** Détails d'erreur réellement transmis par la fixture (ex. retryAfterSeconds du limiteur). */
  let errorDetails: Record<string, string[]> | undefined;
  const apiRequests: string[] = [];
  const healthRequests: string[] = [];
  await page.route('**/healthz', async (route) => {
    healthRequests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'boundary-only' }) });
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    apiRequests.push(`${route.request().method()} ${path}`);
    if (path.endsWith('/google/credential')) { exchangeCount++; if (responseStatus === 200) session = true; }
    if (path.endsWith('/logout')) session = false;
    const success = responseStatus === 200 && session;
    // Fixture de forme : les routes AUTH renvoient la session serveur (contrat réel),
    // les autres routes renvoient une COLLECTION VIDE enveloppée comme l'API réelle
    // (`{ items, cursor, limit, hasMore }`), car l'adaptateur de compatibilité
    // (`firstPage` dans legacyApiAdapter) lit `page.items`. Sans cette enveloppe, le
    // parcours legacy montait `offers = undefined` et l'écran Découvrir plantait —
    // panne de la fixture, pas de l'application, et sans rapport avec les écrans PUB.
    const authRoute = path.startsWith('/api/v1/auth/');
    const emptyCollection = { items: [], cursor: null, limit: 25, hasMore: false };
    await route.fulfill({ status: success ? 200 : responseStatus === 200 ? 401 : responseStatus, contentType: 'application/json', body: JSON.stringify(success
      ? (authRoute ? { authenticated: true, user: { id: 'test-user', role: 'CANDIDATE', status: 'ACTIVE', displayName: 'Test User', email: 'test@example.invalid' }, permissions: [] } : emptyCollection)
      : { error: { code: 'FORBIDDEN', message: 'SECRET_MUST_NOT_RENDER', requestId: 'req-test-123', ...(errorDetails ? { details: errorDetails } : {}) } }) });
  });
  await page.addInitScript(() => {
    // Lambda Chromium may report offline without a platform network monitor.
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    let callback: (value: { credential: string }) => void;
    (window as any).google = { accounts: { id: {
      initialize(options: any) { callback = options.callback; },
      prompt() { callback({ credential: 'header.' + btoa(JSON.stringify({ sub: 'test-sub', email: 'test@example.invalid' })) + '.signature' }); },
    } } };
  });
  const check = async (name: string, fn: () => Promise<void>) => {
    if (process.env.UI_CHECK && !name.includes(process.env.UI_CHECK)) return;
    try { await fn(); } catch (error) { console.error('URL', page.url(), 'ERRORS', errors, 'BODY', await page.locator('body').innerText()); throw error; }
    passed++; console.log(`PASS ${name}`);
  };
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const reduced of ['reduce', 'no-preference'] as const) {
      await page.emulateMedia({ reducedMotion: reduced });
      await check(`PUB/SYS layouts ${width}px ${reduced}`, async () => {
        for (const screen of PUBLIC_SCREENS.filter((item) => item.code !== 'PUB-01')) {
          await page.goto(origin + screen.route);
          await page.locator(`[data-screen="${screen.code}"]`).waitFor();
          await page.locator('h1').first().waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), screen.route);
          assert.equal(await page.locator('main').count(), 1);
          if (screen.code === 'PUB-02' && reduced === 'reduce') {
            await page.waitForTimeout(200);
            assert.ok(['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(await page.locator('[data-screen]').evaluate((element) => getComputedStyle(element).transform)));
            await page.screenshot({ path: `.tmp/public-${width}.png`, fullPage: true });
          }
          assert.equal(await page.locator('.lbm-dock').count(), 0, 'PUB has no dock per CHROME_PUB');
          assert.ok(!await page.locator('body').innerText().then((text) => text.includes('SECRET_MUST_NOT_RENDER')));
        }
        for (const state of STATE_GUARD_CATALOG) {
          await page.goto(origin + state.route);
          await page.locator(`[data-state="${state.key}"]`).waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), state.route);
          assert.equal(await page.getByRole('button', { name: 'Revenir', exact: true }).count(), 1);
        }
      });
    }
  }
  await check('Keyboard selection, disabled CTA, navigation, back and focus', async () => {
    await page.goto(origin + '/onboarding/profil');
    const button = page.getByRole('button', { name: 'Continuer', exact: true });
    assert.ok(await button.isDisabled());
    const radio = page.getByRole('radio').first();
    await radio.focus(); await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Continuer en tant que Client' }).click();
    await page.waitForURL('**/inscription');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'lbm-main');
    assert.ok(await page.getByRole('button', { name: 'Créer mon compte', exact: true }).isDisabled());
    await page.goBack(); await page.waitForURL('**/onboarding/profil');
    assert.equal(await page.locator('[data-screen="PUB-03"]').count(), 1);
  });
  await check('PUB-05…08 gaps: no data entry, API request, fake success or enabled action; only truthful exits', async () => {
    const requestsBefore = apiRequests.length;
    const targets = [
      { route: '/inscription', screen: 'PUB-05', button: 'Créer mon compte', exit: 'Déjà inscrit ? Se connecter', destination: '/connexion' },
      { route: '/verifier-otp', screen: 'PUB-06', button: 'Vérifier', exit: 'Changer de numéro', destination: '/inscription' },
      { route: '/recuperation', screen: 'PUB-07', button: 'Envoyer le lien de récupération', exit: 'Retour connexion', destination: '/connexion' },
      { route: '/legal', screen: 'PUB-08', button: 'Accepter la version en vigueur', exit: 'Accueil', destination: '/accueil' },
    ];
    for (const target of targets) {
      await page.goto(origin + target.route);
      await page.locator(`[data-screen="${target.screen}"]`).waitFor();
      assert.equal(new URL(page.url()).pathname, target.route);
      assert.ok((await page.locator('body').innerText()).includes(`BACKEND_GAP · ${target.screen}`));
      assert.equal(await page.locator('input, form').count(), 0, `${target.screen} must not collect data without its API`);
      assert.ok(await page.getByRole('button', { name: target.button, exact: true }).isDisabled(), `${target.screen} action must be unavailable`);
      assert.ok(!(await page.locator('body').innerText()).includes('Succès'), `${target.screen} must not show a success state`);
      await page.getByRole('link', { name: target.exit, exact: true }).click();
      await page.waitForURL(`**${target.destination}`);
    }
    await page.goto(origin + '/legal');
    assert.ok(await page.getByRole('button', { name: 'Télécharger le document', exact: true }).isDisabled());
    assert.equal(apiRequests.length, requestsBefore, 'gapped Public/Auth screens must make no API requests');
  });
  await check('Boot reduced-motion exits, keyboard skip works, offline has real exit', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(origin + '/ouverture'); await page.waitForURL('**/accueil');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(origin + '/ouverture');
    const skip = page.getByRole('button', { name: 'Continuer', exact: true });
    await skip.focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/accueil');
    await page.goto(origin + '/accueil');
    await page.locator('[data-screen="PUB-02"]').waitFor();
    await context.setOffline(true);
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); history.pushState(null, '', '/ouverture'); window.dispatchEvent(new Event('lbm:navigate')); });
    await page.locator('[data-state="offline"]').waitFor();
    await page.getByRole('button', { name: 'Revenir', exact: true }).click(); await page.waitForURL('**/accueil');
    await context.setOffline(false);
  });
  for (const status of [401, 403, 409, 422, 425, 429, 500, 502, 503, 504]) await check(`Google integration API ${status}, no secrets`, async () => {
    responseStatus = status;
    await page.goto(origin + '/connexion');
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Continuer avec Google' }).click();
    await page.locator(`[data-state="${status}"]`).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('SECRET_MUST_NOT_RENDER'));
    assert.ok((await page.locator('body').innerText()).includes('req-test-123'));
    await page.getByRole('button', { name: 'Revenir', exact: true }).click();
    assert.equal(await page.locator(`[data-state="${status}"]`).count(), 0);
  });
  await check('Double submit locked, successful auth hands off to legacy root', async () => {
    responseStatus = 200; const before = exchangeCount;
    await page.goto(origin + '/connexion'); await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Continuer avec Google' }).evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await page.waitForURL(origin + '/');
    assert.equal(exchangeCount - before, 1);
    assert.equal(await page.locator('[data-shell="PUBLIC"]').count(), 0);
  });
  await check('Legacy / still renders and SYS exits navigate out', async () => {
    await page.goto(origin + '/'); assert.equal(await page.locator('[data-screen]').count(), 0);
    await page.goto(origin + '/etat/401');
    await page.getByRole('button', { name: 'Se reconnecter', exact: true }).click();
    await page.waitForURL('**/connexion');
    assert.equal(await page.locator('[data-screen="PUB-04"]').count(), 1);
  });
  /* ───────────── PUB-AUTH-2 — écrans publics restants ───────────── */

  await check('PUB-01/02 : zones déclarées rendues, décor aria-hidden, texte réel conservé', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + '/ouverture');
    await page.locator('[data-screen="PUB-01"]').waitFor();
    for (const zone of PUBLIC_SCREENS.find((screen) => screen.code === 'PUB-01')!.zones) {
      assert.equal(await page.locator(`[data-zone="${zone}"]`).count(), 1, `zone PUB-01 « ${zone} » absente`);
    }
    assert.equal(await page.locator('.lbm-particle').count(), 1, 'champ particulaire C-15 attendu');
    assert.equal(await page.locator('.lbm-particle').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('h1').innerText(), 'LE LABEUR', 'le titre reste du texte réel');
    // Le sceau « Forge » de la fiche n'affiche pas de libellé redondant avec le titre.
    assert.equal(await page.locator('.lbm-seal__label:visible').count(), 0);
    await page.goto(origin + '/accueil');
    await page.locator('[data-screen="PUB-02"]').waitFor();
    for (const zone of PUBLIC_SCREENS.find((screen) => screen.code === 'PUB-02')!.zones) {
      assert.equal(await page.locator(`[data-zone="${zone}"]`).count(), 1, `zone PUB-02 « ${zone} » absente`);
    }
    assert.equal(await page.locator('.lbm-particle').count(), 1);
    assert.equal(await page.locator('h1').innerText(), 'Le travail, cadré, prouvé, payé.');
    assert.ok(!(await page.locator('body').innerText()).includes('utilisateurs'), 'aucune statistique inventée');
    return;
  });

  await check('PUB-01/02 : captures 360 et 1440 px (mouvement complet)', async () => {
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/ouverture', '/accueil']) {
        await page.goto(origin + route);
        await page.locator('[data-screen]').waitFor();
        await page.waitForTimeout(700);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route);
        await page.screenshot({ path: `.tmp/pubauth2-${route.slice(1)}-${width}.png`, fullPage: true });
      }
    }
    return;
  });

  await check('PUB-03 : le CTA et l’anneau prennent la couleur du profil, jamais une autorisation', async () => {
    session = false; responseStatus = 401;
    await page.goto(origin + '/onboarding/profil');
    await page.locator('[data-screen="PUB-03"]').waitFor();
    assert.ok(await page.getByRole('button', { name: 'Continuer', exact: true }).isDisabled());
    await page.getByRole('radio').last().check();
    const cta = page.locator('.lbm-public__cta');
    assert.ok((await cta.getAttribute('class') ?? '').includes('lbm-public__cta--emerald'), 'CTA Prestataire en émeraude');
    assert.equal(await page.locator('.lbm-public__role[data-role="CANDIDATE"]:has(:checked)').count(), 1);
    const text = (await page.locator('body').innerText()).toLowerCase();
    assert.ok(text.includes('jamais une autorisation') && text.includes('aucun rôle de compte existant'), 'la portée du choix est explicite');
    assert.ok(text.includes('backend_gap · pub-03') && text.includes('/api/v1/onboarding/role'));
    assert.equal(await page.evaluate(() => sessionStorage.getItem('lbm-public-role')), 'CANDIDATE');
    return;
  });

  await check('PUB-03/09 : rôle et session lus par le serveur quand une session existe', async () => {
    responseStatus = 200; session = true;
    await page.goto(origin + '/onboarding/profil');
    await page.locator('[data-session-role="CANDIDATE"]').waitFor();
    const roleNote = await page.locator('[data-session-role="CANDIDATE"]').innerText();
    assert.ok(roleNote.includes('Rôle effectif du compte connecté') && roleNote.includes('GET /api/v1/auth/session'), roleNote);
    await page.goto(origin + '/compte-bloque');
    await page.locator('[data-session-probe="active"]').waitFor();
    assert.ok((await page.locator('[data-session-probe="active"]').innerText()).includes('compte actif'));
    session = false; responseStatus = 401;
    await page.goto(origin + '/compte-bloque');
    await page.locator('[data-session-probe="none"]').waitFor();
    const none = await page.locator('[data-session-probe="none"]').innerText();
    assert.ok(none.includes("Aucune session active n'est confirmée") && none.includes('motif'), none);
    return;
  });

  await check('PUB-09/10 : aucune demande de recours, d’export, de statut ou de notification ne part ni ne s’active', async () => {
    const gapRoutes = PUBLIC_GAP_ROUTES.map((operation) => operation.path);
    const before = apiRequests.length;
    await page.goto(origin + '/compte-bloque');
    await page.locator('[data-screen="PUB-09"]').waitFor();
    await page.locator('[data-session-probe]').waitFor();
    assert.ok((await page.locator('body').innerText()).includes('BACKEND_GAP · PUB-09'));
    for (const label of ['Déposer une contestation', 'Télécharger mes données']) {
      assert.ok(await page.getByRole('button', { name: label, exact: true }).isDisabled(), `${label} doit être indisponible`);
    }
    await page.goto(origin + '/maintenance');
    await page.locator('[data-screen="PUB-10"]').waitFor();
    const maintenance = await page.locator('body').innerText();
    assert.ok(maintenance.includes('BACKEND_GAP · PUB-10') && maintenance.includes('/healthz'));
    for (const label of ['Me prévenir à la reprise', "Voir l'état des services"]) {
      assert.ok(await page.getByRole('button', { name: label, exact: true }).isDisabled(), `${label} doit être indisponible`);
    }
    assert.equal(healthRequests.length, 0, '/healthz ne doit jamais être appelé par les écrans publics');
    assert.ok(!apiRequests.slice(before).some((request) => gapRoutes.some((path) => request.endsWith(path))), 'aucune route déclarée absente n’est appelée');
    const after = apiRequests.slice(before).map((request) => request.split(' ')[1]);
    assert.deepEqual([...new Set(after)], ['/api/v1/auth/session'], `appels réels inattendus : ${after.join(', ')}`);
    return;
  });

  await check('PUB-04 : la temporisation 429 affichée est celle transmise par l’API', async () => {
    await page.goto(origin + '/connexion');
    await page.locator('[data-screen="PUB-04"]').waitFor();
    assert.equal(await page.locator('input[type="password"]').count(), 0, 'aucun champ mot de passe sans backend');
    const connexion = await page.locator('body').innerText();
    assert.ok(connexion.includes('BACKEND_GAP · PUB-04') && connexion.includes('/api/v1/auth/magic-link'), 'écarts de la fiche déclarés');
    session = false; responseStatus = 429; errorDetails = { bucket: ['auth'], retryAfterSeconds: ['42'] };
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Continuer avec Google' }).click();
    await page.locator('[data-state="429"]').waitFor();
    const throttled = await page.locator('body').innerText();
    assert.ok(throttled.includes('429') && throttled.includes('42'), 'la valeur du serveur doit être affichée');
    assert.ok(throttled.includes('vient du serveur') || throttled.includes('transmet une temporisation'), throttled);
    await page.getByRole('button', { name: 'Revenir', exact: true }).click();
    assert.equal(await page.locator('[data-state="429"]').count(), 0);
    // 429 sans temporisation transmise : aucune valeur n'est inventée.
    errorDetails = { bucket: ['auth'] };
    await page.getByRole('button', { name: 'Continuer avec Google' }).click();
    await page.locator('[data-state="429"]').waitFor();
    const withoutValue = await page.locator('body').innerText();
    assert.ok(withoutValue.includes('sans transmettre de durée de report'), withoutValue);
    await page.getByRole('button', { name: 'Revenir', exact: true }).click();
    errorDetails = undefined; responseStatus = 401;
    return;
  });

  await check('PUB-04 : un 403 de la connexion mène à PUB-09 sans motif inventé', async () => {
    responseStatus = 403; session = false;
    await page.goto(origin + '/connexion');
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Continuer avec Google' }).click();
    await page.locator('[data-state="403"]').waitFor();
    const text = await page.locator('body').innerText();
    assert.ok(text.includes('n’est pas actif côté serveur') || text.includes("n'est pas actif côté serveur"), text);
    assert.ok(!/sécurité|litige|manquement/i.test(text), 'aucun motif de blocage n’est suggéré');
    await page.getByRole('link', { name: /compte bloqué/ }).click();
    await page.waitForURL('**/compte-bloque');
    assert.equal(await page.locator('[data-screen="PUB-09"]').count(), 1);
    responseStatus = 401;
    return;
  });

  await check('PUB-AUTH-2 : tout appel émis par les écrans PUB correspond à un contrat serveur déclaré', async () => {
    const unique = [...new Set(apiRequests.map((request) => request.split(' ')[1]))];
    for (const path of unique) {
      const method = apiRequests.find((request) => request.endsWith(path))!.split(' ')[0];
      assert.ok(findApiRoute(method, path), `${method} ${path} n’est pas un contrat déclaré`);
    }
    for (const route of PUBLIC_GAP_ROUTES) {
      assert.ok(!unique.includes(route.path), `route absente appelée : ${route.path}`);
    }
    assert.ok(API_ROUTE_CONTRACTS.length > 0);
    console.log(`PUB-AUTH-2 : ${unique.length} chemins appelés, tous déclarés dans routeContracts.ts (${unique.join(', ')})`);
    return;
  });

  await check('PUB-AUTH-2 : captures des écrans 03 / 04 / 09 / 10 (360 et 1440 px)', async () => {
    responseStatus = 401; session = false;
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/onboarding/profil', '/connexion', '/compte-bloque', '/maintenance']) {
        await page.goto(origin + route);
        await page.locator('[data-screen]').waitFor();
        await page.waitForTimeout(300);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route);
        await page.screenshot({ path: `.tmp/pubauth2-${route.slice(1).replace(/\//g, '-')}-${width}.png`, fullPage: true });
      }
    }
    return;
  });

  assert.deepEqual(errors, []);
  console.log(`Total: ${passed}/${passed} browser checks PASS (HTTP/Google fixtures, not live Google).`);
} finally { await browser?.close(); await server.close(); }
