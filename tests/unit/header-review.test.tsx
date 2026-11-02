// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Header } from '../../src/studio/features/dashboard/components/Header.js';

(globalThis as Record<string, unknown>).__STUDIO_VERSION__ = 'test';

const renderHeader = (extra: Partial<React.ComponentProps<typeof Header>> = {}) =>
  render(
    <Header
      coveragePercentage={50}
      changesCount={0}
      isChangesOpen={false}
      onToggleChanges={() => {}}
      unsentCount={2}
      canSend
      onSend={() => {}}
      {...extra}
    />
  );

describe('Header in Review mode', () => {
  afterEach(cleanup);

  it('shows Send and the unsent counter when no review is open', () => {
    const { container } = renderHeader();
    expect(container.querySelector('#studio-send-button')).not.toBeNull();
    expect(screen.queryByTestId('unsent-counter')).not.toBeNull();
    expect(screen.queryByTestId('review-chip')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close review' })).toBeNull();
  });

  it('shows the singular chip for one proposed change', () => {
    renderHeader({ reviewCount: 1, onCloseReview: () => {} });
    expect(screen.getByTestId('review-chip').textContent).toBe('Reviewing 1 proposed change');
  });

  it('shows the plural chip, Close review, and hides Send and the unsent counter', () => {
    const onCloseReview = vi.fn();
    const { container } = renderHeader({ reviewCount: 3, onCloseReview });
    expect(screen.getByTestId('review-chip').textContent).toBe('Reviewing 3 proposed changes');
    expect(container.querySelector('#studio-send-button')).toBeNull();
    expect(screen.queryByTestId('unsent-counter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close review' }));
    expect(onCloseReview).toHaveBeenCalledTimes(1);
  });

  it('stays in Review while a change link opens or after it fails to open', () => {
    const { container } = renderHeader({ isReviewing: true, onCloseReview: () => {} });
    expect(container.querySelector('#studio-send-button')).toBeNull();
    expect(screen.queryByTestId('unsent-counter')).toBeNull();
    expect(screen.queryByTestId('review-chip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close review' })).toBeTruthy();
  });

  it('says Viewing instead of Editing during a review', () => {
    const targetLocale = { locale: 'ar', source: 'url' as const, mismatch: null };
    renderHeader({ targetLocale, reviewCount: 1, onCloseReview: () => {} });
    expect(screen.getByTestId('target-locale').textContent).toContain('Viewing: ar');
    expect(screen.getByTestId('target-locale').textContent).not.toContain('Editing');
    cleanup();
    renderHeader({ targetLocale });
    expect(screen.getByTestId('target-locale').textContent).toContain('Editing: ar');
  });

  it('shows the patch mark and the lower-case wordmark', () => {
    renderHeader({});
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('livelocale');
    expect(screen.getByTestId('brand-mark')).toBeTruthy();
  });
});
