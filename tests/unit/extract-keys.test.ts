// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractKeys } from '../../src/server/key-scanner.js';

describe('extractKeys — namespace awareness', () => {
  it('prefixes next-intl useTranslations keys with the namespace', () => {
    const keys = extractKeys(`
      'use client';
      import { useTranslations } from 'next-intl';
      export function Hero() {
        const t = useTranslations('home');
        return <h1>{t('title')} {t.rich('intro', { b: (c) => <b>{c}</b> })}</h1>;
      }
    `);
    expect(keys).toEqual(['home.intro', 'home.title']);
  });

  it('handles server-side getTranslations with await and dotted namespaces', () => {
    const keys = extractKeys(`
      const t = await getTranslations('home.hero');
      return t('cta');
    `);
    expect(keys).toEqual(['home.hero.cta']);
  });

  it('tracks several translator variables with different namespaces', () => {
    const keys = extractKeys(`
      const tNav = useTranslations('nav');
      const t = useTranslations('home');
      <a>{tNav('home')}</a><p>{t('title')}</p>
    `);
    expect(keys).toEqual(['home.title', 'nav.home']);
  });

  it('uses the keyPrefix of wrapTranslationEngine and wrapNextIntl', () => {
    const keys = extractKeys(`
      const { t: rawT } = useTranslation('auth');
      const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' });
      const tx = wrapNextIntl(useTranslations('checkout'), 'checkout');
      t('login.title'); tx('pay');
    `);
    expect(keys).toEqual(['auth.login.title', 'checkout.pay']);
  });

  it('uses the react-i18next namespace from useTranslation destructuring', () => {
    const keys = extractKeys(`
      const { t, i18n } = useTranslation('settings');
      t('profile.name');
    `);
    expect(keys).toEqual(['settings.profile.name']);
  });

  it('leaves keys unprefixed when the hook has no namespace', () => {
    const keys = extractKeys(`
      const { t } = useTranslation();
      const u = useTranslations();
      t('plain.key'); u('other.key');
    `);
    expect(keys).toEqual(['other.key', 'plain.key']);
  });

  it('accepts template literals without expressions and skips dynamic ones', () => {
    const keys = extractKeys('t(`home.static`); t(`home.${section}`); t("home." + x);');
    expect(keys).toEqual(['home.static']);
  });

  it('ignores helper properties and look-alike identifiers', () => {
    const keys = extractKeys(`
      t.map(x => x); t.length; t.rich; at('nope'); format('nope'); const rawT = () => {}; rawT('nope');
      t.home.title; t?.nav?.home;
    `);
    expect(keys).toEqual(['home.title', 'nav.home']);
  });
});
