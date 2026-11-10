// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  LOCALES_CANDIDATES,
  findLocalesFolder,
  resolveLocalesPath,
  skippedLocaleEntries,
} from '../../src/core/locale-folder.js';

function write(root: string, rel: string, content = '{}') {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

describe('locale folder detection', () => {
  let project: string;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-folder-'));
  });
  afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

  it('lists the known folders in the order they are tried', () => {
    expect(LOCALES_CANDIDATES).toEqual([
      'locales',
      'messages',
      'src/locales',
      'public/locales',
      'src/i18n/locales',
      'src/messages',
    ]);
  });

  it.each([
    ['messages/en.json', 'messages'],
    ['public/locales/en/common.json', 'public/locales'],
    ['src/messages/pt_BR.json', 'src/messages'],
    ['src/i18n/locales/zh-Hant-TW.json', 'src/i18n/locales'],
  ])('finds %s', (file, folder) => {
    write(project, file);
    expect(findLocalesFolder(project)).toBe(folder);
  });

  it('skips a candidate that holds no locale file', () => {
    write(project, 'locales/README.md', '# notes');
    write(project, 'messages/en.json');
    expect(findLocalesFolder(project)).toBe('messages');
  });

  it('returns null when no candidate holds a locale file', () => {
    expect(findLocalesFolder(project)).toBeNull();
  });

  it('keeps a --locales path as given', () => {
    write(project, 'messages/en.json');
    expect(resolveLocalesPath(project, 'i18n')).toEqual({ path: 'i18n', detected: false });
  });

  it('says when it picked a folder itself', () => {
    write(project, 'messages/en.json');
    expect(resolveLocalesPath(project, undefined)).toEqual({ path: 'messages', detected: true });
  });

  it('falls back to locales when nothing is found', () => {
    expect(resolveLocalesPath(project, undefined)).toEqual({ path: 'locales', detected: false });
  });
});

describe('skippedLocaleEntries', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-skipped-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('names JSON files and JSON folders whose name is not a locale code', () => {
    write(dir, 'en.json');
    write(dir, 'pt_BR.json');
    write(dir, 'english.json');
    write(dir, 'old-backup/en.json');
    write(dir, 'pt-BR/common.json');
    write(dir, 'notes.md', 'x');
    write(dir, 'drafts/readme.txt', 'x');
    write(dir, '.cache/en.json');
    expect(skippedLocaleEntries(dir)).toEqual(['english.json', 'old-backup/']);
  });

  it('returns nothing for a folder that does not exist', () => {
    expect(skippedLocaleEntries(path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('resolveLocalesPath — default folder', () => {
  it('does not report locales/ as a detected folder', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-folder-default-'));
    try {
      write(project, 'locales/en.json');
      expect(resolveLocalesPath(project, undefined)).toEqual({ path: 'locales', detected: false });
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
});
