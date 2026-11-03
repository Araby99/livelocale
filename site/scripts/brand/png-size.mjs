// Reads a PNG's pixel size, top-left colour and text chunks, so tests can check the renders
// without a decoder, and adds a tEXt chunk (render-pngs.mjs's provenance line).
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

/** Every tEXt chunk as { keyword: text }, Latin-1 as the PNG spec defines it. */
export function pngText(bytes) {
  pngSize(bytes); // throws Not a PNG
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = {};
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === 'tEXt') {
      const body = Buffer.from(bytes.subarray(at + 8, at + 8 + length)).toString('latin1');
      const nul = body.indexOf('\0');
      text[body.slice(0, nul)] = body.slice(nul + 1);
    }
    if (type === 'IEND') break;
    at += 12 + length;
  }
  return text;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A copy of the PNG with one tEXt chunk `keyword`/`text` inserted just before IEND. */
export function withPngText(bytes, keyword, text) {
  pngSize(bytes); // throws Not a PNG
  const png = Buffer.from(bytes);
  const iend = png.length - 12;
  if (png.toString('latin1', iend + 4, iend + 8) !== 'IEND')
    throw new Error('PNG must end in IEND');
  const body = Buffer.from(`${keyword}\0${text}`, 'latin1');
  const chunk = Buffer.alloc(12 + body.length);
  chunk.writeUInt32BE(body.length, 0);
  chunk.write('tEXt', 4, 'latin1');
  body.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + body.length)), 8 + body.length);
  return Buffer.concat([png.subarray(0, iend), chunk, png.subarray(iend)]);
}
