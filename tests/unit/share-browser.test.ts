// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { copyText, downloadText, readPref, writePref } from '../../src/studio/share/browser.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

function stubClipboard(clipboard: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

function stubExecCommand(result: boolean) {
  const execCommand = vi.fn(() => result);
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  return execCommand;
}

describe('prefs', () => {
  it('stores prefs under livelocale: and survives a throwing localStorage', () => {
    writePref('translator-name', 'Sara');
    expect(localStorage.getItem('livelocale:translator-name')).toBe('Sara');
    expect(readPref('translator-name')).toBe('Sara');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    writePref('github-repo', 'acme/web');
    expect(readPref('github-repo')).toBe('acme/web');

    writePref('github-repo', null);
    expect(readPref('github-repo')).toBeNull();
  });

  it('clears a pref written as null', () => {
    writePref('tips-seen', '1');
    writePref('tips-seen', null);
    expect(localStorage.getItem('livelocale:tips-seen')).toBeNull();
    expect(readPref('tips-seen')).toBeNull();
  });
});

describe('copyText', () => {
  it('copies with the Clipboard API', async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText });
    const execCommand = stubExecCommand(true);
    expect(await copyText('lc1.abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('lc1.abc');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the Clipboard API is missing or rejects', async () => {
    const execCommand = stubExecCommand(true);
    stubClipboard(undefined);
    expect(await copyText('lc1.abc')).toBe(true);
    stubClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) });
    expect(await copyText('lc1.abc')).toBe(true);
    expect(execCommand).toHaveBeenCalledTimes(2);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('returns false when both copy paths fail and removes the textarea', async () => {
    stubClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) });
    stubExecCommand(false);
    expect(await copyText('lc1.abc')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('downloadText', () => {
  it('downloads through a temporary anchor and revokes the URL', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:x');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push(this);
    });

    downloadText('f.txt', 'lc1.abc');

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('f.txt');
    expect(clicked[0].href).toBe('blob:x');
    expect(createObjectURL.mock.calls[0][0].type).toBe('text/plain;charset=utf-8');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a')).toBeNull();
  });
});
