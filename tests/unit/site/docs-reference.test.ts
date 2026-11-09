// @vitest-environment node
import * as fs from 'node:fs';
import { join } from 'node:path';
import { changelogBody } from '../../../site/docs/.vitepress/changelog';

const REFERENCE = 'site/docs/reference';

/** Every `.ts` and `.tsx` file under `dir`, with `/` separators. */
function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((file) => join(dir, file).replaceAll('\\', '/'))
    .filter((file) => /\.tsx?$/.test(file));
}

it('documents every LIVELOCALE variable the code reads', () => {
  const patterns = [
    /env\.((?:NEXT_PUBLIC_)?LIVELOCALE\w*)/g,
    /env\[['"]((?:NEXT_PUBLIC_)?LIVELOCALE\w*)/g,
    /readEnv\(['"]((?:NEXT_PUBLIC_)?LIVELOCALE\w*)/g,
  ];
  const read = new Set<string>();
  for (const file of sourceFiles('src')) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) for (const [, name] of text.matchAll(pattern)) read.add(name!);
  }
  const md = fs.readFileSync(`${REFERENCE}/environment.md`, 'utf8');
  const documented = new Set([...md.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((m) => m[1]!));
  expect(read.size).toBeGreaterThan(0);
  expect([...read].filter((name) => !documented.has(name))).toEqual([]);
});

it('renders the changelog from the first release, without the preamble links', () => {
  const source = fs.readFileSync('CHANGELOG.md', 'utf8');
  const body = changelogBody(source);
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
  // An `## [Unreleased]` section may sit above the latest release until the next one is cut.
  expect(body.startsWith('## [Unreleased]') || body.startsWith(`## [${version}]`)).toBe(true);
  expect(body).toContain(`## [${version}]`);
  expect(source).toContain(body.trimEnd().slice(0, 200));
  expect(body).not.toContain('keepachangelog.com');
  expect(fs.readFileSync(`${REFERENCE}/changelog.md`, 'utf8')).toContain('<!-- @changelog -->');
});

it('documents every liveLocaleVite option', () => {
  const source = fs.readFileSync('src/server/vite-plugin.ts', 'utf8');
  const body = /export interface VitePluginConfig \{([\s\S]*?)\n\}/.exec(source)![1]!;
  const keys = [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]!);
  expect(keys).toEqual([
    'localesPath',
    'git',
    'authToken',
    'share',
    'exposeRepo',
    'sourceLocale',
    'shareBase',
    'fallbackNamespaces',
  ]);
  const md = fs.readFileSync(`${REFERENCE}/configuration.md`, 'utf8');
  expect(keys.filter((key) => !md.includes(`\`${key}\``))).toEqual([]);
});
