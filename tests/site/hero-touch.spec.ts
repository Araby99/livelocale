// tests/site/hero-touch.spec.ts
import { test, expect } from '@playwright/test';
test('@touch taps each typo, shows the computer note, and finishes', async ({ page }) => {
  await page.goto('./#hero');
  await expect(
    page.getByText('On a computer, hold Alt and click any text to edit the real thing.')
  ).toBeVisible();
  for (const word of ['colecting', 'rite', 'traducido'])
    await page.getByRole('button', { name: `Fix ${word}` }).tap();
  await expect(page.getByTestId('pr-card')).toContainText('3 of 3 fixed');
  await expect(page.getByText("That's LiveLocale. Install it.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});
