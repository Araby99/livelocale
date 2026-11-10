// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, screen, fireEvent, act, cleanup } from '@testing-library/react';
import {
  isMissingValue,
  nextMissingInList,
} from '../../src/studio/features/dashboard/next-missing.js';
import { useKeySearch } from '../../src/studio/features/dashboard/hooks/useKeySearch.js';
import { KeysDirectory } from '../../src/studio/features/dashboard/components/KeysDirectory.jsx';
import { NextMissingButton } from '../../src/studio/features/dashboard/components/PhoneShell.jsx';
import { Header } from '../../src/studio/features/dashboard/components/Header.jsx';
import { TranslationEditor } from '../../src/studio/features/dashboard/components/TranslationEditor.jsx';
import { englishText } from '../../src/studio/i18n/catalogue.js';

(globalThis as any).__STUDIO_VERSION__ = 'test';

afterEach(cleanup);

describe('isMissingValue', () => {
  it('counts absent, empty and blank values as missing, the way the coverage meter does', () => {
    expect(isMissingValue(undefined)).toBe(true);
    expect(isMissingValue('')).toBe(true);
    expect(isMissingValue('   ')).toBe(true);
    expect(isMissingValue('Hola')).toBe(false);
  });
});

describe('nextMissingInList', () => {
  const values: Record<string, string> = { a: 'A', b: '', c: 'C', d: '' };
  const hasValue = (key: string) => !isMissingValue(values[key]);

  it('returns the next gap after the current key, wrapping round', () => {
    expect(nextMissingInList(['a', 'b', 'c', 'd'], null, hasValue)).toBe('b');
    expect(nextMissingInList(['a', 'b', 'c', 'd'], 'b', hasValue)).toBe('d');
    expect(nextMissingInList(['a', 'b', 'c', 'd'], 'd', hasValue)).toBe('b');
  });

  it('never offers the current key itself and returns null when nothing else is missing', () => {
    expect(nextMissingInList(['a', 'b', 'c'], 'b', hasValue)).toBeNull();
    expect(nextMissingInList(['a', 'c'], null, hasValue)).toBeNull();
  });
});

describe('useKeySearch Missing filter', () => {
  const allKeys = ['a', 'b', 'c', 'd'];
  const localeData = { a: 'A', c: ' ' };

  it('lists every text still missing in the edited language, not only those on the page', () => {
    const { result } = renderHook(() =>
      useKeySearch({ allKeys, visibleKeys: ['a', 'b'], localeData })
    );
    expect(result.current.missingCount).toBe(3);
    act(() => result.current.setFilterMissing(true));
    expect(result.current.filteredKeys).toEqual(['b', 'c', 'd']);
    expect(result.current.filterMissing).toBe(true);
    expect(result.current.filterPageOnly).toBe(false);
  });

  it('is one scope among All and On this page', () => {
    const { result } = renderHook(() =>
      useKeySearch({ allKeys, visibleKeys: ['a', 'b'], localeData })
    );
    act(() => result.current.setFilterMissing(true));
    act(() => result.current.setFilterPageOnly(true));
    expect(result.current.filterMissing).toBe(false);
    expect(result.current.filteredKeys).toEqual(['a', 'b']);
    act(() => result.current.setFilterMissing(true));
    act(() => result.current.setFilterPageOnly(false));
    expect(result.current.filterMissing).toBe(false);
    expect(result.current.filteredKeys).toEqual(allKeys);
  });
});

const keysProps = {
  filteredKeys: ['b'],
  selected: null,
  localeData: {},
  searchTerm: '',
  setSearchTerm: vi.fn(),
  filterPageOnly: false,
  setFilterPageOnly: vi.fn(),
  visibleKeys: null,
  selectKeyDirectly: vi.fn(),
};

describe('KeysDirectory Missing scope', () => {
  it('offers a Missing button with the count, pressed while it filters', () => {
    const setFilterMissing = vi.fn();
    render(
      <KeysDirectory
        {...keysProps}
        filterMissing
        setFilterMissing={setFilterMissing}
        missingCount={12}
      />
    );
    const missing = screen.getByRole('button', {
      name: englishText('keys.missing_filter', { count: 12 }),
    });
    expect(missing.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'All texts' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    fireEvent.click(missing);
    expect(setFilterMissing).toHaveBeenCalledWith(true);
  });

  it('says everything is translated when the Missing list is empty', () => {
    render(
      <KeysDirectory
        {...keysProps}
        filteredKeys={[]}
        filterMissing
        setFilterMissing={vi.fn()}
        missingCount={0}
      />
    );
    expect(screen.getByText(englishText('keys.none_missing'))).toBeTruthy();
  });
});

describe('Header coverage meter', () => {
  const headerProps = {
    coveragePercentage: 33,
    changesCount: 0,
    isChangesOpen: false,
    onToggleChanges: vi.fn(),
  };

  it('is a button that opens the Missing list when the Studio can show it', () => {
    const onShowMissing = vi.fn();
    render(<Header {...headerProps} onShowMissing={onShowMissing} />);
    // Its name holds the words it shows; what it does is its description.
    const button = screen.getByRole('button', { name: /Coverage\s*33%/ });
    expect(button.getAttribute('title')).toBe(
      englishText('header.coverage_show_missing', { percent: 33 })
    );
    fireEvent.click(button);
    expect(onShowMissing).toHaveBeenCalledTimes(1);
  });

  it('stays a plain meter without a handler', () => {
    render(<Header {...headerProps} />);
    expect(screen.queryByRole('button', { name: /Coverage/ })).toBeNull();
  });
});

describe('NextMissingButton with the whole list', () => {
  const values: Record<string, string> = { a: 'A', b: '', c: 'C', x: '' };
  const hasValue = (key: string) => !isMissingValue(values[key]);
  const label = englishText('phone.next_missing');

  it('goes to the next missing text in the list once the page has no visible gap', () => {
    const onSelectKey = vi.fn();
    render(
      <NextMissingButton
        renderedKeys={['a', 'c']}
        pageKeys={['a', 'c']}
        currentKey="a"
        hasValue={hasValue}
        onSelectKey={onSelectKey}
        listKeys={['a', 'b', 'c', 'x']}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onSelectKey).toHaveBeenCalledWith('b');
  });

  it('works before the page reports its texts', () => {
    const onSelectKey = vi.fn();
    render(
      <NextMissingButton
        renderedKeys={null}
        pageKeys={null}
        currentKey="b"
        hasValue={hasValue}
        onSelectKey={onSelectKey}
        listKeys={['a', 'b', 'c', 'x']}
      />
    );
    const button = screen.getByRole('button', { name: label }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onSelectKey).toHaveBeenCalledWith('x');
  });

  it('says every text is translated when nothing is left anywhere', () => {
    const onSelectKey = vi.fn();
    render(
      <NextMissingButton
        renderedKeys={['a']}
        pageKeys={['a']}
        currentKey="a"
        hasValue={() => true}
        onSelectKey={onSelectKey}
        listKeys={['a', 'c']}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onSelectKey).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe(englishText('phone.done_everywhere'));
  });
});

describe('TranslationEditor Next missing slot', () => {
  it('shows the given control next to Save', () => {
    render(
      <TranslationEditor
        selected={{ key: 'k', fallbackValue: 'Hello', currentValue: '' }}
        inputValue=""
        locale="ar"
        isLoading={false}
        isSuccess={false}
        error={null}
        saveWarning={null}
        onInputChange={vi.fn()}
        onSave={vi.fn()}
        onForceSave={vi.fn()}
        onDismissWarning={vi.fn()}
        onClear={vi.fn()}
        nextMissing={<button type="button">next-slot</button>}
      />
    );
    const save = document.getElementById('studio-save-button')!;
    expect(save.parentElement!.contains(screen.getByRole('button', { name: 'next-slot' }))).toBe(
      true
    );
  });
});
