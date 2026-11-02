// @vitest-environment jsdom
import React from 'react';
import { it, expect, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { KeysDirectory } from '../../src/studio/features/dashboard/components/KeysDirectory.jsx';
import { LocalePicker } from '../../src/studio/features/dashboard/components/LocalePicker.jsx';
import type { SelectedElement } from '../../src/studio/features/dashboard/types/index.js';
import { textFor } from '../../src/studio/i18n/catalogue.js';

afterEach(cleanup);

const renderKeys = ({ selected }: { selected: SelectedElement | null }) =>
  render(
    <KeysDirectory
      filteredKeys={['home.title', 'home.body']}
      selected={selected}
      localeData={{ 'home.title': 'Hi' }}
      searchTerm=""
      setSearchTerm={() => {}}
      filterPageOnly={false}
      setFilterPageOnly={() => {}}
      visibleKeys={null}
      selectKeyDirectly={() => {}}
    />
  );

it('shows keys in Hunk mono', () => {
  renderKeys({ selected: null });
  const key = screen.getByText('home.title');
  expect(key.className.split(/\s+/)).toEqual(expect.arrayContaining(['font-mono', 'text-info-fg']));
});

it('marks the selected key row as Wash with an inset Patch bar at the start edge', () => {
  renderKeys({ selected: { key: 'home.title' } as SelectedElement });
  const row = screen.getByText('home.title').closest('button')!;
  expect(row.getAttribute('aria-current')).toBe('true');
  expect(row.className).toContain('bg-accent-soft');
  const bar = within(row).getByTestId('key-row-bar');
  expect(bar.getAttribute('aria-hidden')).toBe('true');
  expect(bar.className.split(/\s+/)).toEqual(expect.arrayContaining(['bg-accent-fg', 'start-0']));
  expect(within(row).getByText('Hi').className).toContain('text-fg');
  expect(within(row).getByText('Hi').className).not.toContain('text-fg-muted');
  const other = screen.getByText('home.body').closest('button')!;
  expect(within(other).queryByTestId('key-row-bar')).toBeNull();
  expect(other.getAttribute('aria-current')).toBeNull();
});

it('outlines a missing translation with a dashed red line, never a red fill', () => {
  renderKeys({ selected: null });
  const badge = screen.getByText(textFor('en')('keys.missing'));
  expect(badge.className.split(/\s+/)).toEqual(
    expect.arrayContaining([
      'border-dashed',
      'border-[1.5px]',
      'border-danger-line',
      'text-danger-fg',
    ])
  );
  expect(badge.className).not.toContain('bg-danger-bg');
});

it('lists locale candidates in Hunk, with nothing amber before a choice', () => {
  render(<LocalePicker candidates={['ar', 'fr']} onChoose={() => {}} onCancel={() => {}} />);
  const ar = screen.getByRole('button', { name: 'ar' });
  expect(ar.className.split(/\s+/)).toEqual(expect.arrayContaining(['text-info-fg', 'bg-raised']));
  expect(ar.className).not.toMatch(/accent/);
});
