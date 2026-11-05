import { test, expect } from '@playwright/test';
import { OG_IMAGE_ALT } from '../../site/src/lib/seo';

test('carries absolute share tags and the brand icons', async ({ page, request }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('livelocale: a review layer for next-intl or react-i18next');
  const meta = (p: string) =>
    page.locator(`meta[property="${p}"], meta[name="${p}"]`).getAttribute('content');
  expect(await meta('og:image')).toBe('http://localhost:4173/livelocale/og-image.png');
  expect(await meta('og:url')).toBe('http://localhost:4173/livelocale/');
  expect(await meta('twitter:card')).toBe('summary_large_image');
  expect(await meta('og:image:alt')).toBe(OG_IMAGE_ALT);
  const description = (await meta('description'))!;
  expect(description).toContain('on top of next-intl or react-i18next');
  expect(description.length).toBeLessThanOrEqual(160);
  expect(await meta('og:description')).toBe(description);
  expect(await meta('twitter:description')).toBe(description);
  expect(await meta('og:title')).toBe('livelocale: Stop collecting screenshots.');
  for (const href of await page
    .locator('link[rel~="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href)))
    expect((await request.get(href)).status(), href).toBe(200);
  expect((await request.get('og-image.png')).headers()['content-type']).toBe('image/png');
});
