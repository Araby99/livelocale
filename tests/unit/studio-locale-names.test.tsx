// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { englishText } from '../../src/studio/i18n/catalogue.js';
import {
  getLocaleLabel,
  getLocaleName,
  getLocaleNameBeside,
} from '../../src/studio/features/dashboard/locale-names.js';
import { TranslationEditor } from '../../src/studio/features/dashboard/components/TranslationEditor.jsx';

afterEach(cleanup);

const t = englishText;

describe('locale names', () => {
  it('names a language the Studio does not list from the browser', () => {
    expect(getLocaleName('nl', t)).toBe('Dutch');
    expect(getLocaleName('ko', t)).toBe('Korean');
    expect(getLocaleName('he', t)).toBe('Hebrew');
    expect(getLocaleLabel('pl', t)).toBe('Polish (pl)');
  });

  it('keeps the Studio name for a listed language and its regions', () => {
    expect(getLocaleName('ar-EG', t)).toBe('Arabic');
    expect(getLocaleName('en', t)).toBe('English');
  });

  it('says Custom only for a code no one can name', () => {
    expect(getLocaleName('x-pirate', t)).toBe(t('editor.lang_custom'));
    expect(getLocaleName('', t)).toBe(t('editor.lang_custom'));
  });

  it('adds the code when the other language shares the name', () => {
    expect(getLocaleNameBeside('en-GB', 'en', t)).toBe('English (en-GB)');
    expect(getLocaleNameBeside('en', 'en-GB', t)).toBe('English (en)');
    expect(getLocaleNameBeside('ar', 'en', t)).toBe('Arabic');
  });
});

const editor = (locale: string, referenceLocale: string) => (
  <TranslationEditor
    selected={{ key: 'home.title', fallbackValue: 'Welcome', currentValue: '' }}
    inputValue=""
    locale={locale}
    referenceLocale={referenceLocale}
    isLoading={false}
    isSuccess={false}
    error={null}
    saveWarning={null}
    onInputChange={vi.fn()}
    onSave={vi.fn()}
    onForceSave={vi.fn()}
    onDismissWarning={vi.fn()}
    onClear={vi.fn()}
  />
);

describe('the editor labels', () => {
  it('names an unlisted language instead of Custom', () => {
    render(editor('ko', 'nl'));
    expect(screen.getByText('Dutch')).toBeTruthy();
    expect(screen.getByText('Korean')).toBeTruthy();
    expect(screen.queryByText(t('editor.lang_custom'))).toBeNull();
  });

  it('tells British English apart from English', () => {
    render(editor('en-GB', 'en'));
    expect(screen.getByText('English (en)')).toBeTruthy();
    expect(screen.getByText('English (en-GB)')).toBeTruthy();
  });
});
