import { test, expect } from '@playwright/test';

test.describe('Responsive Studio layout', () => {
  for (const vp of [
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
  ]) {
    test(`keeps the app at least 60% wide at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('http://localhost:3010');
      await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 90_000 });
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

  test('reopens the editor drawer when the same key is picked again', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('http://localhost:3010');
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 90_000 });
    const key = page
      .frameLocator('#app-preview-iframe')
      .locator('[data-i18n-key="home.welcome_msg"]');
    await key.click({ modifiers: ['Alt'] });
    await expect(page.locator('#studio-translation-input')).toBeVisible();
    await page.getByTestId('studio-toggle-side').click();
    await expect(page.getByTestId('studio-drawer-side')).toBeHidden();
    await key.click({ modifiers: ['Alt'] });
    await expect(page.getByTestId('studio-drawer-side')).toBeVisible();
    await expect(page.locator('#studio-translation-input')).toBeVisible();
  });

  test('keeps the Keys toggle clickable while the Keys drawer is open', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('http://localhost:3010');
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 90_000 });
    await page.getByTestId('studio-toggle-keys').click();
    await expect(page.getByTestId('studio-drawer-keys')).toBeVisible();
    await page.getByTestId('studio-toggle-keys').click();
    await expect(page.getByTestId('studio-drawer-keys')).toBeHidden();
  });

  // A desktop gets the click switch, not the phone layout, however narrow its window. A
  // developer's Studio starts in Browse, so Alt+Click stays the gesture.
  test('shows the click switch in Browse on a desktop, even at 800x600', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('http://localhost:3010');
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('studio-toggle-keys')).toBeVisible();
    const modeSwitch = page.getByRole('radiogroup', { name: 'Click mode' });
    await expect(modeSwitch.getByRole('radio', { name: 'Browse' })).toBeChecked();
    await expect(page.getByTestId('phone-shell')).toHaveCount(0);
  });

  test('shows three columns at 1440x900', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3010');
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('keys-directory')).toBeVisible();
    await expect(page.getByTestId('editor-panel')).toBeVisible();
    await expect(page.getByTestId('studio-toggle-keys')).toHaveCount(0);
  });
});
