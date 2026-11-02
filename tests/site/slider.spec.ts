import { test, expect } from '@playwright/test';

const outlined = (page: import('@playwright/test').Page) =>
  page.locator('[data-island="slider"] [data-lang="ar"] .is-untranslated').allInnerTexts();

test('drags from English to Arabic and outlines what was never translated', async ({ page }) => {
  await page.goto('./#languages');
  const handle = page.getByRole('slider', { name: 'Language divider' });
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  const box = (await page.locator('[data-island="slider"] .slider-track').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuetext', '100% Arabic');
  await expect(page.locator('[data-lang="ar"]')).toHaveAttribute('dir', 'rtl');
  expect((await outlined(page)).sort()).toEqual(['Start free trial', 'Upgrade anytime.']);
  await expect(page.getByTestId('check-output')).toContainText(
    '✖ 2 strings never translated: found by check --hardcoded'
  );
});

test('moves the divider by keyboard', async ({ page }) => {
  await page.goto('./#languages');
  const handle = page.getByRole('slider', { name: 'Language divider' });
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '45');
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuetext', '0% Arabic');
  await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('aria-valuetext', '100% Arabic');
});

test('stays inside a 360 px viewport at both ends', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('./#languages');
  const handle = page.getByRole('slider', { name: 'Language divider' });
  for (const key of ['Home', 'End']) {
    await handle.focus();
    await page.keyboard.press(key);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360
    );
  }
});

test('shows the same outlines and check output without JavaScript as the island', async ({
  page,
  browser,
}) => {
  await page.goto('./#languages');
  await expect(page.getByRole('slider')).toBeVisible();
  const live = (await outlined(page)).sort();
  const liveOutput = await page.getByTestId('check-output').innerText();
  const off = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  await off.goto('http://localhost:4173/livelocale/#languages');
  expect((await outlined(off)).sort()).toEqual(live);
  expect(await off.getByTestId('check-output').innerText()).toBe(liveOutput);
});
