// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  formatCheckReport,
  hasCheckFailures,
  runCheck,
  type CheckIssue,
  type CheckReport,
} from '../../src/codemod/check.js';
import {
  TYPESCRIPT_MISSING,
  typescriptUnusable,
} from '../../src/codemod/hardcoded/load-typescript.js';
import { linkFakeTypeScript, linkTypeScript } from './helpers/project-typescript.js';

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

describe('runCheck --hardcoded locale checks', () => {
  let project: string;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-hc-'));
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('reports nothing new without --hardcoded', async () => {
    write(project, 'locales/en.json', { a: 'Save' });
    write(project, 'locales/ar.json', { a: 'Save' });
    write(project, 'app/page.tsx', `t('a')`);
    const report = await runCheck({ projectDir: project });
    expect(report.issues).toEqual([]);
    expect('setupProblems' in report).toBe(false);
  });

  it('warns on a value identical to the source locale', async () => {
    write(project, 'locales/en.json', { home: { title: 'Save' } });
    write(project, 'locales/fr.json', { home: { title: 'Save' } });
    write(project, 'app/page.tsx', `t('home.title')`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true });
    expect(issues.filter((i) => i.kind === 'untranslated')).toEqual([
      {
        kind: 'untranslated',
        level: 'warn',
        locale: 'fr',
        key: 'home.title',
        file: 'locales/fr.json',
        message: 'Same text as en.',
      },
    ]);
  });

  it('does not report identical values between variants of one language', async () => {
    write(project, 'locales/en.json', { a: 'Colour' });
    write(project, 'locales/en-GB.json', { a: 'Colour' });
    write(project, 'app/page.tsx', `t('a')`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true });
    expect(issues.filter((i) => i.kind === 'untranslated')).toEqual([]);
  });

  it('reports mostly-Latin text in a non-Latin locale, once per key', async () => {
    write(project, 'locales/en.json', { a: 'Save changes', b: 'Settings' });
    write(project, 'locales/ar.json', { a: 'Save changes', b: 'Open settings', c: 'Extra key' });
    write(project, 'app/page.tsx', `t('a'); t('b'); t('c')`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true, unused: false });
    expect(keysOf(issues, 'untranslated')).toEqual(['ar:a']);
    expect(keysOf(issues, 'wrong-script')).toEqual(['ar:b', 'ar:c']);
    expect(issues.find((i) => i.kind === 'wrong-script')).toMatchObject({
      level: 'warn',
      file: 'locales/ar.json',
      message: 'Mostly Latin letters for locale ar.',
    });
  });

  it('skips allowed keys, allowed words, values without letters and empty values', async () => {
    write(project, 'livelocale.allow', 'GitHub\nkey:brand.name\n');
    const values = { brand: { name: 'Acme' }, gh: 'GitHub', n: '42 %', e: '' };
    write(project, 'locales/en.json', values);
    write(project, 'locales/ar.json', values);
    write(project, 'app/page.tsx', `t('brand.name'); t('gh'); t('n'); t('e')`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true });
    expect(issues.filter((i) => i.kind === 'untranslated' || i.kind === 'wrong-script')).toEqual(
      []
    );
  });

  it('honours --allow words in locale checks', async () => {
    write(project, 'locales/en.json', { a: 'Acme' });
    write(project, 'locales/ar.json', { a: 'Acme' });
    write(project, 'app/page.tsx', `t('a')`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true, allow: ['Acme'] });
    expect(keysOf(issues, 'untranslated')).toEqual([]);
  });

  it('--strict makes untranslated and wrong-script fail', async () => {
    write(project, 'locales/en.json', { a: 'Save', b: 'Hi' });
    write(project, 'locales/ar.json', { a: 'Save', b: 'Hello there' });
    write(project, 'app/page.tsx', `t('a'); t('b')`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true, strict: true });
    expect(
      issues
        .filter((i) => i.kind === 'untranslated' || i.kind === 'wrong-script')
        .map((i) => i.level)
    ).toEqual(['fail', 'fail']);
  });

  it('names the namespace file for a namespaced locale folder', async () => {
    write(project, 'locales/en/common.json', { ok: 'Save' });
    write(project, 'locales/fr/common.json', { ok: 'Save' });
    write(project, 'app/page.tsx', `t('common.ok')`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true });
    expect(issues.find((i) => i.kind === 'untranslated')?.file).toBe('locales/fr/common.json');
  });

  // Review Focus 3
  it('skips non-string leaves and checks Arabic-only plural forms for script only', async () => {
    write(project, 'locales/en.json', { days: ['Mon', 'Tue'], count: 3, items_one: 'item' });
    write(project, 'locales/ar.json', {
      days: ['Mon', 'Tue'],
      count: 3,
      items_one: 'عنصر',
      items_zero: 'no items',
    });
    write(project, 'app/page.tsx', `t('days'); t('count'); t('items', { count: 1 })`);
    const { issues } = await runCheck({ projectDir: project, hardcoded: true, unused: false });
    expect(keysOf(issues, 'untranslated')).toEqual([]);
    expect(keysOf(issues, 'wrong-script')).toEqual(['ar:items_zero']);
  });

  it('reports hardcoded JSX text as a failure', async () => {
    linkTypeScript(project);
    write(project, 'locales/en.json', { a: 'A' });
    write(
      project,
      'app/page.tsx',
      "const A = () => (\n  <div>\n    <button>Save changes</button>\n    {t('a')}\n  </div>\n);\n"
    );
    const report = await runCheck({ projectDir: project, hardcoded: true });
    expect(report.issues).toEqual([
      {
        kind: 'hardcoded',
        level: 'fail',
        file: 'app/page.tsx',
        line: 3,
        column: 13,
        text: 'Save changes',
        message: 'Not passed through a translation call.',
      },
    ]);
    expect(hasCheckFailures(report)).toBe(true);
    expect('setupProblems' in report).toBe(false);
  });

  it('sorts hardcoded findings by file, line and column', async () => {
    linkTypeScript(project);
    write(project, 'locales/en.json', {});
    write(project, 'b.tsx', 'const B = () => <p>Second file</p>;');
    write(project, 'a.tsx', 'const A = () => <p>Line one</p>;\nconst C = () => <p>Line two</p>;');
    const { issues } = await runCheck({ projectDir: project, hardcoded: true });
    expect(issues.map((i) => `${i.file}:${i.line}`)).toEqual(['a.tsx:1', 'a.tsx:2', 'b.tsx:1']);
  });

  it('applies livelocale.allow and --allow to JSX text', async () => {
    linkTypeScript(project);
    write(project, 'locales/en.json', {});
    write(project, 'livelocale.allow', 'GitHub\n');
    write(project, 'a.tsx', 'const A = () => <><b>GitHub</b><b>Acme</b><b>Contact</b></>;');
    const { issues } = await runCheck({ projectDir: project, hardcoded: true, allow: ['Acme'] });
    expect(issues.map((i) => i.text)).toEqual(['Contact']);
  });

  it('runs the other checks and reports a setup problem without typescript', async () => {
    write(project, 'locales/en.json', { a: 'Save' });
    write(project, 'locales/fr.json', { a: 'Save' });
    write(project, 'app/page.tsx', "const A = () => <p>{t('a')}</p>;");
    const report = await runCheck({ projectDir: project, hardcoded: true });
    expect(report.setupProblems).toEqual([TYPESCRIPT_MISSING]);
    expect(keysOf(report.issues, 'untranslated')).toEqual(['fr:a']);
    expect(report.issues.some((i) => i.kind === 'hardcoded')).toBe(false);
  });

  it('reports hardcoded text in .astro templates, with no typescript needed', async () => {
    write(project, 'locales/en.json', { home: { title: 'Hi' } });
    write(
      project,
      'src/pages/index.astro',
      [
        '---',
        "const t = createTranslations('en');",
        "const hidden = 'Frontmatter text';",
        '---',
        '<h1>{t.home.title}</h1>',
        '<p>Hardcoded line</p>',
      ].join('\n')
    );
    const report = await runCheck({ projectDir: project, hardcoded: true });
    expect('setupProblems' in report).toBe(false);
    expect(report.issues.filter((i) => i.kind === 'hardcoded')).toEqual([
      {
        kind: 'hardcoded',
        level: 'fail',
        file: 'src/pages/index.astro',
        line: 6,
        column: 4,
        text: 'Hardcoded line',
        message: 'Not passed through a translation call.',
      },
    ]);
  });

  it('still names the missing typescript when JSX files sit beside .astro files', async () => {
    write(project, 'locales/en.json', {});
    write(project, 'src/pages/index.astro', '<p>Hardcoded line</p>');
    write(project, 'src/components/Island.tsx', 'export const I = () => <p>Island text</p>;');
    const report = await runCheck({ projectDir: project, hardcoded: true });
    expect(report.setupProblems).toEqual([TYPESCRIPT_MISSING]);
    expect(report.issues.filter((i) => i.kind === 'hardcoded').map((i) => i.file)).toEqual([
      'src/pages/index.astro',
    ]);
  });

  it('reports an unusable typescript as its own setup problem', async () => {
    linkFakeTypeScript(project, '7.0.0');
    write(project, 'locales/en.json', { a: 'Save' });
    write(project, 'app/page.tsx', "const A = () => <p>{t('a')}</p>;");
    expect((await runCheck({ projectDir: project, hardcoded: true })).setupProblems).toEqual([
      typescriptUnusable('7.0.0'),
    ]);
  });
});

describe('formatCheckReport hardcoded findings', () => {
  const report = (issues: CheckIssue[]): CheckReport => ({
    localesDir: '/p/locales',
    sourceLocale: 'en',
    locales: ['en', 'fr'],
    codeKeyCount: 0,
    issues,
  });
  const hc = (file: string, line: number, column: number, text: string): CheckIssue => ({
    kind: 'hardcoded',
    level: 'fail',
    file,
    line,
    column,
    text,
    message: 'Not passed through a translation call.',
  });

  it('groups hardcoded findings by file and ends with a per-file count', () =>
    expect(
      formatCheckReport(
        report([
          hc('app/page.tsx', 3, 13, 'Save changes'),
          hc('app/page.tsx', 9, 7, 'Cancel'),
          hc('components/Nav.tsx', 4, 9, 'Home'),
        ])
      )
    ).toBe(
      [
        '✖ Hardcoded text not passed through translation (3)',
        '   app/page.tsx',
        '      3:13  "Save changes"',
        '      9:7  "Cancel"',
        '   components/Nav.tsx',
        '      4:9  "Home"',
        '   Per file: app/page.tsx 2 · components/Nav.tsx 1',
      ].join('\n')
    ));

  it('caps hardcoded findings per kind and still counts every file', () => {
    const text = formatCheckReport(
      report([...Array(30)].map((_, i) => hc('a.tsx', i + 1, 1, `Text ${i}`)))
    );
    expect(text.split('\n').filter((l) => l.startsWith('      ')).length).toBe(25);
    expect(text).toContain('   …and 5 more');
    expect(text.endsWith('   Per file: a.tsx 30')).toBe(true);
  });

  it('lists at most ten files in the per-file count', () => {
    const issues = [...Array(12)].map((_, i) =>
      hc(`f${String(i).padStart(2, '0')}.tsx`, 1, 1, 'Hi there')
    );
    expect(formatCheckReport(report(issues)).split('\n').at(-1)).toBe(
      '   Per file: ' +
        [...Array(10)].map((_, i) => `f${String(i).padStart(2, '0')}.tsx 1`).join(' · ') +
        ' · +2 more files'
    );
  });

  it('lists untranslated and wrong-script issues like other locale issues', () =>
    expect(
      formatCheckReport(
        report([
          {
            kind: 'untranslated',
            level: 'warn',
            locale: 'fr',
            key: 'home.title',
            file: 'locales/fr.json',
            message: 'Same text as en.',
          },
        ])
      )
    ).toBe(
      '⚠ Translations identical to the source locale (1)\n   [fr] home.title — Same text as en.'
    ));
});
