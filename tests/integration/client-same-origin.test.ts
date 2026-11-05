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
    History.prototype.replaceState.call(history, {}, '', '/');
  });

  it('activates from flag.js inside a same-origin Studio and greets it on its own origin', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    expect(getLiveLocaleMode()).toBe('preview');
    await bootClient();
    expect(parent.postMessage).toHaveBeenCalledWith(
      {
        source: 'livelocale-client',
        type: 'READY',
        payload: { url: '/', features: ['edit-mode'] },
      },
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

  it('reports visible keys and then visible texts after the debounce', async () => {
    vi.useFakeTimers();
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    vi.advanceTimersByTime(200);
    expect(parent.postMessage.mock.calls.map(([m]) => m.type)).toEqual([
      'READY',
      'VISIBLE_KEYS_CHANGED',
      'RENDERED_KEYS_CHANGED',
      'VISIBLE_TEXTS_CHANGED',
    ]);
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      {
        source: 'livelocale-client',
        type: 'VISIBLE_TEXTS_CHANGED',
        payload: [{ key: 'home.title', text: 'Hello' }],
      },
      OWN
    );
  });
  it('reports a client-side navigation', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    history.pushState({}, '', '/next?x=1');
    await vi.waitFor(() =>
      expect(parent.postMessage).toHaveBeenCalledWith(
        { source: 'livelocale-client', type: 'LOCATION_CHANGED', payload: { url: '/next?x=1' } },
        OWN
      )
    );
  });

  const fromStudio = (type: string, payload?: unknown) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: OWN,
        data: { source: 'livelocale-studio', type, payload },
      })
    );

  it('freezes the site on SET_EDIT_MODE and stays frozen after CLEAR_SELECTION', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    const h1 = document.querySelector('h1')!;
    const site = vi.fn();
    h1.addEventListener('click', site);

    fromStudio('SET_EDIT_MODE', { on: true });
    fromStudio('CLEAR_SELECTION');
    h1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(site).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ELEMENT_SELECTED',
        payload: expect.objectContaining({ key: 'home.title' }),
      }),
      OWN
    );

    fromStudio('SET_EDIT_MODE', { on: 'yes' });
    fromStudio('SET_EDIT_MODE', { on: false });
    h1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(site).toHaveBeenCalledTimes(1);
  });

  it('reports a tap on text without a key', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    document.body.insertAdjacentHTML('beforeend', '<p id="plain">Not in the locale files</p>');

    fromStudio('SET_EDIT_MODE', { on: true });
    document.getElementById('plain')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(parent.postMessage).toHaveBeenCalledWith(
      { source: 'livelocale-client', type: 'TAP_UNKEYED', payload: undefined },
      OWN
    );
  });

  it('selects and reveals a key the Studio names', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    const h1 = document.querySelector('h1')!;
    const rect = new DOMRect(0, 700, 100, 40);
    (h1 as any).getBoundingClientRect = () => rect;
    (h1 as any).getClientRects = () => [rect];
    (h1 as any).scrollIntoView = vi.fn();
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as any;

    // Clients booted by earlier tests in this file still listen, so count
    // what an invalid message adds rather than absolute calls.
    const selected = () =>
      parent.postMessage.mock.calls.filter(([m]) => m.type === 'ELEMENT_SELECTED').length;
    fromStudio('SELECT_KEY', { key: 'home.title' });
    expect(h1.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ELEMENT_SELECTED',
        payload: expect.objectContaining({ key: 'home.title' }),
      }),
      OWN
    );
    const before = selected();
    fromStudio('SELECT_KEY', { key: 42 });
    expect(selected()).toBe(before);

    fromStudio('REVEAL_KEY', { key: 'home.title', bottomInset: 'x' });
    fromStudio('REVEAL_KEY', { key: 'home.title', bottomInset: -1 });
    expect(scrollBy).not.toHaveBeenCalled();
    fromStudio('REVEAL_KEY', { key: 'home.title', bottomInset: 400 });
    expect(scrollBy).toHaveBeenCalled();
    expect(selected()).toBe(before);
  });

  it('says when the page goes away and greets again from the back-forward cache', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    parent.postMessage.mockClear();

    window.dispatchEvent(new Event('pagehide'));
    expect(parent.postMessage).toHaveBeenCalledWith(
      { source: 'livelocale-client', type: 'LEAVING', payload: undefined },
      OWN
    );
    parent.postMessage.mockClear();

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(parent.postMessage).not.toHaveBeenCalled();

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(parent.postMessage).toHaveBeenCalledWith(
      {
        source: 'livelocale-client',
        type: 'READY',
        payload: { url: '/', features: ['edit-mode'] },
      },
      OWN
    );
  });
});
