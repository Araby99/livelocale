// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { encodeChangeLink, type ChangeSet } from '../../src/core/change-link.js';
import { runLocalApply } from '../../src/codemod/apply/local.js';

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim();
}

const EN = { home: { title: 'Hello' } };
const AR = { home: { title: 'أهلا' } };

const SET: ChangeSet = {
  branch: '',
  base: '',
  src: 'en',
  by: 'Mona',
  note: '',
  edits: [{ locale: 'ar', key: 'home.title', from: 'أهلا', to: 'مرحبًا', force: false }],
};

/** A repository on `main` with locales/en.json and locales/ar.json, pushed to a bare `origin.git`. */
function makeRepo(): { repo: string; bare: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-apply-pr-'));
  tempDirs.push(root);
  const repo = path.join(root, 'repo');
  const bare = path.join(root, 'origin.git');
  fs.mkdirSync(path.join(repo, 'locales'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'locales', 'en.json'), JSON.stringify(EN, null, 2) + '\n');
  fs.writeFileSync(path.join(repo, 'locales', 'ar.json'), JSON.stringify(AR, null, 2) + '\n');
  git(root, 'init', '-q', '--bare', bare);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'config', 'core.autocrlf', 'false');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  return { repo, bare };
}

describe('runLocalApply --pr', () => {
  it('commits to a new branch, pushes it, opens a pull request and returns to the original branch', async () => {
    const { repo, bare } = makeRepo();
    const arFile = path.join(repo, 'locales', 'ar.json');
    const token = await encodeChangeLink(SET);
    const alreadyDoneToken = await encodeChangeLink({
      ...SET,
      edits: [{ locale: 'ar', key: 'home.title', from: 'أهلا', to: 'أهلا', force: false }],
    });
    const logs: string[] = [];
    const log = (l: string) => logs.push(l);
    const now = () => new Date('2026-10-26T10:00:00Z');

    const r = await runLocalApply({
      projectDir: repo,
      input: token,
      pr: true,
      log,
      now,
      exec: {
        gh: async () => {
          throw Object.assign(new Error('x'), { code: 'ENOENT' });
        },
      },
    });
    const branch = r.branch!;
    expect(branch).toBe('livelocale/apply-20261026-100000');
    expect(git(repo, 'ls-remote', '--heads', 'origin')).toContain(`refs/heads/${branch}`);
    expect(git(repo, 'log', '-1', '--format=%B', branch)).toContain('Translated-by: Mona');
    expect(git(repo, 'show', '--name-only', '--format=', branch).trim()).toBe('locales/ar.json');
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(logs.join('\n')).toContain(`Pushed ${branch}`);

    // GitHub remote: fetch URL https://github.com/acme/site.git, pushurl = bare repo
    git(repo, 'remote', 'set-url', 'origin', 'https://github.com/acme/site.git');
    git(repo, 'remote', 'set-url', '--push', 'origin', bare);
    const bodies: string[] = [];
    const gh = vi.fn(async (args: string[]) => {
      bodies.push(fs.readFileSync(args[args.indexOf('--body-file') + 1]!, 'utf-8'));
      return 'https://github.com/acme/site/pull/5\n';
    });
    const r2 = await runLocalApply({
      projectDir: repo,
      input: token,
      pr: true,
      log,
      now,
      exec: { gh },
    });
    expect(r2.prUrl).toBe('https://github.com/acme/site/pull/5');
    expect(r2.branch).toBe('livelocale/apply-20261026-100000-2'); // the first name exists locally and on origin
    expect(gh.mock.calls[0]![0].slice(0, 8)).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'livelocale/apply-20261026-100000-2',
      '--title',
      'i18n: LiveLocale changes',
    ]);
    expect(bodies[0]).toContain('`livelocale check`');

    fs.writeFileSync(arFile, '{}');
    await expect(
      runLocalApply({ projectDir: repo, input: token, pr: true, log, now })
    ).rejects.toThrow(/Commit or stash/);
    git(repo, 'checkout', '--', 'locales/ar.json');
    expect(
      (await runLocalApply({ projectDir: repo, input: alreadyDoneToken, pr: true, log, now }))
        .branch
    ).toBeUndefined();
  }, 60_000);
});
