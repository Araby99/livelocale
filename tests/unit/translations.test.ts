// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTranslations } from '../../src/server/translations.js';
import { clearJsonCache } from '../../src/core/json-cache.js';
import * as fs from 'fs';
import path from 'path';

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

  it('should not fallback in production mode', () => {
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

    // In production, no watermarking and no fallback retrieval
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
