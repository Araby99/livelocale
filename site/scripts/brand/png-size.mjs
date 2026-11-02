// Reads a PNG's pixel size from its IHDR chunk, so tests can check the renders without a decoder.
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from the PNG header (big-endian at bytes 16 and 20). */
export function pngSize(bytes) {
  if (bytes.length < 24 || SIGNATURE.some((byte, i) => bytes[i] !== byte)) {
    throw new Error('Not a PNG');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
