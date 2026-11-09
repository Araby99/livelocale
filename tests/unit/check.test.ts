// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  runCheck,
  formatCheckReport,
  hasCheckFailures,
  type CheckIssue,
} from '../../src/codemod/check.js';

function write(root: string, rel: string, content: unknown) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
}

const keysOf = (issues: CheckIssue[], kind: CheckIssue['kind']) =>
  issues
    .filter((i) => i.kind === kind)
    .map((i) => `${i.locale}:${i.key ?? i.file}`)
    .sort();

describe('runCheck', () => {
  let project: string;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-check-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('passes a consistent project', async () => {
    write(project, 'locales/en.json', { home: { title: 'Hi {name}' } });
    write(project, 'locales/ar.json', { home: { title: 'مرحبا {name}' } });
    write(project, 'app/page.tsx', `t('home.title', { name })`);
    const report = await runCheck({ projectDir: project });
    expect(report.issues).toEqual([]);
    expect(report.sourceLocale).toBe('en');
    expect(report.locales).toEqual(['ar', 'en']);
    expect(hasCheckFailures(report)).toBe(false);
  });

  it('cannot run on a locales folder with no locale files', async () => {
    fs.mkdirSync(path.join(project, 'locales'));
    write(project, 'locales/README.md', '# Translations');
    write(project, 'app/page.tsx', `t('a')`);
    await expect(runCheck({ projectDir: project })).rejects.toThrow(
      `No locale files found in ${path.join(project, 'locales')}. Point --locales at the folder with en.json, ar.json, ...`
    );
  });

  it('cannot run when the locale folders hold no JSON file', async () => {
    fs.mkdirSync(path.join(project, 'locales/en'), { recursive: true });
    write(project, 'locales/en/notes.txt', 'todo');
    write(project, 'app/page.tsx', `t('a')`);
    await expect(runCheck({ projectDir: project })).rejects.toThrow(
      `No locale files found in ${path.join(project, 'locales')}.`
    );
  });

  it('names the JSON files it skipped for a name that is not a locale', async () => {
    write(project, 'locales/en_US.json', { a: 'A' });
    write(project, 'locales/messages/en.json', { a: 'A' });
    write(project, 'app/page.tsx', `t('a')`);
    await expect(runCheck({ projectDir: project })).rejects.toThrow(
      'Skipped en_US.json, messages/: a locale name looks like en, ar or pt-BR.'
    );
  });

  it('runs when one locale has files and another has an empty folder', async () => {
    write(project, 'locales/en.json', { a: 'A' });
    fs.mkdirSync(path.join(project, 'locales/ar'), { recursive: true });
    write(project, 'app/page.tsx', `t('a')`);
    const report = await runCheck({ projectDir: project });
    expect(report.locales).toEqual(['ar', 'en']);
    expect(report.issues.some((i) => i.locale === 'ar' && i.key === 'a')).toBe(true);
  });

  it('reads per-locale namespace folders', async () => {
    write(project, 'locales/en/common.json', { a: 'A' });
    write(project, 'locales/ar/common.json', { a: 'B' });
    write(project, 'app/page.tsx', `t('common.a')`);
    const report = await runCheck({ projectDir: project });
    expect(report.locales).toEqual(['ar', 'en']);
    expect(report.issues).toEqual([]);
  });

  it('runs outside development mode (CI)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', 'off');
    write(project, 'locales/en.json', { a: 'A' });
    write(project, 'app/page.tsx', `t('a')`);
    await expect(runCheck({ projectDir: project })).resolves.toMatchObject({ issues: [] });
  });

  it('reports keys used in code but missing from a locale', async () => {
    write(project, 'locales/en.json', { home: { title: 'Hi' } });
    write(project, 'locales/es.json', {});
    write(project, 'app/page.tsx', `t('home.title'); t('home.subtitle')`);
    const { issues } = await runCheck({ projectDir: project });
    expect(keysOf(issues, 'missing-from-code')).toEqual([
      'en:home.subtitle',
      'es:home.subtitle',
      'es:home.title',
    ]);
    // Already reported above, so not repeated against the source locale.
    expect(keysOf(issues, 'missing-in-locale')).toEqual([]);
  });

  it('reports keys the source locale has and another locale lacks', async () => {
    write(project, 'locales/en.json', { a: 'A', b: 'B' });
    write(project, 'locales/fr.json', { a: 'A' });
    const { issues } = await runCheck({ projectDir: project, unused: false });
    expect(keysOf(issues, 'missing-in-locale')).toEqual(['fr:b']);
  });

  it('honours --source', async () => {
    write(project, 'locales/en.json', { a: 'A' });
    write(project, 'locales/ar.json', { a: 'A', b: 'B' });
    const { issues } = await runCheck({ projectDir: project, sourceLocale: 'ar', unused: false });
    expect(keysOf(issues, 'missing-in-locale')).toEqual(['en:b']);
    await expect(runCheck({ projectDir: project, sourceLocale: 'de' })).rejects.toThrow(
      /Source locale "de" not found/
    );
  });

  it('reports placeholder drift against the source locale', async () => {
    write(project, 'locales/en.json', { greet: 'Hello {name}, you have {{count}} items' });
    write(project, 'locales/ar.json', { greet: 'مرحبا {nom}, {{count}}' });
    const { issues } = await runCheck({ projectDir: project, unused: false });
    const mismatch = issues.find((i) => i.kind === 'placeholder-mismatch');
    expect(mismatch).toMatchObject({ locale: 'ar', key: 'greet', level: 'fail' });
    expect(mismatch!.message).toContain('missing {name}');
    expect(mismatch!.message).toContain('extra {nom}');
  });

  it('reports broken ICU syntax in any locale', async () => {
    write(project, 'locales/en.json', { n: '{count, plural, one {# item}}' });
    const { issues } = await runCheck({ projectDir: project, unused: false });
    expect(keysOf(issues, 'syntax')).toEqual(['en:n']);
  });

  it('reports invalid JSON with the file path', async () => {
    write(project, 'locales/en.json', { a: 'A' });
    write(project, 'locales/ar.json', '{ "a": ');
    const { issues } = await runCheck({ projectDir: project, unused: false });
    expect(keysOf(issues, 'invalid-json')).toEqual(['ar:locales/ar.json']);
  });

  it('warns on empty values and unused keys; --strict makes them fail', async () => {
    write(project, 'locales/en.json', { used: 'U', unused: 'X' });
    write(project, 'locales/ar.json', { used: '', unused: 'X' });
    write(project, 'app/page.tsx', `t('used')`);
    const relaxed = await runCheck({ projectDir: project });
    expect(keysOf(relaxed.issues, 'empty')).toEqual(['ar:used']);
    expect(keysOf(relaxed.issues, 'unused')).toEqual(['en:unused']);
    expect(hasCheckFailures(relaxed)).toBe(false);

    const strict = await runCheck({ projectDir: project, strict: true });
    expect(hasCheckFailures(strict)).toBe(true);
  });

  it('treats object access as a reference to every key under it', async () => {
    write(project, 'locales/en.json', { home: { title: 'T', body: 'B' } });
    write(project, 'app/page.tsx', `const x = t.home;`);
    const { issues } = await runCheck({ projectDir: project });
    expect(issues).toEqual([]);
  });

  it('understands i18next plural families', async () => {
    write(project, 'locales/en.json', {
      items_one: '{{count}} item',
      items_other: '{{count}} items',
    });
    write(project, 'locales/ar.json', {
      items_zero: 'لا عناصر',
      items_one: 'عنصر',
      items_two: 'عنصران',
      items_few: '{{count}} عناصر',
      items_many: '{{count}} عنصرًا',
      items_other: '{{count}} عنصر',
    });
    write(project, 'app/page.tsx', `t('items', { count })`);
    const { issues } = await runCheck({ projectDir: project });
    expect(keysOf(issues, 'missing-from-code')).toEqual([]);
    expect(keysOf(issues, 'missing-in-locale')).toEqual([]);
    expect(keysOf(issues, 'unused')).toEqual([]);
  });

  it('reads namespaced folders and applies next-intl namespaces', async () => {
    write(project, 'locales/en/auth.json', { login: 'Log in' });
    write(project, 'locales/ar/auth.json', { login: 'دخول' });
    write(project, 'app/login.tsx', `const t = useTranslations('auth'); t('login'); t('logout');`);
    const { issues } = await runCheck({ projectDir: project });
    expect(keysOf(issues, 'missing-from-code')).toEqual(['ar:auth.logout', 'en:auth.logout']);
  });

  describe('a t scoped to one namespace (folder layout)', () => {
    beforeEach(() => {
      write(project, 'locales/en/home.json', {
        hero: { title: 'Hi', lead: 'Lead' },
        features: { title: 'Features' },
        items: ['a', 'b'],
      });
      write(project, 'locales/en/common.json', { footer: { note: 'Note' }, cta: { go: 'Go' } });
      write(project, 'locales/en/features.json', { title: 'All features' });
      write(project, 'locales/ar/home.json', {
        hero: { title: 'مرحبا', lead: 'مقدمة' },
        features: { title: 'ميزات' },
        items: ['أ'],
      });
      write(project, 'locales/ar/common.json', { footer: { note: 'ملاحظة' }, cta: { go: 'اذهب' } });
      write(project, 'locales/ar/features.json', { title: 'كل الميزات' });
    });

    it('resolves t.hero.title from a helper that returns one namespace', async () => {
      write(
        project,
        'src/pages/index.astro',
        `---\nconst { t } = i18n(Astro, 'home');\nconst c = getT('common', locale);\n---\n<h1>{t.hero.title}</h1><p>{t.hero.lead}</p><h2>{t.features.title}</h2>{t.items.map((i) => <li>{i}</li>)}`
      );
      write(
        project,
        'src/components/Footer.astro',
        `---\nconst { t: common } = i18n(Astro, 'common');\nconst t = common.footer;\n---\n<p>{t.note}</p><a>{common.cta.go}</a>`
      );
      write(
        project,
        'src/components/Island.jsx',
        `export default ({ t }) => <p>{t.hero.lead}</p>;`
      );
      const { issues } = await runCheck({ projectDir: project });
      expect(keysOf(issues, 'missing-from-code')).toEqual([]);
      // features.title is the only key nothing reads: t.features.title is home's section.
      expect(keysOf(issues, 'unused')).toEqual(['en:features.title']);
    });

    it('reports a key the named namespace lacks, under that namespace', async () => {
      write(
        project,
        'src/pages/index.astro',
        `---\nconst { t } = i18n(Astro, 'home');\n---\n<h1>{t.hero.titel}</h1><p>{t.hero.subtitle}</p>`
      );
      const { issues } = await runCheck({ projectDir: project, unused: false });
      expect(keysOf(issues, 'missing-from-code')).toEqual([
        'ar:home.hero.subtitle',
        'ar:home.hero.titel',
        'en:home.hero.subtitle',
        'en:home.hero.titel',
      ]);
    });

    it('reports a key one locale lacks with its full path', async () => {
      write(project, 'locales/ar/home.json', { hero: { title: 'مرحبا' } });
      write(project, 'src/Island.jsx', `export default ({ t }) => <p>{t.hero.lead}</p>;`);
      const { issues } = await runCheck({ projectDir: project, unused: false });
      expect(keysOf(issues, 'missing-from-code')).toEqual(['ar:home.hero.lead']);
    });

    it('reads a createTranslations namespace option', async () => {
      write(
        project,
        'src/page.astro',
        `---\nconst t = createTranslations(locale, { namespace: 'home', plain: true });\n---\n<h1>{t.hero.title}</h1><p>{t.hero.nope}</p>`
      );
      const { issues } = await runCheck({ projectDir: project, unused: false });
      expect(keysOf(issues, 'missing-from-code')).toEqual([
        'ar:home.hero.nope',
        'en:home.hero.nope',
      ]);
    });

    it('reads a namespace option in code without semicolons', async () => {
      write(
        project,
        'src/page.ts',
        `const t = createTranslations(locale, { plain: true })\nconst c = createTranslations(locale, { namespace: 'common', plain: true })\nexport const keys = [t.home.hero.title, t.home.hero.lead, t.home.features.title, t.home.items, t.features.title, c.footer.note, c.cta.go]\n`
      );
      const { issues } = await runCheck({ projectDir: project });
      expect(keysOf(issues, 'missing-from-code')).toEqual([]);
      expect(keysOf(issues, 'unused')).toEqual([]);
    });

    it('does not take a namespace from an unrelated string argument', async () => {
      write(
        project,
        'src/Hero.jsx',
        `export function Hero({ t }) {\n  const go = () => document.getElementById('common').scrollIntoView();\n  return <h1 onClick={go}>{t.cta.go}</h1>;\n}`
      );
      const { issues } = await runCheck({ projectDir: project, unused: false });
      expect(keysOf(issues, 'missing-from-code')).toEqual([]);
    });

    it('checks a call key as written, not under a namespace', async () => {
      write(project, 'src/Calls.jsx', `export function X({ t }) { return t('hero.title'); }`);
      const { issues } = await runCheck({ projectDir: project, unused: false });
      expect(keysOf(issues, 'missing-from-code')).toEqual(['ar:hero.title', 'en:hero.title']);
    });

    it('reports a top-level key an island reads on its t prop when no locale has it', async () => {
      write(
        project,
        'src/components/Loadout.jsx',
        `export default function Loadout({ t }) {\n  return <p title={t.switchLabel}>{t.guidez.standard}{t.hero.lead}</p>;\n}`
      );
      write(
        project,
        'src/pages/index.astro',
        `---\nconst { t } = i18n(Astro, 'home');\n---\n<h1>{t.heroo}</h1><Loadout t={getT('common', locale)} />`
      );
      const { issues } = await runCheck({ projectDir: project, unused: false });
      expect(keysOf(issues, 'missing-from-code')).toEqual(
        [
          'ar:guidez.standard',
          'ar:switchLabel',
          'en:guidez.standard',
          'en:switchLabel',
          // index.astro names two namespaces, so its unknown key is reported as written.
          'ar:heroo',
          'en:heroo',
        ].sort()
      );
    });
  });

  it('ignores property reads on a t that is not a translation', async () => {
    write(project, 'locales/en.json', { hero: { title: 'Hi' } });
    write(
      project,
      'src/scripts/main.js',
      `document.querySelectorAll('[data-tab]').forEach((t) => {
        t.getAttribute('data-tab'); t.classList.toggle('on');
      });
      const link = 'https://t.me/wolvy';`
    );
    write(project, 'src/page.tsx', `t.hero.title; t.hero.titel; t('call.missing');`);
    const { issues } = await runCheck({ projectDir: project });
    expect(keysOf(issues, 'missing-from-code')).toEqual(['en:call.missing', 'en:hero.titel']);
  });

  it('throws when the locales directory is missing', async () => {
    await expect(runCheck({ projectDir: project })).rejects.toThrow(/Locales directory not found/);
  });

  it('formats a grouped, truncated report', async () => {
    write(
      project,
      'locales/en.json',
      Object.fromEntries([...Array(30)].map((_, i) => [`k${i}`, 'v']))
    );
    const report = await runCheck({ projectDir: project });
    const text = formatCheckReport(report, 5);
    expect(text).toContain('⚠ Keys never referenced in code (30)');
    expect(text).toContain('…and 25 more');
  });
});
