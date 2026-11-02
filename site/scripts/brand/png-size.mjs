// Reads a PNG's pixel size and its top-left colour, so tests can check the renders without a
// decoder.
import { inflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from the PNG header (big-endian at bytes 16 and 20). */
export function pngSize(bytes) {
  if (bytes.length < 24 || SIGNATURE.some((byte, i) => bytes[i] !== byte)) {
    throw new Error('Not a PNG');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The RGB of the top-left pixel, from the inflated IDAT data. The first pixel of the first
 * scanline is unaffected by filters 0–4 (its left, up and up-left neighbours are all 0), so no
 * unfiltering is needed. Only 8-bit truecolour (type 2) and truecolour with alpha (type 6).
 */
export function pngTopLeft(bytes) {
  pngSize(bytes); // throws Not a PNG
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bitDepth = bytes[24];
  const colourType = bytes[25];
  if (bitDepth !== 8 || (colourType !== 2 && colourType !== 6)) {
    throw new Error('Unsupported PNG');
  }
  const idat = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const data = inflateSync(Buffer.concat(idat));
  // data[0] is the first scanline's filter byte.
  return [data[1], data[2], data[3]];
}
