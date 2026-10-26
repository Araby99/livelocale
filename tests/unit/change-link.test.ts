// @vitest-environment node
import { deflateSync } from 'node:zlib';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  CHANGE_LINK_FILE_THRESHOLD,
  CHANGE_LINK_PREFIX,
  ChangeLinkError,
  type ChangeSet,
  type ChangeWire,
  decodeChangeLink,
  encodeChangeLink,
  fencedChangeBlock,
  findChangeToken,
  fromBase64Url,
  isValidBranchName,
  isValidRepoSlug,
  MAX_CHANGE_EDITS,
  MAX_INFLATED_BYTES,
  MAX_TOKEN_CHARS,
  parseChangeSet,
  streamDeflate,
  streamInflate,
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

  // The schema rejects a lone surrogate as broken text, so the one branch rule must too.
  it.each(['a\uD800b', 'a\uDC00b', 'x\uDBFF', '\uDC00x'])(
    'rejects branch name %j, which holds a lone surrogate',
    (b) => expect(isValidBranchName(b)).toBe(false)
  );

  it('accepts a branch name with a well-formed surrogate pair', () =>
    expect(isValidBranchName('x\uD83D\uDE00')).toBe(true));

  it('rejects a link whose branch holds a lone surrogate', () =>
    expect(codeOf(() => parseChangeSet({ ...valid, branch: 'a\uD800b' }))).toBe('INVALID'));
});

describe('encode/decode', () => {
  afterEach(() => vi.unstubAllGlobals());

  const set: ChangeSet = {
    branch: 'main',
    base: 'a'.repeat(40),
    src: 'en',
    by: 'منى',
    note: 'Checked on mobile.\nThanks!',
    edits: [
      { locale: 'ar', key: 'home.title', from: 'الرئيسية', to: 'الصفحة الرئيسية', force: false },
      { locale: 'fa', key: 'cta', from: null, to: 'می‌خواهم', force: true }, // ZWNJ survives
      { locale: 'fr', key: 'accent', from: 'é', to: 'é 😀', force: false },
    ],
  }; // NFD and astral kept as-is

  it('round-trips exactly', async () =>
    expect(await decodeChangeLink(await encodeChangeLink(set))).toEqual(set));

  it('emits lc1 + base64url of a zlib stream', async () => {
    const t = await encodeChangeLink(set);
    expect(t).toMatch(/^lc1\.[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(t.slice(4))[0]).toBe(0x78);
  });

  it('carries no repo field unless given', async () => {
    const t = await encodeChangeLink(set);
    const wire = JSON.parse(
      new TextDecoder().decode(await streamInflate(fromBase64Url(t.slice(4)), MAX_INFLATED_BYTES))
    );
    expect(wire).not.toHaveProperty('repo');
    expect(wire.v).toBe(1);
    expect(
      (await decodeChangeLink(await encodeChangeLink({ ...set, repo: 'acme/shop' }))).repo
    ).toBe('acme/shop');
  });

  it('keeps 20 Arabic edits under 1,900 characters', async () => {
    const edits = Array.from({ length: 20 }, (_, i) => ({
      locale: 'ar',
      key: `shop.product${i}.title`,
      from: `منتج رقم ${i} في المتجر`,
      to: `المنتج رقم ${i} متوفر الآن في متجرنا`,
      force: false,
    }));
    expect((await encodeChangeLink({ ...set, edits })).length).toBeLessThan(1_900);
  });

  it('decodes from a full Studio link', async () =>
    expect(
      await decodeChangeLink(
        `https://www.acme.com/livelocale/index.html#${await encodeChangeLink(set)}`
      )
    ).toEqual(set));

  it('fails loudly on a truncated link', async () => {
    const t = await encodeChangeLink(set);
    for (const cut of [1, 2, 3, 5, 10])
      await expect(decodeChangeLink(t.slice(0, -cut))).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('fails loudly on a link hard-wrapped by a mail client', async () => {
    // Review Focus 2
    const t = await encodeChangeLink(set);
    for (const mangled of [
      `${t.slice(0, 40)}\n${t.slice(40)}`,
      `${t.slice(0, 40)}=\n${t.slice(40)}`,
      `${t.slice(0, 40)}\r\n  ${t.slice(40)}`,
    ])
      await expect(decodeChangeLink(`Here are my fixes: ${mangled}`)).rejects.toMatchObject({
        code: 'CORRUPT',
      });
  });

  it('fails loudly on an altered link', async () => {
    const t = await encodeChangeLink(set);
    const i = Math.floor(t.length / 2);
    await expect(
      decodeChangeLink(t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1))
    ).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('refuses more than 500 edits on encode', async () =>
    await expect(
      encodeChangeLink({
        ...set,
        edits: Array.from({ length: 501 }, (_, i) => ({
          locale: 'ar',
          key: `k${i}`,
          from: null,
          to: 'x',
          force: false,
        })),
      })
    ).rejects.toMatchObject({ code: 'TOO_MANY_EDITS' }));

  it('refuses a payload over 512 KB on encode', async () =>
    await expect(
      encodeChangeLink({
        ...set,
        edits: Array.from({ length: 40 }, (_, i) => ({
          locale: 'ar',
          key: `k${i}`,
          from: null,
          to: 'ب'.repeat(9_000),
          force: false,
        })),
      })
    ).rejects.toMatchObject({ code: 'TOO_LARGE' }));

  it('round-trips a payload just under the cap', async () => {
    const L = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
    let s = 1;
    const rnd = () => L[(s = (s * 1103515245 + 12345) % 2 ** 31) % L.length];
    const edits = Array.from({ length: 27 }, (_, i) => ({
      locale: 'ar',
      key: `k${i}`,
      from: null,
      to: Array.from({ length: 9_000 }, rnd).join(''),
      force: false,
    }));
    expect(await decodeChangeLink(await encodeChangeLink({ ...set, edits }))).toEqual({
      ...set,
      edits,
    });
  });

  it('refuses a decompression bomb', async () =>
    await expect(
      decodeChangeLink(
        'lc1.' + toBase64Url(await streamDeflate(new Uint8Array(600 * 1024).fill(0x20)))
      )
    ).rejects.toMatchObject({ code: 'TOO_LARGE' }));

  it('feeds a bomb to the inflater in 4 KB slices and stops feeding at the cap', async () => {
    // A browser inflates each written chunk whole before the reader sees the
    // cap, so one big write of a bomb spikes memory far past 512 KB. 64 MB of
    // zeros deflates to about 64 KB, which is 16 slices.
    const bomb = deflateSync(new Uint8Array(64 * 1024 * 1024));
    const Real = globalThis.DecompressionStream;
    const writes: number[] = [];
    vi.stubGlobal(
      'DecompressionStream',
      class {
        readonly readable: ReadableStream<Uint8Array>;
        readonly writable: WritableStream<BufferSource>;
        constructor(format: CompressionFormat) {
          const real = new Real(format);
          const writer = real.writable.getWriter();
          this.readable = real.readable;
          this.writable = new WritableStream<BufferSource>({
            write: (chunk) => {
              writes.push(chunk.byteLength);
              return writer.write(chunk);
            },
            close: () => writer.close(),
            abort: (reason) => writer.abort(reason),
          });
        }
      }
    );
    await expect(streamInflate(bomb, MAX_INFLATED_BYTES)).rejects.toMatchObject({
      code: 'TOO_LARGE',
    });
    // A write still queued when the read failed would have landed by now.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(Math.max(...writes)).toBeLessThanOrEqual(4096);
    expect(writes.reduce((a, b) => a + b, 0)).toBeLessThan(bomb.length / 2);
  });

  it('refuses an over-long token before inflating', async () => {
    const inflate = vi.fn();
    await expect(
      decodeChangeLink('lc1.' + 'A'.repeat(MAX_TOKEN_CHARS), inflate)
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });
    expect(inflate).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', new TextEncoder().encode('hello')],
    ['invalid UTF-8', new Uint8Array([0xff, 0xfe])],
  ])(
    'rejects %s as CORRUPT',
    async (_, bytes) =>
      await expect(
        decodeChangeLink('lc1.' + toBase64Url(await streamDeflate(bytes)))
      ).rejects.toMatchObject({ code: 'CORRUPT' })
  );

  it('rejects valid JSON of the wrong shape as INVALID', async () =>
    await expect(
      decodeChangeLink(
        'lc1.' + toBase64Url(await streamDeflate(new TextEncoder().encode('{"v":1}')))
      )
    ).rejects.toMatchObject({ code: 'INVALID' }));

  it('passes the 512 KB cap to an injected inflater', async () => {
    const inflate = vi.fn(streamInflate);
    await decodeChangeLink(await encodeChangeLink(set), inflate);
    expect(inflate).toHaveBeenCalledWith(expect.any(Uint8Array), 524_288);
  });

  it('reports a browser without CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    await expect(encodeChangeLink(set)).rejects.toMatchObject({ code: 'UNSUPPORTED_ENVIRONMENT' });
  });

  it('reports a browser without DecompressionStream', async () => {
    const t = await encodeChangeLink(set);
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(decodeChangeLink(t)).rejects.toMatchObject({ code: 'UNSUPPORTED_ENVIRONMENT' });
  });

  it('pins the spec limits', () =>
    expect([
      CHANGE_LINK_PREFIX,
      MAX_CHANGE_EDITS,
      MAX_INFLATED_BYTES,
      CHANGE_LINK_FILE_THRESHOLD,
    ]).toEqual(['lc1.', 500, 524_288, 6_000]));
});
