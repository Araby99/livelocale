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
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-lens-check-'));
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

  it('runs outside development mode (CI)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('I18N_LENS', 'off');
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
