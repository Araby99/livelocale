// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ChangeLinkError,
  type ChangeWire,
  fencedChangeBlock,
  findChangeToken,
  fromBase64Url,
  isValidBranchName,
  isValidRepoSlug,
  parseChangeSet,
  toBase64Url,
  toWire,
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

describe('change-set schema', () => {
  const valid: ChangeWire = {
    v: 1,
    branch: 'main',
    base: 'a'.repeat(40),
    src: 'en',
    by: 'Mona',
    note: '',
    e: [
      ['ar', 'home.title', 'الرئيسية', 'الصفحة الرئيسية'],
      ['ar', 'greeting', null, 'مرحبا {name}', 1],
    ],
  };

  it('maps a wire object to a change set', () =>
    expect(parseChangeSet(valid)).toEqual({
      branch: 'main',
      base: 'a'.repeat(40),
      src: 'en',
      by: 'Mona',
      note: '',
      edits: [
        { locale: 'ar', key: 'home.title', from: 'الرئيسية', to: 'الصفحة الرئيسية', force: false },
        { locale: 'ar', key: 'greeting', from: null, to: 'مرحبا {name}', force: true },
      ],
    }));

  it('toWire is the inverse and omits repo and force when unset', () => {
    const set = parseChangeSet(valid);
    expect(toWire(set)).toEqual(valid);
    expect('repo' in toWire(set)).toBe(false);
    expect(toWire({ ...set, repo: 'acme/shop' }).repo).toBe('acme/shop');
  });

  it('accepts boundary values', () => {
    for (const patch of [
      { base: '' },
      { base: 'f'.repeat(64) },
      { branch: '' },
      { branch: 'feature/ä' },
      { by: 'x'.repeat(100) },
      { note: 'a\nb\tc\r\n' + 'x'.repeat(1990) },
      { e: Array.from({ length: 500 }, (_, i) => ['ar', `k${i}`, null, 'x']) },
      {
        e: [
          ['ar', 'k', null, 'x'],
          ['fr', 'k', null, 'y'],
        ],
      },
    ])
      expect(() => parseChangeSet({ ...valid, ...patch })).not.toThrow();
  });

  it.each([
    ['v 2', { v: 2 }, 'UNSUPPORTED_VERSION'],
    [
      '501 edits',
      { e: Array.from({ length: 501 }, (_, i) => ['ar', `k${i}`, null, 'x']) },
      'TOO_MANY_EDITS',
    ],
    ['no edits', { e: [] }, 'INVALID'],
    ['repo', { repo: 'acme' }, 'INVALID'],
    ['empty repo', { repo: '' }, 'INVALID'],
    ['short base', { base: 'abc' }, 'INVALID'],
    ['uppercase base', { base: 'A'.repeat(40) }, 'INVALID'],
    ['option-like branch', { branch: '--upload-pack=x' }, 'INVALID'],
    ['branch with ..', { branch: 'a..b' }, 'INVALID'],
    ['branch with space', { branch: 'a b' }, 'INVALID'],
    ['src', { src: 'english' }, 'INVALID'],
    ['by too long', { by: 'x'.repeat(101) }, 'INVALID'],
    ['by control char', { by: 'Mo\u0000na' }, 'INVALID'],
    ['note too long', { note: 'x'.repeat(2001) }, 'INVALID'],
    ['short entry', { e: [['ar', 'k', null]] }, 'INVALID'],
    ['long entry', { e: [['ar', 'k', null, 'x', 1, 1]] }, 'INVALID'],
    ['force true', { e: [['ar', 'k', null, 'x', true]] }, 'INVALID'],
    ['bad locale', { e: [['../x', 'k', null, 'x']] }, 'INVALID'],
    ['polluting key', { e: [['ar', 'a.__proto__.b', null, 'x']] }, 'INVALID'],
    ['numeric from', { e: [['ar', 'k', 5, 'x']] }, 'INVALID'],
    ['to too long', { e: [['ar', 'k', null, 'x'.repeat(10_001)]] }, 'INVALID'],
    ['lone surrogate', { e: [['ar', 'k', null, 'a\uD800b']] }, 'INVALID'],
    [
      'duplicate',
      {
        e: [
          ['ar', 'k', null, 'x'],
          ['ar', 'k', 'x', 'y'],
        ],
      },
      'INVALID',
    ],
    [
      'overlap',
      {
        e: [
          ['ar', 'a.b', null, 'x'],
          ['ar', 'a.b-x', null, 'y'],
          ['ar', 'a.b.c', null, 'z'],
        ],
      },
      'INVALID',
    ],
  ])('rejects %s', (_, patch, code) =>
    expect(codeOf(() => parseChangeSet({ ...valid, ...patch }))).toBe(code)
  );

  it.each([null, [], 'lc1', 42])('rejects root %j', (v) =>
    expect(codeOf(() => parseChangeSet(v))).toBe('INVALID')
  );

  it('names the failing edit', () =>
    expect(() => parseChangeSet({ ...valid, e: [valid.e[0], ['ar', 'k', 5, 'x']] })).toThrow(
      /edit 2/
    ));

  it('builds fresh objects', () => {
    const set = parseChangeSet(
      JSON.parse(`{"__proto__":{"polluted":1},${JSON.stringify(valid).slice(1)}`)
    );
    expect(({} as any).polluted).toBeUndefined();
    expect((set as any).polluted).toBeUndefined();
  });

  it('ignores unknown top-level fields', () =>
    expect(parseChangeSet({ ...valid, extra: 1 })).not.toHaveProperty('extra'));

  it.each(['main', 'feature/ä', 'i18n/preview-edits', 'x'.repeat(255)])(
    'accepts branch name %j',
    (b) => expect(isValidBranchName(b)).toBe(true)
  );

  it.each(['', '-x', '--upload-pack=x', 'a..b', 'a b', 'a\tb', 'x'.repeat(256)])(
    'rejects branch name %j',
    (b) => expect(isValidBranchName(b)).toBe(false)
  );
});
