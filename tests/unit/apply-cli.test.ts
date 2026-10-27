// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { encodeChangeLink } from '../../src/core/change-link.js';
import { parseApplyArgs, runApplyCommand } from '../../src/codemod/apply/cli.js';

describe('parseApplyArgs', () => {
  it('reads the input and every option', () => {
    expect(parseApplyArgs(['-', '--pr'])).toMatchObject({ input: '-', pr: true });
    expect(
      parseApplyArgs([
        'link',
        '--dir',
        'app',
        '--locales',
        'src/locales',
        '--source',
        'en',
        '--force',
        '--dry-run',
      ])
    ).toMatchObject({
      dir: 'app',
      locales: 'src/locales',
      source: 'en',
      force: true,
      dryRun: true,
    });
    expect(parseApplyArgs(['--clipboard'])).toEqual({
      input: undefined,
      clipboard: true,
      pr: false,
      force: false,
      dryRun: false,
      dir: '.',
      locales: undefined,
      source: undefined,
    });
  });

  it('rejects bad combinations and unknown options', () => {
    expect(() => parseApplyArgs(['x', '--clipboard'])).toThrow(
      'Pass the link or --clipboard, not both.'
    );
    expect(() => parseApplyArgs(['--bogus'])).toThrow('Unknown option "--bogus".');
    expect(() => parseApplyArgs(['--dir'])).toThrow('--dir needs a value.');
    expect(() => parseApplyArgs(['a', 'b'])).toThrow('Pass one change link');
  });
});

describe('runApplyCommand', () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prints a damaged link as one error line and exits 1', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runApplyCommand(['lc1.!!!!']);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^❌ /));
    expect(process.exitCode).toBe(1);
  });

  it('applies a link from the arguments and prints the summary', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-apply-cli-'));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, 'locales'));
    fs.writeFileSync(path.join(dir, 'locales', 'en.json'), '{"hi":"Hi"}');
    fs.writeFileSync(path.join(dir, 'locales', 'ar.json'), '{"hi":"اهلا"}');
    const token = await encodeChangeLink({
      branch: '',
      base: '',
      src: 'en',
      by: '',
      note: '',
      edits: [{ locale: 'ar', key: 'hi', from: 'اهلا', to: 'مرحبا', force: false }],
    });
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runApplyCommand([token, '--dir', dir]);
    expect(process.exitCode).toBe(0);
    expect(out.mock.calls.flat().join('\n')).toContain('Applied 1');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'locales', 'ar.json'), 'utf-8')).hi).toBe(
      'مرحبا'
    );
  });
});
