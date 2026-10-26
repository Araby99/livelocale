/**
 * The Node inflater for `lc1.` change links, used by `livelocale apply`.
 *
 * Node-only: nothing under `src/studio` or `src/client` may import this file,
 * as tests/unit/core-browser-safe.test.ts checks. Browser code uses
 * `streamInflate` from `./change-link.js`.
 */

import { inflateSync } from 'zlib';
import { ChangeLinkError, type Inflater, MAX_INFLATED_BYTES } from './change-link.js';

/** The same copy `decodeChangeLink` shows for a damaged link. */
const CORRUPT_MESSAGE =
  'This change link is damaged or incomplete. Ask the sender to send the file instead.';

/** The same copy `decodeChangeLink` shows for a payload over the cap. */
const TOO_LARGE_MESSAGE = `A change link holds at most ${MAX_INFLATED_BYTES / 1024} KB of text. Send the changes in smaller links.`;

/** What `inflateSync` returns with `info: true`. Node's typings describe only the plain Buffer. */
type InflateInfo = { buffer: Buffer; engine: { bytesWritten: number } };

/**
 * Inflates the zlib format with `zlib.inflateSync`, which stops once the
 * output passes `maxOutputLength` instead of growing past it. Throws
 * `TOO_LARGE` above the cap, and `CORRUPT` on bad, truncated or empty data
 * and on bytes after the end of the zlib stream, which `inflateSync` would
 * otherwise ignore.
 */
export const nodeInflate: Inflater = async (bytes, maxOutputLength) => {
  let result: InflateInfo;
  try {
    result = inflateSync(bytes, { maxOutputLength, info: true }) as unknown as InflateInfo;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new ChangeLinkError('TOO_LARGE', TOO_LARGE_MESSAGE);
    }
    throw new ChangeLinkError('CORRUPT', CORRUPT_MESSAGE);
  }
  if (result.engine.bytesWritten !== bytes.length) {
    throw new ChangeLinkError('CORRUPT', CORRUPT_MESSAGE);
  }
  return result.buffer;
};
