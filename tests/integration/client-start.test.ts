// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BROWSER_FLAG_GLOBAL } from '../../src/core/env.js';
import { encodeKey } from '../../src/client/watermark.js';

// startLiveLocale(): the framework-free way to boot the in-page client (Astro, plain Vite, Vue,
// Svelte). The page flag set by the server decides the mode; nothing relies on NODE_ENV inlining.
describe('startLiveLocale', () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  const parent = { postMessage: vi.fn(), location: { origin: 'http://localhost:3010' } };
  const loadClient = async () => {
    vi.resetModules();
    return import('../../src/client/index.js');
  };
  const readies = () => parent.postMessage.mock.calls.filter(([m]) => m.type === 'READY').length;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('LIVELOCALE', '');
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', '');
    parent.postMessage.mockClear();
    Object.defineProperty(window, 'parent', { value: parent, configurable: true, writable: true });
    (window as any)[BROWSER_FLAG_GLOBAL] = 'development';
    sessionStorage.clear();
    document.body.innerHTML = `<h1>${encodeKey('Hello', 'home.title')}</h1>`;
  });

  afterEach(() => {
    (window as any).__LIVELOCALE_CLIENT__?.interceptor.destroy();
    delete (window as any).__LIVELOCALE_CLIENT__;
    delete (window as any)[BROWSER_FLAG_GLOBAL];
    if (originalParent) Object.defineProperty(window, 'parent', originalParent);
    vi.unstubAllEnvs();
  });

  it('boots from the page flag alone, with no NODE_ENV in the bundle', async () => {
    const { startLiveLocale } = await loadClient();
    expect(startLiveLocale()).toBe(true);
    expect((window as any).__LIVELOCALE_CLIENT__).toBeDefined();
    expect(document.querySelector('h1')!.getAttribute('data-i18n-key')).toBe('home.title');
  });

  it('is idempotent: a second call or a second copy of the module starts nothing new', async () => {
    const first = await loadClient();
    const client = (window as any).__LIVELOCALE_CLIENT__;
    expect(first.startLiveLocale()).toBe(true);
    const second = await loadClient(); // another copy, as a second bundle would load it
    expect(second.startLiveLocale()).toBe(true);
    expect((window as any).__LIVELOCALE_CLIENT__).toBe(client);
    expect(readies()).toBe(1);
  });

  it('scans the new body after a view transition swapped it', async () => {
    const { startLiveLocale } = await loadClient();
    const next = document.createElement('body');
    next.innerHTML = `<h2>${encodeKey('About', 'about.title')}</h2>`;
    document.documentElement.replaceChild(next, document.body);

    expect(startLiveLocale()).toBe(true);
    expect(document.querySelector('h2')!.getAttribute('data-i18n-key')).toBe('about.title');
    expect(readies()).toBe(1);
  });

  it('stays off outside the Studio frame', async () => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true, writable: true });
    const { startLiveLocale } = await loadClient();
    expect(startLiveLocale()).toBe(false);
    expect((window as any).__LIVELOCALE_CLIENT__).toBeUndefined();
  });

  it('stays off when the page carries the kill switch', async () => {
    (window as any)[BROWSER_FLAG_GLOBAL] = 'off';
    const { startLiveLocale } = await loadClient();
    expect(startLiveLocale()).toBe(false);
    expect((window as any).__LIVELOCALE_CLIENT__).toBeUndefined();
  });
});
