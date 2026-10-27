// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  APPLY_COMMAND_MAX_CHARS,
  ReviewPanel,
  applyCommandFor,
} from '../../src/studio/features/dashboard/components/ReviewPanel.js';
import type { ReviewState } from '../../src/studio/features/dashboard/hooks/useReview.js';
import { REVIEW_STATUS_LABELS, type ReviewRow } from '../../src/studio/share/review.js';

const STUDIO_HREF = 'https://www.acme.com/livelocale/index.html';

const row = (r: Partial<ReviewRow> & Pick<ReviewRow, 'locale' | 'key' | 'to'>): ReviewRow => ({
  from: null,
  status: 'apply',
  flags: [],
  checks: [],
  id: `${r.locale}\u0000${r.key}`,
  ...r,
});

const reviewOf = (rows: ReviewRow[], extra: { by?: string; note?: string } = {}): ReviewState => ({
  token: 'lc1.abc',
  set: {
    branch: 'main',
    base: 'abc1234',
    src: 'en',
    by: extra.by ?? 'Sara',
    note: extra.note ?? '',
    edits: rows.map(({ locale, key, from, to }) => ({ locale, key, from, to })),
  },
  rows,
  sourceLocale: 'en',
  target: 'local',
});

const renderPanel = (
  review: ReviewState | null,
  props: Partial<React.ComponentProps<typeof ReviewPanel>> = {}
) =>
  render(
    <ReviewPanel
      review={review}
      error={null}
      isLoading={false}
      focusKey={null}
      onSelectLocale={() => {}}
      onClose={() => {}}
      studioHref={STUDIO_HREF}
      {...props}
    />
  );

describe('ReviewPanel', () => {
  afterEach(cleanup);

  it('shows before, after and the check result for each row', () => {
    const rows = [
      row({ locale: 'ar', key: 'home.title', from: 'مرحبا', to: 'أهلا', status: 'apply' }),
      row({
        locale: 'ar',
        key: 'home.cta',
        from: 'ابدأ',
        to: 'انطلق',
        status: 'conflict',
        current: 'سلام',
        checks: [{ level: 'warning', message: 'The text changed since it was copied.' }],
      }),
      row({
        locale: 'fr',
        key: 'home.greet',
        from: 'Bonjour {name}',
        to: 'Bonjour',
        status: 'invalid',
        message: 'Keep {name} in the text.',
        checks: [{ level: 'error', message: 'Keep {name} in the text.' }],
      }),
    ];
    const { container } = renderPanel(reviewOf(rows));
    const trs = container.querySelectorAll('tbody tr');
    expect(trs).toHaveLength(3);

    const [ready, conflict, invalid] = Array.from(trs).map((tr) => tr.textContent ?? '');
    expect(ready).toContain('مرحبا');
    expect(ready).toContain('أهلا');
    expect(ready).toContain(REVIEW_STATUS_LABELS.apply);

    expect(conflict).toContain('ابدأ');
    expect(conflict).toContain('انطلق');
    expect(conflict).toContain(REVIEW_STATUS_LABELS.conflict);
    expect(conflict).toContain('The text changed since it was copied.');
    expect(conflict).toContain('Now on the site: سلام');

    expect(invalid).toContain('Bonjour {name}');
    expect(invalid).toContain(REVIEW_STATUS_LABELS.invalid);
    expect(invalid).toContain('Keep {name} in the text.');
  });

  it('shows the apply command for the link', () => {
    renderPanel(reviewOf([row({ locale: 'ar', key: 'a', to: 'b' })]));
    expect(screen.getByTestId('review-apply-command').textContent).toContain(
      'npx livelocale apply "https://www.acme.com/livelocale/index.html#lc1.abc" --pr'
    );
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(document.body.textContent).toContain(
      'Run it in the repository. It opens a pull request with your git and gh, on any git host.'
    );
  });

  it('switches to the clipboard command for very long links', () => {
    expect(APPLY_COMMAND_MAX_CHARS).toBe(8000);
    const link = 'https://www.acme.com/livelocale/index.html#lc1.' + 'a'.repeat(8000 - 47);
    expect(link).toHaveLength(8000);
    expect(applyCommandFor(link)).toBe('npx livelocale apply --clipboard --pr');
    expect(applyCommandFor('https://x.test/#lc1.abc')).toBe(
      'npx livelocale apply "https://x.test/#lc1.abc" --pr'
    );

    const review = reviewOf([row({ locale: 'ar', key: 'a', to: 'b' })]);
    renderPanel({ ...review, token: 'lc1.' + 'a'.repeat(8000) });
    expect(screen.getByTestId('review-apply-command').textContent).toContain(
      'npx livelocale apply --clipboard --pr'
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  it('renders translator text as text', () => {
    const { container } = renderPanel(
      reviewOf([row({ locale: 'ar', key: 'a', to: '<img src=x onerror=alert(1)>' })], {
        by: '<b>Sara</b>',
        note: '<img src=x onerror=alert(1)>',
      })
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByTestId('review-note').textContent).toBe(
      'From <b>Sara</b>: <img src=x onerror=alert(1)>'
    );
  });

  it('renders plural values read-only', () => {
    const { container } = renderPanel(
      reviewOf([
        row({ locale: 'en', key: 'cart', to: '{count, plural, one {# item} other {# items}}' }),
      ])
    );
    const inputs = container.querySelectorAll<HTMLInputElement>(
      '[data-testid="plural-editor"] input'
    );
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => expect(input.disabled).toBe(true));
  });

  it('switches the page language from a row', () => {
    const onSelectLocale = vi.fn();
    renderPanel(reviewOf([row({ locale: 'ar', key: 'a', to: 'b' })]), { onSelectLocale });
    fireEvent.click(screen.getByRole('button', { name: 'ar' }));
    expect(onSelectLocale).toHaveBeenCalledWith('ar');
  });

  it('marks the focused row', () => {
    const { container } = renderPanel(
      reviewOf([
        row({ locale: 'ar', key: 'home.first', to: 'b' }),
        row({ locale: 'ar', key: 'home.second', to: 'd' }),
      ]),
      { focusKey: 'home.second' }
    );
    const current = container.querySelectorAll('tbody tr[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain('home.second');
  });

  it('shows the open error with its own title', () => {
    renderPanel(null, { error: 'This change link is damaged.' });
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('This change link cannot be opened:');
    expect(banner.textContent).toContain('This change link is damaged.');
  });
});
