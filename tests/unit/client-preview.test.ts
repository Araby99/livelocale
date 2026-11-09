// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  applyPreview,
  commitPreview,
  forgetPreviews,
  restorePreviews,
  sanitizeMarkup,
} from '../../src/client/preview.js';
import { encodeKey, removeWatermarks } from '../../src/client/watermark.js';

const shown = (el: Element) => removeWatermarks(el.textContent ?? '');

describe('live preview', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    forgetPreviews();
  });

  describe('text', () => {
    it('replaces a translation that starts its node, keeping the watermark', () => {
      const h1 = document.createElement('h1');
      h1.textContent = encodeKey('Hello', 'home.title');
      document.body.appendChild(h1);
      const before = h1.textContent;

      applyPreview('home.title', 'Bonjour');
      expect(shown(h1)).toBe('Bonjour');
      expect(h1.textContent).toBe(encodeKey('Bonjour', 'home.title'));

      restorePreviews();
      expect(h1.textContent).toBe(before);
    });

    it('keeps template whitespace around the translation', () => {
      const h1 = document.createElement('h1');
      const text = document.createTextNode(
        '\n  ' + encodeKey('Advanced', 'home.hero.title') + '\n  '
      );
      const span = document.createElement('span');
      span.textContent = '_';
      h1.append(text, span);
      document.body.appendChild(h1);

      applyPreview('home.hero.title', 'حماية');
      expect(text.nodeValue).toBe('\n  ' + encodeKey('حماية', 'home.hero.title') + '\n  ');
      expect(h1.lastChild).toBe(span);

      restorePreviews();
      expect(text.nodeValue).toBe('\n  ' + encodeKey('Advanced', 'home.hero.title') + '\n  ');
    });

    it('keeps the " / " of a breadcrumb and the link before it', () => {
      const nav = document.createElement('nav');
      const home = document.createElement('a');
      home.textContent = encodeKey('HOME', 'nav.home');
      nav.append(home, document.createTextNode(' / ' + encodeKey('ABOUT', 'about.crumb')));
      document.body.appendChild(nav);

      applyPreview('about.crumb', 'من نحن');
      expect(shown(nav)).toBe('HOME / من نحن');
      applyPreview('about.crumb', 'عنا');
      expect(shown(nav)).toBe('HOME / عنا');
      restorePreviews();
      expect(shown(nav)).toBe('HOME / ABOUT');
    });

    it('keeps "© 2026 " before a footer translation', () => {
      const p = document.createElement('p');
      p.textContent = '© 2026 ' + encodeKey('Wolvy.', 'footer.copyright');
      document.body.appendChild(p);

      applyPreview('footer.copyright', 'وولفي.');
      expect(shown(p)).toBe('© 2026 وولفي.');
      restorePreviews();
      expect(shown(p)).toBe('© 2026 Wolvy.');
    });

    it('replaces only its own translation in a node with two, and never corrupts the other', () => {
      const p = document.createElement('p');
      const second = encodeKey('Privacy', 'footer.privacy');
      p.textContent = encodeKey('Terms', 'footer.terms') + ' · ' + second;
      document.body.appendChild(p);

      // With the stored value, the literal " · " after it is known to be the page's.
      applyPreview('footer.terms', 'Conditions', 'Terms');
      expect(shown(p)).toBe('Conditions · Privacy');
      expect(p.textContent!.endsWith(second)).toBe(true);

      applyPreview('footer.privacy', 'Confidentialité', 'Privacy');
      expect(shown(p)).toBe('Conditions · Confidentialité');
      expect(p.textContent!.startsWith(encodeKey('Conditions', 'footer.terms'))).toBe(true);

      restorePreviews();
      expect(p.textContent).toBe(encodeKey('Terms', 'footer.terms') + ' · ' + second);
    });

    it('without the stored value, keeps the other translation and the trailing whitespace', () => {
      const p = document.createElement('p');
      const second = encodeKey('Privacy', 'footer.privacy');
      p.textContent = encodeKey('Terms', 'footer.terms') + ' · \n' + second;
      document.body.appendChild(p);
      applyPreview('footer.terms', 'Conditions');
      expect(p.textContent).toBe(encodeKey('Conditions', 'footer.terms') + ' \n' + second);
    });

    it('shows a value with markup as text in an element that renders text', () => {
      const h1 = document.createElement('h1');
      h1.textContent = encodeKey('Hello', 'home.title');
      document.body.appendChild(h1);
      applyPreview('home.title', '<b>Hi</b>', 'Hello');
      expect(shown(h1)).toBe('<b>Hi</b>');
      expect(h1.querySelector('b')).toBeNull();
    });

    it('does not mutate the page when the same value is sent again', async () => {
      const h1 = document.createElement('h1');
      h1.textContent = encodeKey('Hello', 'home.title');
      document.body.appendChild(h1);
      commitPreview('home.title', 'Bonjour');

      const seen: MutationRecord[] = [];
      const observer = new MutationObserver((records) => seen.push(...records));
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      commitPreview('home.title', 'Bonjour');
      await Promise.resolve();
      observer.disconnect();
      expect(seen).toEqual([]);
    });

    it('keeps a committed value when the selection is cleared', () => {
      const p = document.createElement('p');
      p.textContent = '© 2026 ' + encodeKey('Wolvy.', 'footer.copyright');
      document.body.appendChild(p);
      commitPreview('footer.copyright', 'وولفي.');
      restorePreviews();
      expect(shown(p)).toBe('© 2026 وولفي.');
    });
  });

  describe('rich text', () => {
    const source =
      'Wolvy encrypts, hosts and streams your videos so <strong>only your audience</strong> can watch.';

    function richParagraph(): HTMLParagraphElement {
      // What `<p set:html={t.hero.sub} />` renders from a watermarked value.
      const p = document.createElement('p');
      p.innerHTML = encodeKey(source, 'home.hero.sub');
      document.body.appendChild(p);
      return p;
    }

    it('previews the value as markup and drops the old text after the <strong>', () => {
      const p = richParagraph();
      applyPreview(
        'home.hero.sub',
        'وولفي يشفر فيديوهاتك حتى <strong>جمهورك فقط</strong> يشاهد.',
        source
      );
      expect(shown(p)).toBe('وولفي يشفر فيديوهاتك حتى جمهورك فقط يشاهد.');
      expect(p.querySelectorAll('strong')).toHaveLength(1);
      expect(p.querySelector('strong')!.textContent).toBe('جمهورك فقط');
      expect(p.textContent).not.toContain('<strong>');
      expect(p.textContent).not.toContain('can watch');
      // The watermark stays in the first text node, so the element stays pickable.
      expect(p.firstChild!.nodeValue!.startsWith(encodeKey('', 'home.hero.sub'))).toBe(true);
    });

    it('restores the original nodes exactly', () => {
      const p = richParagraph();
      const originalNodes = Array.from(p.childNodes);
      const originalHtml = p.innerHTML;

      applyPreview('home.hero.sub', 'A <em>new</em> line', source);
      applyPreview('home.hero.sub', 'A <em>newer</em> line', source);
      applyPreview('home.hero.sub', 'Plain now', source);
      expect(shown(p)).toBe('Plain now');
      expect(p.querySelector('strong')).toBeNull();

      restorePreviews();
      expect(p.innerHTML).toBe(originalHtml);
      expect(Array.from(p.childNodes)).toEqual(originalNodes);
      originalNodes.forEach((node, i) => expect(p.childNodes[i]).toBe(node));
    });

    it('finds the rich extent from the typed markup when the Studio sends no stored value', () => {
      const p = richParagraph();
      commitPreview('home.hero.sub', 'Only <strong>you</strong>.');
      expect(shown(p)).toBe('Only you.');
      expect(p.querySelector('strong')!.textContent).toBe('you');
    });

    it('keeps a committed rich value and causes no mutation when it is sent again', async () => {
      const p = richParagraph();
      commitPreview('home.hero.sub', 'Only <strong>you</strong>.', source);
      restorePreviews();
      expect(shown(p)).toBe('Only you.');

      const seen: MutationRecord[] = [];
      const observer = new MutationObserver((records) => seen.push(...records));
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      commitPreview('home.hero.sub', 'Only <strong>you</strong>.', 'Only <strong>you</strong>.');
      await Promise.resolve();
      observer.disconnect();
      expect(seen).toEqual([]);
    });

    it('never swallows a sibling that holds another translation', () => {
      const p = document.createElement('p');
      p.innerHTML =
        encodeKey('Read the ', 'a.lead') + '<a href="/x">' + encodeKey('guide', 'a.link') + '</a>';
      document.body.appendChild(p);
      applyPreview('a.lead', 'Lisez <b>le</b> ', 'Read the ');
      expect(p.querySelector('a')!.textContent).toBe(encodeKey('guide', 'a.link'));
      // Shown as text: the element is not one rich value.
      expect(shown(p)).toBe('Lisez <b>le</b> guide');
    });

    it('never runs scripts or keeps event handlers, styles or javascript: links', () => {
      const p = richParagraph();
      (window as any).__pwned = false;
      applyPreview(
        'home.hero.sub',
        'x <img src=x onerror="window.__pwned=true"><script>window.__pwned=true</script>' +
          '<strong onclick="window.__pwned=true" style="color:red">y</strong>' +
          '<a href="javascript:alert(1)">bad</a><a href=" java\tscript:alert(1)">bad2</a>' +
          '<a href="https://wolvy.net/" target="_blank">good</a><a href="/ar/pricing/">rel</a>',
        source
      );
      expect((window as any).__pwned).toBe(false);
      expect(p.querySelector('script, img, style, [onclick], [onerror], [style]')).toBeNull();
      const links = Array.from(p.querySelectorAll('a'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        null,
        null,
        'https://wolvy.net/',
        '/ar/pricing/',
      ]);
      expect(links[2]!.getAttribute('rel')).toBe('noopener noreferrer');
      expect(shown(p)).toBe('x ybadbad2goodrel');
    });
  });

  describe('framework and literal siblings', () => {
    function label(): { label: HTMLLabelElement; star: HTMLSpanElement } {
      // `<label>{t('f.name')} <span>*</span></label>`: a plain value and the page's own marker.
      const el = document.createElement('label');
      const star = document.createElement('span');
      star.textContent = '*';
      el.append(document.createTextNode(encodeKey('Name', 'f.name') + ' '), star);
      document.body.appendChild(el);
      return { label: el, star };
    }

    it('shows typed tags as text when the stored value is plain, keeping a literal sibling', () => {
      const { label: el, star } = label();
      applyPreview('f.name', 'Press <Enter>', 'Name');
      expect(star.isConnected).toBe(true);
      expect(shown(el)).toBe('Press <Enter> *');
      applyPreview('f.name', '<b>Full name</b>', 'Name');
      expect(el.querySelector('b')).toBeNull();
      expect(star.isConnected).toBe(true);
    });

    it('never detaches a literal sibling on commit', () => {
      const { label: el, star } = label();
      commitPreview('f.name', '<b>Full name</b>', 'Name');
      restorePreviews();
      expect(star.isConnected).toBe(true);
      expect(shown(el)).toBe('<b>Full name</b> *');
    });

    it('keeps the template whitespace and cursor span of a headline when tags are typed', () => {
      const h1 = document.createElement('h1');
      const span = document.createElement('span');
      span.textContent = '_';
      h1.append(
        document.createTextNode('\n  ' + encodeKey('Advanced', 'home.hero.title') + '\n  '),
        span
      );
      document.body.appendChild(h1);
      applyPreview('home.hero.title', '<b>x</b>', 'Advanced');
      expect(span.isConnected).toBe(true);
      expect(h1.firstChild!.nodeValue).toBe(
        '\n  ' + encodeKey('<b>x</b>', 'home.hero.title') + '\n  '
      );
    });

    it('never takes out the link of a next-intl t.rich message (custom tag in the source)', () => {
      const p = document.createElement('p');
      const a = document.createElement('a');
      a.href = '/terms';
      a.textContent = 'terms';
      p.append(document.createTextNode(encodeKey('Accept the ', 'k')), a);
      document.body.appendChild(p);

      applyPreview('k', 'Accept the <link>conditions</link>', 'Accept the <link>terms</link>');
      expect(a.isConnected).toBe(true);
      commitPreview('k', 'Accept the <link>conditions</link>', 'Accept the <link>terms</link>');
      restorePreviews();
      expect(a.isConnected).toBe(true);
      expect(p.lastChild).toBe(a);
    });

    it('never takes out nodes React rendered, even when the tags are allowed', () => {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = 'terms';
      // What React leaves on the nodes it renders (t.rich with a `b` tag).
      (b as any)['__reactFiber$abc123'] = {};
      p.append(document.createTextNode(encodeKey('Accept the ', 'k')), b);
      document.body.appendChild(p);

      commitPreview('k', 'Accept the <b>conditions</b>', 'Accept the <b>terms</b>');
      expect(b.isConnected).toBe(true);
      expect(p.querySelectorAll('b')).toHaveLength(1);
    });

    it('keeps the separators of a two-translation node when values are re-sent without a source', () => {
      const p = document.createElement('p');
      p.textContent = encodeKey('Terms', 'f.t') + ' · ' + encodeKey('Privacy', 'f.p') + ' →';
      document.body.appendChild(p);

      commitPreview('f.t', 'T2', 'Terms');
      commitPreview('f.p', 'P2', 'Privacy');
      expect(shown(p)).toBe('T2 · P2 →');
      // A re-send after a navigation, or an undo, with no stored value.
      commitPreview('f.t', 'T3');
      commitPreview('f.p', 'P3');
      expect(shown(p)).toBe('T3 · P3 →');
      commitPreview('f.t', 'T3');
      expect(shown(p)).toBe('T3 · P3 →');
    });
  });

  describe('sanitizeMarkup', () => {
    it('unwraps tags outside the allow-list and keeps their text', () => {
      const nodes = sanitizeMarkup('<div class="c"><strong class="k">a</strong><h2>b</h2></div>');
      const holder = document.createElement('div');
      holder.append(...nodes);
      expect(holder.innerHTML).toBe('<strong class="k">a</strong>b');
    });
  });
});
