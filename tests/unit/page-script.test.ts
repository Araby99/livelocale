// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  injectIntoHead,
  pageFlag,
  pageHeadScripts,
  readFallbackDictionary,
  watermarkedNamespaces,
} from '../../src/server/page-script.js';
import { encodeKey } from '../../src/client/watermark.js';

const HTML = '<html><head><title>T</title></head><body></body></html>';

describe('page head scripts', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-page-script-'));
    fs.mkdirSync(path.join(dir, 'en'));
    fs.mkdirSync(path.join(dir, 'ar'));
    fs.writeFileSync(path.join(dir, 'en', 'home.json'), JSON.stringify({ title: 'Hello' }));
    fs.writeFileSync(path.join(dir, 'ar', 'about.json'), JSON.stringify({ title: 'عن' }));
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', '');
    for (const v of ['VERCEL_ENV', 'NETLIFY', 'KUBERNETES_SERVICE_HOST', 'RENDER', 'DYNO']) {
      vi.stubEnv(v, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lets the source locale win over a locale the folder lists after it', () => {
    fs.mkdirSync(path.join(dir, 'fr'));
    fs.writeFileSync(path.join(dir, 'fr', 'home.json'), JSON.stringify({ title: 'Bonjour' }));
    expect(readFallbackDictionary(dir).home.title).toBe('Hello');
    expect(readFallbackDictionary(dir, 'fr').home.title).toBe('Bonjour');
    expect(pageHeadScripts(dir, 'fr')).toContain('"Bonjour"');
  });

  it('merges every locale folder into one dictionary keyed by namespace', () => {
    expect(readFallbackDictionary(dir)).toEqual({
      home: { title: 'Hello' },
      about: { title: 'عن' },
    });
  });

  it('flags development and carries the dictionary in development', () => {
    expect(pageFlag()).toBe('development');
    const scripts = pageHeadScripts(dir);
    expect(scripts).toContain('window.__LIVELOCALE_FLAG__ = "development";');
    expect(scripts).toContain('window.__livelocale_fallback__ = {');
    expect(scripts).toContain('"Hello"');
  });

  it('reads the files again on every call, so a saved edit shows on the next page', () => {
    expect(pageHeadScripts(dir)).toContain('"Hello"');
    fs.writeFileSync(path.join(dir, 'en', 'home.json'), JSON.stringify({ title: 'Welcome' }));
    expect(pageHeadScripts(dir)).toContain('"Welcome"');
  });

  it('flags preview under LIVELOCALE=preview, even in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', 'preview');
    expect(pageHeadScripts(dir)).toContain('window.__LIVELOCALE_FLAG__ = "preview";');
  });

  it('passes the kill switch to the page and nothing else', () => {
    vi.stubEnv('LIVELOCALE', 'off');
    expect(pageHeadScripts(dir)).toBe('<script>window.__LIVELOCALE_FLAG__ = "off";</script>\n');
  });

  it('injects nothing in a plain production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(pageFlag()).toBeNull();
    expect(pageHeadScripts(dir)).toBe('');
    expect(injectIntoHead(HTML, pageHeadScripts(dir))).toBe(HTML);
  });

  it('keeps the flag when the locales folder is missing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pageHeadScripts(path.join(dir, 'missing'))).toBe(
      '<script>window.__LIVELOCALE_FLAG__ = "development";</script>\n'
    );
  });

  it('keeps $ patterns in translation values literal', () => {
    fs.writeFileSync(
      path.join(dir, 'en', 'home.json'),
      JSON.stringify({ price: "Only $' today", x: 'a $& b', y: '$$ and $`' })
    );
    const page = '<html><head></head><body><script>x()</script></body></html>';
    const html = injectIntoHead(page, pageHeadScripts(dir));
    expect(html).toContain(`"price":"Only $' today"`);
    expect(html).toContain('"x":"a $& b"');
    expect(html).toContain('"y":"$$ and $`"');
    expect(html.match(/<\/script>/g)).toHaveLength(3);
    expect(html.endsWith('</head><body><script>x()</script></body></html>')).toBe(true);
  });

  describe('fallbackNamespaces', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(dir, 'en', 'common.json'), JSON.stringify({ nav: 'Nav' }));
    });

    const page = `<html><head></head><body><h1>${encodeKey('Hello', 'home.title')}</h1><span title="${encodeKey('Logo', 'common.logo')}"></span></body></html>`;

    it('finds the namespaces a page shows watermarked', () => {
      expect([...watermarkedNamespaces(page)].sort()).toEqual(['common', 'home']);
      expect(watermarkedNamespaces('<p>\u200Cplain ZWNJ text</p>').size).toBe(0);
    });

    it('puts every namespace in by default', () => {
      const scripts = pageHeadScripts(dir, undefined, { html: page });
      expect(scripts).toContain('"about"');
      expect(scripts).not.toContain('__livelocale_fallback_partial__');
    });

    it('with a list, puts in the namespaces the page shows and the listed ones, and says so', () => {
      const shown = pageHeadScripts(dir, undefined, { fallbackNamespaces: [], html: page });
      expect(shown).toContain(
        'window.__livelocale_fallback__ = {"common":{"nav":"Nav"},"home":{"title":"Hello"}}; window.__livelocale_fallback_partial__ = true;'
      );
      const listed = pageHeadScripts(dir, undefined, {
        fallbackNamespaces: ['about'],
        html: '<p>no text</p>',
      });
      expect(listed).toContain('window.__livelocale_fallback__ = {"about":{"title":"عن"}};');
    });
  });

  it('puts the scripts right before </head>', () => {
    expect(injectIntoHead(HTML, '<script>x</script>')).toBe(
      '<html><head><title>T</title><script>x</script></head><body></body></html>'
    );
  });
});
