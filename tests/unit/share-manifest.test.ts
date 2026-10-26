// @vitest-environment node
import { it, expect } from 'vitest';
import {
  isShareManifest,
  parseShareManifest,
  SHARE_DIR,
  SHARE_FLAG_FILE,
  SHARE_LOCALES_DIR,
  SHARE_MANIFEST_FILE,
  SHARE_MANIFEST_FORMAT,
  type ShareManifest,
} from '../../src/core/share-manifest.js';

const SHA = 'a'.repeat(40);
const valid: ShareManifest = {
  format: 1,
  defaultBranch: 'main',
  branch: 'main',
  base: SHA,
  localesPath: 'src/locales',
  layout: 'flat',
  sourceLocale: 'en',
  locales: ['ar', 'en'],
  basePath: '/',
  codeKeys: ['home.title'],
};

it('names the folder and files', () =>
  expect([
    SHARE_DIR,
    SHARE_MANIFEST_FILE,
    SHARE_FLAG_FILE,
    SHARE_LOCALES_DIR,
    SHARE_MANIFEST_FORMAT,
  ]).toEqual(['livelocale', 'manifest.json', 'flag.js', 'locales', 1]));

it('accepts a manifest without repo', () => expect(isShareManifest(valid)).toBe(true));

it('accepts an owner/name repo', () =>
  expect(isShareManifest({ ...valid, repo: 'acme/site' })).toBe(true));

it('accepts null branch, base, defaultBranch and basePath', () =>
  expect(
    isShareManifest({ ...valid, branch: null, base: null, defaultBranch: null, basePath: null })
  ).toBe(true));

it('ignores unknown fields (forward compatible)', () =>
  expect(isShareManifest({ ...valid, extra: 1 })).toBe(true));

it.each([
  ['format 2', { ...valid, format: 2 }],
  ['a URL as repo', { ...valid, repo: 'https://github.com/acme/site' }],
  ['an unknown layout', { ...valid, layout: 'nested' }],
  ['a source locale outside locales', { ...valid, sourceLocale: 'fr' }],
  ['empty locales', { ...valid, locales: [] }],
  ['a locale code with a path', { ...valid, locales: ['en', '../x'] }],
  ['basePath without trailing slash', { ...valid, basePath: '/repo' }],
  ['non-string codeKeys', { ...valid, codeKeys: [1] }],
  ['a short base', { ...valid, base: 'abc123' }],
  ['an uppercase base', { ...valid, base: SHA.toUpperCase() }],
  ['null', null],
  ['an option-like branch', { ...valid, branch: '-x' }],
  ['a default branch with a space', { ...valid, defaultBranch: 'a b' }],
  ['an empty branch', { ...valid, branch: '' }],
])('rejects %s', (_label, v) => expect(isShareManifest(v)).toBe(false));

it('parseShareManifest returns null for anything else', () => {
  expect(parseShareManifest(valid)).toBe(valid);
  expect(parseShareManifest('<!doctype html>')).toBeNull();
});
