import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

/**
 * Runs the BUILT CLI from a copy of the package placed outside the repository,
 * so that module resolution cannot reach the repo's node_modules. This is the
 * environment a JavaScript-only consumer gets after `npm install next-i18n-lens`.
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

describe.skipIf(!hasBuild)('packaged CLI runs without devDependencies', () => {
  let sandbox: string;
  let pkgDir: string;
  let projectDir: string;

  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-lens-pkg-'));
    pkgDir = path.join(sandbox, 'node_modules', 'next-i18n-lens');
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
  });

  it('should run `init` in a JavaScript project and write the route handler', () => {
    const result = runCli(pkgDir, projectDir, ['init']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const routeFile = path.join(projectDir, 'app', 'api', 'i18n-lens', 'mutate', 'route.js');
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
});

describe.skipIf(hasBuild)('packaged CLI (skipped)', () => {
  it('needs `npm run build` before it can run', () => {
    console.warn('[cli-package.test] dist/ not found; run `npm run build` to enable this test');
  });
});
