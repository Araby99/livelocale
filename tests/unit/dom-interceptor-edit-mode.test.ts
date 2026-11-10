// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DOMInterceptor } from '../../src/client/dom-interceptor.js';
import { IframeBridge } from '../../src/client/iframe-bridge.js';
import { encodeKey } from '../../src/client/watermark.js';

/** Lays an element out as the browser would: a box, or nothing when hidden. */
function layout(
  el: Element,
  box: { top: number; height: number } | null,
  checkVisibility?: boolean
): void {
  const rect = box === null ? new DOMRect(0, 0, 0, 0) : new DOMRect(0, box.top, 100, box.height);
  (el as any).getBoundingClientRect = () => rect;
  (el as any).getClientRects = () => (box === null ? [] : [rect]);
  if (checkVisibility !== undefined) (el as any).checkVisibility = () => checkVisibility;
}

describe('DOMInterceptor edit mode', () => {
  let onElementSelected: ReturnType<typeof vi.fn>;
  let onUnkeyedTap: ReturnType<typeof vi.fn>;
  let interceptor: DOMInterceptor;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    document.body.innerHTML = '';
    onElementSelected = vi.fn();
    onUnkeyedTap = vi.fn();
    interceptor = new DOMInterceptor(onElementSelected, undefined, onUnkeyedTap);
  });

  afterEach(() => {
    interceptor.destroy();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const click = (el: Element, init: MouseEventInit = {}) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(event);
    return event;
  };

  it('edit mode: a plain click on keyed text selects it and is cancelled', () => {
    document.body.innerHTML = `<a href="/next"><span>${encodeKey('Get started', 'hero.cta')}</span></a>`;
    const anchorListener = vi.fn();
    document.querySelector('a')!.addEventListener('click', anchorListener);
    interceptor.init();
    interceptor.setEditMode(true);

    const event = click(document.querySelector('span')!);

    expect(onElementSelected).toHaveBeenCalledWith(expect.objectContaining({ key: 'hero.cta' }));
    expect(event.defaultPrevented).toBe(true);
    expect(anchorListener).not.toHaveBeenCalled();
  });

  it('edit mode: a click on an <a href> image link reaches nothing', () => {
    document.body.innerHTML = '<a href="/next"><img alt="" src="logo.png"></a>';
    const anchor = document.querySelector('a')!;
    const anchorListener = vi.fn();
    anchor.addEventListener('click', anchorListener);
    interceptor.init();
    interceptor.setEditMode(true);

    const event = click(document.querySelector('img')!);

    expect(anchorListener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(onElementSelected).not.toHaveBeenCalled();
  });

  it('edit mode: a click on unkeyed text calls onUnkeyedTap', () => {
    document.body.innerHTML = '<p>Plain <b>text</b></p>';
    interceptor.init();
    interceptor.setEditMode(true);

    click(document.querySelector('p')!);

    expect(onUnkeyedTap).toHaveBeenCalledTimes(1);
    expect(onElementSelected).not.toHaveBeenCalled();
  });

  it('edit mode: a click on an <img> does not call onUnkeyedTap', () => {
    document.body.innerHTML = '<div>  <img alt="" src="x.png">  </div>';
    interceptor.init();
    interceptor.setEditMode(true);

    click(document.querySelector('img')!);
    click(document.querySelector('div')!);

    expect(onUnkeyedTap).not.toHaveBeenCalled();
  });

  it('edit mode: pointerdown, mousedown and touchstart do not reach the site but touchstart is not defaultPrevented', () => {
    document.body.innerHTML = '<button>Menu</button>';
    const button = document.querySelector('button')!;
    const siteListener = vi.fn();
    for (const type of ['pointerdown', 'mousedown', 'touchstart']) {
      button.addEventListener(type, siteListener);
    }
    interceptor.init();
    interceptor.setEditMode(true);

    for (const type of ['pointerdown', 'mousedown']) {
      button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
    const touch = new Event('touchstart', { bubbles: true, cancelable: true });
    button.dispatchEvent(touch);

    expect(siteListener).not.toHaveBeenCalled();
    expect(touch.defaultPrevented).toBe(false);
  });

  it('edit mode: focusing a site <input> blurs it', () => {
    document.body.innerHTML =
      '<input id="q"><textarea></textarea><div contenteditable="true">x</div>';
    interceptor.init();
    interceptor.setEditMode(true);

    const input = document.querySelector('input')!;
    input.focus();
    expect(document.activeElement).not.toBe(input);

    const textarea = document.querySelector('textarea')!;
    textarea.focus();
    expect(document.activeElement).not.toBe(textarea);
  });

  it('edit mode outlines keyed text through one attribute on <html>', () => {
    interceptor.init();
    interceptor.setEditMode(true);
    expect(document.documentElement.hasAttribute('data-livelocale-edit')).toBe(true);
    expect(document.head.textContent).toContain('html[data-livelocale-edit] [data-i18n-key]');
    // Two tones, a dark dash on a light ring, so the outline shows on light and dark sites alike.
    expect(document.head.textContent).toContain(
      'html[data-livelocale-edit] [data-i18n-key]{outline:2px dashed #0C0D0F;outline-offset:2px;box-shadow:0 0 0 2px #E8E4D9}'
    );

    interceptor.setEditMode(false);
    expect(document.documentElement.hasAttribute('data-livelocale-edit')).toBe(false);
  });

  it('edit mode survives destroy() + init()', () => {
    document.body.innerHTML = `<a href="/next">${encodeKey('Pricing', 'nav.pricing')}</a>`;
    interceptor.init();
    interceptor.setEditMode(true);

    interceptor.destroy();
    interceptor.init();

    const event = click(document.querySelector('a')!);
    expect(event.defaultPrevented).toBe(true);
    expect(onElementSelected).toHaveBeenCalledWith(expect.objectContaining({ key: 'nav.pricing' }));
    expect(document.documentElement.hasAttribute('data-livelocale-edit')).toBe(true);
  });

  it('a mode set before init() applies once init() runs', () => {
    document.body.innerHTML = `<a href="/next">${encodeKey('Pricing', 'nav.pricing')}</a>`;
    interceptor.setEditMode(true);
    interceptor.init();

    expect(click(document.querySelector('a')!).defaultPrevented).toBe(true);
  });

  it('destroy() unfreezes the site', () => {
    document.body.innerHTML = '<button>Menu</button>';
    const siteListener = vi.fn();
    document.querySelector('button')!.addEventListener('click', siteListener);
    interceptor.init();
    interceptor.setEditMode(true);
    interceptor.destroy();

    click(document.querySelector('button')!);
    expect(siteListener).toHaveBeenCalled();
    expect(document.documentElement.hasAttribute('data-livelocale-edit')).toBe(false);
  });

  it('browse (edit off): a plain click reaches the site; Alt+click still selects', () => {
    document.body.innerHTML = `<a href="#pricing">${encodeKey('Pricing', 'nav.pricing')}</a>`;
    const anchor = document.querySelector('a')!;
    const anchorListener = vi.fn();
    anchor.addEventListener('click', anchorListener);
    interceptor.init();
    interceptor.setEditMode(true);
    interceptor.setEditMode(false);

    const plain = click(anchor);
    expect(anchorListener).toHaveBeenCalledTimes(1);
    expect(plain.defaultPrevented).toBe(false);
    expect(onElementSelected).not.toHaveBeenCalled();

    const pointer = vi.fn();
    anchor.addEventListener('pointerdown', pointer);
    anchor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(pointer).toHaveBeenCalled();

    const alt = click(anchor, { altKey: true });
    expect(alt.defaultPrevented).toBe(true);
    expect(onElementSelected).toHaveBeenCalledWith(expect.objectContaining({ key: 'nav.pricing' }));
  });

  it('getRenderedKeys skips hidden elements and dedupes in document order', () => {
    document.body.innerHTML = `
      <div style="display:none"><span id="menu">${encodeKey('Docs', 'nav.docs')}</span></div>
      <span id="zero">${encodeKey('Slide 2', 'slides.two')}</span>
      <span id="desktop">${encodeKey('Pricing', 'nav.pricing')}</span>
      <span id="title">${encodeKey('Hello', 'home.title')}</span>
      <span id="mobile">${encodeKey('Pricing', 'nav.pricing')}</span>
    `;
    interceptor.init();
    layout(document.getElementById('menu')!, { top: 0, height: 20 }, false);
    layout(document.getElementById('zero')!, null);
    layout(document.getElementById('desktop')!, null);
    layout(document.getElementById('title')!, { top: 10, height: 20 }, true);
    layout(document.getElementById('mobile')!, { top: 40, height: 20 });

    expect(interceptor.getRenderedKeys()).toEqual(['home.title', 'nav.pricing']);
  });

  it('getRenderedKeys skips an element with rects but an empty box', () => {
    document.body.innerHTML = `<span id="a">${encodeKey('Hi', 'a.b')}</span>`;
    interceptor.init();
    const el = document.getElementById('a')!;
    (el as any).getClientRects = () => [new DOMRect(0, 0, 0, 0)];
    (el as any).getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);

    expect(interceptor.getRenderedKeys()).toEqual([]);
  });

  it('selectKey uses the first visible element and returns false when none', () => {
    document.body.innerHTML = `
      <span id="desktop" data-i18n-template="Pricing">${encodeKey('Pricing', 'nav.pricing')}</span>
      <span id="mobile" data-i18n-template="Pricing">${encodeKey('Pricing', 'nav.pricing')}</span>
      <span id="hidden">${encodeKey('Docs', 'nav.docs')}</span>
    `;
    interceptor.init();
    const desktop = document.getElementById('desktop')!;
    const mobile = document.getElementById('mobile')!;
    layout(desktop, null);
    layout(mobile, { top: 900, height: 20 });
    layout(document.getElementById('hidden')!, null);
    const desktopScroll = vi.fn();
    const mobileScroll = vi.fn();
    (desktop as any).scrollIntoView = desktopScroll;
    (mobile as any).scrollIntoView = mobileScroll;

    expect(interceptor.selectKey('nav.pricing')).toBe(true);
    expect(mobileScroll).toHaveBeenCalledWith({ block: 'center' });
    expect(desktopScroll).not.toHaveBeenCalled();
    expect(onElementSelected).toHaveBeenCalledWith({
      key: 'nav.pricing',
      fallbackValue: 'Pricing',
      currentValue: expect.any(String),
    });

    onElementSelected.mockClear();
    expect(interceptor.selectKey('nav.docs')).toBe(false);
    expect(interceptor.selectKey('no.such.key')).toBe(false);
    expect(onElementSelected).not.toHaveBeenCalled();
  });

  it('selectKey on a key no longer visible reports the keys again, so the Studio can move on', () => {
    vi.useFakeTimers();
    try {
      const onKeys = vi.fn();
      const reporting = new DOMInterceptor(onElementSelected, onKeys, onUnkeyedTap);
      document.body.innerHTML = `<span id="slide">${encodeKey('Slide 2', 'slides.two')}</span>`;
      reporting.init();
      vi.advanceTimersByTime(300);
      onKeys.mockClear();
      // A carousel moved on without a DOM change the observer would see.
      layout(document.getElementById('slide')!, null);

      expect(reporting.selectKey('slides.two')).toBe(false);
      vi.advanceTimersByTime(300);
      expect(onKeys).toHaveBeenCalledTimes(1);
      reporting.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('revealKey(key, 400) scrolls by the overlap so the element ends above the inset; no scroll when already clear', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as any;
    document.body.innerHTML = `
      <span id="hidden">${encodeKey('Title', 'home.title')}</span>
      <span id="low">${encodeKey('Title', 'home.title')}</span>
      <span id="high">${encodeKey('Intro', 'home.intro')}</span>
    `;
    interceptor.init();
    layout(document.getElementById('hidden')!, null);
    layout(document.getElementById('low')!, { top: 500, height: 20 });
    layout(document.getElementById('high')!, { top: 100, height: 20 });

    interceptor.revealKey('home.title', 400);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    const delta = scrollBy.mock.calls[0]![1] as number;
    // The bottom (520) must end at or above 800 - 400 = 400, without the top leaving the frame.
    expect(520 - delta).toBeLessThanOrEqual(400);
    expect(500 - delta).toBeGreaterThanOrEqual(0);

    scrollBy.mockClear();
    interceptor.revealKey('home.intro', 400);
    interceptor.revealKey('no.such.key', 400);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(onElementSelected).not.toHaveBeenCalled();
  });

  it('revealKey brings an element above the frame back down', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as any;
    document.body.innerHTML = `<span id="a">${encodeKey('Title', 'home.title')}</span>`;
    interceptor.init();
    layout(document.getElementById('a')!, { top: -50, height: 20 });

    interceptor.revealKey('home.title', 400);
    const delta = scrollBy.mock.calls[0]![1] as number;
    expect(-50 - delta).toBeGreaterThanOrEqual(0);
    expect(-30 - delta).toBeLessThanOrEqual(400);
  });

  it('edit mode does not show the Alt+Click hover badge', () => {
    document.body.innerHTML = `<span>${encodeKey('Hello', 'home.title')}</span>`;
    interceptor.init();
    interceptor.setEditMode(true);

    document.querySelector('span')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const overlay = document.getElementById('livelocale-highlighter-overlay')!;
    expect(overlay.style.opacity).not.toBe('1');
  });

  describe('picked-text marker', () => {
    const PICKED = 'data-livelocale-picked';
    const twoKeys = () => {
      document.body.innerHTML = `<h1>${encodeKey('Hello', 'home.title')}</h1><a href="/next"><span>${encodeKey('Get started', 'hero.cta')}</span></a>`;
      return {
        title: document.querySelector('h1')!,
        cta: document.querySelector('span')!,
      };
    };
    const picked = () => Array.from(document.querySelectorAll(`[${PICKED}]`));

    it('a tap in edit mode marks the keyed element, with an amber outline on a dark ring', () => {
      const { cta } = twoKeys();
      interceptor.init();
      interceptor.setEditMode(true);

      click(cta);

      expect(picked()).toEqual([cta]);
      const css = document.getElementById('livelocale-edit-style')!.textContent!;
      // The dark ring under the amber keeps the marker visible on a light site, the amber on a dark one.
      expect(css).toContain(
        `html[data-livelocale-edit] [data-i18n-key][${PICKED}]{outline:2px solid #FFB224;outline-offset:3px;box-shadow:0 0 0 3px #0C0D0F}`
      );
    });

    it('a new pick moves the marker', () => {
      const { title, cta } = twoKeys();
      interceptor.init();
      interceptor.setEditMode(true);

      click(cta);
      click(title);

      expect(picked()).toEqual([title]);
    });

    it('selectKey (SELECT_KEY, Next missing) marks the element it selects', () => {
      const { title, cta } = twoKeys();
      layout(title, { top: 0, height: 20 }, true);
      layout(cta, { top: 40, height: 20 }, true);
      interceptor.init();
      interceptor.setEditMode(true);
      click(title);

      expect(interceptor.selectKey('hero.cta')).toBe(true);

      expect(picked()).toEqual([cta]);
    });

    it('CLEAR_SELECTION (destroy + init) clears the marker and keeps edit mode', () => {
      const { cta } = twoKeys();
      interceptor.init();
      interceptor.setEditMode(true);
      click(cta);

      interceptor.destroy();
      interceptor.init();

      expect(picked()).toEqual([]);
      expect(document.documentElement.hasAttribute('data-livelocale-edit')).toBe(true);
    });

    it('turning edit mode off clears the marker', () => {
      const { cta } = twoKeys();
      interceptor.init();
      interceptor.setEditMode(true);
      click(cta);

      interceptor.setEditMode(false);

      expect(picked()).toEqual([]);
    });

    it('a tap on unkeyed text leaves the current marker alone', () => {
      const { cta } = twoKeys();
      document.body.insertAdjacentHTML('beforeend', '<p>Plain text</p>');
      interceptor.init();
      interceptor.setEditMode(true);
      click(cta);

      click(document.querySelector('p')!);

      expect(picked()).toEqual([cta]);
    });

    it('Alt+Click outside edit mode never marks anything', () => {
      const { cta } = twoKeys();
      layout(cta, { top: 40, height: 20 }, true);
      interceptor.init();

      click(cta, { altKey: true });
      expect(onElementSelected).toHaveBeenCalledWith(expect.objectContaining({ key: 'hero.cta' }));
      expect(interceptor.selectKey('hero.cta')).toBe(true);

      expect(picked()).toEqual([]);
    });
  });

  it('Browse: Alt+Click on text without a key says so and does not reach the site', () => {
    document.body.innerHTML = '<a href="/file.pdf">Download the <b>price list</b></a>';
    const anchorListener = vi.fn();
    document.querySelector('a')!.addEventListener('click', anchorListener);
    interceptor.init();

    const event = click(document.querySelector('b')!, { altKey: true });

    expect(onUnkeyedTap).toHaveBeenCalledTimes(1);
    expect(onElementSelected).not.toHaveBeenCalled();
    // Alt+Click on a link would otherwise download its target in Chrome.
    expect(event.defaultPrevented).toBe(true);
    expect(anchorListener).not.toHaveBeenCalled();
  });

  it('Browse: Alt+Click on keyed text still selects it, with no notice', () => {
    document.body.innerHTML = `<p>${encodeKey('Welcome', 'home.title')}</p>`;
    interceptor.init();

    click(document.querySelector('p')!, { altKey: true });

    expect(onElementSelected).toHaveBeenCalledWith(expect.objectContaining({ key: 'home.title' }));
    expect(onUnkeyedTap).not.toHaveBeenCalled();
  });

  it('Browse: a plain click on text without a key is left to the site', () => {
    document.body.innerHTML = '<p>Plain text</p>';
    interceptor.init();

    const event = click(document.querySelector('p')!);

    expect(onUnkeyedTap).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('Browse: Alt+Click on an image without text is cancelled but says nothing', () => {
    document.body.innerHTML = '<a href="/next"><img alt="" src="logo.png"></a>';
    interceptor.init();

    const event = click(document.querySelector('img')!, { altKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onUnkeyedTap).not.toHaveBeenCalled();
  });
});

describe('IframeBridge edit-mode messages', () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  let parent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    parent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: parent, configurable: true, writable: true });
  });

  afterEach(() => {
    if (originalParent) Object.defineProperty(window, 'parent', originalParent);
  });

  const sent = () => parent.postMessage.mock.calls.map(([m]) => m);

  it('READY carries the url and the sanitized features', () => {
    const bridge = new IframeBridge('http://localhost:3010');
    bridge.sendToParent('READY', { url: '/a', features: ['edit-mode', 'Bad Feature', 42] });
    bridge.sendToParent('READY', { url: '//evil.com', features: ['edit-mode'] });
    bridge.sendToParent('READY', { url: '/b' });
    expect(sent().map((m) => m.payload)).toEqual([
      { url: '/a', features: ['edit-mode'] },
      { features: ['edit-mode'] },
      { url: '/b' },
    ]);
  });

  it('LOCATION_CHANGED never carries features', () => {
    const bridge = new IframeBridge('http://localhost:3010');
    bridge.sendToParent('LOCATION_CHANGED', { url: '/a', features: ['edit-mode'] });
    expect(sent()[0].payload).toEqual({ url: '/a' });
  });

  it('RENDERED_KEYS_CHANGED keeps only valid keys and drops non-arrays', () => {
    const bridge = new IframeBridge('http://localhost:3010');
    bridge.sendToParent('RENDERED_KEYS_CHANGED', ['home.title', 'bad/key', 7, 'nav.pricing']);
    bridge.sendToParent('RENDERED_KEYS_CHANGED', 'home.title');
    expect(sent()).toEqual([
      {
        source: 'livelocale-client',
        type: 'RENDERED_KEYS_CHANGED',
        payload: ['home.title', 'nav.pricing'],
      },
    ]);
  });

  it('TAP_UNKEYED carries no payload', () => {
    const bridge = new IframeBridge('http://localhost:3010');
    bridge.sendToParent('TAP_UNKEYED', { leak: 'x' });
    expect(sent()).toEqual([
      { source: 'livelocale-client', type: 'TAP_UNKEYED', payload: undefined },
    ]);
  });
});
