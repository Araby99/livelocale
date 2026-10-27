// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import type { execFile } from 'child_process';
import { findChangeToken } from '../../src/core/change-link.js';
import {
  ApplyInputError,
  MAX_APPLY_INPUT_BYTES,
  readApplyInput,
  readClipboard,
} from '../../src/codemod/apply/link-input.js';

const T = 'lc1.eJyrVkrLz1eyUkpKLFKqBQAm8wTN';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-apply-input-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

function enoent(command: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`spawn ${command} ENOENT`);
  error.code = 'ENOENT';
  return error;
}

describe('readApplyInput', () => {
  const cwd = process.cwd();

  it('reads a downloaded file', async () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'change-link.txt'),
      `https://acme.com/livelocale/index.html#${T}\r\n`
    );
    expect(findChangeToken(await readApplyInput('change-link.txt', { cwd: dir }))).toBe(T);
  });

  it('passes literal text through', async () =>
    expect(await readApplyInput(`#${T}`, { cwd })).toBe(`#${T}`));

  it('reads stdin for "-"', async () =>
    expect(await readApplyInput('-', { cwd, stdin: Readable.from([`${T}\n`]) })).toBe(`${T}\n`));

  it('reads the clipboard', async () =>
    expect(
      await readApplyInput(undefined, {
        cwd,
        clipboard: true,
        readClipboard: async () => `${T}\r\n`,
      })
    ).toBe(`${T}\r\n`));

  it('rejects input over 1 MB', async () =>
    await expect(
      readApplyInput('-', { cwd, stdin: Readable.from(['x'.repeat(1_048_577)]) })
    ).rejects.toThrow(/larger than 1 MB/));

  it('rejects a file over 1 MB', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(MAX_APPLY_INPUT_BYTES + 1));
    await expect(readApplyInput('big.txt', { cwd: dir })).rejects.toThrow(ApplyInputError);
  });

  it('explains the cmd.exe limit when no input is given', async () =>
    await expect(readApplyInput(undefined, { cwd })).rejects.toThrow(/"-".*--clipboard.*8,191/s));
});

describe('readClipboard', () => {
  it('falls back from wl-paste to xclip to xsel on Linux', async () => {
    const fakeExec = vi.fn(
      (command: string, _args: string[], _options: object, callback: ExecCallback) => {
        if (command === 'xsel') callback(null, T, '');
        else callback(enoent(command), '', '');
      }
    );
    expect(await readClipboard(fakeExec as unknown as typeof execFile, 'linux')).toBe(T);
    expect(fakeExec).toHaveBeenCalledWith(
      'wl-paste',
      ['--no-newline'],
      expect.anything(),
      expect.any(Function)
    );
    expect(fakeExec).toHaveBeenLastCalledWith(
      'xsel',
      ['--clipboard', '--output'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('reads the Windows clipboard through PowerShell', async () => {
    const fakeExec = vi.fn(
      (_command: string, _args: string[], _options: object, callback: ExecCallback) =>
        callback(null, `${T}\r\n`, '')
    );
    expect(await readClipboard(fakeExec as unknown as typeof execFile, 'win32')).toBe(`${T}\r\n`);
    expect(fakeExec).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'],
      expect.anything(),
      expect.any(Function)
    );
  });

  it('fails clearly when no clipboard command works', async () => {
    const fakeExec = vi.fn(
      (command: string, _args: string[], _options: object, callback: ExecCallback) =>
        callback(enoent(command), '', '')
    );
    await expect(readClipboard(fakeExec as unknown as typeof execFile, 'darwin')).rejects.toThrow(
      ApplyInputError
    );
  });
});
