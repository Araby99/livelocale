// tests/site/hero.spec.ts
import { test, expect } from '@playwright/test';

const FIXES: Array<[string, string]> = [
  ['hero.title', 'Stop collecting screenshots.'],
  ['hero.lede', 'Anyone on your team fixes text right on the site.'],
  ['hero.ci', 'You get a pull request. CI catches what was never translated.'],
];

test('fixes a typo by Alt+Click and builds the pull-request card', async ({ page }) => {
  await page.goto('./#hero');
  await expect(page.getByText('3 mistakes left on this page')).toBeVisible();
  await page.locator('[data-mistake="hero.lede"]').click({ modifiers: ['Alt'] });
  await page.getByRole('dialog', { name: 'Edit text' }).getByRole('textbox').fill(FIXES[1][1]);
  await page.keyboard.press('Enter');
  const card = page.getByTestId('pr-card');
  await expect(card).toContainText('- "rite"');
  await expect(card).toContainText('+ "right"');
  await expect(card).toContainText('1 of 3 fixed');
  await expect(page.getByText('2 mistakes left on this page')).toBeVisible();
});

test('shows the same h1 before and after the island mounts', async ({ page }) => {
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { h1: string }).h1 = document.querySelector('h1')!.innerText;
    })
  );
  await page.goto('./#hero');
  await expect(page.locator('[data-mistake][tabindex]').first()).toBeAttached();
  const before = await page.evaluate(() => (window as unknown as { h1: string }).h1);
  expect(before).toBe('Stop colecting screenshots.');
  expect(await page.locator('h1').innerText()).toBe(before);
});

test('fixes all three mistakes with the keyboard alone', async ({ page }) => {
  await page.goto('./#hero');
  for (const [i, [key, text]] of FIXES.entries()) {
    const mistake = page.locator(`[data-mistake="${key}"]`);
    await expect(mistake).toHaveAttribute('role', 'button');
    await mistake.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog', { name: 'Edit text' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mistake).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    if (i < FIXES.length - 1) await expect(mistake).toBeFocused();
  }
  await expect(page.getByRole('heading', { name: "That's LiveLocale. Install it." })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Try the full Studio' })).toHaveAttribute(
    'href',
    '/livelocale/demo/livelocale/index.html'
  );
});

test('shows the real link on Send and sends nothing', async ({ page }) => {
  const outgoing: string[] = [];
  await page.goto('./#hero');
  await page.waitForLoadState('networkidle');
  page.on('request', (r) => outgoing.push(`${r.method()} ${r.url()}`));
  await page.locator('[data-mistake="hero.title"]').click({ modifiers: ['Alt'] });
  await page.getByRole('dialog', { name: 'Edit text' }).getByRole('textbox').fill(FIXES[0][1]);
  await page.keyboard.press('Enter');
  await page.getByTestId('pr-card').getByRole('button', { name: 'Send' }).click();
  const dialog = page.getByRole('dialog', { name: 'This is what your developer would receive' });
  await expect(dialog.getByTestId('change-link')).toHaveValue(
    /^http:\/\/localhost:4173\/livelocale\/demo\/livelocale\/index\.html#lc1\./
  );
  await expect(dialog).toContainText('Nothing was sent from this page.');
  expect(outgoing.filter((r) => !r.startsWith('GET http://localhost:4173/livelocale/'))).toEqual(
    []
  );
});

test('counts a near-miss as an edit but not as a fix', async ({ page }) => {
  await page.goto('./#hero');
  await page.locator('[data-mistake="hero.lede"]').click({ modifiers: ['Alt'] });
  await page
    .getByRole('dialog', { name: 'Edit text' })
    .getByRole('textbox')
    .fill('Anyone on your team fixes text write on the site.');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pr-card')).toContainText('0 of 3 fixed');
  await expect(page.getByText('Try "right"')).toBeVisible();
});

test.describe('reduced motion', () => {
  // Playwright has no top-level reducedMotion option; it is a context option.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('sticks the patch on without motion', async ({ page }) => {
    await page.goto('./#hero');
    await page.locator('[data-mistake="hero.lede"]').click({ modifiers: ['Alt'] });
    await page.getByRole('dialog', { name: 'Edit text' }).getByRole('textbox').fill(FIXES[1][1]);
    await page.keyboard.press('Enter');
    const patch = page.locator('[data-mistake="hero.lede"] .patch');
    expect(
      await patch.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.transform, s.transitionDuration, s.animationName];
      })
    ).toEqual(['none', '0s', 'none']);
  });
});

const PATCH = 'rgb(255, 178, 36)';

async function altFix(page: import('@playwright/test').Page, key: string, text: string) {
  await page.locator(`[data-mistake="${key}"]`).click({ modifiers: ['Alt'] });
  await page.getByRole('dialog', { name: 'Edit text' }).getByRole('textbox').fill(text);
  await page.keyboard.press('Enter');
}

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

test('outlines the untranslated word until it is fixed', async ({ page }) => {
  await page.goto('./#hero');
  const word = page.locator('[data-mistake="hero.ci"] .m-untranslated');
  await expect(word).toHaveText('traducido');
  const s = await word.evaluate((el) => {
    const c = getComputedStyle(el);
    return [c.outlineStyle, c.outlineColor, c.backgroundColor];
  });
  expect(s).toEqual(['dashed', 'rgb(255, 84, 104)', 'rgba(0, 0, 0, 0)']);
  expect(await declaredOutline(page, '.m-untranslated')).toMatch(/^1\.5px dashed /);
  await altFix(page, FIXES[2][0], FIXES[2][1]);
  await expect(page.locator('[data-mistake="hero.ci"] .patch')).toBeVisible();
  await expect(word).toHaveCount(0);
});

test('keeps one tilted patch after every fix', async ({ page }) => {
  await page.goto('./#hero');
  for (const [key, text] of FIXES) await altFix(page, key, text);
  await expect
    .poll(() =>
      page
        .locator('#hero .hero-copy *')
        .evaluateAll(
          (els, patch) =>
            els
              .filter((el) => getComputedStyle(el).backgroundColor === patch)
              .map((el) => el.textContent),
          PATCH
        )
    )
    .toEqual(['Stop', 'collecting', 'right', 'translated']);
  await expect
    .poll(() =>
      page.locator('#hero *').evaluateAll(
        (els, patch) =>
          els
            .filter((el) => {
              const s = getComputedStyle(el);
              return s.backgroundColor === patch && s.transform !== 'none';
            })
            .map((el) => el.textContent),
        PATCH
      )
    )
    .toEqual(['Stop']);
  const done = page.locator('#hero .bar-done');
  await expect(done).toHaveText('All fixed');
  await expect(done).toHaveCSS('color', 'rgb(111, 214, 154)');
});

test('warns on a near-miss with an amber glyph', async ({ page }) => {
  await page.goto('./#hero');
  await altFix(page, 'hero.lede', 'Anyone on your team fixes text write on the site.');
  const [glyph, glyphColor] = await page.locator('.m-try').evaluate((el) => {
    const s = getComputedStyle(el, '::before');
    return [s.content, s.color];
  });
  expect(glyph).toContain('!');
  expect(glyphColor).toBe(PATCH);
  const edited = page.locator('.m-edited');
  await expect(edited).toHaveCSS('background-color', 'rgb(46, 36, 18)');
  await expect(edited).toHaveCSS('text-decoration-line', 'none');
  await expect(page.getByText('Try "right"')).toBeVisible();
});
