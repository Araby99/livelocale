// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatCheckReport, runCheck, type CheckIssue } from '../../src/codemod/check.js';
import { checkHeaderLines } from '../../src/codemod/check-cli.js';

function write(root: string, rel: string, content: unknown) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
}

const of = (issues: CheckIssue[], kind: CheckIssue['kind']) =>
  issues
    .filter((i) => i.kind === kind)
    .map((i) => `${i.locale ?? ''}:${i.key ?? i.file}:${i.level}`)
    .sort();

describe('runCheck — review fixes', () => {
  let project: string;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-check-fix-'));
  });
  afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

  describe('locale names', () => {
    it('reads underscore and three-subtag locales', async () => {
      write(project, 'locales/en.json', { a: 'A' });
      write(project, 'locales/en_US.json', { a: 'A' });
      write(project, 'locales/zh-Hant-TW/common.json', {});
      write(project, 'app/page.tsx', `t('a')`);
      const report = await runCheck({ projectDir: project });
      expect(report.locales).toEqual(['en', 'en_US', 'zh-Hant-TW']);
      expect(of(report.issues, 'missing-from-code')).toEqual(['zh-Hant-TW:a:fail']);
    });

    it('warns about locale-looking files it skipped for their name', async () => {
      write(project, 'locales/en.json', { a: 'A' });
      write(project, 'locales/english.json', { a: 'A' });
      write(project, 'locales/backup/en.json', { a: 'A' });
      write(project, 'app/page.tsx', `t('a')`);
      const report = await runCheck({ projectDir: project });
      expect(of(report.issues, 'not-a-locale')).toEqual([
        ':locales/backup/:warn',
        ':locales/english.json:warn',
      ]);
      expect(formatCheckReport(report)).toContain(
        'locales/english.json — Not read: a locale name looks like en, pt-BR or zh-Hant-TW.'
      );
      const strict = await runCheck({ projectDir: project, strict: true });
      expect(of(strict.issues, 'not-a-locale')).toEqual([
        ':locales/backup/:fail',
        ':locales/english.json:fail',
      ]);
    });
  });

  describe('locales folder', () => {
    it('finds messages/ when --locales is not given and says so', async () => {
      write(project, 'messages/en.json', { a: 'A' });
      write(project, 'app/page.tsx', `t('a')`);
      const report = await runCheck({ projectDir: project });
      expect(report.localesDir).toBe(path.join(project, 'messages'));
      expect(report.detectedLocalesPath).toBe('messages');
    });

    it('does not mark a --locales folder as detected', async () => {
      write(project, 'messages/en.json', { a: 'A' });
      const report = await runCheck({ projectDir: project, localesPath: 'messages' });
      expect(report.detectedLocalesPath).toBeUndefined();
    });

    it('names the folders it tried when none holds locale files', async () => {
      write(project, 'app/page.tsx', `t('a')`);
      await expect(runCheck({ projectDir: project })).rejects.toThrow(
        `Locales directory not found: ${path.join(project, 'locales')}. Looked in locales, messages, src/locales, public/locales, src/i18n/locales, src/messages. Pass --locales <path>.`
      );
    });
  });

  describe('file contents', () => {
    it('reads a locale file that starts with a byte-order mark', async () => {
      write(project, 'locales/en.json', '\uFEFF{"home":{"title":"Hi"}}');
      write(project, 'locales/ar.json', { home: { title: 'مرحبا' } });
      write(project, 'app/page.tsx', `t('home.title')`);
      const report = await runCheck({ projectDir: project });
      expect(report.issues).toEqual([]);
    });

    it('reports a root that is not an object as an invalid file, with no key cascade', async () => {
      write(project, 'locales/en.json', { home: { title: 'Hi' } });
      write(project, 'locales/es.json', ['a', 'b']);
      write(project, 'locales/fr.json', 'null');
      write(project, 'locales/de.json', '"str"');
      write(project, 'app/page.tsx', `t('home.title')`);
      const report = await runCheck({ projectDir: project });
      expect(of(report.issues, 'invalid-json')).toEqual([
        'de:locales/de.json:fail',
        'es:locales/es.json:fail',
        'fr:locales/fr.json:fail',
      ]);
      expect(report.issues.find((i) => i.locale === 'es')?.message).toBe(
        'The file must hold a JSON object ({ ... }), not a list.'
      );
      expect(report.issues.filter((i) => i.kind !== 'invalid-json')).toEqual([]);
    });

    it('adds no per-key findings for a locale file that is not valid JSON', async () => {
      write(project, 'locales/en.json', '{"home": ');
      write(project, 'locales/ar.json', { home: { title: 'مرحبا' } });
      write(project, 'app/page.tsx', `t('home.title')`);
      const report = await runCheck({ projectDir: project });
      expect(report.issues.map((i) => i.kind)).toEqual(['invalid-json']);
    });

    it('keeps checking the other namespace files of a locale', async () => {
      write(project, 'locales/en/common.json', { a: 'A' });
      write(project, 'locales/en/home.json', { b: 'B' });
      write(project, 'locales/ar/common.json', '{oops');
      write(project, 'locales/ar/home.json', {});
      write(project, 'app/page.tsx', `t('common.a'); t('home.b')`);
      const report = await runCheck({ projectDir: project });
      expect(of(report.issues, 'invalid-json')).toEqual(['ar:locales/ar/common.json:fail']);
      expect(of(report.issues, 'missing-from-code')).toEqual(['ar:home.b:fail']);
    });
  });

  describe('i18next plurals', () => {
    it('warns when a plural family has no _other form', async () => {
      write(project, 'locales/en/common.json', { n_one: 'One', n_other: '{{count}} things' });
      write(project, 'locales/pt-BR/common.json', { n_one: 'Um' });
      write(
        project,
        'app/page.tsx',
        `const { t } = useTranslation('common'); t('n', { count: 2 })`
      );
      const report = await runCheck({ projectDir: project });
      expect(of(report.issues, 'plural-missing-other')).toEqual(['pt-BR:common.n_other:warn']);
      const strict = await runCheck({ projectDir: project, strict: true });
      expect(of(strict.issues, 'plural-missing-other')).toEqual(['pt-BR:common.n_other:fail']);
    });

    it('does not ask for _other when no locale has one for that key', async () => {
      write(project, 'locales/en.json', { player_one: 'Player one' });
      write(project, 'app/page.tsx', `t('player_one')`);
      const report = await runCheck({ projectDir: project });
      expect(of(report.issues, 'plural-missing-other')).toEqual([]);
    });

    it('lets a _zero, _one or _two form spell the count as a word', async () => {
      write(project, 'locales/en.json', {
        items_one: '{{count}} item in your cart',
        items_two: '{{count}} items in your cart',
        items_other: '{{count}} items in your cart',
      });
      write(project, 'locales/ar.json', {
        items_one: 'عنصر واحد في سلتك',
        items_two: 'عنصران في سلتك',
        items_other: 'عناصر في سلتك',
      });
      write(project, 'app/page.tsx', `t('items', { count })`);
      const report = await runCheck({ projectDir: project });
      expect(of(report.issues, 'placeholder-mismatch')).toEqual(['ar:items_other:fail']);
    });
  });

  it('counts a <Trans i18nKey> as a use of the key', async () => {
    write(project, 'locales/en/common.json', { home: { terms: 'Accept our <1>terms</1>.' } });
    write(project, 'src/App.tsx', `<Trans i18nKey="home.terms">Accept our <a>terms</a>.</Trans>`);
    const report = await runCheck({ projectDir: project });
    expect(of(report.issues, 'unused')).toEqual([]);
  });

  it('accepts an ICU plural with an offset', async () => {
    write(project, 'locales/en.json', {
      off: '{n, plural, offset:1 =0 {nobody} one {you and # other} other {you and # others}}',
    });
    write(project, 'app/page.tsx', `t('off', { n })`);
    const report = await runCheck({ projectDir: project });
    expect(report.issues).toEqual([]);
  });
});

describe('checkHeaderLines', () => {
  const base = {
    localesDir: '/p/messages',
    sourceLocale: 'en',
    locales: ['ar', 'en'],
    codeKeyCount: 3,
    issues: [],
  };

  it('names the locales folder it found', () => {
    expect(checkHeaderLines({ ...base, detectedLocalesPath: 'messages' }, '/p')).toEqual([
      '\n🔎 LiveLocale check — /p',
      '📂 Locales folder: messages (found it; pass --locales to pick another)',
      '🌐 Locales: ar, en (source: en) · 3 key(s) referenced in code',
    ]);
  });

  it('says nothing about a folder passed with --locales', () => {
    expect(checkHeaderLines(base, '/p')).toHaveLength(2);
  });
});
