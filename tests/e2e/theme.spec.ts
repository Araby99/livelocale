import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { STUDIO_THEME_KEY } from '../../src/studio/preferences.js';
import { seen, watchDark } from './fixtures/theme.js';

const DEV = 'http://localhost:3010';
const SHARE = 'http://localhost:3020/livelocale/index.html';

const PAPER = 'rgb(255, 248, 240)';
const ESPRESSO = 'rgb(28, 23, 20)';
const CORAL = 'rgb(255, 107, 74)';
const CORAL_DARK = 'rgb(255, 122, 92)';

const ready = (page: Page) =>
  expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });
const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));
const rootBg = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('#root > div')!).backgroundColor);
const patchFill = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="brand-mark"] .fill-accent')!).fill
  );

test.describe('Studio theme under a light system', () => {
  test.use({ colorScheme: 'light' });

  test('keeps the dev Studio in the brand dark theme until the person chooses', async ({
    page,
  }) => {
    await page.goto(DEV);
    await ready(page);
    expect(await isDark(page)).toBe(true);
    expect(await rootBg(page)).toBe(ESPRESSO);
    expect(await patchFill(page)).toBe(CORAL_DARK);
  });

  test('shows the share Studio on Paper, with no dark frame before it loads', async ({ page }) => {
    await watchDark(page);
    await page.goto(SHARE);
    await ready(page);
    expect(await isDark(page)).toBe(false);
    expect(await seen(page, '__sawDark')).toBe(false);
    expect(await rootBg(page)).toBe(PAPER);
    expect(await patchFill(page)).toBe(CORAL);
  });

  test('remembers the chosen theme across a reload', async ({ page }) => {
    await page.goto(DEV);
    await ready(page);
    await page.locator('[data-theme-choice="light"]').click();
    await page.reload();
    await ready(page);
    expect(await page.evaluate((k) => localStorage.getItem(k), STUDIO_THEME_KEY)).toBe('light');
    expect(await rootBg(page)).toBe(PAPER);
    await expect(page.locator('[data-theme-choice="light"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('keeps the header on screen in light mode at 800x600', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.addInitScript((k) => localStorage.setItem(k, 'light'), STUDIO_THEME_KEY);
    await page.goto(DEV);
    await ready(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await expect(page.locator('#studio-changes-button')).toBeVisible();
    await expect(page.getByTestId('header-settings')).toBeVisible();
  });
});

test.describe('Studio theme under a dark system', () => {
  test.use({ colorScheme: 'dark' });

  test('shows the share Studio dark from its first render and follows a live switch to light', async ({
    page,
  }) => {
    await watchDark(page);
    await page.goto(SHARE);
    await ready(page);
    expect(await seen(page, '__darkAtFirstRender')).toBe(true);
    expect(await rootBg(page)).toBe(ESPRESSO);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => rootBg(page)).toBe(PAPER);
  });
});

test('captures brand screenshots for the owner', async ({ page }) => {
  const dir = process.env.REVIEW_SHOTS;
  test.skip(!dir, 'owner review only: set REVIEW_SHOTS to a folder');
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ['dark', 'light'] as const) {
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [
      STUDIO_THEME_KEY,
      theme,
    ] as const);
    await page.goto(DEV);
    await ready(page);
    await page.screenshot({ path: join(dir!, `dev-${theme}.png`) });
  }
});
