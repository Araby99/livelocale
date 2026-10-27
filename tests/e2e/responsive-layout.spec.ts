import { test, expect } from '@playwright/test';

test.describe('Responsive Studio layout', () => {
  for (const vp of [
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
  ]) {
    test(`keeps the app at least 60% wide at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('http://localhost:3010');
      await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });
      const frame = page.locator('#app-preview-iframe');
      expect((await frame.boundingBox())!.width).toBeGreaterThanOrEqual(vp.width * 0.6);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await page
        .frameLocator('#app-preview-iframe')
        .locator('[data-i18n-key="home.welcome_msg"]')
        .click({ modifiers: ['Alt'] });
      await expect(page.locator('#studio-translation-input')).toBeVisible();
      expect((await frame.boundingBox())!.width).toBeGreaterThanOrEqual(vp.width * 0.6);
    });
  }

  test('shows three columns at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3010');
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('keys-directory')).toBeVisible();
    await expect(page.getByTestId('editor-panel')).toBeVisible();
    await expect(page.getByTestId('studio-toggle-keys')).toHaveCount(0);
  });
});
