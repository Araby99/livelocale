// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyEditsToText,
  buildFileChanges,
  commitFiles,
  localeFileFor,
  noreplyAuthor,
  normalizeRepoDir,
  prepareBranch,
  readRemoteLocales,
} from '../../src/codemod/apply/github-commit.js';
import { planApply, type ApplyPlan } from '../../src/core/apply-plan.js';
import { createGitHubRest, type GitHubRest } from '../../src/server/github-rest.js';
import { FileMutator } from '../../src/server/file-mutator.js';
import { FakeGitHub } from './helpers/fake-github.js';

const EN = '{\n  "home": {\n    "title": "Hello"\n  }\n}\n';
const AR = '{\n  "home": {\n    "title": "أهلا"\n  }\n}\n';

let tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

/** What FileMutator writes when it sets `key` to `value` in a flat file holding `fixture`. */
async function viaFileMutator(fixture: string, key: string, value: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-gh-commit-'));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'en.json'), fixture, 'utf-8');
  await new FileMutator({ requireEnabled: false, quiet: true }).updateLocaleKey(
    dir,
    'en',
    key,
    value
  );
  return fs.readFileSync(path.join(dir, 'en.json'), 'utf-8');
}

/** A plan with one `apply` edit whose flat locale file is `file`. */
function planTouching(file: string): ApplyPlan {
  const locale = file.replace(/\.json$/, '');
  return {
    edits: [{ locale, key: 'a', from: null, to: 'x', force: false, status: 'apply', flags: [] }],
    counts: { apply: 1, already: 0, conflict: 0, invalid: 0, 'needs-force': 0 },
  };
}

describe('locale paths and text', () => {
  it('writes text byte-identical to FileMutator', async () => {
    for (const fixture of ['{\n\t"a": "x"\n}', '{\n    "a": "x"\n}\n', '{"a":"x"}']) {
      expect(applyEditsToText(fixture, [{ innerKey: 'a', value: 'y' }])).toBe(
        await viaFileMutator(fixture, 'a', 'y')
      );
    }
    expect(applyEditsToText(EN, [{ innerKey: 'home.sub.x', value: 'z' }])).toBe(
      await viaFileMutator(EN, 'home.sub.x', 'z')
    );
  });

  it('maps a key to its locale file', () => {
    expect(localeFileFor('src/locales', 'namespaced', 'ar', 'home.title')).toEqual({
      file: 'src/locales/ar/home.json',
      innerKey: 'title',
    });
    expect(localeFileFor('locales', 'flat', 'ar', 'home.title')).toEqual({
      file: 'locales/ar.json',
      innerKey: 'home.title',
    });
  });

  it('normalizes a repository folder and refuses one outside the repository', () => {
    expect(normalizeRepoDir('.\\src\\locales\\')).toBe('src/locales');
    expect(normalizeRepoDir('./locales/')).toBe('locales');
    expect(() => normalizeRepoDir('../x')).toThrow();
    expect(() => normalizeRepoDir('locales/../../x')).toThrow();
    expect(() => normalizeRepoDir('/etc')).toThrow();
    expect(() => normalizeRepoDir('C:\\locales')).toThrow();
  });

  it('gives the noreply author of a GitHub user', () => {
    expect(noreplyAuthor({ login: 'maint', id: 42 })).toEqual({
      name: 'maint',
      email: '42+maint@users.noreply.github.com',
    });
  });
});

describe('the Git Data API flow', () => {
  let gh: FakeGitHub;
  let rest: GitHubRest;
  let mainSha: string;
  let stagingSha: string;

  beforeEach(() => {
    gh = new FakeGitHub();
    mainSha = gh.seedBranch('main', {
      'locales/en.json': EN,
      'locales/ar.json': AR,
      'locales/de/home.json': '{\n  "title": "Hallo"\n}\n',
      'package.json': '{}\n',
    });
    stagingSha = gh.seedBranch('staging', {
      'locales/en.json': EN,
      'locales/ar.json': '{\n  "home": {\n    "title": "staging"\n  }\n}\n',
    });
    rest = createGitHubRest({ repo: 'acme/site', token: 't', fetchImpl: gh.fetch });
  });

  it('reads flat and namespaced locales at a commit', async () => {
    const remote = await readRemoteLocales(rest, mainSha, 'locales', ['en', 'ar', 'de', 'fr']);
    expect(remote.sha).toBe(mainSha);
    expect(remote.targets.get('ar')).toEqual({ layout: 'flat', dict: { home: { title: 'أهلا' } } });
    expect(remote.targets.get('de')).toEqual({
      layout: 'namespaced',
      dict: { home: { title: 'Hallo' } },
    });
    expect(remote.targets.get('fr')).toBeNull();
    expect(remote.files.get('locales/ar.json')).toBe(AR);
    expect(remote.files.get('locales/de/home.json')).toBe('{\n  "title": "Hallo"\n}\n');
  });

  it('reads a file over 1 MB through the blob API', async () => {
    const big = JSON.stringify({ home: { title: 'Hello', pad: 'x'.repeat(1_100_000) } });
    const sha = gh.seedBranch('big', { 'locales/en.json': big });
    const remote = await readRemoteLocales(rest, sha, 'locales', ['en']);
    expect(remote.files.get('locales/en.json')).toBe(big);
    expect(gh.calls.some((c) => c.method === 'GET' && c.path.startsWith('/git/blobs/'))).toBe(true);
  });

  it('refuses a change outside the locales folder', async () => {
    const remote = await readRemoteLocales(rest, mainSha, 'locales', ['en', 'ar']);
    expect(() => buildFileChanges('locales', planTouching('../package.json'), remote)).toThrow(
      /outside the locales/
    );
  });

  it('commits a batch once, then appends only while its PR into the same target is open', async () => {
    const remote = await readRemoteLocales(rest, mainSha, 'locales', ['en', 'ar']);
    const plan = planApply({
      edits: [{ locale: 'ar', key: 'home.title', from: 'أهلا', to: 'مرحبا', force: false }],
      sourceLocale: 'en',
      targets: remote.targets,
      allowForce: false,
    });
    const changes = buildFileChanges('locales', plan, remote);
    expect([...changes.keys()]).toEqual(['locales/ar.json']);

    const bp = await prepareBranch(rest, 'livelocale/issue-7', 'main', mainSha, '99');
    expect(bp).toEqual({ branch: 'livelocale/issue-7', parentSha: mainSha, mode: 'new' });
    const result = await commitFiles(rest, {
      branchPlan: bp,
      files: changes,
      message: 'm',
      author: noreplyAuthor({ login: 'maint', id: 42 }),
    });
    expect(gh.calls.filter((c) => c.method === 'POST' && c.path === '/git/commits')).toHaveLength(
      1
    );
    expect(gh.commitCount).toBe(1);
    expect(gh.lastCommit.author.email).toBe('42+maint@users.noreply.github.com');
    expect(gh.lastCommit.committer).toBeUndefined();
    expect(result).toEqual({ sha: gh.refs['livelocale/issue-7'] });
    expect(gh.fileAt('livelocale/issue-7', 'locales/ar.json')).toBe(
      '{\n  "home": {\n    "title": "مرحبا"\n  }\n}\n'
    );
    expect(gh.fileAt('livelocale/issue-7', 'package.json')).toBe('{}\n');
    expect(gh.calls.some((c) => c.path.includes('heads/main') && c.method !== 'GET')).toBe(false);
    expect(gh.refs.main).toBe(mainSha);

    await rest.openOrReusePullRequest({
      head: 'livelocale/issue-7',
      base: 'main',
      title: 't',
      body: 'b',
    });
    gh.refs['livelocale/issue-8'] = mainSha;

    // with an open PR into main
    const append = await prepareBranch(rest, 'livelocale/issue-7', 'main', mainSha, '100');
    expect(append).toEqual({
      branch: 'livelocale/issue-7',
      parentSha: gh.refs['livelocale/issue-7'],
      mode: 'append',
    });
    // the same contents again leave the branch as it is
    expect(
      await commitFiles(rest, {
        branchPlan: append,
        files: changes,
        message: 'm2',
        author: noreplyAuthor({ login: 'maint', id: 42 }),
      })
    ).toEqual({ sha: null, unchanged: true });
    expect(gh.commitCount).toBe(1);

    const more = new Map([['locales/en.json', '{\n  "home": {\n    "title": "Hi"\n  }\n}\n']]);
    const appended = await commitFiles(rest, {
      branchPlan: append,
      files: more,
      message: 'm3',
      author: noreplyAuthor({ login: 'maint', id: 42 }),
    });
    expect(appended).toEqual({ sha: gh.refs['livelocale/issue-7'] });
    expect(gh.lastCommit.parents).toEqual([append.parentSha]);
    const patch = gh.calls.find((c) => c.method === 'PATCH');
    expect(patch).toMatchObject({
      path: '/git/refs/heads/livelocale/issue-7',
      body: { force: false },
    });

    // open PR targets main, not staging
    expect(await prepareBranch(rest, 'livelocale/issue-7', 'staging', stagingSha, '102')).toEqual({
      branch: 'livelocale/issue-7-102',
      parentSha: stagingSha,
      mode: 'new',
    });
    // ref exists, no PR
    expect((await prepareBranch(rest, 'livelocale/issue-8', 'main', mainSha, '101')).branch).toBe(
      'livelocale/issue-8-101'
    );
    expect(gh.calls.some((c) => (c.body as { force?: unknown })?.force === true)).toBe(false);
  });

  it('refuses to write a branch outside livelocale/', async () => {
    await expect(
      commitFiles(rest, {
        branchPlan: { branch: 'main', parentSha: mainSha, mode: 'append' },
        files: new Map([['locales/en.json', '{}\n']]),
        message: 'm',
        author: noreplyAuthor({ login: 'maint', id: 42 }),
      })
    ).rejects.toThrow(/livelocale\//);
    expect(gh.calls).toEqual([]);
  });
});
