// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { encodeChangeLink } from '../../src/core/change-link.js';
import { parseApplyArgs, runApplyCommand } from '../../src/codemod/apply/cli.js';
import { runGitHubEventApply } from '../../src/codemod/apply/github-event.js';

vi.mock('../../src/codemod/apply/github-event.js', () => ({ runGitHubEventApply: vi.fn() }));
const mockedRun = vi.mocked(runGitHubEventApply);

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
      githubEvent: false,
      branches: undefined,
    });
  });

  it('reads --github-event and --branches', () => {
    expect(
      parseApplyArgs([
        '--github-event',
        '--locales',
        'locales',
        '--source',
        'en',
        '--branches',
        'main,staging',
      ])
    ).toMatchObject({ githubEvent: true, branches: ['main', 'staging'] });
    expect(parseApplyArgs(['x', '--branches', ' main , ,dev ']).branches).toEqual(['main', 'dev']);
  });

  it('rejects --github-event combinations in order', () => {
    expect(() => parseApplyArgs(['--github-event', '--force'])).toThrow(
      /\/livelocale apply --force/
    );
    expect(() => parseApplyArgs(['x', '--github-event', '--force'])).toThrow(
      '--force is not allowed with --github-event'
    );
    expect(() => parseApplyArgs(['x', '--github-event'])).toThrow(/reads the link from the event/);
    expect(() => parseApplyArgs(['--github-event', '--source', 'en'])).toThrow(
      '--github-event needs --locales and --source.'
    );
    expect(() => parseApplyArgs(['--github-event', '--locales', 'locales'])).toThrow(
      '--github-event needs --locales and --source.'
    );
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

  it('runs the GitHub event flow and exits 1 only for error and wrong-repo', async () => {
    for (const [result, code] of [
      ['error', 1],
      ['wrong-repo', 1],
      ['pr', 0],
      ['waiting-for-maintainer', 0],
      ['ignored', 0],
    ] as const) {
      process.exitCode = 0;
      mockedRun.mockResolvedValueOnce(result);
      await runApplyCommand(['--github-event', '--locales', 'locales', '--source', 'en']);
      expect(process.exitCode).toBe(code);
    }
    expect(mockedRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ localesPath: 'locales', sourceLocale: 'en', dir: '.' })
    );
  });

  it('exits 1 when the GitHub event flow rejects', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = 0;
    mockedRun.mockRejectedValueOnce(new Error('boom'));
    await runApplyCommand(['--github-event', '--locales', 'locales', '--source', 'en']);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('❌ boom');
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
