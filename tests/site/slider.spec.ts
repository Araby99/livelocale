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

// Chromium floors a computed outline width to whole CSS pixels at every device scale (1.5px
// computes as 1px), so the width is read from the stylesheet rule that declares the outline. The
// shorthand holds a var(), so only the shorthand itself, not its longhands, has a value there.
const declaredOutline = (page: import('@playwright/test').Page, selector: string) =>
  page.evaluate((sel) => {
    for (const sheet of Array.from(document.styleSheets))
      for (const rule of Array.from(sheet.cssRules))
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText.split(',').some((s) => s.trim() === sel) &&
          rule.style.getPropertyValue('outline')
        )
          return rule.style.getPropertyValue('outline');
    return null;
  }, selector);

test('outlines untranslated text with a 1.5px dashed Exit 1 line, never a red fill', async ({
  page,
}) => {
  await page.goto('./#languages');
  await expect(page.getByRole('slider')).toBeVisible();
  const outlines = await page
    .locator('[data-island="slider"] [data-lang="ar"] .is-untranslated')
    .evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return [s.outlineStyle, s.outlineColor, s.backgroundColor];
      })
    );
  expect(outlines.length).toBeGreaterThan(0);
  for (const [style, color, bg] of outlines) {
    expect([style, color]).toEqual(['dashed', 'rgb(255, 84, 104)']);
    expect(bg).not.toContain('255, 84, 104');
  }
  expect(await declaredOutline(page, '.is-untranslated')).toMatch(/^1\.5px dashed /);
});

test('labels each half with a Hunk locale chip', async ({ page }) => {
  await page.goto('./#languages');
  await expect(page.getByRole('slider')).toBeVisible();
  const chips = page.locator('[data-island="slider"] .locale-chip');
  await expect(chips).toHaveText(['en', 'ar']);
  for (const s of await chips.evaluateAll((els) =>
    els.map((el) => [getComputedStyle(el).color, getComputedStyle(el).fontFamily])
  )) {
    expect(s[0]).toBe('rgb(79, 195, 220)');
    expect(s[1]).toMatch(/^"IBM Plex Mono"/);
  }
});
