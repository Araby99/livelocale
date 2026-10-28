// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  branchBaseName,
  chooseTargetBranch,
  isTrustedActor,
  parseTrigger,
  type Trigger,
} from '../../src/codemod/apply/github-trigger.js';
import { createGitHubRest, type GitHubRest } from '../../src/server/github-rest.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/github-events/', import.meta.url));

function fx(name: string): any {
  return JSON.parse(fs.readFileSync(`${FIXTURES}${name}.json`, 'utf-8'));
}

/** A real REST client whose fetch answers every request with `status` and `data`. */
function restAnswering(status: number, data: unknown, paths: string[] = []): GitHubRest {
  const fetchImpl = (async (input: string) => {
    paths.push(new URL(input).pathname);
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return createGitHubRest({ repo: 'acme/site', token: 't0ken', fetchImpl });
}

const restWith = (data: unknown, paths?: string[]) => restAnswering(200, data, paths);
const restWith404 = () => restAnswering(404, { message: 'Not Found' });

type ApplyTrigger = Extract<Trigger, { kind: 'apply' }>;

describe('parseTrigger', () => {
  it('reads an opened issue that carries a change block', () => {
    expect(parseTrigger('issues', fx('issues-opened-member'))).toMatchObject({
      kind: 'apply',
      via: 'issue',
      issueNumber: 7,
      association: 'MEMBER',
      force: false,
    });
    const t = parseTrigger('issues', fx('issues-opened-member')) as ApplyTrigger;
    expect(t.actor).toEqual({ login: 'maint', id: 101 });
    expect(t.text).toBe(fx('issues-opened-member').issue.body);
    expect(t.repo).toBe('acme/site');
    expect(t.defaultBranch).toBe('main');
  });

  it("takes the issue author's association for an issue", () => {
    expect(parseTrigger('issues', fx('issues-opened-contributor'))).toMatchObject({
      kind: 'apply',
      issueNumber: 8,
      actor: { login: 'sara', id: 202 },
      association: 'CONTRIBUTOR',
    });
  });

  it('ignores an issue event that is not opened', () => {
    expect(parseTrigger('issues', fx('issues-labeled')).kind).toBe('ignore');
  });

  it('ignores an opened issue without a change block', () => {
    const event = fx('issues-opened-member');
    event.issue.body = 'Just a bug report, lc1.abc';
    expect(parseTrigger('issues', event).kind).toBe('ignore');
  });

  it('reads /livelocale apply --force from the commenter', () => {
    expect(parseTrigger('issue_comment', fx('issue-comment-force'))).toMatchObject({
      kind: 'apply',
      via: 'comment',
      force: true,
      actor: { login: 'maint' },
      association: 'MEMBER',
    });
  });

  it("gates on the commenter, never on the maintainer's issue", () => {
    expect(parseTrigger('issue_comment', fx('issue-comment-force-untrusted'))).toMatchObject({
      kind: 'apply',
      via: 'comment',
      force: true,
      actor: { login: 'outsider' },
      association: 'NONE',
    });
  });

  it('reads /livelocale apply without force and takes the text from the issue', () => {
    const event = fx('issue-comment-apply');
    const t = parseTrigger('issue_comment', event) as ApplyTrigger;
    expect(t).toMatchObject({ kind: 'apply', via: 'comment', issueNumber: 7, force: false });
    expect(t.text).toBe(event.issue.body);
  });

  it('takes the text from the comment when the comment holds a change link', () => {
    const event = fx('issue-comment-apply');
    event.comment.body = '/livelocale apply\n\nlc1.Zm9vYmFy';
    expect((parseTrigger('issue_comment', event) as ApplyTrigger).text).toBe(event.comment.body);
  });

  it('accepts trailing whitespace and a CRLF after the command', () => {
    const event = fx('issue-comment-force');
    event.comment.body = '/livelocale   apply  --force  \r\nthanks';
    expect(parseTrigger('issue_comment', event)).toMatchObject({ kind: 'apply', force: true });
  });

  it('ignores a comment on a pull request', () => {
    expect(parseTrigger('issue_comment', fx('issue-comment-on-pr')).kind).toBe('ignore');
  });

  it('ignores a comment by a bot', () => {
    expect(parseTrigger('issue_comment', fx('issue-comment-bot')).kind).toBe('ignore');
  });

  it('ignores an unknown /livelocale command', () => {
    expect(parseTrigger('issue_comment', fx('issue-comment-unknown'))).toEqual({
      kind: 'ignore',
      reason: 'unknown command',
    });
    const event = fx('issue-comment-apply');
    event.comment.body = '/livelocale apply --forcefully';
    expect(parseTrigger('issue_comment', event)).toEqual({
      kind: 'ignore',
      reason: 'unknown command',
    });
  });

  it('ignores a comment that is not a /livelocale command', () => {
    const event = fx('issue-comment-apply');
    event.comment.body = 'Looks good to me.\n/livelocale apply';
    expect(parseTrigger('issue_comment', event).kind).toBe('ignore');
  });

  it('ignores a comment that was edited or deleted', () => {
    const event = fx('issue-comment-apply');
    event.action = 'edited';
    expect(parseTrigger('issue_comment', event).kind).toBe('ignore');
  });

  it('reads a workflow dispatch without an issue or association', () => {
    const event = fx('workflow-dispatch');
    expect(parseTrigger('workflow_dispatch', event)).toMatchObject({
      via: 'dispatch',
      issueNumber: null,
      association: null,
    });
    expect(parseTrigger('workflow_dispatch', event)).toMatchObject({
      kind: 'apply',
      actor: { login: 'maint', id: 101 },
      text: event.inputs.link,
      force: false,
      repo: 'acme/site',
      defaultBranch: 'main',
    });
  });

  it('closes the issue when its livelocale pull request closes', () => {
    expect(parseTrigger('pull_request', fx('pull-request-closed-merged'))).toMatchObject({
      kind: 'close-issue',
      issueNumber: 7,
      merged: true,
    });
    expect(parseTrigger('pull_request', fx('pull-request-closed-merged'))).toEqual({
      kind: 'close-issue',
      issueNumber: 7,
      prUrl: 'https://github.com/acme/site/pull/13',
      merged: true,
      repo: 'acme/site',
    });
  });

  it('reads the issue number from a -<runId> branch', () => {
    const event = fx('pull-request-closed-merged');
    event.pull_request.head.ref = 'livelocale/issue-7-123456';
    event.pull_request.merged = false;
    expect(parseTrigger('pull_request', event)).toMatchObject({
      kind: 'close-issue',
      issueNumber: 7,
      merged: false,
    });
  });

  it('ignores a pull request from a fork', () => {
    expect(parseTrigger('pull_request', fx('pull-request-closed-fork')).kind).toBe('ignore');
  });

  it('ignores a pull request that is not closed or not a livelocale branch', () => {
    const reopened = fx('pull-request-closed-merged');
    reopened.action = 'reopened';
    expect(parseTrigger('pull_request', reopened).kind).toBe('ignore');
    for (const ref of [
      'feature/x',
      'livelocale/run-55',
      'livelocale/issue-7-x',
      'livelocale/issue-',
    ]) {
      const event = fx('pull-request-closed-merged');
      event.pull_request.head.ref = ref;
      expect(parseTrigger('pull_request', event).kind).toBe('ignore');
    }
  });

  it('ignores any other event', () => {
    expect(parseTrigger('push', { repository: fx('workflow-dispatch').repository }).kind).toBe(
      'ignore'
    );
  });
});

describe('isTrustedActor', () => {
  it('trusts OWNER, MEMBER and COLLABORATOR without a request', async () => {
    const paths: string[] = [];
    expect(await isTrustedActor(restWith({}, paths), 'm', 'MEMBER')).toBe(true);
    expect(await isTrustedActor(restWith({}, paths), 'o', 'OWNER')).toBe(true);
    expect(await isTrustedActor(restWith({}, paths), 'c', 'COLLABORATOR')).toBe(true);
    expect(paths).toEqual([]);
  });

  it('asks the permission API for anyone else', async () => {
    const paths: string[] = [];
    expect(
      await isTrustedActor(
        restWith({ permission: 'write', role_name: 'write' }, paths),
        'c',
        'CONTRIBUTOR'
      )
    ).toBe(true);
    expect(paths).toEqual(['/repos/acme/site/collaborators/c/permission']);
  });

  it('trusts admin and maintain roles', async () => {
    expect(await isTrustedActor(restWith({ permission: 'admin' }), 'a', 'NONE')).toBe(true);
    expect(
      await isTrustedActor(restWith({ permission: 'read', role_name: 'maintain' }), 'a', 'NONE')
    ).toBe(true);
    expect(await isTrustedActor(restWith({ role_name: 'admin' }), 'a', null)).toBe(true);
  });

  it('does not trust read or triage', async () => {
    expect(
      await isTrustedActor(
        restWith({ permission: 'read', role_name: 'triage' }),
        'c',
        'CONTRIBUTOR'
      )
    ).toBe(false);
    expect(await isTrustedActor(restWith({}), 'c', 'CONTRIBUTOR')).toBe(false);
  });

  it('fails closed on 404 and 403', async () => {
    expect(await isTrustedActor(restWith404(), 'x', 'NONE')).toBe(false);
    expect(
      await isTrustedActor(restAnswering(403, { message: 'Must have push access' }), 'x', 'NONE')
    ).toBe(false);
  });

  it('rethrows any other failure', async () => {
    await expect(
      isTrustedActor(restAnswering(500, { message: 'Server Error' }), 'x', 'NONE')
    ).rejects.toThrow(/500/);
  });
});

describe('chooseTargetBranch', () => {
  it('falls back to the default branch when the link branch is not allowed', () => {
    expect(chooseTargetBranch('staging', ['main'], 'main')).toEqual({
      branch: 'main',
      reason: 'not-allowed',
    });
  });

  it('uses the link branch when it is allowed', () => {
    expect(chooseTargetBranch('staging', ['main', 'staging'], 'main')).toEqual({
      branch: 'staging',
      reason: 'link',
    });
  });

  it('uses the default branch when the link names none', () => {
    expect(chooseTargetBranch(undefined, ['main'], 'main')).toEqual({
      branch: 'main',
      reason: 'default',
    });
    expect(chooseTargetBranch('', ['main'], 'main')).toEqual({ branch: 'main', reason: 'default' });
  });

  it('allows only the default branch when the allow-list is empty', () => {
    expect(chooseTargetBranch('main', [], 'main')).toEqual({ branch: 'main', reason: 'link' });
    expect(chooseTargetBranch('staging', [], 'main')).toEqual({
      branch: 'main',
      reason: 'not-allowed',
    });
  });
});

describe('branchBaseName', () => {
  it('names the branch after the issue, or after the run for a dispatch', () => {
    const issue = parseTrigger('issues', fx('issues-opened-member')) as ApplyTrigger;
    expect(branchBaseName(issue, '999')).toBe('livelocale/issue-7');
    const dispatch = parseTrigger('workflow_dispatch', fx('workflow-dispatch')) as ApplyTrigger;
    expect(branchBaseName(dispatch, '999')).toBe('livelocale/run-999');
  });
});
