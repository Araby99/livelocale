// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { encodeChangeLink, type ChangeSet } from '../../src/core/change-link.js';
import { runLocalApply } from '../../src/codemod/apply/local.js';
import { renderTerminalSummary } from '../../src/codemod/apply/report.js';

const tempDirs: string[] = [];

/** Writes `files` (project-relative POSIX paths) into a fresh temporary project. */
function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-apply-local-'));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf-8');
  }
  return dir;
}

let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Catches any console line outside the summary; apply prints the summary only.
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const SET: ChangeSet = {
  branch: '',
  base: '',
  src: 'en',
  by: 'Mona',
  note: '',
  edits: [
    { locale: 'ar', key: 'home.title', from: 'أهلا', to: 'مرحبًا', force: false },
    { locale: 'ar', key: 'home.greet', from: 'مرحبا {name}', to: 'مرحبا', force: false },
  ],
};

const EN = { home: { title: 'Hello', greet: 'Hello {name}' } };
const AR = { home: { title: 'أهلا', greet: 'مرحبا {name}' } };

describe('runLocalApply', () => {
  it('applies valid edits into the working tree and keeps each file format', async () => {
    const projectDir = makeProject({
      'locales/en.json': JSON.stringify(EN, null, 2) + '\n',
      'locales/ar.json': JSON.stringify(AR, null, '\t'),
    });
    const enFile = path.join(projectDir, 'locales', 'en.json');
    const arFile = path.join(projectDir, 'locales', 'ar.json');
    const enBefore = fs.readFileSync(enFile, 'utf-8');
    const token = await encodeChangeLink(SET);
    const logs: string[] = [];
    const log = (l: string) => logs.push(l);

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    // Dry run first, against the fresh project.
    const arBefore = fs.readFileSync(arFile, 'utf-8');
    const dryLogs: string[] = [];
    const dry = await runLocalApply({
      projectDir,
      input: token,
      dryRun: true,
      log: (l) => dryLogs.push(l),
    });
    expect(dry.plan.counts).toMatchObject({ apply: 1, invalid: 1 });
    expect(dry.written).toEqual([]);
    expect(fs.readFileSync(arFile, 'utf-8')).toBe(arBefore);
    expect(dryLogs).toEqual([renderTerminalSummary(dry.plan)]);

    const r = await runLocalApply({
      projectDir,
      input: `https://acme.com/livelocale/index.html#${token}`,
      log,
    });
    expect(r.plan.counts).toMatchObject({ apply: 1, invalid: 1 });
    expect(r.exitCode).toBe(1);
    expect(r.written).toEqual(['locales/ar.json']);
    const ar = fs.readFileSync(arFile, 'utf-8');
    expect(JSON.parse(ar).home.title).toBe('مرحبًا');
    expect(JSON.parse(ar).home.greet).toBe('مرحبا {name}');
    expect(ar).toMatch(/^\t"home"/m);
    expect(ar.endsWith('\n')).toBe(false);
    expect(fs.readFileSync(enFile, 'utf-8')).toBe(enBefore);
    expect(logs.join('\n')).toContain('Applied 1');
    // The terminal summary is the only output: no per-key FileMutator lines.
    expect(logs).toEqual([renderTerminalSummary(r.plan)]);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain('مرحبًا');
  });

  it('updates a namespaced locale file in place', async () => {
    const projectDir = makeProject({
      'locales/en/home.json': JSON.stringify({ title: 'Hello' }),
      'locales/ar/home.json': JSON.stringify({ title: 'أهلا' }),
    });
    const token = await encodeChangeLink({ ...SET, edits: [SET.edits[0]!] });
    const r = await runLocalApply({ projectDir, input: token, log: () => {} });
    expect(r.exitCode).toBe(0);
    expect(r.written).toEqual(['locales/ar/home.json']);
    const file = path.join(projectDir, 'locales', 'ar', 'home.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ title: 'مرحبًا' });
  });

  it('warns when the link names another source locale', async () => {
    const projectDir = makeProject({
      'locales/en.json': JSON.stringify(EN),
      'locales/ar.json': JSON.stringify(AR),
    });
    const token = await encodeChangeLink({ ...SET, src: 'fr', edits: [SET.edits[0]!] });
    const logs: string[] = [];
    const r = await runLocalApply({ projectDir, input: token, log: (l) => logs.push(l) });
    expect(r.exitCode).toBe(0);
    expect(logs).toContain(
      'The link says the source locale is `fr`; using `en` (pass --source to change).'
    );
  });

  it('marks an edit for a locale without a file invalid', async () => {
    const projectDir = makeProject({ 'locales/en.json': JSON.stringify(EN) });
    const token = await encodeChangeLink({ ...SET, edits: [SET.edits[0]!] });
    const r = await runLocalApply({ projectDir, input: token, log: () => {} });
    expect(r.plan.edits[0]).toMatchObject({ status: 'invalid', code: 'UNKNOWN_LOCALE' });
    expect(r.exitCode).toBe(1);
    expect(r.written).toEqual([]);
  });

  it('uses the first locale as the source when there is no en', async () => {
    const projectDir = makeProject({
      'locales/ar.json': JSON.stringify(AR),
      'locales/de.json': JSON.stringify({ home: { title: 'Hallo', greet: 'Hallo {name}' } }),
    });
    const token = await encodeChangeLink({ ...SET, src: 'fr', edits: [SET.edits[0]!] });
    const logs: string[] = [];
    await runLocalApply({ projectDir, input: token, log: (l) => logs.push(l) });
    expect(logs).toContain(
      'The link says the source locale is `fr`; using `ar` (pass --source to change).'
    );
  });

  it('refuses a locales folder that does not exist', async () => {
    const projectDir = makeProject({ 'README.md': '' });
    const token = await encodeChangeLink(SET);
    await expect(
      runLocalApply({ projectDir, input: token, localesPath: 'src/locales', log: () => {} })
    ).rejects.toThrow('No locales folder at src/locales.');
  });
});
