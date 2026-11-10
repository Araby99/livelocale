import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FileMutator } from '../../src/server/file-mutator.js';
import { KeyOccupiedError } from '../../src/core/json-path.js';
import { namespaceNotFoundMessage, SaveRefusedError } from '../../src/core/save-rules.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock the 'fs' promises module completely
vi.mock('fs', () => {
  return {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      rename: vi.fn(),
      unlink: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      rm: vi.fn(),
    },
  };
});

describe('FileMutator', () => {
  let mutator: FileMutator;
  const BASE_PATH = '/project/locales';

  beforeEach(() => {
    mutator = new FileMutator();
    vi.stubEnv('NODE_ENV', 'development');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ─── Happy Path ────────────────────────────────────────────────────────────

  it('should update a flat key when path has one segment', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ greeting: 'Hello' }));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('en.json.tmp'),
      JSON.stringify({ greeting: 'Hi' }, null, 2),
      'utf-8'
    );
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringContaining('en.json.tmp'),
      expect.stringContaining('en.json')
    );
  });

  it('should log the updated key unless quiet is set', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ greeting: 'Hello' }));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
      expect(log).toHaveBeenCalledWith("[livelocale] Updated key 'greeting' in locale 'en'");
      log.mockClear();
      await new FileMutator({ quiet: true }).updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('should update a nested key when path has 3 segments', async () => {
    const initial = { dashboard: { header: { title: 'Old' } } };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initial));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'ar', 'dashboard.header.title', 'New');

    const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
    expect(written.dashboard.header.title).toBe('New');
  });

  it('should create intermediate objects when key path does not exist', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'a.b.c', 'value');

    const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
    expect(written.a.b.c).toBe('value');
  });

  it('should preserve unrelated keys when updating a specific key', async () => {
    const initial = { a: 'keep', b: 'keep', c: 'change' };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(initial));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'c', 'changed');

    const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
    expect(written.a).toBe('keep');
    expect(written.b).toBe('keep');
    expect(written.c).toBe('changed');
  });

  it('should initialize locale file as empty object when file does not exist', async () => {
    const readError: any = new Error('ENOENT');
    readError.code = 'ENOENT';
    vi.mocked(fs.readFile).mockRejectedValue(readError);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hello');

    const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0]![1] as string);
    expect(written).toEqual({ greeting: 'Hello' });
  });

  // ─── Error Cases ────────────────────────────────────────────────────────────

  it('should throw when running inside non-development environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi')).rejects.toThrow(
      /development/i
    );
  });

  it('should throw when locale string contains path traversal characters', async () => {
    await expect(
      mutator.updateLocaleKey(BASE_PATH, '../etc/passwd', 'key', 'value')
    ).rejects.toThrow(/path traversal/i);

    await expect(mutator.updateLocaleKey(BASE_PATH, 'sub/folder', 'key', 'value')).rejects.toThrow(
      /path traversal/i
    );
  });

  it('should throw when key depth exceeds 30 levels', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));
    const deepKey = Array(31).fill('a').join('.'); // 31 segments
    await expect(mutator.updateLocaleKey(BASE_PATH, 'en', deepKey, 'value')).rejects.toThrow(
      /key depth/i
    );
  });

  it('should throw when key path contains prototype-pollution segments', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    for (const key of ['__proto__.polluted', 'constructor.prototype.x', 'a.prototype.b']) {
      await expect(mutator.updateLocaleKey(BASE_PATH, 'en', key, 'PWNED')).rejects.toThrow(
        /forbidden key segment/i
      );
    }

    // Nothing must ever be written for a rejected key
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should not pollute Object.prototype via a malicious key write', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({}));
    const sentinel = { polluted: undefined };

    try {
      await mutator.updateLocaleKey(BASE_PATH, 'en', '__proto__.polluted', 'PWNED');
    } catch {}

    expect((sentinel as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });

  it('should throw when locale file content is invalid JSON', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{ not valid json }');
    await expect(mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi')).rejects.toThrow(
      /invalid locale file/i
    );
  });

  it('should throw when locale file parses to an array root', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(['item1', 'item2']));
    await expect(mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi')).rejects.toThrow(
      /must be an object/i
    );
  });

  it('should throw when file reading fails with non-ENOENT code', async () => {
    const error: any = new Error('Permission Denied');
    error.code = 'EACCES';
    vi.mocked(fs.readFile).mockRejectedValue(error);

    await expect(mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi')).rejects.toThrow(
      /failed to read/i
    );
  });

  it('should clean up .tmp file when file renaming fails', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ k: 'v' }));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockRejectedValue(new Error('disk full'));
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    await expect(mutator.updateLocaleKey(BASE_PATH, 'en', 'k', 'new')).rejects.toThrow('disk full');

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('en.json.tmp'));
  });

  it('should serialise concurrent updates to the same locale file path', async () => {
    const callOrder: number[] = [];

    vi.mocked(fs.readFile)
      .mockImplementationOnce(async () => {
        // First call takes longer to simulate disk operation delay
        await new Promise((resolve) => setTimeout(resolve, 20));
        callOrder.push(1);
        return JSON.stringify({ count: '0' });
      })
      .mockImplementationOnce(async () => {
        // Second call executes
        callOrder.push(2);
        return JSON.stringify({ count: '1' });
      });

    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    const p1 = mutator.updateLocaleKey(BASE_PATH, 'en', 'count', '1');
    const p2 = mutator.updateLocaleKey(BASE_PATH, 'en', 'count', '2');

    await Promise.all([p1, p2]);

    expect(callOrder).toEqual([1, 2]);
  });

  it('should update key inside a namespace file when locale is a directory', async () => {
    // Mock stat to say locales/en is a directory
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ title: 'Old' }));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'common.title', 'New');

    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join('en', 'common.json')),
      'utf-8'
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(path.join('en', 'common.json.tmp')),
      JSON.stringify({ title: 'New' }, null, 2),
      'utf-8'
    );
  });

  // ─── Save guard: never replace data, never create a stray namespace file ───

  describe('save guard', () => {
    /** Serves `files` (paths relative to BASE_PATH) through the mocked fs. */
    function serve(files: Record<string, string>) {
      const abs = new Map(
        Object.entries(files).map(([rel, text]) => [path.resolve(BASE_PATH, rel), text])
      );
      const isDir = (p: string) => [...abs.keys()].some((f) => f.startsWith(p + path.sep));
      const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(fs.stat).mockImplementation(async (p) => {
        const file = abs.has(String(p));
        if (!file && !isDir(String(p))) throw enoent();
        return { isDirectory: () => !file, isFile: () => file } as any;
      });
      vi.mocked(fs.readFile).mockImplementation(async (p) => {
        const text = abs.get(String(p));
        if (text === undefined) throw enoent();
        return text as any;
      });
      vi.mocked(fs.readdir).mockImplementation(async (p) => {
        const dir = String(p) + path.sep;
        const names = new Set(
          [...abs.keys()]
            .filter((f) => f.startsWith(dir))
            .map((f) => f.slice(dir.length).split(path.sep)[0]!)
        );
        return [...names].map((name) => ({
          name,
          isDirectory: () => isDir(dir + name),
          isFile: () => abs.has(dir + name),
        })) as any;
      });
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
    }

    it.each([
      ['an array item', { features: ['Fast', 'Free', 'Open'] }, 'features.1'],
      ['a literal dotted key', { 'home.title': 'Hola' }, 'home.title'],
      ['a group of translations', { home: { title: 'x' } }, 'home'],
    ])('refuses to replace %s and writes nothing', async (_, data, key) => {
      serve({ 'en.json': JSON.stringify(data) });
      await expect(mutator.updateLocaleKey(BASE_PATH, 'en', key, 'v')).rejects.toBeInstanceOf(
        KeyOccupiedError
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.rename).not.toHaveBeenCalled();
    });

    it('refuses a namespace no language has instead of creating a stray file', async () => {
      serve({ 'en/common.json': '{}', 'ar/common.json': '{}' });
      const save = mutator.updateLocaleKey(BASE_PATH, 'en', 'nav.home', 'Home');
      await expect(save).rejects.toBeInstanceOf(SaveRefusedError);
      await expect(save).rejects.toMatchObject({
        status: 409,
        code: 'NAMESPACE_NOT_FOUND',
        message: namespaceNotFoundMessage('nav'),
      });
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('creates a namespace file that another language already has', async () => {
      serve({ 'en/common.json': '{"title":"Hello"}', 'ar/other.json': '{}' });
      await mutator.updateLocaleKey(BASE_PATH, 'ar', 'common.title', 'مرحبا');
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve(BASE_PATH, 'ar', 'common.json.tmp'),
        JSON.stringify({ title: 'مرحبا' }, null, 2) + '\n',
        'utf-8'
      );
    });

    it('refuses a key that names no key inside a namespace file with a 400', async () => {
      serve({ 'en/common.json': '{"title":"Hello"}' });
      await expect(mutator.updateLocaleKey(BASE_PATH, 'en', 'common', 'x')).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_KEY_FORMAT',
      });
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('refuses a value inside a namespace file that would replace a group', async () => {
      serve({ 'en/common.json': '{"home":{"title":"x"}}' });
      await expect(
        mutator.updateLocaleKey(BASE_PATH, 'en', 'common.home', 'x')
      ).rejects.toBeInstanceOf(KeyOccupiedError);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  // ─── Locale Management ──────────────────────────────────────────────────────

  describe('listLocales', () => {
    it('should list all valid locales from directories and json files', async () => {
      const mockDirItems = [
        { name: 'en', isDirectory: () => true, isFile: () => false },
        { name: 'ar', isDirectory: () => true, isFile: () => false },
        { name: 'es.json', isDirectory: () => false, isFile: () => true },
        { name: 'invalid-name', isDirectory: () => true, isFile: () => false },
        { name: 'random.txt', isDirectory: () => false, isFile: () => true },
      ];
      vi.mocked(fs.readdir).mockResolvedValue(mockDirItems as any);

      const locales = await mutator.listLocales(BASE_PATH);
      expect(locales).toEqual(['ar', 'en', 'es']);
    });
  });

  describe('addLocale', () => {
    it('should add flat locale json file when no directories are present', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readdir).mockResolvedValue([] as any);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await mutator.addLocale(BASE_PATH, 'fr');

      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('fr.json'), '{}', 'utf-8');
    });

    it('should create folder-based layout with empty namespace files when references exist', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      // Simulate existing "en" directory and standard namespace files
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([
          { name: 'en', isDirectory: () => true, isFile: () => false } as any,
        ] as any)
        .mockResolvedValueOnce(['common.json', 'auth.json'] as any);

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await mutator.addLocale(BASE_PATH, 'es');

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('es'), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(path.join('es', 'common.json')),
        '{}',
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(path.join('es', 'auth.json')),
        '{}',
        'utf-8'
      );
    });

    it('should throw error if locale already exists', async () => {
      vi.mocked(fs.stat).mockResolvedValue({} as any);

      await expect(mutator.addLocale(BASE_PATH, 'en')).rejects.toThrow(/already exists/i);
    });
  });

  describe('renameLocale', () => {
    it('should rename a directory when old locale is a directory', async () => {
      vi.mocked(fs.stat).mockImplementation(async (p: any) => {
        if (p.includes('en-US')) {
          const err: any = new Error('ENOENT');
          err.code = 'ENOENT';
          throw err;
        }
        return { isDirectory: () => true } as any;
      });
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await mutator.renameLocale(BASE_PATH, 'en', 'en-US');

      expect(fs.rename).toHaveBeenCalledWith(
        expect.stringContaining('en'),
        expect.stringContaining('en-US')
      );
    });

    it('should rename a file when old locale is a file', async () => {
      vi.mocked(fs.stat).mockImplementation(async (p: any) => {
        if (p.includes('es-MX')) {
          const err: any = new Error('ENOENT');
          err.code = 'ENOENT';
          throw err;
        }
        if (p.includes('es.json')) {
          return { isDirectory: () => false } as any;
        }
        const err: any = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await mutator.renameLocale(BASE_PATH, 'es', 'es-MX');

      expect(fs.rename).toHaveBeenCalledWith(
        expect.stringContaining('es.json'),
        expect.stringContaining('es-MX.json')
      );
    });
  });

  describe('deleteLocale', () => {
    it('should delete a directory recursively when locale is a directory', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await mutator.deleteLocale(BASE_PATH, 'fr');

      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('fr'), {
        recursive: true,
        force: true,
      });
    });

    it('should unlink file when locale is a file', async () => {
      vi.mocked(fs.stat)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce({ isDirectory: () => false } as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await mutator.deleteLocale(BASE_PATH, 'es');

      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('es.json'));
    });
  });

  describe('scanCodebaseKeys', () => {
    it('should extract keys correctly from codebase files using call and proxy patterns', async () => {
      const codeSnippet = `
        const title = t('home.welcome_msg');
        const count = t("auth.login.count");
        const proxyVal1 = t.dashboard.heading;
        const proxyVal2 = t?.sidebar?.toggle_btn;
        const ignoreVal = t.toString();
      `;

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'page.tsx', isDirectory: () => false, isFile: () => true },
      ] as any);
      vi.mocked(fs.readFile).mockResolvedValue(codeSnippet);

      const keys = await mutator.scanCodebaseKeys(BASE_PATH);
      expect(keys).toEqual([
        'auth.login.count',
        'dashboard.heading',
        'home.welcome_msg',
        'sidebar.toggle_btn',
      ]);
    });
  });

  describe('scanLocalesKeys', () => {
    it('should extract and flatten all keys across all existing locales', async () => {
      // Setup locales directories
      const mockDirItems = [
        { name: 'en.json', isDirectory: () => false, isFile: () => true },
        { name: 'ar.json', isDirectory: () => false, isFile: () => true },
      ];
      vi.mocked(fs.readdir).mockResolvedValue(mockDirItems as any);
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT')); // flat files

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({ home: { title: 'Welcome', desc: 'Main' } })) // en.json
        .mockResolvedValueOnce(JSON.stringify({ home: { title: 'Marhaban' } })); // ar.json

      const keys = await mutator.scanLocalesKeys(BASE_PATH);
      expect(keys).toEqual(['home.desc', 'home.title']);
    });
  });
  // ─── Git-friendly formatting ──────────────────────────────────────────────

  const writtenText = () => vi.mocked(fs.writeFile).mock.calls[0]![1] as string;

  it('should preserve a trailing newline when the original file had one', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{\n  "greeting": "Hello"\n}\n');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(writtenText()).toBe('{\n  "greeting": "Hi"\n}\n');
  });

  it('should not add a trailing newline when the original file had none', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{\n  "greeting": "Hello"\n}');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(writtenText()).toBe('{\n  "greeting": "Hi"\n}');
  });

  it('should preserve four-space indentation', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{\n    "greeting": "Hello"\n}\n');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(writtenText()).toBe('{\n    "greeting": "Hi"\n}\n');
  });

  it('should preserve tab indentation', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{\n\t"greeting": "Hello"\n}\n');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(writtenText()).toBe('{\n\t"greeting": "Hi"\n}\n');
  });

  it('should keep Windows line endings when the original file used them', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{\r\n  "a": "1",\r\n  "greeting": "Hello"\r\n}\r\n');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(writtenText()).toBe('{\r\n  "a": "1",\r\n  "greeting": "Hi"\r\n}\r\n');
  });

  it('should read a file that starts with a byte-order mark and write the mark back', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('\uFEFF{\n  "greeting": "Hello"\n}\n');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(writtenText()).toBe('\uFEFF{\n  "greeting": "Hi"\n}\n');
  });

  it('should say the file is not valid JSON, not that its root is wrong, on a parse error', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{ "greeting": ');
    const err = await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi').catch((e) => e);
    expect(err.message).toMatch(/not valid JSON/i);
    expect(err.message).not.toMatch(/root must be an object/i);
  });

  it('should default to two spaces and a trailing newline for a new file', async () => {
    const enoent: any = new Error('missing');
    enoent.code = 'ENOENT';
    vi.mocked(fs.readFile).mockRejectedValue(enoent);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await mutator.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(writtenText()).toBe('{\n  "greeting": "Hi"\n}\n');
  });
  // ─── readLocale ───────────────────────────────────────────────────────────

  it('should read a flat locale file', async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.readFile).mockResolvedValue('{"greeting":"Hello"}');
    expect(await mutator.readLocale(BASE_PATH, 'en')).toEqual({ greeting: 'Hello' });
  });

  it('should read a flat locale file that starts with a byte-order mark', async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.readFile).mockResolvedValue('\uFEFF{"greeting":"Hello"}');
    expect(await mutator.readLocale(BASE_PATH, 'en')).toEqual({ greeting: 'Hello' });
  });

  it('should read namespace files that start with a byte-order mark', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readdir).mockResolvedValue(['common.json' as any]);
    vi.mocked(fs.readFile).mockResolvedValueOnce('\uFEFF{"title":"Welcome"}');
    expect(await mutator.readLocale(BASE_PATH, 'en')).toEqual({ common: { title: 'Welcome' } });
  });

  it('should merge namespace files when the locale is a directory', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any);
    vi.mocked(fs.readdir).mockResolvedValue([
      'common.json' as any,
      'auth.json' as any,
      'notes.txt' as any,
    ]);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('{"title":"Welcome"}')
      .mockResolvedValueOnce('{"login":"Log In"}');
    expect(await mutator.readLocale(BASE_PATH, 'en')).toEqual({
      common: { title: 'Welcome' },
      auth: { login: 'Log In' },
    });
  });

  it('should reject a locale that escapes the locales directory', async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
    await expect(mutator.readLocale(BASE_PATH, '../secrets')).rejects.toThrow(/traversal/i);
  });

  describe('FileMutator({ requireEnabled: false })', () => {
    it('writes and reads when NODE_ENV is production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.mocked(fs.readFile).mockResolvedValue('{\n  "greeting": "Hello"\n}\n');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      const m = new FileMutator({ requireEnabled: false });
      await m.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('en.json.tmp'),
        '{\n  "greeting": "Hi"\n}\n',
        'utf-8'
      );
      await expect(m.readLocale(BASE_PATH, 'en')).resolves.toEqual({ greeting: 'Hello' });
    });

    it('ignores the LIVELOCALE=off kill switch (CLI-only option)', async () => {
      vi.stubEnv('LIVELOCALE', 'off');
      vi.mocked(fs.readFile).mockResolvedValue('{}');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      await expect(
        new FileMutator({ requireEnabled: false }).updateLocaleKey(BASE_PATH, 'en', 'a', 'b')
      ).resolves.toBeUndefined();
    });

    it('lists locales and scans key metadata outside development', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const m = new FileMutator({ requireEnabled: false });
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'en.json', isDirectory: () => false, isFile: () => true },
      ] as any);
      expect(await m.listLocales(BASE_PATH)).toEqual(['en']);
      vi.mocked(fs.readdir).mockResolvedValue([] as any);
      vi.mocked(fs.stat).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      expect(await m.getKeysMetadata(BASE_PATH)).toEqual({ allKeys: [], codeKeys: [] });
    });

    it('still refuses by default', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      await expect(new FileMutator({}).updateLocaleKey(BASE_PATH, 'en', 'a', 'b')).rejects.toThrow(
        /development/i
      );
    });
  });
});
