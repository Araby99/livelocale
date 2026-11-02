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
    ).toEqual(['"colecting"', 'rgb(110, 107, 100)', 'line-through']);
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

  test('writes the hero headline as a diff pair', async ({ page }) => {
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('./');
      const old = page.locator('#hero .diff-old');
      await expect(old).toHaveText('Collect screenshots of every typo before launch.');
      const ghost = await old.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          line: getComputedStyle(el.querySelector('del')!).textDecorationLine,
          size: parseFloat(s.fontSize),
          before: getComputedStyle(el, '::before').content,
        };
      });
      expect(ghost.color).toBe('rgb(110, 107, 100)');
      expect(ghost.line).toBe('line-through');
      expect(ghost.size).toBeGreaterThanOrEqual(24);
      expect(ghost.before).toContain('−');
      const h1 = page.locator('#hero h1');
      const plus = await h1.evaluate((el) => {
        const s = getComputedStyle(el, '::before');
        return [s.content, s.color];
      });
      expect(plus[0]).toContain('+');
      expect(plus[1]).toBe('rgb(255, 178, 36)');
      expect(await h1.innerText()).toBe('Stop collecting screenshots.');
    }
  });

  test('puts the one tilted patch on "Stop"', async ({ page }) => {
    await page.goto('./');
    const lead = page.locator('#hero .lead-patch');
    await expect(lead).toHaveText('Stop');
    const s = await lead.evaluate((el) => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, color: c.color, transform: c.transform, shadow: c.boxShadow };
    });
    expect(s.bg).toBe('rgb(255, 178, 36)');
    expect(s.color).toBe('rgb(12, 13, 15)');
    expect(s.transform).not.toBe('none');
    expect(s.shadow).toContain('rgb(138, 86, 0)');
    expect(s.shadow).toContain('3px 4px 0px');
    const patches = await page
      .locator('#hero .patch')
      .evaluateAll((els) =>
        els.map((el) => [getComputedStyle(el).transform, getComputedStyle(el).backgroundColor])
      );
    expect(patches).toHaveLength(3);
    for (const p of patches) expect(p).toEqual(['none', 'rgb(255, 178, 36)']);
  });

  test('shows done in Exit 0 with a check', async ({ page }) => {
    await page.goto('./');
    const [color, before] = await page
      .locator('#hero .bar-done')
      .evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el, '::before').content]);
    expect(color).toBe('rgb(111, 214, 154)');
    expect(before).toContain('✓');
  });

  test("circles the pile's mistakes in dashed red", async ({ page }) => {
    await page.goto('./');
    expect(
      await page
        .locator('.ring')
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return [s.borderTopStyle, s.borderTopColor];
        })
    ).toEqual(['dashed', 'rgb(255, 84, 104)']);
  });

  test('writes the PR card as a diff', async ({ page }) => {
    await page.goto('./');
    expect(
      await page
        .locator('.pr-pairs ins')
        .first()
        .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])
    ).toEqual(['rgb(46, 36, 18)', 'rgb(255, 178, 36)']);
    expect(
      await page
        .locator('.pr-pairs del')
        .first()
        .evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).textDecorationLine])
    ).toEqual(['rgb(140, 136, 125)', 'line-through']);
  });
});

test('has no horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('./');
  await scrollThrough(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('reaches every link by keyboard with a visible patch ring', async ({ page }) => {
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
    expect(ring).toMatch(/^solid 2px rgb\(255, 178, 36\)$/);
  }
  expect(seen.size).toBe(links); // every Tab reached a new element
});
