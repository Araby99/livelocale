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
  expect(loaded).toEqual(expect.arrayContaining(['Bricolage Grotesque', 'Inter']));
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 248, 240)');
});
