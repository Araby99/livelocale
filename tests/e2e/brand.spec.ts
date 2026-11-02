import { test, expect } from '@playwright/test';
import { loadedFaces } from './fixtures/fonts.js';

test.describe('Studio brand', () => {
  test('loads the brand faces from the Studio bundle and nothing from Google', async ({ page }) => {
    const thirdParty: string[] = [];
    page.on('request', (r) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdParty.push(r.url());
    });
    await page.goto('http://localhost:3010');
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    // document.fonts.check() is true when no face matches; only a face with status 'loaded' proves the font arrived.
    expect(await loadedFaces(page)).toEqual(
      expect.arrayContaining(['Bricolage Grotesque', 'Inter'])
    );
    await expect(page.getByTestId('brand-mark')).toBeVisible();
    expect(thirdParty).toEqual([]);
  });
});
