// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { collectShareData } from '../../src/server/pack.js';
import { PackError } from '../../src/server/pack-error.js';
import { fakeGit } from './helpers/fake-git.js';
import { makeShareProject, removeShareProjects } from './helpers/share-project.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const env = {
  GITHUB_SHA: SHA,
  GITHUB_REF_NAME: 'main',
  GITHUB_REF_TYPE: 'branch',
  GITHUB_REPOSITORY: 'acme/site',
};
const git = (root: string) =>
  fakeGit({
    'rev-parse --show-toplevel': root,
    'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main',
  });

afterEach(() => removeShareProjects());

describe('collectShareData', () => {
  it('builds the flat manifest and dictionaries', async () => {
    const dir = makeShareProject();
    const data = await collectShareData({ projectDir: dir, basePath: '/', env, git: git(dir) });
    expect(data.manifest).toStrictEqual({
      format: 1,
      defaultBranch: 'main',
      branch: 'main',
      base: SHA,
      localesPath: 'locales',
      layout: 'flat',
      sourceLocale: 'en',
      locales: ['ar', 'en'],
      basePath: '/',
      codeKeys: ['home.title'],
    });
    expect(data.dictionaries).toStrictEqual({
      ar: { home: { title: 'مرحبا {name}' } },
      en: { home: { title: 'Hello {name}' } },
    });
    expect(data.warnings).toEqual([]);
  });

  it('adds repo only with exposeRepo', async () => {
    const dir = makeShareProject();
    const shown = await collectShareData({
      projectDir: dir,
      basePath: '/',
      exposeRepo: true,
      env,
      git: git(dir),
    });
    expect(shown.manifest.repo).toBe('acme/site');
    expect(shown.warnings).toEqual([]);
    const hidden = await collectShareData({ projectDir: dir, basePath: '/', env, git: git(dir) });
    expect('repo' in hidden.manifest).toBe(false);
  });

  it('warns when exposeRepo finds no repo', async () => {
    const dir = makeShareProject();
    const data = await collectShareData({
      projectDir: dir,
      basePath: '/',
      exposeRepo: true,
      env: {},
      git: git(dir),
    });
    expect('repo' in data.manifest).toBe(false);
    expect(data.warnings[0]).toBe(
      'exposeRepo is on but no GitHub repository was found; the manifest has no repo.'
    );
  });

  it('reads namespaced locales', async () => {
    const dir = makeShareProject({
      layout: 'namespaced',
      extra: {
        'locales/en/common.json': '{"ok":"OK"}',
        'locales/en/home.json': '{"title":"Hello"}',
      },
    });
    const data = await collectShareData({ projectDir: dir, basePath: '/', env, git: git(dir) });
    expect(data.manifest.layout).toBe('namespaced');
    expect(data.manifest.locales).toEqual(['ar', 'en']);
    expect(data.dictionaries.en).toStrictEqual({ common: { ok: 'OK' }, home: { title: 'Hello' } });
    expect(data.dictionaries.ar).toStrictEqual({ home: { title: 'مرحبا {name}' } });
  });

  it('records a repo-relative path in a monorepo', async () => {
    const root = makeShareProject({
      extra: {
        'apps/web/locales/en.json': '{"home":{"title":"Hello"}}',
        'apps/web/src/page.tsx': "t('home.title');\n",
      },
    });
    const data = await collectShareData({
      projectDir: path.join(root, 'apps', 'web'),
      basePath: '/',
      env,
      git: git(root),
    });
    expect(data.manifest.localesPath).toBe('apps/web/locales');
    expect(data.manifest.locales).toEqual(['en']);
  });

  it('falls back to project-relative outside git', async () => {
    const dir = makeShareProject();
    const data = await collectShareData({ projectDir: dir, basePath: null, env, git: fakeGit({}) });
    expect(data.manifest).toMatchObject({
      localesPath: 'locales',
      branch: 'main',
      base: SHA,
      defaultBranch: null,
      basePath: null,
    });
  });

  it('picks the source locale', async () => {
    const noEn = makeShareProject({ extra: { 'locales/fr.json': '{}' } });
    fs.rmSync(path.join(noEn, 'locales', 'en.json'));
    const first = await collectShareData({ projectDir: noEn, basePath: '/', env, git: git(noEn) });
    expect(first.manifest.sourceLocale).toBe('ar');
    const chosen = await collectShareData({
      projectDir: noEn,
      basePath: '/',
      sourceLocale: 'fr',
      env,
      git: git(noEn),
    });
    expect(chosen.manifest.sourceLocale).toBe('fr');

    const dir = makeShareProject();
    const run = collectShareData({
      projectDir: dir,
      basePath: '/',
      sourceLocale: 'fr',
      env,
      git: git(dir),
    });
    await expect(run).rejects.toMatchObject({
      code: 'SOURCE_LOCALE_NOT_FOUND',
      message: `Source locale "fr" not found in ${path.join(dir, 'locales')} (found: ar, en).`,
    });
  });

  it.each([
    ['LOCALES_NOT_FOUND', 'missing dir'],
    ['NO_LOCALES', 'empty dir'],
    ['INVALID_LOCALE_FILE', 'ar.json = "{"'],
    ['INVALID_LOCALE_FILE', 'ar.json = "[]"'],
  ])('fails with %s for %s', async (code, input) => {
    const dir = makeShareProject();
    const locales = path.join(dir, 'locales');
    let localesPath: string | undefined;
    let message: string | RegExp;
    if (input === 'missing dir') {
      localesPath = 'missing';
      message = `Locales directory not found: ${path.join(dir, 'missing')}. Pass --locales <path>.`;
    } else if (input === 'empty dir') {
      fs.rmSync(path.join(locales, 'en.json'));
      fs.rmSync(path.join(locales, 'ar.json'));
      message = `No locale files in ${locales} (expected en.json or en/*.json).`;
    } else {
      fs.writeFileSync(path.join(locales, 'ar.json'), input.endsWith('"{"') ? '{' : '[]');
      message = /^locales\/ar\.json is not a JSON object: \S/;
    }
    const run = collectShareData({
      projectDir: dir,
      localesPath,
      basePath: '/',
      env,
      git: git(dir),
    });
    await expect(run).rejects.toBeInstanceOf(PackError);
    await expect(run).rejects.toMatchObject({ code, message });
  });
});
