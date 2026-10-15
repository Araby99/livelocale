// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { GitClient } from '../../src/server/git-client.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

describe('GitClient', () => {
  let repo: string;
  let localesPath: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-lens-git-'));
    localesPath = path.join(repo, 'locales');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    write(repo, 'locales/en.json', '{\n  "hello": "Hello"\n}\n');
    write(repo, 'src/app.ts', 'export const x = 1;\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reports a clean repository with its branch name', async () => {
    const status = await new GitClient().status(localesPath);
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.changes).toEqual([]);
  });

  it('lists modified, added, and deleted locale files but not other files', async () => {
    write(repo, 'locales/en.json', '{\n  "hello": "Hi"\n}\n');
    write(repo, 'locales/fr.json', '{}\n');
    write(repo, 'src/app.ts', 'export const x = 2;\n');

    const status = await new GitClient().status(localesPath);
    const byPath = Object.fromEntries(status.changes.map((c) => [c.path, c.status]));
    expect(byPath['locales/en.json']).toBe('modified');
    expect(byPath['locales/fr.json']).toBe('added');
    expect(byPath['src/app.ts']).toBeUndefined();
  });

  it('returns a unified diff restricted to the locales directory', async () => {
    write(repo, 'locales/en.json', '{\n  "hello": "Hi"\n}\n');
    write(repo, 'src/app.ts', 'export const x = 2;\n');

    const diff = await new GitClient().diff(localesPath);
    expect(diff).toContain('-  "hello": "Hello"');
    expect(diff).toContain('+  "hello": "Hi"');
    expect(diff).not.toContain('app.ts');
  });

  it('commits only locale files and returns the new commit hash', async () => {
    write(repo, 'locales/en.json', '{\n  "hello": "Hi"\n}\n');
    write(repo, 'locales/fr.json', '{}\n');
    write(repo, 'src/app.ts', 'export const x = 2;\n');

    const result = await new GitClient().commit(localesPath, 'i18n: update greetings');
    expect(result.hash).toMatch(/^[0-9a-f]{7,40}$/);
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('i18n: update greetings');
    expect(git(repo, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual([
      'locales/en.json',
      'locales/fr.json',
    ]);
    // Unrelated change is left in the working tree
    expect(git(repo, 'status', '--porcelain')).toContain('src/app.ts');
  });

  it('refuses to commit when there are no locale changes', async () => {
    await expect(new GitClient().commit(localesPath, 'nothing')).rejects.toThrow(/no changes/i);
  });

  it('discards tracked locale changes and removes new locale files, leaving other files alone', async () => {
    write(repo, 'locales/en.json', '{\n  "hello": "Hi"\n}\n');
    write(repo, 'locales/fr.json', '{}\n');
    write(repo, 'src/app.ts', 'export const x = 2;\n');

    await new GitClient().discard(localesPath);
    expect(fs.readFileSync(path.join(localesPath, 'en.json'), 'utf-8')).toContain('"Hello"');
    expect(fs.existsSync(path.join(localesPath, 'fr.json'))).toBe(false);
    expect(fs.readFileSync(path.join(repo, 'src/app.ts'), 'utf-8')).toContain('x = 2');
  });

  it('reports isRepo=false outside a repository', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-lens-nogit-'));
    try {
      const status = await new GitClient().status(path.join(plain, 'locales'));
      expect(status.isRepo).toBe(false);
      expect(status.changes).toEqual([]);
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});
