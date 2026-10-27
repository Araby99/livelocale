// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeBase,
  basePathOf,
  flagSrcFor,
  shareUrlPathFor,
  injectFlagScript,
} from '../../src/server/share-html.js';
import { PackError } from '../../src/server/pack-error.js';

describe('normalizeBase', () => {
  it.each([
    ['/', '/'],
    ['/repo', '/repo/'],
    ['/repo/', '/repo/'],
    ['/a/b', '/a/b/'],
  ])('normalizeBase(%s) is absolute %s', (v, p) =>
    expect(normalizeBase(v)).toEqual({ kind: 'absolute', path: p })
  );

  it.each(['', '.', './'])('normalizeBase(%j) is relative', (v) =>
    expect(normalizeBase(v)).toEqual({ kind: 'relative' })
  );

  it.each([
    'https://cdn.acme.com/',
    '//cdn.acme.com/',
    'app/',
    '/a/../b/',
    '/a b/',
    '/a?x',
    '/a"b/',
  ])('rejects %s', (v) =>
    expect(() => normalizeBase(v)).toThrow(expect.objectContaining({ code: 'BAD_BASE' }))
  );

  it('names the fix for a full URL', () => {
    expect(() => normalizeBase('https://cdn.acme.com/')).toThrow(
      'The app base "https://cdn.acme.com/" is a full URL. Pass the path your HTML is served from, for example --base /app/ (shareBase in the Vite plugin).'
    );
  });

  it.each(['C:/Program Files/Git/repo/', 'C:\\msys64\\repo\\'])(
    'explains a Windows path the shell made from --base: %s',
    (value) => {
      let caught: unknown;
      try {
        normalizeBase(value);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: 'BAD_BASE' });
      const message = (caught as Error).message;
      expect(message).not.toContain('full URL');
      expect(message).toContain('Windows path');
      expect(message).toContain('MSYS_NO_PATHCONV=1');
    }
  );

  it('names the accepted forms for any other bad base', () => {
    let caught: unknown;
    try {
      normalizeBase('app/');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PackError);
    expect(caught).toMatchObject({
      name: 'PackError',
      code: 'BAD_BASE',
      message: 'The app base "app/" is not a site path. Use "/", "/app/" or "./".',
    });
  });

  it('basePathOf', () => {
    expect(basePathOf({ kind: 'absolute', path: '/repo/' })).toBe('/repo/');
    expect(basePathOf({ kind: 'relative' })).toBeNull();
  });
});

describe('flagSrcFor and shareUrlPathFor', () => {
  it('flagSrcFor absolute', () =>
    expect(flagSrcFor({ kind: 'absolute', path: '/repo/' }, 'a/b/index.html')).toBe(
      '/repo/livelocale/flag.js'
    ));

  it.each([
    ['index.html', './livelocale/flag.js'],
    ['docs/a.html', '../livelocale/flag.js'],
    ['a/b/c.html', '../../livelocale/flag.js'],
  ])('flagSrcFor relative %s', (rel, src) =>
    expect(flagSrcFor({ kind: 'relative' }, rel)).toBe(src)
  );

  it('shareUrlPathFor', () => {
    expect(shareUrlPathFor({ kind: 'absolute', path: '/repo/' })).toBe(
      '/repo/livelocale/index.html'
    );
    expect(shareUrlPathFor({ kind: 'relative' })).toBe('livelocale/index.html');
  });
});

describe('injectFlagScript', () => {
  const TAG = '<script src="/livelocale/flag.js"></script>';

  it('inserts as the first child of <head>', () =>
    expect(
      injectFlagScript(
        '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body></body></html>',
        '/livelocale/flag.js'
      )
    ).toBe(
      `<!doctype html><html><head>${TAG}<meta charset="utf-8"><title>x</title></head><body></body></html>`
    ));

  it('handles <HEAD> with attributes', () =>
    expect(
      injectFlagScript('<HEAD data-x="1"><title>x</title></HEAD>', '/livelocale/flag.js')
    ).toBe(`<HEAD data-x="1">${TAG}<title>x</title></HEAD>`));

  it('never matches <header>; falls back to after <html>', () =>
    expect(
      injectFlagScript(
        '<html lang="ar"><body><header>h</header></body></html>',
        '/livelocale/flag.js'
      )
    ).toBe(`<html lang="ar">${TAG}<body><header>h</header></body></html>`));

  it('falls back to after the doctype, then to the start', () => {
    expect(injectFlagScript('<!DOCTYPE html><p>x</p>', '/livelocale/flag.js')).toBe(
      `<!DOCTYPE html>${TAG}<p>x</p>`
    );
    expect(injectFlagScript('<p>x</p>', '/livelocale/flag.js')).toBe(`${TAG}<p>x</p>`);
  });

  it('is idempotent and replaces a tag with an old base', () => {
    const once = injectFlagScript(
      '<head><script src="/old/livelocale/flag.js"></script><title>x</title></head>',
      '/livelocale/flag.js'
    );
    expect(injectFlagScript(once, '/livelocale/flag.js')).toBe(
      `<head>${TAG}<title>x</title></head>`
    );
  });

  it('escapes the attribute', () =>
    expect(injectFlagScript('<head></head>', '/a"b&/livelocale/flag.js')).toBe(
      '<head><script src="/a&quot;b&amp;/livelocale/flag.js"></script></head>'
    ));

  it('leaves other scripts alone', () => {
    const rest =
      '<script type="module" crossorigin src="/assets/index-abc.js"></script><script>window.x = "livelocale/flag.js";</script><title>x</title>';
    expect(injectFlagScript(`<head>${rest}</head>`, '/livelocale/flag.js')).toBe(
      `<head>${TAG}${rest}</head>`
    );
  });
});
