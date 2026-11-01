// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  EMPTY_ALLOW,
  parseAllowFile,
  readAllowList,
  removeAllowed,
} from '../../src/codemod/hardcoded/allow-list.js';
import {
  isUserText,
  normalizeText,
  shortenText,
} from '../../src/codemod/hardcoded/text-filters.js';

function write(root: string, rel: string, content: unknown) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
}

describe('parseAllowFile', () => {
  it('reads words, phrases and key entries, skipping blanks and comments', () => {
    const allow = parseAllowFile(
      '# brands\nGitHub\r\n\n  LiveLocale  \nkey:brand.name\nkey:\nMade in Cairo\n'
    );
    expect(allow.words).toEqual(['Made in Cairo', 'LiveLocale', 'GitHub']);
    expect([...allow.keys]).toEqual(['brand.name']);
  });
});

describe('readAllowList', () => {
  let project: string;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-hc-'));
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('merges livelocale.allow with --allow words', () => {
    write(project, 'livelocale.allow', 'GitHub\n');
    expect(readAllowList(project, ['Acme', 'GitHub']).words).toEqual(['GitHub', 'Acme']);
  });
  it('returns an empty list when the file is missing', () =>
    expect(readAllowList(project)).toEqual({ words: [], keys: new Set() }));
});

describe('removeAllowed', () => {
  const allow = parseAllowFile('GitHub\nGitHub Pages\n');
  it('removes whole-word, case-sensitive matches, phrases first', () => {
    expect(removeAllowed('Open on GitHub Pages', allow).trim()).toBe('Open on');
    expect(removeAllowed('MyGitHubApp github', allow)).toBe('MyGitHubApp github');
  });
});

describe('normalizeText and shortenText', () => {
  it('decodes entities and collapses whitespace', () =>
    expect(normalizeText('\n   Welcome&nbsp;back,\n   friend &amp; co  ')).toBe(
      'Welcome back, friend & co'
    ));
  it('keeps 60 characters at most, ending in an ellipsis', () => {
    expect(shortenText('x'.repeat(60))).toBe('x'.repeat(60));
    expect(shortenText('y'.repeat(61))).toBe('y'.repeat(59) + '…');
    expect([...shortenText('مرحبا '.repeat(20))].length).toBe(60);
  });
});

describe('isUserText', () => {
  it.each([
    ['Save changes', true],
    ['save', true],
    ['GitHub', true],
    ['حفظ', true],
    ['x', false],
    ['42', false],
    ['— · ✓ 🎉', false],
    ['https://example.com/docs', false],
    ['www.example.com', false],
    ['mailto:a@b.co', false],
    ['team@example.com', false],
    ['/images/hero.png', false],
    ['./foo', false],
    ['src\\app', false],
    ['hero-image', false],
    ['user_name', false],
    ['MAX_ITEMS', false],
    ['onClick', false],
    ['home.title', false],
    ['NEXT_PUBLIC_LIVELOCALE=preview', false],
    ['npx livelocale doctor --app', false],
    ['Wait -- then retry', true],
    ['Run --app on GitHub', true],
  ])('%s → %s', (text, expected) => expect(isUserText(text, EMPTY_ALLOW)).toBe(expected));

  it('ignores text made only of allowed words', () => {
    const allow = parseAllowFile('GitHub\nLiveLocale\n');
    expect(isUserText('GitHub', allow)).toBe(false);
    expect(isUserText('LiveLocale · GitHub', allow)).toBe(false);
    expect(isUserText('Open on GitHub', allow)).toBe(true);
  });
});
