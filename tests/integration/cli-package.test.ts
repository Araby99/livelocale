import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { encodeChangeLink } from '../../src/core/change-link.js';

/**
 * Runs the BUILT CLI from a copy of the package placed outside the repository,
 * so that module resolution cannot reach the repo's node_modules. This is the
 * environment a JavaScript-only consumer gets after `npm install livelocale`.
 *
 * Requires `npm run build` to have produced dist/ first (CI builds before testing).
 */
const REPO_ROOT = path.resolve(__dirname, '../..');
const BUILT_CLI = path.join(REPO_ROOT, 'dist', 'codemod', 'index.js');
const hasBuild = fs.existsSync(BUILT_CLI);

function runCli(pkgDir: string, cwd: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(pkgDir, 'dist', 'codemod', 'index.js'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NODE_PATH: '' },
  });
}

/** The consumer project the suite runs the CLI in; set in `beforeAll`. */
let projectDir: string;

/** Writes `rel` (relative to the consumer project), creating its parent folders. */
function write(rel: string, text: string): void {
  const file = path.join(projectDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

/** Reads `rel` (relative to the consumer project) as UTF-8. */
function read(rel: string): string {
  return fs.readFileSync(path.join(projectDir, rel), 'utf-8');
}

/** Reads `rel` (relative to the consumer project) as JSON. */
function readJson(rel: string): any {
  return JSON.parse(read(rel));
}

describe.skipIf(!hasBuild)('packaged CLI runs without devDependencies', () => {
  let sandbox: string;
  let pkgDir: string;

  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-pkg-'));
    pkgDir = path.join(sandbox, 'node_modules', 'livelocale');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'package.json'), path.join(pkgDir, 'package.json'));
    fs.cpSync(path.join(REPO_ROOT, 'dist'), path.join(pkgDir, 'dist'), { recursive: true });

    // A JavaScript-only consumer project: no tsconfig, no typescript installed.
    projectDir = path.join(sandbox, 'consumer');
    fs.mkdirSync(path.join(projectDir, 'app'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'consumer', private: true }),
      'utf-8'
    );
  });

  afterAll(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('should print help and exit 0', () => {
    const result = runCli(pkgDir, projectDir, ['--help']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('npx livelocale');
  });

  it('should install the CLI under the `livelocale` command', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('livelocale');
    expect(pkg.bin).toEqual({ livelocale: 'dist/codemod/index.js' });
  });

  it('should run `init` in a JavaScript project and write the route handler', () => {
    const result = runCli(pkgDir, projectDir, ['init']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const routeFile = path.join(projectDir, 'app', 'api', 'livelocale', 'route.js');
    expect(fs.existsSync(routeFile)).toBe(true);
  });

  it('should run `doctor` against the initialized project and exit 0 without failures', () => {
    fs.mkdirSync(path.join(projectDir, 'locales'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'locales', 'en.json'), '{"hello":"Hi"}', 'utf-8');
    const result = runCli(pkgDir, projectDir, ['doctor']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('✅');
  });

  it('should fail `migrate` with a clear message when typescript is not installed', () => {
    const result = runCli(pkgDir, projectDir, ['migrate', '--dry-run']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("The 'typescript' package is required for the migrate command");
  });

  it('should run `pack` against a built folder', () => {
    write(
      'out/index.html',
      '<!doctype html><html><head><title>x</title></head><body></body></html>'
    );
    const r = runCli(pkgDir, projectDir, ['pack', 'out']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(projectDir, 'out/livelocale/index.html'))).toBe(true);
    expect('repo' in readJson('out/livelocale/manifest.json')).toBe(false);
    expect(read('out/index.html')).toMatch(/<head><script src="\/livelocale\/flag\.js"><\/script>/);
    expect(r.stdout).toContain('✅ LiveLocale share folder written to out/livelocale/');
    expect(r.stdout).toContain('🔗 Open /livelocale/index.html on the deployed site.');
  });

  it('should fail `pack` without an output folder', () => {
    const r = runCli(pkgDir, projectDir, ['pack']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Usage: livelocale pack <outDir>');
  });

  it('should run `build --preview` around a build command', () => {
    write(
      'fake-build.cjs',
      [
        "const fs = require('fs');",
        "fs.mkdirSync('dist', { recursive: true });",
        "fs.writeFileSync('dist/index.html', '<!doctype html><html><head></head><body></body></html>');",
        "fs.writeFileSync('dist/env.txt', String(process.env.LIVELOCALE));",
        '',
      ].join('\n')
    );
    const r = runCli(pkgDir, projectDir, ['build', '--preview', '--', 'node', 'fake-build.cjs']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(read('dist/env.txt')).toBe('preview');
    expect(fs.existsSync(path.join(projectDir, 'dist/livelocale/manifest.json'))).toBe(true);
    expect(r.stdout).toContain('✅ LiveLocale share folder written to dist/livelocale/');
  });

  it('should run `init --share` in a Vite project with a GitHub origin', () => {
    const app = path.join(sandbox, 'vite-app');
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ name: 'vite-app', devDependencies: { vite: '^5.0.0' } }),
      'vite.config.ts':
        "export default { plugins: [liveLocaleVite({ localesPath: './locales' })] };\n",
      'locales/en.json': '{"hello":"Hi"}',
    };
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
      fs.writeFileSync(path.join(app, rel), text, 'utf-8');
    }
    for (const gitArgs of [
      ['init', '-q'],
      ['remote', 'add', 'origin', 'https://github.com/acme/site.git'],
    ]) {
      expect(spawnSync('git', gitArgs, { cwd: app }).status).toBe(0);
    }
    const r = runCli(pkgDir, app, ['init', '--share', '--locales', 'locales', '--source', 'en']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const workflow = path.join(app, '.github', 'workflows', 'livelocale.yml');
    expect(fs.existsSync(workflow)).toBe(true);
    const version = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')
    ).version;
    expect(fs.readFileSync(workflow, 'utf-8')).toContain(`npx --yes livelocale@${version} apply`);
    expect(fs.readFileSync(path.join(app, 'vite.config.ts'), 'utf-8')).toContain(
      'liveLocaleVite({ share: true, '
    );
    expect(r.stdout).toContain('Commit and push: the workflow must be on the default branch.');
  });

  it('should run apply with a change-link file', async () => {
    write('locales/en.json', '{"hello":"Hi"}');
    write('locales/ar.json', '{"hello":"أهلا"}');
    const token = await encodeChangeLink({
      branch: '',
      base: '',
      src: 'en',
      by: 'Mona',
      note: '',
      edits: [{ locale: 'ar', key: 'hello', from: 'أهلا', to: 'مرحبا', force: false }],
    });
    write('changes.txt', `${token}\n`);
    const r = runCli(pkgDir, projectDir, ['apply', 'changes.txt', '--source', 'en']);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Applied 1');
    expect(r.stdout).not.toContain('مرحبا');
    expect(r.stdout).not.toContain('Updated key');
    expect(readJson('locales/ar.json')).toEqual({ hello: 'مرحبا' });
  });
});

describe.skipIf(hasBuild)('packaged CLI (skipped)', () => {
  it('needs `npm run build` before it can run', () => {
    console.warn('[cli-package.test] dist/ not found; run `npm run build` to enable this test');
  });
});
