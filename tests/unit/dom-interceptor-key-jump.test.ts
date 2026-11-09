// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DOMInterceptor } from '../../src/client/dom-interceptor.js';
import { CLIENT_FEATURES, IframeBridge } from '../../src/client/iframe-bridge.js';
import { encodeKey } from '../../src/client/watermark.js';

/** Lays an element out as the browser would: a box, or nothing when hidden. */
function layout(el: Element, box: { top: number; height: number } | null): void {
  const rect = box === null ? new DOMRect(0, 0, 0, 0) : new DOMRect(0, box.top, 100, box.height);
  (el as any).getBoundingClientRect = () => rect;
  (el as any).getClientRects = () => (box === null ? [] : [rect]);
}

/** Makes `prefers-reduced-motion: reduce` match or not. */
function reducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

const PICKED = 'data-livelocale-picked';
const overlay = () => document.getElementById('livelocale-highlighter-overlay') as HTMLDivElement;

describe('DOMInterceptor jumpToKey', () => {
  let onElementSelected: ReturnType<typeof vi.fn>;
  let interceptor: DOMInterceptor;
  let animate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    reducedMotion(false);
    animate = vi.fn();
    (HTMLElement.prototype as any).animate = animate;
    document.body.innerHTML = `
      <h1 id="title">${encodeKey('Hello', 'home.title')}</h1>
      <a href="/next"><span id="cta">${encodeKey('Get started', 'hero.cta')}</span></a>
      <ul hidden><li id="menu">${encodeKey('Pricing', 'nav.pricing')}</li></ul>
    `;
    onElementSelected = vi.fn();
    interceptor = new DOMInterceptor(onElementSelected);
    layout(document.getElementById('title')!, { top: 10, height: 30 });
    layout(document.getElementById('cta')!, { top: 900, height: 20 });
    layout(document.getElementById('menu')!, null);
    (document.getElementById('cta') as any).scrollIntoView = vi.fn();
  });

  afterEach(() => {
    interceptor.destroy();
    delete (HTMLElement.prototype as any).animate;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('scrolls a visible key to the centre and shows it as selected without telling the Studio', () => {
    interceptor.init();
    const cta = document.getElementById('cta')!;

    expect(interceptor.jumpToKey('hero.cta', 0)).toBe('shown');

    expect(cta.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    // The Studio already opened the key: no ELEMENT_SELECTED echo to undo a draft or move focus.
    expect(onElementSelected).not.toHaveBeenCalled();
    // The Alt+Click look: the overlay around the element with a solid border and the key.
    expect(overlay().style.opacity).toBe('1');
    expect(overlay().style.top).toBe('900px');
    expect(overlay().style.border).toContain('solid');
    expect(overlay().textContent).toContain('hero.cta');
  });

  it('pulses the overlay once to draw the eye, and marks it while it does', () => {
    vi.useFakeTimers();
    interceptor.init();

    interceptor.jumpToKey('hero.cta', 0);

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(overlay());
    expect(overlay().hasAttribute('data-livelocale-jump')).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(overlay().hasAttribute('data-livelocale-jump')).toBe(false);
    // Outside Edit mode the selection look stays until the pointer moves to other text.
    expect(overlay().style.opacity).toBe('1');
  });

  it('does not animate under prefers-reduced-motion', () => {
    reducedMotion(true);
    interceptor.init();

    expect(interceptor.jumpToKey('hero.cta', 0)).toBe('shown');

    expect(animate).not.toHaveBeenCalled();
    expect(overlay().style.opacity).toBe('1');
  });

  it('in Edit mode marks the element like a tap and lets the highlight fade', () => {
    vi.useFakeTimers();
    interceptor.init();
    interceptor.setEditMode(true);

    interceptor.jumpToKey('hero.cta', 0);

    expect(document.getElementById('cta')!.hasAttribute(PICKED)).toBe(true);
    expect(overlay().style.opacity).toBe('1');
    vi.advanceTimersByTime(2000);
    // Edit mode keeps no hover overlay; the picked outline stays.
    expect(overlay().style.opacity).toBe('0');
    expect(document.getElementById('cta')!.hasAttribute(PICKED)).toBe(true);
    expect(onElementSelected).not.toHaveBeenCalled();
  });

  it('with a bottom inset, scrolls the element into the part of the frame above it', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as any;
    interceptor.init();

    expect(interceptor.jumpToKey('hero.cta', 480)).toBe('shown');

    expect(scrollBy).toHaveBeenCalledTimes(1);
    const delta = scrollBy.mock.calls[0]![1] as number;
    // The element (900 to 920) must end between the top and 800 - 480 = 320.
    expect(900 - delta).toBeGreaterThanOrEqual(0);
    expect(920 - delta).toBeLessThanOrEqual(320);
  });

  it('says "hidden" for a key on the page that is not visible, and reports the keys again', () => {
    vi.useFakeTimers();
    const onKeys = vi.fn();
    const reporting = new DOMInterceptor(onElementSelected, onKeys);
    reporting.init();
    vi.advanceTimersByTime(300);
    onKeys.mockClear();

    expect(reporting.jumpToKey('nav.pricing', 0)).toBe('hidden');
    vi.advanceTimersByTime(300);
    expect(onKeys).toHaveBeenCalledTimes(1);
    expect(overlay().style.opacity).not.toBe('1');
    reporting.destroy();
  });

  it('says "absent" for a key the page does not have', () => {
    interceptor.init();
    expect(interceptor.jumpToKey('no.such.key', 0)).toBe('absent');
    expect(animate).not.toHaveBeenCalled();
  });

  it('moving the pointer onto other text replaces the selection look with the hover hint', () => {
    interceptor.init();
    interceptor.jumpToKey('hero.cta', 0);

    document.getElementById('title')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(overlay().style.top).toBe('10px');
    expect(overlay().style.border).toContain('dashed');
  });

  it('CLEAR_SELECTION (destroy + init) removes the selection look', () => {
    interceptor.init();
    interceptor.jumpToKey('hero.cta', 0);

    interceptor.destroy();
    interceptor.init();

    expect(overlay().style.opacity).toBe('0');
  });
});

describe('IframeBridge KEY_JUMPED', () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  let parent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    parent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: parent, configurable: true, writable: true });
  });

  afterEach(() => {
    if (originalParent) Object.defineProperty(window, 'parent', originalParent);
  });

  it('the client announces key-jump in its features', () => {
    expect(CLIENT_FEATURES).toContain('key-jump');
  });

  it('carries only a valid key and a known result', () => {
    const bridge = new IframeBridge('http://localhost:3010');
    bridge.sendToParent('KEY_JUMPED', { key: 'home.title', result: 'shown', extra: 'leak' });
    bridge.sendToParent('KEY_JUMPED', { key: 'bad key', result: 'shown' });
    bridge.sendToParent('KEY_JUMPED', { key: 'home.title', result: 'maybe' });
    bridge.sendToParent('KEY_JUMPED', null);
    expect(parent.postMessage.mock.calls.map(([m]) => m)).toEqual([
      {
        source: 'livelocale-client',
        type: 'KEY_JUMPED',
        payload: { key: 'home.title', result: 'shown' },
      },
    ]);
  });
});
