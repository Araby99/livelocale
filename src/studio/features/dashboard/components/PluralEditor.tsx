import React, { useMemo } from 'react';
import {
  parsePluralMessage,
  buildPluralMessage,
  pluralCategoriesFor,
  type PluralBranch,
} from '../../../../core/icu-plural.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
import type { StringKey } from '../../../i18n/catalogue.js';
import { pluralExamples } from '../plural-examples.js';

interface PluralEditorProps {
  /** Active locale; decides which CLDR categories are required. */
  locale: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Selectors to offer besides the locale's categories, such as the source text's `=0` or
   * `select` cases, so a translation can fill them even while they are still empty.
   */
  selectors?: readonly string[];
  /**
   * Whether the source text has words before or after the argument. Their fields then show
   * even while the translation's own are still empty, so they can be filled in.
   */
  surround?: PluralSurround;
  /**
   * `sheet` is the phone's editor sheet: tighter spacing and 16px text, so a phone does not
   * zoom in when a field takes focus.
   */
  variant?: 'panel' | 'sheet';
}

/** Whether a plural message has words before and after its argument. */
export interface PluralSurround {
  before: boolean;
  after: boolean;
}

/** The empty start of a translation for a plural source text. */
export interface PluralScaffold {
  value: string;
  selectors: string[];
  /** Where the source has words around the argument, so the editor offers those fields. */
  surround: PluralSurround;
}

/**
 * The source text's plural with every form and the words around it emptied, or null when the
 * source is not a single plural-like message. A missing translation starts from it, so the
 * translator fills the edited language's forms instead of typing ICU syntax, and no source
 * words are saved into the translation unnoticed. The source stays in view above the editor.
 */
export function pluralScaffold(reference: string): PluralScaffold | null {
  const parsed = parsePluralMessage(reference);
  if (!parsed) return null;
  return {
    value: buildPluralMessage({
      ...parsed,
      prefix: '',
      suffix: '',
      branches: parsed.branches.map((b) => ({ selector: b.selector, text: '' })),
    }),
    selectors: parsed.branches.map((b) => b.selector),
    surround: { before: parsed.prefix !== '', after: parsed.suffix !== '' },
  };
}

/** Hints for a selector with no example numbers: a `select` case, or a locale the browser cannot read. */
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
  selectors: offered = [],
  surround,
  variant = 'panel',
}: PluralEditorProps) => {
  const { t } = useStudioText();
  const parsed = useMemo(() => parsePluralMessage(value), [value]);

  const fields = useMemo(() => {
    if (!parsed) return [];
    const existing = new Map(parsed.branches.map((b) => [b.selector, b.text]));
    const required = pluralCategoriesFor(locale, parsed.type);
    const explicit = [...new Set([...parsed.branches.map((b) => b.selector), ...offered])].filter(
      (s) => !required.includes(s)
    );
    // Explicit selectors (=0, select cases) first, then CLDR categories in canonical order.
    const selectors = [...explicit, ...required];
    return selectors.map((selector) => ({
      selector,
      text: existing.get(selector) ?? '',
      required: required.includes(selector),
    }));
  }, [parsed, locale, offered.join('|')]);

  // The numbers each form is for in the edited language (Arabic `few` is 3–10, 103–110, …),
  // which says more to a translator than the category name.
  const examples = useMemo(
    () => (parsed ? pluralExamples(locale, parsed.type) : {}),
    [parsed?.type, locale]
  );

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
  const inputClass = `w-full bg-surface border border-line-strong rounded-lg px-3 text-fg placeholder-fg-muted transition duration-150 disabled:opacity-60 ${
    inSheet ? 'py-1.5 text-base' : 'py-2 text-sm'
  }`;

  return (
    <div className={inSheet ? 'space-y-2' : 'space-y-3'} data-testid="plural-editor">
      <div className="flex items-center justify-between">
        <span className="text-xs text-fg-muted font-mono">
          <span dir="ltr">{parsed.type}</span> {t('plural.on')}{' '}
          <span dir="ltr" className="text-fg">
            {parsed.variable}
          </span>
          {parsed.offset ? ` ${t('plural.offset', { offset: parsed.offset })}` : ''}
        </span>
        <span className="text-xs text-fg-muted">
          <code className="font-mono">#</code> {t('plural.hash')}
        </span>
      </div>

      {(parsed.prefix !== '' || surround?.before) && (
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
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
            <span className="flex flex-wrap items-center gap-x-2 text-xs font-mono">
              <span dir="ltr" className="text-fg">
                {f.selector}
              </span>
              <span
                data-testid={`plural-hint-${f.selector}`}
                dir="ltr"
                className="text-fg-muted font-sans"
              >
                {examples[f.selector] !== undefined
                  ? t('plural.examples', { numbers: examples[f.selector]! })
                  : t(CATEGORY_HINTS[f.selector] ?? 'plural.desc_explicit')}
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

      {(parsed.suffix !== '' || surround?.after) && (
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
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
