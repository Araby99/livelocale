import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { build } from 'vite';
import { liveLocaleVite } from '../../src/server/vite-plugin.js';
import { FLAG_SCRIPT } from '../../src/core/flag-script.js';
import { isShareManifest } from '../../src/core/share-manifest.js';
import { makeShareProject, removeShareProjects } from '../unit/helpers/share-project.js';

const INDEX_HTML =
  '<!doctype html><html><head><title>App</title></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>';

/** A real `vite build` in a forked worker; sized for a loaded machine. */
const BUILD_TIMEOUT = 60_000;
const hasStudio = fs.existsSync('dist/studio/index.html');

describe.skipIf(!hasStudio)('vite build with share', { timeout: BUILD_TIMEOUT }, () => {
  let tmp: string;
  const read = (rel: string) => fs.readFileSync(path.join(tmp, rel), 'utf-8');
  const readJson = (rel: string) => JSON.parse(read(rel));

  async function viteBuild(share: boolean): Promise<void> {
    tmp = makeShareProject({
      extra: { 'index.html': INDEX_HTML, 'src/main.js': "document.title = 'app';\n" },
    });
    await build({
      configFile: false,
      root: tmp,
      base: '/repo/',
      logLevel: 'silent',
      plugins: [liveLocaleVite({ localesPath: path.join(tmp, 'locales'), share })],
    });
  }

  afterEach(() => {
    removeShareProjects();
  });

  it('vite build writes livelocale/ and links the page', async () => {
    await viteBuild(true);
    const html = read('dist/index.html');
    expect(html).toMatch(/<head[^>]*><script src="\/repo\/livelocale\/flag\.js"><\/script>/);
    expect(html.indexOf('livelocale/flag.js')).toBeLessThan(html.indexOf('type="module"'));
    expect(read('dist/livelocale/flag.js')).toBe(FLAG_SCRIPT);
    const m = readJson('dist/livelocale/manifest.json');
    expect(isShareManifest(m)).toBe(true);
    expect(m).toMatchObject({ basePath: '/repo/', locales: ['ar', 'en'], sourceLocale: 'en' });
    expect('repo' in m).toBe(false);
    expect(m.codeKeys).toContain('home.title');
    expect(fs.existsSync(path.join(tmp, 'dist/livelocale/index.html'))).toBe(true);
  });

  it('vite build without share writes nothing extra', async () => {
    await viteBuild(false);
    expect(fs.existsSync(path.join(tmp, 'dist/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'dist/livelocale'))).toBe(false);
    expect(read('dist/index.html')).not.toContain('livelocale/flag.js');
  });
});
