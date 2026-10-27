// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LocalePicker } from '../../src/studio/features/dashboard/components/LocalePicker.jsx';

vi.stubGlobal('__STUDIO_VERSION__', '0.0.0-test');

let Header: typeof import('../../src/studio/features/dashboard/components/Header.jsx').Header;

beforeAll(async () => {
  ({ Header } = await import('../../src/studio/features/dashboard/components/Header.jsx'));
});

afterEach(() => {
  cleanup();
});

const headerProps = {
  coveragePercentage: 50,
  changesCount: 0,
  isChangesOpen: false,
  onToggleChanges: () => {},
};

describe('LocalePicker', () => {
  it('offers each candidate and reports the choice', () => {
    const onChoose = vi.fn();
    const onCancel = vi.fn();
    const { container, rerender } = render(
      <LocalePicker candidates={['ar', 'en']} onChoose={onChoose} onCancel={onCancel} />
    );
    expect(screen.getByText('Which language are you editing?')).toBeTruthy();
    expect(
      screen.getByText(
        'LiveLocale could not tell from the page. Your fix will be saved to the language you pick.'
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ar' }));
    expect(onChoose).toHaveBeenCalledWith('ar');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<LocalePicker candidates={null} onChoose={onChoose} onCancel={onCancel} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('Header target language', () => {
  it('always shows the target language in the header', () => {
    const { rerender } = render(
      <Header
        {...headerProps}
        targetLocale={{ locale: 'ar', source: 'content', mismatch: null }}
        locales={['ar', 'en']}
        onChooseLocale={() => {}}
      />
    );
    expect(screen.getByText('Editing: ar')).toBeTruthy();
    expect(screen.getByText('detected from page text')).toBeTruthy();

    rerender(
      <Header
        {...headerProps}
        targetLocale={{ locale: 'en', source: null, mismatch: null }}
        locales={['ar', 'en']}
        onChooseLocale={() => {}}
      />
    );
    expect(screen.getByText('Language: not chosen yet')).toBeTruthy();
    expect(screen.queryByText(/Editing:/)).toBeNull();
  });

  it('offers to switch on a mismatch', () => {
    const onChooseLocale = vi.fn();
    render(
      <Header
        {...headerProps}
        targetLocale={{ locale: 'en', source: 'manual', mismatch: 'ar' }}
        locales={['ar', 'en']}
        onChooseLocale={onChooseLocale}
      />
    );
    expect(screen.getByText('This text looks like ar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to ar' }));
    expect(onChooseLocale).toHaveBeenCalledWith('ar');
  });
});
