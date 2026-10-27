// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { FLAG_MESSAGES, type LocaleTarget } from '../../src/core/apply-plan.js';
import type { ChangeEdit, ChangeSet } from '../../src/core/change-link.js';
import { RISK_FLAG_MESSAGES } from '../../src/core/save-rules.js';
import {
  buildReviewRows,
  REVIEW_STATUS_LABELS,
  reviewSummary,
} from '../../src/studio/share/review.js';

const targets = new Map<string, LocaleTarget>([
  [
    'en',
    {
      layout: 'flat',
      dict: {
        home: { title: 'Welcome', cta: 'Read more' },
        cart: { count: 'You have {count} items' },
      },
    },
  ],
  ['ar', { layout: 'flat', dict: { home: { title: 'مرحبا' } } }],
]);

const e = (
  locale: string,
  key: string,
  from: string | null,
  to: string,
  force = false
): ChangeEdit => ({ locale, key, from, to, force });

const set = (edits: ChangeEdit[]): ChangeSet => ({
  branch: 'main',
  base: 'abc1234',
  src: 'en',
  by: '',
  note: '',
  edits,
});

const rows = (edits: ChangeEdit[], allowForce?: boolean) =>
  buildReviewRows({ set: set(edits), sourceLocale: 'en', targets, allowForce });

describe('buildReviewRows', () => {
  it('marks an edit ready when the site still shows the old text', () => {
    const [row] = rows([e('ar', 'home.title', 'مرحبا', 'أهلا')]);
    expect(row).toMatchObject({ id: 'ar\u0000home.title', status: 'apply', checks: [] });
    expect(REVIEW_STATUS_LABELS[row!.status]).toBe('Ready');
  });

  it('marks an edit already applied when the site shows the new text', () => {
    const [row] = rows([e('ar', 'home.title', 'قديم', 'مرحبا')]);
    expect(row).toMatchObject({ status: 'already', checks: [] });
    expect(REVIEW_STATUS_LABELS[row!.status]).toBe('Already applied');
  });

  it('flags a conflict and shows what the site has now', () => {
    const changed = new Map(targets).set('ar', {
      layout: 'flat',
      dict: { home: { title: 'أهلا بكم' } },
    });
    const [row] = buildReviewRows({
      set: set([e('ar', 'home.title', 'مرحبا', 'أهلا')]),
      sourceLocale: 'en',
      targets: changed,
    });
    expect(row).toMatchObject({ status: 'conflict', current: 'أهلا بكم' });
    expect(REVIEW_STATUS_LABELS.conflict).toBe('Changed since');
  });

  it('treats a new key with from null as ready', () => {
    const [known, extra] = rows([
      e('ar', 'home.cta', null, 'اقرأ'),
      e('ar', 'home.extra', null, 'إضافي'),
    ]);
    expect(known).toMatchObject({ status: 'apply', checks: [] });
    expect(extra).toMatchObject({
      status: 'apply',
      checks: [{ level: 'warning', message: FLAG_MESSAGES['new-key'] }],
    });
  });

  it('reports a dropped placeholder as an error, or a warning with Save anyway', () => {
    const [invalid] = rows([e('ar', 'cart.count', null, 'لديك عناصر')]);
    expect(invalid!.status).toBe('invalid');
    expect(REVIEW_STATUS_LABELS.invalid).toBe('Invalid');
    expect(invalid!.checks).toEqual([
      { level: 'error', message: expect.stringContaining('{count}') },
    ]);

    const [forced] = rows([e('ar', 'cart.count', null, 'لديك عناصر', true)]);
    expect(forced!.status).toBe('needs-force');
    expect(REVIEW_STATUS_LABELS['needs-force']).toBe('Saved with “Save anyway”');
    expect(forced!.checks).toEqual([
      { level: 'warning', message: `${forced!.message} Saved with “Save anyway”.` },
    ]);
    expect(forced!.checks[0]!.message).toContain('{count}');
  });

  it('uses the current source text as the reference for source-locale edits', () => {
    const [row] = rows([e('en', 'home.title', 'Welcome', 'Hi {name}')]);
    expect(row).toMatchObject({ status: 'invalid', code: 'PLACEHOLDER_MISMATCH' });
    expect(row!.checks).toEqual([{ level: 'error', message: expect.stringContaining('{name}') }]);
  });

  it('lists risk flags as warnings', () => {
    const [row] = rows([e('ar', 'home.title', 'مرحبا', 'مرحبا https://evil.example')]);
    expect(row!.status).toBe('apply');
    expect(row!.checks).toEqual([{ level: 'warning', message: RISK_FLAG_MESSAGES['new-url'] }]);
  });

  it('summarises counts per status', () => {
    const list = rows([
      e('ar', 'home.title', 'مرحبا', 'أهلا'),
      e('ar', 'home.cta', null, 'اقرأ'),
      e('ar', 'home.title', 'قديم', 'جديد'),
    ]);
    expect(list.map((r) => r.status)).toEqual(['apply', 'apply', 'conflict']);
    expect(reviewSummary(list)).toEqual({
      apply: 2,
      already: 0,
      conflict: 1,
      invalid: 0,
      'needs-force': 0,
    });
  });
});
