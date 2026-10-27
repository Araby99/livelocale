// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  FLAG_MESSAGES,
  type ApplyPlan,
  type EditStatus,
  type PlannedEdit,
} from '../../src/core/apply-plan.js';
import type { CheckReport } from '../../src/codemod/check.js';
import {
  codeSpan,
  renderChangesTable,
  renderCommitMessage,
  renderPullRequestBody,
  renderTerminalSummary,
  sanitizeName,
  summarizeCheck,
  type ReportContext,
} from '../../src/codemod/apply/report.js';

function makePlan(edits: PlannedEdit[]): ApplyPlan {
  const counts: Record<EditStatus, number> = {
    apply: 0,
    already: 0,
    conflict: 0,
    invalid: 0,
    'needs-force': 0,
  };
  for (const edit of edits) counts[edit.status] += 1;
  return { edits, counts };
}

const edit = (over: Partial<PlannedEdit> = {}): PlannedEdit => ({
  locale: 'ar',
  key: 'home.title',
  from: 'أهلا',
  to: 'مرحبا',
  force: false,
  status: 'apply',
  flags: [],
  ...over,
});

const planWith = (over: Partial<PlannedEdit> = {}): ApplyPlan => makePlan([edit(over)]);

const twoEdits = makePlan([edit(), edit({ locale: 'es', from: 'Hola', to: 'Hólà' })]);

const mixed = makePlan([
  edit({ key: 'home.a', from: 'أهلا', to: 'مرحبا' }),
  edit({ locale: 'es', key: 'home.b', from: 'Añadir', to: 'Añádelo' }),
  edit({ key: 'home.c', from: 'قديم', to: 'جديد', status: 'already', current: 'جديد' }),
  edit({
    key: 'home.d',
    from: 'سابق',
    to: 'لاحق',
    status: 'conflict',
    code: 'CHANGED_ON_TARGET',
    message: 'Changed on the target since the link was made.',
    current: 'حالي',
  }),
  edit({
    key: 'home.e',
    from: 'نص',
    to: 'نصّ {x}',
    status: 'invalid',
    code: 'PLACEHOLDER_MISMATCH',
    message: 'Placeholders differ: {x}',
  }),
]);

const bigPlan = (n: number, value: string): ApplyPlan =>
  makePlan(Array.from({ length: n }, (_, i) => edit({ key: `k${i}`, from: value, to: value })));

const ctx = (over: Partial<ReportContext> = {}): ReportContext => ({
  plan: twoEdits,
  target: { branch: 'main', isDefault: true, reason: 'local' },
  ...over,
});

const reportWith2Issues: CheckReport = {
  localesDir: '/p/locales',
  sourceLocale: 'en',
  locales: ['en', 'ar'],
  codeKeyCount: 2,
  issues: [
    {
      kind: 'placeholder-mismatch',
      level: 'fail',
      locale: 'ar',
      key: 'home.greet',
      message: 'ar home.greet is missing {name}',
    },
    {
      kind: 'placeholder-mismatch',
      level: 'fail',
      locale: 'ar',
      key: 'home.other',
      message: 'ar home.other is missing {count}',
    },
  ],
};
const cleanReport: CheckReport = { ...reportWith2Issues, issues: [] };

// outsideFences(md) drops every fenced block: from a line opening with N >= 3 backticks to the next line of exactly N backticks
const outsideFences = (md: string) => md.replace(/^(`{3,})[^\n`]*\n[\s\S]*?^\1[ \t]*$/gm, '');

describe('codeSpan', () => {
  it('escapes pipes, backticks, newlines and bidi controls, and truncates', () => {
    expect(codeSpan('a|b')).toBe('`a\\|b`');
    expect(codeSpan('`tick')).toBe('`` `tick ``');
    expect(codeSpan('l1\nl2')).toBe('`l1⏎l2`');
    expect(codeSpan('abc‮def')).toBe('`abc⟨U+202E⟩def`');
    expect(codeSpan('a'.repeat(300)).endsWith('…`')).toBe(true);
  });
});

describe('sanitizeName', () => {
  it('cleans a name for a commit trailer', () => {
    expect(sanitizeName('Mona\nCo-authored-by: Eve <e@x>')).toBe('Mona Co-authored-by: Eve ex');
    expect(sanitizeName('  ')).toBeUndefined();
    expect(sanitizeName(undefined)).toBeUndefined();
    expect(sanitizeName('x'.repeat(100))).toBe('x'.repeat(64));
  });
});

describe('renderPullRequestBody', () => {
  it('closes the issue only on the default branch', () => {
    expect(
      renderPullRequestBody(
        ctx({ issueNumber: 7, target: { branch: 'main', isDefault: true, reason: 'link' } })
      )
    ).toContain('Closes #7');
    const nd = renderPullRequestBody(
      ctx({ issueNumber: 7, target: { branch: 'staging', isDefault: false, reason: 'link' } })
    );
    expect(nd).toContain('Refs #7');
    expect(nd).not.toContain('Closes #7');
    expect(
      renderPullRequestBody(ctx({ target: { branch: 'main', isDefault: true, reason: 'local' } }))
    ).not.toMatch(/Closes|Refs/);
  });

  it('credits the translator in a code span', () => {
    expect(renderPullRequestBody(ctx({ by: '@octocat' }))).not.toMatch(/(^|[^`])@octocat/m);
    expect(renderPullRequestBody(ctx({ by: '@octocat' }))).toContain('Translated by `@octocat`');
    expect(renderPullRequestBody(ctx({ by: 'see #12' }))).toContain('`see #12`');
  });

  it('keeps the note inside a fence it cannot close', () => {
    const fenced = renderPullRequestBody(ctx({ by: 'Mona', note: '```\n@octocat fixes #1\n```' }));
    expect(fenced).toContain('````text\n```\n@octocat fixes #1\n```\n````');
    expect(outsideFences(fenced)).not.toContain('@octocat');
    expect(outsideFences(fenced)).not.toContain('fixes #1');
  });

  it('explains a target that is not in the allowed branches', () => {
    expect(
      renderPullRequestBody(
        ctx({
          target: { branch: 'main', isDefault: true, requested: 'staging', reason: 'not-allowed' },
        })
      )
    ).toContain(
      'The link was made from `staging`, which is not in the allowed branches, so this targets `main`.'
    );
  });

  it('appends the check summary', () => {
    expect(
      renderPullRequestBody(
        ctx({ checkSummary: '✅ `livelocale check`: no problems in the changed keys.' })
      )
    ).toContain('`livelocale check`');
    expect(renderPullRequestBody(ctx({ runUrl: 'https://ci/run/1' }))).toContain(
      'Run log: https://ci/run/1'
    );
  });

  it('cuts a long check summary only at a line boundary', () => {
    const many: CheckReport = {
      ...reportWith2Issues,
      issues: Array.from({ length: 60 }, (_, i) => ({
        kind: 'placeholder-mismatch' as const,
        level: 'fail' as const,
        locale: 'ar',
        key: `k${i}.${'|'.repeat(110)}`,
        message: `@octocat fixes #12 ${'|'.repeat(200)}`,
      })),
    };
    const summary = summarizeCheck(
      many,
      many.issues.map((issue) => [issue.locale ?? '', issue.key ?? ''])
    );
    expect(summary.length).toBeGreaterThan(10_000);
    const body = renderPullRequestBody(ctx({ checkSummary: summary }));
    // Drops every balanced code span (a run of N backticks up to the next run of exactly N).
    const outsideSpans = body.replace(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, '');
    expect(outsideSpans).not.toContain('`');
    expect(outsideSpans).not.toContain('@octocat');
    expect(outsideSpans).not.toContain('#12');
    expect(body.endsWith('\n…')).toBe(true); // the summary is the last part here
  });

  it('stays within 60,000 characters', () => {
    expect(
      renderPullRequestBody(ctx({ plan: bigPlan(500, 'x`|'.repeat(3334)) })).length
    ).toBeLessThanOrEqual(60_000);
  });
});

describe('renderChangesTable', () => {
  it('lists flag messages in the Checks cell', () => {
    const flagged = renderChangesTable(planWith({ status: 'apply', flags: ['forced', 'new-url'] }));
    expect(flagged.split('\n')[0]).toBe('| Status | Locale | Key | Before | After | Checks |');
    expect(flagged).toContain(FLAG_MESSAGES.forced);
    expect(flagged).toContain(FLAG_MESSAGES['new-url']);
  });

  it('shows the current value of a conflict and the reason of a rejected edit', () => {
    const table = renderChangesTable(mixed);
    expect(table).toContain('| conflict | `ar` | `home.d` | `سابق` | now: `حالي` |');
    expect(table).toContain('| rejected |');
    expect(table).toContain('`Placeholders differ: {x}`');
    expect(table).toContain('| already done |');
  });

  it('collapses rows beyond the limit', () => {
    expect(renderChangesTable(bigPlan(5, 'v'), 2)).toContain('…and 3 more');
  });
});

describe('summarizeCheck', () => {
  it('reports only problems in the changed keys', () => {
    expect(summarizeCheck(reportWith2Issues, [['ar', 'home.greet']])).toMatch(
      /found 1 problem\(s\).*1 other problem\(s\)/s
    ); // one issue on ar/home.greet, one on ar/home.other
    expect(summarizeCheck(cleanReport, [['ar', 'home.greet']])).toBe(
      '✅ `livelocale check`: no problems in the changed keys.'
    );
  });
});

describe('renderCommitMessage', () => {
  it('names the issue, the locales and a cleaned translator', () => {
    expect(
      renderCommitMessage({ plan: twoEdits, issueNumber: 7, by: 'Mona\nCo-authored-by: Eve <e@x>' })
    ).toBe(
      'i18n: apply LiveLocale changes (#7)\n\n2 translation(s) in ar, es.\n\nTranslated-by: Mona Co-authored-by: Eve ex'
    );
    expect(renderCommitMessage({ plan: twoEdits })).toBe(
      'i18n: apply LiveLocale changes\n\n2 translation(s) in ar, es.'
    );
    expect(renderCommitMessage({ plan: twoEdits, runId: '42' }).split('\n')[0]).toBe(
      'i18n: apply LiveLocale changes (run 42)'
    );
  });
});

describe('renderTerminalSummary', () => {
  it('counts statuses and never prints values', () => {
    const s = renderTerminalSummary(mixed);
    expect(s).toContain('Applied 2 · already done 1 · conflicts 1 · needs --force 0 · rejected 1');
    for (const e of mixed.edits) {
      expect(s).not.toContain(e.to);
      if (e.from) expect(s).not.toContain(e.from);
    }
  });
});
