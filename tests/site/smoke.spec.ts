import { test, expect } from '@playwright/test';
import { scrollThrough } from './fixtures/scroll';

test('serves every request under the /livelocale/ base', async ({ page }) => {
  const urls: string[] = [];
  const failed: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('./');
  await scrollThrough(page); // loads every island, top to bottom
  expect(failed).toEqual([]);
  expect(
    urls.filter((u) => !u.startsWith('http://localhost:4173/livelocale/') && !u.startsWith('data:'))
  ).toEqual([]);
});

test('self-hosts the brand fonts', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
  );
  expect(loaded).toEqual(
    expect.arrayContaining([
      'Martian Mono',
      'IBM Plex Sans',
      'IBM Plex Mono',
      'IBM Plex Sans Arabic',
    ])
  );
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(12, 13, 15)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(232, 228, 217)');
  expect(
    await page
      .locator('[data-lang="ar"] .sample-title')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
  ).toMatch(/^"IBM Plex Sans", "IBM Plex Sans Arabic"/);
});
