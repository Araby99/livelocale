import React, { useMemo } from 'react';
import {
  parsePluralMessage,
  buildPluralMessage,
  pluralCategoriesFor,
  type PluralBranch,
} from '../../../../core/icu-plural.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import type { StringKey } from '../../../i18n/catalogue.js';

interface PluralEditorProps {
  /** Active locale; decides which CLDR categories are required. */
  locale: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * `sheet` is the phone's editor sheet: tighter spacing and 16px text, so a phone does not
   * zoom in when a field takes focus.
   */
  variant?: 'panel' | 'sheet';
}

const CATEGORY_HINTS: Readonly<Record<string, StringKey>> = {
  zero: 'plural.desc_zero',
  one: 'plural.desc_one',
  two: 'plural.desc_two',
  few: 'plural.desc_few',
  many: 'plural.desc_many',
  other: 'plural.desc_other',
};

/**
 * Edits an ICU plural / select / selectordinal message one branch at a time.
 * The fields are the union of the locale's CLDR categories and the selectors
 * already present (explicit `=0`, select cases). Renders nothing when the
 * message is not a single plural-like argument, so callers fall back to raw text.
 */
export const PluralEditor = ({
  locale,
  value,
  onChange,
  disabled,
  variant = 'panel',
}: PluralEditorProps) => {
  const { t } = useStudioText();
  const parsed = useMemo(() => parsePluralMessage(value), [value]);

  const fields = useMemo(() => {
    if (!parsed) return [];
    const existing = new Map(parsed.branches.map((b) => [b.selector, b.text]));
    const required = pluralCategoriesFor(locale, parsed.type);
    const explicit = parsed.branches.map((b) => b.selector).filter((s) => !required.includes(s));
    // Explicit selectors (=0, select cases) first, then CLDR categories in canonical order.
    const selectors = [...explicit, ...required];
    return selectors.map((selector) => ({
      selector,
      text: existing.get(selector) ?? '',
      required: required.includes(selector),
    }));
  }, [parsed, locale]);

  if (!parsed) return null;

  const emit = (patch: Partial<typeof parsed>, branches?: PluralBranch[]) => {
    onChange(buildPluralMessage({ ...parsed, ...patch, branches: branches ?? parsed.branches }));
  };

  const setBranch = (selector: string, text: string) => {
    const next: PluralBranch[] = fields.map((f) => ({
      selector: f.selector,
      text: f.selector === selector ? text : f.text,
    }));
    emit({}, next);
  };

  const inSheet = variant === 'sheet';
  const inputClass = `w-full bg-surface border border-line hover:border-line-strong rounded-lg px-3 text-fg placeholder-fg-muted transition duration-150 disabled:opacity-60 ${
    inSheet ? 'py-1.5 text-base' : 'py-2 text-xs'
  }`;

  return (
    <div className={inSheet ? 'space-y-2' : 'space-y-3'} data-testid="plural-editor">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-fg-muted font-mono">
          <span dir="ltr">{parsed.type}</span> {t('plural.on')}{' '}
          <span dir="ltr" className="text-fg">
            {parsed.variable}
          </span>
          {parsed.offset ? ` ${t('plural.offset', { offset: parsed.offset })}` : ''}
        </span>
        <span className="text-[10px] text-fg-muted">
          <code className="font-mono">#</code> {t('plural.hash')}
        </span>
      </div>

      {parsed.prefix !== '' && (
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
            {t('plural.before')}
          </span>
          <input
            data-testid="plural-prefix"
            dir="auto"
            value={parsed.prefix}
            disabled={disabled}
            onChange={(e) => emit({ prefix: e.target.value })}
            className={inputClass}
          />
        </label>
      )}

      <div className={inSheet ? 'space-y-1.5' : 'space-y-2'}>
        {fields.map((f) => (
          <label key={f.selector} className="block space-y-1">
            <span className="flex items-center gap-2 text-[10px] font-mono">
              <span dir="ltr" className="text-fg">
                {f.selector}
              </span>
              <span className="text-fg-muted">
                {t(CATEGORY_HINTS[f.selector] ?? 'plural.desc_explicit')}
              </span>
              {f.required && f.text === '' && f.selector !== 'other' && (
                <span className="glyph-warn text-warning-fg">{t('plural.needed', { locale })}</span>
              )}
            </span>
            <input
              data-testid={`plural-branch-${f.selector}`}
              dir="auto"
              value={f.text}
              disabled={disabled}
              onChange={(e) => setBranch(f.selector, e.target.value)}
              className={inputClass}
            />
          </label>
        ))}
      </div>

      {parsed.suffix !== '' && (
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
            {t('plural.after')}
          </span>
          <input
            data-testid="plural-suffix"
            dir="auto"
            value={parsed.suffix}
            disabled={disabled}
            onChange={(e) => emit({ suffix: e.target.value })}
            className={inputClass}
          />
        </label>
      )}
    </div>
  );
};
