import { test, expect } from '@playwright/test';
import { SIDEBAR } from '../../site/src/lib/docs-config';

const WIDTH = 360;
test.use({ viewport: { width: WIDTH, height: 780 } });

const scrollWidth = () => document.documentElement.scrollWidth;

test('has no horizontal scroll at 360 px on every docs page', async ({ page }) => {
  const failures: string[] = [];
  for (const link of SIDEBAR.flatMap((g) => g.items.map((i) => i.link))) {
    await page.goto(`docs${link.endsWith('/') ? link : link + '.html'}`);
    const width = await page.evaluate(scrollWidth);
    if (width > WIDTH) failures.push(`${link}: ${width}px`);
  }
  expect(failures).toEqual([]);
});

test('has no horizontal scroll at 360 px on the landing page with every FAQ open', async ({
  page,
}) => {
  await page.goto('./');
  for (const s of await page.locator('#faq summary').all()) await s.click();
  expect(await page.evaluate(scrollWidth)).toBeLessThanOrEqual(WIDTH);
});
