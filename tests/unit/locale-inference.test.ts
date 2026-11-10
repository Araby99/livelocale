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
  urlWithLocale,
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

  // English holds four texts, Arabic only the title: an Arabic page shows English for the rest.
  const sparse = {
    en: { title: ['Welcome'], cta: ['Start'], about: ['About us'], help: ['Help'] },
    ar: { title: ['مرحبا'] },
  };

  it('counts a fallback text for every language that lacks the key', () => {
    expect(matchLocalesByText('cta', ['Start'], sparse)).toEqual(['ar', 'en']);
    // Text no language holds is no evidence, even for the languages that lack the key.
    expect(matchLocalesByText('cta', ['Commencer'], sparse)).toEqual([]);
  });

  it('reads a mostly fallback Arabic page as Arabic, and an English page as English', () => {
    const arabicPage = [
      { key: 'title', text: 'مرحبا' },
      { key: 'cta', text: 'Start' },
      { key: 'about', text: 'About us' },
      { key: 'help', text: 'Help' },
    ];
    expect(matchLocalesByVisibleTexts(arabicPage, sparse)).toEqual(['ar']);
    const englishPage = [{ key: 'title', text: 'Welcome' }, ...arabicPage.slice(1)];
    expect(matchLocalesByVisibleTexts(englishPage, sparse)).toEqual(['en']);
    // Only fallback texts on screen: either language could be showing them.
    expect(matchLocalesByVisibleTexts(arabicPage.slice(1), sparse)).toEqual(['ar', 'en']);
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

describe('urlWithLocale', () => {
  const options = { basePath: '/app/', locales: ['ar', 'en', 'pt-BR'] };

  it('replaces the locale query parameter and keeps the rest of the address', () => {
    expect(urlWithLocale('/app/about?locale=en&x=1#top', 'ar', options)).toBe(
      '/app/about?locale=ar&x=1#top'
    );
  });

  it('replaces a locale path segment under the base', () => {
    expect(urlWithLocale('/app/en/about?livelocale-origin=o', 'pt-BR', options)).toBe(
      '/app/pt-BR/about?livelocale-origin=o'
    );
    expect(urlWithLocale('/app/EN', 'ar', options)).toBe('/app/ar');
  });

  it('adds the locale query parameter when the address names no locale', () => {
    expect(urlWithLocale('/app/about?livelocale-origin=o', 'ar', options)).toBe(
      '/app/about?livelocale-origin=o&locale=ar'
    );
    // A segment outside the base is not a locale.
    expect(urlWithLocale('/en/about', 'ar', options)).toBe('/en/about?locale=ar');
  });

  it('returns null when the address already shows the locale', () => {
    expect(urlWithLocale('/app/ar/about', 'ar', options)).toBeNull();
    expect(urlWithLocale('/app/about?locale=ar', 'ar', options)).toBeNull();
  });
});
