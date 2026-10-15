// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parsePluralMessage,
  buildPluralMessage,
  pluralCategoriesFor,
} from '../../src/core/icu-plural.js';

describe('parsePluralMessage', () => {
  it('parses a bare plural message into branches', () => {
    const parsed = parsePluralMessage('{count, plural, one {# item} other {# items}}');
    expect(parsed).toEqual({
      variable: 'count',
      type: 'plural',
      offset: null,
      prefix: '',
      suffix: '',
      branches: [
        { selector: 'one', text: '# item' },
        { selector: 'other', text: '# items' },
      ],
    });
  });

  it('keeps surrounding text, explicit selectors, offset, and nested arguments verbatim', () => {
    const parsed = parsePluralMessage(
      'You have {count, plural, offset:1 =0 {no items} one {one item from {store}} other {# items}} in your cart.'
    );
    expect(parsed?.prefix).toBe('You have ');
    expect(parsed?.suffix).toBe(' in your cart.');
    expect(parsed?.offset).toBe('1');
    expect(parsed?.branches).toEqual([
      { selector: '=0', text: 'no items' },
      { selector: 'one', text: 'one item from {store}' },
      { selector: 'other', text: '# items' },
    ]);
  });

  it('parses select and selectordinal', () => {
    expect(parsePluralMessage('{gender, select, female {she} other {they}}')?.type).toBe('select');
    expect(parsePluralMessage('{n, selectordinal, one {#st} other {#th}}')?.type).toBe(
      'selectordinal'
    );
  });

  it('returns null for plain text, simple arguments, two plurals, or broken syntax', () => {
    expect(parsePluralMessage('Hello {name}')).toBeNull();
    expect(parsePluralMessage('No placeholders')).toBeNull();
    expect(parsePluralMessage('{a, plural, other {x}} and {b, plural, other {y}}')).toBeNull();
    expect(parsePluralMessage('{count, plural, one {# item}')).toBeNull();
  });

  it("ignores apostrophe-quoted braces: '{' is not a plural", () => {
    expect(parsePluralMessage("A '{' in text")).toBeNull();
  });
});

describe('buildPluralMessage', () => {
  it('round-trips a parsed message', () => {
    const source =
      'You have {count, plural, offset:1 =0 {no items} one {one item} other {# items}} now.';
    expect(buildPluralMessage(parsePluralMessage(source)!)).toBe(source);
  });

  it('omits empty branches except "other"', () => {
    const built = buildPluralMessage({
      variable: 'count',
      type: 'plural',
      offset: null,
      prefix: '',
      suffix: '',
      branches: [
        { selector: 'one', text: '' },
        { selector: 'few', text: '# أشياء' },
        { selector: 'other', text: '' },
      ],
    });
    expect(built).toBe('{count, plural, few {# أشياء} other {}}');
  });
});

describe('pluralCategoriesFor', () => {
  it('returns the CLDR categories for the locale', () => {
    expect(pluralCategoriesFor('en')).toEqual(['one', 'other']);
    expect(pluralCategoriesFor('ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
    expect(pluralCategoriesFor('ja')).toEqual(['other']);
  });

  it('uses ordinal rules for selectordinal', () => {
    expect(pluralCategoriesFor('en', 'selectordinal')).toEqual(['one', 'two', 'few', 'other']);
  });

  it('falls back to one/other for unknown locales', () => {
    expect(pluralCategoriesFor('zz-ZZ-invalid-!!')).toEqual(['one', 'other']);
  });
});
