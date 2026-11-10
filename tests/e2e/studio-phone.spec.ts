import { devices, expect, test, type Page } from '@playwright/test';

/** The notice for tapped text with no translation behind it (catalogue key touch.unkeyed). */
const UNKEYED = /not connected to a translation/;

// The static share fixture (playground-vite built with `share: true`) on an emulated phone:
// touch, a coarse pointer and a 412 px screen, so the Studio shows its phone layout.
const SHARE = 'http://localhost:3020/livelocale/index.html';

test.use({ ...devices['Pixel 7'] });

/** The Edit / Browse switch in the phone's bottom bar. */
const modeSwitch = (page: Page) => page.getByRole('radiogroup', { name: 'Tap mode' });

/** The editor sheet, the one dialog holding the translation field. */
const editorSheet = (page: Page) =>
  page.getByRole('dialog').filter({ has: page.locator('#studio-translation-input') });

/** The URL of the document the preview iframe holds right now. */
const frameUrl = async (page: Page) =>
  (await (await page.locator('#app-preview-iframe').elementHandle())!.contentFrame())!.url();

/** The pathname of the document the preview iframe holds right now. */
const framePath = async (page: Page) => new URL(await frameUrl(page)).pathname;

/** Matches text that reads `text` once the key watermark (U+200B to U+200D) is ignored. */
function shows(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[\\u200B-\\u200D]*${escaped}$`);
}

/**
 * Opens the share Studio, gets past the first-run tips, and waits for a client that can
 * tap to edit (the switch only shows once the page says it knows Edit mode).
 */
async function openStudio(page: Page): Promise<void> {
  await page.goto(SHARE);
  await expect(modeSwitch(page)).toBeVisible({ timeout: 30_000 });
  const name = page.locator('#studio-tips-name');
  const tipsShown = await name.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false
  );
  if (tipsShown) {
    await name.fill('Sara');
    await page.locator('#studio-tips-start').tap();
    await expect(name).toBeHidden();
  }
}

/** Switches the bottom bar to Edit or Browse. */
async function setMode(page: Page, mode: 'Edit' | 'Browse'): Promise<void> {
  await modeSwitch(page).getByText(mode, { exact: true }).tap();
  await expect(modeSwitch(page).getByRole('radio', { name: mode })).toBeChecked();
}

/** Taps keyed text in the site and waits for the editor sheet to show its key. */
async function tapKey(page: Page, key: string): Promise<void> {
  await page.frameLocator('#app-preview-iframe').locator(`[data-i18n-key="${key}"]`).tap();
  await expect(editorSheet(page)).toBeVisible();
  await expect(editorSheet(page)).toContainText(key);
}

/** Types `value` in the editor sheet and saves it. */
async function saveInSheet(page: Page, value: string): Promise<void> {
  await page.locator('#studio-translation-input').fill(value);
  await page.locator('#studio-save-button').tap();
  await expect(page.locator('[data-testid="save-success"]')).toBeVisible();
}

test('opens in Edit with outlines and the tap hint', async ({ page }) => {
  await openStudio(page);
  await expect(page.getByTestId('phone-shell')).toBeVisible();
  await expect(modeSwitch(page).getByRole('radio', { name: 'Edit' })).toBeChecked();
  const frame = page.frameLocator('#app-preview-iframe');
  await expect(frame.locator('html')).toHaveAttribute('data-livelocale-edit', '');
  await expect(frame.locator('[data-i18n-key="home.title"]')).toHaveCSS('outline-style', 'dashed');
  await expect(page.getByTestId('tap-notice')).toHaveText('Tap any text to fix it');
});

test("tapping a link's text selects it and does not navigate", async ({ page }) => {
  await openStudio(page);
  await tapKey(page, 'home.about');
  await expect(page.locator('#studio-translation-input')).toHaveValue('About');
  // Give a navigation the time to start; the page must stay where it is.
  await page.waitForTimeout(500);
  expect(await framePath(page)).toBe('/');
});

test('tapping an image link does nothing', async ({ page }) => {
  await openStudio(page);
  await page.frameLocator('#app-preview-iframe').locator('#logo-link').tap();
  await page.waitForTimeout(500);
  expect(await framePath(page)).toBe('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Nothing to fix there, so no "not connected to a translation" notice either.
  await expect(page.getByTestId('tap-notice')).not.toHaveText(UNKEYED);
});

test('Browse follows the link and the switch stays on Browse on the new page', async ({ page }) => {
  await openStudio(page);
  await setMode(page, 'Browse');
  const frame = page.frameLocator('#app-preview-iframe');
  await frame.locator('#to-about').tap();
  await expect.poll(() => framePath(page)).toBe('/about/');
  await expect(frame.locator('[data-i18n-key="home.title"]')).toBeVisible();
  await expect(modeSwitch(page).getByRole('radio', { name: 'Browse' })).toBeChecked();
  await expect(frame.locator('html')).not.toHaveAttribute('data-livelocale-edit', '');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('switching back to Edit on the new page freezes it again', async ({ page }) => {
  await openStudio(page);
  await setMode(page, 'Browse');
  const frame = page.frameLocator('#app-preview-iframe');
  await frame.locator('#to-about').tap();
  await expect.poll(() => framePath(page)).toBe('/about/');
  await expect(frame.locator('[data-i18n-key="home.title"]')).toBeVisible();
  await setMode(page, 'Edit');
  await expect(frame.locator('html')).toHaveAttribute('data-livelocale-edit', '');
  // The Arabic link has no key: the tap shows the notice and does not leave the page.
  await frame.locator('#lang-ar').tap();
  await expect(page.getByTestId('tap-notice')).toHaveText(UNKEYED);
  await page.waitForTimeout(500);
  expect(new URL(await frameUrl(page)).search).toBe('');
  await tapKey(page, 'home.title');
});

test('the editor sheet is compact and keeps the picked text in view above it', async ({ page }) => {
  await openStudio(page);
  await tapKey(page, 'home.title');
  const sheet = editorSheet(page);
  // None of the desktop panel's chrome.
  await expect(sheet).not.toContainText('Edit text');
  await expect(sheet).not.toContainText('Clear Selection');
  await expect(sheet.getByRole('combobox')).toHaveCount(0);
  await expect(sheet.getByTestId('manage-languages-toggle')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(sheet.getByTestId('next-missing')).toBeVisible();

  // At least ~40% of the screen stays on the page.
  const viewport = page.viewportSize()!;
  const box = (await sheet.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(viewport.height * 0.6 + 1);

  // The picked text is visible above the sheet once it has settled.
  const picked = page.frameLocator('#app-preview-iframe').locator('[data-i18n-key="home.title"]');
  await expect
    .poll(async () => {
      const text = await picked.boundingBox();
      const top = (await sheet.boundingBox())!.y;
      return text !== null && text.y >= 56 && text.y + text.height <= top;
    })
    .toBe(true);

  // Typing updates the page behind the sheet.
  await page.locator('#studio-translation-input').fill('Live from the sheet');
  await expect(picked).toHaveText(shows('Live from the sheet'));
});

test('the picked text keeps a solid amber outline until the selection clears', async ({ page }) => {
  await openStudio(page);
  // Arabic leaves home.cta out, so Next missing has somewhere to go.
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ar');
  const frame = page.frameLocator('#app-preview-iframe');
  await expect(frame.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(modeSwitch(page).getByRole('radio', { name: 'Edit' })).toBeChecked();
  const title = frame.locator('[data-i18n-key="home.title"]');
  await tapKey(page, 'home.title');
  await expect(title).toHaveAttribute('data-livelocale-picked', '');
  await expect(title).toHaveCSS('outline-style', 'solid');
  await expect(title).toHaveCSS('outline-color', 'rgb(255, 178, 36)');
  await expect(frame.locator('[data-livelocale-picked]')).toHaveCount(1);

  // Next missing moves the marker with the selection.
  await page.getByTestId('next-missing').tap();
  await expect(editorSheet(page)).toContainText('home.cta');
  await expect(frame.locator('[data-i18n-key="home.cta"]')).toHaveAttribute(
    'data-livelocale-picked',
    ''
  );
  await expect(frame.locator('[data-livelocale-picked]')).toHaveCount(1);

  // Closing the sheet clears the selection, and the marker with it.
  await page.getByTestId('bottom-sheet-backdrop').tap({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(frame.locator('[data-livelocale-picked]')).toHaveCount(0);
});

test('closing the sheet with unsaved text asks first, then clears the selection', async ({
  page,
}) => {
  await openStudio(page);
  await tapKey(page, 'home.title');
  await page.locator('#studio-translation-input').fill('Not saved yet');
  await page.keyboard.press('Escape');
  const confirm = page.getByRole('dialog', { name: /unsaved/i });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: /keep/i }).tap();
  await expect(editorSheet(page)).toBeVisible();
  await page.getByTestId('bottom-sheet-backdrop').tap({ position: { x: 20, y: 20 } });
  await page
    .getByRole('dialog', { name: /unsaved/i })
    .getByRole('button', { name: /discard/i })
    .tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the More menu closes once an item is chosen', async ({ page }) => {
  await openStudio(page);
  await page.getByRole('button', { name: 'More' }).tap();
  await expect(page.getByTestId('phone-menu')).toBeVisible();
  await page.getByRole('button', { name: 'Dark theme' }).tap();
  await expect(page.getByTestId('phone-menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'More' }).tap();
  await expect(page.getByTestId('phone-menu')).toBeVisible();
  await page.getByTestId('phone-menu-backdrop').tap({ position: { x: 20, y: 300 } });
  await expect(page.getByTestId('phone-menu')).toHaveCount(0);
});

test('type and save updates the page', async ({ page }) => {
  await openStudio(page);
  await tapKey(page, 'home.title');
  await saveInSheet(page, 'Hello from a phone');
  await expect(
    page.frameLocator('#app-preview-iframe').locator('[data-i18n-key="home.title"]')
  ).toHaveText(shows('Hello from a phone'));
  await expect(page.locator('#studio-send-button')).toHaveText('Send · 1');
});

test('Next missing walks the gaps and then reports done', async ({ page }) => {
  await openStudio(page);
  // Arabic leaves out home.cta and home.footer (visible) and home.menu_item (a closed menu).
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ar');
  const frame = page.frameLocator('#app-preview-iframe');
  await expect(frame.locator('main')).toHaveAttribute('lang', 'ar');
  await expect(modeSwitch(page).getByRole('radio', { name: 'Edit' })).toBeChecked();
  await tapKey(page, 'home.title');

  const next = page.getByTestId('next-missing');
  await next.tap();
  await expect(editorSheet(page)).toContainText('home.cta');
  await saveInSheet(page, 'ابدأ تجربتك المجانية');

  await next.tap();
  await expect(editorSheet(page)).toContainText('home.footer');
  await saveInSheet(page, 'صنع بعناية في القاهرة');

  await next.tap();
  await expect(editorSheet(page)).toContainText(
    'Everything you can see is translated. 1 more is in a hidden part of the page (a menu or slide).'
  );
  await expect(frame.locator('[data-i18n-key="home.cta"]')).toHaveText(
    shows('ابدأ تجربتك المجانية')
  );
});

test('Send shows the change list and Copy link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openStudio(page);
  await tapKey(page, 'home.title');
  await saveInSheet(page, 'Hello from a phone');
  // Close the editor sheet by tapping the dimmed page above it.
  await page.getByTestId('bottom-sheet-backdrop').tap({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.locator('#studio-send-button').tap();
  const sheet = page.getByRole('dialog', { name: 'Send to developer' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('send-dialog-changes')).toContainText('home.title · en');
  await expect(sheet.getByTestId('send-dialog-changes')).toContainText('Hello from a phone');
  await expect(sheet.locator('#studio-send-copy')).toBeVisible();
  await sheet.locator('#studio-send-copy').tap();
  await expect(sheet).toContainText('Link copied.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^http:\/\/localhost:3020\/livelocale\/index\.html#lc1\.[A-Za-z0-9_-]+$/);
  await expect(page.locator('#studio-send-button')).toHaveText('Send · 0');
});

test('the top bar still works while the editor sheet is open', async ({ page }) => {
  await openStudio(page);
  await tapKey(page, 'home.title');
  await saveInSheet(page, 'Hello from a phone');
  // Send sits above the sheet's dim: a tap opens Send instead of closing the editor.
  await page.locator('#studio-send-button').tap();
  const send = page.getByRole('dialog', { name: 'Send to developer' });
  await expect(send).toBeVisible();
  await expect(send.getByTestId('send-dialog-changes')).toContainText('home.title · en');
  await page.keyboard.press('Escape');
  await expect(send).toHaveCount(0);

  // The editor sheet is still up, and the locale chip takes the tap too.
  await expect(editorSheet(page)).toBeVisible();
  const chip = page.getByRole('combobox', { name: 'Language' });
  // A trial tap checks the chip is what a finger there would hit, without opening the picker.
  await chip.tap({ trial: true });
  await chip.selectOption('ar');
  await expect(page.frameLocator('#app-preview-iframe').locator('main')).toHaveAttribute(
    'lang',
    'ar'
  );
});
