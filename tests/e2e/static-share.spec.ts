import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { encodeChangeLink } from '../../src/core/change-link.js';

// The static fixture: playground-vite built with `share: true`, served by a plain static server.
const STATIC = 'http://localhost:3020';

/** Opens the share Studio, gets past the first-run tips, and waits for the app connection. */
async function openStudio(page: Page): Promise<void> {
  await page.goto(`${STATIC}/livelocale/index.html`);
  const active = page.getByText('ACTIVE', { exact: true });
  await expect(active).toBeVisible({ timeout: 30_000 });
  // The tips open once the static mode is known, which is just after the connection.
  const name = page.locator('#studio-tips-name');
  const tipsShown = await name.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false
  );
  if (tipsShown) {
    await name.fill('Sara');
    await page.getByRole('button', { name: 'Start editing' }).click();
    await expect(name).toBeHidden();
  }
  await expect(active).toBeVisible();
}

/** Every row of the IndexedDB draft store (`livelocale-drafts`/`drafts`). */
async function readDrafts(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('livelocale-drafts');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('drafts', 'readonly').objectStore('drafts').getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
        };
      })
  );
}

/** Copies a locales folder to `<tmp>/locales` and returns `<tmp>`. */
function copyLocalesToTmp(from: string): string {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'livelocale-static-share-'));
  fs.cpSync(from, join(tmp, 'locales'), { recursive: true });
  return tmp;
}

/**
 * Matches an element whose text reads exactly `text` once the key watermark is ignored:
 * the framed app keeps zero-width characters (U+200B to U+200D) in front of every value.
 */
function shows(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[\\u200B-\\u200D]*${escaped}$`);
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

test('visitors who are not framed get no watermarks', async ({ page }) => {
  await page.goto(`${STATIC}/`);
  expect(await page.evaluate(() => /[​-‍]/.test(document.body.innerText))).toBe(false);
  expect(await page.evaluate(() => (window as any).__LIVELOCALE_FLAG__)).toBeUndefined();
  expect(await page.locator('[data-i18n-key]').count()).toBe(0);
});

test('Alt+Click keeps working after a full-page navigation inside the frame', async ({ page }) => {
  await openStudio(page);
  const frame = page.frameLocator('#app-preview-iframe');
  await frame.locator('#to-about').click();
  await frame.locator('[data-i18n-key="home.title"]').click({ modifiers: ['Alt'] });
  await expect(page.locator('#studio-translation-input')).toBeVisible();
});

test('detects Arabic from the page and keeps the fix across reloads', async ({ page }) => {
  await openStudio(page);
  const frame = page.frameLocator('#app-preview-iframe');
  await frame.locator('#lang-ar').click();
  await expect(page.getByText('Editing: ar')).toBeVisible();
  await frame.locator('[data-i18n-key="home.title"]').click({ modifiers: ['Alt'] });
  await page.locator('#studio-translation-input').fill('أهلاً');
  await page.keyboard.press('Control+Enter');
  await expect(frame.locator('[data-i18n-key="home.title"]')).toHaveText(shows('أهلاً'));
  await page.reload();
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
  await frame.locator('#lang-ar').click();
  await expect(frame.locator('[data-i18n-key="home.title"]')).toHaveText(shows('أهلاً'), {
    timeout: 30_000,
  });
  expect(await readDrafts(page)).toEqual([
    expect.objectContaining({ locale: 'ar', key: 'home.title', status: 'unsent' }),
  ]);
});

test('translator sends a link that apply turns into the JSON diff', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openStudio(page);
  const frame = page.frameLocator('#app-preview-iframe');
  await frame.locator('[data-i18n-key="home.title"]').click({ modifiers: ['Alt'] });
  await page.locator('#studio-translation-input').fill('Welcome to the share link');
  await page.locator('#studio-save-button').click();
  await expect(page.locator('[data-testid="save-success"]')).toBeVisible();
  await expect(page.getByTestId('unsent-counter')).toHaveText('1 change not sent');
  await page.reload();
  await expect(frame.locator('[data-i18n-key="home.title"]')).toHaveText(
    shows('Welcome to the share link'),
    { timeout: 30_000 }
  );
  await page.locator('#studio-send-button').click();
  await expect(page.getByText('Open on GitHub')).toHaveCount(0);
  await page.locator('#studio-send-note').fill('Header copy');
  const link = await page.getByTestId('change-link').inputValue();
  expect(link).toMatch(/^http:\/\/localhost:3020\/livelocale\/index\.html#lc1\.[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(6000);
  await page.locator('#studio-send-copy').click();
  await expect(page.getByTestId('unsent-counter')).toHaveCount(0);
  const tmp = copyLocalesToTmp('playground-vite/locales');
  const r = spawnSync(
    process.execPath,
    [
      'dist/codemod/index.js',
      'apply',
      link,
      '--dir',
      tmp,
      '--locales',
      'locales',
      '--source',
      'en',
    ],
    { encoding: 'utf-8' }
  );
  expect(r.status).toBe(0);
  expect(r.stdout).toContain('Applied 1');
  const before = readJson('playground-vite/locales/en.json'),
    after = readJson(join(tmp, 'locales/en.json'));
  expect(after).toEqual({
    ...before,
    home: { ...before.home, title: 'Welcome to the share link' },
  });
  expect(fs.readFileSync(join(tmp, 'locales/ar.json'), 'utf-8')).toBe(
    fs.readFileSync('playground-vite/locales/ar.json', 'utf-8')
  );
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('developer opens a change link in Review mode', async ({ page }) => {
  const token = await encodeChangeLink({
    branch: '',
    base: '',
    src: 'en',
    by: 'Sara',
    note: 'Header copy',
    edits: [
      {
        locale: 'en',
        key: 'home.title',
        from: 'Welcome to the static playground',
        to: 'Hello from Sara',
        force: false,
      },
    ],
  });
  await page.goto(`${STATIC}/livelocale/index.html#${token}`);
  await expect(page.getByText('Reviewing 1 proposed change')).toBeVisible();
  await expect(page.getByRole('row', { name: /home\.title/ })).toContainText('Hello from Sara');
  await expect(page.getByRole('row', { name: /home\.title/ })).toContainText('Ready');
  await expect(
    page.frameLocator('#app-preview-iframe').locator('[data-i18n-key="home.title"]')
  ).toHaveText(shows('Hello from Sara'));
  await expect(page.getByText('npx livelocale apply "')).toBeVisible();
});

test('the static Studio keeps the app wide at 800x600', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openStudio(page);
  expect((await page.locator('#app-preview-iframe').boundingBox())!.width).toBeGreaterThanOrEqual(
    480
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('names the fix instead of pointing at localhost when the manifest is missing', async ({
  page,
}) => {
  // Review Focus 1
  await page.route('**/livelocale/manifest.json', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' })
  );
  await page.goto(`${STATIC}/livelocale/index.html`);
  await expect(
    page.getByText(/livelocale\/manifest\.json is missing or is not a LiveLocale manifest/)
  ).toBeVisible();
  await expect(page.locator('#app-preview-iframe[src^="http://localhost:3000"]')).toHaveCount(0);
  await expect(page.getByTestId('slow-connection-help')).toHaveCount(0);
});
