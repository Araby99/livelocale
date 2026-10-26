// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateWrite } from '../../src/core/save-rules.js';

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
