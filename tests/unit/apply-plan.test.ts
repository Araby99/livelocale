// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { FLAG_MESSAGES, planApply, type LocaleTarget } from '../../src/core/apply-plan.js';
import type { ChangeEdit } from '../../src/core/change-link.js';
import { RISK_FLAG_MESSAGES } from '../../src/core/save-rules.js';
import { encodeKey } from '../../src/client/watermark.js';

const EN = { home: { title: 'Welcome', greet: 'Hello {name}', cta: 'Read the docs' } };
const AR = { home: { title: 'أهلا', greet: 'مرحبا {name}' } };

const e = (
  locale: string,
  key: string,
  from: string | null,
  to: string,
  force = false
): ChangeEdit => ({ locale, key, from, to, force });

const targets = new Map<string, LocaleTarget>([
  ['en', { layout: 'flat', dict: EN }],
  ['ar', { layout: 'flat', dict: AR }],
]);

const nsTargets = new Map<string, LocaleTarget>([
  ['en', { layout: 'namespaced', dict: { common: { ok: 'OK' } } }],
  ['de', { layout: 'namespaced', dict: { common: { ok: 'OK' } } }],
]);

const plan = (edits: ChangeEdit[], allowForce = false) =>
  planApply({ edits, sourceLocale: 'en', targets, allowForce });

const planNs = (edits: ChangeEdit[]) =>
  planApply({ edits, sourceLocale: 'en', targets: nsTargets, allowForce: false });

const apply1 = e('ar', 'home.title', 'أهلا', 'مرحبًا');
const already1 = e('ar', 'home.greet', 'قديم', 'مرحبا {name}');
const conflict1 = e('ar', 'home.cta', 'قديم', 'x');

describe('planApply', () => {
  it('applies an edit whose current value equals from', () =>
    expect(plan([e('ar', 'home.title', 'أهلا', 'مرحبًا')]).edits[0]!.status).toBe('apply'));

  it('reports an edit whose current value equals to as already done', () =>
    expect(plan([e('ar', 'home.title', 'قديم', 'أهلا')]).edits[0]).toMatchObject({
      status: 'already',
      current: 'أهلا',
    }));

  it('lists a value changed on the target as a conflict', () =>
    expect(plan([e('ar', 'home.title', 'قديم', 'جديد')]).edits[0]).toMatchObject({
      status: 'conflict',
      code: 'CHANGED_ON_TARGET',
      current: 'أهلا',
    }));

  it('applies a missing key with a null from, flagging keys the source lacks', () => {
    expect(plan([e('ar', 'home.cta', null, 'اقرأ')]).edits[0]).toMatchObject({
      status: 'apply',
      flags: [],
    });
    expect(plan([e('ar', 'home.extra', null, 'x')]).edits[0]).toMatchObject({
      status: 'apply',
      flags: ['new-key'],
    });
  });

  it('lists a key removed on the target as a conflict', () =>
    expect(plan([e('ar', 'home.cta', 'قديم', 'x')]).edits[0]).toMatchObject({
      status: 'conflict',
      code: 'REMOVED_ON_TARGET',
    }));

  it('honours force on a 422 only when the maintainer allows it', () => {
    expect(plan([e('ar', 'home.greet', 'مرحبا {name}', 'مرحبا')]).edits[0]).toMatchObject({
      status: 'invalid',
      code: 'PLACEHOLDER_MISMATCH',
    });
    expect(plan([e('ar', 'home.greet', 'مرحبا {name}', 'مرحبا', true)]).edits[0]).toMatchObject({
      status: 'needs-force',
      code: 'PLACEHOLDER_MISMATCH',
      message: expect.stringContaining('{name}'),
    });
    expect(
      plan([e('ar', 'home.greet', 'مرحبا {name}', 'مرحبا', true)], true).edits[0]
    ).toMatchObject({ status: 'apply', flags: ['forced'] });
  });

  it('never lets force through a 400 or 409', () => {
    expect(plan([e('ar', 'home.__proto__.x', null, 'x', true)], true).edits[0]).toMatchObject({
      status: 'invalid',
      code: 'INVALID_KEY_FORMAT',
    });
    expect(plan([e('ar', 'home.title', 'أهلا', 'x'.repeat(10_001))]).edits[0]!.code).toBe(
      'INVALID_VALUE_FORMAT'
    );
    expect(plan([e('ar', 'home', null, 'x')]).edits[0]).toMatchObject({
      status: 'invalid',
      code: 'KEY_NOT_A_STRING',
    });
    expect(plan([e('ar', 'home.title.short', null, 'x')]).edits[0]!.code).toBe('KEY_NOT_A_STRING');
  });

  it('marks an edit for a locale the target has no file for invalid', () =>
    expect(plan([e('fr', 'home.title', null, 'x')]).edits[0]!.code).toBe('UNKNOWN_LOCALE'));

  it('marks new text carrying watermark characters invalid', () =>
    expect(plan([e('ar', 'home.title', 'أهلا', encodeKey('x', 'home.title'))]).edits[0]!.code).toBe(
      'CONTAINS_WATERMARK'
    ));

  it('flags content risks against the source text', () =>
    expect(plan([e('ar', 'home.cta', null, 'اقرأ https://evil.example')]).edits[0]!.flags).toEqual([
      'new-url',
    ]));

  it('requires an existing namespace in the namespaced layout', () => {
    expect(planNs([e('de', 'ok', null, 'x')]).edits[0]!.code).toBe('UNKNOWN_NAMESPACE');
    expect(planNs([e('de', 'billing.x', null, 'y')]).edits[0]!.code).toBe('UNKNOWN_NAMESPACE');
    expect(planNs([e('de', 'common.ok', 'OK', 'Okay')]).edits[0]!.status).toBe('apply');
  });

  it('counts every status', () =>
    expect(plan([apply1, already1, conflict1]).counts).toEqual({
      apply: 1,
      already: 1,
      conflict: 1,
      invalid: 0,
      'needs-force': 0,
    }));

  it('throws when the source locale has no file on the target', () =>
    expect(() => planApply({ edits: [], sourceLocale: 'de', targets, allowForce: false })).toThrow(
      'Source locale "de" has no locale file on the target.'
    ));

  it('treats text that differs only by Unicode normalization as a conflict', () => {
    // Review Focus 3
    const t = new Map<string, LocaleTarget>([
      ['en', { layout: 'flat', dict: { k: 'x' } }],
      ['fr', { layout: 'flat', dict: { k: 'é' } }],
    ]);
    expect(
      planApply({
        edits: [e('fr', 'k', 'é', 'y')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0]
    ).toMatchObject({ status: 'conflict', code: 'CHANGED_ON_TARGET', current: 'é' });
    expect(
      planApply({
        edits: [e('fr', 'k', 'é', 'é')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0]!.status
    ).toBe('apply');
    expect(
      planApply({
        edits: [e('fr', 'k', 'x', 'é')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0]
    ).toMatchObject({ status: 'conflict', code: 'CHANGED_ON_TARGET', current: 'é' }); // current NFC, to NFD: never 'already'
  });

  it('marks an edit to a literal dotted key invalid', () => {
    // Review Focus 4
    const t = new Map<string, LocaleTarget>([
      ['en', { layout: 'flat', dict: {} }],
      ['ar', { layout: 'flat', dict: { 'a.b': 'x' } }],
    ]);
    expect(
      planApply({
        edits: [e('ar', 'a.b', 'x', 'y')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0]
    ).toMatchObject({ status: 'invalid', code: 'KEY_NOT_A_STRING' });
  });

  it('has one message per flag', () =>
    expect(FLAG_MESSAGES).toEqual({
      ...RISK_FLAG_MESSAGES,
      forced: 'Saved with “Save anyway”.',
      'new-key': 'Adds a key the source locale does not have.',
    }));
});
