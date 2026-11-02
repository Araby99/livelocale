import { test, expect } from '@playwright/test';
import { scrollThrough } from './fixtures/scroll';

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('renders both stories one after the other and every section', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('h1')).toHaveText('Stop collecting screenshots.', {
      useInnerText: true,
    });
    await expect(page.locator('.doors-row')).toBeHidden();
    const developer = page.getByRole('heading', { level: 2, name: 'When you ship the site' });
    const fixer = page.getByRole('heading', { level: 2, name: 'When you fix the text' });
    await expect(developer).toBeVisible();
    await expect(fixer).toBeVisible();
    const [d, f] = await Promise.all([developer.boundingBox(), fixer.boundingBox()]);
    expect(d!.y).toBeLessThan(f!.y);
    for (const h of ['Works where you already are', 'Start in two minutes'])
      await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
    await expect(page.getByText('Free, MIT, no account, no server.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\bPM\b/);
  });

  test('shows the real check output in the one-job colours', async ({ page }) => {
    await page.goto('./');
    const out = page.getByTestId('check-output');
    await expect(out).toContainText('npx livelocale check --hardcoded');
    await expect(out).toContainText('"Book a demo"');
    await expect(out).toContainText('[ar] hero.note');
    await expect(out).not.toContainText(/🔎|🌐|-{10}|[A-Z]:\//);
    const colours = await out.evaluate((el) => {
      const c = (sel: string) => getComputedStyle(el.querySelector(sel)!);
      return {
        fail: c('.c-fail').color,
        key: c('.c-key').color,
        outline: `${c('.c-hardcoded').outlineStyle} ${c('.c-hardcoded').outlineColor}`,
        warn: c('.c-warn-glyph').backgroundColor,
        nums: c('code').fontVariantNumeric,
      };
    });
    expect(colours).toEqual({
      fail: 'rgb(255, 84, 104)',
      key: 'rgb(79, 195, 220)',
      outline: 'dashed rgb(255, 84, 104)',
      warn: 'rgb(255, 178, 36)',
      nums: 'tabular-nums',
    });
  });

  test('puts the one tilted patch on "Stop"', async ({ page }) => {
    await page.goto('./');
    const s = await page.locator('h1 .patch').evaluate((el) => {
      const c = getComputedStyle(el);
      return { text: el.textContent, bg: c.backgroundColor, color: c.color, t: c.transform };
    });
    expect(s).toMatchObject({ text: 'Stop', bg: 'rgb(255, 178, 36)', color: 'rgb(12, 13, 15)' });
    expect(s.t).not.toBe('none');
  });
});

test('points at the real pull request and repository', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('a[href="https://github.com/Araby99/tidewell/pull/2"]')).toHaveCount(2);
  await expect(page.locator('a[href="https://github.com/Araby99/tidewell"]')).toHaveCount(1);
  await expect(page.locator('a[href="demo/livelocale/index.html"]')).toHaveText(
    'Try the live demo'
  );
});

test('has no horizontal scroll at 360 px', async ({ page }) => {
  for (const hash of ['', '#fixer']) {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`./${hash}`);
    await scrollThrough(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360
    );
  }
});

test('reaches every control by keyboard with a visible patch ring', async ({ page }) => {
  await page.goto('./');
  // One Tab stop for the radio group (arrows move inside it), so count it once.
  const stops =
    (await page.locator('a[href]:visible, button:visible, summary:visible').count()) + 1;
  const seen = new Set<string>();
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const [id, ring] = await page.evaluate((n) => {
      const active = document.activeElement as HTMLElement;
      active.dataset.tabSeen ??= String(n);
      // The door radios are invisible; their label draws the ring.
      const el = (active.matches('input[type="radio"]') ? active.closest('label') : active)!;
      const s = getComputedStyle(el);
      return [active.dataset.tabSeen, `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`];
    }, i);
    seen.add(id);
    expect(ring).toMatch(/^solid 2px rgb\(255, 178, 36\)$/);
  }
  expect(seen.size).toBe(stops); // every Tab reached a new element
});
