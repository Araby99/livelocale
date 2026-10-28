/**
 * What a GitHub event asks `apply --github-event` to do: apply a change link
 * from an issue, a `/livelocale apply` comment or a workflow dispatch, close
 * the issue once its pull request closes, or nothing. Plus the trust gate
 * (only maintainers may make the Action write) and the target-branch rule.
 *
 * Only the payload read from `$GITHUB_EVENT_PATH` comes in here, never text
 * interpolated into the workflow.
 */

import { CHANGE_BLOCK_OPEN, findChangeToken } from '../../core/change-link.js';
import { GitHubApiError, type GitHubRest } from '../../server/github-rest.js';

export interface TriggerActor {
  login: string;
  id: number;
}

export type Trigger =
  | { kind: 'ignore'; reason: string }
  | {
      kind: 'apply';
      via: 'issue' | 'comment' | 'dispatch';
      issueNumber: number | null;
      actor: TriggerActor;
      association: string | null;
      text: string;
      force: boolean;
      repo: string;
      defaultBranch: string;
    }
  | { kind: 'close-issue'; issueNumber: number; prUrl: string; merged: boolean; repo: string };

const APPLY_COMMAND_RE = /^\/livelocale\s+apply(\s+--force)?\s*$/;
const COMMAND_PREFIX = '/livelocale';
const ISSUE_BRANCH_RE = /^livelocale\/issue-(\d+)(?:-\d+)?$/;

const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const TRUSTED_PERMISSIONS = new Set(['admin', 'write']);
const TRUSTED_ROLES = new Set(['admin', 'maintain', 'write']);

const ignore = (reason: string): Trigger => ({ kind: 'ignore', reason });

function actorOf(user: any): TriggerActor {
  return { login: String(user?.login ?? ''), id: Number(user?.id ?? 0) };
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function holdsChangeToken(text: string): boolean {
  try {
    findChangeToken(text);
    return true;
  } catch {
    return false;
  }
}

export function parseTrigger(eventName: string, event: any): Trigger {
  const repo = textOf(event?.repository?.full_name);
  const defaultBranch = textOf(event?.repository?.default_branch);

  switch (eventName) {
    case 'issues': {
      if (event?.action !== 'opened') return ignore('issue not opened');
      const issue = event.issue;
      const body = textOf(issue?.body);
      if (!body.includes(CHANGE_BLOCK_OPEN)) return ignore('no change block');
      return {
        kind: 'apply',
        via: 'issue',
        issueNumber: Number(issue.number),
        actor: actorOf(issue.user),
        association: issue.author_association ?? null,
        text: body,
        force: false,
        repo,
        defaultBranch,
      };
    }

    case 'issue_comment': {
      if (event?.action !== 'created') return ignore('comment not created');
      const issue = event.issue;
      const comment = event.comment;
      if (issue?.pull_request) return ignore('comment on a pull request');
      if (comment?.user?.type === 'Bot') return ignore('comment by a bot');
      const body = textOf(comment?.body);
      const firstLine = body.split(/\r\n|\r|\n/)[0] ?? '';
      if (!firstLine.startsWith(COMMAND_PREFIX)) return ignore('not a livelocale command');
      const command = APPLY_COMMAND_RE.exec(firstLine);
      if (!command) return ignore('unknown command');
      return {
        kind: 'apply',
        via: 'comment',
        issueNumber: Number(issue.number),
        // The gate checks the commenter, never the issue author.
        actor: actorOf(comment.user),
        association: comment.author_association ?? null,
        text: holdsChangeToken(body) ? body : textOf(issue?.body),
        force: command[1] !== undefined,
        repo,
        defaultBranch,
      };
    }

    case 'workflow_dispatch':
      // Dispatching a workflow already requires write access, so no gate.
      return {
        kind: 'apply',
        via: 'dispatch',
        issueNumber: null,
        actor: actorOf(event?.sender),
        association: null,
        text: textOf(event?.inputs?.link),
        force: false,
        repo,
        defaultBranch,
      };

    case 'pull_request': {
      if (event?.action !== 'closed') return ignore('pull request not closed');
      const pull = event.pull_request;
      const branch = ISSUE_BRANCH_RE.exec(textOf(pull?.head?.ref));
      if (!branch) return ignore('not a livelocale issue branch');
      if (textOf(pull?.head?.repo?.full_name) !== repo || repo === '') {
        return ignore('pull request from another repository');
      }
      return {
        kind: 'close-issue',
        issueNumber: Number(branch[1]),
        prUrl: textOf(pull.html_url),
        merged: pull.merged === true,
        repo,
      };
    }

    default:
      return ignore(`unsupported event ${eventName}`);
  }
}

/**
 * True when `login` may make the Action write: a trusted `author_association`,
 * or write access or higher from the permission API (which also covers private
 * org members GitHub misreports as CONTRIBUTOR). A 403 or 404 fails closed.
 */
export async function isTrustedActor(
  rest: GitHubRest,
  login: string,
  association: string | null
): Promise<boolean> {
  if (association !== null && TRUSTED_ASSOCIATIONS.has(association)) return true;
  try {
    const res = await rest.api<{ permission?: string; role_name?: string }>(
      'GET',
      `/collaborators/${encodeURIComponent(login)}/permission`
    );
    const permission = res.data?.permission ?? '';
    const role = res.data?.role_name ?? '';
    return TRUSTED_PERMISSIONS.has(permission) || TRUSTED_ROLES.has(role);
  } catch (err) {
    if (err instanceof GitHubApiError && (err.status === 403 || err.status === 404)) return false;
    throw err;
  }
}

/**
 * The branch the pull request targets: the link's branch only when the
 * allow-list (default: the repository's default branch) holds it.
 */
export function chooseTargetBranch(
  requested: string | undefined,
  allowList: string[],
  defaultBranch: string
): { branch: string; reason: 'link' | 'default' | 'not-allowed' } {
  if (!requested) return { branch: defaultBranch, reason: 'default' };
  const allowed = allowList.length > 0 ? allowList : [defaultBranch];
  if (allowed.includes(requested)) return { branch: requested, reason: 'link' };
  return { branch: defaultBranch, reason: 'not-allowed' };
}

/** `livelocale/issue-<n>` for an issue or comment, `livelocale/run-<id>` for a dispatch. */
export function branchBaseName(t: Extract<Trigger, { kind: 'apply' }>, runId: string): string {
  return t.issueNumber !== null ? `livelocale/issue-${t.issueNumber}` : `livelocale/run-${runId}`;
}
