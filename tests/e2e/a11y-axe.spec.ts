import { expect, test, type Page } from '@playwright/test';
import { STUDIO_LANGUAGE_KEY, STUDIO_THEME_KEY } from '../../src/studio/preferences.js';
import { seriousViolations } from './fixtures/axe.js';
import { editKey } from './fixtures/share.js';

const DEV = 'http://localhost:3010';
const SHARE = 'http://localhost:3020/livelocale/index.html';

interface Variant {
  name: 'dark-en' | 'light-en' | 'dark-ar' | 'light-ar';
  /** localStorage preferences set before the dev Studio loads. */
  stored: [string, string][];
  rtl: boolean;
  /** Browser settings for the share Studio. */
  share: { colorScheme: 'dark' | 'light'; locale?: string };
}

const VARIANTS: Variant[] = [
  { name: 'dark-en', stored: [], rtl: false, share: { colorScheme: 'dark' } },
  {
    name: 'light-en',
    stored: [[STUDIO_THEME_KEY, 'light']],
    rtl: false,
    share: { colorScheme: 'light' },
  },
  {
    name: 'dark-ar',
    stored: [
      [STUDIO_THEME_KEY, 'dark'],
      [STUDIO_LANGUAGE_KEY, 'ar'],
    ],
    rtl: true,
    share: { colorScheme: 'dark', locale: 'ar' },
  },
  {
    name: 'light-ar',
    stored: [
      [STUDIO_THEME_KEY, 'light'],
      [STUDIO_LANGUAGE_KEY, 'ar'],
    ],
    rtl: true,
    share: { colorScheme: 'light', locale: 'ar' },
  },
];

const connected = (page: Page) =>
  expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 90_000,
  });

const noSeriousViolations = async (page: Page) => expect(await seriousViolations(page)).toEqual([]);

const pickWelcome = async (page: Page) => {
  await page
    .getByTestId('keys-directory')
    .getByRole('button', { name: /home\.welcome_msg/ })
    .click();
  await expect(page.locator('#studio-translation-input')).toBeVisible();
};

type DevScreen = { width: number; height: number; reach: (page: Page) => Promise<void> };

const DEV_SCREENS: Record<string, DevScreen> = {
  idle: { width: 1440, height: 900, reach: async () => {} },
  editor: { width: 1440, height: 900, reach: pickWelcome },
  changes: {
    width: 1440,
    height: 900,
    reach: async (page) => {
      await page.locator('#studio-changes-button').click();
      await expect(page.getByTestId('changes-panel')).toBeVisible();
    },
  },
  manage: {
    width: 1440,
    height: 900,
    reach: async (page) => {
      await page.getByTestId('manage-languages-toggle').click();
      await expect(page.locator('#studio-new-locale')).toBeVisible();
    },
  },
  import: {
    width: 1440,
    height: 900,
    reach: async (page) => {
      await page.locator('#studio-import-button').click();
      await expect(page.locator('#studio-import-title')).toBeVisible();
    },
  },
};

for (const variant of VARIANTS) {
  test.describe(`dev Studio, ${variant.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((stored) => {
        for (const [key, value] of stored) localStorage.setItem(key, value);
      }, variant.stored);
    });

    const open = async (page: Page, width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await page.goto(DEV);
      await connected(page);
      if (variant.rtl) await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'rtl');
    };

    for (const [screen, { width, height, reach }] of Object.entries(DEV_SCREENS)) {
      test(`${variant.name} ${screen} has no serious axe violations`, async ({ page }) => {
        await open(page, width, height);
        await reach(page);
        await noSeriousViolations(page);
      });
    }

    test(`${variant.name} compact-keys has no serious axe violations`, async ({ page }) => {
      await open(page, 1024, 768);
      await page.getByTestId('studio-toggle-keys').click();
      await expect(page.getByTestId('studio-drawer-keys')).toBeVisible();
      await noSeriousViolations(page);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('studio-drawer-keys')).toBeHidden();
      // At 1024px the key list lives in the keys drawer just closed, so the key is picked in the
      // preview instead.
      await page
        .frameLocator('#app-preview-iframe')
        .locator('[data-i18n-key="home.welcome_msg"]')
        .click({ modifiers: ['Alt'] });
      await expect(page.locator('#studio-translation-input')).toBeVisible();
      // The pick opens the side drawer; close it and open it again with its own toggle.
      await page.getByTestId('studio-toggle-side').click();
      await expect(page.getByTestId('studio-drawer-side')).toBeHidden();
      await page.getByTestId('studio-toggle-side').click();
      await expect(page.getByTestId('studio-drawer-side')).toBeVisible();
      await noSeriousViolations(page);
    });
  });

  test.describe(`share Studio, ${variant.name}`, () => {
    test.use({ colorScheme: variant.share.colorScheme, locale: variant.share.locale ?? 'en-US' });

    test(`${variant.name} tips has no serious axe violations`, async ({ page }) => {
      await page.goto(SHARE);
      await connected(page);
      await expect(page.locator('#studio-tips-title')).toBeVisible();
      await noSeriousViolations(page);
    });

    test(`${variant.name} send has no serious axe violations`, async ({ page }) => {
      await page.goto(SHARE);
      await connected(page);
      await page.locator('#studio-tips-name').fill('Sara');
      await page.locator('#studio-tips-start').click();
      await expect(page.locator('#studio-tips-title')).toBeHidden();
      // The share playground (playground-vite) has no home.welcome_msg; home.title is its first key.
      await editKey(page, 'home.title', 'Hola');
      await page.locator('#studio-send-button').click();
      await expect(page.locator('#studio-send-title')).toBeVisible();
      await noSeriousViolations(page);
    });
  });
}
