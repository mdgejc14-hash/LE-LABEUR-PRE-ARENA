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
  page.on('pageerror', (error) => errors.push(error.message));
  let responseStatus = 401;
  let exchangeCount = 0;
  let session = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/google/credential')) { exchangeCount++; if (responseStatus === 200) session = true; }
    if (path.endsWith('/logout')) session = false;
    const success = responseStatus === 200 && session;
    await route.fulfill({ status: success ? 200 : responseStatus === 200 ? 401 : responseStatus, contentType: 'application/json', body: JSON.stringify(success
      ? { authenticated: true, user: { id: 'test-user', role: 'CANDIDATE', status: 'ACTIVE', displayName: 'Test User', email: 'test@example.invalid' }, permissions: [] }
      : { error: { code: 'FORBIDDEN', message: 'SECRET_MUST_NOT_RENDER', requestId: 'req-test-123' } }) });
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
  assert.deepEqual(errors, []);
  console.log(`Total: ${passed}/${passed} browser checks PASS (HTTP/Google fixtures, not live Google).`);
} finally { await browser?.close(); await server.close(); }
