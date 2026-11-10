// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMutationRouter, type RouterRequest } from '../../src/server/router.js';
import { FileMutator } from '../../src/server/file-mutator.js';
import { keyNotAStringMessage, namespaceNotFoundMessage } from '../../src/core/save-rules.js';

const tempDirs: string[] = [];

function localesDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-save-guard-'));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf-8');
  }
  return dir;
}

const post = (body: unknown): RouterRequest => ({
  method: 'POST',
  url: '/api/livelocale',
  origin: 'http://localhost:3010',
  contentType: 'application/json',
  bodyText: JSON.stringify(body),
});

async function save(dir: string, locale: string, key: string, value: string) {
  const router = createMutationRouter(new FileMutator({ quiet: true }), { localesPath: dir });
  const res = await router.handle(post({ locale, key, value }));
  return { status: res.status, body: JSON.parse(res.body!) };
}

const read = (dir: string, rel: string) => fs.readFileSync(path.join(dir, rel), 'utf-8');

describe('mutation router — save guard on a real locales folder', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LIVELOCALE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['an array item', 'en', '{\n  "features": ["Fast", "Free", "Open"]\n}\n', 'features.1'],
    ['a literal dotted key', 'es', '{\n  "home.title": "Hola"\n}\n', 'home.title'],
    ['a group of translations', 'en', '{\n  "home": {\n    "title": "x"\n  }\n}\n', 'home'],
  ])('answers 409 for %s and leaves the file byte-for-byte', async (_, locale, text, key) => {
    const dir = localesDir({ [`${locale}.json`]: text });
    const res = await save(dir, locale, key, 'Libre');
    expect(res).toEqual({
      status: 409,
      body: { code: 'KEY_NOT_A_STRING', error: keyNotAStringMessage(key, locale) },
    });
    expect(read(dir, `${locale}.json`)).toBe(text);
  });

  it('answers 409 for a namespace no language has and creates no file', async () => {
    const dir = localesDir({ 'en/common.json': '{}\n', 'ar/common.json': '{}\n' });
    const res = await save(dir, 'en', 'nav.home', 'Home');
    expect(res).toEqual({
      status: 409,
      body: { code: 'NAMESPACE_NOT_FOUND', error: namespaceNotFoundMessage('nav') },
    });
    expect(fs.existsSync(path.join(dir, 'en', 'nav.json'))).toBe(false);
  });

  it('creates a namespace file that another language already has', async () => {
    const dir = localesDir({ 'en/common.json': '{"title":"Hello"}\n', 'ar/other.json': '{}\n' });
    expect((await save(dir, 'ar', 'common.title', 'مرحبا')).status).toBe(200);
    expect(JSON.parse(read(dir, 'ar/common.json'))).toEqual({ title: 'مرحبا' });
  });

  it('answers 400 for a key that names no key inside a namespace file', async () => {
    const dir = localesDir({ 'en/common.json': '{"title":"Hello"}\n' });
    const res = await save(dir, 'en', 'common', 'x');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_KEY_FORMAT');
    expect(read(dir, 'en/common.json')).toBe('{"title":"Hello"}\n');
  });

  it.each([
    ['a null text', '{\n  "home": null\n}\n', 'home', { home: 'Hi' }],
    ['a key under a null step', '{\n  "home": null\n}\n', 'home.title', { home: { title: 'Hi' } }],
  ])('saves over %s, which holds no translation to lose', async (_, text, key, after) => {
    // Some export tools write null for a text nobody has translated yet.
    const dir = localesDir({ 'en.json': text });
    expect((await save(dir, 'en', key, 'Hi')).status).toBe(200);
    expect(JSON.parse(read(dir, 'en.json'))).toEqual(after);
  });

  it('still saves an ordinary nested key', async () => {
    const dir = localesDir({ 'en.json': '{\n  "home": {\n    "title": "x"\n  }\n}\n' });
    expect((await save(dir, 'en', 'home.title', 'Hi')).status).toBe(200);
    expect(read(dir, 'en.json')).toBe('{\n  "home": {\n    "title": "Hi"\n  }\n}\n');
  });
});
