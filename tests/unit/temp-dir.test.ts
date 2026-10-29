// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { removeTempDir } from './helpers/temp-dir.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('removeTempDir', () => {
  it('removes a folder and everything in it without logging', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-temp-dir-'));
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a', 'b', 'file.txt'), 'x');

    removeTempDir(dir);

    expect(fs.existsSync(dir)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing for a folder that does not exist', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = path.join(os.tmpdir(), 'livelocale-temp-dir-missing-' + process.pid);

    expect(() => removeTempDir(missing)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns instead of throwing when the folder cannot be removed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => removeTempDir('bad\0path')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('bad');
  });
});
