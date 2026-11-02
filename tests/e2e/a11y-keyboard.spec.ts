import { test, expect, type Page } from '@playwright/test';
import { STUDIO_LANGUAGE_KEY, STUDIO_THEME_KEY } from '../../src/studio/preferences.js';

const tabStops = async (page: Page, n: number) => {
  const seen: { tag: string; outline: string; width: string; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        outline: cs.outlineStyle,
        width: cs.outlineWidth,
        color: cs.outlineColor,
      };
    });
    if (s.tag !== 'IFRAME' && s.tag !== 'BODY') seen.push(s);
  }
  return seen;
};

test.describe('Studio keyboard access', () => {
  for (const [theme, color] of [
    ['dark', 'rgb(255, 178, 36)'],
    ['light', 'rgb(143, 91, 0)'],
  ] as const) {
    test(`shows a 2px solid brand focus ring on the first eight Tab stops in ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STUDIO_THEME_KEY, theme]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('http://localhost:3010');
      await expect(page.getByTestId('connection-status')).toHaveAttribute(
        'data-status',
        'connected',
        {
          timeout: 90_000,
        }
      );
      for (const s of await tabStops(page, 8))
        expect(s).toMatchObject({ outline: 'solid', width: '2px', color });
    });
  }
});

const connected = (page: Page) =>
  expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 90_000,
  });
const changesDialog = (page: Page) =>
  page.locator('[role="dialog"][aria-labelledby="studio-changes-title"]');

test.describe('keyboard journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3010');
    await connected(page);
  });
  test('picks a key from the list and lands in the editor by keyboard', async ({ page }) => {
    await page.locator('#studio-keys-search').focus();
    await page.keyboard.type('home.welcome_msg');
    const row = page.locator('[data-testid="keys-directory"] .overflow-y-auto > button').first();
    await row.focus();
    // Task 25: inside the scrolling list the ring is drawn inset, so it is never clipped
    expect(await row.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('-2px');
    await page.keyboard.press('Enter');
    await expect(page.locator('#studio-translation-input')).toBeFocused();
  });
  // Final review F3: in dark mode the focus colour is the amber Save fill, and inside the scrolling
  // editor the ring is drawn inset, on that fill. It must not take the fill's colour.
  test('keeps the Save focus ring visible on its amber fill in dark mode', async ({ page }) => {
    await page.evaluate((key) => localStorage.setItem(key, 'dark'), STUDIO_THEME_KEY);
    await page.reload();
    await connected(page);
    await page.locator('#studio-keys-search').focus();
    await page.keyboard.type('home.welcome_msg');
    await page.locator('[data-testid="keys-directory"] .overflow-y-auto > button').first().focus();
    await page.keyboard.press('Enter');
    const input = page.locator('#studio-translation-input');
    await expect(input).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type(' (ring check)');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.id === 'studio-save-button')) break;
    }
    const ring = await page.locator('#studio-save-button').evaluate(async (el) => {
      // The fill fades in from the disabled colour; compare the settled colours.
      await Promise.all(el.getAnimations().map((a) => a.finished));
      const s = getComputedStyle(el);
      return {
        focused: document.activeElement === el,
        style: `${s.outlineStyle} ${s.outlineWidth}`,
        offset: s.outlineOffset,
        outline: s.outlineColor,
        fill: s.backgroundColor,
      };
    });
    expect(ring).toMatchObject({ focused: true, style: 'solid 2px', offset: '-2px' });
    expect(ring.outline).not.toBe(ring.fill);
  });
  test('opens and closes Changes by keyboard', async ({ page }) => {
    await page.locator('#studio-changes-button').focus();
    await page.keyboard.press('Enter');
    await expect(changesDialog(page)).toBeVisible();
    expect(await changesDialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(
      true
    );
    await page.keyboard.press('Escape');
    await expect(changesDialog(page)).toBeHidden();
    await expect(page.locator('#studio-changes-button')).toBeFocused();
  });
  test('opens the Keys drawer by keyboard at 1024x768 and returns focus on Escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 }); // below 1280, the compact layout with drawers
    await page.getByTestId('studio-toggle-keys').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#studio-keys-search')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('studio-drawer-keys')).toBeHidden();
    await expect(page.getByTestId('studio-toggle-keys')).toBeFocused();
  });
});

// Review Focus 4 (outside the describe: the language is set before the first goto)
test('reaches the language and theme controls by keyboard in Arabic', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'ar'), STUDIO_LANGUAGE_KEY);
  await page.goto('http://localhost:3010');
  await connected(page);
  await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'rtl');
  const ring = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
  await page.locator('#studio-language-toggle').focus();
  expect(await ring()).toBe('solid 2px');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-theme-choice="system"]')).toBeFocused();
  expect(await ring()).toBe('solid 2px');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-theme-choice="light"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-theme-choice="light"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
    false
  );
  await page.locator('#studio-language-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'ltr');
});
