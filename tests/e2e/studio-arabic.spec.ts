import { expect, test, type Page } from '@playwright/test';
import { parseAllowFile } from '../../src/codemod/hardcoded/allow-list.js';
import { isMostlyLatin } from '../../src/codemod/hardcoded/locale-script.js';
import { STUDIO_LANGUAGE_KEY } from '../../src/studio/preferences.js';
import { loadedFaces } from './fixtures/fonts.js';
import { editKey } from './fixtures/share.js';
import { seen, watchDark } from './fixtures/theme.js';

const DEV = 'http://localhost:3010';
const SHARE = 'http://localhost:3020/livelocale/index.html';

const LATIN_OK = parseAllowFile('LiveLocale\nlivelocale\nEnglish\nGitHub\n');

/** Visible text nodes inside studio-root that are not code-like (dir="ltr") or translator values (dir="auto"). */
const visibleCopy = (page: Page) =>
  page.getByTestId('studio-root').evaluate((el) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement!;
      const text = n.textContent!.trim();
      if (!text || parent.closest('[dir="ltr"], [dir="auto"], iframe, [aria-hidden="true"]'))
        continue;
      const box = parent.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || getComputedStyle(parent).visibility === 'hidden')
        continue;
      out.push(text);
    }
    return out;
  });

const expectNoEnglish = async (page: Page, screen: string) =>
  expect(
    (await visibleCopy(page)).filter((t) => isMostlyLatin(t, LATIN_OK)),
    screen
  ).toEqual([]);

const arabicFaces = (page: Page) =>
  loadedFaces(page).then((f) =>
    f.filter((n) => n === 'IBM Plex Sans Arabic' || n === 'Readex Pro')
  );

const connected = (page: Page, timeout: number) =>
  expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout,
  });

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('dev Studio', () => {
  test.use({ locale: 'ar-EG' });

  test('stays English for an Arabic browser until the person switches, then remembers Arabic', async ({
    page,
  }) => {
    await page.goto(DEV);
    await connected(page, 90_000);
    const root = page.getByTestId('studio-root');
    await expect(root).toHaveAttribute('dir', 'ltr');
    await page.locator('#studio-language-toggle').click();
    await expect(root).toHaveAttribute('dir', 'rtl');
    await expect(root).toHaveAttribute('lang', 'ar');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await page.reload();
    await connected(page, 90_000);
    await expect(root).toHaveAttribute('dir', 'rtl');
    await page.locator('#studio-language-toggle').click();
    await expect(root).toHaveAttribute('dir', 'ltr');
  });

  test('opens the keys drawer on the right and the editor drawer on the left in Arabic', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.addInitScript((k) => localStorage.setItem(k, 'ar'), STUDIO_LANGUAGE_KEY);
    await page.goto(DEV);
    await connected(page, 90_000);
    await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'rtl');

    await page.getByTestId('studio-toggle-keys').click();
    const keys = (await page.getByTestId('studio-drawer-keys').boundingBox())!;
    expect(keys.x + keys.width).toBeGreaterThan(1016);
    expect(await fitsWidth(page)).toBe(true);
    await page.getByTestId('studio-toggle-keys').click();
    await expect(page.getByTestId('studio-drawer-keys')).toBeHidden();

    await page.getByTestId('studio-toggle-side').click();
    const side = (await page.getByTestId('studio-drawer-side').boundingBox())!;
    expect(side.x).toBeLessThan(8);
    expect(await fitsWidth(page)).toBe(true);
  });

  test('shows no English copy on the idle, editor and changes screens in Arabic', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((k) => localStorage.setItem(k, 'ar'), STUDIO_LANGUAGE_KEY);
    await page.goto(DEV);
    await connected(page, 90_000);
    await expectNoEnglish(page, 'idle');

    await page
      .getByTestId('keys-directory')
      .getByRole('button', { name: /home\.welcome_msg/ })
      .click();
    await expect(page.locator('#studio-translation-input')).toBeVisible();
    await expectNoEnglish(page, 'editor');

    await page.locator('#studio-changes-button').click();
    await expect(page.getByTestId('changes-panel')).toBeVisible();
    await expectNoEnglish(page, 'changes');
  });
});

test.describe('share Studio, Arabic browser', () => {
  test.use({ locale: 'ar-EG' });

  test('starts in Arabic and sends a change in Arabic', async ({ page }) => {
    await page.goto(SHARE);
    await connected(page, 30_000);
    await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#studio-tips-title')).toHaveText('مرحبًا بك في LiveLocale');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await arabicFaces(page)).toEqual(['IBM Plex Sans Arabic']);
    await expectNoEnglish(page, 'tips');

    await page.locator('#studio-tips-start').click();
    await expect(page.locator('#studio-tips-title')).toBeHidden();
    await editKey(page, 'home.title', 'مرحبا');
    await page.locator('#studio-send-button').click();
    await expect(page.locator('#studio-send-title')).toHaveText('إرسال إلى المطوّر');
    await expectNoEnglish(page, 'send');
  });
});

test.describe('share Studio, Arabic browser, light system', () => {
  test.use({ locale: 'ar-EG', colorScheme: 'light' });

  test('starts light and in Arabic on a first visit from an Arabic browser', async ({ page }) => {
    // Review Focus 5
    await watchDark(page);
    await page.goto(SHARE);
    await connected(page, 30_000);
    await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      false
    );
    expect(await seen(page, '__sawDark')).toBe(false);
    await expect(page.locator('#studio-tips-title')).toHaveText('مرحبًا بك في LiveLocale');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await arabicFaces(page)).toContain('IBM Plex Sans Arabic');
  });
});

test.describe('share Studio, English browser', () => {
  test.use({ locale: 'en-US' });

  test('starts in English', async ({ page }) => {
    await page.goto(SHARE);
    await connected(page, 30_000);
    await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'ltr');
  });
});
