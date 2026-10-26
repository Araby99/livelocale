// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  sourceReference,
  validateEdit,
  validateWrite,
  type SourceContext,
} from '../../src/core/save-rules.js';

describe('validateWrite', () => {
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
      { locale: 'en', key: 'a b', value: 'x' },
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
      expect(!v.ok && v.error).toMatch(/would replace/);
    }
  );

  it('refuses to shadow a literal dotted key', () =>
    // Review Focus 4
    expect(
      validateEdit(
        { locale: 'ar', key: 'promo.banner', value: 'x' },
        { ...ctx, target: { 'promo.banner': 'قديم' } }
      )
    ).toMatchObject({ status: 409, code: 'KEY_NOT_A_STRING' }));

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
