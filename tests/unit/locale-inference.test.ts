// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  chooseLocaleOnClick,
  chooseLocaleOnNavigation,
  chooseLocaleOnPageTexts,
  isLocaleConfirmed,
  localeFromUrl,
  localeMismatch,
  matchLocalesByText,
  matchLocalesByVisibleTexts,
  normalizeText,
  type CurrentLocale,
} from '../../src/studio/locale-inference.js';

describe('localeFromUrl', () => {
  it("keeps today's URL heuristic in server mode", () => {
    expect(localeFromUrl('/fr/about')).toBe('fr');
    expect(localeFromUrl('/about?locale=de')).toBe('de');
    expect(localeFromUrl('/about')).toBeNull();
  });

  it('strips the base path and accepts only manifest locales', () => {
    const o = { basePath: '/repo/', locales: ['ar', 'en', 'pt-BR'] };
    expect(localeFromUrl('/repo/ar/about', o)).toBe('ar');
    expect(localeFromUrl('/repo/about', o)).toBeNull();
    expect(localeFromUrl('/repo/pt-br/x', o)).toBe('pt-BR');
    expect(localeFromUrl('/repo/?locale=EN', o)).toBe('en');
    expect(localeFromUrl('/repo/?locale=fr', o)).toBeNull();
    expect(localeFromUrl('/my/page', { basePath: '/', locales: ['ar', 'en'] })).toBeNull();
  });
});

describe('text matching', () => {
  const cands = {
    en: { 'home.title': ['Welcome'] },
    'en-GB': { 'home.title': ['Welcome'] },
    ar: { 'home.title': ['مرحبا', 'أهلاً'], 'home.greet': ['أهلا {name}'] },
  };

  it('normalizes text for matching only', () => {
    expect(normalizeText('  Hello \n  World\t')).toBe('hello world');
    expect(normalizeText('é')).toBe('é');
  });

  it('matches clicked text to locales, built or drafted', () => {
    expect(matchLocalesByText('home.title', ['مرحبا'], cands)).toEqual(['ar']);
    expect(matchLocalesByText('home.title', ['أهلاً'], cands)).toEqual(['ar']);
    expect(matchLocalesByText('home.title', ['WELCOME', '  Welcome \n'], cands)).toEqual([
      'en',
      'en-GB',
    ]);
    expect(matchLocalesByText('home.title', [''], { en: { 'home.title': [''] } })).toEqual([]);
    expect(matchLocalesByText('k', ['é'], { fr: { k: ['é'] } })).toEqual(['fr']);
  });

  it('infers the page locale from visible texts', () => {
    expect(
      matchLocalesByVisibleTexts(
        [
          { key: 'home.title', text: 'مرحبا' },
          { key: 'nope', text: 'x' },
        ],
        cands
      )
    ).toEqual(['ar']);
    expect(matchLocalesByVisibleTexts([{ key: 'home.title', text: 'Welcome' }], cands)).toEqual([
      'en',
      'en-GB',
    ]);
    expect(matchLocalesByVisibleTexts([], cands)).toEqual([]);
  });
});

describe('locale choice', () => {
  const all = ['ar', 'en', 'en-GB'];

  it.each([
    [['ar'], { locale: 'en', source: 'url' }, { locale: 'ar', source: 'content' }],
    [['ar'], { locale: 'en', source: 'manual' }, { locale: 'en', source: 'manual' }],
    [[], { locale: 'ar', source: 'content' }, { locale: 'ar', source: 'content' }],
    [[], { locale: 'en', source: null }, { pick: ['ar', 'en', 'en-GB'] }],
    [['en', 'en-GB'], { locale: 'en-GB', source: 'url' }, { locale: 'en-GB', source: 'url' }],
    [['en', 'en-GB'], { locale: 'ar', source: 'remembered' }, { pick: ['en', 'en-GB'] }],
  ])('click %j with %j -> %j', (m, cur, exp) =>
    expect(chooseLocaleOnClick(m, cur as CurrentLocale, all)).toEqual(exp)
  );

  it('navigation overrides automatic sources but not a manual choice', () => {
    expect(chooseLocaleOnNavigation('en', { locale: 'ar', source: 'content' })).toEqual({
      locale: 'en',
      source: 'url',
    });
    expect(chooseLocaleOnNavigation('en', { locale: 'ar', source: 'manual' })).toEqual({
      locale: 'ar',
      source: 'manual',
    });
    expect(chooseLocaleOnNavigation(null, { locale: 'ar', source: 'content' })).toEqual({
      locale: 'ar',
      source: 'content',
    });
  });

  it('page texts confirm a remembered locale only when they agree', () => {
    expect(chooseLocaleOnPageTexts(['ar'], { locale: 'en', source: 'remembered' })).toEqual({
      locale: 'ar',
      source: 'content',
    });
    expect(
      chooseLocaleOnPageTexts(['en', 'en-GB'], { locale: 'en', source: 'remembered' })
    ).toEqual({ locale: 'en', source: 'content' });
    expect(
      chooseLocaleOnPageTexts(['en', 'en-GB'], { locale: 'ar', source: 'remembered' })
    ).toEqual({ locale: 'ar', source: 'remembered' });
    expect(chooseLocaleOnPageTexts(['ar'], { locale: 'en', source: 'manual' })).toEqual({
      locale: 'en',
      source: 'manual',
    });
  });

  it('only content, url and manual confirm a locale', () => {
    expect(isLocaleConfirmed({ locale: 'ar', source: 'remembered' })).toBe(false);
    expect(isLocaleConfirmed({ locale: 'ar', source: null })).toBe(false);
    expect(isLocaleConfirmed({ locale: 'ar', source: 'url' })).toBe(true);
  });

  it('reports a mismatch only against a manual choice', () => {
    expect(localeMismatch(['ar'], { locale: 'en', source: 'manual' })).toBe('ar');
    expect(localeMismatch(['ar', 'en'], { locale: 'en', source: 'manual' })).toBeNull();
    expect(localeMismatch(['ar'], { locale: 'en', source: 'url' })).toBeNull();
  });
});
