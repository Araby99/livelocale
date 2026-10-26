// @vitest-environment node
import { deflateRawSync, deflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import {
  type ChangeSet,
  decodeChangeLink,
  encodeChangeLink,
  MAX_INFLATED_BYTES,
  streamInflate,
} from '../../src/core/change-link.js';
import { nodeInflate } from '../../src/core/change-link-node.js';

describe.each([
  ['DecompressionStream', streamInflate],
  ['zlib', nodeInflate],
])('%s inflater', (_, inflate) => {
  it('inflates exactly the cap', async () =>
    expect(
      (await inflate(deflateSync(Buffer.alloc(MAX_INFLATED_BYTES, 0x20)), MAX_INFLATED_BYTES))
        .length
    ).toBe(524_288));
  it('refuses one byte more', async () =>
    await expect(
      inflate(deflateSync(Buffer.alloc(MAX_INFLATED_BYTES + 1, 0x20)), MAX_INFLATED_BYTES)
    ).rejects.toMatchObject({ code: 'TOO_LARGE' }));
  it.each([
    ['truncated', () => deflateSync(Buffer.from('{"v":1}')).subarray(0, -3)],
    ['raw deflate without the zlib header', () => deflateRawSync(Buffer.from('{"v":1}'))],
    ['empty', () => new Uint8Array(0)],
  ])(
    'rejects %s as CORRUPT',
    async (_, make) =>
      await expect(inflate(make(), MAX_INFLATED_BYTES)).rejects.toMatchObject({ code: 'CORRUPT' })
  );
});

// Trailing junk is pinned for nodeInflate only. Browsers reject it in DecompressionStream natively and Node 24 does too,
// but CI runs Node 20, where streamInflate's behaviour is not part of the contract.
it('nodeInflate rejects trailing junk as CORRUPT', async () =>
  await expect(
    nodeInflate(
      Buffer.concat([deflateSync(Buffer.from('{"v":1}')), Buffer.from([1, 2, 3])]),
      MAX_INFLATED_BYTES
    )
  ).rejects.toMatchObject({ code: 'CORRUPT' }));

it('decodes a link made with CompressionStream', async () => {
  const set: ChangeSet = {
    branch: 'main',
    base: '',
    src: 'en',
    by: '',
    note: '',
    edits: [{ locale: 'ar', key: 'home.title', from: null, to: 'الرئيسية', force: false }],
  };
  expect(await decodeChangeLink(await encodeChangeLink(set), nodeInflate)).toEqual(set);
});
