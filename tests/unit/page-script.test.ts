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
} from '../../src/server/page-script.js';

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

  it('puts the scripts right before </head>', () => {
    expect(injectIntoHead(HTML, '<script>x</script>')).toBe(
      '<html><head><title>T</title><script>x</script></head><body></body></html>'
    );
  });
});
