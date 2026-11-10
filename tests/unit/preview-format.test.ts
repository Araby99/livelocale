// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { formatPreview } from '../../src/client/preview-format.js';
import {
  applyPreview,
  commitPreview,
  forgetPreviews,
  restorePreview,
  restorePreviews,
} from '../../src/client/preview.js';
import { encodeKey, removeWatermarks } from '../../src/client/watermark.js';

const PLURAL = 'Time tracking for {count, plural, one {# person} other {# people}}';
const SEATS = 'Time tracking for {count, plural, one {# seat} other {# seats}}';

/** The typed value filled from `shown`, matched against `source`. */
const fill = (value: string, source: string | undefined, shown: string) =>
  formatPreview(value, [source], shown).value;

afterEach(() => {
  document.documentElement.lang = '';
});

describe('formatPreview', () => {
  it('leaves messages without arguments alone', () => {
    expect(formatPreview('Hello', ['Hi'], 'Hi')).toEqual({ value: 'Hello', source: 'Hi' });
  });

  it('fills a simple argument with the value the page shows', () => {
    expect(
      formatPreview(
        '© {year} Tidewell Ltd.',
        ['© {year} Tidewell Labs Inc.'],
        '© 2026 Tidewell Labs Inc.'
      )
    ).toEqual({ value: '© 2026 Tidewell Ltd.', source: '© 2026 Tidewell Labs Inc.' });
  });

  it('fills i18next {{name}} arguments, with apostrophes as plain text', () => {
    expect(fill('Bonjour {{name}} !', 'Hello {{name}}!', 'Hello Ada!')).toBe('Bonjour Ada !');
    expect(
      fill("Projet '{{name}}' supprimé", "Project '{{name}}' deleted", "Project 'Apollo' deleted")
    ).toBe("Projet 'Apollo' supprimé");
  });

  it('reads ICU arguments written with spaces inside the braces', () => {
    expect(fill('Hi { name }', 'Hello { name }', 'Hello Ada')).toBe('Hi Ada');
  });

  it('picks the plural branch for the count the page shows', () => {
    expect(fill(SEATS, PLURAL, 'Time tracking for 5 people')).toBe('Time tracking for 5 seats');
    expect(fill(SEATS, PLURAL, 'Time tracking for 1 person')).toBe('Time tracking for 1 seat');
  });

  it('uses the page language plural rules and exact branches', () => {
    document.documentElement.lang = 'ar';
    const typed = '{n, plural, =0 {لا عناصر} one {عنصر} two {عنصران} few {# عناصر} other {# عنصر}}';
    const source = '{n, plural, one {# item} other {# items}}';
    expect(fill(typed, source, '3 items')).toBe('3 عناصر');
    expect(fill(typed, source, '11 items')).toBe('11 عنصر');
    expect(fill(typed, source, '0 items')).toBe('لا عناصر');
  });

  it('takes the count from an exact branch the page showed without a number', () => {
    const source = '{n, plural, =0 {No items} one {# item} other {# items}}';
    expect(fill('{n, plural, one {# article} other {# articles}}', source, 'No items')).toBe(
      '0 articles'
    );
  });

  it('adds the offset back to the count the page shows', () => {
    const src =
      '{n, plural, offset:1 =0 {nobody} =1 {only you} one {you and # other} other {you and # others}}';
    expect(fill(src, src, 'you and 2 others')).toBe('you and 2 others');
    expect(fill('{n, plural, one {# guest} other {# guests}}', src, 'you and 2 others')).toBe(
      '3 guests'
    );
  });

  it('reads a decimal comma in languages that write one', () => {
    document.documentElement.lang = 'fr';
    const typed = '{n, plural, one {# kilogramme} other {# kilogrammes}}';
    expect(fill(typed, '{n, plural, one {# kilo} other {# kilos}}', '1,5 kilo')).toBe(
      '1,5 kilogramme'
    );
  });

  it('reads the Arabic decimal mark', () => {
    document.documentElement.lang = 'ar';
    const typed = '{n, plural, one {# o} two {# t} few {# f} many {# m} other {# x}}';
    expect(fill(typed, typed, '١٫٥ x')).toBe('١٫٥ x');
  });

  it('keeps the branch the page showed when the count is not on the page', () => {
    const source = '{count, plural, one {One item} other {# items}}';
    const typed = '{count, plural, one {Un article} other {# articles}}';
    expect(fill(typed, source, 'One item')).toBe('Un article');
  });

  it('keeps the select branch the page showed', () => {
    const source = '{g, select, female {She replied} male {He replied} other {They replied}}';
    const typed = '{g, select, female {Elle a répondu} male {Il a répondu} other {Réponse}}';
    expect(fill(typed, source, 'He replied')).toBe('Il a répondu');
  });

  it('stops a last argument before page text that follows it', () => {
    expect(fill('{email} kontaktieren', 'Contact {email}', 'Contact a@b.com · Privacy')).toBe(
      'a@b.com kontaktieren'
    );
  });

  it('tries each message the page may show, in order', () => {
    // The stored value is stale: the page already shows the value saved here.
    expect(formatPreview(SEATS, [PLURAL, SEATS], 'Time tracking for 5 seats')).toEqual({
      value: 'Time tracking for 5 seats',
      source: 'Time tracking for 5 seats',
    });
  });

  it('shows an argument it cannot recover as written', () => {
    expect(fill('Hi {name}', undefined, 'Hello')).toBe('Hi {name}');
    expect(fill('{n, plural, one {# day} other {# days}}', 'Soon', 'Soon')).toBe('# days');
  });

  it('returns a malformed message unchanged', () => {
    expect(fill('Hi {name', '{name}', 'Ada')).toBe('Hi {name');
  });

  it('reads Arabic-Indic digits as the count', () => {
    document.documentElement.lang = 'en';
    const source = '{n, plural, one {# item} other {# items}}';
    expect(fill('{n, plural, one {# thing} other {# things}}', source, '٥ items')).toBe('٥ things');
  });

  it('renders the matched message with the branch the page showed, whatever <html lang> says', () => {
    document.documentElement.lang = 'en';
    const source = '{n, plural, one {# товар} few {# товара} many {# товаров} other {# товара}}';
    const typed =
      '{n, plural, one {# продукт} few {# продукта} many {# продуктов} other {# продукта}}';
    expect(formatPreview(typed, [source], '5 товаров')).toEqual({
      value: '5 продуктов',
      source: '5 товаров',
    });
  });

  it('uses the page language for a missing translation shown in its English fallback', () => {
    const english = '{n, plural, one {# item} other {# items}}';
    document.documentElement.lang = 'fr';
    expect(fill('{n, plural, one {# article} other {# articles}}', english, '0 items')).toBe(
      '0 article'
    );
    document.documentElement.lang = 'ru';
    const typed = '{n, plural, one {# товар} few {# товара} many {# товаров} other {# товара}}';
    expect(fill(typed, english, '21 items')).toBe('21 товар');
  });

  it('takes an exact =N branch of the typed message first', () => {
    document.documentElement.lang = 'en';
    expect(
      fill(
        '{n, plural, =3 {ثلاثة} few {# عناصر} other {# عنصر}}',
        '{n, plural, zero {لا} one {عنصر} two {عنصران} few {# عناصر} many {# عنصرًا} other {# عنصر}}',
        '3 عناصر'
      )
    ).toBe('ثلاثة');
  });

  it('reads the Swiss group mark', () => {
    document.documentElement.lang = 'de-CH';
    expect(
      fill(
        '{n, plural, one {# Artikel} other {# Artikel gesamt}}',
        '{n, plural, one {# item} other {# items}}',
        '1’234 items'
      )
    ).toBe('1’234 Artikel gesamt');
  });

  it('stays fast on deeply nested choices', () => {
    let message = '{g0, select, a {x} other {y}}';
    for (let d = 1; d <= 4; d++) {
      message = `{g${d}, select, a {${Array(4).fill(message).join(' ')}} other {z}}`;
    }
    const start = performance.now();
    fill(message, message, 'nothing');
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('stays fast on page text that does not match a message with many arguments', () => {
    const src = Array.from({ length: 10 }, (_, i) => `{a${i}}`).join(' ') + ' end.';
    const shown = Array.from({ length: 1000 }, () => 'w').join(' ');
    const start = performance.now();
    fill(src, src, shown);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe('live preview of a message with arguments', () => {
  afterEach(() => {
    forgetPreviews();
    document.body.innerHTML = '';
  });

  it('shows the typed plural with the page count, never the raw message', () => {
    const p = document.createElement('p');
    p.textContent = encodeKey('Time tracking for 5 people', 'plans.f2');
    document.body.appendChild(p);
    const before = p.textContent;

    applyPreview('plans.f2', SEATS, PLURAL);
    expect(removeWatermarks(p.textContent ?? '')).toBe('Time tracking for 5 seats');

    restorePreviews();
    expect(p.textContent).toBe(before);
  });

  it('keeps a saved plural right when the Studio sends it again with the older value', () => {
    const p = document.createElement('p');
    p.textContent = encodeKey('Time tracking for 5 people', 'k');
    document.body.appendChild(p);

    commitPreview('k', SEATS, PLURAL);
    expect(removeWatermarks(p.textContent ?? '')).toBe('Time tracking for 5 seats');
    commitPreview('k', SEATS, PLURAL);
    expect(removeWatermarks(p.textContent ?? '')).toBe('Time tracking for 5 seats');
  });

  it('does not repeat the end of a saved value each time the Studio sends it again', () => {
    const p = document.createElement('p');
    p.textContent = encodeKey('© 2026 Acme', 'k');
    document.body.appendChild(p);

    for (let i = 0; i < 4; i++) commitPreview('k', '© {year} Acme Inc.', '© {year} Acme');
    expect(removeWatermarks(p.textContent ?? '')).toBe('© 2026 Acme Inc.');
  });

  it('reads a node the app rendered again with the stored value, not the saved one', () => {
    const first = document.createElement('p');
    first.textContent = encodeKey('Hello Ada!', 'k');
    document.body.appendChild(first);
    commitPreview('k', 'Hello {name}', 'Hello {name}!');
    expect(removeWatermarks(first.textContent ?? '')).toBe('Hello Ada');

    // A client-side navigation renders a new node with the stored value.
    first.remove();
    const again = document.createElement('p');
    again.textContent = encodeKey('Hello Ada!', 'k') + ' Welcome back';
    document.body.appendChild(again);
    commitPreview('k', 'Hello {name}', 'Hello {name}!');
    expect(removeWatermarks(again.textContent ?? '')).toBe('Hello Ada Welcome back');
  });

  it('keeps page text after the translation while the typed value has no argument yet', () => {
    const p = document.createElement('p');
    p.textContent = encodeKey('© 2026 Acme', 'k') + ' · Privacy';
    document.body.appendChild(p);

    applyPreview('k', 'Copyright Acme', '© {year} Acme');
    expect(removeWatermarks(p.textContent ?? '')).toBe('Copyright Acme · Privacy');
    applyPreview('k', '© {year', '© {year} Acme');
    expect(removeWatermarks(p.textContent ?? '')).toBe('© {year · Privacy');
  });

  it('keeps reading a held node after a second save and after an undo', () => {
    const p = document.createElement('p');
    p.textContent = encodeKey('© 2026 Acme', 'a') + ' · ' + encodeKey('Privacy', 'b');
    document.body.appendChild(p);

    applyPreview('b', 'Datenschutz', 'Privacy');
    commitPreview('a', '© {year} Acme Inc.', '© {year} Acme');
    commitPreview('a', '© {year} Acme Ltd', '© {year} Acme Inc.');
    restorePreview('b');
    expect(removeWatermarks(p.textContent ?? '')).toBe('© 2026 Acme Ltd · Privacy');

    // Undo: the Studio sends the old value with the last saved one as its source.
    commitPreview('a', '© {year} Acme', '© {year} Acme Ltd');
    restorePreviews();
    expect(removeWatermarks(p.textContent ?? '')).toBe('© 2026 Acme · Privacy');
  });

  it('keeps the separator after a plain value saved twice on a held node', () => {
    const p = document.createElement('p');
    p.textContent = encodeKey('Terms', 'a') + ' · ' + encodeKey('Privacy', 'b');
    document.body.appendChild(p);

    applyPreview('b', 'Datenschutz', 'Privacy');
    commitPreview('a', 'AGB', 'Terms');
    commitPreview('a', 'Bedingungen', 'AGB');
    expect(removeWatermarks(p.textContent ?? '')).toBe('Bedingungen · Datenschutz');
    restorePreview('b');
    expect(removeWatermarks(p.textContent ?? '')).toBe('Bedingungen · Privacy');
  });

  it('keeps what a save left in a node that survives a body swap', () => {
    const footer = document.createElement('footer');
    footer.textContent = encodeKey('© 2026 Acme', 'footer.copy');
    document.body.appendChild(footer);
    commitPreview('footer.copy', '© {year} Acme Inc.', '© {year} Acme');

    // Astro's transition:persist moves the element, Text node and all, into the new body.
    for (let i = 0; i < 3; i++) {
      const body = document.createElement('body');
      body.appendChild(footer);
      document.documentElement.replaceChild(body, document.body);
      forgetPreviews();
      commitPreview('footer.copy', '© {year} Acme Inc.', '© {year} Acme');
    }
    expect(removeWatermarks(footer.textContent ?? '')).toBe('© 2026 Acme Inc.');
  });

  it('shows a rich draft with no stored value as markup, its argument as written', () => {
    const p = document.createElement('p');
    p.append(encodeKey('Hi ', 'h'));
    const b = document.createElement('b');
    b.textContent = 'Alice';
    p.append(b);
    document.body.appendChild(p);

    applyPreview('h', 'Hi <b>{name}</b>');
    expect(removeWatermarks(p.innerHTML)).toBe('Hi <b>{name}</b>');
  });

  it('keeps page text after a filled translation in the same node', () => {
    const p = document.createElement('p');
    p.textContent = encodeKey('© 2026 Tidewell Labs Inc.', 'footer.copyright') + ' · Privacy';
    document.body.appendChild(p);

    applyPreview('footer.copyright', '© {year} Tidewell GmbH', '© {year} Tidewell Labs Inc.');
    expect(removeWatermarks(p.textContent ?? '')).toBe('© 2026 Tidewell GmbH · Privacy');
  });

  it('does not take the old words as the typed arguments when the stored value is known', () => {
    const h1 = document.createElement('h1');
    h1.textContent = encodeKey('Welcome back', 'k');
    document.body.appendChild(h1);

    applyPreview('k', 'Welcome {name}', 'Welcome back');
    expect(removeWatermarks(h1.textContent ?? '')).toBe('Welcome {name}');
  });

  it('reads a plain stored value from its own node only, even when the typed value has markup', () => {
    const p = document.createElement('p');
    p.append(encodeKey('Hello Ada', 'k3'));
    const span = document.createElement('span');
    span.textContent = 'New';
    p.append(span);
    document.body.appendChild(p);

    applyPreview('k3', 'Bonjour <b>{name}</b>', 'Hello {name}');
    expect(removeWatermarks(p.firstChild!.nodeValue ?? '')).toBe('Bonjour <b>Ada</b>');
    expect(p.lastChild).toBe(span);
  });

  it('fills an argument inside rich text from the elements after the node', () => {
    const p = document.createElement('p');
    p.append(encodeKey('Hello ', 'r'));
    const b = document.createElement('b');
    b.textContent = 'Ada';
    p.append(b, '!');
    document.body.appendChild(p);

    applyPreview('r', 'Bonjour <b>{name}</b> !', 'Hello <b>{name}</b>!');
    expect(removeWatermarks(p.innerHTML)).toBe('Bonjour <b>Ada</b> !');
  });
});
