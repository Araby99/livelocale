// Reads a WebP file's pixel size from its header (VP8, VP8L or VP8X), so tests can check that a
// shipped image is the size the docs manifest says without decoding it.

const ascii = (buf, at, length) => String.fromCharCode(...buf.subarray(at, at + length));

/**
 * The width and height of a WebP image.
 * @param {Uint8Array} buf the whole file, or at least its first 30 bytes
 * @returns {{ width: number; height: number }}
 */
export function webpSize(buf) {
  if (buf.length < 30 || ascii(buf, 0, 4) !== 'RIFF' || ascii(buf, 8, 4) !== 'WEBP') {
    throw new Error('Not a WebP');
  }
  const chunk = ascii(buf, 12, 4);
  if (chunk === 'VP8X') {
    // 24-bit little-endian canvas width and height, each stored minus one
    const u24 = (at) => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);
    return { width: u24(24) + 1, height: u24(27) + 1 };
  }
  if (chunk === 'VP8 ') {
    // a key frame: the start code 9d 01 2a, then 14-bit width and height (2 scale bits above)
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) throw new Error('Not a WebP');
    const u16 = (at) => buf[at] | (buf[at + 1] << 8);
    return { width: u16(26) & 0x3fff, height: u16(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // the signature 0x2f, then 14 bits of width minus one and 14 bits of height minus one
    if (buf[20] !== 0x2f) throw new Error('Not a WebP');
    const bits = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  throw new Error('Not a WebP');
}
