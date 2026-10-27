/**
 * The reports `livelocale apply` writes: the pull request body, the commit
 * message and the terminal summary.
 *
 * Every piece of translator text (values, `by`, `note`, check messages) is
 * escaped so it can never mention a user, link an issue, inject markup or
 * break the table. The terminal summary never contains values (SEC-001).
 */

import {
  FLAG_MESSAGES,
  type ApplyPlan,
  type EditStatus,
  type PlannedEdit,
} from '../../core/apply-plan.js';
import type { CheckReport } from '../check.js';

const DEFAULT_SPAN_LENGTH = 120;
const DEFAULT_TABLE_ROWS = 100;
const MAX_BODY_CHARS = 60_000;
const MAX_NOTE_CHARS = 2_000;
const MAX_NAME_CHARS = 64;
const MAX_CHECK_LINES = 50;
/** Room the table never uses, so the separators around it always fit. */
const BODY_MARGIN = 200;

const STATUS_LABELS: Record<EditStatus, string> = {
  apply: 'applied',
  already: 'already done',
  conflict: 'conflict',
  'needs-force': 'needs --force',
  invalid: 'rejected',
};

const BIDI_CONTROL_RE = /[‪-‮⁦-⁩]/g;
const NEWLINE_RE = /\r?\n/g;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g;

/** Cuts `text` to `max` code units without leaving half a surrogate pair. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = text.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

/** Renders translator text as one inline code span that is safe in a table cell. */
export function codeSpan(text: string, maxLength: number = DEFAULT_SPAN_LENGTH): string {
  const truncated = text.length > maxLength ? `${cut(text, maxLength)}…` : text;
  const content = truncated
    .replace(NEWLINE_RE, '⏎')
    .replace(
      BIDI_CONTROL_RE,
      (ch) => `⟨U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}⟩`
    )
    .replace(/\|/g, '\\|');
  if (content === '') return '` `';

  const fence = '`'.repeat(longestBacktickRun(content) + 1);
  const pad = /^[` ]|[` ]$/.test(content) ? ' ' : '';
  return `${fence}${pad}${content}${pad}${fence}`;
}

/** Cleans a translator name for a commit trailer; undefined when nothing is left. */
export function sanitizeName(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const cleaned = name
    .replace(NEWLINE_RE, ' ')
    .replace(CONTROL_RE, '')
    .replace(/[@#<>]/g, '')
    .trim();
  const result = cut(cleaned, MAX_NAME_CHARS).trim();
  return result === '' ? undefined : result;
}

export interface TargetInfo {
  branch: string;
  isDefault: boolean;
  requested?: string;
  reason: 'link' | 'default' | 'not-allowed' | 'local';
}

export interface ReportContext {
  plan: ApplyPlan;
  by?: string;
  note?: string;
  target: TargetInfo;
  issueNumber?: number;
  checkSummary?: string;
  runUrl?: string;
}

const NO_CHECK_PROBLEMS = '✅ `livelocale check`: no problems in the changed keys.';

/** Summarizes a `livelocale check` report, listing only problems in the edited keys. */
export function summarizeCheck(
  report: CheckReport,
  edited: Array<[locale: string, key: string]>
): string {
  const changed = new Set(edited.map(([locale, key]) => `${locale}\u0000${key}`));
  const mine = report.issues.filter(
    (issue) =>
      issue.locale !== undefined &&
      issue.key !== undefined &&
      changed.has(`${issue.locale}\u0000${issue.key}`)
  );
  if (mine.length === 0) return NO_CHECK_PROBLEMS;

  const lines = [`⚠ \`livelocale check\` found ${mine.length} problem(s) in the changed keys:`, ''];
  for (const issue of mine.slice(0, MAX_CHECK_LINES)) {
    lines.push(
      `- ${codeSpan(issue.locale ?? '')} ${codeSpan(issue.key ?? '')}: ${codeSpan(issue.message)}`
    );
  }
  if (mine.length > MAX_CHECK_LINES) lines.push(`- …and ${mine.length - MAX_CHECK_LINES} more`);

  const others = report.issues.length - mine.length;
  if (others > 0) {
    lines.push('', `(${others} other problem(s) already in the repository are not shown.)`);
  }
  return lines.join('\n');
}

function checksCell(edit: PlannedEdit): string {
  const parts: string[] = edit.flags.map((flag) => FLAG_MESSAGES[flag]);
  if ((edit.status === 'invalid' || edit.status === 'needs-force') && edit.message) {
    parts.push(codeSpan(edit.message));
  }
  return parts.join('; ');
}

function renderRow(edit: PlannedEdit): string {
  const before = edit.from === null ? '—' : codeSpan(edit.from);
  const after =
    edit.status === 'conflict'
      ? `now: ${edit.current === undefined ? '(removed)' : codeSpan(edit.current)}`
      : codeSpan(edit.to);
  const cells = [
    STATUS_LABELS[edit.status],
    codeSpan(edit.locale),
    codeSpan(edit.key),
    before,
    after,
    checksCell(edit),
  ];
  return `| ${cells.join(' | ')} |`;
}

/** Renders rows until `limit` rows or `maxChars` characters, whichever comes first. */
function renderTable(plan: ApplyPlan, limit: number, maxChars: number): string {
  const lines = [
    '| Status | Locale | Key | Before | After | Checks |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  const moreLine = (n: number) => `\n\n…and ${n} more`;
  // Reserve room for the widest "…and N more" line.
  let length = lines.join('\n').length + moreLine(plan.edits.length).length;
  let shown = 0;
  for (const edit of plan.edits) {
    if (shown >= limit) break;
    const row = renderRow(edit);
    if (length + row.length + 1 > maxChars) break;
    lines.push(row);
    length += row.length + 1;
    shown += 1;
  }

  const rest = plan.edits.length - shown;
  return lines.join('\n') + (rest > 0 ? moreLine(rest) : '');
}

/** The before/after table of a plan, with the checks the PR reviewer must see. */
export function renderChangesTable(plan: ApplyPlan, limit: number = DEFAULT_TABLE_ROWS): string {
  return renderTable(plan, limit, MAX_BODY_CHARS - BODY_MARGIN);
}

function fencedNote(note: string): string {
  const text = cut(note, MAX_NOTE_CHARS);
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(text) + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function closingLine(ctx: ReportContext): string | undefined {
  if (ctx.issueNumber === undefined) return undefined;
  if (ctx.target.isDefault) return `Closes #${ctx.issueNumber}`;
  return `Refs #${ctx.issueNumber}. LiveLocale closes the issue when this pull request is merged or closed.`;
}

/** The pull request body; never longer than 60,000 characters. */
export function renderPullRequestBody(ctx: ReportContext): string {
  const head: string[] = ['Applies translations sent with a LiveLocale change link.'];
  if (ctx.by?.trim()) head.push(`Translated by ${codeSpan(ctx.by)}`);
  if (ctx.target.reason === 'not-allowed' && ctx.target.requested !== undefined) {
    head.push(
      `The link was made from ${codeSpan(ctx.target.requested)}, which is not in the allowed branches, so this targets ${codeSpan(ctx.target.branch)}.`
    );
  }
  if (ctx.note?.trim()) head.push(fencedNote(ctx.note));

  const tail: string[] = [];
  if (ctx.checkSummary) tail.push(cut(ctx.checkSummary, 10_000));
  if (ctx.runUrl) tail.push(`Run log: ${ctx.runUrl}`);
  const closing = closingLine(ctx);
  if (closing) tail.push(closing);

  const fixed = [...head, ...tail].join('\n\n').length;
  const table = renderTable(ctx.plan, DEFAULT_TABLE_ROWS, MAX_BODY_CHARS - BODY_MARGIN - fixed);
  return [...head, table, ...tail].join('\n\n');
}

/** The commit message, with a sanitized `Translated-by:` trailer. */
export function renderCommitMessage(input: {
  plan: ApplyPlan;
  by?: string;
  issueNumber?: number;
  runId?: string;
}): string {
  let subject = 'i18n: apply LiveLocale changes';
  if (input.issueNumber !== undefined) subject += ` (#${input.issueNumber})`;
  else if (input.runId !== undefined) subject += ` (run ${input.runId})`;

  const applied = input.plan.edits.filter((edit) => edit.status === 'apply');
  const locales = [...new Set(applied.map((edit) => edit.locale))].sort();
  const parts = [subject, `${applied.length} translation(s) in ${locales.join(', ')}.`];

  const name = sanitizeName(input.by);
  if (name) parts.push(`Translated-by: ${name}`);
  return parts.join('\n\n');
}

/** The terminal summary: counts, then one status line per edit. Never contains values. */
export function renderTerminalSummary(plan: ApplyPlan): string {
  const c = plan.counts;
  const lines = [
    `Applied ${c.apply} · already done ${c.already} · conflicts ${c.conflict} · needs --force ${c['needs-force']} · rejected ${c.invalid}`,
  ];
  for (const edit of plan.edits) {
    lines.push(`${STATUS_LABELS[edit.status]} ${edit.locale} ${edit.key}`);
  }
  return lines.join('\n');
}
