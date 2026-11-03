import * as fs from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { scrollThrough } from './fixtures/scroll';

const BASE = 'http://localhost:4173/livelocale/';
const DIST = 'site/dist/docs';

// DESIGN.md's palette, as the browser computes it (RGB channels only).
const PALETTE: Record<string, string> = {
  Night: '12, 13, 15',
  Surface: '22, 24, 29',
  Rule: '42, 45, 51',
  Edge: '107, 111, 122',
  Paper: '232, 228, 217',
  Comment: '140, 136, 125',
  Ghost: '110, 107, 100',
  Patch: '255, 178, 36',
  'Patch Lit': '255, 193, 80',
  'Patch Underside': '138, 86, 0',
  Wash: '46, 36, 18',
  Hunk: '79, 195, 220',
  'Exit 1': '255, 84, 104',
  'Exit 0': '111, 214, 154',
};
// The one-job colours a code token may take (spec §3.1).
const CODE_COLOURS = ['#E8E4D9', '#8C887D', '#4FC3DC', '#6FD69A', '#FF5468'];

/** Opens the local search box and types a query. */
async function search(page: Page, query: string): Promise<void> {
  await page.locator('.VPNavBarSearch button').click();
  const input = page.locator('.VPLocalSearchBox input');
  await expect(input).toBeVisible();
  await input.fill(query);
  await expect(page.locator('.VPLocalSearchBox a.result').first()).toBeVisible();
}

function htmlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.html'));
}

test('serves every docs request under the /livelocale/ base', async ({ page }) => {
  const urls: string[] = [];
  const failed: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('docs/');
  await scrollThrough(page);
  await page.evaluate(() => scrollTo(0, 0));
  await search(page, 'livelocale');
  await page.waitForLoadState('networkidle');
  expect(failed).toEqual([]);
  expect(urls.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:'))).toEqual([]);
});

test('wears the landing page: Night, Paper, the same brand and nav', async ({ page }) => {
  await page.goto('./');
  const landingMark = await page.locator('.site-header .brand svg').evaluate((el) => el.outerHTML);
  // A stack page: the front door holds no inline code and no link inside a paragraph.
  await page.goto('docs/start/nextjs.html');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(12, 13, 15)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(232, 228, 217)');
  const font = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await font('.vp-doc h1')).toMatch(/^"Martian Mono"/);
  expect(await font('.vp-doc :not(pre) > code')).toMatch(/^"IBM Plex Mono"/);
  await expect(page.locator('.vp-doc p a').first()).toHaveCSS('color', 'rgb(79, 195, 220)');
  expect(await page.locator('.VPNav .brand svg').evaluate((el) => el.outerHTML)).toBe(landingMark);
  await expect(page.locator('.VPNavBarMenu a')).toHaveText(['GitHub', 'Docs']);
  expect(await page.locator('.VPNav a.brand').evaluate((a) => (a as HTMLAnchorElement).href)).toBe(
    BASE
  );
});

test('colours code only from the palette', () => {
  const files = htmlFiles(DIST);
  expect(files.length).toBeGreaterThan(0);
  const strays: string[] = [];
  let blocks = 0;
  for (const file of files) {
    const html = fs.readFileSync(join(DIST, file), 'utf8');
    for (const [, inner] of html.matchAll(/<pre class="shiki[^"]*"[^>]*>([\s\S]*?)<\/pre>/g)) {
      blocks++;
      // Inline `color:` and `--shiki-*:` values alike.
      for (const [hex] of inner!.matchAll(/#[0-9a-f]{6}\b/gi))
        if (!CODE_COLOURS.includes(hex.toUpperCase())) strays.push(`${file} ${hex}`);
    }
  }
  expect(blocks).toBeGreaterThan(0);
  expect(strays).toEqual([]);
});

test('paints the docs only in the palette, search open', async ({ page }) => {
  await page.goto('docs/');
  await search(page, 'livelocale');
  const failures = await page.evaluate((allowed) => {
    const props = [
      'color',
      'background-color',
      'border-top-color',
      'border-right-color',
      'border-bottom-color',
      'border-left-color',
    ];
    const selector = (el: Element) =>
      el.tagName.toLowerCase() +
      (el.id ? `#${el.id}` : '') +
      [...el.classList].map((c) => `.${c}`).join('');
    const out: string[] = [];
    for (const el of document.querySelectorAll('body, body *')) {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!box.width || !box.height || style.visibility !== 'visible') continue;
      for (const prop of props) {
        const value = style.getPropertyValue(prop);
        const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value);
        if (m && m[4] !== undefined && Number(m[4]) === 0) continue;
        // Alpha mixes (the 45% link underline) are allowed: compare the RGB channels only.
        if (!m || !allowed.includes(`${m[1]}, ${m[2]}, ${m[3]}`))
          out.push(`${selector(el)} ${prop} ${value}`);
      }
    }
    return [...new Set(out)];
  }, Object.values(PALETTE));
  expect(failures).toEqual([]);
});

test('keeps the docs header in reach, on Night, without blur', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('docs/');
  const nav = page.locator('.VPNav');
  await expect(nav).toHaveCSS('background-color', 'rgb(12, 13, 15)');
  await expect(nav).toHaveCSS('border-bottom-width', '1px');
  await expect(nav).toHaveCSS('border-bottom-style', 'solid');
  await expect(nav).toHaveCSS('border-bottom-color', 'rgb(42, 45, 51)');
  await expect(nav).toHaveCSS('backdrop-filter', 'none');
  // The stub front door is shorter than the viewport: pad it so the page really scrolls.
  await page.evaluate(() => {
    const pad = document.createElement('div');
    pad.style.height = '3000px';
    document.querySelector('.vp-doc')!.append(pad);
  });
  await page.evaluate(() => scrollTo(0, 600));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await page.evaluate(() => scrollY)).toBe(600);
  const box = await page.locator('.VPNav a.brand').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
});

test('keeps the docs header and the local nav in reach on a phone', async ({ page }) => {
  // Below 960px VitePress lets the nav scroll away; docs.css makes it sticky and moves the
  // local nav (the menu and "On this page" bar) down by the nav's height plus its 1px border.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('docs/');
  // The stub front door is shorter than the viewport: pad it so the page really scrolls.
  await page.evaluate(() => {
    const pad = document.createElement('div');
    pad.style.height = '3000px';
    document.querySelector('.vp-doc')!.append(pad);
  });
  await page.evaluate(() => scrollTo(0, 600));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await page.evaluate(() => scrollY)).toBe(600);
  const { navTop, navBottom, localTop, expected } = await page.evaluate(() => {
    const nav = document.querySelector('.Layout > .VPNav')!.getBoundingClientRect();
    const local = document.querySelector('.Layout > .VPLocalNav')!.getBoundingClientRect();
    const navHeight = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--vp-nav-height')
    );
    return { navTop: nav.top, navBottom: nav.bottom, localTop: local.top, expected: navHeight + 1 };
  });
  expect(navTop).toBe(0);
  expect(localTop).toBe(expected);
  expect(localTop).toBeGreaterThanOrEqual(navBottom);
  await expect(page.locator('.VPNav a.brand')).toBeInViewport();
});

test('finds the check reference with the offline search', async ({ page }) => {
  await page.goto('docs/');
  await search(page, 'hardcoded');
  const hrefs = await page
    .locator('.VPLocalSearchBox a.result')
    .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  expect(
    hrefs.some((href) => /\/livelocale\/docs\/reference\/cli\/check\.html(#|$)/.test(href))
  ).toBe(true);
});

test('picks a stack from the front door', async ({ page }) => {
  await page.goto('docs/');
  await page
    .locator('.vp-doc')
    .getByRole('link', { name: /Next\.js \(App Router\)/ })
    .click();
  await expect(page).toHaveURL(/\/livelocale\/docs\/start\/nextjs\.html$/);
  await expect(page.locator('.vp-doc h1')).toBeVisible();
});

test('has no horizontal scroll at 360 px on the docs front door', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('docs/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('renders the docs front door without JavaScript', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('docs/');
    await expect(page.locator('.vp-doc h1')).toBeVisible();
    for (const group of ['Get started', 'Guides', 'How it works', 'Reference'])
      await expect(page.locator('.VPSidebar').getByText(group, { exact: true })).toBeVisible();
    await expect(page.locator('.vp-doc p').first()).toContainText('livelocale');
  });
});

test('reaches the docs controls by keyboard with a visible patch ring', async ({ page }) => {
  await page.goto('docs/');
  const rings: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    rings.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'body';
        const s = getComputedStyle(el);
        return `${el.tagName.toLowerCase()} ${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
      })
    );
  }
  expect(rings.filter((ring) => !ring.endsWith(' solid 2px rgb(255, 178, 36)'))).toEqual([]);
});
