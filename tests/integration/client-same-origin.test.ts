// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FLAG_SCRIPT } from '../../src/core/flag-script.js';
import { BROWSER_FLAG_GLOBAL, getLiveLocaleMode } from '../../src/core/env.js';
import { STUDIO_ORIGIN_STORAGE_KEY } from '../../src/client/iframe-bridge.js';
import { encodeKey, stripWatermark } from '../../src/client/watermark.js';

describe('client inside a same-origin Studio', () => {
  const OWN = 'http://localhost:3000'; // Vitest's jsdom URL
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  const setParent = (p: unknown) =>
    Object.defineProperty(window, 'parent', { value: p, configurable: true, writable: true });
  const studioParent = () => ({
    postMessage: vi.fn(),
    location: { origin: OWN, pathname: '/livelocale/index.html' },
  });
  const runFlag = () =>
    new Function('window', 'document', FLAG_SCRIPT)(window, {
      currentScript: { src: `${OWN}/livelocale/flag.js` },
    });
  const bootClient = async () => {
    vi.resetModules();
    await import('../../src/client/index.js');
  };

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', '');
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', '');
    sessionStorage.clear();
    document.body.innerHTML = `<h1>${encodeKey('Hello', 'home.title')}</h1>`;
  });

  afterEach(() => {
    (window as any).__LIVELOCALE_CLIENT__?.interceptor.destroy();
    delete (window as any).__LIVELOCALE_CLIENT__;
    delete (window as any)[BROWSER_FLAG_GLOBAL];
    if (originalParent) Object.defineProperty(window, 'parent', originalParent);
    else delete (window as any).parent;
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('activates from flag.js inside a same-origin Studio and greets it on its own origin', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    expect(getLiveLocaleMode()).toBe('preview');
    await bootClient();
    expect(parent.postMessage).toHaveBeenCalledWith(
      { source: 'livelocale-client', type: 'READY', payload: { url: '/' } },
      OWN
    );
  });

  it('applies COMMIT_PREVIEW sent by the same-origin Studio', async () => {
    setParent(studioParent());
    runFlag();
    await bootClient();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: OWN,
        data: {
          source: 'livelocale-studio',
          type: 'COMMIT_PREVIEW',
          payload: { key: 'home.title', value: 'Bonjour' },
        },
      })
    );
    expect(stripWatermark(document.querySelector('h1')!.textContent ?? '')).toBe('Bonjour');
  });

  it('greets a same-origin Studio even when an older cross-origin Studio is remembered', async () => {
    sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, 'http://localhost:3010');
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'READY' }),
      OWN
    );
  });

  it('stays off for a visitor who opens the site directly', async () => {
    runFlag(); // window.parent === window
    expect((window as any)[BROWSER_FLAG_GLOBAL]).toBeUndefined();
    expect(getLiveLocaleMode()).toBe('off');
    await bootClient();
    expect((window as any).__LIVELOCALE_CLIENT__).toBeUndefined();
    expect(document.querySelector('[data-i18n-key]')).toBeNull();
  });

  it('keeps the remembered origin under a cross-origin Studio (preview builds)', async () => {
    const parent = {
      postMessage: vi.fn(),
      get location(): never {
        throw new DOMException('Blocked a frame', 'SecurityError');
      },
    };
    setParent(parent);
    (window as any)[BROWSER_FLAG_GLOBAL] = 'preview';
    sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, 'https://studio.example.com');
    await bootClient();
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'READY' }),
      'https://studio.example.com'
    );
  });
});
