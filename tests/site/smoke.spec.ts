import { test, expect } from '@playwright/test';
import { scrollThrough } from './fixtures/scroll';

const BASE = 'http://localhost:4173/livelocale/';

test('keeps the direction contract as the first child of body in the build', async ({
  request,
}) => {
  const html = await (await request.get('./')).text();
  const body = html.slice(html.indexOf('<body>') + '<body>'.length).trimStart();
  expect(body.startsWith('<!--')).toBe(true);
  const contract = body.slice(0, body.indexOf('-->'));
  // No decision record carries the roll's seed key, so the contract says the roll was skipped.
  expect(contract).toContain('FORM: Two doors');
  expect(contract).toContain('the roll counts as skipped');
  for (const line of ['THESIS:', 'OWN-WORLD:', 'STORY:', 'FIRST VIEWPORT:', 'FORM:', 'FINISH:'])
    expect(contract).toContain(line);
});

for (const door of ['developer', 'fixer']) {
  test(`serves every request under the /livelocale/ base (${door} door)`, async ({ page }) => {
    const urls: string[] = [];
    const failed: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(`./#${door}`);
    await scrollThrough(page);
    expect(failed).toEqual([]);
    expect(urls.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:'))).toEqual([]);
  });
}

test('self-hosts the brand fonts', async ({ page }) => {
  await page.goto('./#fixer'); // the fixer's story carries the Arabic sample
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
    await page.locator('.ar-sample').evaluate((el) => getComputedStyle(el).fontFamily)
  ).toMatch(/^"IBM Plex Sans", "IBM Plex Sans Arabic"/);
});
