// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  runBuildCommand,
  spawnInherit,
  quoteWindowsArg,
  RELATIVE_BASE_WARNING,
  type RunCommand,
} from '../../src/server/pack.js';
import { fakeGit } from './helpers/fake-git.js';
import { makeShareProject, removeShareProjects } from './helpers/share-project.js';

const APP_HTML = '<html><head></head><body></body></html>';
const LEGAL_HTML = '<!doctype html><html><head><title>Legal</title></head><body></body></html>';
const NEXT_PKG = JSON.stringify({ dependencies: { next: '14.2.0' } });
const PREVIEW_WARNING =
  'Next.js pages have no watermarks without --preview; the Studio will open but nothing is editable.';
const GITIGNORE_WARNING = 'Add public/livelocale/ to .gitignore; it is generated on every build.';

let projectDir: string;
let studioDir: string;

function setup(extra: Record<string, string> = {}): void {
  projectDir = makeShareProject({
    extra: {
      'studio/index.html': '<!doctype html><html><head></head><body></body></html>',
      'studio/assets/app.js': 'console.log(1)',
      ...extra,
    },
  });
  studioDir = path.join(projectDir, 'studio');
}

const file = (rel: string) => path.join(projectDir, ...rel.split('/'));
const read = (rel: string) => fs.readFileSync(file(rel), 'utf-8');
const exists = (rel: string) => fs.existsSync(file(rel));
function write(rel: string, text: string): void {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), text, 'utf-8');
}

/** A build command that writes a fresh `dist/index.html` and exits 0. */
const viteRun = () =>
  vi.fn<Parameters<RunCommand>, ReturnType<RunCommand>>(async () => {
    write('dist/index.html', APP_HTML);
    return 0;
  });

beforeEach(() => setup());
afterEach(() => removeShareProjects());

describe('runBuildCommand', () => {
  it('packs a static build after the command succeeds', async () => {
    const run = viteRun();
    const r = await runBuildCommand({
      projectDir,
      command: ['vite', 'build'],
      run,
      env: {},
      git: fakeGit({}),
      studioDir,
    });
    expect(r.exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith('vite', ['build'], { cwd: projectDir, env: {} });
    expect(read('dist/index.html')).toContain('<head><script src="/livelocale/flag.js"></script>');
  });

  it('sets both preview variables with --preview', async () => {
    const run = viteRun();
    const r = await runBuildCommand({
      projectDir,
      command: ['vite', 'build'],
      preview: true,
      run,
      env: { KEEP: '1' },
      git: fakeGit({}),
      studioDir,
    });
    expect(r.exitCode).toBe(0);
    expect(run.mock.calls[0]![2].env).toMatchObject({
      KEEP: '1',
      LIVELOCALE: 'preview',
      NEXT_PUBLIC_LIVELOCALE: 'preview',
    });
  });

  it('returns a failing exit code without packing', async () => {
    const run = vi.fn(async () => {
      write('dist/index.html', APP_HTML);
      return 2;
    });
    const r = await runBuildCommand({
      projectDir,
      command: ['vite', 'build'],
      run,
      env: {},
      git: fakeGit({}),
      studioDir,
    });
    expect(r.exitCode).toBe(2);
    expect(r.pack).toBeNull();
    expect(exists('dist/livelocale')).toBe(false);
  });

  it('rejects a stale output folder', async () => {
    write('dist/index.html', APP_HTML);
    const hourAgo = new Date(Date.now() - 3600_000);
    fs.utimesSync(file('dist/index.html'), hourAgo, hourAgo);
    const run = vi.fn(async () => 0);
    await expect(
      runBuildCommand({
        projectDir,
        command: ['vite', 'build'],
        run,
        env: {},
        git: fakeGit({}),
        studioDir,
      })
    ).rejects.toMatchObject({
      code: 'OUTPUT_NOT_FOUND',
      message:
        'Could not find the build output (looked for a fresh index.html in dist/, build/, out/). Pass --out <dir>.',
    });
    expect(exists('dist/livelocale')).toBe(false);
  });

  it('honours --out', async () => {
    const run = vi.fn(async () => {
      write('site/index.html', APP_HTML);
      return 0;
    });
    const r = await runBuildCommand({
      projectDir,
      command: ['vite', 'build'],
      outDir: 'site',
      run,
      env: {},
      git: fakeGit({}),
      studioDir,
    });
    expect(r.exitCode).toBe(0);
    expect(exists('site/livelocale/manifest.json')).toBe(true);
  });

  it('packs into public/ before a Next build', async () => {
    removeShareProjects();
    setup({ 'package.json': NEXT_PKG, 'public/legal.html': LEGAL_HTML });
    let packedFirst = false;
    const run = vi.fn(async () => {
      packedFirst = exists('public/livelocale/manifest.json');
      return 0;
    });
    const r = await runBuildCommand({
      projectDir,
      command: ['next', 'build'],
      run,
      env: {},
      git: fakeGit({}),
      studioDir,
    });
    expect(r.exitCode).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(packedFirst).toBe(true);
    expect(read('public/legal.html')).toBe(LEGAL_HTML);
  });

  it('creates public/ for a Next project that has none', async () => {
    removeShareProjects();
    setup({ 'package.json': NEXT_PKG });
    const r = await runBuildCommand({
      projectDir,
      command: ['next', 'build'],
      run: vi.fn(async () => 0),
      env: {},
      git: fakeGit({}),
      studioDir,
    });
    expect(r.exitCode).toBe(0);
    expect(exists('public/livelocale/manifest.json')).toBe(true);
  });

  it('passes the relative-base warning through', async () => {
    const run = viteRun();
    const r = await runBuildCommand({
      projectDir,
      base: './',
      command: ['vite', 'build'],
      run,
      env: {},
      git: fakeGit({}),
      studioDir,
    });
    expect(r.warnings).toContain(RELATIVE_BASE_WARNING);
  });

  it('stops a Next export with a POST route before building', async () => {
    removeShareProjects();
    setup({
      'package.json': NEXT_PKG,
      'next.config.js': "module.exports = { output: 'export' };\n",
      'app/api/livelocale/route.ts': 'export async function POST() {}\n',
    });
    const run = vi.fn(async () => 0);
    await expect(
      runBuildCommand({
        projectDir,
        command: ['next', 'build'],
        run,
        env: {},
        git: fakeGit({}),
        studioDir,
      })
    ).rejects.toMatchObject({
      code: 'NEXT_EXPORT_POST_ROUTE',
      message:
        "Next.js static export (output: 'export') cannot build app/api/livelocale/route.ts: it exports POST, and export mode only allows GET route handlers. The share link does not need this route. Delete app/api/livelocale/route.ts (or move it out of this build) and run again.",
    });
    expect(run).not.toHaveBeenCalled();
    expect(exists('public/livelocale')).toBe(false);
  });

  it('warns about --preview and .gitignore for Next', async () => {
    removeShareProjects();
    setup({ 'package.json': NEXT_PKG });
    const build = () =>
      runBuildCommand({
        projectDir,
        command: ['next', 'build'],
        run: vi.fn(async () => 0),
        env: {},
        git: fakeGit({}),
        studioDir,
      });
    const first = await build();
    expect(first.warnings).toContain(PREVIEW_WARNING);
    expect(first.warnings).toContain(GITIGNORE_WARNING);

    write('.gitignore', 'node_modules/\npublic/livelocale/\n');
    const second = await build();
    expect(second.warnings).toContain(PREVIEW_WARNING);
    expect(second.warnings).not.toContain(GITIGNORE_WARNING);
  });

  it('rejects an empty command', async () => {
    const run = vi.fn(async () => 0);
    await expect(
      runBuildCommand({ projectDir, command: [], run, env: {}, git: fakeGit({}), studioDir })
    ).rejects.toMatchObject({
      code: 'USAGE',
      message: 'Usage: livelocale build [--preview] -- <your build command>',
    });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('spawnInherit', () => {
  it.each([
    ['build', 'build'],
    ['a b', '"a b"'],
    ['say "hi"', '"say \\"hi\\""'],
    ['', '""'],
  ])('quoteWindowsArg(%j)', (a, q) => expect(quoteWindowsArg(a)).toBe(q));

  it('spawnInherit returns the child exit code', async () =>
    expect(
      await spawnInherit(process.execPath, ['-e', 'process.exit(3)'], {
        cwd: process.cwd(),
        env: process.env,
      })
    ).toBe(3));
});
