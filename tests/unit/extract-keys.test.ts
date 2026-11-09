// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  extractKeyReferences,
  extractKeys,
  resolveCodeKeys,
  type KeyReferences,
  type LocaleKeyIndex,
} from '../../src/server/key-scanner.js';

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

  it('keeps what comes before a helper or a method', () => {
    expect(extractKeys('t.items.map((x) => x); t.title.length; t.raw;')).toEqual([
      'items',
      'title',
    ]);
  });
});

describe('extractKeyReferences', () => {
  it('keeps calls and property reads apart', () => {
    expect(extractKeyReferences(`t('home.title'); t.nav.home;`)).toEqual({
      calls: ['home.title'],
      props: ['nav.home'],
      scoped: [],
    });
  });

  it('reads a createTranslations namespace binding under its namespace', () => {
    const refs = extractKeyReferences(`
      const t = createTranslations(locale, { namespace: 'home', plain: true });
      const about = createTranslations(locale, { plain: true, namespace: "about" });
      <h1>{t.hero.title}</h1><p>{about.lead}</p>
    `);
    expect(refs.translatorProps).toEqual(['about.lead', 'home.hero.title']);
  });

  it('keeps a createTranslations namespace to its own call in code without semicolons', () => {
    const refs = extractKeyReferences(`
      const t = createTranslations(locale, { plain: true })
      const p = createTranslations(getLocale(Astro), { namespace: 'pricing', plain: true })
      export const keys = [t.home.hero.title, p.plans.a]
    `);
    expect(refs.translatorProps).toEqual(['home.hero.title', 'pricing.plans.a']);
  });

  it('groups the reads of a file that passes names as string arguments', () => {
    const refs = extractKeyReferences(`
      const { t, href } = i18n(Astro, 'home');
      <h1>{t.hero.title}</h1><a href={href('/pricing/')}>{t.cta}</a>
    `);
    expect(refs.props).toEqual([]);
    expect(refs.scoped).toEqual([
      { hints: ['home'], props: ['cta', 'hero.title'], translator: true },
    ]);
  });

  it('takes names only from calls whose result is kept, not from member calls', () => {
    const refs = extractKeyReferences(`
      export function Hero({ t }) {
        const go = () => document.getElementById('pricing').scrollIntoView();
        el.classList.toggle('open', isOpen('menu'));
        return <h1 onClick={go}>{t.hero.title}</h1>;
      }
    `);
    expect(refs.scoped).toEqual([]);
    expect(refs.translatorProps).toEqual(['hero.title']);
    expect(
      extractKeyReferences(`---
const { t } = i18n(Astro, 'home');
---
<Loadout t={getT('loadout', locale)} /><p>{t.cta}</p>`).scoped
    ).toEqual([{ hints: ['home', 'loadout'], props: ['cta'], translator: true }]);
  });

  it('tells a t from a translation source from any other t', () => {
    const fromSource = [
      `export default function Island({ t }) { return t.hero.title; }`,
      `export default ({ t = en, locale = "en" }) => t.hero.title;`,
      `function Logo({ opp, t }: Props) { return t.hero.title; }`,
      `const { t } = Astro.props; t.hero.title;`,
      `const t = createTranslations(locale, { plain: true }); t.hero.title;`,
    ];
    for (const code of fromSource) {
      expect(extractKeyReferences(code).translatorProps, code).toEqual(['hero.title']);
    }
    const other = [
      `document.querySelectorAll('a').forEach((t) => { t.hero.title; });`,
      `items.forEach((t) => { t.hero.title })`,
      `const t = document.querySelector('#x'); t.hero.title;`,
      `const t = setTimeout(run, 100); t.hero.title;`,
    ];
    for (const code of other) {
      const refs = extractKeyReferences(code);
      expect(refs.translatorProps, code).toBeUndefined();
      expect(refs.props, code).toEqual(['hero.title']);
    }
  });

  it('reads a renamed t and a t taken from part of another object', () => {
    const refs = extractKeyReferences(`
      const { t: common } = i18n(Astro, 'common');
      const t = common.footer;
      <a title={t.eggTitle}>{common.cta.startFree}</a>
    `);
    // `t.eggTitle` itself may not be a key (`t` is part of `common`), so it is not strict.
    expect(refs.scoped).toEqual([
      { hints: ['common'], props: ['eggTitle'] },
      {
        hints: ['common'],
        props: ['cta.startFree', 'footer', 'footer.eggTitle'],
        translator: true,
      },
    ]);
  });
});

describe('resolveCodeKeys', () => {
  // A folder layout: namespaces home, about and features; `home` has a `features` section too.
  const leaves = [
    'home.hero.title',
    'home.hero.lead',
    'home.features.title',
    'home.items',
    'about.hero.title',
    'features.title',
    'flat.items_one',
    'flat.items_other',
  ];
  const branches = ['home', 'home.hero', 'home.features', 'about', 'about.hero', 'features'];
  const index: LocaleKeyIndex = {
    kind: (key) =>
      leaves.includes(key) || key === 'flat.items'
        ? 'leaf'
        : branches.includes(key) || key === 'flat'
          ? 'branch'
          : undefined,
    namespaces: new Set(['home', 'about', 'features', 'flat']),
  };
  const resolve = (refs: Partial<KeyReferences>) =>
    resolveCodeKeys({ calls: [], props: [], scoped: [], ...refs }, index);

  it('keeps a key the locales have', () => {
    expect(resolve({ props: ['home.hero.title'], calls: ['about.hero.title'] })).toEqual([
      'about.hero.title',
      'home.hero.title',
    ]);
  });

  it('reads a key relative to every namespace that has it', () => {
    expect(resolve({ props: ['hero.title'] })).toEqual(['about.hero.title', 'home.hero.title']);
    expect(resolve({ props: ['hero.lead'] })).toEqual(['home.hero.lead']);
    // `features` is a namespace and a section of `home`: the read may be either.
    expect(resolve({ props: ['features.title'] })).toEqual([
      'features.title',
      'home.features.title',
    ]);
  });

  it('drops a property read whose first segment no locale knows', () => {
    expect(resolve({ props: ['getAttribute', 'classList.toggle', 'me'] })).toEqual([]);
  });

  it('reports a property read that goes wrong after a known segment', () => {
    expect(resolve({ props: ['hero.titel', 'home.hero.titel'] })).toEqual([
      'hero.titel',
      'home.hero.titel',
    ]);
  });

  it('reads a property read past a value as a read of that value', () => {
    // `flat.items` is an i18next plural family, a value too.
    expect(resolve({ props: ['items.slice', 'home.hero.title.length'] })).toEqual([
      'flat.items',
      'home.hero.title',
      'home.items',
    ]);
  });

  it('keeps every call key exactly as written, found or not', () => {
    // A call key is not looked up under the namespaces: `hero.lead` stays `hero.lead`.
    expect(resolve({ calls: ['hero.lead', 'nope.key', 'flat.items'] })).toEqual([
      'flat.items',
      'hero.lead',
      'nope.key',
    ]);
  });

  it('reports an unknown first segment read on a translation object', () => {
    expect(resolve({ translatorProps: ['switchLabel', 'guidez.standard', 'hero.lead'] })).toEqual([
      'guidez.standard',
      'home.hero.lead',
      'switchLabel',
    ]);
    // In the file's namespace when it names exactly one, as written when it names several.
    expect(
      resolve({ scoped: [{ hints: ['home'], props: ['heroo.title'], translator: true }] })
    ).toEqual(['home.heroo.title']);
    expect(
      resolve({
        scoped: [{ hints: ['about', 'home'], props: ['heroo.title'], translator: true }],
      })
    ).toEqual(['heroo.title']);
    // Not on any other t.
    expect(resolve({ scoped: [{ hints: ['home'], props: ['getAttribute'] }] })).toEqual([]);
  });

  it('reads scoped reads in the namespace the file names, and reports them missing there', () => {
    expect(
      resolve({ scoped: [{ hints: ['about', 'x'], props: ['hero.title', 'hero.lead'] }] })
    ).toEqual(['about.hero.lead', 'about.hero.title']);
  });

  it('falls back to every namespace when the named one lacks the first segment', () => {
    expect(
      resolve({ scoped: [{ hints: ['features'], props: ['hero.lead', 'getAttribute'] }] })
    ).toEqual(['home.hero.lead']);
  });

  it('reads keys as they are in a flat layout', () => {
    const flat: LocaleKeyIndex = { kind: index.kind, namespaces: new Set() };
    expect(
      resolveCodeKeys(
        { calls: [], props: ['home.hero.title', 'hero.title', 'home.nope'], scoped: [] },
        flat
      )
    ).toEqual(['home.hero.title', 'home.nope']);
  });
});
