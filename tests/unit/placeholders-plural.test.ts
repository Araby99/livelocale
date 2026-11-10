import { describe, expect, it } from 'vitest';
import {
  comparePlaceholders,
  extractPlaceholders,
  optionalPlaceholdersFor,
  validateMessageSyntax,
} from '../../src/core/placeholders.js';

describe('ICU plural offset', () => {
  const offset = '{n, plural, offset:1 =0 {nobody} one {you and # other} other {you and # others}}';

  it('accepts offset:N before the branches', () => {
    expect(validateMessageSyntax(offset)).toBeNull();
    expect(validateMessageSyntax('{n, plural, offset: 2 other {#}}')).toBeNull();
    expect(validateMessageSyntax('{n, selectordinal, offset:1 one {#st} other {#th}}')).toBeNull();
  });

  it('still reads the plural argument', () => {
    expect(extractPlaceholders(offset)).toEqual(['{n}']);
  });

  it('rejects an offset without a whole number', () => {
    expect(validateMessageSyntax('{n, plural, offset:x other {#}}')).toBe(
      '"n" (plural): "offset:" needs a whole number'
    );
  });

  it('still needs an other branch after an offset', () => {
    expect(validateMessageSyntax('{n, plural, offset:1 one {#}}')).toBe(
      '"n" (plural) has no "other" branch'
    );
  });

  it('does not treat offset as special in a select', () => {
    expect(validateMessageSyntax('{g, select, offset:1 {x} other {y}}')).toBeNull();
  });
});

describe('placeholders a plural form may leave out', () => {
  it.each(['items_zero', 'items_one', 'items_two', 'rank_ordinal_one'])(
    'lets the i18next form %s spell the count as a word',
    (key) => {
      expect(optionalPlaceholdersFor(key)).toEqual(['{{count}}']);
    }
  );

  it.each(['items_few', 'items_other', 'items', 'phone'])('needs {{count}} in %s', (key) => {
    expect(optionalPlaceholdersFor(key)).toEqual([]);
  });

  it('lets a target form keep the count when the source spells it as a word', () => {
    // en `items_one: "One item"`, fr `items_one: "{{count}} article"`.
    expect(comparePlaceholders('One item', '{{count}} article', ['{{count}}'])).toEqual({
      ok: true,
      missing: [],
      extra: [],
    });
    expect(comparePlaceholders('One item', '{{count}} article {{place}}', ['{{count}}'])).toEqual({
      ok: false,
      missing: [],
      extra: ['{{place}}'],
    });
  });

  it('drops optional placeholders only, others are still reported', () => {
    expect(comparePlaceholders('{{count}} item in {{place}}', 'عنصر واحد', ['{{count}}'])).toEqual({
      ok: false,
      missing: ['{{place}}'],
      extra: [],
    });
    expect(comparePlaceholders('{{count}} item', 'عنصر واحد', ['{{count}}'])).toEqual({
      ok: true,
      missing: [],
      extra: [],
    });
  });
});
