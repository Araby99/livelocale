// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  runGitHubEventApply,
  type GitHubEventOptions,
} from '../../src/codemod/apply/github-event.js';
import { encodeChangeLink, toBase64Url, type ChangeSet } from '../../src/core/change-link.js';
import { FakeGitHub } from './helpers/fake-github.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/github-events');
/** The placeholder token every fixture carries; `fxWith` swaps in a real one. */
const FIXTURE_TOKEN = 'lc1.eJyrVkrOT0lVslJKzEvMS0ksSlWqBQBBkAbr';

const EN = '{\n  "home": {\n    "title": "Hello {name}"\n  }\n}\n';
const AR = '{\n  "home": {\n    "title": "أهلا {name}"\n  }\n}\n';
const ISSUE_BODY = `Please apply these translation fixes.\n\n\`\`\`livelocale\n${FIXTURE_TOKEN}\n\`\`\`\n`;

function changeSet(overrides: Partial<ChangeSet> = {}): ChangeSet {
  return {
    branch: 'main',
    base: '',
    src: 'en',
    by: 'Sara',
    note: '',
    edits: [
      { locale: 'ar', key: 'home.title', from: 'أهلا {name}', to: 'مرحبا {name}', force: false },
    ],
    ...overrides,
  };
}

let token: string;
let forcedOnlyToken: string;
let rawToken501Edits: string;
const tokenFromBranch = (branch: string) => encodeChangeLink(changeSet({ branch }));
const tokenForRepo = (repo: string) => encodeChangeLink(changeSet({ repo }));

beforeAll(async () => {
  token = await encodeChangeLink(changeSet());
  forcedOnlyToken = await encodeChangeLink(
    changeSet({
      edits: [{ locale: 'ar', key: 'home.title', from: 'أهلا {name}', to: 'مرحبا', force: true }],
    })
  );
  const wire = {
    v: 1,
    branch: 'main',
    base: '',
    src: 'en',
    by: '',
    note: '',
    e: Array.from({ length: 501 }, (_, i) => ['ar', `k${i}`, null, 'x']),
  };
  rawToken501Edits =
    'lc1.' + toBase64Url(new Uint8Array(zlib.deflateSync(Buffer.from(JSON.stringify(wire)))));
});

let tmp: string;
let workspace: string;
let summaryFile: string;
let gh: FakeGitHub;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-gh-event-'));
  workspace = path.join(tmp, 'workspace');
  fs.mkdirSync(workspace);
  summaryFile = path.join(tmp, 'summary.md');
  gh = new FakeGitHub();
  const files = { 'locales/en.json': EN, 'locales/ar.json': AR, 'README.md': '# site\n' };
  gh.seedBranch('main', files);
  gh.seedBranch('staging', files);
  for (const [number, login] of [
    [7, 'maint'],
    [8, 'sara'],
  ] as const) {
    gh.issues[number] = {
      number,
      state: 'open',
      state_reason: null,
      body: ISSUE_BODY,
      user: { login },
    };
  }
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** The path of a fixture event, unchanged. */
function fx(name: string): string {
  return path.join(FIXTURES, `${name}.json`);
}

/** Writes the fixture to tmp with `link` in place of the placeholder token. */
async function fxWith(name: string, link: string | Promise<string>): Promise<string> {
  const text = fs
    .readFileSync(fx(name), 'utf-8')
    .split(FIXTURE_TOKEN)
    .join(await link);
  const file = path.join(tmp, `${name}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, text, 'utf-8');
  return file;
}

async function run(
  eventName: string,
  eventFile: string | Promise<string>,
  ghOptions: { permission?: string } = {},
  options: Partial<GitHubEventOptions> = {}
) {
  if (ghOptions.permission !== undefined) gh.permission = ghOptions.permission;
  return runGitHubEventApply({
    env: {
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: await eventFile,
      GITHUB_REPOSITORY: 'acme/site',
      GITHUB_TOKEN: 'test-token',
      GITHUB_RUN_ID: '4242',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_API_URL: 'https://api.github.com',
      GITHUB_WORKSPACE: workspace,
      GITHUB_STEP_SUMMARY: summaryFile,
    },
    localesPath: 'locales',
    sourceLocale: 'en',
    fetchImpl: gh.fetch,
    log: () => {},
    ...options,
  });
}

const gitWrites = (calls: FakeGitHub['calls']) =>
  calls.some((c) => c.method === 'POST' && c.path.startsWith('/git/'));

describe('runGitHubEventApply', () => {
  it('turns a maintainer issue into one commit and a pull request', async () => {
    expect(await run('issues', fxWith('issues-opened-member', token))).toBe('pr');
    expect(gh.refs['livelocale/issue-7']).toBeDefined();
    expect(gh.calls.filter((c) => c.path === '/git/commits' && c.method === 'POST')).toHaveLength(
      1
    );
    expect(gh.pulls[0]).toMatchObject({ head: 'livelocale/issue-7', base: 'main' });
    expect(gh.pulls[0]!.title).toBe('i18n: LiveLocale changes (#7)');
    expect(gh.pulls[0]!.body).toContain('Closes #7');
    expect(gh.pulls[0]!.body).toContain('Run log: https://github.com/acme/site/actions/runs/4242');
    expect(gh.pulls[0]!.body).toContain('`livelocale check`');
    expect(gh.comments[7]!.at(-1)).toContain(gh.pulls[0]!.html_url);
    expect(JSON.parse(gh.fileAt('livelocale/issue-7', 'locales/ar.json')!).home.title).toBe(
      'مرحبا {name}'
    );
    expect(gh.lastCommit.author).toEqual({
      name: 'maint',
      email: '101+maint@users.noreply.github.com',
    });
    expect(gh.lastCommit.message).toContain('Translated-by: Sara');
  });

  it('waits for a maintainer when the issue author is untrusted', async () => {
    expect(
      await run('issues', fxWith('issues-opened-contributor', token), { permission: 'read' })
    ).toBe('waiting-for-maintainer');
    expect(gh.comments[8]!.at(-1)).toBe('Waiting for a maintainer: comment `/livelocale apply`');
    expect(gitWrites(gh.calls)).toBe(false);
    expect(
      await run('issues', fxWith('issues-opened-contributor', token), { permission: 'write' })
    ).toBe('pr');
    expect(gh.refs['livelocale/issue-8']).toBeDefined();
  });

  it('gates the commenter, never the issue author, on a --force comment', async () => {
    const before = gh.calls.length;
    expect(
      await run('issue_comment', fxWith('issue-comment-force-untrusted', forcedOnlyToken), {
        permission: 'read',
      })
    ).toBe('waiting-for-maintainer');
    expect(gitWrites(gh.calls.slice(before))).toBe(false);
    expect(gh.calls.slice(before)).toContainEqual(
      expect.objectContaining({ method: 'GET', path: '/collaborators/outsider/permission' })
    );
    expect(gh.comments[7]!.at(-1)).toBe('Waiting for a maintainer: comment `/livelocale apply`');
  });

  it('targets the default branch when the link branch is not allowed, and says so', async () => {
    await run(
      'issues',
      fxWith('issues-opened-member', tokenFromBranch('staging')),
      {},
      { branches: ['main'] }
    );
    expect(gh.pulls[0]!.base).toBe('main');
    expect(gh.comments[7]!.at(-1)).toContain('not in the allowed branches');
  });

  it('targets an allowed non-default branch with Refs instead of Closes', async () => {
    await run(
      'issues',
      fxWith('issues-opened-member', tokenFromBranch('staging')),
      {},
      { branches: ['main', 'staging'] }
    );
    expect(gh.pulls[0]!.base).toBe('staging');
    expect(gh.pulls[0]!.body).toContain('Refs #7');
    expect(gh.pulls[0]!.body).not.toContain('Closes #7');
  });

  it('falls back to a compare link when Actions may not create pull requests', async () => {
    gh.prCreationForbidden = true;
    expect(await run('issues', fxWith('issues-opened-member', token))).toBe('compare');
    expect(gh.pulls).toHaveLength(0);
    expect(gh.comments[7]!.at(-1)).toContain(
      'https://github.com/acme/site/compare/main...livelocale/issue-7?quick_pull=1'
    );
    expect(gh.comments[7]!.at(-1)).toContain('&body=Closes%20%237');
  });

  it('applies a forced edit only after a maintainer comments --force', async () => {
    expect(await run('issues', fxWith('issues-opened-member', forcedOnlyToken))).toBe(
      'nothing-to-apply'
    );
    expect(gh.comments[7]!.at(-1)).toContain('/livelocale apply --force');
    expect(gitWrites(gh.calls)).toBe(false);
    expect(await run('issue_comment', fxWith('issue-comment-force', forcedOnlyToken))).toBe('pr');
    expect(JSON.parse(gh.fileAt('livelocale/issue-7', 'locales/ar.json')!).home.title).toBe(
      'مرحبا'
    );
  });

  it('reuses the open pull request and makes no second commit for identical content', async () => {
    await run('issues', fxWith('issues-opened-member', token));
    const commits = gh.commitCount;
    expect(await run('issue_comment', fxWith('issue-comment-apply', token))).toBe('pr');
    expect(gh.commitCount).toBe(commits);
    expect(gh.pulls).toHaveLength(1);
    expect(gh.comments[7]!.at(-1)).toContain('Updated pull request');
  });

  it('keeps an earlier batch on the open pull request branch when a second link touches the same file', async () => {
    const en = '{\n  "home": {\n    "title": "Hello {name}",\n    "subtitle": "Welcome"\n  }\n}\n';
    const ar = '{\n  "home": {\n    "title": "أهلا {name}",\n    "subtitle": "اهلا"\n  }\n}\n';
    gh.seedBranch('main', { 'locales/en.json': en, 'locales/ar.json': ar });
    const second = encodeChangeLink(
      changeSet({
        edits: [{ locale: 'ar', key: 'home.subtitle', from: 'اهلا', to: 'مرحبا بك', force: false }],
      })
    );
    expect(await run('issues', fxWith('issues-opened-member', token))).toBe('pr');
    expect(await run('issue_comment', fxWith('issue-comment-apply', second))).toBe('pr');
    const onBranch = JSON.parse(gh.fileAt('livelocale/issue-7', 'locales/ar.json')!);
    expect(onBranch.home.title).toBe('مرحبا {name}');
    expect(onBranch.home.subtitle).toBe('مرحبا بك');
    expect(gh.pulls).toHaveLength(1);
  });

  it('keeps a maintainer commit on the open pull request branch when a later link is applied', async () => {
    const en = '{\n  "home": {\n    "title": "Hello {name}",\n    "subtitle": "Welcome"\n  }\n}\n';
    const ar = '{\n  "home": {\n    "title": "أهلا {name}",\n    "subtitle": "اهلا"\n  }\n}\n';
    gh.seedBranch('main', { 'locales/en.json': en, 'locales/ar.json': ar });
    const subtitleOnly = encodeChangeLink(
      changeSet({
        edits: [{ locale: 'ar', key: 'home.subtitle', from: 'اهلا', to: 'مرحبا بك', force: false }],
      })
    );
    expect(await run('issues', fxWith('issues-opened-member', subtitleOnly))).toBe('pr');
    // A maintainer pushes a manual fix to the title on the pull request branch.
    const fixed = JSON.parse(gh.fileAt('livelocale/issue-7', 'locales/ar.json')!);
    fixed.home.title = 'يا هلا {name}';
    gh.seedBranch('livelocale/issue-7', {
      'locales/en.json': en,
      'locales/ar.json': JSON.stringify(fixed, null, 2) + '\n',
    });
    const later = encodeChangeLink(
      changeSet({
        edits: [
          { locale: 'ar', key: 'home.subtitle', from: 'اهلا', to: 'أهلا وسهلا', force: false },
        ],
      })
    );
    expect(await run('issue_comment', fxWith('issue-comment-apply', later))).toBe('pr');
    const onBranch = JSON.parse(gh.fileAt('livelocale/issue-7', 'locales/ar.json')!);
    expect(onBranch.home.title).toBe('يا هلا {name}');
    expect(onBranch.home.subtitle).toBe('أهلا وسهلا');
  });

  it('ignores a comment on a pull request thread without any API call', async () => {
    expect(await run('issue_comment', fx('issue-comment-on-pr'))).toBe('ignored');
    expect(gh.calls).toHaveLength(0);
  });

  it('refuses a link made for another repository', async () => {
    expect(await run('issues', fxWith('issues-opened-member', tokenForRepo('other/repo')))).toBe(
      'wrong-repo'
    );
    expect(gh.comments[7]!.at(-1)).toContain('other/repo');
    expect(gitWrites(gh.calls)).toBe(false);
  });

  it('reports a link over the edit cap as an error', async () => {
    expect(await run('issues', fxWith('issues-opened-member', rawToken501Edits))).toBe('error');
    expect(gh.comments[7]!.at(-1)).toMatch(/^LiveLocale could not apply this link: /);
    expect(gitWrites(gh.calls)).toBe(false);
  });

  it('reports an issue whose block holds no change link', async () => {
    expect(await run('issues', fxWith('issues-opened-member', 'nothing here'))).toBe('error');
    expect(gh.comments[7]!.at(-1)).toContain('No LiveLocale change link (lc1.…) found.');
  });

  it('reports a source locale with no file on the target', async () => {
    expect(
      await run('issues', fxWith('issues-opened-member', token), {}, { sourceLocale: 'fr' })
    ).toBe('error');
    expect(gh.comments[7]!.at(-1)).toContain('Source locale `fr` has no locale file on `main`.');
  });

  it('posts the error comment and rethrows an unexpected failure', async () => {
    await expect(
      run('issues', fxWith('issues-opened-member', token), {}, { localesPath: 'missing' })
    ).rejects.toThrow(/No locales folder/);
    expect(gh.comments[7]!.at(-1)).toMatch(/^LiveLocale could not apply this link: .*No locales/);
  });

  it('closes the issue once its pull request is merged', async () => {
    expect(await run('pull_request', fx('pull-request-closed-merged'))).toBe('closed-issue');
    expect(gh.issues[7]).toMatchObject({ state: 'closed', state_reason: 'completed' });
    expect(gh.comments[7]!.at(-1)).toBe(
      'Closed because https://github.com/acme/site/pull/13 was merged.'
    );
  });

  it('leaves an issue alone that is closed or holds no change block', async () => {
    gh.issues[7]!.state = 'closed';
    expect(await run('pull_request', fx('pull-request-closed-merged'))).toBe('ignored');
    gh.issues[7] = { ...gh.issues[7]!, state: 'open', body: 'no block' };
    expect(await run('pull_request', fx('pull-request-closed-merged'))).toBe('ignored');
    expect(gh.calls.some((c) => c.method !== 'GET')).toBe(false);
  });

  it('opens a pull request from a workflow dispatch and writes the step summary', async () => {
    expect(await run('workflow_dispatch', fxWith('workflow-dispatch', token))).toBe('pr');
    expect(gh.pulls[0]).toMatchObject({
      head: 'livelocale/run-4242',
      title: 'i18n: LiveLocale changes (run 4242)',
    });
    expect(fs.readFileSync(summaryFile, 'utf-8')).toContain('/pull/');
  });

  it('throws without a token or an event file', async () => {
    await expect(
      runGitHubEventApply({
        env: { GITHUB_EVENT_PATH: fx('issues-opened-member') },
        localesPath: 'locales',
        sourceLocale: 'en',
      })
    ).rejects.toThrow(/GITHUB_TOKEN/);
    await expect(
      runGitHubEventApply({
        env: { GITHUB_TOKEN: 't' },
        localesPath: 'locales',
        sourceLocale: 'en',
      })
    ).rejects.toThrow(/GITHUB_EVENT_PATH/);
  });

  it('never logs a translation value', async () => {
    const lines: string[] = [];
    await run('issues', fxWith('issues-opened-member', token), {}, { log: (l) => lines.push(l) });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toMatch(/مرحبا|أهلا/);
  });
});
