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

const reviewOf = (
  rows: ReviewRow[],
  extra: { by?: string; note?: string; repo?: string; target?: ReviewState['target'] } = {}
): ReviewState => ({
  token: 'lc1.abc',
  set: {
    ...(extra.repo === undefined ? {} : { repo: extra.repo }),
    branch: 'main',
    base: 'abc1234',
    src: 'en',
    by: extra.by ?? 'Sara',
    note: extra.note ?? '',
    edits: rows.map(({ locale, key, from, to }) => ({ locale, key, from, to })),
  },
  rows,
  sourceLocale: 'en',
  target: extra.target ?? 'local',
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
      repo={null}
      repoFromManifest={false}
      onRepoChange={() => {}}
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

  describe('Apply to local files', () => {
    const FORCED_REASON = 'Saved with “Save anyway”; tick the box to include it.';
    const rows = [
      row({ locale: 'en', key: 'home.a', from: 'A', to: 'A1', status: 'apply' }),
      row({ locale: 'en', key: 'home.b', from: 'B', to: 'B1', status: 'apply' }),
      row({ locale: 'en', key: 'home.c', from: 'C {n}', to: 'C', status: 'needs-force' }),
      row({ locale: 'en', key: 'home.d', from: 'D', to: 'D1', status: 'conflict', current: 'X' }),
    ];
    const applyButton = (container: HTMLElement) =>
      container.querySelector<HTMLButtonElement>('#studio-apply-local')!;

    it('counts ready rows and adds forced rows when the box is ticked', () => {
      const onApplyLocal = vi.fn();
      const { container } = renderPanel(reviewOf(rows), { onApplyLocal });
      expect(applyButton(container).textContent).toBe('Apply 2 changes to local files');
      const box = screen.getByLabelText<HTMLInputElement>(
        'Include 1 change saved with “Save anyway”'
      );
      expect(box.checked).toBe(false);
      fireEvent.click(applyButton(container));
      expect(onApplyLocal).toHaveBeenLastCalledWith({ includeForced: false });

      fireEvent.click(box);
      expect(applyButton(container).textContent).toBe('Apply 3 changes to local files');
      fireEvent.click(applyButton(container));
      expect(onApplyLocal).toHaveBeenLastCalledWith({ includeForced: true });
    });

    it('hides the forced box when no row needs it', () => {
      renderPanel(reviewOf(rows.slice(0, 2)), { onApplyLocal: vi.fn() });
      expect(document.body.textContent).not.toContain('Save anyway');
    });

    it('shows no local apply for a GitHub review', () => {
      const { container } = renderPanel(reviewOf(rows, { target: 'github' }), {
        onApplyLocal: vi.fn(),
      });
      expect(container.querySelector('#studio-apply-local')).toBeNull();
    });

    it('shows each row’s result after applying', () => {
      const { container } = renderPanel(reviewOf(rows), {
        onApplyLocal: vi.fn(),
        applyResults: {
          [rows[0]!.id]: { state: 'applied' },
          [rows[1]!.id]: { state: 'failed', message: 'Disk full.' },
          [rows[2]!.id]: { state: 'skipped', reason: FORCED_REASON },
          [rows[3]!.id]: { state: 'skipped', reason: 'Changed since' },
        },
      });
      const results = Array.from(container.querySelectorAll('[data-testid="apply-result"]')).map(
        (el) => el.textContent
      );
      expect(results).toEqual([
        'Applied',
        'Failed: Disk full.',
        `Skipped: ${FORCED_REASON}`,
        'Skipped: Changed since',
      ]);
    });
  });

  describe('Create pull request', () => {
    const githubReview = (repo?: string) =>
      reviewOf([row({ locale: 'ar', key: 'a', to: 'b' })], { target: 'github', repo });
    const repoInput = () => screen.getByPlaceholderText<HTMLInputElement>('owner/repo');
    const githubLinks = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('a')).filter((a) =>
        a.href.startsWith('https://github.com/')
      );

    it('asks for the repository once and remembers it', () => {
      const onRepoChange = vi.fn();
      const { rerender } = renderPanel(githubReview(), { onRepoChange });
      expect(document.body.textContent).toContain(
        'Which GitHub repository should get the pull request?'
      );
      fireEvent.change(repoInput(), { target: { value: 'https://github.com/acme/web' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onRepoChange).toHaveBeenCalledTimes(1);
      expect(onRepoChange).toHaveBeenCalledWith('acme/web');

      rerender(
        <ReviewPanel
          review={githubReview()}
          error={null}
          isLoading={false}
          focusKey={null}
          onSelectLocale={() => {}}
          onClose={() => {}}
          studioHref={STUDIO_HREF}
          repo="acme/web"
          repoFromManifest={false}
          onRepoChange={onRepoChange}
        />
      );
      expect(screen.queryByPlaceholderText('owner/repo')).toBeNull();
      expect(screen.getByRole('link', { name: 'Create pull request' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
    });

    it('rejects a malformed repository', () => {
      const onRepoChange = vi.fn();
      renderPanel(githubReview(), { onRepoChange });
      fireEvent.change(repoInput(), { target: { value: 'acme' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onRepoChange).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain(
        'Enter it as owner/repo, for example acme/website.'
      );
    });

    it('prefills but does not trust the repo inside the link', () => {
      const onRepoChange = vi.fn();
      const { container } = renderPanel(githubReview('evil/x'), { onRepoChange });
      expect(repoInput().value).toBe('evil/x');
      expect(githubLinks(container)).toHaveLength(0);
      expect(onRepoChange).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onRepoChange).toHaveBeenCalledWith('evil/x');
    });

    it('links Create pull request to the pre-filled issue', () => {
      renderPanel(githubReview(), { repo: 'acme/web', repoFromManifest: true });
      const anchor = screen.getByRole('link', { name: 'Create pull request' }) as HTMLAnchorElement;
      expect(new URL(anchor.href).pathname).toBe('/acme/web/issues/new');
      expect(document.body.textContent).toContain(
        'Then press Submit on GitHub. The pull request opens in about a minute.'
      );
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    });

    it('offers Run workflow when issues are off', () => {
      renderPanel(githubReview(), { repo: 'acme/web' });
      expect(document.body.textContent).toContain(
        'Issues turned off? Actions → LiveLocale → Run workflow, then paste the link.'
      );
    });
  });
});
