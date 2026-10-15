// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  encodeKey,
  decodeKey,
  stripWatermark,
  sanitizeZeroWidth,
  hasWatermark,
  unwrap,
} from '../../src/client/watermark.js';

// ─── Constants (mirrors watermark.ts internals) ───────────────────────────
const DELIM = '\u200D';
const BIT_0 = '\u200B';
const BIT_1 = '\u200C';

// ─── Helpers ─────────────────────────────────────────────────────────────
function isZeroWidthOnly(str: string): boolean {
  return /^[\u200B\u200C\u200D]+$/.test(str);
}

// ─── encodeKey ────────────────────────────────────────────────────────────
describe('encodeKey', () => {
  it('should always encode (the production guard lives in wrapTranslationEngine, not encodeKey)', () => {
    // encodeKey is a pure encoding function — it always runs.
    // The production bypass is applied upstream by wrapTranslationEngine.
    const result = encodeKey('Hello', 'home.title');
    expect(result).not.toBe('Hello'); // encoding always fires
    expect(result.startsWith('\u200D')).toBe(true);
  });

  it('should prepend a watermark delimited by DELIM in development', () => {
    const result = encodeKey('Hello', 'home.title');
    expect(result.startsWith(DELIM)).toBe(true);
    // Second delimiter marks end of watermark
    const secondDelim = result.indexOf(DELIM, 1);
    expect(secondDelim).toBeGreaterThan(1);
    // Visible text follows immediately after second delimiter
    expect(result.slice(secondDelim + 1)).toBe('Hello');
  });

  it('should produce only ZW bit chars between the two delimiters', () => {
    const result = encodeKey('World', 'nav.home');
    const firstDelim = result.indexOf(DELIM);
    const secondDelim = result.indexOf(DELIM, firstDelim + 1);
    const bitSection = result.slice(firstDelim + 1, secondDelim);
    expect(isZeroWidthOnly(bitSection)).toBe(true);
  });

  it('should encode empty string key gracefully and remain reversible', () => {
    const result = encodeKey('text', '');
    const decoded = decodeKey(result);
    // empty key → 0 bytes → 0 bits → no bits between delimiters
    expect(decoded?.key).toBe('');
    expect(decoded?.cleanText).toBe('text');
  });

  it('should encode a deeply nested key correctly', () => {
    const key = 'dashboard.admin.settings.tables.users.action.title';
    const result = encodeKey('Click me', key);
    const decoded = decodeKey(result);
    expect(decoded?.key).toBe(key);
    expect(decoded?.cleanText).toBe('Click me');
  });

  it('should handle keys with special characters (dots, dashes, underscores)', () => {
    const key = 'nav.sign-in_btn.label';
    const result = encodeKey('Sign In', key);
    const decoded = decodeKey(result);
    expect(decoded?.key).toBe(key);
  });

  it('should handle translation text containing RTL glyphs without corruption', () => {
    const arabicText = 'مرحباً بالعالم';
    const result = encodeKey(arabicText, 'home.welcome');
    const decoded = decodeKey(result);
    expect(decoded?.cleanText).toBe(arabicText);
    expect(decoded?.key).toBe('home.welcome');
  });

  it('should handle translation text containing emoji', () => {
    const emojiText = 'Hello 🌍🚀';
    const result = encodeKey(emojiText, 'home.emoji');
    const decoded = decodeKey(result);
    expect(decoded?.cleanText).toBe(emojiText);
  });

  it('should survive downstream substring from the right side', () => {
    // Simulates a truncation of the visible portion — the watermark stays intact
    const result = encodeKey('Welcome Back to Production', 'home.welcome_msg');
    const sliced = result.substring(0, result.indexOf('\u200D', 1) + 1 + 7); // keep watermark + 7 visible chars
    // Watermark prefix should still decode correctly
    const decoded = decodeKey(sliced);
    expect(decoded?.key).toBe('home.welcome_msg');
  });
});

// ─── decodeKey ────────────────────────────────────────────────────────────
describe('decodeKey', () => {
  it('should return null for plain text without watermark', () => {
    expect(decodeKey('Hello World')).toBeNull();
  });

  it('should return null for text starting with DELIM but missing end delimiter', () => {
    expect(decodeKey(DELIM + BIT_0 + BIT_1)).toBeNull();
  });

  it('should return null for a watermark section with partial byte (bits not multiple of 8)', () => {
    // 7 bits is not a full byte
    const invalid = DELIM + BIT_0.repeat(7) + DELIM + 'text';
    expect(decodeKey(invalid)).toBeNull();
  });

  it('should return null for a string that is just two adjacent delimiters with a rogue char', () => {
    // Inject a non-ZW char inside the delimiters
    expect(decodeKey(DELIM + 'A' + DELIM + 'text')).toBeNull();
  });

  it('should roundtrip every printable ASCII key', () => {
    for (let cp = 33; cp < 127; cp++) {
      const key = String.fromCharCode(cp);
      const encoded = encodeKey('t', key);
      const decoded = decodeKey(encoded);
      expect(decoded?.key).toBe(key);
    }
  });

  it('should roundtrip a multi-segment key of maximum expected depth (10 levels)', () => {
    const key = 'a.b.c.d.e.f.g.h.i.j';
    const encoded = encodeKey('deep value', key);
    const decoded = decodeKey(encoded);
    expect(decoded?.key).toBe(key);
    expect(decoded?.cleanText).toBe('deep value');
  });
});

// ─── stripWatermark ───────────────────────────────────────────────────────
describe('stripWatermark', () => {
  it('should remove all ZW characters from a watermarked string', () => {
    const watermarked = encodeKey('Hello World', 'some.key');
    const stripped = stripWatermark(watermarked);
    expect(stripped).toBe('Hello World');
    expect(stripped).not.toContain(DELIM);
    expect(stripped).not.toContain(BIT_0);
    expect(stripped).not.toContain(BIT_1);
  });

  it('should return the same string when no ZW chars are present', () => {
    expect(stripWatermark('plain text')).toBe('plain text');
  });

  it('should return an empty string for a pure watermark with no visible text', () => {
    const watermarked = encodeKey('', 'k');
    const stripped = stripWatermark(watermarked);
    expect(stripped).toBe('');
  });

  it('should preserve legitimate zero-width characters inside visible text (RTL safety)', () => {
    // ZWNJ (U+200C) is valid Persian/Urdu orthography; ZWSP (U+200B) appears in Thai.
    const persianWithZWNJ = '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645'; // "میخواهم"
    const thaiWithZWSP = '\u0e01\u0e32\u200b\u0e23\u0e40\u0e02\u0e35\u0e22\u0e19';

    const strippedPersian = stripWatermark(persianWithZWNJ);
    expect(strippedPersian).toBe(persianWithZWNJ);

    const watermarked = encodeKey(thaiWithZWSP, 'thai.key');
    const strippedThai = stripWatermark(watermarked);
    expect(strippedThai).toBe(thaiWithZWSP);
    expect(strippedThai).toContain('\u200b');
  });

  it('should only strip a valid watermark prefix, not mid-text zero-width characters', () => {
    const watermarked = encodeKey('Hello \u200bWorld', 'some.key');
    const stripped = stripWatermark(watermarked);
    expect(stripped).toBe('Hello \u200bWorld');
  });
});

// ─── sanitizeZeroWidth ─────────────────────────────────────────────────────
describe('sanitizeZeroWidth', () => {
  it('should remove every zero-width character (aggressive clipboard/forms path)', () => {
    const text = '\u200d\u200b\u200cHello\u200b World\u200d';
    expect(sanitizeZeroWidth(text)).toBe('Hello World');
  });

  it('should return the same string when no zero-width characters are present', () => {
    expect(sanitizeZeroWidth('plain text')).toBe('plain text');
  });
});

// ─── hasWatermark ─────────────────────────────────────────────────────────
describe('hasWatermark', () => {
  it('should return true for an encoded string', () => {
    expect(hasWatermark(encodeKey('text', 'key'))).toBe(true);
  });

  it('should return false for a plain string', () => {
    expect(hasWatermark('plain text')).toBe(false);
  });

  it('should return false for an empty string', () => {
    expect(hasWatermark('')).toBe(false);
  });
});

// ─── unwrap ──────────────────────────────────────────────────────────────
describe('unwrap', () => {
  it('should strip the watermark from a plain string', () => {
    expect(unwrap(encodeKey('Hello', 'home.title'))).toBe('Hello');
  });

  it('should return non-watermarked values untouched', () => {
    expect(unwrap('Hello')).toBe('Hello');
    expect(unwrap(42)).toBe(42);
    expect(unwrap(null)).toBe(null);
    expect(unwrap(undefined)).toBe(undefined);
  });

  it('should strip watermarks deeply inside objects and arrays', () => {
    const input = {
      a: encodeKey('A', 'k.a'),
      list: [encodeKey('B', 'k.b'), 3, { c: encodeKey('C', 'k.c') }],
      n: null,
    };
    expect(unwrap(input)).toEqual({ a: 'A', list: ['B', 3, { c: 'C' }], n: null });
  });

  it('should not mutate the input object', () => {
    const input = { a: encodeKey('A', 'k.a') };
    const copy = { ...input };
    unwrap(input);
    expect(input).toEqual(copy);
  });

  it('should leave legitimate zero-width characters inside the visible text alone', () => {
    const persian = 'می‌خواهم'; // contains ZWNJ
    expect(unwrap(encodeKey(persian, 'fa.key'))).toBe(persian);
  });
});
