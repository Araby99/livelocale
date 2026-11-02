import { test, expect, type Page } from '@playwright/test';
const opacity = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
async function scrollPile(page: Page) {
  await page.evaluate(async () => {
    const s = document.getElementById('pile')!;
    for (let y = 0; y <= s.offsetHeight; y += 200) {
      window.scrollTo(0, y);
      await new Promise(requestAnimationFrame);
    }
  });
}

test('collapses the pile into the pull request as you scroll', async ({ page }) => {
  await page.goto('./');
  expect(await opacity(page, '.pile-card')).toBe('1');
  expect(Number(await opacity(page, '.pile-pr'))).toBeLessThan(0.1);
  await scrollPile(page);
  await expect.poll(() => opacity(page, '.pile-pr')).toBe('1');
  expect(await opacity(page, '.pile-card')).toBe('0');
});

test('collapses through the fallback when scroll timelines are missing', async ({ page }) => {
  await page.addInitScript(() => {
    const real = CSS.supports.bind(CSS);
    CSS.supports = ((a: string, b?: string) =>
      a === 'animation-timeline' ? false : real(a, b as string)) as typeof CSS.supports;
  });
  await page.goto('./');
  await expect(page.locator('html')).not.toHaveClass(/\bsda\b/);
  await scrollPile(page);
  await expect.poll(() => opacity(page, '.pile-pr')).toBe('1');
});

test.describe('reduced motion', () => {
  // Playwright has no top-level reducedMotion option; it is a context option.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('shows the end state at once', async ({ page }) => {
    await page.goto('./');
    expect(await opacity(page, '.pile-pr')).toBe('1');
    await expect(page.locator('#hero h1')).toBeAttached();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('shows the end state at once', async ({ page }) => {
    await page.goto('./');
    expect(await opacity(page, '.pile-pr')).toBe('1');
  });
});
