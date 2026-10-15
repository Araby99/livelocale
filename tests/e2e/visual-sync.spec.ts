import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';

const LOCALES_PATH = path.resolve('./playground/locales');
const EN_LOCALE_FILE = path.join(LOCALES_PATH, 'en.json');

test.describe('Full Visual Translation Sync Loop', () => {
  let originalContent: string;

  test.beforeEach(async () => {
    // RULE TST-006: Snapshot the locale file so we can restore it after the test
    originalContent = await fs.readFile(EN_LOCALE_FILE, 'utf-8');
  });

  test.afterEach(async () => {
    // RULE TST-006: Always restore the original locale file
    await fs.writeFile(EN_LOCALE_FILE, originalContent, 'utf-8');
  });

  // ─── Phase 3: Watermark-decoded element selection ────────────────────────

  test('should open editor panel when a watermark-decoded element is hovered and clicked inside the iframe', async ({
    page,
  }) => {
    // Navigate to Studio UI
    await page.goto('http://localhost:3010');

    // First test of the run: the dev server may still be compiling the page and the
    // client bundle. Wait for the Studio to report the iframe bridge as connected
    // before asserting on anything the client scanner produces.
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });

    const frameElement = page.frameLocator('#app-preview-iframe');

    // The element no longer has manual data-i18n-key — it is decoded from the watermark
    // Use text-based locator or fallback to the attribute after auto-injection
    const welcomeText = frameElement.locator('[data-i18n-key="home.welcome_msg"]');

    // Give the client scanner enough time to decode and inject attributes
    await expect(welcomeText).toBeVisible({ timeout: 15_000 });

    // Verify the highlighter overlay appears on hover (interceptor highlight)
    await welcomeText.hover();
    const overlay = frameElement.locator('#i18n-lens-highlighter-overlay');
    await expect(overlay).toBeVisible();
    const border = await overlay.evaluate((el) => (el as HTMLElement).style.border);
    expect(border).toContain('dashed');

    await welcomeText.click({ modifiers: ['Alt'] });

    // Verify input panel is visible and populates the current value (ZW chars stripped)
    const input = page.locator('#studio-translation-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Welcome Back to Production');
  });

  test('should write updated value to the locale JSON file after saving (watermark flow)', async ({
    page,
  }) => {
    await page.goto('http://localhost:3010');

    const frameElement = page.frameLocator('#app-preview-iframe');

    // Wait for watermark scanner to inject the attribute
    await expect(frameElement.locator('[data-i18n-key="home.welcome_msg"]')).toBeVisible({
      timeout: 5000,
    });
    await frameElement.locator('[data-i18n-key="home.welcome_msg"]').click({ modifiers: ['Alt'] });

    const input = page.locator('#studio-translation-input');
    await input.clear();
    await input.fill('Studio E2E Test Value');

    const saveButton = page.locator('#studio-save-button');
    await saveButton.click();

    // Verify save success indicator
    await expect(page.locator('[data-testid="save-success"]')).toBeVisible();

    // Read mutated file on disk and verify it updated correctly
    const updated = JSON.parse(await fs.readFile(EN_LOCALE_FILE, 'utf-8'));
    expect(updated.home.welcome_msg).toBe('Studio E2E Test Value');
  });

  test('should reflect the updated value in the iframe after HMR (watermark flow)', async ({
    page,
  }) => {
    await page.goto('http://localhost:3010');

    const frameElement = page.frameLocator('#app-preview-iframe');

    await expect(frameElement.locator('[data-i18n-key="home.welcome_msg"]')).toBeVisible({
      timeout: 5000,
    });
    await frameElement.locator('[data-i18n-key="home.welcome_msg"]').click({ modifiers: ['Alt'] });

    const input = page.locator('#studio-translation-input');
    await input.clear();
    await input.fill('HMR Live Update Value');

    await page.locator('#studio-save-button').click();

    // The live preview already shows the typed value; wait for the save to be
    // acknowledged so the file is on disk before asserting on HMR (and before the
    // afterEach restore can race with the write).
    await expect(page.locator('[data-testid="save-success"]')).toBeVisible();

    // Wait for iframe to reflect the HMR update. If it doesn't happen automatically in 5s (due to slow file watchers),
    // trigger a manual reload of the iframe via the "Reload Frame" button.
    try {
      await expect(frameElement.locator('[data-i18n-key="home.welcome_msg"]')).toHaveText(
        /HMR Live Update Value/,
        {
          timeout: 5000,
        }
      );
    } catch {
      await page.locator('[title="Reload Frame"]').click();
      await expect(frameElement.locator('[data-i18n-key="home.welcome_msg"]')).toHaveText(
        /HMR Live Update Value/,
        {
          timeout: 10000,
        }
      );
    }
  });

  test('should not navigate the page when a watermark-decoded link element is clicked', async ({
    page,
  }) => {
    await page.goto('http://localhost:3010');

    const frameElement = page.frameLocator('#app-preview-iframe');

    // Wait for scanner to annotate the nav link
    const linkEl = frameElement.locator('[data-i18n-key="nav.home"]');
    await expect(linkEl).toBeVisible({ timeout: 5000 });

    const urlBefore = page.url();

    // Click link inside iframe with Alt modifier to edit instead of navigate
    await linkEl.click({ modifiers: ['Alt'] });

    // Main Studio URL should NOT change (navigation was intercepted)
    expect(page.url()).toBe(urlBefore);

    // Editor panel should open for the link key with clean (ZW-stripped) value
    const input = page.locator('#studio-translation-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Home');
  });

  // ─── Phase 3: Input sanitization guards ─────────────────────────────────

  test('should not have ZW characters in the translation input value', async ({ page }) => {
    await page.goto('http://localhost:3010');

    const frameElement = page.frameLocator('#app-preview-iframe');
    await expect(frameElement.locator('[data-i18n-key="home.title"]')).toBeVisible({
      timeout: 5000,
    });
    await frameElement.locator('[data-i18n-key="home.title"]').click({ modifiers: ['Alt'] });

    const input = page.locator('#studio-translation-input');
    await expect(input).toBeVisible();

    // Evaluate that the input value has NO zero-width characters
    const hasZW = await input.evaluate((el) => {
      const val = (el as HTMLInputElement).value;
      return /[\u200B\u200C\u200D]/.test(val);
    });
    expect(hasZW).toBe(false);
  });
  // ─── Changes panel: git status + session history ──────────────────────────

  test('should list the edited locale file and the session edit in the Changes panel', async ({
    page,
  }) => {
    await page.goto('http://localhost:3010');
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });

    const frameElement = page.frameLocator('#app-preview-iframe');
    const welcome = frameElement.locator('[data-i18n-key="home.welcome_msg"]');
    await expect(welcome).toBeVisible({ timeout: 15_000 });
    await welcome.click({ modifiers: ['Alt'] });

    const input = page.locator('#studio-translation-input');
    await input.clear();
    await input.fill('Changes Panel E2E Value');
    await page.locator('#studio-save-button').click();
    await expect(page.locator('[data-testid="save-success"]')).toBeVisible();

    await page.locator('#studio-changes-button').click();
    const panel = page.getByTestId('changes-panel');
    await expect(panel).toBeVisible();

    // The playground lives inside this repository, so git reports the locale file as modified.
    await expect(panel.getByText('playground/locales/en.json')).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText('home.welcome_msg')).toBeVisible();

    // Undo restores the previous value on disk without touching git.
    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect
      .poll(async () => JSON.parse(await fs.readFile(EN_LOCALE_FILE, 'utf-8')).home.welcome_msg)
      .toBe('Welcome Back to Production');
  });
});
