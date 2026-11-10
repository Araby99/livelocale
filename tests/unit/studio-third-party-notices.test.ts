// @vitest-environment node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { thirdPartyNotices } from '../../src/studio/vite.config';

const NODE_MODULES = path.resolve('node_modules');
const STUDIO_CSS = path.resolve('src/studio/index.css');

/** Runs the plugin's generateBundle over a module graph and returns the files it emits. */
function emitted(moduleIds: string[]): Map<string, string> {
  const files = new Map<string, string>();
  const plugin = thirdPartyNotices(NODE_MODULES);
  const context = {
    getModuleIds: () => moduleIds[Symbol.iterator](),
    emitFile: (file: { fileName: string; source: string | Uint8Array }) => {
      files.set(file.fileName, String(file.source));
      return file.fileName;
    },
    error: (message: string) => {
      throw new Error(message);
    },
  };
  (plugin.generateBundle as (...args: unknown[]) => void).call(context, {}, {}, false);
  return files;
}

const mod = (...parts: string[]) => path.join(NODE_MODULES, ...parts);
const version = (name: string) =>
  (JSON.parse(fs.readFileSync(mod(name, 'package.json'), 'utf8')) as { version: string }).version;

it('ships the licence of every package compiled into the Studio bundle', () => {
  // Minifying strips the MIT copyright notices from the bundle, and pack copies the bundle into
  // users' sites, so the notices have to travel beside it. The module list is fed by hand: clsx
  // and tailwind-merge are not in today's Studio bundle (nothing imports src/studio/utils/cn.ts),
  // they are here for their licence file names, `license` and `LICENSE.md`. Whether the real
  // build writes the file is for tests/integration/studio-bundle.test.ts.
  const files = emitted([
    path.resolve('src/studio/main.tsx'),
    mod('react', 'cjs', 'react.production.min.js'),
    mod('react', 'jsx-runtime.js'),
    mod('react-dom', 'client.js'),
    mod('scheduler', 'index.js'),
    mod('clsx', 'dist', 'clsx.mjs'),
    mod('tailwind-merge', 'dist', 'bundle-mjs.mjs'),
    '\0vite/modulepreload-polyfill.js',
    STUDIO_CSS,
  ]);
  expect([...files.keys()]).toEqual(['THIRD-PARTY-NOTICES.txt']);
  const notices = files.get('THIRD-PARTY-NOTICES.txt')!;

  for (const [name, licenceFile] of [
    ['clsx', 'license'],
    ['react', 'LICENSE'],
    ['react-dom', 'LICENSE'],
    ['scheduler', 'LICENSE'],
    ['tailwind-merge', 'LICENSE.md'],
    // Compiled into the CSS by PostCSS, so they reach the bundle through index.css's @import.
    ['tailwindcss', 'LICENSE'],
    ['tw-animate-css', 'LICENSE'],
  ] as const) {
    expect(notices, name).toContain(`${name}@${version(name)} (MIT)`);
    expect(notices, name).toContain(fs.readFileSync(mod(name, licenceFile), 'utf8').trim());
  }
  // Listed once each, in name order, so the file only changes when the dependencies do.
  const listed = [...notices.matchAll(/^(\S+)@\d\S* \(/gm)].map((m) => m[1]);
  expect(listed).toEqual([
    'clsx',
    'react',
    'react-dom',
    'scheduler',
    'tailwind-merge',
    'tailwindcss',
    'tw-animate-css',
  ]);
});

it('leaves the fonts to their own licence folder', () => {
  const files = emitted([
    mod('@fontsource', 'ibm-plex-sans', 'latin-400.css'),
    mod('react', 'index.js'),
  ]);
  const notices = files.get('THIRD-PARTY-NOTICES.txt')!;
  expect(notices).not.toContain('@fontsource');
  expect(notices).toContain(`react@${version('react')}`);
});

it('fails the build when a bundled package has no licence file to ship', () => {
  const missing = fs.mkdtempSync(path.join(NODE_MODULES, '.livelocale-notice-test-'));
  try {
    const pkgDir = path.join(missing, 'node_modules', 'no-licence');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      '{"name":"no-licence","version":"1.0.0","license":"MIT"}'
    );
    fs.writeFileSync(path.join(pkgDir, 'index.js'), '');
    expect(() => emitted([path.join(pkgDir, 'index.js')])).toThrow(/no-licence/);
  } finally {
    fs.rmSync(missing, { recursive: true, force: true });
  }
});
