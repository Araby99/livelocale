import { test, expect, type Page } from '@playwright/test';
import { STUDIO_THEME_KEY } from '../../src/studio/preferences.js';

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
