// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCheck, type CheckIssue } from '../../src/codemod/check.js';

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
});
