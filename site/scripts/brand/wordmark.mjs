// The `livelocale` wordmark as outlines, so the logo never depends on an installed font (and works
// under GitHub's CSP, which blocks fonts embedded in README SVGs).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
const FONT = '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff';
const TEXT = 'livelocale';
const FONT_SIZE = 44;
const LETTER_SPACING_EM = -0.035;
const CENTRE_Y = 32;

// Glyphs are laid out by hand (advance, kerning, letter-spacing, as opentype.js's own
// forEachGlyph does): opentype.js 2.0's shaping step throws on this font's ccmp lookups, and a
// plain Latin word needs no shaping.
function layout(font, x, y) {
  const scale = FONT_SIZE / font.unitsPerEm;
  const glyphs = [...TEXT].map((char) => font.charToGlyph(char));
  const kerning = font.position.getKerningTables(font.position.getDefaultScriptName());
  const path = new opentype.Path();
  glyphs.forEach((glyph, i) => {
    path.extend(glyph.getPath(x, y, FONT_SIZE));
    x += glyph.advanceWidth * scale;
    const next = glyphs[i + 1];
    if (next) {
      const kern = kerning
        ? font.position.getKerningValue(kerning, glyph.index, next.index)
        : font.getKerningValue(glyph, next);
      x += kern * scale;
    }
    x += LETTER_SPACING_EM * FONT_SIZE;
  });
  return path;
}

/** The wordmark path, starting at x 0 and vertically centred on y 32, rounded to 2 decimals. */
export async function wordmarkPath() {
  const buffer = await readFile(require.resolve(FONT));
  const font = opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );
  const box = layout(font, 0, 0).getBoundingBox();
  const path = layout(font, -box.x1, CENTRE_Y - (box.y1 + box.y2) / 2);
  return { d: path.toPathData(2), width: Math.round((box.x2 - box.x1) * 100) / 100 };
}
