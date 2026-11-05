import { expect, test, type Page } from '@playwright/test';

const DEV = 'http://localhost:3010';
const SHARE = 'http://localhost:3020/livelocale/index.html';

const connected = (page: Page) =>
  expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 90_000,
  });

/** The URL of the document the preview iframe holds right now. */
const frameUrl = async (page: Page) =>
  (await (await page.locator('#app-preview-iframe').elementHandle())!.contentFrame())!.url();

const address = (page: Page) => page.locator('#studio-address');

/** Types `input` into the address field and opens it with Enter. */
const go = async (page: Page, input: string) => {
  await address(page).fill(input);
  await address(page).press('Enter');
};

/** The pathname of the preview, so `?locale=` the share Studio may add does not matter. */
const framePath = async (page: Page) => new URL(await frameUrl(page)).pathname;

/** Opens the share Studio and gets past the first-run tips once the app is connected. */
const openShare = async (page: Page) => {
  await page.goto(SHARE);
  await connected(page);
  const name = page.locator('#studio-tips-name');
  await name.fill('Sara');
  await page.locator('#studio-tips-start').click();
  await expect(name).toBeHidden();
  await connected(page);
};

/** Opens /about/ from the site-pages group with the keyboard and checks the preview lands there. */
const openAboutFromList = async (page: Page) => {
  await address(page).focus();
  const about = page
    .locator('[role="group"][aria-labelledby="studio-address-site"]')
    .locator('[role="option"][data-path="/about/"]');
  await expect(about).toBeVisible();
  const aboutId = await about.getAttribute('id');
  for (let i = 0; i < 20; i++) {
    await address(page).press('ArrowDown');
    if ((await address(page).getAttribute('aria-activedescendant')) === aboutId) break;
  }
  await expect(address(page)).toHaveAttribute('aria-activedescendant', aboutId!);
  await address(page).press('Enter');
  await expect.poll(() => framePath(page)).toBe('/about/');
  await expect(address(page)).toHaveValue('/about/');
};

test.describe('dev Studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEV);
    await connected(page);
  });

  test('shows the page and follows client-side navigation', async ({ page }) => {
    await expect(address(page)).toHaveValue('/');
    const frame = (await (await page
      .locator('#app-preview-iframe')
      .elementHandle())!.contentFrame())!;
    await frame.evaluate(() => history.pushState({}, '', '/?tab=2'));
    await expect(address(page)).toHaveValue('/?tab=2');
  });

  test('opens a typed path and reload stays there', async ({ page }) => {
    await go(page, '/?tab=3');
    await expect.poll(() => frameUrl(page)).toMatch(/\/\?tab=3/);
    const reload = page.getByTestId('reload-frame');
    await expect(reload).toBeEnabled();
    await reload.click();
    await connected(page);
    await expect(reload).toBeEnabled();
    expect(await frameUrl(page)).toMatch(/\?tab=3/);
  });

  test('refuses another origin', async ({ page }) => {
    const before = await frameUrl(page);
    await go(page, '//example.com/');
    await expect(page.locator('#studio-address-error')).toBeVisible();
    expect(await frameUrl(page)).toBe(before);
  });

  test('leaves room for the field', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    const box = await address(page).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(160);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
});

test.describe('share Studio', () => {
  test('lists site pages and opens one', async ({ page }) => {
    await openShare(page);
    await openAboutFromList(page);
    await address(page).blur();
    await address(page).focus();
    await expect(
      page
        .locator('[role="group"][aria-labelledby="studio-address-recent"]')
        .locator('[role="option"]')
        .first()
    ).toHaveAttribute('data-path', '/about/');
  });

  test('follows a link click', async ({ page }) => {
    await openShare(page);
    await page.frameLocator('#app-preview-iframe').locator('#to-about').click();
    await expect(address(page)).toHaveValue('/about/');
  });

  test('recovers after a page without the client', async ({ page }) => {
    await openShare(page);
    // The fixture serves its app shell for extensionless misses, so a file name is what
    // reaches its plain-text 404, a page without the client.
    await go(page, '/missing.html');
    await expect.poll(() => framePath(page)).toBe('/missing.html');
    await expect(page.frameLocator('#app-preview-iframe').locator('body')).toHaveText('Not Found');
    await go(page, '/about/');
    await expect.poll(() => framePath(page)).toBe('/about/');
    await expect(address(page)).toHaveValue('/about/');
  });
});
