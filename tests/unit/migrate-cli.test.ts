// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runMigrate, type MigrateTransform } from '../../src/codemod/migrate.js';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-migrate-'));
  dirs.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text, 'utf-8');
  }
  return dir;
}

/** Wraps every file; throws for any file whose text is "boom". */
const transform: MigrateTransform = async (code) => {
  if (code === 'boom') throw new Error('cannot parse');
  return { modified: true, code: `/* wrapped */ ${code}` };
};

describe('runMigrate', () => {
  it('exits 0 when every file converts', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = project({ 'a.tsx': 'a', 'src/b.ts': 'b' });
    expect(await runMigrate({ dir, excludes: [], dryRun: false }, transform)).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'src/b.ts'), 'utf-8')).toBe('/* wrapped */ b');
  });

  it('converts the other files, names the failed one and exits 1', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));
    const dir = project({ 'a.tsx': 'a', 'bad.tsx': 'boom', 'c.js': 'c' });

    expect(await runMigrate({ dir, excludes: [], dryRun: false }, transform)).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'a.tsx'), 'utf-8')).toBe('/* wrapped */ a');
    expect(fs.readFileSync(path.join(dir, 'c.js'), 'utf-8')).toBe('/* wrapped */ c');
    expect(fs.readFileSync(path.join(dir, 'bad.tsx'), 'utf-8')).toBe('boom');
    const out = errors.join('\n');
    expect(out).toContain('Failed:   1 file(s)');
    expect(out).toContain('bad.tsx');
  });

  it('exits 1 in a dry run with a failing file, and writes nothing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = project({ 'a.tsx': 'a', 'bad.tsx': 'boom' });
    expect(await runMigrate({ dir, excludes: [], dryRun: true }, transform)).toBe(1);
    expect(fs.readFileSync(path.join(dir, 'a.tsx'), 'utf-8')).toBe('a');
  });

  it('exits 1 when the folder does not exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = path.join(os.tmpdir(), 'livelocale-migrate-missing-folder');
    expect(await runMigrate({ dir: missing, excludes: [], dryRun: false }, transform)).toBe(1);
  });
});
