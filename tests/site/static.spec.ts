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
    for (const h of [
      'Works where you already are',
      'Start in two minutes',
      'Fix your first string now',
    ])
      await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
    // The skeptic's proof is in the first viewport, under the two actions.
    await expect(page.locator('.hero .hero-proof')).toHaveText('Free, MIT, no account, no server.');
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
  await expect(page.locator('.hero a[href="demo/livelocale/index.html"]')).toHaveText(
    'Try the live demo'
  );
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('writes the pull request as a diff: struck old text, amber plus, locale chips, exit 0', async ({
    page,
  }) => {
    await page.goto('./');
    const diff = page.getByTestId('pr-diff');
    await expect(diff.locator('.chip')).toHaveText(['en', 'ar']);
    const s = await diff.evaluate((el) => {
      const c = (sel: string) => getComputedStyle(el.querySelector(sel)!);
      return {
        old: `${c('.d-del del').color} ${c('.d-del del').textDecorationLine}`,
        strike: c('.d-del del').textDecorationColor,
        row: c('.d-add').backgroundColor,
        plus: c('.d-add .d-sign').backgroundColor,
        chip: c('.chip').color,
        done: c('.diff-result').color,
      };
    });
    expect(s).toEqual({
      old: 'rgb(140, 136, 125) line-through',
      strike: 'rgb(110, 107, 100)',
      row: 'rgb(46, 36, 18)',
      plus: 'rgb(255, 178, 36)',
      chip: 'rgb(79, 195, 220)',
      done: 'rgb(111, 214, 154)',
    });
    await expect(diff.locator('.d-del').first()).toContainText(
      '"title": "Plans that grows with you"'
    );
    await expect(diff.locator('.d-add').first()).toContainText(
      '"title": "Plans that grow with you"'
    );
    await expect(diff.locator('.diff-result')).toContainText('pull request opened');
    await expect(diff.locator('.diff-result svg use')).toHaveAttribute('href', '#i-check');
    const pair = page.getByTestId('fix-pair');
    await expect(pair.locator('del')).toHaveText('Was: Plans that grows with you');
    await expect(pair.locator('ins')).toHaveText('Now: Plans that grow with you');
  });
});

test('sets struck old text in letters that pass AA on the background they sit on', async ({
  page,
}) => {
  await page.goto('./');
  // Every removed line, in the pull request diff and the fixer's pair (both render without a door
  // chosen, since the check reads computed styles, not visibility).
  const ratios = await page.locator('.d-del del').evaluateAll((dels) => {
    const rgb = (v: string) =>
      v
        .match(/\d+(\.\d+)?/g)!
        .slice(0, 4)
        .map(Number);
    const lum = ([r, g, b]: number[]) => {
      const ch = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const backdrop = (el: Element | null): number[] => {
      for (let n = el; n; n = n.parentElement) {
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c.length < 4 || c[3] > 0) return c.slice(0, 3);
      }
      return rgb(getComputedStyle(document.body).backgroundColor);
    };
    return dels.map((del) => {
      const fg = lum(rgb(getComputedStyle(del).color));
      const bg = lum(backdrop(del));
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
  });
  expect(ratios.length).toBeGreaterThanOrEqual(3);
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
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
