// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTranslations } from '../../src/server/translations.js';
import { clearJsonCache } from '../../src/core/json-cache.js';
import * as fs from 'fs';
import path from 'path';
import { types } from 'util';
import { decodeKey } from '../../src/client/watermark.js';

const { isProxy } = types;

vi.mock('fs', () => {
  return {
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

describe('createTranslations', () => {
  const LOCALES_DIR = '/project/locales';

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.clearAllMocks();
    clearJsonCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should load a flat locale JSON file', () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ greeting: 'Hello' }));

    const t = createTranslations('en', {
      localesDir: LOCALES_DIR,
      supportedLocales: ['en'],
    });

    expect(t.greeting).toContain('Hello'); // contains watermark in development
    expect(fs.readFileSync).toHaveBeenCalledWith(path.join(LOCALES_DIR, 'en.json'), 'utf-8');
  });

  it('should read and merge all JSON files in a namespace directory', () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(['common.json' as any, 'auth.json' as any]);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ welcome: 'Welcome' }))
      .mockReturnValueOnce(JSON.stringify({ login: 'Sign In' }));

    const t = createTranslations('en', {
      localesDir: LOCALES_DIR,
      supportedLocales: ['en'],
    });

    expect(t.common?.welcome).toBeDefined();
    expect(t.auth?.login).toBeDefined();
    expect(fs.readdirSync).toHaveBeenCalledWith(path.join(LOCALES_DIR, 'en'));
  });

  it('should fall back to safe locale flat file if directory readdir fails', () => {
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('readdir error');
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ fallback: 'yes' }));

    const t = createTranslations('en', {
      localesDir: LOCALES_DIR,
      supportedLocales: ['en'],
    });

    expect(t.fallback).toBeDefined();
  });

  it('should retrieve missing key from alternative locales in development mode', () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      return { isDirectory: () => false } as any;
    });

    vi.mocked(fs.readdirSync).mockReturnValue(['en.json' as any, 'es.json' as any]);

    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      const filepath = p.toString();
      if (filepath.endsWith('en.json')) {
        return JSON.stringify({ welcome: 'Welcome' });
      }
      if (filepath.endsWith('es.json')) {
        return JSON.stringify({ welcome: 'Hola', details: { title: 'Detalles' } });
      }
      return '{}';
    });

    const t = createTranslations('en', {
      localesDir: LOCALES_DIR,
      supportedLocales: ['en', 'es'],
    });

    // welcome is in active locale 'en' -> returned watermarked
    expect(t.welcome).toContain('Welcome');

    // details.title is missing in 'en' but exists in 'es' -> returns watermarked Spanish fallback value
    expect(t.details?.title).toContain('Detalles');
  });

  it('should not fall back to other locales in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(['en.json' as any, 'es.json' as any]);
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      const filepath = p.toString();
      if (filepath.endsWith('en.json')) {
        return JSON.stringify({ welcome: 'Welcome' });
      }
      if (filepath.endsWith('es.json')) {
        return JSON.stringify({ details: { title: 'Detalles' } });
      }
      return '{}';
    });

    const t = createTranslations('en', {
      localesDir: LOCALES_DIR,
      supportedLocales: ['en', 'es'],
    });

    // In production, no watermarking and no fallback from locales other than fallbackLocale
    expect(t.welcome).toBe('Welcome');
    expect(t.details?.title).toBeUndefined();
  });
  // ─── Parse cache ─────────────────────────────────────────────────────────

  it('should not re-read an unchanged locale file on subsequent calls', () => {
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => false,
      mtimeMs: 1000,
      size: 20,
    } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(['en.json' as any]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ greeting: 'Hello' }));

    const opts = { localesDir: LOCALES_DIR, supportedLocales: ['en'] };
    createTranslations('en', opts);
    createTranslations('en', opts);

    const enReads = vi
      .mocked(fs.readFileSync)
      .mock.calls.filter((c) => c[0].toString().endsWith('en.json'));
    expect(enReads).toHaveLength(1);
  });

  it('should re-read a locale file when its mtime changes', () => {
    let mtimeMs = 1000;
    vi.mocked(fs.statSync).mockImplementation(
      () => ({ isDirectory: () => false, mtimeMs, size: 20 }) as any
    );
    vi.mocked(fs.readdirSync).mockReturnValue(['en.json' as any]);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify({ greeting: 'Hello' }))
      .mockReturnValueOnce(JSON.stringify({ greeting: 'Hello again' }));

    const opts = { localesDir: LOCALES_DIR, supportedLocales: ['en'] };
    const first = createTranslations('en', opts);
    expect(first.greeting).toContain('Hello');

    mtimeMs = 2000;
    const second = createTranslations('en', opts);
    expect(second.greeting).toContain('Hello again');

    const enReads = vi
      .mocked(fs.readFileSync)
      .mock.calls.filter((c) => c[0].toString().endsWith('en.json'));
    expect(enReads).toHaveLength(2);
  });
});

// ─── Fallback in every mode ──────────────────────────────────────────────────

/** A virtual locales folder: `'en.json': '{...}'` is a file, `ar: { 'common.json': '{...}' }` a folder. */
type Tree = Record<string, string | Record<string, string>>;

function mockLocales(root: string, tree: Tree): void {
  const lookup = (p: unknown): string | Record<string, string> | undefined => {
    const rel = path.relative(root, String(p));
    if (rel === '') return tree as Record<string, string>;
    const [first, second, ...rest] = rel.split(path.sep);
    if (rest.length > 0 || !Object.hasOwn(tree, first)) return undefined;
    const node = tree[first];
    if (second === undefined) return node;
    return typeof node === 'object' && Object.hasOwn(node, second) ? node[second] : undefined;
  };
  vi.mocked(fs.statSync).mockImplementation(((p: unknown) => {
    const node = lookup(p);
    if (node === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const isDir = typeof node === 'object';
    return { isDirectory: () => isDir, mtimeMs: 1000, size: isDir ? 0 : node.length };
  }) as any);
  vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
    const node = lookup(p);
    if (typeof node !== 'object') throw new Error('ENOTDIR');
    return Object.keys(node);
  }) as any);
  vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
    const node = lookup(p);
    if (typeof node !== 'string') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return node;
  }) as any);
}

const json = (value: unknown): string => JSON.stringify(value);

/** `ar` is half translated; `en` is the fallback locale; `fr` comes after `en` in the folder. */
const FLAT: Tree = {
  'ar.json': json({ home: { title: 'الرئيسية' } }),
  'en.json': json({ home: { title: 'Home', subtitle: 'Welcome' }, footer: 'Footer' }),
  'fr.json': json({ home: { subtitle: 'Bienvenue' }, footer: 'Pied', onlyFr: 'Seulement' }),
};

const FOLDERS: Tree = {
  ar: { 'common.json': json({ title: 'الرئيسية' }) },
  en: {
    'common.json': json({ title: 'Home', subtitle: 'Welcome' }),
    'auth.json': json({ login: 'Sign in' }),
  },
  fr: {
    'common.json': json({ subtitle: 'Bienvenue' }),
    'auth.json': json({ login: 'Connexion' }),
  },
};

describe('createTranslations fallback', () => {
  const LOCALES_DIR = path.resolve('/project/locales');
  const opts = { localesDir: LOCALES_DIR, supportedLocales: ['ar', 'en', 'fr'] };

  beforeEach(() => {
    vi.clearAllMocks();
    clearJsonCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('while livelocale is off', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LIVELOCALE', '');
    });

    it('fills keys missing from a flat locale file with the fallback locale', () => {
      mockLocales(LOCALES_DIR, FLAT);
      const t = createTranslations('ar', opts);

      expect(t.home.title).toBe('الرئيسية');
      expect(t.home.subtitle).toBe('Welcome');
      expect(t.footer).toBe('Footer');
      expect(t.onlyFr).toBeUndefined();
    });

    it('fills keys missing from a locale folder with the fallback locale', () => {
      mockLocales(LOCALES_DIR, FOLDERS);
      const t = createTranslations('ar', opts);

      expect(t.common.title).toBe('الرئيسية');
      expect(t.common.subtitle).toBe('Welcome');
      expect(t.auth.login).toBe('Sign in');
    });

    it('returns a plain object that survives JSON serialization', () => {
      mockLocales(LOCALES_DIR, FLAT);
      const t = createTranslations('ar', opts);

      expect(isProxy(t)).toBe(false);
      expect(JSON.parse(JSON.stringify(t))).toEqual({
        home: { title: 'الرئيسية', subtitle: 'Welcome' },
        footer: 'Footer',
      });
    });

    it('also falls back with the LIVELOCALE=off kill switch in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('LIVELOCALE', 'off');
      mockLocales(LOCALES_DIR, FLAT);

      expect(createTranslations('ar', opts).home.subtitle).toBe('Welcome');
    });

    it('keeps a locale value that is null or empty instead of the fallback', () => {
      mockLocales(LOCALES_DIR, {
        'ar.json': json({ a: null, b: '' }),
        'en.json': json({ a: 'A', b: 'B' }),
      });
      const t = createTranslations('ar', opts);

      expect(t.a).toBeNull();
      expect(t.b).toBe('');
    });

    it('keeps a locale array whole, even when the fallback array is longer', () => {
      mockLocales(LOCALES_DIR, {
        'ar.json': json({ list: ['واحد', 'اثنان'] }),
        'en.json': json({ list: ['one', 'two', 'three'], other: ['x'] }),
      });
      const t = createTranslations('ar', opts);

      expect(t.list).toEqual(['واحد', 'اثنان']);
      expect(t.other).toEqual(['x']);
    });

    it('returns the fallback locale as read when it is the requested locale', () => {
      mockLocales(LOCALES_DIR, FLAT);
      expect(createTranslations('en', opts)).toEqual(JSON.parse(FLAT['en.json'] as string));
    });

    it('does not re-read unchanged files on later calls', () => {
      mockLocales(LOCALES_DIR, FLAT);
      const first = createTranslations('ar', opts);
      const second = createTranslations('ar', opts);

      expect(second).toEqual(first);
      // The merged subtree is reused while neither file changed.
      expect(second.home).toBe(first.home);
      const reads = vi
        .mocked(fs.readFileSync)
        .mock.calls.map((c) => path.basename(c[0].toString()));
      expect(reads.filter((f) => f === 'ar.json')).toHaveLength(1);
      expect(reads.filter((f) => f === 'en.json')).toHaveLength(1);
    });

    it('returns the same plain object with plain: true', () => {
      mockLocales(LOCALES_DIR, FOLDERS);
      const t = createTranslations('ar', { ...opts, plain: true });

      expect(isProxy(t)).toBe(false);
      expect(JSON.parse(JSON.stringify(t))).toEqual({
        common: { title: 'الرئيسية', subtitle: 'Welcome' },
        auth: { login: 'Sign in' },
      });
    });
  });

  describe.each([
    ['development', { NODE_ENV: 'development', LIVELOCALE: '' }],
    ['preview', { NODE_ENV: 'production', LIVELOCALE: 'preview' }],
  ])('in %s mode', (_mode, env) => {
    beforeEach(() => {
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    });

    it('watermarks the locale text and the fallback text with their keys', () => {
      mockLocales(LOCALES_DIR, FLAT);
      const t = createTranslations('ar', opts);

      expect(decodeKey(t.home.title)).toEqual({ key: 'home.title', cleanText: 'الرئيسية' });
      expect(decodeKey(t.home.subtitle)?.key).toBe('home.subtitle');
    });

    it('prefers the fallback locale over other locales in a flat layout', () => {
      mockLocales(LOCALES_DIR, FLAT);
      const t = createTranslations('ar', opts);

      expect(decodeKey(t.home.subtitle)?.cleanText).toBe('Welcome');
      expect(decodeKey(t.footer)?.cleanText).toBe('Footer');
      // A key only another locale has still shows, so it stays editable in the Studio.
      expect(decodeKey(t.onlyFr)?.cleanText).toBe('Seulement');
    });

    it('prefers the fallback locale over other locales in a folder layout', () => {
      mockLocales(LOCALES_DIR, FOLDERS);
      const t = createTranslations('ar', opts);

      expect(decodeKey(t.common.subtitle)?.cleanText).toBe('Welcome');
      expect(decodeKey(t.auth.login)).toEqual({ key: 'auth.login', cleanText: 'Sign in' });
    });

    it('prefers the fallback locale whatever its place in the folder', () => {
      mockLocales(LOCALES_DIR, {
        'ar.json': json({}),
        'fr.json': json({ greeting: 'Bonjour' }),
        'en.json': json({ greeting: 'Hello' }),
        'zz.json': json({ greeting: 'Zz' }),
      });
      const t = createTranslations('ar', { ...opts, supportedLocales: ['ar'] });

      expect(decodeKey(t.greeting)?.cleanText).toBe('Hello');
    });

    describe('with plain: true', () => {
      const RICH: Tree = {
        'ar.json': json({ home: { title: 'الرئيسية' }, count: 3, list: ['أ'] }),
        'en.json': json({
          home: { title: 'Home', subtitle: 'Welcome' },
          items: { one: '# item', other: '# items' },
          list: ['a', 'b'],
          flag: true,
          empty: null,
        }),
        'fr.json': json({ onlyFr: 'Seulement' }),
      };

      it('returns a plain object holding every key of the locale and its fallback', () => {
        mockLocales(LOCALES_DIR, RICH);
        const t = createTranslations('ar', { ...opts, plain: true });

        expect(isProxy(t)).toBe(false);
        expect(isProxy(t.home)).toBe(false);
        const copy = JSON.parse(JSON.stringify(t));
        expect(Object.keys(copy).sort()).toEqual(
          ['count', 'empty', 'flag', 'home', 'items', 'list', 'onlyFr'].sort()
        );
        expect(Object.keys(copy.home).sort()).toEqual(['subtitle', 'title']);
      });

      it('keeps the watermarks through a JSON round trip, fallback text included', () => {
        mockLocales(LOCALES_DIR, RICH);
        const copy = JSON.parse(JSON.stringify(createTranslations('ar', { ...opts, plain: true })));

        expect(decodeKey(copy.home.title)).toEqual({ key: 'home.title', cleanText: 'الرئيسية' });
        expect(decodeKey(copy.home.subtitle)).toEqual({
          key: 'home.subtitle',
          cleanText: 'Welcome',
        });
        expect(decodeKey(copy.items.one)).toEqual({ key: 'items.one', cleanText: '# item' });
      });

      it('holds the same values a read through the proxy gives', () => {
        mockLocales(LOCALES_DIR, RICH);
        const proxy = createTranslations('ar', opts);
        const plain = createTranslations('ar', { ...opts, plain: true });

        expect(plain.home.title).toBe(proxy.home.title);
        expect(plain.home.subtitle).toBe(proxy.home.subtitle);
        expect(plain.items.one).toBe(proxy.items.one);
        expect(plain.items.other).toBe(proxy.items.other);
        expect(plain.list[0]).toBe(proxy.list[0]);
        expect(plain.list).toHaveLength(proxy.list.length);
        expect([...plain.list]).toEqual([...proxy.list]);
        expect(plain.onlyFr).toBe(proxy.onlyFr);
        expect(plain.count).toBe(3);
        expect(plain.count).toBe(proxy.count);
        expect(plain.flag).toBe(proxy.flag);
        expect(plain.empty).toBeNull();
        expect(proxy.empty).toBeNull();
        expect(Array.isArray(plain.list)).toBe(true);
        expect(plain.list).toHaveLength(1);
      });

      it('works with a folder layout', () => {
        mockLocales(LOCALES_DIR, FOLDERS);
        const t = createTranslations('ar', { ...opts, plain: true });

        expect(isProxy(t)).toBe(false);
        expect(decodeKey(t.common.subtitle)).toEqual({
          key: 'common.subtitle',
          cleanText: 'Welcome',
        });
        expect(decodeKey(t.auth.login)?.cleanText).toBe('Sign in');
      });
    });
  });
});
