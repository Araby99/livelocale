// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { EMPTY_ALLOW, parseAllowFile } from '../../src/codemod/hardcoded/allow-list.js';
import {
  hasLetters,
  isMostlyLatin,
  isNonLatinLocale,
  stripMarkup,
} from '../../src/codemod/hardcoded/locale-script.js';

describe('isNonLatinLocale', () => {
  it.each([
    ['ar', true],
    ['ar-EG', true],
    ['fa', true],
    ['he', true],
    ['ru', true],
    ['uk', true],
    ['zh', true],
    ['zh_Hant', true],
    ['ja', true],
    ['ko', true],
    ['hi', true],
    ['th', true],
    ['el', true],
    ['sr-Cyrl', true],
    ['ckb', true],
    ['ckb-IQ', true],
    ['ug', true],
    ['sr', false],
    ['zh-Latn', false],
    ['en', false],
    ['fr-CA', false],
    ['tr', false],
  ])('%s → %s', (locale, expected) => expect(isNonLatinLocale(locale)).toBe(expected));
});

describe('stripMarkup', () => {
  it('removes placeholders, ICU syntax, URLs, emails and tags but keeps message text', () => {
    expect(
      stripMarkup('{count, plural, =0 {لا ملفات} one {# ملف} other {# ملفات}}')
        .replace(/\s+/g, ' ')
        .trim()
    ).toBe('لا ملفات ملف ملفات');
    expect(
      stripMarkup('Hi {{name}}, <b>%1$s</b> see https://x.dev/a or a@b.co $t(common.ok)')
        .replace(/\s+/g, ' ')
        .trim()
    ).toBe('Hi , see or');
  });
});

describe('isMostlyLatin', () => {
  it.each([
    ['Save changes', true],
    ['OK', true],
    ['Hello {name}', true],
    ['حفظ التغييرات', false],
    ['{count, plural, one {# ملف} other {# ملفات}}', false],
    ['مرحبا <b>{name}</b>, see https://example.com/docs', false],
    ['مرحبا Ahmed', false], // 5 Arabic, 5 Latin: not more than half
    ['مرحبا Ahmeds', true], // 5 Arabic, 6 Latin
    ['{name}', false], // no letters at all
  ])('%s → %s', (value, expected) => expect(isMostlyLatin(value, EMPTY_ALLOW)).toBe(expected));

  it('does not count allowed words', () =>
    expect(isMostlyLatin('افتح GitHub Pages', parseAllowFile('GitHub Pages\n'))).toBe(false));
});

describe('hasLetters', () => {
  it.each([
    ['حفظ', true],
    ['{name} https://x.dev', false],
    ['GitHub', false],
  ])('%s → %s', (value, expected) =>
    expect(hasLetters(value, parseAllowFile('GitHub\n'))).toBe(expected)
  );
});
