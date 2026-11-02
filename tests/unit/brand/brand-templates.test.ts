// @vitest-environment node
import * as fs from 'node:fs';

const WITHDRAWN_COLOURS =
  /#1D1712|#FF6B4A|#C2472C|#F6EEE6|#FF7A5C|#9E3A24|#FFF8F0|#6B5B4D|#E9DCCD|#F3E6D8/i;
const WITHDRAWN_FONTS = /Bricolage|\bInter\b|JetBrains|Readex/;

it('writes the og-image as the diff pair on Night', () => {
  const og = fs.readFileSync('brand/src/og.html', 'utf8');
  for (const text of [
    'final_FINAL_v3.png',
    'Stop collecting screenshots.',
    '−',
    'line-through',
    'martian-mono-latin-700-normal.woff2',
    'ibm-plex-sans-latin-500-normal.woff2',
    'ibm-plex-mono-latin-500-normal.woff2',
  ]) {
    expect(og, text).toContain(text);
  }
  for (const colour of ['#0c0d0f', '#6e6b64', '#ffb224', '#8a5600']) {
    expect(og.toLowerCase(), colour).toContain(colour);
  }
  expect(og.match(/rotate\(/g)).toHaveLength(1); // the one tilted patch, on "Stop"
});

it('centres the dark mark on Night in the avatar', () => {
  const avatar = fs.readFileSync('brand/src/avatar.html', 'utf8');
  expect(avatar.toLowerCase()).toContain('#0c0d0f');
  expect(avatar).toContain('../mark-dark.svg');
});

it('keeps the withdrawn brand out of brand/', () => {
  const files = [
    ...fs
      .readdirSync('brand')
      .filter((f) => f.endsWith('.svg'))
      .map((f) => `brand/${f}`),
    ...fs
      .readdirSync('brand/src')
      .filter((f) => f.endsWith('.html'))
      .map((f) => `brand/src/${f}`),
    'brand/README.md',
  ];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    expect(content, file).not.toMatch(WITHDRAWN_COLOURS);
    expect(content, file).not.toMatch(WITHDRAWN_FONTS);
  }
});
