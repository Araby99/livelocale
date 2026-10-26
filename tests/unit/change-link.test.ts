// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ChangeLinkError,
  fencedChangeBlock,
  findChangeToken,
  fromBase64Url,
  isValidRepoSlug,
  toBase64Url,
} from '../../src/core/change-link.js';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return 'no error';
  } catch (e) {
    return (e as ChangeLinkError).code;
  }
};

describe('base64url', () => {
  it('encodes RFC 4648 base64url without padding', () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(toBase64Url(new Uint8Array())).toBe('');
  });

  it('round-trips every byte value and every length 0..5', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (const n of [0, 1, 2, 3, 4, 5, 256])
      expect(fromBase64Url(toBase64Url(all.subarray(0, n)))).toEqual(all.subarray(0, n));
  });

  it('encodes inputs larger than one chunk', () => {
    const big = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) & 255);
    const text = toBase64Url(big);
    expect(text).toBe(Buffer.from(big).toString('base64url'));
    expect(fromBase64Url(text)).toEqual(big);
  });

  it('decodes the canonical form only', () =>
    expect(fromBase64Url('AA')).toEqual(new Uint8Array([0])));

  it.each(['abc=', 'a', 'ab+c', 'ab/c', 'AB', 'a b'])('rejects %j as CORRUPT', (t) =>
    expect(codeOf(() => fromBase64Url(t))).toBe('CORRUPT')
  );
});

describe('findChangeToken', () => {
  const T = 'lc1.eJxLTEoGAAJNASc';

  it.each([
    ['bare token', T],
    ['Studio link', `https://www.acme.com/livelocale/index.html#${T}`],
    [
      'Outlook Safe Links',
      `https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.acme.com%2Flivelocale%2Findex.html%23${T}&data=05%7C01`,
    ],
    ['Slack markup', `<https://www.acme.com/livelocale/index.html#${T}|changes>`],
    ['fenced issue block', fencedChangeBlock(T)],
    ['prose with a full stop', `Here you go: ${T}.`],
    ['the same token twice', `${T} and again https://x/livelocale/#${T}`],
  ])('finds the token in %s', (_, text) => expect(findChangeToken(text)).toBe(T));

  it('prefers the fenced block and joins wrapped lines', () =>
    expect(
      findChangeToken(`lc1.decoy\n\n\`\`\`livelocale\n${T.slice(0, 12)}\n${T.slice(12)}\n\`\`\`\n`)
    ).toBe(T));

  it('builds the fenced block GitHub issues carry', () =>
    expect(fencedChangeBlock(T)).toBe('```livelocale\n' + T + '\n```\n'));

  it.each([
    ['', 'NOT_FOUND'],
    ['no link here', 'NOT_FOUND'],
    ['lc1.', 'NOT_FOUND'],
    [`x${T}`, 'NOT_FOUND'],
    [`${T} lc1.eJxzBAAAQgBC`, 'AMBIGUOUS'],
    ['https://x/livelocale/#lc2.eJxLTEoGAAJNASc', 'UNSUPPORTED_VERSION'],
    ['lc12.abc', 'UNSUPPORTED_VERSION'],
  ])('%j → %s', (text, code) => expect(codeOf(() => findChangeToken(text))).toBe(code));
});

describe('isValidRepoSlug', () => {
  it.each(['acme/shop', 'Acme-Inc/shop.web_v2', 'a/b'])('accepts repo %s', (s) =>
    expect(isValidRepoSlug(s)).toBe(true)
  );

  it.each([
    '',
    'acme',
    'acme/',
    'acme/shop/x',
    '-acme/shop',
    'acme/.',
    'acme/..',
    `${'a'.repeat(40)}/x`,
    `acme/${'r'.repeat(101)}`,
    'acme/shop?x=1',
    'acme/shop#x',
    'acme/sh op',
  ])('rejects repo %j', (s) => expect(isValidRepoSlug(s)).toBe(false));
});
