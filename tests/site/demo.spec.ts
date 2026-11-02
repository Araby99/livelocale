// tests/site/demo.spec.ts
import { test, expect } from '@playwright/test';

const openTitle = async (page: import('@playwright/test').Page) => {
  await page.goto('demo/livelocale/index.html');
  // A fresh visitor first sees the share Studio's first-run tips; they cover the preview.
  await page.getByRole('button', { name: 'Start editing' }).click();
  const title = page.frameLocator('#app-preview-iframe').getByText('Stop colecting screenshots.');
  await expect(title).toBeVisible();
  await title.click({ modifiers: ['Alt'] });
};

test('opens the real share Studio on the demo and edits by Alt+Click', async ({ page }) => {
  await openTitle(page);
  await expect(page.locator('#studio-translation-input')).toHaveValue(
    'Stop colecting screenshots.'
  );
});

test('keeps the GitHub repo out of the demo manifest', async ({ request }) => {
  const manifest = await (await request.get('demo/livelocale/manifest.json')).json();
  expect(manifest.repo).toBeUndefined();
});

test('sends nothing from the full Studio and offers no pull request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  await openTitle(page);
  await page.locator('#studio-translation-input').fill('Stop collecting screenshots.');
  await page.locator('#studio-save-button').click();
  await page.locator('#studio-send-button').click();
  await expect(page.locator('#studio-send-link')).toHaveValue(/#lc1\./);
  await expect(
    page.getByRole('button', { name: /Create pull request|Open on GitHub/ })
  ).toHaveCount(0);
  await expect(page.locator('a[href*="github.com"][href*="/issues/new"]')).toHaveCount(0);
  expect(requests.filter((r) => !r.startsWith('GET http://localhost:4173/livelocale/'))).toEqual(
    []
  );
});
