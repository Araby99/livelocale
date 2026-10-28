/**
 * `livelocale apply --github-event`: the generated workflow's one step. Reads
 * the event from `$GITHUB_EVENT_PATH`, gates on maintainers, plans the link's
 * edits against the target branch, writes one commit on a `livelocale/`
 * branch, opens or reuses the pull request (or a compare link) and reports
 * on the issue. A merged or closed pull request closes its issue.
 *
 * Log lines carry only statuses, locales, keys and URLs, never values.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { planApply, type ApplyPlan } from '../../core/apply-plan.js';
import { CHANGE_BLOCK_OPEN, ChangeLinkError, decodeChangeLink } from '../../core/change-link.js';
import { nodeInflate } from '../../core/change-link-node.js';
import {
  createGitHubRest,
  encodeRefPath,
  isPullRequestCreationForbidden,
  type GitHubRest,
} from '../../server/github-rest.js';
import { runCheck } from '../check.js';
import {
  buildFileChanges,
  commitFiles,
  noreplyAuthor,
  normalizeRepoDir,
  prepareBranch,
  readRemoteLocales,
  type RemoteLocales,
} from './github-commit.js';
import {
  branchBaseName,
  chooseTargetBranch,
  isTrustedActor,
  parseTrigger,
  type Trigger,
} from './github-trigger.js';
import {
  closingLine,
  renderCommitMessage,
  renderIssueComment,
  renderPullRequestBody,
  renderTerminalSummary,
  summarizeCheck,
  type IssueOutcome,
  type TargetInfo,
} from './report.js';

export interface GitHubEventOptions {
  /**
   * GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_RUN_ID,
   * GITHUB_SERVER_URL ('https://github.com'), GITHUB_API_URL, GITHUB_WORKSPACE, GITHUB_STEP_SUMMARY
   */
  env: NodeJS.ProcessEnv;
  /** Locales folder, relative to the repository root. */
  localesPath: string;
  sourceLocale: string;
  /** Branches a link may target; default: the repository's default branch. */
  branches?: string[];
  /** The app's folder, relative to the repository root (for `livelocale check`). */
  dir?: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export type EventResult = 'ignored' | 'closed-issue' | IssueOutcome['kind'];

type ApplyTrigger = Extract<Trigger, { kind: 'apply' }>;
type CommentContext = Omit<Parameters<typeof renderIssueComment>[0], 'outcome'>;
type Reporter = (outcome: IssueOutcome, ctx?: CommentContext) => Promise<IssueOutcome['kind']>;

const PR_TITLE = 'i18n: LiveLocale changes';
const NOT_FOUND_MESSAGE = 'No LiveLocale change link (lc1.…) found.';

/** An expected failure: its comment is posted and the run resolves `'error'`. */
class ExpectedFailure extends Error {}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`[livelocale] ${name} is not set; run this inside GitHub Actions.`);
  return value;
}

/** Closes the issue of a merged or closed `livelocale/issue-<n>` pull request. */
async function closeIssue(
  rest: GitHubRest,
  trigger: Extract<Trigger, { kind: 'close-issue' }>,
  log: (line: string) => void
): Promise<EventResult> {
  const n = trigger.issueNumber;
  const issue = await rest.api<{ state?: string; body?: string | null }>('GET', `/issues/${n}`, {
    allow404: true,
  });
  const body = typeof issue.data?.body === 'string' ? issue.data.body : '';
  if (issue.data?.state !== 'open' || !body.includes(CHANGE_BLOCK_OPEN)) {
    log(`Issue #${n} is not an open LiveLocale issue; nothing to close.`);
    return 'ignored';
  }
  await rest.api('PATCH', `/issues/${n}`, {
    body: { state: 'closed', state_reason: trigger.merged ? 'completed' : 'not_planned' },
  });
  await rest.api('POST', `/issues/${n}/comments`, {
    body: { body: `Closed because ${trigger.prUrl} was ${trigger.merged ? 'merged' : 'closed'}.` },
  });
  log(`Closed issue #${n}.`);
  return 'closed-issue';
}

/** Writes the target's files plus the batch's changes to a temp folder and runs the check there. */
async function checkChanges(
  options: GitHubEventOptions,
  workspace: string,
  remote: RemoteLocales,
  changes: Map<string, string>,
  plan: ApplyPlan
): Promise<string> {
  const dir = normalizeRepoDir(options.localesPath);
  const prefix = dir === '' ? '' : `${dir}/`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-check-'));
  try {
    for (const [file, text] of new Map([...remote.files, ...changes])) {
      const target = path.join(tmp, ...file.slice(prefix.length).split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text, 'utf-8');
    }
    const report = await runCheck({
      projectDir: path.join(workspace, options.dir ?? '.'),
      localesPath: tmp,
      sourceLocale: options.sourceLocale,
      unused: false,
    });
    const edited = plan.edits
      .filter((edit) => edit.status === 'apply')
      .map((edit): [string, string] => [edit.locale, edit.key]);
    return summarizeCheck(report, edited);
  } catch (err) {
    return `Check could not run: ${errorMessage(err)}`;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Runs one workflow event. Expected failures (no or damaged link, wrong
 * repository, no source locale file) are reported and resolve `'error'` or
 * `'wrong-repo'`; anything else after the gate is reported and rethrown.
 */
export async function runGitHubEventApply(options: GitHubEventOptions): Promise<EventResult> {
  const { env } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const token = required(env, 'GITHUB_TOKEN');
  const eventPath = required(env, 'GITHUB_EVENT_PATH');

  const event: unknown = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
  const trigger = parseTrigger(env.GITHUB_EVENT_NAME ?? '', event);
  if (trigger.kind === 'ignore') {
    log(`Nothing to do: ${trigger.reason}.`);
    return 'ignored';
  }

  const repo = env.GITHUB_REPOSITORY || trigger.repo;
  const rest = createGitHubRest({
    repo,
    token,
    apiBase: env.GITHUB_API_URL || undefined,
    fetchImpl: options.fetchImpl,
  });
  if (trigger.kind === 'close-issue') return closeIssue(rest, trigger, log);

  const server = (env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  const runId = env.GITHUB_RUN_ID ?? '0';
  const runUrl = `${server}/${repo}/actions/runs/${runId}`;
  const issueNumber = trigger.issueNumber ?? undefined;

  /** Posts the outcome on the issue, or appends it to the step summary for a dispatch. */
  const report: Reporter = async (outcome, ctx = {}) => {
    const text = renderIssueComment({ ...ctx, runUrl, outcome });
    if (issueNumber !== undefined) {
      await rest.api('POST', `/issues/${issueNumber}/comments`, { body: { body: text } });
    } else if (env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`, 'utf-8');
    }
    log(`Result: ${outcome.kind}`);
    return outcome.kind;
  };

  // The gate: the issue author for `issues`, the commenter for `issue_comment`.
  if (trigger.via !== 'dispatch') {
    if (!(await isTrustedActor(rest, trigger.actor.login, trigger.association))) {
      return report({ kind: 'waiting-for-maintainer' });
    }
  }

  try {
    return await applyLink(options, rest, trigger, { repo, runId, runUrl, server, log, report });
  } catch (err) {
    if (err instanceof ExpectedFailure) return report({ kind: 'error', message: err.message });
    await report({ kind: 'error', message: errorMessage(err) });
    throw err;
  }
}

interface RunContext {
  repo: string;
  runId: string;
  runUrl: string;
  server: string;
  log: (line: string) => void;
  report: Reporter;
}

async function applyLink(
  options: GitHubEventOptions,
  rest: GitHubRest,
  trigger: ApplyTrigger,
  run: RunContext
): Promise<EventResult> {
  const { repo, runId, runUrl, log, report } = run;
  const issueNumber = trigger.issueNumber ?? undefined;

  // Decode.
  let set;
  try {
    set = await decodeChangeLink(trigger.text, nodeInflate);
  } catch (err) {
    if (!(err instanceof ChangeLinkError)) throw err;
    throw new ExpectedFailure(err.code === 'NOT_FOUND' ? NOT_FOUND_MESSAGE : err.message);
  }
  if (set.repo !== undefined && set.repo !== repo) {
    return report({ kind: 'wrong-repo', linkRepo: set.repo, repo });
  }

  // Plan against the target branch.
  const defaultBranch = trigger.defaultBranch;
  const chosen = chooseTargetBranch(set.branch, options.branches ?? [defaultBranch], defaultBranch);
  const target: TargetInfo = {
    branch: chosen.branch,
    isDefault: chosen.branch === defaultBranch,
    ...(set.branch ? { requested: set.branch } : {}),
    reason: chosen.reason,
  };
  const targetSha = await rest.refSha(target.branch);
  if (targetSha === null) {
    throw new Error(`[livelocale] The target branch ${target.branch} does not exist.`);
  }
  const locales = [...new Set([...set.edits.map((e) => e.locale), options.sourceLocale])];
  const remote = await readRemoteLocales(rest, targetSha, options.localesPath, locales);
  if (!remote.targets.get(options.sourceLocale)) {
    throw new ExpectedFailure(
      `Source locale \`${options.sourceLocale}\` has no locale file on \`${target.branch}\`.`
    );
  }
  const plan = planApply({
    edits: set.edits,
    sourceLocale: options.sourceLocale,
    targets: remote.targets,
    allowForce: trigger.force,
  });
  log(renderTerminalSummary(plan));

  const credits = { plan, by: set.by, note: set.note, target };
  if (plan.counts.apply === 0) return report({ kind: 'nothing-to-apply' }, credits);

  // Commit.
  const branchPlan = await prepareBranch(
    rest,
    branchBaseName(trigger, runId),
    target.branch,
    targetSha,
    runId
  );
  const changes = buildFileChanges(options.localesPath, plan, remote);
  const commit = await commitFiles(rest, {
    branchPlan,
    files: changes,
    message: renderCommitMessage({ plan, by: set.by, issueNumber, runId }),
    author: noreplyAuthor(trigger.actor),
  });
  log(
    commit.sha === null
      ? `${branchPlan.branch} already holds these changes.`
      : `Committed to ${branchPlan.branch}.`
  );

  // Check.
  const workspace = options.env.GITHUB_WORKSPACE || process.cwd();
  const checkSummary = await checkChanges(options, workspace, remote, changes, plan);

  // Pull request.
  const title =
    issueNumber !== undefined ? `${PR_TITLE} (#${issueNumber})` : `${PR_TITLE} (run ${runId})`;
  const body = renderPullRequestBody({ ...credits, issueNumber, checkSummary, runUrl });
  let outcome: IssueOutcome;
  try {
    const pull = await rest.openOrReusePullRequest({
      head: branchPlan.branch,
      base: target.branch,
      title,
      body,
      updateBodyIfReused: true,
    });
    outcome = { kind: 'pr', url: pull.url, reused: pull.reused };
  } catch (err) {
    if (!isPullRequestCreationForbidden(err)) throw err;
    const closing = closingLine({ target, issueNumber });
    const url =
      `${run.server}/${repo}/compare/${encodeRefPath(target.branch)}...${encodeRefPath(branchPlan.branch)}` +
      `?quick_pull=1&title=${encodeURIComponent(title)}` +
      (closing ? `&body=${encodeURIComponent(closing)}` : '');
    outcome = { kind: 'compare', url, branch: branchPlan.branch };
  }
  log(`Pull request: ${outcome.url}`);

  return report(outcome, { ...credits, checkSummary });
}
