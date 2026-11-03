// Runs the built CLI on the docs fixtures and keeps what it really prints, so every `cli <name>`
// block in the docs shows true output (spec §3.3). Each run works on a fresh copy of its fixture
// under the gitignored site/.cache/docs-cli/work/, inside the repo: `check --hardcoded` loads
// typescript from the project's own resolution path, which from there reaches the root
// node_modules. A run that exits with another code than its spec expects fails the docs build.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  cpSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_DIR = fileURLToPath(new URL('../../..', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
const CACHE_DIR = fileURLToPath(new URL('../../.cache/docs-cli', import.meta.url));
const WORK_DIR = join(CACHE_DIR, 'work');

/** @typedef {import('./cli-snippets.d.mts').SnippetSpec} SnippetSpec */

/** @type {Record<string, SnippetSpec>} */
export const SNIPPETS = {
  help: { fixture: null, args: ['--help'], expect: 0 },
  // the install guides' proof that the CLI runs: the first lines of the same real help
  'help-head': { fixture: null, args: ['--help'], expect: 0, head: 4 },
  'init-next': { fixture: 'next-app', args: ['init'], expect: 0 },
  'doctor-next': { fixture: 'next-app', setup: [['init']], args: ['doctor'], expect: 0 },
  'init-share-vite': {
    fixture: 'vite-app',
    git: { remote: 'https://github.com/Araby99/tidewell.git' },
    args: ['init', '--share'],
    expect: 0,
  },
  'check-clean': { fixture: 'vite-app', args: ['check'], expect: 0 },
  'check-missing': { fixture: 'check-missing', args: ['check'], expect: 1 },
  'check-hardcoded': { fixture: 'site/sample', args: ['check', '--hardcoded'], expect: 1 },
  'apply-dry-run': {
    fixture: 'site/stage',
    files: { 'change-link.txt': 'site/scripts/docs/fixtures/change-link.txt' },
    args: ['apply', 'change-link.txt', '--dry-run', '--locales', 'locales'],
    expect: 0,
  },
};

/** The folder a fixture name points at: site/sample and site/stage, or one under fixtures/. */
function fixtureDir(fixture) {
  return fixture.startsWith('site/') ? join(REPO_DIR, fixture) : join(FIXTURES_DIR, fixture);
}

/** Copies a fixture, leaving out installed packages and build output. */
function copyFixture(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => !['node_modules', 'dist'].includes(basename(src)) || src === from,
  });
}

/** Runs a command in dir, throwing when it cannot start or exits non-zero. */
function mustRun(command, args, dir) {
  const run = spawnSync(command, args, { cwd: dir, encoding: 'utf8' });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${run.status}: ${run.stderr.trim()}`);
  }
}

/** The CLI's environment: no colour codes, so the output is plain text. */
function cliEnv() {
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  return env;
}

/**
 * Runs `node <cli> …args` on a fresh copy of the snippet's fixture and returns what it printed
 * (stdout and stderr in the order they were written), with the work folder shown as `my-app`;
 * `head` keeps only that many of its first lines.
 */
export function runSnippet(name, spec, cli) {
  const cliPath = resolve(cli);
  const work = join(WORK_DIR, `${name}-${randomBytes(4).toString('hex')}`);
  const log = `${work}.out`;
  mkdirSync(WORK_DIR, { recursive: true });
  try {
    if (spec.fixture === null) mkdirSync(work);
    else copyFixture(fixtureDir(spec.fixture), work);
    for (const [to, from] of Object.entries(spec.files ?? {})) {
      cpSync(join(REPO_DIR, from), join(work, to));
    }
    if (spec.git) {
      mustRun('git', ['init', '-q', '-b', 'main'], work);
      mustRun('git', ['remote', 'add', 'origin', spec.git.remote], work);
      mustRun(
        'git',
        ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'],
        work
      );
    }
    for (const args of spec.setup ?? []) mustRun(process.execPath, [cliPath, ...args], work);

    // One file for both streams keeps their lines in the order the CLI wrote them.
    const fd = openSync(log, 'w');
    let run;
    try {
      run = spawnSync(process.execPath, [cliPath, ...spec.args], {
        cwd: work,
        env: cliEnv(),
        stdio: ['ignore', fd, fd],
      });
    } finally {
      closeSync(fd);
    }
    if (run.error) throw run.error;
    const output = readFileSync(log, 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/^(?:[ \t]*\n)+/, '')
      .split(work)
      .join('my-app')
      .split(work.replace(/\\/g, '/'))
      .join('my-app')
      .replace(/\\/g, '/')
      .replace(/\s+$/, '');
    const shown = spec.head ? output.split('\n').slice(0, spec.head).join('\n') : output;
    const status = run.status ?? 1;
    if (status !== spec.expect) {
      throw new Error(`snippet ${name} exited ${status}, expected ${spec.expect}`);
    }
    return { command: `npx livelocale ${spec.args.join(' ')}`, output: shown, status };
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(log, { force: true });
  }
}

/** Runs every snippet with the built CLI and writes `<outDir>/<name>.json` for the docs build. */
export function writeCliSnippets(outDir = CACHE_DIR) {
  const cli = join(REPO_DIR, 'dist/codemod/index.js');
  mkdirSync(outDir, { recursive: true });
  for (const [name, spec] of Object.entries(SNIPPETS)) {
    const snippet = runSnippet(name, spec, cli);
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(snippet, null, 2)}\n`);
  }
  console.log(`${Object.keys(SNIPPETS).length} CLI snippets written to ${outDir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    writeCliSnippets();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
