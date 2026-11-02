// The `livelocale` wordmark as outlines, so the logo never depends on an installed font (and works
// under GitHub's CSP, which blocks fonts embedded in README SVGs).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
// WOFF, not WOFF2: opentype.js parses WOFF.
export const WORDMARK_FONT = '@fontsource/martian-mono/files/martian-mono-latin-500-normal.woff';
export const LETTER_SPACING_EM = -0.02;
/** The wordmark's bounding-box height in logo units (y 16–48, inside the mark's bars at 11–53). */
export const WORDMARK_HEIGHT = 32;
const TEXT = 'livelocale';
const CENTRE_Y = 32;

// Glyphs are laid out by hand (advance, kerning, letter-spacing, as opentype.js's own
// forEachGlyph does): opentype.js 2.0's shaping step throws on some fonts' ccmp lookups, and a
// plain Latin word needs no shaping.
function layout(font, fontSize, x, y) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = [...TEXT].map((char) => font.charToGlyph(char));
  const kerning = font.position.getKerningTables(font.position.getDefaultScriptName());
  const path = new opentype.Path();
  glyphs.forEach((glyph, i) => {
    path.extend(glyph.getPath(x, y, fontSize));
    x += glyph.advanceWidth * scale;
    const next = glyphs[i + 1];
    if (next) {
      const kern = kerning
        ? font.position.getKerningValue(kerning, glyph.index, next.index)
        : font.getKerningValue(glyph, next);
      x += kern * scale;
    }
    x += LETTER_SPACING_EM * fontSize;
  });
  return path;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The wordmark path, starting at x 0 and vertically centred on y 32, rounded to 2 decimals. The
 * font size is derived so the word's bounding box is WORDMARK_HEIGHT units tall.
 */
export async function wordmarkPath() {
  const buffer = await readFile(require.resolve(WORDMARK_FONT));
  const font = opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );
  // Every coordinate scales with the font size, so one em-sized layout gives the size directly.
  const em = layout(font, font.unitsPerEm, 0, 0).getBoundingBox();
  const fontSize = (WORDMARK_HEIGHT / (em.y2 - em.y1)) * font.unitsPerEm;
  const box = layout(font, fontSize, 0, 0).getBoundingBox();
  const path = layout(font, fontSize, -box.x1, CENTRE_Y - (box.y1 + box.y2) / 2);
  return { d: path.toPathData(2), width: round2(box.x2 - box.x1), height: round2(box.y2 - box.y1) };
}
