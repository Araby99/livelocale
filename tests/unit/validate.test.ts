import { describe, expect, it } from 'vitest';
import {
  isSafeKeyPath,
  isValidKeyFormat,
  isValidLocaleFormat,
  LOCALE_RE,
} from '../../src/core/validate.js';

describe('isValidLocaleFormat', () => {
  it.each([
    'en',
    'eng',
    'pt-BR',
    'pt_BR',
    'es-419',
    'zh-Hans',
    'zh-Hant-TW',
    'zh_Hant_TW',
    'sr-Latn-RS',
    'en-US',
  ])('accepts %j', (locale) => {
    expect(isValidLocaleFormat(locale)).toBe(true);
    expect(LOCALE_RE.test(locale)).toBe(true);
  });

  it.each([
    'e',
    'english',
    'en US',
    'en.US',
    'en/US',
    'en\\US',
    '../en',
    'en-',
    'en-US-extra',
    'zh-Hant-TW-x1',
    'zh_Hant-TW',
    '',
  ])('rejects %j', (locale) => {
    expect(isValidLocaleFormat(locale)).toBe(false);
  });
});

describe('isValidKeyFormat', () => {
  it.each([
    'home.title',
    'a_b-c.d',
    'home.überschrift',
    'Hello world',
    'common.Hello world',
    'مرحبا.عنوان',
    'नमस्ते',
    'items_2',
  ])('accepts %j', (key) => {
    expect(isValidKeyFormat(key)).toBe(true);
  });

  it.each([
    '',
    'a..b',
    '.a',
    'a.',
    ' a',
    'a ',
    'a  b',
    'a. b',
    'key$name',
    'key/name',
    'key\\name',
    'key:name',
    'a\tb',
    'a\nb',
    'a'.repeat(201),
  ])('rejects %j', (key) => {
    expect(isValidKeyFormat(key)).toBe(false);
  });

  it('still leaves prototype names to the separate guard', () => {
    expect(isSafeKeyPath('a.__proto__')).toBe(false);
    expect(isSafeKeyPath('Hello world')).toBe(true);
  });
});
