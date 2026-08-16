/**
 * Zero-Width Watermarking Encoder/Decoder
 *
 * Maps translation keys into invisible Unicode zero-width characters and
 * prepends them as a binary watermark onto the translation string.
 *
 * Delimiters:
 *   \u200D – Zero-Width Joiner (ZWJ)  → boundary start/end marker
 *   \u200B – Zero-Width Space (ZWS)   → binary bit 0
 *   \u200C – Zero-Width Non-Joiner (ZWNJ) → binary bit 1
 *
 * The watermark is strictly prepended so it survives downstream truncation
 * (e.g., text.substring()) that removes only from the right.
 */

const DELIM = '\u200D'; // ZWJ – boundary delimiter
const BIT_0 = '\u200B'; // ZWS – represents bit 0
const BIT_1 = '\u200C'; // ZWNJ – represents bit 1

const ZW_RE = /[\u200B\u200C\u200D]/g;

/** Encodes a translation key as an invisible watermark prefix on `text`. */
export function encodeKey(text: string, key: string): string {
  const bytes = new TextEncoder().encode(key);
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let watermark = DELIM;
  for (const bit of bits) {
    watermark += bit === '0' ? BIT_0 : BIT_1;
  }
  watermark += DELIM;

  return watermark + text;
}

/**
 * Decodes a watermark prefix from `text`.
 *
 * Returns `{ key, cleanText }` where `cleanText` is the original visible
 * text with the watermark stripped.  If no valid watermark is found,
 * returns `null`.
 */
export function decodeKey(text: string): { key: string; cleanText: string } | null {
  if (!text.startsWith(DELIM)) return null;

  const end = text.indexOf(DELIM, 1);
  if (end === -1) return null;

  const bitsStr = text.slice(1, end);
  // Validate: every char must be a known ZW bit
  for (const ch of bitsStr) {
    if (ch !== BIT_0 && ch !== BIT_1) return null;
  }

  if (bitsStr.length !== 0 && bitsStr.length % 8 !== 0) return null;

  const bytes: number[] = [];
  for (let i = 0; i < bitsStr.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bitsStr[i + j] === BIT_1 ? 1 : 0);
    }
    bytes.push(byte);
  }

  try {
    const key = new TextDecoder().decode(new Uint8Array(bytes));
    const cleanText = text.slice(end + 1);
    return { key, cleanText };
  } catch {
    return null;
  }
}

/**
 * Strips a valid watermark *prefix* from `text`, leaving any legitimate
 * zero-width characters inside the visible text untouched.
 *
 * ZWNJ (\u200C) and ZWSP (\u200B) are valid orthography in Persian, Urdu,
 * Thai, and other scripts — a blanket removal would silently corrupt real
 * translations. Only the decoded watermark prefix is removed.
 */
export function stripWatermark(text: string): string {
  const decoded = decodeKey(text);
  if (decoded) return decoded.cleanText;
  return text;
}

/**
 * Aggressively removes every zero-width character from `text`.
 *
 * Use only for clipboard/form sanitization where no visible text should ever
 * contain ZW characters. Do NOT use on translation content destined for
 * locale files — prefer `stripWatermark`.
 */
export function sanitizeZeroWidth(text: string): string {
  return text.replace(ZW_RE, '');
}

/**
 * Returns true if `text` begins with a valid watermark prefix.
 */
export function hasWatermark(text: string): boolean {
  return text.startsWith(DELIM);
}
