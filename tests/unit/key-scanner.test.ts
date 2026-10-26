// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { KeyScanner } from '../../src/server/key-scanner.js';

function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

describe('KeyScanner (real filesystem)', () => {
  let project: string;
  let localesPath: string;
  const listLocales = async () => ['en'];

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-scan-'));
    localesPath = path.join(project, 'locales');
    write(project, 'locales/en.json', JSON.stringify({ home: { title: 'Hi' } }));
    write(
      project,
      'src/page.tsx',
      `const a = t('home.title'); const b = t.nav.home; t.map(x => x);`
    );
    write(project, 'node_modules/dep/index.ts', `t('ignored.from_node_modules')`);
    write(project, 'generated/out.ts', `t('ignored.by_gitignore')`);
    write(project, 'types/global.d.ts', `t('ignored.declaration_file')`);
    write(project, '.gitignore', `generated/\n`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('finds call and property keys in source files', async () => {
    const keys = await new KeyScanner().scanCodebaseKeys(localesPath);
    expect(keys).toContain('home.title');
    expect(keys).toContain('nav.home');
    expect(keys).not.toContain('map');
  });

  it('skips node_modules, .gitignore-d paths, and .d.ts files', async () => {
    const keys = await new KeyScanner().scanCodebaseKeys(localesPath);
    expect(keys).not.toContain('ignored.from_node_modules');
    expect(keys).not.toContain('ignored.by_gitignore');
    expect(keys).not.toContain('ignored.declaration_file');
  });

  it('re-reads only files whose mtime or size changed between scans', async () => {
    const scanner = new KeyScanner();
    const readSpy = vi.spyOn(fs.promises, 'readFile');

    await scanner.scanCodebaseKeys(localesPath);
    const firstReads = readSpy.mock.calls.length;
    expect(firstReads).toBeGreaterThan(0);

    readSpy.mockClear();
    const unchanged = await scanner.scanCodebaseKeys(localesPath);
    expect(readSpy).not.toHaveBeenCalled();
    expect(unchanged).toContain('home.title');

    // Modify one file and push its mtime forward so coarse timestamps cannot hide the change
    const page = write(project, 'src/page.tsx', `t('home.title'); t('home.subtitle');`);
    const future = new Date(Date.now() + 5_000);
    fs.utimesSync(page, future, future);

    readSpy.mockClear();
    const after = await scanner.scanCodebaseKeys(localesPath);
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(after).toContain('home.subtitle');
    expect(after).not.toContain('nav.home');

    readSpy.mockRestore();
  });

  it('merges locale keys and code keys in getKeysMetadata', async () => {
    write(
      project,
      'locales/en.json',
      JSON.stringify({ home: { title: 'Hi' }, only: { in: 'json' } })
    );
    const meta = await new KeyScanner().getKeysMetadata(localesPath, listLocales);
    expect(meta.codeKeys).toContain('nav.home');
    expect(meta.allKeys).toContain('only.in');
    expect(meta.allKeys).toContain('nav.home');
  });
});
