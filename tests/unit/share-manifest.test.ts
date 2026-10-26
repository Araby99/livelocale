// @vitest-environment node
import { it, expect } from 'vitest';
import { parseChangeSet } from '../../src/core/change-link.js';
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

it.each([
  ['a branch with a lone high surrogate', { ...valid, branch: 'a\uD800b' }],
  ['a branch with a lone low surrogate', { ...valid, branch: 'a\uDC00b' }],
  ['a default branch with a lone surrogate', { ...valid, defaultBranch: 'x\uDBFF' }],
])('rejects %s', (_label, v) => expect(isShareManifest(v)).toBe(false));

/** True when the change-set schema accepts a link built from this manifest branch. */
function linkAccepts(branch: string): boolean {
  try {
    parseChangeSet({
      v: 1,
      branch,
      base: SHA,
      src: 'en',
      by: '',
      note: '',
      e: [['ar', 'k', null, 'x']],
    });
    return true;
  } catch {
    return false;
  }
}

// A manifest that passes here must never yield a link the schema rejects (Task 38 maps branch).
it.each([
  ['main', 'main', true],
  ['a 255-character name', 'x'.repeat(255), true],
  ['a well-formed surrogate pair', 'x\uD83D\uDE00', true],
  ['a lone high surrogate', 'a\uD800b', false],
  ['a lone low surrogate', 'a\uDC00b', false],
])('agrees with the change-link schema on a branch with %s', (_label, branch, ok) => {
  expect(isShareManifest({ ...valid, branch })).toBe(ok);
  expect(linkAccepts(branch)).toBe(ok);
});

it('parseShareManifest returns null for anything else', () => {
  expect(parseShareManifest(valid)).toBe(valid);
  expect(parseShareManifest('<!doctype html>')).toBeNull();
});
