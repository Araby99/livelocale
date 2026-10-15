// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  extractPlaceholders,
  comparePlaceholders,
  validateMessageSyntax,
} from '../../src/core/placeholders.js';

describe('extractPlaceholders', () => {
  it('finds ICU / next-intl arguments including typed and nested ones', () => {
    const tokens = extractPlaceholders(
      'Hello {name}, you have {count, plural, one {# item from {store}} other {# items}}.'
    );
    expect(tokens).toEqual(['{count}', '{name}', '{store}']);
  });

  it('finds i18next double-brace interpolation and nesting', () => {
    expect(extractPlaceholders('Hi {{name}}, {{count, number}} left. $t(common.more)')).toEqual([
      '$t(common.more)',
      '{{count}}',
      '{{name}}',
    ]);
  });

  it('finds printf-style tokens', () => {
    expect(extractPlaceholders('%s has %d items (%1$s)')).toEqual(['%1$s', '%d', '%s']);
  });

  it('finds rich-text tags from react-intl, next-intl and i18next Trans', () => {
    expect(extractPlaceholders('Read the <link>terms</link> and <b>agree</b>, <0>now</0>')).toEqual(
      ['<0>', '<b>', '<link>']
    );
  });

  it('ignores ICU-quoted braces and plain text', () => {
    expect(extractPlaceholders("Literal '{' brace and '{notAnArg}' here")).toEqual([]);
    expect(extractPlaceholders('No placeholders here.')).toEqual([]);
  });
});

describe('comparePlaceholders', () => {
  it('reports nothing when the sets match regardless of order', () => {
    const result = comparePlaceholders('{a} and {b}', '{b} then {a}');
    expect(result).toEqual({ ok: true, missing: [], extra: [] });
  });

  it('reports placeholders dropped from or added to the translation', () => {
    const result = comparePlaceholders(
      'Hello {name}, {count} left',
      'Hola {nombre}, {count} quedan'
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['{name}']);
    expect(result.extra).toEqual(['{nombre}']);
  });

  it('treats an empty reference as compatible with anything', () => {
    expect(comparePlaceholders('', 'anything {x}').ok).toBe(true);
    expect(comparePlaceholders(undefined, '{x}').ok).toBe(true);
  });
});

describe('validateMessageSyntax', () => {
  it('accepts balanced ICU messages', () => {
    expect(validateMessageSyntax('{count, plural, one {# item} other {# items}}')).toBeNull();
    expect(validateMessageSyntax('Plain text')).toBeNull();
    expect(validateMessageSyntax("It''s '{quoted}'")).toBeNull();
  });

  it('rejects unbalanced braces', () => {
    expect(validateMessageSyntax('Hello {name')).toMatch(/unbalanced/i);
    expect(validateMessageSyntax('Hello name}')).toMatch(/unbalanced/i);
  });

  it('rejects plural and select without an "other" branch', () => {
    expect(validateMessageSyntax('{count, plural, one {# item}}')).toMatch(/other/i);
    expect(validateMessageSyntax('{g, select, male {he} female {she}}')).toMatch(/other/i);
    expect(validateMessageSyntax('{g, select, male {he} other {they}}')).toBeNull();
  });
});
