// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DOMInterceptor } from '../../src/client/dom-interceptor.js';
import { encodeKey } from '../../src/client/watermark.js';

/**
 * Astro keeps template whitespace and literal text in the same text node as a
 * translation, so the watermark is often not the first character of the node.
 */
describe('DOMInterceptor with a watermark inside a text node', () => {
  let onElementSelected: ReturnType<typeof vi.fn>;
  let interceptor: DOMInterceptor;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    onElementSelected = vi.fn();
    interceptor = new DOMInterceptor(onElementSelected);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    interceptor.destroy();
    vi.unstubAllEnvs();
  });

  function altClick(el: Element): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
  }

  it('keys a headline whose text starts with template whitespace', () => {
    const h1 = document.createElement('h1');
    h1.append(
      document.createTextNode(
        '\n  ' + encodeKey('Advanced video protection', 'home.hero.title') + '\n  '
      ),
      Object.assign(document.createElement('span'), { textContent: '_' })
    );
    document.body.appendChild(h1);
    interceptor.init();

    expect(h1.getAttribute('data-i18n-key')).toBe('home.hero.title');
    expect(h1.getAttribute('data-i18n-template')).toBe('Advanced video protection');
    expect(interceptor.getVisibleTexts()).toEqual([
      { key: 'home.hero.title', text: 'Advanced video protection' },
    ]);

    altClick(h1);
    expect(onElementSelected).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'home.hero.title' })
    );
  });

  it('keys a breadcrumb whose translation follows a link and " / "', () => {
    const nav = document.createElement('nav');
    const home = document.createElement('a');
    home.textContent = encodeKey('HOME', 'nav.home');
    nav.append(home, document.createTextNode(' / ' + encodeKey('ABOUT', 'about.crumb')));
    document.body.appendChild(nav);
    interceptor.init();

    expect(home.getAttribute('data-i18n-key')).toBe('nav.home');
    expect(nav.getAttribute('data-i18n-key')).toBe('about.crumb');
    expect(nav.getAttribute('data-i18n-template')).toBe('ABOUT');
    expect(interceptor.getActiveKeys().sort()).toEqual(['about.crumb', 'nav.home']);

    // innerText would be "HOME / ABOUT": only the crumb's own text is its value.
    Object.defineProperty(nav, 'innerText', { get: () => nav.textContent, configurable: true });
    altClick(nav);
    expect(onElementSelected).toHaveBeenCalledWith({
      key: 'about.crumb',
      fallbackValue: 'ABOUT',
      currentValue: 'ABOUT',
    });
  });

  it('keys a footer line with a literal "© 2026 " before the translation', () => {
    const p = document.createElement('p');
    p.textContent = '© 2026 ' + encodeKey('Wolvy. All rights reserved.', 'footer.copyright');
    document.body.appendChild(p);
    interceptor.init();

    expect(p.getAttribute('data-i18n-key')).toBe('footer.copyright');
    expect(interceptor.getVisibleTexts()).toEqual([
      { key: 'footer.copyright', text: 'Wolvy. All rights reserved.' },
    ]);
    Object.defineProperty(p, 'innerText', { get: () => p.textContent, configurable: true });
    altClick(p);
    expect(onElementSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'footer.copyright',
        currentValue: 'Wolvy. All rights reserved.',
      })
    );
  });

  it('keys a node holding two translations by the first, with only its own text', () => {
    const p = document.createElement('p');
    p.textContent =
      encodeKey('Terms', 'footer.terms') + ' · ' + encodeKey('Privacy', 'footer.privacy');
    document.body.appendChild(p);
    interceptor.init();

    expect(p.getAttribute('data-i18n-key')).toBe('footer.terms');
    expect(p.getAttribute('data-i18n-template')).toBe('Terms ·');
    Object.defineProperty(p, 'innerText', { get: () => p.textContent, configurable: true });
    altClick(p);
    expect(onElementSelected).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'footer.terms', currentValue: 'Terms ·' })
    );
  });

  it('keys text added later with a literal prefix, through the observer', async () => {
    interceptor.init();
    const li = document.createElement('li');
    li.textContent = ' / ' + encodeKey('Pricing', 'nav.pricing');
    document.body.appendChild(li);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(li.getAttribute('data-i18n-key')).toBe('nav.pricing');
  });

  it('sends the whole rich text of an element the watermark starts', () => {
    const p = document.createElement('p');
    p.innerHTML =
      encodeKey('Wolvy encrypts so ', 'home.hero.sub') + '<strong>only you</strong> can watch.';
    document.body.appendChild(p);
    interceptor.init();
    Object.defineProperty(p, 'innerText', { get: () => p.textContent, configurable: true });
    altClick(p);
    expect(onElementSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'home.hero.sub',
        currentValue: 'Wolvy encrypts so only you can watch.',
      })
    );
  });

  it('never keys a script holding watermarked JSON', () => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({ description: encodeKey('About', 'meta.description') });
    document.body.appendChild(script);
    interceptor.init();
    expect(script.hasAttribute('data-i18n-key')).toBe(false);
  });
});
