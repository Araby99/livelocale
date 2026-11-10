import { test, expect } from '@playwright/test';
import { loadedFaces } from './fixtures/fonts.js';

const DEV = 'http://localhost:3010';

test.describe('Studio brand', () => {
  test('loads the brand faces from the Studio bundle and nothing from Google', async ({ page }) => {
    const thirdParty: string[] = [];
    page.on('request', (r) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdParty.push(r.url());
    });
    await page.goto(DEV);
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    // document.fonts.check() is true when no face matches; only a face with status 'loaded' proves the font arrived.
    const faces = await loadedFaces(page);
    expect(faces).toEqual(expect.arrayContaining(['IBM Plex Sans', 'Martian Mono']));
    for (const old of ['Inter', 'Bricolage Grotesque', 'JetBrains Mono', 'Readex Pro'])
      expect(faces, old).not.toContain(old);
    await expect(page.getByTestId('brand-mark')).toBeVisible();
    expect(thirdParty).toEqual([]);
  });

  test('colours the patch mark with the hunk fills in dark', async ({ page }) => {
    await page.goto(DEV);
    await expect(page.getByText('Connected', { exact: true })).toBeVisible({ timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      true
    );
    const fill = (cls: string) =>
      page.evaluate(
        (c) => getComputedStyle(document.querySelector(`[data-testid="brand-mark"] .${c}`)!).fill,
        cls
      );
    expect(await fill('fill-logo-ink')).toBe('rgb(232, 228, 217)');
    expect(await fill('fill-accent')).toBe('rgb(255, 178, 36)');
    expect(await fill('fill-accent-shadow')).toBe('rgb(138, 86, 0)');
    const wordmark = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('h1')!);
      return { family: s.fontFamily, weight: s.fontWeight };
    });
    expect(wordmark.family.startsWith('"Martian Mono"')).toBe(true);
    expect(wordmark.weight).toBe('500');
  });
});
