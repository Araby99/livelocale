import { expect, test, type Page } from '@playwright/test';
import { editKey } from './fixtures/share.js';
import { seen, watchDark } from './fixtures/theme.js';

// The Studio interface is English only. Arabic lives in the customer's site: picking the 'ar'
// locale flips the previewed site right-to-left, while the Studio chrome stays left-to-right.

const SHARE = 'http://localhost:3020/livelocale/index.html';

const connected = (page: Page) =>
  expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 30_000,
  });

/** The Studio chrome reads left to right and never sets lang or dir on itself or the document. */
const expectStudioLtr = async (page: Page) => {
  const root = page.getByTestId('studio-root');
  await expect(root).not.toHaveAttribute('dir', /.*/);
  await expect(root).not.toHaveAttribute('lang', /.*/);
  expect(await root.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  expect(
    await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    }))
  ).toEqual({ lang: 'en', dir: '' });
};

const startEditing = async (page: Page) => {
  const name = page.locator('#studio-tips-name');
  await name.fill('Sara');
  await page.locator('#studio-tips-start').click();
  await expect(name).toBeHidden();
};

test.describe('share Studio, Arabic browser', () => {
  test.use({ locale: 'ar-EG' });

  test('shows the Studio in English, left to right', async ({ page }) => {
    await page.goto(SHARE);
    await connected(page);
    await expect(page.locator('#studio-tips-title')).toHaveText('Welcome to LiveLocale');
    await expectStudioLtr(page);
  });

  test('flips the previewed site right-to-left for the ar locale, not the Studio', async ({
    page,
  }) => {
    await page.goto(SHARE);
    await connected(page);
    await startEditing(page);
    const main = page.frameLocator('#app-preview-iframe').locator('main');
    await expect(main).toHaveAttribute('dir', 'ltr');

    await page.locator('select:has(option[value="ar"])').selectOption('ar');
    await expect(page.getByText('Editing: ar')).toBeVisible();
    await expect(main).toHaveAttribute('lang', 'ar');
    await expect(main).toHaveAttribute('dir', 'rtl');
    await expectStudioLtr(page);

    // Arabic text typed for the site still saves and sends from the English Studio.
    await editKey(page, 'home.title', 'مرحبا');
    await expectStudioLtr(page);
    await page.locator('#studio-send-button').click();
    await expect(page.locator('#studio-send-title')).toBeVisible();
  });
});

test.describe('share Studio, Arabic browser, light system', () => {
  test.use({ locale: 'ar-EG', colorScheme: 'light' });

  test('starts light and in English on a first visit from an Arabic browser', async ({ page }) => {
    // Review Focus 5
    await watchDark(page);
    await page.goto(SHARE);
    await connected(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      false
    );
    expect(await seen(page, '__sawDark')).toBe(false);
    await expect(page.locator('#studio-tips-title')).toHaveText('Welcome to LiveLocale');
    await expectStudioLtr(page);
  });
});

test.describe('share Studio, English browser', () => {
  test.use({ locale: 'en-US' });

  test('starts in English, left to right', async ({ page }) => {
    await page.goto(SHARE);
    await connected(page);
    await expectStudioLtr(page);
  });
});
