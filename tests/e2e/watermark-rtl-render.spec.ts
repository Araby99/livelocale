import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { encodeKey } from '../../src/client/watermark';

/**
 * The watermark is invisible on paper; this proves it on screen. Each case
 * renders the plain text and the watermarked text in the same font, on the
 * same page, in the same run, and compares their size and pixels. Nothing is
 * compared against a committed image, so the test holds on any OS.
 */

const FONT_DIR = join(process.cwd(), 'node_modules/@fontsource/ibm-plex-sans-arabic/files');
const FAMILY = 'Watermark Test Sans';

function fontFace(file: string, unicodeRange: string): string {
  const data = readFileSync(join(FONT_DIR, file)).toString('base64');
  return `@font-face {
    font-family: '${FAMILY}';
    font-style: normal;
    font-weight: 400;
    src: url(data:font/woff2;base64,${data}) format('woff2');
    unicode-range: ${unicodeRange};
  }`;
}

// The Studio's bundled Arabic font, Arabic and Latin subsets, inlined so the
// test needs no server. Hebrew is not in it and falls back to a system font,
// the same one on both sides of each comparison.
const FONT_CSS = [
  fontFace(
    'ibm-plex-sans-arabic-arabic-400-normal.woff2',
    'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC'
  ),
  fontFace(
    'ibm-plex-sans-arabic-latin-400-normal.woff2',
    'U+0000-00FF, U+2000-206F, U+FEFF, U+FFFD'
  ),
].join('\n');

const CASES: { name: string; text: string }[] = [
  // First and last letters with distinct joined forms.
  { name: 'Arabic word, three letters', text: 'بيت' },
  { name: 'Arabic name', text: 'محمد' },
  { name: 'Arabic phrase', text: 'ابدأ تجربتك المجانية' },
  { name: 'Arabic with Latin and digits', text: 'خطة Pro بـ 29 دولار' },
  // A real zero-width non-joiner inside the word, as Persian spells it.
  { name: 'Persian with a zero-width non-joiner', text: 'می\u200Cخواهم' },
  { name: 'Hebrew', text: 'שלום עולם' },
];

async function renderPairs(page: Page, rows: { plain: string; other: string }[]) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${FONT_CSS}
body { margin: 0; padding: 16px; background: #fff; color: #000; }
.row { height: 64px; }
.row span {
  display: inline-block;
  font: 28px/40px '${FAMILY}', sans-serif;
  padding: 4px;
  -webkit-font-smoothing: antialiased;
}
</style></head><body></body></html>`;
  await page.setContent(html);
  // Set the text through the DOM so no character is lost or normalized in HTML.
  await page.evaluate((pairs) => {
    pairs.forEach((pair, i) => {
      for (const [side, text] of [
        ['plain', pair.plain],
        ['other', pair.other],
      ] as const) {
        const row = document.createElement('div');
        row.className = 'row';
        const span = document.createElement('span');
        span.dir = 'rtl';
        span.id = `${side}-${i}`;
        span.textContent = text;
        row.appendChild(span);
        document.body.appendChild(row);
      }
    });
  }, rows);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  expect(
    await page.evaluate((family) => document.fonts.check(`28px '${family}'`, 'بيت'), FAMILY)
  ).toBe(true);
}

async function measure(page: Page, id: string) {
  const locator = page.locator(`#${id}`);
  const box = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  const shot = await locator.screenshot({ animations: 'disabled', caret: 'hide' });
  return { box, shot };
}

test.describe('watermark on right-to-left scripts', () => {
  test('renders exactly like the plain text', async ({ page }) => {
    const rows = CASES.map((c, i) => ({ plain: c.text, other: encodeKey(c.text, `k.${i}`) }));
    await renderPairs(page, rows);

    for (const [i, c] of CASES.entries()) {
      // The watermark is really there in the DOM, not stripped on the way in.
      const domText = await page.locator(`#other-${i}`).evaluate((el) => el.textContent);
      expect(domText, c.name).toBe(rows[i].other);
      expect(domText!.length, c.name).toBeGreaterThan(c.text.length);

      const plain = await measure(page, `plain-${i}`);
      const marked = await measure(page, `other-${i}`);
      expect(marked.box, `${c.name}: size`).toEqual(plain.box);
      expect(Buffer.compare(marked.shot, plain.shot), `${c.name}: pixels`).toBe(0);
    }
  });

  test('a joining character beside a letter does change the rendering', async ({ page }) => {
    // Control: U+200D right before the first Arabic letter makes it take its
    // connected form. If this comparison found no difference, the one above
    // would prove nothing.
    const text = 'بيت';
    await renderPairs(page, [{ plain: text, other: '\u200D' + text }]);

    const plain = await measure(page, 'plain-0');
    const joined = await measure(page, 'other-0');
    expect(Buffer.compare(joined.shot, plain.shot)).not.toBe(0);
  });
});
