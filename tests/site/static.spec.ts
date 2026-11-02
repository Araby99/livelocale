import { test, expect } from '@playwright/test';
import { scrollThrough } from './fixtures/scroll';

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows every section, the fixed hero and the end of the pile', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('h1')).toHaveText('Stop collecting screenshots.', {
      useInnerText: true,
    });
    expect(
      await page
        .locator('#hero .patch')
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el, '::before');
          return [s.content, s.color, s.textDecorationLine];
        })
    ).toEqual(['"colecting"', 'rgb(107, 91, 77)', 'line-through']);
    await expect(page.getByTestId('pr-card')).toContainText('3 of 3 fixed');
    await expect(page.getByText("That's LiveLocale. Install it.")).toBeVisible();
    await expect(page.locator('.pile-pr')).toBeVisible();
    for (const h of [
      'How it works',
      'Drag between languages.',
      'Works where you already are',
      'Start in two minutes',
    ])
      await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
    await expect(page.getByText('Free, MIT, no account, no server.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\bPM\b/);
  });
});

test('has no horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('./');
  await scrollThrough(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('reaches every link by keyboard with a visible ink ring', async ({ page }) => {
  await page.goto('./');
  // Only what is shown: before the hero island mounts, html.js hides its completion link.
  const links = await page.locator('a[href]:visible, button:visible').count();
  const seen = new Set<string>();
  for (let i = 0; i < links; i++) {
    await page.keyboard.press('Tab');
    const [id, ring] = await page.evaluate((n) => {
      const el = document.activeElement as HTMLElement;
      el.dataset.tabSeen ??= String(n);
      const s = getComputedStyle(el);
      return [el.dataset.tabSeen, `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`];
    }, i);
    seen.add(id);
    expect(ring).toMatch(/^solid 2px rgb\((29, 23, 18|246, 238, 230)\)$/);
  }
  expect(seen.size).toBe(links); // every Tab reached a new element
});
