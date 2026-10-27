// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { valuesToReapply } from '../../src/studio/features/dashboard/hooks/reapply.js';
import type { HistoryEntry } from '../../src/studio/features/dashboard/hooks/useHistory.js';
import type { Draft } from '../../src/studio/transport/drafts.js';

const entry = (nextValue: string, at: number, locale = 'ar'): HistoryEntry => ({
  id: String(at),
  locale,
  key: 'home.title',
  previousValue: 'old',
  nextValue,
  at,
});

const draft = (overrides: Partial<Draft>): Draft => ({
  scope: 'acme/site',
  locale: 'ar',
  key: 'home.title',
  from: 'مرحبا',
  to: 'B',
  force: false,
  base: null,
  branch: null,
  status: 'unsent',
  conflict: false,
  updatedAt: 1,
  sentAt: null,
  ...overrides,
});

// History is newest first, as useHistory keeps it.
const history = [entry('B', 2), entry('A', 1)];

describe('valuesToReapply', () => {
  it('preview re-applies session history, newest wins', () => {
    expect(
      valuesToReapply({ mode: 'preview', locale: 'ar', localeConfirmed: true, history, drafts: [] })
    ).toEqual(new Map([['home.title', 'B']]));
  });

  it('static re-applies persisted drafts for the locale and ignores history', () => {
    const drafts = [draft({ to: 'B' }), draft({ locale: 'en', to: 'C', status: 'sent' })];
    expect(
      valuesToReapply({
        mode: 'static',
        locale: 'ar',
        localeConfirmed: true,
        history: [entry('Z', 3)],
        drafts,
      })
    ).toEqual(new Map([['home.title', 'B']]));
  });

  it('static re-applies nothing until the locale is confirmed', () => {
    const result = valuesToReapply({
      mode: 'static',
      locale: 'ar',
      localeConfirmed: false,
      history,
      drafts: [draft({ to: 'B' })],
    });
    expect(result.size).toBe(0);
  });

  it('development re-applies nothing', () => {
    const result = valuesToReapply({
      mode: 'development',
      locale: 'ar',
      localeConfirmed: true,
      history,
      drafts: [draft({ to: 'B' })],
    });
    expect(result.size).toBe(0);
  });
});
