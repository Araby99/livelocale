// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { fencedChangeBlock } from '../../src/core/change-link.js';
import { copyText } from '../../src/studio/share/browser.js';
import { GitHubIssueAction } from '../../src/studio/features/dashboard/components/GitHubIssueAction.jsx';
import { StudioLanguageProvider } from '../../src/studio/i18n/StudioLanguage.jsx';
import { textFor } from '../../src/studio/i18n/catalogue.js';

vi.mock('../../src/studio/share/browser.js', () => ({
  copyText: vi.fn(async () => true),
}));

const copy = vi.mocked(copyText);
const LONG_TOKEN = 'lc1.' + 'A'.repeat(9000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GitHubIssueAction', () => {
  it('links straight to GitHub when the block fits', () => {
    const onOpened = vi.fn();
    render(
      <GitHubIssueAction
        repo="acme/web"
        token="lc1.abc"
        count={1}
        label="Open a GitHub issue"
        onOpened={onOpened}
      />
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    const link = screen.getByRole('link', { name: 'Open a GitHub issue' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('href')).toMatch(/^https:\/\/github\.com\/acme\/web\/issues\/new\?/);
    fireEvent.click(link);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Copy change block' })).toBeNull();
  });

  it('copies first, then shows the link, when the URL is too long', async () => {
    copy.mockResolvedValueOnce(true);
    render(<GitHubIssueAction repo="acme/web" token={LONG_TOKEN} count={1} label="Open" />);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy change block' }));
    const link = await screen.findByRole('link', { name: 'Open GitHub and paste' });
    expect(copy).toHaveBeenCalledWith(fencedChangeBlock(LONG_TOKEN));
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.queryByTestId('manual-copy')).toBeNull();
  });

  it('shows the block for manual copy when copying fails', async () => {
    copy.mockResolvedValueOnce(false);
    render(<GitHubIssueAction repo="acme/web" token={LONG_TOKEN} count={1} label="Open" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy change block' }));
    const textarea = (await screen.findByTestId('manual-copy')) as HTMLTextAreaElement;
    expect(textarea.value).toBe(fencedChangeBlock(LONG_TOKEN));
    expect(textarea.readOnly).toBe(true);
    expect(screen.getByRole('link', { name: 'Open GitHub and paste' })).toBeTruthy();
  });

  it('labels the action in Arabic but files an English issue title', async () => {
    const ar = textFor('ar');
    copy.mockResolvedValueOnce(true);
    render(
      <StudioLanguageProvider initial="ar">
        <GitHubIssueAction repo="acme/web" token={LONG_TOKEN} count={2} label="فتح" />
      </StudioLanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: ar('issue.copy_block') }));
    const link = await screen.findByRole('link', { name: ar('issue.open_and_paste') });
    const openedUrl = link.getAttribute('href')!;
    expect(new URL(openedUrl).searchParams.get('title')).toBe('LiveLocale: 2 translation changes');
  });

  it('says in Arabic when the block is too large, keeping the command English', () => {
    render(
      <StudioLanguageProvider initial="ar">
        <GitHubIssueAction
          repo="acme/web"
          token={'lc1.' + 'A'.repeat(70_000)}
          count={1}
          label="فتح"
        />
      </StudioLanguageProvider>
    );
    const text = textFor('ar')('issue.too_large', { command: 'npx livelocale apply' });
    expect(text).toContain('\u2068npx livelocale apply\u2069');
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('says when the block is too large for an issue', () => {
    render(
      <GitHubIssueAction
        repo="acme/web"
        token={'lc1.' + 'A'.repeat(70_000)}
        count={1}
        label="Open"
      />
    );
    expect(
      screen.getByText(
        'Too large for a GitHub issue. Run npx livelocale apply with this link instead.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
