// @vitest-environment node
import { it, expect } from 'vitest';
import {
  buildDraftDiff,
  draftScope,
  localeFilePath,
  reconcileDraft,
  type Draft,
} from '../../src/studio/transport/drafts.js';

const flat = { localesPath: 'src/locales', layout: 'flat' } as const;

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    scope: 'acme/web',
    locale: 'ar',
    key: 'home.title',
    from: 'مرحبا',
    to: 'أهلاً',
    force: false,
    base: null,
    branch: 'main',
    status: 'unsent',
    conflict: false,
    updatedAt: 1000,
    sentAt: null,
    ...overrides,
  };
}

const titleDraft = draft();
const newDraft = draft({ key: 'home.new', from: null, to: 'جديد' });

it('uses the repo slug when the manifest exposes it', () =>
  expect(draftScope({ repo: 'acme/web' }, 'https://www.acme.com/')).toBe('acme/web'));
it('falls back to the app path so two Pages sites on one origin never share drafts', () => {
  expect(draftScope({}, 'https://o.github.io/site-a/')).toBe('path:/site-a/');
  expect(draftScope({}, 'https://o.github.io/site-b/')).toBe('path:/site-b/');
});

it('maps keys to repo-relative files', () => {
  expect(localeFilePath({ localesPath: 'src/locales', layout: 'flat' }, 'ar', 'home.title')).toBe(
    'src/locales/ar.json'
  );
  expect(
    localeFilePath({ localesPath: 'src/locales', layout: 'namespaced' }, 'ar', 'home.title')
  ).toBe('src/locales/ar/home.json');
  expect(localeFilePath({ localesPath: '.', layout: 'flat' }, 'ar', 'home.title')).toBe('ar.json');
  expect(localeFilePath({ localesPath: '.', layout: 'namespaced' }, 'ar', 'home.title')).toBe(
    'ar/home.json'
  );
});

it('renders drafts as a line diff sorted by file then key', () =>
  expect(buildDraftDiff([titleDraft, newDraft], flat)).toBe(
    [
      '--- a/src/locales/ar.json',
      '+++ b/src/locales/ar.json',
      '@@ home.new @@',
      '+"جديد"',
      '@@ home.title @@',
      '-"مرحبا"',
      '+"أهلاً"',
    ].join('\n')
  ));

it('escapes newlines so every value stays on one diff line', () =>
  expect(buildDraftDiff([draft({ to: 'a\nb' })], flat).split('\n')).toEqual([
    '--- a/src/locales/ar.json',
    '+++ b/src/locales/ar.json',
    '@@ home.title @@',
    '-"مرحبا"',
    '+"a\\nb"',
  ]));

it.each([
  ['Bonjour', 'live'],
  ['Hello', 'pending'],
  ['Salut', 'conflict'],
  [undefined, 'conflict'],
] as const)('current %s -> %s', (cur, v) =>
  expect(reconcileDraft({ from: 'Hello', to: 'Bonjour' }, cur)).toBe(v)
);

it('treats a new key (from null) as pending until the build contains it', () => {
  expect(reconcileDraft({ from: null, to: 'Bonjour' }, undefined)).toBe('pending');
  expect(reconcileDraft({ from: null, to: 'Bonjour' }, 'Bonjour')).toBe('live');
  expect(reconcileDraft({ from: null, to: 'Bonjour' }, 'Salut')).toBe('conflict');
});
