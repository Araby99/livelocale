import React, { useMemo } from 'react';
import {
  parsePluralMessage,
  buildPluralMessage,
  pluralCategoriesFor,
  type PluralBranch,
} from '../../../../core/icu-plural.js';

interface PluralEditorProps {
  /** Active locale; decides which CLDR categories are required. */
  locale: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const CATEGORY_HINTS: Record<string, string> = {
  zero: 'zero (e.g. 0)',
  one: 'one (singular)',
  two: 'two (dual)',
  few: 'few (small numbers)',
  many: 'many (large numbers)',
  other: 'other (default, required)',
};

/**
 * Edits an ICU plural / select / selectordinal message one branch at a time.
 * The fields are the union of the locale's CLDR categories and the selectors
 * already present (explicit `=0`, select cases). Renders nothing when the
 * message is not a single plural-like argument, so callers fall back to raw text.
 */
export const PluralEditor = ({ locale, value, onChange, disabled }: PluralEditorProps) => {
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

  const inputClass =
    'w-full bg-slate-950 border border-slate-800 hover:border-slate-750 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500/50 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 transition duration-150 disabled:opacity-60';

  return (
    <div className="space-y-3" data-testid="plural-editor">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 font-mono">
          {parsed.type} on <span className="text-indigo-400">{parsed.variable}</span>
          {parsed.offset ? ` · offset ${parsed.offset}` : ''}
        </span>
        <span className="text-[10px] text-slate-600">
          <code className="font-mono">#</code> = the number
        </span>
      </div>

      {parsed.prefix !== '' && (
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Before
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

      <div className="space-y-2">
        {fields.map((f) => (
          <label key={f.selector} className="block space-y-1">
            <span className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-slate-300">{f.selector}</span>
              <span className="text-slate-600">
                {CATEGORY_HINTS[f.selector] ?? 'explicit case'}
              </span>
              {f.required && f.text === '' && f.selector !== 'other' && (
                <span className="text-amber-400">needed for {locale}</span>
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
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            After
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
