// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  packOutput,
  resolveStudioDir,
  RELATIVE_BASE_WARNING,
  type PackOptions,
} from '../../src/server/pack.js';
import { FLAG_SCRIPT } from '../../src/core/flag-script.js';
import { fakeGit } from './helpers/fake-git.js';
import { makeShareProject, removeShareProjects } from './helpers/share-project.js';

const APP_HTML = '<!doctype html><html><head><title>App</title></head><body></body></html>';
const STUDIO_HTML = '<!doctype html><html><head><title>Studio</title></head><body></body></html>';

let projectDir: string;
let studioDir: string;
let emptyDir: string;

function setup(extra: Record<string, string> = {}): void {
  projectDir = makeShareProject({
    extra: {
      'out/index.html': APP_HTML,
      'out/docs/a.html': APP_HTML,
      'studio/index.html': STUDIO_HTML,
      'studio/assets/app.js': 'console.log(1)',
      ...extra,
    },
  });
  studioDir = path.join(projectDir, 'studio');
  emptyDir = path.join(projectDir, 'empty');
  fs.mkdirSync(emptyDir);
}

const file = (rel: string) => path.join(projectDir, ...rel.split('/'));
const read = (rel: string) => fs.readFileSync(file(rel), 'utf-8');
const pack = (options: Partial<PackOptions> = {}) =>
  packOutput({ projectDir, outDir: 'out', studioDir, env: {}, git: fakeGit({}), ...options });

beforeEach(() => setup());
afterEach(() => removeShareProjects());

describe('packOutput', () => {
  it('writes the share folder', async () => {
    const r = await packOutput({ projectDir, outDir: 'out', studioDir, env: {}, git: fakeGit({}) });
    expect(read('out/livelocale/assets/app.js')).toBe('console.log(1)');
    expect(JSON.parse(read('out/livelocale/manifest.json'))).toStrictEqual(r.manifest);
    expect(read('out/livelocale/manifest.json').endsWith('}\n')).toBe(true);
    expect(JSON.parse(read('out/livelocale/locales/ar.json'))).toStrictEqual({
      home: { title: 'مرحبا {name}' },
    });
    expect(read('out/livelocale/flag.js')).toBe(FLAG_SCRIPT);
    expect(r.htmlInjected).toEqual(['docs/a.html', 'index.html']);
    expect(read('out/index.html')).toMatch(/<head><script src="\/livelocale\/flag\.js"><\/script>/);
    expect(read('out/livelocale/index.html')).not.toContain('flag.js');
    expect(r.shareUrlPath).toBe('/livelocale/index.html');
    expect(r.shareDir).toBe(file('out/livelocale'));
    expect(r.warnings).not.toContain(RELATIVE_BASE_WARNING);
  });

  it('uses an absolute base', async () => {
    const r = await pack({ base: '/repo/' });
    expect(read('out/index.html')).toContain('<script src="/repo/livelocale/flag.js"></script>');
    expect(read('out/docs/a.html')).toContain('<script src="/repo/livelocale/flag.js"></script>');
    expect(r.manifest.basePath).toBe('/repo/');
    expect(r.shareUrlPath).toBe('/repo/livelocale/index.html');
  });

  it('uses per-file relative paths for a relative base', async () => {
    const r = await packOutput({
      projectDir,
      outDir: 'out',
      base: './',
      studioDir,
      env: {},
      git: fakeGit({}),
    });
    expect(read('out/index.html')).toContain('<script src="./livelocale/flag.js"></script>');
    expect(read('out/docs/a.html')).toContain('<script src="../livelocale/flag.js"></script>');
    expect(r.manifest.basePath).toBeNull();
    expect(r.warnings).toContain(RELATIVE_BASE_WARNING);
  });

  it('takes the CRA homepage as the default base', async () => {
    removeShareProjects();
    setup({
      'package.json': JSON.stringify({
        dependencies: { 'react-scripts': '5.0.1' },
        homepage: 'https://acme.github.io/shop',
      }),
    });
    const r = await pack();
    expect(read('out/index.html')).toContain('<script src="/shop/livelocale/flag.js"></script>');
    expect(r.manifest.basePath).toBe('/shop/');
  });

  it('skips injection for Next output and with injectHtml false', async () => {
    const plain = await pack({ injectHtml: false });
    expect(plain.htmlInjected).toEqual([]);
    expect(read('out/index.html')).toBe(APP_HTML);

    removeShareProjects();
    setup({ 'out/_next/static/chunk.js': '' });
    const next = await pack();
    expect(next.htmlInjected).toEqual([]);
    expect(read('out/index.html')).toBe(APP_HTML);
    expect(read('out/livelocale/flag.js')).toBe(FLAG_SCRIPT);
  });

  it('is idempotent and drops stale Studio files', async () => {
    await pack();
    fs.writeFileSync(file('out/livelocale/assets/old.js'), 'stale', 'utf-8');
    const r = await pack();
    expect(r.htmlInjected).toEqual(['docs/a.html', 'index.html']);
    expect(read('out/index.html').match(/livelocale\/flag\.js/g)).toHaveLength(1);
    expect(fs.existsSync(file('out/livelocale/assets/old.js'))).toBe(false);
    expect(read('out/livelocale/assets/app.js')).toBe('console.log(1)');
  });

  it('refuses a folder it did not write', async () => {
    fs.mkdirSync(file('out/livelocale'));
    fs.writeFileSync(file('out/livelocale/notes.txt'), 'mine', 'utf-8');
    await expect(pack()).rejects.toMatchObject({
      code: 'SHARE_DIR_TAKEN',
      message:
        'out/livelocale/ already exists and was not written by LiveLocale. Move it away and run again.',
    });
    expect(read('out/livelocale/notes.txt')).toBe('mine');
    expect(read('out/index.html')).toBe(APP_HTML);
  });

  it('writes nothing when validation fails', async () => {
    await expect(pack({ sourceLocale: 'fr' })).rejects.toMatchObject({
      code: 'SOURCE_LOCALE_NOT_FOUND',
    });
    expect(fs.existsSync(file('out/livelocale'))).toBe(false);
    expect(read('out/index.html')).toBe(APP_HTML);
  });

  it.each([
    [
      'OUT_DIR_NOT_FOUND',
      (): Partial<PackOptions> => ({ outDir: 'missing' }),
      () => `Build output not found: ${file('missing')}. Run your build first.`,
    ],
    [
      'STUDIO_NOT_FOUND',
      (): Partial<PackOptions> => ({ studioDir: emptyDir }),
      () =>
        `LiveLocale Studio files are missing from the installed package (looked in ${emptyDir}). Reinstall livelocale.`,
    ],
  ])('fails with %s', async (code, options, message) => {
    await expect(pack(options())).rejects.toMatchObject({ code, message: message() });
    expect(fs.existsSync(file('out/livelocale'))).toBe(false);
    expect(read('out/index.html')).toBe(APP_HTML);
  });
});

describe('resolveStudioDir', () => {
  it('resolveStudioDir picks the first built Studio', () => {
    const srcLike = path.join(projectDir, 'src-like');
    fs.mkdirSync(srcLike);
    fs.writeFileSync(path.join(srcLike, 'index.html'), STUDIO_HTML, 'utf-8');
    expect(resolveStudioDir([srcLike, studioDir])).toBe(studioDir);
    expect(resolveStudioDir([])).toBeNull();
  });
});
